---
phase: 4
title: "Cascade Rewire + Discoverability Hint + Hook Backfill"
status: pending
priority: P2
effort: "1.5h"
dependencies: ["phase-03-lint-tool"]
---

# Phase 4: Cascade Rewire + Discoverability Hint + Hook Backfill

## Overview

Three changes ship together because they form the "agent affordance complete" surface: (a) rewire `meta_state_resolve`'s cascade branch to delegate to `meta_state_migrate_expired_to_stale` (the 2-step path), (b) add the 11th discoverability hint in both canonical `core/loop-introspect.js` AND the `.factory/hooks/loop-surface-inject.cjs` mirror (backfilling hints #7–#10 that drifted), (c) register both new tools in `agent-manifest.json` so they show up in `loop_describe` discovery.

## Requirements

### Functional

**(a) Cascade rewire:**
- `meta_state_resolve({ id, cascade_from: ['<child_id>'] })` for an `expired` parent now delegates to `meta_state_migrate_expired_to_stale` (which transitions to `stale`).
- The 1-step `expired → resolved` direct transition is removed.
- Operator must call `meta_state_resolve` again (without `cascade_from`) to actually close the now-`stale` parent.
- The 2-step path is documented in the cascade branch's tool description AND the resolve tool description.

**(b) 11th hint:**
- `core/loop-introspect.js` (canonical): add an 11th string to `DISCOVERABILITY_HINTS` (index 10) describing the "X is related to Y" agent script: validate → report with `reopens` → migrate each expired parent → cascade-resolve.
- `.factory/hooks/loop-surface-inject.cjs` (mirror): backfill hints #7–#10 (currently drifted — hook has 6, canonical has 10) AND add the 11th. Hook lands at 11.
- Test assertions for hint count update from 10 → 11 in:
  - `__tests__/loop-describe-warm-tier.test.js` (5 places: lines 12, 16, 47, 60, 64)
  - `__tests__/cold-session-discoverability.test.cjs` (2 places: lines 426, 445-448)

**(c) Agent manifest:**
- `tools/learning-loop-mcp/agent-manifest.json` `meta_state` group: add `meta_state_migrate_expired_to_stale` and `meta_state_relationship_validate` (2 new entries, preserves alphabetical order).

### Non-functional

- Cascade rewire: ~6 lines modified, ~2 lines removed in `meta-state-resolve-tool.js`.
- 11th hint text is ~280 chars (within the existing 200-char-but-allowed range used by hints 8–10).
- Hint backfill to hook: 30 lines added (4 hints × ~6 lines + the 11th).
- All existing tests pass; new assertions in `loop-describe-warm-tier.test.js` and `cold-session-discoverability.test.cjs` update hint-count expectations.
- No regressions in `meta_state_resolve` operator gate (the normal-resolve path still goes through `resolution-evidence-required`).

## Architecture

**(a) Cascade rewire — data flow:**

Old flow (lines 132-208 of `meta-state-resolve-tool.js`):
```
expired parent + cascade_from = [valid_child]
  → (consult-gate fires at lines 67-103 of resolve tool)
  → validateAndApplyCascade
  → patch { status: "resolved", resolved_at, resolved_by, cascade_resolved_by }
  → return { resolved: true, status: "resolved", cascade_resolved_by }
```

New flow:
```
expired parent + cascade_from = [valid_child]
  → (consult-gate fires at lines 67-103 of resolve tool; if BLOCKED, return resolution_evidence_required)
  → validateCascadeChildren (re-uses existing validation logic)
  → call meta_state_migrate_expired_to_stale({ id: parent_id })
  → return { resolved: false, status: "stale", migrated_via_cascade: true, suggestion: "Call meta_state_resolve again to close." }
```

The path length depends on whether a `resolution-evidence-required` rule gates the parent:
- **Ungated** (no rule): 2-step. (1) `meta_state_resolve({cascade_from})` → migrate to `stale`. (2) `meta_state_resolve({id})` → close.
- **Gated** (rule applies): 3-step. (1) Satisfy the rule (run the cold-session test or whatever the rule requires). (2) `meta_state_resolve({cascade_from})` → migrate to `stale`. (3) `meta_state_resolve({id})` → re-apply gate → close.

**Why the consult-gate bypass is correct here (for the migration step only):** the migration primitive is a state-machine transition, not a resolve. The gate's purpose is to enforce operator verification before CLOSING findings. Migration to `stale` doesn't close the finding; it just brings it into the new lifecycle. The gate applies on the second `meta_state_resolve` call (the close). The migration tool itself does not consult the gate (per the design in Phase 2).

**(b) Hint text:**

The 11th hint encodes the "X is related to Y" script end-to-end. It should be:
```
"For 'X is related to Y' prompts, the canonical script is: (1) meta_state_relationship_validate({description, entry_id?}) to lint orphan ids; (2) meta_state_report({..., reopens: ['<orphan_ids>']}) to set the structural field; (3) for each expired parent, meta_state_migrate_expired_to_stale({id}) to bring it into the new lifecycle; (4) meta_state_resolve({id: parent_id, cascade_from: ['<new_finding_id>']}) to close. The cascade branch delegates to migrate + leaves a follow-up resolve call; it is a 2-step path, not a 1-step close."
```

That's ~580 chars. Existing hints range from 130 to 230 chars. This is too long. **Trim to ~250 chars:**
```
"For 'X is related to Y' prompts: (1) meta_state_relationship_validate to lint; (2) meta_state_report({..., reopens: ['<orphan_id>']}); (3) meta_state_migrate_expired_to_stale per expired parent; (4) meta_state_resolve({cascade_from}) to close. The cascade is 2-step: migrate then resolve."
```

That's ~250 chars. Acceptable.

**(c) Hook backfill:**

The 4 missing hints (currently in canonical, missing from hook) are:
- Hint #7 (index 6): "For reopens: set reopens: ['<old_expired_id>'] on the new finding at report time, then cascade-resolve the parent via meta_state_resolve({id: old_id, cascade_from: [child_id]})."
- Hint #8 (index 7): "For rule and loop-design lifecycle, use meta_state_list({entry_kind: 'rule' | 'loop-design'}) or loop_describe({tier: 'cold'}). The cold tier surfaces a loop_designs list with id, title, proposed_design_for, addresses, and shipped_in_plan."
- Hint #9 (index 8): "To pick a tool, prefer the canonical MCP tool over node -e escape hatches or direct file I/O. The 4-question framework: what, when, inputs, returns. See tools/learning-loop-mcp/references/tool-selection-guide.md."
- Hint #10 (index 9): "AGENTS.md is the priority-1 prompt (steering layer). The tool manifest is the deterministic tool-selection surface. loop_describe warm tier discoverability_hints is the at-start-up injection. The learning-loop skill is the prompt-author docs. Each surface has a distinct role; do not duplicate content across them."

The hook is missing all 4 (currently at 6). Backfilling brings the hook to 10, and the 11th hint brings it to 11. Match canonical.

**Hook drift prevention:** A regression assertion in the cold-session test verifies hook `LOCAL_DISCOVERABILITY_HINTS.length` matches canonical `DISCOVERABILITY_HINTS.length`. If they ever drift again, the test fails.

## Related Code Files

### Modify
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` (lines 105-118, 132-208) — rewire cascade branch.
- `tools/learning-loop-mcp/core/loop-introspect.js` (line 89-100) — add 11th hint to `DISCOVERABILITY_HINTS` array.
- `.factory/hooks/loop-surface-inject.cjs` (line 18-24) — backfill hints #7–#10 + add 11th.
- `tools/learning-loop-mcp/agent-manifest.json` (line 70-89) — add 2 new tools to `meta_state` group.
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` (lines 11, 67, 72; 3 assertions of `length === 10` → 11) — update hint count expectations.
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (lines 426, 445-448) — same.

### Create
- Test assertion in `cold-session-discoverability.test.cjs` to verify hook hint count matches canonical (or at least the cold-tier hint count assertion includes a hook check).

## Implementation Steps

### Step 1: Cascade rewire (TDD first)

#### Step 1a: TDD RED — write failing cascade test

```js
// File: __tests__/meta-state-resolve-cascade.test.js (or extend existing)
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateResolveTool } from "../tools/meta-state-resolve-tool.js";
import { readRegistry, writeEntry } from "../core/meta-state.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "cascade-test-"));
}

describe("meta_state_resolve cascade rewire", () => {
  let root;

  before(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  it("cascade delegates to migrate_expired_to_stale and produces stale status", async () => {
    // Setup: expired parent + active child with reopens
    const parent = {
      id: "meta-test-cascade-parent",
      entry_kind: "finding",
      status: "expired",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Expired parent for cascade test (min 20 chars)",
      created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      version: 0,
    };
    const child = {
      id: "meta-test-cascade-child",
      entry_kind: "finding",
      status: "active",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Active child that reopens parent (min 20 chars)",
      reopens: ["meta-test-cascade-parent"],
      created_at: new Date().toISOString(),
      version: 0,
    };
    await writeEntry(root, parent);
    await writeEntry(root, child);

    const result = await metaStateResolveTool.handler({
      id: "meta-test-cascade-parent",
      cascade_from: ["meta-test-cascade-child"],
    });
    const parsed = JSON.parse(result.content[0].text);

    // New behavior: cascade produces stale, not resolved
    assert.equal(parsed.status, "stale");
    assert.equal(parsed.migrated_via_cascade, true);

    // The entry is stale, not resolved
    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === "meta-test-cascade-parent");
    assert.equal(updated.status, "stale");
    assert.equal(updated.expires_at, null);
    assert.ok(updated.last_verified_at);
    // NOT resolved yet
    assert.equal(updated.resolved_at, null);
  });
});
```

Run test. It should fail (current behavior transitions directly to `resolved`).

#### Step 1b: TDD GREEN — rewire cascade

In `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js`:

1. Add an import (top of file):
```js
import { metaStateMigrateExpiredToStaleTool } from "./meta-state-migrate-expired-to-stale-tool.js";
```

2. Replace the cascade branch (lines 105-118 + `validateAndApplyCascade` definition) with:

```js
// Cascade branch: only when entry is expired AND cascade_from is provided.
// New behavior (post-relationship-modeling plan): delegate to migrate_expired_to_stale.
// The parent transitions expired -> stale; the operator must call meta_state_resolve
// again (no cascade_from) to close. The 2-step path is documented in the
// tool description and the 11th discoverability hint.
if (entry.status === "expired" && cascade_from?.length > 0) {
  const childValidation = validateCascadeChildren(root, entry, cascade_from, entries);
  if (!childValidation.valid) {
    appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", id: entry.id, ...childValidation });
    return { content: [{ type: "text", text: JSON.stringify({ resolved: false, ...childValidation }) }] };
  }

  // Delegate to the migration primitive (state-machine transition; bypasses consult-gate)
  const migrateResult = await metaStateMigrateExpiredToStaleTool.handler({ id: entry.id });
  const migrateParsed = JSON.parse(migrateResult.content[0].text);

  if (!migrateParsed.migrated) {
    const result = { resolved: false, cascade_migration_failed: true, ...migrateParsed };
    appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  const result = {
    resolved: false,  // NOT resolved yet; 2-step path
    migrated_via_cascade: true,
    id: entry.id,
    status: "stale",
    cascade_from: validChildren,  // see below
    suggestion: "Parent migrated to 'stale'. Call meta_state_resolve again (without cascade_from) to apply the consult-gate and close.",
  };
  appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}
```

3. Replace `validateAndApplyCascade` with a slimmer `validateCascadeChildren` that returns `{ valid, missing_ids?, bad_children? }` but does NOT apply the patch.

4. Update the `cascade_from` JSDoc on the tool schema (line 25-29) to reflect the 2-step path:
```
"Optional list of finding ids whose `reopens` field must include this entry's id. When provided AND this entry's status is 'expired': the entry is migrated to 'stale' (via the new tool primitive). The operator must call meta_state_resolve again WITHOUT cascade_from to apply the consult-gate and close the now-stale entry. This is a 2-step path. Mirrors the inverse of meta_state_supersede."
```

5. Update the tool description (lines 13-15) to mention the 2-step path.

Run the cascade test. It should pass.

#### Step 1c: regression — verify normal-resolve still goes through gate

Run the existing `meta-state-resolve-cascade.test.js` (or whatever existing tests cover the consult-gate). They should still pass — the normal-resolve path is unchanged.

### Step 2: 11th hint (canonical)

In `tools/learning-loop-mcp/core/loop-introspect.js`, add to `DISCOVERABILITY_HINTS` (after line 100, the closing `]);`):

```js
  "For 'X is related to Y' prompts: (1) meta_state_relationship_validate to lint; (2) meta_state_report({..., reopens: ['<orphan_id>']}); (3) meta_state_migrate_expired_to_stale per expired parent; (4) meta_state_resolve({cascade_from}) to close. The cascade is 2-step: migrate then resolve.",
```

Verify `DISCOVERABILITY_HINTS` is `Object.freeze`d; the array literal can still grow at module-load time before the freeze.

### Step 3: Hook backfill (mirror)

In `.factory/hooks/loop-surface-inject.cjs`, replace the `LOCAL_DISCOVERABILITY_HINTS` array (lines 18-24) with the full 11-hint array (copy from canonical). This is a verbatim copy of `core/loop-introspect.js:90-100` plus the new 11th.

### Step 4: Test updates

In `__tests__/loop-describe-warm-tier.test.js`:
- Line 12: `assert.strictEqual(parsed.discoverability_hints.length, 10)` → `11`
- Line 47: same
- Line 60: same (cold tier)
- Line 64: same (buildDiscoverabilityHints pure function)
- Add a new test for the 11th hint's content: `assert.ok(eleventhHint.includes("relationship_validate"))`

In `__tests__/cold-session-discoverability.test.cjs`:
- Line 426: `assert.strictEqual(warm.discoverability_hints.length, 10)` → `11`
- Line 445-448: same

Add a new test for hook mirror drift prevention:
```js
test("hook mirror matches canonical hint count (drift prevention)", async () => {
  const hook = await import("../../../.factory/hooks/loop-surface-inject.cjs");
  // ... (call the hook's main() with summary mode, parse the output, count hints)
  // Assert hook hint count === canonical hint count.
});
```

(Note: this test requires careful handling of the hook's module shape; if it's not directly importable, the test can read the file and count `LOCAL_DISCOVERABILITY_HINTS` entries by regex.)

### Step 5: Agent manifest

In `tools/learning-loop-mcp/agent-manifest.json` `meta_state` group (line 70-89), add 2 entries (preserving alphabetical order):
```json
"meta_state_migrate_expired_to_stale",
"meta_state_relationship_validate",
```

(`meta_state_report` is already first; the new entries fit between `meta_state_log_change` and `meta_state_patch` alphabetically, OR appended at the end. The exact placement is a style choice; the brainstorm does not lock it. Append at the end to avoid reshuffling existing lines: after `meta_state_archive`.)

## Success Criteria

- [ ] Cascade test passes (new 2-step behavior).
- [ ] All existing `meta_state_resolve` tests still pass (normal-resolve path unchanged).
- [ ] 11th hint present in canonical.
- [ ] Hook mirror has 11 hints (backfilled 4 + added 1).
- [ ] Hook drift prevention test passes (hook count === canonical count).
- [ ] Both `loop-describe-warm-tier.test.js` and `cold-session-discoverability.test.cjs` update 10 → 11.
- [ ] `agent-manifest.json` `meta_state` group has 17 tools (was 15, +2).
- [ ] `loop_describe({tier: "warm"})` output includes the 11th hint.
- [ ] `loop_describe({tier: "cold"})` output includes the 11th hint.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Cascade rewire breaks existing call sites | The 2-step path is documented in the tool description. Operators who used the 1-step path now see `migrated_via_cascade: true` and a suggestion to call again. Audit trail captures the transition. |
| Tool description drift between resolve and migrate | Both descriptions are updated in this phase. The cascade branch's behavior is delegated, not duplicated, so a single source of truth is maintained. |
| 11th hint exceeds 5KB total | Total hint byte length is asserted in `cold-session-discoverability.test.cjs:448-454`. The 11th adds ~250 chars (~250 bytes); total stays well under 5KB. |
| Hook-mirror drift recurs | Drift prevention test in Step 4 catches future drift. (Light touch: count check, not text equality.) |
| Agent manifest order alphabetical breakage | The new entries are appended; no reshuffling. |
| Cascade rewire may be reverted by 260610-1535 plan refactor | 260610-1535 is `status: completed`; its `validateAndApplyCascade` is in main. The rewire happens in this phase. No conflict. |
| `meta_state_resolve` import cycle (imports `meta_state_migrate_expired_to_stale`) | Both are leaf modules; the import is a top-level static import. No cycle. |
