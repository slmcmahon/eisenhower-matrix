#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const appRoot = path.resolve(__dirname, '..');

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: eisenhower-matrix [electron-args]');
  console.log('Launches the Eisenhower Matrix desktop app.');
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = require(path.join(appRoot, 'package.json'));
  console.log(pkg.version);
  process.exit(0);
}

const electronBinary = require('electron');

if (typeof electronBinary !== 'string' || electronBinary.length === 0) {
  console.error('Unable to locate the Electron executable.');
  process.exit(1);
}

const child = spawn(electronBinary, [appRoot, ...args], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
