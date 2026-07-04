#!/usr/bin/env node
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4310;
const BASE = `http://127.0.0.1:${PORT}`;

function waitForUrl(path, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      const req = http.request(`${BASE}${path}`, { method: 'GET', timeout: 2000 }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('timeout'));
        else setTimeout(poll, 200);
      });
      req.end();
    })();
  });
}

(async () => {
  const projectRoot = path.join(__dirname, '..');
  const distEntry = path.join(projectRoot, 'dist', 'index.mjs');
  if (!fs.existsSync(distEntry)) {
    console.log('No dist build found; attempting build...');
    const build = spawn('node', ['./build.mjs'], { cwd: projectRoot, stdio: 'inherit', env: { ...process.env } });
    await new Promise((res, rej) => build.on('close', (c) => c === 0 ? res() : rej(new Error('build failed'))));
  } else {
    console.log('Using existing dist build.');
  }

  console.log('Starting server...');
  const server = spawn('node', ['--enable-source-maps', './dist/index.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT,
      NODE_ENV: process.env.NODE_ENV || 'production',
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'smoke-test-key',
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (d) => process.stdout.write('[server] ' + d.toString()));
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d.toString()));

  try {
    const health = await waitForUrl('/api/healthz', 15000);
    console.log('Health response:', health.statusCode, health.body);
    const parsed = JSON.parse(health.body || '{}');
    if (parsed.status === 'ok') {
      console.log('Smoke test passed: /api/healthz ok');
      process.exitCode = 0;
    } else {
      console.error('Unexpected health response');
      process.exitCode = 2;
    }
  } catch (e) {
    console.error('Smoke test failed:', e.message);
    process.exitCode = 3;
  } finally {
    server.kill('SIGTERM');
  }
})();
