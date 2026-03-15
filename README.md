# Gen AI Chatbot UI

A modern chatbot UI with a secure server proxy for OpenRouter.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set your key:

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openrouter/auto
PORT=3000
```

3. Start:

```bash
npm run dev
```

4. Open `http://localhost:3000`

## Why this is secure

- The browser calls `/api/chat` on your local server.
- Your API key is read only from `.env` on the server.
- The key is never exposed in frontend JavaScript.
