# Relationship Model — Centralize Source of Truth, Defer `reopens`/`cascade_from` Drop (Brainstorm Report)

**Date:** 2026-07-30 01:46
**Subject:** unify the inter-entry relationship model under the shipped append-first (`meta-state.jsonl` versioned-append) + CLI-first (`bin/loop.mjs` read+write transport) architecture.
**Driving findings (all open):**
- `meta-260623T1126Z-meta-state-relationships-graph-is-unidirectional-on-reopens` — relationships graph is unidirectional on `reopens` (outbound `null` on child); blocked pending this model decision.
- `meta-260715T2237Z-entry-relationships-finding-rule-promotion-finding-change-lo` — relationships implemented/validated/retrieved across 4+ decentralized sites with dual-field + fallback logic; validate tool only lints description-string id refs, not structural cross-ref fields.
- `meta-260717T1004Z-the-inter-finding-relationship-data-model-conflates-three-di` — the model conflates three mechanisms: file-grounding, lifecycle lineage, and cascade closure policy.
**Predecessors:** versioned-append (plan `260716-1101`), CLI transport R+W (plans `260721-1933`, `260722-1103`, `260722-1343`, `260725-1439`), observation-staleness unification (plan `260728-2323`, merged).
**Decision captured (operator):** centralize the relationship source of truth now; **defer** the `reopens` + `cascade_from` drop until a real >2 recurrence cluster appears (YAGNI gate from finding #3).

## 1. Problem

The inter-entry relationship model grew across decentralized sites and now conflates three distinct mechanisms. Under the new architecture this is both more visible and more consequential:

- **Append-first:** a structural cross-ref change is a *permanent versioned audit line* (`max_by(.version)` projection, no in-place mutation, no hard delete, no-op short-circuit). A dangling structural ref written today persists as audit, so write-time referential-integrity validation (finding #2c) is now strictly more valuable, and fewer structural fields = fewer dangling-ref risks carried forward across versions.
- **CLI-first:** reads and writes both ride `bin/loop.mjs`; the relationships/validate tools are CLI-invoked. One coherent retrieval wire shape (finding #2d) is part of keeping that surface clean — no MCP-only path to keep in sync.

Finding #2 documents the decentralization precisely: (1) schema declared per-kind in `core/meta-state.js` (`promoted_to_rule` :317, plus `consolidated_into`, `supersedes`, `addresses`, `proposed_design_for`, `reopens`, `origin`); (2) per-kind ref factories `core/entry/{finding,rule,changelog,loop-design}.js` each carry bespoke `outboundRefs`/`inboundRefs`, with `rule.js` still scanning `finding.promoted_to_rule` directly under a dual-field migration comment; (3) the inverse-index builder `core/loop-introspect.js` reconstructs `promoted_to_rule_inverse` from **both** `rule.origin` (:616-623) **and** `finding.promoted_to_rule` (:628); (4) retrieval `tools/handlers/meta-state-relationships-tool.js:182-190` applies a dual-field fallback patching outbound `promoted_to_rule` from `origin_inverse`; (5) validation `tools/handlers/meta-state-relationship-validate-tool.js` only lints DESCRIPTION-string id refs (`FINDING_ID_REGEX`) — it does **not** validate structural cross-ref fields at write time, so a finding with `consolidated_into=<dangling id>` passes the lint. Stale tool descriptions (e.g. `meta-state-promote-rule-tool.js:15`) compound the confusion.

Finding #3 separates the three mechanisms: **(1a)** "findings related to a file" is already solved by `file-index.jsonl` (every finding with `evidence_code_ref` is grounded; `check_grounding`/`refresh_file_index`/`query_drift` answer "all findings on this file") — **not a relationship edge**; **(1b)** lifecycle lineage is carried by kind-pair-typed edges (`supersedes`, `consolidated_into`, `addresses`, `proposed_design_for`, `origin`) — keep; **(2)** "solve one → resolve other" (cascade) is a closure **policy** (state transition) glued to the `reopens` edge via `cascade_from`, **not a relationship type**. Finding #3's own recommendation is to drop `reopens` + `cascade_from` and carry stale-succession lineage as free-text in `description`.

## 2. Evidence verified against current state (shifted since finding #3's audit)

- `cascade_from` is **still live**: `meta-state-resolve-tool.js:23,120` accepts it and has a cascade branch; `hint-registry.js` carries **4 active hints** instructing agents to set `reopens` + `cascade_from`. The mechanism is still prescribed, not just vestigial.
- `reopens` is **4/98 deduped findings** (4%), each pointing at a **distinct parent** (4 parents: `meta-260715T1328Z`, `meta-260717T1026Z`, `meta-260717T1004Z`, `meta-260714T1248Z`). **All 4 children are already `resolved`/`superseded`** — i.e. `reopens` currently acts as a *historical lineage marker* and the cascade's active payoff is indeed gone (matches #3's thesis), but it is more used than #3's "1 observed cascade" audit suggested.
- Append-first is shipped and stable (see predecessors). CLI-first read+W is shipped; `LOOP_READS_VIA_CLI` routes the 7 read tools through `loop.mjs`; writes also ride the CLI.

## 3. Evaluated forks (decided this session)

| Fork | Options | Decision | Rationale |
|---|---|---|---|
| `reopens` / `cascade_from` disposition | (A) keep + fix · (B) drop + migrate (#3's recommendation) · (C) centralize now, defer drop | **C — centralize now, defer drop** | Smallest change that resolves #1 + #2 and separates the mechanisms (via docs + centralization) without a public-contract shift or data migration. The shifted evidence (4 live `reopens` edges, 4 active `cascade_from` hints, all children already closed) makes (B) a larger contract shift than #3 estimated; (A) leaves the most structural surface. Defer the structural drop until #3's YAGNI gate fires (>2 linked recurrence cluster). |
| Where the source of truth lives | new core module · extend `loop-introspect` · per-factory | **new core module** (e.g. `core/entry/relationship-graph.js`) | Single declarative table of (kind → cross-ref fields, forward accessor, inverse derivation, wire-shape grouping) consumed by factories + introspect + relationships tool + validate tool. DRY; removes the dual-field fallback patches. |
| Write-time structural validation | extend the validate lint tool · **assertinvariant at write boundary** · both | **assertinvariant at write boundary** (rule hint 8) | Append-first makes a dangling structural ref permanent audit; reject before append in `writeEntry`/`updateEntry`/`archiveEntry`/`metaStateBatch`. The lint tool stays as an *early-warning* read for description refs, not the enforcement point. |
| Boundary documentation | `docs/meta-state-lifecycle.md` + `docs/architecture.md` + discoverability hint | all three | Finding #3 (1a): file-index = findings-on-a-file; typed edges = lifecycle lineage; description prose = soft context; cascade = closure policy. Explicitly **do not** add a generic `related_to` field. |

## 4. Chosen direction — what ships now (Approach C)

1. **One core source of truth** for entry relationships: a declarative module that owns (a) which fields are cross-refs per kind, (b) forward + inverse resolution, (c) write-time structural referential-integrity validation, (d) the retrieval wire shape. The per-kind factories (`finding.js`, `rule.js`, `change-log.js`, `loop-design.js`), the `loop-introspect.js` inverse-index builder, the relationships tool, and the validate tool all consume it. Removes the dual-field `promoted_to_rule`/`origin` fallback patches and the decentralized `outboundRefs`/`inboundRefs` duplication.
2. **Write-time structural RI validation**: reject dangling structural cross-ref fields (target id absent in registry) before append, wrapped in `assertinvariant` at the mutation boundary (`writeEntry`/`updateEntry`/`archiveEntry`/`metaStateBatch`). The validate lint tool remains an early-warning read for description-string refs.
3. **Fix the #1 unidirectional bug** mechanically (~5 LOC): populate `outbound.reopens` from `entry.reopens` on the child. The field still exists under Approach C, so the graph must be symmetric.
4. **Document the three-mechanism boundary** in `docs/meta-state-lifecycle.md` + `docs/architecture.md` + a discoverability hint: file-index = findings-on-a-file; typed edges = lifecycle lineage; cascade = closure policy, not a relationship type. No `related_to` field.
5. **Resolve the three findings with lineage**: after the work lands, resolve/supersede `meta-260623T1126Z` (fixed), `meta-260715T2237Z` (centralized), and record `meta-260717T1004Z` as partially resolved (boundary documented + centralization done; the `reopens`/`cascade_from` drop explicitly deferred under YAGNI). Use `reopens`/`source_refs` per the internalization rule to carry lineage.

## 5. Constraints

- Append-first: no in-place mutation; `max_by(.version)` projection; no-op short-circuit; no hard delete (`archived` reused).
- `assertinvariant` at boundary for relationship invariants (rule hint 8).
- Runtime-agnostic: shim-not-fork + cross-surface-iteration; audit with `check_runtime_agnostic` before shipping (rule hint 16).
- Preserve existing lineage data (`supersedes`, `consolidated_into`, `addresses`, `proposed_design_for`, `origin`); no data loss.
- Import-chain analysis (not keyword-grep) before deleting any `.js` file in `tools/learning-loop-mastra/` (rule hint 7).

## 6. Non-goals

- A generic `related_to` field (DX trap: optional + vague → inconsistent → unqueryable).
- Dropping `reopens` / `cascade_from` now (deferred under #3's YAGNI gate; the 4 active hints + 4 live edges make it a contract shift worth deferring).
- Real DB / event store / auto-compaction (Tier 3).
- Reversing settled operator decisions (per-id monotonic versioning, `archived`-for-delete).
- Auto-cascade as a first-class relationship type beyond what exists today.

## 7. Acceptance criteria

- One core module is the single source for (a) cross-ref fields per kind, (b) forward + inverse resolution, (c) write-time structural RI validation, (d) the wire shape — consumed by the kind-factories, `loop-introspect`, the relationships tool, and the validate tool (no bespoke per-kind `outboundRefs`/`inboundRefs` duplication, no dual-field fallback patches).
- Write-time rejects dangling structural cross-ref fields before append; covered by an `assertinvariant`-wrapped test.
- `meta_state_relationships({id, direction:"outbound"})` on a child with `reopens` returns `outbound.reopens` populated (fixes #1); symmetric with inbound `reopened_by`.
- Boundary documented in the three surfaces; no `related_to` field introduced.
- `check_runtime_agnostic` passes; focused tests green; no public-contract regression (the `reopens`/`cascade_from` contract is preserved unchanged under Approach C).
- The three findings resolved/superseded with recorded lineage.

## 8. Risks

1. **Centralization refactor risk** — the per-kind factories + introspect + two tools all change at once. Stage it: land the declarative module + migrate one consumer at a time behind the existing tests (tests-first locks current behavior, mirroring plan `260716-1101` Phase B discipline).
2. **Write-time validation may reject historical entries** — the 4 existing `reopens` edges and any legacy dangling structural refs must pass under the new RI check on read, or the check must apply only to *new appends* (not re-validation of existing versions). Pin this in tests.
3. **Dual-field migration vestige** — `finding.promoted_to_rule` vs `rule.origin`: centralization must pick one canonical forward ref and derive the inverse, without losing the existing `promoted_to_rule` data. Verify against the dual-field test fixtures.
4. **Deferred drop accrues debt** — Approach C keeps `reopens`/`cascade_from` and the 4 hints. Record the deferral explicitly in finding #3's resolution note + a discoverability hint so the YAGNI gate is observable when it fires.
5. **Stale tool descriptions** — `meta-state-promote-rule-tool.js:15` and similar must be corrected as part of centralization so the runtime is not misled again (finding #2 symptom).

## 9. Next step

Hand off to the installed plan skill with this report's contract (§4 direction, §5 constraints, §6 non-goals, §7 acceptance), then `/ak:cook`. The plan should stage the centralization one consumer at a time behind existing tests, land the #1 fix + write-time RI + boundary docs, and close the three findings with lineage. The `reopens`/`cascade_from` drop is explicitly out of scope and waits on #3's YAGNI gate.