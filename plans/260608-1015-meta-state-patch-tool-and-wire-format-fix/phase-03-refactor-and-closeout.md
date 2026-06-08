---
phase: 3
title: "Refactor and closeout"
status: pending
priority: P2
effort: "0.5h"
dependencies: [2]
---

# Phase 3: Refactor and closeout

## Overview

Exercise the new tool in production-like operations: update `loop-design-cross-reference-fields` via the new patch tool (the recursive proof), file the change-log entry preserving the 2102Z lineage, resolve the CRUD finding with the supersede narrative, and update AGENTS.md to discourage the escape-hatch pattern. Final pass: `pnpm check` to validate everything.

## Requirements

### Functional
- `loop-design-cross-reference-fields` updated with `proposed_design_for: ["meta_state_patch"]` via `meta_state_patch` (the recursive proof that the tool works)
- Change-log entry filed via `meta_state_log_change` documenting the ship + 2102Z lineage
- `meta-260608T0848Z-crud-coverage-gap-...` resolved via `meta_state_resolve` with supersede narrative pointing at 2102Z
- AGENTS.md amended with 1-sentence rule: "use `meta_state_patch` for registry updates; do not use `node -e` escape hatch"
- *Cold-session test is a smoke check, not a gate* (see Step 3.5)

### Non-functional
- All 850+ tests still pass
- `pnpm check` passes (validate records + extract index + tests)
- `meta_state_resolve` call goes through the canonical tool, not direct I/O
- `meta_state_log_change` call goes through the canonical tool, not direct I/O
- No regressions in any existing tool's behavior

## Architecture

Phase 3 is the "use the tool to close the loop" phase. The recursive structure:
- The CRUD finding was filed via the escape hatch (it had to be, because the patch tool didn't exist)
- Now the patch tool exists, and we use it to:
  - Update the loop-design (proving the tool works)
  - (Indirectly, by using the change-log + resolve) close the CRUD finding

This phase is intentionally short. The complexity is in the implementation (Phase 2); Phase 3 is validation and audit trail.

```
Phase 3 deliverables:
├── meta-state.jsonl (3 entries)
│   ├── 1 line: meta_state_patch tool shipped (change-log)
│   ├── 1 line: loop-design-cross-reference-fields updated (via patch tool)
│   └── 1 status flip: meta-260608T0848Z-crud-coverage-gap-... → resolved
├── AGENTS.md (1 sentence added)
└── pnpm check (full validation)
```

## Related Code Files

- **Create:** None
- **Modify:**
  - `AGENTS.md` (1 sentence in the "MCP-First Record Access" or similar section)
  - `meta-state.jsonl` (3 entries via MCP tools)
- **Delete:** None

## Implementation Steps

### Step 3.1: Update `loop-design-cross-reference-fields` via the new tool (5m)

Use the canonical MCP path. The recursive proof:

```bash
# First, capture the current version
node -e "
import('./tools/learning-loop-mcp/core/meta-state.js').then(({readRegistry, resolveRoot}) => {
  const root = process.cwd();
  const entries = readRegistry(root);
  const ld = entries.find(e => e.id === 'loop-design-cross-reference-fields');
  console.log('current version:', ld.version);
  console.log('current proposed_design_for:', JSON.stringify(ld.proposed_design_for));
});
"
```

Then call the new tool (or use a small script that goes through the MCP server). Since we're in a session, prefer using the tool's handler directly:

```bash
# Use the tool via direct invocation (since we can't easily spawn an MCP server in this session)
node -e "
import('./tools/learning-loop-mcp/tools/meta-state-patch-tool.js').then(async ({metaStatePatchTool}) => {
  const result = await metaStatePatchTool.handler({
    id: 'loop-design-cross-reference-fields',
    entry_kind: 'loop-design',
    patch: { proposed_design_for: ['meta_state_patch'] },
    _expected_version: <captured_version>,
  });
  console.log(JSON.parse(result.content[0].text));
});
"
```

**Verify the update:**
- `proposed_design_for` is now `["meta_state_patch"]`
- `version` incremented by 1
- The `version` field is the new expected_version for any subsequent patches

**Note:** This is the FIRST real use of `meta_state_patch`. If this step fails, Phase 2's tests didn't catch a real-world issue. Diagnose and fix before proceeding.

### Step 3.2: File the change-log entry (5m)

```bash
node -e "
import('./tools/learning-loop-mcp/tools/meta-state-log-change-tool.js').then(async ({metaStateLogChangeTool}) => {
  const result = await metaStateLogChangeTool.handler({
    change_dimension: 'surface',
    change_target: 'tools/learning-loop-mcp/tools/meta-state-patch-tool.js',
    change_diff: {
      added: [
        'meta_state_patch tool (MCP wrapper over updateEntry with CAS)',
        'coerceParamsToSchema helper in tool-registry.js (generic wire-format fix)',
      ],
      removed: [
        'direct-I/O escape hatch for meta-state CRUD (use meta_state_patch instead)',
      ],
      changed: [],
    },
    reason: 'Ships meta_state_patch (CRUD coverage) + coerceParamsToSchema (wire-format fix). Closes meta-260608T0848Z-crud-coverage-gap. Parent escape-hatch abuse meta-260606T2102Z structurally closed (the tool that replaces the escape hatch is now the canonical path). Wire-format coercion root cause meta-260606T2202Z fixed transitively.',
    applies_to: {
      tools: ['meta_state_patch', 'meta_state_propose_design', 'meta_state_report', 'registerTool'],
      rules: [],
      statuses: ['active', 'resolved', 'expired', 'superseded'],
      schemas: ['core/meta-state.js'],
    },
    evidence_code_ref: 'tools/learning-loop-mcp/tools/meta-state-patch-tool.js',
  });
  console.log(JSON.parse(result.content[0].text));
});
"
```

**Verify:** the change-log entry is appended; `meta_state_list({ entry_kind: "change-log" })` includes it.

### Step 3.3: Resolve the CRUD finding with supersede narrative (5m)

```bash
node -e "
import('./tools/learning-loop-mcp/tools/meta-state-resolve-tool.js').then(async ({metaStateResolveTool}) => {
  const result = await metaStateResolveTool.handler({
    id: 'meta-260608T0848Z-crud-coverage-gap-the-mcp-meta-state-tool-surface-covers-cre',
    resolution: 'Superseded by meta_state_patch tool ship. The parent escape-hatch abuse meta-260606T2102Z is structurally closed: the tool that replaces the escape hatch is now the canonical path. Wire-format coercion root cause meta-260606T2202Z fixed transitively by tool-registry.js#coerceParamsToSchema. See change-log <id> for full lineage.',
    resolved_by: 'operator',
  });
  console.log(JSON.parse(result.content[0].text));
});
"
```

**Verify:** the finding's status is now `"resolved"`; `meta_state_list({ entry_kind: "finding", status: "active" })` no longer includes it.

### Step 3.4: Update AGENTS.md (5m)

Add 1 sentence in the appropriate section. The most natural location is "MCP-First Record Access" section, after the CRUD tools list:

> "**Use `meta_state_patch` for any field-level update to an existing meta-state entry. Do not use `node -e` scripts importing `core/meta-state.js` directly — this is the escape-hatch abuse closed in plan 260608-1015.**"

Reference the plan dir for historical context: `260608-1015-meta-state-patch-tool-and-wire-format-fix/`.

### Step 3.5: Cold-session smoke check (5m, advisory only)

**This step is a smoke check, not a precondition.** The cold-session test (`cold-session-discoverability.test.cjs`) gates the *resolution* of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list`, a different bug class (agent tool list loading). The wire-format fix is server-side and has its own 4 unit tests in Phase 1.

Run as a sanity check:

```bash
node tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs
```

Expected outcome: passes (we're adding a tool to the manifest, not changing the connection layer). If it fails, **it is not a blocker for this plan** — file a separate finding under `mcp-client-loading` and continue. Likely failure modes (none block this plan):
- droid CLI changed its `--list-tools` output format (precedent: `meta-260606T1805Z-factory-mcp-json-tools-learning-loop-mcp-tests-cold-session`)
- The test's hardcoded tool count needs updating
- A connection-layer regression unrelated to this plan

### Step 3.6: Run `pnpm check` (5m)

```bash
pnpm check
```

This runs:
- `pnpm generate:capabilities --dry-run`
- `pnpm validate:records`
- `pnpm validate:plan-loop`
- `pnpm test` (all 850+ tests)

Expected: all pass. The cold-session test (Step 3.5) is run separately and is not a blocker for `pnpm check`.

### Step 3.7: Final smoke test — verify the recursive proof end-to-end (5m)

To prove the gap is fully closed, run a 3-call sequence:

1. Call `meta_state_list({ entry_kind: "loop-design" })` — confirm `loop-design-cross-reference-fields.proposed_design_for = ["meta_state_patch"]`
2. Call `meta_state_list({ status: "active" })` — confirm the CRUD finding is no longer in the active set
3. Call `meta_state_list({ entry_kind: "change-log" })` — confirm the new change-log entry is present

All 3 calls use the canonical MCP tools, no direct I/O. The recursion is broken.

## Success Criteria

- [ ] `loop-design-cross-reference-fields.proposed_design_for` = `["meta_state_patch"]`
- [ ] Change-log entry filed with `change_target: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js"`
- [ ] `meta-260608T0848Z-crud-coverage-gap-...` status = `"resolved"`
- [ ] AGENTS.md updated with the canonical-rule sentence
- [ ] *(Advisory)* Cold-session smoke check — if it fails, file a separate `mcp-client-loading` finding; do not block this plan
- [ ] `pnpm check` passes (all 850+ tests + validation)
- [ ] The 3-call smoke test in Step 3.7 confirms the recursive proof

## Risk Assessment

### Risk: The first real-world use of `meta_state_patch` may surface a bug the tests didn't catch

**Mitigation:** Step 3.1 is a deliberate "use the new tool to update real data" exercise. If it fails, that's a real bug. The test suite covers the contract, but a real-world use is the final proof. Diagnose, fix, and re-run.

### Risk: `meta_state_resolve` may be blocked by a `resolution-evidence-required` rule

The consult-gate `rule-no-orphaned-evidence` applies to findings with `mechanism_check: true` and a stale `code_fingerprint`. The CRUD finding has `mechanism_check: true` (per the meta-state.jsonl entry). If the `code_fingerprint` is stale (the file was refactored since the fingerprint was stored), `meta_state_resolve` will be blocked with `reason: "resolution_evidence_required"`.

**Mitigation:** the CRUD finding's `evidence_code_ref` is `tools/learning-loop-mcp/core/meta-state.js#updateEntry`. This file was last modified 2026-06-07 (per the meta-state.jsonl timeline). If the fingerprint is stale, run `meta_state_refresh_fingerprint` first, then resolve.

**Alternative mitigation:** the resolution narrative itself can be the evidence ("the tool that this finding describes now exists and works; see change-log <id>"). The consult-gate may accept this.

### Risk: The cold-session test may fail for reasons unrelated to this plan

The cold-session test (Step 3.5) is a smoke check, not a gate. If it fails, **it does not block this plan** — file a separate `mcp-client-loading` finding. The most likely failure modes are connection-layer or droid-CLI-output-format issues that predate or postdate this plan independently.

## Rollback Plan

If Phase 3 cannot complete within the ~0.5h estimate, the rollback is:
1. Revert the AGENTS.md change (1 sentence removal)
2. Leave the change-log entry as-is (it's accurate; just doesn't have the resolution)
3. Revert the loop-design update (or leave it — it's a design improvement, not a regression)
4. Do NOT revert the CRUD finding's resolution if Step 3.3 succeeded (the resolution is correct)

The patch tool itself (Phase 2) is the substantive change. Phase 3 is audit trail. A partial Phase 3 is better than a full rollback.

## Journal Entry

After Phase 3 completes, write a `/ck:journal` entry documenting:
- The recursive gap that was closed (CRUD finding filed via the escape hatch it described)
- The wire-format coercion fix that benefits 3 tools
- The loop-design update that proves the new tool works
- The 3-finding lineage (CRUD → 2102Z → 2202Z) that was preserved via the change-log

Reference the plan dir for context.
