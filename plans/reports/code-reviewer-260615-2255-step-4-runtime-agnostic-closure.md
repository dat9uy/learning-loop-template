# Code Review Report — Step 4 Runtime-Agnostic Closure

## Scope
- **Plan:** `plans/260615-2126-step-4-runtime-agnostic-rule-and-helper-extensions/`
- **Commits reviewed:** `a2498a0` (code), `c73706b` (docs), `ba1a920` (journal)
- **Base/head SHAs:** `9405351` → `ba1a920`
- **Net diff:** 1,291 insertions, 200 deletions across 36 files
- **Stage 1 (spec compliance):** PASS — every phase in the plan shipped
- **Stage 2 (code quality):** 3 Important, 6 Minor, 0 Critical

## Verification status

| Check | Result |
|---|---|
| `pnpm test` full suite | **982/983 pass, 0 fail, 1 skipped** (matches plan's 982/983 prediction) |
| New tests in this plan | **26 pass** across 6 test files (3 helper + 1 regression + 1 consult-checklist + 5 tool) |
| Affected-module tests (gate-decision-log, gate-override, gate-recurrence, gate-logic-quoted-strings, gate-promoted-rules, loop-describe-warm-tier, tool-deletion-coverage) | **160/160 pass** |
| F-1 behavioral regression confirmed by direct read of `9405351:core/gate-override.js:47-62` | ✅ |
| F-2 regex bypasses verified by probe | ✅ (9 bypass forms confirmed) |
| F-3 schema bypass verified by reading `meta-state.js:347-361` (writeEntry) and `loadPromotedRules` (no schema check on read) | ✅ |
| Concurrent write behavior | Not run; theoretical analysis (see F-4) |
| Agent prompt flow for `check_runtime_agnostic` | Not run; unit tests cover happy path |

## Critical (blocks ship)
None. No security regression, no data loss, no breaking API change for the exported surface.

## Important (fix before next plan)

### F-1: `readGateOverride` now shadows valid marker with expired one (behavioral regression)
- **File:** `tools/learning-loop-mcp/core/gate-override.js:49-66`
- **Confirmed:** old code at `9405351:core/gate-override.js:47-62` iterates `SURFACES` and calls `validateMarker(parsed)` per surface, `continue`-ing on invalid. New code calls `readFromAllSurfaces(root, OVERRIDE_FILE, { first: true })` (returns first PARSED, not first VALID) and validates once.
- **Concrete impact:** if `.claude/coordination/.gate-override` is expired but `.factory/coordination/.gate-override` is valid, the old code returned the `.factory` marker; the new code returns `null`. The override silently becomes ineffective in mixed-runtime scenarios.
- **Why tests miss it:** the existing test at `gate-override.test.js:85` ("first-valid-wins prefers .claude over .factory") writes BOTH markers with fresh `created_at`. The "expired on .claude, valid on .factory" case is untested.
- **Fix options (any one):**
  - (a) iterate manually in `readGateOverride` and call `validateMarker` per surface — matches original structure
  - (b) add a `valid` predicate option to `readFromAllSurfaces` and pass `validateMarker`
  - (c) accept the new contract ("first parsed wins") and document it explicitly in JSDoc + add a regression test pinning the new behavior
- **Recommended:** (a) — most surgical, preserves the documented "first-valid-wins" contract. Add a regression test "expired on .claude falls through to valid .factory".

### F-2: 6-item checklist regexes have multiple syntax bypasses
- **File:** `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:220-221` (cross-surface-iteration) and `:246-250` (parameterized-for-new-surfaces)
- **Bypasses verified by probe:**
  - `for (const x of [...SURFACES])` — spread iter, NOT caught
  - `SURFACES.forEach(s => ...)` / `SURFACES.map(s => ...)` — NOT caught
  - `for (const s in SURFACES) {}` — NOT caught
  - `while (i < SURFACES.length) {}` — NOT caught
  - `join(root, \`.claude/${file}\`)` — template literal, NOT caught
  - `join(root, [".claude", ".factory"][i])` — array literal, NOT caught
  - `path.resolve(root, ".claude", x)` — resolve, NOT caught
  - For parameterized: `from "surfaces.js"` (no leading dot, used in `__tests__/surfaces-*.test.js`), `await import(...)`, and the `#mcp/*` alias are not caught. (Current codebase does use `from "../core/surfaces.js"` in test files; the regex covers this case.)
- **False positives:** the `cross-surface-iteration` predicate flags any `.js`/`.cjs` file containing the regex match anywhere, including inside `//` comments and `/* */` blocks. The fix is to strip comments + string literals before regex testing.
- **Impact:** the checklist's job is to catch regressions, not to be a perfect lint. The current state is "lowest common denominator" — silent green on the 8 bypasses above. The agent (the rule's `enforcement`) and the regression test share the same regex, so both miss the same bypasses.
- **Fix options:**
  - Document explicitly in JSDoc: "lowest common denominator; the audit is best-effort, not exhaustive." Cheapest.
  - Strip block comments and string literals in `loadText` before regex testing (~10-20 LoC). Eliminates false positives.
  - Add the 8 syntaxes the codebase actually uses to the regex set so it grows with the code. Catches more bypasses over time.

### F-3: Rule entry written via direct file append, bypassing schema validation and operator gate
- **File:** `meta-state.jsonl` last line (`rule-runtime-agnostic-features`)
- **What's bypassed:**
  - `core/meta-state.js` `writeEntry` runs `metaStateEntrySchema.safeParse` before write. The direct append skips this. The rule shape is correct (verified by `gate-logic-consult-checklist.test.js:7-18` which round-trips through `metaStateRuleEntrySchema.parse`), so this is "validated by test, not by gate" — defense-in-depth weakened.
  - `tools/meta-state-promote-rule-tool.js:54-57` requires operator role + `category === "loop-anti-pattern"`. The rule's origin IS a loop-anti-pattern finding, so the tool path was available. Direct file append skips the role check and the audit trail.
- **Why it matters for future:** a future contributor adding a rule with a typo, missing `enforcement`, or invalid `pattern_type` would NOT be caught — `loadPromotedRules` does not call `metaStateEntrySchema.safeParse` on read; it just `JSON.parse`s. A malformed entry would silently be filtered from queries or crash `applyPromotedRules` on the pattern switch.
- **Fix options:**
  - (a) Re-issue the commit using `meta_state_promote_rule` and add a `meta_state_log_change` entry noting the manual add was promoted retroactively. Preserves audit trail.
  - (b) Add an opt-in schema validation step in `loadPromotedRules` that throws (or warns-and-skips) on malformed entries. Higher-leverage — closes the gap for all future direct writes.
- **Recommended:** (b) — addresses the systemic gap.

## Minor (note for follow-up)

### F-4: `readModifyWriteOnAllSurfaces` cross-surface consistency is best-effort (DOCUMENTED, not a bug)
- Header comment at `core/surfaces.js:151-158` documents "per-surface atomic, not cross-surface." The `gate-override.js#writeGateOverride` modifier merges `current.rule_ids` with the new `rule_id` per surface, so the invariant "rule_ids grows monotonically" is preserved under concurrent calls. `created_at` is reset to the call's timestamp on every call (same as the old code). No action needed.

### F-5: `err.message` from `appendFileSync` can leak the full attempted path on ENOENT
- `core/surfaces.js:91, 193, 208, 222` log `${err.message}` which on some Linux kernels includes the absolute path attempted (e.g., `ENOENT: no such file or directory, open '/home/user/...'`). The `subpath` is correctly stripped via `basename(path)`, but the OS-supplied error text may not be.
- **Fix:** log only `err.code` (path-free) or pre-strip the path from `err.message` before logging. ~5 LoC change.

### F-6: `readJsonlFromAllSurfaces` dedup key widened (intentional improvement)
- Old key: `ts::command_prefix::rule_id`. New key: `ts::command_prefix::rule_id::decision`. This is a SUBTLE BEHAVIORAL IMPROVEMENT — distinct decisions that share the first three fields no longer collapse. The new code's JSDoc at `core/surfaces.js:99-101` documents the rationale. The existing 982 tests pass, so no test was relying on the old collapsing. Worth a one-line changelog note.

### F-7: Cache invalidation race in `readGateOverride` (benign)
- `core/gate-override.js:130` invalidates the cache AFTER `readModifyWriteOnAllSurfaces` completes. A concurrent read between the write and the delete could cache a fresh result, then the delete evicts it, then the next read re-validates mtime/size and re-caches. Benign extra disk read. (mtime, size) tuple check at `:41-42` catches any true staleness. No action.

### F-8: `applyPromotedRules` consult-checklist branch is correct
- `core/gate-logic.js:740-745` short-circuits BEFORE the `enforcement !== "gate"` filter, so consult-checklist rules with `enforcement: "agent"` are correctly handled. Well-commented. No action.

### F-9: `listPromotedRules` includes `consult-checklist` rules in discoverability output
- `core/loop-introspect.js:185` filters out `resolution-evidence-required` but NOT `consult-checklist`. This is intentional — the rule is discoverable for agents to consult via `check_runtime_agnostic`. No action.

## Verified clean

- **Helper contracts match the 2 refactored call sites.** `gate-decision-log.js` uses `appendToAllSurfaces` and `readJsonlFromAllSurfaces`. `gate-override.js` uses `readFromAllSurfaces` (read) and `readModifyWriteOnAllSurfaces` (write). The `OVERRIDE_FILE` and `DECISION_LOG_FILE` paths are well-formed subpaths.
- **`writeGateOverride` preserves the "merge + dedup + refresh" contract** (`core/gate-override.js:111-125`): `current.rule_ids` is iterated with `if (!ruleIds.includes(id))` to dedup, new `rule_id` is appended if missing, and `ttl_seconds` + `operator_note` + `created_at` are refreshed to the latest call.
- **`resolveFeaturePath` is sound.** `resolve()` normalizes `..` segments before the containment check. Absolute paths rejected at line 15. Directories rejected at line 29. `#lib/resolve-root.js` further constrains the root to `tools/..` unless `GATE_ROOT` is set, so a malicious `feature_path` cannot escape the project root.
- **`SURFACES` is `Object.freeze`d** (`core/surfaces.js:5`). Verified by `runtime-agnostic.test.js:46-48`.
- **`metaStateRuleEntrySchema` extension to `consult-checklist`** is well-typed (`core/meta-state.js:169`) and the test in `gate-logic-consult-checklist.test.js:7-18` validates the round-trip.
- **`check_runtime_agnostic` is correctly registered** in both `agent-manifest.json` (group `runtime_agnostic`, line 80-85) and `tools/manifest.json` (referenced in the change-log).
- **No N+1 queries or unbounded loops.** `SURFACES` is bounded (2 today; design supports N). `readJsonlFromAllSurfaces` parses line-by-line.
- **`overrideCache` (mtime, size) tuple check** at `core/gate-override.js:41-42` catches any concurrent external write.
- **Tests cover:** all 6 checklist items pass on `surfaces.js` (the canonical exempt file), all 7 helpers exported, signature stability, no hand-rolled loops in `core/`, no hard-coded `join` paths in `core/`, shims in sync, manifest groups present, protocol adapter exports, `GLOB_SCOPE_WHITELIST` uses `SURFACES.map`.

## Recommended actions (priority order)

1. **F-1:** restore per-surface `validateMarker` in `readGateOverride` OR add a `valid` predicate option to `readFromAllSurfaces`. Add a regression test "expired on .claude falls through to valid .factory".
2. **F-3:** add a schema-validation step in `loadPromotedRules` (warn-and-skip on invalid) — addresses the systemic gap, not just this one rule.
3. **F-2:** document the regex as "best-effort, lowest common denominator" in `runtime-agnostic-checklist.js` JSDoc, AND add a `loadText` preprocessor that strips comments and string literals before testing.
4. **F-5:** strip the path from `err.message` in the 3 `console.error` calls in `surfaces.js` (or log `err.code` instead).
5. **F-6:** one-line changelog note about the dedup-key widening (intentional improvement).

## Unresolved questions

- Should `readGateOverride` retain per-surface validation (the old contract) or is "first parsed wins" the new contract? Design call.
- Should the new rule entry be re-issued via `meta_state_promote_rule` for audit-trail consistency, or is direct file append (with test-validated shape) acceptable for the meta-self-model?
- Should the checklist regexes be broadened to catch the 9 bypass syntaxes, or should "lowest common denominator + comment-documented" be the stated design?
- Should `loadPromotedRules` and `readRegistry` validate against the schema on read? Currently they don't.

**Status:** DONE_WITH_CONCERNS — 3 Important findings to address, no Critical blockers. Implementation is production-quality for the new helper API and the rule/tool wiring; the regressions and gaps are localized to the `readGateOverride` refactor and the audit-predicate regexes.
