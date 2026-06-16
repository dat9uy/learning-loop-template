# Red-Team Plan Review — Fix Stale records/observations References

**Type:** red-team plan review  
**Date:** 2026-06-14  
**Plan:** `plans/260614-1856-GH-1259-fix-stale-records-references/`  
**Scope:** gate-logic migration from `records/observations/` to `runtime-state.jsonl`  
**Reviewers:** security/blast-radius lens + implementation/YAGNI lens  

---

## Executive Summary

The plan correctly identifies the root cause: Phase A migrated observation YAMLs to `runtime-state.jsonl`, but the gate layer still reads from the now-empty `records/observations/` directory, causing all constraints to block. The original plan was **not safe to execute** due to four critical gaps:

1. `runtime-state.jsonl` was not write-protected by the gates.
2. Constraint mapping was underspecified and would allow trivial bypasses.
3. The `records/evidence/**` unlock path was at risk of being removed.
4. Runtime-state read/write concurrency and malformed-line handling were not addressed.

The plan has been revised to close these gaps. This report documents the findings and the required mitigations.

---

## Critical Findings

### 1. `runtime-state.jsonl` Not Write-Protected

**Risk:** An agent could inject fake ledger events via `echo ... > runtime-state.jsonl` because the bash gate only blocks `records/**` and `meta-state.jsonl` writes.

**Evidence:** `bash-gate.js:33-43` PATH_WRITE_PATTERNS does not include `runtime-state.jsonl`.

**Mitigation (applied to plan):**
- Add `runtime-state.jsonl` to `PATH_WRITE_PATTERNS` in `bash-gate.js`.
- Add an unconditional block for `runtime-state.jsonl` in `write-gate.js`.
- Verify in phase-6 that direct writes are blocked.

### 2. Constraint Mapping Semantics Were Lossy

**Risk:** Mapping `package-manager` → `["vnstock", "product"]` would let any active `vnstock` ledger-event unblock package-manager commands, even if the entry is about device slots, not package installs.

**Evidence:** `runtime-state.jsonl` ledger events have no `constraint_type` field; `gate-logic.js:209-219` checks `obs.constraint_type` or `obs.constraint`.

**Mitigation (applied to plan):**
- Use a **reverse** map (`affected_system` → `[constraint_type]`).
- Return one observation-shaped object per mapped constraint from `readRuntimeObservations`.
- Add a metadata authorization hook so only entries whose `metadata` indicates the right authorization satisfy the constraint.
- Keep `docker` and `sudo` hard-blocked until explicitly modeled.

### 3. `records/evidence/**` Unlock At Risk of Removal

**Risk:** The original plan suggested option (b): remove the observation-based unlock and block all `records/**`. This would break the evidence workflow because preflight markers only unlock `product/**`, not `records/evidence/**`.

**Evidence:** `gate-logic.js:359-402` currently unblocks `records/evidence/**` via write-path observations; `writePreflightMarker` is only called for `product` surface.

**Mitigation (applied to plan):**
- Preserve the `records-evidence` unlock.
- Implement it via an active meta-state rule lookup or a runtime-state metadata flag (`metadata.records_evidence_authorization === true`).
- Document the interim nature of the unlock with a TODO.

### 4. Runtime-State Read/Write Concurrency and Malformed Lines

**Risk:** `runtime-state.jsonl` lacks the per-root write queue that `meta-state.js` uses. A reader could see a partial file during a write. A single malformed line currently causes `readSidecar` to return `[]`, silencing all observations.

**Mitigation (applied to plan):**
- Add per-line JSON parse error handling: skip bad lines, do not fail the entire file.
- Document that runtime-state writes must use atomic tmp+rename.
- Consider a follow-up hardening pass for a read-write lock if contention appears.

---

## High-Priority Findings

### 5. `workflow-registry.js` Still Triggers on `records/observations/**`

**Risk:** Dead trigger that the original plan missed.

**Mitigation (applied to plan):** Added `workflow-registry.js` to phase-3; remove the `observation-changed` trigger.

### 6. `readBudgets` Is YAGNI

**Risk:** The original plan proposed adding `readBudgets` to read `budget-state` rows, but no such rows exist and `evaluateBudget` is dead code in `makeGateDecision`.

**Mitigation (applied to plan):** Removed `readBudgets` from scope.

### 7. Test Scope Was Over-Reach

**Risk:** The original plan listed 8 test files to modify, but most tests that assert `records/observations/**` blocking are still correct and should not change.

**Mitigation (applied to plan):** Reduced phase-5 to only the tests that actually create fake observations or test constraint satisfaction.

---

## Unresolved Questions

1. Is the `records/evidence/**` interim unlock (meta-state rule or runtime-state metadata flag) acceptable, or should a promoted rule be created before implementation?
2. Should `runtime-state.jsonl` eventually be moved under `records/` (e.g., `records/runtime-state.jsonl`) so it inherits the existing write-block patterns?
3. Who is authorized to create `runtime-state.jsonl` entries — only MCP tools, or also human operators via direct file edits?

---

## Verdict

**The revised plan is conditionally safe to execute.** The four critical blockers have been addressed in the plan text. Implementation should still proceed carefully: write the runtime-state protection first, then the observation reader, then the tool updates, and verify each step before moving to the next.

---

## Recommended Next Step

Run `/ck:plan validate plans/260614-1856-GH-1259-fix-stale-records-references/` to surface any remaining unspecified assumptions before implementation.
