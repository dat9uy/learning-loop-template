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
- `tools/learning-loop-mastra/mastra/create-loop-*.js` (shell factories)
- Anything under `tools/learning-loop-mastra/mastra/{workflows,agents}/`
  (shell-defined entities); `tools/learning-loop-mastra/tools/legacy/`
  is a separate substrate directory (legacy tool adapters; NOT under `mastra/`)

The reasoning: those would couple core to the shell, breaking the one-way
dependency. Core must remain portable — if we swap Mastra for another
framework, only the shell changes.

## How to add a new core file

See `docs/placement.md` §3 for the full process and §2 for the role taxonomy.
In short: drop the file, write a summary, add a manifest row in `core/placement.yaml`,
run the placement-manifest test.

## Admission rule

A module belongs in `core/` only if a non-test, non-fixture import site uses it.

Rationale: `core/` accumulated helper modules during earlier CLI migrations
(e.g., `core/list-probes.js` from the CLI-shim era) whose only consumer was
`__tests__/legacy-mcp/`. The placement manifest (Mechanism A from the phase-E
implicit-topology refactor) prevents *new* accumulation; the fallow CI guard
prevents re-accumulation. Together they enforce this rule.

Enforcement:
- `.fallowrc.json` lists `mastra/server.js` and the `tools/legacy/**/*.js`
  wrappers as entry points. `__tests__/legacy-mcp/**` is excluded.
- `fallow audit --gate new-only` runs on every PR; introduced dead code
  fails the gate.
- `fallow dead-code --save-regression-baseline` is regenerated on `main`
  after every cleanup PR; the regression baseline is the numerical floor.

When adding new code to `core/`:
1. Update `core/placement.yaml` with the new file's path + role + summary.
2. Ensure the file is imported by a production site (a tool in
   `tools/legacy/`, a hook in `hooks/legacy/`, or another core facade).
3. Run `fallow dead-code --unused-files --unused-exports` locally; expect
   0 findings for the new file.

## Tool integration checklist

Consult this checklist when wiring a new tool into CI, package scripts, or repo automation. Encoded as the `rule-tool-integration-same-commit-dep` consult-checklist rule (see `meta-state.jsonl`) with a corresponding `PROCESS_HINTS` row in `core/loop-introspect.js`.

1. **Same-commit dependency.** If a workflow adds `pnpm exec <tool>` / `npx <tool>` / `npm run <script>`, the tool MUST be in `devDependencies` (or `dependencies`) in the SAME commit. Verify with `grep '<tool>' package.json` after any `.github/workflows/*.yml` edit. Symptom of skip: CI's `pnpm install --frozen-lockfile` fails with `command not found` on the first PR.
2. **Baseline flag format.** When wiring `fallow audit`, generate baselines with `fallow <sub> --save-baseline <path>` (audit format: array of `path:export` strings). NEVER `--save-regression-baseline` (regression format: nested objects). The two flags produce INCOMPATIBLE JSON; `fallow audit --*-baseline` fails to parse the regression format.
3. **Baseline storage.** `fallow` auto-creates `<root>/.fallow/.gitignore: *` that silently gitignores `.fallow/baselines/`. Verify `git ls-files <root>/.fallow/baselines/` returns expected files BEFORE committing. Prefer `plans/<plan-slug>/reports/fallow/` (which inherits the plan's gitignore); if you must keep at `<root>/.fallow/baselines/`, add `!.fallow/baselines/` exception to root `.gitignore`.

Origin findings: `meta-260628T1328Z-commit-6f9402e-...` (item 1), `meta-260628T1328Z-fallow-dead-code-save-regression-baseline-...` (item 2), `meta-260628T1329Z-when-fallow-runs-...` (item 3). All three are already FIXED in commit `9ed520d`; this section exists to prevent recurrence.

## Soft inversion (Mechanism B)

- **Schemas = validation source.** `core/meta-state.js` exports the canonical Zod schemas. They are the runtime-checked layer.
- **Factories = ergonomic surface.** `core/entry/{finding,rule,change-log,loop-design}.js` wrap the schemas. Every factory returns a **deep-frozen** object with status helpers + relationship methods.
- **Schema reachable via `factoryInstance.schema`** (NOT `factory.schema` — the latter is the factory function, which has no `.schema` property). Reference equality (not copy). Any caller needing the raw Zod schema reads it off a factory instance.

> **ADR (2026-06-27):** Soft inversion by operator decision. Revisit if (a) `.shape` consumers drop below 3, OR (b) factory methods start needing cross-cutting logic that schemas can't express.
>
> **Load-bearing invariant:** `metaState*EntrySchema` must remain a single module-level constant. Any future wrapping of the schema (`.partial()`, `.brand()`, `.merge()`, etc.) breaks the `instance.schema === canonicalSchema` reference-equality contract that the soft-inversion safeguard test enforces. Such wrapping requires an ADR. The existing `buildPatchSchemaFor(kind)` call at `core/meta-state.js:299` already wraps the rule schema with `.partial().strict()` — that's the exception, not the rule.

## Relationship methods: pure vs registry-aware split

Factory `outboundRefs()` / `inboundRefs(root)` are **pure views** of an entry's own fields. They do not consult the registry. Concretely:

- `createFinding(data).outboundRefs()` emits a `promoted_to_rule` ref only when `data.promoted_to_rule` is set. Legacy findings without that field yield no `promoted_to_rule` ref.
- `createRule(data).inboundRefs(root)` does emit a `promoted_to_rule` ref from the rule side via `rule.origin` (dual-field fallback), so the inverse direction stays correct.

The registry-aware composition for legacy outbound compat lives in **`tools/legacy/meta-state-relationships-tool.js`**, which calls `buildInverseIndexes(entries)` and patches `outbound.promoted_to_rule` from `origin_inverse` when the finding lacks the field. This is intentional: factories stay schema-pure and import-light, while the tool (which already reads the registry) handles the legacy migration. **Consumers calling `factory.outboundRefs()` directly should not expect legacy dual-field fallback** — go through `meta_state_relationships` for the canonical wire shape.

## Relationship to other layers

See `AGENTS.md` §1.1 for the 3-layer explanation:

- **Core (this directory)** — the functional core
- **Mastra shell** (`tools/learning-loop-mastra/mastra/`) — the imperative shell
- **Runtime interface** (`tools/learning-loop-mastra/interface/`) — the contract (ships in Plan 2)
