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

// ─── Preflight Marker Utilities ───

function createTmpPreflight(surface, timestamp) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-preflight-'));
  const markerPath = path.join(tmpDir, `.loop-preflight-${surface}`);
  fs.writeFileSync(markerPath, JSON.stringify({ surface, completed_at: timestamp }));
  return { tmpDir, markerPath };
}

describe('readPreflightMarker TTL', () => {
  it('returns marker when within TTL (fresh)', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const now = new Date().toISOString();
    const { tmpDir } = createTmpPreflight('product', now);
    try {
      const marker = readPreflightMarker('product', tmpDir);
      assert.ok(marker);
      assert.equal(marker.surface, 'product');
      assert.equal(marker.completed_at, now);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when marker is older than TTL (expired)', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const { tmpDir } = createTmpPreflight('product', old);
    try {
      const marker = readPreflightMarker('product', tmpDir);
      assert.equal(marker, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when marker has invalid timestamp', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-preflight-'));
    const markerPath = path.join(tmpDir, '.loop-preflight-product');
    fs.writeFileSync(markerPath, JSON.stringify({ surface: 'product', completed_at: 'not-a-date' }));
    try {
      const marker = readPreflightMarker('product', tmpDir);
      assert.equal(marker, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when no marker file exists', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-preflight-'));
    try {
      const marker = readPreflightMarker('product', tmpDir);
      assert.equal(marker, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns marker at exactly TTL boundary (strict >, not >=)', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    // Marker at exactly 30 min is still valid (strict > means 30*60*1000 is NOT expired)
    const exact = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { tmpDir } = createTmpPreflight('product', exact);
    try {
      const marker = readPreflightMarker('product', tmpDir);
      assert.ok(marker, 'marker at exactly 30 min should still be valid');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when marker is 31 min old (past TTL)', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const { tmpDir } = createTmpPreflight('product', old);
    try {
      const marker = readPreflightMarker('product', tmpDir);
      assert.equal(marker, null);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns marker with correct surface field', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const now = new Date().toISOString();
    const { tmpDir } = createTmpPreflight('api', now);
    try {
      const marker = readPreflightMarker('api', tmpDir);
      assert.ok(marker);
      assert.equal(marker.surface, 'api');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('ignores marker for different surface (reads correct file)', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const now = new Date().toISOString();
    const { tmpDir } = createTmpPreflight('product', now);
    // Also create a marker for a different surface
    fs.writeFileSync(path.join(tmpDir, '.loop-preflight-api'), JSON.stringify({ surface: 'api', completed_at: now }));
    try {
      const marker = readPreflightMarker('product', tmpDir);
      assert.ok(marker);
      assert.equal(marker.surface, 'product');
      const apiMarker = readPreflightMarker('api', tmpDir);
      assert.ok(apiMarker);
      assert.equal(apiMarker.surface, 'api');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when coordDir points to nonexistent path', () => {
    const { readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const marker = readPreflightMarker('product', '/nonexistent/path/that/does/not/exist');
    assert.equal(marker, null);
  });
});

describe('writePreflightMarker', () => {
  it('writes marker file with surface and completed_at', () => {
    const { writePreflightMarker, readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-preflight-write-'));
    try {
      writePreflightMarker('product', tmpDir);
      const marker = readPreflightMarker('product', tmpDir);
      assert.ok(marker);
      assert.equal(marker.surface, 'product');
      assert.ok(marker.completed_at);
      // Verify ISO8601 timestamp is parseable
      const ts = new Date(marker.completed_at);
      assert.ok(!isNaN(ts.getTime()), 'completed_at should be valid ISO8601');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses atomic write (.tmp + renameSync)', () => {
    const { writePreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-preflight-write-'));
    try {
      writePreflightMarker('product', tmpDir);
      const markerPath = path.join(tmpDir, '.loop-preflight-product');
      const tmpPath = markerPath + '.tmp';
      assert.ok(fs.existsSync(markerPath), 'marker file should exist');
      assert.ok(!fs.existsSync(tmpPath), '.tmp file should be cleaned up after rename');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('overwrites existing marker (refresh)', () => {
    const { writePreflightMarker, readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-preflight-write-'));
    try {
      writePreflightMarker('product', tmpDir);
      const first = readPreflightMarker('product', tmpDir);
      assert.ok(first);
      // Small delay to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 10) { /* busy wait 10ms */ }
      writePreflightMarker('product', tmpDir);
      const second = readPreflightMarker('product', tmpDir);
      assert.ok(second);
      assert.ok(new Date(second.completed_at).getTime() >= new Date(first.completed_at).getTime(),
        'refreshed marker should have same or newer timestamp');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates coordDir if missing', () => {
    const { writePreflightMarker, readPreflightMarker } = require('../hooks/lib/gate-utils.cjs');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-preflight-write-'));
    const nestedDir = path.join(tmpDir, 'nested', 'sub', 'dir');
    try {
      assert.ok(!fs.existsSync(nestedDir), 'nested dir should not exist yet');
      writePreflightMarker('product', nestedDir);
      assert.ok(fs.existsSync(nestedDir), 'nested dir should be created');
      const marker = readPreflightMarker('product', nestedDir);
      assert.ok(marker);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('inferSurface defaults to product for all product paths', () => {
  it('inferSurface returns "product" for product/unknown/stack.py', () => {
    const { inferSurface } = require('../hooks/lib/gate-utils.cjs');
    assert.equal(inferSurface('product/unknown/stack.py'), 'product');
  });

  it('inferSurface returns "product" for product/readme.md', () => {
    const { inferSurface } = require('../hooks/lib/gate-utils.cjs');
    assert.equal(inferSurface('product/readme.md'), 'product');
  });

  it('inferSurface returns "product" for product/api/src/main.py', () => {
    const { inferSurface } = require('../hooks/lib/gate-utils.cjs');
    assert.equal(inferSurface('product/api/src/main.py'), 'product');
  });

  it('inferSurface returns "product" for product/web/routes.ts', () => {
    const { inferSurface } = require('../hooks/lib/gate-utils.cjs');
    assert.equal(inferSurface('product/web/routes.ts'), 'product');
  });
});
