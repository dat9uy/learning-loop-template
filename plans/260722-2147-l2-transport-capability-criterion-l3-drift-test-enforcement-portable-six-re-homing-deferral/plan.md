---
title: "L2 transport-capability criterion + L3 drift-test enforcement + portable-six re-homing deferral"
description: "Land the per-function transport-capability axis at L2 (docs/runtime-contract.md) as a layer-ownership rule (stateless-by-default = transport-capable; stateful → runtime-state layer; MCP-only = server-state | operator-policy | agent-facing | deferred-rehoming override; capability ≠ wiring), then enforce it at L3 by extending the drift test to cover the 8 run_workflow_* tools (currently a blind spot — the test reads only manifest.json), adding reason tags, and reclassifying the 3 mastra_workflow_* helpers + 5 aux-read-ish tools out of MCP_RESIDUE into CLI_TOOLS. Records the portable-six re-homing as a deferred finding (no re-homing code this plan). Resolves the WORKFLOW_REGISTRY recommended_tools forward-reference (U-Q3 — the refs were deleted in plan 260612-1700). Follow-on to the audit report ak-problem-solving-260722-2125-workflow-tool-transport-home-audit.md and the sibling L2 report ak-problem-solving-260722-2050-l2-transport-capability-criterion.md."
status: completed
priority: P2
effort: "2-3d"
tags: [transport-capability, runtime-contract, cli-transport, drift-test, workflow-tools, meta-state, l2-contract]
created: 2026-07-22
blockedBy: []
blocks: []
analysis:
  - "plans/reports/ak-problem-solving-260722-2125-workflow-tool-transport-home-audit.md"
  - "plans/reports/ak-problem-solving-260722-2050-l2-transport-capability-criterion.md"
  - "plans/reports/ak-predict-260722-2103-workflow-definition-vs-execution-l1-baseline.md"
related:
  - "plans/260722-1343-write-capable-cli-w-complete-the-cli-record-transport (completed — W T2 write-path gate accrued; .claude routes writes via CLI)"
  - "plans/260722-1623-runtime-state-versioned-dedup-per-surface-tracking-toggle (completed)"
  - "plans/260612-1700-meta-surface-re-debate (completed — deleted capability_generate/index_extract; Phase 5 evidence)"
---

# L2 transport-capability criterion + L3 drift-test enforcement + portable-six re-homing deferral

## Overview

Two prior analysis reports (the L2 transport-capability criterion + the per-workflow audit) established **what** and **why**; this plan lands the durable output of both:

- **L2** gains a per-function transport-capability axis (`docs/runtime-contract.md`) — the layer-ownership rule that dissolves the M6 "per-runtime wiring fact written as a per-function capability fact" confusion. Stateless-by-default = transport-capable; stateful behavior is owned by the runtime-state layer (whose file-based tools are themselves stateless handlers); MCP-only is always an explicit override of the default — never silent. **Capability is a property of the function; wiring is a property of the runtime.** The two are independent.
- **L3** enforces that criterion: the drift test (`cli-write-tool-set-drift.test.js`) currently reads only `tools/manifest.json` and so **misses all 8 `run_workflow_*` tools** (registered via `workflows-manifest.json` → `server.js:135`, surfaced as `run_<wf.id>` via `convertWorkflowsToTools` at `server.js:187`) — a coverage blind spot. Extend it to cover the full 11-tool workflow surface, require each `MCP_RESIDUE` entry to declare a reason tag, and reclassify the 3 `mastra_workflow_*` helpers + 5 aux-read-ish tools **out of** `MCP_RESIDUE` into `CLI_TOOLS` (conformance to the L2 criterion, now that W's T2 write-path gate has accrued).
- **Portable-six re-homing is deferred** — recorded as a meta-state finding with its re-homing contract (U-Q1), `resolveRoot` wiring note (U-Q2), and ordering-enforcement prerequisite (P-Q2), not implemented here. The audit named the 6 candidates; a separate evidence-driven plan does the unwrap.
- **U-Q3** (the `WORKFLOW_REGISTRY.recommended_tools` forward-reference to `index_extract` / `index_validate` / `capability_generate`) is resolved: those tools were **deleted** in plan `260612-1700-meta-surface-re-debate` (line 31) — dead refs, plus stale leftovers in `skills/coordination-gate/SKILL.md` + `tool-selection-guide.md`.

No workflow-tool re-homing code in this plan. No new registry kind. Core stays stateless (file-state via the runtime-state sidecar is allowed).

## Preconditions (confirmed — durable evidence)

1. **W T2 write-path gate — satisfied (durable).** `plans/260722-1343-write-capable-cli-w-complete-the-cli-record-transport` is `completed`; `.mcp.json:8` sets `LOOP_RECORDS_VIA_CLI:"1"` for `.claude`, locked by `__tests__/cli-optout-wiring.test.js:26-28` (asserts `.claude` has the flag, `.factory`/`.mastracode` do not). The session banner ("Writes also ride the CLI") is secondary confirmation only. The aux-read-ish fold + helper reclassification were gated on this; the gate is met. This plan is **not** blockedBy W.
2. **L1 baseline — landed this session.** `docs/loop-engine.md` § "Workflow: definition vs execution" (change-log `meta-260722T2125Z-docs-loop-engine-md`, in `change-log.jsonl` — the Tier-1 split puts change-logs in `change-log.jsonl`, not `meta-state.jsonl`) names the 3 state homes. This plan's L2 section cites it.
3. **No cross-plan blockers.** R / W / runtime-state plans are all `completed`; no unfinished plan overlaps the L2 contract + cli-tools/drift-test surface.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | L2 per-function transport-capability axis stated as a layer-ownership rule; capability ≠ wiring | P1 |
| 2 | Drift test covers all 11 workflow tools (closes the 8-tool blind spot) + reason-tag discipline | P1 |
| 3 | 2 write helpers + 5 aux-read-ish tools reclassified MCP_RESIDUE → CLI_TOOLS; `workflow_generate_prompt` stays MCP (`deferred-rehoming` — post-review); `update_r2_allowlist` tagged `operator-policy`; `check_runtime_agnostic` tagged `agent-facing` (not operator-policy); 6 portable-six tagged `deferred-rehoming` | P1 |
| 4 | Portable-six re-homing recorded as a deferred finding (valid schema: `mcp-tool-missing`/`warning`; U-Q1 + U-Q2 + P-Q2 captured); no re-homing code | P2 |
| 5 | `WORKFLOW_REGISTRY` recommended_tools dead refs resolved (U-Q3 — deleted in 260612-1700) | P3 |

## Phases

| # | Phase | Status | Deps |
|---|-------|--------|------|
| 1 | [Scope, contracts, precondition confirmation](./phase-01-start.md) | Completed | — |
| 2 | [L2 transport-capability section in runtime-contract.md](./phase-02-l2-transport-capability-section-in-runtime-contractmd.md) | Completed | 1 |
| 3 | [L3 drift-test enforcement — coverage + reason tags + reclassify](./phase-03-l3-drift-test-enforcement-coverage-reason-tags-reclassify.md) | Completed (+ post-review correction) | 2 |
| 4 | [Record portable-six re-homing deferral finding](./phase-04-record-portable-six-re-homing-deferral-finding.md) | Completed (+ post-review correction) | 2 |
| 5 | [Resolve WORKFLOW_REGISTRY recommended_tools forward-reference](./phase-05-resolve-workflow-registry-recommended-tools-forward-reference.md) | Completed | 1 |

Phase ordering rationale: Phase 2 (L2 text) is the criterion Phase 3 enforces, so 3 blocks on 2. Phase 4 (deferral finding) cites the L2 criterion + audit, so it blocks on 2. Phase 5 is independent of 2/3 (a separate sweep) but needs the Phase 1 scout. Phase 1 confirms preconditions and scouts the exact insertion points / naming so 2–5 are mechanical.

## Post-review correction (2026-07-23)

A `/ak:code-review` pass over the last 4 commits flagged 4 findings; all were fixed (see change-log `meta-260723T1126Z-docs-runtime-contract-md-core-cli-tools-js-tests-cli-write-t`). Two revise this plan's original decisions:

1. **`workflow_generate_prompt` reverted from `CLI_READ_TOOLS` → `MCP_RESIDUE` (`deferred-rehoming`).** Root cause: its `BLUEPRINTS` map pointed at `tools/learning-loop-mcp/references/*.md` — a directory removed when the package folded into `learning-loop-mastra` and `references/` relocated under `tools/handlers/`. Every call returned `{error:true,message:"Blueprint file not found"}` (silent; untested). Paths were fixed (tool now works under the loop repo root), but U-Q2 cross-root resolution is **not fully resolved** — a non-loop runtime root (`LOOP_READS_VIA_CLI=1` + `GATE_ROOT=product repo`) would not contain the blueprints. So the tool stays MCP until a dedicated re-homing plan handles cross-root blueprint resolution. Recorded as finding `meta-260723T1126Z-workflow-generate-prompt-returned-error-true-message-bluepri`, cross-referencing the portable-six finding. This means Goal 3's "3 helpers reclassified" is now **2 write helpers** (`workflow_notify_artifact`, `workflow_trigger`) + 5 aux-read-ish; `workflow_generate_prompt` is NOT reclassified.
2. **`update_r2_allowlist` re-tagged `server-state` → `operator-policy`.** It is operator-only R2 allowlist mutation (the doc's own `operator-policy` example) AND touches a process-singleton cache. A precedence note in `docs/runtime-contract.md` records that `operator-policy` wins when both apply. This makes `operator-policy` a live, used override kind and removes the doc-vs-code contradiction.

Two further review fixes (no plan-decision change): the `notify_artifact` in-handler error message was de-garbled (dead `${path ? "" : ""}` ternary), and two new tests pin the fixes — `notify-artifact-tool.test.js` (the `records/**` guard) and `workflow-generate-prompt-tool.test.js` (blueprint resolution regression). The session-start banner read-tool count is now dynamic (`CLI_READ_TOOLS.size`) instead of a hardcoded "7".

## Success Criteria

- [x] `docs/runtime-contract.md` has a "Transport capability (per function)" section stating the layer-ownership rule + capability≠wiring; the stale "16 tools" count (lines 26, 40) corrected to the actual count or dereferenced to `CLI_WRITE_TOOLS`; change-log entry logged.
- [x] `cli-write-tool-set-drift.test.js` enumerates both `tools/manifest.json` AND `mastra/workflows-manifest.json` (via `wf.id`, `run_<wf.id>`); every one of the 11 workflow tools is in `CLI_TOOLS` or `MCP_RESIDUE`; an unclassified `run_workflow_*` addition fails the test.
- [x] `MCP_RESIDUE` is a `new Map([...])` (preserves `.has`); every entry declares a reason ∈ {`server-state`, `operator-policy`, `agent-facing`, `deferred-rehoming`}; untagged fails.
- [x] `workflow_notify_artifact` + `workflow_trigger` in `CLI_WRITE_TOOLS` (with `notify_artifact`'s `path` arg validated against `records/**` in-handler — Q1); the 5 aux-read-ish tools in `CLI_READ_TOOLS`; `workflow_generate_prompt` remains in `MCP_RESIDUE` (`deferred-rehoming` — **post-review correction**: its prompt blueprints are loop-root-relative and the BLUEPRINTS paths were stale (pointed at the folded `learning-loop-mcp` subtree); paths fixed, but U-Q2 cross-root resolution is not fully resolved, so it was reverted out of `CLI_READ_TOOLS`); `update_r2_allowlist` in `MCP_RESIDUE` (`operator-policy` — **post-review correction**: takes precedence over the secondary `server-state` singleton; see the precedence note in `docs/runtime-contract.md`); 2 storage `run_workflow_*` in `MCP_RESIDUE` (`server-state`); `check_runtime_agnostic` in `MCP_RESIDUE` (`agent-facing`, not reclassified — Q2); 6 portable-six `run_workflow_*` in `MCP_RESIDUE` (`deferred-rehoming`, citing the Phase 4 finding id).
- [x] `cli-mcp-subset-registration.test.js` + `cli-write-tool-set.test.js` updated (hardcoded `MCP_RESIDUE` array + `EXPECTED_READ/WRITE_TOOLS` + the inverted "aux stay out" test) — both in Phase 3 Modify scope.
- [x] A meta-state finding recorded with valid schema (`category: mcp-tool-missing`, `severity: warning`, `subtype: portable-six-rehoming-deferred`, `affected_system: mcp-tools`) capturing U-Q1 + U-Q2 + P-Q2; verified via `meta_state_list`; no re-homing code committed.
- [x] `WORKFLOW_REGISTRY.recommended_tools` dead refs resolved (empty to `[]`, field removal forbidden); `core/workflow-registry.test.js` updated to expect `[]`; stale skill-doc references filed as a finding (NOT edited — Q3) — U-Q3 closed.
- [x] `pnpm test` green; `check_runtime_agnostic` audit clean on touched feature paths.

## Risk Assessment

- **Reclassification changes the MCP surface for `LOOP_RECORDS_VIA_CLI=1` runtimes.** Moving the 3 helpers + 5 aux-read-ish into `CLI_TOOLS` drops them from MCP for `.claude`. Mitigation: they are stateless handlers in `tools/manifest.json`, so `bin/loop.mjs` can dispatch them (FMA confirmed); Phase 3 step 7 verifies each dispatches and greps imports for `inbound-state`/`runtime-state`/`surfaces` deps to confirm file-based (reconstructable by a one-shot process).
- **Rollback is a targeted code revert, not a flag flip.** `LOOP_RECORDS_VIA_CLI=0` would restore ALL 31 tools to MCP — re-introducing the split-brain W closed — so it is NOT a per-tool escape hatch. Targeted rollback = move the specific tool back out of the CLI sets in `core/cli-tools.js` (and back into `MCP_RESIDUE` in the drift test). Document in Phase 3.
- **`CLI_READ_TOOLS` widening.** Adding 5 aux to `CLI_READ_TOOLS` also widens the `LOOP_READS_VIA_CLI=1` (reads-only) opt-out for any future runtime that adopts it (server.js:64 uses `CLI_READ_TOOLS`, not a fixed 7-list). Today no runtime sets reads-only alone (wiring test confirms `.factory`/`.mastracode` set neither). Note in `cli-tools.js` header.
- **`check_runtime_agnostic` tag.** It is agent-invoked (Mastra internal agents: intake/scout), so `operator-policy` is wrong. Keep it in `MCP_RESIDUE` tagged `agent-facing` (stateless but retained so Mastra internal-agent tool surfaces keep it under the CLI opt-out). Phase 3 verifies whether reclassifying it into `CLI_TOOLS` would break the Mastra internal agents (their tool lists may resolve from the filtered `tools` dict) — reclassify only if safe; default keep-on-MCP with the corrected tag.
- **Drift-test naming.** `run_<wf.id>` derived at `server.js:187` (`convertWorkflowsToTools`); Phase 3 imports workflow objects and reads `wf.id` (assignment at `server.js:135`), forming `run_<wf.id>` exactly as Mastra does.
- **Opt-out scope.** The `RECORDS_VIA_CLI && CLI_TOOLS.has` drop fires only in the MANIFEST loop (`server.js:71`). Workflow tools registered via `workflows-manifest.json` are NOT affected — a parallel opt-out branch in `convertWorkflowsToTools` would be needed to drop `run_workflow_*` from MCP. This is a Phase 4 finding prerequisite (the future re-homing plan must add it), not a Phase 3 concern (the portable-six stay MCP).
- **Full plan consistency.** Phases 2–5 stay aligned with the L1 clarification (3 homes) + the audit's 11-tool classification. Whole-plan consistency sweep after red-team edits.

## Open Questions

- **O-Q1 (Phase 3) — RESOLVED by validation:** `workflow_notify_artifact`/`workflow_trigger` → `CLI_WRITE_TOOLS` with `pathFields: []`. The `notify_artifact` `path` arg is fixed via **in-handler `records/**` validation** (Q1; the `pathFields`-additive option was rejected — CLI hardcodes `pathFields:[]` so in-handler validation is required regardless).
- **O-Q2 (Phase 4) — RESOLVED by red-team:** the deferral is a `finding` (not `loop-design`), and the schema requires `category: mcp-tool-missing`, `severity: warning` (no `info`), deferral semantics in `subtype`. `loop-design` would need `meta_state_propose_design`/`meta_state_ship_loop_design` (different machinery), not `meta_state_report`.
- **O-Q3 (Phase 5) — RESOLVED by red-team + validation:** `index_extract`/`capability_generate` were deleted in plan `260612-1700` → dead refs (take the dead-ref path). `index_validate` was not in the deleted list — Phase 5 grep confirms per-tool. Stale references in `skills/coordination-gate/SKILL.md` + `tool-selection-guide.md` are leftovers — **file a finding, leave them** (Q3; skill docs are bound artifacts, out of scope for a separate skills-hygiene pass).

## Red Team Review

### Session — 2026-07-22
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (3 reviewers, 5 phases).
**Findings:** 20 raw → 15 dedup; **15 accepted, 0 rejected.** Severity breakdown: 4 Critical, 5 High, 6 Medium (+ 5 Low folded into phases).
**Evidence filter:** every Critical/High independently verified against the codebase with `file:line`.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `cli-mcp-subset-registration.test.js` hardcodes 10-tool `MCP_RESIDUE` + asserts each stays on MCP; Phase 3 reclassifies 8 → breaks; file unlisted | Critical | Accept | Phase 3 |
| 2 | 6 deferred portable-six have no valid reason tag (not CLI_TOOLS, not server-state/operator-policy) | Critical | Accept | Phase 3 (+ plan) |
| 3 | Phase 4 `category:deferred-decision`/`severity:info` not in zod enum → finding write rejected | Critical | Accept | Phase 4 |
| 4 | `cli-write-tool-set.test.js` locks exact 7-read/19-write sets + "aux stay out" assertion; Phase 3 breaks 3; file unlisted | Critical | Accept | Phase 3 |
| 5 | `check_runtime_agnostic` mislabeled `operator-policy` — it is agent-invoked | High | Accept | Phase 3 (+ plan) |
| 6 | `pathFields:[]` = "statelessness test" is a category error (it's R2 bypass) | High | Accept | Phase 3 |
| 7 | `notify_artifact` has `path` arg but `pathFields:[]` — plan endorses misdeclaration | High | Accept | Phase 3 |
| 8 | Phase 5 pending-path misclassifies deleted tools as a pending subsystem (deleted in 260612-1700) | High | Accept | Phase 5 (+ Phase 1) |
| 9 | Phase 5 dead-ref path breaks `core/workflow-registry.test.js` (>0 + specific names) | High | Accept | Phase 5 |
| 10 | Phase 5 "remove the fields" → `TypeError` in `trigger-workflow-tool.js:33` (`.join`) | High | Accept | Phase 5 |
| 11 | Phase 1 step 2 cites wrong file — change-log is in `change-log.jsonl`, not `meta-state.jsonl` | Medium | Accept | Phase 1 (+ plan) |
| 12 | L2 insertion anchor wrong — "Three concerns" at line 31, not 39 | Medium | Accept | Phase 1 + Phase 2 |
| 13 | W T2 precondition via session hook, not durable `.mcp.json:8` + wiring test | Medium | Accept | Phase 1 (+ plan) |
| 14 | Opt-out only at `server.js:71` (MANIFEST loop); workflow loop/`convertWorkflowsToTools` unaffected; `server.js:128` citation wrong (→ `:135`/`:187`) | Medium | Accept | Phase 3 + Phase 4 (+ plan) |
| 15 | `MCP_RESIDUE` Set→"Map/object" ambiguous — plain object has no `.has` → crash | Medium | Accept | Phase 3 |
| (folded) | Phase 4 omits P-Q2; rollback = code revert not flag flip; `CLI_READ_TOOLS` widening; "16 tools" stale count; `notify_artifact` dead import → step-7 import grep | Low–Med | Accept | Phases 2, 3, 4 |

### Whole-Plan Consistency Sweep
Applied after red-team edits. Re-read `plan.md` + all 5 phase files. Decision delta: (a) reason-tag taxonomy is now {server-state, operator-policy, agent-facing, deferred-rehoming} — reflected in plan.md Goals 3, Success Criteria, phase-03; (b) Phase 4 schema corrected to `mcp-tool-missing`/`warning`/subtype — reflected in plan.md Goal 4 + O-Q2 + phase-04; (c) U-Q3 resolved as dead-refs (deleted in 260612-1700) — reflected in plan.md Goal 5 + O-Q3 + phase-05; (d) Phase 3 Modify scope expanded to include `cli-mcp-subset-registration.test.js` + `cli-write-tool-set.test.js` — reflected in plan.md Success Criteria + phase-03; (e) all `server.js:128` citations corrected to `:135`/`:187` across plan.md + phase-01 + phase-03; (f) change-log file corrected to `change-log.jsonl` across plan.md + phase-01 + phase-04; (g) L2 anchor changed from line-39 to content-based across plan.md + phase-01 + phase-02. No unresolved contradictions remain.

## Validation Log

### Verification Results
- Claims checked: 1 (the `affected_system` enum for the Phase 4 finding — the only post-red-team factual unknown).
- Verified: 1 | Failed: 0 | Unverified: 0.
- Tier: skipped heavy pass — `## Red Team Review` with verification evidence already present (guard). `cli-transport` is NOT in `AFFECTED_SYSTEM_ENUM` (`core/meta-state.js:213-229`); `mcp-tools` is the correct value (matches the `meta-260721T0809Z` precedent). Propagated to phase-04.

### Interview — 2026-07-22 (3 questions, all answered with the recommended option)

| # | Question | Decision | Propagated To |
|---|----------|----------|--------------|
| Q1 | `notify_artifact` `path` arg fix (R2 bypass) | **In-handler `records/**` validation** (reject the `pathFields`-additive option; CLI hardcodes `pathFields:[]` so in-handler is required regardless) | phase-03 (Architecture item 1, step 3, success criterion), plan.md (success criterion, O-Q1) |
| Q2 | `check_runtime_agnostic` keep-MCP vs reclassify | **Keep MCP, tag `agent-facing`** (do NOT reclassify; preserves Mastra internal-agent tool surface) | phase-03 (step 10 rewritten, risk), plan.md (success criterion) |
| Q3 | Stale skill-doc references (deleted tools) | **File a finding, leave them** (skill docs are bound artifacts with their own write-gate; out of scope for a separate skills-hygiene pass) | phase-05 (step 4, Modify list, success criterion), plan.md (success criterion, O-Q3) |
| (factual) | Phase 4 `affected_system` enum | **`mcp-tools`** (confirmed in enum; `cli-transport` invalid) | phase-04 (step 3, risk) |

### Whole-Plan Consistency Sweep (post-validation)
Re-read `plan.md` + all 5 phase files after propagation. Decision delta: (a) O-Q1 resolved → in-handler `records/**` validation (phase-03 + plan.md); (b) `check_runtime_agnostic` locked to keep-MCP/`agent-facing`, step 10 no longer a verify-then-reclassify (phase-03); (c) O-Q3 resolved → stale skill docs filed as a finding, NOT edited; phase-05 Modify list no longer includes skill docs (Q3); (d) Phase 4 `affected_system` = `mcp-tools` (phase-04 + plan.md). All O-Q1/O-Q2/O-Q3 now show RESOLVED. No unresolved contradictions remain.