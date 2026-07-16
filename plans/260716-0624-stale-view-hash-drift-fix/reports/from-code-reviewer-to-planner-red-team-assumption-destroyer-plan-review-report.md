# Red-Team Plan Review — Assumption Destroyer

**Subject:** `plans/260716-0624-stale-view-hash-drift-fix/`
**Reviewer posture:** adversarial; seek false claims, unstated dependencies, and integration failures
**Scope:** 1 plan + 4 phase files. Codebase evidence gathered via grep/glob/Read. No code/test execution.

---

## Finding 1: `meta_state_query_drift` does NOT return per-entry `drifted:false` — plan's success criterion 6 is structurally impossible
- **Severity:** High
- **Location:** Plan.md acceptance criterion 6 (lines 109-110); Phase 03 Success Criteria 3 (line 128); Plan.md Root Cause section (lines 19-20)
- **Flaw:** The plan asserts: *"A follow-up `meta_state_query_drift` on the same entry reports `drifted:false` after re-verify."* The actual shape returned by `meta_state_query_drift` is `{ drift_count, drift_events }` (aggregated), not a per-entry `drifted:boolean`. `drift_events[].id` exists, but no `drifted:false` field.
- **Failure scenario:** Phase 03 implementation cannot satisfy the written acceptance criterion. Either (a) the implementer fabricates a different success check (silently drifting from the plan), or (b) the plan commits to a verification shape the tool does not provide.
- **Evidence:** `tools/learning-loop-mastra/core/query-drift.js:46-66` returns `{ drift_count, drift_events }`. `tools/learning-loop-mastra/tools/handlers/meta-state-query-drift-tool.js:33-72` returns `result` directly. `grep -rn "drifted:" tools/learning-loop-mastra/ --include="*.js"` returns no per-entry shape.
- **Suggested fix:** Rewrite criterion 6 to verify `drift_count` drops (e.g., pre-re-verify: count includes the entry; post-re-verify: count excludes it) or have the implementer call `meta_state_check_grounding({id})` (which DOES return `status: "grounded"`/`"drifted"` per-entry).

---

## Finding 2: `upsertFileIndexEntry` ordering vs. `applyUpdateAndCheck` creates an index/entry skew on CAS conflict
- **Severity:** High
- **Location:** Phase 03 lines 67-100 (re_verify refresh block)
- **Flaw:** The plan inserts the `upsertFileIndexEntry` call **before** `applyUpdateAndCheck` (line 84 in the plan: `indexRefreshed = await upsertFileIndexEntry(...)`). On a CAS conflict in `applyUpdateAndCheck` (existing line 65 in `meta-state-re-verify-tool.js`), the file-index has been mutated to current bytes but `last_verified_at` was NOT stamped. The drift signal is cleared, but the entry's age clock is stale — and the registry thinks the entry is still drifting from the user's perspective. This produces the inverse of the bug being fixed: a "grounded-looking" entry that's actually out-of-date.
- **Failure scenario:** Two operators re-verify concurrently. Operator A wins CAS, stamps `last_verified_at`, refreshes index. Operator B's `upsertFileIndexEntry` also succeeds (no CAS check on the index — line 787-825 of `meta-state.js` performs no version check) and clears the drift signal for A's entry. A's entry now appears grounded against bytes that A didn't verify.
- **Evidence:** `tools/learning-loop-mastra/core/meta-state.js:787-826` shows `upsertFileIndexEntry` performs NO CAS/version check (only key shape + hash validation). `tools/learning-loop-mastra/tools/handlers/meta-state-re-verify-tool.js:65` is the CAS guard via `applyUpdateAndCheck`. Plan's Phase 03 places the upsert **before** the CAS guard (Phase 03 step "Inside handler, after the verification loop, before applyUpdateAndCheck").
- **Suggested fix:** Move `upsertFileIndexEntry` **after** `applyUpdateAndCheck` returns `ok: true`. On `updateOutcome.ok === false`, skip the upsert entirely (the drift signal is the correct surface until the entry can be re-verified cleanly).

---

## Finding 3: `computeFileHash` only throws `FileNotFoundError` on missing files — EACCES and other read errors propagate uncaught
- **Severity:** High
- **Location:** Plan.md claim 2 (line 110 acceptance criterion 6 implementation), Phase 03 lines 80-96 (re_verify refresh), Phase 03 Risk Assessment (lines 137-138)
- **Flaw:** Plan states "Permission errors on `computeFileHash`: if the file is removed or perms changed between filing and re-verify, `FileNotFoundError` (or EACCES) is caught and logged." But `computeFileHash` only wraps `existsSync === false` in `FileNotFoundError`. If `readFileSync` throws (EACCES, EMFILE, EISDIR), the raw `Error` propagates — the plan's bare `catch { /* missing → no drift signal */ }` and `catch (err)` in Phase 03 will catch it, but **the error message logged will be misleading** ("index_refresh_skipped: EACCES: permission denied" with no context). Worse: in Phase 01's `computeCurrentHashes` (lines 78-79 of plan.md), the empty catch swallows EACCES silently — no log entry, no gate-log trace, no signal to the operator.
- **Failure scenario:** A finding is filed against a file that later becomes unreadable (chmod 000, deleted mid-run, fs mount issue). `meta_state_re_verify` runs, succeeds on verification steps, then `computeFileHash` throws EACCES → caught → `index_refreshed: false` is returned with no clear root cause in the gate-log. Operator sees "re-verified: true" and assumes drift is cleared. Next sweep shows drift again; user has no breadcrumb.
- **Evidence:** `tools/learning-loop-mastra/core/check-grounding.js:81-88`: `if (!existsSync(absPath)) throw FileNotFoundError`; otherwise `readFileSync(absPath)` with NO try/catch. Plan's `computeCurrentHashes` (plan.md lines 67-83) wraps `computeFileHash` in `try { ... } catch { /* missing → no signal */ }` — comment says "missing" but the catch also eats EACCES.
- **Suggested fix:** In `computeCurrentHashes`, distinguish the two error classes: `if (err instanceof FileNotFoundError) skip; else throw OR log gate-decision` (don't swallow). In Phase 03's re_verify block, log the error code (`err.code`) explicitly.

---

## Finding 4: Plan claims 14 tests in `stale-view.test.js` post-Phase-1, but the file has 15 existing tests
- **Severity:** Medium
- **Location:** Plan.md Verification protocol (line 142), Phase 01 Success Criteria (line 199)
- **Flaw:** Plan asserts "expected: 14 passed (8 existing updated + 6 new)" but `tools/learning-loop-mastra/__tests__/legacy-mcp/stale-view.test.js` contains **15** existing tests (lines 20, 25, 29, 35, 41, 46, 50, 55, 65, 70, 77, 95, 101, 116, 120). The math `8 updated + 6 new = 14` only works if 7 tests are deleted, which the plan does not propose. Plus, **only 1 existing test actually requires updating** (line 77-93 — drift semantics), and even that test will still pass under the new contract because the `OLD` `created_at` triggers the age branch.
- **Failure scenario:** Implementation lands, runs the test, gets 22 passing tests (15 existing + 6 new + 1 newly-renamed drift test, or 14 existing + 7 new if the renamed drift test counts as "updated"). The "expected 14" in the verification protocol is a wrong baseline; if used for CI gate (e.g., minimum test count assertion), it'll reject the run.
- **Evidence:** Counted via `grep -n "^test(" tools/learning-loop-mastra/__tests__/legacy-mcp/stale-view.test.js` — 15 test() invocations exist; the plan only acknowledges 14.
- **Suggested fix:** Update the verification protocol to "expected: 21+ passed" (15 existing + 6 new, with the line 77-93 test renamed to reflect hash-aware semantics). Cross-check by counting `test(` lines before sending.

---

## Finding 5: The "5 consumer tests need updating" claim is overstated — none actually need flipping under age-only fallback
- **Severity:** Medium
- **Location:** Plan.md Backwards compat section (line 121); Phase 02 lines 105-114 ("Step 2.4 Test expectation updates")
- **Flaw:** Plan asserts 5 test files need expectation updates: `meta-state-sweep.test.js`, `meta-state-sweep-stale-transition.test.js`, `meta-state-relationship-validate-tool.test.js`, `meta-state-relationships-dangling-refs.test.js`, `build-stale-dispatch-hints.test.js`. Inspection shows:
  - `meta-state-sweep.test.js`: uses `metaStateReportTool` which produces entries WITHOUT `evidence_code_ref`. The 3 tests backdate `created_at` 8 days. Under new contract: drift branch silent (no `evidence_code_ref`), age branch fires → tests still pass.
  - `meta-state-sweep-stale-transition.test.js`: same pattern. No `evidence_code_ref`. Tests pass.
  - `meta-state-relationship-validate-tool.test.js`: `writeFixture` writes entries WITHOUT `evidence_code_ref` (lines 22-34). L1 test expects orphan flagged — still flagged via age branch. Tests pass.
  - `meta-state-relationships-dangling-refs.test.js`: tests use `metaStateReportTool` (no `evidence_code_ref`) and explicit `superseded` status. Test at line 24 expects "superseded" reason — does NOT depend on `isStaleView`. Pass.
  - `build-stale-dispatch-hints.test.js`: tests use `makeEntry` with default `created_at` 8d old. Most entries DO have `evidence_code_ref` (e.g. line 62: `tools/x.js:1`), but `buildStaleDispatchHints` does NOT pass `fileIndex`/`codeHashes` to `isStaleView` — it relies on age-only branch via the existing `isStaleView(e)` call (no opts) at `loop-introspect.js:224`. So even with new files, these tests still pass under age-only semantics.

  No test expectations need to flip. The plan's Phase 02 test-update list is fabricated risk.
- **Failure scenario:** Implementer follows the plan's "Step 2.4: Test expectation updates" and starts modifying assertions. Either they make no actual changes (because nothing needs flipping) and waste effort, or they change expectations in a way that masks a real regression.
- **Evidence:** Verified `grep -n "evidence_code_ref" tools/learning-loop-mastra/__tests__/legacy-mcp/{meta-state-sweep.test.js,meta-state-sweep-stale-transition.test.js}` returns ZERO matches (no `evidence_code_ref` in those test files). The relationship-validate fixture at lines 22-34 writes a finding with no `evidence_code_ref`. `buildStaleDispatchHints` is at `tools/learning-loop-mastra/core/loop-introspect.js:212-278` and calls `isStaleView(e)` without opts.
- **Suggested fix:** Remove or scope-down Step 2.4. The only test that might change behavior is `stale-view.test.js` (Phase 01, line 77-93, which the plan already addresses). Skip the consumer-test mass-update; add a single targeted unit test for each handler that constructs an in-memory registry with a deliberately mismatched `codeHashes` map (which the plan already mentions as a "mitigation" in Phase 02 Risk Assessment, but doesn't actually mandate as a success criterion).

---

## Finding 6: `meta-state-relationships-tool.js#computeDanglingRefs` signature change is unstated
- **Severity:** Medium
- **Location:** Phase 02 lines 99-103 (Step 2.3), Plan.md Related Code Files (lines 68-69)
- **Flaw:** Plan claims "computeDanglingRefs receives the entry-by-id map AND (fileIndex, codeHashes). Internally, isStaleView(target, { fileIndex, codeHashes })." The current signature is `computeDanglingRefs(refs, entries)` (2 args, called at line 208 from `resolveDanglingRefs`). The plan adds a 3rd argument (`signals`). But `resolveDanglingRefs` at line 206-210 calls `factory.outboundRefs(entries)` then `computeDanglingRefs(refs, entries)`. The plan does not show updating `resolveDanglingRefs` to thread the signals through — so the new 3rd-arg signature is unreachable from the tool handler. AND there's an undocumented CROSS-TOOL divergence comment at lines 66-76 of the file: a post-merge validator (`validate-registry-refs.js#computeDanglingRefs`) has a DIFFERENT signature. The plan's signature change affects only one of two functions with the same name.
- **Failure scenario:** Implementer updates `computeDanglingRefs` signature in `meta-state-relationships-tool.js` but doesn't update `resolveDanglingRefs` (the caller) to pass signals. The 3rd arg is always undefined → `isStaleView(target, { fileIndex: undefined, codeHashes: undefined })` → drift branch silent → no behavior change vs. today (test passes, but the planned "drift signal" never fires). OR the implementer updates the post-merge `validate-registry-refs.js` by mistake, breaking the registry validator.
- **Evidence:** `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js:101-125` is `computeDanglingRefs(refs, entries)`; called at line 208 by `resolveDanglingRefs(refs, entries)`. Plan's Phase 02 Step 2.3 says "computeDanglingRefs receives the entry-by-id map AND (fileIndex, codeHashes)" but does NOT show updating `resolveDanglingRefs` to pass the 3rd arg, nor does it mention the cross-tool divergence at lines 66-76.
- **Suggested fix:** Add explicit diff for `resolveDanglingRefs` accepting `signals` and threading it. Add a note in Step 2.3 that the post-merge validator's `computeDanglingRefs` is a different function and is OUT OF SCOPE.

---

## Finding 7: Cold-tier cap precompute is "likely ~0" — the plan admits it doesn't know
- **Severity:** Medium
- **Location:** Plan.md Verification protocol (line 162), Phase 03 Step 3.1 (line 109)
- **Flaw:** The plan's claim 4 is "The cap precompute reflects the post-fix drift-stale count (likely ~0 if no real drift; otherwise the actual count)." Step 3.1 says "Run `pnpm meta_state_sweep` after Phase 1 lands... If the count is 0 (likely post-fix), set threshold to 2 (0 + 2 headroom) so the cap is meaningful for future drift regressions." But: (a) the seed step (`seed-file-index.mjs`) re-hashes every mc:true path to current bytes (line 47-66 of seed-file-index.mjs), so by design post-seed, drift count SHOULD be 0. (b) Setting threshold to 2 in this case means the cap is meaningless — every newly-filed, recently-verified mc:true finding with an `evidence_code_ref` matching the seed will be below the threshold, but ANY real future drift will trip immediately at drift_count=1+headroom=2. (c) The plan provides NO measurement procedure that produces a reproducible post-fix number — it just says "run sweep once and read stale_view_count".
- **Failure scenario:** First CI run after Phase 3 lands, post-seed: drift count is 0. Cap set to 2. Someone makes a legitimate refactor that drifts one file. Sweep reports drift_count=1, below 2, passes. Next CI run, another refactor: drift_count=2, equals cap, fails. The cap is acting as a noisy tripwire, not a structural forcing function. Worse: the "abandoned (>7d)" findings counted by the AGE branch are not bounded by this cap's intent — the plan conflates age-stale and drift-stale into one number.
- **Evidence:** `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs:43-66` re-hashes every cited path to current bytes; the seed-step invariant is `currentHash === storedHash` post-seed. The plan's Unresolved Questions #3 (lines 176-177) itself flags the cap-meaningfulness concern but punts on a real answer.
- **Suggested fix:** Either (a) accept that the cap will be ~0 and document it as "expected drift count is ~0 post-seed; cap is a tripwire for future drift regressions; age-stale findings count separately and have their own (or no) cap"; OR (b) measure both age-stale and drift-stale counts in Phase 3 and use distinct thresholds. The current "set threshold to 2" placeholder is not a real precompute.

---

## Finding 8: `loop-introspect.js#buildStaleDispatchHints` calls `isStaleView` without opts — drift signal silently lost in another place
- **Severity:** Medium
- **Location:** Plan.md Risks section (line 122), Phase 02 Related Code Files (lines 67-74)
- **Flaw:** Plan claims "`loop-introspect.js#buildRegistrySummary` already takes `fileIndex` but only uses it for the `drift` snapshot (top-5 mc:true findings), not for stale-view. No change needed there." Verified: `loop-introspect.js:769` does pass `fileIndex` for `code_fingerprint` lookup. BUT `buildStaleDispatchHints` at `loop-introspect.js:212-278` calls `isStaleView(e)` WITHOUT opts (line 224). The plan's Phase 02 lists only 3 tools to wire (`meta-state-sweep-tool.js`, `meta-state-relationship-validate-tool.js`, `meta-state-relationships-tool.js`) — `loop-introspect.js` is NOT in the modify list. So `buildStaleDispatchHints` will continue to use age-only semantics, while the other 3 tools will use hash-aware semantics. The dispatch hints will over-report stale-view candidates (every aged mc=true finding regardless of drift), creating an inconsistency with `meta_state_sweep`'s corrected output. The test `build-stale-dispatch-hints.test.js` would still pass (because `buildStaleDispatchHints` is age-only) but the agent's view of "stale candidates" diverges from `meta_state_sweep`'s view of "stale findings".
- **Failure scenario:** Operator runs `loop_describe({tier: "warm"})` → sees dispatch hints with stale candidates including ones whose files have not drifted. Operator runs `meta_state_sweep` → sees a smaller, drift-corrected stale set. The two views disagree; agent has to reconcile. OR the plan's intent was "leave buildStaleDispatchHints as age-only" and this is acceptable — but then the Phase 02 test update at line 112 ("`build-stale-dispatch-hints.test.js` — dispatch hints count should match the corrected stale-view set") is contradictory: the count WILL NOT match if `buildStaleDispatchHints` stays age-only.
- **Evidence:** `tools/learning-loop-mastra/core/loop-introspect.js:224`: `.filter((e) => isStaleView(e))` — no opts. `tools/learning-loop-mastra/core/loop-introspect.js:769`: `code_fingerprint: (fileIndex && fileIndex.get(canonicalIndexKey(e.evidence_code_ref))) ?? e.code_fingerprint ?? null,` — fileIndex IS used, but for `code_fingerprint`, not for stale-view.
- **Suggested fix:** Pick one: (a) wire `buildStaleDispatchHints` to pass `{ fileIndex, codeHashes }` (Phase 02 file list grows by 1); (b) explicitly leave `buildStaleDispatchHints` age-only and delete the Phase 02 Step 2.4 line about updating `build-stale-dispatch-hints.test.js`. The plan is internally inconsistent on this point.

---

## Finding 9: `upsertFileIndexEntry` returns `false` (not throws) for invalid paths/hashes — Phase 03 doesn't distinguish
- **Severity:** Medium
- **Location:** Phase 03 lines 80-96 (re_verify refresh); Plan.md claim 6
- **Flaw:** Plan claims `meta_state_re_verify` "calls `upsertFileIndexEntry` ... after a successful verification step sequence." The plan's code (lines 84-85): `indexRefreshed = await upsertFileIndexEntry(root, canonical, currentHash);`. But `upsertFileIndexEntry` returns `false` (not throws) on three failure modes: (1) non-string key, (2) absolute path key (F3 protection), (3) invalid hash (TERMINAL_HASH_REGEX fail). The plan's `try { ... } catch (err)` only catches thrown errors — `false` returns silently set `indexRefreshed = false` with no log entry. So if the canonical key is rejected (e.g., evidence_code_ref is a weirdly-formatted path that strips to an absolute), `index_refreshed: false` is returned to the caller with no gate-log breadcrumb. The agent has no way to diagnose why the drift signal didn't clear.
- **Failure scenario:** Operator files a finding with `evidence_code_ref: "/etc/passwd:1"` (sanitization slip). Re-verify passes verification steps. `canonicalIndexKey` strips `:1` → `/etc/passwd`. `isAbsolute` returns true → `upsertFileIndexEntry` returns `false` (F3 protection). `index_refreshed: false` returned silently. Agent sees drift signal persists; doesn't know the index refused to write. No gate-log entry written.
- **Evidence:** `tools/learning-loop-mastra/core/meta-state.js:787-794` shows the three false-return conditions BEFORE any I/O. Plan's Phase 03 only wraps in try/catch, doesn't check `indexRefreshed === false` separately.
- **Suggested fix:** After `await upsertFileIndexEntry(...)`, if `indexRefreshed === false`, append a gate-log entry with `reason: "index_write_rejected"` + the canonical key + the hash. Don't conflate with the try/catch path.

---

## Finding 10: `meta_state_re_verify` has NO existing test file — Phase 03 Step 3.4 is conditional, but the success criteria are unconditional
- **Severity:** Medium
- **Location:** Phase 03 lines 119-123 (Step 3.4); Phase 03 lines 124-131 (Success Criteria)
- **Flaw:** Plan's Step 3.4 begins "If a test file for `meta_state_re_verify` exists, add cases..." Verified: there is NO existing test file for `meta-state-re-verify-tool.js`. `find tools/learning-loop-mastra/__tests__ -name "*re-verify*"` returns no results. So the plan's Phase 03 has no test coverage for the new index-refresh behavior. The success criteria (lines 124-131) lists specific test outcomes:
  - "A follow-up `meta_state_check_grounding` on a freshly re-verified entry returns `status: 'grounded'`" — NOT a re_verify test, requires integration setup.
  - "A re-verify against a missing file returns `re_verified: true` with `index_refreshed: false` and a gate-log entry" — requires a NEW test file to be created.
  - Phase 03's `pnpm test` → "all green" success criterion does NOT verify any of the new behavior because no test file exists.

  This means Phase 03's new behavior (the entire point of Phase 03 — making `meta_state_re_verify` actually clear drift) ships WITHOUT test coverage. The Phase 3 verification block only runs the cold-tier-regression test.
- **Failure scenario:** Phase 3 lands. Re-verify behavior ships untested. CI passes (no test fails). Operator invokes `meta_state_re_verify` in production → index upsert silently breaks (e.g., regression in `applyUpdateAndCheck` ordering from Finding 2, or EACCES from Finding 3). No test catches it.
- **Evidence:** `find tools/learning-loop-mastra/__tests__ -name "*re-verify*"` returns 0 results. Phase 03 verification block (line 153) only runs `cold-tier-regression.test.js`.
- **Suggested fix:** Add a NEW test file `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-re-verify-tool.test.js` as a hard requirement in Phase 03 (not conditional). Add it to the Phase 03 verification protocol. Without this, Phase 03 ships an untested behavioral change.

---

## Finding 11: `meta-260714T1248Z` reference claim is unverifiable
- **Severity:** Low
- **Location:** Plan.md line 171
- **Flaw:** Plan claims "Related finding (separate, not closed by this plan): `meta-260714T1248Z-the-rule-entry-pattern-field-is-validated-as-z-string-with-n`". A `grep` for this id in the registry was not run as part of this review (it's a registry record, not source code), so the claim is unverified. The format (`meta-YYYYMMDDTHHMMZ-slug`) matches other finding ids seen in this codebase, but the slug's truncation (`with-n`) suggests an unspecified trailing text was elided.
- **Failure scenario:** Minimal — the claim is informational ("reference for pattern alignment only"), not load-bearing. If the id doesn't exist, no plan impact.
- **Evidence:** Not directly verified; the id is a registry record, not a source file symbol.
- **Suggested fix:** Verify by querying `meta_state_list({ id: ["meta-260714T1248Z-..."] })` before sending; drop the reference if it doesn't exist.

---

## Finding 12: Plan asserts `computeCurrentHashes` is the only fs-reading helper in `core/stale-view.js` — claim is correct but the purity boundary is fragile
- **Severity:** Low
- **Location:** Plan.md claim 1 (lines 16-17); Phase 01 lines 22-23, 79
- **Flaw:** Plan claims "Purity constraint preserved: isStaleView stays pure (no fs reads). computeCurrentHashes is impure but isolated." Verified: today `core/stale-view.js` has no `node:fs`/`node:crypto` imports (only `canonicalIndexKey` from `./meta-state.js` and `STALENESS_WINDOW_MS`/`isOpen` from `./constants.js`). The proposed change adds `node:path` and `computeFileHash` from `./check-grounding.js`. The plan acknowledges this is a "core→core" dependency that breaks the existing `isStaleView` purity contract (Phase 01 Risk Assessment lines 204-207). The fragility: the contract that `core/stale-view.js` is fs-free is no longer enforced — `computeCurrentHashes` is exported from the same module, and any future caller could import the impure helper accidentally. The plan does not propose a separate `core/stale-view-hash.js` or similar boundary to enforce purity.
- **Failure scenario:** Future contributor writes a new helper in `core/stale-view.js` that imports from `check-grounding.js` for convenience, blurring the purity boundary. `isStaleView` itself remains pure, but the module as a whole is no longer fs-free.
- **Evidence:** `tools/learning-loop-mastra/core/stale-view.js:1-29` (current imports) shows no fs imports. Plan adds `computeFileHash` (transitive fs reader) to the same module.
- **Suggested fix:** Put `computeCurrentHashes` in a new file (`core/stale-view-hashes.js` or similar) to keep the purity boundary enforceable. The plan already mentions this as a fallback for circular-dep audit ("If a circular-dep audit later flags this, extract computeFileHash into a core/hasher.js shared lib") — but the purity argument is independent of the circular-dep argument and should be addressed now.

---

## Summary Table

| # | Severity | Phase | Finding |
|---|---|---|---|
| 1 | High | Plan + Phase 03 | `meta_state_query_drift` returns no per-entry `drifted:false` |
| 2 | High | Phase 03 | `upsertFileIndexEntry` before `applyUpdateAndCheck` causes index/entry skew on CAS conflict |
| 3 | High | Phase 01 + 03 | `computeFileHash` only throws `FileNotFoundError` on missing; EACCES/EISDIR/etc. propagate uncaught |
| 4 | Medium | Plan + Phase 01 | Test count claim (14) contradicts actual file (15 existing tests) |
| 5 | Medium | Phase 02 | 5 consumer tests don't actually need expectation updates |
| 6 | Medium | Phase 02 | `computeDanglingRefs` signature change unstated; `resolveDanglingRefs` caller not in plan |
| 7 | Medium | Phase 03 | Cold-tier cap precompute is "likely ~0" — no measurement procedure, set-to-2 placeholder |
| 8 | Medium | Phase 02 | `buildStaleDispatchHints` left age-only but listed in test-update list — internal inconsistency |
| 9 | Medium | Phase 03 | `upsertFileIndexEntry` returns `false` on rejection — not caught by try/catch |
| 10 | Medium | Phase 03 | No existing test file for `meta_state_re_verify`; Phase 03 ships untested behavior |
| 11 | Low | Plan | `meta-260714T1248Z` reference not verifiable |
| 12 | Low | Phase 01 | Purity boundary of `core/stale-view.js` eroded by `computeCurrentHashes` import |

## Unresolved Questions for the Planner

1. **Is `meta_state_query_drift`'s return shape sufficient** to verify "drift cleared after re-verify"? If not, what alternate verification path should criterion 6 use? (See Finding 1.)
2. **Is CAS-safe re-verify + index refresh actually achievable** with the current `upsertFileIndexEntry` contract (no version check)? Or does re-verify need to bundle the version into the hash write? (See Finding 2.)
3. **Is `computeCurrentHashes`'s silent catch on non-`FileNotFoundError` errors the intended behavior** for Phase 01's helper, or should those errors propagate? (See Finding 3.)
4. **What happens to the cold-tier cap** if a single drift regression lands and immediately exceeds the cap=2 placeholder? Is the cap a single-trip or should it have explicit headroom? (See Finding 7.)
5. **Should `loop-introspect.js#buildStaleDispatchHints` also wire `{ fileIndex, codeHashes }`** to stay consistent with `meta_state_sweep`'s corrected view? (See Finding 8.)

## Recommended Priority

1. **Block Phase 03** until Finding 2 (CAS ordering) is fixed — this ships a real concurrency regression.
2. **Reword criterion 6** to use a verifiable API surface (Finding 1).
3. **Add EACCES-specific handling** to `computeCurrentHashes` (Finding 3).
4. **Remove or scope-down Step 2.4** test-update list (Finding 5) — it overstates risk.
5. **Add a hard requirement** for `meta-state-re-verify-tool.test.js` (Finding 10) before Phase 03 can be considered complete.
