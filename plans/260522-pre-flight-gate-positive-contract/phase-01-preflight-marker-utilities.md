---
phase: 0
title: "Preflight Marker Utilities"
status: completed
effort: "1h"
dependencies: []
---

# Phase 0: Preflight Marker Utilities

## Overview

Add `readPreflightMarker()` and `writePreflightMarker()` to `gate-utils.cjs`, following the exact pattern of `readLastOperatorMessage()`. TDD: write all tests first, then implement.

## Requirements

- `readPreflightMarker(surface, coordDir)` — reads `.loop-preflight-<surface>` from coordDir, validates timestamp, enforces 30-min TTL, returns parsed object or null
- `writePreflightMarker(surface, coordDir)` — atomic write of `{ surface, completed_at }` to `.loop-preflight-<surface>`, uses `.tmp` + `renameSync`
- `GATE_ROOT` env var for test isolation (same as existing gate test pattern)

## Architecture

Follows `readLastOperatorMessage` pattern exactly:
- Marker path: `path.join(coordDir, '.loop-preflight-' + surface)` — `coordDir` derived from `GATE_ROOT` env var or `findProjectRoot()`, matching existing gate test pattern
- TTL: reuse `MARKER_TTL_MS` (30 * 60 * 1000) — same constant already in gate-utils.cjs line 72
- TTL boundary uses strict `>` — marker at exactly 30 min is still valid; expired = older than 30 min
- Atomic write: `writeFileSync(tmpPath, ...) → renameSync(tmpPath, fullPath)`

## Related Code Files

- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs`
- Modify: `.claude/coordination/__tests__/gate-utils.test.cjs`
- Modify: `.gitignore` (add `.loop-preflight-*`)

## Implementation Steps

### TDD Step 1: Write tests for readPreflightMarker (8 cases)

Add to `gate-utils.test.cjs`:

```js
describe('readPreflightMarker TTL', () => {
  function createTmpPreflight(surface, timestamp) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-utils-preflight-'));
    const markerPath = path.join(tmpDir, `.loop-preflight-${surface}`);
    fs.writeFileSync(markerPath, JSON.stringify({ surface, completed_at: timestamp }));
    return { tmpDir, markerPath };
  }

  it('returns marker when within TTL (fresh)')
  it('returns null when marker is older than TTL (expired)')
  it('returns null when marker has invalid timestamp')
  it('returns null when no marker file exists')
  it('returns marker at exactly TTL boundary (strict >, not >=)')
  it('returns null when marker is 31 min old (past TTL)')
  it('returns marker with correct surface field')
  it('ignores marker for different surface (reads correct file)')
  it('returns null when GATE_ROOT points to nonexistent path')
});
```

### TDD Step 2: Write tests for writePreflightMarker (4 cases)

```js
describe('writePreflightMarker', () => {
  it('writes marker file with surface and completed_at')
  it('uses atomic write (.tmp + renameSync)')
  it('overwrites existing marker (refresh)')
  it('creates coordDir if missing')
});
```

### TDD Step 3: Implement readPreflightMarker in gate-utils.cjs

```js
function readPreflightMarker(surface, coordDir) {
  const markerPath = path.join(coordDir, `.loop-preflight-${surface}`);
  try {
    const raw = fs.readFileSync(markerPath, 'utf8');
    const marker = JSON.parse(raw);
    if (!marker.completed_at) return null;
    const ts = new Date(marker.completed_at);
    if (isNaN(ts.getTime())) return null;
    // Strict >: marker at exactly 30 min is still valid
    if (Date.now() - ts.getTime() > MARKER_TTL_MS) return null;
    return marker;
  } catch {
    return null;
  }
}
```

### TDD Step 4: Implement writePreflightMarker in gate-utils.cjs

```js
function writePreflightMarker(surface, coordDir) {
  const markerPath = path.join(coordDir, `.loop-preflight-${surface}`);
  const content = JSON.stringify({
    surface,
    completed_at: new Date().toISOString(),
  }, null, 2);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  const tmpPath = markerPath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, markerPath);
}
```

### TDD Step 5: Export both functions

Add to `module.exports` in gate-utils.cjs.

### TDD Step 6: Fix inferSurface to default to 'product' for all product paths

**Validation decision:** `inferSurface()` at gate-utils.cjs:177-184 returns `parts[1]` for `product/X/**` where X is not "api" or "web". This means `product/unknown/stack.py` returns surface `"unknown"`. The gate should enforce preflight for ALL product paths, not just api/web.

**Fix:** Change `return parts[1]` to `return 'product'` for all product subpaths. All `product/**` paths infer surface "product" — no escape hatch.

```js
// All product/** paths → surface "product"
if (parts[0] === 'product' && parts.length >= 2) {
  return 'product';
}
```

Update tests:
```js
it('inferSurface returns "product" for product/unknown/stack.py')
it('inferSurface returns "product" for product/readme.md')
it('inferSurface returns "product" for product/api/src/main.py')
it('inferSurface returns "product" for product/web/routes.ts')
```

### TDD Step 7: Add .loop-preflight-* to .gitignore

Marker files are ephemeral runtime state. Add to project `.gitignore`:
```
.claude/coordination/.loop-preflight-*
```

### TDD Step 8: Run tests

```bash
node --test .claude/coordination/__tests__/gate-utils.test.cjs
```

All 12+ new tests must pass + all existing tests must still pass.

## Success Criteria

- [x] `readPreflightMarker` — 9 test cases pass (fresh, expired at 31+ min, invalid, missing, boundary exact 30 min still valid, surface field, correct file, nonexistent dir, strict > semantics)
- [x] `writePreflightMarker` — 4 test cases pass (write, atomic, overwrite, mkdir)
- [x] `inferSurface` — returns 'product' for all product/** subpaths (4 new tests)
- [x] All existing gate-utils.test.cjs tests still pass
- [x] Both functions exported from gate-utils.cjs
- [x] `.loop-preflight-*` added to `.gitignore`

## Risk Assessment

Low risk — additive changes only, no existing behavior modified.
