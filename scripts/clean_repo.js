#!/usr/bin/env node
/**
 * Secure Evidence DMS repository cleanup / hygiene gate.
 *
 * Responsibilities:
 *   1. Remove obsolete duplicate source files.
 *   2. Validate placeholder `.gitkeep` markers exist in upload + seed dirs.
 *   3. Scan git-staged files for hardcoded secrets / plain .env, fail if found.
 *   4. (Best-effort) run Prettier + ESLint over the JS/TS source and report.
 *
 * Usage:
 *   node scripts/clean_repo.js        # full dry run + guards
 *   node scripts/clean_repo.js --fix  # delete obsolete files + run formatters
 *   node scripts/clean_repo.js --prune  # remove regenerable build/Python caches + junk
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 1. Obsolete duplicate files that must never reappear.
// ---------------------------------------------------------------------------
const OBSOLETE = [
  path.join(ROOT, 'client', 'js', 'complain.js'),
  path.join(ROOT, 'client', 'js', 'complain s.js'),
  path.join(ROOT, 'client', 'js', 'complains.js'),
  path.join(ROOT, 'client', 'pages', 'report_2.html'),
];

// ---------------------------------------------------------------------------
// 1b. Regenerable build caches + safe garbage patterns to prune.
// These are safe to remove: they are produced by the build/lint/Python toolchain
// and never contain source, config, .env, DB seeds, migrations, or the active
// AES-encrypted `.bin` artifacts under server/data/encrypted.
// ---------------------------------------------------------------------------
const PRUNE_PATHS = [
  // Hardhat / Solidity build caches (regenerate via `npx hardhat compile`)
  path.join(ROOT, 'contracts', 'artifacts'),
  path.join(ROOT, 'contracts', 'cache'),
  path.join(ROOT, 'contracts', 'typechain-types'),
  // Python bytecode + test caches in the ai-engine
  path.join(ROOT, 'ai-engine', '__pycache__'),
  path.join(ROOT, 'ai-engine', 'app', '__pycache__'),
  path.join(ROOT, 'ai-engine', 'app', 'api', '__pycache__'),
  path.join(ROOT, 'ai-engine', 'app', 'api', 'routers', '__pycache__'),
  path.join(ROOT, 'ai-engine', 'app', 'core', '__pycache__'),
  path.join(ROOT, 'ai-engine', 'app', 'services', '__pycache__'),
  path.join(ROOT, 'ai-engine', '.pytest_cache'),
];

// Loose junk matched by name anywhere except within the protected paths.
const PRUNE_GLOB_RULES = [
  /\.DS_Store$/, /^Thumbs\.db$/, /^desktop\.ini$/,
  /^npm-debug\.log/, /^yarn-(debug|error)\.log/, /^combined\.log$/, /^error\.log$/,
  /\.tmp$/, /\.bak$/, /\.old$/, /\.orig$/,
  /^temp_/, /^test_payload/, /^dms-smoke-/,
  /^__pycache__$/, /\.pyc$/, /\.pyo$/, /^\.pytest_cache$/,
];

// Directories that must NEVER be traversed/pruned.
const PRUNE_GUARDS = [
  path.join(ROOT, 'node_modules'),
  path.join(ROOT, 'server'),
  path.join(ROOT, 'database'),
  path.join(ROOT, 'contracts', 'node_modules'),
  path.join(ROOT, '.git'),
];

// ---------------------------------------------------------------------------
// 2. Directories that must retain a .gitkeep so they survive in git.
// ---------------------------------------------------------------------------
const GITKEEP_DIRS = [
  path.join(ROOT, 'server', 'uploads'),
  path.join(ROOT, 'database', 'seeds'),
];

// ---------------------------------------------------------------------------
// 3. Secret-ish patterns scanned over git-staged text files.
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  /(relayer|private|secret|aes)[_-]?key\s*[:=]\s*[0-9a-fA-F]{32,}/,
  /sk-[A-Za-z0-9]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  /postgres(ql)?:\/\/[^:/\s]+:[^@\s]+@/,
];

const APPLY_FIXES = process.argv.includes('--fix');
const PRUNE = process.argv.includes('--prune') || APPLY_FIXES;

let errorCount = 0;
const log = (msg) => process.stdout.write(`[clean_repo] ${msg}\n`);
const fail = (msg) => {
  log(`ERROR: ${msg}`);
  errorCount += 1;
};

function removeIfPresent(file) {
  if (!fs.existsSync(file)) return false;
  if (APPLY_FIXES) {
    fs.rmSync(file, { force: true });
    log(`Removed obsolete file: ${path.relative(ROOT, file)}`);
  } else {
    log(`Obsolete file present (run with --fix to remove): ${path.relative(ROOT, file)}`);
  }
  return true;
}

function ensureGitkeep(dir) {
  if (!fs.existsSync(dir)) {
    fail(`Missing directory for .gitkeep: ${path.relative(ROOT, dir)}`);
    return;
  }
  const gk = path.join(dir, '.gitkeep');
  if (!fs.existsSync(gk)) {
    if (APPLY_FIXES) {
      fs.writeFileSync(gk, '');
      log(`Created ${path.relative(ROOT, gk)}`);
    } else {
      log(`Missing .gitkeep (run with --fix to create): ${path.relative(ROOT, gk)}`);
    }
  }
}

// Returns true when a path is inside (or equal to) one of the protected dirs.
function isProtected(abs) {
  return PRUNE_GUARDS.some((g) => abs === g || abs.startsWith(g + path.sep));
}

function pruneCaches() {
  let removed = 0;

  // 1. Deterministic regenerable build/cache directories.
  for (const p of PRUNE_PATHS) {
    if (!fs.existsSync(p)) continue;
    if (isProtected(p)) {
      fail(`Refusing to prune protected path: ${path.relative(ROOT, p)}`);
      continue;
    }
    if (PRUNE) {
      fs.rmSync(p, { recursive: true, force: true });
      log(`Removed build cache: ${path.relative(ROOT, p)}`);
      removed += 1;
    } else {
      log(`Build cache present (run --fix/--prune to remove): ${path.relative(ROOT, p)}`);
    }
  }

  // 2. Loose junk (OS artifacts, logs, temp, pyc) — walk source dirs only.
  const roots = ['ai-engine', 'client', 'contracts', 'database', 'docs', 'scripts', 'server'];
  for (const rel of roots) {
    const root = path.join(ROOT, rel);
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (isProtected(full)) continue;
        const relPath = path.relative(ROOT, full).split(path.sep).join('/');
        if (ent.isDirectory()) {
          // Don't descend into generated/vendor dirs.
          if (['node_modules', 'artifacts', 'cache', 'dist', 'build', 'coverage'].includes(ent.name)) continue;
          stack.push(full);
          continue;
        }
        const hit = PRUNE_GLOB_RULES.some((re) => re.test(ent.name));
        if (!hit) continue;
        if (PRUNE) {
          fs.rmSync(full, { force: true });
          log(`Removed junk: ${relPath}`);
          removed += 1;
        } else {
          log(`Junk present (run --fix/--prune to remove): ${relPath}`);
        }
      }
    }
  }

  log(`Prune pass complete. ${removed} artifact(s) removed.`);
}

function stagedFiles() {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function scanForSecrets() {
  const files = stagedFiles();
  if (files.length === 0) {
    log('No staged files to scan (nothing staged yet).');
    return;
  }

  const risky = files.filter((f) => /\.env$|\.env\./i.test(f) && !/\.example$/i.test(f));
  for (const f of risky) {
    fail(`Staged plain .env file is not allowed: ${f}`);
  }

  const textFiles = files.filter((f) => /\.(js|ts|py|json|yml|yaml|sql|env|sh|md)$/i.test(f));
  for (const f of textFiles) {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, 'utf8');
    // Skip the sanitized .env.example templates themselves.
    if (/\.example$/i.test(f)) continue;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        fail(`Possible secret in staged file ${f} (pattern ${pattern})`);
        break;
      }
    }
  }
  log(`Scanned ${textFiles.length} staged text file(s) for secrets.`);
}

function runFormatter(cmdLabel, args) {
  try {
    execFileSync('npx', args, { cwd: ROOT, stdio: 'inherit' });
    log(`${cmdLabel}: OK`);
  } catch {
    log(`${cmdLabel}: npx unavailable or reported issues (non-fatal in offline sandbox).`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
log(`Secure Evidence DMS repo cleanup (fix=${APPLY_FIXES})`);

for (const file of OBSOLETE) {
  if (removeIfPresent(file) && !APPLY_FIXES) {
    // For guard purposes, presence of an obsolete file is not fatal unless we
    // are expected to enforce removal; report but continue.
    fail(`Obsolete file must be removed: ${file}`);
  }
}

for (const dir of GITKEEP_DIRS) {
  ensureGitkeep(dir);
}

pruneCaches();

scanForSecrets();

if (APPLY_FIXES) {
  runFormatter('Prettier', [
    'prettier',
    '--write',
    '--config',
    path.join(ROOT, '.prettierrc'),
    'server/src/**/*.js',
    'server/tests/**/*.js',
    'scripts/**/*.js',
    'client/js/**/*.js',
  ]);
  runFormatter('ESLint', ['eslint', 'src/', '--config', path.join(ROOT, '.eslintrc.json')]);
}

if (errorCount > 0) {
  log(`FAILED with ${errorCount} issue(s).`);
  process.exitCode = 1;
} else {
  log('Clean repo gate: PASSED.');
}
