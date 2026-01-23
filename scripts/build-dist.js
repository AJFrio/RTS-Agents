/**
 * Build script to create dist folder for Tauri
 * Copies necessary files to dist/ directory
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Files and directories to copy to dist
const ITEMS_TO_COPY = [
  'index.html',
  'styles',
  'src/renderer',
  'assets',
];

// Clean and create dist directory
function cleanDist() {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Copy file or directory
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Warning: ${src} does not exist, skipping`);
    return;
  }

  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    // Ensure parent directory exists
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

// Main build function
function build() {
  console.log('Building dist folder for Tauri...');

  cleanDist();

  for (const item of ITEMS_TO_COPY) {
    const src = path.join(ROOT_DIR, item);
    const dest = path.join(DIST_DIR, item);
    console.log(`Copying: ${item}`);
    copyRecursive(src, dest);
  }

  // Note: Tauri APIs are injected at runtime by Tauri itself
  // No need to copy node_modules

  console.log('Build complete!');
}

build();
