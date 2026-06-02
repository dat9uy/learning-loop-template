---
date: "2026-06-02T13:00:00Z"
status: locked
tags: [brainstorm, meta, meta-state, agent-affordances, self-modifying, mcp-tools, sp0, design]
related:
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (parent design — SP0-SP3 decomposition)
  - plans/reports/brainstorm-260602-derived-status-and-self-healing.md (superseded by parent)
  - plans/260602-strict-mcp-call-rules/plan.md
  - plans/260602-self-enforcing-loop/plan.md
  - plans/260602-meta-state-lifecycle-tidy/plan.md
  - docs/journals/260602-meta-state-revert-2026-06-02.md
  - docs/philosophy.md
  - docs/observation-vs-meta-state.md
  - tools/learning-loop-mcp/core/meta-state.js
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js
  - tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js
  - meta-state.jsonl
---

# SP0 Design — `meta_state_log_change` (Self-Modification Affordance)

> **Status: Locked 2026-06-02.** Operator approval: "Approve, but write the dedicated report for this, the refer the parent doc to this, so we could ck:plan in scope."
>
> **Scope of this report:** SP0 only. SP1 (derivation query), SP2 (grounding check), SP3 (drift query) are designed in the parent doc and not part of this report.
>
> **No code, no registry edits, no plan invocation in the brainstorm session that produced this doc.** Implementation happens via a follow-up `/ck:plan` consuming this report.

## Context

The parent doc (`brainstorm-260602-meta-state-agent-affordances.md`) decomposes the "agent self-management of meta-state" question into 4 sub-projects:

- **SP0: Self-modification affordance** — *this report*
- SP1: Derivation query (`meta_state_derive_status`)
- SP2: Grounding check (`meta_state_check_grounding`)
- SP3: Drift query (`meta_state_query_drift`)

SP0 is the foundation: the agent can already write findings, ack them, promote them, resolve them, sweep them. SP0 adds the missing piece — the agent can also log **system changes** (schema, rule, tool, policy, surface, lifecycle, manifest) as a first-class entry kind, so the registry is a faithful record of its own evolution rather than a frozen snapshot.

## Locked Decisions (Q1-Q6 + entry-shape)

| # | Question | Resolution |
|---|---|---|
| Q1 | Role | **Agent-callable** (matches `meta_state_report` / `meta_state_list`) |
| Q2 | CAS interaction | **Log-only** — no mutation of existing entries; CAS not relevant |
| Q3 | Auto-hook | **Dropped from SP0** — tool is the affordance; revisit after drift measurement shows need |
| Q4 | Change model | **3-bucket dimension** (`semantic` / `mechanical` / `surface`) + open `change_target` (string) + structured `change_diff` (`added` / `removed` / `changed`) |
| Q5 | Dimension field on SP1 | **Out of scope for SP0** (SP1 may add it later) |
| Q6 | Entry status | **`active` from creation** — no TTL, no auto-resolve, immutable audit log |
| ES | Entry shape | **Approach A: discriminator field `entry_kind: "finding" \| "change-log"`** — single registry, typed union, backward compat for legacy entries |
| SP | Schema protection | **Tool-only for SP0** — defer write-gate extension to a future SP |

### Why these resolutions (rationale trail)

- **Q1 (agent-callable):** Self-modification is part of the agent's job per the parent doc's Pattern 1 (HyperAgents / DGM lineage). Operator-only would prevent the agent from auditing its own changes. Matches the existing affordance model.
- **Q2 (log-only):** The change is a *new* entry, not a *patch* on an existing one. CAS is a write-conflict guard for `updateEntry`; `writeEntry` is append-only and conflict-free. Question moot.
- **Q3 (auto-hook dropped):** YAGNI/KISS. The tool is the affordance. If a future pattern shows agents forgetting to log changes, add an opt-in auto-detect drift hook then. Current evidence: zero drift in the 15-entry registry.
- **Q4 (3-bucket dimension):** The 7-kind enum was a magic number. The 3 buckets (`semantic` = schemas/taxonomies/contracts; `mechanical` = rules/policies/enforcement; `surface` = tools/surfaces/lifecycles/manifests) are derivable from the system architecture. `change_target` is open (string path/identifier) so the model scales without enumeration. `change_diff` is structured and uniform.
- **Q5 (out of scope):** Q5 was a SP1 question that ended up in SP0's open-Qs list in the parent doc. Belongs to SP1.
- **Q6 (active from creation):** Change-log entries are the audit log itself. They describe a fact that has already happened (the change was made, the system state was captured). Treating them as `reported` (24h TTL requiring ack) would mean a self-modification event could expire before being acknowledged, which is wrong. The whole point is durability.
- **ES (entry_kind discriminator):** Operator correction in the parent doc says meta-state is a registry, not a finding collection. Change events are a different kind of entry than findings. A typed discriminator (`finding` | `change-log`) is the principled way to extend the registry. Approach B (presence test) defeats the correction by overloading the finding shape. Approach C (separate file) splits truth and complicates SP3's drift query.

## Tool Identity

| Field | Value |
|---|---|
| **Name** | `meta_state_log_change` |
| **Role** | Agent-callable |
| **Side effects** | Appends one entry to `meta-state.jsonl`; appends one line to gate log |
| **Idempotency** | No — each call writes a new entry. To "amend" a change, write a new entry with `supersedes: <old-id>`. |
| **Auto-mutation** | None |
| **CAS** | Not used (log-only) |
| **Compaction** | Change-log entries never compact (no terminal status; status is permanently `active`) |

## Input Schema (zod)

```js
import { z } from "zod";

export const metaStateChangeEntrySchema = z.object({
  entry_kind: z.literal("change-log").describe("Discriminator — always 'change-log' for this schema"),
  change_dimension: z.enum(["semantic", "mechanical", "surface"])
    .describe("What kind of change"),
  change_target: z.string().min(1)
    .describe("Specific path or identifier being changed"),
  change_diff: z.object({
    added: z.array(z.string()).default([]).describe("Paths/fields added"),
    removed: z.array(z.string()).default([]).describe("Paths/fields removed"),
    changed: z.array(z.string()).default([]).describe("Paths/fields whose meaning changed (not value)"),
  }).describe("Structured diff"),
  reason: z.string().min(20)
    .describe("Why the change was made (min 20 chars)"),
  applies_to: z.object({
    tools: z.array(z.string()).optional().describe("Tool names affected"),
    surfaces: z.array(z.string()).optional().describe("Surface names affected"),
    rules: z.array(z.string()).optional().describe("Rule IDs affected"),
    statuses: z.array(z.string()).optional().describe("Status values affected"),
    schemas: z.array(z.string()).optional().describe("Schema files affected"),
  }).optional().describe("Wider impact scope"),
  supersedes: z.string().optional()
    .describe("ID of a previous change-log entry this one replaces"),
  evidence_code_ref: z.string().optional()
    .describe("Path to the change in code (e.g., commit hash or file:line)"),
  evidence_journal: z.string().optional()
    .describe("Path to related journal/plans/reports file"),
});

export const metaStateEntrySchema = z.discriminatedUnion("entry_kind", [
  z.object({
    entry_kind: z.literal("finding").default("finding"),
    category: z.enum([...]),  // existing 7 values
    severity: z.enum(["warning", "escalate"]),
    affected_system: z.enum([...]),  // existing 6 values
    description: z.string().min(20),
    subtype: z.string().optional(),
    evidence: z.object({...}).optional(),
    status: z.enum(["reported", "active", "auto-resolved", "expired", "resolved"]).default("reported"),
    created_at: z.string(),
    expires_at: z.string().optional(),
    acked_at: z.string().optional(),
    resolved_at: z.string().optional(),
    resolved_by: z.string().optional(),
    promoted_to_rule: z.object({...}).optional(),
    auto_resolve: z.unknown().optional(),
    version: z.number().optional(),
  }),
  metaStateChangeEntrySchema,
]);
```

## Output

```json
{
  "logged": true,
  "id": "meta-260615T0930Z-add-effective-status-derived-field",
  "entry_kind": "change-log",
  "change_dimension": "semantic",
  "change_target": "tools/learning-loop-mcp/core/meta-state.js",
  "created_at": "2026-06-15T09:30:00.000Z"
}
```

## Generated Entry Shape (in `meta-state.jsonl`)

```json
{
  "id": "meta-260615T0930Z-add-effective-status-derived-field",
  "entry_kind": "change-log",
  "change_dimension": "semantic",
  "change_target": "tools/learning-loop-mcp/core/meta-state.js",
  "change_diff": {
    "added": ["effective_status"],
    "removed": [],
    "changed": []
  },
  "reason": "Added effective_status as a derived field so SP1 derivation can return it. Backward compatible: existing entries without effective_status get null.",
  "applies_to": {
    "tools": ["loop_describe", "meta_state_derive_status"]
  },
  "evidence": {
    "code_ref": "tools/learning-loop-mcp/core/meta-state.js",
    "journal": "plans/reports/brainstorm-260602-meta-state-agent-affordances.md"
  },
  "status": "active",
  "created_at": "2026-06-15T09:30:00.000Z",
  "version": 0
}
```

Note: change-log entries **do not** have `expires_at`, `acked_at`, `resolved_at`, `resolved_by`, `auto_resolve`, or `promoted_to_rule` — these are finding-specific lifecycle fields. The discriminator (`entry_kind: "change-log"`) tells the registry to skip finding-lifecycle treatment.

## Core Schema Changes (`core/meta-state.js`)

1. Add `metaStateChangeEntrySchema` (zod) — the change-log shape above.
2. Refactor `metaStateEntrySchema` from a flat object to a **zod discriminated union** on `entry_kind`:
   - `finding` branch: existing shape (preserves all current fields and validation)
   - `change-log` branch: new shape
3. Backward compatibility in `readRegistry()`: legacy entries (no `entry_kind` field) are coerced to `entry_kind: "finding"` on read. This protects the 15 existing entries.
4. `filterEntries()`: add optional `entry_kind` to the filter object. When provided, only entries with matching discriminator are returned. Default behavior (no `entry_kind` filter) returns both kinds.
5. `writeEntry()`: unchanged. The entry is a plain object; the schema validates.
6. New exported helper: `generateChangeLogId(slug)` — same format as `generateId`, semantically labeled for grep-ability.

## Tool File

`tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` — sibling to existing `meta-state-report-tool.js`. Pattern:

```js
import { z } from "zod";
import { writeEntry, generateId, metaStateChangeEntrySchema } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateLogChangeTool = {
  name: "meta_state_log_change",
  description: "Log a system change (schema, rule, tool, policy, surface, lifecycle, manifest) as a change-log entry in the meta-state registry. The entry is immutable, status=active, no TTL. Use supersedes to replace a prior change entry.",
  schema: metaStateChangeEntrySchema.shape,
  handler: async ({ change_dimension, change_target, change_diff, reason, applies_to, supersedes, evidence_code_ref, evidence_journal }) => {
    const root = resolveRoot();
    const id = generateId(slugify(change_target));
    const now = new Date();
    const entry = {
      id,
      entry_kind: "change-log",
      change_dimension,
      change_target,
      change_diff,
      reason,
      ...(applies_to && { applies_to }),
      ...(supersedes && { supersedes }),
      evidence: {
        ...(evidence_code_ref && { code_ref: evidence_code_ref }),
        ...(evidence_journal && { journal: evidence_journal }),
      },
      status: "active",
      created_at: now.toISOString(),
      version: 0,
    };
    await writeEntry(root, entry);
    appendGateLog(root, { timestamp: now.toISOString(), tool: "meta_state_log_change", id, change_dimension, change_target });
    return {
      content: [{ type: "text", text: JSON.stringify({ logged: true, id, entry_kind: "change-log", change_dimension, change_target, created_at: now.toISOString() }) }],
    };
  },
};
```

### Refactor opportunity (extract `slugify`)

Both `meta_state_report_tool` and `meta_state_log_change_tool` define local `slugify()` functions with identical logic. **This report flags the duplication** as a candidate for a `core/slugify.js` extraction. The extraction is a one-line follow-up: replace the two local copies with `import { slugify } from "#mcp/core/slugify.js"`. Implementer should do this as part of SP0 (small, contained, prevents future drift).

## Test Plan

### Core schema tests (`core/meta-state.test.js` additions)

- `metaStateChangeEntrySchema` accepts valid change-log input
- `metaStateChangeEntrySchema` rejects `change_dimension` outside the 3-bucket enum
- `metaStateChangeEntrySchema` rejects `change_target` empty string
- `metaStateChangeEntrySchema` rejects `reason` < 20 chars
- `metaStateChangeEntrySchema` accepts any `change_target` string (open)
- Discriminated union rejects mixed fields (e.g., a finding entry with `change_dimension`)
- Discriminated union rejects a change-log entry with `severity` or `affected_system`
- `readRegistry` coerces legacy entries (no `entry_kind`) to `entry_kind: "finding"` for backward compat
- `filterEntries({ entry_kind: "change-log" })` returns only change-log entries
- `filterEntries({ entry_kind: "finding" })` returns only finding entries
- `filterEntries({})` returns both kinds (no regression)
- `writeEntry` accepts a change-log entry and `readRegistry` returns it with `entry_kind: "change-log"`
- Compaction never removes change-log entries (status is permanently `active`)

### Tool tests (new file `meta-state-log-change-tool.test.js`)

- Tool writes a valid change-log entry
- Tool returns the generated id and `entry_kind: "change-log"`
- Tool writes one line to gate log
- Tool rejects invalid `change_dimension`
- Tool rejects too-short `reason`
- Tool accepts `applies_to` (all optional sub-fields)
- Tool accepts `supersedes` (id of prior change entry)
- Concurrent calls don't corrupt registry (mirror existing concurrency test)
- Round-trip: write via tool → read via `meta_state_list({ entry_kind: "change-log" })` → assert entry shape

## `meta_state_list` Compatibility

Add one optional field to the existing tool:

```js
entry_kind: z.enum(["finding", "change-log"]).optional()
    .describe("Filter by entry kind; default = both")
```

When `entry_kind` is provided, `filterEntries` filters accordingly. When omitted, both kinds are returned (backward-compatible — existing callers are unaffected). Terminal-status exclusion (`include_expired: false`) continues to apply only to findings (change-log entries are never in a terminal status).

## `meta_state_promote_rule` Compatibility — Known Limitation

The promote tool currently requires `category: "loop-anti-pattern"` (a finding-only field). **Change-log entries cannot be promoted in SP0.** This is a known limitation, not a blocker:

- Use case for promoting a change-log entry: "log that a rule was changed, then promote the new rule pattern." Today this requires two separate entries (a finding with `promoted_to_rule` and a change-log with the diff). That's actually fine — the audit trail has both the *finding* (what the change means) and the *change event* (what physically changed).
- Future hardening: extend `meta_state_promote_rule` to also accept change-log entries, with a category guard like `category: "loop-anti-pattern" | entry_kind: "change-log"`. Out of scope for SP0.

## What SP0 Explicitly Does NOT Do

- No auto-detection of schema changes (deferred to a future SP after drift measurement)
- No write-gate extension for direct edits to `meta-state.jsonl` (deferred; current gate blocks `records/**` and `schemas/**`)
- No mutation of existing entries from the change tool
- No auto-resolution, expiry, or compaction of change-log entries
- No promotion of change-log entries to rules (see above)
- No changes to `loop_describe` response shape (that would itself be a `surface` change, logged as a change-log entry, but `loop_describe` continues to return the current shape)
- No SP1-SP3 work

## Build Order Verification

- **SP0 first** — every later sub-project (SP1 derivation, SP2 grounding, SP3 drift) involves the agent modifying or querying meta-state. SP0 makes the system self-aware of those modifications.
- **SP1 unblocked by SP0** — derivation will read `entry_kind` to skip change-log entries from finding-lifecycle treatment. SP0's `entry_kind` discriminator is the typed signal SP1 needs.
- **SP2 depends on SP1's tests** — grounding checks feed into derivation.
- **SP3 depends on SP1 + SP2** — drift query aggregates derivation + grounding.

## Implementation Considerations (for `/ck:plan`)

- **Backwards compat** is the highest-risk part. The 15 legacy entries in `meta-state.jsonl` have no `entry_kind` field. `readRegistry()` must coerce on read. Tests must cover the coercion path.
- **Schema loader order** — `meta-state.js` exports `metaStateEntrySchema` and `metaStateChangeEntrySchema`. Tools that import `metaStateEntrySchema` (e.g. `meta-state-report-tool.js`) must continue to work. The discriminated union validates on `entry_kind`; legacy entries' lack of `entry_kind` must default to `"finding"` in the schema (via `.default("finding")` on the finding branch's `entry_kind` field).
- **No new file beyond the tool + test** — the core schema change is in `core/meta-state.js` (same file). The tool file is `meta-state-log-change-tool.js`. The test file is `meta-state-log-change-tool.test.js`. Total: 1 core edit + 2 new files + 1 small refactor (`slugify` extraction).
- **Manifest registration** — the new tool must be added to `tools/manifest.json` (or equivalent manifest, see scout output for current location) so the MCP server wires it up. The plan should grep for the manifest and add a registration line.

## Risks

| Risk | Mitigation |
|---|---|
| Breaking the 15 legacy entries | `readRegistry()` coerces on read; coerce-on-write path can be a follow-up SP |
| Tool proliferation (now 6+ meta-state tools) | SP1-SP3 will add 3 more; consolidation is a separate concern |
| `entry_kind` discrimination fails in mixed files | Discriminated union + tests for both branches + round-trip test |
| Schema evolution path is unclear when meta-state schema itself changes | SP0 IS the affordance for logging its own schema change — recursive but principled |
| Agents forget to log changes (no auto-detect) | Defer to drift-measurement SP; current evidence shows zero drift |

## Success Metrics

- The tool exists, is agent-callable, validates input, writes the registry, returns a structured result.
- The 15 legacy entries still load correctly (`readRegistry` coercion works).
- `meta_state_list` returns both kinds by default, filters by `entry_kind` when asked.
- The 5 implementation tests + 12 core schema tests pass.
- A first real change-log entry exists in `meta-state.jsonl` after the tool ships (e.g., a `surface` change-log for the new tool itself: "added `meta_state_log_change` MCP tool — change_dimension: surface, change_target: tools/learning-loop-mcp/tools/meta-state-log-change-tool.js").

## References

### Internal

- `plans/reports/brainstorm-260602-meta-state-agent-affordances.md` — parent design, SP1-SP3 specs
- `tools/learning-loop-mcp/core/meta-state.js` — registry source of truth, schema home
- `tools/learning-loop-mcp/core/meta-state.test.js` — existing test pattern (16 tests, mkdtemp + GATE_ROOT env)
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` — sibling tool pattern to mirror
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — sibling query tool, will gain `entry_kind` filter
- `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` — sibling tool, will NOT be extended in SP0
- `docs/philosophy.md` — Pillar 3: "Evidence Is Source, Not Proof"; "Docs Are the Escape Hatch"
- `docs/observation-vs-meta-state.md` — three-layer separation
- `meta-state.jsonl` — 15 existing finding entries (no `entry_kind` field yet; will be coerced on read)

### External (from parent doc)

- Eric J. Ma, "How to build self-improving coding agents - Part 3" (2026)
- Gao et al., "A Survey of Self-Evolving Agents" (arXiv:2507.21046v4)
- Zhang et al., "HyperAgents" (arXiv:2603.19461)
- Zhang et al., "Darwin Godel Machine" (arXiv:2505.22954)
- Chojecki, "Variance Inequality" (arXiv:2512.02731)
