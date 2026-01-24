import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/aFafZi8IV8wpgd742E5gc07';

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
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(
        new URL('/?error=oauth_denied', request.url)
      );
    }

    // Verify state token
    const storedState = request.cookies.get('oauth_state')?.value;
    if (!state || !storedState || state !== storedState) {
      console.error('Invalid state token');
      return NextResponse.redirect(
        new URL('/?error=invalid_state', request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/?error=no_code', request.url)
      );
    }

    const { clientId, clientSecret } = getOAuthCredentials();

    // Get the base URL for the callback
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host') || 'localhost:3000';
    const redirectUri = `${protocol}://${host}/api/auth/gmail/callback`;

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
      return NextResponse.redirect(
        new URL('/?error=no_refresh_token', request.url)
      );
    }

    // TODO: Store the refresh token (e.g., in database, session, or pass to Stripe)
    // For now, we'll just redirect to Stripe
    // You may want to store the token before redirecting
    
    // Clear the state cookie
    const response = NextResponse.redirect(STRIPE_CHECKOUT_URL);
    response.cookies.delete('oauth_state');

    // Optionally store refresh token in a secure cookie or session
    // Note: In production, you should store this in a database associated with the user
    // For now, we'll pass it as a query param to Stripe (not recommended for production)
    // Better approach: Store in database, associate with Stripe customer ID after payment
    
    return response;
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    return NextResponse.redirect(
      new URL('/?error=oauth_failed', request.url)
    );
  }
}
