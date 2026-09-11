#!/usr/bin/env node
/**
 * Lightweight structural checks for agent-first boundaries.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src/renderer');
const MAIN_SERVICES = path.join(ROOT, 'src/main/services');

function fail(msg) {
  console.error(`[validate-architecture] ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[validate-architecture] ${msg}`);
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name !== 'node_modules' && name !== 'dist') walk(full, acc);
    } else if (/\.(jsx?|tsx?)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

let errors = 0;

// Renderer must not require() electron main modules
const forbiddenInRenderer = [
  /require\s*\(\s*['"]electron['"]\s*\)/,
  /require\s*\(\s*['"][^'"]*\/main\/services/,
  /from\s+['"][^'"]*\/main\/services/,
];

for (const file of walk(RENDERER)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const re of forbiddenInRenderer) {
    if (re.test(content)) {
      fail(`${path.relative(ROOT, file)}: renderer must not import main/electron directly`);
      errors++;
      break;
    }
  }
}

// Services directory should exist with core modules
const expectedServices = ['config-store.js', 'agent-orchestrator.js', 'github-service.js'];

for (const svc of expectedServices) {
  const p = path.join(MAIN_SERVICES, svc);
  if (!fs.existsSync(p)) {
    fail(`Missing expected service: src/main/services/${svc}`);
    errors++;
  }
}

// preload should use contextBridge
const preloadPath = path.join(ROOT, 'preload.js');
if (fs.existsSync(preloadPath)) {
  const preload = fs.readFileSync(preloadPath, 'utf8');
  if (!preload.includes('contextBridge')) {
    fail('preload.js should expose APIs via contextBridge');
    errors++;
  } else {
    ok('preload.js uses contextBridge');
  }
}

if (errors === 0 && process.exitCode !== 1) {
  ok('Architecture checks OK');
  process.exit(0);
} else {
  process.exit(1);
}
