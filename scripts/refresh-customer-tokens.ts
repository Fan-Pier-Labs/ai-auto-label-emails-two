#!/usr/bin/env node
import Stripe from 'stripe';
import { google } from 'googleapis';
import { config } from 'dotenv';
import { encryptForStripe, safeDecrypt } from '../lib/encryption';
import { getOAuthCredentials } from '../lib/gmail-oauth';

// Load .env file if it exists
config();

interface RefreshResult {
  customerId: string;
  email: string;
  success: boolean;
  tokenUpdated: boolean;
  error?: string;
}

/**
 * Gets the Stripe client instance
 */
function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
  });
}

interface RefreshOptions {
  filterEmail?: string;
  limit?: number;
  dryRun?: boolean;
}

/**
 * Refresh Gmail tokens for all active Stripe customers
 * 
 * This script:
 * 1. Fetches all active subscriptions from Stripe
 * 2. For each customer with a gmail_refresh_token, attempts to refresh it
 * 3. If Google issues a NEW refresh token (token rotation), updates Stripe metadata
 * 4. Reports any invalid/expired tokens that need user re-authentication
 */
async function refreshCustomerTokens(options: RefreshOptions = {}): Promise<void> {
  const {
    filterEmail = process.env.FILTER_EMAIL,
    limit = parseInt(process.env.CUSTOMER_LIMIT || '100', 10),
    dryRun = process.env.DRY_RUN === 'true',
  } = options;

  console.log('🔄 Gmail Token Refresh - All Customers\n');
  console.log('======================================\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No tokens will be updated in Stripe\n');
  }

  const stripe = getStripe();
  const { clientId, clientSecret } = getOAuthCredentials();

  console.log('📋 Configuration:');
  console.log(`   Customer limit: ${limit}`);
  if (filterEmail) {
    console.log(`   Filter email: ${filterEmail}`);
  }
  console.log('');

  // Fetch all active subscriptions
  console.log('🔍 Fetching active subscriptions from Stripe...');

  const results: RefreshResult[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;
  let subscriptionCount = 0;

  while (hasMore && subscriptionCount < limit) {
    const subscriptions = await stripe.subscriptions.list({
      status: 'active',
      limit: Math.min(100, limit - subscriptionCount),
      starting_after: startingAfter,
      expand: ['data.customer'],
    });

    for (const subscription of subscriptions.data) {
      if (subscriptionCount >= limit) break;
      subscriptionCount++;

      // Get customer from expanded data (avoid testing expandable field for truthiness)
      const rawCustomer = subscription.customer;
      if (typeof rawCustomer !== 'object' || rawCustomer === null) {
        console.log(`\n[${subscriptionCount}] ⏭️  Skipping - customer not expanded`);
        continue;
      }
      const customer = rawCustomer as Stripe.Customer | Stripe.DeletedCustomer;
      if (customer.deleted) {
        console.log(`\n[${subscriptionCount}] ⏭️  Skipping deleted customer`);
        continue;
      }

      const customerId = customer.id;
      const metadata = customer.metadata || {};

      // Decrypt customer credentials (gmail_email is stored unencrypted)
      const encryptedRefreshToken = metadata.gmail_refresh_token;

      const refreshToken = safeDecrypt(encryptedRefreshToken);
      const customerEmail = metadata.gmail_email || customer.email || 'unknown';

      // Skip if no refresh token
      if (!refreshToken) {
        console.log(`\n[${subscriptionCount}] ⏭️  Skipping ${customerId}: No refresh token`);
        results.push({
          customerId,
          email: customerEmail,
          success: false,
          tokenUpdated: false,
          error: 'No refresh token',
        });
        continue;
      }

      // Apply email filter if specified
      if (filterEmail && customerEmail.toLowerCase() !== filterEmail.toLowerCase()) {
        continue;
      }

      console.log(`\n[${subscriptionCount}] 🔄 Refreshing token for ${customerEmail} (${customerId})`);

      try {
        // Create OAuth client and attempt refresh
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });

        // Attempt to get new access token (this validates the refresh token)
        const { credentials } = await oauth2Client.refreshAccessToken();

        // Check if Google issued a NEW refresh token (token rotation)
        if (credentials.refresh_token && credentials.refresh_token !== refreshToken) {
          console.log(`   🔑 New refresh token issued - updating Stripe...`);

          if (!dryRun) {
            await stripe.customers.update(customerId, {
              metadata: {
                gmail_refresh_token: encryptForStripe(credentials.refresh_token),
              },
            });
            console.log(`   ✅ Token updated in Stripe`);
          } else {
            console.log(`   ⚠️  [DRY RUN] Would update token in Stripe`);
          }

          results.push({
            customerId,
            email: customerEmail,
            success: true,
            tokenUpdated: true,
          });
        } else {
          console.log(`   ✅ Token is valid (no rotation needed)`);
          results.push({
            customerId,
            email: customerEmail,
            success: true,
            tokenUpdated: false,
          });
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        const isInvalidGrant = errorMessage.includes('invalid_grant');

        if (isInvalidGrant) {
          console.error(`   ❌ Token expired/revoked - user needs to re-authenticate`);
        } else {
          console.error(`   ❌ Error: ${errorMessage}`);
        }

        results.push({
          customerId,
          email: customerEmail,
          success: false,
          tokenUpdated: false,
          error: isInvalidGrant ? 'Token expired/revoked - needs re-auth' : errorMessage,
        });
      }
    }

    hasMore = subscriptions.has_more;
    if (subscriptions.data.length > 0) {
      startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
    }
  }

  // Print summary
  console.log('\n======================================');
  console.log('📊 Refresh Summary\n');

  const successful = results.filter(r => r.success);
  const tokensUpdated = results.filter(r => r.tokenUpdated);
  const failed = results.filter(r => !r.success);
  const needsReauth = failed.filter(r => r.error?.includes('re-auth'));

  console.log(`✅ Valid tokens: ${successful.length}`);
  console.log(`🔑 Tokens rotated: ${tokensUpdated.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  if (needsReauth.length > 0) {
    console.log(`⚠️  Need re-authentication: ${needsReauth.length}`);
  }
  console.log(`📧 Total processed: ${results.length}`);

  if (needsReauth.length > 0) {
    console.log('\n⚠️  Customers needing re-authentication:');
    for (const result of needsReauth) {
      console.log(`   - ${result.email} (${result.customerId})`);
    }
  }

  if (failed.length > 0 && failed.length !== needsReauth.length) {
    console.log('\n❌ Other failures:');
    for (const result of failed.filter(r => !r.error?.includes('re-auth'))) {
      console.log(`   - ${result.email} (${result.customerId}): ${result.error}`);
    }
  }

  console.log('\n✅ Token refresh complete\n');
}

// Parse command line arguments
function parseArgs(): RefreshOptions {
  const args = process.argv.slice(2);
  const options: RefreshOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      options.filterEmail = arg.slice('--email='.length);
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.slice('--limit='.length), 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: bun run scripts/refresh-customer-tokens.ts [options]

Refreshes Gmail OAuth tokens for all active customers. Run hourly via cron.

Options:
  --email=<email>       Process only this customer email
  --limit=<n>           Max number of customers to process (default: 100)
  --dry-run             Don't update tokens, just validate them
  --help, -h            Show this help message

Environment variables:
  DRY_RUN               Set to 'true' for dry run mode
  FILTER_EMAIL          Process only this customer email
  CUSTOMER_LIMIT        Max customers to process

Example cron (every hour):
  0 * * * * cd /path/to/project && bun run refresh-tokens >> /var/log/token-refresh.log 2>&1
`);
      process.exit(0);
    }
  }

  return options;
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  refreshCustomerTokens(options)
    .then(() => {
      process.exit(0);
    })
    .catch((error: any) => {
      console.error('\n❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { refreshCustomerTokens };
