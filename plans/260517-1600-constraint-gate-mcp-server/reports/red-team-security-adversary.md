# Red Team: Security Adversary Review

**Plan:** Constraint Gate MCP Server
**Date:** 2026-05-17
**Reviewer:** code-reviewer (security adversary role)

---

## Finding 1: Gate Decision Value Inconsistency Between MCP Server and Hook

- **Severity:** Critical
- **Location:** Phase 1 (section "Requirements") and Phase 3 (section "Architecture")
- **Flaw:** The MCP server returns `decision: "blocked"` and `decision: "escalate"`, but the existing hook returns `decision: "block"` (no "ed" suffix). The new bash hook in Phase 3 also returns `decision: "block"` per the existing pattern. Any consumer checking `decision === "block"` will miss MCP server responses; any consumer checking `decision === "blocked"` will miss hook responses.
- **Failure scenario:** An agent or downstream tool that checks gate decisions programmatically (e.g., the learning-loop coordinator parsing hook output) receives `"blocked"` from the MCP tool but `"block"` from the hook. If the coordinator string-matches on `"block"`, it silently ignores MCP server escalations. If it matches on `"blocked"`, it misses hook blocks. Either way, the gate's enforcement is silently broken for one path.
- **Evidence:** Phase 1 Requirements: `Returns { decision: "ok" }, { decision: "blocked", reason, observation_required }, or { decision: "escalate", reason, chain }`. Existing hook at `.claude/coordination/hooks/skill-coordination-gate.cjs:63`: `decision: 'block'` (no "ed").
- **Suggested fix:** Standardize on one vocabulary. Use `"block"` (matching existing hook convention) across both MCP server and hooks. Document the three values (`ok`, `block`, `escalate`) as the canonical set in a shared constants file.

---

## Finding 2: record_observation Tool Parameters Do Not Match Observation Schema

- **Severity:** Critical
- **Location:** Phase 2 (section "Requirements" and "Implementation Steps")
- **Flaw:** The `record_observation` tool is specified as `record_observation(type, constraint, source, details)`. The observation schema (`schemas/observation.schema.json`) requires: `id`, `schema_version`, `type` (const `"observation"`), `status`, `created_at`, `updated_at`, `source_refs`. The tool's `type` parameter conflicts with the schema's `type: "observation"` constant. The tool's `constraint` parameter is not in the schema (it's a freeform extension field used by existing observations). The tool has no parameters for `id`, `schema_version`, `status`, `created_at`, `updated_at`, or `source_refs`.
- **Failure scenario:** The tool receives `type="constraint"` from the agent, tries to write a YAML file where `type` must be `"observation"` (schema const). Either the tool silently overrides the agent's `type` value (confusing), or it passes it through and schema validation fails (broken). The `constraint` field is written as a freeform extension, but the tool doesn't generate the required `id`, `schema_version`, `status`, `created_at`, `updated_at`, or `source_refs` fields — the implementation must synthesize these, which the plan doesn't specify.
- **Evidence:** Phase 2 Requirements: `record_observation(type, constraint, source, details) tool registered`. Schema at `schemas/observation.schema.json`: `"type": { "const": "observation" }`, required fields include `id`, `schema_version`, `status`, `created_at`, `updated_at`, `source_refs`. No `constraint` field defined. Existing observation `records/observations/observation-sandbox-cleanup-sudo-requirement.yaml` has `type: observation` and freeform `constraint: cleanup_requires_sudo`.
- **Suggested fix:** Redesign the tool parameters. Accept `constraint_id`, `description`, `source_refs` as inputs. Auto-generate `id`, `schema_version` ("1.0"), `type` ("observation"), `status` ("active"), `created_at`/`updated_at` (current timestamp). Map `constraint_id` to the freeform `constraint` field. Document which fields are tool-supplied vs auto-generated.

---

## Finding 3: Constraint Pattern-to-Observation Matching Is Unspecified

- **Severity:** Critical
- **Location:** Phase 1 (section "Architecture" — `checkObservation`) and Phase 3 (section "Architecture" — bash-coordination-gate.cjs step 4)
- **Flaw:** The plan defines generic constraint types (`docker`, `sudo`, `package-manager`, `vendor-api`) via `CONSTRAINT_PATTERNS` regex map. But existing observation files use specific constraint identifiers: `cleanup_requires_sudo`, `stale_guard_deadlock`, `device_limit_blocks_reinstall`. The plan never specifies how `checkObservationExists(constraintType, observations)` maps a generic type like `"sudo"` to a specific constraint like `"cleanup_requires_sudo"`.
- **Failure scenario:** Agent runs `sudo chown root file`. Bash hook matches `sudo` pattern, looks for an observation with constraint type `"sudo"`. No observation has `constraint: "sudo"` — they have `constraint: "cleanup_requires_sudo"`. The hook blocks the command even though a relevant observation exists. The gate is overly restrictive, blocking commands that should be allowed after observation.
- **Evidence:** Phase 1 gate logic: `checkObservationExists(constraintType, observations) → boolean`. Phase 3 bash hook step 4: "If match → scan observation files for this constraint type". Actual observations: `constraint: cleanup_requires_sudo`, `constraint: stale_guard_deadlock`, `constraint: device_limit_blocks_reinstall` (in `records/observations/observation-sandbox-cleanup-sudo-requirement.yaml`).
- **Suggested fix:** Define a mapping layer between generic constraint patterns and observation constraint fields. Options: (a) observations declare which generic type they belong to (add `constraint_type: sudo` field), (b) the gate does substring matching (`constraint.includes(constraintType)`), or (c) maintain a separate constraint-type-to-observation index file. Option (a) is cleanest — add a `constraint_type` field to the observation schema or as a convention.

---

## Finding 4: Hook Spawns Child Process Despite "Synchronous Only" Constraint

- **Severity:** High
- **Location:** Phase 3 (section "Architecture" — bash-coordination-gate.cjs step 6) vs plan.md (section "Key Constraints")
- **Flaw:** The plan's Key Constraints state: "Hook must be synchronous (no MCP calls from hook — file-based checks only)". But Phase 3's bash-coordination-gate.cjs design includes step 6: "If budget constraint: call check-budget.js (spawn child process)". Spawning a child process is not a file-based check — it's a process spawn with I/O, which can hang, timeout, or deadlock.
- **Failure scenario:** The bash hook spawns `check-budget.js` via `spawnSync`. If `check-budget.js` hangs (e.g., waiting for a lock file, or the YAML file is on a stale NFS mount), the hook blocks indefinitely. Claude Code has a hook timeout, but the hook's exit behavior becomes unpredictable — it may exit with a timeout error code that neither the hook nor Claude Code handles gracefully. The "fail-open" guarantee is violated because a hung process doesn't exit at all.
- **Evidence:** Plan.md Key Constraints: "Hook must be synchronous (no MCP calls from hook — file-based checks only)". Phase 3 bash-coordination-gate.cjs step 6: "If budget constraint: call check-budget.js (spawn child process)". `check-budget.js` uses `process.argv` and `process.exit` — it's a standalone CLI tool, not a library function.
- **Suggested fix:** Either (a) extract the budget-checking logic from `check-budget.js` into a pure function that can be `require()`d from the CJS hook (no child process), or (b) read the budget YAML directly in the hook's `gate-utils.cjs` (the hook already reads observation files — budget files are just observation files with extra fields), or (c) explicitly relax the "synchronous only" constraint to "synchronous file I/O + bounded child process spawn with timeout" and document the timeout behavior.

---

## Finding 5: Phase Dependency Claim Is False

- **Severity:** High
- **Location:** plan.md (section "Dependencies")
- **Flaw:** The plan states "Phase 1-2: independent (MCP server tools)". Phase 2's regression gate includes `server.test.js` which tests MCP tool integration — this requires the MCP server from Phase 1 to exist and be functional. Phase 2's implementation step 3 says "Add `record_observation` tool to `server.js`" — this modifies the server created in Phase 1.
- **Failure scenario:** If Phase 2 is implemented in parallel with Phase 1 (as the "independent" claim allows), the implementer will find no `server.js` to modify and no MCP server to test against. The parallel execution model breaks.
- **Evidence:** Plan.md Dependencies: "Phase 1-2: independent (MCP server tools)". Phase 2 Implementation Steps: "Add `record_observation` tool to `server.js`". Phase 2 Regression Gate: `node --test tools/constraint-gate/*.test.js` (includes server.test.js which needs the MCP server).
- **Suggested fix:** Correct the dependency to "Phase 2 depends on Phase 1". Phase 2 adds a tool to the server created in Phase 1; they cannot be parallel.

---

## Finding 6: Phase 3 Claims "Separate Hooks" Architecture But Implements Shared Library

- **Severity:** Medium
- **Location:** Phase 3 (section "Key Insights" and "Architecture")
- **Flaw:** The Key Insights state "Separate hooks per tool type (not one mega-hook): fail isolation, toggle granularity, code size". But the Architecture section shows a shared `lib/gate-utils.cjs` that contains all core logic (config reading, observation reading, pattern matching, glob matching). The "separate hooks" are thin wrappers around the shared library. If `gate-utils.cjs` has a bug, all three hooks fail simultaneously — the "fail isolation" rationale is undermined.
- **Failure scenario:** A malformed `coordination-config.json` causes `readCoordinationConfig()` in `gate-utils.cjs` to throw. All three hooks (skill, write, bash) crash because they all depend on the shared utility. The "fail isolation" benefit of separate hooks is negated by the shared dependency.
- **Evidence:** Phase 3 Key Insights: "Separate hooks per tool type (not one mega-hook): fail isolation, toggle granularity, code size". Phase 3 Architecture: `lib/gate-utils.cjs` — "shared: config reading, pattern matching". All three hooks require this shared module.
- **Suggested fix:** Either (a) accept that shared utilities reduce isolation and update the rationale to "toggle granularity and code size" (drop "fail isolation"), or (b) duplicate the minimal necessary logic in each hook (true isolation at the cost of some repetition), or (c) wrap each shared utility call in try/catch within each hook so a utility failure doesn't crash the hook (fail-open).

---

## Finding 7: MCP Server Path Resolution Strategy Is Unverified

- **Severity:** Medium
- **Location:** Phase 4 (section "Key Insights")
- **Flaw:** The plan states "Claude Code sets `CLAUDE_PROJECT_DIR` in server environment — use for project-relative paths". This claim comes from the researcher report (`plans/reports/researcher-01-mcp-server-patterns.md`), not from verified Claude Code documentation. No code in the repository currently uses `CLAUDE_PROJECT_DIR`. If the variable is not set (e.g., older Claude Code version, different transport, or the researcher misread the docs), the MCP server cannot resolve paths to `coordination-config.json`, `records/observations/`, or `schemas/`.
- **Failure scenario:** MCP server starts, `process.env.CLAUDE_PROJECT_DIR` is `undefined`. Path resolution falls back to `process.cwd()`, which may be the user's home directory or `/`. File reads fail silently (fail-open), returning empty data. The gate always returns `{ decision: "ok" }` because it sees no constraints and no observations. The entire enforcement mechanism is silently disabled.
- **Evidence:** Phase 4 Key Insights: "Claude Code sets `CLAUDE_PROJECT_DIR` in server environment — use for project-relative paths". Grep for `CLAUDE_PROJECT_DIR` in codebase: only found in `plans/reports/researcher-01-mcp-server-patterns.md` and the plan itself — no production code uses it. `check-budget.js` uses `dirname(dirname(dirname(fileURLToPath(import.meta.url))))` for root resolution, not env vars.
- **Suggested fix:** Use the same root-resolution pattern as `check-budget.js`: walk up from `import.meta.url` (or `__dirname` in CJS) to find the project root. Fall back to `process.env.CLAUDE_PROJECT_DIR` only as a secondary option. Add a startup check that verifies the resolved root contains expected files (e.g., `package.json`, `.claude/coordination/`).

---

## Finding 8: No Input Sanitization on record_observation File Path

- **Severity:** High
- **Location:** Phase 2 (section "Architecture" — step 7)
- **Flaw:** The `record_observation` tool generates a filename from the `constraint` parameter: `observation-{kebab-case-slug}.yaml`. The plan specifies "Special characters sanitized to kebab-case" in tests, but doesn't define the sanitization logic. If the sanitization is naive (e.g., just replacing spaces with hyphens), a malicious or malformed constraint string like `../../etc/cron.d/evil` could escape the `records/observations/` directory via path traversal.
- **Failure scenario:** Agent (or a compromised agent) calls `record_observation` with `constraint: "../../etc/cron.d/evil"`. The filename generator produces `observation-----etc-cron-d-evil.yaml` (if sanitization strips `../`) or `observation-../../etc/cron.d/evil.yaml` (if sanitization only replaces spaces). In the second case, `writeObservation()` writes to `/etc/cron.d/evil.yaml` — arbitrary file write outside the project.
- **Evidence:** Phase 2 Architecture step 7: "Write to records/observations/observation-{slug}.yaml". Phase 2 Tests: "Special characters sanitized to kebab-case" (no definition of sanitization logic). No `path.resolve` or directory containment check specified.
- **Suggested fix:** After generating the slug, resolve the full path with `path.resolve(dir, filename)` and verify it starts with the intended `records/observations/` directory. Reject any filename that contains `..`, `/`, or `\`. Use `path.basename()` to strip directory components before slug generation.

---

## Finding 9: Gate Log Write Has No Error Handling or Rotation Plan

- **Severity:** Medium
- **Location:** Phase 4 (section "Implementation Steps" — step 4)
- **Flaw:** Phase 4 adds "gate logging to gate-logic.js (append to gate-log.jsonl on each decision)". The plan acknowledges "Gate log append-only, no rotation in v1" but doesn't specify error handling for the log write. If the log file is corrupted, locked, or the disk is full, the gate-logic function — which is the core decision maker — could throw and fail the gate check.
- **Failure scenario:** The `.claude/coordination/gate-log.jsonl` file grows to fill the disk (no rotation). The next gate check tries to append, gets `ENOSPC`. The error propagates up through `makeGateDecision()`, which was previously a pure function. The gate check fails with an exception instead of returning a decision. Claude Code receives an error instead of ok/blocked/escalate. Depending on error handling, this either crashes the session or silently allows the action (fail-open on exception, but the exception path is untested).
- **Evidence:** Phase 4 Implementation Steps: "Add gate logging to gate-logic.js (append to gate-log.jsonl on each decision)". Phase 4 Risk Assessment: "Gate log grows unbounded — Pruning deferred to v2". Phase 1 Architecture: gate-logic.js is described as "pure functions" — adding file I/O makes it impure.
- **Suggested fix:** (a) Keep gate-logic.js pure — move logging to the server handler (after the decision is made, log it separately). (b) Wrap log writes in try/catch — log failures should never block gate decisions. (c) Add a note to the operator guide about log rotation for v2.

---

## Summary

| # | Finding | Severity |
|---|---------|----------|
| 1 | Gate decision value inconsistency (blocked vs block) | Critical |
| 2 | record_observation params don't match observation schema | Critical |
| 3 | Constraint pattern-to-observation matching unspecified | Critical |
| 4 | Hook spawns child process despite "synchronous only" rule | High |
| 5 | Phase 1-2 dependency claim is false | High |
| 6 | "Separate hooks" rationale undermined by shared library | Medium |
| 7 | CLAUDE_PROJECT_DIR path resolution unverified | Medium |
| 8 | No path traversal protection on observation file writes | High |
| 9 | Gate log write can corrupt pure gate-logic function | Medium |

Three Critical findings block success: the decision vocabulary mismatch will cause silent enforcement failures, the tool parameter/schema mismatch will cause write failures or data corruption, and the unspecified constraint-to-observation mapping will cause the gate to either over-block or under-block. These must be resolved before implementation begins.
