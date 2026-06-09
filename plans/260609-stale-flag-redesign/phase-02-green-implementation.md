---
phase: 2
title: "Green (implementation)"
status: completed
priority: P1
effort: "3h"
dependencies: [phase-01-red-tdd-tests-first]
---

# Phase 2: Green (implementation)

## Overview

Implement just enough code to make the ~13 new test cases from Phase 1 pass. No live-registry mutations; no journal; no backfill. The work is grouped into 8 ordered sub-steps matching the brainstorm's 8 phases. The verification-runner refactor (sub-step 3.0) MUST ship before the re_verify tool (3.1) and the grounding delegation (3.2) per the locked constraint.

## Requirements

- **Functional:** all ~16 new tests in Phase 1 pass; the 2 new MCP tools work end-to-end against a temp registry.
- **Non-functional:** no behavioral regression in the existing ~840 tests; the new `stale` status is non-terminal; `TERMINAL_STATUSES` in `core/meta-state.js#7` does NOT include `stale`; `meta_state_list` no longer auto-resolves past-TTL entries.

## Architecture

The implementation is a sequence of small, surgical edits. Each sub-step has a single-file or two-file scope and a verifiable test outcome. The ordering matters because:

- Sub-step 1.1 (schema) is the foundation for everything else.
- Sub-step 2.1 (sweep rewrite) and 2.2 (list-tool fix) are independent.
- Sub-step 3.0 (verification-runner) is a hard prerequisite for 3.1 (re_verify tool) and 3.2 (grounding delegation).
- Sub-step 4 (supersede tool) is independent of 3.x.
- Sub-step 5 (manifest wiring) is the last step because both new tools must be registered together.

## Related Code Files

### Create

- `tools/learning-loop-mcp/core/verification-runner.js`
- `tools/learning-loop-mcp/tools/meta-state-re-verify-tool.js`
- `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js`

### Modify

- `tools/learning-loop-mcp/core/meta-state.js` — schema + `STALENESS_WINDOW_MS` constant; export `TERMINAL_STATUSES` for testability
- `tools/learning-loop-mcp/core/derive-status.js` — `META_STATE_RECOMMENDATIONS` enum + new `re_verify` branch
- `tools/learning-loop-mcp/core/loop-introspect.js` — `summarize` includes `last_verified_at`; status-count comment
- `tools/learning-loop-mcp/core/patterns.json` — `meta-state-verify-cmd-allowlist`
- `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` — new `checkStaleness` helper; add `stale` to local `TERMINAL_STATUSES`; new `## Stale Findings` section
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — lines 47-53 changed: `stale` instead of `expired + auto-resolve`
- `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` — 1-line delegation to `runVerification`
- `tools/learning-loop-mcp/tools/manifest.json` — 2 new entries

## Implementation Steps

### Sub-step 1.0 — Update `core/meta-state.test.js` and `loop-describe-warm-tier.test.js` for the new `checkExpiry` return value

**Edit 1: `core/meta-state.test.js` lines 86, 94 (and any other `checkExpiry` assertion returning `"expired"`) — update to assert `"stale"`:**

The existing test at line 86 ("checkExpiry returns expired when 24h passed on reported entry") must be updated to assert `result === "stale"` (not `"expired"`). The other 2 `checkExpiry` tests (lines 98, 207) assert `null` and are unaffected. The test at line 213 asserts `null` (future expires_at) and is unaffected.

Search the file for all `checkExpiry` assertions to find the exact lines; the plan estimates 1-2 test edits total.

**Edit 2: `loop-describe-warm-tier.test.js#37` — the assertion `statusLifecycle.includes("expired")` is unaffected** (it just checks `"expired"` is in the array; adding `"stale"` doesn't remove `"expired"`). No edit needed.

### Sub-step 1.1 — Schema additions in `core/meta-state.js`

**Edit 1: export `TERMINAL_STATUSES` (currently `const` not `export const`) for testability.**

```js
// Line 7
export const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved", "superseded"]);
```

**Edit 2: add `stale` to `metaStateFindingEntrySchema.status` enum (line 42):**

```js
status: z.enum(["reported", "active", "resolved", "expired", "superseded", "auto-resolved", "stale"]).optional()
```

**Edit 3: add 4 new optional fields to `metaStateFindingEntrySchema` (after `consolidated_into`):**

```js
last_verified_at: z.string().optional()
  .describe("ISO timestamp of the most recent successful verification step. Set by meta_state_re_verify on a passing run."),
verification: z.object({}).passthrough().optional()
  .describe("Self-contained reproduction spec. Inner shape is JSDoc-typed (loose outer / object-form inner / cmd allowlist). See plans/260609-stale-flag-redesign/plan.md Resolved Q3."),
superseded_at: z.string().optional()
  .describe("ISO timestamp set by meta_state_supersede."),
superseded_by: z.string().optional()
  .describe("Operator id set by meta_state_supersede. Default 'operator'."),
```

Note: `verification` uses `.passthrough()` to allow any inner shape (the JSDoc-typed inner shape is NOT zod-enforced; see locked design decision).

**Edit 4: add `STALENESS_WINDOW_MS` constant at module scope (mirrors `COMPACTION_AGE_MS` at line 8):**

```js
const STALENESS_WINDOW_MS = Number(process.env.META_STATE_STALENESS_WINDOW_MS) || 7 * 24 * 60 * 60 * 1000;
```

Export it for the sweep tool:

```js
export { STALENESS_WINDOW_MS };
```

**Edit 5: change `checkExpiry` to return `null` for `status: "stale"` entries (replaces the current "reported past expires_at" semantics with two helpers — see sub-step 2.1):**

```js
export function checkExpiry(entry) {
  if (entry.status === "stale") return null;  // stale entries don't re-expire
  if (entry.status !== "reported") return null;
  if (!entry.expires_at) return null;
  if (Date.now() > new Date(entry.expires_at).getTime()) {
    return "stale";  // CHANGED from "expired" to "stale"
  }
  return null;
}
```

The change from `"expired"` to `"stale"` in the return value is the new "reported past TTL → stale" path. The existing `meta-state-sweep.test.js` tests assert `swept.to === "expired"` and `entry.status === "expired"`. These tests are intentionally broken by this change — they are part of the regression set that Phase 3 closeout rewrites (or, more precisely, those existing tests' assertions need updating in the same commit). The plan's `meta-state-sweep-stale-transition.test.js` (S1) replaces them with assertions for the new `stale` semantics.

**Decision on the existing sweep tests:** update the existing `__tests__/meta-state-sweep.test.js` tests in Phase 2 to assert `to: "stale"` and `status: "stale"` instead of `"expired"`. This is a 1-line edit per test. The test file's other tests (idempotency, CAS, operator gate) are unchanged.

### Sub-step 1.2 — `derive-status.js` `re_verify` branch

**Edit 1: add `"re_verify"` to `META_STATE_RECOMMENDATIONS` (line 16):**

```js
export const META_STATE_RECOMMENDATIONS = [
  "no_action", "resolve", "investigate", "log_drift", "re_verify",
];
```

**Edit 2: add the `re_verify` branch in `computeRecommendation` (after the `mechanism-shipped + reported/active` branch, before the `code-missing` branch):**

```js
function computeRecommendation(derivedStatus, kind, rawStatus) {
  if (kind === "mechanism-shipped" && (rawStatus === "reported" || rawStatus === "active")) {
    return "resolve";
  }
  if (kind === "mechanism-shipped" && rawStatus === "stale") {  // NEW
    return "re_verify";
  }
  if (kind === "mechanism-shipped" && TERMINAL_RAW_STATUSES.has(rawStatus)) {
    return "log_drift";
  }
  if (kind === "code-missing") return "investigate";
  return "no_action";
}
```

### Sub-step 1.3 — `loop-introspect.js` summarize + comment

**Edit 1: add `last_verified_at` to `summarize` (after `code_fingerprint` line):**

```js
if (entry.last_verified_at) compact.last_verified_at = entry.last_verified_at;
```

**Edit 2: update the `DISCOVERABILITY_HINTS` array in `loop-introspect.js#92-106`** to reflect the new 6-status enum. The current hint at line 105 says "Findings have 5 statuses: `reported` (24h TTL), `active` (operator-acked), `resolved` (closed), `expired` (TTL elapsed), `superseded` (consolidated into a change-log)." Update to 6 statuses, adding `stale` (past TTL or past staleness window; re-verifiable via `meta_state_re_verify`):

```js
"Findings have 6 statuses: `reported` (24h TTL), `active` (operator-acked), `stale` (past TTL or past staleness window; re-verifiable via meta_state_re_verify), `resolved` (closed), `expired` (legacy — kept for backward compat; new TTL semantics use `stale`), `superseded` (consolidated into a change-log).",
```

**Edit 3: do NOT add `stale` to any `TERMINAL_STATUSES` constant in this file** (terminal-set discipline constraint #8).

### Sub-step 1.4 — `core/patterns.json` add cmd-allowlist

Append a new top-level key alongside `docker`/`sudo`/etc.:

```json
{
  "docker": "...",
  "sudo": "...",
  ...
  "meta-state-verify-cmd-allowlist": ["node", "pnpm", "npm", "git", "cat", "ls", "grep", "rg", "test", "echo"]
}
```

The new key is a **list of strings**, not a regex. Consumers (the verification-runner) read it as `Object.keys(allowlist)` (or directly via `patterns["meta-state-verify-cmd-allowlist"]`).

The `listAllGatePatterns` function in `loop-introspect.js#172` returns the parsed object as-is, so consumers can reach the new key without code changes. Verify by reading that function.

### Sub-step 2.1 — Rewrite `meta-state-sweep-tool.js`

**Edit 1: import `STALENESS_WINDOW_MS`:**

```js
import { readRegistry, checkExpiry, updateEntry, STALENESS_WINDOW_MS } from "#mcp/core/meta-state.js";
```

**Edit 2: add `stale` to the local `TERMINAL_STATUSES` (line 6):**

```js
const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved", "stale"]);
```

Note: `superseded` is intentionally NOT in this set (sweeps should not process superseded entries; they are compacted by the 7-day rule in `core/meta-state.js#updateEntry`). The local set mirrors what the sweep cares about.

**Edit 3: add a new `checkStaleness` helper above the handler:**

```js
/**
 * Check if an entry is past its staleness window.
 * Returns "stale" if `status: "active"` and last update is older than STALENESS_WINDOW_MS.
 * Returns null otherwise.
 *
 * Two stale paths:
 *   1. status: "reported" past expires_at -> "stale" (handled by checkExpiry in core/meta-state.js)
 *   2. status: "active" past STALENESS_WINDOW_MS -> "stale" (this function, NEW)
 *
 * The file-modification case (active finding whose evidence_code_ref file mtime
 * > last_verified_at) is preserved as auto-resolve; not part of this function.
 */
function checkStaleness(entry) {
  if (entry.status !== "active") return null;
  const referenceTime = entry.acked_at || entry.created_at;
  if (!referenceTime) return null;
  const age = Date.now() - new Date(referenceTime).getTime();
  if (age > STALENESS_WINDOW_MS) return "stale";
  return null;
}
```

**Edit 4: replace the handler's transition loop to call both `checkExpiry` and `checkStaleness`:**

```js
for (const entry of entries) {
  if (TERMINAL_STATUSES.has(entry.status)) continue;
  const fromCheckExpiry = checkExpiry(entry);
  const fromCheckStaleness = checkStaleness(entry);
  const targetStatus = fromCheckExpiry || fromCheckStaleness;
  if (targetStatus && targetStatus !== entry.status) {
    transitions.push({ id: entry.id, from: entry.status, to: targetStatus, expected_version: entry.version ?? 0 });
  }
}
```

**Edit 5: in the `apply` branch, change the `updateEntry` call to NOT stamp `resolved_at/resolved_by`:**

```js
for (const t of transitions) {
  const r = await updateEntry(root, t.id, {
    status: t.to,
    _expected_version: t.expected_version,
    // NO resolved_at / resolved_by — stale is not a resolution
  });
  // ... rest unchanged
}
```

**Edit 6: add a `## Stale Findings` section to `docs/registry-summary.md`:**

```js
// Inside emitRegistrySummaryMd, after the ## Drift section:
md += `\n## Stale Findings\n\n`;
md += `| ID | Status | Last Verified | Created At |\n`;
md += `|----|--------|---------------|------------|\n`;
const staleEntries = entries.filter((e) => e.status === "stale").slice(0, 10);
for (const entry of staleEntries) {
  md += `| ${entry.id} | ${entry.status} | ${entry.last_verified_at || "—"} | ${entry.created_at} |\n`;
}
```

### Sub-step 2.2 — Fix `meta_state_list` auto-resolve path

**Edit: lines 47-53 of `meta-state-list-tool.js` change from `expired + auto-resolve` to `stale`:**

```js
for (const entry of entries) {
  let newStatus = null;
  const expired = checkExpiry(entry);  // CHANGED: now returns "stale" instead of "expired"
  if (expired) {
    newStatus = expired;
  }
  if (newStatus && newStatus !== entry.status) {
    await updateEntry(root, entry.id, { status: newStatus });  // CHANGED: no resolved_at/resolved_by
    entry.status = newStatus;
  }
  updated.push(entry);
}
```

Note: the `checkExpiry` return value is now `"stale"` (from sub-step 1.1). The list tool just transitions the entry to whatever `checkExpiry` returns. No `resolved_at` / `resolved_by` stamping.

### Sub-step 3.0 — Extract `core/verification-runner.js` (HARD PREREQUISITE for 3.1 and 3.2)

**Create `tools/learning-loop-mcp/core/verification-runner.js`:**

```js
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import patterns from "./patterns.json" with { type: "json" };

const VERIFY_ALLOWLIST = new Set(patterns["meta-state-verify-cmd-allowlist"] || []);

/**
 * Run a single verification step and return { status, signal }.
 *
 * Step shape (loose / object-form inner / cmd allowlist):
 *   { cmd: string, args?: string[], cwd?: string, timeout_ms?: number, expect?: { stdout_includes?, exit_code? } }
 *
 * Returns:
 *   { status: "passed" | "failed" | "error", signal: string }
 *     - "passed": exit_code matches expect.exit_code (or 0 if expect absent)
 *     - "failed": exit_code mismatches expect (or non-zero if expect absent)
 *     - "error": cmd not in allowlist, file not found, or spawn error
 *
 * Defense in depth (per locked design decision):
 *   1. cmd must be in VERIFY_ALLOWLIST
 *   2. spawnSync with shell: false
 *   3. timeout: step.timeout_ms ?? 10_000
 */
export function runVerification(root, step) {
  if (!step || typeof step.cmd !== "string") {
    return { status: "error", signal: "invalid_step" };
  }
  if (!VERIFY_ALLOWLIST.has(step.cmd)) {
    return { status: "failed", signal: "cmd_not_allowlisted" };
  }
  const cwd = step.cwd
    ? (isAbsolute(step.cwd) ? step.cwd : join(root, step.cwd))
    : root;
  const timeout = step.timeout_ms ?? 10_000;
  try {
    const result = spawnSync(step.cmd, step.args ?? [], {
      cwd,
      timeout,
      shell: false,
      encoding: "utf8",
    });
    if (result.error) {
      return { status: "error", signal: result.error.code || "spawn_error" };
    }
    const expectedExit = step.expect?.exit_code ?? 0;
    if (result.status === expectedExit) {
      // Optional stdout check
      if (step.expect?.stdout_includes) {
        const stdout = result.stdout || "";
        if (!stdout.includes(step.expect.stdout_includes)) {
          return { status: "failed", signal: "stdout_mismatch" };
        }
      }
      return { status: "passed", signal: String(result.status) };
    }
    return { status: "failed", signal: `exit_${result.status}` };
  } catch (err) {
    return { status: "error", signal: err.code || "spawn_exception" };
  }
}
```

### Sub-step 3.1 — Create `meta-state-re-verify-tool.js`

```js
import { z } from "zod";
import {
  readRegistry,
  updateEntry,
  checkExpiry,
} from "#mcp/core/meta-state.js";
import { runVerification } from "#mcp/core/verification-runner.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const HISTORY_CAP = 50;

export const metaStateReVerifyTool = {
  name: "meta_state_re_verify",
  description: "Re-verify a stale meta-state entry by running its verification.steps. Each step is executed via core/verification-runner.js with cmd-allowlist + shell:false + 10s timeout. On a full pass, transitions the entry stale -> active and stamps last_verified_at. On any failure, stays stale and appends to verification.history (FIFO cap 50). Gated on META_STATE_VERIFY_EXEC=1 (default off). Use to close the TTL recursion: stale findings can be re-validated rather than auto-killed.",
  schema: {
    id: z.string().describe("Entry id to re-verify"),
    _expected_version: z.number().optional()
      .describe("Optional CAS: re-verify succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, _expected_version }) => {
    if (process.env.META_STATE_VERIFY_EXEC !== "1" && process.env.META_STATE_VERIFY_EXEC !== "true") {
      const result = { re_verified: false, reason: "verify_exec_required", id };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      const result = { re_verified: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (entry.status !== "stale") {
      const result = { re_verified: false, reason: "wrong_status", id, current_status: entry.status };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (!entry.verification || !Array.isArray(entry.verification.steps) || entry.verification.steps.length === 0) {
      const result = { re_verified: false, reason: "no_verification_steps", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const currentVersion = entry.version ?? 0;
    const expectedVersion = _expected_version !== undefined ? _expected_version : currentVersion;
    const history = Array.isArray(entry.verification.history) ? [...entry.verification.history] : [];
    const now = new Date().toISOString();
    const stepResults = [];
    let allPassed = true;
    for (const step of entry.verification.steps) {
      const r = runVerification(root, step);
      stepResults.push(r);
      history.push({ at: now, status: r.status, signal: r.signal });
      if (r.status !== "passed") {
        allPassed = false;
        break;  // short-circuit on first failure
      }
    }
    // FIFO cap
    while (history.length > HISTORY_CAP) history.shift();
    const patch = {
      verification: { ...entry.verification, history },
      _expected_version: expectedVersion,
    };
    if (allPassed) {
      patch.status = "active";
      patch.last_verified_at = now;
    }
    const updateResult = await updateEntry(root, id, patch);
    if (updateResult === "version_mismatch") {
      const result = { re_verified: false, reason: "version_mismatch", id };
      appendGateLog(root, { timestamp: now, tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (updateResult !== true) {
      throw new Error(`meta_state_re_verify: unexpected updateEntry result for ${id}: ${JSON.stringify(updateResult)}`);
    }
    const result = {
      re_verified: allPassed,
      id,
      status: allPassed ? "active" : "stale",
      history_appended: stepResults.length,
      step_results: stepResults,
      last_verified_at: allPassed ? now : (entry.last_verified_at || null),
    };
    appendGateLog(root, { timestamp: now, tool: "meta_state_re_verify", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### Sub-step 3.2 — Delegate `meta_state_check_grounding` to `runVerification`

**Edit: `meta-state-check-grounding-tool.js#runTest` body replaced with a call to `runVerification`:**

```js
function runTest(root, testPath) {
  const result = runVerification(root, {
    cmd: "pnpm",
    args: ["test", "--", testPath],
    cwd: root,
    timeout_ms: 30_000,
  });
  if (result.status === "passed") return true;
  if (result.status === "failed") return false;
  return null;  // "error" -> null
}
```

The import is added at the top:

```js
import { runVerification } from "#mcp/core/verification-runner.js";
```

No behavior change for `meta_state_check_grounding` (the existing test file `meta-state-check-grounding-tool.test.js` should still pass unchanged).

### Sub-step 4 — Create `meta-state-supersede-tool.js`

```js
import { z } from "zod";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateSupersedeTool = {
  name: "meta_state_supersede",
  description: "Mark a finding as superseded by a change-log entry. Atomically stamps status=superseded + superseded_at + superseded_by + consolidated_into. Closes the gap that meta_state_patch's IMMUTABLE_PATCH_FIELDS deny-list blocks. Gated on OPERATOR_MODE=1. Use for backfilling findings that were incorrectly auto-resolved by the TTL sweep (e.g., a finding was TTL-killed but the underlying bug is still relevant — the consolidated_into change-log captures the lineage).",
  schema: {
    id: z.string().describe("Finding entry id to supersede"),
    consolidated_into: z.string().describe("Id of the change-log entry that is the canonical source"),
    resolution: z.string().optional().describe("Human-readable resolution note"),
    _expected_version: z.number().optional()
      .describe("Optional CAS: supersede succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, consolidated_into, resolution, _expected_version }) => {
    if (process.env.OPERATOR_MODE !== "1" && process.env.OPERATOR_MODE !== "true") {
      const result = { superseded: false, reason: "operator_role_required", id };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      const result = { superseded: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_supersede", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (entry.entry_kind !== "finding") {
      const result = { superseded: false, reason: "not_a_finding", id, entry_kind: entry.entry_kind };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_supersede", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    // Validate consolidated_into is an existing change-log
    const target = entries.find((e) => e.id === consolidated_into);
    if (!target || target.entry_kind !== "change-log") {
      const result = { superseded: false, reason: "consolidated_into_not_a_change_log", id, consolidated_into };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_supersede", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const currentVersion = entry.version ?? 0;
    const expectedVersion = _expected_version !== undefined ? _expected_version : currentVersion;
    const now = new Date().toISOString();
    const patch = {
      status: "superseded",
      superseded_at: now,
      superseded_by: "operator",
      consolidated_into,
      ...(resolution && { resolution }),
      _expected_version: expectedVersion,
    };
    const updateResult = await updateEntry(root, id, patch);
    if (updateResult === "version_mismatch") {
      const fresh = readRegistry(root).find((e) => e.id === id);
      const result = { superseded: false, reason: "version_mismatch", id, current_version: fresh?.version ?? 0 };
      appendGateLog(root, { timestamp: now, tool: "meta_state_supersede", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (updateResult !== true) {
      throw new Error(`meta_state_supersede: unexpected updateEntry result for ${id}: ${JSON.stringify(updateResult)}`);
    }
    const result = {
      superseded: true,
      id,
      status: "superseded",
      consolidated_into,
      superseded_at: now,
      superseded_by: "operator",
      ...(resolution && { resolution }),
    };
    appendGateLog(root, { timestamp: now, tool: "meta_state_supersede", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### Sub-step 5 — Wire the 2 new tools into `manifest.json`

Append to `tools/learning-loop-mcp/tools/manifest.json`:

```json
{ "file": "./tools/meta-state-re-verify-tool.js", "export": "metaStateReVerifyTool" },
{ "file": "./tools/meta-state-supersede-tool.js", "export": "metaStateSupersedeTool" }
```

The `server.js` loop reads the manifest at startup, so no `server.js` change is needed.

### Sub-step 5.5 — Update `cold-session-discoverability.test.cjs` fixture data

The 4 `status: "expired"` references in the churn-loop test fixtures (lines 574, 688, 698, 778) MUST be updated to `status: "stale"`. The new sweep tool does not create `expired` entries; it creates `stale` ones. The churn loop's purpose is to assert that stale entries do not re-create under the same session_id — so the fixture data must use `stale`.

### Sub-step 6 — Verify all tests pass (green)

Run `pnpm test 2>&1 | tail -50`. Expect:

- New `meta-state-stale-flag.test.js`: 10 pass (T1-T10).
- New `meta-state-sweep-stale-transition.test.js`: 3 pass (S1-S3).
- New `index-validate-smoke.test.js`: 1 pass.
- Modified `cold-session-discoverability.test.cjs`: all pre-existing assertions still pass + 1 new assertion (after sub-step 5.5 fixture update).
- Modified `__tests__/meta-state-sweep.test.js`: 6 tests still pass (after the 1-line edit from "expired" to "stale" in sub-step 1.1).
- Modified `core/meta-state.test.js`: 3 `checkExpiry` tests still pass (after sub-step 1.0's 1-2 line edits).
- All other ~837 tests: pass unchanged.

Total: ~840 + 15 = ~855 passing; 0 failing.

## Success Criteria

- [x] All 4 new test files + 1 added assertion exist; all tests in them pass.
- [x] `pnpm test` shows ~854 passing, 0 failing.
- [x] `node tools/learning-loop-mcp/server.js` starts successfully (manifest loads the 2 new tools; logs `registered N of N tools` with N increased by 2).
- [x] No `core/meta-state.js#7` `TERMINAL_STATUSES` set includes `"stale"`.
- [x] `meta_state_list` no longer stamps `resolved_by: "auto-resolve"` on past-TTL entries (smoke test: create a finding past TTL, call `meta_state_list` 5 times, assert: 0 `resolved_by` stamps in gate log).
- [x] `meta_state_sweep` no longer stamps `resolved_by: "auto-resolve"` on past-TTL entries (similar smoke test).

## Risk Assessment

- **Risk**: changing `checkExpiry` to return `"stale"` instead of `"expired"` breaks the `meta-state-sweep.test.js` assertions. **Mitigation**: the 1-line edit to update the existing tests is part of sub-step 1.1; it ships with the schema change so the test suite stays green.

- **Risk**: the `verification-runner.js` JSON import (`with { type: "json" }`) may not work in the project's Node version. **Mitigation**: use the safer pattern of reading + parsing with `readFileSync` if the import assertion fails. Verify by reading the project's Node version (`node -v`).

- **Risk**: the `META_STATE_VERIFY_EXEC=1` env-var check syntax (`!== "1" && !== "true"`) may differ from the existing `OPERATOR_MODE` pattern in `meta_state_resolve`. **Mitigation**: read `meta_state_resolve` (already done; uses `process.env.OPERATOR_MODE === "1"`) — match it. The new tool uses the same `!== "1" && !== "true"` pattern, which is broader (accepts both "1" and "true"); this is a 1-line intentional widening for symmetry.

- **Risk**: the `meta_state_re_verify` tool's history FIFO cap is implemented in-memory; if the patch fails (e.g., version mismatch), the in-memory history is lost. **Mitigation**: this is acceptable — the cap is a per-write concern, and a version_mismatch means another writer is in flight, so the next re-verify call will re-append.
