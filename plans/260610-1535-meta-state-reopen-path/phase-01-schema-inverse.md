---
phase: 1
title: "Schema + Inverse + cold-tier (TDD)"
status: pending
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 1: Schema + Inverse + cold-tier (TDD)

## Overview

Ship the structural foundation: add `reopens: z.array(z.string()).optional()` to `metaStateFindingEntrySchema`, add `reopens_inverse` branch to `buildInverseIndexes`, surface it in the cold-tier payload, surface it in `meta_state_relationships` inbound query, and surface it in `buildRegistrySummary` citation counting. 4 → 5 maps. TDD: failing tests first, then implementation, then refactor (none needed for these one-liners).

This phase = brainstorm steps 1 + 2 + the test updates for cold-tier-regression + relationships.

## Requirements

**Functional**:
- `metaStateFindingEntrySchema.parse({ ..., reopens: ["meta-X"] })` succeeds.
- `metaStateFindingEntrySchema.parse({ ... })` (no reopens) succeeds (backward compat).
- `buildInverseIndexes(entries)` returns an object with 5 keys: `addresses_inverse`, `supersedes_inverse`, `origin_inverse`, `promoted_to_rule_inverse`, `reopens_inverse`.
- `reopens_inverse` is keyed by the *expired parent id* and values are arrays of *reopen child ids* (mirrors `addresses_inverse`).
- `meta_state_relationships({id: old_expired_id, direction: "inbound"})` returns `inbound.reopened_by: [new_finding_id, ...]`.
- `loop_describe` cold tier payload includes `inverse_indexes.reopens_inverse` as an object (Map serialized via `Object.fromEntries`).
- `buildRegistrySummary` citation counting includes `reopens_inverse` entries (so a finding re-surfaced by N entries is counted in `top_references`).

**Non-functional**:
- Schema target is `metaStateFindingEntrySchema` (NOT the union `metaStateEntrySchema` — the union has no `.shape`).
- The new field is symmetric with `loop-design.addresses` (line 169 of `core/meta-state.js`).
- The patch schema's passthrough behavior preserves backward compat for entries written before this change.
- `IMMUTABLE_PATCH_FIELDS` does not block `reopens` (the field is not in the deny-list; verified at `meta-state-patch-tool.js:6-19`).

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  metaStateFindingEntrySchema (core/meta-state.js:23-75)     │
│  + reopens: z.array(z.string()).optional()                  │
│                    ▼                                         │
│  metaStateEntrySchema (union, line 190) — auto-propagates   │
│                    ▼                                         │
│  metaStateEntryPatchSchema (passthrough, line 201) — accepts │
│                    ▼                                         │
│  buildInverseIndexes (core/loop-introspect.js:250)          │
│  + reopens_inverse branch (mirror addresses_inverse)         │
│                    ▼                                         │
│  3 consumers:                                                │
│    1. buildRegistrySummary (line 306) — citation counting   │
│    2. meta_state_relationships inbound (tool:35)             │
│    3. loop_describe cold tier (loop-describe-tool.js:174-179)│
└──────────────────────────────────────────────────────────────┘
```

## Related Code Files

**Create**: none

**Modify**:
- `tools/learning-loop-mcp/core/meta-state.js` — add `reopens` field to `metaStateFindingEntrySchema` after `auto_resolve` (line 74) (+5 lines)
- `tools/learning-loop-mcp/core/loop-introspect.js` — add `reopensInverse` map and branch in `buildInverseIndexes` (line 250-298, mirror lines 251-263); add `reopens_inverse` to `buildRegistrySummary` citation-count array (line 347) (+10 lines total)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — add `reopens_inverse: Object.fromEntries(inverseIndexes.reopens_inverse)` to cold-tier payload (line 174-179) (+1 line)
- `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` — add `reopened_by` inbound query key (after line 65) (+3 lines)
- `tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js` — 4→5 maps in synthetic fixture, structural assertions, and live-registry test (+5 lines)
- `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` — line 35 iteration: 4→5 maps (+1 line)
- `tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js` — extend with `reopened_by` test (+15 lines)
- `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js` (or `core/__tests__/meta-state-schema.test.js`) — extend with `reopens` field tests (+10 lines)

**Delete**: none

## Implementation Steps (TDD red → green → verify)

### Step 1: TDD RED — schema accepts `reopens`
**File**: `tools/learning-loop-mcp/core/__tests__/meta-state-schema.test.js` (existing) or `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js`

Add a new `test()` that parses a valid finding with `reopens: ["meta-260606T2202Z-original-id"]` and asserts `parsed.reopens` deep-equals the input. Also assert parsing succeeds WITHOUT `reopens` (backward compat).

**Expected**: FAIL with `unrecognized_keys` or `invalid_type` (field doesn't exist yet).

### Step 2: TDD RED — inverse populates `reopens_inverse`
**File**: `tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js` (existing)

Modify the synthetic-fixture test (line 37-67):
1. Add to the fixture: `{ id: "meta-finding-2", entry_kind: "finding", status: "active", reopens: ["meta-finding-1"] }`
2. Add structural assertion: `assert.ok("reopens_inverse" in inverse, "missing reopens_inverse");`
3. Add to the iteration array (line 54): `"reopens_inverse"`
4. Add population assertion: `assert.deepStrictEqual(inverse.reopens_inverse.get("meta-finding-1"), ["meta-finding-2"]);`

Modify the live-registry test (line 69-101):
1. Add: `assert.ok(result.reopens_inverse instanceof Map, "reopens_inverse must be a Map");` after line 80
2. Add: `assert.ok(cold.inverse_indexes.reopens_inverse, "should have reopens_inverse");` after line 100

**Expected**: FAIL — `reopens_inverse` is `undefined` in current `buildInverseIndexes`.

### Step 3: TDD GREEN — add `reopens` to schema
**File**: `tools/learning-loop-mcp/core/meta-state.js`

Add the field at the end of `metaStateFindingEntrySchema` (after `auto_resolve` at line 74):
```js
reopens: z.array(z.string()).optional()
  .describe("Finding ids whose `expired` lifecycle this entry re-surfaces. Use when a new finding re-flags an issue that was auto-resolved by TTL. Cascade-resolve the parent via `meta_state_resolve({id: parent, cascade_from: [this_id]})`."),
```

Run Step 1's test — should pass.

### Step 4: TDD GREEN — add `reopens_inverse` to builder
**File**: `tools/learning-loop-mcp/core/loop-introspect.js`

In `buildInverseIndexes` (line 250-298):
1. Add `const reopensInverse = new Map();` to the map declarations (line 251-254).
2. Add a new branch in the loop (after the `promoted_to_rule` branch at line 285-290):
   ```js
   // reopens: finding -> expired findings it re-surfaces (inverse direction)
   if (entry.entry_kind === "finding" && Array.isArray(entry.reopens)) {
     for (const expiredId of entry.reopens) {
       if (!reopensInverse.has(expiredId)) reopensInverse.set(expiredId, []);
       reopensInverse.get(expiredId).push(entry.id);
     }
   }
   ```
3. Add `reopens_inverse: reopensInverse,` to the return object (line 293-298).

In `buildRegistrySummary` (line 345-351), add `inverse.reopens_inverse` to the citation-count array:
```js
for (const map of [inverse.addresses_inverse, inverse.supersedes_inverse, inverse.origin_inverse, inverse.promoted_to_rule_inverse, inverse.reopens_inverse]) {
```

Run Step 2's tests — should pass.

### Step 5: TDD GREEN — surface in cold-tier payload
**File**: `tools/learning-loop-mcp/tools/loop-describe-tool.js`

In the cold-tier payload assembly (line 174-179 area — find the `Object.fromEntries(inverseIndexes.X)` block), add a 5th line for `reopens_inverse`:
```js
reopens_inverse: Object.fromEntries(inverseIndexes.reopens_inverse),
```

Verify `__tests__/cold-tier-regression.test.js` line 35 iteration now passes (the new test will FAIL with the 4-map list, so update the list as part of this step).

### Step 6: TDD GREEN — surface in `meta_state_relationships` inbound
**File**: `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js`

After line 65 (the `promoted_from` block), add:
```js
const inboundReopens = inverse.reopens_inverse.get(id);
if (inboundReopens && inboundReopens.length > 0) inbound.reopened_by = inboundReopens;
```

### Step 7: TDD RED → GREEN — relationships test
**File**: `tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js`

Add a new test that:
1. Pre-populates GATE_ROOT-isolated temp registry with a finding whose `reopens: ["target-id"]`.
2. Calls `metaStateRelationshipsTool.handler({id: "target-id", direction: "inbound"})`.
3. Asserts `result.inbound.reopened_by` includes the child id.

**Pattern**: follow existing test setup at line 8-22 (GATE_ROOT + mkdtempSync).

### Step 8: Update cold-tier-regression test
**File**: `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js`

Update line 35's iteration array to add `reopens_inverse`:
```js
for (const mapName of ["addresses_inverse", "supersedes_inverse", "origin_inverse", "promoted_to_rule_inverse", "reopens_inverse"]) {
```

### Step 9: Run full test suite
```bash
pnpm test
```

Verify zero regressions. New tests pass.

## Success Criteria

- [ ] Step 1 schema test passes (RED → GREEN)
- [ ] Step 2 inverse test passes (RED → GREEN)
- [ ] Step 7 relationships test passes (RED → GREEN)
- [ ] Step 8 cold-tier-regression test passes (updated to 5 maps)
- [ ] `pnpm test` shows 0 regressions
- [ ] No `chore` or `docs` commit prefixes
- [ ] `metaStateEntrySchema` (union) still validates existing entries (no `reopens` field)

## Risk Assessment

- **Schema target confusion** — `metaStateEntrySchema` is the union, has no `.shape`. The new field MUST go on `metaStateFindingEntrySchema` (line 23). **Mitigation**: Step 3's code comment cites the exact line.
- **`buildRegistrySummary` missed update** — line 347 hard-codes 4 maps. **Mitigation**: Step 4 updates it in the same commit.
- **Cold-tier payload missed update** — `loop-describe-tool.js:174-179` is a second hard-coded site. **Mitigation**: Step 5 covers it; Step 8's test will fail loud if missed.
- **Inverse direction confusion** — `reopens_inverse` keys on the EXPIRED PARENT (the one being re-surfaced), values are REOPEN CHILDREN. **Mitigation**: Step 4's code comment is explicit; Step 2's fixture assertion locks the direction.

## Security Considerations

- The new field is a string array (no executable content). No injection risk.
- The `reopens_inverse` is exposed via `meta_state_relationships` (inbound), which is read-only and does not require operator gate (per `meta-state-relationships-tool.js:14`).
- No deny-list changes in this phase (the patch tool's `IMMUTABLE_PATCH_FIELDS` is unchanged; `reopens` is not blocked).

## Next Steps

After Phase 1 ships and CI passes, proceed to Phase 2 (cascade resolve extension). Phase 2 reads from the `reopens` field and the `reopens_inverse` map built here.
