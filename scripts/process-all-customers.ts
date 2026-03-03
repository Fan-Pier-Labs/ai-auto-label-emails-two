#!/usr/bin/env node
import Stripe from 'stripe';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { safeDecrypt } from '../lib/encryption';
import { getGeminiApiKey } from '../lib/secrets';
import { ProcessingSession } from '../lib/processor-utils';
import { analytics } from '../lib/analytics';

// Load .env file if it exists
config();

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

interface CustomerResult {
  customerId: string;
  email: string;
  success: boolean;
  error?: string;
  emailsProcessed?: number;
}

interface ProcessingOptions {
  dryRun?: boolean;
  maxEmails?: number;
  lookbackHours?: number;
  filterEmail?: string;
  limit?: number;
  concurrency?: number;
}

/**
 * Gets the Stripe client instance
 */
function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(secretKey);
}

/**
 * Gets Gmail OAuth credentials from environment or google_creds.json
 */
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

  throw new Error(
    '❌ Missing Google OAuth credentials!\n\n' +
    'Either:\n' +
    '1. Create google_creds.json in the project root (download from https://console.cloud.google.com/apis/credentials), or\n' +
    '2. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables'
  );
}

/**
 * Process emails for all active Stripe customers
 */
async function processAllCustomers(options: ProcessingOptions = {}): Promise<void> {
  const {
    dryRun = process.env.DRY_RUN === 'true',
    maxEmails = parseInt(process.env.MAX_EMAILS || '20', 10),
    lookbackHours = parseInt(process.env.LOOKBACK_HOURS || '24', 10),
    filterEmail = process.env.FILTER_EMAIL,
    limit = parseInt(process.env.CUSTOMER_LIMIT || '100', 10),
    concurrency = parseInt(process.env.EMAIL_CONCURRENCY || '3', 10),
  } = options;

  console.log('📧 Auto Label Email - Process All Customers\n');
  console.log('============================================\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No labels will be applied\n');
  }

  const stripe = getStripe();
  const geminiApiKey = await getGeminiApiKey();
  const { clientId, clientSecret } = getOAuthCredentials();

  console.log('📋 Configuration:');
  console.log(`   Max emails per customer: ${maxEmails}`);
  console.log(`   Lookback hours: ${lookbackHours}`);
  console.log(`   Customer limit: ${limit}`);
  console.log(`   Email concurrency: ${concurrency} (parallel)`);
  console.log(`   Using optimized ProcessingSession with caching`);
  if (filterEmail) {
    console.log(`   Filter email: ${filterEmail}`);
  }
  console.log('');

  analytics.track('batch_config', {
    maxEmails,
    lookbackHours,
    limit,
    concurrency,
    dryRun,
  });

  // Fetch all active subscriptions
  console.log('🔍 Fetching active subscriptions from Stripe...');
  
  const results: CustomerResult[] = [];
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

    if (subscriptionCount === 0 && subscriptions.data.length === 0) {
      console.log(
        '\n⚠️  No active subscriptions found in Stripe.\n' +
          '   Customers are loaded from Stripe subscriptions (status=active).\n' +
          '   • Check your Stripe Dashboard → Customers / Subscriptions.\n' +
          '   • Ensure STRIPE_SECRET_KEY matches the account (test vs live key).\n'
      );
    } else if (subscriptions.data.length > 0 && subscriptionCount === 0) {
      console.log(`   Found ${subscriptions.data.length} active subscription(s).`);
    }

    for (const subscription of subscriptions.data) {
      if (subscriptionCount >= limit) break;
      subscriptionCount++;

      // Get customer from expanded data
      const customer = subscription.customer as Stripe.Customer | Stripe.DeletedCustomer | null;

      if (!customer) {
        console.log(`\n[${subscriptionCount}] ⏭️  Skipping deleted customer`);
        analytics.track('customer_skipped', { customerId: 'unknown', reason: 'deleted' });
        continue;
      }
      if ('deleted' in customer && customer.deleted) {
        console.log(`\n[${subscriptionCount}] ⏭️  Skipping deleted customer`);
        analytics.track('customer_skipped', { customerId: customer.id, reason: 'deleted' });
        continue;
      }

      const customerId = customer.id;
      const metadata = customer.metadata || {};

      // Only gmail_refresh_token is encrypted; gmail_email and google_sheet_id are plaintext
      const refreshToken = safeDecrypt(metadata.gmail_refresh_token);
      const customerEmail = metadata.gmail_email;
      const sheetId = metadata.google_sheet_id?.trim() || undefined;

      // Skip if missing required fields
      if (!refreshToken) {
        console.log(`\n[${subscriptionCount}] ⏭️  Skipping ${customerId}: No refresh token`);
        analytics.track('customer_skipped', { customerId, reason: 'no_refresh_token' });
        results.push({
          customerId,
          email: customerEmail || customer.email || 'unknown',
          success: false,
          error: 'No refresh token',
        });
        continue;
      }

      if (!customerEmail) {
        console.log(`\n[${subscriptionCount}] ⏭️  Skipping ${customerId}: No email`);
        analytics.track('customer_skipped', { customerId, reason: 'no_email_in_metadata' });
        results.push({
          customerId,
          email: customer.email || 'unknown',
          success: false,
          error: 'No email in metadata',
        });
        continue;
      }

      // Apply email filter if specified
      if (filterEmail && customerEmail.toLowerCase() !== filterEmail.toLowerCase()) {
        console.log(`\n[${subscriptionCount}] ⏭️  Skipping ${customerEmail}: Does not match filter`);
        analytics.track('customer_skipped', { customerId, reason: 'filter_mismatch' });
        continue;
      }

      console.log(`\n[${subscriptionCount}] 📧 Processing ${customerEmail} (${customerId})`);
      analytics.track('customer_processing_start', { customerId, customerIndex: subscriptionCount });

      const customerStart = Date.now();

      try {
        // Build Google Sheets URL from sheet ID if provided
        const googleSheetsUrl = sheetId
          ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
          : undefined;
        if (!sheetId) {
          console.log(`   ⚠️  No sheet ID in metadata (google_sheet_id); AI rules will be empty`);
        }

        // Create optimized processing session for this customer
        // Session initializes Gmail/Gemini once and caches rules + domain lookups
        const session = new ProcessingSession({
          gmail: {
            clientId,
            clientSecret,
            refreshToken,
          },
          geminiApiKey,
          googleSheetsUrl,
          dryRun,
        });

        // Initialize session (loads rules once, validates OAuth)
        await session.initialize();

        // Build search query
        const query = `in:inbox newer_than:${lookbackHours}h`;
        console.log(`   🔍 Search: ${query}`);

        // Search for emails
        const emailIds = await session.searchEmails(query, maxEmails);

        if (emailIds.length === 0) {
          console.log(`   📭 No emails found`);
          const durationMs = Date.now() - customerStart;
          analytics.track('customer_processing_complete', {
            customerId,
            success: true,
            emailsProcessed: 0,
            errors: 0,
            durationMs,
          });
          results.push({
            customerId,
            email: customerEmail,
            success: true,
            emailsProcessed: 0,
          });
          continue;
        }

        console.log(`   📬 Found ${emailIds.length} email(s)`);

        // Process all emails using the cached session (with parallel processing)
        const { processed, errors } = await session.processEmails(emailIds, concurrency);

        const durationMs = Date.now() - customerStart;
        analytics.track('customer_processing_complete', {
          customerId,
          success: errors === 0,
          emailsProcessed: processed,
          errors,
          durationMs,
        });

        // Log cache stats for debugging
        const cacheStats = session.getCacheStats();
        console.log(`   📊 Cache hits: MX=${cacheStats.mxCache}, TXT=${cacheStats.txtCache}, Status=${cacheStats.domainStatusCache}`);

        results.push({
          customerId,
          email: customerEmail,
          success: errors === 0,
          emailsProcessed: processed,
          error: errors > 0 ? `${errors} email(s) failed` : undefined,
        });
      } catch (error: any) {
        const durationMs = Date.now() - customerStart;
        console.error(`   ❌ Error: ${error.message}`);
        analytics.track('customer_processing_error', {
          customerId,
          error: error.message,
          durationMs,
        });
        results.push({
          customerId,
          email: customerEmail,
          success: false,
          error: error.message,
        });
      }
    }

    hasMore = subscriptions.has_more;
    if (subscriptions.data.length > 0) {
      startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
    }
  }

  // Print summary
  console.log('\n============================================');
  console.log('📊 Processing Summary\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalEmails = results.reduce((sum, r) => sum + (r.emailsProcessed || 0), 0);

  console.log(`✅ Successful customers: ${successful.length}`);
  console.log(`❌ Failed customers: ${failed.length}`);
  console.log(`👥 Total customers: ${results.length}`);
  console.log(`📧 Total emails processed: ${totalEmails}`);

  if (failed.length > 0) {
    console.log('\n❌ Failed customers:');
    for (const result of failed) {
      console.log(`   - ${result.email} (${result.customerId}): ${result.error}`);
    }
  }

  analytics.track('batch_summary', {
    totalCustomers: results.length,
    successfulCustomers: successful.length,
    failedCustomers: failed.length,
    totalEmailsProcessed: totalEmails,
  });

  console.log('\n✅ All customers processed\n');
}

// Parse command line arguments
function parseArgs(): ProcessingOptions {
  const args = process.argv.slice(2);
  const options: ProcessingOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      options.filterEmail = arg.slice('--email='.length);
    } else if (arg.startsWith('--max-emails=')) {
      options.maxEmails = parseInt(arg.slice('--max-emails='.length), 10);
    } else if (arg.startsWith('--lookback=')) {
      options.lookbackHours = parseInt(arg.slice('--lookback='.length), 10);
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.slice('--limit='.length), 10);
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parseInt(arg.slice('--concurrency='.length), 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: bun run scripts/process-all-customers.ts [options]

Options:
  --email=<email>       Process only this customer email
  --max-emails=<n>      Max emails to process per customer (default: 20)
  --lookback=<hours>    Hours to look back for emails (default: 24)
  --limit=<n>           Max number of customers to process (default: 100)
  --concurrency=<n>     Number of emails to process in parallel (default: 3)
  --dry-run             Don't apply labels, just simulate
  --help, -h            Show this help message

Environment variables:
  DRY_RUN               Set to 'true' for dry run mode
  MAX_EMAILS            Max emails per customer
  LOOKBACK_HOURS        Hours to look back
  FILTER_EMAIL          Process only this customer email
  CUSTOMER_LIMIT        Max customers to process
  EMAIL_CONCURRENCY     Number of emails to process in parallel
`);
      process.exit(0);
    }
  }

  return options;
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  processAllCustomers(options)
    .then(() => {
      process.exit(0);
    })
    .catch((error: any) => {
      console.error('\n❌ Fatal error:', error.message);
      process.exit(1);
    });
}

export { processAllCustomers };
