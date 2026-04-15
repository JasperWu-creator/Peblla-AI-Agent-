# Restaurant Growth Agent

This project is ready to deploy on Vercel with DeepSeek called through the OpenAI JavaScript SDK.

## Files
- `index.html`: frontend UI
- `api/chat.js`: Vercel Function that calls DeepSeek through the OpenAI SDK
- `package.json`: installs the `openai` package on Vercel
- `vercel.json`: basic Vercel config

## Environment variable
Set this in Vercel:
- `DEEPSEEK_API_KEY` = your DeepSeek API key

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
