# Gmail Automation Setup Guide

Complete guide to setting up automatic email labeling with Gmail.

## Overview

This will set up a background process that:
1. Monitors your Gmail inbox
2. Applies AI-powered labels based on your rules
3. Applies deterministic labels (first-time senders, etc.)
4. Runs continuously in the background

## Step 1: Google Cloud Setup

### Create OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create/Select Project**
   - Click the project dropdown at the top
   - Click "New Project"
   - Name it "Email Auto-Labeler" (or anything you want)
   - Click "Create"

3. **Enable Gmail API**
   - Go to **APIs & Services** → **Library**
   - Search for "Gmail API"
   - Click on it and click "Enable"

4. **Configure OAuth Consent Screen**
   - Go to **APIs & Services** → **OAuth consent screen**
   - Choose "External" (unless you have Google Workspace)
   - Fill in:
     - App name: "Email Auto-Labeler"
     - User support email: your email
     - Developer contact: your email
   - Click "Save and Continue"
   - On Scopes screen, click "Save and Continue"
   - On Test users screen, click "Add Users"
   - Add your Gmail address
   - Click "Save and Continue"

5. **Create OAuth Credentials**
   - Go to **APIs & Services** → **Credentials**
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: **Desktop app**
   - Name: "Email Labeler Desktop"
   - Click "Create"
   - Click "Download JSON"
   - Save as `google_creds.json` in your project root

## Step 2: Get Your Refresh Token

1. **Run the token script**:
   ```bash
   bun run get-token
   ```

2. **Authorize the app**:
   - A browser window will open
   - Sign in with your Gmail account
   - Click "Allow" to grant permissions
   - You'll see a success message

3. **Copy the credentials**:
   The script will output something like:
   ```
   GMAIL_CLIENT_ID=1234567890.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
   GMAIL_REFRESH_TOKEN=1//xxxxxxxxxxxxx
   ```

4. **Add to `.env.local`**:
   ```bash
   # Gmail OAuth
   GMAIL_CLIENT_ID=your_client_id_here
   GMAIL_CLIENT_SECRET=your_client_secret_here
   GMAIL_REFRESH_TOKEN=your_refresh_token_here

   # Gemini AI
   GEMINI_API_KEY=your_gemini_key_here

   # Google Sheets (optional)
   GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/YOUR_ID/edit
   ```

## Step 3: Set Up Your Rules

### Option 1: Google Sheets (Recommended)

1. **Create a Google Sheet**:
   - Go to https://sheets.google.com
   - Create a new sheet
   - Format:
     ```
     Label          | Prompt
     ---------------|------------------------------------------
     Shopping       | order confirmation or shipping
     Newsletter     | newsletter or marketing email
     Meeting        | meeting invitation or calendar
     Important      | urgent or requires action
     ```

2. **Make it public**:
   - Click "Share"
   - Change to "Anyone with the link can view"
   - Copy the URL

3. **Add to `.env.local`**:
   ```bash
   GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
   ```

### Option 2: Code-based Rules

Edit `lib/processor.ts` and add rules directly in the code.

## Step 4: Test with a Single Email

Before running continuously, test with one email:

```bash
# Test with the most recent inbox email
bun run test-email

# Test with a specific email
bun run test-email "from:amazon@example.com"

# Test with any Gmail query
bun run test-email "subject:order"
```

This will:
- Process one email
- Show you what labels would be applied
- Help you verify everything works

## Step 5: Run Dry Mode

Test without actually applying labels:

```bash
DRY_RUN=true bun run process-emails
```

This will:
- Search for unprocessed emails
- Run the classification
- Show what labels would be applied
- NOT actually apply them

Watch the output to verify it's working correctly.

## Step 6: Run for Real

Once you're satisfied with the test results:

```bash
bun run process-emails
```

This will:
- Start the background processor
- Check for new emails every 5 minutes
- Apply labels automatically
- Run continuously until you stop it (Ctrl+C)

## Configuration Options

### Environment Variables

```bash
# Required
GEMINI_API_KEY=your_key
GMAIL_CLIENT_ID=your_id
GMAIL_CLIENT_SECRET=your_secret
GMAIL_REFRESH_TOKEN=your_token

# Optional
GOOGLE_SHEETS_URL=your_sheet_url     # Load rules from sheet
POLL_INTERVAL_MINUTES=5              # How often to check (default: 5)
PROCESSED_LABEL=__auto-processed__   # Label for processed emails
DRY_RUN=true                         # Test mode (don't apply labels)
```

### Changing Check Interval

To check more or less frequently:

```bash
# Check every minute
POLL_INTERVAL_MINUTES=1 bun run process-emails

# Check every hour
POLL_INTERVAL_MINUTES=60 bun run process-emails
```

## Labels Applied

### AI Labels
Based on your rules from Google Sheets or code

### Deterministic Labels
Automatically applied based on email history:

- **first-domain**: First email from this domain
- **first-address**: First email from this email address
- **no-email-domain**: You've never sent email to this domain
- **no-email-address**: You've never sent email to this address
- **Has-Unsubscribe**: Email contains an unsubscribe link

### Processed Label
- **__auto-processed__**: Marks email as already processed (prevents duplicate processing)

## Running in Production

### Option 1: Keep Terminal Open

```bash
bun run process-emails
```

Keeps running until you close the terminal or press Ctrl+C.

### Option 2: Background Process (Unix/Mac)

```bash
nohup bun run process-emails > email-processor.log 2>&1 &
```

Runs in background, writes logs to `email-processor.log`.

### Option 3: Docker

```bash
docker-compose up -d
```

Runs in a Docker container in the background.

### Option 4: PM2 (Recommended for Servers)

```bash
# Install PM2
npm install -g pm2

# Start processor
pm2 start "bun run process-emails" --name email-labeler

# View logs
pm2 logs email-labeler

# Stop
pm2 stop email-labeler

# Auto-start on boot
pm2 startup
pm2 save
```

## Troubleshooting

### "Missing Gmail OAuth credentials"
- Make sure `.env.local` has all three Gmail variables
- Make sure you ran `bun run get-token`

### "Invalid grant" or "Token has been expired or revoked"
- Your refresh token expired
- Run `bun run get-token` again
- Or revoke access at https://myaccount.google.com/permissions and re-authorize

### "Failed to load rules from Google Sheets"
- Make sure the sheet is publicly viewable
- Check the URL is correct in `.env.local`
- Verify the sheet has the correct format (Label | Prompt columns)

### "Gemini API key not configured"
- Add `GEMINI_API_KEY` to `.env.local`
- Get a key from https://makersuite.google.com/app/apikey

### No emails being processed
- Check that emails exist in the last 24 hours
- Verify they don't already have the processed label
- Check the search query in the logs

### Labels not showing in Gmail
- Refresh Gmail
- Check the label sidebar (may need to expand)
- Verify labels were actually created (check Gmail settings)

## Tips

1. **Start with dry run mode** to test without making changes
2. **Use descriptive label names** so you can easily identify them in Gmail
3. **Keep rules simple and specific** for better accuracy
4. **Monitor the logs** for the first few runs to verify behavior
5. **Adjust polling interval** based on your email volume

## Security Notes

- **Refresh token**: Keep it secret! It gives access to your Gmail
- **Don't commit** `google_creds.json` or `.env.local` to git
- **Revoke access** anytime at: https://myaccount.google.com/permissions
- The app only has permissions to modify labels, not read email content outside of classification

## Next Steps

Once it's running smoothly:
- Adjust your rules to improve accuracy
- Add more deterministic rules
- Set up monitoring/alerting for the processor
- Deploy to a server for 24/7 operation
