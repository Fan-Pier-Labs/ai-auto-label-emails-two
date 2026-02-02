/**
 * Optimized processor utilities for batch email processing.
 * 
 * Key optimizations:
 * 1. Session-based initialization (Gmail, Gemini, rules loaded once per customer)
 * 2. Domain lookup caching (MX, TXT, WHOIS, HTTP status)
 * 3. Parallel AI rule matching
 * 4. Shared rule fetching (single HTTP request for both AI and deterministic rules)
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { promises as dns } from 'dns';
import { lookup as whoisLookup } from 'whois';
import { createConnection } from 'net';
import { withRetry } from './retry';
import { initializeGmail } from './gmail';
import { initializeGemini } from './gemini';
import { fetchRulesFromSheet, fetchDeterministicRulesConfig, extractSpreadsheetId } from './sheets';
import { applyDeterministicLabels as applyDeterministicLabelsLib } from './deterministic';
import { analytics } from './analytics';
import type { Email, LabelRule, RuleResult, DeterministicRuleConfig } from './types';

// ============================================================================
// Types
// ============================================================================

export interface SessionConfig {
  gmail: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  geminiApiKey: string;
  googleSheetsUrl?: string;
  processedLabel?: string;
  dryRun?: boolean;
}

interface CachedMXResult {
  records: string[] | null;
  provider: 'gmail' | 'msft' | 'automation' | 'work-email' | 'other' | null;
}

interface CachedDomainStatus {
  isDown: boolean;
  redirectsToDifferentDomain: boolean | null;
  redirectTargetDomain: string | null;
}

interface CachedTXTResult {
  hasTXT: boolean;
  hasSPF: boolean;
  hasDMARC: boolean;
  hasDKIM: boolean;
}

interface CachedWHOISResult {
  isNewDomain: boolean;
  registrationDate: Date | null;
}

// ============================================================================
// Processing Session - Handles caching and initialization
// ============================================================================

export class ProcessingSession {
  private oauth2Client: OAuth2Client | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private aiRules: LabelRule[] = [];
  private deterministicRuleConfigs: DeterministicRuleConfig[] = [];
  private rulesLoaded = false;

  // Domain caches
  private mxCache = new Map<string, CachedMXResult>();
  private domainStatusCache = new Map<string, CachedDomainStatus>();
  private txtCache = new Map<string, CachedTXTResult>();
  private whoisCache = new Map<string, CachedWHOISResult>();
  private domainResolvesCache = new Map<string, boolean>();

  private config: SessionConfig;

  constructor(config: SessionConfig) {
    this.config = config;
  }

  /**
   * Initialize the session (Gmail, Gemini, and optionally load rules)
   */
  async initialize(): Promise<void> {
    // Initialize Gmail OAuth client
    this.oauth2Client = new google.auth.OAuth2(
      this.config.gmail.clientId,
      this.config.gmail.clientSecret,
      'http://localhost:8080'
    );
    this.oauth2Client.setCredentials({
      refresh_token: this.config.gmail.refreshToken,
    });

    // Validate token
    try {
      await this.oauth2Client.getAccessToken();
      console.log('[Session] Gmail OAuth client initialized');
    } catch (error: any) {
      if (error.message?.includes('invalid_grant')) {
        throw new Error('Invalid Gmail refresh token - needs re-authentication');
      }
      throw error;
    }

    // Set global Gmail client so deterministic rules (hasReceivedFromDomain, etc.) can use it
    await initializeGmail(this.config.gmail);

    // Initialize Gemini client
    if (!this.config.geminiApiKey) {
      throw new Error('Gemini API key is required');
    }
    this.geminiClient = new GoogleGenerativeAI(this.config.geminiApiKey);
    await initializeGemini(this.config.geminiApiKey);
    console.log('[Session] Gemini client initialized');

    // Load rules from Google Sheets (once)
    if (this.config.googleSheetsUrl) {
      await this.loadRules();
    }
  }

  /**
   * Load AI and deterministic rules from Google Sheets (called once per session)
   */
  private async loadRules(): Promise<void> {
    if (this.rulesLoaded || !this.config.googleSheetsUrl) return;

    try {
      const spreadsheetId = extractSpreadsheetId(this.config.googleSheetsUrl);

      // Load both rule types in parallel
      const [aiRules, detRulesConfig] = await Promise.all([
        fetchRulesFromSheet(spreadsheetId),
        fetchDeterministicRulesConfig(spreadsheetId),
      ]);

      this.aiRules = aiRules;
      this.deterministicRuleConfigs = detRulesConfig;
      console.log(`[Session] Loaded ${this.aiRules.length} AI rules`);
      const enabledCount = detRulesConfig.filter(r => r.enabled).length;
      console.log(`[Session] Loaded ${detRulesConfig.length} deterministic rules (${enabledCount} enabled)`);

      this.rulesLoaded = true;
    } catch (error) {
      console.error('[Session] Failed to load rules:', error);
    }
  }

  // ==========================================================================
  // Gmail Operations
  // ==========================================================================

  private getGmail() {
    if (!this.oauth2Client) throw new Error('Session not initialized');
    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async searchEmails(query: string, maxResults: number): Promise<string[]> {
    const gmail = this.getGmail();
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });
    return response.data.messages?.map(m => m.id!) || [];
  }

  async getEmail(messageId: string): Promise<Email> {
    const gmail = this.getGmail();
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const message = response.data;
    const headers = message.payload?.headers || [];
    const getHeader = (name: string): string => {
      const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
      return header?.value || '';
    };

    const fromHeader = getHeader('From');
    const fromMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
    const fromAddress = fromMatch ? fromMatch[1] : fromHeader;
    const fromDomain = fromAddress.split('@')[1] || '';

    const toHeader = getHeader('To');
    const toAddresses = toHeader.match(/[^\s,<]+@[^\s,>]+/g) || [];
    const toDomains = [...new Set(toAddresses.map(addr => addr.split('@')[1]))];

    let body = '';
    const getBody = (part: any): void => {
      if (part.body?.data) {
        body += Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        part.parts.forEach(getBody);
      }
    };
    if (message.payload) {
      getBody(message.payload);
    }

    return {
      id: message.id!,
      threadId: message.threadId!,
      from: fromHeader,
      fromAddress,
      fromDomain,
      to: toAddresses,
      toAddresses,
      toDomains,
      subject: getHeader('Subject'),
      body: body || '',
      snippet: message.snippet || '',
      receivedDate: new Date(parseInt(message.internalDate || '0')),
      labels: message.labelIds || [],
    };
  }

  async applyLabels(messageId: string, labelNames: string[]): Promise<void> {
    const gmail = this.getGmail();
    const labelIds: string[] = [];

    for (const labelName of labelNames) {
      const labelId = await this.getOrCreateLabel(labelName);
      labelIds.push(labelId);
    }

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: labelIds },
    });
  }

  private findLabelByName(
    labels: { id?: string | null; name?: string | null }[],
    labelName: string
  ): { id?: string | null } | null {
    const normalized = labelName.trim().toLowerCase();
    const found = labels.find(l => (l.name ?? '').trim().toLowerCase() === normalized);
    return found ?? null;
  }

  private async getOrCreateLabel(labelName: string): Promise<string> {
    const gmail = this.getGmail();
    const response = await gmail.users.labels.list({ userId: 'me' });
    const labels = response.data.labels || [];
    const existingLabel = this.findLabelByName(labels, labelName);

    if (existingLabel?.id) {
      return existingLabel.id;
    }

    try {
      const createResponse = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: labelName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      return createResponse.data.id!;
    } catch (err: unknown) {
      const code = (err as { code?: number; status?: number }).code ?? (err as { code?: number; status?: number }).status;
      if (code === 409) {
        const retryResponse = await gmail.users.labels.list({ userId: 'me' });
        const retryLabels = retryResponse.data.labels || [];
        const found = this.findLabelByName(retryLabels, labelName);
        if (found?.id) return found.id;
      }
      throw err;
    }
  }

  async hasReceivedFromDomain(domain: string, excludeEmailId?: string): Promise<boolean> {
    const escapedDomain = domain.replace(/[()]/g, '');
    const results = await this.searchEmails(`from:${escapedDomain}`, 2);
    if (results.length === 0) return false;
    if (excludeEmailId) {
      return results.length > 1 || results[0] !== excludeEmailId;
    }
    return true;
  }

  async hasReceivedFromAddress(address: string, excludeEmailId?: string): Promise<boolean> {
    const escapedAddress = address.replace(/[()]/g, '');
    const results = await this.searchEmails(`from:${escapedAddress}`, 2);
    if (results.length === 0) return false;
    if (excludeEmailId) {
      return results.length > 1 || results[0] !== excludeEmailId;
    }
    return true;
  }

  async hasSentToDomain(domain: string): Promise<boolean> {
    const escapedDomain = domain.replace(/[()]/g, '');
    const results = await this.searchEmails(`to:${escapedDomain} in:sent`, 1);
    return results.length > 0;
  }

  async hasSentToAddress(address: string): Promise<boolean> {
    const escapedAddress = address.replace(/[()]/g, '');
    const results = await this.searchEmails(`to:${escapedAddress} in:sent`, 1);
    return results.length > 0;
  }

  // ==========================================================================
  // Cached Domain Lookups
  // ==========================================================================

  private getBaseDomain(domain: string): string {
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;
    return parts.slice(-2).join('.');
  }

  async getMXRecords(domain: string): Promise<CachedMXResult> {
    const baseDomain = this.getBaseDomain(domain);
    
    if (this.mxCache.has(baseDomain)) {
      return this.mxCache.get(baseDomain)!;
    }

    let records: string[] | null = null;
    try {
      const mxRecords = await dns.resolveMx(baseDomain);
      mxRecords.sort((a, b) => (a.priority || 0) - (b.priority || 0));
      records = mxRecords.map(record => record.exchange.toLowerCase());
    } catch {
      records = null;
    }

    const provider = this.categorizeSMTPProvider(records);
    const result = { records, provider };
    this.mxCache.set(baseDomain, result);
    return result;
  }

  private categorizeSMTPProvider(mxRecords: string[] | null): CachedMXResult['provider'] {
    if (!mxRecords || mxRecords.length === 0) return null;

    const allMX = mxRecords.join(' ').toLowerCase();

    if (allMX.includes('google') || allMX.includes('gmail') || allMX.includes('googlemail')) {
      return 'gmail';
    }
    if (allMX.includes('outlook') || allMX.includes('microsoft') || allMX.includes('protection.outlook') || allMX.includes('exchange')) {
      return 'msft';
    }
    if (allMX.includes('amazonses') || allMX.includes('sendgrid') || allMX.includes('mailgun') || allMX.includes('mandrill') || allMX.includes('postmark') || allMX.includes('sparkpost') || allMX.includes('mailchimp')) {
      return 'automation';
    }
    if (allMX.includes('zoho') || allMX.includes('protonmail') || allMX.includes('fastmail')) {
      return 'work-email';
    }
    return 'other';
  }

  async getDomainStatus(domain: string): Promise<CachedDomainStatus> {
    const baseDomain = this.getBaseDomain(domain);

    if (this.domainStatusCache.has(baseDomain)) {
      return this.domainStatusCache.get(baseDomain)!;
    }

    const timeout = 5000;
    let result: CachedDomainStatus = {
      isDown: true,
      redirectsToDifferentDomain: null,
      redirectTargetDomain: null,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`https://${domain}`, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailDomainChecker/1.0)' },
      });

      clearTimeout(timeoutId);

      const finalUrl = new URL(response.url);
      const finalBaseDomain = this.getBaseDomain(finalUrl.hostname);
      const redirectsToDifferentDomain = finalBaseDomain !== baseDomain;

      result = {
        isDown: false,
        redirectsToDifferentDomain,
        redirectTargetDomain: redirectsToDifferentDomain ? finalBaseDomain : null,
      };
    } catch {
      // Try HTTP as fallback
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`http://${domain}`, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailDomainChecker/1.0)' },
        });

        clearTimeout(timeoutId);

        const finalUrl = new URL(response.url);
        const finalBaseDomain = this.getBaseDomain(finalUrl.hostname);
        const redirectsToDifferentDomain = finalBaseDomain !== baseDomain;

        result = {
          isDown: false,
          redirectsToDifferentDomain,
          redirectTargetDomain: redirectsToDifferentDomain ? finalBaseDomain : null,
        };
      } catch {
        // Both failed
      }
    }

    this.domainStatusCache.set(baseDomain, result);
    return result;
  }

  async getTXTRecords(domain: string): Promise<CachedTXTResult> {
    const baseDomain = this.getBaseDomain(domain);

    if (this.txtCache.has(baseDomain)) {
      return this.txtCache.get(baseDomain)!;
    }

    let result: CachedTXTResult = {
      hasTXT: false,
      hasSPF: false,
      hasDMARC: false,
      hasDKIM: false,
    };

    try {
      // Get TXT records
      const txtRecords = await dns.resolveTxt(baseDomain);
      const flatRecords = txtRecords.map(r => r.join(''));

      result.hasTXT = flatRecords.length > 0;
      result.hasSPF = flatRecords.some(r => r.toLowerCase().startsWith('v=spf1'));

      // Check DMARC
      try {
        const dmarcRecords = await dns.resolveTxt(`_dmarc.${baseDomain}`);
        result.hasDMARC = dmarcRecords.some(r => r.join('').toLowerCase().startsWith('v=dmarc1'));
      } catch {}

      // Check DKIM (common selectors)
      const dkimSelectors = ['default', 'google', 'selector1', 'selector2', 'k1', 'dkim'];
      for (const selector of dkimSelectors) {
        try {
          const dkimRecords = await dns.resolveTxt(`${selector}._domainkey.${baseDomain}`);
          if (dkimRecords.some(r => r.join('').toLowerCase().includes('v=dkim1') || r.join('').toLowerCase().includes('k=rsa'))) {
            result.hasDKIM = true;
            break;
          }
        } catch {}
      }
    } catch {}

    this.txtCache.set(baseDomain, result);
    return result;
  }

  async checkDomainResolves(domain: string): Promise<boolean> {
    const baseDomain = this.getBaseDomain(domain);

    if (this.domainResolvesCache.has(baseDomain)) {
      return this.domainResolvesCache.get(baseDomain)!;
    }

    let resolves = false;
    try {
      await dns.resolve4(baseDomain);
      resolves = true;
    } catch {
      try {
        await dns.resolve6(baseDomain);
        resolves = true;
      } catch {}
    }

    this.domainResolvesCache.set(baseDomain, resolves);
    return resolves;
  }

  // ==========================================================================
  // AI Labeling (with parallel rule matching)
  // ==========================================================================

  private hasUnsubscribeLink(email: Email): boolean {
    const content = `${email.body} ${email.snippet}`.toLowerCase();
    const patterns = [/unsubscribe/i, /opt[-\s]?out/i, /remove\s+me/i, /email\s+preferences/i, /manage\s+subscription/i];
    const urlPattern = /https?:\/\/[^\s]+(unsubscribe|opt[-\s]?out|remove|preference|subscription)[^\s]*/i;
    return patterns.some(p => p.test(content)) || urlPattern.test(content);
  }

  async applyAILabels(email: Email): Promise<{ labels: string[]; results: RuleResult[] }> {
    const labels: string[] = [];
    const results: RuleResult[] = [];
    const emailContent = `${email.subject} ${email.body} ${email.snippet}`.toLowerCase();

    // Static unsubscribe check
    const hasUnsubscribe = this.hasUnsubscribeLink(email);
    if (hasUnsubscribe) {
      labels.push('Has-Unsubscribe');
      results.push({ ruleName: 'Has-Unsubscribe', matched: true, reason: 'Email contains unsubscribe link' });
    } else {
      results.push({ ruleName: 'Has-Unsubscribe', matched: false, reason: 'No unsubscribe link found' });
    }

    // Separate rules into simple matches and AI matches
    const simpleMatches: LabelRule[] = [];
    const needsAI: LabelRule[] = [];

    for (const rule of this.aiRules) {
      const promptLower = rule.prompt.toLowerCase();
      if (emailContent.includes(promptLower)) {
        simpleMatches.push(rule);
      } else {
        needsAI.push(rule);
      }
    }

    // Add simple matches
    for (const rule of simpleMatches) {
      labels.push(rule.label);
      results.push({ ruleName: rule.label, matched: true, reason: `Simple text match: "${rule.prompt}"` });
    }

    // Process AI rules in parallel (batch of 5 to avoid rate limits)
    const batchSize = 5;
    for (let i = 0; i < needsAI.length; i += batchSize) {
      const batch = needsAI.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(rule => this.matchRuleWithAI(email, rule))
      );

      for (let j = 0; j < batch.length; j++) {
        const rule = batch[j];
        const aiResult = batchResults[j];

        if (aiResult.match) {
          labels.push(rule.label);
          results.push({ ruleName: rule.label, matched: true, reason: aiResult.reasoning || 'AI matched' });
        } else {
          results.push({ ruleName: rule.label, matched: false, reason: aiResult.reasoning || 'AI did not match' });
        }
      }
    }

    return { labels, results };
  }

  private async matchRuleWithAI(email: Email, rule: LabelRule): Promise<{ match: boolean; reasoning: string }> {
    if (!this.geminiClient) throw new Error('Gemini not initialized');

    const emailContent = `${email.subject}\n\n${email.body || email.snippet}`;
    const prompt = `You are a strict email classification assistant. Be VERY conservative.

Email:
${emailContent}

Rule:
Label: ${rule.label}
Description: ${rule.prompt}

Does this email CLEARLY match the rule? Respond with JSON only:
{"match": "yes" or "no", "reason": "brief explanation"}`;

    try {
      const model = this.geminiClient.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await withRetry(
        async () => {
          const response = await model.generateContent(prompt);
          return response.response.text().trim();
        },
        { maxAttempts: 2, initialDelayMs: 500, maxDelayMs: 5000 }
      );

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          match: parsed.match?.toLowerCase().trim() === 'yes',
          reasoning: parsed.reason || '',
        };
      }
    } catch (error: any) {
      console.error(`[AI] Error matching rule "${rule.label}":`, error.message);
    }

    return { match: false, reasoning: 'Error or invalid response' };
  }

  // ==========================================================================
  // Deterministic Labeling (delegate to lib/deterministic)
  // ==========================================================================

  async applyDeterministicLabels(email: Email, options?: { skipHistoryRules?: boolean }): Promise<{ labels: string[]; results: RuleResult[] }> {
    return applyDeterministicLabelsLib(email, this.deterministicRuleConfigs, options);
  }

  // ==========================================================================
  // Main Processing Function
  // ==========================================================================

  async processEmail(emailId: string): Promise<string[]> {
    const email = await this.getEmail(emailId);

    console.log(`\n📧 Processing: ${email.subject}`);
    console.log(`   From: ${email.from}\n`);

    const allLabels: string[] = [];

    // Apply deterministic labels (with caching)
    console.log('Deterministic Rules:');
    const deterministicResult = await this.applyDeterministicLabels(email);
    allLabels.push(...deterministicResult.labels);

    for (const result of deterministicResult.results) {
      const symbol = result.matched ? '✓' : 'x';
      console.log(`  [${symbol}] ${result.ruleName} - ${result.reason}`);
    }

    // Apply AI labels (with parallel processing)
    if (this.aiRules.length > 0) {
      console.log('\nAI Rules:');
      const aiResult = await this.applyAILabels(email);
      allLabels.push(...aiResult.labels);

      for (const result of aiResult.results) {
        const symbol = result.matched ? '✓' : 'x';
        console.log(`  [${symbol}] ${result.ruleName} - ${result.reason}`);
      }
    } else {
      console.log('\nAI Rules: (none configured)');
    }

    // Add processed label
    if (this.config.processedLabel) {
      allLabels.push(this.config.processedLabel);
    }

    // Apply labels to Gmail
    if (allLabels.length > 0) {
      if (this.config.dryRun) {
        console.log(`   [DRY RUN] Would apply labels:`, allLabels);
      } else {
        await this.applyLabels(emailId, allLabels);
        console.log(`   ✅ Applied ${allLabels.length} labels`);
      }
    }

    return allLabels;
  }

  /**
   * Process multiple emails efficiently with parallel processing
   * @param emailIds - Array of email IDs to process
   * @param concurrency - Number of emails to process in parallel (default: 3)
   */
  async processEmails(emailIds: string[], concurrency: number = 3): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;
    const total = emailIds.length;

    // Process emails in parallel batches
    for (let i = 0; i < emailIds.length; i += concurrency) {
      const batch = emailIds.slice(i, i + concurrency);

      const batchPromises = batch.map(async (emailId, batchIndex) => {
        const globalIndex = i + batchIndex + 1;
        const start = Date.now();

        try {
          const labels = await this.processEmail(emailId);
          const durationMs = Date.now() - start;
          const durationSec = (durationMs / 1000).toFixed(1);
          console.log(`\n[${globalIndex}/${total}] Completed in ${durationSec}s (${labels.length} labels)`);
          analytics.track('email_processing_complete', {
            emailId,
            index: globalIndex,
            total,
            durationMs,
            labelsCount: labels.length,
          });
          return { success: true, index: globalIndex };
        } catch (error: any) {
          const durationMs = Date.now() - start;
          const durationSec = (durationMs / 1000).toFixed(1);
          console.error(`   ❌ [${globalIndex}/${total}] Error in ${durationSec}s: ${error.message}`);
          analytics.track('email_processing_error', {
            emailId,
            index: globalIndex,
            total,
            durationMs,
            error: error.message,
          });
          return { success: false, index: globalIndex, error: error.message };
        }
      });

      // Wait for all emails in this batch to complete
      const results = await Promise.all(batchPromises);

      for (const result of results) {
        if (result.success) {
          processed++;
        } else {
          errors++;
        }
      }
    }

    return { processed, errors };
  }

  /**
   * Get cache statistics (for debugging/monitoring)
   */
  getCacheStats() {
    return {
      mxCache: this.mxCache.size,
      domainStatusCache: this.domainStatusCache.size,
      txtCache: this.txtCache.size,
      whoisCache: this.whoisCache.size,
      domainResolvesCache: this.domainResolvesCache.size,
    };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.mxCache.clear();
    this.domainStatusCache.clear();
    this.txtCache.clear();
    this.whoisCache.clear();
    this.domainResolvesCache.clear();
  }
}
