import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { Email } from './types';

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
    'http://localhost:8080'
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
 * Search for emails matching a query
 */
export async function searchEmails(query: string, maxResults: number = 50, quiet: boolean = false): Promise<string[]> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const messageIds = response.data.messages?.map(m => m.id!) || [];
    if (!quiet) {
      console.log(`[Gmail] Found ${messageIds.length} emails matching: ${query}`);
    }
    return messageIds;
  } catch (error: any) {
    if (error.message?.includes('invalid_grant')) {
      throw new Error(
        '❌ Invalid refresh token!\n\n' +
        'The refresh token is expired, revoked, or doesn\'t match your OAuth credentials.\n\n' +
        'To fix this:\n' +
        '1. Make sure the client_id and client_secret in google_creds.json match the ones used to generate the token\n' +
        '2. Regenerate the refresh token by running: bun run scripts/get-refresh-token.ts\n' +
        '3. Update the token in AWS Secrets Manager with the new value'
      );
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

/**
 * Get full email details
 */
export async function getEmail(messageId: string): Promise<Email> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
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

    // Parse From header
    const fromHeader = getHeader('From');
    const fromMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
    const fromAddress = fromMatch ? fromMatch[1] : fromHeader;
    const fromDomain = fromAddress.split('@')[1] || '';

    // Parse To header
    const toHeader = getHeader('To');
    const toAddresses = toHeader.match(/[^\s,<]+@[^\s,>]+/g) || [];
    const toDomains = [...new Set(toAddresses.map(addr => addr.split('@')[1]))];

    // Get body
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

    return email;
  } catch (error) {
    console.error(`[Gmail] Error fetching email ${messageId}:`, error);
    throw error;
  }
}

/**
 * Apply labels to an email
 */
export async function applyLabels(messageId: string, labelNames: string[]): Promise<void> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    // Get or create label IDs
    const labelIds: string[] = [];
    
    for (const labelName of labelNames) {
      const labelId = await getOrCreateLabel(labelName);
      labelIds.push(labelId);
    }

    // Apply labels
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: labelIds,
      },
    });

    console.log(`[Gmail] Applied labels to ${messageId}:`, labelNames);
  } catch (error) {
    console.error(`[Gmail] Error applying labels to ${messageId}:`, error);
    throw error;
  }
}

/**
 * Get or create a Gmail label
 */
async function getOrCreateLabel(labelName: string): Promise<string> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    // List all labels
    const response = await gmail.users.labels.list({ userId: 'me' });
    const labels = response.data.labels || [];

    // Check if label exists
    const existingLabel = labels.find(l => l.name === labelName);
    if (existingLabel) {
      return existingLabel.id!;
    }

    // Create new label
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
  } catch (error) {
    console.error(`[Gmail] Error getting/creating label ${labelName}:`, error);
    throw error;
  }
}

/**
 * Get all sent message IDs (for history tracking)
 */
export async function getSentMessageIds(): Promise<string[]> {
  const client = getClient();
  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent',
      maxResults: 500,
    });

    return response.data.messages?.map(m => m.id!) || [];
  } catch (error) {
    console.error('[Gmail] Error fetching sent messages:', error);
    throw error;
  }
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
