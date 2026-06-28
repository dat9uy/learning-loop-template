---
title: "Encode fallow tool-integration findings as rule-tool-integration-same-commit-dep"
description: "Encode the 3 anti-pattern findings from the fallow dead-code sweep followup (commit 9ed520d) as a single consult-checklist rule with a PROCESS_HINTS row + hook mirror and a core/README.md section. Close the findings with status=resolved + resolution notes pointing at the new rule. Write a change-log entry with applies_to.rules (no consolidates field — no registry precedent). File a loop-design entry capturing the meta-pattern."
status: pending
priority: P2
branch: "260627-1304-phase-e-mechanism-a-b-plan"
tags: [phase-e, followup, fallow, rule-promotion, meta-state]
blockedBy: []
blocks: []
created: "2026-06-28T06:46:20.728Z"
createdBy: "ck:plan"
source: skill
---

# Encode fallow tool-integration findings as rule-tool-integration-same-commit-dep

> **Source:** 3 active meta-state findings recorded during the 260627-2042 dead-code sweep ship journal (`plans/reports/journal-260627-phase-e-dead-code-sweep-shipped.md`). All 3 are already **FIXED** in commit `9ed520d`; this plan encodes the preventive rules so future tool integrations don't repeat the mistakes.

## Overview

The dead-code sweep shipped with 3 anti-pattern findings whose preventive rules were captured in the descriptions but not encoded in the registry:

| # | Finding id (short) | Subtype | Already fixed in |
|---|--------------------|---------|------------------|
| 1 | `meta-260628T1328Z-commit-6f9402e-...` | `tool-integration-incomplete` | `9ed520d` (added fallow to `devDependencies`) |
| 2 | `meta-260628T1328Z-fallow-dead-code-save-regression-...` | `tool-flag-format-confusion` | `9ed520d` (regenerated baseline with `--save-baseline`) |
| 3 | `meta-260628T1329Z-when-fallow-runs-...` | `silent-tool-side-effect` | `9ed520d` (relocated baselines to `plans/<slug>/reports/fallow/`) |

Encoding choice (from research): **a single `consult-checklist` rule** (`rule-tool-integration-same-commit-dep`) with 3 items, modeled on `rule-pr-body-registry-deltas` (meta-state.jsonl:167) and `rule-runtime-agnostic-features` (line 127). The 3 items share the same domain (CI/tool integration hygiene for fallow-like workflows); splitting them fragments the semantic and would require 3 PROCESS_HINTS rows for what is logically one rule.

The 3 findings are closed with `status=resolved` + finding-specific `resolution` notes pointing at the new rule id. NOT `status=superseded` + `consolidated_into=rule-...` — `consolidated_into` targets change-log entries per `core/meta-state.js:75-76` (schema-enforced).

A single change-log entry is written to capture the promotion in the audit log, mirroring `meta-260623T1450Z-...` (line 168) with `applies_to.rules: ["rule-tool-integration-same-commit-dep"]`. The change-log uses `applies_to.findings: ["<3-finding-ids>"]` instead of `consolidates` (which has no precedent in the registry and would invent a new convention).

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Design rule shape](./phase-01-design-rule-shape.md) | Pending | Rule id, fields, and 3-item checklist content frozen in `plan.md` appendix |
| 2 | [Promote rule + add PROCESS_HINTS](./phase-02-promote-rule-add-process-hints.md) | Pending | `meta_state_promote_rule` succeeds; `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})` returns the entry; `PROCESS_HINTS` row added at `core/loop-introspect.js:120` |
| 3 | [Document checklist in core/README.md](./phase-03-document-checklist-in-core-readme-md.md) | Pending | New "Tool integration checklist" section present at line 65 (after Admission rule, before Soft inversion); 3 numbered items cite the rule id and PROCESS_HINTS row |
| 4 | [Resolve 3 findings + write change-log + file loop-design](./phase-04-resolve-3-findings-write-change-log.md) | Pending | `meta_state_resolve` transitions each finding to `resolved`; change-log entry written with `applies_to.rules` (NO `consolidates`); loop-design entry filed |
| 5 | [Verification + journal](./phase-05-verification-journal.md) | Pending | New regression test green (`gate-logic-consult-checklist-tool-integration.test.js`, 3 tests inside); `loop_describe({tier: warm})` returns no warnings; full test suite delta = +3 (1308 → 1311); journal entry at `plans/reports/journal-260628-fallow-tool-integration-rule.md` |

## Dependencies

- **Upstream:** `260627-2042-phase-e-dead-code-sweep` (completed; findings 1-3 originate from its ship journal).
- **Independent of:** `260624-2335-phase-e-foundation`, `260627-1304-phase-e-topology-mechanism-a-b` (no shared files outside `core/README.md`).
- **Downstream (informational):** any future plan that adds a CI tool integration (e.g., new lint, audit, formatter) will surface this rule during PR review.

## Architecture

```
plans/260628-1337-fallow-tool-integration-rule-encoding/
├── plan.md                              ← this file
├── phase-01..05-*.md                    ← phases 1-5
└── reports/
    └── researcher-260628-fallow-followup-rule-design-report.md (DONE — design research)

meta-state.jsonl
├── new rule entry (appended): rule-tool-integration-same-commit-dep
├── new change-log entry: meta-260628T1337Z-promoted-rule-tool-integration-same-co
└── 3 finding entries (lines 203-205): status → resolved, resolution → "Encoded as rule-..."

tools/learning-loop-mastra/
├── core/loop-introspect.js              ← MODIFIED: append 4th PROCESS_HINTS row (between line 119 and `]);` line 120)
├── core/README.md                       ← MODIFIED: add "Tool integration checklist" section after line 64
└── __tests__/legacy-mcp/
    └── gate-logic-consult-checklist-tool-integration.test.js  ← NEW: regression test for the new rule

.factory/hooks/
└── loop-surface-inject.cjs              ← MODIFIED: mirror 4th PROCESS_HINTS row to LOCAL_PROCESS_HINTS (cold-session parity)

(no schema migration, no CI workflow, no production logic — but 2 production files are touched: core/loop-introspect.js and .factory/hooks/loop-surface-inject.cjs. The first is consumed by loop_describe warm tier; the second is the Droid-side hook mirror.)
```

**Key design decisions:**

1. **Single `consult-checklist` rule, not 3 separate rules.** The 3 items share a domain (CI/tool integration hygiene). A `regex`-type rule for item 1 would require cross-file correlation the bash gate cannot perform (it sees one command at a time). A `regex` rule for item 2 would only fire on the exact wrong-flag combination, not the broader class of "two flags with different JSON formats." Consult-checklist is the right enforcement primitive for design-time decisions that gate-time regex cannot make.
2. **`status=resolved` + `resolution` text, not `consolidated_into: rule-...`.** `consolidated_into` is schema-enforced on findings (`core/meta-state.js:75-76`) to point at change-log entries — NOT at rule entries. The "encoded as rule-X" pattern uses `resolved` with the rule id named in the resolution string. (NOTE: per R-HIGH-2, the original cited precedent at meta-state.jsonl:158 is itself `status: superseded, consolidated_into: change-log-id`, not `resolved` — so this plan establishes the `resolved`+rule-id-in-resolution pattern as a new convention, NOT a precedent.)
3. **PROCESS_HINTS row required.** The H6 ordering gate in `loop-describe-tool.js:90-102` warns if a `consult-checklist` rule has no corresponding `PROCESS_HINTS` row. Without this row, `loop_describe({tier: warm})` will warn on every call.
4. **`core/README.md` §Tool integration checklist, not a new doc.** The existing "Admission rule" section already documents fallow-related rules; splitting tool-integration knowledge across 2 files creates a discoverability gap.
5. **No `mechanism_check: true` on the rule.** The rule is consult-checklist; mechanism-check fingerprinting is for code-evidence claims. Skip fingerprint drift on this rule.

## Related Code Files

### Create
- `plans/260628-1337-fallow-tool-integration-rule-encoding/reports/researcher-260628-fallow-followup-rule-design-report.md` (already written by researcher)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` (Phase 5 regression test)
- `tools/scripts/enable-operator-mode.sh` (NEW per Validation Q1 — bootstrap script that exports `OPERATOR_MODE=1`)

### Modify
- `meta-state.jsonl` (append 4 entries: rule + change-log + loop-design + 1 finding entry patch for `affected_system`; mutate 3 finding entries from `active` to `resolved`; refresh fingerprint on finding 1 first)
- `tools/learning-loop-mastra/core/loop-introspect.js` (append 1 PROCESS_HINTS row between line 119 and `]);` line 120)
- `.factory/hooks/loop-surface-inject.cjs` (mirror 4th PROCESS_HINTS row to LOCAL_PROCESS_HINTS for cold-session parity)
- `tools/learning-loop-mastra/core/README.md` (insert "Tool integration checklist" section after line 64)

### Delete
- (none)

## Acceptance Criteria

- [ ] `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})` returns the new rule entry with `pattern_type: consult-checklist`, `enforcement: agent`, `status: active`, `origin: meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but`
- [ ] `core/loop-introspect.js` has 4 PROCESS_HINTS rows; the 4th references the new rule id
- [ ] `loop_describe({tier: warm})` returns `warnings: []` (H6 ordering gate satisfied)
- [ ] `core/README.md` line 65+ contains "Tool integration checklist" section with 3 numbered items
- [ ] `meta_state_list({entry_kind: "finding", id: [<3-finding-ids>]})` returns each with `status: resolved`, `resolved_by: operator`, `resolved_at: <iso>`, `resolution: "Encoded as rule-tool-integration-same-commit-dep (consult-checklist). <finding-specific note>."`
- [ ] New change-log entry exists with `applies_to.rules: ["rule-tool-integration-same-commit-dep"]` (NO `consolidates` field — no precedent)
- [ ] `pnpm test` passes with net delta = +3 tests (1308 → 1311)
- [ ] New regression test `gate-logic-consult-checklist-tool-integration.test.js` passes (3 tests inside)
- [ ] Journal entry at `plans/reports/journal-260628-fallow-tool-integration-rule.md` summarizes the ship

## Risk Assessment (plan-level)

- **R1 (Phase 2) — `meta_state_promote_rule` rejects the JSON-encoded pattern body.** Mitigation: dry-run preview first; mirror the exact shape of `rule-pr-body-registry-deltas` (line 167) and `rule-runtime-agnostic-features` (line 127). The `pattern` field is `z.string()`; the JSON body is the convention from existing rules.
- **R2 (Phase 2) — PROCESS_HINTS row text drifts from the rule body.** Mitigation: inline the 3 items in PROCESS_HINTS (matches `rule-pr-body-registry-deltas` precedent at line 119); add a Phase 5 test asserting the 4th PROCESS_HINTS row mentions the rule id (mirrors `__tests__/legacy-mcp/runtime-agnostic.test.js`).
- **R3 (Phase 4) — `meta_state_resolve` consult-gate blocks resolution.** Mitigation: the 3 findings are `active` (operator-acked) per the existing entries; resolution with `resolved_by: operator` + descriptive `resolution` text is the canonical path. No `resolution-evidence-required` rule applies.
- **R4 (Phase 5) — Cold-session discoverability test fails on new PROCESS_HINTS row.** Mitigation: the row mirrors the 3 existing rows; the test already validates PROCESS_HINTS count and presence. Verify `__tests__/cold-session-discoverability.test.cjs` doesn't count-assert PROCESS_HINTS strictly (search before shipping).

## Open Questions Surfaced for Operator

None blocking. Three soft questions deferred to operator (none changes the plan):

1. **PROCESS_HINTS ordering.** Place as 4th row (after line 119) or as 3rd (between lines 118 and 119)? Research recommends 4th because it groups it with `rule-runtime-agnostic-features` (similar operational class). Operator decides at Phase 2.
2. **PROCESS_HINTS inlining.** Inline the 3 items in the row text, or reference `core/README.md` §Tool integration checklist? Research recommends inline (matches existing precedent). Operator decides at Phase 2.
3. **Scope predicate.** Omit (always on) or `project_has_learning_loop_mcp`? Research recommends omit because the same-commit dependency check applies to any CI tool integration, not just learning-loop-mcp projects. Operator decides at Phase 2.

## Red Team Review

### Session — 2026-06-28
**Reviewers:** code-reviewer (×3): Security Adversary + Failure Mode Analyst + Assumption Destroyer
**Reports:**
- `reports/from-code-reviewer-to-planner-red-team-security-adversary-plan-review-report.md` (10 findings, 13 verifications)
- `reports/from-code-reviewer-to-planner-red-team-failure-mode-analyst-plan-review-report.md` (10 findings)
- `reports/from-code-reviewer-to-planner-red-team-assumption-destroyer-plan-review-report.md` (10 findings)
**Findings:** 16 unique after dedup (4 Critical, 7 High, 4 Medium, 1 Info)
**Disposition:** 16 accepted, 0 rejected, 1 confirmed

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| R-CRIT-1 | Hook mirror `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS must be updated in lockstep with `core/loop-introspect.js` — `cold-session-discoverability.test.cjs:366-386` strictEqual-enforces parity | Critical | Accept | Phase 2 files list + new step 5a; plan.md Architecture + Modify list |
| R-CRIT-2 | `meta_state_promote_rule` requires both `id` (source finding id) and `rule_id` (new rule id); plan omits `id` parameter, which causes `not_found` error at line 40-44 of the tool | Critical | Accept | Phase 2 step 2 — add `id: "meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but"` |
| R-CRIT-3 | Plan's custom `description` in Appendix A cannot land — `meta-state-promote-rule-tool.js:169` hard-codes `description: \`Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.\`` | Critical | Accept | Appendix A: drop custom description; accept tool-generated form |
| R-CRIT-4 | Test imports `PROCESS_HINTS` directly, but only `buildProcessHints()` is exported (`core/loop-introspect.js:116,135-137`) — causes `SyntaxError` on module load | Critical | Accept | Phase 5 step 2: change to `import { buildProcessHints }` |
| R-HIGH-1 | PROCESS_HINTS line 120 is `]);` (closing bracket), not a row insertion point | High | Accept | Phase 2 step 5 + Architecture: clarify "between line 119 and `]);`" |
| R-HIGH-2 | Precedent cited (`meta-260622T1708Z-...` line 158) is `status: superseded` with `consolidated_into`, NOT `resolved` as claimed — wrong citation | High | Accept | plan.md Overview + References: drop precedent; reframe rationale |
| R-HIGH-3 | `rule-no-orphaned-evidence` is a global `resolution-evidence-required` rule; finding 1 lacks `code_fingerprint` and would fail `checkResolutionEvidence` | High | Accept | Phase 4 step 1.5 (NEW): call `meta_state_refresh_fingerprint` for finding 1 |
| R-HIGH-4 | `meta_state_log_change` 60s idempotency cache silently no-ops on retry with same args (verified at `meta-state-log-change-tool.js:9, 69-80`) | High | Accept | Phase 4 step 6: add retry strategy (vary `reason` on retry) |
| R-HIGH-5 | Phase 4 resolves findings BEFORE `loop_describe({tier: warm})` smoke test; no rollback (no `meta_state_unresolve`) | High | Accept | Phase 2 step 6 (NEW): smoke test before Phase 4 begins |
| R-HIGH-6 | `consolidates` field has no precedent (`meta-260623T1450Z-...` line 168 doesn't use it); plan invents a new convention | High | Accept | Phase 4 step 6: drop `consolidates`; use `applies_to.findings` instead (or omit per precedent) |
| R-HIGH-7 | H6 ordering gate at `loop-describe-tool.js:90-102` is a substring match — drift risk if PROCESS_HINTS row paraphrases rule id | High | Accept | Phase 5 step 2: strengthen test to assert literal id presence (not just substring) |
| R-MED-1 | Architecture claim "(no production code, no schema, no CI workflow changes)" is wrong — `core/loop-introspect.js` IS production code consumed by `loop-describe-tool.js:88` | Medium | Accept | plan.md Architecture: corrected to "(no schema migration, no CI workflow)" + 2 production files touched |
| R-MED-2 | Test count claim "+1 (1308 → 1309)" inconsistent with file having 3 tests → should be "+3 (1308 → 1311)" | Medium | Accept | plan.md Acceptance + Phase 5 step 4: correct to +3 |
| R-MED-3 | PROCESS_HINTS count assertion `strictEqual(..., 4)` is brittle — couples test to every future edit | Medium | Accept | Phase 5 step 2: drop count assertion; keep only `includes(RULE_ID)` |
| R-MED-4 | `preview: true` dry-run is a no-op for `consult-checklist` pattern_type (only `regex`/`glob` are previewed per `meta-state-promote-rule-tool.js:82-108`) | Medium | Accept | Phase 2 step 1: drop preview step |
| R-MED-5 | `meta_state_promote_rule` bumps `version` on source finding via `updateEntry(root, id, { status: "active" })` (line 178-179) even if status unchanged — silent side effect | Medium | Accept | Phase 2 Architecture: document side-effect; Phase 4 change-log mentions in `change_diff.changed` |

**Rejected findings:** none.

**Confirmed findings (no fix needed):**
- Plan's claim that `meta_state_promote_rule` writes via MCP tool (not direct write) matches the write gate's behavior — verified
- Plan's claim that test discovery in `run-pnpm-test-namespaced.mjs:31` glob matches the new filename — verified (low risk)

### Whole-Plan Consistency Sweep

**Files reread:** plan.md, phase-01-design-rule-shape.md, phase-02-promote-rule-add-process-hints.md, phase-03-document-checklist-in-core-readme-md.md, phase-04-resolve-3-findings-write-change-log.md, phase-05-verification-journal.md

**Decision deltas checked:** 16 (one per accepted finding)

**Reconciled stale references:**
- "no production code" → "no schema migration, no CI workflow; 2 production files touched" (plan.md Architecture)
- PROCESS_HINTS line 120 → "between line 119 and `]);` line 120" (plan.md + Phase 2)
- "consolidated_into targets change-log entries" — line reference corrected from 140-141 to 75-76 (the actual schema constraint lives on the finding side, not change-log side)
- `meta-260622T1708Z-...` precedent → dropped from rationale (was the wrong precedent)
- `consolidates` field → dropped from Phase 4 step 6 (no precedent)
- "delta = +1" → "delta = +3 (1308 → 1311)" (plan.md Acceptance + Phase 5)
- Appendix A custom description → dropped (tool overrides at line 169)
- Phase 2 step 1 preview → removed (no-op for consult-checklist)
- Phase 4 step 1.5 (NEW) → added: `meta_state_refresh_fingerprint` for finding 1
- Phase 2 step 5a (NEW) → added: mirror row to `.factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS`
- Phase 2 step 6 (NEW) → added: smoke test `loop_describe({tier: warm})` returns `warnings: []` before Phase 4
- Phase 4 step 6 → added retry strategy for `meta_state_log_change` 60s cache
- Phase 5 test imports → `PROCESS_HINTS` → `buildProcessHints()`
- Phase 5 PROCESS_HINTS count assertion → dropped (kept only `includes(RULE_ID)`)

**Unresolved contradictions:** 0

## Validation Log

### Session 1 — 2026-06-28
**Trigger:** `/ck-plan --deep` invoked; red-team review accepted 16 findings; validation interview confirms 4 operator decisions.
**Verification tier:** Skipped (Red Team Review section already contains full verification evidence per validate-workflow.md Step 2.5 guard).
**Questions asked:** 4

#### Questions & Answers

1. **[Operator mode]** The plan calls `meta_state_promote_rule` which requires `OPERATOR_MODE=1` env var (verified at `meta-state-promote-rule-tool.js:55-65`). Should the plan include explicit setup for this, or assume the operator sets it before Phase 2?
   - Options: Assume operator sets | Add bootstrap script | Modify tool to bypass
   - **Answer:** Add a one-time bootstrap script
   - **Rationale:** Future operator-only operations (other rule promotions, change-log entries with `supersedes` chains) will hit the same gate. A reusable script saves the env-var check ceremony on every call.
   - **Propagated:** Phase 2 step 1 (NEW sub-step): invoke `tools/scripts/enable-operator-mode.sh` before calling `meta_state_promote_rule`. New file in plan.md Create list.

2. **[Affected system]** `meta_state_promote_rule` doesn't set the `affected_system` field on the new rule entry. Should we patch it after promotion, or leave absent?
   - Options: Patch via meta_state_patch | Leave absent | Document as 5th PROCESS_HINTS
   - **Answer:** Patch via meta_state_patch after promotion (Recommended)
   - **Rationale:** Makes the new rule discoverable via `meta_state_list({affected_system: "gate-logic", entry_kind: "rule"})`. Mirrors the source findings' field. ~2 min effort.
   - **Propagated:** Phase 2 step 3 (NEW): call `meta_state_patch({id: RULE_ID, entry_kind: "rule", patch: {affected_system: "gate-logic"}})`. Update Phase 4 change-log `change_diff.added` to include `"affected_system: gate-logic (via meta_state_patch post-promotion)"`.

3. **[Loop design]** Should this plan file a `loop-design` entry capturing the meta-pattern "encode N anti-pattern findings as a single consult-checklist rule when they share a domain"?
   - Options: File as Phase 4.5 | Leave as future | Skip
   - **Answer:** File loop-design entry as Phase 4.5 (Recommended)
   - **Rationale:** Closes the loop on the design decision; future plans can leverage the meta-pattern. ~5 min effort.
   - **Propagated:** New Phase 4 step 8.5: call `meta_state_propose_design` with the meta-pattern. Update journal followups to remove the now-completed item.

4. **[Journal timing]** Should the journal entry be the last step (after ck plan check)?
   - Options: Keep before check (current) | Move after | Split pre+ship
   - **Answer:** Keep journal BEFORE final ck plan check (Recommended)
   - **Rationale:** If journal write fails, ck plan check stays pending — surface failure mode clearly. Current ordering preserved.
   - **Propagated:** No change needed.

#### Confirmed Decisions
- **Operator setup:** New file `tools/scripts/enable-operator-mode.sh` exports `OPERATOR_MODE=1`.
- **affected_system:** Phase 2 step 3 patches the new rule with `affected_system: "gate-logic"`.
- **Loop design:** Phase 4 step 8.5 files `meta_state_propose_design` for the meta-pattern.
- **Journal timing:** Unchanged — journal before final ck plan check.

#### Action Items
- [x] Add `tools/scripts/enable-operator-mode.sh` to plan.md Create list
- [x] Add Phase 2 step 1.5 (script invocation) + step 3 (affected_system patch)
- [x] Add Phase 4 step 8.5 (loop-design propose)
- [x] Update Phase 4 change-log `change_diff.added`
- [x] Update journal followups to remove completed loop-design item
- [x] Document this Validation Log

#### Impact on Phases
- **Phase 2:** +2 steps (script invocation + affected_system patch)
- **Phase 4:** +1 sub-step (loop-design propose); updated change-log
- **Phase 5:** Journal followups updated (remove now-completed item)

### Whole-Plan Consistency Sweep (post-validation)

**Files reread:** plan.md, phase-01-design-rule-shape.md, phase-02-promote-rule-add-process-hints.md, phase-03-document-checklist-in-core-readme-md.md, phase-04-resolve-3-findings-write-change-log.md, phase-05-verification-journal.md

**Decision deltas checked:** 4 (one per validation answer)

**Reconciled stale references (4):**
- `plan.md:3` (description frontmatter): added "(no consolidates field — no registry precedent)" + "File a loop-design entry capturing the meta-pattern"
- `plan.md:43` (Phase 5 TDD Gate): "delta = +1 (1308 → 1309)" → "delta = +3 (1308 → 1311)" + "3 tests inside"
- `plan.md:80` (Architecture decision #2): reframed rationale (the original `meta-260622T1708Z-...` precedent cited at meta-state.jsonl:158 is itself `status: superseded, consolidated_into: change-log-id` — this plan establishes the `resolved`+rule-id-in-resolution pattern as a NEW convention, not a precedent)
- `plan.md:42` (Phase 4 TDD Gate): "applies_to.rules + consolidates" → "applies_to.rules (NO consolidates) + loop-design entry filed"

**Stale references detected and removed (0):** None remaining after the 16 red-team fixes + 4 validation fixes.

**Cross-file consistency verified:**
- `consolidates` field: dropped from all 6 files (no remaining references except in journal lessons explaining WHY it's not used)
- `affected_system` field: appears consistently in Phase 2 (patch step), plan.md (Modify list + Acceptance criterion), and Phase 5 journal (lesson about the field)
- `meta_state_propose_design` tool: appears in Phase 4 (step 9) + plan.md References (validation Q3 propagation)
- `OPERATOR_MODE=1` requirement: appears in Phase 2 step 1 (script invocation) + Phase 2 R5 (mitigation)
- Test count "+3 (1308 → 1311)": appears in plan.md (Acceptance + Phase 5 TDD Gate) and Phase 5 (Functional requirement + journal delta)
- PROCESS_HINTS row insertion: "between line 119 and `]);` line 120" appears consistently in plan.md (Architecture + References) and Phase 2 (Architecture + step 5)
- `import { buildProcessHints }`: appears in Phase 5 step 2 (test file content)

**Unresolved contradictions:** 0

**Recommendation:** Plan is consistent after 16 red-team findings + 4 validation answers applied. Ready for implementation via `/ck:cook plans/260628-1337-fallow-tool-integration-rule-encoding/plan.md`.

## References

- Source journal: `plans/reports/journal-260627-phase-e-dead-code-sweep-shipped.md`
- Origin plan: `plans/260627-2042-phase-e-dead-code-sweep/plan.md`
- Design research: `plans/260628-1337-fallow-tool-integration-rule-encoding/reports/researcher-260628-fallow-followup-rule-design-report.md`
- Red-team reports: `plans/260628-1337-fallow-tool-integration-rule-encoding/reports/from-code-reviewer-to-planner-red-team-{security-adversary,failure-mode-analyst,assumption-destroyer}-plan-review-report.md`
- Rule precedent: `rule-pr-body-registry-deltas` (meta-state.jsonl:167)
- Rule precedent: `rule-runtime-agnostic-features` (meta-state.jsonl:127)
- Change-log precedent: `meta-260623T1450Z-...` (meta-state.jsonl:168)
- Schema source: `tools/learning-loop-mastra/core/meta-state.js:164-197` (`metaStateRuleEntrySchema`)
- Schema source: `tools/learning-loop-mastra/core/meta-state.js:75-76` (finding `consolidated_into` requirement)
- Gate behavior: `tools/learning-loop-mastra/core/gate-logic.js:762-767` (`applyPromotedRules` skips consult-checklist)
- H6 ordering gate: `tools/learning-loop-mastra/tools/legacy/loop-describe-tool.js:90-102`
- Test precedent: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist.test.js`
- Cold-session parity test: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs:366-386`
- Hook mirror: `.factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS`
- Tool source: `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js:23-200`
- Tool source: `tools/learning-loop-mastra/tools/legacy/meta-state-resolve-tool.js:87-117` (checkResolutionEvidence)
- Tool source: `tools/learning-loop-mastra/tools/legacy/meta-state-log-change-tool.js:9, 69-80` (60s idempotency cache)

---

## Appendix A: Frozen rule body (Phase 1 deliverable)

> **IMPORTANT (per R-CRIT-3):** `meta_state_promote_rule` hard-codes `description` at line 169 as `` `Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.` ``. The custom `description` below CANNOT be installed — the tool overrides it. The pattern body IS installed correctly; only the description text is auto-generated.

This is the **MCP tool input shape**, NOT a meta-state entry. The tool builds the entry internally (line 160-173 of `meta-state-promote-rule-tool.js`).

```json
{
  "id": "meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but",
  "rule_id": "rule-tool-integration-same-commit-dep",
  "enforcement": "agent",
  "pattern_type": "consult-checklist",
  "pattern": "{\"version\":1,\"items\":[{\"id\":\"same-commit-dependency\",\"description\":\"When a workflow adds pnpm exec <tool>, npx <tool>, or npm run <script>, the tool MUST be in devDependencies (or dependencies) in the SAME commit. Verify with `grep '<tool>' package.json` after any .github/workflows/*.yml edit. Symptom of skip: CI's `pnpm install --frozen-lockfile` fails with `command not found` on the first PR.\"},{\"id\":\"baseline-flag-format\",\"description\":\"When wiring `fallow audit` in CI, generate baselines with `fallow <sub> --save-baseline <path>` (audit format: array of `path:export` strings). NEVER `--save-regression-baseline` (regression format: nested objects). The two flags produce INCOMPATIBLE JSON; the audit --*-baseline flag fails to parse the regression format.\"},{\"id\":\"baseline-storage\",\"description\":\"`fallow` auto-creates `<root>/.fallow/.gitignore: *` that silently gitignores `<root>/.fallow/baselines/`. Verify `git ls-files <root>/.fallow/baselines/` returns expected files BEFORE committing. Prefer `plans/<plan-slug>/reports/fallow/` (which inherits plan gitignore); if you must keep at `<root>/.fallow/baselines/`, add `!.fallow/baselines/` exception to root `.gitignore`.\"}]}"
}
```

The tool will then write a rule entry at meta-state.jsonl with:
- `id: rule_id` → `rule-tool-integration-same-commit-dep`
- `origin: id` → `meta-260628T1328Z-commit-6f9402e-...`
- `description` (auto-generated, not the custom one)
- `status: "active"`, `promoted_at: <now>`, `promoted_by: "operator"`
- (Note: `affected_system` is NOT set by the tool — only manual `writeEntry` would set it; the registry will lack this field for this rule. This is consistent with `rule-pr-body-registry-deltas` at meta-state.jsonl:167.)