#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('gate-utils.cjs pattern sync', () => {
  it('loads CONSTRAINT_PATTERNS from patterns.json', () => {
    const { CONSTRAINT_PATTERNS } = require('../hooks/lib/gate-utils.cjs');
    assert.ok(CONSTRAINT_PATTERNS);
    assert.ok(CONSTRAINT_PATTERNS.docker instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS.sudo instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS['package-manager'] instanceof RegExp);
    assert.ok(CONSTRAINT_PATTERNS['vendor-api'] instanceof RegExp);
  });

  it('patterns match expected commands', () => {
    const { matchConstraintPattern } = require('../hooks/lib/gate-utils.cjs');
    assert.strictEqual(matchConstraintPattern('docker run ubuntu'), 'docker');
    assert.strictEqual(matchConstraintPattern('sudo rm -rf /'), 'sudo');
    assert.strictEqual(matchConstraintPattern('pnpm install'), 'package-manager');
    assert.strictEqual(matchConstraintPattern('pnpm bootstrap:api'), 'package-manager');
    assert.strictEqual(matchConstraintPattern('python -c "import vnstock_data"'), 'vendor-api');
    assert.strictEqual(matchConstraintPattern('ls'), null);
  });
});
