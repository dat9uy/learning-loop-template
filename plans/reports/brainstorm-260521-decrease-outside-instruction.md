# Brainstorm Report: Decrease Outside Instruction

Date: 2026-05-21
Scope: docs/operator-guide.md → learning-loop artifacts + MCP workflow tools
Pattern: "Minimal hook, rich MCP" extended with workflow namespace

---

## Summary

The operator guide (`docs/operator-guide.md`) is ~600 lines of procedural instruction agents must read and follow manually every session. The system already mechanically enforces 6 areas (schema validation, budget checks, write auth, bash gating, inbound warnings, MCP gate tools). The remaining ~500 lines are "outside instruction" — knowledge the system has but does not drive.

Goal: encode the procedural knowledge into learning-loop artifacts (records, index entries, capabilities) and MCP workflow tools so the agent completes intake→experiment→capability lifecycle without opening the operator guide.

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

### 5. Rich Descriptions

MCP tool descriptions are the agent's primary documentation. Each description must state: what it does, when to use, what it returns, failure modes.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent confuses `gate_*` vs `workflow_*` | Medium | Clear naming + descriptions; gate = check/write, workflow = what do I do next |
| Server size growth | Low | Registry pattern caps at ~280 lines |
| Tool description quality | Medium | Descriptions are deliverable; poor descriptions = poor agent behavior |
| Migration of operator guide content | Low | Incremental — encode one section, test, then delete from guide |
| Two schema languages | Avoided | Keep AJV only; no Zod |
| Workflow tools become too opinionated | Medium | Workflow tools suggest, agent decides; descriptions state "agent may override" |

---

## Success Metrics

1. **Agent autonomy:** Agent completes full intake→experiment→capability lifecycle without opening operator-guide.md
2. **Guide shrinkage:** Operator guide <120 lines
3. **Tool coverage:** All 13 intake steps have corresponding MCP tool or template
4. **Card coverage:** All operator cards have corresponding workflow tool
5. **Blueprint coverage:** All prompt blueprints callable via `workflow_generate_prompt`

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Write gate allowlist update | Required | Add `records/index/**` + `records/capabilities/**` |
| Tool registry pattern | Required | `tool-registry.js` + modular tool files |
| `gate_validate_records` | P1 | From scout report |
| `gate_extract_index_entries` | P2 | From scout report |
| `gate_search_index_entries` | P2 | From scout report |
| `workflow_classify_prompt` | P1 | New |
| `workflow_intake_orient` | P1 | New |
| `workflow_request_runtime_gate` | P1 | New |
| `workflow_convert_evidence_to_experiment` | P2 | New |
| `workflow_generate_prompt` | P2 | New |
| Remaining gate tools | P3-P4 | From scout report |
| Remaining workflow tools | P3 | New |

---

## Next Steps

1. **Plan phases** — `/ck:plan` with phases: registry scaffold → gate tools → workflow tools → guide shrink → integration test
2. **Write gate allowlist** — Add `records/index/**` + `records/capabilities/**` with observation requirement
3. **Implement registry** — `tool-registry.js` + refactor existing tools into modular files
4. **Add gate tools P1-P2** — validate_records, extract_index, search_index
5. **Add workflow tools P1** — classify_prompt, intake_orient, request_runtime_gate
6. **Add remaining tools** — Per priority order
7. **Shrink operator guide** — Remove encoded sections, keep philosophy
8. **Integration test** — Agent completes full lifecycle without opening guide

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
