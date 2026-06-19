---
date: "2026-06-19T19:07:00+07:00"
tags: [mastra, storage, memory, meta-state, architecture]
---

# Mastra Storage, Memory, and Meta-State: Boundary Design Report

## TL;DR

- **Do not** put `meta-state.jsonl` into Mastra Storage. Mastra Storage owns fixed domains (`memory`, `workflows`, `scores`, `observability`, etc.) for Mastra runtime primitives. Meta-state is a project-level audit registry with its own lifecycle and business logic.
- **Do not** give each agent its own storage backend. Agents isolate context via `resource` + `thread`, not via separate databases.
- **Do** expose meta-state to agents through **Tools** that read/write the registry. Agents "remember" meta-state in the same way humans remember a meeting: they keep notes in **Memory** (conversation context + working memory) but look up the official record when precision matters.

## 1. The Confusion: "If meta-state is not in Storage, how do agents remember it?"

This question conflates two different meanings of "remember":

| Meaning | What stores it | How agent accesses it | Staleness |
|---|---|---|---|
| **Conversation continuity** — what the agent and operator already discussed, decisions made, conclusions reached | Mastra `Memory` (messages + working memory) | Included automatically in the prompt context for the current thread | Safe to be slightly stale; it is history, not current state |
| **Canonical current state** — e.g., "is finding F still active?", "what is the latest drift?" | Meta-state registry (`meta-state.jsonl` or its future DB) | Agent calls a Tool that queries the registry live | Must be fresh; another agent or a human may have changed it |

Memory is not a database replica. It is a **context window manager**. It holds enough narrative continuity so the agent does not ask the same questions every turn. It does not need to, and should not, duplicate the authoritative registry.

## 2. Why Meta-State Does Not Belong in Mastra Storage

Mastra Storage is organized into domains. Each domain has a fixed schema owned by Mastra:

- `memory` — threads, messages, resources, working memory
- `workflows` — suspend/resume snapshots
- `scores` — eval results
- `observability` — traces/spans
- `datasets`, `experiments`, `agents`, etc.

`meta-state.jsonl` is a different kind of thing:

- It stores `finding`, `change-log`, `rule`, `loop-design` entries with a custom lifecycle (`reported` → `active` → `stale` → `resolved`, etc.).
- It requires derivation logic: `meta_state_derive_status` checks whether the finding is still true against the live filesystem and tests.
- It requires grounding logic: `meta_state_check_grounding` computes SHA-256 hashes of referenced code.
- It is an append-only audit log for the loop's self-model.

That logic does not fit inside a Mastra Storage adapter. Storage is dumb persistence. Meta-state is smart, project-specific state. Forcing meta-state into Mastra Storage would create a fragile adapter that fights the domain model.

## 3. The Correct Separation

```
┌─────────────────────────────────────────────────────────────┐
│                         Agent                                │
│  ┌──────────────┐          ┌─────────────────────────────┐  │
│  │   Memory     │◄────────►│           Tools             │  │
│  │  (context)   │          │  • meta_state_list          │  │
│  │              │          │  • meta_state_derive_status │  │
│  │  messages    │          │  • meta_state_query_drift   │  │
│  │  workingMem  │          │  • meta_state_resolve       │  │
│  └──────────────┘          └─────────────────────────────┘  │
│           ▲                            │                     │
│           │ context                    │ live query          │
│           │                            ▼                     │
│  ┌──────────────────┐        ┌──────────────────────┐       │
│  │  Mastra Storage  │        │  Meta-State Registry │       │
│  │    memory domain │        │  (meta-state.jsonl   │       │
│  │                  │        │   or future DB)      │       │
│  └──────────────────┘        └──────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Storage side

One shared Mastra Storage backend:

```typescript
const mastra = new Mastra({
  storage: new PostgresStore({
    id: 'mastra',
    connectionString: process.env.DATABASE_URL,
  }),
});
```

All agents use the same storage. Isolation is via identifiers, not backends.

### Memory side

Each agent that needs context gets a `Memory` instance:

```typescript
const agent = new Agent({
  id: 'loop-auditor',
  memory: new Memory({
    options: {
      lastMessages: 20,
      workingMemory: { enabled: true },
    },
  }),
});
```

Call the agent with `resource` + `thread`:

```typescript
await agent.generate('Check for drift in meta-state.', {
  memory: { resource: 'operator-datguy', thread: 'drift-review-42' },
});
```

`Memory` persists messages and working memory in the `memory` domain of Mastra Storage. It does not persist the meta-state registry.

### Tool side

Expose meta-state operations as Mastra tools:

```typescript
const metaStateTools = {
  list_findings: tool({
    description: 'List meta-state findings filtered by status or category',
    parameters: z.object({ status: z.string().optional(), category: z.string().optional() }),
    execute: async ({ status, category }) => {
      return await metaStateMcpClient.list({ status, category });
    },
  }),
  derive_status: tool({
    description: 'Compute the effective status of a finding from live filesystem state',
    parameters: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      return await metaStateMcpClient.deriveStatus({ id });
    },
  }),
  query_drift: tool({
    description: 'Aggregate drift across the meta-state registry',
    parameters: z.object({ runGrounding: z.boolean().optional() }),
    execute: async ({ runGrounding }) => {
      return await metaStateMcpClient.queryDrift({ runGrounding });
    },
  }),
};
```

The tool implementation reuses the existing MCP server logic (`tools/learning-loop-mastra/server.js`). The agent never reads `meta-state.jsonl` directly.

## 4. How Agents "Remember" Meta-State: A Turn-by-Turn Example

### Turn 1

Operator: "Check for drift in the meta-state registry."

Agent context:
- System prompt
- No prior messages

Agent action:
- Calls `query_drift({ runGrounding: true })`.
- Tool returns: "3 drift events: F1 (hash mismatch), F2 (file deleted), F3 (test failing)."

Agent response:
- "I found 3 drift events. F1 has a hash mismatch, F2 points to a deleted file, and F3 has a failing test."

What gets saved to Memory:
- User message: "Check for drift in the meta-state registry."
- Assistant message: "I found 3 drift events..."
- Tool call + result is also recorded.

### Turn 2

Operator: "Resolve F1."

Agent context:
- System prompt
- Previous messages (including the fact that F1 has a hash mismatch)

Agent action:
- Before resolving, calls `derive_status({ id: 'F1' })` to confirm the current state.
- Tool returns: "F1 is still drifted; evidence_code_ref exists but hash mismatch."

Agent response:
- "F1 is still drifted. I will refresh the fingerprint and then resolve it."
- Calls `meta_state_refresh_fingerprint({ id: 'F1' })` and `meta_state_resolve({ id: 'F1', resolution: 'Code changed legitimately; fingerprint refreshed.' })`.

What gets saved to Memory:
- "User: Resolve F1."
- "Assistant: F1 was drifted. Refreshed fingerprint and resolved it."

### Turn 3 (next session, same thread)

Operator: "What did we do about F1?"

Agent context:
- System prompt
- Full conversation history from Turns 1–2 (loaded from Memory)

Agent response:
- "Last session, F1 had a hash mismatch. We refreshed its fingerprint and resolved it."

If the operator asks "Is F1 still resolved?", the agent must call `derive_status({ id: 'F1' })` again. It cannot rely on Memory for that because the registry may have changed.

## 5. What Goes Into Working Memory?

Working memory is for stable, resource-scoped facts that persist across threads. For example:

- "Operator prefers drift reports limited to findings with `severity: escalate`."
- "This project uses `meta-state.jsonl` as the canonical registry path."
- "The gate runs in `warn` mode by default."

Working memory is **not** for:

- Current status of a specific finding (use Tool)
- The full list of drift events (use Tool)
- Audit-log entries (use Tool)

## 6. Why This Design Is Better Than "Meta-State in Mastra Storage"

| Concern | Bad design: meta-state as Mastra Storage domain | Good design: meta-state via Tools |
|---|---|---|
| Schema | Fight fixed Mastra domains; need custom tables | Keep custom schema in project DB/JSONL |
| Business logic | Push derivation/grounding into storage adapter | Keep in MCP tools where it already lives |
| Freshness | Agent may read stale cached state | Tool always queries live registry |
| Audit | Lose append-only semantics | Preserve `meta-state.jsonl` audit log |
| Sharing | Hard to share with non-agent code | MCP tools are reusable by CLI, Droid, humans |
| Operational complexity | Multiple storage backends per agent | One shared backend, many logical namespaces |

## 7. What If `meta-state.jsonl` Becomes a Bottleneck?

If the registry grows too large for JSONL, migrate it to PostgreSQL or MongoDB **behind the same MCP tool surface**. The agents do not notice the change. Do not move it into Mastra Storage.

Example migration path:

1. Keep MCP tool API unchanged.
2. Replace the JSONL repository with a `meta_state` table/collection.
3. Add indices on `entry_kind`, `status`, `affected_system`, `category`.
4. Keep append-only semantics for change-log entries.

The Storage vs Memory boundary stays the same.

## 8. Design Checklist

- [ ] One shared Mastra Storage backend for all agents.
- [ ] `Memory` instances per agent, isolated by `resource` + `thread`.
- [ ] Meta-state registry kept as a project-level store (JSONL or DB), not a Mastra Storage domain.
- [ ] Meta-state exposed to agents via Tools that delegate to existing MCP logic.
- [ ] Memory stores conversation history and resource-scoped working memory only.
- [ ] Tools fetch live meta-state every time the agent needs current status.

## 8.1. Glossary — Disambiguating "Memory", "Storage", and "Meta-state"

This report (and the Phase D plan split, and the master tracker) use these three terms in overlapping but distinct senses. The glossary locks the terminology for cross-document consistency.

- **Storage** (capital-S, as a Mastra primitive): the Mastra runtime substrate that persists workflow `stateSchema` runs, `suspend`/`resume` snapshots, and (when OM is enabled) thread/messages/observations tables. Configured on the `Mastra` or `MCPServer` constructor. Backed by LibSQL in this project (`./tools/learning-loop-mastra/data/mastra-memory.db`).
- **Memory** (capital-M, as a Mastra primitive): the per-agent conversation context that the agent carries across turns — raw messages, working memory (stable facts per resource), semantic recall, and observational memory (a 3-tier long-term memory layer with Observer/Reflector sub-agents). Configured on the per-agent `Agent` constructor (`memory: { ... }`). OUT of Plan 3 (observational memory is Phase 5 per research §8 Q5).
- **memory** (lowercase, colloquial): the human sense of "what the agent and operator discussed last session." Implemented via the `Memory` Mastra primitive (when enabled) PLUS the agent's tools (which can re-load conversation context from the meta-state registry, scout outputs, etc.). The colloquial sense is a *combination* of Memory + Tool calls, not a single primitive.
- **Meta-state** (or **meta-state registry**): the project-level audit registry that predates Mastra. Holds `finding`, `change-log`, `rule`, and `loop-design` entries with a custom lifecycle. Persisted in `./meta-state.jsonl` (current) or a future project DB (proposed migration target). Accessed by agents via MCP tools (`meta_state_*`); not a Mastra Storage domain.

**Common confusion to avoid:** "agent memory" in conversation usually means the colloquial sense (what the agent knows about past sessions), which is a *combination* of Mastra's `Memory` primitive AND the meta-state registry queried via tools. It is not a single primitive. The Mastra `Memory` primitive is only one half; the registry is the other.

**Why this matters for the plan sequence:** the colloquial "agent memory" is what the user wants when they say "the agent should remember what we did." The Mastra `Memory` primitive gives the agent raw-message context within a thread; the meta-state registry gives the agent cross-session, cross-agent knowledge (via tools). Plan 2 ships Storage (the substrate). Plan 3 ships agents with `memory` field omitted (no thread/messages persistence this round). Cross-session knowledge flows through the registry, not through agent memory. When observational memory is enabled in Phase 5, agents get their own `resourceId`/`threadId`; the meta-state registry remains the canonical source for cross-agent coordination.

## 9. Unresolved Questions

1. Should meta-state tools be registered as Mastra tools on each agent explicitly, or injected globally through a shared `Mastra` instance?
2. If the registry migrates from JSONL to PostgreSQL, should the migration be tracked as a change-log entry in the registry itself?
3. Do any agents need **write** access to meta-state, or should writes stay restricted to the MCP server and human operators?
