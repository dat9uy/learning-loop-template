---
title: "Audit: Functional Core / Imperative Shell"
type: audit-report
date: 2026-08-10
status: complete
scope: read-only architectural audit (P1), plan 260810-0604
---

# Audit: Functional Core / Imperative Shell

## Executive Summary

The learning loop substantially follows the general **Functional Core / Imperative Shell (FCIS)** principle, but the repository compresses two distinct questions — framework/dependency purity and effect placement — into one FCIS shorthand. This audit reports them separately.

- **Framework/dependency purity:** HOLDS with one concrete exception. `core/cli-context-savings.js:41` imports `../mastra/schema-parity.js`, a reverse (core→shell) edge that violates the documented one-way dependency. No other core file imports `@mastra/*` or the shell directory. The historical whole-core FCIS regression test that would have caught this was deleted in the Vitest migration.
- **Effect placement:** MIXED BY DOCUMENTED DESIGN. `core/` contains both pure primitives/evaluators and I/O-owning facades. The placement manifest (`core/placement.yaml`) and role taxonomy (`docs/placement.md`) codify this split. The audit found one doc/manifest contradiction (`file-readers.js` listed as `primitive` example in docs vs `facade` in manifest) and one primitive-with-import-time-I/O (`blanking.js:25` reads `patterns.json` at module load).
- **CLI classification:** `bin/loop.mjs` is unambiguously an imperative shell — it owns argv/file input, JSON parsing, dynamic dispatch, environment/runtime pinning, serialization, and exit-code mapping. Statelessness does not change this.
- **Filesystem topology:** The 3-layer model (core / Mastra shell / runtime interface) is expressed in directory structure and enforced by the placement manifest. Two layers exist outside the named 3: `tools/lib/` (shared handler helpers, 39× `resolveRoot` + 22× `appendGateLog` import sites) and `tools/handlers/` (transport-neutral imperative adapters, 48 files). `tools/handlers/` imports core; `core/meta-state.js:57` and `core/operation-invariant.js:29` import `#lib/gate-logging.js` — a core→tools/lib edge.

## Audit Lens

Research-informed model (see `plans/reports/research-260810-0614-functional-core-imperative-shell.md`):

```text
external world -> imperative shell -> functional core -> imperative shell -> external world
```

Shells own external input, effects, orchestration, serialization, and error/exit mapping. Core transforms explicit data into explicit data. A CLI is a shell by responsibility even when stateless.

## 1. Framework/Dependency Purity

### 1.1 Whole-core `@mastra/*` scan — PASS

Scanned all production files under `tools/learning-loop-mastra/core/` (including `core/r2/` and `core/entry/`, excluding `*.test.js`, `coverage/`, `.test-logs/`):

```bash
grep -rn "@mastra" --include="*.js" core/ | grep -v ".test.js" | grep -v "coverage/"
# → NONE FOUND
```

No `@mastra/*` import exists in core, statically or dynamically.

### 1.2 Core→shell (mastra/) imports — ONE VIOLATION

`core/cli-context-savings.js:41`:

```js
import { buildParitySchema } from "../mastra/schema-parity.js";
```

This is a core→`mastra/` directory edge. Per `AGENTS.md` §1.1 (lines 24–26): "core may NOT import the shell." Per `core/README.md:11`: "**Core has zero `@mastra/*` imports; the shell may import core.**"

Mitigating facts:

- `mastra/schema-parity.js` itself is pure — it imports only `zod` (`mastra/schema-parity.js:1`) and performs no I/O. So the violation is a **placement/topology** violation (a pure module living in the shell dir being imported by core), not a framework-coupling violation.
- The only production consumer of `cli-context-savings.js` is `tools/scripts/measure-cli-context.mjs:40` — an operator script, not a runtime shell. Two tests import it (`__tests__/cli-context-savings.test.js`, `cli-context-savings-script.test.js`).
- `core/schema-normalize.js:6–9` explicitly documents the intended boundary: "MCP-only siblings (`mastra/schema-parity.js`, `mastra/with-r2-gate.js`) intentionally stay out of scope." `cli-context-savings.js` violates this documented intent.
- `core/cli-context-savings.js` is classified `role: helper` in `placement.yaml:99`, and the placement test's role-layering check treats `helper` as unrestricted (`placement-manifest.test.js:111`), so no enforcement fires.

### 1.3 Core→tools/lib/ imports — TWO SITES

`tools/lib/` is a shared helper layer (`#lib/*` → `./tools/lib/*` per root `package.json` `imports`). Two core files import from it:

- `core/meta-state.js:57` — `import { appendGateLog } from "#lib/gate-logging.js";`
- `core/operation-invariant.js:29` — `import { appendGateLog } from "#lib/gate-logging.js";`

These are **not** framework imports, so they don't violate the `@mastra/*` rule. But they are core→external-layer edges not named in the 3-layer model. `tools/lib/gate-logging.js` is I/O-owning (rotates and appends `gate-log.jsonl`, lines 74–91). This means the registry core facade (`meta-state.js`) and the operation-invariant helper depend on an I/O helper living outside both core and the Mastra shell. Whether `tools/lib/` is "core-adjacent shared code" or a fifth undeclared layer is an open question (see §7).

### 1.4 Reverse-direction check (shell → core) — PASS

Every inspected shell/adaptor imports core inward:

- `bin/loop.mjs:39–46` — imports `core/identity-pin.js`, `core/schema-normalize.js`, `core/manifest-loader.js`, `core/cli-tools.js`, `core/cli-stderr.js`, `core/r2/path-field-detector.js`.
- `mastra/server.js:15–21` — imports `core/identity-pin.js`, `core/gate-logic.js`, `core/manifest-loader.js`, `core/cli-tools.js`, `core/r2/*`.
- `mastra/with-r2-gate.js:25–31` — imports `core/path-containment.js`, `core/r2/*`, `core/identity-pin.js`, `core/gate-logic.js`.
- `mastra/create-loop-tool.js:3` — imports `core/schema-normalize.js`.
- `mastra/handler-adapter.js` — no imports beyond stdlib (pure adaptor).
- `tools/handlers/*.js` — import `core/*` heavily (e.g., `loop-describe-tool.js` imports `core/loop-introspect.js`, `core/meta-state.js`, `core/loop-introspect-cache.js`, `core/registry-stats.js`, `core/field-glossary.js`, `core/envelope-stripper.js`).
- `hooks/universal/*.js` — import `core/evaluate-bash-gate.js`, `core/gate-decision-log.js`, `core/evaluate-write-gate.js`, `core/gate-logic.js`, `core/surfaces.js`, `core/worktree-session-id.js`, `core/recurrence-tracker.js`.
- `tools/lib/*.js` — import `core/meta-state.js`, `core/path-containment.js`, `core/verification-runner.js`.

## 2. Effect Placement

### 2.1 The placement taxonomy

`docs/placement.md:29–37` defines a closed role taxonomy with an explicit `I/O?` column:

| Role | I/O? | Examples |
|---|---|---|
| `primitive` | No | `slugify.js`, `strict-boolean-guard.js`, `envelope-stripper.js`, **`file-readers.js`**, `surfaces.js` |
| `evaluator` | No | Phase 3 evaluators |
| `facade` | Yes | `meta-state.js`, `gate-logic.js`, `gate-decision-log.js`, `gate-override.js`, `loop-introspect.js`, `inbound-state.js` |
| `verification` | Yes (on-demand) | `check-grounding.js`, `consistency-check.js`, `query-drift.js`, `derive-status.js`, `runtime-agnostic-checklist.js`, `verification-runner.js` |
| `validator` | No | (none) |
| `cache` | Yes | `read-registry-cache.js`, `loop-introspect-cache.js` |
| `helper` | mixed | `recurrence-tracker.js`, `workflow-registry.js` |

### 2.2 Concrete I/O-owning core facades (verified)

| File | I/O evidence |
|---|---|
| `core/meta-state.js` | `writeFileSync` (line 142), `renameSync` (143), atomic registry appends (216, 1369, 1489); reads `meta-state.jsonl`; `appendGateLog` via `#lib` |
| `core/runtime-state.js` | `appendFileSync` (228, 399), `mkdirSync` (398); reads/appends `runtime-state.jsonl` |
| `core/gate-decision-log.js` | writes `.gate-decision.log` via `surfaces.js` `appendToAllSurfaces` |
| `core/loop-introspect.js` | `readFileSync` (55, 488), `readdirSync`; reads manifest + patterns.json |
| `core/check-grounding.js` | `readFileSync` (85), `existsSync`; SHA-256 of files |
| `core/verification-runner.js` | `spawnSync` (40) — executes verification steps as subprocesses |
| `core/r2/allowlist-cache.js` | reads `.loop/r2-allowlist.json`, caches in-process |
| `core/identity-pin.js` | reads `process.env.LOOP_SURFACE`, freezes process identity |
| `core/runtime-tracking.js` | reads `.loop/runtime-tracking.json` sidecar |
| `core/registry-lock.js` | cross-process file lock |
| `core/registry-append-atomic.js` | `O_APPEND` + fsync'd writes |
| `core/worktree-session-id.js` | reads `.git/HEAD` content |

### 2.3 Pure primitives/evaluators (verified, representative)

| File | Role | Purity evidence |
|---|---|---|
| `core/slugify.js` | primitive | pure string transform |
| `core/strict-boolean-guard.js` | primitive | pure coercion |
| `core/envelope-stripper.js` | primitive | pure envelope strip |
| `core/shell-parse.js` | primitive | pure tokenizer (re-exports shell-quote) |
| `core/blanking.js` | primitive | pure command blanking, **except** module-load `readFileSync("patterns.json")` (line 25) |
| `core/evaluate-bash-gate.js` | evaluator | policy logic; reads patterns (imports facade helpers) |
| `core/evaluate-write-gate.js` | evaluator | rule-registry cascade; delegates preflight |
| `core/command-classification.js` | helper | pure classifier (no fs I/O) |
| `core/entry/relationship-graph.js` | helper | pure graph model ("no fs/gate-logic/stale-view/meta-state imports" — placement.yaml:194) |
| `core/consistency-check.js` | verification | pure status/audit-field drift detector (no I/O — placement.yaml:60) |

### 2.4 Effect-placement findings

1. **The repository's "functional core" is framework-independent policy core, not a strictly side-effect-free core.** This is intentional and documented (`core/README.md:1–13`, `docs/placement.md`). Under strict FCIS terminology, the I/O-owning facades are "functional-core-plus-I/O" — the audit does not call this a defect, but it is a meaningful boundary choice that the repo's FCIS shorthand conflates with the `@mastra/*` rule.

2. **Doc/manifest contradiction on `file-readers.js`.** `docs/placement.md:31` lists `file-readers.js` as a `primitive` example (row: "No I/O"). `placement.yaml:111` classifies it `role: facade` (I/O: Yes). The `placement-manifest.test.js` role-taxonomy check (`docs/placement.md` vs test, lines 141–161) only compares the closed *role names*, not the example→role mapping, so this contradiction is not machine-detected.

3. **`blanking.js` (primitive, documented "No I/O") performs a module-load filesystem read.** `core/blanking.js:20,25` reads `patterns.json` via `readFileSync` at import time. The role taxonomy's "No I/O" claim for `primitive` is not mechanically enforced — `placement-manifest.test.js:94–139` checks only *import roles*, not filesystem effects.

4. **`command-classification.js` and `constants.js` have no real fs I/O** — the earlier grep matched only `process.env` references. They are pure as classified.

## 3. CLI as Imperative Shell — CONFIRMED

`bin/loop.mjs` is an imperative shell by every FCIS criterion:

| Criterion | Evidence |
|---|---|
| argv parsing + usage errors | `loop.mjs:259` (`process.argv`), `parseListDispatch`/`parseSchemaDispatch`/`parseToolDispatch` (172–203), `requireArgsFilePath` (225) |
| JSON/file input loading | `parseJsonArg` (91), `loadArgsFile` (209) |
| Environment/runtime identity pinning | `pinRuntimeIdAtBoot()` (278, 291); the CLI inherits the MCP server's runtime-pin contract |
| Dynamic module resolution + dispatch | `resolveToolByBareName` (59), `resolveToolImportUrl` (61), `runTool` (129) |
| Serialization to stdout | `process.stdout.write(JSON.stringify(result))` (281, 293), `runList` (80) |
| Exit codes | `process.exit(2)` (305, 308), exit 1 for handler errors (via `classifyCliError`), 0 for success |
| R2/write-authorization wrapping | `withR2Gate` wrapper (136), same code path as MCP server (`loop.mjs:6–9`) |

**Key distinction confirmed:** the CLI is stateless (no retained process state across invocations) but is still a shell — statelessness is not functionality. The CLI's transport/orchestration responsibilities remain shell responsibilities even though it reuses core modules (`cli-tools.js`, `cli-stderr.js`, `schema-normalize.js`).

**Domain logic check:** no domain transformation is embedded in the CLI itself; it delegates to handlers/core. The only logic in the binary is transport logic (arg parsing, dispatch, serialization, error classification). This is the correct FCIS shape.

## 4. Mastra Shell, Handlers, Hooks, Runtime Interface — Classified

### 4.1 Mastra shell (`mastra/`) — IMPERATIVE SHELL

| File | Shell responsibilities |
|---|---|
| `mastra/server.js` | Imports `@mastra/mcp`, `@mastra/core`, `@mastra/core/tools`, `@mastra/core/utils`, `@mastra/core/request-context`; reads `process.env.LOOP_READS_VIA_CLI`/`LOOP_RECORDS_VIA_CLI`; reads manifest JSONC; dynamic-imports handlers; calls `pinRuntimeIdAtBoot()` (25); inits storage (`initStorage()`, 262); spawns stdio server (`startStdio()`, 280) |
| `mastra/create-loop-tool.js` | Imports `@mastra/core/tools`; `createTool` wrapper; injects parity JSON Schema; applies `withR2Gate` |
| `mastra/create-loop-workflow.js` | Imports `@mastra/core/workflows`; `createWorkflow`/`createStep`; reuses core `envelope-stripper` |
| `mastra/create-loop-agent.js` | Imports `@mastra/core/agent`; Mastra agent factory |
| `mastra/handler-adapter.js` | Pure adaptor: legacy `{content:[{text}]}` → direct result object (no framework imports) |
| `mastra/with-r2-gate.js` | Orchestrates path detection → containment → ownership → execute (imports core only) |
| `mastra/schema-parity.js` | Pure JSON-Schema-parity view (imports zod only) — pure module living in shell dir |
| `mastra/schemas.js`, `mastra/schema-parity.js` | schema helpers |
| `mastra/agents/*` | Mastra agent definitions (framework-bound) |
| `mastra/workflows/*` | workflow definitions |
| `tools/learning-loop-mastra/storage.js` | Top-level `LibSQLStore` (AGENTS.md §1.1 "deliberate top-level exception") — imports `@mastra/libsql`, `@libsql/client` |

### 4.2 Handler substrate (`tools/handlers/`) — IMPERATIVE ADAPTERS

48 files under `tools/learning-loop-mastra/tools/handlers/`. All inspected handlers:

- import `zod` + core modules (inward dependency) — no `@mastra/*` in any handler (verified by grep)
- import shared helpers via `#lib/*` (39× `resolveRoot`, 22× `appendGateLog`, plus `find-entry`, `run-test`, `patch-hints`)
- perform I/O (registry reads/writes, gate-log appends) at the tool boundary

`core/README.md:27–29` explicitly calls `tools/handlers/` "a separate substrate directory (legacy tool adapters; NOT under `mastra/`)." The placement decision tree (`docs/placement.md:21–23`) routes "MCP tool that exposes a core function" to `tools/handlers/`. This is a stable, transport-neutral imperative adapter layer — but it is **not named in the 3-layer model** in `AGENTS.md` §1.1 (which names Core / Mastra shell / Runtime interface only). Whether this is a "fourth layer" or a sub-layer of the shell is a naming/topology question (see §7 Q4).

### 4.3 Universal hooks (`hooks/universal/`) — BOUNDARY ADAPTERS

Six universal hooks + 2 lib helpers + 2 session-start preflight hooks:

| File | Role |
|---|---|
| `bash-gate.js` | PreToolUse adapter: reads stdin JSON, calls `core/evaluate-bash-gate.js`, appends `core/gate-decision-log.js` |
| `write-gate.js` | PreToolUse adapter: calls `core/evaluate-write-gate.js` |
| `inbound-gate.js` | UserPromptSubmit adapter: reads prompt, writes markers via `core/surfaces.js` + `core/worktree-session-id.js` |
| `recurrence-check-on-start.js` | SessionStart adapter: calls `core/recurrence-tracker.js` |
| `lib/protocol-adapter.js`, `lib/resolve-session-id.js` | shared hook protocol helpers |
| `session-start-git-merge-driver-preflight.cjs`, `session-start-git-push-preflight.cjs` | read-only preflight reporters (`.claude`-only) |
| `session-start-inject-{discoverability,process-hints}.cjs` | `.claude` SessionStart context injection |
| `toolchain-failure-capture.js` | failure capture |

All hooks depend inward on core. Policy lives in core; hooks are thin protocol adapters. **Healthy FCIS shape.**

### 4.4 Runtime interface (`interface/`) — CONTRACT + VALIDATOR

`interface/contract.js` is a pure read-only validator (no `@mastra` imports; reads runtime config files). It enforces the MCP-transport conformance checklist (`interface/CONTRACT.md`). All three runtimes pass:

```text
claude-code: ok: true, missing: [], notes: [skill-spec-no-tools-block, identity-marker-not-adopted, 4× universal-missing]
droid:       ok: true, missing: [], notes: [same]
mastra-code: ok: true, missing: [], notes: [skill-spec-no-tools-block, identity-marker-not-adopted]
```

The `*-universal-missing` notes for `.claude`/`.factory` report that the shims' `universal_target` is "missing" — per `CONTRACT.md:26` this is an advisory (universal-hook wiring is git-tracked and not runtime-mutable), not a failure. `identity-marker-not-adopted` is the known advisory note. All match warmup findings.

### 4.5 Runtime surfaces (`.claude/`, `.factory/`, `.mastracode/`)

- All three `mcp.json` configs wire the MCP server with `LOOP_SURFACE=<surface>` + `LOOP_RECORDS_VIA_CLI=1` (verified).
- All shims byte-identical across `.claude` and `.factory` (verified via sha256sum: 5/5 MATCH).
- `.mastracode` uses declarative `hooks.json` (direct universal-hook wiring) per the hooks-wiring manifest.

## 5. Filesystem Topology vs Docs/Manifests/Tests

### 5.1 Tracked topology (verified)

| Surface | Location | Tracked? |
|---|---|---|
| Core | `tools/learning-loop-mastra/core/` | Yes (placement.yaml enumerates every production file) |
| Mastra shell | `tools/learning-loop-mastra/mastra/` | Yes |
| CLI | `tools/learning-loop-mastra/bin/loop.mjs` | Yes |
| Handlers | `tools/learning-loop-mastra/tools/handlers/` | Yes |
| Universal hooks | `tools/learning-loop-mastra/hooks/universal/` | Yes |
| Interface | `tools/learning-loop-mastra/interface/` | Yes |
| Runtime shims | `.claude/coordination/hooks/`, `.factory/coordination/hooks/` | Yes (byte-identical) |
| Runtime configs | `.mcp.json`, `.factory/mcp.json`, `.mastracode/{mcp,hooks,settings,database}.json` | Yes |
| Shared helpers | `tools/lib/` | Yes (8 files) |

### 5.2 Generated/runtime artifacts (NOT tracked, correctly excluded)

- `.claude/coordination/.last-operator-message-*`, `.inbound-pointer-surfaced`, `.inbound-stale-surfaced`, `.gate-decision.log`, `gate-log.jsonl`, `.loop-preflight-*` markers — runtime state, not tracked source
- `.loop/runtime-state-local.jsonl` — gitignored session-local substrate (verified `git check-ignore` → IGNORED)
- `core/coverage/`, `core/.test-logs/`, `tools/learning-loop-mastra/coverage/` — test artifacts
- `tools/learning-loop-mastra/.test-logs/vitest-results.json` — test output

The git working tree is clean except the intentional plan/report artifacts (`git status --short` shows only `plans/260810-0604-...`, `plans/handoffs/`, `plans/reports/research-...`).

### 5.3 Filesystem alignment verdicts

1. **3-layer core/shell/interface split is expressed in the filesystem** and machine-enforced for core membership (`placement-manifest.test.js` enumerates every core file).
2. **Two additional tracked layers exist outside the named 3:** `tools/lib/` and `tools/handlers/`. Both are documented in passing (`core/README.md:27–29`, `docs/placement.md:21–23`) but are not in the `AGENTS.md` §1.1 layer diagram. This is a docs-vs-topology naming gap, not a violation.
3. **`core/placement.yaml` vs `docs/placement.md` example mismatch** on `file-readers.js` (see §2.4.2).
4. **Runtime/coordination markers are correctly gitignored/untracked** — generated state stays out of tracked topology.

## 6. Mechanical Enforcement vs Documentation-Only Intent

### 6.1 Historical whole-core FCIS guard — DELETED (verified)

`__tests__/phase-e-foundation/fcis-invariant.test.js` was deleted in commit `7952f162` ("migrate from node:test + c8 to vitest (#54)"). Recovered historical content (via `git show 7952f162^:...`):

- Test 1: walked all of `core/` (recursively, excluding `__tests__`/`node_modules`/`*.test.js`), regex-matched `from '@mastra/'`, `require('@mastra/')`, `import('@mastra/')`, and asserted zero violations.
- Test 2: walked all core files, resolved every relative sibling import, asserted no broken paths.

`prune-coverage-parity.test.js:37` confirms the deletion was intentional — it lists `fcis-invariant.test.js` in `PRUNE_FILES` (files asserted to be gone).

### 6.2 Surviving narrower guards (verified green)

| Guard | Scope | Result |
|---|---|---|
| `placement-manifest.test.js` | enumerates core files, closed role names, sanitized paths, role-layering import allow-list (core-internal only) | 6 tests PASS |
| `bound-artifacts.test.js` | `core/bound-artifacts.js` has zero `@mastra/*` (per-file FCIS) | 11 tests PASS |
| `change-log-bound-paths.test.js` | `core/change-log-bound-paths.js` has zero `@mastra/*` (per-file FCIS) | 23 tests PASS |
| `schema-normalize.test.js` | `core/schema-normalize.js` imports only zod (no `@mastra`, no `./schema-parity`, no `./with-r2-gate`) | 5 tests PASS |
| `portable-six-probes.test.js` | 6 specific handlers: no file reads, no `@mastra` | (referenced in handoff; narrow) |
| `runtime-agnostic.test.js` | 6-item runtime-agnostic checklist vs `surfaces.js` | PASS (warmup) |
| Interface contract validators | 3 runtimes | all `ok: true` (this audit) |
| **45 boundary tests combined** | placement + bound-artifacts + change-log-bound-paths + schema-normalize | **45 PASSED** (this audit, unit project) |

### 6.3 Enforcement-gap verdict

The surviving guards are **narrow and per-file**. There is **no surviving whole-core scan** that would catch a new `@mastra/*` import, a new core→mastra directory edge, or a new core→`tools/lib` edge. Concretely:

- The `cli-context-savings.js → ../mastra/schema-parity.js` edge (§1.2) **would have been caught** by the deleted whole-core FCIS test's sibling-import walk (Test 2, which verified every relative import resolves within core — an import pointing at `../mastra/` resolves fine as a file, but the *zero-`@mastra/*`* test would NOT have caught it either, since `schema-parity.js` is not `@mastra/*`).
- The core→`#lib` edges (§1.3) are outside the deleted test's scope entirely (`#lib` is a bare specifier, not a relative import).
- The `file-readers.js`/`blanking.js` effect-placement gaps (§2.4) are not enforced by any test — the placement test checks role *names* and import *roles*, not actual I/O behavior.

**Conclusion:** the repo traded a broad whole-core guard for a narrower set of per-file/role guards. This is a maintenance trade-off the audit reports as fact, not a defect to fix in this read-only audit.

## 7. Open Questions / Design Trade-offs

1. **Does "functional core" here intentionally mean framework-independent policy core (including I/O-owning facades), or is strict effect purity the eventual target?** The repo's FCIS shorthand (`core/README.md`, `AGENTS.md`) defines the invariant as zero-`@mastra/*`; the broader FCIS literature also cares about effects. This audit reports both dimensions; the decision is the user's.

2. **Should the CLI be named explicitly in the 3-layer docs?** `docs/architecture.md:5` and `AGENTS.md:15` name the Mastra shell as *the* imperative shell; the CLI is treated as a transport (`docs/architecture.md:22–23`, `docs/runtime-contract.md`). The audit confirms the CLI is a full imperative shell (argv, env, dispatch, serialize, exit) — the docs' "transport" framing undersells its shell role.

3. **Should the whole-core FCIS regression guard be restored?** The deleted test caught new `@mastra/*` imports anywhere in core and broken sibling imports. Its absence is the reason the `cli-context-savings.js → mastra/schema-parity.js` edge (§1.2) shipped unnoticed. The placement manifest + per-file guards partially cover this, but no single guard scans the whole core.

4. **Is `tools/handlers/` a stable fourth architectural layer or a legacy-substrate exception?** `core/README.md:27–29` calls it a "separate substrate directory (legacy tool adapters)." It is 48 files, heavily used, transport-neutral, and imports core inward. It deserves an explicit name in the layer model if it's stable.

5. **Is `tools/lib/` core-adjacent shared code or a fifth undeclared layer?** Two core files import `#lib/gate-logging.js` — the core facade registry and the invariant wrapper depend on an I/O helper outside core and outside the Mastra shell. This blurs the core's self-containment claim.

6. **The core→mastra `schema-parity.js` edge**: since `schema-parity.js` is pure (zod-only), moving it into core (or a shared neutral location) would restore strict one-way dependency without coupling core to `@mastra`. Whether to do this is an implementation decision, out of scope here.

## 8. Honest Test/Check Reporting

| Check | Result | Notes |
|---|---|---|
| Whole-core `@mastra/*` grep | PASS | NONE FOUND |
| Core→mastra imports | 1 edge | `cli-context-savings.js:41` |
| Core→tools/lib imports | 2 edges | `meta-state.js:57`, `operation-invariant.js:29` |
| Placement + boundary tests | 45 PASSED | unit project, this audit |
| Interface contract validators | 3/3 ok:true | advisory notes unchanged from warmup |
| Shim byte-identity | 5/5 MATCH | `.claude` vs `.factory` |
| `check_runtime_agnostic` on `loop.mjs` | 6/6 passed | warmup result; tool is MCP-residue, not CLI-runnable in this runtime |
| git working tree | CLEAN | only intentional plan/report artifacts untracked; no source/docs/config/test/registry modified |

**Not run in this audit:** full suite (`pnpm test`) — not executed to avoid the test seed step (`seed-file-index.mjs`) modifying `file-index.jsonl`, which is an untracked regen artifact (side-effect-bearing). The focused boundary tests (45 passed) are side-effect-light and sufficient for the enforcement question. The `*.universal-missing` advisory notes are per `CONTRACT.md` non-blocking.

**Audit side effects:** recording session-scoped `gate-verb` allowances (node, python3) to the gitignored `.loop/runtime-state-local.jsonl` to unblock read-only validator/test commands. These are ephemeral, session-local, and not committed. No tracked file was modified (verified `git status --short` + `git diff --name-only`).

## References

- Audit plan: `plans/260810-0604-functional-core-imperative-shell-audit/plan.md`
- Phase 1: `plans/260810-0604-functional-core-imperative-shell-audit/phase-01-start.md`
- Research: `plans/reports/research-260810-0614-functional-core-imperative-shell.md`
- `AGENTS.md` §1.1 (3-layer model), §6 (R2 ownership)
- `docs/architecture.md` (3-layer diagram, gate system, tool surface)
- `docs/placement.md` (role taxonomy, decision tree)
- `tools/learning-loop-mastra/core/placement.yaml` (file/role/summary manifest)
- `tools/learning-loop-mastra/core/README.md` (FCIS invariant)
- `tools/learning-loop-mastra/bin/loop.mjs` (CLI shell)
- `tools/learning-loop-mastra/mastra/{server,create-loop-tool,create-loop-workflow,create-loop-agent,handler-adapter,with-r2-gate,schema-parity}.js`
- `tools/learning-loop-mastra/tools/handlers/` (48 adapters)
- `tools/learning-loop-mastra/hooks/universal/`
- `tools/learning-loop-mastra/interface/CONTRACT.md` + `contract.js`
- `tools/lib/` (shared helpers)
- `tools/learning-loop-mastra/__tests__/{phase-e-foundation/placement-manifest,schema-normalize,portable-six-probes,legacy-mcp/bound-artifacts,legacy-mcp/change-log-bound-paths,prune-coverage-parity}.test.js`
- Git history: `7952f162` (Vitest migration, deleted FCIS guard)

## Unresolved Questions (final)

1. Is strict effect purity a future target for core, or is framework-independent policy core with documented I/O facades the accepted design?
2. Should the CLI be named as an imperative shell in `AGENTS.md`/`docs/architecture.md`?
3. Should the whole-core FCIS regression guard be restored, or are per-file/role guards the intended trade-off?
4. Is `tools/handlers/` a fourth stable layer or a legacy substrate to be named/retired?
5. Is `tools/lib/` core-adjacent shared code or an undeclared layer that blurs core self-containment?
6. Should the `file-readers.js` doc-example contradiction (`docs/placement.md:31` vs `placement.yaml:111`) be reconciled?
