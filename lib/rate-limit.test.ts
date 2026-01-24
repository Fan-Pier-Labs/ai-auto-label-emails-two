import { test, expect, describe } from 'bun:test';
import { getClientIdentifier } from './rate-limit';
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

describe('getClientIdentifier', () => {
  test('should use x-forwarded-for header when present', () => {
    const request = createMockRequest({ forwardedFor: '192.168.1.1' });
    expect(getClientIdentifier(request)).toBe('192.168.1.1');
  });

  test('should use first IP from x-forwarded-for when multiple', () => {
    const request = createMockRequest({ forwardedFor: '192.168.1.1, 10.0.0.1, 172.16.0.1' });
    expect(getClientIdentifier(request)).toBe('192.168.1.1');
  });

  test('should use x-real-ip when x-forwarded-for is not present', () => {
    const request = createMockRequest({ realIp: '10.0.0.1' });
    expect(getClientIdentifier(request)).toBe('10.0.0.1');
  });

  test('should prefer x-forwarded-for over x-real-ip', () => {
    const request = createMockRequest({
      forwardedFor: '192.168.1.1',
      realIp: '10.0.0.1',
    });
    expect(getClientIdentifier(request)).toBe('192.168.1.1');
  });

  test('should return "unknown" when no IP headers present', () => {
    const request = createMockRequest({});
    expect(getClientIdentifier(request)).toBe('unknown');
  });

  test('should combine IP with cookie ID when cookie present', () => {
    const request = createMockRequest({
      forwardedFor: '192.168.1.1',
      cookieId: 'abc123',
    });
    expect(getClientIdentifier(request)).toBe('192.168.1.1-abc123');
  });

  test('should combine x-real-ip with cookie ID when cookie present', () => {
    const request = createMockRequest({
      realIp: '10.0.0.1',
      cookieId: 'xyz789',
    });
    expect(getClientIdentifier(request)).toBe('10.0.0.1-xyz789');
  });

  test('should use cookie ID with "unknown" IP when no IP headers', () => {
    const request = createMockRequest({
      cookieId: 'cookie123',
    });
    expect(getClientIdentifier(request)).toBe('unknown-cookie123');
  });

  test('should handle empty x-forwarded-for', () => {
    const request = createMockRequest({ forwardedFor: '' });
    expect(getClientIdentifier(request)).toBe('unknown');
  });

  test('should handle whitespace in x-forwarded-for', () => {
    // Note: The function uses split(',')[0] which preserves the string as-is
    const request = createMockRequest({ forwardedFor: '  192.168.1.1  ' });
    const result = getClientIdentifier(request);
    // The function preserves the string, but headers might trim - test actual behavior
    expect(result).toBeTruthy();
    expect(result.includes('192.168.1.1')).toBe(true);
  });

  test('should handle IPv6 addresses', () => {
    const request = createMockRequest({ forwardedFor: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' });
    expect(getClientIdentifier(request)).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
  });

  test('should handle multiple IPs with cookie', () => {
    const request = createMockRequest({
      forwardedFor: '192.168.1.1, 10.0.0.1',
      cookieId: 'test-cookie',
    });
    expect(getClientIdentifier(request)).toBe('192.168.1.1-test-cookie');
  });
});
