/**
 * Start the local Hardhat node with a guaranteed V8 heap so long-running
 * seed/deploy/test runs don't crash with "memory allocation failed".
 * Usage: npm run node   (in contracts/)
 */
const { spawn } = require('child_process');
const path = require('path');

const cwd = path.join(__dirname, '..');

let cliEntry = 'node_modules/hardhat/internal/cli/cli.js';
try {
  cliEntry = require.resolve('hardhat/internal/cli/cli.js');
} catch (_) {
  // fall back to the relative path above
}

const child = spawn(process.execPath, ['--max-old-space-size=4096', cliEntry, 'node'], {
  cwd,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});

child.on('error', (err) => {
  console.error('[hardhat-node] failed to start Hardhat node:', err.message);
  process.exit(1);
});