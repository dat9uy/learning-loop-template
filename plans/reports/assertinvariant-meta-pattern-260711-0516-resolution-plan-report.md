# assertinvariant — meta-pattern + resolution plan

**Status:** proposed, awaiting operator ack
**Date:** 2026-07-11 05:16 (Bangkok)
**Author:** agent (dat9uy session)
**Technique:** Meta-Pattern Recognition (3+ domain rule satisfied — 7 domains counted) + Simplification Cascade (1 primitive, 5+ call sites, 5+ findings close)

## TL;DR

Findings `meta-260630T2110Z` and `meta-260711T0144Z` are two new instances of a recurring pattern already partially named in `meta-260629T2300Z`: **core-logic silently accepts inputs / silently fails writes / silently auto-corrects → agent pays debugging tax far from cause**. Pattern has 5+ instances; fix-points are 4 ad-hoc mechanisms (`assertWriteVisible`, `isSchemaBranchSupported`, `withRegistryLock`, inbound-gate markers). One missing primitive — **`assertinvariant(operation, {accept, returnOnFail, logTo})`** at the meta-state.js boundary — collapses all of them. **Universal scope**, per operator direction this session (narrow scopes are hand-wavy; this session proved it 3 times). Four loop-designs filed this session (two corrupted by a patch-tool bug — see § Operator action):

1. **`loop-design-assertinvariant-universal-scope`** — CANONICAL universal-scope primitive (every core-logic operation)
2. `loop-design-assertinvariant-core-logic-invariant-wrapper` — original 5-call-site scope (CORRUPTED — patch-tool bug)
3. `loop-design-migration-markers-on-change-log` — superseded narrow scope (CORRUPTED + inactive)
4. `loop-design-operation-envelope-on-change-log` — replaces design 2 with broader scope (8 batch-mutation kinds)

Both target findings stay `open` (deferred) until their designs ship. No code change this session.

## The principle: scope must be universal, not narrow

**Per operator direction (this session):** the assertinvariant primitive must apply to **every core-logic operation**, not a curated subset. Narrow scopes produce hand-wavy fixes that miss the next instance.

**Proof from this session — three narrow-scoped attempts that each missed:**

1. **Narrow design 2 to "migrations only"** — operator had to push back: pre/post counts are useful for drift-driven closeouts, consolidations, sweeps, backfills, archive waves, escalation batches too. Final scope: 8 batch-mutation kinds.
2. **Narrow scope question to "write-tools + file-readers only for v1"** — operator pushed back: this session's patch-tool corruption is exactly the kind of bug a v1 narrowing would have missed. The assertinvariant primitive must wrap `updateEntry`/`archiveEntry`/`deleteEntry` too, not just write-tools.
3. **Narrow patch-tool fix to "drop entry_kind from cleanPatch in updateEntry"** — that's a symptom fix. The universal primitive catches the entire *class* of identity-invariant violations, including ones not yet observed.

**Decision rule for scope (apply going forward):** if an operation owns an invariant that the agent depends on, it gets `assertinvariant`. Curating the call site list is a hand-wave — the next session will hit a domain that wasn't on the list, and we'll be back here. The primitive's cost is uniform; its benefit compounds with every call site.

The cascade table below lists the 5 currently-known call sites, but the primitive is not "five sites". It's "every site where the boundary check applies" — the 5 listed are seed sites; the rule is universal.

## The meta-pattern: 7 instances

| # | Finding | Subtype | Silent-failure shape |
|---|---|---|---|
| 1 | `meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m` | escape-hatch-abuse | Tool deleted without import-chain analysis → 11 stranded files across 4 cleanup plans |
| 2 | `meta-260619T2233Z-the-meta-state-log-change-mcp-tool-can-return-logged-true-an` | silent-persistence-fail | log_change → `logged:true` but no write (closed by PR #50) |
| 3 | `meta-260619T2237Z-the-meta-state-report-mcp-tool-silently-overwrites-an-operat` | mcp-tool-input-ignored | report → operator's id auto-replaced silently |
| 4 | `meta-260626T1419Z-meta-state-supersede-silent-persistence-fail-var` | silent-persistence-fail | supersede → `superseded:true` but no write (superseded by change-log 275) |
| 5 | `meta-260629T2300Z-files-like-meta-state-jsonl-that-participate-in-pre-commit-h` | pre-commit-ux-friction | Pre-commit consistency check auto-edits meta-state.jsonl; no stderr summary |
| 6 | **`meta-260630T2110Z-during-phase-e-plan-4-phase-1-i-made-a-runtime-state-record`** | **schema-vs-implementation-mismatch** | **`affected_system:'runtime-state'` accepted; `file-readers.js#L10` silently `continue`s** |
| 7 | **`meta-260711T0144Z-tools-learning-loop-mastra-tests-legacy-mcp-lifecycle-migrat`** | **test-fragility** | **Migration invariants expressed as counts; schema has no `migration_target/pre_count/post_count`** |

**Abstract form:** A core-logic operation completes from the **caller's perspective** but the **system's invariant** is violated or unrepresentable. The agent discovers this far from the cause and pays debugging tax (5+ minutes on finding #6; full test flake on finding #7).

## Cascade — one primitive, universal scope (5 seed call sites)

**Missing primitive: `assertinvariant(operation, {accept, returnOnFail, logTo})`** — boundary helper at `tools/learning-loop-mastra/core/meta-state.js`. Wraps any operation that owns an invariant; returns structured failure shape when violated.

**Scope:** every core-logic operation that owns an invariant the agent depends on. The 5 listed below are seed sites — the primitive is not "five sites", it's "every site where the boundary check applies" (see § The principle above).

| Seed call site | Currently | With `assertinvariant` |
|---|---|---|
| `core/file-readers.js#L10` lookup | `if (!constraints) continue;` silent | `{ok:false, reason:'unmapped_active_entry', affected_system, entry_id}` |
| `tools/handlers/meta-state-report-tool.js` id honoring | Auto-slugified silently | Assert response id matches request id; `{ok:false, reason:'input_overwritten'}` |
| `hooks/universal/pre-commit` consistency check | Auto-edit + change-log, no stderr summary | Emit stderr summary listing auto-fixes (id, field, before→after) |
| `tools/handlers/meta-state-batch-tool.js` migration | No landmark field | Accept `operation_envelope` (see design 3); auto-emit marker change-log |
| `tools rm` (gate consult) | No fail-loud on stranded importers | Consult-gate: refuse rm unless zero stranded importers |
| **`core/meta-state.js#updateEntry` (NEW this session)** | Empty patch silently overwrites `entry_kind` (this session's corruption) | Assert `entry.entry_kind` is unchanged after the patch; `{ok:false, reason:'identity_violated', field:'entry_kind'}` |
| **`core/meta-state.js#archiveEntry` (NEW)** | No check on entry_kind pre-archive | Same identity invariant |
| **`core/meta-state.js#deleteEntry` (NEW)** | No check on entry_kind pre-delete | Same identity invariant |

The last 3 rows are the proof from this session — they should not have been discovered by hitting a bug; they should have been wrapped by the universal primitive from day 1. With the universal scope, future operations added to `meta-state.js` (or any other core-logic surface) get the wrapper automatically via the rule `rule-assertinvariant-at-boundary`.

## Resolution for finding 1 (`meta-260630T2110Z`) — Path B

**Status:** stay `open`, resolves when `assertinvariant` ships.

**Implementation sketch:**
1. `file-readers.js#L10` wraps the lookup: when `status==='active'` AND `constraints === undefined`, return sentinel observation `{constraint_type:'unmapped-active-entry', affected_system, entry_id}`.
2. Inbound gate maps `unmapped-active-entry` to the same escalation path the existing constraint types use.
3. Add regression test: write an active entry with `affected_system:'runtime-state'`, assert gate escalates.
4. Resolve finding 1 with `meta_state_resolve` + resolution note citing the change-log entry.

**Why Path B (not A or C):**
- A (schema-narrow) requires migration + backfill of `runtime-state.jsonl`. Cost > benefit while the meta-pattern primitive is already in flight.
- C (operator-ack only) leaves the schema-vs-runtime mismatch latent; next operator hits it again.
- B composes with `assertWriteVisible` (PR #50 already shipped that shape) — same primitive, lower implementation cost.

## Resolution for finding 2 (`meta-260711T0144Z`) — loop-design + deferral

**Status:** stay `open`, resolves when migration-marker design ships.

**Already self-resolved parts:** the test file already removed brittle assertions (commit history per line 4 of the test).

**Remaining structural gap:** no `migration_target/pre_count/post_count/idempotency` field on change-log entries. Without it, post-migration tests can only assert counts (brittle) or absence (lose-loss tradeoff).

**Implementation:** see `loop-design-migration-markers-on-change-log`. New field on `applies_to` block (or root, TBD per Open Question #3). Auto-emitted by `meta_state_batch` when caller passes `migration_target`.

## Loop-designs filed this session

| ID | Scope | Severity | Status |
|---|---|---|---|
| `loop-design-assertinvariant-universal-scope` | **CANONICAL** — universal scope, every core-logic operation | high | **OK** — created cleanly this session via `propose_design`. Captures operator direction: "if not universal, the agent will hand-wavy". |
| `loop-design-assertinvariant-core-logic-invariant-wrapper` | Original 5-call-site scope | high | **CORRUPTED** — stored `entry_kind: "finding"`, should be `"loop-design"`. Blocked by patch-tool bug. Will be repaired by operator; when repaired, flips to inactive (superseded by the canonical universal-scope design). |
| `loop-design-migration-markers-on-change-log` | Original narrow scope (migration-only) | medium | **CORRUPTED + SUPERSEDED** — stored `entry_kind: "finding"`, should be `"loop-design"`. Flipped to `status: inactive` (superseded by the broader design), but the underlying entry_kind corruption remains. |
| `loop-design-operation-envelope-on-change-log` | Broader scope (8 batch-mutation kinds) — replaces design 2 | medium | **OK** — created cleanly via `propose_design` after the corruption was identified. |

**Why the universal-scope design supersedes the original 5-call-site design:** the original was scoped to "5 specific call sites" — but this session proved that's hand-wavy (the patch-tool bug hit a 6th domain not in the list). The canonical design's scope is universal: every core-logic operation that owns an invariant. The 5+ call sites are seed; the rule is universal.

**Why design 2 (migration markers) was superseded:** user's scope-expansion request — pre/post counts are useful beyond migrations (drift-driven closeouts, consolidations, sweeps, backfills, archive waves, escalation batches). Field placement: top-level on change-log (recommendation A). Granularity: `{total, by_status, by_kind}` (recommendation C). Kind enum: `migration | sweep | closeout | consolidation | backfill | archive-wave | escalation-batch | manual-batch`.

**Operator action needed:** the two corrupted entries are not findable via `entry_kind: "loop-design"` filters (loop_describe, meta_state_list, etc.) until the patch-tool bug is fixed and a repair script re-asserts `entry_kind: "loop-design"` on both designs. See `meta-260712T0053Z-...` (filed this session) for the bug analysis and recovery paths. The canonical universal-scope design is the one to reference going forward — the corrupted designs are historical artifacts of this session.

## Implementation order (universal scope)

1. Land **patch-tool fix first** — prevent empty patches from overwriting `entry_kind` (see `meta-260712T0053Z-...` for analysis). Then re-assert `entry_kind: "loop-design"` on the two corrupted designs.
2. Land design 3 (operation envelope) — narrower scope, one schema field, one batch path, one test-shape change. Closes finding `meta-260711T0144Z` in the same PR.
3. Land `loop-design-assertinvariant-universal-scope` (CANONICAL primitive) — composes design 3's envelope field, wraps **every core-logic operation that owns an invariant**: file-readers, report-tool, pre-commit, batch-tool, updateEntry, archiveEntry, deleteEntry, plus future operations added under `meta-state.js` or any other core-logic surface. Closes findings 6, 3, 5 + `meta-260712T0053Z-...` in the same PR. When this lands, `loop-design-assertinvariant-core-logic-invariant-wrapper` (corrupted) gets repaired and flipped to inactive via supersede.
4. Promote `rule-assertinvariant-at-boundary` — agent-side consult that fires when a new core-logic operation is added, reminding the agent to wrap with `assertinvariant`.
5. Resolve finding `meta-260711T0144Z` when design 3's PR merges.
6. Resolve findings 6, 3, 5 as each call site migrates to the primitive (likely single PR).
7. Finding 1 (`meta-260613T1615Z` import-chain) stays open until `tools rm` consult-gate lands — separate small PR.

**Why step 3 is universal, not 5-call-site:** per operator direction this session. Curating the call site list is hand-wavy; the next session will hit a domain not on the list. Universal scope + the rule from step 4 means the wrapper is added by default, and exceptions are deliberate operator decisions, not accidents.

## What this session does NOT do

- No code change to `core/file-readers.js`.
- No schema migration of `runtime-state.jsonl`.
- No resolution of either target finding (`meta-260630T2110Z`, `meta-260711T0144Z`).
- No rule promotion (rule entry is a future-step deliverable of design 1).
- No repair of the two corrupted designs (operator-mediated file edit needed).

## Unresolved questions

1. **Scope breadth (decided):** every core-logic operation. Universal, not narrow. Rationale + proof in § The principle above.
2. **Test shape:** should `assertinvariant` ship with a fixture-based golden test (like `buildStaleDispatchHints` Rec 10) that catches silent-success regressions across all call sites? Recommend yes — Rec 10 is the template. Test should cover identity-violation (this session's bug), input-overwritten, unmapped-active-entry, no-stderr-summary, and missing-envelope — one fixture per seed call site.
3. **Operation envelope field shape (decided):** top-level `operation_envelope` field on change-log, granularity `{total, by_status, by_kind}`, kind enum: `migration | sweep | closeout | consolidation | backfill | archive-wave | escalation-batch | manual-batch`.
4. **Pre-commit stderr channel:** existing `console.warn` sufficient, or new protocol (e.g., JSON line on stderr that the agent pattern-matches)? Existing channel is fine; defer new protocol until needed.
5. **Rule entry name (decided):** `rule-assertinvariant-at-boundary` — names the boundary check. Agent-side consult that fires when a new core-logic operation is added.
6. **Patch-tool repair path:** the meta-finding `meta-260712T0053Z-...` describes the corruption; recovery options are (a) operator-mediated direct file edit, (b) new `meta_state_repair_entry_kind` tool, (c) fix patch-tool + repair script. Decision needed before the assertinvariant primitive ships. Recommend (c) — fix patch-tool as part of design 1's universal scope, then repair script.
7. **Wrapper location:** should `assertinvariant` live in `core/meta-state.js` (close to the bug) or a new `core/operation-invariant.js` (separation of concerns)? Recommend new file — the universal scope means it touches many files; co-location with meta-state.js risks muddying the boundary.