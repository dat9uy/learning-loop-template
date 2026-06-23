# Plan Review Report — Scope & Complexity Critic (Code Reviewer)

**Plan under review:** `plans/260622-2119-phase-d-plan-1b-review-fixups/` (6 phases, P1 priority)
**Reviewer role:** Contract Verifier + Scope & Complexity Critic
**Date:** 2026-06-22
**Status:** DONE_WITH_CONCERNS

---

## Summary

Plan 1b addresses 11 review findings from Plan 1a's PR #9 (1 Critical, 5 Important, 5 Minor). The plan's structure, TDD discipline, and Phase 1 gating for the C1 fix research are sound. However, the plan contains several contract errors that will fail at execution time, multiple scope-creep items that belong to other plans, fabricated issue rationales, and YAGNI violations in Path C documentation, M1 test over-coverage, and Phase 6 closeout scope drift into Plan 4 territory.

**Critical findings:** 3 (will block execution)
**High findings:** 1 (significant risk)
**Medium findings:** 7 (notable concerns)

---

## Findings

## Finding 1: Phase 4 SessionStart SDK import path is broken
- **Severity:** Critical
- **Location:** Phase 4, "Implementation Steps" Step 1 (lines 71-72)
- **Flaw:** The plan's rewrite uses `require("@modelcontextprotocol/sdk/client/index.cjs")` and `require("@modelcontextprotocol/sdk/client/stdio.cjs")`. The SDK package exports do not use `.cjs` suffix. The actual CJS paths under dist use the `.js` suffix and the package exports map wildcard resolves subpath imports without `.cjs`.
- **Failure scenario:** Running the rewritten hook throws `MODULE_NOT_FOUND` on first invocation. The session-start hook will fail to start at all. Existing smoke test will fail with import error.
- **Evidence:**
  - SDK package.json exports map uses `"./*": { "require": "<dist>/cjs/*" }` wildcard (no `.cjs` suffix)
  - Existing CJS pattern: `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:35` uses `await import("@modelcontextprotocol/sdk/client/stdio.js")` (no `.cjs`, uses dynamic `import()` not `require()`)
  - Confirmed runtime failure: `node -e "require('@modelcontextprotocol/sdk/client/stdio.cjs')"` returns `MODULE_NOT_FOUND`
- **Suggested fix:** Replace `require(...)` with `await import(...)` (matching existing repo pattern) and drop the `.cjs` suffix. Use `@modelcontextprotocol/sdk/client/index.js` and `@modelcontextprotocol/sdk/client/stdio.js`.

---

## Finding 2: Phase 4 hook spawning an MCP server to call a pure function is overkill
- **Severity:** Critical
- **Location:** Phase 4, "Architecture" + "Implementation Steps" Step 1
- **Flaw:** The hook spawns the full MCP server process, opens a Client transport, performs the handshake, calls `mastra_loop_describe({tier:"warm"})`, and parses the response — all to obtain `discoverability_hints`. But `discoverability_hints` is a static, frozen constant exported from `core/loop-introspect.js:90` (`DISCOVERABILITY_HINTS`). The hook can read it via direct in-process import without an MCP handshake.
- **Failure scenario:** Every Claude Code startup pays ~50-200ms of MCP server startup + JSON-RPC handshake + process spawn cost to obtain a frozen constant. If the MCP server fails to start (the deadlock root cause being fixed!), the hook fails entirely, but the data it needs is available via direct file import that does not depend on the server. The "fix" for the deadlock root cause introduces the same risk it claims to address.
- **Evidence:**
  - `tools/learning-loop-mcp/core/loop-introspect.js:90` — `const DISCOVERABILITY_HINTS = Object.freeze([...])`
  - `tools/learning-loop-mcp/core/loop-introspect.js:114-116` — `export function buildDiscoverabilityHints() { return DISCOVERABILITY_HINTS; }`
  - `tools/learning-loop-mcp/tools/loop-describe-tool.js:77` — `result.discoverability_hints = introspect.buildDiscoverabilityHints();`
  - Existing call site: zero network/MCP calls — just `buildDiscoverabilityHints()` returns the constant
- **Suggested fix:** Rewrite the hook to `import { buildDiscoverabilityHints } from "../core/loop-introspect.js";` and write `hints = buildDiscoverabilityHints()` directly. No spawn, no Client, no server startup. Match the YAGNI principle: prefer in-process helpers over cross-process RPC for static data.

---

## Finding 3: Phase 6 Step 3 reactivation plan is structurally broken
- **Severity:** Critical
- **Location:** Phase 6, "Step 3 — Reopen finding if Path B" (lines 78-83) and Phase 2, "Path B" Step 5 (lines 76-78)
- **Flaw:** Both paths claim to "reopen" a resolved finding by calling `meta_state_patch` with `resolved_at: null` and `resolved_by: null`. But `meta_state_patch` has an immutable-field deny-list that explicitly rejects these fields. The handler returns `reason: "immutable_field"`. There is no tool to "un-resolve" a finding; `meta_state_resolve` only transitions to terminal.
- **Failure scenario:** Phase 2 Path B Step 5 calls `meta_state_patch` and gets `{patched: false, reason: "immutable_field", denied_fields: ["resolved_at", "resolved_by"]}`. The finding is NOT reopened. Plan 1b ships with the TaskUpdate wrapper removed and the finding still marked resolved — a contradictory meta-state that does not match reality.
- **Evidence:**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:6-17` — `IMMUTABLE_PATCH_FIELDS` deny-list includes `resolved_at` and `resolved_by`
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:83-94` — explicit rejection of deny-listed fields
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:16-180` — `meta_state_resolve` only transitions to terminal; no `unresolve` or `reactivate` path exists
  - `tools/learning-loop-mcp/core/meta-state.js:99-101` — `resolved_at: z.string().nullable().optional()` (the field IS nullable in schema, but the patch tool blocks null writes via the deny-list)
- **Suggested fix:** Either (a) abandon Path B's "reopen" semantics — accept that closed findings stay closed and create a NEW active finding documenting the upstream gap; (b) add a new `meta_state_reactivate` tool that explicitly clears resolution fields (a one-time tool, with proper audit trail). Option (a) is the YAGNI choice. The plan should not promise a reopen path that the tooling does not support.

---

## Finding 4: I2 test-count finding is partly fabricated
- **Severity:** High
- **Location:** Phase 5, "I2 — test count doc correction" (lines 126-148) and plan.md Finding Index row I2 (line 53)
- **Flaw:** The plan claims `I2 | Important | Test count undercounted in plan/PR body (+14 claimed, +21 actual)`. The "+14 claimed" figure does NOT appear in the PR body (`plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md`). It only appears in `plan.md:140` ("+14 tests by Phase 9"). The PR body's "Test evidence" section (lines 45-63) just shows total `1139 pass / 0 fail / 1 skipped` without claiming +14. The plan's diff for `pr-body.md` shows no change to actual text — just the same number, with a footnote. The PR body is consistent with reality; the plan's internal math was wrong but the PR body never propagated the wrong figure.
- **Failure scenario:** Phase 5 Step 7 edits `pr-body.md` §"Test evidence" with diff `Total: 1139 pass → Total: 1139 pass` (identical). The only meaningful change is a footnote pointing to the journal for the actual breakdown. This is documentation churn without correcting any external claim. The "Important" severity is inflated.
- **Evidence:**
  - `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md:46-63` — "Test evidence" section shows totals only, no "+14" claim
  - `plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md:140` — only the plan claims "+14 tests by Phase 9"
  - `plans/260622-2119-phase-d-plan-1b-review-fixups/phase-05-cleanup.md:142-148` — proposed diff is identical lines + footnote
- **Suggested fix:** Demote I2 to Minor (or drop it). The journal can carry the corrected breakdown internally without modifying the PR body. If the PR body is changed, only update the journal with a new entry, not the historical PR body text.

---

## Finding 5: Phase 3 invariant test is over-tested; only 1 of 4 cases is non-trivial
- **Severity:** Medium
- **Location:** Phase 3, "Implementation Steps" Step 3 (lines 98-119)
- **Flaw:** The plan adds a 20-line invariant test with 4 cases. Cases 1 (`{item: "x"}.item === "x"`) and 4 (`null`/`"plain"` pass-through) test trivial pass-through behavior — they verify that `stripMcpContentEnvelope` does NOTHING for inputs it should not touch. These are tautologies: a function that returns its input unchanged would pass. The only meaningful assertions are case 2 (envelope unwrap) and case 3 (malformed JSON fallback). Cases 1 and 4 add line count without adding signal.
- **Failure scenario:** Test file bloat. Future maintainers reading the test must determine which cases are load-bearing. The 4 cases run on every CI run without catching real regressions. YAGNI violation: 1 unwrap-positive test + 1 malformed-JSON fallback is sufficient.
- **Evidence:**
  - `phase-03-envelope-consolidation.md:98-119` — 4 test assertions, 2 of which assert non-action
  - Existing test pattern: `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js:331-358` already covers the happy-path envelope unwrap end-to-end (it imports `workflowSelfImprovement` and runs an actual envelope through the workflow)
  - `phase-03-envelope-consolidation.md:131-132` — plan's own success criteria already requires existing workflow-direct-parity tests to remain green (so the envelope unwrap is already proven)
- **Suggested fix:** Drop the invariant test entirely. The existing `workflow-direct-parity.test.js` already exercises `stripMcpContentEnvelope` end-to-end via `workflowSelfImprovement.createRun().start({ inputData: envelopeInput })`. Adding a unit test duplicates coverage without catching new failure modes. If a unit test is required by discipline, collapse to 1 assertion: malformed-JSON fallback (the only edge case the existing test does not cover).

---

## Finding 6: Phase 2 Path C documentation is premature (YAGNI)
- **Severity:** Medium
- **Location:** Phase 2, "If Path C (cache-only workaround)" (lines 82-104) and Phase 1 Step 5 (lines 53-54)
- **Flaw:** Phase 1 Step 5 explicitly states Path C is "Discouraged unless A and B both fail". Phase 2 still includes 23 lines of Path C implementation code, 6 lines of doc comment, and a parallel success criterion row. If Path A or Path B succeeds (the two recommended paths), the Path C code is dead. The plan ships 30+ lines of speculative implementation.
- **Failure scenario:** Phase 1 returns "Path A" (working interface exists). Phase 2 implements Path A. The Path C code block is never read by anyone except reviewers. Maintenance burden: future code archeology will need to determine whether Path C was implemented and later removed, or never implemented at all. Review noise.
- **Evidence:**
  - `phase-01-research.md:54` — "Path C ... Discouraged unless A and B both fail"
  - `phase-02-critical-fixes.md:82-104` — full Path C code (23 lines) including a 6-line doc comment
  - `phase-02-critical-fixes.md:111` — Path C success criterion row ("If Path A or C: cache path uses `__dirname` anchor (M2 fixed)")
- **Suggested fix:** Document Path C's intent in one paragraph under Phase 1 Step 5 (the gating decision point). In Phase 2, replace the full code block with a 1-paragraph "if Phase 1 returns Path C, see phase-01-research.md §Decision for rationale and adapt Path A's `__dirname` fix" pointer. If Phase 1 needs Path C, expand then.

---

## Finding 7: M1 parameterized tests over-cover; "undefined"/"null" cases do not test the regex
- **Severity:** Medium
- **Location:** Phase 5, "M1 — id validation broader tests" (lines 64-91)
- **Flaw:** The parameterized table claims `["undefined", undefined]` and `["empty", ""]` will be rejected by the regex `/^[a-z][a-z0-9_]*$/`. But JavaScript's `RegExp.test()` coerces non-string arguments via implicit `String()`:
  - `String(undefined)` → `"undefined"` → matches the regex (starts with lowercase letter "u")
  - `String(null)` → `"null"` → matches the regex (starts with lowercase letter "n")
  - `""` → empty string → does NOT match (no characters)
- **Failure scenario:** The test cases for `undefined` and `null` may pass for the wrong reason — because the `if (!opts.id)` guard at `create-loop-workflow.js:103` short-circuits before the regex runs. The test labels say "rejected by regex" but the actual rejection is by truthiness check. This misleads future maintainers about which invariant is enforced. The "empty" case works correctly; "undefined"/"null" work via a different mechanism.
- **Evidence:**
  - `phase-05-cleanup.md:64-91` — 6 test cases in parameterized table
  - `tools/learning-loop-mastra/create-loop-workflow.js:103-106` — `if (!description || ...) throw ... if (!/^[a-z][a-z0-9_]*$/.test(id)) throw ...` (note the `!description` check before `id`)
  - Verified runtime: `node -e "/^[a-z][a-z0-9_]*$/.test(undefined)"` returns `true`
  - Verified runtime: `node -e "/^[a-z][a-z0-9_]*$/.test(null)"` returns `true`
- **Suggested fix:** Drop the `undefined` and `null` cases from the parameterized table (they test the truthiness guard, not the regex). Keep `uppercase`, `starts-with-digit`, `hyphen`, `special-char`, `empty`. That is 5 tests that all genuinely test the regex. If the truthiness guard needs coverage, add a separate test with a comment explaining it.

---

## Finding 8: Phase 6 step 5 (cold-tier regression) is out of scope for Plan 1b
- **Severity:** Medium
- **Location:** Phase 6, "Step 5 — Cold-tier regression check" (lines 96-100) and plan.md "Out of scope" section (line 110)
- **Flaw:** Plan 1a's plan.md explicitly defers "Cold-session discoverability enumeration update for `run_workflow_*` tools — Plan 4 owns". The cold-tier-regression test (`tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js`) checks invariants including "zero broken proposed_design_for refs" — a structural invariant unrelated to Plan 1b's 11 findings. Running this as a Plan 1b acceptance gate step pulls Plan 4's verification responsibility into Plan 1b.
- **Failure scenario:** Plan 1b ships with a passing cold-tier test. The next time the test breaks (unrelated to Plan 1b changes), the change-log will reference Plan 1b's PR as the last ship event, creating false signal for Plan 4 owners. The test is already in the regular `pnpm test` suite (9 globs), so running it as a separate Phase 6 step is redundant.
- **Evidence:**
  - `plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md:111-112` — explicitly defers cold-session discovery update to Plan 4
  - `plans/260622-2119-phase-d-plan-1b-review-fixups/plan.md:110` — "Cold-session discoverability enumeration update for `run_workflow_*` tools — Plan 4"
  - `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js:1-20` — verifies invariants unrelated to Phase 1b's 11 findings
  - `package.json:18` — `pnpm test` runs `node tools/scripts/run-pnpm-test-namespaced.mjs` which already includes cold-tier-regression
- **Suggested fix:** Drop Step 5. Cold-tier regression is already in `pnpm test`; running it separately adds a step with no new signal. If a Plan 4 owner needs to verify, they run it as part of Plan 4 closeout.

---

## Finding 9: Phase 6 step 4 (refresh-fingerprints-pre-closeout) is also out of scope
- **Severity:** Medium
- **Location:** Phase 6, "Step 4 — Refresh drifted fingerprints" (lines 86-92)
- **Flaw:** Same issue as Finding 8 — `refresh-fingerprints-pre-closeout.mjs` is a Plan 1a Phase 7 closeout tool. Running it as a Plan 1b acceptance step suggests Plan 1b changes will drift existing fingerprints, but the only files Plan 1b modifies are already-anchored to specific findings (e.g., `tools/learning-loop-mcp/core/envelope-stripper.js`, `create-loop-workflow.js`). The script's job is to refresh drift on the Plan 1a PR's own findings; Plan 1b should run it during its own changes to track the new drift.
- **Failure scenario:** Plan 1b modifies `core/envelope-stripper.js` (adds `stripMcpContentEnvelope`). Any existing resolved finding anchored to `envelope-stripper.js` will have a new hash_mismatch. Step 4 runs the refresh script, which silently refreshes the hashes. The change-log entry from Step 2 does not mention the refresh. Future operators see "Phase D Plan 1b shipped" but the meta-state silently absorbed 2-3 fingerprint refreshes — invisible audit trail.
- **Evidence:**
  - `tools/scripts/refresh-fingerprints-pre-closeout.mjs:1-30` — refreshes `hash_mismatch` entries
  - `plans/260622-1810-phase-d-plan-1a-parity-tightening/phase-07-pre-closeout-refresh-hook.md` — Plan 1a owns this
  - `plans/260622-1810-phase-d-plan-1a-parity-tightening/phase-10-acceptance-gate-and-closeout.md` — Plan 1a runs this in its Phase 10
- **Suggested fix:** Drop Step 4 from Phase 6. Plan 1b's actual code changes (Phase 2-5) need their own fingerprint refresh discipline, not a global "run refresh and trust the output" step. If drift must be surfaced, do it inline as part of each phase's commit (with explicit `meta_state_log_change` per refresh).

---

## Finding 10: Source review report referenced in plan.md does not exist
- **Severity:** Medium
- **Location:** plan.md line 14 (frontmatter `related:`), line 24, line 141, line 24
- **Flaw:** The plan's frontmatter cites `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` as the source review. That file does not exist on disk. The plan was authored before the source report was filed, so the "11 findings" inventory cannot be independently verified against the review report.
- **Failure scenario:** A reviewer trying to verify the plan's claims about each finding (severity, evidence, exact wording) cannot find the source. The plan's "Findings Index" table is the only canonical record. Future code archeology must reconstruct findings from the plan, not from the review that produced them.
- **Evidence:**
  - `ls plans/reports/` (no file matching `*2119*phase-d-plan-1a-review*`)
  - `find plans -name "*phase-d-plan-1a-review*"` returns no files
  - `plan.md:14` cites the missing file
- **Suggested fix:** Either (a) ensure the source review report is filed BEFORE Plan 1b ships, with the same filename the plan cites; (b) update the plan to cite the actual existing report (if a different one exists). Without the source, the 11-finding inventory is unfalsifiable.

---

## Finding 11: Atomic plan with mutually exclusive Path A/B/C complicates review and merge
- **Severity:** Medium
- **Location:** plan.md "Why Plan 1b ships as atomic fixup" (lines 38-42), Phase 1 Step 5, Phase 2 Steps A/B/C
- **Flaw:** The plan explicitly rejects splitting into multiple PRs (atomic-fix discipline). But Phase 2's three paths are mutually exclusive — exactly ONE of A/B/C ships. The PR diff is conditional on a Phase 1 decision not yet made. Reviewers cannot review the actual diff until Phase 1 commits. The atomic plan guarantees that the final PR shape is unknowable at plan-review time.
- **Failure scenario:** Phase 1 returns "Path B" (delete the wrapper). Phase 2 deletes `task-update.js`, `task-update.test.js`, and the manifest entry. Phase 3-5 do not depend on Phase 2's path. The merged PR contains 1 file deletion + 5 file modifications, all in one commit. The reviewer (this report) cannot verify Phase 2's correctness until Phase 1 commits. Phase 2's "If Path A" and "If Path C" code blocks are dead in the merged PR.
- **Evidence:**
  - `plan.md:38-42` — explicit rejection of split-PR approach
  - `phase-02-critical-fixes.md:51-104` — 3 mutually exclusive implementation paths
  - `phase-02-critical-fixes.md:107-112` — 5 success criteria rows with conditional `if Path A or C` / `if Path B` qualifiers
- **Suggested fix:** Ship Plan 1b as 2 PRs: (1) Phase 1 research + Phase 2 (Path B is the safer default since Path A is speculative); (2) Phase 3-5 housekeeping. PR 1 lands first; PR 2 merges the refactors. This preserves atomic-fix discipline at the PR level (each PR is internally consistent) without forcing reviewers to evaluate 3 mutually exclusive paths simultaneously. The "reopening TaskUpdate resolution" risk cited as the reason for atomicity is mitigated by PR 1 having a tight scope (just delete + reopen).

---

## Positive Observations (calibration)

- **Phase 1 gating is well-designed.** Requiring research before critical-fix work prevents the C1 fix from being committed blindly. The three-path structure (A/B/C) with explicit fallbacks is appropriate for unknown upstream interfaces.
- **TDD discipline is consistent across phases.** Each phase has explicit test-before-code steps and success criteria that include `pnpm test` exits.
- **File ownership map (plan.md lines 122-125) prevents parallel-edit conflicts.** This is a discipline signal from prior phases that Plan 1b inherits correctly.
- **M4 (`legacyToResult` removal) is correctly identified.** Verified: `legacyToResult(` is referenced exactly once in the test file — at the function definition itself. Plan 1a's journal (line 25) explicitly explains why it was never wired. Plan 1b's removal is a legitimate cleanup, not a YAGNI violation.

---

## Plan vs. Codebase Verification Summary

| Plan claim | Verified? | Evidence |
|---|---|---|
| `task-update.js` shells out to `claude task update --id X --status Y` | Yes | `tools/learning-loop-mcp/tools/task-update.js:31` |
| `stripContentEnvelope` exists at `create-loop-workflow.js:23-38` | Yes | `tools/learning-loop-mastra/create-loop-workflow.js:23-38` |
| `stripEnvelope` exists at `core/envelope-stripper.js:19` | Yes | `tools/learning-loop-mcp/core/envelope-stripper.js:19` |
| `stripMcpContentEnvelope` does not yet exist | Yes | grep confirms zero references in `tools/` and `docs/` |
| `discoverability_hints` is a frozen constant | Yes | `tools/learning-loop-mcp/core/loop-introspect.js:90-116` |
| `meta_state_patch` deny-lists `resolved_at`/`resolved_by` | Yes | `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:6-17` |
| `meta_state_resolve` only transitions to terminal | Yes | `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js:14` |
| SDK exports use `.js` suffix in CJS, not `.cjs` | Yes | SDK package.json exports map |
| Existing CJS test uses `await import()` not `require()` | Yes | `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:35` |
| `server.js:150` version is "0.1.0" | Yes | `tools/learning-loop-mastra/server.js:149` |
| `server.js:152` description says "41 tools" | Yes | `tools/learning-loop-mastra/server.js:151-152` |
| `package.json:3` version is "0.1.1" | Yes | `package.json:3` |
| `manifest.json` line 33 is task-update | Yes | `tools/learning-loop-mastra/tools/manifest.json:33` |
| `workflow-parity.test.cjs:160-166` asserts 32/42 | Yes | `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:160-166` |
| `legacyToResult` is defined but unused (M4 valid) | Yes | grep shows zero call sites |
| Source review report `from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` exists | NO | file does not exist on disk |
| Phase 4 SDK `require(... .cjs)` import path resolves | NO | `MODULE_NOT_FOUND` at runtime |
| M1 `undefined`/`null` rejected by regex | NO | regex matches both via `String()` coercion |

---

## Recommended Actions (prioritized)

1. **Block ship** until Finding 1 (SDK import path) and Finding 3 (reopen mechanism broken) are fixed. Both will fail at execution time.
2. **Refactor Phase 4** to remove the MCP server spawn entirely (Finding 2). Read `buildDiscoverabilityHints()` directly. Reduces scope by ~30 lines and removes the deadlock risk.
3. **Demote or drop I2** (Finding 4). The "+14" claim is not in the PR body; the doc correction is internal-only.
4. **Simplify M1 tests** (Finding 7). Drop the undefined/null cases; the regex does not actually reject them.
5. **Collapse Phase 3 invariant test** to 1 case (Finding 5). The end-to-end coverage already exists in `workflow-direct-parity.test.js`.
6. **Document Path C as 1 paragraph** (Finding 6). Code blocks are dead until Phase 1 returns Path C.
7. **Drop Phase 6 Steps 4-5** (Findings 8-9). Cold-tier regression and fingerprint refresh are out of Plan 1b scope.
8. **File the source review report** (Finding 10). The 11 findings must have a citable source.
9. **Consider 2-PR split** (Finding 11). Atomic-fix discipline works at PR granularity; splitting Phase 1+2 from Phase 3-5 gives reviewers a definite diff.

---

## Unresolved Questions

1. **Phase 1 outcome is unknowable at plan-review time.** All of Phase 2's implementation blocks are conditional. The merged PR's shape depends on Phase 1 research. If Phase 1 takes Path A or C, different code ships. The atomic plan cannot be reviewed as a unit.
2. **What is the actual Phase 1 deliverable?** Phase 1 says "Decision recorded in 'Decision' section above (A, B, or C with evidence)". But the "Decision" section (lines 58-72) is a template — `_A / B / C` placeholder. The plan does not specify who fills this in or how it gates Phase 2 (no `meta_state_log_change` or commit hook enforces the gate).
3. **The journal edit in Phase 5 I2 modifies a shipped historical record.** Is `docs/journals/260622-phase-d-plan-1a-shipped.md` considered append-only? The plan treats it as editable to correct the test count. If journals are append-only, I2's fix should add a new entry, not modify the existing one.

---

## Plan Status

**Status:** DONE_WITH_CONCERNS

The plan's structure is sound and the Phase 1 gating for C1 is appropriate. However, **3 critical flaws will block execution**: the Phase 4 SDK import path is broken, Phase 4's MCP server spawn is unnecessary (YAGNI), and Phase 6's reopen mechanism is structurally impossible with current tools. Plus the source review report cited as the plan's basis does not exist on disk.

Recommend: revise to address Findings 1-3 and 10, then re-review. Findings 4-9 and 11 are scope/quality issues that should be resolved before merge but will not block a clean dry-run.

**Severity totals:** Critical 3, High 1, Medium 7.

---

## References

- `plans/260622-2119-phase-d-plan-1b-review-fixups/plan.md` (plan under review)
- `plans/260622-2119-phase-d-plan-1b-review-fixups/phase-01-research.md` through `phase-06-acceptance-gate.md`
- `plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md` (parent plan)
- `tools/learning-loop-mcp/tools/task-update.js` (broken wrapper)
- `tools/learning-loop-mastra/create-loop-workflow.js` (envelope duplication)
- `tools/learning-loop-mcp/core/envelope-stripper.js` (canonical stripper)
- `tools/learning-loop-mcp/core/loop-introspect.js` (DISCOVERABILITY_HINTS constant)
- `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` (hand-rolled JSON-RPC)
- `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (immutable field deny-list)
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` (terminal-only transitions)
- `tools/learning-loop-mastra/server.js:149-152` (version + tool count drift)
- `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (legacyToResult dead code)
- `node_modules/@modelcontextprotocol/sdk/package.json` (exports map)
- `docs/journals/260622-phase-d-plan-1a-shipped.md` (Plan 1a journal)
