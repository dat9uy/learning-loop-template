---
phase: 3
title: "D: Metadata nested-array rejection + finding resolution"
status: completed
priority: P1
effort: "2-3h"
dependencies: ["2"]
---

# Phase 3: D — Metadata nested-array rejection + finding resolution

## Overview

Tighten `runtime_state_record`'s `metadata` Zod schema to reject nested arrays (the corruption class observed in the npx-roundtrip row 23: `pending_execution` as 7-deep nested arrays + a stray `</item>` artifact) via a `.refine`, add a doc-only tightening to `schemas/runtime-state.schema.json` (no code consumer — the schema is spec-only), and resolve the open finding `meta-260719T1858Z-runtime-state-record-s-metadata-param-z-record-z-unknown-acc`. Pairs with Phase 2: once the fingerprint covers `metadata`, a corrupt row gets a fingerprint distinct from its corrected sibling, making the corruption hash-visible (Phase 2) and preventing the class at write time (Phase 3).

## Requirements

- Functional: `runtime_state_record` rejects `metadata` containing any array-valued array element (nested arrays) with a clear Zod error; accepts flat scalar metadata (string/number/boolean/null) and flat arrays of scalars (the legitimate shapes across all 23 non-corrupt stored rows). The corrupt row 23's `pending_execution` shape is rejected.
- Non-functional: backward-compatible — every legitimate stored row (rows 1-22, 24) still validates; the JSON schema documents the contract (doc-only, since no code validates against it); no new MCP tool; the refine lives at the handler (the only enforcement point).

## Architecture

- **Zod refine** on `runtime-state-record-tool.js:36`:
  ```js
  metadata: z.record(z.unknown()).optional()
    .refine((m) => m == null || !hasNestedArray(m), {
      message: "metadata must not contain nested arrays (array-valued array elements); flatten or use scalar/string values",
    })
  ```
  `hasNestedArray(value)` walks the tree and returns true if any `Array` node has an `Array` child (at any depth). Flat arrays of scalars (`["a","b"]`, `[1,2]`) pass; `[[...]]` (array-in-array) fails. Place `hasNestedArray` as a local helper in the record tool (it's a 1-consumer validation predicate; not worth a shared util unless a second consumer appears — YAGNI).
- **Doc-only schema** (`schemas/runtime-state.schema.json`): tighten `metadata` to document the contract — `additionalProperties` constrained to scalar/flat-array shapes, with a `description` noting the handler enforces the real constraint via Zod (the schema is spec-only; no code validates against it). This keeps the spec honest without depending on it. Do NOT add a `fingerprint_version` field (decision 1 — v2-only, no version field).
- **Why not strings-only / flatten+warn / schema-only** (decision 4): strings-only rejects legitimate `issue_number: number` + `delegated_to: null` the dispatch tool writes; flatten+warn silently mutates caller data; schema-only is ineffective (no code consumer). The nested-array refine precisely kills the observed corruption class and is backward-compatible. **The refine is structural, not content-sanitizing** — it rejects array-in-array nesting but a flat array of arbitrary strings (e.g. `["...</item>..."]`) still passes. String-content corruption is the caller's responsibility and out of scope for finding D, which targets the nesting corruption class observed in row 23.

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js:36` — add `.refine(hasNestedArray → false)` + the local `hasNestedArray` helper.
- Modify: `schemas/runtime-state.schema.json:40-42` — doc-only `metadata` tightening + description noting handler enforcement.
- Create: `tools/learning-loop-mastra/__tests__/runtime-state-metadata-validation.test.js` (or extend an existing record-tool test if present) — nested-array rejection + legitimate-shape acceptance tests.

## Implementation Steps (TDD)

**Tests Before**
1. Write tests (expect FAIL until the refine ships):
   - **Nested-array rejection**: call the record tool's schema `.safeParse` (or the handler with a preflight marker in a temp root) with `metadata: { pending_execution: [[[[[[["x"]]]]]] ] }` (the corrupt row 23 shape) → expect a Zod error citing the refine message.
   - **Legitimate flat-array acceptance**: `metadata: { tags: ["a","b"], counts: [1,2,3] }` → expect success (flat arrays of scalars are allowed).
   - **Legitimate scalar acceptance**: `metadata: { issue_number: 5, delegated_to: null, action: "x" }` (the dispatch tool's shape) → expect success.
   - **All 23 legitimate stored rows validate**: read `runtime-state.jsonl` (post Phase-2 migration), parse each row's `metadata`, run it through the refine → all pass (this is a backward-compat guard; row 23, the corrupt one, is excluded or expected to fail — confirm whether row 23 should be rejected at read or left as-is since it's already stored).
   Run — expect the nested-array rejection test to FAIL (current `z.record(z.unknown())` accepts it).

**Refactor**
2. Add `hasNestedArray` helper to `runtime-state-record-tool.js` (local; walks arrays/objects, returns true if any `Array` has an `Array` child).
3. Add `.refine((m) => m == null || !hasNestedArray(m), { message: "..." })` to the `metadata` schema (L36).
4. Doc-only: tighten `schemas/runtime-state.schema.json` `metadata` (additionalProperties discipline + description noting the handler enforces via Zod). Do NOT add `fingerprint_version`.
5. Run the new tests — expect PASS.

**Tests After**
6. `pnpm test:iter` green; `pnpm exec vitest --changed` green.
7. Re-run the Phase-2 migration test asserting all rows `verifyRow === true` — still green (Phase 3 doesn't touch fingerprints).
8. Confirm no regression to `bash-gate-runtime-state-record.test.js` (preflight-gate test) — the refine is a new validation layer on top of the existing preflight gate, not a replacement.

**Regression Gate**
9. `pnpm test:iter` green.
10. `check_runtime_agnostic` on the record tool — passes.
11. Runtime-agnostic regression test green.

**Finding resolution**
12. `meta_state_resolve({ id: "meta-260719T1858Z-runtime-state-record-s-metadata-param-z-record-z-unknown-acc", resolution: "runtime_state_record's metadata schema now rejects nested arrays via a Zod .refine(hasNestedArray) at runtime-state-record-tool.js:36 — the corruption class from the npx-roundtrip row (7-deep nested arrays) is rejected at write time. schemas/runtime-state.schema.json tightened doc-only (no code consumer; schema-loader deleted in Phase A) to document the contract. Backward-compatible: all 23 legitimate stored rows (flat scalar/flat-array metadata) pass. Pairs with Phase 2 — the v2 fingerprint covers metadata, so a corrupt row now gets a distinct fingerprint from its corrected sibling." })`.
13. `meta_state_log_change({ change_dimension: "surface", change_target: "tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js", change_diff: { changed: ["metadata schema: added .refine rejecting nested arrays"], added: ["hasNestedArray helper (local)"], changed_files: ["schemas/runtime-state.schema.json (doc-only metadata tightening)"] }, reason: "Reject nested-array metadata at the handler (the only enforcement point — the JSON schema has no code consumer). Finding meta-260719T1858Z resolved." })`.

## Success Criteria

- [ ] `runtime_state_record` rejects nested-array `metadata` (the corrupt row 23 shape) with a clear Zod error.
- [ ] Flat scalar metadata + flat arrays of scalars accepted (all 23 legitimate stored rows validate).
- [ ] `schemas/runtime-state.schema.json` documents the metadata contract (doc-only; no `fingerprint_version`).
- [ ] No regression to `bash-gate-runtime-state-record.test.js` or the Phase-2 migration tests.
- [ ] Finding D (`meta-260719T1858Z-...`) resolved; change logged.

## Risk Assessment

- **Backward-compat — does the refine reject any legitimate stored row?** The corrupt row 23 is the ONLY stored row using arrays in metadata (confirmed by researcher scan: all other 23 rows have flat scalar metadata). Mitigation: the "all 23 legitimate stored rows validate" test (step 1) pins this; row 23 is already stored and is not re-validated at read (the refine is write-time only), so existing data is not retroactively rejected — only future writes of the corrupt shape are blocked.
- **Does the refine break the dispatch tool's writes?** The dispatch tool writes `metadata: { issue_number, issue_url, delegated_to, ... }` — all flat scalars. `appendLedgerEvent` is called by the dispatch tool; the dispatch tool builds its own `metadata` (not via the record tool's Zod schema), so the refine does NOT gate dispatch writes. Mitigation: confirm the dispatch tool's metadata shape is flat (grep `metadata:` in `meta-state-dispatch-finding-tool.js`); if the dispatch tool ever needs nested arrays, that's a separate design conversation (not blocked here — the dispatch tool doesn't route through the record tool's schema).
- **Schema tightening vs no consumer.** The JSON schema has no code consumer (schema-loader deleted in Phase A); tightening it is doc-only and cannot enforce. Mitigation: the Zod refine is the real enforcement; the schema change is explicitly marked doc-only in the finding-D resolution so no one mistakes it for enforcement.
- **`hasNestedArray` depth/recursion.** A pathological deeply-nested object could stack-overflow the recursive walker. Mitigation: the corrupt row 23 is 7-deep — far below any stack limit; legitimate metadata is flat. If a future caller needs unbounded depth, revisit then (YAGNI).
