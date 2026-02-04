#!/usr/bin/env node
/**
 * Lists the last 50 emails (from inbox or spam) where Reply-To is set
 * to a different address than the sender (From). Only includes emails
 * that were sent via Gmail/Google or Microsoft infrastructure (checked
 * via Received headers / sender path), so G Suite / Google Workspace
 * (custom domain) and Microsoft 365 are included.
 *
 * Usage: bun run scripts/list-reply-to-mismatch.ts
 *
 * Requires in .env: RYAN_GMAIL_CLIENT_ID, RYAN_GMAIL_CLIENT_SECRET, RYAN_GMAIL_REFRESH_TOKEN
 */
import { config } from 'dotenv';
import { initializeGmail, getGmailApi } from '../lib/gmail';

config();

function getGmailConfig(): { clientId: string; clientSecret: string; refreshToken: string } {
  const clientId = process.env.RYAN_GMAIL_CLIENT_ID;
  const clientSecret = process.env.RYAN_GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.RYAN_GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing env: RYAN_GMAIL_CLIENT_ID, RYAN_GMAIL_CLIENT_SECRET, and RYAN_GMAIL_REFRESH_TOKEN (e.g. from bun run scripts/get-refresh-token.ts)'
    );
  }
  return { clientId, clientSecret, refreshToken };
}

/** Extract first email address from a header value (e.g. "Name <a@b.com>" or "a@b.com"). */
function extractEmail(headerValue: string): string {
  const trimmed = (headerValue || '').trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const plain = trimmed.match(/[^\s,]+@[^\s,>]+/);
  return plain ? plain[0].trim().toLowerCase() : trimmed.toLowerCase();
}

/** Known mail server hostname patterns for Google and Microsoft (Received headers). */
const SENDER_INFRA_PATTERNS = [
  /\.google\.com\b/i,
  /\.gmail\.com\b/i,
  /\.googlemail\.com\b/i,
  /\bgoogle\.com\b/i,
  /\bgmail\.com\b/i,
  /\.outlook\.com\b/i,
  /\.hotmail\.(com|co\.uk|fr|de|es|it)\b/i,
  /\.live\.(com|co\.uk|fr|nl|ie|de|es|it)\b/i,
  /\.microsoft\.com\b/i,
  /\boutlook\.com\b/i,
  /\bhotmail\.com\b/i,
  /\blive\.com\b/i,
  /\bmicrosoft\.com\b/i,
];

/**
 * Extract the "from" clause from a Received header (who delivered to this server).
 * Format is typically "from <hostname|ip> by ..." so we take the part before " by ".
 */
function getReceivedFromClause(receivedLine: string): string {
  const byIndex = receivedLine.toLowerCase().indexOf(' by ');
  if (byIndex === -1) return receivedLine;
  return receivedLine.slice(0, byIndex).trim().toLowerCase();
}

/**
 * True if the message was sent via Gmail/Google or Microsoft infrastructure.
 * We use the first Received header (the one our server added when it received
 * the message) and check only the "from" part (who delivered to us), so we
 * don't match on "by mx.google.com" — we only match when the previous hop
 * (sender's side) is Google/Microsoft.
 */
function isSentViaGmailOrMsft(receivedHeaders: string[]): boolean {
  if (receivedHeaders.length === 0) return false;
  const firstReceived = receivedHeaders[0];
  const fromClause = getReceivedFromClause(firstReceived);
  return SENDER_INFRA_PATTERNS.some((re) => re.test(fromClause));
}

interface MismatchRow {
  id: string;
  subject: string;
  from: string;
  fromAddress: string;
  replyTo: string;
  replyToAddress: string;
  date: string;
}

async function main(): Promise<void> {
  const gmailConfig = getGmailConfig();
  await initializeGmail(gmailConfig);
  const gmail = getGmailApi();

  const targetCount = 50;
  const query = 'in:inbox OR in:spam';
  const maxToScan = 500;

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: maxToScan,
  });
  const messageIds = listRes.data.messages?.map((m) => m.id!).filter(Boolean) ?? [];
  console.log(
    `Scanning ${messageIds.length} messages (${query}) for Reply-To ≠ From, sent via Gmail/Google or Microsoft...\n`
  );

  const results: MismatchRow[] = [];

  for (const id of messageIds) {
    if (results.length >= targetCount) break;
    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Reply-To', 'Subject', 'Date', 'Received'],
      });
      const headers = msgRes.data.payload?.headers ?? [];
      const getH = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
      const receivedValues = headers
        .filter((h) => h.name?.toLowerCase() === 'received')
        .map((h) => h.value ?? '');
      if (!isSentViaGmailOrMsft(receivedValues)) continue;
      const fromRaw = getH('From');
      const replyToRaw = getH('Reply-To');
      if (!replyToRaw.trim()) continue;
      const fromAddress = extractEmail(fromRaw);
      const replyToAddress = extractEmail(replyToRaw);
      if (fromAddress === replyToAddress) continue;
      const internalDate = msgRes.data.internalDate;
      const dateStr = internalDate
        ? new Date(parseInt(internalDate, 10)).toISOString()
        : getH('Date');
      results.push({
        id: id!,
        subject: getH('Subject'),
        from: fromRaw,
        fromAddress,
        replyTo: replyToRaw,
        replyToAddress,
        date: dateStr,
      });
    } catch (e) {
      console.error(`Error fetching message ${id}:`, e);
    }
  }

  console.log(`Found ${results.length} email(s) where Reply-To ≠ From (Gmail/Google or Microsoft senders):\n`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. [${r.date}] ${r.subject || '(no subject)'}`);
    console.log(`   From:     ${r.from}`);
    console.log(`   Reply-To: ${r.replyTo}`);
    console.log(`   Id: ${r.id}`);
    console.log('');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
