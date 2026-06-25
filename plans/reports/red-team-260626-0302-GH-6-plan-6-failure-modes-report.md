# Red-Team Review — Phase E Plan 6 (Mastra shell restructure)

**Date:** 2026-06-26
**Plan:** `plans/260626-0302-phase-e-shell-restructure/plan.md`
**Reviewer:** Failure Mode Analyst
**Status:** DONE_WITH_CONCERNS — 6 critical findings, 8 high, 6 medium
**Reviewer verdict:** The plan ships with three load-bearing assumptions that are not true in the current codebase. The mechanical move is sound; the cross-cutting ref-update strategy and Phase 1 regression guards have multiple breakages that will fail CI post-merge unless corrected.

---

## Summary

The 5-phase TDD structure (BaselineAndTests → InternalMove → ExternalRefUpdate → ContractUpdate → VerifyAndChangeLog) mirrors Plan 1 and Plan 2 patterns, and the atomic-commit decision (D1) is correct. However, audit found three categories of failure:

1. **Plan 6's claim "no internal imports change" is false** for four test files in `__tests__/` that use `../workflows/...` and `../agents/...` relative imports. After `git mv workflows/` and `git mv agents/`, these imports break. Phase 2 does NOT update them; Phase 3's sed does NOT match them (no `tools/learning-loop-mastra/` substring in `../workflows/...`).

2. **Phase 1's `external-refs-updated.test.js` SEARCH_PATHS includes `docs/mcp-tool-schema-architecture.md`, but Phase 3's FILES list does NOT include it.** The sed won't update that file; the test will FAIL post-Phase 3. (Documented as Critical F1.)

3. **Phase 1's `agents-md-layer-locations.test.js` asserts `!shellLayerSection[0].toLowerCase().includes("(top level)")`. The prose says "Lives at `tools/learning-loop-mastra/` (top level):" — the sed replaces the path but does NOT remove the "(top level)" prose.** Test fails.

The plan is salvageable but needs 4–5 corrections before shipping. Estimated 1–2 hours of edit work on Phase 1–3; Phase 4–5 are unaffected.

---

## Critical Findings (must fix before plan ships)

### F1 — Phase 1 SEARCH_PATHS includes `docs/mcp-tool-schema-architecture.md`; Phase 3 FILES does NOT

**Severity:** Critical (Phase 1 test will fail post-Phase 3)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-01-baselineandtests.md:223` — SEARCH_PATHS contains `"docs/mcp-tool-schema-architecture.md"`
- `plans/260626-0302-phase-e-shell-restructure/phase-03-externalrefupdate.md:89-119` — FILES array does NOT include `docs/mcp-tool-schema-architecture.md`
- `docs/mcp-tool-schema-architecture.md:10,77,261,379-383` — file contains 5+ matches against the sed patterns (`tools/learning-loop-mastra/server.js`, `tools/learning-loop-mastra/schema-parity.js`, `tools/learning-loop-mastra/create-loop-tool.js`)

**Why it breaks:** Phase 1's `external-refs-updated.test.js` scans the SEARCH_PATHS list post-Phase 3 and asserts zero matches against the pre-move path patterns. Phase 3's sed only runs against the FILES array. Because `docs/mcp-tool-schema-architecture.md` is in SEARCH_PATHS but not in FILES, the test will find pre-move refs in that file and FAIL.

**Recommendation:** Add `docs/mcp-tool-schema-architecture.md` to Phase 3's FILES array (line 119, before the closing `)`).

---

### F2 — Plan claim "internal relative imports stay valid" is false; 4 test files break

**Severity:** Critical (Phase 2 commit breaks the suite)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-02-internalmove.md:13` — claim: "internal imports unchanged (relative paths preserved)"
- `plans/260626-0302-phase-e-shell-restructure/phase-02-internalmove.md:172-173` — pre-flight warning: "Phase 2 alone breaks the suite"
- `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js:25,46,64,77,89,110,128,143,160,176,190` — uses `await import("../workflows/workflow-*.js")` (11 imports)
- `tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js:15,45,65` — uses `await import("../agents/{intake,scout,self-improvement}-agent.js")` (3 imports)
- `tools/learning-loop-mastra/__tests__/agent-prompt-content.test.cjs:??` — uses `../agents/intake-agent.js` (3 imports per grep count)
- `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs:111,114` — uses `../workflows/workflow-storage-*.js` (2 imports)
- Plan 2's red-team finding F-pattern precedent: same class of error (relative import misses when dirs move).

**Why it breaks:** Test files live in `tools/learning-loop-mastra/__tests__/`. After Phase 2 moves `workflows/` and `agents/` to `tools/learning-loop-mastra/mastra/workflows/` and `tools/learning-loop-mastra/mastra/agents/`, the relative imports `../workflows/...` and `../agents/...` resolve to `tools/learning-loop-mastra/workflows/...` (no longer exists). They need to become `../mastra/workflows/...` and `../mastra/agents/...`.

**Recommendation:** Add a Phase 2 Step 1.5: bulk sed these 4 test files for `"\.\./workflows/` → `"../mastra/workflows/` and `"\.\./agents/` → `"../mastra/agents/`. Pattern matches `await import("../workflows/...")` and `require("../workflows/...")` constructs only — not comments or path strings.

---

### F3 — Plan 6's architecture diagram does NOT move `workflows-manifest.json` and `agents-manifest.json` with their dirs

**Severity:** Critical (manifest files end up at wrong location)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-02-internalmove.md:46,49,69,70` — diagrams claim manifests move WITH `workflows/` and `agents/`
- Actual layout: `tools/learning-loop-mastra/workflows-manifest.json` is at TOP level, NOT inside `workflows/`. Verified by `find tools/learning-loop-mastra/workflows -maxdepth 2` (10 .js files only, no manifest).
- Same for `tools/learning-loop-mastra/agents-manifest.json` (at top level, not in `agents/`).

**Why it breaks:** `git mv workflows/ mastra/workflows/` does NOT move `workflows-manifest.json` because it's a sibling, not a child. After Phase 2:
- `tools/learning-loop-mastra/workflows-manifest.json` stays at top level (now needs to be in `mastra/`)
- `tools/learning-loop-mastra/agents-manifest.json` stays at top level (now needs to be in `mastra/`)

**Recommendation:** Add to Phase 2 Step 1 (or as Step 2.5):
```bash
git mv tools/learning-loop-mastra/workflows-manifest.json tools/learning-loop-mastra/mastra/workflows-manifest.json
git mv tools/learning-loop-mastra/agents-manifest.json    tools/learning-loop-mastra/mastra/agents-manifest.json
```
Then update `shell-files-in-mastra-dir.test.js` EXPECTED_FILES to include both manifests (or extend the test to assert they're NOT at top level).

---

### F4 — `agents-md-layer-locations.test.js` fails: sed updates path, but "(top level)" prose stays

**Severity:** Critical (Phase 1 test will fail after Phase 3 sed)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-01-baselineandtests.md:265-269` — test asserts `!shellLayerSection[0].toLowerCase().includes("(top level)")`
- `AGENTS.md:20-22` (current text):
  > `- **Mastra shell (imperative).** Wraps core in Mastra framework primitives.`
  > `  Lives at \`tools/learning-loop-mastra/\` (top level): \`server.js\`,`
  > `  \`create-loop-{tool,workflow,agent}.js\`, \`workflows/\`, \`agents/\`, \`tools/\`.`
- Phase 3 sed pattern: `tools/learning-loop-mastra/server\.js` → `tools/learning-loop-mastra/mastra/server.js`. This replaces the path string, but NOT the prose "(top level)".

**Why it breaks:** Post-Phase 3, `AGENTS.md:21` reads:
> `  Lives at \`tools/learning-loop-mastra/mastra/\` (top level): \`server.js\`,`

The "(top level)" prose remains because sed does substring replacement on the path only, not the prose around it. The Phase 1 test fails.

**Recommendation:** Add a Phase 3 step BEFORE the sed: edit `AGENTS.md:21-22` to remove `(top level)` from prose:
- Change `Lives at \`tools/learning-loop-mastra/\` (top level): \`server.js\`,` to `Lives at \`tools/learning-loop-mastra/mastra/\`: \`server.js\`,`
- Then run the sed (which becomes a no-op for that line but updates the other path refs).

---

### F5 — `meta-state-fingerprints-repointed.test.js` only checks 2 paths but 9 entries may have more

**Severity:** Critical (Phase 5 batch op OVERWRITES `applies_to.schemas` for entry #6)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-01-baselineandtests.md:299-309` — REPOINTED_ENTRIES list has 9 IDs.
- `meta-state.jsonl:149` — entry `meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js` has `applies_to.schemas: ["tools/learning-loop-mcp/core/envelope-stripper.js", "tools/learning-loop-mcp/core/strict-boolean-guard.js", "tools/learning-loop-mastra/schema-parity.js"]`.
- `plans/260626-0302-phase-e-shell-restructure/phase-05-verifyandchangelog.md:122-129` — Phase 5 op for entry #6 sets `applies_to: { schemas: ["tools/learning-loop-mastra/mastra/schema-parity.js"] }`.

**Why it breaks:** The Phase 5 `meta_state_batch` op shape uses flat fields at op's top level (verified correct, see F6). `Object.assign(entries[idx], patch)` overwrites `applies_to.schemas` entirely — it does NOT merge the array. The op discards the other 2 schema refs (`envelope-stripper.js`, `strict-boolean-guard.js`) which point at `learning-loop-mcp/` (not moved, so they don't NEED updating). The semantic content is destroyed; the change-log now falsely claims only 1 schema was applied.

**Recommendation:** For entry #6, preserve the existing `applies_to.schemas` array and only update the `tools/learning-loop-mastra/schema-parity.js` element. Options:
- (a) Update the op to spread existing + new: `{...existing, applies_to: {...entry.applies_to, schemas: ["...envelope-stripper.js", "...strict-boolean-guard.js", "tools/learning-loop-mastra/mastra/schema-parity.js"]}}` — but this requires reading the entry first.
- (b) Split into 2 ops: first `meta_state_patch` to read+rewrite, then `meta_state_batch`.
- (c) Acknowledge: these 2 schema refs are in `learning-loop-mcp/` (not moved) and remain valid post-Plan-6; only the 3rd needs updating. Update the op to include all 3 entries in the array.

---

### F6 — Phase 1 baseline counts are wrong: 8 top-level `*.js` files, not 7

**Severity:** Critical (Phase 1 test pre-move-baseline count is off; tests against `storage.js` as well)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-01-baselineandtests.md:74-76` — pre-move-baseline.json claims `"top_level_js_files": 5` and `shell_files: [7 entries]`.
- Actual `find tools/learning-loop-mastra/ -maxdepth 1 -name "*.js" -type f`: 8 files (the 7 in the plan + `storage.js`).

**Why it breaks:** The plan correctly excludes `storage.js` from the move (D5). But Phase 1's `no-top-level-shell-files.test.js` uses `find -name "*.js"` — it WILL find `storage.js` post-move and FAIL because `storage.js` stays at top level.

**Recommendation:** Update the test to assert `find -name "*.js" ! -name "storage.js" ! -name "agent-manifest.json"` or use an explicit exclusion list:
```js
const result = execSync(
  `find ${SHELL_DIR} -maxdepth 1 \\( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \\) -type f 2>/dev/null || true`,
  { cwd: PROJECT_ROOT, encoding: "utf8" }
);
const ALLOWED_TOP_LEVEL = ["storage.js", "agent-manifest.json"];
const files = result.trim().split("\n").filter(Boolean).filter(f => !ALLOWED_TOP_LEVEL.some(a => f.endsWith("/" + a)));
```
Also fix pre-move-baseline.json to reflect actual count of 8 (or 7 minus storage.js if exclusion is applied).

---

## High Findings (should fix before plan ships)

### H1 — Phase 3 `FILES` list omits `docs/project-changelog.md` (current changelog, not historical journal)

**Severity:** High (documentation drift, not test failure)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `docs/project-changelog.md:12,116,132,134` — current changelog (entries dated 2026-06-25 and earlier) references `tools/learning-loop-mastra/server.js`.
- `plans/260626-0302-phase-e-shell-restructure/phase-03-externalrefupdate.md:89-119` — FILES list does NOT include `docs/project-changelog.md`.
- `plans/260626-0302-phase-e-shell-restructure/phase-01-baselineandtests.md:212-225` — SEARCH_PATHS also excludes `docs/project-changelog.md`.

**Why it matters:** This is a CURRENT changelog, not a historical journal (per R9, journals are excluded). The changelog will be left referencing an outdated path.

**Recommendation:** Add `docs/project-changelog.md` to BOTH the Phase 3 FILES list AND the Phase 1 SEARCH_PATHS list. (Or document that changelogs are intentionally left stale — but the plan should be explicit about this choice.)

---

### H2 — Phase 1 regression guard #1 doesn't cover `*.cjs` / `*.mjs` files at top level

**Severity:** High (silent regression if any `.cjs`/`.mjs` shell file is added)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-01-baselineandtests.md:113-118` — `find ${SHELL_DIR} -maxdepth 1 -name "*.js"` only matches `.js` files.
- Plan's design questions asked to verify `*.cjs` and `*.mjs` — but the implementation ignores them.

**Why it matters:** Currently zero top-level `*.cjs`/`*.mjs` files exist (verified), so the test passes today. But a future plan that adds a shell `*.cjs` (e.g., a legacy CJS adapter) would silently violate the invariant.

**Recommendation:** Widen the pattern: `find ${SHELL_DIR} -maxdepth 1 \( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \) -type f`. (The user explicitly asked this in Q1.)

---

### H3 — Plan 6 architecture diagram does NOT move JSON manifests with subdirs (same as F3 but for `agents-manifest.json`)

**Severity:** High (covered by F3 but worth flagging: the diagram shows `workflows-manifest.json` and `agents-manifest.json` "moves WITH workflows/ (per Plan 1 precedent)" but the actual filesystem has them at TOP level — see F3)
**Reviewer:** Failure Mode Analyst
**Evidence:** Same as F3.
**Recommendation:** Same as F3 — explicitly add `git mv` commands for both manifests.

---

### H4 — Phase 3 `FILES` does NOT include `__tests__/phase-e-shell-restructure/` self-reference (test_filter is fragile)

**Severity:** High (test could self-modify or sed could overwrite test fixtures)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-01-baselineandtests.md:237-239` — test filters `!line.includes("phase-e-shell-restructure/")` to allow intentional pre-move refs in self-doc.
- But Phase 3 FILES array does NOT include the test files themselves, so the sed never touches them. The filter is defensive only.

**Why it matters:** Not a current bug, but if a future iteration adds `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/` to FILES (e.g., to update the test fixture path references), the filter would silently exclude legitimate updates.

**Recommendation:** Keep the filter for now; add a comment in Phase 1 test explaining its purpose and intent.

---

### H5 — `tools/learning-loop-mastra/agents-manifest.json` referenced in MASTRA_AGENT_MODEL.md is NOT updated

**Severity:** High (documentation drift, runtime config drift)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `.claude/coordination/MASTRA_AGENT_MODEL.md:70` — `Agents manifest: \`tools/learning-loop-mastra/agents-manifest.json\` (Phase 3)`.
- After Phase 2 + F3 fix: file is at `tools/learning-loop-mastra/mastra/agents-manifest.json`.
- The sed doesn't match this path (basename is `agents-manifest.json`, not in the 7 sed patterns).
- Phase 3 FILES list does NOT include `MASTRA_AGENT_MODEL.md`.

**Recommendation:** Add to FILES list (if the path ref is to be preserved):
```bash
sed -i 's|tools/learning-loop-mastra/agents-manifest\.json|tools/learning-loop-mastra/mastra/agents-manifest.json|g' \
  .claude/coordination/MASTRA_AGENT_MODEL.md
```
Or add `agents-manifest.json` and `workflows-manifest.json` patterns to the bulk sed (8 patterns instead of 7).

---

### H6 — Phase 5 `meta_state_re_verify` for entry #9 assumes new fingerprint matches moved file; verify order

**Severity:** High (re-verify might fail because fingerprint is stale)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `meta-state.jsonl:150` — entry #9 has `code_fingerprint: sha256:a4921a94...` computed against `tools/learning-loop-mastra/create-loop-tool.js` (pre-move).
- `plans/260626-0302-phase-e-shell-restructure/phase-05-verifyandchangelog.md:201-203` — `meta_state_re_verify` is called AFTER the repoint updates `evidence_code_ref` to `tools/learning-loop-mastra/mastra/create-loop-tool.js`.
- Per `meta-state.js` re-verify semantics (verified at line 619-627): `checkExpiry` and `deriveStatus` use file hash. After `git mv`, file CONTENT is unchanged → hash is unchanged. So the fingerprint match should still hold.

**Why it might still break:** If `META_STATE_VERIFY_EXEC=1` env var is not set (per Plan 1 R-Phase6-B mitigation), `meta_state_re_verify` returns a `disabled` status without transitioning stale→active. Acceptance criterion (line 57) requires `status: active` post-Phase 5.

**Recommendation:** Add explicit precondition to Phase 5 Step 5: `if (!process.env.META_STATE_VERIFY_EXEC) { abort("Set META_STATE_VERIFY_EXEC=1 to enable stale→active transition") }`. Or document the operator step required to run the re-verify manually.

---

### H7 — `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js` references `tools/learning-loop-mastra/agent-manifest.json`

**Severity:** High (core runtime invariant broken if Phase 6 plan moves `agent-manifest.json`)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js:221,229,237,255` — uses `join(root, "tools/learning-loop-mastra/agent-manifest.json")` and string literals.
- `agent-manifest.json` is the LEGACY tool manifest, NOT moved by Plan 6 (per D5 and the file stays at top level).
- The sed patterns do NOT match `agent-manifest.json` (not in the 7 basenames). The references remain valid.

**Why it's a HIGH (not Critical):** Plan 6 doesn't move `agent-manifest.json`. But if a future plan moves it under `mastra/`, the runtime-agnostic check breaks at runtime (line 229's `manifestPath` resolves to a non-existent file).

**Recommendation:** Out of scope for Plan 6. Document in journal that `agent-manifest.json` is intentionally NOT under `mastra/` (per D5 rationale) and that any future move must update `core/runtime-agnostic-checklist.js`.

---

### H8 — Plan 6 comment says "Active globs (9)" — already out of date; runner has 12 GLOBs

**Severity:** High (header comment lies about runner state)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `tools/scripts/run-pnpm-test-namespaced.mjs:18` — comment says "Active globs (9)".
- Actual count at line 29-42: 12 active GLOBs (mcp-tests, mcp-core-tests, mcp-core, mcp-lib, mcp-tools, mastra-js, mastra-cjs, claude-coord-cjs, factory-cjs, phase-e-foundation, interface-regression-guards, interface-contract-tests).
- Plan 6 Phase 1 Step 2 says: update header "Active globs (9)" → "Active globs (13)" — but the correct current value is 12, and post-Plan-6 it should be 13.

**Recommendation:** Phase 1 Step 2 should change header to "Active globs (12). Plan 6 adds phase-e-shell-restructure (total 13)." Then add the 13th GLOB.

---

## Medium Findings

### M1 — `__tests__/phase-e-shell-restructure/` test files not yet created; plan must create them in Phase 1

**Severity:** Medium (Plan 1 TDD precedent — tests must be RED on baseline)
**Reviewer:** Failure Mode Analyst
**Evidence:** Plan's Phase 1 creates 5 test files but they don't exist yet. Operator should verify they run and FAIL as expected before Phase 2.
**Recommendation:** Add an explicit "Run all 5 tests; confirm 5/5 RED" gate to Phase 1 success criteria. Currently the plan says "most/all tests FAIL" — be precise.

---

### M2 — Plan 6 test counts "1189" baseline is unverified

**Severity:** Medium
**Reviewer:** Failure Mode Analyst
**Evidence:** Plan 6's acceptance criterion (line 54) says "Plan 1 baseline: ~1189 tests" — same unverified claim Plan 2's red-team finding A3 flagged. Plan 1's claim was 1189; Plan 2's actual count after adding 25 tests was 1222+ (per Plan 2 journal).
**Recommendation:** Run `pnpm test 2>&1 | tail -3` before Phase 1 to capture current count. Update acceptance criterion with the actual number, not "1189".

---

### M3 — Cold-cache delete target verified; `data/` is gitignored (not the cold cache)

**Severity:** Medium (confusion between `data/` LibSQL storage and `.cache/loop-describe-cold.json`)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `records/meta/.cache/loop-describe-cold.json` exists (verified via `ls`); `git check-ignore` returns exit 0 → git-ignored.
- `tools/learning-loop-mastra/data/mastra-memory.db` exists (1.6MB) and is also gitignored.
- Plan 6 Step 2 correctly targets the cold cache (not `data/`).
**Recommendation:** None — delete is safe. Document in the journal that the cold cache regenerates on next `loop_describe({tier: "cold"})` call.

---

### M4 — `__tests__/legacy-cleanup.test.cjs` may also have other path refs that the plan doesn't update

**Severity:** Medium
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `__tests__/legacy-cleanup.test.cjs:73` — reads `tools/learning-loop-mastra/agents/instructions/scout-agent.js` (already updated by Phase 2 Step 4 to `mastra/agents/instructions/...`).
- `__tests__/legacy-cleanup.test.cjs:74` — reads `tools/learning-loop-mastra/agents/run-scout-tool.js` (updated to `mastra/agents/...`).
- Plan 6 only updates lines 58-62 and 73-74. **Line 89 (referenced by Plan 1 red-team C4) is NOT in scope for Plan 6.** If line 89 references a pre-move path, the test will FAIL post-Phase 2.
**Recommendation:** Verify `__tests__/legacy-cleanup.test.cjs:89` doesn't contain pre-move paths during Phase 2 Step 4.

---

### M5 — Phase 5 `meta_state_log_change` operator-role gate not pre-verified

**Severity:** Medium (per Plan 2 red-team finding A8: tool is invocable via `self-improvement-agent.js`)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-05-verifyandchangelog.md:386` — risk R-Phase5-D: "`meta_state_log_change` is blocked by operator-role gate".
- Plan 2 red-team A8: tool invocable without operator-mode for ship-time use.
**Recommendation:** Verify `OPERATOR_MODE=1` is set before Phase 5 Step 10 (or document operator pre-flight per Plan 2 convention).

---

### M6 — `pnpm test` namespace coverage for `interface/runtimes-pass-contract.test.js`

**Severity:** Medium (regression guard may not be in the namespaced runner)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `plans/260626-0302-phase-e-shell-restructure/phase-04-contractupdate.md:75` — runs `node --test tools/learning-loop-mastra/__tests__/interface/*.test.js`.
- `tools/scripts/run-pnpm-test-namespaced.mjs:40-41` — only `interface-regression-guards` and `interface-contract-tests` GLOBs exist; neither matches `__tests__/interface/` directly.
**Recommendation:** Verify the namespace covers `__tests__/interface/` (or that Phase 4's manual `node --test` covers it).

---

### M7 — Plan 6's "26" external refs claim is approximate, not enumerated

**Severity:** Medium (plan says "~25 external refs"; risk R-Phase1-A flags dependency on accurate count)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- Plan 6 acceptance criteria + Phase 3: claim ~25 files.
- Actual scope of Phase 1 SEARCH_PATHS: 24 distinct paths (after dedup).
- Actual scope of Phase 3 FILES: 29 (with duplicates).
**Recommendation:** Capture exact count in `reports/pre-move-baseline.json` (already in plan § Step 1).

---

### M8 — Reversibility: `meta-state.jsonl` IS git-tracked, so `git revert` works

**Severity:** Medium (concern from Q8 mitigated)
**Reviewer:** Failure Mode Analyst
**Evidence:**
- `git ls-files meta-state.jsonl` returns exit 0 → tracked.
- `git check-ignore meta-state.jsonl` returns exit 1 → NOT ignored.
- `git check-ignore records/meta/.cache/loop-describe-cold.json` returns exit 0 → gitignored.
**Recommendation:** None — `git revert` correctly reverts both the meta-state.jsonl repoint AND the file moves. Cold-cache delete is NOT tracked so it survives revert (next cold-tier read regenerates with pre-move paths).

---

## Verification of plan claims

| Claim | Verified? | Notes |
|-------|-----------|-------|
| 7 shell files + 2 subdirs at top level | ✗ | 8 .js files (incl. `storage.js`); manifests at top level too (not inside subdirs) |
| `git mv` for dirs recursively renames contents | ✓ | Verified `git mv dir newdir/` works when target dir doesn't yet contain the basename |
| Internal relative imports stay valid | ✗ | False for `__tests__/{workflow,agent,storage}-*-parity.test.*` — see F2 |
| Phase 3 sed matches `interface/contract.js:94` literal | ✓ | Plain ASCII, no quote escaping needed |
| `meta_state_batch` op shape is flat fields | ✓ | Per Plan 1 red-team C6 + verified in `core/meta-state.js:557-568` |
| Storage.js comment "tools/learning-loop-mastra/storage.js" NOT updated | ✗ | It's just a comment; sed would update if pattern matched — but `storage.js` is NOT in the 7 sed basenames, so safe |
| 9 meta-state entries / 13 field updates | ~Partial | Entry #6 has 3 schema refs in `applies_to.schemas`; Phase 5 op OVERWRITES the array (see F5) |
| `meta-state.jsonl` not git-tracked (Q8 premise) | ✗ | IS git-tracked (verified) — `git revert` works fully |
| Cold-cache file is gitignored | ✓ | `git check-ignore` returns 0 |
| AGENTS.md §1.1 says shell lives at `mastra/` (post-Plan-6) | ✗ | Sed updates path string but NOT "(top level)" prose — see F4 |
| Plan 3 (housekeeping) parallel-safe | ✓ | Both touch `workflow-intentional-skip.js` mechanically but rebasable |
| Plan 4 (validation) depends on Plan 6 contract path | ✓ | Correctly documented in Dependencies section |
| 5 GLOBs (12 → 13) in runner | ✗ | Runner currently has 12 active GLOBs; header comment says "9" — see H8 |

---

## Unresolved questions for the plan author

1. **Q1:** Should `agent-manifest.json` (legacy top-level JSON) and `workflows-manifest.json` (legacy top-level JSON) move under `mastra/`? Current plan: NO for `agent-manifest.json` (D5), UNCLEAR for `workflows-manifest.json`. (My recommendation: YES — both belong with their workflow/agent dirs; see F3.)
2. **Q2:** Should the `phase-e-shell-restructure/` test directory match the Plan 1 / Plan 2 convention (`tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js`)? Plan 6 says YES — verified in test file paths.
3. **Q3:** Should the AGENTS.md path-invariant sentence include the regression test name verbatim (e.g., `enforced by tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js`)? Plan 6 says YES — but the test must exist before the sentence is added (otherwise it's a forward reference).
4. **Q4:** Should `docs/project-changelog.md` be updated to reflect Plan 6 in a new entry, or only the existing entries corrected to post-move paths? Plan 6 doesn't address this; current plan silently leaves stale path references in 4 changelog lines.
5. **Q5:** Should the 4 test files in `__tests__/` with `../workflows/` and `../agents/` relative imports be updated in Phase 2 (alongside the `git mv`) or in Phase 3 (alongside the bulk sed)? My recommendation: Phase 2 (mechanical fix tied to the move; Phase 3 is for sed-pattern updates).

---

## Recommendations

1. **Apply F1–F6 fixes to the plan files BEFORE shipping.** These are blockers — Phase 1 tests will fail or Phase 2 will break the suite.
2. **Apply H1–H8 high-severity fixes** where cheap. H8 (header comment) is a 1-line fix.
3. **The 4-test-file relative-import fix (F2) is the single biggest risk.** Without it, ~50+ tests in `__tests__/workflow-direct-parity.test.js`, `__tests__/agent-direct-parity.test.js`, `__tests__/agent-prompt-content.test.cjs`, `__tests__/storage-parity.test.cjs` will fail post-Phase 2.
4. **Consider splitting Phase 2 into 2a (move top-level JS + manifests) and 2b (move subdirs + fix relative test imports)** — the F2 fix is structurally separate from the move itself.
5. **Update `meta_state_log_change` payload** to include the `agent-manifest.json` and `workflows-manifest.json` moves (per F3) — currently they're absent from `change_diff.added`/`change_diff.removed`.

---

**Status:** DONE_WITH_CONCERNS
**Concerns/Blockers:** 6 critical findings (F1–F6) block the plan as written. 8 high findings (H1–H8) should fix before ship. Plan must be revised before shipping.