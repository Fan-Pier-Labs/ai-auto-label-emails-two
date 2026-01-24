# Project Migration Summary

## ✅ Completed Tasks

### 1. Merged Two Repositories
- **auto-label-email** (backend email labeling service)
- **auto-label-email-demo-site** (frontend demo site)
- Merged into a single Next.js 16 application

### 2. Removed Ollama Dependencies
- Replaced Ollama integration with Google Gemini AI
- Using `@google/generative-ai` package
- Model: `gemini-1.5-flash` (fast and cost-effective)

### 3. Created Backend API
- **POST /api/classify** - Email classification endpoint
- Rate limiting based on IP and cookie (20 req/min)
- Returns labels with explanations
- Proper error handling and validation

### 4. Built Interactive Frontend Demo
- Real-time email classification
- Load example emails
- Add/remove custom rules
- See results with explanations
- Mobile-responsive design

### 5. Rate Limiting Implementation
- In-memory rate limit store
- IP + cookie-based identification
- Configurable limits (20 requests/minute default)
- Automatic cleanup of old entries
- Rate limit headers in responses

### 6. Modern UI/UX
- Next.js 16 with React 19
- Tailwind CSS v4 (CSS imports)
- shadcn/ui components
- Dark/light theme support
- Fully responsive design

## 📁 Project Structure

```
auto-label-email-dir/
├── app/
│   ├── api/classify/route.ts    # Classification API
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Homepage
│   └── globals.css              # Tailwind CSS
├── components/
│   ├── interactive-demo.tsx     # NEW: Live demo
│   ├── ui/                      # shadcn/ui components
│   └── ...                      # Other components
├── lib/
│   ├── ai-labeler.ts           # Gemini AI integration
│   ├── rate-limit.ts           # Rate limiting logic
│   ├── types.ts                # TypeScript types
│   └── utils.ts                # Utilities
├── public/                      # Static assets
├── .env.example                 # Environment template
├── Dockerfile                   # Docker support
├── docker-compose.yml           # Docker Compose
├── package.json                 # Dependencies
├── README.md                    # Full documentation
└── GETTING_STARTED.md          # Quick start guide
```

## 🔑 Key Features

1. **AI-Powered Classification**
   - Google Gemini AI (gemini-1.5-flash)
   - Conservative matching strategy
   - JSON-structured responses
   - Detailed explanations

2. **Static Rules**
   - Unsubscribe link detection
   - Pattern-based matching
   - Fast string matching fallback

3. **Rate Limiting**
   - 20 requests per minute
   - IP + cookie tracking
   - Headers show remaining quota
   - Auto-cleanup old entries

4. **Interactive Demo**
   - 3 example emails
   - Pre-configured rules
   - Add custom rules
   - Real-time classification
   - Results with explanations

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
echo "GEMINI_API_KEY=your_key_here" > .env.local

# 3. Run development server
npm run dev

# 4. Open browser
open http://localhost:3000
```

## 📝 API Usage

```bash
curl -X POST http://localhost:3000/api/classify \
  -H "Content-Type: application/json" \
  -d '{
    "email": {
      "subject": "Your order has shipped",
      "body": "Your order #123 has been shipped...",
      "from": "orders@store.com"
    },
    "rules": [
      {
        "label": "Shopping",
        "prompt": "order confirmation or shipping"
      }
    ]
  }'
```

## 🎯 What's Different from Original Repos

### Removed
- ❌ Ollama integration and dependencies
- ❌ OpenAI API support (replaced with Gemini)
- ❌ Gmail OAuth backend processing (demo focused)
- ❌ Google Sheets integration for rules (rules in UI)
- ❌ Bun-specific code (works with npm/pnpm/bun)

### Added
- ✅ Google Gemini AI integration
- ✅ Rate limiting with IP/cookie tracking
- ✅ Interactive demo component
- ✅ Backend API endpoint
- ✅ Docker support
- ✅ Comprehensive documentation
- ✅ Example emails and rules

### Changed
- 🔄 Monorepo → Single Next.js app
- 🔄 Backend service → API routes
- 🔄 Static site → Full-stack app
- 🔄 Multiple AI providers → Gemini only

## 📦 Dependencies

### Key Packages
- `next@16.0.10` - Framework
- `react@19.2.0` - UI library
- `@google/generative-ai` - Gemini AI SDK
- `tailwindcss@4.1.9` - Styling
- `@radix-ui/*` - UI components
- `lucide-react` - Icons

### Total Dependencies: 48
### Dev Dependencies: 7

## 🌐 Deployment Options

1. **Vercel** (Recommended)
   - One-click deploy
   - Automatic HTTPS
   - Environment variables in dashboard

2. **Docker**
   - `docker-compose up`
   - Self-hosted
   - Full control

3. **Other Platforms**
   - Netlify
   - Railway
   - AWS Amplify
   - Any Node.js host

## 🔒 Environment Variables

### Required
```
GEMINI_API_KEY=your_gemini_api_key
```

### Optional (for Gmail integration)
```
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REFRESH_TOKEN=your_refresh_token
GOOGLE_SHEETS_URL=your_sheets_url
```

## 🎨 Customization

### Adjust Rate Limits
Edit `app/api/classify/route.ts`:
```typescript
const rateLimit = checkRateLimit(clientId, { 
  maxRequests: 20,  // Change this
  windowMs: 60000   // Change this (ms)
});
```

### Change AI Model
Edit `lib/ai-labeler.ts`:
```typescript
const model = geminiClient.getGenerativeModel({ 
  model: 'gemini-1.5-flash'  // or 'gemini-1.5-pro'
});
```

### Add Custom Rules
Users can add rules directly in the interactive demo UI.

## 📊 Testing

### Manual Testing
1. Go to http://localhost:3000
2. Scroll to "Interactive Demo"
3. Click "Load Example 1"
4. Click "Classify Email"
5. Verify labels appear

### API Testing
```bash
# Test rate limiting (run 21 times quickly)
for i in {1..21}; do
  curl -X POST http://localhost:3000/api/classify \
    -H "Content-Type: application/json" \
    -d '{"email":{"subject":"test","body":"test","from":"test@test.com"},"rules":[{"label":"Test","prompt":"test"}]}'
done
```

## 🐛 Known Issues / Limitations

1. Rate limiting is in-memory (resets on restart)
2. No persistent storage for demo results
3. No authentication (rate limiting only)
4. Gemini API key exposed to server (not client)
5. Demo-focused (not production Gmail integration)

## 📈 Next Steps (Not Implemented)

If you want to extend this project:

1. **Database Integration**
   - Store classification history
   - User accounts and rules

2. **Gmail Integration**
   - OAuth flow
   - Auto-labeling background job
   - Real Gmail label management

3. **Advanced Rate Limiting**
   - Redis-based store
   - Per-user limits
   - API key authentication

4. **Analytics**
   - Track classification accuracy
   - Popular rules
   - Usage statistics

5. **Multiple AI Providers**
   - OpenAI fallback
   - Anthropic Claude
   - Provider selection in UI

## ✨ Credits

Built by merging:
- Original backend: Fan Pier Labs
- Demo site: Fan Pier Labs
- Integration & enhancements: Current migration

## 📄 License

MIT - See LICENSE file (if exists) or original repos
