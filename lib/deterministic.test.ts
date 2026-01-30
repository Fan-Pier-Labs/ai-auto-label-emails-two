import { test, expect, describe } from 'bun:test';
import {
  getBaseDomain,
  categorizeSMTPProvider,
  applyDeterministicLabels,
} from './deterministic';
import type { Email } from './types';

/**
 * Local tests - these don't hit the network and should work 100% of the time.
 * Run with: bun test
 *
 * Network-dependent tests are in deterministic.network.test.ts
 * Run network tests with: bun test:network
 */

describe('getBaseDomain', () => {
  test('returns domain unchanged for two-part domains', () => {
    expect(getBaseDomain('example.com')).toBe('example.com');
    expect(getBaseDomain('gmail.com')).toBe('gmail.com');
    expect(getBaseDomain('co.uk')).toBe('co.uk');
  });

  test('extracts base domain from subdomains', () => {
    expect(getBaseDomain('mail.example.com')).toBe('example.com');
    expect(getBaseDomain('smtp.sendgrid.net')).toBe('sendgrid.net');
    expect(getBaseDomain('sub.mail.example.com')).toBe('example.com');
  });

  test('handles single-label (no dot)', () => {
    expect(getBaseDomain('localhost')).toBe('localhost');
  });
});

describe('categorizeSMTPProvider', () => {
  test('returns null for null or empty MX records', () => {
    expect(categorizeSMTPProvider(null)).toBe(null);
    expect(categorizeSMTPProvider([])).toBe(null);
  });

  test('returns gmail for Google MX hosts', () => {
    expect(categorizeSMTPProvider(['aspmx.l.google.com'])).toBe('gmail');
    expect(categorizeSMTPProvider(['gmail-smtp-in.l.google.com'])).toBe('gmail');
    expect(categorizeSMTPProvider(['smtp.googlemail.com'])).toBe('gmail');
  });

  test('returns msft for Microsoft MX hosts', () => {
    expect(categorizeSMTPProvider(['outlook.com'])).toBe('msft');
    expect(categorizeSMTPProvider(['mail.protection.outlook.com'])).toBe('msft');
    expect(categorizeSMTPProvider(['exchange.example.com'])).toBe('msft');
  });

  test('returns automation for SES, SendGrid, Mailgun, etc.', () => {
    expect(categorizeSMTPProvider(['feedback-smtp.us-east-1.amazonses.com'])).toBe('automation');
    expect(categorizeSMTPProvider(['smtp.sendgrid.net'])).toBe('automation');
    expect(categorizeSMTPProvider(['mx.mailgun.org'])).toBe('automation');
    expect(categorizeSMTPProvider(['inbound-smtp.us-west-2.amazonaws.com'])).toBe('automation');
  });

  test('returns work-email for Zoho, Proton, Fastmail, etc.', () => {
    expect(categorizeSMTPProvider(['zoho.com'])).toBe('work-email');
    expect(categorizeSMTPProvider(['protonmail.ch'])).toBe('work-email');
    expect(categorizeSMTPProvider(['mail.protonmail.ch'])).toBe('work-email');
    expect(categorizeSMTPProvider(['mail.messagingengine.com'])).toBe('work-email');
  });

  test('returns other for uncategorized MX hosts', () => {
    expect(categorizeSMTPProvider(['inbound.unknown-provider.xyz'])).toBe('other');
    expect(categorizeSMTPProvider(['gateway.other.net'])).toBe('other');
  });

  test('checks all MX records (multiple hosts)', () => {
    expect(categorizeSMTPProvider(['backup.google.com', 'aspmx.l.google.com'])).toBe('gmail');
  });
});

describe('applyDeterministicLabels (with mocks)', () => {
  const baseEmail: Email = {
    id: 'msg-1',
    threadId: 'thread-1',
    from: 'Sender <sender@test.example.com>',
    fromAddress: 'sender@test.example.com',
    fromDomain: 'test.example.com',
    to: ['me@example.com'],
    toAddresses: ['me@example.com'],
    toDomains: ['example.com'],
    subject: 'Test',
    body: 'Body',
    snippet: 'Snippet',
    receivedDate: new Date(),
    labels: [],
  };

  test('returns check results when ruleConfigs is empty (no AI rules)', async () => {
    const { labels, results } = await applyDeterministicLabels(baseEmail, [], {
      skipHistoryRules: true,
    });

    expect(labels).toEqual([]);
    const ruleNames = results.map((r) => r.ruleName);
    expect(ruleNames).toContain('domain-down');
    expect(ruleNames).toContain('domain-redirects');
    expect(ruleNames).toContain('new-domain');
    expect(ruleNames).toContain('no-spf');
    expect(ruleNames).toContain('no-dmarc');
    expect(ruleNames).toContain('has-dkim');
    expect(ruleNames).toContain('no-txt');

    results.forEach((r) => {
      expect(r).toHaveProperty('ruleName');
      expect(r).toHaveProperty('matched');
      expect(r).toHaveProperty('reason');
      expect(typeof r.matched).toBe('boolean');
      expect(typeof r.reason).toBe('string');
    });
  });

  test('email with empty fromDomain returns no check results when skipHistoryRules is true', async () => {
    const emailNoDomain: Email = {
      ...baseEmail,
      fromDomain: '',
      fromAddress: 'user@',
    };
    const { labels, results } = await applyDeterministicLabels(emailNoDomain, [], {
      skipHistoryRules: true,
    });

    expect(labels).toEqual([]);
    expect(results).toEqual([]);
  });
});
