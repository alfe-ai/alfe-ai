(function(){
  const modelSelect = document.getElementById('modelSelect');
  const info = document.getElementById('info');
  const defaultModelFeedback = document.getElementById('defaultModelFeedback');

  let activeProvider = '';

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
      return { id: trimmed, label: trimmed, disabled: false };
    }
    if (typeof entry !== 'object') return null;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) return null;
    const label = typeof entry.label === 'string' && entry.label.trim().length ? entry.label.trim() : id;
    const disabled = Boolean(entry.disabled);
    return {
      id,
      label,
      disabled,
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

  function populateModels(){
    const models = (window.__providerModels = (window.__providerModels || {}));
    const list = models[activeProvider];
    if (!list) {
      fetch('/agent/model-only/models')
        .then(r => r.json())
        .then(d => {
          window.__providerModels = d.providers || {};
          const providers = Object.keys(window.__providerModels);
          if (!activeProvider) {
            activeProvider = d.defaultProvider || providers[0] || '';
          }
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
      return;
    }
    let added = 0;
    list.forEach(raw => {
      const model = normaliseModelEntry(raw);
      if (!model) return;
      if (model.disabled) return;
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
      return;
    }
    modelSelect.disabled = false;
  }

  async function saveDefaultModel(newModel) {
    if (!newModel) {
      showDefaultModelFeedback('Default model cannot be empty.', 'error');
      return;
    }

    showDefaultModelFeedback('Saving default model…');
    modelSelect.disabled = true;

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
      modelSelect.disabled = false;
    }
  }

  async function load(){
    try{
      const res = await fetch('/agent/model-only/models');
      if (!res.ok) throw new Error('Failed to load models');
      const data = await res.json();
      const providers = Object.keys(data.providers || {});
      window.__providerModels = data.providers || {};
      activeProvider = data.defaultProvider || providers[0] || '';
      if (!activeProvider) {
        if (info) info.textContent = 'No providers configured.';
        modelSelect.disabled = true;
        return;
      }
      populateModels();
      if (data.defaultModel && modelSelect) {
        modelSelect.value = data.defaultModel;
      }
      if (info) info.textContent = '';
    } catch (e) {
      if (info) info.textContent = 'Error loading models: ' + e.message;
    }
  }

  modelSelect.addEventListener('change', function(){
    const newModel = modelSelect && modelSelect.value ? modelSelect.value.trim() : '';
    void saveDefaultModel(newModel);
  });

  load();
})();
