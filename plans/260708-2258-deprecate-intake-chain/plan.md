---
title: "Deprecate the intake chain (orient + plan) — confirm loop_describe as the bound-surface orient"
status: completed
---

# Plan: Deprecate the intake chain (orient + plan) — confirm `loop_describe` as the bound-surface orient

**Status:** PLAN_CUT (validation + cook pending)
**Date:** 2026-07-08
**Source:** `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md` Rec 4 reconciliation + operator decision 2026-07-08 (scrap `workflow_intake_orient`; `loop_describe` stays the bound-surface orient).
**Branch:** `deprecate-intake-chain` (off main @ `96bdf34`)

## Context

Rec 4 of the ck-predict report (2026-07-04) recommended re-pointing `workflow_intake_orient` to the bound meta-surface. Reconciliation against the current codebase surfaced two facts that changed the scope:

1. **The records substrate was restructured after the report was written.** Product records moved to `records/_unbound/` (208 files, explicitly named "unbound"); the meta-surface is `records/meta/`. The paths `workflow_intake_orient` reads — `records/{index,capabilities,decisions}` + `records/{vnstock,fastapi,tanstack,product}/...` — are **absent**. The tool silently returns empty against a dead layout.
2. **`loop_describe` is already the bound-surface orient.** `core/loop-introspect.js` reads only `meta-state.jsonl` + `file-index.jsonl` + `runtime-state.jsonl` + manifest + schemas — never `records/_unbound/`. `loop-introspect.js:115` already states "the meta-surface is the only bound surface; the product surface is unbound and archived."

Operator decision (2026-07-08): scrap the whole `workflow_intake_orient` tool; keep `loop_describe` scoped to the bound meta-state surface (already true — verify, do not change).

## Scope

- **Delete** `workflow_intake_orient` (MCP tool + workflow + manifest entry).
- **Delete** `workflow_intake_plan` (MCP tool + workflow + manifest entry) — the coupled pair. Its only input is `orient_result`; with orient gone and `loop_describe` covering bound-surface orientation, plan's product-intake verification planning is obsolete dead code. (Alternative — rework plan to self-source from the registry — is rejected: it would duplicate `loop_describe`'s role. Noted in risks.)
- **Keep** `mastra_workflow_notify_artifact` (separate, useful, not part of the intake pair).
- **Out of scope:** `intake_agent` / `intakeAgent` / `ask_intake_agent` / `mastra/agents/instructions/intake-agent.js` — the *agentic* orient+plan surface. Rec 4 was about the *deterministic workflow* pair only. The agent is live (in the MCP tool list) and orients to meta-state (bound surface); it is a separate decision whether it is also redundant with `loop_describe` — flagged as UQ1, NOT blocked on here. Baseline `dead-code-baseline.json:61` (intake-agent.js) stays.
- **`server.js` needs no edit** — verified 0 intake refs; it registers workflows data-driven from `workflows-manifest.json`. Removing 2 manifest entries is sufficient.
- **Verify** `loop_describe` reads only the bound surface (acceptance check; no code change expected — verified: `loop-introspect.js` + `loop-describe-tool.js` read only `meta-state.jsonl`/`file-index.jsonl`/`runtime-state.jsonl`/manifest/schemas).
- **Clean up** all references: `workflows-manifest.json`, `agent-manifest.json` (tools + `typical_chain`), reference docs, onboarding doc, 3x `coordination-gate/SKILL.md`, baselines, scout fixture, 8 test files.
- **Record** a `meta_state_log_change` (Rec 12 trigger — `tools/**` source edit is a bound-artifact change; shipped via PR #40/#41).

## Phases

- `phase-01-deprecate-intake-chain.md` — delete orient + plan; update manifests, refs, baselines, tests; verify `loop_describe` bound-surface; record change-log.

## Dependencies

None. Independent of the shipped lifecycle arc (PR #38-41) and of Rec 5 (legacy rename).

## Acceptance criteria

1. `mastra/workflows/workflow-intake-orient.js` and `workflow-intake-plan.js` deleted.
2. `run_workflow_intake_orient` and `run_workflow_intake_plan` absent from `agent-manifest.json` (tools + `typical_chain`).
3. `workflows-manifest.json` has 8 entries (was 10); no orient/plan entries.
4. **Count invariants** (manifest-arithmetic + workflow-parity tests green at): `agent-manifest.json#groups` total = 43 (was 45); `groups.workflow.tools` length = 11 (was 13); MCP server `run_workflow_*` count = 8 (was 10); total MCP tools = 43 (was 45).
5. No live reference to `workflow_intake_orient` / `workflow_intake_plan` / `run_workflow_intake_orient` / `run_workflow_intake_plan` / `workflowIntakeOrient` / `workflowIntakePlan` / `orient_result` outside `docs/_archive*/`, `plans/` history, `records/_unbound/`. Re-grep across `tools/`, `.claude/`, `.factory/`, `.mastracode/`, `docs/` confirms zero.
6. `loop_describe` verified bound-surface-only (grep `loop-introspect.js` + `loop-describe-tool.js` for `records/_unbound` / `records/meta` → none); no code change made to it.
7. **All 8 affected test files** green after precise edits: `manifest-arithmetic`, `workflow-parity`, `workflow-direct-parity`, `legacy-cleanup`, `tool-deletion-coverage`, `mastra-code-smoke`, `mcp-tools-list-parity`, `phase-e-shell-restructure/shell-files-in-mastra-dir`.
8. Import-chain analysis run after deletion (gate rule `rule-import-chain-analysis-after-tool-deletion`); no transitive consumer of the deleted files remains.
9. `meta_state_log_change` recorded **per bound-artifact file** (2 workflow files + 2 manifests + 4 ref/onboarding docs + 3x `coordination-gate/SKILL.md` + `orchestration-patterns.md`), **committed in-PR** (clean `git revert`).
10. PR body enumerates each new change-log entry as the registry delta per `rule-pr-body-registry-deltas`.
11. `intake_agent` / `intakeAgent` / `ask_intake_agent` untouched (out-of-scope agent surface); `dead-code-baseline.json:61` (intake-agent.js) retained.

## Risks / rollback

- **Test-contract traps (red-team C1-C4):** 4 load-bearing count assertions the original touch list missed (`manifest-arithmetic:51` total 45→43, `workflow-parity:165-166` runWorkflows 10→8 + tools 45→43, `legacy-cleanup:61` file-existence, `workflow-direct-parity:350-372` 5th test). All now in the touch list. Missing any → CI fails.
- **Live doc/skill refs (red-team H1/H2):** 3x `coordination-gate/SKILL.md` + `orchestration-patterns.md:5` were omitted; now in scope. Without them, acceptance criterion 5 is violated.
- **`tool-deletion-coverage` phantom guard (M1):** the `includes(bare) === false` assertion is a no-op; do not claim recategorization "preserves" a guard. Optional: strengthen to `includes("run_"+tool) === false`.
- **Pre-existing `coordination-gate/SKILL.md` drift:** line 24 lists already-deleted tools + line 16 "40 tools" stale — not caused by this plan, out of scope; flagged as a separate follow-up.
- **Change-log rollback cleanliness:** change-log appends MUST be in-PR or `git revert` leaves orphan registry entries.
- **Rollback:** `git revert` the PR (change-logs in-PR → clean). No schema migration.

## Open questions

1. **`intake_agent` deprecation?** The *agentic* orient+plan surface (`intake_agent`/`intakeAgent`/`ask_intake_agent`/`intake-agent.js`) is out of scope here — Rec 4 targeted only the *deterministic workflow* pair. `intake_agent` orients to meta-state (bound surface), so it may itself be redundant with `loop_describe`. Separate decision; if yes, a follow-up plan deprecates it (touches `agents-manifest.json`, `mastra/agents/instructions/intake-agent.js`, `mastra-code-smoke.test.cjs:85` example, `dead-code-baseline.json:61`). Not blocking.

## Source lineage

- Report: `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md` (Rec 4, now reframed).
- Tracker: `plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md` (independent of Plans 1-4).
- Engine framing: `docs/loop-engine.md` (bound/unbound surfaces; the `record` role).