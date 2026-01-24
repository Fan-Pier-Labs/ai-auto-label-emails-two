#!/bin/bash

# Auto Label Email - Quick Setup Script

set -e

echo "🚀 Auto Label Email - Quick Setup"
echo "=================================="
echo ""

# Check if .env.local exists
if [ -f .env.local ]; then
    echo "✅ .env.local already exists"
else
    echo "📝 Creating .env.local from template..."
    cp .env.example .env.local
    echo "⚠️  Please edit .env.local and add your GEMINI_API_KEY"
    echo "   Get your key from: https://makersuite.google.com/app/apikey"
    echo ""
fi

# Check for node_modules
if [ -d node_modules ]; then
    echo "✅ Dependencies already installed"
else
    echo "📦 Installing dependencies..."
    
    # Detect package manager
    if command -v bun &> /dev/null; then
        echo "   Using bun..."
        bun install
    elif [ -f pnpm-lock.yaml ]; then
        echo "   Using pnpm..."
        pnpm install
    elif [ -f package-lock.json ]; then
        echo "   Using npm..."
        npm install
    else
        echo "   Using npm..."
        npm install
    fi
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "📖 Next steps:"
echo "   1. Edit .env.local and add your GEMINI_API_KEY"
echo "   2. Run: npm run dev"
echo "   3. Open: http://localhost:3000"
echo ""
echo "For detailed instructions, see README.md"
