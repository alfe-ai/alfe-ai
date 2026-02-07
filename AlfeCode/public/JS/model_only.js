(function(){
  const modelSelect = document.getElementById('modelSelect');
  const modelSelectButton = document.getElementById('modelSelectButton');
  const modelSelectMenu = document.getElementById('modelSelectMenu');
  const engineSelect = document.getElementById('engineSelect');
  const engineFeedback = document.getElementById('engineFeedback');
  const info = document.getElementById('info');
  const defaultModelFeedback = document.getElementById('defaultModelFeedback');
  const codeUsageLimit = document.getElementById('codeUsageLimit');
  const codeUsageLimited = document.getElementById('codeUsageLimited');
  const codeUsageUnlimited = document.getElementById('codeUsageUnlimited');
  const codeUsageUnlimitedText = document.getElementById('codeUsageUnlimitedText');
  const codeUsageUnlimitedNote = document.getElementById('codeUsageUnlimitedNote');
  const codeUsageDivider = document.getElementById('codeUsageDivider');
  const freeCodeUsageUpsell = document.getElementById('freeCodeUsageUpsell');
  const loggedOutCodeUsageUpsell = document.getElementById('loggedOutCodeUsageUpsell');
  const proCodeUsageSection = document.getElementById('proCodeUsageSection');
  const proCodeUsageLimit = document.getElementById('proCodeUsageLimit');
  const codeUsageBarFill = document.getElementById('codeUsageBarFill');
  const printifyUsageUnlimited = document.getElementById('printifyUsageUnlimited');
  const searchUsageLimit = document.getElementById('searchUsageLimit');
  const imageUsageLimit = document.getElementById('imageUsageLimit');
  const searchUsageBar = document.getElementById('searchUsageBar');
  const imageUsageBar = document.getElementById('imageUsageBar');
  const searchLockedNotice = document.getElementById('searchLockedNotice');
  const imageLockedNotice = document.getElementById('imageLockedNotice');
  const accountPanel = document.getElementById('accountPanel');
  const accountEmail = document.getElementById('accountEmail');
  const accountPlanSelect = document.getElementById('accountPlanSelect');
  const accountPlanPlusOption = document.getElementById('accountPlanPlusOption');
  const accountPlanFeedback = document.getElementById('accountPlanFeedback');
  const accountEverSubscribedSelect = document.getElementById('accountEverSubscribedSelect');
  const accountEverSubscribedFeedback = document.getElementById('accountEverSubscribedFeedback');
  const accountSession = document.getElementById('accountSession');
  const refreshSessionButton = document.getElementById('refreshSessionButton');
  const refreshSessionFeedback = document.getElementById('refreshSessionFeedback');
  const logoutButton = document.getElementById('logoutButton');
  const logoutFeedback = document.getElementById('logoutFeedback');
  const supportPlanNotice = document.getElementById('supportPlanNotice');
  const supportActionButton = document.getElementById('supportActionButton');
  const config = window.MODEL_ONLY_CONFIG || {};
  const accountsEnabled = config.accountsEnabled !== false;
  const ACCOUNT_PLANS = ['Logged-out Session', 'Free', 'Lite', 'Plus', 'Pro'];
  const ENGINE_STORAGE_KEY = 'enginePreference';
  const ENGINE_OPTION_ORDER = ['auto', 'qwen', 'codex'];
  const ENGINE_OPTIONS = new Set(ENGINE_OPTION_ORDER);
  const CODE_USAGE_STORAGE_KEY = 'alfe.codeRunUsageCount';
  const USAGE_LIMITS = {
    loggedOut: { code: 10, search: 0, images: 0 },
    free: { code: 20, search: 10, images: 10 },
    lite: { code: null, search: 100, images: 100 },
    plus: { code: null, search: 500, images: 500 },
    pro: { code: null, search: 500, images: 500 },
  };

  let activeProvider = '';
  let currentAccountPlan = 'Free';
  let currentAccountEverSubscribed = false;
  let engineFeedbackTimeout = null;
  let supportActionState = 'login';
  let currentUsagePlan = 'Logged-out Session';
  let currentUsageLimits = USAGE_LIMITS.loggedOut;

  if (!accountsEnabled) {
    if (supportActionButton) {
      supportActionButton.style.display = 'none';
    }
    if (supportPlanNotice) {
      supportPlanNotice.textContent = 'Accounts are disabled on this server.';
    }
    document.querySelectorAll('button.subscribe-button--inline').forEach((button) => {
      if ((button.textContent || '').trim().toLowerCase() === 'sign up / log in') {
        button.style.display = 'none';
      }
    });
  }

  function normalizeEngine(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    return ENGINE_OPTIONS.has(normalized) ? normalized : 'auto';
  }

  function isProPlan(plan) {
    return plan === 'Pro';
  }

  function isLoggedOutPlan(plan) {
    const normalized = (plan || '').toString().trim();
    return !['Free', 'Lite', 'Plus', 'Pro'].includes(normalized);
  }

  function updateSupportCallToAction(plan, everSubscribed = currentAccountEverSubscribed) {
    if (!supportPlanNotice && !supportActionButton) return;
    const normalized = (plan || '').toString().trim();
    const isLoggedOut = isLoggedOutPlan(normalized);
    const isPaidPlan = normalized === 'Lite' || normalized === 'Plus' || normalized === 'Pro';
    const isSupportEligible = isPaidPlan || (normalized === 'Free' && Boolean(everSubscribed));
    if (supportPlanNotice) {
      supportPlanNotice.classList.toggle('hidden', isSupportEligible);
      if (isSupportEligible) {
        supportPlanNotice.textContent = 'You must be a paid subscriber to send a support ticket.';
      } else if (isLoggedOut) {
        supportPlanNotice.textContent = 'You must be logged in to send a support ticket.';
      } else {
        supportPlanNotice.textContent = 'You must be a paid subscriber to send a support ticket.';
      }
    }
    if (supportActionButton) {
      if (isSupportEligible) {
        supportActionButton.textContent = 'Go to Support';
        supportActionState = 'support';
      } else if (isLoggedOut) {
        supportActionButton.textContent = 'Sign Up / Log In';
        supportActionState = 'login';
      } else {
        supportActionButton.textContent = 'Subscribe Now';
        supportActionState = 'subscribe';
      }
      supportActionButton.dataset.action = supportActionState;
    }
  }

  function handleSupportActionClick() {
    if (!supportActionButton) return;
    const action = supportActionButton.dataset.action || supportActionState;
    if (action !== 'support') return;
    const supportUrl = supportActionButton.dataset.supportUrl || '/support';
    window.location.assign(supportUrl);
  }

  function requestAuthModal(preferredStep = 'signup') {
    const normalizedStep = preferredStep === 'login' ? 'login' : 'signup';
    let opened = false;
    try {
      if (window.parent && window.parent !== window && typeof window.parent.alfeOpenAuthModal === 'function') {
        window.parent.alfeOpenAuthModal(normalizedStep);
        opened = true;
      }
    } catch (error) {
      opened = false;
    }
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: 'sterling:settings', key: 'openAuthModal', value: normalizedStep },
          '*',
        );
        opened = true;
      } catch (error) {
        console.warn('Failed to notify parent to open auth modal.', error);
      }
    }
    if (!opened) {
      try {
        if (typeof window.alfeOpenAuthModal === 'function') {
          window.alfeOpenAuthModal(normalizedStep);
          opened = true;
        }
      } catch (error) {
        opened = false;
      }
    }
    return opened;
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

  function getStoredCodeUsageCount() {
    try {
      const raw = localStorage.getItem(CODE_USAGE_STORAGE_KEY);
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
      return 0;
    }
  }

  function setStoredCodeUsageCount(value) {
    const normalized = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    try {
      localStorage.setItem(CODE_USAGE_STORAGE_KEY, String(normalized));
    } catch (error) {
      /* ignore */
    }
    return normalized;
  }

  function updateCodeUsageDisplay(limits, plan) {
    if (!codeUsageLimit || !limits) return;
    const codeLimit = typeof limits.code === 'number' ? limits.code : 0;
    const used = getStoredCodeUsageCount();
    codeUsageLimit.textContent = `${used}/${codeLimit} code runs`;
    if (codeUsageBarFill) {
      const percent = codeLimit > 0 ? Math.min(used / codeLimit, 1) * 100 : 0;
      codeUsageBarFill.style.width = `${percent}%`;
    }
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
    const usage = typeof entry.usage === 'string' ? entry.usage.trim().toLowerCase() : '';
    return {
      id,
      label,
      disabled,
      pricing: entry.pricing || null,
      contextLimitLabel,
      engine_options: engineOptions,
      plus_model: plusModel,
      usage,
    };
  }

  function resolveUsageBadge(usage) {
    const normalized = (usage || '').toString().trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.includes('very')) {
      return { label: normalized, className: 'usage-very-high' };
    }
    if (normalized.includes('high')) {
      return { label: normalized, className: 'usage-high' };
    }
    if (normalized.includes('medium')) {
      return { label: normalized, className: 'usage-medium' };
    }
    if (normalized.includes('low')) {
      return { label: normalized, className: 'usage-low' };
    }
    return { label: normalized, className: 'usage-low' };
  }

  function createUsageBadge(usage) {
    const badge = resolveUsageBadge(usage);
    if (!badge) return null;
    const label = badge.label
      .split(' ')
      .filter(Boolean)
      .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(' ');
    const badgeEl = document.createElement('span');
    badgeEl.className = `usage-badge ${badge.className}`;
    badgeEl.textContent = `${label} usage`;
    return badgeEl;
  }

  function updateModelSelectButton(model) {
    if (!modelSelectButton) return;
    const textWrapper = modelSelectButton.querySelector('.model-select-button__text');
    if (!textWrapper) return;
    textWrapper.textContent = '';
    const labelText = model
      ? (model.plus_model ? `[Pro] ${model.label}` : model.label)
      : 'Select model';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = labelText;
    textWrapper.appendChild(labelSpan);
    const badgeEl = model?.usage ? createUsageBadge(model.usage) : null;
    if (badgeEl) {
      textWrapper.appendChild(badgeEl);
    }
  }

  function syncModelDropdownSelection() {
    if (!modelSelectMenu) return;
    const currentValue = modelSelect?.value || '';
    Array.from(modelSelectMenu.querySelectorAll('.model-select-option')).forEach((button) => {
      const isSelected = button.dataset.modelId === currentValue;
      button.classList.toggle('is-selected', isSelected);
    });
  }

  function closeModelDropdown() {
    if (!modelSelectButton || !modelSelectMenu) return;
    modelSelectMenu.classList.add('hidden');
    modelSelectButton.setAttribute('aria-expanded', 'false');
  }

  function toggleModelDropdown() {
    if (!modelSelectButton || !modelSelectMenu) return;
    const isOpen = !modelSelectMenu.classList.contains('hidden');
    if (isOpen) {
      closeModelDropdown();
    } else {
      modelSelectMenu.classList.remove('hidden');
      modelSelectButton.setAttribute('aria-expanded', 'true');
    }
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
    if (modelSelectMenu) {
      modelSelectMenu.innerHTML = '';
    }
    if (!list.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'No models available';
      modelSelect.appendChild(o);
      modelSelect.disabled = true;
      if (modelSelectButton) {
        updateModelSelectButton(null);
      }
      return;
    }
    let added = 0;
    list.forEach(raw => {
      const model = normaliseModelEntry(raw);
      if (!model) return;
      if (model.disabled) return;
      const o = document.createElement('option');
      o.value = model.id;
      o.dataset.plusModel = model.plus_model ? 'true' : 'false';
      if (model.usage) {
        o.dataset.usage = model.usage;
      }
      const pricingText = formatPricing(model.pricing);
      const modelLabel = model.plus_model ? `[Pro] ${model.label}` : model.label;
      const labelParts = [modelLabel];
      if (pricingText) {
        labelParts.push(`— ${pricingText}`);
      }
      o.textContent = labelParts.join(' ');
      if (model.plus_model && !isProPlan(currentAccountPlan)) {
        o.disabled = true;
        o.classList.add('pro-model-disabled');
      }
      modelSelect.appendChild(o);
      if (modelSelectMenu) {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = 'model-select-option';
        optionButton.dataset.modelId = model.id;
        optionButton.dataset.plusModel = model.plus_model ? 'true' : 'false';
        if (model.usage) {
          optionButton.dataset.usage = model.usage;
        }
        optionButton.disabled = model.plus_model && !isProPlan(currentAccountPlan);
        const labelRow = document.createElement('div');
        labelRow.className = 'model-select-option__label';
        const labelText = document.createElement('span');
        labelText.textContent = modelLabel;
        labelRow.appendChild(labelText);
        const badgeEl = model.usage ? createUsageBadge(model.usage) : null;
        if (badgeEl) {
          labelRow.appendChild(badgeEl);
        }
        optionButton.appendChild(labelRow);
        if (pricingText) {
          const metaRow = document.createElement('div');
          metaRow.className = 'model-select-option__meta';
          metaRow.textContent = pricingText;
          optionButton.appendChild(metaRow);
        }
        optionButton.addEventListener('click', () => {
          if (optionButton.disabled) return;
          modelSelect.value = model.id;
          modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
          closeModelDropdown();
        });
        modelSelectMenu.appendChild(optionButton);
      }
      added += 1;
    });
    if (!added) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'No models available';
      modelSelect.appendChild(o);
      modelSelect.disabled = true;
      updateModelSelectButton(null);
      return;
    }
    modelSelect.disabled = false;
    if (modelSelectButton) {
      const selected = normaliseModelEntry(list.find((entry) => {
        if (!entry) return false;
        if (typeof entry === 'string') return entry.trim() === modelSelect.value;
        if (typeof entry === 'object') return entry.id === modelSelect.value;
        return false;
      }));
      updateModelSelectButton(selected);
      syncModelDropdownSelection();
    }
  }

  function ensureModelOption(modelId) {
    if (!modelSelect || !modelId) return;
    const existing = Array.from(modelSelect.options).find(option => option.value === modelId);
    if (existing) return existing;
    const list = (window.__providerModels && window.__providerModels[activeProvider]) || [];
    const raw = list.find(entry => {
      if (!entry) return false;
      if (typeof entry === 'string') return entry.trim() === modelId;
      if (typeof entry === 'object') {
        if (typeof entry.id === 'string' && entry.id.trim() === modelId) return true;
        if (typeof entry.model === 'string' && entry.model.trim() === modelId) return true;
      }
      return false;
    });
    const model = normaliseModelEntry(raw);
    const option = document.createElement('option');
    option.value = modelId;
    const label = model ? (model.plus_model ? `[Pro] ${model.label}` : model.label) : modelId;
    const usageText = model?.usage
      ? `${model.usage.charAt(0).toUpperCase()}${model.usage.slice(1)} usage`
      : '';
    const labelParts = [label];
    if (usageText) {
      labelParts.push(`• ${usageText}`);
    }
    option.textContent = labelParts.join(' ');
    if (model?.usage) {
      option.dataset.usage = model.usage;
    }
    if (model && model.plus_model && !isProPlan(currentAccountPlan)) {
      option.disabled = true;
      option.dataset.plusModel = 'true';
      option.classList.add('pro-model-disabled');
    }
    modelSelect.insertBefore(option, modelSelect.firstChild);
    if (modelSelectMenu) {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'model-select-option';
      optionButton.dataset.modelId = modelId;
      if (model?.plus_model) {
        optionButton.dataset.plusModel = 'true';
        optionButton.disabled = !isProPlan(currentAccountPlan);
      }
      if (model?.usage) {
        optionButton.dataset.usage = model.usage;
      }
      const labelRow = document.createElement('div');
      labelRow.className = 'model-select-option__label';
      const labelText = document.createElement('span');
      labelText.textContent = label;
      labelRow.appendChild(labelText);
      const badgeEl = model?.usage ? createUsageBadge(model.usage) : null;
      if (badgeEl) {
        labelRow.appendChild(badgeEl);
      }
      optionButton.appendChild(labelRow);
      optionButton.addEventListener('click', () => {
        if (optionButton.disabled) return;
        modelSelect.value = modelId;
        modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
        closeModelDropdown();
      });
      modelSelectMenu.insertBefore(optionButton, modelSelectMenu.firstChild);
    }
    return option;
  }

  function applyUsageLimits(limits, plan) {
    currentUsageLimits = limits || USAGE_LIMITS.loggedOut;
    currentUsagePlan = plan || 'Logged-out Session';
    const normalizedPlan = (plan || '').toString().trim();
    const normalizedPlanKey = normalizedPlan.toLowerCase();
    const isLoggedOut = !['free', 'lite', 'plus', 'pro'].includes(normalizedPlanKey);
    const isPaidPlan = normalizedPlanKey === 'lite' || normalizedPlanKey === 'plus' || normalizedPlanKey === 'pro';
    const isProPlanActive = normalizedPlanKey === 'pro';
    if (searchUsageBar) {
      searchUsageBar.classList.toggle('hidden', isLoggedOut);
    }
    if (imageUsageBar) {
      imageUsageBar.classList.toggle('hidden', isLoggedOut);
    }
    if (searchLockedNotice) {
      searchLockedNotice.classList.toggle('hidden', !isLoggedOut);
    }
    if (imageLockedNotice) {
      imageLockedNotice.classList.toggle('hidden', !isLoggedOut);
    }
    if (codeUsageLimited) {
      codeUsageLimited.classList.toggle('hidden', isPaidPlan);
    }
    if (freeCodeUsageUpsell) {
      freeCodeUsageUpsell.classList.toggle('hidden', normalizedPlanKey !== 'free');
    }
    if (loggedOutCodeUsageUpsell) {
      loggedOutCodeUsageUpsell.classList.toggle('hidden', !isLoggedOut);
    }
    if (codeUsageUnlimited) {
      codeUsageUnlimited.classList.toggle('hidden', !isPaidPlan);
    }
    if (codeUsageDivider) {
      codeUsageDivider.classList.toggle('hidden', !isPaidPlan);
    }
    if (codeUsageUnlimitedText) {
      codeUsageUnlimitedText.textContent = isProPlanActive
        ? 'Code usage of basic models is Unlimited*'
        : 'Code usage is Unlimited*';
    }
    if (codeUsageUnlimitedNote) {
      codeUsageUnlimitedNote.classList.toggle('hidden', !isPaidPlan);
    }
    if (proCodeUsageSection) {
      proCodeUsageSection.classList.toggle('hidden', !isProPlanActive);
    }
    if (proCodeUsageLimit) {
      proCodeUsageLimit.textContent = 'n/10000 cycles';
    }
    if (printifyUsageUnlimited) {
      printifyUsageUnlimited.classList.remove('hidden');
    }
    updateCodeUsageDisplay(currentUsageLimits, currentUsagePlan);
    if (searchUsageLimit) {
      searchUsageLimit.textContent = isLoggedOut ? '' : `0/${limits.search} searches`;
    }
    if (imageUsageLimit) {
      imageUsageLimit.textContent = isLoggedOut ? '' : `0/${limits.images} images`;
    }
  }

  function resolveUsageLimits(plan) {
    const normalized = (plan || '').toString().trim();
    if (normalized === 'Pro') return USAGE_LIMITS.pro;
    if (normalized === 'Plus') return USAGE_LIMITS.plus;
    if (normalized === 'Lite') return USAGE_LIMITS.lite;
    if (normalized === 'Free') return USAGE_LIMITS.free;
    return USAGE_LIMITS.loggedOut;
  }

  function setAccountVisibility(visible) {
    if (!accountPanel) return;
    accountPanel.classList.toggle('hidden', !visible);
  }

  function setAccountField(el, value) {
    if (!el) return;
    el.textContent = value && value.toString().trim().length ? value : '—';
  }

  function handleUsageEvent(event) {
    const data = event && event.data ? event.data : null;
    if (!data || data.type !== 'sterling:usage' || data.key !== 'codeRun') return;
    const next = coerceNumber(data.value);
    if (next === null) return;
    setStoredCodeUsageCount(next);
    updateCodeUsageDisplay(currentUsageLimits, currentUsagePlan);
  }

  function handleStorageEvent(event) {
    if (!event || event.key !== CODE_USAGE_STORAGE_KEY) return;
    updateCodeUsageDisplay(currentUsageLimits, currentUsagePlan);
  }

  function showLogoutFeedback(message, type) {
    if (!logoutFeedback) return;
    if (!message) {
      logoutFeedback.textContent = '';
      logoutFeedback.classList.add('hidden');
      logoutFeedback.classList.remove('error', 'success');
      return;
    }
    logoutFeedback.textContent = message;
    logoutFeedback.classList.remove('hidden', 'error', 'success');
    if (type === 'error') {
      logoutFeedback.classList.add('error');
    } else if (type === 'success') {
      logoutFeedback.classList.add('success');
    }
  }

  function showSessionRefreshFeedback(message, type) {
    if (!refreshSessionFeedback) return;
    if (!message) {
      refreshSessionFeedback.textContent = '';
      refreshSessionFeedback.classList.add('hidden');
      refreshSessionFeedback.classList.remove('error', 'success');
      return;
    }
    refreshSessionFeedback.textContent = message;
    refreshSessionFeedback.classList.remove('hidden', 'error', 'success');
    if (type === 'error') {
      refreshSessionFeedback.classList.add('error');
    } else if (type === 'success') {
      refreshSessionFeedback.classList.add('success');
    }
  }

  window.addEventListener('message', handleUsageEvent);
  window.addEventListener('storage', handleStorageEvent);

  function showAccountPlanFeedback(message, type) {
    if (!accountPlanFeedback) return;
    accountPlanFeedback.textContent = message;
    accountPlanFeedback.classList.remove('hidden', 'error', 'success');
    if (type === 'error') {
      accountPlanFeedback.classList.add('error');
    } else if (type === 'success') {
      accountPlanFeedback.classList.add('success');
    }
  }

  function showAccountEverSubscribedFeedback(message, type) {
    if (!accountEverSubscribedFeedback) return;
    accountEverSubscribedFeedback.textContent = message;
    accountEverSubscribedFeedback.classList.remove('hidden', 'error', 'success');
    if (type === 'error') {
      accountEverSubscribedFeedback.classList.add('error');
    } else if (type === 'success') {
      accountEverSubscribedFeedback.classList.add('success');
    }
  }

  function setAccountPlanValue(value) {
    if (!accountPlanSelect) return;
    const planValue = ACCOUNT_PLANS.includes(value) ? value : 'Free';
    if (accountPlanPlusOption) {
      const showPlus = planValue === 'Plus';
      accountPlanPlusOption.hidden = !showPlus;
      accountPlanPlusOption.disabled = true;
    }
    accountPlanSelect.value = planValue;
    currentAccountPlan = planValue;
    updateProModelOptions();
    updateSupportCallToAction(planValue, currentAccountEverSubscribed);
  }

  function setAccountEverSubscribedValue(value) {
    if (!accountEverSubscribedSelect) return;
    const normalized = value === true || value === 'true' || value === 1 || value === '1';
    accountEverSubscribedSelect.value = normalized ? 'true' : 'false';
    currentAccountEverSubscribed = normalized;
    updateSupportCallToAction(currentAccountPlan, currentAccountEverSubscribed);
  }

  function updateProModelOptions() {
    if (!modelSelect) return;
    const allowPro = isProPlan(currentAccountPlan);
    Array.from(modelSelect.options).forEach(option => {
      const isPlusModel = option.dataset.plusModel === 'true';
      if (!isPlusModel) return;
      option.disabled = !allowPro;
      option.classList.toggle('pro-model-disabled', !allowPro);
    });
    if (modelSelectMenu) {
      Array.from(modelSelectMenu.querySelectorAll('.model-select-option')).forEach(option => {
        const isPlusModel = option.dataset.plusModel === 'true';
        if (!isPlusModel) return;
        option.disabled = !allowPro;
      });
    }
    if (!allowPro && modelSelect.value) {
      const selectedOption = modelSelect.options[modelSelect.selectedIndex];
      if (selectedOption && selectedOption.disabled) {
        const fallback = Array.from(modelSelect.options).find(option => !option.disabled);
        if (fallback) {
          modelSelect.value = fallback.value;
          updateEngineSelect(fallback.value);
          void saveDefaultModel(fallback.value);
        }
      }
    }
    if (modelSelectMenu) {
      syncModelDropdownSelection();
    }
  }

  async function saveAccountPlan(newPlan) {
    if (!accountPlanSelect) return;
    if (!ACCOUNT_PLANS.includes(newPlan)) {
      showAccountPlanFeedback('Invalid plan.', 'error');
      setAccountPlanValue('Free');
      return;
    }

    showAccountPlanFeedback('Saving plan…');
    accountPlanSelect.disabled = true;

    try {
      const response = await fetch('/api/account/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ plan: newPlan }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = payload?.error || `Failed to save plan (status ${response.status}).`;
        throw new Error(errorMessage);
      }
      setAccountPlanValue(payload?.plan || newPlan);
      applyUsageLimits(resolveUsageLimits(payload?.plan || newPlan), payload?.plan || newPlan);
      showAccountPlanFeedback('Plan updated.', 'success');
    } catch (error) {
      console.error('Failed to save account plan:', error);
      showAccountPlanFeedback(error.message || 'Failed to save plan.', 'error');
    } finally {
      accountPlanSelect.disabled = false;
    }
  }

  async function saveAccountEverSubscribed(everSubscribed) {
    if (!accountEverSubscribedSelect) return;
    showAccountEverSubscribedFeedback('Saving…');
    accountEverSubscribedSelect.disabled = true;
    try {
      const response = await fetch('/api/account/ever-subscribed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ everSubscribed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = payload?.error || `Failed to save ever subscribed (status ${response.status}).`;
        throw new Error(errorMessage);
      }
      setAccountEverSubscribedValue(payload?.everSubscribed ?? everSubscribed);
      showAccountEverSubscribedFeedback('Saved.', 'success');
    } catch (error) {
      console.error('Failed to save ever subscribed:', error);
      showAccountEverSubscribedFeedback(error.message || 'Failed to save.', 'error');
    } finally {
      accountEverSubscribedSelect.disabled = false;
    }
  }

  async function loadUsageLimits() {
    applyUsageLimits(USAGE_LIMITS.loggedOut, 'Logged-out Session');
    setAccountVisibility(true);
    if (accountPlanSelect) {
      accountPlanSelect.disabled = true;
      setAccountPlanValue('Free');
    }
    if (accountEverSubscribedSelect) {
      accountEverSubscribedSelect.disabled = true;
      setAccountEverSubscribedValue(false);
    }
    if (logoutButton) {
      logoutButton.disabled = true;
    }
    showLogoutFeedback('');
    try {
      const response = await fetch('/api/account', { credentials: 'same-origin' });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        applyUsageLimits(resolveUsageLimits(payload.plan), payload.plan);
        setAccountField(accountEmail, payload.email);
        setAccountPlanValue(payload.plan);
        setAccountEverSubscribedValue(payload.everSubscribed);
        setAccountField(accountSession, payload.sessionId);
        setAccountVisibility(Boolean(payload.email || payload.sessionId));
        const hasAccount = Boolean(payload.email);
        if (accountPlanSelect) {
          accountPlanSelect.disabled = !hasAccount;
        }
        if (accountEverSubscribedSelect) {
          accountEverSubscribedSelect.disabled = !hasAccount;
        }
        if (logoutButton) {
          logoutButton.disabled = !hasAccount;
        }
        if (refreshSessionButton) {
          refreshSessionButton.disabled = !payload.sessionId;
        }
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
      if (modelSelect) {
        const list = (window.__providerModels && window.__providerModels[activeProvider]) || [];
        const preferredDefault = data.defaultModel;
        if (preferredDefault) {
          ensureModelOption(preferredDefault);
          modelSelect.value = preferredDefault;
        }
        const selected = normaliseModelEntry(list.find((entry) => {
          if (!entry) return false;
          if (typeof entry === 'string') return entry.trim() === modelSelect.value;
          if (typeof entry === 'object') return entry.id === modelSelect.value;
          return false;
        }));
        updateModelSelectButton(selected);
        syncModelDropdownSelection();
      }
      updateProModelOptions();
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
    const list = (window.__providerModels && window.__providerModels[activeProvider]) || [];
    const selected = normaliseModelEntry(list.find((entry) => {
      if (!entry) return false;
      if (typeof entry === 'string') return entry.trim() === newModel;
      if (typeof entry === 'object') return entry.id === newModel;
      return false;
    }));
    updateModelSelectButton(selected);
    syncModelDropdownSelection();
    void saveDefaultModel(newModel);
  });

  initEngineSelect();
  loadUsageLimits();
  load();

  if (modelSelectButton && modelSelectMenu) {
    modelSelectButton.addEventListener('click', toggleModelDropdown);
    document.addEventListener('click', (event) => {
      if (!modelSelectMenu.contains(event.target) && !modelSelectButton.contains(event.target)) {
        closeModelDropdown();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeModelDropdown();
      }
    });
  }

  if (supportActionButton) {
    supportActionButton.addEventListener('click', handleSupportActionClick);
  }

  if (accountPlanSelect) {
    accountPlanSelect.addEventListener('change', function() {
      const selectedPlan = accountPlanSelect.value;
      currentAccountPlan = selectedPlan;
      updateProModelOptions();
      void saveAccountPlan(selectedPlan);
    });
  }

  if (accountEverSubscribedSelect) {
    accountEverSubscribedSelect.addEventListener('change', function() {
      const selectedValue = accountEverSubscribedSelect.value === 'true';
      void saveAccountEverSubscribed(selectedValue);
    });
  }

  async function handleLogout() {
    if (!logoutButton) return;
    logoutButton.disabled = true;
    showLogoutFeedback('Logging out…');
    showSessionRefreshFeedback('');
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = payload?.error || `Failed to log out (status ${response.status}).`;
        throw new Error(errorMessage);
      }
      showLogoutFeedback('Logged out.', 'success');
      applyUsageLimits(USAGE_LIMITS.loggedOut, 'Logged-out Session');
      setAccountField(accountEmail, '');
      setAccountPlanValue('Free');
      setAccountEverSubscribedValue(false);
      setAccountField(accountSession, '');
      setAccountVisibility(false);
      if (accountEverSubscribedSelect) {
        accountEverSubscribedSelect.disabled = true;
      }
      if (refreshSessionButton) {
        refreshSessionButton.disabled = true;
      }
      if (window.parent && window.parent !== window) {
        try {
          window.parent.location.assign('/agent');
        } catch (error) {
          console.warn('Failed to refresh parent after logout.', error);
        }
      }
    } catch (error) {
      console.error('Failed to log out:', error);
      showLogoutFeedback(error.message || 'Failed to log out.', 'error');
      logoutButton.disabled = false;
    }
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', function() {
      void handleLogout();
    });
  }

  async function handleSessionRefresh() {
    if (!refreshSessionButton) return;
    refreshSessionButton.disabled = true;
    showSessionRefreshFeedback('Refreshing session…');
    try {
      const response = await fetch('/api/session/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = payload?.error || `Failed to refresh session (status ${response.status}).`;
        throw new Error(errorMessage);
      }
      setAccountField(accountSession, payload.sessionId);
      showSessionRefreshFeedback('Session refreshed.', 'success');
      await loadUsageLimits();
    } catch (error) {
      console.error('Failed to refresh session:', error);
      showSessionRefreshFeedback(error.message || 'Failed to refresh session.', 'error');
    } finally {
      if (refreshSessionButton) {
        refreshSessionButton.disabled = false;
      }
    }
  }

  if (refreshSessionButton) {
    refreshSessionButton.addEventListener('click', function() {
      void handleSessionRefresh();
    });
  }

  if (supportActionButton) {
    supportActionButton.addEventListener('click', function() {
      if (!isLoggedOutPlan(currentAccountPlan)) return;
      requestAuthModal('signup');
    });
  }

  const inlineAuthButtons = Array.from(document.querySelectorAll('.subscribe-button--inline'));
  if (inlineAuthButtons.length) {
    inlineAuthButtons.forEach(button => {
      button.addEventListener('click', () => {
        requestAuthModal('signup');
      });
    });
  }
})();
