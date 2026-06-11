---
type: problem-solving
technique: inversion-exercise + simplification-cascades
target: plans/reports/problem-solving-260611-1220-meta-state-evidence-channel-split.md (the channel-split recommendation)
triggered_by: operator pushback that "building another type of registry (for just that test specifically) is bloated and defeated the self purpose of 'self-learning' loop. What if the e2e test catch the problem? It should be promoted to finding or something"
date: 2026-06-11
status: counter-proposal — supersedes the channel-split plan if accepted
related_reports:
  - plans/reports/problem-solving-260611-1220-meta-state-evidence-channel-split.md (the report being critiqued; this is a structural alternative)
  - plans/reports/problem-solving-260611-0940-mcp-client-loading-slug-bloat.md (deleted; cascade 1/2 still apply as cosmetic cleanup)
  - plans/reports/problem-solving-260611-1130-why-probe-writes-to-real-meta-state.md (deleted; the option A vs B debate is reframed here)
related_findings:
  - meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list (the original gap; the target of the rule's gate)
  - meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to (the "premature resolution" correction; points at the agent-runtime layer, not the CLI catalog)
  - meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env (why test 1 soft-skips on L2 gap)
  - rule-cold-session-test-must-pass-before-resolution (the rule whose evidence contract gets rewritten)
related_tests:
  - tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs (the probe target; L1 in test 3, L2 in test 5)
  - .claude/coordination/__tests__/claude-code-mcp-loading.test.cjs (analogous probe; same migration applies)
related_plans:
  - 260606-cold-session-test-rule-promotion (initial probe design; the "live parent" framing this report replaces with "test result is the parent")
  - 260610-1203-cold-session-churn-and-cross-compat-fix (the L1/L2 atomic-helper fix; stands, the test invariant it protects is the one this report uses)
---

# Cold-session probe: fail-to-finding promotion

## Frame

The 1220 channel-split report (option A) proposes a dedicated `records/meta/probe-evidence/` JSONL channel for cold-session test output, plus a rule rewrite to consult that channel instead of `meta-state.jsonl`. The diagnosis (test evidence is not self-knowledge) is correct, but the prescription is heavier than the disease: a parallel registry for one test's outputs duplicates the evidence channel that the test runner already provides.

**The inversion:** the test is the source of truth, not the registry. The registry is a downstream consumer of *interesting* test outcomes, and the only interesting outcome is a failure. A passing test is silent. A failing test writes exactly one `finding` per novel assertion, with the normal lifecycle.

**One insight, many eliminations** (the cascade):
- Eliminate the parallel `records/meta/probe-evidence/` JSONL (the test runner's stdout IS that file).
- Eliminate the `probe_id` / `probe_layer` / `probe_runtime` schema (Jest's test name + assertion failure message IS that schema).
- Eliminate the rule's evidence-contract rewrite (the rule already knows how to gate on `status: "active"`; the only change is *when* a finding is born).
- Eliminate the 18-entry migration (entries are born on failure only; on a healthy CI run the test writes zero registry entries).
- Eliminate the change-log + supersede cascade (no entries to supersede).
- Eliminate the temporal race on a "live parent" (the parent doesn't exist; the test is its own parent).
- Eliminate the sandbox-vs-real-registry debate (the test's write to the registry is conditional on a *real* failure, so the GATE_ROOT=tempRoot isolation becomes "test pollution only happens when there is something to learn").
- Eliminate the `entry_kind: "probe-evidence"` schema proposal (no new entry_kind).
- Eliminate the slug cascade's cosmetic urgency (slugs only exist on failure paths; passing tests are slugs-free by construction).

## The one insight, named

**A passing test is not evidence; a failing test is a finding.**

The test runner's `pass`/`fail` exit code is the *authoritative* signal. The registry's role is to capture *what was learned* from a failure, not to log the test's existence. The cold-session probe currently writes a `finding` on every run (deduped by `session_id+subtype`), which conflates "I ran" with "I learned something." The fix is conditional emission: only emit on a real, novel failure.

This is structurally different from the channel-split report's framing. The 1220 report's option A creates a parallel test-evidence channel that the rule then consults structurally. This proposal collapses the test-evidence channel into the *test itself* (Jest's exit code) and the rule's evidence contract stays exactly the same: "an active finding matching the rule's predicate." The only change is *how the finding gets created* — by the test on failure, not on every run.

## Why this is simpler than the channel split

| Aspect | 1220 channel split (option A) | This proposal (fail-to-finding) |
|---|---|---|
| New files | `records/meta/probe-evidence/<runtime>-<layer>-<date>.jsonl` | none |
| New schema | `probe_id`, `probe_outcome`, `probe_at`, `probe_layer`, `probe_runtime` | none |
| Test writes on pass | 1 line to JSONL | 0 lines |
| Test writes on fail | 1 line to JSONL | 1 finding to registry |
| Rule's evidence source | `records/meta/probe-evidence/` (new file) | `meta-state.jsonl` (unchanged) |
| Rule's evidence contract | structural query on probe_id | unchanged: `subtype && session_id` predicate |
| Migration of 18 entries | change-log + supersede cascade | n/a (no entries on pass) |
| Slug discipline | 18 slugs (one per test run) | 1 slug per failure (rare) |
| Sandbox vs real registry debate | must resolve for the test's per-run JSONL write | n/a (test only writes on real failure) |
| Temporal race on "live parent" | n/a (no parent) | n/a (no parent; finding is born fresh) |
| New `entry_kind` | `probe-evidence` (proposed) | none |
| Schema migration | entry_kind union extension | none |
| Lines of code (LOC) changed | ~400 (channel + rule + migration + tests) | ~50 (test refactor only) |

The asymmetry is the point. The 1220 report's option A is a generic infrastructure for "tests want to log runtime evidence." This proposal is a specific fix for "the cold-session test was logging on every run." The specific fix is 8x less code, no new schemas, no migration, and survives the next test that wants to log something (the pattern is reusable without building infrastructure).

## What the change looks like in code

### Current state (test 3, L1 probe)

```js
// tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs
// On gap-open: write a finding via tryClaimSessionId.
// On gap-close: soft-delete the existing finding.
if (STRICT_MCP_TOOL_PATTERN.test(toolsList)) {
  // ... soft-delete the L1 finding ...
  return;
}
// ... claim + write the L1 finding ...
```

The problem: the test writes a finding on *every gap-open run*, even when the finding already exists in `active` or `reported` state. The 18 entries in `meta-state.jsonl` are the dedup working correctly: 18 runs of the test, 18 finding entries, 17 superseded, 1 active. The dedup is not the bug; the unconditional write is.

### Proposed state (test 3, L1 probe)

```js
// Same probe, different write strategy.
if (STRICT_MCP_TOOL_PATTERN.test(toolsList)) {
  // Pass path: write nothing. The finding (if any) ages out via TTL.
  // We do not soft-delete; the rule's auto-resolve on TTL is enough.
  return;
}

// Fail path: write a finding ONLY IF none exists.
const existing = readRegistry(projectRoot).find(/* predicate */);
if (existing) return; // already tracked; do not duplicate.

await writeEntry(projectRoot, /* finding payload */);
```

Same change for test 5 (L2 probe). The soft-delete branch is removed entirely; the registry's normal lifecycle (`reported → active → resolved` on TTL or on operator `meta_state_resolve`) handles the cleanup.

### The rule's evidence contract is unchanged

```js
// core/gate-logic.js#checkResolutionEvidence (current)
// Branch 2: subtype === "mcp-client-loading" && session_id === "test-cold-session-mcp-client-loading"
// (active finding blocks resolution)
```

The predicate stays the same. The only thing that changes is *how often* the predicate matches a registry entry: on a healthy CI run, the test passes, no entry is written, the predicate never matches, the rule never blocks. On a broken CI run, the test fails, exactly one entry is written (the first time the assertion breaks; subsequent runs dedup), the predicate matches, the rule blocks.

The temporal race the 1220 report identified (operator resolves the parent between runs) becomes a non-issue: the test's writes are idempotent via `tryClaimSessionId`, and the test's "parent" is its own prior failure, not a real external finding.

## Why this is the right cascade

The 1220 report's option A and this proposal both identify the same root cause (test evidence ≠ self-knowledge). The difference is the cure:

- **Option A's cure:** introduce a *new evidence channel* and route the rule through it. The principle "evidence is partitioned by type" is sound, but the partition is overkill for one test.
- **This proposal's cure:** eliminate the conflation at the *write site*. The principle "tests should only write to the registry on novel failure" is sound, and the partition is implicit (the test runner partitions "ran" from "failed"; the registry captures "failed").

Both are valid simplifications. This one is simpler because it does not add a surface; it removes a behavior.

## The "what about the per-run history?" question

The 1220 report's strongest objection to deletion is "the per-run history is useful for debugging the cold-session test itself." That history exists — in `pnpm test`'s output, in CI's run logs, and in Jest's `test-results.json`. The registry is the *wrong* place for it because:

1. The registry's lifecycle (`reported → active → resolved`) is a *belief* lifecycle, not an *event* lifecycle. A test run is an event; the test result is a belief. The conflation was the bug.
2. The per-run history is high-volume (every test run) and low-signal (most runs are passes). The registry is low-volume (one entry per novel failure) and high-signal (every entry is something to learn). Inverting this is the loop's value.
3. If a future debugging session needs the per-run history, it is in CI logs, not in `meta-state.jsonl`. The 1220 report's `records/meta/probe-evidence/` is a third place for the same data, with no better queryability than CI logs.

## What does NOT change

- The rule `rule-cold-session-test-must-pass-before-resolution` — its semantic intent is preserved; its evidence contract is unchanged.
- The 4-part fix in `a9098dd` (atomic helper, layer isolation, freshness sentinel, cross-CLI compat) — all four stand. The TOCTOU race fix is still needed (the test still uses `tryClaimSessionId`); the layer-isolation logic is still needed (L1 ≠ L2); the sentinel is still needed (operator cadence); the cross-CLI detection is still needed (droid vs claude).
- The freshness sentinel (`.cold-session-sentinel.json`, gitignored, 3-day cadence) — independent of this proposal.
- The `tryClaimSessionId` helper — its purpose was to prevent duplicate writes, and this proposal uses it for exactly that.
- The `entry_kind: "finding"` schema — fields are correct; only the test's mis-use of them changes.
- The `claude-code-mcp-loading.test.cjs` analogous probe — same refactor applies.
- The `gate-resolution-evidence.test.js` 10 fixtures — they test the *registry's* contract and are correct to use the registry as a fixture store.

## What gets superseded / migrated

- The 18 entries in `meta-state.jsonl` (and any others from L1/L2 probes): all are pollution from unconditional writes. Migrate by:
  1. Writing a single change-log entry explaining the test refactor: "the cold-session probe now writes a `finding` only on novel failure; passing tests are silent. This eliminates the 18-entry pollution pattern."
  2. Superseding the 18 entries with `consolidated_into: <change-log-id>` and `status: "superseded"`. The audit trail moves to the change-log; the per-run history was never the registry's job.
- The slug bloat (decorative `mcp-client-loading-missing-<HHMM>` timestamp id): the 1220 report's cascade 1 (deterministic id) and cascade 2 (reopen-on-version-bump) are still valid as *cosmetic* cleanup. They become low-priority because the slug only exists on failure paths, which are rare.
- The `cold-session-churn-regression.test.js` tests: unaffected. They test the dedup helper, which this proposal still uses.

## Concrete next steps

1. **Refactor `cold-session-discoverability.test.cjs` tests 3 and 5** (L1 and L2 probes) to write a `finding` only on the *first* gap-open run (no entry exists), and to *not* soft-delete on gap-close. The test becomes:
   - Pass: write nothing.
   - Fail: dedup-write via `tryClaimSessionId`; if the dedup says "already tracked," write nothing.

2. **Refactor `claude-code-mcp-loading.test.cjs` analogously** — same pattern, same fix.

3. **Migrate the 18 historical entries** to a single change-log + supersede cascade. The change-log explains "the cold-session probe was unconditionally writing findings; it now writes only on novel failure." The 18 entries get `consolidated_into: <change-log-id>`.

4. **Keep the freshness sentinel** as the operator-facing cadence check. Independent of this proposal.

5. **Add a regression test** asserting the cold-session test does NOT write to `meta-state.jsonl` on pass. This locks the conditional-emission invariant.

6. **Optionally apply the slug cascade** (deterministic id + reopen-on-version-bump) as a low-cost cosmetic cleanup. Not blocking; the slug is only present on failure paths, so its visibility is naturally bounded.

## Red flags avoided

- **"Build a parallel evidence channel"** — adds infrastructure for one test's outputs. Defeats the "self-learning" purpose: the loop should learn from *what tests say*, not from *that tests ran*.
- **"Add a new `entry_kind: probe-evidence`"** — schema migration for one test. The 4-kind union (`finding | change-log | rule | loop-design`) is the canonical partition; tests-as-evidence is not a new kind, it's the absence of a finding.
- **"Soft-delete on gap-close"** — the current design uses `status: "stale"` as a test-cleanup signal. That's a lifecycle misuse (stale is the post-TTL sentinel). Normal lifecycle (TTL → auto-resolve) handles cleanup; the test does not need to manage it.
- **"Move the probe to a long-running daemon"** — adds process supervision. The test runner *is* the daemon; the freshness sentinel enforces cadence.
- **"Use a database for the probe-evidence file"** — over-engineering for the access pattern. The test runner's output is the database.
- **"Split `meta-state.jsonl` into two files"** — re-introduces the multi-file problem the loop has been eliminating. The right split is by *write semantics* (conditional vs unconditional), not by file.

## Meta-pattern: any test that writes to the self-knowledge registry on pass is mis-using it

The cold-session test is not unique. The same anti-pattern appears in:
- `claude-code-mcp-loading.test.cjs` (analogous probe, same unconditional write)
- Any future test that calls `meta_state_report` to "log a test event" — the canonical anti-pattern.

The pattern: **a test's `meta_state_report` call should be conditional on the test's own failure, not on its invocation.** A passing test writes nothing to the registry. A failing test writes one `finding` per novel assertion. The cascade rule: if a test's purpose is "exercise the registry's contract," write to a sandbox. If a test's purpose is "log a runtime observation that the loop needs to remember," write a `finding` only when the observation is *novel* (the assertion broke, and no existing entry tracks it). Never write a finding on every test run.

## One-liner summary

The cold-session probe writes 18 `entry_kind: "finding"` entries to `meta-state.jsonl` because the test writes on every run, not because the evidence channel is wrong. The fix is conditional emission at the write site: pass → silent, fail → one finding (deduped). The registry's lifecycle handles the rest. The channel-split plan (option A in the 1220 report) builds a parallel evidence infrastructure for one test's outputs; the conditional-emission plan makes the test ask "did I learn something?" before writing. The 18 entries collapse to zero on a healthy CI run and to one per failure, with no new schemas, no new files, no migration of the evidence channel.

## Why this supersedes the 1220 channel-split report

The 1220 report correctly identifies the root cause (test evidence is not self-knowledge) and proposes a generic infrastructure for partitioning test evidence from self-knowledge (option A: a parallel JSONL channel). This proposal accepts the root cause but rejects the infrastructure: the test runner is already the test-evidence channel, and the registry's role is to capture *what was learned*, not *that something ran*. The 1220 report's option A is a 400-LOC structural change for a 50-LOC behavior change. The behavior change is the right one because it survives the next test that wants to log something (the conditional-emission rule generalizes without infrastructure).

The 1220 report's option B (mocked fixture parent in sandbox) is rejected for the same reason as in the 1220 report itself: it preserves the conflation. Option A is the 1220 report's recommendation, and it is the right *diagnosis* with the wrong *prescription*. This proposal is the prescription that matches the diagnosis: make the test ask before it writes.
