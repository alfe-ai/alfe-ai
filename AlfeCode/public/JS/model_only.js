(function(){
  const modelSelect = document.getElementById('modelSelect');
  const engineSelect = document.getElementById('engineSelect');
  const engineFeedback = document.getElementById('engineFeedback');
  const info = document.getElementById('info');
  const defaultModelFeedback = document.getElementById('defaultModelFeedback');
  const searchUsageLimit = document.getElementById('searchUsageLimit');
  const imageUsageLimit = document.getElementById('imageUsageLimit');
  const ENGINE_STORAGE_KEY = 'enginePreference';
  const ENGINE_OPTION_ORDER = ['auto', 'qwen', 'codex'];
  const ENGINE_OPTIONS = new Set(ENGINE_OPTION_ORDER);
  const USAGE_LIMITS = {
    loggedOut: { search: 10, images: 10 },
    loggedIn: { search: 100, images: 100 },
  };

  let activeProvider = '';
  let engineFeedbackTimeout = null;

  function normalizeEngine(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    return ENGINE_OPTIONS.has(normalized) ? normalized : 'auto';
  }

  function sendEnginePreference(value) {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: 'sterling:settings', key: 'engine', value },
          '*',
        );
      } catch (error) {
        console.warn('Failed to notify parent of engine preference.', error);
      }
    }
  }

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
      return {
        id: trimmed,
        label: trimmed,
        disabled: false,
        contextLimitLabel: '',
      };
    }
    if (typeof entry !== 'object') return null;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) return null;
    const label = typeof entry.label === 'string' && entry.label.trim().length ? entry.label.trim() : id;
    const disabled = Boolean(entry.disabled);
    const contextLimitLabel = typeof entry.contextLimitLabel === 'string' ? entry.contextLimitLabel.trim() : '';
    const engineOptions = Array.isArray(entry.engine_options)
      ? entry.engine_options
          .map(option => (typeof option === 'string' ? option.trim() : ''))
          .filter(Boolean)
      : null;
    const plusModel = Boolean(entry.plus_model);
    return {
      id,
      label,
      disabled,
      pricing: entry.pricing || null,
      contextLimitLabel,
      engine_options: engineOptions,
      plus_model: plusModel,
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

  function showEngineFeedback(message, type) {
    if (!engineFeedback) return;
    engineFeedback.textContent = message;
    engineFeedback.classList.remove('hidden', 'error', 'success');
    if (type === 'error') {
      engineFeedback.classList.add('error');
    } else if (type === 'success') {
      engineFeedback.classList.add('success');
    }
  }

  function clearEngineFeedbackTimeout() {
    if (!engineFeedbackTimeout) return;
    clearTimeout(engineFeedbackTimeout);
    engineFeedbackTimeout = null;
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
      const modelLabel = model.plus_model ? `[Pro] ${model.label}` : model.label;
      const contextLimit = model.contextLimitLabel && model.contextLimitLabel !== 'N/A'
        ? model.contextLimitLabel
        : '';
      o.textContent = pricingText ? `${modelLabel} — ${pricingText}` : modelLabel;
      if (contextLimit) {
        o.appendChild(document.createTextNode(' '));
        const limitSpan = document.createElement('span');
        limitSpan.className = 'context-limit';
        limitSpan.textContent = `(${contextLimit})`;
        o.appendChild(limitSpan);
      }
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

  function applyUsageLimits(limits) {
    if (searchUsageLimit) {
      searchUsageLimit.textContent = `0/${limits.search} searches`;
    }
    if (imageUsageLimit) {
      imageUsageLimit.textContent = `0/${limits.images} images`;
    }
  }

  async function loadUsageLimits() {
    applyUsageLimits(USAGE_LIMITS.loggedOut);
    try {
      const response = await fetch('/api/account', { credentials: 'same-origin' });
      if (response.ok) {
        applyUsageLimits(USAGE_LIMITS.loggedIn);
      }
    } catch (error) {
      /* ignore */
    }
  }

  function resolveAllowedEngines(modelId) {
    if (!modelId) return ENGINE_OPTION_ORDER.slice();
    const list = (window.__providerModels && window.__providerModels[activeProvider]) || [];
    const raw = list.find(entry => entry && entry.id === modelId);
    const model = normaliseModelEntry(raw);
    const rawOptions = Array.isArray(model?.engine_options) ? model.engine_options : [];
    const normalized = rawOptions
      .map(option => normalizeEngine(option))
      .filter((option, index, arr) => option && arr.indexOf(option) === index);
    return normalized.length ? normalized : ENGINE_OPTION_ORDER.slice();
  }

  function updateEngineSelect(modelId) {
    if (!engineSelect) return;
    const allowed = new Set(resolveAllowedEngines(modelId));
    Array.from(engineSelect.options).forEach(option => {
      const value = normalizeEngine(option.value);
      const isAllowed = allowed.has(value);
      option.disabled = !isAllowed;
      option.classList.toggle('engine-option-disabled', !isAllowed);
    });
    let nextValue = normalizeEngine(engineSelect.value);
    if (!allowed.has(nextValue)) {
      nextValue = allowed.has('auto') ? 'auto' : Array.from(allowed)[0] || 'auto';
      engineSelect.value = nextValue;
      try {
        localStorage.setItem(ENGINE_STORAGE_KEY, nextValue);
      } catch (error) {
        /* ignore */
      }
      sendEnginePreference(nextValue);
    }
  }

  function persistEnginePreference(nextValue, options = {}) {
    if (!engineSelect) return;
    const normalized = normalizeEngine(nextValue);
    const { showFeedback = true } = options;
    engineSelect.value = normalized;
    if (showFeedback) {
      clearEngineFeedbackTimeout();
      showEngineFeedback('Saving Engine');
    }
    try {
      localStorage.setItem(ENGINE_STORAGE_KEY, normalized);
    } catch (error) {
      /* ignore */
    }
    sendEnginePreference(normalized);
    if (showFeedback) {
      engineFeedbackTimeout = setTimeout(() => {
        showEngineFeedback('Engine Updated', 'success');
        engineFeedbackTimeout = null;
      }, 300);
    }
  }

  function notifyDefaultModelChange(model) {
    if (!model) return;
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: 'sterling:settings', key: 'defaultModel', value: model },
          window.location.origin,
        );
      } catch (error) {
        console.warn('Failed to notify parent of default model change.', error);
      }
    }
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
      notifyDefaultModelChange(newModel);
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
      updateEngineSelect(modelSelect.value);
      if (info) info.textContent = '';
    } catch (e) {
      if (info) info.textContent = 'Error loading models: ' + e.message;
    }
  }

  function initEngineSelect() {
    if (!engineSelect) return;
    let storedValue = '';
    try {
      storedValue = localStorage.getItem(ENGINE_STORAGE_KEY) || '';
    } catch (error) {
      storedValue = '';
    }
    const initialValue = normalizeEngine(storedValue);
    engineSelect.value = initialValue;
    sendEnginePreference(initialValue);
    engineSelect.addEventListener('change', function() {
      persistEnginePreference(engineSelect.value);
    });
  }

  modelSelect.addEventListener('change', function(){
    const newModel = modelSelect && modelSelect.value ? modelSelect.value.trim() : '';
    persistEnginePreference('auto', { showFeedback: false });
    updateEngineSelect(newModel);
    void saveDefaultModel(newModel);
  });

  initEngineSelect();
  loadUsageLimits();
  load();
})();
