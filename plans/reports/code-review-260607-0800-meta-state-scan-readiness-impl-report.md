# Code Review: 76ecaed + 913a27c (meta-state scan-readiness refactor)

**Date:** 2026-06-07 08:00 (initial) / 2026-06-07 (post-review fixes applied)
**Reviewer:** ck-code-review (Stage 1 spec + Stage 2 code-reviewer + Stage 3 verification)
**Scope:** `76ecaed feat(meta): 6 relationship-first refactors` + `913a27c test(meta): 22 tests for scan-readiness refactors`
**Plan:** `plans/260606-meta-state-scan-readiness-refactor/plan.md` (7 TDD phases; 15 red-team findings already applied)
**Verdict:** ✅ **READY for gap-resolution work.** C1, C2, C3, I1, and M1 are all RESOLVED (4 via code/test changes, 1 via realistic-ceiling acknowledgment). 809/810 tests pass; the 1 failure is pre-existing P1, not a regression. Only the deferred Medium/Minor items (I2, M2-M5, m1-m3) remain for the gap-resolution plan.

---

## TL;DR

| Severity | Count | Headline |
|----------|-------|----------|
| Critical | 0 | All 3 critical defects resolved (C1, C2, C3 — see RESOLVED sections) |
| Important | 1 | gate docstring gap (I1 field drift RESOLVED; I3 fixture brittleness RESOLVED via C1) |
| Medium | 4 | tracked artifact merge-conflict path, capture script no-confirm, no dry-run preview, warm-tier cost (M1 coverage ceiling REVISED — see below) |
| Minor/Nit | 3 | 200-char boundary test, change-log id collision risk, `description_preview` field-name clarity |
| Spec compliance | 0 | Phase 5 coverage locked at 14/16 (87.5%) — realistic ceiling, not 15/16 plan target; see M1 REVISED |

**Pre-existing (not from this commit):** 1 test failure (`gate-integration.test.cjs`, 3 persistent) — correctly recorded as `meta-260607T0715Z-...` in this commit. Not blocking.

**Stage 3 — `pnpm test` result:** 809 / 810 pass. 1 fail (pre-existing `gate-integration.test.cjs`, properly recorded as `meta-260607T0715Z-...` — not a regression from this PR). C1, C2, C3, I1, and M1 are all RESOLVED. Test run is clean of NEW regressions.

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

### C2. ~~CAS-blindness in `fix-loop-design-refs.mjs` (no `_expected_version`)~~ — RESOLVED

**Original finding:** `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs:52-75` was calling `updateEntry(root, entry.id, { proposed_design_for: cleaned })` without `_expected_version`. Under concurrent invocations, the update could overwrite a newer entry version. The change-log was written unconditionally, claiming the strip succeeded when it may not have.

**Resolution (applied 2026-06-07, post-review):** Applied the recommended fix — capture per-entry return value, only push to `fixLog` when `r === true`, skip on `version_mismatch` or other failures, and pass `entry.version ?? 0` as `_expected_version`. The script now follows the same pattern as `meta_state_sweep` (lines 88-93 of `meta-state-sweep-tool.js`).

**What changed in the script:**
- Capture `const r = await updateEntry(root, entry.id, { proposed_design_for: cleaned, _expected_version: expectedVersion })`.
- If `r === "version_mismatch"`, log a warning and `continue` (do not push to `fixLog`).
- If `r !== true`, log a warning and `continue`.
- Only on `r === true`, push to `fixLog` and increment `changes`.
- The `if (changes > 0)` gate on change-log emission now correctly reflects "all updates succeeded" rather than "all updates were attempted."

**What changed in the tests (`__tests__/fix-loop-design-refs.test.js`):**
- New regression-guard test "Phase 1: fix-loop-design-refs change-log is CAS-consistent (C2)" — asserts the change-log's `change_diff.removed` list matches what was actually stripped from the registry. If a CAS mismatch occurred, the claimed-stripped ref would still be in the registry, and this assertion would fail.
- Existing idempotency test still passes (CAS path is a no-op when there are no concurrent writers).

**Verification:**
- `node --test tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` → 3 pass
- `pnpm test` → 809/810 pass (the 1 fail is the pre-existing P1 `gate-integration` failure)

### C3. ~~CAS-blindness in `backfill-mechanism-check.mjs` (no `_expected_version`)~~ — RESOLVED

**Original finding:** `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs:57-74` had the same CAS-blindness as C2 on the Phase 5 backfill path. Two parallel `node` invocations could bypass the per-process `enqueue` queue in `core/meta-state.js:160-168` and corrupt the registry.

**Resolution (applied 2026-06-07, post-review):** Same pattern as C2. Also discovered and fixed an additional path-resolution bug (covered in M1 below): `evidence_code_ref` and `evidence.code_ref` often include `#fragment` suffixes (e.g., `tools/.../gate-logic.js#splitSegments`); the script was treating the whole string as a filesystem path, so `existsSync` returned false even when the file existed. The fix splits on `#` and uses only the file portion.

**What changed in the script:**
- Strip `#fragment` suffix: `const codeRefPath = codeRef.split("#")[0];`
- Pass `entry.version ?? 0` as `_expected_version` to `updateEntry`.
- Capture return value; on `version_mismatch` or other failures, log a warning and `continue` (do not count as backfilled).
- Only on `r === true`, increment `backfilled` and push to `backfillLog`.

**What changed in the tests (`__tests__/backfill-mechanism-check.test.js`):**
- New test "Phase 5: backfill handles #fragment in code_ref paths (C3 + M1)" — asserts both `meta-260606T0301Z-splitsegments-...` and `meta-260606T0443Z-mcp-tools-...` are now backfilled (previously skipped due to the path bug).
- New test "Phase 5: backfill uses CAS-safe updateEntry (C3)" — statically verifies the script source includes `_expected_version` and `version_mismatch` handling.
- Coverage threshold tightened: test now asserts `>= 0.85` (realistic ceiling 14/16) in addition to the existing `>= 0.70` safety net.

**Verification:**
- Coverage went from 12/16 (75%) → 14/16 (87.5%) after the fix
- `node --test tools/learning-loop-mcp/__tests__/backfill-mechanism-check.test.js` → 4 pass
- `pnpm test` → 809/810 pass (the 1 fail is the pre-existing P1)

---

## Important — Should fix before gap-resolution

### I1. ~~`toCompact` and `summarize` have drifted field whitelists~~ — RESOLVED

**Original finding:** `toCompact` (8 fields) and `summarize` (24+ fields) had different whitelists. A user calling `meta_state_list({ compact: true })` and then `loop_describe({ tier: 'cold', description_mode: 'summary' })` saw two different shapes for the same entry.

**Resolution (applied 2026-06-07, post-review):** Unified by making `toCompact` delegate to `summarize` and drop only `description_preview`. Both functions now return the same field set; only the `description_preview` differs (compact: omitted; summary: 200-char preview). This was the first option in the original recommendation.

**What changed in `tools/meta-state-list-tool.js`:**
- `toCompact` body became: `const { description_preview, ...rest } = summarize(entry); return rest;`
- `summarize` imported from `core/loop-introspect.js` (already exported at line 357).
- Doc comment explains why the two diverge (token cost) and that the field set is identical.

**What changed in the tests (`__tests__/meta-state-list-compact.test.js`):**
- New regression-guard test "I1: toCompact and summarize return consistent shapes" — for a finding that appears in both, asserts every field in `toCompact` is in `summarize` and vice versa (modulo `description_preview`).
- Compact payload threshold raised from `< 15KB` to `< 30KB` (~18.9KB actual after unification, still ~4.5x smaller than the 130KB full registry). The plan's original "~4-12KB" was a pre-unification estimate.

**Verification:**
- Sample finding in compact: `{ id, entry_kind, status, consolidated_into, created_at, severity, affected_system, category, subtype, version }` — matches summarize minus `description_preview`.
- Sample finding in summary: same fields + `description_preview` + `resolution`, `resolved_by`, `resolved_at`.
- `node --test tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` → 5 pass
- `pnpm test` → 809/810 pass (the 1 fail is the pre-existing P1)

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

### M1. ~~Phase 5 coverage 12/16 (75%), plan target 15/16 (94%)~~ — REVISED (realistic ceiling 14/16 = 87.5%)

**Original finding:** Plan red-team finding 8 raised the success criterion to 15/16 (94%). The actual coverage after the backfill was 12/16 (75%) per the registry summary. The original report's "investigate the 3 missing files" recommendation identified the wrong root cause — investigation revealed the gap had two distinct causes.

**Investigation result (2026-06-07):** Of the 4 entries that were not backfilled:
- **2 entries had a `#fragment` suffix bug, not a missing file** — `evidence_code_ref` and `evidence.code_ref` often include function anchors like `tools/.../gate-logic.js#splitSegments`. The script was treating the whole string as a filesystem path, so `existsSync` returned false even when the file existed. **These 2 are now fixed and backfilled** (covered by the C3 fix).
  - `meta-260606T0301Z-splitsegments-quote-unaware-bash-gate-false-positive` → `tools/learning-loop-mcp/core/gate-logic.js#splitSegments` (file exists)
  - `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` → `.factory/hooks/loop-surface-inject.cjs#spawnAndCall` (file exists)
- **1 entry has no code reference at all** — `meta-260602T1116Z-agent-inside-a-project-that-has-its-own-mcp-json-called-ck-u` has `evidence_code_ref: undefined` and `evidence: {}`. Stays skipped (no path to compute a fingerprint for).
- **1 entry points to a file that no longer exists** — `meta-260601T1353Z-use-mcp-skill-...` cites `.factory/skills/use-mcp/scripts/package.json`. That directory was never created in this repo (the user has the `use-mcp` skill installed elsewhere). Stays skipped.

**Revised coverage ceiling: 14/16 (87.5%)**, not the plan's 15/16 (94%) and not the original 12/16 (75%). The plan's red-team claim of 94% was based on "all 15 paths resolve" — the actual registry state shows 2 entries that are structurally unreachable.

**What changed:**
- Script: `codeRef.split("#")[0]` strips the fragment before path resolution (bundled with C3 fix).
- Test: threshold tightened to `>= 0.85` (was `>= 0.70`); test now logs the actual coverage and asserts both the safety-net floor and the realistic-ceiling floor.
- Test comment documents the 2 unreachable entries with their ids and reasons.

**Verification:**
- `node tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs` → `Coverage: 14/16 = 87.5%`, `Skipped (no evidence or no file): 2` (down from 4).
- `meta-state.jsonl` shows `mechanism_check: true` and `code_fingerprint: sha256:...` on the 2 newly-backfilled entries.

**Out of scope for this fix (deferred to gap-resolution plan):**
- Auto-resolving the 2 unreachable entries with a `resolution: 'evidence_path_unreachable'` reason, OR updating their `evidence_code_ref` to point to a new file (the one without code_ref has nothing to point to; the one with the missing file would need operator judgment on what to point at).
- The plan's red-team success criterion of 15/16 (94%) is not achievable; the realistic target for the gap-resolution plan is "lock 14/16 and document the 2 unreachable in a follow-up."

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
| 1 | `fix-loop-design-refs.mjs` idempotent, strips code symbols, emits change-log | ✓ strips, idempotent at data layer | ✅ (C2 RESOLVED — CAS guard added post-review) |
| 2 | `compact: true` flag on `meta_state_list` (~4KB) | ✓ flag added; 18.9KB (was ~6KB; grew after I1 unification to ~30KB threshold) | ✅ (I1 RESOLVED — unified with `summarize`) |
| 3 | `buildInverseIndexes` returns 4 maps; `inverse_indexes` cold-tier field | ✓ 4 maps; cold tier has field | ✅ |
| 4 | `meta_state_relationships` MCP tool (manifest.json) | ✓ registered at manifest line 52; 3 directions + missing-entry error | ✅ (I2 docstring nit deferred) |
| 5 | `backfill-mechanism-check.mjs` idempotent; coverage | ✓ 14/16 (87.5%); test threshold 70% (safety net) + 85% (realistic ceiling) | ✅ (C3 RESOLVED, M1 REVISED) |
| 6 | `description_mode: summary\|full` on cold tier; default `full`; `summarize` pure function | ✓ default `full`; pure function | ✅ |
| 7 | `docs/registry-summary.md` on sweep apply; warm-tier `registry_summary` field | ✓ both shipped | ✅ (M2 tracked-artifact issue deferred) |

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

**After post-review fixes (C2, C3, I1, M1 applied 2026-06-07):**
```
pnpm test → 810 tests, 809 pass, 1 fail, 0 skipped
- gate-integration.test.cjs (pre-existing — see P1)
```

22 new tests added in the 76ecaed + 913a27c commit pair (all pass). 4 additional regression-guard tests added post-review (all pass):
- `fix-loop-design-refs.test.js` — 1 new (CAS-consistent change-log)
- `backfill-mechanism-check.test.js` — 2 new (#fragment path + CAS guard)
- `meta-state-list-compact.test.js` — 1 new (I1 field consistency)

The other 783 are pre-existing baseline. **No new regressions remain from the 76ecaed + 913a27c commit pair or from the post-review fixes.**

---

## Recommended fix order before "resolve gaps in meta-state"

1. **Apply CAS (`_expected_version`) to both scripts** (C2, C3). — ✅ **DONE 2026-06-07.** Both scripts now pass `entry.version ?? 0` as `_expected_version` and handle `version_mismatch` returns. 3 new regression-guard tests verify the change-log is consistent with reality.
2. **Unify `toCompact` and `summarize` field lists** (I1). — ✅ **DONE 2026-06-07.** `toCompact` now delegates to `summarize` and drops only `description_preview`. Both functions return the same field set. 1 new test asserts field parity.
3. **Investigate the 3 missing-coverage findings in Phase 5** (M1). — ✅ **DONE 2026-06-07.** Investigation revealed the gap was 2 entries with a `#fragment` path bug (fixed in C3) and 2 truly-unreachable entries (no code ref / missing file). Revised ceiling: 14/16 (87.5%). The 2 unreachable entries are documented in the test and out of scope for further normalization.
4. **Defer everything else** (I2, I3, M2-M5, m1-m3) to the gap-resolution plan. — ⏸ **DEFERRED.** All 3 priority fixes from this code review are landed; the remaining items are Medium and Minor and are documented but not blocking.

**Net result:** the 76ecaed + 913a27c commit pair is now ready to build on for the gap-resolution work. The remaining 4 Medium and 3 Minor items are tracked for the gap-resolution plan.

## Unresolved questions for the user

1. Should `docs/registry-summary.md` be added to `.gitignore` (artifact) or kept tracked (intentional diff visibility)? Plan lock-in 7(a) says auto-overwrite, which is consistent with EITHER choice but the merge-conflict cost is real. *(Same question as before; deferred to gap-resolution.)*
2. Is the gate-integration pre-existing failure (P1) in scope for the gap-resolution plan, or is it a separate workstream? The recorded finding expires in 24h. *(Same question as before; deferred to gap-resolution.)*
3. ~~The Phase 5 coverage gap (M1: 12/16 vs 15/16) — should the gap-resolution work normalize the missing evidence paths, or accept 75% as the realistic ceiling?~~ **RESOLVED post-review.** 2 of the 3 were a `#fragment` path bug, now fixed (14/16 = 87.5% coverage). The remaining 2 entries are structurally unreachable (no code ref / missing file). Outstanding question for the gap-resolution plan: should those 2 be auto-resolved with a `resolution: 'evidence_path_unreachable'` reason, or left as-is with a journal entry documenting why?
