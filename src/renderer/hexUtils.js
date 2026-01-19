/**
 * Hexagon Utilities for RTS Agents Game Interface
 * Pointy-top hexagon math for rendering, hit detection, and coordinate conversion
 */

// Constants for pointy-top hexagon geometry
const HEX_ANGLES = {
  POINTY_TOP: Math.PI / 6 // 30 degrees offset for pointy-top
};

/**
 * Get the corner coordinates for a pointy-top hexagon
 * @param {number} centerX - Center X coordinate
 * @param {number} centerY - Center Y coordinate
 * @param {number} size - Distance from center to corner
 * @param {number} cornerIndex - Corner index (0-5)
 * @returns {{x: number, y: number}} Corner coordinates
 */
function hexCorner(centerX, centerY, size, cornerIndex) {
  const angleDeg = 60 * cornerIndex - 30; // Pointy-top: starts at -30 degrees
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: centerX + size * Math.cos(angleRad),
    y: centerY + size * Math.sin(angleRad)
  };
}

/**
 * Get all corner coordinates for a hexagon
 * @param {number} centerX - Center X coordinate
 * @param {number} centerY - Center Y coordinate
 * @param {number} size - Distance from center to corner
 * @returns {Array<{x: number, y: number}>} Array of 6 corner coordinates
 */
function hexCorners(centerX, centerY, size) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    corners.push(hexCorner(centerX, centerY, size, i));
  }
  return corners;
}

/**
 * Draw a hexagon using p5.js
 * @param {object} p - p5.js instance
 * @param {number} x - Center X coordinate
 * @param {number} y - Center Y coordinate
 * @param {number} size - Distance from center to corner
 * @param {string|object} fillColor - Fill color (can be p5 color or hex string)
 * @param {string|object} strokeColor - Stroke color
 * @param {number} strokeWeight - Stroke weight (default 2)
 */
function drawHexagon(p, x, y, size, fillColor, strokeColor, strokeWeight = 2) {
  const corners = hexCorners(x, y, size);
  
  p.push();
  if (fillColor) {
    p.fill(fillColor);
  } else {
    p.noFill();
  }
  
  if (strokeColor) {
    p.stroke(strokeColor);
    p.strokeWeight(strokeWeight);
  } else {
    p.noStroke();
  }
  
  p.beginShape();
  for (const corner of corners) {
    p.vertex(corner.x, corner.y);
  }
  p.endShape(p.CLOSE);
  p.pop();
}

/**
 * Draw a hexagon with a glow effect
 * @param {object} p - p5.js instance
 * @param {number} x - Center X coordinate
 * @param {number} y - Center Y coordinate
 * @param {number} size - Distance from center to corner
 * @param {string|object} fillColor - Fill color
 * @param {string|object} glowColor - Glow color
 * @param {number} glowIntensity - Glow intensity (0-1)
 */
function drawHexagonWithGlow(p, x, y, size, fillColor, glowColor, glowIntensity = 0.5) {
  // Draw glow layers
  for (let i = 3; i >= 0; i--) {
    const glowSize = size + (i * 4);
    const alpha = Math.floor(50 * glowIntensity * (1 - i / 4));
    const glow = p.color(glowColor);
    glow.setAlpha(alpha);
    drawHexagon(p, x, y, glowSize, null, glow, 6 - i);
  }
  
  // Draw main hexagon
  drawHexagon(p, x, y, size, fillColor, glowColor, 2);
}

/**
 * Check if a point is inside a hexagon using ray casting
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {number} hx - Hexagon center X
 * @param {number} hy - Hexagon center Y
 * @param {number} size - Hexagon size
 * @returns {boolean} True if point is inside hexagon
 */
function pointInHex(px, py, hx, hy, size) {
  const corners = hexCorners(hx, hy, size);
  let inside = false;
  
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const xi = corners[i].x, yi = corners[i].y;
    const xj = corners[j].x, yj = corners[j].y;
    
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Convert axial hex coordinates to pixel coordinates (pointy-top)
 * @param {number} q - Axial Q coordinate
 * @param {number} r - Axial R coordinate
 * @param {number} size - Hexagon size
 * @returns {{x: number, y: number}} Pixel coordinates
 */
function hexToPixel(q, r, size) {
  const x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
  const y = size * (3 / 2 * r);
  return { x, y };
}

/**
 * Convert pixel coordinates to axial hex coordinates (pointy-top)
 * @param {number} x - Pixel X coordinate
 * @param {number} y - Pixel Y coordinate
 * @param {number} size - Hexagon size
 * @returns {{q: number, r: number}} Axial coordinates (rounded)
 */
function pixelToHex(x, y, size) {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;
  return hexRound(q, r);
}

/**
 * Round fractional hex coordinates to nearest hex
 * @param {number} q - Fractional Q coordinate
 * @param {number} r - Fractional R coordinate
 * @returns {{q: number, r: number}} Rounded axial coordinates
 */
function hexRound(q, r) {
  const s = -q - r;
  
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  
  return { q: rq, r: rr };
}

/**
 * Get neighboring hex coordinates in a spiral pattern from center
 * Used for arranging task hexagons around a central "new task" hex
 * @param {number} ring - Ring number (0 = center, 1 = first ring, etc.)
 * @returns {Array<{q: number, r: number}>} Array of axial coordinates
 */
function hexSpiral(ring) {
  if (ring === 0) return [{ q: 0, r: 0 }];
  
  const results = [];
  const directions = [
    { q: 1, r: 0 },   // East
    { q: 0, r: 1 },   // Southeast
    { q: -1, r: 1 },  // Southwest
    { q: -1, r: 0 },  // West
    { q: 0, r: -1 },  // Northwest
    { q: 1, r: -1 }   // Northeast
  ];
  
  // Start at the "northeast" corner of this ring
  let hex = { q: ring, r: -ring };
  
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < ring; j++) {
      results.push({ ...hex });
      hex.q += directions[(i + 2) % 6].q;
      hex.r += directions[(i + 2) % 6].r;
    }
  }
  
  return results;
}

/**
 * Get positions for all hexagons in a given radius (including center)
 * @param {number} radius - Number of rings around center
 * @returns {Array<{q: number, r: number}>} Array of all hex positions
 */
function hexGrid(radius) {
  const positions = [];
  for (let ring = 0; ring <= radius; ring++) {
    positions.push(...hexSpiral(ring));
  }
  return positions;
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Ease-out cubic function for smooth animations
 * @param {number} t - Input (0-1)
 * @returns {number} Eased output
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Ease-in-out cubic function for smooth animations
 * @param {number} t - Input (0-1)
 * @returns {number} Eased output
 */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Calculate distance between two points
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} Distance
 */
function distance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Darken a hex color
 * @param {string} hex - Hex color string (e.g., "#8B5CF6")
 * @param {number} amount - Amount to darken (0-1)
 * @returns {string} Darkened hex color
 */
function darkenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * amount));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

/**
 * Lighten a hex color
 * @param {string} hex - Hex color string (e.g., "#8B5CF6")
 * @param {number} amount - Amount to lighten (0-1)
 * @returns {string} Lightened hex color
 */
function lightenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * amount));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

/**
 * Desaturate a hex color (make it greyer)
 * @param {string} hex - Hex color string
 * @param {number} amount - Amount to desaturate (0-1)
 * @returns {string} Desaturated hex color
 */
function desaturateColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16);
  const g = ((num >> 8) & 0x00FF);
  const b = (num & 0x0000FF);
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  
  const newR = Math.round(r + (gray - r) * amount);
  const newG = Math.round(g + (gray - g) * amount);
  const newB = Math.round(b + (gray - b) * amount);
  
  return `#${(newR << 16 | newG << 8 | newB).toString(16).padStart(6, '0')}`;
}

// Export all utilities
window.HexUtils = {
  hexCorner,
  hexCorners,
  drawHexagon,
  drawHexagonWithGlow,
  pointInHex,
  hexToPixel,
  pixelToHex,
  hexRound,
  hexSpiral,
  hexGrid,
  lerp,
  easeOutCubic,
  easeInOutCubic,
  distance,
  darkenColor,
  lightenColor,
  desaturateColor
};
