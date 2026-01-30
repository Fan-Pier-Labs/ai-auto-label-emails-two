export interface PendingSetupEntry {
  refreshToken: string;
  sheetId?: string;
  timestamp: number;
}

/**
 * Temporary in-memory store for refresh tokens and optional sheet ID
 * Keyed by user email address
 *
 * In production, consider using Redis or a database instead
 */
const tokenStore = new Map<string, PendingSetupEntry>();

const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Store a refresh token for a user email
 */
export function storeRefreshToken(email: string, refreshToken: string): void {
  const emailLower = email.toLowerCase();
  const existing = tokenStore.get(emailLower);
  tokenStore.set(emailLower, {
    refreshToken,
    sheetId: existing?.sheetId,
    timestamp: Date.now(),
  });
}

/**
 * Store a sheet ID for a user email (must have already run OAuth so entry exists)
 */
export function storeSheetId(email: string, sheetId: string): void {
  const emailLower = email.toLowerCase();
  const entry = tokenStore.get(emailLower);
  if (!entry) {
    console.warn(`[TokenStore] No pending setup for ${emailLower}; user should complete Gmail sign-in first`);
    return;
  }
  entry.sheetId = sheetId;
  entry.timestamp = Date.now();
}

/**
 * Retrieve both refresh token and sheet ID for webhook, then remove entry (one-time use)
 */
export function retrieveForWebhook(email: string): {
  refreshToken: string | null;
  sheetId: string | null;
} | null {
  const emailLower = email.toLowerCase();
  const entry = tokenStore.get(emailLower);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > TOKEN_EXPIRY_MS) {
    tokenStore.delete(emailLower);
    return null;
  }

  tokenStore.delete(emailLower);
  return {
    refreshToken: entry.refreshToken,
    sheetId: entry.sheetId ?? null,
  };
}

/**
 * Retrieve and remove a refresh token for a user email (legacy; webhook uses retrieveForWebhook)
 */
export function retrieveRefreshToken(email: string): string | null {
  const result = retrieveForWebhook(email);
  return result?.refreshToken ?? null;
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
