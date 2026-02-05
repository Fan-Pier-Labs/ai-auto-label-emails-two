#!/usr/bin/env node
import { processEmail } from '../lib/processor';
import type { ProcessorConfig } from '../lib/processor';
import { searchEmails, initializeGmail } from '../lib/gmail';
import { analytics } from '../lib/analytics';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getGeminiApiKey } from '../lib/secrets';

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

interface MainParams {
  emailAddress: string;
  gmailRefreshToken: string;
  geminiApiKey: string;
  googleSheetsUrl?: string;
  processedLabel?: string;
  dryRun?: boolean;
  query?: string;
  maxEmails?: number;
  lookbackHours?: number;
  useInMemoryTracking?: boolean;
}

async function main(params: MainParams): Promise<void> {
  try {
    console.log('📧 Auto Label Email - Background Processor\n');
    console.log('=========================================\n');

    // Load Gmail OAuth credentials from google_creds.json
    let gmailClientId: string | undefined;
    let gmailClientSecret: string | undefined;

    try {
      const credsPath = join(process.cwd(), 'google_creds.json');
      const credsContent = readFileSync(credsPath, 'utf-8');
      const creds: GoogleCreds = JSON.parse(credsContent);

      const webCreds = creds.web || creds.installed;
      if (webCreds) {
        gmailClientId = webCreds.client_id;
        gmailClientSecret = webCreds.client_secret;
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Fallback to environment variables
        gmailClientId = process.env.GMAIL_CLIENT_ID;
        gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
      } else {
        throw new Error(`❌ Error reading google_creds.json: ${error.message}`);
      }
    }

    if (!gmailClientId || !gmailClientSecret) {
      throw new Error(
        '❌ Missing Google OAuth credentials!\n\n' +
        'Either:\n' +
        '1. Create google_creds.json in the project root (download from https://console.cloud.google.com/apis/credentials), or\n' +
        '2. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables'
      );
    }

    // Create config from parameters
    const useInMemoryTracking = params.useInMemoryTracking ?? false;
    const config: ProcessorConfig = {
      gmail: {
        clientId: gmailClientId,
        clientSecret: gmailClientSecret,
        refreshToken: params.gmailRefreshToken,
      },
      geminiApiKey: params.geminiApiKey,
      googleSheetsUrl: params.googleSheetsUrl,
      processedLabel: useInMemoryTracking ? '' : (params.processedLabel || '__auto-processed__'),
      dryRun: params.dryRun || false,
      useInMemoryTracking,
    };

    if (config.dryRun) {
      console.log('⚠️  DRY RUN MODE - No labels will be applied\n');
    }

    // Build query with lookback time filter
    const lookbackHours = params.lookbackHours ?? 24;
    const baseQuery = params.query || 'in:inbox';
    let query = `${baseQuery} newer_than:${lookbackHours}h`;
    
    // Exclude already-processed emails if using label tracking (not in-memory)
    if (!useInMemoryTracking && config.processedLabel) {
      query = `${query} -label:${config.processedLabel}`;
    }
    
    const maxEmails = params.maxEmails ?? 1;
    
    console.log(`📧 Processing emails for: ${params.emailAddress}`);
    console.log(`🔍 Search query: ${query}`);
    console.log(`📊 Max emails to process: ${maxEmails}`);
    console.log(`⏰ Looking back: ${lookbackHours} hours`);
    console.log(`📝 Tracking: ${useInMemoryTracking ? 'In-memory' : `Label (${config.processedLabel})`}\n`);

    // Initialize Gmail before searching
    await initializeGmail(config.gmail);

    const emailIds = await searchEmails(query, maxEmails);
    
    if (emailIds.length === 0) {
      console.log('❌ No emails found matching query');
      return;
    }

    console.log(`📬 Found ${emailIds.length} email(s) to process\n`);

    // Track processed emails in memory if enabled
    const processedEmailIds = new Set<string>();

    // Process all found emails
    for (let i = 0; i < emailIds.length; i++) {
      const emailId = emailIds[i];
      
      // Skip if already processed (in-memory tracking)
      if (useInMemoryTracking && processedEmailIds.has(emailId)) {
        console.log(`\n[${i + 1}/${emailIds.length}] ⏭️  Skipping (already processed)`);
        continue;
      }

      console.log(`\n[${i + 1}/${emailIds.length}]`);
      await processEmail(config, emailId);
      
      // Mark as processed in memory
      if (useInMemoryTracking) {
        processedEmailIds.add(emailId);
      }
    }

    analytics.track('emails_processed', {
      count: emailIds.length,
      userEmail: params.emailAddress,
    });

    console.log('\n✅ Processing complete\n');
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    throw error;
  }
}

/**
 * Fetches a secret from AWS Secrets Manager
 */
async function getSecretFromAWS(secretArn: string): Promise<string> {
  try {
    const client = new SecretsManagerClient({ region: 'us-east-2' });
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty or not a string');
    }
    
    // Trim whitespace and newlines that might be present in the secret value
    return response.SecretString.trim();
  } catch (error: any) {
    throw new Error(
      `❌ Failed to fetch secret from AWS Secrets Manager: ${error.message}\n\n` +
      `Make sure AWS credentials are configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)\n` +
      `or use AWS IAM role if running on EC2/ECS/Lambda`
    );
  }
}

/**
 * Test function - runs when file is executed directly
 * Uses ryan@fanpierlabs.com and fetches refresh token from AWS Secrets Manager
 */
async function test(): Promise<void> {
  try {
    console.log('🧪 Test Mode - Auto Label Email Processor\n');
    console.log('=========================================\n');

    // Load .env file if it exists
    config();
      

    // Get required parameters - fetch refresh token from AWS Secrets Manager
    const secretArn = 'arn:aws:secretsmanager:us-east-2:066949051862:secret:ryan-gmail-refresh-token-iVkQdq';
    console.log('🔐 Fetching Gmail refresh token from AWS Secrets Manager...');
    const gmailRefreshToken = await getSecretFromAWS(secretArn);
    
    if (!gmailRefreshToken) {
      throw new Error(
        '❌ Gmail refresh token is empty!\n\n' +
        'Check the secret value in AWS Secrets Manager'
      );
    }
    
    console.log(`✅ Refresh token fetched (length: ${gmailRefreshToken.length} chars)`);

    // Get Gemini API key from environment or AWS Secrets Manager
    const geminiApiKey = await getGeminiApiKey();

    // Get optional parameters (with defaults for test function)
    const googleSheetsUrl = 'https://docs.google.com/spreadsheets/d/1T9vwarXB3ICksZpP4gHw-rllKve0j2tKBDEEEsIVEAM/edit?gid=0#gid=0'
    const processedLabel = process.env.PROCESSED_LABEL || '__auto-processed__';
    const dryRun = process.env.DRY_RUN !== undefined ? process.env.DRY_RUN === 'true' : true; // Default: true
    const maxEmails = 50
    const lookbackHours = 200
    const useInMemoryTracking = process.env.USE_IN_MEMORY_TRACKING !== undefined ? process.env.USE_IN_MEMORY_TRACKING === 'true' : true; // Default: true

    // --run-on-spam-folder: process emails in spam folder instead of inbox
    const runOnSpamFolder = process.argv.includes('--run-on-spam-folder');
    const query = runOnSpamFolder ? 'in:spam' : 'in:inbox';
    if (runOnSpamFolder) {
      console.log('📬 Running on SPAM folder\n');
    }

    // Call main with user's parameters
    await main({
      emailAddress: 'ryan@fanpierlabs.com',
      gmailRefreshToken,
      geminiApiKey,
      googleSheetsUrl,
      processedLabel,
      dryRun,
      query,
      maxEmails,
      lookbackHours,
      useInMemoryTracking,
    });

    console.log('\n✅ Test complete!\n');
  } catch (error: any) {
    console.error('\n❌ Test error:', error.message);
    process.exit(1);
  }
}

// Run if called directly - only call test function
if (require.main === module) {
  test();
}

export { main, test };
