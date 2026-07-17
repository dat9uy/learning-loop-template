---
phase: 3
title: "Localized validation errors (patch + batch update)"
status: todo
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 3: Localized validation errors (patch + batch update)

## Overview

When the model emits a real field that fails a sub-constraint (e.g. `description` < 20 chars, a bad
enum, or an unknown key), the rejection must name the field and the constraint — not the opaque
`z.union` `"Invalid input"` (`path: []`). Opaque errors make the model retreat to `{}`; named errors
let it fix the specific field. This phase covers **both** `meta_state_patch` (per `entry_kind` param)
and `meta_state_batch` update op (per the **existing entry's** kind) — the runtime floor that breaks
the loop even if Phase 2's schema steering is imperfect.

## Requirements

- Functional (patch): a patch whose field violates a sub-constraint returns `{patched:false,
  reason:"invalid_field", field_errors:[{field, message}, …]}` with each failing field named and its
  constraint message shown. Unknown keys (`.strict()` violation) name the offending key. Returned by
  the MCP tool (not thrown).
- Functional (batch): a batch update op `{op:"update", id}` with **zero content fields** (only
  `op`/`id`/`_expected_version`) returns `{ok:false, reason:"no_content", id, …}` for that op (the
  batch is atomic — a no-content update rolls back the whole batch, matching existing failure
  semantics). A bad inline content field returns `reason:"invalid_field"` with `field_errors`,
  validated against `buildPatchSchemaFor(existingEntry.entry_kind)` (kind read from the existing
  entry, since batch update takes no `entry_kind` param).
- Non-functional: valid patches and valid batch updates still succeed (no regression). The patch
  model-visible schema stays the union; only **runtime** validation switches to the single branch.
  Batch contract unchanged — inline content fields still merge via `.passthrough()`; the new checks
  reject/validate **before** the merge, they do not change the merge shape.

## Architecture

**Patch:** validate `effectivePatch` against the single branch selected by `entry_kind` —
`buildPatchSchemaFor(entry_kind)` (precedent: plan `260612-0109`). On failure, format
`result.error.issues` (each carries `path` + `message`) into `field_errors`. Insert **after** the
`empty_patch` check and **before** the `updateEntry` call. Keep the existing `validation_failed` path
for the `updateEntry` write boundary unchanged.

**Batch:** for each `update` op, look up the existing entry → read `existingEntry.entry_kind` → the
inline content fields are the op's keys minus `op`/`id`/`_expected_version`/`envelope`/identity. If
that set is empty → `reason:"no_content"` (the batch equivalent of `empty_patch`). Else validate the
inline content set against `buildPatchSchemaFor(existingEntry.entry_kind)`; on failure →
`reason:"invalid_field"` + `field_errors` (same formatter as patch). The batch is atomic, so a
rejected op fails the whole batch with a per-op error (matching existing rollback semantics).

Combination rationale: the model-visible patch schema stays the permissive union (model sees every
field across the 4 kinds), while runtime validation against the one correct branch yields precise,
field-named errors. Batch gets the same localized-error mechanism with the kind derived from the
existing entry, closing its silent no-content-update hole without a contract change.

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js` — per-branch validation
  + `field_errors` formatting between the `empty_patch` check (line ~110) and `updateEntry` (line ~128).
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js` — per `update` op:
  no-content check + inline-field validation against `buildPatchSchemaFor(existingEntry.entry_kind)`.
- Read: `tools/learning-loop-mastra/core/meta-state.js#buildPatchSchemaFor` (lines 616-624) and
  `#metaStateBatch` (the atomic apply + rollback path, to wire per-op rejection into existing
  failure semantics).
- Test: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-tool.test.js` (extend) and
  `meta-state-batch-tool.test.js` (extend — add no_content + invalid_field update-op cases).

## Implementation Steps (TDD)

1. **RED (patch)** — test: `meta_state_patch({…, patch:{description:"short"}})` (15 chars < `.min(20)`)
   → expect `{patched:false, reason:"invalid_field", field_errors:[{field:"description", message:
   /…20…/}]}`. Today returns opaque `validation_failed`. Fails.
2. **GREEN (patch)** — add per-branch validation:
   ```js
   const branchSchema = buildPatchSchemaFor(entry_kind);
   const parsed = branchSchema.safeParse(effectivePatch);
   if (!parsed.success) {
     const result = {
       patched: false, reason: "invalid_field", id, entry_kind,
       field_errors: parsed.error.issues.map((i) => ({
         field: i.path.join(".") || "(root)",
         message: i.message,
       })),
     };
     appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
     return { content: [{ type: "text", text: JSON.stringify(result) }] };
   }
   ```
   Run → green.
3. **EDGE (patch)** — tests: `{category:"not-an-enum"}` → names `category`; unknown key `{bogus:1}` →
   names `bogus` (strict surfaced, not opaque); valid patch still succeeds; finding-valid/rule-invalid
   patch with `entry_kind:"rule"` → names the offending field.
4. **RED (batch)** — test: `meta_state_batch({operations:[{op:"update", id:"<existing>"}]})` (no
   content fields) → expect a per-op rejection `reason:"no_content"` and the batch rolls back. Today
   silently no-ops (or `validation_failed`). Fails.
5. **GREEN (batch)** — in the batch update path, compute inline content keys (op minus identity); if
   empty → reject with `reason:"no_content"`; else validate against
   `buildPatchSchemaFor(existingEntry.entry_kind)` → `reason:"invalid_field"` + `field_errors` on
   failure. Wire into the existing atomic-apply/rollback path so a rejected op fails the whole batch.
6. **EDGE (batch)** — test: a bad inline field (`{op:"update", id, category:"not-an-enum"}`) →
   `field_errors` names `category`; a valid inline update still succeeds and merges; a no-content
   update on a missing id still returns `not_found` (existing behavior preserved).

## Success Criteria

- [ ] Patch: sub-constraint failures return `reason:"invalid_field"` with `field_errors`; unknown keys named.
- [ ] Batch: zero-content update → `reason:"no_content"`; bad inline field → `reason:"invalid_field"` + `field_errors`.
- [ ] Valid patches and valid batch updates still succeed (no regression).
- [ ] Batch contract unchanged (inline merge preserved); existing patch/batch tests green.

## Risk Assessment

**Risk:** per-branch parse duplicates work the union already does and could drift. **Mitigation:**
`buildPatchSchemaFor` is the single source of truth for both the union branches and per-branch
validation — same function, cannot drift. Document projection-vs-enforcement in a comment.
**Risk:** batch per-op rejection changes atomic-failure observability. **Mitigation:** reuse the
existing rollback path; a rejected op is just another op-level failure the batch already handles.
**Risk:** inferring the kind from the existing entry for batch means a not-found id can't be
type-validated. **Mitigation:** preserve existing `not_found` behavior first (step 6 EDGE); only
entries that exist get content validation.

<!-- Updated: Validation Session 1 — expanded scope to meta_state_batch update op (runtime floor only, no contract change); kind derived from existing entry -->
