---
phase: 5
title: "Phase 4 Closeout"
status: pending
priority: P3
effort: "0.25h"
dependencies: [4]
---

# Phase 5: Phase 4 Closeout

## Overview

Mark the 2 active 2026-06-01 findings resolved and add 1 `meta_state_log_change` entry with `consolidates: <2 ids>` so the audit trail is clean. This is the housekeeping that closes the discoverability loop.

## Requirements
- **Functional:**
  - The 2 active 2026-06-01 findings are marked `status: "resolved"` with a `resolution` field citing this plan.
  - 1 new `change-log` entry is added with `consolidates: <comma-separated 2 ids>` and `reason` describing the resolution.
  - The change-log's `change_target` points to the canonical design (`plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md`).
  - The change-log's `applies_to.tools` lists the 5 tools affected by this plan: `meta_state_report`, `loop_describe`, `meta_state_derive_status`, `meta_state_refresh_fingerprint`, `source_ref_validator` (the last is a function, not a tool, but `applies_to.tools` is the closest field).
- **Non-functional:**
  - All meta-state mutations go through the loop's own machinery. If MCP tools are available (`mcp__learning_loop_mcp__meta_state_resolve` + `mcp__learning_loop_mcp__meta_state_log_change`), use them. If not, fall back to direct file I/O via a Node script that imports `core/meta-state.js` (the documented fallback per `meta-260606T0443Z-...` finding).
  - Mutations are atomic: the resolve calls + the log_change call happen in one transaction (either all succeed or all roll back). If using direct file I/O, write to a temp file first, then rename atomically.
  - The meta-state.jsonl registry is append-only for new entries; the 2 existing finding entries are MUTATED in place (status change + resolution field) but their position in the file is preserved (no delete-and-reappend).

## Architecture
- **Resolve mechanism:** the existing `meta_state_resolve` MCP tool (or the `resolveEntry` function in `core/meta-state.js` for direct I/O) takes `{ id, resolution }` and mutates the entry in place. The `status` field changes from `"active"` to `"resolved"`; the `resolved_at` and `resolved_by` fields are set. **CRITICAL: `resolved_by` is constrained to `z.enum(["operator", "auto-resolve"])` per `meta-state-resolve-tool.js:17`. Use `"operator"` (not `"plan:260606-..."`).** (Per Red Team Review Finding 3.)
- **Log change mechanism:** the existing `meta_state_log_change` MCP tool (or the `writeEntry` function in `core/meta-state.js` for direct I/O) appends a new entry with `entry_kind: "change-log"`. **CRITICAL: the MCP tool's zod schema at `meta-state-log-change-tool.js:11-32` does NOT include a `consolidates` parameter; it is silently dropped.** Two paths: (a) amend the tool's schema to accept `consolidates` (requires a new test + an `evidence_journal` workaround for the journal field), OR (b) use direct file I/O via `writeEntry` from `core/meta-state.js` to write the change-log entry directly. **Path (b) is recommended** (it preserves the canonical pattern + avoids coupling this plan to an MCP tool schema change). (Per Red Team Review Finding 2.)
- **`change_target` is a code point, NOT a markdown file:** the change-log entry's `change_target` field points at the code (e.g., `tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints`) and the design citation goes in `evidence.journal` (e.g., `plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md`). This honors the plan's own internalization rule. (Per Red Team Review Finding 13.)

## Related Code Files
- Mutate: `meta-state.jsonl` (2 in-place mutations + 1 append)
- Create: `tools/learning-loop-mcp/scripts/closeout-meta-evidence-migration.cjs` (new helper script for the direct-I/O path; idempotent and re-runnable)

## Implementation Steps

1. **Verify all 4 prior phases are green.** Run the full test suite: `cd tools/learning-loop-mcp && node --test lib/ __tests__/ 2>&1 | tail -n 5` AND `cd .factory/hooks && node --test __tests__/ 2>&1 | tail -n 5`. Both must report all green. If any test fails, do NOT proceed to closeout — the finding resolution is conditional on the fix being live.
2. **Check MCP tool availability.** Run `which droid` and check whether the current session has `mcp__learning_loop_mcp__*` tools loaded (per `meta-260606T0443Z-...`, the latter may fail in this session). If MCP tools are loaded, use them. If not, fall back to direct file I/O via the helper script.
3. **Resolve finding #1.** Call `meta_state_resolve({ id: "meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz", resolution: "Closed by plan 260606 Phase 2+3: discoverability_hints + cold-session test. Internalization rule surfaces in loop_describe warm tier. See plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md", resolved_by: "operator" })`. Verify the entry's status is now `"resolved"` and `resolved_by` is `"operator"` (per the schema enum constraint; the `"plan:..."` form is rejected by `meta-state-resolve-tool.js:17`).
4. **Resolve finding #2.** Call `meta_state_resolve({ id: "meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th", resolution: "Closed by plan 260606 Phase 2: loop_describe warm tier surfaces meta_state_report, meta_state_derive_status, meta_state_refresh_fingerprint, meta_state_log_change in discoverability_hints. See plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md", resolved_by: "operator" })`.
5. **Add the change-log entry via DIRECT FILE I/O** (NOT via the MCP tool — the tool's zod schema drops the `consolidates` field per `meta-state-log-change-tool.js:11-32`):
   - Use the `writeEntry` function from `core/meta-state.js` directly (import via Node script: `tools/learning-loop-mcp/scripts/closeout-meta-evidence-migration.cjs`).
   - The script imports `writeEntry`, `resolveEntry` (or `updateEntry` for resolve), and writes:
     - 2 in-place mutations (resolve the 2 findings) — `resolveEntry(root, id, patch)` is the documented core API.
     - 1 append (the change-log entry) — `writeEntry(root, entry)` with `entry_kind: "change-log"`.
   - The change-log entry shape:
     - `id`: `generateId(slugify(change_target))` from `core/meta-state.js`.
     - `entry_kind: "change-log"`.
     - `change_dimension: "surface"` (the existing valid enum: `["semantic", "mechanical", "surface"]`).
     - `change_target: "tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints"` (code point, NOT a markdown file).
     - `change_diff: { added: [...], removed: [...], changed: [...] }` per the prior draft.
     - `reason: "Closes 2 active 2026-06-01 findings..."` (same as prior draft).
     - `applies_to: { tools: ["meta_state_report", "loop_describe", "meta_state_derive_status", "meta_state_refresh_fingerprint"] }`.
     - `consolidates: "meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz,meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th"` (comma-separated string per plan 260605's locked decision).
     - `evidence: { code_ref: "tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints", journal: "plans/reports/brainstorm-260606-discoverability-and-meta-evidence-migration.md" }` (the markdown is in `evidence.journal`, NOT in `change_target`).
     - `status: "active"` (default for change-log).
     - `version: 0`.
6. **Verify the audit trail.** Run a final meta-state scan:
   - `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz` → `status: "resolved"`, `resolved_by: "operator"`, `resolution: <the long string>`.
   - `meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th` → same.
   - New change-log entry exists with `consolidates: "<2 ids>"` and `change_target: "tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints"` and `change_dimension: "surface"`.
   - The 2 archived observations (`obs-mpef2h6z-...`, `obs-mpfnglt7-...`) are unchanged.
   - The 4 vnstock observations are unchanged.
7. **Mark plan as completed.** Run: `cd /home/datguy/codingProjects/learning-loop-template/260606-discoverability-and-meta-evidence-migration && ck plan check 5` (marks Phase 5 as completed; the prior phases should already be marked). Then mark the plan as a whole: amend `plan.md` frontmatter `status: pending` → `status: completed`.

## Success Criteria

- [ ] All 4 prior phases' test suites are green
- [ ] 2 active 2026-06-01 findings are `status: "resolved"` with `resolved_by: "operator"` and `resolution` fields populated
- [ ] 1 new `change-log` entry exists with `consolidates: <2 ids>` + `change_target: tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints` (code point, NOT markdown) + `change_dimension: "surface"` + `reason` describing the resolution
- [ ] meta-state.jsonl scan confirms: 2 mutations + 1 append, all other entries unchanged
- [ ] Plan marked as completed in frontmatter + `ck plan check 5`
- [ ] No new entry_kind, no new schema field (the closeout reuses existing `meta_state_resolve` + direct `writeEntry` from `core/meta-state.js`)

## Risk Assessment

- **Risk 1:** The `meta_state_resolve` tool may not be loaded in the current session (per `meta-260606T0443Z-...`). Mitigation: the helper script in `tools/learning-loop-mcp/scripts/closeout-meta-evidence-migration.cjs` handles the direct-I/O path. The script is idempotent: if run twice, the second run is a no-op (the resolve call is a no-op if already resolved; the log_change call appends a second entry with `consolidates: <2 ids>` which is acceptable as audit trail but flagged in the script's output).
- **Risk 2:** The 2 in-place mutations to `meta-state.jsonl` could race with a concurrent writer (e.g., a hook firing during the closeout). Mitigation: complete this phase atomically; no other meta-state writers should be running. The script uses a file lock (advisory lock via `flock` or equivalent) to serialize.
- **Risk 3:** The `consolidates` field is documented as a comma-separated string per plan 260605. Some entries may already use the new array form (if a future plan extends the schema). Mitigation: read the schema description at closeout time and adjust the format if needed. Default to the locked string form.
- **Risk 4:** The change-log's `change_target` is now a code point (per Red Team Review Finding 13) — not a markdown file. The design citation goes in `evidence.journal`. This honors the plan's own internalization rule. The `change-log` entry_kind's `change_target` field is the canonical location for CODE pointers; markdown is the escape hatch, confined to `evidence.journal` for design reference. Document this distinction in the new AGENTS.md "Internalization Rule" section.
