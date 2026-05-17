# Red Team Review: Constraint Gate MCP Server

**Reviewer:** Failure Mode Analyst
**Date:** 2026-05-17
**Plan:** Constraint Gate MCP Server
**Files reviewed:** plan.md, phase-01 through phase-05

---

## Finding 1: Observation YAML files have duplicate keys — YAML parser crashes

**Severity:** Critical
**Location:** Phase 1, section "Implementation Steps" (step 3: file-readers.js); Phase 2, section "Architecture" (observation writer)
**Flaw:** The existing observation file `records/observations/observation-sandbox-cleanup-sudo-requirement.yaml` uses top-level `constraint:` key three times (lines 12, 17, 21). The `yaml@2.8.4` library (already in package.json dependencies) throws `DUPLICATE_KEY` error by default when parsing this file.
**Failure scenario:** `readObservations()` in `file-readers.js` encounters this file, `parseYaml()` throws, the fail-open path returns empty observations, and the gate concludes "no observation exists" → blocks a bash command that already has a documented observation. The agent is told to record an observation that already exists, creating a dead loop.
**Evidence:** Running `node -e "require('yaml').parse(require('fs').readFileSync('records/observations/observation-sandbox-cleanup-sudo-requirement.yaml','utf8'))"` produces: `YAMLParseError: Map keys must be unique at line 17, column 1`. The plan says "Malformed YAML → returns empty + logs warning" (phase-01, Tests Before section) but doesn't acknowledge that the PRODUCTION observation files already have this problem.
**Suggested fix:** Either (a) restructure the existing observation YAML to use an array of constraints instead of duplicate keys, or (b) configure `yaml.parse()` with `{ uniqueKeys: false }` and document this as a known format, or (c) use a YAML library that tolerates duplicate keys. This must be decided BEFORE implementing file-readers.js.

---

## Finding 2: Observation schema has no `constraint` field — matching logic is undefined

**Severity:** Critical
**Location:** Phase 1, section "Architecture" (gate logic step 2: `checkObservation`); Phase 3, section "Architecture" (bash-coordination-gate.cjs step 4)
**Flaw:** The plan's gate logic includes `checkObservationExists(constraintType, observations)` which assumes observations have a queryable `constraint` field. But `schemas/observation.schema.json` defines only: `id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`, `source_refs`, `notes`. The `constraint` field exists in the YAML files as an extra, schema-unvalidated key.
**Failure scenario:** The `readObservations()` function returns parsed YAML objects. The `checkObservationExists()` function needs to match `constraintType` (e.g., "docker") against observation data. But there's no schema-defined field to query. The actual observation file uses `constraint: cleanup_requires_sudo` — a freeform string, not a normalized constraint type. The plan's `matchConstraintPattern()` returns types like "docker", "sudo", but observation files use strings like "cleanup_requires_sudo", "stale_guard_deadlock". These will never match.
**Evidence:** `observation.schema.json` properties: `id, schema_version, type, status, created_at, updated_at, source_refs, notes`. No `constraint` key. The observation YAML has `constraint: cleanup_requires_sudo` (not `constraint: sudo`). The plan's `CONSTRAINT_PATTERNS` map (phase-01, step 4) uses `{ docker: /docker/, sudo: /sudo/ }` — these regex patterns won't match `cleanup_requires_sudo` unless the matching logic is designed to do substring matching on freeform text, which the plan doesn't specify.
**Suggested fix:** Define a clear mapping strategy: either (a) add `constraint_type` to observation schema as a normalized enum, or (b) define how `checkObservationExists` does fuzzy/substring matching against the freeform `constraint` field, or (c) use a different field (like `notes`) for matching. The matching semantics must be explicit.

---

## Finding 3: `pnpm validate:records` does NOT validate observation files

**Severity:** High
**Location:** Phase 2, section "Regression Gate"; Phase 2, section "Success Criteria" ("Written files pass `pnpm validate:records`")
**Flaw:** The plan's Phase 2 regression gate and success criteria claim that observation files written by `record_observation` should pass `pnpm validate:records`. But `validate-records.js` only loads records from `["claims", "experiments", "decisions", "risks", "capabilities"]` — observations are not in this list. The validation tool never touches observation files.
**Failure scenario:** An observation file could be written with invalid schema fields, missing required fields, or structural errors, and `pnpm validate:records` would still pass. The regression gate gives false confidence that observations are well-formed.
**Evidence:** `tools/validate-records/record-loader.js` line 9: `export const recordDirs = ["claims", "experiments", "decisions", "risks", "capabilities"];` — no "observations". Running `pnpm validate:records` produces no output related to observations.
**Suggested fix:** Either (a) add "observations" to `recordDirs` in `record-loader.js` and add observation schema to the schemas map in `validate-records.js`, or (b) write a separate validation command for observations, or (c) change the regression gate to use a different validation mechanism (e.g., AJV validation inside the test suite).

---

## Finding 4: Resource-budget schema does NOT extend observation schema

**Severity:** Medium
**Location:** Phase 5, section "Overview" and "Requirements"
**Flaw:** Phase 5 claims "resource-budget.schema.json extends observation.schema.json" and plans to document this inheritance. But the budget schema has no `$ref`, `allOf`, or any JSON Schema inheritance mechanism. It's a completely independent schema with different required fields (`external_system`, `resource`, `budget`, `current`, `last_verified`, `verification_method`, `validation_window`) and zero overlap with observation schema fields (`id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`, `source_refs`, `notes`). The only shared field is `id`.
**Failure scenario:** Phase 5 documents a non-existent inheritance relationship. Future developers relying on this documentation would expect changes to observation schema to propagate to budget schema, which they won't. The `$comment` addition is harmless but the documentation claim is factually wrong.
**Evidence:** `resource-budget.schema.json` has `required: ["id", "external_system", "resource", "budget", "current", "last_verified", "verification_method", "validation_window"]`. `observation.schema.json` has `required: ["id", "schema_version", "type", "status", "created_at", "updated_at", "source_refs"]`. Zero required field overlap except `id`. No `$ref` or `allOf` in either schema.
**Suggested fix:** Remove the inheritance claim. Document the actual relationship: budgets are a separate artifact type that shares the same directory (`records/observations/`) and ID convention, but has independent schema validation.

---

## Finding 5: check-budget.js cannot be "called internally" as a library

**Severity:** High
**Location:** Phase 1, section "Requirements" ("Gate calls check-budget.js for budget-constrained resources"); plan.md, section "Key Constraints" ("check-budget.js reused internally")
**Flaw:** `check-budget.js` is an ESM module that executes `main()` at the top level (line 108: `main();`). It uses `process.exit()`, `console.log()`, `console.error()`, and `process.argv` — all CLI behaviors. Importing it as a module would immediately execute the entire script including argument parsing and exit. The plan says it's "reused internally (not reimplemented)" but doesn't specify how.
**Failure scenario:** If `gate-logic.js` does `import('./check-budget.js')`, it triggers `main()` which calls `process.exit()`, killing the MCP server. If it spawns a child process, that's ~50ms overhead per gate check (acknowledged in risk table but contradicted by "reused internally" constraint). If check-budget.js is refactored to export functions, it's being reimplemented, violating the constraint.
**Evidence:** `tools/check-budget/check-budget.js` line 108: `main();` at module scope. Lines 48-49: `process.exit(2)` for missing args. Line 92-100: `process.exit(1)` / `process.exit(0)` for budget states. The script is designed as a CLI tool, not a library.
**Suggested fix:** Either (a) refactor check-budget.js to export `checkBudget()` function and guard `main()` with `if (process.argv[1] === import.meta.url)`, or (b) explicitly plan to spawn it as a child process and accept the overhead, or (c) inline the budget-checking logic in gate-logic.js and drop the "reused internally" constraint.

---

## Finding 6: Constraint pattern matching is contradictory between phases

**Severity:** High
**Location:** Phase 1, section "Architecture" (`CONSTRAINT_PATTERNS` map); Phase 3, section "Key Insights" (word-boundary regex)
**Flaw:** Phase 1 defines `CONSTRAINT_PATTERNS` as `{ docker: /docker/, sudo: /sudo/, ... }` — simple substring regex. Phase 3 says "Bash pattern matching: word-boundary regex (`\bsudo\b`), split on `;`, `&`, `|` operators". These are incompatible approaches. Simple `/docker/` matches "dockerfile", "docker-compose.yml" in cat commands, "undocumented" in echo statements. Word-boundary `\bdocker\b` is more precise but still matches `docker` in any context.
**Failure scenario:** Agent runs `cat docker-compose.yml` or `echo "see undocumented feature"` — the simple regex `/docker/` matches, the gate blocks the command because no observation exists for "docker the container runtime". The agent is forced to record an observation about docker when it was just reading a file or echoing text. False positive rate will be high with simple substring matching.
**Evidence:** Phase 1 step 4: `CONSTRAINT_PATTERNS map: { docker: /docker/, sudo: /sudo/, ... }`. Phase 3 Key Insights: "Bash pattern matching: word-boundary regex (`\bsudo\b`)". Phase 3 step 3: "Match each segment against constraint patterns (word-boundary regex)".
**Suggested fix:** Unify on one approach. Word-boundary regex is the minimum. Consider also: (a) only matching the first token of each command segment (the actual command name), or (b) using a command parser that extracts the base command before pattern matching.

---

## Finding 7: Phase 4 gate logging has no reader — log writes are fire-and-forget with no consumer

**Severity:** Medium
**Location:** Phase 4, section "Requirements" ("Gate log created at .claude/coordination/gate-log.jsonl") and "Implementation Steps" (step 4)
**Flaw:** Phase 4 adds gate logging (append to `gate-log.jsonl` on each decision) but no phase describes a reader, analyzer, or consumer for this log. The log grows unbounded (acknowledged: "Pruning deferred to v2") with no mechanism to query, alert on, or visualize gate decisions. The log is also written by `gate-logic.js` (Phase 4 step 4) which is called by both the MCP server and the hooks — but hooks are CJS and gate-logic is ESM, so the hooks can't import gate-logic.js directly.
**Failure scenario:** The gate log accumulates entries but nothing reads it. If the gate makes incorrect decisions (false blocks, missed blocks), there's no mechanism to detect this. The log becomes dead data. Additionally, if the hooks (CJS) are supposed to write to this log, they can't import the ESM gate-logic module, so only the MCP server writes entries — the hook decisions (which are the actual enforcement) are invisible.
**Evidence:** Phase 3 risk table: "CJS can't import ESM gate-logic → Inline regex patterns in hook (small duplication)". Phase 4 step 4: "Add gate logging to gate-logic.js (append to gate-log.jsonl on each decision)". Phase 5 and no other phase describe a log consumer.
**Suggested fix:** Either (a) add a Phase 4.5 that builds a simple log reader/analyzer, or (b) remove logging from v1 scope and add it when there's a consumer, or (c) have hooks write their own log entries (separate from gate-logic.js) so all enforcement decisions are captured.

---

## Finding 8: Hook ordering with existing global hooks is unspecified

**Severity:** Medium
**Location:** Phase 3, section "Key Insights" ("Existing global hooks already gate Edit/Write/Bash") and section "Implementation Steps" (step 5)
**Flaw:** The user's `~/.claude/settings.json` already has `scout-block` and `privacy-block` hooks gating `Bash|Glob|Grep|Read|Edit|Write`. Phase 3 adds coordination-specific hooks for `Edit|Write` and `Bash`. The plan doesn't specify how hook ordering works when multiple hooks match the same tool, or what happens when one hook allows and another blocks.
**Failure scenario:** Agent runs `Bash("sudo rm -rf /tmp/cache")`. The `scout-block` hook allows it (not in .ckignore). The `bash-coordination-gate` hook blocks it (no observation for sudo). Both hooks run, but what's the effective result? If hooks are AND-ed (all must allow), the block works. If OR-ed (any allows), the block is ineffective. The plan assumes blocking semantics but doesn't verify the hook execution model.
**Evidence:** `~/.claude/settings.json` has `PreToolUse` matcher `Bash|Glob|Grep|Read|Edit|Write` with `scout-block.cjs` and `privacy-block.cjs`. Phase 3 step 5 adds new matchers for `Edit|Write` and `Bash`. Claude Code documentation (not verified in codebase) says hooks are AND-ed — all must pass — but the plan doesn't state or verify this.
**Suggested fix:** Add a note in Phase 3 confirming Claude Code's hook execution semantics (all hooks must pass for the tool to execute). Add a test that verifies the interaction: scout-block allows + coordination-gate blocks = overall blocked.

---

## Finding 9: MCP server `check_gate` tool is redundant with hook enforcement

**Severity:** Medium
**Location:** plan.md, section "Overview" and "Architecture"
**Flaw:** The plan says "Hook = synchronous enforcement (blocks bad calls). MCP server = proactive tool (agent calls check_gate before acting)." But the hook already blocks bad calls. The `check_gate` MCP tool gives the agent a way to pre-check, but the agent has no incentive to call it — if the agent tries the action directly and it's blocked, the hook's error message already tells the agent what to do (record an observation). The `check_gate` tool adds complexity without changing the outcome.
**Failure scenario:** The agent never calls `check_gate` because (a) it's not in the agent's natural workflow to pre-check tools, (b) the hook already provides the block + reason feedback, and (c) the agent learns to just try the action and handle the block. The MCP server's `check_gate` tool becomes dead code. The only useful MCP tool is `record_observation`.
**Evidence:** The existing hook (skill-coordination-gate.cjs) already provides `decision`, `reason`, `coordinator`, `target_skill` in its block output. The agent can react to this feedback without a pre-check tool. The plan's architecture diagram shows the hook blocking the call — the MCP server's `check_gate` is a separate path that duplicates this logic.
**Suggested fix:** Consider making `check_gate` an optional advisory tool and focusing v1 on `record_observation` only. Or, make `check_gate` the ONLY enforcement point (remove hook blocking) — but this violates the "hook must be synchronous" constraint.

---

## Finding 10: ESM/CJS module boundary between hooks and shared logic

**Severity:** High
**Location:** Phase 3, section "Architecture" (shared utilities via `require('./lib/gate-utils.cjs')`) and section "Risk Assessment" ("CJS can't import ESM gate-logic")
**Flaw:** Phase 3 creates `lib/gate-utils.cjs` as shared CJS utilities for the hooks. Phase 1 creates `gate-logic.js` as ESM (plan says "ESM module" in phase-01 non-functional requirements). The hooks need the same constraint-matching logic that gate-logic.js has. The plan acknowledges this duplication ("Inline regex patterns in hook — small duplication") but doesn't define what's duplicated vs shared.
**Failure scenario:** Constraint patterns are defined in `gate-logic.js` (ESM) and duplicated in `lib/gate-utils.cjs` (CJS). When a new constraint type is added, both files must be updated. If only one is updated, the hook and MCP server make different gate decisions for the same action — the hook allows but the MCP server blocks, or vice versa. This is a consistency bomb.
**Evidence:** Phase 1 step 4 defines `CONSTRAINT_PATTERNS` in `gate-logic.js`. Phase 3 step 1 defines `matchConstraintPattern(command)` in `lib/gate-utils.cjs`. Phase 3 risk table: "CJS can't import ESM gate-logic → Inline regex patterns in hook (small duplication)".
**Suggested fix:** Either (a) make gate-utils.cjs the single source of truth for patterns (both hooks and MCP server import from it — the MCP server can `require()` CJS from ESM), or (b) generate the CJS patterns from the ESM source at build time, or (c) use a JSON config file for patterns that both modules read.
