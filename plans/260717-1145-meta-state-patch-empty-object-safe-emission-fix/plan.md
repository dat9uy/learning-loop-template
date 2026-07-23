---
title: "meta_state_patch empty-object safe emission fix"
description: "Break the empty-patch retry loop by making `{}` schema-invalid to the model pre-invocation (parity-seam minProperties), localizing validation errors (patch per entry_kind + batch update per existing entry's kind), and fixing the empty_patch/no_content hints. Root cause: the patch union of 4 .partial().strict() branches makes `{}` the unique safe emission; runtime rejection does not steer the model. Batch update op (inline .passthrough merge) gets the runtime floor only — no contract change."
status: completed
priority: P1
effort: "2d"
tags: [meta-state, mcp, schema, tdd]
created: 2026-07-17
---

# meta_state_patch empty-object safe emission fix

## Overview

`meta_state_patch` lets the model emit `patch: {}` and retry it indefinitely. Debug session
`e10944c4-17e8-4234-b845-ad6c8817df01` (2026-07-17, ~54 min **after** commit `6ee3186` shipped the
`empty_patch` rejection) called the tool **five times in a row** with `"patch": {}` — including one
call *immediately after* the agent wrote a full diagnosis naming the exact fields to populate. The
prose layer knew what to do; the structured-tool-input layer emitted `{}` every time. The shipped fix
converted a **silent-success** bug into a **loud-rejection loop** — the symptom got noisier, the cause
untouched. This plan fixes the cause: make `{}` schema-invalid to the model *before* it is ever
emitted, and make every rejection actionable so the model never retreats to `{}`.

## Root Cause (verified)

`meta-state-patch-tool.js:24`:
```js
patch: z.preprocess(deepStripEnvelope, z.union(PATCH_KINDS.map((k) => buildPatchSchemaFor(k))))
```
`buildPatchSchemaFor(k)` = `…Schema.omit({…}).partial().strict()` (`core/meta-state.js:616-621`). The
model-visible JSON schema (produced via the **parity seam** in `create-loop-tool.js#attachParityJSONSchema`,
which overrides `schema._zod.toJSONSchema = () => parityJSONSchema`) is therefore an `anyOf` of **four
all-optional `.strict()` objects**. `{}` satisfies all four branches simultaneously — it is the unique
zero-risk emission. Any real key carries branch-selection risk (a key valid for `finding` is invalid
for the other three) and any sub-constraint failure (e.g. `description` `.min(20)`) returns an **opaque
`"Invalid input"` with `path: []`**. So the model hedges to `{}`.

`.refine`/`.superRefine` are **dropped by Zod's `toJSONSchema`** (they are not expressible as JSON
Schema). The existing `metaStateEntryPatchSchema.refine` (`core/meta-state.js:641`) and the handler
`empty_patch` check (`meta-state-patch-tool.js:110`) only fire at **runtime**, *after* the model has
already emitted `{}`. The session proves runtime rejection does not steer the model — it saw five
`empty_patch` results and kept emitting `{}`.

The fix must reach the **model-visible JSON schema** (pre-generation steering), which the parity seam
gives us full control over.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `{}` is schema-invalid to the model pre-invocation (model-visible `patch.minProperties: 1`) | P1 |
| 2 | A real-but-invalid field returns a field-named error, not opaque `Invalid input` | P1 |
| 3 | The `empty_patch` hint names mutable content fields (description, evidence_code_ref), not only lifecycle tools | P2 |
| 4 | Record the schema-shape root cause as a meta-state finding (the prior finding captured only the symptom) | P2 |
| 5 | No regression: legitimate no-op patches (`{category:"warning"}` same-value) still succeed; other tools unchanged | P1 |
| 6 | `meta_state_batch` update op rejects zero-content updates (`{op:"update", id}`) with `reason:"no_content"` + localized field errors (runtime floor; no contract change) | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Context, root cause & rejected alternatives](./phase-01-start.md) | Pending |
| 2 | [Model-visible schema rejects empty patch](./phase-02-model-visible-schema-rejects-empty-patch.md) | Pending |
| 3 | [Localized validation errors (patch + batch update)](./phase-03-localized-branch-validation-errors.md) | Pending |
| 4 | [Content-aware empty-patch / no-content hints](./phase-04-content-aware-empty-patch-hint.md) | Pending |
| 5 | [Record finding, regression, ship prep](./phase-05-record-finding-regression-ship-prep.md) | Pending |

## Dependencies

- **Blocks:** none.
- **Blocked by:** none. (No unfinished plan overlaps this exact fix. Prior plan `260612-0109-meta-state-patch-entry-kind-invariant` — completed — established `entry_kind` as the branch-selector param; Phase 3 reuses that precedent for per-branch runtime validation.)

## Rejected Alternative — split into 4 per-kind tools

Considered and **rejected on evidence**: `buildPatchSchemaFor(k)` is `.partial().strict()`, so `.partial()`
accepts `{}` in **every** branch — splitting into `meta_state_patch_finding` / `_rule` / `_loop-design` /
`_change-log` does **not** reject `{}` either. It would still need the empty-rejection refine on each.
Meanwhile it reverses the documented design (tool description: "Unifies update_finding/update_design/
update_change_log/backfill_fingerprint into one tool"), bloats the manifest (the loop explicitly
minimizes cold-session discoverability load), and touches 13 test files + `schemas.js` +
`build-meta-state-tools.js`. YAGNI/KISS violation with **no marginal fix** for the root cause. Rejected.

## Scope

- **In:** `meta_state_patch` tool — model-visible schema (parity seam), handler validation, hint.
- **In:** `meta_state_batch` update op — **runtime floor only** (no contract change). The batch update op
  merges content **inline** via `.passthrough()` (`meta-state-batch-tool.js:18-23`), not via a nested
  `patch:{}`. Its risk is therefore a **no-content update** (`{op:"update", id}` with zero content fields)
  that silently no-ops — a different shape from the patch tool's empty-`{}` safe emission. The `op`+`id`
  discriminator already prevents a bare `{}`, so model-visible `minProperties` steering does not apply
  (no clean constraint; `.refine` is dropped by `toJSONSchema`). Fix: reject zero-content updates with
  `reason:"no_content"` + validate inline content fields against `buildPatchSchemaFor(existingEntry.entry_kind)`
  (the kind is read from the existing entry, not passed) → localized `field_errors`, parallel to Phase 3.
- **Out:** restructuring batch update to a nested `patch:{}` field (would be a public contract change +
  migration for existing inline-field callers — explicitly rejected this pass).

## Acceptance Criteria

- [ ] `tools/list` parity test asserts `mastra_meta_state.patch` has `minProperties >= 1`; `{}` fails
      model-visible JSON-schema validation; `{description:"<valid>"}` passes.
- [ ] `.parse({})` runtime behavior unchanged (the handler `empty_patch` check remains the safety net);
      generation-only override does not affect parsing.
- [ ] A sub-constraint failure (e.g. `description` < 20 chars) returns `reason:"invalid_field"` with
      `field_errors` naming the field + message; unknown keys (strict violation) name the offending key.
- [ ] `empty_patch` hint for `entry_kind:"finding"` contains `description` and `evidence_code_ref`.
- [ ] `meta_state_batch` rejects `{op:"update", id:"<existing>"}` with zero content fields →
      `reason:"no_content"`; a bad inline content field → `reason:"invalid_field"` with `field_errors`
      (validated against the existing entry's kind). No batch contract change (inline fields still merge).
- [ ] New meta-state finding recorded with `reopens: ["meta-260717T1026Z-…"]` (relationship lint passed).
- [ ] Full patch + parity suite green (`pnpm test:iter`); no file-index drift.
- [ ] PR body enumerates the registry delta (rule-pr-body-registry-deltas).

## Defense-in-Depth (preserved)

The schema-level `minProperties: 1` is the **steering** layer (prevents emission). The runtime
`empty_patch` check (`meta-state-patch-tool.js:110`) and `metaStateEntryPatchSchema.refine`
(`core/meta-state.js:641`) stay as the **safety net** for direct core callers and any harness that does
not feed schema errors back to the model. Phases 2-4 are the guaranteed floor if steering is imperfect.

## Open Questions

- Does the Claude Code harness feed tool *schema-validation* errors back to the model as retryable
  steering? If yes, Phase 2 alone breaks the loop. If no, Phases 3-4 (runtime error quality) are the
  actual lever. This is a hypothesis to confirm via a post-fix cold-session probe — **out of scope for
  this plan's code**; record as a note in the Phase 5 finding. The plan ships both layers regardless.

## Validation Log

### Verification Results (Full tier, 5 phases)

- Claims checked: ~18 | Verified: 17 | Failed: 0 | Unverified: 0
- **V1 `.refine` dropped by `z.toJSONSchema`** — VERIFIED (DROPPED). Tested a `.refine` on
  `z.object({a:z.string()})`; the emitted draft-7 schema contains no refine/minLength. The "runtime
  rejection cannot steer the model" argument holds.
- **V2 parity test exercises `tools/list`** — VERIFIED with refinement: `mcp-tools-list-parity.test.js`
  calls `handles.listTools()` and asserts `inputSchema` shape, but `mastra_meta_state_patch` is **not**
  in the `MIGRATED_TOOL_NAMES` allowlist (line 20-37). Phase 2 RED must add it (or assert on it directly)
  before the `minProperties` assertion can run. Propagated to Phase 2.
- **V3 `buildPatchSchemaFor` / `PATCH_KINDS`** — VERIFIED at `core/meta-state.js:616` / `:586`, imported
  in `meta-state-patch-tool.js:6`. Citations accurate.
- All other file:line citations (tool `:24`/`:110`/`:116`, core `:641`, `create-loop-tool.js` parity
  seam, `schema-parity.js` `buildParitySchema`) verified during planning.

### Validation Decisions (interview)

1. **Layers shipped:** Both — model-visible schema steering (Phase 2) + runtime localized errors
   (Phase 3) + hint (Phase 4). Defense-in-depth regardless of whether the harness feeds schema errors
   back to the model.
2. **Hint seam:** Schema-derived from `buildPatchSchemaFor(entry_kind)` (no drift).
3. **Batch scope:** Fix in this pass — `meta_state_batch` update op, **runtime floor only** (no
   contract change). Discovery: batch update merges content inline via `.passthrough()`, not a nested
   `patch:{}` (tool `:18-23`), so its risk is a no-content update, not empty-`{}` emission, and
   `minProperties` steering does not apply. Parallel runtime fix: reject zero-content updates
   (`reason:"no_content"`) + validate inline fields against the existing entry's kind → localized
   `field_errors`. Restructuring to nested `patch:{}` (contract change + migration) explicitly rejected.
4. **Phase 2 seam:** Reusable parity-hints injection on `create-loop-tool.js` (generic, draft-7
   `minProperties`, model-visible only).

<!-- Updated: Validation Session 1 — added batch runtime floor to scope (decision 3); Phase 2 RED must add meta_state_patch to MIGRATED_TOOL_NAMES (V2) -->

<!-- slug: meta-state-patch-empty-object-safe-emission-fix -->
