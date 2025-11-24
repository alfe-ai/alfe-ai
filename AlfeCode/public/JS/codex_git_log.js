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

  const makeCommitListClickable = () => {
    if (!repoName && !resolvedProjectDir) {
      return;
    }
    const listItems = document.querySelectorAll("#gitCommitList li");
    if (!listItems.length) {
      return;
    }

    // Build hash -> parent map from commit graph data
    const hashToParent = new Map();
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
      hashToParent.set(commitHash.toLowerCase(), {
        hash: commitHash,
        parent: primaryParent,
      });
    });

    // Helper to replace the first occurrence of the hash inside a Text node with an anchor
    const replaceHashWithAnchor = (item, hash, diffUrl) => {
      if (!item || !hash || !diffUrl) return false;

      // Walk child nodes to find a Text node containing the hash
      for (let idx = 0; idx < item.childNodes.length; idx++) {
        const node = item.childNodes[idx];
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.nodeValue || '';
        const pos = text.indexOf(hash);
        if (pos === -1) continue;

        // Split the text node into before, match, after
        const before = text.slice(0, pos);
        const after = text.slice(pos + hash.length);

        const doc = item.ownerDocument || document;
        const beforeNode = doc.createTextNode(before);
        const anchor = doc.createElement('a');
        anchor.href = diffUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = hash;
        anchor.classList.add('git-commit-link');
        const afterNode = doc.createTextNode(after);

        // Replace the original text node with before + anchor + after
        item.replaceChild(afterNode, node);
        item.insertBefore(anchor, afterNode);
        if (before) item.insertBefore(beforeNode, anchor);

        return true;
      }

      // If we didn't find a text node, try a naive replacement of innerText
      const rawText = item.textContent || '';
      const idxHash = rawText.indexOf(hash);
      if (idxHash === -1) return false;

      item.textContent = '';
      const a = document.createElement('a');
      a.href = diffUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = hash;
      a.classList.add('git-commit-link');
      const trailing = rawText.slice(idxHash + hash.length);
      const leading = rawText.slice(0, idxHash);
      if (leading) item.appendChild(document.createTextNode(leading));
      item.appendChild(a);
      if (trailing) item.appendChild(document.createTextNode(trailing));
      return true;
    };

    listItems.forEach((item) => {
      if (!item || item.dataset.hashLinked === "true") {
        return;
      }
      const rawText = item.textContent || "";
      const match = rawText.match(/\b[0-9a-f]{7,40}\b/i);
      if (!match) {
        return;
      }
      const matchedHash = match[0];
      const mappedEntry = hashToParent.get(matchedHash.toLowerCase()) || null;
      const lookupHash = mappedEntry ? mappedEntry.hash : matchedHash;
      const parentHash = mappedEntry ? mappedEntry.parent : null;
      const diffUrl = buildDiffUrl(lookupHash, parentHash);
      if (!diffUrl) {
        return;
      }

      const replaced = replaceHashWithAnchor(item, matchedHash, diffUrl);
      if (replaced) {
        item.dataset.hashLinked = "true";
      }
    });
  };

  makeCommitListClickable();

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
          makeCommitListClickable();
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

  const gitPullButton = document.getElementById('gitPullButton');
  const gitPullStatus = document.getElementById('gitPullStatus');
  const resolvedDir = resolvedProjectDir || '';

  const showStatus = (text, kind) => {
    if (!gitPullStatus) return;
    gitPullStatus.textContent = text;
    gitPullStatus.classList.remove('error','success');
    if (kind) gitPullStatus.classList.add(kind);
  };

  if (gitPullButton) {
    gitPullButton.addEventListener('click', () => {
      if (!resolvedDir) {
        showStatus('No project directory specified', 'error');
        return;
      }
      showStatus('Running git pull...', null);
      fetch('/agent/git-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: resolvedDir }),
      })
        .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, status: r.status, body: j })))
        .then((res) => {
          if (!res.ok) {
            const msg = (res.body && res.body.error) || `git pull failed (${res.status})`;
            showStatus(msg, 'error');
            return;
          }
          const out = res.body && (res.body.output || res.body.message || res.body.stdout) || '';
          const firstLine = (out || '').split('\n').slice(0,2).join(' ');
          showStatus(firstLine || 'Git pull completed', 'success');
        })
        .catch((err) => {
          showStatus('Git pull request failed', 'error');
          console.error('[ERROR] git-pull:', err);
        });
    });
  }

})();
