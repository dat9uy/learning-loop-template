# AGENTS.md — Agent Surfaces Reference

Shared coordination rules for every agent runtime (Claude Code, Droid CLI, Mastra Code). All gate logic lives in `tools/learning-loop-mastra/core/` (single source of truth). All runtimes use the same universal hooks via thin wrappers or declarative config.

This is the thin root entry doc. It keeps the load-bearing layer definitions and the 4-kind union, then points into `docs/` for depth. The engine invariant and concept vocabulary live in `docs/loop-engine.md`; the runtime participation contract in `docs/runtime-contract.md`; the mechanism (gate system, 3-layer architecture, meta-state self-learning loop) in `docs/architecture.md`; the 4-kind lifecycle in `docs/meta-state-lifecycle.md`; the long-term direction in `docs/trajectory.md`.

**The meta-surface is the only bound surface; the product surface is unbound and re-debated from the meta-surface.** This document is the gate-truth for every agent in every session.

---

## 1. The Meta-Surface (the only bound surface)

### 1.1 The 3 layers (Core / Mastra shell / Runtime interface)

The meta-surface is implemented across 3 layers:

- **Core (functional).** Pure logic. Zero `@mastra/*` imports. Lives at
  `tools/learning-loop-mastra/core/`. Codifies the FCIS invariant (see
  `core/README.md`). Owns: meta-state, gate decisions, schema validation,
  fingerprint computation, drift detection.

- **Mastra shell (imperative).** Wraps core in Mastra framework primitives.
  Lives at `tools/learning-loop-mastra/mastra/`: `server.js`,
  `create-loop-{tool,workflow,agent}.js`, `handler-adapter.js`,
  `schemas.js`, `workflows/`, `agents/`. May import
  core; core may NOT import the shell. Note: `core/schema-parity.js` (the
  parity view) and `core/cli-context-savings.js` are core modules the CLI
  and the shell's tool/workflow factories reuse.

  > **Path invariant:** shell files MUST live at
  > `tools/learning-loop-mastra/mastra/` and MUST NOT be at the top level of
  > `tools/learning-loop-mastra/`. `storage.js` is the deliberate top-level
  > exception (the Mastra `LibSQLStore` setup, pinned as a Q1.A lock); any
  > other shell file belongs under `mastra/`.

- **Runtime interface (contract).** The contract that agent runtimes sign
  to integrate with the loop. Lives at `tools/learning-loop-mastra/interface/`.
  A runtime satisfies the MCP-transport conformance checklist (see
  `interface/CONTRACT.md`); the transport-agnostic participation contract
  lives at `docs/runtime-contract.md`. **Hooks** (universal scripts in
  `hooks/universal/` + per-runtime shim files in `.claude/coordination/hooks/`,
  `.factory/coordination/hooks/`, `.hermes/coordination/hooks/`, or declarative
  `.mastracode/hooks.json`) are boundary adapters within Runtime interface —
  they translate runtime-specific protocol to/from Core. Policy lives in Core, not in hooks.

```
┌────────────────────────────────────────────────────────────┐
│  Layer 3: Runtime Interface                                │
└─────────────────────────┬──────────────────────────────────┘
                          │ satisfies
┌─────────────────────────▼──────────────────────────────────┐
│  Layer 2: Mastra Shell                                     │
└─────────────────────────┬──────────────────────────────────┘
                          │ wraps
┌─────────────────────────▼──────────────────────────────────┐
│  Layer 1: Core                                             │
└────────────────────────────────────────────────────────────┘
```

The meta-surface is the loop's self-model. It is the **only contract** the loop writes. Everything else (the substrate, the product surface, the legacy `records/<vendor>/` content) is design exploration, archived for forensic continuity, and explicitly not a contract that constrains the loop.

**The meta-surface lives in one place:** `meta-state.jsonl` at the project root. It is implemented across the 3 layers (see §1.1): Core owns the data model, Mastra shell owns the tool surface, Runtime interface owns the agent runtime. It is a 4-kind discriminated union:

> **Read recipe:** the raw file is no longer table-readable (one entry can span N versioned lines per id; the change-log lives in a separate `change-log.jsonl`). To inspect the registry, run `tools/scripts/registry-table.sh | tail -20` (reads the union of `meta-state.jsonl` + `change-log.jsonl`, dedupes by id, emits one-line-per-id). Never `cat meta-state.jsonl | tail -20` — the output is not deduplicated and the last 20 raw lines may show only one id. Pass `--all-versions` to see the full versioned-append history per id (multi-line for ids with multiple versions; shell-side equivalent of `meta_state_list`'s `include_all_versions` — see §2.1).

| Kind | Role | Lifespan |
|---|---|---|
| `finding` | A loop-self-diagnostic observation. No live TTL (`expires_at` is vestigial); `stale` is a derived view, not a status. Close findings with `meta_state_resolve` — the only closure to offer (`meta_state_supersede` is an internal resolve flavor that also emits a change-log citation row; not an option to offer). `accepted` is a standing trade-off (`meta_state_accept`). | open → accepted \| resolved \| archived |
| `change-log` | An immutable audit record of a system change. No TTL. | Forever |
| `rule` | A promoted invariant the loop enforces. Two enforcement classes: `gate` (hard-block) and `agent` (consult). | Forever (until superseded) |
| `loop-design` | A deferred design that will create or modify rules, schemas, or tools. | Active → inactive (when shipped) → archived |

**The product surface (decisions, experiments, risks, observations, capability records, vendor records, claim records, index entries, resource budgets) is unbound.** The Bridge 5 codegen engine has the ability to generate product-surface records; the loop has not committed to binding. The current `capability`, `index-entry`, `claim`, `resource-budget`, `observation` schemas are design exploration, not contracts. **All product-surface record CRUD is paused; no new product records are generated, validated, or migrated.** Legacy product records in `records/<vendor>/` are archived, not deleted.

**The substrate** (the vendor APIs the loop operates against — vnstock, fastapi, tanstack, etc.) is replaceable. It exists to provoke learning; the learning is not *about* the substrate.

For the gate system internals (inbound/outbound gate flows, MCP tool flow, staleness, known issues), see `docs/architecture.md`. For the engine invariant (deterministic-step / agentic-step / record / rule / promotion) and the two-surface split, see `docs/loop-engine.md`.

---

## 2. Internalization Rule (source_refs and evidence_code_ref)

**The loop does not internalize everything it touches.** It internalizes the *contract* (full authority), cites the *internal implementation* (recording, not replacement), and reads the *external system* (consumer, not source). This three-class framework is the operator-confirmed dependency-balance convention; see `docs/loop-engine.md` § "Three-class dependency balance" for the concept and `docs/philosophy.md` Pillar 4 for the deep treatment.

**The citation rule (internal-implementation class only):** when an agent needs to cite a design, finding, or external reference, **cite the code, not the markdown.** The canonical citation path is:

1. Report a `meta_state_report` finding with `evidence_code_ref` set to the code location.
2. In the record's `source_refs`, use `local:meta-state:<id>` where `<id>` is the finding's id.
3. Optional but recommended: enable mechanism re-checking on the finding and re-ground its cited path after refactors — the mechanics (auto-default, opt-out) and per-tool recipes are canonical in the `mechanism-check` and `derive-refresh` hints (`loop_get_instruction({ key: 'mechanism-check' })`).

Markdown paths (`local:plans/...`, `local:docs/...`) are the **escape hatch**, not the default. They are deprecated and rejected by `record_create_decision` for new entries. The SessionStart hook surfaces this rule in its discoverability hints: `session-start-inject-discoverability.cjs` and `session-start-inject-process-hints.cjs` inject the full hint sets as system-reminders via `hookSpecificOutput.additionalContext` (each under the 10k-char cap; the sidecar `.claude/session-context.json` remains the audit artifact).

### 2.1 Audit-trail recipe (versioned-append history)

Post-Tier-2, `meta-state.jsonl` is multi-record-per-id (v0 open + v1 resolved + … coexist on disk) and the default read collapses to one entry per id (`max_by(version)`). To inspect the full history:

```
meta_state_list({ id: "<id>", include_all_versions: true, include_archived: true })
```

`include_all_versions: true` bypasses the collapse and returns every version line, sorted by `(id, version)`; it is orthogonal to `include_archived` (a status filter), so terminal-status lines (resolved/superseded/archived) still need `include_archived: true`. Use it after `meta_state_resolve` when you need the full v1 entry, or for forensic/drift questions about what an entry looked like at version N. Do NOT use it for "show me all resolved findings" — that's `meta_state_list({ status: "resolved" })` or `include_archived: true` alone. Shell-side equivalent: `tools/scripts/registry-table.sh --all-versions`.

---

## 3. Local Fallow Gate Self-Verify (`pnpm gate:self-verify`)

**The contract.** local `pnpm fallow:gate` is not a reliable pre-push check for complexity findings. Fallow may report `crap: ?` and `introduced: true` on baselined functions when Istanbul coverage fails to match — a local artifact, NOT a real CI regression. Two coupled issues produce this:

1. **Coverage-matching artifact** — Fallow's coverage matcher can fail for some functions despite 100% statement coverage in `coverage-final.json`, yielding `crap: ?` and a false `introduced: true`.
2. **Cascading file-index desync** — editing a source file changes its SHA-256, desyncing `file-index.jsonl`, which fails the cold-tier grounding test, which produces incomplete coverage, which compounds the false positives.

**The ritual.** Use `pnpm gate:self-verify` instead of bare `pnpm fallow:gate` during fix loops. It re-seeds `file-index.jsonl` (so coverage matches current fingerprints), regenerates Istanbul coverage with `pnpm test`, then delegates to `pnpm fallow:gate`. The wrapper prints the local-verification caveat at startup.

**Cross-check rule.** If fallow reports an introduced finding that lacks `crap` or `coverage_pct`, treat it as coverage-unmatched (local artifact), not a regression. The CI SARIF is the source of truth — do not chase `introduced: true` findings locally.

**When to use which gate:**

| Gate | Use case |
|---|---|
| `pnpm test:unit` | Fast per-commit feedback (vitest unit project only; coverage off; ~1:30 wall) |
| `pnpm test:integration` | In-process composition tests (core/handlers/mastra/interface/storage; no subprocess) |
| `pnpm test:e2e` | MCP-server / CLI-subprocess tests in isolation (with coverage) |
| `pnpm test` | Full gate — all three projects + coverage (CI-authoritative; local fix-loops; pre-merge verification) |
| `pnpm fallow:gate` | Stable coverage+complexity audit AFTER refresh_file_index |
| `pnpm gate:self-verify` | Local CI-equivalent before pushing (test + coverage + fallow) |

The pre-commit hook (`simple-git-hooks.pre-commit`) runs `pnpm test:unit` for fast per-commit feedback. There is deliberately **no local pre-push hook**: CI (`test.yml`) runs the full gate (`pnpm test` + the fallow audit) as a **required merge check** on PRs and `push: main` — it is the sole authoritative gate. The R13 regression guard (`__tests__/r2/precommit-hook.test.js`) locks this invariant: `package.json` must have no `simple-git-hooks.pre-push` entry. (A local pre-push full gate was dropped in PR #124 — it was redundant with CI and outlasted the agent-harness push timeout, exit 143 mid-hook.) `pnpm gate:self-verify` remains the local fix-loop companion for pre-push confidence, not a hook. See `plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/` for the historical rationale (cold-vs-warm × coverage-on/off measurement matrix).

---

## 4. Git Union Merge Driver (one-time per-clone setup)

`.gitattributes` marks `runtime-state.jsonl`, `change-log.jsonl`, `meta-state.jsonl`, and `citations.jsonl` as `merge=union` so parallel PRs that each append a line at EOF auto-merge instead of conflicting. The citation log (`citations.jsonl`) carries the canonical asserted-relationship edges (`source:rule, target:finding, rationale:"origin"`; `source:finding, target:change-log, rationale:"consolidated into…"`; etc.). The attribute only names the driver — **the driver command must be configured in each clone** (`git config` is per-clone and not committable). Run once per clone:

```bash
git config merge.union.driver "git merge-file --union %A %O %B"
```

**Arg order is load-bearing.** `git merge-file <current> <base> <other>` writes the union result into the first argument. The driver must write into `%A` (ours — the file git reads the result from), with `%O` (ancestor) as base and `%B` (theirs) as other: `%A %O %B`. The widely-cited `git merge-file --union %O %A %B` is **wrong** — it writes the result into `%O` and leaves `%A` unchanged, so git silently keeps only "ours" and drops the other side. That is the exact data-loss the union attribute exists to prevent. Verified by a two-branch dry-run (each branch appending a change-log at the same EOF position: corrected driver keeps both lines, 0 duplicate ids; wrong driver keeps only one).

**One-time per-clone setup script:** `bash tools/scripts/setup-git-merge-drivers.sh`. Idempotent; detects a wrong-order existing config and refuses to silently overwrite (pass `--force` to overwrite). After running, `git config --get merge.union.driver` returns the canonical value. The surface is hardened with a shell test under `tools/scripts/__tests__/setup-git-merge-drivers.test.js`. Ephemeral CI runners cannot run the per-clone script, so `.github/workflows/meta-state-refs-check.yml` configures the driver via `git config merge.union.driver` in its checkout step.

**Run both per-clone git setups in one command:** `bash tools/scripts/setup-git.sh` runs this merge-driver setup and the push setup (§4b) back-to-back (merge-driver first, then push), idempotent, `--force` passes through to both. The two session-start preflight hooks (this driver + the push hook in §4b) both point here, so any red line resolves to one command. A `SessionStart` preflight hook (`tools/learning-loop-mastra/hooks/universal/session-start-git-merge-driver-preflight.cjs`) reports the driver state at session start — `canonical` / `unset` / `wrong-order` / `non-canonical` — and points to `setup-git.sh` when the driver is unset or misconfigured, closing the silent-no-op failure mode (without the driver, `merge=union` does nothing and parallel change-log PRs conflict with no warning). Read-only, fail-open, `.claude`-only (same scope as the push preflight).

Without this config, `merge=union` is a silent no-op and parallel change-log PRs hit a normal content conflict (resolvable by the manual `git merge-file --union` recipe).

---

## 4b. Git Push Setup (one-time per-clone for autonomous shells)

Autonomous shells (subagents, headless runtimes) cannot inherit the operator's interactive `SSH_AUTH_SOCK`, so a passphrase-protected SSH key blocks every push with `Permission denied (publickey)`. The same shell is the one most likely to skip local verification (`pnpm gate:self-verify`) and rely on CI-only enforcement under flake pressure, weakening the local feedback loop — auth fragility and audit-trail preservation are coupled.

**One-time per-clone setup script:** `bash tools/scripts/setup-git-push.sh` (or the combined `bash tools/scripts/setup-git.sh` from §4 to run both per-clone git setups at once). Idempotent, fail-closed, full rollback on every failure path:

- SSH remote + probe-ok → no-op (a working SSH config is never rewritten).
- SSH remote + probe-fail + `gh auth status` ok → converts `origin` from `git@github.com:…` to `https://github.com/…`, sets `credential.https://github.com.helper` to an **absolute** `!$GH_BIN auth git-credential` value, verifies write capability via `gh api repos/<owner>/<repo>` (the body must contain `"push":true` — `git ls-remote` proves read access only, so it never gates the success exit).
- SSH remote + probe-fail + no gh session → exit 1 + remediation hint, zero config drift.
- HTTPS remote + helper + gh ok → no-op.
- HTTPS remote + no helper (the read-only-trap: public repos probe OK anonymously, push 403s) → configures the helper only, URL is already https.
- Non-GitHub remote → fail closed exit 1, even with `--force`.

The mutation region is wrapped in `flock` + an `ERR` trap that restores BOTH the prior remote URL and the prior helper value, so a `.git/config.lock` mid-region failure (red-team F4 partial-mutation window) cannot leave a half-configured clone. The surface is hardened with a shell test under `tools/scripts/__tests__/setup-git-push.test.js` (cases a–j: probe-ok SSH no-op, broken-SSH convert, no-gh-session exit 1, non-GitHub fail-closed, idempotency, --force on working HTTPS, unknown-arg exit 2, write-verify rollback, HTTPS read-only-trap fix-up, helper-write-failure rollback).

**SessionStart push-preflight hook** (`tools/learning-loop-mastra/hooks/universal/session-start-git-push-preflight.cjs`) reports the clone's push mode in one line at session start, scheme-first, with honest verification labels:

- `https-gh` — HTTPS + helper + `gh auth status` ok (the only fully-write-assured mode).
- `https-unverified` — HTTPS + helper but `gh auth status` fails (pointer to setup-git.sh, the combined orchestrator).
- `https-anon` — HTTPS without helper (pointer).
- `ssh-ok` — SSH + probe succeeds.
- `broken` — SSH + probe fails AND the host is reachable (pointer).
- `unknown/offline` — probe fails AND reachability is ambiguous (no pointer — never prescribe a mutating script on an ambiguous signal).

Read-only, fail-open (any internal error → warning line, exit 0). Common case < 1s, worst case ≤ ~5s (3s probe + 2s reachability). Wired for `.claude` only alongside the merge-driver preflight hook (§4); `.factory` and `.mastracode` deferred to follow-up (the `.factory` adapter is hardcoded to the inject-* hooks, so a non-trivial extension is required before the preflight can dispatch through it).

**Scope honesty.** This setup restores the *legitimate* push path. It does NOT remove the incentive to skip local verification or bypass the pre-commit/commit-msg hooks under transient vitest flake pressure — the audit-trail-destroying bypass (e.g. `core.hooksPath=/dev/null`, `--no-verify`) is a separate, residual risk (the full gate still runs on CI regardless). A promoted gate rule detecting the bypass itself is the mitigation (proposed via `meta_state_promote_rule` for operator decision).

---

## 5. Where This Project Is Heading

The long-term direction lives in `docs/trajectory.md` — read it before reasoning about loop design. The engine invariant that underpins the trajectory is in `docs/loop-engine.md`.

---

## 6. Runtime Interface Ownership (R2)

Runtime interface code (`.claude/coordination/hooks/`, `.factory/coordination/hooks/`, `.hermes/coordination/hooks/` + `.hermes/*.json` mirrors, and for Mastra Code: declarative config in `.mastracode/{mcp,hooks,settings,database}.json`) is owned by the corresponding runtime agent. **Cross-runtime edits require operator approval.** Each runtime agent works on its own branch; cross-runtime edits require an operator-approved PR. The `interface/CONTRACT.md` conformance checklist is the loop's concern; the runtime's coordination directory is the runtime's concern. Enforcement: git branch protection + PR review + the R2 write-gate (LIM-3 caller identity + LIM-4 path traversal). See `docs/security/plan-5-hardening.md` for the gating chain, R2 allowlist schema, and the operator runbook for diagnosing `cross_runtime_write_denied`.

---

## 7. How to Approach: Placing Procedural Knowledge

When you add procedural knowledge — a triage procedure, a guardrail, a surfacing rule, a contract note — decide where it belongs on the injection × consumption two axes (see `docs/philosophy.md` § "Skills Are the Same Kind of Escape Hatch" for the model; `docs/loop-engine.md` for the invariant these axes rest on):

1. **Identify the instruction.** What is the procedure, the guardrail, or the surfacing rule you are adding? Name it before placing it.
2. **Injection axis — when does it need to surface?** If timing matters (the instruction must appear at the right moment, not when the model happens to open it), it needs *deterministic injection* — a hook or gate surfaces it — so it belongs at least at **state-2**. If the model opening it ad hoc is enough, *agentic injection* (state-1) suffices.
3. **Consumption axis — who decides?** If the content needs model judgment (read prose, weigh context, decide), consumption stays *agentic* — it lives at **state-2**, the loop's permanent home for judgment-bound content. If the judgment can be fully encoded (a rule or gate fires without the model), consumption is *deterministic* — it goes to **state-3 (encoded)**.
4. **Guardrails.** Actions on operator-judgment boundaries (consult-gates — see `docs/loop-engine.md` escape-hatch #5 "What stays human forever" and #6 "Adversarial mindset") must be deterministic: **state-3 for the guardrail**, even when the content it guards stays at state-2.
5. **Cross-reference.** `docs/loop-engine.md` for the invariant (`deterministic-step` / `agentic-step`); `docs/philosophy.md` for the two-axis model and the three states.

The lens in one line: state-1 (agentic injection, agentic consumption) is an unwired instruction the model opens ad hoc — a gap, not a permanent dependency. State-2 (deterministic injection, agentic consumption) is where the loop lives — it injects deterministically, consumes agenticly. State-3 (deterministic injection, deterministic consumption) is the terminus for what can be fully encoded.