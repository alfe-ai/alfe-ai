(() => {
  const config = window.CODEX_RUNNER_CONFIG || {};
  const shouldStripCodexUserPrompt = config.userPromptVisibleCodex !== true;
  const CODEX_HIDDEN_PROMPT_LINES = [
    'Do not ask to commit changes, we run a script to automatically stage, commit, and push after you finish.',
    'Do not ask anything like "Do you want me to run `git commit` with a message?"',
    'Do not mention anything like "The file is staged."',
    'Python command is available via "python3" Python 3.11.2',
    'Whenever you need to modify source files, skip git apply and instead programmatically read the target file, replace the desired text (or insert the new snippet) using a Python script (e.g., Path.read_text()/write_text()), then stage the changes.',
    'When starting, please check AGENTS.md in repository root for further instructions.',
    'Unless otherwise specified, NOW MAKE CODE CHANGES FOR THE USERS SPECIFIED REQUEST BELOW:',
  ];

  const stripCodexUserPromptFromText = (text) => {
    if (!shouldStripCodexUserPrompt) {
      return text;
    }
    if (typeof text !== "string" || !text) {
      return text;
    }
    const endsWithNewline = text.endsWith("\n");
    const lines = text.split(/\r?\n/);
    const filtered = lines.filter((line) => {
      if (!line) {
        return true;
      }
      return !CODEX_HIDDEN_PROMPT_LINES.some((phrase) => line.includes(phrase));
    });
    let joined = filtered.join("\n");
    if (endsWithNewline && joined) {
      joined += "\n";
    }
    return joined;
  };
  // submitOnEnter default (may be overridden by localStorage)
  // If localStorage has 'submitOnEnter', that value is used; otherwise the server-provided
  // CODEX_RUNNER_CONFIG.defaultSubmitOnEnter is used (defaults to true).
  const submitOnEnterFromLocal = (localStorage.getItem('submitOnEnter') !== null) ? (localStorage.getItem('submitOnEnter') === 'true') : undefined;
  // `config.defaultSubmitOnEnter` will be provided by the server; if absent, treated as true.
  let submitOnEnterDefault = (typeof submitOnEnterFromLocal !== 'undefined') ? submitOnEnterFromLocal : (config.defaultSubmitOnEnter !== false);
  const promptHintsFromLocal = (localStorage.getItem('showPromptHints') !== null) ? (localStorage.getItem('showPromptHints') === 'true') : undefined;
  let showPromptHints = (typeof promptHintsFromLocal !== 'undefined') ? promptHintsFromLocal : (config.defaultShowPromptHints !== false);
  const ENGINE_STORAGE_KEY = 'enginePreference';
  const QWEN_DEBUG_ENV_STORAGE_KEY = 'qwenDebugEnv';
  const QWEN_SHOW_DEBUG_INFO_STORAGE_KEY = 'qwenShowDebugInfo';
  const CODE_USAGE_STORAGE_KEY = 'alfe.codeRunUsageCount';
  const normalizeEnginePreference = (value) => {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (normalized === 'qwen' || normalized === 'codex' || normalized === 'cline' || normalized === 'sterling' || normalized === 'kilo') {
      return normalized;
    }
    return 'auto';
  };
  const engineFromLocal = normalizeEnginePreference(localStorage.getItem(ENGINE_STORAGE_KEY));
  let enginePreference = engineFromLocal;
  const qwenDebugEnvEnabled = window.MODEL_ONLY_CONFIG && window.MODEL_ONLY_CONFIG.qwenDebugEnabled;
  const qwenShowDebugInfoFromLocal = (localStorage.getItem(QWEN_SHOW_DEBUG_INFO_STORAGE_KEY) !== null)
    ? (localStorage.getItem(QWEN_SHOW_DEBUG_INFO_STORAGE_KEY) === 'true')
    : undefined;
  let qwenShowDebugInfo = (typeof qwenShowDebugInfoFromLocal !== 'undefined') ? qwenShowDebugInfoFromLocal : false;

  let currentRunContext = null;
  let runsSidebarSelectedRunId = null;

  let modelSelect;
  let modelPromptSelect;
  let modelPromptSelectButton;
  let modelPromptSelectMenu;
  let engineSelectInline;
  let defaultModelInput;

  let modelOnlyLookup = new Map();
  let lastValidModelSelection = "";

  const formatModelLabel = (model) => {
    if (!model) return "";
    return model.label;
  };

  const resolveUsageBadge = (usage) => {
    const normalized = (usage || "").toString().trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.includes("very")) {
      return { label: normalized, className: "usage-very-high" };
    }
    if (normalized.includes("high")) {
      return { label: normalized, className: "usage-high" };
    }
    if (normalized.includes("medium")) {
      return { label: normalized, className: "usage-medium" };
    }
    if (normalized.includes("low")) {
      return { label: normalized, className: "usage-low" };
    }
    return { label: normalized, className: "usage-low" };
  };

  const resolveFreeUsageBadgeLabel = () => {
    const normalizedPlan = getUsagePlanName().toString().trim().toLowerCase();
    const isPaidPlan = normalizedPlan === "lite" || normalizedPlan === "plus" || normalizedPlan === "pro";
    return isPaidPlan ? "Unlimited" : "Free";
  };

  const hasPlusModelAccess = (plan) => {
    const normalizedPlan = (plan || "").toString().trim().toLowerCase();
    return normalizedPlan === "lite" || normalizedPlan === "plus" || normalizedPlan === "pro";
  };

  const createUsageBadge = (usage) => {
    const badge = resolveUsageBadge(usage);
    if (!badge) return null;
    const normalizedUsage = (usage || "").toString().trim().toLowerCase();
    const label = normalizedUsage === "free"
      ? resolveFreeUsageBadgeLabel()
      : badge.label
          .split(" ")
          .filter(Boolean)
          .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
          .join(" ");
    const badgeEl = document.createElement("span");
    badgeEl.className = `usage-badge ${badge.className}`;
    badgeEl.textContent = `${label} usage`;
    return badgeEl;
  };

  const isModelEnabled = (model) => {
    if (!model) return false;
    if (typeof model.disabled === "boolean") {
      return !model.disabled;
    }
    return true;
  };

  const shouldDisableModel = (model, plan, limits, usageCount) => {
    if (!model) return false;

    // Check if user is on Free or Logged-out Session plan
    const normalizedPlan = (plan || "").toString().trim().toLowerCase();
    const isFreeOrLoggedOut = normalizedPlan === "free" || normalizedPlan === "logged-out session";

    if (!isFreeOrLoggedOut) {
      return false; // Paid plans can use any model
    }

    // Check if usage limit is reached
    const codeLimit = typeof limits.code === "number" ? limits.code : 0;
    const hasReachedLimit = codeLimit > 0 && usageCount >= codeLimit;

    if (!hasReachedLimit) {
      return false; // Not at limit yet
    }

    // Disable models that don't have usage: "free"
    return model.usage !== "free";
  };

  const normaliseModelEntry = (entry) => {
    if (!entry) return null;
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (!trimmed) return null;
      return {
        id: trimmed,
        label: trimmed,
        disabled: false,
        plus_model: false,
        usage: "",
      };
    }
    if (typeof entry !== "object") return null;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) return null;
    const label = typeof entry.label === "string" && entry.label.trim().length ? entry.label.trim() : id;
    const usage = typeof entry.usage === "string" ? entry.usage.trim().toLowerCase() : "";
    const enabled = typeof entry.enabled === "boolean" ? entry.enabled : undefined;
    return {
      id,
      label,
      disabled: Boolean(entry.disabled),
      enabled,
      plus_model: Boolean(entry.plus_model),
      usage,
    };
  };

  const updateModelPromptSelectButton = (model) => {
    if (!modelPromptSelectButton) return;
    const textWrapper = modelPromptSelectButton.querySelector(".model-select-button__text");
    if (!textWrapper) return;
    textWrapper.textContent = "";
    const labelText = model ? formatModelLabel(model) : "Select model";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = labelText;
    textWrapper.appendChild(labelSpan);
  };

  const syncModelPromptDropdownSelection = () => {
    if (!modelPromptSelectMenu || !modelPromptSelect) return;
    const currentValue = modelPromptSelect.value || "";
    Array.from(modelPromptSelectMenu.querySelectorAll(".model-select-option")).forEach((button) => {
      const isSelected = button.dataset.modelId === currentValue;
      button.classList.toggle("is-selected", isSelected);
    });
  };

  const closeModelPromptDropdown = () => {
    if (!modelPromptSelectMenu || !modelPromptSelectButton) return;
    modelPromptSelectMenu.classList.add("is-hidden");
    modelPromptSelectButton.setAttribute("aria-expanded", "false");
  };

  const toggleModelPromptDropdown = () => {
    if (!modelPromptSelectMenu || !modelPromptSelectButton) return;
    const isOpen = !modelPromptSelectMenu.classList.contains("is-hidden");
    if (isOpen) {
      closeModelPromptDropdown();
    } else {
      modelPromptSelectMenu.classList.remove("is-hidden");
      modelPromptSelectButton.setAttribute("aria-expanded", "true");
      syncModelPromptDropdownSelection();
    }
  };

  const updateModelSelectValue = (value) => {
    if (modelSelect) {
      modelSelect.value = value;
    }
    if (modelPromptSelect) {
      modelPromptSelect.value = value;
    }
    if (value) {
      updateModelPromptSelectButton(modelOnlyLookup.get(value) || { label: value, plus_model: false });
    } else {
      updateModelPromptSelectButton(null);
    }
    syncModelPromptDropdownSelection();
  };

  const shouldUpdateModelSelect = (selectEl, previousDefault) =>
    Boolean(selectEl && (!selectEl.value || selectEl.value === previousDefault));

  const ensureModelOption = (selectEl, value) => {
    if (!selectEl || !value) return null;
    let existingOption = Array.from(selectEl.options || []).find((opt) => opt.value === value);
    if (!existingOption) {
      const model = modelOnlyLookup.get(value);
      existingOption = document.createElement("option");
      existingOption.value = value;
      existingOption.textContent = model ? formatModelLabel(model) : value;
      selectEl.insertBefore(existingOption, selectEl.firstChild);
    }
    return existingOption;
  };
  const updateDefaultModelState = (savedModel) => {
    if (!savedModel) return;
    if (defaultModelInput) {
      defaultModelInput.value = savedModel;
    }
    if (modelSelect) {
      ensureModelOption(modelSelect, savedModel);
    }
    if (modelPromptSelect) {
      ensureModelOption(modelPromptSelect, savedModel);
    }
    updateModelSelectValue(savedModel);
    config.defaultModel = savedModel;
    config.defaultCodexModel = savedModel;
  };
  const persistDefaultModelSelection = async (newModel, options = {}) => {
    const { showFeedback = false } = options;
    const trimmedModel = newModel ? newModel.trim() : "";
    if (!trimmedModel) {
      if (showFeedback) {
        showDefaultModelFeedback("Default model cannot be empty.", "error");
      }
      return;
    }
    if (config.defaultModel === trimmedModel) {
      return;
    }
    if (showFeedback) {
      showDefaultModelFeedback("Saving default model…");
    }
    if (defaultModelSaveButton) {
      defaultModelSaveButton.disabled = true;
    }
    try {
      const response = await fetch("/agent/default-model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ defaultModel: trimmedModel }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = payload?.error || `Failed to save default model (status ${response.status}).`;
        throw new Error(errorMessage);
      }
      const savedModel =
        typeof payload?.defaultModel === "string" && payload.defaultModel.trim()
          ? payload.defaultModel.trim()
          : trimmedModel;
      updateDefaultModelState(savedModel);
      if (showFeedback) {
        showDefaultModelFeedback(payload?.message || "Default model saved.", "success");
      }
    } catch (error) {
      console.error("Failed to save default Agent model:", error);
      if (showFeedback) {
        showDefaultModelFeedback(error.message || "Failed to save default model.", "error");
      }
    } finally {
      if (defaultModelSaveButton) {
        defaultModelSaveButton.disabled = false;
      }
    }
  };
  // Listen for settings from the settings iframe to update submit-on-enter default
  function openAuthModalFromMessage(preferredStep = 'signup', options = {}) {
    const maxAttempts = 30;
    const retryDelayMs = 100;
    let attempts = 0;

    const tryOpenModal = () => {
      attempts += 1;
      if (typeof window !== 'undefined' && typeof window.alfeOpenAuthModal === 'function') {
        window.alfeOpenAuthModal(preferredStep, options);
        return;
      }

      if (attempts < maxAttempts) {
        window.setTimeout(tryOpenModal, retryDelayMs);
        return;
      }

      const authModalTrigger = document.getElementById('signUpLogInBtn');
      if (authModalTrigger) {
        authModalTrigger.click();
      }
    };

    tryOpenModal();
  }

  const closeRepoAddModal = () => {
    const repoAddModal = document.getElementById('repoAddModal');
    const repoAddIframe = document.getElementById('repoAddIframe');
    const repoAddLoader = document.getElementById('repoAddLoader');
    if (repoAddModal) {
      repoAddModal.classList.add('is-hidden');
    }
    document.body.style.overflow = '';
    if (repoAddIframe) {
      repoAddIframe.classList.remove('is-loading');
      repoAddIframe.src = '';
    }
    if (repoAddLoader) {
      repoAddLoader.classList.add('is-hidden');
    }
  };

  window.addEventListener('message', function(ev){
    try{
      var d = ev && ev.data;
      if(!d || d.type !== 'sterling:settings') return;
      if(d.key === 'submitOnEnter'){
        try{ submitOnEnterDefault = (d.value === true || d.value === 'true'); }catch(e){}
      }
      if (d.key === 'showPromptHints') {
        try{ showPromptHints = (d.value === true || d.value === 'true'); }catch(e){}
        updatePromptPlaceholder();
      }
      if (d.key === 'qwenShowDebugInfo') {
        try {
          qwenShowDebugInfo = (d.value === true || d.value === 'true');
          localStorage.setItem(QWEN_SHOW_DEBUG_INFO_STORAGE_KEY, qwenShowDebugInfo ? 'true' : 'false');
        } catch (e) {}
      }
      if(d.key === 'defaultModel'){
        var newDefaultModel = typeof d.value === 'string' ? d.value.trim() : '';
        if(newDefaultModel){
          var previousDefault = config.defaultModel || '';
          config.defaultModel = newDefaultModel;
          if(shouldUpdateModelSelect(modelSelect, previousDefault)){
            modelSelect.value = newDefaultModel;
          }
          if(shouldUpdateModelSelect(modelPromptSelect, previousDefault)){
            modelPromptSelect.value = newDefaultModel;
          }
          if(defaultModelInput){
            defaultModelInput.value = newDefaultModel;
          }
        }
      }
      if(d.key === 'engine'){
        enginePreference = normalizeEnginePreference(d.value);
        if (engineSelectInline) {
          engineSelectInline.value = enginePreference;
        }
      }
      if (d.key === 'openAuthModal') {
        const openAuthConfig = d.value && typeof d.value === 'object' ? d.value : {};
        const preferredStep =
          (typeof d.value === 'string' ? d.value : openAuthConfig.preferredStep) === 'login'
            ? 'login'
            : 'signup';
        const repoAddIframe = document.getElementById('repoAddIframe');
        const isRepoAddMessageSource = !!(repoAddIframe && ev && ev.source === repoAddIframe.contentWindow);
        const shouldCloseRepoAddFirst = openAuthConfig.closeRepoAddFirst === true || isRepoAddMessageSource;
        if (shouldCloseRepoAddFirst) {
          closeRepoAddModal();
        }
        hideSettingsModal();
        openAuthModalFromMessage(preferredStep, { closeRepoAddFirst: shouldCloseRepoAddFirst });
      }
      if (d.key === 'openSubscribeModal') {
        const openSubscribeConfig = d.value && typeof d.value === 'object' ? d.value : {};
        const repoAddIframe = document.getElementById('repoAddIframe');
        const isRepoAddMessageSource = !!(repoAddIframe && ev && ev.source === repoAddIframe.contentWindow);
        const shouldCloseRepoAddFirst = openSubscribeConfig.closeRepoAddFirst === true || isRepoAddMessageSource;
        const shouldCloseSettingsFirst = openSubscribeConfig.closeSettingsFirst !== false;
        if (shouldCloseRepoAddFirst) {
          closeRepoAddModal();
        }
        if (shouldCloseSettingsFirst) {
          hideSettingsModal();
          window.setTimeout(() => {
            showSubscribeModal();
          }, 0);
        } else {
          showSubscribeModal();
        }
      }
      if (d.key === 'closeSettingsModal') {
        hideSettingsModal();
      }
      if (d.key === 'closeRepoAddModal') {
        closeRepoAddModal();
      }
      if (d.key === 'logoutComplete') {
        hideSettingsModal();
        try {
          const url = new URL(window.location.href);
          const isAgentPage = url.pathname === '/agent' || url.pathname.startsWith('/agent/');
          if (isAgentPage) {
            window.location.reload();
          } else {
            window.location.assign('/agent');
          }
        } catch (error) {
          window.location.assign('/agent');
        }
      }
    }catch(e){}
  });

  const incrementCodeUsageCount = () => {
    let currentModelId = "";
    try {
      currentModelId = (modelSelect && modelSelect.value) || "";
    } catch (e) {
      // ignore
    }

    const currentModel = modelOnlyLookup && modelOnlyLookup.get(currentModelId);
    const normalizedPlan = getUsagePlanName().toString().trim().toLowerCase();
    const isLimitedPlan = normalizedPlan === "logged-out session" || normalizedPlan === "free";
    if (currentModel && currentModel.usage === "free" && !isLimitedPlan) {
      // Free-tier models are unlimited for paid plans.
      return;
    }

    let nextCount = 1;
    try {
      const raw = localStorage.getItem(CODE_USAGE_STORAGE_KEY);
      const current = Number(raw);
      const normalized = Number.isFinite(current) ? current : 0;
      nextCount = normalized + 1;
      localStorage.setItem(CODE_USAGE_STORAGE_KEY, String(nextCount));
    } catch (error) {
      nextCount = 1;
    }
    try {
      const settingsIframe = document.getElementById("sterlingSettingsIframe");
      if (settingsIframe && settingsIframe.contentWindow) {
        settingsIframe.contentWindow.postMessage(
          { type: "sterling:usage", key: "codeRun", value: nextCount },
          "*"
        );
      }
    } catch (error) {
      /* ignore */
    }
  };

  const USAGE_LIMITS = {
    loggedOut: { code: 10 },
    free: { code: 20 },
    lite: { code: null },
    plus: { code: null },
    pro: { code: null },
  };

  const resolveUsageLimits = (plan) => {
    const normalized = (plan || "").toString().trim();
    if (normalized === "Pro") return USAGE_LIMITS.pro;
    if (normalized === "Plus") return USAGE_LIMITS.plus;
    if (normalized === "Lite") return USAGE_LIMITS.lite;
    if (normalized === "Free") return USAGE_LIMITS.free;
    return USAGE_LIMITS.loggedOut;
  };

  const getStoredCodeUsageCount = () => {
    try {
      const raw = localStorage.getItem(CODE_USAGE_STORAGE_KEY);
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
      return 0;
    }
  };

  const getUsagePlanName = () => {
    const info =
      (typeof window !== "undefined" && window.accountInfo)
        ? window.accountInfo
        : null;
    if (info && info.plan) {
      return info.plan;
    }
    return "Logged-out Session";
  };

  const form = document.getElementById("codexForm");
  const projectDirInput = document.getElementById("projectDir");
  const agentInstructionsInput = document.getElementById("agentInstructions");
  const openRouterRefererInput = document.getElementById("openRouterReferer");
  const openRouterTitleInput = document.getElementById("openRouterTitle");
  const fileTreeInput = document.getElementById("fileTree");
  const fileTreeField = document.getElementById("fileTreeField");
  const fileTreeStatus = document.getElementById("fileTreeStatus");
  const fileTreeToggleButton = document.getElementById("fileTreeToggleButton");
  const gitFpushField = document.getElementById("gitFpushField");
  const gitFpushToggleButton = document.getElementById("gitFpushToggleButton");
  const gitFpushRevisionNotice = document.getElementById("gitFpushRevisionNotice");
  const gitFpushRevisionCode = document.getElementById("gitFpushRevisionCode");
  const promptInput = document.getElementById("prompt");
  const usageLimitModal = document.getElementById("usageLimitModal");
  const usageLimitModalCloseButton = document.getElementById("usageLimitModalCloseButton");
  const subscribeModal = document.getElementById("subscribeModal");
  const subscribeModalCloseButton = document.getElementById("subscribeModalCloseButton");
  const usageLimitCodeUsageLimit = document.getElementById("usageLimitCodeUsageLimit");
  const usageLimitCodeUsageBarFill = document.getElementById("usageLimitCodeUsageBarFill");
  const usageLimitCodeUsageLimited = document.getElementById("usageLimitCodeUsageLimited");
  const usageLimitCodeUsageUnlimited = document.getElementById("usageLimitCodeUsageUnlimited");
  const usageLimitCodeUsageUnlimitedText = document.getElementById("usageLimitCodeUsageUnlimitedText");
  const usageLimitCodeUsageUnlimitedNote = document.getElementById("usageLimitCodeUsageUnlimitedNote");
  const usageLimitFreeCodeUsageUpsell = document.getElementById("usageLimitFreeCodeUsageUpsell");
  const usageLimitLoggedOutCodeUsageUpsell = document.getElementById("usageLimitLoggedOutCodeUsageUpsell");
  const usageLimitProCodeUsageSection = document.getElementById("usageLimitProCodeUsageSection");
  const usageLimitProCodeUsageLimit = document.getElementById("usageLimitProCodeUsageLimit");
  const updatePromptPlaceholder = () => {
    try {
      const promptEl = promptInput;
      if (!promptEl) return;
      const hasSelectedRun = Boolean(config.enableFollowups && (Boolean(runsSidebarSelectedRunId) || (currentRunContext && currentRunContext.runId)));
      const suggestions = [
  'Make a snake game.',
  'Create a to-do app.',
  'Build a calculator.',
  'Implement a chat UI.',
  'Write unit tests for a module.',
  'Create a REST API endpoint.',
  'Generate a README template.',
  'Prototype a drawing app.',
  'Build a markdown previewer.',
  'Create a CLI tool.',
  'Create a weather widget.',
  'Build a countdown timer.',
  'Make a tip calculator.',
  'Create a note-taking app.',
  'Make a blog template.',
  'Create a color picker tool.',
  'Build a random quote generator.',
  'Create a Pomodoro timer.',
  'Build a currency converter.',
  'Create a BMI calculator.',
  'Build a unit converter.',
  'Create a slideshow.',
  'Make a pixel art editor.',
  'Build a contact form.',
  'Create a habit tracker.',
  'Build a wallpaper rotator.',
  'Create a grocery list app.',
  'Make a photo captioner.',
  'Build a RSS reader.',
  'Create a password strength checker.',
  'Build a random password generator.',
  'Create a markdown to HTML converter.',
  'Make a CSV to JSON converter.',
  'Build a voting app.',
  'Create a draggable kanban board.',
  'Make a tip jar donation widget.',
  'Build a stopwatch.',
  'Create a daily journal template.',
  'Make a recipe app.',
  'Build an emoji picker.',
  'Create a reading list tracker.',
  'Make a file uploader.',
  'Build a keyboard shortcut helper.',
  'Create a countdown to date app.',
  'Make a portfolio page.',
  'Build a FAQ accordion component.',
  'Create a responsive nav bar.',
  'Make a local storage demo app.',
  'Build a theme switcher (light/dark).',
  'Create a slideshow with thumbnails.',
  'Make a product catalog.',
  'Build a searchable list.',
  'Create a tag input component.',
  'Make a CSV viewer.',
  'Build a map marker app.',
  'Create a drag-and-drop upload area.',
  'Make an image resizer tool.',
  'Build a countdown to next holiday.',
  'Create a binary to decimal converter.',
  'Make a quiz app.',
  'Build a flashcard study tool.',
  'Create a random name generator.',
  'Make a stopwatch.',
  'Build a blinking notification badge.',
  'Create a sitemap generator.',
  'Make a scroll-to-top button demo.',
  'Build a tooltip component.',
  'Create a modal dialog example.',
  'Make a form validation demo.',
  'Build a analytics tracker.',
  'Create a chat-bot mock UI.',
  'Make a movie search UI.',
  'Build a podcast player.',
  'Create a README badge generator.',
  'Make a gradient background picker.',
  'Build a calendar view.',
  'Create a timezone converter.',
  'Make a random color palette generator.',
  'Build an address formatter.',
  'Create a project starter template.',
  'Make a contact list with search.',
  'Build a minimal e-commerce product page.',
  'Create a todo app with categories.',
  'Make a daily quote widget.',
  'Build a minimal chat message composer.',
  'Create a site performance checklist.',
  'Make a hero section template.',
];
      const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
      if (hasSelectedRun) {
        promptEl.placeholder = "Add a followup to current task or ask a question";
        return;
      }
      let promptPlaceholder = "Start a new task or ask a question";
      if (showPromptHints) {
        promptPlaceholder = `${promptPlaceholder}\n\nTry: ${suggestion}`;
      }
      promptEl.placeholder = promptPlaceholder;
    } catch (_e) { /* ignore */ }
  };
  // Update initial placeholder and whenever selection/context changes
  updatePromptPlaceholder();

  const updateUsageLimitModal = () => {
    if (!usageLimitCodeUsageLimit) return;
    const planName = getUsagePlanName();
    const limits = resolveUsageLimits(planName);
    const normalizedPlanKey = (planName || "").toString().trim().toLowerCase();
    const hasAccountInfo = Boolean(
      typeof window !== "undefined"
      && window.accountInfo
      && window.accountInfo.email
    );
    const isLoggedOut = !hasAccountInfo || normalizedPlanKey === "logged-out session";
    const isFreePlan = normalizedPlanKey === "free";
    const isPaidPlan = normalizedPlanKey === "lite" || normalizedPlanKey === "plus" || normalizedPlanKey === "pro";
    const isProPlanActive = normalizedPlanKey === "pro";
    const codeLimit = typeof limits.code === "number" ? limits.code : 0;
    const used = getStoredCodeUsageCount();
    usageLimitCodeUsageLimit.textContent = `${used}/${codeLimit} code runs`;
    if (usageLimitCodeUsageBarFill) {
      const percent = codeLimit > 0 ? Math.min(used / codeLimit, 1) * 100 : 0;
      usageLimitCodeUsageBarFill.style.width = `${percent}%`;
    }
    if (usageLimitCodeUsageLimited) {
      usageLimitCodeUsageLimited.classList.toggle("hidden", isPaidPlan);
    }
    if (usageLimitFreeCodeUsageUpsell) {
      usageLimitFreeCodeUsageUpsell.classList.toggle("is-hidden", !(isFreePlan && !isLoggedOut));
    }
    if (usageLimitLoggedOutCodeUsageUpsell) {
      usageLimitLoggedOutCodeUsageUpsell.classList.toggle("is-hidden", !isLoggedOut);
    }
    if (usageLimitCodeUsageUnlimited) {
      usageLimitCodeUsageUnlimited.classList.toggle("hidden", !isPaidPlan);
    }
    if (usageLimitCodeUsageUnlimitedText) {
      usageLimitCodeUsageUnlimitedText.textContent = isProPlanActive
        ? "Code usage of basic models is Unlimited*"
        : "Code usage is Unlimited*";
    }
    if (usageLimitCodeUsageUnlimitedNote) {
      usageLimitCodeUsageUnlimitedNote.classList.toggle("hidden", !isPaidPlan);
    }
    if (usageLimitProCodeUsageSection) {
      usageLimitProCodeUsageSection.classList.toggle("hidden", !isProPlanActive);
    }
    if (usageLimitProCodeUsageLimit) {
      usageLimitProCodeUsageLimit.textContent = "n/10000 cycles";
    }
  };

  const showUsageLimitModal = () => {
    if (!usageLimitModal) return;
    updateUsageLimitModal();
    usageLimitModal.classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
  };

  const hideUsageLimitModal = () => {
    if (!usageLimitModal) return;
    usageLimitModal.classList.add("is-hidden");
    document.body.style.overflow = "";
  };

  const showSubscribeModal = () => {
    if (!subscribeModal) return;
    subscribeModal.classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
  };

  const hideSubscribeModal = () => {
    if (!subscribeModal) return;
    subscribeModal.classList.add("is-hidden");
    document.body.style.overflow = "";
  };

  const isUsageLimitMessage = (message) => {
    if (!message) return false;
    const normalized = message.toString().toLowerCase();
    return (
      normalized.includes("usage limit")
      || normalized.includes("limit reached")
      || normalized.includes("run limit")
      || normalized.includes("quota")
      || normalized.includes("rate limit")
    );
  };

  const isCodeUsageLimitReached = () => {
    const planName = getUsagePlanName();
    const limits = resolveUsageLimits(planName);
    const limit = limits.code;
    if (typeof limit !== "number") return false;
    const used = getStoredCodeUsageCount();
    return used >= limit;
  };

  const isUsageLimitRestrictedModel = (modelId) => {
    if (!modelId) return false;
    if (!isCodeUsageLimitReached()) return false;
    const model = modelOnlyLookup.get(modelId);
    if (model && model.usage === "free") return false;
    return true;
  };

  modelSelect = document.getElementById("model");
  modelPromptSelect = document.getElementById("modelPromptSelect");
  modelPromptSelectButton = document.getElementById("modelPromptSelectButton");
  modelPromptSelectMenu = document.getElementById("modelPromptSelectMenu");
  engineSelectInline = document.getElementById("engineSelectInline");
  const getFirstAvailableModelValue = () => {
    const select = modelPromptSelect || modelSelect;
    if (!select) return "";
    const options = Array.from(select.options);
    const fallback = options.find(
      (option) => option.dataset.usageLimitDisabled !== "true" && option.dataset.proModelDisabled !== "true",
    );
    return fallback ? fallback.value : "";
  };
  const handleModelSelectChange = (event) => {
    const source = event.target;
    const selectedOption = source && source.options ? source.options[source.selectedIndex] : null;
    const selectedValue = (selectedOption && selectedOption.value) || (source && source.value) || "";
    if (selectedOption && selectedOption.dataset.proModelDisabled === "true") {
      showSubscribeModal();
      const fallback = lastValidModelSelection || getFirstAvailableModelValue();
      if (fallback) {
        updateModelSelectValue(fallback);
      }
      return;
    }
    if (selectedValue && isUsageLimitRestrictedModel(selectedValue)) {
      if (window.showUsageLimitModal) {
        window.showUsageLimitModal("code", "Usage limit reached. Please try again later.");
      }
      const fallback = lastValidModelSelection || getFirstAvailableModelValue();
      if (fallback) {
        updateModelSelectValue(fallback);
      }
      return;
    }
    if (selectedOption && selectedOption.dataset.usageLimitDisabled === "true") {
      if (window.showUsageLimitModal) {
        window.showUsageLimitModal("code", "Usage limit reached. Please try again later.");
      }
      const fallback = lastValidModelSelection || getFirstAvailableModelValue();
      if (fallback) {
        updateModelSelectValue(fallback);
      }
      return;
    }
    if (source === modelSelect && modelPromptSelect) {
      modelPromptSelect.value = source.value;
    }
    if (source === modelPromptSelect && modelSelect) {
      modelSelect.value = source.value;
    }
    const nextValue = (modelPromptSelect && modelPromptSelect.value) || (modelSelect && modelSelect.value) || "";
    updateModelPromptSelectButton(modelOnlyLookup.get(nextValue) || (nextValue ? { label: nextValue, plus_model: false } : null));
    syncModelPromptDropdownSelection();
    persistDefaultModelSelection(nextValue, { showFeedback: true });
    lastValidModelSelection = nextValue;
  };
  const renderModelOnlyOptions = (models, preferredValue = "") => {
    const enabledModels = models.filter(isModelEnabled);
    modelOnlyLookup = new Map(enabledModels.map((model) => [model.id, model]));
    const selects = [modelSelect, modelPromptSelect].filter(Boolean);
    selects.forEach((select) => {
      select.innerHTML = "";
    });
    if (modelPromptSelectMenu) {
      modelPromptSelectMenu.innerHTML = "";
    }
    if (!enabledModels.length) {
      selects.forEach((select) => {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No models available";
        select.appendChild(option);
        select.disabled = true;
      });
      if (modelPromptSelectButton) {
        modelPromptSelectButton.disabled = true;
      }
      updateModelPromptSelectButton(null);
      return;
    }
    if (modelPromptSelectButton) {
      modelPromptSelectButton.disabled = false;
    }
    // Get current usage count and check if models should be disabled
    const usageCount = getStoredCodeUsageCount();
    const planName = getUsagePlanName();
    const limits = resolveUsageLimits(planName);
    const shouldDisable = shouldDisableModel(null, planName, limits, usageCount);

    // Sort models: free models first only when usage limit is reached
    const sortedModels = enabledModels.sort((a, b) => {
      // Only show free models first when usage limit is reached
      const hasReachedLimit = limits.code > 0 && usageCount >= limits.code;
      if (hasReachedLimit) {
        const aIsFree = a.usage === "free";
        const bIsFree = b.usage === "free";
        if (aIsFree && !bIsFree) return -1;
        if (!aIsFree && bIsFree) return 1;
      }
      return 0;
    });

    sortedModels.forEach((model) => {
      const label = formatModelLabel(model);
      const isDisabled = shouldDisableModel(model, planName, limits, usageCount);
      const isProDisabled = model.plus_model && !hasPlusModelAccess(planName);

      selects.forEach((select) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = label;
        if (isDisabled) {
          option.classList.add("usage-limit-disabled");
          option.dataset.usageLimitDisabled = "true";
        }
        if (isProDisabled) {
          option.classList.add("pro-model-disabled");
          option.dataset.proModelDisabled = "true";
        }
        select.appendChild(option);
      });

      if (modelPromptSelectMenu && modelPromptSelect) {
        const optionButton = document.createElement("button");
        optionButton.type = "button";
        optionButton.className = "model-select-option";
        optionButton.dataset.modelId = model.id;
        const isUsageLimitDisabled = isDisabled;
        const blockedByPlan = isProDisabled && !isUsageLimitDisabled;
        optionButton.disabled = false;
        optionButton.classList.toggle("usage-limit-disabled", isUsageLimitDisabled);
        optionButton.classList.toggle("pro-model-disabled", isProDisabled);
        if (isUsageLimitDisabled || blockedByPlan) {
          optionButton.setAttribute("aria-disabled", "true");
        } else {
          optionButton.removeAttribute("aria-disabled");
        }
        optionButton.dataset.usageLimitDisabled = isUsageLimitDisabled ? "true" : "false";

        const labelRow = document.createElement("div");
        labelRow.className = "model-select-option__label";
        const labelText = document.createElement("span");
        labelText.textContent = label;
        labelRow.appendChild(labelText);
        const badgeEl = model.usage ? createUsageBadge(model.usage) : null;
        if (badgeEl) {
          labelRow.appendChild(badgeEl);
        }
        optionButton.appendChild(labelRow);
        optionButton.addEventListener("click", (event) => {
          if (isUsageLimitDisabled || isUsageLimitRestrictedModel(model.id) || blockedByPlan) {
            event.preventDefault();
            if (blockedByPlan) {
              showSubscribeModal();
            } else if (window.showUsageLimitModal) {
              window.showUsageLimitModal('code', 'Usage limit reached. Please try again later.');
            }
            return;
          }
          modelPromptSelect.value = model.id;
          modelPromptSelect.dispatchEvent(new Event("change", { bubbles: true }));
          closeModelPromptDropdown();
        });
        modelPromptSelectMenu.appendChild(optionButton);
      }
    });
    selects.forEach((select) => {
      select.disabled = false;
    });
    const resolvedValue = modelOnlyLookup.has(preferredValue)
      ? preferredValue
      : (enabledModels[0] && enabledModels[0].id) || "";
    updateModelSelectValue(resolvedValue);
    lastValidModelSelection = resolvedValue;
  };
  const loadModelOnlyOptions = async () => {
    if (!modelSelect && !modelPromptSelect) return;
    const currentSelection =
      (modelSelect && modelSelect.value)
      || (modelPromptSelect && modelPromptSelect.value)
      || config.defaultModel
      || "";
    try {
      const response = await fetch("/agent/model-only/models");
      if (!response.ok) {
        throw new Error(`Unable to load models (status ${response.status}).`);
      }
      const payload = await response.json();
      const providers = payload && payload.providers ? payload.providers : {};
      const providerKey = payload.defaultProvider || Object.keys(providers)[0] || "";
      const list = providerKey && Array.isArray(providers[providerKey]) ? providers[providerKey] : [];
      const normalized = list.map(normaliseModelEntry).filter(Boolean);
      const preferredValue = currentSelection || payload.defaultModel || (normalized[0] && normalized[0].id) || "";
      renderModelOnlyOptions(normalized, preferredValue);
    } catch (error) {
      console.warn("Failed to load model-only list:", error);
      const fallbackValue = (modelPromptSelect && modelPromptSelect.value) || (modelSelect && modelSelect.value) || "";
      updateModelPromptSelectButton(fallbackValue ? { label: fallbackValue, plus_model: false } : null);
    }
  };
  if (modelSelect) {
    modelSelect.addEventListener("change", handleModelSelectChange);
  }
  if (modelPromptSelect) {
    if (modelSelect && modelSelect.value) {
      modelPromptSelect.value = modelSelect.value;
    }
    modelPromptSelect.addEventListener("change", handleModelSelectChange);
  }
  if (modelPromptSelectButton && modelPromptSelectMenu) {
    modelPromptSelectButton.addEventListener("click", toggleModelPromptDropdown);
    document.addEventListener("click", (event) => {
      if (!modelPromptSelectMenu.contains(event.target) && !modelPromptSelectButton.contains(event.target)) {
        closeModelPromptDropdown();
      }
    });
  }
  loadModelOnlyOptions();
  if (engineSelectInline) {
    const engineOptionLabelPrefix = "Engine: ";
    const syncEngineOptionLabels = (expanded) => {
      engineSelectInline.querySelectorAll("option").forEach((option) => {
        if (!option.dataset.originalLabel) {
          option.dataset.originalLabel = option.textContent || "";
        }
        const isSelected = option.value === engineSelectInline.value;
        if (expanded && !isSelected) {
          option.textContent = `${engineOptionLabelPrefix}${option.dataset.originalLabel}`;
          return;
        }
        option.textContent = option.dataset.originalLabel;
      });
    };

    engineSelectInline.value = enginePreference;
    engineSelectInline.addEventListener("change", (event) => {
      const normalized = normalizeEnginePreference(event.target.value);
      enginePreference = normalized;
      engineSelectInline.value = normalized;
      syncEngineOptionLabels(document.activeElement === engineSelectInline);
      try {
        localStorage.setItem(ENGINE_STORAGE_KEY, normalized);
      } catch (error) {
        /* ignore */
      }
    });
    engineSelectInline.addEventListener("focus", () => {
      syncEngineOptionLabels(true);
    });
    engineSelectInline.addEventListener("blur", () => {
      syncEngineOptionLabels(false);
    });
    syncEngineOptionLabels(false);
  }
  const statusEl = document.getElementById("status");
  const statusTextEl = document.getElementById("statusText");
  const outputEl = document.getElementById("output");
  const stdoutOutputEl = document.getElementById("stdoutOutput");
  const outputTabsContainer = document.getElementById("outputTabs");
  const mergeOutputEl = document.getElementById("mergeOutput");
  const mergeToggleButton = document.getElementById("mergeToggleButton");
  const mergeSummaryEl = document.getElementById("mergeSummary");
  const followupSectionEl = document.getElementById("followupSessions");
  let followupSessions = [];
  let activeFollowupSession = null;
  let followupSessionCounter = 0;
  let mergeCollapsed = true;
  let mergeOutputBuffer = [];

  const fullOutputTabButton = document.getElementById("fullOutputTabButton");
  const stdoutTabButton = document.getElementById("stdoutTabButton");
  const gitLogLink = document.getElementById("gitLogLink");
  const gitLogModal = document.getElementById("gitLogModal");
  const gitLogIframe = document.getElementById("gitLogIframe");
  const VIEW_DIFF_MERGE_MESSAGE_TYPE = "STERLING_VIEW_DIFF_MODAL_MERGE_REQUEST";
  const cancelButton = document.getElementById("cancelButton");
  const runButton = document.getElementById("runButton");
  const mergeButton = document.getElementById("mergeButton");
  const updateBranchButton = document.getElementById("updateBranchButton");
  const branchesIframe = document.getElementById("branchesDropdownIframe");
  const mergeButtonWrapper = document.getElementById("mergeButtonWrapper");
  const deleteLocalButton = document.getElementById("deleteLocalButton");
  const mergeDisabledTooltip = document.getElementById("mergeDisabledTooltip");
  const mergeDiffButton = document.getElementById("openMergeDiffButton");
  const openEditorTopButton = document.getElementById("openEditorTopButton");
  defaultModelInput = document.getElementById("defaultModelInput");
  const defaultModelSaveButton = document.getElementById("defaultModelSaveButton");
  const defaultModelFeedback = document.getElementById("defaultModelFeedback");
  const saveAgentInstructionsButton = document.getElementById("saveAgentInstructionsButton");
  const agentInstructionsFeedback = document.getElementById("agentInstructionsFeedback");
  const toggleFieldsButton = document.getElementById("toggleFieldsButton");
  const metaSection = document.getElementById("metaSection");
  const testPythonButton = document.getElementById("testPythonButton");
  const pythonTestResult = document.getElementById("pythonTestResult");
  const pythonTestToggleButton = document.getElementById("pythonTestToggleButton");
  const runsSidebarEl = document.getElementById("runsSidebar");
  const runsSidebarListEl = document.getElementById("runsSidebarList");
  const runsSidebarLoadingEl = document.getElementById("runsSidebarLoading");
  // Hide the loading badge by default; we don't want a loading UI element during refreshes.
  if (runsSidebarLoadingEl) {
    runsSidebarLoadingEl.classList.add("is-hidden");
    try { runsSidebarLoadingEl.removeAttribute('data-compact-loading'); } catch(_e) { /* ignore */ }
  }

  const runsSidebarErrorEl = document.getElementById("runsSidebarError");
  const runsSidebarEmptyEl = document.getElementById("runsSidebarEmpty");
  const runsSidebarTitleEl = document.getElementById("runsSidebarTitle");
  const repoTriggerButton = document.getElementById("repoDropdownTrigger");
  const repoNameEl = repoTriggerButton ? repoTriggerButton.querySelector(".repo-name") : null;
  const repoDemoBadge = repoTriggerButton ? repoTriggerButton.querySelector(".repo-demo-badge") : null;
  const runsSidebarPaginationEl = document.getElementById("runsSidebarPagination");
  const runsSidebarPrevPageButton = document.getElementById("runsSidebarPrevPage");
  const runsSidebarNextPageButton = document.getElementById("runsSidebarNextPage");
  const runsSidebarPageIndicator = document.getElementById("runsSidebarPageIndicator");
  const runsSidebarArchiveAllButton = document.getElementById("runsSidebarArchiveAllButton");

  const updateRepoTriggerLabel = (projectName, projectDir, isDemo = false) => {
    if (repoNameEl) {
      const displayName = projectName || "";
      if (displayName) {
        repoNameEl.textContent = displayName;
        repoNameEl.setAttribute("title", projectDir || displayName);
      } else if (projectDir) {
        repoNameEl.textContent = projectDir;
        repoNameEl.setAttribute("title", projectDir);
      } else {
        repoNameEl.textContent = "Select a repository";
        repoNameEl.removeAttribute("title");
      }
    }

    if (repoDemoBadge) {
      repoDemoBadge.classList.toggle("is-hidden", !isDemo);
    }

    if (repoTriggerButton) {
      const accessibleLabel = projectName
        ? `Change repository (current: ${projectName})`
        : projectDir
          ? `Change repository (current: ${projectDir})`
          : "Choose a repository";
      repoTriggerButton.setAttribute("aria-label", accessibleLabel);
      repoTriggerButton.title = accessibleLabel;
    }
  };

  const autoResizeTextarea = (textarea) => {
    if (!textarea) {
      return;
    }
    try {
      textarea.style.height = "auto";
      const nextHeight = Math.min(720, Math.max(0, textarea.scrollHeight));
      if (nextHeight) {
        textarea.style.height = `${nextHeight}px`;
      }
    } catch (_err) {
      /* ignore measurement errors */
    }
  };

  const resetFollowupSessions = () => {
    followupSessions = [];
    activeFollowupSession = null;
    followupSessionCounter = 0;
    if (followupSectionEl) {
      followupSectionEl.innerHTML = "";
      followupSectionEl.classList.add("is-hidden");
    }
  };

  const setFollowupSessionStatus = (session, state) => {
    if (!session || !session.statusText) {
      return;
    }

    const statusEl = session.statusText;
    statusEl.className = "followup-status";
    let label = "Running";
    let modifier = "followup-status--running";
    if (state === "complete") {
      label = "Complete";
      modifier = "followup-status--complete";
    } else if (state === "error") {
      label = "Error";
      modifier = "followup-status--error";
    } else if (state === "canceled") {
      label = "Canceled";
      modifier = "followup-status--canceled";
    }
    statusEl.classList.add(modifier);
    statusEl.textContent = "Follow-up";
  };

  const formatFollowupText = (text, type = "output") => {
    if (typeof text !== "string" || !text) {
      return "";
    }

    const normalised = text.replace(/\r/g, "");
    const lines = normalised.split(/\n/);
    const formattedLines = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (index === lines.length - 1 && lines[index] === "") {
        continue;
      }
      let line = lines[index];
      if (type === "stderr") {
        line = line.replace(/^\[stderr\]\s*/i, "");
      } else if (type === "meta") {
        line = line ? `[meta] ${line}` : "";
      } else if (type === "status") {
        line = line ? `[status] ${line}` : "";
      }
      formattedLines.push(line);
    }

    return formattedLines.join("\n").trimEnd();
  };

  const appendToActiveFollowupSession = (text, type = "output") => {
    if (!activeFollowupSession) {
      return;
    }

    const formatted = formatFollowupText(text, type);
    if (formatted) {
      if (activeFollowupSession.outputValue) {
        activeFollowupSession.outputValue = `${activeFollowupSession.outputValue}\n${formatted}`;
      } else {
        activeFollowupSession.outputValue = formatted;
      }
    }

    if (activeFollowupSession.outputLogEl) {
      appendLinesToElement(activeFollowupSession.outputLogEl, text, type);
    }
  };

  const setFollowupActiveTab = (session, tab) => {
    if (!session) {
      return;
    }

    session.activeTab = tab;

    const showCombined = tab === "combined";
    const showFinal = tab === "stdout";

    if (session.combinedTabButton) {
      session.combinedTabButton.classList.toggle("active", showCombined);
      session.combinedTabButton.setAttribute("aria-selected", showCombined ? "true" : "false");
      session.combinedTabButton.tabIndex = showCombined ? 0 : -1;
    }

    if (session.finalTabButton) {
      session.finalTabButton.classList.toggle("active", showFinal);
      session.finalTabButton.setAttribute("aria-selected", showFinal ? "true" : "false");
      session.finalTabButton.tabIndex = showFinal ? 0 : -1;
    }

    if (session.outputLogEl) {
      session.outputLogEl.classList.toggle("is-hidden", !showCombined);
    }

    if (session.finalLogEl) {
      session.finalLogEl.classList.toggle("is-hidden", !showFinal);
    }
  };

  const getPromptPreviewSummary = (promptText) => {
    const normalised = sanitisePromptText(promptText);
    const trimmed = normalised.trim();
    if (!trimmed) {
      return { trimmed: "", summary: "" };
    }
    const firstLine = trimmed.split(/\r?\n/, 1)[0] || trimmed;
    const summary = firstLine.length > 200 ? `${firstLine.slice(0, 197)}…` : firstLine;
    return { trimmed, summary };
  };

  const buildPromptPreviewElement = (promptText) => {
    const previewEl = document.createElement("div");
    previewEl.className = "status status-idle prompt-preview";
    previewEl.setAttribute("role", "button");
    previewEl.setAttribute("tabindex", "0");
    previewEl.setAttribute("aria-haspopup", "dialog");
    previewEl.setAttribute("aria-expanded", "false");

    const previewTextEl = document.createElement("span");
    previewTextEl.className = "status-text prompt-preview-text";
    previewEl.appendChild(previewTextEl);

    const iconWrapper = document.createElement("span");
    iconWrapper.className = "prompt-preview-icon";
    iconWrapper.setAttribute("aria-hidden", "true");
    iconWrapper.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 5h10v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M5 19l14-14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
    previewEl.appendChild(iconWrapper);

    const { trimmed, summary } = getPromptPreviewSummary(promptText);
    previewTextEl.textContent = summary;
    const labelPreview = summary || "View full prompt";
    previewEl.setAttribute("aria-label", `View full prompt: ${labelPreview}`);
    previewEl.setAttribute("title", "Click to view full prompt");

    const openFollowupPromptModal = () => {
      if (!trimmed) {
        return;
      }
      openPromptModal(trimmed, previewEl);
    };
    previewEl.addEventListener("click", openFollowupPromptModal);
    previewEl.addEventListener("keydown", (event) => {
      if (!trimmed) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFollowupPromptModal();
      }
    });

    return previewEl;
  };

  const startFollowupSession = (promptText) => {
    if (!followupSectionEl) {
      return null;
    }

    followupSectionEl.classList.remove("is-hidden");

    followupSessionCounter += 1;
    const sessionEl = document.createElement("div");
    sessionEl.className = "followup-session";
    sessionEl.dataset.followupIndex = String(followupSessionCounter);

    const statusEl = document.createElement("p");
    statusEl.className = "followup-status followup-status--running";
    statusEl.textContent = "Follow-up";
    sessionEl.appendChild(statusEl);

    const promptPreview = buildPromptPreviewElement(promptText);
    sessionEl.appendChild(promptPreview);

    const outputLabel = document.createElement("label");
    const outputLabelId = `followupOutputLabel${followupSessionCounter}`;
    const combinedOutputId = `followupCombinedOutput${followupSessionCounter}`;
    outputLabel.id = outputLabelId;
    outputLabel.textContent = "Output";
    sessionEl.appendChild(outputLabel);

    const tabsContainer = document.createElement("div");
    tabsContainer.className = "output-tabs is-hidden";
    tabsContainer.setAttribute("role", "tablist");
    tabsContainer.setAttribute("aria-label", "Follow-up output views");

    const combinedButton = document.createElement("button");
    combinedButton.type = "button";
    combinedButton.className = "tab-button active";
    combinedButton.id = `followupOutputTab${followupSessionCounter}`;
    combinedButton.setAttribute("role", "tab");
    combinedButton.setAttribute("aria-selected", "true");
    combinedButton.setAttribute("aria-controls", combinedOutputId);
    combinedButton.textContent = "Full output";
    tabsContainer.appendChild(combinedButton);

    const finalButton = document.createElement("button");
    finalButton.type = "button";
    finalButton.className = "tab-button";
    finalButton.id = `followupStdoutTab${followupSessionCounter}`;
    finalButton.setAttribute("role", "tab");
    finalButton.setAttribute("aria-selected", "false");
    finalButton.setAttribute("aria-controls", `followupFinalOutput${followupSessionCounter}`);
    finalButton.tabIndex = -1;
    finalButton.textContent = "Final output";
    tabsContainer.appendChild(finalButton);

    sessionEl.appendChild(tabsContainer);

    const combinedOutput = document.createElement("div");
    combinedOutput.id = combinedOutputId;
    combinedOutput.className = "log-output";
    combinedOutput.setAttribute("role", "log");
    combinedOutput.setAttribute("aria-live", "polite");
    combinedOutput.setAttribute("aria-labelledby", outputLabelId);
    sessionEl.appendChild(combinedOutput);

    const finalOutput = document.createElement("div");
    finalOutput.id = `followupFinalOutput${followupSessionCounter}`;
    finalOutput.className = "log-output is-hidden";
    finalOutput.setAttribute("role", "log");
    finalOutput.setAttribute("aria-live", "polite");
    finalOutput.setAttribute("aria-labelledby", outputLabelId);
    sessionEl.appendChild(finalOutput);

    followupSectionEl.appendChild(sessionEl);

    const session = {
      index: followupSessionCounter,
      container: sessionEl,
      statusText: statusEl,
      promptPreview,
      combinedTabButton: combinedButton,
      finalTabButton: finalButton,
      outputTabsContainer: tabsContainer,
      outputLogEl: combinedOutput,
      finalLogEl: finalOutput,
      activeTab: "combined",
      outputValue: "",
      finalValue: "",
    };

    followupSessions.push(session);
    setFollowupSessionStatus(session, "running");
    combinedButton.addEventListener("click", () => {
      setFollowupActiveTab(session, "combined");
    });

    finalButton.addEventListener("click", () => {
      setFollowupActiveTab(session, "stdout");
    });

    setFollowupActiveTab(session, "combined");
    activeFollowupSession = session;
    return session;
  };

  const updateActiveFollowupFinalOutput = () => {
    if (!activeFollowupSession) {
      return;
    }

    activeFollowupSession.finalValue = typeof followupFinalOutputText === "string" ? followupFinalOutputText : "";
    if (activeFollowupSession.finalLogEl) {
      activeFollowupSession.finalLogEl.innerHTML = "";
      if (activeFollowupSession.finalValue) {
        appendLinesToElement(activeFollowupSession.finalLogEl, activeFollowupSession.finalValue, "output");
      } else if (followupRunActive) {
        appendLinesToElement(activeFollowupSession.finalLogEl, FINAL_OUTPUT_LOADING_MESSAGE, "status");
      }
    }

    if (activeFollowupSession.outputTabsContainer) {
      const hasFinalOutput = Boolean(activeFollowupSession.finalValue && activeFollowupSession.finalValue.trim());
      const shouldShowFinalOutput = hasFinalOutput || followupRunActive;
      activeFollowupSession.outputTabsContainer.classList.toggle("is-hidden", !shouldShowFinalOutput);
      if (!shouldShowFinalOutput && activeFollowupSession.activeTab === "stdout") {
        setFollowupActiveTab(activeFollowupSession, "combined");
      }
    }
  };

  const finalizeActiveFollowupSession = (state = "complete") => {
    if (!activeFollowupSession) {
      return;
    }

    setFollowupSessionStatus(activeFollowupSession, state);
    activeFollowupSession = null;
    followupRunActive = false;
  };
  const runsSidebarFilterInput = document.getElementById("runsSidebarFilter");
  const runsSidebarOpenRunsButton = document.getElementById("runsSidebarOpenRunsButton");
  const runsSidebarArchiveToggle = document.getElementById("runsSidebarArchiveToggle");
  const projectInfoButton = document.getElementById("projectInfo");
  const projectInfoText = document.getElementById("projectInfoText");
  let runsSidebarShowArchived = (new URLSearchParams(window.location.search).get('archived') === '1') || (window.location.pathname || '').endsWith('/archived');
  // Ensure the initial toggle element reflects the parsed state once it exists.
  const backToCurrentTasksLink = document.getElementById('backToCurrentTasksLink');
  const updateArchivedUI = () => {
    if (runsSidebarArchiveToggle) {
      runsSidebarArchiveToggle.setAttribute('aria-pressed', runsSidebarShowArchived ? 'true' : 'false');
    }
    if (backToCurrentTasksLink) {
      if (runsSidebarShowArchived) { backToCurrentTasksLink.classList.remove('is-hidden'); backToCurrentTasksLink.setAttribute('aria-hidden','false'); } else { backToCurrentTasksLink.classList.add('is-hidden'); backToCurrentTasksLink.setAttribute('aria-hidden','true'); }
    }
    // If the URL was /archived, normalize to /agent with query param so refresh keeps state
    try {
      const url = new URL(window.location.href);
      if ((window.location.pathname || '').endsWith('/archived')) {
        url.pathname = '/environment';
        url.searchParams.set('archived', runsSidebarShowArchived ? '1' : '0');
        window.history.replaceState({}, '', url.toString());
      } else {
        // keep query param in sync
        if (runsSidebarShowArchived) { url.searchParams.set('archived', '1'); } else { url.searchParams.delete('archived'); }
        window.history.replaceState({}, '', url.toString());
      }
    } catch(e) { /* ignore */ }
  };


  const runsSidebarNewTaskButton = document.getElementById("runsSidebarNewTaskButton");
  const collapsedNewTaskBtn = document.getElementById("collapsedNewTaskBtn");
  const runsSidebarRefreshButton = document.getElementById("runsSidebarRefreshButton");
  const promptPreviewEl = document.getElementById("userPromptPreview");
  const promptPreviewTextEl = document.getElementById("userPromptPreviewText");
  const promptModalEl = document.getElementById("promptModal");
  const promptModalTextarea = document.getElementById("promptModalTextarea");
  const promptModalCopyButton = document.getElementById("promptModalCopyButton");
  const promptModalCloseButton = document.getElementById("promptModalCloseButton");
  const switchBranchModal = document.getElementById("switchBranchModal");
  const switchBranchModalCloseButton = document.getElementById("switchBranchModalCloseButton");
  const switchBranchCreateButton = document.getElementById("switchBranchCreateButton");
  const branchSelect = document.getElementById("branchSelect");
  const switchBranchSubmitButton = document.getElementById("switchBranchSubmitButton");
  const switchBranchMessage = document.getElementById("switchBranchMessage");
  let runsSidebarRuns = [];
  let runsSidebarFilter = "";
  let runsSidebarIsLoading = false;
  let runsSidebarRefreshIntervalId = null;
  const RUNS_SIDEBAR_REFRESH_INTERVAL_MS = 2000;
  const RUNS_SIDEBAR_PAGE_SIZE = 20;
  let runsSidebarCurrentPage = 1;
  let runsSidebarTotalPages = 1;
  let runsSidebarFilteredRuns = [];
  let runsSidebarFilteredTotal = 0;
  let lastRunsSidebarProjectDir = "";
  let pythonTestEnabled = false;
  let lastUserPrompt = "";
  let promptModalPreviouslyFocusedElement = null;
  let activePromptPreviewEl = null;
  const collapsibleSections = [
    document.getElementById("pageTitle"),
    document.getElementById("pageDescription"),
    document.getElementById("defaultModelCard"),
    document.getElementById("modelField"),
    document.getElementById("projectDirField"),
    document.getElementById("agentInstructionsField"),
    fileTreeField,
    gitFpushField,
    document.getElementById("pythonTestField"),
    metaSection,
  ];
  const openRouterHeaderSection = document.getElementById("openRouterHeadersField");
  if (openRouterHeaderSection) {
    collapsibleSections.push(openRouterHeaderSection);
  }
  let fieldsHidden = true;

  const formatBranchDisplayName = (branchName) => {
    if (typeof branchName !== "string") {
      return "";
    }
    const trimmed = branchName.trim();
    if (!trimmed) {
      return "";
    }
    // Remove a leading alfe/ prefix (any case)
    const withoutPrefix = trimmed.replace(/^alfe\//i, '');
    const candidate = withoutPrefix.trim();
    // If the resulting branch name is purely numeric, prefix with '#'
    if (/^\d+$/.test(candidate)) {
      return `#${candidate}`;
    }
    return candidate || trimmed;
  };

  const resolveActiveRepoName = () => {
    const contextRepoName =
      currentRunContext && typeof currentRunContext.repoName === "string"
        ? currentRunContext.repoName.trim()
        : "";
    if (contextRepoName) {
      return contextRepoName;
    }
    const datasetRepoName =
      projectInfoButton && projectInfoButton.dataset && typeof projectInfoButton.dataset.repoName === "string"
        ? projectInfoButton.dataset.repoName.trim()
        : "";
    if (datasetRepoName) {
      return datasetRepoName;
    }
    if (repoNameEl && typeof repoNameEl.textContent === "string") {
      const candidate = repoNameEl.textContent.trim();
      if (candidate && candidate !== "Select a repository") {
        return candidate;
      }
    }
    return "";
  };

  const resolveActiveBranchName = () => {
    const datasetBranch =
      projectInfoButton && projectInfoButton.dataset && typeof projectInfoButton.dataset.branch === "string"
        ? projectInfoButton.dataset.branch.trim()
        : "";
    if (datasetBranch) {
      return datasetBranch;
    }
    const contextBranch =
      currentRunContext && typeof currentRunContext.repoBranchName === "string"
        ? currentRunContext.repoBranchName.trim()
        : "";
    if (contextBranch) {
      return contextBranch;
    }
    const runBranch =
      currentRunContext && typeof currentRunContext.branchName === "string"
        ? currentRunContext.branchName.trim()
        : "";
    return runBranch;
  };

  const resetSwitchBranchForm = () => {
    if (branchSelect) {
      branchSelect.innerHTML = "";
      branchSelect.disabled = false;
    }
    if (switchBranchMessage) {
      switchBranchMessage.textContent = "";
      switchBranchMessage.style.color = "";
    }
  };

  const closeSwitchBranchModal = () => {
    if (!switchBranchModal || switchBranchModal.classList.contains("is-hidden")) {
      return;
    }
    switchBranchModal.classList.add("is-hidden");
    document.body.style.overflow = "";
    if (projectInfoButton) {
      projectInfoButton.classList.remove("is-open");
      projectInfoButton.setAttribute("aria-expanded", "false");
    }
  };

  const openSwitchBranchModal = async () => {
    if (!switchBranchModal) {
      return;
    }
    switchBranchModal.classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
    if (projectInfoButton) {
      projectInfoButton.classList.add("is-open");
      projectInfoButton.setAttribute("aria-expanded", "true");
    }
    resetSwitchBranchForm();

    const repoName = resolveActiveRepoName();
    if (!repoName) {
      if (switchBranchMessage) {
        switchBranchMessage.textContent = "Select a repository to switch branches.";
        switchBranchMessage.style.color = "#fca5a5";
      }
      if (branchSelect) {
        branchSelect.disabled = true;
      }
      return;
    }

    if (switchBranchMessage) {
      switchBranchMessage.textContent = "Loading branches…";
      switchBranchMessage.style.color = "";
    }

    try {
      const response = await fetch(`/${encodeURIComponent(repoName)}/git_branches?refresh=1`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch branches (${response.status})`);
      }
      const data = await response.json().catch(() => ({}));
      if (!data || !Array.isArray(data.branches)) {
        throw new Error("Invalid branch data");
      }
      if (branchSelect) {
        branchSelect.innerHTML = "";
        const fragment = document.createDocumentFragment();
        data.branches.forEach((branch) => {
          if (typeof branch !== "string" || !branch.trim()) {
            return;
          }
          const option = document.createElement("option");
          option.value = branch;
          option.textContent = formatBranchDisplayName(branch) || branch;
          fragment.appendChild(option);
        });
        branchSelect.appendChild(fragment);
        const currentBranch = resolveActiveBranchName();
        if (currentBranch) {
          const matchingOption = Array.from(branchSelect.options).find(
            (option) => option.value === currentBranch,
          );
          if (matchingOption) {
            branchSelect.value = matchingOption.value;
          }
        }
        if (!branchSelect.options.length) {
          branchSelect.disabled = true;
          if (switchBranchMessage) {
            switchBranchMessage.textContent = "No branches available.";
          }
        } else if (switchBranchMessage) {
          switchBranchMessage.textContent = "";
        }
      }
    } catch (error) {
      console.error("[Codex Runner] Failed to load branches:", error);
      if (switchBranchMessage) {
        switchBranchMessage.textContent = "Unable to load branches.";
        switchBranchMessage.style.color = "#fca5a5";
      }
      if (branchSelect) {
        branchSelect.disabled = true;
      }
    }
  };


  const extractBranchFromRun = (run) => {
    if (!run || typeof run !== "object") {
      return "";
    }
    const candidate =
      (typeof run.branchName === "string" && run.branchName)
      || (typeof run.gitBranch === "string" && run.gitBranch)
      || (typeof run.branch === "string" && run.branch)
      || "";
    return candidate ? candidate.toString().trim() : "";
  };

  const resolveParentFromBranchesIframe = (branchName) => {
    try {
      if (!branchesIframe || !branchesIframe.contentWindow) return '';
      const iframeWin = branchesIframe.contentWindow;
      const data = iframeWin && iframeWin.__GIT_TREE_DATA__ ? iframeWin.__GIT_TREE_DATA__ : null;
      if (!data || !Array.isArray(data.gitBranches)) return '';
      const buildLookupVariants = (value) => {
        const variants = new Set();
        if (typeof value !== 'string') {
          return variants;
        }
        const addVariant = (candidate) => {
          if (typeof candidate !== 'string') {
            return;
          }
          const trimmed = candidate.trim();
          if (trimmed) {
            variants.add(trimmed.toLowerCase());
          }
        };
        const trimmed = value.trim();
        if (!trimmed) {
          return variants;
        }
        addVariant(trimmed);
        const withoutPrefix = trimmed.replace(/^alfe\//i, '');
        addVariant(withoutPrefix);
        const withoutHash = withoutPrefix.replace(/^#/, '');
        if (withoutHash !== withoutPrefix) {
          addVariant(withoutHash);
        }
        addVariant(`alfe/${withoutHash}`);
        addVariant(`#${withoutHash}`);
        const formatted = formatBranchDisplayName(trimmed);
        addVariant(formatted);
        if (formatted.startsWith('#')) {
          const numeric = formatted.slice(1);
          addVariant(numeric);
          addVariant(`alfe/${numeric}`);
        }
        return variants;
      };

      const targetVariants = buildLookupVariants(branchName);
      if (!targetVariants.size) {
        return '';
      }

      for (const branch of data.gitBranches) {
        if (!branch || !branch.name) {
          continue;
        }
        const branchVariants = buildLookupVariants(branch.name);
        let intersects = false;
        for (const variant of branchVariants) {
          if (targetVariants.has(variant)) {
            intersects = true;
            break;
          }
        }
        if (intersects && branch.sterlingParent) {
          return branch.sterlingParent;
        }
      }
    } catch (e) {
      // ignore cross-origin or access errors
    }
    return '';
  };

  const repoBranchHistoryByDir = new Map();

  const rememberRepoBranchHistory = (dirKey, options = {}) => {
    const { branchName, primaryBranch } = options || {};
    const normalizedKey = typeof dirKey === "string" ? dirKey.trim() : "";
    if (!normalizedKey) {
      return;
    }
    const nextEntry = repoBranchHistoryByDir.get(normalizedKey) || { branchName: "", primaryBranch: "" };
    if (typeof branchName === "string" && branchName.trim()) {
      nextEntry.branchName = branchName.trim();
    }
    if (typeof primaryBranch === "string" && primaryBranch.trim()) {
      nextEntry.primaryBranch = primaryBranch.trim();
    }
    if (nextEntry.branchName || nextEntry.primaryBranch) {
      repoBranchHistoryByDir.set(normalizedKey, nextEntry);
    }
  };

  const forgetRepoBranchHistory = (dirKey) => {
    const normalizedKey = typeof dirKey === "string" ? dirKey.trim() : "";
    if (!normalizedKey) {
      return;
    }
    repoBranchHistoryByDir.delete(normalizedKey);
  };

  const getRepoBranchHistoryForDir = (dirKey) => {
    const normalizedKey = typeof dirKey === "string" ? dirKey.trim() : "";
    if (!normalizedKey) {
      return { branchName: "", primaryBranch: "" };
    }
    return repoBranchHistoryByDir.get(normalizedKey) || { branchName: "", primaryBranch: "" };
  };

  const updateProjectInfoBranch = (branchValue, options = {}) => {
    if (!projectInfoButton || !projectInfoText) {
      return;
    }

    const {
      actualBranch = "",
      fallbackBranch = "",
      childBranch = "",
      childLabel = "",
    } = options || {};

    const normalizedActual = typeof actualBranch === "string" ? actualBranch.trim() : "";
    const normalizedFallback = typeof fallbackBranch === "string" ? fallbackBranch.trim() : "";
    const normalizedChildOption = typeof childBranch === "string" ? childBranch.trim() : "";
    const normalizedChildLabelOption = typeof childLabel === "string" ? childLabel.trim() : "";

    let normalized = typeof branchValue === "string" ? branchValue.trim() : "";
    if (!normalized && normalizedFallback) {
      normalized = normalizedFallback;
    }

    let displayBranchCandidate = normalized;
    const numericTarget = formatBranchDisplayName(
      displayBranchCandidate
      || normalizedActual
      || normalizedFallback
      || normalizedChildOption,
    );
    const looksLikeNumeric = Boolean(numericTarget)
      && (/^#?\d+$/.test(numericTarget) || /^alfe\/(\d+)$/i.test(numericTarget));
    if (looksLikeNumeric) {
      const lookupValue = normalizedActual || normalized || normalizedFallback || normalizedChildOption;
      if (lookupValue) {
        const parent = resolveParentFromBranchesIframe(lookupValue);
        if (parent) {
          displayBranchCandidate = parent;
        }
      }
    }

    let normalizedChild = "";
    let normalizedChildLabel = "";
    if (normalizedChildOption) {
      normalizedChild = normalizedChildOption;
      normalizedChildLabel = normalizedChildLabelOption || "run";
    } else if (normalizedActual && displayBranchCandidate && normalizedActual !== displayBranchCandidate) {
      normalizedChild = normalizedActual;
      normalizedChildLabel = normalizedChildLabelOption || "current";
    }

    if (normalizedChild) {
      projectInfoButton.dataset.branchChild = normalizedChild;
      if (normalizedChildLabel) {
        projectInfoButton.dataset.branchChildLabel = normalizedChildLabel;
      } else {
        delete projectInfoButton.dataset.branchChildLabel;
      }
    } else {
      delete projectInfoButton.dataset.branchChild;
      delete projectInfoButton.dataset.branchChildLabel;
    }

    const displayName = formatBranchDisplayName(displayBranchCandidate);
    const childDisplayName = normalizedChild ? formatBranchDisplayName(normalizedChild) : "";
    const childLabelDisplay = childDisplayName ? (normalizedChildLabel || "current") : "";
    if (displayName) {
      projectInfoText.textContent = `Branch: ${displayName}`;
    } else {
      projectInfoText.textContent = "Branch";
    }
    projectInfoButton.setAttribute("aria-label", "Open branch menu");
    projectInfoButton.title = "Open branch menu";

    const datasetValue = normalizedActual || normalized || normalizedFallback || "";
    if (datasetValue) {
      projectInfoButton.dataset.branch = datasetValue;
    } else {
      delete projectInfoButton.dataset.branch;
    }

    if (normalized && normalized !== datasetValue) {
      projectInfoButton.dataset.branchDisplay = normalized;
    } else {
      delete projectInfoButton.dataset.branchDisplay;
    }

    if (normalizedFallback && normalizedFallback !== datasetValue && normalizedFallback !== normalized) {
      projectInfoButton.dataset.branchPrimary = normalizedFallback;
    } else if (normalizedFallback && !normalized) {
      projectInfoButton.dataset.branchPrimary = normalizedFallback;
    } else {
      delete projectInfoButton.dataset.branchPrimary;
    }
  };


  const shouldDisplayMeta = () => !fieldsHidden;

  const updateMetaVisibility = (hidden) => {
    const target = document.body;
    if (!target) {
      return;
    }
    target.classList.toggle("codex-hide-meta", hidden);
  };

  const updateFieldsVisibility = (hidden) => {
    collapsibleSections.forEach((section) => {
      if (!section) {
        return;
      }
      section.classList.toggle("is-hidden", hidden);
    });
    updateMetaVisibility(hidden);
    if (toggleFieldsButton) {
      toggleFieldsButton.setAttribute("aria-pressed", hidden ? "true" : "false");
    }
  };

  updateFieldsVisibility(fieldsHidden);

  if (toggleFieldsButton) {
    toggleFieldsButton.addEventListener("click", () => {
      fieldsHidden = !fieldsHidden;
      updateFieldsVisibility(fieldsHidden);
    });
  }

  const sanitisePromptText = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(/\r/g, "");
  };

  const closePromptModal = () => {
    if (!promptModalEl) {
      return;
    }
    if (promptModalEl.classList.contains("is-hidden")) {
      return;
    }
    promptModalEl.classList.add("is-hidden");
    const previewTarget = activePromptPreviewEl || promptPreviewEl;
    if (previewTarget) {
      previewTarget.setAttribute("aria-expanded", "false");
    }
    if (promptModalTextarea) {
      try {
        promptModalTextarea.blur();
      } catch (_err) {
        /* ignore */
      }
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.style.overflow = "";
    }

    const focusTarget = promptModalPreviouslyFocusedElement
      && typeof promptModalPreviouslyFocusedElement.focus === "function"
      ? promptModalPreviouslyFocusedElement
      : null;
    promptModalPreviouslyFocusedElement = null;
    if (focusTarget) {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (_error) {
        focusTarget.focus();
      }
      activePromptPreviewEl = null;
      return;
    }
    if (previewTarget && !previewTarget.classList.contains("is-hidden")) {
      try {
        previewTarget.focus({ preventScroll: true });
      } catch (_err) {
        previewTarget.focus();
      }
    }
    activePromptPreviewEl = null;
  };

  const openPromptModal = (promptText, triggerEl) => {
    const normalised = sanitisePromptText(promptText);
    const trimmed = normalised.trim();
    if (!promptModalEl || !promptModalTextarea || !trimmed) {
      return;
    }
    if (typeof document !== "undefined") {
      const active = triggerEl || document.activeElement;
      if (active && typeof active.focus === "function") {
        promptModalPreviouslyFocusedElement = active;
      } else {
        promptModalPreviouslyFocusedElement = null;
      }
    }
    activePromptPreviewEl = triggerEl || promptPreviewEl || null;
    promptModalTextarea.value = trimmed;
    promptModalTextarea.scrollTop = 0;
    promptModalEl.classList.remove("is-hidden");
    if (activePromptPreviewEl) {
      activePromptPreviewEl.setAttribute("aria-expanded", "true");
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.style.overflow = "hidden";
    }
    window.setTimeout(() => {
      try {
        promptModalTextarea.focus({ preventScroll: true });
        promptModalTextarea.setSelectionRange(0, 0);
      } catch (_err) {
        try {
          promptModalTextarea.focus();
        } catch (_focusErr) {
          /* ignore */
        }
      }
    }, 0);
  };

  const updatePromptPreview = (rawPrompt) => {
    const normalised = sanitisePromptText(rawPrompt);
    const trimmed = normalised.trim();
    lastUserPrompt = trimmed;

    if (!promptPreviewEl || !promptPreviewTextEl) {
      if (promptModalTextarea) {
        promptModalTextarea.value = trimmed;
      }
      if (!trimmed) {
        closePromptModal();
      }
      return;
    }

    if (!trimmed) {
      promptPreviewEl.classList.add("is-hidden");
      promptPreviewEl.setAttribute("aria-hidden", "true");
      promptPreviewEl.setAttribute("aria-expanded", "false");
      promptPreviewEl.removeAttribute("title");
      promptPreviewEl.removeAttribute("aria-label");
      promptPreviewTextEl.textContent = "";
      if (promptModalTextarea) {
        promptModalTextarea.value = "";
      }
      closePromptModal();
      return;
    }

    const firstLine = trimmed.split(/\r?\n/, 1)[0] || trimmed;
    const truncatedFirstLine = firstLine.length > 200 ? `${firstLine.slice(0, 197)}…` : firstLine;
    promptPreviewTextEl.textContent = truncatedFirstLine;
    promptPreviewEl.classList.remove("is-hidden");
    promptPreviewEl.setAttribute("aria-hidden", "false");
    const labelPreview = truncatedFirstLine || "View full prompt";
    promptPreviewEl.setAttribute("aria-label", `View full prompt: ${labelPreview}`);
    promptPreviewEl.setAttribute("title", "Click to view full prompt");
    if (promptModalTextarea) {
      promptModalTextarea.value = trimmed;
      promptModalTextarea.scrollTop = 0;
    }
  };

  if (promptPreviewEl) {
    promptPreviewEl.addEventListener("click", () => {
      if (!lastUserPrompt) {
        return;
      }
      openPromptModal(lastUserPrompt, promptPreviewEl);
    });
    promptPreviewEl.addEventListener("keydown", (event) => {
      if (!lastUserPrompt) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPromptModal(lastUserPrompt, promptPreviewEl);
      }
    });
  }

  if (promptModalEl) {
    promptModalEl.addEventListener("click", (event) => {
      if (event.target === promptModalEl) {
        closePromptModal();
      }
    });
  }

  if (promptModalCopyButton) {
    promptModalCopyButton.addEventListener('click', () => {
      try {
        if (promptModalTextarea) {
          navigator.clipboard.writeText(promptModalTextarea.value);
          // provide simple feedback by changing button text briefly
          const prev = promptModalCopyButton.textContent;
          promptModalCopyButton.textContent = '✓';
          setTimeout(() => { promptModalCopyButton.textContent = '\u2398'; }, 1200);
        }
      } catch (e) {
        // fallback: select and execCopy
        try {
          if (promptModalTextarea) {
            promptModalTextarea.select();
            document.execCommand('copy');
          }
        } catch(e){}
      }
    });
  }

  if (promptModalCloseButton) {
    promptModalCloseButton.addEventListener("click", () => {
      closePromptModal();
    });
  }

  if (projectInfoButton && switchBranchModal) {
    projectInfoButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openSwitchBranchModal();
    });
  }

  if (switchBranchModalCloseButton) {
    switchBranchModalCloseButton.addEventListener("click", (event) => {
      event.stopPropagation();
      closeSwitchBranchModal();
    });
  }

  if (switchBranchModal) {
    switchBranchModal.addEventListener("click", (event) => {
      if (event.target === switchBranchModal) {
        closeSwitchBranchModal();
      }
    });
  }

  if (switchBranchCreateButton) {
    switchBranchCreateButton.addEventListener("click", async () => {
      const repoName = resolveActiveRepoName();
      if (!repoName) {
        if (switchBranchMessage) {
          switchBranchMessage.textContent = "Select a repository to create a branch.";
          switchBranchMessage.style.color = "#fca5a5";
        }
        return;
      }
      const newBranchName = window.prompt("Enter a new branch name:");
      if (!newBranchName || !newBranchName.trim()) {
        return;
      }
      if (switchBranchMessage) {
        switchBranchMessage.textContent = "Creating branch…";
        switchBranchMessage.style.color = "";
      }
      try {
        const response = await fetch(`/${encodeURIComponent(repoName)}/git_switch_branch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            createNew: true,
            branchName: "",
            newBranchName: newBranchName.trim(),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || (data && data.error)) {
          const errorMessage = data && data.error ? data.error : "Failed to create branch.";
          if (switchBranchMessage) {
            switchBranchMessage.textContent = errorMessage;
            switchBranchMessage.style.color = "#fca5a5";
          }
          return;
        }
        if (switchBranchMessage) {
          switchBranchMessage.textContent = "Branch created successfully.";
          switchBranchMessage.style.color = "#34d399";
        }
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error) {
        console.error("[Codex Runner] Branch create failed:", error);
        if (switchBranchMessage) {
          switchBranchMessage.textContent = "Error creating branch.";
          switchBranchMessage.style.color = "#fca5a5";
        }
      }
    });
  }

  if (switchBranchSubmitButton) {
    switchBranchSubmitButton.addEventListener("click", async () => {
      const repoName = resolveActiveRepoName();
      if (!repoName) {
        if (switchBranchMessage) {
          switchBranchMessage.textContent = "Select a repository to switch branches.";
          switchBranchMessage.style.color = "#fca5a5";
        }
        return;
      }

      const selectedBranch = branchSelect && typeof branchSelect.value === "string"
        ? branchSelect.value.trim()
        : "";

      if (!selectedBranch) {
        if (switchBranchMessage) {
          switchBranchMessage.textContent = "Select a branch to switch.";
          switchBranchMessage.style.color = "#fca5a5";
        }
        return;
      }

      if (switchBranchMessage) {
        switchBranchMessage.textContent = "Switching branches…";
        switchBranchMessage.style.color = "";
      }

      try {
        const response = await fetch(`/${encodeURIComponent(repoName)}/git_switch_branch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            createNew: false,
            branchName: selectedBranch,
            newBranchName: "",
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || (data && data.error)) {
          const errorMessage = data && data.error ? data.error : "Failed to switch branch.";
          if (switchBranchMessage) {
            switchBranchMessage.textContent = errorMessage;
            switchBranchMessage.style.color = "#fca5a5";
          }
          return;
        }
        if (switchBranchMessage) {
          switchBranchMessage.textContent = "Branch switched successfully.";
          switchBranchMessage.style.color = "#34d399";
        }
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error) {
        console.error("[Codex Runner] Branch switch failed:", error);
        if (switchBranchMessage) {
          switchBranchMessage.textContent = "Error switching branch.";
          switchBranchMessage.style.color = "#fca5a5";
        }
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (promptModalEl && !promptModalEl.classList.contains("is-hidden")) {
      closePromptModal();
      return;
    }
    if (switchBranchModal && !switchBranchModal.classList.contains("is-hidden")) {
      closeSwitchBranchModal();
    }
  });

  if (promptInput && typeof promptInput.value === "string" && promptInput.value.trim()) {
    updatePromptPreview(promptInput.value);
  }
  let currentFileTree = "";
  let currentFileTreeProjectDir = "";
  let lastFileTreeWasTruncated = false;
  let fileTreeFetchAbortController = null;
  let fileTreeFetchTimeoutId = null;
  let sendFileTreeEnabled = false;
  let gitFpushEnabled = true;
  let lastFileTreeStatusMessage = "";
  let lastFileTreeStatusVariant = "info";
  const SNAPSHOT_MARKER = "__STERLING_SNAPSHOT_DIR__=";
  let currentSnapshotProjectDir = "";
  let mergeReady = false;
  let mergeInFlight = false;
  let runControlsDisabled = false;
  let runInFlight = false;
  let awaitingGitFpushCompletion = false;
  let pythonTestInFlight = false;
  let gitFpushActive = false;
  let gitFpushDetectedChanges = false;
  let gitFpushDetectedNoChanges = false;
  let gitFpushOutputSection = "";
  let gitFpushCommitRevision = "";
  let gitFpushLogCaptureActive = false;
  let mergeDiffLockedAfterMerge = false;
  let autoOpenMergeDiffOnEnable = false;
  let hydratingRunFromHistory = false;
  let pendingGitFpushHash = "";
  let pendingGitFpushHashProjectDir = "";
  let pendingGitFpushBranch = "";
  let pendingGitFpushBranchProjectDir = "";

  const refreshRunsSidebarDisabledState = () => {
    if (!runsSidebarListEl) {
      return;
    }
    const items = runsSidebarListEl.querySelectorAll("[data-run-id]");
    items.forEach((item) => {
      const element = item;
      element.classList.remove("is-disabled");
      element.setAttribute("aria-disabled", "false");
    });
  };

  const setRunControlsDisabledState = (disabled, options = {}) => {
    const next = Boolean(disabled);
    if (runControlsDisabled === next && !options.forceRefresh) {
      return;
    }
    runControlsDisabled = next;
    refreshRunsSidebarDisabledState();
  };

  const markGitFpushPhaseComplete = () => {
    awaitingGitFpushCompletion = false;
    // Ensure run controls are refreshed when git_fpush completes.
    // Use forceRefresh to make sure UI updates even if runInFlight hasn't updated yet.
    setRunControlsDisabledState(false, { forceRefresh: true });
    // Re-apply merge button state in case merge readiness changed while run controls were disabled.
    try { applyMergeButtonState(); } catch (e) { /* ignore */ }
  };

  const MERGE_DISABLED_TOOLTIP_TEXT =
    "Merge is available after<br />agent finishes running.";

  let mergeTooltipPinned = false;
  let currentMergeDisabledReason = null;

  const setMergeTooltipVisibility = (visible) => {
    if (!mergeButtonWrapper || !mergeDisabledTooltip) {
      return;
    }
    mergeButtonWrapper.classList.toggle("is-tooltip-visible", !!visible);
    mergeDisabledTooltip.setAttribute(
      "aria-hidden",
      visible ? "false" : "true"
    );
  };

  const setMergeTooltipContent = (htmlContent) => {
    if (!mergeDisabledTooltip) {
      return;
    }
    if (htmlContent) {
      mergeDisabledTooltip.innerHTML = htmlContent;
    } else {
      mergeDisabledTooltip.innerHTML = "";
    }
  };

  const syncMergeTooltipAvailability = (isDisabled, reason = null) => {
    if (!mergeButtonWrapper) {
      currentMergeDisabledReason = null;
      return;
    }
    mergeButtonWrapper.classList.toggle("is-merge-disabled", !!isDisabled);
    currentMergeDisabledReason = isDisabled ? reason || null : null;
    if (!isDisabled) {
      mergeTooltipPinned = false;
      setMergeTooltipVisibility(false);
      setMergeTooltipContent("");
      return;
    }

    if (currentMergeDisabledReason === "in-flight") {
      mergeTooltipPinned = false;
      setMergeTooltipVisibility(false);
      setMergeTooltipContent("");
      return;
    }

    setMergeTooltipContent(MERGE_DISABLED_TOOLTIP_TEXT);
    setMergeTooltipVisibility(mergeTooltipPinned);
  };

  if (mergeButtonWrapper && mergeDisabledTooltip) {
    mergeButtonWrapper.addEventListener("pointerenter", () => {
      if (
        mergeTooltipPinned ||
        !mergeButton ||
        !mergeButton.disabled ||
        currentMergeDisabledReason === "in-flight"
      ) {
        return;
      }
      setMergeTooltipVisibility(true);
    });

    mergeButtonWrapper.addEventListener("pointerleave", () => {
      if (!mergeButton) {
        return;
      }

      if (mergeTooltipPinned) {
        mergeTooltipPinned = false;
      }

      if (!mergeButton.disabled) {
        setMergeTooltipVisibility(false);
        return;
      }

      setMergeTooltipVisibility(false);
    });

    mergeButtonWrapper.addEventListener("click", (event) => {
      if (!mergeButton || !mergeButton.disabled) {
        mergeTooltipPinned = false;
        return;
      }
      if (currentMergeDisabledReason === "in-flight") {
        mergeTooltipPinned = false;
        setMergeTooltipVisibility(false);
        return;
      }
      mergeTooltipPinned = !mergeTooltipPinned;
      setMergeTooltipVisibility(mergeTooltipPinned);
      if (mergeTooltipPinned) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    document.addEventListener("click", (event) => {
      if (
        !mergeTooltipPinned ||
        !mergeButtonWrapper ||
        mergeButtonWrapper.contains(event.target)
      ) {
        return;
      }
      mergeTooltipPinned = false;
      setMergeTooltipVisibility(false);
    });
  }

  if (mergeButton) {
    syncMergeTooltipAvailability(
      mergeButton.disabled,
      mergeButton.disabled ? "not-ready" : null,
    );
  }

  const updatePythonTestResult = (message, variant = "info") => {
    if (!pythonTestResult) {
      return;
    }
    const safeMessage = typeof message === "string" ? message : String(message ?? "");
    pythonTestResult.textContent = safeMessage;
    pythonTestResult.classList.remove("success", "error");
    if (variant === "success") {
      pythonTestResult.classList.add("success");
    } else if (variant === "error") {
      pythonTestResult.classList.add("error");
    }
  };


  const updatePythonTestToggleButton = () => {
    if (!pythonTestToggleButton) { return; }
    pythonTestToggleButton.classList.toggle('is-active', pythonTestEnabled);
    pythonTestToggleButton.setAttribute('aria-pressed', pythonTestEnabled ? 'true' : 'false');
    pythonTestToggleButton.textContent = pythonTestEnabled ? 'Disable python command test' : 'Enable python command test';
    pythonTestToggleButton.setAttribute('aria-label', pythonTestEnabled ? 'Disable python command test' : 'Enable python command test');
    pythonTestToggleButton.title = pythonTestEnabled ? 'Python command test enabled' : 'Python command test disabled';
  };

  if (pythonTestToggleButton) {
    updatePythonTestToggleButton();
    pythonTestToggleButton.addEventListener('click', () => {
      pythonTestEnabled = !pythonTestEnabled;
      updatePythonTestToggleButton();
      // enable/disable the test button accordingly
      if (testPythonButton) {
        testPythonButton.disabled = !pythonTestEnabled || runControlsDisabled || pythonTestInFlight;
        testPythonButton.setAttribute('aria-disabled', testPythonButton.disabled ? 'true' : 'false');
      }
    });
  }
  const updateTestPythonButtonState = () => {
    if (!testPythonButton) {
      return;
    }
    const shouldDisable = runControlsDisabled || pythonTestInFlight || !pythonTestEnabled;
    testPythonButton.disabled = shouldDisable;
    testPythonButton.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
    if (shouldDisable && pythonTestInFlight) {
      testPythonButton.setAttribute("aria-busy", "true");
    } else {
      testPythonButton.removeAttribute("aria-busy");
    }
  };

  updateTestPythonButtonState();
  updatePythonTestResult("", "info");

  const normaliseProjectDir = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    const firstLine = value.split(/\r?\n/, 1)[0];
    const withoutMarkdownStatus = firstLine.replace(/\s+\*\*.*$/, "");
    return withoutMarkdownStatus.trim();
  };

  const projectMetaCache = new Map();
  const projectMetaLastFetch = new Map();
  const pendingProjectMetaRequests = new Map();
  const PROJECT_META_FORCE_REFRESH_INTERVAL_MS = 5000;

  const buildComparableProjectDir = (value) => {
    const trimmed = normaliseProjectDir(value);
    if (!trimmed) {
      return {
        trimmed: "",
        canonical: "",
        segments: [],
        normalizedSegments: [],
        canonicalKey: "",
        lookupKeys: [],
      };
    }

    const canonical = trimmed.replace(/\+/g, "/").replace(/\/+/g, "/");
    const segments = canonical
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (!segments.length) {
      return {
        trimmed,
        canonical: "",
        segments: [],
        normalizedSegments: [],
        canonicalKey: "",
        lookupKeys: [],
      };
    }

    const normalizedSegments = segments.map((segment) => segment.toLowerCase());
    const lookupKeys = [];
    for (let length = normalizedSegments.length; length >= 1; length -= 1) {
      const key = normalizedSegments
        .slice(normalizedSegments.length - length)
        .join("/");
      if (key && !lookupKeys.includes(key)) {
        lookupKeys.push(key);
      }
    }
    const canonicalKeySegments = normalizedSegments.length >= 2
      ? normalizedSegments.slice(normalizedSegments.length - 2)
      : normalizedSegments;
    const canonicalKeyCandidate = canonicalKeySegments.join("/");
    const canonicalKey = canonicalKeyCandidate || (lookupKeys.length ? lookupKeys[0] : "");

    return {
      trimmed,
      canonical: segments.join("/"),
      segments,
      normalizedSegments,
      canonicalKey,
      lookupKeys,
    };
  };

  const cacheProjectMetaForInfos = (metaValue, fetchTimestamp, ...infos) => {
    infos.forEach((info) => {
      if (!info || !info.lookupKeys || !info.lookupKeys.length) {
        return;
      }
      info.lookupKeys.forEach((key) => {
        if (!key) { return; }
        projectMetaCache.set(key, metaValue);
        projectMetaLastFetch.set(key, fetchTimestamp);
      });
    });
  };

  const getCachedProjectMetaForInfo = (info) => {
    if (!info || !info.lookupKeys || !info.lookupKeys.length) {
      return { key: "", value: undefined };
    }
    for (const key of info.lookupKeys) {
      if (!key) { continue; }
      if (projectMetaCache.has(key)) {
        return { key, value: projectMetaCache.get(key) };
      }
    }
    return { key: "", value: undefined };
  };

  const getLastFetchForInfo = (info) => {
    if (!info || !info.lookupKeys || !info.lookupKeys.length) {
      return 0;
    }
    let latest = 0;
    info.lookupKeys.forEach((key) => {
      if (!key) { return; }
      const timestamp = projectMetaLastFetch.get(key) || 0;
      if (timestamp > latest) {
        latest = timestamp;
      }
    });
    return latest;
  };

  const areProjectDirsEquivalent = (dirA, dirB) => {
    const infoA = buildComparableProjectDir(dirA);
    const infoB = buildComparableProjectDir(dirB);
    if (!infoA.canonicalKey && !infoB.canonicalKey) {
      return true;
    }
    if (!infoA.canonicalKey || !infoB.canonicalKey) {
      return false;
    }
    if (infoA.canonicalKey === infoB.canonicalKey) {
      return true;
    }
    if (!infoA.normalizedSegments.length || !infoB.normalizedSegments.length) {
      return false;
    }
    const shorterSegments =
      infoA.normalizedSegments.length <= infoB.normalizedSegments.length
        ? infoA.normalizedSegments
        : infoB.normalizedSegments;
    const longerSegments =
      shorterSegments === infoA.normalizedSegments
        ? infoB.normalizedSegments
        : infoA.normalizedSegments;
    for (let index = 1; index <= shorterSegments.length; index += 1) {
      const segA = shorterSegments[shorterSegments.length - index];
      const segB = longerSegments[longerSegments.length - index];
      if (!segA || !segB || segA !== segB) {
        return false;
      }
    }
    return true;
  };

  const pickCanonicalProjectDir = (preferred, fallback) => {
    const preferredInfo = buildComparableProjectDir(preferred);
    if (preferredInfo.canonicalKey) {
      return preferredInfo.canonicalKey;
    }
    const fallbackInfo = buildComparableProjectDir(fallback);
    return fallbackInfo.canonicalKey;
  };

  function buildRunContext({ projectDir, runId, effectiveProjectDir, branchName }) {
    const normalizedProjectDirInfo = buildComparableProjectDir(
      effectiveProjectDir || projectDir || "",
    );
    const normalizedProjectDir = normalizedProjectDirInfo.canonicalKey;
    const previousContext =
      currentRunContext && typeof currentRunContext === "object"
        ? currentRunContext
        : null;
    const shouldCarryRepoMeta =
      previousContext
      && normalizedProjectDir
      && previousContext.repoBranchDir
      && areProjectDirsEquivalent(previousContext.repoBranchDir, normalizedProjectDir);

    return {
      projectDir,
      runId,
      effectiveProjectDir,
      branchName,
      repoBranchName: shouldCarryRepoMeta ? previousContext.repoBranchName || "" : "",
      repoBranchDir: shouldCarryRepoMeta
        ? pickCanonicalProjectDir(previousContext.repoBranchDir, normalizedProjectDir)
        : "",
      repoPrimaryBranch: shouldCarryRepoMeta ? previousContext.repoPrimaryBranch || "" : "",
      repoLocalPath: shouldCarryRepoMeta ? previousContext.repoLocalPath || "" : "",
      repoName: shouldCarryRepoMeta ? previousContext.repoName || "" : "",
      repoIsDemo: shouldCarryRepoMeta ? !!previousContext.repoIsDemo : false,
    };
  }

  function buildProjectMetaUrl(projectDirValue) {
    const params = new URLSearchParams();
    const normalisedDir = normaliseProjectDir(projectDirValue);
    if (normalisedDir) {
      params.set("projectDir", normalisedDir);
    }
    if (currentSessionId) {
      params.set("sessionId", currentSessionId);
    }
    const query = params.toString();
    return `/agent/project-meta${query ? `?${query}` : ""}`;
  }

  function clearRepoBranchForDir(normalisedDir) {
    if (!currentRunContext || typeof currentRunContext !== "object") {
      return;
    }
    const contextDirInfo = buildComparableProjectDir(
      currentRunContext.effectiveProjectDir || currentRunContext.projectDir || "",
    );
    const contextDir = contextDirInfo.canonicalKey;
    const targetDirInfo = buildComparableProjectDir(normalisedDir);
    const targetDir = targetDirInfo.canonicalKey;
    if (contextDir && targetDir && !areProjectDirsEquivalent(contextDir, targetDir)) {
      return;
    }
    if (
      !currentRunContext.repoBranchName
      && !currentRunContext.repoBranchDir
      && !currentRunContext.repoPrimaryBranch
    ) {
      return;
    }
    currentRunContext.repoBranchName = "";
    currentRunContext.repoPrimaryBranch = "";
    currentRunContext.repoBranchDir = targetDir || contextDir || "";
    currentRunContext.repoLocalPath = "";
    forgetRepoBranchHistory(targetDir || contextDir || targetDirInfo.trimmed || "");
    if (typeof refreshProjectInfoBranchDisplay === "function") {
      refreshProjectInfoBranchDisplay();
    }
  }

  function applyProjectMetaToContext(meta, projectDirValue) {
    if (!currentRunContext || typeof currentRunContext !== "object") {
      return;
    }

    const targetCandidates = [
      projectDirValue,
      meta && meta.resolvedProjectDir,
      meta && meta.projectDir,
    ];
    let normalizedTargetInfo = {
      trimmed: "",
      canonical: "",
      segments: [],
      normalizedSegments: [],
      canonicalKey: "",
      lookupKeys: [],
    };
    for (const candidate of targetCandidates) {
      if (!candidate && candidate !== "") {
        continue;
      }
      const info = buildComparableProjectDir(candidate);
      if (info.canonicalKey) {
        normalizedTargetInfo = info;
        break;
      }
    }
    const normalizedTargetDir = normalizedTargetInfo.canonicalKey;

    if (!normalizedTargetDir) {
      clearRepoBranchForDir("");
      return;
    }

    const contextDirInfo = buildComparableProjectDir(
      currentRunContext.effectiveProjectDir || currentRunContext.projectDir || "",
    );
    const contextDir = contextDirInfo.canonicalKey;
    if (contextDir && normalizedTargetDir && !areProjectDirsEquivalent(contextDir, normalizedTargetDir)) {
      return;
    }

    const resolvedRepoDir = pickCanonicalProjectDir(contextDir, normalizedTargetDir);
    const branchName = meta && typeof meta.branchName === "string"
      ? meta.branchName.trim()
      : "";
    const configBranch = meta && typeof meta.repoConfigBranch === "string"
      ? meta.repoConfigBranch.trim()
      : "";
    const existingPrimaryBranch = currentRunContext && typeof currentRunContext.repoPrimaryBranch === "string"
      ? currentRunContext.repoPrimaryBranch.trim()
      : "";

    if (branchName) {
      currentRunContext.repoBranchName = branchName;
    } else if (
      currentRunContext.repoBranchDir
      && areProjectDirsEquivalent(currentRunContext.repoBranchDir, normalizedTargetDir)
    ) {
      currentRunContext.repoBranchName = "";
    }

    if (configBranch) {
      currentRunContext.repoPrimaryBranch = configBranch;
    } else if (!existingPrimaryBranch && branchName) {
      currentRunContext.repoPrimaryBranch = branchName;
    } else if (
      !configBranch
      && !branchName
      && currentRunContext.repoBranchDir
      && areProjectDirsEquivalent(currentRunContext.repoBranchDir, normalizedTargetDir)
    ) {
      currentRunContext.repoPrimaryBranch = "";
    }

    if (resolvedRepoDir) {
      currentRunContext.repoBranchDir = resolvedRepoDir;
    }

    const repoLocalPath = meta && typeof meta.gitRepoLocalPath === "string"
      ? normaliseProjectDir(meta.gitRepoLocalPath)
      : "";
    currentRunContext.repoLocalPath = repoLocalPath;

    const historyDirKey = resolvedRepoDir
      || normalizedTargetDir
      || (contextDirInfo && contextDirInfo.canonicalKey)
      || (contextDirInfo && contextDirInfo.trimmed)
      || "";
    rememberRepoBranchHistory(historyDirKey, {
      branchName: currentRunContext.repoBranchName,
      primaryBranch: currentRunContext.repoPrimaryBranch,
    });

    if (meta && typeof meta.repoName === "string" && meta.repoName.trim()) {
      currentRunContext.repoName = meta.repoName.trim();
    }
    if (typeof meta?.isDemo !== "undefined") {
      currentRunContext.repoIsDemo = Boolean(meta.isDemo);
    } else if (!currentRunContext.repoName) {
      currentRunContext.repoIsDemo = false;
    }

    if (typeof refreshProjectInfoBranchDisplay === "function") {
      refreshProjectInfoBranchDisplay();
    }

    if (projectInfoButton) {
      const projectDirForBranches = repoLocalPath
        || normaliseProjectDir(currentRunContext.effectiveProjectDir || currentRunContext.projectDir || "");
      if (projectDirForBranches) {
        projectInfoButton.dataset.projectDir = projectDirForBranches;
      } else {
        delete projectInfoButton.dataset.projectDir;
      }
      if (currentRunContext.repoName) {
        projectInfoButton.dataset.repoName = currentRunContext.repoName;
      } else {
        delete projectInfoButton.dataset.repoName;
      }
    }
  }

  function ensureProjectMetaForDir(projectDirValue, options = {}) {
    const { force = false } = options || {};
    const requestedInfo = buildComparableProjectDir(projectDirValue);
    const normalisedDir = requestedInfo.trimmed;
    if (!normalisedDir) {
      clearRepoBranchForDir("");
      return null;
    }

    const now = Date.now();
    const lastFetch = getLastFetchForInfo(requestedInfo);
    const shouldUseCache = !force || now - lastFetch < PROJECT_META_FORCE_REFRESH_INTERVAL_MS;

    if (shouldUseCache) {
      const cached = getCachedProjectMetaForInfo(requestedInfo);
      if (cached.value !== undefined) {
        if (cached.value) {
          applyProjectMetaToContext(cached.value, normalisedDir);
        } else {
          clearRepoBranchForDir(normalisedDir);
        }
        return cached.value;
      }
    }

    const pendingKey = requestedInfo.canonicalKey || (requestedInfo.lookupKeys[0] || normalisedDir.toLowerCase());

    if (pendingProjectMetaRequests.has(pendingKey)) {
      return pendingProjectMetaRequests.get(pendingKey);
    }

    const requestPromise = (async () => {
      try {
        const response = await fetch(buildProjectMetaUrl(normalisedDir), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Failed to load project metadata (status ${response.status})`);
        }
        const payload = await response.json().catch(() => ({}));
        const meta = payload && typeof payload === "object" ? payload : {};
        const fetchTimestamp = Date.now();
        const resolvedInfo = buildComparableProjectDir(meta && meta.resolvedProjectDir);
        const metaDirInfo = buildComparableProjectDir(meta && meta.projectDir);
        cacheProjectMetaForInfos(meta, fetchTimestamp, requestedInfo, resolvedInfo, metaDirInfo);
        applyProjectMetaToContext(meta, normalisedDir);
        return meta;
      } catch (error) {
        console.warn("[Codex Runner] Failed to load project metadata:", error);
        cacheProjectMetaForInfos(null, Date.now(), requestedInfo);
        clearRepoBranchForDir(normalisedDir);
        return null;
      } finally {
        pendingProjectMetaRequests.delete(pendingKey);
      }
    })();

    pendingProjectMetaRequests.set(pendingKey, requestPromise);
    return requestPromise;
  }

  function refreshRepoBranchForProjectDir(projectDirValue, options = {}) {
    const normalisedDir = normaliseProjectDir(projectDirValue);
    if (!normalisedDir) {
      clearRepoBranchForDir("");
      return;
    }
    ensureProjectMetaForDir(normalisedDir, options);
  }

  function refreshRepoBranchForCurrentProject(options = {}) {
    if (!currentRunContext || typeof currentRunContext !== "object") {
      return;
    }
    const targetDir = normaliseProjectDir(
      currentRunContext.effectiveProjectDir || currentRunContext.projectDir || "",
    );
    if (targetDir) {
      ensureProjectMetaForDir(targetDir, options);
    } else {
      clearRepoBranchForDir("");
    }
  }

  const updateProjectInfoProjectDir = () => {
    if (!projectInfoButton) {
      return;
    }
    const effectiveDir = currentRunContext && typeof currentRunContext === "object"
      ? normaliseProjectDir(
        currentRunContext.repoLocalPath
          || currentRunContext.effectiveProjectDir
          || currentRunContext.projectDir
          || "",
      )
      : "";
    if (effectiveDir) {
      projectInfoButton.dataset.projectDir = effectiveDir;
      refreshRepoBranchForProjectDir(effectiveDir);
    } else {
      delete projectInfoButton.dataset.projectDir;
      clearRepoBranchForDir("");
    }
  }
  const updateRunDirectoryNotice = (dir) => {
    try {
      const el = document.getElementById('runDirectoryCode');
      if (!el) return;
      const display = (typeof dir === 'string' && dir !== '') ? dir : (codexDefaultProjectDir || '');
      // Always update the element immediately so the UI reflects the current run's directory
      el.textContent = display;
      try { el.setAttribute('title', display); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  };
;

  const updateGitFpushRevisionNotice = (revision) => {
    if (!gitFpushRevisionNotice || !gitFpushRevisionCode) {
      return;
    }
    const displayValue = typeof revision === "string" ? revision.trim() : "";
    gitFpushCommitRevision = displayValue;
    if (displayValue) {
      gitFpushRevisionCode.textContent = displayValue;
      try { gitFpushRevisionCode.setAttribute("title", displayValue); } catch (e) { /* ignore */ }
      gitFpushRevisionNotice.classList.remove("is-hidden");
    } else {
      gitFpushRevisionCode.textContent = "";
      gitFpushRevisionNotice.classList.add("is-hidden");
    }
  };

  const resetGitFpushRevisionNotice = () => {
    gitFpushLogCaptureActive = false;
    updateGitFpushRevisionNotice("");
  };

  const captureGitFpushRevisionFromText = (text) => {
    if (typeof text !== "string" || !text) {
      return;
    }
    const lines = text.replace(/\r/g, "").split("\n");
    for (const line of lines) {
      if (!line) {
        continue;
      }
      if (/git log:/i.test(line)) {
        gitFpushLogCaptureActive = true;
        continue;
      }
      if (!gitFpushLogCaptureActive) {
        continue;
      }
      const match = line.match(/^([0-9a-f]{7,40})\s+\d{4}-\d{2}-\d{2}\b/i);
      if (match) {
        updateGitFpushRevisionNotice(match[1]);
        gitFpushLogCaptureActive = false;
        return;
      }
    }
  };

  const getProjectNameFromDir = (value) => {
    const normalised = normaliseProjectDir(value);
    if (!normalised) {
      return "";
    }
    const segments = normalised.replace(/\\+/g, "/").split("/").filter(Boolean);
    if (!segments.length) {
      return "";
    }
    return segments[segments.length - 1];
  };

  const updateRunsSidebarHeading = (projectDirValue) => {
    if (!runsSidebarTitleEl) {
      return;
    }
    const normalisedDir = normaliseProjectDir(projectDirValue);
    const projectName = getProjectNameFromDir(normalisedDir);
    if (normalisedDir) {
      runsSidebarTitleEl.setAttribute("title", projectName || normalisedDir);
    } else {
      runsSidebarTitleEl.removeAttribute("title");
    }
    const isDemo = currentRunContext && typeof currentRunContext.repoIsDemo === "boolean"
      ? currentRunContext.repoIsDemo
      : false;
    updateRepoTriggerLabel(projectName, normalisedDir, isDemo);
  };

  const codexDefaultProjectDir = normaliseProjectDir(config.defaultProjectDir);
  const currentSearchParams = new URLSearchParams(window.location.search || "");
  const currentSessionId = currentSearchParams.get("sessionId");

  const normaliseRunId = (value) => (typeof value === "string" ? value.trim() : "");

  const parseRunIdFromHash = (hashValue) => {
    if (!hashValue) {
      return "";
    }
    const trimmed = hashValue.replace(/^#/, "");
    if (!trimmed) {
      return "";
    }
    if (trimmed.startsWith("run=")) {
      return normaliseRunId(decodeURIComponent(trimmed.slice(4)));
    }
    if (trimmed.startsWith("run/")) {
      return normaliseRunId(decodeURIComponent(trimmed.slice(4)));
    }
    return normaliseRunId(decodeURIComponent(trimmed));
  };

  const buildRunsPageHref = (projectDirValue, _runIdValue) => {
    const normalisedDir = normaliseProjectDir(projectDirValue);
    if (normalisedDir) {
      // Use query parameter `repo_directory` to be consistent with other places.
      return `/agent?repo_directory=${encodeURIComponent(normalisedDir)}`;
    }
    return '/agent';
  };


  const updateRunsSidebarNavLink = (projectDirValue, runIdValue) => {
    if (!runsSidebarOpenRunsButton) {
      return;
    }
    try {
      const href = buildRunsPageHref(projectDirValue, runIdValue);
      runsSidebarOpenRunsButton.dataset.href = href;
      runsSidebarOpenRunsButton.disabled = false;
      runsSidebarOpenRunsButton.setAttribute("aria-disabled", "false");
    } catch (error) {
      console.warn("[Codex Runner] Failed to build runs sidebar link", error);
      runsSidebarOpenRunsButton.dataset.href = "/environment";
      runsSidebarOpenRunsButton.disabled = false;
      runsSidebarOpenRunsButton.setAttribute("aria-disabled", "false");
    }
  };

  const updatePageUrlForRun = (runIdValue, projectDirValue) => {
    const normalisedRunId = normaliseRunId(runIdValue);
    const normalisedProjectDir = normaliseProjectDir(projectDirValue);
    const currentUrl = new URL(window.location.href);
    const params = new URLSearchParams(currentUrl.search);
    if (normalisedProjectDir) {
      params.set("repo_directory", normalisedProjectDir);
    }
    const newSearch = params.toString();
    const newHash = normalisedRunId ? `#run=${encodeURIComponent(normalisedRunId)}` : "";
    const nextRelative = `${currentUrl.pathname}${newSearch ? `?${newSearch}` : ""}${newHash}`;
    window.history.replaceState(null, "", nextRelative);
  };

  const runsPageLink = document.getElementById("runsPageLink");

  const updateRunsPageLink = (projectDirValue, runIdValue) => {
    if (!runsPageLink) {
      updateRunsSidebarNavLink(projectDirValue, runIdValue);
      return;
    }
    try {
      runsPageLink.href = buildRunsPageHref(projectDirValue, runIdValue);
    } catch (error) {
      console.warn("[Codex Runner] Failed to build runs link", error);
    }
    updateRunsSidebarNavLink(projectDirValue, runIdValue);
  };

  const safeParseJson = (value) => {
    if (typeof value !== "string") {
      return null;
    }
    try {
      return JSON.parse(value);
    } catch (_err) {
      return null;
    }
  };

  const existingRunIdFromHash = parseRunIdFromHash(window.location.hash || "");
  runsSidebarSelectedRunId = normaliseRunId(existingRunIdFromHash);

  const setRunsSidebarActiveRun = (runIdValue) => {
    runsSidebarSelectedRunId = normaliseRunId(runIdValue);
    try { updatePromptPlaceholder(); } catch(_e){}
    if (!runsSidebarListEl) {
      return;
    }
    const items = runsSidebarListEl.querySelectorAll("[data-run-id]");
    let foundActive = false;
    items.forEach((item) => {
      const element = item;
      const elementRunId = normaliseRunId(element.getAttribute("data-run-id") || "");
      const isActive = Boolean(runsSidebarSelectedRunId) && elementRunId === runsSidebarSelectedRunId;
      element.classList.toggle("is-active", isActive);
      element.setAttribute("aria-pressed", isActive ? "true" : "false");
      if (isActive) {
        foundActive = true;
      }
    });
    if (!foundActive) {
      if (ensureRunVisibleInPagination(runsSidebarSelectedRunId)) {
        return;
      }
    }
    refreshRunsSidebarDisabledState();
    refreshProjectInfoBranchDisplay();
  };

  const refreshProjectInfoBranchDisplay = () => {
    if (!projectInfoButton || !projectInfoText) {
      return;
    }

    let repoBranch = "";
    if (currentRunContext && typeof currentRunContext.repoBranchName === "string") {
      repoBranch = currentRunContext.repoBranchName.trim();
    }

    let repoPrimaryBranch = "";
    if (currentRunContext && typeof currentRunContext.repoPrimaryBranch === "string") {
      repoPrimaryBranch = currentRunContext.repoPrimaryBranch.trim();
    }

    let runBranch = "";
    if (currentRunContext && typeof currentRunContext.branchName === "string") {
      runBranch = currentRunContext.branchName.trim();
    }

    if (runsSidebarRuns && runsSidebarRuns.length) {
      const activeId = runsSidebarSelectedRunId || (currentRunContext && currentRunContext.runId) || "";
      if (activeId) {
        const matchedRun = runsSidebarRuns.find((run) => normaliseRunId(run?.id || "") === activeId);
        const activeBranch = extractBranchFromRun(matchedRun);
        if (activeBranch) {
          runBranch = activeBranch;
        }
      }
      if (!runBranch) {
        const firstBranch = extractBranchFromRun(runsSidebarRuns[0]);
        if (firstBranch) {
          runBranch = firstBranch;
        }
      }
    }

    let repoBranchDirKey = "";
    if (currentRunContext && typeof currentRunContext === "object") {
      currentRunContext.branchName = runBranch;
      const dirInfo = buildComparableProjectDir(
        currentRunContext.repoBranchDir
        || currentRunContext.repoLocalPath
        || currentRunContext.effectiveProjectDir
        || currentRunContext.projectDir
        || "",
      );
      repoBranchDirKey = dirInfo.canonicalKey || dirInfo.trimmed || "";
    }

    let historicalRepoBranch = "";
    let historicalPrimaryBranch = "";
    if (!repoBranch || !repoPrimaryBranch) {
      const history = getRepoBranchHistoryForDir(repoBranchDirKey);
      if (!repoBranch && history.branchName) {
        repoBranch = history.branchName;
      }
      if (!repoPrimaryBranch && history.primaryBranch) {
        repoPrimaryBranch = history.primaryBranch;
      }
      historicalRepoBranch = history.branchName;
      historicalPrimaryBranch = history.primaryBranch;
    }

    const branchForDisplay =
      repoPrimaryBranch
      || repoBranch
      || runBranch
      || historicalPrimaryBranch
      || historicalRepoBranch;
    const datasetBranch =
      repoBranch
      || repoPrimaryBranch
      || runBranch
      || historicalRepoBranch
      || historicalPrimaryBranch
      || "";
    const fallbackBranch =
      repoPrimaryBranch
      || repoBranch
      || runBranch
      || historicalPrimaryBranch
      || historicalRepoBranch;
    updateProjectInfoBranch(branchForDisplay, {
      actualBranch: datasetBranch,
      fallbackBranch,
    });
  };

  const initialProjectDir =
    normaliseProjectDir(currentSearchParams.get("repo_directory")) || codexDefaultProjectDir || "";
  updateRunsSidebarNavLink(initialProjectDir, existingRunIdFromHash);
  currentRunContext = buildRunContext({
    projectDir: initialProjectDir,
    runId: existingRunIdFromHash,
    effectiveProjectDir: initialProjectDir,
    branchName: "",
  });
  let lastRequestedProjectDir = currentRunContext.projectDir;
  updateRunsSidebarHeading(currentRunContext.projectDir);
  updateProjectInfoProjectDir();
    try{ updateRunDirectoryNotice(currentRunContext && currentRunContext.effectiveProjectDir ? currentRunContext.effectiveProjectDir : (currentRunContext && currentRunContext.projectDir) ); }catch(e){}
  refreshProjectInfoBranchDisplay();

  const cachedEditorTargets = new Map();

  const cacheEditorTarget = (projectDirValue, target) => {
    if (!target || !target.url) {
      return;
    }
    const normalisedKey = normaliseProjectDir(projectDirValue || target.projectDir);
    if (!normalisedKey) {
      return;
    }
    cachedEditorTargets.set(normalisedKey, {
      repoName: target.repoName || "",
      chatNumber: target.chatNumber || "",
      projectDir: target.projectDir || normalisedKey,
      url: target.url,
    });
  };

  if (
    config.editorLaunchConfig
    && config.editorLaunchConfig.projectDir
    && config.editorLaunchConfig.url
  ) {
    cacheEditorTarget(config.editorLaunchConfig.projectDir, config.editorLaunchConfig);
  }

  const buildEditorUrl = (repoName, chatNumber) => {
    const safeRepo = typeof repoName === "string" ? repoName.trim() : "";
    const safeChat = typeof chatNumber === "string" ? chatNumber.trim() : "";
    if (!safeRepo || !safeChat) {
      return "";
    }
    return `/${encodeURIComponent(safeRepo)}/chat/${encodeURIComponent(safeChat)}/editor`;
  };

  const fetchEditorTargetForDir = async (projectDirValue) => {
    const normalisedDir = normaliseProjectDir(projectDirValue);
    if (!normalisedDir) {
      return null;
    }

    if (cachedEditorTargets.has(normalisedDir)) {
      return cachedEditorTargets.get(normalisedDir);
    }

    try {
      const url = new URL("/agent/resolve-editor-target", window.location.origin);
      url.searchParams.set("repo_directory", normalisedDir);
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        console.warn(
          "[Codex Runner] Failed to resolve editor target:",
          response.status,
          response.statusText,
        );
        return null;
      }
      const payload = await response.json();
      const result = payload && payload.editorTarget ? payload.editorTarget : null;
      if (!result || !result.repoName || !result.chatNumber) {
        return null;
      }
      const target = {
        repoName: result.repoName,
        chatNumber: result.chatNumber,
        projectDir: result.projectDir || normalisedDir,
        url: result.url || buildEditorUrl(result.repoName, result.chatNumber),
      };
      cacheEditorTarget(target.projectDir, target);
      return target;
    } catch (error) {
      console.error("[Codex Runner] Failed to resolve editor target:", error);
      return null;
    }
  };

  const resolveCandidateProjectDirsForEditor = () => {
    const candidates = [];
    // Prefer the project dir for the selected run in the Runs sidebar
    if (runsSidebarSelectedRunId && Array.isArray(runsSidebarRuns) && runsSidebarRuns.length) {
      try {
        const selectedRun = runsSidebarRuns.find((r) => r && normaliseRunId(r.id || "") === runsSidebarSelectedRunId);
        if (selectedRun) {
          candidates.push(selectedRun.requestedProjectDir || selectedRun.effectiveProjectDir || selectedRun.projectDir || "");
        }
      } catch (e) { /* ignore */ }
    }

    const inputValue = projectDirInput ? projectDirInput.value : "";
    if (inputValue) {
      candidates.push(inputValue);
    }
    if (currentSnapshotProjectDir) {
      candidates.push(currentSnapshotProjectDir);
    }
    // Prefer the repo branch directory for the currently-selected run (if present)
    if (currentRunContext && currentRunContext.repoBranchDir) {
      candidates.push(currentRunContext.repoBranchDir);
    }
    if (currentRunContext && currentRunContext.effectiveProjectDir) {
      candidates.push(currentRunContext.effectiveProjectDir);
    }
    if (currentRunContext && currentRunContext.projectDir) {
      candidates.push(currentRunContext.projectDir);
    }
    const params = new URLSearchParams(window.location.search || "");
    const repoDirParam = params.get("repo_directory");
    if (repoDirParam) {
      candidates.push(repoDirParam);
    }
    if (config.defaultProjectDir) {
      candidates.push(config.defaultProjectDir);
    }
    return candidates;
  };

  const resolveEditorTarget = async () => {
    const candidates = resolveCandidateProjectDirsForEditor();

    // If a run is selected in the Runs sidebar, try to prefer the run's
    // snapshot/effective project directory by fetching detailed run info.
    try {
      if (runsSidebarSelectedRunId) {
        const selectedRun = runsSidebarRuns.find((r) => r && normaliseRunId(r.id || "") === runsSidebarSelectedRunId);
        if (selectedRun && selectedRun.id) {
          try {
            const dir = normaliseProjectDir(selectedRun.requestedProjectDir || selectedRun.effectiveProjectDir || selectedRun.projectDir || '');
            const runResp = await fetch(buildRunsDataUrl(selectedRun.id, dir));
            if (runResp && runResp.ok) {
              const runJson = await runResp.json().catch(() => ({}));
              const runEntries = Array.isArray(runJson?.runs) ? runJson.runs : [];
              const detailed = runEntries.length ? (runEntries.find(r => r && r.id === selectedRun.id) || runEntries[0]) : null;
              const runDir2 = detailed ? normaliseProjectDir(detailed.effectiveProjectDir || detailed.requestedProjectDir || detailed.projectDir || dir) : null;
              if (runDir2) {
                // Put the run snapshot dir first so it is resolved before other candidates.
                candidates.unshift(runDir2);
              }
            }
          } catch (_e) { /* ignore */ }
        }
      }
    } catch (_e) { /* ignore */ }

    for (const candidate of candidates) {
      const normalised = normaliseProjectDir(candidate);
      if (!normalised) {
        continue;
      }
      if (cachedEditorTargets.has(normalised)) {
        const cached = cachedEditorTargets.get(normalised);
        if (cached && cached.url) {
          return cached;
        }
      }
      const resolved = await fetchEditorTargetForDir(normalised);
      if (resolved && resolved.url) {
        return resolved;
      }
    }

    if (
      config.editorLaunchConfig
      && config.editorLaunchConfig.url
    ) {
      return {
        repoName: config.editorLaunchConfig.repoName || "",
        chatNumber: config.editorLaunchConfig.chatNumber || "",
        projectDir: config.editorLaunchConfig.projectDir || "",
        url: config.editorLaunchConfig.url,
      };
    }

    return null;
  };

  const showEditorError = (message) => {
    const fallback = "Unable to open the editor for this project.";
    const safeMessage = typeof message === "string" && message.trim() ? message : fallback;
    if (statusEl) {
      statusEl.classList.add("error");
      const target = statusTextEl || statusEl;
      target.textContent = safeMessage;
    } else {
      window.alert(safeMessage);
    }
  };

  if (openEditorTopButton) {
    openEditorTopButton.addEventListener("click", async () => {
      // If a run is selected in the Runs sidebar, try opening editor for that run's project dir first.
      if (runsSidebarSelectedRunId) {
        const selectedRun = runsSidebarRuns.find((r) => r && r.id === runsSidebarSelectedRunId);
        if (selectedRun) {
          const dir = normaliseProjectDir(selectedRun.requestedProjectDir || selectedRun.effectiveProjectDir || selectedRun.projectDir || '');
          if (dir) {
            try {
              // If the selected run has an explicit run id, prefer opening editor with run_id param
              if (selectedRun && selectedRun.id) {
                // Prefer opening editor for the run's effective/requested project dir so
                // that the editor `repo_directory` matches the run snapshot path.
                const runDir = normaliseProjectDir(selectedRun.effectiveProjectDir || selectedRun.requestedProjectDir || selectedRun.projectDir || dir || '');
                let candidate = runDir ? await fetchEditorTargetForDir(runDir) : await fetchEditorTargetForDir(dir);
                if ((!candidate || !candidate.url) && selectedRun && selectedRun.id) {
                  // Try fetching run details and resolve editor target from the run's dirs
                  try {
                    const runResp = await fetch(buildRunsDataUrl(selectedRun.id, dir));
                    if (runResp && runResp.ok) {
                      const runJson = await runResp.json().catch(() => ({}));
                      const runEntries = Array.isArray(runJson?.runs) ? runJson.runs : [];
                      const detailed = runEntries.length ? (runEntries.find(r => r && r.id === selectedRun.id) || runEntries[0]) : null;
                      const runDir2 = detailed ? normaliseProjectDir(detailed.effectiveProjectDir || detailed.requestedProjectDir || detailed.projectDir || runDir || dir) : runDir;
                      if (runDir2) {
                        candidate = await fetchEditorTargetForDir(runDir2);
                      }
                    }
                  } catch (_err) { /* ignore */ }
                }
                if (candidate && candidate.url) {
                  const url = new URL(candidate.url, window.location.origin);
                  url.searchParams.set('run_id', selectedRun.id);
                  if (pendingWindow) { pendingWindow.location.href = url.toString(); } else { window.open(url.toString(), '_blank', 'noopener,noreferrer'); }
                  return;
                }
              }

              const resolved = await fetchEditorTargetForDir(dir);
              if (resolved && resolved.url) {
                if (pendingWindow) { pendingWindow.location.href = resolved.url; } else { window.open(resolved.url, '_blank', 'noopener,noreferrer'); }
                return;
              }
            } catch (_e) { /* Ignore and fallback */ }
          }
        }
      }

      const candidates = resolveCandidateProjectDirsForEditor();
      for (const candidate of candidates) {
        const normalised = normaliseProjectDir(candidate);
        if (!normalised) {
          continue;
        }
        const cached = cachedEditorTargets.get(normalised);
        if (cached && cached.url) {
          window.open(cached.url, "_blank", "noopener,noreferrer");
          return;
        }
      }

      let pendingWindow = null;
      if (window.__pendingEditorWindow) {
        try { pendingWindow = window.__pendingEditorWindow; delete window.__pendingEditorWindow; } catch (e) { pendingWindow = window.__pendingEditorWindow; }
      } else {
        pendingWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
      }
      if (pendingWindow) {
        try {
          pendingWindow.document.title = "Loading editor…";
        } catch (_err) {
          /* Ignore cross-origin write errors */
        }
      }

      try {
        const target = await resolveEditorTarget();
        if (target && target.url) {
          if (pendingWindow) {
            pendingWindow.location.href = target.url;
          } else {
            window.open(target.url, "_blank", "noopener,noreferrer");
          }
          return;
        }

        if (pendingWindow) {
          pendingWindow.close();
        }

        // Enhanced debug: collect detailed diagnostic info to help troubleshoot why
        // no editor target could be resolved. This includes candidate project dirs,
        // cached targets, config.editorLaunchConfig, and last fetch attempt results.
        try {
          const candidates = resolveCandidateProjectDirsForEditor();
          const normalisedCandidates = candidates.map(c => normaliseProjectDir(c)).filter(Boolean);
          const cachedDump = {};
          try {
            for (const [k, v] of cachedEditorTargets.entries()) {
              cachedDump[k] = v;
            }
          } catch (e) { /* ignore */ }

          let editorLaunchConfigDump = null;
          try { editorLaunchConfigDump = config && config.editorLaunchConfig ? config.editorLaunchConfig : null; } catch (e) { editorLaunchConfigDump = 'error'; }

          const diag = {
            message: 'Failed to resolve an editor target',
            candidates: normalisedCandidates,
            cachedTargets: cachedDump,
            editorLaunchConfig: editorLaunchConfigDump,
            currentRunContext: (() => {
              try { return currentRunContext || null; } catch (e) { return 'error'; }
            })(),
            projectDirInput: (() => { try { return projectDirInput && projectDirInput.value; } catch (e) { return null; } })(),
            currentSnapshotProjectDir: currentSnapshotProjectDir || null,
            urlSearchParams: (() => { try { return Object.fromEntries(new URLSearchParams(window.location.search)); } catch (e) { return null; } })(),
          };

          console.warn('[Codex Runner] Editor resolution diagnostics:', diag);

          // Also show a user-visible message with where we looked and a hint to check console.
          const userMessage = 'Unable to find an editor page for this project. Checked candidate directories: ' + (normalisedCandidates.join(', ') || '(none)') + '. See console for diagnostics.';

          showEditorError(userMessage);
          return;
        } catch (diagError) {
          console.error('[Codex Runner] Failed while reporting editor diagnostics:', diagError);
          showEditorError('Unable to find an editor page for this project. See console for details.');
          return;
        }
      } catch (error) {
        if (pendingWindow) {
          pendingWindow.close();
        }
        console.error("[Codex Runner] Error opening editor:", error);
        showEditorError(
          "Failed to open the editor. Check the repository configuration and try again.",
        );
      }
    });
  }

  const buildGitLogUrl = (projectDirValue) => {
    const effectiveDir = normaliseProjectDir(projectDirValue) || codexDefaultProjectDir;
    const params = new URLSearchParams();
    if (effectiveDir) {
      params.set("projectDir", effectiveDir);
    }
    if (currentSessionId) {
      params.set("sessionId", currentSessionId);
    }
    const query = params.toString();
    return query ? `/agent/git-log?${query}` : "/agent/git-log";
  };

  const getEffectiveProjectDirForGitLog = (inputValue) => {
    const snapshotDir = normaliseProjectDir(currentSnapshotProjectDir);
    if (snapshotDir) {
      return snapshotDir;
    }
    const normalisedInput = normaliseProjectDir(inputValue);
    if (normalisedInput) {
      return normalisedInput;
    }
    if (repoDirectoryFromUrl) {
      return repoDirectoryFromUrl;
    }
    return codexDefaultProjectDir;
  };

  const updateGitLogLink = () => {
    if (!gitLogLink) {
      return;
    }
    const inputValue = projectDirInput ? projectDirInput.value : "";
    const effectiveValue = getEffectiveProjectDirForGitLog(inputValue);
    gitLogLink.href = buildGitLogUrl(effectiveValue);
  };

  /// --- Merge Diff button helpers ---
  const extractFirstHashFromText = (text) => {
    if (!text || typeof text !== 'string') return null;
    const m = text.match(/[0-9a-f]{7,40}/i);
    return m ? m[0] : null;
  };

  const getFinalOutputForDiff = () => {
    const activeFinalOutput = getActiveFinalOutputText();
    if (typeof activeFinalOutput !== "string") {
      return "";
    }
    if (!activeFinalOutput.trim()) {
      return "";
    }
    return activeFinalOutput;
  };

  const getFinalOutputFromRunRecord = async (runId, projectDirValue) => {
    try {
      const run = await fetchRunFromHistory(runId, projectDirValue);
      if (run) {
        const resolved = resolveFinalOutputForSavedRun(run);
        if (resolved) {
          return resolved;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch final output from run record:', e);
    }
    return null;
  };

  const buildMergeDiffUrl = (hash, projectDirValue, finalOutput) => {
    if (!hash) return '';
    const baseRev = `${hash}^`;
    const params = new URLSearchParams({ baseRev, compRev: hash });
    const dir = normaliseProjectDir(projectDirValue) || normaliseProjectDir(currentSnapshotProjectDir) || (currentRunContext && currentRunContext.projectDir) || '';
    if (dir) params.set('projectDir', dir);
    params.set('mergeReady', '1');
    const promptForDiff = typeof lastUserPrompt === 'string' ? lastUserPrompt : '';
    if (promptForDiff) {
      params.set('userPrompt', promptForDiff);
    }
    const finalOutputForDiff = finalOutput || getFinalOutputForDiff();
    if (finalOutputForDiff) {
      params.set('finalOutput', finalOutputForDiff);
    }

    return `/agent/git-diff?${params.toString()}`;
  };
  const buildMergeDiffUrlForBranch = (branch, projectDirValue, finalOutput) => {
    if (!branch) return '';
    const params = new URLSearchParams({ branch });
    const dir = normaliseProjectDir(projectDirValue) || normaliseProjectDir(currentSnapshotProjectDir) || (currentRunContext && currentRunContext.projectDir) || '';
    if (dir) params.set('projectDir', dir);
    params.set('mergeReady', '1');
    const promptForDiff = typeof lastUserPrompt === 'string' ? lastUserPrompt : '';
    if (promptForDiff) {
      params.set('userPrompt', promptForDiff);
    }
    const finalOutputForDiff = finalOutput || getFinalOutputForDiff();
    if (finalOutputForDiff) {
      params.set('finalOutput', finalOutputForDiff);
    }

    // Use a server-side resolver to find the parent-merge commit for this branch
    return `/agent/git-diff-branch-merge?${params.toString()}`;
  };

  const prefetchMergeDiffUrl = async (url) => {
    if (!url || typeof url !== "string") {
      return false;
    }

    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.set("prefetch", "1");
      const response = await fetch(parsed.toString(), { method: "GET", credentials: "same-origin" });
      return response.ok;
    } catch (err) {
      console.error("Failed to prefetch merge diff", err);
      return false;
    }
  };

  const enableMergeDiffAfterPrefetch = ({ branch, hash, projectDirValue, finalOutput }) => {
    const useBranch = Boolean(branch);
    const diffUrl = useBranch
      ? buildMergeDiffUrlForBranch(branch, projectDirValue || "", finalOutput)
      : buildMergeDiffUrl(hash, projectDirValue || "", finalOutput);

    if (!diffUrl) {
      if (useBranch) {
        enableMergeDiffButtonForBranch(branch, projectDirValue || "", finalOutput);
      } else if (hash) {
        enableMergeDiffButtonForHash(hash, projectDirValue || "", finalOutput);
      }
      return;
    }

    prefetchMergeDiffUrl(diffUrl)
      .catch(() => false)
      .finally(() => {
        if (useBranch) {
          enableMergeDiffButtonForBranch(branch, projectDirValue || "", finalOutput);
        } else if (hash) {
          enableMergeDiffButtonForHash(hash, projectDirValue || "", finalOutput);
        }
      });
  };

  // --- Git Log modal loader helpers ---
  const gitLogLoaderMessages = [
    'Preparing diff…',
    'Collecting changes…',
    'Rendering diff…',
    'Finalizing view…',
  ];
  let gitLogLoaderTimer = null;

  const showGitLogLoader = () => {
    const loader = document.getElementById('gitLogLoader');
    const log = document.getElementById('gitLogLoaderLog');
    if (!loader) return;
    loader.classList.remove('is-hidden');
    if (!log) return;
    let idx = 0;
    log.textContent = gitLogLoaderMessages[0];
    if (gitLogLoaderTimer) {
      clearInterval(gitLogLoaderTimer);
      gitLogLoaderTimer = null;
    }
    gitLogLoaderTimer = setInterval(() => {
      idx = Math.min(idx + 1, gitLogLoaderMessages.length - 1);
      log.textContent = gitLogLoaderMessages[idx];
      if (idx === gitLogLoaderMessages.length - 1) {
        clearInterval(gitLogLoaderTimer);
        gitLogLoaderTimer = null;
      }
    }, 1400);
  };

  const hideGitLogLoader = () => {
    if (gitLogLoaderTimer) {
      clearInterval(gitLogLoaderTimer);
      gitLogLoaderTimer = null;
    }
    const loader = document.getElementById('gitLogLoader');
    const log = document.getElementById('gitLogLoaderLog');
    if (loader) loader.classList.add('is-hidden');
    if (log) log.textContent = '';
  };

  const closeGitLogModal = () => {
    try {
      if (gitLogIframe) {
        gitLogIframe.src = "";
      }
      if (gitLogModal) {
        gitLogModal.classList.add("is-hidden");
      }
      if (document && document.body) {
        document.body.style.overflow = "";
      }
      hideGitLogLoader();
    } catch (_err) { /* ignore */ }
  };

  const DIFF_MODAL_BACK_MESSAGE_TYPE = "codex:diff-modal-back";
  const DIFF_MODAL_FOLLOWUP_MESSAGE_TYPE = "codex:diff-modal-followup";

  const isTrustedDiffModalMessage = (event) => {
    const isFromSameOrigin = Boolean(event.origin && window.location && window.location.origin && event.origin === window.location.origin);
    const isFromGitLogIframe = Boolean(typeof gitLogIframe !== 'undefined' && gitLogIframe && event.source && gitLogIframe.contentWindow && event.source === gitLogIframe.contentWindow);
    return isFromSameOrigin || isFromGitLogIframe;
  };

  const handleDiffModalMergeRequest = (event) => {
    if (!event || !event.data || event.data.type !== VIEW_DIFF_MERGE_MESSAGE_TYPE) {
      return;
    }
    // Accept messages from the same origin, or from the diff iframe window (which may have a null origin when using srcdoc),
    // but still reject messages from unknown external sources.
    if (!isTrustedDiffModalMessage(event)) {
      return;
    }
    // Close the diff modal and trigger the merge button in the parent if enabled.
    closeGitLogModal();
    if (mergeButton && !mergeButton.disabled) {
      mergeButton.click();
    }
  };

  const handleDiffModalBackRequest = (event) => {
    if (!event || !event.data || event.data.type !== DIFF_MODAL_BACK_MESSAGE_TYPE) {
      return;
    }
    if (!isTrustedDiffModalMessage(event)) {
      return;
    }
    const diffUrl = typeof event.data.diffUrl === "string" ? event.data.diffUrl : "";
    if (!diffUrl) {
      return;
    }
    if (gitLogModal) {
      gitLogModal.classList.remove("is-hidden");
    }
    if (document && document.body) {
      document.body.style.overflow = "hidden";
    }
    if (gitLogIframe) {
      showGitLogLoader();
      gitLogIframe.onload = () => { hideGitLogLoader(); };
      gitLogIframe.onerror = () => { hideGitLogLoader(); };
      gitLogIframe.src = diffUrl;
    } else {
      window.open(diffUrl, "_blank", "noopener");
    }
  };

  const handleDiffModalFollowupRequest = (event) => {
    if (!event || !event.data || event.data.type !== DIFF_MODAL_FOLLOWUP_MESSAGE_TYPE) {
      return;
    }
    if (!isTrustedDiffModalMessage(event)) {
      return;
    }
    const prompt = typeof event.data.prompt === "string" ? event.data.prompt.trim() : "";
    if (!prompt) {
      return;
    }
    closeGitLogModal();
    const projectDir =
      (currentRunContext && (currentRunContext.effectiveProjectDir || currentRunContext.projectDir))
      || "";
    const agentInstructions = agentInstructionsInput ? agentInstructionsInput.value : "";
    startStream(projectDir, prompt, agentInstructions);
  };

  window.addEventListener("message", handleDiffModalMergeRequest, false);
  window.addEventListener("message", handleDiffModalBackRequest, false);
  window.addEventListener("message", handleDiffModalFollowupRequest, false);

  const looksLikeHtmlDocument = (text) => {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed.startsWith('<')) return false;

    const lowered = trimmed.toLowerCase();
    return lowered.startsWith('<!doctype') || lowered.startsWith('<html') || lowered.startsWith('<head') || lowered.startsWith('<body');
  };

  const escapeHtml = (value) => {
    if (!value || typeof value !== 'string') return '';
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const decodeJsonStringMaybe = (text) => {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') {
        return parsed;
      }
    } catch (_e) { /* ignore */ }
    return text;
  };

  const loadDiffIframeContent = async (iframe, url) => {
    if (!iframe || !url) return { loaded: false, rawText: '' };

    // Always allow the browser to render the real diff page directly so
    // scripts, styles, and anchors behave exactly as when opened in a new tab.
    // The previous srcdoc approach caused some browsers to display the raw
    // HTML source instead of the rendered page, leaving the modal looking
    // "broken".
    try {
      let loaderTimeoutId = null;
      const hideLoaderOnce = () => {
        if (loaderTimeoutId) {
          clearTimeout(loaderTimeoutId);
          loaderTimeoutId = null;
        }
        hideGitLogLoader();
      };
      iframe.onload = hideLoaderOnce;
      iframe.onerror = hideLoaderOnce;
      loaderTimeoutId = setTimeout(hideLoaderOnce, 15000);
      iframe.src = url;
      return { loaded: true, rawText: '' };
    } catch (_e) {
      hideGitLogLoader();
      return { loaded: false, rawText: '' };
    }
  };

  const renderDiffFallbackContent = (iframe, url, rawText) => {
    if (!iframe) return false;

    const sanitizedSnippet = rawText ? escapeHtml(rawText.slice(0, 2400)) : '';
    const message = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b1223; color: #e5e7eb; padding: 24px; margin: 0; }
      .card { background: #0f172a; border: 1px solid #1f2937; border-radius: 12px; padding: 18px; max-width: 860px; margin: 0 auto; box-shadow: 0 16px 36px rgba(0,0,0,0.4); }
      h1 { font-size: 18px; margin: 0 0 10px; }
      p { margin: 0 0 12px; color: #cbd5e1; line-height: 1.5; }
      a { color: #93c5fd; text-decoration: none; }
      a:hover { text-decoration: underline; }
      pre { margin: 0; padding: 12px; background: #111827; border-radius: 10px; border: 1px solid #1f2937; color: #cbd5e1; font-size: 12px; overflow: auto; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Unable to render diff preview</h1>
      <p>The response was not valid HTML. <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open the full diff in a new tab</a> to view it directly.</p>
      ${sanitizedSnippet ? `<pre aria-label="Diff response preview">${sanitizedSnippet}</pre>` : ''}
    </div>
  </body>
</html>`;

    iframe.onload = () => { hideGitLogLoader(); };
    iframe.removeAttribute('src');
    iframe.srcdoc = message;
    setTimeout(() => hideGitLogLoader(), 1500);
    return true;
  };

  const openMergeDiffModal = async (url) => {
    try {
      const modal = document.getElementById('gitLogModal');
      const iframe = document.getElementById('gitLogIframe');
      showGitLogLoader();

      if (!iframe) {
        hideGitLogLoader();
        window.open(url, '_blank', 'noopener');
        return;
      }

      const { loaded, rawText } = await loadDiffIframeContent(iframe, url);

      if (!loaded) {
        const renderedFallback = renderDiffFallbackContent(iframe, url, rawText);
        if (!renderedFallback) {
          iframe.onload = () => { hideGitLogLoader(); };
          iframe.src = url;
        }
      }

      if (modal) { modal.classList.remove('is-hidden'); }
      document.body.style.overflow = 'hidden';
    } catch (e) {
      hideGitLogLoader();
      window.open(url, '_blank', 'noopener');
    }
  };

  if (typeof window !== 'undefined') {
    window.openMergeDiffModal = openMergeDiffModal;
  }

  const ensureMergeDiffContainerVisible = () => {
    const container = document.getElementById("mergeOutputContainer");
    if (container) {
      container.classList.remove("is-hidden");
    }
  };

  const lockMergeDiffButton = () => {
    mergeDiffLockedAfterMerge = true;
    hideMergeDiffButton();
  };

  const hideMergeDiffButton = () => {
    if (!mergeDiffButton) return;
    mergeDiffButton.disabled = true;
    mergeDiffButton.removeAttribute('data-href');
    mergeDiffButton.setAttribute('aria-disabled', 'true');
    mergeDiffButton.onclick = null;
    mergeDiffButton.classList.add('is-hidden');
  };

  const hasActiveMergeDiffLink = () => {
    if (!mergeDiffButton) {
      return false;
    }

    if (mergeDiffButton.classList.contains("is-hidden")) {
      return false;
    }

    const href = mergeDiffButton.getAttribute("data-href") || "";
    return Boolean(href.trim()) && !mergeDiffButton.disabled;
  };

  const detectGitChangeIndicator = (text) => {
    if (!text || typeof text !== "string") {
      return false;
    }

    const fileChangeMatch = text.match(/(\d+)\s+files?\s+changed/i);
    if (fileChangeMatch) {
      const fileCount = parseInt(fileChangeMatch[1], 10);
      if (Number.isFinite(fileCount) && fileCount > 0) {
        return true;
      }
    }

    const insertionMatch = text.match(/(\d+)\s+insertions?/i);
    if (insertionMatch) {
      const insertionCount = parseInt(insertionMatch[1], 10);
      if (Number.isFinite(insertionCount) && insertionCount > 0) {
        return true;
      }
    }

    const deletionMatch = text.match(/(\d+)\s+deletions?/i);
    if (deletionMatch) {
      const deletionCount = parseInt(deletionMatch[1], 10);
      if (Number.isFinite(deletionCount) && deletionCount > 0) {
        return true;
      }
    }

    const indicators = [
      /create mode/i,
      /delete mode/i,
      /renamed?:/i,
      /modified:/i,
      /new file:/i,
      /changes to be committed/i,
    ];

    return indicators.some((pattern) => pattern.test(text));
  };

  const detectGitNoChangeIndicator = (text) => {
    if (!text || typeof text !== "string") {
      return false;
    }

    return [
      /\b0\s+files?\s+changed\b/i,
      /\bnothing to commit\b/i,
      /\bworking tree clean\b/i,
      /\bno changes added to commit\b/i,
    ].some((pattern) => pattern.test(text));
  };

  const updateGitFpushOutputSection = (text) => {
    if (!text || typeof text !== "string") {
      return;
    }

    let nextSection = gitFpushOutputSection;
    const lines = text.split(/\r?\n/);
    lines.forEach((line) => {
      const match = line.match(/^---\s*([^:]+):\s*$/);
      if (!match) {
        return;
      }
      const label = match[1].trim().toLowerCase();
      if (label === "initial git status" || label === "added, git status" || label === "final git status") {
        nextSection = "status";
      } else if (label === "git log") {
        nextSection = "log";
      } else {
        nextSection = "other";
      }
    });

    gitFpushOutputSection = nextSection;
  };

  const captureGitFpushDiffCandidates = (text, projectDirValue) => {
    if (!gitFpushActive || !text) {
      return;
    }

    updateGitFpushOutputSection(text);
    const effectiveDir =
      normaliseProjectDir(projectDirValue)
      || normaliseProjectDir(currentSnapshotProjectDir)
      || (currentRunContext
        && normaliseProjectDir(
          currentRunContext.effectiveProjectDir
            || currentRunContext.projectDir
            || "",
        ))
      || "";

    const detectedBranch = extractBranchFromText(text);
    if (detectedBranch) {
      pendingGitFpushBranch = detectedBranch;
      pendingGitFpushBranchProjectDir = effectiveDir;
    }

    const detectedHash = extractFirstHashFromText(text);
    if (detectedHash) {
      pendingGitFpushHash = detectedHash;
      pendingGitFpushHashProjectDir = effectiveDir;
    }

    if (gitFpushOutputSection === "status" && detectGitChangeIndicator(text)) {
      gitFpushDetectedChanges = true;
    }

    if (gitFpushOutputSection === "status" && detectGitNoChangeIndicator(text)) {
      gitFpushDetectedNoChanges = true;
    }
  };

  const consumePendingGitFpushDiff = async (options = {}) => {
    const branch = pendingGitFpushBranch;
    const branchProjectDir = pendingGitFpushBranchProjectDir;
    const hash = pendingGitFpushHash;
    const hashProjectDir = pendingGitFpushHashProjectDir;

    pendingGitFpushBranch = "";
    pendingGitFpushBranchProjectDir = "";
    pendingGitFpushHash = "";
    pendingGitFpushHashProjectDir = "";

    if (branch) {
      if (options.prefetchFirst) {
        const finalOutput = await getFinalOutputFromRunRecord(currentRunContext.runId, branchProjectDir);
        enableMergeDiffAfterPrefetch({ branch, projectDirValue: branchProjectDir, finalOutput });
      } else {
        enableMergeDiffButtonForBranch(branch, branchProjectDir, null);
      }
      return true;
    }

    if (hash) {
      if (options.prefetchFirst) {
        const finalOutput = await getFinalOutputFromRunRecord(currentRunContext.runId, hashProjectDir);
        enableMergeDiffAfterPrefetch({ hash, projectDirValue: hashProjectDir, finalOutput });
      } else {
        enableMergeDiffButtonForHash(hash, hashProjectDir, null);
      }
      return true;
    }

    return false;
  };

  const enableMergeDiffButtonForBranch = (branch, projectDirValue, finalOutput) => {
    if (mergeDiffLockedAfterMerge) {
      hideMergeDiffButton();
      return;
    }
    if (!mergeDiffButton) return;
    if (!branch) {
      mergeDiffButton.disabled = true;
      mergeDiffButton.removeAttribute('data-href');
      mergeDiffButton.setAttribute('aria-disabled', 'true');
      mergeDiffButton.onclick = null;
      mergeDiffButton.classList.add('is-hidden');
      return;
    }
    const url = buildMergeDiffUrlForBranch(branch, projectDirValue || '', finalOutput);
    if (!url) {
      mergeDiffButton.disabled = true;
      mergeDiffButton.setAttribute('aria-disabled', 'true');
      mergeDiffButton.onclick = null;
      mergeDiffButton.classList.add('is-hidden');
      return;
    }
    ensureMergeDiffContainerVisible();
    mergeDiffButton.disabled = false;
    mergeDiffButton.setAttribute('data-href', url);
    mergeDiffButton.setAttribute('aria-disabled', 'false');
    mergeDiffButton.classList.remove('is-hidden');
    mergeDiffButton.onclick = () => { openMergeDiffModal(url); };
    if (autoOpenMergeDiffOnEnable) {
      autoOpenMergeDiffOnEnable = false;
      setTimeout(() => mergeDiffButton.click(), 0);
    }
  };

  const extractBranchFromText = (text) => {
    if (!text || typeof text !== 'string') return null;
    const m = text.match(/STERLING_BRANCH_NAME:([^\s]+)/i);
    return m ? m[1] : null;
  };


  const enableMergeDiffButtonForHash = (hash, projectDirValue, finalOutput) => {
    if (mergeDiffLockedAfterMerge) {
      hideMergeDiffButton();
      return;
    }
    if (!mergeDiffButton) return;
    if (!hash) {
      mergeDiffButton.disabled = true;
      mergeDiffButton.removeAttribute('data-href');
      mergeDiffButton.setAttribute('aria-disabled', 'true');
      mergeDiffButton.onclick = null;
      mergeDiffButton.classList.add('is-hidden');
      return;
    }
    const url = buildMergeDiffUrl(hash, projectDirValue || '', finalOutput);
    if (!url) {
      mergeDiffButton.disabled = true;
      mergeDiffButton.setAttribute('aria-disabled', 'true');
      mergeDiffButton.onclick = null;
      mergeDiffButton.classList.add('is-hidden');
      return;
    }
    ensureMergeDiffContainerVisible();
    mergeDiffButton.disabled = false;
    mergeDiffButton.setAttribute('data-href', url);
    mergeDiffButton.setAttribute('aria-disabled', 'false');
    mergeDiffButton.classList.remove('is-hidden');
    mergeDiffButton.onclick = () => { openMergeDiffModal(url); };
    if (autoOpenMergeDiffOnEnable) {
      autoOpenMergeDiffOnEnable = false;
      setTimeout(() => mergeDiffButton.click(), 0);
    }
  };

  const tryEnableMergeDiffFromText = (text, projectDirValue, finalOutput) => {
    const hash = extractFirstHashFromText(text || '');
    if (hash) {
      enableMergeDiffButtonForHash(hash, projectDirValue, finalOutput);
    }
  };



  if (projectDirInput && gitLogLink) {
    const handleProjectDirManualChange = () => {
      clearSnapshotProjectDir();
      updateGitLogLink();
      updateRunsSidebarHeading(projectDirInput ? projectDirInput.value : "");
      const manualDir = normaliseProjectDir(projectDirInput ? projectDirInput.value : "");
      if (projectInfoButton) {
        if (manualDir) {
          projectInfoButton.dataset.projectDir = manualDir;
        } else {
          delete projectInfoButton.dataset.projectDir;
        }
      }
      if (currentRunContext && typeof currentRunContext === "object") {
        currentRunContext.branchName = "";
        currentRunContext.repoBranchName = "";
        currentRunContext.repoPrimaryBranch = "";
        currentRunContext.repoBranchDir = "";
      }
      refreshProjectInfoBranchDisplay();
      refreshRepoBranchForProjectDir(manualDir, { force: true });
    };
    projectDirInput.addEventListener("input", handleProjectDirManualChange);
    projectDirInput.addEventListener("change", handleProjectDirManualChange);
  }

  const clearSnapshotProjectDir = () => {
    if (!currentSnapshotProjectDir) {
      return;
    }
    currentSnapshotProjectDir = "";
    if (currentRunContext && typeof currentRunContext === "object") {
      const fallbackDir =
        (projectDirInput && projectDirInput.value)
        || currentRunContext.projectDir
        || "";
      currentRunContext.effectiveProjectDir = normaliseProjectDir(fallbackDir);
    }
    updateProjectInfoProjectDir();
    try{ updateRunDirectoryNotice(currentRunContext && currentRunContext.effectiveProjectDir ? currentRunContext.effectiveProjectDir : (currentRunContext && currentRunContext.projectDir) ); }catch(e){}
  };

  const getMergeDisabledReason = () => {
    if (mergeInFlight) {
      return "in-flight";
    }
    if (runControlsDisabled) {
      return "run-controls";
    }
    if (!mergeReady) {
      return "not-ready";
    }
    return null;
  };

  const applyMergeButtonState = () => {
    if (!mergeButton) {
      return;
    }
    const shouldDisable = runControlsDisabled || mergeInFlight || !mergeReady;
    const disabledReason = shouldDisable ? getMergeDisabledReason() : null;
    mergeButton.disabled = shouldDisable;
    mergeButton.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
    mergeButton.classList.toggle("is-merge-ready", !shouldDisable);
    if (!shouldDisable) {
      mergeButton.title = "Merge current branch into the configured parent branch";
    } else if (disabledReason === "in-flight") {
      mergeButton.removeAttribute("title");
    } else {
      mergeButton.title = MERGE_DISABLED_TOOLTIP_TEXT;
    }
    syncMergeTooltipAvailability(shouldDisable, disabledReason);
  };

  const resetMergeState = () => {
    mergeReady = false;
    mergeInFlight = false;
    mergeDiffLockedAfterMerge = false;
    applyMergeButtonState();
    // Disable merge-diff button when merge state resets
    enableMergeDiffButtonForHash("", "", null);
    gitFpushActive = false;
    gitFpushDetectedChanges = false;
    gitFpushDetectedNoChanges = false;
    gitFpushOutputSection = "";
    pendingGitFpushHash = "";
    pendingGitFpushHashProjectDir = "";
    pendingGitFpushBranch = "";
    pendingGitFpushBranchProjectDir = "";
  };

  const setMergeReady = (ready) => {
    mergeReady = !!ready;
    applyMergeButtonState();
  };

  const enableAutoOpenMergeDiffIfAllowed = () => {
    if (hydratingRunFromHistory) {
      autoOpenMergeDiffOnEnable = false;
      return false;
    }
    autoOpenMergeDiffOnEnable = true;
    return true;
  };

  const handleGitFpushCompletionMessage = async (message) => {
    if (typeof message !== "string" || !message) {
      return;
    }
    const normalized = message.trim().toLowerCase();
    if (!normalized.includes("git_fpush.sh")) {
      return;
    }
    if (normalized.includes("git_fpush.sh exited with code 0")) {
      const hasDetectedChanges = gitFpushDetectedChanges
        || detectGitChangeIndicator(message);
      const hasNoChanges = !hasDetectedChanges && (gitFpushDetectedNoChanges
        || detectGitNoChangeIndicator(message));
      if (!hasDetectedChanges) {
        setMergeReady(false);
        enableMergeDiffButtonForHash("", "", null);
        pendingGitFpushHash = "";
        pendingGitFpushHashProjectDir = "";
        pendingGitFpushBranch = "";
        pendingGitFpushBranchProjectDir = "";
        if (hasNoChanges) {
          appendMergeChunk("\n--- git_fpush.sh: No changes to push ---\n", "output");
        }
        markGitFpushPhaseComplete();
        return;
      }

      setMergeReady(true);
      const effectiveProjectDir = (currentRunContext && currentRunContext.effectiveProjectDir)
        || currentRunContext.projectDir
        || "";
      // If git_fpush succeeded, try to enable the merge diff button by
      // extracting any commit hash from the output (e.g., a pushed commit) and
      // pre-generating the raw diff before showing the button.
      const detectedHash = extractFirstHashFromText(message);

      // Also try to extract a branch name emitted by git_fpush.sh and use it to enable the merge diff button.
      const branch = extractBranchFromText(message);
      enableAutoOpenMergeDiffIfAllowed();
      if (branch) {
        const finalOutput = await getFinalOutputFromRunRecord(currentRunContext.runId, effectiveProjectDir);
        enableMergeDiffAfterPrefetch({ branch, projectDirValue: effectiveProjectDir, finalOutput });
        consumePendingGitFpushDiff({ prefetchFirst: true });
        markGitFpushPhaseComplete();
        return;
      }

      if (detectedHash) {
        const finalOutput = await getFinalOutputFromRunRecord(currentRunContext.runId, effectiveProjectDir);
        enableMergeDiffAfterPrefetch({ hash: detectedHash, projectDirValue: effectiveProjectDir, finalOutput });
        consumePendingGitFpushDiff({ prefetchFirst: true });
        markGitFpushPhaseComplete();
        return;
      }

      if (consumePendingGitFpushDiff({ prefetchFirst: true })) {
        markGitFpushPhaseComplete();
        return;
      }
      markGitFpushPhaseComplete();
      return;
    }
    if (normalized.includes("git_fpush.sh exited with code")) {
      setMergeReady(false);
      consumePendingGitFpushDiff();
      markGitFpushPhaseComplete();
      return;
    }
    if (normalized.includes("git_fpush.sh skipped")) {
      setMergeReady(false);
      consumePendingGitFpushDiff();
      markGitFpushPhaseComplete();
      return;
    }
    if (
      normalized.includes("failed to run git_fpush.sh") ||
      normalized.includes("git_fpush.sh failed") ||
      normalized.includes("git_fpush.sh failed to start")
    ) {
      markGitFpushPhaseComplete();
    }
  };

  const enableMergeDiffButtonFromSavedRun = (run) => {
    if (!run || typeof run !== "object") {
      return;
    }

    if (Number(run.gitFpushExitCode) !== 0) {
      return;
    }

    const diffProjectDir =
      normaliseProjectDir(run.effectiveProjectDir)
      || normaliseProjectDir(run.projectDir)
      || normaliseProjectDir(currentSnapshotProjectDir)
      || (currentRunContext
        && normaliseProjectDir(
          currentRunContext.effectiveProjectDir
            || currentRunContext.projectDir
            || "",
        ))
      || "";

    const gitFpushChangeFlag = run.gitFpushDetectedChanges;
    const hasExplicitChanges = gitFpushChangeFlag === true;
    const hasExplicitNoChanges = gitFpushChangeFlag === false;

    const candidateTexts = [
      run.gitFpushFinalOutput,
      run.finalOutput,
      run.gitMergeStdout,
      run.gitMergeStderr,
      run.stdout,
      run.stderr,
    ];

    const hasGitChanges = hasExplicitChanges
      || candidateTexts.some((candidate) => detectGitChangeIndicator(candidate));
    if (hasExplicitNoChanges || !hasGitChanges) {
      setMergeReady(false);
      enableMergeDiffButtonForHash("", "", null);
      return;
    }

    setMergeReady(true);

    const branchFromRun = extractBranchFromRun(run);
    if (branchFromRun) {
      const finalOutput = resolveFinalOutputForSavedRun(run);
      enableMergeDiffButtonForBranch(branchFromRun, diffProjectDir, finalOutput);
    }

    for (const candidate of candidateTexts) {
      if (hasActiveMergeDiffLink()) {
        return;
      }
      tryEnableMergeDiffFromText(candidate, diffProjectDir, null);
    }
  };

  const stripSnapshotMarkerFromText = (text) => {
    if (typeof text !== "string") {
      return { sanitizedText: "", snapshotDir: "" };
    }

    if (text.indexOf(SNAPSHOT_MARKER) === -1) {
      return { sanitizedText: text, snapshotDir: "" };
    }

    const lines = text.split(/\r?\n/);
    const remainingLines = [];
    let detectedDir = "";

    lines.forEach((line) => {
      if (line.indexOf(SNAPSHOT_MARKER) === -1) {
        remainingLines.push(line);
        return;
      }

      if (!detectedDir) {
        const markerIndex = line.indexOf(SNAPSHOT_MARKER);
        const candidate = line.slice(markerIndex + SNAPSHOT_MARKER.length).trim();
        if (candidate) {
          detectedDir = candidate;
        }
      }
    });

    return { sanitizedText: remainingLines.join("\n"), snapshotDir: detectedDir };
  };

  const extractSnapshotDirFromRunDirectoryText = (text) => {
    if (typeof text !== "string") {
      return "";
    }
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/run directory:\s*(.+)$/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return "";
  };

  const getFileTreeStatusDisplayMessage = (message) => message || "";

  const setFileTreeStatus = (message, variant = "info") => {
    if (!fileTreeStatus) {
      return;
    }
    lastFileTreeStatusMessage = typeof message === "string" ? message : "";
    lastFileTreeStatusVariant = variant;
    fileTreeStatus.textContent = getFileTreeStatusDisplayMessage(lastFileTreeStatusMessage);
    fileTreeStatus.classList.remove("error", "success", "muted");
    if (variant === "error") {
      fileTreeStatus.classList.add("error");
    } else if (variant === "success") {
      fileTreeStatus.classList.add("success");
    } else if (variant === "muted") {
      fileTreeStatus.classList.add("muted");
    }
  };

  const resetFileTreeDisplay = (message, variant = "muted") => {
    currentFileTree = "";
    currentFileTreeProjectDir = "";
    lastFileTreeWasTruncated = false;
    if (fileTreeInput) {
      fileTreeInput.value = "";
    }
    if (typeof message === "string") {
      setFileTreeStatus(message, variant);
    } else {
      setFileTreeStatus("", "info");
    }
  };

  const updateFileTreeToggleButton = () => {
    if (!fileTreeToggleButton) {
      return;
    }
    fileTreeToggleButton.classList.toggle("is-active", sendFileTreeEnabled);
    fileTreeToggleButton.setAttribute("aria-pressed", sendFileTreeEnabled ? "true" : "false");
    fileTreeToggleButton.textContent = "Toggle sending file tree";
    fileTreeToggleButton.setAttribute(
      "aria-label",
      sendFileTreeEnabled ? "Disable sending file tree" : "Enable sending file tree",
    );
    fileTreeToggleButton.title = sendFileTreeEnabled
      ? "File tree will be sent to the AI."
      : "File tree will not be sent to the AI.";
  };

  if (fileTreeToggleButton) {
    updateFileTreeToggleButton();
    fileTreeToggleButton.addEventListener("click", () => {
      sendFileTreeEnabled = !sendFileTreeEnabled;
      updateFileTreeToggleButton();
      setFileTreeStatus(lastFileTreeStatusMessage, lastFileTreeStatusVariant);
    });
  }

  const updateGitFpushToggleButton = () => {
    if (!gitFpushToggleButton) {
      return;
    }
    gitFpushToggleButton.classList.toggle("is-active", gitFpushEnabled);
    gitFpushToggleButton.setAttribute("aria-pressed", gitFpushEnabled ? "true" : "false");
    gitFpushToggleButton.textContent = gitFpushEnabled ? "Disable git_fpush.sh" : "Enable git_fpush.sh";
    gitFpushToggleButton.setAttribute(
      "aria-label",
      gitFpushEnabled ? "Disable git_fpush.sh" : "Enable git_fpush.sh",
    );
    gitFpushToggleButton.title = gitFpushEnabled
      ? "git_fpush.sh will run after the Agent completes successfully."
      : "git_fpush.sh will be skipped after Agent runs.";
  };

  if (gitFpushToggleButton) {
    updateGitFpushToggleButton();
    gitFpushToggleButton.addEventListener("click", () => {
      gitFpushEnabled = !gitFpushEnabled;
      updateGitFpushToggleButton();
    });
  }

  const fetchFileTreeForProjectDir = async (projectDir) => {
    if (!fileTreeInput) {
      return;
    }

    const normalisedDir = normaliseProjectDir(projectDir);
    if (!normalisedDir) {
      if (fileTreeFetchAbortController) {
        fileTreeFetchAbortController.abort();
        fileTreeFetchAbortController = null;
      }
      resetFileTreeDisplay("Enter a project directory to load its file tree.", "muted");
      return;
    }

    if (fileTreeFetchAbortController) {
      fileTreeFetchAbortController.abort();
    }
    fileTreeFetchAbortController = new AbortController();

    setFileTreeStatus("Loading file tree…");
    fileTreeInput.value = "";
    currentFileTree = "";
    currentFileTreeProjectDir = "";
    lastFileTreeWasTruncated = false;

    try {
      const params = new URLSearchParams({ projectDir: normalisedDir });
      const response = await fetch(`/agent/file-tree?${params.toString()}`, {
        signal: fileTreeFetchAbortController.signal,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = payload?.error || `Failed to load file tree (status ${response.status}).`;
        throw new Error(errorMessage);
      }

      const rawTree = payload?.fileTree;
      const tree = typeof rawTree === "string"
        ? rawTree
        : rawTree && typeof rawTree === "object"
          ? JSON.stringify(rawTree, null, 2)
          : "";
      currentFileTree = tree.trimEnd();
      currentFileTreeProjectDir = normalisedDir;
      lastFileTreeWasTruncated = Boolean(payload?.truncated);
      fileTreeInput.value = tree;

      if (tree) {
        const statusMessage = lastFileTreeWasTruncated
          ? "File tree loaded (truncated for brevity)."
          : "File tree loaded.";
        setFileTreeStatus(statusMessage, "success");
      } else {
        setFileTreeStatus("Project directory is empty.", "muted");
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      resetFileTreeDisplay(error.message || "Failed to load file tree.", "error");
    } finally {
      if (fileTreeFetchAbortController) {
        fileTreeFetchAbortController = null;
      }
    }
  };

  const scheduleFileTreeFetch = (projectDir) => {
    if (!fileTreeInput) {
      return;
    }

    const valueToUse = typeof projectDir === "string"
      ? projectDir
      : projectDirInput
        ? projectDirInput.value
        : "";

    const normalisedValue = normaliseProjectDir(valueToUse);

    if (fileTreeFetchTimeoutId) {
      window.clearTimeout(fileTreeFetchTimeoutId);
      fileTreeFetchTimeoutId = null;
    }

    if (!normalisedValue) {
      if (fileTreeFetchAbortController) {
        fileTreeFetchAbortController.abort();
        fileTreeFetchAbortController = null;
      }
      resetFileTreeDisplay("Enter a project directory to load its file tree.", "muted");
      return;
    }

    fileTreeFetchTimeoutId = window.setTimeout(() => {
      fileTreeFetchTimeoutId = null;
      fetchFileTreeForProjectDir(normalisedValue);
    }, 500);
  };

  const fallbackAgentInstructions = [
    "Agent Instructions:",
    "Do not ask to commit changes, we run a script to automatically stage, commit, and push after you finish.",
    "Do not mention anything like \"The file is staged.\"",
    "Do not ask anything like \"Do you want me to run `git commit` with a message?\"",
    "Python command is available via \"python3 version\" Python 3.11.2",
    "Whenever you need to modify source files, skip git apply and instead programmatically read the target file, replace the desired text (or insert the new snippet) using a Python script (e.g., Path.read_text()/write_text()), then stage the changes.",
    "When starting, please check AGENTS.md in repository root for further instructions.",
    "Unless otherwise specified, NOW MAKE CODE CHANGES FOR THE USERS SPECIFIED REQUEST BELOW:",
    "-"
  ].join("\n");

  const urlSearchParams = new URLSearchParams(window.location.search);
  const repoDirectoryFromUrl = normaliseProjectDir(urlSearchParams.get("repo_directory"));
  updateRunsPageLink(currentRunContext.projectDir || repoDirectoryFromUrl, currentRunContext.runId);

  if (projectDirInput) {
    if (repoDirectoryFromUrl) {
      projectDirInput.value = repoDirectoryFromUrl;
    } else if (config.defaultProjectDir) {
      projectDirInput.value = config.defaultProjectDir;
    }
    updateGitLogLink();
  } else {
    updateGitLogLink();
  }
  updateRunsSidebarHeading(
    projectDirInput && projectDirInput.value
      ? projectDirInput.value
      : repoDirectoryFromUrl || codexDefaultProjectDir || "",
  );
  if (modelSelect && config.defaultModel) {
    updateModelSelectValue(config.defaultModel);
  }
  if (defaultModelInput && config.defaultModel) {
    defaultModelInput.value = config.defaultModel;
  }
  const configAgentInstructions =
    typeof config.defaultAgentInstructions === "string" && config.defaultAgentInstructions.trim()
      ? config.defaultAgentInstructions
      : "";
  if (agentInstructionsInput) {
    if (configAgentInstructions) {
      agentInstructionsInput.value = configAgentInstructions;
    } else if (!agentInstructionsInput.value) {
      agentInstructionsInput.value = fallbackAgentInstructions;
    }
  }

  const resolveEffectiveProjectDirForMerge = () =>
    normaliseProjectDir(
      currentSnapshotProjectDir
        || (currentRunContext && currentRunContext.effectiveProjectDir)
        || (projectDirInput && projectDirInput.value)
        || currentRunContext.projectDir
        || repoDirectoryFromUrl
        || codexDefaultProjectDir
        || "",
    );

  applyMergeButtonState();

  if (openRouterRefererInput) {
    // Use configured default if provided; otherwise fall back to http://alfe.sh
    let defaultReferer =
      typeof config.defaultOpenRouterReferer === "string" && config.defaultOpenRouterReferer && config.defaultOpenRouterReferer.trim()
        ? config.defaultOpenRouterReferer
        : "https://code-s.alfe.sh231";
    // If the input is empty, apply the default referer
    if (!openRouterRefererInput.value || openRouterRefererInput.value.trim() === "") {
      openRouterRefererInput.value = defaultReferer;
    }
  }

  if (openRouterTitleInput) {
    const defaultTitle =
      typeof config.defaultOpenRouterTitle === "string"
        ? config.defaultOpenRouterTitle
        : openRouterTitleInput.value;
    if (defaultTitle && !openRouterTitleInput.value) {
      openRouterTitleInput.value = defaultTitle;
    }
  }

  if (fileTreeInput) {
    setFileTreeStatus(
      "File tree will load automatically when a project directory is provided and will be sent to the AI by default.",
      "muted",
    );
  }

  const initialProjectDirForFileTree = normaliseProjectDir(
    projectDirInput && projectDirInput.value
      ? projectDirInput.value
      : config.defaultProjectDir || "",
  );

  if (initialProjectDirForFileTree) {
    fetchFileTreeForProjectDir(initialProjectDirForFileTree);
  } else if (fileTreeInput) {
    resetFileTreeDisplay("Enter a project directory to load its file tree.", "muted");
  }

  if (projectDirInput && fileTreeInput) {
    const handleProjectDirChange = () => {
      scheduleFileTreeFetch(projectDirInput.value);
      updateRunsSidebarHeading(projectDirInput ? projectDirInput.value : "");
    };

    projectDirInput.addEventListener("input", handleProjectDirChange);
    projectDirInput.addEventListener("change", handleProjectDirChange);
    projectDirInput.addEventListener("blur", handleProjectDirChange);
  }

  let eventSource = null;
  let streamClosedByServer = false;
  let activeOutputTab = "combined";
  let currentStdoutPrompt = "";
  let normalizedStdoutPrompt = "";
  let stdoutPromptLines = [];
  let stdoutPromptMatchIndex = 0;
  let hasRenderedStdoutPrompt = false;
  let stdoutPromptNormalizedFull = "";
  let stdoutPromptPendingBuffer = "";
  let suppressStdoutOutput = false;
  let skippingGitPullStdoutBlock = false;
  let followupRunActive = false;

  const gitPullUpdatingRegex = /^updating\s+[0-9a-f]+\.\.[0-9a-f]+/i;
  const gitPullRangeLineRegex = /^\s*[0-9a-f]{7,}\.\.[0-9a-f]{7,}\s+\S+\s+->\s+\S+/i;
  const gitPullBranchFetchRegex = /^\s*\*\s+branch\s+\S+\s+->\s+\S+/i;
  const gitDiffStatLineRegex = /\|\s+\d+\s+(?:[+\-]+|bin\s+\d+\s+->\s+\d+\s+bytes)$/i;
  const gitModeChangeRegex = /^\s*(?:create|delete)\s+mode\b/i;
  const gitRenameCopyRegex = /^\s*(?:rename|copy)\s+/i;
  const gitAlreadyUpToDateRegex = /^already up to date\.?$/i;
  const gitRemoteLineRegex = /^remote:\s/i;
  const gitFromRemoteRegex = /^from\s+\S+/i;
  const gitRemovedLineRegex = /^-+\s*removed\b/i;

  const isGitPullDiffStatLine = (line) => gitDiffStatLineRegex.test(line || "");

  const isGitPullBlockLine = (line, trimmed, trimmedLower) => {
    if (!trimmed) {
      return true;
    }

    if (/^fast-forward\b/i.test(trimmed)) {
      return true;
    }

    if (gitModeChangeRegex.test(trimmed)) {
      return true;
    }

    if (gitRenameCopyRegex.test(trimmedLower)) {
      return true;
    }

    if (gitRemovedLineRegex.test(trimmedLower)) {
      return true;
    }

    if (/^\d+\s+files?\s+changed\b/i.test(trimmed)) {
      return true;
    }

    if (isGitPullDiffStatLine(line)) {
      return true;
    }

    return false;
  };

  const resetStdoutPromptTracking = () => {
    currentStdoutPrompt = "";
    normalizedStdoutPrompt = "";
    stdoutPromptLines = [];
    stdoutPromptMatchIndex = 0;
    hasRenderedStdoutPrompt = false;
    stdoutPromptNormalizedFull = "";
    stdoutPromptPendingBuffer = "";
    skippingGitPullStdoutBlock = false;
  };

  const prepareStdoutPromptTracking = (prompt) => {
    resetStdoutPromptTracking();
    if (!prompt) {
      hasRenderedStdoutPrompt = true;
      return;
    }

    currentStdoutPrompt = prompt;
    normalizedStdoutPrompt = currentStdoutPrompt.trim().toLowerCase();

    const normalizedPrompt = prompt.replace(/\r/g, "");
    stdoutPromptNormalizedFull = normalizedPrompt;
    stdoutPromptLines = normalizedPrompt ? normalizedPrompt.split("\n") : [];
    if (!stdoutPromptLines.length) {
      hasRenderedStdoutPrompt = true;
    }
  };

  const getStdoutPromptPrefixMatchLength = (buffer) => {
    if (!buffer || !stdoutPromptNormalizedFull) {
      return 0;
    }

    const maxLength = Math.min(buffer.length, stdoutPromptNormalizedFull.length);
    for (let length = maxLength; length > 0; length -= 1) {
      if (buffer.slice(buffer.length - length) === stdoutPromptNormalizedFull.slice(0, length)) {
        return length;
      }
    }

    return 0;
  };

  const filterStdoutPromptFromText = (text) => {
    if (!text) {
      return "";
    }

    if (!stdoutPromptNormalizedFull || hasRenderedStdoutPrompt) {
      return text;
    }

    stdoutPromptPendingBuffer += text;

    const promptIndex = stdoutPromptPendingBuffer.indexOf(stdoutPromptNormalizedFull);
    if (promptIndex !== -1) {
      const beforePrompt = stdoutPromptPendingBuffer.slice(0, promptIndex);
      const afterPrompt = stdoutPromptPendingBuffer.slice(
        promptIndex + stdoutPromptNormalizedFull.length,
      );

      hasRenderedStdoutPrompt = true;
      stdoutPromptMatchIndex = 0;
      stdoutPromptPendingBuffer = "";

      if (afterPrompt) {
        return beforePrompt + afterPrompt;
      }

      return beforePrompt;
    }

    const prefixLength = getStdoutPromptPrefixMatchLength(stdoutPromptPendingBuffer);
    if (prefixLength < stdoutPromptPendingBuffer.length) {
      const flushLength = stdoutPromptPendingBuffer.length - prefixLength;
      const flushText = stdoutPromptPendingBuffer.slice(0, flushLength);
      stdoutPromptPendingBuffer = stdoutPromptPendingBuffer.slice(flushLength);
      return flushText;
    }

    return "";
  };

  const setActiveOutputTab = (tab) => {
    activeOutputTab = tab;

    if (fullOutputTabButton) {
      const isCombined = tab === "combined";
      fullOutputTabButton.classList.toggle("active", isCombined);
      fullOutputTabButton.setAttribute("aria-selected", isCombined ? "true" : "false");
      fullOutputTabButton.tabIndex = isCombined ? 0 : -1;
    }

    if (stdoutTabButton) {
      const isStdout = tab === "stdout";
      stdoutTabButton.classList.toggle("active", isStdout);
      stdoutTabButton.setAttribute("aria-selected", isStdout ? "true" : "false");
      stdoutTabButton.tabIndex = isStdout ? 0 : -1;
    }

    if (outputEl) {
      outputEl.classList.toggle("is-hidden", tab !== "combined");
    }

    if (stdoutOutputEl) {
      stdoutOutputEl.classList.toggle("is-hidden", tab !== "stdout");
    }

  };

  const hideStdoutTab = () => {
    if (outputTabsContainer) {
      outputTabsContainer.classList.add("is-hidden");
    }
    setActiveOutputTab("combined");
  // Merge output toggle handler
  if (mergeToggleButton) {
    mergeToggleButton.addEventListener('click', () => {
      mergeCollapsed = !mergeCollapsed;
      mergeToggleButton.setAttribute('aria-expanded', mergeCollapsed ? 'false' : 'true');
      mergeToggleButton.textContent = mergeCollapsed ? 'Show merge output' : 'Hide merge output';
      if (!mergeCollapsed) {
        // expand: render buffered output
        try {
          mergeOutputEl.classList.remove('is-hidden');
          mergeOutputEl.textContent = '';
          mergeOutputBuffer.forEach((entry) => { appendLinesToElement(mergeOutputEl, entry.text, entry.type); });
        } catch (e) { console.warn('Failed to expand merge output', e); }
      } else {
        // collapse: hide full output
        mergeOutputEl.classList.add('is-hidden');
      }
    });
  }

  };

  const shouldSkipStdoutLine = (line, index, linesArray) => {
    if (!hasRenderedStdoutPrompt && stdoutPromptLines.length > 0) {
      const expectedLine = stdoutPromptLines[stdoutPromptMatchIndex];
      if (typeof expectedLine === "string" && line === expectedLine) {
        stdoutPromptMatchIndex += 1;
        if (stdoutPromptMatchIndex >= stdoutPromptLines.length) {
          hasRenderedStdoutPrompt = true;
          stdoutPromptMatchIndex = 0;
        }
        return true;
      }

      if (stdoutPromptMatchIndex > 0) {
        stdoutPromptMatchIndex = 0;
        if (stdoutPromptLines[stdoutPromptMatchIndex] === line) {
          stdoutPromptMatchIndex = 1;
          if (stdoutPromptMatchIndex >= stdoutPromptLines.length) {
            hasRenderedStdoutPrompt = true;
            stdoutPromptMatchIndex = 0;
          }
          return true;
        }
      }
    }

    if (!line) {
      return false;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      return false;
    }

    if (/^\[trace\]/i.test(trimmed)) {
      return true;
    }

    const trimmedLower = trimmed.toLowerCase();

    if (gitPullUpdatingRegex.test(trimmedLower)) {
      skippingGitPullStdoutBlock = true;
      return true;
    }

    if (skippingGitPullStdoutBlock) {
      if (isGitPullBlockLine(line, trimmed, trimmedLower)) {
        return true;
      }
      skippingGitPullStdoutBlock = false;
    }

    if (
      gitAlreadyUpToDateRegex.test(trimmed) ||
      gitRemoteLineRegex.test(trimmedLower) ||
      gitFromRemoteRegex.test(trimmedLower) ||
      gitPullRangeLineRegex.test(trimmed) ||
      gitPullBranchFetchRegex.test(trimmedLower)
    ) {
      return true;
    }

    if (trimmedLower.includes("model_providers")) {
      return true;
    }

    if (/[├└]──/.test(line) || /^│/.test(trimmed)) {
      return true;
    }

    if (trimmed.endsWith("/") && index + 1 < linesArray.length) {
      const nextLine = linesArray[index + 1] || "";
      const nextTrimmed = nextLine.trim();
      if (/[├└]──/.test(nextLine) || /^│/.test(nextTrimmed)) {
        return true;
      }
    }

    if (normalizedStdoutPrompt) {
      if (trimmedLower === normalizedStdoutPrompt) {
        if (hasRenderedStdoutPrompt) {
          return true;
        }
        hasRenderedStdoutPrompt = true;
      }
    }

    return false;
  };

  const appendLinesToElement = (element, text, type = "output") => {
    if (!element || !text) {
      return;
    }

    let normalized = text.replace(/\r/g, "");
    if (type === "stdout") {
      normalized = filterStdoutPromptFromText(normalized);
    }
    if (["output", "stderr", "stdout", "meta"].includes(type)) {
      normalized = stripCodexUserPromptFromText(normalized);
    }

    if (!normalized) {
      return;
    }

    const lines = normalized.split(/\n/);
    const endsWithNewline = normalized.endsWith("\n");
    const fragment = document.createDocumentFragment();
    const lastLineComplete = element.dataset.endsWithNewline !== "0";
    const lastLineEl = element.lastElementChild;
    const canAppendToLastLine = !lastLineComplete
      && lastLineEl
      && lastLineEl.classList.contains("log-line")
      && (
        (type === "output" || type === "stdout")
          ? !["stderr", "meta", "status", "merge"].some((className) => lastLineEl.classList.contains(className))
          : lastLineEl.classList.contains(type)
      );
    const formatLineText = (line, isContinuation) => {
      if (type === "stderr") {
        return line ? line.replace(/^\[stderr\]\s*/i, "") : "";
      }
      if (type === "meta") {
        return isContinuation ? line : (line ? `[meta] ${line}` : "");
      }
      if (type === "status") {
        return isContinuation ? line : (line ? `[status] ${line}` : "");
      }
      return line;
    };

    if (canAppendToLastLine) {
      const firstLine = lines.shift();
      if (typeof firstLine === "string" && firstLine.length > 0) {
        lastLineEl.textContent += formatLineText(firstLine, true);
      }
    }

    lines.forEach((line, index) => {
      if (index === lines.length - 1 && line === "") {
        return;
      }

      if (type === "stdout" && shouldSkipStdoutLine(line, index, lines)) {
        return;
      }
      const span = document.createElement("span");
      span.classList.add("log-line");
      if (type && !["output", "stdout"].includes(type)) {
        span.classList.add(type);
      }

      span.textContent = formatLineText(line, false);

      fragment.appendChild(span);
    });

    element.appendChild(fragment);
    element.scrollTop = element.scrollHeight;
    element.dataset.endsWithNewline = endsWithNewline ? "1" : "0";
  };

  const ensureMergeOutputVisible = () => {
    if (!mergeOutputEl) {
      return false;
    }
    // show the outer container (summary) but keep full output collapsed by default
    const container = document.getElementById('mergeOutputContainer');
    if (container) { container.classList.remove('is-hidden'); }
    if (mergeCollapsed) {
      mergeOutputEl.classList.add('is-hidden');
    } else {
      mergeOutputEl.classList.remove('is-hidden');
    }
    return true;
};

const clearMergeOutput = () => {
    if (!mergeOutputEl) {
      return;
    }
    mergeOutputEl.textContent = "";
    mergeOutputBuffer = [];
    if (mergeSummaryEl) { mergeSummaryEl.textContent = ''; }
    // hide the container until merge clicked
    const container = document.getElementById('mergeOutputContainer');
    if (container) { container.classList.add('is-hidden'); }
};

const appendMergeChunk = (text, type = "output") => {
    if (!text) {
      return;
    }
    // Ensure the container (summary area) is visible when we receive merge output
    ensureMergeOutputVisible();
    // Buffer the raw merge output so we can show full content when expanded
    mergeOutputBuffer.push({ text: String(text), type: type });

    // If this is a status line, update the compact summary to show only the last status
    if (type === 'status') {
      const normalized = String(text || '').replace(/\r?\n$/, '');
      const lines = normalized.split(/\r?\n/).filter(Boolean);
      const lastLine = lines.length ? lines[lines.length - 1] : normalized;
      if (mergeSummaryEl) {
        mergeSummaryEl.textContent = `[status] ${lastLine}`;
      }
    }

    // Only render the full merge output when the user expands the merge section
    if (!mergeCollapsed) {
      // Re-render the whole buffer to ensure ordering is correct
      try {
        mergeOutputEl.textContent = '';
        mergeOutputBuffer.forEach((entry) => {
          appendLinesToElement(mergeOutputEl, entry.text, entry.type);
        });
      } catch (e) {
        console.warn('Failed to render expanded merge output', e);
      }
    }
  };

  const flushPendingStdoutPromptBuffer = () => {
    if (!stdoutPromptPendingBuffer) {
      return;
    }

    stdoutPromptPendingBuffer = "";
    if (!hasRenderedStdoutPrompt) {
      hasRenderedStdoutPrompt = true;
    }
  };

  const finalizeOutputViews = () => {
    if (!outputTabsContainer || !stdoutOutputEl) {
      return;
    }

    updateFinalOutputDisplay();
    if (followupRunActive) {
      return;
    }
    setActiveOutputTab(activeOutputTab || "combined");
  };

  const buildRunsDataUrl = (runIdValue, projectDirValue) => {
    const params = new URLSearchParams();
    const normalizedRunId = normaliseRunId(runIdValue);
    const normalizedProjectDir = normaliseProjectDir(projectDirValue);
    if (normalizedRunId) {
      params.set("run_id", normalizedRunId);
    }
    if (normalizedProjectDir) {
      params.set("repo_directory", normalizedProjectDir);
    }
    if (currentSessionId) {
      params.set("sessionId", currentSessionId);
    }
    const query = params.toString();
    return `/agent/runs/data${query ? `?${query}` : ""}`;
  };

  const fetchRunFromHistory = async (runIdValue, projectDirValue) => {
    const url = buildRunsDataUrl(runIdValue, projectDirValue);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load run history (status ${response.status})`);
    }
    const payload = await response.json().catch(() => ({}));
    const runs = Array.isArray(payload?.runs) ? payload.runs : [];
    if (!runs.length) {
      return null;
    }
    const normalizedRunId = normaliseRunId(runIdValue);
    if (normalizedRunId) {
      const exactMatch = runs.find((entry) => entry && entry.id === normalizedRunId);
      if (exactMatch) {
        return exactMatch;
      }
    }
    return runs[0] || null;
  };

  const summariseRunStatus = (run) => {
    if (!run || typeof run !== "object") {
      return "";
    }
    if (run.error) {
      return run.error;
    }
    if (run.finalMessage) {
      return run.finalMessage;
    }
    if (Number.isInteger(run.exitCode)) {
      return `Agent exited with code ${run.exitCode}.`;
    }
    const history = Array.isArray(run.statusHistory) ? run.statusHistory : [];
    if (history.length) {
      return history[history.length - 1] || "";
    }
    if (!run.finishedAt) {
      return "Run in progress…";
    }
    return "Run finished.";
  };

  const resolveFollowupSessionState = (run) => {
    if (!run || typeof run !== "object") {
      return "running";
    }
    if (run.error) {
      return "error";
    }
    if (run.finishedAt) {
      return "complete";
    }
    return "running";
  };

  const hydrateFollowupSessionFromRun = (run) => {
    if (!run || typeof run !== "object") {
      return null;
    }

    const promptText =
      (typeof run.userPrompt === "string" && run.userPrompt)
        || (typeof run.effectivePrompt === "string" && run.effectivePrompt)
        || "";
    const session = startFollowupSession(promptText);
    if (!session) {
      return null;
    }

    if (session.outputLogEl) {
      session.outputLogEl.innerHTML = "";
    }
    if (session.finalLogEl) {
      session.finalLogEl.innerHTML = "";
    }
    session.outputValue = "";
    session.finalValue = "";

    const statusHistory = Array.isArray(run.statusHistory) ? run.statusHistory : [];
    statusHistory.forEach((entry) => {
      if (entry) {
        appendLinesToElement(session.outputLogEl, entry, "status");
      }
    });

    const metaMessages = Array.isArray(run.metaMessages) ? run.metaMessages : [];
    metaMessages.forEach((entry) => {
      if (entry) {
        appendLinesToElement(session.outputLogEl, entry, "meta");
      }
    });

    if (run.stdout) {
      const stdoutText = run.qwenCli ? parseSavedQwenCliOutput(run.stdout) : run.stdout;
      if (stdoutText) {
        appendLinesToElement(session.outputLogEl, stdoutText, "output");
      }
    }

    if (run.stderr) {
      const stderrText = run.qwenCli ? parseSavedQwenCliOutput(run.stderr) : run.stderr;
      if (stderrText) {
        appendLinesToElement(session.outputLogEl, stderrText, "stderr");
      }
    }

    if (run.finalMessage && !run.error) {
      appendLinesToElement(session.outputLogEl, run.finalMessage, "status");
    }

    if (run.error) {
      appendLinesToElement(session.outputLogEl, run.error, "stderr");
    }

    const finalOutput = resolveFinalOutputForSavedRun(run);
    if (finalOutput) {
      session.finalValue = finalOutput;
      appendLinesToElement(session.finalLogEl, finalOutput, "output");
    }

    if (session.outputTabsContainer) {
      const hasFinalOutput = Boolean(session.finalValue && session.finalValue.trim());
      session.outputTabsContainer.classList.toggle("is-hidden", !hasFinalOutput);
    }

    setFollowupActiveTab(session, "combined");
    setFollowupSessionStatus(session, resolveFollowupSessionState(run));
    return session;
  };

  const loadFollowupRunsForParent = async (run) => {
    const parentId = normaliseRunId(run?.id || "");
    if (!parentId) {
      return [];
    }
    const runs = Array.isArray(runsSidebarRuns) ? runsSidebarRuns : [];
    const matchesFromSidebar = runs.filter((entry) => getFollowupParentId(entry) === parentId);
    if (matchesFromSidebar.length) {
      return matchesFromSidebar;
    }

    const projectDirHint = normaliseProjectDir(
      run?.requestedProjectDir || run?.projectDir || run?.effectiveProjectDir || "",
    );
    try {
      const url = buildRunsDataUrl("", projectDirHint);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load follow-up runs (status ${response.status})`);
      }
      const payload = await response.json().catch(() => ({}));
      const loadedRuns = Array.isArray(payload?.runs) ? payload.runs : [];
      return loadedRuns.filter((entry) => getFollowupParentId(entry) === parentId);
    } catch (error) {
      console.error("[Codex Runner] Failed to load follow-up runs", error);
    }
    return [];
  };

  const sortFollowupRuns = (runs) => {
    const list = Array.isArray(runs) ? runs.slice() : [];
    const getTimestamp = (run) => {
      const candidate =
        run?.startedAt
        || run?.createdAt
        || run?.updatedAt
        || run?.finishedAt
        || "";
      const timestamp = candidate ? new Date(candidate).getTime() : 0;
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };
    list.sort((a, b) => getTimestamp(a) - getTimestamp(b));
    return list;
  };

  const renderFollowupSessionsFromHistory = async (run) => {
    const followups = await loadFollowupRunsForParent(run);
    if (!followups.length) {
      return [];
    }

    const ordered = sortFollowupRuns(followups);
    ordered.forEach((followupRun) => {
      hydrateFollowupSessionFromRun(followupRun);
    });
    activeFollowupSession = null;
    followupRunActive = false;
    return ordered;
  };

  const renderRunFromHistory = async (run) => {
    if (!run || typeof run !== "object") {
      setStatus("Saved run not found.", "error");
      finalizeOutputViews();
      return;
    }

    hydratingRunFromHistory = true;
    autoOpenMergeDiffOnEnable = false;

    try {
      resetFollowupSessions();
      clearOutput();
      closeExistingStream(true);
      toggleButtons(false);
      resetMergeState();

      gitFpushDetectedChanges = run.gitFpushDetectedChanges === true;

      const resolvedProjectDir = normaliseProjectDir(
        run.requestedProjectDir || run.projectDir || run.effectiveProjectDir || "",
      );
      const resolvedEffectiveDir = normaliseProjectDir(run.effectiveProjectDir || "");

      const previousProjectDir = currentRunContext.projectDir;
      const nextProjectDir =
        resolvedProjectDir
        || previousProjectDir
        || repoDirectoryFromUrl
        || codexDefaultProjectDir
        || "";
      const nextEffectiveProjectDir =
        resolvedEffectiveDir
        || resolvedProjectDir
        || previousProjectDir
        || repoDirectoryFromUrl
        || codexDefaultProjectDir
        || "";

      const nextBranchName = extractBranchFromRun(run);
      currentRunContext = buildRunContext({
        projectDir: nextProjectDir,
        runId: normaliseRunId(run.id),
        effectiveProjectDir: nextEffectiveProjectDir,
        branchName: nextBranchName,
      });
      lastRequestedProjectDir = currentRunContext.projectDir;
      updateRunsSidebarHeading(currentRunContext.projectDir);
      updateProjectInfoProjectDir();
    try{ updateRunDirectoryNotice(currentRunContext && currentRunContext.effectiveProjectDir ? currentRunContext.effectiveProjectDir : (currentRunContext && currentRunContext.projectDir) ); }catch(e){}
      refreshProjectInfoBranchDisplay();

      setRunsSidebarActiveRun(currentRunContext.runId);
      const normalizedSidebarDir = normaliseProjectDir(currentRunContext.projectDir);
      if (normalizedSidebarDir) {
        if (
          normalizedSidebarDir !== lastRunsSidebarProjectDir
          || !runsSidebarRuns.length
        ) {
          loadRunsSidebar({ projectDir: normalizedSidebarDir, force: true, resetPage: true });
        } else {
          renderRunsSidebar(runsSidebarRuns, { preserveScroll: true });
        }
      }

    if (projectDirInput && currentRunContext.projectDir) {
      projectDirInput.value = currentRunContext.projectDir;
    }

    currentSnapshotProjectDir = "";
    if (resolvedEffectiveDir && resolvedEffectiveDir !== currentRunContext.projectDir) {
      currentSnapshotProjectDir = resolvedEffectiveDir;
    }
    updateGitLogLink();

    if (typeof run.gitFpushEnabled === "boolean") {
      gitFpushEnabled = run.gitFpushEnabled;
      updateGitFpushToggleButton();
    }

    if (modelSelect && typeof run.model === "string" && run.model.trim()) {
      updateModelSelectValue(run.model);
    }

    const promptValue =
      (typeof run.userPrompt === "string" && run.userPrompt)
        || (typeof run.effectivePrompt === "string" && run.effectivePrompt)
        || "";
    if (promptInput && promptValue) {
      promptInput.value = promptValue;
    }
    updatePromptPreview(promptValue);

    if (agentInstructionsInput && typeof run.agentInstructions === "string" && run.agentInstructions) {
      agentInstructionsInput.value = run.agentInstructions;
    }

    if (openRouterRefererInput && typeof run.openRouterReferer === "string" && run.openRouterReferer) {
      openRouterRefererInput.value = run.openRouterReferer;
    }

    if (openRouterTitleInput && typeof run.openRouterTitle === "string" && run.openRouterTitle) {
      openRouterTitleInput.value = run.openRouterTitle;
    }

    updatePageUrlForRun(currentRunContext.runId, currentRunContext.projectDir);
    updateRunsPageLink(currentRunContext.projectDir, currentRunContext.runId);

    prepareStdoutPromptTracking(
      (typeof run.effectivePrompt === "string" && run.effectivePrompt)
        || (typeof run.userPrompt === "string" && run.userPrompt)
        || "",
    );

    const badgeInfo = getSidebarBadgeInfo(run);
    const summary = summariseRunStatus(run);
    let statusVariant = run.error ? "error" : run.finishedAt ? "idle" : "active";

    if (badgeInfo?.variant === "merged") {
      statusVariant = "merged";
    }

    setStatus((badgeInfo?.text || summary || "Saved run loaded."), statusVariant);

    if (run.id) {
      appendChunk(`Restored saved run ${run.id.slice(0, 12)}.`, "status");
    } else {
      appendChunk("Restored saved run.", "status");
    }

    const statusHistory = Array.isArray(run.statusHistory) ? run.statusHistory : [];
    for (const entry of statusHistory) {
      if (entry) {
        appendChunk(entry, "status");
        await handleGitFpushCompletionMessage(entry);
      }
    }

    const metaMessages = Array.isArray(run.metaMessages) ? run.metaMessages : [];
    metaMessages.forEach((entry) => {
      if (entry) {
        appendChunk(entry, "meta");
      }
    });

    if (run.stdout) {
      const stdoutText = run.qwenCli ? parseSavedQwenCliOutput(run.stdout) : run.stdout;
      if (stdoutText) {
        appendChunk(stdoutText, "output");
      }
      captureGitFpushRevisionFromText(run.stdout);
      if (run.stdoutTruncated) {
        appendChunk("Stored stdout truncated for history view.", "status");
      }
    }

    if (run.stderr) {
      const stderrText = run.qwenCli ? parseSavedQwenCliOutput(run.stderr) : run.stderr;
      if (stderrText) {
        appendChunk(stderrText, "stderr");
      }
      captureGitFpushRevisionFromText(run.stderr);
      if (run.stderrTruncated) {
        appendChunk("Stored stderr truncated for history view.", "status");
      }
    }

    if (run.gitFpushExitCode !== null && run.gitFpushExitCode !== undefined) {
      appendChunk(`git_fpush.sh exited with code ${run.gitFpushExitCode}.`, "status");
      await handleGitFpushCompletionMessage(`git_fpush.sh exited with code ${run.gitFpushExitCode}.`);
    }

    if (run.finalMessage && !run.error) {
      appendChunk(run.finalMessage, "status");
      await handleGitFpushCompletionMessage(run.finalMessage);
    }

    if (run.error) {
      appendChunk(run.error, "stderr");
    }

    enableMergeDiffButtonFromSavedRun(run);

    // Ensure run controls are enabled after hydrating a saved run so the Merge button
    // can become active when appropriate (fixes missing View Diff / disabled Merge
    // after refreshing a completed task).
    try {
      setRunControlsDisabledState(false, { forceRefresh: true });
    } catch (e) { /* ignore */ }
    try { applyMergeButtonState(); } catch (e) { /* ignore */ }

    const hasHydratedFinalOutput = hydrateFinalOutputFromSavedRun(run);

    // Render persisted merge output if present
    if (run.gitMergeStdout) {
      appendMergeChunk(`\n--- Merge stdout ---\n${run.gitMergeStdout}`, "output");
    }
    tryEnableMergeDiffFromText(run.gitMergeStdout, currentRunContext && currentRunContext.projectDir ? currentRunContext.projectDir : '', null);

    // After restoring a saved run ensure run controls and merge button state are refreshed.
    try { setRunControlsDisabledState(false, { forceRefresh: true }); } catch (e) { /* ignore */ }
    try { applyMergeButtonState(); } catch (e) { /* ignore */ }

    if (run.gitMergeStderr) {
      appendMergeChunk(`\n--- Merge stderr ---\n${run.gitMergeStderr}`, "stderr");
    }

    finalizeOutputViews();
    try { setRunControlsDisabledState(false, { forceRefresh: true }); } catch (e) { /* ignore */ }
    try { applyMergeButtonState(); } catch (e) { /* ignore */ }

    const followupRuns = await renderFollowupSessionsFromHistory(run);
    if (Array.isArray(followupRuns) && followupRuns.length) {
      const latestFollowup = followupRuns[followupRuns.length - 1];
      const latestBranch = extractBranchFromRun(latestFollowup);
      const currentHref = mergeDiffButton ? mergeDiffButton.getAttribute('data-href') : '';
      const hasBranchDiff = typeof currentHref === 'string' && currentHref.includes('branch=');
      if (latestBranch && (!hasActiveMergeDiffLink() || !hasBranchDiff)) {
        enableMergeDiffButtonFromSavedRun(latestFollowup);
      }
    }

    if (hasHydratedFinalOutput) {
      setActiveOutputTab("stdout");
    } else {
      setActiveOutputTab("combined");
    }
    } finally {
      hydratingRunFromHistory = false;
      autoOpenMergeDiffOnEnable = false;
    }
  };

  const getProjectDirHintForHistory = () =>
    normaliseProjectDir(projectDirInput ? projectDirInput.value : "")
    || currentRunContext.projectDir
    || repoDirectoryFromUrl
    || codexDefaultProjectDir
    || "";

  const getRunsSidebarProjectDir = (overrideProjectDir) => {
    const override = normaliseProjectDir(overrideProjectDir);
    if (override) {
      return override;
    }
    return normaliseProjectDir(getProjectDirHintForHistory());
  };

  const setRunsSidebarLoadingState = (isLoading) => {
    // Maintain internal loading state but do not show a UI loading indicator
    // when the runs sidebar refreshes. Visual loading badge is intentionally
    // disabled to avoid UI noise.
    runsSidebarIsLoading = !!isLoading;
  };

  const setRunsSidebarError = (message) => {
    if (!runsSidebarErrorEl) {
      return;
    }
    if (message) {
      runsSidebarErrorEl.textContent = message;
      runsSidebarErrorEl.classList.remove("is-hidden");
    } else {
      runsSidebarErrorEl.textContent = "";
      runsSidebarErrorEl.classList.add("is-hidden");
    }
  };

  const updateRunsSidebarPaginationUI = () => {
    if (!runsSidebarPaginationEl) {
      return;
    }

    if (!runsSidebarFilteredTotal) {
      runsSidebarPaginationEl.classList.add("is-hidden");
      if (runsSidebarPrevPageButton) {
        runsSidebarPrevPageButton.disabled = true;
        runsSidebarPrevPageButton.setAttribute("aria-disabled", "true");
      }
      if (runsSidebarNextPageButton) {
        runsSidebarNextPageButton.disabled = true;
        runsSidebarNextPageButton.setAttribute("aria-disabled", "true");
      }
      if (runsSidebarArchiveAllButton) {
        runsSidebarArchiveAllButton.disabled = false;
        runsSidebarArchiveAllButton.setAttribute("aria-disabled", "false");
      }
      return;
    }

    runsSidebarPaginationEl.classList.remove("is-hidden");
    const totalRunsLabel = runsSidebarFilteredTotal === 1
      ? "1 run"
      : `${runsSidebarFilteredTotal} runs`;

    if (runsSidebarPageIndicator) {
      runsSidebarPageIndicator.textContent = `Page ${runsSidebarCurrentPage} of ${runsSidebarTotalPages} · ${totalRunsLabel}`;
    }
    if (runsSidebarPrevPageButton) {
      const disabled = runsSidebarCurrentPage <= 1;
      runsSidebarPrevPageButton.disabled = disabled;
      runsSidebarPrevPageButton.setAttribute("aria-disabled", disabled ? "true" : "false");
    }
    if (runsSidebarNextPageButton) {
      const disabled = runsSidebarCurrentPage >= runsSidebarTotalPages;
      runsSidebarNextPageButton.disabled = disabled;
      runsSidebarNextPageButton.setAttribute("aria-disabled", disabled ? "true" : "false");
    }
    if (runsSidebarArchiveAllButton) {
      runsSidebarArchiveAllButton.disabled = false;
      runsSidebarArchiveAllButton.setAttribute("aria-disabled", "false");
    }
  };

  const ensureRunVisibleInPagination = (runIdValue) => {
    const normalized = normaliseRunId(runIdValue);
    if (!normalized || !Array.isArray(runsSidebarFilteredRuns) || !runsSidebarFilteredRuns.length) {
      return false;
    }
    const index = runsSidebarFilteredRuns.findIndex((run) => normaliseRunId(run?.id || "") === normalized);
    if (index === -1) {
      return false;
    }
    const targetPage = Math.floor(index / RUNS_SIDEBAR_PAGE_SIZE) + 1;
    if (targetPage !== runsSidebarCurrentPage) {
      runsSidebarCurrentPage = targetPage;
      renderRunsSidebar(runsSidebarRuns, { preserveScroll: false });
      return true;
    }
    return false;
  };

  const formatSidebarRelativeTime = (value) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const diffMs = Date.now() - date.getTime();
    const absMs = Math.abs(diffMs);
    const isFuture = diffMs < 0;
    const units = [
      { limit: 60_000, divisor: 1_000, suffix: "s" },
      { limit: 3_600_000, divisor: 60_000, suffix: "m" },
      { limit: 86_400_000, divisor: 3_600_000, suffix: "h" },
      { limit: 604_800_000, divisor: 86_400_000, suffix: "d" },
      { limit: 2_629_800_000, divisor: 604_800_000, suffix: "w" },
      { limit: Infinity, divisor: 2_629_800_000, suffix: "mo" },
    ];

    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      if (absMs < unit.limit) {
        const rawValue = Math.round(absMs / unit.divisor) || 1;
        const clampedValue = Math.max(1, rawValue);
        if (isFuture) {
          return `in ${clampedValue}${unit.suffix}`;
        }
        return `${clampedValue}${unit.suffix} ago`;
      }
    }

    return "";
  };

  const getSidebarRunTitle = (run) => {
    if (!run || typeof run !== "object") {
      return "Run";
    }
    const promptLine = typeof run.userPrompt === "string" ? run.userPrompt.trim().split(/\r?\n/)[0] : "";
    if (promptLine) {
      return promptLine.length > 120 ? `${promptLine.slice(0, 117)}…` : promptLine;
    }
    const branch = ((run.branchName || run.gitBranch || run.branch || "") ?? "").toString().trim();
    const branchDisplayName = formatBranchDisplayName(branch);
    if (branchDisplayName) {
      return branchDisplayName.length > 120 ? `${branchDisplayName.slice(0, 117)}…` : branchDisplayName;
    }
    const idValue = run.id ? String(run.id).trim() : "";
    if (idValue) {
      return `Run ${idValue.slice(0, 12)}`;
    }
    return "Run";
  };

  const MERGE_SUCCESS_PATTERNS = [
    /git_merge_parent\.sh exited with code 0/i,
    /branch merged/i,
    /merge completed successfully/i,
    /merge succeeded/i,
    /merged successfully/i,
  ];

  const MERGE_IN_PROGRESS_PATTERNS = [
    /^merging\b/i,
  ];

  const isMergeInProgressStatus = (text) => {
    if (!text && text !== 0) {
      return false;
    }
    try {
      const candidate = String(text).trim();
      if (!candidate) {
        return false;
      }
      return MERGE_IN_PROGRESS_PATTERNS.some((pattern) => pattern.test(candidate));
    } catch (_err) {
      return false;
    }
  };

  const hasSuccessfulMerge = (run, latestStatusText) => {
    if (!run) return false;

    const numericExitCodes = [
      run?.gitMergeExitCode,
      run?.git_merge_parent_exit_code,
      run?.gitMergeExit,
      run?.git_merge_exit_code,
    ]
      .map((value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      })
      .filter((value) => value !== null);

    if (numericExitCodes.some((code) => code === 0)) {
      return true;
    }

    const textCandidates = [
      latestStatusText,
      run?.finalMessage,
      run?.gitMergeStdout,
      run?.gitMergeStderr,
      run?.git_merge_stdout,
      run?.git_merge_stderr,
    ];

    const history = Array.isArray(run?.statusHistory) ? run.statusHistory : [];
    history.forEach((entry) => textCandidates.push(entry));

    return textCandidates.some((candidate) => {
      if (!candidate && candidate !== 0) return false;
      try {
        const text = String(candidate);
        return MERGE_SUCCESS_PATTERNS.some((pattern) => pattern.test(text));
      } catch (e) {
        return false;
      }
    });
  };

  const getFollowupParentId = (run) => {
    if (!run || typeof run !== "object") {
      return "";
    }
    return normaliseRunId(
      run.followupParentId
      || run.followupParentRunId
      || run.followup_parent_id
      || run.followup_parent
      || "",
    );
  };

  const getSidebarBadgeInfo = (run, { hasActiveFollowup = false } = {}) => {
    if (hasActiveFollowup) {
      return { text: "Running", variant: "running" };
    }

    // determine a latest status text candidate for merge-detection
    let latestStatusText = '';
    if (Array.isArray(run?.statusHistory) && run.statusHistory.length) {
      latestStatusText = String(run.statusHistory[run.statusHistory.length - 1]) || '';
    }
    if (!latestStatusText && run?.finalMessage) {
      latestStatusText = String(run.finalMessage);
    }

    if (isMergeInProgressStatus(latestStatusText)) {
      return { text: "Merging", variant: "merging" };
    }

    if (hasSuccessfulMerge(run, latestStatusText)) {
      return { text: "Merged", variant: "merged" };
    }

    if (!run || typeof run !== "object") {
      return null;
    }
    if (!run.finishedAt) {
      return { text: "Running", variant: "running" };
    }
    if (run.error) {
      return { text: "Error", variant: "error" };
    }
    // If the run was ended due to connection issues, mark as Canceled (grey)
    try {
      const cancellationPatterns = [/connection closed/i, /connection interrupted/i, /connection (?:closed|interrupted)/i, /run cancell?ed by user/i, /run cancell?ed/i];
      const textCandidates = [];
      if (latestStatusText) textCandidates.push(latestStatusText);
      if (run?.finalMessage) textCandidates.push(String(run.finalMessage));
      if (Array.isArray(run?.statusHistory)) run.statusHistory.forEach((s) => { if (s) textCandidates.push(String(s)); });
      const isCanceled = textCandidates.some((candidate) => {
        if (!candidate && candidate !== 0) return false;
        try {
          const text = String(candidate);
          return cancellationPatterns.some((pattern) => pattern.test(text));
        } catch (e) {
          return false;
        }
      });
      if (isCanceled) {
        return { text: "Canceled", variant: "canceled" };
      }
    } catch (_err) { /* ignore */ }

    if (Number(run.gitFpushExitCode) === 0 || Number(run.exitCode) === 0 || run.finalMessage) {
      return { text: "Complete", variant: "success" };
    }
    if (Number.isFinite(Number(run.exitCode))) {
      return { text: `Exit ${run.exitCode}`, variant: "error" };
    }
    return null;
  };

  const doesRunMatchFilter = (run, filterValue) => {
    const trimmedFilter = typeof filterValue === "string" ? filterValue.trim().toLowerCase() : "";
    if (!trimmedFilter) {
      return true;
    }
    if (!run || typeof run !== "object") {
      return false;
    }
    const searchable = [
      run.id,
      run.branchName,
      run.gitBranch,
      run.projectDir,
      run.effectiveProjectDir,
      run.userPrompt,
      run.finalMessage,
    ]
      .filter((value) => value !== null && value !== undefined)
      .map((value) => value.toString().toLowerCase());

    return searchable.some((entry) => entry.includes(trimmedFilter));
  };

  const doesRunMatchRepository = (run, currentRepoDir) => {
    if (!currentRepoDir) {
      return true;
    }
    if (!run || typeof run !== "object") {
      return false;
    }
    const runProjectDir = normaliseProjectDir(run.projectDir || run.effectiveProjectDir || "");
    return runProjectDir === currentRepoDir;
  };

  const renderRunsSidebar = (runs, options = {}) => {
    if (!runsSidebarListEl) {
      return;
    }

    const { preserveScroll = false, resetPage = false } = options || {};
    if (resetPage) {
      runsSidebarCurrentPage = 1;
    }
    const previousScrollTop = preserveScroll ? runsSidebarListEl.scrollTop : 0;
    const previousInlineMinHeight = runsSidebarListEl.style.minHeight;
    const frozenHeight = runsSidebarListEl.getBoundingClientRect().height;
    if (frozenHeight > 0) {
      runsSidebarListEl.style.minHeight = `${frozenHeight}px`;
    }
    const scheduleHeightReset = () => {
      if (frozenHeight <= 0) {
        return;
      }
      const restore = () => {
        runsSidebarListEl.style.minHeight = previousInlineMinHeight || "";
      };
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(restore);
      } else {
        window.setTimeout(restore, 0);
      }
    };

    const filterValue = runsSidebarFilter ? runsSidebarFilter.trim().toLowerCase() : "";
    const activeFollowupParents = new Set();
    const followupFilteredRuns = Array.isArray(runs)
      ? runs.filter((run) => {
        const followupParentId = getFollowupParentId(run);
        if (followupParentId) {
          if (!run?.finishedAt) {
            activeFollowupParents.add(followupParentId);
          }
          return false;
        }
        return true;
      })
      : [];
    // Filter by archived state depending on archive view toggle
    const afterMatch = Array.isArray(followupFilteredRuns)
      ? followupFilteredRuns.filter((run) => doesRunMatchFilter(run, filterValue))
      : [];
    const filteredByArchiveState = afterMatch.filter((run) => runsSidebarShowArchived ? Boolean(run && run.archived) : !Boolean(run && run.archived));
    const currentRepoDir = normaliseProjectDir(currentSearchParams.get("repo_directory") || "");
    const filteredByRepository = filteredByArchiveState.filter((run) => doesRunMatchRepository(run, currentRepoDir));
    const filteredRuns = filteredByRepository;
    runsSidebarFilteredRuns = filteredRuns;
    runsSidebarFilteredTotal = filteredRuns.length;
    runsSidebarTotalPages = runsSidebarFilteredTotal > 0
      ? Math.max(1, Math.ceil(runsSidebarFilteredTotal / RUNS_SIDEBAR_PAGE_SIZE))
      : 1;
    if (!runsSidebarFilteredTotal) {
      runsSidebarCurrentPage = 1;
    } else {
      if (runsSidebarCurrentPage > runsSidebarTotalPages) {
        runsSidebarCurrentPage = runsSidebarTotalPages;
      }
      if (runsSidebarCurrentPage < 1) {
        runsSidebarCurrentPage = 1;
      }
    }
    const startIndex = (runsSidebarCurrentPage - 1) * RUNS_SIDEBAR_PAGE_SIZE;
    const endIndex = startIndex + RUNS_SIDEBAR_PAGE_SIZE;
    const pageRuns = filteredRuns.slice(startIndex, endIndex);

    const fragment = document.createDocumentFragment();
    const existingButtonsById = new Map();
    for (const child of Array.from(runsSidebarListEl.children)) {
      const existingId = child && child.dataset ? child.dataset.runId : "";
      if (existingId) {
        existingButtonsById.set(existingId, child);
      }
    }

    if (runsSidebarEmptyEl) {
      if (!runsSidebarFilteredTotal) {
        runsSidebarEmptyEl.textContent = filterValue
          ? (runsSidebarShowArchived ? "No archived runs match your search." : "No runs match your search.")
          : (runsSidebarShowArchived ? "No archived runs." : "No runs recorded yet.");
        runsSidebarEmptyEl.classList.remove("is-hidden");
      } else {
        runsSidebarEmptyEl.classList.add("is-hidden");
      }
    }

    if (!pageRuns.length) {
      runsSidebarListEl.replaceChildren(fragment);
      scheduleHeightReset();
      refreshProjectInfoBranchDisplay();
      updateRunsSidebarPaginationUI();
      return;
    }

    pageRuns.forEach((run) => {
      const normalizedRunId = normaliseRunId(run?.id || "");
      const projectDirForRun = normaliseProjectDir(run?.projectDir || run?.effectiveProjectDir || "");
      const isActive = Boolean(normalizedRunId) && normalizedRunId === runsSidebarSelectedRunId;

      // Try to reuse an existing DOM node to avoid blinking
      let button = null;
      if (normalizedRunId) {
        button = existingButtonsById.get(normalizedRunId) || null;
        if (button) {
          existingButtonsById.delete(normalizedRunId);
        }
      }

      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "runs-sidebar__item";
        if (normalizedRunId) {
          button.dataset.runId = normalizedRunId;
        }

        const header = document.createElement("div");
        header.className = "runs-sidebar__item-header";
        const number = document.createElement("span");
        number.className = "runs-sidebar__item-number";
        header.appendChild(number);
        const title = document.createElement("div");
        title.className = "runs-sidebar__item-title";
        header.appendChild(title);
        button.appendChild(header);

        const meta = document.createElement("div");
        meta.className = "runs-sidebar__item-meta";
        button.appendChild(meta);

        // Archive / Unarchive button (appears on hover)
        (function(){
          const archiveBtn = document.createElement('button');
          archiveBtn.type = 'button';
          archiveBtn.className = 'runs-sidebar__archive-btn';
          archiveBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = button && button.dataset && button.dataset.runId;
            if (!id) return;
            archiveBtn.disabled = true;
            archiveBtn.classList.add('is-active');
            try {
              const action = archiveBtn.dataset.archived === '1' ? 'unarchive' : 'archive';
              const url = `/agent/run/${id}/${action}`;
              const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
              if (!resp.ok) {
                console.error('[Codex Runner] Failed to archive/unarchive run', resp.status);
              } else {
                await loadRunsSidebar({ projectDir: getProjectDirHintForHistory(), force: true });
              }
            } catch (err) { console.error('[Codex Runner] Archive action failed', err); }
            finally { archiveBtn.disabled = false; archiveBtn.classList.remove('is-active'); }
          });
          button.appendChild(archiveBtn);
        })();

        button.addEventListener("click", () => {
          const buttonRunId = normaliseRunId(button.dataset && button.dataset.runId ? button.dataset.runId : "");
          if (!buttonRunId) {
            return;
          }
          const projectDirFromDataset = normaliseProjectDir(button.dataset && button.dataset.projectDir ? button.dataset.projectDir : "");
          const isButtonActive = buttonRunId === runsSidebarSelectedRunId;
          if (buttonRunId === runsSidebarSelectedRunId) {
            return;
          }
          const activeRunId = runsSidebarSelectedRunId || (currentRunContext && currentRunContext.runId) || "";
          const activeRun = activeRunId && Array.isArray(runsSidebarRuns)
            ? runsSidebarRuns.find((run) => normaliseRunId(run?.id || "") === activeRunId)
            : null;
          const isActiveRunRunning = Boolean(runInFlight) || Boolean(activeRun && !activeRun.finishedAt);
          if (isActiveRunRunning && activeRunId && buttonRunId !== activeRunId) {
            const targetProjectDir = projectDirFromDataset || getProjectDirHintForHistory();
            const baseHref = buildRunsPageHref(targetProjectDir);
            const targetHref = `${baseHref}#run=${encodeURIComponent(buttonRunId)}`;
            window.open(targetHref, "_blank", "noopener,noreferrer");
            return;
          }
          setRunsSidebarActiveRun(buttonRunId);
          loadRunFromHistory(buttonRunId, projectDirFromDataset || getProjectDirHintForHistory());
        });
      }

      // Update common properties for both new and existing elements
      try {
        button.className = 'runs-sidebar__item';
        if (isActive) button.classList.add('is-active');
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.classList.remove('is-disabled');
        button.setAttribute('aria-disabled', 'false');
      } catch (_e) { /* ignore */ }

      if (normalizedRunId) {
        button.dataset.runId = normalizedRunId;
      } else if (button.dataset) {
        delete button.dataset.runId;
      }

      if (projectDirForRun) {
        button.dataset.projectDir = projectDirForRun;
      } else if (button.dataset) {
        delete button.dataset.projectDir;
      }

      const titleEl = button.querySelector('.runs-sidebar__item-title');
      if (titleEl) titleEl.textContent = getSidebarRunTitle(run);

      const numberEl = button.querySelector('.runs-sidebar__item-number');
      if (numberEl) {
        numberEl.textContent = '';
        numberEl.classList.add('is-hidden');
        try {
          numberEl.setAttribute('aria-hidden', 'true');
        } catch (_e) { /* ignore */ }
      }

      const metaEl = button.querySelector('.runs-sidebar__item-meta');
      if (metaEl) {
        // badge
        const badgeInfo = getSidebarBadgeInfo(run, {
          hasActiveFollowup: Boolean(normalizedRunId && activeFollowupParents.has(normalizedRunId)),
        });
        let badge = metaEl.querySelector('.runs-sidebar__badge');
        if (badgeInfo) {
          if (!badge) { badge = document.createElement('span'); badge.className = `runs-sidebar__badge runs-sidebar__badge--${badgeInfo.variant}`; metaEl.appendChild(badge); }
          badge.className = `runs-sidebar__badge runs-sidebar__badge--${badgeInfo.variant}`;
          badge.textContent = badgeInfo.text;
        } else if (badge) { badge.remove(); }

        // time
        const timestampSource = run?.finishedAt || run?.updatedAt || run?.startedAt || run?.createdAt || "";
        const relativeTime = formatSidebarRelativeTime(timestampSource);
        let timeEl = metaEl.querySelector('.runs-sidebar__item-time');
        if (relativeTime) {
          if (!timeEl) { timeEl = document.createElement('span'); timeEl.className = 'runs-sidebar__item-time'; metaEl.appendChild(timeEl); }
          timeEl.textContent = relativeTime;
          try { timeEl.title = timestampSource ? new Date(timestampSource).toLocaleString() : ''; } catch(_e) { timeEl.title = timestampSource; }
        } else if (timeEl) { timeEl.remove(); }

        // branch
        const branch = ((run?.branchName || run?.gitBranch || run?.branch || "") ?? "").toString().trim();
        const branchDisplayName = formatBranchDisplayName(branch);
        let branchEl = metaEl.querySelector('.runs-sidebar__branch');
        if (branchDisplayName) {
          if (!branchEl) { branchEl = document.createElement('span'); branchEl.className = 'runs-sidebar__branch'; metaEl.appendChild(branchEl); }
          branchEl.textContent = branchDisplayName;
        } else if (branchEl) { branchEl.remove(); }

        // update archive button state without recreating it
        const archiveBtn = button.querySelector('.runs-sidebar__archive-btn');
        if (archiveBtn) {
          archiveBtn.textContent = run && run.archived ? 'Unarchive' : 'Archive';
          archiveBtn.title = run && run.archived ? 'Unarchive run' : 'Archive run';
          archiveBtn.dataset.archived = run && run.archived ? '1' : '0';
        }
      }

      fragment.appendChild(button);
    });

    runsSidebarListEl.replaceChildren(fragment);
    runsSidebarListEl.scrollTop = preserveScroll ? previousScrollTop : 0;

    scheduleHeightReset();
    refreshProjectInfoBranchDisplay();
    updateRunsSidebarPaginationUI();
  };

  const loadRunsSidebar = async ({ projectDir, force, skipIfLoading, resetPage } = {}) => {
    if (!runsSidebarListEl) {
      return;
    }

    if (skipIfLoading && runsSidebarIsLoading) {
      return;
    }

    const targetProjectDir = getRunsSidebarProjectDir(projectDir);
    updateRunsSidebarHeading(targetProjectDir);
    const projectDirChanged = targetProjectDir !== lastRunsSidebarProjectDir;
    const shouldResetPage = Boolean(resetPage) || projectDirChanged;
    const shouldFetch = force || projectDirChanged || !runsSidebarRuns.length;
    if (!shouldFetch) {
      renderRunsSidebar(runsSidebarRuns, {
        preserveScroll: !shouldResetPage,
        resetPage: shouldResetPage,
      });
      return;
    }

    lastRunsSidebarProjectDir = targetProjectDir;
    setRunsSidebarLoadingState(true);
    setRunsSidebarError("");

    try {
      const url = buildRunsDataUrl("", targetProjectDir);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load runs (status ${response.status})`);
      }
      const payload = await response.json().catch(() => ({}));
      const runs = Array.isArray(payload?.runs) ? payload.runs : [];
      runsSidebarRuns = runs;
      renderRunsSidebar(runsSidebarRuns, {
        preserveScroll: !shouldResetPage,
        resetPage: shouldResetPage,
      });
    } catch (error) {
      console.error("[Codex Runner] Failed to load runs for sidebar", error);
      setRunsSidebarError(error?.message || "Runs could not be loaded.");
    } finally {
      setRunsSidebarLoadingState(false);
    }
  };

  const loadRunFromHistory = async (runIdValue, projectDirValue) => {
    const normalizedRunId = normaliseRunId(runIdValue);
    if (!normalizedRunId) {
      return;
    }

    setRunsSidebarActiveRun(normalizedRunId);

    try {
      closeExistingStream(true);
      setStatus("Loading saved run…");
      const run = await fetchRunFromHistory(normalizedRunId, projectDirValue);
      if (!run) {
        setStatus("Saved run not found.", "error");
        finalizeOutputViews();
        return;
      }
      await renderRunFromHistory(run);
    } catch (error) {
      console.error("[Codex Runner] Failed to load saved run", error);
      setStatus("Failed to load saved run.", "error");
      appendChunk(error.message || "Unable to load saved run.", "stderr");
      finalizeOutputViews();
    }
  };

  const maybeLoadRunFromHash = (hashValue) => {
    const parsedRunId = parseRunIdFromHash(hashValue || "");
    if (!parsedRunId) {
      return;
    }
    if (parsedRunId === currentRunContext.runId && outputEl && outputEl.textContent.trim()) {
      return;
    }
    loadRunFromHistory(parsedRunId, getProjectDirHintForHistory());
  };

  if (runsSidebarFilterInput) {
    runsSidebarFilterInput.addEventListener("input", (event) => {
      runsSidebarFilter = event.target && typeof event.target.value === "string"
        ? event.target.value
        : "";
      renderRunsSidebar(runsSidebarRuns, { preserveScroll: false, resetPage: true });
    });
  }

  if (runsSidebarPrevPageButton) {
    runsSidebarPrevPageButton.addEventListener("click", () => {
      if (runsSidebarCurrentPage > 1) {
        runsSidebarCurrentPage -= 1;
        renderRunsSidebar(runsSidebarRuns, { preserveScroll: false });
      }
    });
  }

  if (runsSidebarNextPageButton) {
    runsSidebarNextPageButton.addEventListener("click", () => {
      if (runsSidebarCurrentPage < runsSidebarTotalPages) {
        runsSidebarCurrentPage += 1;
        renderRunsSidebar(runsSidebarRuns, { preserveScroll: false });
      }
    });
  }

  if (runsSidebarArchiveAllButton) {
    runsSidebarArchiveAllButton.addEventListener("click", async () => {
      if (runsSidebarArchiveAllButton.dataset.archiving === "true") {
        return;
      }
      const previousLabel = runsSidebarArchiveAllButton.textContent;
      runsSidebarArchiveAllButton.dataset.archiving = "true";
      runsSidebarArchiveAllButton.classList.add("is-active");
      runsSidebarArchiveAllButton.textContent = "Archiving…";
      try {
        const targetProjectDir = getRunsSidebarProjectDir();
        const query = currentSessionId ? `?sessionId=${encodeURIComponent(currentSessionId)}` : "";
        const response = await fetch(`/agent/runs/archive-all${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo_directory: targetProjectDir }),
        });
        if (!response.ok) {
          console.error("[Codex Runner] Failed to archive all runs", response.status);
        } else {
          await loadRunsSidebar({ projectDir: getProjectDirHintForHistory(), force: true, resetPage: true });
        }
      } catch (error) {
        console.error("[Codex Runner] Archive all runs failed", error);
      } finally {
        runsSidebarArchiveAllButton.textContent = previousLabel;
        delete runsSidebarArchiveAllButton.dataset.archiving;
        runsSidebarArchiveAllButton.classList.remove("is-active");
        updateRunsSidebarPaginationUI();
      }
    });
  }

  if (runsSidebarRefreshButton) {
    runsSidebarRefreshButton.addEventListener("click", () => {
      loadRunsSidebar({ projectDir: getProjectDirHintForHistory(), force: true });
    });
  }

  if (runsSidebarOpenRunsButton) {
    runsSidebarOpenRunsButton.addEventListener("click", () => {
      const fallbackHref = buildRunsPageHref(getProjectDirHintForHistory(), runsSidebarSelectedRunId);
      const href = runsSidebarOpenRunsButton.dataset.href || fallbackHref;
      window.open(href, "_blank", "noopener,noreferrer");
    });
  }

  if (runsSidebarArchiveToggle) {
    runsSidebarArchiveToggle.addEventListener("click", () => {
      runsSidebarShowArchived = !runsSidebarShowArchived;
      runsSidebarArchiveToggle.setAttribute('aria-pressed', runsSidebarShowArchived ? 'true' : 'false');
      // Update archived UI visibility and reload the runs list to reflect archived / active view
      updateArchivedUI();
      loadRunsSidebar({ projectDir: getProjectDirHintForHistory(), force: true, resetPage: true });
    });
  }

  if (runsSidebarNewTaskButton) {
    runsSidebarNewTaskButton.addEventListener("click", () => {
      // If the agent is currently running (eventSource active OR status shows running),
      // open the New Task in a new tab to allow starting another task concurrently.
      const statusText = (statusTextEl && statusTextEl.textContent) || (statusEl && statusEl.textContent) || '';
      const isRunning = !!eventSource || (typeof statusText === 'string' && statusText.trim().toLowerCase() === 'running...');

      if (isRunning) {
        try {
          // Build the new task URL using current project dir hint so the new tab has context.
          const projectDir = getProjectDirHintForHistory() || '';
          const newTaskUrl = new URL('/agent', window.location.origin);
          if (projectDir) {
            newTaskUrl.searchParams.set('repo_directory', projectDir);
          }
          window.open(newTaskUrl.toString(), '_blank', 'noopener,noreferrer');
          return;
        } catch (e) {
          // fallback to default behaviour if window.open fails
          console.warn('[Codex Runner] Failed to open new tab for New Task', e);
        }
      }

      if (runsSidebarNewTaskButton.disabled) {
        return;
      }
      prepareNewTask();
    });
  }

  if (collapsedNewTaskBtn) {
    collapsedNewTaskBtn.addEventListener("click", () => {
      // Forward to the main New Task button when available so behavior is consistent.
      try {
        if (typeof runsSidebarNewTaskButton !== 'undefined' && runsSidebarNewTaskButton) {
          runsSidebarNewTaskButton.click();
          return;
        }
        // Fallback: call prepareNewTask directly if available.
        if (typeof prepareNewTask === 'function') {
          prepareNewTask();
        }
      } catch (e) {
        console.warn('[Codex Runner] collapsedNewTaskBtn handler error', e);
      }
    });
  }
  if (backToCurrentTasksLink) {
    backToCurrentTasksLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      runsSidebarShowArchived = false;
      updateArchivedUI();
      loadRunsSidebar({ projectDir: getProjectDirHintForHistory(), force: true, resetPage: true });
    });
  }


  if (projectDirInput) {
    projectDirInput.addEventListener("change", () => {
      loadRunsSidebar({ projectDir: projectDirInput.value, force: true, resetPage: true });
    });
  }

  if (runsSidebarListEl) {
    updateArchivedUI();
    loadRunsSidebar({
      projectDir: initialProjectDir || codexDefaultProjectDir || getProjectDirHintForHistory(),
      force: true,
      resetPage: true,
    });

    if (!runsSidebarRefreshIntervalId) {
      runsSidebarRefreshIntervalId = window.setInterval(() => {
        loadRunsSidebar({
          projectDir: getProjectDirHintForHistory(),
          force: true,
          skipIfLoading: true,
        });
      }, RUNS_SIDEBAR_REFRESH_INTERVAL_MS);
    }
  }

  if (fullOutputTabButton) {
    fullOutputTabButton.addEventListener("click", () => {
      setActiveOutputTab("combined");
    });
  }

  if (stdoutTabButton) {
    stdoutTabButton.addEventListener("click", () => {
      setActiveOutputTab("stdout");
    });
  }

  setActiveOutputTab("combined");

  if (gitLogLink) {
    gitLogLink.addEventListener("click", () => {
      updateGitLogLink();
    });
  }



  // When a run is merged we want the Runs sidebar to reflect this immediately
  const markRunMergedInSidebar = (runId, message) => {
    try {
      const id = normaliseRunId(runId || (currentRunContext && currentRunContext.runId) || '');
      if (!id) return;
      if (!Array.isArray(runsSidebarRuns) || !runsSidebarRuns.length) return;
      const target = runsSidebarRuns.find((r) => normaliseRunId(r?.id || '') === id);
      if (!target) return;
      // Ensure statusHistory exists and record merged message
      if (!Array.isArray(target.statusHistory)) target.statusHistory = [];
      if (typeof message === 'string' && message.trim()) {
        target.statusHistory.push(message);
        target.finalMessage = message;
      } else {
        target.statusHistory.push('Merged');
        target.finalMessage = 'Merged';
      }
      // Set merge-exit code to 0 so legacy checks also detect success
      try { target.gitMergeExitCode = 0; } catch (e) { /* ignore */ }
      // Re-render the sidebar immediately to show merged badge
      try { renderRunsSidebar(runsSidebarRuns, { preserveScroll: true }); } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  };

  const setStatus = (message, variant = "active") => {
    if (!statusEl) {
      return;
    }

    const textTarget = statusTextEl || statusEl;
    if (statusTextEl) {
      statusTextEl.classList.remove("status-text-running");
      statusTextEl.classList.remove("status-text-merged");
    }

    const safeMessage =
      typeof message === "string" ? message : String(message ?? "");
    textTarget.textContent = safeMessage;
    statusEl.classList.remove("error", "status-idle");

    if (variant === "error") {
      statusEl.classList.add("error");
    } else if (variant === "idle") {
      statusEl.classList.add("status-idle");
    } else if (variant === "merged") {
      // Add merged styling class (purple)
      statusEl.classList.remove('error','status-idle');
      // status text element will receive the gradient class below
      // Immediately mark the run as merged in the Runs sidebar to bypass the
      // normal heartbeat refresh delay. This is a special-case for merges so
      // the UI reflects the merged state instantly.
      try {
        markRunMergedInSidebar((currentRunContext && currentRunContext.runId) || '', message || 'Merged');
      } catch (e) { /* ignore */ }
      lockMergeDiffButton();
    }

    if (runButton) {
      try {
        if (variant === "active") {
          if(runButtonLabel){ runButtonLabel.textContent = 'Cancel Run'; } else if(runButton){ if(runButtonLabel){ runButtonLabel.textContent = 'Cancel Run'; } else if(runButton){ runButton.textContent = 'Cancel Run'; } }
          runButton.classList.add("is-cancel");
          runButton.dataset.mode = "cancel";
          runButton.setAttribute("aria-pressed", "true");
        } else {
          if(runButtonLabel){ runButtonLabel.textContent = 'Run Agent'; } else if(runButton){ if(runButtonLabel){ runButtonLabel.textContent = 'Run Agent'; } else if(runButton){ runButton.textContent = 'Run Agent'; } }
          runButton.classList.remove("is-cancel");
          delete runButton.dataset.mode;
          runButton.removeAttribute("aria-pressed");
        }
      } catch (e) {
        /* ignore DOM update errors */
      }
    }

    if (statusTextEl) {
      const normalized = safeMessage.trim().replace(/\u2026/g, "...");
      const lower = normalized.toLowerCase();
      if (lower === "running..." || lower === "merging...") {
        statusTextEl.classList.add("status-text-running");
      } else if (lower === "merged." || lower === "merged") {
        statusTextEl.classList.add("status-text-merged");
      }
    }

    try {
      updateFinalOutputDisplay();
    } catch (_error) {
      /* ignore final output refresh errors */
    }
  };

  const prepareNewTask = () => {
    if (eventSource) {
      return;
    }

    clearOutput();
    clearMergeOutput();
    resetFollowupSessions();
    setActiveOutputTab("combined");
    finalizeOutputViews();
    flushPendingStdoutPromptBuffer();
    resetMergeState();
    toggleButtons(false);
    setStatus("", "idle");
    updatePromptPreview("");

    const hintProjectDir = getProjectDirHintForHistory();
    const normalizedDir = normaliseProjectDir(hintProjectDir)
      || normaliseProjectDir(currentRunContext.projectDir)
      || repoDirectoryFromUrl
      || codexDefaultProjectDir
      || "";

    currentRunContext = buildRunContext({
      projectDir: normalizedDir,
      runId: "",
      effectiveProjectDir: normalizedDir,
      branchName: "",
    });
    lastRequestedProjectDir = normalizedDir;
    currentSnapshotProjectDir = "";

    updateRunsSidebarHeading(normalizedDir);
    updateProjectInfoProjectDir();
    try{ updateRunDirectoryNotice(currentRunContext && currentRunContext.effectiveProjectDir ? currentRunContext.effectiveProjectDir : (currentRunContext && currentRunContext.projectDir) ); }catch(e){}
    refreshProjectInfoBranchDisplay();
    updateGitLogLink();
    updatePageUrlForRun("", normalizedDir);
    updateRunsPageLink(normalizedDir, "");
    setRunsSidebarActiveRun("");
    setRunsSidebarError("");

    if (runsSidebarListEl) {
      renderRunsSidebar(runsSidebarRuns, { preserveScroll: false });
      runsSidebarListEl.scrollTop = 0;
    }

    if (modelSelect) {
      const fallbackModel = config.defaultModel || config.defaultCodexModel || "";
      if (fallbackModel) {
        updateModelSelectValue(fallbackModel);
      }
    }

    try {
      if (promptInput) {
        promptInput.value = "";
        promptInput.focus();
      }
    } catch (_error) {
      /* ignore focus errors */
    }
  };

  const clearOutput = () => {
    if (outputEl) {
      outputEl.textContent = "";
    }
    resetFinalOutput();
    resetStdoutPromptTracking();
    suppressStdoutOutput = false;
    hideStdoutTab();
    resetGitFpushRevisionNotice();
  };

  const toggleButtons = (disabled) => {
    if (runButton) {
      // Keep the Run/Stop button enabled while in cancel mode so users can stop the agent.
      const isCancelMode = runButton.classList.contains('is-cancel') || runButton.dataset.mode === 'cancel';
      runButton.disabled = disabled && !isCancelMode;
      try {
        if (disabled && !isCancelMode) {
          if(runButtonLabel){ runButtonLabel.textContent = 'Cancel Run'; } else if(runButton){ runButton.textContent = 'Cancel Run'; }
          runButton.classList.add('is-cancel');
        } else {
          if(runButtonLabel){ runButtonLabel.textContent = 'Run Agent'; } else if(runButton){ if(runButtonLabel){ runButtonLabel.textContent = 'Run Agent'; } else if(runButton){ runButton.textContent = 'Run Agent'; } }
          runButton.classList.remove('is-cancel');
        }
      } catch (e) { /* ignore DOM update errors */ }
    }
    if (modelSelect) {
      modelSelect.disabled = disabled;
    }
    if (modelPromptSelect) {
      modelPromptSelect.disabled = disabled;
    }
    if (engineSelectInline) {
      engineSelectInline.disabled = disabled;
    }
    if (promptInput) {
      try {
        const isEmpty = (typeof promptInput.value === 'string' && promptInput.value.trim() === '');
        // Allow typing into an empty prompt even when run controls are disabled
        promptInput.disabled = disabled && !isEmpty;
        promptInput.setAttribute('aria-disabled', promptInput.disabled ? 'true' : 'false');
      } catch (e) {
        promptInput.disabled = disabled;
      }
    }
    if (agentInstructionsInput) {
      agentInstructionsInput.disabled = disabled;
    }
    if (openRouterRefererInput) {
      openRouterRefererInput.disabled = disabled;
    }
    if (openRouterTitleInput) {
      openRouterTitleInput.disabled = disabled;
    }
    if (defaultModelInput) {
      defaultModelInput.disabled = disabled;
    }
    if (defaultModelSaveButton) {
      defaultModelSaveButton.disabled = disabled;
    }
    if (saveAgentInstructionsButton) {
      saveAgentInstructionsButton.disabled = disabled;
    }
    if (fileTreeToggleButton) {
      fileTreeToggleButton.disabled = disabled;
    }
    if (fileTreeField) {
      try { fileTreeField.disabled = disabled; } catch (e) { /* ignore */ }
    }
    if (fileTreeStatus) {
      try { fileTreeStatus.disabled = disabled; } catch (e) { /* ignore */ }
    }
    if (mergeButton) {
      mergeButton.disabled = disabled || !mergeReady;
      mergeButton.setAttribute('aria-disabled', mergeButton.disabled ? 'true' : 'false');
    }
    if (mergeDiffButton) {
      mergeDiffButton.disabled = disabled || !mergeReady;
      mergeDiffButton.setAttribute('aria-disabled', mergeDiffButton.disabled ? 'true' : 'false');
    }
    if (gitFpushToggleButton) {
      gitFpushToggleButton.disabled = disabled;
    }
    if (gitFpushField) {
      try { gitFpushField.disabled = disabled; } catch (e) { /* ignore */ }
    }
    if (openEditorTopButton) {
      openEditorTopButton.disabled = disabled;
    }
    if (testPythonButton) {
      updateTestPythonButtonState();
    }
    if (runsSidebarOpenRunsButton) {
      runsSidebarOpenRunsButton.disabled = disabled;
    }
    if (runsSidebarFilterInput) {
      runsSidebarFilterInput.disabled = disabled;
    }
  }

  // When on agent page, make Stop refresh instead of performing normal behavior
  try {
    if (typeof window !== 'undefined' && window.location && typeof window.location.pathname === 'string' && /(^|\/)agent(\/|$)/.test(window.location.pathname)) {
      runButton && runButton.addEventListener('click', (ev) => {
        try {
          if (!runButton || runButton.disabled) {
            return;
          }
          const isCancelMode = runButton.classList.contains('is-cancel') || runButton.dataset.mode === 'cancel';
          if (isCancelMode) {
            ev.preventDefault();
            window.location.reload();
            return;
          }
          if (form) {
            ev.preventDefault();
            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit();
            } else {
              form.submit();
            }
          }
        } catch (_e) { /* ignore */ }
      });
    }
  } catch (_e) { /* ignore */ }
;

  const showDefaultModelFeedback = (message, variant = "info") => {
    if (!defaultModelFeedback) {
      return;
    }
    defaultModelFeedback.textContent = message;
    defaultModelFeedback.classList.remove("hidden", "error", "success");
    if (variant === "error") {
      defaultModelFeedback.classList.add("error");
    } else if (variant === "success") {
      defaultModelFeedback.classList.add("success");
    }
  };

  const showAgentInstructionsFeedback = (message, variant = "info") => {
    if (!agentInstructionsFeedback) {
      return;
    }
    agentInstructionsFeedback.textContent = message;
    agentInstructionsFeedback.classList.remove("hidden", "error", "success");
    if (variant === "error") {
      agentInstructionsFeedback.classList.add("error");
    } else if (variant === "success") {
      agentInstructionsFeedback.classList.add("success");
    }
  };

  const appendChunk = (text, type = "output") => {
    if (type === "meta" && !shouldDisplayMeta()) {
      return;
    }
    // Route merge-related output to the separate merge output field
    if (type === "merge") {
      appendMergeChunk(text);
      return;
    }

    if (!followupRunActive) {
      appendLinesToElement(outputEl, text, type);
    }
    appendToActiveFollowupSession(text, type);
  };

  if (testPythonButton) {
    testPythonButton.addEventListener("click", async () => {
      if (pythonTestInFlight) {
        return;
      }

      pythonTestInFlight = true;
      updateTestPythonButtonState();
      const logPrefix = "[Python test]";
      updatePythonTestResult("Testing python command…");
      appendChunk(`${logPrefix} Testing python command availability…`, "meta");
      setStatus("Testing python command…");

      try {
        const response = await fetch("/agent/test-python", {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`Test request failed (status ${response.status})`);
        }

        const data = await response.json();
        const attempts = Array.isArray(data?.attempts) ? data.attempts : [];
        const formatAttempt = (attempt) => {
          if (!attempt || typeof attempt !== "object") {
            return "";
          }
          const command = typeof attempt.command === "string" ? attempt.command.trim() : "";
          const lines = command ? [`$ ${command}`] : [];
          if (typeof attempt.exitCode === "number") {
            lines.push(`exit code: ${attempt.exitCode}`);
          }
          const stdout = typeof attempt.stdout === "string" ? attempt.stdout.trim() : "";
          const stderr = typeof attempt.stderr === "string" ? attempt.stderr.trim() : "";
          const errorText = typeof attempt.error === "string" ? attempt.error.trim() : "";
          if (stdout) {
            lines.push(`stdout: ${stdout}`);
          }
          if (stderr) {
            lines.push(`stderr: ${stderr}`);
          }
          if (errorText) {
            lines.push(`error: ${errorText}`);
          }
          return lines.join("\n");
        };

        const attemptsSummary = attempts
          .map((attempt) => formatAttempt(attempt))
          .filter((block) => block)
          .join("\n\n");

        if (attemptsSummary) {
          appendChunk(`${logPrefix} Attempts:\n${attemptsSummary}`, data?.success ? "meta" : "stderr");
        }

        const rawMessage = typeof data?.message === "string" ? data.message.trim() : "";
        const message = rawMessage || (data?.success
          ? "Python command is available."
          : "Python command is not available.");

        if (data?.success) {
          appendChunk(`${logPrefix} ${message}`, "meta");
          updatePythonTestResult(message, "success");
          setStatus(message, "idle");
        } else {
          appendChunk(`${logPrefix} ${message}`, "stderr");
          updatePythonTestResult(message, "error");
          setStatus(message, "error");
        }
      } catch (error) {
        const fallbackMessage = error?.message || "Failed to test python command.";
        appendChunk(`[Python test] ${fallbackMessage}`, "stderr");
        updatePythonTestResult(fallbackMessage, "error");
        setStatus(fallbackMessage, "error");
        console.error("[Codex Runner] Python test failed", error);
      } finally {
        pythonTestInFlight = false;
        updateTestPythonButtonState();
      }
    });
  }

  /// Tracks stderr output to extract the post-"codex" commit message for the Final output tab.
  let stderrCommitBuffer = "";
  let finalOutputText = "";
  let followupFinalOutputText = "";
  let qwenCliRunActive = false;
  let followupQwenCliRunActive = false;
  let qwenCliOutputText = "";
  let followupQwenCliOutputText = "";
  let qwenCliJsonBuffer = "";
  let followupQwenCliJsonBuffer = "";
  const FINAL_OUTPUT_LOADING_MESSAGE = "Final output is still generating…";

  const getActiveFinalOutputText = () => (followupRunActive ? followupFinalOutputText : finalOutputText);
  const getActiveQwenCliRunActive = () => (followupRunActive ? followupQwenCliRunActive : qwenCliRunActive);
  const getActiveQwenCliOutputText = () => (followupRunActive ? followupQwenCliOutputText : qwenCliOutputText);
  const getActiveQwenCliJsonBuffer = () => (followupRunActive ? followupQwenCliJsonBuffer : qwenCliJsonBuffer);

  const setActiveFinalOutputText = (value) => {
    if (followupRunActive) {
      followupFinalOutputText = value;
    } else {
      finalOutputText = value;
    }
  };

  const setActiveQwenCliRunActive = (value) => {
    if (followupRunActive) {
      followupQwenCliRunActive = value;
    } else {
      qwenCliRunActive = value;
    }
  };

  const setActiveQwenCliOutputText = (value) => {
    if (followupRunActive) {
      followupQwenCliOutputText = value;
    } else {
      qwenCliOutputText = value;
    }
  };

  const setActiveQwenCliJsonBuffer = (value) => {
    if (followupRunActive) {
      followupQwenCliJsonBuffer = value;
    } else {
      qwenCliJsonBuffer = value;
    }
  };

  const resetFinalOutput = () => {
    stderrCommitBuffer = "";
    finalOutputText = "";
    followupFinalOutputText = "";
    qwenCliOutputText = "";
    followupQwenCliOutputText = "";
    qwenCliJsonBuffer = "";
    followupQwenCliJsonBuffer = "";
    qwenCliRunActive = false;
    followupQwenCliRunActive = false;
    if (stdoutOutputEl) {
      stdoutOutputEl.innerHTML = "";
    }
  };

  const stripInitialHeaders = (text) => {
    if (typeof text !== "string" || !text) {
      return "";
    }

    const lines = text.split(/\r?\n/);
    let index = 0;

    while (index < lines.length && lines[index].trim() === "") {
      index += 1;
    }

    const firstContentIndex = index;
    let removedHeader = false;

    const headerMatchers = [
      /^#{1,6}\s+\S/, // Markdown heading
      /^\*\*[^*]+\*\*$/, // Bold line such as **Result**
      /^__[^_]+__$/, // Underlined header
      /^[^:]+:\s*$/, // Title followed by a colon
    ];

    while (index < lines.length) {
      const trimmed = lines[index].trim();

      if (trimmed === "") {
        index += 1;
        continue;
      }

      const isHeader = headerMatchers.some((regex) => regex.test(trimmed));

      if (!isHeader) {
        break;
      }

      removedHeader = true;
      index += 1;

      while (index < lines.length && lines[index].trim() === "") {
        index += 1;
      }
    }

    if (!removedHeader) {
      index = firstContentIndex;
    }

    return lines.slice(index).join("\n");
  };

  const stripGitFpushOutput = (text, { preserveTrailingNewlines = false } = {}) => {
    if (typeof text !== "string" || !text) {
      return "";
    }
    const normalized = text.replace(/\r/g, "");
    const lines = normalized.split("\n");
    const outputLines = [];
    let gitFpushStarted = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().includes("git_fpush.sh")) {
        continue;
      }
      if (trimmed.startsWith("---Initial Git Status:")) {
        gitFpushStarted = true;
        continue;
      }
      if (gitFpushStarted) {
        continue;
      }
      outputLines.push(line);
    }

    const joined = outputLines.join("\n");
    if (preserveTrailingNewlines) {
      return joined;
    }
    return joined.replace(/\n+$/, "");
  };

  const stripGitPullOutput = (text, { preserveTrailingNewlines = false } = {}) => {
    if (typeof text !== "string" || !text) {
      return "";
    }
    const normalized = text.replace(/\r/g, "");
    const lines = normalized.split("\n");
    const outputLines = [];

    const ignoreMatchers = [
      /^from\s+\S+/i,
      /^\s*\*\s+\[new branch\]/i,
      /^[0-9a-f]{6,}\.\.[0-9a-f]{6,}\s+/i,
      /^updating\s+[0-9a-f]{6,}\.\.[0-9a-f]{6,}/i,
      /^fast-forward\b/i,
      /^\s*create mode \d+\s+/i,
      /^\s*\S+\s+\|\s+\d+/,
      /^\s*\d+\s+files? changed,/i,
      /^\s*\d+\s+insertions?\(\+\)/i,
      /^\s*\d+\s+deletions?\(-\)/i,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        outputLines.push(line);
        continue;
      }
      const shouldIgnore = ignoreMatchers.some((matcher) => matcher.test(trimmed));
      if (shouldIgnore) {
        continue;
      }
      outputLines.push(line);
    }

    const joined = outputLines.join("\n");
    if (preserveTrailingNewlines) {
      return joined;
    }
    return joined.replace(/\n+$/, "");
  };

  const stripQwenCliOutput = (
    text,
    {
      preserveTrailingNewlines = false,
      stripQwenMetaLines = !qwenShowDebugInfo,
    } = {},
  ) => {
    if (typeof text !== "string" || !text) {
      return "";
    }
    const normalized = stripSystemReminderTags(text.replace(/\r/g, ""), { preserveTrailingNewlines: true });
    const lines = normalized.split("\n");
    const outputLines = [];

    const ignoreMatchers = [
      /^git@github\.com:/i,
      /permission denied \(publickey\)/i,
      /fatal:\s*could not read from remote repository/i,
      /please make sure you have the correct access rights/i,
      /warning:\s*git pull failed/i,
      /continuing without updated changes/i,
      /switched to a new branch/i,
      /and the repository exists\./i,
      /^__STERLING_SNAPSHOT_DIR__=/i,
      /^already up to date\./i,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        outputLines.push(line);
        continue;
      }
      const shouldIgnore = ignoreMatchers.some((matcher) => matcher.test(trimmed))
        || (stripQwenMetaLines && /^\[info]/i.test(trimmed));
      if (shouldIgnore) {
        continue;
      }
      outputLines.push(line);
    }

    const joined = outputLines.join("\n");
    if (preserveTrailingNewlines) {
      return joined;
    }
    return joined.replace(/\n+$/, "");
  };

  const stripSystemReminderTags = (text, { preserveTrailingNewlines = false } = {}) => {
    if (typeof text !== "string" || !text) {
      return "";
    }

    const removedTaggedBlocks = text.replace(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi, "");
    if (preserveTrailingNewlines) {
      return removedTaggedBlocks;
    }
    return removedTaggedBlocks.replace(/\n+$/, "");
  };

  const extractFinalOutputFromCommitBlock = (text) => {
    if (typeof text !== "string" || !text) {
      return "";
    }

    const sanitized = text.replace(/\r/g, "");
    const sentinelRegex = /(^|\n)codex(\n|$)/gi;
    let match;
    let commitStart = -1;

    while ((match = sentinelRegex.exec(sanitized)) !== null) {
      const prefixLength = match[1] ? match[1].length : 0;
      commitStart = match.index + prefixLength + "codex".length;
    }

    if (commitStart === -1) {
      return "";
    }

    if (sanitized.charAt(commitStart) === "\n") {
      commitStart += 1;
    }

    const finalOutputRaw = sanitized.slice(commitStart).replace(/^\n+/, "");
    const normalisedFinalOutput = finalOutputRaw.trimEnd();
    const cleanedFinalOutput = stripInitialHeaders(normalisedFinalOutput);
    return stripGitPullOutput(cleanedFinalOutput);
  };

  const normalizeQwenDisplayText = (value) => {
    if (typeof value !== "string" || !value) {
      return "";
    }
    return stripSystemReminderTags(value
      .replace(/\r/g, "")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\"/g, "\"")
      .replace(/\\\\/g, "\\"));
  };

  const collectQwenDisplayMessagesFromEvent = (parsed) => {
    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    const suppressToolOutput = (toolName) => toolName === "todo_write";

    const messages = [];

    if (parsed.type === "assistant" && parsed.message && Array.isArray(parsed.message.content)) {
      for (const contentItem of parsed.message.content) {
        if (!contentItem || typeof contentItem !== "object") {
          continue;
        }
        const isTextLikeContent =
          (contentItem.type === "text" && typeof contentItem.text === "string")
          || (contentItem.type === "thinking" && typeof contentItem.thinking === "string");

        if (isTextLikeContent) {
          const rawText = contentItem.type === "thinking" ? contentItem.thinking : contentItem.text;
          const normalized = normalizeQwenDisplayText(rawText).trim();
          if (normalized) {
            messages.push(normalized);
          }
          continue;
        }

        if (contentItem.type === "tool_use" && typeof contentItem.name === "string" && contentItem.name) {
          if (!suppressToolOutput(contentItem.name)) {
            messages.push(`Using tool: ${contentItem.name}`);
          }
        }
      }
    }

    if (parsed.type === "user" && parsed.message && Array.isArray(parsed.message.content)) {
      for (const contentItem of parsed.message.content) {
        if (!contentItem || typeof contentItem !== "object") {
          continue;
        }

        if (contentItem.type === "tool_result" && typeof contentItem.content === "string") {
          const normalized = normalizeQwenDisplayText(contentItem.content).trim();
          const isTodoWriteReminder = normalized.includes("Todos have been modified successfully")
            && normalized.includes("continue to use the todo list");
          if (!isTodoWriteReminder && normalized) {
            messages.push(normalized);
          }
        }
      }
    }

    return messages;
  };

  const extractQwenResultFromStreamJson = (text) => {
    if (typeof text !== "string" || !text) {
      return "";
    }

    const lines = text.replace(/\r/g, "").split("\n");
    let resolvedResult = "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.charAt(0) !== "{" || !line.includes('"type"')) {
        continue;
      }

      const parsed = safeParseJson(line);
      if (!parsed || parsed.type !== "result") {
        continue;
      }

      if (typeof parsed.result === "string") {
        const cleaned = normalizeQwenDisplayText(parsed.result).trim();
        if (cleaned) {
          resolvedResult = cleaned;
        }
      }
    }

    return resolvedResult;
  };

  const resolveFinalOutputForSavedRun = (run) => {
    if (!run || typeof run !== "object") {
      return "";
    }

    const normaliseCandidate = (value, { qwenCli = false } = {}) => {
      if (typeof value !== "string") {
        return "";
      }
      const trimmed = value.replace(/\r/g, "").trim();
      if (!trimmed) {
        return "";
      }
      const cleaned = qwenCli ? stripGitFpushOutput(stripQwenCliOutput(trimmed)) : trimmed;
      if (!cleaned) {
        return "";
      }
      return stripGitPullOutput(stripInitialHeaders(cleaned));
    };

    // If the run explicitly recorded final output fields, prefer them.
    const directCandidates = [
      run.finalOutput,
      run.gitFpushFinalOutput,
      run.git_fpush_final_output,
    ];

    for (const candidate of directCandidates) {
      const normalised = normaliseCandidate(candidate, { qwenCli: run.qwenCli === true });
      if (normalised) {
        return normalised;
      }
    }

    // Some LLMs (notably multi-part streaming or non-OpenAI providers) embed the final
    // result in the run stderr/stdout as a commit block prefixed by a sentinel.
    // Previously we only extracted these after the run finished; however, for the
    // gpt-oss-20b provider we can get the final output earlier in `run.stderr` or
    // `run.stdout`. Attempt to extract and return immediately so the UI can show it
    // without a full refresh.
    const stderrCandidate = extractFinalOutputFromCommitBlock(run.stderr);
    if (stderrCandidate) {
      return stderrCandidate;
    }

    const stdoutCandidate = extractFinalOutputFromCommitBlock(run.stdout);
    if (stdoutCandidate) {
      return stdoutCandidate;
    }

    if (run.qwenCli === true) {
      const stdoutText = typeof run.stdout === "string" ? run.stdout : "";
      const stderrText = typeof run.stderr === "string" ? run.stderr : "";
      const combinedText = stdoutText && stderrText
        ? `${stdoutText}${stdoutText.endsWith("\n") ? "" : "\n"}${stderrText}`
        : (stdoutText || stderrText);
      const streamJsonResult = extractQwenResultFromStreamJson(combinedText);
      if (streamJsonResult) {
        return stripGitPullOutput(stripInitialHeaders(streamJsonResult));
      }
      if (combinedText) {
        return stripGitFpushOutput(stripQwenCliOutput(combinedText));
      }
    }

    return "";
  };

  const hydrateFinalOutputFromSavedRun = (run) => {
    const resolved = resolveFinalOutputForSavedRun(run);
    if (!resolved) {
      return false;
    }

    setActiveFinalOutputText(resolved);
    return true;
  };

  const cleanStderrChunkForCommit = (text) => {
    if (typeof text !== "string" || !text) {
      return "";
    }
    return text
      .replace(/\r/g, "")
      .split(/\n/)
      .map((line) => line.replace(/^\[stderr\]\s*/i, ""))
      .join("\n");
  };

  const updateFinalOutputDisplay = () => {
    updateActiveFollowupFinalOutput();

    if (followupRunActive) {
      return;
    }

    if (stdoutOutputEl) {
      stdoutOutputEl.innerHTML = "";
      if (!runInFlight && finalOutputText) {
        appendLinesToElement(stdoutOutputEl, finalOutputText, "output");
      }
    }

    if (outputTabsContainer) {
      const hasFinalOutput = typeof finalOutputText === "string" && finalOutputText.trim() !== "";
      const shouldShowFinalOutput = hasFinalOutput && !runInFlight;
      outputTabsContainer.classList.toggle("is-hidden", !shouldShowFinalOutput);
      if (!shouldShowFinalOutput && activeOutputTab === "stdout") {
        setActiveOutputTab("combined");
      }
    }
  };

  const extractCommitMessageFromBuffer = () => {
    if (!stderrCommitBuffer) {
      return;
    }

    const sentinelRegex = /(^|\n)codex(\n|$)/g;
    let match = sentinelRegex.exec(stderrCommitBuffer);
    let lastMatch = match;

    while (match !== null) {
      lastMatch = match;
      match = sentinelRegex.exec(stderrCommitBuffer);
    }

    if (!lastMatch) {
      return;
    }

    const sentinelStart = lastMatch.index + (lastMatch[1] ? lastMatch[1].length : 0);
    const sentinelEnd = sentinelStart + "codex".length;
    let commitStart = sentinelEnd;
    if (stderrCommitBuffer.charAt(commitStart) === "\n") {
      commitStart += 1;
    }

    const commitMessage = stderrCommitBuffer.slice(commitStart).replace(/^\n+/, "");
    const normalisedCommitMessage = commitMessage.trimEnd();
    const cleanedCommitMessage = stripGitPullOutput(stripInitialHeaders(normalisedCommitMessage));

    const currentFinalOutput = getActiveFinalOutputText();
    if (cleanedCommitMessage !== currentFinalOutput) {
      setActiveFinalOutputText(cleanedCommitMessage);
    }

    updateFinalOutputDisplay();

    const sentinelSliceStart = Math.max(0, lastMatch.index);
    stderrCommitBuffer = stderrCommitBuffer.slice(sentinelSliceStart);
  };

  const processCommitMessageChunk = (chunk) => {
    const cleanedChunk = cleanStderrChunkForCommit(chunk);
    if (!cleanedChunk) {
      return;
    }
    stderrCommitBuffer += cleanedChunk;
    extractCommitMessageFromBuffer();
  };

  const appendQwenCliOutputChunk = (chunk) => {
    if (!getActiveQwenCliRunActive()) {
      return chunk;
    }
    if (gitFpushActive) {
      return "";
    }
    if (typeof chunk !== "string" || !chunk) {
      return "";
    }

    const displayLines = [];
    const updatedBuffer = `${getActiveQwenCliJsonBuffer()}${chunk}`;
    const lines = updatedBuffer.replace(/\r/g, "").split("\n");
    const remainder = lines.pop() || "";
    setActiveQwenCliJsonBuffer(remainder);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const parsed = safeParseJson(line);
      if (!parsed) {
        const passthrough = stripQwenCliOutput(rawLine).trim();
        if (passthrough) {
          displayLines.push(passthrough);
        }
        continue;
      }

      const eventMessages = collectQwenDisplayMessagesFromEvent(parsed);
      if (eventMessages.length) {
        displayLines.push(...eventMessages);
      }

      if (parsed.type === "result" && typeof parsed.result === "string") {
        const parsedResult = normalizeQwenDisplayText(parsed.result).trim();
        if (parsedResult) {
          setActiveQwenCliOutputText(parsedResult);
          setActiveFinalOutputText(parsedResult);
          updateFinalOutputDisplay();
        }
      }
    }

    if (!displayLines.length) {
      return "";
    }

    // Ensure each parsed Qwen JSON section is newline-terminated so subsequent
    // streamed sections never get concatenated onto the same rendered line.
    return `${displayLines.join("\n")}\n`;
  };

  const parseSavedQwenCliOutput = (text) => {
    if (typeof text !== "string" || !text) {
      return "";
    }

    const displayLines = [];
    const lines = text.replace(/\r/g, "").split("\n");

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const parsed = safeParseJson(line);
      if (!parsed) {
        const passthrough = stripQwenCliOutput(rawLine).trim();
        if (passthrough) {
          displayLines.push(passthrough);
        }
        continue;
      }

      const eventMessages = collectQwenDisplayMessagesFromEvent(parsed);
      if (eventMessages.length) {
        displayLines.push(...eventMessages);
      }
    }

    return displayLines.join("\n");
  };

  const handleSnapshotProjectDirDetected = (snapshotDir) => {
    const normalisedSnapshot = normaliseProjectDir(snapshotDir);
    if (!normalisedSnapshot) {
      return;
    }
    if (currentSnapshotProjectDir === normalisedSnapshot) {
      return;
    }
    currentSnapshotProjectDir = normalisedSnapshot;
    if (currentRunContext && typeof currentRunContext === "object") {
      currentRunContext.effectiveProjectDir = normalisedSnapshot;
    }
    updateProjectInfoProjectDir();
    try{ updateRunDirectoryNotice(currentRunContext && currentRunContext.effectiveProjectDir ? currentRunContext.effectiveProjectDir : (currentRunContext && currentRunContext.projectDir) ); }catch(e){}
    updateGitLogLink();
    appendChunk(`Git log link updated to snapshot directory: ${normalisedSnapshot}`, "meta");
  };

  const updateGitFpushStdoutSuppression = (message) => {
    if (!message) {
      return;
    }

    const normalizedMessage = message.trim().toLowerCase();
    if (!normalizedMessage) {
      return;
    }

    if (
      normalizedMessage.includes("running git_fpush.sh")
      || normalizedMessage.includes("running git commit & push")
      || normalizedMessage.includes("git commit & push")
    ) {
      gitFpushActive = true;
      gitFpushDetectedChanges = false;
      gitFpushDetectedNoChanges = false;
      gitFpushOutputSection = "";
      suppressStdoutOutput = true;
      return;
    }

    if (
      normalizedMessage.includes("git_fpush.sh exited")
      || normalizedMessage.includes("git_fpush.sh skipped")
      || normalizedMessage.includes("git_fpush.sh failed")
      || normalizedMessage.includes("failed to run git_fpush.sh")
      || normalizedMessage.includes("git_fpush.sh failed to start")
    ) {
      gitFpushActive = false;
      suppressStdoutOutput = false;
    }
  };

  const cancelCurrentRun = () => {
    if (!eventSource) {
      setStatus("Nothing to cancel.", "idle");
      return;
    }

    closeExistingStream(true);
    flushPendingStdoutPromptBuffer();
    setStatus("Run cancelled.", "idle");
    appendChunk("\nRun cancelled by user.", "status");
    finalizeOutputViews();
    toggleButtons(false);
    runInFlight = false;
    awaitingGitFpushCompletion = false;
    setRunControlsDisabledState(false);
    finalizeActiveFollowupSession("canceled");
  };

  const closeExistingStream = (markClosed = false) => {
    if (eventSource) {
      if (markClosed) {
        streamClosedByServer = true;
      }
      eventSource.close();
      eventSource = null;
    }
  };

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      try {
        if (typeof window !== 'undefined' && window.location && typeof window.location.pathname === 'string' && /(^|\/)agent(\/|$)/.test(window.location.pathname)) {
          window.location.reload();
          return;
        }
      } catch (_e) { /* ignore */ }

      if (!eventSource) {
        setStatus("Nothing to cancel.", "idle");
        return;
      }

      closeExistingStream(true);
      flushPendingStdoutPromptBuffer();
      setStatus("Run cancelled.", "idle");
      appendChunk("\nRun cancelled by user.", "status");
      finalizeOutputViews();
      toggleButtons(false);
      runInFlight = false;
      awaitingGitFpushCompletion = false;
      setRunControlsDisabledState(false);
    });
  }

  if (mergeButton) {
    mergeButton.addEventListener("click", async () => {
      mergeTooltipPinned = false;
      setMergeTooltipVisibility(false);

      // Ensure merge operations do not auto-open the diff modal
      autoOpenMergeDiffOnEnable = false;

      const effectiveDir = resolveEffectiveProjectDirForMerge();
      if (!effectiveDir) {
        appendChunk("Unable to determine project directory for merge.", "stderr");
        return;
      }

      clearMergeOutput();

      mergeInFlight = true;
      applyMergeButtonState();

      appendMergeChunk(
        `Merging for ${effectiveDir}…`,
        "status",
      );

      // Ensure main status text reflects merging state
      try { setStatus('Merging...', 'active'); } catch (e) { console.warn('Failed to set status text for merging', e); }

      // Disable other run sidebar items while merging
      try { setRunControlsDisabledState(true); } catch (e) { console.warn('Failed to disable run controls during merge', e); }

      try {
        const response = await fetch("/agent/merge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectDir: effectiveDir,
            ...(currentRunContext && currentRunContext.runId
              ? { runId: currentRunContext.runId }
              : {}),
            ...(currentSessionId ? { sessionId: currentSessionId } : {}),
          }),
        });

        const payload = await response.json().catch(() => ({}));

        const statusOutput = typeof payload?.output === "string" ? payload.output.trim() : "";
        const errorOutput = typeof payload?.errorOutput === "string" ? payload.errorOutput.trim() : "";

        if (statusOutput) {
          appendMergeChunk(statusOutput, "status");
        }
        if (errorOutput) {
          appendMergeChunk(errorOutput, "stderr");
        }

        if (!response.ok) {
          const errorMessage = payload?.error || `Merge failed with status ${response.status}.`;
          throw new Error(errorMessage);
        }

        appendMergeChunk(
          payload?.message || "Merge completed successfully.",
          "status",
        );
        // Attempt to locate a merge commit hash in the merge output and enable the Merge Diff button
        tryEnableMergeDiffFromText(statusOutput || payload?.output || payload?.message || '', effectiveDir, null);

        // Set merged status in UI
        try { setStatus('Merged.', 'merged'); } catch (e) { console.warn('Failed to set merged status', e); }
        // Attempt to locate a merge commit hash in the merge output and enable the Merge Diff button
        tryEnableMergeDiffFromText(statusOutput || payload?.output || payload?.message || '', effectiveDir, null);

        // If a merge diff was detected and the button is enabled, open the modal to show the merge commit diff
        try {
          // merge completed; enable diff button below merge output for user to open
        } catch (e) { console.warn('Failed to enable merge diff button', e); }

        autoOpenMergeDiffOnEnable = false;
        setMergeReady(false);
      } catch (error) {
        const errorMessage = error && error.message
          ? error.message
          : "Failed to merge branch to parent branch.";
        console.error("Merge failed:", error);
        appendMergeChunk(errorMessage, "stderr");
      } finally {
        mergeInFlight = false;
        applyMergeButtonState();
        try {
          // Clear merging status on completion
          setStatus('', 'idle');
        } catch (e) { console.warn('Failed to clear merging status', e); }
        // Re-enable run controls after merge completes
        try { setRunControlsDisabledState(false); } catch (e) { console.warn('Failed to re-enable run controls after merge', e); }
      }
    });

  if (updateBranchButton) {
    updateBranchButton.addEventListener('click', async () => {
      const effectiveDir = resolveEffectiveProjectDirForMerge();
      if (!effectiveDir) {
        appendChunk('Unable to determine project directory for update.', 'stderr');
        return;
      }

      appendMergeChunk(`Updating branch from parent for ${effectiveDir}…`, 'status');
      updateBranchButton.disabled = true;
      try {
        const response = await fetch('/agent/update-branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectDir: effectiveDir, ...(currentSessionId ? { sessionId: currentSessionId } : {}) }),
        });
        const payload = await response.json().catch(() => ({}));
        if (payload?.output) appendMergeChunk(payload.output, 'status');
        if (payload?.errorOutput) appendMergeChunk(payload.errorOutput, 'stderr');
        if (!response.ok) throw new Error(payload?.error || `Update failed: ${response.status}`);
        appendMergeChunk(payload?.message || 'Branch updated.', 'status');
      } catch (err) {
        console.error('Update branch failed:', err);
        appendMergeChunk(err && err.message ? err.message : String(err), 'stderr');
      } finally {
        updateBranchButton.disabled = false;
      }
    });
  }

  }

  if (defaultModelSaveButton && defaultModelInput) {
  // Delete local checkout for a run
  if (deleteLocalButton) {
    deleteLocalButton.addEventListener('click', async () => {
      const effectiveDir = resolveEffectiveProjectDirForMerge();
      const runId = currentRunContext && currentRunContext.runId ? currentRunContext.runId : '';
      appendMergeChunk(`Deleting local checkout for ${effectiveDir || runId || 'current run'}…`, 'status');
      deleteLocalButton.disabled = true;
      try {
        const url = runId ? `/agent/run/${encodeURIComponent(runId)}/delete-local` : '/agent/run/delete-local';
        const body = {};
        if (effectiveDir) body.projectDir = effectiveDir;
        if (currentSessionId) body.sessionId = currentSessionId;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({}));
        if (payload?.output) appendMergeChunk(payload.output, 'status');
        if (payload?.errorOutput) appendMergeChunk(payload.errorOutput, 'stderr');
        if (!response.ok) throw new Error(payload?.error || `Delete failed: ${response.status}`);
        appendMergeChunk(payload?.message || `Local checkout deleted.`, 'status');
        // refresh runs sidebar to reflect deletion state
        try { await loadRunsSidebar({ projectDir: getProjectDirHintForHistory(), force: true }); } catch (e) { /* ignore */ }
      } catch (err) {
        console.error('Delete local failed:', err);
        appendMergeChunk(err && err.message ? err.message : String(err), 'stderr');
      } finally {
        deleteLocalButton.disabled = false;
      }
    });
  }

    defaultModelSaveButton.addEventListener("click", async () => {
      const newModel = defaultModelInput.value ? defaultModelInput.value.trim() : "";
      await persistDefaultModelSelection(newModel, { showFeedback: true });
    });
  }

  if (saveAgentInstructionsButton && agentInstructionsInput) {
    saveAgentInstructionsButton.addEventListener("click", async () => {
      const instructions = agentInstructionsInput.value ?? "";

      showAgentInstructionsFeedback("Saving agent instructions…");
      saveAgentInstructionsButton.disabled = true;

      try {
        const response = await fetch("/agent/agent-instructions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agentInstructions: instructions }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errorMessage = payload?.error || `Failed to save agent instructions (status ${response.status}).`;
          throw new Error(errorMessage);
        }

        config.defaultAgentInstructions = instructions;
        showAgentInstructionsFeedback(payload?.message || "Agent instructions saved.", "success");
      } catch (error) {
        console.error("Error saving agent instructions:", error);
        showAgentInstructionsFeedback(error.message || "Failed to save agent instructions.", "error");
      } finally {
        saveAgentInstructionsButton.disabled = false;
      }
    });
  }

  const startStream = (projectDir, prompt, agentInstructions) => {
    const hadExistingRun = Boolean(
      currentRunContext
      && typeof currentRunContext.runId === "string"
      && currentRunContext.runId.trim()
    );
    const hasExistingOutput = Boolean(
      outputEl
      && typeof outputEl.textContent === "string"
      && outputEl.textContent.trim()
    );
    const continuingExistingRun = Boolean(config.enableFollowups) && hadExistingRun && hasExistingOutput;

    const normalizedProjectDir = normaliseProjectDir(projectDir);
    const effectiveProjectDirForRun =
      normalizedProjectDir
      || (currentRunContext && currentRunContext.effectiveProjectDir)
      || (currentSnapshotProjectDir ? normaliseProjectDir(currentSnapshotProjectDir) : "")
      || currentRunContext.projectDir
      || codexDefaultProjectDir
      || "";
    lastRequestedProjectDir = effectiveProjectDirForRun;
    const preserveRunSelection = Boolean(continuingExistingRun);
    if (!preserveRunSelection) {
      currentRunContext = buildRunContext({
        projectDir: effectiveProjectDirForRun,
        runId: "",
        effectiveProjectDir: effectiveProjectDirForRun,
        branchName: "",
      });
      updateRunsSidebarHeading(currentRunContext.projectDir);
      updateProjectInfoProjectDir();
      try{ updateRunDirectoryNotice(currentRunContext && currentRunContext.effectiveProjectDir ? currentRunContext.effectiveProjectDir : (currentRunContext && currentRunContext.projectDir) ); }catch(e){}
      refreshProjectInfoBranchDisplay();
      resetMergeState();
      clearSnapshotProjectDir();
      updateGitLogLink();
      updatePageUrlForRun("", effectiveProjectDirForRun);
      updateRunsPageLink(effectiveProjectDirForRun, "");
      setRunsSidebarActiveRun("");
      renderRunsSidebar(runsSidebarRuns, { preserveScroll: true });
    }
    const selectedModel =
      (modelSelect && modelSelect.value)
        ? modelSelect.value
        : (modelPromptSelect && modelPromptSelect.value)
          ? modelPromptSelect.value
          : config.defaultModel || config.defaultCodexModel || "";

    const trimmedInstructions = agentInstructions ? agentInstructions.trim() : "";
    const promptSections = [];
    if (trimmedInstructions) {
      promptSections.push(trimmedInstructions);
    }

    const includeFileTree =
      sendFileTreeEnabled
      && currentFileTree
      && currentFileTreeProjectDir
      && normalizedProjectDir
      && currentFileTreeProjectDir === normalizedProjectDir
        ? currentFileTree
        : "";

    if (includeFileTree) {
      promptSections.push(includeFileTree);
    }

    if (prompt) {
      promptSections.push(prompt);
    }

    const effectivePrompt = promptSections.join("\n\n").trim();
    if (!effectivePrompt) {
      setStatus("Prompt is required.", "error");
      return;
    }

    if (isCodeUsageLimitReached()) {
      showUsageLimitModal();
      return;
    }

    // Only clear the main prompt input when starting a new run; for follow-ups preserve the original read-only prompt.
    try { if (promptInput && !continuingExistingRun) { promptInput.value = ""; } } catch (e) { /* ignore */ }

    incrementCodeUsageCount();

    const params = new URLSearchParams();
    // Prefer an explicit project dir if provided; otherwise send the effective
    // project dir (which may be a snapshot/copy branch) so the server continues
    // working on the existing run snapshot.
    if (normalizedProjectDir) {
      params.append("projectDir", normalizedProjectDir);
    } else if (effectiveProjectDirForRun) {
      params.append("projectDir", effectiveProjectDirForRun);
    }
    const followupParentId = continuingExistingRun
      ? normaliseRunId(currentRunContext && currentRunContext.runId ? currentRunContext.runId : "")
      : "";
    if (followupParentId) {
      params.append("followupParentId", followupParentId);
    }
    if (effectivePrompt) {
      params.append("prompt", effectivePrompt);
    }
    if (prompt) {
      params.append("userPrompt", prompt);
    }
    if (trimmedInstructions) {
      params.append("agentInstructions", trimmedInstructions);
    }
    if (selectedModel) {
      params.append("model", selectedModel);
    }

    if (gitFpushEnabled) {
      params.append("gitFpush", "1");
    }

    params.append("includeMeta", shouldDisplayMeta() ? "1" : "0");

    const refererOverride = openRouterRefererInput && openRouterRefererInput.value
      ? openRouterRefererInput.value.trim()
      : "";
    if (refererOverride) {
      params.append("openRouterReferer", refererOverride);
    }
    const titleOverride = openRouterTitleInput && openRouterTitleInput.value
      ? openRouterTitleInput.value.trim()
      : "";
    if (titleOverride) {
      params.append("openRouterTitle", titleOverride);
    }
    if (enginePreference && enginePreference !== "auto") {
      params.append("engine", enginePreference);
    }
    if (qwenDebugEnvEnabled) {
      params.append("qwenDebugEnv", "1");
    }

    const url = `/agent/stream?${params.toString()}`;

    closeExistingStream();
    if (continuingExistingRun) {
      const session = startFollowupSession(prompt);
      followupRunActive = Boolean(session);
      suppressStdoutOutput = false;
      stderrCommitBuffer = "";
      setActiveFinalOutputText("");
      followupQwenCliRunActive = false;
      followupQwenCliOutputText = "";
      if (session) {
        session.outputValue = "";
        session.finalValue = "";
        if (session.outputLogEl) {
          session.outputLogEl.innerHTML = "";
        }
        if (session.finalLogEl) {
          session.finalLogEl.innerHTML = "";
        }
        setFollowupActiveTab(session, "combined");
      }
    } else {
      followupRunActive = false;
      clearOutput();
      qwenCliRunActive = false;
      qwenCliOutputText = "";
    }
    if (!continuingExistingRun) {
      updatePromptPreview(prompt);
    }
    prepareStdoutPromptTracking(effectivePrompt);
    setStatus("Starting Agent…");
    if (trimmedInstructions) {
      appendChunk("Agent instructions will be prepended to the prompt.", "meta");
    }
    if (includeFileTree) {
      const truncatedLabel = lastFileTreeWasTruncated ? " (truncated)" : "";
      appendChunk(`Project file tree${truncatedLabel} will be included before the prompt.`, "meta");
    } else if (!sendFileTreeEnabled && currentFileTree) {
      appendChunk("Project file tree sending is disabled and will be skipped.", "meta");
    } else if (
      currentFileTree
      && currentFileTreeProjectDir
      && normalizedProjectDir
      && currentFileTreeProjectDir !== normalizedProjectDir
    ) {
      appendChunk("Cached file tree does not match the selected project directory and will be skipped.", "meta");
    }
    appendChunk(`Launching run_codex.sh with prompt:\n${effectivePrompt}`, "meta");
    if (normalizedProjectDir) {
      appendChunk(`Project directory: ${normalizedProjectDir}`, "meta");
    }
    if (selectedModel) {
      appendChunk(`Model: ${selectedModel}`, "meta");
    }
    if (refererOverride) {
      appendChunk(`OpenRouter HTTP-Referer header: ${refererOverride}`, "meta");
    }
    if (titleOverride) {
      appendChunk(`OpenRouter X-Title header: ${titleOverride}`, "meta");
    }
    if (gitFpushEnabled) {
      appendChunk("git_fpush.sh will run after this Agent run if it succeeds.", "meta");
    } else {
      appendChunk("git_fpush.sh is disabled and will be skipped after the Agent run.", "meta");
    }

    streamClosedByServer = false;
    runInFlight = true;
    awaitingGitFpushCompletion = Boolean(gitFpushEnabled);
    setRunControlsDisabledState(true);
    eventSource = new EventSource(url);

    toggleButtons(true);

    eventSource.addEventListener("status", (event) => {
      updateGitFpushStdoutSuppression(event.data);
      handleGitFpushCompletionMessage(event.data);
      setStatus(event.data || "Working…");
      if (event.data) {
        appendChunk(event.data, "status");
      }
    });

    eventSource.addEventListener("run-info", (event) => {
      const payload = safeParseJson(event.data);
      const runIdValue = normaliseRunId(
        (payload && typeof payload.id === "string" ? payload.id : event.data) || "",
      );
      if (!runIdValue) {
        return;
      }
      const qwenCliFlag = payload && payload.qwenCli === true;
      setActiveQwenCliRunActive(qwenCliFlag);
      const projectDirFromPayload = payload && typeof payload.projectDir === "string"
        ? normaliseProjectDir(payload.projectDir)
        : "";
      const projectDirForUrl = projectDirFromPayload
        || normaliseProjectDir(lastRequestedProjectDir)
        || normalizedProjectDir
        || currentRunContext.projectDir
        || repoDirectoryFromUrl
        || codexDefaultProjectDir
        || "";
      const effectiveDirFromPayload = payload && typeof payload.effectiveProjectDir === "string"
        ? normaliseProjectDir(payload.effectiveProjectDir)
        : "";
      const effectiveDirForContext =
        effectiveDirFromPayload
        || (currentSnapshotProjectDir ? normaliseProjectDir(currentSnapshotProjectDir) : "")
        || projectDirForUrl;
      const branchFromPayload = extractBranchFromRun(payload);

      currentRunContext = buildRunContext({
        projectDir: projectDirForUrl,
        runId: runIdValue,
        effectiveProjectDir: effectiveDirForContext,
        branchName: branchFromPayload,
      });
      updateRunsSidebarHeading(currentRunContext.projectDir);
      updateProjectInfoProjectDir();
    try{ updateRunDirectoryNotice(currentRunContext && currentRunContext.effectiveProjectDir ? currentRunContext.effectiveProjectDir : (currentRunContext && currentRunContext.projectDir) ); }catch(e){}
      refreshProjectInfoBranchDisplay();
      refreshRepoBranchForCurrentProject({ force: true });

      if (!preserveRunSelection) {
        setRunsSidebarActiveRun(runIdValue);
      }
      loadRunsSidebar({ projectDir: projectDirForUrl, force: true });

      if (effectiveDirFromPayload && effectiveDirFromPayload !== projectDirForUrl) {
        currentSnapshotProjectDir = effectiveDirFromPayload;
        updateGitLogLink();
      }

      if (!preserveRunSelection) {
        updatePageUrlForRun(runIdValue, projectDirForUrl);
        updateRunsPageLink(projectDirForUrl, runIdValue);
      }
    });

    eventSource.addEventListener("output", (event) => {
      const { sanitizedText, snapshotDir } = stripSnapshotMarkerFromText(event.data);
      if (snapshotDir) {
        handleSnapshotProjectDirDetected(snapshotDir);
      }
      const runDirectory = extractSnapshotDirFromRunDirectoryText(sanitizedText);
      if (runDirectory) {
        handleSnapshotProjectDirDetected(runDirectory);
      }
      if (typeof sanitizedText === "string") {
        handleGitFpushCompletionMessage(sanitizedText);
        captureGitFpushRevisionFromText(sanitizedText);
        const displayText = appendQwenCliOutputChunk(sanitizedText);
        if (displayText) {
          appendChunk(displayText);
        }
        if (gitFpushActive) {
          captureGitFpushDiffCandidates(
            sanitizedText,
            (currentRunContext && currentRunContext.effectiveProjectDir)
              || (currentRunContext && currentRunContext.projectDir)
              || "",
          );
        }
      }
    });

    eventSource.addEventListener("stderr", (event) => {
      const { sanitizedText, snapshotDir } = stripSnapshotMarkerFromText(event.data);
      if (snapshotDir) {
        handleSnapshotProjectDirDetected(snapshotDir);
      }
      const runDirectory = extractSnapshotDirFromRunDirectoryText(sanitizedText);
      if (runDirectory) {
        handleSnapshotProjectDirDetected(runDirectory);
      }
      if (typeof sanitizedText === "string") {
        handleGitFpushCompletionMessage(sanitizedText);
        captureGitFpushRevisionFromText(sanitizedText);
        processCommitMessageChunk(sanitizedText);
        const displayText = appendQwenCliOutputChunk(sanitizedText);
        if (displayText) {
          appendChunk(displayText, "stderr");
        }
      }
    });

    eventSource.addEventListener("stream-error", (event) => {
      const message = event.data || "Stream error";
      updateGitFpushStdoutSuppression(message);
      flushPendingStdoutPromptBuffer();
      appendChunk(message, "stderr");
      setStatus(message || "Agent run error.", "error");
      if (isUsageLimitMessage(message)) {
        showUsageLimitModal();
      }
      finalizeOutputViews();
      runInFlight = false;
      awaitingGitFpushCompletion = false;
      setRunControlsDisabledState(false);
      finalizeActiveFollowupSession("error");
    });

    eventSource.addEventListener("end", (event) => {
      streamClosedByServer = true;
      runInFlight = false;
      const message = event.data || "Agent run complete.";

      if (getActiveQwenCliRunActive()) {
        const trailingQwenJson = getActiveQwenCliJsonBuffer();
        if (trailingQwenJson) {
          const parsedResult = extractQwenResultFromStreamJson(trailingQwenJson);
          if (parsedResult) {
            setActiveQwenCliOutputText(parsedResult);
            setActiveFinalOutputText(parsedResult);
          }
          setActiveQwenCliJsonBuffer("");
        }
      }
      const hasFinalOutput =
        typeof getActiveFinalOutputText === "function"
          && typeof getActiveFinalOutputText() === "string"
          && getActiveFinalOutputText().trim() !== "";
      updateGitFpushStdoutSuppression(message);
      handleGitFpushCompletionMessage(message);
      flushPendingStdoutPromptBuffer();
      appendChunk(`\n${message}`, "status");
      setStatus(message, "idle");
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      finalizeOutputViews();
      // Automatically switch to Final output tab when run finishes
      if (!followupRunActive) {
        setActiveOutputTab(hasFinalOutput ? "stdout" : "combined");
      }
      toggleButtons(false);
      loadRunsSidebar({ projectDir: currentRunContext.projectDir, force: true });
      if (!awaitingGitFpushCompletion) {
        setRunControlsDisabledState(false);
      } else {
        setRunControlsDisabledState(true, { forceRefresh: true });
      }
      finalizeActiveFollowupSession("complete");
    });

    eventSource.onerror = () => {
      if (runControlsDisabled) {
        cancelCurrentRun();
        return;
      }

      if (streamClosedByServer) {
        toggleButtons(false);
        return;
      }
      flushPendingStdoutPromptBuffer();
      if (isCodeUsageLimitReached()) {
        showUsageLimitModal();
        setStatus("Usage limit reached.", "error");
        appendChunk("\nUsage limit reached.", "stderr");
      } else {
        setStatus("Connection interrupted.", "error");
        appendChunk("\nConnection interrupted.", "stderr");
      }
      closeExistingStream();
      finalizeOutputViews();
      toggleButtons(false);
      runInFlight = false;
      awaitingGitFpushCompletion = false;
      setRunControlsDisabledState(false);
      finalizeActiveFollowupSession("error");
    };
  };

  if (promptInput && form) {
    const submitOnEnterCheckbox = document.getElementById('submitOnEnterCheckbox');
    // If localStorage contains a preference, use it; otherwise fallback to server-provided default
    if (submitOnEnterCheckbox) {
      // initialize checkbox state
      try { submitOnEnterCheckbox.checked = submitOnEnterDefault; } catch (e) { /* ignore */ }
      submitOnEnterCheckbox.addEventListener('change', () => {
        try { localStorage.setItem('submitOnEnter', submitOnEnterCheckbox.checked ? 'true' : 'false'); } catch (e) { /* ignore */ }
      });
    }

    // Enter submits the form; Shift+Enter inserts a newline when enabled.
    promptInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        if (event.shiftKey) {
          // Allow Shift+Enter to insert a newline in the textarea.
          return;
        }

        // Check whether submit-on-enter is currently enabled (checkbox overrides default)
        const enabled = submitOnEnterCheckbox ? !!submitOnEnterCheckbox.checked : !!submitOnEnterDefault;
        if (!enabled) {
          // If disabled, do nothing special and allow newline insertion
          return;
        }

        // Prevent default to stop the textarea from adding a newline
        // and instead submit the form.
        event.preventDefault();
        if (runButton && runButton.disabled) {
          return;
        }
        if (runButton) {
          runButton.click();
          return;
        }
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else {
          form.submit();
        }
      }
    });
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const projectDir = projectDirInput ? projectDirInput.value.trim() : "";
      const prompt = promptInput ? promptInput.value.trim() : "";
      const agentInstructions = agentInstructionsInput ? agentInstructionsInput.value : "";

      if (!prompt) {
        setStatus("Prompt is required.", "error");
        return;
      }

      startStream(projectDir, prompt, agentInstructions);
    });
  }

  if (currentRunContext.runId) {
    maybeLoadRunFromHash(window.location.hash || "");
  }

  window.addEventListener("hashchange", () => {
    maybeLoadRunFromHash(window.location.hash || "");
  });
})();


// Runs sidebar collapse toggle with persisted visibility
(function(){
  const collapseButton = document.getElementById('collapseRunsSidebarBtn');
  const expandButton = document.getElementById('expandRunsSidebarArrow');
  const collapsedLogoButton = document.getElementById('collapsedSidebarLogo');
  if (!collapseButton || !expandButton) { return; }

  const STORAGE_KEY = 'sterling:runsSidebarCollapsed';

  const persistState = (isCollapsed) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, isCollapsed ? '1' : '0');
    } catch (_err) {
      /* ignore storage errors */
    }
  };

  const readPersistedState = () => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (_err) {
      return null;
    }
  };

  const applyState = (isCollapsed) => {
    document.body.classList.toggle('runs-sidebar-collapsed', isCollapsed);
    collapseButton.setAttribute('aria-pressed', isCollapsed ? 'true' : 'false');
    expandButton.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    if (collapsedLogoButton) {
      collapsedLogoButton.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    }
  };

  const collapse = () => {
    applyState(true);
    persistState(true);
    try { expandButton.focus({ preventScroll: true }); } catch (_err) { /* ignore */ }
  };

  const expand = () => {
    applyState(false);
    persistState(false);
    try { collapseButton.focus({ preventScroll: true }); } catch (_err) { /* ignore */ }
  };

  const initialState = (() => {
    const stored = readPersistedState();
    if (stored === '1') {
      return true;
    }
    if (stored === '0') {
      return false;
    }
    return window.matchMedia('(max-width: 700px)').matches;
  })();

  applyState(initialState);

  collapseButton.addEventListener('click', collapse);
  [expandButton, collapsedLogoButton].forEach((el) => {
    if (!el) return;
    el.addEventListener('click', expand);
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        expand();
      }
    });
  });

  // Clicking brand logo/name collapses expanded sidebar
  (function(){
    const brandIcon = document.querySelectorAll('.sidebar-brand-icon-link, .sidebar-brand-name');
    brandIcon.forEach((el) => {
      if (!el) return;
      el.addEventListener('click', (e) => {
        try{ e.preventDefault(); }catch(_e){}
        const isCollapsed = document.body.classList.contains('runs-sidebar-collapsed');
        if (!isCollapsed) {
          collapse();
        }
      });
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const isCollapsed = document.body.classList.contains('runs-sidebar-collapsed');
          if (!isCollapsed) { collapse(); }
        }
      });
    });
  })();

  // Make collapsed nav Code icon expand the sidebar when clicked
  try {
    const collapsedNavLinks = document.querySelectorAll('.runs-sidebar__collapsed-nav-link[data-tab="code"]');
    collapsedNavLinks.forEach(link => {
      if (!link) return;
      link.addEventListener('click', (e) => {
        try { e.preventDefault(); } catch(_e) {}
        const isCollapsed = document.body.classList.contains('runs-sidebar-collapsed');
        if (isCollapsed) {
          expand();
        }
      });
      link.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const isCollapsed = document.body.classList.contains('runs-sidebar-collapsed');
          if (isCollapsed) expand();
        }
      });
    });
  } catch (e) { /* ignore */ }

})();


// Runs sidebar resizer
(function(){
  const pageShell = document.querySelector('.page-shell');
  const resizer = document.getElementById('runsSidebarResizer');
  if (!pageShell || !resizer) return;

  const STORAGE_KEY = 'sterling:runsSidebarWidth';
  const minWidth = 320;
  const maxWidth = 640;
  let dragging = false;
  let currentWidth = null;

  const isDesktop = () => window.matchMedia('(min-width: 1101px)').matches;

  const clampWidth = (width) => {
    if (typeof width !== 'number' || Number.isNaN(width)) {
      return null;
    }
    return Math.min(maxWidth, Math.max(minWidth, width));
  };

  const applyWidth = (width) => {
    const clamped = clampWidth(width);
    if (!clamped) {
      return;
    }
    currentWidth = clamped;
    pageShell.style.setProperty('--runs-sidebar-width', `${clamped}px`);
  };

  const readStoredWidth = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = parseInt(raw, 10);
      return clampWidth(parsed);
    } catch (_err) {
      return null;
    }
  };

  const persistWidth = (width) => {
    const clamped = clampWidth(width);
    if (!clamped) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch (_err) {
      /* ignore storage errors */
    }
  };

  const clearPersistedWidth = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_err) {
      /* ignore */
    }
  };

  const stopDragging = (shouldPersist = true) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    document.body.style.userSelect = '';
    document.body.classList.remove('is-resizing');
    if (shouldPersist && currentWidth) {
      persistWidth(currentWidth);
    }
  };

  const resetForLayout = () => {
    if (!isDesktop()) {
      stopDragging(false);
      currentWidth = null;
      pageShell.style.removeProperty('--runs-sidebar-width');
      return;
    }
    const stored = readStoredWidth();
    if (stored) {
      applyWidth(stored);
    }
  };

  const storedWidth = readStoredWidth();
  if (storedWidth && isDesktop()) {
    applyWidth(storedWidth);
  }

  resizer.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }
    if (!isDesktop()) {
      return;
    }
    dragging = true;
    document.body.style.userSelect = 'none';
    document.body.classList.add('is-resizing');
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) {
      return;
    }
    if (!isDesktop()) {
      stopDragging(false);
      return;
    }
    const rect = pageShell.getBoundingClientRect();
    const nextWidth = Math.round(event.clientX - rect.left);
    applyWidth(nextWidth);
  });

  const finishDrag = () => stopDragging(true);
  window.addEventListener('mouseup', finishDrag);
  window.addEventListener('blur', () => stopDragging(true));

  window.addEventListener('resize', resetForLayout);

  resizer.addEventListener('dblclick', () => {
    clearPersistedWidth();
    currentWidth = null;
    pageShell.style.removeProperty('--runs-sidebar-width');
    resetForLayout();
  });

  resetForLayout();
})();

// Account/auth modal handling
(function() {
  const config = window.CODEX_RUNNER_CONFIG || {};
  const shouldStripCodexUserPrompt = config.userPromptVisibleCodex !== true;
  const CODEX_HIDDEN_PROMPT_LINES = [
    'Do not ask to commit changes, we run a script to automatically stage, commit, and push after you finish.',
    'Do not ask anything like "Do you want me to run `git commit` with a message?"',
    'Do not mention anything like "The file is staged."',
    'Python command is available via "python3 version" Python 3.11.2',
    'Whenever you need to modify source files, skip git apply and instead programmatically read the target file, replace the desired text (or insert the new snippet) using a Python script (e.g., Path.read_text()/write_text()), then stage the changes.',
    'When starting, please check AGENTS.md in repository root for further instructions.',
    'Unless otherwise specified, NOW MAKE CODE CHANGES FOR THE USERS SPECIFIED REQUEST BELOW:',
  ];

  const stripCodexUserPromptFromText = (text) => {
    if (!shouldStripCodexUserPrompt) {
      return text;
    }
    if (typeof text !== "string" || !text) {
      return text;
    }
    const endsWithNewline = text.endsWith("\n");
    const lines = text.split(/\r?\n/);
    const filtered = lines.filter((line) => {
      if (!line) {
        return true;
      }
      return !CODEX_HIDDEN_PROMPT_LINES.some((phrase) => line.includes(phrase));
    });
    let joined = filtered.join("\n");
    if (endsWithNewline && joined) {
      joined += "\n";
    }
    return joined;
  };
  const signUpLogInBtn = document.getElementById("signUpLogInBtn");
  const subscribeButton = document.getElementById("subscribeButton");
  const accountButtonEnabled = config.accountButtonEnabled !== false;
  const authModal = document.getElementById("authModal");
  const authModalCloseButton = document.getElementById("authModalCloseButton");
  const authModalTitle = document.getElementById("authModalTitle");
  const accountModal = document.getElementById("accountModal");
  const accountModalCloseButton = document.getElementById("accountModalCloseButton");
  const sterlingSettingsModal = document.getElementById("sterlingSettingsModal");
  const sterlingSettingsIframe = document.getElementById("sterlingSettingsIframe");
  const authEmailInput = document.getElementById("authEmailInput");
  const authEmailContinueBtn = document.getElementById("authEmailContinueBtn");
  const loginChangeEmailBtn = document.getElementById("loginChangeEmailBtn");
  const signupChangeEmailBtn = document.getElementById("signupChangeEmailBtn");
  const toastEl = document.getElementById("toast");
  const currentSessionId = (typeof window !== "undefined" && window.currentSessionId)
    ? window.currentSessionId
    : new URLSearchParams(window.location.search || "").get("sessionId");

  const AUTH_MODAL_STATE_KEY = "alfe.authModalState";
  let authEmailValue = "";
  let authModalStep = "email";
  let accountInfo = null;

  const showToast = (msg, duration = 1500) => {
    if (!toastEl) {
      return;
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      toastEl.classList.remove("show");
    }, duration);
  };

  const persistAuthModalState = () => {
    try {
      sessionStorage.setItem(
        AUTH_MODAL_STATE_KEY,
        JSON.stringify({ email: authEmailValue, step: authModalStep })
      );
    } catch (_err) {
      /* ignore storage errors */
    }
  };

  const clearAuthModalState = () => {
    authEmailValue = "";
    authModalStep = "email";
    if (authEmailInput) {
      authEmailInput.value = "";
    }
    const loginEmail = document.getElementById("loginEmail");
    if (loginEmail) {
      loginEmail.value = "";
    }
    const signupEmail = document.getElementById("signupEmail");
    if (signupEmail) {
      signupEmail.value = "";
    }
    const loginDisplay = document.getElementById("authEmailDisplayLogin");
    if (loginDisplay) {
      loginDisplay.textContent = "";
    }
    const signupDisplay = document.getElementById("authEmailDisplaySignup");
    if (signupDisplay) {
      signupDisplay.textContent = "";
    }
    const loginPassword = document.getElementById("loginPassword");
    if (loginPassword) {
      loginPassword.value = "";
    }
    const loginTotp = document.getElementById("loginTotp");
    if (loginTotp) {
      loginTotp.value = "";
    }
    const signupPassword = document.getElementById("signupPassword");
    if (signupPassword) {
      signupPassword.value = "";
    }
    const signupConfirm = document.getElementById("signupConfirm");
    if (signupConfirm) {
      signupConfirm.value = "";
    }
    try {
      sessionStorage.removeItem(AUTH_MODAL_STATE_KEY);
    } catch (_err) {
      /* ignore storage errors */
    }
  };

  const loadAuthModalState = () => {
    try {
      const raw = sessionStorage.getItem(AUTH_MODAL_STATE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_err) {
      return null;
    }
  };

  const isBasicEmailValid = (email) => {
    if (!email) {
      return false;
    }
    const normalized = email.trim();
    if (!normalized) {
      return false;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  };

  const setAuthEmailValue = (email) => {
    authEmailValue = email;
    const loginEmail = document.getElementById("loginEmail");
    if (loginEmail) {
      loginEmail.value = email;
    }
    const signupEmail = document.getElementById("signupEmail");
    if (signupEmail) {
      signupEmail.value = email;
    }
    if (authEmailInput) {
      authEmailInput.value = email;
    }
    const loginDisplay = document.getElementById("authEmailDisplayLogin");
    if (loginDisplay) {
      loginDisplay.textContent = email;
    }
    const signupDisplay = document.getElementById("authEmailDisplaySignup");
    if (signupDisplay) {
      signupDisplay.textContent = email;
    }
    persistAuthModalState();
  };

  const showAuthModal = () => {
    if (!authModal) {
      return;
    }
    authModal.classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
  };

  const hideAuthModal = () => {
    if (!authModal) {
      return;
    }
    authModal.classList.add("is-hidden");
    document.body.style.overflow = "";
  };

  const hideSettingsModal = () => {
    if (!sterlingSettingsModal) {
      return;
    }
    sterlingSettingsModal.classList.add("is-hidden");
    document.body.style.overflow = "";
    if (sterlingSettingsIframe) {
      sterlingSettingsIframe.src = "";
    }
  };

  const showAccountModal = () => {
    if (!accountModal) {
      return;
    }
    accountModal.classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
  };

  const hideAccountModal = () => {
    if (!accountModal) {
      return;
    }
    accountModal.classList.add("is-hidden");
    document.body.style.overflow = "";
  };

  if (usageLimitModalCloseButton && usageLimitModal) {
    usageLimitModalCloseButton.addEventListener("click", (event) => {
      event.preventDefault();
      hideUsageLimitModal();
    });
  }

  if (usageLimitModal) {
    usageLimitModal.addEventListener("click", (event) => {
      if (event.target === usageLimitModal) {
        hideUsageLimitModal();
      }
    });
  }

  if (subscribeModalCloseButton && subscribeModal) {
    subscribeModalCloseButton.addEventListener("click", (event) => {
      event.preventDefault();
      hideSubscribeModal();
    });
  }

  if (subscribeModal) {
    subscribeModal.addEventListener("click", (event) => {
      if (event.target === subscribeModal) {
        hideSubscribeModal();
      }
    });
  }

  const updateAccountButton = (info) => {
    if (!signUpLogInBtn) {
      return;
    }
    if (!accountButtonEnabled) {
      signUpLogInBtn.style.display = "none";
      if (subscribeButton) {
        subscribeButton.style.display = "none";
      }
      return;
    }
    if (info && info.email) {
      signUpLogInBtn.style.display = "none";
      if (subscribeButton) {
        const normalizedPlan = (info.plan || "").toString().trim().toLowerCase();
        subscribeButton.style.display = normalizedPlan === "free" ? "" : "none";
      }
      return;
    }
    signUpLogInBtn.style.display = "";
    signUpLogInBtn.textContent = "Sign Up / Log In";
    signUpLogInBtn.title = "Sign Up or Log In";
    signUpLogInBtn.setAttribute("aria-label", "Sign up or log in");
    if (subscribeButton) {
      subscribeButton.style.display = "none";
    }
  };

  const setAccountInfo = (info) => {
    accountInfo = info && info.email ? info : null;
    if (typeof window !== "undefined") {
      window.accountInfo = accountInfo;
    }
    if (!accountInfo) {
      clearAuthModalState();
    }
    updateAccountButton(accountInfo);
  };

  const openAccountModal = (event) => {
    if (event) {
      event.preventDefault();
    }
    if (!accountInfo) {
      return;
    }
    const emailValue = document.getElementById("accountEmailValue");
    if (emailValue) {
      emailValue.textContent = accountInfo.email || "—";
    }
    const planValue = document.getElementById("accountPlanValue");
    if (planValue) {
      planValue.textContent = accountInfo.plan || "Free";
    }
    const sessionValue = document.getElementById("accountSessionValue");
    if (sessionValue) {
      sessionValue.textContent = accountInfo.sessionId || "—";
    }
    showAccountModal();
  };

  const showAuthEmailStep = ({ keepEmail = true } = {}) => {
    if (!keepEmail) {
      setAuthEmailValue("");
    }
    authModalStep = "email";
    persistAuthModalState();
    const benefits = document.querySelector("#authModal .auth-benefits");
    const login = document.getElementById("loginForm");
    const signup = document.getElementById("signupForm");
    const emailStep = document.getElementById("authEmailStep");
    if (benefits) {
      benefits.style.display = "block";
    }
    if (login) {
      login.style.display = "none";
    }
    if (signup) {
      signup.style.display = "none";
    }
    if (emailStep) {
      emailStep.style.display = "block";
    }
    const totpLabel = document.getElementById("totpLoginLabel");
    if (totpLabel) {
      totpLabel.style.display = "none";
    }
    if (authEmailInput) {
      authEmailInput.focus();
    }
    if (authModalTitle) {
      authModalTitle.textContent = "Sign Up / Log In";
    }
  };

  const showSignupForm = () => {
    if (!authEmailValue || !isBasicEmailValid(authEmailValue)) {
      if (authEmailValue) {
        showToast("Enter a valid email address");
      }
      showAuthEmailStep({ keepEmail: false });
      return;
    }
    authModalStep = "signup";
    persistAuthModalState();
    const benefits = document.querySelector("#authModal .auth-benefits");
    const emailStep = document.getElementById("authEmailStep");
    if (emailStep) {
      emailStep.style.display = "none";
    }
    const login = document.getElementById("loginForm");
    const signup = document.getElementById("signupForm");
    if (benefits) {
      benefits.style.display = "none";
    }
    if (login) {
      login.style.display = "none";
    }
    if (signup) {
      signup.style.display = "block";
    }
    if (authModalTitle) {
      authModalTitle.textContent = "Sign Up";
    }
  };

  const showLoginForm = () => {
    if (!authEmailValue || !isBasicEmailValid(authEmailValue)) {
      if (authEmailValue) {
        showToast("Enter a valid email address");
      }
      showAuthEmailStep({ keepEmail: false });
      return;
    }
    authModalStep = "login";
    persistAuthModalState();
    const benefits = document.querySelector("#authModal .auth-benefits");
    const emailStep = document.getElementById("authEmailStep");
    if (emailStep) {
      emailStep.style.display = "none";
    }
    const login = document.getElementById("loginForm");
    const signup = document.getElementById("signupForm");
    if (benefits) {
      benefits.style.display = "none";
    }
    if (signup) {
      signup.style.display = "none";
    }
    if (login) {
      login.style.display = "block";
    }
    const totpLabel = document.getElementById("totpLoginLabel");
    if (totpLabel) {
      totpLabel.style.display = "none";
    }
    if (authModalTitle) {
      authModalTitle.textContent = "Log In";
    }
  };

  const openAuthModal = ({ preferredStep, closeRepoAddFirst = false } = {}) => {
    if (!accountButtonEnabled) {
      showToast("Accounts are disabled on this server.");
      return;
    }
    if (closeRepoAddFirst) {
      closeRepoAddModal();
    }
    hideSettingsModal();
    const saved = loadAuthModalState();
    if (saved?.email) {
      setAuthEmailValue(saved.email);
    }
    const step = saved?.step || preferredStep || "email";
    if (step === "login") {
      showLoginForm();
    } else if (step === "signup") {
      showSignupForm();
    } else {
      showAuthEmailStep({ keepEmail: true });
    }
    showAuthModal();
  };

  if (typeof window !== "undefined") {
    window.alfeOpenAuthModal = (preferredStep = "signup", options = {}) => {
      const closeRepoAddFirst = Boolean(options && options.closeRepoAddFirst === true);
      openAuthModal({ preferredStep, closeRepoAddFirst });
    };
    window.alfeOpenSubscribeModal = ({ closeSettingsFirst = true, closeRepoAddFirst = false } = {}) => {
      if (closeRepoAddFirst) {
        closeRepoAddModal();
      }
      if (closeSettingsFirst) {
        hideSettingsModal();
      }
      showSubscribeModal();
    };
  }

  if (usageLimitModal) {
    const usageLimitInlineButtons = Array.from(
      usageLimitModal.querySelectorAll(".subscribe-button--inline"),
    );
    usageLimitInlineButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        openAuthModal({ preferredStep: "signup" });
      });
    });
  }

  const openSignupModal = (event) => {
    if (event) {
      event.preventDefault();
    }
    openAuthModal({ preferredStep: "signup" });
  };

  const openLoginModal = (event) => {
    if (event) {
      event.preventDefault();
    }
    openAuthModal({ preferredStep: "login" });
  };

  const checkAuthEmailAndContinue = async () => {
    const email = authEmailInput ? authEmailInput.value.trim() : "";
    if (!email) {
      showToast("Email required");
      return;
    }
    if (authEmailInput && typeof authEmailInput.checkValidity === "function" && !authEmailInput.checkValidity()) {
      showToast("Enter a valid email address");
      return;
    }
    if (!isBasicEmailValid(email)) {
      showToast("Enter a valid email address");
      return;
    }
    try {
      const resp = await fetch("/api/account/exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data) {
        setAuthEmailValue(email);
        if (data.exists) {
          showLoginForm();
        } else {
          showSignupForm();
        }
      } else {
        showToast(data?.error || "Unable to check email");
      }
    } catch (err) {
      console.error("Email lookup failed", err);
      showToast("Unable to check email");
    }
  };

  if (signUpLogInBtn) {
    signUpLogInBtn.addEventListener("click", (event) => {
      if (accountInfo) {
        openAccountModal(event);
      } else {
        openSignupModal(event);
      }
    });
  }

  if (subscribeButton) {
    subscribeButton.addEventListener("click", (event) => {
      event.preventDefault();
      showSubscribeModal();
    });
  }

  if (authEmailContinueBtn) {
    authEmailContinueBtn.addEventListener("click", (event) => {
      event.preventDefault();
      checkAuthEmailAndContinue();
    });
  }

  if (authEmailInput) {
    authEmailInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        checkAuthEmailAndContinue();
      }
    });
  }

  if (loginChangeEmailBtn) {
    loginChangeEmailBtn.addEventListener("click", () => showAuthEmailStep({ keepEmail: true }));
  }

  if (signupChangeEmailBtn) {
    signupChangeEmailBtn.addEventListener("click", () => showAuthEmailStep({ keepEmail: true }));
  }

  if (authModalCloseButton) {
    authModalCloseButton.addEventListener("click", (event) => {
      event.preventDefault();
      hideAuthModal();
    });
  }

  if (accountModalCloseButton) {
    accountModalCloseButton.addEventListener("click", (event) => {
      event.preventDefault();
      hideAccountModal();
    });
  }

  if (authModal) {
    authModal.addEventListener("click", (event) => {
      if (event.target === authModal) {
        hideAuthModal();
      }
    });
  }

  if (accountModal) {
    accountModal.addEventListener("click", (event) => {
      if (event.target === accountModal) {
        hideAccountModal();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && authModal && !authModal.classList.contains("is-hidden")) {
      hideAuthModal();
    } else if (event.key === "Escape" && accountModal && !accountModal.classList.contains("is-hidden")) {
      hideAccountModal();
    } else if (event.key === "Escape" && usageLimitModal && !usageLimitModal.classList.contains("is-hidden")) {
      hideUsageLimitModal();
    } else if (event.key === "Escape" && subscribeModal && !subscribeModal.classList.contains("is-hidden")) {
      hideSubscribeModal();
    }
  });

  const fetchAccountInfo = async () => {
    try {
      const params = currentSessionId
        ? `?sessionId=${encodeURIComponent(currentSessionId)}`
        : "";
      const resp = await fetch(`/api/account${params}`, { cache: "no-store" });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.email) {
        setAccountInfo({
          email: data.email,
          plan: data.plan,
          sessionId: data.sessionId,
          timezone: data.timezone
        });
      } else {
        setAccountInfo(null);
      }
    } catch (err) {
      console.error("Account lookup failed", err);
      setAccountInfo(null);
    }
  };

  const signupPasswordInput = document.getElementById("signupPassword");
  const passwordRequirementItems = signupPasswordInput
    ? document.querySelectorAll(".password-requirements [data-requirement]")
    : [];

  const updatePasswordRequirements = (value = "") => {
    if (!passwordRequirementItems.length) {
      return;
    }
    const requirements = {
      "min-8": value.length >= 8,
      "min-12": value.length >= 12,
      "case": /[a-z]/.test(value) && /[A-Z]/.test(value),
      "number": /\d/.test(value),
      "symbol": /[^A-Za-z0-9\s]/.test(value)
    };

    passwordRequirementItems.forEach((item) => {
      const requirement = item.dataset.requirement;
      const met = Boolean(requirements[requirement]);
      item.classList.toggle("is-met", met);
      item.setAttribute("aria-checked", met ? "true" : "false");
    });
  };

  if (signupPasswordInput) {
    updatePasswordRequirements(signupPasswordInput.value);
    signupPasswordInput.addEventListener("input", (event) => {
      updatePasswordRequirements(event.target.value);
    });
  }

  const handleLoginSuccess = (data) => {
    showToast("Logged in!");
    hideAuthModal();
    setAccountInfo({
      email: data.email,
      plan: data.plan,
      sessionId: data.sessionId,
      timezone: data.timezone
    });
    const lbl = document.getElementById("totpLoginLabel");
    if (lbl) {
      lbl.style.display = "none";
    }
    if (data.sessionId && data.sessionId !== currentSessionId) {
      setTimeout(() => window.location.reload(), 500);
    }
  };

  const handleLoginFailure = (data) => {
    if (data?.error === "totp required" || data?.error === "invalid totp") {
      const lbl = document.getElementById("totpLoginLabel");
      if (lbl) {
        lbl.style.display = "block";
      }
    }
    showToast(data?.error || "Login failed");
  };

  const attemptLogin = async ({ email, password, token }) => {
    const resp = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        token,
        ...(currentSessionId ? { sessionId: currentSessionId } : {})
      })
    });
    const data = await resp.json().catch(() => null);
    if (resp.ok && data && data.success) {
      handleLoginSuccess(data);
      return true;
    }
    handleLoginFailure(data);
    return false;
  };

  const loginSubmitBtn = document.getElementById("loginSubmitBtn");
  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener("click", async () => {
      const email = document.getElementById("loginEmail")?.value.trim();
      const password = document.getElementById("loginPassword")?.value;
      const token = document.getElementById("loginTotp")?.value.trim();
      if (!email || !password) {
        showToast("Email and password required");
        return;
      }
      if (!isBasicEmailValid(email)) {
        showToast("Enter a valid email address");
        return;
      }
      try {
        await attemptLogin({ email, password, token });
      } catch (err) {
        console.error("Login failed", err);
        showToast("Login failed");
      }
    });
  }

  const signupSubmitBtn = document.getElementById("signupSubmitBtn");
  if (signupSubmitBtn) {
    const signupSubmitSpinner = document.getElementById("signupSubmitSpinner");
    const setSignupLoading = (isLoading) => {
      signupSubmitBtn.disabled = !!isLoading;
      if (signupSubmitSpinner) {
        signupSubmitSpinner.classList.toggle("is-hidden", !isLoading);
      }
      signupSubmitBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
    };
    signupSubmitBtn.addEventListener("click", async () => {
      const email = document.getElementById("signupEmail")?.value.trim();
      const password = document.getElementById("signupPassword")?.value;
      const confirm = document.getElementById("signupConfirm")?.value;
      const MIN_PASSWORD_LENGTH = 8;
      if (!email) {
        showToast("Email required");
        return;
      }
      if (!isBasicEmailValid(email)) {
        showToast("Enter a valid email address");
        return;
      }
      if (!password) {
        showToast("Password required");
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        return;
      }
      if (confirm !== undefined && password !== confirm) {
        showToast("Passwords do not match");
        return;
      }
      try {
        setSignupLoading(true);
        const resp = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            ...(currentSessionId ? { sessionId: currentSessionId } : {})
          })
        });
        let responseText = "";
        let data = null;
        try {
          responseText = await resp.text();
          if (responseText) {
            try {
              data = JSON.parse(responseText);
            } catch (parseError) {
              console.warn("Registration response was not JSON", parseError);
            }
          }
        } catch (readError) {
          console.warn("Unable to read registration response body", readError);
        }
        if (resp.ok && data && data.success) {
          showToast("Registered!");
          try {
            await attemptLogin({ email, password, token: "" });
          } catch (loginError) {
            console.error("Auto-login after registration failed", loginError);
            showToast("Registered, but login failed");
          }
        } else {
          if (!resp.ok) {
            console.warn("Registration request failed", {
              status: resp.status,
              statusText: resp.statusText,
              responseText
            });
          }
          showToast(data?.error || responseText || `Registration failed (status ${resp.status})`);
        }
      } catch (err) {
        console.error("Registration failed", err);
        showToast(`Registration failed${err?.message ? `: ${err.message}` : ""}`);
      } finally {
        setSignupLoading(false);
      }
    });
  }

  fetchAccountInfo();
})();
