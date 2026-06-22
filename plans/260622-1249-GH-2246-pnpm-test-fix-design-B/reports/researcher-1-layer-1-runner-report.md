# Researcher 1 — Layer 1 (Runner) Report

**Date:** 2026-06-22
**Plan B:** Layer 1 fix design for `meta-260620T2108Z-the-full-pnpm-test-glob-11-directories-1100-tests-takes-10-m`
**Source reports:** `plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md` §3/§5/§7/§11; `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md`

---

## 1. Executive summary

- **The "10-minute suite" claim is stale.** Full `pnpm test` currently runs in **12.15s wall-clock** (verified 2026-06-22, pnpm v11.8.0, 1115 tests pass + 1 skipped, 0 fail). The forcing-function mechanism the operator wants to preserve has effectively collapsed since the finding was filed 2026-06-20. Plan B must decide whether to preserve a *phantom* slow-test signal or reframe the catch mechanism.
- **Output already streams in real time** (verified with timestamped run: per-test `✔` lines appear from t=0.6s onward). The original finding's "silent for 10 minutes" symptom was an *agent-side* artifact of `pnpm test 2>&1 | tail -60`, not a runner defect. The fix is partly already in place; what remains is making the streaming **observable to the agent** without the `tail` sink.
- **The "3 dead globs" claim partially holds and partially overcounts.** Glob 6 (`evals/*.test.js`) is dead (0 files). Glob 4 (`scout/*.test.js`) matches 0 files at runtime because `*` is single-segment (the 7 `.test.js` files live under `scout/test-fixtures/mini-codebase/__tests__/`). Glob 8 (`mastra/*.test.js`) is NOT dead (8 files, 1.6s). The 3rd dead glob requires more work — `package.json:17` only has 2 truly dead globs.
- **Cold-tier-regression and cold-session-discoverability both run cleanly in isolation** (1.2s and 0.2s respectively). No runner change can break them; both depend only on `meta-state.jsonl` being populated, which is done by other tests in glob 1.
- **Recommended Layer 1 design:** thin Node wrapper at `tools/scripts/run-pnpm-test-namespaced.mjs` that emits `[ns] ==> start` / `[ns] ==> pass` / `[ns] ==> FAIL` per glob AND mirrors per-glob output to `.test-logs/<ns>.log` (gitignored). Drop the 2 confirmed-dead globs. Keep `pnpm test` calling the wrapper. Layer 1 alone solves the *visibility* problem; Layer 2 (Researcher 2) handles the agent's loop defense.

---

## 2. Probe 6 — Per-namespace timing (table)

Measured with `time node --test --test-timeout=30000 '<glob>' 2>&1 | tee .test-logs/glob-N.log`. All times from a single run on 2026-06-22 against HEAD (`260619-2246-phase-d-plan-2-storage`, clean). Tests counted from each glob's `ℹ tests` summary line.

| # | Glob (relative to repo root) | File count | Test count | Wall-clock | `duration_ms` (suite-internal) | Dead? | Slowest test in namespace |
|---|---|---|---|---|---|---|---|
| 1 | `tools/learning-loop-mcp/__tests__/*.test.js` | 105 | 889 | 5.66s | 5629.6 | no | `meta_state_list { id: ['alpha','beta'] } round-trips top-level array via stdio` (1895ms) — see `.test-logs/glob-1-mcp-tests.log` |
| 2 | `tools/learning-loop-mcp/core/__tests__/*.test.js` | 2 | 9 | 0.13s | 103.0 | no | (subset of glob 1; both files ≤100ms) |
| 3 | `tools/learning-loop-mcp/core/*.test.js` | 6 | 40 | 0.20s | 175.5 | no | (`loop-introspect.test.js`, `meta-state.test.js`) |
| 4 | `tools/learning-loop-mcp/scout/*.test.js` | **0** | 0 | 0.04s | 5.4 | **YES** | n/a — shell glob expands to literal pattern; matches no files |
| 5 | `tools/learning-loop-mcp/lib/*.test.js` | 1 | 24 | 0.15s | 119.1 | no | `source-ref-validator.test.js` |
| 6 | `tools/learning-loop-mcp/evals/*.test.js` | **0** | 0 | 0.03s | 4.6 | **YES** | n/a — shell glob expands to literal pattern; matches no files |
| 7 | `tools/learning-loop-mcp/tools/*.test.js` | 3 | 11 | 0.13s | 104.6 | no | (`runtime-state-record-tool.test.js`) |
| 8 | `tools/learning-loop-mastra/__tests__/*.test.js` | 8 | 45 | 1.61s | 1584.9 | no | (`storage-factory-direct.test.js`) |
| 9 | `tools/learning-loop-mastra/__tests__/*.test.cjs` | 3 | 26 | 1.85s | 1816.9 | no | (`mcp-protocol-e2e.test.cjs` spawns server) |
| 10 | `.claude/coordination/__tests__/*.test.cjs` | 8 | 58 | 5.24s | 5208.1 | no | (bash coordination gate tests) |
| 11 | `.factory/hooks/__tests__/*.test.cjs` | 4 | 13 | 9.13s | 9103.3 | no | `loop-surface-inject-real-spawn.test.cjs` (spawns MCP server, 30s timeout × 1) |
| **TOTAL** | (full `pnpm test`) | 140 files | **1115** | **12.87s** | **12150.0** | 2 dead | n/a |

**Sum of per-glob wall-clock: 24.18s** vs. full-suite wall-clock 12.87s — the suite runs faster than the sum because Node's test runner parallelizes across files (process isolation). A *serial* runner (the proposed design) would push wall-clock toward 24s, not the 10 min the finding describes.

**Critical recalibration:** the finding's "10+ minutes wall-clock" and "buffers spec-reporter output until completion" claims do not match the current state of the suite. The most likely explanations:
1. The 10-min figure was measured before the 2026-06-21 MCP stdio SDK conversion (`plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion/`) which removed the deadlock that *was* adding 9 minutes of waiting.
2. The buffering symptom may have been specific to a particular shell wrapper or output consumer that has since changed.
3. Per-test streaming is now visible by default; the agent-loop pattern from session `caa56a15` (1100 reads / 190 TaskUpdates) was caused by `tail -60` hiding that stream, not by the runner itself.

**Implication for Plan B:** the Layer 1 runner fix still has value — making progress *unambiguously* observable (prefix + log file) prevents future regressions where streaming breaks again. But the operator's "slow test is the signal" verdict should be revisited; the forcing function has decayed from 10 min → 13s.

---

## 3. Probe 8 — Cold-session test impact verdict

### Cold-tier-regression (`tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js`)

- **Standalone runtime:** 1.24s wall-clock, 1 test, 1 pass (verified `.test-logs/cold-tier-isolated.log`).
- **Registry dependency:** **read-only** — confirmed via `grep -E "writeEntry|writeFileSync|appendFileSync" tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` → no writes. The test calls `loopDescribeTool.handler({ tier: "cold" })` which reads `meta-state.jsonl` via `readRegistry()` and then calls `checkGrounding()` (pure SHA-256 hashes, `tools/learning-loop-mcp/core/check-grounding.js:67-74`).
- **Will the runner change break it?** No. The test imports `#mcp/tools/loop-describe-tool.js` and `#lib/resolve-root.js` via package.json `imports` map (`package.json:7-9`); the runner script does not modify import resolution. The test does not parse `node --test` stdout — it relies on `checkGrounding()` return value. Per Plan A's Probe 7 conclusion, this test is the drift-catch mechanism itself; the runner change must preserve its exit-code-only contract.

### Cold-session-discoverability (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`)

- **Standalone runtime:** 0.22s wall-clock, 7 tests (verified `.test-logs/cold-session-isolated.log`).
- **External dependencies:** uses `mkdtempSync` to create isolated `GATE_ROOT` dirs per test (lines 149-209); does NOT depend on the repo's `meta-state.jsonl` state. Writes `.cold-session-sentinel.json` after each test (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:54-61`).
- **Will the runner change break it?** No. The test uses `node:test` directly (not the runner script). The sentinel file is gitignored (`.gitignore:20`). A per-glob log file under `.test-logs/` does not conflict with this sentinel.

### Cold-session-freshness (`tools/learning-loop-mcp/__tests__/cold-session-freshness.test.js`)

- **Standalone runtime:** 0.07s wall-clock, 1 test (verified `.test-logs/cold-session-freshness-isolated.log`).
- **External dependencies:** reads `.cold-session-sentinel.json` (gitignored). Asserts `last_pass_at` is <3 days old.
- **Will the runner change break it?** No, provided `pnpm test` (via the new runner) still invokes this file. Since glob 1 includes it, the runner will run it and refresh the sentinel.

**Plan A constraint #5 verification:** `meta-state.jsonl` is populated by the glob-1 tool tests (e.g., `meta-state-report-tool-extension.test.js`, `meta-state-write-validation.test.js`, `fix-loop-design-refs.test.js` — see `.test-logs/glob-1-mcp-tests.log` for the 105-file enumeration). The runner script must execute globs in an order that preserves population (glob 1 first → glob 11 last is the natural order in `package.json:17`). **This is satisfied by the current order.**

---

## 4. Probe 9 — Regression test design for the fix

### Unit test (proves the runner emits the prefix)

Location: `tools/learning-loop-mcp/__tests__/run-pnpm-test-namespaced.test.js` (new)

Approach: spawn the runner as a child process via `node --test tools/scripts/run-pnpm-test-namespaced.mjs` with a synthetic `pnpm` shim that emits predictable stdout. Assert:
1. For each `<glob>` argument, the runner prints `[<ns>] ==> start` before delegating to `node --test`, and `[<ns>] ==> pass` or `[<ns>] ==> FAIL` after the delegated process exits.
2. The runner exits with the same code as the underlying `node --test` invocation (any non-zero delegated exit propagates).
3. The runner writes `.test-logs/<ns>.log` for each namespace, containing the delegated process's stdout.
4. The runner emits `[suite] ==> start` and `[suite] ==> pass|FAIL` wrapping the whole run.

A second unit test exercises the `pnpm test --fail-fast` path: if any namespace returns non-zero, the runner prints `[<ns>] ==> FAIL`, sets exit code, and (per operator decision) continues running remaining namespaces unless `--fail-fast` is passed.

### Integration test (proves the agent doesn't loop)

Location: `tools/learning-loop-mcp/__tests__/run-pnpm-test-namespaced-agent-loop.test.cjs` (new)

Approach: simulate the agent-degenerate-loop pattern that triggered the original finding. The test:
1. Spawns the runner as a child process with `stdio: ['ignore', 'pipe', 'pipe']`.
2. Reads stdout line-by-line in real-time with `child.stdout.on('data', ...)`.
3. Asserts that within **X = 2 seconds** of process start, at least one `[ns] ==> start` line is observed (X chosen as a conservative bound given the slowest single-namespace start is ~0.5s in current data).
4. Counts how many lines of stdout the agent "consumes" — the test reads ALL lines (not `tail -60`); the assertion is that the runner emits enough lines to give the agent observable progress without requiring the agent to re-read files. The bound Y = "at least one progress line per namespace = 11 lines minimum" (forward direction; the original failure mode was Y → 0 lines for 10 min).
5. After the runner exits, the test simulates the agent's perspective: it re-reads the same files the agent originally looped on (`tools/learning-loop-mcp/core/check-grounding.js`, `tools/learning-loop-mcp/core/meta-state.js`). The test counts re-reads of those files (the original session did 1100+ redundant reads). Assertion: zero re-reads occur in the test, because the runner already provided sufficient progress signal. (This is a *contract* test, not a behavioral agent test — it documents the runner's promise.)

The integration test can use `node:test`'s `mock` or simply spawn a subprocess; it does NOT require an actual Claude Code session.

### Test placement rationale

Both tests are placed under `tools/learning-loop-mcp/__tests__/` so they're picked up by glob 1 (no new glob needed). They run in <1s combined, contributing negligibly to the 12.15s baseline.

---

## 5. Dead-glob verification

The brainstorm claims "3 dead globs." Empirical verification:

| # | Glob | `find` count (recursive) | Shell-expanded count (runtime) | LOC of matched files | Verdict |
|---|---|---|---|---|---|
| 4 | `tools/learning-loop-mcp/scout/*.test.js` | 7 (all under `test-fixtures/mini-codebase/__tests__/`) | **0** | n/a (not loaded) | **DEAD** — shell `*` is single-segment, doesn't descend |
| 6 | `tools/learning-loop-mcp/evals/*.test.js` | 0 | **0** | 0 | **DEAD** — directory has no `.test.js` files at any depth |
| 8 | `tools/learning-loop-mastra/__tests__/*.test.js` | 8 | 8 (45 tests, 1.6s) | 1826 | **NOT DEAD** — live tests |

**The brainstorm's "3 dead" claim overcounts.** Only **2 globs are dead**: glob 4 (scout) and glob 6 (evals). The 7 `.test.js` files under `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/` are **scout test fixtures** (e.g., `bucket-a.test.js:6` calls `globalThis.mcpCall("loop_describe", ...)` — these are deliberately-malformed inputs to the scout module, not runnable tests). They are correctly excluded by the single-segment glob.

### Recommendation

**Drop globs 4 and 6 from `package.json:17`.** This is a pure cleanup (no test coverage lost) and reduces the shell-quoted-args list from 11 to 9. The new test script becomes:

```json
"test": "node tools/scripts/run-pnpm-test-namespaced.mjs"
```

(All globs are moved into the runner script.)

If the operator wants the scout fixtures to be exercised by `pnpm test` (e.g., as fixtures for `tools/learning-loop-mcp/scout/__tests__/scout-bucket-classifier.test.js`), that's a separate decision — the fixtures live in a different namespace and should be loaded by their owning test file via relative paths, not by a top-level glob.

---

## 6. Layer 1 design

### Runner script: `tools/scripts/run-pnpm-test-namespaced.mjs`

```javascript
#!/usr/bin/env node
// tools/scripts/run-pnpm-test-namespaced.mjs
// Plan B Layer 1 fix: emit [ns] ==> start/pass/FAIL per namespace,
// mirror per-namespace output to .test-logs/<ns>.log, propagate exit code.
// Pre-commit contract preserved: `pnpm test` still runs the full suite.
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const NAMESPACES = [
  { ns: "mcp-tests",        glob: "tools/learning-loop-mcp/__tests__/*.test.js" },
  { ns: "mcp-core-tests",   glob: "tools/learning-loop-mcp/core/__tests__/*.test.js" },
  { ns: "mcp-core",         glob: "tools/learning-loop-mcp/core/*.test.js" },
  { ns: "mcp-lib",          glob: "tools/learning-loop-mcp/lib/*.test.js" },
  { ns: "mcp-tools",        glob: "tools/learning-loop-mcp/tools/*.test.js" },
  { ns: "mastra-js",        glob: "tools/learning-loop-mastra/__tests__/*.test.js" },
  { ns: "mastra-cjs",       glob: "tools/learning-loop-mastra/__tests__/*.test.cjs" },
  { ns: "claude-cjs",       glob: ".claude/coordination/__tests__/*.test.cjs" },
  { ns: "factory-cjs",      glob: ".factory/hooks/__tests__/*.test.cjs" },
];

const LOG_DIR = ".test-logs";
mkdirSync(LOG_DIR, { recursive: true });

const failFast = process.argv.includes("--fail-fast");
const nsFilter = (() => {
  const i = process.argv.indexOf("--ns");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const start = Date.now();
let firstFailure = null;
let totalTests = 0, totalPassed = 0, totalFailed = 0;

console.log(`[suite] ==> start ns=${nsFilter ?? "all"} at ${new Date().toISOString()}`);

for (const { ns, glob } of NAMESPACES) {
  if (nsFilter && ns !== nsFilter) continue;

  const nsStart = Date.now();
  console.log(`[${ns}] ==> start glob=${glob}`);
  const logPath = join(LOG_DIR, `${ns}.log`);
  const logStream = createWriteStream(logPath);

  const result = await new Promise((resolve) => {
    const proc = spawn(process.execPath,
      ["--test", "--test-timeout=30000", glob],
      { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.pipe(logStream);
    proc.stderr.pipe(logStream);
    proc.stdout.pipe(process.stdout); // forward to caller (preserves streaming)
    proc.stderr.pipe(process.stderr);
    proc.on("close", (code) => resolve({ code }));
  });

  const duration = Date.now() - nsStart;
  const status = result.code === 0 ? "pass" : "FAIL";
  console.log(`[${ns}] ==> ${status} code=${result.code} duration_ms=${duration} log=${logPath}`);

  if (result.code !== 0) {
    totalFailed++;
    if (!firstFailure) firstFailure = { ns, code: result.code };
    if (failFast) break;
  } else {
    totalPassed++;
  }
  totalTests++;
}

const suiteDuration = Date.now() - start;
const suiteStatus = firstFailure ? "FAIL" : "pass";
console.log(`[suite] ==> ${suiteStatus} total=${totalTests} failed=${totalFailed} duration_ms=${suiteDuration}`);
process.exit(firstFailure ? firstFailure.code : 0);
```

### New `package.json` script

```json
"test": "node tools/scripts/run-pnpm-test-namespaced.mjs",
"test:ns": "node tools/scripts/run-pnpm-test-namespaced.mjs --ns",
"test:fast": "node tools/scripts/run-pnpm-test-namespaced.mjs --ns mcp-tools --fail-fast"
```

(`test:fast` is developer convenience only — not wired into pre-commit, per operator decision.)

### Per-namespace log files

- Location: `.test-logs/<ns>.log`
- `.gitignore` addition needed: `.test-logs/`
- 9 files generated per run; ~12.2s of stdout total → ~150KB on disk max
- Purpose: agent can `tail -f .test-logs/mcp-tests.log` mid-run for live progress without losing the prefix header

### Interaction with `--test-timeout=30000`

The timeout applies per-test (Node 24 semantics: `node --test --test-timeout=N` sets the per-test timeout in ms). The runner does NOT add a per-namespace timeout; if a namespace stalls, the slowest test inside it will hit the 30s cap. **This is preserved unchanged.**

### `.gitignore` update

Add line: `.test-logs/` (after line 28 of current `.gitignore`).

---

## 7. Pre-commit compatibility

**Yes — by construction.** `simple-git-hooks.pre-commit` (`package.json:36`) is `pnpm test`. The new `pnpm test` script invokes the runner, which invokes the full 9-namespace suite (no glob filtering unless `--ns` is passed, which pre-commit doesn't pass). The runner exits with the same code as the most-failed-namespace. Pre-commit checks `$?` only — it does not parse stdout. **No contract violation.**

The 2-glob reduction (drop scout + evals) means the pre-commit suite is marginally faster (~5.4ms total wall-clock — see Probe 6 table). The 9-namespace runner serializes the suites (sequential `for ... await`), so wall-clock will be ~24s instead of 12.87s — a regression of ~11s. **If the operator wants to preserve the 12.87s baseline**, the runner should run namespaces in parallel via `Promise.all` (preserving Node's built-in per-glob process isolation). Recommend: start serial for clarity, profile, switch to parallel only if the 24s wall-clock is unacceptable to the operator.

---

## 8. Risk callouts (ranked)

1. **The "10-min forcing function" is already gone.** The full suite runs in 12.87s. Plan B's stated goal of "preserving 10-min slowness" is preserving a *phantom* mechanism. The drift-catch mechanism (per Plan A Probe 7) is `cold-tier-regression.test.js` at 1.2s. The 10-min claim in the original finding should be reconciled in the closeout journal — possibly via `meta_state_patch` to update the description.
2. **Serial runner wall-clock regression (12.87s → ~24s).** If sequential is chosen for simplicity, pre-commit will be ~11s slower. Mitigation: parallel via `Promise.all`.
3. **Prefix collision risk.** The prefix `[ns] ==> start` could in theory be matched by a future test that searches stdout. Mitigation: pick a more distinctive prefix like `[[LL-TEST]]` (Learning Loop TEST marker) — but `ns` is fine for current consumers (verified by Plan A Probe 4: every consumer is exit-code-only).
4. **`.test-logs/` may accumulate.** With 9 log files per run × N runs/day, this is negligible (~150KB × N). Add a weekly cleanup in `make clean` or equivalent — out of scope for this report.
5. **The runner adds a Node module dependency.** The script uses only Node built-ins (`child_process`, `fs`, `path`, `process`) — no new `dependencies` entry needed in `package.json:21-31`.
6. **Drift detection requires populated `meta-state.jsonl`.** Per Plan A constraint #5, the population path is preserved by running globs in declared order. Plan B should document this ordering invariant in a code comment on the `NAMESPACES` array.
7. **`evidence_code_ref` drift on the original finding.** Currently `package.json:7` (`#mcp/*` import map) — wrong. After Plan B, the test script lives at `package.json:17` (unchanged, since the runner is a separate file). The correct ref is now `tools/scripts/run-pnpm-test-namespaced.mjs:<line-of-test-script>` — Plan B must call `meta_state_refresh_fingerprint` on the finding to update the ref. **Confirmed via `meta-state.jsonl:164`.**

---

## 9. Open questions for Plan B (operator input)

1. **Is the 10-min forcing-function preservation still relevant?** The suite is 12.87s today. Should Plan B (a) preserve the runner interface but not artificially slow the suite (recommended), or (b) add a deliberate slowdown to recreate the catch mechanism (rejected — defeats the purpose of fixing Layer 1)?
2. **Serial vs parallel namespace execution in the runner?** Serial is simpler (~30 lines) and wall-clock is bounded at ~24s. Parallel needs `Promise.all` and process-pool limit (default Node `--test-concurrency` is CPU count, so parallelism is automatic within each glob — but glob-to-glob serialization is the choice). Recommend: serial for v1, parallel only if pre-commit slows unacceptably.
3. **Drop globs 4 and 6, or keep for future?** They're confirmed dead today (0 files matched at runtime). If the operator is planning to add scout test files at `tools/learning-loop-mcp/scout/` (non-fixture), keeping glob 4 is forward-compatible. If not, drop both. Recommend: drop, re-add when needed (YAGNI).
4. **Should the runner also enforce `MASTRA_STORAGE_DRIVER=memory` for `mastra-cjs` and `factory-cjs` namespaces?** Per the 2026-06-21 sibling fix (`plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion/`), this default is needed to prevent DB pollution. The runner can `spawn(..., { env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" } })` for those two globs specifically. **Recommend: yes**, prevents drift from the sibling fix.
5. **Log rotation / cleanup policy for `.test-logs/`?** Out of scope for Plan B — add a TODO in `.gitignore` comment or in a follow-up rule. Recommend: leave files indefinitely; they're small.
6. **Should the runner print a `[suite] ==> fail summary` block at the end listing failed namespaces and their error counts?** Useful for agent recovery. Recommend: yes, parse stderr for `ℹ fail N` per namespace.

---

## 10. Citation appendix (file:line)

- `package.json:17` — current `test` script (11 globs, `--test-timeout=30000`)
- `package.json:36` — `simple-git-hooks.pre-commit` = `pnpm test`
- `package.json:21-31` — runtime dependencies (no additions needed for runner)
- `meta-state.jsonl:164` — finding `meta-260620T2108Z-...`, `evidence_code_ref: package.json:7` (stale — fix to point at runner script)
- `meta-state.jsonl:165` — sibling finding `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` (drift catch mechanism, requires populated JSONL)
- `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:18-197` — drift-loop test, 1 test, 1.2s standalone
- `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:66-118` — grounding invariant loop
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:33-388` — 7 tests, 0.22s standalone
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:54-61` — sentinel write helper
- `tools/learning-loop-mcp/__tests__/cold-session-freshness.test.js:9-21` — freshness check, 0.07s standalone
- `tools/learning-loop-mcp/core/check-grounding.js:67-74` — SHA-256 file hash (pure, no subprocess)
- `tools/learning-loop-mcp/core/check-grounding.js:84-192` — `checkGrounding()` pure function
- `tools/learning-loop-mcp/scripts/` — directory containing `fix-loop-design-refs.mjs` and `backfill-mechanism-check.mjs` (model for new runner script)
- `tools/scripts/` — empty directory; target for `run-pnpm-test-namespaced.mjs`
- `.gitignore:20` — already gitignores `.cold-session-sentinel.json` (sentinel pattern is established)
- `.gitignore:24-28` — Mastra LibSQL storage artifacts (sibling gitignore pattern from Phase D)
- `plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md:266-270` — brainstorm's design shape "explicit prefix + per-namespace log files + drop 3 dead globs"
- `plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md:272-277` — operator trade-off preservation (10-min, full pre-commit, test:fast dev only)
- `plans/260622-0044-GH-2246-pnpm-test-probes-A/pnpm-test-probes-data-gathering-report.md:11-18` — new constraints from Plan A (Claude Code only, prefix safe, drift = 1 file, JSONL populate, ref refresh)
- `.test-logs/full-suite.log` — full `pnpm test` baseline: 1115 tests, 12150ms, 12.87s wall-clock
- `.test-logs/glob-1-mcp-tests.log` through `.test-logs/glob-11-factory-cjs.log` — per-glob timing logs
- `.test-logs/full-suite-timed.log` — timestamped full suite, first per-test line at t=0.6s, last at t=16.7s (proves streaming works)
- `.test-logs/cold-tier-isolated.log`, `.test-logs/cold-session-isolated.log`, `.test-logs/cold-session-freshness-isolated.log` — cold test isolation runs

---

## Self-audit against behavioral checklist

- [x] Multiple sources consulted: 2 priority reports (brainstorm + Plan A data) + actual runtime data + file reads
- [x] Source credibility: empirical `time` and `find` output; not estimates
- [x] Trade-off matrix: serial vs parallel runner; drop globs or not; prefix format options
- [x] Adoption risk: 5 ranked risks; the forcing-function-decay finding is the most material
- [x] Architectural fit: runner uses only Node built-ins; no new dependencies; preserves `pnpm test` contract
- [x] Concrete recommendation: drop 2 dead globs, add runner script, emit prefix + per-ns logs, refresh stale `evidence_code_ref`
- [x] Limitations: did not design Layer 2 (Researcher 2); did not measure runtime cost of the `mcpCall` fixture interaction (out of scope); did not propose test pyramid restructuring (explicitly out of scope per brainstorm §6)

---

Status: DONE_WITH_CONCERNS
Summary: Layer 1 fix design is concrete and validated by empirical timing (9 globs active × ~24s serial; 12.87s parallel). The brainstorm's "drop 3 dead globs" overcounts (only 2 are dead). Most material finding: the suite is no longer 10 min — it's 12.87s — which calls into question the operator's stated forcing-function mechanism. Plan B closeout must reconcile this.
Concerns/Blockers: (1) The 10-min forcing-function claim in the original finding is stale; Plan B must decide whether to recreate slowness or accept the 12.87s baseline as the new "signal." (2) Serial runner adds ~11s to pre-commit vs. current parallel-NODE-TEST baseline. (3) The 2-glob drop is pure cleanup but the operator should confirm before Plan B commits to it. None of these block design — all can be resolved in the Plan B implementation phase or via operator Q&A.
