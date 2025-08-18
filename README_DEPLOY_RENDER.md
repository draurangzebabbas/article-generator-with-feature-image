# Deploy to Render

This guide helps you deploy both the backend (Express API) and frontend (Vite React app) to Render.

## 1) Prerequisites
- A GitHub repository with this project
- A Render.com account
- Supabase project URL and anon key

## 2) Environment Variables

Backend Service (article-generator-backend):
- SUPABASE_URL: your Supabase project URL
- SUPABASE_ANON_KEY: your Supabase anon key
- NODE_ENV: production (default)
- PORT: 10000 (Render will set PORT, our server should bind to process.env.PORT)

Frontend Service (article-generator-frontend):
- VITE_API_BASE_URL: URL of your backend service on Render (e.g., https://article-generator-backend.onrender.com)

## 3) Steps

1. Commit all changes and push to GitHub.
2. On Render, create a new Web Service using your repo.
3. Render will auto-detect `render.yaml` and create two services:
   - article-generator-backend
   - article-generator-frontend
4. Set environment variables for each service as listed above.
5. Deploy both services.
6. After backend is live, copy its URL and set it as VITE_API_BASE_URL for the frontend service, then redeploy the frontend.

## 4) Health Check
- Visit: https://<backend-url>/health → should return {"status":"ok"}

## 5) Webhook URLs
- Contact extraction: https://<backend-url>/api/extract-contacts
- Article generation: https://<backend-url>/api/generate-article-webhook

Include Authorization: Bearer <your webhook token>

## 6) Troubleshooting
- If the frontend shows network errors, verify VITE_API_BASE_URL points to your backend URL.
- If the backend returns non-JSON, check logs in Render dashboard.
- Make sure API keys are added under "API Keys" in the dashboard and status is active.
