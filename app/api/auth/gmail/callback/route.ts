import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { storeRefreshToken } from '@/lib/token-store';

const SETUP_COOKIE_MAX_AGE = 30 * 60; // 30 minutes, match token store expiry

interface GoogleCreds {
  web?: {
    client_id: string;
    client_secret: string;
  };
  installed?: {
    client_id: string;
    client_secret: string;
  };
}

function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  // First try environment variables
  const envClientId = process.env.GMAIL_CLIENT_ID;
  const envClientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  // Fallback to google_creds.json
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
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('Error reading google_creds.json:', error);
    }
  }

  throw new Error('Gmail OAuth credentials not found in environment variables or google_creds.json');
}

/** Base URL for redirects (use NEXT_APP_URL in production so redirects go to the public host, not internal) */
function getBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_APP_URL) {
    return process.env.NEXT_APP_URL.replace(/\/$/, '');
  }
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);

  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(`${baseUrl}/?error=oauth_denied`);
    }

    // Verify state token
    const storedState = request.cookies.get('oauth_state')?.value;
    if (!state || !storedState || state !== storedState) {
      console.error('Invalid state token');
      return NextResponse.redirect(`${baseUrl}/?error=invalid_state`);
    }

    if (!code) {
      return NextResponse.redirect(`${baseUrl}/?error=no_code`);
    }

    const { clientId, clientSecret } = getOAuthCredentials();

    const redirectUri = `${process.env.NEXT_APP_URL || baseUrl}/api/auth/gmail/callback`;

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error('No refresh token received');
      return NextResponse.redirect(`${baseUrl}/?error=no_refresh_token`);
    }

    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);

    // Get user's email from Gmail API
    let userEmail: string | null = null;
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      userEmail = profile.data.emailAddress || null;
      
      if (userEmail) {
        // Store refresh token keyed by email
        storeRefreshToken(userEmail, tokens.refresh_token);
        console.log(`✅ Stored refresh token for: ${userEmail}`);
      } else {
        console.warn('⚠️  Could not get user email from Gmail profile');
      }
    } catch (error) {
      console.error('❌ Error getting user email from Gmail API:', error);
    }

    // Redirect to /setup so user lands on the public URL, not internal host
    const setupUrl = `${baseUrl}/setup`;
    const response = NextResponse.redirect(setupUrl);
    response.cookies.delete('oauth_state');

    if (userEmail) {
      response.cookies.set('setup_email', userEmail, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SETUP_COOKIE_MAX_AGE,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    return NextResponse.redirect(`${baseUrl}/?error=oauth_failed`);
  }
}
