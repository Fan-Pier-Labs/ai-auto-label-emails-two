#!/usr/bin/env node
import { processEmail } from '../lib/processor';
import type { ProcessorConfig } from '../lib/processor';
import { searchEmails } from '../lib/gmail';
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

function loadConfig(): Omit<ProcessorConfig, 'gmail'> & { gmail: { clientId: string; clientSecret: string } } {
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

  // Gemini API
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error(
      '❌ Missing Gemini API key!\n\n' +
      'Set GEMINI_API_KEY environment variable\n' +
      'Get your key from: https://makersuite.google.com/app/apikey'
    );
  }

  // Optional configs
  const googleSheetsUrl = process.env.GOOGLE_SHEETS_URL || process.env.GOOGLE_SHEETS_ID;
  const processedLabel = process.env.PROCESSED_LABEL || '__auto-processed__';
  const dryRun = process.env.DRY_RUN === 'true';

  return {
    gmail: {
      clientId: gmailClientId,
      clientSecret: gmailClientSecret,
    },
    geminiApiKey,
    googleSheetsUrl,
    processedLabel,
    dryRun,
  } as Omit<ProcessorConfig, 'gmail'> & { gmail: { clientId: string; clientSecret: string } };
}

async function main() {
  try {
    console.log('📧 Auto Label Email - Background Processor\n');
    console.log('=========================================\n');

    // Load refresh token from environment
    const gmailRefreshToken = process.env.RYANS_GMAIL_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN;
    if (!gmailRefreshToken) {
      throw new Error(
        '❌ Missing Gmail refresh token!\n\n' +
        'Set RYANS_GMAIL_REFRESH_TOKEN or GMAIL_REFRESH_TOKEN environment variable\n' +
        'Run: bun run scripts/get-refresh-token.ts to get your refresh token'
      );
    }

    const baseConfig = loadConfig();
    const config: ProcessorConfig = {
      ...baseConfig,
      gmail: {
        ...baseConfig.gmail,
        refreshToken: gmailRefreshToken,
      },
    };

    if (config.dryRun) {
      console.log('⚠️  DRY RUN MODE - No labels will be applied\n');
    }

    // Check if we want to test a single email
    const testMode = process.argv.includes('--test');
    
    if (testMode) {
      const query = process.argv[process.argv.indexOf('--test') + 1] || 'in:inbox';
      console.log(`\n🧪 Test mode: Processing one email matching: ${query}\n`);

      // Initialize Gmail before searching
      const { initializeGmail } = await import('../lib/gmail');
      await initializeGmail(config.gmail);

      const emailIds = await searchEmails(query, 1);
      
      if (emailIds.length === 0) {
        console.log('❌ No emails found matching query');
        return;
      }

      await processEmail(config, emailIds[0]);
      console.log('\n✅ Test complete\n');
    } else {
      console.log('⚠️  Continuous processing mode not available with stateless function');
      console.log('Use --test flag to process a single email');
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
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
      

    // Refresh token still comes from environment
    const gmailRefreshToken = process.env.RYANS_GMAIL_REFRESH_TOKEN;

    if (!gmailRefreshToken) {
      throw new Error(
        '❌ Missing Gmail refresh token!\n\n' +
        'Set RYANS_GMAIL_REFRESH_TOKEN environment variable\n' +
        'Run: bun run scripts/get-refresh-token.ts to get your refresh token'
      );
    }

    // Create test config
    const baseConfig = loadConfig();
    const config: ProcessorConfig = {
      ...baseConfig,
      gmail: {
        ...baseConfig.gmail,
        refreshToken: gmailRefreshToken,
      },
    };

    console.log(`📧 Testing with email: ryan@fanpierlabs.com\n`);

    // Initialize Gmail before searching
    const { initializeGmail } = await import('../lib/gmail');
    await initializeGmail(config.gmail);

    // Search for a test email
    const emailIds = await searchEmails('in:inbox', 1);
    
    if (emailIds.length === 0) {
      console.log('❌ No emails found in inbox');
      return;
    }

    // Process the email using the stateless function
    await processEmail(config, emailIds[0]);

    console.log('\n✅ Test complete!\n');
  } catch (error: any) {
    console.error('\n❌ Test error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  // Check if --test flag is provided for the existing test mode
  if (process.argv.includes('--test')) {
    main();
  } else {
    // Otherwise run the new test function
    test();
  }
}

export { main, test };
