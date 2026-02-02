import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Gets the encryption key from environment variable.
 * Key must be 32 bytes (256 bits) encoded as hex (64 characters).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.STRIPE_METADATA_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'STRIPE_METADATA_ENCRYPTION_KEY is not set. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  if (keyHex.length !== 64) {
    throw new Error(
      'STRIPE_METADATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypts a string for storage in Stripe metadata.
 * Returns base64-encoded ciphertext with IV and auth tag prepended.
 * Format: base64(iv + authTag + ciphertext)
 */
export function encryptForStripe(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  
  // Combine: IV (12 bytes) + Auth Tag (16 bytes) + Ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts a string from Stripe metadata.
 * Expects base64-encoded data in format: iv + authTag + ciphertext
 */
export function decryptFromStripe(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');
  
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted data: too short');
  }
  
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Checks if a string looks like encrypted data (base64 with minimum length).
 * Used to determine if metadata needs decryption.
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 40) return false; // Minimum: IV + authTag + 1 byte = 29 bytes = ~40 base64 chars
  try {
    const decoded = Buffer.from(value, 'base64');
    // Must be at least IV + authTag + 1 byte of ciphertext
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
