---
phase: 1
title: "Consolidate runtime-state read paths (B-widening)"
status: pending
priority: P2
effort: "4h"
dependencies: []
---

# Phase 1: Consolidate runtime-state read paths (B-widening)

## Overview

Resolve finding `meta-260719T2201Z-three-own-parse-copies-of-the-runtime-state-jsonl-read-path` by
consolidating the two remaining own-parse copies of the `runtime-state.jsonl` read path onto the
shared `readRuntimeStateRows` (`core/runtime-state.js:27-38`) introduced by plan 260719-2201. TDD:
write the behavior-change tests first (red), swap the reads (green), then confirm no own-parse
remains.

## Requirements

- **Functional**
  - `core/inbound-state.js` imports `readRuntimeStateRows` from `./runtime-state.js` and no longer
    defines a local `readSidecar`. A single malformed line is skipped; valid rows are returned
    (previously: one malformed line wiped the whole read to `[]`).
  - `core/file-readers.js` `readRuntimeObservations` calls `readRuntimeStateRows` for the parse and
    keeps the existing projection (status filter → `assertinvariantSync` lookup → constraint
    mapping). A `null` line no longer crashes the projection to `[]`.
- **Non-functional**
  - No behavior change to the happy path (all-valid sidecar) — both copies already produce the same
    rows as `readRuntimeStateRows` when every line is valid JSON.
  - No new imports beyond `readRuntimeStateRows`; remove now-unused `readFileSync`/`existsSync`
    imports from `inbound-state.js` only if nothing else in the file uses them (`readLastOperatorMessage`
    still uses `readFileSync` via `readFromAllSurfaces`, so only `existsSync` is a candidate — verify
    before removing).
  - **Two behavior changes are acknowledged and pinned by red tests** (red-team F3/S1, F5, S7):
    (a) the inbound-gate staleness flip, (b) the **bash-gate constraint-match flip** —
    `readRuntimeObservations` is also consumed by `evaluate-bash-gate.js:73` before the staleness
    check, so a malformed+valid sidecar flips a constraint command from `hard_block` to `ok`.

## Architecture

`readRuntimeStateRows(root)` (shared) reads `runtime-state.jsonl`, splits on `\n`, drops empty
lines, `JSON.parse` per line into `null` on throw, `.filter(Boolean)`. The two consumers:

1. `inbound-state.js#checkObservationStaleness` uses the sidecar to find the latest non-meta entry
   per `affected_system` (L129-149). It currently lazy-caches via `getSidecar()` → `readSidecar`.
   Swap the cache to call `readRuntimeStateRows`. **Behavior change:** malformed lines no longer
   wipe the read; a previously-stale result (`matching.length === 0` because `[]`) flips to
   not-stale when valid rows exist.
2. `file-readers.js#readRuntimeObservations` (L41-122) reads + projects. Replace the read+parse
   block (L44-54) with `const rows = readRuntimeStateRows(resolvedRoot);` then iterate `rows` for
   the projection. **Keep the outer `try/catch` (L44/118)** as defensive: verified that
   `assertinvariantSync` (`operation-invariant.js:121-128`) cannot throw — it validates `root`
   upfront and returns `{ok:false, reason}` on bad root; the `operation` lambda only does property
   access on primitives (returns `undefined`, not throws). The outer try/catch is therefore
   dead-but-defensive — keep it (a future projection-body throw on a row shape that passed
   `.filter(Boolean)` but is missing fields would otherwise propagate uncaught into the bash/inbound
   gate). A missing file returns `[]` from the shared helper (no throw).
3. **bash-gate consumer (red-team F3/S1):** `evaluate-bash-gate.js:73` calls
   `readRuntimeObservations(resolvedRoot)` → `checkObservationExists(constraintMatch, observations)`
   → `makeGateDecision` BEFORE the staleness check. Today a malformed line wipes to `[]` →
   `checkObservationExists` returns `{found:false}` → `hard_block`. After the swap, a surviving
   valid row matching the constraint's `affected_system` flips the decision to `ok` (or `escalate`
   via staleness). This is a security-relevant behavior change — pinned by a red test.

The third v1-fingerprint copy at `scripts/convert-ledger-to-sidecar.mjs:24` is left as-is
(historical, idempotent, untested) — already documented in the 260719-2201 report.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/inbound-state.js` (delete `readSidecar` L14-30; import +
  use `readRuntimeStateRows`; prune unused `existsSync` if no other caller — `readLastOperatorMessage`
  still uses `readFileSync` via `readFromAllSurfaces`).
- Modify: `tools/learning-loop-mastra/core/file-readers.js` (swap read+parse block to
  `readRuntimeStateRows`; **keep the outer try/catch** as defensive — see Architecture; keep
  projection body unchanged).
- Audit: `tools/learning-loop-mastra/core/evaluate-bash-gate.js:73-76` (the second consumer of
  `readRuntimeObservations` — red-team F3/S1; no code change, but the behavior flip is pinned by a
  test and documented in the bash-gate test file).
- Test (new cases): `tools/learning-loop-mastra/__tests__/legacy-mcp/inbound-state-runtime-state.test.js`.
- Test (new cases): `tools/learning-loop-mastra/__tests__/legacy-mcp/file-readers-unmapped-active-entry.test.js`
  (or a sibling `file-readers-malformed-line.test.js` if the existing file's scope is narrow).
- Test (new cases): a bash-gate constraint-match test — add to an existing
  `evaluate-bash-gate*.test.js` or a new sibling, asserting the block→ok flip on a malformed+valid
  sidecar.

## Implementation Steps

1. **Red — inbound-state:** add a test: sidecar with one malformed line + one valid fresh
   `affected_system:"vnstock"` row + a non-meta observation whose `affected_system` matches. Assert
   `checkObservationStaleness` returns `{ stale: false }` (valid row seen, not wiped). Add a second
   test: malformed line alone → still `{ stale: true }` with reason `"No runtime-state entry..."`
   (no valid rows → `matching.length === 0`). Confirm both fail on current code (malformed wipes →
   stale in both cases).
2. **Red — file-readers:** add a test: sidecar with a `null` line (`"null"`) + one valid active
   `vnstock` row → `readRuntimeObservations` returns the vnstock observation (not `[]`). Add a
   malformed-line test: one bad line + one valid row → returns the valid projection. Confirm red
   on current code (`null` line trips outer catch → `[]`).
3. **Red — bash-gate (F3/S1):** add a test: malformed line + one valid active `vnstock` row + a
   bash command matching a `vnstock` constraint pattern → assert `evaluateBashGate` decision flips
   from `hard_block` (today, wipe→no observation) to non-block after the swap. Pin the exact
   post-swap decision (block via staleness escalation if the surviving row is older than the
   operator marker; `ok` if fresh). Confirm red on current code.
4. **Red — corruption-masking (S7):** add a test: a fresh **malformed (corrupted) latest row** + an
   older valid row whose `timestamp > markerTime` → assert the gate's decision/reason. Decide the
   accepted trade-off at implementation time: either (a) document that corruption-masking is
   accepted and the `skippedMalformed` count is not surfaced, or (b) return a `{rows,
   skippedMalformed}` envelope from `readRuntimeStateRows` so `checkObservationStaleness` can emit a
   "sidecar corruption detected" escalation. Default to (a) unless the operator chooses (b); pin
   the chosen behavior in the test.
5. **Red — timestamp-missing (F5):** add a test: malformed line + a valid row **missing
   `timestamp`** → assert no exception is thrown and the new reason string is `"Sidecar may be
   stale"` (not the old `"No runtime-state entry..."`). Pin the reason text so downstream
   reason-text assertions update in the same commit.
6. **Green — inbound-state:** import `readRuntimeStateRows` from `./runtime-state.js`; delete
   `readSidecar`; point `getSidecar` at the shared helper. Run `pnpm test:one` on the inbound-state
   test file → green.
7. **Green — file-readers:** replace the read+parse block with `const rows =
   readRuntimeStateRows(resolvedRoot); for (const entry of rows) { ...projection... }`. Keep the
   projection body + outer try/catch unchanged. Run `pnpm test:one` on the file-readers test → green.
8. **Cleanup:** prune unused `existsSync` from `inbound-state.js` (verify `readFileSync` is still
   used by `readLastOperatorMessage` via `readFromAllSurfaces` before deciding). Fix the stale path
   comment in `file-readers.js:17` (`tools/learning-loop-mcp/` → `tools/learning-loop-mastra/`).
9. **Verify (targeted grep — red-team A4):** `grep -n "readSidecar" core/inbound-state.js` → 0
   matches; `grep -n "readRuntimeStateRows" core/inbound-state.js core/file-readers.js` → present.
   Do NOT use bare `JSON.parse` as the signal — `inbound-state.js:55` parses the gate marker, not
   the sidecar, and would false-match. `pnpm exec vitest --changed` green. `pnpm test` green.

## Success Criteria

- [ ] `readSidecar` absent from `core/inbound-state.js`; `readRuntimeStateRows` imported by both
  `core/inbound-state.js` and `core/file-readers.js` (targeted grep, not bare `JSON.parse`).
- [ ] Inbound-state malformed-line test: valid row survives (not total-loss).
- [ ] File-readers `null`-line test: projection survives (not wiped to `[]`).
- [ ] Bash-gate constraint-match test pins the block→non-block flip on a malformed+valid sidecar.
- [ ] Corruption-masking test (S7) + timestamp-missing test (F5) pin the chosen/observed behavior.
- [ ] Happy-path unchanged: all-valid sidecar produces identical results in both consumers.
- [ ] `pnpm test` green.

## Risk Assessment

- **Staleness flip** (medium): the inbound-gate may stop flagging a sidecar as stale when it
  previously wiped to `[]`. This is more correct but is a behavior change. Mitigation: the red test
  pins the new behavior explicitly; audit `evaluate-inbound-gate` tests for any assertion on the
  old wipe-to-`[]` semantics.
- **Bash-gate constraint-match flip** (high, red-team F3/S1): a malformed line + one surviving
  valid row matching a constraint's `affected_system` flips a previously-blocked command to `ok`.
  This is security-relevant — an attacker who can corrupt one line of `runtime-state.jsonl` could
  flip a constraint gate from block to allow. Mitigation: the bash-gate red test pins the exact
  post-swap decision; if the surviving row is stale relative to the operator marker, the gate still
  escalates. Document the flip in `docs/architecture.md` § Inbound State Gate if user-facing.
- **Corruption-masking** (medium, red-team S7): a corrupted latest row is skipped and an older
  valid row may satisfy freshness, silently ignoring corruption. Mitigation: decide at
  implementation time whether to surface `skippedMalformed` (envelope) or accept the trade-off; pin
  the choice in a test.
- **Reason-string drift** (low, red-team F5): the timestamp-missing case changes the staleness
  reason string. Mitigation: pin the new string in a test; update any downstream reason-text
  assertions in the same commit.
- **Unused-import removal** (low): removing an import still transitively used breaks the build.
  Mitigation: grep before removing; `pnpm test` catches it.