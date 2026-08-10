---
title: "Research: Functional Core / Imperative Shell"
type: research-report
date: 2026-08-10
status: complete
scope: read-only architectural research for learning-loop audit
---

# Research: Functional Core / Imperative Shell

## Executive Summary

The Functional Core / Imperative Shell (FCIS) pattern separates deterministic domain computation from effects and orchestration. The core should transform explicit inputs into explicit outputs, remain independent of I/O, frameworks, protocols, clocks, randomness, and infrastructure, and be tested primarily with fast direct tests. The shell receives external input, performs I/O, coordinates calls into the core, handles process-level errors, and applies returned effects.

A CLI is an imperative shell when it parses arguments or input, resolves and dispatches commands, reads or writes files, manages process identity/environment, serializes output, and maps errors to exit codes. A stateless CLI can still be a shell: statelessness means it does not retain correctness-critical process state, not that it is functional. The CLI's responsibility is orchestration and transport; the command/domain transformations it invokes may belong in the functional core.

The current repository is substantially aligned with this pattern, but it uses a narrower FCIS claim in places: `core/README.md` specifically forbids `@mastra/*` imports, while the broader FCIS principle also asks whether core modules perform I/O and whether shell concerns leak inward. The existing architecture intentionally contains I/O-owning facades inside `core/`, so the audit must distinguish “framework-independent functional core” from “strictly side-effect-free functional core.” The CLI should be audited as a second imperative shell alongside the Mastra shell, not treated as core merely because it reuses core modules.

## Research Methodology

- Date: 2026-08-10.
- Sources consulted: 4 external sources/pages plus repository source and tests.
- Primary terms: `functional core imperative shell`, purity, side effects, CLI shell, dependency direction, testability, adapters.
- Evaluation criteria: explicit definition of core/shell responsibilities; side-effect boundary; dependency direction; CLI classification; testing implications; applicability to this repository.
- Recency: the architectural principle is stable and historical; current material was used where available, but the audit applies the principle rather than a versioned framework API.

## Working Definition

### Functional core

A module belongs in the functional core when its meaningful behavior can be expressed as deterministic transformation of explicit data into explicit data, without directly performing external effects. Typical core responsibilities include:

- Domain rules and state transitions.
- Parsing/normalization when it is deterministic and does not depend on external state.
- Validation and classification.
- Computing decisions, plans, diffs, or effect descriptions.
- Returning structured success/failure values rather than deciding process/UI behavior.

A core may depend on small pure libraries and other core modules. It should not depend inward on shells, runtime protocols, framework primitives, concrete storage, environment variables, process arguments, current time, randomness, terminal output, or filesystem/network/database effects.

### Imperative shell

A shell is the boundary that owns effects and orchestration:

- Receives external input (CLI argv/stdin, MCP requests, hook protocol, HTTP, UI events).
- Reads environment/process/runtime context.
- Performs filesystem, database, network, logging, or terminal effects.
- Calls core functions and coordinates multiple steps.
- Applies core-produced commands/effects.
- Maps errors/results into transport responses, logs, and exit codes.

The dependency direction is outward-to-inward for calls and inward-to-outward for returned effects:

```text
external world -> shell -> core -> shell -> external world
```

The core must not invoke the shell. A shell may import and call core; multiple shells may reuse the same core.

### CLI classification

A CLI is an imperative shell when it owns any of the following, even if each invocation is one-shot:

- `process.argv` parsing and usage errors.
- JSON/file input loading.
- Environment/runtime identity pinning.
- Dynamic module resolution and dispatch.
- Serialization to stdout/stderr.
- Process exit codes.
- R2/write authorization wrapping.

The CLI can expose functional-core operations, but its transport and process responsibilities remain shell responsibilities. “Stateless” does not change the classification; it only limits retained process state.

## Comparison with the Repository

### Strong alignment

1. `AGENTS.md` and `docs/architecture.md` define a one-way three-layer model: core, Mastra shell, and runtime interface.
2. `core/README.md` states the framework boundary directly: core has zero `@mastra/*` imports; shell may import core.
3. `tools/learning-loop-mastra/bin/loop.mjs` is visibly an imperative shell: it reads argv/files, loads the manifest, resolves handlers, validates input, pins runtime identity, wraps execution, serializes output, and assigns exit codes.
4. `mastra/server.js` and `mastra/create-loop-*.js` are imperative shells around handlers/core and own Mastra framework integration.
5. Universal hooks are boundary adapters: they parse runtime protocol input, read process/filesystem context, call core evaluators, and emit runtime-specific protocol output.
6. Handlers generally depend inward on core, while `manifest-loader.js` centralizes the handler-resolution seam. The CLI and Mastra server reuse `adaptLegacyHandler` and `withR2Gate` rather than duplicating tool semantics.
7. `core/placement.yaml` plus `placement-manifest.test.js` machine-checks core file membership, role taxonomy, and selected role-layering constraints.
8. Runtime contract validators and parity tests verify runtime wiring separately from core logic.

### Important qualification: the repository's “core” is not uniformly pure

The broad FCIS definition and the repository's current `core/` directory are not identical. Several modules in `core/` are classified as facades and perform I/O or coordinate state, for example:

- `core/meta-state.js` reads/writes registry files.
- `core/runtime-state.js` reads/appends runtime-state substrates.
- `core/gate-decision-log.js` appends decision logs.
- `core/inbound-state.js`, `core/file-readers.js`, and related gate facades read runtime state.

This is not automatically an architectural defect: the repository documents `core/` as “functional” in the sense of framework-independent policy/logic and explicitly includes facades. But under strict FCIS terminology, these are effectful core-adjacent services or functional-core-plus-I/O facades, not pure functional-core modules. The audit must therefore report two dimensions:

- **Framework/dependency purity:** no Mastra/runtime-shell dependency enters core.
- **Effect purity:** whether a given core module performs I/O or other effects.

Collapsing these dimensions into one “FCIS pass” would hide a meaningful boundary choice.

### Mixed-boundary risks to inspect

- A core facade that both computes policy and writes a substrate may make direct pure testing harder and blur the shell boundary.
- A handler can be transport-neutral while still being effectful; absence of `@mastra/*` is not proof of full functional purity.
- A CLI can reuse core facades and still be an imperative shell; reuse does not move its argv/I/O/serialization responsibilities into the core.
- Dynamic manifest loading is shell orchestration; the core should receive resolved data or expose pure resolution logic separately from the loader's filesystem/module effects.
- Hook implementations combine protocol I/O with core evaluators. Their adapter role is healthy if policy remains in core and hook-specific behavior stays at the edge.
- A placement manifest that only covers `core/` production files does not by itself prove the entire repository's shell/core boundary; shell and handler topology need separate checks.

## Implications for the Audit Contract

The audit contract should use the corrected term **Functional Core / Imperative Shell**, not “FSIC.” It should explicitly evaluate:

1. **Boundary purity:** framework/runtime dependency direction into core.
2. **Effect placement:** which core modules are pure primitives/evaluators versus I/O-owning facades.
3. **Shell classification:** CLI, Mastra server/factories, handlers, universal hooks, and runtime-local adapters.
4. **Filesystem topology:** whether paths/manifests/tests communicate and enforce the intended separation.
5. **Test adequacy:** whether broad whole-core purity is mechanically guarded or only narrower module-specific checks survive.

The previous repository evidence found that the historical `fcis-invariant.test.js` was deleted during the Vitest migration, while the current placement and narrower FCIS tests remain. This is relevant to test adequacy, not proof that the architecture is wrong.

## Recommendations for the Plan and Preflight

- Keep the audit read-only and avoid proposing a refactor as an acceptance requirement.
- Add a classification table with columns: surface, external effects, core imports, shell imports, responsibility, and verdict.
- Separate “strict pure core” from “framework-independent core facades” in the final findings.
- Treat the CLI as an imperative shell by default, then verify whether any domain logic is improperly embedded in it.
- Include a test-coverage gap check: confirm whether a whole-core no-framework-import test is absent and identify the surviving narrower guards.
- Run focused static/parity tests and report warnings/failures; do not claim a full purity proof from passing placement/runtime tests.

## Resources & References

1. Functional Architecture, “Functional Core, Imperative Shell” — definition, dependency direction, and CLI-like input/dispatch classification: <https://functional-architecture.org/functional_core_imperative_shell/>
2. Deska, “Functional Core, Imperative Shell: A Pattern for Testable Systems” — purity, effects, CLI responsibilities, structured errors, and testing guidance: <https://deska.dev/blog/functional-core-imperative-shell>
3. K. Bilsted, `Functional-core-imperative-shell` GitHub README — immutable core, mutation/I/O shell, and test distribution guidance: <https://github.com/kbilsted/Functional-core-imperative-shell/blob/master/README.md>
4. Google Testing Blog, “Simplify Your Code: Functional Core, Imperative Shell” — search result confirms the practical motivation of isolating database/network/external interactions from core logic; page body was not available to the fetcher: <https://testing.googleblog.com/2025/10/simplify-your-code-functional-core.html>
5. Repository concept/mechanism sources: `docs/loop-engine.md`, `docs/architecture.md`, `docs/runtime-contract.md`, `AGENTS.md`, `tools/learning-loop-mastra/core/README.md`, and `tools/learning-loop-mastra/docs/placement.md`.

## Unresolved Questions

- Is the project intentionally using “functional core” to mean framework-independent policy core, including I/O-owning facades, or should strict effect purity eventually become a separate architectural target?
- Should the CLI's shell boundary be represented explicitly in the repository's three-layer documentation, which currently names the Mastra shell but treats the CLI primarily as a transport?
- Should a whole-core no-framework-import regression guard be restored after its historical deletion, or are the surviving narrower guards the intended maintenance trade-off?
- Is `tools/handlers/` a stable fourth architectural layer (transport-neutral imperative adapters), or a legacy substrate exception that should be named more directly?
