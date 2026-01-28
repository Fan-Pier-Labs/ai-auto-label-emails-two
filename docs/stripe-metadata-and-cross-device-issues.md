# Stripe metadata & cross-device – issues summary

> **Solution:** See [architecture-redis-nextauth-solution.md](./architecture-redis-nextauth-solution.md) for how Redis + NextAuth solves all these issues.

## Stripe metadata (storing Google token + sheet ID)

- **500-character limit per value** – Refresh token usually fits; no room for extra data in the same key.
- **Not a secrets store** – Metadata is plain text in API/Dashboard; anyone with Stripe access can read tokens.
- **Blast radius** – Compromised Stripe account/key exposes all customer refresh tokens.
- **Google OAuth / ToS** – Storing refresh tokens in a third-party system may conflict with Google’s guidance.
- **Token lifecycle** – Metadata is only updated on checkout; re-auth or token rotation requires your app to update the same customer’s metadata.
- **Race with checkout** – Processor can run before webhook writes metadata; need retry or ordering so processor doesn’t see “no token.”
- **Vendor lock-in** – Migrating off Stripe means moving tokens to another store.
- **Dashboard edits** – Someone can change or clear metadata in Stripe Dashboard and break that customer.

## Cross-device / returning user (another platform or browser)

- **OAuth then pay on different device** – Works only if same server process and within ~30 min; otherwise in-memory token is gone and webhook can’t attach it.
- **No cross-device identity** – No login/session; you can’t recognize “same user” on a new device without adding auth (e.g. magic link, login).
- **Can’t reconnect Gmail or change sheet from new device** – Without a way to identify the user (e.g. dashboard login), you can’t update the right Stripe customer’s metadata.
- **Processor is fine** – Labeling runs server-side from Stripe (or your store); device/browser doesn’t matter once token is stored.
