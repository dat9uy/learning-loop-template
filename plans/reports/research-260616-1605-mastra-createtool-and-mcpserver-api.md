# Research — Mastra `createTool` + `MCPServer` API for C1+C2 (Phase C Plan 1)

**Type:** research (portable spec for Plan 1 of Phase C)
**Date:** 2026-06-16
**Slug:** mastra-createtool-and-mcpserver-api
**Status:** complete — feeds Phase C Plan 1 (atomic adoption, C1+C2+C3+C5)
**Confidence:** see per-claim table below

---

## Confidence Summary

| Claim | Confidence | Source |
|---|---|---|
| `new MCPServer({ id, name, version, description, tools, agents, workflows })` signature | 95% | mastra.ai/reference/tools/mcp-server |
| `tools` is `{ [name]: createTool(...) }`; **object key wins** as public MCP tool name (not `id`) | 95% | mastra.ai/reference/tools/mcp-server |
| `startStdio()` is the method; auto-uses internal `StdioServerTransport` | 90% | mastra.ai/guides/guide/publishing-mcp-server |
| `createTool` returns a `Tool`; `execute` signature is `(input, context) => output` | 95% | mastra.ai/reference/tools/create-tool |
| Zod v4 `z.preprocess(fn, schema)` is the canonical pattern (still v3-style) | 95% | zod.dev/api?id=preprocess |
| Mastra's `coerceStringifiedJsonValues` handles only string→array (probe 2026-06-16) | 95% | tracker § Coercion (resolved 2026-06-16) |
| **29 deterministic tools in C2 scope (not 36)** | 90% | manual count of `agent-manifest.json` post-Phase-A |

**Sources (3+ for cross-reference):** 4 WebFetch calls to mastra.ai + zod.dev, local mastra skill, legacy server source (`tools/learning-loop-mcp/server.js`, `tool-registry.js`), and prior research reports.

---

## 1. Package Structure

### Recommended layout

```
tools/learning-loop-mastra/
├── package.json
├── server.js
├── create-loop-tool.js          # C5 factory (separate concern)
├── agent-manifest.json          # tool grouping (for discoverability)
├── schemas.js                   # re-export of legacy schemas used by ported tests
├── tools/
│   ├── manifest.json            # 29 file→export entries
│   ├── gate-tool.js
│   ├── gate-mark-preflight-tool.js
│   ├── gate-check-recurrence-tool.js
│   ├── gate-override-tool.js
│   ├── meta-state-*.js (20 files)
│   ├── loop-describe-tool.js
│   ├── loop-get-instruction-tool.js
│   ├── runtime-state-read-tool.js
│   ├── runtime-state-record-tool.js
│   └── check-runtime-agnostic-tool.js
└── __tests__/
    ├── wire-format-coercion-fix.test.js          # PORTED (5 tests)
    ├── wire-format-top-level-coercion.test.js    # PORTED (5 stdio + 1 factory-unit)
    ├── wire-format-meta-state-optional-fields.test.js  # PORTED (5 tests)
    └── wire-format-patch-recursion.test.js       # PORTED (1 stdio + 3 unit)
```

**Symlink decision:** use root `package.json#imports` aliases (no symlink, no copy):

```jsonc
// root package.json#imports (additive)
{
  "#mcp/*": "./tools/learning-loop-mcp/*",
  "#mastra/*": "./tools/learning-loop-mastra/*",
  "#lib/*": "./tools/lib/*"
}
```

The new server imports `#mcp/core/meta-state.js` etc. from the legacy package directly. **YAGNI/KISS:** do not create a second `core/` or `lib/`. The legacy modules are runtime-agnostic by construction.

### `package.json` shape

```jsonc
{
  "name": "@learning-loop/mastra",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "learning-loop-mastra": "./server.js" },
  "dependencies": {
    "@mastra/core": "<pinned-minor>",
    "@mastra/mcp": "<pinned-minor>",
    "@modelcontextprotocol/sdk": "1.29.0",
    "zod": "^4.4.3"
  }
}
```

**Invocation:** `node tools/learning-loop-mastra/server.js` (not via `bin`) to match the legacy pattern (see `package.json:18`).

### `pnpm-workspace.yaml` decision

**Do NOT add a `packages:` key.** The current file has only `allowBuilds: simple-git-hooks: true`. The legacy server is not a workspace member; the new one should match. Add `@mastra/*` to root `package.json#dependencies` instead. (Confidence 90%.)

---

## 2. MCPServer Tool Registration

### Verified constructor

```typescript
new MCPServer({
  id: string,             // Required
  name: string,           // Required
  version: string,        // Required
  description?: string,
  tools: ToolsInput,      // { [name: string]: Tool }
  agents?: Record<string, Agent>,      // each → ask_<key>
  workflows?: Record<string, Workflow>, // each → run_<key>
})
```

### **CRITICAL: object key wins, not `id`**

> "An object where keys are tool names" — `tools: { foo: someTool }` registers `foo` as the public MCP name, even if `someTool = createTool({ id: 'bar', ... })`.

**Implication for C2 factory:** `createLoopTool({ id: 'gate_check', ... })` returns a Tool; the server.js loop builds `tools: { gate_check: toolInstance }` — three-way alignment (`id` === object key === legacy `name` field).

### `createTool` signature (verified)

```typescript
createTool({
  id: string,                              // Required
  description: string,                     // Required (non-empty per MCPServer)
  inputSchema: StandardJSONSchemaV1,        // Zod v4 is compatible
  outputSchema?: StandardJSONSchemaV1,
  execute: async (input, context?) => out, // Required
  mcp?: { annotations?: {...}, _meta?: {...} },
  // ... onInputStart/Delta/Available, onOutput, suspendSchema, etc.
})
```

**`execute` shape:** `(input, context?) => output` where context is `{ requestContext, tracingContext, abortSignal, agent?, workflow?, mcp? }`. First arg is the Zod-validated input.

### C2 register loop (data-driven, mirrors legacy `server.js:35-44`)

```js
import { MCPServer } from '@mastra/mcp';
import { createLoopTool } from './create-loop-tool.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(__dirname, 'tools/manifest.json'), 'utf8'));

const tools = {};
for (const { file, export: exportName } of MANIFEST) {
  const mod = await import(join(__dirname, file));
  const legacy = mod[exportName];
  if (!legacy) { console.error(`skipped ${file}`); continue; }
  tools[legacy.name] = createLoopTool({
    id: legacy.name,
    description: legacy.description,
    inputSchema: legacy.schema,
    execute: async (args) => legacy.handler(args),
  });
}

const server = new MCPServer({
  id: 'learning-loop-mastra',
  name: 'learning-loop-mastra',
  version: '0.1.0',
  description: 'Mastra-based peer MCP server for the learning loop (Phase C Plan 1)',
  tools,
});

await server.startStdio();
```

---

## 3. Stdio Transport

**Verified:** `await server.startStdio()` — no manual `StdioServerTransport` wiring needed. The legacy `server.js:48-49` does this manually:

```js
const transport = new StdioServerTransport();
await server.connect(transport);
```

The Mastra equivalent is one line. **Architectural simplification.**

**`bin` field:** per mastra.ai/guides/guide/publishing-mcp-server, `bin: "dist/stdio.mjs"` is recommended for `npx` use. For our use case (invoked via `.mcp.json` `args`), `bin` is not required. Recommend including it (hygiene) but invoking via `node <path>` (symmetry with legacy).

---

## 4. `.mcp.json` / `.factory/mcp.json` Peer Config

### Current (verified)
```jsonc
// both .mcp.json and .factory/mcp.json are identical
{ "mcpServers": { "learning-loop-mcp": { "command": "node", "args": ["tools/learning-loop-mcp/server.js"] } } }
```

### Plan 1 (peer entry added)
```jsonc
// .mcp.json and .factory/mcp.json — both get identical additive entry
{
  "mcpServers": {
    "learning-loop-mcp": { "command": "node", "args": ["tools/learning-loop-mcp/server.js"] },
    "learning-loop-mastra": { "command": "node", "args": ["tools/learning-loop-mastra/server.js"] }
  }
}
```

### Collision risk (CRITICAL for C3)

MCP clients enumerate tools **globally** across all servers. If both register `gate_check`, the client sees two tools with the same name → ambiguity / shadowing.

**Ranked solutions:**

1. **Tool-name prefix (recommended, 70% confidence):** rename Mastra tools to `mastra_gate_check`, `mastra_meta_state_list`, etc. Factory's `id` is the public name; the C2 register loop prefixes.
2. **Runtime isolation (backup):** load only one server at a time in tests; let production use legacy until Plan 3 cut-over.
3. **Server-name namespacing (best-effort, 30% confidence):** some MCP clients namespace tools as `<server>__<tool>`. Not verified for Claude Code 1.x or Droid CLI. **Verify at C3 sub-phase by spawning a test session with both entries and inspecting `tools/list`.**

**Concrete prefix pattern (option 1):**
```js
const PREFIX = 'mastra_';
for (const { file, export: exportName } of MANIFEST) {
  const mod = await import(join(__dirname, file));
  const legacy = mod[exportName];
  if (!legacy) continue;
  const prefixed = PREFIX + legacy.name;
  tools[prefixed] = createLoopTool({ id: prefixed, ... });
}
```

---

## 5. C2 Tool Subset (29 tools, not 36)

**Post-Phase-A count is 29, not 36.** The 36 figure in the brainstorm and master tracker is pre-Phase-A stale. Verified against `tools/learning-loop-mcp/agent-manifest.json` + `tools/manifest.json`.

**Excluded:** all `workflow_*` tools (11 in legacy `agent-manifest.json:13-25` — Phase D); Phase A deletions (capability, index, record_crud — already removed).

**The 29 deterministic meta-surface tools:**

```
gate (5):           gate_check, gate_check_recurrence, gate_mark_preflight, gate_override, runtime_state_record
meta_state (20):    meta_state_report, meta_state_list, meta_state_ack, meta_state_resolve,
                    meta_state_promote_rule, meta_state_sweep, meta_state_log_change, meta_state_patch,
                    meta_state_derive_status, meta_state_check_grounding, meta_state_refresh_fingerprint,
                    meta_state_refresh_tools, meta_state_query_drift, meta_state_batch, meta_state_archive,
                    meta_state_relationship_validate, meta_state_propose_design, meta_state_relationships,
                    meta_state_re_verify, meta_state_supersede
introspection (3):  loop_describe, loop_get_instruction, runtime_state_read
runtime_agnostic (1): check_runtime_agnostic
TOTAL: 29
```

**New `agent-manifest.json` shape (in `tools/learning-loop-mastra/`):**

```jsonc
{
  "version": "0.1.0",
  "server": "learning-loop-mastra",
  "groups": {
    "gate": { "description": "...", "tools": ["mastra_gate_check", "mastra_gate_check_recurrence", "mastra_gate_mark_preflight", "mastra_gate_override", "mastra_runtime_state_record"], "ordering": "mandatory-first" },
    "meta_state": { "description": "...", "tools": ["mastra_meta_state_*"] },
    "introspection": { "description": "...", "tools": ["mastra_loop_describe", "mastra_loop_get_instruction", "mastra_runtime_state_read"] },
    "runtime_agnostic": { "description": "...", "tools": ["mastra_check_runtime_agnostic"] }
  }
}
```

(If option 3 in §4 wins, drop the `mastra_` prefix.)

---

## 6. C5 `z.preprocess()` Pattern

### Probe-confirmed cases (2026-06-16)

| Case | Wire format | Target | Raw createTool? |
|---|---|---|---|
| 1 | `'["x", "y"]'` | `ZodArray` | **PASS** (Mastra's `coerceStringifiedJsonValues`) |
| 2 | `"true"`/`"false"` | `ZodBoolean` | **FAIL** — needs `z.preprocess` |
| 3 | `"3"` | `ZodNumber` | **FAIL** — needs `z.preprocess` |
| 4 | `{item: X}` envelope | `ZodObject`/`ZodArray` | **FAIL** — needs `unwrapItem` step |

**1/6 PASS.** The C5 factory must reproduce the legacy 5/6 behavior.

### Zod v4 `z.preprocess` (verified)

```ts
const coerced = z.preprocess(
  (val) => /* transform */ transformedVal,
  z.boolean()  // inner schema
);
```

The preprocessor runs first; its return value is validated by the inner schema.

### C5 factory spec

See `research-260616-1605-wire-format-coercion-and-test-porting.md` §3 for the full `create-loop-tool.js` spec with `unwrapTypeName`, `coerceScalar`, `unwrapItem`, `coerceShape`, `wrapSchema`, and `createLoopTool` exports.

---

## 7. Constraints & Risks

| # | Constraint | Risk | Mitigation |
|---|---|---|---|
| 1 | 29 tools to port with correct `inputSchema` (legacy is source of truth) | Schema drift → Plan 2 (C4) parity failure | Plan 1 internal contract test: `deepEqual(legacy.schema, mastra.inputSchema)` for all 29 |
| 2 | Tool-name collisions in `tools/list` if both servers loaded | Client ambiguity / shadowing | Prefix Mastra tools with `mastra_` (§4 option 1) |
| 3 | C5 factory must reproduce `coerceParamsToSchema` (5/6 cases) | Depth bound 3 vs 2; `typeName` introspection breaks on `ZodEffects` | Run ported tests as the contract; reconcile at C5 |
| 4 | Runtime gates NOT needed on Mastra server (per §3.9 of research-260611-2216) | N/A — confirmed not a blocker | Skip gate re-implementation in Plan 1 |
| 5 | `mechanism_check` flag (B5 LIM-2) | Re-apply automatically? | Yes — handler is preserved; schema at `meta-state-patch-tool.js` was updated in B5 |
| 6 | Cold-session E2E test enumeration | New server needs its own E2E? | No — Plan 1 keeps legacy as primary; Plan 2 (C4) gets a separate parity E2E |
| 7 | `pnpm install @mastra/*` may be blocked by bash gate | Install path uncertain | Try root `package.json`; if blocked, use `/tmp/mastra-install.<hash>/` for verification only |

---

## 8. Concrete Migration Spec — Summary

### New files (Plan 1)

| Path | Purpose | Size |
|---|---|---|
| `tools/learning-loop-mastra/package.json` | Name, deps, bin | ~25 lines |
| `tools/learning-loop-mastra/server.js` | MCPServer + startStdio | ~50 lines |
| `tools/learning-loop-mastra/create-loop-tool.js` | C5 factory | ~120 lines |
| `tools/learning-loop-mastra/agent-manifest.json` | Tool grouping | ~80 lines |
| `tools/learning-loop-mastra/schemas.js` | Re-export of legacy schemas | ~10 lines |
| `tools/learning-loop-mastra/tools/manifest.json` | 29 file→export entries | ~30 lines |
| `tools/learning-loop-mastra/tools/*.js` | 29 createTool wrappers | ~50 lines each (thin) |
| `tools/learning-loop-mastra/__tests__/wire-format-*.test.js` | 4 ported tests | ~200 lines each |
| (modified) `package.json` | +`@mastra/core`, `@mastra/mcp`; +10th test glob | +3 lines |
| (modified) `.mcp.json` | +`learning-loop-mastra` peer | +4 lines |
| (modified) `.factory/mcp.json` | +`learning-loop-mastra` peer | +4 lines |

### Plan 1 acceptance gate
- `pnpm test` passes 9/9 namespaces against legacy (durable anchor)
- 4 ported `wire-format-*.test.js` pass against `createLoopTool` (20 tests total in namespace 10)
- Both `.mcp.json` files enumerate both servers

---

## 9. Unresolved Questions (Open for Plan 1 / C3 / C5)

1. **MCP client-side tool-name namespacing (option 3 in §4):** does Claude Code 1.x or Droid CLI prefix tools with the server name? Verify at C3. **Confidence 30%.**
2. **C5 depth bound (3 vs 2):** the C5 factory uses `MAX_RECURSION_DEPTH = 2`; legacy uses `MAX_RECURSION_DEPTH = 2`. The ported `wire-format-patch-recursion.test.js` is the contract. **Confidence 95% (matched legacy).**
3. **Mastra's `coerceStringifiedJsonValues` for `ZodObject`:** does it handle JSON-string→object (case 5)? Probe didn't enumerate this. **Confidence 70%.**
4. **pnpm install for `@mastra/*` and the bash gate:** may be blocked by `constraint-pnpm-install-tooling`. Plan 1 should attempt at start; escalate if blocked. **Confidence 50%.**
5. **`bin` field vs. `node <path>` invocation:** recommend `node <path>` for symmetry, include `bin` for future npx. Confirm with operator. **Confidence 85%.**
6. **`runtime_state_record` grouping:** legacy groups it with `gate` (semantically odd). Preserve in Plan 1; revisit at C7. **Confidence 95%.**
7. **Mastra version pinning:** pin to tested minor (exact, not `^`) per existing `@modelcontextprotocol/sdk@1.29.0` pattern. **Confidence 95%.**

---

## Key Decisions Surfaced to Parent

1. **Object key wins, not `id` (95% confidence).** This is the most important API surface finding. The C5 factory must set `id === legacy.name`, and the server.js loop must use the same string as the object key in the `tools` map. All three must align.

2. **`mastra_` prefix recommended for tool names (70% confidence).** C3 should verify whether MCP clients namespace by server name first; if not, the prefix is the safe path.

3. **29 tools, not 36 (90% confidence).** The brainstorm and tracker cite 36 from the pre-Phase-A count. Post-Phase-A, the deterministic meta-surface subset is 29. The C2 manifest should reflect 29.

4. **`MAX_RECURSION_DEPTH = 2` is the right value (95% confidence).** Matches the legacy `tool-registry.js:4` constant exactly. The ported `wire-format-patch-recursion.test.js` will lock this.

5. **No `packages:` key in `pnpm-workspace.yaml` (90% confidence).** Add `@mastra/*` to root `package.json#dependencies` to match the flat single-package layout.

6. **No runtime gate re-implementation needed (95% confidence).** Per `research-260611-2216` §3.9: hooks stay at the runtime layer in Mode 1.

7. **`bin` field is optional (85% confidence).** Include for future npx use; invoke via `node <path>` for symmetry with legacy.

## Blocking Questions

None. All deliverables are specifiable; the open questions are runtime-verifiable at C3 / C5 sub-phases, not blockers for Plan 1's authoring.

---

## Key File Paths (Absolute)

- `https://mastra.ai/reference/tools/mcp-server` (WebFetch verified)
- `https://mastra.ai/reference/tools/create-tool` (WebFetch verified)
- `https://mastra.ai/guides/guide/publishing-mcp-server` (WebFetch verified)
- `https://zod.dev/api?id=preprocess` (WebFetch verified)
- `/home/datguy/codingProjects/learning-loop-template/.agents/skills/mastra/SKILL.md`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/server.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/tool-registry.js` (lines 77-137, 197-235)
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/agent-manifest.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/tools/manifest.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js`
- `/home/datguy/codingProjects/learning-loop-template/pnpm-workspace.yaml`
- `/home/datguy/codingProjects/learning-loop-template/package.json`
- `/home/datguy/codingProjects/learning-loop-template/.mcp.json`
- `/home/datguy/codingProjects/learning-loop-template/.factory/mcp.json`
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/productization-260612-1530-master-tracker.md`
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md`
