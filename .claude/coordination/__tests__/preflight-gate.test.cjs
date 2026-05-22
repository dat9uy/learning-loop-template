#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'write-coordination-gate.cjs');

function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-gate-test-'));
  fs.mkdirSync(path.join(tmpDir, 'records', 'observations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'coordination'), { recursive: true });
  return tmpDir;
}

function setPreflightMarker(tmpDir, surface, completedAt) {
  const markerPath = path.join(tmpDir, '.claude', 'coordination', `.loop-preflight-${surface}`);
  fs.writeFileSync(markerPath, JSON.stringify({ surface, completed_at: completedAt }));
}

function runHook(input, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [HOOK_PATH], {
      env: { ...process.env, ...envOverrides },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode === null ? 1 : exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

function parseOutput(stdout) {
  try { return JSON.parse(stdout); } catch { return null; }
}

async function withTempProject(fn) {
  const tmpDir = createTempProject();
  try { return await fn(tmpDir); }
  finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
}

describe('preflight gate for product/**', () => {
  describe('allowed writes (exit 0)', () => {
    it('Edit product/api/src/main.py with valid preflight marker -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        setPreflightMarker(tmpDir, 'product', new Date().toISOString());
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/src/main.py' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Edit product/web/routes.ts with valid preflight marker -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        setPreflightMarker(tmpDir, 'product', new Date().toISOString());
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/web/routes.ts' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Edit product/api/src/main.py with fresh marker (within TTL) -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        // 29 minutes ago — still within TTL
        setPreflightMarker(tmpDir, 'product', new Date(Date.now() - 29 * 60 * 1000).toISOString());
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/src/main.py' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Write product/readme.md with valid preflight marker -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        setPreflightMarker(tmpDir, 'product', new Date().toISOString());
        const r = await runHook(
          { tool_name: 'Write', tool_input: { file_path: 'product/readme.md', content: '# Readme' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Write product/unknown/stack.py with valid preflight marker -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        setPreflightMarker(tmpDir, 'product', new Date().toISOString());
        const r = await runHook(
          { tool_name: 'Write', tool_input: { file_path: 'product/unknown/stack.py', content: 'print(1)' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });
  });

  describe('blocked writes (exit 2 with preflight_checklist)', () => {
    it('Edit product/api/src/main.py without preflight marker -> exit 2', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/src/main.py' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout) || parseOutput(r.stderr);
        assert.ok(out, 'should emit JSON block');
        assert.strictEqual(out.decision, 'block');
      });
    });

    it('Edit product/web/routes.ts without preflight marker -> exit 2', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/web/routes.ts' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout) || parseOutput(r.stderr);
        assert.ok(out);
        assert.strictEqual(out.decision, 'block');
      });
    });

    it('Block JSON contains preflight_checklist array with 6 steps', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/src/main.py' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout) || parseOutput(r.stderr);
        assert.ok(Array.isArray(out.preflight_checklist), 'should have preflight_checklist array');
        assert.strictEqual(out.preflight_checklist.length, 6, 'checklist should have 6 steps');
        assert.ok(out.preflight_checklist[0].includes('1.'), 'first step should be numbered 1');
        assert.ok(out.preflight_checklist[5].includes('6.'), 'last step should be numbered 6');
      });
    });

    it('Block JSON contains surface field matching inferred surface', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/src/main.py' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout) || parseOutput(r.stderr);
        assert.strictEqual(out.surface, 'product', 'surface should be product for all product/** paths');
      });
    });

    it('Edit product/api/src/main.py with expired marker (31+ min) -> exit 2', async () => {
      await withTempProject(async (tmpDir) => {
        setPreflightMarker(tmpDir, 'product', new Date(Date.now() - 31 * 60 * 1000).toISOString());
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/src/main.py' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout) || parseOutput(r.stderr);
        assert.ok(out);
        assert.strictEqual(out.decision, 'block');
      });
    });

    it('Block reason mentions preflight, not decision records', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/src/main.py' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout) || parseOutput(r.stderr);
        assert.ok(out.reason.toLowerCase().includes('preflight'), 'reason should mention preflight');
        assert.ok(!out.reason.toLowerCase().includes('decision record'), 'reason should NOT mention decision records');
      });
    });

    it('Preflight block always exits 2 — no GATE_RESPONSE_MODE check in code path', async () => {
      await withTempProject(async (tmpDir) => {
        // Even with GATE_RESPONSE_MODE=warn, preflight blocks should always exit 2
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/src/main.py' } },
          { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'warn' }
        );
        assert.strictEqual(r.exitCode, 2);
      });
    });
  });

  describe('marker file write protection', () => {
    it('Edit .claude/coordination/.loop-preflight-product -> exit 2 (blocked)', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: '.claude/coordination/.loop-preflight-product' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout) || parseOutput(r.stderr);
        assert.ok(out);
        assert.strictEqual(out.decision, 'block');
      });
    });

    it('Write .claude/coordination/.loop-preflight-product -> exit 2 (blocked)', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Write', tool_input: { file_path: '.claude/coordination/.loop-preflight-product', content: 'test' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout) || parseOutput(r.stderr);
        assert.ok(out);
        assert.strictEqual(out.decision, 'block');
      });
    });
  });
});
