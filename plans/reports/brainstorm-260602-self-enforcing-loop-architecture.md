---
date: "2026-06-02T00:00:00Z"
status: proposed
tags: [brainstorm, meta, architecture, enforcement, self-describing, loop-state, rule-registry, supersedes]
supersedes:
  - brainstorm-260601-meta-taxonomy-redesign.md
  - brainstorm-260602-agent-docs-plans-default-pattern.md
related:
  - docs/philosophy.md
  - docs/observation-vs-meta-state.md
  - tools/learning-loop-mcp/core/meta-state.js
  - tools/learning-loop-mcp/core/gate-logic.js
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js
---

# Self-Enforcing Loop Architecture: Meta-State as the Rule Registry

> **Status: Proposed.** This report supersedes both prior reports:
>
> - `brainstorm-260601-meta-taxonomy-redesign.md` — **rejected** (proposed new `convention` schema; the philosophy violation is documented inline; the problem analysis remains valid)
> - `brainstorm-260602-agent-docs-plans-default-pattern.md` — **superseded** (correctly identified the anti-pattern, but proposed content-heavy prevention measures that don't use the loop's own machinery)
>
> This report proposes an architecture-level fix where the loop's existing machinery — `meta-state.jsonl`, the gate, and the MCP tool registry — becomes the rule registry. The loop becomes self-describing and self-enforcing. **Three surgical changes. No new artifact types, no new schemas, no new directories, no new YAML.**

## The Problem (Re-stated)

The `260601-meta-1to1-artifact-cleanup` plan deleted 28 meta evidence files. The 96 meta index entries lost their provenance. Two brainstorm reports have tried to solve this:

1. **First report (rejected):** Propose a new `convention` artifact type — `convention.schema.json`, 96 YAML files, `conventions/` directory. Adds loop surface area; violates "no new artifact types" philosophy.
2. **Second report (superseded):** Identify the anti-pattern; propose 6 prevention measures — new philosophy rules, new gate warnings, new meta-state category, etc. Adds maintenance burden; doesn't use the loop's existing machinery.

Both reports treat the problem as **content to author** (write more rules, more docs, more warnings). The actual problem is **mechanism missing** — the loop has no self-describing, self-enforcing surface for operational rules. The agent that defaulted to `docs/` did so because the loop had no in-loop affordance for the situation it was in.

## Why Both Prior Solutions Are Wrong

### The First Solution: Adding a New Artifact Type

The first report proposed a `convention` schema with `id`, `status`, `provenance`, `deferred_axes`. This:

- Adds 1 new schema
- Requires 96 new YAML files
- Requires new agent intake logic
- Requires new index logic
- Increases the loop's cognitive surface area

The philosophy explicitly forbids this: agents may not propose new artifact types. The first report was correctly rejected.

### The Second Solution: Content-Heavy Prevention

The second report proposed 6 prevention measures:

1. "No New Artifact Types" rule in `docs/philosophy.md`
2. Gate warning for procedural content in `docs/**`
3. Gate warning for new schema proposals in `plans/**`
4. Required philosophy read before architecture proposals
5. New `escape-hatch-abuse` meta-state category
6. Encode rules in MCP tool descriptions, gate logic, and agent prompts

This is **more content** to maintain, not less. It:

- Adds 1 new rule to philosophy
- Adds 2 new gate patterns
- Adds 1 new meta-state category
- Distributes rules across 4 surfaces (docs, gate, MCP tools, prompts)

The second report correctly identified the anti-pattern but did not use the loop's existing machinery to solve it. The loop has `meta-state.jsonl` with 24h TTL, ack/resolve lifecycle, and category-based filtering. **None of this is used.** The solution is **out-of-loop** (philosophy text, gate warnings, prompt injection) when it should be **in-loop** (meta-state findings, gate enforcement, MCP tool descriptions).

## Core Insight: Rules Are State, Not Content

The loop is a state machine. New operational rules should be **new state transitions**, not new artifacts.

Current state of the loop's surfaces:

- **Observations:** external system state (durable, operator-managed)
- **Decisions:** boundaries (durable, operator-managed)
- **Experiments:** probes (durable, operator-managed)
- **Risks:** warnings (durable, operator-managed)
- **Meta-state:** findings (ephemeral, agent-managed, 24h TTL)
- **Index entries:** assertions (durable, machine-extracted)

None of these are designed for **durable operational rules that the agent must follow every session**. The loop's response to "we need a place for the agent to know the rules" should not be "create a new schema." It should be "extend the existing rule-adjacent surface (meta-state) with rule lifecycle."

**The shift:** meta-state grows a `promoted_to_rule` field. When a finding is promoted, it becomes a rule. The rule is enforced by the gate, read by the agent, governed by meta-state's existing ack/resolve/auto-resolve lifecycle.

## The Architecture: Three Layers

### Layer 1: meta-state.jsonl Grows a `promoted_to_rule` Field

Add one field to the existing meta-state entry schema:

```json
{
  "id": "meta-...escape-hatch-abuse-...",
  "category": "loop-anti-pattern",
  "subtype": "escape-hatch-abuse | new-artifact-type | schema-bloat",
  "severity": "warning",
  "affected_system": "mcp-tools",
  "description": "...",
  "evidence": { ... },
  "promoted_to_rule": {
    "rule_id": "rule-no-new-artifact-types",
    "enforcement": "gate | agent | tool",
    "pattern": "...",
    "promoted_at": "...",
    "promoted_by": "operator"
  },
  "status": "reported",
  "created_at": "...",
  "expires_at": "..."
}
```

Plus a new category `loop-anti-pattern` in the `meta-state-report` tool's zod schema.

**The lifecycle:**

1. Agent or operator records a `loop-anti-pattern` finding
2. After N occurrences (or operator judgment), the finding is promoted to a rule
3. The rule is now active loop infrastructure
4. The rule can be acked, resolved, or auto-resolved (existing meta-state lifecycle)

**No new artifact type, no new directory, no new schema.** The rule lives inside an existing entry.

### Layer 2: The Gate Reads Promoted Rules

Extend `core/gate-logic.js` with two functions:

```js
export function loadPromotedRules(root) {
  const entries = readRegistry(root);
  return entries.filter(e =>
    e.promoted_to_rule &&
    e.status === "active" &&
    e.promoted_to_rule.enforcement === "gate"
  );
}

export function applyPromotedRules(command, filePath, rules) {
  for (const rule of rules) {
    const { pattern_type, pattern } = rule.promoted_to_rule;
    let matched = false;
    if (pattern_type === "regex" && command) {
      matched = new RegExp(pattern).test(command);
    } else if (pattern_type === "glob" && filePath) {
      matched = globMatch(pattern, filePath);
    }
    if (matched) {
      return {
        decision: "escalate",
        reason: `Promoted rule "${rule.promoted_to_rule.rule_id}" matched: ${pattern}`,
        rule_id: rule.promoted_to_rule.rule_id,
        meta_state_id: rule.id,
        pattern_type,
      };
    }
  }
  return { decision: "ok" };
}
```

Wire into the existing gate pipeline (e.g., as a post-match check in `makeGateDecision` or before the final return):

```js
const promotedRules = loadPromotedRules(root);
const ruleCheck = applyPromotedRules(command, promotedRules);
if (ruleCheck.decision !== "ok") return ruleCheck;
```

**The effect:** A `loop-anti-pattern` rule with `enforcement: gate` and a regex on `"propose.*new.*schema"` would have caught the original `convention.schema.json` proposal at write time. Emitted as an escalate with the rule's provenance and the prior anti-pattern instance.

**The key shift: rules are state, not config.** Adding or removing a rule is a meta-state update, not a code change. The loop's own machinery (ack, resolve, auto-resolve) governs rule lifecycle.

### Layer 3: `loop_describe` — The Self-Describing Loop

One new MCP tool. The agent calls it at session start, **before** reading `AGENTS.md`:

```js
// tools/loop-describe-tool.js (new)
export const loopDescribeTool = {
  name: "loop_describe",
  description: "Return the loop's current operational surface: tools, record types, meta-state categories, gate patterns, active rules, and active findings. Call this at session start to discover what the loop offers.",
  schema: {},
  handler: async () => {
    const root = resolveRoot();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tools: listAllTools(root),
          record_types: listAllRecordTypes(root),
          meta_state_categories: listAllMetaCategories(root),
          gate_patterns: listAllGatePatterns(root),
          promoted_rules: listActivePromotedRules(root),
          active_findings: listActiveFindings(root),
          anti_patterns: listAntiPatterns(root),
        }, null, 2),
      }],
    };
  },
};
```

**Auto-generated** from:

- `tools/manifest.json` (tool list)
- `schemas/*.schema.json` (record types)
- `core/meta-state.js` zod schema (meta-state categories — exposed via a registry constant)
- `core/patterns.json` (gate patterns)
- `meta-state.jsonl` (active findings, promoted rules, anti-patterns)

Stays in sync with code. No manual maintenance.

**The effect:** The agent that defaulted to `docs/` because it didn't know about `meta_state_report` and `record_create_risk` now sees them listed at session start. The agent that proposed a new schema now sees a prior anti-pattern: "5 prior proposals for new schema were rejected." **The agent self-corrects from loop state, not from philosophy reading.**

## Implementation Sketch (3 Surgical Changes)

### Change 1: Extend `meta-state-report` tool schema

File: `tools/learning-loop-mcp/tools/meta-state-report-tool.js`

```js
category: z.enum([
  "gate-logic-bug",
  "record-repair-gap",
  "schema-drift",
  "stale-ref",
  "mcp-tool-missing",
  "budget-check",
  "loop-anti-pattern",  // NEW
]).describe("Category of the finding"),

// Add to optional fields:
subtype: z.string().optional()
  .describe("Subtype for loop-anti-pattern findings (e.g., escape-hatch-abuse, new-artifact-type, schema-bloat)"),
promoted_to_rule: z.object({
  rule_id: z.string(),
  enforcement: z.enum(["gate", "agent", "tool"]),
  pattern_type: z.enum(["regex", "glob"]).describe("Pattern language: regex for command content, glob for file paths (Decision 3)"),
  pattern: z.string().describe("Pattern string (regex or glob depending on pattern_type)"),
  promoted_at: z.string(),
  promoted_by: z.string(),
}).optional()
  .describe("If set, this finding is promoted to an enforced rule. Operator-only promotion; system suggests after 2+ occurrences (Decision 2)"),
```

Mirror the same schema in `record-writer.js` (used by tests and direct calls).

### Change 2: Gate reads promoted rules

File: `tools/learning-loop-mcp/core/gate-logic.js`

Add the `loadPromotedRules` and `applyPromotedRules` functions shown above. Wire into the gate pipeline (e.g., as a final check after `makeGateDecision`). Add tests in `__tests__/gate-logic.test.js` or a new test file.

### Change 3: New `loop_describe` tool (tier-aware)

File: `tools/learning-loop-mcp/tools/loop-describe-tool.js` (new)

```js
import { z } from "zod";

export const loopDescribeTool = {
  name: "loop_describe",
  description: "Return the loop's current operational surface. **Recommended: call at session start to discover what the loop offers.** Supports tiered reads (hot/warm/cold/summary) to control context bloat — see Context Tiering section.",
  schema: {
    tier: z.enum(["hot", "warm", "cold", "summary"]).optional()
      .describe("Read tier: hot=active rules only (~5KB), warm=active surface (default, 10-25KB), cold=full history (25-100KB), summary=counts only (<1KB)"),
    categories: z.array(z.string()).optional()
      .describe("Optional filter: only return entries matching these meta-state categories"),
  },
  handler: async ({ tier = "warm", categories }) => {
    const root = resolveRoot();
    const result = {
      tier,
      tools: tier === "summary" ? countTools(root) : listAllTools(root),
      record_types: tier === "summary" ? countRecordTypes(root) : listAllRecordTypes(root),
      meta_state_categories: listAllMetaCategories(root),
      gate_patterns: listAllGatePatterns(root),
      promoted_rules: listPromotedRules(root, { tier, categories }),
      active_findings: tier === "cold" ? listActiveFindings(root, { categories }) : null,
      anti_patterns: listAntiPatterns(root, { tier, categories }),
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
};
```

Register in `tools/manifest.json`:

```json
{ "file": "./tools/loop-describe-tool.js", "export": "loopDescribeTool" }
```

Add to `agent-manifest.json` under a new group or extend an existing one.

See [Context Tiering and Robustness Levels](#context-tiering-and-robustness-levels) for the full tiering design, tier selection heuristics, and the 4-bucket mapping.

### Migration: Backfill the First Anti-Pattern as a Promoted Rule

The existing `meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal` entry should be promoted immediately to demonstrate the rule:

```json
{
  ...,
  "category": "loop-anti-pattern",
  "subtype": "new-artifact-type",
  "promoted_to_rule": {
    "rule_id": "rule-no-new-artifact-types",
    "enforcement": "gate",
    "pattern_type": "regex",
    "pattern": "propose|design|create|new\\s+(schema|artifact|directory|convention)",
    "promoted_at": "2026-06-02T00:00:00Z",
    "promoted_by": "operator"
  },
  "status": "active"
}
```

With `status: active`, the rule is enforced by the gate. The next time an agent writes a plan/report that contains "new schema" or "new convention," the gate escalates with a reference to the prior anti-pattern.

## Why This Is Different

| Dimension | First report (rejected) | Second report (superseded) | This report |
|---|---|---|---|
| New artifact types | 1 (convention) | 0 explicit | 0 |
| New schemas | 1 (`convention.schema.json`) | 0 | 1 enum extension (1 line) |
| New directories | 1 (`conventions/`) | 0 | 0 |
| New YAML files | 96 (conventions) | 0 | 0 (rules are state in meta-state) |
| New gate patterns | 0 | 2 (docs/ and plans/ warnings) | 0 (rules are dynamic, read from meta-state) |
| New meta-state categories | 0 | 1 (`escape-hatch-abuse`) | 1 (`loop-anti-pattern`, supersedes `escape-hatch-abuse`) |
| New philosophy text | 0 | 1 rule (No New Artifact Types) | 0 (rules are state, not docs) |
| New agent prompt content | 0 | Variable (encode in prompts) | 0 (`loop_describe` returns it dynamically) |
| Loop self-correction | Operator reads reports, manually updates rules | Operator detects anti-pattern, writes report | Agent reads loop state, self-corrects at session start |
| Catches next instance | Manually (operator review) | Manually (operator review) | Automatically (gate pattern matches and escalates) |
| Operator burden | High (96 YAML files) | High (6 prevention measures to maintain) | Low (1 tool call to promote a finding) |

**The shift:** content-heavy prevention (rules in docs, gate warnings, prompt text) → state-driven enforcement (rules in meta-state, gate reads meta-state, agent reads `loop_describe`).

## What This Doesn't Solve (and Why)

- **It doesn't preserve the 96 lost assertions by default.** They are gone from the live loop (git history has them). This proposal makes sure the next 96 rules have a proper home. For the full argument on why we do NOT restore from git and bulk-convert, see [On Restoring the 96 Lost Assertions](#on-restoring-the-96-lost-assertions).
- **It doesn't eliminate the underlying cognitive failure** (agents treat complexity as taxonomy problem). But it makes that failure **observable and reversible** — every instance is a meta-state entry, every future instance triggers a gate escalation, the pattern becomes self-correcting over time.
- **It doesn't make agents read philosophy.** It makes philosophy enforcement **automatic** — the agent doesn't need to read philosophy to be told "new artifact types are forbidden" if the gate says so at write time.
- **It doesn't replace operator judgment.** Operator still promotes findings to rules. The loop just provides the mechanism for the promotion and the enforcement.

## On Restoring the 96 Lost Assertions

A natural follow-up question: if the 96 assertions are gone from the live loop but git history has them, can we restore the 28 evidence files from `026d37c^` and bulk-convert the assertions to rules?

**Short answer: No. Restoration + bulk conversion is debt amplification, not preservation.** The 96 should be audited, not restored.

### Why Restoration Is Debt

1. **Stale rationale.** Evidence from May 2026 references operational states that have since changed. A rule with stale provenance is actively dangerous — it looks authoritative, but the reasoning no longer holds. Example: an evidence file may say "agent didn't know about `meta_state_list`" as a trigger. Today, the agent does know — the rule is no longer needed, or its pattern is wrong. Bulk-converting assumes the May 2026 reasoning still applies.

2. **Operator decision reversal.** The 1:1 cleanup in commit `026d37c` was a deliberate operator action. The agent restoring evidence without operator approval reverses an operator decision in the agent's favor. If the operator wants to reverse the cleanup, that's their call. The agent's job is to surface the option, not to act on it.

3. **Bulk conversion is the same anti-pattern with different names.** The first report proposed "create 96 conventions." The user rejected that. If we instead propose "restore 28 evidence files, convert 96 assertions to rules, set `status: active` on each," we are doing the same thing in different syntax. **The 96 is a feature, not a bug** — the small number forces curation. Bulk processing skips curation.

4. **Reference rot.** The 96 extracted-assertion records have `extraction.source_refs` pointing to evidence. After the 1:1 cleanup, those refs were changed to `self:` (a temporary hack to mark them as self-referential). Restoring evidence re-enables the source refs — but the extraction is 1 month old. The extracted claim may have been true then, may be true now, or may have shifted. The extraction block doesn't tell us which.

5. **The gate becomes a museum.** A gate with 96 regex patterns from May 2026 enforces live rules AND preserves historical ones. The first job is critical. The second is decoration. Mixing them means performance cost (96 regex matches per command), maintenance cost (which of the 96 are still relevant?), and confusion cost (agent sees 96 "active rules" and treats them all as current). The gate should enforce **the rules the operator has actively promoted as current**. A bulk-restored set conflates promotion with restoration.

### The Correct Path: Curation, Not Restoration

The 96 extracted-assertions still exist in `records/meta/index/*.yaml` with `self:` refs. That is the live state to audit. For each:

- **Is this still true? Is it already encoded in MCP tools, gate, or prompts? Would the gate missing it cause a real problem?**
  - All three yes → Promote to a meta-state rule with `promoted_to_rule`. This is the first live rule.
  - First two yes → Already encoded. No action.
  - First only → The rule is needed but belongs in code (gate, prompt, tool description), not YAML.
  - No to all → Delete the extracted-assertion. Let git history preserve the rationale.

For the 28 evidence files in git: **leave them in git.** Read them via `git show 026d37c^:records/meta/evidence/<file>.md` for operator audit context. Do not restore. Git history is the audit trail; the loop doesn't need to re-host it.

### When Restoration Would Be Valid

Only if the operator decides the 1:1 cleanup was wrong and wants to reverse it. That's an operator decision, not an agent decision. The agent surfaces the option; the operator calls it. Restoration is a different conversation than "let's preserve the 96" — it's "let's reverse the 1:1 cleanup."

### Cost Comparison

| Path | Files Added | Gate Patterns | Maintenance | Risk |
|---|---|---|---|---|
| Restore + bulk convert | +28 evidence | 96 (from May 2026) | high | high (stale rationale, decision reversal) |
| Curate, encode, delete | 0 | 5-15 (curated) | low | low (operator-approved, current state) |
| Do nothing | 0 | 0 | none | low (assertions are dormant) |

The "do nothing" path is surprisingly safe because the 96 are dormant — they don't enforce anything. Restoration would make them active, inverting the cleanup's intent. The curated path keeps the loop clean while preserving operator discretion.

## Resolved Decisions

All 8 open questions resolved on 2026-06-02 in preparation for planning. Decisions 1-4 confirmed with the operator; Decisions 5-8 follow as implications of those structural choices.

### Decision 1: Category Model

`loop-anti-pattern` is the **single category** for all anti-pattern findings. Specific patterns are encoded as `subtype` values.

**Initial subtype enum:**
- `escape-hatch-abuse` — agents default to `docs/` or `plans/` as architecture rather than escape hatch
- `new-artifact-type` — agent proposes a new schema, record type, or directory
- `schema-bloat` — agent proposes adding fields to existing schemas without justification

**Extensible:** new subtypes are added as patterns emerge, not as new categories.

**Migration:** The existing `meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal` entry (currently `category: gate-logic-bug`) will be migrated to `category: loop-anti-pattern, subtype: new-artifact-type` as the first live rule.

**Rationale (inversion):** Five separate categories (one per pattern) would fragment the concept and force the agent and gate to enumerate 5+ category names to find "loop anti-patterns." Single category + subtypes gives one filterable concept with many instances. Aligns with the philosophy of rules living in meta-state.

### Decision 2: Promotion Threshold

**Hybrid: auto-suggest after 2+ occurrences, operator approves.** The system surfaces "this finding has occurred 2+ times" but the operator (or operator-approved agent) calls the promotion tool. No auto-promotion.

**Implementation:** A new `meta_state_promote_rule` tool (or extend `meta_state_ack` to accept a `promoted_to_rule` patch). After promotion, the operator calls `meta_state_ack` to set `status: active`. The gate loads the rule on the next command.

**Auto-suggest mechanism:** The `meta_state_list` tool can be extended to surface an `occurrences: N` field (counting meta-state entries with the same `subtype`) and highlight findings with `N >= 2` as "suggested for promotion." This is a UI/UX improvement, not a state change.

**Rationale (inversion):** Asymmetric cost (false positive blocks work; false negative is just slower). Operator-only is too slow; auto-promote is too risky. Hybrid: system counts, operator clicks.

**Threshold rationale:** 2+ is the minimum to detect a recurring pattern without being too sensitive. Single occurrences may be one-offs (false positives). Two occurrences indicate the pattern is real. Operator can override the threshold by promoting after 1 (for severe anti-patterns) or refusing to promote after many (for non-anti-patterns).

### Decision 3: Pattern Syntax

**Mix: regex for command content, glob for paths.** Match what the gate already uses (`CONSTRAINT_PATTERNS` regex, `WRITE_PATH_PATTERNS` glob).

**Schema:**
```yaml
promoted_to_rule:
  rule_id: "rule-no-new-artifact-types"
  enforcement: "gate"
  pattern_type: "regex | glob"  # NEW: distinguishes pattern language
  pattern: "propose|design|create|new\\s+(schema|artifact|directory|convention)"
  promoted_at: "..."
  promoted_by: "operator"
```

**Rationale (inversion):** Regex everywhere is ugly for paths. Glob everywhere can't match command substrings. New DSL is most expressive but most complex. Match the gate's existing pattern languages. **No new pattern engine; no new dependency.**

### Decision 4: `loop_describe` Injection

**Manual call; tool description recommends calling at session start.** The agent has agency; the loop doesn't force injection.

**Tool description (in `loop-describe-tool.js`):**
> "Return the loop's current operational surface: tools, record types, meta-state categories, gate patterns, active rules, and active findings. **Recommended: call at session start to discover what the loop offers.**"

**Rationale (inversion):** Never expose → agents default to `docs/` again. Always auto-inject → context bloat, checklist behavior (violates "loop is not a checklist" philosophy). Tool that can be called, with strong recommendation: agent has agency, surface is discoverable.

**Note on vendor-controlled prompts:** The agent prompt (CLAUDE.md, AGENTS.md equivalents) is vendor-controlled. The loop can't inject there. The tool description is the loop's voice; it recommends, doesn't enforce.

### Decision 5: Ack Lifecycle

**Promoted rules are ack-able like other meta-state entries.** The rule IS a meta-state entry with `promoted_to_rule` set. The same lifecycle applies:

| Status | Meaning | Gate behavior |
|---|---|---|
| `reported` | Just promoted, awaiting operator ack | Ignore |
| `active` | Operator acked, rule is in effect | Enforce |
| `resolved` | Operator resolved, rule retired | Ignore |
| `expired` | 24h TTL without ack | Ignore (auto) |
| `auto-resolved` | Auto-resolve file modified | Ignore (auto) |

**Operator workflow:**
1. Agent or operator records finding
2. After 2+ occurrences, system surfaces suggestion
3. Operator (or operator-approved agent) calls `meta_state_promote_rule(id, ...)`
4. Operator calls `meta_state_ack(id)` → `status: active`
5. Gate loads rule on next command
6. Operator can `meta_state_resolve(id)` to retire

### Decision 6: 96 Meta Index Entries

**Stay as dormant `extracted-assertion` records with `self:` refs.** One-by-one curation is the operator's work, not the agent's.

**Process:** For each of the 96, the operator asks three questions:
- Is this still true?
- Is it already encoded in MCP tool descriptions, gate logic, or agent prompts?
- Would the gate missing it cause a real problem?

**Outcomes per assertion:**
- All three yes → promote to a rule (via Decision 2 workflow)
- First two yes → already encoded, no action
- First only → encode in code (gate, prompt, tool description), not YAML
- No to all → delete the extracted-assertion (git history preserves)

**Rationale:** Already covered in the "On Restoring the 96 Lost Assertions" section above. Restoration + bulk conversion is debt amplification; curation preserves signal.

### Decision 7: Tool Descriptions Source

**Module `description` field, not manifest.** The manifest is just routing metadata (`{file, export}`); the `description` field is what the agent actually sees via MCP.

**Implementation:** `loop_describe` calls a helper that imports each tool module and reads its `description`. Manifest is fallback if the module can't be loaded.

**Sample data flow:**
```
loop_describe()
  → for each tool in manifest:
    → import(module)
    → read module.description
    → {name, description, schema_summary}
  → return
```

**Rationale (inversion):** Manifest is easier to maintain but may drift from code. Module field is authoritative but requires import. Authoritative source wins; drift is worse than a small import cost.

### Decision 8: Relationship to `meta_state_list`

**Complementary, not redundant.** `meta_state_list` is the primitive (filter by `category`, `status`, `affected_system`). `loop_describe` composes it with other introspection.

**Composition:**
- `loop_describe.promoted_rules` = `meta_state_list({category: "loop-anti-pattern", status: "active"})`
- `loop_describe.active_findings` = `meta_state_list({status: ["reported", "active"]})`
- `loop_describe.anti_patterns` = `meta_state_list({category: "loop-anti-pattern"})`

**No new tool replaces `meta_state_list`.** `loop_describe` is a higher-level convenience that bundles multiple introspections (tool list, record types, gate patterns, meta-state findings) into a single "what is the loop?" answer.

## Context Tiering and Robustness Levels

> **Critical: gate reads hot; agent defaults to warm; cold requires explicit request.**

### The Four Tiers

| Tier | Returns | Size (steady) | When |
|---|---|---|---|
| **hot** | active promoted rules only | 5-50 / ~5KB | gate checks; "is X safe?" |
| **warm** | + active findings + tool surface | 10-100 / 10-25KB | "what is the loop?" (default) |
| **cold** | full registry + history | 50-500+ / 25-100KB | audit only; "why did X fail?" |
| **summary** | counts only | <1KB | pre-flight; large contexts |

- **hot** lives in gate memory; refresh on `meta-state.jsonl` mtime. Zero cost to agent.
- **warm** is `loop_describe` default. Fits modern context windows.
- **cold** requires explicit `tier: "cold"`. Reserved for "why" / audit / postmortem.
- **summary** is pre-flight: agent decides if warm/cold is worth loading.

### Tier Selection (3 Signals)

**1. Question framing (keyword heuristic):**
- "is X safe" / "will X work" / "can I run" → **hot**
- "what is X" / "show me X" / "tell me about" → **warm**
- "why did X" / "audit" / "review" / "what changed" → **cold**

**2. Task type (implicit from tool call):**
- gate check, `record_create_*`, `budget_check` → **hot**
- `meta_state_list`, `loop_describe`, orientation → **warm**
- `index_validate`, `index_extract`, postmortem → **cold**

**3. Explicit override (operator or escalation):**
- `loop_describe({tier: "summary"})` → counts ("50 rules, 12 findings, 35 tools")
- Agent escalates warm/cold based on summary signal

### Bounded Growth (Existing Mechanisms)

1. **24h TTL** on `reported` status — un-acked findings expire
2. **7-day compaction** on terminal entries — registry drops them
3. **Operator promotion** = slow-by-design (every rule human-reviewed)

Optional: **90-day TTL on `promoted_to_rule`** → re-promotion forces re-evaluation.

### Robustness Echo

Agent's response includes the tier used:

```
[robustness: warm] 50 active rules, 12 findings, 35 tools.
Relevant: "rule-no-new-artifact-types" (active 2026-06-02).
```

Operator escalation: "go deeper" → cold. No silent escalation.

### 4-Bucket Mapping

| Bucket | Tier implementation |
|---|---|
| **Write** (external) | meta-state.jsonl; hot tier in gate memory |
| **Select** (filter) | `meta_state_list({category, status})`; `tier` param |
| **Compress** (summary) | `tier: "summary"`; 90%+ size reduction |
| **Isolate** (sub-agents) | parallel reads per category |

### Anti-Patterns to Avoid

- ❌ `loop_describe()` with no tier → always 25KB; no signal
- ❌ Auto-inject cold at session start → 80% wasted tokens
- ❌ Silent escalation (no echo) → operator can't gauge depth
- ❌ Full history for "is X safe" → 50x overkill
- ❌ Critical info in middle of response → lost-in-middle (U-curve)

### Thresholds (Skill-Aligned)

- **70%** context util: warn; suggest `summary` or hot
- **80%** util: critical; compress to hot before any meta-state read
- **cold**: explicit operator request or audit task only

### Why This Doesn't Bloat

- Agent's context filled by **response size**, not registry size. Warm = 10-25KB. Cold = 25-100KB. Both fit modern windows.
- **hot** is zero-cost to agent (gate memory, not context).
- Agent **escalates only when needed**; warm default sufficient for 80% of questions.
- Agent can **summary-first, then escalate**: `tier: "summary"` → decide if warm/cold needed.
- **Progressive disclosure**: tool returns only the requested tier; no exhaustive read at session start.

## Relationship to Existing Philosophy

The philosophy document says:

> "**It is not a checklist.** Checklists are memory aids for people who already understand. The loop is a reasoning framework for agents who do not. Checklists that agents must read from docs are loop gaps."

This proposal turns the philosophy into **mechanism**. The agent doesn't read a doc to know "no new artifact types"; the gate enforces it. The agent doesn't read a doc to know what tools are available; `loop_describe` returns them dynamically. The philosophy becomes a state, not a document.

The philosophy also says:

> "If an agent must open a doc to know what to do next, that knowledge is a gap — it belongs in records, observations, index entries, or MCP tools, not in a human-readable file."

This proposal fills the gap. The "what should I do now?" knowledge lives in `loop_describe`'s output (a tool, not a doc) and in promoted rules (state in meta-state, not in docs).

## Cross-References

- `docs/philosophy.md` — the loop philosophy; this proposal aligns with "rules are state, not content"
- `docs/observation-vs-meta-state.md` — domain vs meta separation; meta-state is the right place for rules
- `tools/learning-loop-mcp/core/meta-state.js` — the registry; this proposal extends it with a `promoted_to_rule` field
- `tools/learning-loop-mcp/core/gate-logic.js` — the gate; this proposal extends it with rule reading
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` — the report tool; this proposal extends its zod schema
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — the list tool; already queryable by category
- `plans/reports/brainstorm-260601-meta-taxonomy-redesign.md` — the rejected first report
- `plans/reports/brainstorm-260602-agent-docs-plans-default-pattern.md` — the superseded second report
- `meta-state.jsonl` — current entries; the existing `escape-hatch-abuse` entry will be promoted to a rule

## Example Walk-Through

**Before this proposal (current state):**

1. Agent encounters 96 meta assertions with no home
2. Agent proposes `convention.schema.json` + 96 YAML files
3. Operator reads report, identifies anti-pattern
4. Operator writes a new report with 6 prevention measures
5. Operator adds philosophy text, gate warnings, prompt injection
6. Maintenance burden accumulates; loop surface area grows

**After this proposal (target state):**

1. Agent encounters 96 meta assertions with no home
2. Agent calls `loop_describe` at session start
3. Agent sees: 11 meta-state categories, 35 tools, 6 record types, active rules
4. Agent realizes there's no "operational rule" surface; records a `loop-anti-pattern` finding with `subtype: new-artifact-type`
5. Operator reviews; promotes the finding to a rule with `enforcement: gate, pattern: ...`
6. Gate now escalates any future plan/report that matches the pattern
7. The rule is governed by meta-state lifecycle (ack, resolve, auto-resolve)
8. No new schema, no new directory, no new YAML
