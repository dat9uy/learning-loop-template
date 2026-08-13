---
name: fcis-migration
description: Plan and execute migrations or refactors that preserve a Functional Core / Imperative Shell architecture, especially across core logic, framework shells, runtime adapters, hooks, and transports. Use when moving policy out of hooks or adapters, extracting a core module, replacing a framework integration, changing a runtime surface, or designing a staged compatibility migration.
---

# FCIS Migration

Use this skill to keep a migration's seam honest: the Functional Core owns
deterministic decisions and normalized results; imperative shells and adapters
translate native input, perform effects, and encode native output. The goal is
locality and a deep interface, not a new layer of pass-through wrappers.

## 1. Establish the invariant and current behavior

Read the domain glossary and the relevant architecture contracts before
editing. In this repository, start with:

- `tools/learning-loop-mastra/core/README.md` — FCIS authority and placement.
- `docs/loop-engine.md` — deterministic-step, agentic-step, record, rule, and
  promotion roles.
- `docs/architecture.md` and `docs/runtime-contract.md` — current mechanisms
  and runtime obligations.

Then inspect the code and tests at the current callers. Write down:

- native inputs and outputs, including wire-format quirks;
- policy decisions, normalization, validation, and error semantics;
- filesystem, process, network, framework, and runtime effects;
- fail-closed action gates versus intentionally fail-open startup behavior;
- observable behavior that must remain unchanged, and behavior deliberately
  changing in the migration.

Do this characterization before choosing a new module or interface. A parity
test is useful evidence only when its expected behavior comes from an
independent contract or fixture, not from calling the old implementation.

## 2. Place the seam by responsibility

Assign each responsibility to one layer:

| Responsibility | Home |
|---|---|
| Pure/deterministic policy, classification, normalization, and structured decisions | Functional Core |
| Native parsing, framework lifecycle, I/O, process effects, and native output encoding | Imperative Shell / adapter |
| Runtime protocol translation and runtime-owned wiring | Runtime interface adapter |

Keep policy in Core. Hooks and runtime adapters may translate protocol and carry
out a Core decision, but they must not invent a second policy path. Keep native
runtime vocabulary and wire formats private to the adapter; expose the generic
concept and normalized result at the Core interface.

Preserve dependency direction:

```text
Runtime interface adapter → Mastra/framework shell → Functional Core
```

For this project, `core/` must retain zero `@mastra/*` imports, no relative
imports escaping into the shell, and no framework-specific bare imports. The
shell may import Core; Core must not import the shell. Treat the FCIS test and
`core/README.md` as executable authority, not as suggestions.

Choose a seam that earns its keep. Apply the deletion test: if deleting the
candidate module makes complexity vanish, it is a pass-through; if complexity
reappears across callers, the module is earning leverage and locality. Do not
introduce a port or adapter for one hypothetical implementation. Two real
adapters, commonly production plus a test substitute, make the seam real.

## 3. Design the Core interface

Make the Core module deep: callers provide normalized domain input and receive
structured, deterministic output. Keep the interface small and put branching,
defaults, validation, and policy in the implementation behind it.

Specify explicitly:

- accepted input shape and normalization boundary;
- success result shape and stable discriminators;
- expected refusal/error results versus exceptional programmer or I/O errors;
- ordering and idempotency requirements;
- which facts are inputs, rather than hidden reads from a runtime or process;
- the action boundary at which a gate decision must remain fail-closed.

Return results from the Core and let the shell perform effects. When existing
callers require a legacy envelope, use a one-way compatibility adapter at the
shell seam. Do not make Core understand Mastra tool envelopes, hook stdin, MCP
JSON, runtime-specific environment variables, or native hook names.

## 4. Migrate in observable slices

Use this order unless evidence demands a variation:

1. Characterize the old behavior through its public interface.
2. Establish the new Core interface and its direct tests.
3. Implement the Core decision path without framework imports.
4. Route one caller through a thin compatibility adapter when a flag day would
   be unsafe.
5. Compare old and new results on independent fixtures and contract cases.
6. Migrate the remaining callers, keeping one policy source.
7. Delete obsolete helpers, duplicate policy, dead exports, and parity tests
   whose only purpose was to protect the removed shape.

Keep the migration state in the plan or change-log rather than adding
temporary states to the L1 model or production schema. Keep compatibility
adapters one-directional and temporary; give each a deletion condition. A
wrapper that only renames arguments or forwards every call without hiding
complexity is a migration scaffold, not a durable module.

## 5. Verify the right dimensions

Verify the Core interface first: pure decision cases, normalization boundaries,
structured refusals, deterministic gates, and invariants. Then verify each
genuine adapter at its own contract seam: native parsing/encoding, effect
execution, runtime identity, hook dispatch, and transport wiring.

Check both positive and negative paths. In particular, preserve:

- fail-closed behavior at write, command, and other action boundaries;
- intentionally fail-open startup/preflight behavior where the contract says
  startup must continue while reporting a warning;
- record routing through loop tools rather than direct registry writes;
- runtime identity and discoverability;
- the Core dependency guard and placement/dead-code checks.

Prefer a small behavior matrix over a broad suite of implementation-coupled
tests:

| Case | Core result | Shell/adapter effect | Contract evidence |
|---|---|---|---|

Delete old shallow-module tests when equivalent behavior is covered through the
new interface. The interface is the test surface; tests that reach past it
make the next migration expensive and destroy locality.

## 6. Hand back a migration decision

For planning work, return:

1. the current and target layer map;
2. the Core interface and the effects kept outside it;
3. compatibility adapters, their callers, and deletion conditions;
4. the observable behavior matrix and failure semantics;
5. the staged cutover order and rollback/stop point;
6. verification by Core, adapter, contract, and structural dimensions;
7. obsolete modules/tests that become deletable.

For implementation work, make the same map visible in the change description
and stop when the new interface owns the behavior, callers use it, and the
deletion list has been checked. Do not broaden the migration into speculative
ports, new L1 vocabulary, generated topology/configuration, or unrelated
runtime-owned edits.
