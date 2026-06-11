---
type: problem-solving
technique: simplification-cascades + meta-pattern-recognition
target: cold-session probe misusing meta-state.jsonl as a test-execution event log
triggered_by: review feedback on plans/reports/problem-solving-260611-0940-mcp-client-loading-slug-bloat.md (deleted; superseded by this report)
date: 2026-06-11
context: a 6-turn conversation surfaced six symptoms of the same root cause. The earlier 0940 slug-bloat report and the 1130 probe-vs-real-registry report both chased individual symptoms (slug noise, lifecycle misuse, dead reference chain, temporal race) without naming the underlying confusion. This report names it: test evidence is not self-knowledge. The fix is to split the evidence channels.
supersedes:
  - plans/reports/problem-solving-260611-0940-mcp-client-loading-slug-bloat.md (deleted; slug cascade is downstream of the channel split)
  - plans/reports/problem-solving-260611-1130-why-probe-writes-to-real-meta-state.md (deleted; option A is the recommended shape)
related_findings:
  - meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list (`status: "resolved"`, then re-corrected as still-open by 2026-06-08, then re-resolved 2026-06-09. The probe description cites this finding, but it is a historical artifact, not a live piece of self-knowledge.)
  - meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to (the "premature resolution" correction finding, also `status: "resolved"`. The probe description cites *this* finding, which cites the original — both ends of the chain are dead.)
  - meta-260608T1410Z-meta-state-jsonl-meta-260606t0443z-mcp-tools-not-loaded-into (the change-log that re-corrected the resolution; the only artifact in the chain still `status: "active"`)
  - meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env (why test 1 deliberately soft-skips on L2 gap)
  - rule-cold-session-test-must-pass-before-resolution (the rule the probe produces evidence FOR; its evidence contract needs to be re-examined)
related_plans:
  - 260606-cold-session-test-rule-promotion (initial probe design; "live parent" framing was wrong, see below)
  - 260610-1203-cold-session-churn-and-cross-compat-fix (the L1/L2 atomic-helper fix that made the dedup actually work; eliminated sibling-finding pairs but did not address the evidence-channel conflation)
---

# Cold-session probe evidence-channel split

## Frame

The cold-session test (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`) currently writes runtime-probe evidence to `meta-state.jsonl` as if it were a sequence of `finding` entries. The visible artifact is 18 entries with `subtype: "mcp-client-loading"`, `session_id: "test-cold-session-mcp-client-loading"`, `status: "stale"` (mostly), all sharing the same description (which itself points at a historical resolved finding via `meta-260608T1410Z-finding-meta-260606t0443z-...`).

The user pushed back across six turns on the framing of the cleanup. Each pushback revealed a deeper issue:

1. **Slug bloat** — the timestamp slug `mcp-client-loading-missing-<HHMM>` is decorative; the `(session_id, subtype, runtime, layer)` key is the actual key.
2. **Probe writes to real registry** — but the registry is the loop's self-knowledge store, and the probe is logging test-execution events.
3. **`status: "stale"` is wrong lifecycle** — `stale` is the post-TTL sentinel; the probe uses it to mean "test cleanup ran."
4. **Description is a pointer to a pointer** — 18 entries are 18 forward-references to one (resolved) historical observation, not 18 observations.
5. **Reference chain points at dead artifacts** — `meta-260606T0443Z` and `meta-260608T1410Z-...` are both `status: "resolved"`; the chain has no live end.
6. **"Live parent" framing has a temporal race** — a test fixture that depends on a real finding being live is asserting about external state the test does not control; an operator can resolve the parent between runs and the test silently fails to block.

Each issue was a downstream symptom. The root cause is one insight: **the cold-session test is misusing the meta-state registry as a test-execution event log.** The cascade: if test evidence is not self-knowledge, then we don't need (a) slug discipline in the registry, (b) probe-evidence `entry_kind` mixed with finding lifecycle, (c) `parent_finding_id` pointing at live or historical real findings, (d) a temporal race with operator-controlled lifecycles, (e) the architectural debate over sandbox-vs-real-registry writes, or (f) special-case "stale on 90s-old record" semantics. All six symptoms collapse to one fix: **separate the evidence channel for test execution from the self-knowledge store.**

## The one insight, named

**Test evidence is not self-knowledge.** They are different types of things.

- **Self-knowledge** (`finding`): a piece of the loop's self-model. Atomic unit: one observation the loop believes about itself. Lifecycle: `reported → active → resolved` (with `stale` as the post-TTL sentinel). Examples: "the agent-runtime tool list does not include MCP tools", "the patch tool has a wire-format coercion bug."
- **Test evidence** (`probe-evidence`, or external to the registry entirely): an observation about a piece of self-knowledge, made by a runtime probe. Atomic unit: "a probe ran at time T and got result R." Lifecycle: append-only, no `stale`, no `resolved_by`. Examples: "the cold-session L2 probe ran at 2026-06-11T08:01:09.815Z and got `TOOL_UNAVAILABLE`."

The current design conflates them: the probe writes `entry_kind: "finding"` with a 24h TTL, gets soft-deleted within ~90s by `auto-cold-session-test`, and the registry lifecycle is used as a test-execution signal. This conflation produces all six symptoms.

## Why this is the answer, not just an answer

The cascade eliminates 6 things with 1 insight:

1. The slug bloat (decorative timestamp id on a sequence of test events).
2. The `status: "stale"` lifecycle misuse (a TTL-decay sentinel repurposed as test-cleanup signal).
3. The pointer-to-pointer description (entries no longer need to inherit authority from a parent finding; they are self-describing test events).
4. The dead reference chain (no chain, because the test event doesn't reference a finding; it references its own probe layer and runtime).
5. The temporal race on a "live parent" (no parent at all; the probe event is its own thing).
6. The sandbox-vs-real-registry architectural debate (the real-vs-sandbox question dissolves: test evidence is in the test-evidence channel, the registry is for self-knowledge; "where does the test write?" becomes "what channel is test evidence?" not "sandbox or real registry?").

One insight, six eliminations. The slug-bloat cascade, the `entry_kind: "probe-evidence"` proposal, the parent-finding migration, the `claude-code-mcp-loading.test.cjs` port — all of these become individual tasks in a single coherent plan, not six independent fixes.

## The recommended shape: option A (probe leaves the registry entirely)

**Probe writes a `pass`/`fail` to a per-run evidence file. The rule consults the evidence file, not the registry. The probe never appears in the registry.**

Concretely:

1. **New evidence file:** `records/meta/probe-evidence/cold-session-<cli>-<layer>-<YYYY-MM-DD>.jsonl` (or a single append-only `probe-evidence.jsonl` keyed on `probe_id`). One line per probe run. Each line is self-describing:
   ```json
   {
     "probe_id": "cold-session-droid-L2-2026-06-11T08:01:09.815Z",
     "probe_layer": "L2",
     "probe_runtime": "droid",
     "probe_outcome": "gap-open" | "gap-closed",
     "probe_at": "2026-06-11T08:01:09.815Z",
     "exit_code": 0,
     "stdout_len": 17,
     "stderr_len": 0,
     "first200": "TOOL_UNAVAILABLE\n",
     "evidence_code_ref": "tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs#probeL2Gap"
   }
   ```
   This is a **test event**, not a self-knowledge claim. It carries its own evidence (`exit_code`, `stdout_len`, etc.) and its own code reference. It is not a `finding`; it does not enter the registry's lifecycle; it does not have a `session_id` because it does not need one (the `probe_id` is the unique key, timestamped for ordering).

2. **The rule's evidence contract changes** from "find an active finding matching `session_id: test-cold-session-mcp-client-loading`" to "read the most recent probe-evidence entry for `(probe_runtime, probe_layer)` matching the rule's target and check `probe_outcome: gap-closed`." The rule consults `records/meta/probe-evidence/`, not `meta-state.jsonl`.

3. **`meta_state_resolve` consults the rule** as before, but the rule's evidence is read from the per-run evidence file. The rule's `applies_to_resolution: "meta-260606T0443Z-..."` becomes a structural reference (the rule gates the resolution of *that specific finding*), not a string-literal pattern on a `session_id`.

4. **The 18 entries in `meta-state.jsonl` are test pollution.** They get superseded by a single change-log entry explaining the schema migration. The audit trail is preserved in `records/meta/probe-evidence/` (or wherever the new channel lands) — if anyone wants the per-run history, it's there, in a file designed for it, not in the self-knowledge store.

5. **The freshness sentinel** (`.cold-session-sentinel.json`, gitignored, 3-day cadence) stays. It is the operator-facing guarantee that the probe runs regularly, independent of the evidence-channel split.

## Why option A is recommended over option B (mocked fixture parent in sandbox)

The earlier draft of this report proposed two options: A (probe leaves the registry) and B (mocked fixture parent in `GATE_ROOT=tempRoot` sandbox). The recommendation has flipped to A.

**Reasoning:**

- **Option B keeps the registry as the single evidence store** for both self-knowledge and test evidence. The test mocks both the parent and the probe-evidence in a sandbox. This is more code than option A (the test has to set up the fixture, write to the sandbox, then tear it down) but uniform with the rule's current evidence contract (always reads the registry).
- **Option A separates the channels at the source.** Test evidence is in `records/meta/probe-evidence/`. Self-knowledge is in `meta-state.jsonl`. The rule's contract is uniform (always reads the appropriate evidence file for the appropriate question), but the *type* of evidence is partitioned by its source.

Option A is recommended because:

1. **The meta-pattern is "the registry is for self-knowledge, not for test events."** Option A is the literal expression of that insight. Option B is a compromise that keeps the registry as a multi-purpose store.
2. **Option A eliminates the need for `entry_kind: "probe-evidence"`.** No new entry_kind, no schema migration, no `parent_finding_id` field, no `_expected_version` CAS dance on probe events. The test channel is a simple append-only JSONL.
3. **Option A eliminates the temporal race entirely.** The probe evidence has its own lifecycle (append-only) that does not interact with the finding lifecycle. An operator resolving `meta-260606T0443Z` has no effect on the probe evidence. The test does not depend on any real finding's state.
4. **Option A is less code overall.** The schema migration in option B (new entry_kind, fixture setup/teardown, sandbox registry management) is more code than just "write a line to `records/meta/probe-evidence/cold-session-...`." The test logic is the same; the storage target changes.
5. **Option A is honest about the semantics.** A test event is not a finding. A test pass/fail is not a `status: "stale"`. Storing test events as findings was the conflation; storing them in a dedicated test-evidence channel is the natural expression.

The one trade-off option A accepts: the rule's evidence contract is now "read from two files" (the registry for self-knowledge, the probe-evidence file for test evidence). This is acceptable because the contract is per-rule: each rule declares its evidence source in its schema, and the consult logic routes accordingly. Bridge 6 already supports this (the 4-kind union of `entry_kind: finding | change-log | rule | loop-design` is the precedent for "the registry is partitioned by type").

## What does NOT change

- The `entry_kind: "finding"` schema — fields are correct; only the test's mis-use of them is wrong.
- The `tryClaimSessionId` helper in `core/meta-state.js` — it is correct for the dedup-by-key case it was designed for; the cascade is upstream (the test should not be using it for test events).
- The `rule-cold-session-test-must-pass-before-resolution` rule — its semantic intent ("the cold-session test must pass before this finding can be resolved") is preserved; only its evidence source changes.
- The 4-part fix in `a9098dd` (atomic helper, layer isolation, freshness sentinel, cross-CLI compat) — all four contributions stand. The TOCTOU race fix is still needed; the layer-isolation logic is still needed; the sentinel is still needed; the cross-CLI detection is still needed. The 4-part fix eliminated sibling-finding pairs and the layer-confusion bug; what it did NOT eliminate is the evidence-channel conflation. That is what this report fixes.
- The `claude-code-mcp-loading.test.cjs` analogous probe — it follows the same pattern and needs the same migration.
- The freshness sentinel — independent of the evidence-channel split.

## What gets superseded / migrated

- The 18 entries in `meta-state.jsonl` (and any others in the 11 call sites across `gate-resolution-evidence.test.js`, `cold-session-churn-regression.test.js`, `cold-session-discoverability.test.cjs`, `claude-code-mcp-loading.test.cjs`): all are test pollution. Migrate by:
  1. Writing a single change-log entry in `meta-state.jsonl` explaining the schema migration (entry_kind=`change-log`, change_dimension=`semantic`, change_target=`records/meta/probe-evidence/`, change_diff includes "test events no longer enter meta-state.jsonl").
  2. Superseding the 18 entries (or all 11 call-site entries) with `consolidated_into: <change-log-id>` and `status: "superseded"`. The audit trail moves to the change-log entry; the per-run history moves to `records/meta/probe-evidence/`.
- The `gate-resolution-evidence.test.js` 10 test fixtures that use `core.generateId("mcp-client-loading-missing")` as a key — these are unit tests of the rule mechanism, and they are correct to use the registry as a fixture store. They do NOT need to migrate to the new channel; they are testing the registry path. The `entry_kind: "finding"` they create is a fixture, not test pollution.

## Concrete next steps

1. **Apply the slug-bloat cascade as a low-cost cosmetic cleanup** (Cascade 1 deterministic id + Cascade 2 reopen-on-version-bump). This buys time and reduces visible noise while the structural fix is designed. It does NOT solve the root issue; it makes the registry less ugly while we design the channel split.

2. **Open a follow-up plan** for the evidence-channel split. Scope:
   - Define the probe-evidence file location and schema: `records/meta/probe-evidence/cold-session-<runtime>-<layer>-<YYYY-MM-DD>.jsonl` (or a single append-only file keyed on `probe_id`). One line per probe run. Schema is small and focused (no finding lifecycle).
   - Refactor `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs#probeL2Gap` and the L1 test 3 to write to the probe-evidence file, not `meta-state.jsonl`.
   - Refactor `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` tests 1, 2, 4, 6 (the sandbox tests) to *also* write to the probe-evidence file, so all 5 tests share the same evidence channel. Tests 1, 2, 4, 6 currently use `GATE_ROOT=tempRoot` for unit-test isolation; with the channel split, they can use the same probe-evidence file with a `probe_id` that includes the test name, and the unit-test isolation becomes a no-op (different `probe_id` namespaces).
   - Update `core/gate-logic.js#checkResolutionEvidence` Branch 2 to read from `records/meta/probe-evidence/` (filtering by `probe_runtime`, `probe_layer`, and most-recent `probe_at`) instead of querying `meta-state.jsonl` for `subtype === "mcp-client-loading" && session_id === "test-cold-session-mcp-client-loading"`.
   - Update `rule-cold-session-test-must-pass-before-resolution` to declare its evidence source as the probe-evidence file (the rule's `pattern` becomes a structural query, not a string-literal `session_id` pattern).
   - Migrate the 18 historical entries in `meta-state.jsonl` to the change-log + supersede pattern. The audit trail moves to the change-log; the per-run history moves to `records/meta/probe-evidence/` (if anyone wants the per-run history, it can be reconstructed from the test logs).
   - Port `claude-code-mcp-loading.test.cjs` to the new evidence channel.
   - Add a new test that asserts the cold-session test does NOT write to `meta-state.jsonl` (catches regressions where a future contributor re-introduces the conflation).

3. **Keep the freshness sentinel** (`.cold-session-sentinel.json`, gitignored, 3-day cadence). It is the operator-facing guarantee that the probe runs regularly, and it is independent of the evidence-channel split.

4. **Update the rule entry's `pattern` field** from `test-cold-session-mcp-client-loading` (string-literal session_id) to a structural predicate (`probe_runtime: droid, probe_layer: L1 | L2, evidence: probe-evidence`). This makes the rule's evidence contract testable in isolation (unit tests of the rule mechanism can use fixture probe-evidence files without touching the registry).

## Red flags avoided

- **"Just delete the 18 entries and move on"** — loses the audit trail; the per-run history is useful for debugging the cold-session test itself.
- **"Add a `entry_kind: probe-evidence` to the registry and call it done"** — keeps the evidence-channel conflation (test events in the self-knowledge store) and adds a new entry_kind without solving the root issue. This was the option B recommendation in the earlier draft; the user pushback on the temporal race correctly identified it as a hybrid that inherits the worst of both worlds.
- **"Mock the parent as a fixture in the sandbox"** — option B above. Solves the temporal race but keeps the conflation. The user pushback correctly identified that the parent should not be a real finding; the deeper question is whether the parent should exist at all. Option A says "no parent; test events are their own thing."
- **"Move the probe to a long-running daemon"** — adds a process supervisor, lifecycle management, and a way to keep the rule's evidence fresh. The current design ("the test runner is the daemon; freshness sentinel enforces cadence") is simpler and equivalent for this use case.
- **"Use a database for the probe-evidence file"** — over-engineering. A simple append-only JSONL is sufficient for the access pattern (read most-recent N entries by `probe_runtime + probe_layer`).
- **"Split the registry into two files: `meta-state.jsonl` for findings, `meta-state-test.jsonl` for test events"** — re-introduces the multi-file problem the loop has been trying to eliminate. The right split is *by evidence type* (self-knowledge vs test evidence), not *by file* (findings vs test events). `records/meta/probe-evidence/` is the right home for test events; it is a separate concern from the self-knowledge registry, and naming it differently from `meta-state.jsonl` makes the partition explicit.

## Meta-pattern: any test that writes to the self-knowledge registry is mis-using it

The cold-session test is not unique. The same pattern appears in:
- `claude-code-mcp-loading.test.cjs` (analogous probe, same `subtype: "mcp-client-loading"`, same `session_id` convention)
- `gate-resolution-evidence.test.js` (unit tests of the rule mechanism — these are *correctly* using the registry as a fixture store; the registry IS the test target)
- `cold-session-churn-regression.test.js` (unit tests of the `tryClaimSessionId` dedup — correctly using a sandbox)

The pattern: **tests that write to the registry because they are testing the registry** (gate-resolution-evidence, cold-session-churn-regression) are correct. **Tests that write to the registry because they are logging test events** (cold-session-discoverability L1+L2, claude-code-mcp-loading) are mis-using it. The cascade rule: if a test's purpose is "exercise the registry's contract," write to a sandbox. If a test's purpose is "log a runtime observation that the loop needs to remember," write to a dedicated evidence channel for that observation type. Never write test events to the self-knowledge store.

## One-liner summary

The cold-session probe writes 18 `entry_kind: "finding"` entries to `meta-state.jsonl` because the loop conflates test evidence with self-knowledge. The slug bloat, the `status: "stale"` lifecycle misuse, the dead reference chain, the temporal race on a "live parent," and the architectural sandbox-vs-real-registry debate are all downstream symptoms of that conflation. The structural fix is to split the evidence channels: test events go to `records/meta/probe-evidence/` (a dedicated append-only JSONL), the registry stays clean for self-knowledge, and the rule's evidence contract becomes structural (read the most-recent probe evidence for `(runtime, layer)`) instead of a string-literal `session_id` pattern. The slug-bloat cascade is a valid cosmetic cleanup but does not solve the conflation.

## Why this supersedes the earlier two reports

The 0940 slug-bloat report identified the slug noise and proposed a deterministic-id cascade. That cascade is valid (Cascade 1) but it is downstream of the channel split. The slug noise is a symptom; the channel split eliminates the symptom's source.

The 1130 probe-vs-real-registry report went through three revisions (live parent, mocked parent, no parent) before arriving at "no parent — the test event is its own thing." The revisions are captured in this report as a single recommended shape (option A: probe leaves the registry). The conversation's signal — that each proposed framing had a downstream problem the user caught — is the empirical evidence that the conflation is the right diagnosis. A correct fix should not require three revisions; the channel split does not.
