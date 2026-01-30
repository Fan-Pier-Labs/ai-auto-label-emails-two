import { test, expect, describe } from 'bun:test';
import { extractSpreadsheetId, parseDeterministicRulesFromRows } from './sheets';

describe('extractSpreadsheetId', () => {
  test('should return ID when given just an ID', () => {
    const id = '1a2b3c4d5e6f7g8h9i0j';
    expect(extractSpreadsheetId(id)).toBe(id);
  });

  test('should extract ID from full Google Sheets URL', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/edit';
    expect(extractSpreadsheetId(url)).toBe('1a2b3c4d5e6f7g8h9i0j');
  });

  test('should extract ID from URL with view parameter', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/view';
    expect(extractSpreadsheetId(url)).toBe('1a2b3c4d5e6f7g8h9i0j');
  });

  test('should extract ID from URL with query parameters', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/edit?usp=sharing';
    expect(extractSpreadsheetId(url)).toBe('1a2b3c4d5e6f7g8h9i0j');
  });

  test('should extract ID from URL with hash', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j/edit#gid=0';
    expect(extractSpreadsheetId(url)).toBe('1a2b3c4d5e6f7g8h9i0j');
  });

  test('should handle IDs with hyphens and underscores', () => {
    const id = '1a2b-3c4d_5e6f-7g8h';
    expect(extractSpreadsheetId(id)).toBe(id);
    
    const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    expect(extractSpreadsheetId(url)).toBe(id);
  });

  test('should throw error for invalid URL format', () => {
    // Note: extractSpreadsheetId only throws if URL has /d/ but no ID, or if it's a URL without /d/
    expect(() => extractSpreadsheetId('https://example.com')).toThrow();
    expect(() => extractSpreadsheetId('https://docs.google.com/spreadsheets/')).toThrow();
    // "not-a-valid-url" without / or :// is treated as an ID, so it doesn't throw
    expect(extractSpreadsheetId('not-a-valid-url')).toBe('not-a-valid-url');
  });

  test('should handle URL without /d/ path', () => {
    expect(() => extractSpreadsheetId('https://docs.google.com/spreadsheets/')).toThrow();
  });
});

describe('parseDeterministicRulesFromRows (columns F,G,H)', () => {
  test('should parse rows with non-empty label and prompt only', () => {
    const lines = [
      'Label Name,Label Prompt,,,Enabled?,label name,AI Prompt',
      'Job,Prompt here,,,yes,likely-scam,can it be a scam domain?',
      'Other,Other prompt,,,no,phishing-risk,is this a phishing risk?',
    ];
    const rules = parseDeterministicRulesFromRows(lines);
    expect(rules.length).toBe(2);
    const scam = rules.find(r => r.label === 'likely-scam');
    const phishing = rules.find(r => r.label === 'phishing-risk');
    expect(scam).toEqual({ label: 'likely-scam', enabled: true, prompt: 'can it be a scam domain?' });
    expect(phishing).toEqual({ label: 'phishing-risk', enabled: false, prompt: 'is this a phishing risk?' });
  });

  test('should skip rows with empty prompt or empty label', () => {
    const lines = [
      'Label Name,Label Prompt,,,Enabled?,label name,AI Prompt',
      'Job,Prompt here,,,yes,my-label,prompt here',
      'Other,,,no,,',
      'Third,,,yes,,has prompt but no label',
      'Fourth,,,yes,label only,',
    ];
    const rules = parseDeterministicRulesFromRows(lines);
    expect(rules.length).toBe(1);
    expect(rules[0]).toEqual({ label: 'my-label', enabled: true, prompt: 'prompt here' });
  });
});
