/**
 * Terminal Component
 * Wrapper around xterm.js for embedded CLI terminals
 */

// Import xterm.js (will be loaded via script tags in HTML for Electron compatibility)
// The Terminal class and addons will be available globally

class TerminalComponent {
  constructor(containerId, sessionId, options = {}) {
    this.containerId = containerId;
    this.sessionId = sessionId;
    this.options = options;
    this.terminal = null;
    this.fitAddon = null;
    this.webLinksAddon = null;
    this.container = null;
    this.isAttached = false;
    this.unsubscribers = [];
    
    // Bind methods
    this.handleOutput = this.handleOutput.bind(this);
    this.handleExit = this.handleExit.bind(this);
    this.handleStatusChange = this.handleStatusChange.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  /**
   * Initialize and attach the terminal to the DOM
   */
  async init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      throw new Error(`Container element not found: ${this.containerId}`);
    }

    // Create terminal instance with theme matching the app
    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#C2B280',
        cursorAccent: '#0a0a0a',
        selectionBackground: 'rgba(194, 178, 128, 0.3)',
        selectionForeground: '#ffffff',
        black: '#18181b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#C2B280',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#d4c98a',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#fafafa'
      },
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true
    });

    // Initialize addons
    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.webLinksAddon = new WebLinksAddon.WebLinksAddon((event, uri) => {
      // Open links in external browser
      if (window.electronAPI) {
        window.electronAPI.openExternal(uri);
      }
    });
    this.terminal.loadAddon(this.webLinksAddon);

    // Open terminal in container
    this.terminal.open(this.container);
    this.isAttached = true;

    // Fit to container
    this.fit();

    // Set up resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.fit();
    });
    this.resizeObserver.observe(this.container);

    // Set up input handler
    this.terminal.onData((data) => {
      this.handleInput(data);
    });

    // Subscribe to IPC events
    this.subscribeToEvents();

    // Request initial output buffer if reconnecting to existing session
    await this.loadExistingOutput();

    // Notify main process about terminal dimensions
    this.sendResize();

    return this;
  }

  /**
   * Subscribe to IPC events for this session
   */
  subscribeToEvents() {
    if (!window.electronAPI) return;

    // Subscribe to terminal output
    const unsubOutput = window.electronAPI.onTerminalOutput(this.handleOutput);
    this.unsubscribers.push(unsubOutput);

    // Subscribe to terminal exit
    const unsubExit = window.electronAPI.onTerminalExit(this.handleExit);
    this.unsubscribers.push(unsubExit);

    // Subscribe to status changes
    const unsubStatus = window.electronAPI.onSessionStatusChange(this.handleStatusChange);
    this.unsubscribers.push(unsubStatus);

    // Window resize handler
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Unsubscribe from all events
   */
  unsubscribeFromEvents() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    window.removeEventListener('resize', this.handleResize);
  }

  /**
   * Handle output from the PTY
   */
  handleOutput(data) {
    if (data.sessionId === this.sessionId && this.terminal) {
      this.terminal.write(data.data);
      
      // Record activity
      if (window.electronAPI) {
        window.electronAPI.recordCliActivity(this.sessionId);
      }
    }
  }

  /**
   * Handle PTY exit
   */
  handleExit(data) {
    if (data.sessionId === this.sessionId && this.terminal) {
      // Write exit message to terminal
      this.terminal.write(`\r\n\x1b[33m[Session ended with exit code ${data.exitCode}]\x1b[0m\r\n`);
      
      // Notify callback if provided
      if (this.options.onExit) {
        this.options.onExit(data);
      }
    }
  }

  /**
   * Handle session status change
   */
  handleStatusChange(data) {
    if (data.sessionId === this.sessionId) {
      if (this.options.onStatusChange) {
        this.options.onStatusChange(data);
      }
    }
  }

  /**
   * Handle user input from terminal
   */
  handleInput(data) {
    if (!window.electronAPI) return;
    
    window.electronAPI.writeToTerminal(this.sessionId, data);
    
    // Record activity
    window.electronAPI.recordCliActivity(this.sessionId);
  }

  /**
   * Handle window resize
   */
  handleResize() {
    this.fit();
  }

  /**
   * Fit terminal to container and notify main process
   */
  fit() {
    if (this.fitAddon && this.isAttached) {
      try {
        this.fitAddon.fit();
        this.sendResize();
      } catch (err) {
        // Ignore fit errors (can happen during transitions)
      }
    }
  }

  /**
   * Send resize dimensions to main process
   */
  sendResize() {
    if (!window.electronAPI || !this.terminal) return;
    
    const { cols, rows } = this.terminal;
    window.electronAPI.resizeTerminal(this.sessionId, cols, rows);
  }

  /**
   * Load existing output buffer (for reconnecting to sessions)
   */
  async loadExistingOutput() {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.getTerminalOutput(this.sessionId);
      if (result.success && result.output) {
        this.terminal.write(result.output);
      }
    } catch (err) {
      console.error('Error loading existing output:', err);
    }
  }

  /**
   * Write data directly to the terminal (for displaying messages)
   */
  write(data) {
    if (this.terminal) {
      this.terminal.write(data);
    }
  }

  /**
   * Write a line with newline
   */
  writeln(data) {
    if (this.terminal) {
      this.terminal.writeln(data);
    }
  }

  /**
   * Clear the terminal
   */
  clear() {
    if (this.terminal) {
      this.terminal.clear();
    }
  }

  /**
   * Focus the terminal
   */
  focus() {
    if (this.terminal) {
      this.terminal.focus();
    }
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    if (this.terminal) {
      this.terminal.scrollToBottom();
    }
  }

  /**
   * Dispose of the terminal and clean up
   */
  dispose() {
    // Unsubscribe from events
    this.unsubscribeFromEvents();

    // Stop observing resize
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Dispose terminal
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }

    this.isAttached = false;
  }

  /**
   * Check if terminal is attached and active
   */
  isActive() {
    return this.isAttached && this.terminal !== null;
  }
}

/**
 * Factory function to create and initialize a terminal
 */
async function createTerminal(containerId, sessionId, options = {}) {
  const terminal = new TerminalComponent(containerId, sessionId, options);
  await terminal.init();
  return terminal;
}

/**
 * Create a read-only terminal for viewing historical output
 */
async function createReadOnlyTerminal(containerId, output, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container element not found: ${containerId}`);
  }

  // Create terminal instance
  const terminal = new Terminal({
    cursorBlink: false,
    disableStdin: true,
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
    lineHeight: 1.2,
    theme: {
      background: '#0a0a0a',
      foreground: '#e4e4e7',
      cursor: '#C2B280',
      cursorAccent: '#0a0a0a',
      selectionBackground: 'rgba(194, 178, 128, 0.3)',
      selectionForeground: '#ffffff',
      black: '#18181b',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#C2B280',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#e4e4e7',
      brightBlack: '#52525b',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#d4c98a',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#fafafa'
    },
    scrollback: 10000,
    convertEol: true
  });

  // Initialize fit addon
  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);

  // Initialize web links addon
  const webLinksAddon = new WebLinksAddon.WebLinksAddon((event, uri) => {
    if (window.electronAPI) {
      window.electronAPI.openExternal(uri);
    }
  });
  terminal.loadAddon(webLinksAddon);

  // Open and fit
  terminal.open(container);
  fitAddon.fit();

  // Write the output
  if (output) {
    terminal.write(output);
  }

  // Set up resize observer
  const resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon.fit();
    } catch (err) {
      // Ignore
    }
  });
  resizeObserver.observe(container);

  return {
    terminal,
    fitAddon,
    dispose: () => {
      resizeObserver.disconnect();
      terminal.dispose();
      container.innerHTML = '';
    }
  };
}

// Export for use in app.js
window.TerminalComponent = TerminalComponent;
window.createTerminal = createTerminal;
window.createReadOnlyTerminal = createReadOnlyTerminal;
