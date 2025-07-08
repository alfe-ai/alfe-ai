document.addEventListener('DOMContentLoaded', () => {
  const messagesEl = document.getElementById('chatMessages');
  const inputEl = document.getElementById('chatInput');
  const formEl = document.getElementById('chatForm');
  const instrEl = document.getElementById('agentInstructions');
  const modelSel = document.getElementById('modelSelect');

  let currentTabId = null;

  // Load default instructions if available
  fetch('/pm_agi_instructions.txt')
    .then(res => res.ok ? res.text() : '')
    .then(text => { instrEl.value = text; })
    .catch(() => { /* ignore */ });

  async function setSetting(key, value){
    await fetch('/api/settings', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ key, value })
    });
  }

  async function loadModels(){
    try{
      const r = await fetch('/api/ai/models');
      if(!r.ok) return;
      const data = await r.json();
      modelSel.innerHTML = '';
      const favs = (data.models||[]).filter(m => m.favorite);
      if(favs.length === 0){
        modelSel.appendChild(new Option('(no favorites)',''));
      }else{
        favs.forEach(m => modelSel.appendChild(new Option(m.id, m.id)));
      }
      const cur = await fetch('/api/settings/ai_model');
      if(cur.ok){
        const { value } = await cur.json();
        if(value) modelSel.value = value;
      }
    }catch(e){
      console.error('Failed to load models', e);
    }
  }

  modelSel.addEventListener('change', () => {
    setSetting('ai_model', modelSel.value);
  });

  function addMessage(author, text){
    const div = document.createElement('div');
    div.className = 'chat-sequence';
    div.textContent = `${author}: ${text}`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function ensureTab(){
    try{
      const r = await fetch(`/api/chat/tabs?sessionId=${encodeURIComponent(sessionId)}`);
      if(r.ok){
        const tabs = await r.json();
        const found = tabs.find(t => t.tab_type === 'pm_agi');
        if(found){
          currentTabId = found.id;
        }
      }
      if(!currentTabId){
        const body = { name:'PM AGI', nexum:0, type:'pm_agi', project:'', repo:'', sessionId };
        const r2 = await fetch('/api/chat/tabs/new', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(body)
        });
        if(r2.ok){
          const d = await r2.json();
          currentTabId = d.id;
        }
      }
    }catch(e){
      console.error('Failed ensuring tab', e);
    }
  }

  async function loadHistory(){
    if(!currentTabId) return;
    try{
      const r = await fetch(`/api/chat/history?tabId=${currentTabId}&limit=20&offset=0&sessionId=${encodeURIComponent(sessionId)}`);
      if(!r.ok) return;
      const data = await r.json();
      (data.pairs||[]).forEach(p => {
        if(p.user_text) addMessage('You', p.user_text);
        if(p.ai_text) addMessage('AlfePM AGI', p.ai_text);
      });
    }catch(e){
      console.error('Failed loading history', e);
    }
  }

  async function sendMessage(text){
    addMessage('You', text);
    inputEl.value = '';
    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-sequence';
    aiDiv.textContent = 'AlfePM AGI: ...';
    messagesEl.appendChild(aiDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    try{
      const r = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ message:text, tabId:currentTabId, sessionId })
      });
      if(!r.ok || !r.body){ aiDiv.textContent = 'AlfePM AGI: [error]'; return; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let result='';
      while(true){
        const {value, done} = await reader.read();
        if(done) break;
        if(value){
          result += dec.decode(value);
          aiDiv.textContent = `AlfePM AGI: ${result}`;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      }
    }catch(e){
      aiDiv.textContent = 'AlfePM AGI: [error]';
      console.error('Chat error', e);
    }
  }

  formEl.addEventListener('submit', e => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if(!text) return;
    sendMessage(text);
  });

  (async ()=>{
    await ensureTab();
    await loadModels();
    await loadHistory();
    if(messagesEl.children.length===0){
      addMessage('AlfePM AGI', 'What are you working on?');
    }
  })();
});
