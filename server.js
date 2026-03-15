require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'OPENROUTER_API_KEY is missing. Add it to your .env file.'
      });
    }

    const { messages, model } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array.' });
    }

    const safeMessages = messages
      .filter((m) => m && typeof m.role === 'string' && typeof m.content === 'string')
      .slice(-20);

    if (safeMessages.length === 0) {
      return res.status(400).json({ error: 'No valid messages provided.' });
    }

    const payload = {
      model: model || process.env.OPENROUTER_MODEL || 'openrouter/auto',
      messages: safeMessages,
      temperature: 0.7
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:' + PORT,
        'X-Title': 'Gen AI Chatbot'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || data?.error || 'OpenRouter request failed.'
      });
    }

    const assistantText = data?.choices?.[0]?.message?.content || '';

    return res.json({ reply: assistantText, raw: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error while requesting model.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chatbot app is running at http://localhost:${PORT}`);
});
