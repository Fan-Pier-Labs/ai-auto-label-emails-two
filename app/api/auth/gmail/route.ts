import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

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

export async function GET(request: NextRequest) {
  try {
    const { clientId, clientSecret } = getOAuthCredentials();

    // Get the base URL for the callback
    // Use NEXT_APP_URL env var (must be set in production with https://)
    // Fallback to dynamic construction for local development
    let redirectUri: string;
    if (process.env.NEXT_APP_URL) {
      redirectUri = `${process.env.NEXT_APP_URL}/api/auth/gmail/callback`;
    } else {
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      const host = request.headers.get('host') || 'localhost:3000';
      redirectUri = `${protocol}://${host}/api/auth/gmail/callback`;
    }

    // Generate state token for CSRF protection
    const state = randomBytes(32).toString('hex');

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: state,
    });

    // Store state in a cookie (httpOnly, secure in production)
    const response = NextResponse.redirect(authUrl);
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });

    return response;
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}
