const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const modelInput = document.getElementById('modelInput');

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
  sendBtn.textContent = busy ? 'Streaming...' : 'Send';
}

addMessage('system', 'Ask anything. Your API key stays on the server in .env.');

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const content = messageInput.value.trim();
  const model = modelInput.value.trim() || 'openrouter/auto';

  if (!content) {
    return;
  }

  addMessage('user', content);
  conversation.push({ role: 'user', content });

  messageInput.value = '';
  autoResize();
  setBusy(true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: conversation
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

    if (!response.body) {
      throw new Error('Streaming response is not supported in this browser.');
    }

    const assistantEl = document.createElement('article');
    assistantEl.className = 'message assistant';
    assistantEl.textContent = '';
    chatWindow.appendChild(assistantEl);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let finalReply = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value || value.length === 0) {
        continue;
      }

      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) {
        continue;
      }

      finalReply += chunk;
      assistantEl.textContent = finalReply;
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    const safeReply = finalReply.trim() || 'No response from model.';
    assistantEl.textContent = safeReply;
    conversation.push({ role: 'assistant', content: safeReply });
  } catch (error) {
    addMessage('system', `Error: ${error.message}`);
  } finally {
    setBusy(false);
    messageInput.focus();
  }
});

messageInput.addEventListener('input', autoResize);
messageInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});
