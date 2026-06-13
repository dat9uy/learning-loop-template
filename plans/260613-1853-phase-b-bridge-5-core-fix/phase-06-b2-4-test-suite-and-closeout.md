---
phase: 6
title: "B2-4 Test suite + closeout"
status: pending
priority: P1
effort: "30min"
dependencies: ["phase-05-b2-3-delete-unwrap-and-revert-patches"]
---

# Phase 6: B2-4 Test suite + closeout

## Overview

Final verification: run `pnpm test` and `pnpm test:cold-session`; pre-state check (no migration in this phase — Phase 4 Part 2 already flattened the 1 live wrap site); resolve the 2 originating findings (with `evidence_code_ref` UNCHANGED — refresh against the pre-existing line range, not the new one); file the change-log entry; write the cook journal.

## Requirements

- Functional: full test suite green (expected 866 tests, 0 fail)
- Functional: cold-session test green (8/8)
- Functional: `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` resolved
- Functional: `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig` resolved
- Functional: `meta_state_log_change` filed with `change_target: 'tools/learning-loop-mcp/tools/meta-state-patch-tool.js'`
- Functional: cook journal at `docs/journals/260613-bridge-5-core-fix-closeout.md`

## Architecture

The closeout follows the precedent TDD closeout pattern from `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/`, with **two reversals from the original plan:**

1. **No migration step in Phase 6.** The 1 live wrap site at `meta-state.jsonl:21` was already flattened in Phase 4 Part 2 (B2-2). The original plan's "Phase 6 migration" was reordered to Phase 4-prep because Phase 5's reverts need flat data to read (per Assumption Destroyer Finding 1 / red-team reversal).

2. **`evidence_code_ref` UNCHANGED on resolve.** The original plan said "update `evidence_code_ref` to the new fix site BEFORE fingerprint refresh." The red-team found that `rule-no-orphaned-evidence` requires the file at `evidence_code_ref` to exist and hash-match; updating to a new line range risks `code_missing` on the refresh. Instead, keep the existing `evidence_code_ref` (pointing at the unchanged `core/meta-state.js#metaStateEntrySchema` line range), refresh against the unchanged ref, and record the new file additions in `evidence_journal` (a separate field that doesn't gate the resolve).

## Related Code Files

- **Read:** `meta-state.jsonl` (live registry; 0 wrap sites expected post-Phase 4 migration)
- **Read:** `meta-state.jsonl` for `meta-260612T1131Z-...` and `meta-260612T0058Z-...` finding entries
- **Read:** `plans/reports/brainstorm-260613-1146-phase-b-bridge-5-core-fix.md` (source of truth for the resolve justifications)
- **Create:** journal entry at `docs/journals/260613-bridge-5-core-fix-closeout.md` (~50 lines; cook journal pattern per SP0/SP1/SP2/SP3)

## Implementation Steps

1. **Pre-state check (SP1 / SP3):**
   - `git log --since="2026-06-05" --oneline -- tools/learning-loop-mcp/core/meta-state.js` (record commit count from Phase 1)
   - `git status` (verify clean working tree)
   - `pnpm test` baseline (should be 866 tests green)
   - `grep -c '"item"' meta-state.jsonl` (count wire-format wrap sites; expected 0)
   - `node -e "const lines = require('fs').readFileSync('meta-state.jsonl', 'utf8').split('\n').filter(l => l.trim()); let wrap = 0; for (const l of lines) { const e = JSON.parse(l); for (const k of ['proposed_design_for', 'addresses']) { const v = e[k]; if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.item)) wrap++; } } console.log('wrap sites:', wrap);"` (programmatic count; expected 0)

2. **Final test runs:**
   - `pnpm test` — record pass count (expected 866: 862 baseline + 4 new from Phase 2)
   - `pnpm test:cold-session` — record 8/8 pass
   - Manual stdio verification: call `meta_state_patch` on a loop-design with `patch: { proposed_design_for: ["a", "b"] }` (flat) and `patch: { proposed_design_for: {item: ["a", "b"]} }` (wrapped) — both should store `["a", "b"]` flat

3. **Fingerprint refresh (SP2) — `evidence_code_ref` UNCHANGED:**
   - For each of the 2 target findings, verify `evidence_code_ref` is still pointing at the pre-existing `core/meta-state.js#metaStateEntrySchema` line range. If yes, proceed to refresh. If no (e.g., the original finding's `evidence_code_ref` was already pointing at the new file, which is unexpected), STOP and re-investigate.
   - The 2 target findings' `evidence_code_ref` is expected to be `core/meta-state.js#metaStateEntrySchema` (a stable, unchanged line range — the per-kind schemas at lines 56-225 are still there, just augmented with `buildPatchSchemaFor`).
   - Call `meta_state_refresh_fingerprint` on each
   - Call `meta_state_check_grounding` on each; assert `test_passed: true`
   - Record the new file additions (Phase 3's `buildPatchSchemaFor` in `core/meta-state.js`; Phase 5's revert commits) in `evidence_journal` field of each finding (this is a separate field that doesn't gate the resolve; per Assumption Destroyer Finding 7 / red-team reversal)

4. **Resolve findings:**
   - `meta_state_resolve` on `meta-260612T1131Z-...` with resolution: "Schema derivation shipped (Phase B B2-1 + B2-2 + B2-3). `meta_state_patch`'s `patch` field is now a per-kind union built from `buildPatchSchemaFor(kind)` (inlined in `core/meta-state.js`), with `.partial().strict()` semantics. Closes the `__proto__` / typo'd-field pollution path. 9 ad-hoc reader-patch sites reverted in B2-3 (registry `unwrapItemWrap` helper is preserved — tool-side coercion used by 14+ tools). The 1 live wrap site at `meta-state.jsonl:21` was flattened in Phase 4 Part 2. Verified by 4 stdio regression tests in `__tests__/meta-state-patch-derived-schema.test.js`."
   - `meta_state_resolve` on `meta-260612T0058Z-...` with resolution: "Wire-format quirk eliminated at the structural level. `meta_state_patch#patch` is now strict-typed (per-kind union via `buildPatchSchemaFor`), so top-level arrays round-trip flat without the `{item: [...]}` envelope. The 9 ad-hoc reader-patch sites that tolerated both shapes are reverted; data is flat-only. Registry `unwrapItemWrap` helper at `tool-registry.js:58-75` is preserved (tool-side coercion, not reader-side tolerance). Verified by 4 stdio regression tests in `__tests__/meta-state-patch-derived-schema.test.js`."

5. **File change-log entry:**
   - `meta_state_log_change` with:
     - `change_dimension: "semantic"` (schema shape changed)
     - `change_target: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js#schema.patch"`
     - `change_diff: { added: ["core/meta-state.js#buildPatchSchemaFor (new function, inlined)", "core/meta-state.js#PATCH_KINDS (new constant, inlined)"], removed: ["z.object({}).passthrough() in meta_state_patch"], changed: ["meta_state_patch#patch is now a per-kind union (.partial().strict() per kind)", "core/loop-introspect.js#buildRegistrySummary reads proposed_design_for directly (no wrap tolerance)", "scripts/fix-loop-design-refs.mjs reads proposed_design_for directly (no wrap tolerance)"] }`
     - `reason: "Phase B B2-1 + B2-2 + B2-3 shipped. The passthrough ZodObject on meta_state_patch's `patch` field is replaced with a per-kind union derived from metaStateEntrySchema's 4 per-kind branches via `buildPatchSchemaFor(kind)` (inlined in core/meta-state.js, NOT in a new core/schema-to-zod.js — that path was deleted in commit 05bea00 and stays deleted). Each per-kind schema is .partial() (patches are partial) and .strict() (rejects __proto__ / typo'd fields, closes the Object.assign pollution path at core/meta-state.js:378 and :483). This eliminates the wire-format {item: [...]} quirk on top-level array fields (proposed_design_for, addresses) and removes the need for the 9 ad-hoc reader-patch sites. The registry unwrapItemWrap helper is preserved — it is tool-side coercion used by 14+ tools. See plans/260613-1853-phase-b-bridge-5-core-fix for the full plan + phase files."`

6. **Write journal entry:**
   - Path: `docs/journals/260613-bridge-5-core-fix-closeout.md` (per Assumption Destroyer Finding 10 / red-team reversal — convention is `YYMMDD-slug.md`, no `phase-b-` prefix)
   - Sections: Pre-state (commit count from Phase 1, test baseline 862, wrap count 1 → 0), What shipped (file list: 1 new + 8 modified; 3 commits in Phase 5 + 1 in Phase 4 + 1 in Phase 3), Verification (test counts 866, stdio manual check, fingerprint check), Unresolved (LIM-1 through LIM-7 from the red-team review), Cross-references (master tracker update note)

7. **Update master tracker:**
   - Edit `plans/reports/productization-260612-1530-master-tracker.md`
   - Change B1 to `[x]` with link to this plan
   - Change B2 to `[x]` with link to this plan
   - B3-B6 remain `[ ]` (deferred)
   - Add a one-line note in the "Last updated" header

8. **Run final verification:** `pnpm test` and `git status` (clean)

## Success Criteria

- [ ] `grep -c '"item"' meta-state.jsonl` returns 0
- [ ] `pnpm test` green (866 tests, 0 fail)
- [ ] `pnpm test:cold-session` green (8/8)
- [ ] Manual stdio check: flat and wrapped shapes both produce flat storage
- [ ] 2 target findings resolved with structural justification; `evidence_code_ref` UNCHANGED
- [ ] Change-log entry filed via `meta_state_log_change`
- [ ] Cook journal written at `docs/journals/260613-bridge-5-core-fix-closeout.md`
- [ ] Master tracker updated (B1 + B2 marked complete)
- [ ] Working tree clean

## Risk Assessment

- **Risk: `pnpm test:cold-session` is timing-sensitive** — the precedent `meta-260613T1115Z-cold-session-l2-probe-test-is-flaky-due-to-fixed-60s-timeout` finding notes fixed 60s timeout on real `droid exec`. **Mitigation:** the test is in the `cold-session-discoverability.test.cjs` file; if it fails on the first run, retry once. If it still fails, the result is "infrastructure flaky" not "regression", and is logged as a separate finding.
- **Risk: Fingerprint refresh fails on one of the 2 findings** — the SP2 `check_grounding` runs the verification spec. **Mitigation:** the `evidence_code_ref` is UNCHANGED, pointing at the pre-existing `core/meta-state.js#metaStateEntrySchema` line range. The per-kind schemas at lines 56-225 are still there; the `buildPatchSchemaFor` addition is BELOW line 240 (per Phase 3's plan). The hash of the file changes (Phase 3 added ~30 lines), but the SP2 fingerprint is computed against the full file, so the refresh hashes the new content and the `code_fingerprint` is updated accordingly. No `code_missing` error.
- **Risk: B6 (loop-design to inactive) is not in scope** — the master tracker notes B6 depends on B3-B5 shipping. The loop-design entry stays `active` for this session. **Mitigation:** B6 is documented in the deferred table; the next session's plan picks it up.

## TDD Discipline

This phase is CLOSE. The 4 RED tests from Phase 2 are GREEN, the 4 updated wire-format tests are GREEN, the 9 reverted reader-patch sites are GREEN (the tests assert flat data post-Phase 4 migration), and the registry `unwrapItemWrap` helper is preserved (its tests in `wire-format-top-level-coercion.test.js` and `wire-format-patch-recursion.test.js` still pass). All pre-existing tests stay GREEN throughout.

## Out of Scope (per operator-confirmed B1-B2 scoping)

- B3: Apply derived schema to all `meta_state_*` tools (deferred to follow-up session)
- B4: Full test suite byte-for-byte parity gate (B2-4 covers patch tool scope)
- B5: `metaStateEntryPatchSchema` strict-typed expansion (the `_expected_version` script-caller gap; B5 deferred)
- B6: Promote `loop-design-schema-as-source-of-truth-bridge-5-...` to inactive (depends on B3-B5)
- LIM-1 through LIM-7 (out-of-scope security/test-harness/audit-trail gaps surfaced by the red-team; each is a candidate for a separate `meta_state_report` finding in a future session)

These are documented in the journal "Unresolved" section with the next-session handoff path.
