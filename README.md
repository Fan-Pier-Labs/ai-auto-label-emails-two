# Auto Label Emails with AI

A Next.js application that automatically labels emails using AI-powered rules with Gemini AI. This project combines a modern web interface with powerful email classification capabilities — and supports highly custom, programmable rule logic far beyond what any email client offers out of the box.

## Features

- **AI-Powered Classification**: Uses Google's Gemini AI to intelligently match email content with custom rules
- **Gmail Automation**: Automatically label emails in your Gmail inbox
- **Google Sheets Integration**: Load classification rules from a Google Sheet (optional)
- **Deterministic Rules**: Built-in rules for first-time senders, domains, and email history
- **Highly Custom Logic**: Write arbitrarily complex rule pipelines mixing deterministic checks, network lookups, and AI calls (see [Custom Rule Logic](#custom-rule-logic) below)
- **Linear Integration**: Automatically sync matching emails to Linear issues by sender address/domain
- **Interactive Demo**: Try the classifier directly in your browser with example emails
- **Background Processing**: Continuously monitor and label new emails
- **Rate Limiting**: Built-in IP and cookie-based rate limiting to prevent abuse
- **Modern UI**: Beautiful, responsive interface built with Next.js 16, React 19, and Tailwind CSS
- **Static Rule Detection**: Automatically detects unsubscribe links and other patterns
- **Real-time Results**: See classification results with detailed explanations

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI Components**: Radix UI, Tailwind CSS, shadcn/ui
- **AI Provider**: Google Gemini AI (gemini-1.5-flash model)
- **Backend**: Next.js API Routes
- **Rate Limiting**: In-memory store with IP/cookie tracking

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Google Gemini API key (get it from [Google AI Studio](https://makersuite.google.com/app/apikey))

## Quick Start

### 1. Clone or Download

```bash
cd auto-label-email-dir
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Required - Get your key from https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Optional - Load rules from Google Sheets
# Make sure the sheet is publicly viewable (share settings)
# Template: https://docs.google.com/spreadsheets/d/1oRvLEi2uj0ENbJ42EyINLzWcbC92HwGriMq5ejKhXYM/edit
GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit
# Or just the ID:
# GOOGLE_SHEETS_ID=YOUR_SPREADSHEET_ID
```

### 4. Run the Development Server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Gmail Automation Setup

To automatically label emails in your Gmail inbox:

### 1. Get Gmail OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Desktop app):
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Desktop app**
   - Download the credentials
5. Configure OAuth consent screen:
   - Add your email as a test user
   - Add scopes: `https://www.googleapis.com/auth/gmail.modify`
6. Save credentials as `google_creds.json` in project root

### 2. Get Refresh Token

Make sure you have `google_creds.json` in the project root (downloaded from Google Cloud Console).

Run the setup script:

```bash
bun run get-token
```

This will:
1. Load credentials from `google_creds.json`
2. Open your browser
3. Ask you to authorize the app
4. Display your refresh token

Copy the refresh token to `.env.local`:

```bash
GMAIL_REFRESH_TOKEN=your_refresh_token
```

**Note**: Client ID and Secret are automatically loaded from `google_creds.json`, so you only need the refresh token in your environment.

### 3. Run the Email Processor

Start the background processor (runs continuously in a loop):

```bash
# Simple way
bun run start-background

# Or directly
bun run process-emails
```

This will:
- Run continuously in a background loop (not triggered by API calls)
- Check for new emails every 5 minutes (configurable)
- Process emails for: ryan@fanpierlabs.com (or set EMAIL_ADDRESS)
- Apply deterministic labels (first-time senders, etc.)
- Apply AI labels based on your rules
- Mark emails as processed

**Note**: This runs as a separate background process, independent of the web API. It will keep running until you stop it (Ctrl+C).

### 4. Test with a Single Email

Before running continuously, test with one email:

```bash
bun run test-email
# Or with a specific query:
bun run test-email "from:example@gmail.com"
```

### Deterministic Labels

The processor automatically applies these labels based on email history:

- **`first-domain`**: First email from this domain
- **`first-address`**: First email from this sender
- **`no-email-domain`**: You've never emailed this domain
- **`no-email-address`**: You've never emailed this person
- **`Has-Unsubscribe`**: Email contains unsubscribe link

These work alongside your AI rules!

## Custom Rule Logic

The system supports highly custom, programmable rule pipelines that go far beyond simple label matching. You can mix deterministic checks, network lookups, WHOIS queries, and AI calls into a single ordered pipeline with short-circuit logic. Here is an example of the kind of custom logic that has been built with this system (see `scripts/run-ryan-rules.ts`):

### Example: A Real-World Custom Pipeline

This pipeline processes every incoming email through an ordered sequence of rules, stopping early when a match is found:

1. **Gmail filter matching** — Checks if the email matches any existing Gmail filter. If so, applies that filter's actions and stops.
2. **Starred sender check** — If you have ever starred an email to or from this sender, marks the email as important and stops.
3. **Prior contact check** — If you have ever emailed the sender (or anyone at their domain), or if they are on the same thread as someone you have emailed, marks as important and stops.
4. **Known domain shortcut** — Emails from trusted domains like `@docs.google.com` are marked important immediately.
5. **AI job applicant detection** — Uses Gemini to determine if the email is a job application (mentions qualifications, work experience, resumes). Labels as `ai job applicant` and stops.
6. **Sender infrastructure detection** — Inspects email headers to determine how the email was sent:
   - Extracts the client IP from `Received-SPF` / `Authentication-Results` headers
   - Runs a WHOIS lookup on the IP to identify the sending organization
   - Falls back to MX record lookups and `Received` header pattern matching
   - Categorizes the sender as **Gmail/Microsoft** (personal/work email), **AWS SES/SendGrid** (automated/marketing), or **other**
7. **Spam scoring for personal senders** (Gmail/Microsoft) — Runs four checks against the sender's domain:
   - Was the domain registered in the last 2 months?
   - Is the domain up with valid HTTPS?
   - Does the reply-to address match the from address?
   - Does the domain redirect to a different site?
   - 1 failure = `ai might be spam`, 2+ failures = `ai thinks spam` + marked not important
8. **Cold email detection** (AWS SES/SendGrid) — Uses Gemini to detect personalized cold outreach (e.g., "Hi Ryan, I noticed Fan Pier Labs..."). Labels as `ai detected cold email` and stops.
9. **Event classification** — Multiple AI calls to categorize event-related emails:
   - Online events/webinars (labeled `ai online event`)
   - Poker nights (labeled `ai poker night`)
   - NYC startup/tech events in Manhattan or Brooklyn (labeled `ai nyc event`)
   - Events from well-known tech companies like Vercel, Stripe, or Anthropic (labeled `ai brand event`)
10. **Event importance routing** — Online-only events are marked not important; NYC events, poker nights, and brand-name events are marked important.

### Linear Integration

The custom pipeline also supports syncing emails to Linear issues. When configured, emails matching specific senders or domains are automatically posted as comments on the corresponding Linear issue — useful for tracking conversations with specific contacts alongside your project management workflow.

### Building Your Own Custom Logic

You can write your own rule script following the same pattern:
- Define an ordered list of rules with conditions and actions
- Use short-circuit logic (stop processing on match) or fall-through (continue to next rule)
- Mix deterministic checks (domain lookups, header inspection, WHOIS) with AI calls
- Apply any combination of Gmail labels, importance flags, and external integrations
- Run the script on a schedule with the entry-point wrapper (e.g., every 15 minutes)

## Usage

### Interactive Demo

1. Navigate to the demo section on the homepage
2. Load one of the example emails or create your own
3. Add custom classification rules (label + description)
4. Click "Classify Email" to see the AI in action
5. View the matched labels and explanations

### Google Sheets Integration

You can define your classification rules in a Google Sheet instead of manually entering them:

1. **Create a Google Sheet** with two columns:
   - Column 1: Label name (e.g., "Shopping", "Newsletter")
   - Column 2: Rule description (e.g., "order confirmation or shipping")

2. **Make it public**:
   - Click "Share" → Change to "Anyone with the link can view"

3. **Get the URL or ID**:
   - Copy the full URL or just the spreadsheet ID

4. **Add to `.env.local`**:
   ```bash
   GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/YOUR_ID/edit
   ```

5. **Use it**: When you call the API without providing rules, it will automatically load them from the sheet

**Example Sheet Format:**
```
Label          | Prompt
---------------|------------------------------------------
Shopping       | order confirmation or shipping notification
Newsletter     | newsletter or marketing email
Meeting        | meeting invitation or scheduling
Important      | urgent or requires immediate action
```

**Deterministic rules (same sheet, columns F, G, H):**
- **F (Enabled?)**: `yes` or `no` to enable/disable the rule
- **G (Label)**: Any label name you want (e.g. `likely-scam`, `phishing-risk`)
- **H (AI Prompt)**: Question the AI answers using deterministic check results (e.g. "can it be a scam domain?")

Only rows with **non-empty label and prompt** are used. The system runs all deterministic checks (domain, DNS, MX, etc.) once per email, then for each enabled row the AI decides from those results whether to apply the label. Each row is one Gemini call per email.

**Template Sheet**: [Copy this template](https://docs.google.com/spreadsheets/d/1oRvLEi2uj0ENbJ42EyINLzWcbC92HwGriMq5ejKhXYM/edit)

### API Endpoint

You can also use the classification API directly:

**Endpoint**: `POST /api/classify`

**Request Body**:
```json
{
  "email": {
    "subject": "Your order has shipped",
    "body": "Your order #123 has been shipped...",
    "from": "orders@store.com"
  },
  "rules": [
    {
      "label": "Shopping",
      "prompt": "order confirmation or shipping notification"
    },
    {
      "label": "Newsletter",
      "prompt": "newsletter or marketing email"
    }
  ]
}
```

**Response**:
```json
{
  "labels": ["Shopping", "Has-Unsubscribe"],
  "explanations": {
    "Shopping": "Simple match: \"order confirmation or shipping notification\"",
    "Has-Unsubscribe": "Email contains unsubscribe link"
  }
}
```

**Rate Limits**:
- 20 requests per minute per IP/cookie
- Rate limit headers included in response

## Project Structure

```
auto-label-email-dir/
├── app/
│   ├── api/
│   │   └── classify/
│   │       └── route.ts          # Classification API endpoint
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Homepage
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── interactive-demo.tsx      # Live demo component
│   ├── hero.tsx                  # Hero section
│   ├── features.tsx              # Features section
│   ├── options.tsx               # Deployment options
│   └── ...                       # Other components
├── scripts/
│   ├── run-ryan-rules.ts         # Example custom rule pipeline
│   ├── run-ryan-rules-entry.ts   # Entry point (runs every 15 min)
│   └── ryan-linear-sync.ts       # Linear integration for email sync
├── lib/
│   ├── ai-labeler.ts             # Gemini AI integration
│   ├── deterministic.ts          # Domain/DNS/WHOIS checks
│   ├── gmail.ts                  # Gmail API wrapper
│   ├── gemini.ts                 # Gemini API wrapper
│   ├── linear.ts                 # Linear API integration
│   ├── rate-limit.ts             # Rate limiting logic
│   ├── types.ts                  # TypeScript types
│   └── utils.ts                  # Utility functions
├── public/                       # Static assets
├── .env.example                  # Example environment variables
├── package.json
└── README.md
```

## Configuration

### Rate Limiting

Edit `app/api/classify/route.ts` to adjust rate limits:

```typescript
const rateLimit = checkRateLimit(clientId, {
  maxRequests: 20,    // Max requests
  windowMs: 60000     // Time window (ms)
});
```

### AI Model

Edit `lib/ai-labeler.ts` to change the Gemini model:

```typescript
const model = geminiClient.getGenerativeModel({
  model: 'gemini-1.5-flash'  // or 'gemini-1.5-pro'
});
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add your `GEMINI_API_KEY` environment variable
4. Deploy!

### Docker

```bash
# Build
docker build -t auto-label-email .

# Run
docker run -p 3000:3000 -e GEMINI_API_KEY=your_key auto-label-email
```

The Docker image uses Bun for optimal performance.

### Other Platforms

This is a standard Next.js app and can be deployed to:
- Netlify
- AWS Amplify
- Railway
- Render
- Any platform that supports Bun or Node.js

## Development

### Adding New Features

1. Add new API routes in `app/api/`
2. Create components in `components/`
3. Add types in `lib/types.ts`
4. Update the demo in `components/interactive-demo.tsx`

### Testing

```bash
# Run the dev server
bun dev

# Build for production
bun run build

# Start production server
bun start
```

## Troubleshooting

### "Gemini API key not configured"
- Make sure `.env.local` exists with `GEMINI_API_KEY`
- Restart the development server after adding environment variables

### Rate Limit Issues
- Rate limits reset after 1 minute
- Clear your cookies to reset the rate limit counter
- Adjust limits in `app/api/classify/route.ts`

### API Errors
- Check that your Gemini API key is valid
- Ensure you have quota remaining on your Gemini account
- Check the browser console and server logs for details

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.

## Credits

Built with:
- [Next.js](https://nextjs.org/)
- [Google Gemini AI](https://ai.google.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/)

Original email labeling concept by [Fan Pier Labs](https://fanpierlabs.com)
