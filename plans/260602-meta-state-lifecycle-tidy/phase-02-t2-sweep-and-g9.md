---
phase: 2
title: "T2 — meta_state_sweep tool + G9 fix + expire 4 stale 260529 entries"
status: pending
priority: P2
effort: "2h"
dependencies: [phase-01-t1-fix-g8]
---

# Phase T2: meta_state_sweep Tool + G9 Fix + Expire 4 Stale Entries

## Overview

Three coordinated changes: ship a new `meta_state_sweep` MCP tool (operator-only, dry-run by default, CAS-safe); use it on first run to expire the 4 stale 260529 entries; fix the G9 status-filter leak in `listAntiPatterns` so the warm tier's `anti_patterns` field honors terminal status. Sister helper `listActiveFindings` (line 110) already filters correctly; this restores parity.

## Requirements

- Functional:
  - New `meta_state_sweep` MCP tool, registered in `tools/manifest.json`.
  - `meta_state_sweep({apply: false})` returns proposed transitions without mutating the registry.
  - `meta_state_sweep({apply: true})` runs the transitions through `updateEntry` with the CAS `version` field.
  - Operator role check via `OPERATOR_MODE=1` env var (same placeholder as `meta_state_promote_rule`).
  - Fix `listAntiPatterns` in `core/loop-introspect.js:125` to filter terminal status.
  - First sweep run expires the 4 stale 260529 entries.
- Non-functional:
  - Sweep tool description explains operator-only role, dry-run default, CAS safety.
  - Sweep tool logs to the gate log via `appendGateLog`.
  - G9 fix preserves the existing return shape and contract.

## Architecture

### `meta_state_sweep` tool

```js
// tools/learning-loop-mcp/tools/meta-state-sweep-tool.js (new)

import { z } from "zod";
import { readRegistry, checkAutoResolve, checkExpiry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);

export const metaStateSweepTool = {
  name: "meta_state_sweep",
  description: "Walk the meta-state registry and propose (or apply) lifecycle transitions: expiry for reported entries past expires_at, auto-resolve for entries whose watched file was modified after creation. Dry-run by default. Operator-only (env: OPERATOR_MODE=1). CAS-safe via the version field. Use to keep the registry honest without manual per-entry work.",
  schema: {
    apply: z.boolean().optional().default(false).describe("If true, commit the transitions. Default false (dry-run)."),
  },
  handler: async ({ apply }) => {
    if (apply && process.env.OPERATOR_MODE !== "1" && process.env.OPERATOR_MODE !== "true") {
      return { content: [{ type: "text", text: JSON.stringify({ swept: false, reason: "operator_role_required" }) }] };
    }
    const root = resolveRoot();
    const entries = readRegistry(root);
    const transitions = [];
    for (const entry of entries) {
      if (TERMINAL_STATUSES.has(entry.status)) continue; // already terminal
      const auto = checkAutoResolve(entry, root);
      const exp = checkExpiry(entry);
      const newStatus = auto || exp;
      if (newStatus && newStatus !== entry.status) {
        transitions.push({ id: entry.id, from: entry.status, to: newStatus, expected_version: entry.version });
      }
    }
    if (apply) {
      const results = [];
      for (const t of transitions) {
        const r = await updateEntry(root, t.id, {
          status: t.to,
          resolved_at: new Date().toISOString(),
          resolved_by: "auto-resolve",
          _expected_version: t.expected_version,
        });
        if (r === "version_mismatch") {
          results.push({ id: t.id, applied: false, reason: "version_mismatch" });
        } else if (r === true) {
          results.push({ id: t.id, applied: true, to: t.to });
        }
      }
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_sweep", applied: results.length, results });
      return { content: [{ type: "text", text: JSON.stringify({ swept: true, results }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ swept: false, dry_run: true, transitions }) }] };
  },
};
```

### G9 fix in `listAntiPatterns`

```js
// core/loop-introspect.js:125 — change
export function listAntiPatterns(root, { categories } = {}) {
  const entries = readRegistry(root);
  const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);
  let findings = entries.filter(
    (e) => e.category === "loop-anti-pattern" && !TERMINAL_STATUSES.has(e.status)
  );
  if (categories && categories.length > 0) {
    findings = findings.filter((e) => categories.includes(e.category));
  }
  return findings;
}
```

(Or import `TERMINAL_STATUSES` from `core/meta-state.js` if exported; otherwise inline the set — match the pattern in `meta-state-list-tool.js:12`.)

### First sweep run

After T2 ships, an operator (or this session, post-T1) runs:

```bash
# In MCP client:
meta_state_sweep({apply: true})
# Returns: { swept: true, results: [
#   { id: "meta-260529T1509Z-...", applied: true, to: "expired" },
#   ...
# ] }
```

## Related Code Files

- Create: `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json`
  - Add `{ "file": "./tools/meta-state-sweep-tool.js", "export": "metaStateSweepTool" }`
- Modify: `tools/learning-loop-mcp/core/loop-introspect.js`
  - Line 125: add status filter
- Create: `tools/learning-loop-mcp/__tests__/meta-state-sweep.test.js`
- Modify: `tools/learning-loop-mcp/__tests__/loop-introscribe.test.js` (or similar)
  - Add 3 G9 tests in the existing `loop-describe.test.js` or a new file
- Read for context: `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (existing sweep-like behavior)

## Implementation Steps

### Sweep tool (TDD)

1. Add 8 tests in `meta-state-sweep.test.js`:
   - Entry past `expires_at` returns transition `{to: "expired"}`
   - Entry with `auto_resolve` set and file mtime > created_at returns transition `{to: "auto-resolved"}`
   - Entry with stale `auto_resolve` (file mtime < created_at) returns no transition
   - CAS mismatch returns `{applied: false, reason: "version_mismatch"}`
   - Empty registry returns `[]`
   - Mixed status filter: terminal entries skipped
   - Dry-run default: `apply: false` returns transitions without mutating
   - Operator role check: `apply: true` without `OPERATOR_MODE=1` returns `{swept: false, reason: "operator_role_required"}`
2. Implement the tool.
3. Register in `manifest.json`.
4. Verify dry-run → apply sequence.

### G9 fix (TDD)

5. Add 3 tests in a new section of `loop-describe.test.js`:
   - `listAntiPatterns` excludes `status: "resolved"`
   - `listAntiPatterns` excludes `status: "expired"`
   - `listAntiPatterns` excludes `status: "auto-resolved"`
6. Apply the one-line change to `listAntiPatterns`.
7. Verify the warm tier's `anti_patterns` length drops from 12 to 8 after the 4 entries are expired (run sweep first, then call `loop_describe({tier:"warm"})`).

### First sweep run

8. Call `meta_state_sweep({apply: true})` (operator role assumed).
9. Verify `meta-state.jsonl` has 4 entries with `status: "expired"`.
10. Verify `loop_describe({tier:"warm"}).anti_patterns.length === 8`.

## Success Criteria

- [ ] 11 new tests pass (8 sweep + 3 G9)
- [ ] `meta_state_sweep` tool registered in `manifest.json`
- [ ] First sweep run expires exactly the 4 stale 260529 entries (idempotent on re-run)
- [ ] `loop_describe({tier:"warm"}).anti_patterns.length === 8` after the sweep
- [ ] All 412 existing tests still pass (407 + 5 from T1)
- [ ] `pnpm test` passes 423/423

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Sweep races with concurrent `meta_state_report` or `meta_state_resolve` calls | Low | Both flows go through `enqueue` per-root in `core/meta-state.js`; sweep uses the same `updateEntry` path |
| CAS mismatch from concurrent operator action | Medium | Sweep reports `{applied: false, reason: "version_mismatch"}`; operator can re-run |
| G9 fix changes `loop_describe` warm tier count mid-session for users who cached the previous shape | Low | Tier is meant to evolve; document the count change in the success metrics and journal |
| `TERMINAL_STATUSES` set duplicated across files | Low | Inline the set to match the pattern in `meta-state-list-tool.js:12`; do not refactor the existing duplication in this plan |
