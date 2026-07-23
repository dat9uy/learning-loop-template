# 2026-07-23 — L2 transport-capability criterion + L3 drift-test enforcement + portable-six re-homing deferral

Plan: `plans/260722-2147-l2-transport-capability-criterion-l3-drift-test-enforcement-portable-six-re-homing-deferral/`

## Summary

Landed the durable output of two prior analyses (the L2 transport-capability
criterion + the per-workflow audit). Five phases:

1. **L2 contract section** — added `## Transport capability (per function)` to
   `docs/runtime-contract.md`. Stateless-by-default = transport-capable; the four
   override tags (`server-state`, `operator-policy`, `agent-facing`,
   `deferred-rehoming`) are exhaustive. Capability ≠ wiring, with an explicit
   Axis A / Axis B split. Fixed stale "16 tools" count at lines 26 + 40 (and
   the § Write-capable CLI entry) to a dereferenced `CLI_WRITE_TOOLS` phrase so
   it does not re-stale when the set grows. Change-log id
   `meta-260723T0811Z-docs-runtime-contract-md`.

2. **L3 drift-test enforcement** — `cli-write-tool-set-drift.test.js` now reads
   `workflows-manifest.json` alongside `tools/manifest.json` (closing the
   8-tool blind spot). `MCP_RESIDUE` is `new Map([...])` with declared reasons
   ∈ {`server-state`, `operator-policy`, `agent-facing`, `deferred-rehoming`};
   an untagged entry fails the test. Reclassified 8 tools
   (3 workflow helpers + 5 aux-read-ish) from MCP into `CLI_TOOLS` per the L2
   criterion. `core/cli-tools.js` header now cites the L2 section and frames
   `pathFields: []` correctly as **R2 path-ownership bypass** (not statelessness
   — they're independent properties; `update_r2_allowlist` is the proof).
   `notify_artifact` `path` arg now validated in-handler against `records/**`
   (Q1 fix; the CLI hardcodes `pathFields: []` so in-handler is required).
   `check_runtime_agnostic` correctly tagged `agent-facing` (Q2 keep-MCP),
   not `operator-policy`. Updated `cli-mcp-subset-registration.test.js`
   (assertion counts widened 7→13 reads; residue list shrunk 10→2) and
   `cli-write-tool-set.test.js` (added `EXPECTED_WRITE_TOOLS` entries,
   inverted the "aux stay out of CLI_TOOLS" test).

3. **Portable-six re-homing deferral** — recorded as finding
   `meta-260723T0813Z-six-portable-workflow-tools-are-cli-capable-in-principle-but`.
   Schema: `category: mcp-tool-missing`, `severity: warning`,
   `subtype: portable-six-rehoming-deferred`, `affected_system: mcp-tools`.
   Captures U-Q1 (unwrap contract for `createLoopWorkflow` schema
   normalization), U-Q2 (`resolveRoot` blueprint-path wiring under the
   `learning-loop-mcp` subtree), P-Q2 (gate-observed step-success ordering
   prerequisite), and the Sec-F9 opt-out gap at `server.js:187`. No
   re-homing code committed; the drift test cites this id via reason tag
   in the `MCP_RESIDUE` Map for each of the 6 portable tools.

4. **WORKFLOW_REGISTRY dead refs resolved** — vacated
   `recommended_tools: []` for all 3 entries (deleting the field would crash
   `def.recommended_tools.join(...)` in `trigger-workflow-tool.js`, so the
   field stays and is `[]`). Added `?? []` guard in `evaluateTriggers` and
   `trigger-workflow-tool.js` for defense-in-depth. Updated
   `core/workflow-registry.test.js` to expect `[]` and renamed tests to
   "(recommendations are vacated)". Filed finding
   `meta-260723T0814Z-skill-and-reference-docs-reference-tools-that-were-deleted-i`
   for the stale skill-doc references (per Q3: do NOT edit the docs in this
   plan; a separate skills-hygiene pass owns them). Change-log id
   `meta-260723T0815Z-tools-learning-loop-mastra-core-workflow-registry-js`.

## Acceptance criteria

- [x] L2 section in `docs/runtime-contract.md` with rule + capability≠wiring +
      4-tag override taxonomy + 3-homes cross-ref.
- [x] Drift test covers both manifests; an unclassified `run_workflow_*`
      fails the test.
- [x] `MCP_RESIDUE` is `new Map([...])`; every entry tagged from the
      approved set; untagged fails.
- [x] Reclassified 8 tools in `CLI_TOOLS`; 10 irreducible entries remain in
      `MCP_RESIDUE` with their reasons.
- [x] Both downstream tests updated; both green.
- [x] `notify_artifact` in-handler `records/**` validation.
- [x] `core/cli-tools.js` header cites L2 criterion; `pathFields: []` framed
      as R2 bypass.
- [x] Portable-six finding with valid schema; verified via
      `meta_state_list`; no re-homing code committed.
- [x] `WORKFLOW_REGISTRY.recommended_tools` vacated to `[]` (fields NOT
      removed); `?? []` guard added; tests updated; stale skill-doc refs
      filed as a finding (NOT edited — Q3); change-log logged; tests green.
- [x] `pnpm test` green: 269 files, 2465 tests pass (1 skipped).

## Risks

- Reclassification drops 6 workflow helper + 5 aux tools from MCP for
  `.claude` under `LOOP_RECORDS_VIA_CLI=1`. Rollback is **a targeted code
  revert** of the specific entry out of `CLI_TOOLS` back to `MCP_RESIDUE` —
  NOT a `LOOP_RECORDS_VIA_CLI=0` flip, which would restore all tools and
  re-open the split-brain W closed.
- `CLI_READ_TOOLS` widening affects both `LOOP_READS_VIA_CLI=1` and
  `LOOP_RECORDS_VIA_CLI=1` opt-outs. No runtime sets reads-only alone today
  (`cli-optout-wiring.test.js` confirms).
- The 6 portable-six re-homing is **deliberately deferred** — recorded as
  a finding citing U-Q1/U-Q2/P-Q2/Sec-F9 prerequisites. A separate
  evidence-driven plan owns the unwrap; no code change here.

## Cross-references

- Change-log: `meta-260723T0811Z-docs-runtime-contract-md`
- Change-log: `meta-260723T0815Z-tools-learning-loop-mastra-core-workflow-registry-js`
- Finding (deferral): `meta-260723T0813Z-six-portable-workflow-tools-are-cli-capable-in-principle-but`
- Finding (stale refs): `meta-260723T0814Z-skill-and-reference-docs-reference-tools-that-were-deleted-i`
- Audit source: `plans/reports/ak-problem-solving-260722-2125-workflow-tool-transport-home-audit.md`
- L2 analysis: `plans/reports/ak-problem-solving-260722-2050-l2-transport-capability-criterion.md`
- L1 baseline: `docs/loop-engine.md § Workflow: definition vs execution` (precedent change-log
  `meta-260722T2125Z-docs-loop-engine-md`)
- W T2 gate evidence: `plans/260722-1343-.../plan.md (completed)` +
  `.mcp.json:8` + `__tests__/cli-optout-wiring.test.js:26-28`
