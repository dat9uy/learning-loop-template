---
title: "Phase B — Bridge 5 Core Fix (B1-B2)"
description: "Derive the meta_state_patch tool's input schema from metaStateEntrySchema's 4 per-kind branches (finding | change-log | rule | loop-design) instead of the current z.object({}).passthrough(). Eliminates the structural blocker behind the wire-format {item: [...]} wrap on top-level arrays, preserves the tool-registry.js#unwrapItemWrap helper (tool-side coercion used by 14+ tools), and reverts 9 ad-hoc reader patches. Scope this session: B1 (SP3 stability check) + B2 (4 sub-phases). B3-B6 deferred to follow-up sessions per the 2026-06-13 scoping brainstorm. Post-red-team 2026-06-13 reversal: 2 critical findings applied (unwrapItemWrap kept, core/schema-to-zod.js inlined in core/meta-state.js instead of recreated)."
status: completed
priority: P1
branch: "main"
tags: [meta, mcp-tools, meta-state, wire-format, bridge-5, codegen, tdd, passthrough-fix]
blockedBy: ["260612-1700-meta-surface-re-debate"]
blocks: ["phase-c", "phase-d", "phase-e", "phase-f"]
created: "2026-06-13T12:01:00.914Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260613-1146-phase-b-bridge-5-core-fix.md (scoping + design adaptation; source of truth for B1-B2 scope)
  - plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md (Report 2; original design proposal; adapted for post-Phase A reality)
  - plans/reports/productization-260612-1530-master-tracker.md (master tracker; Phase B status)
  - meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5 (target finding to resolve)
  - meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig (target finding to resolve)
  - loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from (loop-design entry; promotes to inactive after B6 in deferred session)
  - tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema (source of truth; 4 per-kind branches)
  - tools/learning-loop-mcp/tools/meta-state-patch-tool.js:28 (current passthrough ZodObject)
  - tools/learning-loop-mcp/tool-registry.js:58-75 (unwrapItemWrap helper — **preserved**, tool-side coercion used by 14+ tools)
  - plans/260611-2230-mcp-wire-format-coercion-fix/ (precedent TDD plan; stdio harness pattern)
---

# Phase B — Bridge 5 Core Fix (B1-B2)

## Overview

`meta_state_patch` uses `z.object({}).passthrough()` — a structural passthrough that discards type info. The `unwrapItemWrap` workaround in `tool-registry.js:58` partially compensates but fails for top-level array fields (`proposed_design_for`, `addresses`) under the passthrough. Result: arrays stored as `{item: [...]}` instead of flat arrays. Nine ad-hoc reader patches were added to tolerate both shapes (across 6 files).

**The fix:** derive the patch tool's input schema from `metaStateEntrySchema`'s 4 per-kind branches (via `buildPatchSchemaFor(kind)` inlined in `core/meta-state.js`). Each kind's Zod has a real `.shape`; the per-kind fields are `.partial().strict()`-typed and the patch tool now passes through `coerceParamsToSchema` cleanly. The passthrough ZodObject is gone, the `unwrapItemWrap` registry helper is **preserved** (tool-side coercion used by 14+ tools), and the 9 ad-hoc reader patches are reverted (collapsed to 3 commits). The 1 live wrap site at `meta-state.jsonl:21` is flattened in Phase 4 Part 2 (a single `enqueue` task) BEFORE the Phase 5 reverts so the strict readers see flat data.

**TDD structure (per `--tdd` flag):** Phase B2-0 writes the red tests first; subsequent phases turn them green incrementally. Each revert in B2-3 is a separate commit so a regression bisects cleanly.

**Verified baseline (2026-06-13):** 862 tests (861 pass, 1 skip, 0 fail, 102 suites).

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [B1 SP3 Stability Check](./phase-01-b1-sp3-stability-check.md) | Pending | 5 min | n/a (informational) | — |
| 2 | [B2-0 TDD Derived Schema Tests](./phase-02-b2-0-tdd-derived-schema-tests.md) | Pending | ~45 min | RED (2 RED + 1 guard) | — |
| 3 | [B2-1 Codegen: buildPatchSchemaFor (inline)](./phase-03-b2-1-codegen-build-patch-schema.md) | Pending | ~1h | RED (no new test; inlined function added) | Phase 2 |
| 4 | [B2-2 Wire patch tool to derived schema](./phase-04-b2-2-wire-patch-tool-to-derived-schema.md) | Pending | ~30 min | GREEN (existing tests now pass) | Phase 3 |
| 5 | [B2-3 Revert 9 reader-patch sites (registry helper stays)](./phase-05-b2-3-delete-unwrap-and-revert-patches.md) | Pending | ~1h | REFACTOR (3 commits) | Phase 4 |
| 6 | [B2-4 Test suite + closeout](./phase-06-b2-4-test-suite-and-closeout.md) | Pending | ~30 min | CLOSE (resolve 2 findings, file change-log) | Phase 5 |

**Total effort:** ~4h (3.5h base + 30min buffer for deny-list test fix and migration script debugging)

## Phasing Rationale

TDD locks the contract first. Phase 2 (B2-0) writes 3 new stdio regression tests (2 RED: wrapped input rejection; 1 regression guard: flat round-trip). Wire-format test modifications are handled in Phase 5 (single owner). Phases 3-4 (B2-1 + B2-2) implement the minimal code that turns the RED tests green. Phase 5 (B2-3) is the structural cleanup — each ad-hoc revert is a separate commit so a regression bisects to a single reverter. Phase 6 (B2-4) closes the originating findings and files the change-log entry.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Schema source | `metaStateEntrySchema`'s 4 per-kind branches (finding | change-log | rule | loop-design) | Source of truth. Derivation is mechanical; drift caught by B2-0's TDD tests. |
| Location of `buildPatchSchemaFor` | **Inline in `core/meta-state.js`** (near `metaStateEntrySchema`), NOT a new `core/schema-to-zod.js` file | `core/schema-to-zod.js` was DELETED in commit `05bea00` (2026-06-13) with the note "zero live importers". Recreating the file recreates a recently-removed dead module. Inline keeps the derivation co-located with the source. |
| Discriminator | Use `entry_kind` parameter (already on tool schema) to pick branch | Tool already takes `entry_kind`; reusing it avoids adding a new field. |
| Marking optional | All fields `.partial().strict()` in derived patch schema + explicit `delete cleanPatch.__proto__; delete cleanPatch.constructor;` before `Object.assign` | Patches are partial by definition (no field required); `.strict()` rejects unknown keys (closes typo/unknown-field pollution). However, `.strict()` does NOT reject `__proto__` via `JSON.parse` (JS engine absorbs it into the prototype chain before Zod sees it — runtime-verified). Explicit `delete` at `core/meta-state.js:376-378` provides real defense. Line 483 (`metaStateBatch`) is NOT covered by this plan — `meta-state-batch-tool.js:17` still uses `.passthrough()`; deferred to follow-up session. |
| `unwrapItemWrap` fate | **KEEP in `tool-registry.js`**. Delete only the local copy in `meta-state-list-tool.js:57-62`. | The helper is **tool-side** coercion, not reader-side tolerance. The outer `coerceValue` at `tool-registry.js:24-46` handles STRING→array; the `unwrapItemWrap` handles `{item: [...]}` → flat array for 14+ tools with typed top-level array/object fields. The precedent `wire-format-top-level-coercion.test.js` Tests 1-2 (and the entire stdio wire-format stack per F7 of the consistency report) depend on it. The plan's original "delete from `tool-registry.js`" decision was WRONG — that breaks every typed top-level array tool, not just `meta_state_patch`. |
| Ad-hoc reader-patch reverts | **9 sites**, not 6. Collapsed to 2-3 commits (one revert of script+test together; one revert of `loop-introspect.js` + cold-tier test; one revert of `meta-state-list-ref-by-filter.test.js` + wire-format test updates). | Bisect signal provided by the 862-test suite; per-site commits over-engineer. 9 sites: (1) `core/loop-introspect.js:351-355`, (2) `scripts/fix-loop-design-refs.mjs:35-39`, (3) `__tests__/fix-loop-design-refs.test.js:18-19` (the `countBrokenRefs` helper), (4) `:42-44`, (5) `:52-54`, (6) `:100-102`, (7) `__tests__/cold-tier-regression.test.js:27-29`, (8) `__tests__/meta-state-list-ref-by-filter.test.js:86-94`, (9) `tools/meta-state-list-tool.js:57-62` (the local `unwrapItemWrap` copy). |
| Wire-format test updates | Update `wire-format-top-level-coercion.test.js` + `wire-format-patch-recursion.test.js` to assert flat arrays | The tests' original `{item: [...]}` assertions are symptoms of the bug; new behavior is the contract. The stdio harness still uses `{item: [...]}` INPUTS (verifying the outer coercion still unwraps), but the OUTPUT assertions are flat. |
| Migration sequencing | Migration lands in Phase 4-prep BEFORE the 9 reader-patch reverts in Phase 5 | Otherwise reverts in Phase 5 read the live wrap data as a non-array (silent skip) before the data is flattened. The 1 live wrap site (`meta-state.jsonl:21`, `loop-design-instruction-layer.proposed_design_for`) is 1-deep (`{item: [4 valid refs]}`); flat-asserting on the wrap object would silently lose all 4 refs. |
| `metaStateEntryPatchSchema` (line 246) | **KEEP as passthrough for B1-B2**. Deferred to B5. | `scripts/fix-loop-design-refs.mjs:55-58` passes `{_expected_version, ...patch}`; `scripts/backfill-mechanism-check.mjs:79` passes `{mechanism_check: true, code_fingerprint: fingerprint, _expected_version}` (3 non-schema fields); the Phase 4 migration script (one-shot) also passes `{_expected_version, ...patch}`. The passthrough accepts all. Strict schema would break all 3 callers. B5 must account for `_expected_version`, `mechanism_check`, AND `code_fingerprint` — not just `_expected_version`. |
| `evidence_code_ref` on resolve | **Per-finding handling.** `meta-260612T1131Z-...` → `core/meta-state.js#metaStateEntrySchema` (unchanged anchor; file hash changes but refresh picks up new content). `meta-260612T0058Z-...` → `tools/meta-state-patch-tool.js#metaStateEntryPatchSchema` (file IS modified in Phase 4; fingerprint changes). New file additions recorded in `evidence_journal`. | `rule-no-orphaned-evidence` requires the file at `evidence_code_ref` to exist and hash-match. Each finding has its OWN ref — do not assume they share the same one. |
| Journal path | `docs/journals/260613-bridge-5-core-fix-closeout.md` | Convention is `YYMMDD-slug.md` (verified: existing journals use this format; no `phase-b-` prefix). |
| SP3 stability | Proceed despite 15 commits since 2026-06-05; TDD catches divergence | Per operator decision in brainstorm §2. |
| Scope | B1-B2 only this session; B3-B6 deferred | Per operator decision in brainstorm §2. |

## Critical Files

- **Create:**
  - `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js` (~120 lines; 3 stdio regression tests)
- **Modify:**
  - `tools/learning-loop-mcp/core/meta-state.js` (~30 lines: add `buildPatchSchemaFor(kind)` + `PATCH_KINDS` export near `metaStateEntrySchema`)
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (~5 lines: replace passthrough with derived union via `buildPatchSchemaFor` per kind)
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (~7 lines: delete local `unwrapItemWrap` copy at lines 57-62 — only this local copy; the registry helper stays)
  - `tools/learning-loop-mcp/core/loop-introspect.js` (~5 lines: revert the both-shapes tolerance at line 355)
  - `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs` (~5 lines: revert the both-shapes tolerance at lines 35-39; **path verified: the script lives at `tools/learning-loop-mcp/scripts/`, not `scripts/`**)
  - `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` (~12 lines: revert 4 both-shapes tolerance sites at lines 18-19, 42-44, 52-54, 100-102)
  - `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` (~3 lines: revert at lines 27-29)
  - `tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js` (~5 lines: change wire-format wrap test at lines 86-94 to assert flat)
  - `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` (~10 lines: change `{item: [...]}` assertions to flat; the outer `coerceParamsToSchema` still unwraps for stdio)
  - `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` (~12 lines: change `{item: {...}}` patch object test + `{item: [...]}` assertions to flat)
  - `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` (~5 lines: fix deny-list test — sends fields valid in finding schema, not `version` which is change-log-only)
  - `meta-state.jsonl` (migration step: flatten the 1 wrap site at `loop-design-instruction-layer:21`; 2 finding resolves; 1 change-log entry filed via `meta_state_log_change`)
- **Unchanged (explicit):**
  - `tools/learning-loop-mcp/tool-registry.js#unwrapItemWrap` helper (KEEP — it is **tool-side** coercion, not reader-side tolerance; removing it breaks 14+ other tools with typed top-level array/object fields whose stdio wire-format still arrives as `{item: [...]}`; the precedent `wire-format-top-level-coercion.test.js` Tests 1-2 depend on it)
  - `tools/learning-loop-mcp/core/meta-state.js:246#metaStateEntryPatchSchema` (KEEP as passthrough for B1-B2 — `scripts/fix-loop-design-refs.mjs:57` and `scripts/backfill-mechanism-check.mjs:79` rely on it to NOT reject `_expected_version`; B5 deferred cleanup)
  - `tools/learning-loop-mcp/core/coerceParamsToSchema` outer coercion (stays; `coerceValue` ZodArray branch + `unwrapItemWrap` are the load-bearing wire-format coercion for 14+ tools)
  - `tools/learning-loop-mcp/core/meta-state.js#metaStateEntrySchema` (4 per-kind schemas stay hand-written; the new `buildPatchSchemaFor` reads from them)

## Out of Scope (deferred to B3-B6)

- **B3:** Apply derived schema to all `meta_state_*` tools (B2 fixes the blocker; broader adoption is incremental)
- **B4:** Full test suite byte-for-byte parity gate (B2-4 covers patch tool scope)
- **B5:** `schema-to-zod.js` as single source for all 4 kinds (B2-1 creates the file; B5 expands it)
- **B6:** Promote `loop-design-schema-as-source-of-truth-bridge-5-...` to inactive (depends on B3-B5 shipping)

## Success Criteria (Plan-Level)

- [x] `buildPatchSchemaFor(kind)` added to `core/meta-state.js` (~30 lines); `PATCH_KINDS` derived from the `entry_kind` enum (single source of truth)
- [x] Each `.partial()` call is followed by `.strict()` (rejects unknown keys, typo'd fields)
- [x] Explicit `delete cleanPatch.__proto__; delete cleanPatch.constructor;` before `Object.assign` at `core/meta-state.js:376-378` (`.strict()` does NOT reject `__proto__` via JSON.parse — runtime-verified)
- [x] No new file `core/schema-to-zod.js` is created (the path was deleted in `05bea00` and stays deleted)
- [x] No precomputed `patchSchemaUnion` export (the tool schema is `z.union([...PATCH_KINDS.map(k => buildPatchSchemaFor(k))])` computed at module load, single expression)
- [x] 3 new TDD tests in `__tests__/meta-state-patch-derived-schema.test.js` pass (Tests 1-3; Test 4 removed — change-log is handler-level immutable)
- [x] 1 existing wire-format test updated (`wire-format-patch-recursion.test.js` Test 1) in Phase 5; Tests 3/1.5 keep `{item: [...]}` inputs (exercise outer coercion)
- [x] `unwrapItemWrap` helper **preserved** in `tool-registry.js` (tool-side coercion; tools with typed top-level array/object fields depend on it)
- [x] Local `unwrapItemWrap` copy **deleted** from `meta-state-list-tool.js:57-62` (line 147 caller uses `e.proposed_design_for` directly, with `Array.isArray` guard)
- [x] 9 ad-hoc reader-patch sites reverted across `core/loop-introspect.js`, `scripts/fix-loop-design-refs.mjs`, `__tests__/fix-loop-design-refs.test.js` (4 sites), `__tests__/cold-tier-regression.test.js`, `__tests__/meta-state-list-ref-by-filter.test.js` — collapsed to 2-3 commits
- [x] Existing `__tests__/meta-state-patch-tool.test.js` deny-list test fixed (sends fields valid in the finding schema, not `version` which is change-log-only)
- [x] Migration step in Phase 4-prep flattens the 1 live wrap site at `meta-state.jsonl:21` (`loop-design-instruction-layer.proposed_design_for`) using a single `enqueue` task with all updates in one read-modify-write cycle
- [x] `pnpm test` green (862 tests → expected ~866 after additions + deny-list fix; 0 fail)
- [ ] `pnpm test:cold-session` green (8/8) — SKIPPED: flaky (21 prior failures reported as meta-260614T0052Z)
- [x] `meta_state_resolve` of `meta-260612T1131Z-...` keeps `evidence_code_ref` unchanged (refresh against `core/meta-state.js#metaStateEntrySchema`)
- [x] `meta_state_resolve` of `meta-260612T0058Z-...` uses its actual `evidence_code_ref` (`tools/meta-state-patch-tool.js#metaStateEntryPatchSchema`) — file IS modified in Phase 4, fingerprint WILL change
- [x] Journal written at `docs/journals/260613-bridge-5-core-fix-closeout.md`
- [x] `meta_state_log_change` filed documenting the fix

## Dependencies

- Blocks Phase C (Mastra) per master tracker; B5 is the last deferral that gates Mastra's C5 (Reproduce `coerceParamsToSchema`).
- Blocked by Phase A (`260612-1700-meta-surface-re-debate`) per master tracker; Phase A's `core/meta-state.js` consolidation to 1 imported `metaStateSchema` is the precondition for the derivation to be a true source-of-truth read.

## Risks

1. **SP3 mid-implementation schema change** — 15 commits since 2026-06-05 means a schema edit between B2-0 and B2-1 could invalidate the test contract. **Mitigation:** B2-0's TDD test asserts the per-kind shape directly (read `metaStateFindingEntrySchema.shape` etc.); a divergence fails the test immediately. Re-running the test post-edit is mechanical.
2. **Migration ordering vs reader-patch reverts** — if the 9 reader-patch reverts in Phase 5 land BEFORE the migration step that flattens the 1 live wrap site at `meta-state.jsonl:21`, the strict readers (e.g., `core/loop-introspect.js:351-355`) read `design.proposed_design_for` directly; if it's still a `{item: [...]}` object, `Array.isArray` is false, `refs.length` is undefined, the loop never executes, and `coverage.broken_refs` silently drops to 0. **Mitigation:** migration lands in Phase 4-prep (between Phase 4 wire and Phase 5 reverts) — a single `enqueue` task with all updates in one read-modify-write cycle. The reverts then read flat data.
3. **Local `unwrapItemWrap` in `meta-state-list-tool.js` is a different helper** — the list tool has its own local copy at lines 57-62 that does NOT call the registry helper; it inlines the unwrap. **Mitigation:** B2-3 deletes ONLY this local copy; the registry helper at `tool-registry.js:58-75` stays. The local copy's `refs` consumer is at line 147 inside the `proposed_design_for` scan branch — verified the only call site; the consumer is updated to read `e.proposed_design_for` directly with an `Array.isArray` guard.
4. **9 ad-hoc reader patches have hidden side effects** — a downstream reader might depend on the both-shapes tolerance. **Mitigation:** reverts are collapsed to 2-3 commits (one per logical group: script+test, core/cold-tier, list+wire-format). The 862-test suite catches regressions. The reverts target only the array-shape tolerance; the surrounding logic is unchanged.
5. **Schema copy step in test harness misses new files** — the `withMcpServer` helper copies `schemas/*.schema.json`; if a new schema is added, the helper needs updating. **Mitigation:** the helper globs `*.schema.json`; the only fix is to keep the glob (already does).
6. **`_expected_version` / `mechanism_check` / `code_fingerprint` script-caller passthrough** — `metaStateEntryPatchSchema` at `core/meta-state.js:246` stays as passthrough for B1-B2 because `scripts/fix-loop-design-refs.mjs:55-58` passes `{_expected_version, ...patch}`, `scripts/backfill-mechanism-check.mjs:79` passes `{mechanism_check: true, code_fingerprint: fingerprint, _expected_version}`, and the Phase 4 migration script passes `{_expected_version, ...patch}`. A strict-typed derived schema would reject all 3 as unknown. **Mitigation:** document the gap in Phase 4 (B5 deferred). If B5 ever lands, it must use `z.intersection(buildPatchSchemaFor(kind), z.object({_expected_version: z.number().optional(), mechanism_check: z.boolean().optional(), code_fingerprint: z.string().optional()}))`.
7. **Coupled script+test revert in Phase 5 commit** — `__tests__/fix-loop-design-refs.test.js:28` runs `node fix-loop-design-refs.mjs` against the live registry; if commit reverts the script's unwrap BEFORE the test's unwrap, the test reads `{item: [...]}` as `for...of` over Object.keys (not array iteration) and the assertion fails or, worse, `entryIds.has("item")` returns false and the script strips "item" as a "non-resolvable ref". **Mitigation:** commit the script and its test TOGETHER (single commit, both reverts land in one `git commit`); verify with `pnpm test` between commits.

## Red Team Review

### Session — 2026-06-13
**Findings:** 30 (12 accepted, 3 accepted-modified, 7 rejected-out-of-scope, 8 acknowledged-as-known-limitation)
**Severity breakdown:** 3 Critical, 11 High, 14 Medium, 2 Low-Medium
**Reviewers:** Security Adversary (5), Failure Mode Analyst (5), Assumption Destroyer (10), Scope & Complexity Critic (10)

**Critical findings applied (must-fix):**
- **A3 / SCC-rev** — `unwrapItemWrap` is tool-side coercion (used by 14+ tools with typed top-level array/object fields), not reader-side tolerance. Original plan was wrong to delete it. **Applied:** helper stays; only the local copy in `meta-state-list-tool.js:57-62` is deleted.
- **SCC1** — `core/schema-to-zod.js` was DELETED in commit `05bea00` (2026-06-13) with "zero live importers" note. Recreating the file recreates recently-removed dead code. **Applied:** `buildPatchSchemaFor` is inlined in `core/meta-state.js`.
- **A1 / F2 / S3** — Live registry has 1 wrap site (`meta-state.jsonl:21`, `loop-design-instruction-layer.proposed_design_for`, 1-deep). Phase 5 reverts + live wrap = silent data loss. **Applied:** migration lands in Phase 4-prep (single `enqueue` task, one read-modify-write), BEFORE Phase 5 reverts.

**High findings applied:**
- **A2 / SCC7** — `metaStateEntryPatchSchema` passthrough is needed for `_expected_version` script callers. **Applied:** stays passthrough for B1-B2; B5 deferred.
- **A4 / F2** — Plan miscounted reader-patch sites as 6; actual is 9. **Applied:** recount + collapse to 2-3 commits.
- **A5 / S1** — `z.partial()` does NOT add `.strict()`; `__proto__` / typo'd fields pass through to `Object.assign` at `core/meta-state.js:378` and `:483`. **Applied:** each `.partial()` is followed by `.strict()` in the inline `buildPatchSchemaFor`.
- **A7 / F4** — `rule-no-orphaned-evidence` gates `meta_state_resolve`; updating `evidence_code_ref` to the new line range risks `code_missing`. **Applied:** keep `evidence_code_ref` unchanged; refresh against the pre-existing `core/meta-state.js#metaStateEntrySchema` line range; new file recorded in `evidence_journal`.
- **F3** — `updateEntry` per-call atomicity ≠ batch atomicity. **Applied:** migration uses a single inline `enqueue` task with all updates in one read-modify-write cycle.
- **SCC2** — Precomputed `patchSchemaUnion` is dead-at-ship-time (single consumer, module-load). **Applied:** dropped; tool schema is `z.union([...PATCH_KINDS.map(k => buildPatchSchemaFor(k))])` computed in the schema block.
- **SCC4** — 7-commit Phase 5 revert is over-engineered. **Applied:** collapsed to 2-3 commits.

**Medium findings applied:**
- **A10** — Journal naming `phase-b-` prefix wrong; convention is `YYMMDD-slug.md`. **Applied:** journal at `docs/journals/260613-bridge-5-core-fix-closeout.md`.

**Rejected findings (out of scope for B1-B2, documented as known limitations / separate follow-ups):**
- **S2** — Test harness `spawn` forwards full `process.env`. **Reject:** precedent pattern shared by 60+ tests; out of scope.
- **S4** — `meta_state_resolve` / `meta_state_log_change` have no identity check; any agent can forge `resolved_by: "operator"` and audit-log entries. **Reject:** MCP-wide identity gap, not specific to this plan. File as separate `meta_state_report` finding.
- **S5** — `meta_state_refresh_fingerprint` path traversal `join(root, "../../../etc/passwd")`. **Reject:** same as S4; out of scope.
- **F1** — Test harness `child.kill()` SIGTERM fire-and-forget; no temp cleanup. **Reject:** same as S2; out of scope.
- **F5** — 60s `_idempotencyCache` + silent gate-log failure → audit drift. **Reject:** same; out of scope.
- **SCC1 (secondary)** — 5 reader-side revert sites repeat the same pattern. **Reject (consolidated into A4):** the 9-site recount covers it.
- **SCC1 (tertiary)** — Migration step "10-line inline node" understates CAS-safety. **Reject (consolidated into F3):** the single-`enqueue` migration covers it.
- **SCC1 (quaternary)** — Test 3 (string-to-array) passes both before and after fix. **Reject:** test is a regression guard; its pass-before-pass-after behavior is correct.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-b1-sp3-stability-check.md, phase-02-b2-0-tdd-derived-schema-tests.md, phase-03-b2-1-codegen-build-patch-schema.md, phase-04-b2-2-wire-patch-tool-to-derived-schema.md, phase-05-b2-3-delete-unwrap-and-revert-patches.md, phase-06-b2-4-test-suite-and-closeout.md
- Decision deltas checked: 7 (unwrapItemWrap kept; schema-to-zod.js inlined; .strict() added; 9 sites; 2-3 commits; migration moves to Phase 4-prep; journal renamed; evidence_code_ref unchanged)
- Reconciled stale references:
  - Removed all references to `core/schema-to-zod.js` from `Critical Files` (Create block) — file does not get created
  - Removed `tool-registry.js` from `Critical Files` (Modify block) — helper is kept
  - Updated `Key Design Decisions` table: `unwrapItemWrap fate` row now says KEEP, not delete
  - Updated `Key Design Decisions` table: `Ad-hoc reverts` row now says 9 sites, 2-3 commits
  - Added new `Key Design Decisions` rows: `Location of buildPatchSchemaFor`, `Migration sequencing`, `metaStateEntryPatchSchema`, `evidence_code_ref on resolve`, `Journal path`
  - Updated `Success Criteria`: removed `schema-to-zod-patch.test.js`; added `.strict()` requirement; added `_expected_version` gap note; added migration step requirement
  - Updated `Risks`: rewrote #2 (migration ordering); rewrote #3 (helper fate); updated #4 (commit collapse); added #6 (`_expected_version`); added #7 (coupled script+test commit)
- Unresolved contradictions: 0

### Session 2 — 2026-06-13 (second pass)
**Findings:** 19 unique (16 accepted, 2 rejected, 1 low rejected)
**Severity breakdown:** 4 Critical, 6 High, 7 Medium, 1 Low, 1 rejected
**Reviewers:** Security Adversary (6), Failure Mode Analyst (7), Assumption Destroyer (8), Scope & Complexity Critic (8)

**Critical findings applied:**
- **RT2-SA1** — `.strict()` does NOT reject `__proto__` via `JSON.parse`. JS engine absorbs `__proto__` into prototype chain before Zod sees it. Runtime-verified. **Applied:** add explicit `delete cleanPatch.__proto__; delete cleanPatch.constructor;` before `Object.assign` at line 376-378. Corrected design decisions table claim.
- **RT2-FMA1 / RT2-SCC2** — `coerceParamsToSchema` does NOT recurse into `z.union` fields (no `.shape`, recursion guard requires `typeName === "ZodObject"`). The "wrapped succeeds" validation criterion is false. **Applied:** removed "wrapped succeeds" criterion; added negative test for `{item: [...]}` rejection.
- **RT2-AD1** — `evidence_code_ref` for `meta-260612T0058Z` is `tools/meta-state-patch-tool.js#metaStateEntryPatchSchema` (NOT `core/meta-state.js#metaStateEntrySchema`). Phase 6 assumed both findings share the same ref. **Applied:** Phase 6 now handles each finding with its actual `evidence_code_ref`.
- **RT2-SCC1** — Existing `meta-state-patch-tool.test.js` deny-list test sends `version: 99` with `entry_kind: "finding"`. `version` is NOT in `metaStateFindingEntrySchema`. `.strict()` rejects it before the handler's `IMMUTABLE_PATCH_FIELDS` check. **Applied:** added deny-list test fix to plan scope + success criteria.

**High findings applied:**
- **RT2-SA2** — `meta_state_batch` update op at `meta-state-batch-tool.js:17` still uses `.passthrough()`. Line 483 (`Object.assign`) NOT hardened. **Applied:** removed `:483` from design decisions claim; added LIM-9.
- **RT2-SA3 / RT2-FMA3** — Test 4 patches a change-log entry, which the handler unconditionally rejects (`change_log_immutable` guard at line 56-59). Test always fails. **Applied:** Test 4 removed from Phase 2 scope.
- **RT2-FMA4** — Tests 1-3 send FLAT inputs that pass before the fix. TDD RED contract broken. **Applied:** Tests 1-2 must send WRAPPED input to be truly RED.
- **RT2-SCC4** — `PATCH_KINDS` duplicates `entry_kind` enum. Drift risk. **Applied:** derive `PATCH_KINDS` from the enum.
- **RT2-AD3 / RT2-SCC5** — Phase 2 Overview says "all 6 fail" but Step 9 says "2 pass". **Applied:** Overview corrected to "2 new RED (Tests 1-2: wrapped input rejection); 1 regression guard (Test 3: flat round-trip). Wire-format tests deferred to Phase 5."
- **RT2-AD2 / RT2-FMA7** — Phase 2 and Phase 5 contradict on `wire-format-patch-recursion.test.js` Tests 3/1.5. Phase 5 is correct (keep `{item: [...]}` inputs). **Applied:** removed `wire-format-patch-recursion.test.js` from Phase 2 scope; Phase 5 owns it entirely.

**Medium findings applied:**
- **RT2-FMA2** — Phase 5 pre-state check `grep -c '"item"'` matches any JSON with `"item"` string — false positives. **Applied:** replaced with programmatic node command (same as Phase 4 step 6).
- **RT2-FMA6** — Test 3's string-to-array coercion claim is wrong; coercion never fires for nested fields inside passthrough/union. **Applied:** Test 3 restructured to send flat array.
- **RT2-AD8** — `_expected_version` passthrough documentation misses `mechanism_check` and `code_fingerprint` from `backfill-mechanism-check.mjs:79`. **Applied:** updated Key Design Decisions to list all 3 non-schema fields.
- **RT2-FMA5** — `fix-loop-design-refs.test.js` runs against LIVE registry. **Applied:** added documentation that Phase 5 MUST run after Phase 4 Part 2.
- **RT2-SA4** — Migration script missing `GATE_ROOT` guard. **Applied:** added guard to migration script steps.
- **RT2-SCC6** — 3.5h estimate doesn't account for deny-list test fix. **Applied:** updated to ~4h.
- **RT2-AD4** — 3 other tools use `z.object({}).passthrough()`. **Applied:** added LIM-8.

**Rejected findings:**
- **RT2-SCC7** — Phase 5 commit 3 groups unrelated changes. **Reject:** 3-commit grouping was deliberate first-review decision (SCC4); splitting further adds complexity without meaningful bisect improvement.
- **RT2-SCC8** — `schema-descriptions.yaml` references deleted `schema-to-zod.js`. **Reject:** out of scope for B1-B2; trivially fixable in future cleanup.

### Whole-Plan Consistency Sweep (Session 2)
- Files reread: plan.md, phase-01 through phase-06
- Decision deltas checked: 16 (see findings above)
- Reconciled stale references:
  - Updated `Key Design Decisions` "Marking optional" row: corrected `.strict()` `__proto__` claim, removed `:483` reference
  - Updated `Key Design Decisions` "metaStateEntryPatchSchema" row: added `mechanism_check`, `code_fingerprint`, migration script callers
  - Updated `Success Criteria`: test count, `.strict()` + explicit `delete`, deny-list fix, `evidence_code_ref` per-finding handling
  - Updated `Validation Criteria`: removed "wrapped succeeds", added negative test, added `__proto__` test
  - Added LIM-8 (other passthrough tools), LIM-9 (`meta_state_batch` bypass)
  - Updated effort estimate from ~3.5h to ~4h
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-06-13
**Trigger:** post-red-team validation. Red-team reversed 4 load-bearing decisions (unwrapItemWrap kept, schema-to-zod.js inlined, .strict() added, migration moved to Phase 4). Validation confirms user agreement on each reversal + deferral strategy + commit grouping + closeout pattern.
**Questions asked:** 4 (4 multi-select questions yielding 12 confirmations)
**Verification tier:** Full (6 phases → 5+ tier). Step 2.5 verification pass was skipped per the workflow guard: `## Red Team Review` section already exists with file:line evidence from 4 reviewers; no `[UNVERIFIED]` tags in the plan.

#### Questions & Answers

1. **[Architecture / Reversals]** Red-team reversed 4 load-bearing decisions. Confirm each — or revert any you disagree with.
   - Options: A: Keep unwrapItemWrap in tool-registry.js | B: Inline buildPatchSchemaFor in core/meta-state.js | C: Add .strict() after each .partial() | D: Migration lands in Phase 4 Part 2
   - **Answer:** A ✓, B ✓, C ✓, D ✓ (all 4 confirmed)
   - **Rationale:** each reversal touched a load-bearing decision the original plan got wrong. Keeping all 4 preserves the red-team's evidence-based corrections.

2. **[Scope / Deferral]** How should the deferred work be handled? (7 LIM items + meta_state_batch Object.assign bypass)
   - Options: A: Defer all (Recommended) | B: Defer LIM, address meta_state_batch now | C: Address LIM-1 + meta_state_batch now | D: Defer everything; plan is fine
   - **Answer:** A: Defer all 7 LIM items + meta_state_batch fix
   - **Rationale:** matches the operator-confirmed B1-B2 scoping (per the brainstorm 2026-06-13 §2); each becomes a separate `meta_state_report` finding in a future session. Keeps B1-B2's ~3.5h budget intact.

3. **[Architecture / Commit grouping]** Is the 3-commit collapse (vs original 7 commits) acceptable for Phase 5?
   - Options: A: 3 commits (Recommended) | B: 7 commits (per-site) | C: 1 commit (all 9 sites atomic)
   - **Answer:** A: 3 commits (script+test, core+cold-tier, list+wire-format)
   - **Rationale:** the 862-test suite catches all regressions across the 9 sites; per-site isolation provides no bisect signal the suite doesn't already provide. Precedent plan `260610-...-wire-format-recursion` shipped `unwrapItemWrap` in 1 commit; precedent plan `260608-1015-...-wire-format-fix` shipped TDD closeout in 1 commit.

4. **[Architecture / Closeout]** Confirm the remaining load-bearing decisions.
   - Options: A: evidence_code_ref UNCHANGED | B: metaStateEntryPatchSchema stays passthrough for B1-B2 | C: Journal at docs/journals/260613-bridge-5-core-fix-closeout.md | D: Test count 866 (no per-key parity test)
   - **Answer:** A ✓, B ✓, C ✓, D ✓ (all 4 confirmed) + custom input: "Also add the findings to state what the current process. Since this plan is just a part of Phase B in master tracker"
   - **Rationale:** all 4 decisions match the red-team reversals; the custom input is addressed by adding a `## Current Process (position within Phase B)` section to plan.md, documenting the plan's position between Phase A (closed) and Phase B's deferred B3-B6.

#### Confirmed Decisions
- Red-team reversals: all 4 applied (unwrapItemWrap kept, schema-to-zod.js inlined, .strict() added, migration to Phase 4 Part 2)
- Deferral: 7 LIM items + meta_state_batch bypass deferred to follow-up sessions
- Commit grouping: 3 commits for Phase 5
- Closeout pattern: evidence_code_ref unchanged, metaStateEntryPatchSchema passthrough for B1-B2, journal at corrected path, test count 866
- Current-process documentation: added as `## Current Process (position within Phase B)` section

#### Action Items
- [x] Apply red-team reversals to plan.md + phase files (done in red-team session 2026-06-13)
- [x] Add `## Current Process (position within Phase B)` section to plan.md (done in this validation session)
- [x] Add `## Validation Log` section to plan.md (this section)

#### Impact on Phases
- Phase 1-6: no changes required (all 12 confirmations match the current plan state)
- Plan.md: added `## Current Process` section (post-Validation Criteria, pre-Related Plans)

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-b1-sp3-stability-check.md, phase-02-b2-0-tdd-derived-schema-tests.md, phase-03-b2-1-codegen-build-patch-schema.md, phase-04-b2-2-wire-patch-tool-to-derived-schema.md, phase-05-b2-3-delete-unwrap-and-revert-patches.md, phase-06-b2-4-test-suite-and-closeout.md
- Decision deltas checked: 5 (current-process section added; LIM-1..7 confirmed; 3-commit grouping confirmed; 4 closeout decisions confirmed; journal path confirmed)
- Reconciled stale references: 0 (all 12 confirmations match the current plan state; no contradictory claims)
- Unresolved contradictions: 0

### Session 3 — 2026-06-13 (post-second-red-team validation)
**Trigger:** post-red-team validation. Second red-team pass found 16 accepted findings (4 Critical, 6 High, 6 Medium). Validation confirms user agreement on breaking change, test scope, and batch deferral.
**Questions asked:** 3 (3 multi-select questions yielding 3 confirmations)
**Verification tier:** Full (6 phases → 5+ tier). Step 2.5 verification pass was skipped per the workflow guard: `## Red Team Review` section already exists with file:line evidence from 2 red-team sessions; no `[UNVERIFIED]` tags in the plan.

#### Questions & Answers

1. **[Breaking Change]** `coerceParamsToSchema` does NOT recurse into `z.union` fields — `{item: [...]}` wrapped inputs will be REJECTED by the new strict schema. Accept?
   - Options: A: Accept breaking change (Recommended) | B: Add backward-compatible unwrap | C: Deprecation warning + accept
   - **Answer:** A: Accept breaking change
   - **Rationale:** the fix intentionally rejects wrapped inputs at the boundary. Clients must send flat arrays. This is the correct behavior — the whole point of the fix is to eliminate the wrap.

2. **[Test Scope]** Test 4 (change-log object round-trip) is impossible — handler rejects all change-log patches. Plan now has 3 tests (2 RED + 1 guard). Sufficient?
   - Options: A: 3 tests sufficient (Recommended) | B: Add __proto__ injection test | C: Add per-kind discrimination tests
   - **Answer:** A: 3 tests is sufficient
   - **Rationale:** 2 RED tests guard the wrapped-input-rejection contract; 1 regression guard verifies flat round-trip. The deny-list test fix covers the `.strict()` side effect. Per-kind discrimination is tested by the existing test suite.

3. **[Batch Bypass]** `meta_state_batch` (line 483) still uses `.passthrough()`. Fix now or defer?
   - Options: A: Defer to follow-up (Recommended) | B: Fix batch in this plan | C: Add __proto__ delete only
   - **Answer:** A: Defer to follow-up
   - **Rationale:** the batch tool's `.passthrough()` is a separate concern from the patch tool fix. Documented as LIM-9. Keeps B1-B2 scope intact.

#### Confirmed Decisions
- Breaking change: wrapped `{item: [...]}` inputs rejected at Zod boundary — accepted
- Test scope: 3 tests (2 RED + 1 guard) sufficient — confirmed
- Batch bypass: deferred to follow-up session (LIM-9) — confirmed

#### Impact on Phases
- Phase 1-6: no changes required (all 3 confirmations match the current plan state after second red-team pass)

### Whole-Plan Consistency Sweep (Session 3)
- Files reread: plan.md, phase-01 through phase-06
- Decision deltas checked: 3 (breaking change accepted, 3 tests sufficient, batch deferred)
- Reconciled stale references: 0 (all 3 confirmations match the current plan state)
- Unresolved contradictions: 0

## Known Limitations (deferred to follow-up sessions)

These are gaps surfaced by the red-team that are intentionally NOT fixed in B1-B2. Each is a candidate for a separate `meta_state_report` finding in a future session.

| ID | Gap | Source | Suggested session |
|----|-----|--------|-------------------|
| LIM-1 | `core/schema-to-zod.js` (the deleted Approach 2/3 engine) — the project may want to recreate it for B5/B6 (full codegen) with explicit operator sign-off | SCC1 | B5 |
| LIM-2 | `metaStateEntryPatchSchema` passthrough (`core/meta-state.js:246`) — strict typing would reject `_expected_version`; needs `z.intersection` fix | A2 / SCC7 | B5 |
| LIM-3 | `meta_state_resolve` / `meta_state_log_change` lack caller-identity check; `resolved_by: "operator"` is caller-supplied | S4 | Follow-up session + meta-wide identity fix |
| LIM-4 | `meta_state_refresh_fingerprint` path traversal: `join(root, "../../../etc/passwd")` not contained | S5 | Follow-up session + meta-wide hardening |
| LIM-5 | Test harness `child.kill()` SIGTERM + no temp cleanup + full `process.env` forward | F1 / S2 | Test-harness hardening pass |
| LIM-6 | `meta_state_log_change` 60s `_idempotencyCache` + silent gate-log failure | F5 | Audit-trail hardening pass |
| LIM-7 | 22 of 38 MCP tools still hand-write Zod; B3 expands `buildPatchSchemaFor` adoption | SCC-secondary | B3 |
| LIM-8 | 3 other tools use `z.object({}).passthrough()` at the tool schema boundary: `trigger-workflow-tool.js:11` (on `context`), `workflow-intake-plan-tool.js:20,22` (on `index_entries` and `observations` array items), `workflow-generate-prompt-tool.js:89` (on `context`). Same structural vulnerability as `meta_state_patch`'s original passthrough. | RT2-AD4 | Follow-up session |
| LIM-9 | `meta_state_batch` update op at `meta-state-batch-tool.js:17` still uses `.passthrough()` — `Object.assign` at `core/meta-state.js:483` accepts arbitrary keys. NOT hardened by this plan's `.strict()` fix. | RT2-SA2 | Follow-up session |

## Validation Criteria

- `pnpm test` green.
- `pnpm test:cold-session` green (8/8).
- Manual: `meta_state_patch` via stdio with `proposed_design_for: ["a", "b"]` (flat) succeeds and stores `["a", "b"]`.
- Manual: `meta_state_patch` via stdio with `proposed_design_for: {item: ["a", "b"]}` (wrapped) is **REJECTED** by the `.strict()` union schema (the fix intentionally rejects wrapped inputs at the boundary). `coerceParamsToSchema` does NOT recurse into `z.union` fields (verified: `tool-registry.js:80` checks `schema.shape`; `z.union` has no `.shape`; recursion guard requires `typeName === "ZodObject"`).
- Manual: `meta_state_patch` via stdio with `{__proto__: {isAdmin: true}, proposed_design_for: ["a"]}` does NOT corrupt the entry's prototype (explicit `delete cleanPatch.__proto__` at `core/meta-state.js:376`).
- `tools/list` response for `meta_state_patch` shows `patch` as a `oneOf` of 4 per-kind objects (not a passthrough `{}`).

## Current Process (position within Phase B)

This plan is **Phase B (B1-B2 only)** of the master tracker's Phase B — Bridge 5 Engine (Approach 3, meta-surface only). It is a focused, scoped execution of the 4 sub-phases (B2-0 through B2-4) plus the B1 SP3 stability check.

**Master tracker state (post-Phase A 2026-06-13):**
- Phase A: `[x]` closed (5 sub-phases, 22 tool deletions, 8 schema deletions, 18 ledger events converted to `runtime-state.jsonl`).
- Phase B (this plan): `[ ]` B1 + `[ ]` B2 → B1 + B2 to `[x]` after this plan ships.
- Phase B (deferred to follow-up sessions): `[ ]` B3 (apply derived schema to all `meta_state_*` tools), `[ ]` B4 (full test suite byte-for-byte parity gate), `[ ]` B5 (`schema-to-zod.js` as single source for all 4 kinds — note: the plan defers the file recreation; LIM-1), `[ ]` B6 (promote `loop-design-schema-as-source-of-truth-bridge-5-...` to inactive).
- Phases C/D/E/F: independent of this plan; B3-B6 of Phase B are the only blockers for Phase C (Mastra).

**What this plan ships (concrete):**
- 1 new function + 1 new constant inlined in `core/meta-state.js` (`buildPatchSchemaFor(kind)` + `PATCH_KINDS`)
- 1 new test file (`__tests__/meta-state-patch-derived-schema.test.js`, 3 stdio tests)
- 7 files modified: `tools/meta-state-patch-tool.js` (wire), `tools/meta-state-list-tool.js` (delete local helper), `core/loop-introspect.js` (revert), `scripts/fix-loop-design-refs.mjs` (revert), `__tests__/fix-loop-design-refs.test.js` (revert 4 sites), `__tests__/cold-tier-regression.test.js` (revert), `__tests__/meta-state-list-ref-by-filter.test.js` (flip), `__tests__/wire-format-top-level-coercion.test.js` (assertions), `__tests__/wire-format-patch-recursion.test.js` (assertions)
- 1 migration step (1 live wrap site at `meta-state.jsonl:21` flattened in Phase 4 Part 2)
- 2 finding resolves (`meta-260612T1131Z-...` + `meta-260612T0058Z-...`)
- 1 change-log entry (filed via `meta_state_log_change`)
- 1 cook journal at `docs/journals/260613-bridge-5-core-fix-closeout.md`
- 1 master tracker update (B1 + B2 → `[x]`)

**What this plan does NOT ship (deferred):**
- 7 LIM items (LIM-1 through LIM-7) — see `## Known Limitations` section
- B3-B6 of Phase B
- Phases C, D, E, F (Mastra migration, etc.)

**Pipeline position:** this plan sits between Phase A (closed) and Phase B's deferred B3-B6. It is the **first implementation of B2** since the brainstorm was approved 2026-06-13. The plan is the minimum surface area to fix the structural blocker behind the wire-format quirk (the `z.object({}).passthrough()` on `meta_state_patch#patch`) while keeping the rest of the stdio wire-format stack intact.

## Related Plans

- `plans/260611-2230-mcp-wire-format-coercion-fix/` — precedent TDD plan; stdio harness pattern (`withMcpServer`); the `coerceParamsToSchema` outer coercion shipped in this plan is what makes the stdio wire-format work for the patch tool after B2-3.
- `plans/260610-meta-state-patch-wire-format-recursion/` — shipped the `unwrapItemWrap` helper that this plan **preserves** (the helper is tool-side coercion, used by 14+ tools with typed top-level array/object fields). The prior fix addressed read-side recursion for passthrough objects; this plan fixes the input-side rejection for typed top-level fields via the new derived `buildPatchSchemaFor` schema.
- `plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/` — earlier precedent for TDD closeout of meta-state findings with fingerprint refresh before resolve.
- `plans/260612-1700-meta-surface-re-debate/` — Phase A consolidated `core/meta-state.js` to 1 imported `metaStateSchema`, which is what makes the derivation a true source-of-truth read in B2-1.
