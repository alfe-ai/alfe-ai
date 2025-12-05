(function(){
  const MODEL_CHANGE_MESSAGE = 'Ability to change model available soon.';
  const providerSelect=document.getElementById('providerSelect');
  const modelSelect=document.getElementById('modelSelect');
  if (modelSelect) modelSelect.disabled = true;
  const info=document.getElementById('info');
  async function load(){
    try{
      const res=await fetch('/file_summarizer/models');
      if(!res.ok)throw new Error('Failed to load models');
      const data=await res.json();
      let providers = Object.keys(data.providers||{});
      // Restrict providers to only 'openrouter' in the UI
      providers = ['openrouter'];
      // Override available models for the selector to the approved set
      window.__providerModels = window.__providerModels || {};
      window.__providerModels['openrouter'] = ['openai/gpt-5-mini','openai/gpt-5-nano','openai/gpt-5.1-codex-mini'];
      providerSelect.innerHTML='';
      providers.forEach(p=>{
        const opt=document.createElement('option');opt.value=p;opt.textContent=p;providerSelect.appendChild(opt);
      });
      const defaultProvider=data.defaultProvider||providers[0]||'';
      if(defaultProvider)providerSelect.value=defaultProvider;
      populateModels();
      // Render default model; hide deprecated branding label if present
  // Default model display removed
  info.textContent = MODEL_CHANGE_MESSAGE;
    }catch(e){info.textContent='Error loading models: '+e.message}
  }
  function populateModels(){
    const prov=providerSelect.value;const models=(window.__providerModels=(window.__providerModels||{}));
    const x=models[prov];
    if(!x){fetch('/file_summarizer/models').then(r=>r.json()).then(d=>{window.__providerModels=d.providers||{};populateModels();}).catch(e=>{info.textContent='Error: '+e.message}) ;return}
    modelSelect.innerHTML='';
    if(!x.length){const o=document.createElement('option');o.value='';o.textContent='No models available';modelSelect.appendChild(o);return}
    x.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=m;modelSelect.appendChild(o)})
  }
  providerSelect.addEventListener('change',populateModels);

  // Prevent changing model while dropdown is expanded by reverting changes if user tries to pick another model
  (function(){
    let lastValue = modelSelect.value;
    // Remember value when user focuses (opens) the select
    modelSelect.addEventListener('focus', function(){ lastValue = modelSelect.value; });
    // On mousedown on options, prevent changing by marking as prevented
    let isOpen = false;
    modelSelect.addEventListener('mousedown', function(){ isOpen = true; });
    modelSelect.addEventListener('blur', function(){ isOpen = false; });
    // If change happens while open, revert to lastValue
    modelSelect.addEventListener('change', function(e){
      if(isOpen){
        // revert selection
        modelSelect.value = lastValue;
        // provide brief feedback
        if(window.__modelChangeFeedbackTimeout) clearTimeout(window.__modelChangeFeedbackTimeout);
        const prev = lastValue || '(none)';
        console.warn('Model change prevented while dropdown open. Reverting to', prev);
        const infoEl = document.getElementById('info');
        if(infoEl){ infoEl.textContent = MODEL_CHANGE_MESSAGE; }
      } else {
        lastValue = modelSelect.value;
      }
    });
  })();

  load();
})();
