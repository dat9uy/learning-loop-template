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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-gate-test-'));
  fs.mkdirSync(path.join(tmpDir, 'records', 'observations'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'coordination'), { recursive: true });
  return tmpDir;
}

function writeDecisionRecord(tmpDir, surface, filename) {
  const surfaceFirstDir = path.join(tmpDir, 'records', surface, 'decisions');
  const flatDir = path.join(tmpDir, 'records', 'decisions');
  // Use surface-first if surface is provided, otherwise flat
  const targetDir = surface ? surfaceFirstDir : flatDir;
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, filename),
    `id: ${filename.replace('.yaml', '')}\nstatus: active\n`
  );
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

// ─── Phase 1: Gate Content Scanning ───

describe('artifact-aware gate — plan content scanning (phase 1)', () => {
  it('plan.md without product-build tag -> exit 0 (no scan)', async () => {
    await withTempProject(async (tmpDir) => {
      const content = '---\ntitle: "Some Plan"\ntags: [experiment]\n---\n\n# Plan\n';
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'plans/2026/test/plan.md', content } },
        { GATE_ROOT: tmpDir }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it('plan.md with product-build tag and existing decision records -> exit 0', async () => {
    await withTempProject(async (tmpDir) => {
      writeDecisionRecord(tmpDir, 'product', 'decision-product.yaml');
      const content = '---\ntitle: "Product Plan"\ntags: [product-build]\nsurfaces: [product]\n---\n\n# Plan\n';
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'plans/2026/test/plan.md', content } },
        { GATE_ROOT: tmpDir }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it('plan.md with product-build tag and MISSING decision records -> always block (exit 2)', async () => {
    await withTempProject(async (tmpDir) => {
      const content = '---\ntitle: "Product Plan"\ntags: [product-build]\nsurfaces: [product]\n---\n\n# Plan\n';
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'plans/2026/test/plan.md', content } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'warn' }
      );
      assert.strictEqual(r.exitCode, 2);
      const out = parseOutput(r.stdout) || parseOutput(r.stderr);
      assert.ok(out, 'should emit JSON block');
      assert.strictEqual(out.decision, 'block');
      assert.ok(out.missing_surfaces.includes('product'), 'should list missing surface');
    });
  });

  it('plan.md with product-build tag and MISSING records + escalate mode -> blocked (exit 2)', async () => {
    await withTempProject(async (tmpDir) => {
      const content = '---\ntitle: "Product Plan"\ntags: [product-build]\nsurfaces: [product]\n---\n\n# Plan\n';
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'plans/2026/test/plan.md', content } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'escalate' }
      );
      assert.strictEqual(r.exitCode, 2);
      const out = parseOutput(r.stdout) || parseOutput(r.stderr);
      assert.ok(out, 'should emit JSON block');
      assert.strictEqual(out.decision, 'block');
      assert.ok(out.reason.includes('product'), 'should mention missing surface in reason');
    });
  });

  it('edit to existing plan.md -> no content scan (exit 0)', async () => {
    await withTempProject(async (tmpDir) => {
      // Pre-create the plan file so hook sees it as an edit
      const planPath = path.join(tmpDir, 'plans', '2026', 'test', 'plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Existing plan\n');

      const newContent = '---\ntitle: "Updated"\ntags: [product-build]\nsurfaces: [product]\n---\n\n# Updated Plan\n';
      const r = await runHook(
        { tool_name: 'Edit', tool_input: { file_path: 'plans/2026/test/plan.md', new_string: newContent } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'escalate' }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it('non-plan file in plans/** -> exit 0', async () => {
    await withTempProject(async (tmpDir) => {
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'plans/2026/test/notes.md', content: '# Notes' } },
        { GATE_ROOT: tmpDir }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it('malformed frontmatter -> exit 0 (fail-open)', async () => {
    await withTempProject(async (tmpDir) => {
      const content = '---\nthis is not valid yaml: [\n---\n\n# Plan\n';
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'plans/2026/test/plan.md', content } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'escalate' }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });
});

// ─── Phase 2: Surface Inference ───

describe('artifact-aware gate — surface inference (phase 2)', () => {
  it('product/api/src/main.py with decision record -> exit 0', async () => {
    await withTempProject(async (tmpDir) => {
      writeDecisionRecord(tmpDir, 'product', 'decision-product.yaml');
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'product/api/src/main.py', content: 'print(1)' } },
        { GATE_ROOT: tmpDir }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it('product/web/src/routes.ts without decision record -> always block (exit 2)', async () => {
    await withTempProject(async (tmpDir) => {
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'product/web/src/routes.ts', content: 'const x = 1;' } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'warn' }
      );
      assert.strictEqual(r.exitCode, 2);
      const out = parseOutput(r.stdout) || parseOutput(r.stderr);
      assert.ok(out, 'should emit JSON block');
      assert.strictEqual(out.decision, 'block');
      assert.ok(out.surface === 'product' || out.surface === 'web', 'should include surface');
    });
  });

  it('product/api/... + escalate mode + no decision -> blocked (exit 2)', async () => {
    await withTempProject(async (tmpDir) => {
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'product/api/main.py', content: 'print(1)' } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'escalate' }
      );
      assert.strictEqual(r.exitCode, 2);
      const out = parseOutput(r.stdout) || parseOutput(r.stderr);
      assert.ok(out, 'should emit JSON block');
      assert.strictEqual(out.decision, 'block');
    });
  });

  it('records/vnstock/index/foo.yaml → always block (records/** blocked)', async () => {
    await withTempProject(async (tmpDir) => {
      writeDecisionRecord(tmpDir, 'vnstock', 'decision-vnstock.yaml');
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'records/vnstock/index/foo.yaml', content: 'id: test' } },
        { GATE_ROOT: tmpDir }
      );
      assert.strictEqual(r.exitCode, 2);
      const out = parseOutput(r.stdout) || parseOutput(r.stderr);
      assert.ok(out, 'should emit JSON block');
      assert.strictEqual(out.decision, 'block');
      assert.strictEqual(out.matched_rule, 'records/**');
    });
  });

  it('docs/journals/session.md -> exit 0 unconditionally', async () => {
    await withTempProject(async (tmpDir) => {
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'docs/journals/session-2026-05-22.md', content: '# Journal' } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'escalate' }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it('unknown product/unknown/stack.py -> always block (surface inferred from first segment)', async () => {
    await withTempProject(async (tmpDir) => {
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'product/unknown/stack.py', content: 'print(1)' } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'warn' }
      );
      assert.strictEqual(r.exitCode, 2);
      const out = parseOutput(r.stdout) || parseOutput(r.stderr);
      assert.ok(out, 'should emit JSON block');
      assert.strictEqual(out.decision, 'block');
    });
  });

  it('surface-first path records/product/decisions/*.yaml found -> product code allowed', async () => {
    await withTempProject(async (tmpDir) => {
      writeDecisionRecord(tmpDir, 'product', 'decision-product.yaml');
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'product/api/main.py', content: 'print(1)' } },
        { GATE_ROOT: tmpDir }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it('flat fallback records/decisions/*product*.yaml found -> product code allowed', async () => {
    await withTempProject(async (tmpDir) => {
      // Write flat fallback decision record (no surface subdirectory)
      const flatDir = path.join(tmpDir, 'records', 'decisions');
      fs.mkdirSync(flatDir, { recursive: true });
      fs.writeFileSync(
        path.join(flatDir, 'decision-product-001.yaml'),
        'id: decision-product-001\nstatus: active\n'
      );
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'product/api/main.py', content: 'print(1)' } },
        { GATE_ROOT: tmpDir }
      );
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it('multi-segment product path product/api/capabilities/vnstock-data/capability.py -> surface product, no decision -> block', async () => {
    await withTempProject(async (tmpDir) => {
      const r = await runHook(
        { tool_name: 'Write', tool_input: { file_path: 'product/api/capabilities/vnstock-data/capability.py', content: 'print(1)' } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: 'warn' }
      );
      assert.strictEqual(r.exitCode, 2);
      const out = parseOutput(r.stdout) || parseOutput(r.stderr);
      assert.ok(out, 'should emit JSON block');
      assert.strictEqual(out.decision, 'block');
    });
  });
});
