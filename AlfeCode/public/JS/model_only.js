(function(){
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');
  const info = document.getElementById('info');
  const defaultModelSaveButton = document.getElementById('defaultModelSaveButton');
  const defaultModelFeedback = document.getElementById('defaultModelFeedback');

  const MODEL_HELP_TEXT = 'Choose a model and save to update the default.';

  function coerceNumber(value) {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  function formatPrice(value) {
    const numericValue = coerceNumber(value);
    if (numericValue === null) return '';
    if (Number.isInteger(numericValue)) return numericValue.toString();
    const fixed = numericValue.toFixed(2);
    return fixed.replace(/\.?0+$/, '');
  }

  function formatPricing(pricing) {
    if (!pricing || (pricing.inputPerMTokens == null && pricing.outputPerMTokens == null)) {
      return '';
    }
    const parts = [];
    if (pricing.inputPerMTokens != null) {
      const formatted = formatPrice(pricing.inputPerMTokens);
      if (formatted) parts.push(`$${formatted}/M in`);
    }
    if (pricing.outputPerMTokens != null) {
      const formatted = formatPrice(pricing.outputPerMTokens);
      if (formatted) parts.push(`$${formatted}/M out`);
    }
    return parts.join(', ');
  }

  function normaliseModelEntry(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return null;
      return { id: trimmed, label: trimmed };
    }
    if (typeof entry !== 'object') return null;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) return null;
    const label = typeof entry.label === 'string' && entry.label.trim().length ? entry.label.trim() : id;
    return {
      id,
      label,
      pricing: entry.pricing || null,
    };
  }

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
    let added = 0;
    list.forEach(raw => {
      const model = normaliseModelEntry(raw);
      if (!model) return;
      const o = document.createElement('option');
      o.value = model.id;
      const pricingText = formatPricing(model.pricing);
      o.textContent = pricingText ? `${model.label} — ${pricingText}` : model.label;
      modelSelect.appendChild(o);
      added += 1;
    });
    if (!added) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'No models available';
      modelSelect.appendChild(o);
      modelSelect.disabled = true;
      setSaveEnabled(false);
      return;
    }
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
