#!/bin/bash

# Netlify Deployment Script
# This script helps you deploy your frontend to Netlify

echo "🚀 Netlify Deployment Script"
echo "============================"

# Check if Netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo "❌ Netlify CLI not found. Installing..."
    npm install -g netlify-cli
else
    echo "✅ Netlify CLI found"
fi

# Check if user is logged in
if ! netlify status &> /dev/null; then
    echo "🔐 Please login to Netlify..."
    netlify login
else
    echo "✅ Already logged in to Netlify"
fi

# Build the project
echo "🔨 Building project..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi

# Deploy to Netlify
echo "🚀 Deploying to Netlify..."
netlify deploy --prod --dir=dist

echo "🎉 Deployment complete!"
echo "📝 Don't forget to set your environment variables in Netlify dashboard:"
echo "   - VITE_SUPABASE_URL"
echo "   - VITE_SUPABASE_ANON_KEY"
echo "   - VITE_API_BASE_URL"
