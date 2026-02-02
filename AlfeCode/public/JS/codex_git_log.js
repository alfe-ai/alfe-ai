(() => {
  const config = window.CODEX_GIT_LOG_DATA || {};
  const commitGraph = Array.isArray(config.gitCommitGraph) ? config.gitCommitGraph : [];
  const repoName = typeof config.repoName === "string" ? config.repoName : "";
  const resolvedProjectDir =
    typeof config.resolvedProjectDir === "string" ? config.resolvedProjectDir : "";
  const commitLimitConfig = Number(config.commitLimit);
  const commitOffsetConfig = Number(config.commitOffset);
  const commitNextOffsetConfig = Number(config.commitNextOffset);
  const commitListEl = document.getElementById("gitCommitList");
  const loadMoreButton = document.getElementById("gitLoadMoreButton");
  const commitLoadStatus = document.getElementById("gitCommitLoadStatus");
  const initialCommitCount = commitListEl ? commitListEl.children.length : 0;
  const pageLimit = Number.isFinite(commitLimitConfig) && commitLimitConfig > 0
    ? commitLimitConfig
    : 20;
  const initialOffset = Number.isFinite(commitOffsetConfig) && commitOffsetConfig >= 0
    ? commitOffsetConfig
    : 0;
  let nextOffset = Number.isFinite(commitNextOffsetConfig) && commitNextOffsetConfig >= initialOffset
    ? commitNextOffsetConfig
    : initialOffset + initialCommitCount;
  let hasMoreCommits = Boolean(config.hasMoreCommits);
  if (!commitListEl) {
    hasMoreCommits = false;
  }
  let isLoadingMore = false;

  const commitLookup = new Map();
  commitGraph.forEach((commit) => {
    if (!commit || typeof commit.hash !== "string") {
      return;
    }
    const commitHash = commit.hash.trim();
    if (!commitHash) {
      return;
    }
    const parents = Array.isArray(commit.parents) ? commit.parents : [];
    const primaryParentRaw =
      parents.length > 0 && typeof parents[0] === "string" ? parents[0] : null;
    const primaryParent = primaryParentRaw ? primaryParentRaw.trim() || null : null;
    commitLookup.set(commitHash.toLowerCase(), {
      hash: commitHash,
      parent: primaryParent,
      author: typeof commit.author === "string" ? commit.author : "",
      date: typeof commit.date === "string" ? commit.date : "",
      message: typeof commit.message === "string" ? commit.message : "",
      refs: typeof commit.refs === "string" ? commit.refs : "",
    });
  });

  const buildDiffUrl = (hash, parentHash) => {
    if (!hash) {
      return "";
    }
    const params = new URLSearchParams({
      baseRev: parentHash || `${hash}^`,
      compRev: hash,
    });

    if (repoName) {
      const cleanedRepoName = repoName.replace(/^\/+/, "");
      if (cleanedRepoName) {
        return `/${cleanedRepoName}/diff?${params.toString()}`;
      }
    }

    if (resolvedProjectDir) {
      params.set("projectDir", resolvedProjectDir);
      return `/agent/git-diff?${params.toString()}`;
    }

    return "";
  };

  const formatExactDate = (dateValue) => {
    if (!dateValue) return "";
    const ts = Date.parse(dateValue);
    if (Number.isNaN(ts)) {
      return dateValue;
    }
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(ts);
  };

  const enhanceCommitItem = (item) => {
    if (!item || item.dataset.enhanced === "true") {
      return;
    }
    const rawText = item.textContent || "";
    const match = rawText.match(/\b[0-9a-f]{7,40}\b/i);
    if (!match) {
      return;
    }
    const matchedHash = match[0];
    const mappedEntry = commitLookup.get(matchedHash.toLowerCase()) || null;
    const lookupHash = mappedEntry ? mappedEntry.hash : matchedHash;
    const parentHash = mappedEntry ? mappedEntry.parent : null;
    const diffUrl = buildDiffUrl(lookupHash, parentHash);
    item.dataset.diffUrl = diffUrl || "";

    const authorMatch = rawText.match(/-\s([^,]+),/);
    const dateMatch = rawText.match(/,\s([^:]+)\s:/);
    const messageMatch = rawText.split(/:\s(.+)/);

    const author = mappedEntry?.author || (authorMatch ? authorMatch[1].trim() : "");
    const dateLabel = mappedEntry?.date
      ? formatExactDate(mappedEntry.date)
      : dateMatch
        ? dateMatch[1].trim()
        : "";
    const message = mappedEntry?.message || (messageMatch && messageMatch[1] ? messageMatch[1].trim() : rawText.trim());

    item.textContent = "";
    const row = document.createElement("div");
    row.className = "cli-row";

    const hashEl = document.createElement(diffUrl ? "a" : "span");
    hashEl.className = "cli-hash git-commit-link";
    hashEl.textContent = lookupHash.slice(0, 7);
    if (diffUrl) {
      hashEl.href = diffUrl;
      hashEl.target = "_blank";
      hashEl.rel = "noopener noreferrer";
    }

    const meta = document.createElement("div");
    meta.className = "cli-meta";
    if (author) {
      const authorEl = document.createElement("span");
      authorEl.className = "cli-author";
      authorEl.textContent = author;
      meta.appendChild(authorEl);
    }
    if (dateLabel) {
      const dateEl = document.createElement("span");
      dateEl.className = "cli-date";
      dateEl.textContent = dateLabel;
      meta.appendChild(dateEl);
    }
    const messageEl = document.createElement("div");
    messageEl.className = "cli-message";
    messageEl.textContent = message;

    row.appendChild(hashEl);
    row.appendChild(meta);
    row.appendChild(messageEl);

    item.appendChild(row);
    item.dataset.enhanced = "true";
  };

  const makeCommitListClickable = () => {
    if (!commitListEl) {
      return;
    }
    const listItems = commitListEl.querySelectorAll("li");
    listItems.forEach((item) => {
      if (!item || item.dataset.clickable === "true") {
        return;
      }
      const diffUrl = item.dataset.diffUrl;
      if (!diffUrl) {
        return;
      }
      item.dataset.clickable = "true";
      item.classList.add("git-commit-row");
      item.setAttribute("role", "link");
      item.tabIndex = 0;

      const openDiff = (event) => {
        if (event && event.target && event.target.closest("a")) {
          return;
        }
        window.open(diffUrl, "_blank", "noopener,noreferrer");
      };

      item.addEventListener("click", openDiff);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDiff(event);
        }
      });
    });
  };

  const renderCommitItems = () => {
    if (!commitListEl) {
      return;
    }
    const listItems = commitListEl.querySelectorAll("li");
    listItems.forEach(enhanceCommitItem);
    makeCommitListClickable();
  };

  renderCommitItems();

  const updateLoadMoreVisibility = () => {
    if (!loadMoreButton) {
      return;
    }
    loadMoreButton.style.display = hasMoreCommits ? "inline-flex" : "none";
  };

  const showCommitStatus = (text, kind) => {
    if (!commitLoadStatus) {
      return;
    }
    commitLoadStatus.textContent = text || "";
    commitLoadStatus.classList.remove("error", "success");
    if (kind) {
      commitLoadStatus.classList.add(kind);
    }
  };

  const appendCommits = (items) => {
    if (!commitListEl || !Array.isArray(items) || items.length === 0) {
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((commitLine) => {
      if (!commitLine) {
        return;
      }
      const li = document.createElement("li");
      li.textContent = commitLine;
      frag.appendChild(li);
    });

    commitListEl.appendChild(frag);
    renderCommitItems();
  };

  const buildCommitsApiUrl = (offsetValue) => {
    const params = new URLSearchParams();
    params.set("offset", String(Math.max(0, offsetValue || 0)));
    params.set("limit", String(Math.max(1, pageLimit)));
    if (resolvedProjectDir) {
      params.set("projectDir", resolvedProjectDir);
    }
    return `/agent/git-log/commits.json?${params.toString()}`;
  };

  if (loadMoreButton && commitListEl) {
    loadMoreButton.addEventListener("click", () => {
      if (isLoadingMore || !hasMoreCommits) {
        return;
      }
      isLoadingMore = true;
      showCommitStatus("Loading additional commits...");

      fetch(buildCommitsApiUrl(nextOffset), {
        headers: { Accept: "application/json" },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }
          return response
            .json()
            .catch((err) => {
              throw err || new Error("Invalid JSON response");
            });
        })
        .then((data) => {
          const newCommits = Array.isArray(data.commits) ? data.commits : [];
          appendCommits(newCommits);
          if (typeof data.nextOffset === "number") {
            nextOffset = data.nextOffset;
          } else {
            nextOffset += newCommits.length;
          }
          hasMoreCommits = Boolean(data.hasMore);
          updateLoadMoreVisibility();
          if (newCommits.length > 0) {
            const successMessage = newCommits.length === 1
              ? "Loaded 1 additional commit."
              : `Loaded ${newCommits.length} additional commits.`;
            showCommitStatus(successMessage, "success");
          } else {
            showCommitStatus("No additional commits available.");
          }
        })
        .catch((err) => {
          console.error("[ERROR] load-more-commits:", err);
          showCommitStatus("Failed to load more commits.", "error");
        })
        .finally(() => {
          isLoadingMore = false;
        });
    });
  }

  updateLoadMoreVisibility();

  const gitPullButton = document.getElementById("gitPullButton");
  const gitPullStatus = document.getElementById("gitPullStatus");
  const resolvedDir = resolvedProjectDir || "";
  const autoPullParam = "skipAutoGitPull";
  const urlSearchParams = new URLSearchParams(window.location.search);

  const showStatus = (text, kind) => {
    if (!gitPullStatus) return;
    gitPullStatus.textContent = text;
    gitPullStatus.classList.remove("error", "success");
    if (kind) gitPullStatus.classList.add(kind);
  };

  const reloadWithSkipFlag = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(autoPullParam, "1");
      // Use replace to avoid adding to history and prevent repeated auto pulls
      window.location.replace(url.toString());
    } catch (e) {
      console.error("[DEBUG] reload failed", e);
      window.location.reload(true);
    }
  };

  let isGitPullInFlight = false;
  const gitPullOverlay = document.getElementById("gitPullOverlay");

  const showGitPullOverlay = (show) => {
    try {
      if (!gitPullOverlay) return;
      gitPullOverlay.style.display = show ? 'flex' : 'none';
      gitPullOverlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    } catch (e) { }
  };

  const triggerGitPull = () => {
    if (isGitPullInFlight) {
      return;
    }
    if (!resolvedDir) {
      showStatus("No project directory specified", "error");
      return;
    }
    isGitPullInFlight = true;
    showStatus("Running git pull...", null);
    showGitPullOverlay(true);
    fetch("/agent/git-pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectDir: resolvedDir }),
    })
      .then((r) =>
        r
          .json()
          .catch(() => ({}))
          .then((j) => ({ ok: r.ok, status: r.status, body: j }))
      )
      .then((res) => {
        if (!res.ok) {
          const msg = (res.body && res.body.error) || `git pull failed (${res.status})`;
          showStatus(msg, "error");
          return;
        }
        const out = (res.body && (res.body.output || res.body.message || res.body.stdout)) || "";
        const firstLine = (out || "")
          .split("\n")
          .slice(0, 2)
          .join(" ");
        showStatus(firstLine || "Git pull completed", "success");
        setTimeout(reloadWithSkipFlag, 800);
      })
      .catch((err) => {
        showStatus("Git pull request failed", "error");
        console.error("[ERROR] git-pull:", err);
      })
      .finally(() => {
        isGitPullInFlight = false;
        showGitPullOverlay(false);
      });
  };

  if (gitPullButton) {
    gitPullButton.addEventListener("click", triggerGitPull);
  }

  const autoPullSkipped = urlSearchParams.get(autoPullParam) === "1";
  if (!autoPullSkipped && gitPullButton) {
    // Automatically trigger the same behavior as clicking the Git Pull button on initial load
    window.addEventListener("load", () => {
      triggerGitPull();
    });
  }

})();
