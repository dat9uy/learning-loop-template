---
date: "2026-06-19T19:18:00+07:00"
tags: [mastra, storage, memory, meta-state, direction, clarification]
---

# Storage / Memory / Meta-state: Direction Clarification

**Type:** synthesis report (consolidates the boundary design across the storage design report, the Phase D plan-split brainstorm, and the master tracker)
**Status:** proposed — read + approve before any tracker edit
**Aligned to:** `plans/reports/mastra-storage-memory-design-260619-1907-meta-state-ledger-report.md` (boundary design), `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (Plan 2 scope clarification), `plans/reports/productization-260612-1530-master-tracker.md` (Phase D section lines 197-211)

---

## TL;DR

The three reports describe the **same system** with **three different mental models** for the Storage/Memory/meta-state boundary. After applying simplification cascades + inversion, the unified direction is:

| Layer | What it is | Where it lives | Lifecycle | Wired on |
|---|---|---|---|---|
| **Storage** | Mastra runtime substrate — workflow `stateSchema` runs, `suspend`/`resume` snapshots, thread/message/observation tables (for when OM is enabled) | `./tools/learning-loop-mastra/data/mastra-memory.db` (LibSQL) | Mastra runtime; one shared backend per `Mastra` instance | `Mastra` or `MCPServer` constructor |
| **Memory** | Per-agent conversation context — raw messages, working memory, semantic recall, observational memory | `Storage` (when enabled) or in-memory (default) | Per-agent; per-thread; ephemeral by default | Per-agent `Agent` constructor (`memory: { ... }`) |
| **Meta-state** | Project-level audit registry — findings, change-logs, rules, loop-designs | `./meta-state.jsonl` (or future project DB) | Cross-agent; cross-session; append-only | MCP tools (`meta_state_*`) consumed by agents via Tools, not via Storage/Memory |

**The cascade:** meta-state is a **project concept that pre-dates Mastra**. It is not a Mastra primitive. Forcing it into Mastra Storage or Memory would create a fragile adapter that fights the domain model. The unified answer to "where does meta-state live?" is: **next to the project, accessed via tools, not in the Mastra runtime**.

**The meta-pattern:** three independent layers, three different lifecycles, three different wiring points. They interact through tools, not through shared state.

---

## 1. The Three-Layer Model (the cascade that resolves everything)

Each layer is independent. The only connection between them is **tools** (the agent's call surface).

```
                       ┌─────────────────────────────────────┐
                       │             AGENT                   │
                       │   invokes ↓            invokes ↓   │
                       └────────────┬───────────────┬────────┘
                                    │               │
              ┌─────────────────────▼──┐   ┌────────▼───────────┐
              │       Memory          │   │       Tools        │
              │  per-agent context    │   │  (Mastra call      │
              │  window               │   │   surface)         │
              │  (when enabled)       │   │  • meta_state_*    │
              │                       │   │  • gate_*          │
              │                       │   │  • loop_describe   │
              └───────────┬───────────┘   └──────────┬──────────┘
                          │ persists via              │ live query
                          │ (uses as substrate)       │ (Tool calls)
                          ▼                           ▼
              ┌──────────────────────┐   ┌──────────────────────┐
              │       Storage        │   │   Meta-state         │
              │  (Mastra runtime)    │   │   Registry           │
              │  LibSQL file         │   │  (project-level)     │
              │  ./data/mastra-      │   │  ./meta-state.jsonl  │
              │  memory.db           │   │  (or future DB)      │
              └──────────────────────┘   └──────────────────────┘
```

The two "invokes ↓" arrows make the relationship explicit: the agent is the actor, Memory and Tools are the two ways the agent accesses state. Memory persists to Storage (when enabled); Tools query the meta-state registry live.

**The boundary in one sentence:** Storage persists Mastra runtime state. Memory is per-agent conversation context that uses Storage as a substrate. Meta-state is project-level state that predates Mastra and is accessed through tools.

### Why this is one cascade (not three)

If you accept the premise that **meta-state is a project concept that pre-dates Mastra**, then:

- You don't put it in Mastra Storage (different lifecycle, different schema, different freshness requirements).
- You don't put it in Memory (Memory is per-agent, per-thread; meta-state is cross-agent, cross-session).
- You access it through Tools (the only bridge that respects both sides' invariants).

This single insight eliminates every storage/memory/meta-state confusion in the three reports.

---

## 2. What Each Layer Does NOT Do (the inversion)

The negative space is where the confusion lives. Inverting each layer's purpose:

| Layer | Does NOT do | Why the inversion matters |
|---|---|---|
| **Storage** | Does NOT hold meta-state. Does NOT know about findings/change-logs/rules/loop-designs. Does NOT enforce meta-surface lifecycle (`reported` → `active` → `stale` → `resolved`). | If Storage held meta-state, the Mastra storage adapter would have to know about meta-surface lifecycle — a coupling that survives only by accident. |
| **Memory** | Does NOT hold canonical state. Does NOT replace the registry. Does NOT enable cross-agent knowledge sharing. | If Memory held meta-state, every agent would have its own (possibly stale) copy of the registry, and the audit log would be fragmented. |
| **Meta-state** | Does NOT replace Memory. Does NOT auto-load into agent context. Does NOT auto-save from agent turns. | If meta-state replaced Memory, the agent would lose the per-thread context window and the operator would lose the explicit "what did we discuss" audit trail. |

**The crossover error:** agents that conflate Memory with the registry (e.g., "I'll just remember this finding from last session") break the audit invariant. The fix is the **Tool pattern** — agent calls a Tool to get current state, every time it matters.

---

## 3. Inconsistencies Across the Three Reports

Each report describes the boundary correctly in some places and incorrectly in others. The inconsistencies are the source of the confusion.

### 3.1 Storage/Memory design report (2026-06-19 19:07) — the canonical version

This report is **correct** and serves as the reference. It states:
- Meta-state does NOT belong in Mastra Storage (section 2).
- Agents "remember" meta-state via Tools, not via Memory (section 1).
- Memory stores conversation history + working memory only (section 5).
- One shared Mastra Storage backend, isolated by `resource` + `thread` (section 3).

**One addition made (2026-06-19, this session):** new §8.1 Glossary inserted between §8 (Design Checklist) and §9 (Unresolved Questions). The glossary disambiguates "Memory" / "memory" / "Storage" / "Meta-state" and explicitly calls out the colloquial-vs-Mastra-primitive confusion. Per Q2 resolution §8.2. This is the direction the other two reports should align to.

### 3.2 Brainstorm (Phase D plan split) — mostly aligned, one stale phrase

| Location | Current text | Issue | Should be |
|---|---|---|---|
| Plan 2 row in Approach A table (line 40) | "**Storage** — LibSQL backend + agent memory infra + LibSQL/JSONL round-trip" | The "agent memory infra" phrasing conflates Storage with Memory. The follow-up "Plan 2 Scope Clarification — Storage vs Memory" section (added 2026-06-19) correctly notes that agent memory is OUT of Plan 2, but the table row still says "infra." | "**Storage** — LibSQL backend (Mastra runtime substrate) + JSONL round-trip parity harness" |
| Plan 2 "What Plan 2 ships" (line 399) | Already aligned with the design report. | None. | No change. |
| Plan 2 "What Plan 2 does NOT ship" (line 419) | Already aligned (lists per-agent `memory`, `resourceId`/`threadId`, `workingMemory`, etc. as OUT). | None. | No change. |
| D-14 deferred item (line 294) | "add 3-4 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`, `productBuildAgent`)" | `productBuildAgent` was dropped per brainstorm §"Scope OUT" (line 23). The tracker D-14 row still lists 4 agents. | "add 3 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`)" |
| D-14 deferred item (line 294) | "fold in LibSQL storage" | Accurate but ambiguous (storage for what?). | "fold in LibSQL storage (Mastra runtime substrate only; meta-state stays JSONL)" |

**Net effect:** the brainstorm is mostly aligned. Two small edits in the table row + D-14 row would close the gap.

### 3.3 Master tracker (productization) — the worst offender

| Location | Current text | Issue | Should be |
|---|---|---|---|
| D5 (line 205) | "Storage Layer fold-in (per §3.7): pick LibSQL as the Mastra storage backend. **Meta-state in one SQLite file, Mastra memory in another.** Schemas are unrelated; same engine, separate files." | **WRONG.** Says "Meta-state in one SQLite file" — directly contradicts the storage design report (meta-state is NOT a SQLite file; it's JSONL or future project DB). This sentence is the single biggest source of confusion. | "Storage Layer fold-in (per §3.7): pick LibSQL as the Mastra storage backend. **Mastra workflow stateSchema runs + suspend/resume snapshots in one SQLite file. Meta-state registry stays as JSONL (or future project DB), accessed via tools, NOT via Mastra Storage.**" |
| D6 (line 206) | "Phase 3 agents' memory (Q5 from §8): default LibSQL, **separate file from meta-state**. Audit whether agents need cross-session memory that single-session `Memory` doesn't provide." | The phrase "separate file from meta-state" implies meta-state is also in SQLite (just a separate file). Same error as D5. | "Phase 3 agents' memory (Q5 from §8): default LibSQL substrate (shared with workflow state), agent `memory` field **OMITTED in Plan 3** (observational memory is Phase 5, per research §8 Q5). Cross-agent knowledge flows through the meta-state registry via tools, not through agent memory." |
| D-14 deferred item (line 294) | "add 3-4 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`, `productBuildAgent`); fold in LibSQL storage" | (a) `productBuildAgent` is dropped; (b) "LibSQL storage" is ambiguous. | "add 3 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`); fold in LibSQL storage as Mastra runtime substrate (workflow stateSchema + suspend/resume; meta-state stays JSONL)" |
| Deferred Items D-15 (line 295) | "Workflow-tool migration (D1-D3) — 8 `workflow_*` tools to `createWorkflow`" | Says 8; tracker D1-D3 row says "~8" (correct); D-14 says 11 (wrong). D-15 is consistent with the new reality. | No change. |
| Current State Snapshot (line 17) | "Phase D — Mastra Phase 2-3 (workflows + agents + storage); Plan 1 (D1+D2+D3) closed" | "Storage" is the load-bearing word that confuses readers. The D5/D6 phrasing makes "Storage" sound like a meta-state thing. | "Phase D — Mastra Phase 2-3 (workflows + agents + Mastra runtime substrate); Plan 1 (D1+D2+D3) closed" |

**Net effect:** the tracker has 3 substantive errors (D5, D6, D-14) that need correction. The errors are NOT in the data — they're in the phrasing that confuses Storage (Mastra) with meta-state (project). The fix is wording, not behavior.

---

## 4. Required Clarifications Per Report

**Commit grain:** one commit per report (per Q1 resolution). The tracker's "Update Protocol" (line 377) is for phase advances, not clarifications; no `meta_state_log_change` per edit. A single `meta_state_log_change` after the tracker commit is sufficient (see Q1 resolution §8.1).

### 4.1 Storage/Memory design report — add Glossary section (DONE)

The design report is the canonical version. The boundary statements, the turn-by-turn example, and the design checklist all align with the three-layer model and need no changes.

**One addition made (per Q2 resolution §8.2):** a new **§8.1 Glossary** inserted between §8 (Design Checklist) and §9 (Unresolved Questions). The glossary disambiguates "Memory" (capital-M Mastra primitive), "memory" (lowercase colloquial), "Storage" (capital-S Mastra primitive), and "Meta-state" (project-level audit registry). It explicitly calls out the common confusion: "agent memory" in conversation is a *combination* of Mastra's `Memory` primitive AND the meta-state registry queried via tools — not a single primitive. The glossary locks the terminology for cross-document consistency with the brainstorm and tracker.

### 4.2 Brainstorm (Phase D plan split) — 2 small edits

**Edit 1 — Plan 2 row in Approach A table:**

Before:
> **Plan 2** | D5+D6 | **Storage** — LibSQL backend + agent memory infra + LibSQL/JSONL round-trip | All 10 namespaces pass; LibSQL read/write tests GREEN | None

After:
> **Plan 2** | D5+D6 | **Storage** — LibSQL backend (Mastra runtime substrate) + LibSQL/JSONL round-trip | All 10 namespaces pass; LibSQL read/write tests GREEN | None

**Edit 2 — D-14 deferred item row in the "Cross-References / Deferred Items" section (line 294):**

Before:
> D-14 | Phase D — promote 11 `workflow_*` tools to `createWorkflow`; add 3-4 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`, `productBuildAgent`); fold in LibSQL storage | high (separate phase) | 🔵 OPEN | `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` D-14

After:
> D-14 | Phase D — promote 8 `workflow_*` tools to `createWorkflow`; add 3 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`); fold in LibSQL storage as Mastra runtime substrate (workflow stateSchema + suspend/resume; meta-state stays JSONL) | high (separate phase) | 🔵 OPEN | `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (D-14 referenced)

(Note: 8 not 11 — `productBuildAgent` dropped per brainstorm §"Scope OUT".)

### 4.3 Master tracker — 3 substantive edits

**Edit 1 — D5 row (line 205):**

Before:
> - [ ] **D5** Storage Layer fold-in (per §3.7): pick LibSQL as the Mastra storage backend. Meta-state in one SQLite file, Mastra memory in another. Schemas are unrelated; same engine, separate files.

After:
> - [ ] **D5** Storage Layer fold-in (per §3.7): pick LibSQL as the Mastra runtime substrate. **Workflow `stateSchema` runs + `suspend`/`resume` snapshots persist in one SQLite file (`./tools/learning-loop-mastra/data/mastra-memory.db`). Meta-state registry stays as JSONL (or future project DB), accessed via tools — NOT a Mastra Storage domain.** Meta-state migration JSONL → SQLite is OUT of scope (per research §3.7: "Likely separate file, same engine" — but the meta-state file is *not* a Mastra file).

**Edit 2 — D6 row (line 206):**

Before:
> - [ ] **D6** Phase 3 agents' memory (Q5 from §8): default LibSQL, separate file from meta-state. Audit whether agents need cross-session memory that single-session `Memory` doesn't provide.

After:
> - [ ] **D6** Phase 3 agents' memory (Q5 from §8): **agent `memory` field OMITTED in Plan 3** (observational memory is Phase 5 per research §8 Q5; Plan 2 ships the storage substrate, not the per-agent memory config). **Cross-agent knowledge flows through the meta-state registry via tools** (per AGENTS.md §1 "Meta-surface as the only bound surface" + §6 Internalization Rule). When OM is enabled in Phase 5, each agent gets its own `resourceId`/`threadId`; cross-agent coordination stays on the registry.

**Edit 3 — D-14 deferred item row (line 294):**

Before:
> D-14 | Phase D — promote 11 `workflow_*` tools to `createWorkflow`; add 3-4 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`, `productBuildAgent`); fold in LibSQL storage | high (separate phase) | 🔵 OPEN | `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` D-14

After:
> D-14 | Phase D — promote 8 `workflow_*` tools to `createWorkflow`; add 3 agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`); fold in LibSQL storage as Mastra runtime substrate (workflow stateSchema + suspend/resume; meta-state stays JSONL) | high (separate phase) | 🔵 OPEN | `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (D-14 referenced) + storage design report

### 4.4 Optional: add a one-paragraph "Storage/Memory/Meta-state boundary" section to the tracker

The tracker is a state-of-record document. Adding the three-layer model as a one-paragraph preamble to the Phase D section would prevent the same confusion from re-surfacing. Suggested placement: immediately before the current `## Phase D` heading (line 197).

Suggested text (draft):

> **Storage / Memory / Meta-state boundary (clarified 2026-06-19):** The Phase D plan ships LibSQL as the **Mastra runtime substrate** (Storage) for workflow `stateSchema` + `suspend`/`resume`. It does **not** add meta-state to Storage. The **meta-state registry** remains a project-level artifact (`meta-state.jsonl` or future project DB), accessed via MCP tools (`meta_state_*`). The **per-agent Memory** config (observational memory, working memory, semantic recall) is OUT of scope in Plan 3 (OM ships in Phase 5 per research §8 Q5); Plan 2 ships the substrate only. See `plans/reports/mastra-storage-memory-design-260619-1907-meta-state-ledger-report.md` for the full design.

---

## 5. Decision Matrix (when new content comes, where does it go?)

A small decision tree to make the boundary operational.

| If the content is... | It goes in... | Accessed via... | Example |
|---|---|---|---|
| Workflow cross-step state (e.g., `workflow_self_improvement` multi-step) | **Storage** (Mastra) | Workflow `stateSchema` | Plan 1a/Plan 3 will restructure `stateSchema` once consumers need it |
| `suspend`/`resume` snapshots for operator checkpoints | **Storage** (Mastra) | Workflow engine | Plan 1 ships factory with `suspend`/`resume`; Plan 3 consumes |
| Agent conversation history (per thread) | **Memory** (when enabled) + **Storage** (substrate) | Agent's `memory` config | OUT of Plan 3; Phase 5 |
| Agent working memory (stable facts per operator) | **Memory** (when enabled) | Agent's `workingMemory` config | OUT of Plan 3; Phase 5 |
| Finding / change-log / rule / loop-design | **Meta-state** (project-level) | MCP tools (`meta_state_*`) | Already in place; the audit trail |
| Drift events / status derivation / fingerprint checks | **Meta-state** (computed from filesystem) | MCP tools (`meta_state_derive_status`, `meta_state_check_grounding`) | Already in place |
| Budget state (resource consumption per session) | **Runtime state** (`runtime-state.jsonl`) | MCP tools (`runtime_state_read`/`_record`) | Already in place |
| Cold-session discoverability hints | **Loop introspection** (`loop_describe`) | MCP tool (`loop_describe({tier: "warm"})`) | Already in place |

**The rule of thumb:**
- If it's about Mastra's own runtime (workflow runs, suspend/resume, thread/messages/observations for OM), it goes in **Storage**.
- If it's about an agent's conversation with the operator, it goes in **Memory** (when enabled).
- If it's about the loop's self-model (what the loop knows, what it has learned, what it has changed), it goes in **Meta-state**.

---

## 6. Why This Direction Is the Right Cascade (the inversion check)

A quick inversion check: what would break if any of these layers were merged?

### If Storage held meta-state
- **Schema conflict:** Mastra Storage domains have fixed schemas (`memory`, `workflows`, `scores`, `observability`); meta-state has a custom 4-kind union with its own lifecycle. The adapter would fight the domain.
- **Freshness risk:** Storage may be cached, snapshotted, or replicated. Meta-state must be live because another agent or a human may have changed it.
- **Audit-log loss:** `meta-state.jsonl` is append-only. A SQL table doesn't have the same audit semantics.
- **Cross-tool reuse loss:** MCP tools are reusable by CLI, Droid, humans. A Storage adapter couples meta-state to Mastra's runtime, not to the project.

### If Memory held meta-state
- **Per-agent fragmentation:** Each agent would have its own (possibly stale) copy. Cross-agent knowledge is exactly what the registry is for.
- **Lifecycle mismatch:** Memory is per-thread, ephemeral. Meta-state is cross-thread, cross-session, append-only.
- **No audit trail:** Memory doesn't tell you who changed what when. Meta-state does.

### If Meta-state held Storage state
- **Contradiction:** Meta-state is a project concept. Storage is a Mastra concept. Meta-state shouldn't know about Mastra at all.

**The inversion confirms the cascade:** the three layers are independent because they fail differently when merged. They stay separate.

---

## 7. Cross-References

- **Storage/Memory design report (canonical):** `plans/reports/mastra-storage-memory-design-260619-1907-meta-state-ledger-report.md` (sections 1, 2, 3, 5, 6)
- **Phase D plan split brainstorm:** `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (Approach A table line 40; "Plan 2 Scope Clarification — Storage vs Memory" section; D-14 line 294)
- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` (D5 line 205; D6 line 206; D-14 line 294; optional preamble before line 197)
- **Research report (source contract):** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.7 (storage parking brake), §8 Q5 (OM is Phase 5, not Phase 3), §3.10 (tool surface table)
- **Mastra skill:** `.agents/skills/mastra/references/core-concepts.md` (Memory and Storage listed as separate sub-systems)
- **Mastra SDK:** `node_modules/@mastra/core/dist/memory/types.d.ts#ObservationalMemoryOptions`, `SharedMemoryConfig`
- **AGENTS.md §1** (meta-surface as only bound surface), §6 (Internalization Rule), §10 (2026-06-12 reframe)

---

## 8. Resolved Open Questions

### Q1 — Commit granularity for the report edits (RESOLVED)

**Decision:** one commit per report.

- One commit for the brainstorm edits (`brainstorm-260618-1538-phase-d-plan-split-report.md`).
- One commit for the tracker edits (`productization-260612-1530-master-tracker.md`).
- The new clarification report is its own commit (already filed).

The tracker's "Update Protocol" (line 377) is for **phase advances** (e.g., flipping D1 from `[ ]` to `[x]`). The current edits are **clarifications**, not phase advances — the data hasn't changed, the wording has. So the protocol does not apply. No `meta_state_log_change` per edit; one commit per report is the right grain. A single `meta_state_log_change` filed after the tracker edit with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` and `reason: 'clarify Storage/Memory/meta-state boundary per mastra-storage-memory-260619-1918-direction-clarification-report'` is sufficient.

### Q2 — Glossary for "Memory" (RESOLVED)

**Decision:** add a Glossary section to the canonical storage design report (`plans/reports/mastra-storage-memory-design-260619-1907-meta-state-ledger-report.md`), between §8 (Design Checklist) and §9 (Unresolved Questions). The glossary disambiguates the three layers and is referenced from the new clarification report. See §4.1 of this report for the cross-reference.

### Q3 — Plan 3 `stateSchema`: meta-state or agent implementation? Does it need Storage? (RESOLVED)

**Decision:** Plan 3's multi-step `stateSchema` is **workflow implementation**, NOT meta-state. It **needs Storage** (Mastra runtime substrate). The boundary in one sentence: **the workflow's `stateSchema` lives in Storage; the workflow may *call tools* to read/write meta-state, but the stateSchema itself is workflow-internal.**

| Question | Answer | Why |
|---|---|---|
| Is `stateSchema` about meta-state? | **No.** | Meta-state is the project's audit log (findings, change-logs, rules, loop-designs), accessed via tools, persisted in `./meta-state.jsonl` or a future project DB. The `stateSchema` is the workflow's internal state machine — the variables the workflow carries across its steps (e.g., `workflow_self_improvement`: gap → classification → candidate → risks → adoption). |
| Is `stateSchema` about agent implementation? | **Partially — only insofar as the agent is the consumer.** | The agent *invokes* the workflow via MCP. The agent's own state (memory + system prompt + working memory) is separate from the workflow's `stateSchema`. The workflow has its own state; the agent has its own context. |
| Does it need Storage? | **Yes.** | Mastra's workflow engine persists `stateSchema` via the storage backend. When the workflow calls `suspend()` (e.g., to wait for operator input), the state must be persisted so a later `resume()` call can load it. Plan 2 (Storage, LibSQL) is the **prerequisite** for Plan 3's multi-step restructuring. |

**Concrete example for `workflow_self_improvement`:**

```typescript
// stateSchema is the workflow's internal pipeline state.
const stateSchema = z.object({
  gap: z.string(),                            // step 1 input
  classification: z.enum(['N=1', 'N≥2']).optional(),  // step 2 output
  experimentCandidate: z.object({             // step 3 output
    type: z.enum(['schema-change', 'workflow-gap', 'heuristic-tune', 'tool-addition']),
    description: z.string(),
    proposedChanges: z.array(z.string()),
  }).optional(),
  risks: z.array(z.string()).optional(),      // step 4 output
  adoptionPath: z.string().optional(),         // step 5 output
});

// Storage persists this state across steps (and across suspend/resume).
// The workflow may CALL TOOLS to read/write meta-state:
//   await tools.meta_state_propose_design({ ...adoptionPath });
// But the stateSchema is NOT meta-state. It's the workflow's working memory.
```

**Why this matters for the plan sequence:**

- **Plan 2** ships Storage (LibSQL) as the substrate. Plan 2 is required for `stateSchema` persistence.
- **Plan 3** ships the multi-step `stateSchema` restructuring for `workflow_self_improvement` and `workflow_runtime_probe` (2 of 8 workflows; the other 6 stay thin `stateSchema = input` because they're single-step deterministic).
- **Plan 3's agents** invoke the workflows. The agent's `memory: { ... }` config is **OUT of Plan 3** per the brainstorm's lock — agents are memory-less against OM in this round. The agent's "memory" of past sessions is the meta-state registry, queried live via tools.
- **The Storage/Memory/meta-state boundary stays clean:** Storage = workflow stateSchema + (future) thread/messages/observations; Memory = per-agent conversation context (Phase 5); Meta-state = project-level audit (always).

**Cross-references:**

- Brainstorm §"Plan 1 Execution: Deferred Items" item 3.1 (the deferral to Plan 3)
- Brainstorm §"Q1 Conflict Resolution" (parity-faithful thin `stateSchema` in Plan 1, real `stateSchema` deferred to Plan 3)
- Brainstorm §"Plan 2 Scope Clarification — Storage vs Memory" (Storage as the substrate, Memory deferred to Phase 5)
- Research §3.1 (workflow_self_improvement and workflow_runtime_probe as multi-step state machines)
- Research §8 Q5 (OM is Phase 5, not Phase 3)
- Storage design report §1, §2, §6 (canonical boundary)

**No new tracker entry needed.** The D5 description (after the edit in §4.3 of this report) already conveys "Mastra workflow stateSchema runs + suspend/resume snapshots persist in one SQLite file." The stateSchema → Storage link is the same boundary as D5, just applied to the Plan 3 consumer. No separate D-19 or new sub-phase required.
