# Brainstorm Report: Decrease Outside Instruction

Date: 2026-05-21
Scope: docs/operator-guide.md → learning-loop artifacts + MCP workflow tools
Pattern: "Minimal hook, rich MCP" extended with workflow namespace

---

## Summary

The operator guide (`docs/operator-guide.md`) is ~600 lines of procedural instruction agents must read and follow manually every session. The system already mechanically enforces 6 areas (schema validation, budget checks, write auth, bash gating, inbound warnings, MCP gate tools). The remaining ~500 lines are "outside instruction" — knowledge the system has but does not drive.

Goal: encode the procedural knowledge into learning-loop artifacts (records, index entries, capabilities) and MCP workflow tools so the agent completes intake→experiment→capability lifecycle without opening the operator guide.

---

## Prerequisites

Before implementing this plan, read:

1. **`plans/reports/scout-260521-meta-evidence-inventory.md`** — Inventory of all 16 current meta evidence files. Confirms no content overlap with proposed artifacts. Establishes format baseline.

---

## Problem Statement

Agents start fresh every session. Without the loop, they repeat the same discoveries and mistakes. The operator guide exists to prevent this — but it is a **passive document**. The agent reads it, interprets it, decides what to do. Errors compound:

- **Intake flow**: Agents skip steps, browse evidence standalone instead of index-first, forget observation checks before asking operator
- **Runtime protocol**: Agents fail to request proper approval before live/runtime commands, miss required envelope fields
- **Experiment lifecycle**: Agents don't link results back to evidence, forget cleanup verification, mismatch result conventions

The loop's philosophy says "the record is the memory." The operator guide is not a record. It is ephemeral instruction.

---

## Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| R1 | Agent completes full intake→experiment→capability lifecycle without opening operator-guide.md | Must |
| R2 | Mechanical enforcement where possible (gates already do this for dangerous actions) | Must |
| R3 | Workflow tools drive agent through multi-step processes | Must |
| R4 | Record templates pre-validate structure | Should |
| R5 | Prompt blueprints become callable MCP tools | Should |
| R6 | Operator guide shrinks to reasoning, philosophy, exceptions | Must |

---

## Approaches Evaluated

### A. Extend existing constraint-gate server (gate_* + workflow_* namespaces) — **Recommended**

Single MCP server. `gate_*` tools enforce boundaries. `workflow_*` tools drive processes. DIY tool registry keeps server manageable.

**Pros:**
- Single entry point, single auth model
- Shared state (all tools touch `records/`, `schemas/`)
- Shared audit trail (`gate-log.jsonl`)
- One `.mcp.json` entry, one Node process
- Reuse existing hook integration
- All tools are learning-loop governance

**Cons:**
- Server grows but DIY registry keeps it manageable (~280 lines vs 800+ inline)
- Need clear namespace naming to avoid agent confusion

### B. Separate learning-loop workflow server

Constraint-gate keeps enforcement. New server handles orchestration.

**Pros:**
- Strict separation of concerns
- Can evolve independently
- Can deploy separately

**Cons:**
- Two MCP connections to configure
- State sharing issues (both read `records/observations/`)
- Overkill at current scale
- No external API credentials or HTTP transport need yet

### C. FastMCP framework

Replace DIY server with FastMCP decorator-based framework.

**Pros:**
- Less boilerplate per tool
- Auto JSON Schema from Zod
- Transport abstraction for future HTTP/SSE

**Cons:**
- New dependencies (`fastmcp`, `zod`)
- Rewrite 407 lines of battle-tested server.js
- Two schema languages (Zod for MCP, AJV for YAML records)
- Rebuild custom audit trail integration
- Savings per tool (~5 lines) do not outweigh rewrite cost at current scale

**Verdict:** Rejected. Scout report §14 analysis holds. Threshold for revisit: tool count >12 AND (external API creds OR HTTP transport OR divergent release cadence). Current: ~18 tools, stdio-only, same cadence.

---

## Final Recommended Solution

### Architecture: Hybrid Single Server with DIY Registry

```
tools/constraint-gate/
  server.js                    # thin registry (~50 lines)
  tool-registry.js             # createTool + registerTools (~20 lines)
  gate-logic.js                # pure decision functions (existing)
  workflow-logic.js            # new: workflow orchestration helpers
  tools/
    # Gate namespace (enforcement + management)
    gate-check.js              # check_gate (existing)
    gate-record-observation.js # record_observation (existing)
    gate-update-observation.js # update_observation (existing)
    gate-notify-artifact.js    # notify_artifact_change (existing)
    gate-trigger-workflow.js   # trigger_workflow (existing)
    gate-validate-records.js   # validate_records (NEW)
    gate-extract-index.js      # extract_index_entries (NEW)
    gate-search-index.js       # search_index_entries (NEW)
    gate-generate-capabilities.js # generate_capability_records (NEW)
    gate-update-claim.js       # update_claim_verification (NEW)
    gate-list-probes.js        # list_runtime_probes (NEW)
    gate-list-verified.js      # list_verified_claims (NEW)

    # Workflow namespace (orchestration)
    workflow-classify-prompt.js      # classify user prompt into 8 categories
    workflow-intake-orient.js        # index-first + meta-trigger + observation scan
    workflow-intake-plan.js          # candidate extraction + verification classify
    workflow-request-runtime-gate.js # structured runtime approval request
    workflow-convert-evidence.js     # evidence MD → experiment YAML
    workflow-report-phase.js         # orthogonal process/experiment status
    workflow-generate-prompt.js      # return constrained prompt from blueprint
    workflow-product-build.js        # expand request into assertions/risks/experiments
    workflow-runtime-probe.js        # plan runtime probe experiment
```

### Namespace Rules

| Prefix | Purpose | Example |
|--------|---------|---------|
| `gate_*` | Enforcement, validation, state management | `gate_validate_records`, `gate_check` |
| `workflow_*` | Process orchestration, multi-step guidance | `workflow_intake_orient`, `workflow_request_runtime_gate` |

Agent rule: if the task is "check something" or "write something" → use `gate_*`. If the task is "what do I do next" → use `workflow_*`.

---

## Tool Specifications

### Workflow Tools (New)

#### `workflow_classify_prompt`
Classify user prompt into 8 categories from operator guide §Agent Intake Flow.

```
Input:  { prompt: string }
Output: { category: "evidence" | "assertion" | "verification" | "product" | "observation" | "skip" | "external_decision" | "self_improvement",
          confidence: "high" | "medium" | "low",
          suggested_tools: string[] }
```

#### `workflow_intake_orient`
Perform index-first orientation, meta-trigger scan, capability-dir scan, observation read.

```
Input:  { category: string, capability?: string, scope?: string }
Output: { index_entries: { id, topic_tag, dimension, status }[],
          meta_triggers: { file, guidance }[],
          observations: { id, status, description }[],
          capability_files: { path, relevance }[],
          missing_decisions: string[] }
```

#### `workflow_request_runtime_gate`
Generate structured approval request for runtime commands.

```
Input:  { dimension: "install" | "runtime",
          scope: "sandbox" | "production",
          output_level: "metadata-only" | "sample-output" | "runtime-captured",
          command_class: string,
          temp_root_class: string,
          evidence_missing: string[],
          why_local_insufficient: string }
Output: { approval_request: string,  // formatted per operator guide protocol
          pre_checks: { budget_ok: boolean, observation_fresh: boolean },
          gate_status: "ready" | "blocked" | "needs_observation" }
```

#### `workflow_convert_evidence_to_experiment`
Evidence MD → experiment YAML (Migration or Structuring mode).

```
Input:  { evidence_path: string,
          mode: "migration" | "structuring",
          dry_run?: boolean }
Output: { experiment_yaml: string,
          validation_errors: string[],
          source_refs_linked: boolean,
          status: "draft" | "ready" }
```

#### `workflow_report_phase_status`
Orthogonal process/experiment status reporting.

```
Input:  { process_steps_total: number,
          process_steps_complete: number,
          experiment_result: "supports" | "does-not-support" | "inconclusive",
          blocker_reason?: string }
Output: { summary: string,  // "Process: 9/9. Experiment: inconclusive (vendor gate)."
          lifecycle_complete: boolean }
```

#### `workflow_generate_prompt`
Return constrained prompt object from blueprint. The agent consumes this object directly — no file artifact, no template placeholders.

```
Input:  { blueprint: "evidence" | "experiment" | "product-build" | "state-gated" | "runtime-validation",
          context: object }
Output: { prompt: string,                    // The actual prompt text
          prompt_type: string,               // Same as input blueprint
          constraints: string[],             // Hard constraints for next step
          required_records: string[],        // Records that must exist first
          suggested_tools: string[],         // Advisory: next tools to call
          budget_context?: {                 // If state-gated
            system: string,
            resource: string,
            remaining: number
          },
          approval_gates: string[] }         // Gates that must be open
```

**Pattern:** Agent calls `workflow_generate_prompt` → evaluates `constraints` + `budget_context` + `approval_gates` → calls next tool with `prompt` embedded in arguments. No automatic chaining; agent decides at each step.

#### `workflow_intentional_skip`
Handle user request to skip a required assertion. Converts skipped knowledge into structured loop artifacts.

```
Input:  { assertion_id: string,
          skip_reason: string,
          scope: string }
Output: { status: "blocked" | "narrowed" | "accepted",
          records_required: string[],    // index entry, risk, decision, capability updates
          blocked_work: string[],        // what the agent must NOT do now
          allowed_work: string[],        // what the agent MAY do instead
          rationale: string }
```

**Rule:** Do not let skipped knowledge disappear. Convert into records-side status, active blocking risk, narrowed decision boundary, or capability text showing blocked execution.

#### `workflow_verify_evidence_execution`
Verify whether all assertions in an evidence document can execute technically. Treats as verification request, not direct execution.

```
Input:  { evidence_path: string,
          verification_depth: "symbol-exists" | "import-succeeds" | "method-callable" | "sample-output" | "full-runtime" }
Output: { assertion_matrix: { section: string, assertion: string, verification_class: string, status: string }[],
          executable_count: number,
          blocked_count: number,
          skipped_snippets: { reason: string, line_range: string }[],
          required_approvals: string[] }
```

**Rule:** Separate execution classes (symbol exists → import succeeds → method callable → sample call returns output → output schema matches → business behavior correct). Classify snippets as illustrative-only, static-verifiable, import-verifiable, runtime-verifiable, or blocked pending approval.

#### `workflow_external_decision`
Process user-provided outside confirmation as decision input, not complete proof.

```
Input:  { source: string,           // who confirmed
          authority_scope: string,  // what authority
          confirmed_scope: string,  // what exact scope
          remaining_blocks: string[] }
Output: { acceptance: "partial" | "full" | "rejected",
          records_required: string[],  // evidence note, assertions, risks, decision_effect
          risks: string[],             // authority, scope, durability, expiry risks
          capability_boundaries: string[],
          rationale: string }
```

**Rule:** External confirmation seeds a decision; the loop still records scope, basis, risks, and boundaries.

#### `workflow_self_improvement`
Handle loop self-improvement requests. Creates improvement experiments under existing governance.

```
Input:  { improvement_type: "schema-change" | "doc-change" | "workflow-gap" | "tool-gap",
          description: string,
          proposed_changes: object }
Output: { experiment_candidate: object,    // experiment record draft
          decision_required: boolean,       // whether schema/doc changes need decision
          risks: string[],
          next_steps: string[],
          canonical_adoption_path: string }
```

**Rule:** Hard-test failures become evidence. Self-improvement experiments may propose schema/doc changes. Canonical adoption requires explicit decision approval. Runtime output does not become a decision; a decision approves what runtime output may be captured.

### Gate Tools (New — from Scout Report)

See `plans/reports/agentize-scout-260521-mcp-candidates.md` §3 for full specs. Priority order:

| P | Tool | Why |
|---|------|-----|
| P1 | `gate_validate_records` | Most frequent agent operation; replaces console error parsing |
| P1 | `gate_update_claim_verification` | Complex CLI args; safety from structured enums + dry-run |
| P2 | `gate_extract_index_entries` | Core loop operation; explicit control beyond workflow trigger |
| P2 | `gate_search_index_entries` | Frequent read query; replaces Bash JSON parsing |
| P3 | `gate_generate_capability_records` | Build-step; structured drift output |
| P3 | `gate_list_runtime_probes` | Simple; nice-to-have |
| P4 | `gate_list_verified_claims` | Reporting; replaces yq dependency |

---

## What Gets Encoded as Learning-Loop Artifacts

| Source Content | Artifact Type | Location |
|---------------|--------------|----------|
| Verification dimensions table | Index entries | `records/index/assertion-loop-verification-{dimension}.yaml` |
| Governance model (two tiers) | Decision record | `records/decisions/decision-loop-governance-boundary.yaml` |
| "What the loop is not" | Risk records | `records/risks/risk-loop-misuse-{category}.yaml` |
| Agent intake flow (13 steps) | Capability + meta evidence | `records/capabilities/capability-loop-agent-intake.yaml` + `records/evidence/meta/agent-intake-protocol.md` |
| Operator cards | Capability records | One `capability-*` per card |
| Experiment result convention | Index entry | `records/index/assertion-loop-convention-result.yaml` |
| Agent anti-confusion checklist | Meta evidence | `records/evidence/meta/agent-confusion-patterns.md` |
| Rule origins (Q4 E, Q5 R2, Q6) | Index entries | `records/index/assertion-loop-rules-{q}.yaml` |
| Evidence Findings Convention | Meta evidence (`## Findings`) | `records/evidence/meta/evidence-findings-convention.md` |
| Resource Budget procedural rules | Meta evidence (`## Findings`) | `records/evidence/meta/resource-budget-procedural-rules.md` |
| Capability Generation extension | Meta evidence (`## Findings`) | `records/evidence/meta/capability-generation-extension.md` |
| Live Gate template | Meta evidence (`## Findings`) | `records/evidence/meta/live-gate-template.md` |

**Meta evidence format rule:** All meta evidence files use `## Findings` with `[topic-tag]` bullets for machine extraction. Narrative sections (`## Observation`, `## Evidence`, `## Trigger`, `## Deferral`) are supplementary, not replacements. Frontmatter required: `capability`, `dimension`, `scope`, `validation_status`.

---

## What Stays in Operator Guide

After encoding, the guide keeps only what cannot be mechanical:

| Section | Action |
|---------|--------|
| Philosophy (why the loop exists, three pillars) | Keep — reasoning framework |
| "What the loop is not" | Keep — but summarize; risks encode the details |
| How to reason with the loop | Keep — judgment, not procedure |
| Governance model | Keep — high-level; decision record has details |
| Record naming conventions | Move to `records/evidence/meta/naming-conventions.md` with `## Findings` |
| State query protocol | Replace with `gate_search_index_entries` + `gate_extract_index_entries` |
| Evidence model | Encode as capability record + schema |
| Adding/updating records procedure | Replace with workflow tools |
| Approval flow | Encode as decision record template |
| Resource budget | Keep overview; details in observation schema + `gate_check` |
| Write domain rules | Keep — hook reference; but agent uses tools, not manual rules |
| Workflow auto-trigger | Keep — config reference |
| MCP tools table | Replace with auto-generated tool list from server |
| Runtime validation protocol | Replace with `workflow_request_runtime_gate` |
| Runtime artifact standard | Encode as capability record |
| Agent intake flow (13 steps) | **Delete** — fully encoded in workflow tools |
| Operator cards | **Delete** — encoded as workflow tools |
| Experiment result convention | Encode as index entry |
| Evidence-MD to Experiment-YAML conversion | Replace with `workflow_convert_evidence_to_experiment` |
| Phase success criteria | Replace with `workflow_report_phase_status` |
| Rule origins | Encode as index entries |
| Agent anti-confusion checklist | Encode as meta evidence |

**Target size:** ~600 lines → ~120 lines (philosophy + reasoning + exceptions).

---

## Implementation Considerations

### 1. Write Gate Allowlist (CRITICAL)

`records/index/**` and `records/capabilities/**` are NOT in the write gate allowlist. They hit catch-all `**` → blocked.

**Fix:** Add both paths with observation requirement (same model as `records/evidence/**`).

### 2. Tool Registry Pattern

DIY registry avoids server size explosion without new dependencies.

```javascript
// tool-registry.js — ~20 lines
export function createTool(name, description, schema, handler) { ... }
export function registerTools(server, tools, logAction) { ... }
```

Each tool: ~30 lines. Server: ~50 lines. Total: ~280 lines vs 800+ inline.

### 3. Audit Trail

All tools log to shared `gate-log.jsonl`. Already has rotation (10 MB, 5 backups).

### 4. Partial Failure Pattern

Standardize: `{ success: boolean, complete: boolean, errors: string[], result: object }`

### 5. pnpm Command Integration

Workflow tools do NOT replace pnpm commands. They guide the agent on WHEN and WHY to run them:

| pnpm Command | Workflow Tool Relationship |
|---|---|
| `pnpm extract:index` | Agent runs after `workflow_intake_orient` or evidence changes; triggered by `notify_artifact_change` auto-workflow |
| `pnpm validate:records` | Agent runs after record changes; `gate_validate_records` provides structured error output |
| `pnpm check` | Agent runs as final validation step; combines `validate:records`, `generate:capabilities --dry-run`, and other checks |
| `pnpm check:budget` | `gate_check` calls equivalent logic; agent may run pnpm variant for CLI debugging |
| `pnpm generate:capabilities` | Agent runs after product surface changes; `gate_generate_capability_records` provides drift detection |

Workflow tools return guidance; pnpm commands perform work. The agent uses both.

### 6. Fallback Mechanism During Transition

If a workflow tool returns incomplete or unexpected results, the agent falls back to the operator guide by:

1. Checking the tool's `gate_status` field — `"blocked"` or `"needs_observation"` means stop and consult guide
2. Comparing tool output against the `required_records` list — missing records indicate incomplete intake
3. Using `workflow_generate_prompt` with `blueprint: "state-gated"` to get constrained next-step guidance

The operator guide remains the authoritative fallback until all 13 intake steps have verified tool coverage.

### 7. Testing Strategy

Each workflow tool gets a `.test.js` file following the existing gate tool pattern:

```
tools/constraint-gate/tools/
  workflow-classify-prompt-tool.js
  workflow-classify-prompt-tool.test.js
  workflow-intake-orient-tool.js
  workflow-intake-orient-tool.test.js
  ...
```

Tests validate: input schema rejection, happy-path output shape, error handling, and edge cases (empty input, malformed input, missing records). Tests run with `pnpm test` alongside existing gate tool tests.

### 8. Rich Descriptions

MCP tool descriptions are the agent's primary documentation. Each description must state: what it does, when to use, what it returns, failure modes.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent confuses `gate_*` vs `workflow_*` | Medium | Clear naming + descriptions; gate = check/write, workflow = what do I do next |
| Server size growth | Low | Registry pattern caps at ~280 lines |
| Tool description quality | Medium | Descriptions are deliverable; poor descriptions = poor agent behavior |
| Migration of operator guide content | Low | Incremental — encode one section, test, then delete from guide |
| Two schema languages | Avoided | AJV for YAML record schemas; Zod already in use for MCP tool input schemas. No new schema language needed. |
| Workflow tools become too opinionated | Medium | Workflow tools suggest, agent decides; descriptions state "agent may override" |

---

## Integration Test Scenario

**Test name:** `agent-completes-intake-lifecycle`

**Setup:** Fresh agent session, cleared context, no operator-guide.md access.

**Input prompt:** "I want to verify that the vnstock install works in a fresh sandbox and then build a product capability on top of it."

**Expected agent behavior (without opening operator-guide.md):**

1. Calls `workflow_classify_prompt` → receives category "product" with suggested tools
2. Calls `workflow_intake_orient` → receives index entries for `vnstock-data`, meta triggers, observations, capability files
3. Reads observation records for resource budget state
4. Calls `workflow_request_runtime_gate` → receives structured approval request for sandbox install
5. After operator approval, runs approved install in temp directory
6. Calls `workflow_convert_evidence_to_experiment` → produces experiment YAML from evidence MD
7. Calls `workflow_report_phase_status` → reports process steps + experiment outcome
8. Calls `gate_validate_records` → validates all authored records
9. Calls `gate_extract_index_entries` → regenerates index from evidence
10. Derives capability records only after index entries verified for install dimension

**Pass criteria:** All 10 steps complete without agent opening `docs/operator-guide.md`. Agent may reference `docs/philosophy.md` for reasoning.

## Success Metrics

1. **Agent autonomy:** Agent completes full intake→experiment→capability lifecycle without opening operator-guide.md
2. **Guide shrinkage:** Operator guide <120 lines
3. **Tool coverage:** All 13 intake steps have corresponding MCP tool or template
4. **Card coverage:** All operator cards have corresponding workflow tool
5. **Blueprint coverage:** All prompt blueprints callable via `workflow_generate_prompt`
6. **Meta evidence format:** All meta evidence files (existing + new) use `## Findings` with `[topic-tag]` bullets + frontmatter

---

## Gaps Identified (Post-Analysis)

Comparing the brainstorm plan against the current `docs/operator-guide.md`, two gaps surfaced. These are addressed below; a third gap (seven operator cards without corresponding workflow tools) is deferred for separate discussion.

### Gap 1: Evidence Findings Convention Not Explicitly Encoded

The `## Findings` syntax rules in operator-guide.md (lines 71-80) are procedural knowledge that `gate_extract_index_entries` depends on, yet the brainstorm's artifact encoding table does not list them:

- `[topic-tag]` prefix format on each top-level bullet
- `Context:` nested prefix → index entry `context` field
- `Caveat:` nested prefix → index entry `caveats` array
- Required frontmatter fields (`capability`, `dimension`, `scope`, `validation_status`) for extraction to be attempted
- Silent-skip behavior when `## Findings` is missing or has no tagged bullets

**Resolution:** Encode as `records/evidence/meta/evidence-findings-convention.md` with `## Findings` using `[topic-tag]` bullets. Each bullet states one syntax rule. `Context:` nested bullets explain why the rule exists. `Caveat:` nested bullets note exceptions. Include frontmatter with `capability: meta`, `dimension: static`, `scope: meta-tooling`, `validation_status: passed`. Add a cross-reference in `gate_extract_index_entries` tool description pointing to this file.

### Gap 2: Resource Budget Procedural Rules Beyond "Overview"

The brainstorm says "Keep overview; details in observation schema + `gate_check`". But operator-guide.md lines 104-133 contain ~30 lines of procedural rules not captured in any schema:

- **How It Works** (4-step flow: budget observation → check tool → skill gating → operator-only writes)
- **Key Rules** (6 bullets: plans MUST declare budget, any check failure = STOP, post-action operator confirmation, validation window semantics, guard/gate blocking chain rule)
- **Validation window**: no state-changing actions between clearance and final report
- **Dependency chain rule**: trace full chain back to resource budgets before attempting workarounds; if chain ends at exhausted budget, report immediately

The observation schema stores state (`budget`, `current`, `last_verified`), not procedure.

**Resolution:** Encode procedural rules as `records/evidence/meta/resource-budget-procedural-rules.md` with `## Findings` using `[topic-tag]` bullets. One bullet per rule (budget declaration, check failure = STOP, operator confirmation, validation window, dependency chain trace). Include frontmatter with `capability: meta`, `dimension: static`, `scope: governance`, `validation_status: passed`. Keep a one-line overview in the shrunk guide pointing to this file. Embed the 4-step flow and 6 key rules in `gate_check` tool description as constraints the agent must evaluate.

### Gap 3: Seven Operator Cards Without Corresponding Workflow Tools

The brainstorm originally defined workflow tools for only 2 of 9 operator cards (Product Build Request, Runtime Probe Experiment). The remaining 7 cards need solutions.

**Pattern analysis** across the 7 cards reveals three patterns:

| Pattern | Cards | Nature |
|---------|-------|--------|
| A. Prompt-classifiable situations | Intentional Skip, Evidence Doc Verification, External Decision, Self-Improvement | User says something specific → agent follows a decision tree |
| B. Reference knowledge | Stacks/Locations, Capability Generation | Data model + procedure the agent consults when needed |
| C. Template/procedure | Adding a New Live Gate | Multi-step template for creating a system component |

**Solutions:**

| Card | Solution | Artifact Path / Tool Name |
|------|----------|---------------------------|
| Stacks and Capability Locations | Embed table in tool descriptions | (none — inline in `gate_generate_capability_records` + `workflow_runtime_probe`) |
| Capability Generation | Meta evidence (`## Findings`) | `records/evidence/meta/capability-generation-extension.md` |
| Adding a New Live Gate | Meta evidence (`## Findings`) | `records/evidence/meta/live-gate-template.md` |
| Intentional Skip Pattern | **Workflow tool** | `workflow_intentional_skip` |
| Evidence Doc Execution Verification | **Workflow tool** | `workflow_verify_evidence_execution` |
| External/User-Provided Decision Input | **Workflow tool** | `workflow_external_decision` |
| Self-Improvement Flow | **Workflow tool** | `workflow_self_improvement` |

**Why 4 workflow tools + 2 meta evidence files (not 7 workflow tools):**

- Pattern A cards (4) map to `workflow_classify_prompt` categories. The classifier tells the agent which tool to call. Each has a distinct decision tree and output shape — unification would bloat the tool description.
- Pattern B cards (2) are reference knowledge, not processes. A workflow tool that returns a lookup table adds indirection without value.
- Pattern C (1) is a template, not a branching decision tree. The agent reads it once per gate creation.

**Simplification cascade tested:** Unifying the 4 Pattern A tools into one `workflow_reasoning_guide` with a `situation` parameter was evaluated and rejected. The agent would struggle to choose the right mode; separate tools with clear names are discoverable through classification.

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Write gate allowlist update | **Done** | `records/index/**` + `records/capabilities/**` already have observation-based auth |
| Tool registry pattern | **Done** | `tool-registry.js` exists; server already modularized |
| `gate_validate_records` | P1 | From scout report — **already implemented** |
| `gate_extract_index_entries` | P2 | From scout report — **already implemented** |
| `gate_search_index_entries` | P2 | From scout report — **already implemented** |
| `workflow_classify_prompt` | P1 | New |
| `workflow_intake_orient` | P1 | New |
| `workflow_request_runtime_gate` | P1 | New |
| `workflow_convert_evidence_to_experiment` | P2 | New |
| `workflow_generate_prompt` | P2 | New |
| Remaining gate tools | P3-P4 | From scout report |
| `workflow_intentional_skip` | P2 | New — spec added in this report |
| `workflow_verify_evidence_execution` | P2 | New — spec added in this report |
| `workflow_external_decision` | P2 | New — spec added in this report |
| `workflow_self_improvement` | P2 | New — spec added in this report |
| `records/evidence/meta/evidence-findings-convention.md` | **Done** | Created with `## Findings` + frontmatter |
| `records/evidence/meta/resource-budget-procedural-rules.md` | **Done** | Created with `## Findings` + frontmatter |
| `records/evidence/meta/capability-generation-extension.md` | **Done** | Created with `## Findings` + frontmatter |
| `records/evidence/meta/live-gate-template.md` | **Done** | Created with `## Findings` + frontmatter |
| Remaining workflow tools | P3 | New |

---

## Next Steps

1. **Plan phases** — `/ck:plan` with phases: workflow tools P1 → workflow tools P2 → remaining tools → guide shrink → integration test
2. **Add workflow tools P1** — classify_prompt, intake_orient, request_runtime_gate
3. **Add workflow tools P2** — convert_evidence, generate_prompt, intentional_skip, verify_evidence, external_decision, self_improvement
4. **Create meta evidence files** — evidence-findings-convention, resource-budget-rules, capability-generation, live-gate-template
5. **Shrink operator guide** — Remove encoded sections, keep philosophy
6. **Integration test** — Agent completes full lifecycle without opening guide

---

## Decisions (Resolved)

### Q1: Prompt Piping Design

`workflow_generate_prompt` returns a **structured prompt object**, not a file artifact or template with placeholders.

```javascript
{
  prompt: "string",              // The actual prompt text
  prompt_type: "evidence" | "experiment" | "product-build" | "state-gated" | "runtime-validation",
  constraints: ["string"],       // Hard constraints the next step must respect
  required_records: ["string"],  // Records that must exist before execution
  suggested_tools: ["string"],   // Next tools to call (advisory, not mandatory)
  budget_context: {              // If state-gated
    system: "string",
    resource: "string",
    remaining: number
  },
  approval_gates: ["string"]     // Gates that must be open before execution
}
```

**Why structured object over file artifact:** File artifacts add I/O overhead and path management. The agent already has the result in context. Constraints and metadata travel with the prompt.

**Why not automatic chaining:** The agent must make judgment calls between steps. Automatic chaining hides decision points. The `suggested_tools` array gives guidance without removing agency.

**Pattern:** `workflow_generate_prompt` → agent evaluates constraints/budget → agent calls next tool with prompt embedded in arguments.

### Q2: Workflow Chaining — Explicit Agent Calls

**Decision: Explicit calls.** Automatic chaining is a trap.

| Factor | Explicit | Automatic |
|--------|----------|-----------|
| Debuggability | Agent logs each decision | Hidden state machine |
| Override capability | Agent can skip/reorder | Fixed pipeline |
| Failure mode | Clear: "I chose not to call X" | Opaque: "workflow engine hung" |
| Implementation | None needed | State machine, session storage, error recovery |

### Q3: Guide Shrink — Incremental Per Phase

**Decision: Incremental.** Encode one section, test agent behavior, then delete from guide.

**Sequence:**
1. Phase 1: Add `gate_validate_records` → test → remove validation section
2. Phase 2: Add `workflow_intake_orient` + `workflow_classify_prompt` → test → remove intake flow
3. Phase 3: Add `workflow_request_runtime_gate` → test → remove runtime protocol
4. Phase 4: Add remaining tools → test → remove remaining sections

**Why not batch:** Batch risks losing knowledge if a tool underperforms. Incremental gives feedback per section. The operator guide serves as fallback during transition.
