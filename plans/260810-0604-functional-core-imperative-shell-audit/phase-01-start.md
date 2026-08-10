---
phase: 1
title: "Evidence audit"
status: completed
priority: P1
effort: "2-4h"
dependencies: []
---

# Phase 1: Evidence audit

## Overview

Collect and reconcile source, filesystem, manifest, configuration, and test evidence against the general Functional Core / Imperative Shell principle. This phase is read-only and produces the audit report; it does not alter implementation or documentation.

## Requirements

- Functional: distinguish framework/dependency purity from effect purity.
- Functional: identify pure primitives/evaluators and I/O-owning core facades.
- Functional: classify the CLI, Mastra shell, handlers, hooks, and runtime interface by actual responsibilities.
- Functional: inspect placement and filesystem topology, including explicit exceptions and generated artifacts.
- Non-functional: distinguish documented invariants from mechanically enforced invariants.
- Non-functional: preserve the approved scope and report unknowns rather than infer unsupported conclusions.

## Architecture

Use the research-informed model as the audit lens:

```text
external world -> imperative shell -> functional core -> imperative shell -> external world
```

The repository's declared three-layer model remains the starting map, but “shell” is a responsibility classification, not only a directory name:

1. **Functional core candidates:** `tools/learning-loop-mastra/core/` pure primitives/evaluators and any pure portions of facades.
2. **Imperative shells/adapters:** `bin/loop.mjs`, `mastra/`, `tools/handlers/`, `hooks/universal/`, and runtime-local hook/config surfaces, classified by actual I/O and orchestration.
3. **Runtime interface:** `.claude/`, `.factory/`, `.mastracode/`, and `interface/` contract/validator.

Trace dependency direction from each shell toward core. Separately trace effects (filesystem, process, environment, framework, database, protocol) so a framework-independent but effectful facade is not incorrectly called pure.

## Related Code Files

- Read: `AGENTS.md`
- Read: `docs/loop-engine.md`
- Read: `docs/architecture.md`
- Read: `docs/runtime-contract.md`
- Read: `tools/learning-loop-mastra/core/README.md`
- Read: `tools/learning-loop-mastra/docs/placement.md`
- Read: `tools/learning-loop-mastra/bin/loop.mjs`
- Read: `tools/learning-loop-mastra/mastra/`
- Read: `tools/learning-loop-mastra/tools/handlers/`
- Read: `tools/learning-loop-mastra/hooks/universal/`
- Read: `tools/learning-loop-mastra/interface/`
- Read: `.claude/`, `.factory/`, `.mastracode/`, and root MCP config
- Read: `tools/learning-loop-mastra/core/placement.yaml`
- Read: architecture, boundary, and parity tests under `tools/learning-loop-mastra/__tests__/`
- Read: `plans/reports/research-260810-0614-functional-core-imperative-shell.md`
- Create/update only: this plan directory and the audit report under `plans/reports/`; no source files are modified.

## Implementation Steps

1. Establish the research-informed Functional Core / Imperative Shell definition and compare it with the repository's FCIS wording.
2. Inspect core production imports, filesystem effects, placement roles, and surviving boundary tests.
3. Verify the missing historical whole-core FCIS guard and inventory narrower surviving guards; do not treat its absence as an implementation defect to fix within this audit.
4. Inspect `bin/loop.mjs`, `mastra/server.js`, `mastra/handler-adapter.js`, `mastra/with-r2-gate.js`, and representative handlers/hooks to classify shell responsibilities and dependency direction.
5. Inspect runtime configs, hook shims/direct wiring, MCP wiring, manifests, and mirrored skills for filesystem/documentation alignment.
6. Compare tracked source topology with generated/runtime artifacts such as data, coverage, logs, and markers.
7. Record evidence by path and line, separating: conformances, concrete gaps, mixed boundaries, missing enforcement, and unresolved design questions.
8. Run final read-only status/diff check and ensure no files outside the plan/report scope changed.

## Success Criteria

- [x] Core framework/dependency independence is verified by source and surviving tests.
- [x] Core effect placement is classified separately, including I/O-owning facades.
- [x] CLI classification is explicit and supported by its I/O/delegation/serialization/exit path.
- [x] Mastra shell, handler substrate, universal hooks, and runtime interface are classified separately.
- [x] Filesystem topology is compared against docs, manifests, configs, and tests.
- [x] Historical missing guard and current narrow guards are both reported accurately.
- [x] Any test failure, warning, unavailable check, or contradictory evidence is reported without suppression.
- [x] Unresolved questions are listed; no implementation is started.

## Risk Assessment

- **Terminology mismatch:** the repository's FCIS shorthand may mean “framework-independent core,” while external FCIS guidance also cares about effects. Mitigation: report both dimensions and do not force a single binary verdict.
- **Mixed core facades:** registry/state/logging code may intentionally live in `core/` despite performing I/O. Mitigation: classify each representative module by actual effects and documented role.
- **Mixed handler layer:** `tools/handlers/` may combine transport adapters with I/O-owning behavior. Mitigation: classify by imports and side effects rather than directory name alone.
- **Generated/untracked artifacts:** data, coverage, logs, and runtime markers may make the filesystem look noisier than tracked architecture. Mitigation: distinguish tracked source topology from runtime artifacts.
- **Read-only test side effects:** project test commands may seed indexes or write logs. Mitigation: prefer static checks and targeted tests; inspect command behavior and report checks that are not side-effect-free.
