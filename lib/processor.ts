import { initializeGmail, searchEmails, getEmail, applyLabels, buildEmailHistory } from './gmail';
import { initializeGemini, applyAILabels } from './ai-labeler';
import { applyDeterministicLabels, updateHistory } from './deterministic';
import { fetchRulesFromSheet, extractSpreadsheetId } from './sheets';
import type { GmailConfig } from './gmail';
import type { LabelRule, EmailHistory } from './types';

export interface ProcessorConfig {
  gmail: GmailConfig;
  geminiApiKey: string;
  googleSheetsUrl?: string;
  pollIntervalMinutes: number;
  processedLabel: string;
  dryRun: boolean;
  emailAddress?: string; // Email address to process (defaults to 'me' for authenticated user)
}

export class EmailProcessor {
  private config: ProcessorConfig;
  private emailHistory: EmailHistory | null = null;
  private rules: LabelRule[] = [];
  private running = false;

  constructor(config: ProcessorConfig) {
    this.config = config;
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Email Processor...\n');

    // Initialize Gmail
    console.log('[Init] Setting up Gmail OAuth...');
    await initializeGmail(this.config.gmail);

    // Initialize Gemini
    console.log('[Init] Setting up Gemini AI...');
    await initializeGemini(this.config.geminiApiKey);

    // Load rules from Google Sheets
    if (this.config.googleSheetsUrl) {
      console.log('[Init] Loading rules from Google Sheets...');
      try {
        const spreadsheetId = extractSpreadsheetId(this.config.googleSheetsUrl);
        this.rules = await fetchRulesFromSheet(spreadsheetId);
        console.log(`[Init] Loaded ${this.rules.length} rules`);
      } catch (error) {
        console.error('[Init] Failed to load rules from Google Sheets:', error);
        throw error;
      }
    } else {
      console.log('[Init] No Google Sheets URL provided, skipping rule loading');
    }

    // Build email history for deterministic rules
    console.log('[Init] Building email history...');
    this.emailHistory = await buildEmailHistory();

    console.log('\n✅ Initialization complete!\n');
  }

  /**
   * Process a single email
   */
  async processEmail(emailId: string): Promise<string[]> {
    try {
      // Fetch email
      const email = await getEmail(emailId);
      
      console.log(`\n📧 Processing: ${email.subject}`);
      console.log(`   From: ${email.from}`);

      const allLabels: string[] = [];

      // Apply deterministic labels
      if (this.emailHistory) {
        const deterministicLabels = applyDeterministicLabels(email, this.emailHistory);
        allLabels.push(...deterministicLabels);
        
        // Update history
        updateHistory(email, this.emailHistory);
      }

      // Apply AI labels
      if (this.rules.length > 0) {
        const aiResult = await applyAILabels(email, this.rules);
        allLabels.push(...aiResult.labels);
      }

      // Add processed label
      allLabels.push(this.config.processedLabel);

      // Apply labels to Gmail
      if (allLabels.length > 0) {
        if (this.config.dryRun) {
          console.log(`   [DRY RUN] Would apply labels:`, allLabels);
        } else {
          await applyLabels(emailId, allLabels);
          console.log(`   ✅ Applied ${allLabels.length} labels`);
        }
      }

      return allLabels;
    } catch (error) {
      console.error(`   ❌ Error processing email ${emailId}:`, error);
      throw error;
    }
  }

  /**
   * Process unprocessed emails
   */
  async processUnprocessedEmails(): Promise<void> {
    try {
      // Search for emails to the configured email address
      const emailAddress = this.config.emailAddress || 'me';
      const query = emailAddress === 'me' 
        ? `newer_than:1d -label:${this.config.processedLabel}`
        : `to:${emailAddress} newer_than:1d -label:${this.config.processedLabel}`;
      
      console.log(`\n🔍 Searching for unprocessed emails: ${query}`);

      const emailIds = await searchEmails(query, 50);
      console.log(`📬 Found ${emailIds.length} unprocessed emails\n`);

      if (emailIds.length === 0) {
        console.log('✨ No emails to process');
        return;
      }

      let processed = 0;
      let failed = 0;

      for (const emailId of emailIds) {
        try {
          await this.processEmail(emailId);
          processed++;
        } catch (error) {
          failed++;
          console.error(`Failed to process ${emailId}:`, error);
        }
      }

      console.log(`\n📊 Summary: ${processed} processed, ${failed} failed\n`);
    } catch (error) {
      console.error('Error processing batch:', error);
      throw error;
    }
  }

  /**
   * Start continuous processing loop
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('⚠️  Processor already running');
      return;
    }

    this.running = true;
    console.log(`🔄 Starting continuous processing (every ${this.config.pollIntervalMinutes} minutes)...\n`);

    while (this.running) {
      try {
        await this.processUnprocessedEmails();
      } catch (error) {
        console.error('Error in processing loop:', error);
      }

      // Wait for next interval
      const waitMs = this.config.pollIntervalMinutes * 60 * 1000;
      console.log(`⏰ Next check in ${this.config.pollIntervalMinutes} minutes...\n`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Stop the processor
   */
  stop(): void {
    console.log('🛑 Stopping processor...');
    this.running = false;
  }

  /**
   * Process a single test email (for testing)
   */
  async testSingleEmail(query: string = 'in:inbox'): Promise<void> {
    console.log(`\n🧪 Test mode: Processing one email matching: ${query}\n`);

    const emailIds = await searchEmails(query, 1);
    
    if (emailIds.length === 0) {
      console.log('❌ No emails found matching query');
      return;
    }

    await this.processEmail(emailIds[0]);
    console.log('\n✅ Test complete\n');
  }
}
