---
phase: 4
title: "vocabulary-axis-note"
status: pending
effort: ""
dependencies: [1]
---

# Phase 04 — docs

Minimal: make the renamed vocabulary self-documenting. The full L2 state-mapping matrix is explicitly
out of scope (deferred to a separate doc task).

## `tools/learning-loop-mastra/docs/schemas.md` (tool doc)

- L97 `pattern_type` enum table row → `regex, glob, determinism-checklist, agent-checklist`.
  (Edit may already be in phase-01; ensure it's done.)

## `docs/meta-state-lifecycle.md` (concept-adjacent L2 note)

Add a short paragraph to the Rule section (after the existing rule bullets around L134-140). Keep it
≤ 6 lines. Proposed text:

> **pattern_type names the consumption axis.** `agent-checklist` rules (7 total: 4 original
> `consult-checklist` + 3 reclassified advisory rules per validation Q3) are state-2: deterministic
> injection (a PROCESS_HINTS row, enforced by the H6 ordering gate in `loop_describe`) + agentic
> consumption (the model interprets the checklist). `determinism-checklist` rules (2 total) are
> state-3: the `meta_state_resolve` consult-gate evaluates them deterministically and blocks on drift
> (`rule-no-orphaned-evidence`). **`regex` and `glob` survive only for the 2 gate-enforced rules**
> (`rule-no-new-artifact-types` regex, `rule-project-skill-boundary` glob) — match-language,
> state-3: `regex` matches bash commands, `glob` matches write paths. (The 3 `agent + regex/glob`
> advisory rules were `agent`-skip-by-`applyPromotedRules`-at-`gate-logic.js:757`-regardless, so
> renaming them to `agent-checklist` with checklist bodies — see Phase 2 — eliminates the dead
> match specs without changing gate behavior.) `enforcement` mirrors consumption: `gate` = state-3
> deterministic, `agent` = state-2 agentic.

This is the minimum that makes the new names readable without the fuller matrix. It also indirectly
states the consult-checklist↔PROCESS_HINTS↔H6 contract — the generalization whose absence caused
`meta-260714T1334Z` — though the *full* contract doc is deferred.

## Do NOT change

- `consult-gate` (concept term) in `docs/philosophy.md`, `docs/loop-engine.md`,
  `docs/trajectory.md`, `docs/meta-state-lifecycle.md`, `AGENTS.md`. Per operator decision 3, the
  concept term stays; only the implementation enum values change. The two are now lexically distinct
  (`agent-checklist` vs `consult-gate`) so the collision is broken.
- `docs/loop-engine.md:60` table row ("rule | ... | a consult-gate; a checklist") — "checklist" here
  is generic concept vocabulary, not the enum value. Leave it.
- Any `docs/journals/` or `docs/_archive-260703/` history.

## Constraints

- Stay under `docs.maxLoc` (800). The added note is ~6 lines.