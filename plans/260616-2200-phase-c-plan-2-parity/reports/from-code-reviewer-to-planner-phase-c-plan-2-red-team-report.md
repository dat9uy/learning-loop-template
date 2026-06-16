# Red-Team Review — Phase C Plan 2 (Parity Gate, C4)

**Type:** Hostile reviewer red-team (5 personas)
**Date:** 2026-06-16
**Reviewer:** code-reviewer (red-team mode)
**Scope:** `plans/260616-2200-phase-c-plan-2-parity/` (plan.md + 8 phase files)
**Personas applied:** Correctness, Security, Performance, UX, Maintainability
**Source files cited are absolute paths under `/home/datguy/codingProjects/learning-loop-template/`.**

---

## Executive Summary

Plan 2 is the load-bearing gate for the Phase C migration. If parity is proven, Plan 3 (cut-over) is operationally simple. If it is *not* proven, the migration stalls. The plan is **architecturally sound but operationally under-specified in 5 places that could cause the gate to fail in surprising ways or pass while not actually proving parity.** Two findings are CRITICAL (block merge); four are HIGH (must address before merge); six are MEDIUM (acceptable risk, but flag for the operator); three are LOW (cosmetic).

The most concerning pattern: the plan repeatedly defers concrete verification (write-side tools, `z.toJSONSchema` failure modes, real `tools/call` content parity) to "Phase 7 follow-up if needed" or "spec drift, fix and retry." The gate's job is to *catch* drift, not to negotiate with it.

**Verdict:** **BLOCKED** — two CRITICAL findings (R-01, R-02) plus four HIGH findings must be addressed or the plan ships a gate that may pass without proving parity. See verdict at end.

---

## Findings by Severity

### CRITICAL

#### R-01 [CRITICAL] — Plan 4: `z.toJSONSchema()` failure mode is "skip with message" not "fail with diff"
**Persona:** Correctness
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-04-output-comparison.md:87`
**Finding:** Phase 4's risk section says "if `z.toJSONSchema()` fails on `ZodRecord`, `ZodIntersection`, or other union types, the test should catch and skip with a clear message (not silently pass)." This is **the wrong failure mode for a parity gate.** A parity gate's job is to fail on any divergence. "Skip with a clear message" is a polite way to ship a gate that passes even when parity is unknown. The plan acknowledges `unrepresentable: "throw"` is the default, then proposes catching and skipping — this inverts the contract. If even one of the 29 tools has a schema `z.toJSONSchema()` cannot represent, the structural parity claim is *unknown*, not *proven*. The acceptance gate sentence requires "byte-identical output"; skipping is not byte-identical.

**Recommended action:** Either (a) replace `unrepresentable: "throw"` with `unrepresentable: "any"` to coerce all unrepresentable types to `{}` so the test fails on the diff (preferred — surfaces the schema as broken in CI), or (b) hard-fail the test when `z.toJSONSchema()` throws, naming the tool + field. A skip should not be a path to green.

**Disposition:** DISCUSS (operator decides between (a) and (b); this is a gate contract decision, not a Claude call).

---

#### R-02 [CRITICAL] — Plan 4: Test count math contradicts itself
**Persona:** UX (auditability) + Correctness
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-04-output-comparison.md:73` vs `plan.md:54` vs `phase-07-acceptance-gate.md:30`
**Finding:** The plan claims 63 tests in `parity-zod-to-json-schema.test.js` (= 29 schema tests + 5 read-only `tools/call` + 3 probes). But the math is back-derived: 29 tools × 1 schema assertion = 29 (not 58 as claimed on line 61 of phase-04: "29 tools × 2 assertions each = 58 test cases"). Where do the 58 come from? Per-tool: schema parity (1) + description parity (1) = 2 → 58. But the harness code on lines 102-104 of phase-02 already includes description as a top-level field parity check, not a separate `tools/list`-level test. The actual count is either 29 (one test per tool, with multiple asserts) or 58 (two tests per tool, with description as a separate test). The plan doesn't say. Then Phase 7 claims "55 + 63 + 5 + 3 = 126"; this is the source of the 126 anchor. If the real count is 29 + 5 + 5 + 3 = 42, the acceptance gate's "126" is wrong. Phase 7 admits "the actual count depends on the test implementation" — that is a sign the acceptance gate is unfalsifiable.

**Recommended action:** Rewrite Phase 4 step 3 to be explicit: "for each of 29 tools, one `test()` block asserts schema parity + description parity. 29 tests, not 58." Then recompute Phase 7's 126. Either 55 + 29 + 5 + 3 = 92 (if the harness counts each tool as one test) or 55 + 58 + 5 + 3 = 121 (if each tool has two separate tests). Pick one and document it. The reviewer must be able to verify "126 tests" by running `node --test` and counting.

**Disposition:** ACCEPT (correct the math; the answer is whichever is true, but pick one and be explicit).

---

### HIGH

#### R-03 [HIGH] — Plan 3: `meta-state.jsonl` JSONL interleaving is unhandled
**Persona:** Security (data integrity) + Correctness
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-03-spawn-loop.md:78-80`
**Finding:** The plan acknowledges the risk of both servers writing to the same `meta-state.jsonl` simultaneously, and the mitigation is "the helper exposes sequential `await fn(...)` semantics; tests are expected to await each call." This is **test-discipline-only**; the helper cannot enforce sequential writes if a future test author passes parallel `Promise.all` calls. More importantly, `node:test` itself may run tests in parallel by default in newer Node versions (`--test-concurrency`), and a single test calling both servers in `Promise.all` would interleave. The plan should fail-closed at the helper level: a per-test mutex around all `tools/call` operations that touch the registry.

**Recommended action:** Add a `withLock` (or just sequentialize inside the helper via a single in-flight promise) around all `tools/call` invocations when `GATE_ROOT` is shared. The helper's `call(name, args, { server })` should serialize across both servers, not just trust test discipline. YAGNI counter-argument: the helper composes well as "test author chose to share GATE_ROOT; if they do, they take the lock." But the **default** behavior (Phase 3 says "shared GATE_ROOT" is the design) should not be racy.

**Disposition:** DISCUSS (operator decides if the mutex is worth the ~5 lines; the data-integrity argument is real).

---

#### R-04 [HIGH] — Plan 4: No actual `tools/call` content parity is committed
**Persona:** Correctness
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-04-output-comparison.md:70`, `phase-04-output-comparison.md:55-57`
**Finding:** Phase 4 says "Add the 5+ read-only `tools/call` parity tests" and the test loop architecture marks write-side tools as "SKIP content parity; structural schema parity is the gate." So the parity gate is **schema parity for 29 tools + content parity for 5 read-only tools**. The acceptance gate sentence says "byte-identical output for the 29 deterministic tools (inputSchema via `z.toJSONSchema()` + tools/call content via `JSON.parse`)". The "29" in the acceptance sentence is misleading — only 5 get `tools/call` content parity, the other 24 get schema parity only. This is a discrepancy between the gate's claim ("29 tools byte-identical") and the gate's mechanism (5 tools content + 24 tools schema). A reviewer reading the acceptance sentence would believe all 29 are content-tested; the plan does not say so.

**Recommended action:** Reword the acceptance sentence: "byte-identical `inputSchema` for all 29 deterministic tools (via `z.toJSONSchema()`) + byte-identical `tools/call` content for the 5 read-only subset (via `JSON.parse(content[0].text)` deepEqual)." Be honest that 24/29 are schema-only. This is a contract change, not a refutation — but the contract must match the test.

**Disposition:** ACCEPT (the gate is what the test enforces; document it honestly).

---

#### R-05 [HIGH] — Plan 3 + Plan 4: The 5 "read-only" tools' probe inputs are not specified
**Persona:** Correctness
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-04-output-comparison.md:70`
**Finding:** Phase 4 says "Probe input: empty args or a small `filter` arg." for the 5 read-only `tools/call` parity tests. But the 5 tools are `meta_state_list`, `loop_describe`, `runtime_state_read`, `check_runtime_agnostic`, `gate_check`. Each has a different input contract:
- `meta_state_list` with empty args: returns ALL entries (could be 100+ entries with full payloads) — is "deepEqual" meaningful on 9000-line JSON?
- `loop_describe` with `tier: "warm"`: deterministic if the registry is stable, but `discoverability_hints` may have timestamps or counts that drift.
- `runtime_state_read` with empty args: similar to `meta_state_list`.
- `check_runtime_agnostic` with empty args: needs a `feature_path` (required arg, not optional).
- `gate_check` with empty args: needs a `command` (required arg, not optional).

Two of the 5 tools have **required** args; empty-args probes will fail at the inputSchema level. The plan's "5+ read-only tools/call parity assertions" is aspirational, not a commitment.

**Recommended action:** Specify probe inputs per-tool in Phase 4 step 5. For `check_runtime_agnostic`, use `feature_path: "tools/learning-loop-mcp/server.js"` (a real path). For `gate_check`, use `command: "ls"` (a low-risk probe). For `loop_describe`, use `tier: "summary"` (the smallest tier, deterministic). For `meta_state_list` + `runtime_state_read`, use `compact: true` to bound payload size. If any of these fail the test, document the gap and the operator's call.

**Disposition:** ACCEPT (specify the probe inputs; the test must run end-to-end, not be aspirational).

---

#### R-06 [HIGH] — Plan 7 + Plan 8: F4 finding TTL is not addressed
**Persona:** Security (lifecycle) + UX
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/plan.md:114`, `phase-08-closeout.md:91-92, 102-103`
**Finding:** F4 finding (`meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ`, 24h TTL, expires 2026-06-17 14:23:34Z) is the gate-bypass gap. Plan 2's closeout says "the operator may need to ack the finding or close it. Plan 2 does not act." This is a passive handoff to the operator with no automation. If the operator forgets, F4 goes `stale` and the registry is out of sync with reality. The plan should either:
- (a) **Ack** the F4 finding as part of Plan 2 closeout (changes status to `active`, removes the TTL pressure), with `meta_state_ack({ id: "meta-260616T2123Z-..." reason: "Acknowledged as part of Plan 2 closeout; resolution path is Plan 3 (D-10) cut-over." })`.
- (b) **Close** the F4 finding as a duplicate of the closeout change-log, with `meta_state_supersede({ id: "meta-260616T2123Z-...", consolidated_into: "meta-260616T2123Z-plans-reports-productization-...md-p" reason: "Consolidated into Plan 2 closeout change-log; gate-bypass is now Plan 3 / D-10 owner." })`.

Doing nothing is a **silent footgun** that auto-resolves the registry entry without addressing the underlying gate-bypass issue. The plan has the tools; the disposition is to use them.

**Recommended action:** Add a step 7 to Phase 8: "Run `meta_state_ack` for F4 to extend its active lifetime; resolution is Plan 3's responsibility (D-10)." Or call `meta_state_supersede` to consolidate into the Plan 2 change-log.

**Disposition:** DISCUSS (operator decides ack vs. supersede; the no-action default is unsafe).

---

#### R-07 [HIGH] — Plan 2: Test count anchor is wrong; 5+6+5+4+6+29 ≠ 55
**Persona:** Correctness (math)
**Citation:** `plans/reports/from-code-reviewer-to-planner-phase-c-plan-1-post-implementation-review.md` (verification section), `plans/260616-2200-phase-c-plan-2-parity/plan.md:51`
**Finding:** The plan claims Plan 1's baseline is 55 tests in namespace 10, citing "5 + 6 + 5 + 4 + 6 + 29 = 55." Let me verify the actual mastra test files (verified 2026-06-16):
- `wire-format-coercion-fix.test.js`: 5 tests
- `wire-format-top-level-coercion.test.js`: 6 tests
- `wire-format-meta-state-optional-fields.test.js`: 5 tests
- `wire-format-patch-recursion.test.js`: 4 tests
- `parity-schema-shape.test.js`: 29 tests (one per manifest entry)
- `mcp-config-peer.test.js`: 6 tests (3 per file × 2 files, inside a `for` loop)

Total: 5 + 6 + 5 + 4 + 29 + 6 = **55** (math is correct, verified).

BUT: Phase 4 step 7 says "55 (existing 4 wire-format + 6 mcp-config-peer) → 55 - 1 (deleted shape test) + 1 (parity-zod-to-json-schema.test.js with 63 tests) = 117 tests." The 4 + 6 = 10 is wrong; 4 wire-format files = 5+6+5+4 = 20 tests, plus 6 mcp-config-peer = 26, plus 29 shape = 55. The arithmetic in Phase 4 step 7 is wrong; the test files (wire-format, mcp-config-peer, parity-shape) do not break down to "4 + 6" (that's 10 of the 55 — there are 29 from parity-schema-shape and 16 from wire-format and 6 from mcp-config-peer, plus others). The plan claims Phase 4 deletes the 29-test parity-shape and adds 1 new test file with 63 tests, yielding 55 - 29 + 63 = 89. But Phase 7 claims the total is 55 + 63 + 5 + 3 = 126. These are inconsistent: 89 vs 126.

**Recommended action:** Verify the math on disk by running `node --test 'tools/learning-loop-mastra/__tests__/*.test.js'` and counting the actual test count. Then make Phase 4's math match Phase 7's. Both cannot be true. The 126 anchor must be derivable from `pnpm test` output, not aspirational.

**Disposition:** ACCEPT (correct the math; the 9-namespace anchor is durable, the per-file counts are not).

---

### MEDIUM

#### R-08 [MEDIUM] — Plan 3: Smoke test "no flake: 5 consecutive runs" is not a stability guarantee
**Persona:** Performance / reliability
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-03-spawn-loop.md:74`
**Finding:** The success criterion is "5 consecutive runs of the smoke test all pass within 1 second each." 5 is a small N; CI runs hundreds of times. The plan has no fallback for flakes. If a flake surfaces, the operator has no playbook — is it warmup? is it shared GATE_ROOT? is it the MCP Client handshake?

**Recommended action:** Add a "flake recovery" section to Phase 3 risk assessment: if a flake surfaces in CI, (a) check the warmup timeout (300ms → 1000ms is the standard escalation), (b) check if both servers are sequentializing the `initialize` handshake, (c) check the `mkdtempSync` cleanup (orphaned temp dirs cause disk pressure). Currently the plan says "300ms is enough; verified by Phase 1's existing pattern" — but the dual-server pattern is new and unverified at scale.

**Disposition:** DISCUSS (operator decides if 5 is enough; the 1-second budget is generous, so the question is whether 5 runs catches the failure mode).

---

#### R-09 [MEDIUM] — Plan 6: Collision test uses `tools/manifest.json` but plan's own body cites `agent-manifest.json`
**Persona:** Correctness
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-06-collision-test.md:80` vs `plan.md:105`
**Finding:** The plan's overview (plan.md:105) says "agent-manifest.json has 25 (missing 4 per M-C4)." Phase 6's risk section correctly identifies the source of truth is `tools/manifest.json` (40 entries), not `agent-manifest.json` (which has 25 in tool groups, not 40). The test architecture uses `tools/manifest.json` — that's correct. But the plan's body text is misleading: "the 25 is the 29 deterministic + 11 workflow subset; the 40 is the 29 + 11 = 40" — this is incoherent (29 + 11 = 40, but where does 25 come from?). `agent-manifest.json` does not have a flat list of 25 tools; it has tool groups whose `tools` arrays total 5+11+16+3+1=36, plus the `quickstart` block. The "25" in the plan is incorrect arithmetic. This does not affect the test (which uses the right source) but it confuses the reader and signals the planner may not have understood the manifest structure.

**Recommended action:** Rewrite the arithmetic in plan.md:105 + phase-06:80 to be correct. The 25 comes from `agent-manifest.json`'s 5 tool groups' `tools` arrays minus duplicates and the 4 missing tools (M-C4). The 40 comes from `tools/manifest.json`. The two manifests are **not** arithmetically related by "25 + 4 = 29 deterministic + 11 workflow = 40." They are different document types (grouped manifest vs. flat export list).

**Disposition:** ACCEPT (correct the misleading arithmetic; the test source is right).

---

#### R-10 [MEDIUM] — Plan 2: 8-commit PR stack order is implicit, not explicit
**Persona:** UX
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/plan.md:73`
**Finding:** "Single PR (8 commits, one per phase, stacked on a feature branch off `main`)." The order is implied by phase number (1 → 8), but stacked PRs in git require either (a) clean sequential commits with each phase's changes in one commit, or (b) merge commits / fixup commits that obscure the diff. A reviewer reading the PR will see all 8 commits in the log, but the file-level diff is what matters. The plan does not specify whether each commit should be a clean `feat:` / `docs:` / `test:` commit, or whether the smoke tests run between phases (a Phase 3 commit that breaks Phase 4's TDD is a problem).

**Recommended action:** Add a "PR commit strategy" subsection to Phase 8: each phase ships a single commit; commit type is `test:` for phases 2-6 (no production code), `docs:` for phases 1 + 8, `chore:` for the schemas.js patch. The 8-commit stack must be reviewable phase-by-phase (`git log --oneline main..HEAD` should show 8 clean commits, no fixups).

**Disposition:** DISCUSS (operator decides commit granularity; the current plan is acceptable but explicit is better).

---

#### R-11 [MEDIUM] — Plan 2: `parity-harness.js` test schemas are hand-rolled, not imported from legacy
**Persona:** Maintainability
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-02-parity-harness.md:60-65`
**Finding:** The 5 invariant tests for `parity-harness.js` use hand-rolled schema fixtures (e.g., "a tool with one known inputSchema shape"). These fixtures do NOT match the real legacy schemas. If the legacy unwraps `ZodOptional` differently than the test fixture, the test passes but the real parity fails. The test should either (a) use real legacy schemas imported from `tools/learning-loop-mcp/tools/`, or (b) use minimal-but-realistic Zod v3 + v4 schemas (not the hand-rolled "object with one field" that may not exercise `ZodPreprocess` unwrapping).

**Recommended action:** Change Phase 2 step 1 to "Test fixtures are real legacy schemas: import `gateCheckTool.schema` and `metaStateListTool.schema` as the comparison baseline; the harness compares these against the factory's wrapped output." This makes the harness test the *real* parity path, not a synthetic approximation.

**Disposition:** ACCEPT (real fixtures beat synthetic ones; this is the same lesson the legacy tests learned).

---

#### R-12 [MEDIUM] — Plan 2: Zod v4 minor version drift is unhandled
**Persona:** Maintainability
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/plan.md:131`
**Finding:** The plan cites `zod v4.4.3 z.toJSONSchema()` and notes F11 (use `z.toJSONSchema()`). But there is no lockfile check or version pinning. If `package.json#dependencies.zod = "^4.4.3"` resolves to 4.5.0 tomorrow, `z.toJSONSchema()` may add a new field (e.g., `description` per field) that the comparison does not expect. The test would fail on a Zod upgrade, not on a real parity regression.

**Recommended action:** Add a step to Phase 4: "Pin `zod` to exact version `4.4.3` in `package.json` (no caret); document the pin in the closeout report. The parity gate is version-specific." This is consistent with the existing `package.json` which uses `^4.4.3` — change to `4.4.3` and add a `package-lock.json` test (or a CI check that warns on caret).

**Disposition:** DISCUSS (operator decides if exact pin is the right call; a CI drift check is a Phase 7 follow-up per D-16).

---

#### R-13 [MEDIUM] — Plan 4: `z.toJSONSchema()` `io: "input"` may not match legacy output mode
**Persona:** Correctness
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-04-output-comparison.md:46`, `phase-02-parity-harness.md:78-80`
**Finding:** The plan says `io: "input"` is required because `z.preprocess` wrappers (the factory's output) are input-only. But the legacy `McpServer` (Zod v3 + `@modelcontextprotocol/sdk`) outputs JSON Schema in **output mode by default** for `tools/list` (MCP protocol exposes input schemas, but the SDK's behavior may differ from `z.toJSONSchema` output mode). If the legacy's `inputSchema` was generated in output mode, comparing `z.toJSONSchema(legacy, { io: "input" })` to `z.toJSONSchema(mastra, { io: "input" })` may not catch a real divergence. The plan should compare BOTH modes and document which one matches.

**Recommended action:** Add a probe in Phase 4 step 1: "Run `z.toJSONSchema(legacy, { target: 'draft-7' })` with NO `io` option (output mode, the default). Compare to `z.toJSONSchema(legacy, { target: 'draft-7', io: 'input' })`. If they differ, the legacy has a transformation that the harness must mirror. Document which mode the comparison uses and why."

**Disposition:** ACCEPT (verify the mode empirically; the plan assumes `io: "input"` matches, but this is a hypothesis to test, not a fact).

---

### LOW

#### R-14 [LOW] — Plan 8: PR body has the matrix but not the failure modes
**Persona:** UX
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-08-closeout.md:51-79`
**Finding:** The PR body has a clean parity matrix (test counts) but does not include a "what was tried that didn't work" section. A future reviewer trying to understand "why is the test count 126 and not 200?" has no answer. The matrix is **asserting** the gate; it does not **justify** the gate.

**Recommended action:** Add a "Trade-offs / what we did not test" section to the PR body template: 24 of 29 tools are schema-only parity; F4 gate-bypass is deferred; Zod v4 version is pinned to 4.4.3; 11 workflow tools are excluded per Phase D. This makes the gate's scope explicit and prevents a future "why didn't you test X?" question.

**Disposition:** ACCEPT (cosmetic; improves PR quality).

---

#### R-15 [LOW] — Plan 2: Phases 1-8 don't have a pre-flight gate
**Persona:** Security (process)
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/phase-01-patch-m-c1.md:32-37`
**Finding:** Phase 1 patches `tools/learning-loop-mastra/schemas.js` — this is a `tools/**` path, not `product/**`, so it does not require the `gate_mark_preflight` tool. But Phase 2-6 create new test files in `tools/learning-loop-mastra/__tests__/` — also not `product/**`. Phase 7 modifies `package.json#scripts.test` — this is a top-level config. Phase 8 modifies `plans/**` and `meta-state.jsonl` — the latter is gated by `OPERATOR_MODE=1`. The plan does not mention any of these gates, so an implementer may not realize that `meta_state_log_change` calls require the operator environment.

**Recommended action:** Add a "Pre-flight checklist" section to plan.md that lists each phase's gated paths and the required `gate_mark_preflight` or `OPERATOR_MODE=1` invocations. The Phase 8 closeout requires `OPERATOR_MODE=1` for the 5 `meta_state_log_change` calls + 1 `meta_state_ack` (if R-06 is accepted).

**Disposition:** ACCEPT (cosmetic; improves implementer clarity).

---

#### R-16 [LOW] — Plan 2: No `package.json` lockfile check
**Persona:** Maintainability
**Citation:** `plans/260616-2200-phase-c-plan-2-parity/plan.md:30` (lists `@mastra/core 1.42.0`, `@mastra/mcp 1.10.0`, `zod ^4.4.3`)
**Finding:** The plan cites exact versions for `@mastra/core` and `@mastra/mcp` but a caret for `zod`. If the parity gate depends on `z.toJSONSchema()`'s exact behavior, the version should be exact (see R-12). The `@mastra/*` packages are exact (1.42.0 / 1.10.0), so the convention is "exact when behavior matters." `zod` should follow the convention.

**Disposition:** DISCUSS (covered by R-12; flagged here for completeness).

---

## Persona Coverage

| Persona | Findings | Notes |
|---------|----------|-------|
| **Correctness** | R-01, R-02, R-04, R-05, R-07, R-09, R-11, R-13 | 8 findings; the load-bearing persona. The plan's correctness story has 3 gaps: failure-mode handling (R-01), test count math (R-02, R-07), and 24/29 schema-only content parity (R-04, R-05). |
| **Security** | R-03, R-06, R-15 | 3 findings; registry race condition (R-03) and F4 lifecycle (R-06) are real. |
| **Performance** | R-08, R-12 | 2 findings; flake budget (R-08) and version drift (R-12) are MEDIUM, not CRITICAL, because the 1-second smoke budget gives headroom. |
| **UX** | R-10, R-14 | 2 findings; commit granularity and PR body quality. Cosmetic. |
| **Maintainability** | R-11, R-12, R-16 | 3 findings; test fixtures and version pinning. |

All 5 personas applied; none N/A.

---

## Summary Table

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2 | R-01, R-02 |
| HIGH | 4 | R-03, R-04, R-05, R-06, R-07 |
| MEDIUM | 6 | R-08, R-09, R-10, R-11, R-12, R-13 |
| LOW | 3 | R-14, R-15, R-16 |
| **Total** | **15** | — |

(Note: R-07 is HIGH; the table above shows the corrected count: CRITICAL=2, HIGH=5 (R-03, R-04, R-05, R-06, R-07), MEDIUM=6, LOW=3, Total=16. Updated below.)

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2 | R-01, R-02 |
| HIGH | 5 | R-03, R-04, R-05, R-06, R-07 |
| MEDIUM | 6 | R-08, R-09, R-10, R-11, R-12, R-13 |
| LOW | 3 | R-14, R-15, R-16 |
| **Total** | **16** | — |

---

## Verdict

**BLOCKED.** Plan 2 ships the C4 parity gate, which is the only reviewable moment that proves the migration is safe. The plan is architecturally sound but has 2 CRITICAL and 5 HIGH findings that, if shipped as-is, may result in a gate that:
- Passes when parity is unknown (R-01: skip-on-failure inverts the gate contract).
- Has the wrong test count anchor (R-02, R-07: 126 vs. 89 contradiction).
- Does not actually prove byte-identical for 24/29 tools (R-04: schema-only ≠ content parity).
- Races on shared `meta-state.jsonl` (R-03: helper trusts test discipline, not enforces it).
- Has aspirational rather than committed `tools/call` probes (R-05: 2 of 5 tools need required args).
- Lets F4 finding go stale without action (R-06: passive handoff is unsafe).

The plan can be unblocked by accepting R-01, R-02, R-04, R-05, R-07 and discussing R-03, R-06 with the operator. None of the CRITICAL/HIGH findings require new work; they require corrections to the plan's text and test contracts.

---

## Disposition Table

| ID | Severity | Persona | Disposition | Action Required |
|----|----------|---------|-------------|-----------------|
| R-01 | CRITICAL | Correctness | **DISCUSS** | Operator picks (a) `unrepresentable: "any"` (preferred; surfaces in CI) or (b) hard-fail naming tool+field. No skip. |
| R-02 | CRITICAL | UX + Correctness | **ACCEPT** | Rewrite Phase 4 step 3 to make the test count explicit. Pick 29 or 58; recompute Phase 7's 126. |
| R-03 | HIGH | Security | **DISCUSS** | Operator decides: per-helper mutex (~5 lines) or trust test discipline + document the failure mode. |
| R-04 | HIGH | Correctness | **ACCEPT** | Reword the acceptance sentence: schema parity for 29 + content parity for 5. Honest gate. |
| R-05 | HIGH | Correctness | **ACCEPT** | Specify probe inputs per-tool in Phase 4 step 5. `loop_describe {tier: "summary"}`, `gate_check {command: "ls"}`, etc. |
| R-06 | HIGH | Security | **DISCUSS** | Operator picks `meta_state_ack` (extend TTL) or `meta_state_supersede` (consolidate into closeout). No-action is unsafe. |
| R-07 | HIGH | Correctness | **ACCEPT** | Verify math on disk via `node --test`. Make Phase 4 step 7 and Phase 7 consistent. |
| R-08 | MEDIUM | Performance | **DISCUSS** | Operator decides if 5 runs is enough flake budget. Add a recovery playbook to Phase 3 risk section. |
| R-09 | MEDIUM | Correctness | **ACCEPT** | Rewrite plan.md:105 and phase-06:80 arithmetic to be coherent. Test source is right; description is wrong. |
| R-10 | MEDIUM | UX | **DISCUSS** | Operator decides commit granularity. Add a "PR commit strategy" subsection. |
| R-11 | MEDIUM | Maintainability | **ACCEPT** | Use real legacy schemas (e.g., `gateCheckTool.schema`) as test fixtures, not hand-rolled approximations. |
| R-12 | MEDIUM | Maintainability | **DISCUSS** | Operator decides: exact pin (`4.4.3` no caret) vs. CI drift check (D-16 follow-up). |
| R-13 | MEDIUM | Correctness | **ACCEPT** | Add a Phase 4 probe: verify which `io` mode the legacy's `inputSchema` was generated in. Document the choice. |
| R-14 | LOW | UX | **ACCEPT** | Add "Trade-offs / what we did not test" section to PR body template. |
| R-15 | LOW | Security | **ACCEPT** | Add "Pre-flight checklist" to plan.md listing gated paths per phase. |
| R-16 | LOW | Maintainability | **DISCUSS** | Covered by R-12. |

---

## Evidence Cited (file:line)

- `plans/260616-2200-phase-c-plan-2-parity/plan.md:54` — acceptance gate sentence (R-04)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md:73` — 8-commit PR claim (R-10)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md:105` — `agent-manifest.json` arithmetic (R-09)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md:114` — F4 TTL handoff (R-06)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md:131` — Zod version pin (R-12, R-16)
- `plans/260616-2200-phase-c-plan-2-parity/phase-01-patch-m-c1.md:32-37` — pre-flight gate (R-15)
- `plans/260616-2200-phase-c-plan-2-parity/phase-02-parity-harness.md:60-65` — hand-rolled fixtures (R-11)
- `plans/260616-2200-phase-c-plan-2-parity/phase-02-parity-harness.md:78-80` — `io: "input"` claim (R-13)
- `plans/260616-2200-phase-c-plan-2-parity/phase-03-spawn-loop.md:74` — flake budget (R-08)
- `plans/260616-2200-phase-c-plan-2-parity/phase-03-spawn-loop.md:78-80` — JSONL interleaving (R-03)
- `plans/260616-2200-phase-c-plan-2-parity/phase-04-output-comparison.md:46,55-57,61,70,73,87` — multiple findings (R-01, R-02, R-04, R-05, R-13)
- `plans/260616-2200-phase-c-plan-2-parity/phase-06-collision-test.md:80` — `agent-manifest.json` arithmetic (R-09)
- `plans/260616-2200-phase-c-plan-2-parity/phase-07-acceptance-gate.md:30` — 126 anchor (R-02, R-07)
- `plans/260616-2200-phase-c-plan-2-parity/phase-08-closeout.md:51-79,91-92,102-103` — PR body + F4 (R-06, R-14)
- `tools/learning-loop-mastra/schemas.js:1-9` — M-C1 patch on disk (verified)
- `tools/learning-loop-mastra/tools/manifest.json` — 29 entries (verified via `python3 -c "import json; print(len(json.load(open('...'))))"`)
- `tools/learning-loop-mcp/tools/manifest.json` — 40 entries (verified)
- `tools/learning-loop-mcp/agent-manifest.json` — 74 lines, grouped (not flat 25; R-09)
- `tools/learning-loop-mastra/server.js:13,16-30` — `mastra_` prefix + manifest loop (verified)
- `tools/learning-loop-mastra/create-loop-tool.js:128-145` — `wrapSchema` + `createLoopTool` (verified)
- `tools/learning-loop-mastra/__tests__/*.test.js` — test counts: 5+6+5+4+29+6 = 55 (R-07)
- `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs:43-50` — legacy uses `tools/manifest.json` (40), not `agent-manifest.json`
- `package.json:24-30` — `test` glob already includes `tools/learning-loop-mastra/__tests__/*.test.js`
- `package.json:32-33` — `test:cold-session` script only runs the legacy test
- `meta-state.jsonl` — F4 entry `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` (verified, present)

---

## Unresolved Questions

1. **R-01 choice:** Does the operator want `unrepresentable: "any"` (which coerces unrepresentable types to `{}` so the test fails on diff) or `unrepresentable: "throw"` (which hard-fails the test, naming the tool)? Both are defensible; the no-skip default is required.
2. **R-03 choice:** Per-helper mutex (5 lines, prevents races) or trust test discipline (0 lines, depends on author)?
3. **R-06 choice:** `meta_state_ack` extends the TTL without addressing the underlying gate-bypass; `meta_state_supersede` consolidates into the Plan 2 change-log and closes the finding. Which is the right lifecycle move?
4. **R-08 budget:** Is 5 consecutive runs enough flake confidence, or should the success criterion be 20+ (CI runs hundreds of times)?
5. **R-10 commit granularity:** 8 separate `feat:` / `test:` / `docs:` commits, or squash to 1 commit with a stacked PR? (The plan says "operator's choice" — but `git rebase -i` is forbidden in this environment, so squash is not available without external tools.)
6. **R-12 pinning:** Exact pin (`4.4.3` no caret) makes the gate version-specific; CI drift check (D-16) is a Phase 7 follow-up. Which is the Plan 2 scope?

---

**Status:** DONE
**Summary:** 16 findings (2 CRITICAL, 5 HIGH, 6 MEDIUM, 3 LOW). Plan 2 is BLOCKED until the 2 CRITICAL + 5 HIGH findings are addressed (DISCUSS for R-01, R-03, R-06; ACCEPT for the rest). The plan is architecturally sound but operationally under-specified in 4 places that could cause the gate to pass without proving parity.
**Concerns/Blockers:** The 2 CRITICAL findings (R-01, R-02) are textual/contract fixes, not new work — the plan can be unblocked in a single editing pass. The 5 HIGH findings include one data-lifecycle risk (R-06 F4) and one test-contract rewrite (R-04 acceptance sentence) that the operator should review before merge.
