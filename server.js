require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
const RAG_FALLBACK_URL = process.env.RAG_FALLBACK_URL || 'http://localhost:8001';
const RAG_BASE_URLS = Array.from(new Set([RAG_SERVICE_URL, RAG_FALLBACK_URL]));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

function buildUploadForm(files) {
  const form = new FormData();

  for (const file of files) {
    form.append('files', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype || 'application/octet-stream'
    });
  }

  return form;
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function extractErrorMessage(err, fallbackMessage) {
  const responseData = err?.response?.data;

  if (typeof responseData === 'string' && responseData.trim()) {
    return responseData;
  }

  if (responseData && typeof responseData === 'object') {
    if (typeof responseData.detail === 'string' && responseData.detail.trim()) {
      return responseData.detail;
    }
    if (typeof responseData.error === 'string' && responseData.error.trim()) {
      return responseData.error;
    }
    if (typeof responseData.message === 'string' && responseData.message.trim()) {
      return responseData.message;
    }
  }

  if (typeof err?.message === 'string' && err.message.trim()) {
    return err.message;
  }

  if (typeof err === 'string' && err.trim()) {
    return err;
  }

  return fallbackMessage;
}

app.post('/chat', async (req, res) => {
  try {
    const userMessage = (req.body?.message || '').trim();
    if (!userMessage) {
      return res.status(400).json({ error: 'message is required.' });
    }

    const candidatePaths = ['/rag', '/api/rag'];
    let response;
    let lastError;

    for (const baseUrl of RAG_BASE_URLS) {
      for (const endpoint of candidatePaths) {
        try {
          response = await axios.post(
            `${baseUrl}${endpoint}`,
            { query: userMessage },
            {
              timeout: 120000
            }
          );
          break;
        } catch (endpointErr) {
          lastError = endpointErr;
          const statusCode = endpointErr?.response?.status;
          const isRouteOrHostMiss = statusCode === 404 || endpointErr?.code === 'ECONNREFUSED';
          if (!isRouteOrHostMiss) {
            throw endpointErr;
          }
        }
      }

      if (response) {
        break;
      }
    }

    if (!response) {
      throw lastError || new Error('No RAG endpoint found on configured service URLs.');
    }

    return res.json({ answer: response.data?.answer || '' });
  } catch (err) {
    const message = extractErrorMessage(err, 'RAG service request failed.');
    return res.status(err?.response?.status || 500).json({ error: message });
  }
});

app.post('/api/upload-documents', upload.array('documents', 20), async (req, res) => {
  try {
    const files = req.files || [];

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'At least one document is required.' });
    }

    const candidatePaths = ['/upload', '/api/upload'];
    let response;
    let lastError;

    for (const baseUrl of RAG_BASE_URLS) {
      for (const endpoint of candidatePaths) {
        try {
          const form = buildUploadForm(files);
          response = await axios.post(`${baseUrl}${endpoint}`, form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 300000
          });
          break;
        } catch (endpointErr) {
          lastError = endpointErr;
          const statusCode = endpointErr?.response?.status;
          const isRouteOrHostMiss = statusCode === 404 || endpointErr?.code === 'ECONNREFUSED';
          if (!isRouteOrHostMiss) {
            throw endpointErr;
          }
        }
      }

      if (response) {
        break;
      }
    }

    if (!response) {
      throw lastError || new Error('No upload endpoint found on RAG service.');
    }

    return res.json(response.data);
  } catch (err) {
    const message = extractErrorMessage(err, 'Document upload failed.');
    return res.status(err?.response?.status || 500).json({ error: message });
  }
});

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
      stream: true,
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

    if (!response.ok || !response.body) {
      let message = 'OpenRouter request failed.';
      try {
        const data = await response.json();
        message = data?.error?.message || data?.error || message;
      } catch (_err) {
        // Keep fallback message.
      }

      return res.status(response.status || 500).json({ error: message });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let shouldStop = false;

    while (!shouldStop) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value || value.length === 0) {
        continue;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || !trimmed.startsWith('data:')) {
          continue;
        }

        const rawPayload = trimmed.replace(/^data:\s*/, '');
        if (!rawPayload) {
          continue;
        }

        if (rawPayload === '[DONE]') {
          shouldStop = true;
          break;
        }

        let parsed;
        try {
          parsed = JSON.parse(rawPayload);
        } catch (_err) {
          continue;
        }

        const delta = parsed?.choices?.[0]?.delta?.content;
        if (!delta) {
          continue;
        }

        res.write(delta);
      }
    }

    if (shouldStop) {
      try {
        await reader.cancel();
      } catch (_err) {
        // Ignore cancellation errors from already-closed streams.
      }
    }

    return res.end();
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Server error while requesting model.' });
    }

    res.write('\n[Stream interrupted]');
    return res.end();
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chatbot app is running at http://localhost:${PORT}`);
});
