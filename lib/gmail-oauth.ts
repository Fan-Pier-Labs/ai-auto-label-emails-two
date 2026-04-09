import { readFileSync } from 'fs';
import { join } from 'path';

interface GoogleCreds {
  web?: { client_id: string; client_secret: string };
  installed?: { client_id: string; client_secret: string };
}

/**
 * Get Gmail OAuth client ID and secret from env or google_creds.json.
 * Used by Stripe webhook (watch setup), Gmail webhook, and renew-gmail-watches script.
 */
export function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  const envClientId = process.env.GMAIL_CLIENT_ID;
  const envClientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  try {
    const credsPath = join(process.cwd(), 'google_creds.json');
    const credsContent = readFileSync(credsPath, 'utf-8');
    const creds: GoogleCreds = JSON.parse(credsContent);
    const webCreds = creds.web || creds.installed;
    if (webCreds?.client_id && webCreds?.client_secret) {
      return {
        clientId: webCreds.client_id,
        clientSecret: webCreds.client_secret,
      };
    }
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code !== 'ENOENT') {
      console.error('Error reading google_creds.json:', err);
    }
  }

  throw new Error(
    'Gmail OAuth credentials not found. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET or add google_creds.json.'
  );
}
