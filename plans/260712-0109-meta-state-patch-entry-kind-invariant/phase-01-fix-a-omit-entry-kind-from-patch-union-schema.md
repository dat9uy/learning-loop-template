---
phase: 1
title: >-
  Fix + repair — omit entry_kind+status from patch schema, strip in updateEntry,
  repair corrupted entries
status: completed
priority: P1
dependencies: []
---

# Phase 1: Fix + repair

## Overview

Close the identity-invariant injection class at the schema layer, add a one-line core-layer strip, and repair the two corrupted loop-design entries — all in one phase (collapsed from 3 per red-team Scope #2).

**Fix A** — `buildPatchSchemaFor` (`core/meta-state.js:329-340`) omits `entry_kind` on all 4 branches AND `status` on the rule + loop-design branches before `.partial().strict()`. Red-team (Security #1, Critical) proved `status: z.enum(["active","inactive"]).default("active")` (`:209`, `:238`) is the same `.default()`-under-`.partial()` injection class: an empty/kind-specific patch on a rule/loop-design silently injects `status:"active"`, re-activating a deliberately deactivated rule or shipped design. Per the source report's universal-scope direction, Fix A closes the class, not just the `entry_kind` instance.

**Fix B** — one-line `delete cleanPatch.entry_kind` in `updateEntry` (`meta-state.js:642-646`), defense-in-depth for direct core callers (promote-rule, dispatch, re-verify, resolve, supersede) that bypass the patch schema. The finding's own recommended fix. Demoted from a phase to a one-liner (red-team Scope #1): Fix A is load-bearing; Fix B is belt-and-suspenders.

**Repair** — `meta_state_batch` update op re-asserts `entry_kind:"loop-design"` on the two corrupted entries (`meta-state.jsonl:275-276`, stored `"finding"`, version 1). The only viable path: patch tool refuses (branch-mismatch guard at `meta-state-patch-tool.js:43`), direct file edit write-gated (`bound-artifacts.js:57-64`). Batch has no branch check, `entry_kind ∉ IMMUTABLE_PATCH_FIELDS` (until Phase 2's stopgap), no re-validation — repair succeeds.

Four RED tests through the `withMcpServer`/`callTool` harness (the bug only fires at the MCP schema layer). Two `meta_state_log_change` entries filed AFTER each logical change's edit lands (operator-confirmed ordering: edit-first, change-log-after — eliminates the audit/reality divergence window where a change-log could claim a change that never happened).

## Requirements

- **Functional**: empty `{}` preserves `entry_kind` AND `status` on every kind; `entry_kind` inside `patch` is rejected (registry state unchanged); gate-log `fields_patched` for an empty patch is `[]`; `updateEntry` strips a smuggled `entry_kind`; the two corrupted entries read back as `entry_kind:"loop-design"`.
- **Non-functional**: zero behavior change for existing patch-tool tests (R1: none send `entry_kind`/`status` inside `patch`; grep-verified across 25 test files). Full suite stays green.

## Architecture

`tools/learning-loop-mastra/core/meta-state.js:329-340` (`buildPatchSchemaFor`):

```js
// After — omit identity + lifecycle fields before .partial().strict():
export function buildPatchSchemaFor(kind) {
  switch (kind) {
    case "finding":     return metaStateFindingEntrySchema.omit({ entry_kind: true }).partial().strict();
    case "change-log":  return metaStateChangeEntrySchema.omit({ entry_kind: true }).partial().strict();
    case "rule":        return metaStateRuleEntrySchema.omit({ entry_kind: true, status: true }).partial().strict();
    case "loop-design": return metaStateLoopDesignSchema.omit({ entry_kind: true, status: true }).partial().strict();
    default: throw new Error(/* ... */);
  }
}
```

- `entry_kind` omitted on all 4 branches (identity; set by the tool's top-level branch-selector param).
- `status` omitted on rule + loop-design (lifecycle identity; deactivation/ship is an operator decision via `meta_state_promote_rule` / `propose_design` + `meta_state_patch` is NOT the lifecycle-flip tool — but with `status` in the patch schema + `.default("active")`, any patch silently re-activates). Change-log `status` is `z.literal("active")` (no `.default`, always active) — omit `entry_kind` only. Finding `status` has no `.default` (optional enum) — omit `entry_kind` only.
- Source-of-truth branch schemas keep `entry_kind` + `status` for `writeEntry` validation. Only the patch projection omits them. `.omit` preserves `z.preprocess(stripEnvelope,...)` on `proposed_design_for`/`addresses` (red-team Failure #6 verified safe).

`tools/learning-loop-mastra/core/meta-state.js:640-648` (`updateEntry` — Fix B one-liner):

```js
const cleanPatch = { ...patch };
delete cleanPatch._expected_version;
delete cleanPatch.__proto__;
delete cleanPatch.constructor;
delete cleanPatch.entry_kind;   // identity invariant — never patchable (finding meta-260712T0053Z)
Object.assign(entry, cleanPatch);
```

`updateEntry`-only. The batch update path (`meta-state.js:754-777`) is deliberately NOT touched here — it is the repair mechanism. Phase 2's `IMMUTABLE_PATCH_FIELDS` stopgap closes the batch hole post-repair.

`tools/learning-loop-mastra/core/meta-state.js:280-300` (`IMMUTABLE_PATCH_FIELDS` jsdoc + set): update the stale jsdoc note (currently says `entry_kind` is "NOT here" because "per-kind schemas use z.literal which already prevents changing the kind" — after Fix A that's true for the patch path). Phase 2 adds `entry_kind` + `status` to the set itself.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js:329-340` (`buildPatchSchemaFor` — Fix A)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:640-648` (`updateEntry` — Fix B one-liner)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:280-300` (`IMMUTABLE_PATCH_FIELDS` jsdoc — Phase 1 update; set itself — Phase 2)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js` (4 RED tests via harness)
- Modify: `tools/learning-loop-mastra/core/meta-state.test.js` (1 RED test for Fix B, direct `updateEntry` call)
- Mutate via MCP: 2 `meta_state_log_change` entries (code fix, data repair) + `meta_state_batch` repair

## Implementation Steps (TDD)

### Step 1.1: RED tests (write FIRST)

`tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRegistry } from "../../core/meta-state.js";
import { withMcpServer } from "../with-mcp-server.js";

// All tests go through withMcpServer/callTool so the MCP-layer Zod union
// validation fires. Direct handler calls bypass the schema and cannot
// reproduce the .default() injection (finding meta-260712T0053Z).
//
// Harness behavior (verified with-mcp-server.js:88-101): callTool does
// JSON.parse(result.content[0].text) with no isError check. When the MCP
// SDK rejects invalid args (Fix A's .strict() rejects entry_kind as unknown),
// it returns {isError:true, content:[{text:"Tool validation failed..."}]}
// (non-JSON) → callTool throws SyntaxError from JSON.parse. Tests that
// expect rejection MUST wrap callTool in try/catch and assert the REGISTRY
// STATE as the primary check, not the callTool return value.

// (a) Empty patch {} on a loop-design preserves entry_kind (no first-union-branch injection).
test("meta_state_patch empty patch {} on loop-design preserves entry_kind", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const design = await callTool("mastra_meta_state_propose_design", {
      title: "test-empty-patch-kind-preservation",
      description: "Empty patch must not flip entry_kind (min 20 chars)",
      proposed_design_for: ["rule-A"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    const result = await callTool("mastra_meta_state_patch", {
      id: design.id,
      entry_kind: "loop-design",
      patch: {},
    });
    assert.equal(result.patched, true);
    assert.equal(result.entry_kind, "loop-design");
    const entry = readRegistry(tempRoot).find((e) => e.id === design.id);
    assert.equal(entry.entry_kind, "loop-design", "entry_kind must not flip to 'finding'");
  });
});

// (a-status) Empty patch {} on an inactive rule preserves status (no re-activation).
// Red-team Security #1: status .default("active") is the same injection class.
test("meta_state_patch empty patch {} on inactive rule preserves status:inactive", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    // 1. Create a rule via promote_rule (the rule-creation path). Need a finding first.
    const report = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding to promote to a rule for status-injection test (min 20 chars)",
    });
    const rule = await callTool("mastra_meta_state_promote_rule", {
      id: report.id,
      rule_id: "rule-status-injection-test",
      enforcement: "agent",
      pattern_type: "consult-checklist",
      pattern: "test-status-injection",
    });
    // 2. Deactivate the rule (lifecycle flip via patch — status is still patchable until Fix A).
    await callTool("mastra_meta_state_patch", {
      id: "rule-status-injection-test",
      entry_kind: "rule",
      patch: { status: "inactive" },
    });
    // 3. Empty {} patch — must NOT re-inject status:"active".
    await callTool("mastra_meta_state_patch", {
      id: "rule-status-injection-test",
      entry_kind: "rule",
      patch: { description: "patch the description only (min 20 chars for schema)" },
    });
    const entry = readRegistry(tempRoot).find((e) => e.id === "rule-status-injection-test");
    assert.ok(entry, "rule not found");
    assert.equal(entry.status, "inactive", "status must NOT re-activate to 'active' on an unrelated patch");
  });
});

// (b) entry_kind inside patch is rejected (Fix A). callTool THROWS SyntaxError on the
//     non-JSON MCP validation error — assert registry state as the primary check.
test("meta_state_patch rejects entry_kind inside patch (Fix A); registry state unchanged", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const report = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding for entry_kind-in-patch rejection test (min 20 chars)",
    });
    // After Fix A: patch:{entry_kind:"rule"} → .strict() rejects as unknown key →
    // MCP SDK returns isError text → callTool throws SyntaxError from JSON.parse.
    // (Pre-fix RED: the patch SUCCEEDS — entry_kind matches the rule branch, flips to "rule".
    //  See red-team Failure #3: the RED-state corruption is to "rule", not "finding".)
    await assert.rejects(
      callTool("mastra_meta_state_patch", {
        id: report.id,
        entry_kind: "finding",
        patch: { entry_kind: "rule" },
      }),
      // Accept any rejection (SyntaxError from JSON.parse, or a thrown Zod error).
      // The registry-state assertion below is the load-bearing check.
    );
    const entry = readRegistry(tempRoot).find((e) => e.id === report.id);
    assert.equal(entry.entry_kind, "finding", "entry_kind must be unchanged after rejected patch");
  });
});

// (d) Gate-log fields_patched for an empty patch is [] (honest logging). The handler
//     logs Object.keys(effectivePatch) at patch-tool.js:142. Pre-fix: .default() injects
//     entry_kind → fields_patched:["entry_kind"]. Post-fix: no injection → [].
//     Gate-log path (verified gate-logging.js:53-63 + gate-logging.test.js:79):
//     <tempRoot>/.claude/coordination/gate-log.jsonl
test("meta_state_patch empty patch logs fields_patched:[] not ['entry_kind']", async () => {
  await withMcpServer(async ({ callTool, tempRoot }) => {
    const report = await callTool("mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Finding for honest gate-log fields_patched test (min 20 chars)",
    });
    await callTool("mastra_meta_state_patch", {
      id: report.id,
      entry_kind: "finding",
      patch: {},
    });
    const gateLogPath = join(tempRoot, ".claude", "coordination", "gate-log.jsonl");
    const gateLog = readFileSync(gateLogPath, "utf8").trim().split("\n").map(JSON.parse);
    const patchEntry = gateLog.filter((e) => e.tool === "meta_state_patch" && e.id === report.id).pop();
    assert.ok(patchEntry, "gate log must contain the patch entry");
    assert.deepEqual(patchEntry.fields_patched, [],
      `fields_patched must be [] for empty patch, got ${JSON.stringify(patchEntry.fields_patched)}`);
  });
});
```

Add to `tools/learning-loop-mastra/core/meta-state.test.js` (Fix B — direct `updateEntry` call, alongside the existing `updateEntry` block at line ~69; match the file's `mkdtempSync`/`GATE_ROOT` fixture style):

```js
test("updateEntry strips smuggled entry_kind from patch (defense-in-depth, Fix B)", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "patch-defense-"));
  process.env.GATE_ROOT = tempRoot;
  try {
    const { writeEntry, updateEntry, readRegistry, generateId } =
      await import("../../core/meta-state.js");
    const id = generateId("defense-test");
    await writeEntry(tempRoot, {
      id, entry_kind: "finding", category: "loop-anti-pattern",
      severity: "warning", affected_system: "mcp-tools",
      description: "Finding for updateEntry defense-in-depth test (min 20 chars)",
      status: "open", created_at: new Date().toISOString(), version: 0,
    });
    await updateEntry(tempRoot, id, { entry_kind: "rule", description: "patched" });
    const entry = readRegistry(tempRoot).find((e) => e.id === id);
    assert.equal(entry.entry_kind, "finding", "entry_kind must NOT flip to 'rule'");
    assert.equal(entry.description, "patched", "legitimate field must still apply");
  } finally {
    delete process.env.GATE_ROOT;
  }
});
```

### Step 1.2: Run RED tests → expect failure (corruption reproduces)

```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm exec node --test --test-timeout=30000 \
  tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js
# Expected BEFORE fix:
#   (a) FAIL — empty {} flips entry_kind loop-design → finding
#   (a-status) FAIL — empty {} re-activates status inactive → active
#   (b) the callTool REJECTS (assert.rejects passes) BUT the registry-state assertion FAILS
#       pre-fix because the patch SUCCEEDS and flips entry_kind to "rule" (red-team Failure #3)
#   (d) FAIL — fields_patched:["entry_kind"] instead of []
# Then the Fix B test in core/meta-state.test.js:
pnpm exec node --test --test-timeout=30000 --test-name-pattern="strips smuggled entry_kind" \
  tools/learning-loop-mastra/core/meta-state.test.js
# Expected: FAIL — smuggled entry_kind flips identity to "rule"
```

### Step 1.3: GREEN implementation — Fix A + Fix B (one edit session)

Apply Fix A (`buildPatchSchemaFor` omits — see Architecture) + Fix B (one-line `delete cleanPatch.entry_kind` in `updateEntry`) + the `IMMUTABLE_PATCH_FIELDS` jsdoc update (lines 280-289: state that `entry_kind` is enforced off the patch path by the omit, `status` likewise on rule/loop-design, and Fix B strips `entry_kind` at the core layer). Do NOT add `entry_kind`/`status` to the `IMMUTABLE_PATCH_FIELDS` set yet — that's Phase 2 (the set must stay open so the Step 1.6 batch repair can set `entry_kind`).

### Step 1.4: Run GREEN tests → expect pass

```bash
pnpm exec node --test --test-timeout=30000 \
  tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js \
  tools/learning-loop-mastra/core/meta-state.test.js
# Expected: all 5 new tests pass
```

### Step 1.5: File change-log #1 — the code fix (AFTER the edit lands, operator-confirmed ordering)

One change-log covers Fix A + Fix B together (one logical change — same file, same finding, same edit session). Filed AFTER Step 1.3/1.4 confirm the edit landed and tests pass, so the change-log never claims a change that didn't happen (eliminates the audit/reality divergence window red-team Security #4 raised).

```js
meta_state_log_change({
  change_dimension: "mechanical",
  change_target: "tools/learning-loop-mastra/core/meta-state.js",
  change_diff: {
    added: [],
    removed: [],
    changed: [
      "buildPatchSchemaFor: .omit({entry_kind:true}) on finding+change-log branches, .omit({entry_kind:true, status:true}) on rule+loop-design branches, before .partial().strict() (lines 329-340) — entry_kind is identity, status is lifecycle identity; both set by dedicated tools, never patchable",
      "updateEntry: delete cleanPatch.entry_kind before Object.assign (line 642-648) — defense-in-depth identity invariant"
    ]
  },
  reason: "Close the entry_kind + status injection class (finding meta-260712T0053Z): the patch union schema's .default() on entry_kind and status literals injected identity/lifecycle on empty/non-kind-specific patches; Object.assign wrote it. Omit entry_kind+status from the patch projection so the schema can no longer inject. Red-team (Security) proved status .default('active') on rule/loop-design is the same class — silently re-activates deactivated rules/shipped designs. Strip entry_kind in updateEntry as defense-in-depth (the finding's own recommended fix).",
  applies_to: { tools: ["meta_state_patch", "meta_state_promote_rule", "meta_state_dispatch_finding", "meta_state_re_verify", "meta_state_resolve", "meta_state_supersede"], schemas: ["metaStateFindingEntrySchema", "metaStateChangeEntrySchema", "metaStateRuleEntrySchema", "metaStateLoopDesignSchema"] },
  evidence_code_ref: "tools/learning-loop-mastra/core/meta-state.js:329"
})
```

### Step 1.6: Confirm corrupted state + run the repair batch (the data fix)

```js
// 1. Confirm both entries are currently stored as entry_kind:"finding" (the corruption).
meta_state_list({
  id: ["loop-design-assertinvariant-core-logic-invariant-wrapper",
       "loop-design-migration-markers-on-change-log"], compact: false
})
// Expected: both entry_kind:"finding", version:1. Skip any id already at "loop-design".

// 2. Run the repair batch (include only ids still corrupted; idempotent).
meta_state_batch({
  operations: [
    { op: "update", id: "loop-design-assertinvariant-core-logic-invariant-wrapper", entry_kind: "loop-design" },
    { op: "update", id: "loop-design-migration-markers-on-change-log", entry_kind: "loop-design" }
  ]
  // (omit any id already at "loop-design" per the confirm step — avoids a needless version bump, red-team Failure #9)
})
// Expected: { applied: 2, failed_at: null } (or fewer if any id was already correct)
```

> **Why `update` not `write`:** `write` would append a duplicate id; `update` mutates in place and bumps `version` (the repair's audit trail).
> **Deployment risk (red-team Failure #5):** a concurrent session running pre-fix code can re-corrupt these entries via an empty-patch injection. Mitigation: pull the fix to all concurrent sessions before repairing, or repair last. Note in the commit message.

### Step 1.7: Verify the repair (read-back)

```js
meta_state_list({
  id: ["loop-design-assertinvariant-core-logic-invariant-wrapper",
       "loop-design-migration-markers-on-change-log"], compact: false
})
// Expected: both entry_kind:"loop-design", version:2 (one repair bump on the corruption's version:1)

meta_state_list({ entry_kind: "loop-design", compact: true })
// Expected: both repaired ids visible alongside loop-design-operation-envelope-on-change-log
//   and loop-design-assertinvariant-universal-scope (previously invisible — stored as "finding")
```

### Step 1.8: File change-log #2 — the data repair (AFTER the repair lands, operator-confirmed ordering)

Filed AFTER Step 1.6/1.7 confirm the repair landed, so the change-log records what actually happened (edit-first, change-log-after — eliminates the audit/reality divergence window).

```js
meta_state_log_change({
  change_dimension: "mechanical",
  change_target: "meta-state.jsonl",
  change_diff: {
    added: [],
    removed: [],
    changed: [
      "loop-design-assertinvariant-core-logic-invariant-wrapper: entry_kind finding→loop-design (repair)",
      "loop-design-migration-markers-on-change-log: entry_kind finding→loop-design (repair)"
    ]
  },
  reason: "Repair the two loop-design entries corrupted by the patch-tool entry_kind injection (finding meta-260712T0053Z): both had stored entry_kind flipped to 'finding' by an empty/non-kind-specific patch. Patch tool cannot repair (branch-mismatch guard); direct file edit write-gated. meta_state_batch update re-asserted entry_kind:'loop-design' (the batch hole was the repair mechanism; stopgap-closed in Phase 2, fully closed by the universal wrapper in Implementation 3).",
  applies_to: { tools: ["meta_state_batch"] },
  evidence_code_ref: "tools/learning-loop-mastra/core/meta-state.js:754"
})
```

### Step 1.9: Run existing patch-tool + derived-schema suites (regression)

```bash
pnpm exec node --test --test-timeout=30000 \
  tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-tool.test.js \
  tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-derived-schema.test.js \
  tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-immutable-fields.test.js \
  tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-script-caller-passthrough.test.js
# Expected: all pass (Fix A breaks zero existing tests — R1 + grep-verified across 25 files;
#   .omit preserves stripEnvelope preprocess on proposed_design_for/addresses — red-team Failure #6)
```

## Success Criteria

- [x] RED tests (a), (a-status), (d) fail BEFORE the fix (corruption reproduces; status re-activation reproduces)
- [x] Test (b) `assert.rejects` + registry-state assertion is robust to the `callTool` SyntaxError (red-team Failure #1)
- [x] Test (d) reads `join(tempRoot, ".claude", "coordination", "gate-log.jsonl")` (red-team Failure #2)
- [x] After Fix A + B: (a) empty `{}` preserves `entry_kind`; (a-status) empty `{}` preserves `status:"inactive"`; (b) `entry_kind` in patch rejected + registry unchanged; (d) `fields_patched:[]`; Fix B test strips smuggled `entry_kind`
- [x] `buildPatchSchemaFor` omits `entry_kind` on all 4 branches + `status` on rule + loop-design
- [x] `updateEntry` has the one-line `delete cleanPatch.entry_kind`
- [x] Two corrupted entries read back as `entry_kind:"loop-design"`, `version:2`, visible to `entry_kind:"loop-design"` filter
- [x] Each repaired entry's non-identity fields (title, description, proposed_design_for, addresses, created_at, created_by) unchanged
- [x] Existing patch-tool/derived-schema/script-caller-passthrough suites pass
- [x] 2 `meta_state_log_change` entries filed AFTER each logical change's edit lands (code fix at Step 1.5, data repair at Step 1.8) — edit-first, change-log-after (operator-confirmed ordering; no audit/reality divergence)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Test (b) `callTool` SyntaxError on MCP validation rejection | High | `assert.rejects` + registry-state assertion (verified `with-mcp-server.js:90-101`; red-team Failure #1) |
| Test (d) gate-log path | High | `join(tempRoot, ".claude", "coordination", "gate-log.jsonl")` (verified `gate-logging.test.js:79`; red-team Failure #2) |
| `.omit` breaks `stripEnvelope` preprocess on wrapped inputs | Low | Red-team Failure #6 empirically verified safe — `.omit` preserves `z.preprocess`. Existing derived-schema tests cover it (Step 1.9). |
| Concurrent pre-fix session re-corrupts repaired entries | Medium | Deployment note (Step 1.6); pull fix to all sessions before repair |
| Batch repair overwrites a non-identity field | Low | Batch `update` sets only `entry_kind`; `Object.assign` at `:775` is additive; Step 1.7 read-back confirms other fields intact |
| `IMMUTABLE_PATCH_FIELDS` set touched in Phase 1 (would block repair) | High | Phase 1 edits ONLY the jsdoc (lines 280-289); the set itself (290-300) is Phase 2. Step 1.3 explicit. |
