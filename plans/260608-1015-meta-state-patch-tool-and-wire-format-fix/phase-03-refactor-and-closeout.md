---
phase: 3
title: "Refactor and closeout"
status: completed
priority: P2
effort: "0.5h"
dependencies: [2]
---

# Phase 3: Refactor and closeout

## Overview

Exercise the new tool in production-like operations: update `loop-design-cross-reference-fields` via the new patch tool (the recursive proof), file the change-log entry preserving the lineage, resolve the CRUD finding (with the resolve narrative — F12 fix, "Resolved:" not "Superseded by:"), and update AGENTS.md to discourage the escape-hatch pattern. Final pass: `pnpm check` to validate everything.

## Requirements

### Functional
- `loop-design-cross-reference-fields` updated with `proposed_design_for: ["meta_state_patch"]` via `meta_state_patch` (the recursive proof that the tool works)
- Change-log entry filed via `meta_state_log_change` documenting the ship + 2102Z lineage
- `meta-260608T0848Z-crud-coverage-gap-...` resolved via `meta_state_resolve` after `ack → check_grounding → refresh_fingerprint` sequence (F11)
- AGENTS.md amended with 1-sentence rule: "use `meta_state_patch` for registry updates; do not use `node -e` escape hatch"
- *Cold-session test is a smoke check, not a gate* (see Step 3.5)
- No `node -e` escape-hatch usage in any step (F3 fix); all calls go through canonical tools via the named closeout script

### Non-functional
- All 499+ tests still pass
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

### Step 3.1: Update `loop-design-cross-reference-fields` via the new tool (10m)

> **Red-team F3 fix:** the original draft used two `node -e "import('./tools/learning-loop-mcp/core/meta-state.js')"` invocations — the very escape-hatch pattern this plan retires. Restructured to use a single, named, reviewable script in `tools/scripts/closeout-260608-1015-patch-loop-design.mjs`. The script imports the patch tool's handler and calls it directly (which exercises the handler logic, the audit log, and the per-root write queue) but does NOT touch `core/meta-state.js` directly. Version capture and patch happen in the SAME process, eliminating the two-script race (F3 second-order concern).

Create `tools/scripts/closeout-260608-1015-patch-loop-design.mjs`:

```js
// Single-process closeout script. Exercises meta_state_patch end-to-end
// without using the `node -e "import('./core/...')"` escape hatch.
// The script is committed and reviewable; the escape hatch is not.

import { readRegistry } from "#mcp/core/meta-state.js";
import { metaStatePatchTool } from "#mcp/tools/meta-state-patch-tool.js";

const root = process.cwd();
const id = "loop-design-cross-reference-fields";

const entries = readRegistry(root);
const entry = entries.find((e) => e.id === id);
if (!entry) {
  console.error(`FATAL: entry ${id} not found`);
  process.exit(1);
}

console.log("pre-patch:", {
  version: entry.version,
  proposed_design_for: entry.proposed_design_for,
});

const result = await metaStatePatchTool.handler({
  id,
  entry_kind: "loop-design",
  patch: { proposed_design_for: ["meta_state_patch"] },
  // _expected_version omitted — F10 fix auto-captures from pre-read
});

const parsed = JSON.parse(result.content[0].text);
console.log("patch result:", parsed);

if (!parsed.patched) {
  console.error("FATAL: patch failed:", parsed);
  process.exit(2);
}

// Re-read for verification
const updated = readRegistry(root).find((e) => e.id === id);
console.log("post-patch:", {
  version: updated.version,
  proposed_design_for: updated.proposed_design_for,
});
```

Run via:
```bash
node tools/scripts/closeout-260608-1015-patch-loop-design.mjs
```

**Verify the update:**
- `proposed_design_for` is now `["meta_state_patch"]`
- `version` incremented by 1
- The `version` field is the new expected_version for any subsequent patches

**Note:** This is the FIRST real use of `meta_state_patch`. If this step fails, Phase 2's tests didn't catch a real-world issue. Diagnose and fix before proceeding.

### Step 3.2: File the change-log entry (5m)

> **Red-team F3 fix:** the original draft used `node -e "import('./...meta-state-log-change-tool.js')"` — same escape-hatch pattern. The change-log call is now part of the same single closeout script (`tools/scripts/closeout-260608-1015-patch-loop-design.mjs` extended from Step 3.1), so the script imports `metaStateLogChangeTool` and calls its handler directly.

Append to `tools/scripts/closeout-260608-1015-patch-loop-design.mjs`:

```js
import { metaStateLogChangeTool } from "#mcp/tools/meta-state-log-change-tool.js";

const changeLogResult = await metaStateLogChangeTool.handler({
  change_dimension: "surface",
  change_target: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js",
  change_diff: {
    added: [
      "meta_state_patch tool (MCP wrapper over updateEntry with CAS + deny-list)",
      "coerceParamsToSchema helper in tool-registry.js (generic wire-format fix, identity-preserving)",
    ],
    removed: [
      "direct-I/O escape hatch for meta-state CRUD (use meta_state_patch instead)",
    ],
    changed: [],
  },
  reason: "Ships meta_state_patch (CRUD coverage) + coerceParamsToSchema (wire-format fix). Closes meta-260608T0848Z-crud-coverage-gap. The wire-format coercion root cause meta-260606T2202Z is fixed transitively by tool-registry.js#coerceParamsToSchema (recursive walk into nested passthrough + ZodDefault unwrap).",
  applies_to: {
    tools: ["meta_state_patch", "meta_state_propose_design", "meta_state_report", "registerTool"],
    rules: [],
    statuses: ["active", "resolved", "expired", "superseded"],
    schemas: ["core/meta-state.js"],
  },
  evidence_code_ref: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js",
});

const changeLogParsed = JSON.parse(changeLogResult.content[0].text);
console.log("change-log result:", changeLogParsed);
```

**Verify:** the change-log entry is appended; `meta_state_list({ entry_kind: "change-log" })` includes it. **Note:** this change-log entry is **permanent** — change-logs are handler-level immutable (Phase 2.4 enforces this). If a typo is found post-commit, file a new change-log with `supersedes: <this_id>`.

### Step 3.3: Resolve the CRUD finding (ack → check grounding → refresh if stale → resolve) (15m)

> **Red-team F11 fix:** the original draft called `meta_state_resolve` directly, which will be blocked by the consult-gate `rule-no-orphaned-evidence` because (a) the CRUD finding has `mechanism_check: true` with a stored `code_fingerprint`, and (b) it is in `reported` status, not `active`. The correct sequence is: **ack** (reported → active) → **check grounding** (is the fingerprint stale?) → **refresh fingerprint** (if stale) → **resolve**.
>
> **Red-team F12 (Medium) fix:** changed "Superseded by" → "Resolved:" in the narrative because `meta_state_resolve` sets `status: "resolved"`, not `"superseded"`. The `superseded` status is set by change-log consolidation, not by resolve. Future readers grepping for `status: "superseded"` will miss the finding if we use the wrong verb.

> **Red-team F12 (factual lineage):** the related findings 2102Z, 2202Z, 2106Z are already `expired`/`auto-resolved` per `meta-state.jsonl:49,50,53` (auto-resolved at 2026-06-08T01:11:42.524Z, 9 hours before this plan was created). This plan addresses the **structural** gap, not the findings themselves. The resolve narrative below reflects this.

Append to `tools/scripts/closeout-260608-1015-patch-loop-design.mjs`:

```js
import { metaStateAckTool } from "#mcp/tools/meta-state-ack-tool.js";
import { metaStateCheckGroundingTool } from "#mcp/tools/meta-state-check-grounding-tool.js";
import { metaStateRefreshFingerprintTool } from "#mcp/tools/meta-state-refresh-fingerprint-tool.js";
import { metaStateResolveTool } from "#mcp/tools/meta-state-resolve-tool.js";

const crudId = "meta-260608T0848Z-crud-coverage-gap-the-mcp-meta-state-tool-surface-covers-cre";

// (a) Ack: reported → active. Required before resolve; not optional.
const ackResult = await metaStateAckTool.handler({ id: crudId, reason: "operator-acked for resolution" });
console.log("ack:", JSON.parse(ackResult.content[0].text));

// (b) Check grounding: detect stale fingerprint.
const groundingResult = await metaStateCheckGroundingTool.handler({ id: crudId });
const grounding = JSON.parse(groundingResult.content[0].text);
console.log("grounding:", grounding);

if (grounding.status === "drifted" || grounding.drift_kind === "hash_mismatch") {
  // (c) Refresh the fingerprint for tools/learning-loop-mcp/core/meta-state.js#updateEntry
  //     (the file the finding's mechanism_check targets)
  const refreshResult = await metaStateRefreshFingerprintTool.handler({ id: crudId });
  console.log("refresh:", JSON.parse(refreshResult.content[0].text));
}

// (d) Resolve with the corrected narrative. Note: "Resolved:" not "Superseded by:".
const resolveResult = await metaStateResolveTool.handler({
  id: crudId,
  resolution: "Resolved: meta_state_patch tool ships (plan 260608-1015), closing the CRUD coverage gap. The patch tool unifies the 4 documented escape-hatch use cases (update finding, update loop-design, backfill fingerprint, refresh evidence_code_ref). Wire-format coercion root cause addressed transitively by tool-registry.js#coerceParamsToSchema. The related findings 2102Z, 2202Z, 2106Z were already auto-resolved at 2026-06-08T01:11:42.524Z; this resolution closes the structural gap that those findings documented, not the findings themselves. See change-log for full lineage.",
  resolved_by: "operator",
});

const resolveParsed = JSON.parse(resolveResult.content[0].text);
console.log("resolve:", resolveParsed);

if (!resolveParsed.resolved) {
  console.error("FATAL: resolve failed:", resolveParsed);
  process.exit(3);
}
```

**Verify:** the finding's status is now `"resolved"`; `meta_state_list({ entry_kind: "finding", status: "active" })` no longer includes it.

### Step 3.4: Update AGENTS.md (5m)

Add 1 sentence in the appropriate section. The most natural location is "MCP-First Record Access" section, after the CRUD tools list:

> "**Use `meta_state_patch` for any field-level update to an existing meta-state entry. Do not use `node -e` scripts importing `core/meta-state.js` directly — this is the escape-hatch abuse closed in plan 260608-1015.**"

Reference the plan dir for historical context: `260608-1015-meta-state-patch-tool-and-wire-format-fix/`.

### Step 3.5: Cold-session smoke check (5m, advisory only)

**This step is a smoke check, not a precondition.** The cold-session test (`cold-session-discoverability.test.cjs`) gates the *resolution* of `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list`, a different bug class (agent tool list loading). The wire-format fix is server-side and has its own 5 unit tests in Phase 1 (including the real-schema regression per F7).

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
- `pnpm test` (all 499+ tests; 487 existing + 12 new)

Expected: all pass. The cold-session test (Step 3.5) is run separately and is not a blocker for `pnpm check`. Expected total: 499+ tests (487 existing + 12 new).

### Step 3.7: Final smoke test — verify the recursive proof end-to-end (5m)

To prove the gap is fully closed, run a 3-call sequence:

1. Call `meta_state_list({ entry_kind: "loop-design" })` — confirm `loop-design-cross-reference-fields.proposed_design_for = ["meta_state_patch"]`
2. Call `meta_state_list({ status: "active" })` — confirm the CRUD finding is no longer in the active set
3. Call `meta_state_list({ entry_kind: "change-log" })` — confirm the new change-log entry is present

All 3 calls use the canonical MCP tools, no direct I/O. The recursion is broken.

## Success Criteria

- [ ] `loop-design-cross-reference-fields.proposed_design_for` = `["meta_state_patch"]`
- [ ] Change-log entry filed with `change_target: "tools/learning-loop-mcp/tools/meta-state-patch-tool.js"`
- [ ] `meta-260608T0848Z-crud-coverage-gap-...` status = `"resolved"` (after explicit ack → check-grounding → refresh-fingerprint → resolve sequence)
- [ ] AGENTS.md updated with the canonical-rule sentence
- [ ] No `node -e "import('./...')"` escape-hatch usage in any step (F3 fix verified)
- [ ] *(Advisory)* Cold-session smoke check — if it fails, file a separate `mcp-client-loading` finding; do not block this plan
- [ ] `pnpm check` passes (all 499+ tests + validation)
- [ ] The 3-call smoke test in Step 3.7 confirms the recursive proof

## Risk Assessment

### Risk: The first real-world use of `meta_state_patch` may surface a bug the tests didn't catch

**Mitigation:** Step 3.1 is a deliberate "use the new tool to update real data" exercise. If it fails, that's a real bug. The test suite covers the contract, but a real-world use is the final proof. Diagnose, fix, and re-run.

### Risk: `meta_state_resolve` will be blocked by `rule-no-orphaned-evidence` AND `reported` status

The CRUD finding has `mechanism_check: true` with a stored `code_fingerprint` (`meta-state.jsonl:67`) and is in `reported` status, not `active`. The consult-gate `rule-no-orphaned-evidence` blocks resolve when (a) status is not `active` (must be acked first) OR (b) fingerprint is stale.

**F11 mitigation:** Step 3.3 now sequences the full `ack → check_grounding → refresh_fingerprint → resolve` chain. The `meta_state_ack` call promotes the finding to `active`; `meta_state_check_grounding` detects staleness; `meta_state_refresh_fingerprint` updates the SHA-256 if needed; `meta_state_resolve` is then unblocked. The `checkResolutionEvidence` function in `core/gate-logic.js:678-715` requires fingerprint match against the live file content; the refresh step ensures the stored fingerprint matches.

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
