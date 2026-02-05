#!/usr/bin/env node
/**
 * Entry point that runs the Ryan rules processor every 15 minutes.
 * Keeps processed email IDs in memory so we never process the same email twice in this process.
 *
 * Usage: bun run scripts/run-ryan-rules-entry.ts
 *   DRY_RUN=false  to apply labels for real (default: dry run)
 *   --run-on-spam-folder  to process spam folder instead of all mail
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { main, getSecretFromAWS } from './run-ryan-rules';
import { getGeminiApiKey } from '../lib/secrets';
import { GMAIL_REFRESH_TOKEN_SECRET_ARN } from '../lib/const';

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLoop(): Promise<void> {
  config();

  console.log('🔐 Fetching Gmail refresh token from AWS Secrets Manager...');
  const gmailRefreshToken = await getSecretFromAWS(GMAIL_REFRESH_TOKEN_SECRET_ARN);
  if (!gmailRefreshToken) {
    throw new Error('Gmail refresh token is empty. Check AWS Secrets Manager.');
  }
  console.log(`✅ Refresh token fetched (length: ${gmailRefreshToken.length})`);

  const geminiApiKey = await getGeminiApiKey();
  const dryRun = process.env.DRY_RUN !== undefined ? process.env.DRY_RUN === 'true' : true;
  const maxEmails = parseInt(process.env.MAX_EMAILS ?? '50', 10);
  const lookbackHours = parseInt(process.env.LOOKBACK_HOURS ?? '168', 10);
  const runOnSpamFolder = process.argv.includes('--run-on-spam-folder');
  const query = runOnSpamFolder ? 'in:spam' : ''; // empty = all mail

  if (runOnSpamFolder) console.log('📬 Running on SPAM folder\n');
  if (dryRun) console.log('⚠️  DRY RUN MODE - No labels will be applied to Gmail\n');

  /** In-memory set of email IDs we have already processed (never process twice). */
  const processedIds = new Set<string>();

  const params = {
    emailAddress: 'ryan@fanpierlabs.com',
    gmailRefreshToken,
    geminiApiKey,
    dryRun,
    query,
    maxEmails,
    lookbackHours,
    processedIds,
  };

  let runCount = 0;
  while (true) {
    runCount++;
    const started = new Date().toISOString();
    console.log(`\n🔄 Run #${runCount} at ${started} (${processedIds.size} IDs in cache)\n`);
    try {
      await main(params);
    } catch (err: any) {
      console.error('❌ Run error:', err?.message ?? err);
    }
    console.log(`\n⏳ Next run in 15 minutes...\n`);
    await sleep(INTERVAL_MS);
  }
}

if (import.meta.main) {
  runLoop().catch((err: any) => {
    console.error('❌ Fatal:', err?.message ?? err);
    process.exit(1);
  });
}

export { runLoop };
