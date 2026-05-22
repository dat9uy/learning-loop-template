---
phase: 1
title: "Write Gate Preflight Check"
status: completed
effort: "2h"
dependencies: [0]
---

# Phase 1: Write Gate Preflight Check

## Overview

Replace the decision-records-only check in `write-coordination-gate.cjs` product/** block with preflight marker check. Block message now includes `preflight_checklist` — the positive contract.

## Requirements

- product/** write → `inferSurface()` → `readPreflightMarker(surface, coordDir)` → allow if valid, block with checklist if missing/expired
- Block JSON shape: `{ decision, reason, file_path, matched_rule, surface, preflight_checklist }`
- `inferSurface()` defaults to `'product'` for all `product/**` paths — no null-return escape hatch
- Checklist is static 6-step array embedded in block output

## Architecture

Current flow (lines 104-119 of write-coordination-gate.cjs):
```
product/** → inferSurface → hasDecisionRecords → block if missing
```

New flow:
```
product/** → inferSurface (always returns 'product') → readPreflightMarker(surface, coordDir) → if valid → exit 0
           → block with preflight_checklist JSON
```

### Preflight Checklist (embedded in block JSON)

```json
{
  "preflight_checklist": [
    "1. Call workflow_product_build to decompose the request into assertions/risks",
    "2. Create decision records via create_decision_record MCP tool for surface",
    "3. Create risk records via create_risk_record MCP tool for identified risks",
    "4. Call validate_records to verify all YAML is correct",
    "5. Call mark_preflight_complete with surface name",
    "6. Retry your write — gate will pass if marker is valid"
  ]
}
```

## Related Code Files

- Modify: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Modify: `.claude/coordination/hooks/bash-coordination-gate.cjs`
- Create: `.claude/coordination/__tests__/preflight-gate.test.cjs`
- Read: `.claude/coordination/hooks/lib/gate-utils.cjs` (uses readPreflightMarker from Phase 0)

## Implementation Steps

### TDD Step 1: Write preflight-gate.test.cjs (14 cases)

New test file. Follows `artifact-aware-gate.test.cjs` helper patterns.

```js
describe('preflight gate for product/**', () => {
  describe('allowed writes (exit 0)', () => {
    it('Edit product/api/src/main.py with valid preflight marker -> exit 0')
    it('Edit product/web/routes.ts with valid preflight marker -> exit 0')
    it('Edit product/api/src/main.py with fresh marker (within TTL) -> exit 0')
    it('Write product/readme.md with valid preflight marker -> exit 0')
    it('Write product/unknown/stack.py with valid preflight marker -> exit 0')
  });

  describe('blocked writes (exit 2 with preflight_checklist)', () => {
    it('Edit product/api/src/main.py without preflight marker -> exit 2')
    it('Edit product/web/routes.ts without preflight marker -> exit 2')
    it('Block JSON contains preflight_checklist array with 6 steps')
    it('Block JSON contains surface field matching inferred surface')
    it('Edit product/api/src/main.py with expired marker (31+ min) -> exit 2')
    it('Block reason mentions preflight, not decision records')
    it('Preflight block always exits 2 — no GATE_RESPONSE_MODE check in code path')
  });

  describe('marker file write protection', () => {
    it('Edit .claude/coordination/.loop-preflight-product -> exit 2 (blocked)')
    it('Write .claude/coordination/.loop-preflight-product -> exit 2 (blocked)')
  });
});
```

Helper for setting preflight marker in tests:
```js
function setPreflightMarker(tmpDir, surface, completedAt) {
  const markerPath = path.join(tmpDir, '.claude', 'coordination',
    `.loop-preflight-${surface}`);
  fs.writeFileSync(markerPath, JSON.stringify({
    surface,
    completed_at: completedAt,
  }));
}
```

### TDD Step 2: Modify write-coordination-gate.cjs — block preflight marker writes

**Red team finding (Critical):** Line 126 `globMatch('.claude/**', relPath)` allows ALL `.claude/**` writes, including `.claude/coordination/.loop-preflight-*`. Agents can bypass the MCP tool by writing marker files directly via Edit/Write.

**Fix:** Add a block rule BEFORE the `.claude/**` allow:

```js
// Block direct writes to preflight marker files — must use mark_preflight_complete MCP tool
if (globMatch('.claude/coordination/.loop-preflight-*', relPath)) {
    console.log(JSON.stringify({
        decision: 'block',
        reason: 'Preflight marker files must be created via mark_preflight_complete MCP tool.',
        file_path: filePath,
        matched_rule: '.claude/coordination/.loop-preflight-*',
    }));
    process.exit(2);
}
```

This must be placed BEFORE line 126 (`globMatch('.claude/**', relPath)`) so it takes precedence.

### TDD Step 3: Modify write-coordination-gate.cjs product/** block

Replace lines 104-119 with:

```js
if (globMatch('product/**', relPath)) {
    const surface = inferSurface(relPath);
    const coordDir = path.join(__dirname, '..');
    const marker = readPreflightMarker(surface, coordDir);
    if (marker) {
        process.exit(0);
    }
    console.log(JSON.stringify({
        decision: 'block',
        reason: `No preflight for surface '${surface}'. Complete preflight checklist first.`,
        file_path: filePath,
        matched_rule: 'product/**',
        surface,
        preflight_checklist: [
            '1. Call workflow_product_build to decompose the request into assertions/risks',
            '2. Create decision records via create_decision_record MCP tool for surface',
            '3. Create risk records via create_risk_record MCP tool for identified risks',
            '4. Call validate_records to verify all YAML is correct',
            '5. Call mark_preflight_complete with surface name',
            '6. Retry your write — gate will pass if marker is valid',
        ],
    }));
    process.exit(2);
}
```

### TDD Step 4: Update bash-coordination-gate.cjs — block preflight marker Bash writes

**Red team finding:** Bash gate (line 9-13) only blocks writes to `records/`. `echo ... > .claude/coordination/.loop-preflight-product` passes the bash gate.

Add to `PATH_WRITE_PATTERNS`:
```js
/>{1,2}\s*["']?\.?\/?\.claude\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
```

### TDD Step 5: Update imports in write-coordination-gate.cjs

Add `readPreflightMarker` to the require from `./lib/gate-utils.cjs`.

### TDD Step 6: Run tests

```bash
node --test .claude/coordination/__tests__/preflight-gate.test.cjs
node --test .claude/coordination/__tests__/gate-utils.test.cjs
node --test .claude/coordination/__tests__/write-coordination-gate-minimal.test.cjs
```

preflight-gate tests must pass. Minimal tests WILL fail (old decision-record setup) — fixed in Phase 3.

## Success Criteria

- [x] 14 preflight-gate.test.cjs cases pass (including marker write protection)
- [x] Product/** block now checks preflight marker, not decision records
- [x] Block JSON includes `preflight_checklist` array with 6 steps
- [x] Block JSON includes `surface` field
- [x] Preflight blocks always exit 2 — no `GATE_RESPONSE_MODE` check in code path
- [x] `inferSurface()` always returns 'product' for product/** paths — no null escape hatch
- [x] Write gate blocks direct `.loop-preflight-*` file writes (Edit/Write)
- [x] Bash gate blocks direct `.loop-preflight-*` file writes (redirects/heredocs/tee)

## Risk Assessment

**Breaking change** — product/** writes that previously passed with decision records alone will now be blocked until preflight marker exists. Existing tests in `artifact-aware-gate.test.cjs` and `write-coordination-gate-minimal.test.cjs` will fail — addressed in Phase 3.
