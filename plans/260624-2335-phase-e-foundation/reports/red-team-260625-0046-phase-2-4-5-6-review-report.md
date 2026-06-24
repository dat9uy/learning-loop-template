# Red-Team Review — Phase E Plan 1 (Foundation)

**Date:** 2026-06-25 00:46
**Plan:** `plans/260624-2335-phase-e-foundation/`
**Reviewers:** 3 hostile agents (Phase 2 / Phase 6 / Phases 3-4-5)
**Status:** DONE_WITH_CONCERNS — 5 critical findings, 12 high, 11 medium

---

## Critical Findings (must fix before plan ships)

### From Phase 2 reviewer (rename edge cases)

**C1. sed regex misses `./core/legacy/` imports.**
The plan's regex `(\.\./)*core/legacy/` requires at least one `../` segment. Verified: `create-loop-workflow.js:5` has `import { stripMcpContentEnvelope } from "./core/legacy/envelope-stripper.js";` — would NOT be updated by the sed. Production source breaks at runtime.
**Fix:** regex → `(\./|\.\./)*core/legacy/`

**C2. sed misses 16 `await import(...)` dynamic imports.**
Test files + workflows use dynamic imports (e.g., `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js:151`, `workflows/workflow-intake-orient.js:21`, `__tests__/legacy-mcp/runtime-agnostic.test.js:27`). The plan's grep filter `(from|require)` excludes these.
**Fix:** expand grep filter to `from|require|await\s+import|pathToFileURL`.

**C3. sed misses 17+ `pathToFileURL(join(..., "core/legacy/..."))` constructions.**
7+ test files construct paths via `join(projectRoot, "tools/learning-loop-mastra/core/legacy/...")`. Static `from/require` regex misses these.
**Fix:** sed must operate on the substring `core/legacy/` regardless of context (any path that contains it).

**C4. `__tests__/legacy-cleanup.test.cjs` asserts the OLD paths.**
Lines 59, 61, 62, 89 of `__tests__/legacy-cleanup.test.cjs` literally test for `importPath: "./core/legacy/envelope-stripper.js"` and `"tools/learning-loop-mastra/core/legacy/envelope-stripper.js"`. After the rename, this regression-guard test will FAIL ITSELF.
**Fix:** add a step that updates this test's expected paths (the test's PURPOSE is to lock the post-rename state — the paths in the test must match the new state).

**C5. Plan's find scope excludes `.claude/`, `.factory/`, `workflows/`, top-level `tools/learning-loop-mastra/`.**
Verified:
- `.factory/hooks/loop-surface-inject.cjs:34,120,123,205` — production runtime hook (Droid CLI)
- `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:159,211` — test fixture
- `.claude/coordination/hooks/README.md:84` — hook doc
- `tools/learning-loop-mastra/create-loop-workflow.js` (top level, not under any subdir)
- `tools/learning-loop-mastra/workflows/{workflow-intake-orient,workflow-intake-plan,workflow-self-improvement}.js` (workflows/ is NOT in the find's dir set)
**Fix:** expand find to `find tools/learning-loop-mastra/ .claude/ .factory/ -type f ...` (with appropriate exclusions).

---

### From Phase 6 reviewer (fingerprint batch)

**C6. `meta_state_batch` op shape is WRONG.**
The plan's pseudocode uses `{op: 'update', id: '...', patch: {evidence_code_ref: '...', code_fingerprint: '...'}}`. The actual op schema (verified in `core/legacy/meta-state.js:486-565`) is `passthrough()` — it does raw `Object.assign(entries[idx], patch)`. The `patch` wrapper is passthrough, so the entry ends up with a stray `patch` top-level field rather than a real patch.
**Fix:** use `{op: 'update', id: '...', evidence_code_ref: '...', code_fingerprint: '...'}` (flat fields, no wrapper).

**C7. Phase 6 must gate on Phase 2 completion.**
Verified: `core/legacy/` still exists (the rename hasn't happened). The `repoint-fingerprints.cjs` will fail with ENOENT at `computeFileHash(newPath)`. The plan's dependency graph already has Phase 6 → Phase 2, but the implementation steps don't ENFORCE the gate.
**Fix:** add an explicit pre-condition check at the top of Phase 6 (`if (!existsSync(newPath)) abort("Run Phase 2 first")`).

**C8. 7-finding list has lifecycle conflicts.**
- Finding #1 (`meta-260606T1830Z-...`): status=stale BUT has `resolved_at: 2026-06-08T01:11:42.524Z, resolved_by: auto-resolve` — schema doesn't model this combination (per `meta-260614T1236Z-...` finding).
- Findings #2-6: all `status=stale` — patching them is fine, but they need `meta_state_re_verify` to transition stale→active and stamp `last_verified_at`.
- Finding #7 (the constraint): `status=reported, code_fingerprint: null` — patching works (null→new_hash transition).
**Fix:** add `meta_state_re_verify` calls for the 6 stale findings AFTER the batch (gated on `META_STATE_VERIFY_EXEC=1` per the tool's contract).

**C9. Change-log must be filed BEFORE the batch.**
The plan files the audit entry AFTER the batch creates a window where the registry is mutated but no audit exists. Combined with the known silent-persistence-fail bug in `meta_state_log_change` (active finding `meta-260619T2233Z-...`), the audit trail is unreliable.
**Fix:** reverse the order — file `meta_state_log_change` first, then run the batch.

**C10. `meta_state_list({id: [...]})` requires FULL slugs.**
The plan uses truncated ids like `meta-260606T1830Z-context-pollution-...` for verification. Verified: `meta_state_list({id: ['meta-260606T1830Z-context-pollution-']})` returns 0 entries (the truncation is not honored).
**Fix:** use full slugs in all verification steps.

---

### From Phases 3-4-5 reviewer (doc discipline)

**C11. `core/legacy/schema-parity.js` is a PHANTOM PATH.**
The actual file lives at `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/schema-parity.js` (TOP LEVEL, not under `core/legacy/`). After Phase 2 rename, the doc's reference to `core/legacy/schema-parity.js` is broken (the path didn't exist before AND won't exist after).
**Fix:** reference `tools/learning-loop-mastra/schema-parity.js` (or `core/` if the file is meant to move — clarify with operator).

**C12. `core/legacy/schemas.js` is a RE-EXPORT, not a schema source.**
The actual schema source for the 4 meta-state kinds is `core/legacy/meta-state.js` (lines 56-225: `metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`). `schemas.js` is a tool-config re-export.
**Fix:** Phase 4's doc must cite `core/meta-state.js` (post-rename) as the schema source.

**C13. `core/legacy/schema-descriptions.yaml` is for PRODUCT SURFACE.**
Verified: the file documents `experiment`, `risk`, `decision`, `observation` record types — NOT the meta-state 4-kind union. The scope report's claim that this file is "stale schema doc to clean up in E.4" is incorrect (cleanup is in Plan 3, Housekeeping).
**Fix:** Phase 4's doc must NOT reference `schema-descriptions.yaml`. Cleanup is Plan 3's work.

**C14. "Finding schema has 5 fields" is wrong — has 30.**
The `metaStateFindingEntrySchema` defines 30 fields. A doc that documents 5 leaves 25 undocumented; readers will be confused.
**Fix:** Phase 4's doc must enumerate all 30 (or pick a curated subset and link to `core/meta-state.js` for the full list).

**C15. AGENTS.md "interface word collision" attack vector is based on a misread.**
Verified: `grep -in "interf" AGENTS.md` returns ZERO matches. The §2 "Protocol Adapter" doesn't contain "interface". The plan's R5 (Phase 5 risk assessment) flags this as a potential collision; the actual collision doesn't exist.
**Fix:** remove the "word collision" concern from Phase 5's risk table; KEEP the recommendation to add a one-line disambiguation in §1.1 between "Runtime interface" (the contract) and "Protocol Adapter" (the surface-hook protocol) — these are semantically distinct even if the word "interface" doesn't already appear.

---

## High Findings (should fix before plan ships)

### Phase 2

**H1. Plan numbers don't match codebase (123 files, not 126; 106 import-bearing, not 126).**
Verified: 123 files contain `core/legacy` substring in `tools/learning-loop-mastra/` + `AGENTS.md`. 106 of those contain `from`/`require` imports. Plan claims 126 files / 163 import statements — the 163 matches the import count but the 126 is wrong.

**H2. `tools/scripts/run-pnpm-test-namespaced.mjs` is outside find scope.**
Comment-only impact but the test runner itself references `core/legacy/` in a comment.

**H3. `records/meta/.cache/loop-describe-cold.json` has 11 stale `evidence_code_ref` references.**
Cache is git-ignored (per AGENTS.md §2 note 2026-06-22) but will surface stale data until regenerated. Add cache invalidation step.

**H4. `git mv` via `.tmp` two-step pattern is unnecessary.**
Verified: `tools/learning-loop-mastra/core/` contains only the `legacy/` subdir (no hidden files). Single `git mv tools/learning-loop-mastra/core/legacy tools/learning-loop-mastra/core` works. Two-step is defensive but adds noise.

### Phase 6

**H5. `meta_state_batch` silently bypasses the `IMMUTABLE_PATCH_FIELDS` deny-list for `code_fingerprint`.**
The O(N)-constraint finding's authority hinges on `code_fingerprint` being authoritative. The batch tool's `passthrough` op schema allows callers to set `code_fingerprint` directly without re-hashing the file. This is an undocumented backdoor that the plan silently exploits.
**Recommendation:** file a new `meta_state_report` finding about the bypass (separate from the rename work). The plan should NOT change the policy; it just exploits it.

**H6. Cold-tier regression test will NOT fail for the 7 repointed findings.**
Verified: `cold-tier-regression.test.js:83-89` EXEMPTS hash_mismatch on anchor-based refs (all 7 use anchors). The orphan invariant checks `existsSync` on stale findings — if the rename isn't done, the 6 stale findings trigger orphan test FAILURE. But if the rename IS done correctly, the test passes regardless of whether the repoint is correct.
**Fix:** add an explicit assertion that the 7 new paths exist (not just the orphan check).

**H7. 5 of 7 plan findings share identical `code_fingerprint: sha256:dcd915b8...`.**
They all point to `core/legacy/gate-logic.js`. After the rename, the new file's hash MUST be identical (git mv preserves content). The plan's R2 (Phase 6) says this without defending it.
**Fix:** add a verification step: compare OLD fingerprint (read from entry) against NEW hash of the legacy file BEFORE the rename; abort if they differ.

**H8. `repoint-fingerprints.cjs` location is wrong.**
Plan says `tools/learning-loop-mastra/scripts/` (Mastra runtime scripts). Should be in `plans/260624-2335-phase-e-foundation/scripts/` (plan-specific).

### Phases 3-4-5

**H9. FCIS test's dynamic-import regex is documented in risk but missing from implementation.**
Phase 3 R2 says "search for `import\(['"]@mastra` in the regex" but Step 2 only lists `from\s+['"]@mastra` and `require\(['"]@mastra`. Add the third regex to Step 2 explicitly.

**H10. Phase 4's "runtime-state schema source of truth" is not named.**
The plan says "the runtime-state.jsonl schema is defined elsewhere" without naming the file. The writer has to find it (or guess).
**Fix:** name the source (likely `core/legacy/runtime-state.js` or similar; needs scout).

**H11. Phase 5 §1.1 inserted as h3 BEFORE §1's h2.**
Markdown-legal (h3 before h2 is valid), but visually confusing — the subsection reads before the section's body.
**Fix:** explicitly state this is intentional in the plan (lead with the framing), OR move §1.1 to the END of §1 (after the meta-surface content).

**H12. Phase 5's diff sketch shows `-` lines for the "lives in one place" line.**
Risk R1 says "the diff must show only `+` lines, no `-` lines except inside updated sentences where the original is preserved" — but the diff sketch shows a `-` line. Internal inconsistency.
**Fix:** clarify the test contract — substring presence check (passes) vs. absence of `-` lines in diff (fails). The substring check is what should be tested.

---

## Medium Findings (worth noting)

- M1: 75 files in `__tests__/legacy-mcp/` contain `core/legacy` (plan says "60+")
- M2: `__tests__/legacy-cleanup.test.cjs` is BOTH a regression guard AND uses path-literal strings (sed won't update the string literals in test data — only the import statements outside string literals)
- M3: 16 dynamic imports + 7+ pathToFileURL constructions + 6 missing-from-find = ~30 broken references post-rename if plan ships as-is
- M4: Phase 3's `core-self-imports.test.js` is a 5th test not declared in Phase 1's baseline
- M5: Phase 4's doc test "OR" for `envelope-stripper`/`schema-parity` is too permissive
- M6: `meta-260618T0558Z-...` finding ID referenced in Phase 4 §5 needs verification
- M7: Phase 5 cross-link to `server.js` duplicates info from §2 (informational duplication)
- M8: Phase 3's `core/README.md` references a test file path that doesn't exist at READ-time (read before Phase 1 ships)
- M9: Race condition with parallel writers (out of scope for this plan but worth noting for future)
- M10: Phase 6 `change_target` is a directory; other change-logs use file paths (inconsistent convention)
- M11: Test count claim (1189) vs. resolved finding's count (978) — needs canonical source

---

## Verification of plan claims

| Claim | Verified? | Notes |
|-------|-----------|-------|
| FCIS holds today (0 @mastra imports in core/legacy) | ✓ | Static + dynamic + import() all 0 |
| 126 files / 163 import statements | ✗ | 123 files / 163 imports / 16 dynamic + 7+ pathToFileURL missed |
| 7 findings anchored to core/legacy/* | ✓ | 7 unique evidence_code_ref values |
| meta_state_batch cap=500, atomic, 1 lock + 1 cache invalidation | ✓ | Default cap 500, overridable |
| meta_state_batch can patch code_fingerprint | ✓ but undocumented bypass | code_fingerprint patchable via passthrough; no deny-list check |
| code_fingerprint re-hashing on refresh | ✗ | Plan uses patch, not refresh; hash provided by caller |
| cold-tier regression test detects the 7 repoints | ✗ | Test EXEMPTS anchor-based hash_mismatch |
| AGENTS.md uses "interface" word | ✗ | Zero matches |
| finding schema has 5 fields | ✗ | 30 fields |
| core/legacy/schema-parity.js exists | ✗ | File is at top-level schema-parity.js |
| core/legacy/schemas.js defines the 4 kinds | ✗ | It's a re-export; source is core/legacy/meta-state.js |

---

## Unresolved questions for the plan author

1. **Q1 (Phase 4):** Should `schema-parity.js` move under `core/` as part of Phase 1's rename, or stay at top level? The plan currently assumes it moves; the codebase has it at top level.
2. **Q2 (Phase 4):** What is the source-of-truth file for the runtime-state schema (the `runtime-state.jsonl` rows: `ledger-event`, `budget-state`)?
3. **Q3 (Phase 6):** Should `meta_state_re_verify` be triggered for the 6 stale findings post-repoint, or deferred to a separate plan?
4. **Q4 (Phase 2):** Is the `__tests__/legacy-cleanup.test.cjs` regression-guard's purpose to assert the OLD paths (and thus should be deleted/updated) or to assert the NEW paths (and should be left as a positive test)?
5. **Q5 (Plan-wide):** The red-team confirmed `meta_state_batch` bypasses the `code_fingerprint` immutability policy. Should Plan 1 file a NEW finding about this bypass (separate from the rename)?

---

## Recommendations

1. **Apply C1-C10 fixes to the plan files BEFORE shipping.**
2. **Apply H1-H12 high-severity findings where they're cheap.**
3. **The 30+ broken-reference count (M3) is the single biggest risk.** Without C1-C5 fixes, the rename will leave production in a broken state (Droid CLI runtime hook fails, workflows can't load, tests fail).
4. **Consider splitting Phase 2 into 2a (in-place imports) and 2b (cross-tree: .claude/, .factory/, records/)** if the find scope expansion makes the diff unreadable.

---

**Status:** DONE_WITH_CONCERNS
**Concerns/Blockers:** 5 critical findings (C1-C5 in Phase 2) block the rename. 5 more critical findings (C6-C15) block Phase 6 + doc phases. Plan must be revised before ship.
