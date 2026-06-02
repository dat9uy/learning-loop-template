---
date: "2026-06-02T12:00:00Z"
status: superseded
superseded_by: brainstorm-260602-meta-state-agent-affordances.md
superseded_at: "2026-06-02T12:30:00Z"
supersession_reason: |
  System-side framing (function derives, sweep auto-mutates) replaced by agent-side
  framing (MCP tools the agent calls). The decomposition into 3 sub-projects is
  generalized to 4 (SP0 self-modification affordance + SP1-SP3 query affordances).
  See the superseding report for the new design.
tags: [brainstorm, meta, meta-state, status-derivation, self-healing, gate, decomposition, superseded]
related:
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md
  - plans/260602-strict-mcp-call-rules/plan.md
  - plans/260602-self-enforcing-loop/plan.md
  - plans/260602-meta-state-lifecycle-tidy/plan.md
  - docs/journals/260602-meta-state-revert-2026-06-02.md
  - docs/philosophy.md
  - docs/observation-vs-meta-state.md
  - meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz
  - meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th
  - meta-260601T1353Z-sanitizeslug-in-record-writer-js-generates-a-kebab-case-slug
  - meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal
  - meta-260602T1116Z-agent-inside-a-project-that-has-its-own-mcp-json-called-ck-u
  - meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co
  - meta-260602T0729Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co
  - meta-260602T1112Z-live-g8-subcommand-class-false-positive-rule-no-new-artifact
  - tools/learning-loop-mcp/core/meta-state.js
  - tools/learning-loop-mcp/tools/meta-state-resolve-tool.js
  - tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js
  - tools/learning-loop-mcp/tools/meta-state-sweep-tool.js
  - tools/learning-loop-mcp/tools/loop-describe-tool.js
  - tools/learning-loop-mcp/core/gate-logic.js
---

# [SUPERSEDED] Derived Status and Self-Healing Meta-State

> ## STATUS: SUPERSEDED (2026-06-02T12:30Z)
>
> This report is **retained as historical analysis**. It correctly identified the meta-question — "how should meta-state status be derived from ground truth, rather than asserted by `meta_state_resolve`?" — and proposed a 3-sub-project decomposition (SP1 derived status → SP2 mechanism linkage → SP3 self-healing sweep).
>
> **However**, the framing was system-side: the system derives, the system sweeps, the system auto-mutates. The superseding report reframes this agent-side: MCP tools the agent calls, derivation the agent queries, drift the agent surfaces, the agent decides.
>
> **What's preserved here:** the 3 deeper concerns (premature flagging, snapshot rot, no self-healing) are valid and inform the superseding design.
>
> **What's superseded:** the system-side decomposition, the 30-day auto-mutation phase 2, and the suggestion that `meta_state_sweep` auto-reconciles status. The superseding report replaces these with 4 MCP tool affordances (SP0 self-modification + SP1-SP3 query).
>
> The original problem statement, evaluated approaches, and SP1-SP3 sub-project specs are preserved below for historical context.

---

# Derived Status and Self-Healing Meta-State

> **Original status (now superseded):** Proposed. Design doc only. No plan, no code, no `meta-state.jsonl` edits this session. Decomposition into 3 sub-projects (SP1 → SP2 → SP3) approved by operator on 2026-06-02. Each sub-project gets its own brainstorm → plan → implement cycle.

## Context

After `260602-strict-mcp-call-rules/` completed on commit `44e616b`, a "view meta-state + resolve stale items" pass was attempted. The 15 entries in `meta-state.jsonl` broke down as: 5 active, 3 reported, 4 expired, 3 resolved. Five entries had obvious resolution candidates:

- **2 entries** (`meta-260601T1339Z-*`) explicitly reverted on 2026-06-02 by journal `260602-meta-state-revert-2026-06-02.md` because they claimed resolution without adoption evidence. The plan that closes the gap (`260602-strict-mcp-call-rules/phase-02`) just shipped.
- **3 entries** already have `promoted_to_rule` populated (`rule-short-slug-for-risk-records`, `rule-no-new-artifact-types`, `rule-project-skill-boundary`). The rules are live in `loadPromotedRules`.

Initial proposal was to call `meta_state_resolve` on all 5 with mechanism-anchored `resolution` text. Operator pushback surfaced 3 deeper concerns:

1. **Premature flagging.** Operator marking an entry as "resolved" is a judgment, not a fact. Same category error the journal warned about ("mechanism exists ≠ mechanism is used").
2. **Resolution text is a snapshot.** Test counts in `resolution` go stale as the test suite evolves. The field is frozen at write time.
3. **No self-healing.** Status is asserted manually, never re-derived. If the truth changes, the status rots silently.

The current `meta_state_resolve` tool is suspect. It is the only path to a terminal state, and the only field it populates (`resolved_by`, `resolution`) is operator-asserted and frozen.

## Problem Statement

**How should `meta-state` status be derived from ground truth, rather than asserted by `meta_state_resolve`?**

Two separate sub-questions:

- **Q1 (status semantics):** What does it mean for a meta-state entry to be "resolved"? Three candidate meanings: (a) rule is live in `loadPromotedRules`, (b) referenced mechanism exists in code + tests pass, (c) operator judgment.
- **Q2 (status lifecycle):** Can the system re-derive the answer to Q1 from current code state, or is the operator's last `meta_state_resolve` call the authoritative (and rotting) source?

The current system has no answer to either. Status is asserted, frozen, and rots.

## What the Philosophy Already Says

`docs/philosophy.md` (Pillar 3, "Evidence Is Source, Not Proof"):

> Truth status lives in the machine-extracted index, not in evidence. An index entry is an atomic assertion derived from evidence `## Findings`; it carries dimension, scope, and status. **Evidence is referenced by index entries; index entries are never inferred from evidence directly.**

`docs/observation-vs-meta-state.md` (The Three Layers):

> Domain state must stay in `records/observations/`. Meta-state tracks reasoning, not numbers.

The index already has the pattern. Each `index.yaml` entry is a derived assertion: truth lives in code + observations, not in evidence text. The meta-state registry has not been retrofitted with the same pattern. Status is still asserted text, not derived state.

## Evaluated Approaches (for the Decomposition)

### A. Patch the existing `meta_state_resolve` (add structured `resolved_by` enum, snapshot detail)

Extend `meta-state-resolve-tool.js` to accept `resolved_by: "mechanism-shipped" | "promoted-to-rule" | "operator" | "auto-resolve"`. Update `meta-state-sweep-tool.js` to classify by the new enum. ~30 lines of code.

| Pros | Cons |
|---|---|
| Smallest change. Compatible with existing tool. | Still asserts status, not derives it. Test counts in `resolution` still rot. The operator's last call remains authoritative. No self-healing. |
| Centralizes the resolution categories. | Does not address Q2 (status lifecycle). The new enum is a vocabulary for assertions, not a derivation mechanism. |

**Verdict:** Insufficient on its own. Helpful as a *building block* for SP2.

### B. Add a derived-status observer (read-only function that re-derives status from code)

New function `deriveStatus(entry, codeContext) -> {status, evidence}` that returns the effective status. Pure function. Re-runnable. Used by:
- `loop_describe` to expose both `raw_status` and `derived_status` for every entry
- `meta_state_sweep` to identify entries whose `status` field disagrees with `derived_status`
- A new optional MCP tool `meta_state_audit` that returns a diff report

| Pros | Cons |
|---|---|
| Status becomes a function of code state. Operator assertions are hints, not truth. | Doesn't *replace* the asserted field; it runs alongside it. Risk of two parallel sources of truth unless one is removed. |
| Test count, file existence, rule activation are all observable. Resolution text doesn't rot because it's regenerated on demand. | A new tool means new schema, new tests, new docs. |

**Verdict:** The core mechanism for SP1.

### C. Self-healing sweep (auto-reconcile `status` with `derived_status`)

`meta_state_sweep` evolves from "expire entries by `expires_at`" to "for each active/reported entry, re-derive status; if derived says resolved and raw disagrees, log a `status_drift` event but do not auto-mutate (operator must approve)." Auto-mutation is a follow-up after the drift events prove the derivation is reliable.

| Pros | Cons |
|---|---|
| Catches the rot pattern directly. Drift events are auditable. | Two-phase rollout: drift-detection first, auto-mutation later. |
| Aligns with the philosophy (truth in code, status derived from code). | Sweep tool gets more complex. Needs new test coverage. |

**Verdict:** The right end-state, but only after SP1 (derivation) and SP2 (mechanism linkage) prove the derivation is sound.

### Recommended Decomposition: SP1 → SP2 → SP3

```
SP1: Derived Status Function
  (define what "resolved" means as a pure function of code state)
        |
        v
SP2: Mechanism-Resolution Linkage
  (extend the derivation to cover hook-based mechanisms, not just gate rules)
        |
        v
SP3: Self-Healing Sweep
  (reconcile raw status with derived status; drift events first, auto-mutation later)
```

## Sub-Project Specifications

### SP1: Derived Status Function (the data model)

**Goal:** A pure function `deriveStatus(entry, codeContext) -> DerivedStatus` that returns the *effective* status of a meta-state entry given the current state of `core/gate-logic.js`, `.factory/hooks/`, the test runner output, and the `meta-state.jsonl` registry itself.

**What it answers:**
- Is this entry "resolved by rule"? (Lookup: does `loadPromotedRules(root)` return a rule with this entry's `rule_id`?)
- Is this entry "resolved by mechanism"? (SP2 territory — for now, returns "unknown" for non-rule resolutions)
- Is this entry "operator-resolved"? (Lookup: does `status: "resolved"` and `resolved_by: "operator"` hold?)
- Is this entry "expired"? (Lookup: `expires_at < now`)

**What it does NOT do:**
- Auto-mutate the registry.
- Make policy decisions (still operator's call to act on a drift event).
- Replace `meta_state_resolve` (that tool remains for explicit operator action).

**Deliverables:**
- New function in `tools/learning-loop-mcp/core/derive-status.js` (pure, testable, no I/O at the unit level).
- New test file `tools/learning-loop-mcp/__tests__/derive-status.test.js` covering: rule-resolved, operator-resolved, expired, drift cases (raw says active, derived says resolved-by-rule).
- `loop-describe-tool.js` extended to surface both `raw_status` and `derived_status` for every entry in the `findings` block.
- A worked example: run the derivation against the current 15-entry registry and report which entries would change status if SP1 were live.

**Touchpoints:**
- `tools/learning-loop-mcp/core/meta-state.js` (read entry)
- `tools/learning-loop-mcp/core/gate-logic.js:loadPromotedRules` (lookup rule activation)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` (expose both views)

**Out of scope (deferred to SP2):**
- Mechanism-shipped resolutions (the SessionStart hook case).
- Cross-entry dependencies (one entry's resolution depends on another's mechanism).

### SP2: Mechanism-Resolution Linkage (the missing branch)

**Goal:** Extend the `deriveStatus` function to recognize "resolved by mechanism" — when the entry's `evidence.code_ref` points to a code path that exists, has tests, and the tests pass.

**What it answers:**
- Is the SessionStart hook (`plans/260602-strict-mcp-call-rules/phase-02`) actually wired and firing?
- Is `core/record-writer.js#sanitizeSlug` short enough to not hit `ENAMETOOLONG`? (Or: does `rule-short-slug-for-risk-records` make the path safe?)
- Does the file at `evidence.code_ref` exist?
- Are the tests for that file passing on the current commit? (Query `pnpm test` output or per-file test manifest.)

**Design tension:** Code can drift. A snapshot (test count, file hash) is frozen at write time. A live check is real-time but slower and depends on the test runner being available.

**Proposed resolution:** A `mechanism_check` field on the entry that specifies *how* the mechanism is verified:
```yaml
evidence:
  mechanism_check:
    kind: "file-and-tests"
    code_ref: "tools/learning-loop-mcp/hooks/loop-surface-inject.cjs"
    test_ref: ".factory/hooks/__tests__/loop-surface-inject.test.cjs"
    test_command: "pnpm test -- --grep loop-surface-inject"
```

`deriveStatus` runs the check on demand, caches the result for the current session, and reports `resolved-by-mechanism` or `drift: mechanism-missing` / `drift: tests-failing`.

**Deliverables:**
- SP1's `deriveStatus` extended with a `mechanism_check` branch.
- A worked example: the 2 `meta-260601T1339Z-*` entries would resolve to `resolved-by-mechanism` once SP2 ships.
- 2 new meta-state entries demonstrating `mechanism_check` (one for SessionStart hook, one for a record-writer slug check).

**Out of scope:**
- Test-suite as-a-service (running the full suite on every derivation is too slow). The `test_command` is opt-in per entry.
- Cross-process verification (e.g., does the gate actually fire in a real session?). That's an integration test, not a derivation input.

### SP3: Self-Healing Sweep (the lifecycle)

**Goal:** `meta_state_sweep` evolves to reconcile `raw_status` with `derived_status`. Phase 1: drift detection only (log a `status_drift` event, do not mutate). Phase 2 (after 30 days of drift events proving the derivation is sound): auto-mutate `status: "resolved"` when derived says so and the entry's `status: "active"` is the only disagreement.

**Phase 1 deliverable:**
- `meta_state_sweep` runs `deriveStatus` for every active/reported entry.
- For each disagreement, append a `status_drift` meta-state entry: `{"id": "drift-YYMMDDTHHMMZ-{short-slug}", "category": "loop-anti-pattern", "subtype": "status-drift", "affected_system": "meta-state", "description": "Entry {id} raw=active, derived=resolved-by-rule: {rule_id}", "status": "active", "auto_resolve": null}`.
- A new tool `meta_state_audit` returns a flat list of active drift events.

**Phase 2 deliverable (30-day later):**
- After drift event rate is shown to be stable (e.g., no false positives over 30 days), `meta_state_sweep` auto-mutates the registry.
- Auto-mutation is recorded as a new `auto_resolved_via_derivation` event (separate from `auto-resolve` so the audit trail is clear).

**Why the 30-day gap:** SP1's derivation may have false positives (e.g., file exists but is unused). Drift events are the early-warning system. Only after the rate is low and stable should auto-mutation be trusted.

## Build Order Rationale

- **SP1 first:** Without the data model, SP2 and SP3 have nothing to extend. SP1 is the smallest piece (one function, one test file, one `loop_describe` extension).
- **SP2 second:** Adds a new branch to the derivation. Depends on SP1's pure-function contract. Independently verifiable against the 2 `meta-260601T1339Z-*` entries.
- **SP3 third:** Lifecycle automation is the highest-stakes change (auto-mutates the registry). The 30-day drift-event window means SP3 cannot ship in the same cycle as SP1 or SP2.

Each sub-project gets a brainstorm → plan → implement → review cycle. SP1's brainstorm produces the test cases; SP1's plan phases the function + integration. SP2 is gated on SP1's tests passing. SP3 is gated on 30 days of clean drift events.

## What This Session Did NOT Do

- No edits to `meta-state.jsonl`. The 5 "obvious resolution candidates" remain `active` until SP1-SP3 ship.
- No edits to `tools/learning-loop-mcp/core/derive-status.js` (does not exist yet).
- No edits to `meta-state-resolve-tool.js`, `meta-state-sweep-tool.js`, or `meta-state-promote-rule-tool.js`.
- No `/ck:plan` invocation. SP1-SP3 each get their own plan when their respective brainstorm sessions approve a design.
- No follow-up plan created in this session.

## Why the Operator-Assertion Path Stays (For Now)

The proposed decomposition does not *remove* `meta_state_resolve`. It adds a derived view *alongside* the asserted field, and (in SP3 phase 2) uses the derived view to auto-mutate. Reasons to keep the asserted field:

- The derivation is incomplete (SP2 covers mechanism checks, but not all `evidence.code_ref` patterns).
- Operator judgment is a legitimate input (e.g., "this entry is moot now because the surface is deprecated").
- The drift event system needs a baseline to compare against. Removing `status` would lose the audit trail.

The end state is: `status` is a hint, `derived_status` is the source of truth, and `meta_state_sweep` reconciles them.

## Open Questions (for SP1's Brainstorm)

- **Q1:** Should `derived_status` be a separate field on the entry, or a computed value exposed only via `loop_describe` and `meta_state_audit`? (Computed-only is simpler; separate field is queryable but requires schema change.)
- **Q2:** Where does the `deriveStatus` function live? Options: `core/derive-status.js` (new module), inline in `core/meta-state.js` (smaller change), or `tools/learning-loop-mcp/hooks/derive-status.js` (matches hook-script pattern). Default: `core/derive-status.js`.
- **Q3:** What's the cache strategy for the derivation? Options: re-derive on every call (correct, slow), mtime+size cache like `loadPromotedRules` (good for static checks, not for test runs), or caller-provided cache key. Default: mtime+size for file-existence checks; opt-in for test runs.
- **Q4:** Should `loop_describe` show drift events as a separate count, or only when the user asks for `tier: "cold"`? Default: separate `drift_count` field at `tier: "warm"`.

## References

- `docs/philosophy.md` — "Evidence Is Source, Not Proof" (Pillar 3)
- `docs/observation-vs-meta-state.md` — domain/meta/gate layer separation
- `docs/journals/260602-meta-state-revert-2026-06-02.md` — the original "what does resolved mean" question
- `plans/260602-self-enforcing-loop/plan.md` — `meta_state_promote_rule`, `loadPromotedRules` foundation
- `plans/260602-strict-mcp-call-rules/plan.md` — the plan that closed G7/G8 but did not address status derivation
- `plans/260602-meta-state-lifecycle-tidy/plan.md` — sweep tool, status filter, expires_at handling
- `tools/learning-loop-mcp/core/gate-logic.js:434` — `loadPromotedRules`
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — the discovery surface
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` — the manual resolution path
- `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` — the sweep tool to be extended
- `meta-state.jsonl` — the registry (15 entries as of 2026-06-02T12:00Z)
