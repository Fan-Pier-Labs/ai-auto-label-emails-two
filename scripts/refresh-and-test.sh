#!/bin/bash
set -e

echo "🔄 Refresh Token and Test Script"
echo "================================="
echo ""
echo "This script will:"
echo "1. Get a new Gmail refresh token (requires OAuth in browser)"
echo "2. Automatically update AWS Secrets Manager"
echo "3. Test the processor"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

echo ""
echo "Step 1: Getting new refresh token..."
echo "You'll need to complete OAuth in your browser."
echo ""

# Run get-refresh-token (this will wait for OAuth)
bun run scripts/get-refresh-token.ts

echo ""
echo "Step 2: Testing the processor..."
echo ""

# Now test the processor
bun run scripts/run-processor.ts

echo ""
echo "✅ Done!"
