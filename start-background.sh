#!/bin/bash

# Start the background email processor for ryan@fanpierlabs.com

echo "🚀 Starting Email Auto-Labeler Background Processor"
echo "===================================================="
echo ""
echo "📧 Processing emails for: ryan@fanpierlabs.com"
echo "⏰ Check interval: ${POLL_INTERVAL_MINUTES:-5} minutes"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found!"
    echo ""
    echo "Please create .env.local with:"
    echo "  - GEMINI_API_KEY"
    echo "  - GMAIL_REFRESH_TOKEN"
    echo "  - EMAIL_ADDRESS=ryan@fanpierlabs.com (optional, defaults to this)"
    echo ""
    echo "Note: Gmail client_id and client_secret are loaded from google_creds.json"
    echo ""
    exit 1
fi

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Check if google_creds.json exists
if [ ! -f google_creds.json ]; then
    echo "❌ google_creds.json not found!"
    echo ""
    echo "Please create google_creds.json in the project root."
    echo "Download it from: https://console.cloud.google.com/apis/credentials"
    exit 1
fi

# Check required variables
if [ -z "$GEMINI_API_KEY" ] || [ -z "$GMAIL_REFRESH_TOKEN" ]; then
    echo "❌ Missing required environment variables!"
    echo ""
    echo "Required:"
    echo "  - GEMINI_API_KEY"
    echo "  - GMAIL_REFRESH_TOKEN"
    echo ""
    echo "Note: Gmail client_id and client_secret are loaded from google_creds.json"
    echo "Run 'bun run get-token' to get your refresh token"
    exit 1
fi

# Set default email if not set
export EMAIL_ADDRESS=${EMAIL_ADDRESS:-ryan@fanpierlabs.com}

echo "✅ Configuration loaded"
echo ""

# Start the processor
echo "🔄 Starting background processor..."
echo "   Press Ctrl+C to stop"
echo ""

bun run scripts/run-processor.ts
