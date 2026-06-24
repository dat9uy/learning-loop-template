---
phase: 4
title: "agents-md-contract-note"
status: pending
priority: P1
effort: "0.5h"
dependencies: ["2"]
---

# Phase 4: AGENTS.md §1 Contract Note + §2 Tool-Count Fix

## Overview

**Adds a one-line Phase-D-shipped callout to `AGENTS.md §1` and fixes the stale "40 tools across 5 groups" statement on `AGENTS.md §2` line 51.** Per the brainstorm §"Plan 4 (Cutover)" item 4.4 (lines 383-385) and the scout report §1 + §9.2, the §1 contract itself is unchanged by Phase D — Phase D inherits §1 (meta-surface as the only bound surface; agents ship with `memory: false`). Phase D's effect on §1 is **observational**, not contractual.

**Why this phase exists separately from §3.10:** `AGENTS.md` is the agent-facing contract document; `research-260611-...md` is the research contract. They are read by different audiences. §3.10's edit (Phase 3) updates the research report; this phase updates the agent-facing doc. The §2 line 51 fix is a separate item (stale tool count).

## Requirements

- Functional: `AGENTS.md §1` has a one-line "Phase D shipped 2026-06-24" callout (observational, not contractual). `AGENTS.md §2` line 51 reads "44 tools across 6 groups per `tools/learning-loop-mastra/agent-manifest.json` (verified 2026-06-24)".
- Non-functional: no §1 contract language is changed. The callout is additive only.

## Architecture

`AGENTS.md` is the gate-truth for every agent in every session (per its own preamble, lines 3-5). The §1 contract ("The Meta-Surface — the only bound surface") is the load-bearing invariant. Phase D's effect on §1 is:
- The meta-surface is still the only bound surface (UNCHANGED).
- 3 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`) now exist as MCP tools (NEW capability).
- 8 workflows now exist as MCP tools (`run_workflow_*`) (NEW capability).
- 2 storage workflows now exist as MCP tools (NEW capability, Plan 2).

The §1 addition is a one-line "shipped" callout. It does NOT modify the contract language.

## Related Code Files

- **Modify:** `AGENTS.md` §1 (add 1 line after the "The product surface..." paragraph, around line 28)
- **Modify:** `AGENTS.md` §2 line 51 (update tool count + verification date)
- **Read (verification):** `AGENTS.md` §10 (the "Where This Project Is Heading" section, for context on the trajectory note)

## Implementation Steps

### Step 4.1: Add the Phase D shipped callout to §1

**Current §1 text (lines 9-28, post-AGENTS.md 2026-06-12 rewrite):**

```markdown
## 1. The Meta-Surface (the only bound surface)

The meta-surface is the loop's self-model. It is the **only contract** the loop writes. Everything else (the substrate, the product surface, the legacy `records/<vendor>/` content) is design exploration, archived for forensic continuity, and explicitly not a contract that constrains the loop.

**The meta-surface lives in one place:** `meta-state.jsonl` at the project root. It is a 4-kind discriminated union:

| Kind | Role | Lifespan |
|---|---|---|
| `finding` | A loop-self-diagnostic observation. Ephemeral; 24h TTL until acked. | 24h → ack → active → resolve |
| `change-log` | An immutable audit record of a system change. No TTL. | Forever |
| `rule` | A promoted invariant the loop enforces. Two enforcement classes: `gate` (hard-block) and `agent` (consult). | Forever (until superseded) |
| `loop-design` | A deferred design that will create or modify rules, schemas, or tools. | Active → inactive (when shipped) → archived |

**The product surface (decisions, experiments, risks, observations, capability records, vendor records, claim records, index entries, resource budgets) is unbound.** The Bridge 5 codegen engine has the ability to generate product-surface records; the loop has not committed to binding. The current `capability`, `index-entry`, `claim`, `resource-budget`, `observation` schemas are design exploration, not contracts. They may or may not be the right shape after the meta-surface re-debates the product surface. **All product-surface record CRUD is paused; no new product records are generated, validated, or migrated.** Legacy product records in `records/<vendor>/` are archived, not deleted.
```

**Add AFTER line 28 (after the "product surface is unbound" paragraph, before the "Why this matters for every section below" paragraph at line 30):**

```markdown
> **Phase D shipped (2026-06-24):** the MCP server `tools/learning-loop-mastra/server.js` is the canonical server. It exposes 44 tools across 6 groups (gate, workflow, meta_state, introspection, runtime_agnostic, agent), all bound to the meta-surface per §1. The 3 meta-state agents (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`) ship with `memory: false`; per-agent `memory` config is Phase 5 (per `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§8 Q5`). The meta-surface is still the only bound surface — Phase D added 14 net tools (3 agents + 2 storage workflows + 8 run_workflow_* + 1 runtime_agnostic) without violating §1.
```

The addition is a **blockquote** (not a heading) so it visually reads as an observational note, not a contract change. The §1 contract language is preserved verbatim.

### Step 4.2: Fix the §2 line 51 stale tool count

**Current §2 line 51 (MCP server description):**

```markdown
- **MCP server** (`tools/learning-loop-mastra/server.js`) — 40 tools across 5 groups per `tools/learning-loop-mastra/agent-manifest.json` (verified 2026-06-17). Of these, ~21 are bound to the meta-surface; the remaining ~19 are workflow or unbound (operate on product-surface shapes that are being re-debated) or dropped.
```

**Replace with:**

```markdown
- **MCP server** (`tools/learning-loop-mastra/server.js`) — 44 tools across 6 groups per `tools/learning-loop-mastra/agent-manifest.json` (verified 2026-06-24). All 44 are bound to the meta-surface per §1 (gate=5, workflow=13, meta_state=19, introspection=3, runtime_agnostic=1, agent=3).
```

The "Of these, ~21 are bound" sentence is removed because post-Phase-D, all 44 are bound. The breakdown by group is added for clarity.

### Step 4.3: Verify the rest of §2 is consistent

Read §2 in full to check for any other stale references. Per scout report §9.2, line 51 was the only stale tool-count statement. Verify that §2's other bullets (gate, hooks, etc.) are still accurate.

If other stale references are found, file a follow-up `meta_state_report` finding (out of Plan 4 scope; flag for next plan).

### Step 4.4: Commit the AGENTS.md edit

Commit message:
```
docs(agents): add Phase D shipped callout to §1; fix §2 tool count (44 tools, 6 groups)

Phase D Plan 4 phase-04:
- §1: add blockquote "Phase D shipped (2026-06-24)" callout. Observational only;
  §1 contract language preserved verbatim. Meta-surface remains the only bound
  surface. 3 agents ship with memory: false (Phase 5 territory for per-agent
  memory config).
- §2 line 51: update from "40 tools across 5 groups (verified 2026-06-17)" to
  "44 tools across 6 groups (verified 2026-06-24)". Remove the stale "~21 are
  bound" sentence — all 44 are bound post-Phase D.
- Group breakdown added: gate=5, workflow=13, meta_state=19, introspection=3,
  runtime_agnostic=1, agent=3.
```

## Success Criteria

- [ ] `AGENTS.md §1` has a blockquote "Phase D shipped (2026-06-24)" callout.
- [ ] `AGENTS.md §1` contract language (lines 9-28) is preserved verbatim.
- [ ] `AGENTS.md §2` line 51 reads "44 tools across 6 groups per `tools/learning-loop-mastra/agent-manifest.json` (verified 2026-06-24)".
- [ ] `AGENTS.md §2` line 51 group breakdown is correct: gate=5, workflow=13, meta_state=19, introspection=3, runtime_agnostic=1, agent=3.
- [ ] No other §2 line is stale.
- [ ] 1 commit with the §1 + §2 edits.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| The §1 callout is interpreted as a contract change by some downstream consumer | Low | The callout is in a blockquote (not a heading), which visually reads as observational. The §1 contract language is preserved verbatim. If a consumer is parsing AGENTS.md structurally and gets confused, the callout can be re-anchored to §10 (trajectory) instead of §1 in a follow-up. |
| The §1 callout is too long and disrupts the §1 reading flow | Low | The callout is 4 lines; §1 is 20+ lines. The blockquote is small relative to the section. If it's too long, can be moved to §10 (trajectory) without losing the callout. |
| Future agents read the §1 callout and assume the meta-surface contract is "soft" (44 tools bound to meta-surface ≠ meta-surface is the only bound surface) | Low | The callout explicitly states "the meta-surface is still the only bound surface — Phase D added 14 net tools without violating §1." This makes the relationship explicit. |
| §2 line 51's group breakdown becomes stale again as Phase E (Mastra Code Mode 1) ships | Medium | The line says "verified 2026-06-24" with a date. Future plans should update the date + count. This is a normal maintenance cycle, not a Phase 4 issue. |
| The AGENTS.md edit triggers `rule-no-new-artifact-types` (the gate regex matches "new schema" / "new directory") | Low | The callout uses "shipped" / "added" / "bound" wording, not "new schema" / "new directory". The 6-group structure is not new — it has been in place since Plan 3. |
