---
phase: 5
title: "Vestigial Deprecation"
status: completed
priority: P2
dependencies: [3, 4]
---

# Phase 5: Vestigial Deprecation

## Overview

Mark `code_fingerprint` `@deprecated` in the schema, stop writing it everywhere (auto-record path in the check-grounding tool), **block back-door writes via `meta_state_patch`** (CV-B), **retire the legacy backfill script** (CV-A), seed the index for every `mechanism_check:true` cited path **incl. terminal** (Q2), **measure** the O(1) win, and resolve the finding + log the change. The per-record field stays as dead-data fallback until **Phase 6 strips the values**.

<!-- Updated: Validation Session 1 - CV-B block code_fingerprint patches; CV-A retire backfill-mechanism-check.mjs; Q2 seed all incl. terminal; field-strip deferred to Phase 6 -->

## Requirements

- Functional: `code_fingerprint` schema field (`meta-state.js:89`) carries `@deprecated` in its `.describe()` (regex unchanged — field still accepted). The **second** `code_fingerprint` on the rule schema (`meta-state.js:188`) is also marked `@deprecated` for consistency. No code path **writes** the per-record field after this phase (auto-record -> auto-populate index; refresh -> index; **patch -> blocked**). Existing findings keep their vestigial value (fallback) until Phase 6.
- **Validation CV-B — block `code_fingerprint` patches:** `meta-state-patch-tool.js:68` currently forwards `code_fingerprint` patches straight to `updateEntry` — a back-door write to the deprecated field. Block it: drop the field from the patch (or reject with a deprecation warning pointing to `refresh_file_index`). Add a test asserting `meta_state_patch({ code_fingerprint })` is a no-op/warning.
- **Validation CV-A — retire `backfill-mechanism-check.mjs`:** `tools/legacy/scripts/backfill-mechanism-check.mjs:45,77` reads + writes `code_fingerprint` directly. Retire the script (its job — backfilling `mechanism_check` + `code_fingerprint` on legacy findings — is done; the index now owns the hash). Note the retirement in the closeout change-log.
- Functional: seed the index for **all** distinct `mechanism_check:true` cited paths **incl. resolved/superseded** (validation Q2). One `upsertFileIndexEntry` per distinct canonical key (~24). After Phase 6 strips per-record values, terminal findings have no fallback → index entries keep the cold-tier test honest (grounded via index, not `hash_match:null`).
- **Red-team F9 — O(1) regression test (committed, not just measured):** a dedicated test asserting: seed an index, edit a fixture file, call `refresh_file_index` once, assert all K anchored findings `grounded` via `checkGrounding` with the loaded index AND `drifted` without it.
- **Red-team F12 — display surfaces + agent instructions:** `loop-introspect.js` (~line 452) exposes `code_fingerprint: e.code_fingerprint || null`; `meta-state-sweep-tool.js` (~line 85) renders `entry.code_fingerprint`; `self-improvement-agent.js` (~line 24) instructs "REFUSE `meta_state_resolve` when `code_fingerprint` is stale." Repoint the display surfaces to the index hash (or `check_grounding`'s result), and update the agent instructions to consult `check_grounding` (index-authoritative) rather than the raw per-record field. (Note: `self-improvement-agent.js` is also retargeted in Phase 4 for the `refresh_file_index` rename; coordinate the two edits.)
- **Red-team F14 — auto-populate failure recovery:** if `upsertFileIndexEntry` fails (disk full / rename throws), the finding would be `grounded` with no baseline (`hash_match: null`). Document the recovery; on failure, log prominently (not just a gate-log warning) and retry. **(Per Phase 6: the F14 dual-path fallback that wrote `entry.code_fingerprint` as a bootstrap is dropped — Phase 6 strips the field. Until Phase 6 ships, the dual-path fallback is the safety net; after Phase 6, recovery = retry the index write + prominent log.)**
- **Red-team F15 — rollback + seed recovery:** rollback after Phase 4+5 produces N transient false-drift signals (per-record field frozen stale for files edited via the index). Document the recovery: bulk-reseed `code_fingerprint` from current file hashes. Seed script: add completeness verification (`readFileIndex(root).size === distinctCitedPathsCount`) and make it idempotent.
- Closeout: resolve finding `meta-260624T1920Z-...`; file `meta_state_log_change` recording the design change (incl. the `refresh_fingerprint` removal + the Phase 6 field-strip exception).

## Architecture

- `meta-state.js:89` (+ `:188`) `code_fingerprint` describe -> prepend `"@deprecated — baseline now lives in file-index.jsonl; this field is vestigial fallback, no longer written."` (schema validation regex unchanged).
- `meta-state-check-grounding-tool.js` auto-record block (lines 108-133): the auto-write of `entry.code_fingerprint` is removed; instead, if the index lacks the canonical key and the check is `grounded`, call `upsertFileIndexEntry` (auto-populate, mirroring the old auto-record intent) using `canonicalIndexKey` (F3 — relative, not `absPath`). On failure (pre-Phase-6): dual-path fallback writing `entry.code_fingerprint` as bootstrap + prominent log (F14); (post-Phase-6): retry + prominent log only.
- `meta-state-patch-tool.js:68`: block `code_fingerprint` from the forwarded patch (CV-B) — drop the field or reject with a deprecation warning pointing to `refresh_file_index`.
- `backfill-mechanism-check.mjs`: retire (delete) the script (CV-A).
- `loop-introspect.js` + `meta-state-sweep-tool.js`: repoint the displayed fingerprint to the index hash (`readFileIndex(root).get(canonicalKey) ?? entry.code_fingerprint`) (F12).
- `self-improvement-agent.js`: update the "REFUSE resolve when stale" instruction to consult `meta_state_check_grounding`'s result (index-authoritative) (F12) — coordinate with the Phase 4 rename retarget.
- Seed script (one-off, run locally): iterate `readRegistry` -> distinct canonical keys among ALL `mechanism_check:true` (incl. terminal) -> `upsertFileIndexEntry` per path; verify `readFileIndex(root).size === distinctCount`; idempotent (F15). Commit the resulting `file-index.jsonl`.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (line 89 + 188 `@deprecated`; auto-populate helper).
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js` (auto-record -> auto-populate index via `canonicalIndexKey`; F14 fallback).
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-patch-tool.js` (block `code_fingerprint` patches; CV-B).
- Delete: `tools/learning-loop-mastra/tools/legacy/scripts/backfill-mechanism-check.mjs` (CV-A) — verify path; the grep showed `tools/legacy/scripts/backfill-mechanism-check.mjs`.
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (~line 452 — display index hash; F12).
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js` (~line 85 — display index hash; F12).
- Modify: `tools/learning-loop-mastra/mastra/agents/instructions/self-improvement-agent.js` (~line 24 — consult `check_grounding`; F12; coordinate with Phase 4 rename).
- Create: `file-index.jsonl` seeded content (committed).
- Reference: `meta-state.jsonl` (read for distinct cited paths; not mutated — vestigial until Phase 6).

## Implementation Steps

1. **TDD — lock before deprecating:** add a test asserting `checkGrounding` with a loaded index returns `grounded` for a finding whose vestigial `code_fingerprint` is **stale** (index wins) — proves the index is authoritative.
2. Update `code_fingerprint` describe to `@deprecated` (line 89 + 188; regex unchanged).
3. Repoint the auto-record block to auto-populate the index via `canonicalIndexKey` (F3); add the F14 dual-path fallback (pre-Phase-6) on upsert failure.
4. **Block `code_fingerprint` in `meta-state-patch-tool.js` (CV-B)** + test asserting the no-op/warning.
5. **Retire `backfill-mechanism-check.mjs` (CV-A)**; note in the closeout change-log.
6. Repoint the display surfaces (`loop-introspect.js`, `meta-state-sweep-tool.js`) to the index hash (F12); update `self-improvement-agent.js` to consult `check_grounding` (F12; coordinate with Phase 4).
7. Write + run the seed script (ALL `mechanism_check:true` incl. terminal); verify `readFileIndex(root).size === distinctCount`; commit `file-index.jsonl` (F15, Q2).
8. **Measure O(1):** edit `tools/learning-loop-mastra/core/gate-logic.js` (4 anchored findings); run one `meta_state_refresh_file_index({ path })`; assert all 4 findings `grounded` via `checkGrounding(finding, { root, fileIndex })`. Record before/after call count.
9. **Add the O(1) regression test (F9):** seed -> edit fixture -> one `refresh_file_index` -> assert all K `grounded` with index, `drifted` without.
10. Run full suite: `cold-tier-regression` (index loaded), `check-grounding` (30), refresh-tool tests, new file-index + hash-cache + O(1) + patch-block tests.
11. Resolve finding `meta-260624T1920Z-...` via `meta_state_resolve`; file `meta_state_log_change` (semantic, grounding mechanism, diff: added file-index sidecar + repointed baseline + deprecated per-record field + removed `refresh_fingerprint` + retired backfill script + blocked patches); flip the loop-design to `inactive` (Phase 6 ships the value strip).

## Success Criteria (TDD + the finding's bar)

- [ ] Test: index-authoritative overrides stale vestigial per-record field -> `grounded`.
- [ ] `code_fingerprint` schema field `@deprecated` (line 89 + 188); regex unchanged; no code path writes it except the F14 bootstrap fallback (pre-Phase-6).
- [ ] **`meta_state_patch` blocks `code_fingerprint` (CV-B)**; test asserts no-op/warning.
- [ ] **`backfill-mechanism-check.mjs` retired (CV-A)**; no remaining writer of the per-record field outside the F14 fallback.
- [ ] `file-index.jsonl` seeded for ALL `mechanism_check:true` cited paths **incl. terminal (Q2)**; **seed completeness verified (`size === distinctCount`)** (F15).
- [ ] **Measured O(1):** editing `gate-logic.js` (4 findings) -> 1 refresh call -> all 4 `grounded`. Record counts in the change-log.
- [ ] **Committed O(1) regression test (F9):** one `refresh_file_index` re-grounds all K; `drifted` without the index.
- [ ] Display surfaces (`loop_describe`, sweep) show the index hash, not the stale per-record value (F12); self-improvement-agent consults `check_grounding` (F12).
- [ ] Auto-populate failure has a documented recovery + dual-path fallback pre-Phase-6 (F14); rollback recovery documented (F15).
- [ ] `cold-tier-regression.test.js` (index loaded) + `check-grounding.test.js` (30) + all new tests green.
- [ ] Finding `meta-260624T1920Z-...` resolved; `meta_state_log_change` filed; loop-design flipped to `inactive`.

## Risk Assessment

- **Risk (validation CV-B):** a caller still patches `code_fingerprint` → silent back-door write. **Mitigation:** block the field in `meta_state_patch` + test; grep-verify no remaining writer outside F14.
- **Risk (validation CV-A):** retiring the backfill script breaks a re-run workflow. **Mitigation:** the script's job is done (legacy findings backfilled); the seed script (this phase) + `refresh_file_index` supersede it. Note the retirement in the change-log.
- **Risk (red-team F12):** agents see stale per-record `code_fingerprint` → refuse to resolve findings. **Mitigation:** repoint display surfaces to the index hash; update the self-improvement-agent instruction to consult `check_grounding`.
- **Risk (red-team F14):** auto-populate failure → finding `grounded` with no baseline. **Mitigation:** dual-path fallback (pre-Phase-6) + prominent log + retry; documented recovery.
- **Risk (red-team F15):** rollback → N transient false-drift signals; seed partial-failure. **Mitigation:** documented rollback bulk-reseed; seed completeness verification + idempotent re-run.
- **Risk (red-team F3):** auto-populate stores an absolute key → lookup misses. **Mitigation:** auto-populate uses `canonicalIndexKey` (relative); test covers it.
- **Risk (Q2):** seeding terminal findings' paths grows the index unnecessarily. **Low/bounded** — keeps the index a complete map; after Phase 6 strips per-record values, terminal findings NEED the index entry (no fallback). Accepted.
- **Rollback:** revert `@deprecated` describe; restore the auto-record `updateEntry` write; un-block `meta_state_patch`; restore the backfill script; revert display/agent repoints. Index + sidecar remain. **Note:** if Phase 6 has shipped, per-record values are gone — rollback of Phase 5 code is safe, but per-record baselines can't be restored (see plan.md Validation Log).
