---
title: "Rule pattern_type vocabulary realignment"
description: "Rename the `rule` record's `pattern_type` enum so the consumption axis (state-2 agentic vs state-3 deterministic) is lexically distinct from the concept term `consult-gate`. Rename `consult-checklist` → `agent-checklist` and `resolution-evidence-required` → `determinism-checklist` across the schema, ≥14 rename targets in 10+ source files (including `tools/learning-loop-mastra/core/README.md` and several inline code comments), the 6 affected registry records (also rewriting each record's `description` field which `meta_state_promote_rule` hard-codes `Pattern type=${pattern_type}` into at tool line 172), tests, and tool docs. Relabel `rule-no-orphaned-evidence` `enforcement: agent → gate` (no behavior change — it already hard-blocks `meta_state_resolve`) so `enforcement=gate ↔ state-3` holds uniformly. Out of scope: the consult-checklist↔PROCESS_HINTS↔H6 contract doc (deferred) and `meta-260714T1334Z` (later session — the resolver MUST use `agent-checklist` and the new pattern body shape; stale journals still reference the old enum). Keep `regex`/`glob` as pattern_types for the 3 `agent + regex/glob` advisory rules (operator decision #2; YAGNI trade-off documented). Atomicity is load-bearing: `loadPromotedRules` (`gate-logic.js:587`) warn-and-skips on schema mismatch, so the schema rename + 6 record updates + tests must land in one commit. Atomic git commit alone is insufficient — the per-process `promotedRulesCache` (`gate-logic.js:546`) requires MCP server restart (or `invalidateCache(root)`) to pick up the new schema in live sessions."
status: completed
priority: P2
branch: "plan/rule-vocabulary-realignment"
tags: [meta-state, rule-schema, vocabulary-realignment, pattern-type, consult-checklist, determinism-checklist, atomic-commit]
blockedBy: []
blocks: []
created: "2026-07-14T13:58:00.000Z"
createdBy: "operator"
source: skill
related:
  - plans/reports/rule-paradigm-260714-1349-pattern-type-vs-state-axes-report.md (source report — the pattern_type/state axis analysis)
  - meta-260714T1334Z (out-of-scope finding; test-result-parsing procedure; deferred to a later session. **Resolver must use `pattern_type: "agent-checklist"`** — schema will reject `consult-checklist`. Stale journal text at `docs/journals/2026-06-15-step-4-runtime-agnostic-rule-closure.md:22` etc. may misinform the resolver. Recommended: file a follow-up journal entry at rename-time pointing future resolvers to the new schema.)
  - docs/loop-engine.md (L1 concept vocabulary — `consult-gate` lives here; unchanged)
  - docs/philosophy.md (L2 state model — agentic/deterministic split; unchanged)
  - docs/meta-state-lifecycle.md (target of phases 4, 6, 7 — vocabulary axis note + lifecycle-term alignment)
  - docs/schemas.md (target of phase 1 + 4 — enum table)
  - tools/learning-loop-mastra/core/meta-state.js:281 (pattern_type enum source — phase 1 edit)
  - tools/learning-loop-mastra/core/gate-logic.js:587 (loadPromotedRules safeParse — atomicity constraint)
  - tools/learning-loop-mastra/core/gate-logic.js:750, 767 (pattern_type branches — phase 1 edit)
  - tools/learning-loop-mastra/core/entry/rule.js:14, 17 (isConsultChecklist + branch — phase 1 edit)
  - tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js:20, 85, 100, 127, 170 (enum + branches — phase 1 edit)
  - tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js:89, 100 (pattern_type branches — phase 1 edit)
  - tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js:97 (H6 ordering gate branch — phase 1 edit)
  - plans/260611-1000-remove-expired-status (source plan for phase 7 status-collapse model)
  - plans/260707-0812-lifecycle-status-stale-mechanism (source plan for phase 7 stale-flag redesign)
  - plans/reports/assertinvariant-meta-pattern-260711-0516-resolution-plan-report.md (source for phase 6 loop-design lifecycle terms)
---

# Plan: Rule pattern_type vocabulary realignment

## Overview

The `rule` record has two orthogonal axes — `pattern_type` (match shape) and `enforcement` (consumption axis) — but the vocabulary overloads "consult" across two opposite states: `consult-checklist` (state-2, agentic consumption) and `consult-gate` (state-3, deterministic block, realized by `resolution-evidence-required`). One `agent`-labelled rule (`rule-no-orphaned-evidence`) hard-blocks `meta_state_resolve`, contradicting `AGENTS.md:65` ("agent = consult"). The L1 concept (`docs/loop-engine.md`) and L2 state model (`docs/philosophy.md`) are sound; the defect is L3 encoding + vocabulary, not concept. This plan realigns L3 vocabulary only.

**Status:** proposed. Scope locked with operator (2026-07-14). Defers `meta-260714T1334Z` to a later session — that finding is **out of scope** here; only its *cause* (undocumented consult-checklist injection contract) is indirectly addressed by the L2 axis-naming note in phase 4.

## Why

See `plans/reports/rule-paradigm-260714-1349-pattern-type-vs-state-axes-report.md` for the full analysis. One-line summary: renaming the two pattern_type enum values so the consumption axis (`agent-*` = state-2 agentic, `determinism-*` = state-3 deterministic) is lexically distinct from the docs concept term `consult-gate` removes the vocabulary collision without touching concept.

## Operator decisions (locked)

1. Relabel `rule-no-orphaned-evidence` `enforcement: agent → gate` (no behavior change; it already hard-blocks resolve). Restores `enforcement=gate ↔ state-3` uniformly.
2. **Reclassify the 3 `agent + regex/glob` advisory rules** to `pattern_type: agent-checklist` with checklist-body `pattern` strings (validation Q3 reversal of the original "keep regex/glob" decision). The 3 rules are: `rule-short-slug-for-risk-records` (was glob), `rule-import-chain-analysis-after-tool-deletion` (was regex), `rule-assertinvariant-at-boundary` (was regex). Eliminates source-report Inconsistency B (dead match specs — `applyPromotedRules` skips non-gate rules at `gate-logic.js:757`, so the regex/glob bodies never fired). H6 ordering gate grows from 4 to 7 `agent-checklist` rules. Gate-enforcement behavior identical (skipped in both states); agent-facing `loop_describe` body changes from regex/glob-string to JSON checklist body.
3. Rename pattern_type enum: `consult-checklist → agent-checklist`, `resolution-evidence-required → determinism-checklist`. Final enum: `{regex, glob, agent-checklist, determinism-checklist}`. The `-checklist` family encodes the consumption axis (`agent-*` = state-2 agentic, `determinism-*` = state-3 deterministic), mirroring philosophy's agentic/deterministic split. Concept term `consult-gate` (docs) stays — it lives on the concept surface and is now lexically distinct from `agent-checklist`. **`regex` and `glob` survive in the enum but only for the 2 gate-enforced rules** (`rule-no-new-artifact-types`, `rule-project-skill-boundary`).
4. Scope = vocabulary realignment only.

## Migration safety (load-bearing constraint)

`loadPromotedRules` (`gate-logic.js:587`) validates each rule with `metaStateRuleEntrySchema.safeParse` and **warn-and-skips** on failure. Therefore the schema enum, all code references, AND the 6 migrated registry records must land in **one atomic commit**. A split commit creates a window where the 6 rules are silently dropped from gate enforcement (graceful degradation, not a crash — but a correctness regression). `readRegistry` (`meta-state.js:510` is the private `_readAndParseRegistry` helper; the public `readRegistry` export is at `:530`) is a lenient `JSON.parse` (no validation on read), so the only strict-validation path is `loadPromotedRules` + writes.

**Atomic git commit alone is insufficient.** The per-process `promotedRulesCache` (`gate-logic.js:546`, keyed on `mtime + size`) requires a process restart to pick up the new `gate-logic.js` branch literals — live sessions calling `meta_state_resolve` continue to run the OLD code's `=== "consult-checklist"` compare against the NEW registry's `agent-checklist` value, which falls through silently. **Deployment step:** restart the MCP server (or call `invalidateCache(root)` from a kill/restart cycle) before declaring the rename live. Verify by asserting `loop_describe({tier:"warm"}).rule_count === 9` (4 original consult-checklist → `agent-checklist` + 3 reclassified advisory rules → `agent-checklist` = **7 agent-checklist** + 2 gate-enforced `regex` + 0 `glob`; the 2 `determinism-checklist` records stay filtered at `loop-introspect.js:477`) across the restart boundary.

## Phases

| Phase | Name | Status | Priority |
|-------|------|--------|----------|
| 1 | [Enum + core/handler code rename](./phase-01-enum-and-code-rename.md) | Pending | P2 |
| 2 | [Registry migration (meta-state.jsonl)](./phase-02-registry-migration.md) | Pending | P2 |
| 3 | [Test bodies + file renames](./phase-03-test-bodies-and-renames.md) | Pending | P2 |
| 4 | [Vocabulary axis note (tools/schemas.md + docs/lifecycle)](./phase-04-vocabulary-axis-note.md) | Pending | P2 |
| 5 | [Pre-commit verification gate](./phase-05-pre-commit-verification.md) | Pending | P2 |
| 6 | [Lifecycle loop-design + change-log terms](./phase-06-lifecycle-loop-design-terms.md) | Pending | P3 |
| 7 | [Finding-status lifecycle doc rewrite](./phase-07-finding-status-lifecycle-doc.md) | Pending | P3 |

## Dependencies

**blockedBy:** (none; clean slate)

**blocks:** (none; isolated refactor)

**Atomic-commit group:** Phases 1 + 2 + 3 + 4 + 6 commit together (atomicity — see "Migration safety"; phase 6 rides the atomic per validation Q1). Phase 5 is the gate before the atomic commit. Suggested commit order: do 1 → 2 → 3 → 4 → 6, run 5, fix anything 5 surfaces, then one `git commit` covering all.

Phase 6 is **independent of the rename** in cause (assertinvariant report), but the operator chose to ride the atomic commit (validation Q1) to keep the docs lifecycle term updates atomic with the registry/code changes. Phase 6 has no schema-validation coupling; it could ship later, but the operator's preference is one PR.

Phase 7 is also docs-only and also edits `docs/meta-state-lifecycle.md` (the finding-status sections, a different cause again — plans `260611-1000` + `260707-0812`). Do phases 4 + 6 + 7 in **one doc-edit pass** so the file is consistent at each save; all three may ride the atomic commit or ship together as a separate docs commit. **Default after Q1:** phase 7 also rides the atomic rename commit if it's ready by execution time; otherwise it lands as a follow-up docs PR.

## Acceptance Criteria

- [ ] `metaStateRuleEntrySchema` enum is `{regex, glob, agent-checklist, determinism-checklist}`; old values appear nowhere in `tools/` source (grep guard, excluding historical `.gate-decision.log` / `gate-log.jsonl` lines and `plans/`/`docs/journals/` history).
- [ ] `meta-state.jsonl`: the 4 `consult-checklist` rules are `agent-checklist`; the 2 `resolution-evidence-required` rules are `determinism-checklist`; the 3 `agent + regex/glob` advisory rules (`rule-short-slug-for-risk-records`, `rule-import-chain-analysis-after-tool-deletion`, `rule-assertinvariant-at-boundary`) are `agent-checklist` with checklist-body `pattern` strings; `rule-no-orphaned-evidence` `enforcement` is `gate`. Final distribution: 7 `agent-checklist` + 2 `determinism-checklist` + 2 `regex` (gate-enforced: `rule-no-new-artifact-types`, `rule-project-skill-boundary`) + 0 `glob` = 11 total.
- [ ] `pnpm test` green. H6 warm tier sees all 7 `agent-checklist` rules (no "no PROCESS_HINTS row" warning). `meta_state_resolve` still fires `rule-no-orphaned-evidence` (determinism-checklist, gate).
- [ ] `docs/meta-state-lifecycle.md` has a short note: `agent-*` pattern_types = state-2 agentic consumption (7 rules); `determinism-*` = state-3 deterministic consumption (2 rules); `regex`/`glob` survive only for gate-enforced rules (state-3, bash/write path matching).
- [ ] (Phase 6) `docs/meta-state-lifecycle.md` loop-design section names `meta_state_ship_loop_design` as the active→inactive tool and states `meta_state_patch` cannot set `status` (deny-list); the change-log section documents `operation_envelope` (8 kinds, `{total,by_status,by_kind}` counts, `content_hash`, auto-emitted by `meta_state_batch`, `case "write"` rejects caller-supplied); the Tools table has a `meta_state_ship_loop_design` row.
- [ ] (Phase 7) `docs/meta-state-lifecycle.md` finding-status sections use `{open, resolved, superseded}` (+ `archived` runtime-only), describe `stale` as the `isStaleView` derived view (not a status), and contain **no normative** `reported`/`active`/`auto-resolved`/`meta_state_ack`/TTL text (legacy mentions only in "removed in …" explanatory sentences). The Tools table has no `meta_state_ack` row; `meta_state_report` → `open` (no TTL); `meta_state_sweep` is read-only; `meta_state_re_verify` makes no status transition.

## Out of scope (deferred)

- The full L2 pattern_type→state mapping matrix + the consult-checklist↔PROCESS_HINTS↔H6 contract written as a general pattern (report Part-4 items 3–5). Only the minimal axis-naming note ships here; the fuller doc is a separate doc task.
- `meta-260714T1334Z` fix (the test-parse consult-checklist rule + PROCESS_HINTS row). Later session. **The future resolver MUST use `pattern_type: "agent-checklist"`** — the new schema rejects `consult-checklist` and `resolution-evidence-required`. Stale journal text (e.g., `docs/journals/2026-06-15-step-4-runtime-agnostic-rule-closure.md:22`) may misinform the resolver. Recommended: file a rename-time journal entry pointing future resolvers at the new enum, OR resolve this finding as part of a follow-up plan that ships the PROCESS_HINTS row + rule.
- Renaming the docs concept term `consult-gate`.
- Retyping the 3 `agent + regex/glob` advisory rules (they stay regex/glob per operator decision 2; source report Part-1 §Inconsistency B acknowledges the dead match specs as a deliberate trade-off).
- Hardening `rule.pattern` for `agent-checklist` rules: currently `z.string()` only (`core/meta-state.js:282`), no JSON-shape refinement. A direct-write to `meta-state.jsonl` could inject arbitrary prose into the agent's checklist body. Recommend a follow-up `pattern: z.string().refine((v) => safeParseChecklistBody(v))` or hash-pinned canonical body for `pattern_type === "agent-checklist"`. Out of scope for the vocab rename.
- The **Finding status lifecycle** section was previously listed here as deferred; it is now in-scope as **phase 7**.

## Red Team Review

### Session — 2026-07-14
**Reviewers:** Security Adversary (Fact Checker) + Failure Mode Analyst (Flow Tracer) + Assumption Destroyer (Scope Auditor) + Scope & Complexity Critic (Contract Verifier) — all 4 lenses in parallel.
**Findings:** 38 raw → 15 unique after dedup; 13 accepted, 2 deferred to operator decision.
**Severity breakdown:** 4 Critical, 11 High.
**Verification:** Fact Checker 24/25 verified (1 FAILED — `docs.maxLoc (800)` is a phantom constraint); Flow Tracer 1 FAILED (Phase 5 §5.4 rule_count); Scope Auditor PASSED; Contract Verifier PASSED with 1 omission.
**Reports:** `reports/from-code-reviewer-to-planner-red-team-rule-vocabulary-realignment-plan-review-report.md`.

| # | Finding | Severity | Reviewer | Disposition | Applied To |
|---|---------|----------|----------|-------------|------------|
| 1 | Registry `description` field retains `Pattern type=consult-checklist` literal post-Phase 2 (auto-generated by `meta_state_promote_rule` at `:172`); Phase 2's targeted Edit doesn't touch `description`; Phase 5.2 grep excludes `meta-state.jsonl` | Critical | FMA | Accept | Phase 2 (extend "How to edit" to rewrite description on the 6 lines) + Phase 5.2 (widen grep to include `meta-state.jsonl`) |
| 2 | `rule_count` acceptance criterion is structurally unsatisfiable — `loop-introspect.js:477` filters `resolution-evidence-required`; after rename those become `determinism-checklist` (still filtered); `promotedRules.length === 9`, not 11 | Critical | FMA | Accept | Phase 5 §5.4 (update criterion to 9) + plan.md Migration safety |
| 3 | `tools/learning-loop-mastra/core/README.md:68` missing from Phase 1 inventory; phase 5.2 grep will fail | Critical | AD, SC | Accept | Phase 1 §`Files to edit` (add README.md) |
| 4 | Phase 6 YAML `dependencies: [4, 7]` contradicts prose ("independent of the rename"); multi-reviewer agreement | Critical | AD, SC, FMA | Accept | Phase 6 YAML (change to `dependencies: [4]`) |
| 5 | Phase 7 source-of-truth off-by-one: `meta-state.js:161` is actually `:162`; `meta-state.js:1277` is a JSDoc comment, not implementation; missing `constants.js:32` second `TERMINAL_STATUSES` (with `archived`) | High | AD | Accept (partial) | Phase 7 §"Source of truth" (correct line citations; document both TERMINAL_STATUSES sets) |
| 6 | `rule.pattern` for `agent-checklist` has no schema validation (`z.string()` at `meta-state.js:282`); direct-write to registry = arbitrary-prose injection into agent checklist body | High | SEC | Accept (as follow-up finding) | plan.md "Out of scope" — listed as deferred hardening |
| 7 | Phase 3 test-file renames are gold-plating — vitest uses glob discovery (`vitest.config.mjs:21-25`); renames add zero test value | High | SC | **DEFERRED** — operator-locked decision (operator-approved 2026-07-14); see Operator Decision Conflict below | (no plan change) |
| 8 | H6 stale-warning window undetectable by Phase 5.4 — `loop_describe({tier:"warm"})` returns `warnings: []` in both intermediate state (Phase 1 done, Phase 2 not) AND post-merge; cannot distinguish atomic-success from atomicity-violation | High | FMA | Accept | Phase 5 §5.4 (combine with 5.3: "registry has 4 agent-checklist records AND loop_describe shows no warnings") |
| 9 | Late `meta-260714T1334Z` resolver writes `pattern_type: "consult-checklist"` (per stale journal text); new schema rejects on safeParse | High | FMA, AD | Accept | plan.md "Out of scope" + `related:` block (explicit handoff note that future resolver must use `agent-checklist`) |
| 10 | Operator decision #2 keeps `regex`/`glob` for 3 `agent + regex/glob` advisory rules; source report flags these as Inconsistency B (dead match specs at `gate-logic.js:757` skip non-gate rules) | High | SC | **DEFERRED** — operator-locked decision (decision 2); see Operator Decision Conflict below | (no plan change) |
| 11 | Phase 7 §7.7 acknowledges doc/code mismatch (archive rule uses `isOpen`, not `status=reported`) but defers resolution | High | SEC, AD | Accept | Phase 7 §7.7 (restrict to single forward-reference paragraph; archive-rule reconciliation is its own phase) |
| 12 | Phase 6 has independent cause (assertinvariant report) but is bound to Phase 7 doc-edit pass — schedule as separate docs commit | High | SC | Accept | plan.md "Dependencies" (mark Phase 6 as "ship as separate docs PR by default") |
| 13 | `promotedRulesCache` per-process (gate-logic.js:546); atomic git commit doesn't restart MCP server — module cache holds old `gate-logic.js` | High | SEC | Accept | plan.md "Migration safety" (add deploy step: restart MCP server / invalidateCache) + Phase 5 §5.4 |
| 14 | `core/patterns.json` "consult-checklist" key is dead code (`gate-logic.js:28-32` builds regex from prose description; no consumer uses the regex) — rename perpetuates confusion | High | FMA | Accept | Phase 1 §`Files to edit` (delete the key, don't rename) |
| 15 | Plan header "12 rename targets in 9 files" understates actual scope (≥14 in 10+ files including comments + README) | High | AD | Accept | plan.md description (corrected to "≥14 rename targets in 10+ source files") |

### Operator Decision Conflict (Findings 7 and 10)

The red-team flagged two findings that challenge operator-locked decisions from the original plan. Per the audit-decision rules, these are not auto-rejected but **deferred to operator decision**:

**Finding 7 (Phase 3 test renames — operator decision implicit 2026-07-14):**
- **Original decision:** Phase 3 renames 5 test files for vocabulary consistency (operator-approved 2026-07-14 per the phase body header).
- **Audit concern (Scope Critic):** `vitest.config.mjs:21-25` shows `include: ["tools/learning-loop-mastra/**/*.test.{js,cjs,mjs}", ...]` — discovery is glob-based. Renames are path-safe but **not necessary**. Adds 5 `git mv` + 5 safety-grep operations with zero test value. Pure cosmetics.
- **Trade-off:** cosmetics (vocabulary alignment with renamed `pattern_type` values) vs. YAGNI (skip the renames; body edits alone keep suite green).
- **Concrete options:** (a) Keep all 5 renames (current plan); (b) Keep only the 2 file-renames that match the renamed `pattern_type` strings (`gate-logic-consult-checklist.test.js` → `gate-logic-agent-checklist.test.js`, `gate-resolution-evidence.test.js` → `gate-determinism-checklist.test.js`); (c) Drop all 5 renames, body edits only; (d) Defer renames to a follow-up cosmetic commit.

**Finding 10 (Decision #2 keeps `regex`/`glob` for advisory rules):**
- **Original decision (locked):** "Keep `regex`/`glob` as pattern_types for the 3 `agent + regex/glob` advisory rules — they name the match shape the agent consumes; renaming to 'checklist' would erase that signal."
- **Audit concern (Scope Critic):** Source report Part-1 §Inconsistency B flags these as "consult-checklist rules mis-typed as regex/glob." Their patterns are never matched because `applyPromotedRules` skips non-gate rules at `gate-logic.js:757`. The "match shape" signal is dead.
- **Trade-off:** preserve the (admittedly dead) match-shape vocabulary vs. reclassify to `agent-checklist` and convert `pattern` strings to checklist bodies (eliminates Inconsistency B; H6 ordering gate then has 7 `agent-checklist` rules to verify).
- **Concrete options:** (a) Keep `regex`/`glob` (current decision 2); (b) Reclassify all 3 to `agent-checklist` with checklist-body patterns (H6 verification grows; rule counts change); (c) Document the asymmetry in phase 4's axis note without reclassifying.

### Whole-Plan Consistency Sweep (post-red-team)

Re-read `plan.md` and all 7 phase files after applying accepted findings. Reconciled:

- **File inventory:** plan.md description updated to "≥14 rename targets in 10+ source files" matching the actual count. Phase 1 §"Files to edit" extended to include `core/README.md:68` and comment-only sites at `gate-logic.js:617,719`, `loop-describe-tool.js:94,101`, `meta-state-resolve-tool.js:84`, `meta-state-promote-rule-tool.js:21`. Phase 1 also adds `core/patterns.json` key DELETE (not rename) per Finding 14.
- **Atomic-commit group:** plan.md "Migration safety" expanded with `promotedRulesCache` + `invalidateCache` requirement (Finding 13). Phase 5 §5.4 criterion corrected to `rule_count === 9` (Finding 2) and combined with 5.3 to address stale-warning window (Finding 8).
- **Phase 2 description field:** Phase 2 §"How to edit" extended to rewrite the `description` field on the 6 lines (Finding 1). Phase 5 §5.2 grep widened to include `meta-state.jsonl`.
- **Phase 6 YAML:** `dependencies: [4, 7]` → `dependencies: [4]` (Finding 4). Phase 6 marked as separate docs PR by default in plan.md "Dependencies" (Finding 12).
- **Phase 7 source-of-truth:** line citations corrected (`meta-state.js:161` → `:162`, etc.); both `TERMINAL_STATUSES` sets documented (`core/meta-state.js:91` schema-enum + `core/constants.js:32` predicate-effective) per Finding 5.
- **Phase 7 §7.7:** restricted to single forward-reference paragraph (archive-rule reconciliation deferred to its own phase) per Finding 11.
- **`meta-260714T1334Z` handoff:** plan.md `related:` block + "Out of scope" updated with explicit resolver-must-use-`agent-checklist` note (Finding 9). Operator followup: file a rename-time journal entry pointing future resolvers at the new schema.
- **Operator Decision Conflict (Findings 7, 10):** documented in the Red Team Review table; not silently reverted. Operator decides at execution time.

**Unresolved contradictions:** none. The two deferred findings (7, 10) are flagged but do not break the plan; operator can decide to apply or reject at execution time.

## Validation Log

### Session 1 — 2026-07-14
**Trigger:** `/ck:plan validate` post-red-team review (13 of 15 findings applied; 2 deferred to operator decision).
**Questions asked:** 4
**Tier:** Standard (skip — Red Team Review section exists with verification evidence per Step 2.5 guard).

#### Questions & Answers

1. **[Scope]** Phase 6 has an independent cause (assertinvariant report) but edits `docs/meta-state-lifecycle.md` alongside phases 4 + 7. Plan recommends "ship as separate docs PR by default" (red-team Finding 12). What's the actual scheduling?
   - Options: Separate docs PR (Recommended) | Ride the atomic rename commit | Fold into Phase 7
   - **Answer:** Ride the atomic rename commit
   - **Rationale:** Phase 6's loop-design + change-log edits ride the rename PR for one-review-cycle simplicity. Phase 6 has no schema-validation coupling so it's safe to ride; its docs-only edits don't risk the atomicity constraint.
   - **Trade-off:** Larger rename PR diff; loses the "independent cause" separation. Acceptable for one-time vocab-alignment cycle.

2. **[YAGNI]** Phase 3 renames 5 test files for "vocabulary consistency". Red-team Finding 7 flagged this as gold-plating — vitest uses glob discovery. Original decision was operator-approved 2026-07-14. Apply, modify, or revert?
   - Options: Keep all 5 (operator-locked) | Keep 2 path-matching renames only (Recommended) | Drop all renames
   - **Answer:** Keep 2 path-matching renames only (Recommended)
   - **Rationale:** Drop the 3 role-naming renames (`gate-logic-consult-checklist-{process-hints-coverage,fallow-brief,tool-integration}.test.js`) — those names describe the rule's domain role, not its pattern_type literal. Keep only the 2 renames where the filename literal matches the renamed enum value: `gate-logic-consult-checklist.test.js → gate-logic-agent-checklist.test.js` and `gate-resolution-evidence.test.js → gate-determinism-checklist.test.js`.
   - **Trade-off:** 2 of 5 renames kept; saves 3 `git mv` + 3 safety-greps with zero discoverability loss.

3. **[Architecture / Tradeoff]** Operator decision #2 keeps `regex`/`glob` for the 3 advisory rules. Red-team Finding 10 + source report §Inconsistency B flagged these as dead match specs (`applyPromotedRules` skips non-gate rules at `gate-logic.js:757`). Apply, modify, or keep?
   - Options: Keep regex/glob (operator-locked) | Reclassify all 3 to agent-checklist (Recommended) | Document asymmetry only
   - **Answer:** Reclassify all 3 to `agent-checklist` (Recommended)
   - **Rationale:** Eliminates Inconsistency B (dead match specs). The 3 rules (`rule-short-slug-for-risk-records`, `rule-import-chain-analysis-after-tool-deletion`, `rule-assertinvariant-at-boundary`) become `agent-checklist` with checklist-body `pattern` strings. H6 ordering gate grows from 4 to 7 `agent-checklist` rules; each needs a PROCESS_HINTS row.
   - **Trade-off:** Substantive scope expansion: 3 more registry edits, 3 more description rewrites, 3 new PROCESS_HINTS rows + mirror in `.factory/hooks/loop-surface-inject.cjs`. The `pattern` body changes shape (regex string → JSON checklist string). Gate-enforcement behavior identical (skipped in both states); agent-facing content changes.

4. **[Scope / Atomicity]** Phase 4's vocabulary axis note is editorial. Red-team F2 noted it could safely ship in a separate docs commit. Is Phase 4 in the atomic commit, or after it?
   - Options: Keep phases 1-4 atomic (Recommended) | Drop Phase 4 from atomic
   - **Answer:** Keep phases 1-4 atomic (Recommended)
   - **Rationale:** Phase 4 co-rides for diff cleanliness; one PR for the vocab rename. Phase 5.4b's `rule_count === 9` + `warnings: []` cross-check catches intermediate state.

#### Confirmed Decisions

- **Decision 1 (Phase 6 ship):** Rides the atomic rename commit. Phase 6's docs edits land with phases 1-4 in one PR.
- **Decision 2 (Phase 3 renames):** Drop 3 role-naming renames; keep only the 2 path-matching renames.
- **Decision 3 (Operator decision #2):** Reclassify 3 `agent + regex/glob` advisory rules to `agent-checklist` with checklist-body patterns. This reverses the original operator decision.
- **Decision 4 (Atomic scope):** Phases 1-4 remain atomic; Phase 6 added to the atomic group per Decision 1.

#### Action Items

- [ ] Phase 1: extend PROCESS_HINTS to 7 rows (rows 6, 7, 8 for the 3 reclassified advisory rules) + mirror in `.factory/hooks/loop-surface-inject.cjs`
- [ ] Phase 2: extend migration table to 9 rules (add `rule-short-slug-for-risk-records`, `rule-import-chain-analysis-after-tool-deletion`, `rule-assertinvariant-at-boundary`)
- [ ] Phase 2: rewrite `pattern` body for the 3 reclassified rules to JSON checklist shape
- [ ] Phase 3: drop 3 renames; keep 2 (`gate-logic-consult-checklist.test.js → gate-logic-agent-checklist.test.js`, `gate-resolution-evidence.test.js → gate-determinism-checklist.test.js`)
- [ ] Phase 4: drop the regex/glob-as-advisory framing from the vocabulary axis note (now says regex/glob survive only for gate-enforced rules)
- [ ] Phase 5: §5.4b expects 7 `agent-checklist` rules (was 4); H6 gate emits 0 warnings means all 7 have PROCESS_HINTS rows
- [ ] Phase 5 dependencies: include phase 6 (now atomic)
- [ ] Phase 6 body: change "default: separate docs PR" to "rides the atomic rename commit per validation Q1"

#### Impact on Phases

- **Phase 1**: 3 new PROCESS_HINTS rows required (rows 6, 7, 8). Each row must mirror byte-for-byte in `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS. Cold-session parity test (`__tests__/legacy-mcp/cold-session-discoverability.test.cjs:359-379`) must still pass.
- **Phase 2**: migration table grows from 6 to 9 records (3 reclassified advisory rules). Description-rewrite section grows correspondingly. The 3 reclassified rules' `pattern` field changes shape (regex/glob string → JSON checklist string).
- **Phase 3**: rename list shrinks from 5 to 2.
- **Phase 4**: vocabulary axis note rewrites the regex/glob section — "regex/glob survive only for the 2 gate-enforced rules" (was "regex/glob are match-language rules, gate-enforced").
- **Phase 5**: dependencies bump to `[1, 2, 3, 4, 6]` (was `[1, 2, 3, 4]`). §5.4b expectation shifts: 7 agent-checklist rules must each have a PROCESS_HINTS row.
- **Phase 6**: body text changes to reflect "rides the atomic rename commit". YAML `dependencies` stays `[4]` (Phase 4 is the only prerequisite content-wise; the atomic-group ship is an execution-time decision).

### Whole-Plan Consistency Sweep (post-validation)

Re-read `plan.md` and all 7 phase files after applying validation decisions. Reconciled:

- **Phase 6 schedule reversal:** plan.md "Dependencies" updated to include Phase 6 in the atomic-commit group; Phase 6 body says "rides the atomic rename commit per validation Q1". Reverse of red-team Finding 12's recommendation — operator chose differently.
- **Phase 3 rename reduction:** 5 → 2 renames. The 3 dropped renames are role-naming, not pattern-literal-naming. Phase 3 body needs corresponding edit (in Action Items).
- **3 reclassified rules propagate everywhere:** plan.md Operator decisions #2, Migration safety, Acceptance Criteria #2, Out of scope all reflect the new distribution (7 agent-checklist + 2 determinism-checklist + 2 regex + 0 glob). Phase 2 migration table grows. Phase 1 grows PROCESS_HINTS rows. Phase 5 §5.4b grows agent-checklist count check.
- **Decision #2 reversal:** original "keep regex/glob" was operator-locked; validation Q3 reversed it. Documented in the Validation Log so the reversal is auditable.
- **PROCESS_HINTS row count grows:** 4 → 7 rows. Both `core/loop-introspect.js` and `.factory/hooks/loop-surface-inject.cjs` need 3 new rows added; parity test must still pass.

**Unresolved contradictions:** none. The validation decisions are internally consistent across all plan files after the propagation.