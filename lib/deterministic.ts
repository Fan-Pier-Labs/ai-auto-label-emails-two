import type { Email, RuleResult } from './types';
import {
  hasReceivedFromDomain,
  hasReceivedFromAddress,
  hasSentToDomain,
  hasSentToAddress,
} from './gmail';
import { promises as dns } from 'dns';

/**
 * Extract the base domain from a domain string (e.g., "mail.example.com" -> "example.com")
 * This is a simple implementation - for production, consider using a proper domain parsing library
 */
function getBaseDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) {
    return domain;
  }
  // Return the last two parts (e.g., "example.com" from "mail.example.com")
  return parts.slice(-2).join('.');
}

/**
 * Perform MX lookup for a domain
 * Returns array of MX records (hostnames) or null if lookup fails
 */
async function lookupMX(domain: string): Promise<string[] | null> {
  try {
    const mxRecords = await dns.resolveMx(domain);
    // Sort by priority (lower priority number = higher priority)
    mxRecords.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    return mxRecords.map(record => record.exchange.toLowerCase());
  } catch (error: any) {
    // DNS lookup failed - domain might not have MX records or doesn't exist
    return null;
  }
}

/**
 * Categorize SMTP provider based on MX records
 * Returns one of: 'gmail' | 'msft' | 'automation' | 'work-email' | 'other' | null
 * Returns null only if MX lookup failed (no records found)
 * Returns 'other' if MX records exist but don't match any known category
 */
function categorizeSMTPProvider(mxRecords: string[] | null): 'gmail' | 'msft' | 'automation' | 'work-email' | 'other' | null {
  if (!mxRecords || mxRecords.length === 0) {
    return null;
  }

  // Check all MX records (in case domain uses multiple providers)
  const allMX = mxRecords.join(' ').toLowerCase();

  // 1. Gmail
  if (allMX.includes('google') || allMX.includes('gmail') || allMX.includes('googlemail')) {
    return 'gmail';
  }

  // 2. Microsoft
  if (
    allMX.includes('outlook') ||
    allMX.includes('microsoft') ||
    allMX.includes('protection.outlook') ||
    allMX.includes('mail.protection.outlook') ||
    allMX.includes('exchange')
  ) {
    return 'msft';
  }

  // 3. Automation platforms
  if (
    allMX.includes('amazonses') ||
    allMX.includes('amazon-ses') ||
    allMX.includes('amazonaws') ||
    allMX.includes('inbound-smtp') ||
    allMX.includes('sendgrid') ||
    allMX.includes('mailgun') ||
    allMX.includes('mandrill') ||
    allMX.includes('postmark') ||
    allMX.includes('sparkpost') ||
    allMX.includes('mailchimp') ||
    allMX.includes('ses.') ||
    allMX.includes('mail-smtp') ||
    allMX.includes('smtp.sendgrid')
  ) {
    return 'automation';
  }

  // 4. Other work email (Zoho, etc.)
  // This is a catch-all for business email providers that aren't Gmail or Microsoft
  if (
    allMX.includes('zoho') ||
    allMX.includes('zmail') ||
    allMX.includes('protonmail') ||
    allMX.includes('fastmail') ||
    allMX.includes('mail.') ||
    allMX.includes('mx.') ||
    allMX.includes('smtp.') ||
    allMX.includes('mailhost')
  ) {
    return 'work-email';
  }

  // If we have MX records but can't categorize, return 'other'
  return 'other';
}

/**
 * Check if a domain is accessible via HTTP/HTTPS
 * Returns { isDown: boolean, redirectsToDifferentDomain: boolean | null, redirectTargetDomain: string | null }
 */
async function checkDomainStatus(domain: string): Promise<{
  isDown: boolean;
  redirectsToDifferentDomain: boolean | null;
  redirectTargetDomain: string | null;
}> {
  const timeout = 5000; // 5 second timeout
  const originalBaseDomain = getBaseDomain(domain);

  try {
    // Try HTTPS first
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`https://${domain}`, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EmailDomainChecker/1.0)',
        },
      });

      clearTimeout(timeoutId);

      // Check if the final URL is a different domain
      const finalUrl = response.url;
      const finalUrlObj = new URL(finalUrl);
      const finalBaseDomain = getBaseDomain(finalUrlObj.hostname);

      const redirectsToDifferentDomain = finalBaseDomain !== originalBaseDomain;

      return {
        isDown: false,
        redirectsToDifferentDomain: redirectsToDifferentDomain,
        redirectTargetDomain: redirectsToDifferentDomain ? finalBaseDomain : null,
      };
    } catch (httpsError: any) {
      clearTimeout(timeoutId);

      // If HTTPS fails, try HTTP
      if (httpsError.name === 'AbortError' || httpsError.message?.includes('fetch')) {
        const httpController = new AbortController();
        const httpTimeoutId = setTimeout(() => httpController.abort(), timeout);

        try {
          const httpResponse = await fetch(`http://${domain}`, {
            method: 'GET',
            signal: httpController.signal,
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; EmailDomainChecker/1.0)',
            },
          });

          clearTimeout(httpTimeoutId);

          // Check if the final URL is a different domain
          const finalUrl = httpResponse.url;
          const finalUrlObj = new URL(finalUrl);
          const finalBaseDomain = getBaseDomain(finalUrlObj.hostname);

          const redirectsToDifferentDomain = finalBaseDomain !== originalBaseDomain;

          return {
            isDown: false,
            redirectsToDifferentDomain: redirectsToDifferentDomain,
            redirectTargetDomain: redirectsToDifferentDomain ? finalBaseDomain : null,
          };
        } catch (httpError: any) {
          clearTimeout(httpTimeoutId);
          // Both HTTPS and HTTP failed
          return {
            isDown: true,
            redirectsToDifferentDomain: null,
            redirectTargetDomain: null,
          };
        }
      } else {
        // HTTPS error that's not a timeout/fetch error
        return {
          isDown: true,
          redirectsToDifferentDomain: null,
          redirectTargetDomain: null,
        };
      }
    }
  } catch (error: any) {
    // Any other error means the domain is down
    return {
      isDown: true,
      redirectsToDifferentDomain: null,
      redirectTargetDomain: null,
    };
  }
}

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

  // Check domain status (down and redirects) - do both checks in one call
  if (email.fromDomain) {
    try {
      const domainStatus = await checkDomainStatus(email.fromDomain);
      
      // Check if domain is down
      if (domainStatus.isDown) {
        labels.push('domain-down');
        results.push({
          ruleName: 'domain-down',
          matched: true,
          reason: `Domain ${email.fromDomain} is not accessible (HTTP/HTTPS request failed)`,
        });
      } else {
        results.push({
          ruleName: 'domain-down',
          matched: false,
          reason: `Domain ${email.fromDomain} is accessible`,
        });
      }

      // Check if domain redirects to a different domain (excluding gmail.com domain)
      if (domainStatus.redirectsToDifferentDomain === true) {
        // Make exception for gmail.com - don't label as domain-redirects if the FROM domain is gmail.com
        const fromDomainLower = email.fromDomain.toLowerCase();
        const isGmailDomain = fromDomainLower === 'gmail.com';
        
        if (!isGmailDomain) {
          labels.push('domain-redirects');
          results.push({
            ruleName: 'domain-redirects',
            matched: true,
            reason: `Domain ${email.fromDomain} redirects to a different domain and is not gmail.com`,
          });
        } else {
          results.push({
            ruleName: 'domain-redirects',
            matched: false,
            reason: `Domain ${email.fromDomain} is gmail.com (exception: Gmail domain redirects are not flagged)`,
          });
        }
      } else if (domainStatus.redirectsToDifferentDomain === false) {
        results.push({
          ruleName: 'domain-redirects',
          matched: false,
          reason: `Domain ${email.fromDomain} does not redirect to a different domain`,
        });
      } else {
        // Domain is down, so we can't check redirects
        results.push({
          ruleName: 'domain-redirects',
          matched: false,
          reason: `Domain ${email.fromDomain} is down, cannot check redirects`,
        });
      }
    } catch (error: any) {
      // If check fails for any reason, consider it as domain down
      labels.push('domain-down');
      results.push({
        ruleName: 'domain-down',
        matched: true,
        reason: `Domain ${email.fromDomain} check failed: ${error.message || 'Unknown error'}`,
      });
      results.push({
        ruleName: 'domain-redirects',
        matched: false,
        reason: `Could not check redirect status for ${email.fromDomain}: ${error.message || 'Unknown error'}`,
      });
    }
  }

  // Check SMTP provider based on MX lookup
  if (email.fromDomain) {
    try {
      const mxRecords = await lookupMX(email.fromDomain);
      const provider = categorizeSMTPProvider(mxRecords);

      // Rule 1: Gmail
      if (provider === 'gmail') {
        labels.push('smtp-gmail');
        results.push({
          ruleName: 'smtp-gmail',
          matched: true,
          reason: `Domain ${email.fromDomain} uses Gmail SMTP (MX: ${mxRecords?.join(', ') || 'unknown'})`,
        });
      } else {
        results.push({
          ruleName: 'smtp-gmail',
          matched: false,
          reason: `Domain ${email.fromDomain} does not use Gmail SMTP`,
        });
      }

      // Rule 2: Microsoft
      if (provider === 'msft') {
        labels.push('smtp-msft');
        results.push({
          ruleName: 'smtp-msft',
          matched: true,
          reason: `Domain ${email.fromDomain} uses Microsoft SMTP (MX: ${mxRecords?.join(', ') || 'unknown'})`,
        });
      } else {
        results.push({
          ruleName: 'smtp-msft',
          matched: false,
          reason: `Domain ${email.fromDomain} does not use Microsoft SMTP`,
        });
      }

      // Rule 3: Automation platform
      if (provider === 'automation') {
        labels.push('smtp-automation');
        results.push({
          ruleName: 'smtp-automation',
          matched: true,
          reason: `Domain ${email.fromDomain} uses automation platform SMTP (MX: ${mxRecords?.join(', ') || 'unknown'})`,
        });
      } else {
        results.push({
          ruleName: 'smtp-automation',
          matched: false,
          reason: `Domain ${email.fromDomain} does not use automation platform SMTP`,
        });
      }

      // Rule 4: Other work email
      if (provider === 'work-email') {
        labels.push('smtp-work-email');
        results.push({
          ruleName: 'smtp-work-email',
          matched: true,
          reason: `Domain ${email.fromDomain} uses work email provider SMTP (MX: ${mxRecords?.join(', ') || 'unknown'})`,
        });
      } else {
        results.push({
          ruleName: 'smtp-work-email',
          matched: false,
          reason: `Domain ${email.fromDomain} does not use work email provider SMTP`,
        });
      }

      // Rule 5: Other (uncategorized SMTP provider)
      if (provider === 'other') {
        labels.push('smtp-other');
        results.push({
          ruleName: 'smtp-other',
          matched: true,
          reason: `Domain ${email.fromDomain} uses uncategorized SMTP provider (MX: ${mxRecords?.join(', ') || 'unknown'})`,
        });
      } else {
        results.push({
          ruleName: 'smtp-other',
          matched: false,
          reason: provider === null 
            ? `MX lookup failed for ${email.fromDomain}, cannot determine SMTP provider`
            : `Domain ${email.fromDomain} matches a known SMTP provider category`,
        });
      }
    } catch (error: any) {
      // If MX lookup fails, mark all rules as not matched
      results.push({
        ruleName: 'smtp-gmail',
        matched: false,
        reason: `MX lookup failed for ${email.fromDomain}: ${error.message || 'Unknown error'}`,
      });
      results.push({
        ruleName: 'smtp-msft',
        matched: false,
        reason: `MX lookup failed for ${email.fromDomain}: ${error.message || 'Unknown error'}`,
      });
      results.push({
        ruleName: 'smtp-automation',
        matched: false,
        reason: `MX lookup failed for ${email.fromDomain}: ${error.message || 'Unknown error'}`,
      });
      results.push({
        ruleName: 'smtp-work-email',
        matched: false,
        reason: `MX lookup failed for ${email.fromDomain}: ${error.message || 'Unknown error'}`,
      });
      results.push({
        ruleName: 'smtp-other',
        matched: false,
        reason: `MX lookup failed for ${email.fromDomain}: ${error.message || 'Unknown error'}`,
      });
    }
  }

  return { labels, results };
}
