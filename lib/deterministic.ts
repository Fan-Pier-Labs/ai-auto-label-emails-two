import type { Email, RuleResult } from './types';
import {
  hasReceivedFromDomain,
  hasReceivedFromAddress,
  hasSentToDomain,
  hasSentToAddress,
} from './gmail';
import { promises as dns } from 'dns';
import { lookup as whoisLookup } from 'whois';
import { createConnection } from 'net';

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
 * Check if a domain is registered in the last N months
 * Returns { isNewDomain: boolean, registrationDate: Date | null }
 */
/**
 * Get WHOIS server for a specific TLD
 * Returns the WHOIS server hostname or null if unknown
 */
function getWhoisServerForTld(tld: string): string | null {
  const tldLower = tld.toLowerCase();
  
  // Map of TLDs to their WHOIS servers
  const tldServers: Record<string, string> = {
    'help': 'whois.nic.help',
    // Add more TLDs as needed
  };
  
  return tldServers[tldLower] || null;
}

/**
 * Query WHOIS server directly via TCP connection
 * This is used as a fallback when the whois package doesn't support a TLD
 */
async function queryWhoisDirectly(domain: string, server: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(43, server);
    let data = '';
    let timeout: NodeJS.Timeout;
    
    // Set timeout
    timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('WHOIS query timeout'));
    }, 10000); // 10 second timeout
    
    socket.on('connect', () => {
      // Send WHOIS query
      socket.write(`${domain}\r\n`);
    });
    
    socket.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    
    socket.on('end', () => {
      clearTimeout(timeout);
      resolve(data);
    });
    
    socket.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function checkDomainRegistrationDate(domain: string, months: number = 3): Promise<{
  isNewDomain: boolean;
  registrationDate: Date | null;
}> {
  try {
    const baseDomain = getBaseDomain(domain);
    const tld = baseDomain.split('.').pop() || '';
    
    // Get WHOIS server for this TLD if known
    const whoisServer = getWhoisServerForTld(tld);
    
    let whoisData: string = '';
    
    // Try direct WHOIS lookup first
    try {
      whoisData = await new Promise<string>((resolve, reject) => {
        const options = whoisServer ? { server: whoisServer } : {};
        whoisLookup(baseDomain, options, (err: Error | null, data: string | any) => {
          if (err) {
            reject(err);
          } else {
            // Handle both string and array responses
            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
            resolve(dataStr);
          }
        });
      });
    } catch (whoisError: any) {
      // If direct WHOIS fails (e.g., TLD not supported), try direct TCP connection
      // This is especially useful for newer TLDs like .help
      if (tld === 'help' || whoisError.message?.includes('no whois server')) {
        if (whoisServer) {
          try {
            const directData = await queryWhoisDirectly(baseDomain, whoisServer);
            if (directData) {
              whoisData = directData;
            } else {
              // Direct connection failed
              return {
                isNewDomain: false,
                registrationDate: null,
              };
            }
          } catch (directError: any) {
            // Direct connection also failed
            return {
              isNewDomain: false,
              registrationDate: null,
            };
          }
        } else {
          // No WHOIS server configured for this TLD
          return {
            isNewDomain: false,
            registrationDate: null,
          };
        }
      } else {
        // Re-throw if it's not a TLD support issue
        throw whoisError;
      }
    }

    // Parse registration date from WHOIS data
    // Common patterns: "Creation Date:", "Registered on:", "created:", "Registration Date:"
    const whoisLower = whoisData.toLowerCase();
    let registrationDate: Date | null = null;

    // Try to find creation/registration date
    // Add more flexible patterns including various date formats and field names
    const datePatterns = [
      // ISO format dates (YYYY-MM-DD)
      /(?:creation|created|registration|registered|domain created|domain registration)[\s:]+date[\s:]*(\d{4}-\d{2}-\d{2})/i,
      /(?:creation|created|registration|registered)[\s:]+on[\s:]*(\d{4}-\d{2}-\d{2})/i,
      /(?:creation|created|registration|registered)[\s:]+(\d{4}-\d{2}-\d{2})/i,
      // US format (MM/DD/YYYY)
      /(?:creation|created|registration|registered|domain created|domain registration)[\s:]+date[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(?:creation|created|registration|registered)[\s:]+on[\s:]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
      // European format (DD-MM-YYYY)
      /(?:creation|created|registration|registered|domain created|domain registration)[\s:]+date[\s:]*(\d{1,2}-\d{1,2}-\d{4})/i,
      /(?:creation|created|registration|registered)[\s:]+on[\s:]*(\d{1,2}-\d{1,2}-\d{4})/i,
      // Generic date patterns
      /(?:creation|created|registration|registered)[\s:]+date[\s:]*(\d{4}\.\d{2}\.\d{2})/i,
      // Try to match any date-like pattern near "created" or "registration"
      /created[^:]*:[\s]*([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i,
      /registration[^:]*:[\s]*([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i,
    ];

    for (const pattern of datePatterns) {
      const match = whoisData.match(pattern);
      if (match && match[1]) {
        try {
          const dateStr = match[1].trim();
          registrationDate = new Date(dateStr);
          // Validate the date is reasonable (not too far in past/future)
          const minDate = new Date('1990-01-01');
          const maxDate = new Date();
          maxDate.setFullYear(maxDate.getFullYear() + 1); // Allow 1 year in future for edge cases
          
          if (!isNaN(registrationDate.getTime()) && 
              registrationDate >= minDate && 
              registrationDate <= maxDate) {
            break;
          } else {
            registrationDate = null; // Reset if invalid
          }
        } catch (e) {
          // Continue to next pattern
          registrationDate = null;
        }
      }
    }

    if (!registrationDate || isNaN(registrationDate.getTime())) {
      return {
        isNewDomain: false,
        registrationDate: null,
      };
    }

    // Check if registration date is within the last N months
    const now = new Date();
    const monthsAgo = new Date();
    monthsAgo.setMonth(now.getMonth() - months);

    const isNewDomain = registrationDate >= monthsAgo;

    return {
      isNewDomain,
      registrationDate,
    };
  } catch (error: any) {
    // If WHOIS lookup fails, we can't determine if it's a new domain
    return {
      isNewDomain: false,
      registrationDate: null,
    };
  }
}

/**
 * Check if domain resolves and has gmail/etc as mail provider
 * Returns { resolves: boolean, hasKnownMailProvider: boolean, provider: string | null }
 */
async function checkDomainResolvesWithMailProvider(domain: string): Promise<{
  resolves: boolean;
  hasKnownMailProvider: boolean;
  provider: string | null;
}> {
  try {
    const baseDomain = getBaseDomain(domain);
    
    // Check if domain resolves (try A record first, then AAAA)
    let resolves = false;
    try {
      await dns.resolve4(baseDomain);
      resolves = true;
    } catch (e) {
      try {
        await dns.resolve6(baseDomain);
        resolves = true;
      } catch (e2) {
        resolves = false;
      }
    }

    // Check MX records to determine mail provider
    const mxRecords = await lookupMX(baseDomain);
    const provider = categorizeSMTPProvider(mxRecords);

    // Known mail providers are: gmail, msft, automation, work-email
    // We exclude 'other' and null as they're not "known" providers
    const hasKnownMailProvider = provider !== null && provider !== 'other';

    return {
      resolves,
      hasKnownMailProvider,
      provider,
    };
  } catch (error: any) {
    return {
      resolves: false,
      hasKnownMailProvider: false,
      provider: null,
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

  // Check if domain is registered in the last 3 months (new-domain)
  if (email.fromDomain) {
    try {
      const domainRegCheck = await checkDomainRegistrationDate(email.fromDomain, 3);
      if (domainRegCheck.isNewDomain && domainRegCheck.registrationDate) {
        labels.push('new-domain');
        results.push({
          ruleName: 'new-domain',
          matched: true,
          reason: `Domain ${email.fromDomain} was registered on ${domainRegCheck.registrationDate.toISOString().split('T')[0]} (within last 3 months)`,
        });
      } else {
        results.push({
          ruleName: 'new-domain',
          matched: false,
          reason: domainRegCheck.registrationDate
            ? `Domain ${email.fromDomain} was registered on ${domainRegCheck.registrationDate.toISOString().split('T')[0]} (more than 3 months ago)`
            : `Could not determine registration date for domain ${email.fromDomain}`,
        });
      }
    } catch (error: any) {
      results.push({
        ruleName: 'new-domain',
        matched: false,
        reason: `Failed to check registration date for ${email.fromDomain}: ${error.message || 'Unknown error'}`,
      });
    }
  }

  // Check if domain resolves and has gmail/etc as mail provider
  if (email.fromDomain) {
    try {
      const domainResolveCheck = await checkDomainResolvesWithMailProvider(email.fromDomain);
      if (domainResolveCheck.resolves && domainResolveCheck.hasKnownMailProvider) {
        labels.push('domain-resolves-known-provider');
        results.push({
          ruleName: 'domain-resolves-known-provider',
          matched: true,
          reason: `Domain ${email.fromDomain} resolves and uses known mail provider: ${domainResolveCheck.provider || 'unknown'}`,
        });
      } else {
        results.push({
          ruleName: 'domain-resolves-known-provider',
          matched: false,
          reason: !domainResolveCheck.resolves
            ? `Domain ${email.fromDomain} does not resolve (DNS lookup failed)`
            : !domainResolveCheck.hasKnownMailProvider
            ? `Domain ${email.fromDomain} resolves but does not use a known mail provider (gmail/msft/automation/work-email)`
            : `Domain ${email.fromDomain} check failed`,
        });
      }
    } catch (error: any) {
      results.push({
        ruleName: 'domain-resolves-known-provider',
        matched: false,
        reason: `Failed to check domain resolution and mail provider for ${email.fromDomain}: ${error.message || 'Unknown error'}`,
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


if (require.main === module) {
  // here 
}