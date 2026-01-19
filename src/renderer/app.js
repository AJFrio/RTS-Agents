/**
 * RTS Agents Dashboard - Main Application
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
      claude: true
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
    geminiPaths: []
  },
  counts: {
    gemini: 0,
    jules: 0,
    cursor: 0,
    codex: 0,
    claude: 0,
    total: 0
  },
  // Track which services are configured/available
  configuredServices: {
    gemini: false,
    jules: false,
    cursor: false,
    codex: false,
    claude: false
  },
  loading: false,
  errors: [],
  // New task modal state
  newTask: {
    selectedService: null,
    repositories: [],
    loadingRepos: false,
    creating: false
  }
};

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Views
  viewDashboard: document.getElementById('view-dashboard'),
  viewSettings: document.getElementById('view-settings'),
  viewTitle: document.getElementById('view-title'),
  
  // Dashboard
  agentsGrid: document.getElementById('agents-grid'),
  loadingState: document.getElementById('loading-state'),
  emptyState: document.getElementById('empty-state'),
  errorBanner: document.getElementById('error-banner'),
  errorList: document.getElementById('error-list'),
  totalCount: document.getElementById('total-count'),
  
  // Filters
  searchInput: document.getElementById('search-input'),
  refreshBtn: document.getElementById('refresh-btn'),
  refreshIcon: document.getElementById('refresh-icon'),
  
  // Provider counts
  countGemini: document.getElementById('count-gemini'),
  countJules: document.getElementById('count-jules'),
  countCursor: document.getElementById('count-cursor'),
  countCodex: document.getElementById('count-codex'),
  countClaude: document.getElementById('count-claude'),
  
  // Status indicators
  statusGemini: document.getElementById('status-gemini'),
  statusJules: document.getElementById('status-jules'),
  statusCursor: document.getElementById('status-cursor'),
  statusCodex: document.getElementById('status-codex'),
  statusClaude: document.getElementById('status-claude'),
  
  // Settings
  julesApiKey: document.getElementById('jules-api-key'),
  cursorApiKey: document.getElementById('cursor-api-key'),
  codexApiKey: document.getElementById('codex-api-key'),
  claudeApiKey: document.getElementById('claude-api-key'),
  autoPolling: document.getElementById('auto-polling'),
  pollingInterval: document.getElementById('polling-interval'),
  intervalValue: document.getElementById('interval-value'),
  defaultGeminiPath: document.getElementById('default-gemini-path'),
  newGeminiPath: document.getElementById('new-gemini-path'),
  geminiPathsList: document.getElementById('gemini-paths-list'),
  
  // Modal
  agentModal: document.getElementById('agent-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalProviderBadge: document.getElementById('modal-provider-badge'),
  modalContent: document.getElementById('modal-content'),
  
  // New Task Modal
  newTaskModal: document.getElementById('new-task-modal'),
  newTaskBtn: document.getElementById('new-task-btn'),
  serviceStatus: document.getElementById('service-status'),
  taskRepo: document.getElementById('task-repo'),
  taskBranch: document.getElementById('task-branch'),
  taskPrompt: document.getElementById('task-prompt'),
  taskAutoPr: document.getElementById('task-auto-pr'),
  createTaskBtn: document.getElementById('create-task-btn'),
  repoLoading: document.getElementById('repo-loading'),
  repoChevron: document.getElementById('repo-chevron'),
  repoError: document.getElementById('repo-error'),
  createTaskLoading: document.getElementById('create-task-loading'),
  branchInputContainer: document.getElementById('branch-input-container')
};

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
  document.getElementById('save-cursor-key').addEventListener('click', () => saveApiKey('cursor'));
  document.getElementById('test-cursor-key').addEventListener('click', () => testApiKey('cursor'));
  document.getElementById('save-codex-key').addEventListener('click', () => saveApiKey('codex'));
  document.getElementById('test-codex-key').addEventListener('click', () => testApiKey('codex'));
  document.getElementById('save-claude-key').addEventListener('click', () => saveApiKey('claude'));
  document.getElementById('test-claude-key').addEventListener('click', () => testApiKey('claude'));

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

  // New Task Modal
  elements.newTaskBtn.addEventListener('click', openNewTaskModal);
  elements.taskRepo.addEventListener('change', validateNewTaskForm);
  elements.taskPrompt.addEventListener('input', validateNewTaskForm);
}

function setupPollingListener() {
  if (window.electronAPI && window.electronAPI.onRefreshTick) {
    window.electronAPI.onRefreshTick(() => {
      loadAgents(true); // Silent refresh
    });
  }
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
      geminiPaths: result.settings?.geminiPaths || []
    };

    // Update UI
    elements.autoPolling.checked = state.settings.autoPolling;
    const seconds = Math.round(state.settings.pollingInterval / 1000);
    elements.pollingInterval.value = seconds;
    elements.intervalValue.textContent = seconds;

    // Update Gemini paths
    elements.defaultGeminiPath.textContent = result.geminiDefaultPath || 'Not detected';
    renderGeminiPaths();

    // Track configured services
    state.configuredServices.gemini = result.geminiInstalled || false;
    state.configuredServices.jules = result.apiKeys?.jules || false;
    state.configuredServices.cursor = result.apiKeys?.cursor || false;
    state.configuredServices.codex = result.apiKeys?.codex || false;
    state.configuredServices.claude = result.claudeInstalled || result.apiKeys?.claude || false;

    // Update provider filter visibility based on configured services
    updateProviderFilterVisibility();

    // Show configured status for API keys
    if (result.apiKeys?.jules) {
      elements.julesApiKey.placeholder = '••••••••••••••••';
    }
    if (result.apiKeys?.cursor) {
      elements.cursorApiKey.placeholder = '••••••••••••••••';
    }
    if (result.apiKeys?.codex) {
      elements.codexApiKey.placeholder = '••••••••••••••••';
    }
    if (result.apiKeys?.claude) {
      elements.claudeApiKey.placeholder = '••••••••••••••••';
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
    updateStatusIndicator('claude', status.claude);
  } catch (err) {
    console.error('Error checking connection status:', err);
  }
}

/**
 * Update visibility of provider filters based on configured services
 */
function updateProviderFilterVisibility() {
  const providers = ['gemini', 'jules', 'cursor', 'codex', 'claude'];
  
  providers.forEach(provider => {
    const filterContainer = document.getElementById(`filter-${provider}`)?.closest('label');
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
  const providers = ['gemini', 'jules', 'cursor', 'codex'];
  
  providers.forEach(provider => {
    const serviceBtn = document.getElementById(`service-${provider}`);
    if (serviceBtn) {
      if (state.configuredServices[provider]) {
        serviceBtn.classList.remove('hidden');
      } else {
        serviceBtn.classList.add('hidden');
      }
    }
  });
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

  renderAgents();
}

// ============================================
// Rendering
// ============================================

function renderAgents() {
  if (state.filteredAgents.length === 0) {
    elements.agentsGrid.innerHTML = '';
    if (state.agents.length === 0) {
      elements.emptyState.classList.remove('hidden');
    } else {
      elements.emptyState.classList.add('hidden');
      elements.agentsGrid.innerHTML = `
        <div class="col-span-full text-center py-12 text-gray-400">
          <p>No agents match your current filters</p>
        </div>
      `;
    }
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.agentsGrid.innerHTML = state.filteredAgents.map(agent => createAgentCard(agent)).join('');
}

function createAgentCard(agent) {
  const providerColors = {
    gemini: 'emerald',
    jules: 'blue',
    cursor: 'purple',
    codex: 'cyan',
    claude: 'orange'
  };

  const statusColors = {
    running: 'blue',
    completed: 'green',
    pending: 'yellow',
    failed: 'red',
    stopped: 'gray'
  };

  const color = providerColors[agent.provider] || 'gray';
  const statusColor = statusColors[agent.status] || 'gray';
  const timeAgo = formatTimeAgo(agent.updatedAt || agent.createdAt);

  return `
    <div class="agent-card bg-gray-800 rounded-xl border border-gray-700 hover:border-${color}-500/50 transition-all cursor-pointer overflow-hidden"
         onclick="openAgentDetails('${agent.provider}', '${agent.rawId || ''}', '${agent.filePath || ''}')">
      <div class="p-4">
        <!-- Header -->
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="provider-badge bg-${color}-500/20 text-${color}-400 text-xs font-medium px-2 py-1 rounded">
              ${capitalizeFirst(agent.provider)}
            </span>
            <span class="status-badge bg-${statusColor}-500/20 text-${statusColor}-400 text-xs font-medium px-2 py-1 rounded flex items-center gap-1">
              ${agent.status === 'running' ? '<span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>' : ''}
              ${capitalizeFirst(agent.status)}
            </span>
          </div>
          <span class="text-xs text-gray-500">${timeAgo}</span>
        </div>

        <!-- Title -->
        <h4 class="text-sm font-medium text-white mb-2 line-clamp-2">${escapeHtml(agent.name)}</h4>

        <!-- Prompt preview -->
        ${agent.prompt ? `
          <p class="text-xs text-gray-400 line-clamp-2 mb-3">${escapeHtml(agent.prompt)}</p>
        ` : ''}

        <!-- Repository -->
        ${agent.repository ? `
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
            </svg>
            <span class="truncate">${extractRepoName(agent.repository)}</span>
          </div>
        ` : ''}

        <!-- PR Link -->
        ${agent.prUrl ? `
          <div class="mt-2">
            <a href="#" onclick="event.stopPropagation(); openExternal('${agent.prUrl}')" 
               class="text-xs text-${color}-400 hover:text-${color}-300 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
              View Pull Request
            </a>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderGeminiPaths() {
  const paths = state.settings.geminiPaths;
  
  if (paths.length === 0) {
    elements.geminiPathsList.innerHTML = `
      <p class="text-sm text-gray-500 italic">No custom paths added</p>
    `;
    return;
  }

  elements.geminiPathsList.innerHTML = paths.map(path => `
    <div class="flex items-center justify-between p-2 bg-gray-700/50 rounded-lg">
      <span class="text-sm text-gray-300 font-mono truncate">${escapeHtml(path)}</span>
      <button onclick="removeGeminiPath('${escapeHtml(path)}')" 
              class="text-gray-400 hover:text-red-400 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
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
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Update title
  elements.viewTitle.textContent = view === 'dashboard' ? 'Dashboard' : 'Settings';

  // Show/hide views
  elements.viewDashboard.classList.toggle('hidden', view !== 'dashboard');
  elements.viewSettings.classList.toggle('hidden', view !== 'settings');
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
  elements.refreshIcon.classList.toggle('animate-spin', refreshing);
  elements.refreshBtn.disabled = refreshing;
}

function updateCounts() {
  elements.countGemini.textContent = state.counts.gemini;
  elements.countJules.textContent = state.counts.jules;
  elements.countCursor.textContent = state.counts.cursor;
  elements.countCodex.textContent = state.counts.codex;
  elements.countClaude.textContent = state.counts.claude;
  elements.totalCount.textContent = `${state.counts.total} agent${state.counts.total !== 1 ? 's' : ''}`;
}

function updateStatusIndicator(provider, status) {
  const el = elements[`status${capitalizeFirst(provider)}`];
  if (!el) return;

  if (status.success || status.connected) {
    el.textContent = 'Connected';
    el.className = 'status-indicator text-green-400';
  } else if (status.error === 'Not configured') {
    el.textContent = 'Not configured';
    el.className = 'status-indicator text-gray-500';
  } else {
    el.textContent = 'Error';
    el.className = 'status-indicator text-red-400';
    el.title = status.error || '';
  }
}

function showErrors() {
  if (state.errors.length === 0) {
    elements.errorBanner.classList.add('hidden');
    return;
  }

  elements.errorBanner.classList.remove('hidden');
  elements.errorList.innerHTML = state.errors.map(e => 
    `<li>${capitalizeFirst(e.provider)}: ${escapeHtml(e.error)}</li>`
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
    claude: elements.claudeApiKey
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
    
    // Update configured services state and UI visibility
    state.configuredServices[provider] = true;
    updateProviderFilterVisibility();
    
    await checkConnectionStatus();
    await loadAgents();
  } catch (err) {
    showToast(`Failed to save API key: ${err.message}`, 'error');
  }
}

async function testApiKey(provider) {
  try {
    const result = await window.electronAPI.testApiKey(provider);
    if (result.success) {
      showToast(`${capitalizeFirst(provider)} connection successful`, 'success');
    } else {
      showToast(`${capitalizeFirst(provider)} connection failed: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Test failed: ${err.message}`, 'error');
  }
}

async function updatePollingSettings(enabled, interval) {
  try {
    await window.electronAPI.setPolling(enabled, interval);
    state.settings.autoPolling = enabled;
    state.settings.pollingInterval = interval;
  } catch (err) {
    showToast(`Failed to update settings: ${err.message}`, 'error');
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

// ============================================
// Modal
// ============================================

window.openAgentDetails = async function(provider, rawId, filePath) {
  elements.agentModal.classList.remove('hidden');
  elements.modalContent.innerHTML = `
    <div class="flex items-center justify-center h-32">
      <svg class="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  `;

  const providerColors = { gemini: 'emerald', jules: 'blue', cursor: 'purple', codex: 'cyan', claude: 'orange' };
  const color = providerColors[provider] || 'gray';
  elements.modalProviderBadge.className = `provider-badge bg-${color}-500/20 text-${color}-400 text-xs font-medium px-2 py-1 rounded`;
  elements.modalProviderBadge.textContent = capitalizeFirst(provider);

  try {
    const details = await window.electronAPI.getAgentDetails(provider, rawId, filePath);
    renderAgentDetails(provider, details);
  } catch (err) {
    elements.modalContent.innerHTML = `
      <div class="text-center py-8">
        <p class="text-red-400">Failed to load details: ${escapeHtml(err.message)}</p>
      </div>
    `;
  }
};

function renderAgentDetails(provider, details) {
  elements.modalTitle.textContent = details.name || 'Agent Details';
  
  // Update subtitle with status
  const modalSubtitle = document.getElementById('modal-subtitle');
  if (modalSubtitle) {
    modalSubtitle.textContent = details.status ? `Status: ${capitalizeFirst(details.status)}` : 'Task overview and activity';
  }

  const statusColors = {
    running: 'blue',
    completed: 'green',
    pending: 'yellow',
    failed: 'red',
    stopped: 'gray'
  };
  const statusColor = statusColors[details.status] || 'gray';

  let content = '';

  // Status Bar with key info
  content += `
    <div class="space-y-6 text-left">
      <!-- Status & Metadata Section -->
      <div class="bg-gray-700/30 rounded-lg border border-gray-700/50 overflow-hidden">
        <!-- Status Header -->
        <div class="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="status-badge bg-${statusColor}-500/20 text-${statusColor}-400 text-xs font-medium px-2.5 py-1 rounded flex items-center gap-1.5">
              ${details.status === 'running' ? '<span class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></span>' : ''}
              ${capitalizeFirst(details.status || 'Unknown')}
            </span>
            <span class="text-xs text-gray-500">
              ${details.createdAt ? 'Created ' + formatTimeAgo(details.createdAt) : ''}
            </span>
          </div>
          ${details.prUrl ? `
            <a href="#" onclick="openExternal('${details.prUrl}')" 
               class="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
              View PR
            </a>
          ` : ''}
        </div>
        
        <!-- Metadata Grid -->
        <div class="grid grid-cols-2 divide-x divide-gray-700/50">
          <div class="p-4 space-y-3 text-left">
            <div class="flex items-start gap-3">
              <svg class="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div class="text-left">
                <span class="text-xs text-gray-500 uppercase tracking-wide block text-left">Created</span>
                <p class="text-sm text-white mt-0.5 text-left">${details.createdAt ? new Date(details.createdAt).toLocaleString() : 'Unknown'}</p>
              </div>
            </div>
            ${details.updatedAt ? `
            <div class="flex items-start gap-3">
              <svg class="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              <div class="text-left">
                <span class="text-xs text-gray-500 uppercase tracking-wide block text-left">Updated</span>
                <p class="text-sm text-white mt-0.5 text-left">${new Date(details.updatedAt).toLocaleString()}</p>
              </div>
            </div>
            ` : ''}
          </div>
          <div class="p-4 space-y-3 text-left">
            ${details.repository ? `
            <div class="flex items-start gap-3">
              <svg class="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
              </svg>
              <div class="min-w-0 flex-1 text-left">
                <span class="text-xs text-gray-500 uppercase tracking-wide block text-left">Repository</span>
                <p class="text-sm text-white mt-0.5 truncate text-left">${escapeHtml(extractRepoName(details.repository))}</p>
              </div>
            </div>
            ` : ''}
            ${details.branch ? `
            <div class="flex items-start gap-3">
              <svg class="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
              <div class="text-left">
                <span class="text-xs text-gray-500 uppercase tracking-wide block text-left">Branch</span>
                <p class="text-sm text-white mt-0.5 font-mono text-left">${escapeHtml(details.branch)}</p>
              </div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
  `;

  // Task/Prompt Section
  if (details.prompt) {
    content += `
      <!-- Task Description Section -->
      <div>
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
          <h4 class="text-sm font-semibold text-white uppercase tracking-wide">Task Description</h4>
        </div>
        <div class="p-4 bg-gray-700/30 rounded-lg border border-gray-700/50">
          <p class="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">${escapeHtml(details.prompt)}</p>
        </div>
      </div>
    `;
  }

  // Summary Section
  if (details.summary) {
    content += `
      <!-- Summary Section -->
      <div class="text-left">
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <h4 class="text-sm font-semibold text-white uppercase tracking-wide">Summary</h4>
        </div>
        <div class="p-4 bg-gray-700/30 rounded-lg border border-gray-700/50">
          <p class="text-sm text-gray-300 leading-relaxed text-left">${escapeHtml(details.summary)}</p>
        </div>
      </div>
    `;
  }

  // Conversation/Messages Section
  if (details.conversation && details.conversation.length > 0) {
    content += `
      <!-- Conversation Section -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
            <h4 class="text-sm font-semibold text-white uppercase tracking-wide">Conversation</h4>
          </div>
          <span class="text-xs text-gray-500">${details.conversation.length} message${details.conversation.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="space-y-3 max-h-72 overflow-y-auto pr-2">
          ${details.conversation.map(msg => `
            <div class="flex ${msg.isUser ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[85%] ${msg.isUser ? 'bg-blue-600/20 border-blue-500/30' : 'bg-gray-700/50 border-gray-600/50'} border rounded-lg p-3">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-medium ${msg.isUser ? 'text-blue-400' : 'text-gray-400'}">${msg.isUser ? 'You' : 'Agent'}</span>
                </div>
                <p class="text-sm text-white leading-relaxed">${escapeHtml(msg.text || '')}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Activities Section (Jules)
  if (details.activities && details.activities.length > 0) {
    content += `
      <!-- Activity Timeline Section -->
      <div class="text-left">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
            </svg>
            <h4 class="text-sm font-semibold text-white uppercase tracking-wide">Activity Timeline</h4>
          </div>
          <span class="text-xs text-gray-500">${details.activities.length} event${details.activities.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="relative max-h-72 overflow-y-auto pr-2">
          <div class="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-700"></div>
          <div class="space-y-3">
            ${details.activities.map((activity, index) => `
              <div class="relative pl-6 text-left">
                <div class="absolute left-0 top-1.5 w-4 h-4 rounded-full ${index === 0 ? 'bg-blue-500' : 'bg-gray-600'} border-2 border-gray-800 flex items-center justify-center">
                  ${index === 0 ? '<span class="w-1.5 h-1.5 bg-white rounded-full"></span>' : ''}
                </div>
                <div class="bg-gray-700/30 border border-gray-700/50 rounded-lg p-3">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-medium text-white text-left">${activity.title || activity.type}</span>
                    <span class="text-xs text-gray-500">${activity.timestamp ? formatTimeAgo(activity.timestamp) : ''}</span>
                  </div>
                  ${activity.description ? `<p class="text-xs text-gray-400 leading-relaxed text-left">${escapeHtml(activity.description)}</p>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Messages Section (Gemini)
  if (details.messages && details.messages.length > 0) {
    content += `
      <!-- Messages Section -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
            <h4 class="text-sm font-semibold text-white uppercase tracking-wide">Messages</h4>
          </div>
          <span class="text-xs text-gray-500">${details.messages.length} message${details.messages.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="space-y-3 max-h-72 overflow-y-auto pr-2">
          ${details.messages.map(msg => `
            <div class="flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[85%] ${msg.role === 'user' ? 'bg-emerald-600/20 border-emerald-500/30' : 'bg-gray-700/50 border-gray-600/50'} border rounded-lg p-3">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-medium ${msg.role === 'user' ? 'text-emerald-400' : 'text-gray-400'}">${capitalizeFirst(msg.role)}</span>
                </div>
                <p class="text-sm text-white leading-relaxed whitespace-pre-wrap">${escapeHtml(msg.content || '')}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
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
    btn.classList.remove('border-emerald-500', 'border-blue-500', 'border-purple-500', 'border-cyan-500', 'border-orange-500', 'bg-emerald-500/10', 'bg-blue-500/10', 'bg-purple-500/10', 'bg-cyan-500/10', 'bg-orange-500/10');
    btn.classList.add('border-gray-600');
  });

  // Reset form fields
  elements.taskRepo.innerHTML = '<option value="">Select a service first...</option>';
  elements.taskRepo.disabled = true;
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
  const serviceColors = {
    gemini: 'emerald',
    jules: 'blue',
    cursor: 'purple',
    codex: 'cyan',
    claude: 'orange'
  };

  document.querySelectorAll('.service-btn').forEach(btn => {
    btn.classList.remove('border-emerald-500', 'border-blue-500', 'border-purple-500', 'border-cyan-500', 'border-orange-500', 'bg-emerald-500/10', 'bg-blue-500/10', 'bg-purple-500/10', 'bg-cyan-500/10', 'bg-orange-500/10');
    btn.classList.add('border-gray-600');
  });

  const selectedBtn = document.getElementById(`service-${service}`);
  const color = serviceColors[service];
  selectedBtn.classList.remove('border-gray-600');
  selectedBtn.classList.add(`border-${color}-500`, `bg-${color}-500/10`);

  // Show/hide branch input for Gemini, Codex, and Claude (local projects don't need branch)
  if (service === 'gemini' || service === 'codex' || service === 'claude') {
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
  elements.taskRepo.disabled = true;
  elements.taskRepo.innerHTML = '<option value="">Loading repositories...</option>';
  elements.repoLoading.classList.remove('hidden');
  elements.repoChevron.classList.add('hidden');
  elements.repoError.classList.add('hidden');
  elements.serviceStatus.textContent = '';

  try {
    const result = await window.electronAPI.getRepositories(service);

    if (!result.success) {
      elements.repoError.textContent = result.error;
      elements.repoError.classList.remove('hidden');
      elements.taskRepo.innerHTML = '<option value="">No repositories available</option>';
      elements.serviceStatus.textContent = result.error;
      elements.serviceStatus.className = 'mt-2 text-xs text-red-400';
      return;
    }

    state.newTask.repositories = result.repositories || [];

    if (state.newTask.repositories.length === 0) {
      elements.taskRepo.innerHTML = '<option value="">No repositories found</option>';
      elements.serviceStatus.textContent = 'No repositories available for this service';
      elements.serviceStatus.className = 'mt-2 text-xs text-yellow-400';
      return;
    }

    // Populate dropdown
    elements.taskRepo.innerHTML = '<option value="">Select a repository...</option>';
    
    for (const repo of state.newTask.repositories) {
      const option = document.createElement('option');
      option.value = service === 'jules' ? repo.id : (repo.url || repo.path || repo.id);
      option.textContent = repo.displayName || repo.name;
      option.dataset.repoData = JSON.stringify(repo);
      elements.taskRepo.appendChild(option);
    }

    elements.taskRepo.disabled = false;
    elements.serviceStatus.textContent = `${state.newTask.repositories.length} repositories available`;
    elements.serviceStatus.className = 'mt-2 text-xs text-green-400';

  } catch (err) {
    console.error('Error loading repositories:', err);
    elements.repoError.textContent = err.message;
    elements.repoError.classList.remove('hidden');
    elements.taskRepo.innerHTML = '<option value="">Error loading repositories</option>';
    elements.serviceStatus.textContent = err.message;
    elements.serviceStatus.className = 'mt-2 text-xs text-red-400';
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

  // Codex and Claude (cloud) don't require a repository - just a prompt
  const repoRequired = state.newTask.selectedService !== 'codex' && state.newTask.selectedService !== 'claude';
  
  elements.createTaskBtn.disabled = !(hasService && hasPrompt && (hasRepo || !repoRequired));
}

window.submitNewTask = async function() {
  if (!window.electronAPI || state.newTask.creating) return;

  const service = state.newTask.selectedService;
  const repoValue = elements.taskRepo.value;
  const branch = elements.taskBranch.value.trim() || 'main';
  const prompt = elements.taskPrompt.value.trim();
  const autoCreatePr = elements.taskAutoPr.checked;

  if (!service || !repoValue || !prompt) {
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
      const selectedOption = elements.taskRepo.options[elements.taskRepo.selectedIndex];
      const repoData = selectedOption.dataset.repoData ? JSON.parse(selectedOption.dataset.repoData) : null;
      options.projectPath = repoData?.path || repoValue;
    } else if (service === 'codex') {
      // For Codex, use repository context if provided
      options.repository = repoValue || null;
      options.title = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
    } else if (service === 'claude') {
      // For Claude, use project path if provided (local) or just prompt (cloud)
      const selectedOption = elements.taskRepo.options[elements.taskRepo.selectedIndex];
      const repoData = selectedOption?.dataset?.repoData ? JSON.parse(selectedOption.dataset.repoData) : null;
      options.projectPath = repoData?.path || repoValue || null;
      options.repository = repoValue || null;
      options.title = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
    }

    const result = await window.electronAPI.createTask(service, options);

    if (result.success) {
      showToast(`Task created successfully!`, 'success');
      closeNewTaskModal();
      // Refresh the agents list to show the new task
      await loadAgents();
    } else {
      showToast(`Failed to create task: ${result.error}`, 'error');
    }
  } catch (err) {
    console.error('Error creating task:', err);
    showToast(`Error creating task: ${err.message}`, 'error');
  } finally {
    state.newTask.creating = false;
    elements.createTaskBtn.disabled = false;
    elements.createTaskLoading.classList.add('hidden');
    validateNewTaskForm();
  }
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

function formatTimeAgo(date) {
  if (!date) return '';
  
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return then.toLocaleDateString();
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
  // Simple toast implementation
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm font-medium z-50 transition-all transform translate-y-0 opacity-100 ${
    type === 'success' ? 'bg-green-600 text-white' :
    type === 'error' ? 'bg-red-600 text-white' :
    'bg-gray-700 text-white'
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
