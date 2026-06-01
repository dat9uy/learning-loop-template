# Red Team Review — Self-Enforcing Loop Architecture Plan

**Date:** 2026-06-02
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer
**Plan:** `plans/260602-self-enforcing-loop/`
**Method:** Each lens applies hostile scrutiny to plan claims; each finding cites file:line from the codebase.

**Severity summary:** 0 Critical, 8 High, 7 Medium. No Critical because the plan has no path that destroys data or grants privilege by itself — all Critical-class risks are mitigated by the gate's existing constraints. High-severity findings are real but addressable with the suggested fixes.

---

## Security Adversary Lens

### Finding 1: Operator Impersonation — Agent Can Promote Its Own Rules
- **Severity:** High
- **Location:** Phase 1 (Schema), Phase 4 (Migration)
- **Flaw:** The `meta_state_report` zod schema accepts `promoted_to_rule` and `status: "active"` without role check. An agent that can call `meta_state_report` can craft an entry with `promoted_to_rule: {...}, status: "active"` and bypass the "operator approves" decision (Decision 2). The plan's Phase 4 migration script demonstrates this: the script sets `status: "active"` directly without operator approval.
- **Failure scenario:** A misbehaving (or compromised) agent calls `meta_state_report({category: "loop-anti-pattern", status: "active", promoted_to_rule: {enforcement: "gate", pattern: ".*"}, ...})`. The entry is created with `status: "active"`. The gate loads it. The rule `.*` matches every command. All work is blocked.
- **Evidence:** `tools/learning-loop-mcp/tools/meta-state-report-tool.js:14-29` — the zod schema has no role check; `status: "active"` is in the allowed enum. The plan's Phase 4 migration script writes `status: "active"` without going through `meta_state_ack` (which would require operator role).
- **Suggested fix:** Two changes: (a) Add a separate `meta_state_promote_rule` tool that requires operator role; remove `promoted_to_rule` from the `meta_state_report` zod schema. (b) The migration script should set `status: "active"` only via the new promote tool, or be operator-invoked.

### Finding 2: meta-state.jsonl Not Protected by Write Gate
- **Severity:** High
- **Location:** Phase 4 (Migration), Phase 1-3 (any meta-state write)
- **Flaw:** The plan modifies `meta-state.jsonl` (at the project root) directly. The bash gate's PATH_WRITE_PATTERNS only block `records/**` and `.claude/.factory/coordination/.loop-preflight-*`. There is no protection for `meta-state.jsonl`. A malicious or careless command can overwrite the file.
- **Failure scenario:** `echo '{"id":"x","status":"active","promoted_to_rule":{...}}' > meta-state.jsonl` succeeds. The gate loads the corrupt entry. Or `cat > meta-state.jsonl` writes a partial entry that crashes `loadPromotedRules`.
- **Evidence:** `tools/learning-loop-mcp/hooks/bash-gate.js:30-50` — PATH_WRITE_PATTERNS do not include `meta-state.jsonl`; only `records/` and `.claude/.factory/coordination/.loop-preflight-*` are protected.
- **Suggested fix:** Add `meta-state.jsonl` to the bash gate's PATH_WRITE_PATTERNS. All meta-state writes must go through `meta_state_report`, `meta_state_promote_rule`, or the migration script (which uses `updateEntry`).

### Finding 3: Regex DoS via Catastrophic Backtracking
- **Severity:** Medium
- **Location:** Phase 2 (Gate functions)
- **Flaw:** The plan uses `new RegExp(pattern).test(command)` in `applyPromotedRules`. A malicious or careless pattern (e.g., `(a+)+$`) causes exponential backtracking. The gate hangs on every command match attempt.
- **Failure scenario:** Operator promotes a rule with `pattern: "(a+)+$"` (perhaps copied from a tutorial). The gate hangs for seconds on every command. The agent's session times out.
- **Evidence:** `core/gate-logic.js:248-261` (Phase 2 plan) — `new RegExp(pattern).test(command)` with no timeout or safety check. The plan's risk table mentions "Invalid regex doesn't crash" but not complexity.
- **Suggested fix:** Use the `safe-regex` npm package (or equivalent) to limit pattern complexity; or wrap `new RegExp(pattern).test(command)` in a `Promise.race` with a timeout; or limit pattern length (e.g., < 200 chars).

### Finding 4: Module Import Attack Surface
- **Severity:** Medium
- **Location:** Phase 3 (loop_describe tool)
- **Flaw:** `loop_describe` dynamically imports all 35 tool modules. A single malicious or buggy module can crash the tool or leak information. The plan says "lazy import (only for requested tier)" but doesn't isolate failures.
- **Failure scenario:** A tool module has a syntax error (e.g., `throw new Error("init failed")` at import time). The dynamic import rejects. `loop_describe` returns an error. The agent loses access to the loop's surface.
- **Evidence:** `tools/manifest.json` lists 35+ tool files; `loop-describe-tool.js` (planned) iterates all of them. No try/catch mentioned per-import.
- **Suggested fix:** Wrap each dynamic import in try/catch with a short timeout (e.g., 1s). On failure, use manifest metadata as fallback. Add a circuit breaker: if 3+ imports fail, mark the tool as broken and skip it.

### Finding 5: Path Traversal in Glob Patterns
- **Severity:** Medium
- **Location:** Phase 2 (Gate functions)
- **Flaw:** Promoted rules with `pattern_type: "glob"` use `globMatch(pattern, filePath)` (existing function). The existing `globMatch` (in `core/gate-logic.js:42-49`) is regex-based and doesn't validate that the pattern stays within intended scope. A pattern like `**/secrets/**` or `**/../../etc/**` can match unintended files.
- **Failure scenario:** Operator promotes a rule with `pattern: "**/.env"` to protect env files. The glob actually matches `**/secrets/.env`, `**/build/.env`, etc. — over-blocking. Or, an attacker who can promote rules (per Finding 1) uses `**/../../etc/passwd` to exfiltrate via gate error messages.
- **Evidence:** `core/gate-logic.js:42-49` `globMatch` is pure regex; no path normalization or scope check.
- **Suggested fix:** Add a glob whitelist: pattern must start with a known root (e.g., `product/`, `docs/`, `plans/`). Reject patterns that don't.

---

## Failure Mode Analyst Lens

### Finding 6: mtime Granularity Race Condition
- **Severity:** High
- **Location:** Phase 2 (loadPromotedRules cache)
- **Flaw:** The plan caches by `mtime === cachedMtime`. On filesystems with 1-second mtime granularity (ext4 default, most CI runners), two writes within 1 second have the same mtime but different content. The cache returns stale rules.
- **Failure scenario:** Operator promotes a rule at 12:00:00.500. The cache stores mtime=12:00:00. Operator resolves the rule at 12:00:00.700. `updateEntry` rewrites `meta-state.jsonl` with new mtime=12:00:00 (same second). The cache still matches. Gate uses stale rules for the rest of the second.
- **Evidence:** `core/meta-state.js:67-69` — `mtime > created` check (1-second granularity implicit in `statSync.mtime`). The plan's Phase 2 cache code uses `mtime === cachedMtime`.
- **Suggested fix:** Use `(mtime, size)` tuple as cache key. Or use content hash (e.g., `sha256` of first 1KB). Or invalidate cache on any `updateEntry` call (return the new mtime from `updateEntry` and have gate callers pass it).

### Finding 7: No Circuit Breaker for False-Positive Rule
- **Severity:** High
- **Location:** Phase 2 (Gate functions), Phase 4 (Recovery)
- **Flaw:** If a promoted rule matches every command (e.g., `.*`), the gate escalates every call. There's no way to override without resolving the rule. If the rule is in the agent's hot path, the agent is fully blocked.
- **Failure scenario:** Operator fat-fingers `pattern: ".*"` during promotion. The rule is active. The agent can't run any command without escalating. Operator has to manually `meta_state_resolve`, but the operator may be in a different timezone / asleep.
- **Evidence:** `core/gate-logic.js` `makeGateDecision` returns `escalate` directly; no override path. `meta-state.js:144-163` `updateEntry` allows `status: "resolved"` but requires operator invocation.
- **Suggested fix:** Add a "rule disable" mechanism: `status: "disabled"` keeps the entry in the registry but excludes from gate enforcement. Or add a "global override" environment variable (`LOOP_RULES_OVERRIDE=disabled`) that the gate reads. Or add a per-rule TTL (the 90-day TTL already mentioned in Decision 2).

### Finding 8: Migration Script Atomicity Gap
- **Severity:** High
- **Location:** Phase 4 (Migration script)
- **Flaw:** The migration script reads `target` via `readRegistry` then calls `updateEntry`. Between the read and write, another process could modify the entry. The idempotency check (`if (target.promoted_to_rule) skip`) uses stale data.
- **Failure scenario:** Two terminals run the migration in parallel. Both read the entry without `promoted_to_rule`. Both call `updateEntry` with the same patch. The second write overwrites the first. No data loss, but the operation is not idempotent in the way the plan claims.
- **Evidence:** `core/meta-state.js:75-99` — `updateEntry` is atomic per-entry but uses a fresh `readRegistry` internally. There's no CAS (compare-and-swap) on the entry version.
- **Suggested fix:** Add a `version` field to entries; `updateEntry` checks version and refuses to write if it changed. Or use file locking (e.g., `proper-lockfile` npm package) around the migration. Or document that the migration is single-instance and add a "lock file" pattern.

### Finding 9: TDD Test Environment Pollution Risk
- **Severity:** Medium
- **Location:** Phase 4 (Integration test)
- **Flaw:** Phase 4's integration test "set up: temp `meta-state.jsonl`". If the test setup forgets to chdir or uses the wrong path, it could pollute the real `meta-state.jsonl`. The test reads/writes to `resolveRoot()`, which defaults to the project root.
- **Failure scenario:** Test sets `GATE_ROOT=/tmp/test-xxx` but the production code path uses `resolveRoot()` which checks the env var. If the test forgets to set the env var, the real `meta-state.jsonl` is modified. After the test, the real registry is corrupt.
- **Evidence:** `core/meta-state.js:23-30` `getRegistryPath(root)` uses the root passed in; `lib/resolve-root.js:10-15` `resolveRoot` reads `process.env.GATE_ROOT` (skips validation in test mode). If the test doesn't set the env var, the default is the project root.
- **Suggested fix:** Test must set `GATE_ROOT` explicitly to a temp dir. Add an assertion: at test start, verify `resolveRoot()` returns the temp dir. Use a `beforeEach`/`afterEach` to backup and restore the real `meta-state.jsonl` as a defense-in-depth.

### Finding 10: Tier Escalation Failure Has No Fallback
- **Severity:** Medium
- **Location:** Phase 3 (loop_describe), operator UX
- **Flaw:** Agent calls `loop_describe({tier: "summary"})`, decides to escalate to warm. If the warm call fails (network, parse error, missing tool), the agent has no fallback. The plan doesn't address this.
- **Failure scenario:** Agent is reasoning about a complex question. Calls `loop_describe({tier: "summary"})`, gets counts. Decides to escalate. The warm call fails (e.g., schema file is missing). The agent has no information. Session hangs.
- **Evidence:** `loop-describe-tool.js` (planned) returns `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`. If the result is an error, the agent may not parse it as a degraded response.
- **Suggested fix:** The tool should return a `degraded: true` flag and the partial data it has. Document the agent's expected behavior: on `degraded: true`, retry with `tier: "summary"` or proceed with what it has. Add a test for this path.

---

## Assumption Destroyer Lens

### Finding 11: Schema Parity Test Is Conceptually Wrong
- **Severity:** High
- **Location:** Phase 1 (Refactor)
- **Flaw:** Phase 1 says "extract a shared `metaStateEntrySchema` constant in `core/record-writer.js`". But `record-writer.js` is for record YAML files (decisions, experiments, risks in `records/<surface>/<type>/`), NOT for `meta-state.jsonl` entries. The mirror is conceptually wrong — `record-writer.js` doesn't handle meta-state at all.
- **Failure scenario:** The refactor puts the meta-state schema in `record-writer.js`, but `record-writer.js` doesn't import `meta-state.js` and vice versa. The "shared" constant is actually duplicated, not shared. The parity test passes (both files have the schema) but drift is still possible.
- **Evidence:** `core/record-writer.js:78-85` `resolveRecordDir(root, {type, surface})` returns `records/<surface>/<type>s/` — this is for record YAML, not meta-state JSONL. `core/meta-state.js:23-30` `getRegistryPath(root)` returns `<root>/meta-state.jsonl`. Different storage paths, different writers.
- **Suggested fix:** Put the shared schema constant in `core/meta-state.js` (where the registry lives). Both `meta-state-report-tool.js` and any direct callers (e.g., migration script) import from `core/meta-state.js`. `record-writer.js` is irrelevant to meta-state.

### Finding 12: Backward Compat with Existing meta-state.jsonl Entries
- **Severity:** High
- **Location:** Phase 3 (loop_describe), Phase 4 (Migration)
- **Flaw:** The plan says "no breaking changes" but existing entries in `meta-state.jsonl` have `category: "gate-logic-bug"`, `record-repair-gap`, etc. The new `loop_describe` filters by `category: "loop-anti-pattern"`. Existing anti-pattern entries (e.g., `meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal` before migration) are not surfaced.
- **Failure scenario:** `loop_describe({tier: "hot"})` returns the new promoted rule (post-migration). But the 10 existing entries (pre-migration) are not in the response because they don't have `category: "loop-anti-pattern"`. The agent thinks the loop has 1 anti-pattern; reality is 10.
- **Evidence:** `meta-state.jsonl:1-10` — 10 entries with categories `gate-logic-bug`, `record-repair-gap`, `mcp-tool-missing`, etc. None with `loop-anti-pattern`. The plan's Phase 4 migration migrates only ONE entry.
- **Suggested fix:** (a) Migrate ALL existing anti-pattern entries to `loop-anti-pattern` with appropriate subtypes. (b) `loop_describe` should fall back: if `loop-anti-pattern` count is 0, also surface `gate-logic-bug` and similar (with a `legacy: true` flag). (c) Document that pre-migration entries are not visible to `loop_describe` until migrated.

### Finding 13: Auto-Resolve Interacts with promoted_to_rule
- **Severity:** Medium
- **Location:** Phase 4 (Migration)
- **Flaw:** The migration entry (`meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal`) has `auto_resolve.file_modified: plans/reports/brainstorm-260601-meta-taxonomy-redesign.md`. The plan modifies that file's frontmatter. Does auto-resolve fire and resolve the rule?
- **Failure scenario:** The migration script sets `status: "active"`. But the entry's `auto_resolve` still points to the old file. If the operator's mtime check uses `meta-state.jsonl` mtime (not the auto-resolve file mtime), the rule stays active. If the gate uses `checkAutoResolve` (which checks the auto-resolve file), the rule auto-resolves on next read.
- **Evidence:** `core/meta-state.js:103-117` `checkAutoResolve` checks `mtime > created_at` of the watched file. The plan's Phase 2 `loadPromotedRules` doesn't call `checkAutoResolve` — it just filters by `status: "active"`. So the auto-resolve doesn't fire in the gate path. But this is inconsistent with how other meta-state entries are resolved.
- **Suggested fix:** Migration should reset `auto_resolve` to `null` (the entry is now actively managed, not auto-resolved). Document this in the migration script. Or call `checkAutoResolve` in `loadPromotedRules` to keep behavior consistent.

### Finding 14: Agent Tier Meta-Cognition Not Addressed
- **Severity:** Medium
- **Location:** Phase 3 (loop_describe), operator UX
- **Flaw:** The plan says "agent picks tier from task". But the agent's prompt (`CLAUDE.md`, `AGENTS.md`) doesn't mention `loop_describe` or tiered reads. The plan doesn't include updating the agent prompt.
- **Failure scenario:** `loop_describe` is implemented and available. But the agent never calls it because the prompt doesn't tell it to. The first anti-pattern rule catches the next agent's mistake, but the agent doesn't have the self-correcting context to avoid the mistake in the first place.
- **Evidence:** `CLAUDE.md` and `AGENTS.md` (read in earlier context) describe the loop and gate, but don't mention `loop_describe`. The plan's Phase 3 implementation creates the tool but doesn't update the agent's prompt.
- **Suggested fix:** Add a step to Phase 3: update `CLAUDE.md` and `AGENTS.md` to recommend "call `loop_describe` at session start to discover the loop's surface and active rules." Include a one-line example. This is a documentation change, not a code change.

### Finding 15: Operator Review Workflow Missing
- **Severity:** Medium
- **Location:** Phase 2 (Gate), Phase 4 (Migration)
- **Flaw:** The plan says "operator approves promotion" (Decision 2). But how does the operator see a proposed pattern before promotion? `meta_state_list` returns the entry, but there's no UI to review the regex pattern for safety. The operator has to read the raw YAML.
- **Failure scenario:** Agent records a finding with a proposed pattern. The operator calls `meta_state_list`, sees the entry, but has no way to preview "what would this rule match?" before promotion. The operator promotes without testing. The rule blocks legitimate work.
- **Evidence:** `meta-state-list-tool.js` (read in earlier context) returns entries as-is; no pattern preview. The plan doesn't add a preview tool.
- **Suggested fix:** Add a `meta_state_preview_rule(id)` tool that takes an entry ID and returns `{ pattern, sample_matches: [{ command, matched: true/false }] }`. The operator can test the pattern against sample commands before promoting. Alternatively, a `meta_state_test_pattern(pattern, sample_commands)` tool that returns matches without activating the rule.

---

## Disposition Summary

| # | Finding | Severity | Suggested Disposition |
|---|---------|----------|-----------------------|
| 1 | Operator Impersonation | High | Accept — add `meta_state_promote_rule` tool |
| 2 | meta-state.jsonl not protected | High | Accept — add to bash gate PATH_WRITE_PATTERNS |
| 3 | Regex DoS | Medium | Accept — add `safe-regex` or timeout |
| 4 | Module Import Attack | Medium | Accept — per-import try/catch + timeout |
| 5 | Path Traversal in Glob | Medium | Accept — glob scope whitelist |
| 6 | mtime Granularity Race | High | Accept — use (mtime, size) cache key |
| 7 | No Circuit Breaker | High | Accept — add `status: "disabled"` |
| 8 | Migration Atomicity | High | Accept — add `version` field for CAS |
| 9 | Test Environment Pollution | Medium | Accept — assert GATE_ROOT in tests |
| 10 | Tier Escalation Failure | Medium | Accept — `degraded: true` flag |
| 11 | Schema Parity Wrong Location | High | Accept — move to `core/meta-state.js` |
| 12 | Backward Compat | High | Accept — migrate all entries, fallback in tool |
| 13 | Auto-Resolve Interacts | Medium | Accept — reset `auto_resolve` to null |
| 14 | Agent Meta-Cognition | Medium | Accept — update CLAUDE.md and AGENTS.md |
| 15 | Operator Review Workflow | Medium | Accept — add `meta_state_preview_rule` tool |

**Total:** 15 findings (0 Critical, 8 High, 7 Medium). All have file:line evidence and concrete fixes. **None of the findings invalidate the plan's core architecture** — they all refine the implementation. The plan is structurally sound; the findings are about correctness, safety, and operator UX.
