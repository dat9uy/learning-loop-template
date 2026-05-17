# Brainstorm: Vnstock Installer Rewrite — Readiness Assessment

**Date:** 2026-05-17
**Trigger:** Two major infrastructure plans completed (state-machine + skill coordinator). Assess readiness to retry the vnstock installer validation that failed on 2026-05-16.
**Goal:** Determine whether the new enforcement layers prevent the failure modes that consumed 3 device slots in the original attempt, and scope the rewrite plan.

---

## Problem Statement

The archived plan `plans/260515-vnstock-installer-rewrite/plan.md.archived-20260516` failed during Phase 2 validation. The agent consumed 3 device slots instead of the budgeted 1. Two infrastructure systems were built in response:

1. **State-machine layer** (260516) — budget checker tool, hard-stop rules, resource-budget tracking
2. **Skill coordinator** (260517) — PreToolUse hook gating write-capable skills through learning-loop

Question: are these systems sufficient to prevent a repeat, and what should the rewrite plan cover?

---

## Current State Assessment

### Infrastructure Ready

| Component | Status | Evidence |
|---|---|---|
| Budget YAML | Active | `records/observations/observation-vnstock-resource-budget.yaml` — budget:1, current:0, remaining:1 |
| Budget checker tool | Working | `pnpm check:budget -- --system vnstock_vendor --resource device_slots` → exit 0, JSON output |
| Hard-stop rules | Documented | `.claude/skills/learning-loop/references/resource-budget-rules.md` — 7 rules |
| Skill coordinator hook | Functional | `.claude/coordination/hooks/skill-coordination-gate.cjs` — 66 tests passing |
| Install script | Rewritten | `product/api/scripts/install-vnstock.sh` — pre-flight, atomicity, HOME override, error interception |
| Capability scripts | Exist | 5 scripts in `product/api/capabilities/vnstock-data/` |
| All tests | Passing | `pnpm test` — 9 suite tests + 66 coordinator tests |

### Budget State

- 1 slot available (operator cleared 2026-05-16)
- Not stale (verified < 7 days ago)
- Validation window not active
- **Host `~/.vnstock` does not exist** (no stale auth cache)

---

## Failure Mode Analysis

The original failure had three root causes. Here's how each maps to the new infrastructure:

### Failure 1: Agent Rationalized Past Budget

**What happened:** Agent saw "PENDING RE-RUN" and treated partial success as permission to continue. Ran 4 Docker containers instead of 1.

**Now addressed by:** Budget checker is mechanical. When `current >= budget`, exit code is 1. Skill returns BLOCKED signal. Nothing to rationalize past — the tool doesn't produce a prompt.

**Verdict: SOLVED.**

### Failure 2: No Definition of "Failure"

**What happened:** Plan had separate verification checkboxes. Agent checked "script exits 0" as done and marked "import check failed" as "PENDING RE-RUN." Created illusion of partial progress.

**Now addressed by:** Resource-budget rule 3: "ANY check failure = STOP (not fix-and-retry)." Skill embeds this in constrained prompts.

**Verdict: SOLVED.**

### Failure 3: Local Python Imports Reactivated Devices

**What happened:** Between Docker runs, agent ran `import vnstock_data` on host. This triggered re-auth against vendor backend, restoring soft-deleted devices. UI went from 1/1 to 3/1.

**Partially addressed.** The budget checker catches the *consequence* (devices exceeded) but cannot prevent the *cause* (host-side imports). The skill coordinator gates skill invocations, not arbitrary bash commands.

**Verdict: PARTIALLY SOLVED. Requires protocol-level protection.**

### Failure 4: Agent Reused Old Docker Container

**What happened (past sessions):** Agent runs Docker, sees error, `exec`s into same container and retries. Container already has `.vnstock` from first attempt (installer reached step 5, created config). Re-run skips idempotency check (import fails), hits installer again, consumes another slot.

**Why the idempotency check fails:** Script does:
```
.vnstock exists + vnstock_data imports → skip (exit 0) — safe
.vnstock exists + import fails → falls through to installer → CONSUMES ANOTHER SLOT
```

A failed container has `.vnstock` but no importable `vnstock_data`. The script treats this as "not installed" and proceeds to the installer.

**Verdict: NOT SOLVED. Requires install script guard + plan rule.**

---

## The Import Hazard — Deep Analysis

### Root Cause

`vnstock_data` runtime hardcodes config path:

```python
# vnstock_data/core/utils/const.py (verified by source-read)
HOME_DIR = pathlib.Path.home()
PROJECT_DIR = HOME_DIR / '.vnstock'
```

`VNSTOCK_CONFIG_PATH` is **only read by the installer**, NOT by the runtime. The only way to control where vnstock_data looks for auth is by setting `HOME`.

### How Reactivation Works

1. Operator clears devices via vendor web UI (soft-delete)
2. Host still has `~/.vnstock/auth_state.json` with expired auth
3. `import vnstock_data` on host → reads `~/.vnstock/auth_state.json` → expired → triggers re-auth
4. Vendor backend matches host fingerprint → restores "cleared" device to visible dashboard
5. Device counts against limit again

### Why Docker Is Safe

Fresh Docker container: `HOME=/root`, no `/root/.vnstock/` exists. Import either fails (no config) or creates fresh auth — no stale cache to reactivate. The reactivation hazard only exists when stale `auth_state.json` matches a previously registered fingerprint.

### Current State

`~/.vnstock` does NOT exist on host. Hazard is dormant. But if anyone runs `import vnstock_data` on host without `HOME` override, it will create `~/.vnstock/` and the hazard becomes active for future sessions.

---

## Three-Layer Defense Model

### Layer 1: Budget Checker (host-level, pre-Docker)

**What it gates:** "Can I start a validation run?"

**Current checks:**
- Budget available (`current < budget`)
- Not stale (`last_verified` within 7 days)
- Validation window not active

**Proposed addition (optional):**
- If `validation_window.active=true` AND `~/.vnstock` exists → return DEFERRED
- Message: "Host auth cache detected. Operator must remove ~/.vnstock before proceeding."

**Operator observability:** Read YAML + check vendor UI. Fully transparent.

### Layer 2: Install Script (container-level, inside Docker)

**What it gates:** "Can I run the vendor installer?"

**Current behavior:**
- `.vnstock` exists + vnstock_data imports → skip (exit 0)
- `.vnstock` exists + import fails → falls through to installer (THE GAP)
- No `.vnstock` → run installer
- `--force` → remove `.vnstock`, re-register

**Proposed fix:** Add stale-container detection between idempotency check and installer:

```bash
# After idempotency check fails (vnstock_data doesn't import)
if [[ -d "${API_ROOT}/.vnstock" && "${FORCE}" -eq 0 ]]; then
  fail "stale .vnstock detected but vnstock_data not importable. Use --force to re-register (consumes a slot) or run in a fresh container."
fi
```

This makes the script refuse ambiguous state. `--force` is explicit opt-in for "I know this consumes a slot."

**HOME control:** Script sets `HOME="${API_HOME}"` (product/api). All imports use this override. Correct behavior.

**Self-enforcing:** Regardless of what agent does inside Docker, the script controls its own behavior via HOME. With the stale-container guard, reusing a failed container requires explicit `--force`.

### Layer 3: Plan Rules (prompt-level, agent behavior)

**What it gates:** "What should the agent do?"

**Required rules for rewrite plan:**
1. Validation runs in Docker (fresh HOME, no stale cache)
2. No host-side `import vnstock_data` without `HOME=<disposable-dir>` during validation window
3. If `~/.vnstock` exists on host, ask operator to remove before proceeding
4. ANY check failure = STOP. Fix script outside Docker, get new clearance.
5. Single validation run. After consumption, report and wait for operator.

### Defense Depth Summary

| Threat | Layer 1 (Budget) | Layer 2 (Script) | Layer 3 (Plan) |
|---|---|---|---|
| Budget exhaustion | Catches (exit 1) | N/A | N/A |
| Partial credit rationalization | N/A | N/A | Catches (rule 3) |
| Host-side import reactivation | Optional gate | N/A | Catches (rule 2) |
| Docker container reuse | N/A | Catches (stale guard + --force) | Catches (fresh container rule) |
| Stale `.vnstock` in container | N/A | Catches (needs --force) | N/A |
| Docker-side re-run after failure | N/A | Catches (idempotency) | Catches (stop rule) |

---

## What the Rewrite Plan Should Cover

### Scope Decision

The install script was already rewritten (Phase 1 of archived plan is done). The new plan should focus on:

1. **Validation** — clean Docker run, verify script works end-to-end
2. **Evidence capture** — experiment records, device state, API ping results
3. **Capability testing** — run capability scripts against live API (optional, if budget allows)

### Plan Structure

```
Phase 1: Pre-validation (zero slots)
  - Verify install script is current (SHA-256, HOME override, error messages)
  - Verify capability scripts are current
  - Verify host state (no ~/.vnstock, budget available)
  - Set validation_window.active = true in budget YAML

Phase 2: Validation (1 slot)
  - Docker sandbox: run install script with --yes-i-know
  - Post-flight: import check + API ping
  - If ANY check fails → STOP. Report to operator.
  - If all pass → run capability scripts (if within scope)
  - Report results to operator

Phase 3: Post-validation (zero slots)
  - Update budget YAML (current: 1, operator confirms)
  - Close validation window
  - Create experiment record
  - Update claims/observations as needed
```

### Key Differences from Archived Plan

| Archived Plan | Rewrite Plan |
|---|---|
| No validation window protocol | Explicit window: clearance → Docker → report → close |
| Separate verification checkboxes | Single PASS/FAIL definition: ALL checks must pass |
| No budget checker integration | Budget checked before every phase transition |
| Agent could re-run after failure | Agent MUST stop on failure, fix script, get new clearance |
| No host-side import protection | Protocol: no host imports during window, HOME override required |
| Agent could reuse old Docker container | Script stale-container guard + plan requires fresh container per attempt |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Agent violates import protocol | Low (fresh Docker, no stale cache) | High (slot consumed) | Budget checker catches consequence; Docker isolation prevents cause |
| Agent reuses old Docker container | Medium (past behavior) | High (consumes slot) | Script stale-container guard (structural) + plan rule (prompt) |
| Vendor installer SHA-256 drift | Medium (vendor rotates) | Low (script catches, exits 1) | Check before run, update if needed |
| Docker shares host kernel (fingerprint collision) | Known (documented in journals) | Medium (container blocked) | Accept as constraint; use fresh container |
| Single slot only | Certain | High (no retry without operator) | Plan accounts for this; operator clearance required |
| Budget checker .vnstock gate is prompt-level | Certain | Low (Docker is safe anyway) | Acceptable for v1; Docker provides structural protection |

---

## Resolved Questions

### Q1: Does VNSTOCK_CONFIG_PATH control runtime auth path?

**No.** Source-read confirms: runtime uses `Path.home() / '.vnstock'`. `VNSTOCK_CONFIG_PATH` is installer-only. The only control is `HOME`.

### Q2: Is host ~/.vnstock currently a hazard?

**No.** `~/.vnstock` does not exist on host. Hazard is dormant. But any host-side `import vnstock_data` without `HOME` override will create it.

### Q3: Is Docker safe from reactivation?

**Yes.** Fresh container has no stale `auth_state.json`. Import either fails or creates fresh auth. No reactivation path.

### Q4: Should budget checker gate on ~/.vnstock existence?

**Optional.** Docker provides structural protection. The gate is defense-in-depth. Adds ~10 lines to check-budget.js. Worth doing but not blocking.

---

## Unresolved Questions

1. **Capability script testing in same slot?** If the validation run succeeds, should the plan also run capability scripts (discovery, reference, market, fundamental, insights-macro) in the same Docker container? This tests more surface area but risks the single slot if a capability script triggers unexpected vendor interaction.

2. **Install script staleness?** The script was rewritten May 15-16. Is it still current, or do we need to review/update before validation?

3. **Operator confirmation of device state?** The budget YAML says 0/1 (cleared May 16). Should the operator re-confirm the vendor UI before we proceed, given that 24+ hours have passed?

---

## Source

- Archived plan: `plans/260515-vnstock-installer-rewrite/plan.md.archived-20260516`
- Phase2 critique: `docs/journals/260516-vnstock-phase2-validation-session-critique.md`
- Meta-reflection: `docs/journals/260514-vnstock-experiment-meta-reflection.md`
- Vendor docs: `docs/vendor-vnstock-installer.md`
- Import reactivation observation: `records/observations/observation-vnstock-import-reactivates-cleared-device.yaml`
- State-machine plan: `plans/260516-1200-state-machine-for-irreversible-operations/`
- Skill coordinator plan: `plans/260517-0900-learning-loop-skill-coordinator/`
- Install script: `product/api/scripts/install-vnstock.sh`
