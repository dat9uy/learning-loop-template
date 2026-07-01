---
title: "Plan 5: Bundled Hardening — LIM-3 Caller Identity + R2 Write-Gate + LIM-4 Path Traversal"
description: "Replace spoofable RUNTIME_ID env-var with Ed25519 signed capability tokens; enforce per-runtime write allowlist on every MCP tool; contain user-supplied paths inside project root."
status: pending
priority: P1
branch: "main"
tags: ["hardening", "security", "lim-3", "lim-4", "r2", "phase-e-deferred"]
blockedBy: []
blocks: []
created: "2026-07-01T10:04:19.580Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/researcher-A-260701-lim3-ed25519-identity-report.md
  - plans/reports/researcher-B-260701-lim4-r2-allowlist-report.md
  - plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md
---

# Plan 5: Bundled Hardening — LIM-3 Caller Identity + R2 Write-Gate + LIM-4 Path Traversal

## Overview

This plan ships the **three security-critical items deferred from Phase E** (LIM-3 caller identity, R2 per-runtime write allowlist, LIM-4 path traversal) as a single bundled hardening PR. Phase E Plan 4 (Mastra Code Validation) shipped 2026-06-30 with explicit deferrals to Plan 5 in its red-team security adversary review; this plan closes those deferrals and turns the security-priority LIMs from "next-up" to "shipped". The plan uses TDD-first structure (`--tdd` flag) with regression tests written BEFORE implementation for each gate.

**The 3 items share one architecture decision (Per ask-user choice):**

- **Identity attestation:** Signed capability token from harness (Ed25519). The harness generates an Ed25519 keypair on first boot, signs a short-lived token with `{runtime_id, session_id, pubkey_fingerprint, exp}` (60-min window), and writes the token to `<surface>/coordination/runtime-id-token.json`. The MCP server reads the token at boot, verifies the Ed25519 signature against the harness's public key, and refuses any tool call whose token is missing / invalid / expired / mismatched.
- **R2 gate layer:** MCP tool wrapper (centralized). All 41 tools + 10 workflows flow through `createLoopTool` (per `tools/learning-loop-mastra/mastra/server.js:39-44`); wrapping the factory covers every tool without per-tool edits. The gate keys on `runtime_id` from the verified token + a per-project `.loop/r2-allowlist.json` that maps each runtime to its own + universal writable surfaces.
- **LIM-4 fix:** realpath containment helper `core/path-containment.js` + 6 audit fixes at the user-path join sites identified by Researcher B (refresh-fingerprint, check-grounding, derive-status, gate-logic#resolveEvidence, 2 test-runner tools).

**Why now:** Phase E closed 2026-06-30. The contract validator currently accepts `MASTRA_RESOURCE_ID === runtimeId` (Plan 4 contract amendment; spoofable env var). Without LIM-3 + R2 + LIM-4 shipping as one plan, the loop cannot safely authorize any future operator or runtime — every MCP call is one env-var away from impersonating another runtime. Plan 5 makes that spoofability a non-issue.

**Why bundled (not 3 plans):** the 3 items share infrastructure (Phase 1's identity primitive is Phase 2's gate input; Phase 3's path helper is independent but bundled for atomic blast radius and single-review overhead). Splitting into 3 plans adds 2-3 days of overhead for no architectural benefit.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [LIM-3 Identity (Ed25519)](./phase-01-lim-3-identity-ed25519.md) | Pending | 2.5d | None (foundation) |
| 2 | [R2 Write-Gate (per-runtime allowlist)](./phase-02-r2-write-gate-per-runtime-allowlist.md) | Pending | 1.5d | Phase 1 (identity primitive) |
| 3 | [LIM-4 Path Containment (realpath)](./phase-03-lim-4-path-containment-realpath.md) | Pending | 1d | None (independent fix; ships in same PR) |
| 4 | [Cross-Cutting (contracts + docs + sweep)](./phase-04-cross-cutting-contracts-docs-sweep.md) | Pending | 0.5d | Phases 1-3 |

**Total effort:** ~5.5 days (2.5 + 1.5 + 1 + 0.5). Plan ships as 1 PR; no intermediate merges.

## TDD-first structure

Per `--tdd` flag, every phase writes regression tests BEFORE the implementation. Each phase:

1. **Red:** write the failing test that proves the gap exists today.
2. **Green:** minimal implementation that makes the test pass.
3. **Refactor:** clean up while keeping tests green.
4. **Lock:** add the regression guard test to the existing test suite (locks against future regression).

Tests live next to the code they test (per repo convention): `tools/learning-loop-mastra/__tests__/...` for cross-cutting; per-tool test files for tool-specific changes. No "test-only exports" beyond what the existing pattern (`_clearIdempotencyCacheForTests`) already permits.

## Dependencies

- **No external dependency.** Phase E closed 2026-06-30. Plan 4 (Mastra Code Validation) already shipped the contract validator + the universal hook layer + the `createLoopTool` factory seam. All three Plan 5 items live inside the existing seam.
- **Identity prerequisite:** LIM-3 must ship FIRST. If LIM-3 slips, R2's `runtime_id` resolution falls back to `RUNTIME_ID` env (spoofable), defeating the gate. The phase ordering reflects this.
- **Surfaces registry:** `tools/learning-loop-mastra/core/surfaces.js:16` currently hard-codes `SURFACES = [".claude", ".factory"]`. Phase 2 must extend this to `[".claude", ".factory", ".mastracode"]` (the third runtime is the Plan 4 addition; Research B's Open Question 5 flagged this).

## Open questions (to be answered during the plan; not blocking)

1. **Should the gate cache the allowlist per-server-boot or per-request?** Recommend per-boot (cache-warmed in `server.js:165` startup; lazy-load fallback for first-call latency). Decision in Phase 2.
2. **Operator override UX:** silent allow + log, or require `RUNTIME_OVERRIDE=1` env var per write? Recommend silent-allow with audit-log entry; same pattern as existing `gate-override.js`. Decision in Phase 2.
3. **Test-runner path coverage:** the LIM-4 fix protects `evidence_test` paths but `verification-runner.js` itself is still attackable via `--` arg smuggling. Out of scope for Plan 5; flagged in Phase 3 Risk Assessment.
4. **Workflow bypass:** `tools/learning-loop-mastra/mastra/server.js:109-136` has an inline `createTool({...})` call that bypasses `createLoopTool`. Phase 1 must hard-code a `verifyRuntimeToken` call inside that inline `execute` OR refactor to use `createLoopTool`. DRY win via refactor.

## References

- **Researcher A (LIM-3):** `plans/reports/researcher-A-260701-lim3-ed25519-identity-report.md` — Ed25519 API surface + harness integration + key storage + token shape + verification path + fail modes + cold-start strategy.
- **Researcher B (LIM-4 + R2):** `plans/reports/researcher-B-260701-lim4-r2-allowlist-report.md` — 20-row audit table of user-path joins + fix helper code + allowlist shape + gate diff shape + test strategy.
- **Red-team security review (Plan 4):** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md` — Findings 1 (MASTRA_RESOURCE_ID spoofability), 11 (validator over-promises), F2 (path traversal), R2 (runtime-interface ownership gate).
- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` — Plan 5 row; LIM-3/4/R2 context.
- **AGENTS.md §11** "Runtime Interface Ownership (R2)" — the process norm that the gate replaces/augments.
- **interface/CONTRACT.md Req #4** — current spoofable identity marker; will be tightened by Phase 4.
- **Phase E Plan 4 plan.md** — explicit Plan 5 deferrals (D5: MASTRA_RESOURCE_ID spoofability, etc.).

## Status

**Status:** pending (awaiting user approval to start cook).

**Recommended next step:** `/ck:cook plans/260701-1730-plan-5-hardening-r2-lim3-lim4` (after `--red-team` review per the deep-mode workflow; the post-plan handoff will offer this option).

---

## Validation Log

### Session 1 — 2026-07-01

**Trigger:** Post-red-team deep-mode validation per `mode=prompt, questions=3-8` in `## Plan Context`.

**Questions asked:** 4

#### Questions & Answers

1. **[Architecture, Critical Finding 1]** Workflow step handlers bypass the `createLoopTool` gate. Which fix?
   - Options: Wrap step `execute` bodies | Deny all workflows from non-allowlisted runtimes | Document workflows OUT-OF-SCOPE for v1
   - **Answer:** Wrap step `execute` bodies (Recommended)
   - **Rationale:** Comprehensive coverage; closes the bypass definitively; consistent with the "atomic" plan structure. Adds ~1d to Phase 1 effort (1.5d → 2.5d).
   - **Affected files:** Phase 1 Step 4 + Step 7; Phase 2 wrapper chain (extends to step bodies).

2. **[Risks, Critical Finding 8]** Cold-start race (MCP server starts before SessionStart writes the token). How to mitigate?
   - Options: Backoff retry + warm-up call | Backoff retry only | Document + accept the window
   - **Answer:** Backoff retry + warm-up call (Recommended)
   - **Rationale:** Defends against the typical race (SessionStart finishes within 300ms); warm-up call guarantees token is written before user prompt.
   - **Affected files:** Phase 1 R6 (Risk Assessment) + Step 4 (verifier backoff) + Step 5 (warm-up call in SessionStart hook).

3. **[Tradeoffs, High Finding 14]** Allowlist hot-reload NOT supported. Operator deny has no effect until MCP server restart. What to do?
   - Options: Document + audit-log every edit | Add `meta_state_signal_restart` MCP tool | Add file-watcher hot-reload
   - **Answer:** Document the window + audit-log every edit (Recommended)
   - **Rationale:** No new code in v1; operator docs + audit log cover the most common case. Restart-via-tool and file-watcher are deferred to follow-up plans if needed.
   - **Affected files:** Phase 2 NF1 (clarify the window) + Phase 4 F5 (operator doc adds restart procedure + window duration) + new implementation step in Phase 4 for `appendGateLog` on every allowlist edit.

4. **[Scope, All Critical Findings]** Plan 5 has 8 Critical findings. Should the plan still ship as 1 atomic PR, or split?
   - Options: Atomic 1 PR | Split into 2 PRs (identity-first, then gate) | Split into 3 PRs (one per security item)
   - **Answer:** Atomic 1 PR (Recommended, original decision)
   - **Rationale:** Matches the user's original "atomic" decision; the red-team-applied fixes don't change the scope, they tighten execution. Splitting would expose the gap between PR 1 and PR 2 (R2 not enforced → MASTRA_RESOURCE_ID spoofable in the interim).
   - **Affected files:** plan.md Phases table (effort updates).

#### Confirmed Decisions

- **D1:** Wrap workflow step `execute` bodies (DRY: reuse `createLoopTool`'s gate chain). +1d to Phase 1.
- **D2:** Add 100ms × 3 backoff retry to `verifyRuntimeToken` + add `loop_describe` warm-up call to SessionStart hook.
- **D3:** Document the deny-edit window in operator docs; add `appendGateLog` entry on every `.loop/r2-allowlist.json` edit (no code change to gate).
- **D4:** Plan 5 ships as 1 atomic PR. Effort: 1.5d → 2.5d (Phase 1) + 1.5d (Phase 2) + 1d (Phase 3) + 0.5d (Phase 4) = **5.5d** (was 4.5d).

#### Action Items

- [ ] Update Phase 1 effort: 1.5d → 2.5d
- [ ] Add Phase 1 Step 4.5: wrap `createLoopWorkflow` step `execute` bodies
- [ ] Add Phase 1 R6 mitigation: 100ms × 3 backoff + warm-up call
- [ ] Add Phase 4 F5 implementation step: `appendGateLog` on allowlist edit
- [ ] Update plan.md Phases table effort totals

#### Impact on Phases

- **Phase 1:** +1d for workflow step wrapping; cold-start mitigation concretized; verify `createLoopWorkflow` factory.
- **Phase 2:** No scope change. Effort unchanged.
- **Phase 3:** No scope change. Effort unchanged.
- **Phase 4:** Add implementation step for `appendGateLog` on allowlist edit. Effort unchanged.
- **Total effort:** 4.5d → 5.5d.

---

<!-- Updated: Validation Session 1 - Workflow gate wrapping; cold-start mitigation; hot-reload documentation; atomic 1 PR confirmed -->

## Whole-Plan Consistency Sweep

- Files reread: `plan.md`, `phase-01..04`
- Decision deltas checked: 4 (workflow wrapping, cold-start, hot-reload doc, atomic confirmation)
- Reconciled stale references: Phase 1 effort 1.5d → 2.5d; plan.md Phases table; total effort 4.5d → 5.5d
- Unresolved contradictions: **0**
- Plan is consistent with all validation decisions applied.

---

## Red Team Review

### Session — 2026-07-01

**Findings:** 22 total (8 Critical, 6 High, 7 Medium, 1 Low).
**Disposition:** 18 accepted + 4 deferred (deferred = MED items folded into Phase 4 docs).
**Severity breakdown:** 8 Critical, 6 High, 7 Medium, 1 Low.

**Reviewers:** Security Adversary (Fact Checker) + Failure Mode Analyst (Flow Tracer) + Assumption Destroyer (Scope Auditor) per Standard tier (4 phases).
**Reports:**
- `reports/from-code-reviewer-to-planner-red-team-security-adversary-plan-5-review-report.md`
- `reports/from-code-reviewer-to-planner-red-team-failure-mode-analyst-plan-5-review-report.md`
- `reports/from-code-reviewer-to-planner-red-team-assumption-destroyer-plan-5-review-report.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Workflow step handlers bypass gate (server.js:105-137 inline `createTool` + workflow `execute` step bodies) | Critical | Accept | Phase 1 Step 4 + Phase 2 wrapper |
| 2 | Test-runner `--` smuggling not fixed by Phase 3 audit (`meta-state-derive-status-tool.js:23` calls `spawnSync` directly, bypasses `runVerification`) | Critical | Accept | Phase 3 audit site #7 added |
| 3 | Tightening contract Req #4 to strict breaks `claude-code` and `droid` contract validations in CI today (no token file in CI runner home) | Critical | Accept | Phase 4 Step 1 + `--ci-mode` flag |
| 4 | R2 allowlist writable from any runtime; `tools/learning-loop-mastra/**` universal allows rewriting `core/r2/allowlist.json` itself | Critical | Accept | Phase 2: protected-paths list |
| 5 | `process.cwd()` instead of `findProjectRoot()` in R2 wrap; project root never pinned | Critical | Accept | Phase 2 wrapper |
| 6 | `.gitignore` does NOT exclude `runtime-private-key.bin`; plan asserts it does | Critical | Accept | Phase 1 Step 5 + lock-step test |
| 7 | `RUNTIME_ID_TOKEN` env path is unwired (no harness sets it) | Critical | Accept | Phase 1 F4: file-only transport |
| 8 | Cold-start race not mitigated (no SessionStart re-trigger mechanism) | Critical | Accept (re-rated LOW→MEDIUM) | Phase 1 R6 + backoff retry |
| 9 | Droid wiring references wrong file (`.factory/hooks/loop-surface-inject.cjs` is not SessionStart; actual is `.factory/coordination/hooks/recurrence-check-on-start.cjs`) | Critical | Accept | Phase 1 Step 5 |
| 10 | Tool count claim "41 legacy tools" mis-counted (actual 31 per manifest) | High | Accept | Phase 1 F5: programmatic count |
| 11 | `agent-manifest.json` is not a tool-registration path; agents bypass `createLoopTool` gate | High | Accept | Phase 1 F5: scope-down agents to OUT-OF-SCOPE |
| 12 | `minimatch` NOT in dep tree; ERR_MODULE_NOT_FOUND on `import { minimatch }` | High | Accept | Phase 2 §"Gate logic": use `RegExp` fallback |
| 13 | `tools/learning-loop-mastra/**` universal conflicts with current `evaluate-write-gate.js` policy (no rule matches) | High | Accept | Phase 2 Step 6: extend `evaluate-write-gate.js` to consult same allowlist (defense in depth) |
| 14 | Allowlist hot-reload absence leaves runtime writes enabled after operator deny | High | Accept | Phase 2 NF1 + Phase 4 F5 operator doc |
| 15 | `.fallowrc.json` `dynamicallyLoaded` not updated for new `core/identity/`, `core/r2/`, `core/path-containment.js` paths; pre-commit fails | High | Accept | Each phase Step + implementation step |
| 16 | Token expiry during long-running tool calls has no defined behavior (TOCTOU-vs-TOU gap) | High | Accept | Phase 1 R5 + document window |
| 17 | `MASTRA_RESOURCE_ID` fallback in `contract.js` may defeat Phase 1 closure if also in MCP verifier | High | Accept | Phase 4 F4: contract-only fallback; MCP verifier is Ed25519-only |
| 18 | `path-field-detector` regex misses registry-sourced paths; R2 gate is INPUT-only | Medium | Accept | Phase 2 R2: document INPUT-only scope |
| 19 | Token-mint argv (`--runtime-id`, `--key`) shell-injectable | Medium | Accept | Phase 1 Step 5: `execFileSync` with array argv |
| 20 | Realpath cache keyed on caller-controlled `root` parameter (stale on macOS symlinked tmpdirs) | Medium | Accept | Phase 3: key cache by `realpath(root)` |
| 21 | R2 gate ordering — `PathContainmentError` not handled at wrapper level | Medium | Accept | Phase 2 wrapper |
| 22 | `server.js` line-number references in plan are off (line 165 is a comment; actual is 167-185) | Low | Accept | All `server.js:N` references re-verified |

### Whole-Plan Consistency Sweep

- Files reread: `plan.md`, `phase-01..04`
- Decision deltas checked: 22 (all red-team findings)
- Reconciled stale references: 12 (server.js line numbers; tool counts; file paths; Phase 3 audit site list; Phase 4 Req #4 contract semantics; Phase 1 token transport)
- Unresolved contradictions: **0**
- Plan is consistent with all accepted findings applied.