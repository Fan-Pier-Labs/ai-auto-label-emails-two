import { initializeGmail, searchEmails, getEmail, applyLabels } from './gmail';
import { initializeGemini, applyAILabels } from './ai-labeler';
import { applyDeterministicLabels } from './deterministic';
import { fetchRulesFromSheet, extractSpreadsheetId } from './sheets';
import type { GmailConfig } from './gmail';

export interface ProcessorConfig {
  gmail: GmailConfig;
  geminiApiKey: string;
  googleSheetsUrl?: string;
  processedLabel: string;
  dryRun: boolean;
  useInMemoryTracking?: boolean;
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

    // Fetch email
    const email = await getEmail(emailId);
    
    console.log(`\n📧 Processing: ${email.subject}`);
    console.log(`   From: ${email.from}\n`);

    const allLabels: string[] = [];

    // Apply deterministic labels (uses Gmail search, no history needed)
    console.log('Deterministic Rules:');
    const deterministicResult = await applyDeterministicLabels(email);
    allLabels.push(...deterministicResult.labels);
    
    // Display all deterministic rule results
    for (const result of deterministicResult.results) {
      const symbol = result.matched ? '✓' : 'x';
      console.log(`  [${symbol}] ${result.ruleName} - ${result.reason}`);
    }

    // Apply AI labels
    if (rules.length > 0) {
      console.log('\nAI Rules:');
      const aiResult = await applyAILabels(email, rules);
      allLabels.push(...aiResult.labels);
      
      // Display all AI rule results
      for (const result of aiResult.results) {
        const symbol = result.matched ? '✓' : 'x';
        console.log(`  [${symbol}] ${result.ruleName} - ${result.reason}`);
      }
    } else {
      console.log('\nAI Rules: (none configured)');
    }

    // Add processed label (only if not using in-memory tracking)
    if (!config.useInMemoryTracking && config.processedLabel) {
      allLabels.push(config.processedLabel);
    }

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
