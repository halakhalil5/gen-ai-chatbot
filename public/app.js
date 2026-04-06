const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const modelInput = document.getElementById('modelInput');
const uploadForm = document.getElementById('uploadForm');
const documentInput = document.getElementById('documentInput');
const uploadBtn = document.getElementById('uploadBtn');

const conversation = [
  {
    role: 'system',
    content: 'You are a helpful assistant.'
  }
];

function addMessage(role, text) {
  const el = document.createElement('article');
  el.className = `message ${role}`;
  el.textContent = text;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function autoResize() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
}

function setBusy(busy) {
  sendBtn.disabled = busy;
  messageInput.disabled = busy;
  sendBtn.textContent = busy ? 'Thinking...' : 'Send';
}

function setUploadBusy(busy) {
  uploadBtn.disabled = busy;
  documentInput.disabled = busy;
  uploadBtn.textContent = busy ? 'Indexing...' : 'Index';
}

addMessage('system', 'Upload documents, then ask questions grounded in those files.');

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const content = messageInput.value.trim();
  if (!content) {
    return;
  }

  addMessage('user', content);
  conversation.push({ role: 'user', content });

  messageInput.value = '';
  autoResize();
  setBusy(true);

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: content
      })
    });

    if (!response.ok) {
      let errorMessage = 'Request failed';
      try {
        const data = await response.json();
        errorMessage = data.error || errorMessage;
      } catch (_err) {
        // Keep fallback message.
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const safeReply = (data.answer || '').trim() || 'No response from RAG service.';
    addMessage('assistant', safeReply);
    conversation.push({ role: 'assistant', content: safeReply });
  } catch (error) {
    addMessage('system', `Error: ${error.message}`);
  } finally {
    setBusy(false);
    messageInput.focus();
  }
});

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const files = Array.from(documentInput.files || []);
  if (files.length === 0) {
    addMessage('system', 'Select at least one document to upload.');
    return;
  }

  const form = new FormData();
  for (const file of files) {
    form.append('documents', file);
  }

  setUploadBusy(true);
  addMessage('system', `Indexing ${files.length} file(s)...`);

  try {
    const response = await fetch('/api/upload-documents', {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      let errorMessage = 'Upload failed';
      try {
        const data = await response.json();
        errorMessage = data.error || data.detail || errorMessage;
      } catch (_err) {
        // Keep fallback message.
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    addMessage(
      'system',
      `Indexed ${data.filesProcessed || 0} file(s), skipped ${data.filesSkipped || 0}, chunks: ${data.chunks || 0}.`
    );
    documentInput.value = '';
  } catch (error) {
    addMessage('system', `Upload error: ${error.message}`);
  } finally {
    setUploadBusy(false);
  }
});

messageInput.addEventListener('input', autoResize);
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});
