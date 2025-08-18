# 🚀 Netlify Deployment Checklist

## ✅ Pre-Deployment Checklist

### 1. Files Ready
- [ ] `package.json` with build script
- [ ] `vite.config.ts` updated
- [ ] `netlify.toml` created
- [ ] `src/` folder with React code
- [ ] `index.html` in root
- [ ] All files committed to GitHub

### 2. Environment Variables (Set in Netlify)
- [ ] `VITE_SUPABASE_URL` = your_supabase_project_url
- [ ] `VITE_SUPABASE_ANON_KEY` = your_supabase_anon_key
- [ ] `VITE_API_BASE_URL` = https://websites-contact-finder.onrender.com

### 3. Backend Ready
- [ ] Render backend deployed and working
- [ ] Backend URL accessible
- [ ] Supabase database configured
- [ ] API keys working

## 🚀 Quick Deploy Steps

### Option 1: Netlify UI (Easiest)
1. Go to [app.netlify.com](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect to GitHub
4. Select your repository
5. Set build command: `npm run build`
6. Set publish directory: `dist`
7. Add environment variables
8. Click "Deploy site"

### Option 2: Netlify CLI
```bash
# Install CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod
```

## 🔧 Troubleshooting

### If Build Fails:
- Check build logs in Netlify
- Ensure all dependencies in `package.json`
- Verify Node.js version (18+)

### If Environment Variables Not Working:
- Variable names must start with `VITE_`
- Redeploy after adding variables
- Clear browser cache

### If API Calls Fail:
- Check `VITE_API_BASE_URL` is correct
- Verify Render backend is running
- Test API endpoints directly

## 📞 Support
- Netlify Docs: [docs.netlify.com](https://docs.netlify.com)
- Your site will be: `https://your-site-name.netlify.app`

## 🎯 Next Steps After Deployment
1. Test login/signup
2. Test API key management
3. Test webhook functionality
4. Set up custom domain (optional)
5. Configure automatic deployments
