import { test, expect, describe } from 'bun:test';
import { extractSpreadsheetId } from './sheets';

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
