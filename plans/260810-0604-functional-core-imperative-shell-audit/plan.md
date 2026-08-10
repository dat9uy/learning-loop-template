---
title: "Functional Core / Imperative Shell Audit"
description: "Read-only audit of the learning loop against the general Functional Core / Imperative Shell principle, including CLI classification and filesystem topology."
status: pending
priority: P1
effort: "2-4h"
tags: [audit, architecture, functional-core, imperative-shell, cli]
created: 2026-08-10
---

# Functional Core / Imperative Shell Audit

## Overview

Determine whether the current learning loop follows the general Functional Core / Imperative Shell (FCIS) principle in both code and filesystem topology. The audit treats the CLI as an imperative shell candidate alongside the Mastra shell, then separates two questions that the repository currently compresses into one FCIS shorthand: framework/dependency purity and effect placement.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Verify framework/dependency purity and inward dependency direction | P1 |
| 2 | Identify pure core logic versus I/O-owning core facades | P1 |
| 3 | Classify the CLI, Mastra server/factories, handlers, hooks, and runtime adapters | P1 |
| 4 | Compare filesystem topology with docs/contracts/manifests/tests | P1 |
| 5 | Produce evidence-backed code, effect-placement, and filesystem verdicts | P1 |

## Scope

### In scope

- `tools/learning-loop-mastra/core/` imports, side effects, placement taxonomy, and boundary tests.
- `tools/learning-loop-mastra/bin/loop.mjs` as a stateless imperative CLI shell.
- `tools/learning-loop-mastra/mastra/`, `tools/handlers/`, `hooks/universal/`, and runtime interface adapters.
- `AGENTS.md`, `docs/loop-engine.md`, `docs/architecture.md`, `docs/runtime-contract.md`, and placement docs.
- Manifest/config/test evidence and read-only verification commands.
- Adequacy of broad versus narrow enforcement, including the deleted whole-core FCIS regression guard.

### Out of scope

- Code, documentation, plan, registry, or configuration changes outside this audit plan/report.
- Refactoring, restoring tests, or selecting a target architecture.
- Product-surface redesign, deployment, external services, or secret inspection.
- Treating a recommendation as an implementation requirement.

## Traceability / acceptance signals

| Audit question | Evidence | Acceptance signal |
|---|---|---|
| Is core framework/dependency-independent? | Core imports + surviving FCIS-related tests | No forbidden inward dependency, or exact violation identified |
| Is core effect-free, or does it contain documented facades? | `core/` filesystem calls, writes, placement roles, module docs | Separate pure-core and I/O-facade classification; no conflation |
| Is dependency direction inward? | CLI/Mastra/handler/hook imports | Shells/adapters depend on core; any reverse edge is identified and explained |
| Is the CLI an imperative shell? | `bin/loop.mjs`, handler adapter, R2 wrapper, argv/JSON I/O | Explicit classification based on external input, orchestration, effects, serialization, and exit behavior |
| Do filesystem paths express the architecture? | Directory inventory, manifests, runtime configs, placement tests | Separate tracked-topology verdict from generated/runtime-artifact noise |
| Are claims mechanically enforced? | Focused tests, validators, static checks, historical test evidence | Distinguish current enforcement from documentation-only intent and missing broad guards |

## Facts / assumptions / decisions

- **Verified fact:** the repository documents an FCIS invariant, but the broader principle distinguishes pure deterministic logic from effectful orchestration.
- **Verified fact:** user approved auditing Functional Core / Imperative Shell generally, with the CLI explicitly in scope.
- **Research-backed working definition:** external input/effects/orchestration belong in imperative shells; deterministic policy and transformations belong in the functional core; dependency direction is external world → shell → core → shell → external world.
- **Verified fact:** `bin/loop.mjs` owns argv/file input, dynamic dispatch, environment/runtime identity, serialization, and exit-code mapping; it is therefore an imperative shell even though it is stateless.
- **Verified fact:** the repository's `core/` includes both pure primitives/evaluators and I/O-owning facades such as registry/runtime-state/logging modules; the audit must report this as a two-dimensional boundary choice, not a binary pass/fail.
- **Verified fact:** the historical whole-core `fcis-invariant.test.js` was deleted during the Vitest migration; narrower FCIS tests remain.
- **User decision:** read-only audit only; no implementation or scope expansion.
- **Assumption to verify:** `tools/handlers/` is an imperative, transport-neutral adapter/substrate boundary rather than part of the strict pure core.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Evidence audit](./phase-01-start.md) | Pending |

## Research reference

- `plans/reports/research-260810-0614-functional-core-imperative-shell.md`

## Success Criteria

- [ ] Report cites concrete repository paths and line ranges for every material conclusion.
- [ ] Framework/dependency purity and effect placement are reported as separate dimensions.
- [ ] CLI is explicitly classified as an imperative shell with rationale from its actual I/O/orchestration path.
- [ ] Mastra shell, handler substrate, universal hooks, and runtime interface are classified separately.
- [ ] Tracked filesystem topology is compared with docs, manifests, configs, and tests; generated artifacts are called out separately.
- [ ] Read-only checks are run where safe, with failures, warnings, missing guards, and limitations reported honestly.
- [ ] Unresolved questions and design trade-offs are listed at the end.
- [ ] No files outside this plan directory and the research report are modified.

<!-- slug: functional-core-imperative-shell-audit -->
