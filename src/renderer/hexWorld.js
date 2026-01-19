/**
 * Hexagonal World Renderer for RTS Agents
 * Uses p5.js for rendering an interactive 2D hexagonal tile-based interface
 */

// Service configuration with colors
// Jules: Purple, Gemini CLI: Blue, Cursor Cloud: Grey, Codex: Brown
const SERVICE_CONFIG = {
  jules: {
    name: 'Jules',
    color: '#8B5CF6',      // Purple
    darkColor: '#6D28D9',
    lightColor: '#A78BFA',
    position: { q: -1, r: 0 }  // Left
  },
  gemini: {
    name: 'Gemini CLI',
    color: '#3B82F6',      // Blue
    darkColor: '#1D4ED8',
    lightColor: '#60A5FA',
    position: { q: 1, r: 0 }   // Right
  },
  cursor: {
    name: 'Cursor Cloud',
    color: '#6B7280',      // Grey
    darkColor: '#4B5563',
    lightColor: '#9CA3AF',
    position: { q: 0, r: -1 }  // Top
  },
  codex: {
    name: 'Codex',
    color: '#92400E',      // Brown
    darkColor: '#78350F',
    lightColor: '#B45309',
    position: { q: 0, r: 1 }   // Bottom
  }
};

const NEW_TASK_COLOR = '#22C55E';  // Green for new task tile
const NEW_TASK_DARK = '#16A34A';
const BACKGROUND_COLOR = '#111827'; // Dark gray background
const GRID_COLOR = '#1F2937';       // Subtle grid lines

// Global hex world instance
let hexWorld = null;

/**
 * HexWorld class - Main controller for the hexagonal world
 */
class HexWorld {
  constructor(p5Instance, containerElement) {
    this.p = p5Instance;
    this.container = containerElement;
    
    // Camera state
    this.camera = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      zoom: 1,
      targetZoom: 1
    };
    
    // Interaction state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragCameraStart = { x: 0, y: 0 };
    this.hoveredService = null;
    this.hoveredTask = null;
    
    // View state
    this.viewMode = 'world'; // 'world' or 'service'
    this.selectedService = null;
    this.zoomAnimating = false;
    this.zoomProgress = 0;
    
    // Sizing
    this.serviceHexSize = 120;
    this.taskHexSize = 50;
    this.worldSpacing = 280; // Distance between service hexagons in world view
    
    // Data
    this.services = {};
    this.initializeServices();
    
    // Animation
    this.pulsePhase = 0;
    this.bobPhase = 0; // For bobbing animation
    this.frameCount = 0;
    
    // Physics for task positions
    this.taskPhysics = {}; // Per-service physics state: { serviceKey: [{x, y, vx, vy}, ...] }
    this.physicsEnabled = true;
    this.minHexDistance = this.taskHexSize * 2.1; // Minimum distance between hex centers
    this.centerExclusionRadius = this.taskHexSize * 2.2; // Keep tasks away from center "New Task" hex
  }
  
  /**
   * Initialize service data structures
   */
  initializeServices() {
    for (const [key, config] of Object.entries(SERVICE_CONFIG)) {
      this.services[key] = {
        ...config,
        key: key,
        tasks: [],
        taskCount: 0,
        isConfigured: false
      };
    }
  }
  
  /**
   * Update services with agent data from the app state
   * @param {Array} agents - Array of agent objects from state
   * @param {Object} configuredServices - Object indicating which services are configured
   */
  updateAgents(agents, configuredServices) {
    console.log('HexWorld.updateAgents called with', agents?.length || 0, 'agents');
    console.log('Configured services:', configuredServices);
    
    // Track old task counts to detect changes
    const oldTaskCounts = {};
    for (const [key, service] of Object.entries(this.services)) {
      oldTaskCounts[key] = service.taskCount;
    }
    
    // Reset task lists
    for (const service of Object.values(this.services)) {
      service.tasks = [];
      service.taskCount = 0;
      service.isConfigured = configuredServices[service.key] || false;
    }
    
    // Group agents by provider
    if (agents && agents.length > 0) {
      for (const agent of agents) {
        const service = this.services[agent.provider];
        if (service) {
          service.tasks.push(agent);
          service.taskCount++;
        } else {
          console.warn('Unknown provider:', agent.provider);
        }
      }
    }
    
    // Reset physics for services whose task count changed
    for (const [key, service] of Object.entries(this.services)) {
      if (oldTaskCounts[key] !== service.taskCount) {
        // Task count changed, reset physics for this service
        delete this.taskPhysics[key];
        console.log(`Service ${key}: task count changed (${oldTaskCounts[key]} -> ${service.taskCount}), resetting physics`);
      }
      console.log(`Service ${key}: ${service.taskCount} tasks, configured: ${service.isConfigured}`);
    }
  }
  
  /**
   * Get world position for a service hexagon
   */
  getServiceWorldPosition(serviceKey) {
    const service = this.services[serviceKey];
    if (!service) return { x: 0, y: 0 };
    
    const pos = HexUtils.hexToPixel(service.position.q, service.position.r, this.worldSpacing);
    return pos;
  }
  
  /**
   * Main draw function called every frame
   */
  draw() {
    const p = this.p;
    
    // Update animations
    this.updateAnimations();
    
    // Clear background
    p.background(BACKGROUND_COLOR);
    
    // Apply camera transform
    p.push();
    p.translate(p.width / 2, p.height / 2);
    p.scale(this.camera.zoom);
    p.translate(-this.camera.x, -this.camera.y);
    
    // Draw based on current view mode
    if (this.viewMode === 'world') {
      this.drawWorldView();
    } else if (this.viewMode === 'service') {
      this.drawServiceView();
    }
    
    p.pop();
    
    // Draw UI overlay (not affected by camera)
    this.drawOverlay();
  }
  
  /**
   * Draw the main world view with service hexagons
   */
  drawWorldView() {
    const p = this.p;
    
    // Draw subtle background grid
    this.drawBackgroundGrid();
    
    // Draw service hexagons with bobbing
    const serviceKeys = Object.keys(this.services);
    for (let i = 0; i < serviceKeys.length; i++) {
      const key = serviceKeys[i];
      const service = this.services[key];
      const pos = this.getServiceWorldPosition(key);
      const isHovered = this.hoveredService === key;
      
      // Add bobbing animation
      const bobOffset = this.getBobOffset(i);
      this.drawServiceHexagon(service, pos.x, pos.y + bobOffset, isHovered);
    }
  }
  
  /**
   * Draw a single service hexagon
   */
  drawServiceHexagon(service, x, y, isHovered) {
    const p = this.p;
    const size = this.serviceHexSize;
    
    // Determine colors based on state
    let fillColor = service.color;
    let strokeColor = service.lightColor;
    let glowIntensity = 0;
    
    if (!service.isConfigured) {
      fillColor = HexUtils.desaturateColor(service.color, 0.6);
      strokeColor = HexUtils.desaturateColor(service.lightColor, 0.6);
    }
    
    if (isHovered) {
      glowIntensity = 0.6;
      fillColor = service.lightColor;
    }
    
    // Draw glow if hovered
    if (glowIntensity > 0) {
      HexUtils.drawHexagonWithGlow(p, x, y, size, fillColor, strokeColor, glowIntensity);
    } else {
      // Draw shadow
      HexUtils.drawHexagon(p, x + 4, y + 4, size, '#00000040', null, 0);
      // Draw main hexagon
      HexUtils.drawHexagon(p, x, y, size, fillColor, strokeColor, 3);
    }
    
    // Draw service name
    p.push();
    p.fill(255);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(16);
    p.textStyle(p.BOLD);
    p.text(service.name, x, y - 15);
    
    // Draw task count
    p.textSize(12);
    p.textStyle(p.NORMAL);
    p.fill(200);
    const countText = service.taskCount === 1 ? '1 task' : `${service.taskCount} tasks`;
    p.text(countText, x, y + 15);
    
    // Draw status indicator
    if (!service.isConfigured) {
      p.textSize(10);
      p.fill(150);
      p.text('Not configured', x, y + 35);
    }
    p.pop();
  }
  
  /**
   * Draw the zoomed service view with task hexagons
   */
  drawServiceView() {
    const p = this.p;
    const service = this.services[this.selectedService];
    if (!service) return;
    
    // Draw subtle background
    this.drawBackgroundGrid();
    
    // Calculate positions for task hexagons in a spiral pattern
    const taskPositions = this.calculateTaskPositions(service.tasks.length);
    
    // Draw task hexagons FIRST (underneath)
    for (let i = 0; i < service.tasks.length; i++) {
      const task = service.tasks[i];
      const pos = taskPositions[i];
      const isHovered = this.hoveredTask === task;
      
      // Add bobbing animation
      const bobOffset = this.getBobOffset(i + 1); // +1 to differentiate from center
      this.drawTaskHexagon(service, task, pos.x, pos.y + bobOffset, isHovered);
    }
    
    // Draw "New Task" hexagon at center LAST (on top)
    const newTaskHovered = this.hoveredTask === 'new';
    const centerBobOffset = this.getBobOffset(0); // Center gets index 0
    this.drawNewTaskHexagon(0, centerBobOffset, newTaskHovered);
    
    // Draw tooltip for hovered task (drawn last so it's on top of everything)
    // Pass bobbed positions for tooltip placement
    const bobbedPositions = taskPositions.map((pos, i) => ({
      x: pos.x,
      y: pos.y + this.getBobOffset(i + 1)
    }));
    this.drawTaskTooltip(bobbedPositions);
  }
  
  /**
   * Draw tooltip for hovered task
   */
  drawTaskTooltip(taskPositions) {
    const p = this.p;
    
    // Only show tooltip for actual tasks, not "new" task button
    if (!this.hoveredTask || this.hoveredTask === 'new') return;
    
    const task = this.hoveredTask;
    const service = this.services[this.selectedService];
    if (!service) return;
    
    // Find the position of the hovered task
    const taskIndex = service.tasks.indexOf(task);
    if (taskIndex === -1) return;
    
    const pos = taskPositions[taskIndex];
    
    // Get the prompt text
    const promptText = task.prompt || task.title || 'No description';
    
    // Calculate tooltip dimensions
    const maxWidth = 300;
    const padding = 12;
    const lineHeight = 16;
    
    p.push();
    p.textSize(12);
    p.textAlign(p.LEFT, p.TOP);
    
    // Word wrap the text
    const words = promptText.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const testWidth = p.textWidth(testLine);
      
      if (testWidth > maxWidth - padding * 2) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word too long, truncate
          lines.push(word.substring(0, 30) + '...');
          currentLine = '';
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    
    // Limit lines
    const maxLines = 6;
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = lines[maxLines - 1].substring(0, lines[maxLines - 1].length - 3) + '...';
    }
    
    // Calculate box dimensions
    const boxWidth = Math.min(maxWidth, Math.max(...lines.map(l => p.textWidth(l))) + padding * 2);
    const boxHeight = lines.length * lineHeight + padding * 2;
    
    // Position tooltip above the hex
    const tooltipX = pos.x - boxWidth / 2;
    const tooltipY = pos.y - this.taskHexSize - boxHeight - 10;
    
    // Draw tooltip background with rounded corners
    p.fill(30, 30, 40, 240);
    p.stroke(80, 80, 100);
    p.strokeWeight(1);
    p.rect(tooltipX, tooltipY, boxWidth, boxHeight, 6);
    
    // Draw tooltip arrow
    p.fill(30, 30, 40, 240);
    p.noStroke();
    p.triangle(
      pos.x - 8, tooltipY + boxHeight,
      pos.x + 8, tooltipY + boxHeight,
      pos.x, tooltipY + boxHeight + 8
    );
    
    // Draw text
    p.fill(230, 230, 240);
    p.noStroke();
    for (let i = 0; i < lines.length; i++) {
      p.text(lines[i], tooltipX + padding, tooltipY + padding + i * lineHeight);
    }
    
    p.pop();
  }
  
  /**
   * Calculate initial pixel positions for task hexagons in a grid layout
   * Tasks are arranged in a grid pattern around the center "New Task" hex
   */
  calculateInitialTaskPositions(taskCount) {
    const positions = [];
    if (taskCount === 0) return positions;
    
    // Grid spacing - must exceed minHexDistance (taskHexSize * 2.1)
    const spacing = this.taskHexSize * 2.3;  // 115px spacing between hex centers
    const centerOffset = this.taskHexSize * 2.5;  // Keep tasks away from center "New Task" hex
    
    // Calculate grid dimensions - aim for roughly square grid
    const cols = Math.ceil(Math.sqrt(taskCount));
    const rows = Math.ceil(taskCount / cols);
    
    // Calculate total grid size to center it
    const gridWidth = (cols - 1) * spacing;
    const gridHeight = (rows - 1) * spacing;
    const startX = -gridWidth / 2;
    const startY = -gridHeight / 2 + centerOffset;  // Offset down to avoid center hex
    
    let placed = 0;
    for (let row = 0; row < rows && placed < taskCount; row++) {
      for (let col = 0; col < cols && placed < taskCount; col++) {
        const x = startX + col * spacing;
        const y = startY + row * spacing;
        
        // Skip position if too close to center (where "New Task" hex is)
        const distFromCenter = Math.sqrt(x * x + y * y);
        if (distFromCenter < centerOffset) {
          // Push this position further out
          const angle = Math.atan2(y, x);
          positions.push({
            x: Math.cos(angle) * centerOffset,
            y: Math.sin(angle) * centerOffset
          });
        } else {
          positions.push({ x, y });
        }
        placed++;
      }
    }
    
    return positions;
  }
  
  /**
   * Get or initialize physics state for a service's tasks
   */
  getTaskPhysics(serviceKey, taskCount) {
    if (!this.taskPhysics[serviceKey] || this.taskPhysics[serviceKey].length !== taskCount) {
      // Initialize or reinitialize physics positions
      const initialPositions = this.calculateInitialTaskPositions(taskCount);
      this.taskPhysics[serviceKey] = initialPositions.map(pos => ({
        x: pos.x,
        y: pos.y,
        vx: 0,
        vy: 0
      }));
    }
    return this.taskPhysics[serviceKey];
  }
  
  /**
   * Update physics simulation for task positions
   * Uses simple spring/repulsion physics to prevent overlap
   */
  updateTaskPhysics(serviceKey) {
    const physics = this.taskPhysics[serviceKey];
    if (!physics || physics.length === 0) return;
    
    const damping = 0.85; // Velocity damping
    const repulsionStrength = 15; // How strongly hexes push apart (increased for faster convergence)
    const centerRepulsion = 18; // Extra repulsion from center (increased)
    const maxVelocity = 20; // Cap velocity to prevent instability (increased for faster settling)
    
    // Calculate repulsion forces between all hex pairs
    for (let i = 0; i < physics.length; i++) {
      const a = physics[i];
      
      // Repulsion from center (where "New Task" hex is)
      const centerDist = Math.sqrt(a.x * a.x + a.y * a.y);
      if (centerDist < this.centerExclusionRadius && centerDist > 0) {
        const overlap = this.centerExclusionRadius - centerDist;
        const pushX = (a.x / centerDist) * overlap * centerRepulsion * 0.1;
        const pushY = (a.y / centerDist) * overlap * centerRepulsion * 0.1;
        a.vx += pushX;
        a.vy += pushY;
      }
      
      // Repulsion from other hexes
      for (let j = i + 1; j < physics.length; j++) {
        const b = physics[j];
        
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < this.minHexDistance && dist > 0) {
          // Hexes are overlapping, push them apart
          const overlap = this.minHexDistance - dist;
          const pushX = (dx / dist) * overlap * repulsionStrength * 0.1;
          const pushY = (dy / dist) * overlap * repulsionStrength * 0.1;
          
          // Apply equal and opposite forces
          a.vx -= pushX;
          a.vy -= pushY;
          b.vx += pushX;
          b.vy += pushY;
        }
      }
    }
    
    // Apply velocities and damping
    for (const p of physics) {
      // Cap velocity
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxVelocity) {
        p.vx = (p.vx / speed) * maxVelocity;
        p.vy = (p.vy / speed) * maxVelocity;
      }
      
      // Apply velocity
      p.x += p.vx;
      p.y += p.vy;
      
      // Apply damping
      p.vx *= damping;
      p.vy *= damping;
      
      // Stop very small movements
      if (Math.abs(p.vx) < 0.01) p.vx = 0;
      if (Math.abs(p.vy) < 0.01) p.vy = 0;
    }
  }
  
  /**
   * Get current task positions (from physics simulation)
   */
  calculateTaskPositions(taskCount) {
    if (!this.selectedService || taskCount === 0) {
      return [];
    }
    
    const physics = this.getTaskPhysics(this.selectedService, taskCount);
    return physics.map(p => ({ x: p.x, y: p.y }));
  }
  
  /**
   * Draw the "New Task" hexagon
   */
  drawNewTaskHexagon(x, y, isHovered) {
    const p = this.p;
    const size = this.taskHexSize;
    
    let fillColor = NEW_TASK_COLOR;
    let strokeColor = '#4ADE80';
    let glowIntensity = 0;
    
    if (isHovered) {
      glowIntensity = 0.8;
      fillColor = '#4ADE80';
    }
    
    if (glowIntensity > 0) {
      HexUtils.drawHexagonWithGlow(p, x, y, size, fillColor, strokeColor, glowIntensity);
    } else {
      HexUtils.drawHexagon(p, x + 2, y + 2, size, '#00000030', null, 0);
      HexUtils.drawHexagon(p, x, y, size, fillColor, strokeColor, 2);
    }
    
    // Draw plus icon
    p.push();
    p.stroke(255);
    p.strokeWeight(3);
    p.line(x - 12, y, x + 12, y);
    p.line(x, y - 12, x, y + 12);
    p.pop();
    
    // Draw label
    p.push();
    p.fill(255);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(9);
    p.text('New Task', x, y + size * 0.7);
    p.pop();
  }
  
  /**
   * Draw a task hexagon
   */
  drawTaskHexagon(service, task, x, y, isHovered) {
    const p = this.p;
    const size = this.taskHexSize;
    
    // Determine color based on task status
    let fillColor = service.color;
    let strokeColor = service.lightColor;
    let glowIntensity = 0;
    let pulseEffect = 0;
    
    if (task.status === 'completed') {
      fillColor = HexUtils.desaturateColor(service.color, 0.4);
      strokeColor = HexUtils.desaturateColor(service.lightColor, 0.4);
    } else if (task.status === 'failed' || task.status === 'stopped') {
      fillColor = HexUtils.desaturateColor('#EF4444', 0.2);
      strokeColor = '#F87171';
    } else if (task.status === 'running') {
      // Vibrant pulsing effect for running tasks
      pulseEffect = (Math.sin(this.pulsePhase * 1.5) + 1) / 2;  // Faster pulse
      fillColor = HexUtils.lightenColor(service.color, 0.2 + pulseEffect * 0.25);  // Brighter base + stronger pulse
      strokeColor = HexUtils.lightenColor(service.lightColor, 0.3);  // Brighter stroke
      glowIntensity = 0.6 + pulseEffect * 0.4;  // Stronger glow (0.6-1.0 range)
    }
    
    if (isHovered) {
      glowIntensity = Math.max(glowIntensity, 0.7);
      fillColor = service.lightColor;
    }
    
    // Draw glow or shadow
    if (glowIntensity > 0) {
      HexUtils.drawHexagonWithGlow(p, x, y, size, fillColor, strokeColor, glowIntensity);
    } else {
      HexUtils.drawHexagon(p, x + 2, y + 2, size, '#00000030', null, 0);
      HexUtils.drawHexagon(p, x, y, size, fillColor, strokeColor, 2);
    }
    
    // Draw task info
    p.push();
    p.fill(255);
    p.noStroke();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(8);
    
    // Truncate task name
    const maxLen = 12;
    let name = task.name || 'Task';
    if (name.length > maxLen) {
      name = name.substring(0, maxLen - 2) + '..';
    }
    p.text(name, x, y);
    
    // Status indicator
    p.textSize(7);
    p.fill(180);
    p.text(task.status || 'unknown', x, y + 14);
    p.pop();
    
    // Running indicator dot - more vibrant
    if (task.status === 'running') {
      p.push();
      // Outer glow ring
      p.fill(100, 220, 255, 80 + pulseEffect * 40);
      p.noStroke();
      p.circle(x + size * 0.5, y - size * 0.5, 16 + pulseEffect * 6);
      // Inner bright dot
      p.fill(150, 240, 255, 220 + pulseEffect * 35);
      p.circle(x + size * 0.5, y - size * 0.5, 8 + pulseEffect * 4);
      p.pop();
    }
  }
  
  /**
   * Draw subtle background grid
   */
  drawBackgroundGrid() {
    const p = this.p;
    const gridSpacing = 60;
    const gridRange = 2000;
    
    p.push();
    p.stroke(GRID_COLOR);
    p.strokeWeight(1);
    
    // Draw grid lines
    for (let x = -gridRange; x <= gridRange; x += gridSpacing) {
      p.line(x, -gridRange, x, gridRange);
    }
    for (let y = -gridRange; y <= gridRange; y += gridSpacing) {
      p.line(-gridRange, y, gridRange, y);
    }
    p.pop();
  }
  
  /**
   * Draw UI overlay elements
   */
  drawOverlay() {
    const p = this.p;
    
    // Draw view indicator
    p.push();
    p.fill(255, 255, 255, 180);
    p.noStroke();
    p.textAlign(p.LEFT, p.TOP);
    p.textSize(12);
    
    if (this.viewMode === 'service' && this.selectedService) {
      const service = this.services[this.selectedService];
      p.text(`Viewing: ${service.name}`, 20, 20);
      p.textSize(10);
      p.fill(180);
      p.text('Click outside or press ESC to go back', 20, 38);
    }
    p.pop();
  }
  
  /**
   * Update animations
   */
  updateAnimations() {
    // Update pulse phase for running tasks
    this.pulsePhase += 0.08;
    if (this.pulsePhase > Math.PI * 2) {
      this.pulsePhase -= Math.PI * 2;
    }
    
    // Update bob phase for gentle floating effect
    this.bobPhase += 0.02;
    if (this.bobPhase > Math.PI * 2) {
      this.bobPhase -= Math.PI * 2;
    }
    
    this.frameCount++;
    
    // Smooth camera movement
    const lerpFactor = 0.15;
    this.camera.x = HexUtils.lerp(this.camera.x, this.camera.targetX, lerpFactor);
    this.camera.y = HexUtils.lerp(this.camera.y, this.camera.targetY, lerpFactor);
    this.camera.zoom = HexUtils.lerp(this.camera.zoom, this.camera.targetZoom, lerpFactor);
    
    // Update task physics when viewing a service
    if (this.physicsEnabled && this.viewMode === 'service' && this.selectedService) {
      this.updateTaskPhysics(this.selectedService);
    }
  }
  
  /**
   * Calculate bobbing offset for a hex at given index
   * Each hex bobs at a slightly different phase for a wave effect
   */
  getBobOffset(index) {
    const bobAmplitude = 3; // pixels
    const phaseOffset = index * 0.3; // stagger the animation
    return Math.sin(this.bobPhase + phaseOffset) * bobAmplitude;
  }
  
  /**
   * Handle mouse press
   */
  mousePressed(mouseX, mouseY) {
    this.isDragging = true;
    this.dragStart = { x: mouseX, y: mouseY };
    this.dragCameraStart = { x: this.camera.targetX, y: this.camera.targetY };
  }
  
  /**
   * Handle mouse release / click
   */
  mouseReleased(mouseX, mouseY) {
    const wasDragging = this.isDragging;
    const dragDistance = HexUtils.distance(this.dragStart.x, this.dragStart.y, mouseX, mouseY);
    this.isDragging = false;
    
    // If it was a click (not a drag)
    if (dragDistance < 5) {
      this.handleClick(mouseX, mouseY);
    }
  }
  
  /**
   * Handle mouse drag
   */
  mouseDragged(mouseX, mouseY) {
    if (!this.isDragging) return;
    
    const dx = (mouseX - this.dragStart.x) / this.camera.zoom;
    const dy = (mouseY - this.dragStart.y) / this.camera.zoom;
    
    this.camera.targetX = this.dragCameraStart.x - dx;
    this.camera.targetY = this.dragCameraStart.y - dy;
  }
  
  /**
   * Handle mouse move for hover detection
   */
  mouseMoved(mouseX, mouseY) {
    // Convert screen coordinates to world coordinates
    const worldX = (mouseX - this.p.width / 2) / this.camera.zoom + this.camera.x;
    const worldY = (mouseY - this.p.height / 2) / this.camera.zoom + this.camera.y;
    
    this.hoveredService = null;
    this.hoveredTask = null;
    
    if (this.viewMode === 'world') {
      // Check service hexagons (with bobbing offset)
      const serviceKeys = Object.keys(this.services);
      for (let i = 0; i < serviceKeys.length; i++) {
        const key = serviceKeys[i];
        const pos = this.getServiceWorldPosition(key);
        const bobOffset = this.getBobOffset(i);
        if (HexUtils.pointInHex(worldX, worldY, pos.x, pos.y + bobOffset, this.serviceHexSize)) {
          this.hoveredService = key;
          this.p.cursor(this.p.HAND);
          return;
        }
      }
    } else if (this.viewMode === 'service') {
      const service = this.services[this.selectedService];
      if (service) {
        // Check "New Task" hexagon first (with bobbing)
        const centerBobOffset = this.getBobOffset(0);
        if (HexUtils.pointInHex(worldX, worldY, 0, centerBobOffset, this.taskHexSize)) {
          this.hoveredTask = 'new';
          this.p.cursor(this.p.HAND);
          return;
        }
        
        // Check task hexagons (with bobbing)
        const taskPositions = this.calculateTaskPositions(service.tasks.length);
        for (let i = 0; i < service.tasks.length; i++) {
          const pos = taskPositions[i];
          const bobOffset = this.getBobOffset(i + 1);
          if (HexUtils.pointInHex(worldX, worldY, pos.x, pos.y + bobOffset, this.taskHexSize)) {
            this.hoveredTask = service.tasks[i];
            this.p.cursor(this.p.HAND);
            return;
          }
        }
      }
    }
    
    this.p.cursor(this.p.ARROW);
  }
  
  /**
   * Handle click at position
   */
  handleClick(mouseX, mouseY) {
    const worldX = (mouseX - this.p.width / 2) / this.camera.zoom + this.camera.x;
    const worldY = (mouseY - this.p.height / 2) / this.camera.zoom + this.camera.y;
    
    if (this.viewMode === 'world') {
      // Check if clicking on a service (with bobbing offset)
      const serviceKeys = Object.keys(this.services);
      for (let i = 0; i < serviceKeys.length; i++) {
        const key = serviceKeys[i];
        const pos = this.getServiceWorldPosition(key);
        const bobOffset = this.getBobOffset(i);
        if (HexUtils.pointInHex(worldX, worldY, pos.x, pos.y + bobOffset, this.serviceHexSize)) {
          this.zoomToService(key);
          return;
        }
      }
    } else if (this.viewMode === 'service') {
      const service = this.services[this.selectedService];
      if (service) {
        // Check "New Task" hexagon first (with bobbing)
        const centerBobOffset = this.getBobOffset(0);
        if (HexUtils.pointInHex(worldX, worldY, 0, centerBobOffset, this.taskHexSize)) {
          this.onNewTaskClick(this.selectedService);
          return;
        }
        
        // Check task hexagons (with bobbing)
        const taskPositions = this.calculateTaskPositions(service.tasks.length);
        for (let i = 0; i < service.tasks.length; i++) {
          const pos = taskPositions[i];
          const bobOffset = this.getBobOffset(i + 1);
          if (HexUtils.pointInHex(worldX, worldY, pos.x, pos.y + bobOffset, this.taskHexSize)) {
            this.onTaskClick(service.tasks[i]);
            return;
          }
        }
        
        // Clicked outside - go back to world view
        // Check if click is far from center
        if (HexUtils.distance(worldX, worldY, 0, 0) > 300) {
          this.zoomToWorld();
        }
      }
    }
  }
  
  /**
   * Handle mouse wheel for zooming
   * Returns true if the event was handled (to prevent default), false otherwise
   */
  mouseWheel(event) {
    // Don't zoom if a modal is open - let the modal scroll instead
    const agentModal = document.getElementById('agent-modal');
    const newTaskModal = document.getElementById('new-task-modal');
    const settingsModal = document.getElementById('settings-modal');
    
    const isModalOpen = 
      (agentModal && !agentModal.classList.contains('hidden')) ||
      (newTaskModal && !newTaskModal.classList.contains('hidden')) ||
      (settingsModal && !settingsModal.classList.contains('hidden'));
    
    if (isModalOpen) {
      return false; // Let the browser handle scrolling in the modal
    }
    
    const zoomSensitivity = 0.001;
    const minZoom = 0.3;
    const maxZoom = 3.0;
    
    // Calculate zoom delta (negative delta = scroll up = zoom in)
    const zoomDelta = -event.delta * zoomSensitivity;
    
    // Apply zoom to target
    this.camera.targetZoom = Math.max(minZoom, Math.min(maxZoom, this.camera.targetZoom + zoomDelta));
    
    return true; // Event was handled, prevent default
  }
  
  /**
   * Handle key press
   */
  keyPressed(keyCode) {
    // ESC to go back to world view
    if (keyCode === 27 && this.viewMode === 'service') {
      this.zoomToWorld();
    }
  }
  
  /**
   * Zoom into a service
   */
  zoomToService(serviceKey) {
    this.selectedService = serviceKey;
    this.viewMode = 'service';
    
    // Initialize physics for this service's tasks if needed
    const service = this.services[serviceKey];
    if (service && service.tasks.length > 0) {
      this.getTaskPhysics(serviceKey, service.tasks.length);
    }
    
    // Reset camera to center on service tasks
    this.camera.targetX = 0;
    this.camera.targetY = 0;
    this.camera.targetZoom = 1.5;
    
    // Callback for UI updates
    if (this.onServiceSelect) {
      this.onServiceSelect(serviceKey);
    }
  }
  
  /**
   * Zoom back out to world view
   */
  zoomToWorld() {
    this.selectedService = null;
    this.viewMode = 'world';
    
    this.camera.targetX = 0;
    this.camera.targetY = 0;
    this.camera.targetZoom = 1;
    
    if (this.onServiceDeselect) {
      this.onServiceDeselect();
    }
  }
  
  /**
   * Callback when a task is clicked
   */
  onTaskClick(task) {
    // Will be overridden by app.js integration
    console.log('Task clicked:', task);
  }
  
  /**
   * Callback when "New Task" is clicked
   */
  onNewTaskClick(serviceKey) {
    // Will be overridden by app.js integration
    console.log('New task clicked for service:', serviceKey);
  }
  
  /**
   * Callback when a service is selected
   */
  onServiceSelect(serviceKey) {
    // Will be overridden by app.js integration
    console.log('Service selected:', serviceKey);
  }
  
  /**
   * Callback when returning to world view
   */
  onServiceDeselect() {
    // Will be overridden by app.js integration
    console.log('Returned to world view');
  }
  
  /**
   * Handle window resize
   */
  windowResized(width, height) {
    this.p.resizeCanvas(width, height);
  }
}

/**
 * Create and initialize the hex world p5.js sketch
 * @param {HTMLElement} container - Container element for the canvas
 * @returns {HexWorld} The hex world instance
 */
function createHexWorld(container) {
  console.log('createHexWorld called');
  console.log('Container:', container);
  console.log('Container dimensions:', container?.clientWidth, 'x', container?.clientHeight);
  
  if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
    console.error('Container has no dimensions, cannot create canvas');
    return null;
  }
  
  const sketch = (p) => {
    p.setup = function() {
      console.log('p5 setup running...');
      const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
      canvas.parent(container);
      p.textFont('Inter, system-ui, sans-serif');
      
      // Create hex world instance and expose globally
      hexWorld = new HexWorld(p, container);
      window.hexWorld = hexWorld;
      console.log('p5.js setup complete, hex world created and exposed globally');
    };
    
    p.draw = function() {
      if (hexWorld) {
        hexWorld.draw();
      }
    };
    
    p.mousePressed = function() {
      if (hexWorld) {
        hexWorld.mousePressed(p.mouseX, p.mouseY);
      }
    };
    
    p.mouseReleased = function() {
      if (hexWorld) {
        hexWorld.mouseReleased(p.mouseX, p.mouseY);
      }
    };
    
    p.mouseDragged = function() {
      if (hexWorld) {
        hexWorld.mouseDragged(p.mouseX, p.mouseY);
      }
    };
    
    p.mouseMoved = function() {
      if (hexWorld) {
        hexWorld.mouseMoved(p.mouseX, p.mouseY);
      }
    };
    
    p.keyPressed = function() {
      if (hexWorld) {
        hexWorld.keyPressed(p.keyCode);
      }
    };
    
    p.windowResized = function() {
      if (hexWorld) {
        hexWorld.windowResized(container.clientWidth, container.clientHeight);
      }
    };
    
    p.mouseWheel = function(event) {
      if (hexWorld) {
        const handled = hexWorld.mouseWheel(event);
        if (handled) {
          return false; // Prevent page scroll when zooming canvas
        }
      }
      // Let browser handle scroll (e.g., for modals)
      return true;
    };
  };
  
  // Create p5 instance
  new p5(sketch);
  
  return hexWorld;
}

// Export for use in app.js
window.createHexWorld = createHexWorld;
window.HexWorld = HexWorld;
window.SERVICE_CONFIG = SERVICE_CONFIG;
