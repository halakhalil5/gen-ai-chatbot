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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    const reply = data.reply || 'No response from model.';
    addMessage('assistant', reply);
    conversation.push({ role: 'assistant', content: reply });
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
