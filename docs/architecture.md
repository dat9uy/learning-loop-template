<!-- level: L3 | surface: implementation -->

# Architecture

The implementation surface companion to `docs/runtime-contract.md` (L2) and `docs/loop-engine.md` (L1). Where the contract states the 4 runtime capabilities transport-agnostically, this doc shows the mechanism that realizes them today: the 3-layer architecture, the gate system, the MCP tool flow, and the meta-state self-learning loop. The engine invariant and concept vocabulary live in `docs/loop-engine.md`; this doc names the Mastra primitives, paths, and gate modules that realize them.

## 3-Layer Architecture

The learning loop is implemented across three layers. This architecture ensures core logic has zero framework imports, the Mastra shell wraps that logic in framework primitives, and the runtime interface defines the contract agent runtimes must satisfy.

```
Layer 3: Runtime Interface  (tools/learning-loop-mastra/interface/)
    |  satisfies
Layer 2: Mastra Shell       (tools/learning-loop-mastra/mastra/)
    |  wraps
Layer 1: Core               (tools/learning-loop-mastra/core/)
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Core** | `tools/learning-loop-mastra/core/` | Pure logic: meta-state, gate decisions, schema validation, fingerprint computation, drift detection. Zero `@mastra/*` imports. |
| **Mastra shell** | `tools/learning-loop-mastra/mastra/` | Wraps core in Mastra framework primitives: `server.js`, `create-loop-*.js`, `workflows/`, `agents/`, `tools/`. |
| **Runtime interface** | `tools/learning-loop-mastra/interface/` | The MCP-transport conformance checklist that agent runtimes (Claude Code, Droid CLI, Mastra Code) must satisfy. Includes a validator (`contract.js`), the formal spec (`CONTRACT.md`), and an onboarding guide (`RUNTIME_ONBOARDING.md`). The transport-agnostic contract lives at `docs/runtime-contract.md`. |

See `AGENTS.md` §1.1 for the full layer definitions and `tools/learning-loop-mastra/interface/CONTRACT.md` for the MCP-transport conformance checks.

## Constraint Gate System

The constraint gate system enforces operational boundaries on AI agent actions through a multi-layer gating architecture. It consists of inbound gates, outbound gates, an MCP server, and observation records.

### Architecture Diagram

```
Operator Message          Agent Action (Bash/Edit/Write)
       |                           |
       v                           v
[UserPromptSubmit]          [PreToolUse]
       |                           |
 inbound-state-gate        write-gate (evaluate-write-gate)
       |                    bash-coordination-gate
       |                           |
       v                           v
.last-operator-message     learning-loop-mastra MCP server
       |                    (check_gate, record_observation,
       |                     update_observation, notify_artifact_change,
       |                     trigger_workflow, validate_records,
       |                     gate_mark_preflight, workflow_*)
       |                           |
       +-----------+---------------+
                   |
              observations/
              (YAML records)
                   |
              .claude/coordination/
              workflows.json
              workflow-log.jsonl
```

### Inbound State Gate

**File:** `.claude/coordination/hooks/inbound-state-gate.cjs` (shim) → `tools/learning-loop-mastra/hooks/universal/inbound-gate.js` (universal)
**Hook Type:** `UserPromptSubmit`
**Behavior:** Soft-only (never blocks)

The inbound gate intercepts operator messages before the agent processes them. It detects state-change signals (operator reporting external state changes) and injects context reminding the agent to update observations if they are stale.

#### Flow

1. Read prompt from stdin JSON (`{ prompt: string }`)
2. Skip if prompt is empty, short (`< 10` chars), or ends with `?`
3. Detect state-change signals via regex patterns
4. Write `.last-operator-message` marker file with timestamp and prompt snippet
5. Read active observations from `records/observations/`
6. Check staleness: `(now - updated_at) > 30 minutes`
7. If stale observations found, inject `additionalContext` via `hookSpecificOutput`

#### State-Change Detection Patterns

The gate uses 10 regex patterns covering:
- Device/resource clearance (`cleared`, `removed`, `wiped`, `reset`)
- Registration/creation (`registered`, `created`, `installed`, `started`)
- State reports (`working`, `running`, `fixed`, `ready`, `done`)
- Container/service state
- Slot/device status
- Operator action reports (`did`, `finished`, `completed`)
- Environment state changes
- Explicit state-change language
- Budget/resource updates
- Direct state assertions (`the X is Y`)

#### Staleness Algorithm (Inbound)

- **Threshold:** 30 minutes (`STALENESS_THRESHOLD_MS = 30 * 60 * 1000`)
- Missing `updated_at` → stale
- Invalid `updated_at` → stale
- `(now - updated_at) > 30min` → stale

#### Output Format

When stale observations are found:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "INBOUND STATE GATE: ..."
  }
}
```

Always exits with code 0 (soft gate).

### Outbound Gates

**Files (shims → universal hooks):**
- `.claude/coordination/hooks/bash-coordination-gate.cjs` (wrapper → `tools/learning-loop-mastra/hooks/universal/bash-gate.js`)
- `.claude/coordination/hooks/write-coordination-gate.cjs` (wrapper → `tools/learning-loop-mastra/hooks/universal/write-gate.js`)
- `.factory/coordination/hooks/bash-coordination-gate.cjs` (wrapper → `tools/learning-loop-mastra/hooks/universal/bash-gate.js`)
- `.factory/coordination/hooks/write-coordination-gate.cjs` (wrapper → `tools/learning-loop-mastra/hooks/universal/write-gate.js`)
**Hook Type:** `PreToolUse`
**Behavior:** Hard-blocking. A block/escalation denies the call via `hookSpecificOutput.permissionDecision: "deny"` + `permissionDecisionReason` in the stdout JSON and exits 0 — the modern PreToolUse protocol, where exit 0 is required for the harness to process the JSON and surface the reason to the model. (Exit 2 would discard the stdout JSON and fall back to stderr, surfacing a generic "No stderr output" error instead of the reason.) The rich decision (matched_rule, surface, preflight_checklist, hard_block) rides in `hookSpecificOutput.additionalContext`.

Outbound gates intercept agent tool usage before execution. Claude Code and Droid CLI use shim files that delegate to the same universal hook scripts in `tools/learning-loop-mastra/hooks/universal/`; Mastra Code uses declarative `hooks.json` entries pointing at the same universal scripts. The bash gate checks commands against constraint patterns, budgets, observation staleness, and file writes to `records/**`. The write gate enforces hard blocks on protected paths and delegates `product/**` to the preflight check.

#### Bash Coordination Gate Flow

1. Read tool input from stdin JSON
2. Skip if tool is not `Bash`
3. Match command against constraint patterns (splits on `;`, `&`, `|` — quote-aware; strips message flags and `node -e|--eval` bodies before regex matching)
4. Detect file writes to `records/**` via redirects (`>`, `>>`), heredocs (`<<`), and `tee`
5. Check resource budgets (global)
6. Check for active observation matching constraint or write-path
7. Check observation staleness relative to last operator message
8. Check promoted rules from meta-state registry; skip any rule overridden via `gate_override`
9. Escalate, block, or allow
10. Append decision to per-surface `.gate-decision.log` (decision visibility)

#### Write Coordination Gate Flow

The universal write hook (`write-gate.js`) is a thin I/O adapter; all policy lives in `core/evaluate-write-gate.js`, a rule-registry cascade. The matched rule decides the outcome:

1. Read tool input from stdin JSON; normalize tool name; extract file path. Skip if not a write tool or no file path.
2. Resolve project root; compute the relative path.
3. Match the relative path against the rule registry in order:
   - `records/**` → block (use MCP tools to create/update records)
   - `runtime-state.jsonl` → block (use `runtime_state_record` MCP tool)
   - `meta-state.jsonl` → block (use `meta_state_*` MCP tools)
   - `file-index.jsonl` → block (use `meta_state_refresh_file_index` MCP tool)
   - `schemas/**` → block
   - `**/node_modules/**`, `**/dist/**`, `**/build/**` → block
   - `.loop-preflight-*` markers → block (use `gate_mark_preflight` MCP tool)
   - `product/**` → delegate to `evaluatePreflight` (preflight checklist; surface inferred from path)
   - no match → apply promoted-rules check (escalate if a promoted rule fires)
4. No matched rule and no promoted-rule escalation → allow.

`product/**` is a special case: the write gate does not hard-block it outright. It delegates to the preflight check, which verifies the operator completed the preflight checklist for that surface (see `gate_mark_preflight`). This is the seam named in `core/evaluate-write-gate.js`.

#### Write-Path Observations

A `write-path` observation unlocks writes to otherwise blocked `records/**` paths:

- `constraint_type`: `write-path`
- `constraint`: `records-evidence` (unblocks `records/evidence/**` and `records/*/evidence/**`)

The bash gate detects file writes via shell patterns and requires a matching `write-path` observation for `records/evidence/**` or `records/*/evidence/**`. The write gate checks `write-path` observations before applying hard blocks. Both gates reuse the same staleness algorithm.

#### Staleness Algorithm (Outbound)

- **Comparison:** marker timestamp > observation updated_at
- No marker → not stale
- Missing `updated_at` → stale
- Invalid timestamps → not stale (fail-open)
- Marker newer than observation → stale

This algorithm differs from the inbound gate's 30-minute threshold. See Known Issues (F2).

### MCP-Tool Write-Authorization Layer (R2 + Path Containment)

Distinct from the bash/write gates above (which gate agent *shell commands* and tool calls), the MCP tools themselves carry a second write-authorization layer that gates every write an MCP tool performs during `execute`. This layer is the single authorization point for MCP-tool writes; the bash/write gates do not see inside tool execution.

**Files:**
- `tools/learning-loop-mastra/mastra/with-r2-gate.js` — `withR2Gate` wrapper applied to every tool via `createLoopTool`
- `tools/learning-loop-mastra/core/identity-pin.js` — `pinRuntimeIdAtBoot()`, first statement of `mastra/server.js`
- `tools/learning-loop-mastra/core/path-containment.js` — `resolveSafePath` (LIM-4 realpath containment)
- `.loop/r2-allowlist.json` — per-runtime own/deny + universal ownership table

**Behavior:**
1. At server boot, `pinRuntimeIdAtBoot()` reads `process.env.LOOP_SURFACE` (set via the `env` field of each runtime's `mcp.json`), validates it against the supported surfaces, and freezes the runtime id for the process lifetime (no setter exported).
2. Each MCP tool's `execute` is wrapped by `withR2Gate`. For every declared write-path (`pathFields` in `tools/manifest.json`), the gate resolves the path via `resolveSafePath` and checks ownership against `.loop/r2-allowlist.json` (per-runtime own/deny plus universal entries).
3. `validateToolManifest` runs at boot and throws if any tool lacks `pathFields`, enforcing default-deny for undeclared write paths.
4. `resolveSafePath` realpath-resolves user paths and rejects traversal, symlink, and hardlink escape. It is the path-safety layer beneath the R2 gate and is also used directly at the seven audit-log/recording sites that previously used `path.join`.

Audit-log entries (`gate-decision-log.js`, `r2/denial-log.js`) assert no raw newlines and pre-resolve the recorded `path` field via realpath.

For the full gating chain, allowlist schema, and operator runbook, see `docs/security/plan-5-hardening.md`.

### Constraint Gate MCP Server

**File:** `tools/learning-loop-mastra/mastra/server.js`
**Transport:** stdio (MCP protocol)
**Tools:** 36 tools total across 5 groups — `check_gate`, `gate_override`, `gate_check_recurrence`, `gate_mark_preflight`, `runtime_state_record`, `record_observation`, `update_observation`, `notify_artifact_change`, `trigger_workflow`, `validate_records`, `update_claim_verification`, `list_runtime_probes`, `check_runtime_agnostic`, plus 11 workflow tools (`workflow_*`) and 16 meta-state tools (`meta_state_*`).

The MCP server provides the same gating logic as the outbound hooks but via the MCP protocol. All policy logic lives in `tools/learning-loop-mastra/core/` — single source of truth for all runtimes.

A second wired transport, the read-only CLI (`tools/learning-loop-mastra/bin/loop.mjs`), exposes the 7 read tools as stateless commands; see `docs/runtime-contract.md` for the contract (Capabilities 1+4 only; additive to MCP). A runtime that sets `LOOP_READS_VIA_CLI=1` in its `mcp.json` environment drops those seven read schemas from its own MCP `tools/list` (subset registration in `server.js`) and routes reads through the CLI while keeping MCP for writes; other runtimes keep the full surface.

#### check_gate

Returns `ok`, `block`, or `escalate` for a given command. Splits on `;`, `&`, `|` (quote-aware), strips message flags and `node -e|--eval` bodies before regex matching, then checks against constraint patterns and promoted rules. Includes `inbound_gate: true` when observations are stale relative to the last operator message.

#### gate_override

Temporarily overrides a promoted gate rule for the current session. The override is TTL'd (max 24h), audited in `runtime-state.jsonl`, and applies only to regex/glob rules enforced by the bash gate. Requires a non-empty `operator_note` for the audit trail. Reads and writes the `.gate-override` marker via `readModifyWriteOnAllSurfaces` for cross-surface consistency.

#### gate_check_recurrence

Checks the gate's decision log (`.gate-decision.log` per surface) for recurring false-positive patterns. Reads the log via `readJsonlFromAllSurfaces` for cross-surface deduplication. Groups by `rule_id` + normalized command prefix; emits a meta-state `finding` when a pattern recurs at least 3 times within 10 minutes. Threshold and window are configurable.

#### record_observation

Records a new constraint observation as a YAML file in `records/observations/`.

#### update_observation

Updates an existing observation in `records/observations/` by rewriting the YAML file with new field values.

#### notify_artifact_change

Logs an artifact change to `gate-log.jsonl`, checks observation staleness, and triggers matching workflows from the workflow registry.

#### trigger_workflow

Validates a command against an allowlist and spawns it with isolated stdio. Only `node` with a script path under `tools/` is permitted.

#### validate_records

Validates YAML records under `records/` against JSON schemas. Returns structured errors, warnings, and derived assurance failures. Use after writing records to verify correctness.

#### update_claim_verification

Updates a frozen-legacy claim's verification status for a specific dimension (`static`, `install`, `runtime`, `product`). Supports preview mode (`apply: false`) before committing.

#### list_runtime_probes

Lists runtime probe files for a given stack. Read-only discovery tool.

#### check_runtime_agnostic

Audits a feature against the 6-item runtime-agnostic checklist (core-in-universal-location, shims-in-sync, protocol-adapter-i-o, manifest-registered, cross-surface-iteration, parameterized-for-new-surfaces). Returns structured feedback with fix suggestions for each failure. Use when adding a new feature to verify the shim-not-fork + cross-surface-iteration pattern. The checklist is shared between this MCP tool and `__tests__/runtime-agnostic.test.js`.

### MCP Workflow Layer

The workflow layer auto-triggers commands when artifacts change.

#### notify_artifact_change(path, change_type)

When an agent writes an evidence file, it calls `notify_artifact_change` via MCP. The tool:

1. Appends a structured log entry to `.claude/coordination/gate-log.jsonl`
2. Reads `.claude/coordination/workflows.json` to find matching workflows
3. Checks if the artifact path and change type match any trigger rules
4. Spawns each matching command via `trigger_workflow`

#### Workflow Registry

`.claude/coordination/workflows.json` maps artifact changes to tool invocations:

```json
{
  "workflows": {
    "evidence-changed": {
      "triggers": ["records/*/evidence/**"],
      "change_types": ["created", "updated"],
      "commands": [
        ["node", "tools/validate-records-cli.js"]
      ]
    }
  }
}
```

- Commands are arrays (e.g., `["node", "tools/validate-records-cli.js"]`)
- Allowlist: only `node` with script path under `tools/` is permitted
- Spawn isolation: `{ stdio: "pipe", detached: true }` — no inherited stdout
- All CLI scripts are thin MCP stdio shims that delegate to the MCP server

#### Workflow Logs

- **Execution log:** `.claude/coordination/workflow-log.jsonl`
- **Failure marker:** `.claude/coordination/.workflow-failures`

Workflows run async (fire-and-forget). The agent continues immediately after triggering. Check `workflow-log.jsonl` for success/failure entries and `.workflow-failures` for failure markers.

### Log Rotation

`gate-log.jsonl` rotates at 10 MB, keeping 5 backups. Older backups are deleted automatically.

### Observation Records

**Directory:** `records/observations/`
**Format:** YAML files with fields:
- `id`: Unique identifier
- `constraint_type`: Type of constraint (e.g., `docker`, `sudo`)
- `constraint`: Slug describing the constraint
- `status`: `active` or `archived`
- `updated_at`: ISO 8601 timestamp
- `description`: Human-readable explanation

Observations are the single source of truth for constraint state. The agent must not assume external state matches observation records.

### Environment Variables for Testing

| Variable | Purpose |
|----------|---------|
| `GATE_ROOT` | Override project root for observation lookup |
| `GATE_MARKER_PATH` | Override path for `.last-operator-message` marker |

### Known Issues and Limitations

#### F1: Phantom Escalation — RESOLVED

The inbound gate writes the marker file **before** checking staleness. If observations are fresh, the marker is still written. This causes the outbound gate to escalate on the next constrained command even though the inbound gate did not warn.

**Impact:** Operator sends state-change message when observations are fresh → next constrained command escalates.
**Resolution (2026-05-17):** Marker write moved after staleness check in `inbound-state-gate.cjs`. Marker is only written when observations are actually stale. Verified by integration tests.

#### F2: Staleness Algorithm Divergence — RESOLVED

The inbound gate uses a **30-minute time-based threshold**. The outbound gates use **marker-vs-observation comparison** (no threshold). These can disagree:

| Scenario | Inbound (30min) | Outbound (marker>obs) |
|----------|----------------|----------------------|
| Obs 10min old, new marker | Fresh → no warning | Stale → escalate |
| Obs 3hr old, marker 24hr old | Stale → warn | Fresh → no escalate |

**Impact:** Inbound and outbound gates may make different staleness decisions.
**Resolution (2026-05-17):** Resolved as side effect of F1 fix. Since markers are only written when observations are stale (by the 30-minute threshold), a marker exists only when observations are genuinely old. The outbound gate's `markerTime > obsTime` comparison then naturally agrees with the inbound gate's assessment. No separate fix needed.

#### F3: MCP Server Staleness Check Only on `ok` — RESOLVED

The MCP server only runs `checkObservationStaleness` when `decision === "ok"`. If budget is exhausted (decision already `escalate`), the staleness check is skipped and `inbound_gate: true` is not included.

**Impact:** Budget escalation responses don't include `inbound_gate` flag.
**Resolution (2026-05-17):** Removed `decision === "ok"` guard in `server.js`. Staleness check now runs for all constraint-matched commands regardless of decision. `inbound_gate: true` is added to budget escalations when observations are stale. Existing `ok→escalate` upgrade behavior preserved.

#### F4: Data Leak Risk

The marker file stores the first 200 characters of the operator's prompt in plaintext.

**Impact:** Sensitive information in operator messages may be persisted to disk.
**Mitigation:** Store boolean flag or hash instead of raw prompt content.

#### F8: Marker TTL — RESOLVED

The marker file never expires. An operator's state-change message causes permanent escalation until the observation is manually updated.

**Impact:** Stale marker causes escalations long after the state change is irrelevant.
**Resolution (2026-05-17):** Added `MARKER_TTL_MS = 30 * 60 * 1000` (30 minutes) to `readLastOperatorMessage` in both `gate-utils.cjs` and `server.js`. Markers older than 30 minutes are treated as `null`, preventing perpetual escalation. TTL matches inbound gate's `STALENESS_THRESHOLD_MS` for consistency.

#### F11: False Positive Rate

State-change patterns are broad. Messages like "the build is broken" trigger detection even though they may not indicate an actionable state change.

**Impact:** Occasional unnecessary context injection.
**Mitigation:** Questions ending with `?` are already filtered. Further refinement of patterns may be needed.

#### F12: Race Condition — RESOLVED

`fs.writeFileSync` is non-atomic. A partial read during concurrent write causes `JSON.parse` to fail, resulting in `readLastOperatorMessage` returning `null` and the escalation being silently skipped.

**Impact:** Rare missed escalation during concurrent marker writes.
**Resolution (2026-05-21):** Replaced `fs.writeFileSync` with atomic write (write to temp + rename) in `inbound-state-gate.cjs`. No more partial read / JSON.parse failure.

#### F13: Recurring False-Positive Escalations — RESOLVED

The bash gate escalates on the same command pattern repeatedly when a promoted rule is overly broad or a constraint pattern matches benign commands. No automated detection existed; operators had to notice manually.

**Impact:** Operator fatigue from repeated escalation on the same command prefix.
**Resolution (2026-06-15):** Added `gate_check_recurrence` MCP tool and `recurrence-check-on-start` SessionStart hook. The tool reads `.gate-decision.log` across all surfaces, groups by `rule_id` + normalized command prefix, and auto-files a `finding` when a pattern recurs >= 3 times within 10 minutes. The SessionStart hook runs the check on every session start. Threshold and window are configurable.

#### Multi-Session Isolation — RESOLVED

The marker file had no session ID. Multiple Claude Code sessions sharing a project directory shared the same marker file.

**Impact:** Session A's state-change message affected Session B's outbound gate.

**Resolution (2026-07-11):** Marker filename now embeds a per-worktree session ID (sha256(12) prefix derived from `.git/HEAD` content, or `${pid}-${timestamp}-${randomHex}` for non-git dirs — Plan 260711-0030 Phase 5). Two worktrees in the same repo get distinct marker filenames. Backed by `tools/learning-loop-mastra/core/worktree-session-id.js`; writer at `hooks/universal/inbound-gate.js:60`; reader at `core/inbound-state.js:50`. Closes the gap as part of plan 260711-0030.

## Runtime-State Sidecar

The runtime-state sidecar (`runtime-state.jsonl`) is the loop's short-term
memory: budgets, counters, dispatch ledger events, and delivery attestations.
Two maintenance contracts keep the sidecar tractable at operator scale.

### Versioned dedup (`max_by(version)` per id)

Every row carries a `version` integer. The public reader
(`runtime_state_read`) collapses to one row per id via `max_by(version)`,
ties broken by newest timestamp with `timestamp ?? ""` fallback then
last-in-file order (mirrors meta-state's `created_at ?? ""` precedent at
`core/meta-state.js:768-769`). The raw sidecar still stores every row
(history preserved; the inbound gate reads raw for its per-`affected_system`
latest-row scan). Append is wrapped in `withRegistryLock` so two
concurrent writers (e.g. CLI one-shot + a sibling runtime sharing
`GATE_ROOT`) cannot both read `max=N` and both write `version=N+1` —
without the lock, dedup silently loses writes.

`version` is a dedup bookkeeping field and is NOT part of the v2
fingerprint. Re-records already differ by `timestamp`, so fingerprints
already differ. No row migration: existing unversioned rows default to
`0` at read time.

### Per-surface tracking toggle + prune

Operators can pause per-surface tracking for non-actionable surfaces
(e.g. vendored `vnstock` whose ledger events crowd out the loop's own
records). Pause writes an entry to `.loop/runtime-tracking.json` via
`runtime_state_pause`; resume removes it via `runtime_state_resume`.
Both writers (`runtime_state_record`, `meta_state_dispatch_finding` —
the latter at the top of the handler so `prepare` and `commit` both
refuse) consult `isSurfacePaused` before producing any row. The inbound
gate's stale-observation scan short-circuits paused surfaces so the gate
and the writers agree on what gets surfaced.

The sidecar itself is operator-controlled: direct writes to
`.loop/runtime-tracking.json` are blocked at three layers
(`core/r2/ownership.js` `BOOTSTRAP_DENY_PATTERNS`,
`core/evaluate-bash-gate.js` `PATH_WRITE_PATTERNS` echo/tee redirect,
`core/bound-artifacts.js` `BOUND_ARTIFACTS` for the Write-tool path).
The per-surface preflight marker
(`SURFACES/coordination/.loop-preflight-runtime-tracking`) authorizes
pause/resume — same per-surface convention as `runtime_state_record`'s
`.loop-preflight-runtime-state`.

`runtime_state_prune_surface({surface, confirm: true})` is the
destructive one-time op that rewrites the sidecar minus a paused
surface's existing rows; runs under the same `withRegistryLock` so it
cannot interleave with a concurrent append. History is NOT preserved
for pruned rows (the operator is deleting noise); idempotent on no
match.

## Meta-State Self-Learning Loop

The loop is self-referential: the loop's own state machine (`meta-state.jsonl`) controls the loop's own audit trail. The agent can record its own modifications, derive the effective status of any finding, ground findings against the live filesystem, and query drift between asserted and derived state across the entire registry. The concept (engine invariant, 4-kind union, lifecycle) lives in `docs/loop-engine.md` (L1) and `docs/meta-state-lifecycle.md` (L1); this section names the mechanism.

### Meta-State Tools (11 total)

The meta-state machinery is decomposed into 4 sub-projects, each adding tools to the MCP server. All 11 tools are agent-callable (read-side; some are agent-writable for new entries).

| Sub-project | Status | Tools | Purpose |
|---|---|---|---|
| **SP0 (Self-Modification Affordance)** | SHIPPED | `meta_state_log_change`, `meta_state_sweep` | Agent logs its own system changes as first-class change-log entries |
| **SP1 (Derivation Query)** | SHIPPED | `meta_state_derive_status` | Pure-function verifier: "is this finding's mechanism still live?" (file exists, hash matches, tests pass) |
| **SP2 (Grounding Check)** | SHIPPED | `meta_state_check_grounding`, `meta_state_refresh_file_index` | Pure-function grounding + explicit recovery: hash-mismatch detection + path-keyed fingerprint index refresh (one call re-grounds all anchored findings) |
| **SP3 (Drift Query)** | SHIPPED | `meta_state_query_drift` | Read-only drift aggregation: joins SP1 + SP2 across the registry to surface entries where asserted status disagrees with derived/grounded state |
| **Original 5** | SHIPPED | `meta_state_report`, `meta_state_list`, `meta_state_ack`, `meta_state_resolve`, `meta_state_promote_rule` | Foundational CRUD + rule promotion |

**Total: 11 tools in the `meta_state` group of `agent-manifest.json`.**

### Self-Learning Loop Architecture

```mermaid
flowchart TD
    Operator(["Operator: state-change message<br/>(e.g. 'cleared device')"]):::trigger --> S1
    S1["<b>1. Inbound State Gate</b><br/>reads observations/<br/>checks staleness (30 min TTL)"]:::gate --> S2
    S2["<b>2. Read meta-state.jsonl</b><br/>(last 20 lines)<br/>+ loop_describe warm tier"]:::read --> S3
    S3{"<b>3. Match found?</b><br/>(change-log / finding)"}:::scan
    S3 -->|Yes, known bug| S3a["Apply operator-approved<br/>workaround"]:::apply
    S3 -->|No| S3b["Update observations<br/>via record_observation"]:::update
    S3a --> S3b
    S3b --> S4
    S4["<b>4. Agent</b> (Claude / Droid / Mastra Code)<br/>the second filter"]:::agent --> S5
    subgraph S5["<b>5. meta_state_* MCP tools</b>"]
        direction LR
        T_SP0["<b>SP0</b> (Self-Modification)<br/>log_change, sweep"]:::sp0
        T_SP1["<b>SP1</b> (Derivation)<br/>derive_status"]:::sp1
        T_SP2["<b>SP2</b> (Grounding)<br/>check_grounding,<br/>refresh_file_index"]:::sp2
        T_SP3["<b>SP3</b> (Drift)<br/>query_drift"]:::sp3
        T_SP0 --- T_SP1 --- T_SP2 --> T_SP3
    end
    S5 --> Registry
    Registry[("<b>meta-state.jsonl</b><br/>findings + change-log<br/>(immutable audit log)")]:::registry
    subgraph S6["<b>6. Pure functions in core/</b>"]
        direction TB
        S6a["<b>deriveStatus</b> (SP1)<br/>file exists, hash matches,<br/>tests pass"]:::purefn
        S6b["<b>checkGrounding</b> (SP2)<br/>SHA-256 verification"]:::purefn
        S6a --> S6b
    end
    Registry --> S6
    S6 --> S7
    S7["<b>7. queryDrift</b> (SP3)<br/>joins SP1 + SP2 across registry<br/>→ drift events"]:::purefn
    S5 --> S7
    S7 --> S8
    S8{"<b>8. Agent decision</b>"}:::decision
    S8 -->|resolve| S8a["meta_state_resolve"]:::resolve
    S8 -->|investigate| S8b["Drill into SP1/SP2"]:::investigate
    S8 -->|log| S8c["meta_state_log_change"]:::log
    S8a -.->|records outcome| Registry
    S8b -.->|records finding| Registry
    S8c -.->|records change| Registry
    Registry -.->|audit trail<br/>feeds back| S2
    classDef trigger fill:#f0f9ff,stroke:#0369a1,stroke-width:2px
    classDef gate fill:#dbeafe,stroke:#1e40af
    classDef read fill:#e0e7ff,stroke:#4338ca
    classDef scan fill:#fef3c7,stroke:#a16207
    classDef apply fill:#dcfce7,stroke:#15803d
    classDef update fill:#dcfce7,stroke:#15803d
    classDef agent fill:#fce7f3,stroke:#be185d,stroke-width:2px
    classDef sp0 fill:#ede9fe,stroke:#6d28d9
    classDef sp1 fill:#fae8ff,stroke:#a21caf
    classDef sp2 fill:#fce7f3,stroke:#be185d
    classDef sp3 fill:#d1fae5,stroke:#047857
    classDef registry fill:#fbcfe8,stroke:#be185d,stroke-width:3px
    classDef purefn fill:#d1fae5,stroke:#047857
    classDef decision fill:#f3e8ff,stroke:#7c3aed,stroke-width:2px
    classDef resolve fill:#bbf7d0,stroke:#166534
    classDef investigate fill:#fed7aa,stroke:#9a3412
    classDef log fill:#bae6fd,stroke:#075985
```

**Key properties:**

- **Self-aware audit trail**: The agent uses `meta_state_log_change` to record any system modification (schema change, tool addition, gate rule promotion, etc.) as a first-class entry. The change-log entries are immutable audit log (no TTL, no auto-resolve).
- **Verifiable assertions**: For any finding, the agent can call `meta_state_derive_status` to compute the effective status from the live filesystem (without mutating the entry). Drift between the entry's `status` and the derived `derived_status` is surfaced via `drift: true`.
- **Grounded claims**: For findings with `mechanism_check: true`, the agent can call `meta_state_check_grounding` to verify the file is still live, the SHA-256 hash matches the last check, and (optionally) the referenced tests still pass. Drift is detected via `status: "drifted"`.
- **Aggregate drift surfacing** (SP3, shipped): `meta_state_query_drift` joins SP1's `derived_status` + SP2's `grounding.status` across the entire registry, returning a flat list of drift events with `recommendation` (resolve / investigate). Default `run_grounding: false` (derivation-only); opt-in to join SP2.
- **Schema-as-source-of-truth** (Approach 2, shipped): The 4 record types (experiment, risk, decision, observation) derive their tool zod schemas from JSON Schema at runtime via `core/schema-to-zod.js`. This is orthogonal to the meta-state work but the meta-state tools benefit from the field-coverage test that catches drift between schema and tool surface.

### Relationship to the Constraint Gate

The constraint gate (`core/gate-logic.js`) and the meta-state registry are **separate** but **complementary**:

- The **gate** enforces *observation existence* (pattern matched → observation present? → pass/block). It does NOT track budget exhaustion, fingerprint matching, or other domain state. The gate is the first filter.
- The **meta-state** records the *agent's reasoning* (e.g., "I checked the budget and it was safe because the fingerprint matched"). It is the audit trail. The agent is the second filter.
- See `docs/meta-state-lifecycle.md` § Layer Separation for the full layer separation.

### References

- `docs/loop-engine.md` — the engine invariant and concept vocabulary (L1)
- `docs/runtime-contract.md` — the transport-agnostic runtime participation contract (L2)
- `docs/meta-state-lifecycle.md` — the 4-kind union, status transitions, fingerprint lifecycle, layer separation (L1)
- `docs/trajectory.md` — long-term direction, the bridges, the fifth bridge (schema as source of truth)
- `plans/reports/brainstorm-260602-meta-state-agent-affordances.md` — parent doc, the 4-sub-project decomposition
- `plans/reports/brainstorm-260603-sp3-drift.md` — SP3 design (status: locked 2026-06-05)
- `plans/260603-sp3-drift/plan.md` — SP3 plan (status: completed, 4-phase TDD + Phase 4 docs update)
- `plans/260717-1826-unify-context-injection/plan.md` — unified hint registry + budget renderer (status: completed 2026-07-17, 4-phase)

## Context-Injection Division of Labor

Plan `260717-1826-unify-context-injection` collapsed 5 overlapping context-injection surfaces into **one hint registry** consumed by two paths: production injection (builders) and inspection (renderer + CLI). The trust objection that justified the pre-Phase-1 LOCAL mirror ("server hint strings not trusted at render time") is dissolved by the fact that hooks already `require('../../core/loop-introspect.js')` directly, and the factory hook itself already `await import`s core/meta-state.js in its failure path. Direct core import removed the wire, the spawn, and the mirror.

- **Source of truth:** `core/hint-registry.js` — slug-keyed entries `{ slug, kind, text, suggestion, derived_from_rule }`. Rule-derived process entries carry empty inline text and resolve from `rule.hint_text` at render time via the shared `resolveHintText` path.
- **Production injection:** `core/loop-introspect.js` builders (`buildDiscoverabilityHints` / `buildProcessHints`) project the registry into the legacy array-of-strings shape. All injection surfaces consume the builders — the hint renderer is NOT on the injection path (operator decision 2026-07-17: the builders already deliver single-source content; wiring hooks through the renderer would churn three hot paths for no behavioral gain).

Four surfaces, one registry. Every injected surface rides a declared **channel** (named in `core/hint-renderer.js#CHANNELS`); delivery fidelity is **attested** by the offline classifier, not assumed:

| Surface | Channel | Trigger | Delivery fidelity | Role |
|---|---|---|---|---|
| **push (SessionStart `.claude` hooks)** | `claude-session-start` | runtime startup | `full`/`lean`/`unknown` (attested) | Fixed cold-start context projected to `slug — suggestion` pointers, hand-partitioned by the two `.claude` universal hooks under the 10k `additionalContext` cap. Bounded and cache-stable. |
| **push (SessionStart `.factory` hook)** | `factory-session-start` | runtime startup | attested (deferred) | `.factory` still emits one full-text block — **pointer projection deferred (D3.1, separate cross-surface alignment plan)**; the channel exists but has not been flipped to pointer form. |
| **pull-warm (`loop_describe`)** | `mcp-warm` | agent mid-session | n/a (agent-initiated) | Current dynamic state: rules/findings/loop-designs/registry summary. Its hint block is the same builder output as push (convenience, not authority); the value-add of a warm call is the dynamic fields. |
| **pull-single (`loop_get_instruction`)** | _(registry-direct)_ | agent on demand | n/a (agent-initiated) | Re-fetch one hint by slug (or numeric index = registry position, for back-compat) that scrolled out of context. Resolves against the fixed registry order — never the shrinkable builder array. |
| **static (AGENTS.md / CLAUDE.md / learning-loop skill)** | _(steering layer)_ | always | n/a | Steering layer + prompt-author docs; never a hint-content source. |
| **sidecar (`.claude/session-context.json`)** | `sidecar` | runtime startup | full-text (not classified) | The full-text payload the push hook writes alongside its pointer projection; `*_source` flags intact. The pointer is the on-wire form; the sidecar is the full-text fallback. |

**`.mastracode` is pull-only by decision (plan 260717-1826 Validation 1, 2026-07-17):** no SessionStart hint injection, so no push channel. Documented so future operators don't read the absence as a bug.

### Channels → state axes

The channel term names what was already de-facto at L3: each injected surface has a declared channel, and the channel's delivery fidelity varies per provider profile. State-2 (deterministic injection) guarantees the hook fires on the right channel at the right moment; it does **not** guarantee the channel's content reaches the model — that is measured at the endpoint. The finding `meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent` is the lesson: a lean provider profile can silently drop a push channel's content (transcript ≠ wire), so delivery must be **attested**, not assumed.

**Delivery attestation (`tools/scripts/delivery-classify.mjs`, plan 260720-1955 Phase 4):** an offline classifier reads session transcripts, recomputes the manifest + hint-payload floors at run time, and classifies each session's first API call as `full` (delivered tokens ≥ 0.8× floor), `lean`, or `unknown` (no `usage` fields). It appends `delivery-<sessionId>-<runTs>` ledger-event rows to repo-root `runtime-state.jsonl` (idempotent by `transcript_content_hash` — re-classifies when the transcript grows), readable via `runtime_state_read`. The loop *knows* delivery through its own queryable substrate (pull, not push). The delivered-token metric is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (not `input_tokens` alone, which excludes cache reads and would falsely flag cached sessions `lean`).

**Once-per-session pull pointer (Validation V2):** the inbound gate (`hooks/universal/inbound-gate.js`) emits one steering pull-pointer line on the **first** `UserPromptSubmit` of a session (gated by the `.inbound-pointer-surfaced` token store, 30-min window), advertising `loop_describe({tier:'warm'})` + `.claude/session-context.json` + `loop_get_instruction({key})`. Subsequent prompts emit nothing — no per-prompt tax, no classifier self-inflation. The warn payload still fires only on a stale-observation trigger; a try/catch degrades to a pointer-only line on any throw (always exit 0).

**`syn`-profile honesty flag:** project-level pointer visibility on the `syn` (lean) profile is unverified in this checkout — the `syn` transcript directory is not present. The classifier's `unknown` row is the honest record; no corrective loop is run on an inconclusive forensic (per debug-report rec 4). Documented-degradation, not a silent gap.

State-2 rationale (`docs/philosophy.md` § Skills Are the Same Kind of Escape Hatch): deterministic injection (hooks fire at the right moment per runtime), agentic consumption (model reads prose, decides). The *mechanism* is state-2 by design. The rule-derived hint content (Phase 3) is promotable to state-3: rule→hint derivation moves from hand-mirror + nag to deterministic projection at promotion time, while hint consumption stays agentic.

Trust boundary: hooks read core directly via `require()` / dynamic `import()`; no server-rendered strings cross a trust boundary.

Inspection (debug tooling, not the injection path): `core/hint-renderer.js` + `node tools/scripts/hint-render.mjs --channel <name> [--partition N] [--provenance]` render the same registry per channel (2-partition `.claude` budget shape, `.factory` single block, `mcp-warm`, `sidecar`) with real rule `hint_text` loaded from the live registry, plus per-hint provenance (slug + kind + source) and skip/oversize warnings. Use to verify hint content and budget sizes without starting a session; per-runtime output envelopes (numbered lists, counts headers) belong to the hooks, not the renderer.