---
title: "Phase E Branch Pre-PR Review — registry-drift-fix + 5 predecessor plans"
description: "Whole-branch review before PR push. 53 files, +7094/-96. Surfaces 2 CRITICAL pre-PR gaps: (1) O-1 finding entry missing from meta-state.jsonl despite change-log claiming it was superseded (audit-log gap of the class Plan 7 Fix investigated); (2) O-3 ack'd to active but still violates F-1 (drift_count=1, plan acceptance criterion not met). Plus 4 IMPORTANT and 6 WARN items."
date: 2026-06-26T19:47Z
branch: "phase-e/plan-3-housekeeping"
base: main
reviewer: code-reviewer
scope: full-branch-pre-PR
input-mode: branch
status: BLOCKED — critical gaps must be fixed before PR
---

# Phase E Branch Pre-PR Review

> **Verdict:** **BLOCKED**. Two CRITICAL pre-PR gaps must be addressed before this branch can ship. The new `meta_state_consistency_check` tool (the headline feature) immediately catches both gaps when run against the live registry — confirming the tool works while showing the branch is not yet consistent.

## Scope

- **Branch:** `phase-e/plan-3-housekeeping`
- **Base:** `main`
- **Commits:** 16 branch-only commits (b4acc93 ← 0627770)
- **Files changed:** 53 (+7094 / -96)
- **Plans in scope:** 6 plans coalesced into the branch (Housekeeping, Stale-Sweep, Stale-Sweep-Fix, Audit-Gap-Mechanism, Registry-Drift-Fix, plus red-team review followups)
- **Reviewer mode:** spec-compliance + code-quality + verification gates

## Test Status

| Suite | Tests | Pass | Fail | Status |
|-------|-------|------|------|--------|
| `consistency-check` (core) | 16 | 16 | 0 | GREEN |
| `meta-state-consistency-check` (tool) | 8 | 8 | 0 | GREEN |
| `cold-tier-regression` | 1 | 1 | 0 | GREEN |
| `external-refs-updated` | 1 | 1 | 0 | GREEN |
| `write-gate-index-capabilities` (incl. 3 new meta-state tests) | 9 | 9 | 0 | GREEN |
| **Full `pnpm test` (13 namespaces)** | **1280** | **1280** | **0** | **GREEN** |

**All tests pass.** But test-green ≠ branch-consistent. The new consistency-check probe (T-1..T-8) detects 1 drift in the live registry that the plan claimed should be 0.

---

## CRITICAL-1: O-1 (`meta-260606T1830Z-context-pollution-...`) DELETED from registry, but change-log claims "superseded"

### Evidence

**Diagnostic report claim (lines 62-70 of `plans/reports/diagnostic-260626-1734-phase-e-registry-drift.md`):**
> "O-1 — Action: `meta_state_supersede` ... Before: status=`active`, version=14, carried `resolved_at`/`resolved_by`. After: status=`superseded`, version=15, consolidated_into set. ... Drift check: F-1 no longer applies (entry transitioned to terminal status)."

**Gate-log success (`.claude/coordination/gate-log.jsonl`, 2026-06-26T11:22:20.225Z):**
```json
{"timestamp":"2026-06-26T11:22:20.225Z","tool":"meta_state_supersede","superseded":true,
 "id":"meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois",
 "status":"superseded","consolidated_into":"meta-260626T1820Z-..."}
```

**Change-log claim (line 199 of `meta-state.jsonl`):**
> "Supersedes the orphan entry per Plan 8 (Phase 4). The entry's status=active but carried resolved_at/resolved_by ... Supersede transitions to terminal status, satisfying the consistency-check F-1 invariant."

**Actual registry state (`grep '"id":"meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois"' meta-state.jsonl`):**
**0 matches** — the finding entry is NOT in the file. The only occurrences are inside other entries' `addresses[]` arrays and inside the change-log's `change_target` string.

**`git show b4acc93 -- meta-state.jsonl`:**
```
-{"id":"meta-260606T1830Z-context-pollution-...","status":"active",...,"version":14,...}
+{"id":"meta-260626T1820Z-...","entry_kind":"change-log",...}
```

The diff shows the O-1 line was REMOVED, with no replacement line adding a `status: superseded` version.

### Why this is critical

1. **Audit-log gap of the same class Plan 7 Fix investigated.** Plan 7 Fix's Phase 3 (commits 27be280, 54fe242) explicitly closed the audit-log gap by adding a `meta-state.jsonl` block to the write-gate. This gap re-opens it: the change-log says one thing happened, the registry shows another.

2. **The headline new tool catches it immediately.** Running the new `meta_state_consistency_check` returns `drift_count: 1` (O-3 — see CRITICAL-2). O-1 doesn't appear in drift because it's not in the registry at all — but it's in the change-log's `change_target`, which is a contradiction. The tool would not catch O-1's absence (it iterates `entries`); only an additional "orphan-ref" probe would. Filing that probe as a follow-up is fine; not addressing the inconsistency before PR is not.

3. **`updateEntry` may have the silent-persistence-fail bug** (cf. finding `meta-260619T2233Z-the-meta-state-log-change-mcp-tool-can-return-logged-true-an`, severity=escalate). The gate-log says supersede returned `{superseded: true}`, but the registry didn't get the write. The journal notes the supersede was called from a `tools/scripts/phase-4-supersede.mjs` subprocess with `OPERATOR_MODE=1`; if `GATE_ROOT` wasn't propagated correctly, writes could have hit a different file (or no file).

### Required fix

Pick one:
- **(a) Recover O-1 via `meta_state_supersede` with the correct root.** If the subprocess wrote to a wrong file, the original entry is still in `main` (line 1 of `git diff main...HEAD`). Re-run `meta_state_supersede` from the correct GATE_ROOT and verify the entry transitions to `status: superseded`. Or:
- **(b) Investigate the subprocess path.** Read `tools/scripts/phase-4-supersede.mjs`, confirm `GATE_ROOT` propagation, and either re-run from the main session or file a finding for the missing-entry class.

**Block PR until O-1 exists in meta-state.jsonl with `status: superseded` and `consolidated_into: meta-260626T1820Z-meta-state-jsonl-meta-260606t1830z-context-pollution-stale-w`.**

---

## CRITICAL-2: O-3 (`meta-260626T1627Z-...`) drift_count=1 violates Phase 4 acceptance criterion

### Evidence

**Plan acceptance criterion (plan.md §Verification, item 4):**
> "Re-running the tool returns `drift_count = 0` (or expected baseline if any new drift was introduced by supersede's `superseded_at`/`superseded_by` field addition — none expected)."

**Live probe (2026-06-26T19:47Z, after Phase 4):**
```
Drift count: 1
[{
  "id": "meta-260626T1627Z-plan-7-fix-phase-1-deferred-2-stale-mechanism-check-false-en",
  "status": "active",
  "invariant_id": "F-1",
  "message": "F-1: status=active must not carry resolved_at, resolved_by, resolution",
  "present_fields": ["resolved_at", "resolved_by", "resolution"],
  "forbidden_fields": ["resolved_at", "resolved_by", "resolution"]
}]
```

**Plan acknowledgment (R6 + OO3):**
> "O-3 fix (meta_state_ack) preserves `resolution` text, which now appears on an `active` entry — appears to violate F-1. ... F-1's 'MUST NOT carry `resolution`' wording is ambiguous; O-3's `resolution` text is operator-supplied content, not a state-machine terminal marker. Document in plan; consider tightening F-1 wording in v2."

### Why this is critical

1. **The plan's own invariant catches the plan's own fix.** F-1's code is `forbid: ["resolved_at", "resolved_by", "resolution"]`. There is no ambiguity in the implementation — the implementation forbids all three. The plan claimed ambiguity but the code is unambiguous.

2. **The diagnostic report admits "verification criterion ... is partially satisfied: 2 of 3 orphans cleanly fixed; 1 carries over".** Shipping with `drift_count: 1` means the headline tool (`meta_state_consistency_check`) returns non-zero on the branch the plan was supposed to leave clean. Anyone running the tool immediately after merge sees drift the plan claims to have fixed.

3. **The new IMMUTABLE_PATCH_FIELDS deny-list (`core/meta-state.js:259-270`) prevents clearing `resolved_at`/`resolved_by`/`resolution` via `meta_state_patch`.** So `meta_state_ack` (which only updates `status`/`acked_at`/`expires_at`) cannot clear them. The plan chose ack to preserve the operator narrative, but that choice is incompatible with F-1.

### Required fix

Three options, listed by preference:

- **(a) Tighten F-1 to distinguish terminal-marker fields from operator-content fields (preferred).** F-1 should forbid `resolved_at` and `resolved_by` (state-machine terminal markers) but allow `resolution` (operator narrative text). Add a new invariant F-1a for `resolution`. This is the cleanest semantic split and matches what the plan's R6/OO3 already gestures toward. Update `META_STATE_CONSISTENCY_INVARIANTS`, add C-17..C-19 unit tests for the split, and re-run the probe — drift_count should drop to 0.

- **(b) File a follow-up plan to supersede O-3** once a `meta_state_unarchive`-like primitive exists (cf. finding `meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi`, still active). Until then, mark this branch as leaving drift and call it out in PR description.

- **(c) Patch the entry directly via `meta_state_patch`** (which would require removing `resolution` from IMMUTABLE_PATCH_FIELDS). This undermines the audit-trail invariant and is **not recommended**.

**Block PR until F-1 wording is reconciled with the plan's chosen fix path.**

---

## IMPORTANT-1: Plan-7-fix footer status line says "Pending" but work is shipped

### Evidence

`plans/260626-1535-phase-e-stale-sweep-fix/plan.md` line 162:
```
**Status:** Pending — awaiting operator approval of design decisions + phase structure.
```

But:
- `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` exists with detailed closeout notes
- All verification criteria in the plan are met (cold-tier GREEN, pnpm test GREEN, audit-log gap documented)
- The plan's open items (OO1, OO2, OO3) are all resolved in the journal or deferred

### Required fix

Update the plan.md status footer to `**Status:** Done — shipped 2026-06-26`. Reference the journal and the successor plan (`plans/260626-1734-phase-e-registry-drift-fix/`).

---

## IMPORTANT-2: Plan-7-fix footer doesn't reference successor plan

### Evidence

The plan-7-fix footer mentions a "Plan 8" in the OO discussion (line 20: "include 2 mc=null entries in this plan (not defer to Plan 8)") but doesn't link to the successor plan. The successor is `plans/260626-1734-phase-e-registry-drift-fix/`.

### Required fix

Add a "Successor plan" line to the cross-references:
```
- Successor plan: plans/260626-1734-phase-e-registry-drift-fix/ (status: ready-for-ship, blocked by CRITICAL-1/CRITICAL-2)
```

---

## IMPORTANT-3: Change-log filed BEFORE the action it describes

### Evidence

Line 199 change-log timestamp: `2026-06-26T11:20:11.311Z`
O-1 supersede call timestamp: `2026-06-26T11:22:20.225Z`

The change-log was filed 2 minutes BEFORE the supersede. The change-log's `change_diff` describes the state AFTER the supersede ("status active->superseded") but it was filed first. Change-logs are audit-trail entries — they should describe what HAPPENED, not what WILL happen.

### Required fix

Either:
- **(a) Update the change-log filing protocol** to defer `meta_state_log_change` until after the action completes (e.g., supersede tool internally calls log_change, or the agent retries the log after supersede). The tool layer (subprocess) called the supersede and returned before the change-log was re-filed.
- **(b) Document the ordering constraint** in the supersede tool's docs ("if filing a change-log, call it AFTER `meta_state_supersede` returns success").

This is a process discipline issue, not a bug in the code. Lowest-priority IMPORTANT, but worth surfacing.

---

## IMPORTANT-4: Diagnostic report's "Before" state contradicts reality

### Evidence

The diagnostic report (line 16-17) lists O-1 and O-2 as `status=active` at diagnose time. But the git diff (`main...HEAD`) shows the entries were `status=stale` at main. Looking at the gate-log, O-1 was `acked: true` from `from_status: active` at 09:22:56 — but the prior call at 09:07:10 returned `current_status: stale`. So the entry was stale at 09:07, active at 09:22.

The diagnostic report's "Before: status=active, version=14" is correct for the diagnose-time snapshot. But this means the orphan was created by a separate Plan 7 Fix action (the 09:22 corrective ack at 4132891+789cf5c), not by the original auto-resolve sweep the plan scope inventory described.

### Required fix

Update the diagnostic report to clarify the chronology:
- Phase 0: O-1 was `status: stale` with `resolved_at/resolved_by: auto-resolve` (from a 2026-06-08 auto-resolve sweep)
- Plan 7 Fix corrective ack (09:22:56): O-1 transitioned to `status: active`, but the `resolved_*` fields were not cleared (IMMUTABLE_PATCH_FIELDS deny-list). The entry became an orphan.
- Plan 8 Phase 4 supersede (11:22:20): gate-log reports success, but registry shows the entry was deleted (see CRITICAL-1).

This chronology needs to be in the diagnostic report so future readers understand the orphan creation path.

---

## WARN-1: AGENTS.md renumber is mechanical but inconsistent in style

### Evidence

`AGENTS.md` was renumbered: old §11 ("What changed in this rewrite") → new §12; new §11 inserted ("Runtime Interface Ownership (R2)"). Cross-references to §11.7 / §11.7.1 were updated to §12.7 / §12.7.1. So far so good.

But:
- The new §11 (R2) is a substantive operational rule; the old §11 ("What changed") is a changelog. Reversing the order (changelog first, operational rule last) is more conventional. Currently: §10 → §11 (R2) → §12 (changelog).
- The changelog still has the date "(2026-06-12)" but no longer references its original §11 position. If someone has a bookmark to §11, they now find §11 = R2 instead of the rewrite notes.

### Recommendation

Acceptable as-is. If a future cleanup pass touches AGENTS.md, consider moving "What changed in this rewrite" to the end (§13+) so the operational rules read first.

---

## WARN-2: AGENTS.md §6 cites `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` §12.7 / §12.7.1

The renumber updated §11.7 → §12.7, but verify the actual brainstorm report uses §12.7 (not §11.7) for the consensus reference. If the source document has §11.7, the AGENTS.md reference is now pointing to the wrong section.

### Required fix

Run `grep -nE '^## §12\.|^### 12\.7|^# 12\.7' plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` to verify the cited section number exists in the source. If it doesn't, revert the renumber in AGENTS.md (keep §11.7 → §11.7).

---

## WARN-3: `schema-descriptions.yaml` deletion not mentioned in AGENTS.md changelog

`tools/learning-loop-mastra/core/schema-descriptions.yaml` was deleted (-64 lines) but AGENTS.md §12 "What changed in this rewrite" only lists renumbering, not file deletions. Either:
- (a) The deletion is a follow-up of Plan 3 (Housekeeping) and should be cross-referenced
- (b) AGENTS.md §12 is specifically about the 2026-06-12 rewrite and not subsequent edits; the deletion is implicit

### Recommendation

Either leave as-is (Plan 3 has its own scope report), or add a "Subsequent changes (Phase E)" section to AGENTS.md noting the post-rewrite evolution. Low priority.

---

## WARN-4: `tools/learning-loop-mastra/docs/legacy-pins.md` is a new artifact type not mentioned in the legacy-pins protocol

`docs/legacy-pins.md` is a new pin convention: a markdown document that explicitly prevents moving files to `legacy/`. This is itself a new artifact type introduced by Plan 3 (Housekeeping). The plan acknowledges it but doesn't document the convention in `core/README.md` or AGENTS.md.

### Recommendation

Acceptable. If the loop later adds more "new artifact types," document a meta-rule. For now, the doc itself is the convention.

---

## WARN-5: `workflow-intentional-skip.js` parity-pin comment is good but inconsistent

`tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js` now has a `// PARITY-TEST PIN: not legacy` comment. The convention documented in `docs/legacy-pins.md` is "If a file is listed here, it does not move to `legacy/` without an explicit operator-approved PR." But the inline comment in workflow-intentional-skip.js says "see docs/legacy-pins.md" while docs/legacy-pins.md only lists parity-semantic pins, not this file (it's listed under "Parity-test pins" though). OK, that's actually consistent — I misread. **Acceptable.**

---

## WARN-6: Cold-tier regression test passes despite missing O-1 entry

The cold-tier regression test (`tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`) passes despite O-1 being missing. This is correct behavior — the test doesn't enforce orphan-detection (that's the new tool's job) — but it's a sign that the test surface doesn't catch the most severe registry inconsistency. Consider adding an assertion in a follow-up that runs `meta_state_consistency_check` against the live registry and asserts `drift_count == 0`.

### Recommendation

Defer to a follow-up plan. The plan's Open Item OO2 already notes this: "Cold-tier test integration. Adding the consistency check to `__tests__/legacy-mcp/cold-tier-regression.test.js` would catch drift at every test run. Deferred per YAGNI."

---

## Spec Compliance Matrix (Plan 260626-1734-phase-e-registry-drift-fix)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | `consistencyCheck(entries)` in `core/consistency-check.js` + 16 unit tests | ✅ PASS | consistency-check.js (112 lines); 16/16 tests GREEN |
| 2 | `META_STATE_CONSISTENCY_INVARIANTS` with 5 stable ids [F-1..F-4, NEW-1] | ✅ PASS | consistency-check.js:16-27 |
| 3 | `meta_state_consistency_check` MCP tool + manifest entry | ✅ PASS | meta-state-consistency-check-tool.js + manifest.json:33 |
| 4 | 8 tool tests, gate-log writes per invocation | ✅ PASS | 8/8 tests GREEN; T-3 validates gate-log shape |
| 5 | File 2 change-log entries + 2 supersede calls + 1 ack for O-3 | ⚠️ PARTIAL | 2 change-logs filed; 2 supersede calls logged; 1 ack applied. **But O-1 entry is MISSING from registry** (CRITICAL-1). |
| 6 | `last_verified_at` backfill on 10 entries | ✅ PASS (externally) | Plan 8 Phase 5 verified all 9 still-active entries had `last_verified_at` from external mechanism; no backfill needed |
| 7 | D3 atomicity deviation documented in journal | ✅ PASS | docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md §IMPORTANT-1 |
| 8 | Plan 7 Fix footer updated to reference Plan 8 | ❌ MISSING | Plan 7 Fix footer still says "Status: Pending" (IMPORTANT-1, IMPORTANT-2) |
| 9 | Full pnpm test GREEN across 13 namespaces | ✅ PASS | 1280/1280 tests, 0 fails |
| 10 | Cold-tier regression PASS | ✅ PASS | Test PASS |
| 11 | `drift_count = 0` after Phase 4 | ❌ FAIL | drift_count = 1 (CRITICAL-2) |
| 12 | End-to-end: tool is canonical detector | ⚠️ PARTIAL | Tool works; but the very branch that ships it has drift it detects |

**Summary:** 8 PASS, 2 PARTIAL, 2 FAIL.

---

## Final Verdict

**BLOCKED.** Do not push PR until:

1. **CRITICAL-1:** Recover O-1 in `meta-state.jsonl` with `status: superseded` and `consolidated_into: meta-260626T1820Z-meta-state-jsonl-meta-260606t1830z-context-pollution-stale-w`. Verify the file actually contains the entry after the recovery supersede (not just the gate-log saying success).

2. **CRITICAL-2:** Resolve O-3's F-1 violation. Preferred path: tighten F-1 to forbid `resolved_at`/`resolved_by` (terminal markers) but allow `resolution` (operator content) and add a new invariant F-1a for `resolution` cleanliness. Re-run the probe and confirm `drift_count = 0`.

Recommended pre-merge work:
- Re-run `meta_state_consistency_check` and assert `drift_count = 0`
- Verify `grep "meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois" meta-state.jsonl` returns the entry (with `status: superseded`)
- Update `plans/260626-1535-phase-e-stale-sweep-fix/plan.md` status footer
- Update diagnostic report chronology (IMPORTANT-4)

Optional / follow-up:
- IMPORTANT-1..3 (plan-7-fix footer, chronology, change-log ordering)
- WARN-2 (verify AGENTS.md §12.7 cites a real section)
- WARN-6 (add consistency-check assertion to cold-tier regression test as a defense-in-depth guard)

## Open Questions

- OQ-1: Is the silent-persistence-fail bug (`meta-260619T2233Z-...`) the cause of CRITICAL-1? The journal says supersede was called from a subprocess. If `GATE_ROOT` wasn't propagated, writes could have hit a tmpdir. The bug investigation report (`plans/reports/debugger-260626-1535-...`) needs to be cross-referenced.
- OQ-2: Was O-1's missing-entry noticed during the b4acc93 commit review (the most recent commit on the branch)? If so, why was it shipped?
- OQ-3: Does the team want to ship with `drift_count = 1` and call it out in PR description, or block until CRITICAL-2 is fixed?