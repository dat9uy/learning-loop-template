# Agentization Scout Report: MCP Candidates

Date: 2026-05-21
Scope: learning-loop-template codebase
Pattern: "Minimal hook, rich MCP" (already applied to constraint-gate)

---

## 1. Pattern Already Implemented: constraint-gate

The constraint-gate system uses the "Minimal hook, rich MCP" pattern:

| Layer | What it does | Size |
|-------|-------------|------|
| **Hook** (`write-coordination-gate.cjs`) | Hard blocks only: observations, schemas, build artifacts, unknown paths | 127 lines |
| **Hook** (`bash-coordination-gate.cjs`) | Hard blocks: constraint patterns + budget + evidence paths | 201 lines |
| **MCP server** (`server.js`) | Rich policy: check_gate, record_observation, update_observation, notify_artifact_change, trigger_workflow | 407 lines |
| **MCP runner** (`workflow-runner.js`) | Workflow registry, allowlist validation, fire-and-forget execution | 163 lines |
| **Logic** (`gate-logic.js`) | Pure decision functions (no I/O) | 182 lines |

Result: hooks are a safety net; all policy, audit, workflow logic lives in the MCP layer where the agent calls it voluntarily.

---

## 2. Agentization Map: All Tools

| # | Capability | Entry Point | Lines | Inputs | Outputs | Side Effects | Auth | Agent Value | CLI Value | MCP Candidate |
|---|-----------|-------------|-------|--------|---------|-------------|------|-------------|-----------|---------------|
| 1 | **validate-records** | `tools/validate-records/validate-records.js` | 87 | --allow-disallowed-fixtures | Errors, count | None | None | **H** | M | **YES** |
| 2 | **check-budget** | `tools/check-budget/check-budget.js` | 108 | --system, --resource, --allow-active-window | JSON budget state | None | None | **H** | M | Already in gate |
| 3 | **extract-index** | `tools/extract-index/extract-index.js` | 457 | --capability, --dry-run, --verbose, --root | Stats, entries written | Writes to records/index/ | None | **H** | L | **YES** |
| 4 | **search-index** | `tools/search-index/search-index.js` | 86 | --capability, --dimension, --status, --json | Matching entries | None | None | **H** | L | **YES** |
| 5 | **generate-capabilities** | `tools/generate-capabilities/generate-capabilities.js` | 117 | --dry-run | Drift report | Writes to records/capabilities/ | None | **H** | L | **YES** |
| 6 | **list-probes** | `tools/list-probes/list-probes.js` | 59 | --stack, --json | Probe file list | None | None | M | L | **YES** |
| 7 | **verify-claim** | `tools/claim-verification/verify-claim.js` | 192 | --claim, --dimension, --status, --reason, --scope, --output, --proof-ref, --decision-ref, --blocked-action, --apply | Validation result | Modifies claim YAML | None | **H** | M | **YES** |
| 8 | **generate-docs** | `tools/generate-docs/generate-docs.js` | 2 | (disabled) | N/A | N/A | N/A | N/A | N/A | N/A |
| 9 | **list-verified** | `tools/list-verified/list-verified.sh` | 64 | None | Human-readable list | None | Requires yq | M | L | **YES** |

### Scoring Legend

- **Agent Value H** = operation the agent does frequently during sessions; structured return beats console parsing
- **Agent Value M** = occasional operation; still better as MCP than Bash
- **Agent Value L** = rare or human-facing only; keep as CLI
- **CLI Value H** = human operators run this directly
- **CLI Value M** = used in scripts and CI
- **CLI Value L** = almost never run standalone

---

## 3. Recommended MCP Tools

### 3.1 `validate_records` (from #1)

Current: `pnpm validate:records` → console errors or success message.

**Problem**: Agent must parse console stderr to find validation errors. No structured access.

**MCP design**:
```
validate_records({ allow_disallowed_fixtures?: boolean, root?: string })
→ { valid: boolean, record_count: number, errors: Array<{ record: string, message: string }>, warnings: Array<...> }
```

**Hook synergy**: The write hook already blocks `schemas/**`. The MCP tool gives the agent a way to pre-validate before attempting a schema change (currently the hook just says "Run pnpm validate:records first, then approve").

**Agent value**: H — every record write should be validated. Structured errors let the agent fix issues programmatically.

---

### 3.2 `extract_index_entries` (from #3)

Current: Triggered via workflow runner on evidence change, or run manually via `pnpm extract:index`.

**Problem**: Agent has no way to call extraction directly from MCP. Must use Bash or rely on workflow trigger.

**MCP design**:
```
extract_index_entries({ capability?: string, dry_run?: boolean, verbose?: boolean })
→ { stats: { files_processed, files_with_findings, entries_produced, written, unchanged }, errors: string[], skipped: string[] }
```

**Hook synergy**: Hook blocks evidence writes without observation; MCP tool lets agent extract index after successful evidence write.

**Agent value**: H — core loop operation. Agent writes evidence → calls notify_artifact_change → workflow triggers extraction. But agent may also want to run extraction explicitly (e.g., after batch evidence import).

---

### 3.3 `search_index_entries` (from #4)

Current: `pnpm search:index --capability foo --dimension static --json`

**Problem**: Agent uses Bash to query index. Returns raw JSON to stdout.

**MCP design**:
```
search_index_entries({ capability?: string, dimension?: string, status?: string })
→ { results: Array<{ id: string, frontmatter: object }>, count: number }
```

**Agent value**: H — agent frequently needs to find index entries by capability/dimension. Structured MCP response avoids JSON parsing from Bash stdout.

---

### 3.4 `generate_capability_records` (from #5)

Current: `pnpm generate:capabilities [--dry-run]`

**Problem**: Agent uses Bash. Dry-run drift output is console-formatted.

**MCP design**:
```
generate_capability_records({ dry_run?: boolean, stacks?: Array<{name, surfaces}> })
→ { drift: boolean, generated: Array<{ id: string, stack: string, surface: string }>, diffs?: Array<{ file: string, expected: object, actual: object }> }
```

**Agent value**: H — capability generation is a key build step. Structured diffs let the agent reason about drift.

---

### 3.5 `update_claim_verification` (from #7)

Current: `pnpm verify:claim -- --claim X --dimension runtime --status verified --reason "..." --apply`

**Problem**: Complex CLI with many positional args. Agent must construct command strings carefully. No structured validation of inputs before write.

**MCP design**:
```
update_claim_verification({
  claim_id: string,
  dimension: "static" | "install" | "runtime" | "product",
  status: "claimed" | "verified" | "rejected",
  reason: string,
  scope?: string,
  output?: string,
  proof_refs?: string[],
  decision_refs?: string[],
  blocked_actions?: string[],
  apply?: boolean  // false = dry run preview
})
→ { updated: boolean, claim_id: string, preview?: string, validation_errors?: string[] }
```

**Agent value**: H — claim verification is central to the loop. MCP tool gives structured params with enum validation, dry-run preview, and validation feedback. Much safer than string CLI.

---

### 3.6 `list_runtime_probes` (from #6)

Current: `pnpm list:probes --stack api --json`

**MCP design**:
```
list_runtime_probes({ stack: string })
→ { probes: Array<{ path: string, stack: string, domain: string }>, count: number }
```

**Agent value**: M — occasional discovery operation. Simple enough that MCP is nice-to-have.

---

### 3.7 `list_verified_claims` (from #9)

Current: `bash tools/list-verified/list-verified.sh` (requires `yq` binary)

**Problem**: Requires external `yq` binary. Bash script. Not portable.

**MCP design**:
```
list_verified_claims()
→ {
  claims: Array<{ id: string, subject: string, verified_dimensions: string[] }>,
  evidence: Array<{ path: string, capability: string, dimension: string, scope: string, status: string }>
}
```

**Agent value**: M — useful for reporting. Replacing yq dependency with pure JS in MCP makes it portable.

---

## 4. Recommended Monorepo Structure

If agentizing the whole tool suite:

```
packages/
  core/                    # extracted from tools/*/
    validate-records.js
    check-budget.js
    extract-index.js
    search-index.js
    generate-capabilities.js
    list-probes.js
    verify-claim.js
    list-verified.js
  cli/                     # thin wrappers around core
    bin/llt.js             # single entry: llt validate, llt budget, llt extract-index, etc.
  mcp/                     # MCP server exposing all tools
    server.js              # registers all tools from core/
```

**Shared core principle**: Each core module exports a `run(params) -> result` function with no CLI/MCP imports. CLI and MCP are thin adapters.

---

## 5. Priority Order

| Priority | Tool | Why |
|----------|------|-----|
| P1 | `validate_records` | Most frequent agent operation; currently painful error parsing |
| P1 | `update_claim_verification` | Complex CLI args; high safety value from structured enums + dry-run |
| P2 | `extract_index_entries` | Core loop operation; agent often needs explicit control |
| P2 | `search_index_entries` | Frequent read query; replaces Bash JSON parsing |
| P3 | `generate_capability_records` | Build-step operation; structured drift output valuable |
| P3 | `list_runtime_probes` | Simple; nice-to-have |
| P4 | `list_verified_claims` | Reporting; replaces yq dependency |

---

## 6. What NOT to Agentize

| Tool | Why Skip |
|------|----------|
| `generate-docs` | Currently disabled (2-line stub). Revisit when implementation exists. |
| `check-budget` | Already integrated into constraint-gate MCP via `check_gate`. Budget logic lives in gate-logic.js. No separate tool needed. |

---

## 7. Hook + MCP Synergy Map

| Hook Block | MCP Tool That Complements It |
|------------|------------------------------|
| `schemas/**` blocked | `validate_records` — agent validates before asking for schema change approval |
| `records/evidence/**` requires observation | `extract_index_entries` — after evidence write, agent extracts index |
| `records/observations/**` blocked | `record_observation`, `update_observation` — agent uses MCP to manage observations (already implemented) |
| Constraint patterns in Bash | `check_gate` — agent pre-checks commands (already implemented) |
| Evidence write-path check | `notify_artifact_change` — agent notifies after write, triggers workflows (already implemented) |

---

## 8. Decisions (Post-Discussion)

### 8.1 Single MCP Server (Extend constraint-gate)

**Decision**: Single server. Extend `constraint-gate` with the 7 new tools.

**Rationale**:
- Shared state (all tools touch `records/`, `schemas/`)
- Shared auth model (none / env vars)
- Shared audit trail (`gate-log.jsonl`)
- One `.mcp.json` entry, one Node process spawn
- All tools are **learning-loop governance**, not separate domains

**Phase 2 trigger** (revisit separation when):
- Tool count exceeds 12
- A tool needs external API credentials the gate doesn't need
- A tool needs HTTP transport while gate stays stdio-only
- Tool release cadence diverges from gate (gate stable, tools iterating)

**Rollback**: Extract tools into new `learning-loop-core` server; `constraint-gate` keeps gate-only tools.

### 8.2 extract-index: MCP Tool + Workflow

**Decision**: Both. `extract_index_entries` callable as MCP tool AND triggered by workflow.

**Rationale**: Workflow handles the happy path (evidence write → auto-extract). MCP tool handles explicit calls (batch import, operator-initiated re-extraction).

### 8.3 list-verified: Rewrite in Pure JS

**Decision**: Rewrite in JS. Eliminate `yq` dependency.

**Rationale**: `yq` is an external binary dependency. Pure JS with `yaml` package (already in dependencies) is portable and testable.

---

## 9. Codebase Simplification: OOP Analysis

### 9.1 Current Pattern: Repeated Infrastructure

Every validation function rebuilds the same structures:

```javascript
// In validateClaimVerification
const byId = new Map(records.map((record) => [record.id, record]));
for (const record of records) if (record.type === "claim") ...

// In validateDerivedAssurance
const claims = records.filter((r) => r.type === "claim");
const experiments = records.filter((r) => r.type === "experiment");
const decisions = records.filter((r) => r.type === "decision");
```

Each function: rebuilds `byId` → filters by type → passes `errors` array by reference → passes `root`, `ids` through 5+ call layers.

### 9.2 Where OOP Helps

| Area | Current Pain | OOP Solution |
|------|-------------|--------------|
| Record loading | `loadRecords` returns plain array; every consumer rebuilds indexes | `RecordRepository` with cached `byId`, `byType` |
| Validation pipeline | `errors` array mutated through 5 function layers | `ValidationContext` with `addError()` |
| Type-specific validation | `if (record.type === 'claim') validateClaim(...)` scattered | Polymorphic `record.validate(context)` |
| Cross-record refs | `recordIdFromRef`, `resolveRefs` duplicated | `Ref.parse(ref)` with subclasses |

### 9.3 Where OOP Hurts (Keep Procedural)

| Area | Why |
|------|-----|
| **Gate logic** | Pure functions are audit-friendly. `evaluateBudget`, `makeGateDecision` have no state — perfect as-is. |
| **Workflow runner** | Spawns processes. No entity state to model. |
| **Extract-index** | File walking + frontmatter parsing. Pipeline of transforms. |
| **MCP server** | Tool handlers are already thin wrappers over core functions. |

### 9.4 Recommended Refactor: Surgical, Not Sweeping

**Phase 1: RecordRepository** (1-2 hours)

```javascript
export class RecordRepository {
  constructor(records) {
    this.records = records;
    this.byId = new Map(records.map(r => [r.id, r]));
    this.byType = new Map();
    for (const r of records) {
      const list = this.byType.get(r.type) || [];
      list.push(r);
      this.byType.set(r.type, list);
    }
  }
  get(id) { return this.byId.get(id); }
  ofType(type) { return this.byType.get(type) || []; }
  static load(root) { ... }
}
```

Eliminates repeated `byId` rebuilds in `validateClaimVerification`, `validateDerivedAssurance`, `validateExperimentProves`.

**Phase 2: ValidationContext** (1-2 hours)

```javascript
export class ValidationContext {
  constructor(repository, root, options = {}) {
    this.repository = repository;
    this.root = root;
    this.allowDisallowedFixtures = options.allowDisallowedFixtures || false;
    this.errors = [];
  }
  addError(file, message) { this.errors.push(`${file}: ${message}`); }
  get claims() { return this.repository.ofType('claim'); }
  get experiments() { return this.repository.ofType('experiment'); }
}
```

Eliminates passing `errors`, `byId`, `root` through every function signature.

**Phase 3: Polymorphic Validation** (optional, 2-3 hours)

Only if Phase 1+2 reveal clear type-specific method patterns. Otherwise, keep type-specific logic in standalone files but have them receive `ValidationContext` instead of raw arrays.

### 9.5 Brutal Assessment

The codebase is **not suffering** from its procedural style. The repeated `byId` rebuild is wasteful but not a bottleneck at current scale. OOP would help **organize** the record domain but introduces **indirection** that makes the code harder to grep and reason about for LLM tools.

**Verdict**: Do Phase 1 (`RecordRepository`) only. It eliminates the clearest repetition without adding class hierarchies. Skip Phase 3 unless the team hits real complexity with new record types.

---

## 10. Decisions (Post-Discussion)

### 10.1 extract-index: Dual Path

**Decision**: Both workflow trigger AND explicit MCP call.

**Rationale**: Workflow covers the happy path (evidence write → auto-extract). Explicit MCP call covers batch imports, operator-initiated re-extraction, and debugging. No conflict — the tool is idempotent.

### 10.2 Audit Trail: Shared Log

**Decision**: All MCP tools log to `gate-log.jsonl`.

**Rationale**: Single audit trail for all learning-loop governance operations. `gate-log.jsonl` already has rotation (10 MB, 5 backups). A separate log adds complexity with no benefit at current scale. Revisit if log volume grows 10x.

**Log schema per tool**:
```json
{
  "timestamp": "2026-05-21T12:00:00Z",
  "tool": "validate_records",
  "decision": "ok",
  "record_count": 42,
  "error_count": 0
}
```

### 10.3 validate_records: Auto-Fix Mode

**Decision**: Yes. Include `fix?: boolean` parameter.

**What it fixes**:
- Missing `updated_at` → set to current UTC
- Missing `created_at` → set to current UTC (if record is new)
- Malformed timestamps → normalize to ISO-8601 UTC
- Missing `schema_version` → infer from schema file

**What it NEVER fixes**:
- Missing required fields (id, type, status)
- Invalid enum values
- Broken cross-record references
- Missing source files

**MCP design update**:
```
validate_records({ allow_disallowed_fixtures?: boolean, fix?: boolean, root?: string })
→ {
  valid: boolean,
  record_count: number,
  errors: Array<{ record: string, message: string }>,
  warnings: Array<...>,
  fixed?: Array<{ record: string, field: string, old_value: string, new_value: string }>
}
```

**Safety**: `fix: true` requires `apply: true` (or separate `fix_apply` param) to prevent accidental writes. Or: agent calls with `fix: true` first, reviews `fixed` array, then calls `fix_apply` to commit.

---

## 11. Pre-Planning Gap Analysis

### 11.1 Gap 1 — `records/index/**` and `records/capabilities/**` Blocked by Catch-All (CRITICAL)

The write gate allows: `docs/**`, `plans/**`, `.claude/**`, `product/**`, `tools/**`.  
`records/index/**` and `records/capabilities/**` are NOT allowed → hit catch-all `**` → **blocked**.

**Impact**: `extract_index_entries` and `generate_capability_records` MCP tools would use `Edit`/`Write` to modify these paths, triggering the hook block.

**Resolution**: Add `records/index/**` and `records/capabilities/**` to write gate allow list (with observation requirement, same model as evidence). These are agent-managed derived artifacts.

### 11.2 Gap 2 — `validate_records` Auto-Fix Writes to Claims (CRITICAL)

Auto-fix mode modifies `records/claims/*.yaml`. Claims are NOT in the allow list → **blocked by catch-all**.

**Resolution**: **Drop auto-fix from MCP tool scope.** Keep `fix` mode CLI-only (`pnpm validate:records --fix`). The MCP tool is read-only validation only. Safer.

### 11.3 Gap 3 — Server Size Explosion (HIGH)

Current `server.js`: **407 lines**. Adding 7 tools with handlers, schemas, logging → **800+ lines**.

**Resolution**: Modularize into tool registry pattern. Each tool gets its own file (`tools/constraint-gate/tools/*.js`). `server.js` becomes a thin registry (~100 lines).

```
tools/constraint-gate/
  server.js                 # thin registry, imports all tools
  tools/
    validate-records-tool.js
    extract-index-tool.js
    search-index-tool.js
    generate-capabilities-tool.js
    update-claim-tool.js
    list-probes-tool.js
    list-verified-tool.js
```

---

## 12. Medium/Low Gaps (For Discussion)

### Gap 4 — No Shared Frontmatter Parser (Medium) — RESOLVED

`extract-index` has `frontmatter-splitter.js`. Rewriting `list-verified` in pure JS requires duplicating this logic.

**Decision**: Extract to `tools/lib/frontmatter-splitter.js`.

**Rationale**: 36 lines, 2+ consumers (`extract-index`, `list-verified` rewrite), clear win. No coupling issues — it's a pure function with zero dependencies.

```
tools/lib/
  frontmatter-splitter.js    # extracted from tools/extract-index/
tools/extract-index/
  frontmatter-splitter.js    # re-export from ../lib/ (temp compat)
```

Delete `tools/extract-index/frontmatter-splitter.js` after all imports migrated.

### Gap 5 — Partial Failure Handling Pattern (Medium)

`extract_index_entries` can have **both** errors AND successful writes. Current MCP tools return binary `ok/block/escalate`. Need partial success standard.

**Proposed pattern**:
```javascript
{
  success: boolean,      // true if any work done
  complete: boolean,     // true if no errors
  errors: string[],
  result: object         // tool-specific data
}
```

**My take**: Standardize during implementation. Not a blocker.

### Gap 6 — Tool Description Quality (Medium)

MCP tool descriptions are the agent's only documentation. 7 new tools need rich descriptions (what, when, returns, failures).

**My take**: Content work. Include in plan as deliverable, not a blocker.

### Gap 7 — Agent Confusion: `check_gate` vs `validate_records` (Low)

Both "check" things. Agent might confuse them.

**Mitigation**: Clear naming + descriptions:
- `check_gate`: "Use BEFORE running Bash commands to check constraints"
- `validate_records`: "Use AFTER writing YAML records to verify correctness"

**My take**: Naming is already clear. Descriptions handle the rest.

---

## 13. Summary

| Decision | Answer |
|----------|--------|
| Single or separate MCP server? | Single (extend constraint-gate) |
| extract-index path | Both workflow + explicit MCP |
| Audit trail | Shared `gate-log.jsonl` |
| validate_records auto-fix | **No** — MCP tool is read-only. Fix stays CLI-only |
| OOP refactor scope | Phase 1 only (`RecordRepository`) |
| list-verified rewrite | Pure JS, drop `yq` |
| `records/index/**` write gate | Add to allow list (with observation requirement) |
| `records/capabilities/**` write gate | Add to allow list (with observation requirement) |
| Server modularization | Tool registry pattern — each tool in its own file |
| Shared frontmatter parser | Extract to `tools/lib/` (discuss) |
| Partial failure pattern | Standardize during impl (discuss) |
| Tool descriptions | Content deliverable in plan (discuss) |
| **MCP framework** | **DIY registry** — no FastMCP/mcp-framework (see §14) |
| **Schema language** | **AJV + JSON Schema** — no Zod (see §14.4) |
| **Tool registry helper** | `tool-registry.js` ~20 lines, `createTool()` + `registerTools()` (see §15) |

---

## 14. MCP Framework Research

Question: Are there existing libraries/frameworks that reduce hand-written MCP boilerplate, similar to how YAML + AJV reduce validation code?

### 14.1 Candidates Evaluated

| Framework | Language | Approach | Maturity |
|-----------|----------|----------|----------|
| **FastMCP** (PrefectHQ) | Python / TypeScript | Decorator-based, auto schema gen from Zod | Very high (~70% of MCP servers) |
| **mcp-framework** (QuantGeekDev) | TypeScript | Class-based tools, auto-discovery | Medium |
| **mcp-server-generator** / `create-mcp` | TypeScript | CLI scaffold for new projects | Medium |
| **@nitrostack/cli** | TypeScript | NestJS-inspired, decorators, Zod | Low |
| **mxcp** | Python | YAML/SQL/Python declarative config | Niche |

Sources: [FastMCP TypeScript](https://github.com/punkpeye/fastmcp), [PrefectHQ FastMCP Python](https://github.com/PrefectHQ/fastmcp), [mcp-framework](https://github.com/QuantGeekDev/mcp-framework), [mcp-server-generator](https://github.com/LinuxDevil/Create-MCP), [NitroStack SDK](https://nitrostack.ai/sdk)

### 14.2 FastMCP TypeScript Example (for comparison)

```typescript
import { FastMCP } from "fastmcp";
import { z } from "zod";

const mcp = new FastMCP("My Server");

mcp.addTool({
  name: "validate_records",
  parameters: z.object({
    allow_disallowed_fixtures: z.boolean().optional(),
  }),
  execute: async (args) => {
    return { valid: true, record_count: 42, errors: [] };
  },
});

mcp.start();
```

What FastMCP saves: `ListToolsRequestSchema` handler, `CallToolRequestSchema` routing, param validation, JSON Schema generation from Zod.

### 14.3 Why Frameworks Are Not a Clear Win Here

| Factor | FastMCP / mcp-framework | DIY Registry |
|--------|------------------------|--------------|
| New dependency | Yes | No |
| Rewrite `server.js` | Yes | No |
| Lines saved per tool | ~10 | ~5 (with helper) |
| Existing `gate-log.jsonl` audit trail | Re-implement | Reuse |
| Existing log rotation | Re-implement | Reuse |
| Shared state (budgets, observations) | Awkward | Natural |
| Hook synergy | Same | Same |
| Schema language | Zod (new) | JSON Schema (existing) |

The frameworks save ~10 lines per tool. But the rewrite cost is ~100+ lines and loss of custom audit integration. At 7 tools, net savings are negative.

### 14.4 Zod Consideration (Rejected)

Zod's value for MCP is auto JSON Schema generation — but that only works with FastMCP's internal converter. Without FastMCP, you write JSON Schema by hand anyway.

The "type inference" benefit (`z.infer<typeof schema>`) can be matched with `json-schema-to-ts` if ever needed. But the codebase is JavaScript, not TypeScript, so this is moot.

Adding Zod would create a "two validator" problem: Zod for MCP params, AJV for YAML records. Two schema languages, two error formats, no benefit.

**Decision**: Keep AJV + JSON Schema. No Zod.

---

## 15. Recommended Tool Registry Pattern

A ~20-line helper eliminates the server size explosion (Gap 3) without adding dependencies.

```javascript
// tools/constraint-gate/tool-registry.js
export function createTool(name, description, schema, handler) {
  return { name, description, inputSchema: schema, handler };
}

export function registerTools(server, tools, logAction) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) throw new Error(`Unknown tool: ${request.params.name}`);

    const result = await tool.handler(request.params.arguments);

    if (logAction) {
      logAction({ tool: tool.name, decision: "ok", timestamp: new Date().toISOString() });
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });
}
```

Each tool file (~30 lines):

```javascript
// tools/constraint-gate/tools/validate-records-tool.js
import { createTool } from "../tool-registry.js";
import { validateRecords } from "../../../tools/validate-records/validate-records.js";

export const validateRecordsTool = createTool(
  "validate_records",
  "Validate YAML records against JSON schemas. Use AFTER writing records to verify correctness.",
  {
    type: "object",
    properties: {
      allow_disallowed_fixtures: { type: "boolean", default: false },
      root: { type: "string", description: "Project root directory" },
    },
  },
  async (args) => {
    const result = await validateRecords({
      allowDisallowedFixtures: args.allow_disallowed_fixtures,
      root: args.root || process.cwd(),
    });
    return result;
  }
);
```

Thin server.js (~50 lines):

```javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tool-registry.js";
import { validateRecordsTool } from "./tools/validate-records-tool.js";
// ... import other tools

const server = new Server(
  { name: "constraint-gate", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

registerTools(server, [
  validateRecordsTool,
  // ... other tools
], logGateAction);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Total estimated size**: 7 tools x ~30 lines + 20-line helper + 50-line server = ~280 lines. vs. 800+ lines of inline handlers.

---
