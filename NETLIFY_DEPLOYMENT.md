# Netlify Deployment Guide

## 🚀 Deploy Your Frontend to Netlify

This guide will help you deploy your React frontend to Netlify while keeping your backend on Render.

## Prerequisites

1. **GitHub Repository**: Your code should be in a GitHub repository
2. **Netlify Account**: Sign up at [netlify.com](https://netlify.com)
3. **Backend URL**: Your Render backend should be deployed and working

## Step 1: Prepare Your Repository

### 1.1 Ensure these files are in your repository:
- ✅ `package.json` (with build script)
- ✅ `vite.config.ts`
- ✅ `netlify.toml` (created above)
- ✅ `src/` folder (your React code)
- ✅ `index.html`

### 1.2 Environment Variables
You'll need to set these in Netlify:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL` (should be your Render URL)

## Step 2: Deploy to Netlify

### Option A: Deploy via Netlify UI (Recommended)

1. **Go to Netlify Dashboard**
   - Visit [app.netlify.com](https://app.netlify.com)
   - Sign in with your account

2. **Connect to GitHub**
   - Click "Add new site" → "Import an existing project"
   - Choose "Deploy with GitHub"
   - Authorize Netlify to access your GitHub

3. **Select Your Repository**
   - Choose your repository from the list
   - Netlify will auto-detect it's a React app

4. **Configure Build Settings**
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Node version**: `18` (or latest LTS)

5. **Set Environment Variables**
   - Click "Environment variables"
   - Add these variables:
     ```
     VITE_SUPABASE_URL=your_supabase_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     VITE_API_BASE_URL=https://websites-contact-finder.onrender.com
     ```

6. **Deploy**
   - Click "Deploy site"
   - Wait for build to complete (2-3 minutes)

### Option B: Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize Netlify**
   ```bash
   netlify init
   ```

4. **Set Environment Variables**
   ```bash
   netlify env:set VITE_SUPABASE_URL "your_supabase_url"
   netlify env:set VITE_SUPABASE_ANON_KEY "your_supabase_anon_key"
   netlify env:set VITE_API_BASE_URL "https://websites-contact-finder.onrender.com"
   ```

5. **Deploy**
   ```bash
   netlify deploy --prod
   ```

## Step 3: Configure Custom Domain (Optional)

1. **Go to Site Settings**
   - In your Netlify dashboard, go to "Site settings"

2. **Custom Domain**
   - Click "Domain management"
   - Add your custom domain
   - Follow DNS configuration instructions

## Step 4: Test Your Deployment

1. **Check Your Site**
   - Visit your Netlify URL
   - Test login/signup functionality
   - Test API key management
   - Test webhook functionality

2. **Check Console for Errors**
   - Open browser dev tools
   - Look for any CORS or API errors
   - Ensure environment variables are loaded

## Troubleshooting

### Common Issues:

1. **Build Fails**
   - Check build logs in Netlify
   - Ensure all dependencies are in `package.json`
   - Verify Node.js version compatibility

2. **Environment Variables Not Loading**
   - Check variable names (must start with `VITE_`)
   - Redeploy after adding variables
   - Clear browser cache

3. **CORS Errors**
   - Ensure your Render backend allows your Netlify domain
   - Check Supabase CORS settings

4. **API Calls Failing**
   - Verify `VITE_API_BASE_URL` is correct
   - Check if Render backend is running
   - Test API endpoints directly

### Build Logs
If build fails, check the build logs in Netlify dashboard for specific error messages.

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key | `eyJhbGciOiJIUzI1NiIs...` |
| `VITE_API_BASE_URL` | Your Render backend URL | `https://websites-contact-finder.onrender.com` |

## Next Steps

1. **Set up automatic deployments**
   - Every push to main branch will trigger a new deployment

2. **Monitor performance**
   - Use Netlify Analytics to track site performance

3. **Set up notifications**
   - Get notified of deployment success/failure

## Support

- **Netlify Docs**: [docs.netlify.com](https://docs.netlify.com)
- **Vite Docs**: [vitejs.dev](https://vitejs.dev)
- **React Docs**: [react.dev](https://react.dev)

Your frontend will be live at: `https://your-site-name.netlify.app`
