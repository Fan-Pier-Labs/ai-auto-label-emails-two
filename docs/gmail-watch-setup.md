# Gmail Watch (Push Notifications) Setup

This doc describes the one-time Google Cloud setup so the app can receive Gmail push notifications and process new emails in real time.

## Overview

- When a user subscribes, the Stripe webhook calls Gmail API `users.watch` for their mailbox so Gmail publishes events to a **Google Cloud Pub/Sub topic**.
- You create that topic and a **push subscription** whose endpoint is your app’s webhook URL.
- New mail triggers a push to your endpoint; the app looks up the customer, fetches new message IDs from `history.list`, and runs AI/deterministic labeling.

## One-time GCP setup

Use the same Google Cloud project as your Gmail OAuth client.

### 1. Create a Pub/Sub topic

- In [Google Cloud Console](https://console.cloud.google.com/) → Pub/Sub → Topics.
- Create a topic, e.g. `gmail-watch`.
- Note the full name: `projects/<project-id>/topics/gmail-watch`.

### 2. Grant Gmail permission to publish

- Go to IAM & Admin → IAM.
- Find or add the principal: `gmail-api-push@system.gserviceaccount.com`.
- Grant it **Pub/Sub Publisher** (or a role that allows publishing to the topic).

### 3. Create a push subscription

- In Pub/Sub → Subscriptions, create a subscription.
- Choose **Push** and set the endpoint URL to your app’s webhook, e.g.  
  `https://<your-domain>/api/webhooks/gmail`
- If the subscription supports subscription verification, the app’s GET handler will respond to `hub.mode` / `hub.challenge`.

### 4. Configure the app

- Set the env var **GMAIL_PUBSUB_TOPIC** to the full topic name, e.g.  
  `projects/<project-id>/topics/gmail-watch`.

### 5. Push authentication (recommended)

To ensure only your Pub/Sub subscription can trigger the webhook, enable **OIDC token authentication** on the push subscription in GCP and set:

- **GMAIL_WEBHOOK_AUDIENCE** – The full webhook URL (must match the push endpoint URL), e.g.  
  `https://<your-domain>/api/webhooks/gmail`. This is the audience claim in the token.
- **GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL** – The service account email used by the push subscription (e.g.  
  `pubsub-push-auth@<project-id>.iam.gserviceaccount.com`).

The app verifies the `Authorization: Bearer <token>` JWT (signature, audience, issuer, and service account email) before processing any push. If either env var is missing, the webhook returns 401 for POST requests.

## Watch renewal

Gmail watch expires (typically within 7 days). Run the renewal script on a schedule (e.g. daily or every 6 hours):

```bash
bun run scripts/renew-gmail-watches.ts
```

Or invoke it from cron/Fargate. The script lists active Stripe subscribers, and for any whose `gmail_watch_expiration` is in the past or within 24 hours, it re-calls `users.watch` and updates Stripe customer metadata.

## Security

- The webhook at `/api/webhooks/gmail` is called by Google Pub/Sub. When **GMAIL_WEBHOOK_AUDIENCE** and **GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL** are set, the app validates the push JWT (Bearer token) before processing so only authenticated Pub/Sub requests are accepted.
- Do not expose internal endpoints; use your public app URL for the push subscription.
