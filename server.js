require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const { get_encoding } = require("@dqbd/tiktoken");

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || "http://localhost:8000";
const RAG_FALLBACK_URL =
  process.env.RAG_FALLBACK_URL || "http://localhost:8001";
const RAG_BASE_URLS = Array.from(new Set([RAG_SERVICE_URL, RAG_FALLBACK_URL]));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
const { loadMemory, saveMemory, compressMemory } = require("./memory");
const INDEX_FILE_PATH = path.join(__dirname, "rag_service", "data", "index.faiss");
const TOKENIZER = get_encoding("cl100k_base");

function buildUploadForm(files) {
  const form = new FormData();

  for (const file of files) {
    form.append("files", file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype || "application/octet-stream",
    });
  }

  return form;
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function extractErrorMessage(err, fallbackMessage) {
  const responseData = err?.response?.data;

  if (typeof responseData === "string" && responseData.trim()) {
    return responseData;
  }

  if (responseData && typeof responseData === "object") {
    if (typeof responseData.detail === "string" && responseData.detail.trim()) {
      return responseData.detail;
    }
    if (typeof responseData.error === "string" && responseData.error.trim()) {
      return responseData.error;
    }
    if (
      typeof responseData.message === "string" &&
      responseData.message.trim()
    ) {
      return responseData.message;
    }
  }

  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message;
  }

  if (typeof err === "string" && err.trim()) {
    return err;
  }

  return fallbackMessage;
}

function getOlderMessages(messages, recentCount = 6) {
  const validMessages = Array.isArray(messages)
    ? messages.filter(
        (message) =>
          message &&
          typeof message.role === "string" &&
          typeof message.content === "string" &&
          message.role !== "system",
      )
    : [];

  if (validMessages.length <= recentCount) {
    return [];
  }

  return validMessages.slice(0, validMessages.length - recentCount);
}

function hasIndexedDocuments() {
  try {
    if (!fs.existsSync(INDEX_FILE_PATH)) {
      return false;
    }

    const stats = fs.statSync(INDEX_FILE_PATH);
    return stats.size > 0;
  } catch (_err) {
    return false;
  }
}

function countTokens(text) {
  return TOKENIZER.encode(text || "").length;
}

app.post("/api/token-count", (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    return res.json({ tokens: countTokens(text) });
  } catch (err) {
    const message = extractErrorMessage(err, "Token counting failed.");
    return res.status(500).json({ error: message });
  }
});

async function requestOpenRouterAnswer(query) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing. Add it to your .env file.");
  }

  const payload = {
    model: process.env.OPENROUTER_MODEL || "openrouter/auto",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      {
        role: "user",
        content: query,
      },
    ],
    temperature: 0.7,
    stream: false,
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:" + PORT,
      "X-Title": "Gen AI Chatbot",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = "OpenRouter request failed.";
    try {
      const data = await response.json();
      message = data?.error?.message || data?.error || message;
    } catch (_err) {
      // Keep fallback error message.
    }
    throw new Error(message);
  }

  const data = await response.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}

async function streamOpenRouterAnswer(query, res) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing. Add it to your .env file.");
  }

  const payload = {
    model: process.env.OPENROUTER_MODEL || "openrouter/auto",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant.",
      },
      {
        role: "user",
        content: query,
      },
    ],
    temperature: 0.7,
    stream: true,
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:" + PORT,
      "X-Title": "Gen AI Chatbot",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    let message = "OpenRouter request failed.";
    try {
      const data = await response.json();
      message = data?.error?.message || data?.error || message;
    } catch (_err) {
      // Keep fallback error message.
    }
    throw new Error(message);
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
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
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || !trimmed.startsWith("data:")) {
        continue;
      }

      const rawPayload = trimmed.replace(/^data:\s*/, "");
      if (!rawPayload) {
        continue;
      }

      if (rawPayload === "[DONE]") {
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
}

app.post("/api/save-memory", async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing. Add it to your .env file.",
      });
    }

    const userId = req.body?.userId || "user_001";
    const messages = req.body?.messages;
    const olderMessages = getOlderMessages(messages, 6);

    if (olderMessages.length === 0) {
      return res.status(400).json({
        error: "Not enough older messages to summarize.",
      });
    }

    const memoryNote = (await compressMemory(olderMessages, apiKey)).trim();
    if (!memoryNote) {
      return res.status(500).json({
        error: "Memory compression returned an empty note.",
      });
    }

    saveMemory(userId, memoryNote);

    return res.json({
      ok: true,
      userId,
      summarizedMessages: olderMessages.length,
      memoryNote,
    });
  } catch (err) {
    const message = extractErrorMessage(err, "Memory save failed.");
    return res.status(err?.response?.status || 500).json({ error: message });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = (req.body?.message || "").trim();
    const userId = req.body?.userId || "user_001"; // add this
    const useRag = Boolean(req.body?.useRag);
    if (!userMessage) {
      return res.status(400).json({ error: "message is required." });
    }

    // Load memory and attach to query
    const memoryNote = loadMemory(userId);
    const enrichedQuery = memoryNote
      ? `[Context about this user]\n${memoryNote}\n\nUser question: ${userMessage}`
      : userMessage;

    if (!useRag) {
      return streamOpenRouterAnswer(enrichedQuery, res);
    }

    if (!hasIndexedDocuments()) {
      return streamOpenRouterAnswer(enrichedQuery, res);
    }

    try {
      const candidatePaths = ["/rag", "/api/rag"];
      let response;
      let lastError;

      for (const baseUrl of RAG_BASE_URLS) {
        for (const endpoint of candidatePaths) {
          try {
            response = await axios.post(
              `${baseUrl}${endpoint}`,
              { query: enrichedQuery },
              { timeout: 120000 },
            );
            break;
          } catch (endpointErr) {
            lastError = endpointErr;
            const statusCode = endpointErr?.response?.status;
            const isRouteOrHostMiss =
              statusCode === 404 || endpointErr?.code === "ECONNREFUSED";
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
        throw (
          lastError ||
          new Error("No RAG endpoint found on configured service URLs.")
        );
      }

      return res.json({ answer: response.data?.answer || "" });
    } catch (_ragErr) {
      const answer = await requestOpenRouterAnswer(enrichedQuery);
      return res.json({ answer });
    }
  } catch (err) {
    const message = extractErrorMessage(err, "RAG service request failed.");
    return res.status(err?.response?.status || 500).json({ error: message });
  }
});
app.post(
  "/api/upload-documents",
  upload.array("documents", 20),
  async (req, res) => {
    try {
      const files = req.files || [];

      if (!Array.isArray(files) || files.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one document is required." });
      }

      const candidatePaths = ["/upload", "/api/upload"];
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
              timeout: 300000,
            });
            break;
          } catch (endpointErr) {
            lastError = endpointErr;
            const statusCode = endpointErr?.response?.status;
            const isRouteOrHostMiss =
              statusCode === 404 || endpointErr?.code === "ECONNREFUSED";
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
        throw (
          lastError || new Error("No upload endpoint found on RAG service.")
        );
      }

      return res.json(response.data);
    } catch (err) {
      const message = extractErrorMessage(err, "Document upload failed.");
      return res.status(err?.response?.status || 500).json({ error: message });
    }
  },
);

app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing. Add it to your .env file.",
      });
    }

    const { messages, model } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ error: "messages must be a non-empty array." });
    }

    const safeMessages = messages
      .filter(
        (m) => m && typeof m.role === "string" && typeof m.content === "string",
      )
      .slice(-20);

    if (safeMessages.length === 0) {
      return res.status(400).json({ error: "No valid messages provided." });
    }

    const payload = {
      model: model || process.env.OPENROUTER_MODEL || "openrouter/auto",
      messages: safeMessages,
      stream: true,
      temperature: 0.7,
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:" + PORT,
        "X-Title": "Gen AI Chatbot",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      let message = "OpenRouter request failed.";
      try {
        const data = await response.json();
        message = data?.error?.message || data?.error || message;
      } catch (_err) {
        // Keep fallback message.
      }

      return res.status(response.status || 500).json({ error: message });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
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
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || !trimmed.startsWith("data:")) {
          continue;
        }

        const rawPayload = trimmed.replace(/^data:\s*/, "");
        if (!rawPayload) {
          continue;
        }

        if (rawPayload === "[DONE]") {
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
      return res
        .status(500)
        .json({ error: "Server error while requesting model." });
    }

    res.write("\n[Stream interrupted]");
    return res.end();
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Chatbot app is running at http://localhost:${PORT}`);
});
