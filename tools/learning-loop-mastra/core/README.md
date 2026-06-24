# Core — Functional Core (FCIS invariant)

## What this directory is

The functional core of the learning loop. Contains pure logic: meta-state,
gate decisions, schema validation, fingerprint computation, drift detection.
Zero framework dependencies.

## The FCIS invariant

**Core has zero `@mastra/*` imports; the shell may import core.**

This is the load-bearing architectural rule. If you add a
`from '@mastra/...'` to any file in this directory, the FCIS test
(`__tests__/phase-e-foundation/fcis-invariant.test.js`) will fail.

## What core may import

- Node stdlib: `node:fs`, `node:path`, `node:crypto`, `node:url`
- Other `core/` files (sibling imports)
- Pure npm packages: `yaml`, `zod`, `ajv`, etc.

## What core may NOT import

- `@mastra/*` (the framework)
- `tools/learning-loop-mastra/create-loop-*.js` (shell factories)
- Anything under `tools/learning-loop-mastra/{workflows,agents,tools}/`
  (shell-defined entities)

The reasoning: those would couple core to the shell, breaking the one-way
dependency. Core must remain portable — if we swap Mastra for another
framework, only the shell changes.

## How to add a new core file

1. Drop the file in this directory.
2. Write pure logic. No Mastra imports.
3. Add a test in `__tests__/phase-e-foundation/fcis-invariant.test.js`
   if the file is non-trivial.

## Relationship to other layers

See `AGENTS.md` §1.1 for the 3-layer explanation:

- **Core (this directory)** — the functional core
- **Mastra shell** (`tools/learning-loop-mastra/` top level) — the imperative shell
- **Runtime interface** (`tools/learning-loop-mastra/interface/`) — the contract (ships in Plan 2)
