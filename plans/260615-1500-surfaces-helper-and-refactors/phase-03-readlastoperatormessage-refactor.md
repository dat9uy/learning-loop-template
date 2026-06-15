---
phase: 3
title: "core/inbound-state.js readLastOperatorMessage refactor — use readFromAllSurfaces"
status: pending
priority: P1
effort: "1.5h"
dependencies: ["phase-01-surfaces-helper"]
---

# Phase 3: readLastOperatorMessage refactor

## Overview

Refactor `readLastOperatorMessage` in `core/inbound-state.js` (lines 32-77) to use the new `core/surfaces.js#readFromAllSurfaces` helper instead of inlining the `.claude → .factory` fallback pattern. DRYs the cross-surface iteration; adding a third surface (e.g., `.cursor`) is now automatic — the helper iterates `SURFACES`.

The function's contract is preserved: priority is `GATE_MARKER_PATH` env var → `.claude` → `.factory` (in that order, first valid marker wins). TTL filtering and malformed-JSON handling stay in this function; only the path iteration is delegated to the helper.

## Requirements

Functional:
- `readLastOperatorMessage(root)` returns the same value as before for all existing inputs (env-var, .claude hit, .factory hit, both missing, malformed JSON on either surface, expired timestamp).
- When `GATE_MARKER_PATH` is set and points to a valid marker, that marker wins (priority 1).
- When env-var is unset/missing/expired, `.claude/coordination/.last-operator-message` is consulted (priority 2).
- When env-var and `.claude` are both unset/missing/expired/malformed, `.factory/coordination/.last-operator-message` is consulted (priority 3).
- TTL filter (`MARKER_TTL_MS = 30 min`) is applied uniformly; an expired marker is treated as non-existent.
- Malformed JSON on a surface is treated as non-existent (fall through to the next surface).
- Returns `null` when no valid marker is found on any surface.

Non-functional:
- The function body shrinks by ~30 lines (the two duplicate `try { ... } catch {}` blocks are replaced by a single `readFromAllSurfaces` call + a single TTL/parse loop).
- The import of `SURFACES` (or only `readFromAllSurfaces`) from `./surfaces.js` is the only new import.
- No other function in `core/inbound-state.js` is touched. `readSidecar` and `checkObservationStaleness` are unchanged.

## Architecture

```js
// tools/learning-loop-mcp/core/inbound-state.js
import { readFileSync, existsSync } from "node:fs";      // readFileSync still needed for env-var path
import { join } from "node:path";                         // join still needed for the env-var override
import { readFromAllSurfaces } from "./surfaces.js";     // NEW

const MARKER_TTL_MS = 30 * 60 * 1000;
const SIDECAR_FILENAME = "runtime-state.jsonl";
const META_AFFECTED_SYSTEMS = new Set(["meta", undefined, null]);

/** Apply TTL filter to a parsed marker; returns the marker if valid, else null. */
function isMarkerFresh(marker) {
  if (!marker || !marker.timestamp) return null;
  const markerTime = new Date(marker.timestamp).getTime();
  if (isNaN(markerTime)) return null;
  if (Date.now() - markerTime > MARKER_TTL_MS) return null;
  return marker;
}

export function readLastOperatorMessage(root) {
  try {
    // Priority 1: env var (operator override).
    if (process.env.GATE_MARKER_PATH) {
      const marker = isMarkerFresh(JSON.parse(readFileSync(process.env.GATE_MARKER_PATH, "utf8")));
      if (marker) return marker;
    }

    // Priority 2 + 3: surface iteration via the helper.
    const hits = readFromAllSurfaces(root, ".last-operator-message", { first: true });
    for (const hit of hits) {
      const marker = isMarkerFresh(hit.parsed);
      if (marker) return marker;
    }

    return null;
  } catch {
    return null;
  }
}
```

Notes:
- `readFromAllSurfaces(subpath, { first: true })` returns `parsed` for each surface, in `SURFACES` order (`[".claude", ".factory"]` today). The for-loop preserves the same priority.
- The `try { ... } catch {}` blocks around the per-surface reads are no longer needed — `readFromAllSurfaces` is fail-quiet per surface (Phase 1's contract). The outer `try { ... } catch { return null }` stays as a defense-in-depth for the env-var path and any unexpected throws from `isMarkerFresh`.
- The helper's `parsed` field is already `JSON.parse`d; malformed JSON on a surface yields `parsed: null`, which `isMarkerFresh` rejects.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/inbound-state.js` — replace lines 32-77 (~46 lines) with the ~20-line version above. Add 1 import.
- Create: `tools/learning-loop-mcp/__tests__/inbound-state-readlastoperatormessage.test.js` — 8-10 tests pinning the contract.
- No changes to `core/surfaces.js` (Phase 1 ships it; this phase consumes it).

## Implementation Steps (TDD)

1. **Red — write the test file first.** Create `tools/learning-loop-mcp/__tests__/inbound-state-readlastoperatormessage.test.js` with:
   - `test("returns env-var marker when GATE_MARKER_PATH is set and fresh")` — write a valid marker to a tmp file, set `GATE_MARKER_PATH` to it, assert it wins.
   - `test("falls through to .claude when env-var path is missing or expired")` — set `GATE_MARKER_PATH` to a non-existent path; write a fresh marker to `<root>/.claude/coordination/.last-operator-message`; assert the `.claude` marker is returned.
   - `test("falls through to .factory when env-var and .claude are both missing")` — only write to `.factory/coordination/.last-operator-message`; assert it's returned.
   - `test("returns null when no surface has a marker")` — no markers written; assert `null`.
   - `test("skips expired marker (older than 30 min)")` — write a marker with a timestamp > 30 min ago to `.claude`; assert `.factory` (fresh) is returned when both are written.
   - `test("skips malformed JSON on a surface")` — write `"not json {"` to `.claude` and a valid marker to `.factory`; assert `.factory` wins.
   - `test("skips marker without timestamp")` — write `{"foo": "bar"}` to `.claude`; assert `.factory` wins.
   - `test("returns null when all surfaces have expired markers")` — both surfaces have expired markers; assert `null`.
   - `test("priority order: .claude wins over .factory when both have fresh markers")` — lock the priority order. (Regression guard against the helper changing the iteration order.)
   - `test("returns null on inner throws (defense-in-depth)")` — make `JSON.parse` throw on the env-var path (point at a directory); assert `null` (the outer try/catch).
2. **Run tests; confirm RED.** `pnpm test -- readLastOperatorMessage` — 10 tests fail with "Cannot find module" or "function returned the old shape".
3. **Green — apply the refactor.** Edit `core/inbound-state.js` per the architecture above. Re-run the 10 tests; all pass.
4. **Refactor — final pass.** Confirm the function body shrank by ~25 lines. Confirm `grep "join(root, \\\"\\.claude\\\"" core/inbound-state.js` returns 0 hits in production code (the env-var path uses `process.env.GATE_MARKER_PATH`, not a constructed path; the surface iteration is via the helper). Confirm `pnpm test` shows 0 new failures.
5. **Whole-plan consistency check.** Confirm no other `core/` file still inlines the `.claude → .factory` fallback (e.g., for `.last-operator-message` or similar markers). `grep -rn "join(.*\\.claude.*\\.last-operator-message" tools/learning-loop-mcp/core/` → 0 hits. The future Report 1 work on override markers + decision logs is unblocked; this phase ships the precedent.

## Success Criteria

- [ ] `core/inbound-state.js` imports `readFromAllSurfaces` from `./surfaces.js`.
- [ ] `readLastOperatorMessage` no longer constructs `.claude/coordination/...` or `.factory/coordination/...` paths inline.
- [ ] All 10 behavioural test cases pass.
- [ ] `tools/learning-loop-mcp/__tests__/inbound-state-readlastoperatormessage.test.js` exists with 10+ passing tests.
- [ ] `pnpm test` shows 0 new failures; all 840+ existing tests still pass.
- [ ] The function body shrank by ≥ 20 lines (vs. the 46-line original).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `readFromAllSurfaces` returns parsed-or-null per surface; the original code did its own JSON.parse per surface. A future change to the helper's `parsed` shape would silently break this caller. | The helper's `parsed` shape is part of Phase 1's contract and locked by Phase 1's tests. If the contract changes, Phase 1's tests fail first. |
| The env-var priority path uses raw `readFileSync`; not the helper. If the helper is later extended to honour `GATE_MARKER_PATH`, this code would double-parse. | Documented in the architecture comment. The env-var path is operator override, not a surface — it stays separate. |
| The original code had per-surface `try { } catch {}` blocks. The new code relies on the helper's fail-quiet contract. If a future helper change drops the fail-quiet, this caller regresses. | The helper's fail-quiet contract is locked by Phase 1's `readFromAllSurfaces never throws on per-surface errors` test. |
| `checkObservationStaleness` (lines 89-149) calls `readLastOperatorMessage(root)` — it inherits the new behaviour. No change needed there, but a regression there would be silent. | `pnpm test` (which includes `inbound-state-runtime-state.test.js`) is the regression guard. If that test suite passes, `checkObservationStaleness` is unaffected. |

## Security Considerations

- The env-var override (`process.env.GATE_MARKER_PATH`) is unchanged. An operator who sets this can already point it at any path; the refactor doesn't widen that surface.
- The helper reads from `SURFACES` paths under `root` only. No path traversal beyond `join(root, surface, "coordination", subpath)`. The `.last-operator-message` subpath is a constant; no user input.
- Fail-quiet behaviour on malformed JSON: a future marker file with adversarial content (e.g., a 10GB string) would still be parsed. Mitigated by the marker file convention (small, well-known JSON shape). A future hardening phase can add a size cap in the helper.

## Next Steps

This is the last phase of Step 1. After all 3 phases ship:
- Report 1 Plan 1 (override marker + decision log + recurrence tracker) can be planned. Its code will use `writeToAllSurfaces` and `readFromAllSurfaces` for the cross-surface iteration.
- Report 2 Phases 2-5 (regression test, `consult-checklist` pattern type, `check_runtime_agnostic` MCP tool, rule entry + AGENTS.md amendment) can be planned. The helper is in `core/`; the rule can reference it.
