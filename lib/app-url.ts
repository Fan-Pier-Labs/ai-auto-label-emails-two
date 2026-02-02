/**
 * Base URL of the app (no trailing slash).
 * Use NEXT_APP_URL in production; fallback for local dev only.
 */
export function getAppBaseUrl(): string {
  const url = process.env.NEXT_APP_URL?.replace(/\/$/, '');
  if (url) return url;
  const port = process.env.PORT || '8080';
  return `http://localhost:${port}`;
}
