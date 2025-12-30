(function () {
    const config = window.EDITOR_CONFIG || {};

    const pathDisplay = document.getElementById("currentFilePath");
    const statusDisplay = document.getElementById("editorStatus");
    const saveButton = document.getElementById("saveFileButton");
    const textArea = document.getElementById("codeEditor");
    const tabsContainer = document.getElementById("editorTabs");

    if (!textArea || !saveButton) {
        console.error("[editor] Missing required editor elements");
        return;
    }

    textArea.setAttribute("spellcheck", "false");
    textArea.setAttribute("autocorrect", "off");
    textArea.setAttribute("autocapitalize", "off");
    textArea.setAttribute("autocomplete", "off");

    const usingCodeMirror = typeof window.CodeMirror === "function";
    let editor;
    if (usingCodeMirror) {
        editor = CodeMirror.fromTextArea(textArea, {
            lineNumbers: true,
            theme: "default",
            mode: "text/plain",
            tabSize: 2,
            indentUnit: 2,
            indentWithTabs: false,
            autofocus: true,
            spellcheck: false,
        });
        editor.setSize("100%", "100%");
    } else {
        console.warn("[editor] CodeMirror unavailable; falling back to plain textarea editor");
        textArea.classList.add("plain-text-editor");
        editor = {
            getValue: () => textArea.value,
            setValue: (value) => {
                textArea.value = value || "";
            },
            setOption: () => {},
            focus: () => {
                textArea.focus();
            },
            on: (event, handler) => {
                if (event === "change") {
                    textArea.addEventListener("input", handler);
                }
            },
        };
    }

    const modeForFile = (filePath) => {
        if (!filePath) return "text/plain";
        const lower = filePath.toLowerCase();

        if (/\.(jsx)$/.test(lower)) {
            return { name: "javascript", jsx: true };
        }
        if (/\.(tsx)$/.test(lower)) {
            return { name: "javascript", typescript: true, jsx: true };
        }
        if (/\.(ts)$/.test(lower)) {
            return { name: "javascript", typescript: true };
        }
        if (/\.(js|mjs|cjs)$/.test(lower)) {
            return "javascript";
        }
        if (/\.(json|jsonc)$/.test(lower)) {
            return { name: "javascript", json: true };
        }
        if (/\.(py)$/.test(lower)) {
            return "python";
        }
        if (/\.(sh|bash|zsh)$/.test(lower)) {
            return "shell";
        }
        if (/\.(html|htm)$/.test(lower)) {
            return "htmlmixed";
        }
        if (/\.(css)$/.test(lower)) {
            return "css";
        }
        if (/\.(scss)$/.test(lower)) {
            return "text/x-scss";
        }
        if (/\.(sass)$/.test(lower)) {
            return "text/x-sass";
        }
        if (/\.(less)$/.test(lower)) {
            return "text/x-less";
        }
        if (/\.(md|markdown|mdx)$/.test(lower)) {
            return "markdown";
        }
        if (/\.(yml|yaml)$/.test(lower)) {
            return "yaml";
        }
        if (/\.(xml|svg)$/.test(lower)) {
            return "xml";
        }
        if (/\.(sql)$/.test(lower)) {
            return "sql";
        }
        if (/\.(ini|cfg|conf|properties)$/.test(lower)) {
            return "properties";
        }
        if (/\.(toml)$/.test(lower)) {
            return "toml";
        }
        if (/\.(rb)$/.test(lower)) {
            return "ruby";
        }
        if (/\.(php)$/.test(lower)) {
            return "php";
        }
        if (/\.(go)$/.test(lower)) {
            return "go";
        }
        if (/\.(rs)$/.test(lower)) {
            return "rust";
        }
        if (/\.(java)$/.test(lower)) {
            return "text/x-java";
        }
        if (/\.(c|h)$/.test(lower)) {
            return "text/x-csrc";
        }
        if (/\.(cpp|cxx|cc|hpp|hh|hxx)$/.test(lower)) {
            return "text/x-c++src";
        }
        if (/\.(cs)$/.test(lower)) {
            return "text/x-csharp";
        }
        if (/\.(kt)$/.test(lower)) {
            return "text/x-kotlin";
        }
        if (/\.(scala)$/.test(lower)) {
            return "text/x-scala";
        }
        if (/\.(swift)$/.test(lower)) {
            return "text/x-swift";
        }
        return "text/plain";
    };

    const cssEscape = (value) => {
        if (typeof value !== "string") return value;
        if (window.CSS && typeof window.CSS.escape === "function") {
            return window.CSS.escape(value);
        }
        return value.replace(/["\\]/g, "\\$&");
    };

    const openTabs = new Map();
    let currentTabKey = null;
    let currentFilePath = null;
    let currentRepo = null;
    let suppressEditorChange = false;

    const makeTabKey = (repo, filePath) => `${repo}::${filePath}`;

    const getCurrentTab = () => {
        if (!currentTabKey) return null;
        return openTabs.get(currentTabKey) || null;
    };

    const hasUnsavedChanges = () => {
        const tab = getCurrentTab();
        return !!(tab && tab.isDirty);
    };

    const updateSaveButton = () => {
        if (!saveButton) return;
        saveButton.disabled = !hasUnsavedChanges();
    };

    const setStatus = (message, type = "info") => {
        if (!statusDisplay) return;
        statusDisplay.textContent = message || "";
        statusDisplay.classList.remove("success", "error");
        if (type === "success") {
            statusDisplay.classList.add("success");
        } else if (type === "error") {
            statusDisplay.classList.add("error");
        }
    };

    const updatePathDisplay = (tab) => {
        if (!pathDisplay) return;
        const projectDirEl = document.getElementById('currentProjectDir');
        if (!tab) {
            pathDisplay.textContent = "Select a file from the sidebar";
            pathDisplay.title = "";
            if (projectDirEl && window.EDITOR_CONFIG && window.EDITOR_CONFIG.projectDir) { projectDirEl.textContent = window.EDITOR_CONFIG.projectDir; }
            return;
        }
        // If we're on the /agent route, do not show the repo path in the sidebar
        const isAgentRoute = window.location && window.location.pathname && window.location.pathname.startsWith('/agent');
        const display = isAgentRoute ? `${tab.path}` : `${tab.repo}/${tab.path}`;
        pathDisplay.textContent = display;
        pathDisplay.title = display;
        if (projectDirEl && window.EDITOR_CONFIG && window.EDITOR_CONFIG.projectDir) { projectDirEl.textContent = window.EDITOR_CONFIG.projectDir; }
    };

    const highlightFileInTree = (repo, filePath) => {
        document.querySelectorAll(".file-item.selected-file").forEach((el) => {
            el.classList.remove("selected-file");
        });
        if (!repo || !filePath) {
            return;
        }
        const selector = `.file-item[data-repo="${cssEscape(repo)}"][data-path="${cssEscape(filePath)}"]`;
        const element = document.querySelector(selector);
        if (element) {
            element.classList.add("selected-file");
        }
    };

    const renderTabs = () => {
        if (!tabsContainer) return;
        tabsContainer.textContent = "";

        openTabs.forEach((tab, key) => {
            const tabEl = document.createElement("div");
            tabEl.className = "editor-tab";
            tabEl.dataset.key = key;

            if (key === currentTabKey) {
                tabEl.classList.add("active");
            }
            if (tab.isDirty) {
                tabEl.classList.add("dirty");
            }

            const label = document.createElement("span");
            label.className = "editor-tab-label";
            label.textContent = tab.label;
            label.title = `${tab.repo}/${tab.path}`;
            tabEl.appendChild(label);

            const closeButton = document.createElement("button");
            closeButton.type = "button";
            closeButton.className = "editor-tab-close";
            closeButton.setAttribute("aria-label", `Close ${tab.label}`);
            closeButton.innerHTML = "&times;";
            tabEl.appendChild(closeButton);

            tabsContainer.appendChild(tabEl);
        });
    };

    const setCurrentTab = (key, { emitStatus } = {}) => {
        const tab = openTabs.get(key);
        if (!tab) return;

        currentTabKey = key;
        currentFilePath = tab.path;
        currentRepo = tab.repo;

        suppressEditorChange = true;
        editor.setOption("mode", tab.mode || modeForFile(tab.path));
        editor.setValue(tab.content || "");
        editor.focus();
        suppressEditorChange = false;

        updatePathDisplay(tab);
        highlightFileInTree(tab.repo, tab.path);
        updateSaveButton();
        renderTabs();

        if (tab.isDirty) {
            setStatus("Unsaved changes", "info");
        } else if (emitStatus === true) {
            setStatus("File loaded", "success");
            setTimeout(() => {
                if (!hasUnsavedChanges()) {
                    setStatus("", "info");
                }
            }, 1500);
        } else if (emitStatus === false) {
            setStatus("", "info");
        }
    };

    const openFileFromServer = async (repo, filePath) => {
        if (!repo || !filePath) {
            return;
        }

        const key = makeTabKey(repo, filePath);
        setStatus("Loading file...", "info");
        saveButton.disabled = true;

        try {
            const response = await fetch(
                `${config.baseFileUrl}?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}`
            );
            if (!response.ok) {
                throw new Error(`Failed to load file (${response.status})`);
            }
            const payload = await response.json();
            if (payload.error) {
                throw new Error(payload.error);
            }

            const tabData = {
                key,
                repo,
                path: filePath,
                label: filePath.split("/").pop() || filePath,
                content: payload.content || "",
                mode: modeForFile(filePath),
                isDirty: false,
            };
            openTabs.set(key, tabData);
            setCurrentTab(key, { emitStatus: true });
        } catch (err) {
            console.error("[editor] loadFile error", err);
            setStatus("Failed to load file", "error");
            updateSaveButton();
        }
    };

    const activateTab = (key) => {
        if (key === currentTabKey) {
            return;
        }
        setCurrentTab(key, { emitStatus: false });
    };

    const closeTab = (key) => {
        const tab = openTabs.get(key);
        if (!tab) return;

        if (tab.isDirty && !confirm("You have unsaved changes. Close the tab without saving?")) {
            return;
        }

        openTabs.delete(key);

        if (key === currentTabKey) {
            const nextKey = Array.from(openTabs.keys()).pop();
            if (nextKey) {
                setCurrentTab(nextKey, { emitStatus: false });
            } else {
                currentTabKey = null;
                currentFilePath = null;
                currentRepo = null;
                suppressEditorChange = true;
                editor.setOption("mode", "text/plain");
                editor.setValue("");
                suppressEditorChange = false;
                updatePathDisplay(null);
                highlightFileInTree(null, null);
                saveButton.disabled = true;
                setStatus("Select a file to begin", "info");
    // Auto-open file if '?open_file=...' is present in the URL
    try {
        const sp = new URLSearchParams(window.location.search || '');
        const fileToOpen = sp.get('open_file') || sp.get('path') || sp.get('file');
        if (fileToOpen) {
            const decoded = decodeURIComponent(fileToOpen);
            const repo = config.repoName || '';
            if (repo) {
                setTimeout(() => {
                    const key = makeTabKey(repo, decoded);
                    if (openTabs.has(key)) {
                        activateTab(key);
                    } else {
                        openFileFromServer(repo, decoded);
                    }
                }, 60);
            }
        }
    } catch (e) { /* ignore */ }

            }
        }
        renderTabs();
        updateSaveButton();
    };

    const markDirty = () => {
        const tab = getCurrentTab();
        if (!tab) {
            return;
        }
        tab.content = editor.getValue();
        if (!tab.isDirty) {
            tab.isDirty = true;
            setStatus("Unsaved changes", "info");
        }
        updateSaveButton();
        renderTabs();
    };

    editor.on("change", () => {
        if (suppressEditorChange) {
            return;
        }
        markDirty();
    });

    const saveFile = async () => {
        const tab = getCurrentTab();
        if (!tab) {
            return;
        }

        tab.content = editor.getValue();
        setStatus("Saving...", "info");
        saveButton.disabled = true;

        try {
            const response = await fetch(config.baseFileUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    repo: tab.repo,
                    path: tab.path,
                    content: tab.content,
                }),
            });
            if (!response.ok) {
                throw new Error(`Failed to save file (${response.status})`);
            }
            const payload = await response.json();
            if (payload && payload.error) {
                throw new Error(payload.error);
            }
            tab.isDirty = false;
            updateSaveButton();
            renderTabs();
            setStatus("Saved", "success");
            setTimeout(() => {
                if (!hasUnsavedChanges()) {
                    setStatus("", "info");
                }
            }, 1500);
        } catch (err) {
            console.error("[editor] saveFile error", err);
            setStatus("Failed to save file", "error");
            updateSaveButton();
        }
    };

    if (saveButton) {
        saveButton.addEventListener("click", (evt) => {
            evt.preventDefault();
            saveFile();
        });
    }

    window.addEventListener("beforeunload", (event) => {
        if (hasUnsavedChanges()) {
            event.preventDefault();
            event.returnValue = "";
        }
    });

    if (tabsContainer) {
        tabsContainer.addEventListener("click", (event) => {
            const closeButton = event.target instanceof HTMLElement
                ? event.target.closest(".editor-tab-close")
                : null;
            const tabEl = event.target instanceof HTMLElement
                ? event.target.closest(".editor-tab")
                : null;
            if (!tabEl) {
                return;
            }
            const key = tabEl.dataset.key;
            if (!key) {
                return;
            }

            if (closeButton) {
                event.stopPropagation();
                closeTab(key);
                return;
            }

            if (key !== currentTabKey && hasUnsavedChanges()) {
                const proceed = confirm("You have unsaved changes. Switch tabs without saving?");
                if (!proceed) {
                    return;
                }
            }
            activateTab(key);
        });
    }

    document.querySelectorAll(".collapsible-header").forEach((header) => {
        header.addEventListener("click", () => {
            const section = header.closest(".collapsible-section");
            if (!section) return;
            if (section.classList.contains("collapsed")) {
                section.classList.remove("collapsed");
                section.classList.add("expanded");
            } else {
                section.classList.add("collapsed");
                section.classList.remove("expanded");
            }
        });
    });

    document.querySelectorAll(".directory-tree").forEach((tree) => {
        tree.addEventListener("click", (event) => {
            if (!(event.target instanceof HTMLElement)) {
                return;
            }

            const fileItem = event.target.closest(".file-item");
            if (fileItem && tree.contains(fileItem)) {
                const repo = fileItem.dataset.repo;
                const filePath = fileItem.dataset.path;
                const key = makeTabKey(repo, filePath);

                if (key !== currentTabKey && hasUnsavedChanges()) {
                    const proceed = confirm("You have unsaved changes. Switch files without saving?");
                    if (!proceed) {
                        return;
                    }
                }

                if (openTabs.has(key)) {
                    activateTab(key);
                } else {
                    openFileFromServer(repo, filePath);
                }
            } else if (event.target.classList.contains("tree-label")) {
                const folder = event.target.closest(".folder");
                if (folder) {
                    folder.classList.toggle("collapsed");
                    folder.classList.toggle("expanded");
                }
            }
        });
    });

    setStatus("Select a file to begin", "info");
})();


// Sidebar toggle and resizer (adds divider drag + toggle/expand buttons)
(function installDividerDragEditor(){
  const divider = document.getElementById('divider');
  const sidebar = document.querySelector('.editor-sidebar');
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  const expandBtn = document.getElementById('expandSidebarBtn');
  if(!divider || !sidebar) return;

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;
  let finalWidth = 0;

  divider.addEventListener('mousedown', e => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    finalWidth = startWidth;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if(!isDragging) return;
    const dx = e.clientX - startX;
    const newWidth = startWidth + dx;
    const minWidth = 140;
    if(newWidth >= minWidth) {
      sidebar.style.width = newWidth + 'px';
      finalWidth = newWidth;
    }
  });

  document.addEventListener('mouseup', () => {
    if(isDragging){
      // persist width to server if api available
      try{ fetch('/api/settings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ key: 'sidebar_width', value: finalWidth }) }); }catch(e){}
    }
    isDragging = false;
    document.body.style.userSelect = '';
  });

  function toggleSidebar(){
    const visible = sidebar.style.display !== 'none';
    if(visible){
      sidebar.style.display = 'none';
      divider.style.display = 'none';
      if(expandBtn) expandBtn.style.display = 'block';
      if(toggleBtn) toggleBtn.textContent = '☰';
    } else {
      sidebar.style.display = '';
      divider.style.display = '';
      if(expandBtn) expandBtn.style.display = 'none';
      if(toggleBtn) toggleBtn.textContent = '✕';
    }
    try{ fetch('/api/settings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ key: 'sidebar_visible', value: !visible }) }); }catch(e){}
  }

  toggleBtn?.addEventListener('click', () => { toggleSidebar(); });
  expandBtn?.addEventListener('click', () => { toggleSidebar(); });

  // load saved width / visibility
  (async function loadSaved(){
    try{
      const r = await fetch('/api/settings/sidebar_width');
      if(r.ok){ const data = await r.json(); if(typeof data.value !== 'undefined'){ sidebar.style.width = data.value + 'px'; }}
      const r2 = await fetch('/api/settings/sidebar_visible');
      if(r2.ok){ const d2 = await r2.json(); if(typeof d2.value !== 'undefined' && d2.value === false){ sidebar.style.display = 'none'; divider.style.display = 'none'; if(expandBtn) expandBtn.style.display = 'block'; if(toggleBtn) toggleBtn.textContent = '☰'; }}
    }catch(e){}
  })();
})();
