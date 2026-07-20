---
phase: 1
title: "B: Read-path consolidation + dead-code removal"
status: completed
priority: P1
effort: "2-3h"
dependencies: []
---

# Phase 1: B — Read-path consolidation + dead-code removal

## Overview

Migrate `runtime_state_read` from its divergent, throw-on-malformed `readSidecar` onto the shared `readRuntimeStateRows` (`core/runtime-state.js:27-38`), and delete the read tool's dead code (`computeFingerprint` L9-12, the unused `appendFileSync` import L2, `createHash` import L4, `SIDECAR_FILENAME` L7, and the `join` import L3 if unused after). Add a malformed-line regression test. This completes the DRY extraction started by plan 260704-0301 (which extracted the shared helpers but never migrated the read tool). Finding B resolves here.

## Requirements

- Functional: `runtime_state_read` no longer throws on a malformed line in `runtime-state.jsonl`; it skips the bad line and returns only valid rows (`total`/`count` reflect valid rows). The read tool uses `readRuntimeStateRows` from `core/runtime-state.js` and contains no dead code.
- Non-functional: no observable behavior change for valid rows (existing 6 tests stay green); no new imports beyond `readRuntimeStateRows`; the read tool does no direct file I/O after the swap.

## Architecture

- `readSidecar` (L14-22) is replaced by `readRuntimeStateRows(root)`. The shared helper splits on `\n`, drops empty lines, wraps `JSON.parse` per line in try/catch → `null`, and `.filter(Boolean)`s — so one malformed line is skipped, not thrown on.
- `toCompactRow` + the filter/slice/limit logic are unchanged.
- This phase is **minimal**: it does NOT add `fingerprint_valid` (that is Phase 2's `verifyRow` wiring). The B↔A boundary: B delivers a non-crashing read on the shared path; A layers `verifyRow` + the compact-row shape change on top.
- `findDispatchRow` (`meta-state-dispatch-finding-tool.js:45-50`) is NOT touched here — `readRuntimeStateRows` returns rows in file order (same as `readSidecar`), so first-match semantics are preserved. C's same-id issue is out of scope.

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js` — delete dead code + swap read path.
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.test.js` — add malformed-line regression test.
- Read-only: `tools/learning-loop-mastra/core/runtime-state.js:27-38` (`readRuntimeStateRows` — the shared helper being adopted).

## Implementation Steps (TDD)

**Tests Before**
1. Add a malformed-line regression test to `runtime-state-read-tool.test.js` (inside the existing `describe` block, reusing `mkdtempSync` + `GATE_ROOT` + `try/finally`). Write the sidecar directly (not via `setupSidecar`) to interleave a bad line: 3 valid rows + `"this is not json {{corrupt"` + a blank line. Assert the handler does NOT throw, `total === 3`, `count === 3`, `rows.map(r=>r.id) === ["vnstock-1","vnstock-2","vnstock-3"]` in file order. Run — expect FAIL (current `readSidecar` throws on `JSON.parse("this is not json {{corrupt")`).
2. Run the existing 6 tests — expect green (baseline pinned; confirms the swap will not regress valid-row behavior).

**Refactor**
3. In `runtime-state-read-tool.js`: delete `import { appendFileSync } from "node:fs"` (and `readFileSync`/`existsSync` if unused after — the whole `node:fs` import line goes away since `readSidecar` was the only fs user); delete `import { createHash } from "node:crypto"` (L4); delete `import { join } from "node:path"` (L3) IF grep confirms `join` is unused after `readSidecar` removal (it is only used in `readSidecar`); delete `const SIDECAR_FILENAME = "runtime-state.jsonl"` (L7); delete `function computeFingerprint` (L9-12); delete `function readSidecar` (L14-22).
4. Add `import { readRuntimeStateRows } from "../../core/runtime-state.js";`.
5. Replace `const rows = readSidecar(root);` (L51) with `const rows = readRuntimeStateRows(root);`.
6. Run the new malformed-line test + the existing 6 — expect all green.

**Tests After**
7. `pnpm test:one tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.test.js` — green (7 tests).
8. `pnpm exec vitest --changed` — green; no regression to dispatch/record tests.
9. Grep `computeFingerprint` in the read tool → zero (dead code gone); grep `readSidecar` in the read tool → zero.

**Regression Gate**
10. `pnpm test:iter` green.
11. `check_runtime_agnostic` on the read tool — passes (shim-not-fork; the shared helper is the canonical core; the read tool is a thin consumer).

**Finding resolution**
12. `meta_state_resolve({ id: "meta-260719T2145Z-runtime-state-read-diverges-from-the-shared-read-path-runtim", resolution: "runtime_state_read now uses the shared readRuntimeStateRows (core/runtime-state.js:27-38), which skips malformed lines instead of throwing; dead computeFingerprint + unused appendFileSync/createHash/SIDECAR_FILENAME/join imports removed. Malformed-line regression test added." })`.
13. `meta_state_log_change({ change_dimension: "mechanical", change_target: "tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js", change_diff: { removed: ["readSidecar", "computeFingerprint (dead)", "unused appendFileSync/createHash/SIDECAR_FILENAME/join imports"], added: ["import readRuntimeStateRows from core/runtime-state.js"] }, reason: "Converge runtime_state_read onto the shared read path (fixes crash-on-malformed) and remove dead code. Finding meta-260719T2145Z." })`.

## Success Criteria

- [ ] `runtime_state_read` skips a malformed line (no throw); `total`/`count` reflect only valid rows; valid rows returned in file order.
- [ ] Read tool imports `readRuntimeStateRows` from `core/runtime-state.js`; no `readSidecar`, no `computeFingerprint`, no unused `appendFileSync`/`createHash`/`SIDECAR_FILENAME`/`join`.
- [ ] Existing 6 read-tool tests stay green; new malformed-line test green.
- [ ] Finding B (`meta-260719T2145Z-...`) resolved via `meta_state_resolve`; change logged via `meta_state_log_change`.

## Risk Assessment

- **Existing tests break?** No — `setupSidecar` writes valid JSONL; `readRuntimeStateRows` parses valid lines identically to `readSidecar`. The compact-mode `fingerprint: "sha256:abc"` assertion (L82-91) still passes (both read paths return the stored `fingerprint` field as-is). Mitigation: baseline test run at step 2.
- **Consumer depends on throw-on-malformed?** No — grep `try.*runtime_state_read` / `catch.*runtime_state_read` → zero. The tool is invoked via MCP by agents; no code wraps it expecting a throw. Mitigation: the grep is part of the phase.
- **`join` import unused after swap?** Verify with grep before deleting; if `join` is referenced elsewhere in the handler (it is not — only `readSidecar` used it), keep the import. Low risk.
- **Scope creep into inbound-state.js / file-readers.js?** No — those are deferred (finding `meta-260719T2201Z-...`). This phase touches only the read tool + its test.
