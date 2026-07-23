# PM Report — L2 transport-capability plan: post-review correction + sync-back

**Plan:** `plans/260722-2147-l2-transport-capability-criterion-l3-drift-test-enforcement-portable-six-re-homing-deferral/`
**Branch:** `l2-transport-capability-criterion` · **Date:** 2026-07-23 · **Session:** 11:29 ICT

## Status

| Artifact | Before | After |
|----------|--------|-------|
| `plan.md` frontmatter | `status: pending` | `status: completed` |
| Phase table (5 phases) | all Pending | all Completed (3 + 4 flagged "post-review correction") |
| Phase checkboxes | 23 `[ ]` / 0 `[x]` | 0 `[ ]` / 31 `[x]` across 6 files |
| Goal 3 + Success Criteria | "3 helpers reclassified" / `workflow_generate_prompt` in CLI_READ_TOOLS | "2 write helpers + 5 aux" / `workflow_generate_prompt` reverted to MCP_RESIDUE; `update_r2_allowlist` → `operator-policy` |

## Sync-back guard

- Swept all 5 `phase-XX-*.md` + `plan.md`. Every completed item mapped to a phase file; no orphan completions.
- Backfilled stale checkboxes in earlier phases (1, 2, 5) — their work shipped in commits `e16285c` / `812d424` / `0a4ba5c` / `2add3ab` and was never checked off.
- Phases 3 + 4 carry an inserted **"Post-review correction (2026-07-23)"** section so the executed-then-corrected steps stay honest (the `[x]` marks "executed"; the note captures the delta).

## Corrections captured in plan/phase docs

| # | Review finding | Plan/phase update |
|---|----------------|-------------------|
| 1 | `operator-policy` dead kind | Goal 3 + Success Criteria + phase-03 note: `update_r2_allowlist` re-tagged `operator-policy`; precedence note in `runtime-contract.md` |
| 2 | `workflow_generate_prompt` re-homed while U-Q2 open | Goal 3 + Success Criteria + phase-03 + phase-04 notes: reverted to `MCP_RESIDUE` `deferred-rehoming`; stale BLUEPRINTS path root-caused + fixed; new finding `meta-260723T1126Z-...` filed |
| 3 | Garbled `notify_artifact` message | phase-03 note: de-garbled |
| 4 | `notify_artifact` throw untested | phase-03 note: `notify-artifact-tool.test.js` added |

## Registry records written this session (via CLI)

| Kind | id |
|------|-----|
| change-log | `meta-260723T1126Z-docs-runtime-contract-md-core-cli-tools-js-tests-cli-write-t` |
| finding | `meta-260723T1126Z-workflow-generate-prompt-returned-error-true-message-bluepri` (`loop-anti-pattern` / `stale-blueprint-path-after-package-fold`) |

Both supersede no prior entry; the finding cross-references the portable-six finding `meta-260723T0813Z-...` (U-Q2 confirmed real).

## Verification

- 81/81 tests pass across 15 blast-radius files (all `cli-*` + touched + 2 new + parity + workflow-registry).
- `loop.mjs workflow_generate_prompt` → `unknown tool` (CLI-dropped); handler unit test proves real prompts.
- `loop.mjs list` no longer lists `workflow_generate_prompt`; `notify_artifact` rejects non-records paths with clean message.

## Unresolved questions

- None blocking plan closure.
- Follow-up (out of this plan's scope, owned by the future portable-six re-homing plan): U-Q2 cross-root blueprint resolution — resolve blueprints against the loop package install path, not the runtime root, before `workflow_generate_prompt` leaves MCP.
- Minor: `notify_artifact`'s thrown validation error surfaces at the CLI layer as `InternalError` rather than `UsageError`; reclassifying caller-input errors is a separate CLI-error-envelope concern.