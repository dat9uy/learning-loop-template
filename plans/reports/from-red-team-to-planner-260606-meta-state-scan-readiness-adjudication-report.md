# Red Team Adjudication — 260606-meta-state-scan-readiness-refactor

**Date:** 2026-06-06
**Reviewers:** 4 (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic)
**Findings submitted:** 41
**After deduplication:** 15
**Disposition:** 15 Accept, 0 Reject

---

## Findings Summary

| # | Title | Severity | Lens | Disposition |
|---|-------|----------|------|-------------|
| 1 | `writeEntry` is append-only — using it for updates in Phase 1 & 5 duplicates entries | Critical | Security Adversary | **Accept** |
| 2 | Registry has 53 entries, not 51 — all counts/percentages wrong | Critical | All 4 | **Accept** |
| 3 | `server.js` auto-discovers tools — no per-tool registration needed | Critical | Scope & Complexity Critic | **Accept** |
| 4 | `.cjs` regression harness invisible to `npm test` runner | Critical | Assumption Destroyer | **Accept** |
| 5 | Phase 6 cold-tier default `summary` is a silent breaking change | Critical | Failure Mode Analyst | **Accept** |
| 6 | `derive_status` does NOT depend on `mechanism_check` — only `checkGrounding` does | High | Security Adversary | **Accept** |
| 7 | `meta_state_query_drift` skips terminal statuses — success criterion unachievable | High | Failure Mode Analyst | **Accept** |
| 8 | Backfill coverage is 15/16, not 10-12 — both `evidence_code_ref` + `evidence.code_ref` needed | High | Scope & Complexity Critic | **Accept** |
| 9 | Warm-tier `registry_summary` needs full `readRegistry` — warm tier only loads subsets | High | Assumption Destroyer | **Accept** |
| 10 | `meta_state_list` default returns 34 entries (includes superseded), not 27 | High | Assumption Destroyer | **Accept** |
| 11 | Test baseline is 433, not 580+ | High | Failure Mode Analyst | **Accept** |
| 12 | `summarize` code sketch uses `refs` — field does not exist in schema | High | Assumption Destroyer | **Accept** |
| 13 | Migration scripts emit change-log unconditionally — contradicts idempotency claims | Medium | Security Adversary | **Accept** |
| 14 | `promoted_to_rule` object branch is dead code — only strings exist in registry | Medium | Failure Mode Analyst | **Accept** |
| 15 | Phase 5 backfill duplicates existing `meta_state_refresh_fingerprint` tool | Medium | Scope & Complexity Critic | **Accept** |

---

## Detailed Findings

### Finding 1: `writeEntry` append-only bug — updates duplicate entries
**Severity:** Critical
**Reviewer:** Security Adversary
**Location:** Phase 2 (Refactor #1), Phase 5 (Refactor #5), Architecture sections
**Flaw:** Both migration scripts specify `writeEntry(root, mutated_entry)` to update existing entries. `writeEntry` in `core/meta-state.js:196-207` atomically **appends** a new line to the JSONL; it does not search for existing IDs or replace in place.
**Failure scenario:** Running the Phase 1 script once appends 2 new loop-design entries with duplicate IDs. `readRegistry` then returns 55 entries instead of 53. The Phase 5 script appends 8 more duplicates. Downstream tools like `meta_state_relationships` use `findEntryById` which returns the first match, silently surfacing stale data.
**Evidence:** `core/meta-state.js:196-207` (`writeEntry` appends with no ID lookup); `core/meta-state.js:216-220` (`updateEntry` is the correct CAS-patched update function that finds by ID and replaces).
**Disposition:** Accept
**Rationale:** This is a verified registry-corruption bug. The plan must use `updateEntry` for both scripts.

---

### Finding 2: Registry has 53 entries, not 51
**Severity:** Critical
**Reviewer:** All 4 reviewers
**Location:** `plan.md` Overview, Outcome table, success criteria across all phases
**Flaw:** The plan repeatedly states "51 entries" and "29 findings". The actual `meta-state.jsonl` has 53 entries: 31 findings, 16 change-logs, 4 rules, 2 loop-designs.
**Failure scenario:** Every metric derived from 51 is wrong: compact-list size (~4KB should be ~4.2KB), non-terminal count (27 should be 29), mechanism_check coverage (3/51 = 6% should be 3/53 = 5.7%), orphan rate (25/29 = 86% should be 27/31 = 87%), cold-tier fixture size (~109KB should be ~118KB), token baseline (~27K should be ~30K).
**Evidence:** `wc -l /home/datguy/codingProjects/learning-loop-template/meta-state.jsonl` → 53. `grep -c '"entry_kind":"finding"'` → 31. `grep -c '"entry_kind":"change-log"'` → 16. `grep -c '"entry_kind":"rule"'` → 4. `grep -c '"entry_kind":"loop-design"'` → 2.
**Disposition:** Accept
**Rationale:** All 4 reviewers independently verified this. The plan must update every count, percentage, and size estimate before implementation.

---

### Finding 3: `server.js` auto-discovers tools — no per-tool registration needed
**Severity:** Critical
**Reviewer:** Scope & Complexity Critic
**Location:** Phase 4 success criteria, implementation steps; `plan.md` line 236
**Flaw:** The plan states the new `meta_state_relationships` tool must be registered in both `tools/manifest.json` **and `tools/server.js`** ("1 line each"). The actual `server.js` dynamically loads every tool listed in `manifest.json` automatically; it has no per-tool registration code.
**Failure scenario:** The implementer will waste time searching for a non-existent registration hook in `server.js`. The plan's success criterion "registered in `tools/server.js`" is unverifiable.
**Evidence:** `tools/learning-loop-mcp/server.js:12-42`: `const TOOL_MODULES = loadManifest();` then iterates `for (const mod of TOOL_MODULES) { ... registerTool(server, imported[mod.export]); ... }`.
**Disposition:** Accept
**Rationale:** Verified. The plan must remove `server.js` references and state that only `manifest.json` needs a new line.

---

### Finding 4: `.cjs` regression harness invisible to `npm test` runner
**Severity:** Critical
**Reviewer:** Assumption Destroyer
**Location:** Phase 0, success criteria
**Flaw:** The plan creates `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.cjs`. The `package.json` test script is `"test": "node --test 'tools/**/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs'"`. The `tools/**/*.test.js` glob does **not** match `.cjs` files.
**Failure scenario:** The regression harness will never run in CI. The "all tests pass" success criterion is false because the harness is invisible to the runner.
**Evidence:** `package.json` test script. `find tools/learning-loop-mcp/__tests__ -name '*.test.cjs'` returns `cold-session-discoverability.test.cjs`, which is already present but NOT matched by the test script.
**Disposition:** Accept
**Rationale:** Verified. The harness must be renamed to `.test.js` (the package is `type: "module"`, so ESM `.js` is fine) or the `package.json` test script must be updated.

---

### Finding 5: Phase 6 cold-tier default `summary` is a silent breaking change
**Severity:** Critical
**Reviewer:** Failure Mode Analyst
**Location:** Phase 6, Architecture and Lock-in decisions
**Flaw:** The plan changes `loop_describe({ tier: 'cold' })` to default to `description_mode: 'summary'`. In summary mode, the field name changes from `description` to `description_preview` and the value is truncated to 200 chars. The plan claims "Existing callers see no diff" (Phase 2, Lock-in decision 2a), but this is false for cold-tier callers.
**Failure scenario:** Any existing tool, script, or agent that calls `loop_describe({ tier: 'cold' })` and expects `entry.description` to contain full text will receive a 200-char `description_preview` instead. The field name change itself breaks downstream parsers.
**Evidence:** `tools/learning-loop-mcp/tools/loop-describe-tool.js:73-94` currently returns `active_findings` with full `description` fields.
**Disposition:** Accept
**Rationale:** Verified. The plan must either (a) keep cold-tier default as `full` and require explicit `summary` opt-in, or (b) document this as a breaking change and provide a migration note for all known callers.

---

### Finding 6: `derive_status` does NOT depend on `mechanism_check`
**Severity:** High
**Reviewer:** Security Adversary
**Location:** Phase 5 / Refactor #5, Overview and Locked Decisions
**Flaw:** The plan claims "`meta_state_check_grounding` and `meta_state_derive_status` depend on `mechanism_check: true` to run." This is only half true. `meta_state_derive_status` (and its core function `deriveStatus`) does NOT reference `mechanism_check` at all. Only `checkGrounding` gates on `mechanism_check === true`.
**Failure scenario:** The backfill justification is based on the idea that making `mechanism_check: true` will enable both `derive_status` and `checkGrounding` for resolved findings. But `deriveStatus` runs unconditionally. The backfill is only needed for `checkGrounding`.
**Evidence:** `grep -n 'mechanism_check' tools/learning-loop-mcp/core/derive-status.js` → 0 lines. `grep -n 'mechanism_check' tools/learning-loop-mcp/core/check-grounding.js` → line 102: `if (entry.mechanism_check !== true) return { ... }`.
**Disposition:** Accept
**Rationale:** Verified. The plan must correct the justification in Refactor #5 to state that only `meta_state_check_grounding` / `checkGrounding` depends on `mechanism_check`. Remove `meta_state_derive_status` from the dependency claim.

---

### Finding 7: `meta_state_query_drift` skips terminal statuses — success criterion unachievable
**Severity:** High
**Reviewer:** Failure Mode Analyst
**Location:** Phase 5, Success Criteria and Step 8
**Flaw:** The plan claims "`meta_state_query_drift` count rises (some resolved findings now report drift between report-time code and current code)." But `queryDrift` explicitly skips terminal statuses.
**Failure scenario:** The success criterion is unachievable. After backfilling `mechanism_check: true` on resolved findings, running `meta_state_query_drift` will show zero additional drift events because `core/query-drift.js:77-78` filters `rawActive` to `status === "active" || status === "reported"` only. All 16 resolved findings are terminal; they are skipped.
**Evidence:** `core/query-drift.js:72-78`:
```js
const rawActive = entry.status === "active" || entry.status === "reported";
if (!rawActive) return false;
```
**Disposition:** Accept
**Rationale:** Verified. The plan must remove the success criterion about `meta_state_query_drift` count rising. If the intent is to drift-check resolved findings, the plan must first change `queryDrift` (or add a separate tool) to process terminal statuses — which is out of scope for this plan.

---

### Finding 8: Backfill coverage is 15/16, not 10-12
**Severity:** High
**Reviewer:** Scope & Complexity Critic
**Location:** Phase 5, Overview and Requirements
**Flaw:** The plan claims "10-12 of 16 resolved findings" have `evidence.code_ref` and targets "≥10 of 16 resolved findings have `mechanism_check=true`". The actual count is: 8 resolved findings have nested `evidence.code_ref`, 7 have top-level `evidence_code_ref`, 1 has neither. Total with code reference: 15.
**Failure scenario:** The backfill script, if it only checks `evidence.code_ref`, will cover only 8/16 (50%). If it checks both fields (matching the canonical `checkGrounding` fallback), it will cover 15/16 (94%). The plan's 10-12 range is wrong for either interpretation.
**Evidence:** `grep '"status":"resolved"' meta-state.jsonl | grep -c '"code_ref"'` → 8 (nested). `grep '"status":"resolved"' meta-state.jsonl | grep -c '"evidence_code_ref"'` → 7 (top-level). The canonical `checkGrounding` uses `entry.evidence_code_ref ?? entry.evidence?.code_ref` (`core/check-grounding.js:117`).
**Disposition:** Accept
**Rationale:** Verified. The plan must clarify that the backfill uses both `evidence_code_ref` and `evidence?.code_ref` (matching the canonical fallback). The target should be 15/16 (94%). The script should not be limited to `evidence.code_ref` only.

---

### Finding 9: Warm-tier `registry_summary` needs full `readRegistry` — warm tier only loads subsets
**Severity:** High
**Reviewer:** Assumption Destroyer
**Location:** Phase 7, Implementation Steps (step 8)
**Flaw:** The plan says `loop_describe({ tier: 'warm' })` returns a `registry_summary` field "computed inline, no file I/O". The `Counts` table requires counts across all kinds and statuses (e.g., 16 resolved findings). But the warm tier of `loop_describe` only loads `activeFindings`, `antiPatterns`, `promotedRules`, and `loopDesigns` — it never loads `change-log` entries, resolved findings, or expired entries.
**Failure scenario:** An implementer following the plan literally will add a `registry_summary` field that references undefined variables or produces incomplete counts (e.g., 0 resolved findings). To fix it, they will need to add a `readRegistry` call to the warm tier, increasing its token cost beyond the plan's assumptions.
**Evidence:** `tools/loop-describe-tool.js:46-71` (warm tier branch). It calls `listActiveFindings`, `listAntiPatterns`, `listPromotedRules`, `listLoopDesigns` — none return resolved/change-log/expired entries.
**Disposition:** Accept
**Rationale:** Verified. The plan must specify that the warm tier must call `readRegistry(root)` (or `readAllEntriesForLineage`) to obtain the full registry before computing `registry_summary`. The "no file I/O" claim is impossible.

---

### Finding 10: `meta_state_list` default returns 34 entries (includes superseded), not 27
**Severity:** High
**Reviewer:** Assumption Destroyer
**Location:** Phase 3 success criteria; Phase 6 risk assessment
**Flaw:** The plan states `meta_state_list({ compact: true })` (default `exclude_expired`) returns "the 27 non-terminal entries". The actual `meta-state-list-tool.js` defines `TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"])` — it does **not** include `"superseded"`. Therefore the default output includes `active` (23) + `reported` (6) + `superseded` (5) = 34 entries.
**Failure scenario:** The Phase 3 success criterion "returns 27 non-terminal entries" will fail. The Phase 6 risk assessment "warm tier is small (27 entries, ~5K tokens)" is conflating `meta_state_list` default with `loop_describe` warm tier, and both counts are wrong.
**Evidence:** `tools/meta-state-list-tool.js:11` → `const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);`. Actual non-terminal count: 34.
**Disposition:** Accept
**Rationale:** Verified. The plan must update the expected count to 34. It should also decide whether `superseded` should be excluded (if so, add it to `TERMINAL_STATUSES` as a code change in Phase 3).

---

### Finding 11: Test baseline is 433, not 580+
**Severity:** High
**Reviewer:** Failure Mode Analyst
**Location:** `plan.md` Success Criteria (final line)
**Flaw:** The plan claims "all existing tests still pass after the migration (the 580+ baseline from the sibling plans + 30-40 new from this plan)". The actual test count is 433 `test(` invocations.
**Failure scenario:** The plan's credibility is undermined by a significant factual error. The claim may mislead the operator into thinking the test suite is larger than it is.
**Evidence:** `grep -c 'test(' tools/learning-loop-mcp/__tests__/*.js` → 433 total.
**Disposition:** Accept
**Rationale:** Verified. Replace "580+" with "433".

---

### Finding 12: `summarize` code sketch uses `refs` — field does not exist in schema
**Severity:** High
**Reviewer:** Assumption Destroyer
**Location:** Phase 6 architecture; `summarize` function
**Flaw:** The plan's `summarize` code block shows: `{ id, entry_kind, status, refs, description_preview: ... }`. The test claims "preserves all relationship fields (id, kind, status, refs)". But `refs` is not a real field in the schema. The actual relationship fields are `origin`, `addresses`, `consolidated_into`, `supersedes`, `promoted_to_rule`, `proposed_design_for`.
**Failure scenario:** The test will fail because `summarize` only returns 4-5 keys, not the 6-8 ref keys the test expects.
**Evidence:** `core/meta-state.js` schema exports show the actual field names.
**Disposition:** Accept
**Rationale:** The plan must update the `summarize` code block to explicitly list each field: `id, entry_kind, status, origin, addresses, consolidated_into, supersedes, promoted_to_rule, proposed_design_for, description_preview`.

---

### Finding 13: Migration scripts emit change-log unconditionally — contradicts idempotency claims
**Severity:** Medium
**Reviewer:** Security Adversary
**Location:** Phase 1 success criteria; Phase 5 success criteria
**Flaw:** Both migration scripts claim idempotency ("running twice produces no changes", "snapshot before/after diff is empty on second run"). But both scripts explicitly emit a `change-log` entry on every run. A second run necessarily appends a new line to the JSONL.
**Failure scenario:** The TDD idempotency test will fail because the second run mutates the registry by appending a change-log entry. The implementer must either remove the change-log (violating audit) or rewrite the test.
**Evidence:** Phase 1: "emit a `change-log` entry documenting the fix." Phase 5: "each backfill run emits a NEW change-log entry (append-only)." Both contradict success criteria.
**Disposition:** Accept
**Rationale:** The plan must redefine idempotency as "entry mutations are idempotent; change-log emission is append-only by design." Update the idempotency tests to assert no existing entry IDs are duplicated, while allowing the new change-log line.

---

### Finding 14: `promoted_to_rule` object branch is dead code
**Severity:** Medium
**Reviewer:** Failure Mode Analyst
**Location:** Phase 4, Architecture code block
**Flaw:** The plan's `buildInverseIndexes` function includes defensive code: `typeof e.promoted_to_rule === "string" ? e.promoted_to_rule : e.promoted_to_rule.rule_id`. The sibling plan `260606-rule-loop-design-first-class` already migrated all `promoted_to_rule` payloads from objects to strings. The current registry shows only string values.
**Failure scenario:** The defensive branch is unreachable. It adds untested complexity and a 4th test case that exercises dead code.
**Evidence:** `grep -o '"promoted_to_rule":"[^"]*"' meta-state.jsonl` shows 5 occurrences, all strings. `grep '"promoted_to_rule":{' meta-state.jsonl` returns 0 matches.
**Disposition:** Accept
**Rationale:** Verified. Simplify `buildInverseIndexes` to use `e.promoted_to_rule` directly. Remove the corresponding test.

---

### Finding 15: Phase 5 backfill duplicates existing `meta_state_refresh_fingerprint` tool
**Severity:** Medium
**Reviewer:** Scope & Complexity Critic
**Location:** Phase 5, Implementation Steps and Architecture
**Flaw:** The plan spends 1 hour writing a new script that computes SHA-256 of `evidence.code_ref` and sets `code_fingerprint`. The tool `meta_state_refresh_fingerprint` already exists and does exactly this, including handling both `evidence.code_ref` and `evidence_code_ref` and erroring on missing files.
**Failure scenario:** The new script reinvents logic that already has tests, error handling, and gate-log integration. Any bug in the new script is a regression over the existing tool.
**Evidence:** `tools/meta-state-refresh-fingerprint-tool.js:14-104`: reads entry, resolves `evidence_code_ref ?? evidence?.code_ref`, calls `computeFileHash`, calls `updateEntry` with `code_fingerprint`. Already shipped and tested.
**Disposition:** Accept
**Rationale:** Verified. The plan should replace the custom backfill script with a loop that calls the existing `meta_state_refresh_fingerprint` handler over the 15 resolved findings with code references. Effort drops from 1h to ~15 minutes.

---

## Rejected Findings (not counted in the 15)

| # | Title | Reason for Rejection |
|---|-------|---------------------|
| R1 | Phase 1 script repeats direct-I/O anti-pattern | The script uses `core/meta-state.js#writeEntry` (now `updateEntry`), which is the canonical registry I/O function, not raw `fs.writeFileSync`. The finding `meta-260606T2102Z` was about agents using direct file I/O *bypassing* the core module. |
| R2 | `meta_state_log_change` lacks idempotency guard | This is noted in the plan as a prerequisite for Phase 7. It's a valid external observation but not a flaw in this plan's scope. |
| R3 | `fix_log`/`skip_log` are new unschema'd fields | The plan's "No new schema" success criterion refers to `core/meta-state.js` schema exports, not unvalidated fields on individual entries. `writeEntry` does not validate through zod. This is a design choice. |

---

## Unresolved Questions

1. Should `superseded` be considered terminal in `meta_state_list` default filter? (Currently it is included, giving 34 entries instead of 29.)
2. Is the cold-tier default `summary` an intentional breaking change? If so, all downstream consumers (e.g., `cold-session-discoverability.test.cjs`) must be audited for breakage.
3. Should the backfill reuse `meta_state_refresh_fingerprint` (existing tool) or write a new script? Reusing is cheaper and more reliable.

---

## Recommended Actions

1. **Fix all 53-entry references** and recalculate derived metrics (compact size, orphan rate, token baseline).
2. **Replace `writeEntry` with `updateEntry`** in both migration scripts (Phase 1 and Phase 5).
3. **Remove `server.js` from tool registration steps** — only `manifest.json` needs editing.
4. **Rename `.cjs` regression harness** to `.test.js` or update `package.json` test script.
5. **Decide on cold-tier default** — keep `full` as default (no breaking change) or document the breaking change and audit all callers.
6. **Correct backfill justification** — `derive_status` is unaffected; only `checkGrounding` needs `mechanism_check`.
7. **Remove unachievable `queryDrift` success criterion** — resolved findings are skipped by design.
8. **Update backfill coverage target** to 15/16 (94%) and use both `evidence_code_ref` + `evidence.code_ref`.
9. **Add `readRegistry` call to warm tier** for `registry_summary` computation.
10. **Update `meta_state_list` default count** to 34 or add `superseded` to `TERMINAL_STATUSES`.
11. **Fix test baseline count** from 580+ to 433.
12. **Expand `summarize` code block** to explicitly list all relationship fields.
13. **Apply `summarize` to `loop_designs`** in cold-tier summary mode.
14. **Fix idempotency definition** — allow change-log emission as append-only by design.
15. **Remove dead `promoted_to_rule` object branch** and corresponding test.
16. **Replace Phase 5 backfill script** with a loop over `meta_state_refresh_fingerprint`.
