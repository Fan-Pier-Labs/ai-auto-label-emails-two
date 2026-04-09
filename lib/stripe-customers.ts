import type Stripe from 'stripe';
import { safeDecrypt } from '@/lib/encryption';

export interface CustomerConfig {
  customerId: string;
  refreshToken: string;
  sheetId?: string;
  gmailEmail: string;
  metadata: Record<string, string>;
}

/**
 * Find an active subscriber by email and return their config (decrypted refresh token, sheet id).
 * Uses Stripe customer email and metadata gmail_email; prefers customer with active subscription.
 */
export async function getCustomerConfigByEmail(
  stripe: Stripe,
  email: string
): Promise<CustomerConfig | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const customers = await stripe.customers.list({
    email: normalized,
    limit: 10,
  });

  for (const customer of customers.data) {
    if (customer.deleted) continue;

    // Must have active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1,
    });
    if (subscriptions.data.length === 0) continue;

    const metadata = (customer.metadata || {}) as Record<string, string>;
    const gmailEmail = metadata.gmail_email?.trim() || (customer.email ?? '').trim().toLowerCase();
    const refreshToken = safeDecrypt(metadata.gmail_refresh_token);
    const sheetId = safeDecrypt(metadata.google_sheet_id)?.trim() || undefined;

    if (!refreshToken || !gmailEmail) continue;

    return {
      customerId: customer.id,
      refreshToken,
      sheetId: sheetId || undefined,
      gmailEmail,
      metadata,
    };
  }

  return null;
}
