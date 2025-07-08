document.addEventListener('DOMContentLoaded', () => {
  const messagesEl = document.getElementById('chatMessages');
  const inputEl = document.getElementById('chatInput');
  const formEl = document.getElementById('chatForm');
  const instrEl = document.getElementById('agentInstructions');

  // Load default instructions if available
  fetch('/pm_agi_instructions.txt')
    .then(res => res.ok ? res.text() : '')
    .then(text => { instrEl.value = text; })
    .catch(() => { /* ignore */ });

  function addMessage(author, text) {
    const div = document.createElement('div');
    div.className = 'chat-sequence';
    div.textContent = `${author}: ${text}`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  addMessage('AlfePM AGI', 'What are you working on?');

  formEl.addEventListener('submit', e => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if(!text) return;
    addMessage('You', text);
    inputEl.value = '';
  });
});
