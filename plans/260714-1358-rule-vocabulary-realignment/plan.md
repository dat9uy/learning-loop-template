# Rule vocabulary realignment

Status: proposed. Scope locked with operator (2026-07-14). Defers `meta-260714T1334Z` to a later
session — that finding is **out of scope** here; only its *cause* (undocumented consult-checklist
injection contract) is indirectly addressed by the L2 note in phase-04.

## Why

The `rule` record has two orthogonal axes — `pattern_type` (match shape) and `enforcement`
(consumption axis) — but the vocabulary overloads "consult" across two opposite states:
`consult-checklist` (state-2, agentic consumption) and `consult-gate` (state-3, deterministic
block, realized by `resolution-evidence-required`). One `agent`-labelled rule (`rule-no-orphaned-
evidence`) hard-blocks `meta_state_resolve`, contradicting `AGENTS.md:65` ("agent = consult").
See `plans/reports/rule-paradigm-260714-1349-pattern-type-vs-state-axes-report.md` for the full
analysis. The L1 concept (`docs/loop-engine.md`) and L2 state model (`docs/philosophy.md`) are sound;
the defect is L3 encoding + vocabulary, not concept.

## Operator decisions (locked)

1. Relabel `rule-no-orphaned-evidence` `enforcement: agent → gate` (no behavior change; it already
   hard-blocks resolve). Restores `enforcement=gate ↔ state-3` uniformly.
2. Keep `regex`/`glob` as pattern_types for the 3 `agent + regex/glob` advisory rules — they name
   the match shape the agent consumes; renaming to "checklist" would erase that signal.
3. Rename pattern_type enum: `consult-checklist → agent-checklist`,
   `resolution-evidence-required → determinism-checklist`. Final enum:
   `{regex, glob, agent-checklist, determinism-checklist}`. The `-checklist` family encodes the
   consumption axis (`agent-*` = state-2 agentic, `determinism-*` = state-3 deterministic), mirroring
   philosophy's agentic/deterministic split. Concept term `consult-gate` (docs) stays — it lives on
   the concept surface and is now lexically distinct from `agent-checklist`.
4. Scope = vocabulary realignment only.

## Migration safety (load-bearing constraint)

`loadPromotedRules` (`gate-logic.js:587`) validates each rule with `metaStateRuleEntrySchema.safeParse`
and **warn-and-skips** on failure. Therefore the schema enum, all code references, AND the 6 migrated
registry records must land in **one atomic commit**. A split commit creates a window where the 6 rules
are silently dropped from gate enforcement (graceful degradation, not a crash — but a correctness
regression). `readRegistry` (`meta-state.js:510`) is a lenient `JSON.parse` (no validation on read),
so the only strict-validation path is `loadPromotedRules` + writes.

## Phases

- `phase-01-schema-and-core-code.md` — enum rename + all core/handler code references.
- `phase-02-registry-migration.md` — 6 records in `meta-state.jsonl` + enforcement relabel.
- `phase-03-tests.md` — update test bodies + rename test files.
- `phase-04-docs.md` — `tools/.../docs/schemas.md` enum table + short L2 axis-naming note in
  `docs/meta-state-lifecycle.md`.
- `phase-05-verify.md` — `pnpm test` (vitest-results.json procedure), grep guard, H6/resolve-gate
  presence checks.
- `phase-06-lifecycle-docs-update.md` — `docs/meta-state-lifecycle.md` loop-design + change-log
  lifecycle terms consistent with the assertinvariant report (`meta_state_ship_loop_design`,
  `operation_envelope`). Docs-only; independent of the rename.
- `phase-07-finding-status-lifecycle-doc.md` — `docs/meta-state-lifecycle.md` finding-status
  sections rewritten to the post-migration model (`{open,resolved,superseded}`+archived; `stale` =
  derived view; `meta_state_ack`/`reported`/`auto-resolved` removed). Docs-only; driven by plans
  `260611-1000` + `260707-0812`, not the assertinvariant report.

## Dependencies

Phases 1+2+3 must commit together (atomicity). Phase 4 (docs) can be the same commit. Phase 5 is the
gate before commit. Suggested commit order: do 1→2→3→4, run 5, fix anything 5 surfaces, then one
`git commit` covering all.

Phase 6 is **independent of the rename** (different cause — the assertinvariant report, not the
vocabulary collision) but edits the same file as phase 4 (`docs/meta-state-lifecycle.md`), so do 4
and 6 in one doc-edit pass to avoid a stale intermediate. It may ride the atomic commit or ship as a
separate docs-only commit — operator choice at execution time. If separate, phase 6 has no code
dependency and can land before or after the rename.

Phase 7 is also docs-only and also edits `docs/meta-state-lifecycle.md` (the finding-status sections,
a different cause again — plans `260611-1000` + `260707-0812`). Do phases 4 + 6 + 7 in **one
doc-edit pass** so the file is consistent at each save; all three may ride the atomic commit or ship
together as a separate docs commit.

## Acceptance criteria

1. `metaStateRuleEntrySchema` enum is `{regex, glob, agent-checklist, determinism-checklist}`; old
   values appear nowhere in `tools/` source (grep guard, excluding historical `.gate-decision.log` /
   `gate-log.jsonl` lines and `plans/`/`docs/journals/` history).
2. `meta-state.jsonl`: the 4 `consult-checklist` rules are `agent-checklist`; the 2
   `resolution-evidence-required` rules are `determinism-checklist`; `rule-no-orphaned-evidence`
   `enforcement` is `gate`.
3. `pnpm test` green. H6 warm tier sees all 4 `agent-checklist` rules (no "no PROCESS_HINTS row"
   warning). `meta_state_resolve` still fires `rule-no-orphaned-evidence` (determinism-checklist,
   gate).
4. `docs/meta-state-lifecycle.md` has a short note: `agent-*` pattern_types = state-2 agentic
   consumption; `determinism-*` + regex/glob = state-3 deterministic consumption; regex/glob are
   match-language rules (gate-enforced).
5. (Phase 6) `docs/meta-state-lifecycle.md` loop-design section names `meta_state_ship_loop_design`
   as the active→inactive tool and states `meta_state_patch` cannot set `status` (deny-list); the
   change-log section documents `operation_envelope` (8 kinds, `{total,by_status,by_kind}` counts,
   `content_hash`, auto-emitted by `meta_state_batch`, `case "write"` rejects caller-supplied); the
   Tools table has a `meta_state_ship_loop_design` row.
6. (Phase 7) `docs/meta-state-lifecycle.md` finding-status sections use `{open, resolved,
   superseded}` (+ `archived` runtime-only), describe `stale` as the `isStaleView` derived view (not
   a status), and contain **no normative** `reported`/`active`/`auto-resolved`/`meta_state_ack`/TTL
   text (legacy mentions only in "removed in …" explanatory sentences). The Tools table has no
   `meta_state_ack` row; `meta_state_report` → `open` (no TTL); `meta_state_sweep` is read-only;
   `meta_state_re_verify` makes no status transition.

## Out of scope (deferred)

- The full L2 pattern_type→state mapping matrix + the consult-checklist↔PROCESS_HINTS↔H6 contract
  written as a general pattern (report Part-4 items 3–5). Only the minimal axis-naming note ships
  here; the fuller doc is a separate doc task.
- `meta-260714T1334Z` fix (the test-parse consult-checklist rule + PROCESS_HINTS row). Later session.
- Renaming the docs concept term `consult-gate`.
- Retyping the 3 `agent + regex/glob` advisory rules (they stay regex/glob per decision 2).
- The **Finding status lifecycle** section was previously listed here as deferred; it is now
  in-scope as **phase 7**.