# Rule pattern_type vocabulary realignment — shipped

**Date**: 2026-07-14 16:19
**Severity**: Medium (atomicity risk; silent-skip window if not deployed)
**Component**: rule registry schema, gate-logic, meta-state tool handlers, H6 ordering gate, lifecycle docs
**Status**: Shipped (atomic commit `83be7dfe` on `plan/rule-vocabulary-realignment`)

## What shipped

Schema rename + 9 record updates + tests + 2 test file renames + docs rewrite in one atomic commit (`83be7dfe14aeb98d90356ea4cb855d0e740f9f6f`). 24 files, +168/-163. 1880/1881 tests pass (1 pre-existing skip); 3 legitimate file-index fingerprint refreshes (loop-introspect.js, meta-state.js, loop-describe-tool.js).

## What changed

### Enum rename (`meta-state.js:281`, `docs/schemas.md`)

- `consult-checklist` → `agent-checklist`
- `resolution-evidence-required` → `determinism-checklist`

Final enum: `{regex, glob, agent-checklist, determinism-checklist}`. The `-checklist` family encodes the consumption axis (`agent-*` = state-2 agentic, `determinism-*` = state-3 deterministic), mirroring philosophy's agentic/deterministic split. Fixes the vocabulary collision: `agent-checklist` (state-2 agentic, agent reads in `loop_describe`) is now lexically distinct from `consult-gate` (state-3 deterministic block, L1 concept term in `docs/loop-engine.md`).

### Reclassifications (validation Q3 reversal of operator decision #2)

3 advisory rules moved from `regex`/`glob` → `agent-checklist` with JSON checklist bodies:

- `rule-short-slug-for-risk-records` (was `glob`)
- `rule-import-chain-analysis-after-tool-deletion` (was `regex`)
- `rule-assertinvariant-at-boundary` (was `regex`)

Eliminates source-report Inconsistency B (dead match specs — `applyPromotedRules` skips non-gate rules at `gate-logic.js:757`, so the regex/glob bodies never fired). Gate-enforcement behavior identical; agent-facing `loop_describe` body shape changes.

H6 ordering gate grew from 4 to 7 `agent-checklist` rules, requiring 3 new PROCESS_HINTS rows (rows 6, 7, 8). Each row mirrored byte-for-byte in `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS. Cold-session parity test (`__tests__/legacy-mcp/cold-session-discoverability.test.cjs:359-379`) passes.

### Enforcement relabel

`rule-no-orphaned-evidence` `enforcement: agent → gate` — no behavior change (it already hard-blocks `meta_state_resolve` at `:89,100`). Restores `enforcement=gate ↔ state-3` uniformly. The single `agent`-labelled rule that hard-blocked contradicted `AGENTS.md:65` ("agent = consult").

### Other touches

- Dead `consult-checklist` key deleted from `core/patterns.json` (F14 — `gate-logic.js:28-32` builds regex from prose description; no consumer uses it; rename would perpetuate the confusion).
- 2 test files renamed where filename literal matched the renamed enum: `gate-logic-consult-checklist.test.js → gate-logic-agent-checklist.test.js`; `gate-resolution-evidence.test.js → gate-determinism-checklist.test.js`. Dropped the 3 role-naming renames (validation Q2 — vitest uses glob discovery; cosmetics add zero test value).
- `docs/meta-state-lifecycle.md` rewritten: vocabulary axis note + loop-design/change-log terms (phase 6) + finding-status lifecycle collapsed to `{open, resolved, superseded}` (phase 7, post-migration model).

## Why atomicity is load-bearing

`loadPromotedRules` (`gate-logic.js:587`) validates each rule with `metaStateRuleEntrySchema.safeParse` and **warn-and-skips** on enum mismatch. A split commit (Phase 1 + Phase 2 in separate commits) creates a window where the registry's `consult-checklist` strings are silently dropped against the new schema. `readRegistry` is a lenient `JSON.parse` (no validation on read), so the only strict path is `loadPromotedRules` + writes. Atomic commit honored: schema + 9 records + tests + docs in one commit.

## Deploy step REQUIRED (plan §5.5b)

Atomic git commit is **not sufficient**. The per-process `promotedRulesCache` (`gate-logic.js:546`, keyed on `mtime + size`) does NOT refresh on git commit — it holds the old `=== "consult-checklist"` literals in module memory. Live sessions calling `meta_state_resolve` continue to run OLD code's compare against NEW registry's `agent-checklist` values and **silently skip** all 6 renamed rules.

**Action:** restart the MCP server (or call `invalidateCache(root)` from a kill/restart cycle) before declaring the rename live.

**Verify:** `loop_describe({tier:"warm"}).rule_count === 9` + `warnings: []` across the restart boundary. (Final distribution: 7 `agent-checklist` + 2 `determinism-checklist` + 2 `regex` (gate-enforced) + 0 `glob` = 11 total registry; but `loop-introspect.js:477` filters the 2 `determinism-checklist` from the warm tier → `rule_count === 9`.)

## Forward-reference for `meta-260714T1334Z` resolver

Out of scope for this plan. The eventual resolver (later session) MUST use `pattern_type: "agent-checklist"` (or `determinism-checklist` for resolve-gate rules) — the schema now rejects `consult-checklist` and `resolution-evidence-required`. Stale journal text at `docs/journals/2026-06-15-step-4-runtime-agnostic-rule-closure.md:22` misinforms future resolvers with the old enum value. **This journal entry is the rename-time pointer.**

## Lessons

- **Atomicity claim needs per-deployment-step verification, not aggregate confidence.** The git commit was atomic; the *process state* was not. Live `promotedRulesCache` silently retains old code's literals. Red-team Finding 13 caught this; the deploy step is the load-bearing follow-through.
- **Vocabulary collisions compound across state axes.** `consult-checklist` (state-2) and `consult-gate` (state-3) shared the `consult-` prefix; an agent reading `loop_describe` output had no lexical signal which axis a rule consumed. Renaming to `-checklist` + prefix-per-axis makes the consumption axis read off the prefix.
- **Dead match specs are a smell, not a feature.** The 3 `agent + regex/glob` advisory rules had `pattern` bodies that never fired (skipped at `gate-logic.js:757`). Operator decision #2 kept the "match-shape" signal; validation Q3 reversed it. Lesson: dead spec language is a YAGNI violation dressed as semantic precision.
- **N-of-N test-file migrations should pass a discovery check first.** Phase 3's plan renamed 5 files; validation Q2 dropped 3 (vitest glob discovery makes path-safe renames zero-test-value). Saved 3 `git mv` + 3 safety-greps.

## Verification

- `pnpm test`: 1880/1881 pass (1 pre-existing skip). 0 regressions attributable to this commit.
- `pnpm fallow:gate`: clean.
- Pre-commit ran with no `--no-verify`.
- Branch `plan/rule-vocabulary-realignment`; not pushed yet.

## Next steps

1. **Restart MCP server before declaring rename live.** Required by plan §5.5b. Verify `rule_count === 9` + `warnings: []` across the restart boundary.
2. **Push the branch and open the PR.** Commit `83be7dfe` is local-only.
3. **File follow-up plan for `meta-260714T1334Z`** (the test-parse consult-checklist rule + PROCESS_HINTS row). The resolver must use `pattern_type: "agent-checklist"`; this journal entry is the rename-time pointer.
4. **File follow-up hardening plan for `rule.pattern` schema validation.** `z.string()` at `meta-state.js:282` has no JSON-shape refinement; direct-write to `meta-state.jsonl` could inject arbitrary prose into the agent checklist body. Recommended: `pattern: z.string().refine((v) => safeParseChecklistBody(v))` or hash-pinned canonical body for `pattern_type === "agent-checklist"`.

## Unresolved

- None blocking. The 4 follow-ups above are non-blocking but load-bearing for the rename's full safety story.

---

## Follow-up: predicate key mismatch (post-deploy verification)

**Date**: 2026-07-14 17:50
**Component**: `tools/learning-loop-mastra/core/gate-logic.js#projectHasLearningLoopMcp`
**Finding**: `meta-260714T1630Z-the-projecthaslearningloopmcp-predicate-in-tools-learning-lo` (resolved)
**Status**: Fixed and verified

### Symptom

Post-restart, `loop_describe({tier:"warm"}).rule_count` returned `6` instead of the predicted `9`. Three rules with `scope_predicate: "project_has_learning_loop_mcp"` were silently filtered from `loadPromotedRules`:

- `rule-project-skill-boundary` (gate/glob) — critical consult-gate for cross-project `ck:use-mcp`/`ck:find-skills` invocations
- `rule-import-chain-analysis-after-tool-deletion` (agent/agent-checklist)
- `rule-pr-body-registry-deltas` (agent/agent-checklist)

### Root cause

`core/gate-logic.js:539` predicate checked `.mcp.json` server keys `"learning-loop-mcp"` or `"learning-loop-mastra"` — neither matched the project's actual key `"learning-loop"` (the canonical id declared by `server.js:234-246`). Key literals were stale; the rename history (`e28077c` → `learning-loop-mcp`, `f9e4653` → `learning-loop-mastra`, `b458f1b` → `learning-loop`) updated the predicate for the first two transitions but not the third.

The bug pre-dated this plan; the deploy verification surfaced it by reading `rule_count === 9` (predicted by §5.4b). Without that prediction, the 3-rule gap would have remained invisible.

### Fix

- `tools/learning-loop-mastra/core/gate-logic.js:539-545` — added `"learning-loop"` as third accepted literal; kept the two legacy keys for backward-compat with downstream projects/templates that may still use them.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-scope-predicate.test.js` — added 2 new tests covering the canonical `"learning-loop"` key and the legacy `"learning-loop-mastra"` key. Closes the test-coverage gap that allowed the regression.

### Verification

- Predicate: `node -e "import('./tools/learning-loop-mastra/core/gate-logic.js').then(m => console.log(m.projectHasLearningLoopMcp('.')))"` → `true` (was `false`)
- `loadPromotedRules('.')` returns 11 rules (was 8; 3 previously-filtered now present)
- 99/99 tests pass across blast radius: 15 predicate + 44 rule-schema/relationships + 40 gate-logic core
- 0 regressions
- Finding `meta-260714T1630Z-...` resolved via `meta_state_resolve` after file-index refresh

### Side-condition encountered

`meta_state_resolve` initially blocked by `rule-no-orphaned-evidence` consult-gate: 2 pre-existing findings (`meta-260615T1148Z-...` GLOB_SCOPE_WHITELIST, `meta-260615T1920Z-...` stripNodeEvalBody) anchor to `core/gate-logic.js` with stale fingerprints (last verified `2026-06-26T07:35:50Z`). Resolution path: `meta_state_refresh_file_index({path: "tools/learning-loop-mastra/core/gate-logic.js"})` → re-grounded 3 anchored findings → resolve unblocked.

### Lessons

- **Predict-and-verify catches pre-existing bugs.** The `rule_count === 9` acceptance criterion was the load-bearing signal; without it, the predicate bug would have remained invisible. Future plan acceptance criteria should include expected counts wherever they are derivable, not just behavioral checks.
- **Predicate literals drift silently.** When a project's `.mcp.json` key is renamed, the predicate's hard-coded string literals drift. Recommended hardening (file as follow-up): expose a single `LEARNING_LOOP_SERVER_KEY` constant from `server.js` and import it in `gate-logic.js`; eliminates the two-places-to-update failure mode.
- **Test coverage gaps hide regressions.** The pre-existing test (`gate-scope-predicate.test.js:92`) only exercised the `"learning-loop-mcp"` key; no test for the actual canonical key. The 2 new tests now cover canonical + legacy `learning-loop-mastra` keys; the legacy `"learning-loop-mcp"` test pre-existed and is preserved for backward-compat coverage.
- **Grep audit found no copy-pasted consumers.** Only the predicate itself reads `.mcp.json` server keys in production source. (`scout/pipeline/run-scout.js:107,137,331` references `tools/learning-loop-mcp/...` as directory paths, not MCP server keys — different bug class, flagged as dead-code follow-up but out of scope here.)

### Unresolved follow-ups

- The 2 pre-existing orphans (`meta-260615T1148Z-...`, `meta-260615T1920Z-...`) remain **open** with refreshed fingerprints. They will continue to block any future resolve of `gate-logic.js`-anchored findings until separately addressed.
- `scout/pipeline/run-scout.js:107,137,331` dead-code paths to old package directory — separate cleanup plan.
- `LEARNING_LOOP_SERVER_KEY` constant extraction — separate hardening plan.
