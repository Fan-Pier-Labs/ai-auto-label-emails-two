# Architecture: Redis + NextAuth Solution

## TLDR

### Current Problems

| Category | Issue | Severity |
|----------|-------|----------|
| Security | Gmail refresh tokens stored in Stripe metadata (plain text, visible in Dashboard) | High |
| Security | Compromised Stripe account = all tokens exposed | High |
| Reliability | OAuth → Checkout on different device fails (30-min in-memory window) | High |
| Reliability | Token expires/revokes go undetected until processor fails | High |
| Reliability | No scheduled processing for all customers | Medium |
| UX | No way to recognize returning user on new device | Medium |
| UX | Can't reconnect Gmail or change sheet from another device | Medium |
| UX | User not notified when their token breaks | Medium |
| Limits | Stripe metadata 500-char limit per value | Low |
| Ops | Dashboard edits can break customer config | Medium |
| Ops | Vendor lock-in (tokens in Stripe) | Medium |
| Compliance | Storing tokens in third-party may conflict with Google ToS | Medium |

### New Approach

**Redis** = Store tokens and customer config in your own infrastructure (not Stripe).

**NextAuth (Google SSO)** = Provide cross-device identity with session-based auth.

| Solution | What it solves |
|----------|----------------|
| Redis | Token security, 500-char limits, race conditions, vendor lock-in, dashboard edits |
| NextAuth | Cross-device identity, returning user recognition, protected settings/reconnect |
| Fargate Cron | Token health monitoring, proactive notifications, scheduled processing |
| All together | Complete solution for security, reliability, UX, and operations |

---

## All Issues (Detailed)

### 1. Stripe Metadata Issues

#### 1.1 Not a Secrets Store

**Problem:** Stripe metadata is plain text. Anyone with Stripe Dashboard or API access can see `gmail_refresh_token`. This includes:
- All team members with Stripe access
- Any leaked Stripe API key
- Stripe support (in some cases)

**Risk:** Refresh tokens are as sensitive as account passwords. Exposure allows reading/sending email as the user.

#### 1.2 Blast Radius

**Problem:** If the Stripe account or API key is compromised, ALL customer refresh tokens are exposed in one breach.

**Risk:** Single point of failure for all users' Gmail credentials.

#### 1.3 500-Character Limit

**Problem:** Each Stripe metadata value is limited to 500 characters. Gmail refresh tokens are typically 100-200 chars, but:
- No room for structured data in one key
- Can't store encrypted/wrapped tokens (longer)
- Future token format changes could exceed limit

#### 1.4 Token Lifecycle

**Problem:** Current flow only updates metadata on `checkout.session.completed`. If user needs to:
- Re-authorize Gmail (token revoked/expired)
- Update their sheet ID
- Rotate credentials

...there's no built-in way to update the same customer's metadata without another checkout.

#### 1.5 Race with Checkout

**Problem:** Sequence:
1. User completes OAuth → token stored in memory
2. User completes Stripe checkout → webhook fires
3. Webhook reads token from memory → writes to Stripe metadata

But: processor might run between steps 2 and 3, or webhook might fail. Token goes missing.

**Current mitigation:** 30-minute in-memory expiry. Not robust for serverless/restarts.

#### 1.6 Vendor Lock-in

**Problem:** Tokens live in Stripe. If you migrate billing to another provider (Paddle, LemonSqueezy, etc.), you must:
- Export all tokens from Stripe metadata
- Import to new system
- Risk data loss or downtime

#### 1.7 Dashboard Edits

**Problem:** Anyone with Stripe Dashboard access can accidentally or intentionally edit/clear customer metadata, breaking that user's integration with no audit trail.

#### 1.8 Google OAuth/ToS Compliance

**Problem:** Google's OAuth policies recommend storing tokens securely. Stripe is a third-party billing provider, not a secrets manager. Storing tokens there may conflict with best practices or ToS.

---

### 2. Cross-Device / Returning User Issues

#### 2.1 OAuth Then Pay on Different Device

**Problem:** User does OAuth on phone, switches to laptop to pay. In-memory token store:
- Doesn't survive server restarts
- Has 30-minute expiry
- Is process-local (not shared across instances)

**Result:** Webhook can't find the token; customer is charged but has no working integration.

#### 2.2 No Cross-Device Identity

**Problem:** No login system. Each device/browser is a stranger. You can't answer:
- "Is this the same user who signed up last week?"
- "Which Stripe customer is this?"

**Result:** User must re-enter email, re-auth, or go through checkout again.

#### 2.3 Can't Reconnect Gmail or Change Sheet

**Problem:** User wants to:
- Reconnect Gmail after token expires
- Update their Google Sheet URL

Without knowing who they are (no session), you can't update the correct customer's config.

#### 2.4 Processor is Unaffected (not an issue)

The background processor runs server-side, reading config from storage (not user's browser). This works regardless of which device the user uses. Not a problem.

---

## Solution Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER DEVICES                              │
│  (Any browser, any platform - identity via NextAuth session)        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         NEXT.JS APP                                 │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │  NextAuth       │  │  Gmail OAuth    │  │  Stripe         │     │
│  │  (Google SSO)   │  │  (API token)    │  │  Webhook        │     │
│  │                 │  │                 │  │                 │     │
│  │  → Session      │  │  → Refresh      │  │  → Payment      │     │
│  │  → Identity     │  │     token       │  │     events      │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
│           │                    │                    │               │
│           └────────────────────┼────────────────────┘               │
│                                │                                    │
│                                ▼                                    │
│                     ┌─────────────────────┐                         │
│                     │    lib/token-store  │                         │
│                     │    (Redis client)   │                         │
│                     └──────────┬──────────┘                         │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            REDIS                                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  pending:email:{email}     → { refreshToken } TTL 48h       │   │
│  │  customer:{stripeId}       → { refreshToken, email, sheet } │   │
│  │  email:customer:{email}    → stripeCustomerId               │   │
│  │  customers                 → SET of all customer IDs        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKGROUND PROCESSOR                            │
│                                                                     │
│  Reads customer config from Redis → processes emails                │
│  (No dependency on user device or Stripe metadata)                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### How Redis Solves Issues

| Issue | Redis Solution |
|-------|----------------|
| **Not a secrets store** | Tokens in Redis (your infra), not Stripe. Control access via Redis ACLs, VPC, encryption at rest. |
| **Blast radius** | Stripe breach doesn't expose tokens. Redis breach is separate. Can encrypt tokens in Redis for defense in depth. |
| **500-char limit** | Redis has no practical size limit per key. Store structured JSON, encrypted blobs, whatever you need. |
| **Token lifecycle** | Update Redis anytime via app code. Reconnect flow, settings page, cron job—all can write to Redis. |
| **Race with checkout** | Pending token in Redis with 48h TTL. Survives restarts, multiple instances, long gaps. Webhook reads reliably. |
| **Vendor lock-in** | Tokens in Redis. Switch billing providers without migrating tokens. |
| **Dashboard edits** | Stripe metadata only has `gmail_email` and `google_sheet_id` (non-sensitive). Token not exposed. Accidental edits don't break auth. |
| **Google ToS** | Tokens in your own infrastructure = better compliance posture. |
| **OAuth → pay different device** | Redis is shared across all instances. Token persists 48h. User can OAuth on phone, pay on laptop hours later. |

---

### How NextAuth Solves Issues

| Issue | NextAuth Solution |
|-------|-------------------|
| **No cross-device identity** | User signs in with Google on any device. Session cookie identifies them. `session.user.email` → lookup Stripe customer → lookup Redis config. |
| **Can't reconnect/change sheet** | Protected `/settings` page requires session. "Reconnect Gmail" and "Update Sheet" buttons know who the user is from session. Update Redis for their customer ID. |
| **OAuth → pay different device** | Less critical with Redis, but NextAuth session can also carry state. If signed in, you know their email across devices. |

---

### How Fargate Cron Solves Token Lifecycle

| Issue | Fargate Cron Solution |
|-------|----------------------|
| **Token expires/revoked undetected** | Scheduled task checks all tokens every 6 hours. Marks broken tokens in Redis. |
| **User unaware of broken token** | Send notification email when token fails health check. |
| **No proactive monitoring** | Cron runs independently of user activity. Catches issues before processor fails. |
| **Processor runs on schedule** | ECS Scheduled Task triggers processor for all customers. |

**Important:** Cron can detect and notify, but cannot fix tokens automatically. OAuth requires user consent. User must click "Reconnect Gmail" after notification.

---

## Deployment Architecture: Next.js + Fargate

### Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS INFRASTRUCTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         VPC (Private Subnets)                         │   │
│  │                                                                       │   │
│  │   ┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐   │   │
│  │   │  ALB            │     │  ECS Fargate    │     │  ElastiCache │   │   │
│  │   │  (HTTPS)        │────▶│  Service        │────▶│  Redis       │   │   │
│  │   │                 │     │  (Next.js App)  │     │              │   │   │
│  │   └─────────────────┘     └─────────────────┘     └──────────────┘   │   │
│  │                                   │                       ▲          │   │
│  │                                   │                       │          │   │
│  │   ┌─────────────────┐             │                       │          │   │
│  │   │  EventBridge    │             │                       │          │   │
│  │   │  (Scheduler)    │             │                       │          │   │
│  │   │                 │             ▼                       │          │   │
│  │   │  - every 6h     │     ┌─────────────────┐             │          │   │
│  │   │  - every 1h     │────▶│  ECS Fargate    │─────────────┘          │   │
│  │   │                 │     │  Scheduled Task │                        │   │
│  │   └─────────────────┘     │  (Cron Jobs)    │                        │   │
│  │                           └─────────────────┘                        │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────┐     ┌─────────────────┐                               │
│   │  Secrets Manager│     │  SES            │                               │
│   │  (API keys,     │     │  (Notification  │                               │
│   │   OAuth creds)  │     │   emails)       │                               │
│   └─────────────────┘     └─────────────────┘                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose | Details |
|-----------|---------|---------|
| **ECS Fargate Service** | Run Next.js app | Auto-scaling, health checks, rolling deploys |
| **ECS Scheduled Tasks** | Run cron jobs | EventBridge triggers Fargate tasks on schedule |
| **ElastiCache Redis** | Token/config store | Private subnet, encryption at rest + transit |
| **ALB** | Load balancer | HTTPS termination, health checks |
| **Secrets Manager** | Store secrets | API keys, OAuth credentials, Redis auth |
| **SES** | Send emails | Token expiry notifications |
| **EventBridge** | Scheduler | Cron expressions for scheduled tasks |

---

## Scheduled Tasks (Cron Jobs)

### Task 1: Token Health Check (Every 6 Hours)

**Purpose:** Detect expired/revoked tokens before processor fails.

**Schedule:** `0 */6 * * *` (every 6 hours)

**Implementation:**

```typescript
// scripts/check-tokens.ts
import { google } from 'googleapis';
import { listCustomerIds, getCustomerConfig, updateCustomerStatus } from '../lib/token-store';
import { sendTokenExpiredEmail } from '../lib/notifications';

async function checkAllTokens() {
  console.log('🔍 Starting token health check...');
  
  const customerIds = await listCustomerIds();
  let valid = 0, expired = 0;

  for (const customerId of customerIds) {
    const config = await getCustomerConfig(customerId);
    if (!config?.refreshToken) continue;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: config.refreshToken });

    try {
      await oauth2Client.getAccessToken();
      await updateCustomerStatus(customerId, 'valid');
      valid++;
    } catch (error: any) {
      console.log(`❌ Token expired for ${config.email}: ${error.message}`);
      await updateCustomerStatus(customerId, 'expired');
      
      // Send notification email
      await sendTokenExpiredEmail(config.email);
      expired++;
    }
  }

  console.log(`✅ Health check complete: ${valid} valid, ${expired} expired`);
}

checkAllTokens();
```

**Redis schema addition:**

```typescript
// In customer config
interface CustomerConfig {
  refreshToken: string;
  email: string;
  sheetId?: string;
  tokenStatus: 'valid' | 'expired' | 'unknown';  // NEW
  lastChecked?: string;  // ISO timestamp
}
```

### Task 2: Process All Customers (Every Hour)

**Purpose:** Run email labeling for all paid customers.

**Schedule:** `0 * * * *` (every hour)

**Implementation:**

```typescript
// scripts/process-all-customers.ts
import { listCustomerIds, getCustomerConfig } from '../lib/token-store';
import { main as runProcessor } from './run-processor';

async function processAllCustomers() {
  console.log('📧 Starting scheduled processing for all customers...');
  
  const customerIds = await listCustomerIds();
  let processed = 0, skipped = 0, failed = 0;

  for (const customerId of customerIds) {
    const config = await getCustomerConfig(customerId);
    
    if (!config?.refreshToken) {
      console.log(`⏭️  Skipping ${customerId}: no refresh token`);
      skipped++;
      continue;
    }

    if (config.tokenStatus === 'expired') {
      console.log(`⏭️  Skipping ${config.email}: token expired`);
      skipped++;
      continue;
    }

    try {
      await runProcessor({
        emailAddress: config.email,
        gmailRefreshToken: config.refreshToken,
        geminiApiKey: process.env.GEMINI_API_KEY!,
        googleSheetsUrl: config.sheetId 
          ? `https://docs.google.com/spreadsheets/d/${config.sheetId}/edit`
          : undefined,
        maxEmails: 50,
        lookbackHours: 2,
        dryRun: false,
      });
      processed++;
    } catch (error: any) {
      console.error(`❌ Failed to process ${config.email}: ${error.message}`);
      failed++;
    }
  }

  console.log(`✅ Processing complete: ${processed} processed, ${skipped} skipped, ${failed} failed`);
}

processAllCustomers();
```

### Task 3: Cleanup Expired Pending Tokens (Daily)

**Purpose:** Remove old pending tokens that were never claimed.

**Schedule:** `0 3 * * *` (3 AM daily)

**Implementation:**

```typescript
// scripts/cleanup-pending.ts
import { getRedis, key } from '../lib/redis';

async function cleanupPending() {
  const redis = getRedis();
  if (!redis) return;

  // Redis handles TTL automatically, but we can log stats
  const keys = await redis.keys(key('pending:email:*'));
  console.log(`📊 Pending tokens in Redis: ${keys.length}`);
  
  // Any keys still here are within TTL (48h)
  // Keys older than 48h are auto-deleted by Redis
}

cleanupPending();
```

---

## Notification System

### Email Templates

**Token Expired Notification:**

```typescript
// lib/notifications.ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

export async function sendTokenExpiredEmail(userEmail: string) {
  const settingsUrl = `${process.env.NEXTAUTH_URL}/settings`;
  
  const command = new SendEmailCommand({
    Source: 'noreply@yourdomain.com',
    Destination: { ToAddresses: [userEmail] },
    Message: {
      Subject: { Data: 'Action Required: Reconnect Your Gmail' },
      Body: {
        Html: {
          Data: `
            <h2>Your Gmail Connection Has Expired</h2>
            <p>We can no longer access your Gmail to auto-label emails.</p>
            <p>This can happen if:</p>
            <ul>
              <li>You changed your Google password</li>
              <li>You revoked access in Google Account settings</li>
              <li>Your token expired after extended inactivity</li>
            </ul>
            <p><a href="${settingsUrl}" style="...">Reconnect Gmail Now</a></p>
          `,
        },
      },
    },
  });

  await ses.send(command);
  console.log(`📧 Sent token expired notification to ${userEmail}`);
}
```

---

## ECS Task Definitions

### Web Service Task Definition

```json
{
  "family": "auto-label-web",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "nextjs",
      "image": "${ECR_REPO}:latest",
      "portMappings": [{ "containerPort": 3000 }],
      "environment": [
        { "name": "NODE_ENV", "value": "production" }
      ],
      "secrets": [
        { "name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:..." },
        { "name": "STRIPE_SECRET_KEY", "valueFrom": "arn:aws:secretsmanager:..." },
        { "name": "GEMINI_API_KEY", "valueFrom": "arn:aws:secretsmanager:..." },
        { "name": "NEXTAUTH_SECRET", "valueFrom": "arn:aws:secretsmanager:..." }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/auto-label-web",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Cron Task Definition

```json
{
  "family": "auto-label-cron",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "cron",
      "image": "${ECR_REPO}:latest",
      "command": ["bun", "run", "scripts/check-tokens.ts"],
      "environment": [
        { "name": "NODE_ENV", "value": "production" }
      ],
      "secrets": [
        { "name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:..." },
        { "name": "GMAIL_CLIENT_ID", "valueFrom": "arn:aws:secretsmanager:..." },
        { "name": "GMAIL_CLIENT_SECRET", "valueFrom": "arn:aws:secretsmanager:..." },
        { "name": "GEMINI_API_KEY", "valueFrom": "arn:aws:secretsmanager:..." }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/auto-label-cron",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### EventBridge Scheduled Rules

```typescript
// infrastructure/eventbridge-rules.ts (or CloudFormation/Terraform)

// Token health check - every 6 hours
const tokenHealthRule = {
  Name: 'auto-label-token-health',
  ScheduleExpression: 'rate(6 hours)',
  Targets: [{
    Id: 'check-tokens',
    Arn: 'arn:aws:ecs:...:cluster/auto-label',
    RoleArn: 'arn:aws:iam::...:role/ecsEventsRole',
    EcsParameters: {
      TaskDefinitionArn: 'arn:aws:ecs:...:task-definition/auto-label-cron',
      TaskCount: 1,
      LaunchType: 'FARGATE',
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          Subnets: ['subnet-xxx'],
          SecurityGroups: ['sg-xxx'],
          AssignPublicIp: 'DISABLED',
        },
      },
    },
    Input: JSON.stringify({ command: ['bun', 'run', 'scripts/check-tokens.ts'] }),
  }],
};

// Process all customers - every hour
const processAllRule = {
  Name: 'auto-label-process-all',
  ScheduleExpression: 'rate(1 hour)',
  Targets: [{
    Id: 'process-all',
    Arn: 'arn:aws:ecs:...:cluster/auto-label',
    RoleArn: 'arn:aws:iam::...:role/ecsEventsRole',
    EcsParameters: {
      TaskDefinitionArn: 'arn:aws:ecs:...:task-definition/auto-label-cron',
      TaskCount: 1,
      LaunchType: 'FARGATE',
      NetworkConfiguration: { /* same as above */ },
    },
    Input: JSON.stringify({ command: ['bun', 'run', 'scripts/process-all-customers.ts'] }),
  }],
};
```

---

### Data Flow Diagrams

#### New User: Sign Up → Pay → Use

```mermaid
sequenceDiagram
    participant User
    participant NextAuth
    participant GmailOAuth
    participant StripeCheckout
    participant Webhook
    participant Redis
    participant Processor

    User->>NextAuth: Sign in with Google
    NextAuth-->>User: Session (email, name)
    
    User->>GmailOAuth: "Connect Gmail" (from signed-in state)
    GmailOAuth->>Redis: SET pending:email:{email} token TTL 48h
    GmailOAuth-->>User: Redirect to Stripe Checkout
    
    User->>StripeCheckout: Complete payment
    StripeCheckout->>Webhook: checkout.session.completed
    Webhook->>Redis: GET pending:email:{email} + DEL
    Webhook->>Redis: SET customer:{id} config
    Webhook->>Redis: SET email:customer:{email} → id
    Webhook->>Redis: SADD customers id
    
    Note over Processor: Runs on schedule
    Processor->>Redis: GET customer:{id}
    Processor->>Gmail: Process emails with refreshToken
```

#### Returning User: New Device → Reconnect Gmail

```mermaid
sequenceDiagram
    participant User
    participant NextAuth
    participant Settings
    participant GmailOAuth
    participant Redis

    User->>NextAuth: Sign in with Google (new device)
    NextAuth-->>User: Session (same email)
    
    User->>Settings: Visit /settings
    Settings->>Redis: GET email:customer:{email} → customerId
    Settings->>Redis: GET customer:{customerId}
    Settings-->>User: Show current config (sheet, status)
    
    User->>Settings: Click "Reconnect Gmail"
    Settings->>GmailOAuth: Redirect with state=reconnect:{customerId}
    GmailOAuth->>Redis: Update customer:{customerId}.refreshToken
    GmailOAuth-->>User: Redirect to /settings?success=1
```

#### Fargate Cron: Token Health Check and Processing

```mermaid
sequenceDiagram
    participant EventBridge
    participant FargateTask
    participant Redis
    participant GoogleOAuth
    participant SES
    participant User

    Note over EventBridge: Every 6 hours
    EventBridge->>FargateTask: Trigger check-tokens task
    FargateTask->>Redis: SMEMBERS customers
    
    loop For each customer
        FargateTask->>Redis: GET customer:{id}
        FargateTask->>GoogleOAuth: Test refresh token
        alt Token valid
            FargateTask->>Redis: SET tokenStatus = valid
        else Token expired
            FargateTask->>Redis: SET tokenStatus = expired
            FargateTask->>SES: Send notification email
            SES->>User: "Reconnect your Gmail"
        end
    end

    Note over EventBridge: Every 1 hour
    EventBridge->>FargateTask: Trigger process-all task
    FargateTask->>Redis: SMEMBERS customers
    
    loop For each customer (tokenStatus = valid)
        FargateTask->>Redis: GET customer:{id}
        FargateTask->>Gmail: Process emails
        FargateTask->>Gmail: Apply labels
    end
```

---

## Detailed Technical Plan

### 1. Add Dependencies

```bash
bun add ioredis next-auth @auth/core
```

**Files:**
- `package.json` – add ioredis, next-auth

### 2. Redis Client (`lib/redis.ts`)

```typescript
import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL);
  }
  return redis;
}

export const KEY_PREFIX = 'al:'; // auto-label prefix

export function key(name: string): string {
  return `${KEY_PREFIX}${name}`;
}
```

### 3. Token Store with Redis (`lib/token-store.ts`)

**Pending tokens (OAuth → Checkout bridge):**
- `storeRefreshToken(email, token)` → Redis `SET al:pending:email:{email}` with 48h TTL
- `retrieveRefreshToken(email)` → Redis `GET` + `DEL` (one-time use)

**Customer config (long-term):**
- `setCustomerConfig(customerId, { refreshToken, email, sheetId })` → Redis `SET al:customer:{id}` JSON
- `getCustomerConfig(customerId)` → Redis `GET` + parse JSON
- `getCustomerConfigByEmail(email)` → lookup `al:email:customer:{email}` → `getCustomerConfig`
- `listCustomerIds()` → Redis `SMEMBERS al:customers`

**Fallback:** If `REDIS_URL` not set, use in-memory (current behavior) for dev/testing.

### 4. NextAuth Setup

**`app/api/auth/[...nextauth]/route.ts`:**

```typescript
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // session.user.email is available
      return session;
    },
  },
});

export { handler as GET, handler as POST };
```

**Note:** Use the same Google OAuth app (or a separate one) for NextAuth. This is for identity only—no Gmail scopes needed. Or reuse same client with profile/email scopes.

### 5. Update Stripe Webhook

**`app/api/webhooks/stripe/route.ts`:**

On `checkout.session.completed`:
1. Get customer email from session
2. `retrieveRefreshToken(email)` from Redis (or fallback)
3. `setCustomerConfig(customerId, { refreshToken, email, sheetId })`
4. `stripe.customers.update(customerId, { metadata: { gmail_email, google_sheet_id } })` — NO token in Stripe

### 6. Update Gmail OAuth Callback

**`app/api/auth/gmail/callback/route.ts`:**

- **Normal flow (new user):** Store token in Redis pending, redirect to Stripe Checkout
- **Reconnect flow (`state=reconnect:{customerId}`):** Update `customer:{customerId}` in Redis, redirect to `/settings?success=1`

### 7. Protected Settings Page

**`app/settings/page.tsx`:**

```typescript
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { getCustomerConfigByEmail } from '@/lib/token-store';

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect('/api/auth/signin');
  
  const config = await getCustomerConfigByEmail(session.user.email);
  if (!config) redirect('/?error=no_subscription');
  
  return (
    <div>
      <h1>Settings</h1>
      <p>Email: {config.email}</p>
      <p>Sheet: {config.sheetId || 'Not set'}</p>
      <p>Gmail: {config.refreshToken ? 'Connected' : 'Not connected'}</p>
      
      <a href={`/api/auth/gmail?reconnect=${config.customerId}`}>
        Reconnect Gmail
      </a>
      
      <form action="/api/settings/sheet" method="POST">
        <input name="sheetId" placeholder="Sheet ID or URL" />
        <button type="submit">Update Sheet</button>
      </form>
    </div>
  );
}
```

### 8. Update Processor

**`scripts/run-processor.ts`:**

- Add `--customer-id=xxx` flag or `STRIPE_CUSTOMER_ID` env var
- When set + `REDIS_URL`: load config via `getCustomerConfig(customerId)`
- Add `--all-customers` flag: iterate `listCustomerIds()`, process each

### 9. Environment Variables

**`.env.example` additions:**

```bash
# Redis (required for production)
REDIS_URL=redis://localhost:6379
# For AWS ElastiCache with TLS:
# REDIS_URL=rediss://user:password@your-cluster.cache.amazonaws.com:6379

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-random-secret

# Google OAuth (for NextAuth identity)
# Can reuse GMAIL_CLIENT_ID/SECRET if same OAuth app with profile scope
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# AWS (for Fargate deployment)
AWS_REGION=us-east-1

# SES (for email notifications)
SES_FROM_EMAIL=noreply@yourdomain.com
# Note: Verify domain/email in SES before sending

# Cron configuration
TOKEN_CHECK_INTERVAL_HOURS=6
PROCESS_INTERVAL_HOURS=1
```

### 10. Fargate Infrastructure Files

**New files to create:**

| File | Purpose |
|------|---------|
| `scripts/check-tokens.ts` | Token health check cron job |
| `scripts/process-all-customers.ts` | Process all customers cron job |
| `lib/notifications.ts` | SES email sending functions |
| `infrastructure/task-definitions/` | ECS task definition JSON files |
| `infrastructure/eventbridge-rules.ts` | EventBridge scheduler rules |

---

## Issue Resolution Matrix

| Issue | Solved By | Status |
|-------|-----------|--------|
| 500-character limit | Redis (no limit) | Solved |
| Not a secrets store | Redis (your infra) | Solved |
| Blast radius | Redis (separate from Stripe) | Solved |
| Google OAuth/ToS | Redis (own infra = better posture) | Improved |
| Token lifecycle | Redis + reconnect + Fargate cron health checks | Solved |
| Race with checkout | Redis 48h TTL | Solved |
| Vendor lock-in | Tokens in Redis, not Stripe | Solved |
| Dashboard edits | Token not in Stripe metadata | Solved |
| OAuth → pay different device | Redis persistence | Solved |
| No cross-device identity | NextAuth session | Solved |
| Can't reconnect/change sheet | NextAuth + settings page | Solved |
| Token expires undetected | Fargate cron health check every 6h | Solved |
| User unaware of broken token | SES email notifications | Solved |
| No scheduled processing | Fargate cron process-all every 1h | Solved |
| Processor unaffected | N/A (already fine) | N/A |

---

## Migration Path

### Existing Customers (Already Have Token in Stripe)

Option A: **Lazy migration**
- On next processor run, check if customer has token in Stripe metadata but not in Redis
- Copy token to Redis, clear from Stripe metadata

Option B: **One-time script**
- List all Stripe customers
- For each with `gmail_refresh_token` in metadata: write to Redis, clear metadata

### Rollout

**Phase 1: Infrastructure**
1. Provision AWS infrastructure (VPC, ECS cluster, ElastiCache Redis, ALB, SES)
2. Store secrets in AWS Secrets Manager
3. Set up ECR repository for Docker images

**Phase 2: Application Updates**
4. Add `ioredis` and `next-auth` dependencies
5. Implement `lib/redis.ts` and update `lib/token-store.ts`
6. Deploy Next.js app to Fargate (backward compatible—falls back to in-memory)

**Phase 3: Auth and Storage**
7. Deploy NextAuth routes (doesn't break existing flows)
8. Update Stripe webhook to write to Redis (not Stripe metadata)
9. Update Gmail OAuth callback for reconnect flow

**Phase 4: Cron Jobs**
10. Create `scripts/check-tokens.ts` and `scripts/process-all-customers.ts`
11. Create `lib/notifications.ts` for SES emails
12. Set up EventBridge scheduled rules for cron tasks
13. Deploy cron task definition

**Phase 5: User-Facing**
14. Deploy settings page (`/settings`)
15. Add "Reconnect Gmail" and "Update Sheet" UI

**Phase 6: Migration and Cleanup**
16. Run migration for existing customers (Stripe metadata → Redis)
17. Remove `gmail_refresh_token` from Stripe metadata for all customers
18. Monitor CloudWatch logs for errors

---

## Summary

This architecture uses three components to solve all identified issues:

| Component | Responsibility |
|-----------|----------------|
| **Redis (ElastiCache)** | Secure token storage, customer config, cross-instance persistence |
| **NextAuth** | Cross-device identity, session management, protected routes |
| **Fargate Cron** | Token health monitoring, scheduled processing, email notifications |

**Result:** A complete, production-ready system that is:
- **Secure:** Tokens in your infra, not Stripe
- **Reliable:** Redis persistence, health monitoring, notifications
- **User-friendly:** Cross-device login, settings page, reconnect flow
- **Scalable:** Fargate auto-scaling, multi-customer processing
- **Observable:** CloudWatch logs, token status in Redis

---

## Security Considerations

### Redis
- **Access control:** Use Redis ACLs, VPC, or managed Redis with auth. Don't expose to public internet.
- **Encryption at rest:** Enable in AWS ElastiCache (at-rest encryption option).
- **Encryption in transit:** Use `rediss://` (TLS) URL.
- **Token encryption (optional):** Encrypt tokens before storing in Redis with app-level key for defense in depth.

### NextAuth
- **Secret:** Use strong random value for `NEXTAUTH_SECRET` (32+ bytes).
- **Session security:** NextAuth handles secure cookies, CSRF, etc. by default.
- **HTTPS only:** Ensure `NEXTAUTH_URL` uses HTTPS in production.

### Fargate / AWS
- **IAM roles:** Use task execution roles with least privilege. Separate roles for web service vs cron tasks.
- **Secrets Manager:** Store all secrets (API keys, tokens, Redis auth) in AWS Secrets Manager, not environment variables.
- **VPC:** Run Fargate tasks in private subnets. Only ALB is public-facing.
- **Security groups:** Restrict Redis access to only Fargate tasks. No public access.
- **Logging:** Enable CloudWatch Logs for all tasks. Monitor for errors.
- **SES:** Use verified domain/email. Enable DKIM for deliverability.

### Network Architecture

```
Internet
    │
    ▼
┌─────────────┐
│    ALB      │  (Public subnet, HTTPS only)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Fargate    │  (Private subnet)
│  Web/Cron   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ ElastiCache │  (Private subnet, no public access)
│   Redis     │
└─────────────┘
```
