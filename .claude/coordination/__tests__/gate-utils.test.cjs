#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function createTmpMarker(timestamp) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-test-'));
  const markerPath = path.join(tmpDir, '.last-operator-message');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ timestamp, prompt_snippet: 'test' }, null, 2));
  return { tmpDir, markerPath };
}

describe('gate-utils.cjs pattern sync', () => {
  it('loads CONSTRAINT_PATTERNS from patterns.json', () => {
    const { CONSTRAINT_PATTERNS } = require('../hooks/lib/gate-utils.cjs');
    assert.ok(CONSTRAINT_PATTERNS);
    assert.ok(CONSTRAINT_PATTERNS.docker instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS.sudo instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS['package-manager'] instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS['vendor-api'] instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS['side-effect-import'] instanceof RegExp);
  });

  it('patterns match expected commands', () => {
    const { matchConstraintPattern } = require('../hooks/lib/gate-utils.cjs');
    assert.strictEqual(matchConstraintPattern('docker run ubuntu'), 'docker');
    assert.strictEqual(matchConstraintPattern('sudo rm -rf /'), 'sudo');
    assert.strictEqual(matchConstraintPattern('pnpm install'), 'package-manager');
    assert.strictEqual(matchConstraintPattern('pnpm bootstrap:api'), 'package-manager');
    assert.strictEqual(matchConstraintPattern('python -c "import vnstock_data"'), 'side-effect-import');
    assert.strictEqual(matchConstraintPattern("python -c 'import vnstock'"), 'vendor-api');
    assert.strictEqual(matchConstraintPattern('ls'), null);
  });
});

describe('readLastOperatorMessage TTL', () => {
  it('returns marker when within TTL (fresh)', () => {
    const { readLastOperatorMessage } = require('../hooks/lib/gate-utils.cjs');
    const now = new Date().toISOString();
    const { tmpDir, markerPath } = createTmpMarker(now);
    process.env.GATE_MARKER_PATH = markerPath;
    try {
      const marker = readLastOperatorMessage(tmpDir);
      assert.ok(marker);
      assert.equal(marker.timestamp, now);
    } finally {
      delete process.env.GATE_MARKER_PATH;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when marker is older than TTL (expired)', () => {
    const { readLastOperatorMessage } = require('../hooks/lib/gate-utils.cjs');
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const { tmpDir, markerPath } = createTmpMarker(old);
    process.env.GATE_MARKER_PATH = markerPath;
    try {
      const marker = readLastOperatorMessage(tmpDir);
      assert.equal(marker, null);
    } finally {
      delete process.env.GATE_MARKER_PATH;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when marker has invalid timestamp', () => {
    const { readLastOperatorMessage } = require('../hooks/lib/gate-utils.cjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-test-'));
    const markerPath = path.join(tmpDir, '.last-operator-message');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify({ timestamp: 'not-a-date', prompt_snippet: 'test' }, null, 2));
    process.env.GATE_MARKER_PATH = markerPath;
    try {
      const marker = readLastOperatorMessage(tmpDir);
      assert.equal(marker, null);
    } finally {
      delete process.env.GATE_MARKER_PATH;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when no marker file exists', () => {
    const { readLastOperatorMessage } = require('../hooks/lib/gate-utils.cjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-test-'));
    process.env.GATE_MARKER_PATH = path.join(tmpDir, 'nonexistent-marker.json');
    try {
      const marker = readLastOperatorMessage(tmpDir);
      assert.equal(marker, null);
    } finally {
      delete process.env.GATE_MARKER_PATH;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null for marker exactly at TTL boundary (strict expiry)', () => {
    const { readLastOperatorMessage } = require('../hooks/lib/gate-utils.cjs');
    const boundary = new Date(Date.now() - 30 * 60 * 1000 - 1).toISOString();
    const { tmpDir, markerPath } = createTmpMarker(boundary);
    process.env.GATE_MARKER_PATH = markerPath;
    try {
      const marker = readLastOperatorMessage(tmpDir);
      assert.equal(marker, null);
    } finally {
      delete process.env.GATE_MARKER_PATH;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('pathMatchesObservation', () => {
  it('matches records-evidence to records/meta/evidence/foo.md (surface-first)', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'write-path', constraint: 'records-evidence', status: 'active' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/meta/evidence/foo.md'), true);
  });

  it('matches records-evidence to records/vnstock/evidence/foo.md (surface-first)', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'write-path', constraint: 'records-evidence', status: 'active' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/vnstock/evidence/foo.md'), true);
  });

  it('matches records-evidence to flat records/evidence/foo.md (backward compat)', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'write-path', constraint: 'records-evidence', status: 'active' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/evidence/foo.md'), true);
  });

  it('matches records-index to records/meta/index/foo.yaml (surface-first)', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'write-path', constraint: 'records-index', status: 'active' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/meta/index/foo.yaml'), true);
  });

  it('matches records-index to flat records/index/foo.yaml (backward compat)', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'write-path', constraint: 'records-index', status: 'active' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/index/foo.yaml'), true);
  });

  it('returns false when constraint is missing', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'write-path', status: 'active' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/meta/evidence/foo.md'), false);
  });

  it('returns false when constraint_type is wrong', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'docker', constraint: 'records-evidence', status: 'active' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/meta/evidence/foo.md'), false);
  });

  it('returns false when status is archived', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'write-path', constraint: 'records-evidence', status: 'archived' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/meta/evidence/foo.md'), false);
  });

  it('returns false for records/observations/** regardless of constraint', () => {
    const { pathMatchesObservation } = require('../hooks/lib/gate-utils.cjs');
    const obs = { constraint_type: 'write-path', constraint: 'records-evidence', status: 'active' };
    assert.strictEqual(pathMatchesObservation(obs, 'records/observations/foo.yaml'), false);
  });
});
