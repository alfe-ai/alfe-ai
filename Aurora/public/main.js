// sessionId is defined in session.js and available globally
// sessionId is provided globally by session.js
const defaultTitle = "Alfe - AI Project Management, Image Design, and Software Development Platform";
const DEFAULT_SEARCH_MODEL = "openai/gpt-4o-mini-search-preview";
// Enable automatic scrolling of the chat by default so new messages stay in view.
// Manual scrolling (e.g. via the scroll down button) can still force scrolling.
let chatAutoScroll = true;
let collapseReasoningByDefault = false;
const isEmbedded = (() => {
  try {
    return window.self !== window.top;
  } catch (err) {
    return true;
  }
})();

let sidebarForcedHidden = false;

const THEME_STORAGE_KEY = 'auroraTheme';
const THEME_OPTIONS = {
  dark: '/styles.css',
  light: '/styles-light.css'
};

let usageLimitCache = null;

const detectedTimezone = (() => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' ? tz : '';
  } catch (err) {
    console.warn('Unable to detect browser timezone', err);
    return '';
  }
})();

const TIMEZONE_OPTIONS = (() => {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch (err) {
      console.warn('Intl.supportedValuesOf failed for timeZone', err);
    }
  }
  return [
    'Africa/Abidjan', 'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Algiers', 'Africa/Cairo',
    'Africa/Casablanca', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Tripoli',
    'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Caracas',
    'America/Chicago', 'America/Denver', 'America/Guatemala', 'America/Halifax', 'America/Hermosillo',
    'America/La_Paz', 'America/Lima', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
    'America/Phoenix', 'America/Puerto_Rico', 'America/Santiago', 'America/Sao_Paulo', 'America/St_Johns',
    'America/Tijuana', 'America/Toronto', 'America/Vancouver', 'America/Whitehorse', 'America/Winnipeg',
    'Asia/Almaty', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Baku', 'Asia/Bangkok', 'Asia/Beirut', 'Asia/Colombo',
    'Asia/Dhaka', 'Asia/Dubai', 'Asia/Ho_Chi_Minh', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem',
    'Asia/Kabul', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Kuwait',
    'Asia/Manila', 'Asia/Qatar', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei',
    'Asia/Tehran', 'Asia/Tokyo', 'Asia/Ulaanbaatar', 'Asia/Vladivostok', 'Asia/Yangon', 'Asia/Yekaterinburg',
    'Atlantic/Azores', 'Atlantic/Bermuda', 'Atlantic/Canary', 'Atlantic/Cape_Verde', 'Australia/Adelaide',
    'Australia/Brisbane', 'Australia/Darwin', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Perth',
    'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin', 'Europe/Brussels',
    'Europe/Bucharest', 'Europe/Budapest', 'Europe/Copenhagen', 'Europe/Dublin', 'Europe/Helsinki',
    'Europe/Istanbul', 'Europe/Kiev', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Minsk',
    'Europe/Moscow', 'Europe/Oslo', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/Stockholm',
    'Europe/Vienna', 'Europe/Vilnius', 'Europe/Warsaw', 'Europe/Zurich', 'Indian/Maldives', 'Indian/Mauritius',
    'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Guam', 'Pacific/Honolulu', 'Pacific/Majuro',
    'Pacific/Midway', 'Pacific/Noumea', 'Pacific/Pago_Pago', 'Pacific/Port_Moresby', 'Pacific/Tahiti', 'UTC'
  ];
})();

const SORTED_TIMEZONE_OPTIONS = Array.isArray(TIMEZONE_OPTIONS)
  ? [...TIMEZONE_OPTIONS].sort((a, b) => a.localeCompare(b))
  : [];

const storeLinks = window.AURORA_APP_LINKS || {};
const printifyQueueConfig = (() => {
  const flags = window.AURORA_FLAGS || {};
  const cfg = flags.printifyQueue || {};
  const enabledValue = cfg.enabled;
  const enabled =
    enabledValue === true ||
    enabledValue === 'true' ||
    enabledValue === 1 ||
    enabledValue === '1';
  return { enabled };
})();
const imageUploadConfig = (() => {
  const flags = window.AURORA_FLAGS || {};
  const cfg = flags.imageUpload || {};
  const enabledValue = cfg.enabled;
  const enabled =
    enabledValue === true ||
    enabledValue === 'true' ||
    enabledValue === 1 ||
    enabledValue === '1';
  return { enabled };
})();
const themeVisibilityConfig = (() => {
  const flags = window.AURORA_FLAGS || {};
  const hiddenValue = flags.hideThemeOption;
  const hidden =
    hiddenValue === true ||
    hiddenValue === 'true' ||
    hiddenValue === 1 ||
    hiddenValue === '1';
  return { hidden };
})();

const DEFAULT_CODE_REDIRECT_TARGET = 'https://code.alfe.sh';
const codeRedirectConfig = (() => {
  const flags = window.AURORA_FLAGS || {};
  const cfg = flags.codeRedirect || {};
  const target =
    typeof cfg.target === 'string' && cfg.target.trim()
      ? cfg.target.trim()
      : DEFAULT_CODE_REDIRECT_TARGET;
  const enabledValue = cfg.enabled;
  const enabled =
    enabledValue === true ||
    enabledValue === 'true' ||
    enabledValue === 1 ||
    enabledValue === '1';
  return {
    enabled,
    target,
  };
})();
const featureFlagConfig = (() => {
  const flags = window.AURORA_FLAGS || {};
  const normalizeFlag = (value, defaultValue) => {
    if (typeof value === 'undefined' || value === null) {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return defaultValue;
      }
      return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
    }
    return defaultValue;
  };
  return {
    searchEnabled2026: normalizeFlag(flags.searchEnabled2026, true),
    imagesEnabled2026: normalizeFlag(flags.imagesEnabled2026, true),
    twoFactorEnabled2026: normalizeFlag(flags.twoFactorEnabled2026, false),
  };
})();

function getStoredTheme(){
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if(saved && Object.prototype.hasOwnProperty.call(THEME_OPTIONS, saved)){
      return saved;
    }
  } catch (err) {
    console.warn('Unable to read stored theme', err);
  }
  return 'dark';
}

function updateThemeDependentAssets(theme){
  const codeIconSrc = theme === 'light' ? '/icons/code-dark.svg' : '/icons/code.svg';
  document.querySelectorAll('img[data-icon="code"]').forEach(img => {
    if(img && img.getAttribute('src') !== codeIconSrc){
      img.setAttribute('src', codeIconSrc);
    }
  });
}

function applyTheme(theme){
  const name = Object.prototype.hasOwnProperty.call(THEME_OPTIONS, theme) ? theme : 'dark';
  const linkEl = document.getElementById('themeStylesheet');
  if(linkEl && linkEl.getAttribute('href') !== THEME_OPTIONS[name]){
    linkEl.setAttribute('href', THEME_OPTIONS[name]);
  }
  document.body.dataset.theme = name;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if(metaTheme){
    metaTheme.setAttribute('content', name === 'light' ? '#e2e8f0' : '#0b1723');
  }
  updateThemeDependentAssets(name);
  try {
    renderTabs();
    renderSidebarTabs();
  } catch (err) {
    console.warn('Unable to refresh tab theming after theme change', err);
  }
}

function setTheme(theme){
  const name = Object.prototype.hasOwnProperty.call(THEME_OPTIONS, theme) ? theme : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch (err) {
    console.warn('Unable to persist theme preference', err);
  }
  applyTheme(name);
}

function initializeTheme(){
  const theme = getStoredTheme();
  applyTheme(theme);
}

function isPrintifyQueueEnabled(){
  return !!printifyQueueConfig.enabled;
}

function populateTimezoneSelect(){
  const tzSelect = document.getElementById('accountTimezone');
  if(!tzSelect) return;
  const previousValue = tzSelect.value;
  tzSelect.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = 'Select a timezone';
  tzSelect.appendChild(placeholderOption);
  SORTED_TIMEZONE_OPTIONS.forEach(zone => {
    const opt = document.createElement('option');
    opt.value = zone;
    opt.textContent = zone;
    tzSelect.appendChild(opt);
  });
  if(previousValue && !SORTED_TIMEZONE_OPTIONS.includes(previousValue)){
    const opt = document.createElement('option');
    opt.value = previousValue;
    opt.textContent = previousValue;
    tzSelect.appendChild(opt);
  }
  tzSelect.value = previousValue || '';
}

function ensureTimezoneOption(selectEl, tz){
  if(!selectEl || !tz) return;
  const exists = Array.from(selectEl.options).some(opt => opt.value === tz);
  if(exists) return;
  const opt = document.createElement('option');
  opt.value = tz;
  opt.textContent = tz;
  selectEl.appendChild(opt);
}

function ensureSidebarHiddenForEmbed(){
  if(sidebarForcedHidden) return;
  sidebarForcedHidden = true;
  const appEl = document.querySelector('.app');
  if(appEl){
    appEl.classList.add('embed-sidebar-hidden');
    appEl.classList.remove('sidebar-collapsed');
  }
  const sidebarEl = document.querySelector('.sidebar');
  if(sidebarEl){
    sidebarEl.style.display = 'none';
    sidebarEl.setAttribute('aria-hidden', 'true');
  }
  const dividerEl = document.getElementById('divider');
  if(dividerEl) dividerEl.style.display = 'none';
  const thinSidebar = document.getElementById('thinSidebar');
  if(thinSidebar) thinSidebar.style.display = 'none';
  const collapsedLogo = document.getElementById('collapsedSidebarLogo');
  if(collapsedLogo) collapsedLogo.style.display = 'none';
  const expandArrow = document.getElementById('expandSidebarArrow');
  if(expandArrow) expandArrow.style.display = 'none';
  const expandBtn = document.getElementById('expandSidebarBtn');
  if(expandBtn) expandBtn.style.display = 'none';
  const toggleIcon = document.getElementById('sidebarToggleIcon');
  if(toggleIcon) toggleIcon.style.display = 'none';
  const hideBtn = document.getElementById('hideSidebarBtn');
  if(hideBtn) hideBtn.style.display = 'none';
  const closeIcon = document.getElementById('closeSidebarIcon');
  if(closeIcon) closeIcon.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  // Hide image upload UI when disabled via AURORA_FLAGS.imageUpload.enabled
  try {
    if (!imageUploadConfig.enabled) {
      ['fileInput','imageUploadInput','chatImageBtn'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
      });
      // Hide secure upload submit button and uploader panel by default
      const submitBtn = document.getElementById('secureUploadSubmit');
      if(submitBtn) submitBtn.style.display = 'none';
      const uploaderPanel = document.getElementById('sidebarViewUploader');
      if(uploaderPanel) uploaderPanel.style.display = 'none';
    } else {
      // Ensure Image Design nav button is always visible regardless of upload config
      const uploaderBtn = document.getElementById('navUploaderBtn');
      if(uploaderBtn) uploaderBtn.style.display = '';
      const uploaderIcon = document.getElementById('navUploaderIcon');
      if(uploaderIcon) uploaderIcon.style.display = '';
    }
  } catch(e) { console.warn('Error applying imageUploadConfig', e); }

  try {
    if (!featureFlagConfig.twoFactorEnabled2026) {
      const totpSection = document.getElementById('totpSection');
      if (totpSection) {
        totpSection.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('Failed to apply 2FA visibility flag', err);
  }

  const sessEl = document.getElementById('sessionIdText');
  if (sessEl) sessEl.textContent = sessionId;
  document.title = defaultTitle;

  initializeTheme();
  populateTimezoneSelect();
  updateUsageLimitInfo();

  // Unhide Printify Queue buttons if enabled via aurora flags
  try {
    if (isPrintifyQueueEnabled()) {
      document.querySelectorAll('#printifyQueueButton').forEach(btn => { btn.style.display = ''; });
    }
  } catch (err) { console.warn('Failed to apply Printify Queue visibility flags', err); }

  const googlePlayBadge = document.getElementById('googlePlayBadge');
  if(googlePlayBadge){
    const androidHref = storeLinks.android || googlePlayBadge.dataset.defaultHref || googlePlayBadge.getAttribute('href');
    if(androidHref){
      googlePlayBadge.setAttribute('href', androidHref);
    }
  }

  const appStoreBadge = document.getElementById('appStoreBadge');
  if(appStoreBadge){
    const iosHref = storeLinks.ios || appStoreBadge.dataset.defaultHref || appStoreBadge.getAttribute('href');
    if(iosHref){
      appStoreBadge.setAttribute('href', iosHref);
    }
  }

  if (themeVisibilityConfig.hidden) {
    const themeSection = document.getElementById('themeSection');
    if (themeSection) {
      themeSection.style.display = 'none';
    }
  }

  const themeSelect = document.getElementById('themeSelect');
  if(themeSelect && !themeVisibilityConfig.hidden){
    themeSelect.value = getStoredTheme();
    themeSelect?.addEventListener('change', (event) => {
      setTheme(event.target.value);
    });
  }

  document.querySelectorAll('.version-info, #versionSpan').forEach((node) => {
    if (node && typeof node.remove === 'function') {
      node.remove();
    }
  });

  const signupEl = document.getElementById('signupBtn');
  if (signupEl) {
    fetch('/api/account')
      .then(r => (r.ok ? r.json() : null))
      .then((data) => {
        const enabled =
          data && typeof data.accountsEnabled !== 'undefined'
            ? !!data.accountsEnabled
            : false;
        setAccountsFeatureVisibility(enabled);
        updateAccountButton(enabled ? data : null);
      })
      .catch((err) => {
        console.error('Failed to fetch account', err);
        setAccountsFeatureVisibility(false);
        updateAccountButton(null);
      });
  } else {
    setAccountsFeatureVisibility(false);
  }

  if(isEmbedded){
    sidebarVisible = false;
    ensureSidebarHiddenForEmbed();
  }

  if(isEmbedded){
    sidebarVisible = false;
    ensureSidebarHiddenForEmbed();
  }

  // Make the chat title clickable to rename the current chat.
  // Clicking the title opens the rename modal for the active tab.
  try {
    const chatTitleEl = document.getElementById('chatTitleText');
    const chatProjectEl = document.getElementById('chatTitleProject');
    const openTitleModal = (evt) => {
      if(!currentTabId) return;
      // Don't open the rename/chat settings modal for fixed-title tabs like Image Design or Code.
      const current = chatTabs.find(t => t.id === currentTabId);
      if(tabHasFixedTitle(current)) {
        // For fixed-title tabs, do nothing on title click — title is fixed.
        return;
      }
      openEditTabNameModal(currentTabId);
    };
    if(chatTitleEl){
      chatTitleEl.style.cursor = 'pointer';
      chatTitleEl.title = 'Edit chat name';
      chatTitleEl.tabIndex = 0;
      chatTitleEl?.addEventListener('click', openTitleModal);
      chatTitleEl?.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' ' ) openTitleModal(e); });
    }
    if(chatProjectEl){
      chatProjectEl.style.cursor = 'pointer';
      chatProjectEl.title = 'Edit chat name';
      chatProjectEl.tabIndex = 0;
      chatProjectEl?.addEventListener('click', openTitleModal);
      chatProjectEl?.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' ' ) openTitleModal(e); });
    }
    const chatFavoriteBtn = document.getElementById('chatFavoriteBtn');
    if(chatFavoriteBtn){
      chatFavoriteBtn?.addEventListener('click', async () => {
        if(!currentTabId) return;
        const current = chatTabs.find(t => t.id === currentTabId);
        if(!current) return;
        if(!tabSupportsFavorites(current)) return;
        chatFavoriteBtn.disabled = true;
        try {
          await toggleFavoriteTab(current.id, !current.favorite);
        } finally {
          chatFavoriteBtn.disabled = false;
        }
      });
    }
  } catch (err) {
    console.warn('Failed to attach chat title click handler', err);
  }

  updateChatPanelVisibility();
  updateMobileThinSidebar();
  loadMosaicFiles();
  loadMosaicRepoPath();
  updateMosaicPanelVisibility();
  loadProjectGroups();
  loadCollapsedProjectGroups();
  loadCollapsedArchiveGroups();
  loadFavoritesCollapsed();
  loadArchivedCollapsed();
  loadTasksOnlyTabs();
  loadHideArchivedTabs();
  loadHideDoneTasks();
  loadChatTabOrder();
  loadProjectHeaderOrder();
  loadCollapsedChildTabs();
  await ensureAiModels();
  // Project groups will be rendered within the sidebar tabs
  window.addEventListener('resize', () => {
    if(isEmbedded){
    sidebarVisible = false;
    ensureSidebarHiddenForEmbed();
  }  updateChatPanelVisibility();
    updateMobileThinSidebar();
  });
  const tasksOnlyChk = document.getElementById("tasksOnlyTabsCheck");
  if(tasksOnlyChk) tasksOnlyChk.checked = tasksOnlyTabs;
  const hideArchChk = document.getElementById("hideArchivedTabsCheck");
  if(hideArchChk) hideArchChk.checked = hideArchivedTabs;
  const hideDoneChk = document.getElementById("hideDoneTasksCheck");
  if(hideDoneChk) hideDoneChk.checked = hideDoneTasks;
});

let columnsOrder = [
  { key: "drag",         label: "⠿"          },
  { key: "priority",     label: "Prio"       },
  { key: "status",       label: "Status"     },
  { key: "number",       label: "#"          },
  { key: "codex_url",   label: "Agent"     },
  { key: "title",        label: "Title"      },
  { key: "chat_sha",    label: "Chat"       },
  { key: "dependencies", label: "Depends On" },
  { key: "project",      label: "Project"    },
  { key: "created",      label: "Created"    },
  { key: "hide",         label: "Hide"       }
];
let visibleCols = new Set(columnsOrder.map(c => c.key));
let allTasks = [];
let dragSrcRow = null;
let modelName = "unknown";
let tabModelOverride = '';
let previousModelName = null; // remember model when toggling search
let previousTabType = null; // remember tab type when toggling search
let reasoningPreviousModelName = null; // remember model when toggling reasoning
let codexPreviousModelName = null; // remember model when toggling Agent
let codexMiniEnabled = false; // toggle Agent Mini mode
let tasksVisible = true;
let markdownPanelVisible = false;
let subroutinePanelVisible = false;
let mosaicPanelVisible = false;
let mosaicEditingFile = null;
let sidebarVisible = isEmbedded ? false : window.innerWidth > 700;
let chatTabs = [];
let archivedTabs = [];
let currentTabId = null;
let initialTabUuid = null;
let currentTabType = 'chat';
const mosaicAllowedTypes = ['PM AGI', 'task'];
let chatHideMetadata = true;
let chatTabAutoNaming = false;
let showSubbubbleToken = false;
let sterlingChatUrlVisible = true;
let projectInfoBarVisible = true; // visibility of the project/Sterling bar
let suppressArchiveRedirect = false;

const DESIGN_CHAT_ALIAS = '/chat/design';
let designTabInfo = null;
let designTabFetchPromise = null;
let initialPathAlias = null;

const alfeGreetingMessages = (() => {
  const openers = [
    "Hello! I'm Alfe, your AI assistant.",
    "Hi there! Alfe here, ready to collaborate.",
    "Greetings! You're chatting with Alfe.",
    "Welcome! Alfe is online and ready to help.",
    "Hey! It's Alfe, your project partner.",
    "Good to see you! Alfe reporting for duty.",
    "Hello again! Alfe is tuned in.",
    "Hi! Alfe at your service.",
    "Hey there! Alfe is ready when you are.",
    "Welcome back! Alfe is here to assist."
  ];
  const closers = [
    "What can I help you build today?",
    "How can I support your project right now?",
    "Ready when you are—what's next?",
    "What would you like to explore first?",
    "How can I make your workflow easier?",
    "What challenge should we tackle together?",
    "How may I assist you today?",
    "Let me know what you need.",
    "What should we focus on?",
    "How can I help you today?"
  ];
  const messages = [];
  openers.forEach(opener => {
    closers.forEach(closer => {
      messages.push(`${opener} ${closer}`);
    });
  });
  return messages;
})();

function getRandomAlfeGreeting(){
  if(!alfeGreetingMessages.length){
    return "Hello, I'm Alfe. How can I help you today?";
  }
  const idx = Math.floor(Math.random() * alfeGreetingMessages.length);
  return alfeGreetingMessages[idx];
}

function updateArchiveChatButton(){
  const btn = document.getElementById("archiveChatBtn");
  if(!btn) return;
  const current = chatTabs.find(t => t.id === currentTabId);
  const canArchive = !!current && !current.archived;
  btn.disabled = !canArchive;
  btn.setAttribute("aria-disabled", canArchive ? "false" : "true");
  btn.title = canArchive ? "Archive current chat" : "No active chat to archive";
}

const FORCE_HIDE_PROJECT_BAR = true; // temporarily keep the Aurora project controls hidden

let auroraProjectBarVisible = false; // new flag to show/hide Aurora project controls
let chatStreaming = true; // new toggle for streaming
let enterSubmitsMessage = true; // new toggle for Enter key submit
let chatQueueEnabled = false; // queue additional messages
let messageQueue = [];
let navMenuVisible = true; // visibility of the top navigation menu
let navMenuLoading = false; // show nav menu immediately  // hide nav menu while showing spinner on load
let showArchivedTabs = false;
let archivedCollapsed = false;   // collapse state for archived group
let tasksOnlyTabs = false; // filter chat tabs with tasks only
let hideArchivedTabs = true; // filter out archived chat tabs
let hideDoneTasks = false; // hide tasks with status 'Done'
let mobileSidebarToolbar = true; // show thin sidebar toolbar on mobile
let showArchiveChatButton = false; // show archive button next to chat tabs
let topChatTabsBarVisible = false; // visibility of the top chat tabs bar
let viewTabsBarVisible = false; // visibility of the top Chat/Tasks bar
let showProjectNameInTabs = false; // append project name to chat tab titles
let groupTabsByProject = true;   // group chat tabs by project
let projectGroups = [];           // custom project group headers
let draggingProjectIndex = null;  // index of project group being dragged
let collapsedProjectGroups = {};  // chat project group collapse states
let collapsedArchiveGroups = {};  // archived tab group collapse states
let collapsedChildTabs = {};      // parent chat tab collapse states
let chatTabOrder = {};            // per-project tab ordering
let projectHeaderOrder = [];      // order of project headers
let draggingTabRow = null;        // element of tab row being dragged
let draggingProjectHeader = null; // project header currently being dragged
let topDropBar = null;            // drop target above first chat
let projectAddTooltip = null;     // floating toolbar for project add button
let projectAddTooltipProject = null;
let projectAddTooltipTimer = null;
let projectAddTooltipEnabled = false; // temporarily hide the project add tooltip/search button
let printifyPage = 1; // current Printify product page
let showDependenciesColumn = false;
let tabGenerateImages = false; // per-tab auto image toggle (design tabs only)
let imageLoopEnabled = false; // automatic image generation loop mode
let favoritesCollapsed = false;   // collapse state for favorites group
let imageLoopMessage = "Next image";
let imageGenService = 'openai';
let imageGenModel = 'gptimage1';
let isImageGenerating = false; // true while an image is being generated
let lastImagePrompt = null; // avoid repeating generation for same prompt
let currentChatAbort = null; // AbortController for streaming chat
let imageUploadEnabled = false; // show image upload button (temporarily disabled)
const pasteImageUploadsEnabled = false; // allow Ctrl+V image uploads (temporarily disabled)
let imagePaintTrayEnabled = true; // show image paint tray button
let activityIframeMenuVisible = false; // show Activity IFrame menu item
let nexumChatMenuVisible = false;     // show Nexum Chat menu item
let nexumTabsMenuVisible = false;     // show Nexum Tabs menu item
let imageGeneratorMenuVisible = false; // show Image Generator menu item
let fileTreeMenuVisible = false;      // show File Tree button
let aiModelsMenuVisible = false;      // show AI Models link
let tasksMenuVisible = true;          // show Tasks button by default
let jobsMenuVisible = false;         // show Jobs button
let chatTabsMenuVisible = true;     // show Chats button
let showSessionId = false;          // display session ID hash
let upArrowHistoryEnabled = true;    // use Arrow Up/Down for input history
let newTabProjectNameEnabled = true; // show Project name field in New Tab dialog
let chatSubroutines = [];
let actionHooks = [];
let editingSubroutineId = null;
let editingMessageInfo = null; // {pairId, type, callback}
let accountInfo = null; // details returned from /api/account
let accountsEnabled = false;
let currentView = 'chat';
let searchEnabled = false; // toggle search mode
let reasoningEnabled = false; // toggle reasoning mode
let aiResponsesEnabled = true; // allow AI responses

const applyFeatureFlagVisibility = () => {
  const { searchEnabled2026, imagesEnabled2026 } = featureFlagConfig;

  if (!searchEnabled2026) {
    searchEnabled = false;
    const searchToggleBtn = document.getElementById("searchToggleBtn");
    if (searchToggleBtn) {
      searchToggleBtn.hidden = true;
      searchToggleBtn.style.display = "none";
    }
    document.querySelectorAll('button[data-type="search"]').forEach((btn) => {
      btn.hidden = true;
      btn.style.display = "none";
    });
    document.querySelectorAll('option[value="search"]').forEach((option) => {
      option.disabled = true;
      option.hidden = true;
    });
    document.querySelectorAll(".project-search-btn").forEach((btn) => {
      btn.hidden = true;
      btn.style.display = "none";
    });
  }

  if (!imagesEnabled2026) {
    [
      document.getElementById("navUploaderBtn"),
      document.getElementById("navUploaderIcon"),
      document.getElementById("thinIconImages")
    ].forEach((el) => {
      if (el) {
        el.hidden = true;
        el.style.display = "none";
      }
    });
    document.querySelectorAll('button[data-type="design"]').forEach((btn) => {
      btn.hidden = true;
      btn.style.display = "none";
    });
    document.querySelectorAll('option[value="design"]').forEach((option) => {
      option.disabled = true;
      option.hidden = true;
    });
  }
};

applyFeatureFlagVisibility();

let tabOptionsMenu = null;
let tabOptionsMenuTarget = null;
const reasoningChatModels = [
  'openrouter/openai/gpt-5-mini',
  'openai/gpt-4o-mini',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o',
  'openai/gpt-4.1',
  'openai/gpt-5-nano',
  'openai/gpt-5-mini',
  'openai/gpt-5-chat',
  'openai/gpt-5'
];
window.agentName = "Alfe";

const designStartPrompts = [
  "A whimsical cat astronaut exploring space.",
  "Retro-futuristic cityscape at sunset.",
  "Minimalist mountain landscape poster.",
  "Vibrant underwater scene with jellyfish."
];

// For per-tab model arrays
let modelTabs = [];
let currentModelTabId = null;
let modelTabsBarVisible = false;

const defaultFavicon = "/alfe_favicon_chat_mountain_rect_purple_WHITEBG.ico";
const rotatingFavicon = "/alfe_favicon_chat_mountain_rect_purple_WHITEBG.ico";
let favElement = null;

const tabTypeIcons = { chat: "💬", design: "🎨", task: "📋", pm_agi: "🤖", search: "💬", code: "💻" };
let newTabSelectedType = 'chat';

const CODE_CHAT_GREETING = 'Start a new task or ask a question';

const normalizeSelector = (sel, ctx) => {
  if (!sel || /^[#.:\[]/.test(sel)) {
    return sel;
  }
  const match = sel.match(/^([A-Za-z][\w-]*)/);
  if (!match) {
    return sel;
  }
  const id = match[1];
  const rest = sel.slice(id.length);
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
  if (ctx.querySelector(`#${escaped}`)) {
    return `#${escaped}${rest}`;
  }
  return sel;
};
const $ = (sel, ctx = document) => ctx.querySelector(normalizeSelector(sel, ctx));
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(normalizeSelector(sel, ctx))];

function mosaicKey(tabId){
  return `mosaic_panel_visible_tab_${tabId}`;
}

function resolveTabPath(tab){
  if(!tab) return null;
  if(tab.tab_type === 'code'){
    return '/code';
  }
  if(tab.path_alias && tab.path_alias.trim()){
    return tab.path_alias.trim();
  }
  if(tab.tab_uuid){
    return `/chat/${tab.tab_uuid}`;
  }
  return null;
}

function getTabUuidFromLocation(){
  const path = window.location.pathname;
  if(path === DESIGN_CHAT_ALIAS){
    initialPathAlias = DESIGN_CHAT_ALIAS;
    return null;
  }
  if(path === '/code'){
    initialPathAlias = '/code';
    return null;
  }
  const codeMatch = path.match(/^\/code\/([^/]+)/);
  if(codeMatch){
    initialPathAlias = '/code';
    return codeMatch[1];
  }
  const m = path.match(/\/chat\/([^/]+)/);
  if(m) return m[1];
  const params = new URLSearchParams(window.location.search);
  return params.get('tab');
}

initialTabUuid = getTabUuidFromLocation();
const urlParamsInit = new URLSearchParams(window.location.search);
const initialSearchQuery = urlParamsInit.get('q') || '';
const initialSearchMode = urlParamsInit.has('search');
if(initialSearchMode){
  searchEnabled = true; // highlight search toggle immediately
}

/* Introduce an image buffer and preview, plus an array to hold their descriptions. */
let pendingImages = [];
let pendingImageDescs = [];

function updatePageTitle(){
  const active = chatTabs.find(t => t.id === currentTabId);
  updateChatTitleDisplay(active);
  const fixedTitle = getFixedTabTitle(active);
  const tabTitle = fixedTitle || (active && active.name);
  if(tabTitle){
    if(active && active.task_id){
      document.title = `Alfe - #${active.task_id} ${tabTitle}`;
    } else {
      document.title = `Alfe - ${tabTitle}`;
    }
  } else {
    document.title = defaultTitle;
  }
}

function tabHasFixedTitle(tab){
  return !!getFixedTabTitle(tab);
}

function getFixedTabTitle(tab){
  if(!tab) return null;
  if(isDesignTab(tab)){
    return 'Image Design';
  }
  if(isCodeTab(tab)){
    return 'Code';
  }
  return null;
}

function isDesignTab(tab){
  if(!tab) return false;
  const type = (tab.tab_type || '').trim().toLowerCase();
  const pathAlias = (tab.path_alias || '').trim().toLowerCase();
  const designAlias = DESIGN_CHAT_ALIAS.trim().toLowerCase();
  return type === 'design' || pathAlias === designAlias || pathAlias === '/chat/design';
}

function isCodeTab(tab){
  if(!tab) return false;
  const type = (tab.tab_type || '').trim().toLowerCase();
  return type === 'code';
}

function tabSupportsFavorites(tab){
  if(!tab) return false;
  if(isDesignTab(tab) || isCodeTab(tab)) return false;
  const type = (tab.tab_type || 'chat').trim().toLowerCase();
  return type === 'chat';
}

function updateChatTitleDisplay(active){
  const titleEl = document.getElementById("chatTitleText");
  const projectEl = document.getElementById("chatTitleProject");
  const favoriteBtn = document.getElementById("chatFavoriteBtn");

  if(favoriteBtn){
    const shouldHideFavorite = !tabSupportsFavorites(active);
    if(shouldHideFavorite){
      favoriteBtn.hidden = true;
      favoriteBtn.disabled = true;
      favoriteBtn.style.display = 'none';
      favoriteBtn.setAttribute('aria-hidden', 'true');
      favoriteBtn.textContent = '☆';
      favoriteBtn.setAttribute('aria-pressed', 'false');
      favoriteBtn.title = 'Add to favorites';
      favoriteBtn.setAttribute('aria-label', 'Add to favorites');
    } else {
      const isFavorite = !!active.favorite;
      const favLabel = isFavorite ? 'Remove from favorites' : 'Add to favorites';
      favoriteBtn.hidden = false;
      favoriteBtn.disabled = false;
      favoriteBtn.style.display = '';
      favoriteBtn.removeAttribute('aria-hidden');
      favoriteBtn.textContent = isFavorite ? '★' : '☆';
      favoriteBtn.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
      favoriteBtn.title = favLabel;
      favoriteBtn.setAttribute('aria-label', favLabel);
    }
  }

  if(!titleEl) return;

  const fixedTitle = getFixedTabTitle(active);
  if(fixedTitle){
    titleEl.textContent = fixedTitle;
    // Remove pointer affordance since title is not editable for fixed-title tabs
    titleEl.style.cursor = 'default';
    titleEl.title = '';
  } else {
    const name = active && active.name ? active.name : "Chat";
    titleEl.textContent = name;
    // restore pointer affordance for editable chats
    titleEl.style.cursor = 'pointer';
    titleEl.title = 'Edit chat name';
  }

  if(projectEl){
    const project = active && active.project_name ? active.project_name.trim() : "";
    if(project){
      projectEl.textContent = project;
      projectEl.hidden = false;
    } else {
      projectEl.textContent = "";
      projectEl.hidden = true;
    }
  }
}

function markTabProcessing(tabId, flag){
  document.querySelectorAll(`[data-tab-id='${tabId}']`).forEach(el => {
    if(flag) el.classList.add('tab-processing');
    else el.classList.remove('tab-processing');
  });
}

// Data and state for the secure files list
let fileListData = [];
const fileListLimit = 20;
let fileListOffset = 0;
let fileListEnd = false;
let fileListLoading = false;
// Default to sorting by last modified descending so newest files appear first
let fileSortColumn = "mtime";
let fileSortAsc = false;

/* Utility formatting functions, event handlers, rendering logic, etc. */
function formatTimestamp(isoStr){
  if(!isoStr) return "(no time)";
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function isoDate(d) {
  return new Date(d).toLocaleDateString([], {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  });
}

function isoDateTime(d) {
  const date = new Date(d);
  const dateStr = date.toLocaleDateString([], {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  });
  const timeStr = date
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
    .toLowerCase();
  return `${dateStr} ${timeStr}`;
}

// Format date with weekday (e.g. "Mon 06/16/25")
function isoDateWithDay(d) {
  const date = new Date(d);
  const day = date.toLocaleDateString([], { weekday: "short" });
  const short = date.toLocaleDateString([], {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  });
  return `${day} ${short}`;
}

const REASONING_MARKER = "[[AURORA_REASONING]]";
const REASONING_SEPARATOR = `\n\n${REASONING_MARKER}\n\n`;

function stripPlaceholderImageLines(text){
  if(!text) return text;
  const withoutReasoningMarker = text
    .replace(/\s*\[\[AURORA_REASONING\]\]\s*/g, "\n");
  return withoutReasoningMarker
    .split("\n")
    // Strip any Alfe placeholder images (abstract calm, puzzle borders, etc.)
    .filter(line => !/!\[[^\]]*\]\(https?:\/\/alfe\.sh\/[^)]+\)/.test(line.trim()))
    .join("\n");
}

function escapeHtml(text){
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Apply simple markdown styling while preserving the original syntax
function applyMarkdownSyntax(text){
  if(!text) return "";
  let html = escapeHtml(text);
  // Headings
  html = html.replace(/^######\s+(.*)$/gm, '<span class="md-h6">$1</span>');
  html = html.replace(/^#####\s+(.*)$/gm, '<span class="md-h5">$1</span>');
  html = html.replace(/^####\s+(.*)$/gm,  '<span class="md-h4">$1</span>');
  html = html.replace(/^###\s+(.*)$/gm,   '<span class="md-h3">$1</span>');
  html = html.replace(/^##\s+(.*)$/gm,    '<span class="md-h2">$1</span>');
  html = html.replace(/^#\s+(.*)$/gm,     '<span class="md-h1">$1</span>');
  // Remove markdown bold markers while leaving the text unstyled
  html = html.replace(/\*\*([^*]+)\*\*/g, '$1');
  html = html.replace(/__([^_]+)__/g, '$1');
  // Italic (single * or _ that are not part of bold markers)
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<span class="md-italic">$1</span>');
  html = html.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<span class="md-italic">$1</span>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<span class="md-inline-code">`$1`</span>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a class="md-link" href="$2" target="_blank" title="$2">$1</a>');
  return html.replace(/\n/g, "<br>");
}

function formatCodeBlocks(text){
  if(!text) return "";

  // Support code fences wrapped in a single backtick on separate lines
  // e.g.
  // `
  // const x = 1;
  // `
  text = text.replace(/(^|\n)`\n([\s\S]*?)\n`(?=\n|$)/g, (m, lead, code) => {
    return `${lead}<pre><code>${escapeHtml(code)}</code></pre>`;
  });

  const parts = text.split(/```/);
  return parts.map((part, idx) => {
    if(idx % 2 === 0){
      return applyMarkdownSyntax(part);
    }
    let code = part;
    const newlineIdx = code.indexOf('\n');
    if(newlineIdx !== -1){
      const first = code.slice(0, newlineIdx).trim();
      if(/^[a-zA-Z0-9_-]+$/.test(first)){
        code = code.slice(newlineIdx + 1);
      }
    }
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }).join("");
}

function getReasoningModelNames() {
  const models = window.REASONING_TOOLTIP_CONFIG?.reasoningModels || [];
  return models
    .map(model => (typeof model === "string" ? model : model?.name))
    .filter(Boolean);
}

function isReasoningModel(model) {
  if(!model) return false;
  const { shortModel } = parseProviderModel(model);
  const reasoningModels = getReasoningModelNames();
  if(settingsCache?.ai_reasoning_model){
    if(model === settingsCache.ai_reasoning_model || shortModel === settingsCache.ai_reasoning_model){
      return true;
    }
  }
  return reasoningModels.includes(model) || reasoningModels.includes(shortModel);
}

function splitReasoningContent(text, model) {
  const rawText = text || "";
  const normalizedText = rawText.replace(/\r\n/g, "\n");
  const markerIndex = normalizedText.indexOf(REASONING_MARKER);
  if(markerIndex !== -1){
    const reasoningRaw = normalizedText.slice(0, markerIndex);
    const contentRaw = normalizedText.slice(markerIndex + REASONING_MARKER.length);
    const reasoning = stripPlaceholderImageLines(reasoningRaw).trim();
    const content = stripPlaceholderImageLines(contentRaw).trim();
    if(reasoning || content){
      return { reasoning, content };
    }
  }
  const cleaned = stripPlaceholderImageLines(normalizedText);
  if(!cleaned) return { reasoning: "", content: "" };
  if(!isReasoningModel(model)) return { reasoning: "", content: cleaned };
  const separatorMatch = cleaned.match(/\n\s*\n/);
  if(!separatorMatch || typeof separatorMatch.index !== "number"){
    return { reasoning: "", content: cleaned };
  }
  const separatorMatchIndex = separatorMatch.index;
  const separatorLength = separatorMatch[0].length;
  const reasoning = cleaned.slice(0, separatorMatchIndex).trim();
  const content = cleaned.slice(separatorMatchIndex + separatorLength).trim();
  if(!reasoning || !content) return { reasoning: "", content: cleaned };
  return { reasoning, content };
}

let reasoningSectionCounter = 0;

function renderAssistantContentParts(container, reasoning, content, options = {}) {
  if(!container) return;
  const hasReasoning = Boolean(reasoning);
  const defaultReasoningCollapsed = options.defaultReasoningCollapsed ?? false;
  const resetReasoningExpanded = options.resetReasoningExpanded ?? false;
  if(resetReasoningExpanded){
    delete container.dataset.reasoningExpanded;
  }
  const storedExpanded = container.dataset.reasoningExpanded;
  const isExpanded = storedExpanded === "true"
    ? true
    : storedExpanded === "false"
      ? false
      : !defaultReasoningCollapsed;
  container.innerHTML = "";

  if(hasReasoning){
    const reasoningSection = document.createElement("div");
    reasoningSection.className = "reasoning-section";
    if(!isExpanded){
      reasoningSection.classList.add("collapsed");
    }
    const reasoningHeader = document.createElement("button");
    reasoningHeader.className = "reasoning-section-header";
    reasoningHeader.type = "button";
    reasoningHeader.textContent = "Reasoning";
    reasoningHeader.setAttribute("role", "button");
    const reasoningBodyId = `reasoning-section-body-${reasoningSectionCounter++}`;
    reasoningHeader.setAttribute("aria-controls", reasoningBodyId);
    reasoningHeader.setAttribute("aria-expanded", String(isExpanded));
    const reasoningBody = document.createElement("div");
    reasoningBody.className = "reasoning-section-body";
    reasoningBody.id = reasoningBodyId;
    reasoningBody.innerHTML = formatCodeBlocks(reasoning || "");
    addCodeCopyButtons(reasoningBody);
    const toggleReasoningSection = () => {
      const nextExpanded = reasoningSection.classList.contains("collapsed");
      reasoningSection.classList.toggle("collapsed", !nextExpanded);
      reasoningHeader.setAttribute("aria-expanded", String(nextExpanded));
      container.dataset.reasoningExpanded = String(nextExpanded);
    };
    reasoningHeader.addEventListener("click", toggleReasoningSection);
    reasoningSection.appendChild(reasoningHeader);
    reasoningSection.appendChild(reasoningBody);
    container.appendChild(reasoningSection);
  }

  const contentBody = document.createElement("div");
  contentBody.className = "assistant-message-content";
  const contentText = content || "";
  contentBody.innerHTML = formatCodeBlocks(contentText || "");
  addCodeCopyButtons(contentBody);
  container.appendChild(contentBody);
}

function renderAssistantContent(container, text, model, options = {}) {
  if(!container) return;
  const { reasoning, content } = splitReasoningContent(text, model);
  renderAssistantContentParts(container, reasoning, content, {
    defaultReasoningCollapsed: collapseReasoningByDefault,
    resetReasoningExpanded: options.resetReasoningExpanded
  });
}

function addCodeCopyButtons(root){
  if(!root) return;
  root.querySelectorAll('pre').forEach(pre => {
    if(pre.querySelector('.code-copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.innerHTML = '\u2398';
    btn.title = 'Copy code';
    btn?.addEventListener('click', () => {
      navigator.clipboard.writeText(pre.innerText);
      showToast('Copied to clipboard');
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

function truncateTabTitle(title, max=40){
  if(!title) return '';
  return title.length > max ? title.slice(0, max - 2) + '..' : title;
}

// ------------------ Mosaic Helpers ------------------
function ensureMosaicList(){
  const panel = document.getElementById("mosaicPanel");
  if(!panel) return null;
  let list = document.getElementById("mosaicList");
  if(!list){
    list = document.createElement("ul");
    list.id = "mosaicList";
    panel.appendChild(list);
  }
  return list;
}

function addFileToMosaic(file){
  if(!file) return;
  const list = ensureMosaicList();
  if(!list) return;
  if([...list.children].some(li => li.dataset.file === file)) return;
  const li = document.createElement("li");
  li.dataset.file = file;
  const link = document.createElement("a");
  link.href = "/mosaic/files/" + file;
  link.target = "_blank";
  link.textContent = file;
  li.appendChild(link);
  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit";
  editBtn.className = "mosaic-edit-btn";
  editBtn?.addEventListener("click", e => {
    e.preventDefault();
    openMosaicEditModal(file);
  });
  li.appendChild(editBtn);
  list.appendChild(li);
}

async function saveMosaicFile(name, content){
  try {
    await fetch('/api/mosaic/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: name, content })
    });
  } catch(e){
    console.error('Error saving mosaic file', e);
  }
}

async function loadMosaicFiles(){
  try {
    const r = await fetch('/api/mosaic/list');
    if(r.ok){
      const { files } = await r.json();
      files.forEach(f => addFileToMosaic(f));
    }
  } catch(e){
    console.error('Error loading mosaic files', e);
  }
}

async function loadMosaicRepoPath(){
  try {
    const r = await fetch('/api/mosaic/path');
    if(r.ok){
      const { path } = await r.json();
      const el = document.getElementById('mosaicRepoPath');
      if(el) el.textContent = path;
    }
  } catch(e){
    console.error('Error loading mosaic repo path', e);
  }
}

function loadProjectGroups(){
  try {
    projectGroups = JSON.parse(localStorage.getItem('projectGroups') || '[]');
  } catch(e){
    projectGroups = [];
  }
}

function loadCollapsedProjectGroups(){
  try {
    collapsedProjectGroups = JSON.parse(localStorage.getItem('collapsedProjectGroups') || '{}');
  } catch(e){
    collapsedProjectGroups = {};
  }
}

function loadCollapsedArchiveGroups(){
  try {
    collapsedArchiveGroups = JSON.parse(localStorage.getItem('collapsedArchiveGroups') || '{}');
  } catch(e){
    collapsedArchiveGroups = {};
  }
}

function loadFavoritesCollapsed(){
  const val = localStorage.getItem('favoritesCollapsed');
  favoritesCollapsed = val === '1';
}

function saveFavoritesCollapsed(){
  localStorage.setItem('favoritesCollapsed', favoritesCollapsed ? '1' : '0');
}

function loadArchivedCollapsed(){
  const val = localStorage.getItem('archivedCollapsed');
  archivedCollapsed = val === '1';
}

function saveArchivedCollapsed(){
  localStorage.setItem('archivedCollapsed', archivedCollapsed ? '1' : '0');
}

function loadTasksOnlyTabs(){
  tasksOnlyTabs = localStorage.getItem('tasksOnlyTabs') === 'true';
}

function saveTasksOnlyTabs(){
  localStorage.setItem('tasksOnlyTabs', tasksOnlyTabs);
}

function loadHideArchivedTabs(){
  const val = localStorage.getItem('hideArchivedTabs');
  hideArchivedTabs = val === null ? true : val === 'true';
  if(!hideArchivedTabs){
    hideArchivedTabs = true;
    saveHideArchivedTabs();
  }
}

function saveHideArchivedTabs(){
  localStorage.setItem('hideArchivedTabs', hideArchivedTabs);
}

function loadHideDoneTasks(){
  hideDoneTasks = localStorage.getItem('hideDoneTasks') === 'true';
}

function saveHideDoneTasks(){
  localStorage.setItem('hideDoneTasks', hideDoneTasks);
}

function saveCollapsedProjectGroups(){
  localStorage.setItem('collapsedProjectGroups', JSON.stringify(collapsedProjectGroups));
}

function saveCollapsedArchiveGroups(){
  localStorage.setItem('collapsedArchiveGroups', JSON.stringify(collapsedArchiveGroups));
}

function loadCollapsedChildTabs(){
  try {
    collapsedChildTabs = JSON.parse(localStorage.getItem('collapsedChildTabs') || '{}');
  } catch(e){
    collapsedChildTabs = {};
  }
}

function saveCollapsedChildTabs(){
  localStorage.setItem('collapsedChildTabs', JSON.stringify(collapsedChildTabs));
}

function saveProjectGroups(){
  localStorage.setItem('projectGroups', JSON.stringify(projectGroups));
}

function loadProjectHeaderOrder(){
  try {
    projectHeaderOrder = JSON.parse(localStorage.getItem('projectHeaderOrder') || '[]');
  } catch(e){
    projectHeaderOrder = [];
  }
}

function saveProjectHeaderOrder(){
  localStorage.setItem('projectHeaderOrder', JSON.stringify(projectHeaderOrder));
}

function renderProjectGroups(){
  const container = document.getElementById('projectGroupsContainer');
  if(!container) return;
  container.innerHTML = '';
  container.style.display = projectGroups.length ? 'flex' : 'none';
  if(projectGroups.length){
    container.style.flexDirection = 'column';
    container.style.gap = '4px';
  }
  projectGroups.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.className = 'project-group-button';
    btn.textContent = name;
    btn.draggable = true;
    btn.dataset.index = idx;
    btn?.addEventListener('dragstart', e => {
      draggingProjectIndex = idx;
      e.dataTransfer.effectAllowed = 'move';
    });
    btn?.addEventListener('dragover', e => {
      if(draggingProjectIndex === null || draggingProjectIndex === idx) return;
      e.preventDefault();
      btn.classList.add('drag-over');
    });
    btn?.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
    btn?.addEventListener('drop', e => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      if(draggingProjectIndex === null || draggingProjectIndex === idx) return;
      const [moved] = projectGroups.splice(draggingProjectIndex, 1);
      projectGroups.splice(idx, 0, moved);
      draggingProjectIndex = null;
      saveProjectGroups();
      renderSidebarTabs();
    });
    btn?.addEventListener('dragend', () => {
      draggingProjectIndex = null;
      btn.classList.remove('drag-over');
    });
    container.appendChild(btn);
  });
}

function addProjectGroup(){
  const name = prompt('Enter project group name:');
  if(!name) return;
  projectGroups.push(name.trim());
  saveProjectGroups();
  renderSidebarTabs();
}

function removeProjectGroupIfEmpty(project){
  if(!project) return;
  const exists = chatTabs.some(t => (t.project_name || '') === project && !t.archived);
  if(!exists){
    const idx = projectGroups.indexOf(project);
    if(idx !== -1){
      projectGroups.splice(idx, 1);
      saveProjectGroups();
    }
  }
}

function loadChatTabOrder(){
  try {
    chatTabOrder = JSON.parse(localStorage.getItem('chatTabOrder') || '{}');
  } catch(e){
    chatTabOrder = {};
  }
}

function saveChatTabOrder(){
  localStorage.setItem('chatTabOrder', JSON.stringify(chatTabOrder));
}

function updateChatTabOrder(project, container){
  if(!container) return;
  chatTabOrder[project] = [...container.children].map(el => +el.dataset.tabId);
  saveChatTabOrder();
}

async function openMosaicEditModal(file){
  if(!file) return;
  mosaicEditingFile = file;
  const title = document.getElementById('mosaicEditTitle');
  if(title) title.textContent = file;
  try {
    const r = await fetch('/api/mosaic/get?file=' + encodeURIComponent(file));
    if(r.ok){
      const { content } = await r.json();
      document.getElementById('mosaicEditTextarea').value = content;
    } else {
      document.getElementById('mosaicEditTextarea').value = '';
    }
  } catch(e){
    console.error('Error loading mosaic file', e);
    document.getElementById('mosaicEditTextarea').value = '';
  }
  showModal(document.getElementById('mosaicEditModal'));
}

function addFilesFromCodeBlocks(text){
  if(!text) return;
  const blocks = text.match(/```[\s\S]*?```/g) || [];
  blocks.forEach(b => {
    const inner = b.slice(3, -3).trim();
    const lines = inner.split(/\r?\n/);
    let first = lines[0].trim();
    // Skip a leading language spec like "markdown" or "bash"
    if(/^[a-zA-Z]+$/.test(first) && lines.length > 1){
      lines.shift();
      first = lines[0].trim();
    }
    // Allow leading markdown headers like "# filename" which are
    // common when users copy code blocks from chat responses.
    if(first.startsWith('#')){
      first = first.replace(/^#+\s*/, '');
    }
    if(/^[\w./-]+\.[\w-]+$/.test(first)){
      addFileToMosaic(first);
      saveMosaicFile(first, lines.slice(1).join('\n'));
    }
  });
}

function getDisplayModelName(model){
  if(!model) return '';
  let displayName = String(model).trim();
  if(!displayName) return '';
  const prefixes = ['openrouter/', 'deepseek/'];
  for(const prefix of prefixes){
    if(displayName.startsWith(prefix)){
      displayName = displayName.slice(prefix.length);
    }
  }
  // Also strip common provider prefixes like `openai/` so UI doesn't show provider prefix
  if(displayName.startsWith('openai/')){
    displayName = displayName.slice('openai/'.length);
  }
  if(displayName.endsWith(':free')){
    displayName = displayName.slice(0, -':free'.length);
  }
  return displayName;
}


function appendModelInfoIcon(container, model){
  if(!container || !model) return;
  const trimmedModel = String(model).trim();
  if(!trimmedModel || trimmedModel.startsWith('prefab/')) return;
  const header = container.querySelector('.bubble-header') || container;
  const displayModel = getDisplayModelName(trimmedModel);
  const existingIcons = Array.from(container.querySelectorAll('.chat-model-info'));
  for(const existing of existingIcons){
    if(existing.parentElement !== header){
      existing.remove();
    }
  }
  let icon = header.querySelector('.chat-model-info');
  if(!icon){
    icon = document.createElement('div');
    icon.className = 'chat-model-info';
    header.appendChild(icon);
  }
  if(!icon.querySelector('.chat-model-info-symbol')){
    icon.textContent = '';
    const glyph = document.createElement('span');
    glyph.className = 'chat-model-info-symbol';
    // Show a search glyph for search-preview/search models, otherwise a generic info glyph
    const _m = String(trimmedModel || '').toLowerCase();
    const isSearchModel = _m.includes('search') || _m.includes('search-preview') || _m.includes('perplexity');
    glyph.textContent = isSearchModel ? '🔍' : 'i';
    if(isSearchModel) glyph.classList.add('chat-model-info-search');
    icon.appendChild(glyph);
  }
  icon.setAttribute('role', 'img');
  icon.setAttribute('tabindex', '0');
  icon.setAttribute('aria-label', `AI model: ${displayModel || trimmedModel}`);
  icon.setAttribute('data-tooltip', displayModel || trimmedModel);
  icon.removeAttribute('title');
  icon.dataset.fullModel = trimmedModel;
  container.classList.add('has-model-info');
}

function appendModelLabel(container, model, displayName, tokenInfo){
  if(!container || !model) return;
  const trimmedModel = String(model).trim();
  if(!trimmedModel || trimmedModel.startsWith('prefab/')) return;

  let parsedTokenInfo = null;
  if(tokenInfo){
    try {
      parsedTokenInfo = typeof tokenInfo === 'string' ? JSON.parse(tokenInfo) : tokenInfo;
    } catch(e){
      parsedTokenInfo = null;
    }
  }

  let responseSeconds = null;
  if(parsedTokenInfo && typeof parsedTokenInfo.responseTime === 'number'){
    const seconds = parsedTokenInfo.responseTime * 10;
    if(Number.isFinite(seconds)){
      responseSeconds = seconds;
    }
  }

  const baseDisplay = (displayName && String(displayName).trim()) || trimmedModel;
  const labelText = getDisplayModelName(baseDisplay) || getDisplayModelName(trimmedModel) || trimmedModel;

  const tooltipParts = [];
  if(labelText){
    tooltipParts.push(labelText);
  }
  if(responseSeconds !== null){
    tooltipParts.push(`${responseSeconds.toFixed(2)}s`);
  }
  const tooltipText = tooltipParts.join(' • ') || trimmedModel;

  const icon = container.querySelector('.chat-model-info');
  if(icon){
    icon.setAttribute('data-tooltip', tooltipText);
    icon.setAttribute('aria-label', `AI model: ${tooltipText}`);
    icon.removeAttribute('title');
    icon.dataset.fullModel = trimmedModel;
  }

  const existingLabel = container.querySelector('.chat-model-label');
  if(existingLabel){
    existingLabel.remove();
  }

  container.classList.add('has-model-info');
}

function isMobileViewport(){
  return window.innerWidth <= 700;
}

function updateChatPanelVisibility(){
  const chatPanel = document.querySelector(".chat-panel");
  if(!chatPanel) return;
  const path = (window && window.location && window.location.pathname) ? window.location.pathname : '';
  // Always hide the chat panel on code pages
  if(path === '/code' || path.startsWith('/code/')){
    chatPanel.style.display = 'none';
    return;
  }
  if(isMobileViewport() && sidebarVisible){
    chatPanel.style.display = "none";
  } else {
    chatPanel.style.display = "";
  }
}

function showModal(m){
  if(!m) return;
  m.style.display = "flex";
  if(m.hasAttribute("aria-hidden")){
    m.setAttribute("aria-hidden", "false");
  }
}
function hideModal(m){
  if(!m) return;
  m.style.display = "none";
  if(m.hasAttribute("aria-hidden")){
    m.setAttribute("aria-hidden", "true");
  }
}

function setAccountsFeatureVisibility(enabled){
  const normalized = !!enabled;
  accountsEnabled = normalized;
  const signupBtn = document.getElementById("signupBtn");
  if(signupBtn){
    signupBtn.style.display = normalized && !accountInfo ? "" : "none";
  }
  if(!normalized){
    hideModal(document.getElementById("authModal"));
  }
  if(document.body){
    document.body.classList.toggle("accounts-enabled", normalized);
    document.body.classList.toggle("accounts-disabled", !normalized);
  }
}

async function showConfirmDialog(options = {}){
  const {
    title = "Confirm Action",
    message = "Are you sure?",
    confirmText = "OK",
    cancelText = "Cancel",
    danger = false
  } = options;

  const modal = document.getElementById("confirmModal");
  const titleEl = document.getElementById("confirmModalTitle");
  const messageEl = document.getElementById("confirmModalMessage");
  const confirmBtn = document.getElementById("confirmModalConfirmBtn");
  const cancelBtn = document.getElementById("confirmModalCancelBtn");
  const closeBtn = document.getElementById("confirmModalCloseBtn");

  if(!modal || !messageEl || !confirmBtn || !cancelBtn){
    return window.confirm(message);
  }

  if(titleEl) titleEl.textContent = title;
  messageEl.textContent = message;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;

  confirmBtn.classList.remove("primary", "danger");
  if(danger){
    confirmBtn.classList.add("danger");
  } else {
    confirmBtn.classList.add("primary");
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      if(closeBtn) closeBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeyDown);
      hideModal(modal);
    };

    const resolveWith = (value) => {
      cleanup();
      resolve(value);
    };

    const onConfirm = () => resolveWith(true);
    const onCancel = () => resolveWith(false);
    const onOverlayClick = (evt) => {
      if(evt.target === modal){
        evt.stopPropagation();
        resolveWith(false);
      }
    };
    const onKeyDown = (evt) => {
      if(evt.key === "Escape"){
        evt.preventDefault();
        resolveWith(false);
      } else if(evt.key === "Enter" && document.activeElement === confirmBtn){
        evt.preventDefault();
        resolveWith(true);
      }
    };

    confirmBtn?.addEventListener("click", onConfirm, { once: true });
    cancelBtn?.addEventListener("click", onCancel, { once: true });
    if(closeBtn) closeBtn?.addEventListener("click", onCancel, { once: true });
    modal?.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeyDown);

    showModal(modal);
    confirmBtn.focus();
  });
}
$$(".modal").forEach(m => m?.addEventListener("click", e => {
  if(e.target === m) hideModal(m);
}));

function showPageLoader(){
  const loader = document.getElementById("pageLoader");
  if(loader) loader.classList.add("show");
}

function hidePageLoader(){
  const loader = document.getElementById("pageLoader");
  if(loader) loader.classList.remove("show");
}

const AUTH_MODAL_STATE_KEY = "aurora.authModalState";
let authEmailValue = "";
let authModalStep = "email";

function persistAuthModalState(){
  try {
    sessionStorage.setItem(
      AUTH_MODAL_STATE_KEY,
      JSON.stringify({ email: authEmailValue, step: authModalStep })
    );
  } catch(err){
    console.debug("Auth modal state persistence unavailable", err);
  }
}

function loadAuthModalState(){
  try {
    const raw = sessionStorage.getItem(AUTH_MODAL_STATE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch(err){
    return null;
  }
}

function isBasicEmailValid(email){
  if(!email){
    return false;
  }
  const normalized = email.trim();
  if(!normalized){
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function setAuthEmailValue(email){
  authEmailValue = email;
  const loginEmail = document.getElementById("loginEmail");
  if(loginEmail) loginEmail.value = email;
  const signupEmail = document.getElementById("signupEmail");
  if(signupEmail) signupEmail.value = email;
  const emailInput = document.getElementById("authEmailInput");
  if(emailInput) emailInput.value = email;
  const loginDisplay = document.getElementById("authEmailDisplayLogin");
  if(loginDisplay) loginDisplay.textContent = email;
  const signupDisplay = document.getElementById("authEmailDisplaySignup");
  if(signupDisplay) signupDisplay.textContent = email;
  persistAuthModalState();
}

function showAuthEmailStep({ keepEmail = true } = {}){
  if(!accountsEnabled){
    return;
  }
  if(!keepEmail){
    setAuthEmailValue("");
  }
  authModalStep = "email";
  persistAuthModalState();
  const benefits = document.querySelector("#authModal .auth-benefits");
  const login = document.getElementById("loginForm");
  const signup = document.getElementById("signupForm");
  const emailStep = document.getElementById("authEmailStep");
  if(benefits) benefits.style.display = "block";
  if(login) login.style.display = "none";
  if(signup) signup.style.display = "none";
  if(emailStep) emailStep.style.display = "block";
  const totpLabel = document.getElementById("totpLoginLabel");
  if(totpLabel) totpLabel.style.display = "none";
  const emailInput = document.getElementById("authEmailInput");
  if(emailInput) emailInput.focus();
}

function showSignupForm(){
  if(!accountsEnabled){
    return;
  }
  if(!authEmailValue || !isBasicEmailValid(authEmailValue)){
    if(authEmailValue){
      showToast("Enter a valid email address");
    }
    showAuthEmailStep({ keepEmail: false });
    return;
  }
  authModalStep = "signup";
  persistAuthModalState();
  const benefits = document.querySelector("#authModal .auth-benefits");
  const emailStep = document.getElementById("authEmailStep");
  if(emailStep) emailStep.style.display = "none";
  const login = document.getElementById('loginForm');
  const signup = document.getElementById('signupForm');
  if(benefits) benefits.style.display = "none";
  if(login) login.style.display = 'none';
  if(signup) signup.style.display = 'block';
}

function showLoginForm(){
  if(!accountsEnabled){
    return;
  }
  if(!authEmailValue || !isBasicEmailValid(authEmailValue)){
    if(authEmailValue){
      showToast("Enter a valid email address");
    }
    showAuthEmailStep({ keepEmail: false });
    return;
  }
  authModalStep = "login";
  persistAuthModalState();
  const benefits = document.querySelector("#authModal .auth-benefits");
  const emailStep = document.getElementById("authEmailStep");
  if(emailStep) emailStep.style.display = "none";
  const login = document.getElementById('loginForm');
  const signup = document.getElementById('signupForm');
  if(benefits) benefits.style.display = "none";
  if(signup) signup.style.display = 'none';
  if(login) login.style.display = 'block';
  const totpLabel = document.getElementById("totpLoginLabel");
  if(totpLabel) totpLabel.style.display = "none";
}

function openAuthModal({ preferredStep } = {}){
  if(!ensureAccountsEnabled()){
    return;
  }
  const saved = loadAuthModalState();
  if(saved?.email){
    setAuthEmailValue(saved.email);
  }
  const step = saved?.step || preferredStep || "email";
  if(step === "login"){
    showLoginForm();
  } else if(step === "signup"){
    showSignupForm();
  } else {
    showAuthEmailStep({ keepEmail: true });
  }
  showModal(document.getElementById("authModal"));
}

function openSignupModal(e){
  if(e) e.preventDefault();
  openAuthModal({ preferredStep: "signup" });
}

function openLoginModal(e){
  if(e) e.preventDefault();
  openAuthModal({ preferredStep: "login" });
}

async function checkAuthEmailAndContinue(){
  if(!ensureAccountsEnabled()){
    return;
  }
  const emailInput = document.getElementById("authEmailInput");
  const email = emailInput ? emailInput.value.trim() : "";
  if(!email){
    showToast("Email required");
    return;
  }
  if(emailInput && typeof emailInput.checkValidity === "function" && !emailInput.checkValidity()){
    showToast("Enter a valid email address");
    return;
  }
  if(!isBasicEmailValid(email)){
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
    if(resp.ok && data){
      setAuthEmailValue(email);
      if(data.exists){
        showLoginForm();
      } else {
        showSignupForm();
      }
    } else {
      showToast(data?.error || "Unable to check email");
    }
  } catch(err){
    console.error("Email lookup failed", err);
    showToast("Unable to check email");
  }
}

function renderAccountSettingsSection(){
  const accountSection = document.getElementById("settingsAccountSection");
  const signedOutSection = document.getElementById("settingsAccountSignedOut");
  const signedOutMessage = document.getElementById("settingsAccountSignedOutMessage");
  if(!accountSection && !signedOutSection){
    return;
  }
  const isEnabled = accountsEnabled;
  const isLoggedIn = !!accountInfo;
  if(accountSection){
    accountSection.style.display = isEnabled && isLoggedIn ? "" : "none";
  }
  if(signedOutSection){
    signedOutSection.style.display = !isLoggedIn ? "" : "none";
  }
  if(signedOutMessage){
    if(!isEnabled){
      signedOutMessage.textContent = "Accounts are currently unavailable.";
    } else {
      signedOutMessage.textContent = "Log in to manage your account.";
    }
  }
  if(!isEnabled || !isLoggedIn){
    return;
  }
  const emailEl = document.getElementById("accountEmail");
  if(emailEl) emailEl.textContent = accountInfo.email;
  const totpSection = document.getElementById('totpSection');
  const enabledMsg = document.getElementById('totpEnabledMsg');
  const enableBtn = document.getElementById('enableTotpBtn');
  const isTwoFactorEnabled = featureFlagConfig.twoFactorEnabled2026;
  if(totpSection){
    totpSection.style.display = isTwoFactorEnabled ? '' : 'none';
  }
  if(isTwoFactorEnabled){
    if(accountInfo.totpEnabled){
      if(enabledMsg) enabledMsg.style.display = 'block';
      if(enableBtn) enableBtn.style.display = 'none';
    } else {
      if(enabledMsg) enabledMsg.style.display = 'none';
      if(enableBtn) enableBtn.style.display = 'inline-block';
    }
  } else {
    if(enabledMsg) enabledMsg.style.display = 'none';
    if(enableBtn) enableBtn.style.display = 'none';
  }
}

async function openSettingsModal(e){
  if(e) e.preventDefault();
  updateSettingsStatus(document.getElementById('settingsModalStatus'), '');
  const tzEl = document.getElementById('accountTimezone');
  const tzValue = (accountInfo?.timezone && accountInfo.timezone.trim()) || detectedTimezone || '';
  if(tzEl){
    ensureTimezoneOption(tzEl, tzValue);
    tzEl.value = tzValue || '';
  }
  updateSettingsStatus(document.getElementById('timezoneSaveStatus'), '');
  const autoScrollCheck = document.getElementById('accountAutoScrollCheck');
  if(autoScrollCheck){
    autoScrollCheck.checked = chatAutoScroll;
  }
  updateSettingsStatus(document.getElementById('autoScrollSaveStatus'), '');
  const collapseReasoningCheck = document.getElementById('collapseReasoningCheck');
  if(collapseReasoningCheck){
    collapseReasoningCheck.checked = collapseReasoningByDefault;
  }
  updateSettingsStatus(document.getElementById('collapseReasoningSaveStatus'), '');
  const mobileCheck = document.getElementById('mobileThinSidebarCheck');
  if(mobileCheck){
    mobileCheck.checked = mobileSidebarToolbar;
  }
  updateSettingsStatus(document.getElementById('mobileSidebarSaveStatus'), '');
  const archiveChatButtonCheck = document.getElementById('showArchiveChatButtonCheck');
  if(archiveChatButtonCheck){
    archiveChatButtonCheck.checked = showArchiveChatButton;
  }
  updateSettingsStatus(document.getElementById('archiveChatButtonSaveStatus'), '');
  const sessionIdEl = document.getElementById('settingsSessionIdText');
  if(sessionIdEl){
    sessionIdEl.textContent = sessionId || '';
  }
  const themeSelect = document.getElementById('themeSelect');
  if(themeSelect){
    themeSelect.value = document.body.dataset.theme || getStoredTheme();
  }
  renderAccountSettingsSection();
  if(!usageLimitCache){
    updateUsageLimitInfo();
  }
  showModal(document.getElementById("settingsModal"));
}

function updateSettingsStatus(el, message, state){
  if(!el) return;
  el.textContent = message || '';
  el.classList.remove('is-success', 'is-error');
  if(state === 'success'){
    el.classList.add('is-success');
  } else if(state === 'error'){
    el.classList.add('is-error');
  }
}

function updateSettingsModalStatus(message, state){
  updateSettingsStatus(document.getElementById('settingsModalStatus'), message, state);
}


function updateAccountButton(info){
  const btn = document.getElementById("signupBtn");
  const favBtn = document.getElementById("aiFavoritesBtn");
  if(favBtn){
    favBtn.style.display = "none";
  }
  if(!btn) return;
  if(info && typeof info.accountsEnabled !== 'undefined'){
    setAccountsFeatureVisibility(info.accountsEnabled);
  }
  if(!accountsEnabled){
    btn.style.display = "none";
    accountInfo = null;
    togglePortfolioMenu(false);
    toggleImageIdColumn();
    toggleDesignTabs(false);
    return;
  }
  btn.removeEventListener("click", openSignupModal);
  btn.removeEventListener("click", openLoginModal);
  if(info && info.exists){
    accountInfo = info;
    btn.style.display = "none";
    togglePortfolioMenu(info.id === 1);
    toggleImageIdColumn();
    toggleDesignTabs(info.plan === 'Pro' || info.plan === 'Ultimate');
  } else {
    accountInfo = null;
    btn.style.display = "";
    btn.textContent = "Sign Up / Log In";
    btn?.addEventListener("click", openSignupModal);
    togglePortfolioMenu(false);
    toggleImageIdColumn();
    toggleDesignTabs(false);
  }
  renderAccountSettingsSection();
}


function showToast(msg, duration=1500){
  const el = document.getElementById("toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
}

function ensureAccountsEnabled(showMessage = true){
  if(accountsEnabled){
    return true;
  }
  if(showMessage){
    showToast("Accounts are currently unavailable.");
  }
  return false;
}

function renderDesignSuggestions(show = true){
  const container = document.getElementById('startSuggestions');
  if(!container) return;
  container.innerHTML = '';
  container.style.display = show ? 'grid' : 'none';
  if(!show) return;
  designStartPrompts.forEach(text => {
    const b = document.createElement('button');
    b.textContent = text;
    b?.addEventListener('click', () => {
      chatInputEl.value = text;
      chatSendBtnEl.click();
    });
    container.appendChild(b);
  });
}

async function logout(){
  if(!ensureAccountsEnabled()){
    return;
  }
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch(err){
    console.error("Logout failed", err);
  }
  authModalStep = "email";
  setAuthEmailValue("");
  sessionStorage.removeItem(AUTH_MODAL_STATE_KEY);
  document.cookie = "sessionId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  sessionStorage.removeItem('sessionId');
  hideModal(document.getElementById("settingsModal"));
  updateAccountButton(null);
  showToast("Logged out");
  setTimeout(() => location.reload(), 500);
}

let limitCountdownTimer = null;

function startLimitCountdown(targetTime){
  const el = document.getElementById('imageLimitCountdown');
  if(!el) return;
  function update(){
    const diff = targetTime - Date.now();
    if(diff <= 0){
      clearInterval(limitCountdownTimer);
      limitCountdownTimer = null;
      el.textContent = '';
      updateUsageLimitInfo();
    } else {
      const m = String(Math.floor(diff/60000)).padStart(2,'0');
      const s = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
      el.textContent = `Next slot in ${m}:${s}`;
    }
  }
  if(limitCountdownTimer) clearInterval(limitCountdownTimer);
  update();
  limitCountdownTimer = setInterval(update, 1000);
}

function scrollChatToBottom(force = false){
  if(!force && !chatAutoScroll) return;
  const el = document.getElementById("chatMessages");
  if(el) el.scrollTop = el.scrollHeight;
}

function showImageGenerationIndicator(){
  const chatMessagesEl = document.getElementById("chatMessages");
  let indicator = document.getElementById("imageGenerationIndicator");
  if(!indicator){
    indicator = document.createElement("div");
    indicator.id = "imageGenerationIndicator";
    indicator.style.color = "#0ff";
    indicator.innerHTML = "Generating image<span class=\"loading-spinner\"></span>";
    if(chatMessagesEl) chatMessagesEl.appendChild(indicator);
  }
  if(chatSendBtnEl){
    if(typeof chatSendBtnEl.dataset.imageGenPrevDisabled === "undefined"){
      chatSendBtnEl.dataset.imageGenPrevDisabled = chatSendBtnEl.disabled ? "1" : "0";
    }
    chatSendBtnEl.disabled = true;
  }
  if(chatRepeatBtnEl){
    if(typeof chatRepeatBtnEl.dataset.imageGenPrevDisabled === "undefined"){
      chatRepeatBtnEl.dataset.imageGenPrevDisabled = chatRepeatBtnEl.disabled ? "1" : "0";
    }
    chatRepeatBtnEl.disabled = true;
  }
  indicator.style.display = "";
  if(chatAutoScroll){
    indicator.scrollIntoView({ behavior: "smooth", block: "end" });
  }
}

function hideImageGenerationIndicator(){
  const indicator = document.getElementById("imageGenerationIndicator");
  if(indicator) indicator.style.display = "none";
  if(chatSendBtnEl && typeof chatSendBtnEl.dataset.imageGenPrevDisabled !== "undefined"){
    if(chatSendBtnEl.dataset.imageGenPrevDisabled === "0"){
      chatSendBtnEl.disabled = false;
    }
    delete chatSendBtnEl.dataset.imageGenPrevDisabled;
  }
  if(chatRepeatBtnEl && typeof chatRepeatBtnEl.dataset.imageGenPrevDisabled !== "undefined"){
    const wasEnabled = chatRepeatBtnEl.dataset.imageGenPrevDisabled === "0";
    delete chatRepeatBtnEl.dataset.imageGenPrevDisabled;
    if(wasEnabled){
      chatRepeatBtnEl.disabled = false;
    }
  }
  updateRepeatButtonVisibility();
}

function appendChatElement(el){
  const chatMessagesEl = document.getElementById("chatMessages");
  if(!chatMessagesEl) return;
  const placeholder = document.getElementById("chatPlaceholder");
  if(placeholder && placeholder.parentElement === chatMessagesEl){
    chatMessagesEl.insertBefore(el, placeholder);
    return;
  }
  const indicator = document.getElementById("imageGenerationIndicator");
  if(indicator && indicator.parentElement === chatMessagesEl){
    chatMessagesEl.insertBefore(el, indicator);
  } else {
    chatMessagesEl.appendChild(el);
  }
}

function renderInitialGreeting(message=null){
  const chatMessagesEl = document.getElementById("chatMessages");
  if(!chatMessagesEl) return;

  if(chatMessagesEl.querySelector('.initial-greeting')) return;

  const placeholderEl = document.getElementById("chatPlaceholder");
  if(placeholderEl) placeholderEl.remove();

  const isoNow = new Date().toISOString();
  const dateStr = isoDate(isoNow);
  if(lastChatDate !== dateStr){
    const dateDiv = document.createElement("div");
    dateDiv.className = "chat-date-header";
    dateDiv.textContent = dateStr;
    appendChatElement(dateDiv);
    lastChatDate = dateStr;
  }

  const seqDiv = document.createElement("div");
  seqDiv.className = "chat-sequence initial-greeting";

  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai">${window.agentName || 'Alfe'}</div>
    <span style="opacity:0.8;">${formatTimestamp(isoNow)}</span>
  `;
  botDiv.appendChild(botHead);

  const botBody = document.createElement("div");
  const greetingText = message || getRandomAlfeGreeting();
  botBody.innerHTML = formatCodeBlocks(greetingText);
  botDiv.appendChild(botBody);

  seqDiv.appendChild(botDiv);

  appendChatElement(seqDiv);
  scrollChatToBottom(true);

  return greetingText;
}

function persistPrefabGreeting(tabId, text){
  if(prefabGreetingPendingTabs.has(tabId)) return;
  const trimmed = (text || '').trim();
  if(!trimmed) return;
  prefabGreetingPendingTabs.add(tabId);
  (async () => {
    try {
      const resp = await fetch('/api/chat/pairs/prefab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId, text: trimmed, kind: 'greeting', sessionId })
      });
      if(resp.ok){
        setTimeout(() => loadChatHistory(tabId, true), 100);
      } else {
        const errText = await resp.text().catch(() => '');
        console.error('Failed to persist prefab greeting', errText);
      }
    } catch(err){
      console.error('Failed to persist prefab greeting:', err);
    } finally {
      prefabGreetingPendingTabs.delete(tabId);
    }
  })();
}

function queueMessage(text){
  if(!text) return;
  messageQueue.push(text);
  const cont = document.getElementById("chatQueueContainer");
  if(cont){
    const div = document.createElement("div");
    div.className = "chat-queue-bubble";
    div.textContent = text;
    cont.appendChild(div);
  }
}

function processNextQueueMessage(){
  if(!chatQueueEnabled) return;
  if(messageQueue.length === 0) return;
  if(chatSendBtnEl.disabled) return;
  const cont = document.getElementById("chatQueueContainer");
  if(cont && cont.firstElementChild){
    cont.removeChild(cont.firstElementChild);
  }
  const next = messageQueue.shift();
  chatInputEl.value = next;
  setTimeout(() => chatSendBtnEl.click(), 0);
}

function formatUsageCount(count, limit){
  const safeCount = typeof count === 'number' ? count : 0;
  if(limit === null || typeof limit === 'undefined'){
    return `${safeCount}/∞`;
  }
  return `${safeCount}/${limit}`;
}

function usageLimitReached(count, limit){
  if(limit === null || typeof limit === 'undefined') return false;
  if(typeof limit !== 'number') return false;
  if(typeof count !== 'number') return false;
  return count >= limit;
}

async function updateUsageLimitInfo(){
  try {
    const resp = await fetch(`/api/image/counts?sessionId=${encodeURIComponent(sessionId)}`);
    if(!resp.ok){
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    usageLimitCache = data;
    const el = document.getElementById('imageLimitInfo');
    if(el){
      const imageSessionText = formatUsageCount(data.sessionCount, data.sessionLimit);
      const imageIpText = formatUsageCount(data.ipCount, data.ipLimit);
      const searchSessionText = formatUsageCount(data.searchSessionCount, data.searchSessionLimit);
      const searchIpText = formatUsageCount(data.searchIpCount, data.searchIpLimit);
      el.textContent = `Images S:${imageSessionText} · IP:${imageIpText} | Searches S:${searchSessionText} · IP:${searchIpText}`;
      const imageLimitHit = usageLimitReached(data.sessionCount, data.sessionLimit) || usageLimitReached(data.ipCount, data.ipLimit);
      const searchLimitHit = usageLimitReached(data.searchSessionCount, data.searchSessionLimit)
        || usageLimitReached(data.searchIpCount, data.searchIpLimit);
      if(imageLimitHit || searchLimitHit){
        el.classList.add('limit-reached');
        if(data.nextReduction && imageLimitHit){
          startLimitCountdown(new Date(data.nextReduction).getTime());
        }
      } else {
        el.classList.remove('limit-reached');
        stopLimitCountdown();
      }
    }
    return data;
  } catch(e){
    console.error('Failed to update usage limit info:', e);
    return usageLimitCache;
  }
}

function buildUsageSummary(kind){
  if(!usageLimitCache) return '';
  const imageSession = formatUsageCount(usageLimitCache.sessionCount, usageLimitCache.sessionLimit);
  const imageIp = formatUsageCount(usageLimitCache.ipCount, usageLimitCache.ipLimit);
  const searchSession = formatUsageCount(usageLimitCache.searchSessionCount, usageLimitCache.searchSessionLimit);
  const searchIp = formatUsageCount(usageLimitCache.searchIpCount, usageLimitCache.searchIpLimit);
  if(kind === 'image'){
    return `Image session: ${imageSession} • IP: ${imageIp}`;
  }
  if(kind === 'search'){
    return `Search session: ${searchSession} • IP: ${searchIp}`;
  }
  return `Images → session: ${imageSession} • IP: ${imageIp} | Searches → session: ${searchSession} • IP: ${searchIp}`;
}

function showUsageLimitModal(kind = 'usage', message = 'Usage limit reached. Please try again later.'){
  const modal = document.getElementById('usageLimitModal');
  const titleEl = document.getElementById('usageLimitModalTitle');
  const messageEl = document.getElementById('usageLimitModalMessage');
  const summaryEl = document.getElementById('usageLimitModalSummary');
  const iconEl = document.getElementById('usageLimitModalIcon');
  const ctaEl = document.getElementById('usageLimitModalCta');
  if(!modal || !titleEl || !messageEl) return;

  let title = 'Usage limit reached';
  let icon = '⚠️';
  let resolvedMessage = message;
  if(kind === 'image'){
    title = 'Image limit reached';
    icon = '🖼️';
    if(!message || message === 'Usage limit reached. Please try again later.'){
      resolvedMessage = 'Image generation limit reached for this session.';
    }
  } else if(kind === 'search'){
    title = 'Search limit reached';
    icon = '🔍';
  } else {
    icon = '🚦';
  }

  titleEl.textContent = title;
  if(iconEl) iconEl.textContent = icon;
  messageEl.textContent = resolvedMessage;
  if(summaryEl){
    summaryEl.textContent = usageLimitCache ? buildUsageSummary(kind) : '';
  }
  if(ctaEl){
    ctaEl.style.display = '';
  }

  showModal(modal);
  updateUsageLimitInfo();
}

function stopLimitCountdown(){
  const el = document.getElementById('imageLimitCountdown');
  if(el) el.textContent = '';
  if(limitCountdownTimer){
    clearInterval(limitCountdownTimer);
    limitCountdownTimer = null;
  }
}


function registerActionHook(name, fn){
  actionHooks.push({ name, fn });
}

function renderActionHooks(){
  const list = document.getElementById("actionHooksList");
  if(!list) return;
  list.innerHTML = "";
  actionHooks.forEach((h, idx) => {
    const li = document.createElement("li");
    li.textContent = h.name || `Hook ${idx+1}`;
    list.appendChild(li);
  });
}

async function setSetting(key, value){
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value })
  });
  if(response.ok){
    settingsCache[key] = value;
    return true;
  }
  return false;
}

async function setSettings(map){
  const settings = Object.entries(map).map(([key, value]) => ({ key, value }));
  const response = await fetch("/api/settings/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings })
  });
  if(response.ok){
    for(const [key, value] of Object.entries(map)){
      settingsCache[key] = value;
    }
  }
}

const settingsCache = {};

async function getSettings(keys){
  const uncached = keys.filter(k => !(k in settingsCache));
  if(uncached.length > 0){
    const q = encodeURIComponent(uncached.join(','));
    const r = await fetch(`/api/settings?keys=${q}`);
    if(r.ok){
      const { settings } = await r.json();
      settings.forEach(({key, value}) => { settingsCache[key] = value; });
    }
  }
  return Object.fromEntries(keys.map(k => [k, settingsCache[k]]));
}

async function getSetting(key){
  if(key in settingsCache) return settingsCache[key];
  const r = await fetch(`/api/settings/${key}`);
  if(!r.ok) return undefined;
  const { value } = await r.json();
  settingsCache[key] = value;
  return value;
}

async function toggleTasks(){
  tasksVisible = !tasksVisible;
  $("#tasks").style.display = tasksVisible ? "" : "none";
  $("#toggleTasksBtn").textContent = tasksVisible ? "Hide tasks" : "Show tasks";
  await setSetting("tasks_visible", tasksVisible);
}
$("#toggleTasksBtn").addEventListener("click", toggleTasks);

async function toggleMarkdownPanel(){
  markdownPanelVisible = !markdownPanelVisible;
  const pnl = document.getElementById("taskListPanel");
  if(pnl) pnl.style.display = markdownPanelVisible ? "" : "none";
  await setSetting("markdown_panel_visible", markdownPanelVisible);
}

async function toggleSubroutinePanel(){
  subroutinePanelVisible = !subroutinePanelVisible;
  const subPanel = document.getElementById("chatSubroutinesPanel");
  if(subPanel) subPanel.style.display = subroutinePanelVisible ? "" : "none";
  await setSetting("subroutine_panel_visible", subroutinePanelVisible);
}

function canUseMosaic(){
  return mosaicAllowedTypes.includes(currentTabType);
}

function updateMosaicPanelVisibility(){
  const pnl = document.getElementById("mosaicPanel");
  if(pnl){
    const visible = mosaicPanelVisible && canUseMosaic();
    pnl.style.display = visible ? "" : "none";
  }
  const renameLbl = document.getElementById("renameShowMosaicCheck")?.closest('label');
  if(renameLbl) renameLbl.style.display = canUseMosaic() ? '' : 'none';
  const settingsLbl = document.getElementById("showMosaicPanelCheck")?.closest('label');
  if(settingsLbl) settingsLbl.style.display = canUseMosaic() ? '' : 'none';
}

function closeTabOptionsMenu(){
  if(!tabOptionsMenu) return;
  tabOptionsMenu.remove();
  tabOptionsMenu = null;
  tabOptionsMenuTarget = null;
  document.removeEventListener('click', handleTabOptionsOutsideClick, true);
  document.removeEventListener('keydown', handleTabOptionsKeydown, true);
  window.removeEventListener('resize', handleTabOptionsResize);
}

function handleTabOptionsOutsideClick(evt){
  if(!tabOptionsMenu) return;
  if(tabOptionsMenu.contains(evt.target) || evt.target === tabOptionsMenuTarget){
    return;
  }
  closeTabOptionsMenu();
}

function handleTabOptionsKeydown(evt){
  if(evt.key === 'Escape'){ closeTabOptionsMenu(); }
}

function handleTabOptionsResize(){
  closeTabOptionsMenu();
}

function openTabOptionsMenu(tab, anchor){
  closeTabOptionsMenu();
  tabOptionsMenuTarget = anchor;
  tabOptionsMenu = document.createElement('div');
  tabOptionsMenu.className = 'tab-options-menu';

  const makeItem = (label, action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-options-item';
    btn.textContent = label;
    btn?.addEventListener('click', () => {
      closeTabOptionsMenu();
      action();
    });
    tabOptionsMenu.appendChild(btn);
  };

  makeItem('Rename', () => openEditTabNameModal(tab.id));
  if(tabSupportsFavorites(tab)){
    makeItem(tab.favorite ? 'Remove Favorite' : 'Add to Favorites', () => toggleFavoriteTab(tab.id, !tab.favorite));
  }
  makeItem(tab.archived ? 'Unarchive' : 'Archive', () => toggleArchiveTab(tab.id, tab.archived ? 0 : 1));

  document.body.appendChild(tabOptionsMenu);

  const rect = anchor.getBoundingClientRect();
  let left = rect.left + window.scrollX;
  const top = rect.bottom + window.scrollY;
  tabOptionsMenu.style.top = `${top}px`;
  tabOptionsMenu.style.left = `${left}px`;

  const viewportRight = window.scrollX + window.innerWidth;
  const menuRight = left + tabOptionsMenu.offsetWidth;
  if(menuRight > viewportRight){
    left = Math.max(window.scrollX + 8, viewportRight - tabOptionsMenu.offsetWidth - 8);
    tabOptionsMenu.style.left = `${left}px`;
  }

  requestAnimationFrame(() => {
    if(tabOptionsMenu) tabOptionsMenu.classList.add('visible');
  });

  document.addEventListener('click', handleTabOptionsOutsideClick, true);
  document.addEventListener('keydown', handleTabOptionsKeydown, true);
  window.addEventListener('resize', handleTabOptionsResize);
}

function toggleTabOptionsMenu(tab, anchor){
  if(tabOptionsMenu && tabOptionsMenuTarget === anchor){
    closeTabOptionsMenu();
  }else{
    openTabOptionsMenu(tab, anchor);
  }
}

function createTabOptionsButton(tab){
  const btn = document.createElement('button');
  btn.innerHTML = '&#9881;';
  btn.className = 'tab-options-trigger';
  btn?.addEventListener('click', e => {
    e.stopPropagation();
    toggleTabOptionsMenu(tab, btn);
  });
  return btn;
}

async function toggleMosaicPanel(){
  if(!canUseMosaic()) return;
  mosaicPanelVisible = !mosaicPanelVisible;
  updateMosaicPanelVisibility();
  await setSetting("mosaic_panel_visible", mosaicPanelVisible);
  if(currentTabId){
    await setSetting(mosaicKey(currentTabId), mosaicPanelVisible);
  }
}

async function toggleSidebar(){
  if(isEmbedded) return;
  sidebarVisible = !sidebarVisible;
  const sidebarEl = $(".sidebar");
  const dividerEl = $("#divider");
  sidebarEl.classList.toggle("collapsed", !sidebarVisible);
  dividerEl.style.display = sidebarVisible ? "" : "none";
  const toggleSidebarBtnEl = $("#toggleSidebarBtn");
  if(toggleSidebarBtnEl){
    toggleSidebarBtnEl.textContent = sidebarVisible ? "Hide sidebar" : "Show sidebar";
  }

  const topBtns = document.getElementById("topRightButtons");
  if(topBtns){
    if(isMobileViewport()){
      topBtns.style.display = sidebarVisible ? "none" : "flex";
    } else {
      topBtns.style.display = "flex";
    }
  }

  const expandBtn = document.getElementById("expandSidebarBtn");
  expandBtn.style.display = "none";

  const collapsedLogo = document.getElementById("collapsedSidebarLogo");
  const collapsedArrow = document.getElementById("expandSidebarArrow");
  if(collapsedLogo){
    collapsedLogo.style.display = sidebarVisible ? "none" : "block";
  }
  if(collapsedArrow){
    collapsedArrow.style.display = sidebarVisible ? "none" : "block";
  }

  if(isEmbedded){
    sidebarVisible = false;
    ensureSidebarHiddenForEmbed();
  }  updateChatPanelVisibility();

  // Shift top chat tabs bar when sidebar is collapsed so it doesn't
  // overlap the logo icon in the top left.
  const appEl = document.querySelector(".app");
  if(appEl){
    appEl.classList.toggle("sidebar-collapsed", !sidebarVisible);
  }
  updateMobileThinSidebar();

  await setSetting("sidebar_visible", sidebarVisible);
}
const toggleSidebarBtn = $("#toggleSidebarBtn");
toggleSidebarBtn?.addEventListener("click", ev => {
  ev.stopPropagation();
  toggleSidebar();
});
document.getElementById("sidebarToggleIcon")?.addEventListener("click", ev => {
  ev.stopPropagation();
  toggleSidebar();
});
document.getElementById("closeSidebarIcon")?.addEventListener("click", ev => {
  ev.stopPropagation();
  if(sidebarVisible){
    toggleSidebar();
  }
});
document.getElementById("hideSidebarBtn")?.addEventListener("click", ev => {
  ev.stopPropagation();
  toggleSidebar();
});

document.getElementById("expandSidebarBtn").addEventListener("click", ev => {
  ev.stopPropagation();
  if(!sidebarVisible) {
    toggleSidebar();
  }
});

const collapsedLogoEl = document.getElementById("collapsedSidebarLogo");
collapsedLogoEl?.addEventListener("click", ev => {
  ev.stopPropagation();
  if(!sidebarVisible){
    toggleSidebar();
  }
});

const collapsedArrowEl = document.getElementById("expandSidebarArrow");
collapsedArrowEl?.addEventListener("click", ev => {
  ev.stopPropagation();
  if(!sidebarVisible){
    toggleSidebar();
  }
});

// On mobile viewports, collapse the sidebar when clicking
// anywhere outside of it. This makes dismissing the sidebar
// easier on touch devices without needing to tap the toggle
// button again.
document.addEventListener("click", ev => {
  if(!isMobileViewport() || !sidebarVisible) return;
  const sidebarEl = document.querySelector(".sidebar");
  const dividerEl = document.getElementById("divider");
  if(!sidebarEl) return;
  if(!sidebarEl.contains(ev.target) && ev.target !== dividerEl && !dividerEl.contains(ev.target)){
    toggleSidebar();
  }
});

// Swipe gestures on mobile to open/close the sidebar
let swipeStartX = null;
let swipeStartY = null;
let swipeStartTime = 0;
const swipeThreshold = 40; // minimum horizontal movement in px
const swipeEdgeSize = 40;  // active zone from screen/element edge
const swipeAllowedTime = 500; // max time in ms

document.addEventListener("touchstart", ev => {
  if(ev.touches.length !== 1) return;
  swipeStartX = ev.touches[0].clientX;
  swipeStartY = ev.touches[0].clientY;
  swipeStartTime = Date.now();
});

document.addEventListener("touchend", ev => {
  if(swipeStartX === null) return;
  const dx = ev.changedTouches[0].clientX - swipeStartX;
  const dy = Math.abs(ev.changedTouches[0].clientY - swipeStartY);
  const dt = Date.now() - swipeStartTime;
  if(dt <= swipeAllowedTime && Math.abs(dx) > swipeThreshold && Math.abs(dx) > dy){
    if(dx > 0 && !sidebarVisible && isMobileViewport()){
      toggleSidebar();
    } else if(dx < 0 && sidebarVisible){
      const sidebarEl = document.querySelector(".sidebar");
      if(sidebarEl){
        const rect = sidebarEl.getBoundingClientRect();
        if(swipeStartX > rect.right - swipeEdgeSize){
          toggleSidebar();
        }
      }
    }
  }
  swipeStartX = null;
});

async function toggleNavMenu(){
  navMenuVisible = !navMenuVisible;
  toggleNavMenuVisibility(navMenuVisible);
  const check = document.getElementById("showNavMenuCheck");
  if(check) check.checked = navMenuVisible;
  await setSetting("nav_menu_visible", navMenuVisible);
}
document.getElementById("navMenuToggle")?.addEventListener("click", toggleNavMenu);

  async function toggleTabGenerateImages(){
    const t = chatTabs.find(t => t.id===currentTabId);
    if(!t || t.tab_type !== 'design') return;
    tabGenerateImages = !tabGenerateImages;
    const chk = document.getElementById("tabGenerateImagesCheck");
    if(chk) chk.checked = tabGenerateImages;
    const r = await fetch('/api/chat/tabs/generate_images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabId: currentTabId, enabled: tabGenerateImages, sessionId })
    });
    if(r.ok){
      if(t) t.generate_images = tabGenerateImages ? 1 : 0;
    }
  }
  document.getElementById("tabGenerateImagesCheck").addEventListener("change", toggleTabGenerateImages);

function updateView(v){
  currentView = v;
  $("#viewTabChat").classList.toggle("active", v === 'chat');
  $("#viewTabTasks").classList.toggle("active", v === 'tasks');
  $("#viewTabArchive").classList.toggle("active", v === 'archive');
  const showSub = v !== 'chat';
  const taskPanel = document.getElementById("taskListPanel");
  if(taskPanel) taskPanel.style.display = showSub ? "" : "none";
  const chatPanel = document.getElementById("chatPanel");
  if(chatPanel) chatPanel.style.display = v === 'chat' ? "" : "none";
}

async function loadSettings(){
  const keys = [
    "visible_columns","columns_order","tasks_visible","markdown_panel_visible",
    "subroutine_panel_visible","mosaic_panel_visible","sidebar_visible","enter_submits_message",
    "sidebar_width","model_tabs_bar_visible","top_chat_tabs_bar_visible",
    "project_info_bar_visible","aurora_project_bar_visible","nav_menu_visible",
    "view_tabs_bar_visible","show_project_name_in_tabs","show_archived_tabs",
    "show_dependencies_column","image_gen_service","image_gen_model","image_upload_enabled",
    "image_paint_tray_enabled","activity_iframe_menu_visible",
    "nexum_chat_menu_visible","nexum_tabs_menu_visible",
    "image_generator_menu_visible","file_tree_menu_visible",
    "ai_models_menu_visible","tasks_menu_visible","jobs_menu_visible",
    "chat_tabs_menu_visible","up_arrow_history_enabled",
    "chat_auto_scroll","show_session_id",
    "collapse_reasoning_by_default",
    "new_tab_project_enabled","group_tabs_by_project",
    "search_enabled","ai_search_model",
    "reasoning_enabled","ai_reasoning_model","ai_vision_model",
    "ai_responses_enabled",
    "codex_mini_enabled","mobile_sidebar_toolbar",
    "show_archive_chat_button"
  ];
  const map = await getSettings(keys);

  if(Array.isArray(map.visible_columns)){
    visibleCols = new Set(map.visible_columns);
  }
  if(Array.isArray(map.columns_order)){
    const arr = map.columns_order;
    const m = Object.fromEntries(columnsOrder.map(c=>[c.key,c]));
    const newOrd = [];
    arr.forEach(k=>{ if(m[k]){ newOrd.push(m[k]); delete m[k]; }});
    Object.values(m).forEach(c=>newOrd.push(c));
    columnsOrder = newOrd;
  }
  if(typeof map.tasks_visible !== "undefined"){
    tasksVisible = !!map.tasks_visible;
  }
  $("#tasks").style.display = tasksVisible ? "" : "none";
  $("#toggleTasksBtn").textContent = tasksVisible ? "Hide tasks" : "Show tasks";

  if(typeof map.markdown_panel_visible !== "undefined"){
    markdownPanelVisible = !!map.markdown_panel_visible;
  }
  const pnl = document.getElementById("taskListPanel");
  if(pnl) pnl.style.display = markdownPanelVisible ? "" : "none";

  if(typeof map.mosaic_panel_visible !== "undefined"){
    mosaicPanelVisible = !!map.mosaic_panel_visible;
  }
  updateMosaicPanelVisibility();

  if(typeof map.subroutine_panel_visible !== "undefined"){
    subroutinePanelVisible = !!map.subroutine_panel_visible;
  }
  const subPanel = document.getElementById("chatSubroutinesPanel");
  if(subPanel) subPanel.style.display = subroutinePanelVisible ? "" : "none";

  if(typeof map.sidebar_visible !== "undefined" && !isEmbedded){
    sidebarVisible = !!map.sidebar_visible;
  }
  if(isEmbedded){
    sidebarVisible = false;
  } else if(isMobileViewport()){
    sidebarVisible = false;
  }

  if(isEmbedded){
    ensureSidebarHiddenForEmbed();
  } else {
    const sidebarEl = $(".sidebar");
    if(sidebarEl){
      sidebarEl.classList.toggle("collapsed", !sidebarVisible);
    }
    const dividerEl = $("#divider");
    if(dividerEl){
      dividerEl.style.display = sidebarVisible ? "" : "none";
    }
    const toggleSidebarBtn = $("#toggleSidebarBtn");
    if(toggleSidebarBtn){
      toggleSidebarBtn.textContent = sidebarVisible ? "Hide sidebar" : "Show sidebar";
    }
    const expandSidebarBtn = document.getElementById("expandSidebarBtn");
    if(expandSidebarBtn){
      expandSidebarBtn.style.display = "none";
    }
    const collapsedLogoInit = document.getElementById("collapsedSidebarLogo");
    if(collapsedLogoInit){
      collapsedLogoInit.style.display = sidebarVisible ? "none" : "block";
    }
    const collapsedArrowInit = document.getElementById("expandSidebarArrow");
    if(collapsedArrowInit){
      collapsedArrowInit.style.display = sidebarVisible ? "none" : "block";
    }
  }

  if(isEmbedded){
    sidebarVisible = false;
    ensureSidebarHiddenForEmbed();
  }  updateChatPanelVisibility();
  const initTopBtns = document.getElementById("topRightButtons");
  if(initTopBtns){
    if(isMobileViewport() && !isEmbedded){
      initTopBtns.style.display = sidebarVisible ? "none" : "flex";
    } else {
      initTopBtns.style.display = "flex";
    }
  }
  const appEl = document.querySelector(".app");
  if(appEl && !isEmbedded){
    appEl.classList.toggle("sidebar-collapsed", !sidebarVisible);
  }

  if(typeof map.enter_submits_message !== "undefined"){
    enterSubmitsMessage = map.enter_submits_message !== false;
  }

  if(typeof map.sidebar_width !== "undefined"){
    const minW = 150;
    const maxW = Math.max(minW, window.innerWidth - 100);
    const width = Math.max(minW, Math.min(map.sidebar_width, maxW));
    $(".sidebar").style.width = width + "px";
  }

  if(typeof map.model_tabs_bar_visible !== "undefined"){
    modelTabsBarVisible = !!map.model_tabs_bar_visible;
  }
  const cont = document.getElementById("modelTabsContainer");
  const newBtn = document.getElementById("newModelTabBtn");
  const toggleBtn = document.getElementById("toggleModelTabsBtn");
  if(cont) cont.style.display = modelTabsBarVisible ? "" : "none";
  if(newBtn) newBtn.style.display = modelTabsBarVisible ? "" : "none";
  if(toggleBtn) toggleBtn.textContent = modelTabsBarVisible ? "Hide Models" : "Models";

  // Force the top chat tabs bar to remain hidden regardless of saved setting
  topChatTabsBarVisible = false;
  toggleTopChatTabsVisibility(topChatTabsBarVisible);

  if(typeof map.project_info_bar_visible !== "undefined"){
    projectInfoBarVisible = map.project_info_bar_visible !== false;
  }
  if(typeof map.aurora_project_bar_visible !== "undefined"){
    auroraProjectBarVisible = map.aurora_project_bar_visible !== false;
  }
  if(FORCE_HIDE_PROJECT_BAR){
    auroraProjectBarVisible = false;
  }
  toggleProjectInfoBarVisibility(projectInfoBarVisible && auroraProjectBarVisible);

  if(typeof map.nav_menu_visible !== "undefined"){
    navMenuVisible = map.nav_menu_visible !== false;
  }
  toggleNavMenuVisibility(navMenuVisible);

  if(typeof map.view_tabs_bar_visible !== "undefined"){
    viewTabsBarVisible = !!map.view_tabs_bar_visible;
  }
  toggleViewTabsBarVisibility(viewTabsBarVisible);

  if(typeof map.show_project_name_in_tabs !== "undefined"){
    showProjectNameInTabs = map.show_project_name_in_tabs !== false;
  }

  if(typeof map.show_archived_tabs !== "undefined"){
    showArchivedTabs = !!map.show_archived_tabs;
  }

  if(typeof map.group_tabs_by_project !== "undefined"){
    groupTabsByProject = map.group_tabs_by_project !== false;
  }

  if(typeof map.show_dependencies_column !== "undefined"){
    showDependenciesColumn = !!map.show_dependencies_column;
  }

  if(typeof map.image_gen_service !== "undefined" && map.image_gen_service){
    imageGenService = map.image_gen_service;
  }
  if(typeof map.image_gen_model !== "undefined" && map.image_gen_model){
    imageGenModel = map.image_gen_model;
  }

  if(typeof map.image_upload_enabled !== "undefined"){
    imageUploadEnabled = !!map.image_upload_enabled;
  }
  toggleImageUploadButton(imageUploadEnabled);

  if(typeof map.image_paint_tray_enabled !== "undefined"){
    imagePaintTrayEnabled = map.image_paint_tray_enabled !== false;
  }
  toggleImagePaintTrayButton(imagePaintTrayEnabled);

  if(typeof map.activity_iframe_menu_visible !== "undefined"){
    activityIframeMenuVisible = map.activity_iframe_menu_visible !== false;
  }
  toggleActivityIframeMenu(activityIframeMenuVisible);

  if(typeof map.nexum_chat_menu_visible !== "undefined"){
    nexumChatMenuVisible = map.nexum_chat_menu_visible !== false;
  }
  toggleNexumChatMenu(nexumChatMenuVisible);

  if(typeof map.nexum_tabs_menu_visible !== "undefined"){
    nexumTabsMenuVisible = map.nexum_tabs_menu_visible !== false;
  }
  toggleNexumTabsMenu(nexumTabsMenuVisible);

  if(typeof map.image_generator_menu_visible !== "undefined"){
    imageGeneratorMenuVisible = map.image_generator_menu_visible !== false;
  }
  toggleImageGeneratorMenu(imageGeneratorMenuVisible);

  if(typeof map.file_tree_menu_visible !== "undefined"){
    fileTreeMenuVisible = map.file_tree_menu_visible !== false;
  }
  toggleFileTreeMenu(fileTreeMenuVisible);

  if(typeof map.ai_models_menu_visible !== "undefined"){
    aiModelsMenuVisible = map.ai_models_menu_visible !== false;
  }
  toggleAiModelsMenu(aiModelsMenuVisible);

  if(typeof map.tasks_menu_visible !== "undefined"){
    tasksMenuVisible = map.tasks_menu_visible !== false;
  }
  toggleTasksMenu(tasksMenuVisible);

  if(typeof map.jobs_menu_visible !== "undefined"){
    jobsMenuVisible = map.jobs_menu_visible !== false;
  }
  toggleJobsMenu(jobsMenuVisible);

  if(typeof map.chat_tabs_menu_visible !== "undefined"){
    chatTabsMenuVisible = map.chat_tabs_menu_visible !== false;
  }
  toggleChatTabsMenu(chatTabsMenuVisible);

  if(typeof map.show_session_id !== "undefined"){
    showSessionId = map.show_session_id !== false;
  }
  toggleSessionIdVisibility(showSessionId);

  if(typeof map.up_arrow_history_enabled !== "undefined"){
    upArrowHistoryEnabled = map.up_arrow_history_enabled !== false;
  }

  if(typeof map.chat_auto_scroll !== "undefined"){
    chatAutoScroll = !!map.chat_auto_scroll;
  }
  if(typeof map.collapse_reasoning_by_default !== "undefined"){
    collapseReasoningByDefault = map.collapse_reasoning_by_default === true;
  }

  if(typeof map.new_tab_project_enabled !== "undefined"){
    newTabProjectNameEnabled = map.new_tab_project_enabled !== false;
  }
  toggleNewTabProjectField(newTabProjectNameEnabled);
  if(typeof map.search_enabled !== "undefined"){
    searchEnabled = map.search_enabled !== false;
  }
  if(typeof map.reasoning_enabled !== "undefined"){
    reasoningEnabled = map.reasoning_enabled !== false;
  }
  if(typeof map.ai_responses_enabled !== "undefined"){
    aiResponsesEnabled = map.ai_responses_enabled !== false;
  }
  if(typeof map.codex_mini_enabled !== "undefined"){
    codexMiniEnabled = map.codex_mini_enabled !== false;
  }
  if(typeof map.mobile_sidebar_toolbar !== "undefined"){
    mobileSidebarToolbar = map.mobile_sidebar_toolbar !== false;
  }
  if(typeof map.show_archive_chat_button !== "undefined"){
    showArchiveChatButton = map.show_archive_chat_button !== false;
  }
  updateSearchButton();
  updateReasoningButton();
  updateCodexButton();
  updateAiResponsesButton();
  updateMobileThinSidebar();
}
async function saveSettings(){
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ key:"visible_columns", value:[...visibleCols] })
  });
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ key:"columns_order", value:columnsOrder.map(c=>c.key) })
  });
}

function renderHeader(){
  const tr = $("#headerRow");
  tr.innerHTML = "";
  columnsOrder.forEach(col => {
    if(!showDependenciesColumn && col.key === "dependencies") return;
    if(!visibleCols.has(col.key)) return;
    const th = document.createElement("th");
    th.textContent = col.label;
    tr.appendChild(th);
  });
}

function handleDragStart(e){
  dragSrcRow = e.target.closest("tr");
  e.dataTransfer.effectAllowed = "move";
}
function handleDragOver(e){
  if(dragSrcRow && e.currentTarget !== dragSrcRow){
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    e.currentTarget.classList.add("drag-over");
  }
}
function handleDragLeave(e){
  e.currentTarget.classList.remove("drag-over");
}
function handleDrop(e){
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove("drag-over");
  if(dragSrcRow && dragSrcRow !== target){
    const tbody = target.parentNode;
    const rows = [...tbody.children];
    let from = rows.indexOf(dragSrcRow);
    let to = rows.indexOf(target);
    tbody.removeChild(dragSrcRow);
    if(from < to) to--;
    tbody.insertBefore(dragSrcRow, tbody.children[to]);
    saveNewOrderToServer();
  }
  dragSrcRow = null;
}
function handleDragEnd(){
  $$(`tr.drag-over`).forEach(r=>r.classList.remove("drag-over"));
  dragSrcRow = null;
}

function tabDragStart(e){
  draggingTabRow = e.target.closest('.sidebar-tab-row');
  e.dataTransfer.effectAllowed = 'move';
  const parent = draggingTabRow?.parentNode;
  if(parent && !topDropBar){
    topDropBar = document.createElement('div');
    topDropBar.className = 'top-drop-bar';
    parent.insertBefore(topDropBar, parent.firstChild);
    topDropBar?.addEventListener('dragover', ev => {
      ev.preventDefault();
      topDropBar.classList.add('drag-over');
    });
    const clearBar = () => topDropBar.classList.remove('drag-over');
    topDropBar?.addEventListener('dragleave', clearBar);
    topDropBar?.addEventListener('drop', async ev => {
      ev.preventDefault();
      clearBar();
      if(draggingTabRow){
        parent.insertBefore(draggingTabRow, topDropBar.nextSibling);
        updateChatTabOrder(draggingTabRow.dataset.project, parent);
        const draggedTabId = parseInt(draggingTabRow.dataset.tabId, 10);
        if(draggedTabId && draggingTabRow.dataset.parentId !== '0'){
          await setTabParent(draggedTabId, 0);
          draggingTabRow.dataset.parentId = '0';
          draggingTabRow.classList.remove('subtask-indented');
        }
      }
      tabDragEnd();
    });
  }
}

function tabDragOver(e){
  if(draggingTabRow && e.currentTarget !== draggingTabRow &&
     e.currentTarget.dataset.project === draggingTabRow.dataset.project){
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }
}

function tabDragLeave(e){
  e.currentTarget.classList.remove('drag-over','sub-drop-bar');
}

async function tabDrop(e){
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove('drag-over','sub-drop-bar');
  if(draggingTabRow && target !== draggingTabRow &&
     target.dataset.project === draggingTabRow.dataset.project){
    const parent = target.parentNode;
    const dropBefore = e.offsetY < target.offsetHeight / 2;
    parent.removeChild(draggingTabRow);
    const insertBeforeNode = dropBefore ? target : target.nextElementSibling;
    parent.insertBefore(draggingTabRow, insertBeforeNode);
    updateChatTabOrder(target.dataset.project, parent);
    const draggedTabId = parseInt(draggingTabRow.dataset.tabId, 10);
    if(draggedTabId && draggingTabRow.dataset.parentId !== '0'){
      await setTabParent(draggedTabId, 0);
      draggingTabRow.dataset.parentId = '0';
      draggingTabRow.classList.remove('subtask-indented');
    }
  }
  if(topDropBar){
    topDropBar.remove();
    topDropBar = null;
  }
  draggingTabRow = null;
}

function tabDragEnd(){
  $$('div.sidebar-tab-row.drag-over').forEach(el=>el.classList.remove('drag-over'));
  $$('div.sidebar-tab-row.sub-drop-bar').forEach(el=>el.classList.remove('sub-drop-bar'));
  draggingTabRow = null;
  if(topDropBar){
    topDropBar.remove();
    topDropBar = null;
  }
}
async function saveNewOrderToServer(){
  const ids = $$("#tasks tbody tr").map(r=>+r.dataset.taskId);
  await fetch("/api/tasks/reorderAll",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ orderedIds: ids })
  });
}

async function fetchTasks(){
  const inc = $("#showHidden").checked;
  const res = await fetch(`/api/tasks?includeHidden=${inc?1:0}`);
  return res.json();
}

function renderBody(){
  const tbody = $("#tasks tbody");
  tbody.innerHTML = "";
  const pj = $("#projectFilter").value;
  const sp = $("#sprintFilter").value;
  allTasks
      .filter(t=>{
        if(pj && t.project!==pj) return false;
        if(sp && t.sprint!==sp) return false;
        if(hideDoneTasks && t.status === 'Done') return false;
        return true;
      })
      .forEach(t=>{
        const tr = document.createElement("tr");
        tr.dataset.taskId = t.id;
        if(t.hidden) tr.classList.add("hidden");
        columnsOrder.map(c=>c.key).forEach(key=>{
          if(!showDependenciesColumn && key === "dependencies") return;
          if(!visibleCols.has(key)) return;
          const td = document.createElement("td");
          switch(key){
            case "drag":
              td.innerHTML = `<span class="drag-handle" draggable="true">⠿</span>`;
              td.querySelector(".drag-handle").addEventListener("dragstart", handleDragStart);
              break;
            case "priority":
              td.textContent = t.priority;
              td.className="priority-cell";
              break;
            case "status":
              td.textContent = t.status;
              td.className="status-cell";
              break;
            case "number":
              td.innerHTML = `<a href="${t.html_url}" target="_blank">#${t.number}</a>`;
              break;
            case "codex_url":
              if(t.codex_url){
                td.innerHTML = `<a href="${t.codex_url}" target="_blank">link</a>`;
              }
              td.className="codex-url-cell";
              break;
            case "title":
              td.textContent = t.title;
              td.className="title-cell";
              break;
            case "chat_sha":
              if(t.chat_sha){
                td.innerHTML = `<a href="/chat/${t.chat_sha}" target="_blank">${t.chat_sha}</a>`;
              }
              break;
            case "dependencies":
              td.textContent = t.dependencies;
              td.className="dependencies-cell";
              break;
            case "project":
              td.textContent = t.project;
              td.className="project-cell";
              break;
            case "created":
              td.textContent = isoDate(t.created_at);
              break;
            case "hide":
              td.innerHTML = `<button class="eye" data-id="${t.id}">${t.hidden ? "🙈" : "👁️"}</button>`;
              break;
            default:
              td.textContent = t[key]||"";
          }
          tr.appendChild(td);
        });
        ["dragover","dragleave","drop","dragend"].forEach(evt=>{
          tr?.addEventListener(evt, {
            "dragover":handleDragOver,
            "dragleave":handleDragLeave,
            "drop":handleDrop,
            "dragend":handleDragEnd
          }[evt]);
        });
        tbody.appendChild(tr);
      });
}

async function loadTasks(){
  allTasks = await fetchTasks();
  renderHeader();
  renderBody();
  showTasksUi();
}

function showTasksUi(){
  const container = document.getElementById('sidebarViewTasks');
  if(container){
    container.querySelectorAll('[hidden]').forEach(el => {
      el.hidden = false;
    });
  }
  const loader = document.getElementById('tasksLoading');
  if(loader) loader.style.display = 'none';
}

async function populateFilters(){
  const pj = await (await fetch("/api/projects?showArchived=0")).json();
  $("#projectFilter").innerHTML = '<option value="">All projects</option>' +
      pj.map(p=>`<option value="${p.project}">${p.project}</option>`).join("");
  const sp = await (await fetch("/api/sprints")).json();
  $("#sprintFilter").innerHTML = '<option value="">All sprints</option>' +
      sp.map(s=>`<option value="${s.sprint}">${s.sprint}</option>`).join("");
}

function openColModal(){
  const cnt = $("#colList");
  cnt.innerHTML="";
  columnsOrder.forEach((c,i)=>{
    if(!showDependenciesColumn && c.key === "dependencies") return;
    const div = document.createElement("div");
    div.className="col-item";
    div.innerHTML = `<button class="col-move" data-idx="${i}" data-dir="up">⬆️</button>` +
        `<button class="col-move" data-idx="${i}" data-dir="down">⬇️</button>` +
        `<label><input type="checkbox" value="${c.key}" ${visibleCols.has(c.key)?"checked":""}/> ${c.label||c.key}</label>`;
    cnt.appendChild(div);
  });
  showModal($("#colModal"));
}
$("#colBtn").addEventListener("click", openColModal);
$("#colList").addEventListener("click", e=>{
  if(!e.target.classList.contains("col-move")) return;
  const i = +e.target.dataset.idx, d=e.target.dataset.dir;
  const ni = d==="up"?i-1:i+1;
  if(ni<0||ni>=columnsOrder.length) return;
  [columnsOrder[i],columnsOrder[ni]]=[columnsOrder[ni],columnsOrder[i]];
  openColModal();
});
$("#colSaveBtn").addEventListener("click", async ()=>{
  visibleCols.clear();
  $$("#colList input[type=checkbox]").forEach(cb=>{
    if(cb.checked) visibleCols.add(cb.value);
  });
  await saveSettings();
  hideModal($("#colModal"));
  await loadTasks();
});
$("#colCancelBtn").addEventListener("click",()=>hideModal($("#colModal")));

$("#tasks").addEventListener("click", async e=>{
  const btn = e.target.closest("button");
  if(btn){
    if(btn.classList.contains("eye")){
      const id=+btn.dataset.id;
      const hideNow=btn.textContent==="👁️";
      await fetch("/api/tasks/hidden",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id,hidden:hideNow})
      });
      return loadTasks();
    }
    if(btn.classList.contains("arrow")){
      const id=+btn.dataset.id, dir=btn.dataset.dir;
      await fetch("/api/tasks/reorder",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id,direction:dir})
      });
      return loadTasks();
    }
  }
  const cell = e.target;
  const row = cell.closest("tr");
  if(!row) return;
  const taskId=+row.dataset.taskId;

  function inlineEdit(newEl, saveCb){
    cell.textContent="";
    cell.appendChild(newEl);
    newEl.focus();
    newEl?.addEventListener("change", async ()=>{
      await saveCb(newEl.value);
      await loadTasks();
    });
    newEl?.addEventListener("blur", ()=>loadTasks());
  }

  if(cell.classList.contains("priority-cell")){
    const sel = document.createElement("select");
    ["Low","Medium","High"].forEach(v=>{
      const o=document.createElement("option");
      o.value=v; o.textContent=v;
      if(v===cell.textContent) o.selected=true;
      sel.appendChild(o);
    });
    return inlineEdit(sel,v=>fetch("/api/tasks/priority",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,priority:v})
    }));
  }
  if(cell.classList.contains("status-cell")){
    const sel=document.createElement("select");
    ["Not Started","In Progress","Done"].forEach(v=>{
      const o=document.createElement("option");
      o.value=v; o.textContent=v;
      if(v===cell.textContent) o.selected=true;
      sel.appendChild(o);
    });
    return inlineEdit(sel,v=>fetch("/api/tasks/status",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,status:v})
    }));
  }
  if(cell.classList.contains("project-cell")){
    const inp=document.createElement("input");
    inp.type="text";
    inp.value=cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/project",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,project:v})
    }));
  }
  if(cell.classList.contains("dependencies-cell")){
    const inp=document.createElement("input");
    inp.type="text";
    inp.value=cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/dependencies",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,dependencies:v})
    }));
  }
  if(cell.classList.contains("codex-url-cell")){
    const inp=document.createElement("input");
    inp.type="text";
    inp.value=cell.querySelector("a")?.href || "";
    return inlineEdit(inp,v=>fetch("/api/tasks/codex-url",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,url:v})
    }));
  }
  if(cell.classList.contains("title-cell")){
    const inp=document.createElement("input");
    inp.type="text";
    inp.value=cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/rename",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,newTitle:v})
    }));
  }
});

$("#showHidden").addEventListener("change", loadTasks);
$("#hideDoneTasksCheck").addEventListener("change", () => {
  hideDoneTasks = $("#hideDoneTasksCheck").checked;
  saveHideDoneTasks();
  renderBody();
});
$("#projectFilter").addEventListener("change", renderBody);
$("#sprintFilter").addEventListener("change", renderBody);

$("#instrBtn").addEventListener("click", async ()=>{
  {
    const r=await fetch("/api/settings/agent_instructions");
    if(r.ok){
      const {value}=await r.json();
      $("#instrText").value=value||"";
    }
  }
  {
    const r2=await fetch("/api/settings/agent_name");
    if(r2.ok){
      const {value}=await r2.json();
      $("#agentNameInput").value=value||"";
    }
  }
  showModal($("#instrModal"));
});
$("#instrSaveBtn").addEventListener("click", async ()=>{
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"agent_instructions",value:$("#instrText").value})
  });
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"agent_name",value:$("#agentNameInput").value})
  });
  hideModal($("#instrModal"));
});
$("#instrCancelBtn").addEventListener("click",()=>hideModal($("#instrModal")));

$("#repoBtn").addEventListener("click", async ()=>{
  // Now we store/read from "taskList_git_ssh_url" instead of "github_repo"
  const r=await fetch("/api/settings/taskList_git_ssh_url");
  if(r.ok){
    const {value}=await r.json();
    $("#repoInput").value=value||"";
  }
  showModal($("#repoModal"));
});
$("#repoSaveBtn").addEventListener("click", async ()=>{
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"taskList_git_ssh_url",value:$("#repoInput").value})
  });
  hideModal($("#repoModal"));
});
$("#repoCancelBtn").addEventListener("click",()=>hideModal($("#repoModal")));

$("#defaultsBtn").addEventListener("click", async ()=>{
  let r=await fetch("/api/settings/default_project");
  if(r.ok){
    const{value}=await r.json();
    $("#defProjectInput").value=value||"";
  }
  r=await fetch("/api/settings/default_sprint");
  if(r.ok){
    const{value}=await r.json();
    $("#defSprintInput").value=value||"";
  }
  showModal($("#defaultsModal"));
});
$("#defSaveBtn").addEventListener("click", async ()=>{
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"default_project",value:$("#defProjectInput").value})
  });
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"default_sprint",value:$("#defSprintInput").value})
  });
  hideModal($("#defaultsModal"));
});
$("#defCancelBtn").addEventListener("click",()=>hideModal($("#defaultsModal")));

$("#addTaskBtn").addEventListener("click",()=>{
  $("#newTaskTitle").value="";
  $("#newTaskBody").value="";
  showModal($("#newTaskModal"));
});
$("#createTaskBtn").addEventListener("click", async ()=>{
  const title=$("#newTaskTitle").value.trim(),
      body=$("#newTaskBody").value.trim();
  if(!title){
    alert("Please enter a title for the new task.");
    return;
  }
  const res=await fetch("/api/tasks/new",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({title,body})
  });
  if(!res.ok){
    alert("Error creating task. Check console/logs.");
    return;
  }
  hideModal($("#newTaskModal"));
  await loadTasks();
});
$("#cancelTaskBtn").addEventListener("click",()=>hideModal($("#newTaskModal")));

async function ensureDesignTabForSession(){
  if(designTabInfo){
    return designTabInfo;
  }
  if(designTabFetchPromise){
    return designTabFetchPromise;
  }
  const url = `/api/chat/design_tab?sessionId=${encodeURIComponent(sessionId)}`;
  designTabFetchPromise = (async () => {
    try {
      const res = await fetch(url);
      if(!res.ok){
        console.error(`[DesignTab] Failed to ensure design chat: ${res.status}`);
        return null;
      }
      const data = await res.json();
      const info = {
        id: data.id,
        uuid: data.uuid,
        pathAlias: data.pathAlias || DESIGN_CHAT_ALIAS
      };
      designTabInfo = info;
      return info;
    } catch (err) {
      console.error('[DesignTab] Error ensuring design chat', err);
      return null;
    } finally {
      designTabFetchPromise = null;
    }
  })();
  return designTabFetchPromise;
}

async function focusDesignChat(){
  const info = await ensureDesignTabForSession();
  if(!info) return;
  let tab = chatTabs.find(t => t.id === info.id || t.tab_uuid === info.uuid);
  if(!tab){
    await loadTabs();
    tab = chatTabs.find(t => t.id === info.id || t.tab_uuid === info.uuid);
  }
  if(!tab) return;
  if(currentTabId !== tab.id){
    await selectTab(tab.id);
  } else {
    const path = resolveTabPath(tab);
    if(path && window.location.pathname !== path){
      window.history.replaceState({}, '', path);
    }
  }
}

async function loadTabs(){
  const res = await fetch(`/api/chat/tabs?nexum=0&showArchived=1&sessionId=${encodeURIComponent(sessionId)}`);
  chatTabs = (await res.json()).map(tab => ({
    ...tab,
    favorite: !!tab.favorite
  }));
  archivedTabs = chatTabs.filter(t => t.archived);
  const parentIds = new Set(chatTabs.map(t => t.id));
  const hasChild = new Set(chatTabs.filter(t => t.parent_id).map(t => t.parent_id));
  for(const id in collapsedChildTabs){
    if(!parentIds.has(+id) || !hasChild.has(+id)){
      delete collapsedChildTabs[id];
    }
  }
  saveCollapsedChildTabs();
  const aliasTab = chatTabs.find(t => (t.path_alias || '') === DESIGN_CHAT_ALIAS);
  if(aliasTab){
    designTabInfo = {
      id: aliasTab.id,
      uuid: aliasTab.tab_uuid,
      pathAlias: aliasTab.path_alias || DESIGN_CHAT_ALIAS
    };
  } else {
    designTabInfo = null;
  }
}

async function loadSubroutines(){
  const res = await fetch("/api/chat/subroutines");
  if(res.ok){
    chatSubroutines = await res.json();
  } else {
    chatSubroutines = [];
  }
}

function openSubroutineModal(sub=null){
  editingSubroutineId = sub ? sub.id : null;
  document.getElementById("subroutineModalTitle").textContent = sub ? "Edit Subroutine" : "New Subroutine";
  $("#subroutineNameInput").value = sub ? sub.name : "";
  $("#subroutineTriggerInput").value = sub ? sub.trigger_text || "" : "";
  $("#subroutineActionInput").value = sub ? sub.action_text || "" : "";
  const sel = document.getElementById("subroutineHookSelect");
  sel.innerHTML = '<option value="">(none)</option>';
  actionHooks.forEach(h => {
    const opt = document.createElement("option");
    opt.value = h.name;
    opt.textContent = h.name;
    sel.appendChild(opt);
  });
  sel.value = sub ? (sub.action_hook || "") : "";
  showModal(document.getElementById("subroutineModal"));
}

async function saveSubroutine(){
  const name = $("#subroutineNameInput").value.trim();
  if(!name) return;
  const trigger = $("#subroutineTriggerInput").value.trim();
  const action = $("#subroutineActionInput").value.trim();
  const hook = $("#subroutineHookSelect").value;

  const payload = { name, trigger, action, hook };
  let url = "/api/chat/subroutines/new";
  if(editingSubroutineId){
    payload.id = editingSubroutineId;
    url = "/api/chat/subroutines/update";
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  if(r.ok){
    hideModal(document.getElementById("subroutineModal"));
    editingSubroutineId = null;
    await loadSubroutines();
    renderSubroutines();
  }
}

function editSubroutine(sub){
  openSubroutineModal(sub);
}

function renderSubroutines(){
  const container = document.getElementById("subroutineCards");
  if(!container) return;
  container.innerHTML = "";
  chatSubroutines.forEach(sub => {
    const div = document.createElement("div");
    div.className = "subroutine-card";
    div.dataset.id = sub.id;
    div.style.flexDirection = "column";
    div.style.textAlign = "center";
    div.innerHTML = `<strong>${sub.name}</strong><br/><small>${sub.trigger_text||''}</small><br/><small>${sub.action_text||''}</small><br/><small>${sub.action_hook||''}</small>`;
    div.style.border = "1px solid #444";
    div.style.padding = "8px";
    div.style.width = "150px";
    div.style.height = "80px";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div?.addEventListener("dblclick", () => editSubroutine(sub));

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.className = "edit-btn";
    editBtn?.addEventListener("click", e => {
      e.stopPropagation();
      editSubroutine(sub);
    });
    div.appendChild(editBtn);

    container.appendChild(div);
  });
}

async function addNewSubroutine(){
  openSubroutineModal();
}
function openNewTabModal(){
  newTabSelectedType = 'chat';
  showModal($("#newTabModal"));
}
async function createChatTabWithoutModal(){
  newTabSelectedType = 'chat';
  await addNewTab();
}

async function archiveCurrentChat(){
  const btn = document.getElementById("archiveChatBtn");
  const current = chatTabs.find(t => t.id === currentTabId);
  if(!current || current.archived){
    updateArchiveChatButton();
    return;
  }
  if(btn) btn.disabled = true;
  let archived = false;
  try {
    suppressArchiveRedirect = true;
    archived = await toggleArchiveTab(current.id, true);
    suppressArchiveRedirect = false;
    if(!archived){
      if(typeof showToast === "function"){
        showToast("Failed to archive chat");
      }
      return;
    }
  } catch (err) {
    console.error("Error while archiving current chat", err);
    if(typeof showToast === "function"){
      showToast(archived ? "Chat archived, but a new chat could not be created" : "Failed to archive chat");
    }
  } finally {
    suppressArchiveRedirect = false;
    if(btn) btn.disabled = false;
    updateArchiveChatButton();
  }
}

async function addNewTab(){
  const tabType = newTabSelectedType;
  const reloadNeeded = chatTabs.length === 0; // check if no tabs existed prior
  const r = await fetch("/api/chat/tabs/new", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ name:"", nexum: 0, project:"", type: tabType, sessionId })
  });
  if(r.ok){
    const data = await r.json();
    hideModal($("#newTabModal"));
    await loadTabs();
    await selectTab(data.id);
    if(tabType === 'search'){
      await enableSearchMode('');
    }
    // TODO: THIS WAS A TEMP FIX,
    // Reload the entire page so the new tab state is fully reflected
    // but only if this was the very first tab being created from the modal
    if(reloadNeeded){
      window.location.reload();
    }
  }
}

async function autoCreateInitialChatTab(){
  try {
    const response = await fetch("/api/chat/tabs/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", nexum: 0, project: "", type: "chat", sessionId })
    });
    if(!response.ok){
      console.error("Failed to auto-create initial chat tab", response.status);
      return false;
    }
    const data = await response.json();
    await loadTabs();
    await selectTab(data.id);
    const tab = chatTabs.find(t => t.id === data.id);
    if(tab){
      const newPath = resolveTabPath(tab);
      if(newPath && window.location.pathname !== newPath){
        window.location.replace(newPath);
      }
    }
    return true;
  } catch (err) {
    console.error("Error auto-creating initial chat tab", err);
    return false;
  }
}
async function renameTab(tabId, newName){
  if(!newName){
    const t = chatTabs.find(t => t.id===tabId);
    newName = prompt("Enter new tab name:", t ? t.name : "Untitled");
    if(!newName) return;
  }
  const r = await fetch("/api/chat/tabs/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tabId, newName, sessionId })
  });
  if(r.ok){
    await loadTabs();
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    updatePageTitle();
    const ct = chatTabs.find(t => t.id === currentTabId);
    const path = resolveTabPath(ct);
    if(path && window.location.pathname !== path && window.location.pathname !== '/new'){
      window.history.replaceState({}, '', path);
    }
  }
}

async function openEditTabNameModal(tabId){
  const tab = chatTabs.find(tt => tt.id === tabId);
  const input = $("#editTabNameInput");
  const modal = $("#editTabNameModal");
  if(!input || !modal){
    renameTab(tabId);
    return;
  }
  input.value = tab ? tab.name || "" : "";
  modal.dataset.tabId = tabId;
  showModal(modal);
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

async function openRenameTabModal(tabId){
  const t = chatTabs.find(tt => tt.id === tabId);
  const input = $("#renameTabInput");
  if(!input){
    renameTab(tabId);
    return;
  }
  input.value = t ? t.name : "";
  const saved = await getSetting(mosaicKey(tabId));
  if(typeof saved !== "undefined"){
    mosaicPanelVisible = !!saved;
  }
  $("#renameShowMosaicCheck").checked = mosaicPanelVisible;
  updateMosaicPanelVisibility();
  const typeSel = $("#renameTabTypeSelect");
  if(typeSel) typeSel.value = t ? t.tab_type || 'chat' : 'chat';
  const projSel = $("#renameProjectSelect");
  if(projSel){
    const existing = chatTabs.map(c => c.project_name).filter(p => p);
    const allProjects = Array.from(new Set([...existing, ...projectGroups.filter(p => p)]));
    projSel.innerHTML = '<option value="">(none)</option>' +
      allProjects.map(p => `<option value="${p}">${p}</option>`).join('');
    projSel.value = t && t.project_name ? t.project_name : '';
  }
  const taskSel = $("#renameTaskSelect");
  if(taskSel){
    try{
      const res = await fetch('/api/tasks?includeHidden=1');
      if(res.ok){
        const list = await res.json();
        taskSel.innerHTML = '<option value="0">(none)</option>' +
          list.map(ts => `<option value="${ts.id}">${ts.title}</option>`).join('');
      }
    }catch(e){ console.error(e); }
    taskSel.value = t && t.task_id ? String(t.task_id) : '0';
  }
  const extraInp = $("#renameExtraProjectsInput");
  if(extraInp){
    extraInp.value = t && t.extra_projects ? t.extra_projects : '';
  }
  const sendCtx = $("#renameSendProjectContextCheck");
  if(sendCtx){
    sendCtx.checked = t ? t.send_project_context !== 0 : false;
  }
  const chatgptInp = $("#renameChatgptUrlInput");
  if(chatgptInp){
    chatgptInp.value = t && t.chatgpt_url ? t.chatgpt_url : '';
  }
  const timestamps = $("#renameTabTimestamps");
  if(timestamps){
    if(t){
      const createdText = t.created_at ? isoDateTime(t.created_at) : "Unknown";
      let text = `Created ${createdText}`;
      if(t.archived_at){
        text += ` \u2022 Archived ${isoDateTime(t.archived_at)}`;
      }
      timestamps.textContent = text;
      timestamps.style.display = "block";
    } else {
      timestamps.textContent = "";
      timestamps.style.display = "none";
    }
  }
  const archiveBtn = $("#renameTabArchiveBtn");
  if(archiveBtn){
    const isArchived = !!(t && t.archived);
    archiveBtn.textContent = isArchived ? "Unarchive" : "Archive";
    archiveBtn.dataset.archived = isArchived ? "1" : "0";
  }
  const modal = $("#renameTabModal");
  if(!modal){
    renameTab(tabId);
    return;
  }
  modal.dataset.tabId = tabId;
  showModal(modal);
  // Slight delay so element is visible before focusing
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

function resolveRenameModalTabId(modal){
  const rawId = modal?.dataset?.tabId || "";
  const parsedId = parseInt(rawId, 10);
  if(!Number.isNaN(parsedId)) return parsedId;
  if(typeof currentTabId === "number" && !Number.isNaN(currentTabId)){
    modal.dataset.tabId = currentTabId;
    return currentTabId;
  }
  return NaN;
}

async function openProjectSettingsModal(project){
  const input = $("#projectSettingsNameInput");
  const modal = $("#projectSettingsModal");
  if(!input || !modal) return;
  input.value = project || "";
  modal.dataset.project = project || "";
  const tabs = chatTabs.filter(t => (t.project_name || "") === (project || ""));
  let isArchived = tabs.length > 0 && tabs.every(t => t.archived);
  if(tabs.length === 0){
    try {
      const res = await fetch('/api/projects?showArchived=1');
      if(res.ok){
        const list = await res.json();
        const info = list.find(p => p.project === project);
        if(info) isArchived = !!info.archived;
      }
    }catch(e){ console.error(e); }
  }
  const archBtn = $("#projectSettingsArchiveBtn");
  if(archBtn){
    archBtn.textContent = isArchived ? "Unarchive" : "Archive";
    archBtn.dataset.archived = isArchived ? "1" : "0";
  }
  showModal(modal);
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

async function quickAddTabToProject(project, type = "chat"){
  const reloadNeeded = chatTabs.length === 0;
  const r = await fetch("/api/chat/tabs/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", nexum: 0, project, type, sessionId })
  });
  if(r.ok){
    const data = await r.json();
    await loadTabs();
    // Prepend the new tab ID to the project's order so it appears at the top
    chatTabOrder[project] = chatTabOrder[project] || [];
    chatTabOrder[project] = chatTabOrder[project].filter(id => id !== data.id);
    chatTabOrder[project].unshift(data.id);
    saveChatTabOrder();
    await selectTab(data.id);
    if(type === "search"){
      await enableSearchMode("");
    }
    if(reloadNeeded){
      window.location.reload();
    }
  }
}

function initProjectAddTooltip(){
  if(!projectAddTooltipEnabled) return;
  if(projectAddTooltip) return;
  projectAddTooltip = document.createElement('div');
  projectAddTooltip.className = 'project-toolbar-tooltip';
  const btn = document.createElement('button');
  btn.innerHTML = '&#128269;';
  btn.className = 'project-search-btn config-btn';
  btn?.addEventListener('click', e => {
    e.stopPropagation();
    if(projectAddTooltipProject!==null){
      quickAddTabToProject(projectAddTooltipProject, 'search');
      hideProjectAddTooltip();
    }
  });
  projectAddTooltip.appendChild(btn);
  projectAddTooltip?.addEventListener('mouseenter', () => clearTimeout(projectAddTooltipTimer));
  projectAddTooltip?.addEventListener('mouseleave', scheduleHideProjectAddTooltip);
  document.body.appendChild(projectAddTooltip);
}

function showProjectAddTooltip(project, e){
  if(!projectAddTooltipEnabled) return;
  initProjectAddTooltip();
  projectAddTooltipProject = project;
  projectAddTooltip.style.display = 'flex';
  const rect = e.target.getBoundingClientRect();
  projectAddTooltip.style.left = (rect.right + 8) + 'px';
  projectAddTooltip.style.top = rect.top + 'px';
  clearTimeout(projectAddTooltipTimer);
}

function hideProjectAddTooltip(){
  if(projectAddTooltip) projectAddTooltip.style.display = 'none';
  projectAddTooltipProject = null;
}

function scheduleHideProjectAddTooltip(){
  clearTimeout(projectAddTooltipTimer);
  projectAddTooltipTimer = setTimeout(hideProjectAddTooltip, 200);
}

$("#editTabNameSaveBtn")?.addEventListener("click", async () => {
  const modal = $("#editTabNameModal");
  if(!modal) return;
  const tabId = parseInt(modal.dataset.tabId, 10);
  if(Number.isNaN(tabId)) return;
  const input = $("#editTabNameInput");
  if(!input) return;
  const name = input.value.trim();
  if(!name){
    showToast('Please enter a tab name.');
    input.focus();
    return;
  }
  await renameTab(tabId, name);
  hideModal(modal);
});
$("#editTabNameInput")?.addEventListener("keydown", evt => {
  if(evt.key === "Enter") $("#editTabNameSaveBtn")?.click();
  else if(evt.key === "Escape") hideModal($("#editTabNameModal"));
});

$("#renameTabSaveBtn").addEventListener("click", async () => {
  const modal = $("#renameTabModal");
  const tabId = resolveRenameModalTabId(modal);
  if(Number.isNaN(tabId)){
    showToast('Unable to locate the tab to rename.');
    return;
  }
  const name = $("#renameTabInput").value.trim();
  const type = $("#renameTabTypeSelect")?.value || 'chat';
  mosaicPanelVisible = $("#renameShowMosaicCheck").checked;
  updateMosaicPanelVisibility();
  await setSetting("mosaic_panel_visible", mosaicPanelVisible);
  await setSetting(mosaicKey(tabId), mosaicPanelVisible);
  if(name) await renameTab(tabId, name);
  const tab = chatTabs.find(t => t.id === tabId) || {};
  const projSel = $("#renameProjectSelect");
  let project = projSel ? projSel.value : '';
  project = project.trim();
  const taskSel = $("#renameTaskSelect");
  let taskId = taskSel ? parseInt(taskSel.value,10) || 0 : 0;
  const extraInp = $("#renameExtraProjectsInput");
  let extraProjects = extraInp ? extraInp.value.trim() : '';
  const sendCtx = $("#renameSendProjectContextCheck");
  const sendProjectContext = sendCtx ? sendCtx.checked : false;
  const chatgptInp = $("#renameChatgptUrlInput");
  const chatgptUrl = chatgptInp ? chatgptInp.value.trim() : '';
  const repo = tab.repo_ssh_url || '';
  await fetch('/api/chat/tabs/config', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({tabId, project, repo, extraProjects, taskId, type, sendProjectContext, chatgptUrl, sessionId})
  });
  await loadTabs();
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  hideModal(modal);
});
$("#renameTabArchiveBtn")?.addEventListener("click", async () => {
  const modal = $("#renameTabModal");
  const tabId = resolveRenameModalTabId(modal);
  if(Number.isNaN(tabId)) return;
  const btn = $("#renameTabArchiveBtn");
  if(!btn) return;
  const archived = btn.dataset.archived === "1";
  btn.disabled = true;
  try {
    await toggleArchiveTab(tabId, !archived);
  } finally {
    btn.disabled = false;
  }
  hideModal(modal);
});
$("#renameTabCreateTaskBtn").addEventListener("click", async () => {
  const modal = $("#renameTabModal");
  const tabId = resolveRenameModalTabId(modal);
  if(Number.isNaN(tabId)){
    showToast('Unable to locate the tab to rename.');
    return;
  }
  const name = $("#renameTabInput").value.trim();
  const type = $("#renameTabTypeSelect")?.value || 'chat';
  mosaicPanelVisible = $("#renameShowMosaicCheck").checked;
  updateMosaicPanelVisibility();
  await setSetting("mosaic_panel_visible", mosaicPanelVisible);
  await setSetting(mosaicKey(tabId), mosaicPanelVisible);
  if(name) await renameTab(tabId, name);
  const tab = chatTabs.find(t => t.id === tabId) || {};
  const projSel = $("#renameProjectSelect");
  let project = projSel ? projSel.value : '';
  project = project.trim();
  let taskId = 0;
  try {
    const res = await fetch('/api/tasks/new', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({title: name || tab.name || '', project})
    });
    if(res.ok){
      const data = await res.json();
      taskId = data.id || 0;
    }
  } catch(e) { console.error(e); }
  const extraInp = $("#renameExtraProjectsInput");
  let extraProjects = extraInp ? extraInp.value.trim() : '';
  const sendCtx = $("#renameSendProjectContextCheck");
  const sendProjectContext = sendCtx ? sendCtx.checked : false;
  const chatgptInp = $("#renameChatgptUrlInput");
  const chatgptUrl = chatgptInp ? chatgptInp.value.trim() : '';
  const repo = tab.repo_ssh_url || '';
  await fetch('/api/chat/tabs/config', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({tabId, project, repo, extraProjects, taskId, type, sendProjectContext, chatgptUrl, sessionId})
  });
  await loadTabs();
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  if(typeof loadTasks === 'function') await loadTasks();
  hideModal(modal);
});
$("#renameTabInput").addEventListener("keydown", evt => {
  if(evt.key === "Enter") $("#renameTabSaveBtn").click();
  else if(evt.key === "Escape") hideModal($("#renameTabModal"));
});
async function duplicateTab(tabId){
  const t = chatTabs.find(t => t.id===tabId);
  const newName = prompt("Enter name for forked tab:", t ? `${t.name} Copy` : "");
  if(newName===null) return;
  const r = await fetch("/api/chat/tabs/duplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tabId, name: newName, sessionId })
  });
  if(r.ok){
    const data = await r.json();
    await loadTabs();
    currentTabId = data.id;
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    await loadChatHistory(currentTabId, true);
    const ct = chatTabs.find(t => t.id === currentTabId);
    const path = resolveTabPath(ct);
    if(path && window.location.pathname !== path && window.location.pathname !== '/new'){
      window.history.replaceState({}, '', path);
    }
    updatePageTitle();
  }
}
async function deleteTab(tabId){
  if(!confirm("Are you sure you want to delete this tab (and all its messages)?")) return;
  const r = await fetch(`/api/chat/tabs/${tabId}?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if(r.ok){
    await loadTabs();
    if(chatTabs.length>0){
      const firstActive = chatTabs.find(t => !t.archived);
      currentTabId = firstActive ? firstActive.id : chatTabs[0].id;
    } else {
      currentTabId = null;
    }
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    await loadChatHistory(currentTabId, true);
    const ct = chatTabs.find(t => t.id === currentTabId);
    const path = resolveTabPath(ct);
    if(path && window.location.pathname !== path && window.location.pathname !== '/new'){
      window.history.replaceState({}, '', path);
    }
    await loadTabs();
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    updatePageTitle();
  }
}

async function toggleArchiveTab(tabId, archived){
  const r = await fetch('/api/chat/tabs/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tabId, archived, sessionId })
  });
  if(!r.ok){
    return false;
  }
  const wasCurrent = archived && tabId === currentTabId;
  await loadTabs();
  const isActiveChatTab = tab => {
    if(!tab || tab.archived) return false;
    const type = (tab.tab_type || 'chat').toString().trim().toLowerCase();
    return type === 'chat';
  };
  if(wasCurrent){
    const idx = chatTabs.findIndex(t => t.id === tabId);
    let next = null;
    if(idx !== -1){
      for(let i = idx + 1; i < chatTabs.length; i++){
        if(isActiveChatTab(chatTabs[i])){ next = chatTabs[i]; break; }
      }
      if(!next){
        for(let i = 0; i < idx; i++){
          if(isActiveChatTab(chatTabs[i])){ next = chatTabs[i]; break; }
        }
      }
    }
    if(next){
      await selectTab(next.id);
    }else{
      renderTabs();
      renderSidebarTabs();
      renderArchivedSidebarTabs();
      updatePageTitle();
    }
  }else{
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    updatePageTitle();
  }
  if(archived){
    const hasActiveChat = chatTabs.some(isActiveChatTab);
    if(!hasActiveChat){
      await createChatTabWithoutModal();
    }
  }
  if(chatTabs.length > 0 && chatTabs.every(t => t.archived)){
    if(!suppressArchiveRedirect){
      location.href = 'https://alfe.sh';
    }
  }
  updateArchiveChatButton();
  return true;
}

async function toggleFavoriteTab(tabId, favorite){
  const targetTab = chatTabs.find(t => t.id === tabId);
  if(targetTab && !tabSupportsFavorites(targetTab)){
    return false;
  }
  try {
    const r = await fetch('/api/chat/tabs/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabId, favorite, sessionId })
    });
    if(!r.ok){
      console.error('Failed to toggle favorite', r.status);
      return false;
    }
    await loadTabs();
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    const activeTab = chatTabs.find(t => t.id === currentTabId);
    updateChatTitleDisplay(activeTab);
    return true;
  } catch(err){
    console.error('Failed to toggle favorite', err);
    return false;
  }
}

async function moveTabToProject(tabId, project){
  const tab = chatTabs.find(t => t.id === tabId);
  if(!tab) return;
  const repo = tab.repo_ssh_url || '';
  const extraProjects = tab.extra_projects || '';
  const taskId = tab.task_id || 0;
  const type = tab.tab_type || 'chat';
  const sendProjectContext = tab.send_project_context !== undefined ? !!tab.send_project_context : false;
  await fetch('/api/chat/tabs/config', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({tabId, project, repo, extraProjects, taskId, type, sendProjectContext, sessionId})
  });
  chatTabOrder[tab.project_name || ''] = (chatTabOrder[tab.project_name || ''] || []).filter(id => id !== tabId);
  chatTabOrder[project] = chatTabOrder[project] || [];
  chatTabOrder[project].unshift(tabId);
  saveChatTabOrder();
  await loadTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  removeProjectGroupIfEmpty(tab.project_name || '');
}

async function setTabParent(tabId, parentId){
  await fetch('/api/chat/tabs/parent', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({tabId, parentId, sessionId})
  });
  await loadTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
}
async function selectTab(tabId){
  const numericTabId = typeof tabId === "string" ? parseInt(tabId, 10) : tabId;
  if(Number.isNaN(numericTabId)){
    console.warn("[Tabs] selectTab called with invalid tabId", tabId);
    return;
  }
  let targetTab = chatTabs.find(t => t.id === numericTabId);
  if(!targetTab){
    try {
      await loadTabs();
    } catch(err){
      console.error("[Tabs] Failed to refresh tabs before selecting", err);
    }
    targetTab = chatTabs.find(t => t.id === numericTabId);
  }
  if(!targetTab){
    console.warn("[Tabs] Unable to locate tab", tabId);
    return;
  }

  currentTabId = targetTab.id;
  await setSetting("last_chat_tab", targetTab.id);
  currentTabType = targetTab.tab_type || 'chat';
  setCodeNavActiveState(currentTabType === 'code');
  const chatPanelEl = document.getElementById('chatPanel') || document.querySelector('.chat-panel');
  if(currentTabType === 'code'){
    if(sidebarViewCodeTasks && sidebarViewCodeTasks.style.display === 'none'){
      showCodeTasksPanel();
    }
    if(chatPanelEl) chatPanelEl.style.display = 'none';
  } else {
    if(chatPanelEl) chatPanelEl.style.display = '';
    loadChatHistory(targetTab.id, true);
  }
  tabModelOverride = targetTab && targetTab.model_override ? targetTab.model_override : '';
  {
    const globalModel = await getSetting("ai_model");
    modelName = tabModelOverride || globalModel || "unknown";
    updateModelHud();
  }
  tabGenerateImages = currentTabType === 'design';
  const chk = document.getElementById("tabGenerateImagesCheck");
  if(chk){
    chk.checked = tabGenerateImages;
    chk.disabled = currentTabType !== 'design';
  }
  updateRepeatButtonVisibility();
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  renderHeader();
  renderBody();
  setLoopUi(imageLoopEnabled);
  toggleImageUploadButton(imageUploadEnabled);
  if(imageLoopEnabled && accountInfo && accountInfo.id === 1){
    setTimeout(runImageLoop, 0);
  }
  updatePageTitle();
  {
    const newPath = resolveTabPath(targetTab);
    if(newPath && window.location.pathname !== newPath && window.location.pathname !== '/new'){
      window.history.replaceState({}, '', newPath);
    }
  }
  const saved = await getSetting(mosaicKey(targetTab.id));
  if(typeof saved !== "undefined"){
    mosaicPanelVisible = !!saved;
  } else {
    const defVal = await getSetting("mosaic_panel_visible");
    if(typeof defVal !== "undefined") mosaicPanelVisible = !!defVal;
  }
  updateMosaicPanelVisibility();
}
function renderTabs(){
  closeTabOptionsMenu();
  const tc = $("#tabsContainer");
  if(!tc) return;
  tc.innerHTML="";
  const theme = document.body?.dataset?.theme;
  const isLightTheme = theme === 'light';
  chatTabs.filter(t => showArchivedTabs || !t.archived).forEach(tab => {
    const tabBtn = document.createElement("div");
    tabBtn.dataset.tabId = tab.id;
    tabBtn.style.display="flex";
    tabBtn.style.alignItems="center";
    tabBtn.style.gap = "4px";
    tabBtn.style.cursor="pointer";

    if(isLightTheme){
      if(tab.id === currentTabId){
        tabBtn.style.backgroundColor = "var(--accent-light)";
        tabBtn.style.border = "1px solid var(--accent)";
        tabBtn.style.color = "var(--accent-strong)";
      } else {
        tabBtn.style.backgroundColor = "var(--surface)";
        tabBtn.style.border = "1px solid var(--surface-border)";
        tabBtn.style.color = "var(--text-color)";
      }
    } else {
      if (tab.id === currentTabId) {
        tabBtn.style.backgroundColor = "#555";
        tabBtn.style.border = "2px solid #aaa";
        tabBtn.style.color = "#fff";
      } else {
        tabBtn.style.backgroundColor = "#333";
        tabBtn.style.border = "1px solid #444";
        tabBtn.style.color = "#ddd";
      }
    }

    tabBtn.style.padding="4px 6px";
    const iconSpan = document.createElement("span");
    iconSpan.className = "tab-icon";
    iconSpan.textContent = tabTypeIcons[tab.tab_type] || tabTypeIcons.chat;
    const iconColor = isLightTheme
      ? (tab.id === currentTabId ? "var(--accent-strong)" : "var(--text-color)")
      : (tab.id === currentTabId ? "#fff" : "#ddd");
    iconSpan.style.color = iconColor;
    tabBtn.appendChild(iconSpan);
    const nameSpan = document.createElement("span");
    const fullName = tab.name + (showProjectNameInTabs && tab.project_name ? ` (${tab.project_name})` : "");
    nameSpan.textContent = truncateTabTitle(fullName);
    nameSpan.title = fullName;
    nameSpan.style.flexGrow = "1";
    nameSpan.style.color = isLightTheme
      ? (tab.id === currentTabId ? "var(--accent-strong)" : "var(--text-color)")
      : (tab.id === currentTabId ? "#fff" : "#ddd");
    nameSpan?.addEventListener("click", ()=>selectTab(tab.id));
    tabBtn.appendChild(nameSpan);

    const optionsBtn = createTabOptionsButton(tab);
    optionsBtn.style.marginLeft = "4px";
    optionsBtn.style.color = isLightTheme
      ? (tab.id === currentTabId ? "var(--accent-strong)" : "var(--text-color)")
      : (tab.id === currentTabId ? "#fff" : "#ddd");
    tabBtn.appendChild(optionsBtn);


    tabBtn?.addEventListener("contextmenu", e=>{
      e.preventDefault();
    const resolvedPath = resolveTabPath(tab);
    if(resolvedPath){
      window.open(resolvedPath, "_blank");
    }
    });
    tc.appendChild(tabBtn);
  });
  updateArchiveChatButton();
}

function renderFavoritesGroup(container, favorites, indented = true){
  if(!container) return;
  const header = document.createElement('div');
  header.className = 'tab-project-header favorites-header';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');

  const titleRow = document.createElement('div');
  titleRow.className = 'favorites-header-title-row';
  const arrow = document.createElement('span');
  arrow.className = 'project-collapse-arrow';
  arrow.textContent = favoritesCollapsed ? '\u25B6' : '\u25BC';
  // Archived toggle button above Favorites
  const archivedRow = document.createElement('div');
  archivedRow.className = 'favorites-header-archived-row';
  const archivedToggle = document.createElement('button');
  archivedToggle.className = 'favorites-archived-toggle';
  archivedToggle.type = 'button';
  archivedToggle.textContent = 'Archived';
  archivedToggle.setAttribute('aria-pressed', showArchivedTabs ? 'true' : 'false');
  archivedToggle.classList.toggle('active', showArchivedTabs);
  archivedToggle.addEventListener('click', async (e) => {
    e.stopPropagation();
    showArchivedTabs = !showArchivedTabs;
    archivedToggle.setAttribute('aria-pressed', showArchivedTabs ? 'true' : 'false');
    archivedToggle.classList.toggle('active', showArchivedTabs);
    if(showArchivedTabs){
      archivedCollapsed = false;
      saveArchivedCollapsed();
    }
    try{ await setSetting('show_archived_tabs', showArchivedTabs); }catch(_e){}
    renderSidebarTabs();
  });
  archivedRow.appendChild(archivedToggle);
  header.appendChild(archivedRow);

  titleRow.appendChild(arrow);
  const label = document.createElement('span');
  label.textContent = ' Favorites';
  titleRow.appendChild(label);
  header.appendChild(titleRow);
  const toggleCollapsed = () => {
    favoritesCollapsed = !favoritesCollapsed;
    saveFavoritesCollapsed();
    renderSidebarTabs();
  };
  header?.addEventListener('click', toggleCollapsed);
  header?.addEventListener('keydown', ev => {
    if(ev.key === 'Enter' || ev.key === ' '){
      ev.preventDefault();
      toggleCollapsed();
    }
  });
  container.appendChild(header);

  const groupDiv = document.createElement('div');
  groupDiv.className = 'project-tab-group favorites-group';
  groupDiv.dataset.project = '__favorites__';
  if(favoritesCollapsed) groupDiv.style.display = 'none';

  if(!favorites.length){
    const empty = document.createElement('div');
    empty.className = 'sidebar-subtext favorites-empty';
    empty.textContent = 'No favorite chats yet.';
    groupDiv.appendChild(empty);
  } else {
    const favoriteIds = new Set(favorites.map(t => t.id));
    const childMap = new Map();
    favorites.forEach(tab => {
      if(tab.parent_id && favoriteIds.has(tab.parent_id)){
        if(!childMap.has(tab.parent_id)) childMap.set(tab.parent_id, []);
        childMap.get(tab.parent_id).push(tab);
      }
    });
    favorites.forEach(tab => {
      const parentIsFavorite = tab.parent_id && favoriteIds.has(tab.parent_id);
      if(parentIsFavorite) return;
      const children = childMap.get(tab.id) || [];
      renderSidebarTabRow(groupDiv, tab, indented, children.length > 0);
      if(!collapsedChildTabs[tab.id]){
        children.forEach(child => renderSidebarTabRow(groupDiv, child, indented, false));
      }
    });
  }

  container.appendChild(groupDiv);
}

function renderArchivedGroup(container, archivedTabs){
  if(!container || !showArchivedTabs) return;

  const header = document.createElement('div');
  header.className = 'tab-project-header archived-header';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');

  const arrow = document.createElement('span');
  arrow.className = 'project-collapse-arrow';
  arrow.textContent = archivedCollapsed ? '\u25B6' : '\u25BC';
  header.appendChild(arrow);

  const label = document.createElement('span');
  label.textContent = ' Archived';
  header.appendChild(label);

  const toggleCollapsed = () => {
    archivedCollapsed = !archivedCollapsed;
    saveArchivedCollapsed();
    renderSidebarTabs();
  };
  header?.addEventListener('click', toggleCollapsed);
  header?.addEventListener('keydown', ev => {
    if(ev.key === 'Enter' || ev.key === ' '){
      ev.preventDefault();
      toggleCollapsed();
    }
  });

  container.appendChild(header);

  const groupDiv = document.createElement('div');
  groupDiv.className = 'project-tab-group archived-group';
  groupDiv.dataset.project = '__archived__';
  if(archivedCollapsed) groupDiv.style.display = 'none';

  if(!archivedTabs.length){
    const empty = document.createElement('div');
    empty.className = 'sidebar-subtext archived-empty';
    empty.textContent = 'No archived chats.';
    groupDiv.appendChild(empty);
  } else {
    const getSortValue = (tab) => {
      const timestamps = [tab.updated_at, tab.last_message_at, tab.created_at];
      for(const ts of timestamps){
        if(!ts) continue;
        const date = new Date(ts);
        if(!Number.isNaN(date.getTime())) return date.getTime();
      }
      return 0;
    };

    const sorted = [...archivedTabs];
    sorted.sort((a,b) => getSortValue(b) - getSortValue(a));
    const archivedIds = new Set(sorted.map(t => t.id));
    const childMap = new Map();
    sorted.forEach(tab => {
      if(tab.parent_id && archivedIds.has(tab.parent_id)){
        if(!childMap.has(tab.parent_id)) childMap.set(tab.parent_id, []);
        childMap.get(tab.parent_id).push(tab);
      }
    });
    childMap.forEach(list => list.sort((a,b) => getSortValue(b) - getSortValue(a)));

    const renderTabWithChildren = (tab) => {
      const children = childMap.get(tab.id) || [];
      renderSidebarTabRow(groupDiv, tab, true, children.length > 0);
      if(children.length && !collapsedChildTabs[tab.id]){
        children.forEach(child => renderTabWithChildren(child));
      }
    };

    sorted.forEach(tab => {
      const parentIsArchived = tab.parent_id && archivedIds.has(tab.parent_id);
      if(parentIsArchived) return;
      renderTabWithChildren(tab);
    });
  }

  container.appendChild(groupDiv);
}

// New function to render vertical chat tabs in sidebar
function renderSidebarTabs(){
  closeTabOptionsMenu();
  const container = document.getElementById("verticalTabsContainer");
  container.innerHTML="";
  const visibleTabs = chatTabs.filter(t => (!tasksOnlyTabs || t.task_id) && (t.show_in_sidebar !== 0));
  const archivedTabs = showArchivedTabs ? visibleTabs.filter(t => t.archived) : [];
  const filteredTabs = visibleTabs.filter(t => !t.archived);
  const favoriteTabs = filteredTabs.filter(t => t.favorite && tabSupportsFavorites(t));
  const tabs = filteredTabs.filter(t => !t.favorite || !tabSupportsFavorites(t));
  if(groupTabsByProject){
    renderFavoritesGroup(container, favoriteTabs, true);
    renderArchivedGroup(container, archivedTabs);
    const groups = new Map();
    // Include user-defined project groups first so they appear even if empty
    projectGroups.forEach(name => {
      if(!groups.has(name)) groups.set(name, []);
    });
    // Add projects based on existing chat tabs
    tabs.forEach(t => {
      const key = t.project_name || "";
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    if(!groups.has("")) groups.set("", []);
    // ensure order array contains current projects only
    projectHeaderOrder = projectHeaderOrder.filter(p => groups.has(p));
    for(const p of groups.keys()){
      if(!projectHeaderOrder.includes(p)) projectHeaderOrder.push(p);
    }
    const renderGroup = (project, list, { alwaysShow = false } = {}) => {
      if(list.length === 0 && !alwaysShow) return;
      const isDefaultProject = !project;
      const collapsed = isDefaultProject ? false : collapsedProjectGroups[project];
      const header = document.createElement("div");
      header.className = "tab-project-header";
      if(!isDefaultProject){
        const grab = document.createElement("span");
        grab.className = "drag-handle";
        grab.textContent = "⠿";
        grab.draggable = true;
        grab?.addEventListener("dragstart", () => {
          draggingProjectHeader = project;
        });
        header.appendChild(grab);
      }
      if(!isDefaultProject){
        const arrow = document.createElement("span");
        arrow.className = "project-collapse-arrow";
        arrow.textContent = collapsed ? "\u25B6" : "\u25BC"; // ▶ or ▼
        header.appendChild(arrow);
      }
      const label = document.createElement("span");
      label.textContent = " " + (project || "Chats");
      label.style.flexGrow = "0";
      header.appendChild(label);
      if(project){
        const gear = document.createElement("button");
        gear.innerHTML = "&#9881;";
        gear.className = "project-gear-btn config-btn";
        gear?.addEventListener("click", e => { e.stopPropagation(); openProjectSettingsModal(project); });
        header.appendChild(gear);
      }
      const addBtn = document.createElement("button");
      addBtn.textContent = "+";
      addBtn.className = "project-add-btn config-btn";
      addBtn?.addEventListener("click", e => { e.stopPropagation(); quickAddTabToProject(project); });
      header.appendChild(addBtn);
      addBtn?.addEventListener("mouseenter", e => showProjectAddTooltip(project, e));
      addBtn?.addEventListener("mouseleave", scheduleHideProjectAddTooltip);
      if(!isDefaultProject){
        header?.addEventListener("click", e => {
          e.stopPropagation();
          collapsedProjectGroups[project] = !collapsedProjectGroups[project];
          saveCollapsedProjectGroups();
          renderSidebarTabs();
        });
      }
      header?.addEventListener("dragover", e => {
        if((!isDefaultProject && draggingProjectHeader && draggingProjectHeader !== project) ||
           (draggingTabRow && draggingTabRow.dataset.project !== project)){
          e.preventDefault();
          header.classList.add("drag-over");
        }
      });
      header?.addEventListener("dragleave", () => header.classList.remove("drag-over"));
      header?.addEventListener("drop", async e => {
        e.preventDefault();
        header.classList.remove("drag-over");
        if(!isDefaultProject && draggingProjectHeader && draggingProjectHeader !== project){
          const from = projectHeaderOrder.indexOf(draggingProjectHeader);
          const to = projectHeaderOrder.indexOf(project);
          projectHeaderOrder.splice(from, 1);
          projectHeaderOrder.splice(to, 0, draggingProjectHeader);
          saveProjectHeaderOrder();
          draggingProjectHeader = null;
          renderSidebarTabs();
        } else if(draggingTabRow && draggingTabRow.dataset.project !== project){
          const tabId = parseInt(draggingTabRow.dataset.tabId, 10);
          await moveTabToProject(tabId, project);
          draggingTabRow = null;
        }
      });
      header?.addEventListener("dragend", () => {
        draggingProjectHeader = null;
        header.classList.remove("drag-over");
      });
      container.appendChild(header);
      const groupDiv = document.createElement("div");
      groupDiv.className = "project-tab-group";
      groupDiv.dataset.project = project;
      if(collapsed) groupDiv.style.display = "none";
      const order = chatTabOrder[project] || [];
      list.sort((a,b)=>{
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        if(ia === -1 && ib === -1) return 0;
        if(ia === -1) return 1;
        if(ib === -1) return -1;
        return ia - ib;
      });
      const childMap = new Map();
      list.forEach(t => {
        if(t.parent_id){
          if(!childMap.has(t.parent_id)) childMap.set(t.parent_id, []);
          childMap.get(t.parent_id).push(t);
        }
      });
      list.forEach(tab => {
        if(tab.parent_id) return;
        const children = childMap.get(tab.id) || [];
        renderSidebarTabRow(groupDiv, tab, true, children.length > 0);
        if(!collapsedChildTabs[tab.id]){
          children.forEach(ch => renderSidebarTabRow(groupDiv, ch, true, false));
        }
      });
      if(!list.length){
        const empty = document.createElement("div");
        empty.className = "sidebar-subtext empty-group-placeholder";
        empty.textContent = project ? "No chats in this project yet." : "No chats yet.";
        groupDiv.appendChild(empty);
      }
      container.appendChild(groupDiv);
    };

    const noProjectTabs = groups.get("");
    const otherEntries = Array.from(groups.entries()).filter(([p]) => p !== "");
    otherEntries.sort((a,b)=>{
      const ia = projectHeaderOrder.indexOf(a[0]);
      const ib = projectHeaderOrder.indexOf(b[0]);
      return ia - ib;
    });
    otherEntries.forEach(([project, list]) => renderGroup(project, list));
    renderGroup("", noProjectTabs || [], { alwaysShow: true });
    return;
  }
  const order = chatTabOrder[''] || [];
  tabs.sort((a,b)=>{
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if(ia === -1 && ib === -1) return 0;
    if(ia === -1) return 1;
    if(ib === -1) return -1;
    return ia - ib;
  });
  const childMap = new Map();
  renderFavoritesGroup(container, favoriteTabs, false);
  renderArchivedGroup(container, archivedTabs);
  tabs.forEach(t => {
    if(t.parent_id){
      if(!childMap.has(t.parent_id)) childMap.set(t.parent_id, []);
      childMap.get(t.parent_id).push(t);
    }
  });
  let lastDate = null;
  tabs.forEach(tab => {
    if(tab.parent_id) return;
    const tabDate = isoDate(tab.created_at);
    if(tabDate !== lastDate){
      const header = document.createElement("div");
      header.className = "tab-date-header";
      header.textContent = isoDateWithDay(tab.created_at);
      container.appendChild(header);
      lastDate = tabDate;
    }
    const children = childMap.get(tab.id) || [];
    renderSidebarTabRow(container, tab, false, children.length > 0);
    if(!collapsedChildTabs[tab.id]){
      children.forEach(ch => renderSidebarTabRow(container, ch, false, false));
    }
  });
}

function renderSidebarTabRow(container, tab, indented=false, hasChildren=false){
  const wrapper = document.createElement("div");
  wrapper.className = "sidebar-tab-row";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "4px";
  wrapper.style.width = "100%";
  if(indented) wrapper.classList.add("project-indented");
  if(tab.parent_id) wrapper.classList.add("subtask-indented");
  wrapper.dataset.tabId = tab.id;
  wrapper.dataset.project = tab.project_name || "";
  wrapper.dataset.parentId = tab.parent_id || 0;

  const grab = document.createElement("span");
  grab.className = "drag-handle";
  grab.textContent = "⠿";
  grab.draggable = true;
  grab?.addEventListener("dragstart", tabDragStart);
  wrapper.appendChild(grab);

  if(hasChildren){
    const arrow = document.createElement("span");
    arrow.className = "child-collapse-arrow";
    const collapsed = collapsedChildTabs[tab.id];
    arrow.textContent = collapsed ? "\u25B6" : "\u25BC";
    arrow?.addEventListener("click", e => {
      e.stopPropagation();
      collapsedChildTabs[tab.id] = !collapsedChildTabs[tab.id];
      saveCollapsedChildTabs();
      renderSidebarTabs();
    });
    wrapper.appendChild(arrow);
  }

  const info = document.createElement("div");
  info.style.display = "flex";
  info.style.justifyContent = "flex-start";
  info.style.alignItems = "center";
  info.style.flexGrow = "1";
  info.style.gap = "6px";

  const b = document.createElement("button");
  b.dataset.tabId = tab.id;
  const showTabIcon = tab.tab_type && tab.tab_type !== "chat" && tab.tab_type !== "search";
  if(showTabIcon){
    const icon = document.createElement("span");
    icon.className = "tab-icon";
    icon.textContent = tabTypeIcons[tab.tab_type] || tabTypeIcons.chat;
    b.appendChild(icon);
  }
  const fullName = tab.name + (showProjectNameInTabs && tab.project_name ? ` (${tab.project_name})` : "");
  b.appendChild(document.createTextNode(truncateTabTitle(fullName)));
  b.title = fullName;
  if (tab.id === currentTabId) {
    b.classList.add("active");
  }
  b.style.flexGrow = "1";
  b?.addEventListener("click", () => {
    selectTab(tab.id);
    if(isMobileViewport() && sidebarVisible){
      toggleSidebar();
    }
  });
  b?.addEventListener("contextmenu", e => {
    e.preventDefault();
    const resolvedPath = resolveTabPath(tab);
    if(resolvedPath){
      window.open(resolvedPath, "_blank");
    }
  });

  info.appendChild(b);

  const optionsBtn = createTabOptionsButton(tab);


  const taskIdSpan = document.createElement("span");
  taskIdSpan.className = "task-id";
  if (tab.task_id) {
    const prio = tab.priority ? ` ${tab.priority}` : "";
    taskIdSpan.textContent = `#${tab.task_id}${prio}`;
    taskIdSpan?.addEventListener("click", e => {
      e.stopPropagation();
      const sel = document.createElement("select");
      ["Low","Medium","High"].forEach(v => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v;
        if (v === tab.priority) o.selected = true;
        sel.appendChild(o);
      });
      taskIdSpan.textContent = "";
      taskIdSpan.appendChild(sel);
      sel.focus();
      sel?.addEventListener("change", async () => {
        await fetch("/api/tasks/priority", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: tab.task_id, priority: sel.value })
        });
        tab.priority = sel.value;
        taskIdSpan.textContent = `#${tab.task_id} ${sel.value}`;
      });
      sel?.addEventListener("blur", () => {
        taskIdSpan.textContent = `#${tab.task_id}${tab.priority ? ` ${tab.priority}` : ""}`;
      });
    });
  }

  wrapper.appendChild(info);
  wrapper.appendChild(optionsBtn);
  if(showArchiveChatButton && !tab.archived){
    const archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.className = "tab-archive-trigger";
    archiveBtn.textContent = "🗄️";
    archiveBtn.title = "Archive this chat";
    archiveBtn?.addEventListener("click", async e => {
      e.stopPropagation();
      await toggleArchiveTab(tab.id, true);
    });
    wrapper.appendChild(archiveBtn);
  }
  if (tab.task_id) wrapper.appendChild(taskIdSpan);
  wrapper?.addEventListener("dragover", tabDragOver);
  wrapper?.addEventListener("dragleave", tabDragLeave);
  wrapper?.addEventListener("drop", tabDrop);
  wrapper?.addEventListener("dragend", tabDragEnd);
  container.appendChild(wrapper);
}

function renderArchivedSidebarTabs(){
  closeTabOptionsMenu();
  const container = document.getElementById("archivedTabsContainer");
  if(!container) return;
  container.innerHTML = "";
  const tabs = archivedTabs;
  if(!tabs || tabs.length === 0){
    const empty = document.createElement("div");
    empty.className = "sidebar-subtext archived-empty-state";
    empty.textContent = "There are no archived chats yet.";
    container.appendChild(empty);
    return;
  }
  if(groupTabsByProject){
    const groups = new Map();
    tabs.forEach(t => {
      const key = t.project_name || "";
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    const renderGroup = (project, list) => {
      if(list.length === 0) return;
      collapsedArchiveGroups[project] = false;
      const header = document.createElement("div");
      header.className = "tab-project-header";
      header.appendChild(document.createTextNode(project || "Chats"));
      container.appendChild(header);
      const groupDiv = document.createElement("div");
      groupDiv.className = "project-tab-group";
      groupDiv.dataset.project = project;
      groupDiv.style.display = "flex";
      groupDiv.style.flexDirection = "column";
      const childMap = new Map();
      list.forEach(t => {
        if(t.parent_id){
          if(!childMap.has(t.parent_id)) childMap.set(t.parent_id, []);
          childMap.get(t.parent_id).push(t);
        }
      });
      list.forEach(tab => {
        if(tab.parent_id) return;
        const children = childMap.get(tab.id) || [];
        addArchivedRow(groupDiv, tab, true, children.length > 0);
        if(!collapsedChildTabs[tab.id]){
          children.forEach(ch => addArchivedRow(groupDiv, ch, true, false));
        }
      });
      container.appendChild(groupDiv);
    };
    const noProject = groups.get("");
    const entries = Array.from(groups.entries()).filter(([p]) => p !== "");
    entries.sort((a,b)=>{
      const ia = projectHeaderOrder.indexOf(a[0]);
      const ib = projectHeaderOrder.indexOf(b[0]);
      return ia - ib;
    });
    entries.forEach(([project, list]) => renderGroup(project, list));
    if(noProject) renderGroup("", noProject);
    saveCollapsedArchiveGroups();
    return;
  }
  const childMap = new Map();
  tabs.forEach(t => {
    if(t.parent_id){
      if(!childMap.has(t.parent_id)) childMap.set(t.parent_id, []);
      childMap.get(t.parent_id).push(t);
    }
  });
  tabs.forEach(tab => {
    if(tab.parent_id) return;
    const children = childMap.get(tab.id) || [];
    addArchivedRow(container, tab, false, children.length > 0);
    if(!collapsedChildTabs[tab.id]){
      children.forEach(ch => addArchivedRow(container, ch, false, false));
    }
  });
}

function addArchivedRow(container, tab, indented=false, hasChildren=false){
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "4px";
  wrapper.style.width = "100%";
  if(indented) wrapper.classList.add("project-indented");
  if(tab.parent_id) wrapper.classList.add("subtask-indented");
  wrapper.dataset.parentId = tab.parent_id || 0;

  if(hasChildren){
    const arrow = document.createElement("span");
    arrow.className = "child-collapse-arrow";
    const collapsed = collapsedChildTabs[tab.id];
    arrow.textContent = collapsed ? "\u25B6" : "\u25BC";
    arrow?.addEventListener("click", e => {
      e.stopPropagation();
      collapsedChildTabs[tab.id] = !collapsedChildTabs[tab.id];
      saveCollapsedChildTabs();
      renderArchivedSidebarTabs();
    });
    wrapper.appendChild(arrow);
  }

  const showTabIcon = tab.tab_type && tab.tab_type !== "chat" && tab.tab_type !== "search";
  if(showTabIcon){
    const icon = document.createElement("span");
    icon.className = "tab-icon";
    icon.textContent = tabTypeIcons[tab.tab_type] || tabTypeIcons.chat;
    wrapper.appendChild(icon);
  }

  const info = document.createElement("div");
  info.style.display = "flex";
  info.style.flexDirection = "column";
  info.style.flexGrow = "1";

  const label = document.createElement("span");
  const fullName = tab.name + (showProjectNameInTabs && tab.project_name ? ` (${tab.project_name})` : "");
  label.textContent = truncateTabTitle(fullName);
  label.title = fullName;

  info.appendChild(label);

  const unarchBtn = document.createElement("button");
  unarchBtn.textContent = "Unarchive";
  unarchBtn.className = "archive-action-btn";
  unarchBtn.title = "Restore this chat";
  unarchBtn?.addEventListener("click", async e => {
    e.stopPropagation();
    await toggleArchiveTab(tab.id, false);
    await loadTabs();
    renderArchivedSidebarTabs();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Delete";
  deleteBtn.className = "archive-action-btn archive-delete-btn";
  deleteBtn.title = "Delete this chat permanently";
  deleteBtn?.addEventListener("click", async e => {
    e.stopPropagation();
    await deleteTab(tab.id);
  });

  const taskIdSpan = document.createElement("span");
  taskIdSpan.className = "task-id";
  if (tab.task_id) {
    const prio = tab.priority ? ` ${tab.priority}` : "";
    taskIdSpan.textContent = `#${tab.task_id}${prio}`;
    taskIdSpan?.addEventListener("click", e => {
      e.stopPropagation();
      const sel = document.createElement("select");
      ["Low","Medium","High"].forEach(v => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v;
        if (v === tab.priority) o.selected = true;
        sel.appendChild(o);
      });
      taskIdSpan.textContent = "";
      taskIdSpan.appendChild(sel);
      sel.focus();
      sel?.addEventListener("change", async () => {
        await fetch("/api/tasks/priority", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: tab.task_id, priority: sel.value })
        });
        tab.priority = sel.value;
        taskIdSpan.textContent = `#${tab.task_id} ${sel.value}`;
      });
      sel?.addEventListener("blur", () => {
        taskIdSpan.textContent = `#${tab.task_id}${tab.priority ? ` ${tab.priority}` : ""}`;
      });
    });
  }

  wrapper.appendChild(info);
  wrapper.appendChild(unarchBtn);
  wrapper.appendChild(deleteBtn);
  if (tab.task_id) wrapper.appendChild(taskIdSpan);
  container.appendChild(wrapper);
}

document.getElementById("newSideTabBtn").addEventListener("click", createChatTabWithoutModal);
document.getElementById("newProjectGroupBtn")?.addEventListener("click", addProjectGroup);
const tasksOnlyTabsCheck = document.getElementById("tasksOnlyTabsCheck");
if(tasksOnlyTabsCheck){
  tasksOnlyTabsCheck?.addEventListener("change", () => {
    tasksOnlyTabs = tasksOnlyTabsCheck.checked;
    saveTasksOnlyTabs();
    renderSidebarTabs();
  });
}
const hideArchivedTabsCheck = document.getElementById("hideArchivedTabsCheck");
if(hideArchivedTabsCheck){
  hideArchivedTabsCheck?.addEventListener("change", () => {
    hideArchivedTabs = hideArchivedTabsCheck.checked;
    saveHideArchivedTabs();
    renderSidebarTabs();
  });
}
const newTabBtnEl = document.getElementById("newTabBtn");
if (newTabBtnEl) newTabBtnEl?.addEventListener("click", createChatTabWithoutModal);
$$('#newTabTypeButtons .start-type-btn').forEach(btn => {
  btn?.addEventListener('click', async () => {
    newTabSelectedType = btn.dataset.type;
    await addNewTab();
  });
});
const addModelModalAddBtn = document.getElementById("addModelModalAddBtn");
if(addModelModalAddBtn){
  addModelModalAddBtn?.addEventListener("click", async () => {
    const sel = document.getElementById("favoriteModelSelect");
    const modelId = sel ? sel.value : "";
    if(modelId){
      await addModelTab(modelId);
    }
    hideModal(document.getElementById("addModelModal"));
  });
}
const addModelModalCancelBtn = document.getElementById("addModelModalCancelBtn");
if(addModelModalCancelBtn){
  addModelModalCancelBtn?.addEventListener("click", () => {
    hideModal(document.getElementById("addModelModal"));
  });
}
document.getElementById("newSubroutineBtn")?.addEventListener("click", addNewSubroutine);
document.getElementById("viewActionHooksBtn")?.addEventListener("click", () => {
  renderActionHooks();
  showModal(document.getElementById("actionHooksModal"));
});
document.getElementById("actionHooksCloseBtn")?.addEventListener("click", () => hideModal(document.getElementById("actionHooksModal")));
document.getElementById("subroutineSaveBtn")?.addEventListener("click", saveSubroutine);
document.getElementById("subroutineCancelBtn")?.addEventListener("click", () => {
  editingSubroutineId = null;
  hideModal(document.getElementById("subroutineModal"));
});

// Subscribe button opens subscription plans modal (if present)
const subscribeBtn = document.getElementById("subscribeBtn");
if (subscribeBtn) {
  subscribeBtn?.addEventListener("click", e => {
    e.preventDefault();
    showModal(document.getElementById("subscribeModal"));
  });
}
const subscribeCloseBtn = document.getElementById("subscribeCloseBtn");
if (subscribeCloseBtn) {
  subscribeCloseBtn?.addEventListener("click", () =>
    hideModal(document.getElementById("subscribeModal"))
  );
}

const usageLimitModalCloseBtn = document.getElementById("usageLimitModalCloseBtn");
if(usageLimitModalCloseBtn){
  usageLimitModalCloseBtn?.addEventListener("click", () => hideModal(document.getElementById("usageLimitModal")));
}

const signupBtn = document.getElementById("signupBtn");
if (signupBtn) {
  signupBtn?.addEventListener("click", openSignupModal);
}
const authEmailContinueBtn = document.getElementById("authEmailContinueBtn");
if(authEmailContinueBtn){
  authEmailContinueBtn?.addEventListener("click", checkAuthEmailAndContinue);
}
const authEmailInput = document.getElementById("authEmailInput");
if(authEmailInput){
  authEmailInput?.addEventListener("keydown", (event) => {
    if(event.key === "Enter"){
      event.preventDefault();
      checkAuthEmailAndContinue();
    }
  });
  authEmailInput?.addEventListener("input", (event) => {
    setAuthEmailValue(event.target.value);
  });
}
const MIN_PASSWORD_LENGTH = 8;
const signupSubmitBtn = document.getElementById("signupSubmitBtn");
if (signupSubmitBtn) {
  signupSubmitBtn?.addEventListener("click", async () => {
    if(!ensureAccountsEnabled()){
      return;
    }
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirm = document.getElementById("signupConfirm")?.value;
    if(!email || !password){
      showToast("Email and password required");
      return;
    }
    if(!isBasicEmailValid(email)){
      showToast("Enter a valid email address");
      return;
    }
    if(password.length < MIN_PASSWORD_LENGTH){
      showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if(confirm !== undefined && password !== confirm){
      showToast("Passwords do not match");
      return;
    }
    try {
      const resp = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, sessionId })
      });
      const data = await resp.json().catch(() => null);
      if(resp.ok && data && data.success){
        showToast("Registered!");
        hideModal(document.getElementById("authModal"));
        updateAccountButton({accountsEnabled: true, exists:true, id:data.id, email, totpEnabled: data.totpEnabled});
        fetch('/api/account')
          .then(r => r.ok ? r.json() : null)
          .then(info => { if(info) updateAccountButton(info); });
      } else {
        showToast(data?.error || "Registration failed");
      }
    } catch(err){
      console.error("Registration failed", err);
      showToast("Registration failed");
    }
  });
}

const signupPasswordInput = document.getElementById("signupPassword");
const passwordRequirementItems = signupPasswordInput
  ? document.querySelectorAll(".password-requirements [data-requirement]")
  : [];

const updatePasswordRequirements = (value = "") => {
  if(!passwordRequirementItems.length){
    return;
  }
  const requirements = {
    "min-8": value.length >= 8,
    "min-12": value.length >= 12,
    "case": /[a-z]/.test(value) && /[A-Z]/.test(value),
    "number": /\d/.test(value),
    "symbol": /[#$&]/.test(value)
  };

  passwordRequirementItems.forEach((item) => {
    const requirement = item.dataset.requirement;
    const met = Boolean(requirements[requirement]);
    item.classList.toggle("is-met", met);
    item.setAttribute("aria-checked", met ? "true" : "false");
  });
};

if(signupPasswordInput){
  updatePasswordRequirements(signupPasswordInput.value);
  signupPasswordInput.addEventListener("input", (event) => {
    updatePasswordRequirements(event.target.value);
  });
}

const loginChangeEmailBtn = document.getElementById("loginChangeEmailBtn");
if(loginChangeEmailBtn){
  loginChangeEmailBtn?.addEventListener("click", () => showAuthEmailStep({ keepEmail: true }));
}
const signupChangeEmailBtn = document.getElementById("signupChangeEmailBtn");
if(signupChangeEmailBtn){
  signupChangeEmailBtn?.addEventListener("click", () => showAuthEmailStep({ keepEmail: true }));
}

const loginSubmitBtn = document.getElementById("loginSubmitBtn");
if (loginSubmitBtn) {
  loginSubmitBtn?.addEventListener("click", async () => {
    if(!ensureAccountsEnabled()){
      return;
    }
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const token = document.getElementById("loginTotp")?.value.trim();
    if(!email || !password){
      showToast("Email and password required");
      return;
    }
    if(!isBasicEmailValid(email)){
      showToast("Enter a valid email address");
      return;
    }
    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, token, sessionId })
      });
      const data = await resp.json().catch(() => null);
      if(resp.ok && data && data.success){
        if(data.sessionId && data.sessionId !== sessionId){
          sessionStorage.setItem('sessionId', data.sessionId);
          setCookie('sessionId', data.sessionId);
          setTimeout(() => location.reload(), 500);
        }
        showToast("Logged in!");
        hideModal(document.getElementById("authModal"));
        const lbl = document.getElementById('totpLoginLabel');
        if(lbl) lbl.style.display = 'none';
        updateAccountButton({accountsEnabled: true, exists:true, id:data.id, email, totpEnabled: data.totpEnabled});
        fetch('/api/account')
          .then(r => r.ok ? r.json() : null)
          .then(info => { if(info) updateAccountButton(info); });
      } else {
        if(data?.error === 'totp required' || data?.error === 'invalid totp') {
          const lbl = document.getElementById('totpLoginLabel');
          if(lbl) lbl.style.display = 'block';
        }
        showToast(data?.error || "Login failed");
      }
    } catch(err){
      console.error("Login failed", err);
      showToast("Login failed");
    }
  });
}

const accountLogoutBtn = document.getElementById("accountLogoutBtn");
if(accountLogoutBtn){
  accountLogoutBtn?.addEventListener("click", logout);
}

const settingsBtn = document.getElementById("settingsBtn");
if(settingsBtn){
  settingsBtn?.addEventListener("click", openSettingsModal);
}

const aboutModalButton = document.getElementById("aboutModalButton");
const aboutModal = document.getElementById("aboutModal");
const aboutModalIframe = document.getElementById("aboutModalIframe");
const aboutModalCloseBtn = document.getElementById("aboutModalCloseBtn");
if(aboutModalButton && aboutModal){
  aboutModalButton.addEventListener("click", () => {
    if(aboutModalIframe){
      aboutModalIframe.src = "/about.html";
    }
    showModal(aboutModal);
  });
}
if(aboutModalCloseBtn && aboutModal){
  aboutModalCloseBtn.addEventListener("click", () => {
    hideModal(aboutModal);
    if(aboutModalIframe){
      aboutModalIframe.src = "";
    }
  });
}

const archiveChatBtn = document.getElementById("archiveChatBtn");
if(archiveChatBtn){
  archiveChatBtn?.addEventListener("click", archiveCurrentChat);
  updateArchiveChatButton();
}

const enableTotpBtn = document.getElementById('enableTotpBtn');
if(enableTotpBtn){
  enableTotpBtn?.addEventListener('click', async () => {
    if(!ensureAccountsEnabled()){
      return;
    }
    const resp = await fetch('/api/totp/generate');
    const data = await resp.json().catch(() => null);
    if(resp.ok && data){
      document.getElementById('totpSecret').textContent = data.secret;
      document.getElementById('totpSetup').style.display = 'block';
      enableTotpBtn.style.display = 'none';
    } else {
      showToast('Failed to start 2FA setup');
    }
  });
}

const totpVerifyBtn = document.getElementById('totpVerifyBtn');
if(totpVerifyBtn){
  totpVerifyBtn?.addEventListener('click', async () => {
    if(!ensureAccountsEnabled()){
      return;
    }
    const secret = document.getElementById('totpSecret').textContent.trim();
    const token = document.getElementById('totpToken').value.trim();
    const resp = await fetch('/api/totp/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, token })
    });
    const data = await resp.json().catch(() => null);
    if(resp.ok && data && data.success){
      accountInfo.totpEnabled = true;
      document.getElementById('totpSetup').style.display = 'none';
      document.getElementById('totpEnabledMsg').style.display = 'block';
      showToast('2FA enabled');
    } else {
      showToast(data?.error || 'Verification failed');
    }
  });
}



const showChangePasswordBtn = document.getElementById('showChangePasswordBtn');
const passwordForm = document.getElementById('passwordForm');
if(showChangePasswordBtn && passwordForm){
  showChangePasswordBtn?.addEventListener('click', () => {
    passwordForm.style.display = 'block';
    showChangePasswordBtn.style.display = 'none';
  });
}

const changePasswordBtn = document.getElementById('changePasswordBtn');
if(changePasswordBtn){
  changePasswordBtn?.addEventListener('click', async () => {
    if(!ensureAccountsEnabled()){
      return;
    }
    const current = document.getElementById('currentPassword').value;
    const pw = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    if(!current || !pw){
      showToast('All fields required');
      return;
    }
    if(pw.length < MIN_PASSWORD_LENGTH){
      showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if(pw !== confirm){
      showToast('Passwords do not match');
      return;
    }
    const resp = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: pw })
    });
    const data = await resp.json().catch(() => null);
    if(resp.ok && data && data.success){
      showToast('Password updated');
      passwordForm.style.display = 'none';
      showChangePasswordBtn.style.display = 'inline-block';
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    } else {
      showToast(data?.error || 'Failed to update password');
    }
  });
}

const accountTimezoneSelect = document.getElementById('accountTimezone');
if(accountTimezoneSelect){
  const timezoneStatus = document.getElementById('timezoneSaveStatus');
  accountTimezoneSelect.addEventListener('change', async () => {
    if(!ensureAccountsEnabled()){
      updateSettingsStatus(timezoneStatus, 'Sign in required to save.', 'error');
      updateSettingsModalStatus('Sign in required to save timezone.', 'error');
      return;
    }
    const tz = (accountTimezoneSelect.value || '').trim();
    updateSettingsStatus(timezoneStatus, 'Saving...');
    updateSettingsModalStatus('Saving timezone...');
    try {
      const resp = await fetch('/api/account/timezone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz })
      });
      const data = await resp.json().catch(() => null);
      if(resp.ok && data && data.success){
        if(accountInfo) accountInfo.timezone = tz;
        updateSettingsStatus(timezoneStatus, 'Saved', 'success');
        updateSettingsModalStatus('Timezone saved.', 'success');
      } else {
        updateSettingsStatus(timezoneStatus, data?.error || 'Failed to save.', 'error');
        updateSettingsModalStatus(data?.error || 'Failed to save timezone.', 'error');
      }
    } catch (err) {
      console.error('Failed to save timezone', err);
      updateSettingsStatus(timezoneStatus, 'Failed to save.', 'error');
      updateSettingsModalStatus('Failed to save timezone.', 'error');
    }
  });
}

const accountAutoScrollCheck = document.getElementById('accountAutoScrollCheck');
if(accountAutoScrollCheck){
  const autoScrollStatus = document.getElementById('autoScrollSaveStatus');
  accountAutoScrollCheck?.addEventListener('change', async () => {
    chatAutoScroll = accountAutoScrollCheck.checked;
    if(chatAutoScroll){
      setTimeout(scrollChatToBottom, 0);
    }
    updateSettingsStatus(autoScrollStatus, 'Saving...');
    try {
      const ok = await setSetting('chat_auto_scroll', chatAutoScroll);
      if(ok){
        updateSettingsStatus(autoScrollStatus, 'Saved', 'success');
      } else {
        updateSettingsStatus(autoScrollStatus, 'Failed to save.', 'error');
      }
    } catch (err) {
      console.error('Failed to save chat auto-scroll', err);
      updateSettingsStatus(autoScrollStatus, 'Failed to save.', 'error');
    }
  });
}

const collapseReasoningCheck = document.getElementById('collapseReasoningCheck');
if(collapseReasoningCheck){
  const collapseReasoningStatus = document.getElementById('collapseReasoningSaveStatus');
  collapseReasoningCheck?.addEventListener('change', async () => {
    collapseReasoningByDefault = collapseReasoningCheck.checked;
    updateSettingsStatus(collapseReasoningStatus, 'Saving...');
    try {
      const ok = await setSetting('collapse_reasoning_by_default', collapseReasoningByDefault);
      if(ok){
        updateSettingsStatus(collapseReasoningStatus, 'Saved', 'success');
      } else {
        updateSettingsStatus(collapseReasoningStatus, 'Failed to save.', 'error');
      }
    } catch (err) {
      console.error('Failed to save reasoning collapse setting', err);
      updateSettingsStatus(collapseReasoningStatus, 'Failed to save.', 'error');
    }
  });
}

const mobileThinSidebarCheck = document.getElementById('mobileThinSidebarCheck');
if(mobileThinSidebarCheck){
  const mobileSidebarStatus = document.getElementById('mobileSidebarSaveStatus');
  mobileThinSidebarCheck?.addEventListener('change', async () => {
    mobileSidebarToolbar = mobileThinSidebarCheck.checked;
    updateMobileThinSidebar();
    updateSettingsStatus(mobileSidebarStatus, 'Saving...');
    try {
      const ok = await setSetting('mobile_sidebar_toolbar', mobileSidebarToolbar);
      if(ok){
        updateSettingsStatus(mobileSidebarStatus, 'Saved', 'success');
      } else {
        updateSettingsStatus(mobileSidebarStatus, 'Failed to save.', 'error');
      }
    } catch (err) {
      console.error('Failed to save mobile sidebar setting', err);
      updateSettingsStatus(mobileSidebarStatus, 'Failed to save.', 'error');
    }
  });
}

const showArchiveChatButtonCheck = document.getElementById('showArchiveChatButtonCheck');
if(showArchiveChatButtonCheck){
  const archiveChatButtonStatus = document.getElementById('archiveChatButtonSaveStatus');
  showArchiveChatButtonCheck?.addEventListener('change', async () => {
    showArchiveChatButton = showArchiveChatButtonCheck.checked;
    renderSidebarTabs();
    updateSettingsStatus(archiveChatButtonStatus, 'Saving...');
    try {
      const ok = await setSetting('show_archive_chat_button', showArchiveChatButton);
      if(ok){
        updateSettingsStatus(archiveChatButtonStatus, 'Saved', 'success');
      } else {
        updateSettingsStatus(archiveChatButtonStatus, 'Failed to save.', 'error');
      }
    } catch (err) {
      console.error('Failed to save archive chat button setting', err);
      updateSettingsStatus(archiveChatButtonStatus, 'Failed to save.', 'error');
    }
  });
}

document.getElementById("viewTabChat")?.addEventListener("click", () => updateView('chat'));
document.getElementById("viewTabTasks")?.addEventListener("click", () => updateView('tasks'));
document.getElementById("viewTabArchive")?.addEventListener("click", () => updateView('archive'));

// New: Button to toggle top chat tabs bar
const toggleTopChatTabsBtn = document.getElementById("toggleTopChatTabsBtn");
if(toggleTopChatTabsBtn){
  toggleTopChatTabsBtn?.addEventListener("click", async () => {
    topChatTabsBarVisible = !topChatTabsBarVisible;
    const chk = document.getElementById("showTopChatTabsCheck");
    if(chk) chk.checked = topChatTabsBarVisible;
    toggleTopChatTabsVisibility(topChatTabsBarVisible);
    await setSetting("top_chat_tabs_bar_visible", topChatTabsBarVisible);
  });
}

document.getElementById("createSterlingChatBtn")?.addEventListener("click", async () => {
  try {
    const resp = await fetch("/api/createSterlingChat", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({})
    });
    if(!resp.ok){
      alert("Error creating sterling chat");
      return;
    }
    const data = await resp.json();
    if (data.success && data.sterlingUrl) {
      const lbl = document.getElementById("sterlingUrlLabel");
      if (lbl) {
        lbl.innerHTML =
            'Sterling chat: <a href="' + data.sterlingUrl + '" target="_blank">' + data.sterlingUrl + '</a>';
      }
    }
  } catch(e) {
    console.error("CreateSterlingChat call failed:", e);
    alert("Error creating sterling chat");
  }
});

document.getElementById("setProjectBtn")?.addEventListener("click", () => {
  $("#selectedProjectInput").value = "";
  showModal($("#setProjectModal"));
});
document.getElementById("setProjectSaveBtn")?.addEventListener("click", async () => {
  const pName = $("#selectedProjectInput").value.trim();
  if(!pName){
    alert("Please enter a project name.");
    return;
  }
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ key: "sterling_project", value: pName })
  });
  alert("Project set to: " + pName);
  hideModal($("#setProjectModal"));
  await updateProjectInfo();
});
document.getElementById("setProjectCancelBtn")?.addEventListener("click", () => {
  hideModal($("#setProjectModal"));
});

async function updateProjectInfo() {
  try {
    let projectName = "";
    let branch = "";
    const r1 = await fetch("/api/settings/sterling_project");
    if(r1.ok){
      const data = await r1.json();
      projectName = data.value || "";
    }
    if(projectName){
      const r2 = await fetch("/api/projectBranches");
      if(r2.ok){
        const branches = await r2.json();
        const found = branches.find(b => b.project === projectName);
        if(found){
          branch = found.base_branch || "";
        }
      }
    }
    const infoEl = $("#projectInfo");
    if(infoEl){
      if(projectName){
        infoEl.textContent = branch
            ? `Project: ${projectName} (branch: ${branch})`
            : `Project: ${projectName} (no branch set)`;
      } else {
        infoEl.textContent = "(No project set)";
      }
    }
  } catch(e) {
    console.error("Error updating project info:", e);
    const infoEl = $("#projectInfo");
    if(infoEl) infoEl.textContent = "(No project set)";
  }
}

async function projectSearch(){
  const inp = document.getElementById("projectSearchInput");
  if(!inp) return;
  const query = inp.value.trim();
  if(!query) return;
  showPageLoader();
  try {
    const project = await getSetting("sterling_project");
    const resp = await fetch("/api/projectSearch", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ project, query })
    });
    hidePageLoader();
    if(resp.ok){
      const data = await resp.json();
      const pre = document.getElementById("searchResultsPre");
      if(pre) pre.textContent = data.result || "No results.";
      showModal(document.getElementById("searchResultsModal"));
    } else {
      showToast("Search failed");
    }
  } catch(e){
    hidePageLoader();
    console.error("Project search error:", e);
    showToast("Search error");
  }
}

function parseProviderModel(model) {
  if(!model) return { provider: "Unknown", shortModel: "Unknown" };
  if(model.startsWith("openai/")) {
    return { provider: "openai", shortModel: model.replace(/^openai\//,'') };
  } else if(model.startsWith("openrouter/")) {
    return { provider: "openrouter", shortModel: model.replace(/^openrouter\//,'') };
  } else if(model.startsWith("deepseek/")) {
    return { provider: "openrouter", shortModel: model.replace(/^deepseek\//,'') };
  } else if(model.startsWith("anthropic/")) {
    return { provider: "anthropic", shortModel: model.replace(/^anthropic\//,'') };
  } else if(model.startsWith("stable-diffusion/")) {
    return { provider: "stable-diffusion", shortModel: model.replace(/^stable-diffusion\//,'') };
  }
  return { provider: "Unknown", shortModel: model };
}

function formatProviderDisplay(provider) {
  if(!provider || provider === 'Unknown') {
    return { label: '', separator: '' };
  }
  if(provider === 'openrouter') {
    return { label: 'openrouter', separator: ' ' };
  }
  if(provider.startsWith('openrouter/')) {
    return { label: provider.replace(/^openrouter\//, ''), separator: '/' };
  }
  return { label: provider, separator: '/' };
}

const imageModelCosts = {
  "openai/gpt-image-1": 0.04,
  "openai/dall-e-2": 0.016,
  "openai/dall-e-3": 0.08,
  "stable-diffusion": 0
};

function getImageModelCost(modelId){
  if(!modelId) return null;
  const key = modelId.toLowerCase();
  return Object.prototype.hasOwnProperty.call(imageModelCosts, key)
    ? imageModelCosts[key]
    : null;
}

function getModelCost(modelId, inputTokens, outputTokens) {
  if (!window.allAiModels) return null;
  const info = window.allAiModels.find(m => m.id === modelId);
  if (!info) return null;
  const inRate = parseFloat(String(info.inputCost || '').replace('$', ''));
  const outRate = parseFloat(String(info.outputCost || '').replace('$', ''));
  if (isNaN(inRate) || isNaN(outRate)) return null;
  // Pricing data is stored per one million tokens. Adjust calculation
  // accordingly so displayed costs match official rates.
  const cost = (inputTokens / 1_000_000) * inRate +
               (outputTokens / 1_000_000) * outRate;
  return cost;
}

function getEncoding(modelName) {
  console.debug("[Server Debug] Attempting to load tokenizer for model =>", modelName);
  try {
    return encoding_for_model(modelName);
  } catch (e) {
    console.debug("[Server Debug] Tokenizer load failed, falling back to gpt-4.1-mini =>", e.message);
    return encoding_for_model("gpt-4.1-mini");
  }
}

function countTokens(encoder, text) {
  return encoder.encode(text || "").length;
}

async function ensureAiModels(){
  if(!window.allAiModels){
    try {
      const cached = localStorage.getItem('aiModelsCache');
      if(cached){
        const { ts, models } = JSON.parse(cached);
        if(ts && Array.isArray(models) && Date.now() - ts < 60 * 60 * 1000){
          window.allAiModels = models;
        }
      }
    } catch(e){
      console.debug('Failed to load AI models from cache', e);
    }
  }
  if(!window.allAiModels){
    try{
      const resp = await fetch('/api/ai/models');
      if(resp.ok){
        const data = await resp.json();
        window.allAiModels = data.models || [];
        try {
          localStorage.setItem('aiModelsCache', JSON.stringify({ts: Date.now(), models: window.allAiModels}));
        } catch(e){
          console.debug('Failed to store AI models cache', e);
        }
      } else {
        window.allAiModels = [];
      }
    }catch(e){
      console.error('Error loading models:', e);
      window.allAiModels = [];
    }
  }
}

function isModelFavorite(id){
  if(!window.allAiModels) return false;
  const info = window.allAiModels.find(m => m.id === id);
  return info ? !!info.favorite : false;
}

async function toggleModelFavorite(id, fav){
  try{
    const r = await fetch('/api/ai/favorites', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({modelId: id, favorite: fav})
    });
    if(r.ok){
      if(window.allAiModels){
        const idx = window.allAiModels.findIndex(m=>m.id===id);
        if(idx>=0){
          window.allAiModels[idx].favorite = fav;
        } else {
          window.allAiModels.push({id, favorite: fav});
        }
      }
      return true;
    }
  }catch(e){
    console.error('Error toggling favorite:', e);
  }
  return false;
}

const chatInputEl = document.getElementById("chatInput");
const chatSendBtnEl = document.getElementById("chatSendBtn");
const chatRepeatBtnEl = document.getElementById("chatRepeatBtn");
const sendBtnDefaultHtml = chatSendBtnEl.innerHTML;
const stopBtnHtml = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-square"><rect x="6" y="6" width="12" height="12"></rect></svg>';
chatSendBtnEl.dataset.mode = 'send';
const waitingElem = document.getElementById("waitingCounter");
const scrollDownBtnEl = document.getElementById("scrollDownBtn");
const tokenCounterEl = document.getElementById("inputTokenCount");

const designLastMessagesByTab = new Map();

function getDesignLastMessage(tabId){
  if(!tabId) return "";
  return designLastMessagesByTab.get(tabId) || "";
}

function setDesignLastMessage(tabId, message){
  if(!tabId) return;
  if(message){
    designLastMessagesByTab.set(tabId, message);
  } else {
    designLastMessagesByTab.delete(tabId);
  }
}

function updateRepeatButtonVisibility(){
  if(!chatRepeatBtnEl) return;
  const isDesign = currentTabType === 'design';
  chatRepeatBtnEl.hidden = !isDesign;
  chatRepeatBtnEl.style.display = isDesign ? '' : 'none';
  const lastMessage = isDesign ? getDesignLastMessage(currentTabId) : "";
  const canRepeat = isDesign && !!lastMessage && chatSendBtnEl.dataset.mode === 'send' && !chatSendBtnEl.disabled;
  chatRepeatBtnEl.disabled = !canRepeat;
}

if(chatRepeatBtnEl){
  chatRepeatBtnEl?.addEventListener("click", () => {
    if(currentTabType !== 'design') return;
    const lastMessage = getDesignLastMessage(currentTabId);
    if(!lastMessage) return;
    if(chatSendBtnEl.dataset.mode !== 'send') return;
    if(chatSendBtnEl.disabled) return;
    chatInputEl.value = lastMessage;
    updateInputTokenCount();
    chatSendBtnEl.click();
  });
}

function updateInputTokenCount(){
  if(!tokenCounterEl) return;
  try{
    const enc = getEncoding(modelName);
    const count = countTokens(enc, chatInputEl.value);
    tokenCounterEl.textContent = `${count} token${count===1?'':'s'}`;
  }catch(e){
    tokenCounterEl.textContent = '';
  }
}

chatInputEl?.addEventListener("input", updateInputTokenCount);
updateInputTokenCount();
updateRepeatButtonVisibility();

setLoopUi(imageLoopEnabled);

// Keep a history of user-entered messages for quick recall
let inputHistory = [];
let inputHistoryPos = -1;

if (scrollDownBtnEl) {
  scrollDownBtnEl?.addEventListener("click", () => {
    const chatMessagesEl = document.getElementById("chatMessages");
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    setTimeout(() => scrollChatToBottom(true), 0);
  });
}

chatInputEl?.addEventListener("keydown", (e) => {
  if (enterSubmitsMessage && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if(chatSendBtnEl.dataset.mode !== 'send'){
      if(chatQueueEnabled){
        queueMessage(chatInputEl.value.trim());
        chatInputEl.value = "";
        updateInputTokenCount();
      }
      return;
    }
    if(chatSendBtnEl.disabled && chatQueueEnabled){
      queueMessage(chatInputEl.value.trim());
      chatInputEl.value = "";
      updateInputTokenCount();
    } else {
      chatSendBtnEl.click();
    }
  }
});

chatSendBtnEl?.addEventListener("click", async () => {
  if(chatSendBtnEl.dataset.mode === 'stop'){
    if(currentChatAbort){
      currentChatAbort.abort();
    }
    chatSendBtnEl.disabled = true;
    updateRepeatButtonVisibility();
    return;
  }
  const chatMessagesEl = document.getElementById("chatMessages");
  const placeholderEl = document.getElementById("chatPlaceholder");
  const userMessage = chatInputEl.value.trim();
  if(!userMessage && pendingImages.length===0) return;
  renderDesignSuggestions(false);
  chatSendBtnEl.disabled = true;
  markTabProcessing(currentTabId, true);
  if(userMessage){
    inputHistory.push(userMessage);
    inputHistoryPos = -1;
    if(currentTabType === 'design'){
      setDesignLastMessage(currentTabId, userMessage);
    }
  }
  updateRepeatButtonVisibility();

  if (favElement) favElement.href = rotatingFavicon;

  // 1) If there are images pending, process them to get descriptions and
  //    collect info for showing thumbnails in the chat history.
  let descsForThisSend = [];
  let imageInfosForThisSend = [];
  if(pendingImages.length>0){
    // Show the loading indicator for image processing
    const loaderEl = document.getElementById("imageProcessingIndicator");
    if(loaderEl) {
      loaderEl.style.display = "";
      scrollChatToBottom();
    }
    // Disable send button while images upload
    chatSendBtnEl.disabled = true;

    try {
      for(const f of pendingImages){
        try {
          const formData = new FormData();
          formData.append("imageFile", f);
          if(userMessage) formData.append("userInput", userMessage);
          let uploadResp = await fetch(`/api/chat/image?tabId=${currentTabId}`, {
            method: "POST",
            body: formData
          });
          if(!uploadResp.ok){
            console.error("Image upload error, status:", uploadResp.status);
          } else {
            const json = await uploadResp.json();
            if(json.desc){
              // Show bracketed text with filename
              descsForThisSend.push(`[filename: ${json.filename}] [desc: ${json.desc}]`);
              imageInfosForThisSend.push({
                url: `/uploads/${json.filename}`,
                desc: json.desc
              });
            }
          }
        } catch(e){
          console.error("Error uploading image:", e);
        }
      }
    } finally {
      // Hide the loading indicator
      if(loaderEl) {
        loaderEl.style.display = "none";
        scrollChatToBottom();
      }
      // Send button remains disabled until streaming completes
    }

    // Clear the buffer for images
    pendingImages = [];
    updateImagePreviewList();
  }

  // If user typed nothing but we have desc subbubbles, we can still show them in a single bubble
  if(!userMessage && descsForThisSend.length>0){
    chatInputEl.value = "";
    updateInputTokenCount();
  } else if(!userMessage && descsForThisSend.length===0){
    if (favElement) favElement.href = defaultFavicon;
    chatSendBtnEl.disabled = false;
    markTabProcessing(currentTabId, false);
    processNextQueueMessage();
    updateRepeatButtonVisibility();
    return;
  }

  chatInputEl.value = "";
  updateInputTokenCount();

  // Create the single chat-sequence
  const seqDiv = document.createElement("div");
  seqDiv.className = "chat-sequence";

  // The user bubble
  const userDiv = document.createElement("div");
  userDiv.className = "chat-user";

  const userHead = document.createElement("div");
  userHead.className = "bubble-header";
  const userLabel = "You";
  userHead.innerHTML = `
    <div class="name-oval name-oval-user">${userLabel}</div>
  `;
  userDiv.appendChild(userHead);

  // Show thumbnails for uploaded images
  imageInfosForThisSend.forEach(info => {
    const img = document.createElement("img");
    img.src = info.url;
    img.alt = info.desc;
    img.className = "user-image-thumb";
    userDiv.appendChild(img);
  });

  // For each image desc, also add text subbubble
    descsForThisSend.forEach(d => {
      const descBubble = document.createElement("div");
      descBubble.className = "user-subbubble";
      descBubble.innerHTML = formatCodeBlocks(d);
      addCodeCopyButtons(descBubble);
      descBubble.style.marginBottom = "8px";
      descBubble.style.borderLeft = "2px solid #ccc";
      descBubble.style.paddingLeft = "6px";
      userDiv.appendChild(descBubble);
    });

  // Then the user's typed text as last subbubble
    if(userMessage){
      const userBody = document.createElement("div");
      userBody.className = "user-subbubble";
      userBody.innerHTML = formatCodeBlocks(userMessage);
      addCodeCopyButtons(userBody);
      userDiv.appendChild(userBody);
    }

  seqDiv.appendChild(userDiv);

  if(!aiResponsesEnabled){
    if(placeholderEl) placeholderEl.style.display = "none";
    appendChatElement(seqDiv);
    if(chatAutoScroll) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    chatSendBtnEl.disabled = false;
    markTabProcessing(currentTabId, false);
    processNextQueueMessage();
    return;
  }

  // The AI bubble
  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  const { shortModel: pendingShortModel } = parseProviderModel(modelName);
  const pendingTitle = pendingShortModel || modelName;
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai" title="${pendingTitle}">${window.agentName}</div>
    <span style="opacity:0.8;">…</span>
  `;
  botDiv.appendChild(botHead);

  const botBody = document.createElement("div");
  const botTextSpan = document.createElement("span");
  botTextSpan.textContent = "Thinking…";
  botBody.appendChild(botTextSpan);
  botDiv.appendChild(botBody);

  seqDiv.appendChild(botDiv);
  if(placeholderEl) placeholderEl.style.display = "none";
  appendChatElement(seqDiv);
  if(chatAutoScroll){
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    // After the AI response has fully rendered, scroll once more
    // with a slight delay to ensure any late DOM updates are captured.
    setTimeout(scrollChatToBottom, 1000);
  }

  let combinedUserText = "";
  if(descsForThisSend.length>0){
    combinedUserText = descsForThisSend.join("\n") + "\n\n";
  }
  if(userMessage){
    combinedUserText += userMessage;
  }

  let partialText = "";
  let reasoningText = "";
  let contentText = "";
  let streamBuffer = "";
  let rawResponseText = "";
  let isReasoningStream = false;
  let finalResponseText = "";
  let waitTime=0;
  waitingElem.textContent = "Waiting: 0.0s";
  const waitInterval = setInterval(()=>{
    waitTime+=0.1;
    waitingElem.textContent = `Waiting: ${waitTime.toFixed(1)}s`;
  }, 100);

  // Start an animated ellipsis loader that appends dots to the bot's text
  let ellipsisStep = 0;
  const ellipsisInterval = setInterval(() => {
    const dots = '.'.repeat((ellipsisStep % 3) + 1);
    ellipsisStep++;
    botTextSpan.textContent = stripPlaceholderImageLines(partialText) + dots;
    if(chatAutoScroll) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }, 500);

  const controller = new AbortController();
  currentChatAbort = controller;
  chatSendBtnEl.disabled = false;
  chatSendBtnEl.dataset.mode = 'stop';
  chatSendBtnEl.classList.add('stop-btn');
  chatSendBtnEl.innerHTML = stopBtnHtml;
  updateRepeatButtonVisibility();

  let usageLimitType = null;
  let usageLimitMessage = '';
  try {
    const userTime = new Date().toISOString();
    const resp = await fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:combinedUserText, tabId: currentTabId, userTime, sessionId}),
      signal: controller.signal
    });
    clearInterval(waitInterval);
    waitingElem.textContent = "";

    if(!resp.ok){
      const rawErrorText = await resp.text().catch(() => "");
      let parsedError = null;
      if(rawErrorText){
        try {
          parsedError = JSON.parse(rawErrorText);
        } catch(parseErr) {
          parsedError = null;
        }
      }
      const message = parsedError?.error || rawErrorText || `Request failed (${resp.status})`;
      const type = parsedError?.type || (resp.status === 429 ? 'search' : null);
      usageLimitMessage = message;
      const isSearchModel = (typeof modelName === 'string' && (modelName === DEFAULT_SEARCH_MODEL || modelName.includes('search-preview')));
      if (type === 'search' || (resp.status === 429 && isSearchModel)) {
        usageLimitType = 'search';
        showUsageLimitModal('search', message);
      }
      throw Object.assign(new Error(message), { usageLimitType, usageLimitMessage: message });
    }
    const contentType = resp.headers.get("content-type") || "";
    isReasoningStream = contentType.includes("application/x-ndjson");
    const decoder = new TextDecoder();
    const reader = resp.body && typeof resp.body.getReader === 'function'
      ? resp.body.getReader()
      : null;
    if(!reader){
      throw new Error('Readable stream missing from response.');
    }
    const isReasoningNdjsonPayload = (parsed) => {
      if(!parsed) return false;
      if(["reasoning", "content", "final"].includes(parsed.type)) return true;
      return typeof parsed.reasoning === "string" || typeof parsed.content === "string";
    };
    const handleReasoningLine = (line) => {
      if(!line.trim()) return;
      let parsed = null;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        contentText += line;
        return;
      }
      if(parsed?.type === "reasoning"){
        reasoningText += parsed.text || "";
      } else if(parsed?.type === "content"){
        contentText += parsed.text || "";
      } else if(parsed?.type === "final"){
        reasoningText += parsed.reasoning || "";
        contentText += parsed.content || "";
      } else if(typeof parsed?.text === "string") {
        contentText += parsed.text;
      }
    };

    while(true){
      const { value, done } = await reader.read();
      if(done) break;
      const chunkText = decoder.decode(value, { stream: true });
      if(isReasoningStream){
        streamBuffer += chunkText;
        const lines = streamBuffer.split("\n");
        streamBuffer = lines.pop() || "";
        lines.forEach(line => {
          handleReasoningLine(line);
          renderAssistantContentParts(botBody, reasoningText, contentText, { defaultReasoningCollapsed: collapseReasoningByDefault });
        });
      } else {
        rawResponseText += chunkText;
        if(rawResponseText.includes("\n")){
          const lines = rawResponseText.split("\n");
          const remainder = lines.pop() || "";
          const detected = lines.some(line => {
            if(!line.trim()) return false;
            try {
              return isReasoningNdjsonPayload(JSON.parse(line));
            } catch (err) {
              return false;
            }
          });
          if(detected){
            isReasoningStream = true;
            streamBuffer = remainder;
            reasoningText = "";
            contentText = "";
            botBody.innerHTML = "";
            lines.forEach(line => handleReasoningLine(line));
            renderAssistantContentParts(botBody, reasoningText, contentText, { defaultReasoningCollapsed: collapseReasoningByDefault });
            continue;
          }
          rawResponseText = lines.concat(remainder).join("\n");
        }
        partialText = rawResponseText;
        renderAssistantContent(botBody, partialText, modelName);
      }
    }
    // Update once more without the loader after streaming finishes
    if(isReasoningStream){
      if(streamBuffer.trim()){
        try {
          const parsed = JSON.parse(streamBuffer);
          if(parsed?.type === "reasoning"){
            reasoningText += parsed.text || "";
          } else if(parsed?.type === "content"){
            contentText += parsed.text || "";
          } else if(parsed?.type === "final"){
            reasoningText += parsed.reasoning || "";
            contentText += parsed.content || "";
          }
        } catch (err) {
          contentText += streamBuffer;
        }
      }
      renderAssistantContentParts(botBody, reasoningText, contentText, {
        defaultReasoningCollapsed: collapseReasoningByDefault,
        resetReasoningExpanded: true
      });
      addFilesFromCodeBlocks(contentText);
      finalResponseText = contentText;
    } else {
      renderAssistantContent(botBody, partialText, modelName, { resetReasoningExpanded: true });
      addFilesFromCodeBlocks(partialText);
      finalResponseText = partialText;
    }
    if(chatAutoScroll) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    clearInterval(ellipsisInterval);
    botHead.querySelector("span").textContent = formatTimestamp(new Date().toISOString());
    // Refresh usage counters so search/session counts update immediately
    // (ensures UI shows latest counts without requiring a full page reload)
    try { updateUsageLimitInfo(); } catch (err) { console.warn('Failed to refresh usage counters', err); }
  } catch(e) {
    clearInterval(waitInterval);
    clearInterval(ellipsisInterval);
    waitingElem.textContent = "";
    if(e.name === 'AbortError'){
      botTextSpan.textContent = "[User Halted]";
      try {
        const r = await fetch(`/api/chat/history?tabId=${currentTabId}&limit=1&offset=0&sessionId=${encodeURIComponent(sessionId)}`);
        const data = await r.json().catch(()=>null);
        const pid = data?.pairs?.[0]?.id;
        if(pid){
          await fetch(`/api/chat/pair/${pid}/ai`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:'[User Halted]'}) });
        }
      } catch(err){ console.error('Update halted pair failed', err); }
    } else if(e.usageLimitMessage || usageLimitMessage){
      botTextSpan.textContent = e.usageLimitMessage || usageLimitMessage;
    } else {
      botTextSpan.textContent = "[Error contacting AI]";
    }
    botHead.querySelector("span").textContent = formatTimestamp(new Date().toISOString());
  }

  // Code previously auto-created a task for every chat pair.
  // This behavior remains disabled to avoid cluttering the task list.

  try {
    await loadChatHistory(currentTabId, true);
    await loadTabs();
  } catch(err){
    console.error('Refresh after chat send failed', err);
  }
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  updatePageTitle();
  if(finalResponseText){
    actionHooks.forEach(h => {
      if(typeof h.fn === "function"){
        try { h.fn({type:"afterSend", message: combinedUserText, response: finalResponseText}); }
        catch(err){ console.error("Action hook error:", err); }
      }
    });
  }

  if (favElement) favElement.href = defaultFavicon;

  if(chatAutoScroll){
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    setTimeout(scrollChatToBottom, 0);
  }
  chatSendBtnEl.disabled = false;
  chatSendBtnEl.dataset.mode = 'send';
  chatSendBtnEl.classList.remove('stop-btn');
  chatSendBtnEl.innerHTML = sendBtnDefaultHtml;
  currentChatAbort = null;
  markTabProcessing(currentTabId, false);
  processNextQueueMessage();
  updateRepeatButtonVisibility();
});

async function openChatSettings(){
  showPageLoader();
  const r = await fetch("/api/settings/chat_hide_metadata");
  if(r.ok){
    const { value } = await r.json();
    if(typeof value !== "undefined"){
      chatHideMetadata = !!value;
    } else {
      chatHideMetadata = true;
    }
  } else {
    chatHideMetadata = true;
    await setSetting("chat_hide_metadata", chatHideMetadata);
  }

  const r2 = await fetch("/api/settings/chat_tab_auto_naming");
  if(r2.ok){
    const { value } = await r2.json();
    chatTabAutoNaming = !!value;
  }

  // Always hide token counts for now
  showSubbubbleToken = false;

  const r4 = await fetch("/api/settings/sterling_chat_url_visible");
  if(r4.ok){
    const { value } = await r4.json();
    sterlingChatUrlVisible = value !== false;
  } else {
    sterlingChatUrlVisible = true;
    await setSetting("sterling_chat_url_visible", sterlingChatUrlVisible);
  }

  const rInfo = await fetch("/api/settings/project_info_bar_visible");
  if(rInfo.ok){
    const { value } = await rInfo.json();
    projectInfoBarVisible = value !== false;
  }

  try {
    const r5 = await fetch("/api/settings/chat_streaming");
    if(r5.ok){
      const { value } = await r5.json();
      chatStreaming = (value !== false);
    }
    $("#chatStreamingCheck").checked = chatStreaming;
  } catch(e) {
    console.error("Error loading chat_streaming:", e);
    chatStreaming = true;
  }

  const r6 = await fetch("/api/settings/markdown_panel_visible");
  if(r6.ok){
    const { value } = await r6.json();
    markdownPanelVisible = !!value;
  }

  let rMosaic = await fetch(`/api/settings/${mosaicKey(currentTabId)}`);
  if(rMosaic.ok){
    const { value } = await rMosaic.json();
    if(typeof value !== "undefined"){
      mosaicPanelVisible = !!value;
    } else {
      const rDef = await fetch("/api/settings/mosaic_panel_visible");
      if(rDef.ok){
        const { value: defVal } = await rDef.json();
        mosaicPanelVisible = !!defVal;
      }
    }
  } else {
    const rDef = await fetch("/api/settings/mosaic_panel_visible");
    if(rDef.ok){
      const { value: defVal } = await rDef.json();
      mosaicPanelVisible = !!defVal;
    }
  }

  const rSub = await fetch("/api/settings/subroutine_panel_visible");
  if(rSub.ok){
    const { value } = await rSub.json();
    subroutinePanelVisible = !!value;
  }

  const r7 = await fetch("/api/settings/enter_submits_message");
  if(r7.ok){
    const { value } = await r7.json();
    enterSubmitsMessage = (value !== false);
  } else {
    enterSubmitsMessage = true;
    await setSetting("enter_submits_message", enterSubmitsMessage);
  }

  const rQueue = await fetch("/api/settings/chat_queue_enabled");
  if(rQueue.ok){
    const { value } = await rQueue.json();
    chatQueueEnabled = value !== false;
  }

  const r8 = await fetch("/api/settings/nav_menu_visible");
  if(r8.ok){
    const { value } = await r8.json();
    navMenuVisible = value !== false;
  }

  const rTopTabs = await fetch("/api/settings/top_chat_tabs_bar_visible");
  if(rTopTabs.ok){
    const { value } = await rTopTabs.json();
    topChatTabsBarVisible = value !== false;
  }
  const rViewTabs = await fetch("/api/settings/view_tabs_bar_visible");
  if(rViewTabs.ok){
    const { value } = await rViewTabs.json();
    viewTabsBarVisible = !!value;
  }
  
  const rDepsFlag = await fetch("/api/settings/show_dependencies_column");
  if(rDepsFlag.ok){
    const { value } = await rDepsFlag.json();
    showDependenciesColumn = !!value;
  }
  const rImgSvc = await fetch("/api/settings/image_gen_service");
  if(rImgSvc.ok){
    const { value } = await rImgSvc.json();
    if(value) imageGenService = value;
  }
  const rImgModel = await fetch("/api/settings/image_gen_model");
  if(rImgModel.ok){
    const { value } = await rImgModel.json();
    if(value) imageGenModel = value;
  }

  const imgSvcSel = document.getElementById("imageServiceSelect");
  if(imgSvcSel) imgSvcSel.value = imageGenService;

  $("#hideMetadataCheck").checked = chatHideMetadata;
  $("#autoNamingCheck").checked = chatTabAutoNaming;
  const subbubbleTokenCheckEl = $("#subbubbleTokenCheck");
  if(subbubbleTokenCheckEl) subbubbleTokenCheckEl.checked = showSubbubbleToken;
  $("#sterlingUrlCheck").checked = sterlingChatUrlVisible;
  $("#showProjectInfoCheck").checked = projectInfoBarVisible;
  const auroraProjectBarCheckEl = $("#showAuroraProjectBarCheck");
  if(auroraProjectBarCheckEl){
    auroraProjectBarCheckEl.checked = !FORCE_HIDE_PROJECT_BAR && auroraProjectBarVisible;
    auroraProjectBarCheckEl.disabled = FORCE_HIDE_PROJECT_BAR;
    if(FORCE_HIDE_PROJECT_BAR){
      const label = auroraProjectBarCheckEl.closest("label");
      if(label){
        label.style.display = "none";
      }
    }
  }
  const markdownCheck = document.getElementById("showMarkdownTasksCheck");
  if(markdownCheck) markdownCheck.checked = markdownPanelVisible;
  $("#showDependenciesColumnCheck").checked = showDependenciesColumn;
  const subroutineCheck = document.getElementById("showSubroutinePanelCheck");
  if(subroutineCheck) subroutineCheck.checked = subroutinePanelVisible;
  $("#showMosaicPanelCheck").checked = mosaicPanelVisible;
  updateMosaicPanelVisibility();
  $("#enterSubmitCheck").checked = enterSubmitsMessage;
  $("#chatQueueCheck").checked = chatQueueEnabled;
  $("#showNavMenuCheck").checked = navMenuVisible;
  $("#showTopChatTabsCheck").checked = topChatTabsBarVisible;
  $("#showViewTabsBarCheck").checked = viewTabsBarVisible;
  $("#showArchivedTabsCheck").checked = showArchivedTabs;
  $("#tabGenerateImagesCheck").checked = tabGenerateImages;
  $("#tabGenerateImagesCheck").disabled = currentTabType !== 'design';
  // Disable image loop controls
  imageLoopEnabled = false;
  $("#imageLoopCheck").checked = false;
  $("#imageLoopCheck").disabled = true;
  $("#imageLoopMessageInput").value = imageLoopMessage;
  $("#imageLoopMessageInput").disabled = true;

  try {
    await ensureAiModels();

      const aiModelSelect = $("#aiModelSelect");

      function updateAiModelSelect() {
        aiModelSelect.innerHTML = "";
        const filterFav = $("#favoritesOnlyModelCheck").checked;
        const providerFilterSel = $("#aiModelProviderSelect");
        let selectedProvider = providerFilterSel ? providerFilterSel.value : "";

        let filtered = window.allAiModels.slice();
        if(filterFav) {
          filtered = filtered.filter(m => m.favorite);
        }
        if(selectedProvider) {
          filtered = filtered.filter(m => (m.provider === selectedProvider));
        }

        const showPrices = accountInfo && accountInfo.id === 1;
        filtered.forEach(m => {
          const label = showPrices
              ? `${m.id} (limit ${m.tokenLimit}, in ${m.inputCost}, out ${m.outputCost})`
              : `${m.id} (limit ${m.tokenLimit})`;
          aiModelSelect.appendChild(new Option(label, m.id));
        });
      }

      updateAiModelSelect();

      $("#favoritesOnlyModelCheck").addEventListener("change", () => {
        updateAiModelSelect();
      });

      const providerSel = $("#aiModelProviderSelect");
      if (providerSel) {
        providerSel?.addEventListener("change", () => {
          updateAiModelSelect();
        });
      }

      const currentModel = await getSetting("ai_model");
      if(currentModel) aiModelSelect.value = currentModel;
  } catch(e){
    console.error("Error populating AI service/model lists:", e);
  } finally {
    hidePageLoader();
  }

  showModal($("#chatSettingsModal"));
}

$("#chatSettingsBtn").addEventListener("click", async () => {
  if(!localStorage.getItem("chatSettingsBetaAck")){
    showModal($("#chatSettingsBetaModal"));
    return;
  }
  await openChatSettings();
});

const betaCheck = document.getElementById("ackChatSettingsBetaCheck");
const betaContinue = document.getElementById("chatSettingsBetaContinueBtn");
const betaCancel = document.getElementById("chatSettingsBetaCancelBtn");

if(betaCheck && betaContinue){
  betaCheck?.addEventListener("change", e => {
    betaContinue.disabled = !e.target.checked;
  });
}

if(betaCancel){
  betaCancel?.addEventListener("click", () => {
    hideModal($("#chatSettingsBetaModal"));
  });
}

if(betaContinue){
  betaContinue?.addEventListener("click", async () => {
    if(!betaCheck.checked) return;
    localStorage.setItem("chatSettingsBetaAck", "true");
    hideModal($("#chatSettingsBetaModal"));
    await openChatSettings();
  });
}

// React when AI service changes
$("#aiServiceSelect").addEventListener("change", async ()=>{
  try {
    await ensureAiModels();

      const aiModelSelect = $("#aiModelSelect");

      function updateAiModelSelect() {
        aiModelSelect.innerHTML = "";
        const filterFav = $("#favoritesOnlyModelCheck").checked;
        const providerFilterSel = $("#aiModelProviderSelect");
        let selectedProvider = providerFilterSel ? providerFilterSel.value : "";

        let filtered = window.allAiModels.slice();
        if(filterFav) {
          filtered = filtered.filter(m => m.favorite);
        }
        if(selectedProvider) {
          filtered = filtered.filter(m => (m.provider === selectedProvider));
        }

        const showPrices = accountInfo && accountInfo.id === 1;
        filtered.forEach(m => {
          const label = showPrices
              ? `${m.id} (limit ${m.tokenLimit}, in ${m.inputCost}, out ${m.outputCost})`
              : `${m.id} (limit ${m.tokenLimit})`;
          aiModelSelect.appendChild(new Option(label, m.id));
        });
      }
      updateAiModelSelect();

      const currentModel = await getSetting("ai_model");
      if(currentModel) aiModelSelect.value = currentModel;
  } catch(e){
    console.error("Error populating AI service/model lists:", e);
  }
});

async function chatSettingsSaveFlow() {
  chatHideMetadata = $("#hideMetadataCheck").checked;
  chatTabAutoNaming = $("#autoNamingCheck").checked;
  const subbubbleTokenEl = $("#subbubbleTokenCheck");
  showSubbubbleToken = subbubbleTokenEl ? subbubbleTokenEl.checked : false;
  sterlingChatUrlVisible = $("#sterlingUrlCheck").checked;
  projectInfoBarVisible = $("#showProjectInfoCheck").checked;
  auroraProjectBarVisible = FORCE_HIDE_PROJECT_BAR ? false : $("#showAuroraProjectBarCheck").checked;
  chatStreaming = $("#chatStreamingCheck").checked;
  const markdownCheck = document.getElementById("showMarkdownTasksCheck");
  if(markdownCheck) markdownPanelVisible = markdownCheck.checked;
  showDependenciesColumn = $("#showDependenciesColumnCheck").checked;
  const subroutineCheck = document.getElementById("showSubroutinePanelCheck");
  if(subroutineCheck) subroutinePanelVisible = subroutineCheck.checked;
  mosaicPanelVisible = $("#showMosaicPanelCheck").checked;
  updateMosaicPanelVisibility();
  enterSubmitsMessage = $("#enterSubmitCheck").checked;
  chatQueueEnabled = $("#chatQueueCheck").checked;
  navMenuVisible = $("#showNavMenuCheck").checked;
  topChatTabsBarVisible = $("#showTopChatTabsCheck").checked;
  viewTabsBarVisible = $("#showViewTabsBarCheck").checked;
  showArchivedTabs = $("#showArchivedTabsCheck").checked;
  // Force image loop mode off
  imageLoopEnabled = false;
  $("#imageLoopCheck").checked = false;
  $("#imageLoopMessageInput").disabled = true;
  imageLoopMessage = $("#imageLoopMessageInput").value.trim() || imageLoopMessage;

  imageGenService = $("#imageServiceSelect").value;
  const serviceSel = $("#aiServiceSelect").value;
  const modelSel = $("#aiModelSelect").value;

  await setSettings({
    chat_hide_metadata: chatHideMetadata,
    chat_tab_auto_naming: chatTabAutoNaming,
    show_subbubble_token_count: showSubbubbleToken,
    sterling_chat_url_visible: sterlingChatUrlVisible,
    project_info_bar_visible: projectInfoBarVisible,
    aurora_project_bar_visible: auroraProjectBarVisible,
    chat_streaming: chatStreaming,
    markdown_panel_visible: markdownPanelVisible,
    subroutine_panel_visible: subroutinePanelVisible,
    mosaic_panel_visible: mosaicPanelVisible,
    enter_submits_message: enterSubmitsMessage,
    chat_queue_enabled: chatQueueEnabled,
    nav_menu_visible: navMenuVisible,
    top_chat_tabs_bar_visible: topChatTabsBarVisible,
    view_tabs_bar_visible: viewTabsBarVisible,
    show_archived_tabs: showArchivedTabs,
    show_dependencies_column: showDependenciesColumn,
    image_gen_service: imageGenService,
    ai_service: serviceSel
  });

  if(currentTabId){
    await setSetting(mosaicKey(currentTabId), mosaicPanelVisible);
  }

  if (modelSel.trim()) {
    await setSetting("ai_model", modelSel.trim());
  }

  const updatedModelResp = await fetch("/api/model");
  console.debug("[Client Debug] /api/model => status:", updatedModelResp.status);
  if(updatedModelResp.ok){
    const updatedModelData = await updatedModelResp.json();
    console.debug("[Client Debug] /api/model data =>", updatedModelData);
    modelName = updatedModelData.model || "unknown";
    const { provider: autoProvider } = parseProviderModel(modelName);
    console.log("[OBTAINED PROVIDER] => (global model removed in UI)");
    console.log("[OBTAINED PROVIDER] =>", autoProvider);
    updateModelHud();
  }

  hideModal($("#chatSettingsModal"));
  await loadChatHistory(currentTabId, true);
  toggleSterlingUrlVisibility(sterlingChatUrlVisible);
  toggleProjectInfoBarVisibility(projectInfoBarVisible && auroraProjectBarVisible);
  toggleNavMenuVisibility(navMenuVisible);
  toggleTopChatTabsVisibility(topChatTabsBarVisible);
  toggleViewTabsBarVisibility(viewTabsBarVisible);
  const pnl = document.getElementById("taskListPanel");
  if(pnl) pnl.style.display = markdownPanelVisible ? "" : "none";
  const subPanel = document.getElementById("chatSubroutinesPanel");
  if(subPanel) subPanel.style.display = subroutinePanelVisible ? "" : "none";
  updateMosaicPanelVisibility();
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  renderHeader();
  renderBody();
  setLoopUi(imageLoopEnabled);
  if(imageLoopEnabled && accountInfo && accountInfo.id === 1){
    setTimeout(runImageLoop, 0);
  }
}

$("#chatSettingsSaveBtn").addEventListener("click", chatSettingsSaveFlow);

$("#chatSettingsCancelBtn").addEventListener("click", () => {
  hideModal($("#chatSettingsModal"));
});

function toggleSterlingUrlVisibility(visible) {
  const el = document.getElementById("sterlingUrlLabel");
  if(!el) return;
  const shouldShow = visible && !FORCE_HIDE_PROJECT_BAR && auroraProjectBarVisible;
  el.style.display = shouldShow ? "inline" : "none";
}

function toggleProjectInfoBarVisibility(visible){
  const shouldShow = !FORCE_HIDE_PROJECT_BAR && visible && auroraProjectBarVisible;
  const ids = ["projectBar", "projectInfo", "projectSearchInput", "projectSearchBtn",
               "setProjectBtn", "createSterlingChatBtn", "changeSterlingBranchBtn"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = shouldShow ? "" : "none";
  });
  const urlEl = document.getElementById("sterlingUrlLabel");
  if(urlEl) urlEl.style.display = shouldShow && sterlingChatUrlVisible ? "inline" : "none";
}

function toggleNavMenuVisibility(visible) {
  const navEl = document.querySelector("nav.tree-menu");
  const spinner = document.getElementById("navSpinner");
  const skeleton = document.getElementById("navSkeletonList");
  if(!navEl) return;
  if(navMenuLoading){
    navEl.style.display = "none";
    if(spinner) spinner.style.display = "";
    if(skeleton) skeleton.style.display = visible ? "" : "none";
    return;
  }
  if(spinner) spinner.style.display = "none";
  if(skeleton) skeleton.style.display = "none";
  navEl.style.display = visible ? "" : "none";
}

function toggleTopChatTabsVisibility(visible) {
  const topTabs = document.getElementById("chatTabs");
  const btn = document.getElementById("toggleTopChatTabsBtn");
  if(!topTabs) return;
  topTabs.style.display = visible ? "" : "none";
  if(btn) btn.textContent = visible ? "Hide top chat tabs bar" : "Show top chat tabs bar";
}

function toggleViewTabsBarVisibility(visible) {
  const bar = document.getElementById("viewTabsBar");
  if(!bar) return;
  bar.style.display = visible ? "" : "none";
}

function toggleSessionIdVisibility(visible) {
  const el = document.getElementById("sessionIdText");
  if(!el) return;
  el.style.display = visible ? "inline" : "none";
}

function updateMobileThinSidebar(){
  const thin = document.getElementById("thinSidebar");
  const logo = document.getElementById("collapsedSidebarLogo");
  if(!thin || !logo) return;
  if(isEmbedded){
    thin.style.display = "none";
    logo.style.display = "none";
    return;
  }
  if(isMobileViewport()){
    if(mobileSidebarToolbar){
      thin.style.display = "";
      logo.style.left = "8px";
      logo.style.right = "";
    } else {
      thin.style.display = "none";
      logo.style.left = "auto";
      logo.style.right = "56px";
    }
  } else {
    thin.style.display = "";
    logo.style.left = "8px";
    logo.style.right = "";
  }
}

function setLoopUi(active){
  if(chatSendBtnEl) chatSendBtnEl.style.display = active ? 'none' : '';
}

function toggleImageUploadButton(_visible){
  const btn = document.getElementById("chatImageBtn");
  if(!btn) return;
  // Keep the chat image upload button hidden regardless of configuration.
  btn.hidden = true;
  btn.style.display = "none";
}

function toggleImagePaintTrayButton(_visible){
  const btn = document.getElementById("chatGenImageBtn");
  if(!btn) return;
  // Always hide the button. It remains in the DOM but never visible.
  btn.style.display = "none";
}

function toggleActivityIframeMenu(visible){
  const btn = document.getElementById("navActivityIframeBtn");
  if(!btn) return;
  btn.style.display = visible ? "" : "none";
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}

function toggleNexumChatMenu(visible){
  const btn = document.getElementById("navNexumChatBtn");
  if(!btn) return;
  btn.style.display = visible ? "" : "none";
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}

function toggleNexumTabsMenu(visible){
  const btn = document.getElementById("navNexumTabsBtn");
  if(!btn) return;
  btn.style.display = visible ? "" : "none";
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}
function toggleChatTabsMenu(visible){
  const btn = document.getElementById("navChatTabsBtn");
  if(!btn) return;
  btn.hidden = !visible;
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}
function toggleImageGeneratorMenu(visible){
  const btn = document.getElementById("navImageGeneratorBtn");
  if(!btn) return;
  btn.style.display = visible ? "" : "none";
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}
function toggleFileTreeMenu(visible){
  const btn = document.getElementById("navFileTreeBtn");
  if(!btn) return;
  btn.style.display = visible ? "" : "none";
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}
function toggleAiModelsMenu(visible){
  const btn = document.getElementById("navAiModelsBtn");
  if(!btn) return;
  btn.style.display = visible ? "" : "none";
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}
function toggleTasksMenu(visible){
  const btn = document.getElementById("navTasksBtn");
  if(!btn) return;
  btn.style.display = visible ? "" : "none";
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}
function toggleJobsMenu(visible){
  const btn = document.getElementById("navJobsBtn");
  if(!btn) return;
  btn.hidden = !visible;
  const li = btn.closest('li');
  if(li) li.style.display = visible ? "" : "none";
}
function togglePortfolioMenu(visible){
  const btn = document.getElementById("navPortfolioBtn");
  if(btn){
    btn.hidden = !visible;
    const li = btn.closest('li');
    if(li) li.style.display = visible ? "" : "none";
  }
  const icon = document.getElementById("navPortfolioIcon");
  if(icon) icon.style.display = visible ? "" : "none";
}

function toggleImageIdColumn(){
  const header = document.getElementById('numericIdHeader');
  if(header) header.style.display = '';
  document.querySelectorAll('#secureFilesList td.id-col').forEach(td => {
    td.style.display = '';
  });
}

function toggleDesignTabs(allowed){
  document.querySelectorAll('[data-type="design"]').forEach(el => {
    if(el.tagName === 'BUTTON'){
      el.style.display = '';
      el.disabled = !allowed;
      el.classList.toggle('disabled', !allowed);
    }
  });
  document.querySelectorAll('option[value="design"]').forEach(opt => {
    opt.disabled = !allowed;
    if(!allowed && opt.selected){
      const sel = opt.closest('select');
      if(sel) sel.value = sel.querySelector('option:not([disabled])')?.value || 'chat';
    }
  });
  const banner = document.getElementById('designProBanner');
  if(banner) banner.style.display = allowed ? 'none' : 'block';
}
function toggleNewTabProjectField(visible){
  const lbl = document.getElementById("newTabProjectLabel");
  if(!lbl) return;
  lbl.style.display = visible ? "" : "none";
}
function runImageLoop(){
  if(!imageLoopEnabled || !accountInfo || accountInfo.id !== 1) return;
  if(chatInputEl) chatInputEl.value = imageLoopMessage;
  if(chatSendBtnEl) chatSendBtnEl.click();
}

function updateModelHud(){
  const hud = document.getElementById("modelHud");
  if(!hud) return;
  const { shortModel } = parseProviderModel(modelName);
  const displayName = shortModel || modelName;
  hud.textContent = `Model: ${displayName}`;
}

function updateSearchButton(){
  const btn = document.getElementById("searchToggleBtn");
  if(!btn) return;
  btn.classList.toggle("active", searchEnabled);
  btn.setAttribute("aria-pressed", searchEnabled ? "true" : "false");
  btn.title = searchEnabled ? "Disable search mode" : "Enable search mode";
  btn.setAttribute("aria-label", searchEnabled ? "Disable search mode" : "Enable search mode");
}

async function updateCurrentTabType(newType){
  if(!currentTabId) return;
  const tab = chatTabs.find(t => t.id === currentTabId);
  if(!tab) return;
  const normalizedType = (newType || 'chat').trim() || 'chat';
  const changed = (tab.tab_type || 'chat') !== normalizedType;
  if(changed){
    try {
      await fetch('/api/chat/tabs/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabId: currentTabId,
          project: tab.project_name || '',
          repo: tab.repo_ssh_url || '',
          extraProjects: tab.extra_projects || '',
          taskId: tab.task_id || 0,
          type: normalizedType,
          sendProjectContext: tab.send_project_context ? 1 : 0,
          chatgptUrl: tab.chatgpt_url || '',
          sessionId
        })
      });
    } catch (err) {
      console.error('Failed to update tab type', err);
      return;
    }
  }
  tab.tab_type = normalizedType;
  tab.generate_images = normalizedType === 'design' ? 1 : 0;
  currentTabType = normalizedType;
  tabGenerateImages = normalizedType === 'design';
  if(changed){
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
  }
}

function updateReasoningButton(){
  // no visual toggle on reasoning button
}

function updateCodexButton(){
  const btn = document.getElementById("codexToggleBtn");
  if(!btn) return;
  btn.classList.toggle("active", codexMiniEnabled);
}

function updateAiResponsesButton(){
  if(!reasoningTooltip) return;
  const btn = reasoningTooltip.querySelector('button[data-action="toggle-ai"]');
  if(btn){
    if(aiResponsesEnabled){
      btn.textContent = 'Disable AI';
      btn.classList.remove('active');
    } else {
      btn.textContent = 'Disabled';
      btn.classList.add('active');
    }
  }
}

let reasoningTooltip = null;
let reasoningTooltipTimer = null;
let reasoningFavoritesEdit = false;
let reasoningChatContainer = null;
let reasoningReasonContainer = null;
let favoritesTooltip = null;
let favoritesTooltipTimer = null;

function highlightReasoningModel(model){
  if(!reasoningTooltip) return;
  Array.from(reasoningTooltip.querySelectorAll('button[data-model]')).forEach(b => {
    const isChatModel = reasoningChatModels.includes(b.dataset.model);
    const highlight = aiResponsesEnabled && (
      (reasoningEnabled && !isChatModel && b.dataset.model === model) ||
      (!reasoningEnabled && isChatModel && b.dataset.model === model)
    );
    b.classList.toggle('active', highlight);
  });
  updateReasoningButton();
}

async function initReasoningTooltip(){
  if(reasoningTooltip) return;
  reasoningTooltip = document.createElement('div');
  reasoningTooltip.className = 'reasoning-tooltip';
  const gear = document.createElement('button');
  gear.className = 'tooltip-gear';
  gear.innerHTML = '⚙️';
  gear?.addEventListener('click', ev => {
    ev.stopPropagation();
    reasoningFavoritesEdit = !reasoningFavoritesEdit;
    searchFavoritesEdit = reasoningFavoritesEdit;
    gear.classList.toggle('active', reasoningFavoritesEdit);
    renderReasoningModels();
    renderSearchModels();
  });
  reasoningTooltip.appendChild(gear);

  const favBtn = document.createElement('button');
  favBtn.textContent = 'More';
  favBtn?.addEventListener('click', ev => {
    ev.stopPropagation();
    showFavoritesTooltip();
  });
  favBtn?.addEventListener('mouseenter', () => clearTimeout(favoritesTooltipTimer));
  favBtn?.addEventListener('mouseleave', scheduleHideFavoritesTooltip);
  reasoningTooltip.appendChild(favBtn);


  const chatHeader = document.createElement('div');
  chatHeader.textContent = 'Chat';
  chatHeader.className = 'tooltip-section-header';
  reasoningTooltip.appendChild(chatHeader);

  reasoningChatContainer = document.createElement('div');
  reasoningTooltip.appendChild(reasoningChatContainer);

  const reasoningHeader = document.createElement('div');
  reasoningHeader.textContent = 'Reasoning';
  reasoningHeader.className = 'tooltip-section-header';
  reasoningTooltip.appendChild(reasoningHeader);

  reasoningReasonContainer = document.createElement('div');
  reasoningTooltip.appendChild(reasoningReasonContainer);

  const searchHeader = document.createElement('div');
  searchHeader.textContent = 'Search';
  searchHeader.className = 'tooltip-section-header';
  reasoningTooltip.appendChild(searchHeader);

  searchModelsContainer = document.createElement('div');
  reasoningTooltip.appendChild(searchModelsContainer);

  const disableBtn = document.createElement('button');
  disableBtn.dataset.action = 'toggle-ai';
  if(aiResponsesEnabled){
    disableBtn.textContent = 'Disable AI';
    disableBtn.classList.remove('active');
  } else {
    disableBtn.textContent = 'Disabled';
    disableBtn.classList.add('active');
  }
  disableBtn?.addEventListener('click', async ev => {
    ev.stopPropagation();
    await toggleAiResponses();
  });
  reasoningTooltip.appendChild(disableBtn);

  await ensureAiModels();
  renderReasoningModels();
  renderSearchModels();
  highlightReasoningModel(modelName);
  highlightSearchModel(settingsCache.ai_search_model);
  updateAiResponsesButton();
  reasoningTooltip?.addEventListener('mouseenter', () => clearTimeout(reasoningTooltipTimer));
  reasoningTooltip?.addEventListener('mouseleave', scheduleHideReasoningTooltip);
  document.body.appendChild(reasoningTooltip);
}

function showReasoningTooltip(e){
  initReasoningTooltip();
  const btn = document.getElementById('reasoningToggleBtn');
  const rect = btn.getBoundingClientRect();
  reasoningTooltip.style.display = 'flex';
  reasoningTooltip.style.flexDirection = 'column';
  const tooltipWidth = reasoningTooltip.offsetWidth;
  const tooltipHeight = reasoningTooltip.offsetHeight;
  reasoningTooltip.style.left = (rect.left + rect.width / 2 - tooltipWidth / 2 + window.scrollX) + 'px';
  reasoningTooltip.style.top = (rect.top + window.scrollY - tooltipHeight - 4) + 'px';
  clearTimeout(reasoningTooltipTimer);
}

function hideReasoningTooltip(){
  if(reasoningTooltip) reasoningTooltip.style.display = 'none';
  hideFavoritesTooltip();
}

function scheduleHideReasoningTooltip(){
  clearTimeout(reasoningTooltipTimer);
  reasoningTooltipTimer = setTimeout(hideReasoningTooltip, 200);
}

function initFavoritesTooltip(){
  if(favoritesTooltip) return;
  favoritesTooltip = document.createElement('div');
  favoritesTooltip.className = 'favorites-tooltip';
  favoritesTooltip?.addEventListener('mouseenter', () => {
    clearTimeout(favoritesTooltipTimer);
    clearTimeout(reasoningTooltipTimer);
  });
  favoritesTooltip?.addEventListener('mouseleave', scheduleHideFavoritesTooltip);
  document.body.appendChild(favoritesTooltip);
}

async function renderFavoritesTooltip(){
  if(!favoritesTooltip) return;
  await ensureAiModels();
  favoritesTooltip.innerHTML = '';
  const shown = new Set();
  if(reasoningTooltip){
    const nodes = reasoningTooltip.querySelectorAll('button[data-model]');
    nodes.forEach(n => shown.add(n.dataset.model));
  }
  const favs = (window.allAiModels || []).filter(m => m.favorite && !shown.has(m.id));
  if(favs.length === 0){
    favoritesTooltip.textContent = 'No favorites';
    return;
  }
  favs.forEach(m => {
    const btn = document.createElement('button');
    btn.dataset.model = m.id;
    btn.textContent = m.id;
    btn?.addEventListener('click', async ev => {
      ev.stopPropagation();
      if(!aiResponsesEnabled){
        await toggleAiResponses();
      }
      if(reasoningEnabled){ await toggleReasoning(); }
      if(searchEnabled){ await toggleSearch(); }
      await setSetting('ai_model', m.id);
      settingsCache.ai_model = m.id;
      await fetch('/api/chat/tabs/model', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({tabId: currentTabId, model: m.id, sessionId})
      });
      tabModelOverride = m.id;
      modelName = m.id;
      updateModelHud();
      highlightReasoningModel(m.id);
      hideFavoritesTooltip();
      showToast(`Model set to ${m.id}`);
    });
    favoritesTooltip.appendChild(btn);
  });
}

function showFavoritesTooltip(){
  initFavoritesTooltip();
  renderFavoritesTooltip();
  const rect = reasoningTooltip.getBoundingClientRect();
  favoritesTooltip.style.display = 'flex';
  favoritesTooltip.style.flexDirection = 'column';
  favoritesTooltip.style.left = (rect.right + 8 + window.scrollX) + 'px';
  favoritesTooltip.style.top = rect.top + window.scrollY + 'px';
  clearTimeout(favoritesTooltipTimer);
}

function hideFavoritesTooltip(){
  if(favoritesTooltip) favoritesTooltip.style.display = 'none';
}

function scheduleHideFavoritesTooltip(){
  clearTimeout(favoritesTooltipTimer);
  favoritesTooltipTimer = setTimeout(hideFavoritesTooltip, 200);
}

async function renderReasoningModels(){
  if(!reasoningChatContainer || !reasoningReasonContainer) return;
  await ensureAiModels();
  reasoningChatContainer.innerHTML = '';
  reasoningReasonContainer.innerHTML = '';
  const cfg = window.REASONING_TOOLTIP_CONFIG || {};
  const chatModels = cfg.chatModels || [
    { name: 'openrouter/openai/gpt-5-mini' },
    { name: 'openai/gpt-4o-mini' },
    { name: 'openai/gpt-4.1-mini' },
    { name: 'openai/gpt-4o', label: 'pro' },
    { name: 'openai/gpt-4.1', label: 'pro' },
    { name: 'anthropic/claude-3.5-haiku', label: 'pro' },
    { name: 'anthropic/claude-3.7-sonnet', label: 'pro' },
    { name: 'anthropic/claude-sonnet-4', label: 'ultimate' }
  ];
  const reasoningModels = cfg.reasoningModels || [
    { name: 'deepseek/deepseek-r1-distill-llama-70b' },
    { name: 'deepseek/deepseek-r1-0528' },
    { name: 'openai/o4-mini', label: 'pro' },
    { name: 'openai/o4-mini-high', label: 'pro' },
    { name: 'openai/codex-mini', label: 'pro' },
    { name: 'openai/o3', label: 'ultimate' },
    { name: 'anthropic/claude-3.7-sonnet:thinking', label: 'ultimate' },
    { name: 'anthropic/claude-opus-4', label: 'ultimate' },
    { name: 'anthropic/claude-3.7-sonnet', label: 'pro' }
  ];

  function addModel(container, name, label){
    const fav = isModelFavorite(name);
    if(!reasoningFavoritesEdit && !fav) return;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    if(reasoningFavoritesEdit){
      const star = document.createElement('span');
      star.dataset.modelid = name;
      star.className = fav ? 'favorite-star starred' : 'favorite-star unstarred';
      star.textContent = fav ? '★' : '☆';
      star?.addEventListener('click', async ev => {
        ev.stopPropagation();
        const newFav = !fav;
        if(await toggleModelFavorite(name, newFav)){
          renderReasoningModels();
        }
      });
      row.appendChild(star);
    }
    const b = document.createElement('button');
    b.dataset.model = name;
    const { provider, shortModel } = parseProviderModel(name);
    const { label: providerLabel, separator } = formatProviderDisplay(provider);
    const providerSuffixHtml = separator === ' ' ? '&nbsp;' : separator;
    const providerSuffixText = separator;
    const providerHtml = providerLabel
      ? `<span class="model-provider">${providerLabel}${providerSuffixHtml}</span>`
      : '';
    const providerText = providerLabel ? `${providerLabel}${providerSuffixText}` : '';
    const display = providerHtml ? `${providerHtml}${shortModel}` : shortModel;
    const plainDisplay = `${providerText}${shortModel}`;
    if(label){
      b.innerHTML = `<span class="model-label ${label}">${label}</span> ${display}`;
    } else {
      b.innerHTML = display;
    }
    b.classList.toggle('active',
        (container===reasoningChatContainer ? modelName===name && !reasoningEnabled
                                            : settingsCache.ai_reasoning_model===name));
    b?.addEventListener('click', async ev => {
      ev.stopPropagation();
      if(!aiResponsesEnabled){
        await toggleAiResponses();
      }
      if(container===reasoningChatContainer){
        if(reasoningEnabled){ await toggleReasoning(); }
        if(searchEnabled){ await toggleSearch(); }
        await setSetting('ai_model', name);
        settingsCache.ai_model = name;
      } else {
        await setSetting('ai_reasoning_model', name);
        settingsCache.ai_reasoning_model = name;
        if(!reasoningEnabled){
          await toggleReasoning();
        }
      }
      await fetch('/api/chat/tabs/model', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({tabId: currentTabId, model: name, sessionId})
      });
      tabModelOverride = name;
      modelName = name;
      updateModelHud();
      highlightReasoningModel(name);
      hideReasoningTooltip();
      showToast(`${container===reasoningChatContainer?'Chat':'Reasoning'} model set to ${plainDisplay}`);
    });
    row.appendChild(b);
    container.appendChild(row);
  }

  chatModels.forEach(m => addModel(reasoningChatContainer, m.name||m, m.label));
  reasoningModels.forEach(m => addModel(reasoningReasonContainer, m.name, m.label));
  highlightReasoningModel(modelName);
}

let searchFavoritesEdit = false;
let searchModelsContainer = null;

function highlightSearchModel(model){
  if(!searchModelsContainer) return;
  Array.from(searchModelsContainer.querySelectorAll('button[data-model]')).forEach(b => {
    const highlight = searchEnabled && b.dataset.model === model;
    b.classList.toggle('active', highlight);
  });
}


async function renderSearchModels(){
  if(!searchModelsContainer) return;
  await ensureAiModels();
  searchModelsContainer.innerHTML = '';
  const models = [
    { name: 'openai/gpt-4o-mini-search-preview' },
    { name: 'openai/gpt-4o-search-preview', label: 'pro' }
  ];
  models.forEach(({name,label,note}) => {
    const fav = isModelFavorite(name);
    if(!searchFavoritesEdit && !fav) return;
    const card = document.createElement('div');
    card.className = 'model-card';
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    if(searchFavoritesEdit){
      const star = document.createElement('span');
      star.dataset.modelid = name;
      star.className = fav ? 'favorite-star starred' : 'favorite-star unstarred';
      star.textContent = fav ? '★' : '☆';
      star?.addEventListener('click', async ev => {
        ev.stopPropagation();
        const newFav = !fav;
        if(await toggleModelFavorite(name, newFav)){
          renderSearchModels();
        }
      });
      row.appendChild(star);
    }
    const b = document.createElement('button');
    b.dataset.model = name;
    const { provider, shortModel } = parseProviderModel(name);
    const { label: providerLabel, separator } = formatProviderDisplay(provider);
    const providerSuffixHtml = separator === ' ' ? '&nbsp;' : separator;
    const providerSuffixText = separator;
    const providerPart = providerLabel
      ? `<span class="model-row-provider">${providerLabel}${providerSuffixHtml}</span>`
      : '';
    const providerText = providerLabel ? `${providerLabel}${providerSuffixText}` : '';
    const namePart = `<span class="model-row-name">${shortModel}</span>`;
    const labelPart = label ? `<span class="model-label ${label}">${label}</span>` : '';
    let header = `<div class="model-row-header">${labelPart}${providerPart}${namePart}</div>`;

    let html = header;
    if(note){
      html += `<span class="model-note">${note}</span>`;
    }
    b.innerHTML = html;
    b.classList.toggle('active', settingsCache.ai_search_model === name);
    const plainDisplay = `${providerText}${shortModel}`;
    b?.addEventListener('click', async ev => {
      ev.stopPropagation();
      await setSetting('ai_search_model', name);
      settingsCache.ai_search_model = name;
      if(!aiResponsesEnabled){
        await toggleAiResponses();
      }
      if(!searchEnabled){
        await toggleSearch();
      } else {
        await fetch('/api/chat/tabs/model', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({tabId: currentTabId, model: name, sessionId})
        });
        tabModelOverride = name;
        modelName = name;
        updateModelHud();
      }
      highlightSearchModel(name);
      hideReasoningTooltip();
      showToast(`Search model set to ${plainDisplay}`);
    });
    row.appendChild(b);
    card.appendChild(row);
    // Note is now displayed inside the button
    searchModelsContainer.appendChild(card);
  });
  highlightSearchModel(settingsCache.ai_search_model);
}

async function toggleSearch(){
  const tab = chatTabs.find(t => t.id === currentTabId);
  const tabTypeBeforeToggle = tab ? tab.tab_type || 'chat' : 'chat';
  if(!searchEnabled && (reasoningEnabled || codexMiniEnabled)){
    if(reasoningEnabled) await toggleReasoning();
    if(codexMiniEnabled) await toggleCodexMini();
  }
  const wasEnabled = searchEnabled;
  searchEnabled = !searchEnabled;
  await setSetting("search_enabled", searchEnabled);
  if(searchEnabled){
    previousModelName = modelName; // remember current model
    if(!wasEnabled){
      previousTabType = tabTypeBeforeToggle;
    }
    await updateCurrentTabType('search');
    const searchModel = await getSetting("ai_search_model") || DEFAULT_SEARCH_MODEL;
    await fetch("/api/chat/tabs/model", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({tabId: currentTabId, model: searchModel, sessionId})
    });
    tabModelOverride = searchModel;
    modelName = searchModel;
  } else {
    const restoreModel = previousModelName || await getSetting("ai_model") || "openrouter/openai/gpt-5-mini";
    await fetch("/api/chat/tabs/model", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({tabId: currentTabId, model: restoreModel, sessionId})
    });
    tabModelOverride = restoreModel;
    modelName = restoreModel;
    previousModelName = null;
    let restoreType = previousTabType || tabTypeBeforeToggle || 'chat';
    if(restoreType === 'search') {
      restoreType = 'chat';
    }
    await updateCurrentTabType(restoreType);
    previousTabType = null;
  }
  updateModelHud();
  updateSearchButton();
  updateReasoningButton();
  updateCodexButton();
  highlightSearchModel(modelName);
}

async function toggleReasoning(){
  if(!reasoningEnabled && (searchEnabled || codexMiniEnabled)){
    if(searchEnabled) await toggleSearch();
    if(codexMiniEnabled) await toggleCodexMini();
  }
  reasoningEnabled = !reasoningEnabled;
  await setSetting("reasoning_enabled", reasoningEnabled);
  if(reasoningEnabled){
    reasoningPreviousModelName = modelName; // remember current model
    const reasoningModel = await getSetting("ai_reasoning_model") || "openai/o4-mini";
    await fetch("/api/chat/tabs/model", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({tabId: currentTabId, model: reasoningModel, sessionId})
    });
    tabModelOverride = reasoningModel;
    modelName = reasoningModel;
  } else {
    const restoreModel = reasoningPreviousModelName || await getSetting("ai_model") || "openrouter/openai/gpt-5-mini";
    await fetch("/api/chat/tabs/model", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({tabId: currentTabId, model: restoreModel, sessionId})
    });
    tabModelOverride = restoreModel;
    modelName = restoreModel;
    reasoningPreviousModelName = null;
  }
  updateModelHud();
  updateReasoningButton();
  updateSearchButton();
  updateCodexButton();
  highlightReasoningModel(modelName);
}

async function toggleCodexMini(){
  if(!codexMiniEnabled && (searchEnabled || reasoningEnabled)){
    showToast("Disable Search/Reasoning mode first");
    return;
  }
  codexMiniEnabled = !codexMiniEnabled;
  await setSetting("codex_mini_enabled", codexMiniEnabled);
  if(codexMiniEnabled){
    codexPreviousModelName = modelName;
    const codexModel = "openrouter/openai/codex-mini";
    await fetch("/api/chat/tabs/model", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({tabId: currentTabId, model: codexModel, sessionId})
    });
    tabModelOverride = codexModel;
    modelName = codexModel;
  } else {
    const restoreModel = codexPreviousModelName || await getSetting("ai_model") || "openrouter/openai/gpt-5-mini";
    await fetch("/api/chat/tabs/model", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({tabId: currentTabId, model: restoreModel, sessionId})
    });
    tabModelOverride = restoreModel;
    modelName = restoreModel;
    codexPreviousModelName = null;
  }
  updateModelHud();
  updateCodexButton();
  updateSearchButton();
  updateReasoningButton();
}

async function toggleAiResponses(){
  aiResponsesEnabled = !aiResponsesEnabled;
  await setSetting('ai_responses_enabled', aiResponsesEnabled);
  updateAiResponsesButton();
  if(!aiResponsesEnabled && searchEnabled){
    searchEnabled = false;
    await setSetting('search_enabled', searchEnabled);
    updateSearchButton();
    highlightSearchModel(null);
  }
  if(!aiResponsesEnabled){
    highlightReasoningModel(null);
    updateReasoningButton();
  }
}

async function enableSearchMode(query=""){
  const tab = chatTabs.find(t => t.id === currentTabId);
  const tabTypeBeforeToggle = tab ? tab.tab_type || 'chat' : 'chat';
  if(!searchEnabled){
    searchEnabled = true;
    previousModelName = modelName;
    previousTabType = tabTypeBeforeToggle;
    await setSetting('search_enabled', searchEnabled);
  }
  await updateCurrentTabType('search');
  const searchModel = await getSetting("ai_search_model") || DEFAULT_SEARCH_MODEL;
  await fetch("/api/chat/tabs/model", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({tabId: currentTabId, model: searchModel, sessionId})
  });
  tabModelOverride = searchModel;
  modelName = searchModel;
  updateModelHud();
  updateSearchButton();
  updateReasoningButton();
  updateCodexButton();
  highlightSearchModel(searchModel);
  if(query){
    chatInputEl.value = query;
    chatSendBtnEl.click();
  }
}

(function installDividerDrag(){
  const divider = $("#divider");
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;
  let finalWidth = 0;

  divider?.addEventListener("mousedown", e => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startWidth = $(".sidebar").offsetWidth;
    finalWidth = startWidth;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", e => {
    if(!isDragging) return;
    const dx = e.clientX - startX;
    const newWidth = startWidth + dx;
    const minWidth = 150;
    const maxWidth = Math.max(minWidth, window.innerWidth - 100);
    const clamped = Math.max(minWidth, Math.min(newWidth, maxWidth));
    $(".sidebar").style.width = clamped + "px";
    finalWidth = clamped;
  });

  document.addEventListener("mouseup", () => {
    if(isDragging){
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ key: "sidebar_width", value: finalWidth })
      });
    }
    isDragging = false;
    document.body.style.userSelect = "";
  });
})();

function sortFileData(){
  fileListData.sort((a,b)=>{
    let va=a[fileSortColumn];
    let vb=b[fileSortColumn];
    if(fileSortColumn==='name' || fileSortColumn==='productUrl' || fileSortColumn==='ebayUrl'){
      va = (va||'').toLowerCase();
      vb = (vb||'').toLowerCase();
    }
    if(fileSortColumn==='mtime'){ va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
    if(fileSortColumn==='id'){ va = parseInt(va,10)||0; vb = parseInt(vb,10)||0; }
    if(va<vb) return fileSortAsc ? -1 : 1;
    if(va>vb) return fileSortAsc ? 1 : -1;
    return 0;
  });
}

function getFileUrl(file){
  if(!file) return "";
  const rawUrl = file.url || file.fileUrl || "";
  if(rawUrl){
    if(rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("/")){
      return rawUrl;
    }
    return `/uploads/${encodeURIComponent(rawUrl)}`;
  }
  if(file.name){
    return `/uploads/${encodeURIComponent(file.name)}`;
  }
  return "";
}

function getFileDisplayName(file){
  if(!file) return "";
  if(file.name) return file.name;
  const rawUrl = file.url || file.fileUrl || "";
  if(rawUrl){
    const parts = rawUrl.split("/");
    const last = parts[parts.length - 1] || "";
    try {
      return decodeURIComponent(last) || rawUrl;
    } catch (e) {
      return last || rawUrl;
    }
  }
  return "";
}

function renderFileList(){
  const table = $("#secureFilesList");
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";
  fileListData.forEach((f, idx) => {
    const fileUrl = getFileUrl(f);
    const displayName = getFileDisplayName(f);
    const tr = document.createElement("tr");
    tr.dataset.fileName = displayName || f.name || "";
    const tdIndex = document.createElement("td");
    tdIndex.className = "uuid-col";
    tdIndex.textContent = f.uuid ?? "";
    const tdId = document.createElement("td");
    tdId.className = "id-col";
    tdId.textContent = (f.id !== null && f.id !== undefined) ? `img-${f.id}` : "";
    const tdThumb = document.createElement("td");
    const thumbImg = document.createElement("img");
    if(fileUrl){
      thumbImg.src = fileUrl;
    }
    thumbImg.alt = f.title || displayName || "Image thumbnail";
    thumbImg.className = "table-thumb";
    const imageModalTitle = getImageModalTitle(f);
    thumbImg.setAttribute("role", "button");
    thumbImg.setAttribute("tabindex", "0");
    thumbImg.setAttribute("aria-label", `Preview ${imageModalTitle}`);
    thumbImg?.addEventListener("click", () => openImagePreviewModal(f));
    thumbImg?.addEventListener("keydown", evt => {
      if(evt.key === "Enter" || evt.key === " "){
        evt.preventDefault();
        openImagePreviewModal(f);
      }
    });
    tdThumb.appendChild(thumbImg);
    const tdName = document.createElement("td");
    tdName.className = "name-col";
    const link = document.createElement("a");
    if(fileUrl){
      link.href = fileUrl;
      link.target = "_blank";
    } else {
      link.href = "#";
      link.setAttribute("aria-disabled", "true");
      link.classList.add("is-disabled-link");
      link.style.pointerEvents = "none";
    }
    link.textContent = displayName || "(no filename)";
    tdName.appendChild(link);
    const tdStatus = document.createElement("td");
    tdStatus.textContent = f.status || "";
    tdStatus.className = "img-status-cell";
    const tdAction = document.createElement("td");
    tdAction.className = "table-action-cell";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "table-open-btn";
    openBtn.textContent = "Open";
    if(!fileUrl){
      openBtn.disabled = true;
    }
    openBtn?.addEventListener("click", () => {
      if(!fileUrl) return;
      if(isPrintifyQueueEnabled()){
        const fileParam = displayName || fileUrl.split("/").pop() || "";
        window.open(
          `/Image.html?file=${encodeURIComponent(fileParam)}`,
          "_blank"
        );
      } else {
        openImagePreviewModal(f);
      }
    });
    tdAction.appendChild(openBtn);

    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.className = "download-chat-btn table-download-btn table-action-btn";
    dlBtn.innerHTML = "⤓ Download";
    dlBtn.title = "Download this image";
    dlBtn.setAttribute("aria-label", "Download this image");
    if(!fileUrl){
      dlBtn.disabled = true;
    }
    dlBtn?.addEventListener("click", () => {
      if(!fileUrl) return;
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = displayName || f.name || "image";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    tdAction.appendChild(dlBtn);
    tr.appendChild(tdIndex);
    tr.appendChild(tdId);
    tr.appendChild(tdThumb);
    tr.appendChild(tdName);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
  updateHeaderArrows();
}

function getImageModalTitle(file){
  if(!file) return "Image Preview";
  if(file.id !== null && file.id !== undefined){
    return `img-${file.id}`;
  }
  if(file.title && String(file.title).trim()){
    return String(file.title).trim();
  }
  const displayName = getFileDisplayName(file);
  if(displayName && String(displayName).trim()){
    return String(displayName).trim();
  }
  return "Image Preview";
}

function openImagePreviewModal(file){
  const modal = $("#imagePreviewModal");
  if(!modal) return;
  const titleEl = $("#imagePreviewModalTitle", modal);
  const imgEl = $("#imagePreviewModalImg", modal);
  const modalTitle = getImageModalTitle(file);
  if(titleEl){
    titleEl.textContent = modalTitle;
  }
  if(imgEl){
    const fileUrl = getFileUrl(file);
    if(fileUrl){
      imgEl.src = fileUrl;
    } else {
      imgEl.removeAttribute("src");
    }
    imgEl.alt = (file && (file.title || getFileDisplayName(file))) || modalTitle;
  }
  showModal(modal);
}

function closeImagePreviewModal(){
  const modal = $("#imagePreviewModal");
  if(!modal) return;
  const imgEl = $("#imagePreviewModalImg", modal);
  if(imgEl){
    imgEl.removeAttribute("src");
    imgEl.alt = "";
  }
  hideModal(modal);
}

const imagePreviewModalCloseBtn = $("#imagePreviewModalClose");
if(imagePreviewModalCloseBtn){
  imagePreviewModalCloseBtn?.addEventListener("click", closeImagePreviewModal);
}

const imagePreviewModalEl = $("#imagePreviewModal");
if(imagePreviewModalEl){
  imagePreviewModalEl?.addEventListener("click", event => {
    if(event.target === imagePreviewModalEl){
      closeImagePreviewModal();
    }
  });
}

function updateHeaderArrows(){
  $$("#secureFilesList th").forEach(th => {
    const col = th.dataset.col;
    if(!col) return;
    if(!th.dataset.label) th.dataset.label = th.textContent.trim();
    th.textContent = th.dataset.label;
    if(fileSortColumn === col){
      th.textContent += fileSortAsc ? " \u25B2" : " \u25BC";
    }
  });
}

function setupFileSorting(){
  $$("#secureFilesList th").forEach(th => {
    const col = th.dataset.col;
    if(!col) return;
    th.style.cursor = "pointer";
    th?.addEventListener("click", () => {
      if(fileSortColumn === col){
        fileSortAsc = !fileSortAsc;
      } else {
        fileSortColumn = col;
        fileSortAsc = true;
      }
      sortFileData();
      renderFileList();
    });
  });
}

async function loadFileList(reset = true) {
  if(fileListLoading) return;
  if(reset){
    fileListOffset = 0;
    fileListEnd = false;
    fileListData = [];
    $("#secureFilesList tbody").innerHTML = "";
  }
  await loadNextFilePage();
}

async function loadNextFilePage(){
  if(fileListLoading || fileListEnd) return;
  fileListLoading = true;
  const spin = $("#uploaderLoading");
  if(spin) spin.style.display = "block";
  try {
    const resp = await fetch(`/api/upload/list?sessionId=${encodeURIComponent(sessionId)}&showHidden=1&limit=${fileListLimit}&offset=${fileListOffset}`);
    const payload = await resp.json().catch(() => null);

    if(!resp.ok){
      const message = payload && payload.error ? payload.error : `Status ${resp.status}`;
      console.error("Error fetching file list:", message);
      if(typeof showToast === "function"){
        showToast(`Unable to load images: ${message}`);
      }
      fileListEnd = true;
      return;
    }

    if(!Array.isArray(payload)){
      console.error("Unexpected file list response:", payload);
      fileListEnd = true;
      return;
    }

    const data = payload;
    fileListData = fileListData.concat(data);
    fileListOffset += data.length;
    if(data.length < fileListLimit) fileListEnd = true;
    sortFileData();
    renderFileList();
    updateUsageLimitInfo();
  } catch(e) {
    console.error("Error fetching file list:", e);
  }
  fileListLoading = false;
  if(spin) spin.style.display = "none";
}

$("#secureUploadForm").addEventListener("submit", async e => {
  e.preventDefault();
  const file = $("#fileInput").files[0];
  if(!file) {
    alert("Please select a file first.");
    return;
  }
  console.log("[Uploader Debug] Uploading file:", file.name);

  const formData = new FormData();
  formData.append("myfile", file, file.name);

  try {
    const resp = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    if(!resp.ok){
      console.error("[Uploader Debug] Server responded with status:", resp.status);
      alert("Upload failed. Check console for details.");
      return;
    }
    const result = await resp.json();
    if(result.success){
      alert("File uploaded successfully!");
      await loadFileList();
    } else {
      alert("Upload error: " + (result.error || "Unknown error"));
    }
  } catch(err) {
    console.error("[Uploader Debug] Upload error:", err);
    alert("Upload error. Check console.");
  }
});
// Disable editing image status by clicking the status cell.
// Previously clicking `.img-status-cell` replaced the cell with a <select>
// allowing inline status changes. That behaviour is removed so statuses are
// read-only from the images table. Keep the listener but no-op when the
// target is an img-status-cell to avoid interfering with other click handlers.
document.addEventListener("click", ev => {
  if(!ev.target.classList.contains("img-status-cell")) return;
  // Intentionally do nothing to prevent inline status editing.
});

document.addEventListener("click", async (ev) => {
  const cell = ev.target;
  if (!cell.classList.contains("project-rename-cell")) return;
  const oldName = cell.dataset.oldproj;
  function inlineEdit(newEl, saveCb){
    const original = cell.textContent;
    cell.textContent = "";
    cell.appendChild(newEl);
    newEl.focus();
    newEl?.addEventListener("change", async ()=>{
      await saveCb(newEl.value);
    });
    newEl?.addEventListener("blur", ()=>{
      renderProjectsTable();
    });
  }
  const input = document.createElement("input");
  input.type = "text";
  input.value = oldName;
  inlineEdit(input, async (val) => {
    const newName = val.trim();
    if (!newName || newName === oldName) {
      cell.textContent = oldName;
      return;
    }
    const resp = await fetch("/api/projects/rename", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ oldProject: oldName, newProject: newName })
    });
    if (!resp.ok){
      alert("Error renaming project");
      cell.textContent = oldName;
      return;
    }
    cell.textContent = newName;
    cell.dataset.oldproj = newName;
    await renderProjectsTable();
  });
});

async function openProjectsModal(){
  showModal($("#projectsModal"));
  await renderProjectsTable();
}

async function renderProjectsTable(){
  const tblBody = $("#projectsTable tbody");
  tblBody.innerHTML = "";

  const [projects, branches] = await Promise.all([
    fetch("/api/projects?showArchived=1").then(r=>r.json()),
    fetch("/api/projectBranches").then(r=>r.json())
  ]);

  const branchMap = {};
  branches.forEach(b => { branchMap[b.project] = b.base_branch; });

  const projNamesSet = new Set();
  projects.forEach(p => projNamesSet.add(p.project));
  branches.forEach(b => projNamesSet.add(b.project));
  const allProjectNames = [...projNamesSet].sort();

  allProjectNames.forEach(projectName => {
    const info = projects.find(p => p.project === projectName) || { archived: 0 };
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="project-rename-cell" style="border:1px solid #444; padding:2px 4px;" data-oldproj="${projectName}">${projectName}</td>
      <td style="border:1px solid #444; padding:2px 4px;">
        <input type="text" data-proj="${projectName}" class="projBranchInput" style="width:95%;" />
      </td>
      <td style="border:1px solid #444; padding:2px 4px;">
        <button class="projArchBtn" data-proj="${projectName}" data-arch="${info.archived ? 1 : 0}">${info.archived ? 'Unarchive' : 'Archive'}</button>
      </td>
    `;
    tblBody.appendChild(tr);
  });

  $$(".projBranchInput", tblBody).forEach(inp => {
    const proj = inp.dataset.proj;
    inp.value = branchMap[proj] || "";
  });

  $$(".projArchBtn", tblBody).forEach(btn => {
    btn?.addEventListener("click", async () => {
      const proj = btn.dataset.proj;
      const arch = btn.dataset.arch === "1";
      await fetch('/api/projects/archive', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({project: proj, archived: !arch})});
      if(!arch) removeProjectGroupIfEmpty(proj);
      await renderProjectsTable();
    });
  });
}

async function saveProjectBranches(){
  const inps = $$(".projBranchInput");
  const data = inps.map(inp => ({
    project: inp.dataset.proj,
    base_branch: inp.value.trim()
  }));
  const resp = await fetch("/api/projectBranches", {
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ data })
  });
  if(!resp.ok) {
    alert("Error saving project branches.");
    return;
  }
  hideModal($("#projectsModal"));
}

$("#projConfigBtn").addEventListener("click", openProjectsModal);
$("#projectsSaveBtn").addEventListener("click", saveProjectBranches);
$("#projectsCancelBtn").addEventListener("click", ()=>hideModal($("#projectsModal")));

$("#projectSettingsSaveBtn")?.addEventListener("click", async () => {
  const modal = $("#projectSettingsModal");
  const oldName = modal.dataset.project || "";
  const newName = $("#projectSettingsNameInput").value.trim();
  hideModal(modal);
  if(!newName || newName === oldName) return;
  await fetch('/api/projects/rename', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ oldProject: oldName, newProject: newName })
  });
  await loadTabs();
  await loadArchivedTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
});

$("#projectSettingsArchiveBtn")?.addEventListener("click", async () => {
  const modal = $("#projectSettingsModal");
  const project = modal.dataset.project || "";
  const btn = $("#projectSettingsArchiveBtn");
  const archived = btn.dataset.archived !== "1";
  hideModal(modal);
  await fetch('/api/projects/archive', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ project, archived })
  });
  await loadTabs();
  await loadArchivedTabs();
  if(archived) removeProjectGroupIfEmpty(project);
  renderSidebarTabs();
  renderArchivedSidebarTabs();
});

$("#projectSettingsCancelBtn")?.addEventListener("click", () => hideModal($("#projectSettingsModal")));

const navFileTreeBtn = document.getElementById("navFileTreeBtn");
const navFileCabinetBtn = document.getElementById("navFileCabinetBtn");
const sidebarViewFileTree = document.getElementById("sidebarViewFileTree");
const sidebarViewFileCabinet = document.getElementById("sidebarViewFileCabinet");
const sidebarViewTasks = document.getElementById("sidebarViewTasks");
const sidebarViewUploader = document.getElementById("sidebarViewUploader");
const sidebarViewChatTabs = document.getElementById("sidebarViewChatTabs");
const sidebarViewActivityIframe = document.getElementById("sidebarViewActivityIframe");
const sidebarViewArchiveTabs = document.getElementById("sidebarViewArchiveTabs");
const sidebarViewCodeTasks = document.getElementById("sidebarViewCodeTasks");
const sidebarViewPrintifyProducts = document.getElementById("sidebarViewPrintifyProducts");
const sidebarViewProjectView = document.getElementById("sidebarViewProjectView");
const fileTreeContainer = document.getElementById("fileTreeContainer");
const fileCabinetContainer = document.getElementById("fileCabinetContainer");

function hideProjectViewPanel(){
  if(sidebarViewProjectView){
    sidebarViewProjectView.style.display = "none";
  }
}

function showTasksPanel(){
  sidebarViewTasks.style.display = "";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  hideProjectViewPanel();
  sidebarViewCodeTasks.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  setTreeNavActive("#navTasksBtn");
  setSetting("last_sidebar_view", "tasks");
  setActiveCollapsedIcon(btnTasksIcon || null);
  setActiveThinIcon(null);
}

async function showUploaderPanel(){
  if(!accountInfo){
    openSignupModal();
    return;
  }
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  hideProjectViewPanel();
  sidebarViewCodeTasks.style.display = "none";
  // ensure the tree nav buttons reflect the active state
  sidebarViewPrintifyProducts.style.display = "none";
  setTreeNavActive("#navUploaderBtn");
  // Ensure uploader nav elements are explicitly marked active (fix highlighting)
  if (btnUploader) btnUploader.classList.add("active");
  if (btnUploaderIcon) btnUploaderIcon.classList.add("active");
  setActiveCollapsedIcon(btnUploaderIcon || null);
  setActiveThinIcon(thinImagesIcon || null);
  setSetting("last_sidebar_view", "uploader");
  try {
    await focusDesignChat();
  } catch (err) {
    console.error("[ImagesNav] Failed to focus design chat", err);
  }
}

function showFileTreePanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "";
  sidebarViewFileCabinet.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  hideProjectViewPanel();
  sidebarViewCodeTasks.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  setTreeNavActive("#navFileTreeBtn");
  setSetting("last_sidebar_view", "fileTree");
  loadFileTree();
  setActiveCollapsedIcon(btnFileTreeIcon || null);
  setActiveThinIcon(null);
}

function showFileCabinetPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewFileCabinet.style.display = "";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  hideProjectViewPanel();
  sidebarViewCodeTasks.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  setTreeNavActive("#navFileCabinetBtn");
  setSetting("last_sidebar_view", "fileCabinet");
  loadFileCabinet();
  setActiveCollapsedIcon(btnFileCabinetIcon || null);
  setActiveThinIcon(null);
}

async function focusPreferredSidebarChatTab(){
  const container = document.getElementById("verticalTabsContainer");
  if(!container) return;
  const buttons = Array.from(container.querySelectorAll(".sidebar-tab-row button"));
  const visibleButtons = buttons.filter(btn => btn.offsetParent !== null);
  if(visibleButtons.length === 0) return;

  const targetButton = visibleButtons[0];
  if(!targetButton) return;

  const tabId = parseInt(targetButton.dataset.tabId || "", 10);
  if(!Number.isInteger(tabId)) return;
  await selectTab(tabId);
}

async function showChatTabsPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  hideProjectViewPanel();
  sidebarViewCodeTasks.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  setTreeNavActive("#navChatTabsBtn");
  setSetting("last_sidebar_view", "chatTabs");
  renderSidebarTabs();
  await focusPreferredSidebarChatTab();
  setActiveCollapsedIcon(btnChatTabsIcon || null);
  setActiveThinIcon(thinChatIcon || null);
}

function showArchiveTabsPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewArchiveTabs.style.display = "";
  hideProjectViewPanel();
  sidebarViewCodeTasks.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  setTreeNavActive("#navArchiveTabsBtn");
  setSetting("last_sidebar_view", "archiveTabs");
  loadTabs().then(renderArchivedSidebarTabs);
  setActiveCollapsedIcon(btnArchiveTabsIcon || null);
  setActiveThinIcon(null);
}

function showActivityIframePanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "";
  hideProjectViewPanel();
  sidebarViewCodeTasks.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  setTreeNavActive("#navActivityIframeBtn");
  setSetting("last_sidebar_view", "activity");
  setActiveCollapsedIcon(btnActivityIframeIcon || null);
  setActiveThinIcon(null);
}


function showPrintifyProductsPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  hideProjectViewPanel();
  sidebarViewPrintifyProducts.style.display = "";
  sidebarViewCodeTasks.style.display = "none";
  setTreeNavActive("#navPrintifyProductsBtn");
  setSetting("last_sidebar_view", "printify");
  printifyPage = 1;
  loadPrintifyProducts();
  setActiveCollapsedIcon(btnPrintifyProductsIcon || null);
  setActiveThinIcon(null);
}

function showCodeTasksPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewFileCabinet.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewProjectView.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  sidebarViewCodeTasks.style.display = "";
  setTreeNavActive("#navCodeTasksBtn");
  setSetting("last_sidebar_view", "codeTasks");
  setActiveCollapsedIcon(btnCodeTasksIcon || null);
  setActiveThinIcon(thinCodeIcon || null);
  const input = document.getElementById("codeTaskInput");
  if(input){
    setTimeout(() => { input.focus(); }, 50);
  }
}

/**
 * Recursively render the file tree structure
 */
function createTreeNode(node, repoName, chatNumber) {
  const li = document.createElement("li");

  if(node.type === "directory") {
    const expander = document.createElement("span");
    expander.textContent = "[+] ";
    expander.style.cursor = "pointer";
    li.appendChild(expander);

    const label = document.createElement("span");
    label.textContent = node.name;
    label.style.fontWeight = "bold";
    li.appendChild(label);

    const ul = document.createElement("ul");
    ul.style.display = "none";
    li.appendChild(ul);

    expander?.addEventListener("click", () => {
      if(ul.style.display === "none"){
        ul.style.display = "";
        expander.textContent = "[-] ";
      } else {
        ul.style.display = "none";
        expander.textContent = "[+] ";
      }
    });

    if(Array.isArray(node.children)){
      node.children.forEach(child => {
        ul.appendChild(createTreeNode(child, repoName, chatNumber));
      });
    }

  } else {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `checkbox_${node.path}`;
    cb.checked = !!node.isAttached;
    li.appendChild(cb);

    const label = document.createElement("span");
    label.textContent = " " + node.name;
    li.appendChild(label);

    cb?.addEventListener("change", async () => {
      console.debug(`[FileTree Debug] Checkbox changed for: ${node.path}, new checked state: ${cb.checked}`);
      try {
        console.debug(`[FileTree Debug] Sending POST to toggle attachment for file: ${node.path}`);
        const resp = await axios.post(`https://openrouter.ai/api/v1/${repoName}/chat/${chatNumber}/toggle_attached`, {
          filePath: node.path
        });
        console.debug("[FileTree Debug] toggle_attached response:", resp.data);
      } catch(err) {
        console.error("Error toggling file attachment:", err);
      }
    });
  }

  return li;
}

async function loadFileTree(){
  fileTreeContainer.innerHTML = "Loading file tree...";
  try {
    const r = await fetch("/api/settings/sterling_chat_url");
    if(!r.ok){
      fileTreeContainer.textContent = "No sterling_chat_url found. Create a chat first.";
      return;
    }
    const { value: urlVal } = await r.json();
    if(!urlVal){
      fileTreeContainer.textContent = "No sterling_chat_url set. Create a chat first.";
      return;
    }

    const splitted = urlVal.split("/");
    const chatNumber = splitted.pop();
    splitted.pop();
    const repoName = decodeURIComponent(splitted.pop());

    const treeRes = await fetch(`http://localhost:3444/api/listFileTree/${repoName}/${chatNumber}`);
    if(!treeRes.ok){
      fileTreeContainer.textContent = "Error fetching file tree from Sterling.";
      return;
    }
    const data = await treeRes.json();
    if(!data.success){
      fileTreeContainer.textContent = "Sterling error: " + JSON.stringify(data);
      return;
    }

    fileTreeContainer.innerHTML = "";
    const rootUl = document.createElement("ul");
    data.tree.children.forEach(childNode => {
      rootUl.appendChild(createTreeNode(childNode, repoName, chatNumber));
    });
    fileTreeContainer.appendChild(rootUl);

  } catch(err) {
    fileTreeContainer.textContent = "Error: " + err.message;
  }
}

async function loadFileCabinet(){
  if(!fileCabinetContainer) return;
  fileCabinetContainer.textContent = "Loading cabinet...";
  try {
    const res = await fetch('/api/cabinet');
    if(!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    fileCabinetContainer.innerHTML = '';
    if(Array.isArray(data.items)){
      const ul = document.createElement('ul');
      data.items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.name || item;
        ul.appendChild(li);
      });
      fileCabinetContainer.appendChild(ul);
    } else {
      fileCabinetContainer.textContent = 'No cabinet data';
    }
  } catch(err){
    fileCabinetContainer.textContent = 'Error: ' + err.message;
  }
}

async function loadPrintifyProducts(){
  const tbl = document.querySelector("#printifyProductsTable tbody");
  if(!tbl) return;
  tbl.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
  try {
    updatePrintifyPageDisplay();
    const res = await fetch(`/api/printify/products?page=${printifyPage}&limit=10`);
    if(!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    const products = data.data || data.products || data || [];
    tbl.innerHTML = '';
    for(const p of products){
      const tr = document.createElement('tr');
      const id = p.id || p.product_id || '';
      const title = p.title || p.name || '';
      tr.innerHTML = `<td>${id}</td><td>${title}</td>`;
      tbl.appendChild(tr);
    }
  } catch(err){
    tbl.innerHTML = `<tr><td colspan="2">Error: ${err.message}</td></tr>`;
  }
}

function updatePrintifyPageDisplay(){
  const el = document.getElementById("printifyPageDisplay");
  if(el) el.textContent = String(printifyPage);
}

const btnTasks = document.getElementById("navTasksBtn");
const btnProjectViewIcon = null;

const btnUploader = document.getElementById("navUploaderBtn");
const btnChatTabs = document.getElementById("navChatTabsBtn");
const btnArchiveTabs = document.getElementById("navArchiveTabsBtn");
const btnCodeTasks = document.getElementById("navCodeTasksBtn");
const btnPrintifyQueue = document.getElementById("printifyQueueButton");
const btnActivityIframe = document.getElementById("navActivityIframeBtn");
const btnAiModels = document.getElementById("navAiModelsBtn");
const btnImageGenerator = document.getElementById("navImageGeneratorBtn");
const btnPortfolio = document.getElementById("navPortfolioBtn");
const btnJobs = document.getElementById("navJobsBtn");
const btnUpwork = document.getElementById("navUpworkBtn");
const btnPipelineQueue = document.getElementById("navPipelineQueueBtn");
const btnNodes = document.getElementById("navNodesBtn");
const btnPrintifyProducts = document.getElementById("navPrintifyProductsBtn");
const btnPrintifyProductsIcon = document.getElementById("navPrintifyProductsIcon");
const btnFileCabinet = document.getElementById("navFileCabinetBtn");
const refreshPrintifyProductsBtn = document.getElementById("refreshPrintifyProductsBtn");
const prevPrintifyPageBtn = document.getElementById("prevPrintifyPageBtn");
const nextPrintifyPageBtn = document.getElementById("nextPrintifyPageBtn");
const printifyQueueModal = document.getElementById("printifyQueueModal");
const printifyQueueModalCloseBtn = document.getElementById("printifyQueueModalCloseBtn");
const printifyQueueIframe = document.getElementById("printifyQueueIframe");
const btnNexumChat = document.getElementById("navNexumChatBtn");
const btnNexumTabs = document.getElementById("navNexumTabsBtn");

// Icon buttons for collapsed sidebar
const btnTasksIcon = document.getElementById("navTasksIcon");
const btnUploaderIcon = document.getElementById("navUploaderIcon");
const btnChatTabsIcon = document.getElementById("navChatTabsIcon");
const btnArchiveTabsIcon = document.getElementById("navArchiveTabsIcon");
const btnCodeTasksIcon = document.getElementById("navCodeTasksIcon");
const btnFileTreeIcon = document.getElementById("navFileTreeIcon");
const btnFileCabinetIcon = document.getElementById("navFileCabinetIcon");
const btnAiModelsIcon = document.getElementById("navAiModelsIcon");
const btnImageGeneratorIcon = document.getElementById("navImageGeneratorIcon");
const btnPortfolioIcon = document.getElementById("navPortfolioIcon");
const btnJobsIcon = document.getElementById("navJobsIcon");
const btnUpworkIcon = document.getElementById("navUpworkIcon");
const btnPipelineQueueIcon = document.getElementById("navPipelineQueueIcon");
const btnNodesIcon = document.getElementById("navNodesIcon");
const btnActivityIframeIcon = document.getElementById("navActivityIframeIcon");
const btnNexumChatIcon = document.getElementById("navNexumChatIcon");
const btnNexumTabsIcon = document.getElementById("navNexumTabsIcon");
// Thin sidebar icons
const thinCodeIcon = document.getElementById("thinIconCode");
const thinChatIcon = document.getElementById("thinIconChats");
const thinImagesIcon = document.getElementById("thinIconImages");

let creatingCodeChat = false;

const collapsedSidebarIcons = [
  btnChatTabsIcon,
  btnUploaderIcon,
  btnArchiveTabsIcon,
  btnCodeTasksIcon,
  btnFileTreeIcon,
  btnFileCabinetIcon,
  btnActivityIframeIcon,
  btnPrintifyProductsIcon,
  btnTasksIcon
].filter(Boolean);

const thinSidebarIcons = [
  thinCodeIcon,
  thinChatIcon,
  thinImagesIcon
].filter(Boolean);

function setActiveCollapsedIcon(activeBtn){
  collapsedSidebarIcons.forEach(btn => {
    btn.classList.toggle("active", btn === activeBtn);
  });
}

function setActiveThinIcon(activeBtn){
  thinSidebarIcons.forEach(btn => {
    btn.classList.toggle("active", btn === activeBtn);
  });
}

const treeNavSelectors = [
  "#navChatTabsBtn",
  "#navCodeTasksBtn",
  "#navUploaderBtn",
  "#navArchiveTabsBtn",
  "#navFileTreeBtn",
  "#navFileCabinetBtn",
  "#navActivityIframeBtn",
  "#navPrintifyProductsBtn",
  "#navTasksBtn"
];

function setTreeNavActive(targetSelector){
  treeNavSelectors.forEach(sel => {
    const el = $(sel);
    if(!el) return;
    el.classList.toggle("active", sel === targetSelector);
  });
}

function setCodeNavActiveState(isActive){
  if(btnCodeTasks){
    btnCodeTasks.classList.toggle("active", isActive);
  }
  if(btnCodeTasksIcon){
    btnCodeTasksIcon.classList.toggle("active", isActive);
  }
  if(isActive){
    btnChatTabs?.classList.remove("active");
    btnChatTabsIcon?.classList.remove("active");
  }
}

async function createCodeChatAndSelect(){
  const resp = await fetch("/api/chat/tabs/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", nexum: 0, project: "", type: "code", sessionId, showInSidebar: 0 })
  });
  if(!resp.ok){
    const errText = await resp.text().catch(() => "Failed to create code chat");
    throw new Error(errText || "Failed to create code chat");
  }
  const data = await resp.json();
  await loadTabs();
  let newTab = chatTabs.find(t => t.id === data.id);
  if(!newTab && data && data.uuid){
    newTab = chatTabs.find(t => t.tab_uuid === data.uuid);
  }
  if(newTab){
    await selectTab(newTab.id);
    setCodeNavActiveState(true);
  }
  return data;
}

function findExistingCodeChatTab(){
  return chatTabs.find(t => t.tab_type === 'code' && !t.archived);
}

async function focusExistingCodeChat(){
  let codeTab = findExistingCodeChatTab();
  if(!codeTab){
    await loadTabs();
    codeTab = findExistingCodeChatTab();
  }
  if(!codeTab){
    return false;
  }
  await selectTab(codeTab.id);
  return true;
}

async function handleCodeNavClick(fromIcon = false){
  try {
    // Direct the Code button to the GitHub repo for AlfeCode
    const target = 'https://code.alfe.sh';
    window.location.href = target;
  } catch (err) {
    console.error('[CodeNav] Failed to open code repo', err);
  }
  return;
}

function isPrintifyQueueModalVisible(){
  return printifyQueueModal?.style.display === "flex";
}

function openPrintifyQueueModal(url){
  if(!printifyQueueModal || !printifyQueueIframe){
    window.open(url, "_blank");
    return;
  }
  printifyQueueIframe.src = url;
  showModal(printifyQueueModal);
}

function closePrintifyQueueModal(){
  if(printifyQueueIframe){
    printifyQueueIframe.src = "";
  }
  hideModal(printifyQueueModal);
}

btnTasks?.addEventListener("click", showTasksPanel);
btnUploader?.addEventListener("click", () => { void showUploaderPanel(); });
navFileTreeBtn?.addEventListener("click", showFileTreePanel);
btnChatTabs?.addEventListener("click", () => { void showChatTabsPanel(); });
btnArchiveTabs?.addEventListener("click", showArchiveTabsPanel);
btnCodeTasks?.addEventListener("click", () => { void handleCodeNavClick(false); });
btnPrintifyQueue?.addEventListener("click", () => {
  const url = btnPrintifyQueue.dataset.url || "/pipeline_queue.html";
  openPrintifyQueueModal(url);
});
btnActivityIframe?.addEventListener("click", showActivityIframePanel);



printifyQueueModalCloseBtn?.addEventListener("click", closePrintifyQueueModal);
printifyQueueModal?.addEventListener("click", event => {
  if(event.target === printifyQueueModal){
    closePrintifyQueueModal();
  }
});
document.addEventListener("keydown", event => {
  if(event.key === "Escape" && isPrintifyQueueModalVisible()){
    closePrintifyQueueModal();
  }
});
btnAiModels?.addEventListener("click", () => { window.location.href = btnAiModels.dataset.url; });
btnImageGenerator?.addEventListener("click", () => { window.location.href = btnImageGenerator.dataset.url; });
btnPortfolio?.addEventListener("click", () => {
  const url = btnPortfolio.dataset.url;
  window.open(url, "_blank");
});
btnJobs?.addEventListener("click", () => {
  const url = btnJobs.dataset.url;
  window.open(url, "_blank");
});
btnUpwork?.addEventListener("click", () => {
  const url = btnUpwork.dataset.url;
  const target = btnUpwork.dataset.target || "_self";
  window.open(url, target);
});
btnPipelineQueue?.addEventListener("click", () => {
  const url = btnPipelineQueue.dataset.url;
  window.open(url, "_blank");
});
btnNodes?.addEventListener("click", () => {
  const url = btnNodes.dataset.url;
  const target = btnNodes.dataset.target || "_self";
  window.open(url, target);
});
btnNexumChat?.addEventListener("click", () => { window.location.href = btnNexumChat.dataset.url; });
btnNexumTabs?.addEventListener("click", () => { window.location.href = btnNexumTabs.dataset.url; });
btnPrintifyProducts?.addEventListener("click", showPrintifyProductsPanel);
btnFileCabinet?.addEventListener("click", showFileCabinetPanel);
refreshPrintifyProductsBtn?.addEventListener("click", loadPrintifyProducts);
prevPrintifyPageBtn?.addEventListener("click", () => {
  if(printifyPage > 1){
    printifyPage -= 1;
    loadPrintifyProducts();
  }
});
nextPrintifyPageBtn?.addEventListener("click", () => {
  printifyPage += 1;
  loadPrintifyProducts();
});

// Icon button actions (expand sidebar then open panel or link)
async function openPanelWithSidebar(fn){
  try {
    if(!sidebarVisible) await toggleSidebar();
    await fn();
  } catch (err) {
    console.error("[Sidebar] Failed to open panel", err);
  }
}
btnTasksIcon?.addEventListener("click", () => { void openPanelWithSidebar(showTasksPanel); });
btnUploaderIcon?.addEventListener("click", () => { void openPanelWithSidebar(showUploaderPanel); });
btnChatTabsIcon?.addEventListener("click", () => { void openPanelWithSidebar(showChatTabsPanel); });
btnArchiveTabsIcon?.addEventListener("click", () => { void openPanelWithSidebar(showArchiveTabsPanel); });
btnCodeTasksIcon?.addEventListener("click", () => { void handleCodeNavClick(true); });
btnFileTreeIcon?.addEventListener("click", () => { void openPanelWithSidebar(showFileTreePanel); });
btnFileCabinetIcon?.addEventListener("click", () => { void openPanelWithSidebar(showFileCabinetPanel); });
btnActivityIframeIcon?.addEventListener("click", () => { void openPanelWithSidebar(showActivityIframePanel); });
btnAiModelsIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); window.location.href = btnAiModels.dataset.url; });
btnImageGeneratorIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); window.location.href = btnImageGenerator.dataset.url; });
btnPortfolioIcon?.addEventListener("click", () => {
  if(!sidebarVisible) toggleSidebar();
  const url = btnPortfolio.dataset.url;
  window.open(url, "_blank");
});
btnJobsIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); const url = btnJobs.dataset.url; window.open(url, "_blank"); });
btnUpworkIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); const url = btnUpwork.dataset.url; const target = btnUpwork.dataset.target || "_self"; window.open(url, target); });
btnPipelineQueueIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); const url = btnPipelineQueue.dataset.url; window.open(url, "_blank"); });
btnNodesIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); const url = btnNodes.dataset.url; const target = btnNodes.dataset.target || "_self"; window.open(url, target); });
btnPrintifyProductsIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); showPrintifyProductsPanel(); });
btnNexumChatIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); window.location.href = btnNexumChat.dataset.url; });
btnNexumTabsIcon?.addEventListener("click", () => { if(!sidebarVisible) toggleSidebar(); window.location.href = btnNexumTabs.dataset.url; });

const codeProjectSelector = document.getElementById("codeProjectSelector");
const addCodeProjectButton = document.getElementById("addCodeProjectButton");
const addCodeProjectModal = document.getElementById("addCodeProjectModal");
const addCodeProjectForm = document.getElementById("addCodeProjectForm");
const addCodeProjectNameInput = document.getElementById("addCodeProjectNameInput");
const addCodeProjectRepoInput = document.getElementById("addCodeProjectRepoInput");
const addCodeProjectCancelBtn = document.getElementById("addCodeProjectCancelBtn");
const addCodeProjectError = document.getElementById("addCodeProjectError");
const tryDemoRepoBtn = document.getElementById("tryDemoRepoBtn");
const addCodeProjectSubmitBtn = document.getElementById("addCodeProjectSubmitBtn");

const codeTaskForm = document.getElementById("codeTaskForm");
const codeTaskInput = document.getElementById("codeTaskInput");
const codeTasksContainer = document.getElementById("codeTasksContainer");
const codeEnvironmentButton = document.getElementById("codeEnvironmentButton");
const sterlingLinkModal = document.getElementById("sterlingLinkModal");
const sterlingLinkModalCloseBtn = document.getElementById("sterlingLinkModalCloseBtn");
const sterlingLinkProjectNameEl = document.getElementById("sterlingLinkProjectName");
const sterlingLinkRepoInput = document.getElementById("sterlingLinkRepoInput");
const sterlingLinkCreateRepoBtn = document.getElementById("sterlingLinkCreateRepoBtn");
const sterlingLinkEditButton = document.getElementById("sterlingLinkEditButton");
const sterlingLinkDeleteBtn = document.getElementById("sterlingLinkDeleteBtn");

function updateSterlingModalProjectName(){
  const project = getSelectedCodeProject();
  if(sterlingLinkProjectNameEl){
    sterlingLinkProjectNameEl.textContent = project?.name || "Sterling Link";
  }
  if(sterlingLinkRepoInput){
    sterlingLinkRepoInput.value = project?.repoUrl || "";
  }
}

function clearAddCodeProjectError(){
  if(addCodeProjectError){
    addCodeProjectError.textContent = "";
  }
}

function openAddCodeProjectModal(){
  if(!addCodeProjectModal || !addCodeProjectForm || !addCodeProjectNameInput){
    return false;
  }
  addCodeProjectForm.reset();
  clearAddCodeProjectError();
  addCodeProjectNameInput.value = "New Project";
  if(addCodeProjectRepoInput){
    addCodeProjectRepoInput.value = "";
  }
  showModal(addCodeProjectModal);
  if(addCodeProjectSubmitBtn) addCodeProjectSubmitBtn.disabled = true;
  requestAnimationFrame(() => {
    addCodeProjectNameInput.focus();
    addCodeProjectNameInput.select();
  });
  return true;
}

function closeAddCodeProjectModal(){
  if(addCodeProjectModal){
    hideModal(addCodeProjectModal);
  }
  if(addCodeProjectForm){
    addCodeProjectForm.reset();
  }
  clearAddCodeProjectError();
}

function setAddCodeProjectError(message){
  if(addCodeProjectError){
    addCodeProjectError.textContent = message;
  }
}

if(codeEnvironmentButton && sterlingLinkModal){
  codeEnvironmentButton?.addEventListener("click", () => {
    updateSterlingModalProjectName();
    showModal(sterlingLinkModal);
  });
}

if(sterlingLinkModalCloseBtn && sterlingLinkModal){
  sterlingLinkModalCloseBtn?.addEventListener("click", () => {
    hideModal(sterlingLinkModal);
  });
}

function handleSterlingRepoInputCommit(ev){
  if(!sterlingLinkRepoInput) return;
  const target = ev.target;
  if(!(target instanceof HTMLInputElement)) return;
  const project = getSelectedCodeProject();
  if(!project) return;
  const trimmed = target.value.trim();
  if(project.repoUrl === trimmed){
    target.value = trimmed;
    return;
  }
  project.repoUrl = trimmed;
  target.value = trimmed;
  saveCodeProjects();
}

if(sterlingLinkRepoInput){
  sterlingLinkRepoInput?.addEventListener("change", handleSterlingRepoInputCommit);
  sterlingLinkRepoInput?.addEventListener("blur", handleSterlingRepoInputCommit);
}

if(sterlingLinkCreateRepoBtn){
  sterlingLinkCreateRepoBtn?.addEventListener("click", () => {
    window.open("https://github.com/new", "_blank", "noopener,noreferrer");
  });
}


if(sterlingLinkDeleteBtn){
  sterlingLinkDeleteBtn?.addEventListener("click", () => {
    const project = getSelectedCodeProject();
    if(!project) return;
    const confirmMsg = `Delete project "${project.name}" and all its tasks? This cannot be undone.`;
    if(!window.confirm(confirmMsg)) return;
    // Remove project
    codeProjects = codeProjects.filter(p => p.id !== project.id);
    // Remove tasks for project
    codeTasks = codeTasks.filter(t => t.projectId !== project.id);
    saveCodeTasks();
    saveCodeProjects();
    selectedCodeProjectId = null;
    ensureSelectedCodeProject();
    renderCodeProjectOptions();
    renderCodeTasks();
    hideModal(sterlingLinkModal);
  });
}
if(sterlingLinkEditButton){
  sterlingLinkEditButton?.addEventListener("click", () => {
    const project = getSelectedCodeProject();
    if(!project) return;
    const result = window.prompt("Project name", project.name);
    if(result === null) return;
    const trimmed = result.trim();
    if(!trimmed || trimmed === project.name) return;
    if(isCodeProjectNameTaken(trimmed, project.id)){
      window.alert("A project with that name already exists.");
      return;
    }
    project.name = trimmed;
    saveCodeProjects();
    renderCodeProjectOptions();
    renderCodeTasks();
    updateSterlingModalProjectName();
  });
}

const CODE_PROJECTS_STORAGE_KEY = "aurora.sidebar.codeProjects";
const CODE_SELECTED_PROJECT_KEY = "aurora.sidebar.selectedCodeProject";
const CODE_TASKS_STORAGE_KEY = "aurora.sidebar.codeTasks";

const loadedCodeProjects = loadStoredCodeProjects();
let codeProjects = loadedCodeProjects ? loadedCodeProjects.projects : [];
if(codeProjects.length === 0){
  codeProjects = getDefaultCodeProjects();
  saveCodeProjects();
} else if(loadedCodeProjects && loadedCodeProjects.mutated){
  saveCodeProjects();
}

let selectedCodeProjectId = loadStoredSelectedCodeProjectId(codeProjects);
if(!selectedCodeProjectId && codeProjects.length > 0){
  selectedCodeProjectId = codeProjects[0].id;
  saveSelectedCodeProjectId();
}

const loadedCodeTasksResult = loadStoredCodeTasks(codeProjects, selectedCodeProjectId);
let codeTasks = loadedCodeTasksResult ? loadedCodeTasksResult.tasks : null;
if(!codeTasks || codeTasks.length === 0){
  const projectId = ensureSelectedCodeProject();
  codeTasks = getDefaultCodeTasks().map(task => ({ ...task, projectId }));
  saveCodeTasks();
} else if(loadedCodeTasksResult && loadedCodeTasksResult.mutated){
  saveCodeTasks();
}

let draggingCodeTaskRow = null;

renderCodeProjectOptions();
updateSterlingModalProjectName();
renderCodeTasks();

addCodeProjectButton?.addEventListener("click", handleAddCodeProject);
addCodeProjectCancelBtn?.addEventListener("click", closeAddCodeProjectModal);
tryDemoRepoBtn?.addEventListener("click", ev => { ev.preventDefault(); /* placeholder demo button - no action */ });
addCodeProjectForm?.addEventListener("submit", handleAddCodeProjectSubmit);
addCodeProjectNameInput?.addEventListener("input", clearAddCodeProjectError);
addCodeProjectRepoInput?.addEventListener("input", ev => { clearAddCodeProjectError(); if(addCodeProjectSubmitBtn){ addCodeProjectSubmitBtn.disabled = !(addCodeProjectRepoInput.value && addCodeProjectRepoInput.value.trim()); } });
codeProjectSelector?.addEventListener("change", handleCodeProjectChange);

codeTaskForm?.addEventListener("submit", ev => {
  ev.preventDefault();
  const value = (codeTaskInput?.value || "").trim();
  if(!value) return;
  addCodeTask(value);
  if(codeTaskInput){
    codeTaskInput.value = "";
    codeTaskInput.focus();
  }
});

codeTasksContainer?.addEventListener("dragover", ev => {
  if(!draggingCodeTaskRow) return;
  if(ev.currentTarget !== codeTasksContainer) return;
  ev.preventDefault();
  if(ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
});

codeTasksContainer?.addEventListener("drop", ev => {
  if(!draggingCodeTaskRow) return;
  if(ev.currentTarget !== codeTasksContainer) return;
  ev.preventDefault();
  moveDraggedTaskToEnd();
});

function loadStoredCodeTasks(projects, fallbackProjectId){
  if(typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(CODE_TASKS_STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return null;
    const projectIds = new Set(projects.map(project => project.id));
    const tasks = [];
    let mutated = false;
    parsed.forEach(item => {
      if(!item || typeof item !== "object"){
        mutated = true;
        return;
      }
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if(!name){
        mutated = true;
        return;
      }
      const id = typeof item.id === "string" && item.id ? item.id : generateCodeTaskId();
      if(id !== item.id) mutated = true;
      let projectId = typeof item.projectId === "string" && projectIds.has(item.projectId)
        ? item.projectId
        : fallbackProjectId;
      if(!projectId){
        mutated = true;
        return;
      }
      if(projectId !== item.projectId) mutated = true;
      tasks.push({ id, name, projectId });
    });
    return { tasks, mutated };
  } catch (err) {
    console.warn("[CodeTasks] Failed to load stored tasks", err);
    return null;
  }
}

function loadStoredCodeProjects(){
  if(typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(CODE_PROJECTS_STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return null;
    const projects = [];
    let mutated = false;
    parsed.forEach(item => {
      if(!item || typeof item !== "object"){
        mutated = true;
        return;
      }
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if(!name){
        mutated = true;
        return;
      }
      const id = typeof item.id === "string" && item.id ? item.id : generateCodeProjectId();
      if(id !== item.id) mutated = true;
      const hasRepoUrl = typeof item.repoUrl === "string";
      const rawRepoUrl = hasRepoUrl ? item.repoUrl : "";
      const repoUrl = rawRepoUrl.trim();
      if(!hasRepoUrl) mutated = true;
      if(repoUrl !== rawRepoUrl) mutated = true;
      projects.push({ id, name, repoUrl });
    });
    return { projects, mutated };
  } catch (err) {
    console.warn("[CodeProjects] Failed to load stored projects", err);
    return null;
  }
}

function saveCodeProjects(){
  if(typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(CODE_PROJECTS_STORAGE_KEY, JSON.stringify(codeProjects));
  } catch (err) {
    console.warn("[CodeProjects] Failed to persist projects", err);
  }
}

function getDefaultCodeProjects(){
  return [
    { id: generateCodeProjectId(), name: "New Project", repoUrl: "" }
  ];
}

function loadStoredSelectedCodeProjectId(projects){
  const fallbackId = projects[0]?.id || null;
  if(typeof window === "undefined" || !window.localStorage) return fallbackId;
  try {
    const stored = window.localStorage.getItem(CODE_SELECTED_PROJECT_KEY);
    if(stored && projects.some(project => project.id === stored)){
      return stored;
    }
  } catch (err) {
    console.warn("[CodeProjects] Failed to load selected project", err);
  }
  return fallbackId;
}

function saveSelectedCodeProjectId(){
  if(typeof window === "undefined" || !window.localStorage) return;
  try {
    if(selectedCodeProjectId){
      window.localStorage.setItem(CODE_SELECTED_PROJECT_KEY, selectedCodeProjectId);
    } else {
      window.localStorage.removeItem(CODE_SELECTED_PROJECT_KEY);
    }
  } catch (err) {
    console.warn("[CodeProjects] Failed to persist selected project", err);
  }
}

function ensureSelectedCodeProject(){
  if(codeProjects.length === 0){
    codeProjects = getDefaultCodeProjects();
    saveCodeProjects();
  }
  if(!selectedCodeProjectId || !codeProjects.some(project => project.id === selectedCodeProjectId)){
    selectedCodeProjectId = codeProjects[0]?.id || null;
    saveSelectedCodeProjectId();
  }
  return selectedCodeProjectId;
}

function handleAddCodeProject(){
  if(openAddCodeProjectModal()){
    return;
  }
  const result = window.prompt("Project name", "New Project");
  if(result === null) return;
  const trimmed = result.trim();
  if(!trimmed) return;
  if(isCodeProjectNameTaken(trimmed)){
    window.alert("A project with that name already exists.");
    return;
  }
  createCodeProjectEntry(trimmed, "");
}

function handleCodeProjectChange(){
  if(!codeProjectSelector) return;
  const newId = codeProjectSelector.value;
  if(!newId) return;
  if(!codeProjects.some(project => project.id === newId)) return;
  selectedCodeProjectId = newId;
  saveSelectedCodeProjectId();
  renderCodeTasks();
  updateSterlingModalProjectName();
}

function renderCodeProjectOptions(){
  if(!codeProjectSelector) return;
  codeProjectSelector.innerHTML = "";
  ensureSelectedCodeProject();
  codeProjects.forEach(project => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    codeProjectSelector.appendChild(option);
  });
  if(selectedCodeProjectId){
    codeProjectSelector.value = selectedCodeProjectId;
  }
}

function getSelectedCodeProject(){
  return codeProjects.find(project => project.id === selectedCodeProjectId) || null;
}

function getTasksForProject(projectId){
  if(!projectId) return [];
  return codeTasks.filter(task => task.projectId === projectId);
}

function setTasksForProject(projectId, tasks){
  const replacements = [...tasks];
  codeTasks = codeTasks.map(task => {
    if(task.projectId === projectId){
      return replacements.shift() || task;
    }
    return task;
  });
}

function saveCodeTasks(){
  if(typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(CODE_TASKS_STORAGE_KEY, JSON.stringify(codeTasks));
  } catch (err) {
    console.warn("[CodeTasks] Failed to persist tasks", err);
  }
}

function getDefaultCodeTasks(){
  return [
    { id: generateCodeTaskId(), name: "Refine sidebar navigation icons" },
    { id: generateCodeTaskId(), name: "Review pull request automation flow" },
    { id: generateCodeTaskId(), name: "Update unit tests for chat module" }
  ];
}

function generateCodeProjectId(){
  if(typeof crypto !== "undefined" && crypto.randomUUID){
    return crypto.randomUUID();
  }
  return `code-project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isCodeProjectNameTaken(name, excludeId = null){
  const normalized = typeof name === "string" ? name.trim().toLowerCase() : "";
  if(!normalized) return false;
  return codeProjects.some(project => {
    if(excludeId && project.id === excludeId) return false;
    return project.name.trim().toLowerCase() === normalized;
  });
}

function createCodeProjectEntry(name, repoUrl){
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if(!trimmedName) return null;
  const trimmedRepoUrl = typeof repoUrl === "string" ? repoUrl.trim() : "";
  const newProject = { id: generateCodeProjectId(), name: trimmedName, repoUrl: trimmedRepoUrl };
  codeProjects.push(newProject);
  saveCodeProjects();
  selectedCodeProjectId = newProject.id;
  saveSelectedCodeProjectId();
  renderCodeProjectOptions();
  updateSterlingModalProjectName();
  renderCodeTasks();
  if(codeTaskInput){
    codeTaskInput.focus();
  }
  return newProject;
}

function handleAddCodeProjectSubmit(ev){
  ev.preventDefault();
  if(!addCodeProjectNameInput) return;
  const name = (addCodeProjectNameInput.value || "").trim();
  const repoUrl = addCodeProjectRepoInput ? addCodeProjectRepoInput.value.trim() : "";
  clearAddCodeProjectError();
  if(!name){
    setAddCodeProjectError("Project name is required.");
    addCodeProjectNameInput.focus();
    return;
  }
  if(isCodeProjectNameTaken(name)){
    setAddCodeProjectError("A project with that name already exists.");
    addCodeProjectNameInput.focus();
    addCodeProjectNameInput.select();
    return;
  }
  if(!repoUrl){
    setAddCodeProjectError("Git repository URL is required.");
    if(addCodeProjectRepoInput){ addCodeProjectRepoInput.focus(); addCodeProjectRepoInput.select(); }
    return;
  }
  createCodeProjectEntry(name, repoUrl);
  closeAddCodeProjectModal();
}

function generateCodeTaskId(){
  if(typeof crypto !== "undefined" && crypto.randomUUID){
    return crypto.randomUUID();
  }
  return `code-task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addCodeTask(name){
  const trimmed = name.trim();
  if(!trimmed) return;
  const projectId = ensureSelectedCodeProject();
  codeTasks.push({ id: generateCodeTaskId(), name: trimmed, projectId });
  saveCodeTasks();
  renderCodeTasks();
}

function deleteCodeTask(id){
  const idx = codeTasks.findIndex(task => task.id === id);
  if(idx === -1) return;
  codeTasks.splice(idx, 1);
  saveCodeTasks();
  renderCodeTasks();
}

function renameCodeTask(id){
  const task = codeTasks.find(t => t.id === id);
  if(!task) return;
  const result = window.prompt("Edit code task", task.name);
  if(result === null) return;
  const trimmed = result.trim();
  if(!trimmed) return;
  if(trimmed === task.name) return;
  task.name = trimmed;
  saveCodeTasks();
  renderCodeTasks();
}

function renderCodeTasks(){
  if(!codeTasksContainer) return;
  codeTaskDragEnd();
  codeTasksContainer.innerHTML = "";
  const projectId = ensureSelectedCodeProject();
  const tasksForProject = getTasksForProject(projectId);
  if(tasksForProject.length === 0){
    const empty = document.createElement("div");
    empty.className = "code-task-empty";
    const project = getSelectedCodeProject();
    empty.textContent = project ? `No code tasks for ${project.name} yet.` : "No code tasks yet.";
    codeTasksContainer.appendChild(empty);
    return;
  }
  tasksForProject.forEach(task => {
    const row = document.createElement("div");
    row.className = "sidebar-tab-row code-task-row";
    row.dataset.taskId = task.id;
    row.dataset.projectId = task.projectId;
    row?.addEventListener("dragover", codeTaskDragOver);
    row?.addEventListener("dragleave", codeTaskDragLeave);
    row?.addEventListener("drop", codeTaskDrop);

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.draggable = true;
    handle?.addEventListener("dragstart", codeTaskDragStart);
    handle?.addEventListener("dragend", codeTaskDragEnd);
    row.appendChild(handle);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-task-button";
    button.title = task.name;
    button?.addEventListener("click", () => renameCodeTask(task.id));

    const icon = document.createElement("span");
    icon.className = "code-task-icon";
    icon.textContent = "</>";
    button.appendChild(icon);

    const text = document.createElement("span");
    text.className = "code-task-text";
    text.textContent = task.name;
    button.appendChild(text);

    row.appendChild(button);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "code-task-delete-btn";
    deleteBtn.setAttribute("aria-label", "Delete code task");
    deleteBtn.innerHTML = "&times;";
    deleteBtn?.addEventListener("click", () => deleteCodeTask(task.id));
    row.appendChild(deleteBtn);

    codeTasksContainer.appendChild(row);
  });
}

function codeTaskDragStart(ev){
  const row = ev.target.closest(".code-task-row");
  if(!row) return;
  draggingCodeTaskRow = row;
  row.classList.add("dragging");
  if(ev.dataTransfer){
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", row.dataset.taskId || "");
  }
}

function codeTaskDragOver(ev){
  if(!draggingCodeTaskRow) return;
  const target = ev.currentTarget;
  if(target === draggingCodeTaskRow) return;
  ev.preventDefault();
  target.classList.add("drag-over");
}

function codeTaskDragLeave(ev){
  ev.currentTarget.classList.remove("drag-over");
}

function codeTaskDrop(ev){
  if(!draggingCodeTaskRow) return;
  ev.preventDefault();
  ev.stopPropagation();
  const target = ev.currentTarget;
  target.classList.remove("drag-over");
  if(target === draggingCodeTaskRow) return;
  const draggedId = draggingCodeTaskRow.dataset.taskId;
  const targetId = target.dataset.taskId;
  const projectId = draggingCodeTaskRow.dataset.projectId || ensureSelectedCodeProject();
  if(!draggedId || !targetId || !projectId) return;
  const tasksForProject = getTasksForProject(projectId);
  const draggedIndex = tasksForProject.findIndex(task => task.id === draggedId);
  const targetIndex = tasksForProject.findIndex(task => task.id === targetId);
  if(draggedIndex === -1 || targetIndex === -1) return;
  const [draggedTask] = tasksForProject.splice(draggedIndex, 1);
  let insertIndex = targetIndex;
  if(draggedIndex < targetIndex) insertIndex -= 1;
  const dropAfter = ev.offsetY >= target.offsetHeight / 2;
  if(dropAfter) insertIndex += 1;
  if(insertIndex < 0) insertIndex = 0;
  if(insertIndex > tasksForProject.length) insertIndex = tasksForProject.length;
  tasksForProject.splice(insertIndex, 0, draggedTask);
  setTasksForProject(projectId, tasksForProject);
  saveCodeTasks();
  renderCodeTasks();
}

function moveDraggedTaskToEnd(){
  if(!draggingCodeTaskRow) return;
  const draggedId = draggingCodeTaskRow.dataset.taskId;
  const projectId = draggingCodeTaskRow.dataset.projectId || ensureSelectedCodeProject();
  if(!draggedId || !projectId) return;
  const tasksForProject = getTasksForProject(projectId);
  const draggedIndex = tasksForProject.findIndex(task => task.id === draggedId);
  if(draggedIndex === -1) return;
  const [draggedTask] = tasksForProject.splice(draggedIndex, 1);
  tasksForProject.push(draggedTask);
  setTasksForProject(projectId, tasksForProject);
  saveCodeTasks();
  renderCodeTasks();
}

function codeTaskDragEnd(){
  document.querySelectorAll("#codeTasksContainer .code-task-row.drag-over").forEach(el => el.classList.remove("drag-over"));
  if(draggingCodeTaskRow){
    draggingCodeTaskRow.classList.remove("dragging");
    draggingCodeTaskRow = null;
  }
}
// Thin sidebar icon actions
thinCodeIcon?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  void openPanelWithSidebar(showCodeTasksPanel);
});
thinChatIcon?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  void openPanelWithSidebar(showChatTabsPanel);
});
thinImagesIcon?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  void openPanelWithSidebar(showUploaderPanel);
});
// Ensure taps on mobile trigger the same actions
thinCodeIcon?.addEventListener("touchstart", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  void openPanelWithSidebar(showCodeTasksPanel);
});
thinChatIcon?.addEventListener("touchstart", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  void openPanelWithSidebar(showChatTabsPanel);
});
thinImagesIcon?.addEventListener("touchstart", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  void openPanelWithSidebar(showUploaderPanel);
});

(async function init(){
  const placeholderEl = document.getElementById("chatPlaceholder");
  if(placeholderEl) placeholderEl.style.display = "";
  await loadSettings();
  if(initialSearchMode){
    searchEnabled = true;
    updateSearchButton();
  }
  await getSettings([
    "ai_model","ai_search_model","last_chat_tab","last_sidebar_view",
    "model_tabs","last_model_tab",
    "sterling_project","sterling_chat_url"
  ]);
  await populateFilters();
  await loadTasks();
  try {
    const r = await fetch("/api/model");
    console.debug("[Client Debug] /api/model => status:", r.status);
    if(r.ok){
      const data = await r.json();
      console.debug("[Client Debug] /api/model data =>", data);
      modelName = data.model || "unknown";
    }
  } catch(e){
    modelName = "unknown";
  }

  console.log("[OBTAINED PROVIDER] => (global model removed in UI)");
  const { provider: autoProvider } = parseProviderModel(modelName);
  console.log("[OBTAINED PROVIDER] =>", autoProvider);
  updateModelHud();

  if(initialPathAlias === DESIGN_CHAT_ALIAS){
    const info = await ensureDesignTabForSession();
    if(info && info.uuid){
      initialTabUuid = info.uuid;
    }
  }

  await loadTabs();
  await loadSubroutines();
  renderSubroutines();

  let autoCreatedInitialChat = false;
  if(chatTabs.length === 0){
    autoCreatedInitialChat = await autoCreateInitialChatTab();
  }
  if(chatTabs.length === 0 && !autoCreatedInitialChat){
    openNewTabModal();
  }
  const lastChatTab = await getSetting("last_chat_tab");
  if(initialTabUuid){
    const found = chatTabs.find(t => t.tab_uuid === initialTabUuid);
    if(found) currentTabId = found.id;
    else if(lastChatTab){
      const foundTab = chatTabs.find(t => t.id===parseInt(lastChatTab,10));
      if(foundTab) currentTabId = foundTab.id;
    }
  } else if(lastChatTab){
    const foundTab = chatTabs.find(t => t.id===parseInt(lastChatTab,10));
    if(foundTab) currentTabId = foundTab.id;
  }
  if(!currentTabId && chatTabs.length>0){
    const firstActive = chatTabs.find(t => !t.archived);
    currentTabId = firstActive ? firstActive.id : chatTabs[0].id;
  }
  if(initialPathAlias === '/code'){
    const codeTab = chatTabs.find(t => t.tab_type === 'code' && !t.archived);
    if(codeTab){
      currentTabId = codeTab.id;
    }
  }
  {
    const firstTab = chatTabs.find(t => t.id === currentTabId);
    currentTabType = firstTab ? firstTab.tab_type || 'chat' : 'chat';
    tabGenerateImages = currentTabType === 'design';
    const chk = document.getElementById("tabGenerateImagesCheck");
    if(chk){
      chk.checked = tabGenerateImages;
      chk.disabled = currentTabType !== 'design';
    }
    updateRepeatButtonVisibility();
  }
  setCodeNavActiveState(currentTabType === 'code');
  // If the user navigated directly to `/code` (via URL) we should hide the
  // chat panel on initial load so the right-hand chat column remains blank.
  if(initialPathAlias === '/code'){
    showCodeTasksPanel();
    const chatPanelEl = document.getElementById('chatPanel') || document.querySelector('.chat-panel');
    if(chatPanelEl){
      chatPanelEl.style.display = 'none';
    }
  }
  {
    const currentTab = chatTabs.find(t => t.id === currentTabId);
    tabModelOverride = currentTab && currentTab.model_override ? currentTab.model_override : '';
    const globalModel = await getSetting("ai_model");
    modelName = tabModelOverride || globalModel || "unknown";
    updateModelHud();
  }
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  if(chatTabs.length>0){
    await loadChatHistory(currentTabId, true);
    const ct = chatTabs.find(t => t.id === currentTabId);
    const path = resolveTabPath(ct);
    if(path){
      const currentPath = window.location.pathname;
      const isChatPath = currentPath.startsWith('/chat/');
      const isCodePath = currentPath.startsWith('/code');
      if((isChatPath || isCodePath) && currentPath !== '/new' && currentPath !== path){
        window.history.replaceState({}, '', path);
      }
    }
    if(initialSearchMode){
      await enableSearchMode(initialSearchQuery);
    }
  }

  try {
    const r2 = await fetch("/api/settings/agent_instructions");
    if(r2.ok){
      const { value } = await r2.json();
      const displayedInstrEl = document.querySelector("#displayedInstructions");
      if (displayedInstrEl) {
        displayedInstrEl.textContent = value || "(none)";
      }
      window.agentInstructions = value || "";
    }
  } catch(e){
    console.error("Error loading agent instructions:", e);
    window.agentInstructions = "";
  }

  // Previously forced chatHideMetadata to "true" – now corrected:
  try {
    const r3 = await fetch("/api/settings/chat_hide_metadata");
    if(r3.ok){
      const j = await r3.json();
      if(typeof j.value !== "undefined"){
        chatHideMetadata = !!j.value;
      } else {
        chatHideMetadata = true;
        await setSetting("chat_hide_metadata", chatHideMetadata);
      }
    } else {
      chatHideMetadata = true;
      await setSetting("chat_hide_metadata", chatHideMetadata);
    }
  } catch(e) {
    console.error("Error loading chat_hide_metadata:", e);
    chatHideMetadata = true;
    await setSetting("chat_hide_metadata", chatHideMetadata);
  }

  // Always hide token counts for now
  showSubbubbleToken = false;

  await loadFileList();
  setupFileSorting();
  const uploaderContainer = document.getElementById("sidebarViewUploader");
  if(uploaderContainer){
    uploaderContainer?.addEventListener("scroll", async () => {
      if(uploaderContainer.scrollTop + uploaderContainer.clientHeight >= uploaderContainer.scrollHeight - 20){
        await loadNextFilePage();
      }
    });
  }

  favElement = document.getElementById("favicon");
  if (favElement) {
    favElement.href = defaultFavicon;
  }

  // Sync hidden chat settings checkboxes with loaded values before saving
  $("#hideMetadataCheck").checked = chatHideMetadata;
  $("#autoNamingCheck").checked = chatTabAutoNaming;
  const subbubbleTokenCheckEl2 = $("#subbubbleTokenCheck");
  if(subbubbleTokenCheckEl2) subbubbleTokenCheckEl2.checked = showSubbubbleToken;
  $("#sterlingUrlCheck").checked = sterlingChatUrlVisible;
  $("#chatStreamingCheck").checked = chatStreaming;
  const markdownCheck = document.getElementById("showMarkdownTasksCheck");
  if(markdownCheck) markdownCheck.checked = markdownPanelVisible;
  $("#showDependenciesColumnCheck").checked = showDependenciesColumn;
  const subroutineCheck = document.getElementById("showSubroutinePanelCheck");
  if(subroutineCheck) subroutineCheck.checked = subroutinePanelVisible;
  $("#enterSubmitCheck").checked = enterSubmitsMessage;
  $("#showNavMenuCheck").checked = navMenuVisible;
  const imgSvcInitSel = document.getElementById("imageServiceSelect");
  if(imgSvcInitSel) imgSvcInitSel.value = imageGenService;

  await chatSettingsSaveFlow();
  await updateProjectInfo();

  try {
    const r = await fetch("/api/settings/sterling_chat_url");
    if(r.ok){
      const { value } = await r.json();
      if(value){
        const lbl = document.getElementById("sterlingUrlLabel");
        if(lbl){
          lbl.innerHTML =
            'Sterling chat: <a href="' + value + '" target="_blank">' + value + '</a>';
        }
      }
    }
  } catch(e){
    console.error("Error fetching sterling_chat_url:", e);
  }
  toggleSterlingUrlVisibility(sterlingChatUrlVisible);
  toggleProjectInfoBarVisibility(projectInfoBarVisible && auroraProjectBarVisible);

  let lastView = await getSetting("last_sidebar_view");
  if(!lastView) lastView = "chatTabs";
  switch(lastView){
    case "tasks": showTasksPanel(); break;
    case "uploader": await showUploaderPanel(); break;
    case "fileTree": showFileTreePanel(); break;
    case "fileCabinet": showFileCabinetPanel(); break;
    case "chatTabs": void showChatTabsPanel(); break;
    case "archiveTabs": showArchiveTabsPanel(); break;
    case "activity": showActivityIframePanel(); break;
    case "printify": showPrintifyProductsPanel(); break;
    case "codeTasks": showCodeTasksPanel(); break;
    default: await showUploaderPanel(); break;
  }

  updateView('chat');

  initChatScrollLoading();

  updatePageTitle();

  // -----------------------------------------------------------------------
  // Load the global markdown content on startup
  // -----------------------------------------------------------------------
  try {
    const mdResp = await fetch("/api/markdown");
    if(mdResp.ok){
      const mdData = await mdResp.json();
      const markdownInput = document.getElementById("markdownInput");
      if(markdownInput) markdownInput.value = mdData.content || "";
    }
  } catch(e) {
    console.error("Error loading markdown content:", e);
  }

  navMenuLoading = false;
  toggleNavMenuVisibility(navMenuVisible);

})();

function initChatScrollLoading(){
  const chatMessagesEl = document.getElementById("chatMessages");
  if(!chatMessagesEl) return;

  chatMessagesEl?.addEventListener("scroll", async ()=>{
    if(chatMessagesEl.scrollTop < 50 && !chatHistoryLoading){
      console.debug(`[ChatHistory Debug] scrollTop=${chatMessagesEl.scrollTop}, chatHasMore=${chatHasMore}, offset=${chatHistoryOffset}`);
      if(chatHasMore){
        await loadChatHistory(currentTabId, false);
      } else {
        console.debug('[ChatHistory Debug] No additional history to load');
      }
    }
  });
}

let chatHistoryOffset = 0;
let chatHasMore = true;
let chatHistoryLoading = false; // prevent duplicate history loads
let lastChatDate = null;
const prefabGreetingPendingTabs = new Set();

async function loadChatHistory(tabId = currentTabId, reset=false) {
  if(chatHistoryLoading) return;
  chatHistoryLoading = true;
  const chatMessagesEl = document.getElementById("chatMessages");
  console.debug(`[ChatHistory Debug] loadChatHistory(tabId=${tabId}, reset=${reset}, offset=${chatHistoryOffset})`);
  if(reset){
    chatMessagesEl.innerHTML = `
      <div id="chatPlaceholder" style="text-align:center;margin:1rem 0;">
        <span class="loading-spinner"></span>
      </div>
      <div id="imageGenerationIndicator" style="display:none; color:#0ff; margin:8px 0;">Generating image<span class="loading-spinner"></span></div>
      <div id="startSuggestions" style="display:none;"></div>
    `;
    chatHistoryOffset = 0;
    chatHasMore = true;
    lastChatDate = null;
  }
  const placeholderEl = document.getElementById("chatPlaceholder");
  if(!tabId){
    if(reset && placeholderEl){
      placeholderEl.innerHTML = "Select or create a chat to get started.";
      placeholderEl.style.display = "";
    }
    chatHasMore = false;
    chatHistoryLoading = false;
    window.location.href = "https://alfe.sh";
    return;
  }
  if(reset && placeholderEl) placeholderEl.style.display = "";
  let pairs = [];
  try {
    console.debug(`[ChatHistory Debug] Fetching /api/chat/history?tabId=${tabId}&limit=10&offset=${chatHistoryOffset}`);
    const resp = await fetch(`/api/chat/history?tabId=${tabId}&limit=10&offset=${chatHistoryOffset}&sessionId=${encodeURIComponent(sessionId)}`);
    console.debug(`[ChatHistory Debug] Response status: ${resp.status}`);
    if(!resp.ok){
      const status = resp.status;
      console.error(`Error loading chat history from server (status ${status})`);
      chatHasMore = false;
      if(reset && placeholderEl){
        let heading = 'We couldn\'t open this chat.';
        let detail = 'Try refreshing the page or choose another chat from the sidebar.';
        if(status === 403){
          detail = 'This chat belongs to a different browser session. Open one of your chats or start a new conversation.';
        } else if(status === 404){
          detail = 'This chat was not found. It may have been deleted or never existed.';
        }
        placeholderEl.innerHTML = `
          <div class="chat-error-state">
            <strong>${heading}</strong>
            <p>${detail}</p>
            <button type="button" class="chat-error-action" id="chatErrorNewTabBtn">Start a new task or ask a question</button>
            <p><a href="/">Return to the task dashboard</a></p>
          </div>`;
        placeholderEl.style.display = '';
        setTimeout(() => {
          const newTabBtn = document.getElementById('chatErrorNewTabBtn');
          if(newTabBtn){
            newTabBtn?.addEventListener('click', ev => {
              ev.preventDefault();
              openNewTabModal();
            }, { once: true });
          }
        });
      }
      return;
    }
    const data = await resp.json();
    pairs = data.pairs || [];
    console.debug(`[ChatHistory Debug] Received ${pairs.length} pairs`);
    if(pairs.length<10){
      chatHasMore = false;
    }
    chatHistoryOffset += pairs.length;
    console.debug(`[ChatHistory Debug] new offset=${chatHistoryOffset}, chatHasMore=${chatHasMore}`);

    if(reset){
      if(pairs.length === 0){
        const tabInfo = chatTabs.find(t => t.id === tabId);
        const greetingMessage = tabInfo && tabInfo.tab_type === 'code' ? CODE_CHAT_GREETING : null;
        const greetingText = renderInitialGreeting(greetingMessage);
        if(greetingText) persistPrefabGreeting(tabId, greetingText);
      } else {
        for (const p of pairs) {
          addChatMessage(
              p.id, p.user_text, p.timestamp,
              p.ai_text, p.ai_timestamp,
              p.model, p.system_context, p.project_context, null, p.token_info, p.citations_json,
              p.image_url, p.image_alt, p.image_title
          );
        }
        if(placeholderEl) placeholderEl.style.display = "none";
        scrollChatToBottom();
      }
    } else {
      const scrollPos = chatMessagesEl.scrollHeight;
      const fragment = document.createDocumentFragment();
      let prevDate = null;
      for (let i = pairs.length-1; i>=0; i--){
        const p = pairs[i];
        const dateStr = isoDate(p.timestamp || p.ai_timestamp);
        if(prevDate !== dateStr){
          const dateDiv = document.createElement("div");
          dateDiv.className = "chat-date-header";
          dateDiv.textContent = dateStr;
          fragment.appendChild(dateDiv);
          prevDate = dateStr;
        }
        const seqDiv = document.createElement("div");
        seqDiv.className = "chat-sequence";
        seqDiv.dataset.pairId = p.id;

        if(p.user_text && p.user_text.trim()){
          const userDiv = document.createElement("div");
          userDiv.className = "chat-user";
          {
            const userHead = document.createElement("div");
            userHead.className = "bubble-header";
            const userLabel = "You";
            userHead.innerHTML = `
              <div class="name-oval name-oval-user">${userLabel}</div>
            `;
            const uCopy = document.createElement("button");
            uCopy.className = "bubble-copy-btn";
            uCopy.textContent = "\u2398"; // copy icon
            uCopy.title = "Copy message";
            uCopy?.addEventListener("click", () => {
              navigator.clipboard.writeText(stripPlaceholderImageLines(p.user_text) || "");
              showToast("Copied to clipboard");
            });
            userHead.appendChild(uCopy);
            userDiv.appendChild(userHead);

            const userBody = document.createElement("div");
            userBody.className = "user-subbubble";
            userBody.innerHTML = formatCodeBlocks(p.user_text);
            addCodeCopyButtons(userBody);
            userDiv.appendChild(userBody);
          }

          if(p.token_info && showSubbubbleToken){
            try {
              const tInfo = JSON.parse(p.token_info);
              const inputT = (tInfo.systemTokens || 0) + (tInfo.historyTokens || 0) + (tInfo.inputTokens || 0);
              const outputT = (tInfo.assistantTokens || 0) + (tInfo.finalAssistantTokens || 0);

              userDiv._tokenSections = { input: inputT, output: outputT };
              const userTokenDiv = document.createElement("div");
              userTokenDiv.className = "token-indicator";
              const pairTokens = tInfo.inputTokens || 0;
              userTokenDiv.textContent = `In: ${pairTokens} (${inputT})`;
              userDiv.appendChild(userTokenDiv);
            } catch (e) {
              console.debug("[Server Debug] Could not parse token_info for pair =>", p.id, e.message);
            }
          }

          seqDiv.appendChild(userDiv);
        }

        const botDiv = document.createElement("div");
        botDiv.className = "chat-bot";

        const botHead = document.createElement("div");
        botHead.className = "bubble-header";

        const { provider, shortModel } = parseProviderModel(p.model);
        const displayShort = shortModel;
        const { label: providerLabel } = formatProviderDisplay(provider);
        const providerTitle = providerLabel ? `${providerLabel} / ${displayShort}` : displayShort;
        const titleAttr = p.image_url ? "" : ` title="${providerTitle}"`;
        botHead.innerHTML = `
          <div class="name-oval name-oval-ai"${titleAttr}>${window.agentName}</div>
        `;
        const aCopy = document.createElement("button");
        aCopy.className = "bubble-copy-btn";
        aCopy.textContent = "\u2398";
        aCopy.title = "Copy message";
        aCopy?.addEventListener("click", () => {
          navigator.clipboard.writeText(stripPlaceholderImageLines(p.ai_text) || "");
          showToast("Copied to clipboard");
        });
        botHead.appendChild(aCopy);
        botDiv.appendChild(botHead);

        if(p.image_url){
          const img = document.createElement("img");
          img.src = p.image_url;
          img.alt = p.image_alt || "";
          if(p.image_title) img.title = p.image_title;
          img.style.maxWidth = "min(100%, 400px)";
          img.style.height = "auto";
          img?.addEventListener('load', () => setTimeout(scrollChatToBottom, 1000));
          botDiv.appendChild(img);
        }

        const botBody = document.createElement("div");
        renderAssistantContent(botBody, p.ai_text || "", p.model, { resetReasoningExpanded: true });
        botDiv.appendChild(botBody);
        addFilesFromCodeBlocks(p.ai_text || "");
        appendModelInfoIcon(botDiv, p.model);
        appendModelLabel(botDiv, p.model, displayShort, p.token_info);
        if(p.citations_json){
          try {
            const cites = JSON.parse(p.citations_json);
            if(Array.isArray(cites) && cites.length>0){
              const citeDiv = document.createElement('div');
              citeDiv.className = 'chat-citations';
              const list = document.createElement('ul');
              cites.forEach(c => {
                if(!c || !c.url) return;
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = c.url;
                a.textContent = c.url;
                a.target = '_blank';
                li.appendChild(a);
                list.appendChild(li);
              });
              citeDiv.appendChild(list);
              botDiv.appendChild(citeDiv);
            }
          } catch(e){ console.debug('parse citations failed', e); }
        }


        if(p.token_info && showSubbubbleToken){
          try {
            const tInfo = JSON.parse(p.token_info);
            const outTokens = (tInfo.assistantTokens || 0) + (tInfo.finalAssistantTokens || 0);
            const combinedDiv = document.createElement("div");
            combinedDiv.className = "token-indicator";
            combinedDiv.textContent = `Out: ${outTokens} (Time: ${(tInfo.responseTime*10)?.toFixed(2) || "?"}s)`;
            botDiv.appendChild(combinedDiv);
          } catch(e){
            console.debug("[Server Debug] Could not parse token_info for prepended pair =>", e.message);
          }
        }

        // Model labels previously shown under the AI bubble were removed per UX request.

        seqDiv.appendChild(botDiv);
        const pairDel = document.createElement("button");
        pairDel.className = "delete-chat-btn pair-delete-btn";
        pairDel.textContent = "🗑";
        pairDel.title = "Delete this chat pair";
        pairDel?.addEventListener("click", async () => {
          const confirmed = await showConfirmDialog({
            title: "Delete chat pair",
            message: "Are you sure you want to delete this pair?",
            confirmText: "Delete",
            cancelText: "Cancel",
            danger: true
          });
          if(!confirmed) return;
          const r = await fetch(`/api/chat/pair/${p.id}`, { method:"DELETE" });
          if(r.ok) seqDiv.remove();
        });
        if(p.image_url){
          pairDel.style.top = "auto";
          pairDel.style.bottom = "4px";
        }
        seqDiv.appendChild(pairDel);
        fragment.appendChild(seqDiv);
      }
      if(chatMessagesEl.firstChild){
        chatMessagesEl.insertBefore(fragment, chatMessagesEl.firstChild);
      } else {
        chatMessagesEl.appendChild(fragment);
      }
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight - scrollPos;
      if(pairs.length>0 && placeholderEl) placeholderEl.style.display = "none";
    }
  } catch (err) {
    console.error("Error loading chat history:", err);
  } finally {
    chatHistoryLoading = false;
    if(reset){
      renderDesignSuggestions(currentTabType === 'design' && pairs.length === 0);
    }
  }
}

function addChatMessage(pairId, userText, userTs, aiText, aiTs, model, systemContext, projectContext, fullHistory, tokenInfo, citationsJson='', imageUrl=null, imageAlt='', imageTitle='') {
  const chatMessagesEl = document.getElementById("chatMessages");
  const ts = userTs || aiTs || new Date().toISOString();
  const dateStr = isoDate(ts);
  if(chatMessagesEl && lastChatDate !== dateStr){
    const dateDiv = document.createElement("div");
    dateDiv.className = "chat-date-header";
    dateDiv.textContent = dateStr;
    appendChatElement(dateDiv);
    lastChatDate = dateStr;
  }

  const seqDiv = document.createElement("div");
  seqDiv.className = "chat-sequence";
  seqDiv.dataset.pairId = pairId;

  if(userText && userText.trim()){
    const userDiv = document.createElement("div");
    userDiv.className = "chat-user";
    {
      const userHead = document.createElement("div");
      userHead.className = "bubble-header";
      const userLabel = "You";
      userHead.innerHTML = `<div class="name-oval name-oval-user">${userLabel}</div>`;
      const userCopyBtn = document.createElement("button");
      userCopyBtn.className = "bubble-copy-btn";
      userCopyBtn.textContent = "\u2398";
      userCopyBtn.title = "Copy message";
      userCopyBtn?.addEventListener("click", () => {
        navigator.clipboard.writeText(stripPlaceholderImageLines(userText) || "");
        showToast("Copied to clipboard");
      });
      const userEditBtn = document.createElement("button");
      userEditBtn.className = "bubble-edit-btn";
      userEditBtn.textContent = "✎";
      userEditBtn.title = "Edit user message";
      userEditBtn?.addEventListener("click", () => {
        openEditMessageModal(pairId, "user", userText, newText => {
          userText = newText;
          userBody.textContent = newText;
        });
      });
      userHead.appendChild(userCopyBtn);
      userHead.appendChild(userEditBtn);
      userDiv.appendChild(userHead);

      const userBody = document.createElement("div");
      userBody.className = "user-subbubble";
      userBody.innerHTML = formatCodeBlocks(userText);
      addCodeCopyButtons(userBody);
      userDiv.appendChild(userBody);
    }

    if(tokenInfo && showSubbubbleToken){
      try {
        const tInfo = JSON.parse(tokenInfo);
        const userInTokens = (tInfo.systemTokens||0) + (tInfo.historyTokens||0) + (tInfo.inputTokens||0);
        const pairTokens = tInfo.inputTokens || 0;
        const userTokenDiv = document.createElement("div");
        userTokenDiv.className = "token-indicator";
        userTokenDiv.textContent = `In: ${pairTokens} (${userInTokens})`;
        userDiv.appendChild(userTokenDiv);
      } catch(e){
        console.debug("[Server Debug] Could not parse token_info for user subbubble =>", e.message);
      }
    }

    seqDiv.appendChild(userDiv);
  }

  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  const { provider, shortModel } = parseProviderModel(model);
  const displayShort = shortModel;
  const { label: providerLabel } = formatProviderDisplay(provider);
  const providerTitle = providerLabel ? `${providerLabel} / ${displayShort}` : displayShort;
  const titleAttr = imageUrl ? "" : ` title="${providerTitle}"`;
  botHead.innerHTML = `<div class="name-oval name-oval-ai"${titleAttr}>${window.agentName}</div>`;
  const aiCopyBtn = document.createElement("button");
  aiCopyBtn.className = "bubble-copy-btn";
  aiCopyBtn.textContent = "\u2398";
  aiCopyBtn.title = "Copy message";
  aiCopyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(stripPlaceholderImageLines(aiText) || "");
    showToast("Copied to clipboard");
  });
  const aiEditBtn = document.createElement("button");
  aiEditBtn.className = "bubble-edit-btn";
  aiEditBtn.textContent = "✎";
  aiEditBtn.title = "Edit AI reply";
  aiEditBtn?.addEventListener("click", () => {
    openEditMessageModal(pairId, "ai", aiText, newText => {
      aiText = newText;
      botBody.textContent = stripPlaceholderImageLines(newText);
    });
  });
  botHead.appendChild(aiCopyBtn);
  botHead.appendChild(aiEditBtn);
  botDiv.appendChild(botHead);

  if(imageUrl){
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = imageAlt;
    if(imageTitle) img.title = imageTitle;
    img.style.maxWidth = "min(100%, 400px)";
    img.style.height = "auto";
    botDiv.appendChild(img);
  }

  const botBody = document.createElement("div");
  renderAssistantContent(botBody, aiText || "", model, { resetReasoningExpanded: true });
  botDiv.appendChild(botBody);
  addFilesFromCodeBlocks(aiText || "");

  appendModelInfoIcon(botDiv, model);
  appendModelLabel(botDiv, model, displayShort, tokenInfo);

  if(citationsJson){
    try {
      const cites = JSON.parse(citationsJson);
      if(Array.isArray(cites) && cites.length>0){
        const citeDiv = document.createElement('div');
        citeDiv.className = 'chat-citations';
        const list = document.createElement('ul');
        cites.forEach(c => {
          if(!c || !c.url) return;
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = c.url;
          a.textContent = c.url;
          a.target = '_blank';
          li.appendChild(a);
          list.appendChild(li);
        });
        citeDiv.appendChild(list);
        botDiv.appendChild(citeDiv);
      }
    } catch(e) { console.debug('parse citations failed', e); }
  }

  if(tokenInfo && showSubbubbleToken){
    try {
      const tInfo = JSON.parse(tokenInfo);
      const outTokens = tInfo.finalAssistantTokens || 0;
      const combinedDiv = document.createElement("div");
      combinedDiv.className = "token-indicator";
      combinedDiv.textContent = `Out: ${outTokens} (Time: ${(tInfo.responseTime*10)?.toFixed(2) || "?"}s)`;
      botDiv.appendChild(combinedDiv);
    } catch(e){
      console.debug("[Server Debug] Could not parse token_info for pair =>", pairId, e.message);
    }
  }

  seqDiv.appendChild(botDiv);

  if(!chatHideMetadata){
    const metaContainer = document.createElement("div");
    metaContainer.style.fontSize = "0.8rem";
    metaContainer.style.color = "#aaa";
    metaContainer.style.textAlign = "right";

    const pairLabel = document.createElement("div");
    pairLabel.textContent = `Pair #${pairId}`;
    metaContainer.appendChild(pairLabel);

    const typeLabel = document.createElement("div");
    typeLabel.textContent = imageUrl ? "Type: Image" : "Type: Chat";
    metaContainer.appendChild(typeLabel);

    if (model) {
      const modelLabel = document.createElement("div");
      modelLabel.textContent = `${model}`;
      metaContainer.appendChild(modelLabel);
      if(imageUrl){
        const imgCost = getImageModelCost(model);
        if(imgCost !== null){
          const costLabel = document.createElement("div");
          costLabel.textContent = `Cost: $${imgCost.toFixed(4)}`;
          metaContainer.appendChild(costLabel);
        }
      }
    }

    let tokObj = null;
    try {
      tokObj = tokenInfo ? JSON.parse(tokenInfo) : null;
    } catch(e) {}

    if (systemContext) {
      const scDetails = document.createElement("details");
      const scSum = document.createElement("summary");
      if (tokObj && tokObj.systemTokens !== undefined) {
        scSum.textContent = `System Context (${tokObj.systemTokens})`;
      } else {
        scSum.textContent = `System Context`;
      }
      scDetails.appendChild(scSum);

      const lines = systemContext.split(/\r?\n/);
      lines.forEach(line => {
        if (!line.trim()) return;
        const lineBubble = document.createElement("div");
        lineBubble.className = "chat-bot";
        lineBubble.style.marginTop = "4px";
        lineBubble.textContent = line;
        scDetails.appendChild(lineBubble);
      });
      metaContainer.appendChild(scDetails);
    }

    if (projectContext) {
      const prDetails = document.createElement("details");
      const prSum = document.createElement("summary");
      if (tokObj && tokObj.projectTokens !== undefined) {
        prSum.textContent = `Project Context (${tokObj.projectTokens})`;
      } else {
        prSum.textContent = `Project Context`;
      }
      prDetails.appendChild(prSum);

      const prLines = projectContext.split(/\r?\n/);
      let currentProj = null;
      let currentChat = null;
      const flushChat = () => {
        currentChat = null;
      };

      prLines.forEach(line => {
        if (!line.trim()) return;
        if (line.startsWith('Project: ')) {
          flushChat();
          if (currentProj) prDetails.appendChild(currentProj);
          currentProj = document.createElement('details');
          const sum = document.createElement('summary');
          sum.textContent = line;
          currentProj.appendChild(sum);
          prDetails.appendChild(currentProj);
        } else if (line.startsWith('Chat: ')) {
          flushChat();
          currentChat = document.createElement('details');
          const sum = document.createElement('summary');
          sum.textContent = line;
          currentChat.appendChild(sum);
          if (currentProj) currentProj.appendChild(currentChat);
          else prDetails.appendChild(currentChat);
        } else {
          const lineBubble = document.createElement('div');
          lineBubble.className = 'chat-bot';
          lineBubble.style.marginTop = '4px';
          lineBubble.textContent = line;
          if (currentChat) currentChat.appendChild(lineBubble);
          else if (currentProj) currentProj.appendChild(lineBubble);
          else prDetails.appendChild(lineBubble);
        }
      });
      flushChat();
      metaContainer.appendChild(prDetails);
    }

    if (fullHistory) {
      const fhDetails = document.createElement("details");
      const fhSum = document.createElement("summary");
      fhSum.textContent = `Full History`;
      fhDetails.appendChild(fhSum);
      const fhPre = document.createElement("pre");
      fhPre.textContent = JSON.stringify(fullHistory, null, 2);
      fhDetails.appendChild(fhPre);
      metaContainer.appendChild(fhDetails);
    }

    if (tokObj) {
      const tuDetails = document.createElement("details");
      const tuSum = document.createElement("summary");
      let costStr = "";
      if(model){
        const inT = (tokObj.systemTokens || 0) + (tokObj.historyTokens || 0) + (tokObj.inputTokens || 0);
        const outT = (tokObj.assistantTokens || 0) + (tokObj.finalAssistantTokens || 0);
        const c = getModelCost(model, inT, outT);
        if(c !== null) costStr = ` | $${c.toFixed(4)}`;
      }
      tuSum.textContent = `Token Usage (${tokObj.total}${costStr})`;
      tuDetails.appendChild(tuSum);

      const respTime = tokObj.responseTime*10;

      const usageDiv = document.createElement("div");
      usageDiv.style.marginLeft = "1em";
      usageDiv.textContent =
          `System: ${tokObj.systemTokens}, ` +
          `History: ${tokObj.historyTokens}, ` +
          `Input: ${tokObj.inputTokens}, ` +
          `Assistant: ${tokObj.assistantTokens}, ` +
          `FinalAssistantTokens: ${tokObj.finalAssistantTokens}, ` +
          `Total: ${tokObj.total}, ` +
          `Time: ${respTime}s`;
      tuDetails.appendChild(usageDiv);
      metaContainer.appendChild(tuDetails);
    }

    const directLinkDiv = document.createElement("div");
    const ddLink = document.createElement("a");
    ddLink.href = `/pair/${pairId}`;
    ddLink.target = "_blank";
    ddLink.textContent = "Direct Link";
    directLinkDiv.appendChild(ddLink);
    metaContainer.appendChild(directLinkDiv);

    seqDiv.appendChild(metaContainer);
  }

  const pairDelBtn = document.createElement("button");
  pairDelBtn.className = "delete-chat-btn pair-delete-btn";
  pairDelBtn.textContent = "🗑";
  pairDelBtn.title = "Delete this chat pair";
  pairDelBtn?.addEventListener("click", async () => {
    const confirmed = await showConfirmDialog({
      title: "Delete chat pair",
      message: "Are you sure you want to delete this pair?",
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true
    });
    if (!confirmed) return;
    const resp = await fetch(`/api/chat/pair/${pairId}`, { method: "DELETE" });
    if (resp.ok) {
      seqDiv.remove();
    } else {
      alert("Failed to delete chat pair.");
    }
  });
  if(imageUrl){
    pairDelBtn.style.top = "auto";
    pairDelBtn.style.bottom = "4px";
  }
  seqDiv.appendChild(pairDelBtn);

  const placeholderEl = document.getElementById("chatPlaceholder");
  if(placeholderEl) placeholderEl.style.display = "none";
  appendChatElement(seqDiv);
  if(chatAutoScroll) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// New model tabs logic
async function initModelTabs() {
  try {
    // load from DB setting
    let mTabs = await getSetting("model_tabs");
    if(!Array.isArray(mTabs)) mTabs = [];
    modelTabs = mTabs;
    let lastModelTab = await getSetting("last_model_tab");
    if(typeof lastModelTab !== "number" && modelTabs.length>0){
      lastModelTab = modelTabs[0].id;
    }
    currentModelTabId = lastModelTab || null;
    renderModelTabs();
  } catch(e){
    console.error("Error init model tabs:", e);
  }
  const newModelTabBtn = document.getElementById("newModelTabBtn");
  if(newModelTabBtn){
    newModelTabBtn?.addEventListener("click", openAddModelModal);
  }
}

function renderModelTabs(){
  const container = document.getElementById("modelTabsContainer");
  if(!container) return;
  container.innerHTML = "";
  modelTabs.forEach(tab => {
    const b = document.createElement("div");
    b.style.padding = "4px 6px";
    b.style.cursor = "pointer";
    if(tab.id === currentModelTabId){
      b.style.border = "2px solid #ffcf40";
      b.style.backgroundColor = "#ffa500";
      b.style.color = "#000";
    } else {
      b.style.border = "1px solid #444";
      b.style.backgroundColor = "#333";
      b.style.color = "#ddd";
    }
    b.style.display = "inline-flex";
    b.style.alignItems = "center";
    b.style.gap = "6px";

    // Title or name
    const labelSpan = document.createElement("span");
    labelSpan.textContent = tab.name;
    b.appendChild(labelSpan);

    // Service selector
    const serviceSelect = document.createElement("select");
    ["openai","openrouter","deepseek"].forEach(sv => {
      const opt = document.createElement("option");
      opt.value = sv;
      opt.textContent = sv;
      serviceSelect.appendChild(opt);
    });
    serviceSelect.value = tab.service || "openai";
    serviceSelect?.addEventListener("change", async (evt)=>{
      tab.service = evt.target.value;
      await saveModelTabs();
    });
    b.appendChild(serviceSelect);

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑";
    delBtn.className = "model-delete-btn";
    delBtn.title = "Delete";
    delBtn?.addEventListener("click", e => { e.stopPropagation(); deleteModelTab(tab.id); });
    b.appendChild(delBtn);

    // Click => select this tab
    b?.addEventListener("click", (ev)=>{
      if(ev.target===serviceSelect) return;
      selectModelTab(tab.id);
    });

    // Right-click => rename or delete
    b?.addEventListener("contextmenu", e=>{
      e.preventDefault();
      const choice=prompt("Type 'rename', 'fork', or 'delete':","");
      if(choice==="rename") renameModelTab(tab.id);
      else if(choice==="fork") duplicateTab(tab.id);
      else if(choice==="delete") deleteModelTab(tab.id);
    });

    container.appendChild(b);
  });
}

async function openAddModelModal(){
  const selectEl = document.getElementById("favoriteModelSelect");
  if(selectEl){
    selectEl.innerHTML = "<option>Loading...</option>";
    try{
      const r = await fetch("/api/ai/models");
      if(r.ok){
        const data = await r.json();
        const favs = (data.models||[]).filter(m=>m.favorite);
        selectEl.innerHTML = "";
        if(favs.length===0){
          selectEl.appendChild(new Option("(no favorites)",""));
        } else {
          favs.forEach(m=>{
            selectEl.appendChild(new Option(m.id,m.id));
          });
        }
      } else {
        selectEl.innerHTML = "<option>Error</option>";
      }
    }catch(e){
      console.error("Error loading models:",e);
      selectEl.innerHTML = "<option>Error</option>";
    }
  }
  showModal(document.getElementById("addModelModal"));
}

// Add a new model tab using given model id
async function addModelTab(modelId){
  const name = modelId;
  if(!name) return;
  let newId = 1;
  if(modelTabs.length>0){
    const maxId = Math.max(...modelTabs.map(t=>t.id));
    newId = maxId+1;
  }
  const newObj = {
    id: newId,
    name,
    modelId: name,
    service: parseProviderModel(name).provider || "openai"
  };
  modelTabs.push(newObj);
  currentModelTabId = newId;
  await saveModelTabs();
  await setSetting("ai_model", name);
  modelName = name;
  renderModelTabs();
}

// rename model tab
async function renameModelTab(tabId){
  const t = modelTabs.find(t => t.id===tabId);
  if(!t) return;
  const newName = prompt("Enter new model name:", t.name || "Unnamed");
  if(!newName) return;
  t.name = newName;
  t.modelId = newName;
  await saveModelTabs();
  if(tabId===currentModelTabId){
    await setSetting("ai_model", newName);
    modelName = newName;
  }
  renderModelTabs();
}

// delete model tab
async function deleteModelTab(tabId){
  if(!confirm("Delete this model tab?")) return;
  const idx = modelTabs.findIndex(x=>x.id===tabId);
  if(idx<0) return;
  modelTabs.splice(idx,1);
  if(currentModelTabId===tabId){
    currentModelTabId = modelTabs.length>0 ? modelTabs[0].id : null;
    if(currentModelTabId){
      const t = modelTabs.find(m=>m.id===currentModelTabId);
      if(t) {
        await setSetting("ai_model", t.modelId);
        modelName = t.modelId;
      }
    } else {
      await setSetting("ai_model","");
      modelName = "unknown";
    }
  }
  await saveModelTabs();
  renderModelTabs();
}

// select model tab
async function selectModelTab(tabId){
  currentModelTabId = tabId;
  const t = modelTabs.find(x=>x.id===tabId);
  if(t){
    await setSetting("ai_model", t.modelId);
    modelName = t.modelId;
  }
  await setSetting("last_model_tab", tabId);
  renderModelTabs();
}

async function saveModelTabs(){
  await setSetting("model_tabs", modelTabs);
}

const toggleModelTabsBtn = document.getElementById("toggleModelTabsBtn");
if(toggleModelTabsBtn){
  toggleModelTabsBtn?.addEventListener("click", async () => {
    const cont = document.getElementById("modelTabsContainer");
    const newBtn = document.getElementById("newModelTabBtn");
    const toggleBtn = document.getElementById("toggleModelTabsBtn");
    if(modelTabsBarVisible){
      if(cont) cont.style.display = "none";
      if(newBtn) newBtn.style.display = "none";
      toggleBtn.textContent = "Model";
      modelTabsBarVisible = false;
      await setSetting("model_tabs_bar_visible", false);
    } else {
      if(cont) cont.style.display = "";
      if(newBtn) newBtn.style.display = "";
      toggleBtn.textContent = "Minimize model tabs bar";
      modelTabsBarVisible = true;
      await setSetting("model_tabs_bar_visible", true);
    }
  });
}

// ----------------------------------------------------------------------
// NEW: "Change Sterling Branch" button event + modal logic
// ----------------------------------------------------------------------
{
  const btn = document.getElementById("changeSterlingBranchBtn");
  if(btn) btn?.addEventListener("click", () => {
    showModal($("#changeBranchModal"));
  });
}

// Cancel button for branch
{
  const cancelBtn = document.getElementById("sterlingBranchCancelBtn");
  if(cancelBtn) cancelBtn?.addEventListener("click", () => {
    hideModal($("#changeBranchModal"));
  });
}

// Save button for branch
const saveBtnSterling = document.getElementById("sterlingBranchSaveBtn");
if(saveBtnSterling) saveBtnSterling?.addEventListener("click", async () => {
  const createNew = $("#createSterlingNewBranchCheck").checked;
  const branchName = $("#sterlingBranchNameInput").value.trim();
  const msgElem = $("#sterlingBranchMsg");
  msgElem.textContent = "";

  if(!branchName){
    msgElem.textContent = "Please enter a branch name.";
    return;
  }

  try {
    let project = await getSetting("sterling_project");
    if(!project) {
      msgElem.textContent = "No sterling_project is set. Please set a project first.";
      return;
    }
    await fetch("/api/projectBranches", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ data: [{
        project,
        base_branch: branchName
      }]})
    });
    hideModal($("#changeBranchModal"));
    msgElem.textContent = "";
    await updateProjectInfo();
    alert(`Sterling branch changed to "${branchName}" (createNew=${createNew}).`);
  } catch(err){
    console.error("Error changing sterling branch:", err);
    msgElem.textContent = "Error: " + err.message;
  }
});

// ----------------------------------------------------------------------
// Project chat search events
// ----------------------------------------------------------------------
{
  const btn = document.getElementById("projectSearchBtn");
  if(btn) btn?.addEventListener("click", projectSearch);
  const inp = document.getElementById("projectSearchInput");
  if(inp) inp?.addEventListener("keydown", e => { if(e.key === "Enter") projectSearch(); });
  const closeBtn = document.getElementById("searchResultsCloseBtn");
  if(closeBtn) closeBtn?.addEventListener("click", () => {
    hideModal(document.getElementById("searchResultsModal"));
  });
}

// ----------------------------------------------------------------------
// Added click events for the “Markdown Menu” gear icon
// ----------------------------------------------------------------------
document.getElementById("markdownGearIcon")?.addEventListener("click", async () => {
  try {
    const r = await fetch("/api/settings/taskList_git_ssh_url");
    if(r.ok){
      const { value } = await r.json();
      const repoInput = document.getElementById("mdMenuRepoInput");
      if(repoInput) repoInput.value = value || "";
    }
    const rp = await fetch("/api/tasklist/repo-path");
    if(rp.ok){
      const { path } = await rp.json();
      const repoPath = document.getElementById("mdMenuRepoPath");
      if(repoPath){
        repoPath.textContent = path ? `Local repo: ${path}` : "Repo not cloned";
      }
    } else {
      const repoPath = document.getElementById("mdMenuRepoPath");
      if(repoPath) repoPath.textContent = "Repo not cloned";
    }
  } catch(e){
    console.error("Error loading taskList_git_ssh_url:", e);
  }
  showModal(document.getElementById("mdMenuModal"));
});
document.getElementById("mdMenuSaveBtn")?.addEventListener("click", async () => {
  try {
    const repoInput = document.getElementById("mdMenuRepoInput");
    await fetch("/api/settings", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({key: "taskList_git_ssh_url", value: repoInput ? repoInput.value : ""})
    });
  } catch(e){
    console.error("Error saving taskList_git_ssh_url:", e);
  }
  hideModal(document.getElementById("mdMenuModal"));
});
document.getElementById("mdMenuUpdateBtn")?.addEventListener("click", async () => {
  try {
    const markdownInput = document.getElementById("markdownInput");
    const content = markdownInput ? markdownInput.value : "";
    const resp = await fetch("/api/markdown", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ content })
    });
    if(!resp.ok){
      alert("Error updating markdown.");
      return;
    }
    alert("Markdown updated and pushed.");
  } catch(e){
    console.error("Error updating markdown:", e);
    alert("Unable to update markdown.");
  }
});
document.getElementById("mdMenuCloseBtn")?.addEventListener("click", () => {
  hideModal(document.getElementById("mdMenuModal"));
});

// ----------------------------------------------------------------------
// New Task List Configuration modal
// ----------------------------------------------------------------------
document.getElementById("gearBtn")?.addEventListener("click", () => {
  showModal(document.getElementById("taskListConfigModal"));
});
document.getElementById("taskListConfigCloseBtn")?.addEventListener("click", () => {
  hideModal(document.getElementById("taskListConfigModal"));
});

// ----------------------------------------------------------------------
// Global AI Settings modal
// ----------------------------------------------------------------------
async function openGlobalAiSettings(){
  showPageLoader();
  try {
    const service = await getSetting("ai_service");
    const searchModel = await getSetting("ai_search_model");
    const reasoningModel = await getSetting("ai_reasoning_model");
    const visionModel = await getSetting("ai_vision_model");
    const imageModel = await getSetting("image_gen_model");
    const resp = await fetch("/api/ai/models");
    if(resp.ok){
      const data = await resp.json();
      const sel = document.getElementById("globalAiModelSelect");
      const reasoningSel = document.getElementById("globalAiReasoningModelSelect");
      const visionSel = document.getElementById("globalAiVisionModelSelect");
      const imageSel = document.getElementById("globalImageModelSelect");
      sel.innerHTML = "";
      reasoningSel.innerHTML = "";
      if(visionSel) visionSel.innerHTML = "";
      if(imageSel) imageSel.innerHTML = "";
      const favs = (data.models || []).filter(m => m.favorite);
      const showPrices = accountInfo && accountInfo.id === 1;
      if(favs.length === 0){
        reasoningSel.appendChild(new Option("(no favorites)", ""));
        if(visionSel) visionSel.appendChild(new Option("(no favorites)", ""));
        if(imageSel){
          ["gptimage1","dalle2","dalle3"].forEach(m => imageSel.appendChild(new Option(m, m)));
        }
      } else {
        favs.forEach(m => {
          const label = showPrices
              ? `${m.id} (limit ${m.tokenLimit}, in ${m.inputCost}, out ${m.outputCost})`
              : `${m.id} (limit ${m.tokenLimit})`;
          reasoningSel.appendChild(new Option(label, m.id));
          if(visionSel) visionSel.appendChild(new Option(label, m.id));
        });
        if(imageSel){
          ["gptimage1","dalle2","dalle3"].forEach(m => imageSel.appendChild(new Option(m, m)));
        }
      }

      const curModel = await getSetting("ai_model");
      if(curModel){
        sel.appendChild(new Option(curModel, curModel));
      }
      if(favs.length > 0){
        const favGroup = document.createElement("optgroup");
        favGroup.label = "favotiess";
        favs.forEach(m => {
          const label = showPrices
              ? `${m.id} (limit ${m.tokenLimit}, in ${m.inputCost}, out ${m.outputCost})`
              : `${m.id} (limit ${m.tokenLimit})`;
          favGroup.appendChild(new Option(label, m.id));
        });
        sel.appendChild(favGroup);
      }
      if(curModel){
        sel.value = curModel;
      }
      sel.disabled = false;
      if(reasoningModel) reasoningSel.value = reasoningModel;
      if(visionModel && visionSel) visionSel.value = visionModel;
      if(imageModel && imageSel) imageSel.value = imageModel;
    }
    if(searchModel){
      document.getElementById("globalAiSearchModelSelect").value = searchModel;
    }
    const visionSelFinal = document.getElementById("globalAiVisionModelSelect");
    if(visionModel && visionSelFinal && !visionSelFinal.value){
      visionSelFinal.value = visionModel;
    }
    const imageSelFinal = document.getElementById("globalImageModelSelect");
    if(imageModel && imageSelFinal && !imageSelFinal.value){
      imageSelFinal.value = imageModel;
    }
    document.getElementById("globalAiServiceSelect").value = service || "openrouter";
  } catch(e){
    console.error("Error opening global AI settings:", e);
  } finally {
    const saveBtn = document.getElementById("globalAiSettingsSaveBtn");
    if(saveBtn){
      const allowed = accountInfo && accountInfo.id === 1;
      saveBtn.disabled = !allowed;
      saveBtn.title = allowed ? "" : "Restricted";
    }
    hidePageLoader();
    showModal(document.getElementById("globalAiSettingsModal"));
  }
}

async function saveGlobalAiSettings(){
  const svc = document.getElementById("globalAiServiceSelect").value;
  const searchModel = document.getElementById("globalAiSearchModelSelect").value;
  const reasoningModel = document.getElementById("globalAiReasoningModelSelect").value;
  const visionModel = document.getElementById("globalAiVisionModelSelect").value;
  const imageModel = document.getElementById("globalImageModelSelect").value;
  await setSettings({ ai_service: svc, ai_search_model: searchModel, ai_reasoning_model: reasoningModel, ai_vision_model: visionModel, image_gen_model: imageModel });
  // keep local cache in sync so toggles use latest values immediately
  settingsCache.ai_service = svc;
  settingsCache.ai_search_model = searchModel;
  settingsCache.ai_reasoning_model = reasoningModel;
  settingsCache.ai_vision_model = visionModel;
  settingsCache.image_gen_model = imageModel;
  imageGenModel = imageModel;
  updateModelHud();
  hideModal(document.getElementById("globalAiSettingsModal"));
}

document.getElementById("globalAiSettingsBtn").addEventListener("click", openGlobalAiSettings);
document.getElementById("globalAiSettingsSaveBtn").addEventListener("click", saveGlobalAiSettings);
document.getElementById("globalAiSettingsCancelBtn").addEventListener("click", () => {
  hideModal(document.getElementById("globalAiSettingsModal"));
});

// ----------------------------------------------------------------------
// Tab Model Settings modal
// ----------------------------------------------------------------------
async function openTabModelSettings(){
  if(searchEnabled || reasoningEnabled){
    showToast("Disable search/reasoning mode first");
    return;
  }
  if(!currentTabId) return;
  showPageLoader();
  try{
    const resp = await fetch("/api/ai/models");
    if(resp.ok){
      const data = await resp.json();
      const sel = document.getElementById("tabModelSelect");
      sel.innerHTML = "<option value=''>Default</option>";
      const favs = (data.models||[]).filter(m=>m.favorite);
      favs.forEach(m=>sel.appendChild(new Option(m.id,m.id)));
      const t = chatTabs.find(t=>t.id===currentTabId);
      if(t && t.model_override) sel.value = t.model_override;
    }
  }catch(e){
    console.error("Error opening tab model settings:", e);
  }finally{
    hidePageLoader();
    showModal(document.getElementById("tabModelSettingsModal"));
  }
}

async function saveTabModelSettings(){
  const model = document.getElementById("tabModelSelect").value.trim();
  await fetch("/api/chat/tabs/model", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({tabId: currentTabId, model, sessionId})
  });
  await loadTabs();
  const t = chatTabs.find(tt=>tt.id===currentTabId);
  tabModelOverride = t && t.model_override ? t.model_override : '';
  const globalModel = await getSetting("ai_model");
  modelName = tabModelOverride || globalModel || "unknown";
  updateModelHud();
  hideModal(document.getElementById("tabModelSettingsModal"));
}

async function clearTabModelSettings(){
  await fetch("/api/chat/tabs/model", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({tabId: currentTabId, model:'', sessionId})
  });
  await loadTabs();
  tabModelOverride = '';
  const globalModel = await getSetting("ai_model");
  modelName = globalModel || "unknown";
  updateModelHud();
  hideModal(document.getElementById("tabModelSettingsModal"));
}

document.getElementById("tabModelSettingsBtn")?.addEventListener("click", openTabModelSettings);
document.getElementById("tabModelSaveBtn")?.addEventListener("click", saveTabModelSettings);
document.getElementById("tabModelClearBtn")?.addEventListener("click", clearTabModelSettings);
document.getElementById("tabModelCancelBtn")?.addEventListener("click", () => {
  hideModal(document.getElementById("tabModelSettingsModal"));
});

// ----------------------------------------------------------------------
// AI Favorites modal
// ----------------------------------------------------------------------
async function openAiFavoritesModal(){
  if(!accountInfo || accountInfo.id !== 1) return;
  const listEl = document.getElementById("aiFavoritesList");
  if(listEl){
    listEl.textContent = "Loading...";
    try{
      const resp = await fetch("/api/ai/models");
      if(resp.ok){
        const data = await resp.json();
        const models = data.models || [];
        listEl.innerHTML = "";
        models.forEach(m => {
          const row = document.createElement("div");
          const star = document.createElement("span");
          star.dataset.modelid = m.id;
          star.className = m.favorite ? "favorite-star starred" : "favorite-star unstarred";
          star.textContent = m.favorite ? "★" : "☆";
          star?.addEventListener("click", async () => {
            const newFav = !star.classList.contains("starred");
            try {
              const r = await fetch("/api/ai/favorites", {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({modelId: m.id, favorite: newFav})
              });
              if(r.ok){
                star.classList.toggle("starred", newFav);
                star.classList.toggle("unstarred", !newFav);
                star.textContent = newFav ? "★" : "☆";
                m.favorite = newFav;
              }
            }catch(e){
              console.error("Error toggling favorite:", e);
            }
          });
          row.appendChild(star);
          const label = document.createElement("span");
          label.textContent = " " + m.id;
          row.appendChild(label);
          listEl.appendChild(row);
        });
      }else{
        listEl.textContent = "Error";
      }
    }catch(e){
      console.error("Error loading models:", e);
      listEl.textContent = "Error";
    }
  }
  showModal(document.getElementById("aiFavoritesModal"));
}

document.getElementById("aiFavoritesBtn").addEventListener("click", openAiFavoritesModal);
document.getElementById("aiFavoritesCloseBtn").addEventListener("click", () => {
  hideModal(document.getElementById("aiFavoritesModal"));
});

// ----------------------------------------------------------------------
// Feature Flags modal
// ----------------------------------------------------------------------
async function loadFeatureFlags(){
  const keys = [
    "image_upload_enabled","image_paint_tray_enabled","activity_iframe_menu_visible",
    "nexum_chat_menu_visible","nexum_tabs_menu_visible","image_generator_menu_visible",
    "file_tree_menu_visible","ai_models_menu_visible","tasks_menu_visible",
    "jobs_menu_visible","view_tabs_bar_visible","chat_tabs_menu_visible",
    "show_project_name_in_tabs","group_tabs_by_project","up_arrow_history_enabled","new_tab_project_enabled",
    "show_session_id"
  ];
  const map = await getSettings(keys);
  if(typeof map.image_upload_enabled !== "undefined") imageUploadEnabled = !!map.image_upload_enabled;
  if(typeof map.image_paint_tray_enabled !== "undefined") imagePaintTrayEnabled = map.image_paint_tray_enabled !== false;
  if(typeof map.activity_iframe_menu_visible !== "undefined") activityIframeMenuVisible = map.activity_iframe_menu_visible !== false;
  if(typeof map.nexum_chat_menu_visible !== "undefined") nexumChatMenuVisible = map.nexum_chat_menu_visible !== false;
  if(typeof map.nexum_tabs_menu_visible !== "undefined") nexumTabsMenuVisible = map.nexum_tabs_menu_visible !== false;
  if(typeof map.image_generator_menu_visible !== "undefined") imageGeneratorMenuVisible = map.image_generator_menu_visible !== false;
  if(typeof map.file_tree_menu_visible !== "undefined") fileTreeMenuVisible = map.file_tree_menu_visible !== false;
  if(typeof map.ai_models_menu_visible !== "undefined") aiModelsMenuVisible = map.ai_models_menu_visible !== false;
  if(typeof map.tasks_menu_visible !== "undefined") tasksMenuVisible = map.tasks_menu_visible !== false;
  if(typeof map.jobs_menu_visible !== "undefined") jobsMenuVisible = map.jobs_menu_visible !== false;
  if(typeof map.view_tabs_bar_visible !== "undefined") viewTabsBarVisible = !!map.view_tabs_bar_visible;
  if(typeof map.chat_tabs_menu_visible !== "undefined") chatTabsMenuVisible = map.chat_tabs_menu_visible !== false;
  if(typeof map.show_project_name_in_tabs !== "undefined") showProjectNameInTabs = map.show_project_name_in_tabs !== false;
  if(typeof map.group_tabs_by_project !== "undefined") groupTabsByProject = map.group_tabs_by_project !== false;
  if(typeof map.up_arrow_history_enabled !== "undefined") upArrowHistoryEnabled = map.up_arrow_history_enabled !== false;
  if(typeof map.new_tab_project_enabled !== "undefined") newTabProjectNameEnabled = map.new_tab_project_enabled !== false;
  if(typeof map.show_session_id !== "undefined") showSessionId = map.show_session_id !== false;
}

document.getElementById("featureFlagsBtn").addEventListener("click", async () => {
  await loadFeatureFlags();
  document.getElementById("imageUploadEnabledCheck").checked = imageUploadEnabled;
  document.getElementById("imagePaintTrayEnabledCheck").checked = imagePaintTrayEnabled;
  document.getElementById("activityIframeMenuCheck").checked = activityIframeMenuVisible;
  document.getElementById("nexumChatMenuCheck").checked = nexumChatMenuVisible;
  document.getElementById("nexumTabsMenuCheck").checked = nexumTabsMenuVisible;
  document.getElementById("fileTreeMenuCheck").checked = fileTreeMenuVisible;
  document.getElementById("aiModelsMenuCheck").checked = aiModelsMenuVisible;
  document.getElementById("tasksMenuCheck").checked = tasksMenuVisible;
  document.getElementById("jobsMenuCheck").checked = jobsMenuVisible;
  document.getElementById("chatTabsMenuCheck").checked = chatTabsMenuVisible;
  document.getElementById("viewTabsBarFlagCheck").checked = viewTabsBarVisible;
  document.getElementById("showProjectNameTabsCheck").checked = showProjectNameInTabs;
  document.getElementById("groupTabsByProjectCheck").checked = groupTabsByProject;
  document.getElementById("showSessionIdCheck").checked = showSessionId;
  document.getElementById("imageGeneratorMenuCheck").checked = imageGeneratorMenuVisible;
  document.getElementById("upArrowHistoryCheck").checked = upArrowHistoryEnabled;
  document.getElementById("newTabProjectFlagCheck").checked = newTabProjectNameEnabled;
  showModal(document.getElementById("featureFlagsModal"));
});
document.getElementById("featureFlagsSaveBtn").addEventListener("click", async () => {
  imageUploadEnabled = document.getElementById("imageUploadEnabledCheck").checked;
  await setSetting("image_upload_enabled", imageUploadEnabled);
  toggleImageUploadButton(imageUploadEnabled);
  imagePaintTrayEnabled = document.getElementById("imagePaintTrayEnabledCheck").checked;
  await setSetting("image_paint_tray_enabled", imagePaintTrayEnabled);
  toggleImagePaintTrayButton(imagePaintTrayEnabled);
  activityIframeMenuVisible = document.getElementById("activityIframeMenuCheck").checked;
  nexumChatMenuVisible = document.getElementById("nexumChatMenuCheck").checked;
  nexumTabsMenuVisible = document.getElementById("nexumTabsMenuCheck").checked;
  fileTreeMenuVisible = document.getElementById("fileTreeMenuCheck").checked;
  aiModelsMenuVisible = document.getElementById("aiModelsMenuCheck").checked;
  tasksMenuVisible = document.getElementById("tasksMenuCheck").checked;
  jobsMenuVisible = document.getElementById("jobsMenuCheck").checked;
  chatTabsMenuVisible = document.getElementById("chatTabsMenuCheck").checked;
  viewTabsBarVisible = document.getElementById("viewTabsBarFlagCheck").checked;
  showProjectNameInTabs = document.getElementById("showProjectNameTabsCheck").checked;
  groupTabsByProject = document.getElementById("groupTabsByProjectCheck").checked;
  showSessionId = document.getElementById("showSessionIdCheck").checked;
  upArrowHistoryEnabled = document.getElementById("upArrowHistoryCheck").checked;
  newTabProjectNameEnabled = document.getElementById("newTabProjectFlagCheck").checked;
  imageGeneratorMenuVisible = document.getElementById("imageGeneratorMenuCheck").checked;
  await setSetting("activity_iframe_menu_visible", activityIframeMenuVisible);
  await setSetting("nexum_chat_menu_visible", nexumChatMenuVisible);
  await setSetting("nexum_tabs_menu_visible", nexumTabsMenuVisible);
  await setSetting("file_tree_menu_visible", fileTreeMenuVisible);
  await setSetting("ai_models_menu_visible", aiModelsMenuVisible);
  await setSetting("tasks_menu_visible", tasksMenuVisible);
  await setSetting("jobs_menu_visible", jobsMenuVisible);
  await setSetting("chat_tabs_menu_visible", chatTabsMenuVisible);
  await setSetting("view_tabs_bar_visible", viewTabsBarVisible);
  await setSetting("show_project_name_in_tabs", showProjectNameInTabs);
  await setSetting("group_tabs_by_project", groupTabsByProject);
  await setSetting("show_session_id", showSessionId);
  await setSetting("up_arrow_history_enabled", upArrowHistoryEnabled);
  await setSetting("new_tab_project_enabled", newTabProjectNameEnabled);
  await setSetting("image_generator_menu_visible", imageGeneratorMenuVisible);
  toggleActivityIframeMenu(activityIframeMenuVisible);
  toggleNexumChatMenu(nexumChatMenuVisible);
  toggleNexumTabsMenu(nexumTabsMenuVisible);
  toggleFileTreeMenu(fileTreeMenuVisible);
  toggleAiModelsMenu(aiModelsMenuVisible);
  toggleTasksMenu(tasksMenuVisible);
  toggleJobsMenu(jobsMenuVisible);
  toggleChatTabsMenu(chatTabsMenuVisible);
  toggleSessionIdVisibility(showSessionId);
  toggleViewTabsBarVisibility(viewTabsBarVisible);
  toggleImageGeneratorMenu(imageGeneratorMenuVisible);
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  toggleNewTabProjectField(newTabProjectNameEnabled);
  hideModal(document.getElementById("featureFlagsModal"));
});
document.getElementById("featureFlagsCancelBtn").addEventListener("click", () => {
  hideModal(document.getElementById("featureFlagsModal"));
});

// ----------------------------------------------------------------------
// Edit Message modal logic
// ----------------------------------------------------------------------
function openEditMessageModal(pairId, type, text, onSave){
  editingMessageInfo = { pairId, type, onSave };
  const titleEl = document.getElementById("editMessageTitle");
  if(titleEl) titleEl.textContent = type === "ai" ? "Edit AI Reply" : "Edit user message";
  const textarea = document.getElementById("editMessageTextarea");
  if(textarea) textarea.value = text || "";
  showModal(document.getElementById("editMessageModal"));
}

document.getElementById("editMessageSaveBtn").addEventListener("click", async () => {
  if(!editingMessageInfo) return;
  const { pairId, type, onSave } = editingMessageInfo;
  const text = document.getElementById("editMessageTextarea").value;
  try {
    const resp = await fetch(`/api/chat/pair/${pairId}/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if(resp.ok){
      if(typeof onSave === "function") onSave(text);
      hideModal(document.getElementById("editMessageModal"));
      editingMessageInfo = null;
    } else {
      alert("Failed to edit message.");
    }
  } catch(e){
    console.error("Error editing message:", e);
    alert("Failed to edit message.");
  }
});

document.getElementById("editMessageCancelBtn").addEventListener("click", () => {
  hideModal(document.getElementById("editMessageModal"));
  editingMessageInfo = null;
});

// ----------------------------------------------------------------------
// Mosaic Edit modal logic
// ----------------------------------------------------------------------
document.getElementById("mosaicEditSaveBtn").addEventListener("click", async () => {
  if(!mosaicEditingFile) return;
  const text = document.getElementById("mosaicEditTextarea").value;
  await saveMosaicFile(mosaicEditingFile, text);
  hideModal(document.getElementById("mosaicEditModal"));
  mosaicEditingFile = null;
});

document.getElementById("mosaicEditCancelBtn").addEventListener("click", () => {
  hideModal(document.getElementById("mosaicEditModal"));
  mosaicEditingFile = null;
});

document.getElementById("mosaicInitGitBtn").addEventListener("click", async () => {
  try {
    const r = await fetch('/api/mosaic/git-init', { method: 'POST' });
    if(r.ok){
      const data = await r.json();
      await loadMosaicRepoPath();
      alert(data.already ? 'Repository already initialized.' : 'Initialized git repository.');
    } else {
      alert('Failed to initialize repository');
    }
  } catch(e){
    console.error('Error initializing mosaic repo', e);
    alert('Error initializing repository');
  }
});

// ----------------------------------------------------------------------
// Handling the global markdown save button
// ----------------------------------------------------------------------
document.getElementById("saveMdBtn")?.addEventListener("click", async () => {
  try {
    const markdownInput = document.getElementById("markdownInput");
    const content = markdownInput ? markdownInput.value : "";
    const resp = await fetch("/api/markdown", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ content })
    });
    if(!resp.ok){
      alert("Error saving markdown content.");
      return;
    }
    alert("Markdown content saved.");
  } catch(e) {
    console.error("Error saving markdown:", e);
    alert("Unable to save markdown content.");
  }
});

/*
  Image button now simply populates a buffer and displays a preview.
*/
document.getElementById("chatImageBtn").addEventListener("click", () => {
  if(!imageUploadEnabled) return;
  document.getElementById("imageUploadInput").click();
});

// Use user's text prompt to generate an image via the existing hook
document.getElementById("chatGenImageBtn").addEventListener("click", () => {
  const prompt = chatInputEl.value.trim();
  if(!prompt) return;
  const hook = actionHooks.find(h => h.name === "generateImage");
  if(hook && typeof hook.fn === "function") {
    hook.fn({ response: prompt });
  }
});

document.getElementById("imageUploadInput").addEventListener("change", async (ev) => {
  const files = ev.target.files;
  if(!files || files.length===0) return;
  for(const f of files){
    pendingImages.push(f);
  }
  updateImagePreviewList();
  ev.target.value="";
});

// Allow pasting images directly into the chat input (currently disabled)
chatInputEl?.addEventListener("paste", (ev) => {
  if(!pasteImageUploadsEnabled || !imageUploadEnabled) return;
  const items = ev.clipboardData && ev.clipboardData.items;
  if(!items) return;
  let found = false;
  for(const item of items){
    if(item.type && item.type.startsWith("image/")){
      const file = item.getAsFile();
      if(file){
        pendingImages.push(file);
        found = true;
      }
    }
  }
  if(found){
    ev.preventDefault();
    updateImagePreviewList();
  }
});

/*
  Show a small list of “buffered” images that will attach with the next message.
*/
function updateImagePreviewList(){
  const previewArea = document.getElementById("imagePreviewArea");
  if(!previewArea) return;
  previewArea.innerHTML = "";
  if(pendingImages.length===0){
    previewArea.innerHTML = "<em>No images selected</em>";
    return;
  }
  pendingImages.forEach((f, idx) => {
    const div = document.createElement("div");
    div.style.marginBottom="4px";
    div.textContent = f.name;
    const rmBtn = document.createElement("button");
    rmBtn.textContent = "Remove";
    rmBtn.style.marginLeft="8px";
    rmBtn?.addEventListener("click", () => {
      pendingImages.splice(idx,1);
      updateImagePreviewList();
    });
    div.appendChild(rmBtn);
    previewArea.appendChild(div);
  });
}

// Append an AI image bubble to the chat
function addImageChatBubble(url, altText="", title=""){
  const chatMessagesEl = document.getElementById("chatMessages");
  const placeholderEl = document.getElementById("chatPlaceholder");
  if(!chatMessagesEl || !url) return;

  const seqDiv = document.createElement("div");
  seqDiv.className = "chat-sequence";

  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai">${window.agentName}</div>
    <span style="opacity:0.8;">${formatTimestamp(new Date().toISOString())}</span>
  `;
  const imgCopyBtn = document.createElement("button");
  imgCopyBtn.className = "bubble-copy-btn";
  imgCopyBtn.textContent = "\u2398";
  imgCopyBtn.title = "Copy alt text";
  imgCopyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(stripPlaceholderImageLines(altText) || "");
    showToast("Copied to clipboard");
  });
  botHead.appendChild(imgCopyBtn);
  botDiv.appendChild(botHead);

  const img = document.createElement("img");
  img.src = url;
  img.alt = altText;
  if(title) img.title = title;
  img.style.maxWidth = "min(100%, 400px)";
  img.style.height = "auto";
  img?.addEventListener('load', () => setTimeout(scrollChatToBottom, 1000));
  botDiv.appendChild(img);

  seqDiv.appendChild(botDiv);
  if(placeholderEl) placeholderEl.style.display = "none";
  appendChatElement(seqDiv);
  if(chatAutoScroll) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Example hook registration
registerActionHook("afterSendLog", ({message, response}) => {
  console.log("[Hook] afterSendLog", { message, response });
});

// Automatically generate an image from the AI response
registerActionHook("generateImage", async ({response}) => {
  try {
    console.log('[Hook generateImage] invoked with:', response);
    if(isImageGenerating){
      console.log('[Hook generateImage] skipping - already generating');
      return;
    }
    if(currentTabType !== 'design' || !tabGenerateImages){
      console.log('[Hook generateImage] skipping - not design tab or disabled');
      return;
    }
    const prompt = (response || "").trim();
    if(!prompt){
      console.log('[Hook generateImage] skipping - empty prompt');
      return;
    }
    if(prompt === lastImagePrompt){
      console.log('[Hook generateImage] skipping - duplicate prompt');
      return;
    }
    // Previously, responses containing placeholder image links were skipped
    // here to avoid generating a duplicate image. This prevented the main
    // generateImage hook from running when markdown placeholders were present.
    // The new behaviour continues to log the detection but allows image
    // generation to proceed.
    if(/!\[[^\]]*\]\(https:\/\/alfe\.sh\/[^)]+\)/.test(prompt)){
      console.log('[Hook generateImage] detected placeholder in response');
    }
    lastImagePrompt = prompt;
    isImageGenerating = true;
    if(chatSendBtnEl) chatSendBtnEl.disabled = true;
    showImageGenerationIndicator();
    const payload = { prompt, tabId: currentTabId, provider: imageGenService, model: imageGenModel, sessionId };
    if(currentTabType === 'design'){
      payload.provider = 'openai';
      payload.model = 'gptimage1';
    }
    console.log('[Hook generateImage] sending request to /api/image/generate', payload);
    let r;
    try {
      r = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch(fetchErr){
      console.error('[Hook generateImage] fetch failed:', fetchErr);
      hideImageGenerationIndicator();
      isImageGenerating = false;
      lastImagePrompt = null;
      if(chatSendBtnEl){
        chatSendBtnEl.disabled = false;
        updateRepeatButtonVisibility();
      }
      processNextQueueMessage();
      if(typeof showToast === "function"){
        const msg = fetchErr?.message ? `Image generation failed: ${fetchErr.message}` : "Image generation failed";
        showToast(msg, 4000);
      }
      return;
    }
    console.log('[Hook generateImage] response status', r.status);
    const rawText = await r.clone().text().catch(e => {
      console.error('[Hook generateImage] error reading response text:', e);
      return '';
    });
    console.log('[Hook generateImage] response body', rawText);
    hideImageGenerationIndicator();
    isImageGenerating = false;
    lastImagePrompt = null;
    if(chatSendBtnEl){
      chatSendBtnEl.disabled = false;
      updateRepeatButtonVisibility();
    }
    processNextQueueMessage();
    const data = await r.json().catch(jsonErr => {
      console.error('[Hook generateImage] failed to parse JSON:', jsonErr);
      return {};
    });
    if(r.ok && data.url){
      await loadChatHistory(currentTabId, true);
      updateUsageLimitInfo();
      if(sidebarViewUploader && sidebarViewUploader.style.display !== "none"){
        await loadFileList();
      }
      if(imageLoopEnabled && accountInfo && accountInfo.id === 1){
        setTimeout(runImageLoop, 0);
      }
    } else {
      const errorMessage = data?.error || "Image generation failed";
      console.error('[Hook generateImage] API error:', errorMessage);
      if(r.status === 429 || data?.type === 'image_session_limit' || data?.type === 'image_ip_limit' || /limit/i.test(errorMessage)){
        showUsageLimitModal('image', errorMessage);
        updateUsageLimitInfo();
      }
      if(typeof showToast === "function"){
        showToast(errorMessage, 4000);
      }
    }
  } catch(err){
    hideImageGenerationIndicator();
    isImageGenerating = false;
    lastImagePrompt = null;
    if(chatSendBtnEl){
      chatSendBtnEl.disabled = false;
      updateRepeatButtonVisibility();
    }
    processNextQueueMessage();
    console.error('[Hook generateImage] failed:', err);
    if(typeof showToast === "function"){
      const msg = err?.message ? `Image generation failed: ${err.message}` : "Image generation failed";
      showToast(msg, 4000);
    }
  }
});

// Embed generated images for markdown placeholders like
// ![Alt Text](https://alfe.sh/example.png)
const processedPlaceholders = new Set();
registerActionHook("embedMockImages", async ({response}) => {
  const regex = /!\[([^\]]+)\]\(https:\/\/alfe\.sh\/[^)]+\)/g;
  const matches = [...(response || "").matchAll(regex)];
  if(matches.length === 0) return;

  const chatMessagesEl = document.getElementById("chatMessages");
  const lastBotText = chatMessagesEl?.lastElementChild?.querySelector(
    ".chat-bot > div:last-child"
  );
  if(!lastBotText) return;

  let html = lastBotText.textContent;
  for(const m of matches){
    const placeholder = m[0];
    const alt = m[1];
    if(processedPlaceholders.has(placeholder)) continue;
    processedPlaceholders.add(placeholder);
    try {
      const payload = { prompt: alt, tabId: currentTabId, provider: imageGenService, model: imageGenModel, sessionId };
      if(currentTabType === 'design'){
        payload.provider = 'openai';
        payload.model = 'gptimage1';
      }
      const r = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if(r.ok && data.url){
        const imgTag = `<img src="${data.url}" alt="${alt}" style="max-width:100%;height:auto;">`;
        html = html.replace(placeholder, imgTag);
        updateUsageLimitInfo();
      }
    } catch(err){
      console.error('[Hook embedMockImages] failed:', err);
    }
  }
  lastBotText.innerHTML = html;
  scrollChatToBottom();
});

const searchToggleBtn = document.getElementById("searchToggleBtn");
if(searchToggleBtn){
  updateSearchButton();
  searchToggleBtn?.addEventListener("click", async () => {
    searchToggleBtn.disabled = true;
    try {
      if(!searchEnabled && !accountInfo){
        openSignupModal();
        return;
      }
      await toggleSearch();
    } finally {
      searchToggleBtn.disabled = false;
    }
  });
}

const reasoningToggleBtn = document.getElementById("reasoningToggleBtn");
if(reasoningToggleBtn){
  reasoningToggleBtn.hidden = true;
  reasoningToggleBtn.style.display = "none";
  reasoningToggleBtn?.addEventListener("click", toggleReasoning);
  reasoningToggleBtn?.addEventListener("mouseenter", showReasoningTooltip);
  reasoningToggleBtn?.addEventListener("mouseleave", scheduleHideReasoningTooltip);
}
document.getElementById("codexToggleBtn")?.addEventListener("click", toggleCodexMini);
document.addEventListener('click', e => {
  if(reasoningTooltip && reasoningTooltip.style.display === 'flex' &&
    !reasoningTooltip.contains(e.target) && e.target.id !== 'reasoningToggleBtn'){
    hideReasoningTooltip();
  }
  if(favoritesTooltip && favoritesTooltip.style.display === 'flex' &&
    !favoritesTooltip.contains(e.target)){
    hideFavoritesTooltip();
  }
});

console.log("[Server Debug] main.js fully loaded. End of script.");


// Allow pasting into password fields - added by agent
(function(){
  const ids = ['signupPassword','signupConfirm','loginPassword','currentPassword','newPassword','confirmPassword'];
  function allow(e){
    // stop propagation to prevent other handlers from blocking the event
    try{ e.stopPropagation(); }catch(err){}
    return true;
  }
  function attach(){
    ids.forEach(id => {
      const el = document.getElementById(id);
      if(el){
        el.addEventListener('paste', allow, true);
        el.addEventListener('copy', allow, true);
        el.addEventListener('cut', allow, true);
      }
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
