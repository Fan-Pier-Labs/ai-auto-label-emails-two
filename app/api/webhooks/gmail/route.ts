import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getCustomerConfigByEmail } from '@/lib/stripe-customers';
import { getOAuthCredentials } from '@/lib/gmail-oauth';
import { initializeGmail, listHistory } from '@/lib/gmail';
import { getGeminiApiKey } from '@/lib/secrets';
import { processEmail } from '@/lib/processor';

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(secretKey, { apiVersion: '2026-01-28.clover' });
}

/** Decode URL-safe base64 (Pub/Sub message.data). */
function decodePubSubData(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

interface GmailNotification {
  emailAddress?: string;
  historyId?: string;
}

export async function GET(request: NextRequest) {
  const hubMode = request.nextUrl.searchParams.get('hub.mode');
  const hubChallenge = request.nextUrl.searchParams.get('hub.challenge');
  if (hubMode && hubChallenge) {
    return new NextResponse(hubChallenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Missing hub params' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body?.message;
    const rawData = message?.data;

    if (!rawData || typeof rawData !== 'string') {
      return NextResponse.json({ received: true, reason: 'no_data' });
    }

    let payload: GmailNotification;
    try {
      const decoded = decodePubSubData(rawData);
      payload = JSON.parse(decoded) as GmailNotification;
    } catch {
      return NextResponse.json({ received: true, reason: 'invalid_payload' });
    }

    const emailAddress = payload.emailAddress?.trim().toLowerCase();
    const historyId = payload.historyId;

    if (!emailAddress || !historyId) {
      return NextResponse.json({ received: true, reason: 'missing_email_or_history' });
    }

    const stripe = getStripe();
    const config = await getCustomerConfigByEmail(stripe, emailAddress);
    if (!config) {
      return NextResponse.json({ received: true, reason: 'no_customer' });
    }

    const { clientId, clientSecret } = getOAuthCredentials();
    const geminiApiKey = await getGeminiApiKey();
    const processedLabel = process.env.PROCESSED_LABEL || '__auto-processed__';

    initializeGmail({
      clientId,
      clientSecret,
      refreshToken: config.refreshToken,
    });

    let messageIds: string[];
    try {
      messageIds = await listHistory(historyId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Gmail webhook] history.list failed for ${emailAddress}:`, msg);
      return NextResponse.json({ received: true, error: 'history_failed' });
    }

    if (messageIds.length === 0) {
      return NextResponse.json({ received: true, processed: 0 });
    }

    const googleSheetsUrl = config.sheetId
      ? `https://docs.google.com/spreadsheets/d/${config.sheetId}/edit`
      : undefined;

    const processorConfig = {
      gmail: {
        clientId,
        clientSecret,
        refreshToken: config.refreshToken,
      },
      geminiApiKey,
      googleSheetsUrl,
      processedLabel,
      dryRun: false,
    };

    let processed = 0;
    for (const messageId of messageIds) {
      try {
        await processEmail(processorConfig, messageId);
        processed++;
      } catch (err) {
        console.error(`[Gmail webhook] processEmail failed for ${messageId}:`, err);
      }
    }

    return NextResponse.json({ received: true, processed });
  } catch (error) {
    console.error('[Gmail webhook] Error:', error);
    return NextResponse.json({ received: true, error: 'handler_failed' });
  }
}
