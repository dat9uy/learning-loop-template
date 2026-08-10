---
phase: 1
title: "Honest schema enum + write-boundary guard + remove parseForRead"
status: completed
priority: P0
effort: "4h"
dependencies: []
---

# Phase 1: Honest schema enum + write-boundary guard + remove parseForRead

## Overview

Promote `"archived"` into the finding/rule/loop-design status enums so `schema.parse` accepts what the tombstone already writes; add a write-boundary guard on the union `metaStateEntrySchema` so `archived` stays append-only via `archiveEntry`/`deleteEntry`; delete `core/entry/parse-for-read.js` and its 3 imports. TDD: red tests first (parseForRead removed → crash; enum added → crash gone; write-guard red → green).

## Requirements

- **Functional:** `createFinding`/`createRule`/`createLoopDesign` accept `status:"archived"` via direct `schema.parse(data)` (no `parseForRead`). `writeEntry` and `metaStateBatch case:"write"` reject a caller-supplied `status:"archived"`. `parse-for-read.js` is deleted; `finding.js`, `rule.js`, `loop-design.js` call `schema.parse(data)` directly.
- **Non-functional:** No read-path behavior change — archived entries remain in the relationship graph (the band-aid's current behavior). `CANONICAL_STATUS_KEYS`/`by_status` unchanged (archived already counted). `change-log` status stays `z.literal("active")` (change-logs are never archived). `core/meta-state.js:247` local `TERMINAL_STATUSES = {resolved,superseded}` (without archived) is NOT the isOpen set — leave it; confirm no read-side consumer relies on it for archived filtering (none do).

## Architecture

Today: `archiveEntry`/`deleteEntry` write `status:"archived"` outside the enum (`meta-state.js:242-245`). The 3 factories (`core/entry/{finding,rule,loop-design}.js`) call `parseForRead(schema, data)` which strips `status:"archived"` before `schema.parse`, restores after — neutralizing the crash for `meta_state_relationships`/`validateCrossRefs`/`outboundRefsAll`. `parseForRead` also strips `archived_*`/`tombstone_kind` because the per-kind `z.object` schemas omit them and Zod strips unknowns by default — so replacing `parseForRead(schema, data)` with `schema.parse(data)` is behavior-equivalent for the factory `data` view once the enum accepts `"archived"`.

After:
- **3 per-kind enums** gain `"archived"`: `metaStateFindingEntrySchema.status` (L362: `["open","resolved","superseded"]` → `["open","resolved","superseded","archived"]`), `metaStateRuleEntryObject.status` (L539: `["active","inactive"]` → `["active","inactive","archived"]`), `metaStateLoopDesignSchema.status` (L615: same).
- **Union write-guard:** `metaStateEntrySchema` (L640, `z.preprocess(withDefaults, z.union([...]))`) gains a refine rejecting `status:"archived"` on the write path. The union is the write-validation gate (writeEntry L1186, batch-write L1652); reads use per-kind schemas via factories, and `archiveEntry`/`deleteEntry`/`restoreEntry` bypass the union via `trueAppendAtomicRaw` — so the guard closes the forge vector without affecting reads or legitimate archiving.
- **Factories:** `finding.js` (L5,L8), `rule.js` (L5,L8), `loop-design.js` (L4,L7) — drop the `parseForRead` import; `parseForRead(Schema, data)` → `Schema.parse(data)`.
- **Delete:** `core/entry/parse-for-read.js` (no production importers remain; the fallow admission rule would flag it as dead).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (3 status enums L362/L539/L615; union refine L640)
- Modify: `tools/learning-loop-mastra/core/entry/finding.js`, `rule.js`, `loop-design.js` (drop parseForRead)
- Delete: `tools/learning-loop-mastra/core/entry/parse-for-read.js`
- Test: `tools/learning-loop-mastra/core/entry/finding.test.js`, `rule.test.js`, `loop-design.test.js` (new archived-survival tests)
- Test: `tools/learning-loop-mastra/core/meta-state.test.js` (new write-guard test)

## Implementation Steps

1. **RED — archived-survival:** In `finding.test.js`/`rule.test.js`/`loop-design.test.js`, add `createFinding({ ...FIXTURE, status:"archived" })` (and rule/loop-design parallels) asserting `f.data.status === "archived"`. Remove the `parseForRead` import + call in the 3 factories → `Schema.parse(data)`. Tests RED (Zod "Invalid enum value").
2. **GREEN — enum:** Add `"archived"` to the 3 status enums. Tests GREEN. Add `meta_state_relationships` regression: archive a finding via `archiveEntry`, call the relationships handler on it, assert no throw.
3. **RED — write-guard:** Add a test asserting `writeEntry(root, { ...validFinding, status:"archived" })` throws / rejects with a clear reason, and `metaStateBatch` `case:"write"` with `status:"archived"` likewise. After step 2 this is RED (the union now accepts `"archived"`).
4. **GREEN — guard:** Add the union refine rejecting `status:"archived"` (message: archived is a tombstone status appended only by archiveEntry/deleteEntry). Tests GREEN. Confirm `archiveEntry`/`deleteEntry` still succeed (they bypass the union).
5. Delete `core/entry/parse-for-read.js`. Grep confirms no importers.

## Success Criteria

- [x] 3 factories accept `status:"archived"` via direct `schema.parse`; `parse-for-read.js` deleted, no importers.
- [x] `meta_state_relationships` over an archived finding/rule/loop-design does not throw (regression test).
- [x] `writeEntry` + batch-write reject caller `status:"archived"` (write-guard test).
- [x] `archiveEntry`/`deleteEntry` still archive/delete successfully (union bypass unchanged).
- [x] `pnpm test:one` green on: `core/entry/*.test.js`, `core/meta-state.test.js`, `core/operation-invariant.test.js`, `__tests__/legacy-mcp/meta-state-archive-tool.test.js`, `__tests__/legacy-mcp/meta-state-relationships-tool.test.js` (if present), `__tests__/cli-write-tool-set-drift.test.js`.

## Risk Assessment

- **Risk:** The union refine could reject a legitimate archived read if any read path used the union. **Mitigation:** verified reads use per-kind schemas (researcher #1); the guard is write-only. Add an explicit test that `metaStateFindingEntrySchema.parse({ ...row, status:"archived" })` succeeds (per-kind, no guard) while `metaStateEntrySchema.safeParse({ ...row, status:"archived" })` rejects (union, guard).
- **Risk:** Forgetting the rule/loop-design enums (only fixing finding). **Mitigation:** the RED test in step 1 covers all 3 factories; a deleted rule/loop-design tombstone would crash `createRule`/`createLoopDesign` without it.
- **Risk:** `core/meta-state.js:247` local `TERMINAL_STATUSES` (without archived) confused with `constants.js:45` (with archived). **Mitigation:** leave the local set untouched; it is not a read-side archived filter. Document the distinction in the phase 4 docs pass.
