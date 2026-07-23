# MCP → CLI surface handoff — post-plan 260722-2147 + PRs 72–75

**Purpose:** handoff to a fresh session to finish the MCP→CLI transport task.
**As of:** 2026-07-23 (after plan 260722-2147 + post-review correction, uncommitted on branch `l2-transport-capability-criterion`).
**Scope:** the loop's own tool surface (`tools/learning-loop-mastra`). Product-surface tools are out of scope.

## 1. Current surface state (ground truth from `core/cli-tools.js` + drift test)

### CLI-portable (ride `bin/loop.mjs`; dropped from MCP under the opt-out flags)

| Set | Count | Members |
|-----|-------|---------|
| `CLI_READ_TOOLS` | 12 | 7 record reads (`loop_describe`, `loop_get_instruction`, `meta_state_list`, `meta_state_relationships`, `meta_state_derive_status`, `meta_state_check_grounding`, `runtime_state_read`) + 5 aux read-ish (`gate_check`, `gate_check_recurrence`, `meta_state_sweep`, `meta_state_query_drift`, `meta_state_relationship_validate`) |
| `CLI_WRITE_TOOLS` | 21 | 16 record-surface mutation handlers + `runtime_state_record/pause/resume/prune_surface` + `gate_mark_preflight` + `gate_override` + 2 workflow write helpers (`workflow_notify_artifact`, `workflow_trigger`) |
| `CLI_TOOLS` (union) | 33 | dropped from MCP under `LOOP_RECORDS_VIA_CLI=1` (`.claude` dogfoods this) |

### MCP residue — stays on MCP for a declared reason (drift test `MCP_RESIDUE`, 11 entries)

| Tool | Reason | Re-homeable? |
|------|--------|--------------|
| `run_workflow_storage_round_trip` | server-state (singleton DB) | **No** — irreducible |
| `run_workflow_storage_read` | server-state (singleton DB) | **No** — irreducible |
| `update_r2_allowlist` | operator-policy (operator-only; singleton cache secondary) | **No** — by design |
| `check_runtime_agnostic` | agent-facing (Mastra internal agents) | **No** — by design |
| `run_workflow_classify_prompt` | deferred-rehoming | **Yes** — blocked (see §3) |
| `run_workflow_prepare_runtime_request` | deferred-rehoming | **Yes** — blocked |
| `run_workflow_self_improvement` | deferred-rehoming | **Yes** — blocked |
| `run_workflow_intentional_skip` | deferred-rehoming | **Yes** — blocked |
| `run_workflow_report_phase_status` | deferred-rehoming | **Yes** — blocked |
| `run_workflow_runtime_probe` | deferred-rehoming | **Yes** — blocked |
| `workflow_generate_prompt` | deferred-rehoming | **Yes** — blocked (U-Q2) |

**Totals under `LOOP_RECORDS_VIA_CLI=1`:** MCP surface = 11 residue (3 `mastra_*` + 8 `run_*`). Default (no opt-out) = 36 `mastra_*` + 8 `run_*` = 44.

## 2. PRs 72–75 — what landed the CLI transport

| PR | Branch | Landed |
|----|--------|--------|
| #72 | `plan-260721-sessionstart-steering-injection…` | slim context surfaces + JIT contracts (steering, not transport — foundation) |
| #73 | `plan-260721-1933-cli-transport-phase1-read-only-slice` | CLI Transport **Phase 1** — read-only `bin/loop.mjs` (the 7-read slice) |
| #74 | `plan-260722-1103-mcp-read-opt-out-to-cli-r-…` | read-only CLI transport + `LOOP_READS_VIA_CLI=1` MCP read opt-out (R) + W prep |
| #75 | `plan-260722-1343-write-capable-cli-w` | **Write-capable CLI (W)** — `LOOP_RECORDS_VIA_CLI=1` drops full CLI_TOOLS from MCP; write-path gate; review fixes |

Plus the current branch (uncommitted, post-review): plan 260722-2147 — L2 transport-capability criterion (runtime-contract.md) + L3 drift-test enforcement (covers the 8 `run_workflow_*` blind spot + reason tags) + 5 aux + 2 workflow-write-helpers reclassified to CLI + portable-six deferral finding + U-Q3 (workflow-registry dead refs).

## 3. What's left to finish MCP→CLI — 7 deferred-rehoming tools, two independent work streams

**Simplification insight:** the 7 deferred tools collapse to **2 distinct work streams** with different blockers. Don't treat them as one blob.

### Stream A — `workflow_generate_prompt` (1 read): blocked on U-Q2 only

- **What:** stateless blueprint lookup. `BLUEPRINTS` map reads `tools/learning-loop-mastra/tools/handlers/references/prompt-blueprints*.md` relative to `resolveRoot()`.
- **Blocker (U-Q2 — cross-root resolution):** under MCP the server runs in the loop repo (root = loop repo, blueprints found). Under CLI, `resolveRoot()` = the runtime root / `GATE_ROOT`. For `.claude` (the loop repo) it works; for a **non-loop runtime** (`LOOP_READS_VIA_CLI=1` + `GATE_ROOT=product repo`) the blueprints aren't under that root → soft error `{error:true,message:"Blueprint file not found"}`.
- **Fix direction:** resolve blueprints against the **loop package install path** (e.g. `import.meta.url`-relative from the handler, or a `LOOPS_PACKAGE_ROOT` resolved from the module location), NOT the runtime root. Then add `workflow_generate_prompt` to `CLI_READ_TOOLS`, add to drift-test CLI_TOOLS, remove from MCP_RESIDUE.
- **Already fixed (this session):** the stale `BLUEPRINTS` paths pointing at the folded `learning-loop-mcp` subtree (finding `meta-260723T1126Z-workflow-generate-prompt-returned-error-true-message-bluepri`). The tool now works under the loop repo root. Only cross-root remains.
- **Regression test exists:** `__tests__/workflow-generate-prompt-tool.test.js` (pins every blueprint category resolves).

### Stream B — 6 `run_workflow_*` execution tools: blocked on Sec-F9 + U-Q1

- **What:** `run_workflow_{classify_prompt, prepare_runtime_request, self_improvement, intentional_skip, report_phase_status, runtime_probe}`. All are **pure functions** (verified: no `resolveRoot`/fs/records/state deps — they import only `zod`, `createLoopWorkflow`, `stripEnvelope`). So **U-Q2 does NOT apply** to these six.
- **Blocker 1 (Sec-F9 — CLI dispatch path, the real work):** `bin/loop.mjs` resolves tool schemas **only** from `tools/manifest.json` (`resolveToolByBareName`, `MANIFEST_PATH`). The `run_workflow_*` are **NOT in manifest.json** — they're synthesized by `convertWorkflowsToTools` (`mastra/server.js:170+`) from `mastra/workflows-manifest.json` as `run_<wf.id>`. So the CLI cannot dispatch them today. Re-homing requires:
  1. A CLI-side workflow-tool resolution path in `bin/loop.mjs`: load `workflows-manifest.json`, build each `run_<wf.id>` tool with its schema **via the same `createLoopWorkflow` normalization** the MCP path uses, and dispatch.
  2. A parallel `LOOP_RECORDS_VIA_CLI` opt-out branch in `convertWorkflowsToTools` (`server.js:170+`) that drops the re-homed `run_workflow_*` from MCP — today that function has no opt-out (only the MANIFEST loop at `server.js:71` does). This is the literal Sec-F9 gap.
- **Blocker 2 (U-Q1 — schema normalization):** `createLoopWorkflow` (`mastra/create-loop-workflow.js`) normalizes each workflow via `attachParityJSONSchema` + envelope strip. The CLI dispatch path must reuse that normalization (shared pre-handler or per-tool), NOT duplicate it, so MCP and CLI expose byte-identical schemas.
- **Blocker 3 (P-Q2 — ordering enforcement):** multi-step workflow execution must keep step-success **gate-observed** (not agent-asserted). Confirm the CLI dispatch path preserves the ordering mechanism the MCP path uses. (Likely already satisfied for these 6 — they're single-step prompt/planning tools, not multi-step orchestrations — but verify per tool before re-homing.)
- **Fix direction (unlocks all 6 at once):** build the CLI workflow-tool dispatcher in `bin/loop.mjs` + the `convertWorkflowsToTools` opt-out branch. Then add the 6 to `CLI_WRITE_TOOLS` (or a new `CLI_WORKFLOW_TOOLS` set), update drift test + subset-registration test, remove from MCP_RESIDUE. One work stream, six tools.

### Irreducible MCP surface after both streams (4 tools — by design, not deferred)

`run_workflow_storage_round_trip`, `run_workflow_storage_read` (server-state singleton DB), `update_r2_allowlist` (operator-policy), `check_runtime_agnostic` (agent-facing). These stay MCP permanently. The L2 criterion (`docs/runtime-contract.md` § "Transport capability") documents why.

## 4. Recommended next-session execution order

1. **Stream A first (smaller, isolated):** fix `workflow_generate_prompt` cross-root blueprint resolution → re-home to `CLI_READ_TOOLS`. ~half-day. Unblocks 1 tool, validates the cross-root pattern.
2. **Stream B (the real lift):** CLI workflow-tool dispatcher + `convertWorkflowsToTools` opt-out + U-Q1 normalization reuse. ~1-2 days. Unlocks 6 tools. This is the bulk of "finish MCP→CLI."
3. After both: MCP residue = 4 irreducible tools. Update `docs/runtime-contract.md` "Write-capable CLI transport" residue wording (currently says "workflow / storage / allowlist / audit + auxiliary read-ish tools" — stale once workflow tools re-home).

## 5. Open findings / loose ends to track

| id | subtype | status | note |
|----|---------|--------|------|
| `meta-260723T0813Z-six-portable-workflow-tools-…` | portable-six-rehoming-deferred | open | the 6 deferred — close when Stream B lands |
| `meta-260723T1126Z-workflow-generate-prompt-…` | stale-blueprint-path-after-package-fold | open | path fixed; close when Stream A re-homes it |
| `meta-260723T0814Z-skill-and-reference-docs-…` | stale-skill-doc-reference-to-deleted-tools | open | Phase 5 follow-up: skill-doc hygiene pass (deleted-tool refs in `skills/coordination-gate/SKILL.md` + `tool-selection-guide.md`). Separate from MCP→CLI. |
| `meta-260721T0809Z-transport-diversification-to-a-cli-…` | transport-diversification-gated | open/resolved | the original "CLI transport is a deferred decision" finding — now overtaken by PRs 73-75; consider superseding it. |

## 6. Key files for the next session

- `tools/learning-loop-mastra/core/cli-tools.js` — the CLI sets (single source of truth).
- `tools/learning-loop-mastra/__tests__/cli-write-tool-set-drift.test.js` — `MCP_RESIDUE` Map + the membership/disjoint/reason-tag guards (update on every re-home).
- `tools/learning-loop-mastra/bin/loop.mjs` — CLI dispatcher; **Stream B adds a workflow-tool resolution path here**.
- `tools/learning-loop-mastra/mastra/server.js:71` (MANIFEST opt-out) + `:170+` (`convertWorkflowsToTools` — **Stream B adds the opt-out branch here**).
- `tools/learning-loop-mastra/mastra/create-loop-workflow.js` — U-Q1 normalization (`attachParityJSONSchema` + envelope strip) to reuse.
- `tools/learning-loop-mastra/mastra/workflows-manifest.json` — the 8 workflow entries.
- `tools/learning-loop-mastra/tools/handlers/workflow-generate-prompt-tool.js` — Stream A; `BLUEPRINTS` map + `resolveRoot` (cross-root fix).
- `docs/runtime-contract.md` § "Transport capability" + "Write-capable CLI transport" — the L2 criterion + residue wording to update.

## 7. Unresolved questions for the next session

- **Stream A root strategy:** resolve blueprints via `import.meta.url`-relative path (handler knows its own location) vs. a `LOOPS_PACKAGE_ROOT` env var. The former is self-contained; the latter mirrors `GATE_ROOT`. Pick one — `import.meta.url`-relative is simpler and removes the runtime-root dependency entirely.
- **Stream B tool set:** add the 6 to `CLI_WRITE_TOOLS` (existing set) vs. a new `CLI_WORKFLOW_TOOLS` set. They're execution tools (some are read-ish, e.g. `classify_prompt`), so a dedicated set may be cleaner than overloading WRITE. Decide during planning.
- **P-Q2 per-tool:** confirm each of the 6 is single-step (no gate-observed ordering needed) before re-homing; if any is multi-step, it stays deferred until P-Q2 is resolved for it.
- **`meta-260721T0809Z` (transport-diversification-gated):** supersede it with a change-log pointing at PRs 73-75 as the resolution? It's now historical noise.