---
phase: 4
title: "B2-2 Wire patch tool to derived schema + migration of 1 live wrap site"
status: completed
priority: P1
effort: "45min"
dependencies: ["phase-03-b2-1-codegen-build-patch-schema"]
---

# Phase 4: B2-2 Wire patch tool to derived schema + migration of 1 live wrap site

## Overview

Two parts in this phase:

1. **Wire the patch tool to the derived schema**: Replace the passthrough `z.object({}).passthrough()` in `meta_state_patch`'s `patch` field with a per-kind union built from `buildPatchSchemaFor`. The 2 RED tests from Phase 2 (wrapped input rejection) turn green.

2. **Migrate the 1 live wrap site** at `meta-state.jsonl:21` (`loop-design-instruction-layer.proposed_design_for`, 1-deep `{item: [4 valid refs]}`) BEFORE the 9 reader-patch reverts in Phase 5. The migration uses a single `enqueue` task with all updates in one read-modify-write cycle.

The migration lands in Phase 4 (not Phase 6) because the reverts in Phase 5 change `core/loop-introspect.js:351-355` to strict-read `design.proposed_design_for` directly; if the live data is still wrapped, the strict reader sees a non-array and silently skips. The migration must land first.

## Requirements

- Functional: `meta_state_patch` accepts a per-kind `patch` object; the derived schema validates per-kind fields with strict types
- Functional: 2 RED stdio tests from Phase 2 (B2-0) turn green; 1 regression guard stays green
- Functional: live `meta-state.jsonl` has 0 wrap sites after this phase
- Non-functional: minimal diff in `meta-state-patch-tool.js` (~5 lines)
- Non-functional: migration uses a single inline `enqueue` task (one read-modify-write cycle)

## Architecture

**Part 1 — Tool wiring:** the patch tool's input schema becomes:
- `id: z.string()` (unchanged)
- `entry_kind: z.enum([...])` (unchanged; the discriminator)
- `patch: <per-kind union>` (REPLACED)
- `_expected_version: z.number().optional()` (unchanged)

The `patch` field is computed at module load: `z.union(PATCH_KINDS.map((k) => buildPatchSchemaFor(k)))`. This is a single expression in the schema block; no precomputed export from `core/meta-state.js`. The 4 `.partial().strict()` schemas together reject any field not in any per-kind shape (closes the `__proto__` / typo pollution path).

**Part 2 — Migration:** the live wrap at `meta-state.jsonl:21` is flattened. The migration is a one-shot Node command (per the brainstorm §3 B2-4: "10-line inline node command"). It imports `updateEntry` from `core/meta-state.js` and runs the flatten in a single `enqueue` task. The CAS retry behavior matches `fix-loop-design-refs.mjs:59-63` (warn-and-skip on `version_mismatch`).

**Why the migration lives in Phase 4, not Phase 6:** Phase 5 commit 1 reverts `core/loop-introspect.js:351-355` to read `design.proposed_design_for` directly. With the wrap still in the registry, the strict reader sees an object, `Array.isArray` is false, `refs.length` is undefined, the loop never executes, and `coverage.broken_refs` silently drops to 0. The migration must flatten the data before any Phase 5 revert. The Phase 4 ordering is: (a) wire tool to derived schema, (b) run migration, (c) `pnpm test` green, (d) move to Phase 5.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (~5 lines: import `buildPatchSchemaFor` + `PATCH_KINDS`, replace passthrough with computed union)
- **Read (for the per-kind schemas):** `tools/learning-loop-mcp/core/meta-state.js#buildPatchSchemaFor` (added in Phase 3)
- **Read (for the migration primitive):** `tools/learning-loop-mcp/core/meta-state.js#updateEntry` + `#enqueue` (line 263)
- **Read (for the existing handler):** `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (whole file; ~130 lines)

## Implementation Steps

### Part 1: Wire the tool

1. **Open** `tools/learning-loop-mcp/tools/meta-state-patch-tool.js`
2. **Update** the import from `core/meta-state.js` to include `buildPatchSchemaFor` and `PATCH_KINDS`:
   ```js
   import { readRegistry, updateEntry, buildPatchSchemaFor, PATCH_KINDS } from "#mcp/core/meta-state.js";
   ```
3. **Replace** line 28:
   - Before: `patch: z.object({}).passthrough().describe("...")`
   - After: `patch: z.union(PATCH_KINDS.map((k) => buildPatchSchemaFor(k))).describe("Partial fields to update. Per-kind fields are strictly typed (.partial().strict(): all fields optional, no unknown keys). Identity and audit-trail fields (id, version, created_at, code_fingerprint, etc.) are denied at the handler. The 4 per-kind shapes derive from core/meta-state.js#metaStateEntrySchema's 4 branches via buildPatchSchemaFor; any schema drift in those branches is reflected here automatically.")`
4. **Verify** the existing handler at line 33 onward:
   - The destructured `patch` is now a strictly-typed union parse result; no handler change needed
   - The `IMMUTABLE_PATCH_FIELDS` check at line 62 still works (denies identity fields regardless of kind)
   - The `updateEntry` call at line 81 passes the patch through to `core/meta-state.js#updateEntry` which uses `metaStateEntryPatchSchema` (still passthrough — see "Documented gap" below)

5. **Add `__proto__` / `constructor` defense** at `core/meta-state.js:376-378`:
   ```js
   const cleanPatch = { ...patch };
   delete cleanPatch._expected_version;
   delete cleanPatch.__proto__;    // .strict() does NOT reject __proto__ via JSON.parse
   delete cleanPatch.constructor;  // defense-in-depth
   Object.assign(entry, cleanPatch);
   ```
   - This is a 2-line addition. `.strict()` does NOT reject `__proto__` via `JSON.parse` (JS engine absorbs it into prototype chain before Zod sees it — runtime-verified by the red-team).

6. **Documented gap: `metaStateEntryPatchSchema` at `core/meta-state.js:246` stays passthrough for B1-B2**:
   - `scripts/fix-loop-design-refs.mjs:55-58` passes `{_expected_version, ...patch}` to `updateEntry`.
   - `scripts/backfill-mechanism-check.mjs:79` passes `{mechanism_check: true, code_fingerprint: fingerprint, _expected_version}` (3 non-schema fields).
   - The Phase 4 migration script (one-shot, step 7 below) passes `{_expected_version, ...patch}`.
   - The passthrough accepts all. A strict-typed intersection would reject them.
   - **Decision:** the passthrough stays for B1-B2. The tool-level derived schema is the FIRST line of defense; the `updateEntry` passthrough is the SECOND (for script callers). Both must succeed for the patch to land.
   - **B5 (deferred) cleanup:** if B5 expands `buildPatchSchemaFor` to the full per-kind + extra-fields intersection, it must account for `_expected_version`, `mechanism_check`, AND `code_fingerprint` — not just `_expected_version`.

### Part 2: Migration of 1 live wrap site

6. **Pre-state check** (run before the migration):
   ```sh
   node -e "const lines = require('fs').readFileSync('meta-state.jsonl', 'utf8').split('\n').filter(l => l.trim()); let wrap = 0; for (const l of lines) { const e = JSON.parse(l); for (const k of ['proposed_design_for', 'addresses']) { const v = e[k]; if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.item)) wrap++; } } console.log('wrap sites:', wrap);"
   ```
   - Expected output: `wrap sites: 1` (only `loop-design-instruction-layer:21`)
   - If different, STOP and re-investigate before migrating.

7. **Run** the migration (one-shot inline node command, not a permanent file):
   ```sh
   node --input-type=module -e "
   import { readRegistry, updateEntry } from './tools/learning-loop-mcp/core/meta-state.js';
   import { resolveRoot } from './tools/lib/resolve-root.js';
   // GATE_ROOT guard: abort if set (e.g. after pnpm test) to avoid targeting wrong directory
   if (process.env.GATE_ROOT) { console.error('GATE_ROOT is set to', process.env.GATE_ROOT, '-- aborting migration'); process.exit(1); }
   const root = resolveRoot();
   const entries = readRegistry(root);
   let migrated = 0;
   for (const e of entries) {
     if (e.entry_kind !== 'loop-design') continue;
     const pd = e.proposed_design_for;
     const ad = e.addresses;
     const pdFlat = Array.isArray(pd) ? null : (pd && Array.isArray(pd.item) ? pd.item : null);
     const adFlat = Array.isArray(ad) ? null : (ad && Array.isArray(ad.item) ? ad.item : null);
     if (pdFlat === null && adFlat === null) continue;
     const patch = {};
     if (pdFlat !== null) patch.proposed_design_for = pdFlat;
     if (adFlat !== null) patch.addresses = adFlat;
     patch._expected_version = e.version ?? 0;
     const r = await updateEntry(root, e.id, patch);
     if (r === 'version_mismatch') { console.warn('CAS mismatch for', e.id); continue; }
     if (r !== true) { console.warn('update failed for', e.id, r); continue; }
     migrated++;
     console.log('migrated', e.id, '(proposed_design_for:', pdFlat ? pdFlat.length : 'unchanged', 'addresses:', adFlat ? adFlat.length : 'unchanged', ')');
   }
   console.log('Total migrated:', migrated);
   "
   ```
   - This runs the migration as a one-shot. The `updateEntry` call lands in the per-root `enqueue` queue (`core/meta-state.js:263-272`), which serializes against any concurrent writers.
   - On `version_mismatch`, warn-and-skip (same as `fix-loop-design-refs.mjs:59-63`).

8. **Post-state check** (run after the migration):
   - Same pre-state check command. Expected output: `wrap sites: 0`.

9. **Verify** the migrated entry:
   ```sh
   node -e "const lines = require('fs').readFileSync('meta-state.jsonl', 'utf8').split('\n').filter(l => l.trim()); const e = JSON.parse(lines[20]); console.log('id:', e.id); console.log('proposed_design_for is array:', Array.isArray(e.proposed_design_for)); console.log('proposed_design_for length:', e.proposed_design_for?.length); console.log('addresses is array:', Array.isArray(e.addresses));"
   ```
   - Expected: id=`loop-design-instruction-layer`, `proposed_design_for` is an array of 4 valid refs, `addresses` is `[]`.

10. Run `pnpm test` and confirm:
    - Tests 1-2 from Phase 2 are now GREEN (the union rejects wrapped input as expected)
    - Test 3 from Phase 2 stays GREEN (flat input round-trips correctly)
    - All other tests stay green (862 baseline + deny-list fix)

11. **Sanity check** by spawning the MCP server in stdio mode:
    - Call `meta_state_patch` with `patch: { proposed_design_for: ["a", "b"] }` (flat) → succeeds, stores flat array
    - Call `meta_state_patch` with `patch: { proposed_design_for: { item: ["a", "b"] } }` (wrapped) → REJECTED by `.strict()` union (the fix intentionally rejects wrapped inputs at the boundary)
    - Call `meta_state_patch` with `{ __proto__: { isAdmin: true }, proposed_design_for: ["a"] }` → entry prototype NOT corrupted (explicit `delete cleanPatch.__proto__` at line 376)
    - Document the manual verification result in Phase 6 (B2-4) journal.

## Success Criteria

- [x] `meta_state_patch` schema uses `z.union(PATCH_KINDS.map(buildPatchSchemaFor))` (no more `z.object({}).passthrough()`)
- [x] `.strict()` is applied to each per-kind shape (closes typo/unknown-field pollution; note: `.strict()` does NOT reject `__proto__` — explicit `delete` at line 376 provides real defense)
- [x] Explicit `delete cleanPatch.__proto__; delete cleanPatch.constructor;` added at `core/meta-state.js:376-378`
- [x] Tests 1-2 from Phase 2 are GREEN (wrapped input rejected by union)
- [x] Test 3 from Phase 2 stays GREEN (flat input round-trips)
- [x] Existing `meta-state-patch-tool.test.js` deny-list test fixed (sends fields valid in finding schema)
- [x] Live `meta-state.jsonl` has 0 wrap sites (post-migration check)
- [x] All existing tests pass (862 baseline + deny-list fix; 0 fail)
- [x] Manual stdio verification: flat array → flat; `{item: [...]}` → REJECTED; `__proto__` → entry prototype intact
- [x] No unrelated tests broke

## Risk Assessment

- **Risk: The derived union's `z.literal('finding')` discriminators are now optional** — `.partial()` marks `entry_kind` as optional; a patch with no `entry_kind` inside it parses. **Mitigation:** the tool takes `entry_kind` as a separate top-level parameter (line 26 of `meta-state-patch-tool.js`); the inner `entry_kind` is redundant. The handler's `entry.entry_kind !== entry_kind` check at line 44 catches any drift.
- **Risk: `tools/list` schema drifts** — the patch tool's `patch` field is now `oneOf` (the union), not `{}`. Clients inspecting the JSON schema see a more verbose shape. **Mitigation:** this is the correct contract; clients SHOULD see the strict shape. The MCP SDK's `normalizeObjectSchema` handles `z.union` correctly (verified by the precedent `wire-format-top-level-coercion.test.js` Test 5 which asserts `propose_design`'s `proposed_design_for` and `addresses` still appear as array types in `tools/list`).
- **Risk: Migration crashes mid-loop** — if the inline node command crashes after 1 successful update and before 0 remaining wrap sites are flattened, the registry is half-flat. **Mitigation:** `updateEntry` is wrapped in `enqueue` (line 263) which serializes against any concurrent writer; each call is atomic at the `writeFileSync` + `renameSync` step. A crash leaves 0 to 1 wrap sites in the registry; a re-run catches the rest. Idempotency is preserved because the wrap-detection check (`Array.isArray(pd)`) is false on already-flat data.
- **Risk: `updateEntry`'s passthrough validator masks type errors** — if the tool schema passes a strictly-typed patch but `updateEntry` re-validates with the passthrough, any field not in the per-kind shape is silently accepted. **Mitigation:** the tool schema catches it first; `updateEntry`'s passthrough is the second line of defense. Per the documented gap note, B5 (deferred) revisits this.
- **Risk: Migration's `_expected_version` CAS conflict with concurrent writer** — the inline node command's `_expected_version = e.version ?? 0` matches `fix-loop-design-refs.mjs:54-58`; on `version_mismatch`, warn-and-skip. **Mitigation:** no other writer is active during the migration (the inline command runs to completion before `pnpm test` resumes). If a hook is in-flight, the `enqueue` serializes them.

## TDD Discipline

This phase is the green step for the 2 RED stdio tests (Tests 1-2). If any test fails:
1. Check the per-kind schema for the field type — it might be `z.string().min(20)` and the test data is shorter
2. Check that the test's `entry_kind` matches the kind whose `buildPatchSchemaFor` member it exercises
3. Verify the migration ran cleanly (no wrap sites remaining)
4. Verify the inline `enqueue` ordering — Phase 5's reverts must wait until Phase 4 commits the migration
