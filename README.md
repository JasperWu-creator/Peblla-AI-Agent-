# Restaurant Growth Agent

This project is ready to deploy on Vercel with DeepSeek called through the OpenAI JavaScript SDK.

## Files
- `index.html`: frontend UI
- `api/chat.js`: Vercel Function that calls DeepSeek through the OpenAI SDK
- `package.json`: installs the `openai` package on Vercel
- `vercel.json`: basic Vercel config

## Environment variables
Set these in Vercel Project Settings → Environment Variables:
- `DEEPSEEK_API_KEY` (required) = your DeepSeek API key
- `DEEPSEEK_BASE_URL` (optional, defaults to `https://api.deepseek.com`)
- `DEEPSEEK_MODEL` (optional, defaults to `deepseek-chat`)
- `PINECONE_INDEX_HOST` (optional but recommended for retrieval context)
- `PINECONE_API_KEY` (optional but recommended for retrieval context)
- `PINECONE_NAMESPACE` (optional; if missing, code falls back to `PINECONE_INDEX` then `default`)

> Note: `base_url` (lowercase) is now accepted as a fallback for compatibility, but standardize on `DEEPSEEK_BASE_URL`.

## Local test
```bash
npm install
npm i -g vercel
vercel dev
```

Then open:
- http://localhost:3000

## Deploy
1. Push this folder to GitHub.
2. Import the repo into Vercel.
3. Add `DEEPSEEK_API_KEY` in Project Settings → Environment Variables.
4. Redeploy.
