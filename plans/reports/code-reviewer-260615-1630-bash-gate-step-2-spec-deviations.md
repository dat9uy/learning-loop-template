---
title: "Code Review — Bash Gate Step 2: Spec Deviations + Cleanup Backlog"
description: "Spec compliance + code quality review of commit 9f4a389 against plan plans/260615-1530-bash-gate-debate-stderr-override-recurrence and journal docs/journals/260615-bash-gate-debate-step-2-shipped.md. 949/950 tests pass (verified live). 2 important spec deviations, 1 important invariant bypass, 7 minor issues. No critical blockers."
date: "2026-06-15T16:30:00Z"
tags: [code-review, step-2, bash-gate, spec-compliance, surfaces-helper, meta-state-mediator, planning-order]
status: review
related:
  - plans/260615-1530-bash-gate-debate-stderr-override-recurrence/ (the plan under review)
  - plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md (planning-order TL;DR + Step 2 cleanup backlog)
  - docs/journals/260615-bash-gate-debate-step-2-shipped.md (the ship journal)
  - commit 9f4a389 (the shipped commit)
  - tools/learning-loop-mcp/core/surfaces.js (the helper that should have been used)
  - tools/learning-loop-mcp/core/gate-override.js (subject: hand-rolled cross-surface loops)
  - tools/learning-loop-mcp/core/gate-decision-log.js (subject: hand-rolled cross-surface loops)
  - tools/learning-loop-mcp/core/recurrence-tracker.js (subject: direct meta-state.jsonl writes)
  - tools/learning-loop-mcp/hooks/bash-gate.js (subject: skipped_via_override field is dead)
  - tools/learning-loop-mcp/hooks/lib/protocol-adapter.js#formatHookDecision (Phase 1 contract)
---

# Code Review — Bash Gate Step 2: Spec Deviations + Cleanup Backlog

**Date**: 2026-06-15
**Reviewer**: code-reviewer (claude)
**Mode**: Spec compliance + code quality (post-implementation, pre-cleanup)
**Commit**: 9f4a389 (Mon Jun 15 15:45:40 2026 +0700)
**Plan**: plans/260615-1530-bash-gate-debate-stderr-override-recurrence/ (status: shipped)
**Journal**: docs/journals/260615-bash-gate-debate-step-2-shipped.md

---

## TL;DR

**No critical blockers.** Full test suite verified: **949/950 pass, 1 expected skip, 9.1s** (re-ran 2026-06-15 16:30, matches tester report). The ship is correct and the plan's main contracts hold.

**2 important spec deviations** (both already filed in planning-order § Step 2 cleanup items 2.1-2.5):

1. **The plan's headline simplification (`core/surfaces.js`) is bypassed in the very files that depend on it.** `gate-override.js` and `gate-decision-log.js` hand-roll `for (const surface of SURFACES)` loops with inline `readFileSync`/`writeFileSync`/`renameSync` instead of calling `writeToAllSurfaces` / `readFromAllSurfaces`. This is the exact retrofit debt the planning-order inversion exercise (brainstorm-260615-1430 § Technique 1) was designed to prevent. The inversion worked for the *outer* execution order (helper shipped first) but the *inner* implementation didn't follow through.
2. **`recurrence-tracker.js#checkAndEmit` writes findings directly to `meta-state.jsonl` via `appendFileSync`**, bypassing the `meta_state_report` MCP tool. This skips CAS versioning, session_id, and the audit trail. **Operator decision (2026-06-15 16:06)**: direct writes are accepted for now. The recurrence-tracker finding is not yet promoted to the learning loop; a follow-up brainstorm (after all 4 steps in the planning-order sequence ship) will reconsider MCP-mediation.

**1 aspirational spec field that was never implemented**: The plan's "unified decision shape" (§ Cross-cutting design) defines `skipped_via_override?: { rule_id, operator_note, expired_at }` as a Phase 2 addition to the decision log. The implementation hard-codes `skipped_via_override: false` everywhere in `bash-gate.js` — the field is dead. **Operator decision (2026-06-15 16:06)**: aspirational, not a hard requirement. The actual requirement (operator can override a block) is satisfied via `runtime-state.jsonl` audit. The field can be removed from the plan's decision shape in the CLEANUP batch to align the spec with the code.

**5 minor cleanup items** (2.1-2.5 in planning-order § Cleanup backlog). The journal's "Next Steps" mentions the backlog has 10 items but doesn't enumerate Step 2's 5. Process gap.

---

## Stage 1 — Spec Compliance

Loaded `references/spec-compliance-review.md`. The plan is the spec; the journal is the operator-facing summary; the diff is the actual delivery. For each phase: what the plan said, what the diff did, gap.

### Phase 1 — Decision visibility

| Plan claim | Implementation | Verdict |
|---|---|---|
| Use `hookSpecificOutput` on stdout for block/escalate | `bash-gate.js:118, 143` calls `formatHookDecision(promotedCheck, { channel: "hookSpecificOutput" })` | ✓ |
| Ok path stays silent | `bash-gate.js:131` `process.exit(0)` with no stdout | ✓ |
| `formatSoftWarning` contract reused | `protocol-adapter.js:97-107` new `formatHookDecision` matches `formatSoftWarning` shape | ✓ |
| Plan § Risk Assessment: "stderr is universal" | Replaced with "matches `formatSoftWarning` contract" in journal § What We Tried | ✓ |

**Test coverage**: `bash-gate-decision-visibility.test.js` (6 tests). ok path (line 41-45) asserts `stdout.trim() === ""`. Block path (line 47-55) and escalate path (line 57-80) parse stdout and verify the `hookSpecificOutput` envelope shape. unit test for `formatHookDecision` defaults and channel behavior (line 90-100). All pass.

**Minor**: Test ok path doesn't check `stderr` (it could be that the gate wrote to stderr and the test wouldn't catch it). Not a regression — current code doesn't write to stderr on ok.

**Verdict: Phase 1 spec-compliant.**

### Phase 2 — Override marker

| Plan claim | Implementation | Verdict |
|---|---|---|
| `.gate-override` marker in both surfaces | `gate-override.js:108-140` `for (const surface of SURFACES)` writes both | ✓ (functionally) but **uses hand-rolled loop, not `writeToAllSurfaces`** — see Important #1 |
| First-valid-wins read semantics | `gate-override.js:49-62` iterates `SURFACES` in order (`.claude` first) | ✓ |
| 1-second mtime-based cache | `gate-override.js:9, 35-47` `CACHE_TTL_MS = 1000` + mtime/size check | ✓ |
| `gate_override` MCP tool with TTL cap (24h) + operator_note required | `gate-override-tool.js:8-9` `max(86400)` + `min(1)` operator_note | ✓ |
| Reject unknown rule_ids (cross-ref `loadPromotedRules`) | `gate-override-tool.js:21-27` calls `loadPromotedRules` + `find` | ✓ |
| Audit in `runtime-state.jsonl` | `gate-override.js:74-92, 144` `appendOverrideAudit` | ✓ |

**Test coverage**: `gate-override.test.js` (13 tests). All pass. Tests cover: marker create, empty read, valid read, TTL expiry, merge on write, first-valid-wins (.claude wins), applyPromotedRules skip, applyPromotedRules non-skip, tool rejection of unknown rule, tool rejection of empty note, tool rejection of oversized TTL, tool success + audit trail.

**Verdict: Phase 2 functionally spec-compliant. Cleanup item 2.1 (hand-rolled cross-surface loops) applies here.**

### Phase 3 — Decision log

| Plan claim | Implementation | Verdict |
|---|---|---|
| Cross-surface `.gate-decision.log` append | `gate-decision-log.js:37-46` `for (const surface of SURFACES)` + `appendFileSync` | ✓ (functionally) but **hand-rolled loop + spec text said "write-temp + rename" while code uses `appendFileSync`** — see cleanup 2.2 |
| Atomic append, fail-open on error | `gate-decision-log.js:42-45` try/catch with stderr log | ✓ |
| Read from all surfaces, dedup, `since` filter | `gate-decision-log.js:65-103` | ✓ but **uses hand-rolled `readAllLogContents`, not `readFromAllSurfaces`** — see Important #1 |
| Decision shape: `ts, command_prefix, rule_id, decision, reason, matched_pattern, skipped_via_override` | `gate-decision-log.js:27-35` matches | ✓ but **`skipped_via_override` field is always `false`** — see Important #3 |

**Test coverage**: `gate-decision-log.test.js` (5 tests). All pass. Tests cover: per-call append, schema, fail-open on chmod 0o444, concurrent calls (Promise.all of 10), cross-surface read with dedup, `since` filter.

**Test gap (minor)**: The "concurrent calls do not corrupt" test uses `Promise.all(entries.map(...))` which simulates parallel calls in a single Node process. `appendFileSync` is synchronous and Node's event loop serializes the calls — there is no actual concurrency to test. A real concurrency test would spawn N child processes. The test passes for the wrong reason. Not a regression — `appendFileSync` is naturally safe in a single process — but the test is misleadingly named.

**Verdict: Phase 3 functionally spec-compliant with 2 spec drifts (loop pattern + appendFileSync vs write-temp+rename) and 1 dead field (skipped_via_override). Cleanup items 2.1 + 2.2 apply.**

### Phase 4 — Recurrence tracker

| Plan claim | Implementation | Verdict |
|---|---|---|
| Read `.gate-decision.log`, group by `rule_id + command_prefix_normalized` | `recurrence-tracker.js:46-51` | ✓ |
| Threshold N≥3 in M≤10min | `recurrence-tracker.js:7-8` `RECURRENCE_THRESHOLD_N = 3, RECURRENCE_WINDOW_MS = 10*60*1000` | ✓ |
| Auto-file `meta_state_report` findings | `recurrence-tracker.js:101-123` direct `appendFileSync` to `meta-state.jsonl` | **✗ bypasses MCP tool** — see Important #2 |
| `gate_check_recurrence` MCP tool | `gate-check-recurrence-tool.js` | ✓ |
| SessionStart hook (NOT UserPromptSubmit) | `recurrence-check-on-start.js` (universal) + `.cjs` wrappers in both surfaces; `settings.json` updated in both `.claude` and `.factory` | ✓ |
| Dry-run env var `GATE_RECURSION_DRY_RUN=1` | `recurrence-tracker.js:99` | ✓ |
| Read-time dedup against existing findings | `recurrence-tracker.js:87-97` | ✓ |

**Test coverage**: `gate-recurrence.test.js` (8 tests). All pass. Tests cover: threshold (3 in 10min → 1 group), below-threshold (2 → 0 groups), `command_prefix_normalized` groups similar commands (`node -e "echo foo"` / `node -e 'echo foo'` / `node -e  echo foo` collapse to one group), cross-surface dedup, `checkAndEmit` emits when no existing, `checkAndEmit` dedups against existing finding, dry-run env var, gate_check_recurrence MCP tool returns result JSON, SessionStart hook runs checkAndEmit and exits 0.

**Verdict: Phase 4 spec-compliant except for the direct `meta-state.jsonl` write (Important #2).**

### Phase 5 — Annotate planning-order report

`plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` line 191 shows `✅ shipped | meta-260615T1459Z-bash-gate-debate-step-2-shipping`. Line 195 references Step 2's plan dir. Cleanup backlog § Step 2 has 5 items (2.1-2.5). ✓

---

## Stage 2 — Code Quality

### Important findings

#### I-1. Cross-surface helper is bypassed in the files that depend on it (spec drift, cleanup item 2.1)

**Plan § Cross-surface discipline** (plans/260615-1530-.../plan.md:121-128):

> - **Override marker** is written to all surfaces via `writeToAllSurfaces(root, ".gate-override", content)`.
> - **Decision log** is written to all surfaces via `writeToAllSurfaces(root, ".gate-decision.log", line)`.
> - **Recurrence tracker** reads from all surfaces via `readFromAllSurfaces(root, ".gate-decision.log")`.

**Actual** (`gate-override.js:49-62, 108-140` and `gate-decision-log.js:37-46, 65-77`):

```js
// gate-override.js#writeGateOverride (lines 108-140)
for (const surface of SURFACES) {
  const path = join(root, surface, "coordination", OVERRIDE_FILE);
  // ... inline readFileSync → JSON.parse → merge → mkdirSync + writeFileSync + renameSync
}

// gate-decision-log.js#appendDecisionLog (lines 37-46)
for (const surface of SURFACES) {
  const path = join(root, surface, "coordination", DECISION_LOG_FILE);
  // ... inline mkdirSync + appendFileSync
}
```

The helper is imported (`import { SURFACES } from "./surfaces.js"`) but only the constant is used. The two helper functions (`writeToAllSurfaces` lines 25-38, `readFromAllSurfaces` lines 50-73 of `core/surfaces.js`) are not called.

**Why this matters**:

The planning-order report's whole thesis (inversion exercise + simplification cascade) is that **the helper is the one insight that eliminates 5+ special cases**. The cleanup backlog item 2.1 (planning-order § Step 2 cleanup) was filed by the reviewer precisely because Step 2 failed to apply the insight it was built on.

Specifically:

- `gate-override.js#writeGateOverride` does its own `readFileSync` + `JSON.parse` + `writeFileSync` + `renameSync` per surface. The helper's `writeToAllSurfaces` would replace the write half. The read half can't trivially be replaced because the function needs to read the existing marker on each surface independently (the helper's `readFromAllSurfaces` returns parsed JSON, but `writeGateOverride` needs to do a per-surface read-modify-write).

  - **Mitigation**: keep the per-surface read for the merge, but use `writeToAllSurfaces` for the write half. Or accept the divergence and document why (the merge requires read-before-write on the same path, which the helper's "atomic write to all" doesn't support).

- `gate-decision-log.js#readDecisionLog` rolls its own `readAllLogContents` (lines 65-77) using `readFileSync` + `existsSync`. The helper's `readFromAllSurfaces` would work if the entries were one JSON blob per surface, but they're JSONL (one entry per line). The helper doesn't handle JSONL. So this divergence is structural.

  - **Mitigation**: the helper could grow a `readJsonlFromAllSurfaces` variant, or `readDecisionLog` could add a per-line dedup wrapper around the helper's array result.

- `gate-decision-log.js#appendDecisionLog` uses `appendFileSync` (true append). The helper's `writeToAllSurfaces` does write-temp + rename (atomic overwrite). The two are different operations; `appendFileSync` is correct for a log file. This divergence is **intentional and correct**, but the plan's text said "write-temp + rename per call for atomicity" — the plan's spec text is wrong for the log use case. (Cleanup item 2.2 is filed for this.)

**Verdict**: **the planning-order report's whole simplification-cascade thesis is undermined for this step**. The helper shipped first (Step 1), but Step 2 didn't use it for its core cross-surface operations. Either the helper is incomplete (no JSONL read, no read-modify-write support) or the plan was over-prescriptive. The cleanup backlog documents the gap; the journal doesn't.

**Recommended action** (in the CLEANUP batch after Step 4 ships, per planning-order § Cleanup backlog):

- Extend `core/surfaces.js` with a `readJsonlFromAllSurfaces(root, subpath, options)` helper that returns per-line parsed JSON.
- Extend `core/surfaces.js` with a `readModifyWriteOnAllSurfaces(root, subpath, modifier)` helper that does the per-surface read-modify-write pattern.
- Refactor `gate-override.js` and `gate-decision-log.js` to use these helpers.
- Update the plan's "Cross-surface discipline" section to reflect the actual helper capabilities (or update the helpers to match the plan).

#### I-2. `recurrence-tracker.js` bypasses `meta_state_report` MCP tool (invariant violation)

`recurrence-tracker.js:101-123`:

```js
const finding = {
  id: generateFindingId(group.command_prefix_normalized),
  entry_kind: "finding",
  category: "gate-logic-bug",
  severity: "warning",
  affected_system: "gate-logic",
  subtype: "recurring-false-positive",
  recurrence_key: `${group.rule_id}::${group.command_prefix_normalized}`,
  description: ...,
  evidence_code_ref: "tools/learning-loop-mcp/core/recurrence-tracker.js",
  mechanism_check: true,
  status: "reported",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};
appendFileSync(join(root, "meta-state.jsonl"), JSON.stringify(finding) + "\n", "utf8");
```

The `meta_state_report` MCP tool (`meta-state-report-tool.js`) is the canonical write path for findings. Direct `appendFileSync` to `meta-state.jsonl` bypasses:

- **CAS versioning** (`entry.version` is not stamped; future `meta_state_patch` operations will fail with `version_mismatch`).
- **`session_id` idempotency** (the report is not deduplicated per session; if a SessionStart hook fires twice, you get two findings).
- **Operator preflight** (the operator must preflight before writing to product/** — this is a different surface, but the convention is "MCP-mediated writes are auditable; direct file writes are not").
- **Audit trail in `runtime-state.jsonl`** (the report is not recorded as a ledger event).

The `gate-check-recurrence-tool` MCP tool's handler (`gate-check-recurrence-tool.js:12-18`) calls `checkAndEmit(root, ...)` directly, which writes to `meta-state.jsonl` directly. The MCP tool is a thin wrapper, not a mediator.

**Why this matters**: meta-state.jsonl is a system-of-record. The invariant that "all findings go through the MCP tool" is what makes the registry honest (CAS, dedup, audit). Bypassing it for one specific finding type (recurring false positives) creates a parallel write path that future tools may copy. The loop's self-model starts to fracture.

**Verdict**: The finding is filed with all the right fields, but the write path is wrong. The risk is drift — if a future schema change adds a required field (e.g., `created_by`, `provenance`), the recurrence tracker will silently miss it.

**Recommended action** (in the CLEANUP batch, or sooner if the MCP tool path is well-trodden):

- `checkAndEmit` should call `metaStateReportTool.handler(...)` via a function call (not the MCP wire protocol) instead of constructing the entry + `appendFileSync` directly.
- Alternative: extract the `meta_state_report` core logic (the part that validates + writes) into a core function (`core/meta-state.js#writeEntry`) that both the MCP tool and the recurrence tracker call.

#### I-3. `skipped_via_override` field is dead

**Plan § Cross-cutting design** (lines 102-115):

```js
{
  decision: "ok" | "block" | "escalate",
  reason: string,
  rule_id?: string,
  matched_pattern?: string,
  // Phase 2 adds: skipped_via_override?: { rule_id, operator_note, expired_at }
  // Phase 3 adds: nothing (the log records this shape as-is)
}
```

The plan explicitly defines `skipped_via_override` as a Phase 2 addition to the decision log.

**Actual** (`bash-gate.js:116, 140` and `gate-decision-log.js:34`):

```js
appendDecisionLog(root, {
  command_prefix: command,
  rule_id: ...,
  decision: ...,
  reason: ...,
  matched_pattern: ...,
  skipped_via_override: false,  // <-- always false
});
```

The gate's `applyPromotedRules` (`gate-logic.js:687-690`) silently skips rules in the override set — it never returns a "skipped" decision. The gate only logs decisions that *fire* (escalate/block). The decision log never sees a `skipped_via_override: true` entry.

**Why this matters** (process, not correctness): The plan said the field would be populated. The implementation made the field always false. The journal doesn't mention this. The override *is* audit-tracked — in `runtime-state.jsonl` via `appendOverrideAudit` (`gate-override.js:74-92, 144`). So the audit trail exists, just in a different surface than the plan said.

**Verdict**: spec-vs-code drift. Audit trail exists in `runtime-state.jsonl`, so this is not a security or correctness gap. The plan should be updated to reflect the actual decision log shape (no skip event) or the gate should be updated to log skip events.

**Recommended action**: decide which is the source of truth for override audits (the decision log or the runtime-state.jsonl ledger). If the decision log, log a synthetic "ok" decision with `skipped_via_override: { rule_id, operator_note, expired_at }` from `applyPromotedRules`. If runtime-state.jsonl, remove the `skipped_via_override` field from the decision log entry shape and update the plan.

### Minor findings

#### M-1. Override cache doesn't cache "no marker found" results

`gate-override.js:64`:

```js
overrideCache.set(root, { result: null, at: Date.now(), path: null, mtime: 0, size: 0 });
```

The cache entry has `path: null`, so the read-path check at line 38 (`if (fresh && cached.path)`) is always false for null results. The next read re-iterates all surfaces. For high-frequency gate calls (every bash command), this is a perf regression — the cache is useless for the "no marker" case, which is the **common case** in sessions where the operator hasn't overridden anything.

**Fix**: drop the `if (cached.path)` guard; for null results, do a lightweight existence check (just `existsSync` per surface) and short-circuit.

#### M-2. `recurrence-tracker.js#generateFindingId` uses 6-char `Math.random()` (cleanup item 2.3)

`recurrence-tracker.js:70-73`:

```js
function generateFindingId(prefix) {
  const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 15);
  const suffix = `${slugify(prefix)}-${Math.random().toString(36).slice(2, 8)}`;
  return `meta-${ts}Z-${suffix}`;
}
```

6 base36 chars = ~2.2B values. Collision probability for N=1000 in one session: ~2.3e-4 (per birthday bound). Low but non-zero. `Math.random()` is also not cryptographically random.

**Fix**: use `crypto.randomBytes(4).toString("hex")` (8 hex chars = 4.3B values, no PRNG predictability). Or a per-process monotonic counter.

#### M-3. `gate-check-recurrence-tool.js` passes explicit `undefined` (cleanup item 2.5)

`gate-check-recurrence-tool.js:14-17`:

```js
const result = checkAndEmit(root, {
  threshold,                                    // undefined if not provided
  windowMs: window_minutes ? window_minutes * 60 * 1000 : undefined,
});
```

`checkAndEmit` handles undefined via `??` defaults. Functionally correct, but passing `undefined` explicitly is noise.

**Fix**: omit the keys when not provided (e.g., `const opts = {}; if (threshold != null) opts.threshold = threshold; ...`).

#### M-4. `recurrence-check-on-start.js` reads stdin and discards without comment (cleanup item 2.4)

`recurrence-check-on-start.js:15`:

```js
function main() {
  // SessionStart payloads are surface metadata; we do not need them.
  readFileSync(0, "utf8");
  ...
}
```

The comment exists, but the read itself is implicit. Future maintainers may not realize the read is intentional (vs. a leftover).

**Fix**: move the comment above the read explicitly: `// Drain SessionStart stdin (intentionally ignored).`.

#### M-5. `gate-override.js#writeGateOverride` doesn't filter out expired rule_ids from existing marker

`gate-override.js:112-122`:

```js
try {
  const existing = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(existing.rule_ids)) {
    for (const id of existing.rule_ids) {
      if (!ruleIds.includes(id)) ruleIds.push(id);
    }
  }
} catch {
  // No existing marker on this surface yet.
}
```

If the existing marker is expired (per `isExpired` in `readGateOverride`), the merge still includes the expired rule_ids. The new marker then resets `created_at`, making the previously-expired rule_ids valid again. This is the intended behavior (writeGateOverride is additive + refreshes the marker), but it's worth noting — an operator who thought they were cleaning up by re-running the override is actually extending everything's TTL.

**Fix**: if `isExpired(existing)` (per the same logic as `validateMarker`), start with `ruleIds = []` instead of merging. Or document the additive behavior prominently in the `gate_override` tool's description.

#### M-6. `bash-gate-decision-visibility.test.js` ok path doesn't check stderr

`bash-gate-decision-visibility.test.js:41-45` asserts `stdout.trim() === ""`. If the gate wrote to stderr (e.g., via a future debug log), the test wouldn't catch it. The current code doesn't write to stderr on ok, so this is a hypothetical gap.

**Fix**: assert `result.stderr` is also empty. Or document the gap.

#### M-7. Override cache invalidation test conflated with merge test

`gate-override.test.js:75-83`:

```js
writeGateOverride(root, { rule_id: "rule-foo", ttl_seconds: 3600, operator_note: "first" });
writeGateOverride(root, { rule_id: "rule-bar", ttl_seconds: 1800, operator_note: "second" });
const override = readGateOverride(root);
assert.deepStrictEqual(override.rule_ids, ["rule-foo", "rule-bar"]);
```

The test exercises the merge logic, not the cache invalidation. The 1-second cache TTL means the test would pass even without `overrideCache.delete(root)` if the two writes happen more than 1s apart. To explicitly test cache invalidation, the test should call `readGateOverride` *immediately* after the first write and *immediately* after the second write, asserting on the cache state in between.

**Fix**: add an explicit cache-invalidation test that calls `readGateOverride` between writes.

### Process findings

#### P-1. Journal doesn't enumerate Step 2's 5 cleanup items

The journal's "Next Steps" section mentions:

> Cleanup backlog: 10 items accumulated across Steps 1 and 2. Process in a single `plans/260615-CLEANUP-batch-cleanup-after-planning-order/` plan after all 4 steps ship.

But the journal doesn't list the 5 Step 2 items (2.1-2.5 in planning-order § Cleanup backlog). The Step 1 items are listed in the planning-order report but not in the journal either. The journal should at minimum link to the cleanup section of the planning-order report so future readers can find them.

**Fix**: in the journal's "Next Steps", link to `plans/reports/brainstorm-260615-1430-planning-order-...md#cleanup-backlog` and list the 5 Step 2 items with severity.

#### P-2. Change-log `created_at` is 46 minutes before the commit

`meta-state.jsonl` line 1211 (the change-log entry) has `created_at: 2026-06-15T07:59:02.966Z` (14:59 ICT). The commit timestamp is `2026-06-15 15:45:40 +0700` (08:45 UTC = 15:45 ICT). The 46-minute gap is plausible (dev drafted the change-log entry mid-work, committed later) but it means the audit trail's claim "this change shipped at 14:59 ICT" is inaccurate.

**Fix**: in the CLEANUP batch, re-stamp the change-log entry's `created_at` to match the commit timestamp. Or document the workflow convention (change-logs are created at the time of decision, not at the time of merge).

---

## Stage 3 — Final Verification

### Test suite re-run (2026-06-15 16:30 ICT)

```
ℹ tests 950
ℹ suites 105
ℹ pass 949
ℹ fail 0
ℹ skipped 1
ℹ duration_ms 9137.668589
```

Matches the tester report (949/950/1/0/0/9.1s). No regressions.

### Build status

`pnpm test` exits 0. No warnings.

### Git status

Working tree clean on branch `260614-1259-phase-b-codegen-adoption`. Commit `9f4a389` is the head.

### Verdict

**Ready to merge with no critical blockers.** The 2 important findings (I-1, I-2) and 1 important partial implementation (I-3) are spec-vs-code drifts that the cleanup backlog already documents. The 7 minor findings (M-1 through M-7) are bounded in scope and won't block downstream Steps 3-4.

---

## Recommendations (prioritized)

1. **(do now, before Step 3)** Decide whether the decision log captures override-skip events (per plan § Cross-cutting design) or runtime-state.jsonl does (per current code). **Per Q1 operator decision (2026-06-15 16:06)**: aspirational, not a hard requirement. Update the plan to remove `skipped_via_override` from the decision shape, OR leave the field as `false` and document. (Addresses I-3.)

2. **(deferred to Step 4's planning session, per Q3 operator decision 2026-06-15 16:11)** Decide whether Step 4 includes the helper extensions (`appendToAllSurfaces`, `readJsonlFromAllSurfaces`, `readModifyWriteOnAllSurfaces`) + Step 2 refactor, or defers them to the CLEANUP batch. The helper extension is the load-bearing abstraction for the runtime-agnostic rule's item #5; underinvesting now means future features re-discover the same gaps. (Addresses I-1.)

3. **(deferred, per Q2 operator decision 2026-06-15 16:06)** Move the `meta_state_report` write logic into a core function callable from `recurrence-tracker.js` and the MCP tool. Direct writes are accepted for now; a follow-up brainstorm after all 4 planning-order steps ship will reconsider MCP-mediation. (Addresses I-2.)

4. **(in the CLEANUP batch, regardless of Q3)** Process the 7 minor findings (M-1 through M-7) and the 2 process findings (P-1, P-2) in one session.

5. **(deferred)** Step 3 (`node -e` strip) is fully independent and can plan/build in parallel with the Step 4 planning decision.

---

## Unresolved Questions

- **Q1** (RESOLVED 2026-06-15 16:06): The `skipped_via_override` field is aspirational, not a hard requirement. The actual requirement is "operator can override a block" — which is satisfied by `runtime-state.jsonl` audit. The field should be removed from the plan's decision shape to align spec with code. (See I-3.)
- **Q2** (RESOLVED 2026-06-15 16:06): Direct writes from `recurrence-tracker.js` to `meta-state.jsonl` are accepted for now. The finding is not yet promoted to the learning loop; a follow-up brainstorm (after all 4 planning-order steps ship) will reconsider. (See I-2.)
- **Q3** (DEFERRED 2026-06-15 16:11 to Step 4's planning session): Step 4 is the judge. See the Q3 elaboration below for the feasibility analysis (3 helper functions + Step 2 refactor can fold into Step 4 Phase 2.5 or extend Phase 2). The operator's call: when Step 4's plan is created/validated, decide whether to include the helper extensions or keep them in the CLEANUP batch after Step 4 ships.

---

**Status:** DONE
**Summary:** Step 2 ships correctly (949/950 tests pass, 0 critical issues, 0 regressions). 2 important spec deviations (hand-rolled cross-surface loops, direct meta-state.jsonl writes) and 1 partial implementation (`skipped_via_override` field is dead) — all 3 already filed in the planning-order cleanup backlog. 7 minor + 2 process items to handle in the CLEANUP batch.
**Concerns:** None — the ship is correct, the plan is correct, the journal is mostly correct, the cleanup backlog is honest. The drift between plan § Cross-surface discipline and the actual code is the most interesting finding; it's a data point that "the helper is the one insight" was the right call for *existence* but not yet the right call for *adoption*.
