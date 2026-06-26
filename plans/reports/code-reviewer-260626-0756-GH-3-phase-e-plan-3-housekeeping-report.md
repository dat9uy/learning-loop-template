---
title: "Code Review: Phase E Plan 3 (Housekeeping) — last commit 0627770"
description: "Spec compliance + code quality review of the housekeeping plan. 2 critical acceptance criteria unmet; tests GREEN for what was implemented."
date: "2026-06-26T07:56:00.000Z"
reviewer: "code-reviewer"
plan: "plans/260626-0607-phase-e-housekeeping/plan.md"
commit: "0627770"
status: "BLOCKED"
tags: [code-review, phase-e, housekeeping, spec-compliance, critical-finding]
---

# Code Review: Phase E Plan 3 (Housekeeping) — commit 0627770

## Verdict: **BLOCKED**

**Two critical acceptance criteria from the plan are unmet.** Tests are GREEN, but the spec is not satisfied. The plan is marked `status: done` and the change-log filed a claim ("entry #9 stale → active") that does not match the actual registry state. **Do not merge or close Plan 3 until these are resolved.**

---

## What was reviewed

| Artifact | Location | Result |
|----------|----------|--------|
| Plan file | `plans/260626-0607-phase-e-housekeeping/plan.md` | 5 phases documented; status flipped to `done` |
| Last commit | `0627770` (8 files changed, +60/-73) | Phase 1+2+3+4 implemented; Phase 5 partial; journal missing |
| Phases 1–5 files | `plans/260626-0607-phase-e-housekeeping/phase-{01..05}-*.md` | Read for spec compliance |
| AGENTS.md | §11 inserted; §11→§12 renumber; §6 internal refs updated | PASS |
| docs/legacy-pins.md | New file, 6 entries (1 parity-test + 5 parity-semantic) | PASS |
| workflow-intentional-skip.js | 1-line parity-pin comment at L47 | PASS |
| core/schema-descriptions.yaml | Deleted (64 lines) | PASS |
| core/README.md | Lines 26/27/46 fixed; line 47 unchanged | PASS |
| external-refs-updated.test.js | SEARCH_PATHS + 2 FORBIDDEN_PATH_PATTERNS added | PASS |
| meta-state.jsonl | entry #9: `last_verified_at` added, `version` 10→12, **but `status: stale` unchanged** | **CRITICAL FAIL** |
| meta-state change-log | Filed claiming "entry #9 stale → active" | **CRITICAL FAIL** (claim is false) |
| Journal file | `docs/journals/260626-phase-e-plan-3-housekeeping-shipped.md` | **CRITICAL FAIL** (missing) |
| `pnpm test` | 13 namespaces, all GREEN | PASS |
| `cold-tier-regression.test.js` | 1/1 pass | PASS |
| `external-refs-updated.test.js` | 1/1 pass (the modified guard) | PASS |

---

## Critical Findings (blockers)

### C1. Entry #9 status was NOT transitioned stale → active

**Plan requirement (Phase 5 + acceptance criterion #13):**
> Entry `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` `status: stale → active` via `meta_state_patch` (per D7; CAS via `_expected_version: 10`)

**Actual state of entry #9 (verified via `mcp__learning-loop__mastra_meta_state_list`):**
```json
{
  "id": "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop",
  "status": "stale",
  "version": 12,
  "last_verified_at": "2026-06-26T00:32:41.000Z"
}
```

**The status field is STILL `"stale"`.** Only `last_verified_at` was added, and the version went 10→12 (two patch operations occurred — one may have succeeded with `last_verified_at` only, the other either failed or also lacked `status`).

**Evidence (from the commit diff, line 70):**
```diff
-..."status":"stale",..."version":10}
+..."status":"stale",..."version":12,"last_verified_at":"2026-06-26T00:32:41.000Z"}
```

**The change-log filed for this plan ALSO claims the transition happened:**
```json
"reason":"Phase E Plan 3 housekeeping: ... Rev 6 I-2 (entry #9 stale → active). 5 doc/process changes + 1 file deletion + 1 registry lifecycle action. All tests GREEN."
```

The change-log's `changed` field says:
> `"meta-state entry meta-260618T0558Z: stale → active"`

This is **factually incorrect** — the entry is still `stale`. The plan's Rev 6 follow-up (entry #9 transition) is not actually closed.

**Why this matters:** The Plan 6 code review flagged entry #9 as stale and required the transition to close that finding. The plan is supposed to close it. Closing requires the status to be `"active"`, not adding `last_verified_at` while leaving `status: stale`.

**Likely cause:** The `meta_state_patch` invocation was called with `{"last_verified_at": "<ISO>"}` (missing the `status: "active"` field), or the patch was attempted twice — once with `status` (rejected) and once without (succeeded but didn't transition). The version delta of 2 is consistent with two `updateEntry` calls.

**Fix:** Invoke `meta_state_patch` with the correct shape:
```bash
mcp__learning-loop__mastra_meta_state_patch \
  --id "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop" \
  --entry_kind "finding" \
  --patch '{"status":"active","last_verified_at":"<ISO>"}' \
  --_expected_version 12
```

**Verification:** Re-run `mcp__learning-loop__mastra_meta_state_list --id meta-260618T0558Z-...` and confirm `status: "active"`. The deny-list (`IMMUTABLE_PATCH_FIELDS` at `core/meta-state.js:259-270`) does NOT include `status`, so the patch should succeed. The finding patch schema (line 73) accepts `status: z.enum([...]).optional()`.

---

### C2. Journal file missing

**Plan requirement (acceptance criterion #15):**
> `docs/journals/260626-phase-e-plan-3-housekeeping-shipped.md` exists

**Actual state:** File does not exist. The sibling plan (Plan 6) shipped its journal (`260626-phase-e-plan-6-shell-restructure-shipped.md`) on the same day. Plan 3 omits this.

**Why this matters:** The journal is the operator's handoff record. Without it, future maintainers cannot trace the rationale for:
- Why the parity-pin convention is now split into "parity-test" + "parity-semantic" categories
- Why the FORBIDDEN_PATH_PATTERNS test was extended
- Why the meta_state_patch follow-up was redesigned (D7: `meta_state_patch` over `meta_state_re_verify`)
- The full list of decisions in D1–D10

**Fix:** Create `docs/journals/260626-phase-e-plan-3-housekeeping-shipped.md` with:
- Summary of the 5 phases + their outcomes
- D1–D10 design decisions and why they were taken
- The discrepancy discovered in C1 (entry #9 status not transitioned) and how it was resolved
- Cross-references to scope report, scout report, red-team report, and Plan 6 code review

---

## Spec Compliance — what passed

### Phase 1 (E.2 R2 Ownership) — PASS
- ✅ New `## 11. Runtime Interface Ownership (R2)` inserted at L355 with exact content from the phase file
- ✅ Existing `## 11. What changed in this rewrite (2026-06-12)` renumbered to `## 12` at L368
- ✅ Total section count: 12 (§1–§12) — verified via `grep -c "^## " AGENTS.md`
- ✅ Section §6 internal references updated: `§11.7` → `§12.7`, `§11.7.1` → `§12.7.1` (in the loop-rewriting paragraph)
- ✅ All cross-references to "§11" in other plans (e.g., `phase-e-shell-restructure/plan.md:69`, `phase-e-shell-restructure/phase-03-externalrefupdate.md:245`) are now correct because they refer to AGENTS.md §11 (the new R2 section) — no broken links
- ✅ Sections §1–§10 unchanged

### Phase 2 (E.3 Parity-pin + legacy-pins.md) — PASS
- ✅ `// PARITY-TEST PIN:` comment inserted at L47 of `workflow-intentional-skip.js`
- ✅ `docs/legacy-pins.md` created at `tools/learning-loop-mastra/docs/legacy-pins.md` (32 lines)
- ✅ 6 pinned files listed (1 parity-test + 5 parity-semantic) — meets the "≥5 files" requirement
- ✅ "Do not move to `legacy/`" rule stated for each entry
- ✅ Convention section distinguishes the two categories clearly
- ✅ Final rule requires operator-approved PR for any move

### Phase 3 (E.4 Schema rot cleanup) — PASS
- ✅ `core/schema-descriptions.yaml` deleted (64 lines)
- ✅ `ls` returns ENOENT
- ✅ Only remaining reference is in `external-refs-updated.test.js` FORBIDDEN_PATH_PATTERNS — which is the intended guard, not a live consumer

### Phase 4 (I-1 Docs drift + guard extension) — PASS
- ✅ `core/README.md` L26: `tools/learning-loop-mastra/mastra/create-loop-*.js` (added `mastra/`)
- ✅ `core/README.md` L27: `tools/learning-loop-mastra/mastra/{workflows,agents}/` + `tools/legacy/` noted as separate substrate
- ✅ `core/README.md` L46: `Mastra shell` + `tools/learning-loop-mastra/mastra/`
- ✅ `core/README.md` L47: `interface/` path unchanged (correct — this was the right call per the plan's R-Phase4-D mitigation)
- ✅ `external-refs-updated.test.js` SEARCH_PATHS extended with `tools/learning-loop-mastra/core/`
- ✅ `external-refs-updated.test.js` FORBIDDEN_PATH_PATTERNS extended with 2 new entries:
  - `tools/learning-loop-mastra/create-loop-.*\\.js` (catches glob-style refs)
  - `tools/learning-loop-mastra/core/schema-descriptions\\.yaml` (guards against re-creation)
- ✅ Regression guard test passes (1/1)

### Verification — PASS
- ✅ `pnpm test` GREEN across 13 namespaces (24.26s)
- ✅ `cold-tier-regression.test.js` passes (1/1, 1109ms)
- ✅ `external-refs-updated.test.js` passes (1/1, 8.3ms)
- ✅ All 11 phase-e-shell-restructure tests pass

---

## Quality Observations (non-blocking)

### Q1. Change-log claim is incorrect
The filed change-log entry (`meta-260626T0734Z-plans-260626-0607-phase-e-housekeeping-plan-md`) says `"meta-state entry meta-260618T0558Z: stale → active"` in its `changed` array. This claim is false. **Until C1 is fixed, this change-log is an inaccurate audit record.** Operators reading the registry will see a claim of completion that did not occur.

**Recommendation:** After fixing C1, file a follow-up change-log with the corrected `changed` field, OR amend the existing entry to reflect what actually happened (status: stale with last_verified_at stamped; needs a separate patch to transition to active).

### Q2. Version delta of 2 is unexplained
`updateEntry` increments version by 1 per successful call. The entry went from `version: 10` to `version: 12`, meaning 2 patches succeeded. The diff only shows one visible change (`last_verified_at` added). The other patch either:
- Was a retry of the same shape (idempotent — adds `last_verified_at` again, no visible change)
- Was a different shape that we cannot reconstruct from the file state alone

**Recommendation:** Trace the patch operations via `meta_state_check_grounding`'s `checked_at` history (if available) or via operator's session log. Document the actual sequence in the journal so the audit trail is complete.

### Q3. Duplicate FORBIDDEN_PATH_PATTERNS (cleanup opportunity)
The new `create-loop-.*\\.js` pattern is a superset of the 3 existing narrower patterns (`create-loop-tool\\.js`, `create-loop-workflow\\.js`, `create-loop-agent\\.js` at L12-14). The phase file's R-Phase4-E notes this is "the desired behavior" but is deferred to a future cleanup. If a future agent reorders the file, the broader pattern will silently subsume the narrower ones. **Acceptable as-is, but flag for follow-up.**

### Q4. legacy-pins.md is more comprehensive than scope report required
The plan was required to list ≥5 files; the actual file lists 6 (with detailed rationale for each). This is the right call (per D4: "documents the broader parity contract"). The scope report's narrower scope (1 file + 4 surfaces) is a floor, not a ceiling. No issue, just noting the doc is more useful than the minimum.

### Q5. AGENTS.md §11 wording uses code blocks for paths
The new §11 uses backticks for paths (e.g., `` `.claude/coordination/hooks/` ``). Consistent with the rest of AGENTS.md. Good.

---

## Why this matters

The plan's `status: done` is set prematurely. Two acceptance criteria from the plan's own checklist are unmet:
1. Entry #9 stale → active transition
2. Journal file existence

The committed code passes tests, but the committed change-log makes a false claim about the registry state. Operators relying on the change-log (or the plan's `done` status) will trust an inaccurate audit record. This is the kind of "polished shape, broken substance" issue that the review protocol is designed to catch.

**The plan's Rev 6 I-2 acceptance criterion is the ENTIRE reason the plan exists** — Plan 6's code review flagged entry #9 as stale; Plan 3 is the closeout. Closing it requires the actual status transition, not a `last_verified_at` stamp on a still-stale entry.

---

## Recommended actions

1. **BLOCK merge/close** until C1 and C2 are fixed
2. **C1 fix:** Invoke `meta_state_patch` with `{"status":"active","last_verified_at":"<ISO>"}` against the current entry (version 12). Verify via `meta_state_list` that `status` is now `"active"`.
3. **C2 fix:** Create `docs/journals/260626-phase-e-plan-3-housekeeping-shipped.md` with rationale, decisions, and the C1 resolution.
4. **Q1 fix (after C1):** Decide whether to amend the existing change-log or file a corrective change-log. Personally recommend filing a corrective one — the audit log should be append-only.
5. **Q2 fix:** Document the 2-patch sequence in the journal so the audit trail is reconstructable.
6. **Then amend the plan's `status` to remain `done`** (or set it to `done` again after the fixes) and the change-log claim to match reality.

---

## Verification evidence

```text
# AGENTS.md
$ grep -c "^## " AGENTS.md
12
$ grep -n "^## " AGENTS.md | tail -3
355:## 11. Runtime Interface Ownership (R2)
368:## 12. What changed in this rewrite (2026-06-12)

# schema-descriptions.yaml
$ ls tools/learning-loop-mastra/core/schema-descriptions.yaml
ls: cannot access '...': No such file or directory

# legacy-pins.md
$ grep -c "^- \`" tools/learning-loop-mastra/docs/legacy-pins.md
6

# regression guard
$ node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js
✔ no external refs to pre-move shell paths in production files (6.7ms)
ℹ pass 1, fail 0

# cold-tier regression
$ node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
✔ cold-tier regression: structural invariants, no fixture dependency (22.2ms)
ℹ pass 1, fail 0

# pnpm test
$ pnpm test
[suite] ==> pass (13 globs, 24.26s)

# entry #9 state — STILL STALE
$ mcp__learning-loop__mastra_meta_state_list --id meta-260618T0558Z-...
"status": "stale",
"version": 12,
"last_verified_at": "2026-06-26T00:32:41.000Z"

# journal — MISSING
$ ls docs/journals/260626-phase-e-plan-3-housekeeping-shipped.md
ls: cannot access '...': No such file or directory
```

---

**Status:** BLOCKED — 2 critical acceptance criteria unmet. Tests GREEN for the implemented parts; spec compliance fails.
