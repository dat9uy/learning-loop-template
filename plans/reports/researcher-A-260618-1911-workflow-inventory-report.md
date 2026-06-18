# Workflow Tools Inventory — Researcher A

**Date:** 2026-06-18 19:11
**Scope:** 8 workflow tools under `tools/learning-loop-mcp/tools/`
**Author:** Researcher A (general-purpose)
**Purpose:** Per-file schema/state/IO inventory for downstream Phase D planner decisions

---

## Summary Table

| # | Tool | Exported Name | Steps | stateSchema (Q1) | FS I/O | Runtime I/O |
|---|------|---------------|-------|-----------------|--------|-------------|
| 1 | `workflow-intake-orient-tool.js` | `workflow_intake_orient` | Single (one orient call) | **Real** (reads YAML dirs + jsonl) | Yes — `records/*/index`, `records/*/capabilities`, `records/*/decisions`, `records/evidence/*`, `runtime-state.jsonl` | No |
| 2 | `workflow-intake-plan-tool.js` | `workflow_intake_plan` | Multi (1..N steps in returned array) | **Thin** (pure transform of orient input) | No | No |
| 3 | `workflow-classify-prompt-tool.js` | `workflow_classify_prompt` | Single (one classification) | **Thin** (keyword match → category) | No | No |
| 4 | `workflow-prepare-runtime-request-tool.js` | `workflow_prepare_runtime_request` | Single (one approval text) | **Thin** (template + boolean checks) | No | No |
| 5 | `workflow-self-improvement-tool.js` | `workflow_self_improvement` | Single (one experiment record) | **Thin** (lookup table → fixed path) | No | No |
| 6 | `workflow-intentional-skip-tool.js` | `workflow_intentional_skip` | Single (one skip decision) | **Thin** (string match → status) | No | No |
| 7 | `workflow-report-phase-status-tool.js` | `workflow_report_phase_status` | Single (one status report) | **Thin** (boolean calc → status) | No | No |
| 8 | `workflow-runtime-probe-tool.js` | `workflow_runtime_probe` | Single (one probe plan) | **Thin** (lookup table → plan string) | No | No |

**Totals:** 8 tools — 1 real-state (orient), 7 thin (pure compute). 1 multi-step (intake_plan), 7 single-step. 1 has filesystem I/O (orient), 7 are pure transforms.

---

## Per-File Deep-Dive

### 1. `workflow-intake-orient-tool.js`

**Exported name:** `workflowIntakeOrientTool` (MCP name: `workflow_intake_orient`)

**inputSchema (raw):**
```js
schema: {
  root: z.string().optional().describe("Project root directory (default: auto-detected)"),
  category: z.string().optional().describe("Filter index entries by dimension or capability substring"),
  capability_scope: z.string().optional().describe("Filter capability files by stack or id substring"),
}
```

**Output shape** (from handler return):
```js
{
  index_entries: [{ filename, ...doc }],     // filtered YAML docs from records/*/index
  meta_triggers: [filename, ...],            // filenames from records/evidence/meta + records/<surface>/evidence
  observations: [...],                        // observation-shaped objects from runtime-state.jsonl
  capability_files: [id|filename, ...],       // filtered capabilities list
  missing_decisions: [id, ...],               // product index entries with no matching decision file
}
```

**Step count:** Single step (one orient call returns the full overview).

**External I/O / side-effects:**
- Reads `records/index` and `records/<surface>/index` for every surface in `SURFACES = ["meta", "vnstock", "fastapi", "tanstack", "product"]`.
- Reads `records/capabilities` and `records/<surface>/capabilities`.
- Reads `records/decisions` and `records/<surface>/decisions`.
- Reads `records/evidence/meta` and `records/<surface>/evidence`.
- Imports `#mcp/core/file-readers.js` to call `readRuntimeObservations(root)` — reads `runtime-state.jsonl`.
- Calls `resolveRoot(args.root)` from `#lib/resolve-root.js` for auto-detection.
- **No writes.** All I/O is read-only.

**stateSchema classification (Q1):** **Real** — owns cross-surface record state, resolves root, fans out across 5 surfaces, reads evidence + runtime-state. Output is a snapshot of the project's record landscape.

**Filesystem dependencies:**
- `records/index/`, `records/{surface}/index/` (YAML, `.yaml`/`.yml`)
- `records/capabilities/`, `records/{surface}/capabilities/` (YAML)
- `records/decisions/`, `records/{surface}/decisions/` (file listing only)
- `records/evidence/meta/`, `records/{surface}/evidence/` (file listing)
- `runtime-state.jsonl`
- `#lib/resolve-root.js`, `#mcp/core/file-readers.js` (module imports)

---

### 2. `workflow-intake-plan-tool.js`

**Exported name:** `workflowIntakePlanTool` (MCP name: `workflow_intake_plan`)

**inputSchema (raw):**
```js
schema: {
  orient_result: z.preprocess(stripEnvelope, z.object({
    index_entries: z.array(z.object({}).passthrough()).optional(),
    meta_triggers: z.array(z.string()).optional(),
    observations: z.array(z.object({}).passthrough()).optional(),
    capability_files: z.array(z.string()).optional(),
    missing_decisions: z.array(z.string()).optional(),
  })).describe("Output object from workflow_intake_orient"),
}
```

**Output shape** (from handler return):
```js
// blocked case
{ status: "blocked", steps: [], message: "No verification candidates found" }
// ready case
{ status: "ready", steps: [
    { step_number, action, record_id, verification_type, suggested_tool?, questions: [...] },
    ...
]}
```
`action` ∈ `{"read_record", "review_meta_trigger", "ask_decision", "reactivate_observation"}`.
`verification_type` ∈ `{"static", "import", "runtime", "product"}`.

**Step count:** **Multi** — emits one step per `index_entry` + one per `meta_trigger` + one per `missing_decision` + optionally one for inactive observations.

**External I/O / side-effects:** None. Imports only `core/envelope-stripper.js` for input normalization. No filesystem, no network, no subprocess.

**stateSchema classification (Q1):** **Thin** — pure transform. Takes orient output, classifies verification type per entry, returns an ordered plan. No persistent state.

**Filesystem dependencies:** None. Single dependency is `../core/envelope-stripper.js`.

---

### 3. `workflow-classify-prompt-tool.js`

**Exported name:** `workflowClassifyPromptTool` (MCP name: `workflow_classify_prompt`)

**inputSchema (raw):**
```js
schema: {
  prompt: z.string().describe("The user prompt text to classify"),
}
```

**Output shape** (from handler return):
```js
{ category, confidence, suggested_tools: [string, ...] }
// category ∈ CATEGORIES = ["evidence", "assertion", "verification", "product", "observation", "skip", "external_decision", "self_improvement"]
// or default "skip" if no keyword hits
```

**Step count:** Single (one classification).

**External I/O / side-effects:** None. Pure function over `prompt` string.

**stateSchema classification (Q1):** **Thin** — keyword heuristic scoring. `confidence = Math.min(1.0, hits * 0.5)`. No external state.

**Filesystem dependencies:** None.

---

### 4. `workflow-prepare-runtime-request-tool.js`

**Exported name:** `workflowPrepareRuntimeRequestTool` (MCP name: `workflow_prepare_runtime_request`)

**inputSchema (raw):**
```js
schema: {
  dimension: z.string().describe("Verification dimension (e.g., install, runtime, product)"),
  scope: z.string().describe("Execution scope (e.g., sandbox, local, production)"),
  output_level: z.string().describe("Expected output granularity (e.g., pass/fail, summary, full)"),
  command_class: z.string().describe("Command category (e.g., setup, test, deploy)"),
  temp_root_class: z.string().describe("Temp root disposition (e.g., disposable, ephemeral, persistent)"),
  evidence_missing: z.boolean().describe("Whether required evidence has not yet been collected"),
  why_local_insufficient: z.string().describe("Explanation why local/static verification is insufficient"),
}
```

**Output shape** (from handler return):
```js
{
  approval_request: "=== Runtime Command Approval Request ===\n...multiline string...",
  pre_conditions: [
    { name, pass, reason },
    ...
  ]  // 4 fixed entries: evidence_present, observation_active, temp_root_safe, command_allowed
}
```

**Step count:** Single (one approval text + checklist).

**External I/O / side-effects:** None. Pure formatting. The output explicitly states "This tool does NOT approve commands; always run check_gate before execution."

**stateSchema classification (Q1):** **Thin** — template + boolean checks. No persistent state.

**Filesystem dependencies:** None.

---

### 5. `workflow-self-improvement-tool.js`

**Exported name:** `workflowSelfImprovementTool` (MCP name: `workflow_self_improvement`)

**inputSchema (raw):**
```js
schema: {
  improvement_type: z.enum(["schema-change", "workflow-gap", "heuristic-tune", "tool-addition"]).describe("Type of improvement"),
  description: z.string().describe("Human-readable description of the improvement"),
  proposed_changes: z.preprocess(stripEnvelope, z.array(z.string())).optional().describe("List of proposed changes"),
}
```

**Output shape** (from handler return):
```js
{
  experiment_candidate: string,        // from CANDIDATES lookup
  decision_required: true,             // hard-coded
  risks: [string, string],              // 2 fixed risk strings
  next_steps: ["draft experiment record", "seek operator approval", "run validation"],
  canonical_adoption_path: string,     // from CANDIDATES lookup
  description: args.description,
  proposed_changes: args.proposed_changes || [],
}
```

**Step count:** Single (one experiment record).

**External I/O / side-effects:** None. Imports only `core/envelope-stripper.js`.

**stateSchema classification (Q1):** **Thin** — fixed lookup table. `CANDIDATES` is a 4-entry static map. No persistent state, no I/O.

**Filesystem dependencies:** None.

---

### 6. `workflow-intentional-skip-tool.js`

**Exported name:** `workflowIntentionalSkipTool` (MCP name: `workflow_intentional_skip`)

**inputSchema (raw):**
```js
schema: {
  assertion_id: z.string().describe("Identifier of the assertion being skipped"),
  skip_reason: z.string().describe("Human-readable reason for the skip"),
  scope: z.string().describe("Scope or risk class of the assertion"),
}
```

**Output shape** (from handler return):
```js
{
  status: "blocked" | "narrowed" | "accepted",
  records_required: [string],         // 1 fixed entry naming the skipped assertion
  blocked_work: [string],             // assertion_id (if blocked) else []
  allowed_work: [string],             // continuation hints
  rationale: string,                  // human-readable
}
```

**Step count:** Single (one skip decision).

**External I/O / side-effects:** None. Pure branching on `(skip_reason, scope)` strings.

**stateSchema classification (Q1):** **Thin** — string-match decision tree. `decideStatus` is a 3-branch conditional. No persistent state.

**Filesystem dependencies:** None.

---

### 7. `workflow-report-phase-status-tool.js`

**Exported name:** `workflowReportPhaseStatusTool` (MCP name: `workflow_report_phase_status`)

**inputSchema (raw):**
```js
schema: {
  process_steps_total: z.coerce.number().int().min(1).describe("Total number of process steps in the phase"),
  process_steps_complete: z.coerce.number().int().min(0).describe("Number of process steps completed so far"),
  experiment_result: z.enum(["success", "failure", "inconclusive"]).describe("Result of the phase experiment"),
  blocker_reason: z.string().optional().describe("Optional reason why the phase is blocked"),
}
```

**Output shape** (from handler return):
```js
{
  status: "Process: X/Y. Experiment: <result>[(<blocker_reason>).].",
  lifecycle_complete: boolean,         // total === complete AND result !== "inconclusive" AND !blocker_reason
}
```

**Step count:** Single (one status report).

**External I/O / side-effects:** None. Pure computation.

**stateSchema classification (Q1):** **Thin** — boolean derivation. No persistent state, no I/O.

**Filesystem dependencies:** None.

---

### 8. `workflow-runtime-probe-tool.js`

**Exported name:** `workflowRuntimeProbeTool` (MCP name: `workflow_runtime_probe`)

**inputSchema (raw):**
```js
schema: {
  stack: z.string().describe("Technology stack (e.g., nodejs, python, go, rust)"),
  probe_type: z.enum(["install", "build", "test", "runtime"]).describe("Type of probe to plan"),
  temp_dir: z.string().optional().describe("Optional temporary directory for the probe"),
}
```

**Output shape** (from handler return):
```js
{
  probe_plan: "Stack: ...\nProbe type: ...\n...",   // newline-joined strings
  shared_env_requirements: [string, string],        // 2 fixed env-var requirements
  per_stack_commands: [string, ...],                // 3 commands from KNOWN lookup (or 2 for unknown stack)
  expected_outputs: [string, ...],                  // 3 expected output substrings
}
```

**Step count:** Single (one probe plan).

**External I/O / side-effects:** None. The handler explicitly does NOT execute commands — it plans them. Says "check_gate before execution".

**stateSchema classification (Q1):** **Thin** — fixed lookup table. `KNOWN` is a 4-entry static map (`nodejs`, `python`, `go`, `rust`); unknown stacks get a placeholder plan.

**Filesystem dependencies:** None.

---

## Cross-Cutting Observations

- **MCP envelope wrapping:** Every handler returns `{ content: [{ type: "text", text: JSON.stringify(...) }] }` — standard MCP content shape.
- **Error convention:** All handlers return `{ content: [...], isError: true }` on validation failure rather than throwing.
- **`stripEnvelope` usage:** Only `workflow-intake-plan` and `workflow-self-improvement` import it. Others trust input shape.
- **`resolveRoot` usage:** Only `workflow-intake-orient` resolves a project root. The other 7 tools do not need filesystem paths.
- **YAGNI/KISS verdict:** All 8 are intentionally thin. Only `intake_orient` does real I/O; the other 7 are pure transforms that could be inlined or composed.
- **DRY:** `intake_plan` consumes `intake_orient` output — this is the only meaningful composition. The other 6 are standalone.

## Unresolved Questions

1. **Q1 definition.** The task referenced "stateSchema classification per Q1" without defining Q1. I classified as **thin** if the tool has no persistent state and no I/O (pure compute), and **real** if it owns/reads persistent state. If Q1 refers to a different schema definition (e.g., a specific `stateSchema` Zod object), this classification needs to be re-run.
2. **`stripEnvelope` semantics.** Both `workflow-intake-plan` and `workflow-self-improvement` use `z.preprocess(stripEnvelope, ...)`. The function lives at `tools/learning-loop-mcp/core/envelope-stripper.js` and was not opened — confirm whether it unwraps the MCP `content[0].text` envelope to recover the inner JSON object before Zod validation. Affects step counts if unwrapping is part of the workflow.
3. **`SURFACES` list in orient.** Hard-coded to `["meta", "vnstock", "fastapi", "tanstack", "product"]` — does this need to stay in sync with a registry elsewhere, or is it the source of truth?
4. **`missing_decisions` filter.** Only flags `dimension === "product"` index entries. Is that intentional, or should other dimensions also require decision files?
5. **`classifyVerificationType` heuristics in intake-plan.** Maps `dim=="runtime"` or `scope.includes("container"|"live")` → "runtime", `dim=="install"` or `scope.includes("import")` → "import", else "static". These look like keyword probes for orient entry metadata — confirm whether `scope` and `dimension` are stable fields in the YAML index entries.
6. **`KNOWN` stack table in runtime-probe.** Only 4 stacks. Should `elixir`, `ruby`, `dotnet`, `java` be added, or is this intentionally minimal?
7. **Multi-step vs single-step criteria.** `workflow-intake-plan` is the only multi-step output. Is that the intended taxonomy, or should every tool that returns an array be considered multi-step?