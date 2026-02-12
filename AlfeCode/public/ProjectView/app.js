const tabsContainer = document.getElementById('tabs');
const sterlingTabsContainer = document.getElementById('sterling-tabs');
const sterlingTabsRow = document.getElementById('sterling-tabs-row');
const taskTableBody = document.getElementById('task-table-body');
const projectTitle = document.getElementById('project-title');
const addTaskButton = document.getElementById('add-task');
const addTaskTopButton = document.getElementById('add-task-top');
const saveButton = document.getElementById('save-projects');
const statusMessage = document.getElementById('status-message');
const archiveProjectButton = document.getElementById('archive-project');
const renameProjectButton = document.getElementById('rename-project');
const newProjectButton = document.getElementById('new-project');
const newProjectDialog = document.getElementById('new-project-dialog');
const newProjectForm = document.getElementById('new-project-form');
const newProjectNameInput = document.getElementById('new-project-name');
const newProjectCancelButton = document.getElementById('new-project-cancel');
const archivedProjectsSection = document.getElementById('archived-projects');
const archivedProjectsList = document.getElementById('archived-projects-list');
const archivedProjectsEmpty = document.getElementById('archived-projects-empty');
const archivedProjectsCount = document.getElementById('archived-projects-count');
const loggedOutState = document.getElementById('logged-out-state');
const loggedOutLoginButton = document.getElementById('logged-out-login');
const appContainer = document.querySelector('.app');
const jsonPathDisplay = document.getElementById('json-path-display');
const jsonPathSettingsButton = document.getElementById('json-path-settings');
const jsonPathSettingsDialog = document.getElementById('json-path-settings-dialog');
const jsonPathSettingsForm = document.getElementById('json-path-settings-form');
const jsonPathInput = document.getElementById('json-path-input');
const jsonPathSettingsCancel = document.getElementById('json-path-settings-cancel');
const isDialogSupported = Boolean(
  newProjectDialog && typeof newProjectDialog.showModal === 'function',
);

// JSON Path Management
const JSON_PATH_COOKIE = 'projectview_json_path';
const DEFAULT_JSON_PATH = '/data/projectView/projects.json';

function getJsonPathFromCookie() {
  if (typeof document === 'undefined') {
    return DEFAULT_JSON_PATH;
  }

  const path = getCookieValue(JSON_PATH_COOKIE);
  return path || DEFAULT_JSON_PATH;
}

function setJsonPathCookie(path) {
  if (typeof document === 'undefined') {
    return;
  }

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${JSON_PATH_COOKIE}=${encodeURIComponent(path)}; expires=${expires.toUTCString()}; path=/`;
}

function updateJsonPathDisplay() {
  const currentPath = getJsonPathFromCookie();
  if (jsonPathDisplay) {
    jsonPathDisplay.textContent = currentPath;
  }
}

async function saveJsonPathToServer(path) {
  try {
    const response = await fetch('/ProjectView/api/jsonpath', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': getSessionIdCookie() || ''
      },
      body: JSON.stringify({ path })
    });

    if (!response.ok) {
      throw new Error('Failed to save JSON path to server');
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving JSON path:', error);
    showStatus('Failed to save JSON path settings.', 'error');
    return false;
  }
}

function openJsonPathSettingsDialog() {
  if (!jsonPathSettingsDialog) {
    return;
  }

  if (!isDialogSupported || !jsonPathSettingsDialog) {
    const currentPath = getJsonPathFromCookie();
    const newPath = window.prompt('Enter new JSON file path', currentPath);
    if (newPath !== null) {
      setJsonPathCookie(newPath);
      updateJsonPathDisplay();
      showStatus(`JSON path updated to: ${newPath}`, 'success');
    }
    return;
  }

  if (jsonPathSettingsDialog.open) {
    return;
  }

  if (jsonPathSettingsForm) {
    jsonPathSettingsForm.reset();
  }

  if (jsonPathInput) {
    jsonPathInput.value = getJsonPathFromCookie();
    jsonPathInput.setCustomValidity('');
  }

  jsonPathSettingsDialog.showModal();

  window.requestAnimationFrame(() => {
    if (jsonPathInput) {
      jsonPathInput.focus();
    }
  });
}

function closeJsonPathSettingsDialog() {
  if (!jsonPathSettingsDialog) {
    return;
  }

  if (isDialogSupported && jsonPathSettingsDialog.open) {
    jsonPathSettingsDialog.close();
  }

  if (jsonPathSettingsForm) {
    jsonPathSettingsForm.reset();
  }

  if (jsonPathInput) {
    jsonPathInput.setCustomValidity('');
  }
}

async function handleJsonPathFormSubmit(event) {
  event.preventDefault();

  if (!jsonPathInput) {
    return;
  }

  const newPath = jsonPathInput.value.trim();
  if (!newPath) {
    jsonPathInput.setCustomValidity('JSON path cannot be empty.');
    jsonPathInput.reportValidity();
    return;
  }

  setJsonPathCookie(newPath);
  updateJsonPathDisplay();
  closeJsonPathSettingsDialog();

  // Save to server
  const success = await saveJsonPathToServer(newPath);
  if (success) {
    showStatus(`JSON path updated to: ${newPath}`, 'success');
    // Reload projects with new path
    await loadProjects();
  }
}

const PINNED_PROJECT = Object.freeze({
  id: 'pinned-project',
  name: 'Admin Tasks',
  tasks: [
    {
      id: 'AD-1',
      title: 'Admin Tasks',
      completed: false,
    },
  ],
});

function cloneTasks(tasks) {
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .filter((task) => task && typeof task === 'object')
    .map((task) => ({ ...task }));
}

function isSterlingGitProject(project) {
  if (!project || typeof project !== 'object') {
    return false;
  }

  if (
    project.isSterlingGitProject ||
    project.isSterlingGit ||
    project.sterlingGitProject ||
    (typeof project.source === 'string' && project.source.toLowerCase().includes('sterling-git'))
  ) {
    return true;
  }

  const typeCandidates = [project.type, project.category, project.projectType];
  if (
    typeCandidates.some(
      (value) => typeof value === 'string' && value.toLowerCase().includes('sterling'),
    )
  ) {
    return true;
  }

  const tagSets = [project.tags, project.labels];
  if (
    tagSets.some(
      (tags) =>
        Array.isArray(tags) &&
        tags.some((tag) => typeof tag === 'string' && tag.toLowerCase().includes('sterling')),
    )
  ) {
    return true;
  }

  const metadata = project.metadata && typeof project.metadata === 'object' ? project.metadata : null;
  if (metadata) {
    if (
      metadata.isSterlingGitProject ||
      metadata.isSterlingGit ||
      metadata.sterlingGitProject
    ) {
      return true;
    }

    const metadataTypeCandidates = [metadata.type, metadata.category, metadata.source];
    if (
      metadataTypeCandidates.some(
        (value) => typeof value === 'string' && value.toLowerCase().includes('sterling'),
      )
    ) {
      return true;
    }

    if (
      Array.isArray(metadata.tags) &&
      metadata.tags.some(
        (tag) => typeof tag === 'string' && tag.toLowerCase().includes('sterling'),
      )
    ) {
      return true;
    }
  }

  const gitIndicators = [
    project.gitRepoLocalPath,
    project.gitRepoNameCLI,
    project.gitRepoName,
    project.repoLocalPath,
  ];

  return gitIndicators.some((value) => typeof value === 'string' && value.trim() !== '');
}

function getVisibleProjectIndices() {
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects.reduce((indices, project, index) => {
    if (project && (!project.archived || project.isPinned)) {
      indices.push(index);
    }
    return indices;
  }, []);
}

function resolveVisibleIndex(preferredIndex, visibleIndices) {
  if (!Array.isArray(visibleIndices) || visibleIndices.length === 0) {
    return -1;
  }

  if (visibleIndices.includes(preferredIndex)) {
    return preferredIndex;
  }

  const sorted = [...visibleIndices].sort((a, b) => a - b);
  for (const index of sorted) {
    if (index > preferredIndex) {
      return index;
    }
  }

  return sorted[sorted.length - 1];
}

let projects = [];
let activeProjectIndex = 0;
let dragSourceIndex = null;
let currentDropTargetRow = null;

const ACTIVE_PROJECT_COOKIE = 'projectview_active_project';
const LOGGED_OUT_PLAN = 'Logged-out Session';

function getCookieValue(name) {
  if (typeof document === 'undefined' || !name) {
    return null;
  }

  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    if (!cookie) {
      continue;
    }

    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex);
    if (cookieName === name) {
      return decodeURIComponent(cookie.slice(separatorIndex + 1));
    }
  }

  return null;
}

function isLoggedOutPlan(plan) {
  return (plan || '').toString().trim() === LOGGED_OUT_PLAN;
}

function setLoggedOutState(isLoggedOut) {
  if (loggedOutState) {
    loggedOutState.hidden = !isLoggedOut;
  }
  if (appContainer) {
    appContainer.hidden = isLoggedOut;
  }
}

function getSessionIdCookie() {
  return getCookieValue('sessionId');
}

async function isLoggedOutSession() {
  try {
    const sessionId = getSessionIdCookie();
    const url = '/api/account' + (sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '');
    const response = await fetch(url);
    if (response.status === 401) {
      return true;
    }
    const payload = await response.json().catch(() => null);
    return Boolean(payload && isLoggedOutPlan(payload.plan));
  } catch (error) {
    console.warn('[ProjectView] Unable to check account status:', error);
    return false;
  }
}

function getProjectIdFromPath() {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') return null;
  try {
    const m = window.location.pathname.match(/\/ProjectView\/([^\/\?#]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch (e) {}
  return null;
}

function updateUrlForActiveProject(replace = true) {
  if (typeof window === 'undefined' || !window.history || !Array.isArray(projects)) return;
  const project = projects[activeProjectIndex];
  const base = '/ProjectView';
  let newPath = base;
  if (project && project.id) newPath = base + '/' + encodeURIComponent(project.id);
  else newPath = base + '/';
  try {
    if (replace) window.history.replaceState({}, '', newPath);
    else window.history.pushState({}, '', newPath);
  } catch (err) {
    // ignore
  }
}
function setActiveProjectCookie(projectId) {
  if (typeof document === 'undefined') {
    return;
  }

  if (projectId) {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `${ACTIVE_PROJECT_COOKIE}=${encodeURIComponent(
      projectId,
    )}; expires=${expires.toUTCString()}; path=/`;
  } else {
    document.cookie = `${ACTIVE_PROJECT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

function getStoredActiveProjectId() {
  return getCookieValue(ACTIVE_PROJECT_COOKIE);
}

function setActiveProjectIndex(index) {
  if (!Array.isArray(projects) || projects.length === 0) {
    activeProjectIndex = 0;
    setActiveProjectCookie('');
    return;
  }

  const visibleIndices = getVisibleProjectIndices();
  if (visibleIndices.length === 0) {
    activeProjectIndex = 0;
    setActiveProjectCookie('');
    return;
  }

  let preferredIndex = Number(index);
  if (!Number.isInteger(preferredIndex)) {
    preferredIndex = visibleIndices[0];
  }

  const resolvedIndex = resolveVisibleIndex(preferredIndex, visibleIndices);
  activeProjectIndex = resolvedIndex === -1 ? visibleIndices[0] : resolvedIndex;

  const activeProject = projects[activeProjectIndex];
  if (activeProject && activeProject.id) {
    setActiveProjectCookie(activeProject.id);
  } else {
    setActiveProjectCookie('');
  }
  updateUrlForActiveProject();
}

function setDropTargetRow(row) {
  if (currentDropTargetRow === row) {
    return;
  }

  if (currentDropTargetRow) {
    currentDropTargetRow.classList.remove('task-table__row--drop-target');
  }

  currentDropTargetRow = row || null;

  if (currentDropTargetRow) {
    currentDropTargetRow.classList.add('task-table__row--drop-target');
  }
}

function clearDropTargetRow() {
  setDropTargetRow(null);
}

function handleTaskTableDragStart(event) {
  const handle = event.target.closest('.task-table__drag-handle');
  if (!handle) {
    return;
  }

  const row = handle.closest('tr');
  if (!row || typeof row.dataset.index === 'undefined') {
    return;
  }

  const index = Number(row.dataset.index);
  if (Number.isNaN(index)) {
    return;
  }

  dragSourceIndex = index;
  row.classList.add('task-table__row--dragging');

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    try {
      event.dataTransfer.setDragImage(row, 20, 20);
    } catch (error) {
      // Ignore if setDragImage is not supported
    }
  }
}

function handleTaskTableDragEnd(event) {
  const handle = event.target.closest('.task-table__drag-handle');
  if (!handle) {
    return;
  }

  const row = handle.closest('tr');
  if (row) {
    row.classList.remove('task-table__row--dragging');
  }

  dragSourceIndex = null;
  clearDropTargetRow();
}

function handleTaskTableDragOver(event) {
  if (dragSourceIndex === null) {
    return;
  }

  const row = event.target.closest('tr');
  if (!row || typeof row.dataset.index === 'undefined') {
    return;
  }

  const index = Number(row.dataset.index);
  if (Number.isNaN(index) || index === dragSourceIndex) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }

  setDropTargetRow(row);
}

function handleTaskTableDragLeave(event) {
  if (dragSourceIndex === null) {
    return;
  }

  const row = event.target.closest('tr');
  if (!row) {
    return;
  }

  const related = event.relatedTarget;
  if (related && row.contains(related)) {
    return;
  }

  if (row === currentDropTargetRow) {
    row.classList.remove('task-table__row--drop-target');
    currentDropTargetRow = null;
  }
}

function handleTaskTableDrop(event) {
  if (dragSourceIndex === null) {
    return;
  }

  const row = event.target.closest('tr');
  if (!row || typeof row.dataset.index === 'undefined') {
    return;
  }

  event.preventDefault();

  const targetIndex = Number(row.dataset.index);
  if (Number.isNaN(targetIndex) || targetIndex === dragSourceIndex) {
    const draggingRow = taskTableBody.querySelector('.task-table__row--dragging');
    if (draggingRow) {
      draggingRow.classList.remove('task-table__row--dragging');
    }
    dragSourceIndex = null;
    clearDropTargetRow();
    return;
  }

  const project = projects[activeProjectIndex];
  if (!project || !Array.isArray(project.tasks)) {
    dragSourceIndex = null;
    clearDropTargetRow();
    return;
  }

  const tasks = project.tasks;
  const [movedTask] = tasks.splice(dragSourceIndex, 1);
  let insertionIndex = targetIndex;
  if (dragSourceIndex < targetIndex) {
    insertionIndex -= 1;
  }
  tasks.splice(insertionIndex, 0, movedTask);

  dragSourceIndex = null;
  clearDropTargetRow();
  renderTasks();
  scheduleSave();
}


if (taskTableBody) {
  taskTableBody.addEventListener('dragstart', handleTaskTableDragStart);
  taskTableBody.addEventListener('dragend', handleTaskTableDragEnd);
  taskTableBody.addEventListener('dragover', handleTaskTableDragOver);
  taskTableBody.addEventListener('dragleave', handleTaskTableDragLeave);
  taskTableBody.addEventListener('drop', handleTaskTableDrop);
}

function ensurePinnedProject(projectList) {
  const validProjects = Array.isArray(projectList)
    ? projectList.filter((project) => project && typeof project === 'object')
    : [];

  const existingPinned =
    validProjects.find((project) => project.id === PINNED_PROJECT.id) ||
    validProjects.find((project) => project.isPinned);

  const pinnedSource = existingPinned || PINNED_PROJECT;
  const pinnedTasks = Array.isArray(pinnedSource.tasks)
    ? cloneTasks(pinnedSource.tasks)
    : cloneTasks(PINNED_PROJECT.tasks);

  const pinnedProject = {
    ...pinnedSource,
    id: PINNED_PROJECT.id,
    name: (pinnedSource && pinnedSource.name) ? pinnedSource.name : PINNED_PROJECT.name,
    isPinned: true,
    archived: false,
    tasks: pinnedTasks,
  };

  const remainingProjects = validProjects
    .filter(
      (project) => project !== existingPinned && project.id !== PINNED_PROJECT.id,
    )
    .map((project) => ({
      ...project,
      isPinned: false,
      archived: Boolean(project.archived),
      tasks: cloneTasks(project.tasks),
    }));

  return [pinnedProject, ...remainingProjects];
}

function isProjectNameTaken(name) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return projects.some(
    (project) =>
      project &&
      typeof project.name === 'string' &&
      project.name.trim().toLowerCase() === normalized,
  );
}

function generateProjectIdFromName(name) {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const baseId = normalized || 'project';
  const existingIds = new Set(
    Array.isArray(projects) ? projects.map((project) => project.id) : [],
  );

  let candidate = baseId;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function createProject(name) {
  if (!name || !name.trim()) {
    showStatus('Project name cannot be empty.', 'error');
    return false;
  }

  const trimmedName = name.trim();

  if (isProjectNameTaken(trimmedName)) {
    showStatus(`A project named ${trimmedName} already exists.`, 'error');
    return false;
  }

  projects = ensurePinnedProject(projects);

  const projectId = generateProjectIdFromName(trimmedName);
  const newProject = {
    id: projectId,
    name: trimmedName,
    tasks: [],
    archived: false,
  };

  projects.push(newProject);
  setActiveProjectIndex(projects.length - 1);
  renderTabs();
  renderTasks();
  renderArchivedProjectsList();
  showStatus(`Created project ${trimmedName}.`, 'success');
  scheduleSave();
  return true;
}

function closeNewProjectDialog() {
  if (!newProjectDialog) {
    return;
  }

  if (isDialogSupported && newProjectDialog.open) {
    newProjectDialog.close();
  }

  if (newProjectForm) {
    newProjectForm.reset();
  }

  if (newProjectNameInput) {
    newProjectNameInput.setCustomValidity('');
  }
}

function openNewProjectDialog() {
  if (!newProjectButton) {
    return;
  }

  if (!isDialogSupported || !newProjectDialog) {
    const fallbackName = window.prompt('Enter a name for the new project');
    if (fallbackName !== null) {
      createProject(fallbackName);
    }
    return;
  }

  if (newProjectDialog.open) {
    return;
  }

  if (newProjectForm) {
    newProjectForm.reset();
  }

  if (newProjectNameInput) {
    newProjectNameInput.setCustomValidity('');
  }

  newProjectDialog.showModal();

  window.requestAnimationFrame(() => {
    if (newProjectNameInput) {
      newProjectNameInput.focus();
    }
  });
}

async function loadProjects() {
  try {
    const jsonPath = getJsonPathFromCookie();
    const response = await fetch('/ProjectView/api/projects' + (getSessionIdCookie() ? ('?sessionId='+encodeURIComponent(getSessionIdCookie())) : '') + '&jsonPath=' + encodeURIComponent(jsonPath));
    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }
    const projectData = await response.json();
    projects = ensurePinnedProject(projectData);
    const pathProjectId = getProjectIdFromPath();
    const storedProjectId = getStoredActiveProjectId();
    const desiredId = pathProjectId || storedProjectId;
    if (desiredId) {
      const storedIndex = projects.findIndex(
        (project) => project && project.id === desiredId,
      );
      if (storedIndex !== -1) {
        setActiveProjectIndex(storedIndex);
      } else {
        setActiveProjectIndex(0);
      }
    } else {
      setActiveProjectIndex(0);
    }
    renderTabs();
    renderTasks();
    renderArchivedProjectsList();
  } catch (error) {
    console.error(error);
    projects = ensurePinnedProject([]);
    setActiveProjectIndex(0);
    renderTabs();
    renderTasks();
    renderArchivedProjectsList();
    showStatus('Unable to load projects. Please refresh the page.', 'error');
  }
}

function createTabItem(project, index) {
  const tabItem = document.createElement('div');
  tabItem.className = 'tabs__item';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = project.name;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', index === activeProjectIndex ? 'true' : 'false');
  if (project.isPinned) {
    button.classList.add('tabs__button--pinned');
    button.setAttribute('aria-label', `${project.name} project (pinned)`);
  }
  button.addEventListener('click', () => {
    setActiveProjectIndex(index);
    renderTabs();
    renderTasks();
    renderArchivedProjectsList();
    showStatus('', '');
  });
  tabItem.appendChild(button);

  return tabItem;
}

function renderTabGroup(container, entries, emptyMessage) {
  if (!container) {
    return false;
  }

  container.innerHTML = '';

  if (!Array.isArray(entries) || entries.length === 0) {
    if (emptyMessage) {
      const placeholder = document.createElement('p');
      placeholder.className = 'tabs__empty';
      placeholder.textContent = emptyMessage;
      container.appendChild(placeholder);
    }
    return false;
  }

  entries.forEach(({ project, index }) => {
    container.appendChild(createTabItem(project, index));
  });

  return true;
}

function renderTabs() {
  const visibleProjects = Array.isArray(projects)
    ? projects
        .map((project, index) => ({ project, index }))
        .filter(
          ({ project }) => project && (!project.archived || project.isPinned),
        )
    : [];

  const sterlingProjects = [];
  const regularProjects = [];

  visibleProjects.forEach((entry) => {
    if (isSterlingGitProject(entry.project) && !entry.project.isPinned) {
      sterlingProjects.push(entry);
    } else {
      regularProjects.push(entry);
    }
  });

  // Temporarily hide the Sterling Git Projects section
  // Render the sterling projects into the container but keep the entire
  // Sterling/Git Projects row hidden for now.
  renderTabGroup(
    sterlingTabsContainer,
    sterlingProjects,
    'No Sterling Git projects yet.',
  );
  if (sterlingTabsRow) {
    sterlingTabsRow.hidden = true;
  }

  renderTabGroup(
    tabsContainer,
    regularProjects,
    'No active projects available.',
  );
}

function updateProjectTitle(project) {
  if (!projectTitle) {
    return;
  }

  projectTitle.textContent = '';

  const projectName = project && project.name ? project.name : 'Untitled Project';
  const trimmedName = projectName.trim();
  const titleText = /tasks?$/i.test(trimmedName)
    ? trimmedName
    : `${trimmedName} Tasks`;

  if (project && project.isPinned) {
    const icon = document.createElement('span');
    icon.className = 'project-title__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📌';
    projectTitle.appendChild(icon);

    const accessibleLabel = document.createElement('span');
    accessibleLabel.className = 'sr-only';
    accessibleLabel.textContent = 'Pinned project: ';
    projectTitle.appendChild(accessibleLabel);
  }

  projectTitle.appendChild(document.createTextNode(titleText));
}

function setAddTaskAvailability(isEnabled, tooltip = '') {
  if (!addTaskButton) {
    return;
  }

  addTaskButton.disabled = !isEnabled;
  addTaskButton.setAttribute('aria-disabled', isEnabled ? 'false' : 'true');
  if (tooltip) {
    addTaskButton.title = tooltip;
  } else {
    addTaskButton.removeAttribute('title');
  }
}

function updateArchiveButton(project) {
  if (!archiveProjectButton) {
    return;
  }

  if (!project) {
    archiveProjectButton.disabled = true;
    archiveProjectButton.setAttribute('aria-disabled', 'true');
    archiveProjectButton.textContent = 'Archive Project';
    archiveProjectButton.title = 'Select a project to archive.';
    return;
  }

  if (project.isPinned) {
    archiveProjectButton.disabled = true;
    archiveProjectButton.setAttribute('aria-disabled', 'true');
    archiveProjectButton.textContent = 'Archive Project';
    archiveProjectButton.title = 'Pinned project cannot be archived.';
    return;
  }

  archiveProjectButton.disabled = false;
  archiveProjectButton.setAttribute('aria-disabled', 'false');
  archiveProjectButton.textContent = 'Archive Project';
  archiveProjectButton.title = `Archive ${project.name || 'this project'}.`;
}

function renderTasks() {
  taskTableBody.innerHTML = '';

  setActiveProjectIndex(activeProjectIndex);

  if (projects.length === 0) {
    if (projectTitle) {
      projectTitle.textContent = 'No projects available';
    }
    setAddTaskAvailability(false, 'Create a project in the JSON file to add tasks.');
    updateArchiveButton(null);
    return;
  }

  const project = projects[activeProjectIndex];
  if (!project) {
    if (projectTitle) {
      projectTitle.textContent = 'Select a project';
    }
    setAddTaskAvailability(false, 'Select a project to add tasks.');
    updateArchiveButton(null);
    return;
  }
  if (project.archived && !project.isPinned) {
    if (projectTitle) {
      projectTitle.textContent = `${project.name || 'Project'} is archived`;
    }
    setAddTaskAvailability(false, 'Restore the project to add or edit tasks.');
    updateArchiveButton(project);
    return;
  }
  updateProjectTitle(project);
  setAddTaskAvailability(true, '');
  updateArchiveButton(project);

  if (!project.tasks || project.tasks.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 5;
    emptyCell.textContent = 'This project has no tasks yet.';
    emptyCell.className = 'task-table__empty';
    emptyRow.appendChild(emptyCell);
    taskTableBody.appendChild(emptyRow);
    return;
  }

  project.tasks.forEach((task, index) => {
    const row = document.createElement('tr');
    row.dataset.index = index;

    const dragCell = document.createElement('td');
    dragCell.className = 'task-table__drag';
    const dragButton = document.createElement('button');
    dragButton.type = 'button';
    dragButton.className = 'task-table__drag-handle';
    dragButton.draggable = true;
    const dragLabelSource =
      (task && typeof task.title === 'string' && task.title.trim()) || task.id;
    dragButton.setAttribute(
      'aria-label',
      `Drag to reorder task ${dragLabelSource || index + 1}`,
    );
    const dragIcon = document.createElement('span');
    dragIcon.className = 'task-table__drag-icon';
    dragIcon.setAttribute('aria-hidden', 'true');
    dragIcon.textContent = '☰';
    dragButton.appendChild(dragIcon);
    dragCell.appendChild(dragButton);
    row.appendChild(dragCell);

    // Task ID column hidden by default
    const idCell = document.createElement('td');
    idCell.className = 'col-task-id--hidden';
    row.appendChild(idCell);

    const titleCell = document.createElement('td');
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = task.title;
    titleInput.addEventListener('input', (event) => {
      project.tasks[index].title = event.target.value;
      scheduleSave();
    });
    titleCell.appendChild(titleInput);
    row.appendChild(titleCell);

    // Done column hidden by default
    const doneCell = document.createElement('td');
    doneCell.className = 'col-done--hidden';
    row.appendChild(doneCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'task-table__actions';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Remove';
    deleteButton.addEventListener('click', () => {
      project.tasks.splice(index, 1);
      renderTasks();
      scheduleSave();
    });
    actionsCell.appendChild(deleteButton);
    row.appendChild(actionsCell);

    taskTableBody.appendChild(row);
  });
}

function renderArchivedProjectsList() {
  if (!archivedProjectsList || !archivedProjectsSection) {
    return;
  }

  const archivedEntries = Array.isArray(projects)
    ? projects
        .map((project, index) => ({ project, index }))
        .filter(({ project }) => project && project.archived && !project.isPinned)
    : [];

  archivedProjectsList.innerHTML = '';

  if (archivedProjectsCount) {
    archivedProjectsCount.textContent = `(${archivedEntries.length})`;
  }

  if (archivedProjectsEmpty) {
    archivedProjectsEmpty.style.display = archivedEntries.length === 0 ? 'block' : 'none';
  }

  archivedProjectsList.hidden = archivedEntries.length === 0;

  if (archivedEntries.length === 0) {
    archivedProjectsSection.open = false;
    return;
  }

  archivedEntries.forEach(({ project, index }) => {
    const listItem = document.createElement('li');
    listItem.className = 'archived-projects__item';

    const name = document.createElement('span');
    name.className = 'archived-projects__name';
    name.textContent = project.name || project.id || 'Untitled Project';
    listItem.appendChild(name);

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'archived-projects__restore';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => {
      unarchiveProject(index);
    });
    listItem.appendChild(restoreBtn);

    archivedProjectsList.appendChild(listItem);
  });
}

function archiveProject(index) {
  const project = projects[index];
  if (!project || project.isPinned || project.archived) {
    return;
  }

  const projectName = project.name || 'Project';
  project.archived = true;

  setActiveProjectIndex(index);
  renderTabs();
  renderTasks();
  renderArchivedProjectsList();

  if (archivedProjectsSection) {
    archivedProjectsSection.open = true;
  }

  showStatus(`Archived ${projectName}.`, 'success');
  scheduleSave();
}

function unarchiveProject(index) {
  const project = projects[index];
  if (!project || project.isPinned || !project.archived) {
    return;
  }

  const projectName = project.name || 'Project';
  project.archived = false;

  setActiveProjectIndex(index);
  renderTabs();
  renderTasks();
  renderArchivedProjectsList();

  showStatus(`Restored ${projectName}.`, 'success');
  scheduleSave();
}

function generateTaskId(project) {
  const prefix = project.id.toUpperCase().slice(0, 2) || 'TS';
  const existingIds = new Set((project.tasks || []).map((task) => task.id));
  let counter = 1;
  let candidate;
  do {
    candidate = `${prefix}-${String(counter).padStart(2, '0')}`;
    counter += 1;
  } while (existingIds.has(candidate));
  return candidate;
}

addTaskButton.addEventListener('click', () => {
  if (projects.length === 0) {
    showStatus('Create a project in the JSON file to add tasks.', 'error');
    return;
  }

  const project = projects[activeProjectIndex];
  if (!project || (project.archived && !project.isPinned)) {
    showStatus('Restore the project before adding tasks.', 'error');
    return;
  }
  project.tasks = project.tasks || [];
  const newTask = {
    id: generateTaskId(project),
    title: 'New Task',
    completed: false,
  };
  project.tasks.push(newTask);
  renderTasks();
  showStatus(`Added task ${newTask.id} to ${project.name}.`, 'success');
  scheduleSave();
});

// Add task to top button behavior
if (addTaskTopButton) {
  addTaskTopButton.addEventListener('click', () => {
    if (projects.length === 0) {
      showStatus('Create a project in the JSON file to add tasks.', 'error');
      return;
    }
    const project = projects[activeProjectIndex];
    if (!project || (project.archived && !project.isPinned)) {
      showStatus('Restore the project before adding tasks.', 'error');
      return;
    }
    project.tasks = project.tasks || [];
    const newTask = {
      id: generateTaskId(project),
      title: 'New Task',
      completed: false,
    };
    project.tasks.unshift(newTask);
    renderTasks();
    showStatus(`Added task ${newTask.id} to ${project.name}.`, 'success');
    scheduleSave();
  });
}


const addTaskButtonBottom = document.getElementById('add-task-bottom');
if (addTaskButtonBottom && addTaskButton) {
  addTaskButtonBottom.addEventListener('click', () => {
    addTaskButton.click();
  });
}


if (archiveProjectButton) {
  archiveProjectButton.addEventListener('click', () => {
    const project = projects[activeProjectIndex];
    if (!project || project.isPinned || project.archived) {
      return;
    }

    archiveProject(activeProjectIndex);
  });
}

if (renameProjectButton) {
  renameProjectButton.addEventListener('click', () => {
    const project = projects[activeProjectIndex];
    if (!project) return;
    const oldName = project.name || '';
    const newName = window.prompt('Enter new project name', oldName);
    if (newName === null) return;
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      showStatus('Project name cannot be empty.', 'error');
      return;
    }
    const lower = trimmed.toLowerCase();
    const conflict = projects.some(p => p && p.name && p.name.trim().toLowerCase() === lower && p.id !== project.id);
    if (conflict) {
      showStatus(`A project named ${trimmed} already exists.`, 'error');
      return;
    }
    project.name = trimmed;
    renderTabs();
    renderTasks();
    renderArchivedProjectsList();
    scheduleSave();
    showStatus(`Renamed project to ${trimmed}.`, 'success');
  });
}

// Autosave support: debounced save for edits affecting the JSON
let __autosaveTimer = null;
const __AUTOSAVE_DELAY_MS = 800;
let __saveInProgress = false;

function getProjectsForSave() {
  return projects.map((project) => {
    const serialized = {
      id: project.id,
      name: project.name,
      tasks: cloneTasks(project.tasks),
    };

    if (!project.isPinned && project.archived) {
      serialized.archived = true;
    }

    return serialized;
  });
}

async function saveProjectsImmediate() {
  if (__saveInProgress) return;
  __saveInProgress = true;
  try {
    const payload = getProjectsForSave();
    const response = await fetch('/ProjectView/api/projects' + (getSessionIdCookie() ? ('?sessionId='+encodeURIComponent(getSessionIdCookie())) : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Unable to save projects');
    }

    showStatus('Projects saved.', 'success');
  } catch (err) {
    console.error('[Autosave] Failed to save projects:', err);
    showStatus('Autosave failed. Please try saving manually.', 'error');
  } finally {
    __saveInProgress = false;
  }
}

function scheduleSave() {
  if (__autosaveTimer) clearTimeout(__autosaveTimer);
  __autosaveTimer = setTimeout(() => {
    saveProjectsImmediate();
    __autosaveTimer = null;
  }, __AUTOSAVE_DELAY_MS);
}

if (saveButton) {
  saveButton.addEventListener('click', async () => {
    try {
      const payload = getProjectsForSave();
      const response = await fetch('/ProjectView/api/projects' + (getSessionIdCookie() ? ('?sessionId='+encodeURIComponent(getSessionIdCookie())) : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Unable to save projects');
      }

      showStatus('Projects saved successfully.', 'success');
    } catch (error) {
      console.error(error);
      showStatus('Failed to save projects. Please try again.', 'error');
    }
  });
}

let __statusClearTimer = null;

function showStatus(message, type) {
  if (typeof statusMessage === 'undefined' || !statusMessage) return;
  if (__statusClearTimer) {
    clearTimeout(__statusClearTimer);
    __statusClearTimer = null;
  }
  statusMessage.textContent = message;
  statusMessage.classList.remove('success', 'error');
  if (type) {
    statusMessage.classList.add(type);
  }

  // Auto-hide the autosave confirmation after 3 seconds
  if (message === 'Projects saved.') {
    __statusClearTimer = setTimeout(() => {
      if (statusMessage) {
        statusMessage.textContent = '';
        statusMessage.classList.remove('success', 'error');
      }
      __statusClearTimer = null;
    }, 3000);
  }
}

if (newProjectButton) {
  newProjectButton.addEventListener('click', openNewProjectDialog);
}

if (newProjectCancelButton) {
  newProjectCancelButton.addEventListener('click', () => {
    closeNewProjectDialog();
  });
}

if (newProjectDialog && isDialogSupported) {
  newProjectDialog.addEventListener('close', () => {
    if (newProjectForm) {
      newProjectForm.reset();
    }
    if (newProjectNameInput) {
      newProjectNameInput.setCustomValidity('');
    }
  });
}

if (newProjectForm) {
  newProjectForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!newProjectNameInput) {
      return;
    }

    const proposedName = newProjectNameInput.value.trim();

    if (!proposedName) {
      newProjectNameInput.setCustomValidity('Please enter a project name.');
      newProjectNameInput.reportValidity();
      return;
    }

    if (isProjectNameTaken(proposedName)) {
      newProjectNameInput.setCustomValidity(
        'A project with this name already exists.',
      );
      newProjectNameInput.reportValidity();
      showStatus(`A project named ${proposedName} already exists.`, 'error');
      return;
    }

    newProjectNameInput.setCustomValidity('');

    const created = createProject(proposedName);
    if (created) {
      closeNewProjectDialog();
    }
  });
}



// Task Detail modal elements
const taskDetailDialog = document.getElementById('task-detail-dialog');
const taskDetailForm = document.getElementById('task-detail-form');
const taskDescriptionEditor = document.getElementById('task-description-editor');
const taskAttachmentsInput = document.getElementById('task-attachments-input');
const taskAttachmentsList = document.getElementById('task-attachments-list');
const taskDetailCancel = document.getElementById('task-detail-cancel');
const insertImageButton = document.getElementById('insert-image-button');
const insertImageInput = document.getElementById('insert-image-input');

let modalProjectIndex = null;
let modalTaskIndex = null;
let modalAttachments = [];

function openTaskDetailModal(projectIndex, taskIndex) {
  modalProjectIndex = projectIndex;
  modalTaskIndex = taskIndex;
  const project = projects[projectIndex];
  if (!project) return;
  const task = project.tasks[taskIndex];
  if (!task) return;

  // load description
  taskDescriptionEditor.innerHTML = task.description || '';

  // load attachments
  modalAttachments = Array.isArray(task.attachments) ? task.attachments.slice() : [];
  renderAttachmentsList();

  if (taskDetailDialog && typeof taskDetailDialog.showModal === 'function') {
    taskDetailDialog.showModal();
  } else {
    alert('Task detail: ' + (task.title || task.id));
  }
}

function closeTaskDetailModal() {
  if (taskDetailDialog && typeof taskDetailDialog.close === 'function') {
    taskDetailDialog.close();
  }
  modalProjectIndex = null;
  modalTaskIndex = null;
  modalAttachments = [];
  taskDescriptionEditor.innerHTML = '';
  taskAttachmentsList.innerHTML = '';
  taskAttachmentsInput.value = '';
}

function renderAttachmentsList() {
  taskAttachmentsList.innerHTML = '';
  modalAttachments.forEach((att, i) => {
    const item = document.createElement('div');
    item.className = 'attachment-item';
    const img = document.createElement('img');
    img.src = att.data;
    img.alt = att.name || ('attachment-' + i);
    item.appendChild(img);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      modalAttachments.splice(i, 1);
      renderAttachmentsList();
    });
    item.appendChild(removeBtn);
    taskAttachmentsList.appendChild(item);
  });
}

insertImageButton.addEventListener('click', () => {
  insertImageInput.click();
});

insertImageInput.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const data = reader.result;
    document.execCommand('insertImage', false, data);
    // also add to attachments
    modalAttachments.push({ name: f.name, data });
    renderAttachmentsList();
  };
  reader.readAsDataURL(f);
  insertImageInput.value = '';
});

taskAttachmentsInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach((f) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      modalAttachments.push({ name: f.name, data });
      renderAttachmentsList();
    };
    reader.readAsDataURL(f);
  });
  taskAttachmentsInput.value = '';
});

taskDetailCancel.addEventListener('click', (e) => {
  e.preventDefault();
  closeTaskDetailModal();
});

if (taskDetailForm) {
  taskDetailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (modalProjectIndex === null || modalTaskIndex === null) return;
    const project = projects[modalProjectIndex];
    if (!project) return;
    const task = project.tasks[modalTaskIndex];
    if (!task) return;
    task.description = taskDescriptionEditor.innerHTML;
    task.attachments = modalAttachments.slice();
    renderTasks();
    closeTaskDetailModal();
    scheduleSave();
  });
}

// editor toolbar buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-cmd]');
  if (!btn) return;
  const cmd = btn.getAttribute('data-cmd');
  if (!cmd) return;
  document.execCommand(cmd, false, null);
});

// Make Task ID clickable when rendering tasks: replace idCell.textContent assignment


// Download current project JSON (attempt to download full projects array)
const downloadCurrentButton = document.getElementById('download-current-json');
if (downloadCurrentButton) {
  downloadCurrentButton.addEventListener('click', async () => {
    // Prefer downloading the full projects JSON from the API
    try {
      const sessionId = (function(){
        try{ const m = document.cookie.match(/(?:^|;)\s*sessionId=([^;]+)/); return m?decodeURIComponent(m[1]):null }catch(e){return null}
      })();
      const url = '/ProjectView/api/projects' + (sessionId?('?sessionId='+encodeURIComponent(sessionId)): '');
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = 'projectview-projects.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
        showStatus('Download started (full projects).', 'success');
        return;
      }
    } catch (err) {
      console.warn('[Download] Full projects download failed, falling back to single project:', err);
    }

    // Fallback: download the currently selected project only
    try {
      if (!Array.isArray(projects) || projects.length === 0) {
        showStatus('No project available to download.', 'error');
        return;
      }
      const project = projects[activeProjectIndex] || projects[0];
      if (!project) {
        showStatus('No project selected to download.', 'error');
        return;
      }
      const data = JSON.stringify(project, null, 2);
      const blob = new Blob([data], {type: 'application/json'});
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      const base = (project.id || project.name || 'project').toString().replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
      a.download = base + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      showStatus('Download started (single project).', 'success');
    } catch (err) {
      console.error('[Download] Failed to start download', err);
      showStatus('Failed to start download.', 'error');
    }
  });
}

if (loggedOutLoginButton) {
  loggedOutLoginButton.addEventListener('click', () => {
    window.location.href = '/agent';
  });
}

async function initializeProjectView() {
  const isLoggedOut = await isLoggedOutSession();
  if (isLoggedOut) {
    setLoggedOutState(true);
    return;
  }
  setLoggedOutState(false);
  updateJsonPathDisplay();
  await loadProjects();
}

document.addEventListener('DOMContentLoaded', initializeProjectView);

// JSON Path Event Listeners
if (jsonPathSettingsButton) {
  jsonPathSettingsButton.addEventListener('click', openJsonPathSettingsDialog);
}

if (jsonPathSettingsForm) {
  jsonPathSettingsForm.addEventListener('submit', handleJsonPathFormSubmit);
}

if (jsonPathSettingsCancel) {
  jsonPathSettingsCancel.addEventListener('click', closeJsonPathSettingsDialog);
}
