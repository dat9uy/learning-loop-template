---
phase: 7
title: "rule entry + AGENTS.md amendment + loop_describe discoverability hint"
status: completed
priority: P2
effort: "1h"
dependencies:
  - "phase-06-check-runtime-agnostic-mcp-tool"
---

# Phase 7: rule entry + AGENTS.md amendment + loop_describe discoverability hint

## Overview

Close the runtime-agnostic rule by adding the 3 final artifacts: the meta-state rule entry (`rule-runtime-agnostic-features`), the AGENTS.md amendment (a new §2 subsection "Runtime-Agnostic Pattern"), and the `loop_describe` discoverability hint. After this phase, the rule is discoverable (loop_describe), auditable (Phase 6's MCP tool), testable (Phase 4's regression test), evolvable (meta_state_patch), and documented (AGENTS.md).

This is the last phase. It closes the planning-order sequence (Steps 1-4) and locks the runtime-agnostic pattern as a load-bearing invariant.

## Requirements

Functional:
- New meta-state rule entry in `meta-state.jsonl`:
  - `id: "rule-runtime-agnostic-features"`
  - `entry_kind: "rule"`
  - `enforcement: "agent"` (consult, not gate)
  - `pattern_type: "consult-checklist"`
  - `pattern`: the JSON-serialized 6-item checklist (from Phase 6)
  - `description`: human-readable summary
  - `status: "active"`
  - `promoted_at`, `promoted_by: "operator"`
  - `affected_system: "meta"`
  - `origin`: the change-log entry id (filed in this phase)
- AGENTS.md §2 amendment: new subsection "Runtime-Agnostic Pattern" with the design principle, the 6-item checklist summary, and pointers to the rule + tool.
- `loop_describe` discoverability hint: new entry in `DISCOVERABILITY_HINTS` array in `core/loop-introspect.js`.
- New change-log entry in `meta-state.jsonl` recording the ship.

Non-functional:
- The rule entry is `enforcement: "agent"` (not `gate`). It does not block commands.
- The rule's `pattern` field is a JSON-serialized string (the checklist). The shape matches the `consult-checklist` pattern type from Phase 5.
- The AGENTS.md amendment is in §2 (the Hook Matrix) and follows the existing subsection style (3-5 sentences, design principle, citation to the rule entry).
- The `loop_describe` hint is one line; it points to the tool name and the rule id.
- The test count remains 982/983 (1 skipped); the change is meta + prose, not code.

## Architecture

### Meta-state rule entry

```json
{
  "id": "rule-runtime-agnostic-features",
  "entry_kind": "rule",
  "enforcement": "agent",
  "pattern_type": "consult-checklist",
  "pattern": "{\"version\":1,\"items\":[{\"id\":\"core-in-universal-location\",...},{\"id\":\"shims-in-sync\",...},{\"id\":\"protocol-adapter-i/o\",...},{\"id\":\"manifest-registered\",...},{\"id\":\"cross-surface-iteration\",...},{\"id\":\"parameterized-for-new-surfaces\",...}]}",
  "description": "Consult-gate rule: every feature must be runtime-agnostic. Codifies the shim-not-fork + cross-surface-iteration pattern. Use check_runtime_agnostic MCP tool to audit a feature; new runtimes add themselves to SURFACES in core/surfaces.js.",
  "status": "active",
  "promoted_at": "<captured by meta_state_promote_rule at the moment of promotion — millisecond precision, not a placeholder>",
  "promoted_by": "operator",
  "affected_system": "meta",
  "origin": "<id of the change-log entry filed in this same phase, captured BEFORE the rule promotion>"
}
```

The entry is appended to `meta-state.jsonl` (the canonical registry) by the `meta_state_promote_rule` MCP tool, which captures the wall-clock `promoted_at` timestamp and validates the entry against the zod schema (now extended to include `consult-checklist` per Phase 5). The `pattern` field is the same 6-item checklist used by `check_runtime_agnostic` (Phase 6), so the tool and the rule share a single source of truth.

### Change-log entry

```json
{
  "id": "meta-260615T2200Z-runtime-agnostic-features-rule-ships",
  "entry_kind": "change-log",
  "change_dimension": "semantic",
  "change_target": "tools/learning-loop-mcp/agent-manifest.json + AGENTS.md + meta-state.jsonl + core/loop-introspect.js",
  "change_diff": {
    "added": [
      "tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js",
      "tools/learning-loop-mcp/__tests__/check-runtime-agnostic-tool.test.js",
      "tools/learning-loop-mcp/__tests__/runtime-agnostic.test.js",
      "tools/learning-loop-mcp/__tests__/gate-logic-consult-checklist.test.js",
      "tools/learning-loop-mcp/__tests__/surfaces-append.test.js",
      "tools/learning-loop-mcp/__tests__/surfaces-read-jsonl.test.js",
      "tools/learning-loop-mcp/__tests__/surfaces-rmw.test.js",
      "tools/learning-loop-mcp/core/runtime-agnostic-checklist.js"
    ],
    "changed": [
      "core/surfaces.js (3 new helpers: appendToAllSurfaces, readJsonlFromAllSurfaces, readModifyWriteOnAllSurfaces)",
      "core/gate-decision-log.js (refactored to use appendToAllSurfaces + readJsonlFromAllSurfaces)",
      "core/gate-override.js (refactored to use readModifyWriteOnAllSurfaces for write + readFromAllSurfaces for read)",
      "core/gate-logic.js (new consult-checklist pattern type branch)",
      "core/meta-state.js#metaStateRuleEntrySchema (extended zod enum to include consult-checklist)",
      "agent-manifest.json (new runtime_agnostic group)",
      "tools/manifest.json (check_runtime_agnostic registered)",
      "AGENTS.md (new §2 subsection 'Runtime-Agnostic Pattern')",
      "core/loop-introspect.js (new DISCOVERABILITY_HINTS entry)"
    ]
  },
  "reason": "Closes Step 4 of the planning-order sequence. The runtime-agnostic pattern is now codified as a meta-state rule (discoverable + auditable + testable + evolvable), with a 6-item checklist enforced by the check_runtime_agnostic MCP tool and the runtime-agnostic regression test. Completes the Simplification Cascade thesis: 5+ hand-rolled cross-surface patterns collapse to 1 helper API.",
  "applies_to": {
    "tools": ["check_runtime_agnostic"],
    "rules": ["rule-runtime-agnostic-features"],
    "statuses": ["active"]
  },
  "affected_system": "meta"
}
```

### AGENTS.md amendment

Add to `AGENTS.md` after the existing §2 Hook Matrix subsection:

```markdown
### Runtime-Agnostic Pattern (rule-runtime-agnostic-features)

Every feature must work identically on Claude Code and Droid CLI (and future runtimes). The shim-not-fork pattern is the canonical way to achieve this:

- **Core logic** lives in `tools/learning-loop-mcp/{core,hooks,tools}/` (not under `.claude/` or `.factory/`).
- **Surface shims** (`.claude/coordination/hooks/*.cjs` and `.factory/coordination/hooks/*.cjs`) are ~20-line `execFileSync` wrappers; the universal hook does the real work.
- **Hook I/O** goes through `tools/learning-loop-mcp/hooks/lib/protocol-adapter.js` (parseInput, formatOutput, normalizeToolName).
- **MCP tools** are registered in `tools/learning-loop-mcp/agent-manifest.json`.
- **Cross-surface iteration** uses the `core/surfaces.js` helper (SURFACES, getAllCoordinationPaths, writeToAllSurfaces, readFromAllSurfaces, appendToAllSurfaces, readJsonlFromAllSurfaces, readModifyWriteOnAllSurfaces). Do not hard-code `.claude/` or `.factory/` paths.
- **New runtimes** append to `SURFACES` in `core/surfaces.js` (1 line, no other code changes).

The rule is codified as `rule-runtime-agnostic-features` in `meta-state.jsonl` (machine-readable form). Audit a feature with the `check_runtime_agnostic` MCP tool. The pattern is regression-tested by `__tests__/runtime-agnostic.test.js`.
```

The subsection is placed in §2 (Hook Matrix) per Report 2's design. It is 8-10 lines, matching the existing subsection density.

### `loop_describe` discoverability hint

Add to `DISCOVERABILITY_HINTS` in `core/loop-introspect.js` (after the existing hints):

```js
"Phase 4 (2026-06-15): Every feature must be runtime-agnostic (shim-not-fork + cross-surface-iteration). Codified as rule-runtime-agnostic-features. Audit a new feature with check_runtime_agnostic MCP tool before shipping. The 6-item checklist is regression-tested by __tests__/runtime-agnostic.test.js.",
```

The hint is one sentence; it points to the tool name (the agent can `loop_get_instruction` for the full text) and the regression test (the agent can read it for the 6 items).

## Related Code Files

- Modify: `meta-state.jsonl` — append the rule entry + change-log entry. (2 new lines.)
- Modify: `AGENTS.md` — add the new §2 subsection.
- Modify: `tools/learning-loop-mcp/core/loop-introspect.js` — add 1 new hint.
- No code test changes. (The rule is data; AGENTS.md is prose; the hint is a string.)

## Implementation Steps

1. **Read `meta-state.jsonl` end-to-end** to confirm the existing entry format. Use the existing rule entry (`rule-no-new-artifact-types` or `rule-project-skill-boundary`) as the template.
2. **Append the rule entry to `meta-state.jsonl` via `meta_state_promote_rule` (MCP tool, REQUIRED).** Direct file write is **not** the recommended path — the MCP tool validates the zod schema, captures the actual `promoted_at` timestamp (millisecond precision), records `promoted_by: "operator"` with a real audit trail, and emits the matching change-log. This is the pattern used by all 5 existing rules in the registry (verified at `meta-state.jsonl:16-19, 129`). To promote the rule, the operator runs:
   ```sh
   # in OPERATOR_MODE=1 session
   meta_state_promote_rule \
     --id meta-<find-id-if-promoted-from-finding> \
     --rule_id rule-runtime-agnostic-features \
     --enforcement agent \
     --pattern_type consult-checklist \
     --pattern '<JSON-serialized 6-item checklist>' \
     --description '...'
   ```
   If for some reason the MCP server cannot be started, the direct file write is a documented fallback (operator must set `promoted_at` to the real wall-clock timestamp, not a round number, and run `meta_state_patch` afterward to backfill attribution).
3. **Append the change-log entry** to `meta-state.jsonl` via `meta_state_log_change` (MCP tool). Direct write is acceptable for change-logs (the tool is the normal path; the entry is data, not a promoted rule).
4. **Add the new subsection to `AGENTS.md` §2.** Place after the existing Hook Matrix subsection. Match the existing subsection style (header level, citation pattern).
5. **Add the new hint to `DISCOVERABILITY_HINTS`** in `core/loop-introspect.js`. Append after the existing 5 hints.
6. **Verify `loop_describe`** returns the new hint. Run the MCP tool (or read the warm tier from the test fixture): `loop_describe({tier: "warm"})` should include the new hint in `discoverability_hints`.
7. **Run the full test suite.** `pnpm test` — expect 982/983 (1 skipped). No regressions.
8. **Whole-plan consistency check.** `grep -n "rule-runtime-agnostic-features" meta-state.jsonl` — expect 1 match (the rule entry). `grep -n "check_runtime_agnostic" AGENTS.md` — expect 1+ matches (the new subsection). `grep -n "check_runtime_agnostic" core/loop-introspect.js` — expect 1 match (the new hint).

## Success Criteria

- [x] `meta-state.jsonl` has the `rule-runtime-agnostic-features` rule entry, written via `meta_state_promote_rule` (MCP tool).
- [x] `meta-state.jsonl` has the change-log entry recording the ship.
- [x] `AGENTS.md` §2 has the new "Runtime-Agnostic Pattern" subsection.
- [x] `core/loop-introspect.js#DISCOVERABILITY_HINTS` includes the new hint.
- [x] `loop_describe({tier: "warm"})` returns the new hint in `discoverability_hints`.
- [x] `pnpm test` shows 982/983 (1 skipped). No regressions.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| The rule entry's `pattern` field is malformed JSON (the operator's editor mangles the serialized checklist) | Write the entry programmatically (via a Node script) or use the MCP tool. The MCP tool validates the entry shape. |
| The AGENTS.md amendment breaks the existing §2 layout | Match the existing subsection style: 1-line header, 6-8 lines of content, citation to the rule entry. The existing subsections (`Hook Matrix`, `Cross-Surface State`) are the template. |
| The `loop_describe` hint is too long and blows the warm tier's size budget (~25KB) | The hint is one sentence (~250 chars). The existing hints are similar length. The warm tier budget accommodates 5+ hints. |
| The rule entry's `origin` field references a change-log that doesn't exist (the change-log is being created in this phase) | Order of writes: change-log first, then rule entry. The change-log id is captured before the rule entry is written. |
| The 6-item checklist in the rule entry's `pattern` field drifts from the tool's checklist (Phase 6's source of truth) | The rule entry's `pattern` is copied verbatim from Phase 6's `CHECKLIST` constant. A future change to the checklist requires updating both the tool and the rule entry. Documented in the rule's `description`. |

## Security Considerations

- The rule entry is data; no attack surface change.
- The AGENTS.md amendment is prose; no attack surface change.
- The `loop_describe` hint is a string; no attack surface change.
- The MCP-mediated change-log write (if used) requires `OPERATOR_MODE=1` env var. The direct file write (alternative) is acceptable for this phase because the entry is being authored (not promoted from a finding).

## Next Steps

After Phase 7 ships:
- The rule is discoverable, codified, and documented. All 4 steps in the planning-order sequence are functionally complete.
- Phase 8 (post-ship tracking step): annotate `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` — mark Step 4 `✅ shipped`, flip the report's frontmatter `status: in-progress → complete`, annotate Q3 as RESOLVED, and mark the 3 Step 2 cleanup items (2.1, 2.2, 2.4) as `→ RESOLVED by Step 4 Phases 1-3`.
- After Phase 8 ships: the CLEANUP batch plan (`260615-CLEANUP-batch-cleanup-after-planning-order`) ships the 7 remaining cosmetic items.
- A follow-up brainstorm (post-4-step) considers MCP-mediation for `recurrence-tracker.js#checkAndEmit` (Q2 follow-up).
- The `simplification-cascade-complete` change-log entry marks the planning-order sequence as closed.
