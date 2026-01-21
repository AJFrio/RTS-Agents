/**
 * RTS Agents Dashboard - Main Application
 * Tactical Sandstorm Theme v1.0
 */

// ============================================ 
// State Management
// ============================================ 

const state = {
  agents: [],
  filteredAgents: [],
  currentView: 'dashboard',
  filters: {
    providers: {
      gemini: true,
      jules: true,
      cursor: true,
      codex: true,
      'claude-cli': true,
      'claude-cloud': true
    },
    statuses: {
      running: true,
      completed: true,
      pending: true,
      failed: true,
      stopped: true
    },
    search: ''
  },
  settings: {
    pollingInterval: 30000,
    autoPolling: true,
    geminiPaths: [],
    claudePaths: [],
    cursorPaths: [],
    codexPaths: [],
    theme: 'system',
    displayMode: 'fullscreen'
  },
  counts: {
    gemini: 0,
    jules: 0,
    cursor: 0,
    codex: 0,
    'claude-cli': 0,
    'claude-cloud': 0,
    total: 0
  },
  // Track which services are configured/available
  configuredServices: {
    gemini: false,
    jules: false,
    cursor: false,
    codex: false,
    'claude-cli': false,
    'claude-cloud': false,
    github: false,
    jira: false
  },
  // Track detailed capabilities (cloud vs local)
  capabilities: {
    gemini: { cloud: false, local: false },
    jules: { cloud: false, local: false },
    cursor: { cloud: false, local: false },
    codex: { cloud: false, local: false },
    claude: { cloud: false, local: false },
    github: { cloud: false, local: false }
  },
  loading: false,
  errors: [],
  // New task modal state
  newTask: {
    selectedService: null,
    targetDevice: null, // null = local, object = remote device
    repositories: [],
    loadingRepos: false,
    creating: false,
    promptMode: 'write', // 'write' | 'preview'
    pastedImages: [] // [{ id, name, mimeType, size, dataUrl }]
  },
  // Create repo modal state
  createRepo: {
    open: false,
    location: 'github', // 'github' | 'local' | 'remote'
    name: '',
    githubOwner: '',
    githubPrivate: false,
    localDir: '',
    remoteDeviceId: '',
    loading: false
  },
  // Pagination state
  pagination: {
    currentPage: 1,
    pageSize: 50,
    totalPages: 1
  },
  // GitHub state
  github: {
    repos: [],
    filteredRepos: [],
    selectedRepo: null,
    prs: [],
    loadingRepos: false,
    loadingPrs: false,
    currentPr: null,
    prFilter: 'open'
  },
  // Computers state (Cloudflare KV)
  computers: {
    list: [],
    loading: false,
    configured: false
  },
  // Jira state
  jira: {
    boards: [],
    issues: [],
    selectedBoardId: null,
    loading: false,
    error: null
  },
  localDeviceId: null
};

// In production, `window.electronAPI` is provided by `preload.js` via contextBridge and is not writable.
// For automated tests, we allow providing a mock via `window.__electronAPI`.
function getElectronAPI() {
  return window.__electronAPI || window.electronAPI;
}

// ============================================ 
// DOM Elements
// ============================================ 

const elements = {
  // Views
  viewDashboard: document.getElementById('view-dashboard'),
  viewSettings: document.getElementById('view-settings'),
  viewBranches: document.getElementById('view-branches'),
  viewComputers: document.getElementById('view-computers'),
  viewJira: document.getElementById('view-jira'),
  viewTitle: document.getElementById('view-title'),
  sidenavProviders: document.getElementById('sidenav-providers'),
  sidenavStatus: document.getElementById('sidenav-status'),
  
  // Dashboard
  agentsGrid: document.getElementById('agents-grid'),
  loadingState: document.getElementById('loading-state'),
  emptyState: document.getElementById('empty-state'),
  errorBanner: document.getElementById('error-banner'),
  errorList: document.getElementById('error-list'),
  totalCount: document.getElementById('total-count'),
  
  // Pagination
  paginationControls: document.getElementById('pagination-controls'),
  paginationInfo: document.getElementById('pagination-info'),
  pageIndicator: document.getElementById('page-indicator'),
  prevPageBtn: document.getElementById('prev-page-btn'),
  nextPageBtn: document.getElementById('next-page-btn'),
  
  // Filters
  searchInput: document.getElementById('search-input'),
  refreshBtn: document.getElementById('refresh-btn'),
  refreshIcon: document.getElementById('refresh-icon'),
  
  // Provider counts
  countGemini: document.getElementById('count-gemini'),
  countJules: document.getElementById('count-jules'),
  countCursor: document.getElementById('count-cursor'),
  countCodex: document.getElementById('count-codex'),
  countClaudeCli: document.getElementById('count-claude-cli'),
  countClaudeCloud: document.getElementById('count-claude-cloud'),
  
  // Status indicators
  statusGemini: document.getElementById('status-gemini'),
  statusJules: document.getElementById('status-jules'),
  statusCursor: document.getElementById('status-cursor'),
  statusCodex: document.getElementById('status-codex'),
  statusClaudeCli: document.getElementById('status-claude-cli'),
  statusClaudeCloud: document.getElementById('status-claude-cloud'),
  statusGithub: document.getElementById('status-github'),
  
  // Settings
  jiraBaseUrl: document.getElementById('jira-base-url'),
  jiraApiKey: document.getElementById('jira-api-key'),
  julesApiKey: document.getElementById('jules-api-key'),
  cursorApiKey: document.getElementById('cursor-api-key'),
  codexApiKey: document.getElementById('codex-api-key'),
  claudeApiKey: document.getElementById('claude-api-key'),
  githubApiKey: document.getElementById('github-api-key'),
  cloudflareAccountId: document.getElementById('cloudflare-account-id'),
  cloudflareApiToken: document.getElementById('cloudflare-api-token'),
  autoPolling: document.getElementById('auto-polling'),
  pollingInterval: document.getElementById('polling-interval'),
  intervalValue: document.getElementById('interval-value'),
  defaultGeminiPath: document.getElementById('default-gemini-path'),
  newGeminiPath: document.getElementById('new-gemini-path'),
  geminiPathsList: document.getElementById('gemini-paths-list'),
  newClaudePath: document.getElementById('new-claude-path'),
  claudePathsList: document.getElementById('claude-paths-list'),
  newCursorPath: document.getElementById('new-cursor-path'),
  cursorPathsList: document.getElementById('cursor-paths-list'),
  newCodexPath: document.getElementById('new-codex-path'),
  codexPathsList: document.getElementById('codex-paths-list'),
  newGithubPath: document.getElementById('new-github-path'),
  githubPathsList: document.getElementById('github-paths-list'),
  githubPathsEmpty: document.getElementById('github-paths-empty'),
  
  // Modal
  agentModal: document.getElementById('agent-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalProviderBadge: document.getElementById('modal-provider-badge'),
  modalStatusBadge: document.getElementById('modal-status-badge'),
  modalContent: document.getElementById('modal-content'),
  modalTaskId: document.getElementById('modal-task-id'),
  
  // New Task Modal
  newTaskModal: document.getElementById('new-task-modal'),
  newTaskBtn: document.getElementById('new-task-btn'),
  newTaskTargetDevice: document.getElementById('new-task-target-device'),
  serviceStatus: document.getElementById('service-status'),
  taskRepo: document.getElementById('task-repo'),
  taskRepoSearch: document.getElementById('task-repo-search'),
  repoDropdown: document.getElementById('repo-dropdown'),
  repoSearchContainer: document.getElementById('repo-search-container'),
  taskBranch: document.getElementById('task-branch'),
  taskPrompt: document.getElementById('task-prompt'),
  taskPromptPreview: document.getElementById('task-prompt-preview'),
  taskPromptTabWrite: document.getElementById('task-prompt-tab-write'),
  taskPromptTabPreview: document.getElementById('task-prompt-tab-preview'),
  taskPromptImagesContainer: document.getElementById('task-prompt-images-container'),
  taskPromptImagesCount: document.getElementById('task-prompt-images-count'),
  taskPromptImages: document.getElementById('task-prompt-images'),
  taskSpeechBtn: document.getElementById('task-speech-btn'),
  taskAutoPr: document.getElementById('task-auto-pr'),
  createTaskBtn: document.getElementById('create-task-btn'),
  repoLoading: document.getElementById('repo-loading'),
  repoChevron: document.getElementById('repo-chevron'),
  repoError: document.getElementById('repo-error'),
  createTaskLoading: document.getElementById('create-task-loading'),
  branchInputContainer: document.getElementById('branch-input-container'),

  // Create Repo Modal
  createRepoModal: document.getElementById('create-repo-modal'),
  createRepoLocation: document.getElementById('create-repo-location'),
  createRepoName: document.getElementById('create-repo-name'),
  createRepoGithubSettings: document.getElementById('create-repo-github-settings'),
  createRepoGithubOwner: document.getElementById('create-repo-github-owner'),
  createRepoVisibilityPublic: document.getElementById('create-repo-visibility-public'),
  createRepoVisibilityPrivate: document.getElementById('create-repo-visibility-private'),
  createRepoLocalSettings: document.getElementById('create-repo-local-settings'),
  createRepoLocalDir: document.getElementById('create-repo-local-dir'),
  createRepoRemoteSettings: document.getElementById('create-repo-remote-settings'),
  createRepoRemoteDevice: document.getElementById('create-repo-remote-device'),
  createRepoError: document.getElementById('create-repo-error'),
  createRepoSubmitBtn: document.getElementById('create-repo-submit-btn'),
  createRepoLoading: document.getElementById('create-repo-loading'),

  // Pasted image viewer modal
  pastedImageModal: document.getElementById('pasted-image-modal'),
  pastedImageModalImg: document.getElementById('pasted-image-modal-img'),

  // Branches View
  branchesLoading: document.getElementById('branches-loading'),
  branchesEmpty: document.getElementById('branches-empty'),
  branchesContent: document.getElementById('branches-content'),
  repoList: document.getElementById('repo-list'),
  repoFilter: document.getElementById('repo-filter'),
  repoDetailsPlaceholder: document.getElementById('repo-details-placeholder'),
  repoDetailsContent: document.getElementById('repo-details-content'),
  selectedRepoName: document.getElementById('selected-repo-name'),
  selectedRepoLink: document.getElementById('selected-repo-link'),
  prCount: document.getElementById('pr-count'),
  prStatusText: document.getElementById('pr-status-text'),
  prFilterOpen: document.getElementById('pr-filter-open'),
  prFilterClosed: document.getElementById('pr-filter-closed'),
  prList: document.getElementById('pr-list'),
  createRepoBtn: document.getElementById('create-repo-btn'),
  refreshBranchesBtn: document.getElementById('refresh-branches-btn'),
  repoCount: document.getElementById('repo-count'),

  // Computers View
  computersLoading: document.getElementById('computers-loading'),
  computersEmpty: document.getElementById('computers-empty'),
  computersEmptySubtitle: document.getElementById('computers-empty-subtitle'),
  computersGrid: document.getElementById('computers-grid'),

  // Jira View
  jiraLoading: document.getElementById('jira-loading'),
  jiraEmpty: document.getElementById('jira-empty'),
  jiraContent: document.getElementById('jira-content'),
  jiraBoardSelect: document.getElementById('jira-board-select'),
  refreshJiraBtn: document.getElementById('refresh-jira-btn'),
  jiraIssuesList: document.getElementById('jira-issues-list'),

  // PR Modal
  prModal: document.getElementById('pr-modal'),
  prModalTitle: document.getElementById('pr-modal-title'),
  prModalNumber: document.getElementById('pr-modal-number'),
  prModalState: document.getElementById('pr-modal-state'),
  prModalHead: document.getElementById('pr-modal-head'),
  prModalBase: document.getElementById('pr-modal-base'),
  prModalBody: document.getElementById('pr-modal-body'),
  prModalLink: document.getElementById('pr-modal-link'),
  prModalMeta: document.getElementById('pr-modal-meta'),
  mergeBtn: document.getElementById('merge-btn'),
  mergeGithubBtn: document.getElementById('merge-github-btn'),
  mergeFixBtn: document.getElementById('merge-fix-btn'),
  mergeStatusContainer: document.getElementById('merge-status-container'),
  mergeIcon: document.getElementById('merge-icon'),
  mergeTitle: document.getElementById('merge-title'),
  mergeSubtitle: document.getElementById('merge-subtitle'),

  // Confirm Modal
  confirmModal: document.getElementById('confirm-modal'),
  confirmTitle: document.getElementById('confirm-title'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmCancelBtn: document.getElementById('confirm-cancel-btn'),
  confirmOkBtn: document.getElementById('confirm-ok-btn')
};

// ============================================ 
// Tactical Theme Helpers
// ============================================ 

/**
 * Format count with leading zeros (tactical style)
 */
function formatCount(num) {
  return String(num).padStart(2, '0');
}

/**
 * Get tactical status label
 */
function getTacticalStatus(status) {
  const statusMap = {
    'running': 'RUNNING',
    'completed': 'OP-COMPLETE',
    'pending': 'PENDING_QUEUE',
    'failed': 'FAILED',
    'stopped': 'STOPPED'
  };
  return statusMap[status] || status?.toUpperCase() || 'UNKNOWN';
}

/**
 * Get status styling for tactical theme
 */
function getStatusStyle(status) {
  const styles = {
    running: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-500' },
    completed: { bg: 'bg-[#C2B280]', border: 'border-[#C2B280]', text: 'text-black' },
    pending: { bg: 'bg-slate-700', border: 'border-slate-600', text: 'text-slate-400' },
    failed: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-500' },
    stopped: { bg: 'bg-slate-700', border: 'border-slate-600', text: 'text-slate-400' }
  };
  return styles[status] || styles.pending;
}

/**
 * Get provider styling for tactical theme
 */
function getProviderStyle(provider) {
  const styles = {
    gemini: { border: 'border-emerald-500', text: 'text-emerald-500', dot: 'bg-emerald-500' },
    jules: { border: 'border-[#C2B280]', text: 'text-[#C2B280]', dot: 'bg-[#C2B280]' },
    cursor: { border: 'border-blue-500', text: 'text-blue-500', dot: 'bg-blue-500' },
    codex: { border: 'border-cyan-500', text: 'text-cyan-500', dot: 'bg-cyan-500' },
    'claude-cli': { border: 'border-orange-500', text: 'text-orange-500', dot: 'bg-orange-500' },
    'claude-cloud': { border: 'border-amber-500', text: 'text-amber-500', dot: 'bg-amber-500' },
    claude: { border: 'border-orange-500', text: 'text-orange-500', dot: 'bg-orange-500' } // fallback for legacy
  };
  return styles[provider] || { border: 'border-slate-500', text: 'text-slate-500', dot: 'bg-slate-500' };
}

/**
 * Format time ago in tactical style (1H_AGO, 2D_AGO, 38M_AGO)
 */
function formatTimeAgo(date) {
  if (!date) return '';
  
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'NOW';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M_AGO`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}H_AGO`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}D_AGO`;
  
  // Return date in tactical format
  return then.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '/');
}

// ============================================ 
// Initialization
// ============================================ 

async function init() {
  setupEventListeners();
  setupSpeechRecognition();
  setupPollingListener();
  await loadSettings();
  await loadAgents();
  await checkConnectionStatus();
  fetchComputersBackground(); // Non-blocking
}

async function fetchComputersBackground() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.listComputers) return;
  try {
    const result = await electronAPI.listComputers();
    if (result && result.success) {
       state.computers.list = result.computers || [];
       state.computers.configured = !!result.configured;
    }
  } catch (err) {
    console.warn('Background computer fetch failed:', err);
  }
}

function setupSpeechRecognition() {
  const btn = elements.taskSpeechBtn;
  if (!btn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    btn.classList.add('hidden');
    console.warn('Speech recognition not supported in this environment');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  let isRecording = false;

  recognition.onstart = () => {
    isRecording = true;
    btn.classList.add('text-red-500', 'animate-pulse');
    btn.classList.remove('text-slate-500', 'hover:text-[#C2B280]');
  };

  recognition.onend = () => {
    isRecording = false;
    btn.classList.remove('text-red-500', 'animate-pulse');
    btn.classList.add('text-slate-500', 'hover:text-[#C2B280]');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const currentText = elements.taskPrompt.value;

    // Append with space if needed
    if (currentText && !currentText.endsWith(' ') && currentText.length > 0) {
      elements.taskPrompt.value = currentText + ' ' + transcript;
    } else {
      elements.taskPrompt.value = currentText + transcript;
    }

    validateNewTaskForm();
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    // Don't show toast for 'no-speech' or 'aborted' as they can be common/benign
    if (event.error === 'network') {
      showToast('Speech recognition network error. Please check your internet connection and API keys.', 'error');
    } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showToast(`Speech error: ${event.error}`, 'error');
    }
    isRecording = false;
    btn.classList.remove('text-red-500', 'animate-pulse');
    btn.classList.add('text-slate-500', 'hover:text-[#C2B280]');
  };

  btn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  });
}

function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showView(view);
    });
  });

  // Search
  elements.searchInput.addEventListener('input', debounce((e) => {
    state.filters.search = e.target.value.toLowerCase();
    applyFilters();
    saveFilters();
  }, 300));

  // Refresh button
  elements.refreshBtn.addEventListener('click', () => {
    if (state.currentView === 'branches') return loadBranches();
    if (state.currentView === 'computers') return loadComputers();
    return loadAgents();
  });

  // Provider filters
  document.querySelectorAll('.provider-filter').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const provider = e.target.id.replace('filter-', '');
      state.filters.providers[provider] = e.target.checked;
      applyFilters();
      saveFilters();
    });
  });

  // Status filters
  document.querySelectorAll('.status-filter').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const status = e.target.id.replace('filter-', '');
      state.filters.statuses[status] = e.target.checked;
      applyFilters();
      saveFilters();
    });
  });

  // Settings - API Keys
  document.getElementById('save-jira-base-url').addEventListener('click', saveJiraBaseUrl);
  document.getElementById('save-jira-key').addEventListener('click', () => saveApiKey('jira'));
  document.getElementById('test-jira-key').addEventListener('click', () => testApiKey('jira'));
  document.getElementById('disconnect-jira-key').addEventListener('click', () => disconnectApiKey('jira'));
  document.getElementById('save-jules-key').addEventListener('click', () => saveApiKey('jules'));
  document.getElementById('test-jules-key').addEventListener('click', () => testApiKey('jules'));
  document.getElementById('disconnect-jules-key').addEventListener('click', () => disconnectApiKey('jules'));
  document.getElementById('save-cursor-key').addEventListener('click', () => saveApiKey('cursor'));
  document.getElementById('test-cursor-key').addEventListener('click', () => testApiKey('cursor'));
  document.getElementById('disconnect-cursor-key').addEventListener('click', () => disconnectApiKey('cursor'));
  document.getElementById('save-codex-key').addEventListener('click', () => saveApiKey('codex'));
  document.getElementById('test-codex-key').addEventListener('click', () => testApiKey('codex'));
  document.getElementById('disconnect-codex-key').addEventListener('click', () => disconnectApiKey('codex'));
  document.getElementById('save-claude-key').addEventListener('click', () => saveApiKey('claude'));
  document.getElementById('test-claude-key').addEventListener('click', () => testApiKey('claude'));
  document.getElementById('disconnect-claude-key').addEventListener('click', () => disconnectApiKey('claude'));
  document.getElementById('save-github-key').addEventListener('click', () => saveApiKey('github'));
  document.getElementById('test-github-key').addEventListener('click', () => testApiKey('github'));
  document.getElementById('disconnect-github-key').addEventListener('click', () => disconnectApiKey('github'));

  // Settings - Cloudflare KV
  const saveCfBtn = document.getElementById('save-cloudflare-config');
  const testCfBtn = document.getElementById('test-cloudflare-config');
  const disconnectCfBtn = document.getElementById('disconnect-cloudflare-config');
  const pushKeysCfBtn = document.getElementById('push-keys-cf');
  const pullKeysCfBtn = document.getElementById('pull-keys-cf');

  if (saveCfBtn) saveCfBtn.addEventListener('click', saveCloudflareConfig);
  if (testCfBtn) testCfBtn.addEventListener('click', testCloudflareConfig);
  if (disconnectCfBtn) disconnectCfBtn.addEventListener('click', disconnectCloudflareConfig);
  if (pushKeysCfBtn) pushKeysCfBtn.addEventListener('click', pushKeysToCloudflare);
  if (pullKeysCfBtn) pullKeysCfBtn.addEventListener('click', pullKeysFromCloudflare);

  // Settings - Theme
  ['system', 'light', 'dark'].forEach(theme => {
    document.getElementById(`theme-${theme}`).addEventListener('click', () => setTheme(theme));
  });

  // Settings - Display Mode
  document.getElementById('display-windowed').addEventListener('click', () => setDisplayMode('windowed'));
  document.getElementById('display-fullscreen').addEventListener('click', () => setDisplayMode('fullscreen'));

  // Settings - Polling
  elements.autoPolling.addEventListener('change', (e) => {
    updatePollingSettings(e.target.checked, state.settings.pollingInterval);
  });

  elements.pollingInterval.addEventListener('input', (e) => {
    const seconds = parseInt(e.target.value);
    elements.intervalValue.textContent = seconds;
  });

  elements.pollingInterval.addEventListener('change', (e) => {
    const ms = parseInt(e.target.value) * 1000;
    updatePollingSettings(state.settings.autoPolling, ms);
  });

  // Settings - Gemini Paths
  document.getElementById('add-gemini-path').addEventListener('click', addGeminiPath);
  document.getElementById('browse-gemini-path').addEventListener('click', async () => {
    const electronAPI = getElectronAPI();
    const path = await electronAPI.openDirectory();
    if (path) {
      elements.newGeminiPath.value = path;
    }
  });
  elements.newGeminiPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGeminiPath();
  });

  // Settings - Claude Paths
  document.getElementById('add-claude-path').addEventListener('click', addClaudePath);
  document.getElementById('browse-claude-path').addEventListener('click', async () => {
    const electronAPI = getElectronAPI();
    const path = await electronAPI.openDirectory();
    if (path) {
      elements.newClaudePath.value = path;
    }
  });
  elements.newClaudePath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addClaudePath();
  });

  // Settings - Cursor Paths
  document.getElementById('add-cursor-path').addEventListener('click', addCursorPath);
  document.getElementById('browse-cursor-path').addEventListener('click', async () => {
    const electronAPI = getElectronAPI();
    const path = await electronAPI.openDirectory();
    if (path) {
      elements.newCursorPath.value = path;
    }
  });
  elements.newCursorPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addCursorPath();
  });

  // Settings - Codex Paths
  document.getElementById('add-codex-path').addEventListener('click', addCodexPath);
  document.getElementById('browse-codex-path').addEventListener('click', async () => {
    const electronAPI = getElectronAPI();
    const path = await electronAPI.openDirectory();
    if (path) {
      elements.newCodexPath.value = path;
    }
  });
  elements.newCodexPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addCodexPath();
  });

  // Settings - GitHub Paths
  document.getElementById('add-github-path').addEventListener('click', addGithubPath);
  document.getElementById('browse-github-path').addEventListener('click', async () => {
    const electronAPI = getElectronAPI();
    const path = await electronAPI.openDirectory();
    if (path) {
      elements.newGithubPath.value = path;
    }
  });
  elements.newGithubPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGithubPath();
  });

  // Settings - Update Application
  const updateBtn = document.getElementById('update-app-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', updateApplication);
  }

  // New Task Modal
  elements.newTaskBtn.addEventListener('click', openNewTaskModal);
  if (elements.newTaskTargetDevice) {
    elements.newTaskTargetDevice.addEventListener('change', handleTargetDeviceChange);
  }
  elements.taskPrompt.addEventListener('input', () => {
    validateNewTaskForm();
    if (state.newTask.promptMode === 'preview') {
      renderTaskPromptPreview();
    }
  });
  elements.taskPrompt.addEventListener('paste', handleTaskPromptPaste);
  elements.taskPrompt.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault(); // Prevent newline insertion if any
      submitNewTask();
    }
  });
  
  // Searchable repo dropdown
  setupRepoSearchDropdown();

  // Pagination
  elements.prevPageBtn.addEventListener('click', goToPrevPage);
  elements.nextPageBtn.addEventListener('click', goToNextPage);

  // Branches
  elements.repoFilter.addEventListener('input', debounce((e) => {
    filterRepos(e.target.value);
  }, 200));
  if (elements.createRepoBtn) {
    elements.createRepoBtn.addEventListener('click', openCreateRepoModal);
  }
  elements.refreshBranchesBtn.addEventListener('click', loadBranches);

  elements.prFilterOpen.addEventListener('click', () => setPrFilter('open'));
  elements.prFilterClosed.addEventListener('click', () => setPrFilter('closed'));

  // Create Repo Modal
  if (elements.createRepoLocation) {
    elements.createRepoLocation.addEventListener('change', (e) => {
      state.createRepo.location = e.target.value;
      updateCreateRepoModalVisibility();
    });
  }
  if (elements.createRepoName) {
    elements.createRepoName.addEventListener('input', (e) => {
      state.createRepo.name = e.target.value;
      hideCreateRepoError();
    });
  }
  if (elements.createRepoGithubOwner) {
    elements.createRepoGithubOwner.addEventListener('change', (e) => {
      state.createRepo.githubOwner = e.target.value;
      hideCreateRepoError();
    });
  }
  if (elements.createRepoLocalDir) {
    elements.createRepoLocalDir.addEventListener('input', (e) => {
      state.createRepo.localDir = e.target.value;
      hideCreateRepoError();
    });
  }
  if (elements.createRepoRemoteDevice) {
    elements.createRepoRemoteDevice.addEventListener('change', (e) => {
      state.createRepo.remoteDeviceId = e.target.value;
      hideCreateRepoError();
    });
  }
  if (elements.createRepoVisibilityPublic) {
    elements.createRepoVisibilityPublic.addEventListener('click', () => setCreateRepoVisibility(false));
  }
  if (elements.createRepoVisibilityPrivate) {
    elements.createRepoVisibilityPrivate.addEventListener('click', () => setCreateRepoVisibility(true));
  }

  // Jira View
  elements.jiraBoardSelect.addEventListener('change', (e) => {
    state.jira.selectedBoardId = e.target.value;
    if (state.jira.selectedBoardId) {
      loadJiraIssues(state.jira.selectedBoardId);
    } else {
      elements.jiraIssuesList.innerHTML = '';
    }
  });

  elements.refreshJiraBtn.addEventListener('click', () => {
    if (state.jira.selectedBoardId) {
      loadJiraIssues(state.jira.selectedBoardId);
    } else {
      loadJiraBoards();
    }
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') {
      applyTheme('system');
    }
  });
}

function setupPollingListener() {
  const electronAPI = getElectronAPI();
  if (electronAPI && electronAPI.onRefreshTick) {
    electronAPI.onRefreshTick(() => {
      loadAgents(true); // Silent refresh
    });
  }
}

/**
 * Setup the searchable repository dropdown
 */
function setupRepoSearchDropdown() {
  const searchInput = elements.taskRepoSearch;
  const dropdown = elements.repoDropdown;
  const chevron = elements.repoChevron;
  const container = elements.repoSearchContainer;

  // Filter repos on input
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterRepoDropdown(query);
    showRepoDropdown();
  });

  // Show dropdown on focus
  searchInput.addEventListener('focus', () => {
    if (!searchInput.disabled) {
      if (state.newTask.repositories.length > 0) {
        filterRepoDropdown(searchInput.value.toLowerCase());
      }
      showRepoDropdown();
    }
  });

  // Toggle dropdown on chevron click
  chevron.addEventListener('click', () => {
    if (!searchInput.disabled) {
      if (dropdown.classList.contains('hidden')) {
        if (state.newTask.repositories.length > 0) {
          filterRepoDropdown(searchInput.value.toLowerCase());
        }
        showRepoDropdown();
        searchInput.focus();
      } else {
        hideRepoDropdown();
      }
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      hideRepoDropdown();
    }
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.repo-option:not(.hidden)');
    const activeItem = dropdown.querySelector('.active-repo-option');
    let activeIndex = Array.from(items).indexOf(activeItem);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (dropdown.classList.contains('hidden')) {
          showRepoDropdown();
        } else {
          activeIndex = Math.min(activeIndex + 1, items.length - 1);
          highlightRepoOption(items, activeIndex);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        highlightRepoOption(items, activeIndex);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeItem) {
          selectRepoOption(activeItem);
        } else if (items.length > 0) {
          selectRepoOption(items[0]);
        }
        break;
      case 'Escape':
        hideRepoDropdown();
        break;
    }
  });
}

/**
 * Filter the repository dropdown based on search query
 */
function filterRepoDropdown(query) {
  const items = elements.repoDropdown.querySelectorAll('.repo-option');
  let visibleCount = 0;

  items.forEach(item => {
    const name = item.dataset.displayName?.toLowerCase() || '';
    const url = item.dataset.repoUrl?.toLowerCase() || '';
    const matches = name.includes(query) || url.includes(query);
    
    if (matches) {
      item.classList.remove('hidden');
      visibleCount++;
    } else {
      item.classList.add('hidden');
    }
  });

  // Show "no results" message if nothing matches
  let noResults = elements.repoDropdown.querySelector('.no-results');
  if (visibleCount === 0 && query) {
    if (!noResults) {
      noResults = document.createElement('div');
      noResults.className = 'no-results px-4 py-3 text-xs technical-font text-slate-500 text-center';
      noResults.textContent = 'NO MATCHING REPOSITORIES';
      elements.repoDropdown.appendChild(noResults);
    }
    noResults.classList.remove('hidden');
  } else if (noResults) {
    noResults.classList.add('hidden');
  }
}

/**
 * Show the repository dropdown
 */
function showRepoDropdown() {
  elements.repoDropdown.classList.remove('hidden');
  elements.repoChevron.style.transform = 'rotate(180deg)';
}

/**
 * Hide the repository dropdown
 */
function hideRepoDropdown() {
  elements.repoDropdown.classList.add('hidden');
  elements.repoChevron.style.transform = 'rotate(0deg)';
}

/**
 * Highlight a repo option for keyboard navigation
 */
function highlightRepoOption(items, index) {
  items.forEach((item, i) => {
    if (i === index) {
      item.classList.add('bg-[#C2B280]/20', 'active-repo-option');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('bg-[#C2B280]/20', 'active-repo-option');
    }
  });
}

/**
 * Select a repo option from the dropdown
 */
function selectRepoOption(optionElement) {
  const value = optionElement.dataset.value;
  const displayName = optionElement.dataset.displayName;
  const repoData = optionElement.dataset.repoData;

  elements.taskRepo.value = value;
  elements.taskRepo.dataset.repoData = repoData;
  elements.taskRepoSearch.value = displayName;
  
  hideRepoDropdown();
  validateNewTaskForm();

  // Refresh branch dropdown based on selected repository (best-effort).
  // Intentionally not awaited to keep UI responsive.
  void refreshNewTaskBranchesFromSelectedRepo();
}

/**
 * Populate the repo dropdown with options
 */
function populateRepoDropdown(repositories, service) {
  elements.repoDropdown.innerHTML = '';

  if (repositories.length === 0) {
    elements.repoDropdown.innerHTML = `
      <div class="px-4 py-3 text-xs technical-font text-slate-500 text-center">NO REPOSITORIES FOUND</div>
    `;
    return;
  }

  repositories.forEach(repo => {
    const value = service === 'jules' ? repo.id : (repo.url || repo.path || repo.id);
    const displayName = (repo.displayName || repo.name).toUpperCase();
    
    const option = document.createElement('div');
    option.className = 'repo-option px-4 py-3 text-xs technical-font text-slate-300 cursor-pointer hover:bg-[#C2B280]/10 border-b border-[#2A2A2A] last:border-b-0 transition-colors';
    option.dataset.value = value;
    option.dataset.displayName = displayName;
    option.dataset.repoUrl = repo.url || repo.path || '';
    option.dataset.repoData = JSON.stringify(repo);
    
    option.innerHTML = `
      <div class="font-medium">${escapeHtml(displayName)}</div>
      ${repo.url || repo.path ? `<div class="text-[10px] text-slate-500 mt-1 truncate">${escapeHtml(repo.url || repo.path)}</div>` : ''}
    `;
    
    option.addEventListener('click', () => selectRepoOption(option));
    option.addEventListener('mouseenter', () => {
      elements.repoDropdown.querySelectorAll('.repo-option').forEach(item => {
        item.classList.remove('bg-[#C2B280]/20', 'active-repo-option');
      });
      option.classList.add('bg-[#C2B280]/20', 'active-repo-option');
    });
    
    elements.repoDropdown.appendChild(option);
  });
}

// ============================================ 
// Data Loading
// ============================================ 

async function loadAgents(silent = false) {
  const electronAPI = getElectronAPI();
  if (!electronAPI) return;

  // Only show full loading state if we have no agents and it's not a silent refresh
  if (!silent && state.agents.length === 0) {
    state.loading = true;
    showLoading();
  }

  setRefreshing(true);

  try {
    const result = await electronAPI.getAgents();
    
    // Check for completions before updating state
    if (result.agents) {
      checkForCompletions(result.agents);
    }

    state.agents = result.agents || [];
    state.counts = result.counts || { gemini: 0, jules: 0, cursor: 0, total: 0 };
    state.errors = result.errors || [];

    updateCounts();
    applyFilters();
    showErrors();
  } catch (err) {
    console.error('Error loading agents:', err);
    state.errors = [{ provider: 'system', error: err.message }];
    showErrors();
  } finally {
    state.loading = false;
    setRefreshing(false);
    hideLoading();
  }
}

async function loadSettings() {
  const electronAPI = getElectronAPI();
  if (!electronAPI) return;

  try {
    const result = await electronAPI.getSettings();
    
    state.settings = {
      pollingInterval: result.settings?.pollingInterval || 30000,
      autoPolling: result.settings?.autoPolling !== false,
      geminiPaths: result.settings?.geminiPaths || [],
      claudePaths: result.settings?.claudePaths || [],
      cursorPaths: result.settings?.cursorPaths || [],
      codexPaths: result.settings?.codexPaths || [],
      githubPaths: result.githubPaths || result.settings?.githubPaths || [],
      theme: result.settings?.theme || 'system',
      displayMode: result.settings?.displayMode || 'fullscreen',
      jiraBaseUrl: result.jiraBaseUrl || ''
    };

    // Apply theme
    applyTheme(state.settings.theme);

    // Apply display mode
    applyDisplayMode(state.settings.displayMode);

    // Update UI
    elements.autoPolling.checked = state.settings.autoPolling;
    const seconds = Math.round(state.settings.pollingInterval / 1000);
    elements.pollingInterval.value = seconds;
    elements.intervalValue.textContent = seconds;

    // Update Gemini paths
    elements.defaultGeminiPath.textContent = result.geminiDefaultPath || 'Not detected';
    renderGeminiPaths();

    // Update other CLI paths
    renderClaudePaths();
    renderCursorPaths();
    renderCodexPaths();

    // Update GitHub paths
    renderGithubPaths();

    // Track configured services
    state.configuredServices.gemini = result.geminiInstalled || (result.geminiPaths && result.geminiPaths.length > 0) || false;
    state.configuredServices.jules = result.apiKeys?.jules || false;
    state.configuredServices.cursor = result.apiKeys?.cursor || (result.cursorPaths && result.cursorPaths.length > 0) || false;
    state.configuredServices.codex = result.apiKeys?.codex || (result.codexPaths && result.codexPaths.length > 0) || false;
    state.configuredServices['claude-cli'] = result.claudeCliInstalled || (result.claudePaths && result.claudePaths.length > 0) || false;
    state.configuredServices['claude-cloud'] = result.claudeCloudConfigured || result.apiKeys?.claude || false;
    state.configuredServices.github = result.apiKeys?.github || false;
    state.configuredServices.jira = result.apiKeys?.jira && !!state.settings.jiraBaseUrl;

    // Update detailed capabilities
    state.capabilities.gemini = {
      cloud: false,
      local: !!(result.geminiInstalled || (result.geminiPaths && result.geminiPaths.length > 0))
    };
    state.capabilities.jules = {
      cloud: !!result.apiKeys?.jules,
      local: false
    };
    state.capabilities.cursor = {
      cloud: !!result.apiKeys?.cursor,
      local: !!(result.cursorPaths && result.cursorPaths.length > 0)
    };
    state.capabilities.codex = {
      cloud: !!result.apiKeys?.codex,
      local: !!(result.codexPaths && result.codexPaths.length > 0)
    };
    state.capabilities.claude = {
      cloud: !!(result.claudeCloudConfigured || result.apiKeys?.claude),
      local: !!(result.claudeCliInstalled || (result.claudePaths && result.claudePaths.length > 0))
    };
    state.capabilities.github = {
      cloud: !!result.apiKeys?.github,
      local: !!(result.githubPaths && result.githubPaths.length > 0)
    };

    // Save local device ID
    if (result.localDeviceId) {
      state.localDeviceId = result.localDeviceId;
    }

    // Load saved filters if they exist
    if (result.filters && (result.filters.providers || result.filters.statuses)) {
      if (result.filters.providers) {
        state.filters.providers = { ...state.filters.providers, ...result.filters.providers };
      }
      if (result.filters.statuses) {
        state.filters.statuses = { ...state.filters.statuses, ...result.filters.statuses };
      }
      if (typeof result.filters.search === 'string') {
        state.filters.search = result.filters.search;
        elements.searchInput.value = result.filters.search;
      }

      // Update filter UI
      updateFilterUI();
    }

    // Update provider filter visibility based on configured services
    updateProviderFilterVisibility();

    // Show configured status for API keys and disconnect buttons
    if (result.apiKeys?.jules) {
      elements.julesApiKey.placeholder = '••••••••••••••••';
      document.getElementById('disconnect-jules-key')?.classList.remove('hidden');
    } else {
      document.getElementById('disconnect-jules-key')?.classList.add('hidden');
    }
    if (result.apiKeys?.cursor) {
      elements.cursorApiKey.placeholder = '••••••••••••••••';
      document.getElementById('disconnect-cursor-key')?.classList.remove('hidden');
    } else {
      document.getElementById('disconnect-cursor-key')?.classList.add('hidden');
    }
    if (result.apiKeys?.codex) {
      elements.codexApiKey.placeholder = '••••••••••••••••';
      document.getElementById('disconnect-codex-key')?.classList.remove('hidden');
    } else {
      document.getElementById('disconnect-codex-key')?.classList.add('hidden');
    }
    if (result.apiKeys?.claude) {
      elements.claudeApiKey.placeholder = '••••••••••••••••';
      document.getElementById('disconnect-claude-key')?.classList.remove('hidden');
    } else {
      document.getElementById('disconnect-claude-key')?.classList.add('hidden');
    }
    if (result.apiKeys?.github) {
      elements.githubApiKey.placeholder = '••••••••••••••••';
      document.getElementById('disconnect-github-key')?.classList.remove('hidden');
    } else {
      document.getElementById('disconnect-github-key')?.classList.add('hidden');
    }

    if (result.apiKeys?.jira) {
      elements.jiraApiKey.placeholder = '••••••••••••••••';
      document.getElementById('disconnect-jira-key')?.classList.remove('hidden');
    } else {
      document.getElementById('disconnect-jira-key')?.classList.add('hidden');
    }

    if (elements.jiraBaseUrl) {
      elements.jiraBaseUrl.value = state.settings.jiraBaseUrl || '';
    }

    // Cloudflare KV settings
    const cfConfigured = !!(result.cloudflare?.configured || result.apiKeys?.cloudflare);
    state.computers.configured = cfConfigured;
    if (elements.cloudflareAccountId) {
      elements.cloudflareAccountId.value = result.cloudflare?.accountId || '';
    }
    if (elements.cloudflareApiToken) {
      elements.cloudflareApiToken.value = '';
      elements.cloudflareApiToken.placeholder = cfConfigured ? '••••••••••••••••' : 'Enter Cloudflare API token';
    }
    if (cfConfigured) {
      document.getElementById('disconnect-cloudflare-config')?.classList.remove('hidden');
      document.getElementById('cloudflare-key-sync-controls')?.classList.remove('hidden');
    } else {
      document.getElementById('disconnect-cloudflare-config')?.classList.add('hidden');
      document.getElementById('cloudflare-key-sync-controls')?.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function checkConnectionStatus() {
  const electronAPI = getElectronAPI();
  if (!electronAPI) return;

  try {
    const status = await electronAPI.getConnectionStatus();
    
    updateStatusIndicator('gemini', status.gemini);
    updateStatusIndicator('jules', status.jules);
    updateStatusIndicator('cursor', status.cursor);
    updateStatusIndicator('codex', status.codex);
    updateStatusIndicator('claude-cli', status['claude-cli']);
    updateStatusIndicator('claude-cloud', status['claude-cloud']);
    updateStatusIndicator('github', status.github);
  } catch (err) {
    console.error('Error checking connection status:', err);
  }
}

/**
 * Update visibility of provider filters based on configured services
 */
function updateProviderFilterVisibility() {
  const providers = ['gemini', 'jules', 'cursor', 'codex', 'claude-cli', 'claude-cloud'];
  
  providers.forEach(provider => {
    const filterContainer = document.getElementById(`filter-${provider}`)?.closest('li');
    const statusContainer = document.getElementById(`status-${provider}`)?.closest('.flex');
    
    if (filterContainer) {
      if (state.configuredServices[provider]) {
        filterContainer.classList.remove('hidden');
      } else {
        filterContainer.classList.add('hidden');
        // Disable the filter for unconfigured services
        state.filters.providers[provider] = false;
      }
    }
    
    if (statusContainer) {
      if (state.configuredServices[provider]) {
        statusContainer.classList.remove('hidden');
      } else {
        statusContainer.classList.add('hidden');
      }
    }
  });
}

/**
 * Update visibility of service buttons in new task modal
 */
function updateServiceButtonVisibility() {
  const providers = ['gemini', 'jules', 'cursor', 'codex', 'claude-cli', 'claude-cloud'];
  let availableCount = 0;
  const targetDevice = state.newTask.targetDevice;

  providers.forEach(provider => {
    const serviceBtn = document.getElementById(`service-${provider}`);
    if (serviceBtn) {
      let visible = false;

      if (targetDevice === 'cloud') {
        // Cloud mode: Show services with CLOUD capability
        if (provider === 'claude-cloud') {
          visible = state.capabilities.claude.cloud;
        } else if (provider === 'claude-cli') {
          visible = false;
        } else if (state.capabilities[provider]?.cloud) {
          visible = true;
        }
      } else if (targetDevice === 'local') {
        // Local mode: Show services with LOCAL capability
        if (provider === 'claude-cli') {
          visible = state.capabilities.claude.local;
        } else if (provider === 'claude-cloud') {
          visible = false;
        } else if (state.capabilities[provider]?.local) {
          visible = true;
        }
      } else if (targetDevice && typeof targetDevice === 'object') {
        // Remote mode: Only show tools installed on remote device
        // Only gemini and claude-cli are supported remotely

        // Extract CLI tools from new structure
        const cliTools = (Array.isArray(targetDevice.tools) && targetDevice.tools.length > 0 && targetDevice.tools[0]['CLI tools'])
          ? targetDevice.tools[0]['CLI tools']
          : [];

        if (provider === 'gemini' && cliTools.includes('Gemini CLI')) {
          visible = true;
        } else if (provider === 'claude-cli' && cliTools.includes('claude CLI')) {
          visible = true;
        } else if (provider === 'codex' && cliTools.includes('Codex CLI')) {
          visible = true;
        }
      } else {
        // Fallback: Show everything configured
        if (provider === 'claude-cli') visible = state.capabilities.claude.local;
        else if (provider === 'claude-cloud') visible = state.capabilities.claude.cloud;
        else visible = state.capabilities[provider]?.cloud || state.capabilities[provider]?.local;
      }

      if (visible) {
        serviceBtn.classList.remove('hidden');
        availableCount++;
      } else {
        serviceBtn.classList.add('hidden');
      }
    }
  });

  // Update service status message if no services are available
  if (availableCount === 0) {
    if (targetDevice && typeof targetDevice === 'object') {
      elements.serviceStatus.textContent = 'No compatible CLI tools found on this remote device.';
    } else if (targetDevice === 'local') {
      elements.serviceStatus.textContent = 'No local CLI tools installed (Gemini/Claude) or paths configured. Check Settings.';
    } else if (targetDevice === 'cloud') {
      elements.serviceStatus.textContent = 'No cloud services configured. Check API Keys in Settings.';
    } else {
      elements.serviceStatus.textContent = 'No services configured. Please add API keys or install CLI tools in Settings.';
    }
    elements.serviceStatus.className = 'mt-3 text-xs technical-font text-yellow-400';
  } else {
    elements.serviceStatus.textContent = '';
  }
}

// ============================================ 
// Filtering
// ============================================ 

async function saveFilters() {
  const electronAPI = getElectronAPI();
  if (electronAPI) {
    try {
      await electronAPI.saveFilters(state.filters);
    } catch (err) {
      console.error('Failed to save filters:', err);
    }
  }
}

function updateFilterUI() {
  // Update provider checkboxes
  Object.keys(state.filters.providers).forEach(provider => {
    const checkbox = document.getElementById(`filter-${provider}`);
    if (checkbox) {
      checkbox.checked = state.filters.providers[provider];
    }
  });

  // Update status checkboxes
  Object.keys(state.filters.statuses).forEach(status => {
    const checkbox = document.getElementById(`filter-${status}`);
    if (checkbox) {
      checkbox.checked = state.filters.statuses[status];
    }
  });
}

function applyFilters() {
  const { providers, statuses, search } = state.filters;

  state.filteredAgents = state.agents.filter(agent => {
    // Provider filter
    if (!providers[agent.provider]) return false;

    // Status filter
    const statusKey = agent.status === 'stopped' ? 'failed' : agent.status;
    if (!statuses[statusKey]) return false;

    // Search filter
    if (search) {
      const searchFields = [
        agent.name,
        agent.prompt,
        agent.repository,
        agent.summary
      ].filter(Boolean).join(' ').toLowerCase();
      
      if (!searchFields.includes(search)) return false;
    }

    return true;
  });

  // Reset to page 1 when filters change
  state.pagination.currentPage = 1;
  
  renderAgents();
}

// ============================================ 
// Rendering
// ============================================ 

function renderAgents() {
  if (state.filteredAgents.length === 0) {
    elements.agentsGrid.innerHTML = '';
    elements.paginationControls.classList.add('hidden');
    if (state.agents.length === 0) {
      elements.emptyState.classList.remove('hidden');
    } else {
      elements.emptyState.classList.add('hidden');
      elements.agentsGrid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <span class="material-symbols-outlined text-slate-600 text-4xl mb-4">filter_alt_off</span>
          <p class="technical-font text-slate-500">No tasks match current filters</p>
        </div>
      `;
    }
    return;
  }

  elements.emptyState.classList.add('hidden');
  
  // Calculate pagination
  const totalItems = state.filteredAgents.length;
  const { pageSize, currentPage } = state.pagination;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  // Ensure currentPage is within bounds
  state.pagination.totalPages = totalPages;
  if (state.pagination.currentPage > totalPages) {
    state.pagination.currentPage = totalPages;
  }
  if (state.pagination.currentPage < 1) {
    state.pagination.currentPage = 1;
  }
  
  // Calculate slice indices
  const startIndex = (state.pagination.currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  
  // Get current page items
  const pageItems = state.filteredAgents.slice(startIndex, endIndex);
  
  // Render agent cards
  elements.agentsGrid.innerHTML = pageItems.map(agent => createAgentCard(agent)).join('');
  
  // Update pagination controls
  updatePaginationControls(startIndex + 1, endIndex, totalItems, state.pagination.currentPage, totalPages);
}

/**
 * Update pagination controls visibility and content
 */
function updatePaginationControls(start, end, total, currentPage, totalPages) {
  // Show/hide pagination controls based on whether there are multiple pages
  if (totalPages <= 1) {
    elements.paginationControls.classList.add('hidden');
    return;
  }
  
  elements.paginationControls.classList.remove('hidden');
  
  // Update info text
  elements.paginationInfo.textContent = `SHOWING ${start}-${end} OF ${total} TASKS`;
  
  // Update page indicator with leading zeros
  const currentPageStr = String(currentPage).padStart(2, '0');
  const totalPagesStr = String(totalPages).padStart(2, '0');
  elements.pageIndicator.textContent = `PAGE ${currentPageStr} / ${totalPagesStr}`;
  
  // Update button states
  elements.prevPageBtn.disabled = currentPage <= 1;
  elements.nextPageBtn.disabled = currentPage >= totalPages;
}

/**
 * Navigate to previous page
 */
function goToPrevPage() {
  if (state.pagination.currentPage > 1) {
    state.pagination.currentPage--;
    renderAgents();
    // Scroll to top of grid
    elements.agentsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Navigate to next page
 */
function goToNextPage() {
  if (state.pagination.currentPage < state.pagination.totalPages) {
    state.pagination.currentPage++;
    renderAgents();
    // Scroll to top of grid
    elements.agentsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Make pagination functions available globally
window.goToPrevPage = goToPrevPage;
window.goToNextPage = goToNextPage;

function createAgentCard(agent) {
  const providerStyle = getProviderStyle(agent.provider);
  const statusStyle = getStatusStyle(agent.status);
  const timeAgo = formatTimeAgo(agent.updatedAt || agent.createdAt);
  const tacticalStatus = getTacticalStatus(agent.status);

  return `
    <div class="agent-card bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-[#2A2A2A] p-6 group hover:border-[#C2B280] transition-colors cursor-pointer relative overflow-hidden"
         onclick="openAgentDetails('${agent.provider}', '${escapeJsString(agent.rawId || '')}', '${escapeJsString(agent.filePath || '')}')">
      <!-- Header with badges and time -->
      <div class="flex justify-between items-start mb-4">
        <div class="flex gap-2">
          <span class="px-2 py-0.5 text-[9px] technical-font border ${providerStyle.border} ${providerStyle.text}">${agent.provider.toUpperCase()}</span>
          <span class="px-2 py-0.5 text-[9px] technical-font ${statusStyle.bg} ${statusStyle.text}">${tacticalStatus}</span>
        </div>
        <span class="text-[10px] technical-font text-slate-500">${timeAgo}</span>
      </div>

      <!-- Title -->
      <h3 class="text-lg font-bold dark:text-white mb-2 tracking-tight group-hover:text-[#C2B280] transition-colors uppercase line-clamp-2">${escapeHtml(agent.name)}</h3>

      <!-- Description/Prompt -->
      ${agent.prompt ? `
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-6 line-clamp-2 font-light leading-relaxed">
          ${escapeHtml(agent.prompt)}
        </p>
      ` : '<div class="mb-6"></div>'}

      <!-- Footer with repo and PR link -->
      <div class="flex items-center justify-between mt-auto">
        ${agent.repository ? `
          <div class="flex items-center gap-2 text-[10px] technical-font text-slate-400">
            <span class="material-symbols-outlined text-xs">folder_open</span>
            ${extractRepoName(agent.repository)}
          </div>
        ` : '<div></div>'}
        <div class="flex gap-3">
          ${agent.webUrl ? `
            <a href="#" onclick="event.stopPropagation(); openExternal('${agent.webUrl}')"
               class="text-[10px] technical-font text-slate-400 hover:text-[#C2B280] hover:underline flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">terminal</span>
              Console
            </a>
          ` : ''}
          ${agent.prUrl ? `
            <a href="#" onclick="event.stopPropagation(); openExternal('${agent.prUrl}')"
               class="text-[10px] technical-font text-[#C2B280] hover:underline flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">open_in_new</span>
              View PR
            </a>
          ` : ''}
        </div>
      </div>

      <!-- Running indicator -->
      ${agent.status === 'running' ? `
        <div class="absolute top-0 right-0 w-2 h-2 bg-yellow-500 animate-pulse"></div>
      ` : ''}
    </div>
  `;
}

function renderGeminiPaths() {
  const paths = state.settings.geminiPaths;
  renderPathList(paths, elements.geminiPathsList, 'removeGeminiPath');
}

function renderClaudePaths() {
  const paths = state.settings.claudePaths;
  renderPathList(paths, elements.claudePathsList, 'removeClaudePath');
}

function renderCursorPaths() {
  const paths = state.settings.cursorPaths;
  renderPathList(paths, elements.cursorPathsList, 'removeCursorPath');
}

function renderCodexPaths() {
  const paths = state.settings.codexPaths;
  renderPathList(paths, elements.codexPathsList, 'removeCodexPath');
}

function renderPathList(paths, containerElement, removeFunction) {
  if (!containerElement) return;

  if (paths.length === 0) {
    containerElement.innerHTML = `
      <p class="text-sm technical-font text-slate-500 italic">No custom paths configured</p>
    `;
    return;
  }

  containerElement.innerHTML = paths.map(path => `
    <div class="flex items-center justify-between p-3 bg-slate-700/20 border border-[#2A2A2A]">
      <span class="text-sm text-slate-300 font-mono truncate">${escapeHtml(path)}</span>
      <button onclick="${removeFunction}('${escapeHtml(path)}')"
              class="text-slate-400 hover:text-red-400 transition-colors">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  `).join('');
}

// ============================================ 
// UI State Updates
// ============================================ 

function showView(view) {
  state.currentView = view;
  
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.view === view) {
      btn.classList.add('active', 'bg-[#C2B280]', 'text-black', 'font-medium');
      btn.classList.remove('text-slate-600', 'dark:text-slate-400');
    } else {
      btn.classList.remove('active', 'bg-[#C2B280]', 'text-black', 'font-medium');
      btn.classList.add('text-slate-600', 'dark:text-slate-400');
    }
  });

  // Update title
  const titles = {
    dashboard: 'Agent Dashboard',
    settings: 'Settings',
    branches: 'Repositories',
    computers: 'Computers',
    jira: 'Jira'
  };
  elements.viewTitle.textContent = titles[view] || 'Dashboard';

  // Show/hide views
  elements.viewDashboard.classList.toggle('hidden', view !== 'dashboard');
  elements.viewSettings.classList.toggle('hidden', view !== 'settings');
  elements.viewBranches.classList.toggle('hidden', view !== 'branches');
  if (elements.viewComputers) {
    elements.viewComputers.classList.toggle('hidden', view !== 'computers');
  }
  if (elements.viewJira) {
    elements.viewJira.classList.toggle('hidden', view !== 'jira');
  }

  // Show/hide sidenav sections
  if (elements.sidenavProviders) {
    elements.sidenavProviders.classList.toggle('hidden', view !== 'dashboard');
  }
  if (elements.sidenavStatus) {
    elements.sidenavStatus.classList.toggle('hidden', view !== 'dashboard');
  }

  // Load branches if view selected
  if (view === 'branches') {
    if (state.github.repos.length === 0) {
      loadBranches();
    }
  }

  // Load computers if view selected
  if (view === 'computers') {
    loadComputers();
    elements.totalCount.textContent = `${state.computers.list.length} Computer${state.computers.list.length !== 1 ? 's' : ''}`;
  } else if (view === 'jira') {
    loadJiraBoards();
    elements.totalCount.textContent = `${state.jira.issues.length} Issues`;
  } else {
    updateCounts();
  }
}

// Make showView available globally for onclick handlers
window.showView = showView;

function showLoading() {
  elements.loadingState.classList.remove('hidden');
  elements.agentsGrid.classList.add('hidden');
  elements.emptyState.classList.add('hidden');
}

function hideLoading() {
  elements.loadingState.classList.add('hidden');
  elements.agentsGrid.classList.remove('hidden');
}

function setRefreshing(refreshing) {
  if (refreshing) {
    elements.refreshIcon.classList.add('animate-spin');
  } else {
    elements.refreshIcon.classList.remove('animate-spin');
  }
  elements.refreshBtn.disabled = refreshing;
}

function updateCounts() {
  elements.countGemini.textContent = formatCount(state.counts.gemini);
  elements.countJules.textContent = formatCount(state.counts.jules);
  elements.countCursor.textContent = formatCount(state.counts.cursor);
  elements.countCodex.textContent = formatCount(state.counts.codex);
  elements.countClaudeCli.textContent = formatCount(state.counts['claude-cli'] || 0);
  elements.countClaudeCloud.textContent = formatCount(state.counts['claude-cloud'] || 0);
  elements.totalCount.textContent = `${state.counts.total} Task${state.counts.total !== 1 ? 's' : ''}`;
}

function updateStatusIndicator(provider, status) {
  // Convert provider name to element key (e.g., 'claude-cli' -> 'ClaudeCli')
  const elementKey = provider.split('-').map(part => capitalizeFirst(part)).join('');
  const el = elements[`status${elementKey}`];
  if (!el) return;

  if (status && (status.success || status.connected)) {
    el.textContent = 'Connected';
    el.className = 'font-bold text-emerald-500';
  } else if (status && status.error === 'Not configured') {
    el.textContent = 'Offline';
    el.className = 'font-bold text-slate-500';
  } else {
    el.textContent = 'Error';
    el.className = 'font-bold text-red-500';
    el.title = status?.error || '';
  }
}

function showErrors() {
  if (state.errors.length === 0) {
    elements.errorBanner.classList.add('hidden');
    return;
  }

  elements.errorBanner.classList.remove('hidden');
  elements.errorList.innerHTML = state.errors.map(e => 
    `<li>${e.provider.toUpperCase()}: ${escapeHtml(e.error)}</li>`
  ).join('');
}

// ============================================ 
// Settings Actions
// ============================================ 

async function saveJiraBaseUrl() {
  const electronAPI = getElectronAPI();
  const url = elements.jiraBaseUrl.value.trim();
  if (!url) {
    showToast('Please enter Jira Base URL', 'error');
    return;
  }
  try {
    await electronAPI.setJiraBaseUrl(url);
    showToast('Jira Base URL saved', 'success');
    state.settings.jiraBaseUrl = url;
    // Check if we are now fully configured
    await loadSettings();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

async function saveApiKey(provider) {
  const electronAPI = getElectronAPI();
  const inputMap = {
    jules: elements.julesApiKey,
    cursor: elements.cursorApiKey,
    codex: elements.codexApiKey,
    claude: elements.claudeApiKey,
    github: elements.githubApiKey,
    jira: elements.jiraApiKey
  };
  const input = inputMap[provider];
  const key = input.value.trim();
  
  if (!key) {
    showToast('Please enter an API key', 'error');
    return;
  }

  try {
    await electronAPI.setApiKey(provider, key);
    input.value = '';
    input.placeholder = '••••••••••••••••';
    showToast(`${capitalizeFirst(provider)} API key saved`, 'success');
    
    // Show disconnect button
    const disconnectBtn = document.getElementById(`disconnect-${provider}-key`);
    if (disconnectBtn) {
      disconnectBtn.classList.remove('hidden');
    }
    
    // Update configured services state and UI visibility
    state.configuredServices[provider] = true;
    updateProviderFilterVisibility();
    
    await checkConnectionStatus();
    await loadAgents();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

async function testApiKey(provider) {
  const electronAPI = getElectronAPI();
  try {
    const result = await electronAPI.testApiKey(provider);
    if (result.success) {
      showToast(`${capitalizeFirst(provider)} connection verified`, 'success');
    } else {
      showToast(`${capitalizeFirst(provider)} connection failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Test failed: ${err.message}`, 'error');
  }
}

async function disconnectApiKey(provider) {
  const electronAPI = getElectronAPI();
  if (!await showConfirmModal(`Are you sure you want to disconnect from ${capitalizeFirst(provider)}? This will remove the saved API key.`, 'DISCONNECT PROVIDER')) {
    return;
  }

  try {
    await electronAPI.removeApiKey(provider);
    
    // Reset the input and placeholder
    const inputMap = {
      jules: elements.julesApiKey,
      cursor: elements.cursorApiKey,
      codex: elements.codexApiKey,
      claude: elements.claudeApiKey,
      github: elements.githubApiKey,
      jira: elements.jiraApiKey
    };
    const input = inputMap[provider];
    input.value = '';
    input.placeholder = `Enter ${capitalizeFirst(provider)} API key`;
    
    // Hide disconnect button
    const disconnectBtn = document.getElementById(`disconnect-${provider}-key`);
    if (disconnectBtn) {
      disconnectBtn.classList.add('hidden');
    }
    
    showToast(`${capitalizeFirst(provider)} disconnected`, 'success');
    
    // Update configured services state and UI visibility
    state.configuredServices[provider] = false;
    updateProviderFilterVisibility();
    
    await checkConnectionStatus();
    await loadAgents();
  } catch (err) {
    showToast(`Disconnect failed: ${err.message}`, 'error');
  }
}

async function saveCloudflareConfig() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.setCloudflareConfig) {
    showToast('Cloudflare settings are not available in this build', 'error');
    return;
  }

  const accountId = elements.cloudflareAccountId?.value?.trim() || '';
  const apiToken = elements.cloudflareApiToken?.value?.trim() || '';

  if (!accountId || !apiToken) {
    showToast('Please enter Cloudflare Account ID and API Token', 'error');
    return;
  }

  try {
    await electronAPI.setCloudflareConfig(accountId, apiToken);
    elements.cloudflareApiToken.value = '';
    showToast('Cloudflare KV configured', 'success');
    await loadSettings();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
}

async function testCloudflareConfig() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.testCloudflare) {
    showToast('Cloudflare test is not available in this build', 'error');
    return;
  }

  try {
    const result = await electronAPI.testCloudflare();
    if (result.success) {
      showToast('Cloudflare KV connection verified', 'success');
    } else {
      showToast(`Cloudflare KV failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Test failed: ${err.message}`, 'error');
  }
}

async function disconnectCloudflareConfig() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.clearCloudflareConfig) {
    showToast('Cloudflare disconnect is not available in this build', 'error');
    return;
  }

  if (!await showConfirmModal('Are you sure you want to disconnect Cloudflare KV? This will remove the saved Cloudflare credentials.', 'DISCONNECT CLOUDFLARE')) {
    return;
  }

  try {
    await electronAPI.clearCloudflareConfig();
    if (elements.cloudflareApiToken) {
      elements.cloudflareApiToken.value = '';
      elements.cloudflareApiToken.placeholder = 'Enter Cloudflare API token';
    }
    showToast('Cloudflare KV disconnected', 'success');
    await loadSettings();
  } catch (err) {
    showToast(`Disconnect failed: ${err.message}`, 'error');
  }
}

async function pushKeysToCloudflare() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.pushKeysToCloudflare) {
    showToast('Push keys feature not available', 'error');
    return;
  }

  if (!await showConfirmModal('Push local API keys to Cloudflare KV? This will overwrite existing keys in KV.', 'PUSH KEYS')) return;

  const btn = document.getElementById('push-keys-cf');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">sync</span> PUSHING...';

  try {
    const result = await electronAPI.pushKeysToCloudflare();
    if (result.success) {
       showToast('Keys pushed to Cloudflare successfully', 'success');
    } else {
       throw new Error(result.error);
    }
  } catch (err) {
    showToast(`Push failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function pullKeysFromCloudflare() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.pullKeysFromCloudflare) {
    showToast('Pull keys feature not available', 'error');
    return;
  }

  if (!await showConfirmModal('Pull API keys from Cloudflare KV? This will overwrite local keys.', 'PULL KEYS')) return;

  const btn = document.getElementById('pull-keys-cf');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">sync</span> PULLING...';

  try {
    const result = await electronAPI.pullKeysFromCloudflare();
    if (result.success) {
       showToast('Keys pulled from Cloudflare successfully', 'success');
       await loadSettings(); // Reload settings to show new keys
    } else {
       throw new Error(result.error);
    }
  } catch (err) {
    showToast(`Pull failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function setTheme(theme) {
  const electronAPI = getElectronAPI();
  try {
    await electronAPI.setTheme(theme);
    state.settings.theme = theme;
    applyTheme(theme);
    showToast(`Theme set to ${theme}`, 'success');
  } catch (err) {
    showToast(`Failed to set theme: ${err.message}`, 'error');
  }
}

function applyTheme(theme) {
  // Update button states
  ['system', 'light', 'dark'].forEach(t => {
    const btn = document.getElementById(`theme-${t}`);
    if (t === theme) {
      btn.classList.add('border-[#C2B280]', 'bg-[#C2B280]/5');
      btn.classList.remove('border-slate-200', 'dark:border-[#2A2A2A]');
      btn.querySelector('.technical-font').classList.add('text-[#C2B280]');
      btn.querySelector('.technical-font').classList.remove('text-slate-600', 'dark:text-slate-400');
      btn.querySelector('.material-symbols-outlined').classList.add('text-[#C2B280]');
      btn.querySelector('.material-symbols-outlined').classList.remove('text-slate-500');
    } else {
      btn.classList.remove('border-[#C2B280]', 'bg-[#C2B280]/5');
      btn.classList.add('border-slate-200', 'dark:border-[#2A2A2A]');
      btn.querySelector('.technical-font').classList.remove('text-[#C2B280]');
      btn.querySelector('.technical-font').classList.add('text-slate-600', 'dark:text-slate-400');
      btn.querySelector('.material-symbols-outlined').classList.remove('text-[#C2B280]');
      btn.querySelector('.material-symbols-outlined').classList.add('text-slate-500');
    }
  });

  // Apply theme to document
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

async function setDisplayMode(mode) {
  const electronAPI = getElectronAPI();
  try {
    await electronAPI.setDisplayMode(mode);
    state.settings.displayMode = mode;
    applyDisplayMode(mode);
    showToast(`Display mode set to ${mode === 'fullscreen' ? 'FULL SCREEN' : 'WINDOWED'}`, 'success');
  } catch (err) {
    showToast(`Failed to set display mode: ${err.message}`, 'error');
  }
}

function applyDisplayMode(mode) {
  ['windowed', 'fullscreen'].forEach(m => {
    const btn = document.getElementById(`display-${m}`);
    if (m === mode) {
      // Active styles
      btn.classList.add('border-[#C2B280]', 'bg-[#C2B280]/5');
      btn.classList.remove('border-slate-200', 'dark:border-[#2A2A2A]');
      btn.querySelector('.technical-font').classList.add('text-[#C2B280]');
      btn.querySelector('.technical-font').classList.remove('text-slate-600', 'dark:text-slate-400');
      btn.querySelector('.material-symbols-outlined').classList.add('text-[#C2B280]');
      btn.querySelector('.material-symbols-outlined').classList.remove('text-slate-500');
    } else {
      // Inactive styles
      btn.classList.remove('border-[#C2B280]', 'bg-[#C2B280]/5');
      btn.classList.add('border-slate-200', 'dark:border-[#2A2A2A]');
      btn.querySelector('.technical-font').classList.remove('text-[#C2B280]');
      btn.querySelector('.technical-font').classList.add('text-slate-600', 'dark:text-slate-400');
      btn.querySelector('.material-symbols-outlined').classList.remove('text-[#C2B280]');
      btn.querySelector('.material-symbols-outlined').classList.add('text-slate-500');
    }
  });
}

async function updatePollingSettings(enabled, interval) {
  const electronAPI = getElectronAPI();
  try {
    await electronAPI.setPolling(enabled, interval);
    state.settings.autoPolling = enabled;
    state.settings.pollingInterval = interval;
  } catch (err) {
    showToast(`Settings update failed: ${err.message}`, 'error');
  }
}

async function addGeminiPath() {
  const electronAPI = getElectronAPI();
  const path = elements.newGeminiPath.value.trim();
  if (!path) return;

  try {
    const result = await electronAPI.addGeminiPath(path);
    state.settings.geminiPaths = result.paths;
    elements.newGeminiPath.value = '';
    renderGeminiPaths();
    await loadAgents();
    showToast('Path added successfully', 'success');
  } catch (err) {
    showToast(`Failed to add path: ${err.message}`, 'error');
  }
}

async function addClaudePath() {
  const electronAPI = getElectronAPI();
  const path = elements.newClaudePath.value.trim();
  if (!path) return;

  try {
    const result = await electronAPI.addClaudePath(path);
    state.settings.claudePaths = result.paths;
    elements.newClaudePath.value = '';
    renderClaudePaths();
    await loadAgents();
    showToast('Path added successfully', 'success');
  } catch (err) {
    showToast(`Failed to add path: ${err.message}`, 'error');
  }
}

async function addCursorPath() {
  const electronAPI = getElectronAPI();
  const path = elements.newCursorPath.value.trim();
  if (!path) return;

  try {
    const result = await electronAPI.addCursorPath(path);
    state.settings.cursorPaths = result.paths;
    elements.newCursorPath.value = '';
    renderCursorPaths();
    await loadAgents();
    showToast('Path added successfully', 'success');
  } catch (err) {
    showToast(`Failed to add path: ${err.message}`, 'error');
  }
}

async function addCodexPath() {
  const electronAPI = getElectronAPI();
  const path = elements.newCodexPath.value.trim();
  if (!path) return;

  try {
    const result = await electronAPI.addCodexPath(path);
    state.settings.codexPaths = result.paths;
    elements.newCodexPath.value = '';
    renderCodexPaths();
    await loadAgents();
    showToast('Path added successfully', 'success');
  } catch (err) {
    showToast(`Failed to add path: ${err.message}`, 'error');
  }
}

// Make remove functions available globally
window.removeGeminiPath = async function(path) {
  const electronAPI = getElectronAPI();
  try {
    const result = await electronAPI.removeGeminiPath(path);
    state.settings.geminiPaths = result.paths;
    renderGeminiPaths();
    await loadAgents();
    showToast('Path removed', 'success');
  } catch (err) {
    showToast(`Failed to remove path: ${err.message}`, 'error');
  }
};

window.removeClaudePath = async function(path) {
  const electronAPI = getElectronAPI();
  try {
    const result = await electronAPI.removeClaudePath(path);
    state.settings.claudePaths = result.paths;
    renderClaudePaths();
    await loadAgents();
    showToast('Path removed', 'success');
  } catch (err) {
    showToast(`Failed to remove path: ${err.message}`, 'error');
  }
};

window.removeCursorPath = async function(path) {
  const electronAPI = getElectronAPI();
  try {
    const result = await electronAPI.removeCursorPath(path);
    state.settings.cursorPaths = result.paths;
    renderCursorPaths();
    await loadAgents();
    showToast('Path removed', 'success');
  } catch (err) {
    showToast(`Failed to remove path: ${err.message}`, 'error');
  }
};

window.removeCodexPath = async function(path) {
  const electronAPI = getElectronAPI();
  try {
    const result = await electronAPI.removeCodexPath(path);
    state.settings.codexPaths = result.paths;
    renderCodexPaths();
    await loadAgents();
    showToast('Path removed', 'success');
  } catch (err) {
    showToast(`Failed to remove path: ${err.message}`, 'error');
  }
};

async function addGithubPath() {
  const electronAPI = getElectronAPI();
  const path = elements.newGithubPath.value.trim();
  if (!path) return;

  try {
    const result = await electronAPI.addGithubPath(path);
    state.settings.githubPaths = result.paths;
    elements.newGithubPath.value = '';
    renderGithubPaths();
    await loadAgents();
    showToast('GitHub path added successfully', 'success');
  } catch (err) {
    showToast(`Failed to add path: ${err.message}`, 'error');
  }
}

// Make removeGithubPath available globally
window.removeGithubPath = async function(path) {
  const electronAPI = getElectronAPI();
  try {
    const result = await electronAPI.removeGithubPath(path);
    state.settings.githubPaths = result.paths;
    renderGithubPaths();
    await loadAgents();
    showToast('GitHub path removed', 'success');
  } catch (err) {
    showToast(`Failed to remove path: ${err.message}`, 'error');
  }
};

async function updateApplication() {
  const electronAPI = getElectronAPI();
  if (!await showConfirmModal('Are you sure you want to update and restart the application? This will stop all running tasks.', 'UPDATE APPLICATION')) {
    return;
  }

  const btn = document.getElementById('update-app-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">sync</span> UPDATING...';

  try {
    // Check connection status before attempting update
    const status = await electronAPI.getConnectionStatus();
    // We don't strictly need a provider status to be true to run git pull,
    // but we can at least show a toast starting the process.

    showToast('Initiating update sequence...', 'info');
    await electronAPI.updateApp();
    // The app will restart if successful, so we might not reach here,
    // or we might want to handle failure case.
  } catch (err) {
    showToast(`Update failed: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined text-sm">download</span> UPDATE & RESTART';
  }
}

function renderGithubPaths() {
  const paths = state.settings.githubPaths || [];
  
  if (paths.length === 0) {
    elements.githubPathsList.innerHTML = '';
    elements.githubPathsEmpty.classList.remove('hidden');
    return;
  }

  elements.githubPathsEmpty.classList.add('hidden');
  elements.githubPathsList.innerHTML = paths.map(path => `
    <div class="flex items-center justify-between p-3 bg-slate-700/20 border border-[#2A2A2A]">
      <span class="text-sm text-slate-300 font-mono truncate">${escapeHtml(path)}</span>
      <button onclick="removeGithubPath('${escapeHtml(path)}')" 
              class="text-slate-400 hover:text-red-400 transition-colors">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  `).join('');
}

// ============================================ 
// Modal
// ============================================ 

window.openAgentDetails = async function(provider, rawId, filePath) {
  const electronAPI = getElectronAPI();
  elements.agentModal.classList.remove('hidden');
  elements.modalContent.innerHTML = `
    <div class="flex items-center justify-center h-32">
      <span class="material-symbols-outlined text-[#C2B280] text-4xl animate-spin">sync</span>
    </div>
  `;

  const providerStyle = getProviderStyle(provider);
  elements.modalProviderBadge.className = `px-3 py-1 text-[10px] technical-font border ${providerStyle.border} ${providerStyle.text}`;
  elements.modalProviderBadge.textContent = provider.toUpperCase();

  try {
    const details = await electronAPI.getAgentDetails(provider, rawId, filePath);
    // Persist current task info for refresh
    state.currentTask = { provider, rawId, filePath };
    renderAgentDetails(provider, details);
  } catch (err) {
    elements.modalContent.innerHTML = `
      <div class="text-center py-8">
        <span class="material-symbols-outlined text-red-400 text-4xl mb-4">error</span>
        <p class="technical-font text-red-400">Failed to load: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
};

window.refreshAgentDetails = async function() {
  if (state.currentTask) {
    const { provider, rawId, filePath } = state.currentTask;
    await window.openAgentDetails(provider, rawId, filePath);
  }
};

function renderAgentDetails(provider, details) {
  elements.modalTitle.textContent = details.name || 'Task Details';
  
  // Update status badge
  const statusStyle = getStatusStyle(details.status);
  elements.modalStatusBadge.className = `px-2 py-0.5 text-[10px] technical-font ${statusStyle.bg} ${statusStyle.text} font-bold`;
  elements.modalStatusBadge.textContent = getTacticalStatus(details.status);
  
  // Update subtitle
  const modalSubtitle = document.getElementById('modal-subtitle');
  if (modalSubtitle) {
    modalSubtitle.textContent = `STATUS: ${getTacticalStatus(details.status)}`;
  }

  // Update task ID
  if (elements.modalTaskId && details.rawId) {
    elements.modalTaskId.textContent = `TASK_ID: ${details.rawId}`;
  }

  let content = '<div class="space-y-8">';

  // Metadata Grid
  content += `
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-[#1A1A1A] border border-[#2A2A2A] p-4">
        <div class="text-[9px] technical-font text-[#C2B280] mb-2">Info</div>
        <div class="space-y-3">
          <div class="flex flex-col">
            <span class="text-[9px] technical-font text-slate-500">Created</span>
            <span class="text-xs font-mono text-slate-300">${details.createdAt ? new Date(details.createdAt).toLocaleString() : '--'}</span>
          </div>
          ${details.updatedAt ? `
          <div class="flex flex-col">
            <span class="text-[9px] technical-font text-slate-500">Last Update</span>
            <span class="text-xs font-mono text-slate-300">${new Date(details.updatedAt).toLocaleString()}</span>
          </div>
          ` : ''}
        </div>
      </div>
      <div class="bg-[#1A1A1A] border border-[#2A2A2A] p-4 flex flex-col justify-between">
        <div>
          <div class="text-[9px] technical-font text-[#C2B280] mb-2">Repo</div>
          ${details.repository ? `
          <div class="flex items-center gap-2 mb-3">
            <span class="material-symbols-outlined text-sm text-slate-500">folder</span>
            <span class="text-xs font-mono text-slate-300">${escapeHtml(extractRepoName(details.repository))}</span>
          </div>
          ` : ''}
          ${details.branch ? `
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sm text-slate-500">fork_right</span>
            <span class="text-xs font-mono text-slate-300">${escapeHtml(details.branch)}</span>
          </div>
          ` : ''}
        </div>
        <div class="mt-4 flex justify-end gap-2">
          ${details.webUrl ? `
          <button onclick="openExternal('${details.webUrl}')" class="bg-[#1A1A1A] text-slate-300 border border-slate-600 px-4 py-1.5 text-[10px] technical-font font-bold hover:bg-slate-800 flex items-center gap-2">
            <span class="material-symbols-outlined text-xs">terminal</span>
            View Console
          </button>
          ` : ''}
          ${details.prUrl ? `
          <button onclick="openExternal('${details.prUrl}')" class="bg-[#C2B280] text-black px-4 py-1.5 text-[10px] technical-font font-bold hover:brightness-110 flex items-center gap-2">
            <span class="material-symbols-outlined text-xs">open_in_new</span>
            View PR
          </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  const promptHtml = details.prompt ? sanitizeMarkdownToHtml(details.prompt) : '';

  // Task Description Section
  if (details.prompt) {
    content += `
      <section>
        <div class="flex items-center gap-2 mb-3 border-l-2 border-[#C2B280] pl-3">
          <span class="material-symbols-outlined text-sm text-[#C2B280]">edit_note</span>
          <h3 class="text-[11px] technical-font text-[#C2B280] font-bold">Task Description</h3>
        </div>
        <div class="bg-[#1A1A1A] border border-[#2A2A2A] p-6">
          <div class="markdown-content text-sm text-slate-300 font-light leading-relaxed">${promptHtml}</div>
        </div>
      </section>
    `;
  }

  // Summary Section
  if (details.summary) {
    content += `
      <section>
        <div class="flex items-center gap-2 mb-3 border-l-2 border-[#C2B280] pl-3">
          <span class="material-symbols-outlined text-sm text-[#C2B280]">description</span>
          <h3 class="text-[11px] technical-font text-[#C2B280] font-bold">Summary</h3>
        </div>
        <div class="bg-[#1A1A1A] border border-[#2A2A2A] p-6">
          <p class="text-sm text-slate-300 font-light leading-relaxed">${escapeHtml(details.summary)}</p>
        </div>
      </section>
    `;
  }

  // Conversation/Messages Section
  if (details.conversation && details.conversation.length > 0) {
    content += `
      <section>
        <div class="flex items-center justify-between mb-3 border-l-2 border-[#C2B280] pl-3">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sm text-[#C2B280]">chat</span>
            <h3 class="text-[11px] technical-font text-[#C2B280] font-bold">Conversation</h3>
          </div>
          <span class="text-[9px] technical-font text-slate-500">${details.conversation.length} entries</span>
        </div>
        <div class="space-y-3 max-h-72 overflow-y-auto pr-2 mb-4">
          ${details.conversation.map(msg => `
            <div class="flex ${msg.isUser ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[85%] ${msg.isUser ? 'bg-[#C2B280]/10 border-[#C2B280]/30' : 'bg-[#1A1A1A] border-[#2A2A2A]'} border p-3">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[9px] technical-font ${msg.isUser ? 'text-[#C2B280]' : 'text-slate-400'}">${msg.isUser ? 'You' : 'Agent'}</span>
                </div>
                <p class="text-sm text-white leading-relaxed">${escapeHtml(msg.text || '')}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // Activities Section (Jules)
  if (details.activities && details.activities.length > 0) {
    content += `
      <section>
        <div class="flex items-center justify-between mb-4 border-l-2 border-[#C2B280] pl-3">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sm text-[#C2B280]">history</span>
            <h3 class="text-[11px] technical-font text-[#C2B280] font-bold">Activity</h3>
          </div>
          <span class="text-[9px] technical-font text-slate-500">${details.activities.length} events</span>
        </div>
        <div class="relative pl-8 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#C2B280]/30">
          ${details.activities.map((activity, index) => `
            <div class="relative">
              <div class="absolute -left-[26px] top-1.5 w-4 h-4 ${index === 0 ? 'bg-[#C2B280]' : 'bg-[#C2B280]/40'} border-4 border-[#0D0D0D]"></div>
              <div class="flex justify-between items-start">
                <div>
                  <p class="text-sm text-white font-medium">${escapeHtml(activity.title || activity.type)}</p>
                </div>
                <span class="text-[10px] technical-font text-slate-500">${activity.timestamp ? formatTimeAgo(activity.timestamp) : ''}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // Messages Section (Gemini)
  if (details.messages && details.messages.length > 0) {
    content += `
      <section>
        <div class="flex items-center justify-between mb-3 border-l-2 border-[#C2B280] pl-3">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-sm text-[#C2B280]">chat</span>
            <h3 class="text-[11px] technical-font text-[#C2B280] font-bold">Messages</h3>
          </div>
          <span class="text-[9px] technical-font text-slate-500">${details.messages.length} entries</span>
        </div>
        <div class="space-y-3 max-h-72 overflow-y-auto pr-2">
          ${details.messages.map(msg => `
            <div class="flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[85%] ${msg.role === 'user' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[#1A1A1A] border-[#2A2A2A]'} border p-3">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[9px] technical-font ${msg.role === 'user' ? 'text-emerald-400' : 'text-slate-400'}">${capitalizeFirst(msg.role)}</span>
                </div>
                <p class="text-sm text-white leading-relaxed whitespace-pre-wrap">${escapeHtml(msg.content || '')}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  // Follow-up Input Section (Jules/Cursor)
  if ((provider === 'jules' || provider === 'cursor') && details.rawId) {
    content += `
      <section class="mt-6 pt-4 border-t border-[#2A2A2A]">
        <div class="flex flex-col gap-2">
           <label class="text-[10px] technical-font text-slate-500 uppercase">Send Follow-up Message</label>
           <textarea id="follow-up-input"
                     class="w-full bg-[#0D0D0D] border border-[#2A2A2A] text-slate-300 text-sm p-3 focus:border-[#C2B280] focus:outline-none transition-colors h-24 resize-none"
                     placeholder="Type instructions to continue task..."></textarea>
           <div class="flex justify-end mt-2">
              <button onclick="sendFollowUp('${provider}', '${escapeJsString(details.rawId)}')"
                      id="send-follow-up-btn"
                      class="bg-[#C2B280] text-black px-4 py-2 text-xs technical-font font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                 <span class="material-symbols-outlined text-sm">send</span>
                 SEND
              </button>
           </div>
        </div>
      </section>
    `;
  }

  content += '</div>';
  elements.modalContent.innerHTML = content;
}

window.sendFollowUp = async function(provider, rawId) {
  const input = document.getElementById('follow-up-input');
  const btn = document.getElementById('send-follow-up-btn');
  const message = input.value.trim();

  if (!message) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">sync</span> SENDING...';

  try {
    const electronAPI = getElectronAPI();
    await electronAPI.sendMessage(provider, rawId, message);

    // Clear input
    input.value = '';

    // Refresh details to show new message (might take a moment for backend to process)
    // Wait briefly then refresh
    setTimeout(() => window.refreshAgentDetails(), 1000);

    showToast('Message sent successfully', 'success');
  } catch (err) {
    showToast(`Failed to send message: ${err.message}`, 'error');
  } finally {
    if (btn) { // Check if element still exists (modal might have closed)
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-sm">send</span> SEND';
    }
  }
};

window.closeModal = function() {
  elements.agentModal.classList.add('hidden');
};

// ============================================ 
// New Task Modal
// ============================================ 

function setNewTaskBranchOptions(branchNames, preferred = 'main') {
  const unique = Array.from(new Set((branchNames || []).filter(Boolean)));

  // Always include main as the preferred default.
  if (!unique.includes('main')) unique.unshift('main');

  // Put main/master first (common), then the rest alphabetically.
  const rest = unique.filter(b => b !== 'main' && b !== 'master').sort((a, b) => a.localeCompare(b));
  const ordered = [
    ...(unique.includes('main') ? ['main'] : []),
    ...(unique.includes('master') ? ['master'] : []),
    ...rest
  ];

  const previous = elements.taskBranch.value;
  elements.taskBranch.innerHTML = ordered.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

  if (previous && ordered.includes(previous)) {
    elements.taskBranch.value = previous;
  } else if (preferred && ordered.includes(preferred)) {
    elements.taskBranch.value = preferred;
  } else if (ordered.includes('main')) {
    elements.taskBranch.value = 'main';
  } else {
    elements.taskBranch.value = ordered[0] || 'main';
  }
}

function resetNewTaskBranchDropdown() {
  // Provide a sane default even when we can't fetch branches.
  setNewTaskBranchOptions(['main', 'master'], 'main');
}

function populateTargetDeviceDropdown() {
  const select = elements.newTaskTargetDevice;
  if (!select) return;

  select.innerHTML = '';

  // Option 1: Cloud Provider
  const cloudOption = document.createElement('option');
  cloudOption.value = 'cloud';
  cloudOption.textContent = 'CLOUD PROVIDER (JULES, CURSOR, CLAUDE)';
  select.appendChild(cloudOption);

  // Option 2: Local Device
  const localOption = document.createElement('option');
  localOption.value = 'local';
  localOption.textContent = 'THIS COMPUTER (LOCAL)';
  select.appendChild(localOption);

  // Option 3: Remote Computers
  // Filter out the local computer from remote list
  state.computers.list.forEach(device => {
    if (device.id === state.localDeviceId) return;

    // Only show devices that are ON or have recent heartbeat
    const lastHeartbeat = device.lastHeartbeat || device.heartbeatAt || device.updatedAt;
    const isOnline = device.status === 'on' || (lastHeartbeat && (Date.now() - new Date(lastHeartbeat).getTime() < 1000 * 60 * 6)); // 6 mins

    // Only show devices that have local CLI tools (Gemini/Claude)
    // New structure: tools[0]['CLI tools'] is array of strings
    let hasTools = false;
    if (Array.isArray(device.tools) && device.tools.length > 0 && Array.isArray(device.tools[0]['CLI tools'])) {
      const cliTools = device.tools[0]['CLI tools'];
      // Check for Gemini CLI, Codex CLI, or claude CLI as these are the remote-capable tools
      hasTools = cliTools.includes('Gemini CLI') || cliTools.includes('claude CLI') || cliTools.includes('Codex CLI');
    } else {
      // Fallback for old structure (object with boolean values)
      hasTools = device.tools && !Array.isArray(device.tools) && Object.values(device.tools).some(t => t);
    }

    if (isOnline && hasTools) {
       const option = document.createElement('option');
       option.value = device.id;
       option.textContent = `REMOTE: ${(device.name || device.id).toUpperCase()}`;
       select.appendChild(option);
    }
  });
}

function handleTargetDeviceChange(e) {
  const value = e.target.value;

  if (value === 'cloud') {
    state.newTask.targetDevice = 'cloud';
  } else if (value === 'local') {
    state.newTask.targetDevice = 'local';
  } else {
    state.newTask.targetDevice = state.computers.list.find(d => d.id === value) || null;
  }

  // Reset service selection as available services might change
  state.newTask.selectedService = null;
  resetNewTaskForm(false); // don't reset target device

  updateServiceButtonVisibility();
}

function tryParseGithubOwnerRepo(repoData) {
  if (!repoData) return null;

  // Jules sources include explicit owner/repo.
  if (repoData.owner && repoData.repo) {
    return { owner: repoData.owner, repo: repoData.repo };
  }

  // Cursor repos usually provide a GitHub URL.
  const url = repoData.url || repoData.repository || '';
  const match = typeof url === 'string' ? url.match(/github\.com\/([^\/]+)\/([^\/]+)/) : null;
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  return null;
}

async function refreshNewTaskBranchesFromSelectedRepo() {
  // Only relevant when branch input is visible (Jules/Cursor).
  if (elements.branchInputContainer.classList.contains('hidden')) return;

  const repoDataStr = elements.taskRepo.dataset.repoData;
  const repoData = repoDataStr ? JSON.parse(repoDataStr) : null;

  // Always fall back to main (+ default branch if known).
  const fallback = ['main', 'master'];
  if (repoData?.defaultBranch) fallback.unshift(repoData.defaultBranch);

  const electronAPI = getElectronAPI();
  const canFetch = !!(electronAPI?.github?.getBranches && state.configuredServices.github);
  const gh = canFetch ? tryParseGithubOwnerRepo(repoData) : null;

  if (!canFetch || !gh) {
    setNewTaskBranchOptions(fallback, 'main');
    return;
  }

  try {
    const result = await electronAPI.github.getBranches(gh.owner, gh.repo);
    const branches = (result?.success ? result.branches : null) || [];
    const names = branches.map(b => b?.name).filter(Boolean);

    setNewTaskBranchOptions([...fallback, ...names], 'main');
  } catch (err) {
    console.warn('Failed to load branches for new task:', err);
    setNewTaskBranchOptions(fallback, 'main');
  }
}

function openNewTaskModal() {
  // Reset state
  state.newTask = {
    selectedService: null,
    repositories: [],
    loadingRepos: false,
    creating: false,
    promptMode: 'write',
    pastedImages: []
  };

  // Populate devices
  populateTargetDeviceDropdown();
  // Default to Local CLI if available, else Cloud
  if (elements.newTaskTargetDevice) {
     // Check if we have options (populateTargetDeviceDropdown creates groups)
     // Try to select 'local' by default
     elements.newTaskTargetDevice.value = 'local';
     state.newTask.targetDevice = 'local';
  }

  // Reset form
  resetNewTaskForm();
  
  // Update service button visibility based on configured services
  updateServiceButtonVisibility();
  
  // Show modal
  elements.newTaskModal.classList.remove('hidden');
}

window.openNewTaskModal = openNewTaskModal;

window.closeNewTaskModal = function() {
  elements.newTaskModal.classList.add('hidden');
  resetNewTaskForm();
};

// ============================================
// Create Repo Modal
// ============================================

function hideCreateRepoError() {
  if (!elements.createRepoError) return;
  elements.createRepoError.textContent = '';
  elements.createRepoError.classList.add('hidden');
}

function showCreateRepoError(message) {
  if (!elements.createRepoError) return;
  elements.createRepoError.textContent = message || 'Failed to create repository';
  elements.createRepoError.classList.remove('hidden');
}

function setCreateRepoLoading(loading) {
  state.createRepo.loading = !!loading;
  if (elements.createRepoSubmitBtn) elements.createRepoSubmitBtn.disabled = !!loading;
  if (elements.createRepoLoading) elements.createRepoLoading.classList.toggle('hidden', !loading);
}

function setCreateRepoVisibility(isPrivate) {
  state.createRepo.githubPrivate = !!isPrivate;

  const activeClasses = ['bg-[#C2B280]', 'text-black'];
  const inactiveClasses = ['bg-black/20'];

  if (elements.createRepoVisibilityPublic && elements.createRepoVisibilityPrivate) {
    // Public selected
    elements.createRepoVisibilityPublic.classList.toggle(activeClasses[0], !state.createRepo.githubPrivate);
    elements.createRepoVisibilityPublic.classList.toggle(activeClasses[1], !state.createRepo.githubPrivate);
    elements.createRepoVisibilityPublic.classList.toggle(inactiveClasses[0], state.createRepo.githubPrivate);

    // Private selected
    elements.createRepoVisibilityPrivate.classList.toggle(activeClasses[0], state.createRepo.githubPrivate);
    elements.createRepoVisibilityPrivate.classList.toggle(activeClasses[1], state.createRepo.githubPrivate);
    elements.createRepoVisibilityPrivate.classList.toggle(inactiveClasses[0], !state.createRepo.githubPrivate);
  }
}

function updateCreateRepoModalVisibility() {
  const loc = state.createRepo.location;

  if (elements.createRepoGithubSettings) {
    elements.createRepoGithubSettings.classList.toggle('hidden', loc !== 'github');
  }
  if (elements.createRepoLocalSettings) {
    elements.createRepoLocalSettings.classList.toggle('hidden', loc !== 'local');
  }
  if (elements.createRepoRemoteSettings) {
    elements.createRepoRemoteSettings.classList.toggle('hidden', loc !== 'remote');
  }
}

async function populateCreateRepoGithubOwners() {
  const electronAPI = getElectronAPI();
  if (!elements.createRepoGithubOwner) return;

  elements.createRepoGithubOwner.innerHTML = `<option value="">${state.configuredServices.github ? 'LOADING...' : 'GITHUB NOT CONFIGURED'}</option>`;

  if (!state.configuredServices.github || !electronAPI?.github?.getOwners) {
    return;
  }

  try {
    const result = await electronAPI.github.getOwners();
    const user = result?.user?.login;
    const orgs = Array.isArray(result?.orgs) ? result.orgs : [];

    const options = [];
    if (user) {
      options.push({ value: `user:${user}`, label: `${user} (personal)` });
    }
    orgs.forEach(o => {
      const login = o?.login;
      if (login) options.push({ value: `org:${login}`, label: `${login} (org)` });
    });

    if (options.length === 0) {
      elements.createRepoGithubOwner.innerHTML = `<option value="">NO OWNERS FOUND</option>`;
      return;
    }

    elements.createRepoGithubOwner.innerHTML = options
      .map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
      .join('');

    // Default to personal account if present
    const defaultValue = options[0]?.value || '';
    elements.createRepoGithubOwner.value = defaultValue;
    state.createRepo.githubOwner = defaultValue;
  } catch (err) {
    console.warn('Failed to load GitHub owners:', err?.message || err);
    elements.createRepoGithubOwner.innerHTML = `<option value="">FAILED TO LOAD</option>`;
  }
}

function populateCreateRepoRemoteDevices() {
  if (!elements.createRepoRemoteDevice) return;

  const devices = Array.isArray(state.computers.list) ? state.computers.list : [];
  const remote = devices.filter(d => d?.id && d.id !== state.localDeviceId);

  const options = [
    `<option value="">SELECT A COMPUTER...</option>`,
    ...remote.map(d => {
      const status = (d.status || '').toUpperCase();
      const label = `${d.name || d.id} ${status ? `(${status})` : ''}`;
      return `<option value="${escapeHtml(d.id)}">${escapeHtml(label)}</option>`;
    })
  ];

  elements.createRepoRemoteDevice.innerHTML = options.join('');
}

async function openCreateRepoModal() {
  hideCreateRepoError();

  state.createRepo.open = true;
  state.createRepo.loading = false;
  state.createRepo.location = 'github';
  state.createRepo.name = '';
  state.createRepo.githubOwner = '';
  state.createRepo.githubPrivate = false;
  state.createRepo.remoteDeviceId = '';

  // Default local dir to first GitHub path (if configured)
  const defaultDir = Array.isArray(state.settings.githubPaths) && state.settings.githubPaths.length > 0
    ? state.settings.githubPaths[0]
    : '';
  state.createRepo.localDir = defaultDir;

  if (elements.createRepoLocation) elements.createRepoLocation.value = state.createRepo.location;
  if (elements.createRepoName) elements.createRepoName.value = '';
  if (elements.createRepoLocalDir) elements.createRepoLocalDir.value = defaultDir;

  setCreateRepoVisibility(false);
  updateCreateRepoModalVisibility();

  // Ensure computers are loaded so we can populate remote targets
  if (state.computers.configured && (!Array.isArray(state.computers.list) || state.computers.list.length === 0)) {
    await loadComputers();
  }
  populateCreateRepoRemoteDevices();

  await populateCreateRepoGithubOwners();

  if (elements.createRepoModal) {
    elements.createRepoModal.classList.remove('hidden');
  }
}

function closeCreateRepoModal() {
  state.createRepo.open = false;
  setCreateRepoLoading(false);
  hideCreateRepoError();
  if (elements.createRepoModal) {
    elements.createRepoModal.classList.add('hidden');
  }
}

async function submitCreateRepo() {
  const electronAPI = getElectronAPI();
  if (!electronAPI) {
    showCreateRepoError('Electron API unavailable');
    return;
  }

  hideCreateRepoError();

  const location = elements.createRepoLocation?.value || state.createRepo.location;
  const name = (elements.createRepoName?.value || '').trim();
  if (!name) {
    showCreateRepoError('Repository name is required');
    return;
  }

  setCreateRepoLoading(true);

  try {
    if (location === 'github') {
      const ownerValue = elements.createRepoGithubOwner?.value || '';
      if (!ownerValue) throw new Error('Select an owner (org or personal)');

      const [ownerType, owner] = ownerValue.split(':');
      if (!ownerType || !owner) throw new Error('Invalid owner selection');

      if (!electronAPI.github?.createRepo) throw new Error('GitHub create repo API not available');

      const result = await electronAPI.github.createRepo({
        ownerType,
        owner,
        name,
        private: !!state.createRepo.githubPrivate
      });

      if (!result?.success) throw new Error(result?.error || 'Failed to create GitHub repository');

      closeCreateRepoModal();
      await loadBranches();
      void window.showConfirmModal?.(`Created ${result.repo?.full_name || name} on GitHub.`, 'REPOSITORY CREATED');
      return;
    }

    if (location === 'local') {
      const dir = (elements.createRepoLocalDir?.value || '').trim();
      if (!dir) throw new Error('Directory is required for local repos');
      if (!electronAPI.projects?.createLocalRepo) throw new Error('Local repo creation API not available');

      const result = await electronAPI.projects.createLocalRepo({ name, directory: dir });
      if (!result?.success) throw new Error(result?.error || 'Failed to create local repository');

      closeCreateRepoModal();
      void window.showConfirmModal?.(`Created local repo at ${result.path}`, 'REPOSITORY CREATED');
      return;
    }

    if (location === 'remote') {
      const deviceId = elements.createRepoRemoteDevice?.value || '';
      if (!deviceId) throw new Error('Select a remote computer');
      if (!electronAPI.projects?.enqueueCreateRepo) throw new Error('Remote repo creation API not available');

      const result = await electronAPI.projects.enqueueCreateRepo({ deviceId, name });
      if (!result?.success) throw new Error(result?.error || 'Failed to enqueue remote repo creation');

      closeCreateRepoModal();
      void window.showConfirmModal?.(`Queued repo creation on remote device.`, 'REPO QUEUED');
      return;
    }

    throw new Error(`Unknown location: ${location}`);
  } catch (err) {
    console.error('Create repo failed:', err);
    showCreateRepoError(err?.message || 'Create repo failed');
  } finally {
    setCreateRepoLoading(false);
  }
}

window.openCreateRepoModal = openCreateRepoModal;
window.closeCreateRepoModal = closeCreateRepoModal;
window.submitCreateRepo = submitCreateRepo;

function sanitizeMarkdownToHtml(markdown) {
  try {
    if (typeof marked?.parse !== 'function' || typeof DOMPurify?.sanitize !== 'function') {
      return `<pre class="whitespace-pre-wrap">${escapeHtml(markdown || '')}</pre>`;
    }
    const html = marked.parse(markdown || '');
    return DOMPurify.sanitize(html);
  } catch (err) {
    console.warn('Markdown render failed:', err);
    return `<pre class="whitespace-pre-wrap">${escapeHtml(markdown || '')}</pre>`;
  }
}

function setTaskPromptMode(mode) {
  state.newTask.promptMode = mode === 'preview' ? 'preview' : 'write';

  const isPreview = state.newTask.promptMode === 'preview';
  elements.taskPrompt.classList.toggle('hidden', isPreview);
  elements.taskPromptPreview.classList.toggle('hidden', !isPreview);
  elements.taskSpeechBtn?.classList.toggle('hidden', isPreview);

  // Simple active styling
  if (elements.taskPromptTabWrite && elements.taskPromptTabPreview) {
    const activeClasses = ['bg-[#C2B280]', 'text-black'];
    const inactiveClasses = ['text-slate-400'];

    elements.taskPromptTabWrite.classList.toggle(activeClasses[0], !isPreview);
    elements.taskPromptTabWrite.classList.toggle(activeClasses[1], !isPreview);
    elements.taskPromptTabWrite.classList.toggle(inactiveClasses[0], isPreview);

    elements.taskPromptTabPreview.classList.toggle(activeClasses[0], isPreview);
    elements.taskPromptTabPreview.classList.toggle(activeClasses[1], isPreview);
    elements.taskPromptTabPreview.classList.toggle(inactiveClasses[0], !isPreview);
  }

  if (isPreview) {
    renderTaskPromptPreview();
  }
}

window.setTaskPromptMode = setTaskPromptMode;

function renderTaskPromptPreview() {
  if (!elements.taskPromptPreview) return;
  const prompt = elements.taskPrompt?.value || '';
  elements.taskPromptPreview.innerHTML = sanitizeMarkdownToHtml(prompt);
}

function renderNewTaskPastedImages() {
  if (!elements.taskPromptImages || !elements.taskPromptImagesContainer) return;

  const imgs = state.newTask.pastedImages || [];
  elements.taskPromptImagesContainer.classList.toggle('hidden', imgs.length === 0);
  if (elements.taskPromptImagesCount) {
    elements.taskPromptImagesCount.textContent = `${imgs.length}`;
  }

  elements.taskPromptImages.innerHTML = imgs.map(img => `
    <div class="relative w-20 h-20 border border-[#2A2A2A] bg-black overflow-hidden group cursor-pointer"
         onclick="openPastedImageModal('${escapeJsString(img.id)}')"
         title="${escapeHtml(img.name || 'pasted image')}">
      <img src="${escapeHtml(img.dataUrl)}" alt="${escapeHtml(img.name || 'pasted image')}"
           class="w-full h-full object-cover" />
      <button type="button"
              onclick="event.stopPropagation(); removePastedImage('${escapeJsString(img.id)}')"
              class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-black/70 text-slate-200 hover:text-red-300 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove">
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  `).join('');
}

function openPastedImageModal(imageId) {
  const img = (state.newTask.pastedImages || []).find(i => i.id === imageId);
  if (!img || !elements.pastedImageModal || !elements.pastedImageModalImg) return;
  elements.pastedImageModalImg.src = img.dataUrl;
  elements.pastedImageModal.classList.remove('hidden');
}

function closePastedImageModal() {
  if (!elements.pastedImageModal || !elements.pastedImageModalImg) return;
  elements.pastedImageModal.classList.add('hidden');
  elements.pastedImageModalImg.src = '';
}

function removePastedImage(imageId) {
  state.newTask.pastedImages = (state.newTask.pastedImages || []).filter(i => i.id !== imageId);
  renderNewTaskPastedImages();
}

window.openPastedImageModal = openPastedImageModal;
window.closePastedImageModal = closePastedImageModal;
window.removePastedImage = removePastedImage;

async function handleTaskPromptPaste(event) {
  const items = event.clipboardData?.items ? Array.from(event.clipboardData.items) : [];
  const imageItems = items.filter(i => i.kind === 'file' && typeof i.type === 'string' && i.type.startsWith('image/'));
  if (imageItems.length === 0) return;

  // Avoid inserting the image as text (some browsers paste a filename/placeholder).
  event.preventDefault();

  const files = imageItems.map(i => i.getAsFile()).filter(Boolean);
  for (const file of files) {
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read pasted image'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    state.newTask.pastedImages.push({
      id,
      name: file.name || `pasted-${id}.png`,
      mimeType: file.type || 'image/png',
      size: file.size || 0,
      dataUrl: typeof dataUrl === 'string' ? dataUrl : ''
    });
  }

  renderNewTaskPastedImages();
}

function resetNewTaskForm() {
  // Reset service selection
  document.querySelectorAll('.service-btn').forEach(btn => {
    btn.classList.remove('border-[#C2B280]', 'bg-[#C2B280]/5');
    btn.classList.add('border-[#2A2A2A]');
  });

  // Reset form fields - searchable dropdown
  elements.taskRepo.value = '';
  elements.taskRepo.dataset.repoData = '';
  elements.taskRepoSearch.value = '';
  elements.taskRepoSearch.placeholder = 'Select service first...';
  elements.taskRepoSearch.disabled = true;
  elements.repoDropdown.innerHTML = '';
  hideRepoDropdown();
  
  resetNewTaskBranchDropdown();
  elements.taskPrompt.value = '';
  state.newTask.promptMode = 'write';
  state.newTask.pastedImages = [];
  setTaskPromptMode('write');
  renderNewTaskPastedImages();
  elements.taskAutoPr.checked = true;
  elements.createTaskBtn.disabled = true;
  elements.serviceStatus.textContent = '';
  elements.repoError.classList.add('hidden');
  elements.repoLoading.classList.add('hidden');
  elements.repoChevron.classList.remove('hidden');
  elements.createTaskLoading.classList.add('hidden');
  elements.branchInputContainer.classList.remove('hidden');
}

window.selectService = async function(service) {
  state.newTask.selectedService = service;

  // Update UI for selected service
  document.querySelectorAll('.service-btn').forEach(btn => {
    btn.classList.remove('border-[#C2B280]', 'bg-[#C2B280]/5');
    btn.classList.add('border-[#2A2A2A]');
  });

  const selectedBtn = document.getElementById(`service-${service}`);
  selectedBtn.classList.remove('border-[#2A2A2A]');
  selectedBtn.classList.add('border-[#C2B280]', 'bg-[#C2B280]/5');

  // Show/hide branch input - hide for local CLI tools and cloud-only services
  if (service === 'gemini' || service === 'codex' || service === 'claude-cli' || service === 'claude-cloud') {
    elements.branchInputContainer.classList.add('hidden');
  } else {
    elements.branchInputContainer.classList.remove('hidden');
    // If a repo is already selected (e.g., user switches services), refresh branches.
    void refreshNewTaskBranchesFromSelectedRepo();
  }

  // Load repositories for this service
  await loadRepositoriesForService(service);
};

async function loadRepositoriesForService(service) {
  const electronAPI = getElectronAPI();
  if (!electronAPI) return;

  state.newTask.loadingRepos = true;
  elements.taskRepoSearch.disabled = true;
  elements.taskRepoSearch.placeholder = 'Loading repositories...';
  elements.taskRepoSearch.value = '';
  elements.taskRepo.value = '';
  elements.repoDropdown.innerHTML = '';
  elements.repoLoading.classList.remove('hidden');
  elements.repoChevron.classList.add('hidden');
  elements.repoError.classList.add('hidden');
  elements.serviceStatus.textContent = '';

  try {
    let repositories = [];

    const isRemoteDevice = state.newTask.targetDevice && typeof state.newTask.targetDevice === 'object';

    if (isRemoteDevice) {
      // Remote mode: get repos from device state
      // The heartbeat sends `repos` array
      repositories = state.newTask.targetDevice.repos || [];
      // Simulate API delay for better UX consistency
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      // Local/Cloud mode - fetch repositories from local API
      const result = await electronAPI.getRepositories(service);
      if (!result.success) {
        throw new Error(result.error);
      }
      repositories = result.repositories || [];
    }

    state.newTask.repositories = repositories;

    // Always populate dropdown (will show "NO REPOSITORIES FOUND" if empty)
    populateRepoDropdown(state.newTask.repositories, service);

    if (state.newTask.repositories.length === 0) {
      elements.taskRepoSearch.placeholder = 'No repositories found';
      elements.serviceStatus.textContent = 'No repositories available for this service';
      elements.serviceStatus.className = 'mt-3 text-xs technical-font text-yellow-400';
    } else {
      elements.taskRepoSearch.placeholder = 'Type to search or click to select...';
      elements.serviceStatus.textContent = `${state.newTask.repositories.length} repositories available`;
      elements.serviceStatus.className = 'mt-3 text-xs technical-font text-emerald-400';
    }

  } catch (err) {
    console.error('Error loading repositories:', err);
    elements.repoError.textContent = err.message;
    elements.repoError.classList.remove('hidden');
    elements.taskRepoSearch.placeholder = 'Error loading repositories';
    elements.serviceStatus.textContent = err.message;
    elements.serviceStatus.className = 'mt-3 text-xs technical-font text-red-400';

    state.newTask.repositories = [];
    populateRepoDropdown([], service);
  } finally {
    state.newTask.loadingRepos = false;
    elements.repoLoading.classList.add('hidden');
    elements.repoChevron.classList.remove('hidden');

    // Always enable the input so user can see empty/error state feedback
    elements.taskRepoSearch.disabled = false;

    validateNewTaskForm();
  }
}

function validateNewTaskForm() {
  const hasService = state.newTask.selectedService !== null;
  const hasRepo = elements.taskRepo.value !== '';
  const hasPrompt = elements.taskPrompt.value.trim() !== '';

  // Codex and Claude Cloud don't require a repository - just a prompt
  const repoRequired = state.newTask.selectedService !== 'codex' && state.newTask.selectedService !== 'claude-cloud';
  
  elements.createTaskBtn.disabled = !(hasService && hasPrompt && (hasRepo || !repoRequired));
}

window.submitNewTask = async function() {
  const electronAPI = getElectronAPI();
  if (!electronAPI || state.newTask.creating) return;

  const service = state.newTask.selectedService;
  const repoValue = elements.taskRepo.value;
  const repoDataStr = elements.taskRepo.dataset.repoData;
  const repoData = repoDataStr ? JSON.parse(repoDataStr) : null;
  const branch = elements.taskBranch.value.trim() || 'main';
  const prompt = elements.taskPrompt.value.trim();
  const autoCreatePr = elements.taskAutoPr.checked;
  const attachments = (state.newTask.pastedImages || []).map(img => ({
    id: img.id,
    name: img.name,
    mimeType: img.mimeType,
    size: img.size,
    dataUrl: img.dataUrl
  }));

  // Codex and Claude Cloud don't require a repository
  const repoRequired = service !== 'codex' && service !== 'claude-cloud';
  
  if (!service || (repoRequired && !repoValue) || !prompt) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  state.newTask.creating = true;
  elements.createTaskBtn.disabled = true;
  elements.createTaskLoading.classList.remove('hidden');

  try {
    // Build options based on service
    let options = {
      prompt: prompt,
      autoCreatePr: autoCreatePr,
      attachments
    };

    // Handle remote target
    if (state.newTask.targetDevice) {
      options.targetDeviceId = state.newTask.targetDevice.id;
    }

    if (service === 'jules') {
      options.source = repoValue;
      options.branch = branch;
      options.title = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
    } else if (service === 'cursor') {
      options.repository = repoValue;
      options.ref = branch;
    } else if (service === 'gemini') {
      // For Gemini, find the project path from the selected repo
      options.projectPath = repoData?.path || repoValue;
    } else if (service === 'codex') {
      // For Codex, use repository context if provided
      options.repository = repoValue || null;
      options.title = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
    } else if (service === 'claude-cli') {
      // For Claude CLI, use project path (local)
      options.projectPath = repoData?.path || repoValue;
      options.title = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
    } else if (service === 'claude-cloud') {
      // For Claude Cloud, just use prompt (no project needed)
      options.title = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
    }

    const result = await electronAPI.createTask(service, options);

    if (result.success) {
      showToast('Task created successfully', 'success');
      closeNewTaskModal();
      // Refresh the agents list to show the new task
      await loadAgents();
    } else {
      showToast(`Failed to create task: ${result.error}`, 'error');
    }
  } catch (err) {
    console.error('Error creating task:', err);
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    state.newTask.creating = false;
    elements.createTaskBtn.disabled = false;
    elements.createTaskLoading.classList.add('hidden');
    validateNewTaskForm();
  }
};

// ============================================ 
// GitHub / Branches Logic
// ============================================ 

async function loadBranches() {
  const electronAPI = getElectronAPI();
  if (!electronAPI || !state.configuredServices.github) {
     elements.branchesContent.classList.add('hidden');
     elements.branchesEmpty.classList.remove('hidden');
     return;
  }

  state.github.loadingRepos = true;
  elements.branchesEmpty.classList.add('hidden');

  // Only show full loading state if we have no repos
  if (state.github.repos.length === 0) {
    elements.branchesContent.classList.add('hidden');
    elements.branchesLoading.classList.remove('hidden');
  } else {
    // Otherwise show loading on refresh button
    elements.refreshBranchesBtn.disabled = true;
    elements.refreshBranchesBtn.querySelector('.material-symbols-outlined').classList.add('animate-spin');
  }

  try {
     const result = await electronAPI.github.getRepos();
     
     if (result.success) {
        state.github.repos = result.repos || [];
        state.github.filteredRepos = [...state.github.repos];
        elements.repoCount.textContent = `${state.github.repos.length} REPOS`;
        
        renderRepos();
        
        elements.branchesLoading.classList.add('hidden');
        elements.branchesContent.classList.remove('hidden');

        // If we have a selected repo, refresh its PRs too
        if (state.github.selectedRepo) {
           const updatedRepo = state.github.repos.find(r => r.id === state.github.selectedRepo.id);
           if (updatedRepo) {
              // Update local state to match new repo data
              state.github.selectedRepo = updatedRepo;
              // Trigger selectRepo to refresh PRs
              await selectRepo(updatedRepo.owner.login, updatedRepo.name, updatedRepo.id);
           }
        }
     } else {
        throw new Error(result.error);
     }
  } catch (err) {
     console.error('Error loading branches:', err);

     if (state.github.repos.length === 0) {
        elements.branchesLoading.classList.add('hidden');
        elements.branchesEmpty.classList.remove('hidden');
        elements.branchesEmpty.querySelector('h3').textContent = 'Error Loading Repositories';
        elements.branchesEmpty.querySelector('p').textContent = err.message;
     } else {
        showToast(`Failed to refresh repos: ${err.message}`, 'error');
     }
  } finally {
     state.github.loadingRepos = false;
     elements.refreshBranchesBtn.disabled = false;
     elements.refreshBranchesBtn.querySelector('.material-symbols-outlined').classList.remove('animate-spin');
  }
}

// ============================================ 
// Computers Logic (Cloudflare KV)
// ============================================ 

async function loadComputers() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.listComputers) {
    if (elements.computersEmptySubtitle) {
      elements.computersEmptySubtitle.textContent = 'This build does not support listing computers.';
    }
    elements.computersLoading?.classList.add('hidden');
    elements.computersGrid?.classList.add('hidden');
    elements.computersEmpty?.classList.remove('hidden');
    state.computers.list = [];
    elements.totalCount.textContent = '0 Computers';
    return;
  }

  state.computers.loading = true;
  elements.computersGrid?.classList.add('hidden');
  elements.computersEmpty?.classList.add('hidden');
  elements.computersLoading?.classList.remove('hidden');

  try {
    const result = await electronAPI.listComputers();
    if (result && result.success === false) {
      throw new Error(result.error || 'Failed to load computers');
    }
    state.computers.configured = !!result?.configured;
    state.computers.list = Array.isArray(result?.computers) ? result.computers : [];

    renderComputers();
  } catch (err) {
    console.error('Error loading computers:', err);
    state.computers.list = [];
    state.computers.configured = false;
    if (elements.computersEmptySubtitle) {
      elements.computersEmptySubtitle.textContent = err.message || 'Failed to load computers.';
    }
    elements.computersEmpty?.classList.remove('hidden');
    elements.computersGrid?.classList.add('hidden');
  } finally {
    state.computers.loading = false;
    elements.computersLoading?.classList.add('hidden');
    elements.totalCount.textContent = `${state.computers.list.length} Computer${state.computers.list.length !== 1 ? 's' : ''}`;
  }
}

function renderComputers() {
  if (!elements.computersGrid || !elements.computersEmpty) return;

  if (!state.computers.configured) {
    if (elements.computersEmptySubtitle) {
      elements.computersEmptySubtitle.textContent = 'Configure Cloudflare KV in Settings to see available computers.';
    }
    elements.computersGrid.classList.add('hidden');
    elements.computersEmpty.classList.remove('hidden');
    return;
  }

  if (state.computers.list.length === 0) {
    if (elements.computersEmptySubtitle) {
      elements.computersEmptySubtitle.textContent = 'No devices have reported a heartbeat yet.';
    }
    elements.computersGrid.classList.add('hidden');
    elements.computersEmpty.classList.remove('hidden');
    return;
  }

  elements.computersEmpty.classList.add('hidden');
  elements.computersGrid.classList.remove('hidden');

  elements.computersGrid.innerHTML = state.computers.list
    .map(device => renderComputerCard(device))
    .join('');
}

function renderComputerCard(device) {
  const name = escapeHtml(device?.name || device?.id || 'UNKNOWN');
  const id = escapeHtml(device?.id || '--');
  const lastHeartbeat = device?.lastHeartbeat || device?.heartbeatAt || device?.updatedAt || null;
  const then = lastHeartbeat ? new Date(lastHeartbeat) : null;
  const status = typeof device?.status === 'string' ? device.status.toLowerCase() : '';
  // Prefer explicit status from KV; fallback to heartbeat timestamp for older records.
  const online = status ? status === 'on' : (then ? (Date.now() - then.getTime()) < 6 * 60 * 1000 : false);

  const statusLabel = online ? 'ONLINE' : 'OFFLINE';
  const statusClass = online
    ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
    : 'border-slate-600 text-slate-400 bg-slate-800/30';

  const isHeadless = String(device?.deviceType || '').toLowerCase() === 'headless';

  let toolBadges = '';
  if (Array.isArray(device.tools) && device.tools.length > 0 && Array.isArray(device.tools[0]['CLI tools'])) {
    // New structure
    const cliTools = device.tools[0]['CLI tools'];
    toolBadges = [
      cliTools.includes('Gemini CLI') ? '<span class="px-2 py-0.5 text-[10px] technical-font border border-emerald-500 text-emerald-500">GEMINI_CLI</span>' : '',
      cliTools.includes('claude CLI') ? '<span class="px-2 py-0.5 text-[10px] technical-font border border-orange-500 text-orange-500">CLAUDE_CLI</span>' : '',
      cliTools.includes('Codex CLI') ? '<span class="px-2 py-0.5 text-[10px] technical-font border border-cyan-500 text-cyan-500">CODEX_CLI</span>' : '',
      cliTools.includes('cursor CLI') ? '<span class="px-2 py-0.5 text-[10px] technical-font border border-blue-500 text-blue-500">CURSOR_CLI</span>' : ''
    ].filter(Boolean).join(' ');
  } else {
    // Legacy structure fallback
    const tools = device?.tools && typeof device.tools === 'object' ? device.tools : {};
    toolBadges = [
      tools.gemini ? '<span class="px-2 py-0.5 text-[10px] technical-font border border-emerald-500 text-emerald-500">GEMINI_CLI</span>' : '',
      tools['claude-cli'] ? '<span class="px-2 py-0.5 text-[10px] technical-font border border-orange-500 text-orange-500">CLAUDE_CLI</span>' : '',
      tools['codex-cli'] ? '<span class="px-2 py-0.5 text-[10px] technical-font border border-cyan-500 text-cyan-500">CODEX_CLI</span>' : '',
      tools['cursor-cli'] ? '<span class="px-2 py-0.5 text-[10px] technical-font border border-blue-500 text-blue-500">CURSOR_CLI</span>' : ''
    ].filter(Boolean).join(' ');
  }

  let iso = '';
  try {
    iso = lastHeartbeat ? new Date(lastHeartbeat).toISOString() : '';
  } catch (_) {
    iso = '';
  }

  return `
    <div class="agent-card p-6">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[10px] technical-font text-slate-500">COMPUTER</div>
          <div class="mt-1 text-lg font-display font-bold text-white uppercase tracking-tight line-clamp-1">${name}</div>
          <div class="mt-1 text-[10px] technical-font text-slate-500">ID: ${id}</div>
        </div>
        <span class="px-2 py-1 text-[10px] technical-font border ${statusClass} font-bold">${statusLabel}</span>
      </div>

      ${isHeadless ? `
        <div class="mt-3 p-2 border border-yellow-500/30 bg-yellow-500/10 text-yellow-200 text-[10px] technical-font">
          HEADLESS_DEVICE: no local UI, compute-only
        </div>
      ` : ''}

      <div class="mt-4 space-y-3">
        <div>
          <div class="text-[9px] technical-font text-slate-500 mb-1">LAST_HEARTBEAT</div>
          <div class="text-xs font-mono text-slate-300">${lastHeartbeat ? `${formatTimeAgo(lastHeartbeat)}${iso ? ` (${escapeHtml(iso)})` : ''}` : '—'}</div>
        </div>

        <div>
          <div class="text-[9px] technical-font text-slate-500 mb-2">LOCAL_CLI_TOOLS</div>
          <div class="flex flex-wrap gap-2">
            ${toolBadges || '<span class="text-[10px] technical-font text-slate-500">NONE_DETECTED</span>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function filterRepos(query) {
   query = query.toLowerCase();
   state.github.filteredRepos = state.github.repos.filter(repo => 
      repo.name.toLowerCase().includes(query) || 
      (repo.description && repo.description.toLowerCase().includes(query))
   );
   renderRepos();
}

function renderRepos() {
   if (state.github.filteredRepos.length === 0) {
      elements.repoList.innerHTML = `
         <div class="px-4 py-6 text-center text-slate-500 technical-font text-xs">
            NO REPOSITORIES FOUND
         </div>
      `;
      return;
   }
   
   elements.repoList.innerHTML = state.github.filteredRepos.map(repo => `
      <div class="repo-item p-4 border border-transparent hover:border-[#C2B280]/50 hover:bg-[#C2B280]/5 cursor-pointer transition-all mb-1 ${state.github.selectedRepo?.id === repo.id ? 'bg-[#C2B280]/10 border-[#C2B280]' : ''}"
           onclick="selectRepo('${repo.owner.login}', '${repo.name}', ${repo.id})">
         <div class="flex justify-between items-start mb-1">
            <span class="font-bold text-slate-300 text-sm truncate pr-2">${escapeHtml(repo.name)}</span>
            ${repo.private ? '<span class="material-symbols-outlined text-xs text-slate-500">lock</span>' : ''}
         </div>
         <div class="flex justify-between items-center text-[10px] technical-font text-slate-500">
            <span>${formatTimeAgo(repo.updated_at)}</span>
            <div class="flex items-center gap-2">
               ${repo.open_issues_count > 0 ? `<span class="text-slate-400 flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">bug_report</span> ${repo.open_issues_count}</span>` : ''}
               <span class="text-slate-400 flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">star</span> ${repo.stargazers_count}</span>
            </div>
         </div>
      </div>
   `).join('');
}

function setPrFilter(filter) {
  if (state.github.prFilter === filter) return;

  state.github.prFilter = filter;
  updatePrFilterUI();

  if (state.github.selectedRepo) {
    window.selectRepo(state.github.selectedRepo.owner.login, state.github.selectedRepo.name, state.github.selectedRepo.id);
  }
}

function updatePrFilterUI() {
  const isOpen = state.github.prFilter === 'open';

  // Update buttons
  if (isOpen) {
    elements.prFilterOpen.className = 'px-3 py-1 text-[10px] technical-font font-bold transition-all bg-[#C2B280] text-black';
    elements.prFilterClosed.className = 'px-3 py-1 text-[10px] technical-font font-bold transition-all text-slate-400 hover:text-slate-200';
    elements.prStatusText.textContent = 'OPEN PRS';
  } else {
    elements.prFilterOpen.className = 'px-3 py-1 text-[10px] technical-font font-bold transition-all text-slate-400 hover:text-slate-200';
    elements.prFilterClosed.className = 'px-3 py-1 text-[10px] technical-font font-bold transition-all bg-[#C2B280] text-black';
    elements.prStatusText.textContent = 'CLOSED PRS';
  }
}

window.selectRepo = async function(owner, repoName, repoId) {
   const electronAPI = getElectronAPI();
   // Update state
   const repo = state.github.repos.find(r => r.id === repoId);

   // Check if we are refreshing the current repo
   const isSameRepo = state.github.selectedRepo?.id === repoId;

   // If switching to a new repo, always default to 'open'
   if (!isSameRepo) {
     state.github.prFilter = 'open';
     updatePrFilterUI();
   } else {
     // If same repo, ensure UI matches state
     updatePrFilterUI();
   }

   state.github.selectedRepo = repo;
   
   // Update UI highlights
   renderRepos(); // Re-render to update active class
   
   // Show details view
   elements.repoDetailsPlaceholder.classList.add('hidden');
   elements.repoDetailsContent.classList.remove('hidden');
   
   // Update header
   elements.selectedRepoName.textContent = repoName;
   elements.selectedRepoLink.href = repo.html_url;
   elements.selectedRepoLink.onclick = (e) => {
      e.preventDefault();
      window.openExternal(repo.html_url);
   };
   
   // Loading state for PRs
   if (!isSameRepo) {
     elements.prList.innerHTML = `
        <div class="flex flex-col items-center justify-center h-32">
           <span class="material-symbols-outlined text-[#C2B280] text-3xl animate-spin">sync</span>
           <span class="text-xs technical-font text-slate-500 mt-2">LOADING PRs...</span>
        </div>
     `;
     elements.prCount.textContent = '-';
   } else {
     // Show spinner in count for refresh
     elements.prCount.innerHTML = '<span class="material-symbols-outlined text-xs animate-spin">sync</span>';
   }
   
   try {
      const result = await electronAPI.github.getPrs(owner, repoName, state.github.prFilter);
      if (result.success) {
         state.github.prs = result.prs || [];
         elements.prCount.textContent = state.github.prs.length;
         renderPrs();
      } else {
         throw new Error(result.error);
      }
   } catch (err) {
      console.error('Error fetching PRs:', err);

      if (!isSameRepo) {
        elements.prList.innerHTML = `
           <div class="p-4 border border-red-900/50 bg-red-900/10 text-red-400 text-xs technical-font text-center">
              FAILED TO LOAD PRs: ${escapeHtml(err.message)}
           </div>
        `;
      } else {
        showToast(`Failed to refresh PRs: ${err.message}`, 'error');
        // Restore count if failed
        elements.prCount.textContent = state.github.prs.length;
      }
   }
};

function renderPrs() {
   if (state.github.prs.length === 0) {
      elements.prList.innerHTML = `
         <div class="flex flex-col items-center justify-center h-64 text-slate-500">
            <span class="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
            <span class="technical-font text-xs">NO OPEN PULL REQUESTS</span>
         </div>
      `;
      return;
   }
   
   elements.prList.innerHTML = state.github.prs.map(pr => {
      let statusBadge = '';
      if (pr.state === 'open') {
          statusBadge = '<span class="px-2 py-0.5 text-[9px] technical-font bg-emerald-900/30 text-emerald-500 border border-emerald-900/50">OPEN</span>';
      } else if (pr.merged_at) {
          statusBadge = '<span class="px-2 py-0.5 text-[9px] technical-font bg-purple-900/30 text-purple-500 border border-purple-900/50">MERGED</span>';
      } else {
          statusBadge = '<span class="px-2 py-0.5 text-[9px] technical-font bg-red-900/30 text-red-500 border border-red-900/50">CLOSED</span>';
      }

      return `
      <div class="pr-card bg-[#0D0D0D] border border-[#2A2A2A] p-4 hover:border-[#C2B280] transition-colors cursor-pointer group" 
           onclick="openPrDetails('${pr.base.repo.owner.login}', '${pr.base.repo.name}', ${pr.number})">
         <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2">
               <span class="text-[#C2B280] technical-font text-xs">#${pr.number}</span>
               <h3 class="font-bold text-slate-200 text-sm group-hover:text-[#C2B280] transition-colors">${escapeHtml(pr.title)}</h3>
            </div>
            ${statusBadge}
         </div>
         
         <div class="flex items-center gap-4 text-[10px] technical-font text-slate-500 mb-3">
            <span class="flex items-center gap-1">
               <span class="material-symbols-outlined text-xs">account_circle</span>
               ${escapeHtml(pr.user.login)}
            </span>
            <span class="flex items-center gap-1">
               <span class="material-symbols-outlined text-xs">schedule</span>
               ${formatTimeAgo(pr.created_at)}
            </span>
         </div>
         
         <div class="flex items-center gap-2 mt-2">
            <div class="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
               <div class="h-full bg-[#C2B280]" style="width: 100%"></div>
            </div>
            <span class="text-[9px] technical-font text-slate-400 flex items-center gap-1">
               <span class="material-symbols-outlined text-[10px]">call_merge</span>
               ${escapeHtml(pr.head.ref)}
            </span>
         </div>
      </div>
      `;
   }).join('');
}

window.openPrDetails = async function(owner, repo, number) {
   const electronAPI = getElectronAPI();
   elements.prModal.classList.remove('hidden');
   // Show loading state
   elements.prModalBody.innerHTML = '<div class="text-center py-8 text-slate-500">Loading details...</div>';
   elements.mergeStatusContainer.classList.add('opacity-50', 'pointer-events-none');
   hideMergeConflictActions();
   
   try {
      const result = await electronAPI.github.getPrDetails(owner, repo, number);
      if (result.success) {
         const pr = result.pr;
         state.github.currentPr = pr;
         
         elements.prModalTitle.textContent = pr.title;
         elements.prModalNumber.textContent = `#${pr.number}`;
         elements.prModalHead.textContent = pr.head.ref;
         elements.prModalBase.textContent = pr.base.ref;
         elements.prModalLink.href = pr.html_url;
         elements.prModalLink.onclick = (e) => { e.preventDefault(); window.openExternal(pr.html_url); };
         elements.prModalMeta.textContent = `Updated ${formatTimeAgo(pr.updated_at)}`;
         
         // Markdown body
         elements.prModalBody.innerHTML = pr.body ? 
            DOMPurify.sanitize(marked.parse(pr.body)) :
            '<em class="text-slate-500">No description provided.</em>';
         
         // Merge status
         elements.mergeStatusContainer.classList.remove('opacity-50', 'pointer-events-none');

         if (pr.draft) {
             hideMergeConflictActions();
             elements.mergeIcon.textContent = 'edit_note';
             elements.mergeIcon.className = 'material-symbols-outlined text-blue-500';
             elements.mergeTitle.textContent = 'This is a draft pull request';
             elements.mergeSubtitle.textContent = 'Review and publish to enable merging.';
             elements.mergeBtn.disabled = false;
             elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined text-sm">rate_review</span> REVIEW & PUBLISH';
             elements.mergeBtn.onclick = () => markPrReadyForReview(owner, repo, number, pr.node_id);
         } else if (pr.mergeable) {
            hideMergeConflictActions();
            elements.mergeIcon.textContent = 'check_circle';
            elements.mergeIcon.className = 'material-symbols-outlined text-emerald-500';
            elements.mergeTitle.textContent = 'This branch has no conflicts with the base branch';
            elements.mergeSubtitle.textContent = 'Merging can be performed automatically.';
            elements.mergeBtn.disabled = false;
            elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined text-sm">merge</span> MERGE PULL REQUEST';
            elements.mergeBtn.onclick = () => mergePr(owner, repo, number);
         } else if (pr.mergeable === false) {
            elements.mergeIcon.textContent = 'error';
            elements.mergeIcon.className = 'material-symbols-outlined text-red-500';
            elements.mergeTitle.textContent = 'This branch has conflicts that must be resolved';
            elements.mergeSubtitle.textContent = 'Use GitHub to resolve, or create an agent task to fix the merge conflicts.';
            elements.mergeBtn.disabled = true;
            elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined text-sm">merge</span> MERGE PULL REQUEST';
            showMergeConflictActions(pr);
         } else {
            hideMergeConflictActions();
            elements.mergeIcon.textContent = 'pending';
            elements.mergeIcon.className = 'material-symbols-outlined text-yellow-500 animate-pulse';
            elements.mergeTitle.textContent = 'Checking mergeability...';
            elements.mergeSubtitle.textContent = 'Please wait.';
            elements.mergeBtn.disabled = true;
            elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined text-sm">merge</span> MERGE PULL REQUEST';
         }
      }
   } catch (err) {
      console.error('Error loading PR details:', err);
      elements.prModalBody.innerHTML = `<div class="text-red-400">Error: ${err.message}</div>`;
   }
};

function hideMergeConflictActions() {
  if (elements.mergeGithubBtn) {
    elements.mergeGithubBtn.classList.add('hidden');
    elements.mergeGithubBtn.onclick = null;
  }
  if (elements.mergeFixBtn) {
    elements.mergeFixBtn.classList.add('hidden');
    elements.mergeFixBtn.onclick = null;
  }
}

function showMergeConflictActions(pr) {
  if (!pr) return;

  if (elements.mergeGithubBtn) {
    elements.mergeGithubBtn.classList.remove('hidden');
    elements.mergeGithubBtn.onclick = () => {
      if (pr.html_url) window.openExternal(pr.html_url);
    };
  }

  if (elements.mergeFixBtn) {
    elements.mergeFixBtn.classList.remove('hidden');
    elements.mergeFixBtn.onclick = () => {
      void prefillFixMergeConflictTask(pr);
    };
  }
}

function choosePreferredMergeFixService() {
  // Prefer cloud agents that can target a repo + branch.
  const preferred = ['cursor', 'jules'];
  return preferred.find(p => state.configuredServices[p]) || null;
}

function buildMergeConflictFixPrompt(pr) {
  const owner = pr?.base?.repo?.owner?.login || pr?.head?.repo?.owner?.login || '';
  const repo = pr?.base?.repo?.name || pr?.head?.repo?.name || '';
  const head = pr?.head?.ref || '';
  const base = pr?.base?.ref || '';
  const prUrl = pr?.html_url || '';

  return [
    'This pull request cannot be merged due to merge conflicts.',
    '',
    `Repo: ${owner}/${repo}`,
    `PR: ${prUrl}`,
    `Head branch (has conflicts): ${head}`,
    `Base branch (target): ${base}`,
    '',
    'Goal: resolve the merge conflicts on the head branch so the PR becomes mergeable.',
    '',
    'Instructions:',
    `- Work in the head branch: ${head}`,
    `- Bring the head branch up to date with ${base} (merge or rebase), resolve all conflicts, and keep intended behavior`,
    '- Run the project tests/lint as appropriate and ensure they pass',
    '- Commit the conflict resolutions and push the branch so the PR updates',
    '',
    'If you need context, check the PR diff and conflict markers. Prefer minimal, safe changes.'
  ].join('\n');
}

async function prefillFixMergeConflictTask(pr) {
  // Open the New Task modal and prefill it so the user only needs to click "Create Task".
  const fixPrompt = buildMergeConflictFixPrompt(pr);
  openNewTaskModal();

  // Always prefill the prompt (even if repo selection fails).
  elements.taskPrompt.value = fixPrompt;

  const service = choosePreferredMergeFixService();
  if (!service) {
    showToast('No cloud service available for FIX. Configure Cursor or Jules in Settings.', 'error');
    validateNewTaskForm();
    return;
  }

  // Select service + load repos.
  await window.selectService(service);
  // Defensive: ensure prompt is still set after service selection.
  elements.taskPrompt.value = fixPrompt;

  const owner = pr?.base?.repo?.owner?.login || pr?.head?.repo?.owner?.login;
  const repoName = pr?.base?.repo?.name || pr?.head?.repo?.name;
  const headBranch = pr?.head?.ref || 'main';

  // Try to match the repo in the service's repositories list.
  const match = (state.newTask.repositories || []).find(r => {
    const gh = tryParseGithubOwnerRepo(r);
    if (gh && owner && repoName) return gh.owner === owner && gh.repo === repoName;
    const url = (r?.url || r?.repository || '').toString();
    return owner && repoName && url.includes(`github.com/${owner}/${repoName}`);
  });

  if (match) {
    const value = service === 'jules' ? match.id : (match.url || match.path || match.id);
    const displayName = (match.displayName || match.name || repoName || 'REPO').toUpperCase();
    elements.taskRepo.value = value;
    elements.taskRepo.dataset.repoData = JSON.stringify(match);
    elements.taskRepoSearch.value = displayName;

    // Populate branches best-effort, then set the head branch.
    await refreshNewTaskBranchesFromSelectedRepo();

    const current = Array.from(elements.taskBranch.options).map(o => o.value);
    setNewTaskBranchOptions([...current, headBranch], headBranch);
    // Force-select the head branch (ignore previous default selection like "main").
    if (!Array.from(elements.taskBranch.options).some(o => o.value === headBranch)) {
      const opt = document.createElement('option');
      opt.value = headBranch;
      opt.textContent = headBranch;
      elements.taskBranch.appendChild(opt);
    }
    elements.taskBranch.value = headBranch;
  } else {
    // Still set the branch and let the user pick repo if we couldn't match.
    const current = Array.from(elements.taskBranch.options).map(o => o.value);
    setNewTaskBranchOptions([...current, headBranch], headBranch);
    if (!Array.from(elements.taskBranch.options).some(o => o.value === headBranch)) {
      const opt = document.createElement('option');
      opt.value = headBranch;
      opt.textContent = headBranch;
      elements.taskBranch.appendChild(opt);
    }
    elements.taskBranch.value = headBranch;
    showToast('Could not auto-select repository for FIX. Please pick the repo, then click Create Task.', 'info');
  }

  validateNewTaskForm();
}

window.mergePr = async function(owner, repo, number) {
   const electronAPI = getElectronAPI();
   if (!await showConfirmModal('Are you sure you want to merge this pull request?', 'MERGE PULL REQUEST')) return;
   
   elements.mergeBtn.disabled = true;
   elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">sync</span> MERGING...';
   
   try {
      const result = await electronAPI.github.mergePr(owner, repo, number);
      if (result.success) {
         showToast('Pull request merged successfully', 'success');
         closePrModal();
         // Refresh PR list
         selectRepo(owner, repo, state.github.selectedRepo.id);
      } else {
         throw new Error(result.error);
      }
   } catch (err) {
      showToast(`Merge failed: ${err.message}`, 'error');
      elements.mergeBtn.disabled = false;
      elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined text-sm">merge</span> MERGE PULL REQUEST';
   }
};

window.markPrReadyForReview = async function(owner, repo, number, nodeId) {
    if (!await showConfirmModal('Are you sure you want to mark this PR as ready for review? This will notify reviewers.', 'REVIEW & PUBLISH')) return;

    elements.mergeBtn.disabled = true;
    elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">sync</span> UPDATING...';

    try {
        const result = await electronAPI.github.markPrReadyForReview(nodeId);
        if (result.success) {
            showToast('Pull request marked as ready for review', 'success');
            // Reload PR details to update UI state
            openPrDetails(owner, repo, number);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        showToast(`Failed to update PR: ${err.message}`, 'error');
        elements.mergeBtn.disabled = false;
        elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined text-sm">rate_review</span> REVIEW & PUBLISH';
    }
};

window.closePrModal = function() {
   elements.prModal.classList.add('hidden');
   // Defensive: ensure confirm modal/backdrop isn't left behind.
   elements.confirmModal.classList.add('hidden');
};

window.showConfirmModal = function(message, title = 'Confirm Action') {
  return new Promise((resolve) => {
    elements.confirmMessage.textContent = message;
    elements.confirmTitle.textContent = title;
    elements.confirmModal.classList.remove('hidden');

    const backdrop = elements.confirmModal.querySelector('.fixed.inset-0');

    const cleanup = () => {
      elements.confirmModal.classList.add('hidden');
      elements.confirmOkBtn.removeEventListener('click', onConfirm);
      elements.confirmCancelBtn.removeEventListener('click', onCancel);
      backdrop?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeydown);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    elements.confirmOkBtn.addEventListener('click', onConfirm);
    elements.confirmCancelBtn.addEventListener('click', onCancel);
    backdrop?.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeydown);
  });
};


// ============================================ 
// Utilities
// ============================================ 

window.openExternal = function(url) {
  const electronAPI = getElectronAPI();
  if (electronAPI) {
    electronAPI.openExternal(url);
  }
};

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeJsString(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\'");
}

// ============================================
// Jira Logic
// ============================================

async function loadJiraBoards() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.jira || !state.configuredServices.jira) {
    if (elements.jiraEmpty) elements.jiraEmpty.classList.remove('hidden');
    if (elements.jiraContent) elements.jiraContent.classList.add('hidden');
    return;
  }

  state.jira.loading = true;
  elements.jiraLoading.classList.remove('hidden');
  elements.jiraEmpty.classList.add('hidden');
  elements.jiraContent.classList.add('hidden');

  try {
    const result = await electronAPI.jira.getBoards();
    if (result.success) {
      state.jira.boards = result.boards || [];
      renderJiraBoardsDropdown();

      // Auto-select first board if none selected
      if (!state.jira.selectedBoardId && state.jira.boards.length > 0) {
        state.jira.selectedBoardId = state.jira.boards[0].id;
        elements.jiraBoardSelect.value = state.jira.boards[0].id;
        loadJiraIssues(state.jira.selectedBoardId);
      } else {
        elements.jiraLoading.classList.add('hidden');
        elements.jiraContent.classList.remove('hidden');
      }
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error('Error loading Jira boards:', err);
    showToast(`Failed to load Jira boards: ${err.message}`, 'error');
    elements.jiraLoading.classList.add('hidden');
    elements.jiraEmpty.classList.remove('hidden');
    elements.jiraEmpty.querySelector('h3').textContent = 'Error Loading Jira';
    elements.jiraEmpty.querySelector('p').textContent = err.message;
  }
}

function renderJiraBoardsDropdown() {
  if (!elements.jiraBoardSelect) return;

  const current = state.jira.selectedBoardId;
  const options = state.jira.boards.map(board =>
    `<option value="${board.id}">${escapeHtml(board.name)} (${escapeHtml(board.type)})</option>`
  ).join('');

  elements.jiraBoardSelect.innerHTML = `<option value="">Select Board...</option>${options}`;

  if (current) {
    elements.jiraBoardSelect.value = current;
  }
}

async function loadJiraIssues(boardId) {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.jira || !boardId) return;

  state.jira.loading = true;
  elements.jiraIssuesList.innerHTML = `
    <div class="flex flex-col items-center justify-center h-32">
       <span class="material-symbols-outlined text-[#C2B280] text-3xl animate-spin">sync</span>
       <span class="text-xs technical-font text-slate-500 mt-2">LOADING ISSUES...</span>
    </div>
  `;

  // Show content area
  elements.jiraLoading.classList.add('hidden');
  elements.jiraContent.classList.remove('hidden');

  try {
    const board = state.jira.boards.find(b => String(b.id) === String(boardId));
    let issues = [];

    if (board && board.type === 'scrum') {
        // Get active sprints
        const sprintsRes = await electronAPI.jira.getSprints(boardId);
        if (sprintsRes.success && sprintsRes.sprints && sprintsRes.sprints.length > 0) {
            // Find active sprint
            const active = sprintsRes.sprints.find(s => s.state === 'active');
            if (active) {
                const issuesRes = await electronAPI.jira.getSprintIssues(active.id);
                if (issuesRes.success) issues = issuesRes.issues || [];
            }
        }

        // If no active sprint issues found, try backlog
        if (issues.length === 0) {
             const backlogRes = await electronAPI.jira.getBacklogIssues(boardId);
             if (backlogRes.success) issues = backlogRes.issues || [];
        }
    } else {
        const backlogRes = await electronAPI.jira.getBacklogIssues(boardId);
        if (backlogRes.success) {
            issues = backlogRes.issues || [];
        }
    }

    state.jira.issues = issues;
    elements.totalCount.textContent = `${issues.length} Issues`;
    renderJiraIssues();

  } catch (err) {
    console.error('Error loading Jira issues:', err);
    elements.jiraIssuesList.innerHTML = `
        <div class="p-4 border border-red-900/50 bg-red-900/10 text-red-400 text-xs technical-font text-center">
           FAILED TO LOAD ISSUES: ${escapeHtml(err.message)}
        </div>
    `;
  } finally {
    state.jira.loading = false;
  }
}

function renderJiraIssues() {
  if (state.jira.issues.length === 0) {
    elements.jiraIssuesList.innerHTML = `
       <div class="px-4 py-6 text-center text-slate-500 technical-font text-xs">
          NO ISSUES FOUND
       </div>
    `;
    return;
  }

  elements.jiraIssuesList.innerHTML = state.jira.issues.map(issue => {
    const key = escapeHtml(issue.key);
    const summary = escapeHtml(issue.fields?.summary || 'No summary');
    const status = escapeHtml(issue.fields?.status?.name || 'Unknown');
    const priority = escapeHtml(issue.fields?.priority?.name || '');
    const assignee = escapeHtml(issue.fields?.assignee?.displayName || 'Unassigned');

    // Status color
    let statusClass = 'text-slate-400 border-slate-600';
    if (['Done', 'Closed', 'Resolved'].includes(status)) statusClass = 'text-emerald-500 border-emerald-500 bg-emerald-900/20';
    else if (['In Progress', 'In Review'].includes(status)) statusClass = 'text-blue-500 border-blue-500 bg-blue-900/20';

    return `
      <div class="jira-card bg-[#0D0D0D] border border-[#2A2A2A] p-4 hover:border-[#C2B280] transition-colors cursor-pointer group flex flex-col gap-2">
         <div class="flex justify-between items-start">
            <div class="flex items-center gap-2">
               <span class="text-[#C2B280] technical-font text-xs font-bold">${key}</span>
               <h3 class="font-medium text-slate-200 text-sm group-hover:text-[#C2B280] transition-colors line-clamp-1">${summary}</h3>
            </div>
            <span class="px-2 py-0.5 text-[9px] technical-font border ${statusClass}">${status.toUpperCase()}</span>
         </div>

         <div class="flex items-center gap-4 text-[10px] technical-font text-slate-500">
            <span class="flex items-center gap-1">
               <span class="material-symbols-outlined text-xs">person</span>
               ${assignee}
            </span>
            ${priority ? `
            <span class="flex items-center gap-1">
               <span class="material-symbols-outlined text-xs">priority_high</span>
               ${priority}
            </span>` : ''}
         </div>
      </div>
    `;
  }).join('');
}

function extractRepoName(url) {
  if (!url) return '';
  const match = url.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1] : url;
}

function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

function showToast(message, type = 'info') {
  // Simple toast implementation with tactical styling
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-4 py-2 text-xs technical-font font-bold z-50 transition-all transform translate-y-0 opacity-100 border ${ 
    type === 'success' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 
    type === 'error' ? 'bg-red-500/20 border-red-500 text-red-400' : 
    'bg-[#1A1A1A] border-[#2A2A2A] text-white'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
    oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // Drop pitch

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.error('Error playing sound:', e);
  }
}

function checkForCompletions(newAgents) {
  if (state.agents.length === 0) return; // Don't notify on initial load

  // Create a map of current (old) agents for quick lookup
  const oldAgentsMap = new Map(state.agents.map(a => [`${a.provider}-${a.rawId}`, a]));

  newAgents.forEach(newAgent => {
    const key = `${newAgent.provider}-${newAgent.rawId}`;
    const oldAgent = oldAgentsMap.get(key);

    // If agent existed before and wasn't completed, but is now completed
    if (oldAgent && oldAgent.status !== 'completed' && newAgent.status === 'completed') {
      showToast(`Task completed: ${newAgent.name}`, 'success');
      playNotificationSound();
    }
  });
}

// ============================================ 
// Start Application
// ============================================ 

document.addEventListener('DOMContentLoaded', init);