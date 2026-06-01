date: "2026-06-02T00:00:00Z"
status: superseded
superseded_by: brainstorm-260602-self-enforcing-loop-architecture.md
superseded_at: "2026-06-02T00:00:00Z"
supersession_reason: |
  Correctly identified the anti-pattern (agents default to docs/plans as architecture)
  but proposed content-heavy prevention measures that don't use the loop's own machinery.
  Superseded by the architecture-level fix in brainstorm-260602-self-enforcing-loop-architecture.md
  which makes meta-state.jsonl the rule registry via promoted_to_rule, a gate function,
  and a loop_describe MCP tool. The anti-pattern analysis here remains valid and is
  referenced by the new report.
tags: [brainstorm, meta, agent-behavior, anti-pattern, docs, plans, philosophy, superseded]

# [SUPERSEDED] Why Agents Default to `docs/` and `plans/` as Architecture

> ## STATUS: SUPERSEDED (2026-06-02)
>
> This report is **retained as historical analysis**. It correctly identified the recurring anti-pattern (agents defaulting to `docs/` and `plans/` as architecture rather than escape hatch) and proposed 6 prevention measures. However, those measures were content-heavy (new philosophy rules, gate warnings, prompt injection, new meta-state category) and did not use the loop's existing machinery.
>
> **Anti-pattern analysis:** Valid. The 5 root causes identified here are accurate and inform the superseding design.
>
> **Prevention measures:** Superseded. The correct fix is to make the loop's own state — `meta-state.jsonl` — the rule registry. See `brainstorm-260602-self-enforcing-loop-architecture.md` for the superseding design.
>
> The original 5 root causes, anti-pattern table, and 6 prevention measures are preserved below for historical context.

---

# Why Agents Default to `docs/` and `plans/` as Architecture

## The Observation

The `brainstorm-260601-meta-taxonomy-redesign.md` report proposes a new artifact type (`convention`), a new schema (`schemas/convention.schema.json`), a new directory (`conventions/`), and a three-tier taxonomy (meta-state → convention → decision) to solve the problem of 96 meta assertions losing their provenance.

This pattern is not unique. Agents frequently propose:
- New schemas or record types when existing ones feel "not quite right"
- New documentation files in `docs/` when procedural knowledge is discovered
- New taxonomy layers when complexity is encountered
- Architecture changes that reference `docs/` or `plans/` as canonical homes

## Root Cause Analysis

### 1. Agents Treat Complexity as a Taxonomy Problem

When an agent encounters 96 meta assertions, it sees a categorization challenge: "Where do these belong?" It does not see a curation challenge: "Which of these are still true?" or an encoding challenge: "Which of these can be expressed in code?"

Taxonomy design feels like architecture. Curation and encoding feel like cleanup. Agents prefer architecture.

### 2. The Schema Temptation

Creating a `convention.schema.json` with `id`, `schema_version`, `type`, `status`, `provenance`, `deferred_axes` feels like "real engineering" to an agent. It produces a tangible artifact. The agent cannot see that it is building a checklist dressed as a record.

The philosophy is explicit: **"The loop is not a checklist. Checklists are memory aids for people who already understand. The loop is a reasoning framework for agents who do not."** But the schema temptation overrides this because the agent does not recognize its own behavior as checklist-building.

### 3. `docs/` and `plans/` Are the Path of Least Resistance

The write gate allows `docs/**` and `plans/**` unconditionally. The bash gate does not block them. There is no preflight requirement. There is no MCP CRUD dance. So when an agent encounters complexity it does not know how to encode, `docs/` and `plans/` are the natural escape valves.

The philosophy calls `docs/` an **escape hatch**. The agent treats it as a **default destination**.

### 4. The Agent's Intake Flow Does Not Include the Philosophy Check

The agent's preflight checklist and intake flow do not say: *"Read `docs/philosophy.md` before proposing any architectural change. If your proposal contradicts this document, do not proceed."* The agent reads `AGENTS.md` for procedural rules, but it does not read the philosophy document for design principles.

### 5. No Hard Constraint Exists for Proposing New Artifacts

There is no rule in the loop that says: **"Agents may not propose new artifact types, schemas, or record directories."** The agent operates under a permissive assumption: if it sees a gap, it can design the taxonomy to fill it.

## The Anti-Pattern: Docs/Plans as Architecture

| What the Agent Sees | What It Should See |
|---|---|
| "96 meta assertions need a home" | "How many of these are still true?" |
| "We need a convention schema" | "Can we encode the critical ones in code?" |
| "A three-tier taxonomy is elegant" | "A three-tier taxonomy is bureaucracy" |
| "Provenance belongs in durable records" | "Provenance belongs in git history; live rules belong in code" |
| "`docs/conventions/` is human-readable" | "`docs/conventions/` is a loop gap — agents must open docs to know rules" |

## Why This Matters

### Loop Inflation
Every new artifact type, schema, and directory adds weight to the loop. The 96 proposed conventions would require:
- A new schema file
- A new validation rule
- 96 YAML files to maintain
- Agent intake logic to scan them
- Index logic to include them
- Migration scripts to manage them

This is not a lightweight fix. It is a permanent expansion of the loop's surface area.

### Agent Confusion
The next agent must now understand: conventions vs. decisions vs. meta-state vs. observations vs. index entries. The cognitive load increases. The loop's original purpose — to make agents faster by giving them durable memory — is undermined by the complexity of the memory system itself.

### The Philosophy Becomes Optional
When the agent proposes `docs/conventions/` as a canonical location for behavioral rules, it is treating the philosophy document as a suggestion rather than a constraint. The philosophy says: *"If an agent must open a doc to know what to do next, that knowledge is a gap."* The agent's proposal violates this directly. If the philosophy is not enforced, it is not a philosophy. It is a preference.

## Prevention Measures

### 1. Add a Hard "No New Artifacts" Rule to the Philosophy

Amend `docs/philosophy.md` with:

> **No New Artifact Types.** Agents may not propose new schemas, new record types, or new directories under `records/`. If you believe a new artifact type is necessary, report it as a meta-state gap with category `taxonomy-proposal` and stop. Do not design the taxonomy. The operator decides taxonomy changes.

This is not a recommendation. It is a mechanical constraint. The agent's preflight checklist should include it as a hard gate item.

### 2. Add a Gate Warning for Procedural Content in `docs/`

The write gate currently allows `docs/**` unconditionally. Add a warning tier:

> **Warning:** `docs/**` writes are allowed, but the write gate scans for procedural language ("Step 1", "must", "always", "agents should", "before X, do Y"). If detected, the gate emits a warning: "This file contains procedural knowledge. Consider encoding it in records, MCP tools, or code instead."

This does not block the write — `docs/` is still an escape hatch — but it surfaces the anti-pattern to the operator.

### 3. Add a Gate Warning for New Schema Proposals in `plans/`

Similarly, `plans/**` writes should trigger a warning if the file contains schema definitions, new artifact proposals, or taxonomy redesigns:

> **Warning:** `plans/**` writes that propose new schemas, artifact types, or directory structures are flagged. These are operator-level decisions. Consider reporting as a meta-state gap instead.

### 4. Require Philosophy Read Before Architecture Proposals

The agent intake flow should add:

> **Step N:** Before proposing any architectural change, new schema, or taxonomy redesign, read `docs/philosophy.md`. If your proposal contradicts any principle in that document, stop. Report the contradiction as a meta-state finding with category `philosophy-violation`.

### 5. Add `escape-hatch-abuse` to Meta-State Categories

When an operator detects a `docs/` or `plans/` file that contains procedural knowledge or new taxonomy proposals, they should record:

```yaml
id: meta-state-260602T0000Z-escape-hatch-abuse-docs-conventions
system: meta_loop
category: escape-hatch-abuse
severity: medium
description: |
  Agent proposed `docs/conventions/` as a canonical location for behavioral rules.
  This violates the philosophy: docs are for irreducible judgment, not procedural knowledge.
affected_system: meta_loop
evidence:
  - file: plans/reports/brainstorm-260601-meta-taxonomy-redesign.md
    section: "## The Three Meta-Level Surfaces"
```

Over time, this creates a dataset of anti-pattern instances that can train the agent to recognize its own behavior.

### 6. Make the MCP Server's Tool Descriptions the Canonical Home for Behavioral Rules

The 96 meta assertions that are still true should be encoded where they are actually needed:
- **MCP tool descriptions** — if the rule affects how a tool is used
- **Gate logic** — if the rule is a constraint (e.g., "check observations before asking user")
- **Agent prompt injection** — if the rule is a behavioral guideline (e.g., "scan observations before asking user")

The MCP server is the interface between the agent and the loop. If a rule is important enough for every agent to follow, it should be in the MCP server's surface, not in a YAML file the agent must remember to read.

## The Correct Response to the Original Problem

The 1:1 artifact cleanup deleted 28 meta evidence files. The real response should have been:

1. **Audit the 96 assertions** — how many are still true? How many are encoded elsewhere? How many are noise?
2. **Delete the dead ones** — if an assertion is outdated, superseded, or no longer relevant, delete it. Git history preserves the provenance.
3. **Encode the live ones** — if an assertion is still true and important, encode it in the MCP server, gate logic, or agent prompt. Do not create a YAML file.
4. **Report the gap** — if an assertion cannot be encoded in existing surfaces, report it as a meta-state gap with category `taxonomy-proposal` and let the operator decide.

The answer was never "create 96 convention YAML files." The answer was "curate, encode, or delete."

## Open Questions

1. **Should `docs/philosophy.md` be required reading in the agent intake flow?**
   - Currently `AGENTS.md` is the procedural reference. Philosophy is background. Should it be foreground?
2. **Should the write gate for `docs/` be stricter?**
   - Currently allowed unconditionally. Should procedural content trigger a block (not just a warning)?
3. **Should meta-state entries about `escape-hatch-abuse` trigger a feedback loop?**
   - E.g., the next agent that sees the meta-state entry is prompted to review its own proposal for the same pattern.

## Cross-References

- `docs/philosophy.md` — the document that this pattern violates
- `plans/reports/brainstorm-260601-meta-taxonomy-redesign.md` — the report that exhibits this pattern
- `AGENTS.md` — procedural rules for agents, where the hard constraint should be added
- `tools/learning-loop-mcp/server.js` — where behavioral rules should be encoded, not in YAML files
