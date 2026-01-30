# Sentry Setup

This project uses [Sentry](https://sentry.io) with `@sentry/nextjs` for error tracking, performance monitoring, session replay, and logging across client, server, and edge runtimes.

## Configuration Files

| File | Purpose |
|------|---------|
| `instrumentation.ts` | Entry point: loads server or edge config based on `NEXT_RUNTIME`; wires `onRequestError` to capture API/server errors |
| `instrumentation-client.ts` | Client-side init: DSN, replay, logs, router transitions |
| `sentry.server.config.ts` | Node.js server: DSN, traces, logs |
| `sentry.edge.config.ts` | Edge runtime (middleware, edge routes): same options as server |
| `app/global-error.tsx` | Root error boundary: reports uncaught errors via `Sentry.captureException(error)` |
| `next.config.mjs` | Wraps Next config with `withSentryConfig` for source maps, org/project, webpack options |

## Environment Variables

In `.env` (see `.env.example`):

- **`NEXT_PUBLIC_SENTRY_DSN`** — Required. Project DSN from [Sentry Project Settings → Client Keys (DSN)](https://docs.sentry.io/product/sentry-basics/dsn-explainer/).
- **`SENTRY_ORG`** — For builds: Sentry org slug (source map uploads).
- **`SENTRY_PROJECT`** — For builds: Sentry project slug.
- **`SENTRY_AUTH_TOKEN`** — For builds: auth token for uploads (create under Sentry → Settings → Auth Tokens).

Without the build-time vars, the app still runs; source map uploads and release tracking are skipped.

## Features Enabled

- **Error tracking** — Unhandled errors (client and server) and `global-error.tsx` exceptions are sent to Sentry.
- **Performance (traces)** — Sample rate: 100% in development, 10% in production (`tracesSampleRate` in server/edge configs).
- **Session Replay** — 10% of sessions, 100% of sessions where an error occurs (`replaysSessionSampleRate`, `replaysOnErrorSampleRate` in client config). Replay integration is configured with `maskAllText: false`, `maskAllInputs: false`, `blockAllMedia: false` (tune for privacy if needed).
- **Logs** — `enableLogs: true` in server, edge, and client configs.
- **Router transitions** — Client instrumentation exports `onRouterTransitionStart` for Next.js navigation timing.

## Build / Webpack

- **Source maps** — Uploaded via Sentry webpack plugin (`widenClientFileUpload: true` for broader coverage).
- **Tree-shaking** — `removeDebugLogging: true` to trim Sentry debug logging from the bundle.
- **Vercel Cron** — `automaticVercelMonitors: true` for cron monitor instrumentation (when using Vercel Cron).

Optional: uncomment `tunnelRoute: "/monitoring"` in `next.config.mjs` to send client events through a Next.js rewrite and reduce ad-blocker impact (with higher server load).

## Quick Start

1. Create a project at [sentry.io](https://sentry.io) and copy the DSN.
2. Set `NEXT_PUBLIC_SENTRY_DSN` in `.env`.
3. For source map uploads on build, set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`.
4. Run the app; errors and (depending on sample rates) replays and traces will appear in the Sentry dashboard.
