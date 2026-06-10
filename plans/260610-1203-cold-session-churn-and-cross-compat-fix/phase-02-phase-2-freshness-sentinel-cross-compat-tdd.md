---
phase: 2
title: "Phase 2: Freshness sentinel + cross-compat (TDD)"
status: pending
priority: P2
effort: "1-2h"
dependencies: ["1"]
---

# Phase 2: Freshness sentinel + cross-compat (TDD)

## Overview

Add two operational fixes on top of Phase 1's structural fix:
1. **Freshness sentinel** — `pnpm test:cold-session` writes a sentinel file with the current timestamp; a new loud-fail test asserts the sentinel is < 3 days old. A stale sentinel (or missing sentinel) fails loud in normal `pnpm test`, forcing the agent to re-run the cold-session test.
2. **Cross-compat** — `detectAgentCli()` returns `'droid'` or `'claude'` based on `PATH` probe. Both L1 and L2 probes use the detected CLI, and the `description` markers tag the runtime explicitly.

This phase = report's Commit 2 + TDD steps 6-7.

## Requirements

**Functional**:
- `detectAgentCli()` returns `'droid'` if `droid --version` succeeds, `'claude'` if `claude --version` succeeds, or the first one that succeeds if both. If neither is in PATH, returns `null` (test skips gracefully).
- At the end of test 1 (the real-spawn test) and test 5 (L2 probe), if the test passes (gap-closed), the cold-session test writes `.cold-session-sentinel.json` with `{ "last_pass_at": "<ISO>", "cli": "<detected>", "layer": "L1|L2" }`.
- `cold-session-freshness.test.js` (new) reads the sentinel, asserts `now - last_pass_at < 3 days` and `cli` matches a valid value (`droid` or `claude`).
- Missing sentinel → `assert.fail("Cold-session test has never been run. Run: pnpm test:cold-session")`.
- Stale sentinel (> 3 days) → `assert.fail("Cold-session test is stale (N days). Run: pnpm test:cold-session")`.

**Non-functional**:
- Sentinel file is gitignored (local-state artifact).
- `pnpm test:cold-session` script lives in `package.json#scripts`, runs the existing `cold-session-discoverability.test.cjs` (the only test file in the cold-session surface).
- Freshness test runs in normal `pnpm test` glob (matching the existing `*.test.js` pattern in `package.json#scripts.test`).

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  cold-session test (end of pass 1 + pass 5)                │
│    → writeFileSync(.cold-session-sentinel.json,            │
│                    { last_pass_at, cli, layer })           │
└─────────────────┬──────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────────────────┐
│  cold-session-freshness.test.js (runs in pnpm test)        │
│    → reads .cold-session-sentinel.json                      │
│    → asserts age < 3 days                                   │
│    → FAILS LOUD on missing/stale                            │
└────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────┐
  │  detectAgentCli()                                   │
  │  → probe droid, then claude                         │
  │  → return first to succeed, or null                 │
  └─────────────────────────────────────────────────────┘
```

Sentinel location: `tools/learning-loop-mcp/__tests__/.cold-session-sentinel.json` (matches the report's resolved question 2). Gitignored.

Sentinel shape:
```json
{
  "last_pass_at": "2026-06-10T12:00:00.000Z",
  "cli": "droid",
  "layer": "L1"
}
```

When both L1 and L2 pass, the test writes the sentinel twice (last writer wins). Acceptable because the assertion is on `last_pass_at`, not on layer.

**Overwrite semantics (per Validation Log §Session 1)**: The sentinel is a single JSON file. Writes are atomic (`writeFileSync`). L1 writes first, L2 overwrites with a fresher `last_pass_at`. The `layer` field reflects the most recent writer. **No duplicate file risk** — the path is stable, the file is replaced, not appended. The gitignore pattern matches the literal path; multiple writes do not create multiple files.

## Related Code Files

**Create**:
- `tools/learning-loop-mcp/__tests__/cold-session-freshness.test.js` — new test file (~15 lines)

**Modify**:
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` — add `detectAgentCli()`, replace `spawn("droid", ...)` with `spawn(cli, ...)`, write sentinel at end of pass 1 + pass 5, add description marker formatting helper (+25/-5 lines)
- `package.json` — add `"test:cold-session": "node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs"` (+1 line)
- `.gitignore` — add `tools/learning-loop-mcp/__tests__/.cold-session-sentinel.json` (+1 line)

**Delete**: none

## Implementation Steps (TDD red → green)

### Step 1: TDD RED — freshness test (missing sentinel)
**File**: `tools/learning-loop-mcp/__tests__/cold-session-freshness.test.js` (new)

```js
const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync } = require("node:fs");
const { resolve, join } = require("node:path");

const SENTINEL = resolve(__dirname, ".cold-session-sentinel.json");
const FRESHNESS_DAYS = 3;

describe("cold-session freshness sentinel", () => {
  test("sentinel exists and is < 3 days old", () => {
    assert.ok(existsSync(SENTINEL),
      "Cold-session test has never been run. Run: pnpm test:cold-session");
    const data = JSON.parse(readFileSync(SENTINEL, "utf8"));
    const ageMs = Date.now() - new Date(data.last_pass_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    assert.ok(ageDays < FRESHNESS_DAYS,
      `Cold-session test is stale (${ageDays.toFixed(1)} days). Run: pnpm test:cold-session`);
    assert.ok(["droid", "claude"].includes(data.cli),
      `sentinel.cli must be "droid" or "claude", got ${data.cli}`);
  });
});
```

**Expected**: FAIL with "Cold-session test has never been run. Run: pnpm test:cold-session".

### Step 2: TDD RED — detectAgentCli (placeholder returns null)
**File**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`

Add `detectAgentCli()` that returns `null` for now (placeholder; updated in Step 4 to probe droid + claude). The L1 and L2 probes fall back to `spawn("droid", ...)` when `cli === null` so Phase 1's droid-only behavior is preserved.

**Expected**: existing tests pass; the cold-session test still uses droid as before (no behavior change yet).

### Step 3: TDD GREEN — write sentinel at end of pass
**File**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`

At the end of test 1 (after all assertions pass) and test 5 (after the gap-closed branch returns), write the sentinel:
```js
const sentinelPath = join(__dirname, ".cold-session-sentinel.json");
writeFileSync(sentinelPath, JSON.stringify({
  last_pass_at: new Date().toISOString(),
  cli: cli ?? "droid",
  layer: "L1" | "L2",
}, null, 2));
```

Add `writeFileSync` to the existing `node:fs` import.

**Verify**: run `pnpm test:cold-session` once, then `pnpm test`. The freshness test should now pass.

### Step 4: TDD GREEN — detectAgentCli real implementation
**File**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`

Replace the placeholder with:
```js
async function detectAgentCli() {
  for (const cli of ["droid", "claude"]) {
    const ok = await new Promise((resolve) => {
      const probe = spawn(cli, ["--version"], { stdio: "pipe" });
      probe.on("error", () => resolve(false));
      probe.on("exit", (code) => resolve(code === 0));
    });
    if (ok) return cli;
  }
  return null;
}
```

Replace all `spawn("droid", ...)` in tests 1, 3, 5, and the `probeL2Gap` helper with `spawn(cli, ...)` where `cli` is set via `const cli = await detectAgentCli() ?? "droid";` at the top of each test. (Falls back to "droid" for envs where neither is in PATH — preserves Phase 1 behavior.)

Update `description` markers to use the actual `cli`:
- L1: `"runtime: droid; layer: L1; ..."` (template-literal with detected cli)
- L2: same pattern

**Verify**: in a droid-only env, the test runs against droid; in a claude-only env, against claude; in a both-CLI env, against the first to probe (droid). Freshness test still passes.

### Step 5: package.json + .gitignore
**Files**:
- `package.json` — add `"test:cold-session": "node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs"` to `scripts`.
- `.gitignore` — add `tools/learning-loop-mcp/__tests__/.cold-session-sentinel.json` (preserves kebab-case; gitignore pattern matches the actual file).

Verify `pnpm test` still globs all existing tests (the new freshness test is `*.test.js` so it auto-joins).

### Step 6: Update AGENTS.md
**File**: `AGENTS.md` (project-level, modify)

Add a one-line note: "Fresh clones require `pnpm test:cold-session` once to seed `.cold-session-sentinel.json`. The freshness test in normal `pnpm test` enforces a 3-day cadence."

Place under a new subsection or as a footnote in the existing Implementation Workflows section.

## Success Criteria

- [ ] Step 1 freshness test exists and fails loud on missing sentinel
- [ ] Step 3 sentinel write works; running `pnpm test:cold-session` once makes the freshness test pass
- [ ] Step 4 `detectAgentCli` works in droid-only / claude-only / both-CLI envs
- [ ] Step 5 `pnpm test:cold-session` script in `package.json`; sentinel in `.gitignore`
- [ ] Step 6 AGENTS.md updated
- [ ] `pnpm test` shows 0 regressions; freshness test passes
- [ ] L1 and L2 description markers include the detected `cli` (e.g., `runtime: claude; layer: L2;`)

## Risk Assessment

- **Sentinel location conflicts with gitignore pattern.** Verified: the file is `tools/learning-loop-mcp/__tests__/.cold-session-sentinel.json` (kebab-case) and the gitignore entry matches the literal path. No pattern collision.
- **Race between two `pnpm test:cold-session` runs.** If two operators run the test concurrently, both write the sentinel. Last writer wins. Acceptable because the assertion is on `last_pass_at`, not on which writer. No mitigation needed.
- **`detectAgentCli` probes `droid` first.** In a both-CLI env, droid always wins. If a future test wants to validate the claude path, it must override `cli` explicitly. Document in JSDoc.
- **Stale sentinel on branch checkout.** A branch that hasn't run cold-session in 3+ days will fail loud on the freshness test. This is the intended behavior (loud failure forces re-run). Document in the freshness test's failure message.

## Security Considerations

- The sentinel file contains no sensitive data (just `last_pass_at` + `cli` name). Safe to leave on disk.
- The sentinel is local-state and gitignored — it never enters the repo.

## Next Steps

After Phase 2 ships and CI passes, proceed to Phase 3 (end-to-end verification + closeout).
