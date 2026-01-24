# Auto Label Email - Getting Started

## Quick Setup (5 minutes)

### Step 1: Get Your Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy your new API key

### Step 2: Configure Environment

Create a file named `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_api_key_here
```

### Step 3: Install and Run

Using Bun (recommended):
```bash
# Install dependencies
bun install

# Start the development server
bun dev
```

Using npm:
```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

### Step 4: Open in Browser

Visit [http://localhost:3000](http://localhost:3000)

## Try the Interactive Demo

1. Scroll to the "Interactive Demo" section
2. Click "Load Example 1" to see a sample email
3. The default rules are already loaded
4. Click "Classify Email" to see the AI in action
5. Try modifying the email or adding your own rules!

## Example Rules

Here are some useful rules to get started:

- **Shopping**: "order confirmation or shipping notification"
- **Newsletter**: "newsletter or marketing email with unsubscribe"
- **Meeting**: "meeting invitation or scheduling"
- **Important**: "urgent or requires immediate action"
- **Receipt**: "payment confirmation or receipt"

## Next Steps

- Customize the demo with your own emails and rules
- Adjust rate limits in `app/api/classify/route.ts`
- Deploy to Vercel, Netlify, or any Node.js platform
- Integrate with Gmail API for production use

## Need Help?

Check the main [README.md](./README.md) for detailed documentation.
