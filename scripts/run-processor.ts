#!/usr/bin/env node
import { processEmail } from '../lib/processor';
import type { ProcessorConfig } from '../lib/processor';
import { searchEmails, initializeGmail } from '../lib/gmail';
import { readFileSync } from 'fs';
import { join } from 'path';

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
        throw new Error(
          '❌ google_creds.json not found!\n\n' +
          'Please create google_creds.json in the project root with your OAuth credentials.\n' +
          'Download it from: https://console.cloud.google.com/apis/credentials'
        );
      }
      throw new Error(`❌ Error reading google_creds.json: ${error.message}`);
    }

    if (!gmailClientId || !gmailClientSecret) {
      throw new Error(
        '❌ Missing client_id or client_secret in google_creds.json!\n\n' +
        'Make sure google_creds.json has either "web" or "installed" section with client_id and client_secret.'
      );
    }

    // Create config from parameters
    const config: ProcessorConfig = {
      gmail: {
        clientId: gmailClientId,
        clientSecret: gmailClientSecret,
        refreshToken: params.gmailRefreshToken,
      },
      geminiApiKey: params.geminiApiKey,
      googleSheetsUrl: params.googleSheetsUrl,
      processedLabel: params.processedLabel || '__auto-processed__',
      dryRun: params.dryRun || false,
    };

    if (config.dryRun) {
      console.log('⚠️  DRY RUN MODE - No labels will be applied\n');
    }

    const query = params.query || 'in:inbox';
    console.log(`📧 Processing emails for: ${params.emailAddress}`);
    console.log(`🔍 Search query: ${query}\n`);

    // Initialize Gmail before searching
    await initializeGmail(config.gmail);

    const emailIds = await searchEmails(query, 1);
    
    if (emailIds.length === 0) {
      console.log('❌ No emails found matching query');
      return;
    }

    await processEmail(config, emailIds[0]);
    console.log('\n✅ Processing complete\n');
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    throw error;
  }
}

/**
 * Test function - runs when file is executed directly
 * Uses ryan@fanpierlabs.com and RYANS_GMAIL_REFRESH_TOKEN from .env
 */
async function test(): Promise<void> {
  try {
    console.log('🧪 Test Mode - Auto Label Email Processor\n');
    console.log('=========================================\n');

    // Load .env file if it exists
    try {
      const envPath = join(process.cwd(), '.env');
      const envContent = readFileSync(envPath, 'utf-8');
      const envLines = envContent.split('\n');
      
      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn('⚠️  Could not load .env file:', error.message);
      }
    }
      

    // Get required parameters from environment
    const gmailRefreshToken = process.env.RYANS_GMAIL_REFRESH_TOKEN;
    if (!gmailRefreshToken) {
      throw new Error(
        '❌ Missing Gmail refresh token!\n\n' +
        'Set RYANS_GMAIL_REFRESH_TOKEN environment variable\n' +
        'Run: bun run scripts/get-refresh-token.ts to get your refresh token'
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error(
        '❌ Missing Gemini API key!\n\n' +
        'Set GEMINI_API_KEY environment variable\n' +
        'Get your key from: https://makersuite.google.com/app/apikey'
      );
    }

    // Get optional parameters
    const googleSheetsUrl = process.env.GOOGLE_SHEETS_URL || process.env.GOOGLE_SHEETS_ID;
    const processedLabel = process.env.PROCESSED_LABEL || '__auto-processed__';
    const dryRun = process.env.DRY_RUN === 'true';

    // Call main with user's parameters
    await main({
      emailAddress: 'ryan@fanpierlabs.com',
      gmailRefreshToken,
      geminiApiKey,
      googleSheetsUrl,
      processedLabel,
      dryRun,
      query: 'in:inbox',
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
