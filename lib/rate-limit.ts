import { NextRequest } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Global daily rate limit (across all users)
let globalDailyCount = 0;
let globalDailyResetAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
  
  // Reset global daily counter if window expired
  if (now > globalDailyResetAt) {
    globalDailyCount = 0;
    globalDailyResetAt = now + (24 * 60 * 60 * 1000);
  }
}, 10 * 60 * 1000);

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface CombinedRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  identifier: string;
}

export interface GlobalRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Get IP address from request headers
 */
export function getIpAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0]?.trim() ?? realIp ?? 'unknown';
}

/**
 * Get cookie ID from request (should be a v4 UUID)
 */
export function getCookieId(request: NextRequest): string | null {
  return request.cookies.get('client_id')?.value ?? null;
}

/**
 * Check rate limit for a single identifier
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 10, windowMs: 60000 }
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // If no entry or window expired, create new entry
  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  // Increment count
  entry.count++;
  return { 
    allowed: true, 
    remaining: config.maxRequests - entry.count, 
    resetAt: entry.resetAt 
  };
}

/**
 * Check rate limits for both IP and cookie (if present)
 * Returns the most restrictive limit
 * Both limits are checked and incremented independently
 */
export function checkCombinedRateLimit(
  request: NextRequest,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 24 * 60 * 60 * 1000 } // 100 requests per day
): CombinedRateLimitResult {
  const ip = getIpAddress(request);
  const cookieId = getCookieId(request);

  // If no cookie, only check IP
  if (!cookieId) {
    const ipLimit = checkRateLimit(`ip:${ip}`, config);
    return {
      ...ipLimit,
      identifier: 'ip',
    };
  }

  // Check both limits (both will be incremented if allowed)
  const ipLimit = checkRateLimit(`ip:${ip}`, config);
  const cookieLimit = checkRateLimit(`cookie:${cookieId}`, config);

  // If either is blocked, return the blocked one (prefer cookie as it's more specific)
  if (!cookieLimit.allowed) {
    return {
      ...cookieLimit,
      identifier: 'cookie',
    };
  }
  if (!ipLimit.allowed) {
    return {
      ...ipLimit,
      identifier: 'ip',
    };
  }

  // Both allowed - return the one with fewer remaining requests
  if (ipLimit.remaining <= cookieLimit.remaining) {
    return {
      ...ipLimit,
      identifier: 'ip',
    };
  }
  return {
    ...cookieLimit,
    identifier: 'cookie',
  };
}

/**
 * Check global daily rate limit (across all users)
 * This prevents excessive AI credit usage
 * @param maxRequests Maximum requests allowed per day (default: 1000)
 * @param windowMs Time window in milliseconds (default: 24 hours)
 * @param increment If true, increment the counter (default: true)
 */
export function checkGlobalDailyRateLimit(
  maxRequests: number = 1000,
  windowMs: number = 24 * 60 * 60 * 1000, // 24 hours
  increment: boolean = true
): GlobalRateLimitResult {
  const now = Date.now();
  
  // Reset if window expired
  if (now > globalDailyResetAt) {
    globalDailyCount = 0;
    globalDailyResetAt = now + windowMs;
  }
  
  // Check if limit exceeded
  if (globalDailyCount >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: globalDailyResetAt,
    };
  }
  
  // Increment count only if requested
  if (increment) {
    globalDailyCount++;
  }
  
  return {
    allowed: true,
    remaining: maxRequests - (increment ? globalDailyCount : globalDailyCount + 1),
    resetAt: globalDailyResetAt,
  };
}
