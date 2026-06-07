# Code Review: 76ecaed + 913a27c (meta-state scan-readiness refactor)

**Date:** 2026-06-07 08:00
**Reviewer:** ck-code-review (Stage 1 spec + Stage 2 code-reviewer + Stage 3 verification)
**Scope:** `76ecaed feat(meta): 6 relationship-first refactors` + `913a27c test(meta): 22 tests for scan-readiness refactors`
**Plan:** `plans/260606-meta-state-scan-readiness-refactor/plan.md` (7 TDD phases; 15 red-team findings already applied)
**Verdict:** ⚠️ **PARTIALLY READY.** Test regression (C1) was resolved post-review via delta+diff rewrite of the cold-tier harness (805/806 pass; only pre-existing `gate-integration` failure remains). 2 Critical CAS defects (C2, C3) still open and must be fixed before the user proceeds to "resolve gaps in meta-state."

---

## TL;DR

| Severity | Count | Headline |
|----------|-------|----------|
| Critical | 2 | 2 CAS-blindness defects in Phase 1/5 scripts (C1 test regression RESOLVED post-review) |
| Important | 2 | `toCompact` vs `summarize` field drift, gate docstring gap (I3 fixture brittleness RESOLVED via C1 fix) |
| Medium | 4 | tracked artifact merge-conflict path, capture script no-confirm, no dry-run preview, warm-tier cost |
| Minor/Nit | 3 | 200-char boundary test, change-log id collision risk, `description_preview` field-name clarity |
| Spec compliance | 1 | Phase 5 coverage 12/16 (75%) vs plan's 15/16 (94%); test threshold softened to 70% |

**Pre-existing (not from this commit):** 1 test failure (`gate-integration.test.cjs`, 3 persistent) — correctly recorded as `meta-260607T0715Z-...` in this commit. Not blocking.

**Stage 3 — `pnpm test` result:** 805 / 806 pass. 1 fail (pre-existing `gate-integration.test.cjs`, properly recorded as `meta-260607T0715Z-...` — not a regression from this PR). C1 test regression was resolved post-review via delta+diff rewrite; current test run is clean of NEW regressions.

---

## Critical — Must fix before proceeding

### C1. ~~NEW: cold-tier-regression test fails on the same commit that added it~~ — RESOLVED

**Original finding:** `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:11-27` was asserting strictEqual on `all_findings.length` (32 vs 33), so the fixture captured pre-`meta-260607T0715Z-...` triggered a `count mismatch` failure on its own commit.

**Resolution (applied 2026-06-07, before any commit):** Rewrote the test with per-bucket tolerance + surfaced diff (user chose "Delta + surfaced diff" from the 4-option decision).

**What changed in the test:**
- Added a `TOLERANCES` table at the top: structural fields (`record_types`, `gate_patterns`, `discoverability_hints`) keep `0` (strict — must never drift without explicit baseline bump); volatile fields get bounded tolerance with documented rationale.
- New `countDelta(name, current, expected)` helper: `assert.strictEqual` for `tol === 0`, `assert.ok(Math.abs(delta) <= tol)` otherwise. Error messages include the actual delta and the remediation path ("re-run capture-cold-tier.mjs" for structural, "bump TOLERANCES.${name}" for volatile).
- New `findNewIds(name, current, expected)` helper: when a bucket drifts, logs the new entry ids to console so the maintainer sees exactly what grew.
- Loop replaces the 11 individual `strictEqual` calls; bucket count is derived from `Object.keys(TOLERANCES)`.
- Kept semantic invariants as separate assertions: Phase 1 broken-refs check, Phase 3 `inverse_indexes` shape (all 4 maps present), Phase 5 `mechanism_check >= 70%` coverage threshold, size sanity (`> 50KB`).
- Inline documentation explains the regeneration procedure and the two response options (bump tolerance OR re-capture fixture).

**Verification:**
- `node --test 'tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js'` → 1 pass
- `pnpm test` → 805/806 pass (the 1 fail is the pre-existing `gate-integration` failure)
- Console output on run: `[all_findings] new entries: meta-260607T0715Z-inbound-state-gate-integration-test-has-3-persistent-failure` — exactly the diagnostic value the user asked for.

### C2. CAS-blindness in `fix-loop-design-refs.mjs` (no `_expected_version`)

**File:** `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs:52-75`
**Defect:** `await updateEntry(root, entry.id, { proposed_design_for: cleaned })` is called WITHOUT `_expected_version`. Under concurrent invocations (two operators in different terminals, or this script racing a `meta_state_resolve`), the update can overwrite a newer entry version. The change-log is then written unconditionally, claiming the strip succeeded when it may not have.
**Why it matters for the user:** The user is heading into "resolve gaps in meta-state" — the same scripts will be re-run as part of the gap-resolution lifecycle. A non-CAS-aware fix script is exactly the kind of latent bug that pollutes meta-state with false-positive "fixed" entries.
**Fix:** Capture per-entry return values, filter `fixLog` to only entries where `r === true`, and emit the change-log only after a post-condition re-read confirms the strip happened. Pass `entry.version ?? 0` as `_expected_version`. `meta_state_sweep` already does this correctly (lines 88-93); the scripts should follow the same pattern.

### C3. CAS-blindness in `backfill-mechanism-check.mjs` (no `_expected_version`)

**File:** `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs:57-74`
**Defect:** Same as C2, on the Phase 5 backfill path.
**Why it matters for the user:** The plan's red-team finding 13 specifically required this; the test asserts idempotency at the data layer but not at the CAS layer. Two parallel `node` invocations of the script will bypass the per-process `enqueue` queue in `core/meta-state.js:160-168` and corrupt the registry.
**Fix:** Same as C2 — pass `entry.version ?? 0` as `_expected_version`, capture return values, only mark a finding as backfilled if the CAS update succeeded.

---

## Important — Should fix before gap-resolution

### I1. `toCompact` and `summarize` have drifted field whitelists

**Files:**
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14-30` (8 metadata fields: id, kind, status, origin, addresses, consolidated_into, supersedes, promoted_to_rule, proposed_design_for, created_at, severity, affected_system)
- `tools/learning-loop-mcp/core/loop-introspect.js:357-407` (24+ fields including `enforcement`, `pattern_type`, `pattern`, `scope_predicate`, `shipped_in_plan`, `resolution`, `promoted_at`, `refined_at`, `refinement_reason`, etc.)

**Defect:** The plan's lock-in 2(b) for compact says "strip `description` and `evidence` only. Other fields stay (status, refs, dates, severity, affected_system)." The `toCompact` implementation strips `pattern_type`, `pattern`, `enforcement`, `title`, etc. — fields that are USEFUL for a relationship-scan use case. A user calling `meta_state_list({ compact: true })` and then `loop_describe({ tier: 'cold', description_mode: 'summary' })` will see two different shapes for the same entry.

**Recommendation:** Unify the field lists. `toCompact` should include the same relationship + key identity fields as `summarize` minus `description_preview`. Or document the deliberate divergence with a comment in both files. The plan's lock-in is clearer than the implementation; the implementation narrowed scope.

### I2. `meta_state_relationships` has no docstring explaining its gate posture

**File:** `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js:7-9`
**Defect:** New tool reads the full registry and exposes cross-reference topology. Other registry-mutating tools (`meta_state_sweep`, `meta_state_resolve`) gate on `OPERATOR_MODE`. Read-only tools (`meta_state_list`) don't. The plan's lock-in 4(d) says "Reuse `checkResolutionEvidence` consult pattern" with operator ack noted as "out of scope" follow-up.
**Defect:** No docstring marker explaining why a read-only tool doesn't need the inbound gate. A casual reader would assume it inherits gate protection by virtue of being a new tool.
**Fix:** Add `// Read-only, no operator gate required` to the tool's `description` field with a one-line rationale.

### I3. ~~Fixture brittleness: cold-tier-regression will fail on any new tool or finding~~ — RESOLVED via C1 fix

**Original finding:** Test asserted `current.tools.length === fixture.tools.length` and similar counts for 11 buckets. Any future addition triggered a `count mismatch` failure with no actionable error message.

**Resolution:** The C1 fix used exactly the second option I3 recommended: "change to delta-based assertions ... with a surfacing diff." The new test loops over a `TOLERANCES` table, surfaces new entry ids in console output, and keeps structural fields strict. The brittleness concern that motivated I3 is now addressed by design.

---

## Medium — Address in gap-resolution work

### M1. Phase 5 coverage 12/16 (75%), plan target 15/16 (94%)

**Files:** `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs` + test at `__tests__/backfill-mechanism-check.test.js:42-45`
**Defect:** Plan red-team finding 8 specifically updated the success criterion to 15/16 (94%). The actual coverage after the backfill is 12/16 (75%) per the registry summary. The test asserts `coverage >= 0.70`, which softens the requirement from the plan's 94% to 70%.
**Root cause:** Some `evidence_code_ref` paths point to files that no longer exist at their original location (files moved during the scan-readiness refactor or earlier). The script correctly skips them (`skipped_no_file`), but coverage drops.
**Fix:** Either (a) move the missing files back to the cited paths, (b) update the registry entries to point to the new paths, or (c) explicitly acknowledge in a follow-up plan that 75% is the realistic ceiling given file drift.
**Recommendation:** Investigate the 3 missing files during gap-resolution. If they truly moved, the registry should be updated; if they were removed, the entries should be auto-resolved.

### M2. `docs/registry-summary.md` is committed to git but auto-generated

**File:** `docs/registry-summary.md` (44 lines, tracked)
**Defect:** Regenerated on every `meta_state_sweep` apply. Concurrent sweeps (CI + operator, two terminals) will produce a conflict in this file. Plan lock-in 7(a) acknowledges this is intentional, but no `.gitignore` rule was added.
**Fix:** Add `docs/registry-summary.md` to `.gitignore` (simpler) OR document the merge procedure. Recommend (a) — it's a build artifact.

### M3. `capture-cold-tier.mjs` writes a 127KB fixture without a confirmation prompt

**File:** `tools/learning-loop-mcp/scripts/capture-cold-tier.mjs:7-22`
**Defect:** Writes a 118KB JSON file with no `--force` flag, no confirmation prompt, no `git diff` summary. If run accidentally against a "post-refactor" cold tier, it overwrites the baseline.
**Fix:** Require an explicit `--confirm-overwrite` flag. Or assert that no `inverse_indexes` field exists in the output before writing (would prevent post-refactor overwrites).

### M4. `meta_state_sweep` dry-run does not include the summary preview

**File:** `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js:108-109`
**Defect:** The dry-run path returns `{ swept: false, dry_run: true, transitions }` with no summary preview. An operator doing a dry-run to preview gets no visibility into the artifact.
**Fix:** Include a `summary_preview` field (computed but not written to disk) in the dry-run response. Minor UX concern.

### M5. Warm-tier `readAllEntriesForLineage` cost is untracked

**File:** `tools/learning-loop-mcp/tools/loop-describe-tool.js:76-77`
**Defect:** Warm tier now ALWAYS calls `readAllEntriesForLineage` to build `registry_summary`. Plan lock-in 9(b) says "warm tier computes inline, not read from disk" — satisfied. But the cost is duplicated compute (warm tier + sweep both compute).
**Fix:** Add a `timing` field to the result with `readAllEntriesForLineage` duration. Not blocking.

---

## Minor / Nit

### m1. Boundary test missing for `description_preview` 200-char limit

**File:** `tools/learning-loop-mcp/__tests__/loop-describe-description-mode.test.js`
**Defect:** Test asserts `<= 203` but the boundary cases (exactly 200, exactly 201) are not pinned. Future regression risk if the slice logic changes.
**Fix:** Add tests for `description.length === 200` (returns 200, no ellipsis) and `description.length === 201` (returns 203 with ellipsis).

### m2. Change-log id collision risk on rapid re-runs of fix script

**File:** `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs:60-62`
**Defect:** `id` uses `slice(0, 12)` of timestamp = `YYYYMMDDHHMM` (12 chars). Two runs in the same minute produce identical ids. The script is idempotent on the data fix (gated on `changes > 0`), so the collision is harmless in practice. But the comment claims "re-run produces no changes" which would be wrong if a future change to the script made the data fix rerun within a minute.
**Fix:** Include seconds in the id (`slice(0, 14)`) or include a random suffix. Defensive only.

### m3. `description_preview` field is only set in summary mode

**File:** `tools/learning-loop-mcp/core/loop-introspect.js:398-404`
**Defect:** In full mode, callers reading `entry.description_preview` will get `undefined`. A downstream caller doing `entry.description || entry.description_preview` will see the full description, but a caller doing `entry.description_preview` first will get undefined.
**Fix:** Add a comment in `summarize` explaining "description_preview is only set when description_mode='summary' is requested."

---

## Spec compliance — verified

| Phase | Plan asks | Code does | Verdict |
|-------|-----------|-----------|---------|
| 0 | Fixture + harness at `__tests__/fixtures/cold-tier-pre-refactor.json` + cold-tier-regression test | ✓ fixture + 9 test files (test rewritten post-review — delta+diff tolerance) | ✅ |
| 1 | `fix-loop-design-refs.mjs` idempotent, strips code symbols, emits change-log | ✓ strips, idempotent at data layer | ⚠️ (CAS-blind — C2) |
| 2 | `compact: true` flag on `meta_state_list` (~4KB) | ✓ flag added; 110 bytes/entry = ~6KB total | ✅ (within plan's 4-12KB range) |
| 3 | `buildInverseIndexes` returns 4 maps; `inverse_indexes` cold-tier field | ✓ 4 maps; cold tier has field | ✅ |
| 4 | `meta_state_relationships` MCP tool (manifest.json) | ✓ registered at manifest line 52; 3 directions + missing-entry error | ✅ (I2 docstring nit) |
| 5 | `backfill-mechanism-check.mjs` idempotent; 15/16 (94%) coverage | ⚠️ 12/16 (75%); test threshold lowered to 70% | ⚠️ (M1) |
| 6 | `description_mode: summary\|full` on cold tier; default `full`; `summarize` pure function | ✓ default `full`; pure function | ✅ |
| 7 | `docs/registry-summary.md` on sweep apply; warm-tier `registry_summary` field | ✓ both shipped | ✅ (M2 tracked-artifact issue) |

**No new schema fields** (per plan locked-decision #6): ✓ confirmed.
**No new artifact types** (per `rule-no-new-artifact-types`): ✓ confirmed.
**Exactly 1 new MCP tool** (`meta_state_relationships`) (per plan locked-decision #4): ✓ confirmed.

---

## Pre-existing (not from this commit)

### P1. `gate-integration.test.cjs` 3 persistent failures
**File:** `.claude/coordination/__tests__/gate-integration.test.cjs`
**Defect:** 25 pass / 3 fail. Pre-dates the meta-state scan-readiness refactor. Root cause: `inbound-gate.js` hook spawns universal hook via `execFileSync`; marker write and context injection fail silently in non-Claude environments.
**Handled correctly in this commit:** Recorded as `meta-260607T0715Z-inbound-state-gate-integration-test-has-3-persistent-failure` (reported status, 24h TTL). Not a regression from this PR.

---

## Stage 3 — Test run summary

**Initial run (post-76ecaed + 913a27c):**
```
pnpm test → 806 tests, 804 pass, 2 fail, 0 skipped
- cold-tier-regression.test.js (NEW regression — see C1)
- gate-integration.test.cjs (pre-existing — see P1)
```

**After C1 resolution (delta+diff rewrite of cold-tier-regression.test.js):**
```
pnpm test → 806 tests, 805 pass, 1 fail, 0 skipped
- gate-integration.test.cjs (pre-existing — see P1)
```

22 new tests added in this commit. After C1 fix: 22 pass. The other 783 are pre-existing baseline. **No new regressions remain from the 76ecaed + 913a27c commit pair.**

---

## Recommended fix order before "resolve gaps in meta-state"

1. **Apply CAS (`_expected_version`) to both scripts** (C2, C3). Same scripts will be re-run during gap-resolution; CAS-blindness is the only remaining Critical defect.
2. **Unify `toCompact` and `summarize` field lists** (I1). The gap-resolution work will rely on both shapes; they should agree.
3. **Investigate the 3 missing-coverage findings in Phase 5** (M1). The plan promised 94%; the impl achieved 75%. The 3 are likely either file moves or stale references — both are gap-resolution work.
4. **Defer everything else** (I2, I3, M2-M5, m1-m3) to the gap-resolution plan. C1 is resolved; only C2 and C3 must land before the user builds on this code.

## Unresolved questions for the user

1. Should `docs/registry-summary.md` be added to `.gitignore` (artifact) or kept tracked (intentional diff visibility)? Plan lock-in 7(a) says auto-overwrite, which is consistent with EITHER choice but the merge-conflict cost is real.
2. Is the gate-integration pre-existing failure (P1) in scope for the gap-resolution plan, or is it a separate workstream? The recorded finding expires in 24h.
3. The Phase 5 coverage gap (M1: 12/16 vs 15/16) — should the gap-resolution work normalize the missing evidence paths, or accept 75% as the realistic ceiling? The plan's red-team review (RT-8) explicitly raised the bar from "10-12" to "15-16" based on the assumption that all 15 paths resolve.
