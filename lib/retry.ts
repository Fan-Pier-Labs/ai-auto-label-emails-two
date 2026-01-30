/**
 * Retry utility with exponential backoff for async operations.
 * Use for transient failures (network, 5xx, rate limits).
 */

export interface RetryOptions {
  /** Maximum number of attempts (including first try). Default 3. */
  maxAttempts?: number;
  /** Initial delay in ms before first retry. Default 1000. */
  initialDelayMs?: number;
  /** Cap on delay between retries in ms. Default 10000. */
  maxDelayMs?: number;
  /** If false, the error is not retried (e.g. 4xx client errors). Default: retry all. */
  isRetryable?: (error: unknown) => boolean;
}

const defaultIsRetryable = (): boolean => true;

/**
 * Run an async function with retries and exponential backoff.
 * @param fn - Async function to run (no args).
 * @param options - Retry options.
 * @returns The result of fn().
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    isRetryable = defaultIsRetryable,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === maxAttempts || !isRetryable(e)) {
        throw e;
      }
      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Predicate: retry on network/5xx/429, do not retry on other 4xx.
 * Use with fetch: throw Error with (err as any).status = response.status so this can detect it.
 */
export function isRetryableHttpError(error: unknown): boolean {
  if (error instanceof Response) {
    const status = error.status;
    return status >= 500 || status === 429;
  }
  const status = error && (error as { status?: number }).status;
  if (typeof status === 'number') {
    return status >= 500 || status === 429;
  }
  // Network errors, timeouts, etc. – retry
  return true;
}
