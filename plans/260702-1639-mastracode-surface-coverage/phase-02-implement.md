---
phase: 2
title: "Source Migration"
status: pending
effort: P2
dependencies: [1]
---

# Phase 2: Source Migration

## Overview

Migrate the 5 source files off the hard-coded 2-surface list so they cover
`.mastracode` automatically via `SURFACES`. Each file gets its own site-by-site
edit; do not assume "same change, N sites" — that is exactly the failure mode
the Plan 5-Lite journal caught at 6-of-7.

## Requirements

- Functional: cross-surface I/O reaches `.mastracode` via `SURFACES` or the
  `surfaces.js` helpers, not a literal array. Test-override env hooks
  (`GATE_MARKER_PATH`, `GATE_COORD_DIR`) preserved exactly.
- Non-functional: no new helper, no new abstraction. Reuse `SURFACES`,
  `writeToAllSurfaces`, and existing `writePreflightMarker`/`readPreflightMarker`
  signatures. Public contracts unchanged.

## Architecture

`SURFACES` (`core/surfaces.js`) is the single source of truth; every helper
already iterates it. The migrations fall into 3 shapes:

1. **Loop → helper:** `inbound-gate.js` replaces its hand-rolled
   `for (const dir of [".claude",".factory"])` with `writeToAllSurfaces`.
2. **Literal array → `SURFACES.map`:** `mark-preflight-complete-tool.js` derives
   `coordDirs` from `SURFACES`.
3. **Regex literals → extended literals:** `evaluate-bash-gate.js`
   `PATH_WRITE_PATTERNS` adds 2 `.mastracode` literals (regex can't derive from
   `SURFACES`).
4. **Constant array → 3 entries:** `runtime-agnostic-checklist.js` `SHIM_DIRS`.
5. **Comment-only:** `gate-override.js`.

## Related Code Files

- Modify: `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js`
- Modify: `tools/learning-loop-mastra/tools/legacy/mark-preflight-complete-tool.js`
- Modify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js`
- Modify: `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js`
- Modify: `tools/learning-loop-mastra/core/gate-override.js` (comment only)

## Implementation Steps

### 2.1 `inbound-gate.js` (loop → helper)

1. Import `writeToAllSurfaces` from `../../core/surfaces.js`.
2. In `writeOperatorMessageMarker`, keep the `GATE_MARKER_PATH` single-path branch
   unchanged (test override).
3. Replace the `for (const dir of [".claude", ".factory"])` block with:
   ```js
   writeToAllSurfaces(root, ".last-operator-message", JSON.stringify(marker, null, 2));
   ```
   `writeToAllSurfaces` writes to `${surface}/coordination/${subpath}` for every
   `SURFACES` entry and swallows per-surface errors — matching the current
   `catch {}` semantics.
4. Remove the now-unused `mkdirSync`/`writeFileSync`/`renameSync`/`join`/`dirname`
   imports only if nothing else in the file uses them (check `main()` and the
   `GATE_MARKER_PATH` branch — the latter still uses `mkdirSync`/`dirname`/
   `writeFileSync`/`renameSync`, so keep them).

### 2.2 `mark-preflight-complete-tool.js` (array → SURFACES.map)

1. Import `SURFACES` and `join` from `../../core/surfaces.js` and `node:path`
   (note: `resolveRoot` already imported from `#lib/resolve-root.js`).
2. Replace the `coordDirs` ternary:
   ```js
   const coordDirs = process.env.GATE_COORD_DIR
     ? [process.env.GATE_COORD_DIR]
     : SURFACES.map((s) => join(root, s, "coordination"));
   ```
   `GATE_COORD_DIR` test override preserved (single-dir).
3. The `for (const coordDir of coordDirs)` loop and its
   `writePreflightMarker`/`readPreflightMarker` calls are unchanged — they
   already take a `coordDir` arg.
4. `marker` is assigned in the loop and read after it; with 3 iterations the
   final value is the last surface's marker. All surfaces write the same
   `completed_at` (same `Date` inside `writePreflightMarker`? — verify in
   `gate-logic.js:389` that `completed_at` is set per-call; if it differs per
   surface, the returned `marker` is still valid for the audit log since all are
   valid markers). Keep current semantics; do not refactor the loop.
5. Update the tool `description` text: "stored in `.claude/coordination/` (or
   `.factory/coordination/` for Droid CLI)" → generalize to "stored in each
   runtime's `coordination/` dir (`.claude`, `.factory`, `.mastracode`)".

### 2.3 `evaluate-bash-gate.js` (regex literals)

1. In `PATH_WRITE_PATTERNS`, after the `.factory` pair (lines ~34-35), add the
   `.mastracode` pair:
   ```js
   />{1,2}\s*["']?\.?\/?\.mastracode\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
   /\btee\b.*["']?\.?\/?\.mastracode\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
   ```
2. Update the comment on line 26: "cover both .claude and .factory surfaces" →
   "cover all three surfaces (.claude, .factory, .mastracode)".
3. The existing `SURFACES` import stays (the test-invariant comment on lines 18-22
   explains why; do not remove it). Regex literals cannot be derived from
   `SURFACES` at module load without a `new RegExp` construction that would
   break the `fallow-ignore-next-line unused-export` and the literal-test
   expectations — keep them as literals.
4. **Important:** R2 gates MCP tool writes independently of this bash gate
   (per the doc). The bash gate is defense-in-depth for shell redirects; adding
   the `.mastracode` literals keeps that depth consistent across surfaces.

### 2.4 `runtime-agnostic-checklist.js` (SHIM_DIRS + text)

1. Extend `SHIM_DIRS` (line 11):
   ```js
   const SHIM_DIRS = [
     ".claude/coordination/hooks",
     ".factory/coordination/hooks",
     ".mastracode/coordination/hooks",
   ];
   ```
2. The `shims-in-sync` `verify` function (line 152) destructures
   `const [claudeShim, factoryShim] = SHIM_DIRS.map(...)` — this hard-coded
   2-element destructure will silently drop the 3rd dir. Rewrite it to iterate
   all `SHIM_DIRS`:
   ```js
   const shimPaths = SHIM_DIRS.map((d) => join(root, d, shimName));
   const exists = shimPaths.map(existsSync);
   for (const [i, p] of shimPaths.entries()) {
     if (!exists[i]) issues.push(`${SHIM_DIRS[i]}/${shimName}`);
   }
   if (exists.every(Boolean)) {
     const hashes = shimPaths.map((p) =>
       createHash("sha256").update(readFileSync(p, "utf8")).digest("hex"));
     if (!hashes.every((h) => h === hashes[0])) {
       issues.push(`${shimName} (hashes differ across surfaces)`);
     }
   }
   ```
   This removes the `[claudeShim, factoryShim]` naming but is the minimal change
   that actually checks all surfaces.
3. Update the `shims-in-sync` `description` (line 151) and `fix_suggestion`
   (line 179) text from "both .claude and .factory" to "all surfaces (.claude,
   .factory, .mastracode)".
4. Do **not** touch the other 5 checklist items or `stripCommentsAndStrings`.

### 2.5 `gate-override.js` (comment only)

1. Line 28: "Iterates SURFACES in order (.claude, .factory)" → "Iterates SURFACES
   in order (.claude, .factory, .mastracode)".
2. Line 54: ".claude falls through to a valid marker on .factory (and vice
   versa)" → generalize to "an expired/malformed marker on one surface falls
   through to a valid marker on another".
3. No logic change — `readGateOverride` already iterates `SURFACES`.

## Success Criteria

- [x] `inbound-gate.js` uses `writeToAllSurfaces`; `GATE_MARKER_PATH` branch
  unchanged; no unused imports left.
- [x] `mark-preflight-complete-tool.js` derives `coordDirs` from `SURFACES.map`;
  `GATE_COORD_DIR` branch unchanged.
- [x] `evaluate-bash-gate.js` has `.mastracode` preflight-marker literals for
  both `>` and `tee` forms.
- [x] `runtime-agnostic-checklist.js` `SHIM_DIRS` has 3 entries and
  `shims-in-sync` verifies all 3 (no 2-element destructure).
- [x] `gate-override.js` comments mention all surfaces; logic untouched.
- [x] `grep -rn '\.claude.*\.factory' tools/learning-loop-mastra/{core,hooks,tools}`
  (excluding tests, `surfaces.js`, and comments) returns nothing for cross-surface
  I/O.

## Risk Assessment

- **2-element destructure silent drop (2.4 step 2):** the highest-risk edit.
  If `SHIM_DIRS` is extended but the `verify` body keeps
  `const [claudeShim, factoryShim] = SHIM_DIRS.map(...)`, the 3rd dir is silently
  ignored — green tests, false coverage, exactly the journal's "6-of-7" pattern.
  Mitigation: rewrite the destructure to iterate; add a Phase 3 test that fails
  if `.mastracode` shim is missing.
- **`completed_at` divergence in 2.2:** if `writePreflightMarker` stamps
  `completed_at` per call, 3 surfaces get 3 timestamps and the returned `marker`
  is the last one. The audit log records one `marker_created_at`. This is
  pre-existing behavior for the 2-surface case (already returns the 2nd); going
  to 3 does not change the semantic. Verify in `gate-logic.js:389` and document
  if needed; do not refactor.
- **Regex literal vs constructed:** building `PATH_WRITE_PATTERNS` from `SURFACES`
  via `new RegExp(...)` would be DRYer but breaks the literal-based test
  expectations and the `fallow` unused-export guard. Keep literals; the
  `evaluate-bash-gate.js` SURFACES import comment already justifies the
  non-derivation. Adding a 4th runtime would require another literal —
  acceptable cost, documented in the comment.
- **Import-path depth:** `inbound-gate.js` is in `hooks/legacy/`, so surfaces.js
  is `../../core/surfaces.js`. `mark-preflight-complete-tool.js` is in
  `tools/legacy/`, same `../../core/surfaces.js` depth. Verify both resolve
  (they match the existing `../../core/gate-logic.js` import in
  `mark-preflight-complete-tool.js`).