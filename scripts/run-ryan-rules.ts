#!/usr/bin/env node
/**
 * Runs emails through the rule structure defined in scripts/ryan_rules.md.
 * Same usage pattern as run-processor.ts: load .env, optional AWS secret for refresh token,
 * dry run (default: true) so no labels are written to Gmail.
 *
 * Usage: bun run scripts/run-ryan-rules.ts
 *   Default: DRY RUN (no labels written). Set DRY_RUN=false to apply labels.
 *   DRY_RUN=false bun run scripts/run-ryan-rules.ts   # apply labels for real
 *   Default: all mail (inbox + spam + etc.). Use flags to narrow:
 *   --run-on-all-mail-except-spam  # run on all mail excluding spam
 *   --run-on-spam-folder           # run on spam folder only
 *   --test-sender         # print From + detected sender infra only (no rules, no labels)
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  initializeGmail,
  searchEmails,
  getEmailWithHeaders,
  applyLabels,
  applyLabelIds,
  hasSentToAddress,
  hasSentToDomain,
  getThreadFromAddresses,
  listGmailFilters,
  hasStarredEmailToOrFrom,
} from '../lib/gmail';
import type { GmailFilter, GmailFilterCriteria } from '../lib/gmail';
import { initializeGemini, callGemini } from '../lib/gemini';
import { buildClassificationPrompt } from '../lib/ai-labeler';
import {
  checkDomainRegistrationDate,
  checkDomainStatus,
  getBaseDomain,
  categorizeSMTPProvider,
} from '../lib/deterministic';
import { promises as dns } from 'dns';
import { lookup as whoisLookup } from 'whois';
import { getGeminiApiKey } from '../lib/secrets';
import type { Email } from '../lib/types';
import type { LabelRule } from '../lib/types';

// ---------------------------------------------------------------------------
// Config & types
// ---------------------------------------------------------------------------

interface GoogleCreds {
  web?: { client_id: string; client_secret: string };
  installed?: { client_id: string; client_secret: string };
}

/** Minimal in-memory caches for one run (keyed to avoid repeated API/network calls). */
export interface ProcessCaches {
  sentToAddress: Map<string, boolean>;
  sentToDomain: Map<string, boolean>;
  threadAddresses: Map<string, string[]>;
  senderInfra: Map<string, SenderInfra>;
  whoisIp: Map<string, string>;
  domainReg: Map<string, { isNewDomain: boolean; registrationDate: Date | null }>;
  domainStatus: Map<string, { isDown: boolean; redirectsToDifferentDomain: boolean | null }>;
  /** Domain → HTTP status (from fetch redirect: 'manual'). 200 = pass, >= 300 = redirect = fail. */
  domainHttpStatus: Map<string, number | null>;
  filterQueryIds: Map<string, string[]>;
  /** address → have we starred any email to/from this address */
  starredToFrom: Map<string, boolean>;
}

function createProcessCaches(): ProcessCaches {
  return {
    sentToAddress: new Map(),
    sentToDomain: new Map(),
    threadAddresses: new Map(),
    senderInfra: new Map(),
    whoisIp: new Map(),
    domainReg: new Map(),
    domainStatus: new Map(),
    domainHttpStatus: new Map(),
    filterQueryIds: new Map(),
    starredToFrom: new Map(),
  };
}

interface MainParams {
  emailAddress: string;
  gmailRefreshToken: string;
  geminiApiKey: string;
  dryRun: boolean;
  query: string;
  maxEmails: number;
  lookbackHours: number;
  /** When true, include messages in SPAM and TRASH in search results (default for "all mail"). */
  includeSpamTrash?: boolean;
  /** All Gmail filters: if any match, we apply that filter's action and stop. */
  allFilters?: GmailFilter[];
  /** Optional in-memory caches for this run. */
  caches?: ProcessCaches;
  /** Optional set of already-processed email IDs to skip (mutated: new IDs added after processing). */
  processedIds?: Set<string>;
}

type SenderInfra = 'gmail_msft' | 'aws_ses_sendgrid' | 'other';

// ---------------------------------------------------------------------------
// Sender infrastructure: client IP WHOIS → MX fallback → From domain → Received
// ---------------------------------------------------------------------------

function getReceivedFromClause(receivedLine: string): string {
  const byIndex = receivedLine.toLowerCase().indexOf(' by ');
  if (byIndex === -1) return receivedLine;
  return receivedLine.slice(0, byIndex).trim().toLowerCase();
}

/** Extract client IP from headers (e.g. Received-SPF / Authentication-Results: client-ip=1.2.3.4) */
function extractClientIpFromHeaders(headers: Array<{ name: string; value: string }>): string | null {
  const clientIpRe = /client-ip[=\s]+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i;
  for (const h of headers) {
    const m = (h.value || '').match(clientIpRe);
    if (m) return m[1];
  }
  return null;
}

/** WHOIS lookup on an IP; returns raw text (ARIN/RIPE etc.). */
function whoisIp(ip: string): Promise<string> {
  return new Promise((resolve, reject) => {
    whoisLookup(ip, (err: Error | null, data: string | unknown) => {
      if (err) return reject(err);
      resolve(typeof data === 'string' ? data : JSON.stringify(data));
    });
  });
}

/** Extract OrgName or NetName from WHOIS response for an IP. */
function parseOrgFromWhoisIp(whoisText: string): string | null {
  const text = whoisText.toLowerCase();
  const orgMatch = whoisText.match(/\bOrgName:\s*(.+)/i) || whoisText.match(/\bOrganization:\s*(.+)/i);
  if (orgMatch) return orgMatch[1].trim();
  const netMatch = whoisText.match(/\bNetName:\s*(.+)/i);
  if (netMatch) return netMatch[1].trim();
  return null;
}

/** Map WHOIS org/net name to our SenderInfra. */
function senderInfraFromOrgName(org: string | null): SenderInfra | null {
  if (!org) return null;
  const o = org.toLowerCase();
  if (
    o.includes('google') ||
    o.includes('microsoft') ||
    o.includes('outlook') ||
    o.includes('gmail')
  )
    return 'gmail_msft';
  if (
    o.includes('sendgrid') ||
    o.includes('twilio') ||
    o.includes('amazon') ||
    o.includes('ses') ||
    o.includes('mailgun') ||
    o.includes('mandrill') ||
    o.includes('postmark') ||
    o.includes('sparkpost') ||
    o.includes('mailchimp') ||
    o.includes('sendersrv')
  )
    return 'aws_ses_sendgrid';
  return null;
}

const GMAIL_MSFT_PATTERNS = [
  /\.google\.com\b/i,
  /\.gmail\.com\b/i,
  /\.googlemail\.com\b/i,
  /\bgoogle\.com\b/i,
  /\bgmail\.com\b/i,
  /\.outlook\.com\b/i,
  /\.hotmail\.(com|co\.uk|fr|de|es|it)\b/i,
  /\.live\.(com|co\.uk|fr|nl|ie|de|es|it)\b/i,
  /\.microsoft\.com\b/i,
  /\boutlook\.com\b/i,
  /\bhotmail\.com\b/i,
  /\blive\.com\b/i,
  /\bmicrosoft\.com\b/i,
];

const AWS_SES_SENDGRID_PATTERNS = [
  /amazonses/i,
  /amazon-ses/i,
  /amazonaws/i,
  /sendgrid/i,
  /inbound-smtp/i,
  /mailgun/i,
  /\.mg2\.substack\.com\b/i,
  /sendersrv/i,
];

const SES_SENDGRID_MAILGUN_FROM_DOMAINS = [
  'amazonses.com',
  'sendgrid.net',
  'mailgun.org',
  'mailgun.com',
  'sendersrv.com',
];

/**
 * Detect sender infrastructure:
 * 1. Client IP from headers (client-ip=) → WHOIS IP → map OrgName/NetName
 * 2. MX lookup on From domain → categorizeSMTPProvider
 * 3. From domain in known SES/SendGrid/Mailgun list
 * 4. First Received header "from" clause patterns
 */
async function getSenderInfra(
  headers: Array<{ name: string; value: string }>,
  receivedHeaders: string[],
  fromDomain?: string,
  cache?: ProcessCaches
): Promise<SenderInfra> {
  const firstFromClause =
    receivedHeaders.length > 0 ? getReceivedFromClause(receivedHeaders[0]) : '';
  const clientIp = extractClientIpFromHeaders(headers);
  const cacheKey = `${fromDomain ?? ''}|${clientIp ?? ''}|${firstFromClause}`;
  if (cache?.senderInfra.has(cacheKey)) {
    return cache.senderInfra.get(cacheKey)!;
  }

  // 1. Client IP + WHOIS
  if (clientIp) {
    try {
      let whoisText: string;
      if (cache?.whoisIp.has(clientIp)) {
        whoisText = cache.whoisIp.get(clientIp)!;
      } else {
        whoisText = await whoisIp(clientIp);
        cache?.whoisIp.set(clientIp, whoisText);
      }
      const org = parseOrgFromWhoisIp(whoisText);
      const infra = senderInfraFromOrgName(org);
      if (infra) {
        cache?.senderInfra.set(cacheKey, infra);
        return infra;
      }
    } catch {
      // WHOIS failed or didn't map; fall through
    }
  }

  // 2. MX lookup on From domain
  if (fromDomain) {
    try {
      const baseDomain = getBaseDomain(fromDomain);
      const mxRecords = await dns.resolveMx(baseDomain);
      const hosts = mxRecords?.map(r => r.exchange.toLowerCase()) ?? [];
      const provider = categorizeSMTPProvider(hosts.length ? hosts : null);
      // gmail, msft, work-email (Zoho, Fastmail, mail.*, etc.) = human/corporate mail → gmail_msft
      if (provider === 'gmail' || provider === 'msft' || provider === 'work-email') {
        cache?.senderInfra.set(cacheKey, 'gmail_msft');
        return 'gmail_msft';
      }
      if (provider === 'automation') {
        cache?.senderInfra.set(cacheKey, 'aws_ses_sendgrid');
        return 'aws_ses_sendgrid';
      }
    } catch {
      // MX lookup failed; fall through
    }

    // 3. From domain in known list
    const domainLower = fromDomain.toLowerCase();
    if (
      SES_SENDGRID_MAILGUN_FROM_DOMAINS.some(d => domainLower === d || domainLower.endsWith('.' + d))
    ) {
      cache?.senderInfra.set(cacheKey, 'aws_ses_sendgrid');
      return 'aws_ses_sendgrid';
    }
  }

  // 4. First Received "from" clause
  if (receivedHeaders.length > 0) {
    const fromClause = getReceivedFromClause(receivedHeaders[0]);
    if (GMAIL_MSFT_PATTERNS.some(re => re.test(fromClause))) {
      cache?.senderInfra.set(cacheKey, 'gmail_msft');
      return 'gmail_msft';
    }
    if (AWS_SES_SENDGRID_PATTERNS.some(re => re.test(fromClause))) {
      cache?.senderInfra.set(cacheKey, 'aws_ses_sendgrid');
      return 'aws_ses_sendgrid';
    }
  }

  cache?.senderInfra.set(cacheKey, 'other');
  return 'other';
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

/** Check if an email matches a Gmail filter's criteria (from, to, subject; query via search). */
async function emailMatchesFilterCriteria(
  email: Email,
  emailId: string,
  criteria: GmailFilterCriteria | null | undefined,
  cache?: ProcessCaches
): Promise<boolean> {
  if (!criteria) return false;
  const fromRaw = (criteria.from ?? '').trim().toLowerCase();
  if (fromRaw) {
    const domain = email.fromDomain.toLowerCase();
    const addr = email.fromAddress.toLowerCase();
    const fromHeader = (email.from || '').toLowerCase();
    const matchFrom =
      domain === fromRaw ||
      addr === fromRaw ||
      fromHeader.includes(fromRaw) ||
      domain.endsWith('.' + fromRaw) ||
      fromRaw.includes(domain);
    if (!matchFrom) return false;
  }
  const toRaw = (criteria.to ?? '').trim().toLowerCase();
  if (toRaw) {
    const toList = (email.toAddresses || []).map(a => a.toLowerCase());
    const toHeader = (email.to || []).join(' ').toLowerCase();
    const matchTo =
      toList.some(a => a === toRaw || a.endsWith('@' + toRaw)) ||
      toHeader.includes(toRaw);
    if (!matchTo) return false;
  }
  const subj = (criteria.subject ?? '').trim();
  if (subj) {
    if (!(email.subject || '').toLowerCase().includes(subj.toLowerCase())) return false;
  }
  const query = (criteria.query ?? '').trim();
  if (query) {
    let ids: string[];
    if (cache?.filterQueryIds.has(query)) {
      ids = cache.filterQueryIds.get(query)!;
    } else {
      ids = await searchEmails(query, 500, true);
      cache?.filterQueryIds.set(query, ids);
    }
    if (!ids.includes(emailId)) return false;
  }
  return true;
}

function extractEmailFromHeader(value: string): string {
  const trimmed = (value || '').trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const plain = trimmed.match(/[^\s,]+@[^\s,>]+/);
  return plain ? plain[0].trim().toLowerCase() : trimmed.toLowerCase();
}

// ---------------------------------------------------------------------------
// Gemini: single rule match (same format as ai-labeler)
// ---------------------------------------------------------------------------

async function runGeminiRule(
  email: Email,
  label: string,
  prompt: string
): Promise<{ match: boolean; reason: string }> {
  const rule: LabelRule = { label, prompt };
  const fullPrompt = buildClassificationPrompt(email, rule);
  const modelName = 'gemini-2.0-flash';
  try {
    const text = await callGemini(modelName, fullPrompt);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { match?: string; reason?: string };
      const match = (parsed.match ?? '').toLowerCase().trim() === 'yes';
      return { match, reason: parsed.reason ?? '' };
    }
    return { match: false, reason: 'Failed to parse Gemini response' };
  } catch (err: any) {
    console.warn(`   [Gemini] ${label}: ${err?.message ?? err}`);
    return { match: false, reason: err?.message ?? 'Error' };
  }
}

// ---------------------------------------------------------------------------
// Gmail/MSFT branch: 5 checks (domain age, up, https valid, reply-to, redirect)
// ---------------------------------------------------------------------------

/** Fetch https://domain with redirect: 'manual'. Returns status (200, 301, etc.) or null on error. */
async function fetchDomainHttpStatus(
  domain: string,
  cache?: ProcessCaches
): Promise<number | null> {
  if (cache?.domainHttpStatus.has(domain)) {
    return cache.domainHttpStatus.get(domain)!;
  }
  const timeout = 5000;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(`https://${domain}`, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailDomainChecker/1.0)' },
    });
    clearTimeout(timeoutId);
    cache?.domainHttpStatus.set(domain, response.status);
    return response.status;
  } catch {
    cache?.domainHttpStatus.set(domain, null);
    return null;
  }
}

interface GmailMsftCheckResult {
  name: string;
  passed: boolean;
  reason: string;
}

async function runGmailMsftChecks(
  email: Email,
  headers: Array<{ name: string; value: string }>,
  cache?: ProcessCaches
): Promise<{ failCount: number; reasons: string[]; results: GmailMsftCheckResult[] }> {
  const domain = email.fromDomain;
  const reasons: string[] = [];
  const results: GmailMsftCheckResult[] = [];
  let failCount = 0;

  // 1. Domain NOT recently registered: pass = registered a while ago, fail = registered < 2 months
  try {
    let reg: { isNewDomain: boolean; registrationDate: Date | null };
    if (cache?.domainReg.has(domain)) {
      reg = cache.domainReg.get(domain)!;
    } else {
      reg = await checkDomainRegistrationDate(domain, 2);
      cache?.domainReg.set(domain, reg);
    }
    // isNewDomain = true when registered in last 2 months → we fail that check
    const recentlyRegistered = reg.isNewDomain;
    if (recentlyRegistered) {
      failCount++;
      reasons.push('Domain registered < 2 months ago');
    }
    const passed = !recentlyRegistered;
    results.push({
      name: 'Domain not recently registered',
      passed,
      reason: recentlyRegistered
        ? 'Domain registered < 2 months ago (fail)'
        : reg.registrationDate
          ? `Registered ${reg.registrationDate.toISOString().split('T')[0]} (OK)`
          : 'Could not determine (OK)',
    });
  } catch {
    failCount++;
    reasons.push('Could not check domain registration');
    results.push({
      name: 'Domain not recently registered',
      passed: false,
      reason: 'Could not check domain registration',
    });
  }

  // 2. Is domain up  3. HTTPS and cert valid (checkDomainStatus tries https first)
  let domainStatus: { isDown: boolean; redirectsToDifferentDomain: boolean | null } = {
    isDown: true,
    redirectsToDifferentDomain: null,
  };
  try {
    if (cache?.domainStatus.has(domain)) {
      domainStatus = cache.domainStatus.get(domain)!;
    } else {
      domainStatus = await checkDomainStatus(domain);
      cache?.domainStatus.set(domain, domainStatus);
    }
    const failed = domainStatus.isDown;
    if (failed) {
      failCount++;
      reasons.push('Domain is down or unreachable');
    }
    results.push({
      name: 'Domain up (HTTPS)',
      passed: !failed,
      reason: failed ? 'Domain is down or unreachable' : 'Domain is up (OK)',
    });
  } catch {
    failCount++;
    reasons.push('Domain check failed');
    results.push({
      name: 'Domain up (HTTPS)',
      passed: false,
      reason: 'Domain check failed',
    });
  }

  // 4. Reply-To different from From
  const replyTo = getHeader(headers, 'Reply-To');
  const fromAddr = email.fromAddress.toLowerCase();
  const replyToAddr = replyTo ? extractEmailFromHeader(replyTo) : '';
  const replyToFails = !!(replyTo && replyToAddr && replyToAddr !== fromAddr);
  if (replyToFails) {
    failCount++;
    reasons.push('Reply-To differs from From');
  }
  results.push({
    name: 'Reply-To same as From',
    passed: !replyToFails,
    reason: replyToFails
      ? `Reply-To differs from From (${replyToAddr} ≠ ${fromAddr})`
      : replyTo ? 'Reply-To matches From (OK)' : 'No Reply-To (OK)',
  });

  // 5. Domain is up and does not redirect elsewhere (200 = pass, >= 300 = fail)
  const httpStatus = await fetchDomainHttpStatus(domain, cache);
  const redirectFails = httpStatus === null || httpStatus >= 300;
  if (redirectFails) {
    failCount++;
    reasons.push(
      httpStatus === null
        ? 'Domain down or unreachable'
        : `Domain redirects (HTTP ${httpStatus})`
    );
  }
  results.push({
    name: 'Domain is up and does not redirect elsewhere',
    passed: !redirectFails,
    reason:
      httpStatus === 200
        ? 'HTTP 200 (OK)'
        : httpStatus !== null && httpStatus >= 300
          ? `HTTP ${httpStatus} redirect (fail)`
          : httpStatus === null
            ? 'Domain down or unreachable (fail)'
            : `HTTP ${httpStatus} (fail)`,
  });

  return { failCount, reasons, results };
}

// ---------------------------------------------------------------------------
// Process one email through Ryan rules
// ---------------------------------------------------------------------------

async function processEmailWithRyanRules(
  emailId: string,
  params: MainParams
): Promise<string[]> {
  const { dryRun } = params;
  const { email, headers } = await getEmailWithHeaders(emailId);

  const labels: string[] = [];
  const receivedHeaders = headers
    .filter(h => h.name.toLowerCase() === 'received')
    .map(h => h.value);

  console.log(`\n📧 ${email.subject}`);
  console.log(`   From: ${email.from}`);

  const caches = params.caches;

  // ---- Rule 1: Gmail filters first — if any filter matches, apply that filter's action and stop ----
  const allFilters = params.allFilters ?? [];
  for (const filter of allFilters) {
    const matched = await emailMatchesFilterCriteria(
      email,
      emailId,
      filter.criteria ?? undefined,
      caches
    );
    if (matched) {
      const addIds = filter.action?.addLabelIds?.filter(Boolean) ?? [];
      const removeIds = filter.action?.removeLabelIds?.filter(Boolean) ?? [];
      if (addIds.length > 0 || removeIds.length > 0) {
        if (dryRun) {
          console.log(`   [Rule 1 Gmail] Matches filter → would apply addLabelIds: [${addIds.join(', ')}], removeLabelIds: [${removeIds.join(', ')}] (stop)`);
        } else {
          await applyLabelIds(emailId, addIds, removeIds);
          console.log(`   [Rule 1 Gmail] Applied filter → addLabelIds: [${addIds.join(', ')}], removeLabelIds: [${removeIds.join(', ')}] (stop)`);
        }
      } else {
        console.log(`   [Rule 1 Gmail] Matches filter (no label action) (stop)`);
      }
      return labels;
    }
  }

  // ---- Rule 2: Starred any email to or from this address → important, stop ----
  let hasStarred: boolean;
  if (caches?.starredToFrom.has(email.fromAddress)) {
    hasStarred = caches.starredToFrom.get(email.fromAddress)!;
  } else {
    hasStarred = await hasStarredEmailToOrFrom(email.fromAddress);
    caches?.starredToFrom.set(email.fromAddress, hasStarred);
  }
  if (hasStarred) {
    labels.push('ai important');
    console.log('   [Rule 2] Starred email to/from this address → ai important (stop)');
    if (dryRun) {
      console.log(`   [DRY RUN] Would apply labels: ${labels.join(', ')}`);
    } else {
      await applyLabels(emailId, labels);
      console.log(`   ✅ Applied: ${labels.join(', ')}`);
    }
    return labels;
  }

  // ---- Rule 3: Ever emailed this person or their domain → important, stop ----
  let sentToAddress: boolean;
  if (caches?.sentToAddress.has(email.fromAddress)) {
    sentToAddress = caches.sentToAddress.get(email.fromAddress)!;
  } else {
    sentToAddress = await hasSentToAddress(email.fromAddress);
    caches?.sentToAddress.set(email.fromAddress, sentToAddress);
  }
  let sentToDomain: boolean;
  if (caches?.sentToDomain.has(email.fromDomain)) {
    sentToDomain = caches.sentToDomain.get(email.fromDomain)!;
  } else {
    sentToDomain = await hasSentToDomain(email.fromDomain);
    caches?.sentToDomain.set(email.fromDomain, sentToDomain);
  }
  if (sentToAddress || sentToDomain) {
    labels.push('ai important');
    console.log('   [Rule 3] Ever emailed sender/domain → ai important (stop)');
    if (labels.length > 0) {
      if (dryRun) {
        console.log(`   [DRY RUN] Would apply labels: ${labels.join(', ')}`);
      } else {
        await applyLabels(emailId, labels);
        console.log(`   ✅ Applied: ${labels.join(', ')}`);
      }
    }
    return labels;
  }

  // ---- Rule 4: Same thread as someone I've emailed → important, stop ----
  let threadAddresses: string[];
  if (caches?.threadAddresses.has(email.threadId)) {
    threadAddresses = caches.threadAddresses.get(email.threadId)!;
  } else {
    threadAddresses = await getThreadFromAddresses(email.threadId);
    caches?.threadAddresses.set(email.threadId, threadAddresses);
  }
  let threadMatch = false;
  for (const addr of threadAddresses) {
    let sent: boolean;
    if (caches?.sentToAddress.has(addr)) {
      sent = caches.sentToAddress.get(addr)!;
    } else {
      sent = await hasSentToAddress(addr);
      caches?.sentToAddress.set(addr, sent);
    }
    if (sent) {
      threadMatch = true;
      break;
    }
  }
  if (threadMatch) {
    labels.push('ai important');
    console.log('   [Rule 4] Same thread as someone I emailed → ai important (stop)');
    if (labels.length > 0) {
      if (dryRun) {
        console.log(`   [DRY RUN] Would apply labels: ${labels.join(', ')}`);
      } else {
        await applyLabels(emailId, labels);
        console.log(`   ✅ Applied: ${labels.join(', ')}`);
      }
    }
    return labels;
  }

  // ---- Rule 5: From @docs.google.com → important, stop ----
  const docsGoogleDomain = 'docs.google.com';
  if (
    email.fromDomain.toLowerCase() === docsGoogleDomain ||
    email.fromDomain.toLowerCase().endsWith('.' + docsGoogleDomain)
  ) {
    labels.push('ai important');
    console.log('   [Rule 5] From @docs.google.com → ai important (stop)');
    if (dryRun) {
      console.log(`   [DRY RUN] Would apply labels: ${labels.join(', ')}`);
    } else {
      await applyLabels(emailId, labels);
      console.log(`   ✅ Applied: ${labels.join(', ')}`);
    }
    return labels;
  }

  // ---- Rule 6: Job applicant (known job-portal domains, then AI) → label, stop ----
  const jobPortalFromDomains = ['symplicity.com', 'csm.symplicity.com'];
  const fromDomainLower = email.fromDomain.toLowerCase();
  const isKnownJobPortal =
    jobPortalFromDomains.some(d => fromDomainLower === d || fromDomainLower.endsWith('.' + d));
  if (isKnownJobPortal) {
    labels.push('ai job applicant');
    console.log(`   [Rule 6] From job portal (${email.fromDomain}) → ai job applicant (stop)`);
    if (dryRun) {
      console.log(`   [DRY RUN] Would apply labels: ${labels.join(', ')}`);
    } else {
      await applyLabels(emailId, labels);
      console.log(`   ✅ Applied: ${labels.join(', ')}`);
    }
    return labels;
  }

  const jobPrompt =
    'Determine if this is someone who is looking for a job. Job applications will typically tell me why they are qualified for a job at fan pier labs and mention their work experience. They will often attach their resume as well.';
  const jobResult = await runGeminiRule(email, 'ai job applicant', jobPrompt);
  if (jobResult.match) {
    labels.push('ai job applicant');
    console.log(`   [Rule 6] Job applicant → ai job applicant (stop): ${jobResult.reason}`);
    if (labels.length > 0) {
      if (dryRun) {
        console.log(`   [DRY RUN] Would apply labels: ${labels.join(', ')}`);
      } else {
        await applyLabels(emailId, labels);
        console.log(`   ✅ Applied: ${labels.join(', ')}`);
      }
    }
    return labels;
  }

  // ---- Sender infrastructure: client IP WHOIS → MX → From domain → Received ----
  const senderInfra = await getSenderInfra(headers, receivedHeaders, email.fromDomain, caches);
  console.log(`   [Sender infra] ${senderInfra}`);

  if (senderInfra === 'gmail_msft') {
    const { failCount, reasons, results } = await runGmailMsftChecks(email, headers, caches);
    for (const r of results) {
      const icon = r.passed ? '✓' : '✗';
      console.log(`   [Gmail/MSFT] ${icon} ${r.name}: ${r.reason}`);
    }
    if (failCount === 1) {
      labels.push('ai might be spam');
    } else if (failCount >= 2) {
      labels.push('ai not important');
      labels.push('ai thinks spam');
    }
    // Continue to event rules (no stop)
  } else if (senderInfra === 'aws_ses_sendgrid') {
    const coldPrompt =
      'Determine if this is a personalized cold outreach or sales email targeted at Ryan specifically. These emails typically: start with a greeting using his name (e.g. "Hi Ryan", "Hey Ryan"); pitch a product, service, or meeting; and end with a signature (e.g. "Best regards", "Thank you", sender name). They read like one-to-one sales or bizdev outreach, not a bulk newsletter. They may or may not mention Fan Pier Labs or his company. Match if it is clearly personalized cold outreach to Ryan, even if it does not mention Fan Pier Labs.';
    const coldResult = await runGeminiRule(email, 'ai detected cold email', coldPrompt);
    if (coldResult.match) {
      labels.push('ai detected cold email');
      console.log(`   [SES/SendGrid] Cold email → ai detected cold email (stop): ${coldResult.reason}`);
      if (labels.length > 0) {
        if (dryRun) {
          console.log(`   [DRY RUN] Would apply labels: ${labels.join(', ')}`);
        } else {
          await applyLabels(emailId, labels);
          console.log(`   ✅ Applied: ${labels.join(', ')}`);
        }
      }
      return labels;
    }
  } else {
    labels.push('unknown sender mail system');
    // Debug: help improve sender infra patterns
    const firstReceived = receivedHeaders[0] ?? '(no Received headers)';
    const fromClause =
      receivedHeaders.length > 0 ? getReceivedFromClause(receivedHeaders[0]) : '(n/a)';
    console.log(`   [DEBUG unknown sender] From domain: ${email.fromDomain}`);
    console.log(`   [DEBUG unknown sender] From address: ${email.fromAddress}`);
    console.log(`   [DEBUG unknown sender] First Received: ${firstReceived}`);
    console.log(`   [DEBUG unknown sender] Received "from" clause (for patterns): ${fromClause}`);
  }

  // ---- Event rules (continue matching) ----
  const eventRules: Array<{ label: string; prompt: string }> = [
    {
      label: 'ai online event',
      prompt:
        'determine if this is telling me about a webinar, or an online event this happening on google meet or zoom. these will often be invites from luma or other event invite platforms.',
    },
    {
      label: 'ai poker night',
      prompt: 'determine if this is telling me about a poker night, or poker game.',
    },
    {
      label: 'ai nyc event',
      prompt:
        'determine if this is telling me an event in nyc that is related to startups or technology or software. the event must be located in manhattan or brooklyn',
    },
    {
      label: 'ai brand event',
      prompt:
        'determine if this is an email telling me about an event hosted by a brand-name well-known tech startup such as vercel, stripe, anthropic or a well-known venture capitalist such as general catalyst or a16z',
    },
  ];

  for (const { label, prompt } of eventRules) {
    const result = await runGeminiRule(email, label, prompt);
    if (result.match) {
      labels.push(label);
      console.log(`   [Event] ${label}: ${result.reason}`);
    }
  }

  // ---- Event importance (from ryan_rules) ----
  if (labels.includes('ai online event') && !labels.includes('ai nyc event')) {
    labels.push('ai not important');
  }
  if (labels.includes('ai nyc event')) {
    labels.push('ai important');
  }
  if (labels.includes('ai poker night')) {
    // "if it is a poker night that is in nyc, mark as important" - we don't have nyc for poker here, so skip or add both
    labels.push('ai important');
  }
  if (labels.includes('ai brand event')) {
    labels.push('ai important');
  }

  if (labels.length > 0) {
    if (dryRun) {
      console.log(`   [DRY RUN] Would apply labels: ${labels.join(', ')}`);
    } else {
      await applyLabels(emailId, labels);
      console.log(`   ✅ Applied: ${labels.join(', ')}`);
    }
  }

  return labels;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(params: MainParams): Promise<void> {
  console.log('📧 Ryan Rules - Email Processor\n');
  console.log('=========================================\n');

  let gmailClientId: string | undefined;
  let gmailClientSecret: string | undefined;

  try {
    const credsPath = join(process.cwd(), 'google_creds.json');
    const credsContent = readFileSync(credsPath, 'utf-8');
    const creds: GoogleCreds = JSON.parse(credsContent);
    const webCreds = creds.web || creds.installed;
    if (webCreds) {
      gmailClientId = webCreds.client_id;
      gmailClientSecret = webCreds.client_secret;
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      gmailClientId = process.env.GMAIL_CLIENT_ID;
      gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
    } else {
      throw new Error(`Error reading google_creds.json: ${err.message}`);
    }
  }

  if (!gmailClientId || !gmailClientSecret) {
    throw new Error(
      'Missing Google OAuth credentials. Create google_creds.json or set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET'
    );
  }

  if (params.dryRun) {
    console.log('⚠️  DRY RUN MODE - No labels will be applied to Gmail\n');
  }

  const lookbackHours = params.lookbackHours ?? 24;
  const baseQuery = params.query || ''; // empty = all mail
  const query = baseQuery ? `${baseQuery} newer_than:${lookbackHours}h` : `newer_than:${lookbackHours}h`;
  const maxEmails = params.maxEmails ?? 10;

  console.log(`📧 Account: ${params.emailAddress}`);
  console.log(`🔍 Query: ${query}`);
  console.log(`📊 Max emails: ${maxEmails}\n`);

  await initializeGmail({
    clientId: gmailClientId,
    clientSecret: gmailClientSecret,
    refreshToken: params.gmailRefreshToken,
  });
  await initializeGemini(params.geminiApiKey);

  // Fetch all Gmail filters — Rule 1 applies matching filter actions and stops
  let allFilters: GmailFilter[] = [];
  try {
    allFilters = await listGmailFilters();
    if (allFilters.length > 0) {
      console.log(`📌 Loaded ${allFilters.length} Gmail filter(s) (Rule 1: match → apply filter action, stop)\n`);
      const toShow = allFilters.slice(0, 5);
      toShow.forEach((f, i) => {
        const c = f.criteria ?? {};
        const parts = [
          c.from && `from: ${c.from}`,
          c.to && `to: ${c.to}`,
          c.subject && `subject: ${c.subject}`,
          c.query && `query: ${c.query}`,
        ].filter(Boolean);
        const actions = (f.action?.addLabelIds ?? []).concat(f.action?.removeLabelIds ?? []);
        console.log(`   Filter ${i + 1}: ${parts.length ? parts.join(' | ') : '(no criteria)'} → [${actions.join(', ')}]`);
      });
      if (allFilters.length > 5) {
        console.log(`   ... and ${allFilters.length - 5} more\n`);
      } else {
        console.log('');
      }
    }
  } catch (err: any) {
    console.warn('⚠️  Could not load Gmail filters (scope gmail.settings.basic may be needed):', err?.message ?? err);
  }

  const caches = createProcessCaches();
  const paramsWithFilters: MainParams = { ...params, allFilters, caches };

  const emailIds = await searchEmails(query, maxEmails, false, params.includeSpamTrash);
  const toProcess = params.processedIds
    ? emailIds.filter(id => !params.processedIds!.has(id))
    : emailIds;

  if (toProcess.length === 0) {
    console.log(
      emailIds.length === 0
        ? 'No emails found matching query.'
        : `All ${emailIds.length} email(s) already processed (${params.processedIds!.size} in cache).`
    );
    return;
  }

  if (params.processedIds && emailIds.length > toProcess.length) {
    console.log(`Skipping ${emailIds.length - toProcess.length} already-processed email(s).\n`);
  }
  console.log(`Found ${toProcess.length} email(s) to process.\n`);

  for (let i = 0; i < toProcess.length; i++) {
    const emailId = toProcess[i];
    console.log(`\n[${i + 1}/${toProcess.length}]`);
    try {
      await processEmailWithRyanRules(emailId, paramsWithFilters);
      params.processedIds?.add(emailId);
    } catch (err: any) {
      console.error(`   ❌ Error: ${err.message}`);
    }
  }

  console.log('\n✅ Ryan rules processing complete.\n');
}

async function getSecretFromAWS(secretArn: string): Promise<string> {
  const client = new SecretsManagerClient({ region: 'us-east-2' });
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await client.send(command);
  if (!response.SecretString) throw new Error('Secret value empty');
  return response.SecretString.trim();
}

/**
 * Test / local run: same pattern as run-processor.ts
 */
async function test(): Promise<void> {
  config();

  const secretArn =
    'arn:aws:secretsmanager:us-east-2:555985150976:secret:ryan-gmail-refresh-token-qv3WLe';
  console.log('🔐 Fetching Gmail refresh token from AWS Secrets Manager...');
  const gmailRefreshToken = await getSecretFromAWS(secretArn);
  if (!gmailRefreshToken) {
    throw new Error('Gmail refresh token is empty. Check AWS Secrets Manager.');
  }
  console.log(`✅ Refresh token fetched (length: ${gmailRefreshToken.length})`);

  const geminiApiKey = await getGeminiApiKey();
  const dryRun = process.env.DRY_RUN !== undefined ? process.env.DRY_RUN === 'true' : true;
  const maxEmails = parseInt(process.env.MAX_EMAILS ?? '5', 10);
  const lookbackHours = parseInt(process.env.LOOKBACK_HOURS ?? '168', 10); // 1 week default
  const runOnSpamFolder = process.argv.includes('--run-on-spam-folder');
  const runOnAllMailExceptSpam = process.argv.includes('--run-on-all-mail-except-spam');
  // Default: all mail (inbox + spam + etc.). --run-on-all-mail-except-spam = exclude spam. --run-on-spam-folder = spam only.
  const query = runOnSpamFolder ? 'in:spam' : '';
  const includeSpamTrash = !runOnSpamFolder && !runOnAllMailExceptSpam; // true = default (everything)
  if (runOnSpamFolder) console.log('📬 Running on SPAM folder\n');
  else if (runOnAllMailExceptSpam) console.log('📬 Running on all mail (except spam)\n');

  await main({
    emailAddress: 'ryan@fanpierlabs.com',
    gmailRefreshToken,
    geminiApiKey,
    dryRun,
    query,
    maxEmails,
    lookbackHours,
    includeSpamTrash,
  });

  console.log('✅ Test complete.\n');
}

/**
 * Test sender detection only: fetch N emails, print From address + detected sender infra.
 * Usage: bun run scripts/run-ryan-rules.ts --test-sender
 */
async function test_get_email_sender(): Promise<void> {
  config();

  const secretArn =
    'arn:aws:secretsmanager:us-east-2:555985150976:secret:ryan-gmail-refresh-token-qv3WLe';
  console.log('🔐 Fetching Gmail refresh token from AWS Secrets Manager...');
  const gmailRefreshToken = await getSecretFromAWS(secretArn);
  if (!gmailRefreshToken) throw new Error('Gmail refresh token is empty.');

  let gmailClientId: string | undefined;
  let gmailClientSecret: string | undefined;
  try {
    const credsPath = join(process.cwd(), 'google_creds.json');
    const creds: GoogleCreds = JSON.parse(readFileSync(credsPath, 'utf-8'));
    const webCreds = creds.web || creds.installed;
    if (webCreds) {
      gmailClientId = webCreds.client_id;
      gmailClientSecret = webCreds.client_secret;
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      gmailClientId = process.env.GMAIL_CLIENT_ID;
      gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
    } else throw err;
  }
  if (!gmailClientId || !gmailClientSecret) {
    throw new Error('Missing Google OAuth credentials (google_creds.json or env).');
  }

  await initializeGmail({
    clientId: gmailClientId,
    clientSecret: gmailClientSecret,
    refreshToken: gmailRefreshToken,
  });

  const runOnSpamFolder = process.argv.includes('--run-on-spam-folder');
  const runOnAllMailExceptSpam = process.argv.includes('--run-on-all-mail-except-spam');
  const query = runOnSpamFolder ? 'in:spam' : '';
  const includeSpamTrash = !runOnSpamFolder && !runOnAllMailExceptSpam;
  const lookbackHours = parseInt(process.env.LOOKBACK_HOURS ?? '168', 10);
  const maxEmails = parseInt(process.env.MAX_EMAILS ?? '20', 10);
  const fullQuery = query ? `${query} newer_than:${lookbackHours}h` : `newer_than:${lookbackHours}h`;

  const emailIds = await searchEmails(fullQuery, maxEmails, false, includeSpamTrash);
  console.log(`\n📬 Sender detection test: ${emailIds.length} emails (${fullQuery})\n`);
  console.log('From address                              | Detected sender');
  console.log('------------------------------------------|------------------');

  const caches = createProcessCaches();
  for (const emailId of emailIds) {
    try {
      const { email, headers } = await getEmailWithHeaders(emailId);
      const receivedHeaders = headers
        .filter(h => h.name.toLowerCase() === 'received')
        .map(h => h.value);
      const senderInfra = await getSenderInfra(
        headers,
        receivedHeaders,
        email.fromDomain,
        caches
      );
      const from = (email.fromAddress || email.from || '').padEnd(41);
      console.log(`${from} | ${senderInfra}`);
    } catch (err: any) {
      console.log(`${emailId} | error: ${err.message}`);
    }
  }

  console.log('\n✅ Done.\n');
}

if (require.main === module) {
  const runTestSender = process.argv.includes('--test-sender');
  const fn = runTestSender ? test_get_email_sender : test;
  fn().catch((err: any) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}

export { main, test, test_get_email_sender, getSecretFromAWS };
