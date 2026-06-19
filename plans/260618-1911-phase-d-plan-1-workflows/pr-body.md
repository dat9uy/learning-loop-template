## Phase D Plan 1 — Mastra Workflows Migration (D1+D2+D3)

### Summary

Promotes 8 deterministic `workflow_*` tools from `createTool` to `createWorkflow` wrappers. Ships `createLoopWorkflow` factory mirroring `createLoopTool` parity-shim pattern. Includes per-workflow parity harness (5 factory invariant tests + 8 direct unit parity tests + 9 MCP `run_<key>` integration tests).

### Acceptance gate

All 10 test namespaces pass; 8/8 workflows parity GREEN; cold-session 31 legacy manifest tools register correctly; mastra server `tools/list` enumerates 39 tools (31 `mastra_*` + 8 `run_workflow_*`) with valid inputSchemas.

### Test results

- `pnpm test`: 1080 pass / 0 fail / 1 skipped
- `pnpm test:cold-session`: 7 pass / 0 fail
- `node --test tools/learning-loop-mastra/__tests__/mutex-scope.test.js`: pass
- `node --test tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js`: pass

### Parity matrix

| Workflow | Direct parity | MCP parity | Description match |
|----------|---------------|------------|-------------------|
| `workflow_intake_orient` | ✅ | ✅ | ✅ |
| `workflow_intake_plan` | ✅ | ✅ | ✅ |
| `workflow_classify_prompt` | ✅ | ✅ | ✅ |
| `workflow_prepare_runtime_request` | ✅ | ✅ | ✅ |
| `workflow_self_improvement` | ✅ | ✅ | ✅ (thin stateSchema; multi-step deferred) |
| `workflow_intentional_skip` | ✅ | ✅ | ✅ |
| `workflow_report_phase_status` | ✅ | ✅ | ✅ |
| `workflow_runtime_probe` | ✅ | ✅ | ✅ (thin stateSchema; multi-step deferred) |

### What changed

- **New factory:** `tools/learning-loop-mastra/create-loop-workflow.js`
- **New workflows dir:** `tools/learning-loop-mastra/workflows/workflow-*.js` (8 files, moved from `tools/learning-loop-mcp/tools/`)
- **New manifest:** `tools/learning-loop-mastra/workflows-manifest.json`
- **Updated server:** `tools/learning-loop-mastra/server.js` registers workflows via custom `LoopMCPServer` subclass
- **Updated manifests:** `tools/learning-loop-mastra/tools/manifest.json` (31 entries), `agent-manifest.json` (11 workflow group entries), legacy `tools/learning-loop-mcp/agent-manifest.json` (3 workflow group entries)
- **New tests:** `create-loop-workflow.test.js`, `workflow-direct-parity.test.js`, `workflow-parity.test.cjs`
- **Tracker:** D1/D2/D3 flipped to `[x]` in `plans/reports/productization-260612-1530-master-tracker.md`
- **Audit trail:** `meta_state_log_change` entry filed
- **Journal:** `plans/reports/journal-260618-1911-phase-d-plan-1-shipped.md`

### Out of scope (downstream plans)

- D4 + D7: agents → Plan 3
- D5 + D6: storage → Plan 2 (parallel)
- `agent-manifest.json` 5-group final reconcile → Plan 4 (cutover)
- `§3.10` research report reconciliation → Plan 4
- Multi-step `stateSchema` restructuring for `self_improvement`/`runtime_probe` → Plan 3 (agents) unless Plan 1a is opened

### Verification

```bash
pnpm test
pnpm test:cold-session
```
