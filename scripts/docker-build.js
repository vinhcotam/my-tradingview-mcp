#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);
const imageName = process.argv[2] || process.env.DOCKER_IMAGE_NAME || 'tradingview-mcp:latest';
const dockerfile = resolve(repoRoot, 'Dockerfile');

const result = spawnSync('docker', ['build', '-f', dockerfile, '-t', imageName, repoRoot], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
