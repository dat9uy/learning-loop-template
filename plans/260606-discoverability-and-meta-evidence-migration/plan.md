---
title: "Discoverability + Meta-Evidence Migration (Position D)"
description: "Closes the 2 active 2026-06-01 findings by surfacing the existing evidence_code_ref + mechanism_check workflow in loop_describe warm tier. Drops records/meta/evidence/ entirely. Internalization rule becomes 'cite the code, not the markdown.' Cold-session test (Approach 2, real subprocess spawn) is the acceptance gate. No new entry kind, no new MCP tool — the existing SP1/SP2 infrastructure is the answer. TDD structure: tests first for every contract (validator, loop_describe warm tier, SessionStart hook, cold-session acceptance). 11 file changes across 5 phases."
status: pending
priority: P2
branch: "main"
tags: [meta, discoverability, meta-state, evidence_code_ref, mechanism_check, cold-session-test, internalization, code-citation, tdd]
blockedBy:
  - "260605-superseded-status-and-discoverability"  # Phase 3 closed superseded_lineage surface; this plan extends discoverability further with warm-tier hints
blocks: []
related:
  - meta-state.jsonl entry meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz (Phase 4 closes this finding)
  - meta-state.jsonl entry meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th (Phase 4 closes this finding)
  - plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md (source design; locked decisions originate here)
  - plans/reports/brainstorm-260602-self-enforcing-loop-architecture.md (parent doc for the meta-state-as-registry pattern)
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (origin of the SP0-SP3 affordances; this plan extends discoverability further)
  - plans/260605-superseded-status-and-discoverability/plan.md (Phase 3 closed superseded_lineage surface; Phase 4 closed MCP-connection gap)
  - plans/260602-strict-mcp-call-rules/plan.md (origin of the SessionStart hook pattern extended in Phase 2)
  - docs/journals/260606-discoverability-p2-handoff.md (prior-session handoff; framing for this work)
  - docs/observation-vs-meta-state.md (target doc for amendment in Phase 2)
  - docs/philosophy.md (target doc for amendment in Phase 2)
  - AGENTS.md (target doc for amendment in Phase 2)
  - tools/learning-loop-mcp/lib/source-ref-validator.js (Phase 1 target; existing 13-test contract)
  - tools/learning-loop-mcp/lib/source-ref-validator.test.js (Phase 1 test file to extend)
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js (Phase 1 target; description amendment)
  - tools/learning-loop-mcp/tools/loop-describe-tool.js (Phase 2 target; warm-tier discoverability_hints addition)
  - tools/learning-loop-mcp/core/loop-introspect.js (Phase 2 target; buildDiscoverabilityHints() function)
  - .factory/hooks/loop-surface-inject.cjs (Phase 2 target; print hints on session start)
  - .factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs (Phase 3 pattern reference for real-spawn test)
  - tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js (Phase 2 new test file)
  - tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs (Phase 3 new test file)
  - meta-state.jsonl (Phase 4 mutates 2 finding entries + adds 1 change-log entry)
  - records/meta/evidence/ (Phase 1 deletes the directory)
created: "2026-06-06T05:15:00Z"
createdBy: "ck:plan --tdd (Position D from brainstorm-260606-discoverability-and-meta-evidence-migration.md)"
source: skill
---

# Discoverability + Meta-Evidence Migration (Position D)

## Overview

The 2 active 2026-06-01 findings (`meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz` and `meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th`) are closed by **surfacing the existing `evidence_code_ref` + `mechanism_check` workflow in `loop_describe` warm tier**, not by adding a new entry kind. `records/meta/evidence/` is dropped entirely. The internalization rule becomes *"cite the code, not the markdown."* A real cold-session subprocess test (Approach 2) is the acceptance gate — it spawns a fresh `droid` subprocess and asserts the agent uses `evidence_code_ref` (not markdown paths) when citing.

**Surface:** `meta` (loop's own machinery, not `product/**`). No product preflight needed.

**TDD contract:** every phase writes tests FIRST against the desired contract, runs them (red), then implements to make them pass (green). Phase 3's deliverable IS a test — the cold-session acceptance test is both the contract lock and the regression guard.

**Total estimated effort:** ~9.5h across 5 phases. No new MCP tool, no new entry kind, no new schema fields.

## Phase Structure (4 work phases + phase 0 scaffolding)

| Phase | Title | TDD Tests | Effort | Files |
|-------|-------|-----------|--------|-------|
| 0 | Scaffolding | 0 (scaffold only) | 0.25h | 0 |
| 1 | Validator accepts `local:meta-state:*` + new error message + meta_state_report description amendment + `record_create_decision` rejects deprecated refs + core validator alignment | 10 (+ 2 replaced) | 2.5h | 6 |
| 2 | `discoverability_hints` in `loop_describe` warm tier + SessionStart hook prints hints (LOCAL hardcoded copy) + hint-downgrade audit + 3 doc amendments | 7 | 3.5h | 6 |
| 3 | Cold-session discoverability test (real subprocess spawn with mkdtempSync isolation) | 1 | 4h | 1 |
| 4 | Closeout: resolve 2 active findings + add 1 change-log entry (direct I/O via `core/meta-state.js`) | 0 (housekeeping) | 0.5h | 1 |

**Total: 18 new tests, 2 existing tests replaced, ~10.75h.** Files: 14 create/modify.

## Locked Design Decisions (from brainstorm + operator scope + Red Team Review)

The following 15 decisions are locked and will not change during cook:

1. **Position chosen:** D (use existing `evidence_code_ref` + `mechanism_check`). Positions A (`excerpt` entry kind), B (`subtype: "internalization"` finding), and C (`change-log` reuse) were all rejected; see brainstorm for rationale.
2. **No new entry kind.** No `excerpt`. No new MCP tool. The schema and tool surface stay as-is.
3. **Drop `records/meta/evidence/`.** Delete the directory in Phase 1. The 2 already-archived observations (`obs-mpef2h6z-9fefeed8` records-evidence, `obs-mpfnglt7-abac55c4` records-evidence-meta) stay archived; no mutation. **CORRECTION (Red Team Review Finding 1):** the 2 archived observations carry `source_refs: ["local:.claude/.../write-coordination-gate.cjs", "local:CLAUDE.md"]` and `["local:constraint-gate-mcp"]` — paths the validator would already reject. They stay as historical artifacts (no re-validation).
4. **New accepted source_ref pattern:** `local:meta-state:<id>` with TIGHTENED regex `^meta-\d{6}T\d{4}Z-[a-z0-9-]{1,200}$` (mirrors `core/meta-state.js#generateId`), path-traversal rejection (`..`, `/`, `\0`, `\\`), AND a `readRegistry(root)` existence check. The old `local:records/meta/evidence/*` pattern is REMOVED. (Red Team Review Finding 5 — fake-citation + path-traversal mitigation.)
5. **New validator error message:** *"source ref must be `local:meta-state:<id>` for code citations; markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged. Use `meta_state_report` with `evidence_code_ref` to cite code."*
6. **Markdown refs are deprecated and REJECTED by `record_create_decision`.** The validator returns `{ valid: true, deprecated: true }` for `local:plans/...` and `local:docs/...`, AND the `create-decision-record-tool` handler is updated to refuse records with any deprecated source_ref. The deprecation is forward-only (existing records with markdown refs are not retroactively invalidated). (Red Team Review Finding 10 — markdown deprecation must be real, not advisory.)
7. **`meta_state_report` description amendment** adds the downgraded sentence: *"Use this to internalize external references for `source_refs`. Optional but recommended: pass `evidence_code_ref` (code location) so the loop can hash and re-check it on demand via `meta_state_derive_status`. Markdown paths in `source_refs` are deprecated and will be rejected by `record_create_decision`."* The wording downgrade from "Prefer" to "Optional but recommended" matches the schema's actual `optional()` constraint. (Red Team Review Finding 15 — description-vs-schema drift.)
8. **`discoverability_hints` field on `loop_describe` warm tier** returns exactly 5 strings (citation, source-ref, grounding, no-code edge case, status lifecycle). Built by a new `buildDiscoverabilityHints()` function in `core/loop-introspect.js` so the data source is testable in isolation. **The SessionStart hook renders the hints from a LOCAL hardcoded copy (`LOCAL_DISCOVERABILITY_HINTS`); the server's `discoverability_hints` field is IGNORED at render time.** (Red Team Review Finding 4 — prompt-injection via server response.)
9. **SessionStart hook upgrade:** `.factory/hooks/loop-surface-inject.cjs` upgrades from `tier: "summary"` to `tier: "warm"`. New env gate `LL_LOOP_INJECT_TIER` (default `warm`, override to `summary` for context-budgeted sessions) preserves the existing escape hatch. **When `LL_LOOP_INJECT_TIER=summary`, the hook logs a `meta_state_report` finding with `subtype: "hint-downgrade"` and `session_id` BEFORE rendering — the downgrade is auditable, not silent.** (Red Team Review Finding 6.)
10. **Doc amendments** (3 files): `AGENTS.md` gets a new "Internalization Rule" section (between Budget-Check Rule and Side-Effect Import Rule) + `LL_LOOP_INJECT_TIER` env var documentation; `docs/observation-vs-meta-state.md` gets a new "Internalization via Code-Pointed Findings" section; `docs/philosophy.md` pillar 3 gets a new sentence.
11. **Cold-session test (Phase 3):** new file `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`. Spawns a real `droid` subprocess against a `mkdtempSync` project root (NOT the real project). Captures the tool-call log and asserts (in any order — NO order assertion) the agent called `meta_state_report` with `evidence_code_ref` and `mechanism_check: true`, and the resulting record has `source_refs: ["local:meta-state:..."]`. **The test does NOT assert on call ORDER (the original "BEFORE record_create_decision" requirement was a self-contradiction with the Architecture section; both cannot be true).** (Red Team Review Finding 4 — order self-contradiction.)
12. **Cold-session test isolation guarantees:** uses `mkdtempSync` for project root; the test does NOT pollute the project's `meta-state.jsonl` or `records/<surface>/decisions/`. A post-test `git status --porcelain` assertion verifies the real project files are unchanged. Test gracefully skips (via silent `return`, matching the codebase convention) if `droid` CLI is not in PATH or `tools/learning-loop-mcp/server.js` is not present. (Red Team Review Findings 3 + 7 — CI-driven meta-state poisoning + skip convention.)
13. **Two-validator alignment:** Phase 1 modifies BOTH `tools/learning-loop-mcp/lib/source-ref-validator.js` (MCP wrapper) AND `tools/learning-loop-mcp/core/record-validation-rules.js#recordLocalRoots` (core validator) to keep them in sync. (Red Team Review Finding 9 — two-validator inconsistency.)
14. **Closeout housekeeping (Phase 4):** call `meta_state_resolve` on the 2 active findings (with `resolved_by: "operator"` per the schema enum constraint at `meta-state-resolve-tool.js:17`) + add 1 `change-log` entry with `consolidates: <2 ids>`. The change-log is written via DIRECT FILE I/O using `writeEntry` from `core/meta-state.js` (the MCP `meta_state_log_change` tool's zod schema drops the `consolidates` field per `meta-state-log-change-tool.js:11-32`). The change-log's `change_target` is a CODE point (e.g., `tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints`); the design citation goes in `evidence.journal`. (Red Team Review Findings 2 + 3 + 13 — MCP tool schema drops fields, enum constraint, self-contradictory `change_target`.)
15. **CI registration is OUT OF SCOPE for this plan.** The real-spawn test has no CI registration; adding CI registration to a CI-driven test creates a chicken-and-egg. Captured as a follow-up. (Red Team Review Finding 14.)

## Resolved Decisions (Pre-Plan Verification)

- **Q1 (operator, implicit):** "Is the brainstorm accepted as the design?" → YES. Status `draft` → `accepted` after this plan lands. No further design iteration.
- **Q2 (operator, prior session):** "MCP tools were not loaded into the agent's tool list this session" (meta-260606T0443Z). Phase 4 plans for the direct-file-I/O fallback. Phase 3's cold-session test exercises the full MCP path; it is independent of the cook session's tool availability.
- **Q3 (operator, scope):** "Records/observations/ stays as-is. Records/observations/archived pattern continues organically." → CONFIRMED. This plan does not touch the observations/ directory.

## Out of Scope (Captured as Follow-Ups)

- **Git-commit-hash extension to `evidence_code_ref`** (e.g., `path/to/file.js@commit_hash#L100-L120`). Punted per the brainstorm's Open Questions #1. The existing SHA-256 `code_fingerprint` catches content changes; commit pinning is a separate plan.
- **`summary` vs `warm` tier default in SessionStart hook** → addressed by `LL_LOOP_INJECT_TIER` env gate (locked decision #9) WITH the new audit-trail finding. Operators can override per-session; the override is auditable.
- **CI registration of the cold-session test** (Red Team Review Finding 14) → the real-spawn test has no CI registration; adding CI registration to a CI-driven test creates a chicken-and-egg. Captured as a follow-up.
- **Drift filter for the no-code rule** ("agent cited `local:plans/...` without first calling `meta_state_report`") → captured as a follow-up plan per the brainstorm's Success Metrics Anti-metric. YAGNI for this plan.
- **The 4 stale vnstock observations** (gate-flagged in this session's inbound state). Per the brainstorm's Open Questions #2: *"orthogonal to this report. They are domain state per `docs/observation-vs-meta-state.md`. The gate's date-based staleness check fires on them, but no actual state has changed."* No phase mutates them.
- **MCP client-side tool loading** (`meta-260606T0443Z-...`). This plan's Phase 3 cold-session test exercises the full MCP path; if the test reveals a deeper client-side loading bug, that becomes a separate plan. The current plan is robust to the bug (Phase 4 housekeeping has a direct-file-I/O fallback).
- **Phase 2 auto-mutation** (auto-resolve on operator ack) — not in this plan; captured in the prior SP3 plan.
- **A `meta_state_internalize` MCP tool** — explicitly rejected (Position A).
- **Adding `consolidates` to the `meta_state_log_change` MCP tool's zod schema** (Red Team Review Finding 2) — Phase 5 uses direct file I/O via `core/meta-state.js#writeEntry` to bypass the schema gap. A future plan could amend the tool's schema to accept `consolidates` (and the test in `__tests__/meta-state-log-change.test.js` would need updating).
- **Extending the `meta_state_resolve` `resolved_by` enum to accept `plan:*`** (Red Team Review Finding 3) — Phase 5 uses `"operator"` instead. A future plan could extend the enum.

## Inbound State Acknowledgement

The inbound state gate named 4 vnstock observations (`observation-vnstock-device-slot-ledger`, `observation-vnstock-import-reactivates-cleared-device`, `observation-vnstock-resource-budget`, `observation-vnstock-side-effect-import`) as stale. These are orthogonal to this plan (per Out of Scope + the brainstorm's Open Questions #2). No phase mutates them. The 2 active 2026-06-01 findings that this plan CLOSES (the gate's discoverability root cause) are addressed in Phase 4.

## Whole-Plan Consistency Gate (Pre-Cook Sweep)

Stale terms reconciled before recommending cook:
- "3 phases" (operator's "Next Steps" + brainstorm TL;DR) vs. "4 work phases + 1 scaffolding" (this plan) → reconciled in Phase Structure table. Phase 5 (closeout) is the housekeeping that the brainstorm's "Next Steps" lists as steps 4+5.
- "Real subprocess spawn" (Phase 3 test) vs. "agent tool-call log" (assertion shape) → both. The test spawns a subprocess AND captures the agent's tool-call log to assert the contract.
- "Markdown refs accepted" (locked #6) vs. "validator rejects markdown" (a misreading of the brainstorm) → reconciled. Markdown refs are accepted but flagged `deprecated: true`, AND `record_create_decision` rejects them. The discoverability hint is the primary signal; the validator's warning is the secondary signal; the handler's rejection is the enforcement.
- "No new entry kind" (locked #2) vs. "Phase 5 adds 1 change-log entry" (housekeeping) → reconciled. The new change-log is a HOUSEKEEPING entry (a meta-state lifecycle record, not a new schema). The 2 existing entry_kinds (`finding` + `change-log`) are unchanged.
- "BEFORE `record_create_decision`" (Phase 4 original Requirements) vs. "does NOT assert on call ORDER" (Phase 4 Architecture) → reconciled. Order assertions removed (Red Team Review Finding 4). The agent may interleave reads and writes.
- "13 existing tests still pass" (Phase 2 original) vs. "2 existing tests are REPLACED" (Phase 2 corrected) → reconciled. The 2 tests at `lib/source-ref-validator.test.js:21-27` and the meta/evidence test are REPLACED to assert the new behavior; the file goes from 18 tests to 23 tests (18 - 2 + 7 new in Phase 2, then 7 more in Phase 3, then 1 in Phase 4). Net new in this plan: 18 (10 in Phase 2 + 7 in Phase 3 + 1 in Phase 4).
- "Resolved by `plan:260606-...`" (Phase 5 original) vs. "schema enum rejects non-`operator`/`auto-resolve`" → reconciled. Use `resolved_by: "operator"` (Red Team Review Finding 3).

No unresolved contradictions as of plan creation.

## Red Team Review

### Session — 2026-06-06T05:30Z
**Findings:** 15 (4 Critical, 5 High, 6 Medium)
**Severity breakdown:** 4 Critical, 5 High, 6 Medium
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst (3 lenses for 5 phases per `references/red-team-personas.md`)
**Verification tier:** Standard (Fact Checker + Contract Verifier)
**Disposition:** All 15 ACCEPTED + APPLIED. The reviewers could not persist their individual report files (subagent tool set is read-only); the parent agent adjudicated inline and the user approved "Apply all 15" via AskUserQuestion.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Archived observations' `source_refs` claim is factually wrong (use `local:.claude/...`, `local:CLAUDE.md`, `local:constraint-gate-mcp` — not `local:meta-state:...`); Risk 1 grep is wrong directory | Critical | Accept | plan.md locked #3 + Phase 2 Risk 1 |
| 2 | `meta_state_log_change` MCP tool's zod schema silently drops `consolidates` field (`meta-state-log-change-tool.js:11-32`); Phase 5 verification would fail | Critical | Accept | Phase 5 Architecture + Step 5 (use direct I/O via `core/meta-state.js#writeEntry`) |
| 3 | `meta_state_resolve` schema enum `["operator", "auto-resolve"]` rejects `resolved_by: "plan:260606-..."` (`meta-state-resolve-tool.js:17`) | Critical | Accept | Phase 5 Step 3+4 (use `resolved_by: "operator"`) |
| 4 | Cold-session test self-contradictory: Requirements "BEFORE record_create_decision" (order) vs. Architecture "does NOT assert on call ORDER" | Critical | Accept | Phase 4 Requirements (drop order assertion) |
| 5 | `local:meta-state:<id>` regex permits fake-citation ids (non-existent prefixes), path-traversal-shaped ids, and prefixes `generateId` doesn't produce | High | Accept | Phase 2 Architecture + Step 2 (tighten regex + existence check) |
| 6 | Cold-session test claims idempotency with no interception mechanism; CI runs will pollute `meta-state.jsonl` + `records/<surface>/decisions/` | High | Accept | Phase 4 Architecture + Step 1 (`mkdtempSync` isolation + post-test `git status` assertion) |
| 7 | Phase 1 explicitly rejects `local:records/meta/evidence/*` but the plan claims 13 existing tests still pass; actual count is 18; 2 tests at `lib/source-ref-validator.test.js:21-27` will be REPLACED | High | Accept | Phase 2 Requirements + Related Code Files (update test count + acknowledge replacement) |
| 8 | `formatBlock` extension trusts MCP-server-sourced `discoverability_hints` strings → prompt-injection vector at session start | High | Accept | Phase 3 Architecture + Step 5.5 (LOCAL hardcoded copy `LOCAL_DISCOVERABILITY_HINTS`) |
| 9 | Two-validator inconsistency: `lib/source-ref-validator.js` modified but `core/record-validation-rules.js#recordLocalRoots` (line 174) not | High | Accept | Phase 2 Architecture + Step 3 (align both validators) |
| 10 | Markdown deprecation is opt-in (no caller reads `result.deprecated`); escape hatch remains indefinite | Medium | Accept | Phase 2 Architecture + Step 4.5 (wire `record_create_decision` to reject deprecated refs) |
| 11 | `LL_LOOP_INJECT_TIER` env var allows silent hook downgrade with no audit trail | Medium | Accept | Phase 3 Architecture + Step 5 (log `hint-downgrade` finding) |
| 12 | Cold-session test assertion 6 (no writes to `records/meta/evidence/`) is untestable as written — no filesystem watcher | Medium | Accept | Phase 4 Requirements (drop filesystem half; in-call assertion only) |
| 13 | Phase 5 change-log `change_target` is a markdown file → violates the plan's own internalization rule | Medium | Accept | Phase 5 Architecture + Step 5 (code point + `evidence.journal` for design) |
| 14 | Cold-session test pattern reference to "real-spawn test's CI registration" doesn't exist (verified by Failure Mode Analyst) | Medium | Accept | Phase 4 Out of Scope (CI registration is follow-up, not this plan) |
| 15 | Description-vs-schema drift on `meta_state_report`: description says "Prefer `evidence_code_ref`" but the field is `optional()` in the schema | Medium | Accept | Phase 2 Step 6 (downgrade to "Optional but recommended") + Step 5 test assertion |

### Whole-Plan Consistency Sweep (post-Red-Team)

After applying all 15 findings, re-read `plan.md` and every `phase-*.md` to reconcile. Updates applied:
- Phase structure table: test counts updated (10+7+1 = 18, not 13); files count updated (14, not 11); effort updated (10.75h, not 9.5h).
- Locked decisions: count updated from 13 to 15 (decisions 4, 6, 7, 8, 9, 11, 12, 14 amended per findings 1, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15).
- Out of Scope: 3 new items added (CI registration follow-up, `consolidates` schema amendment follow-up, `resolved_by` enum extension follow-up).
- Validation Log: appended with the Red Team Review session entry.

No unresolved contradictions remain after the consistency sweep.

## Validation Log

### Session 1 — 2026-06-06T05:15Z

- Operator accepted Position D design in `brainstorm-260606-discoverability-and-meta-evidence-migration.md` (status: draft → accepted on plan creation).
- Operator's instruction: `/ck:plan --tdd plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md`.
- Plan scaffolded via `ck plan create` (G8 subcommand-class P1 fix shipped earlier in the same session per `meta-260606T0225Z-...` + the splitSegments quote-aware fix shipped per the subsequent change-log; ck CLI invocation succeeded without triggering the rule). 5 phases + plan.md generated.
- Inbound state gate fired (vnstock observations). Acknowledged as orthogonal (Out of Scope). 2 active 2026-06-01 findings are the real gate target and are closed in Phase 5.
- meta-state.jsonl scanned; 4 most recent change-log entries confirm the G8 fix is fully shipped and the spawnAndCall chicken-egg fix is shipped. No follow-up needed.
- Whole-plan consistency sweep: corrected Phase 1 to remove the "G8 8th recurrence" claim (the G8 fix shipped before this plan was scaffolded; no 8th recurrence occurred). No other stale terms found.

### Session 2 — 2026-06-06T05:30Z (Red Team Review)

- Operator invoked `/ck:plan red-team` on the scaffolded plan.
- Spawned 3 hostile reviewers in parallel (Security Adversary + Assumption Destroyer + Failure Mode Analyst) per `references/red-team-personas.md` for 5 phases.
- Reviewers returned 30 findings total; deduped to 15 unique findings (4 Critical, 5 High, 6 Medium). All had `file:line` evidence.
- Operator approved "Apply all 15" via AskUserQuestion.
- Applied 15 findings to `plan.md` + 4 phase files. Added "Red Team Review" section to `plan.md` (this section).
- Whole-plan consistency sweep post-apply: phase counts, test counts, locked decision counts, Out of Scope items all reconciled. No unresolved contradictions.
- Reviewer report files were NOT persisted to disk (subagent tool set is read-only; user chose to skip persistence).
- Plan is ready for `/ck:plan validate` or `/ck:cook`.

## Validation Log

### Session 1 — 2026-06-06T05:15Z

- Operator accepted Position D design in `brainstorm-260606-discoverability-and-meta-evidence-migration.md` (status: draft → accepted on plan creation).
- Operator's instruction: `/ck:plan --tdd plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md`.
- Plan scaffolded via `ck plan create` (G8 subcommand-class P1 fix shipped earlier in the same session per `meta-260606T0225Z-...` + the splitSegments quote-aware fix shipped per the subsequent change-log; ck CLI invocation succeeded without triggering the rule). 5 phases + plan.md generated.
- Inbound state gate fired (vnstock observations). Acknowledged as orthogonal (Out of Scope). 2 active 2026-06-01 findings are the real gate target and are closed in Phase 4.
- meta-state.jsonl scanned; 4 most recent change-log entries confirm the G8 fix is fully shipped and the spawnAndCall chicken-egg fix is shipped. No follow-up needed.
- Whole-plan consistency sweep: corrected Phase 1 to remove the "G8 8th recurrence" claim (the G8 fix shipped before this plan was scaffolded; no 8th recurrence occurred). No other stale terms found.
