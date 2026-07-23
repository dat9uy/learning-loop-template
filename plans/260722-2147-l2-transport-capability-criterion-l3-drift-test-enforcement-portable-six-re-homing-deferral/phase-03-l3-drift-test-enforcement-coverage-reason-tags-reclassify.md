---
phase: 3
title: "L3 drift-test enforcement — coverage + reason tags + reclassify"
status: completed
priority: P1
effort: "1.5d"
dependencies: [2]
---

# Phase 3: L3 drift-test enforcement — coverage + reason tags + reclassify

## Post-review correction (2026-07-23)

A post-merge `/ak:code-review` revised two of this phase's reclassifications. The steps below are marked `[x]` as executed; this note captures the delta so the phase spec stays honest. See plan.md § "Post-review correction" + change-log `meta-260723T1126Z-docs-runtime-contract-md-core-cli-tools-js-tests-cli-write-t`.

- **`workflow_generate_prompt` was reverted from `CLI_READ_TOOLS` back to `MCP_RESIDUE` (`deferred-rehoming`).** Its `BLUEPRINTS` paths were stale (pointed at the folded `learning-loop-mcp` subtree), so the tool returned `Blueprint file not found` for every call. Paths were fixed (`tools/learning-loop-mastra/tools/handlers/references/`), but U-Q2 cross-root resolution is not fully resolved (blueprints resolve only under the loop repo root), so re-homing to CLI is deferred. Net: the "3 helpers reclassified" is now **2 write helpers** (`workflow_notify_artifact`, `workflow_trigger`) + 5 aux-read-ish; `workflow_generate_prompt` stays MCP. Step 1's "add `workflow_generate_prompt` to `CLI_READ_TOOLS`" is superseded — it is in `MCP_RESIDUE` instead.
- **`update_r2_allowlist` was re-tagged `server-state` → `operator-policy`.** It is operator-only R2 allowlist mutation (the doc's `operator-policy` example) AND touches a process-singleton cache; `operator-policy` takes precedence (precedence note added to `docs/runtime-contract.md`). Steps 2/46 listing `update_r2_allowlist` = `server-state` are superseded by `operator-policy`.
- **Residue counts:** drift-test `MCP_RESIDUE` is now 11 entries (was 10); under `LOOP_RECORDS_VIA_CLI=1` the mastra_* residue is 3 (`update_r2_allowlist`, `check_runtime_agnostic`, `workflow_generate_prompt`), not 2. `CLI_READ_TOOLS` is 12 (7 + 5 aux), not 13.
- **`notify_artifact` in-handler error message** de-garbled (removed dead `${path ? "" : ""}` ternary). New tests pin the fixes: `notify-artifact-tool.test.js` (records/** guard) + `workflow-generate-prompt-tool.test.js` (blueprint resolution regression).

## Overview

Make the L2 criterion (Phase 2) mechanically enforceable at L3. Extend the drift test to cover the 8 `run_workflow_*` tools it currently misses, require every `MCP_RESIDUE` entry to declare a reason tag, and reclassify the 3 `mastra_workflow_*` helpers + 5 aux-read-ish tools out of `MCP_RESIDUE` into `CLI_TOOLS`. The 6 portable-six stay in `MCP_RESIDUE` tagged `deferred-rehoming` (re-homing is Phase 4's deferral, not this phase). `check_runtime_agnostic` stays in `MCP_RESIDUE` tagged `agent-facing` (it is agent-invoked, not operator-only). **Red-team added two test files** (`cli-mcp-subset-registration.test.js`, `cli-write-tool-set.test.js`) to the Modify scope — both lock the current membership and break under reclassification.

## Requirements

- Functional: (a) drift test enumerates `workflows-manifest.json` in addition to `manifest.json`; every one of the 11 workflow tools is in `CLI_TOOLS` or `MCP_RESIDUE`; a future unclassified `run_workflow_*` fails the test. (b) `MCP_RESIDUE` becomes a `new Map([...])` (NOT a plain object — red-team FMA-F7: plain objects have no `.has` → crash) with reason ∈ {`server-state`, `operator-policy`, `agent-facing`, `deferred-rehoming`}; untagged fails. (c) `core/cli-tools.js` admits the reclassified tools; header comment cites the L2 criterion and frames `pathFields: []` correctly (R2 bypass, NOT statelessness — red-team Sec-F4). (d) the two membership-locking tests updated.
- Non-functional: `pnpm test` green; `check_runtime_agnostic` clean on touched paths; rollback = targeted code revert of `core/cli-tools.js` (NOT a flag flip — red-team FMA-F8).

## Architecture

Three files edited + the two locking tests:

1. **`core/cli-tools.js`** — add `workflow_generate_prompt` to `CLI_READ_TOOLS`; add `workflow_notify_artifact` + `workflow_trigger` to `CLI_WRITE_TOOLS` (stateless side-effecting handlers, `pathFields: []`); add the 5 aux-read-ish tools (`gate_check`, `gate_check_recurrence`, `meta_state_sweep`, `meta_state_query_drift`, `meta_state_relationship_validate`) to `CLI_READ_TOOLS`. Rewrite the header comment to cite the L2 criterion; frame `pathFields: []` as **R2 path-ownership bypass** (NOT a statelessness test — red-team Sec-F4: `update_r2_allowlist` has `pathFields: []` but is server-state, proving they are independent properties). Note the `CLI_READ_TOOLS` widening affects both `LOOP_READS_VIA_CLI=1` and `LOOP_RECORDS_VIA_CLI=1` opt-outs (red-team AD-F6).
   - **`notify_artifact` `path` arg fix (red-team Sec-F5; validation decision Q1 = in-handler validation):** the handler takes a required `path` arg (`notify-artifact-tool.js:11`) that flows into `evaluateTriggers(path, …)` and `appendGateLog` but declares `pathFields: []` (`manifest.json:34`) — so R2 never ownership-checks an agent-controlled path. **Chosen fix: validate `path` against `records/**` in the handler** before appending to the gate-log (the CLI path hardcodes `pathFields: []` at `loop.mjs:123`, so in-handler validation is required regardless; adding `"path"` to `pathFields` was rejected as additive-only). The path is not read/written — impact is gate-log pollution + glob injection, not arbitrary file access — but the misdeclaration is fixed, not endorsed.
2. **`cli-write-tool-set-drift.test.js`** — (a) replace the `MCP_RESIDUE` `Set` with `new Map([...])` (preserve `.has` semantics); reasons: 2 storage `run_workflow_*` + `update_r2_allowlist` = `server-state`; `check_runtime_agnostic` = `agent-facing` (NOT `operator-policy` — red-team Sec-F3: it is agent-invoked via `agent-manifest.json:30` + `intake-agent.js:14` + `scout-agent.js:14`); 6 portable-six `run_workflow_*` = `deferred-rehoming` (citing the Phase 4 finding id). (b) Add `readWorkflowToolNames()` mirroring `server.js:135`/`:187` — `import(./${file})`, read `wf.id`, produce `run_${wf.id}`. Add a test: "every workflows-manifest tool is in CLI_TOOLS or MCP_RESIDUE" (the blind-spot closure). (c) Add a test: "every MCP_RESIDUE entry declares a known reason tag". (d) Update the disjoint + classification tests for the Map shape.
3. **`cli-mcp-subset-registration.test.js` (red-team FMA-F3/F1 — was missing)** — its hardcoded `MCP_RESIDUE` array (lines 124-141) asserts each of the 10 residue tools stays on MCP under `LOOP_RECORDS_VIA_CLI=1`; shrink it to the remaining residue (`mastra_update_r2_allowlist`, `mastra_check_runtime_agnostic`, the 2 storage `mastra run_workflow_storage_*`, the 6 portable-six `mastra run_workflow_*`). The `36 - CLI_TOOLS.size` dynamic count at line 112 adapts automatically.
4. **`cli-write-tool-set.test.js` (red-team FMA-F4 — was missing)** — locks exact `EXPECTED_READ_TOOLS` (7) + `EXPECTED_WRITE_TOOLS` (19) + asserts the 5 aux "stay out of CLI_TOOLS" (lines 70-80). Update `EXPECTED_READ_TOOLS` (+`workflow_generate_prompt` + 5 aux), `EXPECTED_WRITE_TOOLS` (+`workflow_notify_artifact` + `workflow_trigger`); **invert/delete** the "auxiliary read-ish tools stay out of CLI_TOOLS" test — it asserted the old contract this plan intentionally reverses.
5. **No `server.js` change for manifest tools** — the opt-out `RECORDS_VIA_CLI && CLI_TOOLS.has(...)` at `server.js:71` (MANIFEST loop) drops any `CLI_TOOLS` member from MCP; reclassification of the 3 helpers + 5 aux takes effect automatically there. **But** the workflow registration loop (`server.js:135`) and `convertWorkflowsToTools` (`server.js:187`) have NO such check (red-team Sec-F9) — so adding a `run_workflow_*` to `CLI_TOOLS` would NOT drop it from MCP. This matters for the future re-homing plan (Phase 4 prerequisite), not this phase (the portable-six stay MCP).

The 2 storage workflows (`run_workflow_storage_round_trip`, `run_workflow_storage_read`) stay `MCP_RESIDUE` = `server-state` (process-scoped `getParityDb()` singleton, `storage.js:30`).

## Related Code Files

- Create: none.
- Modify: `tools/learning-loop-mastra/core/cli-tools.js`, `tools/learning-loop-mastra/__tests__/cli-write-tool-set-drift.test.js`, `tools/learning-loop-mastra/__tests__/cli-mcp-subset-registration.test.js`, `tools/learning-loop-mastra/__tests__/cli-write-tool-set.test.js`, and (for the `notify_artifact` `pathFields` fix) `tools/learning-loop-mastra/tools/manifest.json`.
- Delete: none.
- Read (citation): `tools/learning-loop-mastra/mastra/server.js:71,135,187`, `tools/learning-loop-mastra/mastra/workflows-manifest.json`, `tools/learning-loop-mastra/storage.js:30`, `tools/learning-loop-mastra/tools/handlers/notify-artifact-tool.js:11,18,23,30`, `tools/learning-loop-mastra/agent-manifest.json:30`, `docs/runtime-contract.md` (Phase 2 section).

## Implementation Steps

1. Confirm Phase 1 scout values: the 8 `wf.id`s, the 3 helpers' `name:` fields, the 5 aux-read-ish names.
2. Edit `core/cli-tools.js`: move the 8 entries (3 helpers + 5 aux-read-ish) into the CLI sets per the architecture mapping; rewrite the header to cite the L2 criterion and frame `pathFields: []` as R2 bypass; note `CLI_READ_TOOLS` widens both opt-out flags.
3. Fix the `notify_artifact` `path` misdeclaration (validation Q1): add an in-handler `records/**` validation of `path` before `evaluateTriggers`/`appendGateLog` (the CLI path hardcodes `pathFields:[]` so this is the required fix; the `pathFields`-additive option was rejected).
4. Edit `cli-write-tool-set-drift.test.js`: convert `MCP_RESIDUE` to `new Map([...])`; assign `server-state` (2 storage + `update_r2_allowlist`), `agent-facing` (`check_runtime_agnostic`), `deferred-rehoming` (6 portable-six, citing the Phase 4 finding id); remove the 8 reclassified entries.
5. Add `readWorkflowToolNames()` mirroring `server.js:135`/`:187` (import, read `wf.id`, `run_${wf.id}`). Add the blind-spot-closure test + the reason-tag test. Update disjoint/classification tests for the Map shape.
6. Edit `cli-mcp-subset-registration.test.js`: shrink the hardcoded `MCP_RESIDUE` array to the remaining residue (update_r2_allowlist, check_runtime_agnostic, 2 storage, 6 portable-six). Confirm the `36 - CLI_TOOLS.size` count still holds.
7. Edit `cli-write-tool-set.test.js`: update `EXPECTED_READ_TOOLS` + `EXPECTED_WRITE_TOOLS`; invert/delete the "aux stay out of CLI_TOOLS" test (now asserts the reverse — they ARE in CLI_TOOLS).
8. Run `pnpm test` (narrow: the 4 touched tests + cli-tools import; then broaden to CLI transport + parity + cli-optout-wiring suites). Fix regressions without weakening tests.
9. `check_runtime_agnostic` against `core/cli-tools.js` + the 3 touched test paths. Verify reclassified handlers dispatch via `bin/loop.mjs` and grep their imports for `inbound-state`/`runtime-state`/`surfaces` deps — confirm file-based (reconstructable by a one-shot process); note `notify_artifact`'s dead `checkObservationStaleness` import (red-team AD-F8).
10. **`check_runtime_agnostic` (validation Q2 = keep MCP):** keep it in `MCP_RESIDUE` tagged `agent-facing` — do NOT reclassify to `CLI_TOOLS`. It is agent-invoked by Mastra internal agents (intake/scout); keeping it on MCP under `LOOP_RECORDS_VIA_CLI=1` preserves their tool surface. The `operator-policy` mislabel is fixed; no further change. (Reclassify was rejected to avoid breaking Mastra-internal-agent tool resolution.)

## Success Criteria

- [x] Drift test enumerates both manifests; an unclassified `run_workflow_*` addition fails.
- [x] `MCP_RESIDUE` is a `new Map([...])`; every entry tagged `server-state` | `operator-policy` | `agent-facing` | `deferred-rehoming`; untagged fails.
- [x] 3 helpers + 5 aux-read-ish tools in `CLI_TOOLS`; 2 storage + `update_r2_allowlist` (`server-state`) + `check_runtime_agnostic` (`agent-facing`) + 6 portable-six (`deferred-rehoming`) remain in `MCP_RESIDUE`.
- [x] `cli-mcp-subset-registration.test.js` + `cli-write-tool-set.test.js` updated; both green.
- [x] `notify_artifact` `path` arg validated against `records/**` in-handler (Q1).
- [x] `core/cli-tools.js` header cites the L2 criterion; `pathFields: []` framed as R2 bypass (not statelessness).
- [x] `pnpm test` green; `check_runtime_agnostic` clean on touched paths; reclassified handlers verified CLI-dispatchable + file-based deps.

## Risk Assessment

- **MCP-surface drop for `.claude`.** Reclassified tools leave MCP under `LOOP_RECORDS_VIA_CLI=1`. Mitigation: each is a stateless `manifest.json` handler `bin/loop.mjs` can dispatch (FMA confirmed); step 9 verifies. **Rollback is a targeted code revert** of the specific tool's entry in `core/cli-tools.js` (move back to `MCP_RESIDUE`) — NOT `LOOP_RECORDS_VIA_CLI=0`, which restores all 31 tools and re-opens split-brain (red-team FMA-F8).
- **`run_<wf.id>` derivation mismatch.** Mitigation: step 5 imports the workflow object and reads `wf.id` exactly as `server.js:135` does; the test asserts against `run_${wf.id}` (derived at `:187`). Confirm against an actual MCP name (e.g. `run_workflow_classify_prompt`).
- **Map shape.** Mandate `new Map([...])`; a plain `{name: reason}` object has no `.has` and crashes the existing disjoint/classification tests (red-team FMA-F7).
- **`check_runtime_agnostic` tag.** `operator-policy` is factually wrong (agent-invoked). Keep `agent-facing`; verify Mastra-internal-agent impact before any reclassify (step 10).
- **`CLI_READ_TOOLS` widening.** Adding 5 aux widens the `LOOP_READS_VIA_CLI=1` reads-only opt-out for future runtimes (red-team AD-F6). No runtime sets reads-only alone today (wiring test confirms); note in header.