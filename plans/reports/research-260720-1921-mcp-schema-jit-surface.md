# Research: MCP tool schema surface — JIT contract + glossary dedupe inventory

Date: 2026-07-20. Read-only scout. Root: `learning-loop-template-meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent`.
All paths below relative to repo root unless absolute. Package prefix `tools/learning-loop-mastra/` abbreviated `LLM/`.

## 1. How tools are defined and wired

**Manifest** — `LLM/tools/manifest.json` (JSONC, 32 entries, lines 24–57). Per entry: `{ "file": "tools/<name>-tool.js", "export": "<exportName>", "pathFields": [] }`. `file` is canonical; actual implementation lives at `LLM/tools/handlers/<name>-tool.js` (rewrite in `LLM/core/manifest-loader.js:40-54`, `resolveToolFile` / `resolveToolImportUrl`).

**Server wiring** — `LLM/mastra/server.js:45-68`: for each manifest entry, dynamic-imports the handler module, reads `legacy.{name,description,schema,parityJsonSchemaHints}`, registers `tools["mastra_"+name] = createLoopTool({ id, description, inputSchema: legacy.schema, execute: adaptLegacyHandler(legacy), pathFields, parityHints })`. Plus:
- inline `mastra_update_r2_allowlist` (server.js:77-107),
- 8 `run_workflow_*` tools via `LoopMCPServer.convertWorkflowsToTools` (server.js:149-239, description synthesized at line 178),
- 3 `ask_*` agent tools from `mastra/agents-manifest.json`.
Total on wire: 32 + 1 + 8 + 3 = 44 (matches `LLM/__tests__/helpers/manifest-constants.cjs` — `AGENT_MANIFEST_TOTAL_TOOLS: 44, TOOLS_MANIFEST_ENTRIES: 32, WORKFLOW_GROUP_TOOLS: 11, AGENT_MANIFEST_GROUPS: 6`).

**Per-tool definition pattern** — each `LLM/tools/handlers/<name>-tool.js` exports a plain object `{ name, description, schema, handler, [parityJsonSchemaHints] }`. `schema` is either a plain zod shape object (most tools, e.g. patch tool lines 29-41) or a ZodObject (log_change builds `z.object({...}).strict().shape` at line 45; report passes `metaStateFindingEntrySchema.shape` at line 15). No tool defines an outputSchema — responses are `{ content: [{type:"text", text: JSON.stringify(result)}] }`, unwrapped by `mastra/handler-adapter.js:12-26`. Enriching error payloads is wire-safe (no output validation).

**Wire JSON-schema generation (single choke point)** — `LLM/mastra/create-loop-tool.js`:
- `normalizeInputSchema` (18-28): wraps plain shapes in `z.object()`.
- `attachParityJSONSchema` (30-71): `buildParitySchema` (`LLM/mastra/schema-parity.js:15-111`) unwraps `z.preprocess`/guarded-boolean pipes so wire shape matches pre-migration baseline; `z.toJSONSchema(parity, {target:"draft-7", io:"input"})` (32-35); merges `parityHints` per-field via `Object.assign` (45-51); then **`schema._zod.toJSONSchema = () => clone(parityJSONSchema)` (line 69)** — the override honored through Mastra's `MCPServer.convertSchema → standardSchemaToJSONSchema → ~standard.jsonSchema.input` (docs/mcp-tool-schema-architecture.md §3.5, e2e-verified). This line is where every tool's wire schema is finalized; the JIT treatment can hook here or upstream in the handler's `schema` def.
- `createLoopTool` (73-85) wraps execute with `withR2Gate` (`mastra/with-r2-gate.js:39-75`, R2 write-gate; pathFields:[] short-circuits).

## 2. meta_state_patch deep-dive

**Source of the 4-branch union** — `LLM/core/meta-state.js`:
- `metaStateFindingEntrySchema` 307-362; `metaStateChangeEntrySchema` 368-440; `metaStateRuleEntrySchema` 446-499; `metaStateLoopDesignSchema` 505-527.
- `metaStateEntrySchema = z.preprocess(withDefaults, z.union([...4]))` 534-542.
- `IMMUTABLE_PATCH_FIELDS` Set 571-584; `PATCH_KINDS = ["finding","change-log","rule","loop-design"]` 595.
- `buildPatchSchemaFor(kind)` 625-636 — per-kind projection: `.omit({entry_kind:true[,status:true]}).partial().strict()`. Pure projection of the 4 branch schemas.

**Tool definition** — `LLM/tools/handlers/meta-state-patch-tool.js`:
- `parityJsonSchemaHints: { patch: { minProperties: 1 } }` 26-28 (generation-only steering, plan 260717-1145 Phase 2).
- `schema` 29-41; the union: line 33 `patch: z.preprocess(deepStripEnvelope, z.union(PATCH_KINDS.map((k) => buildPatchSchemaFor(k))))` with a 659-char `.describe()` at line 34.
- Handler: branch validation at **142-157** (`buildPatchSchemaFor(entry_kind).safeParse(effectivePatch)` → `{patched:false, reason:"invalid_field", field_errors:[{field,message}]}`) — confirmed exactly where the assignment said. `empty_patch` check 119-129 (`hint: buildEmptyPatchHint(entry_kind)`, builder 228-234). `immutable_field` 90-107. `validation_failed` 180-184 (bare — `updateEntry` returns only the string, no issues; enriching it needs a `core/meta-state.js` `updateEntry` change, 1114+).

**What must change for the JIT treatment:**
- (a) Free-form on-wire patch: replace the union at **meta-state-patch-tool.js:33** with a permissive object schema. Two hard constraints from existing tests: (i) runtime `.parse({})` MUST still succeed — pinned by `__tests__/mcp-tools-list-parity.test.js:143-150` (Test 7) so the handler-level `empty_patch` check (119-129) stays the safety net; (ii) wire `patch.minProperties >= 1` MUST remain — pinned by same file ~115-127 (Test 5), already satisfied by keeping the `parityJsonSchemaHints` entry (26-28). Alternative low-touch path: keep the zod union but override the wire view via the parity seam (`create-loop-tool.js:45-51` merge-sets keys on `parityJSONSchema.properties.patch`; replacing `anyOf` requires the hint object to carry `anyOf: undefined` — works but hacky; editing line 33 is cleaner).
- (b) JIT schema in error payloads: add `patch_schema: z.toJSONSchema(buildPatchSchemaFor(entry_kind), {target:"draft-7", io:"input"})` to the `invalid_field` result (144-157) and optionally `empty_patch` result (119-129). Branch JSON-schema sizes measured: finding 5,969B / change-log 5,715B / rule 3,688B / loop-design 1,836B. Do NOT serialize the tool's root schema directly (the `_zod.toJSONSchema` override makes direct `z.toJSONSchema(root)` return the `{$ref:"#"}` sentinel outside Mastra's convert path — docs §3.3; branch schemas carry no override, safe).
- Wire savings measured: patch property alone is **17,693B of the 19,022B** tool schema (union-as-wire 17,067B); free-form `{type:"object",minProperties:1}` + short description ≈ 65B+desc → ~17.4KB (88%) off this tool.
- Batch twin (shares the design): `meta-state-batch-tool.js` opSchema 26-46 (discriminated union, whole tool only 2,358B — slimming optional); per-branch preflight `preflightUpdateOp` 127-149, `buildInvalidFieldResult` 177-196, `formatFieldIssue` 200-205, `buildNoContentResult` 154-173, `buildNoContentHint` 212-215.

## 3. listMutableFieldsCsv

- Canonical file: `tools/lib/patch-hints.js` (repo-root `tools/lib/`, OUTSIDE the MCP package). Signature: `listMutableFieldsCsv(entryKind, fallback) -> string`. Derives field list from `buildPatchSchemaFor(entryKind)._zod?.def?.shape` keys (imports `../learning-loop-mastra/core/meta-state.js`), priority-orders `["description","evidence_code_ref"]` first, caps at 12, returns `fallback` on unknown kind.
- Re-export shim: `LLM/tools/lib/patch-hints.js` (exists only so fallow's analysis root sees the module; mirror precedent `tools/lib/gate-logging.js`).
- Consumers: `meta-state-patch-tool.js:12` (buildEmptyPatchHint, 228-234 — patch tool's `empty_patch.hint`) and `meta-state-batch-tool.js:4` (buildNoContentHint, 212-215 — batch's `no_content.hint`). Registered in `LLM/.fallowrc.json` `dynamicallyLoaded` + `ignoreExports`.
- NOT used in any tool description or wire schema today — hint text is computed per-error at runtime.

## 4. Cross-tool prose duplication (measured)

Per-tool wire sizes (draft-7 parity JSON + hints, my measurement via the same code path as create-loop-tool; excludes `$schema` key and MCP framing, so ~5-8% below the plan's quoted figures):
| tool | schema B | desc B | total |
|---|---|---|---|
| meta_state_patch | 19,022 | 700 | 19,722 |
| meta_state_report | 6,076 | 1,195 | 7,271 |
| meta_state_log_change | 4,172 | 599 | 4,771 |
| meta_state_list | 2,085 | 1,271 | 3,356 |
| meta_state_batch | 2,358 | 451 | 2,809 |
| meta_state_promote_rule | 1,961 | 252 | 2,213 |
| **32 manifest tools** | **50,544** | **16,711** | **67,255** |

+8 workflow tools ≈ 6,333B, + update_r2_allowlist, + 3 ask_* agents → the plan's ~82.5KB total is plausible.

Repeated prose blocks:
- **Within the patch union** (the big win — killed by treatment 2a): 14 fields appear in ≥2 branches — `id, created_at, affected_system, code_ref, ledger_ref` in all 4; `description, evidence_journal, evidence_code_ref, evidence_test` in 3; `status, code_fingerprint, expires_at, applies_to, supersedes` in 2. Branch descriptions live in `core/meta-state.js` field `.describe()`s (307-527) — editing them touches report/log_change wire schemas too (they reuse `.shape`).
- **Across flat tools (excluding patch)**: exact-duplicate description strings total only **264B / 6 strings**. So the glossary treatment's flat-tool win is NOT exact dupes; it is (i) long unique prose moved off-wire and (ii) near-duplicates:
  - `operation_envelope` nested block: `core/meta-state.js:420-439` (~1.4KB inside log_change's 4,172B) vs batch's `envelope` def `meta-state-batch-tool.js:63-73` (~700B) — overlapping kind/target descriptions ("Magnitude kind; see loop-design-operation-envelope-on-change-log", "Identifier for the batch's target...").
  - status enum prose `core/meta-state.js:326-327` (358B); id-format text variants at 308 / 369 / 507 ("Standard meta-state id (meta-YYMMDDTHHmmZ-slug...)").
  - evidence fields: `evidence_code_ref`/`evidence_journal`/`evidence_test` described at 323-325 (finding), 398-403 (change-log), 464-469 (rule).
  - Tool-level descriptions: report 1,195B (`meta-state-report-tool.js:14`), list 1,271B (`meta-state-list-tool.js:58`), re_verify 1,077B, resolve 936B, patch 700B (`meta-state-patch-tool.js:20`).
- `core/field-glossary.js` does NOT exist (grep "glossary" across core/mastra/docs: zero hits). Serving point for the glossary: `loop_describe` cold tier — `loop-describe-tool.js` cold branch at ~139-170 (currently emits full tool descriptions at 139-142); a `result.field_glossary` block slots there.

**Zod validation error generation/formatting (JIT-enrichment injection points):**
1. **Loop-owned, structured** (best): `meta-state-patch-tool.js:144-157` (invalid_field `field_errors`), `119-129` (empty_patch `hint`); `meta-state-batch-tool.js:177-196` + `200-205` (formatFieldIssue). These return JSON — attach glossary entries / branch schemas freely.
2. **Core write-time**: `core/meta-state.js:1076-1078` (`writeEntry` safeParse → `InvalidEntryError` 659-665, uses zod `.format()`); batch write validation 1502. Entry-ref validation prose: `entryIdRefsRefine` 284-297.
3. **MCP-level top-level argument validation (pre-execute)**: `node_modules/@mastra/mcp/dist/index.js:3186-3202` — formats `Tool validation failed. ... - <path>: <message>` from `validation.error.errors`. NOT loop-owned; enrichment only possible via zod-side error customization (custom messages in the schema `.describe()`/error params at the definition sites) since node_modules can't be patched.

## 5. Tests — break-risk inventory

205 test files under `LLM/__tests__/` (incl. legacy-mcp/). Zero snapshot tests (`toMatchSnapshot`/`$defs` greps: no hits).

**Wire-shape / description-CONTENT assertions (break-risk):**
- `__tests__/mcp-tools-list-parity.test.js` — spawns server, asserts wire inputSchemas:
  - Test 5 (~115-127): `patch.minProperties >= 1` on wire — KEEP the parity hint.
  - Test 7 (143-150): `metaStatePatchTool.schema.patch.safeParse({})` must SUCCEED — KEEP runtime schema permissive; do not add `.min(1)`/refine to the runtime zod.
  - Test 1 (55-64): every tool inputSchema is `{type:"object", properties:{...}}` — a free-form patch keeps this true.
  - Tests 2/3/4/6: sweep empty schema, archive `default:[]`, resolve cascade array, list has no minProperties — unaffected.
- `__tests__/legacy-mcp/meta-state-report-description.test.js` (whole file) — asserts report description CONTAINS "evidence_code_ref", "meta_state_derive_status", "Markdown paths in `source_refs` are deprecated", and NOT "Prefer `evidence_code_ref`". Breaks on description rewrite unless tokens preserved or test updated.
- `__tests__/legacy-mcp/schemas-write-gate.test.js:83,93` — `gateMarkPreflightTool.description` includes "schemas" (not a plan target; note pattern).
- `__tests__/legacy-mcp/loop-describe.test.js:312` — `loopDescribeTool.description` includes "session start" (case-insensitive).
- `__tests__/cold-session-enumerate-mastra.test.cjs:100-115` and `__tests__/legacy-mcp/mcp-protocol-e2e.test.cjs:83-87` — every tool has non-empty string description + object inputSchema (safe under shortening; only emptiness breaks).
- `__tests__/manifest-arithmetic.test.cjs` + `__tests__/helpers/manifest-constants.cjs` — tool COUNT assertions (44/32/11/6); safe if no tools added/removed (glossary via loop_describe cold tier adds none).

**Behavior assertions (safe — assert structured payloads, not prose):**
- `__tests__/legacy-mcp/meta-state-patch-tool.test.js` — `empty_patch` reason + hint includes "meta_state_supersede"/"meta_state_resolve" (297-302 — preserve those tokens in hints); `invalid_field` field_errors[].field/.message (364-389, 401-425, 432+); `immutable_field` (344). ADDITIVE keys (e.g. `patch_schema`) on these payloads do not break it.
- `__tests__/legacy-mcp/meta-state-batch-tool.test.js:534-567` — no_content/invalid_field payload shapes (hint string, field_errors naming `category`).
- `__tests__/legacy-mcp/meta-state-patch-immutable-fields.test.js` — full IMMUTABLE_PATCH_FIELDS list in error.
- `__tests__/legacy-mcp/meta-state-patch-derived-schema.test.js` — `{item:[...]}` envelope unwrap round-trip via real server (depends on `deepStripEnvelope` staying on the patch schema path — keep the preprocess or the handler-level strip at meta-state-patch-tool.js:49).
- `__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js`, `__tests__/legacy-mcp/cold-session-discoverability.test.cjs:133-180` (report+patch chain) — behavior.
- `__tests__/coerce-correctness.test.js` — 7 shim parity tests (schema-parity.js), no description content.
- `__tests__/legacy-mcp/meta-state-schema*.test.js` (schema, rule-schema, loop-design-schema, schema-extension, schema-stale-only) — core schema shape/rejection behavior; grep confirms NO `.describe()` content asserts. Shortening core descriptions is test-safe.
- `__tests__/agent-prompt-content.test.cjs`, `agent-parity.test.cjs` — agent instructions, unrelated.

## 6. docs/mcp-tool-schema-architecture.md — zod→wire flow in 5 bullets

1. Each tool file exports a zod inputSchema (possibly wrapped in `z.preprocess`/guarded-boolean unions); server.js registers it via `createLoopTool`.
2. `create-loop-tool.js` normalizes to a ZodObject, builds a parity view (`buildParitySchema` unwraps migration wrappers), converts with `z.toJSONSchema({target:"draft-7", io:"input"})`, and overrides `schema._zod.toJSONSchema` to return that precomputed JSON (clone per call — zod mutates it).
3. On `tools/list`, Mastra's `MCPServer.convertSchema` → `@mastra/schema-compat standardSchemaToJSONSchema` → zod `~standard.jsonSchema.input` → zod's `process()` checks `_zod.toJSONSchema?.()` at `zod/v4/core/to-json-schema.js:49` and uses the override; e2e-verified for all tools (the synthetic-probe `{$ref:"#"}` quirk does not occur on the production path).
4. Parse behavior stays strict — the override is generation-only; runtime validation uses the real wrapped zod schema. `parityHints` (e.g. patch minProperties) merge extra draft-7 constraints into the wire view without touching `.parse()`.
5. Regression nets: `coerce-correctness.test.js` (7 shim parity cases) + `mcp-tools-list-parity.test.js` (e2e through a spawned server); zod pinned 4.4.x (`package.json`) because the shim uses internal `_zod` APIs.

## 7. Landmines

- **Two pinned invariants on patch**: wire `minProperties>=1` AND runtime `parse({})` success (mcp-tools-list-parity Tests 5+7). The JIT design must slim the wire view without tightening the runtime schema — mirror the existing generation-only `parityJsonSchemaHints` pattern.
- **Report description tokens** locked by meta-state-report-description.test.js ("evidence_code_ref", "meta_state_derive_status", "Markdown paths in `source_refs` are deprecated").
- **Hint tokens** "meta_state_supersede"/"meta_state_resolve" locked in patch empty_patch hint (patch-tool test 301-302) — keep in any glossary-derived hint.
- **Do not call `z.toJSONSchema` on a tool's ROOT schema** outside Mastra's convert path (override → `{$ref:"#"}` sentinel; docs §3.3). Serialize branch schemas directly for JIT payloads.
- **Fallow config** (`LLM/.fallowrc.json`): a new `core/field-glossary.js` imported statically by handlers is reachable (dynamicallyLoaded covers `tools/handlers/**`); if the glossary lands OUTSIDE `tools/learning-loop-mastra/` (like `tools/lib/patch-hints.js`), it needs `dynamicallyLoaded` + `ignoreExports` entries AND an inside-root re-export shim (precedent: `LLM/tools/lib/patch-hints.js`). Fallow's new-only dup gate previously forced the patch-hints centralization (dup:7bcb1118) — expect it to flag NEW duplicated glossary prose, not existing.
- **manifest counts**: adding the glossary as a new MCP TOOL would break manifest-constants (44/32/11/6) in 4 test files; serving it inside `loop_describe` cold tier avoids all count churn.
- **`server.js:251`** description string says "31 tools + 10 workflows + 3 agents" — stale (wire truth: 32+8+3 agents, 44 tools); not test-locked, worth fixing while nearby.
- **`tools/handlers/references/tool-selection-guide.md`** — human-facing intent→tool map; already stale (mentions removed `meta_state_ack`, line ~22); should gain a glossary pointer when descriptions shorten, but no test locks it.
- **`updateEntry` validation_failed** (patch tool 180-184) returns no zod details — enriching that path requires changing `core/meta-state.js:1114+` to return issues, not just the tool handler.
- **`entryIdRefsRefine`** (`core/meta-state.js:284-297`) prose ships on-wire inside report/propose_design schemas AND fires at core write time — it is both wire prose and error message; dedupe via glossary needs to keep the zod message intact for core callers.
- **MCP-level arg-validation formatter lives in node_modules** (`@mastra/mcp/dist/index.js:3186-3202`) — top-level "missing required arg" errors cannot be glossary-enriched without zod-side message customization at the schema definition sites.

Status: DONE
Summary: Full inventory delivered: wire generation chokes at create-loop-tool.js:69 (`_zod.toJSONSchema` override); patch union is meta-state-patch-tool.js:33 with branch validation at 142-157 (JIT payload point) — slimming it saves ~17.4KB of the measured 67.3KB manifest-tool wire surface; flat-tool exact-prose dup is only 264B so the glossary win is long unique prose + near-dupes (operation_envelope, evidence fields, status/id prose); error-enrichment points are the loop-owned invalid_field/empty_patch payload builders (MCP-level formatting is node_modules-locked). Break-risk tests: mcp-tools-list-parity (minProperties + parse-{} pins), meta-state-report-description (content tokens), manifest-constants (counts); everything else asserts behavior and tolerates additive payload keys.
Concerns/Blockers: none
