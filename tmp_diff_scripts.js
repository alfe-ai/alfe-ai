
    const structuredDiffData = document.getElementById('structured-diff-data');
    const rawDiffData = document.getElementById('raw-diff-data');
    let structuredDiff = [];
    let rawDiffText = '';

    try {
        structuredDiff = JSON.parse(structuredDiffData?.textContent || '[]');
    } catch (err) {
        console.error('Failed to parse structured diff payload', err);
        structuredDiff = [];
    }

    if (!Array.isArray(structuredDiff)) {
        structuredDiff = [];
    }

    try {
        rawDiffText = JSON.parse(rawDiffData?.textContent || '""');
    } catch (err) {
        console.error('Failed to parse raw diff payload', err);
        rawDiffText = '';
    }

    if (typeof rawDiffText !== 'string') {
        rawDiffText = '';
    }

    structuredDiffData?.remove();
    // Open this file in the editor (opens new tab)
    const openEditorForFile = (filePath) => {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const repoDir = params.get('repo_directory') || (typeof projectDir !== 'undefined' ? (projectDir || '') : '');
            const repoName = '<%= gitRepoNameCLI %>';
            const chatNumber = '<%= chatNumber %>';
            const currentUrl = new URL(window.location.href);
            const pathname = currentUrl.pathname || '';
            const repoMarker = `/${repoName}/diff`;
            let newPathname = null;
            const idx = pathname.indexOf(repoMarker);
            if (idx !== -1) {
                // preserve any base prefix before /<repoName>/diff
                const prefix = pathname.slice(0, idx);
                newPathname = prefix + `/${repoName}/chat/${chatNumber}/editor`;
            } else {
                // fallback: if repoName appears, use prefix up to repoName
                const repoIdx = pathname.indexOf(`/${repoName}`);
                if (repoIdx !== -1) {
                    const prefix = pathname.slice(0, repoIdx);
                    newPathname = prefix + `/${repoName}/chat/${chatNumber}/editor`;
                } else {
                    // final fallback to root-based path
                    newPathname = `/${repoName}/chat/${chatNumber}/editor`;
                }
            }
            const editorBaseRaw = '<%= editorBaseUrl || "" %>';
            const editorBase = editorBaseRaw && editorBaseRaw !== 'undefined' ? editorBaseRaw : '';
            const url = new URL(newPathname, editorBase || currentUrl.origin);
            // preserve existing query params from current URL
            const newParams = new URLSearchParams(currentUrl.search);
            if (repoDir) newParams.set('repo_directory', repoDir);
            newParams.set('open_file', filePath);
            url.search = newParams.toString();
            window.open(url.toString(), '_blank', 'noopener');
        } catch (e) {
            try {
                const editorBaseRaw = '<%= editorBaseUrl || "" %>';
                const editorBase = editorBaseRaw && editorBaseRaw !== 'undefined' ? editorBaseRaw : '';
                const fallbackPath = '/<%= gitRepoNameCLI %>/chat/<%= chatNumber %>/editor?open_file=' + encodeURIComponent(filePath);
                const fallbackUrl = editorBase ? (editorBase.replace(/\\/$/, '') + fallbackPath) : fallbackPath;
                window.open(fallbackUrl, '_blank', 'noopener');
            } catch (_) {
                console.error('Failed to open editor', _);
            }
        }
    };




    rawDiffData?.remove();

    const normalizeRows = (file) => {
        if (file.isBinary) {
            return [{ leftNo: '', rightNo: '', left: file.binaryMessage || 'Binary file', right: file.binaryMessage || 'Binary file', type: 'meta' }];
        }
        const rows = [];
        (file.hunks || []).forEach((hunk) => {
            rows.push({ leftNo: '', rightNo: '', left: hunk.header || '', right: hunk.header || '', type: 'meta' });
            (hunk.rows || []).forEach((row) => {
                if (row.type === 'add') {
                    rows.push({ leftNo: row.leftNumber || '', rightNo: row.rightNumber || '', left: '', right: row.rightContent || '', type: 'added' });
                } else if (row.type === 'remove') {
                    rows.push({ leftNo: row.leftNumber || '', rightNo: row.rightNumber || '', left: row.leftContent || '', right: '', type: 'removed' });
                } else if (row.type === 'modify') {
                    rows.push({ leftNo: row.leftNumber || '', rightNo: row.rightNumber || '', left: row.leftContent || '', right: row.rightContent || '', type: 'changed' });
                } else if (row.type === 'meta') {
                    rows.push({ leftNo: '', rightNo: '', left: row.metaContent || '', right: row.metaContent || '', type: 'meta' });
                } else {
                    rows.push({ leftNo: row.leftNumber || row.rightNumber || '', rightNo: row.rightNumber || row.leftNumber || '', left: row.leftContent || '', right: row.rightContent || '', type: 'unchanged' });
                }
            });
        });
        return rows;
    };

    const computeFileStats = (rows) => {
        const stats = { additions: 0, deletions: 0 };
        if (!Array.isArray(rows)) {
            return stats;
        }
        rows.forEach((row) => {
            if (!row || typeof row.type !== 'string') {
                return;
            }
            if (row.type === 'added' || row.type === 'changed') {
                stats.additions += 1;
            }
            if (row.type === 'removed' || row.type === 'changed') {
                stats.deletions += 1;
            }
        });
        return stats;
    };

    const files = structuredDiff.map((file) => {
        const rows = normalizeRows(file);
        return {
            label: file.newPath || file.oldPath || 'Untracked file',
            rows,
            stats: computeFileStats(rows),
        };
    });

    const diffEl = document.getElementById('diff');
    const diffInner = diffEl?.querySelector('.diff-inner');
    const fileListEl = document.getElementById('file-list');
    const fileLabelEl = document.getElementById('current-file-label');
    let focusedFileIndex = 0;

    const createDiffLine = (lineNumber, codeText, className) => {
        const line = document.createElement('div');
        line.className = `diff-line ${className}`.trim();

        const lineNum = document.createElement('span');
        lineNum.className = 'line-num';
        lineNum.textContent = (lineNumber ?? '').toString();

        const code = document.createElement('span');
        code.className = 'code';

        const signSpan = document.createElement('span');
        signSpan.className = 'line-sign';
        // Determine sign based on className
        const cls = (className || '').toString();
        if (cls.includes('added') || cls.includes('changed-right')) {
            signSpan.textContent = '+';
        } else if (cls.includes('removed') || cls.includes('changed-left')) {
            signSpan.textContent = '-';
        } else {
            signSpan.textContent = ' ';
        }

        const textNode = document.createTextNode(typeof codeText === 'string' ? codeText : (codeText ?? '').toString());
        code.appendChild(signSpan);
        code.appendChild(textNode);

        line.appendChild(lineNum);
        line.appendChild(code);
        return line;
    };

    const appendInlineDiffRows = (rows, container) => {
        if (!container) return;

        const flushChangedGroup = (group) => {
            if (!group.length) return;

            group.forEach((row) => {
                if (row.left || row.leftNo) {
                    container.appendChild(createDiffLine(row.leftNo, row.left, 'changed-left'));
                }
            });

            group.forEach((row) => {
                if (row.right || row.rightNo) {
                    container.appendChild(createDiffLine(row.rightNo, row.right, 'changed-right'));
                }
            });

            group.length = 0;
        };

        const changedGroup = [];

        (rows || []).forEach((row) => {
            if (!row || typeof row !== 'object') {
                return;
            }

            const appendLine = (lineNumber, text, className) => {
                container.appendChild(createDiffLine(lineNumber, text, className));
            };

            if (row.type === 'changed') {
                changedGroup.push(row);
                return;
            }

            flushChangedGroup(changedGroup);

            if (row.type === 'meta') {
                appendLine('', row.left || row.right || row.metaContent || '', 'meta');
                return;
            }

            if (row.type === 'added') {
                appendLine(row.rightNo, row.right, 'added');
                return;
            }

            if (row.type === 'removed') {
                appendLine(row.leftNo, row.left, 'removed');
                return;
            }

            appendLine(row.rightNo || row.leftNo, row.right || row.left || '', 'unchanged');
        });

        flushChangedGroup(changedGroup);
    };

    const normalizedRowCount = (value) => (Array.isArray(value) ? value.length : 0);

    const hasStructuredDiff = files.some((file) => normalizedRowCount(file.rows) > 0);

    const updateSummary = () => {
        const totalFiles = files.length;
        if (fileLabelEl) {
            if (totalFiles) {
                fileLabelEl.textContent = `${totalFiles} file${totalFiles === 1 ? '' : 's'} changed`;
            } else {
                fileLabelEl.textContent = 'Diff';
            }
        }
    };

    const renderStructuredSections = () => {
        if (!diffInner) return;
        diffInner.innerHTML = '';
        const fragment = document.createDocumentFragment();
        files.forEach((file, index) => {
            const section = document.createElement('article');
            section.className = 'diff-file-section';
            section.id = `diff-file-${index}`;
            section.tabIndex = -1;

            const header = document.createElement('header');
            header.className = 'diff-file-header';

            const title = document.createElement('span');
            title.className = 'diff-file-title';
            title.textContent = file.label;
            header.appendChild(title);

            // add edit-in-editor button
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'open-in-editor-button';
            editBtn.title = 'Open in editor';
            editBtn.setAttribute('aria-label', 'Open file in editor');
            editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 21v-3.75L14.81 5.44a1.5 1.5 0 012.12 0l1.63 1.63a1.5 1.5 0 010 2.12L6.75 21H3z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
            editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openEditorForFile(file.label); });
            header.appendChild(editBtn);


            const rowCount = normalizedRowCount(file.rows);
            section.appendChild(header);

            const viewer = document.createElement('div');
            viewer.className = 'diff-file-viewer diff-view stacked';

            const linesContainer = document.createElement('div');
            linesContainer.className = 'diff-lines';

            if (rowCount) {
                appendInlineDiffRows(file.rows, linesContainer);
            } else {
                linesContainer.appendChild(createDiffLine('', 'No diff available for this file.', 'meta'));
            }

            viewer.appendChild(linesContainer);
            section.appendChild(viewer);
            fragment.appendChild(section);
        });
        diffInner.appendChild(fragment);
    };


    const renderEmptyStructuredState = () => {
        if (!diffInner) return;
        diffInner.innerHTML = '<div class="empty-state">No structured diff available.</div>';
        if (fileLabelEl) fileLabelEl.textContent = rawDiffText ? 'No structured diff' : 'No diff available';
    };

    const focusFileSection = (index) => {
        const section = document.getElementById(`diff-file-${index}`);
        if (!section) return;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        section.focus({ preventScroll: true });
        focusedFileIndex = index;
        renderFileList();
    };

    const renderFileList = () => {
        if (!fileListEl) return;
        fileListEl.innerHTML = '';
        if (!files.length) {
            const empty = document.createElement('li');
            empty.textContent = 'No changed files.';
            fileListEl.appendChild(empty);
            return;
        }
        if (focusedFileIndex >= files.length) {
            focusedFileIndex = Math.max(0, files.length - 1);
        }
        files.forEach((file, index) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = index === focusedFileIndex ? 'active' : '';
            btn.setAttribute('aria-current', index === focusedFileIndex ? 'true' : 'false');

            const label = document.createElement('span');
            label.className = 'file-label';
            label.textContent = file.label;
            btn.appendChild(label);

            const stats = file.stats;
            if (stats && (stats.additions || stats.deletions)) {
                const statsEl = document.createElement('span');
                statsEl.className = 'file-stats';
                if (typeof stats.additions === 'number') {
                    const additionsEl = document.createElement('span');
                    additionsEl.className = 'additions';
                    additionsEl.textContent = `+${stats.additions}`;
                    statsEl.appendChild(additionsEl);
                }
                if (typeof stats.deletions === 'number') {
                    const deletionsEl = document.createElement('span');
                    deletionsEl.className = 'deletions';
                    deletionsEl.textContent = `-${stats.deletions}`;
                    statsEl.appendChild(deletionsEl);
                }
                btn.appendChild(statsEl);
            }

            btn.addEventListener('click', () => focusFileSection(index));
            li.appendChild(btn);
            fileListEl.appendChild(li);
        });
    };

    if (hasStructuredDiff) {
        renderStructuredSections();
        updateSummary();
    } else {
        renderEmptyStructuredState();
    }

    renderFileList();



    (function () {
        const comparisonCommitMessage = <%- JSON.stringify(comparisonCommitMessage || '') %>;
        const commitMessageEl = document.getElementById('comparisonCommitMessage');
        const toggleButton = document.getElementById('comparisonCommitToggle');

        if (!commitMessageEl || !toggleButton || typeof comparisonCommitMessage !== 'string') {
            return;
        }

        const lines = comparisonCommitMessage.split(/\r?\n/);
        const preview = lines.slice(0, 3).join('\n');
        const isTruncated = lines.length > 3;
        let expanded = false;

        const renderMessage = () => {
            commitMessageEl.textContent = expanded || !isTruncated ? comparisonCommitMessage : preview;
            toggleButton.textContent = expanded ? 'Show less' : 'Show more';
            toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            toggleButton.style.display = isTruncated ? 'inline-flex' : 'none';
        };

        toggleButton.addEventListener('click', () => {
            expanded = !expanded;
            renderMessage();
        });

        renderMessage();
    })();



    (function () {
        const MERGE_BUTTON_ID = "mergeButton";
        const MERGE_REQUEST_MESSAGE_TYPE = "STERLING_VIEW_DIFF_MODAL_MERGE_REQUEST";
        const mergeButton = document.getElementById(MERGE_BUTTON_ID);
        if (!mergeButton) {
            return;
        }
        mergeButton.addEventListener("click", () => {
            if (mergeButton.disabled) {
                return;
            }
            if (!window.parent || window.parent === window) {
                return;
            }
            try {
                window.parent.postMessage({ type: MERGE_REQUEST_MESSAGE_TYPE }, '*');
            } catch (_err) { /* ignore */ }
        });
    })();
