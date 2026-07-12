# assertinvariant — meta-pattern + resolution plan

**Status:** Implementation 1 SHIPPED (PR #51, 2026-07-12); **Implementation 2 SHIPPED (PR #52, 2026-07-12)**; Implementation 3 (universal primitive, `loop-design-assertinvariant-universal-scope`) is the canonical work — NEXT
**Date:** 2026-07-11 05:16 (Bangkok, original report); 2026-07-12 (Implementation 1 + Implementation 2 closeouts appended)
**Author:** agent (dat9uy session)
**Technique:** Meta-Pattern Recognition (3+ domain rule satisfied — 7 domains counted) + Simplification Cascade (1 primitive, 5+ call sites, 5+ findings close)

## TL;DR

Findings `meta-260630T2110Z` and `meta-260711T0144Z` are two new instances of a recurring pattern already partially named in `meta-260629T2300Z`: **core-logic silently accepts inputs / silently fails writes / silently auto-corrects → agent pays debugging tax far from cause**. Pattern has 5+ instances; fix-points are 4 ad-hoc mechanisms (`assertWriteVisible`, `isSchemaBranchSupported`, `withRegistryLock`, inbound-gate markers). One missing primitive — **`assertinvariant(operation, {accept, returnOnFail, logTo})`** at the meta-state.js boundary — collapses all of them. **Universal scope**, per operator direction this session (narrow scopes are hand-wavy; this session proved it 3 times). Four loop-designs filed (all now `entry_kind:"loop-design"` after Implementation 1 repair — see § Loop-designs filed this session):

1. **`loop-design-assertinvariant-universal-scope`** — CANONICAL universal-scope primitive (every core-logic operation) — Implementation 3
2. `loop-design-assertinvariant-core-logic-invariant-wrapper` — original 5-call-site scope — repaired, ACTIVE (canonical replacement)
3. `loop-design-migration-markers-on-change-log` — superseded narrow scope — repaired, ACTIVE (sub-piece)
4. `loop-design-operation-envelope-on-change-log` — replaces design 2 with broader scope (8 batch-mutation kinds) — Implementation 2

**Implementation status:**

- **Implementation 1 (PR #51, 2026-07-12) — SHIPPED.** Patch-tool fix (Fix A: `buildPatchSchemaFor` omits `entry_kind` + `status` on the appropriate branches; Fix B: `updateEntry` strips smuggled `entry_kind`) + repair of the two corrupted loop-design entries via `meta_state_batch` + Phase 2 stopgap (`IMMUTABLE_PATCH_FIELDS` includes `entry_kind` + `status`). Finding `meta-260712T0053Z` (the patch-tool corruption) stays `open` — its CLASS closes with Implementation 3's universal wrapper. 5 new RED→GREEN tests + 13 regression tests; `gate:self-verify` passes (1776 tests total). Three change-logs filed: code fix (`meta-260712T0212Z-...`), data repair (`meta-260712T0213Z-...`), Phase 2 stopgap (`meta-260712T0214Z-...`).
- **Implementation 2 (PR #52, 2026-07-12, plan `260712-0300-change-log-operation-envelope`) — SHIPPED.** Schema field `operation_envelope` on change-log with `kind`, `target`, `pre_count`, `post_count`, `content_hash`. New helper `core/operation-envelope.js` owns envelope construction/validation (`KIND_OP_COMPATIBILITY`, `normalizeLegacyStatus`, `content_hash`); `meta_state_batch` auto-emits after the ops loop; `case "write"` rejects caller-supplied envelopes (forge-vector guard); `BATCH_SIZE_LIMIT` centralized in `core/constants.js` (closes 100-vs-500 default divergence red-team found); `IMMUTABLE_PATCH_FIELDS` extended with `operation_envelope`. ~2817 lines / 22 files. Two change-logs filed: `meta-260712T0437Z-...` (batch integration + auto-emit) and `meta-260712T0438Z-...` (deny-list extension + write-path reject). Finding `meta-260711T0144Z` **resolved** by this PR (resolution note in `meta-state.jsonl:271` cites "Closed by plan 260712-0300 Phase 2"). Forward-looking test in `change-log-operation-envelope.test.js` (503 lines) replaces brittle count assertions.
- **Implementation 3 (NEXT/CANONICAL) — `loop-design-assertinvariant-universal-scope`.** Universal `assertinvariant` primitive, wraps every core-logic operation that owns an invariant. Closes findings 6, 3, 5, 7, `meta-260712T0053Z`, the remaining latent identity-injection class on the batch path, AND replaces the now-3-entry `IMMUTABLE_PATCH_FIELDS` deny-list (`entry_kind`, `status`, `operation_envelope`) wholesale with a before/after identity comparison. Replaces `loop-design-assertinvariant-core-logic-invariant-wrapper` (original 5-call-site design) via supersede.
- Finding `meta-260630T2110Z` stays `open` (deferred) until Implementation 3 ships; `meta-260711T0144Z` is **resolved** (closed in PR #52).

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
| `loop-design-assertinvariant-universal-scope` | **CANONICAL** — universal scope, every core-logic operation | high | **OK** — created cleanly this session via `propose_design`. Captures operator direction: "if not universal, the agent will hand-wavy". Implementation 3. |
| `loop-design-assertinvariant-core-logic-invariant-wrapper` | Original 5-call-site scope | high | **REPAIRED (Implementation 1, PR #51)** — `entry_kind:"loop-design"` re-asserted via `meta_state_batch` (change-log `meta-260712T0213Z-...`). ACTIVE; canonical replacement (`loop-design-assertinvariant-universal-scope`) flips it to inactive via supersede when Implementation 3 ships. |
| `loop-design-migration-markers-on-change-log` | Original narrow scope (migration-only) — superseded by design 4 | medium | **REPAIRED (Implementation 1, PR #51)** — `entry_kind:"loop-design"` re-asserted via `meta_state_batch`. ACTIVE — kept as the sub-piece (narrow migrations) for narrative continuity; design 4's broader scope is the shipping surface. |
| `loop-design-operation-envelope-on-change-log` | Broader scope (8 batch-mutation kinds) — replaces design 2 | medium | **SHIPPED (Implementation 2, PR #52)** — `core/operation-envelope.js` (357 lines) + schema field + auto-emit; will flip to `inactive` via supersede when the universal wrapper (Implementation 3) lands. |

**Why the universal-scope design supersedes the original 5-call-site design:** the original was scoped to "5 specific call sites" — but this session proved that's hand-wavy (the patch-tool bug hit a 6th domain not in the list). The canonical design's scope is universal: every core-logic operation that owns an invariant. The 5+ call sites are seed; the rule is universal.

**Why design 2 (migration markers) was superseded:** user's scope-expansion request — pre/post counts are useful beyond migrations (drift-driven closeouts, consolidations, sweeps, backfills, archive waves, escalation batches). Field placement: top-level on change-log (recommendation A). Granularity: `{total, by_status, by_kind}` (recommendation C). Kind enum: `migration | sweep | closeout | consolidation | backfill | archive-wave | escalation-batch | manual-batch`.

**Implementation 1 closeout:** the two corrupted entries are now findable via `entry_kind:"loop-design"` filters. Repair was performed via `meta_state_batch` (the only MCP path; direct file edit is write-gated; `meta_state_patch` cannot repair due to the branch-mismatch guard at `meta-state-patch-tool.js:43`). See `meta-260712T0053Z-...` for the original bug analysis.

**Implementation 2 closeout:** the schema field `operation_envelope` is live on change-log entries (`core/meta-state.js:208` + handler wiring in `meta-state-log-change-tool.js` + auto-emit in `meta-state-batch-tool.js`). Red-team (2 reviewers, Light tier) returned 13 findings (3C/6H/4M), all accepted; review reports at `plans/260712-0300-change-log-operation-envelope/reports/from-code-reviewer-to-planner-red-team-*.md`. The legacy `__tests__/legacy-mcp/lifecycle-migration-finalize.test.js` brittle count assertions (the artifact that motivated this design) were already removed in PR 50 era; the new forward-looking test against a 22-entry deterministic fixture asserts exact structural equality — same intent, no brittleness. Remaining structural gap before Implementation 3: `IMMUTABLE_PATCH_FIELDS` now holds three entries (`entry_kind`, `status`, `operation_envelope`) — each one is a stopgap replacing what the universal `assertinvariant` wrapper's before/after identity comparison will catch in a single guard. Step 3's proper rollup is what closes that growth.

## Implementation order (universal scope)

1. ~~Land **patch-tool fix first** — prevent empty patches from overwriting `entry_kind` (see `meta-260712T0053Z-...` for analysis). Then re-assert `entry_kind: "loop-design"` on the two corrupted designs.~~ **DONE (PR #51, 2026-07-12, plan `260712-0109-meta-state-patch-entry-kind-invariant`).** Fix A omits `entry_kind` + `status` from the patch projection (`buildPatchSchemaFor`, lines 329-340); Fix B strips `entry_kind` in `updateEntry` (lines 642-648). Both loop-designs repaired via `meta_state_batch` (the only MCP path; direct file edit write-gated; `meta_state_patch` refused via branch-mismatch guard). Phase 2 stopgap added `entry_kind` + `status` to `IMMUTABLE_PATCH_FIELDS`. Three change-logs filed (code fix `meta-260712T0212Z-...`, data repair `meta-260712T0213Z-...`, stopgap `meta-260712T0214Z-...`). Finding `meta-260712T0053Z` stays `open` — its class closes with step 3.
2. ~~Land design 4 (operation envelope)~~ **DONE (PR #52, 2026-07-12, plan `260712-0300-change-log-operation-envelope`).** Schema field `operation_envelope` on change-log; helper `core/operation-envelope.js` (`KIND_OP_COMPATIBILITY`, `normalizeLegacyStatus`, `content_hash`); `meta_state_batch` auto-emit; `case "write"` rejects caller-supplied envelopes; `BATCH_SIZE_LIMIT` centralized in `core/constants.js`; `IMMUTABLE_PATCH_FIELDS` extended with `operation_envelope`. Two change-logs filed (`meta-260712T0437Z-...`, `meta-260712T0438Z-...`). Finding `meta-260711T0144Z` resolved by this PR.
3. Land `loop-design-assertinvariant-universal-scope` (CANONICAL primitive) — **NEXT.** Composes design 4's envelope field, wraps **every core-logic operation that owns an invariant**: file-readers, report-tool, pre-commit, batch-tool, updateEntry, archiveEntry, deleteEntry, plus future operations added under `meta-state.js` or any other core-logic surface. Closes findings 6, 3, 5 + `meta-260712T0053Z-...` + the latent batch identity-injection class (currently stopgap-closed by 3-entry `IMMUTABLE_PATCH_FIELDS` deny-list — `entry_kind`, `status`, `operation_envelope`). When this lands, `loop-design-assertinvariant-core-logic-invariant-wrapper` (original 5-call-site) AND `loop-design-operation-envelope-on-change-log` flip to inactive via supersede.
4. Promote `rule-assertinvariant-at-boundary` — agent-side consult that fires when a new core-logic operation is added, reminding the agent to wrap with `assertinvariant`.
5. ~~Resolve finding `meta-260711T0144Z` when design 4's PR merges.~~ **DONE in PR #52.**
6. Resolve findings 6, 3, 5 as each call site migrates to the primitive (likely single PR).
7. Finding 1 (`meta-260613T1615Z` import-chain) stays open until `tools rm` consult-gate lands — separate small PR.

**Why step 3 is universal, not 5-call-site:** per operator direction this session. Curating the call site list is hand-wavy; the next session will hit a domain not on the list. Universal scope + the rule from step 4 means the wrapper is added by default, and exceptions are deliberate operator decisions, not accidents. **Implementation 1 proved this empirically** — the patch-tool bug hit `updateEntry`/`archiveEntry`/`deleteEntry`, three call sites NOT in the original 5-call-site design; the universal wrapper would have caught them all.

## What this session does NOT do

- No code change to `core/file-readers.js`. (Implementation 3 wrap.)
- No schema migration of `runtime-state.jsonl`. (Implementation 3 wrap.)
- ~~No resolution of either target finding (`meta-260630T2110Z`, `meta-260711T0144Z`).~~ **`meta-260711T0144Z` resolved in PR #52 (Implementation 2).** `meta-260630T2110Z` stays open until Implementation 3 wraps `core/file-readers.js`.
- No rule promotion (rule entry is a future-step deliverable of Implementation 3).
- ~~No repair of the two corrupted designs (operator-mediated file edit needed).~~ **DONE in PR #51** — both loop-design entries now have `entry_kind:"loop-design"`; repair performed via `meta_state_batch`.

## Unresolved questions

1. **Scope breadth (decided):** every core-logic operation. Universal, not narrow. Rationale + proof in § The principle above.
2. **Test shape:** should `assertinvariant` ship with a fixture-based golden test (like `buildStaleDispatchHints` Rec 10) that catches silent-success regressions across all call sites? Recommend yes — Rec 10 is the template. Test should cover identity-violation (this session's bug), input-overwritten, unmapped-active-entry, no-stderr-summary, and missing-envelope — one fixture per seed call site.
3. **Operation envelope field shape (RESOLVED via Implementation 2, PR #52):** top-level `operation_envelope` field on change-log, granularity `{total, by_status, by_kind}`, kind enum: `migration | sweep | closeout | consolidation | backfill | archive-wave | escalation-batch | manual-batch`. Two field-shape updates from the source plan were adopted: `idempotency` → `content_hash` (red-team finding 4 — content-hash semantics, not replay detection), and `by_status` canonical enum collapsed to `{open, resolved, superseded, archived}` (with `normalizeLegacyStatus` handling the legacy `active`/`reported`/`stale` aliases).
4. **Pre-commit stderr channel:** existing `console.warn` sufficient, or new protocol (e.g., JSON line on stderr that the agent pattern-matches)? Existing channel is fine; defer new protocol until needed.
5. **Rule entry name (decided):** `rule-assertinvariant-at-boundary` — names the boundary check. Agent-side consult that fires when a new core-logic operation is added.
6. **Patch-tool repair path (RESOLVED via Implementation 1):** chose option (c) — fix patch-tool + repair script. `buildPatchSchemaFor` now omits `entry_kind` + `status` from the patch projection (Fix A); `updateEntry` strips `entry_kind` (Fix B); repair via `meta_state_batch` re-asserted `entry_kind:"loop-design"` on the two corrupted entries. Change-logs: `meta-260712T0212Z-...`, `meta-260712T0213Z-...`. No operator-mediated file edit; no new `meta_state_repair_entry_kind` tool needed.
7. **Wrapper location:** should `assertinvariant` live in `core/meta-state.js` (close to the bug) or a new `core/operation-invariant.js` (separation of concerns)? Recommend new file — the universal scope means it touches many files; co-location with meta-state.js risks muddying the boundary.