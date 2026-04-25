const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const modelInput = document.getElementById("modelInput");
const uploadForm = document.getElementById("uploadForm");
const documentInput = document.getElementById("documentInput");
const uploadBtn = document.getElementById("uploadBtn");
const modeBadge = document.getElementById("modeBadge");
const fileList = document.getElementById("fileList");

let selectedFilesArray = [];

const conversation = [
  {
    role: "system",
    content: "You are a helpful assistant.",
  },
];
const MEMORY_TRIGGER_EVERY = 5;
const RECENT_MESSAGES_TO_KEEP = 6;
let hasUploadedDocuments = false;

function setModeBadge() {
  if (!modeBadge) {
    return;
  }

  if (hasUploadedDocuments) {
    modeBadge.textContent = "Mode: RAG";
    modeBadge.classList.add("rag");
  } else {
    modeBadge.textContent = "Mode: Chat";
    modeBadge.classList.remove("rag");
  }
}

setModeBadge();

function addMessage(role, text) {
  const el = document.createElement("article");
  el.className = `message ${role}`;

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "system" ? "" : "Calculating tokens...";

  el.append(body, meta);
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return { el, body, meta };
}

async function updateTokenCount(messageHandle, text) {
  if (!messageHandle || !messageHandle.meta) {
    return;
  }

  try {
    const response = await fetch("/api/token-count", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    messageHandle.meta.textContent = `Tokens: ${data.tokens || 0}`;
  } catch (_error) {
    const estimatedTokens = Math.max(1, Math.ceil((text || "").length / 4));
    messageHandle.meta.textContent = `Tokens: ~${estimatedTokens}`;
  }
}

function setExactUsageMeta(messageMetaEl, usage) {
  if (!messageMetaEl || !usage) {
    return false;
  }

  const prompt = Number(usage.prompt_tokens || 0);
  const completion = Number(usage.completion_tokens || 0);
  const total = Number(usage.total_tokens || 0);
  const hasAny = prompt > 0 || completion > 0 || total > 0;

  if (!hasAny) {
    return false;
  }

  if (completion > 0) {
    messageMetaEl.textContent = `Tokens: ${total} (in ${prompt}, out ${completion})`;
  } else {
    messageMetaEl.textContent = `Tokens: ${total} (input ${prompt})`;
  }

  return true;
}

function extractUsageMarker(text) {
  const marker = "\n__USAGE__";
  const markerIndex = text.lastIndexOf(marker);

  if (markerIndex === -1) {
    return { cleanText: text, usage: null };
  }

  const cleanText = text.slice(0, markerIndex);
  const rawUsage = text.slice(markerIndex + marker.length);

  try {
    return { cleanText, usage: JSON.parse(rawUsage) };
  } catch (_err) {
    return { cleanText: text, usage: null };
  }
}

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  messageInput.disabled = busy;
  sendBtn.textContent = busy ? "Thinking..." : "Send";
}

function setUploadBusy(busy) {
  uploadBtn.disabled = busy;
  documentInput.disabled = busy;
  uploadBtn.textContent = busy ? "Indexing..." : "Index";
}

function renderFileList() {
  if (!fileList) return;
  fileList.innerHTML = "";
  selectedFilesArray.forEach(file => {
    const el = document.createElement("div");
    el.className = "file-item";
    el.textContent = file.name;
    fileList.appendChild(el);
  });
}

documentInput.addEventListener("change", (e) => {
  const newFiles = Array.from(e.target.files || []);
  selectedFilesArray = [...selectedFilesArray, ...newFiles];
  renderFileList();
  documentInput.value = "";
});

function appendAssistantMessage() {
  const el = document.createElement("article");
  el.className = "message assistant";
  const body = document.createElement("div");
  body.className = "message-body";
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = "Calculating tokens...";
  el.append(body, meta);
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return el;
}

addMessage(
  "system",
  "Upload documents, then ask questions grounded in those files.",
);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = messageInput.value.trim();
  if (!content) {
    return;
  }

  const userMessage = addMessage("user", content);
  updateTokenCount(userMessage, content);
  conversation.push({ role: "user", content });

  messageInput.value = "";
  autoResize();
  setBusy(true);

  const assistantBubble = appendAssistantMessage();
  let assistantText = "";

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: content,
        userId: "user_001",
        useRag: hasUploadedDocuments,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Request failed");
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/plain")) {
      if (!response.body) {
        throw new Error("Streaming response is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (!value || value.length === 0) {
          continue;
        }

        assistantText += decoder.decode(value, { stream: true });
        assistantBubble.querySelector(".message-body").textContent = assistantText;
        chatWindow.scrollTop = chatWindow.scrollHeight;
      }

      assistantText += decoder.decode();
      const extracted = extractUsageMarker(assistantText);
      const finalAssistantText = extracted.cleanText.trim() || "No response from RAG service.";
      assistantBubble.querySelector(".message-body").textContent = finalAssistantText;
      const usedExact = setExactUsageMeta(
        assistantBubble.querySelector(".message-meta"),
        extracted.usage,
      );
      if (!usedExact) {
        updateTokenCount({ meta: assistantBubble.querySelector(".message-meta") }, finalAssistantText);
      }
      assistantText = finalAssistantText;
    } else {
      const data = await response.json();
      assistantText = (data.answer || "").trim() || "No response from RAG service.";
      assistantBubble.querySelector(".message-body").textContent = assistantText;
      const usedExact = setExactUsageMeta(
        assistantBubble.querySelector(".message-meta"),
        data.usage,
      );
      if (!usedExact) {
        updateTokenCount({ meta: assistantBubble.querySelector(".message-meta") }, assistantText);
      }
    }

    conversation.push({ role: "assistant", content: assistantText });

    const userTurns = conversation.filter((m) => m.role === "user").length;
    if (userTurns > 0 && userTurns % MEMORY_TRIGGER_EVERY === 0) {
      const nonSystemMessages = conversation.filter((m) => m.role !== "system");
      if (nonSystemMessages.length > RECENT_MESSAGES_TO_KEEP) {
        fetch("/api/save-memory", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: nonSystemMessages,
            userId: "user_001",
          }),
        }).catch(() => {});
      }
    }
  } catch (error) {
    addMessage("system", `Error: ${error.message}`);
  } finally {
    setBusy(false);
    messageInput.focus();
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (selectedFilesArray.length === 0) {
    addMessage("system", "Select at least one document to upload.");
    return;
  }

  const form = new FormData();
  for (const file of selectedFilesArray) {
    form.append("documents", file);
  }

  setUploadBusy(true);
  addMessage("system", `Indexing ${selectedFilesArray.length} file(s)...`);

  try {
    const response = await fetch("/api/upload-documents", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      let errorMessage = "Upload failed";
      try {
        const data = await response.json();
        errorMessage = data.error || data.detail || errorMessage;
      } catch (_err) {
        // Keep fallback message.
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const embeddingUsage = data.embeddingUsage || {};
    const embeddingTokens = Number(embeddingUsage.total_tokens || 0);
    const usageSuffix = embeddingTokens > 0 ? ` Embedding tokens: ${embeddingTokens}.` : "";
    
    let timingSuffix = "";
    if (data.timings) {
      timingSuffix = ` [Load: ${data.timings.load_and_chunk}s, Embed: ${data.timings.embed}s, Total: ${data.timings.total}s]`;
    }

    addMessage(
      "system",
      `Indexed ${data.filesProcessed || 0} file(s), skipped ${data.filesSkipped || 0}, chunks: ${data.chunks || 0}.${usageSuffix}${timingSuffix}`,
    );
    documentInput.value = "";
    selectedFilesArray = [];
    renderFileList();
    hasUploadedDocuments = true;
    setModeBadge();
  } catch (error) {
    addMessage("system", `Upload error: ${error.message}`);
  } finally {
    setUploadBusy(false);
  }
});

messageInput.addEventListener("input", autoResize);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});
