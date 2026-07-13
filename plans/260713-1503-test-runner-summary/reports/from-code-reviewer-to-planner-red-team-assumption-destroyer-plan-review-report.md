# Red-Team Assumption Destroyer Review: Test Runner Summary Plan

**Plan under review:** `plans/260713-1503-test-runner-summary/`
**Reviewer role:** Assumption Destroyer (hostile, codebase-evidence-anchored)
**Verification tier:** Standard (Fact Checker + Contract Verifier)
**Date:** 2026-07-13

## Summary

The plan's TAP parser skeleton is fundamentally broken against actual Node v24 TAP
output: the `parse_failed` flag fires on every passing test, the indented YAML
block regex (2-space) never matches nested subtests (6-space), and the proposed
`PROCESS_HINTS` entry shape is incompatible with the actual schema. The plan
also contains an internal count inconsistency (16 GLOBS but smoke-test asserts 15
ns lines). Several "will work" claims collapse on contact with the codebase.

---

## Finding 1: `parse_failed` fires on every passing test's YAML block
- **Severity:** Critical
- **Location:** Phase 2, Step 1 (parser skeleton), lines 193-247 of the spec
- **Flaw:** The parser sets `result.parse_failed = true` whenever it sees
  `  ---` (2-space indent + `---`) without a preceding `not ok`. But Node v24's
  TAP emitter wraps BOTH `ok` and `not ok` lines in a YAML diagnostic block.
  Every passing test emits `ok N - <name>` then `  ---` then `  type: 'test'`
  then `  ...`. The plan's parser enters inYamlBlock on the first `  ---`,
  finds `currentFailure` is null (we just incremented pass), and sets
  `parse_failed = true`. The footer override resets `total/pass/fail` from
  authoritative counters but never resets `parse_failed`. So EVERY namespace's
  NDJSON line ships with `parse_failed: true` regardless of actual outcome,
  making the agent's `parse_failed` detection useless.
- **Failure scenario:** Agent runs `pnpm test:summary`, the suite is green, but
  every ns line reports `parse_failed: true`. The agent either ignores the
  field (defeating the purpose) or treats every namespace as malformed and
  falls back to `.test-logs/<ns>.log` (the very thing the plan was supposed
  to prevent).
- **Evidence:** Actual Node v24 TAP output for 3 tests
  (verified by running `node --test --test-reporter=tap /tmp/tap-probe.test.mjs`):
  ```
  TAP version 13
  # Subtest: first test
  ok 1 - first test
    ---
    duration_ms: 0.493047
    type: 'test'
    ...
  ```
  Plan parser skeleton (Phase 2 Step 1, ~line 239): `if (line === "  ---") {
  if (!currentFailure) { result.parse_failed = true; } }` - this branch is
  hit on the first `ok 1 - first test` followed by `  ---`.
- **Suggested fix:** Only enter YAML block mode after `not ok`. For `ok`
  lines, consume the trailing YAML block without state changes. Either
  set `inYamlBlock = true` after `not ok` only (drop the standalone
  `  ---` branch entirely) or skip the `parse_failed` check for blocks
  that follow a successful test.

## Finding 2: Indented YAML block regex (2-space) misses nested subtests (6-space)
- **Severity:** Critical
- **Location:** Phase 2, Step 1 (parser skeleton), the `^  error: ` and
  `^  ...` regexes
- **Flaw:** The parser uses exact-match `line === "  ---"` and regex
  `^  error: '(.*)'$` (2-space indent) for YAML block content. But Node's
  TAP emitter indents nested subtest blocks at the subtest's depth - a
  subtest inside a `describe()` produces `      ---` and `      error: '...'`
  (6 spaces, not 2). The exact-match check `line === "  ---"` fails on
  `      ---`, so the parser never enters inYamlBlock for nested failures,
  and the `error` field stays empty.
- **Failure scenario:** A failing test inside a `describe()` block
  (e.g., a contract test in `mcp-tools` namespace) emits a YAML block with
  4-6 space indent. The parser pushes a pending failure (the `not ok`
  line matches) but the `error` line never matches, so the agent sees
  `failures[].error === "(no error message)"` - the exact opposite of the
  plan's "first line of error message" contract. The agent has to grep
  `.test-logs/<ns>.log` to learn what failed, which is the cost the plan
  was supposed to eliminate.
- **Evidence:** Real Node v24 TAP for nested subtest
  (`/tmp/tap-multi.test.mjs` with `describe("outer", () => { test("inner", ...) })`):
  ```
  # Subtest: outer
      # Subtest: inner
      ok 1 - inner
        ---
        duration_ms: 0.088262
        type: 'test'
        ...
  ```
  Plan's own test fixture in Step 2 uses `      ---` and `      error: '...'`
  (6 spaces) but the parser code uses `if (line === "  ---")` (exact 2-space
  match) - the fixture would fail against the parser it's supposed to test.
- **Suggested fix:** Use a depth-tolerant regex like `^(\s+)---\s*$` and
  `^(\s+)error: '(.*)'$`, track the indent depth at the start of each block,
  and match the closing `...` at the same depth. Or pre-normalize the
  stream to 2-space indent by stripping leading whitespace before matching.

## Finding 3: PROCESS_HINTS schema is a flat string array, not `{ key, re, hint }` objects
- **Severity:** Critical
- **Location:** Phase 3, Step 2 (append to PROCESS_HINTS)
- **Flaw:** The plan proposes adding a `{ key: "pnpm-test-summary",
  re: /pnpm test(:| )/, hint: "..." }` object to PROCESS_HINTS, with
  regex-triggered surfacing "only when the agent is about to invoke
  `pnpm test`". The actual `PROCESS_HINTS` in
  `tools/learning-loop-mastra/core/loop-introspect.js:122` is
  `Object.freeze([ ... 4 plain string entries ... ])`. Consumers
  (`loop-describe-tool.js:98`, `loop-get-instruction-tool.js:61-77`)
  call `.includes()` and array-index on the entries as strings. Adding
  objects would break the H6 ordering gate check
  (`processHints.some((h) => h.includes(rule.id))` - `.includes()` on an
  object returns false or throws). The regex-triggered surfacing mechanism
  does not exist in the schema.
- **Failure scenario:** The plan appends a `{ key, re, hint }` object.
  The H6 gate at `loop-describe-tool.js:98` calls `h.includes(rule.id)`
  on each hint; on the object this throws `TypeError: h.includes is not
  a function`, breaking `loop_describe({ tier: "warm" })` for every
  session start. Even if the shape is corrected to a plain string, the
  hint surfaces at every session start (not "only when regex matches")
  - the plan's described behavior is structurally impossible.
- **Evidence:**
  - `core/loop-introspect.js:122`: `const PROCESS_HINTS = Object.freeze(["pnpm test discipline. ...", "PR-body registry deltas. ...", ...]);`
  - `loop-describe-tool.js:98`: `processHints.some((h) => h.includes(rule.id))`
  - `loop-get-instruction-tool.js:75-77`: `hint: processHints[procIndex]` (indexed as string)
  - The plan's own disclaimer "(If the existing schema requires a
    different shape - e.g., `text` instead of `hint`, `regex` instead of
    `re` - match the local schema. This is illustrative.)" is misleading:
    the schema is strings, not objects with any field names.
- **Suggested fix:** Append a plain string to `PROCESS_HINTS` matching the
  existing 4-entry style. Accept that the hint surfaces at every session
  start, not regex-triggered. If regex-triggered behavior is genuinely
  needed, it requires a schema change (new hint type, consumer update,
  H6 gate update) - out of scope for this plan.

## Finding 4: Internal count inconsistency - 16 GLOBS but smoke-test asserts 15 ns lines
- **Severity:** High
- **Location:** Phase 1 Step 2 (GLOBS array), Phase 2 Step 4 (smoke-test),
  Phase 3 Step 5 (smoke-test)
- **Flaw:** Phase 1 adds a 16th GLOB entry (`test-globs-tests`) to
  `GLOBS`, making `GLOBS.length === 16`. Phase 2 Step 2 says "16 globs
  sequentially". But Phase 2 Step 4 (smoke-test) asserts "17 NDJSON
  lines total (1 start + 15 ns + 1 suite)" and Phase 3 Step 5
  (smoke-test) asserts `pnpm test:summary | wc -l` "expect: 17
  (1 start + 15 ns + 1 suite)". The actual count with 16 GLOBS is
  **18 lines** (1 start + 16 ns + 1 suite), not 17. The plan's
  acceptance criteria and smoke-tests will fail on the first run.
- **Failure scenario:** Implementation runs the smoke-test, `wc -l`
  reports 18, assertion expects 17. The implementer either
  (a) realizes the count is wrong and fixes the assertion (defeats the
  purpose of pinned acceptance criteria), or (b) drops the
  `test-globs-tests` entry to make the count match (breaks the unit-test
  pinning in Phase 1).
- **Evidence:** Phase 1 Step 2: `{ ns: "test-globs-tests", pattern: "tools/scripts/__tests__/*.test.js" }` (16th entry, line 149 of plan).
  Phase 2 Step 4: "17 NDJSON lines total (1 start + 15 ns + 1 suite)".
  Phase 3 Step 5: `pnpm test:summary | wc -l    # expect: 17`.
  `grep -c "ns:" tools/scripts/run-pnpm-test-namespaced.mjs` returns 15
  (pre-Phase-1) + 1 new entry = 16.
- **Suggested fix:** Update Phase 2 Step 4 and Phase 3 Step 5 to
  expect 18 NDJSON lines (1 start + 16 ns + 1 suite). Pin the count
  in `__tests__/test-globs.test.js` (already done as
  `GLOBS.length === 16`) and derive the NDJSON count from it.

## Finding 5: `pnpm test` is NOT byte-equivalent post-Phase 1 (16 namespaces vs 15)
- **Severity:** High
- **Location:** Phase 3, Acceptance Criteria: "pnpm test (existing) is
  unchanged"; Phase 3 Risk Assessment: "pnpm test must be byte-equivalent
  pre/post this phase"
- **Flaw:** The plan claims `pnpm test` is unchanged in Phase 3. But
  Phase 1 adds the `test-globs-tests` GLOB entry (16th namespace),
  which means `pnpm test` in Phase 3 now runs 16 namespaces instead
  of 15, emits 1 more `.test-logs/<ns>.log` file, and the suite
  footer changes from "15 globs" to "16 globs". The pre-commit hook
  (`simple-git-hooks.pre-commit: "pnpm test && pnpm fallow:gate"`)
  will run the larger suite. The unit tests in `tools/scripts/__tests__/`
  become load-bearing for every commit.
- **Failure scenario:** A developer whose `tools/scripts/__tests__/test-globs.test.js`
  is broken (e.g., a local edit during debug) now blocks their commit via
  the pre-commit hook. The plan says "Predecessor: pnpm test is byte-equivalent"
  but the 16-glob claim is wrong.
- **Evidence:** Phase 3 Step 5: `pnpm test 2>&1 | tail -5      # expect:
  unchanged from pre-Phase-3 (same exit code, same header line)`. Phase 1
  Step 2 adds 16th GLOB. The existing runner's suite footer is
  `[suite] ==> pass (${GLOBS.length} globs, ${totalTests} tests,
  ${elapsed}s)` - `GLOBS.length` goes from 15 to 16.
- **Suggested fix:** Acknowledge the behavioral change in Phase 1's
  acceptance criteria: "pnpm test now runs 16 namespaces (15 carried
  over + 1 new test-globs-tests). Suite footer reflects 16. The unit
  tests become pre-commit-load-bearing." Or: defer the test-globs-tests
  addition to a separate plan so Phase 1 stays byte-equivalent.

## Finding 6: `meta_state_resolve` is gated by `rule-no-orphaned-evidence` for all resolutions
- **Severity:** High
- **Location:** Phase 3, Step 4 (resolve the finding)
- **Flaw:** The plan claims `meta_state_resolve` is "a standard resolution
  path; it does not require LOOP_SESSION_MODE=live". True for the live
  gate, but the tool also consults `loadPromotedRules` for
  `resolution-evidence-required` patterns before applying the patch
  (`tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js:85-118`).
  The active global rule `rule-no-orphaned-evidence`
  (`applies_to_resolution: "*"`, `meta-state.jsonl:27`) checks that all
  active findings with `mechanism_check=true` have a matching
  `evidence_code_ref` hash. The plan modifies `package.json` (adds the
  `test:summary` script), which changes the SHA-256 fingerprint of the
  target finding's `evidence_code_ref`. If the target finding has
  `mechanism_check=true` (the schema default when `evidence_code_ref` is
  set - `meta-state.js:175-176`), the resolve will be blocked with
  `fingerprint_mismatch`. The plan doesn't address this.
- **Failure scenario:** After Phase 3 ships, the operator invokes
  `meta_state_resolve({id: "meta-260712T0730Z-test-runner-pollutes-agent-context",
  resolution: "..."})`. The tool reads the registry, finds
  `rule-no-orphaned-evidence` active, computes the current hash of
  `package.json`, compares to the stored `code_fingerprint` (or
  `file-index.jsonl` baseline), finds a mismatch (because the file just
  changed in this same plan), and returns
  `{resolved: false, reason: "resolution_evidence_required", orphans:
  [{id: "...", reason: "fingerprint_mismatch", ...}]}`. The finding
  stays `open`. The plan's "Closes: meta-260712T0730Z-..." claim is
  false.
- **Evidence:**
  - `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js:85-97`:
    consults `loadPromotedRules` + `checkResolutionEvidence` for global rules
  - `tools/learning-loop-mastra/core/gate-logic.js:652-716`: `rule-no-orphaned-evidence`
    branch computes `currentHash` via `computeFileHash(absPath)` and compares
    to `indexBaseline` or `perRecord` fingerprint
  - `meta-state.jsonl:27`: `{"id":"rule-no-orphaned-evidence", ... "applies_to_resolution":"*", "pattern":"*"}`
  - `tools/learning-loop-mastra/core/meta-state.js:175-176`: `mechanism_check`
    defaults to true when `evidence_code_ref` is set
  - The target finding has `evidence_code_ref: "package.json"` (verified
    via `grep '"id":"meta-260712T0730Z-test-runner-pollutes-agent-context"' meta-state.jsonl`)
- **Suggested fix:** Either (a) call `meta_state_refresh_file_index({path:
  "package.json"})` BEFORE `meta_state_resolve` to re-hash the file in
  the file-index baseline, (b) pass `mechanism_check: false` on the
  target finding via `meta_state_patch` before resolving, or (c) verify
  the current `code_fingerprint` in the file-index matches the new
  `package.json` hash. The plan must add this step explicitly.

## Finding 7: Plan's own nested-subtest fixture uses 6-space indent that the parser rejects
- **Severity:** Medium
- **Location:** Phase 2, Step 2 (tap-parser.test.js fixture "nested subtest")
- **Flaw:** The plan's `tap-parser.test.js` "nested subtest" test uses:
  ```
  "    not ok 1 - inner-leaf-failure",
  "      ---",
  "      error: 'something'",
  "      ...",
  ```
  (4-space and 6-space indents). The parser's `^  error: '(.*)'$` regex
  requires exactly 2 spaces. The test will assert
  `r.failures[0].test === "inner-leaf-failure"` but `r.failures[0].error`
  will be `"(no error message)"` (the fallback) because the 6-space
  `error:` line never matches. The test passes on `test` and `fail` count
  but the error capture is broken - the plan's own fixture masks the bug
  in Finding 2.
- **Failure scenario:** The implementer runs the unit test, sees it pass
  (because the assertion is on `test` name, not `error` content), and
  ships a parser that silently drops error messages for nested failures.
- **Evidence:** Plan's tap-parser.test.js Step 2 fixture:
  ```js
  test("nested subtest: failure in subtest captured with leaf name", () => {
    const tap = [
      "# Subtest: outer",
      "    not ok 1 - inner-leaf-failure",
      "      ---",
      "      error: 'something'",
      "      ...",
      "ok 1 - outer (passed with caveats)",
    ].join("\n");
    const r = parseTap(tap);
    assert.equal(r.fail, 1);
    assert.equal(r.failures[0].test, "inner-leaf-failure");
  });
  ```
  No assertion on `r.failures[0].error`. Parser regex `^  error: '(.*)'$`
  (2 spaces) does not match `      error: 'something'` (6 spaces).
- **Suggested fix:** Add `assert.equal(r.failures[0].error, "something")`
  to the nested-subtest test. If the assertion fails (it will, per Finding 2),
  the implementer is forced to fix the parser before shipping.

## Finding 8: Suite footer count overrides happen on substring prefixes (`# tests`, `# pass`, `# fail`)
- **Severity:** Medium
- **Location:** Phase 2, Step 1 (parser footer reconciliation)
- **Flaw:** The parser footer override uses
  `line.startsWith("# tests ")`, `line.startsWith("# pass ")`,
  `line.startsWith("# fail ")` to capture authoritative counts. But the
  real TAP output (verified) includes additional footer lines
  `# cancelled N`, `# skipped N`, `# todo N`, `# duration_ms N.NNN`,
  `# suites N`. The plan's parser ignores these. More importantly, a
  TAP test with a test named `# tests ` (starts with the hash and space)
  would be misclassified as a footer line. The Node TAP emitter doesn't
  emit such test names, but the parser has no guard.
- **Failure scenario:** Low-probability but possible: a test with a name
  starting with `# tests ` (e.g., a test that uses Node's `test('# tests
  regression')` API) would overwrite `result.total`. Unlikely in practice
  but the regex should be anchored to `^# tests \d+$`.
- **Evidence:** Plan parser: `if (line.startsWith("# tests "))`. Real TAP
  output includes `# tests 3`, `# pass 2`, `# fail 1`, `# cancelled 0`,
  `# skipped 0`, `# todo 0`, `# duration_ms 38.852048`, `# suites 0`.
- **Suggested fix:** Use anchored regex `^# tests (\d+)$` and similar
  for footer capture. Reject lines where the captured value is not a
  number.

## Finding 9: `parseTap` is impure across working directories (resolve(srcPath) inside)
- **Severity:** Low
- **Location:** Phase 2, Step 1 (parser skeleton, line 169-174)
- **Flaw:** The plan's `parseTap` calls `resolve(srcPath)` inside the
  function, which means the returned `file` field depends on the process's
  current working directory at call time. The plan claims `parseTap` is
  "a pure function - testable in isolation with injected TAP strings".
  Strictly, the function is deterministic given `(tapString, opts, cwd)`,
  but not referentially transparent if `cwd` changes. The unit tests
  will pass in isolation but the integration smoke-test runs from
  different `cwd` values (the script is invoked from repo root, but the
  unit tests may run from `tools/scripts/__tests__/`).
- **Failure scenario:** A future test runner change that runs the
  summary script from a workspace directory produces different
  `file` fields in the NDJSON output, breaking agent pattern-matching
  on file paths.
- **Evidence:** Plan parser: `const file = srcPath ? resolve(srcPath) : "";`
  Phase 2 architecture claims "TAP parser is a pure function - testable
  in isolation with injected TAP strings."
- **Suggested fix:** Either (a) take `cwd` as an explicit option
  (`opts.cwd`) and pass `process.cwd()` from the runner, or (b) leave
  the path as the literal `srcPath` string and let the consumer
  resolve it. Document the dependency in the function's JSDoc.

## Finding 10: `parseTap` does not handle TAP version drift (no spec version guard)
- **Severity:** Low
- **Location:** Phase 2, Step 1 (parser skeleton, "TAP version 13" header)
- **Flaw:** The parser's table claims it handles `TAP version 13` (line
  84 of plan). The plan's parser skeleton never matches a version line
  (no regex for `^TAP version`), so any TAP version is accepted. But the
  parser's behavior is version-coupled: if Node upgrades to TAP 14 with
  different block-delimiter semantics, the parser silently produces
  wrong results. The plan's "TAP spec compliance (verified 2026-07-13 on
  Node v24.18.0)" comment is correct for 24.18.0 but not future-proof.
- **Failure scenario:** Node 25 (or 24.19.0) changes the TAP emitter to
  use `   ---` (3 spaces) or moves the YAML block to a different
  location. The parser produces `parse_failed: true` for every namespace
  with no diagnostic.
- **Evidence:** Plan parser: "Ignore (header)" for `TAP version 13`
  (line 84) - no version-match code exists in the skeleton.
- **Suggested fix:** Add `if (line.startsWith("TAP version ") &&
  line !== "TAP version 13") { result.parse_failed = true; }` to detect
  unknown versions. Or document the version dependency in the file
  header and pin Node version in `package.json` engines.

---

## Process Concerns (not blocking, noted for transparency)

- The plan's "verifies TAP 13's `---` block delimiters are anchored at
  column 0" is half-right: the delimiters are at 2-space indent (not
  column 0), and the parser correctly uses `^  ---$`. But the plan
  doesn't realize that YAML blocks wrap `ok` lines too, not just
  `not ok` lines - Finding 1.
- The "namespaced runner is equivalent pre/post extraction" claim
  (Phase 1) is true at the per-namespace level but false at the
  suite-footer level (GLOBS.length changes from 15 to 16) - Finding 5.
- The plan's risk R1 ("TAP parser misreads a YAML block containing
  `---`") identifies a real edge case (the plan's fixture covers it) but
  misses the larger edge case (every `ok` line has a YAML block) -
  Finding 1.
- The plan's `import { resolve } from "node:path"` is at module level
  but `resolve()` is only called inside `parseTap()`. The import itself
  is side-effect-free. `parseTap` is pure given fixed `cwd`. The
  prompt's leading question is a false alarm - Finding 9 is the real
  concern.

---

## Recommended Next Steps

1. Rewrite the parser to handle `ok`-line YAML blocks (set
   `inYamlBlock = true` after `not ok` only; consume `ok` line blocks
   without state changes).
2. Rewrite the indented-block matching to be depth-tolerant
   (`^(\s+)---$` + depth tracking) or pre-normalize the stream.
3. Change the PROCESS_HINTS addition to a plain string matching the
   existing 4-entry style; accept unconditional surfacing.
4. Fix the smoke-test counts to 18 lines (16 GLOBS, not 15).
5. Add `meta_state_refresh_file_index({path: "package.json"})` to Phase 3
   Step 4 before the `meta_state_resolve` call, or set
   `mechanism_check: false` on the target finding first.
6. Add an assertion on `failures[0].error` in the nested-subtest
   test fixture (will fail until Finding 2 is fixed - net positive).
7. Update Phase 1 acceptance criteria to acknowledge the
   `pnpm test` behavioral change (16 namespaces, not 15).
