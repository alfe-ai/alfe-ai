// sessionId is defined in session.js and available globally
// sessionId is provided globally by session.js
const defaultTitle = "Alfe - AI Project Management, Image Design, and Software Development Platform";
// Disable automatic scrolling of the chat by default. Manual scrolling
// (e.g. via the scroll down button) can still force scrolling.
let chatAutoScroll = false;
document.addEventListener('DOMContentLoaded', async () => {
  const sessEl = document.getElementById('sessionIdText');
  if (sessEl) sessEl.textContent = sessionId;
  updateImageLimitInfo();
  document.title = defaultTitle;

  // ---- Theme setup ----
  const themeLink = document.getElementById('themeStylesheet');
  const themeBtn = document.getElementById('themeToggleBtn');
  let currentColor = 'purple';
  let themeMode = 'dark';

  async function loadTheme(){
    try{
      const resColor = await fetch('/api/settings/nexum_theme_color');
      const resMode = await fetch('/api/settings/nexum_theme_mode');
      if(resColor.ok){
        const d = await resColor.json();
        currentColor = d.value || 'purple';
      }
      if(resMode.ok){
        const d = await resMode.json();
        themeMode = d.value || 'dark';
      }
    }catch(e){ console.error(e); }
    const selColor = document.getElementById('themeColorSelect');
    if(selColor) selColor.value = currentColor;
    const selMode = document.getElementById('themeModeSelect');
    if(selMode) selMode.value = themeMode;
    applyTheme(currentColor, themeMode);
  }

  function applyTheme(color, mode){
    if(!themeLink) return;
    const files = {
      purple: {dark:'/styles_purple.css', light:'/styles_purple_light.css'},
      lightblue: {dark:'/styles_lightblue.css', light:'/styles_lightblue_light.css'},
      red: {dark:'/styles_red.css', light:'/styles_red_light.css'},
      green: {dark:'/styles_green.css', light:'/styles_green_light.css'},
      orange: {dark:'/styles_orange.css', light:'/styles_orange_light.css'},
      teal: {dark:'/styles_teal.css', light:'/styles_teal_light.css'},
      pink: {dark:'/styles_pink.css', light:'/styles_pink_light.css'}
    };
    themeLink.href = files[color]?.[mode] || '/styles.css';
    if(themeBtn) themeBtn.textContent = mode === 'light' ? '🌙' : '☀️';
  }

  await loadTheme();
  if (themeBtn) {
    themeBtn.addEventListener('click', async () => {
      themeMode = themeMode === 'light' ? 'dark' : 'light';
      applyTheme(currentColor, themeMode);
      await setSetting('nexum_theme_mode', themeMode);
    });
  }
  const selColor = document.getElementById('themeColorSelect');
  if(selColor){
    selColor.addEventListener('change', async e => {
      currentColor = e.target.value;
      applyTheme(currentColor, themeMode);
      await setSetting('nexum_theme_color', currentColor);
    });
  }
  const selMode = document.getElementById('themeModeSelect');
  if(selMode){
    selMode.addEventListener('change', async e => {
      themeMode = e.target.value;
      applyTheme(currentColor, themeMode);
      await setSetting('nexum_theme_mode', themeMode);
    });
  }

  fetch('/api/version')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const vSpan = document.getElementById('versionSpan');
      if (!vSpan) return;
      if (data && data.version) {
        vSpan.textContent = data.version;
        vSpan.addEventListener('click', () => {
          fetch('/api/git-sha')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (d && d.sha) {
                const msg = d.timestamp
                  ? `Git SHA: ${d.sha} (${d.timestamp})`
                  : `Git SHA: ${d.sha}`;
                showToast(msg, 3000);
              }
            })
            .catch(err => console.error('Failed to fetch git sha', err));
        });
      } else {
        vSpan.style.display = 'none';
      }
    })
    .catch(err => {
      const vSpan = document.getElementById('versionSpan');
      if (vSpan) vSpan.style.display = 'none';
      console.error('Failed to fetch version', err);
    });

  const signupEl = document.getElementById('signupBtn');
  if (signupEl) {
    fetch('/api/account')
      .then(r => r.ok ? r.json() : null)
      .then(data => updateAccountButton(data))
      .catch(err => console.error('Failed to fetch account', err));
  }

  updateChatPanelVisibility();
  loadMosaicFiles();
  loadMosaicRepoPath();
  updateMosaicPanelVisibility();
  loadProjectGroups();
  loadCollapsedProjectGroups();
  loadTasksOnlyTabs();
  loadHideArchivedTabs();
  loadHideDoneTasks();
  loadChatTabOrder();
  // Project groups will be rendered within the sidebar tabs
  window.addEventListener('resize', updateChatPanelVisibility);
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
let reasoningPreviousModelName = null; // remember model when toggling reasoning
let codexPreviousModelName = null; // remember model when toggling Codex
let codexMiniEnabled = false; // toggle Codex Mini mode
let tasksVisible = true;
let markdownPanelVisible = false;
let subroutinePanelVisible = false;
let mosaicPanelVisible = false;
let mosaicEditingFile = null;
let sidebarVisible = window.innerWidth > 700;
let chatTabs = [];
let archivedTabs = [];
let currentTabId = 1;
let initialTabUuid = null;
let currentTabType = 'chat';
const mosaicAllowedTypes = ['PM AGI', 'task'];
let chatHideMetadata = false;
let chatTabAutoNaming = false;
let showSubbubbleToken = false;
let sterlingChatUrlVisible = true;
let projectInfoBarVisible = true; // visibility of the project/Sterling bar
let auroraProjectBarVisible = true; // new flag to show/hide Aurora project controls
let chatStreaming = true; // new toggle for streaming
let enterSubmitsMessage = true; // new toggle for Enter key submit
let chatQueueEnabled = false; // queue additional messages
let messageQueue = [];
let navMenuVisible = true; // visibility of the top navigation menu
let navMenuLoading = true;  // hide nav menu while showing spinner on load
let showArchivedTabs = false;
let tasksOnlyTabs = false; // filter chat tabs with tasks only
let hideArchivedTabs = true; // filter out archived chat tabs
let hideDoneTasks = false; // hide tasks with status 'Done'
let topChatTabsBarVisible = false; // visibility of the top chat tabs bar
let viewTabsBarVisible = false; // visibility of the top Chat/Tasks bar
let showProjectNameInTabs = false; // append project name to chat tab titles
let groupTabsByProject = true;   // group chat tabs by project
let projectGroups = [];           // custom project group headers
let draggingProjectIndex = null;  // index of project group being dragged
let collapsedProjectGroups = {};  // project group collapse states
let chatTabOrder = {};            // per-project tab ordering
let draggingTabRow = null;        // element of tab row being dragged
let printifyPage = 1; // current Printify product page
let showDependenciesColumn = false;
let tabGenerateImages = false; // per-tab auto image toggle (design tabs only)
let imageLoopEnabled = false; // automatic image generation loop mode
let imageLoopMessage = "Next image";
let imageGenService = 'openai';
let isImageGenerating = false; // true while an image is being generated
let lastImagePrompt = null; // avoid repeating generation for same prompt
let imageUploadEnabled = true; // show image upload button
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
let currentView = 'chat';
let searchEnabled = false; // toggle search mode
let reasoningEnabled = false; // toggle reasoning mode
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

const defaultFavicon = "/alfe_favicon_64x64.ico";
const rotatingFavicon = "/alfe_favicon_64x64.ico";
let favElement = null;

const tabTypeIcons = { chat: "💬", design: "🎨", task: "📋", pm_agi: "🤖" };
let newTabSelectedType = 'chat';

const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];

function mosaicKey(tabId){
  return `mosaic_panel_visible_tab_${tabId}`;
}

function getTabUuidFromLocation(){
  const m = window.location.pathname.match(/\/chat\/([^/]+)/);
  if(m) return m[1];
  const params = new URLSearchParams(window.location.search);
  return params.get('tab');
}

initialTabUuid = getTabUuidFromLocation();

/* Introduce an image buffer and preview, plus an array to hold their descriptions. */
let pendingImages = [];
let pendingImageDescs = [];

function updatePageTitle(){
  const active = chatTabs.find(t => t.id === currentTabId);
  if(active && active.name){
    if(active.task_id){
      document.title = `Alfe - #${active.task_id} ${active.name}`;
    } else {
      document.title = `Alfe - ${active.name}`;
    }
  } else {
    document.title = defaultTitle;
  }
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

function stripPlaceholderImageLines(text){
  if(!text) return text;
  return text
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
  html = html.replace(/^###### (.*)$/gm, '<span class="md-h6">$&</span>');
  html = html.replace(/^##### (.*)$/gm, '<span class="md-h5">$&</span>');
  html = html.replace(/^#### (.*)$/gm,  '<span class="md-h4">$&</span>');
  html = html.replace(/^### (.*)$/gm,   '<span class="md-h3">$&</span>');
  html = html.replace(/^## (.*)$/gm,    '<span class="md-h2">$&</span>');
  html = html.replace(/^# (.*)$/gm,     '<span class="md-h1">$&</span>');
  // Bold and italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<span class="md-bold">**$1**</span>');
  html = html.replace(/\*([^*]+)\*/g, '<span class="md-italic">*$1*</span>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<span class="md-inline-code">`$1`</span>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" title="$2">$1</a>');
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

function addCodeCopyButtons(root){
  if(!root) return;
  root.querySelectorAll('pre').forEach(pre => {
    if(pre.querySelector('.code-copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.innerHTML = '\u2398';
    btn.title = 'Copy code';
    btn.addEventListener('click', () => {
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
  editBtn.addEventListener("click", e => {
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

function loadTasksOnlyTabs(){
  tasksOnlyTabs = localStorage.getItem('tasksOnlyTabs') === 'true';
}

function saveTasksOnlyTabs(){
  localStorage.setItem('tasksOnlyTabs', tasksOnlyTabs);
}

function loadHideArchivedTabs(){
  const val = localStorage.getItem('hideArchivedTabs');
  hideArchivedTabs = val === null ? true : val === 'true';
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

function saveProjectGroups(){
  localStorage.setItem('projectGroups', JSON.stringify(projectGroups));
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
    btn.addEventListener('dragstart', e => {
      draggingProjectIndex = idx;
      e.dataTransfer.effectAllowed = 'move';
    });
    btn.addEventListener('dragover', e => {
      if(draggingProjectIndex === null || draggingProjectIndex === idx) return;
      e.preventDefault();
      btn.classList.add('drag-over');
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
    btn.addEventListener('drop', e => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      if(draggingProjectIndex === null || draggingProjectIndex === idx) return;
      const [moved] = projectGroups.splice(draggingProjectIndex, 1);
      projectGroups.splice(idx, 0, moved);
      draggingProjectIndex = null;
      saveProjectGroups();
      renderSidebarTabs();
    });
    btn.addEventListener('dragend', () => {
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

function isMobileViewport(){
  return window.innerWidth <= 700;
}

function updateChatPanelVisibility(){
  const chatPanel = document.querySelector(".chat-panel");
  if(!chatPanel) return;
  if(isMobileViewport() && sidebarVisible){
    chatPanel.style.display = "none";
  } else {
    chatPanel.style.display = "";
  }
}

function showModal(m){ m.style.display = "flex"; }
function hideModal(m){ m.style.display = "none"; }
$$(".modal").forEach(m => m.addEventListener("click", e => { if(e.target===m) hideModal(m); }));

function showPageLoader(){
  const loader = document.getElementById("pageLoader");
  if(loader) loader.classList.add("show");
}

function hidePageLoader(){
  const loader = document.getElementById("pageLoader");
  if(loader) loader.classList.remove("show");
}

function showSignupForm(){
  const login = document.getElementById('loginForm');
  const signup = document.getElementById('signupForm');
  if(login) login.style.display = 'none';
  if(signup) signup.style.display = 'block';
  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  if(loginTab) loginTab.classList.remove('active');
  if(signupTab) signupTab.classList.add('active');
}

function showLoginForm(){
  const login = document.getElementById('loginForm');
  const signup = document.getElementById('signupForm');
  if(signup) signup.style.display = 'none';
  if(login) login.style.display = 'block';
  const loginTab = document.getElementById('loginTab');
  const signupTab = document.getElementById('signupTab');
  if(signupTab) signupTab.classList.remove('active');
  if(loginTab) loginTab.classList.add('active');
}

function openSignupModal(e){
  if(e) e.preventDefault();
  showSignupForm();
  showModal(document.getElementById("authModal"));
}

function openLoginModal(e){
  if(e) e.preventDefault();
  showLoginForm();
  showModal(document.getElementById("authModal"));
}

function openAccountModal(e){
  if(e) e.preventDefault();
  if(accountInfo){
    const emailEl = document.getElementById("accountEmail");
    if(emailEl) emailEl.textContent = accountInfo.email;
    const enabledMsg = document.getElementById('totpEnabledMsg');
    const enableBtn = document.getElementById('enableTotpBtn');
    if(accountInfo.totpEnabled){
      if(enabledMsg) enabledMsg.style.display = 'block';
      if(enableBtn) enableBtn.style.display = 'none';
    } else {
      if(enabledMsg) enabledMsg.style.display = 'none';
      if(enableBtn) enableBtn.style.display = 'inline-block';
    }
  }
  showModal(document.getElementById("accountModal"));
}

function openSettingsModal(e){
  if(e) e.preventDefault();
  if(accountInfo){
    const tzEl = document.getElementById('accountTimezone');
    if(tzEl) tzEl.value = accountInfo.timezone || '';
    const loopSection = document.getElementById('imageLoopSection');
    const loopCheck = document.getElementById('accountImageLoopCheck');
    if(loopSection && loopCheck){
      const allowed = accountInfo.id === 1;
      loopSection.style.display = allowed ? 'block' : 'none';
      loopCheck.checked = imageLoopEnabled;
    }
  }
  const autoScrollCheck = document.getElementById('accountAutoScrollCheck');
  if(autoScrollCheck){
    autoScrollCheck.checked = chatAutoScroll;
  }
  const metaCheck = document.getElementById('accountShowMetadataCheck');
  if(metaCheck){
    metaCheck.checked = !chatHideMetadata;
  }
  showModal(document.getElementById("settingsModal"));
}

function openContactModal(e){
  if(e) e.preventDefault();
  const email = "alfe" + "@" + "alfe." + "sh";
  const span = document.getElementById("contactEmail");
  if(span) span.textContent = email;
  showModal(document.getElementById("contactModal"));
}

function updateAccountButton(info){
  const btn = document.getElementById("signupBtn");
  const favBtn = document.getElementById("aiFavoritesBtn");
  if(!btn) return;
  btn.removeEventListener("click", openSignupModal);
  btn.removeEventListener("click", openAccountModal);
  btn.removeEventListener("click", openLoginModal);
  if(info && info.exists){
    accountInfo = info;
    btn.textContent = "Account";
    btn.addEventListener("click", openAccountModal);
    btn.style.display = "inline-block";
    if(favBtn){
      favBtn.style.display = info.id === 1 ? "inline-block" : "none";
    }
    togglePortfolioMenu(info.id === 1);
    toggleImageIdColumn();
  } else {
    accountInfo = null;
    btn.textContent = "Sign Up / Login";
  btn.addEventListener("click", openSignupModal);
    if(favBtn){
      favBtn.style.display = "none";
    }
    togglePortfolioMenu(false);
    toggleImageIdColumn();
  }
}


function showToast(msg, duration=1500){
  const el = document.getElementById("toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), duration);
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
    b.addEventListener('click', () => {
      chatInputEl.value = text;
      chatSendBtnEl.click();
    });
    container.appendChild(b);
  });
}

async function logout(){
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch(err){
    console.error("Logout failed", err);
  }
  document.cookie = "sessionId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  sessionStorage.removeItem('sessionId');
  hideModal(document.getElementById("accountModal"));
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
      updateImageLimitInfo();
    } else {
      const m = String(Math.floor(diff/60000)).padStart(2,'0');
      const s = String(Math.floor((diff%60000)/1000)).padStart(2,'0');
      el.textContent = ``; // Next slot in ${m}:${s}
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
  indicator.style.display = "";
  if(chatAutoScroll){
    indicator.scrollIntoView({ behavior: "smooth", block: "end" });
  }
}

function hideImageGenerationIndicator(){
  const indicator = document.getElementById("imageGenerationIndicator");
  if(indicator) indicator.style.display = "none";
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

async function updateImageLimitInfo(files){
  try {
    const resp = await fetch(`/api/image/counts?sessionId=${encodeURIComponent(sessionId)}`);
    const data = await resp.json();
    const el = document.getElementById('imageLimitInfo');
    if(el){

      let maxSessCount = data.sessionCount;
      if (data.ipCount > maxSessCount) {
        maxSessCount = data.ipCount;
      }

      let maxLimit = data.sessionLimit;
      if (data.ipLimit > maxLimit) {
        maxSessCount = data.ipLimit;
      }

      el.textContent = `Images: ${maxSessCount}/${maxLimit}`;
      if(data.sessionCount >= data.sessionLimit || data.ipCount >= data.ipLimit){
        el.classList.add('limit-reached');
        if(data.nextReduction){
          startLimitCountdown(new Date(data.nextReduction).getTime());
        }
      } else {
        el.classList.remove('limit-reached');
        stopLimitCountdown();
      }
    }
  } catch(e){
    console.error('Failed to update image limit info:', e);
  }
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
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value })
  });
}

async function setSettings(map){
  const settings = Object.entries(map).map(([key, value]) => ({ key, value }));
  await fetch("/api/settings/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings })
  });
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
  $("#chatSubroutinesPanel").style.display = subroutinePanelVisible ? "" : "none";
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

  updateChatPanelVisibility();

  // Shift top chat tabs bar when sidebar is collapsed so it doesn't
  // overlap the logo icon in the top left.
  const appEl = document.querySelector(".app");
  if(appEl){
    appEl.classList.toggle("sidebar-collapsed", !sidebarVisible);
  }

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
    "show_dependencies_column","image_gen_service","image_upload_enabled",
    "image_paint_tray_enabled","activity_iframe_menu_visible",
    "nexum_chat_menu_visible","nexum_tabs_menu_visible",
    "image_generator_menu_visible","file_tree_menu_visible",
    "ai_models_menu_visible","tasks_menu_visible","jobs_menu_visible",
    "chat_tabs_menu_visible","up_arrow_history_enabled",
    "chat_auto_scroll","show_session_id",
    "new_tab_project_enabled","group_tabs_by_project",
    "search_enabled","ai_search_model",
    "reasoning_enabled","ai_reasoning_model","ai_vision_model",
    "codex_mini_enabled"
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
  $("#chatSubroutinesPanel").style.display = subroutinePanelVisible ? "" : "none";

  if(typeof map.sidebar_visible !== "undefined"){
    sidebarVisible = !!map.sidebar_visible;
  }
  if(isMobileViewport()){
    sidebarVisible = false;
  }
  $(".sidebar").classList.toggle("collapsed", !sidebarVisible);
  $("#divider").style.display = sidebarVisible ? "" : "none";
  const toggleSidebarBtn = $("#toggleSidebarBtn");
  if(toggleSidebarBtn){
    toggleSidebarBtn.textContent = sidebarVisible ? "Hide sidebar" : "Show sidebar";
  }
  document.getElementById("expandSidebarBtn").style.display = "none";
  const collapsedLogoInit = document.getElementById("collapsedSidebarLogo");
  if(collapsedLogoInit){
    collapsedLogoInit.style.display = sidebarVisible ? "none" : "block";
  }
  const collapsedArrowInit = document.getElementById("expandSidebarArrow");
  if(collapsedArrowInit){
    collapsedArrowInit.style.display = sidebarVisible ? "none" : "block";
  }
  updateChatPanelVisibility();
  const initTopBtns = document.getElementById("topRightButtons");
  if(initTopBtns){
    if(isMobileViewport()){
      initTopBtns.style.display = sidebarVisible ? "none" : "flex";
    } else {
      initTopBtns.style.display = "flex";
    }
  }
  const appEl = document.querySelector(".app");
  if(appEl){
    appEl.classList.toggle("sidebar-collapsed", !sidebarVisible);
  }

  if(typeof map.enter_submits_message !== "undefined"){
    enterSubmitsMessage = map.enter_submits_message !== false;
  }

  if(typeof map.sidebar_width !== "undefined"){ 
    const maxW = window.innerWidth - 100;
    const width = Math.min(map.sidebar_width, maxW);
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
  if(typeof map.codex_mini_enabled !== "undefined"){
    codexMiniEnabled = map.codex_mini_enabled !== false;
  }
  updateSearchButton();
  updateReasoningButton();
  updateCodexButton();
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
}

function tabDragOver(e){
  if(draggingTabRow && e.currentTarget !== draggingTabRow &&
     e.currentTarget.dataset.project === draggingTabRow.dataset.project){
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }
}

function tabDragLeave(e){
  e.currentTarget.classList.remove('drag-over');
}

function tabDrop(e){
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove('drag-over');
  if(draggingTabRow && target !== draggingTabRow &&
     target.dataset.project === draggingTabRow.dataset.project){
    const parent = target.parentNode;
    const rows = [...parent.children];
    let from = rows.indexOf(draggingTabRow);
    let to = rows.indexOf(target);
    parent.removeChild(draggingTabRow);
    if(from < to) to--;
    parent.insertBefore(draggingTabRow, parent.children[to]);
    updateChatTabOrder(target.dataset.project, parent);
  }
  draggingTabRow = null;
}

function tabDragEnd(){
  $$('div.sidebar-tab-row.drag-over').forEach(el=>el.classList.remove('drag-over'));
  draggingTabRow = null;
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
          tr.addEventListener(evt, {
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
    newEl.addEventListener("change", async ()=>{
      await saveCb(newEl.value);
      await loadTasks();
    });
    newEl.addEventListener("blur", ()=>loadTasks());
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

async function loadTabs(){
  const res = await fetch(`/api/chat/tabs?nexum=0&showArchived=1&sessionId=${encodeURIComponent(sessionId)}`);
  chatTabs = await res.json();
  archivedTabs = chatTabs.filter(t => t.archived);
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
    div.addEventListener("dblclick", () => editSubroutine(sub));

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.className = "edit-btn";
    editBtn.addEventListener("click", e => {
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
    // TODO: THIS WAS A TEMP FIX,
    // Reload the entire page so the new tab state is fully reflected
    // but only if this was the very first tab being created from the modal
    if(reloadNeeded){
      window.location.reload();
    }
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
    if(ct && ct.tab_uuid){
      window.history.replaceState({}, '', `/chat/${ct.tab_uuid}`);
    }
  }
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

async function quickAddTabToProject(project){
  const r = await fetch("/api/chat/tabs/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", nexum: 0, project, type: "chat", sessionId })
  });
  if(r.ok){
    const data = await r.json();
    await loadTabs();
    await selectTab(data.id);
  }
}

$("#renameTabSaveBtn").addEventListener("click", async () => {
  const modal = $("#renameTabModal");
  const tabId = parseInt(modal.dataset.tabId, 10);
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
  const repo = tab.repo_ssh_url || '';
  await fetch('/api/chat/tabs/config', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({tabId, project, repo, extraProjects, taskId, type, sessionId})
  });
  await loadTabs();
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  hideModal(modal);
});
$("#renameTabCreateTaskBtn").addEventListener("click", async () => {
  const modal = $("#renameTabModal");
  const tabId = parseInt(modal.dataset.tabId, 10);
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
  const repo = tab.repo_ssh_url || '';
  await fetch('/api/chat/tabs/config', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({tabId, project, repo, extraProjects, taskId, type, sessionId})
  });
  await loadTabs();
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  if(typeof loadTasks === 'function') await loadTasks();
  hideModal(modal);
});
$("#renameTabCancelBtn").addEventListener("click", () => hideModal($("#renameTabModal")));
$("#renameTabInput").addEventListener("keydown", evt => {
  if(evt.key === "Enter") $("#renameTabSaveBtn").click();
  else if(evt.key === "Escape") $("#renameTabCancelBtn").click();
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
    if(ct && ct.tab_uuid){
      window.history.replaceState({}, '', `/chat/${ct.tab_uuid}`);
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
      currentTabId=1;
    }
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    await loadChatHistory(currentTabId, true);
    const ct = chatTabs.find(t => t.id === currentTabId);
    if(ct && ct.tab_uuid){
      window.history.replaceState({}, '', `/chat/${ct.tab_uuid}`);
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
  if(r.ok){
    await loadTabs();
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    updatePageTitle();
    if(chatTabs.length > 0 && chatTabs.every(t => t.archived)){
      location.href = '/index.html';
    }
  }
}
async function selectTab(tabId){
  currentTabId = tabId;
  await setSetting("last_chat_tab", tabId);
  const t = chatTabs.find(t => t.id === tabId);
  currentTabType = t ? t.tab_type || 'chat' : 'chat';
  loadChatHistory(tabId, true);
  tabModelOverride = t && t.model_override ? t.model_override : '';
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
  if(t && t.tab_uuid){
    const newPath = `/chat/${t.tab_uuid}`;
    if(window.location.pathname !== newPath){
      window.history.replaceState({}, '', newPath);
    }
  }
  const saved = await getSetting(mosaicKey(tabId));
  if(typeof saved !== "undefined"){
    mosaicPanelVisible = !!saved;
  } else {
    const defVal = await getSetting("mosaic_panel_visible");
    if(typeof defVal !== "undefined") mosaicPanelVisible = !!defVal;
  }
  updateMosaicPanelVisibility();
}
function renderTabs(){
  const tc = $("#tabsContainer");
  if(!tc) return;
  tc.innerHTML="";
  chatTabs.filter(t => showArchivedTabs || !t.archived).forEach(tab => {
    const tabBtn = document.createElement("div");
    tabBtn.style.display="flex";
    tabBtn.style.alignItems="center";
    tabBtn.style.cursor="pointer";

    if (tab.id === currentTabId) {
      tabBtn.style.backgroundColor = "#555";
      tabBtn.style.border = "2px solid #aaa";
      tabBtn.style.color = "#fff";
    } else {
      tabBtn.style.backgroundColor = "#333";
      tabBtn.style.border = "1px solid #444";
      tabBtn.style.color = "#ddd";
    }

    tabBtn.style.padding="4px 6px";
    const iconSpan = document.createElement("span");
    iconSpan.className = "tab-icon";
    iconSpan.textContent = tabTypeIcons[tab.tab_type] || tabTypeIcons.chat;
    tabBtn.appendChild(iconSpan);
    const nameSpan = document.createElement("span");
    const fullName = tab.name + (showProjectNameInTabs && tab.project_name ? ` (${tab.project_name})` : "");
    nameSpan.textContent = truncateTabTitle(fullName);
    nameSpan.title = fullName;
    nameSpan.style.flexGrow = "1";
    nameSpan.addEventListener("click", ()=>selectTab(tab.id));
    tabBtn.appendChild(nameSpan);

    const dateSpan = document.createElement("span");
    dateSpan.textContent = isoDateTime(tab.created_at);
    dateSpan.className = "tab-date";
    dateSpan.style.marginLeft = "4px";
    tabBtn.appendChild(dateSpan);

    const renameBtn = document.createElement("button");
    renameBtn.innerHTML = "&#9881;";
    renameBtn.style.marginLeft = "4px";
    renameBtn.addEventListener("click", e=>{ e.stopPropagation(); openRenameTabModal(tab.id); });
    tabBtn.appendChild(renameBtn);

    const forkBtn = document.createElement("button");
    forkBtn.textContent = "Fork";
    forkBtn.style.marginLeft = "4px";
    forkBtn.addEventListener("click", e=>{ e.stopPropagation(); duplicateTab(tab.id); });
    tabBtn.appendChild(forkBtn);

    const archBtn = document.createElement("button");
    archBtn.innerHTML = tab.archived ? "Unarchive" : "&#128452;";
    archBtn.title = tab.archived ? "Unarchive" : "Archive";
    archBtn.style.marginLeft = "4px";
    archBtn.addEventListener("click", e=>{ e.stopPropagation(); toggleArchiveTab(tab.id, !tab.archived); });
    tabBtn.appendChild(archBtn);

    tabBtn.addEventListener("contextmenu", e=>{
      e.preventDefault();
      if(tab.tab_uuid){
        window.open(`/chat/${tab.tab_uuid}`, "_blank");
      }
    });
    tc.appendChild(tabBtn);
  });
}

// New function to render vertical chat tabs in sidebar
function renderSidebarTabs(){
  const container = document.getElementById("verticalTabsContainer");
  container.innerHTML="";
  const showArchive = showArchivedTabs && !hideArchivedTabs;
  const tabs = chatTabs.filter(t => (showArchive || !t.archived) && (!tasksOnlyTabs || t.task_id));
  if(groupTabsByProject){
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
    for(const [project, list] of groups.entries()){
      if(list.length === 0) continue;
      const collapsed = collapsedProjectGroups[project];
      const header = document.createElement("div");
      header.className = "tab-project-header";
      const arrow = document.createElement("span");
      arrow.className = "project-collapse-arrow";
      arrow.textContent = collapsed ? "\u25B6" : "\u25BC"; // ▶ or ▼
      const label = document.createElement("span");
      label.textContent = " " + (project || "(No project)");
      label.style.flexGrow = "0";
      header.appendChild(arrow);
      header.appendChild(label);
      if(project){
        const gear = document.createElement("button");
        gear.innerHTML = "&#9881;";
        gear.className = "project-gear-btn config-btn";
        gear.addEventListener("click", e => { e.stopPropagation(); openProjectSettingsModal(project); });
        header.appendChild(gear);
        const addBtn = document.createElement("button");
        addBtn.textContent = "+";
        addBtn.className = "project-add-btn config-btn";
        addBtn.addEventListener("click", e => { e.stopPropagation(); quickAddTabToProject(project); });
        header.appendChild(addBtn);
      }
      header.addEventListener("click", e => {
        e.stopPropagation();
        collapsedProjectGroups[project] = !collapsedProjectGroups[project];
        saveCollapsedProjectGroups();
        renderSidebarTabs();
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
      list.forEach(tab => renderSidebarTabRow(groupDiv, tab, true));
      container.appendChild(groupDiv);
    }
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
  let lastDate = null;
  tabs.forEach(tab => {
    const tabDate = isoDate(tab.created_at);
    if(tabDate !== lastDate){
      const header = document.createElement("div");
      header.className = "tab-date-header";
      header.textContent = isoDateWithDay(tab.created_at);
      container.appendChild(header);
      lastDate = tabDate;
    }
    renderSidebarTabRow(container, tab);
  });
}

function renderSidebarTabRow(container, tab, indented=false){
  const wrapper = document.createElement("div");
  wrapper.className = "sidebar-tab-row";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "4px";
  wrapper.style.width = "100%";
  if(indented) wrapper.classList.add("project-indented");
  wrapper.dataset.tabId = tab.id;
  wrapper.dataset.project = tab.project_name || "";

  const grab = document.createElement("span");
  grab.className = "drag-handle";
  grab.textContent = "⠿";
  grab.draggable = true;
  grab.addEventListener("dragstart", tabDragStart);
  wrapper.appendChild(grab);

  const info = document.createElement("div");
  info.style.display = "flex";
  info.style.justifyContent = "space-between";
  info.style.alignItems = "center";
  info.style.flexGrow = "1";

  const b = document.createElement("button");
  const icon = document.createElement("span");
  icon.className = "tab-icon";
  icon.textContent = tabTypeIcons[tab.tab_type] || tabTypeIcons.chat;
  b.appendChild(icon);
  const fullName = tab.name + (showProjectNameInTabs && tab.project_name ? ` (${tab.project_name})` : "");
  b.appendChild(document.createTextNode(truncateTabTitle(fullName)));
  b.title = fullName;
  if (tab.id === currentTabId) {
    b.classList.add("active");
  }
  b.style.flexGrow = "1";
  b.addEventListener("click", () => {
    selectTab(tab.id);
    if(isMobileViewport() && sidebarVisible){
      toggleSidebar();
    }
  });
  b.addEventListener("contextmenu", e => {
    e.preventDefault();
    if(tab.tab_uuid){
      window.open(`/chat/${tab.tab_uuid}`, "_blank");
    }
  });

  const dateSpan = document.createElement("span");
  dateSpan.textContent = isoDateTime(tab.created_at);
  dateSpan.className = "tab-date";

  info.appendChild(b);
  info.appendChild(dateSpan);

  const renameBtn = document.createElement("button");
  renameBtn.innerHTML = "&#9881;";
  renameBtn.addEventListener("click", e => {
    e.stopPropagation();
    openRenameTabModal(tab.id);
  });

  const forkBtn = document.createElement("button");
  forkBtn.textContent = "Fork";
  forkBtn.addEventListener("click", e => {
    e.stopPropagation();
    duplicateTab(tab.id);
  });

  const archBtn = document.createElement("button");
  archBtn.innerHTML = tab.archived ? "Unarchive" : "&#128452;";
  archBtn.title = tab.archived ? "Unarchive" : "Archive";
  archBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleArchiveTab(tab.id, !tab.archived);
  });

  const taskIdSpan = document.createElement("span");
  taskIdSpan.className = "task-id";
  if (tab.task_id) {
    taskIdSpan.textContent = `#${tab.task_id}`;
  }

  wrapper.appendChild(info);
  wrapper.appendChild(renameBtn);
  wrapper.appendChild(forkBtn);
  wrapper.appendChild(archBtn);
  if (tab.task_id) wrapper.appendChild(taskIdSpan);
  wrapper.addEventListener("dragover", tabDragOver);
  wrapper.addEventListener("dragleave", tabDragLeave);
  wrapper.addEventListener("drop", tabDrop);
  wrapper.addEventListener("dragend", tabDragEnd);
  container.appendChild(wrapper);
}

function renderArchivedSidebarTabs(){
  const container = document.getElementById("archivedTabsContainer");
  if(!container) return;
  container.innerHTML = "";
  const tabs = archivedTabs;
  if(groupTabsByProject){
    const groups = new Map();
    tabs.forEach(t => {
      const key = t.project_name || "";
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    for(const [project, list] of groups.entries()){
      const header = document.createElement("div");
      header.className = "tab-project-header";
      header.textContent = project || "(No project)";
      container.appendChild(header);
      list.forEach(tab => addArchivedRow(container, tab));
    }
    return;
  }
  tabs.forEach(tab => addArchivedRow(container, tab));
}

function addArchivedRow(container, tab){
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "4px";
  wrapper.style.width = "100%";

  const icon = document.createElement("span");
  icon.className = "tab-icon";
  icon.textContent = tabTypeIcons[tab.tab_type] || tabTypeIcons.chat;

  const info = document.createElement("div");
  info.style.display = "flex";
  info.style.flexDirection = "column";
  info.style.flexGrow = "1";

  const label = document.createElement("span");
  const fullName = tab.name + (showProjectNameInTabs && tab.project_name ? ` (${tab.project_name})` : "");
  label.textContent = truncateTabTitle(fullName);
  label.title = fullName;

  const dateSpan = document.createElement("span");
  dateSpan.className = "tab-date";
  dateSpan.textContent = `Created ${isoDateTime(tab.created_at)} \u2022 Archived ${isoDateTime(tab.archived_at)}`;

  info.appendChild(label);
  info.appendChild(dateSpan);

  const unarchBtn = document.createElement("button");
  unarchBtn.textContent = "Unarchive";
  unarchBtn.addEventListener("click", async () => {
    await toggleArchiveTab(tab.id, false);
    await loadTabs();
    renderArchivedSidebarTabs();
  });

  const taskIdSpan = document.createElement("span");
  taskIdSpan.className = "task-id";
  if (tab.task_id) {
    taskIdSpan.textContent = `#${tab.task_id}`;
  }

  wrapper.appendChild(icon);
  wrapper.appendChild(info);
  wrapper.appendChild(unarchBtn);
  if (tab.task_id) wrapper.appendChild(taskIdSpan);
  container.appendChild(wrapper);
}

document.getElementById("newSideTabBtn").addEventListener("click", openNewTabModal);
document.getElementById("newProjectGroupBtn")?.addEventListener("click", addProjectGroup);
const tasksOnlyTabsCheck = document.getElementById("tasksOnlyTabsCheck");
if(tasksOnlyTabsCheck){
  tasksOnlyTabsCheck.addEventListener("change", () => {
    tasksOnlyTabs = tasksOnlyTabsCheck.checked;
    saveTasksOnlyTabs();
    renderSidebarTabs();
  });
}
const hideArchivedTabsCheck = document.getElementById("hideArchivedTabsCheck");
if(hideArchivedTabsCheck){
  hideArchivedTabsCheck.addEventListener("change", () => {
    hideArchivedTabs = hideArchivedTabsCheck.checked;
    saveHideArchivedTabs();
    renderSidebarTabs();
  });
}
const newTabBtnEl = document.getElementById("newTabBtn");
if (newTabBtnEl) newTabBtnEl.addEventListener("click", openNewTabModal);
$$('#newTabTypeButtons .start-type-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    newTabSelectedType = btn.dataset.type;
    await addNewTab();
  });
});
const addModelModalAddBtn = document.getElementById("addModelModalAddBtn");
if(addModelModalAddBtn){
  addModelModalAddBtn.addEventListener("click", async () => {
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
  addModelModalCancelBtn.addEventListener("click", () => {
    hideModal(document.getElementById("addModelModal"));
  });
}
document.getElementById("newSubroutineBtn").addEventListener("click", addNewSubroutine);
document.getElementById("viewActionHooksBtn").addEventListener("click", () => {
  renderActionHooks();
  showModal(document.getElementById("actionHooksModal"));
});
document.getElementById("actionHooksCloseBtn").addEventListener("click", () => hideModal(document.getElementById("actionHooksModal")));
document.getElementById("subroutineSaveBtn").addEventListener("click", saveSubroutine);
document.getElementById("subroutineCancelBtn").addEventListener("click", () => {
  editingSubroutineId = null;
  hideModal(document.getElementById("subroutineModal"));
});

// Subscribe button opens subscription plans modal (if present)
const subscribeBtn = document.getElementById("subscribeBtn");
if (subscribeBtn) {
  subscribeBtn.addEventListener("click", e => {
    e.preventDefault();
    showModal(document.getElementById("subscribeModal"));
  });
}
const subscribeCloseBtn = document.getElementById("subscribeCloseBtn");
if (subscribeCloseBtn) {
  subscribeCloseBtn.addEventListener("click", () =>
    hideModal(document.getElementById("subscribeModal"))
  );
}

const signupBtn = document.getElementById("signupBtn");
if (signupBtn) {
  signupBtn.addEventListener("click", openSignupModal);
}
const signupSubmitBtn = document.getElementById("signupSubmitBtn");
if (signupSubmitBtn) {
  signupSubmitBtn.addEventListener("click", async () => {
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const confirm = document.getElementById("signupConfirm")?.value;
    if(!email || !password){
      showToast("Email and password required");
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
        updateAccountButton({exists:true, id:data.id, email, totpEnabled: data.totpEnabled});
      } else {
        showToast(data?.error || "Registration failed");
      }
    } catch(err){
      console.error("Registration failed", err);
      showToast("Registration failed");
    }
  });
}

const loginCancelBtn = document.getElementById("loginCancelBtn");
if (loginCancelBtn) {
  loginCancelBtn.addEventListener("click", () =>
    hideModal(document.getElementById("authModal"))
  );
}

const showSignupBtn = document.getElementById("showSignupBtn");
if (showSignupBtn) {
  showSignupBtn.addEventListener("click", showSignupForm);
}

const showLoginBtn = document.getElementById("showLoginBtn");
if (showLoginBtn) {
  showLoginBtn.addEventListener("click", showLoginForm);
}

const loginTabBtn = document.getElementById("loginTab");
if (loginTabBtn) {
  loginTabBtn.addEventListener("click", showLoginForm);
}

const signupTabBtn = document.getElementById("signupTab");
if (signupTabBtn) {
  signupTabBtn.addEventListener("click", showSignupForm);
}

const loginSubmitBtn = document.getElementById("loginSubmitBtn");
if (loginSubmitBtn) {
  loginSubmitBtn.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const token = document.getElementById("loginTotp")?.value.trim();
    if(!email || !password){
      showToast("Email and password required");
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
        updateAccountButton({exists:true, id:data.id, email, totpEnabled: data.totpEnabled});
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

const accountCloseBtn = document.getElementById("accountCloseBtn");
if(accountCloseBtn){
  accountCloseBtn.addEventListener("click", () =>
    hideModal(document.getElementById("accountModal"))
  );
}

const accountLogoutBtn = document.getElementById("accountLogoutBtn");
if(accountLogoutBtn){
  accountLogoutBtn.addEventListener("click", logout);
}

const settingsBtn = document.getElementById("settingsBtn");
if(settingsBtn){
  settingsBtn.addEventListener("click", openSettingsModal);
}

const contactBtn = document.getElementById("contactBtn");
if(contactBtn){
  contactBtn.addEventListener("click", openContactModal);
}

const contactCloseBtn = document.getElementById("contactCloseBtn");
if(contactCloseBtn){
  contactCloseBtn.addEventListener("click", () =>
    hideModal(document.getElementById("contactModal"))
  );
}

const settingsCloseBtn = document.getElementById("settingsCloseBtn");
if(settingsCloseBtn){
  settingsCloseBtn.addEventListener("click", () =>
    hideModal(document.getElementById("settingsModal"))
  );
}

const enableTotpBtn = document.getElementById('enableTotpBtn');
if(enableTotpBtn){
  enableTotpBtn.addEventListener('click', async () => {
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
  totpVerifyBtn.addEventListener('click', async () => {
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

const timezoneSaveBtn = document.getElementById('timezoneSaveBtn');
if(timezoneSaveBtn){
  timezoneSaveBtn.addEventListener('click', async () => {
    const tz = document.getElementById('accountTimezone').value.trim();
    const resp = await fetch('/api/account/timezone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: tz })
    });
    const data = await resp.json().catch(() => null);
    if(resp.ok && data && data.success){
      if(accountInfo) accountInfo.timezone = tz;
      showToast('Timezone saved');
    } else {
      showToast(data?.error || 'Failed to save timezone');
    }
  });
}

const showChangePasswordBtn = document.getElementById('showChangePasswordBtn');
const passwordForm = document.getElementById('passwordForm');
if(showChangePasswordBtn && passwordForm){
  showChangePasswordBtn.addEventListener('click', () => {
    passwordForm.style.display = 'block';
    showChangePasswordBtn.style.display = 'none';
  });
}

const changePasswordBtn = document.getElementById('changePasswordBtn');
if(changePasswordBtn){
  changePasswordBtn.addEventListener('click', async () => {
    const current = document.getElementById('currentPassword').value;
    const pw = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    if(!current || !pw){
      showToast('All fields required');
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

const accountImageLoopCheck = document.getElementById('accountImageLoopCheck');
if(accountImageLoopCheck){
  accountImageLoopCheck.addEventListener('change', () => {
    imageLoopEnabled = accountImageLoopCheck.checked && accountInfo && accountInfo.id === 1;
    setLoopUi(imageLoopEnabled);
    if(imageLoopEnabled){
      setTimeout(runImageLoop, 0);
    }
    accountImageLoopCheck.checked = imageLoopEnabled;
  });
}

const accountAutoScrollCheck = document.getElementById('accountAutoScrollCheck');
if(accountAutoScrollCheck){
  accountAutoScrollCheck.addEventListener('change', async () => {
    chatAutoScroll = accountAutoScrollCheck.checked;
    if(chatAutoScroll){
      setTimeout(scrollChatToBottom, 0);
    }
    await setSetting('chat_auto_scroll', chatAutoScroll);
  });
}

const accountShowMetadataCheck = document.getElementById('accountShowMetadataCheck');
if(accountShowMetadataCheck){
  accountShowMetadataCheck.addEventListener('change', async () => {
    chatHideMetadata = !accountShowMetadataCheck.checked;
    await setSetting('chat_hide_metadata', chatHideMetadata);
  });
}

document.getElementById("viewTabChat")?.addEventListener("click", () => updateView('chat'));
document.getElementById("viewTabTasks")?.addEventListener("click", () => updateView('tasks'));
document.getElementById("viewTabArchive")?.addEventListener("click", () => updateView('archive'));

// New: Button to toggle top chat tabs bar
const toggleTopChatTabsBtn = document.getElementById("toggleTopChatTabsBtn");
if(toggleTopChatTabsBtn){
  toggleTopChatTabsBtn.addEventListener("click", async () => {
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

function parseProviderModel(model) {
  if(!model) return { provider: "Unknown", shortModel: "Unknown" };
  if(model.startsWith("openai/")) {
    return { provider: "openai", shortModel: model.replace(/^openai\//,'') };
  } else if(model.startsWith("openrouter/")) {
    return { provider: "openrouter", shortModel: model.replace(/^openrouter\//,'') };
  } else if(model.startsWith("deepseek/")) {
    return { provider: "openrouter", shortModel: model.replace(/^deepseek\//,'') };
  } else if(model.startsWith("stable-diffusion/")) {
    return { provider: "stable-diffusion", shortModel: model.replace(/^stable-diffusion\//,'') };
  }
  return { provider: "Unknown", shortModel: model };
}

function getModelCost(modelId, inputTokens, outputTokens) {
  if (!window.allAiModels) return null;
  const info = window.allAiModels.find(m => m.id === modelId);
  if (!info) return null;
  const inRate = parseFloat(String(info.inputCost || '').replace('$', ''));
  const outRate = parseFloat(String(info.outputCost || '').replace('$', ''));
  if (isNaN(inRate) || isNaN(outRate)) return null;
  const cost = (inputTokens / 1000) * inRate + (outputTokens / 1000) * outRate;
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

const chatInputEl = document.getElementById("chatInput");
const chatSendBtnEl = document.getElementById("chatSendBtn");
const waitingElem = document.getElementById("waitingCounter");
const scrollDownBtnEl = document.getElementById("scrollDownBtn");

setLoopUi(imageLoopEnabled);

// Keep a history of user-entered messages for quick recall
let inputHistory = [];
let inputHistoryPos = -1;

if (scrollDownBtnEl) {
  scrollDownBtnEl.addEventListener("click", () => {
    const chatMessagesEl = document.getElementById("chatMessages");
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    setTimeout(() => scrollChatToBottom(true), 0);
  });
}

chatInputEl.addEventListener("keydown", (e) => {
  if (upArrowHistoryEnabled && e.key === "ArrowUp") {
    if (inputHistory.length > 0) {
      if (inputHistoryPos === -1) inputHistoryPos = inputHistory.length - 1;
      else if (inputHistoryPos > 0) inputHistoryPos--;
      chatInputEl.value = inputHistory[inputHistoryPos] || "";
      setTimeout(() => {
        chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
      }, 0);
    }
    e.preventDefault();
  } else if (upArrowHistoryEnabled && e.key === "ArrowDown") {
    if (inputHistory.length > 0) {
      if (inputHistoryPos >= 0 && inputHistoryPos < inputHistory.length - 1) {
        inputHistoryPos++;
        chatInputEl.value = inputHistory[inputHistoryPos] || "";
      } else {
        inputHistoryPos = -1;
        chatInputEl.value = "";
      }
      setTimeout(() => {
        chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
      }, 0);
    }
    e.preventDefault();
  } else if (enterSubmitsMessage && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if(chatSendBtnEl.disabled && chatQueueEnabled){
      queueMessage(chatInputEl.value.trim());
      chatInputEl.value = "";
    } else {
      chatSendBtnEl.click();
    }
  }
});

chatSendBtnEl.addEventListener("click", async () => {
  const chatMessagesEl = document.getElementById("chatMessages");
  const placeholderEl = document.getElementById("chatPlaceholder");
  const userMessage = chatInputEl.value.trim();
  if(!userMessage && pendingImages.length===0) return;
  renderDesignSuggestions(false);
  chatSendBtnEl.disabled = true;
  if(userMessage){
    inputHistory.push(userMessage);
    inputHistoryPos = -1;
  }

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
  } else if(!userMessage && descsForThisSend.length===0){
    if (favElement) favElement.href = defaultFavicon;
    chatSendBtnEl.disabled = false;
    processNextQueueMessage();
    return;
  }

  chatInputEl.value = "";

  // Create the single chat-sequence
  const seqDiv = document.createElement("div");
  seqDiv.className = "chat-sequence";

  // The user bubble
  const userDiv = document.createElement("div");
  userDiv.className = "chat-user";

  const userHead = document.createElement("div");
  userHead.className = "bubble-header";
  const userTime = new Date().toISOString();
  const userLabel = "You";
  userHead.innerHTML = `
    <div class="name-oval name-oval-user">${userLabel}</div>
    <span style="opacity:0.8;">${formatTimestamp(userTime)}</span>
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

  // The AI bubble
  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai" title="${modelName}">${window.agentName}</div>
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

  try {
    const resp = await fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:combinedUserText, tabId: currentTabId, userTime, sessionId})
    });
    clearInterval(waitInterval);
    waitingElem.textContent = "";

    if(!resp.ok){
      clearInterval(ellipsisInterval);
      botTextSpan.textContent = "[Error contacting AI]";
      botHead.querySelector("span").textContent = formatTimestamp(new Date().toISOString());
    } else {
      const reader = resp.body.getReader();
      while(true){
        const { value, done } = await reader.read();
        if(done) break;
        partialText += new TextDecoder().decode(value);
      }
      // Update once more without the loader after streaming finishes
      botBody.innerHTML = formatCodeBlocks(stripPlaceholderImageLines(partialText));
      addCodeCopyButtons(botBody);
      addFilesFromCodeBlocks(partialText);
      if(chatAutoScroll) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      clearInterval(ellipsisInterval);
      botHead.querySelector("span").textContent = formatTimestamp(new Date().toISOString());
    }

    // Code previously auto-created a task for every chat pair.
    // This behavior has been disabled to avoid cluttering the task list.

    await loadChatHistory(currentTabId, true);
    await loadTabs();
    renderTabs();
    renderSidebarTabs();
    renderArchivedSidebarTabs();
    updatePageTitle();
    actionHooks.forEach(h => {
      if(typeof h.fn === "function"){
        try { h.fn({type:"afterSend", message: combinedUserText, response: partialText}); }
        catch(err){ console.error("Action hook error:", err); }
      }
      });
  } catch(e) {
    clearInterval(waitInterval);
    clearInterval(ellipsisInterval);
    waitingElem.textContent = "";
    botTextSpan.textContent = "[Error occurred]";
    botHead.querySelector("span").textContent = formatTimestamp(new Date().toISOString());
  }

  if (favElement) favElement.href = defaultFavicon;

  if(chatAutoScroll){
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    setTimeout(scrollChatToBottom, 0);
  }
  chatSendBtnEl.disabled = false;
  processNextQueueMessage();
});

async function openChatSettings(){
  showPageLoader();
  const r = await fetch("/api/settings/chat_hide_metadata");
  if(r.ok){
    const { value } = await r.json();
    if(typeof value !== "undefined"){
      chatHideMetadata = !!value;
    } else {
      chatHideMetadata = false;
    }
  } else {
    chatHideMetadata = false;
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

  const imgSvcSel = document.getElementById("imageServiceSelect");
  if(imgSvcSel) imgSvcSel.value = imageGenService;

  $("#hideMetadataCheck").checked = chatHideMetadata;
  $("#autoNamingCheck").checked = chatTabAutoNaming;
  const subbubbleTokenCheckEl = $("#subbubbleTokenCheck");
  if(subbubbleTokenCheckEl) subbubbleTokenCheckEl.checked = showSubbubbleToken;
  $("#sterlingUrlCheck").checked = sterlingChatUrlVisible;
  $("#showProjectInfoCheck").checked = projectInfoBarVisible;
  $("#showAuroraProjectBarCheck").checked = auroraProjectBarVisible;
  $("#showMarkdownTasksCheck").checked = markdownPanelVisible;
  $("#showDependenciesColumnCheck").checked = showDependenciesColumn;
  $("#showSubroutinePanelCheck").checked = subroutinePanelVisible;
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
    const modelListResp = await fetch("/api/ai/models");
    if(modelListResp.ok){
      const modelData = await modelListResp.json();
      window.allAiModels = modelData.models || [];

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
        providerSel.addEventListener("change", () => {
          updateAiModelSelect();
        });
      }

      const currentModel = await getSetting("ai_model");
      if(currentModel) aiModelSelect.value = currentModel;
    }
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
  betaCheck.addEventListener("change", e => {
    betaContinue.disabled = !e.target.checked;
  });
}

if(betaCancel){
  betaCancel.addEventListener("click", () => {
    hideModal($("#chatSettingsBetaModal"));
  });
}

if(betaContinue){
  betaContinue.addEventListener("click", async () => {
    if(!betaCheck.checked) return;
    localStorage.setItem("chatSettingsBetaAck", "true");
    hideModal($("#chatSettingsBetaModal"));
    await openChatSettings();
  });
}

// React when AI service changes
$("#aiServiceSelect").addEventListener("change", async ()=>{
  try {
    const modelListResp = await fetch("/api/ai/models");
    if(modelListResp.ok){
      const modelData = modelListResp.json();
      window.allAiModels = (await modelData).models || [];

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
    }
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
  auroraProjectBarVisible = $("#showAuroraProjectBarCheck").checked;
  chatStreaming = $("#chatStreamingCheck").checked;
  markdownPanelVisible = $("#showMarkdownTasksCheck").checked;
  showDependenciesColumn = $("#showDependenciesColumnCheck").checked;
  subroutinePanelVisible = $("#showSubroutinePanelCheck").checked;
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
    console.log("[OBTAINED PROVIDER] => (global model removed in UI, fallback only)");
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
  el.style.display = visible ? "inline" : "none";
}

function toggleProjectInfoBarVisibility(visible){
  visible = visible && auroraProjectBarVisible;
  const ids = ["projectInfo", "setProjectBtn", "createSterlingChatBtn", "changeSterlingBranchBtn"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = visible ? "" : "none";
  });
  const urlEl = document.getElementById("sterlingUrlLabel");
  if(urlEl) urlEl.style.display = visible && sterlingChatUrlVisible ? "inline" : "none";
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

function setLoopUi(active){
  if(chatSendBtnEl) chatSendBtnEl.style.display = active ? 'none' : '';
}

function toggleImageUploadButton(visible){
  const btn = document.getElementById("chatImageBtn");
  if(!btn) return;
  btn.style.display = visible ? "" : "none";
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
  const prefix = searchEnabled ? "\uD83D\uDD0D " : codexMiniEnabled ? "</> " : ""; // magnifying glass when searching or code icon
  hud.textContent = `Model: ${prefix}${modelName}`;
}

function updateSearchButton(){
  const btn = document.getElementById("searchToggleBtn");
  if(!btn) return;
  btn.classList.toggle("active", searchEnabled);
}

function updateReasoningButton(){
  const btn = document.getElementById("reasoningToggleBtn");
  if(!btn) return;
  btn.classList.toggle("active", reasoningEnabled);
}

function updateCodexButton(){
  const btn = document.getElementById("codexToggleBtn");
  if(!btn) return;
  btn.classList.toggle("active", codexMiniEnabled);
}

async function toggleSearch(){
  if(!searchEnabled && (reasoningEnabled || codexMiniEnabled)){
    showToast("Disable Reasoning/Codex mode first");
    return;
  }
  searchEnabled = !searchEnabled;
  await setSetting("search_enabled", searchEnabled);
  if(searchEnabled){
    previousModelName = modelName; // remember current model
    const searchModel = await getSetting("ai_search_model") || "openrouter/perplexity/sonar";
    await setSetting("ai_model", searchModel);
    modelName = searchModel;
  } else {
    const restoreModel = await getSetting("ai_model") || "deepseek/deepseek-chat-0324";
    await setSetting("ai_model", restoreModel);
    modelName = restoreModel;
    previousModelName = null;
  }
  updateModelHud();
  updateSearchButton();
  updateReasoningButton();
  updateCodexButton();
}

async function toggleReasoning(){
  if(!reasoningEnabled && (searchEnabled || codexMiniEnabled)){
    showToast("Disable Search/Codex mode first");
    return;
  }
  reasoningEnabled = !reasoningEnabled;
  await setSetting("reasoning_enabled", reasoningEnabled);
  if(reasoningEnabled){
    reasoningPreviousModelName = modelName; // remember current model
    const reasoningModel = await getSetting("ai_reasoning_model") || "openrouter/perplexity/sonar-reasoning";
    await setSetting("ai_model", reasoningModel);
    modelName = reasoningModel;
  } else {
    const restoreModel = await getSetting("ai_model") || "deepseek/deepseek-chat-0324";
    await setSetting("ai_model", restoreModel);
    modelName = restoreModel;
    reasoningPreviousModelName = null;
  }
  updateModelHud();
  updateReasoningButton();
  updateSearchButton();
  updateCodexButton();
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
    await setSetting("ai_model", codexModel);
    modelName = codexModel;
  } else {
    const restoreModel = await getSetting("ai_model") || "deepseek/deepseek-chat-0324";
    await setSetting("ai_model", restoreModel);
    modelName = restoreModel;
    codexPreviousModelName = null;
  }
  updateModelHud();
  updateCodexButton();
  updateSearchButton();
  updateReasoningButton();
}

(function installDividerDrag(){
  const divider = $("#divider");
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;
  let finalWidth = 0;

  divider.addEventListener("mousedown", e => {
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
    const maxWidth = window.innerWidth - 100;
    if(newWidth >= minWidth) {
      const clamped = Math.min(newWidth, maxWidth);
      $(".sidebar").style.width = clamped + "px";
      finalWidth = clamped;
    }
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

function renderFileList(){
  const table = $("#secureFilesList");
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";
  fileListData.forEach((f, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.fileName = f.name;
    const tdIndex = document.createElement("td");
    tdIndex.className = "uuid-col";
    tdIndex.textContent = f.uuid ?? "";
    const tdId = document.createElement("td");
    tdId.className = "id-col";
    tdId.textContent = (f.id !== null && f.id !== undefined) ? `img-${f.id}` : "";
    const tdThumb = document.createElement("td");
    const thumbImg = document.createElement("img");
    thumbImg.src = `/uploads/${encodeURIComponent(f.name)}`;
    thumbImg.alt = f.title || f.name;
    thumbImg.className = "table-thumb";
    tdThumb.appendChild(thumbImg);
    const tdName = document.createElement("td");
    tdName.className = "name-col";
    const link = document.createElement("a");
    link.href = `/uploads/${f.name}`;
    link.target = "_blank";
    link.textContent = f.name;
    tdName.appendChild(link);
    const tdTitle = document.createElement("td");
    tdTitle.textContent = f.title || "";
    const tdSource = document.createElement("td");
    tdSource.textContent = f.source || "";
    const tdStatus = document.createElement("td");
    tdStatus.textContent = f.status || "";
    tdStatus.className = "img-status-cell";
    const tdProductUrl = document.createElement("td");
    if(f.productUrl){
      const link = document.createElement("a");
      link.href = f.productUrl;
      link.textContent = f.productUrl;
      link.target = "_blank";
      tdProductUrl.appendChild(link);
    } else {
      tdProductUrl.textContent = "";
    }
    const tdEbayUrl = document.createElement("td");
    if(f.ebayUrl){
      const link = document.createElement("a");
      link.href = f.ebayUrl;
      link.textContent = f.ebayUrl;
      link.target = "_blank";
      tdEbayUrl.appendChild(link);
    } else {
      tdEbayUrl.textContent = "";
    }
   const tdPortfolio = document.createElement("td");
   const portCheck = document.createElement("input");
   portCheck.type = "checkbox";
   portCheck.checked = !!f.portfolio;
   portCheck.addEventListener("change", async () => {
     await fetch('/api/upload/portfolio', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ name: f.name, portfolio: portCheck.checked })
     });
   });
   tdPortfolio.appendChild(portCheck);
    const tdHidden = document.createElement("td");
    const hidCheck = document.createElement("input");
    hidCheck.type = "checkbox";
    hidCheck.checked = !!f.hidden;
    hidCheck.addEventListener("change", async () => {
      await fetch('/api/upload/hidden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, hidden: hidCheck.checked })
      });
    });
    tdHidden.appendChild(hidCheck);
    const tdSize = document.createElement("td");
    tdSize.textContent = Math.round(f.size / 1024) + " KB";
    const tdMtime = document.createElement("td");
    tdMtime.textContent = new Date(f.mtime).toLocaleString();
    const tdAction = document.createElement("td");
    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
        window.open(`/Image.html?file=${encodeURIComponent(f.name)}`,
                    "_blank");
      });
    tdAction.appendChild(openBtn);

    const cropBtn = document.createElement("button");
    cropBtn.textContent = "Crop";
    cropBtn.addEventListener("click", () => {
      window.open(`/crop.html?file=${encodeURIComponent(f.name)}`, "_blank");
    });
    tdAction.appendChild(cropBtn);

    const dlBtn = document.createElement("button");
    dlBtn.className = "download-chat-btn table-download-btn";
    dlBtn.textContent = "⤓";
    dlBtn.title = "Download this image";
    dlBtn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = `/uploads/${encodeURIComponent(f.name)}`;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    tdAction.appendChild(dlBtn);
    const urlBtn = document.createElement("button");
    urlBtn.textContent = "Set URL";
    urlBtn.addEventListener("click", async () => {
      const current = f.productUrl || "";
      const url = prompt("Enter Printify Product URL:", current);
      if(!url) return;
      try{
        await fetch('/api/upload/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: f.name, productUrl: url })
        });
        await loadFileList();
      }catch(err){
        console.error('Failed to set Printify URL =>', err);
        alert('Failed to set Printify URL');
      }
    });
    tdAction.appendChild(urlBtn);
    const ebayBtn = document.createElement("button");
    ebayBtn.textContent = "Set eBay";
    ebayBtn.addEventListener("click", async () => {
      const current = f.ebayUrl || "";
      const url = prompt("Enter eBay Listing URL:", current);
      if(!url) return;
      try{
        await fetch('/api/upload/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: f.name, ebayUrl: url })
        });
        await loadFileList();
      }catch(err){
        console.error('Failed to set eBay URL =>', err);
        alert('Failed to set eBay URL');
      }
    });
    tdAction.appendChild(ebayBtn);
    tr.appendChild(tdIndex);
    tr.appendChild(tdId);
    tr.appendChild(tdThumb);
    tr.appendChild(tdName);
    tr.appendChild(tdTitle);
    tr.appendChild(tdSource);
    tr.appendChild(tdStatus);
    tr.appendChild(tdProductUrl);
    tr.appendChild(tdEbayUrl);
    tr.appendChild(tdPortfolio);
    tr.appendChild(tdHidden);
    tr.appendChild(tdSize);
    tr.appendChild(tdMtime);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });
  updateHeaderArrows();
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
    th.addEventListener("click", () => {
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
    const data = await resp.json();
    fileListData = fileListData.concat(data);
    fileListOffset += data.length;
    if(data.length < fileListLimit) fileListEnd = true;
    sortFileData();
    renderFileList();
    updateImageLimitInfo(fileListData);
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

document.addEventListener("click", async ev => {
  if(!ev.target.classList.contains("img-status-cell")) return;
  const cell = ev.target;
  const row = cell.closest("tr");
  const fileName = row.dataset.fileName;
  const current = cell.textContent.trim();
  const sel = document.createElement("select");
  [
    "Generated",
    "Upscaled",
    "Background Removed",
    "Border Added",
    "Printify Step",
    "Printify API Updates",
    "Ebay Shipping Updated",
    "Done"
  ].forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if(v === current) o.selected = true;
    sel.appendChild(o);
  });
  cell.textContent = "";
  cell.appendChild(sel);
  sel.focus();
  sel.addEventListener("change", async () => {
    await fetch("/api/upload/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fileName, status: sel.value })
    });
    await loadFileList();
  });
  sel.addEventListener("blur", async () => {
    await loadFileList();
  });
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
    newEl.addEventListener("change", async ()=>{
      await saveCb(newEl.value);
    });
    newEl.addEventListener("blur", ()=>{
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
    btn.addEventListener("click", async () => {
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
const sidebarViewPrintifyProducts = document.getElementById("sidebarViewPrintifyProducts");
const fileTreeContainer = document.getElementById("fileTreeContainer");
const fileCabinetContainer = document.getElementById("fileCabinetContainer");

function showTasksPanel(){
  sidebarViewTasks.style.display = "";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  $("#navTasksBtn").classList.add("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navArchiveTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "tasks");
}

function showUploaderPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  sidebarViewPrintifyProducts.style.display = "none";
  $("#navUploaderBtn").classList.add("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navArchiveTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "uploader");
}

function showFileTreePanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "";
  sidebarViewFileCabinet.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.add("active");
  $("#navFileCabinetBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navArchiveTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "fileTree");
  loadFileTree();
}

function showFileCabinetPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewFileCabinet.style.display = "";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navFileCabinetBtn").classList.add("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navArchiveTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "fileCabinet");
  loadFileCabinet();
}

function showChatTabsPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  sidebarViewPrintifyProducts.style.display = "none";
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.add("active");
  $("#navArchiveTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "chatTabs");
  renderSidebarTabs();
}

function showArchiveTabsPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewArchiveTabs.style.display = "";
  sidebarViewPrintifyProducts.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navArchiveTabsBtn").classList.add("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "archiveTabs");
  loadTabs().then(renderArchivedSidebarTabs);
}

function showActivityIframePanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "";
  sidebarViewPrintifyProducts.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navArchiveTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.add("active");
  setSetting("last_sidebar_view", "activity");
}

function showPrintifyProductsPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewArchiveTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  sidebarViewPrintifyProducts.style.display = "";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navArchiveTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  $("#navPrintifyProductsBtn").classList.add("active");
  setSetting("last_sidebar_view", "printify");
  printifyPage = 1;
  loadPrintifyProducts();
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

    expander.addEventListener("click", () => {
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

    cb.addEventListener("change", async () => {
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
const btnUploader = document.getElementById("navUploaderBtn");
const btnChatTabs = document.getElementById("navChatTabsBtn");
const btnArchiveTabs = document.getElementById("navArchiveTabsBtn");
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
const btnNexumChat = document.getElementById("navNexumChatBtn");
const btnNexumTabs = document.getElementById("navNexumTabsBtn");
// Icon buttons for collapsed sidebar
const btnTasksIcon = document.getElementById("navTasksIcon");
const btnUploaderIcon = document.getElementById("navUploaderIcon");
const btnChatTabsIcon = document.getElementById("navChatTabsIcon");
const btnArchiveTabsIcon = document.getElementById("navArchiveTabsIcon");
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
const thinChatIcon = document.getElementById("thinIconChats");
const thinImagesIcon = document.getElementById("thinIconImages");
const thinArchiveIcon = document.getElementById("thinIconArchived");
const thinCabinetIcon = document.getElementById("thinIconCabinet");
const thinPrintifyIcon = document.getElementById("thinIconPrintify");

btnTasks.addEventListener("click", showTasksPanel);
btnUploader.addEventListener("click", showUploaderPanel);
navFileTreeBtn.addEventListener("click", showFileTreePanel);
btnChatTabs.addEventListener("click", showChatTabsPanel);
btnArchiveTabs.addEventListener("click", showArchiveTabsPanel);
btnActivityIframe.addEventListener("click", showActivityIframePanel);
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
  if(!sidebarVisible) await toggleSidebar();
  fn();
}
btnTasksIcon?.addEventListener("click", () => openPanelWithSidebar(showTasksPanel));
btnUploaderIcon?.addEventListener("click", () => openPanelWithSidebar(showUploaderPanel));
btnChatTabsIcon?.addEventListener("click", () => openPanelWithSidebar(showChatTabsPanel));
btnArchiveTabsIcon?.addEventListener("click", () => openPanelWithSidebar(showArchiveTabsPanel));
btnFileTreeIcon?.addEventListener("click", () => openPanelWithSidebar(showFileTreePanel));
btnFileCabinetIcon?.addEventListener("click", () => openPanelWithSidebar(showFileCabinetPanel));
btnActivityIframeIcon?.addEventListener("click", () => openPanelWithSidebar(showActivityIframePanel));
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
// Thin sidebar icon actions
thinChatIcon?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showChatTabsPanel);
});
thinImagesIcon?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showUploaderPanel);
});
thinArchiveIcon?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showArchiveTabsPanel);
});
thinCabinetIcon?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showFileCabinetPanel);
});
thinPrintifyIcon?.addEventListener("click", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showPrintifyProductsPanel);
});
// Ensure taps on mobile trigger the same actions
thinChatIcon?.addEventListener("touchstart", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showChatTabsPanel);
});
thinImagesIcon?.addEventListener("touchstart", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showUploaderPanel);
});
thinArchiveIcon?.addEventListener("touchstart", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showArchiveTabsPanel);
});
thinCabinetIcon?.addEventListener("touchstart", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showFileCabinetPanel);
});
thinPrintifyIcon?.addEventListener("touchstart", ev => {
  ev.preventDefault();
  ev.stopPropagation();
  openPanelWithSidebar(showPrintifyProductsPanel);
});

(async function init(){
  const placeholderEl = document.getElementById("chatPlaceholder");
  if(placeholderEl) placeholderEl.style.display = "";
  await loadSettings();
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

  console.log("[OBTAINED PROVIDER] => (global model removed in UI, fallback only)");
  const { provider: autoProvider } = parseProviderModel(modelName);
  console.log("[OBTAINED PROVIDER] =>", autoProvider);
  updateModelHud();

  await loadTabs();
  await loadSubroutines();
  renderSubroutines();

  if(chatTabs.length === 0){
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
  {
    const firstTab = chatTabs.find(t => t.id === currentTabId);
    currentTabType = firstTab ? firstTab.tab_type || 'chat' : 'chat';
    tabGenerateImages = currentTabType === 'design';
    const chk = document.getElementById("tabGenerateImagesCheck");
    if(chk){
      chk.checked = tabGenerateImages;
      chk.disabled = currentTabType !== 'design';
    }
  }
  renderTabs();
  renderSidebarTabs();
  renderArchivedSidebarTabs();
  if(chatTabs.length>0){
    await loadChatHistory(currentTabId, true);
    const ct = chatTabs.find(t => t.id === currentTabId);
    if(ct && ct.tab_uuid){
      window.history.replaceState({}, '', `/chat/${ct.tab_uuid}`);
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
        chatHideMetadata = false;
        await setSetting("chat_hide_metadata", chatHideMetadata);
      }
    } else {
      chatHideMetadata = false;
      await setSetting("chat_hide_metadata", chatHideMetadata);
    }
  } catch(e) {
    console.error("Error loading chat_hide_metadata:", e);
    chatHideMetadata = false;
    await setSetting("chat_hide_metadata", chatHideMetadata);
  }

  // Always hide token counts for now
  showSubbubbleToken = false;

  await loadFileList();
  setupFileSorting();
  const uploaderContainer = document.getElementById("sidebarViewUploader");
  if(uploaderContainer){
    uploaderContainer.addEventListener("scroll", async () => {
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
  $("#showMarkdownTasksCheck").checked = markdownPanelVisible;
  $("#showDependenciesColumnCheck").checked = showDependenciesColumn;
  $("#showSubroutinePanelCheck").checked = subroutinePanelVisible;
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
  if(!lastView) lastView = "uploader";
  switch(lastView){
    case "tasks": showTasksPanel(); break;
    case "uploader": showUploaderPanel(); break;
    case "fileTree": showFileTreePanel(); break;
    case "fileCabinet": showFileCabinetPanel(); break;
    case "chatTabs": showChatTabsPanel(); break;
    case "archiveTabs": showArchiveTabsPanel(); break;
    case "activity": showActivityIframePanel(); break;
    case "printify": showPrintifyProductsPanel(); break;
    default: showUploaderPanel(); break;
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
      $("#markdownInput").value = mdData.content || "";
    }
  } catch(e) {
    console.error("Error loading markdown content:", e);
  }
})();

function initChatScrollLoading(){
  const chatMessagesEl = document.getElementById("chatMessages");
  if(!chatMessagesEl) return;

  chatMessagesEl.addEventListener("scroll", async ()=>{
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

async function loadChatHistory(tabId = 1, reset=false) {
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
  if(reset && placeholderEl) placeholderEl.style.display = "";
  let pairs = [];
  try {
    console.debug(`[ChatHistory Debug] Fetching /api/chat/history?tabId=${tabId}&limit=10&offset=${chatHistoryOffset}`);
    const resp = await fetch(`/api/chat/history?tabId=${tabId}&limit=10&offset=${chatHistoryOffset}&sessionId=${encodeURIComponent(sessionId)}`);
    console.debug(`[ChatHistory Debug] Response status: ${resp.status}`);
    if(!resp.ok){
      console.error("Error loading chat history from server");
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
      for (const p of pairs) {
        addChatMessage(
            p.id, p.user_text, p.timestamp,
            p.ai_text, p.ai_timestamp,
            p.model, p.system_context, p.project_context, null, p.token_info,
            p.image_url, p.image_alt, p.image_title
        );
      }
      if(pairs.length>0 && placeholderEl) placeholderEl.style.display = "none";
      scrollChatToBottom();
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
              <span style="opacity:0.8;">${formatTimestamp(p.timestamp)}</span>
            `;
            const uDel = document.createElement("button");
            uDel.className = "delete-chat-btn bubble-delete-btn";
            uDel.textContent = "🗑";
            uDel.title = "Delete user message";
            uDel.addEventListener("click", async () => {
              if(!confirm("Delete this user message?")) return;
              const r = await fetch(`/api/chat/pair/${p.id}/user`, { method:"DELETE" });
              if(r.ok) userDiv.remove();
            });
            const uCopy = document.createElement("button");
            uCopy.className = "bubble-copy-btn";
            uCopy.textContent = "\u2398"; // copy icon
            uCopy.title = "Copy message";
            uCopy.addEventListener("click", () => {
              navigator.clipboard.writeText(stripPlaceholderImageLines(p.user_text) || "");
              showToast("Copied to clipboard");
            });
            userHead.appendChild(uCopy);
            userHead.appendChild(uDel);
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
        const titleAttr = p.image_url ? "" : ` title="${provider} / ${shortModel}"`;
        botHead.innerHTML = `
          <div class="name-oval name-oval-ai"${titleAttr}>${window.agentName}</div>
          <span style="opacity:0.8;">${p.ai_timestamp ? formatTimestamp(p.ai_timestamp) : "…"}</span>
        `;
        const aDel = document.createElement("button");
        aDel.className = "delete-chat-btn bubble-delete-btn";
        aDel.textContent = "🗑";
        aDel.title = "Delete AI reply";
        aDel.addEventListener("click", async () => {
          if(!confirm("Delete this AI reply?")) return;
          const r = await fetch(`/api/chat/pair/${p.id}/ai`, { method:"DELETE" });
          if(r.ok) botDiv.remove();
        });
        const aCopy = document.createElement("button");
        aCopy.className = "bubble-copy-btn";
        aCopy.textContent = "\u2398";
        aCopy.title = "Copy message";
        aCopy.addEventListener("click", () => {
          navigator.clipboard.writeText(stripPlaceholderImageLines(p.ai_text) || "");
          showToast("Copied to clipboard");
        });
        botHead.appendChild(aCopy);
        botHead.appendChild(aDel);
        botDiv.appendChild(botHead);

        if(p.image_url){
          const img = document.createElement("img");
          img.src = p.image_url;
          img.alt = p.image_alt || "";
          if(p.image_title) img.title = p.image_title;
          img.style.maxWidth = "min(100%, 400px)";
          img.style.height = "auto";
          img.addEventListener('load', () => setTimeout(scrollChatToBottom, 1000));
          botDiv.appendChild(img);
        }

        const botBody = document.createElement("div");
        botBody.innerHTML = formatCodeBlocks(stripPlaceholderImageLines(p.ai_text || ""));
        addCodeCopyButtons(botBody);
        botDiv.appendChild(botBody);
        addFilesFromCodeBlocks(p.ai_text || "");


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

        if(p.model){
          // Show model name and response time at bottom-left of AI bubble
          const modelDiv = document.createElement("div");
          modelDiv.className = "model-indicator";
          let displayText = `${shortModel}`;
          if(p.token_info){
            try {
              const tInfo = JSON.parse(p.token_info);
              if(tInfo && typeof tInfo.responseTime !== 'undefined'){
                const respTime = (tInfo.responseTime * 10).toFixed(2);
                displayText += ` (${respTime}s)`;
              }
            } catch(e){}
          }
          modelDiv.textContent = displayText;
          botDiv.appendChild(modelDiv);
        }

        seqDiv.appendChild(botDiv);
        const pairDel = document.createElement("button");
        pairDel.className = "delete-chat-btn pair-delete-btn";
        pairDel.textContent = "🗑";
        pairDel.title = "Delete this chat pair";
        pairDel.addEventListener("click", async () => {
          if(!confirm("Are you sure you want to delete this pair?")) return;
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

function addChatMessage(pairId, userText, userTs, aiText, aiTs, model, systemContext, projectContext, fullHistory, tokenInfo, imageUrl=null, imageAlt='', imageTitle='') {
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
      userHead.innerHTML = `
        <div class="name-oval name-oval-user">${userLabel}</div>
        <span style="opacity:0.8;">${formatTimestamp(userTs)}</span>
      `;
      const userDelBtn = document.createElement("button");
      userDelBtn.className = "delete-chat-btn bubble-delete-btn";
      userDelBtn.textContent = "🗑";
      userDelBtn.title = "Delete user message";
      userDelBtn.addEventListener("click", async () => {
        if (!confirm("Delete this user message?")) return;
        const resp = await fetch(`/api/chat/pair/${pairId}/user`, { method: "DELETE" });
        if (resp.ok) {
          userDiv.remove();
        } else {
          alert("Failed to delete user message.");
        }
      });
      const userCopyBtn = document.createElement("button");
      userCopyBtn.className = "bubble-copy-btn";
      userCopyBtn.textContent = "\u2398";
      userCopyBtn.title = "Copy message";
      userCopyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(stripPlaceholderImageLines(userText) || "");
        showToast("Copied to clipboard");
      });
      const userEditBtn = document.createElement("button");
      userEditBtn.className = "bubble-edit-btn";
      userEditBtn.textContent = "✎";
      userEditBtn.title = "Edit user message";
      userEditBtn.addEventListener("click", () => {
        openEditMessageModal(pairId, "user", userText, newText => {
          userText = newText;
          userBody.textContent = newText;
        });
      });
      userHead.appendChild(userCopyBtn);
      userHead.appendChild(userEditBtn);
      userHead.appendChild(userDelBtn);
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
  const titleAttr = imageUrl ? "" : ` title="${provider} / ${shortModel}"`;
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai"${titleAttr}>${window.agentName}</div>
    <span style="opacity:0.8;">${aiTs ? formatTimestamp(aiTs) : "…"}</span>
  `;
  const aiDelBtn = document.createElement("button");
  aiDelBtn.className = "delete-chat-btn bubble-delete-btn";
  aiDelBtn.textContent = "🗑";
  aiDelBtn.title = "Delete AI reply";
  aiDelBtn.addEventListener("click", async () => {
    if (!confirm("Delete this AI reply?")) return;
    const resp = await fetch(`/api/chat/pair/${pairId}/ai`, { method: "DELETE" });
    if (resp.ok) {
      botDiv.remove();
    } else {
      alert("Failed to delete AI reply.");
    }
  });
  const aiCopyBtn = document.createElement("button");
  aiCopyBtn.className = "bubble-copy-btn";
  aiCopyBtn.textContent = "\u2398";
  aiCopyBtn.title = "Copy message";
  aiCopyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(stripPlaceholderImageLines(aiText) || "");
    showToast("Copied to clipboard");
  });
  const aiEditBtn = document.createElement("button");
  aiEditBtn.className = "bubble-edit-btn";
  aiEditBtn.textContent = "✎";
  aiEditBtn.title = "Edit AI reply";
  aiEditBtn.addEventListener("click", () => {
    openEditMessageModal(pairId, "ai", aiText, newText => {
      aiText = newText;
      botBody.textContent = stripPlaceholderImageLines(newText);
    });
  });
  botHead.appendChild(aiCopyBtn);
  botHead.appendChild(aiEditBtn);
  botHead.appendChild(aiDelBtn);
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
  botBody.innerHTML = formatCodeBlocks(stripPlaceholderImageLines(aiText || ""));
  addCodeCopyButtons(botBody);
  botDiv.appendChild(botBody);
  addFilesFromCodeBlocks(aiText || "");

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

  if(model){
    // Show model name and response time at bottom-left of AI bubble
    const modelDiv = document.createElement("div");
    modelDiv.className = "model-indicator";
    let displayText = `${shortModel}`;
    if(tokenInfo){
      try {
        const tInfo = JSON.parse(tokenInfo);
        if(tInfo && typeof tInfo.responseTime !== 'undefined'){
          const respTime = (tInfo.responseTime * 10).toFixed(2);
          displayText += ` (${respTime}s)`;
        }
      } catch(e){}
    }
    modelDiv.textContent = displayText;
    botDiv.appendChild(modelDiv);
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
      prSum.textContent = `Project Context`;
      prDetails.appendChild(prSum);

      const prLines = projectContext.split(/\r?\n/);
      prLines.forEach(line => {
        if (!line.trim()) return;
        const lineBubble = document.createElement("div");
        lineBubble.className = "chat-bot";
        lineBubble.style.marginTop = "4px";
        lineBubble.textContent = line;
        prDetails.appendChild(lineBubble);
      });
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
  pairDelBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete this pair?")) return;
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
    newModelTabBtn.addEventListener("click", openAddModelModal);
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
    serviceSelect.addEventListener("change", async (evt)=>{
      tab.service = evt.target.value;
      await saveModelTabs();
    });
    b.appendChild(serviceSelect);

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑";
    delBtn.className = "model-delete-btn";
    delBtn.title = "Delete";
    delBtn.addEventListener("click", e => { e.stopPropagation(); deleteModelTab(tab.id); });
    b.appendChild(delBtn);

    // Click => select this tab
    b.addEventListener("click", (ev)=>{
      if(ev.target===serviceSelect) return;
      selectModelTab(tab.id);
    });

    // Right-click => rename or delete
    b.addEventListener("contextmenu", e=>{
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
  toggleModelTabsBtn.addEventListener("click", async () => {
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
  if(btn) btn.addEventListener("click", () => {
    showModal($("#changeBranchModal"));
  });
}

// Cancel button for branch
{
  const cancelBtn = document.getElementById("sterlingBranchCancelBtn");
  if(cancelBtn) cancelBtn.addEventListener("click", () => {
    hideModal($("#changeBranchModal"));
  });
}

// Save button for branch
const saveBtnSterling = document.getElementById("sterlingBranchSaveBtn");
if(saveBtnSterling) saveBtnSterling.addEventListener("click", async () => {
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
// Added click events for the “Markdown Menu” gear icon
// ----------------------------------------------------------------------
document.getElementById("markdownGearIcon").addEventListener("click", async () => {
  try {
    const r = await fetch("/api/settings/taskList_git_ssh_url");
    if(r.ok){
      const { value } = await r.json();
      document.getElementById("mdMenuRepoInput").value = value || "";
    }
    const rp = await fetch("/api/tasklist/repo-path");
    if(rp.ok){
      const { path } = await rp.json();
      document.getElementById("mdMenuRepoPath").textContent = path ? `Local repo: ${path}` : "Repo not cloned";
    } else {
      document.getElementById("mdMenuRepoPath").textContent = "Repo not cloned";
    }
  } catch(e){
    console.error("Error loading taskList_git_ssh_url:", e);
  }
  showModal(document.getElementById("mdMenuModal"));
});
document.getElementById("mdMenuSaveBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({key: "taskList_git_ssh_url", value: document.getElementById("mdMenuRepoInput").value})
    });
  } catch(e){
    console.error("Error saving taskList_git_ssh_url:", e);
  }
  hideModal(document.getElementById("mdMenuModal"));
});
document.getElementById("mdMenuUpdateBtn").addEventListener("click", async () => {
  try {
    const content = document.getElementById("markdownInput").value;
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
document.getElementById("mdMenuCloseBtn").addEventListener("click", () => {
  hideModal(document.getElementById("mdMenuModal"));
});

// ----------------------------------------------------------------------
// New Task List Configuration modal
// ----------------------------------------------------------------------
document.getElementById("gearBtn").addEventListener("click", () => {
  showModal(document.getElementById("taskListConfigModal"));
});
document.getElementById("taskListConfigCloseBtn").addEventListener("click", () => {
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
    const resp = await fetch("/api/ai/models");
    if(resp.ok){
      const data = await resp.json();
      const sel = document.getElementById("globalAiModelSelect");
      const reasoningSel = document.getElementById("globalAiReasoningModelSelect");
      const visionSel = document.getElementById("globalAiVisionModelSelect");
      sel.innerHTML = "";
      reasoningSel.innerHTML = "";
      if(visionSel) visionSel.innerHTML = "";
      const favs = (data.models || []).filter(m => m.favorite);
      if(favs.length === 0){
        sel.appendChild(new Option("(no favorites)", ""));
        reasoningSel.appendChild(new Option("(no favorites)", ""));
        if(visionSel) visionSel.appendChild(new Option("(no favorites)", ""));
      } else {
        const showPrices = accountInfo && accountInfo.id === 1;
        favs.forEach(m => {
          const label = showPrices
              ? `${m.id} (limit ${m.tokenLimit}, in ${m.inputCost}, out ${m.outputCost})`
              : `${m.id} (limit ${m.tokenLimit})`;
          sel.appendChild(new Option(label, m.id));
          reasoningSel.appendChild(new Option(label, m.id));
          if(visionSel) visionSel.appendChild(new Option(label, m.id));
        });
      }
      const curModel = await getSetting("ai_model");
      if(curModel) sel.value = curModel;
      if(reasoningModel) reasoningSel.value = reasoningModel;
      if(visionModel && visionSel) visionSel.value = visionModel;
    }
    if(searchModel){
      document.getElementById("globalAiSearchModelSelect").value = searchModel;
    }
    const visionSelFinal = document.getElementById("globalAiVisionModelSelect");
    if(visionModel && visionSelFinal && !visionSelFinal.value){
      visionSelFinal.value = visionModel;
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
  const model = document.getElementById("globalAiModelSelect").value;
  const searchModel = document.getElementById("globalAiSearchModelSelect").value;
  const reasoningModel = document.getElementById("globalAiReasoningModelSelect").value;
  const visionModel = document.getElementById("globalAiVisionModelSelect").value;
  await setSettings({ ai_service: svc, ai_model: model, ai_search_model: searchModel, ai_reasoning_model: reasoningModel, ai_vision_model: visionModel });
  // keep local cache in sync so toggles use latest values immediately
  settingsCache.ai_service = svc;
  settingsCache.ai_model = model;
  settingsCache.ai_search_model = searchModel;
  settingsCache.ai_reasoning_model = reasoningModel;
  settingsCache.ai_vision_model = visionModel;
  modelName = model || "unknown";
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
          star.addEventListener("click", async () => {
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
document.getElementById("saveMdBtn").addEventListener("click", async () => {
  try {
    const content = $("#markdownInput").value;
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

// Allow pasting images directly into the chat input
chatInputEl.addEventListener("paste", (ev) => {
  if(!imageUploadEnabled) return;
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
    rmBtn.addEventListener("click", () => {
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
  imgCopyBtn.addEventListener("click", () => {
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
  img.addEventListener('load', () => setTimeout(scrollChatToBottom, 1000));
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
    const payload = { prompt, tabId: currentTabId, provider: imageGenService, sessionId };
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
      if(chatSendBtnEl) chatSendBtnEl.disabled = false;
      processNextQueueMessage();
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
    if(chatSendBtnEl) chatSendBtnEl.disabled = false;
    processNextQueueMessage();
    const data = await r.json();
    if(r.ok && data.url){
      await loadChatHistory(currentTabId, true);
      updateImageLimitInfo();
      if(sidebarViewUploader && sidebarViewUploader.style.display !== "none"){
        await loadFileList();
      }
      if(imageLoopEnabled && accountInfo && accountInfo.id === 1){
        setTimeout(runImageLoop, 0);
      }
    } else {
      console.error('[Hook generateImage] API error:', data.error);
    }
  } catch(err){
    hideImageGenerationIndicator();
    isImageGenerating = false;
    lastImagePrompt = null;
    if(chatSendBtnEl) chatSendBtnEl.disabled = false;
    processNextQueueMessage();
    console.error('[Hook generateImage] failed:', err);
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
      const r = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: alt, tabId: currentTabId, provider: imageGenService, sessionId })
      });
      const data = await r.json();
      if(r.ok && data.url){
        const imgTag = `<img src="${data.url}" alt="${alt}" style="max-width:100%;height:auto;">`;
        html = html.replace(placeholder, imgTag);
        updateImageLimitInfo();
      }
    } catch(err){
      console.error('[Hook embedMockImages] failed:', err);
    }
  }
  lastBotText.innerHTML = html;
  scrollChatToBottom();
});

document.getElementById("searchToggleBtn")?.addEventListener("click", toggleSearch);
document.getElementById("reasoningToggleBtn")?.addEventListener("click", toggleReasoning);
document.getElementById("codexToggleBtn")?.addEventListener("click", toggleCodexMini);

console.log("[Server Debug] main.js fully loaded. End of script.");
setTimeout(() => {
  navMenuLoading = false;
  toggleNavMenuVisibility(navMenuVisible);
}, 2000);
