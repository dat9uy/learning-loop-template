---
phase: 5
title: "Document Three-Mechanism Boundary + Correct Stale Descriptions"
status: completed
priority: P2
effort: "1.5h"
dependencies: [3]
---

# Phase 5: Document Three-Mechanism Boundary + Correct Stale Descriptions

## Overview

Make the three-mechanism separation (finding #3) durable in the docs and fix the stale tool descriptions/comments that mislead the runtime (finding #2 symptom). The boundary: **(1a)** "findings related to a file" is solved by `file-index.jsonl` (every finding with `evidence_code_ref` is grounded; `check_grounding`/`refresh_file_index`/`query_drift` answer "all findings on this file") — **not a relationship edge**; **(1b)** lifecycle lineage is carried by kind-pair-typed edges (`supersedes`, `consolidated_into`, `consolidates`, `addresses`, `proposed_design_for`, `origin`, `applies_to_resolution`) — **keep**; **(2)** "solve one → resolve other" (cascade) is a closure **policy** (state transition) glued to the `reopens` edge via `cascade_from`, **not a relationship type**. Explicitly **do not** add a generic `related_to` field (DX trap: optional + vague → inconsistent → unqueryable). Document the `reopens`/`cascade_from` drop as an observable YAGNI deferral. Correct the stale `meta_state_promote_rule` description + the misplaced `meta_state_touch` comment. No code behavior change.

## Requirements

- Functional: add a "Three-Mechanism Boundary" section to `docs/meta-state-lifecycle.md` (the L1 mechanism surface) and a cross-reference paragraph in `docs/architecture.md`'s "Meta-State Self-Learning Loop" L3 section, stating the separation: file-index = findings-on-a-file; typed edges = lifecycle lineage; cascade = closure policy. Link to `core/entry/relationship-graph.js` as the single relationship source of truth (post-Phase-3).
- Functional: state the `related_to` non-decision explicitly (no generic relationship field; rationale: optional+vague→unqueryable) so a future operator does not re-propose it.
- Functional: record the `reopens`/`cascade_from` deferral: they are KEPT; the structural drop waits on finding #3's YAGNI gate (a real >2 recurrence cluster); the 2 hint slugs (`reopens` L94, `reopens-script` L130 in `core/hint-registry.js`) + 4 live `reopens` edges remain. Reference the gate so it is observable when it fires.
- Functional: add a **docs note** (NOT a session-start hint — red-team R10) in the three-mechanism boundary section of `docs/meta-state-lifecycle.md` that names `core/entry/relationship-graph.js` as the single source for cross-ref field resolution + the write-time RI rule — so the runtime is not misled into per-site logic again. A write-boundary rule is enforced by `assertinvariant` at the write site, not by session-start injection; adding a hint would churn the injection budget for a rule agents need at write time, not discovery time.
- Functional: correct the stale `meta_state_promote_rule` tool description (`tools/handlers/meta-state-promote-rule-tool.js:15-16`) to mention the relationship model it writes (`origin`, the structural cross-ref the RI check validates) + the finding status reset + the agent-checklist hint fields. Remove the misplaced `meta_state_touch` comment (`:91-92` — `meta_state_touch` has no `reopens`/`entry_id` param; it mirrors the validate tool's `collectClaimed`).
- Non-functional: docs changes only (no behavior change); verify links + claims against source after editing.

## Architecture

```
docs/meta-state-lifecycle.md   ← MODIFY
  + "## Three-Mechanism Boundary" section (after the Relationship/lineage prose):
      (1a) file-index — findings-on-a-file (evidence_code_ref grounding); NOT a relationship edge
      (1b) typed lifecycle edges — supersedes/consolidated_into/consolidates/addresses/proposed_design_for/
           origin/applies_to_resolution; carried by relationship-graph.js (single source)
      (2)  cascade — a closure POLICY (state transition) on the reopens edge via cascade_from; NOT a relationship type
      - no related_to field (non-decision, with rationale)
      - reopens/cascade_from KEPT; drop deferred under the YAGNI gate (reference finding #3)
  + cross-link to docs/architecture.md and to core/entry/relationship-graph.js

docs/architecture.md   ← MODIFY
  + paragraph in "Meta-State Self-Learning Loop" L3 section: the relationship model is centralized in
    core/entry/relationship-graph.js (cross-ref table, forward+inverse, write-time RI, wire shape);
    three-mechanism boundary → docs/meta-state-lifecycle.md; no related_to; reopens/cascade_from deferred

core/hint-registry.js   ← MODIFY (discoverability hint) or docs note
  + a hint pointing to relationship-graph.js as the single relationship source + the write-time RI rule

tools/handlers/meta-state-promote-rule-tool.js   ← MODIFY (:15-16) — correct stale description
tools/handlers/meta-state-touch-tool.js         ← MODIFY (:91-92) — remove misplaced reopens comment
```

### Why `related_to` is a non-goal (documented, not just omitted)

A generic `related_to: string[]` field is the natural "just link them" instinct — but it is optional and semantically empty: one agent links `related_to` for "same subsystem", another for "same symptom", another for "fixes-like". The field becomes inconsistent, then unqueryable, then ignored. The typed edges (`supersedes` = "this replaces that", `addresses` = "this design fixes that finding") carry meaning, so they query. The boundary doc records this so the field is not re-proposed each time someone hits a "but how do I link X to Y?" moment — the answer is: use the typed edge that means what you mean, or `reopens` for the stale-succession case, or free-text in `description` for soft context.

### Why the deferral must be recorded (not just done)

Approach C keeps `reopens`/`cascade_from` and the 2 hint slugs. The 4 live `reopens` edges are all already `resolved`/`superseded` — the cascade's active payoff is gone (matches finding #3's thesis), but the mechanism is more used than #3's "1 observed cascade" audit suggested. Deferring the drop without recording *why* and *when it fires* would let it drift into permanent debt with no trigger. The boundary doc records the YAGNI gate (a real >2 recurrence cluster) so a future operator can observe when it fires and revisit the drop. This makes the deferral a deliberate, observable decision, not a silent one.

## Related Code Files

- Modify: `docs/meta-state-lifecycle.md`, `docs/architecture.md`, `tools/handlers/meta-state-promote-rule-tool.js` (`:15-16`), `tools/handlers/meta-state-touch-tool.js` (`:91-92`)
- Modify (discoverability): `tools/learning-loop-mastra/core/hint-registry.js` (add/repoint a hint) OR a docs note — decide per the existing hint conventions
- Read (verify claims against source): `core/entry/relationship-graph.js` (post-Phase-3), `core/meta-state.js` (schema fields), `core/hint-registry.js` (`reopens:94`, `reopens-script:130`), `docs/loop-engine.md` (L1 exit roles), `docs/observation-staleness.md` if it exists

## Implementation Steps (no code behavior change)

### Implementation

1. Read `docs/meta-state-lifecycle.md` fully (already done in planning) — locate the insertion point after the relationship/lineage prose (near the "Finding Exit Roles" + "Change-Log, Rule, Loop-Design Status Models" sections). Add the "## Three-Mechanism Boundary" section per the Architecture block. Verify each typed edge named still exists in `relationship-graph.js`'s `CROSS_REFS` (Phase 2/3).
2. Read `docs/architecture.md` "Meta-State Self-Learning Loop" section — add the centralization paragraph + three-mechanism cross-link. Verify the line counts/links (`docs/meta-state-lifecycle.md`, `core/entry/relationship-graph.js`).
3. Add the discoverability hint: prefer extending an existing hint slug in `core/hint-registry.js` (e.g. `surface-split` or a new `relationship-source`) pointing to `relationship-graph.js` + the write-time RI rule (rule hint 8). Follow the `{ slug, kind, text, suggestion, derived_from_rule }` shape. If a docs note is simpler (no hot-path injection needed), use that instead — the runtime steering already points to AGENTS.md; a docs note may suffice. Decide per whether agents need this at session start (it's a write-boundary rule → a hint is justified).
4. Correct the `meta_state_promote_rule` description (`:15-16`): mention it writes a `rule` entry with `origin: <finding-id>` (the structural cross-ref the write-time RI validates), resets the finding status to `open`, and accepts agent-checklist `hint_text`/`hint_suggestion`/`hint_slug`. Match the actual handler behavior (read `meta-state-promote-rule-tool.js` first to ground the description — do not describe fields it doesn't accept).
5. Remove the misplaced `meta_state_touch` comment (`:91-92`). Confirm `meta_state_touch` takes no `entry_id`/`reopens` (read the tool) before removing.

### Verification

6. Verify every doc claim against source: each typed edge in `relationship-graph.js#CROSS_REFS`; `reopens`/`reopens-script` hint slugs at the cited lines; `cascade_from` not persisted (`meta-state-resolve-tool.js:23`); the 4 live `reopens` edges (Phase 6 resolves them — reference, don't enumerate, in the evergreen doc).
7. Verify doc links resolve (`docs/meta-state-lifecycle.md`, `docs/architecture.md`, `core/entry/relationship-graph.js`).
8. Run the docs-touching tests if any (e.g. a doc-link checker); run `pnpm test` focused on hint-registry if a hint was added.

## Success Criteria

- [x] `docs/meta-state-lifecycle.md` has a "Three-Mechanism Boundary" section: file-index (findings-on-a-file, not an edge), typed lifecycle edges (the keep list), cascade (closure policy, not a relationship type); no `related_to`; `reopens`/`cascade_from` deferral recorded with the YAGNI gate
- [x] `docs/architecture.md` "Meta-State Self-Learning Loop" cross-references the boundary + names `core/entry/relationship-graph.js` as the single source
- [x] Discoverability hint (or docs note) points to `relationship-graph.js` + the write-time RI rule; follows the hint-registry shape
- [x] `meta_state_promote_rule` description corrected and grounded in the actual handler behavior; `meta_state_touch` misplaced comment removed
- [x] No `related_to` field introduced; no code behavior change; doc claims verified against source; links resolve

## Risk Assessment

**Low.** Docs + description-comment changes only; no behavior change. The one subtlety: the `reopens`/`cascade_from` deferral must reference the YAGNI gate *trigger* (a real >2 recurrence cluster), not just "deferred" — a vague deferral reads as permanent debt. Mitigation: name the gate concretely (finding #3's thesis + the 4-live-edges evidence) so it is observable. The `meta_state_promote_rule` description correction must be grounded in the actual handler (read it first) — describing fields it doesn't accept would re-introduce the "stale description" class of bug this phase removes. The discoverability hint choice (hot-path hint vs docs note) is the only judgment call: a write-boundary rule benefits from session-start surfacing, but adding a hint churns the injection budget — prefer a docs note unless the hint-registry already has room and the rule is high-stakes enough to warrant it. `check_runtime_agnostic` is unaffected (docs), but re-run if a hint is added to `hint-registry.js` (it's a runtime surface).
