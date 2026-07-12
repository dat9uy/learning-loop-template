---
phase: 2
title: "Phase 2: wire 3 surviving seed call-sites + golden regression"
status: pending
effort: ""
---

# Phase 2: wire surviving seed call-sites with the universal wrapper + golden regression

## Overview

Wire the universal `assertinvariant` wrapper (Phase 1) at the **3 surviving seed call-sites** (after Red Team findings 7-8 dropped the 2 phantom paths: `hooks/universal/pre-commit` and `tools/gates/tools-rm-consult-gate.js`). Closes the 3 active findings the wrapper can close (`meta-260630T2110Z`, finding #3 / `meta-260619T2237Z`, `meta-260712T0053Z` class on the batch path). Each surviving call-site gets its own RED→GREEN regression fixture per Q2's golden-test decision.

## What got dropped and why

| Step | Original plan | Status after red-team |
|------|---------------|----------------------|
| Phase 2 step 3 | Wrap `hooks/universal/pre-commit` consistency check stderr | **DROPPED** (Red Team Finding 7: file does not exist at cited path; finding `meta-260629T2300Z` describes `.git/hooks/pre-commit` (git's standard location) — out of scope for this plan; finding stays open) |
| Phase 2 step 5 | Wrap `tools-rm-consult-gate.js` for finding `meta-260613T1615Z` import-chain | **DROPPED** (Red Team Finding 8: `tools/gates/` directory does not exist; existing rule `rule-import-chain-analysis-after-tool-deletion` already covers finding 1 with `enforcement:"agent"`; the wrapper adds no enforcement surface over the rule) |
| Phase 2 step 4 | Verify `metaStateBatch` envelope integration | **MERGED INTO PHASE 1** (the wrapper at metaStateBatch is wired in Phase 1 step 7; no separate Phase 2 verification needed) |

## Implementation Steps

1. **Wrap `core/file-readers.js#L47-48` lookup** — replaces `if (!constraints) continue;` (silent) with `assertinvariant(lookup, {accept: {context: () => entry, check: ({status, affected_system}) => status !== "active" || AFFECTED_SYSTEM_TO_CONSTRAINTS[affected_system] !== undefined}, returnOnFail: {constraint_type: "unmapped-active-entry", affected_system: entry.affected_system, entry_id: entry.id}, root})`. **Closes finding `meta-260630T2110Z`** (the runtime-state schema-vs-implementation mismatch that the inbound-gate escalation path will now route to the same surface as the existing constraint types). RED test: write an active `runtime-state.jsonl` entry with `affected_system:"runtime-state"` and assert the gate escalates with `constraint_type:"unmapped-active-entry"`. GREEN: wire the wrapper, observe the escalation.
2. **Wrap `meta-state-report-tool.js#L28` id honoring** — replaces silent auto-slugification with `assertinvariant` that asserts `result.id === generated_id` after writeEntry. **Closes finding #3 (`meta-260619T2237Z`)**. RED test: assert the wrapper rejects any patch that would change the auto-generated id. GREEN: wire the assertion. Note: line 28 (`const id = generateId(slugify(description));`) is the actual surface; lines 89-98 are `writeEntry + appendGateLog` and were a mis-citation (Red Team Finding 9).

## Architecture

Each wrap follows the same shape:

```js
import { assertinvariant } from "../../core/operation-invariant.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();
const result = await assertinvariant(
  () => /* the operation that owns the invariant */,
  {
    accept: {
      context: () => /* pre-state snapshot INSIDE any surrounding lock */,
      check: (pre) => /* pre-condition predicate */,
    },
    returnOnFail: { /* structured failure shape */ },
    root,
    logTo: "gate-log", // or "stderr" for pre-commit hooks (none in this phase)
  }
);
```

The wrapper returns either `{ok: true, ...result}` or `{ok: false, reason, ...returnOnFail}`. Callers map the failure shape to the wire shape appropriate for their surface (gate-log entry, MCP result, stderr line).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/file-readers.js#L47-48` (the silent `continue` — NOT line 10 which is the constants map; Red Team Finding 9 line-cite correction)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js#L28` (the auto-generated id — NOT lines 89-98 which are writeEntry + appendGateLog; Red Team Finding 9 line-cite correction)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/file-readers-unmapped-active-entry.test.js`
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-report-id-honoring.test.js`

## Findings affected by the drops

| Finding | Status after Phase 2 |
|---------|---------------------|
| `meta-260630T2110Z` (file-readers L47-48 lookup) | Closed in Phase 2 step 1 |
| Finding #3 / `meta-260619T2237Z` (report-tool id) | Closed in Phase 2 step 2 |
| Finding #5 / `meta-260629T2300Z` (pre-commit auto-edit) | **NOT closed by this plan** — phantom path dropped; finding stays open, but addressed by existing rule `rule-tool-integration-same-commit-dep` indirectly (rule PR-body-registry-deltas already tracks pre-commit changes) |
| Finding 1 / `meta-260613T1615Z` (import-chain) | **NOT closed by this plan** — covered by existing rule `rule-import-chain-analysis-after-tool-deletion` (`enforcement:"agent"`); no new wrapper needed |
| `meta-260712T0053Z` (patch-tool entry_kind corruption class) | Closed in Phase 1 (the wrapper at `writeEntry` + the kept `delete cleanPatch.entry_kind` defense close the class) |

## Success Criteria

- [ ] RED tests written first for the 2 surviving seed call-sites (2 test files)
- [ ] Both RED tests GREEN after wiring
- [ ] `core/file-readers.js#L47-48` silent `continue` replaced with `assertinvariant` wrap
- [ ] `meta-state-report-tool.js#L28` id auto-generation explicitly asserted
- [ ] Golden regression fixture test passes (per Q2 decision, Rec 10 template)
- [ ] `pnpm test` passes with no regressions across all 9 namespaces
- [ ] `gate:self-verify` passes

## Risk Assessment

- **Risk:** Wrapping `core/file-readers.js#L47-48` changes the inbound gate's escalation surface; pre-existing tests may rely on the silent-`continue` semantics. **Mitigation:** golden regression test captures pre-existing behavior (vnstock active entries still escalate correctly); the new escalation only fires for `affected_system` values NOT in the `AFFECTED_SYSTEM_TO_CONSTRAINTS` map. The wrapper's `accept` predicate is a strict superset.
- **Risk:** Dropping the pre-commit wrap leaves finding #5 (`meta-260629T2300Z`) open. **Mitigation:** the finding's primary impact (auto-edit with no stderr summary) is captured in `meta-state.jsonl:188` and is tracked by existing `rule-tool-integration-same-commit-dep` for any future pre-commit changes; the loop will re-flag if the surface regresses.
- **Risk:** Dropping the tools-rm wrap leaves finding 1 (`meta-260613T1615Z`) without a new enforcement layer. **Mitigation:** the existing `rule-import-chain-analysis-after-tool-deletion` rule with `enforcement:"agent"` covers the same surface; per Red Team Finding 8, adding a parallel gate-side consult would be duplicate enforcement.