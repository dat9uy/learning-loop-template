---
phase: 3
title: "Wire-up: package.json script + agent discovery hint + finding resolution"
status: pending
priority: P2
dependencies: ["phase-01-foundation", "phase-02-tap-implementation"]
---

# Phase 3: Wire-up

## Overview

Wire the new runner into the package manifest, expose it to the agent runtime via the discovery hint layer, document it in the project changelog, and resolve `meta-260712T0730Z-test-runner-pollutes-agent-context` with a resolution note pointing at the new tool.

This phase has **zero new logic** — every artifact is a configuration change surfacing the runners that Phases 1 and 2 produced. Total: ~5 file edits, no new files.

## Requirements

### Functional

- `pnpm test:summary` invokes `node tools/scripts/run-pnpm-test-summary.mjs` from the repo root (not from a workspace dir).
- `pnpm test:summary` exits 0 on full-pass, exits 1 on failure, **mirrors `pnpm test`'s exit-code contract** so downstream shell logic (pre-commit, CI) is not coupled to it differently.
- The agent discovery surface (`core/loop-introspect.js` `PROCESS_HINTS` or `DISCOVERABILITY_HINTS`) exposes the new script so the agent opts into it on debug iterations.
- `meta-260712T0730Z-test-runner-pollutes-agent-context` is resolved via `meta_state_resolve({id, resolution, resolved_by: "operator"})` with a resolution string referencing the new script's path.
- The pre-commit hook (`simple-git-hooks.pre-commit` in package.json) is unchanged — `pnpm test:summary` is NOT chained into pre-commit. (Humans and CI keep the verbose spec output.)

### Non-functional

- All edits are additive or comment-level changes. No deletions of existing behavior.
- Touched files are limited to: `package.json`, `tools/learning-loop-mastra/core/loop-introspect.js` (or `AGENTS.md`), `docs/project-changelog.md`, and the meta-state registry.
- No new npm dependencies. No changes to the test count or runner scripts themselves.

## Architecture

### Edit surface (5 files + 1 ledger entry)

```
package.json                                                              (+1 line, 0 deletions)
tools/learning-loop-mastra/core/loop-introspect.js                        (+1 string to PROCESS_HINTS — Object.freeze of strings)
.factory/hooks/loop-surface-inject.cjs                                   (+1 string to LOCAL_PROCESS_HINTS mirror — byte-identical)
tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js    (+1 entry to HINT_KEY_MAP_PROCESS, +1 entry to HINT_SUGGESTIONS_PROCESS)
docs/project-changelog.md                                                 (+1 sentence in the "Unreleased" section)
meta-state.jsonl                                                          (resolution note + refresh_file_index ledger entry via MCP tools, not direct file write)
```

### Why so many files (revised per Red Team Finding 1)

The PROCESS_HINTS schema is a frozen string array mirrored across 4 files (the cold-session parity test at `__tests__/legacy-mcp/cold-session-discoverability.test.cjs:360-380` enforces string-by-string parity). Omitting any of the 4 mirrors causes `pnpm test:cold-session` to fail with a drift guard violation. This is not optional wiring — it is the load-bearing invariant the entire hint discovery system depends on.

### Why so few files (conceptually)

This phase does not change behavior. It surfaces existing behavior (Phases 1 & 2) to:
1. The CLI layer (`package.json`).
2. The agent discovery layer (`loop-introspect.js` + 3 mirror files).
3. The human documentation layer (`docs/project-changelog.md`).
4. The registry of open findings (meta-state).

The TAP→NDJSON transform itself is in Phase 2's commit. Wire-up is the "make it discoverable" step.

## Related Code Files

### Modify

- `package.json` — add `test:summary` script.
- `tools/learning-loop-mastra/core/loop-introspect.js` — append string to `PROCESS_HINTS` (Red Team Finding 1; actual schema is `Object.freeze([strings])`, NOT `{key, re, hint}` objects).
- `.factory/hooks/loop-surface-inject.cjs` — append the SAME string to `LOCAL_PROCESS_HINTS` (mirror).
- `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` — append to `HINT_KEY_MAP_PROCESS` AND `HINT_SUGGESTIONS_PROCESS` (Red Team Finding 1; mirror chain).
- `docs/project-changelog.md` — changelog entry.
- `meta-state.jsonl` — via `meta_state_refresh_file_index` (Step 4a) and `meta_state_resolve` (Step 4b) (Red Team Finding 7; refresh_file_index BEFORE resolve).

### Create

- None.

### Delete

- None.

## Implementation Steps

### Step 1: Add `test:summary` to `package.json`

Current `package.json` scripts section (the relevant block):

```json
"test": "pnpm exec c8 --reporter=json --reports-directory=coverage --include \"tools/learning-loop-mastra/**/*.js\" --exclude \"**/*.test.js\" --exclude \"**/*.test.cjs\" --exclude \"**/fixtures/**\" --clean node tools/scripts/run-pnpm-test-namespaced.mjs && node tools/scripts/sanitize-coverage.mjs",
"test:debug": "node --test --test-timeout=120000 tools/learning-loop-mastra/__tests__/debug/*.test.cjs",
"test:cold-session": "node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs",
```

Add the new script **immediately after `test:cold-session`**, preserving alphabetical-ish grouping (`test`, `test:debug`, `test:cold-session`, `test:summary`):

```diff
 "test:cold-session": "node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs",
+"test:summary": "node tools/scripts/run-pnpm-test-summary.mjs",
 "check:freshness": "node --test tools/learning-loop-mastra/__tests__/freshness/*.test.js",
```

Notes on the new line:
- It uses `node` directly (NOT `pnpm exec c8 ...`) because coverage is not in scope for this script (Path A's contract keeps c8 in `pnpm test` only).
- It does not pipe through `node tools/scripts/sanitize-coverage.mjs` (no coverage JSON is produced).
- No `pnpm exec` wrapper (avoids pnpm script-resolution overhead; matches `test:cold-session`'s style).

### Step 2: Add `pnpm-test-summary` to the agent discovery layer (Red Team Finding 1)

**The schema is NOT what the original plan assumed.** Actual `PROCESS_HINTS` is `Object.freeze([...4 plain strings...])` at `tools/learning-loop-mastra/core/loop-introspect.js:122-127`. Consumers iterate the array as strings; they do NOT match on `key`/`re` properties. The plan's illustrative `{key, re, hint}` object would break the cold-session discoverability parity test at `__tests__/legacy-mcp/cold-session-discoverability.test.cjs:360-380`.

**Four files must be edited in lockstep.** The strings appended must be byte-identical across all four.

#### File A: `tools/learning-loop-mastra/core/loop-introspect.js`

Append to `PROCESS_HINTS` (the frozen string array):

```js
"pnpm test:summary. On test-debug iteration, prefer `pnpm test:summary` over `pnpm test` — emits one NDJSON line per namespace plus a suite-footer line; read the suite-footer `kind:'suite'` line and iterate on `failures[]` only, never re-read the passing-test backlog from a re-run. Raw TAP mirrored to .test-logs/<ns>.tap; sanitized summary to .test-logs/<ns>.summary.json."
```

#### File B: `.factory/hooks/loop-surface-inject.cjs` (the SessionStart hook mirror)

Append the SAME string (byte-identical) to `LOCAL_PROCESS_HINTS`. The cold-session parity test asserts `LOCAL_PROCESS_HINTS.length === PROCESS_HINTS.length` AND content-parity element-by-element.

#### File C: `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js`

Two arrays must grow in lockstep with the `PROCESS_HINTS` length. Append:

- `HINT_KEY_MAP_PROCESS` — add `{"pnpm-test-summary": 4}` (or whatever index the new string occupies). This is the slug→index map for `loop_get_instruction({key: "pnpm-test-summary"})`.
- `HINT_SUGGESTIONS_PROCESS` — append the SAME string. This is the on-demand lookup path; without this entry, `loop_get_instruction({key: "pnpm-test-summary"})` returns `Unknown hint key`.

#### Verification after the four edits:

```sh
# Confirm parity (test-globs tests will fail cold-session discoverability if not):
node tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs

# Confirm the slug resolves via on-demand lookup:
node -e "import('./tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js').then(m => console.log(JSON.stringify(m.HINT_KEY_MAP_PROCESS)))" | jq .
```

### Step 3: Add `docs/project-changelog.md` entry

Read the existing top of `docs/project-changelog.md` to find the "Unreleased" section (or create one if absent). Append a single sentence:

```markdown
## Unreleased

- **`pnpm test:summary`** — new agent-targeted test runner that emits NDJSON summary (one line per namespace + suite-footer). Mirror of `tools/scripts/run-pnpm-test-summary.mjs`. Use on debug iterations to avoid re-flooding context with passing tests; raw TAP is mirrored to `.test-logs/<ns>.tap` and sanitized summary to `.test-logs/<ns>.summary.json`. Closes `meta-260712T0730Z-test-runner-pollutes-agent-context`. Predecessor to parked `loop-design-vitest-migration-replace-node-test-and-c8`.
```

(Adjust the wording to match the project's changelog conventions — the file may already have a different section name.)

### Step 4: Resolve the meta-state finding (Red Team Finding 7 — refresh file index BEFORE resolve)

**Critical:** `package.json` is modified by Step 1 (adds `test:summary` script). The active rule `rule-no-orphaned-evidence` (per `meta-state.jsonl`) computes a SHA-256 fingerprint of the file at resolution time and compares to the stored baseline. Without an explicit `meta_state_refresh_file_index` call BEFORE `meta_state_resolve`, the resolve will be blocked by `fingerprint_mismatch`.

**Two-step ordering (mandatory):**

**Step 4a — refresh the file index for package.json:**

```
mcp__learning-loop__mastra_meta_state_refresh_file_index({
  path: "package.json",
  reason: "Phase 3 Step 1 added test:summary script; refresh fingerprint before resolving the closing finding."
})
```

**Step 4b — resolve the finding:**

```
mcp__learning-loop__mastra_meta_state_resolve({
  id: "meta-260712T0730Z-test-runner-pollutes-agent-context",
  resolution: "Path A shipped: tools/scripts/run-pnpm-test-summary.mjs (TAP-streaming wrapper with cross-invocation lock + atomic summary writes) + tools/scripts/tap-parser.mjs (Node v24 TAP-13 parser) + tools/scripts/test-globs.mjs (shared GLOBS) + tools/scripts/__tests__/{test-globs.test.js, tap-parser.test.js} + committed TAP fixtures under tools/scripts/__tests__/fixtures/. Agent invokes via pnpm test:summary. NDJSON output: 1 start line + 16 ns lines + 1 suite-footer line (18 total). Per-namespace summary mirrored to .test-logs/<ns>.summary.json; raw TAP to .test-logs/<ns>.tap. Discoverability surfaced via PROCESS_HINTS string entry in 4 files: core/loop-introspect.js, .factory/hooks/loop-surface-inject.cjs (mirror), loop-get-instruction-tool.js (HINT_KEY_MAP_PROCESS + HINT_SUGGESTIONS_PROCESS). Vitest migration deferred to loop-design-vitest-migration-replace-node-test-and-c8 (parked).",
  resolved_by: "operator"
})
```

The `resolution` text must:
- Cite the new file paths (so the registry stays useful as a lookup index).
- Note the discoverability surface (so future agents can trace the recommendation).
- Note the parked successor (so the registry doesn't re-surface vitest as a related-but-unanswered question).
- Reflect the corrected NDJSON line count (18, not 17).

### Step 5: Smoke-test `pnpm test:summary` end-to-end (Red Team Finding 10 — no SIGPIPE)

From the repo root:

```sh
# Capture all NDJSON to a temp file (no live-pipe SIGPIPE risk):
pnpm test:summary > /tmp/summary.ndjson
echo "exit=$?"                     # expect: 0

# Inspect AFTER the runner exited:
wc -l /tmp/summary.ndjson          # expect: 18 (1 start + 16 ns + 1 suite)
tail -1 /tmp/summary.ndjson | jq . # expect: suite-footer with ok=true
```

**Do NOT use `pnpm test:summary | wc -l` or `pnpm test:summary | tail -1`** — the `head`/`tail` close the pipe and SIGPIPE the runner mid-emit, truncating the NDJSON stream.

`pnpm test` byte-equivalence: After Phase 1b (15 → 16 globs), the suite-footer count IS expected to change. The Phase 3 invariant is: **`pnpm test` continues to exit 0 with 16 namespaces, all green**. Verify:

```sh
pnpm test 2>&1 | tail -5
echo "exit=$?"
```

The original Phase 3 claim "byte-equivalent pre/post" was inaccurate (Red Team Finding 6). The corrected claim is "**behaviorally equivalent modulo suite-footer count and pre-commit-load-bearing test-globs unit tests**" — `pnpm test` still passes all 16 globs and exits 0; the 16th namespace is the new test-globs unit-test suite.

### Step 6: Confirm the agent discovery hint surfaces

Re-read `core/loop-introspect.js` (File A in Step 2) to verify the new entry was added correctly. The cold-session discoverability test enforces parity at `cold-session-discoverability.test.cjs:360-380`; running it after the four edits is the verification.

This is a side-effect verification (we won't actually start a session in this plan); the verification is a re-read of the source plus a `node -e` smoke check that exports/imports cleanly.

```sh
node -e "import('./tools/learning-loop-mastra/core/loop-introspect.js').then(m => console.log(m.PROCESS_HINTS[m.PROCESS_HINTS.length - 1]))"
```

### Step 7: Run the full pnpm test once more to verify `test-globs-tests` namespace runs

The unit tests from Phase 1 (`tools/scripts/__tests__/test-globs.test.js`) and Phase 2 (`tools/scripts/__tests__/tap-parser.test.js`) are inside the new `test-globs-tests` GLOB entry added in Phase 1 Step 7. They must run as part of `pnpm test` so a regression in either hits CI.

```
pnpm test 2>&1 | grep "test-globs-tests"   # expect: one PASS line in namespaced runner output
```

## Success Criteria

- [ ] `pnpm test:summary` exits 0 on the current green tree; emits 18 NDJSON lines (1 start + 16 ns + 1 suite).
- [ ] `pnpm test` exits 0 with 16 namespaces (15 carried-over + 1 new `test-globs-tests`).
- [ ] `pkg.package.scripts["test:summary"]` exists and matches `node tools/scripts/run-pnpm-test-summary.mjs` exactly.
- [ ] All 4 PROCESS_HINTS-related files contain the byte-identical new string:
  - `tools/learning-loop-mastra/core/loop-introspect.js#PROCESS_HINTS`
  - `.factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS`
  - `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js#HINT_SUGGESTIONS_PROCESS`
  - `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js#HINT_KEY_MAP_PROCESS` (with the new slug → index mapping)
- [ ] `node tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` passes (parity test enforces the 4-file mirror).
- [ ] `node -e "import('./tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js').then(m => console.log(JSON.stringify(m.HINT_KEY_MAP_PROCESS)))"` shows the new slug mapped to the correct index.
- [ ] `docs/project-changelog.md` has an "Unreleased" entry mentioning `pnpm test:summary`, the finding it closes, and the parked vitest successor.
- [ ] `meta_state_list({id: "meta-260712T0730Z-test-runner-pollutes-agent-context"})` returns `status: "resolved"` with the resolution text from Step 4b.
- [ ] `pnpm test` runs `test-globs-tests` namespace (containing both `test-globs.test.js` and `tap-parser.test.js`) — observable in the namespaced runner's per-namespace logs.

## Risk Assessment

### Risk: `package.json` script typo breaks the package manifest

**Severity:** Low. **Mitigation:** `pnpm` rejects malformed `scripts` on install. The smoke check in Step 5 (running `pnpm test:summary` and verifying exit 0) catches any path or quoting error immediately.

### Risk: PROCESS_HINTS string differs across the 4 mirror files (drift)

**Severity:** Critical (Red Team Finding 1). **Mitigation:** Step 2's verification commands run `cold-session-discoverability.test.cjs` AFTER the 4 edits; the test asserts byte-level parity of `PROCESS_HINTS` ↔ `LOCAL_PROCESS_HINTS`. If any of the 4 files diverges, the test fails immediately at the gate.

### Risk: `meta_state_resolve` blocked by `rule-no-orphaned-evidence`

**Severity:** High (Red Team Finding 7). **Mitigation:** Step 4a calls `meta_state_refresh_file_index({path: "package.json"})` BEFORE Step 4b's `meta_state_resolve`. The refresh updates the SHA-256 fingerprint for `package.json` so the gate's `fingerprint_mismatch` branch does not fire.

### Risk: `pnpm test:summary` SIGPIPE during smoke test (closing the pipe truncates the NDJSON stream)

**Severity:** Medium (Red Team Finding 10). **Mitigation:** Step 5's smoke recipe captures to a temp file via `>` redirection (no live pipe), then inspects AFTER the runner exits. The recipe explicitly forbids `pnpm test:summary | wc -l` or `| tail -1` patterns.

### Risk: Concurrent `pnpm test` and `pnpm test:summary` interleave logs

**Severity:** Medium (Red Team Finding 8). **Mitigation:** Phase 2's runner acquires `proper-lockfile` on `.test-locks/pnpm-test-summary.lock`; the namespaced runner does not take this lock. There is a small race window where both pass the lock check then both contend on the file-backed SQLite Mastra DB; this is a known limitation, documented in Phase 2's risk table. Future cross-suite coordination is out of scope.

### Risk: `PROCESS_HINTS` schema differs from the local shape

**Severity:** Low. **Mitigation:** Step 2 explicitly says "match the local schema". The implementation session must read the existing entries' shape and mirror them. If the schema is unknown, fall back to a literal key-shape match (read N existing entries, copy their field names verbatim).

### Risk: Meta-state MCP tool call fails due to operator-mode gate

**Severity:** Low. **Mitigation:** `meta_state_resolve` is a standard resolution path; it does not require `LOOP_SESSION_MODE=live` (only `promote_rule` and `dispatch_finding` do). If the call fails, surface the error verbatim and ask the operator to retry.

### Risk: Adding a new entry to `PROCESS_HINTS` makes the agent verbose at session start

**Severity:** Very Low. **Mitigation:** The hint is `key`-addressable and surfaces only when the regex matches the agent's current activity. The regex `/pnpm test(:| )(--|test|:cold-session|:debug|:summary)/` triggers only when the agent is about to invoke any variant of `pnpm test`. Idle sessions are unaffected.

### Risk: Resolution text in the meta-state registry loses the parked-loop-design linkage

**Severity:** Very Low. **Mitigation:** Step 4 explicitly mentions `loop-design-vitest-migration-replace-node-test-and-c8 (parked)` in the resolution. The original finding's `loop_design_vitest_migration_replace_node_test_and_c8.addresses[0] === meta-260712T0730Z-test-runner-pollutes-agent-context` references survive the resolution (the loop-design entry is unaffected; only the finding's status flips).

### Risk: `pnpm test` no longer runs the test-globs unit tests because the new GLOB entry uses `*.test.js` but the unit tests are at `tools/scripts/__tests__/*.test.js`

**Severity:** Already mitigated. The GLOB pattern in Phase 1 Step 7 is `tools/scripts/__tests__/*.test.js` — verified via existing namespace patterns (e.g., `tools/learning-loop-mastra/__tests__/legacy-mcp/*.test.js`) that this glob style works for paths under `tools/scripts/`.

## Follow-ups (Post-Plan)

After this plan ships, the agent runtime should:
1. Verify `pnpm test:summary` is the default path for agent-side test debugging. The `PROCESS_HINTS` regex covers the common cases but not every variant (e.g., `npx pnpm test` won't match) — extended coverage is a Phase 2 of the parked loop-design, not this plan.
2. The `meta-260712T0730Z` finding does not need to be re-opened. If the agent observes a NEW agent-context-cost issue distinct from "re-reading the passing backlog" (e.g., NDJSON parsing fails), that's a separate finding.
3. If a future plan migrates to vitest (per the parked loop-design), it can supersede `loop-design-vitest-migration-replace-node-test-and-c8` (flip `active` → `inactive`, set `shipped_in_plan`).
