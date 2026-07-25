---
phase: 5
title: "Gates green + resolve the finding"
status: pending
priority: P2
effort: "0.5d"
dependencies: [4]
---

# Phase 5: Gates green + resolve the finding

## Overview

Close the loop: run the full gate suite (`pnpm test`, `check_runtime_agnostic`, fallow gate), update `docs/runtime-contract.md` for the reclassification + the P-Q2 multi-step note, then resolve finding `meta-260723T0813Z-...` with the required evidence (`pr_ref`, `change_log_id`, `file_index_refreshed_path`) via the loop's CLI write tools. This phase is the audit-trail close-flow the loop requires — no direct file writes to `meta-state.jsonl`.

## Requirements

- Functional: `pnpm test` green across all namespaces; `check_runtime_agnostic` clean on touched paths; fallow gate triaged (per the fallow-gate-triage hint); a `meta_state_log_change` change-log entry records the re-homing; `meta_state_resolve` closes the finding with the evidence triple; `meta_state_refresh_file_index` re-grounds the refactored paths.
- Non-functional: all registry writes go through `bin/loop.mjs` (CLI write transport, per the `.claude` `LOOP_RECORDS_VIA_CLI=1` contract); no direct `meta-state.jsonl` edits; the PR ref is captured after the ship (or the branch ref if the PR is not yet merged at resolve time — record the branch and amend).

## Architecture

- `docs/runtime-contract.md`: in the "Transport capability (per function)" section, the portable-six row moves from `deferred-rehoming` to `CLI-capable` (they now ride the CLI). Add a one-paragraph P-Q2 note: "Multi-step deterministic workflows re-homed to the agent home require gate-observed (not agent-asserted) step-success to keep ordering enforceable. The portable six are single-step, so this does not apply now; the contract is stated for any future re-homing."
- Registry writes (all via `bin/loop.mjs`):
  1. `meta_state_log_change '{change_dimension:"transport", change_target:"run_workflow_* portable six → mastra_workflow_* via tools/manifest.json", change_diff:"6 tools unwrapped from createLoopWorkflow; workflows-manifest.json -6; tools/manifest.json +6; CLI_WRITE_TOOLS +6; drift test reclassified; Sec-F9 dissolved by removal", reason:"Re-home the 6 CLI-capable workflow tools to the CLI transport per the unwrap contract (U-Q1); U-Q2 scoped out (no file reads); P-Q2 non-blocker (single-step); Sec-F9 dissolved (removed from workflows-manifest.json)"}'` → captures `change_log_id`.
  2. `meta_state_refresh_file_index '{path:"tools/learning-loop-mastra/core/cli-tools.js", reason:"re-homing reclassification"}'` + the same for `tools/manifest.json`, `workflows-manifest.json`, the 6 new handler files, and the 6 deleted workflow paths (refresh the surviving paths; the deleted paths drop out of the index naturally).
  3. `meta_state_resolve '{id:"meta-260723T0813Z-six-portable-workflow-tools-are-cli-capable-in-principle-but", resolution:"Re-homed: 6 run_workflow_* unwrapped to plain handlers via tools/manifest.json + CLI_WRITE_TOOLS; U-Q1 via shared wrapWorkflowInputSchema; U-Q2 scoped out; P-Q2 documented non-blocker; Sec-F9 dissolved by removal from workflows-manifest.json. change_log=<id>, pr_ref=<url/branch>, file_index_refreshed=tools/manifest.json+workflows-manifest.json+core/cli-tools.js"}'`.

## Related Code Files

- Modify: `docs/runtime-contract.md` (transport-capability section: reclassify the 6; add P-Q2 multi-step note)
- Read: `tools/learning-loop-mastra/bin/loop.mjs` (the write transport for this runtime)
- Delete: (none)

## Implementation Steps

1. **Run the full test suite.** `pnpm test` — green across all namespaces. If any namespace fails, fix before proceeding (do not hide failures). Pay attention to: `cli-write-tool-set-drift`, `workflow-unwrap-parity`, `cli-workflow-dispatch`, `no-stale-portable-six-refs`, `mcp-tools-list-parity`, `server-runid`, `cli-mcp-subset-registration`, `cli-write-tool-set`, `cli-optout-wiring`.
2. **`check_runtime_agnostic` — baseline first, then touched paths (red-team Medium).** The `manifest-registered` check (`runtime-agnostic-checklist.js:268-302`) builds `registered` from `agent-manifest groups.*.tools` (PREFIXED names, e.g. `mastra_workflow_classify_prompt`) and cross-walks via `deriveToolName(file)` (`:110-112`), which returns the UNPREFIXED name (`workflow_classify_prompt`). This prefix mismatch means the check may already be loose for the EXISTING 3 helpers today. So: FIRST run `check_runtime_agnostic` on an existing helper path (e.g. `tools/handlers/notify-artifact-tool.js`) to establish the baseline — if it fails today, the `manifest-registered` check is inherited-broken (not this plan's regression; file a separate finding, do not block). THEN run it on the 6 new handler modules + `workflow-input-schema.js`; fix any NEW findings (the 6 are stateless pure transforms with no surface-specific code). Do not assume "expect clean" — verify empirically against the baseline.
3. **Fallow gate.** `pnpm fallow:gate`. If non-zero, run `pnpm fallow:brief` for the compact-CSV; grep `severity=` for actionable findings; ignore baseline-inherited lines (per the fallow-gate-triage hint). Fix real findings; record any deferred ones with rationale.
4. **Update `docs/runtime-contract.md`.** In the "Transport capability (per function)" section: move the portable-six row from `deferred-rehoming` to `CLI-capable` (rides CLI under `LOOP_RECORDS_VIA_CLI=1`); add the P-Q2 multi-step note (see Architecture). Add a change-log citation pointer to the `change_log_id` from step 5.
5. **Log the change-log entry.** `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_log_change '{...}'` (exact args per Architecture). Capture the returned `change_log_id`.
6. **Refresh file-index for refactored paths.** `meta_state_refresh_file_index` for each surviving refactored path (`core/cli-tools.js`, `tools/manifest.json`, `mastra/workflows-manifest.json`, the 6 new `tools/handlers/workflow-<x>-tool.js`, `core/workflow-input-schema.js`). The 6 deleted workflow paths drop out of the index naturally — do not refresh deleted paths.
7. **Resolve the finding.** `meta_state_resolve` with the evidence triple (`pr_ref` = the PR URL if merged, else the branch ref with a note to amend; `change_log_id` from step 5; `file_index_refreshed_path` = the set refreshed in step 6). Confirm via `meta_state_list '{id:["meta-260723T0813Z-..."],compact:false}'` that `status` is `resolved` and `resolved_at` is set.
8. **Cross-check the sibling finding.** `meta-260723T1126Z-workflow-generate-prompt-...` (the `workflow_generate_prompt` U-Q2 cross-root finding, recorded in the 260722-2147 post-review) is NOT resolved by this plan — confirm it stays `open` (it has its own cross-root resolution prerequisite). Do not cascade-resolve it.

## Success Criteria

- [ ] `pnpm test` green across all namespaces; no hidden failures.
- [ ] `check_runtime_agnostic` baseline established on an existing helper (if the `manifest-registered` check fails today, filed as inherited-broken — not this plan's regression); the 6 new handler modules + `workflow-input-schema.js` clean of NEW findings.
- [ ] Fallow gate triaged (real findings fixed; baseline-inherited ignored; any deferral recorded with rationale).
- [ ] `docs/runtime-contract.md` transport-capability section reclassifies the 6 to `CLI-capable`; the P-Q2 multi-step note added.
- [ ] A `meta_state_log_change` change-log entry recorded (captures `change_log_id`).
- [ ] `meta_state_refresh_file_index` run on the surviving refactored paths.
- [ ] `meta_state_resolve` closes `meta-260723T0813Z-...` with `{pr_ref, change_log_id, file_index_refreshed_path}`; `meta_state_list` confirms `status: resolved`.
- [ ] The sibling `meta-260723T1126Z-workflow-generate-prompt-...` finding remains `open` (not cascade-resolved).

## Risk Assessment

- **Resolve-before-PR.** `meta_state_resolve` wants a `pr_ref`; if the PR is not yet merged, the resolve records a branch ref and must be amended after merge. Mitigation: record the branch ref with an explicit note; the ship/PR step (outside this plan) amends the `pr_ref` via `meta_state_patch` if needed. Alternatively, resolve AFTER the PR merges (this phase can run post-merge).
- **`meta_state_resolve` evidence gate.** The resolution-evidence-required rule (from the close-flow finding `meta-260723T0811Z` context) may reject a resolve missing one of the three fields. Mitigation: step 7 provides all three; if the gate rejects, read the structured stderr (exit 1) for the missing field and re-supply.
- **Refreshing a deleted path.** `meta_state_refresh_file_index` on a deleted path returns `code_missing`. Mitigation: step 6 refreshes only SURVIVING paths; the deleted workflow paths are not refreshed (the index drops them on the next seed, and `upsertFileIndexEntry` is a no-op on unchanged entries, so re-seeding is safe).
- **P-Q2 note overstating the contract.** The note must say the multi-step gate-observed contract applies to FUTURE multi-step re-homings, not the current single-step six. Mitigation: the note wording in Architecture is explicit ("does not apply now; stated for any future re-homing"); reviewed at sign-off.
