#!/usr/bin/env node
/**
 * Validates docs/ knowledge-base structure for harness engineering.
 * Exit 0 on success, 1 on failure.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const REQUIRED_FILES = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/DESIGN.md',
  'docs/FRONTEND.md',
  'docs/PLANS.md',
  'docs/PRODUCT_SENSE.md',
  'docs/QUALITY_SCORE.md',
  'docs/RELIABILITY.md',
  'docs/SECURITY.md',
  'docs/design-docs/index.md',
  'docs/design-docs/core-beliefs.md',
  'docs/exec-plans/tech-debt-tracker.md',
  'docs/product-specs/index.md',
  'docs/references/README.md',
  'docs/generated/README.md',
];

const REQUIRED_DIRS = [
  'docs/design-docs',
  'docs/exec-plans/active',
  'docs/exec-plans/completed',
  'docs/product-specs',
  'docs/references',
  'docs/generated',
];

const AGENTS_MAX_LINES = 120;
const AGENTS_REQUIRED_LINKS = [
  'ARCHITECTURE.md',
  'docs/PLANS.md',
  'docs/design-docs/core-beliefs.md',
  'docs/product-specs/index.md',
];

function fail(msg) {
  console.error(`[validate-docs] ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[validate-docs] ${msg}`);
}

let errors = 0;

for (const rel of REQUIRED_FILES) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    fail(`Missing required file: ${rel}`);
    errors++;
  }
}

for (const rel of REQUIRED_DIRS) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    fail(`Missing required directory: ${rel}`);
    errors++;
  }
}

const agentsPath = path.join(ROOT, 'AGENTS.md');
if (fs.existsSync(agentsPath)) {
  const agents = fs.readFileSync(agentsPath, 'utf8');
  const lines = agents.split(/\r?\n/).length;
  if (lines > AGENTS_MAX_LINES) {
    fail(`AGENTS.md is ${lines} lines (max ${AGENTS_MAX_LINES}). Move detail to docs/.`);
    errors++;
  } else {
    ok(`AGENTS.md length OK (${lines} lines)`);
  }
  for (const link of AGENTS_REQUIRED_LINKS) {
    if (!agents.includes(link)) {
      fail(`AGENTS.md must link to ${link}`);
      errors++;
    }
  }
}

// Cross-link: design-docs index should reference core-beliefs
const designIndex = path.join(ROOT, 'docs/design-docs/index.md');
if (fs.existsSync(designIndex)) {
  const text = fs.readFileSync(designIndex, 'utf8');
  if (!text.includes('core-beliefs.md')) {
    fail('docs/design-docs/index.md must reference core-beliefs.md');
    errors++;
  }
}

// Product specs index should list at least one spec file
const specsDir = path.join(ROOT, 'docs/product-specs');
if (fs.existsSync(specsDir)) {
  const specs = fs.readdirSync(specsDir).filter((f) => f.endsWith('.md') && f !== 'index.md');
  if (specs.length < 1) {
    fail('docs/product-specs/ needs at least one spec besides index.md');
    errors++;
  } else {
    ok(`Found ${specs.length} product spec(s)`);
  }
}

if (errors === 0 && process.exitCode !== 1) {
  ok('Documentation structure OK');
  process.exit(0);
} else {
  process.exit(1);
}
