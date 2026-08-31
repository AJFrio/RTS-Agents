/**
 * Node-native verify runner: executes every tests/unit/*.verify.mjs in series.
 *
 * The renderer logic modules are ESM while jest runs with `transform: {}`
 * (CommonJS only), so ESM contracts are verified by standalone *.verify.mjs
 * scripts (precedent: tests/unit/web-platform.verify.mjs). This runner chains
 * them for `npm run test:ci`: it dynamically imports each file in series,
 * stops on the first failure with a non-zero exit code, and prints a
 * per-file pass/fail summary. Each verify file also runs standalone and
 * self-reports per-test PASS/FAIL lines on import.
 *
 * Usage: node tests/unit/run-verify.mjs
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const SELF = 'run-verify.mjs';

const files = readdirSync(here)
  .filter((name) => name.endsWith('.verify.mjs') && name !== SELF)
  .sort();

if (files.length === 0) {
  console.error('[run-verify] no *.verify.mjs files found in tests/unit');
  process.exit(1);
}

const results = [];
for (const name of files) {
  try {
    await import(join(here, name));
    results.push({ name, ok: true });
    console.log(`[run-verify] PASS ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.error(`[run-verify] FAIL ${name}`);
    console.error(err && err.stack ? err.stack : err);
    break; // stop on first failure
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n[run-verify] ${passed}/${files.length} verify files passed`);
if (passed !== files.length) process.exit(1);
