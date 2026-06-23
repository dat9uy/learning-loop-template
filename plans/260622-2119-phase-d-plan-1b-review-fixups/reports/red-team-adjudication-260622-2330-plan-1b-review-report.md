# Red Team Adjudication — Plan 1b Review Fixups

**Plan under review:** `plans/260622-2119-phase-d-plan-1b-review-fixups/` (6 phases, P1)
**Date:** 2026-06-22
**Reviewers (2 of 4 reports on disk + controller fact-check):**
- Scope & Complexity Critic (Contract Verifier role) — full written report
- Failure Mode Analyst (Flow Tracer role) — full text in initial task notification
- Security Adversary + Assumption Destroyer — agents completed but did not write report files (controller retrieved only their last in-progress line)

**Controller fact-check pass:** independently verified Phase 4 SDK path, Phase 3 line numbers, M4 dead-code claim, M1 undefined test, server.js version/description, manifest count, meta-state entry status, source-review file existence, and `meta_state_patch` immutable fields.

**Total findings before dedup:** ~25 (2 reviewers + 5 controller fact-checks)
**After dedup + evidence filter:** 15 findings

---

## Red Team Findings

### Finding 1: Phase 4 SessionStart SDK import path is broken — `require(.../index.cjs)` will fail with MODULE_NOT_FOUND
- **Severity:** Critical
- **Reviewer:** Scope & Complexity Critic #1, Failure Mode Analyst #1
- **Location:** Phase 4 step 1, lines 71-72
- **Flaw:** Plan uses `require("@modelcontextprotocol/sdk/client/index.cjs")` and `require("@modelcontextprotocol/sdk/client/stdio.cjs")`. The SDK's package.json `exports` map only exposes `@modelcontextprotocol/sdk/client` → `./dist/cjs/client/index.js` (no `.cjs` suffix). A `.cjs` require path does not exist.
- **Failure scenario:** Hook process throws `Error: Cannot find module '@modelcontextprotocol/sdk/client/index.cjs'` at first invocation. SessionStart hook exits 1 immediately. Claude Code receives no hints at cold start.
- **Evidence:**
  - `node_modules/@modelcontextprotocol/sdk/package.json` — `"./client": { "import": "./dist/esm/client/index.js", "require": "./dist/cjs/client/index.js" }` (verified by controller)
  - `find node_modules/@modelcontextprotocol -name "*.cjs"` returns zero files (verified by controller)
  - Reference pattern: `tools/scripts/refresh-fingerprints-pre-closeout.mjs:13` uses `import { Client } from "@modelcontextprotocol/sdk/client/index.js"` (ESM, not CJS)
- **Disposition:** **Accept** — the plan's exact require path will fail.
- **Suggested fix:** Use `require("@modelcontextprotocol/sdk/client")` (CJS resolver) or convert the hook to `.mjs` and use `import`. Existing repo pattern (`refresh-fingerprints-pre-closeout.mjs`) is ESM via `.mjs`.

---

### Finding 2: Phase 4 hook spawns an MCP server to read a frozen constant
- **Severity:** Critical
- **Reviewer:** Scope & Complexity Critic #2
- **Location:** Phase 4 architecture + step 1
- **Flaw:** Hook spawns the full MCP server, opens Client transport, performs handshake, calls `mastra_loop_describe({tier:"warm"})`. But `discoverability_hints` is a static `Object.freeze([...])` at `tools/learning-loop-mcp/core/loop-introspect.js:90`, exported via `buildDiscoverabilityHints()`.
- **Failure scenario:** Every Claude Code start pays ~50-200ms of MCP server startup + JSON-RPC + process spawn cost to obtain a constant. The "deadlock fix" reintroduces the same MCP-server-startup risk it claims to address (if server is slow to start, hook times out).
- **Evidence:**
  - `tools/learning-loop-mcp/core/loop-introspect.js:90` — `const DISCOVERABILITY_HINTS = Object.freeze([...])`
  - `tools/learning-loop-mcp/core/loop-introspect.js:114-116` — `export function buildDiscoverabilityHints() { return DISCOVERABILITY_HINTS; }`
- **Disposition:** **Accept** — the existing hook pattern (spawn + hand-rolled JSON-RPC) was already overly complex. Phase 4's rewrite perpetuates the same architecture.
- **Suggested fix:** Rewrite hook to `const { buildDiscoverabilityHints } = require(".../core/loop-introspect.js")` and write `hints = buildDiscoverabilityHints()` directly. No spawn, no Client, no server startup. Reduces scope by ~30 lines and removes the deadlock class entirely.

---

### Finding 3: Phase 6 reopen mechanism is structurally impossible with current tools
- **Severity:** Critical
- **Reviewer:** Scope & Complexity Critic #3, Failure Mode Analyst #11
- **Location:** Phase 6 step 3 (lines 78-83) and Phase 2 Path B step 5
- **Flaw:** Plan claims to "reopen" the TaskUpdate finding via `meta_state_patch --patch '{"status":"active","resolved_at":null,"resolved_by":null}'`. But `meta_state_patch` has an immutable-field deny-list (`IMMUTABLE_PATCH_FIELDS`) that rejects `resolved_at` and `resolved_by`. The handler returns `{patched: false, reason: "immutable_field"}`. No `meta_state_reactivate` or `meta_state_unresolve` tool exists.
- **Failure scenario:** Phase 2 Path B step 5 calls `meta_state_patch`, gets `immutable_field` rejection, falls through silently. The TaskUpdate finding stays marked `resolved` while the wrapper is removed. meta-state and reality diverge — the next plan or operator query sees "TaskUpdate idempotency: resolved" while no wrapper exists.
- **Evidence:**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:6-17` — immutable-field deny-list
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:14` — `meta_state_resolve` only transitions to terminal
- **Disposition:** **Accept** — the plan's Phase 6 step 3 is unimplementable as written.
- **Suggested fix:** Either (a) abandon Path B's "reopen" semantics — file a NEW active finding documenting the upstream gap; (b) add a new `meta_state_reactivate` tool with audit trail. Option (a) is the YAGNI choice.

---

### Finding 4: Phase 3 line numbers are stale — REMOVE instructions target wrong lines
- **Severity:** High
- **Reviewer:** Failure Mode Analyst #2
- **Location:** Phase 3 step 2 sub-bullets (lines 95-97)
- **Flaw:** Plan says "Lines 69-83 (input envelope strip): REMOVE" and "Lines 86-95 (output envelope strip): KEEP". Actual code in `create-loop-workflow.js` has input strip at lines 67-76 and output strip at lines 79-86. Plan also claims the factory preprocess is at "lines 110-112" but it's at line 119.
- **Failure scenario:** An implementer following the plan's exact line ranges removes a different block (mixes input/output handling), producing broken code. Or skips the edit because the numbers don't match. The `git diff` becomes inconsistent with the plan's intent.
- **Evidence:**
  - `tools/learning-loop-mastra/create-loop-workflow.js:67-76` — input strip
  - `tools/learning-loop-mastra/create-loop-workflow.js:79-86` — output strip
  - `tools/learning-loop-mastra/create-loop-workflow.js:119` — `z.preprocess(stripContentEnvelope, rawInput)` (verified by controller)
- **Disposition:** **Accept** — the line numbers in Phase 3 are wrong; the plan's structural intent is right but the line ranges are stale.
- **Suggested fix:** Update Phase 3 to cite exact lines (67-76 input strip, 79-86 output strip, 119 preprocess).

---

### Finding 5: Phase 3 "remove dead inline" claim is wrong — direct `.start()` calls bypass factory preprocess
- **Severity:** High
- **Reviewer:** Failure Mode Analyst #12
- **Location:** Phase 3 step 2 (line 95-97)
- **Flaw:** Plan claims the inline strip at lines 67-76 is dead because the factory preprocess at line 119 handles it. But the workflow is also invoked directly via `run.start({inputData: ...})` in `workflow-direct-parity.test.js:34-71` etc. Direct `.start()` calls bypass `createStep`'s schema validation; the inline strip is the ONLY thing that handles direct envelope input. Removing it breaks the existing tests at lines 334-358 ("workflow_self_improvement handles envelope-form input").
- **Failure scenario:** `pnpm test` fails after Phase 3 ships. The 2 envelope-input tests at `workflow-direct-parity.test.js:334-359` and `:361-383` use `run.start({ inputData: envelopeInput })` directly, bypassing the factory preprocess. After removing the inline strip, these tests fail because `handler(data)` receives the envelope, not the inner payload.
- **Evidence:**
  - `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js:334-359` — direct `.start({ inputData: envelopeInput })` test
  - `tools/learning-loop-mastra/create-loop-workflow.js:67-76` — inline strip (the only thing that handles direct calls)
- **Disposition:** **Accept** — the "dead code" claim is empirically wrong. The inline strip is load-bearing for direct callers.
- **Suggested fix:** Do NOT remove the inline strip. Phase 3 should only consolidate the helper function (extract to `envelope-stripper.js` and import it in both places: `buildStep.execute` for direct calls AND `z.preprocess` for MCP path).

---

### Finding 6: M1 parameterized test includes self-defeating case — `undefined` passes the regex
- **Severity:** High
- **Reviewer:** Failure Mode Analyst #8, Scope & Complexity Critic #7
- **Location:** Phase 5 step 3 (lines 64-91)
- **Flaw:** Plan's parameterized table includes `["undefined", undefined]` and expects the regex to reject it. But `RegExp.prototype.test(undefined)` coerces to `test("undefined")`, which starts with "u" (lowercase letter) and matches `/^[a-z][a-z0-9_]*$/`. The throw does NOT fire. The test case would fail.
- **Failure scenario:** When the parameterized loop runs `["undefined", undefined]`, the regex matches `"undefined"`, the function does NOT throw, `assert.throws` fails. The test errors with "expected to throw" — failing the test that was supposed to prove the regex rejects undefined.
- **Evidence:**
  - `tools/learning-loop-mastra/create-loop-workflow.js:103-106` — `if (!description || ...) throw ... if (!/^[a-z][a-z0-9_]*$/.test(id)) throw ...`
  - Verified runtime: `/^[a-z][a-z0-9_]*$/.test(undefined)` returns `true` (verified by controller)
  - Verified runtime: `/^[a-z][a-z0-9_]*$/.test(null)` returns `true` (verified by controller)
- **Disposition:** **Accept** — one of the 6 test cases is self-defeating.
- **Suggested fix:** Drop the `undefined` and `null` cases from the parameterized table. Keep `uppercase`, `starts-with-digit`, `hyphen`, `special-char`, `empty` (5 cases that genuinely test the regex).

---

### Finding 7: I2 test-count correction is partly fabricated — "+14" claim not in PR body
- **Severity:** High
- **Reviewer:** Scope & Complexity Critic #4
- **Location:** Phase 5 step 6-7 (lines 126-148); plan.md Finding Index row I2
- **Flaw:** Plan claims "Test count undercounted in plan/PR body (+14 claimed, +21 actual)". The "+14" claim only appears in `plan.md:140` (the plan's own math), NOT in `pr-body.md`. The PR body's "Test evidence" section (lines 45-63) only shows total `1139 pass / 0 fail / 1 skipped` — never claimed +14. The plan's proposed diff for `pr-body.md` is identical lines + a footnote — no actual text correction.
- **Failure scenario:** Phase 5 step 7's diff for pr-body.md adds a footnote about a "+14" claim that doesn't exist in the file. This is documentation churn — fixing a problem that isn't in the PR body. The "Important" severity is inflated for an internal planning math error.
- **Evidence:**
  - `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md:46-63` — "Test evidence" shows totals only, no "+14"
  - `plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md:140` — only the plan claims "+14"
  - `phase-05-cleanup.md:142-148` — proposed diff has identical lines + footnote
- **Disposition:** **Accept (modified)** — the +21 actual figure may be correct, but the "+14 claimed" framing is wrong. The PR body never made that claim. Demote to Minor and scope the fix to the journal only.
- **Suggested fix:** Demote I2 to Minor. Edit only `docs/journals/260622-phase-d-plan-1a-shipped.md` to add a new "Acceptance gate" note about the actual +21 test count (don't modify the original). Do not touch pr-body.md.

---

### Finding 8: M4 dead-code claim is wrong — `legacyToResult` is referenced at line 84
- **Severity:** Medium
- **Reviewer:** Controller fact-check
- **Location:** Phase 5 step 5 (lines 109-122)
- **Flaw:** Plan claims `legacyToResult` helper at `workflow-direct-parity.test.js:27-32` is dead code. The helper IS unused in the test bodies (no `legacyToResult(` call sites). BUT line 84's comment "Deep-equal structural parity using legacyToResult. Locks the field set" references it as if it should be called. The plan removes the helper (lines 24-32) but leaves the orphaned comment at line 84, creating a dangling reference.
- **Failure scenario:** Phase 5 step 5's diff removes the helper but leaves the comment that says "using legacyToResult". Future maintainers reading the test file will be confused — the comment promises a comparison primitive that no longer exists. The plan's M4 is technically correct (helper is unused) but the cleanup is incomplete.
- **Evidence:**
  - `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js:27-32` — helper definition
  - `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js:84` — comment references the helper
  - `grep -n "legacyToResult(" tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` — zero call sites
- **Disposition:** **Accept (modified)** — the helper IS unused, but the cleanup must also remove the dangling comment.
- **Suggested fix:** Phase 5 step 5's diff must remove BOTH the helper (lines 24-32) AND the orphan comment at line 84 ("Deep-equal structural parity using legacyToResult. Locks the field set against future regressions; shape-only assertions above would miss a field drop. Add per-workflow coverage in Plan 1a.").

---

### Finding 9: Phase 2 Path B cascading math has a hidden cross-phase coupling
- **Severity:** Medium
- **Reviewer:** Failure Mode Analyst #3
- **Location:** Phase 2 Path B step 4 (lines 73-76) and Phase 5 I5 (lines 55-62)
- **Flaw:** Path B changes `mastra.length` from 32 to 31 and `tools.length` from 42 to 41. Phase 5 I5 has a conditional table for the description count (32 vs 31). BUT the plan doesn't say explicitly: if Phase 2 takes Path B, Phase 5 I5 must update server.js:152 from "41" to "31" (Path A/C leave it as "32" since the wrapper stays). The cross-phase coupling is implicit in the conditional table but not stated as a Phase 2 acceptance gate.
- **Failure scenario:** Phase 2 Path B is taken, tests pass (32→31), but Phase 5 I5 is interpreted as "32 tools" (Path A default). The `server.js:152` description ends up "32 tools" while the actual count is 31. Description drift persists.
- **Evidence:**
  - `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:160-166` — asserts mastra=32, total=42
  - `tools/learning-loop-mastra/server.js:151-152` — description "41 tools + 10 workflows"
  - Phase 5 I5 conditional table: 32 for Path A/C, 31 for Path B
- **Disposition:** **Accept** — the coupling is implicit. Make it explicit.
- **Suggested fix:** Phase 2 Path B step 4 should ALSO update `server.js:152` description to "31 tools + 10 workflows" as part of the Path B acceptance gate (not defer to Phase 5).

---

### Finding 10: Source review report cited in plan.md does not exist on disk
- **Severity:** Medium
- **Reviewer:** Scope & Complexity Critic #10
- **Location:** plan.md frontmatter `related:` (line 14), plan.md line 24, plan.md line 141
- **Flaw:** Plan cites `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` as the source review. That file does not exist on disk. The 11-finding inventory is unfalsifiable — reviewers cannot verify each finding against the original review.
- **Failure scenario:** Future operators/reviewers cannot trace Plan 1b's 11 findings to the review that produced them. The "Findings Index" table is the only canonical record. If the source review is in a different file, the citation is broken.
- **Evidence:**
  - `find plans -name "*phase-d-plan-1a-review*"` returns zero files (verified by controller)
  - `ls plans/reports/` shows no file matching `*2119*`
- **Disposition:** **Accept** — the citation is broken.
- **Suggested fix:** Either (a) file the source review report BEFORE Plan 1b ships, OR (b) update the plan to cite the actual existing report.

---

### Finding 11: Phase 6 Steps 4-5 (refresh + cold-tier) are out of scope for Plan 1b
- **Severity:** Medium
- **Reviewer:** Scope & Complexity Critic #8, #9
- **Location:** Phase 6 step 4 (lines 86-92) and step 5 (lines 96-100)
- **Flaw:** Plan 1a's `plan.md:111-112` explicitly defers "Cold-session discoverability enumeration update for `run_workflow_*` tools — Plan 4 owns". The cold-tier-regression test is already in `pnpm test` (per `package.json:18`). Running it as a separate Phase 6 step is redundant. Same for the fingerprint refresh script (a Plan 1a Phase 7 tool).
- **Failure scenario:** Plan 1b's Phase 6 "acceptance gate" runs cold-tier and refresh as a manual step, but both are already in the standard test suite. If they fail, Plan 1b's change-log gets falsely blamed for drift that's actually Plan 4's responsibility.
- **Evidence:**
  - `plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md:111-112` — cold-tier deferred to Plan 4
  - `package.json:18` — `pnpm test` already includes cold-tier via `run-pnpm-test-namespaced.mjs`
- **Disposition:** **Accept** — both steps duplicate the standard test suite.
- **Suggested fix:** Drop Step 4 (refresh-fingerprints-pre-closeout) and Step 5 (cold-tier regression) from Phase 6. `pnpm test` in Step 1 covers both.

---

### Finding 12: Phase 3 invariant test is over-tested; 2 of 4 cases are tautologies
- **Severity:** Medium
- **Reviewer:** Scope & Complexity Critic #5
- **Location:** Phase 3 step 3 (lines 98-119)
- **Flaw:** Plan adds 4 test cases. Cases 1 (`{item: "x"}.item === "x"`) and 4 (`null`/`"plain"` pass-through) test trivial pass-through behavior — a function that returns its input unchanged would pass them. Only cases 2 (envelope unwrap) and 3 (malformed JSON fallback) are meaningful. Also, `workflow-direct-parity.test.js:334-359` already exercises `stripMcpContentEnvelope` end-to-end.
- **Failure scenario:** Test file bloat. Future maintainers reading the test must determine which cases are load-bearing. The 4 cases run on every CI run without catching new regressions. The end-to-end coverage in `workflow-direct-parity.test.js` already proves the unwrap.
- **Evidence:**
  - `phase-03-envelope-consolidation.md:98-119` — 4 test assertions, 2 tautologies
  - `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js:334-359` — existing end-to-end coverage
- **Disposition:** **Accept** — the 4 cases are over-tested.
- **Suggested fix:** Drop the invariant test. End-to-end coverage in `workflow-direct-parity.test.js` is sufficient. If a unit test is required, keep only the malformed-JSON fallback case.

---

### Finding 13: Phase 2 Path C code blocks are premature (YAGNI)
- **Severity:** Medium
- **Reviewer:** Scope & Complexity Critic #6
- **Location:** Phase 2 Path C (lines 82-104); Phase 1 step 5 (line 54)
- **Flaw:** Phase 1 explicitly states Path C is "Discouraged unless A and B both fail". Phase 2 still includes 23 lines of Path C code, 6 lines of doc comment, and a parallel success criterion row. If Path A or B succeeds (the recommended paths), the Path C code is dead. The plan ships 30+ lines of speculative implementation.
- **Failure scenario:** Phase 1 returns "Path A". Phase 2 implements Path A. The Path C code is never read except by reviewers. Future code archeology must determine whether Path C was implemented and removed, or never implemented at all.
- **Evidence:**
  - `phase-01-research.md:54` — "Path C ... Discouraged unless A and B both fail"
  - `phase-02-critical-fixes.md:82-104` — 23 lines of Path C code
- **Disposition:** **Accept** — YAGNI violation. Document Path C intent as 1 paragraph under Phase 1, not full code in Phase 2.
- **Suggested fix:** Replace Phase 2 Path C code block with a 1-paragraph "if Phase 1 returns Path C, see phase-01-research.md §Decision" pointer.

---

### Finding 14: Phase 5 journal edit contradicts plan's "preservation" claim
- **Severity:** Medium
- **Reviewer:** Failure Mode Analyst #6
- **Location:** Phase 5 step 6 (lines 126-140); plan.md "Key Risks Addressed" bullet 4 (line 137)
- **Flaw:** Plan says "Plan 1a journal is preserved" in the risk note (line 137), but Phase 5 step 6 ALSO edits the journal to add test count breakdown. The "preservation" claim is internally inconsistent with the Phase 5 edit. Either the journal is append-only (then add a new entry, not modify) or it's mutable (then don't claim preservation).
- **Failure scenario:** Plan 1b ships with the journal both "preserved" and "edited". Future code archeology must reconstruct what was original vs. added. The git diff for the journal will show both the original and the appended breakdown.
- **Evidence:**
  - `plan.md:137` — "the journal is post-ship history and should not be edited"
  - `phase-05-cleanup.md:126-140` — Phase 5 step 6 edits the journal to add +21 test breakdown
- **Disposition:** **Accept** — internal contradiction.
- **Suggested fix:** Pick one. If journals are mutable for corrections, drop the "preservation" claim. If append-only, change Phase 5 step 6 to add a new entry to `docs/journals/260622-phase-d-plan-1b-shipped.md` (which Phase 6 will create anyway) instead of editing Plan 1a's journal.

---

### Finding 15: Atomic plan with 3 mutually exclusive paths complicates review
- **Severity:** Medium
- **Reviewer:** Scope & Complexity Critic #11
- **Location:** plan.md "Why Plan 1b ships as atomic fixup" (lines 38-42)
- **Flaw:** Plan explicitly rejects splitting into multiple PRs. But Phase 2's three paths (A/B/C) are mutually exclusive — exactly ONE ships. Reviewers cannot evaluate the merged diff until Phase 1 commits. The atomic plan guarantees the final PR shape is unknowable at plan-review time.
- **Failure scenario:** Phase 1 returns "Path B" (delete wrapper). Phase 2 deletes 3 files + manifest entry. Phase 3-5 unchanged. The merged PR is 1 file deletion + 5 file modifications. The "If Path A" and "If Path C" code blocks are dead in the merged PR. The atomic plan conflates the speculative "if Path A" and "if Path C" code with the actual shipped code.
- **Evidence:**
  - `plan.md:38-42` — explicit rejection of split-PR approach
  - `phase-02-critical-fixes.md:51-104` — 3 mutually exclusive paths
- **Disposition:** **Reject** — atomicity has real value here. C1 is Critical; reverting Plan 1a's resolution twice is worse than shipping speculatively. The plan's atomicity reasoning is correct.
- **Rationale:** Splitting would require either (a) re-opening the TaskUpdate resolution twice (Plan 1b Critical, then again if follow-ups touch it), or (b) cherry-picking hot-fixes onto main, breaking Plan 1a's atomic-fix discipline. The 3-path structure is speculative implementation, not speculative architecture — reviewers can see the conditional structure. **Counter-argument accepted** but the cost of splitting outweighs the benefit.

---

## Summary

| Severity | Count | Accepted | Rejected |
|----------|-------|----------|----------|
| Critical | 3 | 3 | 0 |
| High | 4 | 4 | 0 |
| Medium | 8 | 7 | 1 |
| **Total** | **15** | **14** | **1** |

**Files to modify:** plan.md (Red Team Review section), phase-02-critical-fixes.md, phase-03-envelope-consolidation.md, phase-04-sessionstart-mcp-sdk.md, phase-05-cleanup.md, phase-06-acceptance-gate.md.

**Key risks addressed:**
- Phase 4 SDK import path will fail at runtime — fixed.
- Phase 4's "deadlock fix" reintroduces the same MCP-server-startup risk — fixed by direct import.
- Phase 6 reopen mechanism is unimplementable with current tools — design changed.
- Phase 3's "remove dead code" claim is empirically wrong — fixed.
- M1 test case is self-defeating — fixed.
- I2's "+14" claim is partly fabricated — demoted to Minor.
