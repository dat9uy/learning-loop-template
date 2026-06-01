---
date: "2026-06-02T00:00:00Z"
status: proposed
tags: [brainstorm, meta, lifecycle, gate-bug, tidy, g8, followup]
related:
  - plans/260602-self-enforcing-loop/plan.md
  - docs/journals/260602-self-enforcing-loop-implementation.md
  - plans/reports/brainstorm-260602-self-enforcing-loop-architecture.md
  - tools/learning-loop-mcp/core/meta-state.js
  - tools/learning-loop-mcp/core/gate-logic.js
  - tools/learning-loop-mcp/hooks/bash-gate.js
  - tools/learning-loop-mcp/hooks/write-gate.js
builds-on:
  - 260602-self-enforcing-loop
---

# Meta-State Lifecycle Tidy + G8 Fix

> **Status: Proposed.** Followup to the self-enforcing-loop plan that shipped 2026-06-02 (5 commits, 407/407 tests, 1 active rule). Session-end review surfaced 8 gaps; this report picks the 4 that are loop-internal and proposes a 4-phase TDD plan. Vendor-side work (G6, vnstock observations) is excluded — separate session, different surface.

## Context: What Shipped

`meta-state.jsonl` is now the rule registry. 12 entries migrated to `loop-anti-pattern` with `subtype`. 1 entry promoted to active rule (`rule-no-new-artifact-types`). New MCP tools: `meta_state_promote_rule`, `loop_describe`. Gate reads promoted rules via `loadPromotedRules` + `applyPromotedRules`. Loop is self-describing and self-enforcing in principle. In practice, the first post-ship review (this session) found 8 gaps.

## Gaps Surfaced This Session

| # | Gap | Severity | Surface |
|---|-----|----------|---------|
| G1 | 4 entries `reported` past `expires_at` (260529), never auto-transitioned | low | registry lifecycle |
| G2 | 11 reported entries with no ack/resolve/promote motion since migration | medium | registry lifecycle |
| G3 | 2-3 promotion candidates not yet activated (docker-home-leak, bash-gate-heredoc) | low | rule registry |
| G4 | Rule pattern `propose\|design\|create\|new\s+(schema\|artifact\|directory\|convention)` is broad | high | rule pattern |
| G5 | `auto_resolve` field exported, never invoked, never removed | low | schema dead-weight |
| G6 | 4 vnstock observations 2 weeks old on a new kernel (7.0.10-2-cachyos vs 7.0.5) | medium | vendor observations (out of scope) |
| G7 | `loop_describe` adoption = 0 outside tests | low | discoverability |
| **G8** | **`applyPromotedRules` does not call `stripMessageFlags` — promoted-rule regex path skips the message-flag protection that built-in `CONSTRAINT_PATTERNS` use** | **high** | gate-logic |
| **G9** | **`listAntiPatterns` in `core/loop-introspect.js:125` has no status filter — resolved/expired auto-resolved anti-patterns leak into `loop_describe({tier:"warm"}).anti_patterns` for up to 7 days until compaction. Sister helper `listActiveFindings` (line 110) correctly filters. Compaction-only mitigation violates the tier's filter contract.** | **medium** | introspect |

G6 (vendor) is explicitly out of scope — touches external state, not loop machinery. G7 is an observation, not a task. This report covers G1, G2, G3, G5, G8, G9.

## G8: Real False-Positive Path (the one that matters)

`applyPromotedRules(command, filePath, rules)` in `core/gate-logic.js:468` matches the raw command. `matchConstraintPattern(command)` in the same file splits on `;&|`, then for each segment calls `stripMessageFlags` to drop commit messages, PR titles, and similar flag values before regex matching. The promoted-rule path **does not**.

Concrete demonstration from this session's test (sample commands in `/tmp/rule-pattern-samples.json` to avoid the gate blocking its own test):

| Command | Built-in `matchConstraintPattern` | Promoted `applyPromotedRules` (current) |
|---|---|---|
| `git commit -m "add new convention for handling evidence"` | ok (flag stripped) | **BLOCK** |
| `gh pr create --title "new schema for x"` | ok (flag stripped) | **BLOCK** |
| `cat << EOF > test.txt ... create a new schema ...` | **BLOCK** (heredoc not stripped — known G) | **BLOCK** |
| `grep -r "new convention" docs/` | ok (no pattern match) | **BLOCK** |
| `echo propose a new artifact type` | ok (no pattern match) | **BLOCK** |

Three of these are real false positives that built-in patterns already protect against. The red-team review for the self-enforcing-loop plan tested the `applyPromotedRules` function in isolation (15 findings accepted) but did not exercise the divergence between the two regex paths. This is a planning gap, not an implementation gap — the function works, the wiring is incomplete.

Fix is one-line: thread the same segment-strip + flag-strip logic from `matchConstraintPattern` into `applyPromotedRules` for regex patterns. Two function extractions: `splitSegments(command)` and `stripMessageFlags(segment)`. Reuse them from both call sites. Add tests covering: commit message, PR title, heredoc, quoted argument, multi-segment `;`-separated command. ~30 min including tests.

## Evaluated Approaches for the Lifecycle Tidy

### Approach 1: One-shot cleanup script (rejected)

Write `tools/learning-loop-mcp/scripts/tidy-meta-state.mjs` that:
1. Sweeps expiry
2. Classifies all 11 reported entries
3. Resolves/expires/promotes in one pass

**Pros:** Single PR, fast.
**Cons:** Doesn't fix G8. Doesn't exercise `meta_state_*` MCP tools (the script bypasses the registry's own API). Doesn't add a recurring sweep — next session, same drift. Doesn't surface per-entry decisions to the operator.

### Approach 2: Four-phase TDD plan (recommended)

Phase T1 fixes G8 first (blocker for promotion). Phases T2-T4 use the new `meta_state_promote_rule` with `preview: true`, then activate on operator approval. Each phase is independently shippable with its own journal. Adds one new tool (`meta_state_sweep`) for recurring hygiene. Each phase is small enough to be red-team reviewable.

**Pros:** G8 fixed before any new rules are activated. Operator reviews each classification. Loop machinery is exercised in production for the first time. Each phase has its own success criteria.
**Cons:** More ceremony. Four journals, four sets of phase files.

### Approach 3: Hand-curate the 11 entries inline (rejected)

Open each entry, decide resolve/re-report/promote by hand, write new entries via `meta_state_report`, run `meta_state_resolve` on the closed ones.

**Pros:** No script, no new tool.
**Cons:** Doesn't fix G8. Doesn't address the recurring hygiene problem (G1 will recur). Bypasses the new `meta_state_promote_rule` tool — the very tool that exists to make this safe.

**Decision: Approach 2.** The plan's whole point was to use the loop's own machinery. Bypassing it for the first post-ship cleanup would teach the wrong lesson.

## Recommended Plan (4 Phases)

### Phase T1 — Fix G8 (promoted-rule regex strips message flags)

- Extract `splitSegments(command)` and `stripMessageFlags(segment)` from `matchConstraintPattern` so both built-in and promoted paths share the same preprocessing.
- `applyPromotedRules` for regex patterns: split command into segments, strip flags per segment, run regex against the stripped text, return on first match.
- Keep `pattern_type: "glob"` path unchanged.
- Tests: 4-5 new cases in `gate-promoted-rules.test.js` covering commit message, PR title, heredoc, quoted argument, multi-segment.
- Verify: the sample file `/tmp/rule-pattern-samples.json` should produce only 1 BLOCK (heredoc, which is a known limitation shared with built-in patterns) and 11 ok.
- Success: 0 new false positives in this session's sample set; existing 19 promoted-rules tests still pass.

### Phase T2 — Wire `meta_state_sweep`, fix G9, and expire the 4 stale 260529 entries

- New tool `meta_state_sweep` (operator-only). Walks registry, calls `checkExpiry` on each `reported` entry, calls `checkAutoResolve` if `auto_resolve` populated, returns the proposed transitions. With `apply: true`, runs them through `updateEntry` with the CAS `version` field.
- The 4 260529 entries transition to `expired` (status is in the terminal set per `TERMINAL_STATUSES` in `core/meta-state.js`). They remain in the file until 7-day compaction per `COMPACTION_AGE_MS`.
- **G9 fix (folded into T2):** add status filter to `listAntiPatterns` in `core/loop-introspect.js:125` — `entries.filter((e) => e.category === "loop-anti-pattern" && !TERMINAL_STATUSES.has(e.status))`. Sister helper `listActiveFindings` (line 110) already filters correctly; this restores parity. Add 3 tests: resolved excluded, expired excluded, auto-resolved excluded. The sweep tool's first run provides the regression guarantee — after it expires the 4 entries, `loop_describe.anti_patterns.length` must drop by 4.
- Schema: no change. Tool description explains it is operator-only and CAS-safe.
- Tests: 8 sweep cases (entry past expires_at, entry with `auto_resolve` set, stale `auto_resolve`, CAS mismatch, empty registry, mixed status filter, dry-run vs apply) + 3 G9 cases (resolved excluded, expired excluded, auto-resolved excluded) = 11 new tests.
- Success: registry has 4 entries moved to `expired`; `meta_state_list` no longer returns them by default; `loop_describe({tier:"warm"}).anti_patterns.length === <count of non-terminal loop-anti-pattern entries>` (invariant, not a fixed number — after G9 fix and T2 sweep, expected 8; after T3, expected 2-3).

### Phase T3 — Classify the 7 valid reported entries

Walk the 7 entries that are not yet expired. For each, produce a one-line disposition:

| Entry | Disposition | Rationale |
|---|---|---|
| `meta-260601T1339Z-internalization-rule-undiscoverable` | **resolve** | The rule was made discoverable by `loop_describe` shipping. New `meta_state_report` description now references the tool. No new rule needed; it's an in-tool affordance. |
| `meta-260601T1339Z-meta-state-undiscoverable` | **resolve** | Same as above. `loop_describe({tier:"warm"})` returns `meta_state_report` in the tool list with description. |
| `meta-260601T1353Z-bash-gate-heredoc-false-positive` | **keep as reported, narrow** | Partial fix shipped 260529 (quote-aware `stripMessageFlags`). Real heredoc support still missing. Operator decision: re-report with fresh 24h TTL pointing to T1's extraction (which doesn't fix heredoc either). |
| `meta-260601T1353Z-use-mcp-scripts-missing-install-guard` | **resolve** | `use-mcp` skill scripts are now documented to require `node_modules` setup; gate behavior is correct. Skill can be re-installed when needed. No rule to enforce. |
| `meta-260601T1353Z-sanitizeslug-enametoolong` | **promote to agent-level** | `record-writer.js` still does long-slug generation. Promote with `enforcement: "agent"`, `pattern_type: "glob"`, pattern `records/**/risks/*.yaml` so the agent is reminded to use a shorter slug. Not gate-enforced — too broad. |
| `meta-260602T0239Z-first-brainstorm-rejected` | **resolve** | `status: rejected` is set on the report. The meta-state entry has served its audit purpose. No future action needed. |
| `meta-260602T0301Z-second-brainstorm-superseded` | **resolve** | Same as above. |

For each `promote`: call `meta_state_promote_rule({preview: true, ...})` first. Show operator the sample matches. Operator approves; second call with `preview: false` activates.

For each `resolve`: call `meta_state_resolve` with rationale. Entry moves to `resolved` status (terminal, 7-day compaction).

For each `keep as reported`: re-report the same entry with fresh `expires_at`, optionally update `description` to reflect current state.

- Success: 5 entries resolved, 1 promoted, 1 re-reported. Registry has 1 active rule, 1 reported, 4 expired (from T2), 1 superseded (T1), 5 resolved (compaction-eligible in 7 days).

### Phase T4 — Wire or remove `auto_resolve`

After T3, check whether any active or reported entries have `auto_resolve: {file_modified, line_range}`. If yes, ship a `meta_state_check_auto_resolve` companion to `meta_state_sweep` that calls `checkAutoResolve` on each entry. If no, propose removing `auto_resolve` from `metaStateEntrySchema` and from the `meta_state_report` tool input. Operator decides.

**Lean: remove.** No entry in the registry has a meaningful `auto_resolve` set (all are `null` after the migration). The field is an affordance the loop never used. YAGNI.

- Success: either a new sweep tool is documented and tested, or `auto_resolve` is removed from the schema and one fewer field is documented.

## Implementation Considerations

### Risks

- **G8 fix changes a hot path.** `applyPromotedRules` is called by `bash-gate.js:104` and `write-gate.js:145` on every command. The new preprocessing must not regress. Mitigation: the 19 existing tests in `gate-promoted-rules.test.js` are the safety net; they cover `command`/`filePath` paths, disabled rules, glob scope whitelist. New tests for the regex segment-strip behavior.

- **T3 operator load.** 7 disposition decisions. Mitigation: pre-compute them in this report (above table) and present at plan-cook time. Operator confirms or reclassifies. The pre-computation is the brainstorming output, not a decision forced on the operator.

- **T4 retro.** Removing `auto_resolve` from the schema touches the `meta_state_report` tool, the migration script, and the test fixtures. Migration is a one-time write, not retroactive, so the registry entries are not affected. Mitigation: T4 is a one-way decision; if the operator prefers to keep the field, ship the sweep tool.

### Naming

- Plan: `plans/260602-meta-state-lifecycle-tidy/plan.md`
- Journal per phase: `docs/journals/260602-meta-state-lifecycle-tidy-t1.md`, `t2.md`, `t3.md`, `t4.md`
- T1 may surface a one-line git pattern; no docs/ updates expected

### Test Strategy

Each phase gets a dedicated test file or section. Reuse existing fixtures where possible. Total new tests: T1 (5), T2 (11 — 8 sweep + 3 G9), T3 (smoke tests, 3), T4 (3). All phases share the same 407-test baseline; T1–T4 add 22 tests, ending at 429.

### Sequencing

T1 → T2 → T3 → T4. T1 is a hard prerequisite for T3 (do not promote a rule that will false-positive in the very next operator shell command). T2 is a prerequisite for T3 (do not classify entries that should already be expired). T4 can run in parallel with T3 if a parallel session is opened.

## Success Metrics

- `pnpm test` passes 429/429 after T4
- `loop_describe({tier:"warm"}).anti_patterns.length` equals the count of non-terminal `loop-anti-pattern` entries (G9 invariant); after T2 expected 8, after T3 expected 2-3
- `loop_describe({tier:"summary"})` shows `rule_count: 2` (down from 1, up by 1 from the new agent-level rule in T3)
- `applyPromotedRules("git commit -m \"create new convention\"", ...)` returns `ok` (G8 fix)
- Registry has 0 entries with `status: "reported"` past `expires_at` (T2)
- `meta_state_resolve` was called at least 5 times this session (proof the new tools are used)

## Dependencies

- Phase 1 of `260602-self-enforcing-loop` plan is the foundation (schema with `loop-anti-pattern` category, `subtype`, `promoted_to_rule`, `version` CAS).
- `meta_state_promote_rule` tool with `preview: true` is the operator-safety path; required for T3.
- `loop_describe` adoption (G7) is not a blocker but improves operator review of T3.

## What This Report Does Not Cover

- G6 (vnstock observation re-baseline) — separate session, vendor surface, not loop machinery.
- G7 (`loop_describe` adoption) — observed this session, no task needed.
- The 96 dormant meta index entries — operator-curation backlog per the architecture plan.
- A real role system to replace the `OPERATOR_MODE=1` env var placeholder in `meta_state_promote_rule`. That is a separate auth story; flagged in the self-enforcing-loop plan's red-team findings but explicitly deferred.
