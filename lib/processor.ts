import { initializeGmail, searchEmails, getEmail, applyLabels, buildEmailHistory } from './gmail';
import { initializeGemini, applyAILabels } from './ai-labeler';
import { applyDeterministicLabels, updateHistory } from './deterministic';
import { fetchRulesFromSheet, extractSpreadsheetId } from './sheets';
import type { GmailConfig } from './gmail';
import type { EmailHistory } from './types';

export interface ProcessorConfig {
  gmail: GmailConfig;
  geminiApiKey: string;
  googleSheetsUrl?: string;
  processedLabel: string;
  dryRun: boolean;
}

/**
 * Stateless function to process a single email
 * Loads Google Sheet rules every time it's called
 */
export async function processEmail(
  config: ProcessorConfig,
  emailId: string
): Promise<string[]> {
  try {
    // Initialize Gmail
    await initializeGmail(config.gmail);

    // Initialize Gemini
    await initializeGemini(config.geminiApiKey);

    // Load rules from Google Sheets (every time, no caching)
    let rules: any[] = [];
    if (config.googleSheetsUrl) {
      try {
        const spreadsheetId = extractSpreadsheetId(config.googleSheetsUrl);
        rules = await fetchRulesFromSheet(spreadsheetId);
        console.log(`[Rules] Loaded ${rules.length} rules from Google Sheets`);
      } catch (error) {
        console.error('[Rules] Failed to load rules from Google Sheets:', error);
        // Continue without rules rather than failing
      }
    }

    // Build email history for deterministic rules
    const emailHistory: EmailHistory = await buildEmailHistory();

    // Fetch email
    const email = await getEmail(emailId);
    
    console.log(`\n📧 Processing: ${email.subject}`);
    console.log(`   From: ${email.from}`);

    const allLabels: string[] = [];

    // Apply deterministic labels
    const deterministicLabels = applyDeterministicLabels(email, emailHistory);
    allLabels.push(...deterministicLabels);
    
    // Update history
    updateHistory(email, emailHistory);

    // Apply AI labels
    if (rules.length > 0) {
      const aiResult = await applyAILabels(email, rules);
      allLabels.push(...aiResult.labels);
    }

    // Add processed label
    allLabels.push(config.processedLabel);

    // Apply labels to Gmail
    if (allLabels.length > 0) {
      if (config.dryRun) {
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
