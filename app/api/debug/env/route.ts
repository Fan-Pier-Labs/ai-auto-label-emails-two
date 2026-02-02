import { NextResponse } from 'next/server';

/**
 * GET /api/debug/env
 * Returns public (non-sensitive) environment variables for debugging.
 * Does NOT expose secrets like API keys, tokens, or credentials.
 */
export async function GET() {
  const publicEnv = {
    // App configuration
    NODE_ENV: process.env.NODE_ENV,
    NEXT_APP_URL: process.env.NEXT_APP_URL,
    PORT: process.env.PORT,
    
    // Processing configuration
    POLL_INTERVAL_MINUTES: process.env.POLL_INTERVAL_MINUTES,
    PROCESSED_LABEL: process.env.PROCESSED_LABEL,
    DRY_RUN: process.env.DRY_RUN,
    
    // Public URLs (no secrets)
    NEXT_TEMPLATE_SHEET_URL: process.env.NEXT_TEMPLATE_SHEET_URL,
    GOOGLE_SHEETS_URL: process.env.GOOGLE_SHEETS_URL ? '[SET]' : undefined,
    
    // Sentry (DSN is public, not a secret)
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    
    // Indicate if secrets are set (without revealing values)
    secrets_configured: {
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      GMAIL_CLIENT_ID: !!process.env.GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET: !!process.env.GMAIL_CLIENT_SECRET,
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_METADATA_ENCRYPTION_KEY: !!process.env.STRIPE_METADATA_ENCRYPTION_KEY,
      REDIS_URL: !!process.env.REDIS_URL,
    },
  };

  return NextResponse.json(publicEnv, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
