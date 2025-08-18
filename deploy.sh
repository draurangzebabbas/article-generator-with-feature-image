#!/bin/bash

# 🚀 Article Generator Deployment Script
# This script helps you deploy your application to Render and Netlify

echo "🚀 Article Generator Deployment Script"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if git is installed
if ! command -v git &> /dev/null; then
    print_error "Git is not installed. Please install Git first."
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository. Please initialize git first."
    exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
print_status "Current branch: $CURRENT_BRANCH"

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_warning "You have uncommitted changes. Please commit them first."
    echo "Run these commands:"
    echo "  git add ."
    echo "  git commit -m 'Your commit message'"
    echo "  git push origin $CURRENT_BRANCH"
    exit 1
fi

# Check if we're up to date with remote
git fetch origin
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u})

if [ $LOCAL != $REMOTE ]; then
    print_warning "Your local branch is behind the remote. Please pull first."
    echo "Run: git pull origin $CURRENT_BRANCH"
    exit 1
fi

print_success "Repository is ready for deployment!"

echo ""
echo "📋 Deployment Checklist:"
echo "========================"
echo ""

echo "1. ✅ Code is committed and pushed to GitHub"
echo "2. 🔧 Backend fixes applied:"
echo "   - Missing API endpoints added"
echo "   - CORS configuration improved"
echo "   - Error handling enhanced"
echo "3. 📁 Configuration files ready:"
echo "   - render.yaml (for Render backend)"
echo "   - netlify.toml (for Netlify frontend)"
echo "   - package.json (all dependencies included)"

echo ""
echo "🚀 Next Steps:"
echo "=============="
echo ""

echo "1. Deploy Backend on Render:"
echo "   - Go to https://render.com"
echo "   - Sign up with GitHub"
echo "   - Create new Web Service"
echo "   - Connect your repository"
echo "   - Set environment variables:"
echo "     * SUPABASE_URL"
echo "     * SUPABASE_ANON_KEY"
echo "     * SUPABASE_SERVICE_ROLE_KEY"
echo ""

echo "2. Deploy Frontend on Netlify:"
echo "   - Go to https://netlify.com"
echo "   - Sign up with GitHub"
echo "   - Import your repository"
echo "   - Set build command: npm run build"
echo "   - Set publish directory: dist"
echo "   - Set environment variables:"
echo "     * VITE_SUPABASE_URL"
echo "     * VITE_SUPABASE_ANON_KEY"
echo "     * VITE_API_BASE_URL (your Render backend URL)"
echo ""

echo "3. Test Your Deployment:"
echo "   - Test backend: https://your-app.onrender.com/health"
echo "   - Test frontend: https://your-site.netlify.app"
echo "   - Test login/signup functionality"
echo "   - Test API key management"
echo "   - Test webhook functionality"
echo ""

echo "📖 For detailed instructions, see: DEPLOYMENT_CHECKLIST_FINAL.md"
echo ""

# Check if npm is available and build locally for testing
if command -v npm &> /dev/null; then
    echo "🔨 Testing local build..."
    if npm run build; then
        print_success "Local build successful! Your code is ready for deployment."
    else
        print_error "Local build failed. Please fix the issues before deploying."
        exit 1
    fi
else
    print_warning "npm not found. Skipping local build test."
fi

echo ""
print_success "Deployment script completed successfully!"
echo ""
echo "🎯 Ready to deploy? Follow the steps above!"
echo "📞 Need help? Check the troubleshooting section in DEPLOYMENT_CHECKLIST_FINAL.md"
