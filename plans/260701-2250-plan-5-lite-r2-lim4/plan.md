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
related:
  - plans/reports/from-ask-to-planner-260701-2250-GH-5-plan-5-lite-r2-lim4-reframe-report.md
  - plans/260701-1730-plan-5-hardening-r2-lim3-lim4/  (original; closed; kept for historical reference)
  - plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-02-r2-write-gate-per-runtime-allowlist.md
  - plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-03-lim-4-path-containment-realpath.md
  - plans/reports/researcher-B-260701-lim4-r2-allowlist-report.md
  - plans/reports/plan-5-followup-260701-mastra-code-bootstrap-phase-a-vs-b-report.md
  - plans/reports/productization-260612-1530-master-tracker.md
  - plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md
---

# Plan 5-Lite: R2 Write-Gate + LIM-4 Path Containment (LIM-3 dropped)

## Overview

This plan ships **only the items from the original Plan 5 that have a concrete threat model** as a single bundled hardening PR. The original Plan 5 (`plans/260701-1730-plan-5-hardening-r2-lim3-lim4/`) bundled three security items — LIM-3 (Ed25519 caller identity), R2 (per-runtime write allowlist), and LIM-4 (realpath containment). LIM-3 is dropped here per a threat-model review; the implementation reframe is documented in the linked reframe report.

**The 2 items kept:**

- **R2 gate layer:** MCP tool wrapper (centralized). All 41 tools + 10 workflows flow through `createLoopTool` (per `tools/learning-loop-mastra/mastra/server.js:39-44`); wrapping the factory covers every tool without per-tool edits. The gate keys on `runtime_id` (pinned at process boot from `LOOP_SURFACE` env var set by the harness `.cjs` shim — see "Identity pinning" below) and a per-project `.loop/r2-allowlist.json` that maps each runtime to its own + universal writable surfaces.
- **LIM-4 fix:** realpath containment helper `core/path-containment.js` + audit-site fixes at the user-path join sites identified by Researcher B (refresh-fingerprint, check-grounding, derive-status, gate-logic#resolveEvidence, 2 test-runner tools).

**Why this is a "lite" plan (vs. the original 3-item Plan 5):**

LIM-3 (Ed25519 signed capability tokens) defends against a threat that requires the attacker to have MCP tool-call access without already having the harness process. In local stdio MCP, those conditions collapse: the harness IS the attacker's path, and the harness can read any file the user can read (including other runtimes' private keys). R2 closes the actual ownership gap ("Runtime A's process writes to Runtime B's surface dir") with a static allowlist lookup. The full threat-model review is in the [reframe report](../reports/from-ask-to-planner-260701-2250-GH-5-plan-5-lite-r2-lim4-reframe-report.md).

**Identity pinning (replaces LIM-3's role without the crypto):**

The MCP server reads `process.env.LOOP_SURFACE` once at process boot, validates it against the `SURFACES` registry (`core/surfaces.js:16`, extended to `[".claude", ".factory", ".mastracode"]`), and stores the resolved `runtime_id` in a process-scoped variable. R2's `checkR2Ownership(path)` keys on this pinned value. The value is **frozen for the process lifetime** — no per-call re-read — so a malicious tool cannot spoof the surface via env mutation. This is exactly the shape of Plan 4's `MASTRA_RESOURCE_ID` check, tightened to fail closed on mismatch.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [R2 Write-Gate (per-runtime allowlist)](#phase-1-r2-write-gate) | Pending | 1.5d | None (foundation for Phase 2) |
| 2 | [LIM-4 Path Containment (realpath)](#phase-2-lim-4-path-containment) | Pending | 1d | None (independent; ships in same PR) |
| 3 | [Cross-Cutting (contracts + docs + sweep)](#phase-3-cross-cutting) | Pending | 0.5d | Phases 1-2 |

**Total effort:** ~3d (down from the original Plan 5's 5.5d, due to dropping Phase 1's LIM-3 work which alone was 2.5d).

**Why bundled (not 3 separate plans):** R2 + LIM-4 share infrastructure (both add an audit-log entry, both extend the contract validator). Splitting adds 2-3 days of overhead for no architectural benefit. The bundle is much smaller than the original (5.5d → 3d) and ships as 1 PR; no intermediate merges.

## TDD-first structure

Per `--tdd` flag, every phase writes regression tests BEFORE the implementation. Each phase:

1. **Red:** write the failing test that proves the gap exists today.
2. **Green:** minimal implementation that makes the test pass.
3. **Refactor:** clean up while keeping tests green.
4. **Lock:** add the regression guard test to the existing test suite.

Tests live next to the code they test: `tools/learning-loop-mastra/__tests__/...` for cross-cutting; per-tool test files for tool-specific changes. No "test-only exports" beyond the existing pattern (`_clearIdempotencyCacheForTests`).

## Dependencies

- **No external dependency.** Phase E closed 2026-06-30. Plan 4 (Mastra Code Validation) already shipped the contract validator + the universal hook layer + the `createLoopTool` factory seam. Both R2 and LIM-4 live inside the existing seam.
- **Identity prerequisite:** `LOOP_SURFACE` env var MUST be set at process spawn by the harness `.cjs` shim (Claude Code + Droid already do this; Mastra Code needs the declarative hook to point at a shim that sets it — implementation in Phase 3). If unset, the MCP server fails to start with a clear error.
- **Surfaces registry:** `tools/learning-loop-mastra/core/surfaces.js:16` currently hard-codes `SURFACES = [".claude", ".factory"]`. Phase 1 must extend this to `[".claude", ".factory", ".mastracode"]` (the third runtime is the Plan 4 addition; Research B's Open Question 5 flagged this).

## Phase 1: R2 Write-Gate

**Source plan:** `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-02-r2-write-gate-per-runtime-allowlist.md` (full requirements; this section is the summary).

### Requirements (F1-F7 + NF1-NF3)

- **F1.** New file `.loop/r2-allowlist.json` (project-local; committed to git) declares each runtime's writable surfaces + universal patterns. Schema version `1`. Generated by `interface/contract.js` from the runtime registry on first server boot; operator can hand-edit.
- **F2.** R2 gate is the **only** gate in `createLoopTool` (LIM-3's identity gate is dropped). Order: path containment (Phase 2) → R2 ownership → tool execute. Path containment throws first on escape; R2 ownership throws first on cross-runtime write.
- **F3.** Default deny: any path not in `own` AND not in `universal` is denied for that runtime. Override: operator sets `deny: []` per runtime (audit-log entry on every override use).
- **F4.** Per-surface mapping:
  - `claude-code`: own = [`.claude/**`]; deny = [`.factory/**`, `.mastracode/**`].
  - `droid`: own = [`.factory/**`]; deny = [`.claude/**`, `.mastracode/**`].
  - `mastra-code`: own = [`.mastracode/**`]; deny = [`.claude/**`, `.factory/**`].
  - `universal` (all runtimes): [`records/**`, `plans/**`, `docs/**`, `AGENTS.md`, `tools/learning-loop-mastra/**`].
- **F5.** Gate emits structured error on denial: `{ error: "cross_runtime_write_denied", runtime, tool, path, hint, denied_at }`. Hint names the owning runtime and points to `.loop/r2-allowlist.json`.
- **F6.** Gate emits a `gate_log` row on every denial (allowlist miss OR override use).
- **F7.** `tools/learning-loop-mastra/core/surfaces.js:16` `SURFACES` constant is extended to `[".claude", ".factory", ".mastracode"]` (single source of truth for the audit-log gate + R2 gate; no divergence).
- **NF1.** Allowlist loaded once at server boot (cached for process lifetime). Operator edits require restart.
- **NF2.** Gate logic adds ≤ 0.5ms per tool call (single `JSON.parse` at boot; in-memory glob match per call via `RegExp` translation).
- **NF3.** Denials are fail-closed: any gate exception → deny + log + escalate (GATE_RESPONSE_MODE=escalate path).

### Identity pinning (replaces LIM-3's role in `createLoopTool`)

```js
// tools/learning-loop-mastra/mastra/server.js (excerpt — process-boot)
let pinnedRuntimeId = null;

function pinRuntimeIdAtBoot() {
  const surface = process.env.LOOP_SURFACE;
  if (!surface) {
    throw new Error("LOOP_SURFACE env var is required at process boot; set by harness .cjs shim");
  }
  if (!SURFACES.includes(surface)) {
    throw new Error(`LOOP_SURFACE=${surface} is not in SURFACES registry: ${SURFACES.join(", ")}`);
  }
  pinnedRuntimeId = SURFACE_TO_RUNTIME[surface];  // e.g., ".claude" -> "claude-code"
}

// In createLoopTool execute():
const runtime = getPinnedRuntimeId();  // throws if not pinned (process-boot failure)
const ownershipDecision = checkR2Ownership({ runtime, pathFields, tool: id });
```

`getPinnedRuntimeId()` is a single read of the boot-pinned value. Tool calls cannot mutate the pinned value (it's a closure variable, not env-derived). The `LOOP_SURFACE` env var is read exactly once at process start; per-call re-read is explicitly disabled.

### Files to create / modify

See the source plan's `Related Code Files` section (`plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-02-r2-write-gate-per-runtime-allowlist.md` lines 113-145 for the full list). The LIM-3-specific items (token-mint CLI, identity-crypto, runtime-key-store) are NOT included.

## Phase 2: LIM-4 Path Containment

**Source plan:** `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-03-lim-4-path-containment-realpath.md` (full requirements; this section is the summary).

### Requirements (F1-F3 + NF1-NF2)

- **F1.** New module `tools/learning-loop-mastra/core/path-containment.js` exports `resolveSafePath(root, userPath)` that returns the absolute, realpath-resolved path iff it lives inside the realpath of `root`. Throws `PathContainmentError` otherwise.
- **F2.** The 6 audit sites identified by Researcher B (`refresh-fingerprint`, `check-grounding`, `derive-status`, `gate-logic#resolveEvidence`, 2 test-runner tools) are migrated from naive `path.join(root, userPath)` to `resolveSafePath(root, userPath)`.
- **F3.** Regression tests cover traversal (`../../../etc/passwd`), symlink escape (file inside root is a symlink to outside), and legitimate paths (must NOT false-positive on `..` inside root).
- **NF1.** Per-call cost ≤ 0.2ms (one `realpath` syscall + one startsWith check).
- **NF2.** Cache `realpath(root)` per process (avoids repeated `realpath` syscalls when the same root is checked many times in a tight loop).

### Files to create / modify

See the source plan's `Related Code Files` section. No LIM-3 coupling.

## Phase 3: Cross-Cutting (contracts + docs + sweep)

- **C1.** Extend `interface/contract.js` to recognize `.mastracode` as a third surface (currently hard-codes 2). Add Req #9 (`.mastracode/` configuration presence) and Req #10 (`.mastracode/hooks.json` references a shim that sets `LOOP_SURFACE`).
- **C2.** Update `interface/__tests__/contract.test.js` and `interface/runtimes-pass-contract.test.js` for Req #9 + #10.
- **C3.** Update `tools/learning-loop-mastra/__tests__/legacy-mcp/surfaces.test.js` and `runtime-agnostic.test.js` to include `.mastracode` in the SURFACES test.
- **C4.** Update `docs/security/plan-5-hardening.md` to document the new gating chain (path containment → R2 ownership) and the identity-pinning mechanism (replaces the old LIM-3 description).
- **C5.** Add `appendGateLog` call on every `.loop/r2-allowlist.json` edit (operator audit trail).
- **C6.** Operator runbook: how to diagnose a `cross_runtime_write_denied` error (which file, which runtime owns the path, how to file an override).

## Open questions (to be answered during the plan; not blocking)

1. **Should the gate cache the allowlist per-server-boot or per-request?** Recommend per-boot (cache-warmed in `server.js` startup; lazy-load fallback for first-call latency). Decision in Phase 1.
2. **Operator override UX:** silent allow + log, or require `RUNTIME_OVERRIDE=1` env var per write? Recommend silent-allow with audit-log entry; same pattern as existing `gate-override.js`. Decision in Phase 1.
3. **Test-runner path coverage:** the LIM-4 fix protects `evidence_test` paths but `verification-runner.js` itself is still attackable via `--` arg smuggling. Out of scope for Plan 5-Lite; flagged in Phase 2 Risk Assessment.
4. **Mastra Code shim wiring:** Mastra Code's declarative `.mastracode/hooks.json` has no `env` field. Phase 3 must add a `.mastracode/coordination/hooks/session-start-shim.cjs` that sets `LOOP_SURFACE=.mastracode` and re-points `.mastracode/hooks.json:SessionStart` at it. Smaller than LIM-3's full token-mint shim; just an env-export wrapper.

## References

- **Reframe report:** `plans/reports/from-ask-to-planner-260701-2250-GH-5-plan-5-lite-r2-lim4-reframe-report.md` — full threat-model review; the rationale for dropping LIM-3.
- **Source plan (closed):** `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/plan.md` — original 3-item plan, kept for historical reference. Phases 2-3 of the original are the implementation basis for this plan's Phases 1-2.
- **Researcher B (LIM-4 + R2):** `plans/reports/researcher-B-260701-lim4-r2-allowlist-report.md` — 20-row audit table of user-path joins + fix helper code + allowlist shape + gate diff shape + test strategy.
- **Red-team security review (Plan 4):** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md` — Findings 1 (MASTRA_RESOURCE_ID spoofability), 11 (validator over-promises), F2 (path traversal), R2 (runtime-interface ownership gate).
- **Followup report (Mastra Code bootstrap analysis):** `plans/reports/plan-5-followup-260701-mastra-code-bootstrap-phase-a-vs-b-report.md` — the analysis that exposed the LIM-3 implementation drift (mint outside MCP, env-var bootstrap).
- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` — Plan 5-Lite row added; LIM-3 dropped from next-up.
- **AGENTS.md §11** "Runtime Interface Ownership (R2)" — the process norm that the gate replaces/augments.

## Status

**Status:** pending (awaiting user approval to start cook).
**Recommended next step:** `/ck:cook plans/260701-2250-plan-5-lite-r2-lim4` (after `--red-team` review per the deep-mode workflow).

---

## Validation Log

*(empty — fill on first session)*

---

## Red Team Review

*(empty — fill on red-team session)*
