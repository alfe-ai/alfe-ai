(function(){
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');
  const info = document.getElementById('info');
  const defaultModelSaveButton = document.getElementById('defaultModelSaveButton');
  const defaultModelFeedback = document.getElementById('defaultModelFeedback');

  const MODEL_HELP_TEXT = 'Choose a model and save to update the default.';

  function showDefaultModelFeedback(message, type){
    if (!defaultModelFeedback) return;
    defaultModelFeedback.textContent = message;
    defaultModelFeedback.classList.remove('hidden', 'error', 'success');
    if (type === 'error') {
      defaultModelFeedback.classList.add('error');
    } else if (type === 'success') {
      defaultModelFeedback.classList.add('success');
    }
  }

  function setSaveEnabled(enabled){
    if (defaultModelSaveButton) {
      defaultModelSaveButton.disabled = !enabled;
    }
  }

  function populateModels(){
    const prov = providerSelect.value;
    const models = (window.__providerModels = (window.__providerModels || {}));
    const list = models[prov];
    if (!list) {
      fetch('/agent/model-only/models')
        .then(r => r.json())
        .then(d => {
          window.__providerModels = d.providers || {};
          populateModels();
        })
        .catch(e => { if (info) info.textContent = 'Error: ' + e.message; });
      return;
    }
    modelSelect.innerHTML = '';
    if (!list.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'No models available';
      modelSelect.appendChild(o);
      modelSelect.disabled = true;
      setSaveEnabled(false);
      return;
    }
    list.forEach(m => {
      const normalized = (function normalizeModel(model){
        if (!model) return null;
        if (typeof model === 'string') {
          const trimmed = model.trim();
          return trimmed ? { id: trimmed, label: trimmed } : null;
        }
        if (typeof model !== 'object') return null;
        const id = typeof model.id === 'string'
          ? model.id.trim()
          : typeof model.model === 'string'
            ? model.model.trim()
            : typeof model.value === 'string'
              ? model.value.trim()
              : '';
        if (!id) return null;
        return {
          id,
          label: (typeof model.label === 'string' && model.label.trim())
            ? model.label.trim()
            : (typeof model.name === 'string' && model.name.trim())
              ? model.name.trim()
              : id,
          context: (typeof model.context === 'string' && model.context.trim()) ? model.context.trim() : '',
          inputCost: (typeof model.inputCost === 'string' && model.inputCost.trim()) ? model.inputCost.trim() : '',
          outputCost: (typeof model.outputCost === 'string' && model.outputCost.trim()) ? model.outputCost.trim() : '',
        };
      })(m);
      if (!normalized) return;
      const o = document.createElement('option');
      o.value = normalized.id;
      const metaParts = [];
      if (normalized.context) metaParts.push(`${normalized.context} context`);
      if (normalized.inputCost) metaParts.push(normalized.inputCost);
      if (normalized.outputCost) metaParts.push(normalized.outputCost);
      const metaText = metaParts.length ? ` — ${metaParts.join(' · ')}` : '';
      const labelText = normalized.label === normalized.id
        ? normalized.label
        : `${normalized.label} (${normalized.id})`;
      o.textContent = `${labelText}${metaText}`;
      modelSelect.appendChild(o);
    });
    modelSelect.disabled = false;
    setSaveEnabled(Boolean(modelSelect.value));
  }

  async function load(){
    try{
      const res = await fetch('/agent/model-only/models');
      if (!res.ok) throw new Error('Failed to load models');
      const data = await res.json();
      const providers = Object.keys(data.providers || {});
      window.__providerModels = data.providers || {};
      providerSelect.innerHTML = '';
      providers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        providerSelect.appendChild(opt);
      });
      const defaultProvider = data.defaultProvider || providers[0] || '';
      if (defaultProvider) providerSelect.value = defaultProvider;
      populateModels();
      if (data.defaultModel && modelSelect) {
        modelSelect.value = data.defaultModel;
      }
      if (info) info.textContent = MODEL_HELP_TEXT;
      setSaveEnabled(Boolean(modelSelect && modelSelect.value));
    } catch (e) {
      if (info) info.textContent = 'Error loading models: ' + e.message;
    }
  }

  providerSelect.addEventListener('change', populateModels);
  modelSelect.addEventListener('change', function(){
    setSaveEnabled(Boolean(modelSelect.value));
  });

  if (defaultModelSaveButton) {
    defaultModelSaveButton.addEventListener('click', async () => {
      const newModel = modelSelect && modelSelect.value ? modelSelect.value.trim() : '';
      if (!newModel) {
        showDefaultModelFeedback('Default model cannot be empty.', 'error');
        return;
      }

      showDefaultModelFeedback('Saving default model…');
      defaultModelSaveButton.disabled = true;

      try {
        const response = await fetch('/agent/default-model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultModel: newModel }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errorMessage = payload?.error || `Failed to save default model (status ${response.status}).`;
          throw new Error(errorMessage);
        }

        showDefaultModelFeedback(payload?.message || 'Default model saved.', 'success');
      } catch (error) {
        console.error('Failed to save default Agent model:', error);
        showDefaultModelFeedback(error.message || 'Failed to save default model.', 'error');
      } finally {
        setSaveEnabled(Boolean(modelSelect && modelSelect.value));
      }
    });
  }

  load();
})();
