#!/usr/bin/env bun
import next from 'next';
import { createServer } from 'http';
import { loadSecretsFromAWS } from '../lib/secrets';
import { processAllCustomers } from './process-all-customers';

const ONE_HOUR_MS = 60 * 60 * 1000;
const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Starts the hourly customer processor loop
 */
function startProcessorLoop(): void {
  // Run immediately on startup
  console.log(`[${new Date().toISOString()}] Running initial customer processing...`);
  processAllCustomers().catch(console.error);
  
  // Then run every hour
  setInterval(() => {
    console.log(`[${new Date().toISOString()}] Running scheduled customer processing...`);
    processAllCustomers().catch(console.error);
  }, ONE_HOUR_MS);
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
    console.log(`[${new Date().toISOString()}] Next.js server running on http://localhost:${PORT}`);
  });
}

// Main entry point
async function main(): Promise<void> {
  // Load secrets from AWS Secrets Manager before starting
  console.log(`[${new Date().toISOString()}] Loading secrets from AWS...`);
  await loadSecretsFromAWS();
  
  startProcessorLoop();
  await startNextServer();
}

main().catch(console.error);
