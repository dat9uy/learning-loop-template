---
phase: 1
title: "core/surfaces.js helper — the foundational cross-surface API"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: core/surfaces.js helper

## Overview

Create `tools/learning-loop-mcp/core/surfaces.js` — the single source of truth for what runtimes the loop supports, plus the API for code that needs to read or write surface coordination paths. The helper is parameterized: a future runtime (Cursor, Aider) adds itself by appending one entry to `SURFACES`. No other code changes required.

This is **greenfield** with **TDD**: tests are written first, the implementation follows.

## Requirements

Functional:
- Export `SURFACES` as a frozen `const` array of surface directory names (current: `[".claude", ".factory"]`).
- Export `getAllCoordinationPaths(subpath)` — returns the coordination-relative paths for a subpath across all surfaces.
- Export `writeToAllSurfaces(root, subpath, content)` — atomic write (write-temp + rename) to all surface coordination directories; missing directories are created.
- Export `readFromAllSurfaces(root, subpath, options = {})` — reads from all surface coordination directories. Default returns `{ surface, content, parsed }[]` for all surfaces. `options.first: true` returns the first non-null parsed result (the marker-read pattern).

Non-functional:
- Pure ESM (`export`); no CommonJS, no transitive `node:fs`/`node:path` in the public surface.
- < 100 lines including JSDoc.
- No I/O outside `readFromAllSurfaces` and `writeToAllSurfaces` (the path helpers are pure).
- Fail-quiet on per-surface errors (read: missing file is empty; write: best-effort per surface, log on failure).

## Architecture

```js
// tools/learning-loop-mcp/core/surfaces.js
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** The canonical set of supported runtimes. Append a new runtime here. */
export const SURFACES = Object.freeze([".claude", ".factory"]);

/** All coordination-relative paths for a given subpath across all surfaces. */
export function getAllCoordinationPaths(subpath) {
  return SURFACES.map((s) => `${s}/coordination/${subpath}`);
}

/** Atomic write to all surface coordination directories. */
export function writeToAllSurfaces(root, subpath, content) { /* ... */ }

/** Read from all surface coordination directories. options.first returns the first hit. */
export function readFromAllSurfaces(root, subpath, options = {}) { /* ... */ }
```

The helper is the API for cross-surface iteration; it is the ONLY place surface prefixes appear in `core/`. Phases 2 and 3 consume it; Report 1 Plan 1 and Report 2 Phases 2-5 consume it later.

## Related Code Files

- Create: `tools/learning-loop-mcp/core/surfaces.js` (~80 lines including JSDoc).
- Create: `tools/learning-loop-mcp/__tests__/surfaces.test.js` (~120 lines, 8-10 tests).
- No modifications to other files in this phase.

## Implementation Steps (TDD)

1. **Red — write the test file first.** Create `tools/learning-loop-mcp/__tests__/surfaces.test.js` with:
   - `test("SURFACES is frozen and equals [.claude, .factory]")` — asserts the constant is the single source of truth and is immutable.
   - `test("getAllCoordinationPaths maps each surface to <surface>/coordination/<subpath>")` — pure function, no I/O.
   - `test("writeToAllSurfaces creates directories and writes content to all surfaces")` — uses `os.tmpdir()` + a unique scratch dir; asserts both `.claude/coordination/<subpath>` and `.factory/coordination/<subpath>` exist with identical content.
   - `test("writeToAllSurfaces is atomic (write-temp + rename)")` — asserts no `.<name>.tmp` file remains after a successful write.
   - `test("readFromAllSurfaces returns parsed content for each surface")` — writes markers to all surfaces, asserts the array shape `{ surface, content, parsed }[]`.
   - `test("readFromAllSurfaces({ first: true }) returns the first hit, skipping missing")` — writes to one surface only; asserts the existing surface wins.
   - `test("readFromAllSurfaces returns [] for a subpath that doesn't exist on any surface")` — fail-quiet contract.
   - `test("readFromAllSurfaces skips surfaces with malformed JSON")` — writes garbage to one surface; asserts the other surface wins when `first: true`.
   - `test("readFromAllSurfaces never throws on per-surface errors")` — malformed JSON, missing files, permission-style errors (chmod 000 if portable) all resolve to `[]` or `{ content: null }`.
2. **Run tests; confirm RED.** `pnpm test -- surfaces` — all 9 tests fail with "Cannot find module '../core/surfaces.js'".
3. **Green — implement the helper.** Create `core/surfaces.js` per the architecture above. Re-run the tests; all 9 pass.
4. **Refactor — JSDoc + final pass.** Add JSDoc with `@example` for each export. Confirm the file is < 100 lines. Confirm no other `core/` file imports from it yet (this phase ships no callers).
5. **Whole-plan consistency check.** `grep -n "import.*surfaces" tools/learning-loop-mcp/core/` — expect 0 hits. The helper exists; nobody imports it yet. That's expected — Phases 2 and 3 introduce the importers.

## Success Criteria

- [ ] `tools/learning-loop-mcp/core/surfaces.js` exists; exports `SURFACES`, `getAllCoordinationPaths`, `writeToAllSurfaces`, `readFromAllSurfaces`.
- [ ] `SURFACES` is `Object.freeze`-d and equals `[".claude", ".factory"]`.
- [ ] `tools/learning-loop-mcp/__tests__/surfaces.test.js` exists with 9+ passing tests.
- [ ] File is < 100 lines (JSDoc included).
- [ ] No other `core/` file imports the helper yet (this phase ships no callers).
- [ ] `pnpm test` shows 0 new failures across the existing 840+ tests.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Atomicity requirement (write-temp-then-rename) is more than needed for a foundation helper | Lock the requirement now — once Report 1's marker files use it, changing the contract is breaking. The 8 lines of `mkdirSync(dirname(...)); writeFileSync(tmp); renameSync(tmp, real)` are small. |
| `SURFACES` exported as `const` array (not function) means future tests cannot monkey-patch | Acceptable — the helper is parameterized for new SURFACES (append), not for swapping at test time. Tests for callers can use `mkdirSync` + real surface dirs in tmp. |
| `readFromAllSurfaces` returns either array or first-hit depending on `options.first` — dual API is non-obvious | JSDoc `@example` covers both shapes; both call sites (Phase 3, Report 1's recurrence tracker) are documented in the plan. |
| Tests for malformed JSON require writing a file with bad bytes — flaky on some filesystems | Use `writeFileSync(path, "not json {")` (a plain string); assert the malformed surface is skipped. No chmod tricks. |

## Security Considerations

- The helper reads files in user-controlled paths under `root`. No path traversal beyond `join(root, surface, "coordination", subpath)` — `subpath` is treated as a relative path, never resolved against the surface's real location.
- `readFromAllSurfaces` swallows per-surface errors. A future adversarial marker (e.g., a 10GB file in `.factory/coordination/`) would still be `readFileSync`'d. Mitigated by the marker file convention (small, well-known shapes); a future hardening phase can add a size cap.
- No execution: the helper is pure file I/O. No `eval`, no `Function`, no shell-out.

## Next Steps

Phase 2: refactor `GLOB_SCOPE_WHITELIST` to use `SURFACES` (fixes the missing `.claude/` asymmetry).
Phase 3: refactor `readLastOperatorMessage` to use `readFromAllSurfaces` (DRYs the inline cross-surface iteration).
