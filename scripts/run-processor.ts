#!/usr/bin/env node
import { EmailProcessor } from '../lib/processor';
import type { ProcessorConfig } from '../lib/processor';
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

function loadConfig(): ProcessorConfig {
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

  // Refresh token still comes from environment
  const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!gmailRefreshToken) {
    throw new Error(
      '❌ Missing Gmail refresh token!\n\n' +
      'Set GMAIL_REFRESH_TOKEN environment variable\n' +
      'Run: bun run scripts/get-refresh-token.ts to get your refresh token'
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
  const pollIntervalMinutes = parseInt(process.env.POLL_INTERVAL_MINUTES || '5', 10);
  const processedLabel = process.env.PROCESSED_LABEL || '__auto-processed__';
  const dryRun = process.env.DRY_RUN === 'true';
  const emailAddress = process.env.EMAIL_ADDRESS || 'ryan@fanpierlabs.com'; // Default to your email

  return {
    gmail: {
      clientId: gmailClientId,
      clientSecret: gmailClientSecret,
      refreshToken: gmailRefreshToken,
    },
    geminiApiKey,
    googleSheetsUrl,
    pollIntervalMinutes,
    processedLabel,
    dryRun,
    emailAddress,
  };
}

async function main() {
  try {
    console.log('📧 Auto Label Email - Background Processor\n');
    console.log('=========================================\n');

    const config = loadConfig();

    if (config.dryRun) {
      console.log('⚠️  DRY RUN MODE - No labels will be applied\n');
    }

    const processor = new EmailProcessor(config);

    // Initialize
    await processor.initialize();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
      processor.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
      processor.stop();
      process.exit(0);
    });

    // Check if we want to test a single email
    const testMode = process.argv.includes('--test');
    
    if (testMode) {
      const query = process.argv[process.argv.indexOf('--test') + 1] || 'in:inbox';
      await processor.testSingleEmail(query);
    } else {
      // Start continuous processing
      await processor.start();
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main };
