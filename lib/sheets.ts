import type { LabelRule } from './types';

export async function fetchRulesFromSheet(spreadsheetId: string): Promise<LabelRule[]> {
  try {
    // Google Sheets CSV export URL
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
    
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
    }
    
    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    const rules: LabelRule[] = [];
    
    // Skip header row and parse each line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Simple CSV parsing (handles basic cases)
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
  } catch (error) {
    console.error('[Sheets] Error fetching rules:', error);
    throw error;
  }
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
