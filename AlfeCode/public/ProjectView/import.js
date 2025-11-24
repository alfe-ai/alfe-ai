(function () {
  const textarea = document.getElementById('project-json');
  const importButton = document.getElementById('import-json');
  const clearButton = document.getElementById('clear-json');
  const status = document.getElementById('status');

  function getCookieValue(name) {
    const header = typeof document === 'undefined' ? '' : (document.cookie || '');
    const cookies = header ? header.split(';') : [];
    for (const rawCookie of cookies) {
      const cookie = rawCookie.trim();
      if (!cookie) continue;
      const idx = cookie.indexOf('=');
      if (idx === -1) continue;
      const key = cookie.slice(0, idx);
      if (key === name) return decodeURIComponent(cookie.slice(idx+1));
    }
    return null;
  }

  function setStatus(message, type) {
    if (!status) {
      return;
    }

    status.textContent = message;
    status.classList.remove('status--error', 'status--success', 'status--info');

    const className =
      type === 'error' ? 'status--error' : type === 'success' ? 'status--success' : 'status--info';

    status.classList.add(className);
  }

  function normalizeProjects(rawProjects) {
    if (!Array.isArray(rawProjects)) {
      throw new Error('Expected a JSON array of projects.');
    }

    return rawProjects.map((project, index) => {
      if (!project || typeof project !== 'object') {
        throw new Error(`Project at index ${index} must be an object.`);
      }

      const normalized = { ...project };

      if (!normalized.tasks) {
        normalized.tasks = [];
      } else if (!Array.isArray(normalized.tasks)) {
        throw new Error(`Project "${normalized.name || index}" tasks must be an array.`);
      } else {
        normalized.tasks = normalized.tasks.map((task, taskIndex) => {
          if (!task || typeof task !== 'object') {
            throw new Error(
              `Task at index ${taskIndex} in project "${normalized.name || index}" must be an object.`,
            );
          }
          return { ...task };
        });
      }

      return normalized;
    });
  }

  async function importProjects() {
    if (!textarea) {
      return;
    }

    const rawText = textarea.value.trim();
    if (!rawText) {
      setStatus('Please paste your ProjectView JSON before importing.', 'error');
      textarea.focus();
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      setStatus(`Invalid JSON: ${error.message}`, 'error');
      return;
    }

    let projects;
    try {
      projects = normalizeProjects(parsed);
    } catch (error) {
      setStatus(error.message, 'error');
      return;
    }

    setStatus('Uploading projects…', 'info');

    try {
      const response = await fetch('../api/projects' + (getCookieValue('sessionId')?('?sessionId='+encodeURIComponent(getCookieValue('sessionId'))):''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projects),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.message || `Server responded with ${response.status}`;
        throw new Error(message);
      }

      setStatus('Projects imported successfully.', 'success');
    } catch (error) {
      setStatus(`Failed to import projects: ${error.message}`, 'error');
    }
  }

  function clearTextarea() {
    if (!textarea) {
      return;
    }

    textarea.value = '';
    setStatus('Waiting for input…', 'info');
    textarea.focus();
  }

  if (importButton) {
    importButton.addEventListener('click', importProjects);
  }

  if (clearButton) {
    clearButton.addEventListener('click', clearTextarea);
  }

  if (textarea) {
    textarea.addEventListener('input', () => {
      if (textarea.value.trim()) {
        setStatus('Ready to import.', 'info');
      } else {
        setStatus('Waiting for input…', 'info');
      }
    });
  }

  const downloadButton = document.getElementById('download-json');

  async function downloadProjects() {
    setStatus('Fetching projects…', 'info');
    try {
      const res = await fetch('../api/projects' + (getCookieValue('sessionId')?('?sessionId='+encodeURIComponent(getCookieValue('sessionId'))):''));
      if (!res.ok) throw new Error('Server responded '+res.status);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'projectview-projects.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Download started.', 'success');
    } catch (err) {
      setStatus('Failed to fetch projects: '+err.message, 'error');
    }
  }

  if (downloadButton) {
    downloadButton.addEventListener('click', downloadProjects);
  }

})();
