---
title: "meta_state_patch MCP tool + tool-registry wire-format coercion fix"
description: "Closes meta-260608T0848Z-crud-coverage-gap (CRUD update/patch) and the parent meta-260606T2102Z-agent-used-direct-file-i-o escape-hatch abuse (auto-resolved by TTL 2026-06-08, but the escape hatch is still in use because the fix never shipped). Ships 1 new MCP tool (meta_state_patch) that wraps the existing updateEntry primitive with CAS, plus a generic wire-format coercion fix in tool-registry.js#registerTool that benefits all 3 affected tools (propose_design, report, patch) and any future tools. Unifies the 4 escape-hatch use cases (backfill fingerprint / update addresses / refresh evidence_code_ref / resolve via cached state) into one canonical path."
date: "2026-06-08T10:15:00Z"
tags: [meta, mcp-tools, meta-state, crud, escape-hatch, wire-format, coercion, zod, mcp-sdk, tdd]
status: draft
session: 260608-meta-state-patch
supersedes: null
superseded_by: null
related:
  - meta-state.jsonl entry meta-260608T0848Z-crud-coverage-gap-the-mcp-meta-state-tool-surface-covers-cre (closed by this design)
  - meta-state.jsonl entry meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met (parent escape-hatch finding; auto-resolved by TTL 2026-06-08, but underlying anti-pattern still in use; lineage preserved in change-log)
  - meta-state.jsonl entry meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g (wire-format coercion root cause; fixed in same plan)
  - meta-state.jsonl loop-design-cross-reference-fields (proposed_design_for populated by this design — the recursive proof)
  - tools/learning-loop-mcp/core/meta-state.js#updateEntry (the primitive that ships, no new core logic)
  - tools/learning-loop-mcp/core/meta-state.js#metaStateEntryPatchSchema (existing z.object({}).passthrough() patch validator)
  - tools/learning-loop-mcp/tool-registry.js#registerTool#wrappedHandler (wire-format fix point)
  - tools/learning-loop-mcp/tools/manifest.json (registration of new tool)
  - tools/learning-loop-mcp/agent-manifest.json (meta_state group registration)
  - tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js (existing tool that benefits from wire-format fix)
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js (existing tool that benefits from wire-format fix)
  - plans/260606-rule-loop-design-first-class/plan.md (precedent plan with 5-phase TDD; this plan follows same pattern)
  - plans/260606-rule-loop-design-first-class/phase-03-propose-design-tool-tdd.md (template for new tool phase)
  - plans/reports/research-260603-2200-zod-description-passthrough.md (prior research on Zod/MCP interop)
related_findings:
  - meta-260608T0848Z-crud-coverage-gap-the-mcp-meta-state-tool-surface-covers-cre (mcp-tool-missing, active)
  - meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met (loop-anti-pattern, expired+auto-resolved; lineage preserved)
  - meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g (loop-anti-pattern, expired+auto-resolved; fixed in same plan)
  - meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe (loop-anti-pattern, expired+auto-resolved; structurally identical to CRUD gap; closed transitively)
  - loop-design-cross-reference-fields (active; addresses + proposed_design_for populated by this design)
---

# meta_state_patch MCP tool + tool-registry wire-format coercion fix

## TL;DR

The `meta_state_*` MCP tool surface covers Create, Read, and (partially) Resolve, but **lacks Update/Patch on existing entries**. This forces agents to use the `node -e "import('#mcp/core/meta-state.js')"` escape hatch for any field-level update (backfill fingerprint, edit loop-design `addresses`, refresh `evidence_code_ref`, etc.). The recursive self-reference: **filing the CRUD finding required using the escape hatch the finding describes** (direct I/O to update `loop-design-cross-reference-fields#addresses`).

This plan ships **two coupled fixes in one TDD plan**:

1. **New `meta_state_patch` MCP tool** — a thin wrapper over the existing `core/meta-state.js#updateEntry` primitive (which already has CAS via `_expected_version` and a per-root write queue). The patch tool unifies the 4 documented escape-hatch use cases into one canonical path.
2. **Wire-format coercion fix in `tool-registry.js#registerTool`** — generic helper `coerceParamsToSchema(args, schema)` that walks each tool's Zod schema and re-hydrates coerced top-level array/boolean/number values from strings. Fixes all 3 affected tools (propose_design, report, patch) and any future tool that has a complex-typed top-level field.

Plus: `meta-260606T2102Z` lineage preserved via change-log, `loop-design-cross-reference-fields` updated to populate `proposed_design_for` (the recursive proof), and the CRUD finding resolved with the supersede narrative.

**Plan mode:** `/ck:plan --tdd`. ~3h estimated effort. 3 phases (Red/Green/Refactor), 10 new tests, 1 new tool, 1 generic fix, 1 supersede narrative.

## Problem Statement

### The 2 active findings + 2 closely-related

| Finding | Status | Class | Closed by |
|---------|--------|-------|-----------|
| `meta-260608T0848Z-crud-coverage-gap-...` | reported, active | mcp-tool-missing | `meta_state_patch` tool ships |
| `meta-260606T2102Z-agent-used-direct-file-i-o-...` | expired+auto-resolved | escape-hatch-abuse | lineage preserved in change-log; structurally closed by patch tool |
| `meta-260606T2202Z-top-level-array-and-boolean-...` | expired+auto-resolved | mcp-wire-format-coercion | fixed in tool-registry.js#coerceParamsToSchema |
| `meta-260606T2106Z-agent-called-meta-state-log-change-5-times-...` | expired+auto-resolved | tool-retry-loop | structurally closed by CAS (idempotency-by-version) |

### 4 documented escape-hatch use cases (all in CRUD finding description)

1. **Backfill `code_fingerprint` on a resolved finding** — `updateEntry({ code_fingerprint, version: expected })` because the backfill script skips findings with `mechanism_check: true`.
2. **Update `addresses` on an existing loop-design** — `updateEntry({ addresses: [...] })` because `meta_state_propose_design` returns `already_exists` on id collision.
3. **Resolve a finding when the MCP server uses cached state** — direct I/O to bypass the stale `checkResolutionEvidence` in the long-lived MCP server process.
4. **Update `evidence_code_ref` after a `:line` → `#anchor` refactor** — `updateEntry({ evidence_code_ref })` because no tool supports partial updates.

All 4 are **partial-field updates with no full-payload replacement needed.** The `updateEntry` primitive handles all 4; the gap is only the MCP tool wrapper.

### Why the user pushed for "fix both at the same time"

The two findings are structurally identical: one describes the *symptom* (CRUD gap), the other describes the *consequence* (escape-hatch abuse). Filing the CRUD finding required using the escape hatch the finding describes — the recursion is breaking the system right now. Fixing only one leaves the other open: closing CRUD closes the gap, but not the *practice*; closing the practice without the tool just moves the practice to a different escape hatch.

### Wire-format coercion as root cause (the unblocker)

The CRUD finding's "Concrete fix" mentions both `meta_state_patch` and `meta_state_propose_design` update mode. But even with the new tool, the patch itself must accept complex-typed fields (the `addresses` field in the loop-design update is itself a top-level array). Without fixing the coercion bug, the patch tool would inherit the bug and the recursion continues.

The wire-format coercion bug (`meta-260606T2202Z`):
- `meta_state_propose_design` with `proposed_design_for=['x']` → Zod error "expected array, received object"
- `meta_state_report` with `mechanism_check=false` → Zod error "expected boolean, received string"
- Root cause: MCP SDK v1.29.0 wire framing coerces top-level array/boolean parameters

The existing workaround (used in `meta_state_log_change`) is to nest complex types in object fields. The new patch tool uses the same pattern: `patch: { addresses: [...] }` instead of `addresses: [...]` at top level.

## Evaluated Approaches

### Scope dimension (Q1 of discovery)

#### A. `meta_state_patch` only (CHOSEN)

Single new MCP tool. Wraps `updateEntry` with MCP-layer validation + audit log. CAS via `_expected_version`.

**Pros:** lowest blast radius; mirrors CRUD finding's primary proposal; 1 new file + 1 manifest entry + 1 test file; unifies 4 escape-hatch use cases; idempotency-by-CAS handles the retry-loop case (`meta-260606T2106Z`).
**Cons:** doesn't close the "append-only with already_exists" gap on `meta_state_propose_design` (out of scope per user).
**Decision:** ✓ CHOSEN.

#### B. `meta_state_patch` + `meta_state_propose_design` update mode (rejected)

Patch tool + an `update_or_create` flag on propose_design that mutates `addresses`/`proposed_design_for` on existing entries.

**Pros:** closes both the "no patch" gap AND the "no edit-on-existing" gap.
**Cons:** ~2x the surface area; 2 schemas to maintain; 2 manifest entries; 2 test files; some operations land in one tool, some in the other; 2 places for audit log to live.
**Why rejected:** the patch tool is sufficient — agents who want to edit a loop-design call `meta_state_patch` with the loop-design's id. The `update_or_create` flag on propose_design adds a confused responsibility (propose OR update?) without clear win.

#### C. Full CRUD: patch + soft-delete + archive (rejected)

Adds `meta_state_archive` (status=archived) and `meta_state_undo_resolve` to the surface.

**Pros:** "D" in CRUD is finally a first-class operation.
**Cons:** 2 more tools, more tests, opens questions about archive visibility (does it appear in `meta_state_list` by default? how does it interact with the 7-day compaction in `updateEntry`?). Out of scope; not mentioned in the user request.
**Why rejected:** scope creep. The user asked for the 2 findings to be closed, not for full CRUD coverage.

### Wire-format dimension (Q2 of discovery)

#### A. Defensive design only: nest arrays in object fields (rejected)

The new `meta_state_patch` tool's schema uses `patch: { addresses: [...] }` instead of `addresses: [...]` at top level. Existing tools unchanged.

**Pros:** simplest; no global state; no magic.
**Cons:** the 2 EXISTING tools (propose_design, report) still have the bug; the recursion continues in the existing tools; agents will continue to work around the bug for those 2 tools.
**Why rejected:** the user said "fix coercion in same plan" — defensive-only doesn't actually fix the coercion, it works around it for the new tool.

#### B. Server-level fix in `tool-registry.js` (CHOSEN)

Add a `coerceParamsToSchema(args, schema)` helper to `tool-registry.js#registerTool#wrappedHandler`. Walks each tool's Zod schema, detects top-level `ZodArray` / `ZodBoolean` / `ZodNumber` fields, re-hydrates coerced values from strings/objects. Called BEFORE `config.handler(args)`.

**Pros:**
- One place to fix; all 3 affected tools benefit (propose_design, report, patch).
- Generic — works for any future tool with complex-typed top-level fields.
- Localized to the registry layer; no per-tool changes.
- ~50 lines + a small introspection helper.

**Cons:**
- Magic — could mask future bugs if a tool genuinely wants a string that looks like a JSON array.
- Requires zod schema introspection (well-supported, low risk).
- Adds a layer of indirection.

**Risk mitigation:** the helper logs a `coerced` event via `appendGateLog` so any unexpected coercion is visible in the audit log. Tests assert that the helper is a no-op when args are already correctly typed.

**Decision:** ✓ CHOSEN.

#### C. Per-tool `z.preprocess` in each schema (rejected)

Add a custom preprocessor to each of the 3 affected tool schemas.

**Pros:** declarative; local to the tool.
**Cons:** 3 places to keep in sync; no automatic coverage for new tools; repetitive code.
**Why rejected:** the bug is structural, not per-tool. Generic fix wins.

#### D. Object-wrap canonical pattern (rejected)

Make `params: { ... }` the canonical shape for new tools. Object wrappers absorb coercion.

**Pros:** simplest schema design.
**Cons:** breaks API contract for existing tools (would need migration); awkward ergonomics (`params.patch.addresses` is 3 levels deep).
**Why rejected:** too disruptive for limited win.

### Lineage dimension (Q3 of discovery)

#### A. Resolve CRUD with supersede pointing at 2102Z (CHOSEN)

Resolve the CRUD finding with a resolution narrative that explicitly references 2102Z as the parent. File a single `meta_state_log_change` with `applies_to.findings: [2102Z, 0848Z]` and `change_diff.removed: ["direct-I/O escape hatch for meta-state CRUD"]`.

**Pros:** preserves the lineage between the parent anti-pattern and the structural fix; future agents see the full chain; matches the existing change-log pattern.
**Cons:** one extra change-log line.
**Decision:** ✓ CHOSEN.

#### B. Just resolve CRUD, ignore 2102Z (rejected)

Simplest, but loses the 2-day lineage.

#### C. Re-open 2102Z as active, then resolve both (rejected)

Most rigorous, but adds 2 audit-log lines for no real benefit. The auto-resolve is irreversible (TTL expired, entry compacted after 7 days).

### Plan mode (Q4 of discovery)

`/ck:plan --tdd` (CHOSEN) — locks current behavior in tests before adding the patch tool, matching the 5-phase TDD pattern used for `meta_state_propose_design` (see `plans/260606-rule-loop-design-first-class/plan.md`). ~3h estimated effort.

## Final Architecture

### 1. New tool: `meta_state_patch`

**File:** `tools/learning-loop-mcp/tools/meta-state-patch-tool.js`

**Schema:**
```js
{
  id: z.string().describe("Exact entry id to patch"),
  entry_kind: z.enum(["finding", "rule", "loop-design"])
    .describe("Entry kind branch — used to validate patch shape; change-log is immutable and rejected at handler"),
  patch: z.object({}).passthrough()
    .describe("Partial fields to update. Nest arrays/booleans in this object to avoid wire-format coercion. Use core/meta-state.js#metaStateEntryPatchSchema's passthrough semantics: any subset of union fields is valid."),
  _expected_version: z.number().optional()
    .describe("Optional CAS: patch succeeds only if current entry.version === _expected_version. On mismatch, returns { patched: false, reason: 'version_mismatch', current_version }."),
}
```

**Handler logic (mirrors `meta_state_propose_design` shape):**
1. Resolve root via `resolveRoot()`
2. Read registry via `readRegistry(root)`
3. **Not found check:** if no entry with `id`, return `{ patched: false, reason: "not_found", id }`
4. **Branch check:** if `entry.entry_kind !== entry_kind`, return `{ patched: false, reason: "branch_mismatch", id, expected: entry_kind, actual: entry.entry_kind }` (catches id-collision across branches)
5. **Change-log immutability check:** if `entry_kind === "change-log"`, return `{ patched: false, reason: "change_log_immutable", id }` (mirrors `meta_state_resolve` precedent)
6. **Call `updateEntry(root, id, patch)`** (handles CAS, version increment, compaction)
7. Handle `updateEntry` return values: `true` → success; `"validation_failed"` → return errors; `"version_mismatch"` → return with `current_version`; `null` → re-check not_found
8. **Audit log via `appendGateLog`** with `{ tool: "meta_state_patch", id, entry_kind, fields_patched: <Object.keys(patch)>, version: <new_version> }`
9. Return `{ patched: true, id, entry_kind, version, entry }`

**Touchpoints:**
- `tools/learning-loop-mcp/tools/manifest.json`: 1 new entry
- `tools/learning-loop-mcp/agent-manifest.json`: 1 new entry in `meta_state` group

### 2. Wire-format fix: `coerceParamsToSchema` in `tool-registry.js`

**File:** `tools/learning-loop-mcp/tool-registry.js`

**New helper:**
```js
function coerceParamsToSchema(args, schema) {
  if (!schema || !args || typeof args !== "object") return args;
  const shape = schema.shape;  // zod object shape
  if (!shape) return args;
  const coerced = { ...args };
  for (const [key, value] of Object.entries(args)) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;  // unknown field; let handler validation handle
    const typeName = fieldSchema._def?.typeName;
    // Strip optional/nullable wrappers to find the inner type
    const innerTypeName = typeName === "ZodOptional" || typeName === "ZodNullable"
      ? fieldSchema._def.innerType._def.typeName
      : typeName;
    if (innerTypeName === "ZodArray" && typeof value === "string") {
      try { coerced[key] = JSON.parse(value); } catch { /* leave as-is */ }
    } else if (innerTypeName === "ZodBoolean" && typeof value === "string") {
      if (value === "true") coerced[key] = true;
      else if (value === "false") coerced[key] = false;
    } else if (innerTypeName === "ZodNumber" && typeof value === "string") {
      const n = Number(value);
      if (!isNaN(n)) coerced[key] = n;
    }
  }
  return coerced;
}
```

**Wired into `registerTool#wrappedHandler`:**
```js
const wrappedHandler = async (args) => {
  try {
    const coerced = coerceParamsToSchema(args, config.schema);
    if (JSON.stringify(coerced) !== JSON.stringify(args)) {
      appendGateLog(root, { action: "wire_format_coerced", tool: config.name, fields: Object.keys(coerced).filter(k => coerced[k] !== args[k]) });
    }
    return await config.handler(coerced);
  } catch (error) { ... }
};
```

**Note on `root`:** `registerTool` currently doesn't have a `root` parameter. Need to add it (pass from `server.js` which already has `root`).

### 3. 2102Z supersede lineage

**File:** `meta-state.jsonl`

**Step 1:** Log a change-log entry (via `meta_state_log_change`) with:
- `change_target: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js"`
- `change_dimension: "surface"`
- `change_diff.added: ["meta_state_patch tool", "coerceParamsToSchema helper in tool-registry.js"]`
- `change_diff.removed: ["direct-I/O escape hatch for meta-state CRUD"]`
- `applies_to.tools: ["meta_state_patch", "meta_state_propose_design", "meta_state_report", "registerTool"]`
- `applies_to.findings: ["meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met", "meta-260608T0848Z-crud-coverage-gap-the-mcp-meta-state-tool-surface-covers-cre"]`
- `reason: minimum 20 chars explaining what shipped and the lineage`
- `evidence_code_ref: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js"`

**Step 2:** Call `meta_state_resolve({ id: "meta-260608T0848Z-...", resolution: "Superseded by meta_state_patch tool ship (commit <hash>). 2102Z escape-hatch closed transitively. Wire-format coercion fixed in tool-registry.js#coerceParamsToSchema. See change-log <id> for full lineage." })`.

### 4. Loop-design update (the recursive proof)

**File:** `meta-state.jsonl`

Call `meta_state_patch` on the existing `loop-design-cross-reference-fields` entry with:
- `id: "loop-design-cross-reference-fields"`
- `entry_kind: "loop-design"`
- `patch: { proposed_design_for: ["meta_state_patch"] }`
- `_expected_version: <current version>`

This is the first real-world use of the new tool — proves it works, and updates the design to be operationally useful (not just declarative).

## Test Plan (TDD, 3 phases)

### Phase 1: Red (tests first)

**`tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js`** (NEW, 6 tests):

1. **Happy path: patch a finding's `evidence_journal` field**
   - Setup: write a finding via `meta_state_report`, capture `version: 0`
   - Call: `meta_state_patch({ id, entry_kind: "finding", patch: { evidence_journal: "..." }, _expected_version: 0 })`
   - Assert: returns `{ patched: true, version: 1 }`; re-read registry confirms field updated; version is 1

2. **CAS mismatch returns version_mismatch**
   - Setup: write a finding, capture `version: 0`
   - Call: `meta_state_patch({ id, entry_kind: "finding", patch: { evidence_journal: "x" }, _expected_version: 99 })`
   - Assert: returns `{ patched: false, reason: "version_mismatch", current_version: 0 }`; registry unchanged

3. **Not found returns not_found**
   - Call: `meta_state_patch({ id: "nonexistent", entry_kind: "finding", patch: {} })`
   - Assert: returns `{ patched: false, reason: "not_found", id: "nonexistent" }`

4. **Change-log immutable returns change_log_immutable**
   - Setup: write a change-log entry via `meta_state_log_change`
   - Call: `meta_state_patch({ id, entry_kind: "change-log", patch: { reason: "tampered" } })`
   - Assert: returns `{ patched: false, reason: "change_log_immutable", id }`; registry unchanged

5. **Branch mismatch returns branch_mismatch**
   - Setup: write a finding
   - Call: `meta_state_patch({ id, entry_kind: "loop-design", patch: { title: "x" } })`
   - Assert: returns `{ patched: false, reason: "branch_mismatch", expected: "loop-design", actual: "finding" }`

6. **Full lifecycle: create → patch → resolve (no escape hatch)**
   - Write finding via `meta_state_report`
   - Patch `code_fingerprint` via `meta_state_patch` (the use case from CRUD finding)
   - Resolve via `meta_state_resolve` (the canonical resolve path)
   - Assert: all 3 succeed, no direct I/O needed

**`tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js`** (NEW, 4 tests):

1. **Top-level array re-hydrated from string**
   - Setup: mock handler that captures `args`
   - Call: `wrappedHandler({ addresses: '["x", "y"]' })` with schema declaring `addresses: z.array(z.string())`
   - Assert: handler receives `{ addresses: ["x", "y"] }`

2. **Top-level boolean re-hydrated from string**
   - Call: `wrappedHandler({ mechanism_check: "true" })` with schema declaring `mechanism_check: z.boolean()`
   - Assert: handler receives `{ mechanism_check: true }`

3. **Top-level number re-hydrated from string**
   - Call: `wrappedHandler({ _expected_version: "3" })` with schema declaring `_expected_version: z.number()`
   - Assert: handler receives `{ _expected_version: 3 }`

4. **No-op when args are already correctly typed**
   - Call: `wrappedHandler({ addresses: ["x"] })` with schema declaring `addresses: z.array(z.string())`
   - Assert: handler receives the same `args` (identity preserved); no `wire_format_coerced` log line

### Phase 2: Green (implementation)

1. Implement `coerceParamsToSchema` in `tool-registry.js`
2. Update `registerTool` to accept `root` and call `coerceParamsToSchema` in `wrappedHandler`
3. Update `server.js` to pass `root` to `registerTool`
4. Implement `meta_state_patch` tool in `tools/meta-state-patch-tool.js`
5. Register in `tools/manifest.json` and `agent-manifest.json`
6. Run new tests until all pass

### Phase 3: Refactor + closeout

1. Run full test suite (840+ tests) to confirm no regressions
2. Update `loop-design-cross-reference-fields` via the new tool (the recursive proof)
3. File the change-log entry via `meta_state_log_change`
4. Resolve the CRUD finding via `meta_state_resolve`
5. Optional: add 1 sentence to AGENTS.md "use `meta_state_patch` for registry updates; do not use `node -e` escape hatch"
6. Run `pnpm check` (validate records + extract index + tests)

## Touchpoints Summary

| File | Action | Lines |
|------|--------|-------|
| `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` | NEW | ~80 |
| `tools/learning-loop-mcp/tools/manifest.json` | append 1 entry | +1 |
| `tools/learning-loop-mcp/agent-manifest.json` | append 1 entry in meta_state group | +1 |
| `tools/learning-loop-mcp/tool-registry.js` | add `coerceParamsToSchema` helper + wire into `wrappedHandler` | +60 |
| `tools/learning-loop-mcp/server.js` | pass `root` to `registerTool` | ~3 |
| `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` | NEW | ~150 |
| `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` | NEW | ~80 |
| `meta-state.jsonl` | 1 change-log + 1 resolve + 1 loop-design update (3 lines) | +3 |

**Total new code:** ~300 lines (mostly tests). New core logic: ~0 lines (`updateEntry` is reused as-is).

## Acceptance Criteria

- All 840+ existing tests pass
- 10 new tests pass (6 patch + 4 wire-format)
- The 4 documented escape-hatch use cases in CRUD finding can now be done via `meta_state_patch` (verified by Phase 1 test #6: "Full lifecycle")
- `meta_state_propose_design` and `meta_state_report` no longer reject top-level array/boolean params (verified by new wire-format tests, plus a regression test on the existing tools)
- `loop-design-cross-reference-fields.proposed_design_for` = `["meta_state_patch"]`
- CRUD finding resolved with supersede narrative pointing at 2102Z
- 2102Z lineage preserved in the new change-log
- Full test suite passes (`pnpm check`)

## Implementation Considerations & Risks

### Risk: Zod schema introspection fragility

The `coerceParamsToSchema` helper uses `fieldSchema._def.typeName` and `fieldSchema._def.innerType._def.typeName`. Zod's internal `_def` is technically private API, but it's been stable across Zod 3.x → 4.x. **Mitigation:** wrap in a try/catch; if introspection fails, log a warning and return `args` unchanged. Test the helper against the actual Zod version in use (4.4.3 per package.json).

### Risk: The wire-format fix could mask real bugs

If a tool genuinely wants a string that happens to look like a JSON array (e.g., a stringified JSON value that's not meant to be parsed), the helper would incorrectly coerce it. **Mitigation:** the helper only coerces when the declared type is `ZodArray` and the value arrived as a string. If a tool wants to accept a string field, it should NOT declare the field as `z.array(...)`. Tests assert the helper is a no-op for correctly-typed args. The `wire_format_coerced` log line is a backstop — any unexpected coercion is visible in the audit log.

### Risk: Test interference with the live registry

The new tests need an isolated registry (e.g., a temp directory). The existing meta-state tests follow this pattern (search for `mkdtempSync` or `tmpdir()`). **Mitigation:** mirror the existing pattern.

### Risk: The `registerTool#wrappedHandler` change requires `root` parameter

`registerTool` currently doesn't take `root`. `server.js` has it. **Mitigation:** add `root` parameter to `registerTool`; pass from `server.js`. Backward-compatible (no other callers).

## Success Metrics

- **Quantitative:**
  - 840+ existing tests still pass
  - 10 new tests pass
  - 4 escape-hatch use cases can be done via canonical MCP tool
  - 3 affected tools (propose_design, report, patch) work with complex-typed top-level fields
- **Qualitative:**
  - The recursive gap (filing the CRUD finding required the escape hatch) is closed
  - The `loop-design-cross-reference-fields` design becomes operationally useful (not declarative-only)
  - Future tools that declare complex-typed top-level fields work out of the box (via the generic wire-format fix)

## Out of Scope (Deferred)

- `meta_state_propose_design` `update_or_create` mode (separate scope, separate plan)
- `meta_state_archive` / `meta_state_undo_resolve` (full CRUD coverage, separate scope)
- TTL redesign (`meta-260608T0847Z-ttl-expire-system-...`) — separate finding, separate plan
- Auth/role system for `meta_state_patch` (currently any agent can patch any entry; operator-role check is a future plan)
- Schema migrations for the 4 existing meta-state tools beyond what the wire-format fix provides (each tool's existing API contract is preserved)

## Next Steps

1. **Approval:** user approves this design
2. **Handoff to plan:** invoke `/ck:plan --tdd` with this report as context
3. **Plan output:** `plan.md` with 3 phases (Red/Green/Refactor), 10 tests, 1 new tool, 1 generic fix
4. **Implementation:** follows the TDD pattern from `plans/260606-rule-loop-design-first-class/plan.md`
5. **Closeout:** `meta_state_resolve` the CRUD finding + `meta_state_log_change` for the lineage
6. **Validation:** `pnpm check` + cold-session test (rule-cold-session-test-must-pass-before-resolution applies to MCP tool availability)
7. **Journal:** `/ck:journal` to record session reflection

## Open Questions

None at design time. All decisions were resolved in the discovery Q&A.
