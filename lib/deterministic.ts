import type { Email } from './types';

export interface EmailHistory {
  seenSenderDomains: Set<string>;
  seenSenderAddresses: Set<string>;
  sentDomains: Set<string>;
  sentAddresses: Set<string>;
}

/**
 * Apply deterministic labels based on email history
 */
export function applyDeterministicLabels(
  email: Email,
  history: EmailHistory
): string[] {
  const labels: string[] = [];

  // Check if this is the first email from this domain
  if (!history.seenSenderDomains.has(email.fromDomain)) {
    labels.push('first-domain');
    console.log(`  ✓ Matched deterministic rule: first-domain (${email.fromDomain})`);
  }

  // Check if this is the first email from this address
  if (!history.seenSenderAddresses.has(email.fromAddress)) {
    labels.push('first-address');
    console.log(`  ✓ Matched deterministic rule: first-address (${email.fromAddress})`);
  }

  // Check if we've never sent to this domain
  const hasEmailedDomain = email.toDomains.some(domain => 
    history.sentDomains.has(domain)
  );
  if (!hasEmailedDomain && email.toDomains.length > 0) {
    labels.push('no-email-domain');
    console.log(`  ✓ Matched deterministic rule: no-email-domain`);
  }

  // Check if we've never sent to any of these addresses
  const hasEmailedAddress = email.toAddresses.some(address => 
    history.sentAddresses.has(address)
  );
  if (!hasEmailedAddress && email.toAddresses.length > 0) {
    labels.push('no-email-address');
    console.log(`  ✓ Matched deterministic rule: no-email-address`);
  }

  return labels;
}

/**
 * Update email history with this email
 */
export function updateHistory(email: Email, history: EmailHistory): void {
  history.seenSenderDomains.add(email.fromDomain);
  history.seenSenderAddresses.add(email.fromAddress);
  
  email.toDomains.forEach(domain => history.sentDomains.add(domain));
  email.toAddresses.forEach(address => history.sentAddresses.add(address));
}

/**
 * Create empty email history
 */
export function createEmptyHistory(): EmailHistory {
  return {
    seenSenderDomains: new Set(),
    seenSenderAddresses: new Set(),
    sentDomains: new Set(),
    sentAddresses: new Set(),
  };
}
