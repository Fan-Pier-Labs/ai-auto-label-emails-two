#!/usr/bin/env node
import { EmailProcessor } from '../lib/processor';
import type { ProcessorConfig } from '../lib/processor';

function loadConfig(): ProcessorConfig {
  // Gmail OAuth
  const gmailClientId = process.env.GMAIL_CLIENT_ID;
  const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
  const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!gmailClientId || !gmailClientSecret || !gmailRefreshToken) {
    throw new Error(
      '❌ Missing Gmail OAuth credentials!\n\n' +
      'Required environment variables:\n' +
      '  - GMAIL_CLIENT_ID\n' +
      '  - GMAIL_CLIENT_SECRET\n' +
      '  - GMAIL_REFRESH_TOKEN\n\n' +
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
