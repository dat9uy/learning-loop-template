---
date: "2026-06-02T12:30:00Z"
status: proposed
tags: [brainstorm, meta, meta-state, agent-affordances, self-modifying, derivation, drift, mcp-tools, decomposition]
related:
  - plans/reports/brainstorm-260602-derived-status-and-self-healing.md (supersedes)
  - plans/reports/brainstorm-260602-sp0-log-change.md (SP0 dedicated — locked, shipped)
  - plans/reports/brainstorm-260602-sp1-derive-status.md (SP1 dedicated — locked, plan pending)
  - plans/260602-sp0-log-change/plan.md (SP0 plan — completed)
  - plans/260602-strict-mcp-call-rules/plan.md
  - plans/260602-self-enforcing-loop/plan.md
  - plans/260602-meta-state-lifecycle-tidy/plan.md
  - docs/journals/260602-meta-state-revert-2026-06-02.md
  - docs/philosophy.md
  - docs/observation-vs-meta-state.md
  - tools/learning-loop-mcp/core/meta-state.js
  - tools/learning-loop-mcp/core/loop-introspect.js
  - tools/learning-loop-mcp/core/extract-index/extract-index.js
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js
  - tools/learning-loop-mcp/tools/meta-state-ack-tool.js
  - tools/learning-loop-mcp/tools/meta-state-resolve-tool.js
  - tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js
  - tools/learning-loop-mcp/tools/meta-state-sweep-tool.js
  - tools/learning-loop-mcp/tools/loop-describe-tool.js
  - tools/learning-loop-mcp/core/gate-logic.js
  - records/vnstock/index/assertion-vnstock-data-install-archive-wrapper-flags-not-exposed.yaml
  - schemas/index-entry.schema.json
  - meta-state.jsonl
---

# Meta-State Agent Affordances: Self-Modifying Loop via MCP Tools

> **Status: Proposed. Supersedes** `brainstorm-260602-derived-status-and-self-healing.md` (system-side framing — replaced by this agent-side reframing per operator correction 2026-06-02T12:30Z).
>
> **No plan, no code, no `meta-state.jsonl` edits this session.** Design doc only. Decomposition into 4 sub-projects (SP0 self-modification + SP1-SP3 query affordances) approved by operator on 2026-06-02.

## Operator Corrections That Shaped This Doc

1. **Don't couple meta-state with "assertion" in technical terms.** Assertion is a technical object with its own schema, validation, drift detection, and supersession lifecycle. Meta-state is a different kind of object — a finding/observation/anti-pattern entry with `description` (claim), `status` (workflow state), `evidence_*` (pointers). Conflating the two leads to bad schema archaeology. The right framing is what the philosophy says: meta-state is the **meta-level registry**, not the meta-surface's assertion layer.
2. **Design for agent self-management, not missing fields.** The right question is "what affordances does an agent need to self-manage the meta-state lifecycle?" not "field X is missing from the schema." Affordances are MCP tools the agent calls; the system provides them, the agent uses them.
3. **Schema-change logging must be self-referential** (i.e., meta-state should be able to log its own evolution, not escape-hatched into `docs/journals/`). This generalizes from "schema change" to "any system change."

## Research Synthesis (Self-Modifying Agent Patterns)

Three patterns from the self-modifying agent literature inform this design.

### Pattern 1 — Self-Referential Schema Evolution (HyperAgents / DGM Lineage)

Source: HyperAgents paper (Zhang et al., 2026) and the Darwin Godel Machine (Zhang et al., 2025). A self-modifying agent is a single Python program containing both `solve_task()` and `modify_self()`. The critical innovation: `modify_self()` can modify itself — it is part of the same codebase it edits.

**Translation to our design:** meta-state.jsonl is the agent's "codebase." When its schema changes, the change itself is a meta-state entry. The registry is a faithful record of its own evolution, not a frozen snapshot of "what the schema was when each entry was created."

### Pattern 2 — Verifier-First, Not Generator-First (Variance Inequality)

Source: Chojecki (Dec 2025), via o-mega guide. "When self-improvement stalls, strengthen the **verifier** (the component that evaluates modifications), not the generator (the component that proposes modifications). A weaker generator with a strong verifier produces stable improvement. A strong generator with a weak verifier produces instability."

**Translation to our design:** invest in **derivation** (verifier: "what is the effective status of this entry?") before investing in **resolution** (generator: "I claim this entry is resolved because X"). The previous design doc had this priority right (SP1 before SP3) but framed it as system-side automation. Reframed: the agent queries derivation, the system computes, the agent decides.

### Pattern 3 — Compile-Time Modification Over Runtime (Godel Agent vs SICA)

Source: Godel Agent (ACL 2025) and SICA (Bristol). Compile-time modification produces version-controlled artifacts that can be reviewed, reverted, and shared. Runtime modification (monkey-patching) is more flexible but harder to audit.

**Translation to our design:** meta-state.jsonl is a compile-time artifact (a file on disk). The new MCP tools produce version-controlled entries with `version` CAS, `created_at` timestamps, and `evidence_*` pointers. The agent's modifications are auditable. The audit trail is the registry itself.

### Plus Three Insights from the Self-Evolving Agents Survey (Gao et al., 2026)

- **Operational definition:** "modifies its internal parameters, contextual state, toolset, or architectural topology based on its own trajectories or feedback signals, with the explicit objective of improving future performance." For us: meta-state is the contextual state, MCP tools are the toolset, the schema is the architectural topology.
- **Inclusion criteria:** (i) experience-dependent, (ii) persistent policy-changing effect, (iii) autonomous exploration. New tools must be self-initiated, not operator-pushed.
- **The verifiability constraint:** "self-improvement only works in domains where outcomes are verifiable." Our domain is verifiable (file exists, hash matches, tests pass). Strong fit.

## Problem Statement (Refined)

**What MCP tools does the agent need to self-manage the meta-state lifecycle?**

The agent can already WRITE (`meta_state_report`), ACK (`meta_state_ack`), PROMOTE (`meta_state_promote_rule`), RESOLVE (`meta_state_resolve`), and SWEEP (`meta_state_sweep`). What it cannot do is **QUERY** the system's view of truth. It cannot ask:
- "What is the effective status of this entry?" (derivation)
- "Is the mechanism this entry references still live?" (grounding check)
- "Which entries' asserted status disagrees with the derived status?" (drift query)
- "I just changed the schema — log this as a self-modification event" (change logging)

The system has the data (it reads `meta-state.jsonl`, the registry, the rules, the hooks, the tests). The agent has no way to read it through a single conversational interface.

## What Meta-State Is (and Is Not)

**Is:**
- The meta-level registry of findings, anti-patterns, gate bugs, budget checks, and schema-evolution events
- A self-referential audit log of the loop's own evolution
- The single source of truth for "what does the loop currently know about itself?"
- Read/written by the MCP server (autonomous manager)

**Is not:**
- A technical "assertion" object (which has `dimension`, `scope`, `topic_tag`, `supersedes`, `line_anchor`, JSON Schema validation, drift detection, etc.). The non-meta index-entry schema has those. Meta-state has a different shape on purpose.
- A replacement for `records/<surface>/index/` (which serves non-meta surfaces with full extraction pipeline)
- A frozen snapshot. The schema evolves; the registry records the evolution.

## Reframed Decomposition: SP0 + SP1 + SP2 + SP3

```
SP0: Self-Modification Affordance
  (agent can log any system change as a meta-state entry)
        |
        v
SP1: Derivation Query
  (agent can ask "what is the effective status of this entry?")
        |
        v
SP2: Grounding Check
  (agent can ask "is the mechanism this entry references still live?")
        |
        v
SP3: Drift Query
  (agent can ask "which entries' asserted status disagrees with derived status?")
```

### SP0: Self-Modification Affordance — `meta_state_log_change`

> **SP0 design has been moved to a dedicated report:** [`brainstorm-260602-sp0-log-change.md`](./brainstorm-260602-sp0-log-change.md) (status: locked 2026-06-02).
>
> The dedicated report contains the full SP0 design: tool shape, generated entry shape, core schema changes (discriminated union on `entry_kind`), test plan, `meta_state_list` compatibility, and known limitations. Implementation will consume the dedicated report via `/ck:plan`.
>
> **Brief recap of the locked design (full spec in the linked report):**
>
> - **Tool name:** `meta_state_log_change` (agent-callable)
> - **Change model:** 3-bucket `change_dimension` (`semantic` / `mechanical` / `surface`) + open `change_target` (string) + structured `change_diff` (`added` / `removed` / `changed`)
> - **Entry shape:** discriminated union on `entry_kind: "finding" | "change-log"` — single registry, no separate file
> - **Entry status:** `active` from creation, no TTL, no auto-resolve, immutable audit log
> - **Side effects:** appends one entry to `meta-state.jsonl`; appends one line to gate log
> - **CAS:** not used (log-only)
> - **Auto-hook:** dropped from SP0; revisit after drift measurement
> - **Schema protection:** tool-only for SP0; write-gate extension deferred
>
> **Why the dedicated report:** the operator approved SP0 with the note "write the dedicated report for this, the refer the parent doc to this, so we could ck:plan in scope." SP0 and SP1 are now both dedicated; SP2 and SP3 remain designed in this parent doc until their brainstorm sessions lock their designs.

### SP1: Derivation Query — `meta_state_derive_status`

**Goal:** A pure derivation function exposed as an MCP tool. The agent asks "what is the effective status of this entry?" and gets a structured answer. The function is the verifier (Pattern 2); the agent decides what to do with the answer.

> **SP1 design has been moved to a dedicated report:** [`brainstorm-260602-sp1-derive-status.md`](./brainstorm-260602-sp1-derive-status.md) (status: locked 2026-06-02).
>
> The dedicated report contains the full SP1 design: tool shape, derivation kinds, `signals` (renamed from `evidence` to avoid the `records/meta/evidence/` collision), recommendation triggers, test plan, and change-log fast path. Implementation will consume the dedicated report via `/ck:plan`.
>
> **Brief recap of the locked design (full spec in the linked report):**
>
> - **Tool name:** `meta_state_derive_status` (agent-callable, mirrors `meta_state_list`)
> - **Approach:** uniform baseline (always read `evidence_code_ref` + `evidence_test`) + opt-in test-runner via `codeContext.run_tests: boolean` (default false)
> - **Pure function core (no I/O at unit level):** `deriveStatus(entry, codeContext) -> DerivedStatus`. Lives in `core/derive-status.js`. MCP tool wraps it with I/O.
> - **Output shape:** `{ id, raw_status, derived_status, derivation { kind, signals, checked_at, duration_ms }, drift, recommendation }`
> - **`derivation.kind` (4 values):** `mechanism-shipped` | `code-only` | `code-missing` | `no-signals`
> - **`derived_status` (3 values):** `resolved-by-mechanism` | `active-no-signal` | `active-uncertain`
> - **`recommendation` (4 values):** `no_action` | `resolve` | `investigate` | `log_drift`
> - **Drift detection:** `drift: true` iff `derived_status` says mechanism shipped but `raw_status` is not terminal
> - **Change-log fast path:** `kind: "not-derivable"` no-op; agents query change-log history via `meta_state_list({ entry_kind: "change-log" })` (SP0-shipped)
> - **Naming:** `signals` (not `evidence`) for the per-check field — avoids the `records/meta/evidence/` collision
> - **Out of scope for SP1:** auto-mutation, SP2 grounding deep checks, SP3 drift aggregation, `meta_state_resolve` integration, schema migration, subtype signal table
> - **Test budget:** 20 new tests (12 unit + 8 tool) + 475 existing = 495 total
> - **Touchpoints:** 4 new files + 1 modify (`tools/manifest.json`); no schema or existing tool changes
>
> **Acceptance test:** end-to-end on `meta-260601T1339Z-the-learning-loop...` (a finding with `evidence_code_ref: "tools/learning-loop-mcp/lib/source-ref-validator.js"`) must return `derived_status: "resolved-by-mechanism"` + `recommendation: "resolve"` + `drift: true`.
>
> **Why a dedicated report:** same rationale as SP0. The parent doc decomposes 4 sub-projects (SP0-SP3); each sub-project gets a dedicated design doc when its brainstorm session locks the design. SP0 and SP1 are now both dedicated; SP2 and SP3 remain in this parent doc until their brainstorm sessions lock their designs.

### SP2: Grounding Check — `meta_state_check_grounding`

**Goal:** The agent can ask "is the mechanism this entry references still live?" — file exists, hash matches, tests pass, code_ref points to real code. The check is opt-in per entry via a `mechanism_check` field; opt-in because running the full test suite on every check is too slow.

**Tool shape (proposed):**
```js
meta_state_check_grounding({
  id: string,            // entry id to check
  run_tests?: boolean,   // default false (file-existence check only)
})
```

**Returns:**
```json
{
  "id": "meta-260601T1339Z-the-learning-loop...",
  "grounding": {
    "evidence_code_ref": "tools/learning-loop-mcp/hooks/loop-surface-inject.cjs",
    "code_ref_exists": true,
    "code_ref_hash": "sha256:abc123...",
    "tests_referenced": true,
    "tests_run": false,        // run_tests was false
    "last_checked_at": "2026-06-02T12:30:00Z"
  },
  "status": "grounded" | "drifted" | "unknown"
}
```

**Caching:** mtime+size on the referenced file (same pattern as `loadPromotedRules`). Test-run results cached for the current session.

### SP3: Drift Query — `meta_state_query_drift`

**Goal:** The agent can ask "which entries' asserted status disagrees with derived status?" — and get a flat list. The agent then decides what to do (resolve, log a drift event, investigate).

**Tool shape (proposed):**
```js
meta_state_query_drift({
  filter?: {             // optional filters
    status?: "active" | "reported",
    category?: string,
    affected_system?: string,
  },
  run_grounding?: boolean,  // default false (derivation only)
})
```

**Returns:**
```json
{
  "drift_count": 2,
  "drift_events": [
    {
      "id": "meta-260601T1339Z-...",
      "raw_status": "active",
      "derived_status": "resolved-by-mechanism",
      "drift_kind": "assertion_lags_derivation",
      "recommendation": "resolve"
    },
    {
      "id": "meta-260601T1353Z-sanitizeslug-...",
      "raw_status": "active",
      "derived_status": "resolved-by-rule",
      "drift_kind": "assertion_lags_derivation",
      "recommendation": "resolve"
    }
  ]
}
```

**Phase 1 deliverable:** the tool exists; the agent queries; the agent decides. No auto-mutation.
**Phase 2 deliverable (30 days later, after the drift rate is shown stable):** the tool can also resolve entries (opt-in via `auto_resolve: true` parameter). Auto-mutation is gated on proven stability.

## What This Session Did NOT Do

- No edits to `meta-state.jsonl`. The 5 "obvious resolution candidates" remain `active` until SP0-SP3 ship.
- No edits to `core/meta-state.js` or any MCP tool file. SP0-SP3 are design specs.
- No `/ck:plan` invocation. Each sub-project gets its own plan when its respective brainstorm session approves a design.
- No follow-up plan created in this session.
- No schema migration. The "schema home" question (Q3) is settled as: zod in `core/meta-state.js` (runtime) + `schemas/meta-state.schema.json` (static validation), both generated from one field list. But this is a future change, not this session.

## What Has Happened Since (cumulative status, 2026-06-02)

This parent doc was written on 2026-06-02T12:30Z with all 4 sub-projects in design phase. Subsequent work has advanced the decomposition:

- **SP0 (Self-Modification Affordance) — SHIPPED.** See `plans/260602-sp0-log-change/plan.md` (status: completed). The 5-phase TDD plan shipped 25 new tests (472 → 475 after the SP0 housekeeping follow-up; 475 currently passing). `meta_state_log_change` is registered in `tools/manifest.json` (46 tools total; 45 in the original manifest, +1 in this session). The first real change-log entry is in `meta-state.jsonl`.
- **SP1 (Derivation Query) — DESIGN LOCKED.** See `brainstorm-260602-sp1-derive-status.md` (status: locked 2026-06-02). Plan handoff via `/ck:plan --tdd` is deferred to a future session; 20 new tests planned (495 total). The dedicated report contains the full SP1 design including the `evidence` → `signals` rename rationale.
- **SP2 (Grounding Check) — design unchanged.** Still in this parent doc.
- **SP3 (Drift Query) — design unchanged.** Still in this parent doc.

The decomposition framing (Pattern 2: invest in the verifier, not the generator) and the build order rationale (SP0 → SP1 → SP2 → SP3) hold. The auto-mutation in SP3's phase 2 (30-day drift-event window) remains the highest-stakes change and still cannot ship in the same cycle as the others.

## Build Order Rationale

- **SP0 first:** every other sub-project involves the agent modifying or querying meta-state. SP0 makes the system self-aware of those modifications. Without SP0, the agent can make changes that are invisible to its own audit trail.
- **SP1 next:** derivation is the verifier. Once the agent can query derivation, it has a source of truth that doesn't rot (unlike `resolution` text snapshots).
- **SP2 third:** grounding checks depend on derivation (the mechanism check is one input to derivation). SP2 is opt-in per entry; SP1 is the base.
- **SP3 last:** drift query aggregates derivation + grounding. It also introduces auto-mutation (phase 2), which is the highest-stakes change. The 30-day drift-event window means SP3 cannot ship in the same cycle as the others.

Each sub-project gets a brainstorm → plan → implement → review cycle. SP0-SP1 are paired (one is the input, one is the consumer). SP2-SP3 depend on SP1's tests.

## Why the Operator-Assertion Path Stays (For Now)

The proposed design does not *remove* `meta_state_resolve`. It adds the derivation query (SP1) as the verifier, and the drift query (SP3) as the surfacing mechanism. The agent's resolution path becomes:
1. Query derivation: "is this still active?" (SP1)
2. Query grounding: "is the mechanism still live?" (SP2)
3. Query drift: "does my assertion match the derivation?" (SP3)
4. Decide: resolve, leave active, or log a drift event
5. Optionally, call `meta_state_resolve` (now informed by derivation, not just judgment)

The end state is: `status` is a hint, `derived_status` is the source of truth, and the agent (not the system, not the operator) is the one that reconciles them.

## Open Questions (for SP0's Brainstorm)

- **Q1:** Should `meta_state_log_change` require operator role, or is it agent-callable? (Pattern: existing `meta_state_report` is agent-callable; `meta_state_promote_rule` is operator-only.) Default: agent-callable (changes to the loop's own shape are part of the agent's job).
- **Q2:** How does `meta_state_log_change` interact with the version-CAS? (The change is a new entry; it doesn't mutate existing entries. CAS is on entry update, not on log.)
- **Q3:** Should the auto-hook in `core/meta-state.js` be opt-in via env var, or always-on? (Always-on adds noise; opt-in adds forgettability.) Default: opt-in via `LL_LOG_SCHEMA_CHANGES=1`, with a warning when disabled.
- **Q4:** Where does the `change_kind` enum live? (Could grow over time; need a stable enumeration.) Default: zod enum, with `string` fallback for custom kinds.
- **Q5:** Should SP1 (derivation) include a `dimension` field on meta-state entries, to distinguish static/runtime/product claims? (The non-meta index-entry schema has this; meta-state doesn't.) Default: NOT in SP1. Dimension is a future hardening, not a blocker for derivation.

## References

### Self-Modifying Agent Research

- Eric J. Ma, "How to build self-improving coding agents - Part 3" (2026-01-19). [blog](https://ericmjl.github.io/blog/2026/1/19/how-to-build-self-improving-coding-agents-part-3/)
- Yuma Heymans, "Self-Improving AI Agents: The 2026 Guide" (o-mega.ai, 2026-03-26). Covers HyperAgents, ADAS, DGM, AlphaEvolve, ShinkaEvolve, SWE-RL, Karpathy autoresearch, memory systems, and the safety question.
- Gao et al., "A Survey of Self-Evolving Agents: What, When, How, and Where to Evolve on the Path to Artificial Super Intelligence" (arXiv:2507.21046v4, 2026-01-16). Operational definition, three dimensions (what/when/how), inclusion criteria.
- Zhang et al., "HyperAgents" (arXiv:2603.19461, 2026-03-19). Metacognitive self-modification; meta-level process is editable.
- Zhang et al., "Darwin Godel Machine" (arXiv:2505.22954, 2025). Open-ended self-improvement; archive of agents.
- Chojecki, "Variance Inequality" (arXiv:2512.02731, 2025-12). Strengthen the verifier, not the generator.

### Internal Design Artifacts

- `docs/philosophy.md` — "Evidence Is Source, Not Proof" (Pillar 3)
- `docs/observation-vs-meta-state.md` — domain/meta/gate layer separation
- `docs/journals/260602-meta-state-revert-2026-06-02.md` — the original "what does resolved mean" question
- `plans/260602-self-enforcing-loop/plan.md` — `meta_state_promote_rule`, `loadPromotedRules` foundation
- `plans/260602-strict-mcp-call-rules/plan.md` — SessionStart hook, scope_predicate
- `plans/260602-meta-state-lifecycle-tidy/plan.md` — sweep tool, status filter, expires_at handling
- `plans/260602-sp0-log-change/plan.md` — SP0 plan, **completed** (5 phases, 25 new tests)
- `plans/reports/brainstorm-260602-sp0-log-change.md` — SP0 dedicated design, locked
- `plans/reports/brainstorm-260602-sp1-derive-status.md` — SP1 dedicated design, locked (plan pending)
- `plans/reports/brainstorm-260602-derived-status-and-self-healing.md` — superseded by this doc

### Code References

- `tools/learning-loop-mcp/core/meta-state.js` — registry source of truth; exports `META_STATE_FINDING_CATEGORIES`, `metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateEntrySchema` (union)
- `tools/learning-loop-mcp/core/loop-introspect.js` — reads meta-state directly (never touches `records/index/` for meta); `listAllMetaCategories` derives from `META_STATE_FINDING_CATEGORIES`
- `tools/learning-loop-mcp/core/extract-index/extract-index.js:21-24` — hardcoded skip of meta evidence
- `tools/learning-loop-mcp/core/gate-logic.js:434` — `loadPromotedRules`
- `tools/learning-loop-mcp/core/slugify.js` — shared slugify helper (extracted in SP0 Phase 4)
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` — existing report tool (uses `metaStateFindingEntrySchema.shape`)
- `tools/learning-loop-mcp/tools/meta-state-ack-tool.js` — existing ack tool
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` — existing resolve tool (rejects `change_log_immutable` per SP0)
- `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` — existing promote tool
- `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` — existing sweep tool
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — existing list tool (added `entry_kind` filter per SP0)
- `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` — **NEW** in SP0, change-log writer
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — discovery surface
- `schemas/index-entry.schema.json` — non-meta index entry schema (for comparison only)
- `meta-state.jsonl` — 19 entries as of 2026-06-02 (18 findings + 1 change-log from SP0)
