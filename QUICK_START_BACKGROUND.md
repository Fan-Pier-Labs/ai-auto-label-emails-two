# Quick Start: Background Email Processor

This will set up automatic email labeling that runs continuously in a loop for **ryan@fanpierlabs.com**.

## Step 1: Get OAuth Token

```bash
# Make sure you have google_creds.json in the project root
# (Download from Google Cloud Console)

bun run get-token
```

This will:
1. Open your browser
2. Ask you to sign in with **ryan@fanpierlabs.com**
3. Grant Gmail permissions
4. Display your refresh token

## Step 2: Configure Environment

Make sure `google_creds.json` is in the project root (downloaded from Google Cloud Console).

Create `.env.local`:

```bash
# Required
GEMINI_API_KEY=your_gemini_key_here
GMAIL_REFRESH_TOKEN=your_refresh_token_here

# Email to process (defaults to ryan@fanpierlabs.com)
EMAIL_ADDRESS=ryan@fanpierlabs.com

# Optional
GOOGLE_SHEETS_URL=your_sheet_url
POLL_INTERVAL_MINUTES=5
PROCESSED_LABEL=__auto-processed__
DRY_RUN=false
```

**Note**: Client ID and Secret are automatically loaded from `google_creds.json`, so you only need the refresh token in your environment.

## Step 3: Start Background Processor

```bash
# Simple way
bun run start-background

# Or directly
bun run process-emails
```

This starts a **continuous loop** that:
- ✅ Runs independently (not triggered by API calls)
- ✅ Checks for new emails every 5 minutes
- ✅ Processes emails for ryan@fanpierlabs.com
- ✅ Applies deterministic + AI labels
- ✅ Keeps running until you stop it (Ctrl+C)

## What Gets Applied

### Deterministic Labels (Automatic)
- `first-domain` - First email from new domain
- `first-address` - First email from new sender
- `no-email-domain` - Domain you've never emailed
- `no-email-address` - Person you've never emailed
- `Has-Unsubscribe` - Email has unsubscribe link

### AI Labels (From Google Sheets)
- Any rules you define in your Google Sheet

### Processing Label
- `__auto-processed__` - Marks email as processed

## Test First (Recommended)

Before running continuously, test with one email:

```bash
bun run test-email
```

Or test in dry-run mode (doesn't apply labels):

```bash
DRY_RUN=true bun run process-emails
```

## Running in Background

### Option 1: Terminal (Simple)
```bash
bun run start-background
# Keep terminal open
```

### Option 2: Background Process
```bash
nohup bun run process-emails > email-processor.log 2>&1 &
```

### Option 3: PM2 (Recommended for servers)
```bash
pm2 start "bun run process-emails" --name email-labeler
pm2 logs email-labeler
```

## Stop the Processor

- Press `Ctrl+C` if running in foreground
- Or: `pm2 stop email-labeler` if using PM2
- Or: `kill <pid>` if running in background

## Troubleshooting

### "Missing Gmail OAuth credentials"
- Make sure `google_creds.json` exists in project root
- Make sure `.env.local` has `GMAIL_REFRESH_TOKEN`
- Run `bun run get-token` to get refresh token

### "No emails found"
- Check that emails exist in the last 24 hours
- Verify they don't already have the processed label
- Make sure you authenticated with the correct Gmail account

### Labels not showing
- Refresh Gmail
- Check Gmail label sidebar
- Verify processor logs show labels were applied

## Configuration

Edit `.env.local` to customize:

```bash
# How often to check (in minutes)
POLL_INTERVAL_MINUTES=5

# Label name for processed emails
PROCESSED_LABEL=__auto-processed__

# Test mode (doesn't apply labels)
DRY_RUN=true

# Email address (defaults to ryan@fanpierlabs.com)
EMAIL_ADDRESS=ryan@fanpierlabs.com
```

## Architecture

```
┌─────────────────────────────────────┐
│   Background Processor (Loop)        │
│                                      │
│   Every 5 minutes:                  │
│   1. Search for unprocessed emails  │
│   2. For each email:                │
│      - Apply deterministic labels    │
│      - Apply AI labels              │
│      - Mark as processed            │
│   3. Wait 5 minutes                 │
│   4. Repeat                          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│   Next.js Web App (Separate)        │
│                                      │
│   - Interactive demo                │
│   - REST API endpoint               │
│   - Runs on port 3000               │
└─────────────────────────────────────┘
```

The background processor runs **independently** from the web app. You can run both at the same time:
- Terminal 1: `bun dev` (web app)
- Terminal 2: `bun run start-background` (email processor)
