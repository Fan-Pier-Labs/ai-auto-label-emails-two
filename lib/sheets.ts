import type { LabelRule, DeterministicRuleConfig } from './types';
import { withRetry } from './retry';

/**
 * Parse a CSV line respecting quoted fields (handles commas inside quotes).
 * Returns array of field values.
 */
function parseCsvLine(line: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      const acc: string[] = [];
      while (end < line.length) {
        if (line[end] === '"') {
          if (line[end + 1] === '"') {
            acc.push('"');
            end += 2;
          } else {
            end += 1;
            break;
          }
        } else {
          acc.push(line[end]);
          end += 1;
        }
      }
      parts.push(acc.join('').trim());
      i = end;
      if (line[i] === ',') i += 1;
    } else {
      const comma = line.indexOf(',', i);
      const slice = comma === -1 ? line.slice(i) : line.slice(i, comma);
      parts.push(slice.trim().replace(/^"|"$/g, ''));
      i = comma === -1 ? line.length : comma + 1;
    }
  }
  return parts;
}

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
    const parts = parseCsvLine(line);
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
 * Find column indices for deterministic rules (F=Enabled?, G=label name, H=AI Prompt)
 * from the header row. We locate the "Enabled?" column (F) and use F, F+1, F+2 so we
 * don't confuse column G "label name" with column A "Label Name".
 */
function findDeterministicColumnIndices(headerParts: string[]): { enabled: number; labelName: number; aiPrompt: number } {
  const lower = headerParts.map(p => p.trim().toLowerCase());
  const enabledCol = lower.findIndex(
    h => h === 'enabled?' || h === 'enabled' || h === 'enable' || h === 'active' || h === 'on'
  );
  if (enabledCol >= 0) {
    return {
      enabled: enabledCol,
      labelName: enabledCol + 1,
      aiPrompt: enabledCol + 2,
    };
  }
  return { enabled: 5, labelName: 6, aiPrompt: 7 };
}

/**
 * Parse deterministic rule config from main sheet rows (columns F, G, H).
 * F = Enabled?, G = label (any string), H = AI Prompt (required).
 * Only rows with non-empty label and prompt are included.
 * Column indices are detected from the header row.
 * Exported for tests and for parsing example CSV files.
 */
export function parseDeterministicRulesFromRows(lines: string[]): DeterministicRuleConfig[] {
  const rules: DeterministicRuleConfig[] = [];
  if (lines.length < 2) return rules;

  const headerParts = parseCsvLine(lines[0].trim());
  const cols = findDeterministicColumnIndices(headerParts);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = parseCsvLine(line);
    const enabledStr = parts[cols.enabled]?.trim().toLowerCase() ?? '';
    const label = parts[cols.labelName]?.trim() ?? '';
    const prompt = parts[cols.aiPrompt]?.trim() ?? '';

    if (!label || !prompt) continue;

    const enabled =
      enabledStr === 'true' ||
      enabledStr === 'yes' ||
      enabledStr === '1' ||
      enabledStr === 'on' ||
      enabledStr === 'y';

    rules.push({ label, enabled, prompt });
  }
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
 * Fetch deterministic rules configuration from Google Sheets.
 * Reads columns F (Enabled?), G (label), H (AI Prompt) from the main sheet
 * (same sheet as AI rules). No separate tab is used.
 * Returns parsed rows only; rows with empty label or prompt are skipped. Empty sheet returns [].
 */
export async function fetchDeterministicRulesConfig(spreadsheetId: string): Promise<DeterministicRuleConfig[]> {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

  try {
    const response = await withRetry(
      () =>
        fetch(csvUrl).then(async res => {
          if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status} ${res.statusText}`);
          return res.text();
        }),
      { maxAttempts: 2, initialDelayMs: 500, maxDelayMs: 2000 }
    );
    const lines = response.trim().split('\n');
    const rules = parseDeterministicRulesFromRows(lines);
    const enabledCount = rules.filter(r => r.enabled).length;
    console.log(`[Sheets] Loaded ${rules.length} deterministic rule configs from columns F,G,H (${enabledCount} enabled)`);
    return rules;
  } catch (error) {
    console.error('[Sheets] Error fetching deterministic rules config:', error);
    return [];
  }
}

/**
 * Get enabled deterministic rule labels as a Set for quick lookup
 */
export function getEnabledDeterministicRules(config: DeterministicRuleConfig[]): Set<string> {
  return new Set(config.filter(r => r.enabled).map(r => r.label));
}
