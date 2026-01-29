import type { LabelRule, DeterministicRuleConfig, DeterministicRuleName } from './types';
import { withRetry } from './retry';
import { DEFAULT_DETERMINISTIC_RULES, DETERMINISTIC_RULE_NAMES } from './types';

async function fetchSheetRules(csvUrl: string): Promise<LabelRule[]> {
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  const lines = csvText.trim().split('\n');
  const rules: LabelRule[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length >= 2) {
      const label = parts[0];
      const prompt = parts[1];
      if (label && prompt) {
        rules.push({ label, prompt });
      }
    }
  }
  console.log(`[Sheets] Loaded ${rules.length} rules from spreadsheet`);
  return rules;
}

export async function fetchRulesFromSheet(spreadsheetId: string): Promise<LabelRule[]> {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  try {
    return await withRetry(() => fetchSheetRules(csvUrl), {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
    });
  } catch (error) {
    console.error('[Sheets] Error fetching rules:', error);
    throw error;
  }
}

/**
 * Fetch deterministic rule configuration from a Google Sheet
 * Expects a sheet with columns: rule_name, enabled (or similar)
 * Uses the second sheet (gid=1) by default, falls back to looking for "deterministic" in sheet name
 */
async function fetchSheetDeterministicRules(csvUrl: string): Promise<DeterministicRuleConfig[]> {
  const response = await fetch(csvUrl);
  if (!response.ok) {
    // If second sheet doesn't exist, return empty (use defaults)
    if (response.status === 400) {
      console.log('[Sheets] No deterministic rules sheet found, using defaults');
      return [];
    }
    throw new Error(`Failed to fetch deterministic rules sheet: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  const lines = csvText.trim().split('\n');
  const rules: DeterministicRuleConfig[] = [];

  // Parse header to find column indices
  if (lines.length === 0) return [];
  
  const headerLine = lines[0].toLowerCase();
  const headerParts = headerLine.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
  
  // Find columns - support various naming conventions
  let ruleNameCol = headerParts.findIndex(h => 
    h === 'rule_name' || h === 'rulename' || h === 'rule' || h === 'name'
  );
  let enabledCol = headerParts.findIndex(h => 
    h === 'enabled' || h === 'enable' || h === 'active' || h === 'on'
  );

  // If no header found, assume first two columns
  if (ruleNameCol === -1) ruleNameCol = 0;
  if (enabledCol === -1) enabledCol = 1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    const ruleName = parts[ruleNameCol]?.toLowerCase();
    const enabledStr = parts[enabledCol]?.toLowerCase();

    if (!ruleName) continue;

    // Check if this is a valid deterministic rule name
    if (!DETERMINISTIC_RULE_NAMES.includes(ruleName as DeterministicRuleName)) {
      console.log(`[Sheets] Unknown deterministic rule: ${ruleName}, skipping`);
      continue;
    }

    // Parse enabled value - support various formats
    const enabled = enabledStr === 'true' || 
                    enabledStr === 'yes' || 
                    enabledStr === '1' || 
                    enabledStr === 'on' ||
                    enabledStr === 'y';

    rules.push({ 
      ruleName: ruleName as DeterministicRuleName, 
      enabled 
    });
  }

  console.log(`[Sheets] Loaded ${rules.length} deterministic rule configs from spreadsheet`);
  return rules;
}

/**
 * Extract spreadsheet ID from a Google Sheets URL or return the ID if already provided
 */
export function extractSpreadsheetId(urlOrId: string): string {
  // If it's already just an ID (no slashes or protocol), return as-is
  if (!urlOrId.includes('/') && !urlOrId.includes('://')) {
    return urlOrId;
  }

  // Try to extract ID from URL
  // Pattern: /d/SPREADSHEET_ID/ or /d/SPREADSHEET_ID? or /d/SPREADSHEET_ID#
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }

  // If we can't parse it, throw an error
  throw new Error(
    `Invalid Google Sheets URL or ID: ${urlOrId}\n` +
    `Expected format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit or just SPREADSHEET_ID`
  );
}

/**
 * Fetch deterministic rules configuration from Google Sheets
 * Uses the second sheet (gid=1) to read rule enable/disable settings
 * Returns array of DeterministicRuleConfig with merged defaults
 */
export async function fetchDeterministicRulesConfig(spreadsheetId: string): Promise<DeterministicRuleConfig[]> {
  // Fetch from second sheet (gid=1) - deterministic rules config
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=1`;
  
  try {
    const rules = await withRetry(() => fetchSheetDeterministicRules(csvUrl), {
      maxAttempts: 2,
      initialDelayMs: 500,
      maxDelayMs: 2000,
    });

    // Merge with defaults - sheet values override defaults
    const result: DeterministicRuleConfig[] = [];
    for (const ruleName of DETERMINISTIC_RULE_NAMES) {
      const sheetRule = rules.find(r => r.ruleName === ruleName);
      const enabled = sheetRule !== undefined 
        ? sheetRule.enabled 
        : DEFAULT_DETERMINISTIC_RULES[ruleName];
      result.push({ ruleName, enabled });
    }
    
    return result;
  } catch (error) {
    console.error('[Sheets] Error fetching deterministic rules config:', error);
    // Return defaults on error
    return DETERMINISTIC_RULE_NAMES.map(ruleName => ({
      ruleName,
      enabled: DEFAULT_DETERMINISTIC_RULES[ruleName],
    }));
  }
}

/**
 * Get enabled deterministic rule names as a Set for quick lookup
 */
export function getEnabledDeterministicRules(config: DeterministicRuleConfig[]): Set<string> {
  return new Set(config.filter(r => r.enabled).map(r => r.ruleName));
}
