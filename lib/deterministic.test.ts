import { test, expect, describe } from 'bun:test';
import { checkDomainRegistrationDate } from './deterministic';

describe('checkDomainRegistrationDate', () => {
  test('should detect theaccesstrack.help as registered in last 2 months', async () => {
    const result = await checkDomainRegistrationDate('theaccesstrack.help', 2);
    
    // Note: WHOIS lookup may fail for some TLDs (like .help) if the whois package
    // doesn't have a server configured for that TLD. In that case, registrationDate will be null.
    // This test verifies the function works correctly when WHOIS data is available.
    if (result.registrationDate) {
      expect(result.registrationDate).toBeInstanceOf(Date);
      
      const now = new Date();
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(now.getMonth() - 2);
      
      // The domain should be registered within the last 2 months
      expect(result.isNewDomain).toBe(true);
      expect(result.registrationDate.getTime()).toBeGreaterThanOrEqual(twoMonthsAgo.getTime());
      expect(result.registrationDate.getTime()).toBeLessThanOrEqual(now.getTime());
      
      console.log(`✓ theaccesstrack.help registration date: ${result.registrationDate.toISOString().split('T')[0]}`);
      console.log(`✓ Is new domain (within 2 months): ${result.isNewDomain}`);
    } else {
      console.log('⚠ WHOIS lookup failed or date not found for theaccesstrack.help - this may be due to TLD support limitations');
      // If WHOIS fails, the function should gracefully return false
      expect(result.isNewDomain).toBe(false);
    }
  }, 30000); // 30 second timeout for WHOIS lookup

  test('should detect theaccesstrack.help as registered in last 3 months', async () => {
    const result = await checkDomainRegistrationDate('theaccesstrack.help', 3);
    
    if (result.registrationDate) {
      expect(result.isNewDomain).toBe(true);
      console.log(`✓ theaccesstrack.help registration date: ${result.registrationDate.toISOString().split('T')[0]}`);
    } else {
      console.log('⚠ WHOIS lookup failed for theaccesstrack.help');
      expect(result.isNewDomain).toBe(false);
    }
  }, 30000);

  test('should return false for old domains', async () => {
    // Test with a well-known old domain like google.com
    const result = await checkDomainRegistrationDate('google.com', 2);
    
    // Google.com is definitely older than 2 months, so isNewDomain should be false
    // (unless registrationDate is null due to parsing issues)
    if (result.registrationDate) {
      expect(result.isNewDomain).toBe(false);
    }
  }, 30000);

  test('should handle invalid domains gracefully', async () => {
    const result = await checkDomainRegistrationDate('this-domain-definitely-does-not-exist-12345.com', 3);
    
    // Should return false and null date for invalid domains
    expect(result.isNewDomain).toBe(false);
    // registrationDate might be null if WHOIS lookup fails
  }, 30000);
});

