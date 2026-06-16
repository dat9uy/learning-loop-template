---
title: "Fix stale records/observations references after Phase A migration"
description: "Phase A migrated observation YAMLs from records/observations/ to runtime-state.jsonl, but the gate layer, MCP tools, docs, and tests still reference the empty records/observations/ directory. This plan closes that migration gap so package-manager and vendor-api constraints are evaluated against runtime-state.jsonl, while protecting runtime-state.jsonl from direct writes and preserving the records/evidence unlock path."
status: pending
priority: P1
branch: "260614-1259-phase-b-codegen-adoption"
tags: [meta-surface, phase-a, gate-logic, runtime-state, records]
blockedBy: []
blocks: []
created: "2026-06-14T11:56:49.282Z"
createdBy: "ck:plan"
source: skill
---

# Fix stale records/observations references after Phase A migration

## Overview

Phase A of the productization master tracker moved mutable observation state from `records/observations/*.yaml` into `runtime-state.jsonl` (`kind: ledger-event | budget-state`). The `record_observation` MCP tools were deleted and direct writes to `records/observations/` are blocked. However, the bash gate, inbound gate, several MCP tools, and documentation still read from the now-empty `records/observations/` directory via `file-readers.js#readObservations`.

The resulting failure mode is that every constraint match (`package-manager`, `docker`, `sudo`, `vendor-api`) returns `observation_required: true` and blocks the command, because no active observations are found. This hard-blocks Phase C package installs.

This plan finishes the hook-layer migration. It replaces `records/observations/` reads with reads from `runtime-state.jsonl`, protects `runtime-state.jsonl` from direct writes, removes the obsolete `records/evidence/**` unlock (evidence is now meta-state-only), updates downstream tools/docs/tests, and verifies with `pnpm test`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Scope confirmation](./phase-01-scope-confirmation.md) | Completed |
| 2 | [Update gate layer to runtime-state](./phase-02-update-gate-layer-to-runtime-state.md) | Completed |
| 3 | [Update MCP tools](./phase-03-update-mcp-tools.md) | Completed |
| 4 | [Update docs](./phase-04-update-docs.md) | Completed |
| 5 | [Update tests](./phase-05-update-tests.md) | Completed |
| 6 | [Verify](./phase-06-verify.md) | Completed |

## Verification Results

- `pnpm test`: 886 pass, 0 fail, 1 skipped
- `bash-gate.js`: `npm install` → ok (runtime-state authorizes package-manager)
- `bash-gate.js`: `echo x > runtime-state.jsonl` → block
- `bash-gate.js`: `echo x > records/observations/x.yaml` → block
- `write-gate.js`: `Create runtime-state.jsonl` → block
- `grep readObservations tools/learning-loop-mcp/` → no matches (removed from all gate/tool code)

## Dependencies

- Depends on Phase A deliverables: `runtime-state.jsonl`, `schemas/runtime-state.schema.json`, archived `records/_unbound/observation/`.
- Does not require Phase B or C work; this is a Phase A closeout fix.

## Risks

- Authorization boundary shift: `runtime-state.jsonl` is in the project root and currently not write-protected by the bash gate. Must add it to `PATH_WRITE_PATTERNS`.
- Constraint mapping semantics: runtime-state entries have `affected_system`, not `constraint_type`. Need reverse mapping + metadata filtering to avoid trivial bypasses.
- `records/evidence/**` unlock: removed permanently per operator confirmation; evidence is now meta-state-only.
- Concurrency: `runtime-state.jsonl` reads/writes need atomic-write discipline; only MCP tools may create entries.
