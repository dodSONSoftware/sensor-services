#!/usr/bin/env node

/**
 * BLT driver script.
 * Runs: analyze → build → lint → test → commit → verify
 * All commands execute from the code/ directory.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const CODE_DIR = resolve(PROJECT_ROOT, 'code');

// ── Helpers ──────────────────────────────────────────────

function run(cmd, cwd = CODE_DIR, allowFail = false) {
  try {
    const result = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: 'inherit',
    });
    return result;
  } catch (err) {
    if (!allowFail) throw err;
    return null;
  }
}

function silentRun(cmd, cwd = CODE_DIR) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8' });
  } catch {
    return '';
  }
}

// ── Step 1: Analyze git changes ─────────────────────────

console.log('\n=== STEP 1: Analyzing git changes ===\n');

const status = silentRun('git status --short', CODE_DIR);
const diffStat = silentRun('git diff --stat HEAD', CODE_DIR) || '';
const recentLog = silentRun('git log --oneline -5', CODE_DIR) || '';

// Collect changed files with descriptions from the diff
let addedFiles = [];
let deletedFiles = [];
let modifiedFiles = [];

if (status) {
  for (const line of status.trim().split('\n')) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    const path = parts.slice(parts[0].length === 2 ? 1 : 0).join(' ');
    const stage = parts[0]; // e.g. "M", "A", "D", "AD", etc.

    if (stage.includes('D') && !stage.includes('A')) {
      deletedFiles.push(path);
    } else if (stage.includes('A') || (!stage.includes('D') && stage !== '??' && path)) {
      // New or modified file
      const isModified = stage[0] === 'M' || (stage.length > 1 && stage[1] === 'M');
      if (isModified) {
        modifiedFiles.push(path);
      } else {
        addedFiles.push(path);
      }
    }
  }
}

// Get diff descriptions for each file
const allChanged = [...addedFiles, ...modifiedFiles, ...deletedFiles];
let commitBodyBullets = [];

for (const f of allChanged) {
  const relPath = f.replace(CODE_DIR + '/', '');
  let desc = '';
  try {
    // Try to get a summary from git log for this file
    const fileLog = silentRun(`git log --oneline -1 -- "${f}"`, CODE_DIR);
    if (fileLog) {
      desc = fileLog.trim().split('\t')[0] || 'no description';
    } else {
      // New file: infer from content
      const content = silentRun(`head -20 "${f}"`, CODE_DIR);
      const firstLineComment = content?.match(/^(\/\/|#|\/\*|\*)\s*(.+)$/m)?.[2];
      desc = firstLineComment || 'new file';
    }
  } catch {
    desc = 'new or deleted file';
  }

  const icon = deletedFiles.includes(f) ? '~' : addedFiles.includes(f) ? '+' : 'M';
  commitBodyBullets.push(`- [${icon}] ${relPath}: ${desc}`);
}

const filesChangedCount = allChanged.length;

console.log(`Found ${filesChangedCount} changed file(s):\n`);
commitBodyBullets.forEach(b => console.log(b));
console.log();

// ── Step 2: Build ───────────────────────────────────────

console.log('\n=== STEP 2: Building ===\n');
run('npm run build', CODE_DIR);
console.log('Build passed.');

// ── Step 3: Lint ────────────────────────────────────────

console.log('\n=== STEP 3: Linting ===\n');
try {
  run('npm run lint', CODE_DIR);
  console.log('Lint passed.');
} catch {
  console.log('Lint errors found. Attempting auto-fix...');
  try {
    run('npm run lint:fix', CODE_DIR, true);
    // Re-run to verify
    run('npm run lint', CODE_DIR);
    console.log('Lint fixed and verified.');
  } catch (err) {
    throw new Error('Lint errors could not be auto-fixed. Aborting commit.\n' + err.message);
  }
}

// ── Step 4: Test ────────────────────────────────────────

console.log('\n=== STEP 4: Testing ===\n');
run('npm test', CODE_DIR);
console.log('Tests passed.');

// ── Summary ─────────────────────────────────────────────

console.log('\n=== SUMMARY ===\n');
console.log('Files changed:');
if (addedFiles.length) console.log(`  Added (${addedFiles.length}):`, addedFiles.join(', '));
if (deletedFiles.length) console.log(`  Deleted (${deletedFiles.length}):`, deletedFiles.join(', '));
if (modifiedFiles.length) console.log(`  Modified (${modifiedFiles.length}):`, modifiedFiles.join(', '));

console.log('\nNotable changes:');
allChanged.forEach(f => {
  const relPath = f.replace(CODE_DIR + '/', '');
  let desc = '';
  try {
    const fileLog = silentRun(`git log --oneline -1 -- "${f}"`, CODE_DIR);
    desc = fileLog?.trim()?.split('\t')?.[0] || 'new or modified';
  } catch {
    desc = 'new or deleted';
  }
  console.log(`  - ${relPath}: ${desc}`);
});

console.log();
