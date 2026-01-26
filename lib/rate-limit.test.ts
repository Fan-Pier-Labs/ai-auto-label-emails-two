import { test, expect, describe, beforeEach } from 'bun:test';
import { getIpAddress, getCookieId, checkCombinedRateLimit, checkRateLimit } from './rate-limit';
import { NextRequest } from 'next/server';

// Helper to create a mock NextRequest
function createMockRequest(options: {
  forwardedFor?: string;
  realIp?: string;
  cookieId?: string;
}): NextRequest {
  const headers = new Headers();
  if (options.forwardedFor) {
    headers.set('x-forwarded-for', options.forwardedFor);
  }
  if (options.realIp) {
    headers.set('x-real-ip', options.realIp);
  }

  const cookies = new Map<string, string>();
  if (options.cookieId) {
    cookies.set('client_id', options.cookieId);
  }

  // Create a mock request object
  const request = {
    headers,
    cookies: {
      get: (name: string) => {
        const value = cookies.get(name);
        return value ? { value } : undefined;
      },
    },
  } as unknown as NextRequest;

  return request;
}

describe('getIpAddress', () => {
  test('should use x-forwarded-for header when present', () => {
    const request = createMockRequest({ forwardedFor: '192.168.1.1' });
    expect(getIpAddress(request)).toBe('192.168.1.1');
  });

  test('should use first IP from x-forwarded-for when multiple', () => {
    const request = createMockRequest({ forwardedFor: '192.168.1.1, 10.0.0.1, 172.16.0.1' });
    expect(getIpAddress(request)).toBe('192.168.1.1');
  });

  test('should use x-real-ip when x-forwarded-for is not present', () => {
    const request = createMockRequest({ realIp: '10.0.0.1' });
    expect(getIpAddress(request)).toBe('10.0.0.1');
  });

  test('should prefer x-forwarded-for over x-real-ip', () => {
    const request = createMockRequest({
      forwardedFor: '192.168.1.1',
      realIp: '10.0.0.1',
    });
    expect(getIpAddress(request)).toBe('192.168.1.1');
  });

  test('should return "unknown" when no IP headers present', () => {
    const request = createMockRequest({});
    expect(getIpAddress(request)).toBe('unknown');
  });

  test('should handle IPv6 addresses', () => {
    const request = createMockRequest({ forwardedFor: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' });
    expect(getIpAddress(request)).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
  });
});

describe('getCookieId', () => {
  test('should return cookie ID when present', () => {
    const request = createMockRequest({ cookieId: 'abc123' });
    expect(getCookieId(request)).toBe('abc123');
  });

  test('should return null when cookie not present', () => {
    const request = createMockRequest({});
    expect(getCookieId(request)).toBeNull();
  });

  test('should return null when cookie is empty', () => {
    const request = createMockRequest({ cookieId: '' });
    expect(getCookieId(request)).toBeNull();
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    // Clear rate limit store before each test
    // Note: This is a workaround since we can't directly access the store
    // In a real scenario, you might want to expose a reset function
  });

  test('should allow first request', () => {
    const result = checkRateLimit('test-id', { maxRequests: 10, windowMs: 60000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('should block after max requests', () => {
    const identifier = 'test-id-block';
    const config = { maxRequests: 3, windowMs: 60000 };
    
    // Make 3 requests
    checkRateLimit(identifier, config);
    checkRateLimit(identifier, config);
    checkRateLimit(identifier, config);
    
    // 4th should be blocked
    const result = checkRateLimit(identifier, config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test('should reset after window expires', () => {
    const identifier = 'test-id-reset';
    const config = { maxRequests: 2, windowMs: 100 }; // 100ms window
    
    // Make 2 requests
    checkRateLimit(identifier, config);
    checkRateLimit(identifier, config);
    
    // Wait for window to expire
    Bun.sleepSync(150);
    
    // Should be allowed again
    const result = checkRateLimit(identifier, config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });
});

describe('checkCombinedRateLimit', () => {
  test('should check IP limit when no cookie', () => {
    const request = createMockRequest({ forwardedFor: '192.168.1.1' });
    const result = checkCombinedRateLimit(request, { maxRequests: 100, windowMs: 60000 });
    
    expect(result.allowed).toBe(true);
    expect(result.identifier).toBe('ip');
    expect(result.remaining).toBe(99);
  });

  test('should check both IP and cookie limits', () => {
    const request = createMockRequest({ 
      forwardedFor: '192.168.1.1',
      cookieId: 'test-cookie-123'
    });
    const result = checkCombinedRateLimit(request, { maxRequests: 100, windowMs: 60000 });
    
    expect(result.allowed).toBe(true);
    expect(['ip', 'cookie']).toContain(result.identifier);
  });

  test('should block when IP limit exceeded', () => {
    const request = createMockRequest({ forwardedFor: '192.168.1.1' });
    const config = { maxRequests: 2, windowMs: 60000 };
    
    // Exhaust IP limit
    checkCombinedRateLimit(request, config);
    checkCombinedRateLimit(request, config);
    checkCombinedRateLimit(request, config);
    
    const result = checkCombinedRateLimit(request, config);
    expect(result.allowed).toBe(false);
    expect(result.identifier).toBe('ip');
  });

  test('should block when cookie limit exceeded', () => {
    const request = createMockRequest({ 
      forwardedFor: '192.168.1.1',
      cookieId: 'test-cookie-block'
    });
    const config = { maxRequests: 2, windowMs: 60000 };
    
    // Exhaust cookie limit
    checkCombinedRateLimit(request, config);
    checkCombinedRateLimit(request, config);
    checkCombinedRateLimit(request, config);
    
    const result = checkCombinedRateLimit(request, config);
    expect(result.allowed).toBe(false);
    expect(result.identifier).toBe('cookie');
  });

  test('should return most restrictive limit', () => {
    const config = { maxRequests: 10, windowMs: 60000 };
    
    // Make requests with IP only to reduce IP remaining count
    const ipOnlyRequest = createMockRequest({ forwardedFor: '192.168.1.100' });
    for (let i = 0; i < 7; i++) {
      checkCombinedRateLimit(ipOnlyRequest, config);
    }
    // IP now has 3 remaining (10 - 7 = 3)
    
    // Make 1 request with cookie only (different IP to not affect IP limit)
    const cookieOnlyRequest = createMockRequest({ 
      forwardedFor: '192.168.1.200',
      cookieId: 'test-restrictive-cookie'
    });
    checkCombinedRateLimit(cookieOnlyRequest, config);
    // Cookie now has 9 remaining (10 - 1 = 9)
    
    // Now make a request with both IP and cookie
    // IP has 3 remaining, cookie has 9 remaining, so IP should be returned
    const combinedRequest = createMockRequest({ 
      forwardedFor: '192.168.1.100', // Same IP as ipOnlyRequest
      cookieId: 'test-restrictive-cookie'
    });
    const result = checkCombinedRateLimit(combinedRequest, config);
    expect(result.allowed).toBe(true);
    expect(result.identifier).toBe('ip');
    expect(result.remaining).toBe(2); // IP had 3 remaining, now has 2 after this request
  });
});
