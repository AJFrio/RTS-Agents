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
    theme: 'system'
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
    github: false
  },
  loading: false,
  errors: [],
  // New task modal state
  newTask: {
    selectedService: null,
    repositories: [],
    loadingRepos: false,
    creating: false
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
    currentPr: null
  }
};

// ============================================ 
// DOM Elements
// ============================================ 

const elements = {
  // Views
  viewDashboard: document.getElementById('view-dashboard'),
  viewSettings: document.getElementById('view-settings'),
  viewBranches: document.getElementById('view-branches'),
  viewTitle: document.getElementById('view-title'),
  
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
  julesApiKey: document.getElementById('jules-api-key'),
  cursorApiKey: document.getElementById('cursor-api-key'),
  codexApiKey: document.getElementById('codex-api-key'),
  claudeApiKey: document.getElementById('claude-api-key'),
  githubApiKey: document.getElementById('github-api-key'),
  autoPolling: document.getElementById('auto-polling'),
  pollingInterval: document.getElementById('polling-interval'),
  intervalValue: document.getElementById('interval-value'),
  defaultGeminiPath: document.getElementById('default-gemini-path'),
  newGeminiPath: document.getElementById('new-gemini-path'),
  geminiPathsList: document.getElementById('gemini-paths-list'),
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
  serviceStatus: document.getElementById('service-status'),
  taskRepo: document.getElementById('task-repo'),
  taskRepoSearch: document.getElementById('task-repo-search'),
  repoDropdown: document.getElementById('repo-dropdown'),
  repoSearchContainer: document.getElementById('repo-search-container'),
  taskBranch: document.getElementById('task-branch'),
  taskPrompt: document.getElementById('task-prompt'),
  taskAutoPr: document.getElementById('task-auto-pr'),
  createTaskBtn: document.getElementById('create-task-btn'),
  repoLoading: document.getElementById('repo-loading'),
  repoChevron: document.getElementById('repo-chevron'),
  repoError: document.getElementById('repo-error'),
  createTaskLoading: document.getElementById('create-task-loading'),
  branchInputContainer: document.getElementById('branch-input-container'),

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
  prList: document.getElementById('pr-list'),
  refreshBranchesBtn: document.getElementById('refresh-branches-btn'),
  repoCount: document.getElementById('repo-count'),

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
  mergeStatusContainer: document.getElementById('merge-status-container'),
  mergeIcon: document.getElementById('merge-icon'),
  mergeTitle: document.getElementById('merge-title'),
  mergeSubtitle: document.getElementById('merge-subtitle')
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
  setupPollingListener();
  await loadSettings();
  await loadAgents();
  await checkConnectionStatus();
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
  }, 300));

  // Refresh button
  elements.refreshBtn.addEventListener('click', () => loadAgents());

  // Provider filters
  document.querySelectorAll('.provider-filter').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const provider = e.target.id.replace('filter-', '');
      state.filters.providers[provider] = e.target.checked;
      applyFilters();
    });
  });

  // Status filters
  document.querySelectorAll('.status-filter').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const status = e.target.id.replace('filter-', '');
      state.filters.statuses[status] = e.target.checked;
      applyFilters();
    });
  });

  // Settings - API Keys
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

  // Settings - Theme
  ['system', 'light', 'dark'].forEach(theme => {
    document.getElementById(`theme-${theme}`).addEventListener('click', () => setTheme(theme));
  });

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
  elements.newGeminiPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGeminiPath();
  });

  // Settings - GitHub Paths
  document.getElementById('add-github-path').addEventListener('click', addGithubPath);
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
  elements.taskPrompt.addEventListener('input', validateNewTaskForm);
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
  elements.refreshBranchesBtn.addEventListener('click', loadBranches);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') {
      applyTheme('system');
    }
  });
}

function setupPollingListener() {
  if (window.electronAPI && window.electronAPI.onRefreshTick) {
    window.electronAPI.onRefreshTick(() => {
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
    if (!searchInput.disabled && state.newTask.repositories.length > 0) {
      filterRepoDropdown(searchInput.value.toLowerCase());
      showRepoDropdown();
    }
  });

  // Toggle dropdown on chevron click
  chevron.addEventListener('click', () => {
    if (!searchInput.disabled && state.newTask.repositories.length > 0) {
      if (dropdown.classList.contains('hidden')) {
        filterRepoDropdown(searchInput.value.toLowerCase());
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
    const activeItem = dropdown.querySelector('.repo-option.bg-\[\#C2B280\]\/20');
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
      item.classList.add('bg-[#C2B280]/20');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('bg-[#C2B280]/20');
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
        item.classList.remove('bg-[#C2B280]/20');
      });
      option.classList.add('bg-[#C2B280]/20');
    });
    
    elements.repoDropdown.appendChild(option);
  });
}

// ============================================ 
// Data Loading
// ============================================ 

async function loadAgents(silent = false) {
  if (!window.electronAPI) return;

  if (!silent) {
    state.loading = true;
    showLoading();
  }

  setRefreshing(true);

  try {
    const result = await window.electronAPI.getAgents();
    
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
  if (!window.electronAPI) return;

  try {
    const result = await window.electronAPI.getSettings();
    
    state.settings = {
      pollingInterval: result.settings?.pollingInterval || 30000,
      autoPolling: result.settings?.autoPolling !== false,
      geminiPaths: result.settings?.geminiPaths || [],
      githubPaths: result.githubPaths || result.settings?.githubPaths || [],
      theme: result.settings?.theme || 'system'
    };

    // Apply theme
    applyTheme(state.settings.theme);

    // Update UI
    elements.autoPolling.checked = state.settings.autoPolling;
    const seconds = Math.round(state.settings.pollingInterval / 1000);
    elements.pollingInterval.value = seconds;
    elements.intervalValue.textContent = seconds;

    // Update Gemini paths
    elements.defaultGeminiPath.textContent = result.geminiDefaultPath || 'Not detected';
    renderGeminiPaths();

    // Update GitHub paths
    renderGithubPaths();

    // Track configured services
    state.configuredServices.gemini = result.geminiInstalled || false;
    state.configuredServices.jules = result.apiKeys?.jules || false;
    state.configuredServices.cursor = result.apiKeys?.cursor || false;
    state.configuredServices.codex = result.apiKeys?.codex || false;
    state.configuredServices['claude-cli'] = result.claudeCliInstalled || false;
    state.configuredServices['claude-cloud'] = result.claudeCloudConfigured || result.apiKeys?.claude || false;
    state.configuredServices.github = result.apiKeys?.github || false;

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
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function checkConnectionStatus() {
  if (!window.electronAPI) return;

  try {
    const status = await window.electronAPI.getConnectionStatus();
    
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
  
  providers.forEach(provider => {
    const serviceBtn = document.getElementById(`service-${provider}`);
    if (serviceBtn) {
      if (state.configuredServices[provider]) {
        serviceBtn.classList.remove('hidden');
        availableCount++;
      } else {
        serviceBtn.classList.add('hidden');
      }
    }
  });

  // Update service status message if no services are available
  if (availableCount === 0) {
    elements.serviceStatus.textContent = 'No services configured. Please add API keys or install CLI tools in Settings.';
    elements.serviceStatus.className = 'mt-3 text-xs technical-font text-yellow-400';
  }
}

// ============================================ 
// Filtering
// ============================================ 

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
        ${agent.prUrl ? `
          <a href="#" onclick="event.stopPropagation(); openExternal('${agent.prUrl}')" 
             class="text-[10px] technical-font text-[#C2B280] hover:underline flex items-center gap-1">
            <span class="material-symbols-outlined text-xs">open_in_new</span>
            View PR
          </a>
        ` : ''}
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
  
  if (paths.length === 0) {
    elements.geminiPathsList.innerHTML = `
      <p class="text-sm technical-font text-slate-500 italic">No custom paths configured</p>
    `;
    return;
  }

  elements.geminiPathsList.innerHTML = paths.map(path => `
    <div class="flex items-center justify-between p-3 bg-slate-700/20 border border-[#2A2A2A]">
      <span class="text-sm text-slate-300 font-mono truncate">${escapeHtml(path)}</span>
      <button onclick="removeGeminiPath('${escapeHtml(path)}')" 
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
    branches: 'Repository Branches'
  };
  elements.viewTitle.textContent = titles[view] || 'Dashboard';

  // Show/hide views
  elements.viewDashboard.classList.toggle('hidden', view !== 'dashboard');
  elements.viewSettings.classList.toggle('hidden', view !== 'settings');
  elements.viewBranches.classList.toggle('hidden', view !== 'branches');

  // Load branches if view selected
  if (view === 'branches') {
    if (state.github.repos.length === 0) {
      loadBranches();
    }
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

async function saveApiKey(provider) {
  const inputMap = {
    jules: elements.julesApiKey,
    cursor: elements.cursorApiKey,
    codex: elements.codexApiKey,
    claude: elements.claudeApiKey,
    github: elements.githubApiKey
  };
  const input = inputMap[provider];
  const key = input.value.trim();
  
  if (!key) {
    showToast('Please enter an API key', 'error');
    return;
  }

  try {
    await window.electronAPI.setApiKey(provider, key);
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
  try {
    const result = await window.electronAPI.testApiKey(provider);
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
  if (!confirm(`Are you sure you want to disconnect from ${capitalizeFirst(provider)}? This will remove the saved API key.`)) {
    return;
  }

  try {
    await window.electronAPI.removeApiKey(provider);
    
    // Reset the input and placeholder
    const inputMap = {
      jules: elements.julesApiKey,
      cursor: elements.cursorApiKey,
      codex: elements.codexApiKey,
      claude: elements.claudeApiKey,
      github: elements.githubApiKey
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

async function setTheme(theme) {
  try {
    await window.electronAPI.setTheme(theme);
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

async function updatePollingSettings(enabled, interval) {
  try {
    await window.electronAPI.setPolling(enabled, interval);
    state.settings.autoPolling = enabled;
    state.settings.pollingInterval = interval;
  } catch (err) {
    showToast(`Settings update failed: ${err.message}`, 'error');
  }
}

async function addGeminiPath() {
  const path = elements.newGeminiPath.value.trim();
  if (!path) return;

  try {
    const result = await window.electronAPI.addGeminiPath(path);
    state.settings.geminiPaths = result.paths;
    elements.newGeminiPath.value = '';
    renderGeminiPaths();
    await loadAgents();
    showToast('Path added successfully', 'success');
  } catch (err) {
    showToast(`Failed to add path: ${err.message}`, 'error');
  }
}

// Make removeGeminiPath available globally
window.removeGeminiPath = async function(path) {
  try {
    const result = await window.electronAPI.removeGeminiPath(path);
    state.settings.geminiPaths = result.paths;
    renderGeminiPaths();
    await loadAgents();
    showToast('Path removed', 'success');
  } catch (err) {
    showToast(`Failed to remove path: ${err.message}`, 'error');
  }
};

async function addGithubPath() {
  const path = elements.newGithubPath.value.trim();
  if (!path) return;

  try {
    const result = await window.electronAPI.addGithubPath(path);
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
  try {
    const result = await window.electronAPI.removeGithubPath(path);
    state.settings.githubPaths = result.paths;
    renderGithubPaths();
    await loadAgents();
    showToast('GitHub path removed', 'success');
  } catch (err) {
    showToast(`Failed to remove path: ${err.message}`, 'error');
  }
};

async function updateApplication() {
  if (!confirm('Are you sure you want to update and restart the application? This will stop all running tasks.')) {
    return;
  }

  const btn = document.getElementById('update-app-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">sync</span> UPDATING...';

  try {
    // Check connection status before attempting update
    const status = await window.electronAPI.getConnectionStatus();
    // We don't strictly need a provider status to be true to run git pull,
    // but we can at least show a toast starting the process.

    showToast('Initiating update sequence...', 'info');
    await window.electronAPI.updateApp();
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
    const details = await window.electronAPI.getAgentDetails(provider, rawId, filePath);
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
        ${details.prUrl ? `
        <div class="mt-4 flex justify-end">
          <button onclick="openExternal('${details.prUrl}')" class="bg-[#C2B280] text-black px-4 py-1.5 text-[10px] technical-font font-bold hover:brightness-110 flex items-center gap-2">
            <span class="material-symbols-outlined text-xs">open_in_new</span>
            View PR
          </button>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  // Task Description Section
  if (details.prompt) {
    content += `
      <section>
        <div class="flex items-center gap-2 mb-3 border-l-2 border-[#C2B280] pl-3">
          <span class="material-symbols-outlined text-sm text-[#C2B280]">edit_note</span>
          <h3 class="text-[11px] technical-font text-[#C2B280] font-bold">Task Description</h3>
        </div>
        <div class="bg-[#1A1A1A] border border-[#2A2A2A] p-6">
          <p class="text-sm text-slate-300 font-light leading-relaxed whitespace-pre-wrap">${escapeHtml(details.prompt)}</p>
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
        <div class="space-y-3 max-h-72 overflow-y-auto pr-2">
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

  content += '</div>';
  elements.modalContent.innerHTML = content;
}

window.closeModal = function() {
  elements.agentModal.classList.add('hidden');
};

// ============================================ 
// New Task Modal
// ============================================ 

function openNewTaskModal() {
  // Reset state
  state.newTask = {
    selectedService: null,
    repositories: [],
    loadingRepos: false,
    creating: false
  };

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
  
  elements.taskBranch.value = 'main';
  elements.taskPrompt.value = '';
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
  }

  // Load repositories for this service
  await loadRepositoriesForService(service);
};

async function loadRepositoriesForService(service) {
  if (!window.electronAPI) return;

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
    const result = await window.electronAPI.getRepositories(service);

    if (!result.success) {
      elements.repoError.textContent = result.error;
      elements.repoError.classList.remove('hidden');
      elements.taskRepoSearch.placeholder = 'No repositories available';
      elements.serviceStatus.textContent = result.error;
      elements.serviceStatus.className = 'mt-3 text-xs technical-font text-red-400';
      return;
    }

    state.newTask.repositories = result.repositories || [];

    if (state.newTask.repositories.length === 0) {
      elements.taskRepoSearch.placeholder = 'No repositories found';
      elements.serviceStatus.textContent = 'No repositories available for this service';
      elements.serviceStatus.className = 'mt-3 text-xs technical-font text-yellow-400';
      return;
    }

    // Populate searchable dropdown
    populateRepoDropdown(state.newTask.repositories, service);

    elements.taskRepoSearch.disabled = false;
    elements.taskRepoSearch.placeholder = 'Type to search or click to select...';
    elements.serviceStatus.textContent = `${state.newTask.repositories.length} repositories available`;
    elements.serviceStatus.className = 'mt-3 text-xs technical-font text-emerald-400';

  } catch (err) {
    console.error('Error loading repositories:', err);
    elements.repoError.textContent = err.message;
    elements.repoError.classList.remove('hidden');
    elements.taskRepoSearch.placeholder = 'Error loading repositories';
    elements.serviceStatus.textContent = err.message;
    elements.serviceStatus.className = 'mt-3 text-xs technical-font text-red-400';
  } finally {
    state.newTask.loadingRepos = false;
    elements.repoLoading.classList.add('hidden');
    elements.repoChevron.classList.remove('hidden');
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
  if (!window.electronAPI || state.newTask.creating) return;

  const service = state.newTask.selectedService;
  const repoValue = elements.taskRepo.value;
  const repoDataStr = elements.taskRepo.dataset.repoData;
  const repoData = repoDataStr ? JSON.parse(repoDataStr) : null;
  const branch = elements.taskBranch.value.trim() || 'main';
  const prompt = elements.taskPrompt.value.trim();
  const autoCreatePr = elements.taskAutoPr.checked;

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
      autoCreatePr: autoCreatePr
    };

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

    const result = await window.electronAPI.createTask(service, options);

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
  if (!window.electronAPI || !state.configuredServices.github) {
     elements.branchesContent.classList.add('hidden');
     elements.branchesEmpty.classList.remove('hidden');
     return;
  }

  state.github.loadingRepos = true;
  elements.branchesEmpty.classList.add('hidden');
  elements.branchesContent.classList.add('hidden');
  elements.branchesLoading.classList.remove('hidden');

  try {
     const result = await window.electronAPI.github.getRepos();
     
     if (result.success) {
        state.github.repos = result.repos || [];
        state.github.filteredRepos = [...state.github.repos];
        elements.repoCount.textContent = `${state.github.repos.length} REPOS`;
        
        renderRepos();
        
        elements.branchesLoading.classList.add('hidden');
        elements.branchesContent.classList.remove('hidden');
     } else {
        throw new Error(result.error);
     }
  } catch (err) {
     console.error('Error loading branches:', err);
     elements.branchesLoading.classList.add('hidden');
     elements.branchesEmpty.classList.remove('hidden');
     elements.branchesEmpty.querySelector('h3').textContent = 'Error Loading Repositories';
     elements.branchesEmpty.querySelector('p').textContent = err.message;
  } finally {
     state.github.loadingRepos = false;
  }
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

window.selectRepo = async function(owner, repoName, repoId) {
   // Update state
   const repo = state.github.repos.find(r => r.id === repoId);
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
   elements.prList.innerHTML = `
      <div class="flex flex-col items-center justify-center h-32">
         <span class="material-symbols-outlined text-[#C2B280] text-3xl animate-spin">sync</span>
         <span class="text-xs technical-font text-slate-500 mt-2">LOADING PRs...</span>
      </div>
   `;
   elements.prCount.textContent = '-';
   
   try {
      const result = await window.electronAPI.github.getPrs(owner, repoName);
      if (result.success) {
         state.github.prs = result.prs || [];
         elements.prCount.textContent = state.github.prs.length;
         renderPrs();
      } else {
         throw new Error(result.error);
      }
   } catch (err) {
      console.error('Error fetching PRs:', err);
      elements.prList.innerHTML = `
         <div class="p-4 border border-red-900/50 bg-red-900/10 text-red-400 text-xs technical-font text-center">
            FAILED TO LOAD PRs: ${escapeHtml(err.message)}
         </div>
      `;
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
   
   elements.prList.innerHTML = state.github.prs.map(pr => `
      <div class="pr-card bg-[#0D0D0D] border border-[#2A2A2A] p-4 hover:border-[#C2B280] transition-colors cursor-pointer group" 
           onclick="openPrDetails('${pr.base.repo.owner.login}', '${pr.base.repo.name}', ${pr.number})">
         <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2">
               <span class="text-[#C2B280] technical-font text-xs">#${pr.number}</span>
               <h3 class="font-bold text-slate-200 text-sm group-hover:text-[#C2B280] transition-colors">${escapeHtml(pr.title)}</h3>
            </div>
            <span class="px-2 py-0.5 text-[9px] technical-font bg-emerald-900/30 text-emerald-500 border border-emerald-900/50">OPEN</span>
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
   `).join('');
}

window.openPrDetails = async function(owner, repo, number) {
   elements.prModal.classList.remove('hidden');
   // Show loading state
   elements.prModalBody.innerHTML = '<div class="text-center py-8 text-slate-500">Loading details...</div>';
   elements.mergeStatusContainer.classList.add('opacity-50', 'pointer-events-none');
   
   try {
      const result = await window.electronAPI.github.getPrDetails(owner, repo, number);
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
         
         // Markdown body (simple text rendering for now, could use marked.js if added)
         elements.prModalBody.innerHTML = pr.body ? 
            pr.body.replace(/\n/g, '<br>').replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1 text-xs">$1</code>') : 
            '<em class="text-slate-500">No description provided.</em>';
         
         // Merge status
         elements.mergeStatusContainer.classList.remove('opacity-50', 'pointer-events-none');
         if (pr.mergeable) {
            elements.mergeIcon.textContent = 'check_circle';
            elements.mergeIcon.className = 'material-symbols-outlined text-emerald-500';
            elements.mergeTitle.textContent = 'This branch has no conflicts with the base branch';
            elements.mergeSubtitle.textContent = 'Merging can be performed automatically.';
            elements.mergeBtn.disabled = false;
            elements.mergeBtn.onclick = () => mergePr(owner, repo, number);
         } else if (pr.mergeable === false) {
            elements.mergeIcon.textContent = 'error';
            elements.mergeIcon.className = 'material-symbols-outlined text-red-500';
            elements.mergeTitle.textContent = 'This branch has conflicts that must be resolved';
            elements.mergeSubtitle.textContent = 'Resolve conflicts on GitHub to merge.';
            elements.mergeBtn.disabled = true;
         } else {
            elements.mergeIcon.textContent = 'pending';
            elements.mergeIcon.className = 'material-symbols-outlined text-yellow-500 animate-pulse';
            elements.mergeTitle.textContent = 'Checking mergeability...';
            elements.mergeSubtitle.textContent = 'Please wait.';
            elements.mergeBtn.disabled = true;
         }
      }
   } catch (err) {
      console.error('Error loading PR details:', err);
      elements.prModalBody.innerHTML = `<div class="text-red-400">Error: ${err.message}</div>`;
   }
};

window.mergePr = async function(owner, repo, number) {
   if (!confirm('Are you sure you want to merge this pull request?')) return;
   
   elements.mergeBtn.disabled = true;
   elements.mergeBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">sync</span> MERGING...';
   
   try {
      const result = await window.electronAPI.github.mergePr(owner, repo, number);
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

window.closePrModal = function() {
   elements.prModal.classList.add('hidden');
};


// ============================================ 
// Utilities
// ============================================ 

window.openExternal = function(url) {
  if (window.electronAPI) {
    window.electronAPI.openExternal(url);
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

// ============================================ 
// Start Application
// ============================================ 

document.addEventListener('DOMContentLoaded', init);