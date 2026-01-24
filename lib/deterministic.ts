import type { Email, RuleResult } from './types';
import {
  hasReceivedFromDomain,
  hasReceivedFromAddress,
  hasSentToDomain,
  hasSentToAddress,
} from './gmail';

/**
 * Apply deterministic labels using Gmail search (no history needed)
 * Returns both matched labels and all rule results
 */
export async function applyDeterministicLabels(
  email: Email
): Promise<{ labels: string[]; results: RuleResult[] }> {
  const labels: string[] = [];
  const results: RuleResult[] = [];

  // Check if this is the first email from this domain
  const hasSeenDomain = await hasReceivedFromDomain(email.fromDomain, email.id);
  if (!hasSeenDomain) {
    labels.push('first-domain');
    results.push({
      ruleName: 'first-domain',
      matched: true,
      reason: `First email from domain ${email.fromDomain}`,
    });
  } else {
    results.push({
      ruleName: 'first-domain',
      matched: false,
      reason: `Previously received emails from domain ${email.fromDomain}`,
    });
  }

  // Check if this is the first email from this address
  const hasSeenAddress = await hasReceivedFromAddress(email.fromAddress, email.id);
  if (!hasSeenAddress) {
    labels.push('first-address');
    results.push({
      ruleName: 'first-address',
      matched: true,
      reason: `First email from address ${email.fromAddress}`,
    });
  } else {
    results.push({
      ruleName: 'first-address',
      matched: false,
      reason: `Previously received emails from address ${email.fromAddress}`,
    });
  }

  // Check if we've never sent to any of these domains
  if (email.toDomains.length > 0) {
    const hasEmailedDomain = await Promise.all(
      email.toDomains.map(domain => hasSentToDomain(domain))
    );
    const neverEmailedDomain = !hasEmailedDomain.some(Boolean);
    if (neverEmailedDomain) {
      labels.push('no-email-domain');
      results.push({
        ruleName: 'no-email-domain',
        matched: true,
        reason: `Never sent emails to domain(s): ${email.toDomains.join(', ')}`,
      });
    } else {
      results.push({
        ruleName: 'no-email-domain',
        matched: false,
        reason: `Previously sent emails to domain(s): ${email.toDomains.join(', ')}`,
      });
    }
  }

  // Check if we've never sent to any of these addresses
  if (email.toAddresses.length > 0) {
    const hasEmailedAddress = await Promise.all(
      email.toAddresses.map(address => hasSentToAddress(address))
    );
    const neverEmailedAddress = !hasEmailedAddress.some(Boolean);
    if (neverEmailedAddress) {
      labels.push('no-email-address');
      results.push({
        ruleName: 'no-email-address',
        matched: true,
        reason: `Never sent emails to address(es): ${email.toAddresses.join(', ')}`,
      });
    } else {
      results.push({
        ruleName: 'no-email-address',
        matched: false,
        reason: `Previously sent emails to address(es): ${email.toAddresses.join(', ')}`,
      });
    }
  }

  return { labels, results };
}
