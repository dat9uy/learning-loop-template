---
phase: 2
title: "Cascade Resolve (TDD)"
status: pending
priority: P2
effort: "2.5h"
dependencies: ["1"]
---

# Phase 2: Cascade Resolve (TDD)

## Overview

Extend `meta_state_resolve` with a `cascade_from: z.array(z.string()).optional()` parameter. When provided AND the parent entry's `status === "expired"`: validate each child exists, has `reopens: [parent_id]`, and is in `active` or `resolved` status. On success, transition the parent to `resolved` and stamp `cascade_resolved_by: child_ids`. The cascade branch is positioned AFTER the operator gate (`resolution-evidence-required` rule consultation, lines 67-100) to preserve the gate; the `TERMINAL_STATUSES` early-rejection (line 49-64) is special-cased to allow `expired + cascade_from` through, so the cascade branch is reachable.

This phase = brainstorm step 3 + the new cascade test file.

## Requirements

**Functional**:
- `meta_state_resolve({id: expired_id, cascade_from: [child_id]})` transitions parent to `resolved` if child exists, has `reopens: [parent_id]`, and is `active` or `resolved`.
- `meta_state_resolve({id: expired_id, cascade_from: ["missing-id"]})` returns `{resolved: false, reason: "cascade_child_not_found", id, missing_ids: ["missing-id"]}`.
- `meta_state_resolve({id: expired_id, cascade_from: [child_id]})` where child has `reopens: ["other-id"]` returns `{resolved: false, reason: "cascade_child_not_reopening", id, bad_children: [{child_id, expected_reopens: "expired_id", actual_reopens: ["other-id"]}]}`.
- `meta_state_resolve({id: expired_id, cascade_from: [child_id]})` where child is `reported`/`expired`/`stale`/`superseded` returns `{resolved: false, reason: "cascade_child_unresolved", id, bad_children: [{child_id, child_status: "..."}]}`.
- `meta_state_resolve({id: expired_id, cascade_from: ["child-a", "child-b"]})` where both children are valid and `resolved` stamps `cascade_resolved_by: ["child-a", "child-b"]` on the parent.
- `meta_state_resolve({id: expired_id, cascade_from: [...]})` where the operator gate (`resolution-evidence-required` rule) fails returns `{resolved: false, reason: "resolution_evidence_required", ...evidence}` — gate is checked BEFORE cascade validation.
- `meta_state_resolve({id: active_id, cascade_from: [child_id]})` falls through to normal resolution (cascade_from ignored for non-expired). Matches brainstorm "When provided AND entry.status === 'expired'" gating.
- `meta_state_resolve({id: expired_id})` (no cascade_from) continues to return `{resolved: false, reason: "already_terminal", ...}` — existing behavior preserved.

**Non-functional**:
- Cascade branch runs AFTER both `resolution-evidence-required` rule-consultation loops (lines 67-100 of `meta-state-resolve-tool.js`) so the operator gate is preserved.
- Cascade branch runs BEFORE the `TERMINAL_STATUSES` early-rejection (lines 49-64) for the specific case of `entry.status === "expired"`. The early-rejection still applies for `auto-resolved` and `resolved` (cascade is `expired`-only).
- `cascade_resolved_by` is a new audit-trail field. The zod `metaStateEntryPatchSchema` is passthrough (line 201), so no schema update needed.
- `enqueue` lock atomicity — cascade validation + resolve + patch happen under a single lock acquisition (via `updateEntry`'s existing `enqueue`).

## Architecture

```
meta_state_resolve handler (meta-state-resolve-tool.js)
  1. Read entries + locate entry by id                     [existing]
  2. Branch on entry_kind === "change-log" → immutable      [existing]
  3. Terminal status check — SPECIAL-CASED                  [MODIFIED, line 49]
     if (TERMINAL_STATUSES.has(entry.status) &&
         !(entry.status === "expired" && cascade_from?.length > 0)) {
       // reject (existing already_terminal branch)
     }
     // expired + cascade_from is allowed through to reach the cascade
  4. Operator gate: resolution-evidence-required rules     [existing, lines 67-100]
  5. *** NEW: cascade branch (only when cascade_from set) ***
     if (entry.status === "expired" && cascade_from) {
       validate children → resolve or reject
       return early
     }
  6. Build patch (status: "resolved", resolved_at, ...)    [existing, line 102-108]
  7. updateEntry                                          [existing, line 109]
  8. Return success + gate log                            [existing, line 119-127]
```

**Why this order**: The cascade must run AFTER the operator gate (Researcher A blocker C — operator gate is preserved). It must run BEFORE the terminal status check (because `expired` is in `TERMINAL_STATUSES`). To satisfy both, the terminal status check is special-cased to allow `expired + cascade_from` through; the cascade branch itself is placed after the operator gate at line 100. The result: `auto-resolved` and `resolved` entries still hit the existing `already_terminal` rejection regardless of `cascade_from`; only `expired + cascade_from` reaches the cascade branch.

Cascade child validation logic (extracted to `validateAndApplyCascade` helper if > 20 lines):
```
for each child_id in cascade_from:
  1. Find child entry; if missing → collect to missing_ids
  2. If found, check child's reopens includes parent_id; if not → bad_children (not_reopening)
  3. If found, check child's status ∈ {active, resolved}; if not → bad_children (unresolved)
if any error → return rejection with reason + missing_ids | bad_children
else → patch parent (status: resolved, cascade_resolved_by: [valid_child_ids])
```

## Related Code Files

**Create**:
- `tools/learning-loop-mcp/__tests__/meta-state-resolve-cascade.test.js` — new test file (~120 lines, 7 scenarios)

**Modify**:
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` — add `cascade_from` to schema (line 15-19); special-case the terminal-status check at line 49 to allow `expired + cascade_from` through (1-line condition change); insert cascade branch AFTER the operator gate (line 100.5) and BEFORE `now = ...` (line 102); add `validateAndApplyCascade` helper (~40 lines)

**Delete**: none

## Implementation Steps (TDD red → green → refactor → verify)

### Step 1: TDD RED — happy path cascade
**File**: `tools/learning-loop-mcp/__tests__/meta-state-resolve-cascade.test.js` (NEW)

```js
test("cascade_from resolves expired parent when child reopens it", async () => {
  // GATE_ROOT-isolated temp registry
  // Pre-populate: parent {id, status: "expired", ...} + child {id, status: "active", reopens: [parent_id]}
  // Call: meta_state_resolve({id: parent_id, cascade_from: [child_id]})
  // Assert: result.resolved === true
  //         result.cascade_resolved_by === [child_id]
  //         post-readRegistry: parent.status === "resolved"
});
```

**Expected**: FAIL — `cascade_from` is not in the schema, validation rejects the call.

### Step 2: TDD RED — missing child
Same file. Add test:
```js
test("cascade_from with missing child returns cascade_child_not_found", async () => {
  // Pre-populate: parent expired
  // Call: meta_state_resolve({id: parent_id, cascade_from: ["nonexistent"]})
  // Assert: result.resolved === false
  //         result.reason === "cascade_child_not_found"
  //         result.missing_ids === ["nonexistent"]
});
```

### Step 3: TDD RED — child doesn't reopen parent
Same file. Add test:
```js
test("cascade_from with child not reopening parent returns cascade_child_not_reopening", async () => {
  // Pre-populate: parent expired + child with reopens: ["other-id"]
  // Call: meta_state_resolve({id: parent_id, cascade_from: [child_id]})
  // Assert: result.reason === "cascade_child_not_reopening"
  //         result.bad_children[0].child_id === child_id
  //         result.bad_children[0].expected_reopens === parent_id
});
```

### Step 4: TDD RED — child unresolved
Same file. Add test (parameterized over 4 statuses: `reported`, `expired`, `stale`, `superseded`):
```js
test("cascade_from with unresolved child returns cascade_child_unresolved", async () => {
  // For each: pre-populate parent expired + child with reopens: [parent_id] but status in {reported, expired, stale, superseded}
  // Call cascade_from: [child_id]
  // Assert: result.reason === "cascade_child_unresolved"
  //         result.bad_children[0].child_status matches
});
```

### Step 5: TDD RED — multi-child cascade
Same file. Add test:
```js
test("cascade_from with multiple children stamps cascade_resolved_by with all ids", async () => {
  // Pre-populate: parent expired + child-a {resolved, reopens: [parent_id]} + child-b {resolved, reopens: [parent_id]}
  // Call: meta_state_resolve({id: parent_id, cascade_from: ["child-a", "child-b"]})
  // Assert: result.cascade_resolved_by deep-equals ["child-a", "child-b"]
  //         post-readRegistry: parent.cascade_resolved_by deep-equals ["child-a", "child-b"]
});
```

### Step 6: TDD RED — operator gate ordering
Same file. Add test:
```js
test("cascade_from fails the operator gate before child validation", async () => {
  // Pre-populate: parent expired with a resolution-evidence-required rule on its id
  // Child valid (active, reopens: [parent_id])
  // But evidence check FAILS
  // Call cascade_from: [child_id]
  // Assert: result.reason === "resolution_evidence_required"
  //         parent status unchanged
});
```

**Note**: This test may require setting up a `resolution-evidence-required` rule. Use the existing `gate-resolution-evidence.test.js` pattern.

### Step 7: TDD RED — parent not expired falls through
Same file. Add test:
```js
test("cascade_from on non-expired parent falls through to normal resolution", async () => {
  // Pre-populate: parent {id, status: "active"} + child {reopens: [parent_id], status: "active"}
  // Call: meta_state_resolve({id: parent_id, cascade_from: [child_id]})
  // Assert: result.resolved === true
  //         result.cascade_resolved_by is undefined (cascade was ignored)
  //         parent.status === "resolved" (normal flow)
});
```

### Step 8: TDD RED — no cascade_from preserves existing behavior
Same file. Add test:
```js
test("meta_state_resolve with no cascade_from and expired status still returns already_terminal", async () => {
  // Pre-populate: parent expired
  // Call: meta_state_resolve({id: parent_id}) (no cascade_from)
  // Assert: result.reason === "already_terminal"
  //         result.current_status === "expired"
});
```

### Step 9: TDD GREEN — implement cascade
**File**: `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js`

1. Add to schema (line 15-19):
   ```js
   cascade_from: z.array(z.string()).optional()
     .describe("Optional list of finding ids whose `reopens` field must include this entry's id. When provided AND this entry's status is 'expired': validate each child (exists, reopens includes parent, status is 'active' or 'resolved'), then transition this entry to 'resolved' and stamp `cascade_resolved_by`. Mirrors the inverse of `meta_state_supersede`. Operator gate still applies."),
   ```

2. Update handler signature (line 20):
   ```js
   handler: async ({ id, resolution, resolved_by, cascade_from }) => {
   ```

3. Reorder the handler. Currently:
   - Line 22-23: read entries + find entry
   - Line 25-35: not_found
   - Line 37-47: change-log immutable
   - Line 49-64: terminal status check (rejects `auto-resolved`, `expired`, `resolved`)
   - Line 67-100: operator gate
   - Line 102-109: build patch + updateEntry
   - Line 111-127: return success

   New order:
   - Line 22-23: read entries + find entry (unchanged)
   - Line 25-35: not_found (unchanged)
   - Line 37-47: change-log immutable (unchanged)
   - **MODIFIED line 49-64: terminal status check special-cased**
     ```js
     if (TERMINAL_STATUSES.has(entry.status) && !(entry.status === "expired" && cascade_from && cascade_from.length > 0)) {
       // existing already_terminal branch unchanged
     }
     ```
   - Line 67-100: operator gate (unchanged)
   - **NEW: line 100.5-101.5: if `entry.status === "expired" && cascade_from && cascade_from.length > 0`, run `validateAndApplyCascade` and return early.**
   - Line 102-109: build patch + updateEntry (unchanged — only reached for non-cascade cases)
   - Line 111-127: return success (unchanged)

4. Add helper function (export it from the file so the test can import and unit-test directly if needed; otherwise keep it module-local):
   ```js
   async function validateAndApplyCascade(root, parent, childIds, entries, resolution, resolvedBy) {
     const validChildren = [];
     const missingIds = [];
     const badChildren = [];

     for (const childId of childIds) {
       const child = entries.find((e) => e.id === childId);
       if (!child) {
         missingIds.push(childId);
         continue;
       }
       if (!Array.isArray(child.reopens) || !child.reopens.includes(parent.id)) {
         badChildren.push({
           child_id: childId,
           reason: "not_reopening",
           expected_reopens: parent.id,
           actual_reopens: child.reopens ?? null,
         });
         continue;
       }
       if (child.status !== "active" && child.status !== "resolved") {
         badChildren.push({
           child_id: childId,
           reason: "unresolved",
           child_status: child.status,
         });
         continue;
       }
       validChildren.push(childId);
     }

     if (missingIds.length > 0) {
       return { resolved: false, reason: "cascade_child_not_found", id: parent.id, missing_ids: missingIds };
     }
     if (badChildren.length > 0) {
       const reason = badChildren[0].reason === "not_reopening"
         ? "cascade_child_not_reopening"
         : "cascade_child_unresolved";
       return { resolved: false, reason, id: parent.id, bad_children: badChildren };
     }

     // All children valid — apply the cascade
     const now = new Date().toISOString();
     const patch = {
       status: "resolved",
       resolved_at: now,
       resolved_by: resolvedBy,
       cascade_resolved_by: validChildren,
       ...(resolution && { resolution }),
     };
     await updateEntry(root, parent.id, patch);
     return {
       resolved: true,
       id: parent.id,
       status: "resolved",
       resolved_by: resolvedBy,
       cascade_resolved_by: validChildren,
       ...(resolution && { resolution }),
     };
   }
   ```

5. In the handler, the cascade branch is inserted AFTER the operator gate (line 100.5-101.5) and calls this helper:
   ```js
   if (entry.status === "expired" && cascade_from && cascade_from.length > 0) {
     const result = await validateAndApplyCascade(root, entry, cascade_from, entries, resolution, resolved_by);
     appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
     return { content: [{ type: "text", text: JSON.stringify(result) }] };
   }
   ```
   This branch is reached only after the operator gate has passed (line 100). For `auto-resolved` and `resolved` entries, the terminal status check (line 49) rejects with `already_terminal` regardless of `cascade_from`.

6. JSDoc on the helper documenting:
   - `superseded` child is rejected (status allowlist is `active` or `resolved` only)
   - Forward-compat note: if `expired` is deprecated, the cascade becomes unreachable; future migration path is to accept `stale` or remove

Run Steps 1-8's tests — should pass.

### Step 10: Run full test suite
```bash
pnpm test
```

Verify zero regressions. New cascade tests pass.

## Success Criteria

- [ ] All 7 cascade scenarios in Steps 1-7 pass (RED → GREEN)
- [ ] Step 8 (no-cascade_from backward compat) passes
- [ ] `pnpm test` shows 0 regressions
- [ ] Operator gate (`resolution-evidence-required` rule consultation) runs BEFORE cascade validation (Step 6 locks this)
- [ ] Cascade branch is positioned AFTER the operator gate (line 100); terminal status check is special-cased to allow `expired + cascade_from` through
- [ ] `cascade_resolved_by` is stamped on the parent only (audit trail one-directional; children unchanged)
- [ ] No new dependencies

## Risk Assessment

- **Gate order regression** — the terminal status check is special-cased to allow `expired + cascade_from` through, while `auto-resolved` and `resolved` still hit the existing `already_terminal` rejection. **Mitigation**: the special case is `entry.status === "expired" && cascade_from?.length > 0` only; other terminal statuses fall through to the existing rejection.
- **`bad_children` shape mismatch with `missing_ids`** — the error shape has two different "container" fields depending on which check failed. **Mitigation**: documented in JSDoc + Step 9's helper code; tests assert the exact shape.
- **Operator gate bypassed by `cascade_from`** — if cascade runs before the gate, an operator-gated parent could be cascade-resolved. **Mitigation**: Step 6's test locks gate-before-cascade ordering.
- **TOCTOU on `entries` array** — the handler reads `entries` once, then iterates for child lookup. If another process modifies the registry between read and `updateEntry`, the cascade could validate stale state. **Mitigation**: `updateEntry` itself runs under the `enqueue` lock, so the patch is atomic. Pre-validation uses the read snapshot; if the snapshot is stale, the patch either succeeds (no change) or fails (CAS mismatch). The CAS machinery in `updateEntry` (line 307-311 of `core/meta-state.js`) catches version drift.
- **Compaction race** — parent in `expired` could be compacted (7-day rule at line 320-326 of `core/meta-state.js`) during the cascade. **Mitigation**: compaction happens INSIDE `updateEntry` under the same `enqueue` lock. Race-free.
- **`metaStateBatch` bypass** — `metaStateBatch.update` doesn't go through the cascade. **Mitigation**: out of scope; the batch is operator-mode-gated; flag for future.

## Security Considerations

- The cascade is operator-gated (via the `resolution-evidence-required` rule mechanism). No widening of access.
- `cascade_from` is a string array — no executable content, no injection risk.
- The new `cascade_resolved_by` field is an audit-trail stamp; not user-controlled content.

## Next Steps

After Phase 2 ships and CI passes, proceed to Phase 3 (patch error discoverability). Phase 3 is independent of Phase 2's cascade logic — both modify tool handlers, but in separate files.
