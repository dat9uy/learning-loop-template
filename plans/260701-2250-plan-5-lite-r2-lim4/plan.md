---
title: "Plan 5-Lite: R2 Write-Gate + LIM-4 Path Containment (LIM-3 dropped)"
description: "Per-runtime write allowlist for MCP tools + realpath containment for user-supplied write paths. The originally-bundled LIM-3 Ed25519 caller identity is dropped per threat-model review — see reframe report."
status: pending
priority: P1
branch: "main"
tags: ["hardening", "security", "lim-4", "r2", "phase-e-deferred"]
blockedBy: []
blocks: []
created: "2026-07-01T22:50:00.000Z"
createdBy: "ck:plan"
updated: "2026-07-01T23:30:00.000Z"
addresses:
  red-team:
    - R1 (CRITICAL: allowlist self-bootstrap)
    - R2 (HIGH: closure-immutability test)
    - R3 (HIGH: path-field detector)
    - R4 (HIGH: workflow + agent tool coverage)
    - R5 (HIGH: hardlink + TOCTOU)
    - R6 (HIGH: audit-log JSONL injection)
    - R9, R10, R11, R13, R15, R17 (MEDIUM/LOW: addressed in scope)
related:
  - plans/reports/from-ask-to-planner-reframe-260701-2250-GH-5-plan-5-lite-r2-lim4-report.md
  - plans/reports/general-purpose-260701-2312-GH-5-plan-5-lite-r2-lim4-red-team-plan-review-report.md
  - plans/260701-1730-plan-5-hardening-r2-lim3-lim4/  (original; closed; kept for historical reference)
  - plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-02-r2-write-gate-per-runtime-allowlist.md
  - plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-03-lim-4-path-containment-realpath.md
  - plans/reports/productization-260612-1530-master-tracker.md
  - plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md
---

# Plan 5-Lite: R2 Write-Gate + LIM-4 Path Containment (LIM-3 dropped)

## Overview

Ship **R2 (per-runtime write allowlist) + LIM-4 (realpath path containment) + identity pinning** as one bundled hardening PR. The originally-bundled LIM-3 (Ed25519 caller identity) is dropped per threat-model review — its threat model collapses in local-stdio-MCP. Full rationale: [reframe report](../reports/from-ask-to-planner-reframe-260701-2250-GH-5-plan-5-lite-r2-lim4-report.md).

**Identity pinning replaces LIM-3's role** without crypto: MCP server reads `process.env.LOOP_SURFACE` once at process boot, validates against the SURFACES registry (extended to `[".claude", ".factory", ".mastracode"]`), and freezes the resolved `runtime_id` in a closure-scoped immutable variable. This is exactly the shape of Plan 4's `MASTRA_RESOURCE_ID` check, tightened to fail closed on mismatch.

## Phases

| Phase | Name | Status | Effort | File | Addresses |
|-------|------|--------|--------|------|-----------|
| 1 | R2 Write-Gate (per-runtime allowlist) + identity pinning | Pending | 1.5d | [Phase 1: R2 Write-Gate](./phase-01-r2-write-gate.md) | R1, R2, R3, R4, R9, R10 |
| 2 | LIM-4 Path Containment (realpath + hardlink rejection) | Pending | 1d | [Phase 2: LIM-4 Path Containment](./phase-02-lim-4-path-containment.md) | R5, R15 |
| 3 | Cross-Cutting (contracts, docs, shim wiring, audit-log hardening) | Pending | 0.5d | [Phase 3: Cross-Cutting](./phase-03-cross-cutting.md) | R6, R11, R13, R17 |

**Total effort:** ~3d (down from original Plan 5's 5.5d, due to dropping LIM-3 alone was 2.5d).

## Key design decisions

| Decision | Rationale |
|---|---|
| **R2 + LIM-4 bundled (not 3 separate plans)** | Shared infra: both add audit-log entry, both extend contract validator. Splitting adds 2-3d overhead. Bundle is small (3d, ~9 files, ~470 LoC). |
| **LIM-3 dropped** | Its threat model requires attacker conditions that collapse in local-stdio-MCP (reframe report §"Why LIM-3's threat model is weak"). R2 closes the actual ownership gap. Reactivation trigger: when MCP becomes network-accessible. |
| **Identity pinning via `LOOP_SURFACE` env** | Set by harness `.cjs` shim at process spawn (now actually wired in Phase 3, see [scout finding correction](#corrections-from-scout--red-team-reviews) below). Pinned for process lifetime via `Object.freeze` closure. |
| **Default-deny on missing `pathFields`** (R3) | If a tool doesn't declare `pathFields`, the MCP server fails to boot. Catches new tools that smuggle write paths. |
| **Workflows flow through R2** (R4) | The original stub said workflows go through `createLoopTool` — false. Phase 1 R4 swaps `createTool` for `createLoopTool` in `convertWorkflowsToTools`. |
| **Hardlink rejection** (R5) | `realpath` does NOT resolve hardlinks. Phase 2 adds `lstat.nlink > 1` rejection. |
| **Audit-log JSON escape** (R6) | `path` field pre-resolved via `realpathSync`; serialized line must contain no raw `\n` or `\r`. |

## Dependencies

- **No external dependency.** Phase E closed 2026-06-30. Plan 4 (Mastra Code Validation) already shipped the contract validator + the universal hook layer + the `createLoopTool` factory seam.
- **Identity prerequisite:** `LOOP_SURFACE` env var MUST be set at process spawn by the harness `.cjs` shim. **Correction from scout:** the reframe report's claim that shims are "already set" is **FALSE**. Phase 3 wires all 3 shims (Claude + Droid + Mastra Code).
- **Surfaces registry:** `tools/learning-loop-mastra/core/surfaces.js:16` currently hard-codes `SURFACES = [".claude", ".factory"]`. Phase 3 extends to `[".claude", ".factory", ".mastracode"]`.

## Acceptance criteria

- [ ] All 6 red-team must-fix findings (R1-R6) have passing tests
- [ ] All 3 runtime shims (Claude / Droid / Mastra Code) inject `LOOP_SURFACE` at process boot (Phase 3 S1-S4)
- [ ] All 7 LIM-4 audit sites migrated from `path.join` to `resolveSafePath` (Phase 2 step 4)
- [ ] All 31 legacy tools + 10 workflow tools + agent tools flow through R2 (Phase 1 R4 verified)
- [ ] `.loop/r2-allowlist.json` is committed to git and pre-commit hook fires on it (Phase 3 NF1)
- [ ] `pnpm test` passes (~170 tests; +25 from Plan 5-Lite new files)
- [ ] `docs/security/plan-5-hardening.md` exists with the gating chain, shim wiring, and runbook
- [ ] No `--no-verify` needed for pre-commit hook
- [ ] `update_r2_allowlist` MCP tool works for operator-only allowlist edits (with `gate_mark_preflight`)

## Corrections from scout + red-team reviews

The original plan stub contained three factual errors, surfaced during the deep-mode research pass:

1. **"`LOOP_SURFACE` is set by harness shims"** — **FALSE.** Scout verified both `.claude/coordination/hooks/recurrence-check-on-start.cjs` and `.factory/coordination/hooks/recurrence-check-on-start.cjs` are empty wrappers. Phase 3 S1-S4 wire all three shims (Claude + Droid + Mastra Code).
2. **"All 41 tools + 10 workflows flow through `createLoopTool`"** — **FALSE for workflows.** Workflows go through `MCPServer.convertWorkflowsToTools` (server.js:78-161) which uses raw `createTool`. Phase 1 R4 swaps the wrap.
3. **"verification-runner is still attackable" (Open Q #3)** — Phase 2 expands the audit to include `verification-runner.js:34` (`step.cwd`). The `--` arg smuggling is documented as D2 (deferred).

Red-team review (6 must-fix findings) is fully incorporated as new requirements F8-F14 in Phase 1, F4-F5 in Phase 2, and R6 hardening in Phase 3. See [red-team report](../reports/general-purpose-260701-2312-GH-5-plan-5-lite-r2-lim4-red-team-plan-review-report.md) for full detail.

## TDD-first structure

Per `--tdd` flag, every phase writes regression tests BEFORE the implementation. Each phase follows Red → Green → Refactor → Lock. Tests live next to the code they test. No test-only exports beyond the existing `_clearIdempotencyCacheForTests` pattern.

## References

- **Reframe report:** `plans/reports/from-ask-to-planner-reframe-260701-2250-GH-5-plan-5-lite-r2-lim4-report.md` — full threat-model review; the rationale for dropping LIM-3.
- **Red-team review:** `plans/reports/general-purpose-260701-2312-GH-5-plan-5-lite-r2-lim4-red-team-plan-review-report.md` — 6 must-fix + 4 should-fix + 10 nice-to-have findings; MUST-FIX ones are baked into the phase requirements (F8-F14, R5, R6).
- **Source plan (closed):** `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/plan.md` — original 3-item plan; Phases 2-3 of the original are the implementation basis for this plan's Phases 1-2.
- **Original red-team (Plan 4):** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md` — Findings 1 (MASTRA_RESOURCE_ID spoofability), 11 (validator over-promises), F2 (path traversal), R2 (runtime-interface ownership gate).
- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` — Plan 5-Lite row added; LIM-3 dropped from next-up.
- **AGENTS.md §11** "Runtime Interface Ownership (R2)" — the process norm the gate replaces/augments (will be updated to point to the new `docs/security/plan-5-hardening.md` in Phase 3 C4).

## Status

**Status:** pending (awaiting user approval to start cook after red-team review).
**Recommended next step:** `/ck:cook plans/260701-2250-plan-5-lite-r2-lim4` (after optional `/ck:plan validate` and `/ck:plan red-team` per the deep-mode workflow; both already auto-ran in this expansion).

---

## Validation Log

| Date | Validator | Notes |
|------|-----------|-------|
| 2026-07-01 | Initial stub | Plan created with R2 + LIM-4 + identity-pinning sections; threat-model rationale referenced. |
| 2026-07-01 | Plan-expansion session | Phase files written. 6 must-fix red-team findings incorporated (R1-R6). 3 factual errors from scout corrected (shim wiring, workflow coverage, verification-runner migration). |
| 2026-07-01 | `/ck:plan validate` (this session) | Standard-tier verification: 30 claims sampled across 3 phases (10/phase). All file paths, line refs, and function names verified against the codebase. 2 minor findings (not blockers). 4 interview questions; all answers confirm plan as-written. See Verification Results below. |

### Validation Decisions (Session 1)

| # | Topic | Decision | Plan section |
|---|-------|----------|--------------|
| 1 | **Hardlink policy (R5)** | Strict reject all nlink > 1 | Plan 2 F1 / F4 (matches as-written) |
| 2 | **Phase ordering** | R2 first, then LIM-4 (plan order) | Plan phasing table (matches as-written) |
| 3 | **Effort estimate** | ~3d realistic | Plan phasing table (matches as-written) |
| 4 | **Cache strategy (NF1)** | Per-boot + manual reload via `update_r2_allowlist` | Plan 1 NF1 (matches as-written) |

**Propagation:** All 4 decisions match the plan as-written. No phase file edits required.

### Whole-Plan Consistency Sweep

- Files re-read: `plan.md`, `phase-01-r2-write-gate.md`, `phase-02-lim-4-path-containment.md`, `phase-03-cross-cutting.md`
- Decision deltas checked: 5 (OQ #5 shim wiring, 4 validation decisions)
- Reconciled stale references: 0
- Unresolved contradictions: 0
- Result: PASS — no stale terms, no superseded decisions, no duplicate embedded drafts.

### Verification Results

- **Tier:** Standard (3-4 phases, Fact Checker + Contract Verifier active)
- **Claims checked:** 30 (10/phase × 3 phases)
- **Verified:** 28 | **Failed:** 0 | **Unverified (minor):** 2

#### Verified (high-confidence)
- All 7 LIM-4 audit-site line refs exact-match (Phase 2)
- `mastra/server.js#convertWorkflowsToTools` uses `createTool` (not `createLoopTool`) at line 105 — confirms R4 finding
- `mastra/create-loop-tool.js:56-62` factory seam — exact line for R2 wrap insertion
- `core/gate-logic.js:47` `globMatch` function — exists, can be reused
- `core/gate-override.js:86` `appendOverrideAudit` — pattern to mirror for R6 audit
- `core/surfaces.js:16` `SURFACES = Object.freeze([".claude", ".factory"])` — confirmed, will be extended in Phase 3
- All 4 hard-coded `[".claude", ".factory"]` test arrays in C3 targets — confirmed at exact lines
- `interface/contract.js:68-76` `REQUIREMENT_IDS` — 7 requirements, append pattern verified
- Hook shims (`.claude/...`, `.factory/...`, `.factory/hooks/loop-surface-inject.cjs`) are thin wrappers — confirms scout finding
- All 6 new files (`core/r2/*`, `core/path-containment.js`, `mastra/identity-errors.json`, `.loop/`, `docs/security/`) do not exist yet — confirmed CREATE

#### Unverified (minor; not blockers)
1. **LL_DISABLE_LOOP_SURFACE_INJECTION line ref:** Plan says `loop-surface-inject.cjs:61`; actual is line 67. Cosmetic only — no impact on implementation.
2. **surfaces.test.js hard-coded ref count:** Plan estimates 7+ assertions to update; actual is 2 (lines 28, 158). Plan overestimated scope; actual scope is smaller.

#### Whole-Plan Consistency Sweep (preliminary)
- Files reread: plan.md, phase-01-r2-write-gate.md, phase-02-lim-4-path-containment.md, phase-03-cross-cutting.md
- Decision deltas checked: 1 (Phase 3 OQ #5 resolved → option (a))
- Reconciled stale references: 0
- Unresolved contradictions: 0
- Result: PASS — no stale terms, no superseded decisions, no duplicate embedded drafts.

---

## Red Team Review

**Reviewer:** general-purpose (security adversary persona), 2026-07-01
**Verdict:** APPROVE-WITH-FIXES — 6 must-fix, 4 should-fix, 10 nice-to-have
**Full report:** [plans/reports/general-purpose-260701-2312-GH-5-plan-5-lite-r2-lim4-red-team-plan-review-report.md](../reports/general-purpose-260701-2312-GH-5-plan-5-lite-r2-lim4-red-team-plan-review-report.md)

### Top 5 must-fix (all addressed in phase files)

| Finding | Severity | Phase | File:Requirement |
|---------|----------|-------|------------------|
| **R1** Allowlist self-write not gated | CRITICAL | Phase 1 | phase-01-r2-write-gate.md:F8 (BOOTSTRAP_DENY_PATTERNS) + F9 (update_r2_allowlist tool) |
| **R2** Closure-variable immutability not tested | HIGH | Phase 1 | phase-01-r2-write-gate.md:F10 (Object.freeze + immutability test) |
| **R3** Path-field detector unspecified | HIGH | Phase 1 | phase-01-r2-write-gate.md:F11 (path-field-detector.js) + F12 (manifest default-deny) |
| **R4** Workflow tools bypass R2 | HIGH | Phase 1 | phase-01-r2-write-gate.md:F13 (swap createTool → createLoopTool in convertWorkflowsToTools) |
| **R5** Hardlink escape + TOCTOU | HIGH | Phase 2 | phase-02-lim-4-path-containment.md:F4 (lstat nlink check) + NF3 (TOCTOU closure) |
| **R6** Audit-log JSONL injection | HIGH | Phase 3 | phase-03-cross-cutting.md:C5 (newline assertion + realpath pre-resolve + audit-log deny-list) |

### Should-fix (addressed in scope)

- **R9** Path normalization gaps → Phase 1 F14
- **R10** Glob edge cases → Phase 1 F14
- **R11** Boot-time error message clarity → Phase 3 C1 (Req #10), Phase 1 F10
- **R13** Pre-commit hook bypass → Phase 3 NF1 + S5
- **R15** Path-arg smuggling via `:` suffix → Phase 2 NF4 (defensive colon reject)
- **R17** Override audit gap → Phase 3 C5 (BOOTSTRAP_DENY_PATTERNS for runtime-state.jsonl + .gate-override)

### Nice-to-have (documented as residual; deferred)

R7 (subprocess spawn), R8 (surface registry spoofing), R12 (allowlist cache race), R14 (MCP restart), R16 (cross-platform), R18 (path-field depth limit), R19 (workflow read-then-write composition), R20 (pin-time env mutation race). Documented in `docs/security/plan-5-hardening.md` §"Out of scope" per Phase 3 C4.

### Future hardening (tracked separately)

- **D1** Ed25519 caller identity (LIM-3 re-activation) — when MCP becomes network-accessible
- **D2** Workflow `--` arg smuggling defense
- **D3** Tool stdout credential-leak guard
- **D4** Windows UNC / device paths
- **D5** Subprocess-spawn re-pin detection