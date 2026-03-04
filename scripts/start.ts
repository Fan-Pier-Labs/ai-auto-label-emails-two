#!/usr/bin/env bun
import next from 'next';
import { createServer } from 'http';
import { loadSecretsFromAWS, getGeminiApiKey } from '../lib/secrets';
import { GMAIL_REFRESH_TOKEN_SECRET_ARN } from '../lib/const';
import { main, getSecretFromAWS } from './run-ryan-rules';

const RYAN_RULES_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const PORT = parseInt(process.env.PORT || '8080', 10);

/** Params for the Ryan rules processor (shared across runs; processedIds is mutated). */
type RyanRulesParams = {
  emailAddress: string;
  gmailRefreshToken: string;
  geminiApiKey: string;
  dryRun: boolean;
  query: string;
  maxEmails: number;
  lookbackHours: number;
  includeSpamTrash: boolean;
  processedIds: Set<string>;
};

/**
 * Runs one Ryan rules pass, then schedules the next run after the interval.
 * Default: all mail (inbox + spam). Processed IDs are kept in memory so we never process the same email twice.
 */
function startRyanRulesLoop(params: RyanRulesParams): void {
  const run = (): void => {
    console.log(`[${new Date().toISOString()}] Running Ryan rules (${params.processedIds.size} IDs in cache)...`);
    main(params)
      .catch(console.error)
      .finally(() => {
        setTimeout(run, RYAN_RULES_INTERVAL_MS);
      });
  };
  run();
}

/**
 * Starts the Next.js server
 */
async function startNextServer(): Promise<void> {
  const app = next({ dev: false });
  const handle = app.getRequestHandler();
  
  await app.prepare();
  
  const server = createServer((req, res) => {
    handle(req, res);
  });
  
  server.listen(PORT, () => {
    const baseUrl = process.env.NEXT_APP_URL?.replace(/\/$/, '') ?? `http://localhost:${PORT}`;
    console.log(`[${new Date().toISOString()}] Next.js server running on ${baseUrl}`);
  });
}

// Main entry point
async function bootstrap(): Promise<void> {
  // Load secrets from AWS Secrets Manager before starting
  console.log(`[${new Date().toISOString()}] Loading secrets from AWS...`);
  await loadSecretsFromAWS();

  // Build Ryan rules params (all mail including spam; processedIds shared across runs)
  console.log(`[${new Date().toISOString()}] Fetching Gmail refresh token for Ryan rules...`);
  const gmailRefreshToken = await getSecretFromAWS(GMAIL_REFRESH_TOKEN_SECRET_ARN);
  if (!gmailRefreshToken) {
    throw new Error('Gmail refresh token is empty. Check AWS Secrets Manager.');
  }
  const geminiApiKey = await getGeminiApiKey();
  const dryRun = process.env.DRY_RUN !== undefined ? process.env.DRY_RUN === 'true' : true;
  const maxEmails = parseInt(process.env.MAX_EMAILS ?? '50', 10);
  const lookbackHours = parseInt(process.env.LOOKBACK_HOURS ?? '168', 10);

  const ryanParams: RyanRulesParams = {
    emailAddress: 'ryan@fanpierlabs.com',
    gmailRefreshToken,
    geminiApiKey,
    dryRun,
    query: '',
    maxEmails,
    lookbackHours,
    includeSpamTrash: true, // default: all mail including spam
    processedIds: new Set<string>(),
  };

  // Ryan rules cron loop disabled for now
  // startRyanRulesLoop(ryanParams);
  await startNextServer();
}

bootstrap().catch(console.error);
