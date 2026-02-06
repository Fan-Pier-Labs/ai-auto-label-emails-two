#!/usr/bin/env node
/**
 * Renew Gmail push watches for active Stripe customers.
 * Run periodically (e.g. daily or every 6 hours) via cron or Fargate.
 *
 * Requires: STRIPE_SECRET_KEY, GMAIL_PUBSUB_TOPIC, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
 * STRIPE_METADATA_ENCRYPTION_KEY (for decrypting refresh tokens).
 */
import { config } from 'dotenv';
import Stripe from 'stripe';
import { safeDecrypt } from '../lib/encryption';
import { getOAuthCredentials } from '../lib/gmail-oauth';
import { initializeGmail, setWatch } from '../lib/gmail';

config();

const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000; // Renew if expiring within 24 hours

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(secretKey, { apiVersion: '2026-01-28.clover' });
}

async function main(): Promise<void> {
  const topicName = process.env.GMAIL_PUBSUB_TOPIC?.trim();
  if (!topicName) {
    console.error('GMAIL_PUBSUB_TOPIC is not set. Skipping watch renewal.');
    process.exit(0);
  }

  const stripe = getStripe();
  const { clientId, clientSecret } = getOAuthCredentials();

  let renewed = 0;
  let skipped = 0;
  let failed = 0;

  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.customer'],
    });

    for (const sub of subscriptions.data) {
      const customer = sub.customer as Stripe.Customer | Stripe.DeletedCustomer | null;
      if (!customer || ('deleted' in customer && customer.deleted)) continue;

      const metadata = (customer.metadata || {}) as Record<string, string>;
      const refreshToken = safeDecrypt(metadata.gmail_refresh_token);
      const gmailEmail = metadata.gmail_email?.trim();

      if (!refreshToken || !gmailEmail) {
        skipped++;
        continue;
      }

      const expStr = metadata.gmail_watch_expiration;
      const expirationMs = expStr ? parseInt(expStr, 10) : 0;
      const now = Date.now();
      const needsRenewal = !expStr || isNaN(expirationMs) || expirationMs <= now + RENEW_WITHIN_MS;

      if (!needsRenewal) {
        skipped++;
        continue;
      }

      try {
        initializeGmail({ clientId, clientSecret, refreshToken });
        const { expiration } = await setWatch(topicName);
        await stripe.customers.update(customer.id, {
          metadata: {
            ...metadata,
            gmail_watch_expiration: expiration,
          },
        });
        console.log(`✅ Renewed watch for ${gmailEmail} (expires ${expiration})`);
        renewed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Failed to renew watch for ${gmailEmail}: ${msg}`);
        failed++;
      }
    }

    hasMore = subscriptions.has_more && subscriptions.data.length > 0;
    if (subscriptions.data.length > 0) {
      startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
    }
  }

  console.log(`\nRenewed: ${renewed}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
