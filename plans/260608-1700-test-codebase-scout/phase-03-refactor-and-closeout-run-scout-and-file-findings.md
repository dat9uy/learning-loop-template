---
phase: 3
title: "Refactor and closeout (run scout and file findings)"
status: pending
effort: ~1.5h
dependencies: [2]
---

# Phase 3: Refactor and closeout (run scout and file findings)

## Overview

Run the scout against the real test code base, file all candidate findings via the `meta_state_report` MCP tool, verify zero test file modifications via `git status`, and write a journal entry. This is the only phase with side effects on the loop's meta-state registry.

**Why a separate closeout phase**: the scout's core job (Phase 2) is the pure-function classification. The filing of findings is a side effect that:
1. Adds entries to `meta-state.jsonl` (one per finding)
2. Must be idempotent (re-running must not duplicate findings — per meta-260606T1500Z closeout script bug)
3. Must be auditable (a future plan can verify which findings came from this scout)

The closeout is separated from the scout to keep the scout's output pure and the side effects observable.

## Requirements

- **Functional:**
  - The scout runs against the real test code base and produces a valid `scout-output.json`
  - All candidate findings are filed via the `meta_state_report` MCP tool
  - The `meta_state_report` calls are idempotent (re-running the closeout does not duplicate findings)
  - The `git status --porcelain` check shows zero modifications under `__tests__/`
  - A markdown report is generated at `docs/journals/260608-test-scout-report.md`
  - A journal entry is written at `docs/journals/260608-test-scout-closeout.md`
  - The originating cold-session test 1 finding is NOT resolved (per brainstorm § "Open questions" — the future plan session will triage)
- **Non-functional:**
  - No `node -e` escape-hatch usage (per F3 of the 260608-1015 plan's red team findings; per meta-260606T2102Z closure)
  - All `meta_state_report` calls go through the canonical MCP tool surface
  - The closeout script is named (not inline) so it can be re-run independently
  - The markdown report is human-readable and includes the 5 deliverable tables from the brainstorm

## Architecture

The closeout is a single named script: `tools/learning-loop-mcp/scripts/closeout-260608-1700-test-scout.mjs` (per F6 red team — matches the existing convention of 8 scripts in `tools/learning-loop-mcp/scripts/`; the 260608-1015 plan's deviation to `tools/scripts/` is captured as a follow-up to consolidate). It:

1. Spawns the MCP server (or uses the live one if already running).
2. Invokes the scout via `runScout({ projectRoot, writeJson: true, writeMarkdown: true })`.
3. Reads the resulting `scout-output.json`.
4. For each candidate finding (one per dangling match, gap entry, anti-MCP phrase, and at-risk budget entry), calls `meta_state_report` via JSON-RPC.
5. Asserts `git status --porcelain` shows no modifications under `__tests__/`.
6. Asserts `meta_state_list({ category: "loop-anti-pattern" })` includes the new findings.
7. Logs a closeout summary.

The script is **idempotent**:
- Each finding's `id` is deterministic: `meta-260608T1700Z-<bucket>-<pattern>-<slug>`.
- Before calling `meta_state_report`, the script checks `meta_state_list({ id_prefix: "meta-260608T1700Z-" })`. If the id already exists, it skips (logged as `skipped: existing_finding`).
- This pattern matches the fix at meta-260606T1500Z (closeout script idempotency bug).

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/scripts/closeout-260608-1700-test-scout.mjs` (~150 lines) — named closeout script
  - `docs/journals/260608-test-scout-report.md` — generated markdown report (output of the scout)
  - `docs/journals/260608-test-scout-closeout.md` — journal entry for this plan's execution
- **Modify:** None
- **Delete:** None

## Implementation Steps

### Step 3.1 — Implement the closeout script

**File**: `tools/learning-loop-mcp/scripts/closeout-260608-1700-test-scout.mjs`

The script uses ESM imports and the MCP server's stdio JSON-RPC surface. Structure:

```js
// closeout-260608-1700-test-scout.mjs
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const scoutOutputPath = join(projectRoot, "tools/learning-loop-mcp/scout/fixtures/scout-output.json");

// Step 1: invoke the scout (idempotent)
if (!existsSync(scoutOutputPath)) {
  console.error(`[closeout] scout output missing at ${scoutOutputPath}; run scout first`);
  process.exit(1);
}

const scoutOutput = JSON.parse(readFileSync(scoutOutputPath, "utf8"));

// Step 2: spawn MCP server, file findings
const server = spawn("node", [join(projectRoot, "tools/learning-loop-mcp/server.js")], {
  stdio: ["pipe", "pipe", "pipe"],
});

// ... JSON-RPC handshake (initialize, tools/list) ...

// Step 3: for each candidate finding, call meta_state_report
const findings = collectFindings(scoutOutput); // returns array of {category, severity, ...}
if (findings.length === 0) {
  // Per F11 red team — zero findings is a valid outcome, not an error
  console.log("[closeout] OK: 0 findings filed (scout surfaced no issues)");
} else {
  for (const finding of findings) {
    // Idempotency guard: skip if id already exists
    const idPrefix = finding.id_prefix; // meta-260608T1700Z-<bucket>-<pattern>-
    const existing = await mcpCall("meta_state_list", { id_prefix: idPrefix });
    if (existing.entries.length > 0) {
      console.log(`[closeout] skipped: ${finding.id_prefix} (${existing.entries.length} existing)`);
      continue;
    }
    // File the finding
    const result = await mcpCall("meta_state_report", finding.payload);
    console.log(`[closeout] filed: ${result.id}`);
  }
}

// Step 3.5: static check — per F13 red team, fail if the closeout script
// ever calls meta_state_resolve (we only call meta_state_report)
import { readFileSync } from "node:fs";
const closeoutSource = readFileSync(import.meta.filename, "utf8");
if (closeoutSource.includes("meta_state_resolve")) {
  console.error("[closeout] FAIL: closeout script contains meta_state_resolve call (forbidden)");
  process.exit(3);
}

// Step 4: assert zero test file modifications
const { execSync } = await import("node:child_process");
const gitStatus = execSync("git status --porcelain", { cwd: projectRoot }).toString();
const testModifications = gitStatus.split("\n").filter((line) => line.includes("__tests__/"));
if (testModifications.length > 0) {
  console.error(`[closeout] FAIL: ${testModifications.length} test file modifications detected`);
  console.error(testModifications.join("\n"));
  process.exit(2);
}
console.log("[closeout] OK: zero test file modifications");

// Step 5: assert findings are visible
const listed = await mcpCall("meta_state_list", { id_prefix: "meta-260608T1700Z-" });
console.log(`[closeout] OK: ${listed.entries.length} findings visible in registry`);
```

The `collectFindings` function projects the scout's output to the 4 cookbook payloads from the brainstorm's Layer 3:

| Scout output | Cookbook payload |
|--------------|------------------|
| `bucket_distribution.C > 0` | Bucket-C (Bypass-MCP) |
| `dangling_matches[].pattern === "D1"` | Dangling D1 (Schema-Drift) |
| `dangling_matches[].pattern === "D2"` | Dangling D2 (Resolved-Finding Dependency) |
| `dangling_matches[].pattern === "D3"` | Dangling D3 (Removed-Tool Reference) |
| `dangling_matches[].pattern === "D4"` | Dangling D4 (Stale Fixture) |
| `dangling_matches[].pattern === "D5"` | Dangling D5 (Stale TOLERANCES) |
| `gap_table[].missing.length > 0` | Gap (Missing Test Coverage) |
| `budget_table[].risk === "critical"` (and contains anti-MCP phrase) | Anti-MCP Phrase + Prompt Budget At-Risk (combined) |
| `budget_table[].risk === "high"` | Prompt Budget At-Risk (medium) |

Each projected finding has a deterministic `id_prefix` of `meta-260608T1700Z-<scout-bucket>-<pattern>-` followed by a content-hash of the finding's payload (so the same finding re-uses the same id on re-runs).

### Step 3.2 — Run the scout to produce the JSON output

```bash
node tools/learning-loop-mcp/scout/run-scout.js --write
```

This produces `tools/learning-loop-mcp/scout/fixtures/scout-output.json`. Verify:
- `inventory.length >= 50`
- `bucket_distribution.C == 0` (or near-zero; we expect discipline)
- `budget_table` has an entry for `cold-session-discoverability.test.cjs#test 1` with `risk: "critical"`
- `gap_table` has at least 1 entry (we expect gaps per brainstorm's "Estimated findings count")

### Step 3.3 — Run the closeout script to file findings

```bash
node tools/learning-loop-mcp/scripts/closeout-260608-1700-test-scout.mjs
```

The script files all candidate findings via `meta_state_report`. Verify:
- The script logs `OK: zero test file modifications`
- The script logs `OK: N findings visible in registry` (where N >= 0; likely N = 20-50 per brainstorm's estimate, but zero is a valid outcome per F11 red team)
- The script exits 0

If the script exits non-zero:
- **Exit 1**: scout output missing — run Step 3.2 first.
- **Exit 2**: test file modifications detected — investigate which test was modified, fix the bug, re-run.
- **Exit 3**: closeout script contains `meta_state_resolve` (per F13 red team — defense-in-depth check) — remove the call, re-run.

### Step 3.4 — Generate the markdown report

The scout's `run-scout.js --write` already produces `docs/journals/260608-test-scout-report.md` (per the architect's `--write-markdown` flag). Verify the markdown report contains the 5 deliverable tables from the brainstorm:
1. Test inventory (file, last mod, tests, bucket, dangling, gap, prompt budget)
2. MCP-first bucket distribution
3. Dangling matches
4. Gap table
5. Prompt budget audit

If any table is missing, fix the markdown projection in `run-scout.js` (Phase 2) and re-run.

### Step 3.5 — Write the journal entry

**File**: `docs/journals/260608-test-scout-closeout.md`

A short technical journal entry (per the standard `docs/journals/<DATE>-<plan-slug>-closeout.md` pattern) capturing:
- What was built (the scout, the 4 pure-function modules, the orchestrator, the closeout script)
- What was learned (false-positive rate, gap distribution, prompt budget baseline)
- Open questions for the future plan session (which findings to prioritize, how to update the latency constants, whether to add a `meta_state_archive` for resolved findings)

### Step 3.6 — Verify the plan-level success criteria

Re-read `plan.md` § "Success Criteria (Plan-Level)" and assert each:
- [ ] All 852+ existing tests pass
- [ ] 24+ new tests pass
- [ ] `scout-output.schema.json` validates the scout's output fixture
- [ ] Re-running the scout produces the same output (modulo `run_timestamp`)
- [ ] `git status --porcelain` shows zero modifications under `__tests__/`
- [ ] Cold-session test 1 is correctly flagged
- [ ] Bucket C count is 0 or near-0
- [ ] All candidate findings are filed via `meta_state_report` (zero `node -e` usage)
- [ ] `pnpm check` passes
- [ ] No new tools are added to `tools/manifest.json`

Document any deviations in the journal entry.

## Success Criteria

- [ ] `tools/learning-loop-mcp/scripts/closeout-260608-1700-test-scout.mjs` exists
- [ ] `docs/journals/260608-test-scout-report.md` exists and contains the 5 deliverable tables
- [ ] `docs/journals/260608-test-scout-closeout.md` exists
- [ ] `meta_state_list({ id_prefix: "meta-260608T1700Z-" })` returns N findings (N >= 0, per F11 red team)
- [ ] `git status --porcelain` shows zero modifications under `__tests__/`
- [ ] `pnpm check` passes (validate records + extract index + tests)
- [ ] No `node -e "import('#mcp/core/meta-state.js')"` usage in the closeout script
- [ ] No `meta_state_resolve` call in the closeout script (per F13 red team — defense-in-depth check)
- [ ] The originating cold-session test 1 finding is NOT resolved (deferred to future plan session per brainstorm)
- [ ] Plan-level success criteria (above) all checked

## Risk Assessment

- **Risk: Closeout script files duplicate findings on re-run** — Per meta-260606T1500Z, the original closeout script was not idempotent. **Mitigation:** the script checks `meta_state_list({ id_prefix })` before each `meta_state_report` call. The `id_prefix` is deterministic (content-hash of the finding payload). Re-runs skip existing findings.
- **Risk: Closeout script writes to a test file by accident** — A bug in the orchestrator's `writeMarkdown` path could write to `__tests__/`. **Mitigation:** the `git status --porcelain` assertion in Step 3.3 catches this. The orchestrator's markdown path is a hard-coded constant `docs/journals/<DATE>-test-scout-report.md`.
- **Risk: `meta_state_report` rejects findings due to wire-format coercion** — Per the meta-260606T2202Z wire-format bug, some top-level array/boolean params were being coerced to wrong types. **Mitigation:** the closeout script's `meta_state_report` calls go through the canonical MCP tool surface (server-side, with the wire-format fix from plan 260608-1015 already applied). The script does not bypass MCP.
- **Risk: Cold-session test guard blocks the closeout** — Per meta-260606T1656Z-cold-session-test-must-pass-before-resolution, `meta_state_resolve` is blocked when the cold-session test shows the gap open. **Mitigation:** this plan does NOT call `meta_state_resolve` (it only calls `meta_state_report`, which is a Create operation, not a Resolve). The originating findings are not touched.
- **Risk: Many findings flood the registry** — Per brainstorm § "Estimated findings count": 20-50 candidate findings. **Mitigation:** the closeout files ALL findings; the future plan session will triage. The scout's job is to surface, not to prioritize. If the registry becomes too noisy, a future plan can add a `meta_state_archive` capability (out of scope for this plan).
- **Risk: `pnpm check` fails due to pre-existing product capability drift** — Per plan 260608-1015's known issue, `generate:capabilities --dry-run` may fail due to pre-existing product capability drift. **Mitigation:** if `pnpm check` fails ONLY on the `generate:capabilities --dry-run` step (not on `validate:records`, `validate:plan-loop`, or `pnpm test`), document the pre-existing issue in the journal entry and continue. The scout is unrelated to product capability drift.

