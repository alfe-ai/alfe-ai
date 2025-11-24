(function(){
  const providerSelect=document.getElementById('providerSelect');
  const modelSelect=document.getElementById('modelSelect');
  const info=document.getElementById('info');
  async function load(){
    try{
      const res=await fetch('/file_summarizer/models');
      if(!res.ok)throw new Error('Failed to load models');
      const data=await res.json();
      const providers=Object.keys(data.providers||{});
      providerSelect.innerHTML='';
      providers.forEach(p=>{
        const opt=document.createElement('option');opt.value=p;opt.textContent=p;providerSelect.appendChild(opt);
      });
      const defaultProvider=data.defaultProvider||providers[0]||'';
      if(defaultProvider)providerSelect.value=defaultProvider;
      populateModels();
      // Render default model; hide deprecated branding label if present
  const dm = data.defaultModel;
  const displayModel = (dm && dm !== 'deepseek/deepseek-chat') ? dm : '(none)';
  info.textContent = 'Default model: ' + displayModel;
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
  load();
})();
