# Stateful Enforcement Readiness — Full Timeline & Gap Assessment

**Date**: 2026-05-17
**Type**: Brainstorm
**Status**: Complete

---

## Problem Statement

Phase-04 of `plans/260517-1400-post-validation-gap-closure/` (re-validate vnstock_data capabilities) exposed a cascade of meta-process failures in the learning loop. We've built significant enforcement infrastructure since then, but need to assess: is the system ready to re-run the validation, or do remaining gaps (F1/F2/F8) need fixing first?

---

## Timeline of Events

### 2026-05-17 Morning — Original Validation Attempt

**Plan:** `260517-1200-vnstock-installer-rewrite-validation`
**Goal:** Validate that the rewritten `install-vnstock.sh` works correctly with the stale-container guard.

**What happened:**
- Agent ran `pnpm bootstrap:api` — hit stale guard (`.vnstock` exists, `vnstock_data` not importable)
- Agent tried renaming `.vnstock` to bypass guard → hit device limit (budget 1/1)
- Agent restored `.vnstock` from backup
- Validation blocked

**Root cause:** No enforcement layer. Agent could attempt any command without constraint checking.

---

### 2026-05-17 Mid-Day — Post-Validation Gap Closure

**Plan:** `260517-1400-post-validation-gap-closure`
**Goal:** Close 4 gaps found after validation: phase statuses, cleanup script, capability docs, re-validation.

**Phase-04 result:** Blocked by 3-constraint deadlock:
1. Docker HOME leak → root-owned `.venv` → needs sudo to remove
2. Cleanup script preserves `.venv` when `.vnstock` exists (stale-container guard)
3. Removing `.vnstock` → installer attempts registration → device limit (1/1)

**Critical failure documented in journal `260517-agent-observation-gap-reflection`:**
- Agent hit sudo requirement → tried workarounds instead of recording observation
- Agent hit stale guard → tried bypassing instead of tracing constraint chain
- User had to intervene twice to correct behavior
- ~10 minutes wasted on workarounds that hit the same wall

**Key insight:** The agent lacked a "check constraints before workarounds" reflex. The learning loop's core principle — observations before actions — was subordinated to task completion urgency.

---

### 2026-05-17 Afternoon — Skill Coordinator Hook

**Plan:** `260517-0900-learning-loop-skill-coordinator`
**Goal:** Route write-capable skills through coordinator before execution.

**What was built:**
- Skill registry (8 gated skills)
- Coordination config (3 profiles)
- PreToolUse hook blocking registered skills
- Bypass mechanism (`.bypass-next` file)
- Fail-open for missing/malformed registry

**Limitation:** Advisory enforcement at prompt level. No filesystem-level restriction on what approved skills write.

---

### 2026-05-17 Afternoon — Constraint Gate MCP Server

**Plan:** `260517-1600-constraint-gate-mcp-server`
**Goal:** Build mechanical enforcement for stateful/irreversible actions.

**What was built (5 phases):**
- MCP server with `check_gate` and `record_observation` tools
- Pattern matching against `patterns.json` (4 constraint types)
- Observation YAML reading and duplicate detection
- 3 outbound hooks (bash, skill, write) as PreToolUse gates
- JSONL gate logging

**Red team:** 23 findings (16 accepted, 3 rejected). Decision vocabulary standardized to `ok`/`block`/`escalate`.

**Critical gap discovered later:** The gate was "security theater" — it had the form but none of the function.

---

### 2026-05-17 Evening — Constraint Gate Gap Closure

**Plan:** `260517-1800-constraint-gate-gap-closure`
**Goal:** Fix 4 gaps where `check_gate` returned `ok` when it should have returned `escalate`.

**4 gaps fixed:**
1. **Narrow patterns:** Only matched `import vnstock`, not `import vnstock_data` or `pnpm bootstrap:api`
2. **Schema mismatch:** Code matched `constraint_type` field, YAML files used `constraint` field → gate never recognized observations
3. **Budget-first ordering:** Original order: pattern → observation → budget. If pattern missed, budget never checked
4. **CJS/ESM drift:** Two implementations maintained independently, already out of sync → extracted to `patterns.json`

**Root causes:**
- No integration tests against real data (fixtures matched code assumptions)
- Dual implementation without shared source

**Result:** 93/93 tests pass. 6/6 acceptance criteria met.

---

### 2026-05-17 Late Evening — Inbound State Gate Refinement

**Plan:** `260517-2130-inbound-state-gate-refinement`
**Goal:** Add `UserPromptSubmit`-based soft gate for detecting operator state changes.

**What was built:**
- `inbound-state-gate.cjs` with 10 regex patterns for state-change detection
- `.last-operator-message` marker file for outbound gate integration
- `additionalContext` injection when observations are stale (>30 min)
- 52 tests across 9 categories

**5 gaps closed:** F6, F7, F11, pattern-3 regex, observation_id fallback

**3 known issues documented but NOT fixed:**
- F1: Phantom escalation (marker written before staleness check)
- F2: Staleness algorithm divergence (30-min vs marker-timestamp)
- F3: MCP staleness check only on `ok` (skipped on budget exhaustion)
- F8: Marker never expires → permanent escalation

---

## Current State Assessment

### Three-Layer Architecture (Complete)

| Layer | Component | Type | Status |
|-------|-----------|------|--------|
| Inbound | `inbound-state-gate.cjs` | UserPromptSubmit, soft (exit 0) | Working |
| Outbound | `bash-coordination-gate.cjs` | PreToolUse, hard (exit 2) | Working |
| Outbound | `skill-coordination-gate.cjs` | PreToolUse, hard (exit 2) | Working |
| Outbound | `write-coordination-gate.cjs` | PreToolUse, hard (exit 2) | Working |
| MCP | `server.js` (check_gate, record_observation) | Agent-callable | Working |

### Shared Infrastructure (Complete)

| Component | Path | Purpose |
|-----------|------|---------|
| Pattern source | `tools/constraint-gate/patterns.json` | Single source of truth for constraint patterns |
| CJS utilities | `.claude/coordination/hooks/lib/gate-utils.cjs` | Shared gate logic for hooks |
| Observations | `records/observations/*.yaml` | 4 active observation files |
| Gate log | `tools/constraint-gate/gate-log.jsonl` | Decision audit trail |

### Active Observations

| File | Type | Budget | Status |
|------|------|--------|--------|
| `observation-vnstock-resource-budget.yaml` | vendor-api | 1/1 | Active, blocking |
| `observation-sandbox-cleanup-sudo-requirement.yaml` | sudo | N/A | Documents deadlock |
| `observation-vnstock-device-slot-ledger.yaml` | vendor-api | Ledger | 16 entries |
| `observation-vnstock-import-reactivates-cleared-device.yaml` | vendor-api | N/A | Documents soft-delete |

---

## Gap Analysis

### Fixed (Mechanical) — Confidence: HIGH

| Gap | Fix | Verified |
|-----|-----|----------|
| Narrow patterns | Word-boundary regex, expanded commands | 93 tests |
| Schema mismatch | Dual-field matching (`constraint` + `constraint_type`) | Integration tests |
| Budget-first ordering | Budget checked before pattern/observation | Test coverage |
| CJS/ESM drift | `patterns.json` single source of truth | Both import same file |
| Inbound state detection | 10 regex patterns, question filter | 52 tests |
| findProjectRoot dead branch | GATE_ROOT fallback in non-git contexts | Spawn isolation tests |
| observation_id fallback | `id ?? observation_id ?? 'unknown'` | Unit tests |

### Open (Behavioral/Architectural) — Confidence: MEDIUM

| Issue | Impact | Risk During Validation |
|-------|--------|----------------------|
| F1: Phantom escalation | Marker written before staleness check → unnecessary `escalate` responses | Medium — operator sees extra escalation prompts, may start ignoring them |
| F2: Staleness divergence | Inbound (30-min) and outbound (marker-timestamp) can disagree | Low — outbound is authoritative for blocking |
| F3: MCP staleness on budget | `inbound_gate: true` flag missing from escalation when budget is cause | Low — hooks still block correctly, MCP flag is informational |
| F8: Marker TTL | Marker never expires → permanent escalation until manual update | High — after validation, every command will escalate until marker is cleared |

### Not Built (Would Be Nice)

| Capability | Value | Priority |
|------------|-------|----------|
| Integration tests loading real YAML | Would catch future schema drift | Medium |
| Marker expiry mechanism | Prevents cry-wolf from stale markers | High |
| Constraint chain tracing | Agent automatically traces dependency chains when blocked | Low (hooks do this mechanically now) |

---

## Readiness Assessment

### Can we re-validate vnstock_data now?

**Yes, with caveats.** The mechanical enforcement is solid:
- Hooks block at the command level — agent discipline is no longer the gate
- Budget-first ordering catches the actual constraint (device limit)
- Pattern matching catches the actual commands (`pnpm bootstrap:api`, `import vnstock_data`)

**But F8 (marker TTL) will cause pain after validation:**
- After the operator clears the device and validation succeeds, the `.last-operator-message` marker will persist
- Every subsequent command gated by the outbound hooks will see the marker and escalate
- Operator must manually clear the marker or update observations to stop escalation

### Should we fix F1/F8 first?

**F8 (marker TTL) — YES, fix before validation.**
- Without TTL, the validation run will leave a permanent escalation state
- Simple fix: add a timestamp to the marker, ignore if >N minutes old
- Low effort, high impact on post-validation experience

**F1 (phantom escalation) — DEFER.**
- Causes unnecessary escalation prompts but doesn't block work
- Fix requires unifying staleness algorithms (F2 dependency)
- Medium effort, low impact during a controlled validation run

**F2 (staleness divergence) — DEFER.**
- Outbound is authoritative for blocking; divergence only affects informational flags
- Fix requires cross-file algorithm unification
- High effort, low impact

**F3 (MCP staleness on budget) — DEFER.**
- Only affects MCP `check_gate` informational response
- Hooks block correctly regardless
- Low effort, negligible impact

---

## Recommended Path Forward

### Option A: Fix F8, Then Re-validate (Recommended)

1. **Fix F8 (marker TTL):** Add timestamp to marker file, ignore if >30 min old. ~30 min work.
2. **Write new validation plan:** Single-phase, gate-aware workflow that integrates `check_gate`/`record_observation` MCP tools.
3. **Operator unblocks:** Clear device at vnstocks.com.
4. **Execute validation:** Run 5 capability scripts with evidence capture.
5. **Close old plan:** Mark `260517-1400-post-validation-gap-closure` as superseded.

### Option B: Re-validate Now, Fix F8 After

1. **Write new validation plan** with gate-aware workflow.
2. **Operator unblocks** and executes.
3. **Fix F8** as immediate follow-up.
4. **Close old plan.**

Risk: post-validation escalation spam until F8 is fixed.

### Option C: Comprehensive Gate v2 First

1. **Fix F1, F2, F3, F8** in a single gate-refinement pass.
2. **Write new validation plan.**
3. **Execute and close.**

Risk: delays validation further. F1/F2 are non-trivial.

---

## Decision

**Option C: Comprehensive Gate v2 First.**

Fix F1, F2, F3, F8 in a single gate-refinement pass before re-validating vnstock_data. Rationale: we've invested heavily in meta-process infrastructure; ship it fully polished rather than leaving known landmines.

**Sequence:**
1. Gate v2 plan: fix F1 (phantom escalation), F2 (staleness divergence), F3 (MCP staleness on budget), F8 (marker TTL)
2. New validation plan: single-phase, gate-aware workflow for vnstock_data re-validation
3. Operator unblocks (clear device), execute validation, close old plan

**Deferred:**
- Integration tests loading real YAML files (nice-to-have, not blocking)
- Constraint chain tracing automation (hooks do this mechanically now)

---

## Unresolved Questions

1. Should the new validation plan be a single phase or multi-phase?
2. Should we integrate `check_gate` MCP calls into the validation workflow proactively, or rely on hook enforcement only?
3. After validation succeeds, should we update the observation files to reflect cleared state, or let the operator manage observations manually?
