(() => {
    const data = window.__GIT_TREE_DATA__ || {};
    const commitGraph = Array.isArray(data.gitCommitGraph) ? data.gitCommitGraph : [];
    const branches = Array.isArray(data.gitBranches) ? data.gitBranches : [];
    const projectDir = typeof data.resolvedProjectDir === "string" ? data.resolvedProjectDir : "";

const repoName = typeof data.repoName === "string" ? data.repoName : "";

        const treeListEl = document.getElementById("gitTreeList");
    const branchListEl = document.getElementById("branchList");
    const commitInfoEl = document.getElementById("commitInfo");
    const changedFilesEl = document.getElementById("changedFilesList");
    const diffViewerEl = document.getElementById("diffViewer");
    const filterInput = document.getElementById("commitFilter");
    const gitPullButton = document.getElementById("gitPullButton");
    const gitPullStatus = document.getElementById("gitPullStatus");
    const initialLoader = document.getElementById("gitTreeInitialLoader");
    const loaderLogEl = document.getElementById("gitTreeLoaderLog");

    const loaderMessages = [
        "Initializing git tooling…",
        "Scanning repository metadata…",
        "Building commit graph…",
        "Collecting branch information…",
        "Preparing interface…",
    ];
    let loaderTimer = null;
    let loaderMessageIndex = 0;

    if (initialLoader && loaderLogEl) {
        loaderLogEl.textContent = loaderMessages[0];
        loaderTimer = window.setInterval(() => {
            loaderMessageIndex = Math.min(loaderMessageIndex + 1, loaderMessages.length - 1);
            loaderLogEl.textContent = loaderMessages[loaderMessageIndex];
            if (loaderMessageIndex === loaderMessages.length - 1) {
                window.clearInterval(loaderTimer);
                loaderTimer = null;
            }
        }, 1500);
    }

    if (!treeListEl) {
        hideInitialLoader();
        return;
    }

    const GRAPH_LINE_COLOR = "#94a3b8";
    const GRAPH_NODE_FILL = "#94a3b8";
    const GRAPH_LINE_WIDTH = 1.5;
    const GRAPH_NODE_RADIUS = 4.5;
    const GRAPH_MIN_NODE_RADIUS = 3.2;
    const GRAPH_MAX_WIDTH = 140;
    const GRAPH_MIN_LANE_WIDTH = 10;
    const GRAPH_MAX_LANE_WIDTH = 22;
    const GRAPH_VISIBLE_LANE_LIMIT = 7;

    const state = {
        rows: [],
        layout: buildLayout(commitGraph),
        selectedHash: "",
        filter: "",
        fileAnchors: new Map(),
    };

    const normaliseLookupKey = (value) => {
        if (!value) {
            return "";
        }

        return value
            .toString()
            .replace(/["']/g, "")
            .replace(/\s+/g, " ")
            .replace(/^\s+|\s+$/g, "")
            .replace(/^a\//, "")
            .replace(/^b\//, "")
            .replace(/\/+/g, "/")
            .toLowerCase();
    };

    const explodeVariants = (value) => {
        if (!value) {
            return [];
        }

        const raw = value.toString();
        const variants = [raw];

        if (raw.includes("=>")) {
            raw.split("=>").forEach((segment) => {
                const cleaned = segment.replace(/["']/g, "").trim();
                if (cleaned) {
                    variants.push(cleaned);
                }
            });
        }

        return variants;
    };

    function registerDiffAnchor(file, element) {
        if (!element || !file) {
            return;
        }

        const candidates = new Set();
        if (file.newPath) {
            candidates.add(file.newPath);
        }
        if (file.oldPath) {
            candidates.add(file.oldPath);
        }
        if (file.header) {
            candidates.add(file.header);
        }

        candidates.forEach((candidate) => {
            explodeVariants(candidate).forEach((variant) => {
                const key = normaliseLookupKey(variant);
                if (key) {
                    state.fileAnchors.set(key, element);
                }
            });
        });
    }

    function findDiffAnchor(path) {
        if (!path) {
            return null;
        }

        const variants = explodeVariants(path);
        for (const variant of variants) {
            const key = normaliseLookupKey(variant);
            if (key && state.fileAnchors.has(key)) {
                return state.fileAnchors.get(key);
            }
        }

        const fallbackKey = normaliseLookupKey(path);
        if (fallbackKey && state.fileAnchors.has(fallbackKey)) {
            return state.fileAnchors.get(fallbackKey);
        }

        return null;
    }

    renderBranches(branches);

    function buildGitLogUrl(hash) {
        try {
            // Prefer the interactive HTML git-log page and pass the projectDir when available.
            const params = new URLSearchParams();
            if (typeof projectDir === "string" && projectDir) {
                params.set('projectDir', projectDir);
            } else if (repoName) {
                // Fallback: include repoName as a hint if no projectDir is available.
                params.set('repoName', repoName);
            }
            // Optionally attach the current session id when available (keeps behavior consistent with codex_runner)
            if (typeof currentSessionId !== 'undefined' && currentSessionId) {
                params.set('sessionId', currentSessionId);
            } else if (typeof window !== 'undefined' && window && window.currentSessionId) {
                params.set('sessionId', window.currentSessionId);
            }
            if (hash) params.set('hash', hash);
            const q = params.toString();
            return '/agent/git-log' + (q ? ('?' + q) : '');
        } catch (e) {
            return '/agent/git-log';
        }
    }
    function buildDiffUrl(hash, parent) {
        try {
            if (!hash) return '/agent/git-diff';
            const baseRev = parent || `${hash}^`;
            const compRev = hash;
            const params = new URLSearchParams({ baseRev, compRev });
            if (typeof projectDir === 'string' && projectDir) {
                params.set('projectDir', projectDir);
                return `/agent/git-diff?${params.toString()}`;
            }
            if (repoName) {
                const cleanedRepoName = repoName.replace(/^\/+/, '');
                if (cleanedRepoName) {
                    return `/${cleanedRepoName}/diff?${params.toString()}`;
                }
            }
            if (typeof currentSessionId !== 'undefined' && currentSessionId) {
                params.set('sessionId', currentSessionId);
            } else if (typeof window !== 'undefined' && window && window.currentSessionId) {
                params.set('sessionId', window.currentSessionId);
            }
            return `/agent/git-diff?${params.toString()}`;
        } catch (e) {
            return '/agent/git-diff';
        }
    }

    // Pagination: show only the most recent N commits initially and allow loading more
    function initPagination(totalCount) {
        const defaultPage = 20;
        state.pagination = {
            pageSize: defaultPage,
            loadedCount: Math.min(defaultPage, totalCount),
            total: totalCount,
        };
    }

    function renderCommitRowsWithPagination() {
        const rows = Array.isArray(state.layout.rows) ? state.layout.rows : [];
        const slice = rows.slice(0, state.pagination.loadedCount);
        renderCommitRows(slice);
        updatePaginationControls();
    }

    function updatePaginationControls() {
        const controls = document.getElementById('gitTreePaginationControlsBottom') || document.getElementById('gitTreePaginationControls');
        const pageSizeInput = document.getElementById('gitTreePageSize');
        const loadMoreBtn = document.getElementById('gitTreeLoadMore');
        if (!controls || !loadMoreBtn || !pageSizeInput) {
            return;
        }

        const remaining = Math.max(0, state.pagination.total - state.pagination.loadedCount);
        const nextCount = Math.min(Number(pageSizeInput.value) || state.pagination.pageSize, remaining);
        if (remaining <= 0) {
            loadMoreBtn.disabled = true;
            loadMoreBtn.textContent = 'All commits loaded';
            return;
        }

        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = `Load ${nextCount} more commits`;
    }

    renderCommitRows; // ensure function hoisting remains intact

    initPagination((state.layout && state.layout.rows) ? state.layout.rows.length : 0);
    renderCommitRowsWithPagination();
    // Only hide the initial loader if we actually have commits to show.
    // If there are zero revisions, keep the loading overlay visible so the
    // page presents a loading spinner instead of an immediate "no commits" row.
    if (Array.isArray(commitGraph) && commitGraph.length > 0) {
        window.requestAnimationFrame(() => hideInitialLoader());
    } else {
        if (loaderLogEl) loaderLogEl.textContent = 'Loading revisions…';
        // Ensure the loader is visible (it may be present by default in the DOM).
        if (initialLoader) initialLoader.classList.remove('is-hidden');
    }

    if (filterInput) {
        filterInput.addEventListener("input", (event) => {
            state.filter = (event.target.value || "").toString().toLowerCase();
            applyFilter();
        });
    }

    if (gitPullButton) {
        gitPullButton.addEventListener("click", async () => {
            if (!projectDir) {
                setGitPullStatus("No project directory loaded.", "error");
                return;
            }

            if (gitPullButton.disabled) {
                return;
            }

            gitPullButton.disabled = true;
            setGitPullStatus("Pulling latest changes…", "info");

            try {
                const response = await fetch("/agent/git-tree/pull", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ projectDir }),
                });

                const payload = await response.json().catch(() => ({}));

                if (!response.ok || (payload && payload.error)) {
                    const errorMessage =
                        (payload && payload.error)
                            || `Git pull failed with status ${response.status}.`;
                    throw new Error(errorMessage);
                }

                setGitPullStatus("Git pull completed.", "success");

                setTimeout(() => {
                    window.location.reload();
                }, 600);
            } catch (error) {
                const message = (error && error.message) || "Git pull failed.";
                setGitPullStatus(message, "error");
            } finally {
                gitPullButton.disabled = false;
            }
        });
    }

    function setGitPullStatus(message, type) {
        if (!gitPullStatus) {
            return;
        }

        gitPullStatus.textContent = message || "";
        gitPullStatus.classList.remove("error", "success");

        if (type === "error") {
            gitPullStatus.classList.add("error");
        } else if (type === "success") {
            gitPullStatus.classList.add("success");
        }
    }

    function hideInitialLoader(finalMessage) {
        if (!initialLoader) {
            return;
        }

        if (loaderTimer) {
            window.clearInterval(loaderTimer);
            loaderTimer = null;
        }

        if (loaderLogEl && finalMessage) {
            loaderLogEl.textContent = finalMessage;
        }

        initialLoader.classList.add("is-hidden");
        window.setTimeout(() => {
            if (initialLoader && initialLoader.parentNode) {
                initialLoader.parentNode.removeChild(initialLoader);
            }
        }, 480);
    }

    function buildLayout(commits) {
        const rows = [];
        const lanes = [];
        const laneColors = [];
        let maxLaneCount = 0;

        commits.forEach((commitRaw) => {
            if (!commitRaw || typeof commitRaw !== "object") {
                return;
            }

            const commit = {
                hash: commitRaw.hash || "",
                parents: Array.isArray(commitRaw.parents)
                    ? commitRaw.parents.filter(Boolean)
                    : [],
                author: commitRaw.author || "",
                date: commitRaw.date || "",
                message: commitRaw.message || "",
            };

            let laneIndex = lanes.indexOf(commit.hash);
            if (laneIndex === -1) {
                laneIndex = lanes.indexOf(null);
                if (laneIndex === -1) {
                    laneIndex = lanes.length;
                    lanes.push(commit.hash);
                    laneColors[laneIndex] = GRAPH_LINE_COLOR;
                } else {
                    lanes[laneIndex] = commit.hash;
                    laneColors[laneIndex] = GRAPH_LINE_COLOR;
                }
            }

            if (!laneColors[laneIndex]) {
                laneColors[laneIndex] = GRAPH_LINE_COLOR;
            }

            const lanesBefore = lanes.slice();
            const laneColorsBefore = laneColors.slice();
            const newLanes = lanes.slice();
            const newLaneColors = laneColors.slice();
            const parentAssignments = [];

            if (commit.parents.length > 0) {
                newLanes[laneIndex] = commit.parents[0];
                parentAssignments.push({
                    parent: commit.parents[0],
                    lane: laneIndex,
                    color: laneColors[laneIndex],
                });
            } else {
                newLanes[laneIndex] = null;
            }

            for (let i = 1; i < commit.parents.length; i += 1) {
                const parent = commit.parents[i];
                let parentLane = newLanes.indexOf(parent);
                if (parentLane === -1) {
                    parentLane = newLanes.indexOf(null);
                    if (parentLane === -1) {
                        parentLane = newLanes.length;
                        newLanes.push(parent);
                        newLaneColors[parentLane] = GRAPH_LINE_COLOR;
                    } else {
                        newLanes[parentLane] = parent;
                        newLaneColors[parentLane] = GRAPH_LINE_COLOR;
                    }
                }

                parentAssignments.push({
                    parent,
                    lane: parentLane,
                    color: GRAPH_LINE_COLOR,
                });
            }

            const lanesAfter = newLanes.slice();
            const laneColorsAfter = newLaneColors.slice();
            const laneCount = Math.max(
                lanesBefore.length,
                lanesAfter.length,
                laneIndex + 1,
                ...parentAssignments.map((assignment) => assignment.lane + 1)
            );

            maxLaneCount = Math.max(maxLaneCount, laneCount);

            rows.push({
                commit,
                laneIndex,
                lanesBefore,
                lanesAfter,
                laneColorsBefore,
                laneColorsAfter,
                parentAssignments,
                color: GRAPH_LINE_COLOR,
                laneCount,
            });

            lanes.length = newLanes.length;
            laneColors.length = newLaneColors.length;
            for (let idx = 0; idx < newLanes.length; idx += 1) {
                lanes[idx] = newLanes[idx];
                laneColors[idx] = newLaneColors[idx];
            }

            while (lanes.length && lanes[lanes.length - 1] === null) {
                lanes.pop();
                laneColors.pop();
            }
        });

        return {
            rows,
            maxLaneCount,
            visibleMaxLaneCount: Math.min(maxLaneCount || 0, GRAPH_VISIBLE_LANE_LIMIT),
        };
    }

    function renderBranches(branchItems) {
        if (!branchListEl) {
            return;
        }

        branchListEl.innerHTML = "";

        if (!branchItems.length) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No branches detected.";
            branchListEl.appendChild(empty);
            return;
        }

        branchItems.forEach((branch) => {
            const item = document.createElement("div");
            item.className = "branch-item" + (branch.isCurrent ? " is-current" : "");

            const name = document.createElement("div");
            name.className = "branch-name";
            name.textContent = branch.name || "(unknown)";
            item.appendChild(name);

            const meta = document.createElement("div");
            meta.className = "branch-meta";

            const scopeChip = document.createElement("span");
            scopeChip.className = "branch-chip";
            scopeChip.textContent = branch.isRemote ? "remote" : "local";
            meta.appendChild(scopeChip);

            if (branch.hash) {
                const hashChip = document.createElement("span");
                hashChip.className = "hash-chip";
                hashChip.textContent = branch.hash.slice(0, 7);
                meta.appendChild(hashChip);
                }

                if (branch.sterlingParent) {
                    const parentChip = document.createElement("span");
                    parentChip.className = "parent-chip";
                    parentChip.textContent = branch.sterlingParent;
                    meta.appendChild(parentChip);
                }

                const details = [branch.author || "", branch.dateRelative || ""].filter(Boolean).join(" · ");
            if (details) {
                const info = document.createElement("span");
                info.textContent = details;
                meta.appendChild(info);
            }

            item.appendChild(meta);
            branchListEl.appendChild(item);
        });
    }

    function renderCommitRows(rows) {
        treeListEl.innerHTML = "";
        state.rows = [];

        rows.forEach((row) => {
            const rowEl = createRowElement(row);
            treeListEl.appendChild(rowEl);
            state.rows.push({ element: rowEl, data: row });
        });
    }

    function createRowElement(row) {
        const rowEl = document.createElement("div");
        rowEl.className = "tree-row";
        rowEl.dataset.commitHash = row.commit.hash;
        rowEl.dataset.searchText = [
            row.commit.message || "",
            row.commit.hash || "",
            row.commit.author || "",
            row.commit.date || "",
            (row.commit.parents || []).join(" "),
        ]
            .join(" ")
            .toLowerCase();

        const graphCell = document.createElement("div");
        graphCell.className = "tree-cell graph-cell";
        graphCell.appendChild(renderGraph(row, graphCell));
        rowEl.appendChild(graphCell);

        const messageCell = document.createElement("div");
        messageCell.className = "tree-cell tree-message";

        const subject = document.createElement("span");
        subject.className = "commit-subject";
        subject.textContent = row.commit.message || "(no commit message)";
        messageCell.appendChild(subject);

        const meta = document.createElement("div");
        meta.className = "commit-meta";
        const hashChip = document.createElement("span");
        hashChip.className = "hash-chip";
        hashChip.textContent = (row.commit.hash || "").slice(0, 7);
        meta.appendChild(hashChip);

        if (row.commit.parents && row.commit.parents.length) {
            const parents = document.createElement("span");
            parents.textContent = `parents: ${row.commit.parents.map((p) => p.slice(0, 7)).join(", ")}`;
            meta.appendChild(parents);
        }

        messageCell.appendChild(meta);
        rowEl.appendChild(messageCell);

        const authorCell = document.createElement("div");
        authorCell.className = "tree-cell author-cell";
        authorCell.textContent = row.commit.author || "—";
        rowEl.appendChild(authorCell);

        const dateCell = document.createElement("div");
        dateCell.className = "tree-cell date-cell";
        dateCell.textContent = formatDate(row.commit.date);
        rowEl.appendChild(dateCell);

        
        // Open Git Log in new tab when a row is clicked
        rowEl.addEventListener('click', (evt) => {
            try {
                if (evt && evt.target && evt.target.tagName && evt.target.tagName.toLowerCase() === 'a') return;
                const compHash = row.commit && row.commit.hash ? row.commit.hash : null;
                const parentHash = (row.commit && Array.isArray(row.commit.parents) && row.commit.parents.length) ? row.commit.parents[0] : null;
                const url = buildDiffUrl(compHash, parentHash);
                const w = window.open(url, '_blank');
                if (w) try { w.opener = null; } catch (e) {} ;
            } catch (e) {}
        });

        return rowEl;
    }

    function renderGraph(row, hostElement) {
        const fallbackHeight = 34;
        const minHeight = 24;

        const clampLane = (idx) => {
            if (typeof idx !== "number" || Number.isNaN(idx) || idx < 0) {
                return -1;
            }
            return Math.min(idx, GRAPH_VISIBLE_LANE_LIMIT - 1);
        };

        const computePresence = (lanes) => {
            const flags = new Array(GRAPH_VISIBLE_LANE_LIMIT).fill(false);
            if (!Array.isArray(lanes)) {
                return flags;
            }
            lanes.forEach((value, idx) => {
                if (value != null) {
                    const lane = clampLane(idx);
                    if (lane >= 0) {
                        flags[lane] = true;
                    }
                }
            });
            return flags;
        };

        const findLastTrueIndex = (flags) => {
            if (!Array.isArray(flags)) {
                return -1;
            }
            for (let idx = flags.length - 1; idx >= 0; idx -= 1) {
                if (flags[idx]) {
                    return idx;
                }
            }
            return -1;
        };

        const computeLaneGeometry = (laneTarget) => {
            const lanes = Math.max(1, Math.min(laneTarget, GRAPH_VISIBLE_LANE_LIMIT));
            let spacing = Math.min(GRAPH_MAX_WIDTH / lanes, GRAPH_MAX_LANE_WIDTH);
            if (spacing < GRAPH_MIN_LANE_WIDTH) {
                spacing = GRAPH_MIN_LANE_WIDTH;
            }
            let total = spacing * lanes;
            if (total > GRAPH_MAX_WIDTH) {
                total = GRAPH_MAX_WIDTH;
                spacing = total / lanes;
            }
            return { spacing, total, laneCount: lanes };
        };

        const lanesBeforePresence = computePresence(row.lanesBefore);
        const lanesAfterPresence = computePresence(row.lanesAfter);
        const visibleLaneIndex = Math.max(0, clampLane(row.laneIndex));

        const parentAssignmentsRaw = Array.isArray(row.parentAssignments)
            ? row.parentAssignments.filter((assignment) => assignment && typeof assignment.lane === "number")
            : [];
        const seenParentLane = new Set();
        const parentAssignments = [];
        parentAssignmentsRaw.forEach((assignment) => {
            const lane = clampLane(assignment.lane);
            if (lane < 0 || lane === visibleLaneIndex) {
                return;
            }
            if (seenParentLane.has(lane)) {
                return;
            }
            seenParentLane.add(lane);
            parentAssignments.push({
                parent: assignment.parent,
                lane,
                color: GRAPH_LINE_COLOR,
            });
        });

        const parentLaneMax = parentAssignments.reduce((max, assignment) => {
            return Math.max(max, assignment.lane);
        }, -1);

        let visibleLaneCount = Math.max(
            visibleLaneIndex,
            findLastTrueIndex(lanesBeforePresence),
            findLastTrueIndex(lanesAfterPresence),
            parentLaneMax
        ) + 1;

        if (!Number.isFinite(visibleLaneCount) || visibleLaneCount < 1) {
            visibleLaneCount = 1;
        }
        visibleLaneCount = Math.min(visibleLaneCount, GRAPH_VISIBLE_LANE_LIMIT);

        const layoutLaneLimit = Math.max(
            1,
            Math.min(
                (state.layout && state.layout.visibleMaxLaneCount) || visibleLaneCount,
                GRAPH_VISIBLE_LANE_LIMIT
            )
        );
        const globalLaneCapacity = Math.max(visibleLaneCount, layoutLaneLimit);

        const geometry = computeLaneGeometry(globalLaneCapacity);
        const laneWidth = geometry.spacing;
        const totalWidth = geometry.total;
        const laneCapacity = geometry.laneCount;
        const laneScale = laneWidth / GRAPH_MAX_LANE_WIDTH;
        const effectiveLineWidth = Math.max(GRAPH_LINE_WIDTH * laneScale, 1);
        const effectiveNodeRadius = Math.max(
            GRAPH_NODE_RADIUS * laneScale,
            GRAPH_MIN_NODE_RADIUS
        );

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("commit-graph");

        let lastHeight = 0;

        const getLaneColor = () => GRAPH_LINE_COLOR;

        const draw = (desiredHeight) => {
            const rowHeight = Math.max(
                typeof desiredHeight === "number" && !Number.isNaN(desiredHeight)
                    ? desiredHeight
                    : fallbackHeight,
                minHeight
            );

            if (Math.abs(rowHeight - lastHeight) < 0.5) {
                return;
            }
            lastHeight = rowHeight;

            const circleX = visibleLaneIndex * laneWidth + laneWidth / 2;
            const circleY = rowHeight / 2;

            svg.setAttribute("width", totalWidth);
            svg.setAttribute("height", rowHeight);
            svg.setAttribute("viewBox", `0 0 ${totalWidth} ${rowHeight}`);

            while (svg.firstChild) {
                svg.removeChild(svg.firstChild);
            }

            for (let lane = 0; lane < laneCapacity; lane += 1) {
                const hasBefore = lanesBeforePresence[lane];
                const hasAfter = lanesAfterPresence[lane];
                const isCommitLane = lane === visibleLaneIndex;
                if (!hasBefore && !hasAfter && !isCommitLane) {
                    continue;
                }

                const x = lane * laneWidth + laneWidth / 2;
                const startY = hasBefore || isCommitLane ? 0 : circleY;
                const endY = hasAfter || isCommitLane ? rowHeight : circleY;

                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", x);
                line.setAttribute("x2", x);
                line.setAttribute("y1", startY);
                line.setAttribute("y2", endY);
                line.setAttribute("stroke", getLaneColor(lane));
                line.setAttribute("stroke-width", effectiveLineWidth);
                line.setAttribute("stroke-linecap", "round");
                line.setAttribute("opacity", "0.75");
                svg.appendChild(line);
            }

            parentAssignments.forEach((assignment) => {
                if (assignment.lane < 0 || assignment.lane >= laneCapacity) {
                    return;
                }

                const targetX = assignment.lane * laneWidth + laneWidth / 2;
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                const curvature = Math.max(
                    Math.abs(targetX - circleX) * 0.35,
                    laneWidth * 0.85
                );
                const d = [
                    "M",
                    circleX,
                    circleY,
                    "C",
                    circleX,
                    circleY + curvature,
                    targetX,
                    rowHeight - curvature,
                    targetX,
                    rowHeight,
                ].join(" ");
                path.setAttribute("d", d);
                path.setAttribute("stroke", assignment.color || getLaneColor(assignment.lane));
                path.setAttribute("stroke-width", effectiveLineWidth);
                path.setAttribute("fill", "none");
                path.setAttribute("opacity", "0.75");
                svg.appendChild(path);
            });

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", circleX);
            circle.setAttribute("cy", circleY);
            circle.setAttribute("r", effectiveNodeRadius);
            circle.setAttribute("fill", GRAPH_NODE_FILL);
            circle.setAttribute("stroke", "none");
            svg.appendChild(circle);
        };

        draw(fallbackHeight);

        if (hostElement && typeof ResizeObserver === "function") {
            const observer = new ResizeObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry || !entry.contentRect) {
                        return;
                    }
                    const { height } = entry.contentRect;
                    if (height && Math.abs(height - lastHeight) > 0.5) {
                        draw(height);
                    }
                });
            });
            observer.observe(hostElement);

            requestAnimationFrame(() => {
                if (!hostElement) {
                    return;
                }
                const rect = hostElement.getBoundingClientRect();
                if (rect && rect.height) {
                    draw(rect.height);
                }
            });
        }

        return svg;
    }

    function formatDate(dateStr) {
        if (!dateStr) {
            return "";
        }
        const parsed = new Date(dateStr);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString(undefined, {
                year: "numeric",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        }
        return dateStr;
    }

    

    // --- Pagination controls wiring ---
    (function attachPaginationHandlers(){
        const controls = document.getElementById('gitTreePaginationControlsBottom') || document.getElementById('gitTreePaginationControls');
        const pageSizeInput = document.getElementById('gitTreePageSize');
        const loadMoreBtn = document.getElementById('gitTreeLoadMore');
        if (!controls) {
            return;
        }

        // Create controls if they do not exist (defensive)
        if (!pageSizeInput) {
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '1';
            input.id = 'gitTreePageSize';
            input.setAttribute('aria-label','Number of commits to load');
            input.style.width = '84px';
            input.value = String(state.pagination ? state.pagination.pageSize : 20);
            input.style.marginRight = '8px';
            controls.appendChild(input);
        }
        if (!loadMoreBtn) {
            const btn = document.createElement('button');
            btn.id = 'gitTreeLoadMore';
            btn.className = 'git-action-button';
            btn.type = 'button';
            btn.textContent = 'Load more commits';
            controls.appendChild(btn);
        }

        const sizeInput = document.getElementById('gitTreePageSize');
        const loadBtn = document.getElementById('gitTreeLoadMore');

        function onLoadMoreClicked() {
            const n = Math.max(1, parseInt(sizeInput.value, 10) || (state.pagination ? state.pagination.pageSize : 20));
            const remaining = Math.max(0, state.pagination.total - state.pagination.loadedCount);
            const toLoad = Math.min(n, remaining);
            if (toLoad <= 0) {
                updatePaginationControls();
                return;
            }
            state.pagination.loadedCount = state.pagination.loadedCount + toLoad;
            renderCommitRowsWithPagination();
        }

        sizeInput.addEventListener('change', () => {
            const val = Math.max(1, parseInt(sizeInput.value, 10) || state.pagination.pageSize);
            state.pagination.pageSize = val;
            updatePaginationControls();
        });

        loadBtn.addEventListener('click', onLoadMoreClicked);

        // initialize controls text
        updatePaginationControls();
    })();

    // --- End pagination wiring ---

    
    function selectCommit(hash) {
        if (!hash || typeof hash !== "string") {
            return;
        }
        state.selectedHash = hash;
        state.rows.forEach((entry) => {
            if (entry.element) {
                entry.element.classList.toggle("is-selected", entry.data.commit.hash === hash);
            }
        });

        showLoadingState();
        fetchCommitDetails(hash)
            .then((payload) => {
                if (!payload || (payload.commit && payload.commit.hash !== state.selectedHash)) {
                    return;
                }
                renderCommitDetails(payload.commit);
                renderDiff(payload.diff, payload.diffText);
                renderChangedFiles(payload.files);
            })
            .catch((error) => {
                renderError(error);
            });
    }

    function fetchCommitDetails(hash) {
        const params = new URLSearchParams();
        params.set("hash", hash);
        if (projectDir) {
            params.set("projectDir", projectDir);
        }
        return fetch(`/agent/git-tree/commit?${params.toString()}`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load commit ${hash}: ${response.statusText}`);
                }
                return response.json();
            })
            .catch((err) => {
                console.error(err);
                throw err;
            });
    }

    function showLoadingState() {
        state.fileAnchors = new Map();
        if (commitInfoEl) {
            commitInfoEl.innerHTML = '<span class="loading-state">Loading commit…</span>';
        }
        if (changedFilesEl) {
            changedFilesEl.innerHTML = '<span class="loading-state">Loading files…</span>';
        }
        if (diffViewerEl) {
            diffViewerEl.innerHTML = '<span class="loading-state">Loading diff…</span>';
        }
    }

    function clearCommitDetails() {
        state.fileAnchors = new Map();
        if (commitInfoEl) {
            commitInfoEl.innerHTML = '<p class="empty-state">No commit selected.</p>';
        }
        if (changedFilesEl) {
            changedFilesEl.innerHTML = '<p class="empty-state">No file changes to display.</p>';
        }
        if (diffViewerEl) {
            diffViewerEl.innerHTML = '<p class="empty-state">No diff available.</p>';
        }
    }

    function renderCommitDetails(commit) {
        if (!commitInfoEl) {
            return;
        }
        if (!commit) {
            commitInfoEl.innerHTML = '<p class="empty-state">Unable to load commit details.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();

        const title = document.createElement("div");
        title.className = "commit-title";

        const hashEl = document.createElement("span");
        hashEl.className = "hash";
        hashEl.textContent = commit.hash || "";
        title.appendChild(hashEl);

        const subject = document.createElement("div");
        subject.className = "subject";
        subject.textContent = commit.subject || "(no commit message)";
        title.appendChild(subject);

        fragment.appendChild(title);

        const metaGrid = document.createElement("div");
        metaGrid.className = "commit-meta-grid";

        const authorMeta = document.createElement("div");
        authorMeta.className = "meta";
        authorMeta.innerHTML = `<span>Author</span><strong>${escapeHtml(commit.author || "—")}</strong>`;
        metaGrid.appendChild(authorMeta);

        const dateMeta = document.createElement("div");
        dateMeta.className = "meta";
        dateMeta.innerHTML = `<span>Date</span><strong>${escapeHtml(formatDate(commit.date) || "—")}</strong>`;
        metaGrid.appendChild(dateMeta);

        if (commit.parents && commit.parents.length) {
            const parentMeta = document.createElement("div");
            parentMeta.className = "meta";
            parentMeta.innerHTML = `<span>Parents</span><strong>${commit.parents
                .map((p) => escapeHtml(p.slice(0, 10)))
                .join(", ")}</strong>`;
            metaGrid.appendChild(parentMeta);
        }

        fragment.appendChild(metaGrid);

        if (commit.body) {
            const body = document.createElement("div");
            body.className = "commit-body";
            body.textContent = commit.body;
            fragment.appendChild(body);
        }

        commitInfoEl.innerHTML = "";
        commitInfoEl.appendChild(fragment);
    }

    function escapeHtml(str) {
        return (str || "").replace(/[&<>"']/g, (char) => {
            switch (char) {
                case "&":
                    return "&amp;";
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case '"':
                    return "&quot;";
                case "'":
                    return "&#39;";
                default:
                    return char;
            }
        });
    }

    function renderChangedFiles(files) {
        if (!changedFilesEl) {
            return;
        }

        changedFilesEl.innerHTML = "";

        if (!files || !files.length) {
            changedFilesEl.innerHTML = '<p class="empty-state">No file changes.</p>';
            return;
        }

        const hasAnchors = state.fileAnchors && state.fileAnchors.size > 0;
        const fragment = document.createDocumentFragment();

        files.forEach((file) => {
            if (!file) {
                return;
            }

            const item = document.createElement("div");
            item.className = "changed-file";

            const path = document.createElement("span");
            path.className = "file-path";
            path.textContent = file.path || "";
            item.appendChild(path);

            const stats = document.createElement("span");
            stats.className = "file-stats";

            if (file.isBinary) {
                const binary = document.createElement("span");
                binary.className = "binary";
                binary.textContent = "binary";
                stats.appendChild(binary);
            } else {
                const add = document.createElement("span");
                add.className = "additions";
                add.textContent = `+${typeof file.additions === "number" ? file.additions : 0}`;
                stats.appendChild(add);

                const del = document.createElement("span");
                del.className = "deletions";
                del.textContent = `-${typeof file.deletions === "number" ? file.deletions : 0}`;
                stats.appendChild(del);
            }

            item.appendChild(stats);

            if (hasAnchors && file.path) {
                const anchor = findDiffAnchor(file.path);
                if (anchor && typeof anchor.scrollIntoView === "function") {
                    const focusAndHighlight = () => {
                        anchor.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
                        if (typeof anchor.focus === "function") {
                            anchor.setAttribute("tabindex", "-1");
                            anchor.focus({ preventScroll: true });
                        }
                        anchor.classList.add("is-highlighted");
                        setTimeout(() => {
                            anchor.classList.remove("is-highlighted");
                        }, 1400);
                    };

                    item.classList.add("is-clickable");
                    item.tabIndex = 0;
                    item.setAttribute("role", "button");
                    item.setAttribute("aria-label", `View diff for ${file.path}`);

                    item.addEventListener("click", (event) => {
                        event.preventDefault();
                        focusAndHighlight();
                    });

                    item.addEventListener("keydown", (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            focusAndHighlight();
                        }
                    });
                }
            }

            fragment.appendChild(item);
        });

        changedFilesEl.appendChild(fragment);
    }

    function renderDiff(structuredDiff, rawDiffText) {
        if (!diffViewerEl) {
            return;
        }

        diffViewerEl.innerHTML = "";
        state.fileAnchors = new Map();

        if (Array.isArray(structuredDiff) && structuredDiff.length) {
            const fragment = document.createDocumentFragment();

            structuredDiff.forEach((file, index) => {
                if (!file) {
                    return;
                }

                const card = document.createElement("section");
                card.className = "diff-file";
                const anchorId = `diff-file-${index}`;
                card.id = anchorId;

                const header = document.createElement("header");
                header.className = "diff-file-header";

                const title = document.createElement("div");
                title.className = "diff-file-title";
                const primaryPath = file.newPath || file.oldPath || "(unknown file)";
                title.textContent = primaryPath;
                header.appendChild(title);

                if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
                    const rename = document.createElement("div");
                    rename.className = "diff-file-rename";
                    rename.textContent = `renamed from ${file.oldPath}`;
                    header.appendChild(rename);
                }

                if (file.isBinary) {
                    const binaryBadge = document.createElement("span");
                    binaryBadge.className = "diff-badge diff-badge-binary";
                    binaryBadge.textContent = "binary";
                    header.appendChild(binaryBadge);
                }

                card.appendChild(header);

                registerDiffAnchor(file, card);

                if (file.isBinary) {
                    const binaryNotice = document.createElement("p");
                    binaryNotice.className = "diff-binary-notice";
                    binaryNotice.textContent = file.binaryMessage || "Binary file changed.";
                    card.appendChild(binaryNotice);
                } else if (Array.isArray(file.hunks) && file.hunks.length) {
                    file.hunks.forEach((hunk) => {
                        if (!hunk) {
                            return;
                        }

                        const hunkSection = document.createElement("section");
                        hunkSection.className = "diff-hunk";

                        const hunkHeader = document.createElement("div");
                        hunkHeader.className = "diff-hunk-header";
                        hunkHeader.textContent = hunk.header || "@@";
                        hunkSection.appendChild(hunkHeader);

                        if (Array.isArray(hunk.rows)) {
                            hunk.rows.forEach((row) => {
                                if (!row) {
                                    return;
                                }

                                const rowEl = document.createElement("div");
                                rowEl.className = `diff-row diff-row-${row.type || "meta"}`;

                                if (row.type === "meta") {
                                    const meta = document.createElement("pre");
                                    meta.className = "diff-code";
                                    meta.textContent = row.metaContent || "";
                                    rowEl.appendChild(meta);
                                } else {
                                    const leftNumber = document.createElement("span");
                                    leftNumber.className = "diff-cell diff-cell-line";
                                    leftNumber.textContent = row.leftNumber || "";
                                    rowEl.appendChild(leftNumber);

                                    const rightNumber = document.createElement("span");
                                    rightNumber.className = "diff-cell diff-cell-line";
                                    rightNumber.textContent = row.rightNumber || "";
                                    rowEl.appendChild(rightNumber);

                                    const codeCell = document.createElement("pre");
                                    codeCell.className = "diff-code";

                                    if (row.type === "remove") {
                                        codeCell.classList.add("diff-code-remove");
                                        codeCell.textContent = `- ${row.leftContent || ""}`;
                                    } else if (row.type === "add") {
                                        codeCell.classList.add("diff-code-add");
                                        codeCell.textContent = `+ ${row.rightContent || ""}`;
                                    } else if (row.type === "modify") {
                                        codeCell.classList.add("diff-code-modify");
                                        const leftPart = row.leftContent ? `- ${row.leftContent}` : "";
                                        const rightPart = row.rightContent ? `\n+ ${row.rightContent}` : "";
                                        codeCell.textContent = `${leftPart}${rightPart}`.trim();
                                    } else {
                                        codeCell.textContent = `  ${row.rightContent || row.leftContent || ""}`;
                                    }

                                    rowEl.appendChild(codeCell);
                                }

                                hunkSection.appendChild(rowEl);
                            });
                        }

                        card.appendChild(hunkSection);
                    });
                } else {
                    const empty = document.createElement("p");
                    empty.className = "diff-empty";
                    empty.textContent = "No textual changes in this file.";
                    card.appendChild(empty);
                }

                fragment.appendChild(card);
            });

            diffViewerEl.appendChild(fragment);
            return;
        }

        if (rawDiffText) {
            const fallback = document.createElement("pre");
            fallback.className = "diff-raw";
            fallback.textContent = rawDiffText;
            diffViewerEl.appendChild(fallback);
            return;
        }

        diffViewerEl.innerHTML = '<p class="empty-state">No diff available for this commit.</p>';
    }

    function renderError(error) {
        const message = error && error.message ? error.message : "Failed to load commit details.";
        if (commitInfoEl) {
            commitInfoEl.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
        }
        if (changedFilesEl) {
            changedFilesEl.innerHTML = '<p class="empty-state">Unable to load changed files.</p>';
        }
        if (diffViewerEl) {
            diffViewerEl.innerHTML = '<p class="empty-state">Unable to load diff.</p>';
        }
    }

    function applyFilter() {
        const query = state.filter;
        if (!state.rows || !state.rows.length) {
            return;
        }

        state.rows.forEach((entry) => {
            if (!entry || !entry.element) {
                return;
            }
            if (!query) {
                entry.element.style.display = "grid";
                return;
            }
            const haystack = entry.element.dataset.searchText || "";
            entry.element.style.display = haystack.includes(query) ? "grid" : "none";
        });
    }
})();
