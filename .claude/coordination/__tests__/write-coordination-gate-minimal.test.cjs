#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'write-coordination-gate.cjs');

function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-gate-minimal-'));
  fs.mkdirSync(path.join(tmpDir, 'records', 'observations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'coordination'), { recursive: true });
  return tmpDir;
}

function writeDecisionRecord(tmpDir, surface, filename) {
  const surfaceFirstDir = path.join(tmpDir, 'records', surface, 'decisions');
  const flatDir = path.join(tmpDir, 'records', 'decisions');
  const targetDir = surface ? surfaceFirstDir : flatDir;
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, filename),
    `id: ${filename.replace('.yaml', '')}\nstatus: active\n`
  );
}

function setPreflightMarker(tmpDir, surface) {
  const markerPath = path.join(tmpDir, '.claude', 'coordination', `.loop-preflight-${surface}`);
  fs.writeFileSync(markerPath, JSON.stringify({ surface, completed_at: new Date().toISOString() }));
}

function writeObservation(tmpDir, id, constraint, timestamp) {
  const content = [
    `id: ${id}`,
    `constraint_type: write-path`,
    `constraint: ${constraint}`,
    `status: active`,
    `updated_at: "${timestamp}"`,
    `description: test observation`,
  ].join('\n');
  fs.writeFileSync(path.join(tmpDir, 'records', 'observations', `${id}.yaml`), content);
}

function setMarker(tmpDir, timestamp) {
  const markerPath = path.join(tmpDir, '.claude', 'coordination', '.last-operator-message');
  fs.writeFileSync(markerPath, JSON.stringify({ timestamp, prompt_snippet: 'test' }));
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

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

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
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function withTempProject(fn) {
  const tmpDir = createTempProject();
  try {
    return await fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('write-coordination-gate minimal behavior', () => {
  describe('allowed paths (exit 0)', () => {
    it('non-Edit/Write tool -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Bash', tool_input: { command: 'ls' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Edit docs/** -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'docs/journals/foo.md' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Write plans/** -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Write', tool_input: { file_path: 'plans/260520/bar.md' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Edit .claude/** -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: '.claude/settings.json' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Edit product/** with preflight marker -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        setPreflightMarker(tmpDir, 'product');
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'product/api/main.py' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Edit tools/** -> exit 0', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'tools/mcp/server.js' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });
  });

  describe('blocked paths (exit 2)', () => {
    it('Edit records/observations/** -> exit 2, decision: block', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'records/observations/foo.yaml' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout);
        assert.ok(out, 'hook should emit JSON on stderr/stdout');
        assert.strictEqual(out.decision, 'block');
        assert.strictEqual(out.matched_rule, 'records/**');
      });
    });

    it('Edit records/evidence/** -> exit 2, matched_rule: records/**', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'records/evidence/foo.md' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout);
        assert.ok(out, 'hook should emit JSON');
        assert.strictEqual(out.matched_rule, 'records/**');
      });
    });

    it('Edit schemas/** -> exit 2, decision: block', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'schemas/observation.schema.json' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout);
        assert.ok(out, 'hook should emit JSON');
        assert.strictEqual(out.decision, 'block');
        assert.strictEqual(out.matched_rule, 'schemas/**');
      });
    });

    it('Edit node_modules/** -> exit 2 (blocked)', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'node_modules/foo/bar.js' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
      });
    });

    it('Edit dist/** -> exit 2 (blocked)', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'dist/bundle.js' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
      });
    });

    it('Edit build/** -> exit 2 (blocked)', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'build/out.js' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
      });
    });

    it('Edit unknown multi-segment path (tmp/.steal) -> exit 0 (not gated)', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'tmp/.steal' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Edit single-segment unknown path (vendor-secrets.env) -> exit 0 (allowed by * rule)', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'vendor-secrets.env' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 0);
      });
    });

    it('Path traversal to observations (records/evidence/../observations/foo.yaml) -> exit 2', async () => {
      await withTempProject(async (tmpDir) => {
        const r = await runHook(
          { tool_name: 'Edit', tool_input: { file_path: 'records/evidence/../observations/foo.yaml' } },
          { GATE_ROOT: tmpDir }
        );
        assert.strictEqual(r.exitCode, 2);
        const out = parseOutput(r.stdout);
        assert.ok(out, 'hook should emit JSON');
        assert.strictEqual(out.matched_rule, 'records/**');
      });
    });
  });
});
