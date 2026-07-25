---
title: "Portable-six workflow re-home: MCP workflows unwrapped to CLI manifest handlers"
date: 2026-07-25 16:31
branch: plan/260725-1439-portable-six-workflow-tools-rehome-mcp-to-cli
plan: plans/260725-1439-portable-six-workflow-tools-rehome-mcp-to-cli
status: completed
tags: [cli-transport, mcp, workflows, cutover, oracle-fixtures, guardrails]
---

# Portable-six re-home: 6 workflow tools moved from Mastra wrapper to plain handlers

## Context

Six portable workflow tools (`classify_prompt`, `prepare_runtime_request`,
`self_improvement`, `intentional_skip`, `report_phase_status`,
`runtime_probe`) were registered as Mastra workflows behind a
`createLoopWorkflow` wrapper — paying the workflow-engine cost for logic
that never used workflow features. Plan `260725-1439` re-homed them to plain
manifest handlers (Option A unwrap), executable from both MCP and the CLI.

## What happened (chronological)

1. **Unwrap contract.** New `core/workflow-input-schema.js` with shared
   `wrapWorkflowInputSchema` (the U-Q1 contract), plus 6
   `tools/handlers/workflow-*-tool.js` modules. Phase-1 probes and oracle
   fixtures (`__tests__/fixtures/workflow-oracles/`) captured **pre-deletion**
   so the parity test could survive removing the source files.
2. **Cutover.** `tools/manifest.json` +6, `workflows-manifest.json` −6 (2
   storage workflows remain), `CLI_WRITE_TOOLS` +6, 6 workflow files deleted.
   MCP surface: 37→43 `mastra_*`, 8→2 `run_workflow_*`. Finding Sec-F9
   dissolved by removal — the `convertWorkflowsToTools` branch no longer
   exists.
3. **Caller rename.** `run_workflow_*` → `mastra_workflow_*` across the
   11-site set; server-runid coverage relocated to
   `run_workflow_storage_round_trip`. Phantom `MIGRATED_TOOL_NAMES` constant
   dropped in favor of a real per-tool oracle parity test.
4. **Post-cutover guardrails.** 20 distinct failures across 5 files caught
   by count constants (manifest 36→42, workflows 8→2, surface 37→43),
   SessionStart arg sketches, MCP wire budget, and `placement.yaml` — **not**
   by the drift test. New guards: `workflow-unwrap-parity`,
   `cli-workflow-dispatch`, `no-stale-portable-six-refs`. The Phase-1 probe
   file (which read its subject files) was retired and rewritten as a durable
   handler-purity guard.
5. **Registry.** Change-log `meta-260725T1612Z-...` logged; finding
   `meta-260723T0813Z-...` resolved (branch ref, PR pending); sibling
   generate-prompt finding stays open; file index refreshed on 10 paths.

## Verification

- Full vitest suite green: **278 files / 2509 tests**.
- Fallow gate exit 0 (re-baselined after the rename + pin lift).
- `check_runtime_agnostic` baseline established; manifest-registered check
  found inherited-broken — filed as finding `meta-260725T1611Z-...`, not a
  regression from this work.

## Reflection

The big lesson: **the drift test was not the guardrail of record.** Twenty
post-cutover failures were caught by five different enumerations — count
constants, arg sketches, wire budget, placement — each blind to the others.
Assuming one test owns a cutover is how silent drift ships. Enumeration beats
guardrail-of-record assumptions every time.

Second: **probe tests that read their subject files must die with those
files.** The Phase-1 probe imported the workflow modules it probed; deleting
the workflows would have deleted the guard. Converting it into a
handler-purity guard kept the protection without the dependency.

Third: **fixture-as-oracle works.** Capturing oracle output pre-deletion let
the parity test prove behavioral equivalence after the live objects were
gone. Never import the live object in a test meant to outlive it.

## Next steps

- PR for the branch (finding `meta-260723T0813Z-...` resolves on merge).
- Sibling generate-prompt finding remains open — not in this plan's scope.
- Triage the inherited-broken `check_runtime_agnostic` finding
  (`meta-260725T1611Z-...`) separately.

## Publishing

AgentWiki publish skipped — local-only entry per request. Local journal file
is the source of truth.
