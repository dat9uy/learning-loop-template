# Placement — Where Does My New Code Go?

## 1. Decision tree

1. Does it mutate `meta-state.jsonl` or `runtime-state.jsonl`?
   → Yes: `core/meta-state.js` (registry) or `core/gate-decision-log.js`
   → No: continue.

2. Does it parse/transform/match data with NO I/O and NO `@mastra/*` imports?
   → Yes: `core/` as a single-file concern (matches existing primitive/evaluator pattern)
   → No: continue.

3. Does it wrap a Mastra primitive (tool, workflow, agent, harness)?
   → Yes: `mastra/create-loop-*.js` (factory) or `mastra/{workflows,agents,tools}/` (entity)
   → No: continue.

4. Does it translate between a runtime's hook protocol and our internal API?
   → Yes: `hooks/legacy/<gate>.js` (universal) + `.claude|.factory/coordination/hooks/*.cjs` (shim)
   → No: continue.

5. Is it an MCP tool that exposes a core function?
   → Yes: `tools/legacy/<tool>.js` (legacy substrate, NOT in `mastra/`)
   → No: escalate to operator — outside documented layers.

## 2. Role taxonomy (closed)

Adding a role requires an ADR (see §4).

| Role | I/O? | Imports | Examples |
|---|---|---|---|
| `primitive` | No | Only stdlib + sibling primitives | `slugify.js`, `strict-boolean-guard.js`, `envelope-stripper.js`, `file-readers.js`, `surfaces.js` |
| `evaluator` | No | `primitive` + `facade` | Phase 3 evaluators (3 files) compose primitives from `gate-logic.js` and facade functions from `inbound-state.js` for state-reading. Import-allow-list refinement (not a new role); revisit if evaluator count > 5. |
| `facade` | Yes | All | `meta-state.js`, `gate-logic.js`, `gate-decision-log.js`, `gate-override.js`, `loop-introspect.js`, `inbound-state.js` |
| `verification` | Yes (on-demand) | `primitive` + `facade` | `check-grounding.js`, `consistency-check.js`, `query-drift.js`, `derive-status.js`, `runtime-agnostic-checklist.js`, `verification-runner.js` |
| `validator` | No | `primitive` only | (none currently) |
| `cache` | Yes | Wraps one sibling | `read-registry-cache.js`, `loop-introspect-cache.js` |
| `helper` | mixed | mixed | `recurrence-tracker.js`, `workflow-registry.js` |

## 3. How to add a new core file

1. Drop the file in `core/`.
2. Write a one-line summary.
3. Add a row to `core/placement.yaml` with `path`, `role`, and `summary`.
4. Run `node --test __tests__/phase-e-foundation/placement-manifest.test.js`.
   If the test fails, the manifest update was missed.

## 4. Adding a new role

Roles are closed. New roles require an ADR in `docs/decisions/` or similar.
Don't silently add a role to the manifest.

## 5. References

- `core/README.md` — FCIS invariant + soft-inversion contract
- `docs/schemas.md` — canonical Zod schema documentation
- `AGENTS.md` §1 — 3-layer architecture (core / shell / interface)
