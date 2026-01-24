/**
 * Temporary in-memory store for refresh tokens
 * Keyed by user email address
 * 
 * In production, consider using Redis or a database instead
 */
const tokenStore = new Map<string, { refreshToken: string; timestamp: number }>();

const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Store a refresh token for a user email
 */
export function storeRefreshToken(email: string, refreshToken: string): void {
  tokenStore.set(email.toLowerCase(), {
    refreshToken,
    timestamp: Date.now(),
  });
}

/**
 * Retrieve and remove a refresh token for a user email
 */
export function retrieveRefreshToken(email: string): string | null {
  const emailLower = email.toLowerCase();
  const entry = tokenStore.get(emailLower);
  
  if (!entry) {
    return null;
  }

  // Check if token has expired
  if (Date.now() - entry.timestamp > TOKEN_EXPIRY_MS) {
    tokenStore.delete(emailLower);
    return null;
  }

  // Remove token after retrieval (one-time use)
  tokenStore.delete(emailLower);
  return entry.refreshToken;
}

/**
 * Clean up expired tokens (call periodically)
 */
export function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [email, entry] of tokenStore.entries()) {
    if (now - entry.timestamp > TOKEN_EXPIRY_MS) {
      tokenStore.delete(email);
    }
  }
}
