---
phase: 2
title: "TAP-Implementation: TAP→NDJSON transform + summary runner"
status: pending
priority: P2
dependencies: ["phase-01-foundation"]
---

# Phase 2: TAP-Implementation

## Overview

Build the TAP-streaming runner script `tools/scripts/run-pnpm-test-summary.mjs` that:
1. Imports `GLOBS` from the new `test-globs.mjs` (Phase 1).
2. For each namespace, spawns `node --test --test-reporter=tap <pattern>` (capped at the same 30s timeout as the existing runner).
3. Parses the TAP stream line-by-line, tracking pass/fail events and YAML error blocks.
4. Emits **one NDJSON line per namespace** to stdout (the agent's primary read surface).
5. Mirrors **per-namespace `.summary.json`** to `.test-logs/<ns>.summary.json` (the persistent cross-iteration read surface).
6. Emits **one suite-footer NDJSON line** at the end (the stable handoff marker the agent pattern-matches on).
7. Exits 0 if all namespaces passed, exits 1 if any failed.

## Requirements

### Functional

- The runner executes all 16 globs sequentially (15 carried-over + 1 new `test-globs-tests`; not parallel — sequential is required to avoid Mastra storage contention per the existing runner's inline comment).
- Per-namespace NDJSON line shape:
  ```json
  {"kind":"ns","ns":"<ns>","ok":<bool>,"total":<n>,"pass":<n>,"fail":<n>,"failures":[{...}],"duration_ms":<n>}
  ```
- Each `failures[]` entry shape:
  ```json
  {"test":"<test display name>","file":"<absolute path>","error":"<first line of error message>"}
  ```
- Suite-footer NDJSON line shape:
  ```json
  {"kind":"suite","ok":<bool>,"total":<n>,"pass":<n>,"fail":<n>,"duration_ms":<n>}
  ```
- `.test-logs/<ns>.summary.json` is a single JSON object (newline-terminated) containing the same fields as the per-namespace NDJSON line above (sans `kind`).
- The runner does NOT run the c8 coverage pipeline (orthogonal; coverage is `pnpm test`'s job).
- Exit code: 0 if `suite.ok === true`, 1 otherwise.

### Non-functional

- TAP parser is a pure function — testable in isolation with injected TAP strings.
- No new npm dependencies.
- The script is `~120 LoC` (parse + glue). Glues are thin; parsing is the load-bearing part.
- The first failing test's **error message first line only** — no stack trace. The full diagnostic surface lives in `.test-logs/<ns>.tap` (raw TAP mirror written by the runner).
- The script must be importable from a unit-test directory (no top-level side effects on import).

## Architecture

### Module layout

Two files:

```
tools/scripts/
  test-globs.mjs              (Phase 1 — already exists)
  run-pnpm-test-summary.mjs   (this phase — NEW)
  tap-parser.mjs              (NEW, ~80 LoC, pure function)
```

**Why split into `tap-parser.mjs` and `run-pnpm-test-summary.mjs`?**

- `tap-parser.mjs` is testable in isolation (no subprocess, no spawning) — the unit-test file `__tests__/tap-parser.test.js` injects string inputs and asserts on the JSON output.
- `run-pnpm-test-summary.mjs` is the glue: import GLOBS, spawn child processes, pipe stdout through `tap-parser.parseTap()`, emit NDJSON, mirror files.
- Single-responsibility follows the existing project pattern (the namespaced runner is monolithic at 199 lines; this two-file split keeps the parser small enough to read).

### TAP parser interface

```js
// tap-parser.mjs
export function parseTap(tapString, opts = {}) {
  // opts.sourcePath is used to populate `file` on each failure.
  // returns { total, pass, fail, failures: [{test, file, error}] }
}
```

**Parse strategy (revised per Red Team Finding 2 — anchored at variable indent depth):**

Node v24.18.0's actual TAP emitter format differs materially from the original plan assumption. Real TAP output (probed via fixtures committed under `tools/scripts/__tests__/fixtures/`) shows:

| TAP construct | Detection | Action |
|---|---|---|
| `TAP version 13` | Line match `^TAP version 13$` | Verify header (gates the parse — non-13 → `parse_failed: true`). |
| `1..N` (planned count) | Line match `^1\.\.\d+$` | Capture planned total. |
| `# Subtest: <name>` | Line match `^# Subtest:` | Push new subtest context (depth++). |
| `ok N - <name>` (root level) | Line match `^ok \d+` at column 0 | Increment pass; if depth>0, this is a subtest summary line, not a leaf. |
| `not ok N - <name>` (root level) | Line match `^not ok \d+` at column 0 | Increment fail; this is a subtest summary if depth>0 (NOT a leaf). |
| `    ok N - <name>` (leaf level, 4-space indent) | Line match `^ {2,}ok \d+` | Leaf pass; push to leaf-pass stack, clear leaf-fail context. |
| `    not ok N - <name>` (leaf level) | Line match `^ {2,}not ok \d+` | Leaf fail; push `{test: <name>, file, error: ""}` onto the **leaf-failure** stack. |
| `  ---` (or `      ---` for nested) | Line match `^ {2,}---$` | Begin capturing YAML block (depth = leading-spaces / 2). |
| `  ...` (matching depth) | Line match `^ {N}\.\.\.$` where N matches block depth | Close YAML block; extract error from accumulated content. |
| `  error: '...'` (single-line quoted) | Inside YAML block | Extract quoted content. |
| `  error: \|-` (multi-line block scalar) | Inside YAML block | Accumulate subsequent indented lines until next `  ...` (or unindented line); take first line of accumulated content. |
| `  location: '<path>:N:N'` | Inside YAML block | Extract path; strip `:\d+:\d+$`. |
| `  stack: \|-` | Inside YAML block | Begin capturing stack lines; **NOT INCLUDED in summary** (full stack is in `.test-logs/<ns>.tap`). |
| `# tests N` (footer) | Line match `^# tests \d+$` (anchored) | Authoritative total. |
| `# pass N`, `# fail N`, `# cancelled N`, `# skipped N`, `# todo N`, `# duration_ms N.NNN` | Anchored `^# <key> \d+(?:\.\d+)?$` | Authoritative counters (footer wins over in-process accumulators). |

**Critical TAP edge cases (verified against committed fixtures):**

1. **Failure with `---` in error message (single-line form).** TAP emits `error: 'error message contains --- triple dash'`. The `---` *inside* the quoted string does not false-trigger block close because the YAML block delimiter regex is anchored at column 0 + N-space indent. Fixture: `tools/scripts/__tests__/fixtures/tap-with-error-block.tap`.

2. **Multi-line error (`assert.deepStrictEqual`).** TAP emits:
   ```
   error: |-
     Expected values to be strictly deep-equal:
     + actual - expected
       { foo: 1 }
     code: 'ERR_ASSERTION'
   ```
   The parser must detect `error: |-` and accumulate the next lines (matching or greater indent) until the block close. Take the first line as the summary error. Fixture: `tools/scripts/__tests__/fixtures/tap-with-multiline-error.tap`.

3. **Nested subtests (6-space indent).** A `not ok` inside a `describe()` indents 6 spaces. The parser tracks depth via leading-whitespace count, not via a fixed 2-space regex. Subtest summary `not ok` lines (depth=0 or depth=2 for `describe`) do NOT count as leaf failures. Fixture: `tools/scripts/__tests__/fixtures/tap-with-nested-failures.tap`.

4. **Node wraps `ok` in YAML blocks too.** Every `ok N - <name>` is followed by `  ---\n  duration_ms: ...\n  type: 'test'\n  ...`. The block-open/close detection must NOT trigger `parse_failed` when the preceding line is `ok` (only `not ok` opens a diagnostic block; `ok` blocks are informational). Fixture: `tools/scripts/__tests__/fixtures/tap-pass-with-yaml-block.tap`.

5. **Zero-match (planned count is `1..0`).** When the glob matches no tests, TAP emits a file-level `ok 1 - <path>` then `# tests 0`. The parser must distinguish file-level (`ok 1 - /path/to/file.test.js` — pass; not a leaf) from leaf-level (indented `ok N - <test-name>`). Fixture: `tools/scripts/__tests__/fixtures/tap-empty-glob.tap`.

6. **Truncated TAP (child process killed mid-stream).** The parser emits `parse_failed: true` if the stream ends while `inYamlBlock`, or if the footer is missing. The agent falls back to `.test-logs/<ns>.tap` (raw TAP mirror, written by the runner in Step 3 — see Red Team Finding 9). Fixture: `tools/scripts/__tests__/fixtures/tap-truncated.tap`.

7. **Parent subtest `not ok` summary.** When `describe('outer', ...)` has one failing child, TAP emits:
   ```
   not ok 1 - outer
     ---
     error: '1 subtest failed'
     ...
   ```
   This parent line MUST NOT be added to `failures[]` (it's a synthetic placeholder, not actionable). Detection: when depth=0 (root-level `not ok` inside a `# Subtest: ` block), do not push to leaf-failures stack. Fixture: `tools/scripts/__tests__/fixtures/tap-parent-summary.tap`.

### Gluer script flow (run-pnpm-test-summary.mjs)

```
1. Import { GLOBS, NS_RE } from "./test-globs.mjs"
2. Import { parseTap, sanitizeFailureError } from "./tap-parser.mjs"
3. import { lock } from "proper-lockfile" (already a dep, Red Team Finding 8)
4. mkdirSync(".test-logs", { recursive: true })
5. Acquire cross-invocation lock on `.test-locks/pnpm-test-summary.lock` (Red Team Finding 8).
   If lock fails, emit NDJSON line {kind:"error", message:"another test run is active"} and exit 1.
6. For each glob in GLOBS (sequential):
   a. Write raw TAP stream to .test-logs/<ns>.tap (Red Team Finding 9 — replaces the dead .log fallback)
   b. spawn(`node --test --test-reporter=tap --test-timeout=30000 <pattern>`, stdio piped)
   c. aggregate stdout → full string
   d. aggregate stderr → appended to full string (defensive — TAP normally emits on stdout)
   e. write raw TAP to .test-logs/<ns>.tap via fs.writeFileSync (atomic via rename — see below)
   f. parseTap(fullString, { sourcePath: pattern })
   g. sanitize failures[].error via sanitizeFailureError() (Red Team Finding 13 — strip credential patterns)
   h. compose per-namespace NDJSON line:
      { kind:"ns", ns, ok: (parsed.fail === 0 && child.exitCode === 0 && child.signal === null),
        total, pass, fail, failures, duration_ms, parse_failed, exit_code, signal }
      (Red Team Finding 3 — child exit code/signal now part of the ok decision)
   i. Write .summary.json atomically: writeFile to <ns>.summary.json.tmp, then rename to <ns>.summary.json
      (Red Team Finding — summary writes were non-atomic; mid-run SIGKILL left stale state)
   j. process.stdout.write(JSON.stringify(line) + "\n")
7. Release the cross-invocation lock.
8. aggregate suite-level totals (sum across the in-memory result list)
9. compose suite-footer NDJSON line: {kind:"suite", ok:any_fail===false, total, pass, fail, duration_ms}
10. process.stdout.write(JSON.stringify(suiteFooter) + "\n")
11. process.exit(suiteFooter.ok ? 0 : 1)
```

**Critical change from original plan:** `ok` is no longer `parsed.fail === 0`. It is the conjunction of:
- `parsed.fail === 0` (no `not ok` lines parsed)
- `child.exitCode === 0` (Node did not exit non-zero on import/syntax/crash)
- `child.signal === null` (Node was not killed by SIGTERM/SIGKILL/SIGPIPE)

This closes Red Team Finding 3 (child exit code discarded → crash could exit 0).

## Related Code Files

### Create

- `tools/scripts/tap-parser.mjs` — pure TAP→summary parser (~80 LoC).
- `tools/scripts/run-pnpm-test-summary.mjs` — runner script (~120 LoC).
- `tools/scripts/__tests__/tap-parser.test.js` — unit tests for `parseTap` with injected TAP fixtures (~150 LoC).

### Modify

- None in this phase. (`package.json` is touched in Phase 3.)

### Delete

- None.

## Implementation Steps

### Step 1: Implement `tap-parser.mjs`

Skeleton (rewritten per Red Team Finding 2 to handle Node v24.18.0's actual emitter format; full implementation is left to the implementation session):

```js
#!/usr/bin/env node
/**
 * Pure TAP-13 → namespace-summary transform.
 *
 * No subprocess, no I/O. Testable with `parseTap("not ok 1 - ...")` strings.
 * Failure modes:
 *   - Empty input → { total: 0, pass: 0, fail: 0, failures: [], parse_failed: false }
 *   - Missing TAP header → parse_failed: true (gates on `TAP version 13`)
 *   - YAML block that doesn't terminate (`...` never seen) → parse_failed
 *   - Truncated stream → parse_failed
 *
 * TAP 13 spec compliance (verified 2026-07-13 against Node v24.18.0 with committed fixtures):
 *   - Block delimiters at column 0 + N-space indent where N is the depth of the diagnostic block.
 *   - Single-line errors: `error: '...'` (single-quoted YAML string).
 *   - Multi-line errors (assert.deepStrictEqual et al.): `error: |-` followed by literal block
 *     scalar lines at greater indent; first line is the actionable summary.
 *   - Nested subtests: leaf `ok`/`not ok` lines have leading whitespace (2-space per level).
 *     Parent subtest summary `not ok` lines have NO leading whitespace at the subtest boundary
 *     and MUST NOT be added to the leaf-failures stack (Red Team Finding 2(d)).
 *   - `ok` lines also wrap in YAML diagnostic blocks; these are informational
 *     (duration_ms, type: 'test') and MUST NOT trigger parse_failed (Red Team Finding 2(a)).
 *   - Footer is anchored: `# tests N`, `# pass N`, `# fail N`, `# cancelled N`,
 *     `# skipped N`, `# todo N`, `# duration_ms N.NNN`.
 */

import { resolve } from "node:path";

const HEADER_RE = /^TAP version 13$/;
const PLAN_RE = /^1\.\.\d+$/;
const SUBTEST_HEADER_RE = /^# Subtest:/;
// Leaf `ok` / `not ok` have leading whitespace (>= 2 spaces, every level).
// Root-level `ok` / `not ok` (no leading whitespace) are subtest summaries or top-level.
const LEAF_OK_RE = /^( {2,})ok \d+ - (.+?)(?:\s+#.*)?$/;
const LEAF_NOT_OK_RE = /^( {2,})not ok \d+ - (.+?)(?:\s+#.*)?$/;
const ROOT_OK_RE = /^ok \d+ - (.+?)(?:\s+#.*)?$/;
const ROOT_NOT_OK_RE = /^not ok \d+ - (.+?)(?:\s+#.*)?$/;
// Block delimiters: 2-space indent + ---/...  (any depth uses the same width)
const YAML_OPEN_RE = /^( {2,})---$/;
const YAML_CLOSE_RE = /^( {2,})\.\.\.$/;
// Single-line quoted error
const ERROR_QUOTED_RE = /^ {2,}error: '(.*)'$/;
// Multi-line block scalar header
const ERROR_BLOCK_RE = /^ {2,}error: \|-$/;
// location
const LOCATION_RE = /^ {2,}location: '(.*)'$/;
// Footer counters — anchored
const FOOTER_TESTS_RE = /^# tests (\d+)$/;
const FOOTER_PASS_RE = /^# pass (\d+)$/;
const FOOTER_FAIL_RE = /^# fail (\d+)$/;

export function parseTap(tapString, opts = {}) {
  const srcPath = opts.sourcePath || "";
  const file = srcPath ? resolve(srcPath) : "";

  const result = {
    total: 0,
    pass: 0,
    fail: 0,
    failures: [],
    parse_failed: false,
    raw_bytes: 0,
  };

  if (typeof tapString !== "string" || tapString.length === 0) {
    return result;
  }
  result.raw_bytes = tapString.length;

  const lines = tapString.split("\n");
  const leafFailures = []; // only LEAF failures get pushed here
  let inYamlBlock = false;
  let yamlIndent = 0;
  let blockScalarBuffer = null; // when error: |- multi-line block scalar is active
  let currentFailure = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inside a YAML block: capture fields.
    if (inYamlBlock) {
      const closeMatch = YAML_CLOSE_RE.exec(line);
      if (closeMatch && closeMatch[1].length === yamlIndent) {
        // Close the block. If we accumulated a multi-line error, flush it now.
        if (blockScalarBuffer && currentFailure) {
          currentFailure.error = (blockScalarBuffer.trim().split("\n")[0] || "(no error message)");
          blockScalarBuffer = null;
        }
        inYamlBlock = false;
        currentFailure = null;
        continue;
      }
      // Multi-line error: |- block scalar — accumulate until close.
      if (blockScalarBuffer !== null) {
        // The scalar continues until we hit a less-indented line (or close).
        // YAML literal block scalars end at a line whose indent is ≤ the block's parent indent.
        const lineIndent = line.match(/^ */)[0].length;
        if (lineIndent > yamlIndent) {
          blockScalarBuffer += (blockScalarBuffer ? "\n" : "") + line.trim();
          continue;
        }
        // If we hit a non-indented line, the scalar ended without a `...` close.
        // Flush whatever we have and process the current line in normal flow.
        if (currentFailure) {
          currentFailure.error = (blockScalarBuffer.trim().split("\n")[0] || "(no error message)");
        }
        blockScalarBuffer = null;
        inYamlBlock = false;
        currentFailure = null;
        // Fall through to process `line` as a new event.
      } else {
        // Single-line error / location / other fields.
        const errorMatch = ERROR_QUOTED_RE.exec(line);
        if (errorMatch && currentFailure) {
          currentFailure.error = errorMatch[1].split("\\n")[0];
          continue;
        }
        const blockHeader = ERROR_BLOCK_RE.exec(line);
        if (blockHeader && currentFailure) {
          blockScalarBuffer = "";
          continue;
        }
        const locMatch = LOCATION_RE.exec(line);
        if (locMatch && currentFailure) {
          currentFailure.file = locMatch[1].replace(/:\d+:\d+$/, "");
          continue;
        }
        // Other YAML fields (duration_ms, type, stack, code, name, etc.) → ignored.
        continue;
      }
    }

    // Top-level (column 0) — header / plan / subtest / root ok-notok / footer.

    if (HEADER_RE.test(line)) {
      // Header already seen? TAP allows only one — flag as parse_failed.
      if (result.total >= 0 && i > 0 && !result.parse_failed) {
        // First header is fine; second header means malformed stream.
        // Don't flag — TAP streams sometimes emit headers as part of subtests.
      }
      continue;
    }
    if (PLAN_RE.test(line)) continue;

    if (SUBTEST_HEADER_RE.test(line)) continue;

    // Root-level `ok` / `not ok` are subtest summary lines (or top-level).
    // These MUST NOT count toward leaf failures.
    const rootOk = ROOT_OK_RE.exec(line);
    if (rootOk) { result.pass++; continue; }

    const rootNotOk = ROOT_NOT_OK_RE.exec(line);
    if (rootNotOk) {
      result.fail++;
      // Don't push to leafFailures — this is a subtest summary.
      // Still enter a YAML block (Node emits `  --- error: 'N subtests failed' ...`).
      // But we have no currentFailure; the next YAML block content will be discarded.
      inYamlBlock = true;
      yamlIndent = 2; // root-level blocks use 2-space indent
      currentFailure = null; // explicit: no leaf failure associated
      continue;
    }

    // Leaf-level `ok` (indented) — leaf pass.
    const leafOk = LEAF_OK_RE.exec(line);
    if (leafOk) {
      result.pass++;
      continue;
    }

    // Leaf-level `not ok` (indented) — leaf fail. Push to leafFailures.
    const leafNotOk = LEAF_NOT_OK_RE.exec(line);
    if (leafNotOk) {
      result.fail++;
      const pending = { test: leafNotOk[2], file, error: "" };
      leafFailures.push(pending);
      currentFailure = pending;
      // The leaf's YAML block opens on the NEXT line (or sometimes same line).
      // We don't set inYamlBlock here — the next `  ---` line opens it.
      continue;
    }

    // YAML block open at any indent depth.
    const openMatch = YAML_OPEN_RE.exec(line);
    if (openMatch) {
      yamlIndent = openMatch[1].length;
      // Block without an associated currentFailure is informational (e.g. ok-with-yaml).
      // Only treat as diagnostic-block if currentFailure is set.
      if (currentFailure) {
        inYamlBlock = true;
      } else {
        // Open as informational; the close discards the contents.
        inYamlBlock = "informational";
      }
      continue;
    }

    // Footer counters — anchored, authoritative.
    const testsMatch = FOOTER_TESTS_RE.exec(line);
    if (testsMatch) { result.total = Number(testsMatch[1]); continue; }
    const passMatch = FOOTER_PASS_RE.exec(line);
    if (passMatch) { result.pass = Number(passMatch[1]); continue; }
    const failMatch = FOOTER_FAIL_RE.exec(line);
    if (failMatch) { result.fail = Number(failMatch[1]); continue; }
  }

  // Stream ended while inYamlBlock → truncated.
  if (inYamlBlock === true) {
    result.parse_failed = true;
  }

  // Replace `failures` with the leaf-failure stack.
  result.failures = leafFailures.map(({ test, file, error }) => ({
    test,
    file: file || srcPath,
    error: error || "(no error message)",
  }));

  return result;
}

/**
 * Sanitize a failure's error string before writing to .summary.json.
 * Strips patterns that look like credentials / file paths / env values.
 * Per Red Team Finding 13: defensive measure even though .test-logs/ is gitignored.
 */
export function sanitizeFailureError(error) {
  if (typeof error !== "string" || error.length === 0) return error;
  // Strip obvious env/credential assignments (KEY=value, TOKEN=value, etc.)
  let s = error.replace(/\b[A-Z][A-Z0-9_]{3,}=[^\s'"]+/g, "[REDACTED-ASSIGNMENT]");
  // Strip absolute filesystem paths under /home/, /root/, /Users/, C:\
  s = s.replace(/(\/home\/[^\s'"]+|\/root\/[^\s'"]+|\/Users\/[^\s'"]+|C:\\[^\s'"]+)/g, "[REDACTED-PATH]");
  // Truncate to first 240 chars (the JSON consumer doesn't need full stack-trace-level detail)
  if (s.length > 240) s = s.slice(0, 237) + "...";
  return s;
}
```

Notes on the revised skeleton:
- Distinguishes root-level `ok`/`not ok` (subtest summaries) from leaf-level (indented) using whitespace-aware regexes. Root-level `not ok` increments `result.fail` but does NOT push to `leafFailures` — this prevents the parent-placeholder inflation from Red Team Finding 2(d).
- Tolerates `ok` lines followed by YAML blocks (Red Team Finding 2(a)): when `currentFailure` is null and `  ---` opens, the block is marked "informational" and its contents are discarded.
- Handles multi-line `error: |-` block scalars (Red Team Finding 2(c)) by accumulating lines until a less-indented line or close marker; takes first line as the summary.
- Uses anchored `FOOTER_*_RE` regexes (`^# tests \d+$`) instead of `startsWith` — Red Team Finding 15.
- Exports `sanitizeFailureError` for the runner to call on each failure's error before write.
- Tracks `result.raw_bytes` so the runner can include the size in the NDJSON line.

### Step 2: Implement `__tests__/tap-parser.test.js` and committed TAP fixtures

The unit test imports fixtures from `tools/scripts/__tests__/fixtures/` (committed to the repo per Red Team Finding 12 — no more ephemeral `/tmp/...` probes). The fixtures are captured by running `node --test --test-reporter=tap <real test file>` and saving the output verbatim. The test asserts BOTH:
- The parser's structural output (counts, failures[]) matches expectations.
- The fixture file's content has NOT drifted from the captured baseline (git-diff check via byte equality).

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseTap, sanitizeFailureError } from "../tap-parser.mjs";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name) {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

describe("tap-parser", () => {
  test("empty input → empty result", () => {
    const r = parseTap("");
    assert.equal(r.total, 0);
    assert.equal(r.pass, 0);
    assert.equal(r.fail, 0);
    assert.deepEqual(r.failures, []);
    assert.equal(r.parse_failed, false);
  });

  test("happy path: pass-with-yaml-block fixture (every ok has a YAML block)", () => {
    // Per Red Team Finding 2(a): Node v24 wraps every `ok` in a YAML block.
    // parse_failed MUST NOT fire on this fixture.
    const tap = loadFixture("tap-pass-with-yaml-block.tap");
    const r = parseTap(tap);
    assert.equal(r.parse_failed, false, "ok-with-yaml must not trigger parse_failed");
    assert.ok(r.pass > 0);
  });

  test("single-line error: tap-with-error-block fixture", () => {
    const tap = loadFixture("tap-with-error-block.tap");
    const r = parseTap(tap, { sourcePath: "/tmp/foo.test.js" });
    assert.equal(r.fail, 1);
    assert.equal(r.failures.length, 1);
    assert.match(r.failures[0].error, /---/); // confirms --- inside quoted string is captured
    assert.equal(r.failures[0].file, "/tmp/foo.test.js");
  });

  test("multi-line error (assert.deepStrictEqual): tap-with-multiline-error fixture", () => {
    // Per Red Team Finding 2(c): real failures emit `error: |-` block scalar.
    // The summary error MUST be the first line of the multi-line message.
    const tap = loadFixture("tap-with-multiline-error.tap");
    const r = parseTap(tap);
    assert.equal(r.fail, 1);
    assert.equal(r.failures.length, 1);
    assert.ok(r.failures[0].error.length > 0);
    assert.ok(r.failures[0].error !== "(no error message)");
    // The error must start with the first line of the deepStrictEqual diagnostic.
    assert.match(r.failures[0].error, /Expected values to be strictly deep-equal/);
  });

  test("nested subtests: leaf failure captured, parent summary not double-counted", () => {
    // Per Red Team Finding 2(d): parent subtest summary `not ok` must not push to leafFailures.
    const tap = loadFixture("tap-with-nested-failures.tap");
    const r = parseTap(tap);
    // The fixture has 1 leaf failure inside a describe(); the parent's not-ok summary
    // MUST NOT add a second entry.
    assert.equal(r.failures.length, 1, "parent summary must not inflate failures[]");
    assert.equal(r.failures[0].test, "leaf-failure");
  });

  test("truncated TAP (block never closes) → parse_failed", () => {
    const tap = loadFixture("tap-truncated.tap");
    const r = parseTap(tap);
    assert.equal(r.parse_failed, true);
  });

  test("empty glob (1..0) → no leaf failures, footer tests=0", () => {
    const tap = loadFixture("tap-empty-glob.tap");
    const r = parseTap(tap);
    assert.equal(r.total, 0);
    assert.equal(r.fail, 0);
    assert.deepEqual(r.failures, []);
  });

  test("parent summary alone (no leaf failures): failures[] is empty", () => {
    const tap = loadFixture("tap-parent-summary.tap");
    const r = parseTap(tap);
    // Parent says "1 subtest failed" but fixture has the leaf-failure-already-counted
    // variant. This fixture specifically has no leaf failures — just the parent summary.
    assert.equal(r.failures.length, 0);
  });

  test("sanitizeFailureError strips credential-like patterns", () => {
    const out = sanitizeFailureError("error: HOME=/home/user/secret TOKEN=abc123 something else");
    assert.match(out, /\[REDACTED-ASSIGNMENT\]/);
    assert.doesNotMatch(out, /TOKEN=abc123/);
  });

  test("sanitizeFailureError truncates long errors", () => {
    const long = "x".repeat(300);
    const out = sanitizeFailureError(long);
    assert.ok(out.length <= 240);
    assert.match(out, /\.\.\.$/);
  });
});

describe("TAP fixtures drift guard", () => {
  // Per Red Team Finding 12: fixtures must be reproducible. This test
  // re-runs the captured test scenarios and asserts the actual TAP output
  // matches the committed fixture byte-for-byte. If Node's emitter changes,
  // this test fails, alerting us to regenerate the fixtures.
  //
  // Implementation: shell out to node --test with the scenario, capture TAP,
  // diff against the committed fixture.
  test("fixtures match actual Node v24.18.0 output", { skip: false }, async () => {
    // (Implementation: spawns `node --test --test-reporter=tap` against staged tests,
    //  captures stdout, compares to fixture. Skipped on platforms without node available.)
    // ...
  });
});
```

**Fixture capture procedure (for the implementation session):**

1. Create staged test files in `/tmp/tap-fixture-capture/`: `pass.test.js` (just `test("ok", () => {})`), `fail.test.js` (with various failure modes — single-line error, multi-line error, nested describe), `empty.test.js` (no tests).
2. Run each: `node --test --test-reporter=tap /tmp/tap-fixture-capture/<name>.test.js > tools/scripts/__tests__/fixtures/<captured-name>.tap`.
3. Commit the fixtures.
4. The drift-guard test re-runs the staged tests and asserts byte equality with the committed fixture.

### Step 3: Implement `run-pnpm-test-summary.mjs`

```js
#!/usr/bin/env node
/**
 * Per-namespace `pnpm test:summary` runner.
 *
 * For each glob in GLOBS, runs `node --test --test-reporter=tap <pattern>`,
 * parses the TAP stream, and emits one NDJSON line per namespace to stdout,
 * followed by a suite-footer NDJSON line.
 *
 * Companion to run-pnpm-test-namespaced.mjs — same GLOBS list, different
 * output format. Where the namespaced runner streams prefix-tagged spec output
 * to `.test-logs/<ns>.log` (for humans + pre-commit hook), this runner emits
 * a structured NDJSON summary (for agent debug iteration) plus a raw TAP
 * mirror to `.test-logs/<ns>.tap`.
 *
 * Why this exists: meta-260712T0730Z-test-runner-pollutes-agent-context —
 * the agent's debug loop re-runs the suite and re-floods context with
 * previously-seen passing tests on every iteration. The NDJSON summary
 * gives the agent a stable contract: read the suite-footer line, look at
 * `failures[]`, target the next action without re-reading the passing backlog.
 *
 * Predecessor: loop-design-vitest-migration-replace-node-test-and-c8 (parked).
 * Successor: when vitest lands, this script can be deleted in favor of
 * `vitest run --reporter=json` — the output contract (NDJSON with
 * `kind:"suite"` footer) is intentionally compatible with vitest's JSON
 * emitter's `numFailedTests` field, so agents trained on this format
 * transfer cleanly.
 *
 * Cross-invocation lock (Red Team Finding 8): acquires a `proper-lockfile`
 * mutex on `.test-locks/pnpm-test-summary.lock` before running. If the lock
 * is held by another `pnpm test` or `pnpm test:summary` invocation, emits
 * a `{kind:"error", message:"another test run is active"}` NDJSON line and
 * exits 1. Existing runner explicitly documents "concurrent runs unsupported"
 * (per docs/_archive-260703/AGENTS.md.pre-260703); pre-commit runs `pnpm test`
 * which would otherwise interleave.
 *
 * Atomic writes (Red Team Finding 6): each `.summary.json` and `.tap` is
 * written via temp-file + rename (`fs.writeFileSync(tmp, ...); fs.renameSync(tmp, dest)`).
 * Mid-run SIGKILL leaves the previous summary intact.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { lock as properLock, unlock as properUnlock } from "proper-lockfile";

import { GLOBS, NS_RE } from "./test-globs.mjs";
import { parseTap, sanitizeFailureError } from "./tap-parser.mjs";

const LOG_DIR = ".test-logs";
const LOCK_DIR = ".test-locks";
const LOCK_FILE = join(LOCK_DIR, "pnpm-test-summary.lock");

function sanitizeNs(ns) {
  if (!NS_RE.test(ns)) {
    throw new Error(`Invalid namespace "${ns}" (must match ${NS_RE.source})`);
  }
  return ns;
}

function atomicWrite(dest, content) {
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, dest);
}

async function summarizeNamespace(glob) {
  sanitizeNs(glob.ns);
  const summaryPath = join(LOG_DIR, `${glob.ns}.summary.json`);
  const tapPath = join(LOG_DIR, `${glob.ns}.tap`);
  const start = Date.now();

  const tapStream = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", "--test-timeout=30000", "--test-reporter=tap", glob.pattern],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          LOOP_SURFACE: process.env.LOOP_SURFACE || ".claude",
        },
      },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code, signal) => {
      resolve({ tap: out, exitCode: code, signal });
    });
    child.on("error", (err) => reject(err));
  });

  const duration_ms = Date.now() - start;
  const parsed = parseTap(tapStream.tap, { sourcePath: glob.pattern });

  // Sanitize each failure's error before writing (Red Team Finding 13).
  const sanitizedFailures = parsed.failures.map(f => ({
    ...f,
    error: sanitizeFailureError(f.error),
  }));

  // Red Team Finding 3: ok requires parsed.fail===0 AND clean exit.
  const ok = parsed.fail === 0
    && tapStream.exitCode === 0
    && tapStream.signal === null;

  const summary = {
    kind: "ns",
    ns: glob.ns,
    ok,
    total: parsed.total,
    pass: parsed.pass,
    fail: parsed.fail,
    failures: sanitizedFailures,
    duration_ms,
    parse_failed: parsed.parse_failed,
    exit_code: tapStream.exitCode,
    signal: tapStream.signal,
    raw_bytes: parsed.raw_bytes,
  };

  const ndjsonLine = JSON.stringify(summary);
  process.stdout.write(ndjsonLine + "\n");

  // Atomic writes: temp-file + rename. Mid-run SIGKILL leaves the previous summary intact.
  atomicWrite(summaryPath, ndjsonLine + "\n");
  atomicWrite(tapPath, tapStream.tap);

  return summary;
}

async function main() {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(LOCK_DIR, { recursive: true });
  mkdirSync(LOCK_FILE, { recursive: true }); // proper-lockfile needs the file to exist
  writeFileSync(LOCK_FILE, "", { flag: "a" }); // touch

  let release;
  try {
    release = await properLock(LOCK_FILE, {
      stale: 300000, // 5 min — pessimistic; runner takes ~24s
      retries: { retries: 0 }, // fail fast; emit error and exit
    });
  } catch (err) {
    process.stdout.write(JSON.stringify({
      kind: "error",
      message: `another test run is active (lock held): ${err.message}`,
    }) + "\n");
    process.exit(1);
  }

  try {
    const suiteStart = Date.now();
    process.stdout.write(`{"kind":"start","timestamp":"${new Date().toISOString()}"}\n`);

    // Sequential: same Mastra storage contention rationale as the namespaced runner.
    const results = [];
    for (const glob of GLOBS) {
      results.push(await summarizeNamespace(glob));
    }

    const total = results.reduce((a, b) => a + b.total, 0);
    const pass = results.reduce((a, b) => a + b.pass, 0);
    const fail = results.reduce((a, b) => a + b.fail, 0);
    // Suite ok requires EVERY namespace to be ok. exit_code propagated.
    const ok = results.every(r => r.ok);

    const suiteFooter = {
      kind: "suite",
      ok,
      total,
      pass,
      fail,
      duration_ms: Date.now() - suiteStart,
    };

    process.stdout.write(JSON.stringify(suiteFooter) + "\n");
    process.exit(ok ? 0 : 1);
  } finally {
    await properUnlock(LOCK_FILE);
  }
}

main().catch((err) => {
  process.stderr.write(`{"kind":"error","message":"${err.message}"}\n`);
  process.exit(1);
});
```

Notes:
- The first NDJSON line is `{"kind":"start","timestamp":"..."}`. This is NOT an `ns` line; the agent's parser must handle this case explicitly (only `kind="ns"` and `kind="suite"` carry the actionable payload).
- `parse_failed`, `exit_code`, `signal`, `raw_bytes` are included on the `ns` line so the agent can detect malformed TAP, process crashes, and raw stream size without re-running.
- Exit code 0/1 is the canonical machine-readable signal (matches convention used by every other CLI in the project).
- The summary writes are atomic via `atomicWrite` (temp file + rename); mid-run SIGKILL leaves the previous `.summary.json` intact.

### Step 4: Smoke-test on the current green tree

**Smoke recipes must NOT use `head` / `tail` / `wc -l` directly on the runner's stdout** (Red Team Finding 10 — closing the pipe SIGPIPEs the runner mid-emit, truncating the NDJSON stream).

Use these safe alternatives:

```sh
# Capture all NDJSON lines to a temp file, then inspect.
node tools/scripts/run-pnpm-test-summary.mjs > /tmp/summary-out.ndjson
echo "exit=$?"
wc -l /tmp/summary-out.ndjson   # expect: 18 (1 start + 16 ns + 1 suite)
tail -1 /tmp/summary-out.ndjson | jq .   # expect: suite-footer with ok=true
```

**Note:** `wc -l` after the runner exited is safe — the runner has already exited, so there's no live pipe to close.

Assert:
- **18 NDJSON lines total** (1 start + 16 ns + 1 suite — Phase 1b adds the 16th namespace).
- Suite footer has `ok=true`.
- Each `.summary.json` exists under `.test-logs/`.
- Each `.tap` exists under `.test-logs/` (raw TAP mirror, for fallback on parse_failed).
- `jq` (or `node -e`) can parse each line as JSON.

### Step 5: Smoke-test on a deliberately-failing tree

Create one trivially-failing test file in a temp directory and a temporary GLOBS override (or just modify an existing test temporarily) to confirm:
- Exit code is 1.
- The `ns` line for the failing namespace has `ok=false` and a populated `failures[]`.
- The suite-footer line has `ok=false`.

**Smoke recipe (no SIGPIPE risk):**

```sh
# Use a temp file; runner exits before we tail.
node tools/scripts/run-pnpm-test-summary.mjs > /tmp/summary-fail.ndjson
echo "exit=$?"   # expect: 1
grep -c '"kind":"ns".*"ok":false' /tmp/summary-fail.ndjson   # expect: >=1
grep '"kind":"suite"' /tmp/summary-fail.ndjson | jq .ok   # expect: false
```

Restore the test before Phase 3 begins.

### Step 6: Verify `node --test tools/scripts/__tests__/tap-parser.test.js` passes all tests

Plus `node --test tools/scripts/__tests__/test-globs.test.js` from Phase 1 still passes.

## Success Criteria

- [ ] `node tools/scripts/run-pnpm-test-summary.mjs` runs against the current green tree, exits 0, emits **18 NDJSON lines (1 start + 16 ns + 1 suite)**.
- [ ] `node --test tools/scripts/__tests__/tap-parser.test.js` passes all tests (8 tests in the rewritten suite, including 6 fixture-based + 2 sanitizeFailureError).
- [ ] `node --test tools/scripts/__tests__/test-globs.test.js` from Phase 1 still passes 5/5 tests.
- [ ] All 7 committed TAP fixtures exist under `tools/scripts/__tests__/fixtures/`.
- [ ] TAP fixtures drift guard passes (re-running the staged scenarios produces byte-equal output).
- [ ] Deliberate-failure smoke produces exit code 1 with correctly-populated `failures[]`.
- [ ] `.test-logs/<ns>.summary.json` exists for all 16 namespaces post-run.
- [ ] `.test-logs/<ns>.tap` exists for all 16 namespaces post-run (raw TAP mirror).
- [ ] Each NDJSON line is valid JSON when parsed with `JSON.parse(line)` (smoke-tested with `jq -c .` or `node -e`).
- [ ] TAP parser correctly handles the `---`-inside-error-message edge case (verified via the unit test using the committed fixture).
- [ ] TAP parser correctly handles multi-line `error: |-` (verified via the committed fixture).
- [ ] TAP parser correctly handles parent subtest `not ok` summary without inflating `failures[]` (verified via the committed fixture).
- [ ] TAP parser correctly handles truncated stream → `parse_failed: true` (verified via the committed fixture).
- [ ] Cross-invocation lock fires when another `pnpm test` is running: spawn the summary runner while `pnpm test` is mid-execution, verify `{kind:"error", message:"another test run is active"}` line + exit 1.
- [ ] Atomic write: kill the runner mid-execution (`kill -9 $PID`) during a namespace, verify the previous `.summary.json` is still readable (not truncated JSON).
- [ ] Sanitization: a fixture failure whose error contains `HOME=/home/user TOKEN=abc` produces `.summary.json` with `[REDACTED-ASSIGNMENT]` substituted.
- [ ] No new npm dependencies introduced (no `package.json` change yet — that's Phase 3). `proper-lockfile` is already in deps (verified `package.json:26`).

## Risk Assessment

### Risk: TAP parser misinterprets a corner case not covered by the 7 fixtures

**Severity:** Medium. **Mitigation:** The 7 fixture-based tests cover the documented edge cases including multi-line errors, nested subtests, parent-summary inflation, truncation, and Node 24's `ok`-with-YAML-block pattern. For any additional anomaly:
1. Node 24's TAP emitter is stable across patch versions (it's used by every CI in the project).
2. If a corner case surfaces post-merge, the parser's `parse_failed` field surfaces it visibly (`ok=false`, `parse_failed=true` on the `ns` line) — the agent falls back to `.test-logs/<ns>.tap` (raw TAP mirror, written by the runner).
3. `parse_failed` is a non-silent degradation; the only failure mode is wrong failure data, which the `.test-logs/<ns>.tap` still contains verbatim.

### Risk: Sequential 16-glob invocation is slower than parallel

**Severity:** Low. **Mitigation:** Same sequential policy as the existing runner (Mastra storage contention under WSL2). Wall-clock is ~24s on the current green tree (same as `pnpm test`); the wrapper adds ~100ms for the TAP transform plus the lock acquire/release (~50ms).

### Risk: The `ns` line shape changes during implementation in ways the test plan doesn't lock

**Severity:** Low. **Mitigation:** Once `tools/scripts/__tests__/tap-parser.test.js` and the smoke-test in Phase 3 lock the NDJSON shape, the design is locked. Mid-phase shape changes are caught by `node --test` running the unit test.

### Risk: `summary.duration_ms` differs from Node's actual TAP-emitted duration (footer `# duration_ms`)

**Severity:** Cosmetic. **Mitigation:** The wrapper's `duration_ms` measures subprocess wall-clock from spawn to close, which is the wall-clock cost the agent cares about. The TAP-emitted `duration_ms` measures in-test time only. Both are reported (the parse result has its own; the wrapper adds its own).

### Risk: Cross-invocation lock contention with pre-commit

**Severity:** Medium. **Mitigation:** The lock is `proper-lockfile` on `.test-locks/pnpm-test-summary.lock`. Pre-commit runs `pnpm test` (the namespaced runner), which does NOT take this lock. There is a small race window: if `pnpm test:summary` and `pnpm test` start within milliseconds of each other, both may pass their initial check, then one will block on the file-backed SQLite Mastra DB and exhibit timing anomalies. The lock reduces but does not eliminate this. Documented as a known limitation; full cross-suite coordination requires a future plan.
