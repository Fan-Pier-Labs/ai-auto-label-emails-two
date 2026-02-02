#!/usr/bin/env bun
/**
 * Encrypts values for Stripe customer metadata.
 * Usage: bun run scripts/encrypt-for-stripe.ts
 */

import 'dotenv/config';
import { encryptForStripe } from '../lib/encryption';

// Get values from environment
const refreshToken = process.env.RYAN_GMAIL_REFRESH_TOKEN;
const email = 'ryan@fanpierlabs.com'; // Your email
const sheetId = '1T9vwarXB3ICksZpP4gHw-rllKve0j2tKBDEEEsIVEAM'; // From your GOOGLE_SHEETS_URL

if (!refreshToken) {
  console.error('❌ RYAN_GMAIL_REFRESH_TOKEN not found in .env');
  process.exit(1);
}

if (!process.env.STRIPE_METADATA_ENCRYPTION_KEY) {
  console.error('❌ STRIPE_METADATA_ENCRYPTION_KEY not found in .env');
  process.exit(1);
}

console.log('🔐 Encrypting values for Stripe customer metadata...\n');

const encryptedRefreshToken = encryptForStripe(refreshToken);
const encryptedSheetId = encryptForStripe(sheetId);

console.log('='.repeat(60));
console.log('STRIPE CUSTOMER METADATA');
console.log('='.repeat(60));
console.log('\nCopy these key-value pairs into your Stripe customer metadata:\n');

console.log('Key: gmail_refresh_token');
console.log(`Value: ${encryptedRefreshToken}`);
console.log('');

console.log('Key: gmail_email (NOT encrypted)');
console.log(`Value: ${email}`);
console.log('');

console.log('Key: google_sheet_id');
console.log(`Value: ${encryptedSheetId}`);
console.log('');

console.log('='.repeat(60));
console.log('\nIMPORTANT: The customer also needs an ACTIVE SUBSCRIPTION');
console.log('to be processed by the production system.');
console.log('='.repeat(60));
