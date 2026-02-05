import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { getAppBaseUrl } from './app-url';
import type { Email } from './types';
import { withRetry } from './retry';

let oauth2Client: OAuth2Client | null = null;

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Initialize Gmail OAuth client
 */
export async function initializeGmail(config: GmailConfig): Promise<void> {
  oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    `${getAppBaseUrl()}/api/auth/gmail/callback`
  );

  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });

  // Test the token by attempting to get an access token
  try {
    await oauth2Client.getAccessToken();
    console.log('[Gmail] OAuth client initialized and token validated');
  } catch (error: any) {
    if (error.message?.includes('invalid_grant')) {
      throw new Error(
        '❌ Invalid refresh token!\n\n' +
        'The refresh token is expired, revoked, or doesn\'t match your OAuth credentials.\n\n' +
        'To fix this:\n' +
        '1. Make sure the client_id and client_secret in google_creds.json match the ones used to generate the token\n' +
        '2. Regenerate the refresh token by running: bun run scripts/get-refresh-token.ts\n' +
        '3. Update the token in AWS Secrets Manager with the new value\n\n' +
        `Original error: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Get the OAuth client (must call initializeGmail first)
 */
function getClient(): OAuth2Client {
  if (!oauth2Client) {
    throw new Error('Gmail not initialized. Call initializeGmail first.');
  }
  return oauth2Client;
}

/**
 * Get Gmail API instance (must call initializeGmail first). For use in scripts.
 */
export function getGmailApi(): ReturnType<typeof google.gmail> {
  return google.gmail({ version: 'v1', auth: getClient() });
}

function isRetryableGmailError(error: unknown): boolean {
  const msg = error && (error as { message?: string }).message;
  return typeof msg !== 'string' || !msg.includes('invalid_grant');
}

const INVALID_GRANT_MESSAGE =
  '❌ Invalid refresh token!\n\n' +
  'The refresh token is expired, revoked, or doesn\'t match your OAuth credentials.\n\n' +
  'To fix this:\n' +
  '1. Make sure the client_id and client_secret in google_creds.json match the ones used to generate the token\n' +
  '2. Regenerate the refresh token by running: bun run scripts/get-refresh-token.ts\n' +
  '3. Update the token in AWS Secrets Manager with the new value';

async function queryEmails(
  gmail: ReturnType<typeof google.gmail>,
  query: string,
  maxResults: number,
  quiet: boolean,
  includeSpamTrash?: boolean
): Promise<string[]> {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
    ...(includeSpamTrash === true && { includeSpamTrash: true }),
  });
  const messageIds = response.data.messages?.map(m => m.id!) || [];
  if (!quiet) {
    console.log(`[Gmail] Found ${messageIds.length} emails matching: ${query}`);
  }
  return messageIds;
}

/**
 * Search for emails matching a query.
 * When includeSpamTrash is true, results include messages in SPAM and TRASH (Gmail API default is to exclude them).
 */
export async function searchEmails(
  query: string,
  maxResults: number = 50,
  quiet: boolean = false,
  includeSpamTrash?: boolean
): Promise<string[]> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  try {
    return await withRetry(
      () => queryEmails(gmail, query, maxResults, quiet, includeSpamTrash),
      { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
    );
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err.message?.includes('invalid_grant')) {
      throw new Error(INVALID_GRANT_MESSAGE);
    }
    console.error('[Gmail] Error searching emails:', error);
    throw error;
  }
}

/**
 * Check if we've received emails from a specific domain (excluding current email)
 */
export async function hasReceivedFromDomain(domain: string, excludeEmailId?: string): Promise<boolean> {
  // Escape special characters in domain for Gmail search
  const escapedDomain = domain.replace(/[()]/g, '');
  const query = `from:${escapedDomain}`;
  // Search for 2 results to check if there are others besides the current email
  const results = await searchEmails(query, 2, true); // quiet mode
  
  if (results.length === 0) {
    return false;
  }
  
  // If we're excluding the current email, check if there are other results
  if (excludeEmailId) {
    // If we have 2+ results, we've definitely seen this domain before
    if (results.length > 1) {
      return true;
    }
    // If we have 1 result and it's not the current email, we've seen it before
    return results[0] !== excludeEmailId;
  }
  
  // If not excluding, any result means we've seen it
  return true;
}

/**
 * Check if we've received emails from a specific address (excluding current email)
 */
export async function hasReceivedFromAddress(address: string, excludeEmailId?: string): Promise<boolean> {
  // Escape special characters in address for Gmail search
  const escapedAddress = address.replace(/[()]/g, '');
  const query = `from:${escapedAddress}`;
  // Search for 2 results to check if there are others besides the current email
  const results = await searchEmails(query, 2, true); // quiet mode
  
  if (results.length === 0) {
    return false;
  }
  
  // If we're excluding the current email, check if there are other results
  if (excludeEmailId) {
    // If we have 2+ results, we've definitely seen this address before
    if (results.length > 1) {
      return true;
    }
    // If we have 1 result and it's not the current email, we've seen it before
    return results[0] !== excludeEmailId;
  }
  
  // If not excluding, any result means we've seen it
  return true;
}

/**
 * Check if we've sent emails to a specific domain
 */
export async function hasSentToDomain(domain: string): Promise<boolean> {
  // Escape special characters in domain for Gmail search
  const escapedDomain = domain.replace(/[()]/g, '');
  const query = `to:${escapedDomain} in:sent`;
  const results = await searchEmails(query, 1, true); // quiet mode
  return results.length > 0;
}

/**
 * Check if we've sent emails to a specific address
 */
export async function hasSentToAddress(address: string): Promise<boolean> {
  // Escape special characters in address for Gmail search
  const escapedAddress = address.replace(/[()]/g, '');
  const query = `to:${escapedAddress} in:sent`;
  const results = await searchEmails(query, 1, true); // quiet mode
  return results.length > 0;
}

async function getEmailCore(gmail: ReturnType<typeof google.gmail>, messageId: string): Promise<Email> {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  const message = response.data;
  const headers = message.payload?.headers || [];
  const getHeader = (name: string): string => {
    const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
    return header?.value || '';
  };
  const fromHeader = getHeader('From');
  const fromMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
  const fromAddress = fromMatch ? fromMatch[1] : fromHeader;
  const fromDomain = fromAddress.split('@')[1] || '';
  const toHeader = getHeader('To');
  const toAddresses = toHeader.match(/[^\s,<]+@[^\s,>]+/g) || [];
  const toDomains = [...new Set(toAddresses.map(addr => addr.split('@')[1]))];
  let body = '';
  const getBody = (part: any): void => {
    if (part.body?.data) {
      body += Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    if (part.parts) {
      part.parts.forEach(getBody);
    }
  };
  if (message.payload) {
    getBody(message.payload);
  }
  return {
    id: message.id!,
    threadId: message.threadId!,
    from: fromHeader,
    fromAddress,
    fromDomain,
    to: toAddresses,
    toAddresses,
    toDomains,
    subject: getHeader('Subject'),
    body: body || '',
    snippet: message.snippet || '',
    receivedDate: new Date(parseInt(message.internalDate || '0')),
    labels: message.labelIds || [],
  };
}

/**
 * Get full email details
 */
export async function getEmail(messageId: string): Promise<Email> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  return withRetry(
    () => getEmailCore(gmail, messageId),
    { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
  );
}

export interface EmailWithHeaders {
  email: Email;
  headers: Array<{ name: string; value: string }>;
}

async function getEmailWithHeadersCore(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string
): Promise<EmailWithHeaders> {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  const message = response.data;
  const rawHeaders = message.payload?.headers || [];
  const headers = rawHeaders.map(h => ({
    name: h.name || '',
    value: h.value || '',
  }));
  const getHeader = (name: string): string => {
    const header = rawHeaders.find(h => h.name?.toLowerCase() === name.toLowerCase());
    return header?.value || '';
  };
  const fromHeader = getHeader('From');
  const fromMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
  const fromAddress = fromMatch ? fromMatch[1] : fromHeader;
  const fromDomain = fromAddress.split('@')[1] || '';
  const toHeader = getHeader('To');
  const toAddresses = toHeader.match(/[^\s,<]+@[^\s,>]+/g) || [];
  const toDomains = [...new Set(toAddresses.map(addr => addr.split('@')[1]))];
  let body = '';
  const getBody = (part: any): void => {
    if (part.body?.data) {
      body += Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    if (part.parts) {
      part.parts.forEach(getBody);
    }
  };
  if (message.payload) {
    getBody(message.payload);
  }
  const email: Email = {
    id: message.id!,
    threadId: message.threadId!,
    from: fromHeader,
    fromAddress,
    fromDomain,
    to: toAddresses,
    toAddresses,
    toDomains,
    subject: getHeader('Subject'),
    body: body || '',
    snippet: message.snippet || '',
    receivedDate: new Date(parseInt(message.internalDate || '0')),
    labels: message.labelIds || [],
  };
  return { email, headers };
}

/**
 * Get full email details plus raw headers (e.g. Received, Reply-To)
 */
export async function getEmailWithHeaders(messageId: string): Promise<EmailWithHeaders> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  return withRetry(
    () => getEmailWithHeadersCore(gmail, messageId),
    { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
  );
}

/**
 * Get all From addresses that appear in a thread (for "same chain as someone I've emailed")
 */
export async function getThreadFromAddresses(threadId: string): Promise<string[]> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  const response = await withRetry(
    () =>
      gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      }),
    { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
  );
  const messages = response.data.messages || [];
  const addresses = new Set<string>();
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
    const match = fromHeader.match(/<(.+?)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
    if (match) {
      addresses.add(match[1].trim().toLowerCase());
    }
  }
  return [...addresses];
}

/** Gmail filter criteria (subset we use for matching). */
export interface GmailFilterCriteria {
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  query?: string | null;
  hasAttachment?: boolean | null;
}

/** Gmail filter action (subset we use). */
export interface GmailFilterAction {
  addLabelIds?: string[] | null;
  removeLabelIds?: string[] | null;
}

/** Single Gmail filter (from users.settings.filters.list). */
export interface GmailFilter {
  id?: string | null;
  criteria?: GmailFilterCriteria | null;
  action?: GmailFilterAction | null;
}

/**
 * List all Gmail filters for the authenticated user.
 * Requires scope that includes filters (e.g. gmail.settings.basic or gmail.modify).
 */
export async function listGmailFilters(): Promise<GmailFilter[]> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  const response = await withRetry(
    () => gmail.users.settings.filters.list({ userId: 'me' }),
    { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
  );
  return response.data.filter ?? [];
}

async function applyLabelsCore(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string,
  labelNames: string[]
): Promise<void> {
  const labelIds: string[] = [];
  for (const labelName of labelNames) {
    const labelId = await getOrCreateLabel(labelName);
    labelIds.push(labelId);
  }
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: labelIds },
  });
  console.log(`[Gmail] Applied labels to ${messageId}:`, labelNames);
}

/**
 * Apply labels to an email
 */
export async function applyLabels(messageId: string, labelNames: string[]): Promise<void> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  return withRetry(
    () => applyLabelsCore(gmail, messageId, labelNames),
    { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
  );
}

/**
 * Apply label IDs to an email (e.g. from a Gmail filter action).
 * Use this when you already have label IDs (e.g. IMPORTANT, Label_123).
 */
export async function applyLabelIds(
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[] = []
): Promise<void> {
  if (addLabelIds.length === 0 && removeLabelIds.length === 0) return;
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  await withRetry(
    () =>
      gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          ...(addLabelIds.length > 0 && { addLabelIds }),
          ...(removeLabelIds.length > 0 && { removeLabelIds }),
        },
      }),
    { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
  );
  if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
    console.log(`[Gmail] Applied label IDs to ${messageId}: add=${addLabelIds.join(',')} remove=${removeLabelIds.join(',')}`);
  }
}

/**
 * Check if the user has ever starred any email to or from the given address.
 */
export async function hasStarredEmailToOrFrom(address: string): Promise<boolean> {
  const escaped = address.replace(/"/g, '\\"');
  const query = `is:starred (from:"${escaped}" OR to:"${escaped}")`;
  const ids = await searchEmails(query, 1, true);
  return ids.length > 0;
}

function normalizeLabel(name: string): string {
  // Gmail treats hyphens and spaces as equivalent for conflict detection
  return name.trim().toLowerCase().replace(/[-\s]+/g, ' ');
}

function findLabelByName(labels: { id?: string | null; name?: string | null }[], labelName: string) {
  const normalized = normalizeLabel(labelName);
  return labels.find(l => normalizeLabel(l.name ?? '') === normalized) ?? null;
}

async function getOrCreateLabelCore(
  gmail: ReturnType<typeof google.gmail>,
  labelName: string
): Promise<string> {
  const response = await gmail.users.labels.list({ userId: 'me' });
  const labels = response.data.labels || [];
  const existingLabel = findLabelByName(labels, labelName);
  if (existingLabel) {
    return existingLabel.id!;
  }
  try {
    const createResponse = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    console.log(`[Gmail] Created new label: ${labelName}`);
    return createResponse.data.id!;
  } catch (err: unknown) {
    const code = (err as { code?: number; status?: number }).code ?? (err as { code?: number; status?: number }).status;
    if (code === 409) {
      const retryResponse = await gmail.users.labels.list({ userId: 'me' });
      const retryLabels = retryResponse.data.labels || [];
      const found = findLabelByName(retryLabels, labelName);
      if (found?.id) return found.id;
    }
    throw err;
  }
}

/**
 * Get or create a Gmail label
 */
async function getOrCreateLabel(labelName: string): Promise<string> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  try {
    return await withRetry(
      () => getOrCreateLabelCore(gmail, labelName),
      { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
    );
  } catch (error) {
    console.error(`[Gmail] Error getting/creating label ${labelName}:`, error);
    throw error;
  }
}

async function getSentMessageIdsCore(gmail: ReturnType<typeof google.gmail>): Promise<string[]> {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:sent',
    maxResults: 500,
  });
  return response.data.messages?.map(m => m.id!) || [];
}

/**
 * Get all sent message IDs (for history tracking)
 */
export async function getSentMessageIds(): Promise<string[]> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });
  return withRetry(
    () => getSentMessageIdsCore(gmail),
    { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 10000, isRetryable: isRetryableGmailError }
  );
}

/**
 * Build email history from Gmail
 */
export async function buildEmailHistory(): Promise<{
  seenSenderDomains: Set<string>;
  seenSenderAddresses: Set<string>;
  sentDomains: Set<string>;
  sentAddresses: Set<string>;
}> {
  console.log('[Gmail] Building email history...');

  const history = {
    seenSenderDomains: new Set<string>(),
    seenSenderAddresses: new Set<string>(),
    sentDomains: new Set<string>(),
    sentAddresses: new Set<string>(),
  };

  try {
    // Get all received emails (last 1000)
    const receivedIds = await searchEmails('in:inbox OR in:all', 1000);
    console.log(`[Gmail] Processing ${receivedIds.length} received emails for history...`);

    for (const id of receivedIds) {
      try {
        const email = await getEmail(id);
        history.seenSenderDomains.add(email.fromDomain);
        history.seenSenderAddresses.add(email.fromAddress);
      } catch (error) {
        console.error(`[Gmail] Error processing email ${id} for history:`, error);
      }
    }

    // Get all sent emails
    const sentIds = await getSentMessageIds();
    console.log(`[Gmail] Processing ${sentIds.length} sent emails for history...`);

    for (const id of sentIds) {
      try {
        const email = await getEmail(id);
        email.toDomains.forEach(d => history.sentDomains.add(d));
        email.toAddresses.forEach(a => history.sentAddresses.add(a));
      } catch (error) {
        console.error(`[Gmail] Error processing sent email ${id} for history:`, error);
      }
    }

    console.log('[Gmail] Email history built:', {
      seenDomains: history.seenSenderDomains.size,
      seenAddresses: history.seenSenderAddresses.size,
      sentDomains: history.sentDomains.size,
      sentAddresses: history.sentAddresses.size,
    });

    return history;
  } catch (error) {
    console.error('[Gmail] Error building email history:', error);
    throw error;
  }
}

if (require.main === module) {
  (async () => {
    // Load env vars
    const dotenv = await import('dotenv');
    dotenv.config();

    const clientId = process.env.RYAN_GMAIL_CLIENT_ID;
    const clientSecret = process.env.RYAN_GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.RYAN_GMAIL_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.error('Missing required env vars: RYAN_GMAIL_CLIENT_ID, RYAN_GMAIL_CLIENT_SECRET, RYAN_GMAIL_REFRESH_TOKEN');
      process.exit(1);
    }

    // Initialize FIRST, then get client
    await initializeGmail({ clientId, clientSecret, refreshToken });

    const client = getClient();
    const gmail = google.gmail({ version: 'v1', auth: client });

    try {
      const label = await getOrCreateLabelCore(gmail, 'Has-Unsubscribe');
      console.log('Label ID:', label);
    } catch (err) {
      console.error('Error:', err);
    }
  })();
}