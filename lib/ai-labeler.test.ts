import { test, expect, describe } from 'bun:test';
import { hasUnsubscribeLink, buildClassificationPrompt } from './ai-labeler';
import type { Email, LabelRule } from './types';

describe('hasUnsubscribeLink', () => {
  const createEmail = (body: string, snippet: string = ''): Email => ({
    id: 'test-id',
    threadId: 'test-thread',
    from: 'test@example.com',
    fromAddress: 'test@example.com',
    fromDomain: 'example.com',
    to: [],
    toAddresses: [],
    toDomains: [],
    subject: 'Test Subject',
    body,
    snippet,
    receivedDate: new Date(),
    labels: [],
  });

  test('should detect "unsubscribe" in body', () => {
    const email = createEmail('Click here to unsubscribe from our emails');
    expect(hasUnsubscribeLink(email)).toBe(true);
  });

  test('should detect "unsubscribe" in snippet', () => {
    const email = createEmail('', 'To unsubscribe click here');
    expect(hasUnsubscribeLink(email)).toBe(true);
  });

  test('should detect case-insensitive unsubscribe', () => {
    const email = createEmail('UNSUBSCRIBE from our list');
    expect(hasUnsubscribeLink(email)).toBe(true);
  });

  test('should detect "opt-out" variations', () => {
    expect(hasUnsubscribeLink(createEmail('Click to opt-out'))).toBe(true);
    expect(hasUnsubscribeLink(createEmail('Click to opt out'))).toBe(true);
    expect(hasUnsubscribeLink(createEmail('Click to opt-out here'))).toBe(true);
  });

  test('should detect "remove me"', () => {
    expect(hasUnsubscribeLink(createEmail('Please remove me from your list'))).toBe(true);
  });

  test('should detect "unsub" abbreviation', () => {
    expect(hasUnsubscribeLink(createEmail('Click to unsub'))).toBe(true);
  });

  test('should detect "email preferences"', () => {
    expect(hasUnsubscribeLink(createEmail('Manage your email preferences'))).toBe(true);
  });

  test('should detect "manage subscription"', () => {
    // Pattern requires "manage" followed by whitespace then "subscription" (no words in between)
    expect(hasUnsubscribeLink(createEmail('Manage subscription here'))).toBe(true);
    expect(hasUnsubscribeLink(createEmail('manage  subscription'))).toBe(true);
  });

  test('should detect "subscription preferences"', () => {
    expect(hasUnsubscribeLink(createEmail('Update subscription preferences'))).toBe(true);
  });

  test('should detect "preference center"', () => {
    expect(hasUnsubscribeLink(createEmail('Visit our preference center'))).toBe(true);
  });

  test('should detect unsubscribe URLs', () => {
    expect(hasUnsubscribeLink(createEmail('https://example.com/unsubscribe'))).toBe(true);
    expect(hasUnsubscribeLink(createEmail('http://example.com/unsubscribe?id=123'))).toBe(true);
    expect(hasUnsubscribeLink(createEmail('Visit https://example.com/preferences'))).toBe(true);
    expect(hasUnsubscribeLink(createEmail('http://example.com/opt-out'))).toBe(true);
  });

  test('should return false when no unsubscribe link present', () => {
    // Note: Must avoid words like "unsubscribe", "subscription", etc. in the test text
    const email = createEmail('This is a regular email with no special links');
    expect(hasUnsubscribeLink(email)).toBe(false);
  });

  test('should return false for empty email', () => {
    const email = createEmail('', '');
    expect(hasUnsubscribeLink(email)).toBe(false);
  });

  test('should detect unsubscribe in mixed case', () => {
    expect(hasUnsubscribeLink(createEmail('UnSuBsCrIbE from our list'))).toBe(true);
  });
});

describe('buildClassificationPrompt', () => {
  const createEmail = (subject: string, body: string, snippet: string = ''): Email => ({
    id: 'test-id',
    threadId: 'test-thread',
    from: 'test@example.com',
    fromAddress: 'test@example.com',
    fromDomain: 'example.com',
    to: [],
    toAddresses: [],
    toDomains: [],
    subject,
    body,
    snippet,
    receivedDate: new Date(),
    labels: [],
  });

  const createRule = (label: string, prompt: string): LabelRule => ({
    label,
    prompt,
  });

  test('should include email subject and body', () => {
    const email = createEmail('Test Subject', 'Test body content');
    const rule = createRule('TestLabel', 'Test prompt');
    const result = buildClassificationPrompt(email, rule);

    expect(result).toContain('Test Subject');
    expect(result).toContain('Test body content');
  });

  test('should use snippet when body is empty', () => {
    const email = createEmail('Test Subject', '', 'Test snippet');
    const rule = createRule('TestLabel', 'Test prompt');
    const result = buildClassificationPrompt(email, rule);

    expect(result).toContain('Test Subject');
    expect(result).toContain('Test snippet');
  });

  test('should include rule label and prompt', () => {
    const email = createEmail('Test Subject', 'Test body');
    const rule = createRule('JobApplication', 'Emails about job applications');
    const result = buildClassificationPrompt(email, rule);

    expect(result).toContain('Label: JobApplication');
    expect(result).toContain('Description: Emails about job applications');
  });

  test('should include strict matching instructions', () => {
    const email = createEmail('Test', 'Test');
    const rule = createRule('Test', 'Test');
    const result = buildClassificationPrompt(email, rule);

    expect(result).toContain('VERY conservative');
    expect(result).toContain('CLEARLY and EXACTLY match');
    expect(result).toContain('match: "no"');
    expect(result).toContain('match: "yes"');
  });

  test('should include JSON format instructions', () => {
    const email = createEmail('Test', 'Test');
    const rule = createRule('Test', 'Test');
    const result = buildClassificationPrompt(email, rule);

    expect(result).toContain('valid JSON only');
    expect(result).toContain('"match"');
    expect(result).toContain('"reason"');
  });

  test('should format email content correctly', () => {
    const email = createEmail('Subject Line', 'Body content here');
    const rule = createRule('Label', 'Prompt');
    const result = buildClassificationPrompt(email, rule);

    // Should have subject and body separated by newlines
    const emailSection = result.match(/Email:\s*(.+?)(?=\n\nRule:)/s)?.[1];
    expect(emailSection).toContain('Subject Line');
    expect(emailSection).toContain('Body content here');
  });

  test('should handle special characters in email content', () => {
    const email = createEmail('Subject with "quotes"', 'Body with <tags> and & symbols');
    const rule = createRule('Label', 'Prompt');
    const result = buildClassificationPrompt(email, rule);

    expect(result).toContain('Subject with "quotes"');
    expect(result).toContain('Body with <tags> and & symbols');
  });

  test('should handle empty subject', () => {
    const email = createEmail('', 'Body only');
    const rule = createRule('Label', 'Prompt');
    const result = buildClassificationPrompt(email, rule);

    expect(result).toContain('Body only');
  });

  test('should handle multiline body', () => {
    const email = createEmail('Subject', 'Line 1\nLine 2\nLine 3');
    const rule = createRule('Label', 'Prompt');
    const result = buildClassificationPrompt(email, rule);

    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
  });
});
