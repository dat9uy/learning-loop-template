---
phase: 1
title: "Self-footgun guard + CLI write tool-set + MCP write opt-out"
status: pending
priority: P1
effort: "1.5d"
dependencies: []
---

# Phase 1: Self-footgun guard + CLI write tool-set + MCP write opt-out

## Overview

Make `bin/loop.mjs` carry every CLI-portable mutation tool, add the promotion-path
self-footgun guard that gates `meta_state_promote_rule` inclusion, and add the MCP
write opt-out so a runtime can drop the MCP record surface. Tests first per `--tdd`.

## Requirements

- Functional:
  - `bin/loop.mjs` accepts and executes every tool in `CLI_WRITE_TOOLS` with the same
    handler/R2-gate/lock path as MCP (`pathFields: []` → R2 passthrough).
  - `meta_state_promote_rule` activation rejects a `regex` pattern that matches CLI
    invocation shapes; returns a structured `promoted: false` result with a named reason
    and appends a gate-log row.
  - `mastra/server.js` honors `LOOP_RECORDS_VIA_CLI=1` by excluding every `CLI_TOOLS`
    member (reads + writes) from the MCP surface. R's `LOOP_READS_VIA_CLI` /
    `CLI_READ_TOOLS` block stays for reads-only backward compat.
  - `meta_state_dispatch_finding` rides the CLI for **both** `prepare` and `commit` (the
    handler does not call `gh`; the agent runs `gh issue create` between stages).
- Non-functional:
  - No new mutation code path — reuses `adaptLegacyHandler` + `withR2Gate` + record-writer.
  - Runtime-agnostic: `check_runtime_agnostic` passes on touched files.

## Architecture

- `core/cli-tools.js` becomes the single source of truth for the union:
  `CLI_READ_TOOLS` (unchanged 7) + new `CLI_WRITE_TOOLS` (enumerated below), exported
  together as `CLI_TOOLS`. The MCP exclusion reads the same sets.
  **`CLI_WRITE_TOOLS`** = `meta_state_report`, `meta_state_resolve`,
  `meta_state_promote_rule` (post-guard), `meta_state_log_change`, `meta_state_patch`,
  `meta_state_batch`, `meta_state_archive`, `meta_state_supersede`,
  `meta_state_propose_design`, `meta_state_ship_loop_design`,
  `meta_state_dispatch_finding` (both stages), `meta_state_re_verify`,
  `meta_state_refresh_file_index`, `runtime_state_record`, `gate_mark_preflight`,
  `gate_override`. Each is a handler module with `pathFields: []`.
  **Not in either CLI set (stay MCP):** `run_workflow_*`, `workflow_storage_*`,
  `update_r2_allowlist`, `check_runtime_agnostic`, and the auxiliary read-ish tools
  (`gate_check`, `gate_check_recurrence`, `meta_state_sweep`, `meta_state_query_drift`,
  `meta_state_relationship_validate`) — see plan.md Architecture.
- `bin/loop.mjs` `runTool` membership check moves from `CLI_READ_TOOLS` → `CLI_TOOLS`.
  `runList` filters to `CLI_TOOLS`. No change to the execute path (already transport-agnostic).
- `tools/handlers/meta-state-promote-rule-tool.js`: add the guard in the **activation
  branch** — after the `rule_id_already_active` check (~line 190) and before
  `writeEntry(root, ruleEntry)` (~line 212). **`isSafeRegexPattern` is NOT in this
  branch** (it is preview-only, line 119); do not anchor on it. The guard: if
  `pattern_type === "regex"` and `matchesCliTransport(pattern)`, return
  `{promoted: false, reason: "pattern_matches_cli_transport", id, rule_id, pattern}` and
  append a gate-log row. (Separately note: the activation branch lacks `isSafeRegexPattern`
  today — a pre-existing ReDoS gap; adding the safety check there too is in-scope and cheap.)
- `core/cli-self-match.js` (new): exports `canonicalCliInvocationShapes()` and
  `matchesCliTransport(pattern)`. The shape list covers more than one literal: (a) the
  canonical relative path `\bnode\s+tools/learning-loop-mastra/bin/loop\.mjs\b`, (b) the
  **absolute path** resolved from `bin/loop.mjs`'s `__dirname` at module load (escaped),
  (c) bare forms `\bin/loop\.mjs\b` and `\bloop\.mjs\b`. Only `regex` rules with
  `command`-matching patterns can intercept the bash gate — `glob` matches `filePath`
  (null for bash) and `agent-checklist`/`determinism-checklist` are `continue`'d in
  `applyPromotedRules` (`core/gate-logic.js` ~937-1019) — so the guard is regex-only by
  construction; document this in the helper's comment.
- `mastra/server.js`: add `RECORDS_VIA_CLI = /^(1|true)$/i.test(LOOP_RECORDS_VIA_CLI)`; in
  the manifest loop, `if (RECORDS_VIA_CLI && CLI_TOOLS.has(name)) continue;`. Keep R's
  existing `if (READS_VIA_CLI && CLI_READ_TOOLS.has(name)) continue;` for reads-only
  backward compat. `update_r2_allowlist` and the workflow/storage tools are not in
  `CLI_TOOLS`, so they stay MCP regardless.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/cli-tools.js` (add `CLI_WRITE_TOOLS`, `CLI_TOOLS`)
- Modify: `tools/learning-loop-mastra/bin/loop.mjs` (membership → `CLI_TOOLS`)
- Modify: `tools/learning-loop-mastra/mastra/server.js` (add `LOOP_RECORDS_VIA_CLI` exclusion over `CLI_TOOLS`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js` (self-match guard)
- Create: `tools/learning-loop-mastra/core/cli-self-match.js` (canonical CLI shapes + matcher)
- Modify: `tools/learning-loop-mastra/__tests__/cli-self-footgun-guard.test.js` (flip to assert rejection)
- Modify: `tools/learning-loop-mastra/__tests__/cli-bash-gate-guard.test.js` (add write-shape `ok` case)
- Create: `tools/learning-loop-mastra/__tests__/cli-write-tool-set.test.js` (membership + dispatch both stages)
- Modify: `tools/learning-loop-mastra/__tests__/cli-mcp-subset-registration.test.js` (assert write opt-out drops `CLI_WRITE_TOOLS`)
- Create: `tools/learning-loop-mastra/__tests__/cli-write-tool-set-drift.test.js` (diff `CLI_WRITE_TOOLS ∪ excluded-with-reason` against the manifest's handler-module tools so a future manifest addition is a deliberate decision, not a silent CLI-portable default)

## Implementation Steps (TDD — tests first)

1. **Test — self-footgun guard flips.** Edit `cli-self-footgun-guard.test.js`: change the
   assertion from `promoted === true` + `decision === "escalate"` to `promoted === false`,
   `reason === "pattern_matches_cli_transport"`, and `evaluateBashGate(CLI_COMMAND)` stays
   `ok` (no rule was promoted). Add coverage for the absolute-path and bare-form shapes.
   Run → red (guard does not exist yet).
2. **Implement guard helper.** Create `core/cli-self-match.js` exporting
   `canonicalCliInvocationShapes()` (relative + absolute + bare forms) and
   `matchesCliTransport(pattern)`. Have the test import it directly for shape coverage.
   Add a regression test that a `glob`/`agent-checklist` rule naming the bin path does NOT
   intercept `evaluateBashGate` (locks the regex-only rationale).
3. **Wire guard into promote-rule tool.** In `meta-state-promote-rule-tool.js` activation
   branch (after `rule_id_already_active`, before `writeEntry`), call
   `matchesCliTransport(pattern)`; on match, return the named rejection + gate-log row.
   While in the branch, also add the missing `isSafeRegexPattern` safety check (pre-existing
   ReDoS gap). Run the flipped test → green.
4. **Test — CLI write tool-set membership + drift.** Create `cli-write-tool-set.test.js`:
   assert `CLI_WRITE_TOOLS` equals the enumerated set above and **not** the excluded
   categories; assert `meta_state_dispatch_finding` is in the set (both stages — the handler
   dispatches on `stage` internally; no CLI-side stage guard). Create
   `cli-write-tool-set-drift.test.js`: diff `CLI_READ_TOOLS ∪ CLI_WRITE_TOOLS ∪
   excluded-with-reason` against the manifest's handler-module tools; fail if a manifest
   addition is neither in a CLI set nor in the excluded-with-reason list. Run → red.
5. **Expand `cli-tools.js`.** Add `CLI_WRITE_TOOLS` and `CLI_TOOLS`. Run membership + drift
   tests → green.
6. **Test — bash-gate write shape (lock, not red).** Extend `cli-bash-gate-guard.test.js`
   with `node bin/loop.mjs meta_state_report '{}'` → `decision: "ok"`. This is an
   assumption-lock (it should already pass); it guards against a future blocking regex.
7. **Wire `bin/loop.mjs`** membership to `CLI_TOOLS`. Run `pnpm test:one` on the membership
   + bash-gate tests → green.
8. **Test — MCP records opt-out.** Extend `cli-mcp-subset-registration.test.js`: with
   `LOOP_RECORDS_VIA_CLI=1`, the MCP tool list excludes every `CLI_TOOLS` member (reads +
   writes) and still includes `update_r2_allowlist` + workflow tools. Run → red.
9. **Implement `LOOP_RECORDS_VIA_CLI`** in `server.js` (keep `LOOP_READS_VIA_CLI` for
   reads-only compat). Run → green.
10. **Runtime-agnostic audit.** Run `check_runtime_agnostic` on `bin/loop.mjs`,
    `core/cli-tools.js`, `core/cli-self-match.js`, and the `server.js` opt-out block. Fix
    any surface-specific code (shim-not-fork).

## Success Criteria

- [ ] `cli-self-footgun-guard.test.js` asserts rejection (`promoted: false`,
      `reason: "pattern_matches_cli_transport"`) and no CLI interception.
- [ ] `cli-write-tool-set.test.js` + `cli-write-tool-set-drift.test.js` pass: enumerated
      portable handlers in, excluded categories out, dispatch both stages in, no unclassified
      manifest tool.
- [ ] `cli-bash-gate-guard.test.js` write-shape `ok` case passes.
- [ ] `cli-mcp-subset-registration.test.js` write opt-out case passes.
- [ ] `check_runtime_agnostic` passes on touched files.
- [ ] `pnpm test` green (no regressions in the 2374-test baseline).

## Risk Assessment

- **Guard too narrow** → a variant CLI shape (absolute path, symlink, `npx`/`pnpm exec`)
  still self-bricks. Mitigation: the shape list covers relative + absolute + bare forms,
  shared between guard and test. Residual risk (symlinks, npx) is documented; the
  exclude-`promote_rule` escape hatch remains the operator-visible fallback.
- **`CLI_WRITE_TOOLS` list drift** — a future manifest addition would silently become
  CLI-portable. Mitigation: `cli-write-tool-set-drift.test.js` fails unless every manifest
  handler-module tool is explicitly in a CLI set or in the excluded-with-reason list.
- **Pre-existing ReDoS gap** — the activation branch lacks `isSafeRegexPattern` today.
  Phase 1 adds it alongside the self-match guard (cheap, in-scope); note it in the
  change-log as a bug fixed en route.