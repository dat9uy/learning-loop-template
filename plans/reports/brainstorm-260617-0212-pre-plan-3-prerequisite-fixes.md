# Brainstorm — Pre-Plan-3 Prerequisite Fixes (Q1)

**Type:** brainstorm (scope decision)
**Date:** 2026-06-17
**Slug:** pre-plan-3-prerequisite-fixes
**Status:** consensus — operator-approved 2026-06-17; **Plan 1a shipped 2026-06-17** (see "Plan 1a Closeout" below). Plan 1b + Plan 3 remain open.
**Aligned to:** `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` Plan 3 (C6+C7 operational flip)
**Predecessor:** Plan 2 closeout (CR-1 to CR-6) + 2 active meta-state findings + F4 finding (`active`)
**Successor:** Plan 1b (hygiene) + Plan 3 (operational flip) — Plan 1a is the unblocker for both.

---

## Problem

Plan 3 (C6+C7 — operational cut-over) is the next unblocked plan per the master tracker. It ships the cut-over from legacy `@modelcontextprotocol/sdk` `McpServer` to the Mastra `MCPServer` (C6) and the `agent-manifest.json` group rename (C7).

**The question:** what must land *before* the Plan 3 PR can merge, so the cut-over is not landing on top of known bugs + known gaps?

**Scope (operator decision 2026-06-17):** the full pre-Plan-3 prerequisite list — 2 active meta-state findings + 6 PR-#3 code-review gaps + 6 deferred items (D-8 to D-13) + F4 gate-bypass resolution. 15 items total.

The 15 items break into 3 risk classes:
- **Tool-level bugs** (block cut-over correctness): 2 active findings
- **Hygiene gaps** (must land before parity/coexistence solidifies): 6 CR items
- **Operational items** (Plan 3 itself): 6 D items + F4

## Evaluated Options

### Option A — 3-plan stack (Phase B pattern) ✅ CHOSEN

Mirrors Phase B's atomic-unit → single-fix → one-line-flip pattern. The 15 items split by risk class:

- **Plan 1a (atomic fix):** 2 active findings + CR-1 (zod pin) + CR-2 (mutex bypass). Tool-level correctness; 4-6 hours total.
- **Plan 1b (single fix):** CR-3 (cold-session test isolation) + CR-4 (test count math) + CR-5 (commit squashing) + CR-6 (plan.md R-09 arithmetic). Hygiene; single 2-3 hour PR.
- **Plan 3 (operational flip):** D-8 to D-13 + F4. The cut-over itself; reuses Plan 1a/1b as the prerequisite.

**Pros:**
- Phase B's 3-plan pattern shipped 2026-06-14 with no test regressions. Reuse the rhythm.
- Plan 1a is small enough to bisect (1 bug = 1 commit). The 2 findings have unrelated root causes; 1 PR each is clean.
- Plan 1b is single-batch hygiene that does not gate Plan 3 (low priority but should land before the cut-over to avoid test-flake noise in parity suite).
- F4 + D-8 to D-13 stay in Plan 3 where they belong (operational, not technical).

**Cons:**
- 3 PR cycles vs 1 (more overhead).
- Plan 1a and 1b could be a single PR if operator wants fewer cycles (Option B).

### Option B — 1 plan, all 15 items

**Pros:** One PR, one review.

**Cons:** 15 items in one PR is too much surface. The 2 bugs and F4 are unrelated to hygiene. Parity gate (75 mastra tests) is more likely to fail with a single big diff. Operator decision 2026-06-17: rejected (3-plan pattern recommended).

### Option C — 2-plan stack (1a merged with 1b, 1a+1b vs Plan 3)

**Pros:** One less PR cycle than Option A.

**Cons:** Conflates tool-level bugs with hygiene. The 2 bugs and CR-1/CR-2 are correctness-class; CR-3 to CR-6 are quality-class. Mixing them in one PR makes review harder.

## Final Recommendation

**Option A** (3-plan stack). Lock the stack in a separate brainstorm before `/ck:plan` authors the 3 plans. Plan names in the master tracker:
- `[~] Plan 1a — Atomic fix (2 findings + CR-1/CR-2)`
- `[~] Plan 1b — Hygiene (CR-3 to CR-6)`
- `[~] Plan 3 — Operational flip (D-8 to D-13 + F4)` (already in scope)

## Rationale

1. **The 2 findings are tool-level correctness bugs.** `meta_state_list` and `meta_state_relationships` are MCP tools that ship to the Mastra peer via the legacy-handler-adapter. Fixing them in legacy propagates to both transports. They are unrelated to each other (one is a status filter bug; the other is a missing inverse-index field); 1 PR each is clean.
2. **CR-1 (zod pin) is a Plan 3 prerequisite** because the parity gate (Plan 2 closed) is version-sensitive; minor zod bump could break it silently. **CR-2 (mutex bypass) is a Plan 3 prerequisite** because Plan 3 will add write-side content parity for the 25 currently-skip tools (per CR-2 in `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md`). These 2 land with Plan 1a.
3. **CR-3 to CR-6 are hygiene, not blockers.** They are pre-existing inconsistencies / doc drift / process lessons. Land them in Plan 1b as a single batched PR (2-3 hours).
4. **F4 + D-8 to D-13 are Plan 3's own scope.** They were deferred to Plan 3 in the parent brainstorm (lines 136-144). They do not move.

## Implementation Considerations

### Plan 1a (atomic fix) — 4-6 hours

**Items:**
- `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when` — fix in `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14, 173-182`. Add `include_terminal` flag (or semantic unification with `include_archived`). **Decision: open — see Open Question 1.**
- `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into` — fix in `tools/learning-loop-mcp/core/loop-introspect.js:248-307` (add `consolidated_into_inverse` to `buildInverseIndexes`) + `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js:38-79` (expose inbound `consolidated_by` map).
- **CR-1:** remove caret from `zod` pin in `tools/learning-loop-mastra/package.json:34`. 1-char change.
- **CR-2:** make `parity-zod-to-json-schema.test.js` route through `withBothMcpServers` (or push mutex into `connectMcpServer`).

**Gate:** parity suite (75 mastra tests + 4-tool read-only content parity) passes; 9 legacy namespaces pass; 0 regressions.

### Plan 1b (hygiene) — 2-3 hours

**Items:**
- **CR-3:** make `cold-session-discoverability.test.cjs:341` self-contained (register hooks in `before()`).
- **CR-4:** fix test count math in closeout report, PR body, master tracker, project changelog (75 actual, not 70).
- **CR-5:** historical; no fix needed. Lesson for Plan 3: commit per phase if implementation is large.
- **CR-6:** update `plans/260616-2200-phase-c-plan-2-parity/plan.md:105` R-09 arithmetic to match PR body.

**Gate:** 9 legacy namespaces pass; 0 flake re-runs.

### Plan 3 (operational flip) — already scoped

**Items (deferred from parent brainstorm, no change):**
- D-8: C6 cut-over
- D-9: C7 manifest rename
- D-10: F4 gate-bypass resolution
- D-11: 4-tool `agent-manifest.json` reconciliation
- D-12: Mode 1 vs Mode 2 decision
- D-13: F4 PR security note (in PR body)

**Pre-condition:** Plan 1a and 1b merged.

## Success Criteria

| Plan | Gate | Pass Condition |
|------|------|----------------|
| 1a | 2 findings resolved (status=resolved or superseded) | `meta_state_list({status: "superseded"})` returns superseded entries; `meta_state_relationships({id: X, ref_field: "consolidated_into"})` traverses |
| 1a | CR-1 + CR-2 land | `package.json` zod pin is exact; parity test uses mutex |
| 1a | Parity suite passes | 75 mastra tests + 4-tool content parity + 9 legacy namespaces = 0 regressions |
| 1b | Hygiene lands | 4 doc/quality items in 1 PR |
| 3 | Plan 3 ready to start | Plan 1a + 1b merged; master tracker `[x]` for both |

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| 1a fix changes wire format → breaks 75-test mastra suite | Low | Re-run suite as smoke gate; parity harness is schema-comparison + content deepEqual; both should propagate (both servers wrap the same handler) |
| 1a fix surfaces a 3rd bug in `meta_state_relationships` traversal | Low | Pre-flight: read all 6 inverse maps + `consolidated_into_inverse` in unit test before shipping |
| 1b (CR-5) is historical; the "lesson for Plan 3" is process-only | Low | Acknowledge in plan.md note; no code change |
| Plan 3 cut-over ships before 1a/1b | Medium | Lock 1a + 1b as Plan 3 pre-conditions in master tracker; PR review rejects if 1a/1b not merged |
| F4 resolution path (D-10) is a fork in the road (peer becomes primary vs. peer is removed) | Medium | F4 is `active` (ack-ed 2026-06-16); resolve during Plan 3 Phase 1 (before cut-over) |
| D-11 (4-tool manifest reconciliation) has 2 valid resolutions (add to manifest vs. document omission) | Low | Operator decision during Plan 3 author; not blocking Plan 1a/1b |

## Plan 1a Closeout (2026-06-17)

**Status:** SHIPPED. 1 session, 4 stacked commits (easiest → hardest: Phase 1 → 2 → 3 → 4), 1 PR. Both findings resolved. Master tracker flipped. See `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md`.

**Acceptance gate (single-sentence anchor):** All 9 test namespaces pass, 0 regressions, `include_archived: true` surfaces superseded entries, `meta_state_relationships` returns `inbound.consolidated_by`, `package.json` zod pin is `4.4.3` exact, parallel `callTool` calls serialize registry writes. **Met.** Verification: `pnpm test` → 1069 pass / 0 fail / 1 skip.

### Resolved Open Questions

- **Q1 (include_archived semantic) — RESOLVED 2026-06-17.** Operator chose semantic unification: single `include_archived: true` flag surfaces superseded + resolved + auto-resolved + archived. Rejected the separate `include_terminal: true` flag (Option B). Implementation: `meta-state-list-tool.js:179-186` — `includeTerminal = include_archived || isExplicitStatusFilter`.
- **Q5 (PR sequencing) — RESOLVED 2026-06-17.** 1 PR with 4 stacked commits (Phase B pattern). Commit order = easiest → hardest for bisect-friendly rollback. This pattern was used and worked; **Plan 3 should reuse it** if its scope is large.

### Actual Test Counts (vs. brainstorm predictions)

| Predicted (this brainstorm) | Actual |
|---|---|
| 9 legacy namespaces | **10 test namespaces** (verified: `package.json:17` has 10 globs; the 9-count was wrong, inherited from Plan 2) |
| 75 mastra tests + 4-tool content parity | 1069 pass / 0 fail / 1 skip across all 10 namespaces (the 1 skip is the persistent `tools-list-collision` skip from Plan 2, not a regression) |
| 0 regressions | 0 regressions ✓ |

**The 9-namespace anchor is obsolete.** Plan 1b and Plan 3 should use "10 test namespaces" or "all test namespaces pass" as the durable anchor. The 75-mastra-test count is also obsolete — mastra namespace now has more tests; use the total 1069 as the new anchor.

### TTL Pressure Was Real (not theoretical)

Both findings were set to expire at 2026-06-17T06:52:16Z — ~3 hours from plan authoring. Plan 1a resolved both at 2026-06-17T06:09:27Z (43 minutes before TTL). If the session had slipped, the findings would have entered `stale` status and the meta-state surface would have been advertising broken behavior as the default. The TTL pressure was real, not theoretical, and shaped the scope decision (4 fixes in 1 atomic PR vs. 4 separate PRs).

### Findings Resolved

- `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when` → `status: resolved`, `code_fingerprint: sha256:7d9c8378...` populated. Drift detection now enabled via `meta_state_check_grounding`.
- `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into` → `status: resolved`, `code_fingerprint: sha256:a80334c8...` populated.

### New Findings from Code Review (→ Plan 1b scope extension)

The 4-fix atomic PR is technically correct (code review verdict: **PASS**), but `plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md` identified 1 Important + 6 Minor items that should land in Plan 1b's hygiene batch. **Extend Plan 1b's scope** to include:

**Important (1):**
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js:14-28` — module-level `inFlight` over-serializes ALL listTools/callTool across the test process, including calls against servers that do NOT share `GATE_ROOT`. **Fix:** scope the mutex to per-`(serverEntry, tempRoot)` closure inside `connectMcpServer`.

**Minor (6):**
- `with-both-mcp-servers.js:46-60` — pre-existing stale-rejection bug (not introduced by Plan 1a; was masked by the new inner mutex). Verified: `caught1: boom1, caught2: boom1` (second call inherits stale rejection).
- `connect-mcp-server-mutex.test.js:54-90` — test does not deterministically exercise the race; could pass with or without the mutex depending on timing. Add timestamp-stamped ordering check or back-to-back identical `change_target` IDs.
- `loop-introspect.js:309-317` — `consolidated_into_inverse` does not dedup duplicates; inconsistent with `promoted_to_rule` pattern at line 282-284. Add `if (!arr.includes(id)) arr.push(id);`.
- `loop-introspect.js:304-308` — comment is misleading (says `finding.consolidated_into` is the forward, but it's the inverse; forward is `change-log.consolidates`). Rewrite to "The forward ref is on the change-log side (`change-log.consolidates`). The inverse is keyed by change-log id."
- `loop-introspect.test.js` — coverage gap: no 1-finding→2-change-logs test, no empty-string test, no duplicate-in-CSV test. Add 2-3 more tests.
- `meta-state-list-tool.js:14` — naming inconsistency: `TERMINAL_STATUSES` set has 3 entries (auto-resolved, resolved, superseded); `archived` is the 4th terminal status but is NOT in the set, handled by a separate `if (!include_archived)` filter. Either add `"archived"` to the set and delete the second filter, or rename to `EXCLUDABLE_STATUSES`.

**Doc drift to fix in Plan 1b:**
- Plan/closeout claim "9 test namespaces" → correct to "10 test namespaces" (or "all test namespaces").
- Plan claims "+4 RED tests" → correct to "+5 new test files / +11 new tests" (Phase 2 has 2 test files: `loop-introspect.test.js` + `meta-state-relationships-tool.test.js`).
- Journal RCA contains 4 hallucinated pre-fix map names (`resolves_inverse`, `archives_inverse`, `consolidates_inverse`, `depends_on_inverse` are invented; the real 5 pre-fix maps are `addresses_inverse, supersedes_inverse, origin_inverse, promoted_to_rule_inverse, reopens_inverse`).
- Journal claims `TERMINAL_STATUSES` was "added" at line 14 of `meta-state-list-tool.js` — it was pre-existing from plan 260611-1000; actual change was at lines 179-186.

### Code Reference Drift in This Brainstorm

Several line numbers in the "References" section are now slightly off after the Plan 1a fixes (line ranges shifted):
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14, 173-182` — line 14 (`TERMINAL_STATUSES`) is unchanged; the actual change was at lines 179-186.
- `tools/learning-loop-mcp/core/loop-introspect.js:248-307` — actual range is now 240-328 (extended with `consolidated_into_inverse`).
- `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js:38-79` — the `inbound` map is at lines 56-69; the new `consolidated_by` is at lines 68-69.
- `tools/learning-loop-mastra/package.json:34` — should be `package.json:28` (Plan 1a moved the pin to the root package.json, not the mastra subdir's).

Plan 1b should correct these line numbers when it picks up the doc-drift items.

### References for Plan 1a Closeout

- `plans/260617-1138-phase-c-plan-1a-atomic-fix/plan.md` — Plan 1a plan
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md` — Plan 1a closeout
- `docs/journals/2026-06-17-phase-c-plan-1a-closeout.md` — Plan 1a journal (contains hallucinated map names; correct in Plan 1b)
- `plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md` — Plan 1a code review (PASS verdict; 1 Important + 6 Minor)

## Open Questions

1. **`include_archived` semantic for `superseded`/`resolved`/`auto-resolved`:** ~~Operator decision required before Plan 1a author.~~ **RESOLVED 2026-06-17** — semantic unification chosen. See "Plan 1a Closeout → Resolved Open Questions" above.
2. **Cold-session test isolation (CR-3):** is the fix `before()` registration or a full rewrite of the test to not depend on test ordering? Pre-existing flake risk; low priority but Plan 1b should pick one.
3. **D-11 resolution:** add the 4 tools (`propose_design`, `relationships`, `re_verify`, `supersede`) to `agent-manifest.json`, or document the omission? Master tracker line 183 acknowledges the gap.
4. **D-12 Mode 1 vs Mode 2 decision timing:** should this be resolved before Plan 3 author starts (locks C6 scope), or during Plan 3 (peer review feedback)? Earlier resolution = tighter Plan 3 scope; later = more input from operator during review.
5. **Plan 1a PR sequencing:** ~~Phase B used batched-with-stacked-commits. Plan 1a's items are smaller; 1 PR with 4 commits is fine.~~ **RESOLVED 2026-06-17** — 1 PR with 4 stacked commits shipped successfully. Plan 3 should reuse the pattern.

## Deferred (out of scope for these 3 plans)

- D-14 to D-15: Phase D workflow + agent + storage migration (separate phase)
- D-16 to D-17: CI drift check, fail-fast on manifest (future hardening)
- D-18 to D-19: Phase G skill migration, LIM hardening (separate tracks)
- Coerce layer technical debt (separate brainstorm, see `brainstorm-260617-0212-coerce-layer-zod-native-migration.md`)

## References

- `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` — parent scope (D-1 to D-19)
- `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` — PR #3 code review (CR-1 to CR-6)
- `plans/reports/productization-260612-1530-master-tracker.md` — Phase C / D-8 to D-13 + F4
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14, 173-182` — bug 1 location
- `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js:38-79` — bug 2 location
- `tools/learning-loop-mcp/core/loop-introspect.js:248-307` — `buildInverseIndexes` (5 maps; no `consolidated_into_inverse`)
- `tools/learning-loop-mastra/package.json:34` — zod pin (CR-1)
- `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js:9, 79-80, 141-144, 166-169` — mutex bypass (CR-2)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:341` — pre-existing flake (CR-3)
- `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when` — active finding
- `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into` — active finding
- `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` — F4 active finding
- `plans/260614-1259-phase-b-codegen-adoption/` — Phase B 3-plan pattern (template)
