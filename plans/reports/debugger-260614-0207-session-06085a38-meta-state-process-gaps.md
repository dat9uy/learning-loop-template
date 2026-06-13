# Session 06085a38 Meta-State Cleanup — Process-Gap Analysis

## Executive Summary

- **Issue:** In session `06085a38-9531-41f8-8d42-6a957d42722d` the assistant mishandled a meta-state cleanup request: it failed to find entries by `session_id` through the MCP surface, then archived and resolved an active gate-enforced rule without reviewing its purpose, and finally recovered the rule by editing `meta-state.jsonl` directly.
- **Impact:** The rule `rule-cold-session-test-must-pass-before-resolution` was temporarily lost as a guardrail and the audit/gate surface was bypassed. The registry entry has been cleaned and is now consistent.
- **Root cause:** (1) The assistant filtered `meta_state_list({ compact: true })` client-side by `session_id`, but compact output strips `session_id`; it never used the built-in `session_id` filter or read the tool schema. (2) It treated archive as generic cleanup and did not inspect the rule's `pattern_type`/`applies_to_resolution` before resolving/archiving it. (3) When `meta_state_patch` rejected the recovery attempt, it edited the JSONL directly instead of escalating the missing unarchive path.
- **Status:** Rule restored to `active` with updated pattern `mcp-protocol-e2e-test`. P0 cleanup and entry-kind guards completed; P1 discoverability and bulk-archive guard completed. P2 items remain open.
- **Fix:** P0/P1 actions completed as documented below.

## Timeline

All times UTC from the session transcript at `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/06085a38-9531-41f8-8d42-6a957d42722d.jsonl`.

- `18:52:57` — User asks to "resolve/archive all the `session_id = test-cold-session-mcp-client-loading` in meta-state" (transcript line 314).
- `18:53:02` — Assistant calls `meta_state_list({ compact: true })` and filters the parsed entries by `e.session_id`, getting 0 matches (line 317).
- `18:53:07` — Assistant calls `meta_state_list({ include_archived: true, compact: true })` and again filters by `session_id`, getting 0 matches (line 320).
- `18:53:10` — Assistant falls back to `grep ... tools/learning-loop-mcp/core/meta-state.jsonl`, the wrong path; the real registry is `meta-state.jsonl` in the project root. It concludes no entries exist (lines 323–329).
- `18:53:52` — User points out `meta-260614T0048Z-mcp-client-loading-missing` exists (line 337).
- `18:53:57` — Assistant calls `meta_state_list({ include_archived: true, compact: true })` and filters by `id.includes('mcp-client-loading')`, finding 9 entries (line 342).
- `18:54:03` — Assistant resolves and archives the one still-`reported` finding via MCP (`meta_state_resolve` + `meta_state_archive`) (line 346).
- `18:54:14` — Assistant runs `grep "test-cold-session-mcp-client-loading" meta-state.jsonl` (correct path this time) and finds 19 entries (line 374).
- `18:55:04` — Assistant lists the 13 non-archived entries with that session_id, including the active rule (line 384).
- `18:55:22` — Assistant resolves the rule as "purpose fulfilled" and archives all 13 entries, including the rule, via MCP (line 391).
- `18:57:12` — User asks: "Why you archive `rule-cold-session-test-must-pass-before-resolution`? this still very important" (line 438).
- `18:57:18` — Assistant reads the rule via direct `grep` and realizes the mistake (line 447).
- `18:57:33` — First `meta_state_patch` attempt fails schema validation because it passed flat rule fields instead of wrapping them in `patch` (line 451).
- `18:57:38` — Assistant reads the `meta_state_patch` inputSchema (line 455).
- `18:57:50` — Second `meta_state_patch` attempt fails because `resolution` and `_expected_version` are in the rule-patch shape and are immutable fields (line 461).
- `18:58:03` — Assistant runs a Python script that reads `meta-state.jsonl`, sets `status: active`, updates `pattern`/`description`, removes `archived_*` fields, and writes the file back directly (line 465).
- `18:58:35` — Assistant logs a change-log entry via `meta_state_log_change` documenting the manual restore (line 473).

## Technical Analysis

### Finding 1: `session_id` lookup bypassed the MCP tool contract

The assistant tried to find entries by reading `meta_state_list` and then filtering the returned objects by `.session_id`. However, `compact: true` deliberately strips `session_id` from the response:

```
compact keys: id, entry_kind, status, created_at, severity, affected_system,
              category, subtype, resolved_by, resolved_at, version, evidence_code_ref
session_id present? false
```

Verified live at `tools/learning-loop-mcp/tools/meta-state-list-tool.js:73` and `meta-state-list-tool.js:192`. The tool itself exposes a first-class `session_id` filter at `meta-state-list-tool.js:62`:

```js
session_id: z.string().optional().describe("Filter by session_id ...")
```

Calling `meta_state_list({ session_id: 'test-cold-session-mcp-client-loading', include_archived: true })` returns all 19 entries directly. The assistant never used it.

**Secondary failure:** the first direct `grep` used path `tools/learning-loop-mcp/core/meta-state.jsonl`, which does not exist; the registry is at project-root `meta-state.jsonl`. That wrong-path grep reinforced the false "no entries" conclusion.

### Finding 2: Rule was resolved and archived without semantic review

The assistant's batch archive list included `rule-cold-session-test-must-pass-before-resolution`. The rule entry (current `meta-state.jsonl:19`) is:

- `entry_kind: "rule"`
- `pattern_type: "resolution-evidence-required"`
- `applies_to_resolution: "meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list"`
- `enforcement: "gate"`

It is a guardrail that gates resolution of the "MCP tools not loaded" finding. The assistant resolved it with the narrative "Rule purpose fulfilled" and archived it, treating it like a stale finding. Only after the user challenged it did the assistant read the rule and recognize the error.

### Finding 3: Recovery bypassed the MCP surface with a direct JSONL edit

`meta_state_patch` rejects `resolution` and `_expected_version` for rule entries because those fields are immutable (`tools/learning-loop-mcp/tools/meta-state-patch-tool.js:6-23`). The assistant interpreted that as "the patch tool won't let me set `status: active` on an archived rule" and edited `meta-state.jsonl` directly with a Python script.

There is currently no MCP tool to unarchive an entry or transition out of `archived`. The direct edit did the minimum needed restore, but it:

- bypassed the gate/audit surface,
- did not bump `version` through `updateEntry`'s CAS path (it incremented manually),
- left `resolved_at` and `resolution` on the now-`active` rule.

### Finding 4: Residual registry inconsistency

`meta-state.jsonl:19` now shows:

```json
{
  "id": "rule-cold-session-test-must-pass-before-resolution",
  "status": "active",
  "resolved_at": "2026-06-13T18:55:23.081Z",
  "resolution": "Updated: pattern now references mcp-protocol-e2e.test.cjs ...",
  ...
}
```

A rule that is `active` should not carry a `resolved_at` timestamp. This will confuse any future logic or operator that checks the rule history.

## Recommendations

### Immediate (P0)

- [x] **Clean the rule entry.** Remove `resolved_at` and `resolution` from `rule-cold-session-test-must-pass-before-resolution` in `meta-state.jsonl:19`, or otherwise make the entry internally consistent. Because `meta_state_patch` cannot delete immutable/audit fields, this likely needs a one-time direct edit; document it in a change-log entry immediately afterward. *(Verified: registry entry no longer contains `resolved_at`/`resolution`.)*
- [x] **Add an entry-kind guard to `meta_state_archive`.** The tool description says it archives findings; it should reject `entry_kind === "rule"` unless an explicit `force: true`/`override` flag is set, and even then require a reason. This prevents accidental archival of gate-enforced rules. *(Implemented: rejects any entry where `entry_kind !== "finding"`.)*
- [x] **Add an entry-kind guard to `meta_state_resolve`.** Rules are not findings; resolving a rule to `status: "resolved"` conflicts with the rule lifecycle (`active`/`inactive`). `meta_state_resolve` should reject `entry_kind === "rule"` (and likely `loop-design` too) and direct users to `meta_state_patch` with `status: "inactive"`. *(Implemented: rejects change-logs and any non-finding entry.)*

### Short-term (P1)

- [x] **Fix the `session_id` discoverability gap.** Either add a hint in `loop_describe` warm tier that `meta_state_list` has a first-class `session_id` filter, or stop stripping `session_id` from compact output (it is a narrow-query key). Update the assistant playbook to use tool parameters for filtering, not client-side filtering of compact responses. *(Implemented: `session_id` surfaced in compact/summary output; hint #15 added; tool description and `AGENTS.md` updated. Plan: `plans/260614-0222-fix-session-id-discoverability/`.)*
- [x] **Require reading the rule/change-log before bulk archive.** A simple prompt guard: when `meta_state_archive` is called with more than one entry, the assistant must list each entry's `entry_kind`, `description`, and `status` and confirm with the operator before proceeding. *(Implemented: `meta_state_archive` now returns a preview for `override` arrays with length > 1 and requires `confirm: true` to proceed. Plan: `plans/260614-0232-bulk-archive-preview-guard/`.)*

### Long-term (P2)

- [ ] **Provide an MCP path for unarchiving / rewinding entries.** Either extend `meta_state_patch` to allow transitioning out of `archived` (automatically clearing `archived_*` fields) or add a dedicated `meta_state_unarchive` tool. Direct JSONL edits should never be the recovery path.
- [ ] **Add a registry-consistency check.** A test or MCP probe that flags entries whose `status` and audit fields disagree (e.g. `status: active` + `resolved_at`, `status: archived` without `archived_at`).

## Supporting Evidence

- Session transcript: `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/06085a38-9531-41f8-8d42-6a957d42722d.jsonl`
  - Wrong-path grep and "no entries" conclusion: lines 323–329
  - Rule resolved + archived: line 391
  - Direct Python JSONL edit: line 465
  - Change-log after manual restore: line 473
- Current registry: `meta-state.jsonl:19` (rule), `meta-state.jsonl:558` (archived finding), `meta-state.jsonl:565` (manual-restore change-log)
- Tool contracts:
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js:62` (`session_id` filter)
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js:73` (compact strips `session_id`)
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:6-23` (immutable fields deny-list)
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:17` (resolve description)

## Unresolved Questions

- [x] ~~Is an active rule that still carries `resolved_at`/`resolution` acceptable to the gate logic, or should it be cleaned immediately?~~ Resolved: registry entry cleaned; no `resolved_at`/`resolution` remains.
- [ ] Should `meta_state_archive` gain a dedicated `unarchive` capability, or should unarchiving be folded into `meta_state_patch`?
- [ ] Should rules and loop-designs be allowed to pass through `meta_state_resolve` at all, or should the tool be strictly limited to findings?
