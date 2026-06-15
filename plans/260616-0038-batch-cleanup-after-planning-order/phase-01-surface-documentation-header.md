---
phase: 1
title: "Surface documentation header"
status: pending
priority: P3
effort: "15m"
dependencies: []
---

# Phase 1: Surface documentation header

## Overview

Add a file-level JSDoc header to `core/surfaces.js` (item 1.2) that documents the surface-prefix contract, and tighten the `readModifyWriteOnAllSurfaces` function-level JSDoc to make the cross-surface atomicity caveat more prominent (item 4.3). No behavior change; documentation only.

## Cleanup items addressed

- **1.2** (Step 1, cosmetic) — No file-level JSDoc for `core/surfaces.js`.
- **4.3** (Step 4, design-doc) — `readModifyWriteOnAllSurfaces` cross-surface atomicity not prominent in JSDoc.

## Requirements

Functional: none (documentation only).
Non-functional: header is 5-10 lines; matches the file's existing JSDoc style (1-line module comment, per-export JSDoc).

## Architecture

Two edits to `tools/learning-loop-mcp/core/surfaces.js`:

1. **Lines 1-5** — replace the existing 1-line module comment with a 5-7 line file-level JSDoc that explains:
   - The helper is the single source of truth for cross-surface iteration.
   - To add a new runtime: append one entry to `SURFACES` (no other code changes).
   - The helper is parameterized for new surfaces (the cross-surface patterns stay the same).
   - Cross-surface atomicity is NOT a guarantee: per-surface operations are atomic; cross-surface consistency is the caller's responsibility.

2. **Lines 151-167** — the existing function-level JSDoc for `readModifyWriteOnAllSurfaces` already documents cross-surface atomicity in the "Atomicity" line. Tighten by:
   - Moving the atomicity caveat to the top of the JSDoc (before the parameter docs) so it's the first thing callers see.
   - Adding a one-line "WARNING" prefix to the atomicity line for grep-discoverability.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/surfaces.js:1-5` (file-level JSDoc)
- Modify: `tools/learning-loop-mcp/core/surfaces.js:151-167` (`readModifyWriteOnAllSurfaces` JSDoc)

## Implementation Steps

1. **Read** `tools/learning-loop-mcp/core/surfaces.js` (lines 1-5 and 151-167) to confirm the current JSDoc shape. (Done in plan research.)
2. **Edit** the file-level comment block (lines 1-5) to a 5-7 line JSDoc:

   ```js
   /**
    * Cross-surface helper — the single source of truth for runtime iteration.
    *
    * To add a new runtime (e.g. Cursor, Aider), append one entry to SURFACES.
    * No other code changes are required: every helper in this module iterates
    * SURFACES, so existing call sites pick up the new runtime automatically.
    *
    * Cross-surface atomicity: per-surface operations are atomic (write-temp +
    * rename for writes, single readFileSync for reads). Cross-surface
    * consistency is the caller's responsibility — there is no transaction
    * spanning surfaces.
    */
   ```

3. **Edit** `readModifyWriteOnAllSurfaces` JSDoc to move the atomicity line to the top, with a grep-discoverable `WARNING:` prefix:

   ```js
   /**
    * Per-surface read-modify-write with caller's modifier function.
    *
    * WARNING — atomicity: each surface is atomic (write-temp + rename).
    * Cross-surface consistency is the caller's responsibility; there is
    * NO transaction across surfaces. Callers that need cross-surface
    * atomicity must serialize calls (e.g. via a mutex) at a higher level.
    *
    * The modifier is called once per surface with the current parsed value
    * (or null if missing/malformed). The modifier returns the new value
    * (object to write, null/undefined to remove).
    *
    * @param {string} root
    * @param {string} subpath
    * @param {function} modifier — (currentValue) => newValue | null
    * @param {object} [options]
    * @param {boolean} [options.removeOnNull=false] — if true, modifier returning
    *   null/undefined DELETES the existing file. Default false: no-op (safer).
    * @returns {Array<{ surface, action: "wrote" | "removed" | "skipped" }>}
    */
   ```

4. **Verify** the file still parses and the existing test suite passes (`pnpm test -- surfaces`).

## Success Criteria

- [ ] `tools/learning-loop-mcp/core/surfaces.js` has a 5-7 line file-level JSDoc explaining the single-source-of-truth contract + cross-surface atomicity caveat.
- [ ] `readModifyWriteOnAllSurfaces` JSDoc starts with a `WARNING:` prefix on the atomicity line so `grep -n WARNING: core/surfaces.js` finds it.
- [ ] No behavior change; `pnpm test` shows 986/987 (1 skipped) — same as before this phase.
- [ ] File remains < 250 lines.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| File-level JSDoc is too long (file is 227 lines; the helper is mostly small functions) | Limit to 5-7 lines; match the existing terse style. |
| `WARNING:` prefix reads as alarmist | The atomicity caveat is a real, documented invariant; the prefix is for grep-discoverability, not alarm. Document in the JSDoc itself that the WARNING is for visibility. |
