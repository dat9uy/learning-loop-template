# Brainstorm: Record Lifecycle + Authority Redesign

**Date:** 2026-07-06
**Scope:** the deferred lifecycle-redesign plan named in `plans/260704-0301-stale-findings-dispatch-handle/plan.md` (Dependencies § "Lifecycle-redesign plan (separate, later)") and in Addendum 2 of `plans/reports/from-ck-predict-to-operator-260704-0105-...`. Three mechanism surgeries + Rec 12 + Q11, grounded in L1 concept before mechanism.
**Source report updated in place:** the `from-ck-predict-to-operator-260704-0105-...` report's Status lines, Rec 12, and Q9/Q10/Q11 now point here.

---

## Problem statement

The finding lifecycle has three concept-level debts plus one trigger ambiguity, all named but unresolved across two prior plans:

1. `auto-resolved` is a dead write path (no production code sets it; verified `plan-260704-0301:181`) that contradicts the L1 invariant "no mechanism silently closes a finding."
2. `ack`/`active` fork the lifecycle on operator-acknowledgment — a ceremony that adds no information to the record (the operator-exit is the engagement signal) and breaks in the fully-automated session mode the destination sentence points toward.
3. `stale` is persisted as a status but is a *computed property of evidence* (age + hash drift) — the same anti-pattern the `stale-ref` collapse already corrected for relationship drift.
4. `OPERATOR_MODE=1` is a global env var conflating class-approval (promote/supersede/sweep — escape-hatch #5, human-forever) with instance actions (resolve/dispatch-commit — delegatable), adding per-session friction in live sessions where the operator is present.
5. Rec 12 (general change-log trigger) + Q11 (operator/agent symmetry) are the stated prerequisites the trigger rule cannot be written without.

## L1 ground (concept before mechanism)

Two concept questions were resolved from the invariant, not from implementation:

### What is `stale`? Which criterion of learning does it support?

`stale` is **not one of the five exit roles** (promote/resolve/re-verify/supersede/dispatch). L1: *"'Stale' is a re-verifiability hint, not a close."* It is a *property of a finding's evidence* — is the grounding still trustworthy enough to act on? Computed from age (`created_at`/`last_verified_at` vs window) and hash drift (`evidence_code_ref` vs `code_fingerprint`/`file-index.jsonl`). Both recomputable on read.

It supports the **integrity** criterion of learning, not throughput. Learning = deterministic surface grows. `stale` prevents growth on drifted evidence — false learning. It is the *trigger predicate* for the `re-verify` exit: when the predicate is true, re-ground before promoting. Triggers are computed; they need not be persisted. Maps to escape-hatch #12's loss function (drift recovery rate = findings caught + resolved vs drifted; the stale view is the metric's input).

**Conclusion:** `stale` is a derived evidence-freshness view over `open` findings, not a lifecycle status. Same principle as the `stale-ref` collapse — second application.

### What is authority in L1? Why does `OPERATOR_MODE` dissolve?

Escape-hatch #5: *the operator remains the authority on what the loop is allowed to learn about itself.* Authority splits by what a decision changes:

- **Class decisions** (promote, supersede, sweep-apply, meta-surface scope, philosophy) — change what the loop learns/enforces going forward. Human-forever.
- **Instance decisions** (resolve, dispatch, re-verify) — close or route one deferral. Don't change class boundaries. Delegatable.

`OPERATOR_MODE`'s concept flaws: (a) per-session identity proxy, not a decision property (appearance ≠ authorization); (b) conflates class and instance tiers under one switch; (c) friction in the wrong place — gates live sessions where the operator is present, the case that needs no gating, while loosely protecting autonomous sessions, the case that does.

The real question: *is a human present to take the human-forever judgment, and is this decision class-level or instance-level?* Two things, not one switch.

**Conclusion:** `OPERATOR_MODE` dissolves into **session mode × decision tier**, with the ledger — not the env var — as durable authorization. The split serves the telos: autonomy expands where safe (instance closure delegatable → agentic surface shrinks) and is barred where dangerous (class growth stays human-forever → deterministic surface's growth protected).

## Evaluated approaches

### Lifecycle shape

| Option | Shape | Trade-off |
|---|---|---|
| A — keep `active` as a status | Only drop `auto-resolved`; preserve `reported→active` | 2-state "open" fork survives; TTL coupled to ack; collapse the deferred plan envisioned doesn't happen. Rejected. |
| B — `open` + `acked_at` metadata | Collapse reported/active→`open`; keep ack as a field | Preserves operator-capture signal as data. But ack is operationally vacuous (see C); the field is ceremony. Superseded by C. |
| C — drop ack entirely | `open`; no ack tool/field | Operator-exit (resolve/promote/supersede/dispatch/re-verify) IS the engagement signal; "human confirmed" derivable from "an operator exit was taken." Matches both session modes (live + automated). **Chosen.** |

### TTL clock (after dropping ack)

| Option | Behavior | Trade-off |
|---|---|---|
| Two clocks, fork on `acked_at` | unacked 24h, acked 7d | Moot once ack is dropped. Rejected. |
| One clock + query | every `open` → stale at 7d; unacked surfaced by query | Chosen (subsumed by the stale-as-derived-view collapse — see below). |

### `stale` — status or derived view?

| Option | Shape | Trade-off |
|---|---|---|
| Keep `stale` as a status | re-verify shuttle stays persistent; sweep writes `open→stale` | Persists a computed property (anti-pattern `stale-ref` already corrected); P0 B1 path (a) stays (sweep-status-writes mutate live registry on `pnpm test`). |
| Collapse `stale` to derived view | `open` + (age>7d OR hash drift) query; re-verify = re-ground + stamp `last_verified_at`; sweep loses status writes | L1-consistent (stale is evidence-freshness, not a decision); kills **P0 B1 path (a)** by construction (sweep has no status writes → `meta-state-sweep-summary.test.js` can't mutate the live registry). **P0 B1 path (b)** (`fix-loop-design-refs.test.js` / INC-4 — `writeEntry` change-log entries on the live root) is independent of sweep and **keeps its `mkdtempSync` isolation regardless**. Cap test + Rec 10 surfacing recompute from view. Bigger surgery. **Chosen.** |

### `OPERATOR_MODE` fate

| Option | Shape | Trade-off |
|---|---|---|
| Keep as global on/off | 4-tool gate unchanged | YAGNI for 1-operator template; but conflates class/instance; live-session friction. Rejected. |
| Narrow to class-approval + delegate instance (grants) | env var for promote/supersede/sweep; ledger grant for resolve/dispatch | Mechanism-thinking; the grant gates `resolve` (a regression — `resolve` is intentionally open to agents today, operator/agent symmetric close) and merely renames `dispatch_commit`'s existing gate. Authorizes a use case (agent autonomously closing findings) that doesn't exist today = YAGNI. Superseded. |
| Dissolve → session mode only (no grants) | `LOOP_SESSION_MODE=live\|autonomous`; gate outward-facing/class-changing actions (promote/supersede/sweep/dispatch-commit) to `live`; leave internal instance-closure (resolve/re-verify/archive/report/log_change/patch) open to agent + operator | L1-consistent; no grant machinery; no duplicate ledger event (tools already record `promoted_by`/`resolved_by`/etc.); `resolve` stays open (agentic surface shrinks; validity checked by evidence consult-gate + change-log requirement, not authority — escape-hatch #6); `delegated_to` seed preserved in dispatch ledger for a future grant system when the destination needs it. **Chosen.** |

### Plan scope

| Option | Trade-off |
|---|---|
| Status + authority only | Rec 12/Q11 survive another cycle; authority designed without the symmetry rule it depends on. Rejected. |
| Rec 12 only | Q11 is the stated prerequisite to writing Rec 12 cleanly — risks writing the trigger on an unresolved symmetry. Rejected. |
| Include Rec 12 + Q11 | Bundles the prerequisites; avoids half-in state. **Chosen.** |

## Final recommended design

### Finding lifecycle

- **Statuses:** `open` / `resolved` / `superseded` (+ `archived` outside the enum; `dispatch` = non-terminal `ledger_ref` overlay). Drop `reported`, `active`, `stale`, `auto-resolved` as statuses.
- **`stale` = derived evidence-freshness view** over `open` findings (age > 7d OR hash drift), surfaced by existing drift tools (`meta_state_query_drift`, `meta_state_check_grounding`, `meta_state_derive_status`) + an age filter. Consumed by cap test, Rec 10 session-start surfacing, loss-function metric.
- **`re-verify`** = re-run grounding + stamp `last_verified_at` (finding stays `open`). Trigger = the stale view returns the finding.
- **`ack`** = dropped (no `meta_state_ack` tool, no `acked_at` field). Operator-exit is the engagement signal.
- **TTL** = one clock (7d from `last_verified_at`/`created_at`); "going stale" is aging past the window — a query, not a transition.
- **`meta_state_sweep`** = loses status writes → reporting view or deprecates. **P0 B1 path (a)** ("pre-commit auto-updates reported→stale" via `meta-state-sweep-summary.test.js` running sweep `apply:true` on the live root) vanishes by construction — sweep has no status writes to apply. **P0 B1 path (b)** (`fix-loop-design-refs.test.js` / INC-4, mutating the live registry via `writeEntry`) is a separate code path unaffected by this redesign; its `mkdtempSync` isolation (already shipped in plan-260704-0301) must remain.

### Authority

- **Drop `OPERATOR_MODE` env var.** Replace with `LOOP_SESSION_MODE=live|autonomous` (session declaration, set once).
- **Gated actions (require `live`, refused in `autonomous`):** `meta_state_promote_rule`, `meta_state_supersede`, `meta_state_sweep` (apply), `meta_state_dispatch_finding` (commit). Rationale: class-approval (escape-hatch #5 — what the loop learns) **or** outward-facing (dispatch creates an external GitHub issue). These tools already record authorship (`promoted_by`/`superseded_by`/`dispatched_by`/`sweep` stamping) — that field IS the durable authorization record; no separate `runtime-state.jsonl` ledger event is added.
- **Open actions (agent + operator, no mode gate):** `meta_state_resolve`, `meta_state_re_verify`, `meta_state_archive`, `meta_state_report`, `meta_state_log_change`, `meta_state_propose_design`, `meta_state_patch`. Rationale: internal instance-closure or recording — the agentic surface shrinking. `resolve` staying open is intentional (the dispatch plan's close flow is "operator/agent symmetric"); its validity is checked by the **evidence consult-gate** (`rule-no-orphaned-evidence` blocks resolve on drift) + the **change-log requirement** (Rec 12 trigger), not by authority — escape-hatch #6 (challenge the record's validity, not the recorder's identity).
- **No grant system; no operator-authored ledger event.** The dispatch flow's existing `delegated_to` field in `runtime-state.jsonl` is the **seed** for a future grant system if/when the destination (verification autonomy) needs agents to autonomously close findings with scoped authority. The pre-condition (agents need scoped close authority) is the destination, not today — building grant-checking now is premature (escape-hatch #10 trajectory≠contract, #11 parking rationale). The data model points at the future; the mechanism is deferred.
- **`meta_state_log_change`** is **trigger-gated** (Rec 12), not authority-gated; fires symmetrically for operator and agent (Q11, no exemption).
- **The class/instance distinction stays as L1 concept** (class = human-forever; instance = close-one-deferral, delegatable in principle) that determines *which actions are gated*; it no longer needs a second mechanism tier.

### Change-log trigger (Rec 12) + symmetry (Q11)

- **Trigger (L1, `loop-engine.md` `record` role):** *an action becomes a change-log when it changes a bound artifact (concept- or implementation-surface doc, runtime contract, registry schema, tool manifest, tracker lifecycle, or `tools/**`/`core/**` source) or a rule/policy. Not for in-session scratch, plan drafts, or reversible edits inside a not-yet-shipped plan.*
- **Symmetry:** no operator exemption (escape-hatch #13). Operator edits and agent edits are recorded symmetrically. Authority governs *which actions may run*; the trigger governs *which actions are recorded* — orthogonal.
- **Procedural home:** pairs with Rec 9 — the trigger rule is a *procedure* needing *deterministic injection* (the loop surfaces it at the right moment — state-2) + *deterministic guardrails* (a consult-gate enforces it — state-3); the content stays agentic-consumed (the model reads it). **This plan ships the L1 statement + symmetry ONLY; the enforcement mechanism is deferred to the prerequisite report** — `plans/reports/from-concept-debate-to-prerequisite-260706-1359-loop-skill-layer-injection-two-axis-report.md` — which frames the skill layer via the injection × consumption two-axis model (escape-hatch state-1 → wired state-2 → encoded state-3). Building the skill without that layer would leave it at state-1 (agentic injection only) — consumed by the loop, not maintained by it. The L1 framing ships via `plans/260706-1340-philosophy-agents-two-axis-injection-reframe/` (docs-rewrite plan); the prerequisite's first instantiation is the Rec 12 enforcement surface. The L1 statement here makes the trigger *queryable* (Rec 12's goal) even before enforcement.

## Implementation considerations

- **Schema migration:** the finding status enum shrinks (`reported`/`active`/`stale`/`auto-resolved` removed; `open` added). **Four schema-declaration sites** to update: `core/meta-state.js`, `docs/schemas.md`, `schemas/meta-state.schema.json`, `tools/learning-loop-mastra/docs/schemas.md`. **Plus ~10 behavioral read sites** in `core/` that branch on `status === "active" || "reported"` and must learn `open` (or the derived predicate): `gate-logic.js:272,658,725` (inbound state gate + cap computation), `derive-status.js:120`, `query-drift.js:79`, `recurrence-tracker.js:92`, `loop-introspect.js:225` (session-start surfacing), `inbound-state.js:86`, `file-readers.js:46`. The `stale-ref` 4-site analogy was a relationship field, not a status branched in gate/cap/surfacing code — P1's real touch surface is ~14 sites, not 4.
- **Data migration:** existing `reported`/`active` findings → `open`; existing `stale` findings → `open` (they enter the derived view by age); existing `auto-resolved` findings → `resolved` (they were closed; preserve the close with a resolution note) or `superseded` if consolidated. **Live registry counts (scouted):** `active`=177, `stale`=12, `reported`=0, `auto-resolved`=0, `open`=0. The real migration burden is **177 `active`→`open`** (the 12 `stale`→`open` follow); `auto-resolved`→`resolved` is a **0-entry no-op** (dead write path, no legacy population). `meta_state_batch` for the bulk flip; per-entry `meta_state_resolve` only if any `auto-resolved` entries surface later. CAS via `_expected_version`; serial (the registry is single-writer).
- **Migration commit strategy (feasibility — resolves single-writer/worktree tension):** plan-260704-0301:169 forbids authority-state writes from originating in a feature worktree (worktrees must `git restore` registry writes before commit). A 177-entry `active→open` flip is an intentional authority-state write that **must** commit. Therefore: **code/enum/tool rework lands in a feature worktree; the 177-entry data migration runs on main via `meta_state_batch` and commits as a separate migration commit** (not from the worktree). The worktree's hook-forced registry refresh is `git restore`d as usual. Do not commit the migrated registry from a feature worktree.
- **Tool surface:** deprecate `meta_state_ack`; rework `meta_state_re_verify` (no status transition — patch `last_verified_at` after grounding pass); rework `meta_state_sweep` (no status writes — reporting view); rename the `OPERATOR_MODE` gate check to `LOOP_SESSION_MODE=live` on `promote_rule`/`supersede`/`sweep`/`dispatch-commit` (no grant check, no new ledger event — the tools' existing `*_by`/`*_at` fields remain the authorship record); `meta_state_log_change` unchanged (already not authority-gated); `resolve`/`re_verify`/`archive`/`report`/`patch`/`propose_design` stay ungated.
- **Cap test** (`cold-tier-regression.test.js:72-77`): today filters `status === "stale" && (mechanism_check true|null)`, asserts `≤ 12` (currently exactly 12). Recompute from derived view — `open + (age>7d OR drifted) + (mechanism_check true|null)`. **Re-baselining is mandatory, not optional:** the derived population is a different (likely larger) set than today's 12 `stale` entries — 177 `active` findings with unknown age distribution enter the predicate. **P2 exit criterion:** compute the derived count *before* dropping `stale`, set threshold = current + headroom. The "12 (or re-baselined)" hedge is removed — re-baseline is a gate.
- **Rec 10 surfacing** (`buildStaleDispatchHints` in `core/loop-introspect.js` + `session-start-inject-discoverability.cjs`): query the derived stale view instead of `status:"stale"`. One-clause change.
- **OPERATOR_MODE call sites** (7 production, scouted): `meta-state-sweep-tool.js:41`, `meta-state-dispatch-finding-tool.js:169`, `meta-state-supersede-tool.js:17`, `meta-state-promote-rule-tool.js:20` (gates); `runtime-state.js:13`, `loop-introspect.js:247` (comments/prompt strings); `runtime-state-record-tool.js` (orthogonal preflight, not OPERATOR_MODE). Replace the 4 gate checks with `LOOP_SESSION_MODE=live` checks (no grant check); update comment/prompt strings. **Plus 11 test files** that set `OPERATOR_MODE="1"` to exercise gated tools (`meta-state-promote-rule-rule-entry.test.js`, `meta-state-dispatch-ttl-and-close-flow.test.js`, `meta-state-dispatch-finding-tool.test.js`, `gate-scope-predicate.test.js`, `meta-state-sweep-stale-transition.test.js`, `integration-promoted-rule.test.js`, `meta-state-stale-flag.test.js`, `build-stale-dispatch-hints.test.js`, `meta-state-sweep-no-stale-ref-followup.test.js`, `meta-state-sweep.test.js`, +1) — each must set `LOOP_SESSION_MODE=live` where it runs a gated tool. P3 exit criterion: all 11 migrated.
- **Test isolation:** plan-260704-0301's P0 B1 fix shipped `mkdtempSync` isolation for **two** tests. Only the sweep-summary test's isolation is obviated by this redesign (sweep has no status writes); keep it until sweep is confirmed write-free, then remove as cleanup. The `fix-loop-design-refs.test.js` (INC-4) isolation **stays permanently** — it mutates the registry via `writeEntry`, independent of sweep, and regresses if removed.
- **Two-surfaces split preserved:** the deterministic core (MCP tools) does no external side effects; `LOOP_SESSION_MODE` is a session declaration read by the tools, not an external call. Class-approval ledger events are written to `runtime-state.jsonl` (append-only, the one merge-clean file per plan-260704-0301's parallelism model).

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `stale`-as-derived-view adds read-cost (hash compare on every "is this stale?" query) | Low (template scale) | `file-index.jsonl` already centralizes hashes; compare is cheap. If a hot path emerges at scale, L3 may cache the predicate — concept stays derived. |
| `auto-resolved`→`resolved` migration loses the "closed by mechanism" lineage | **Low (0 entries)** | **Re-weighted:** registry has 0 `auto-resolved` entries (dead write path, no legacy population) — the migration is a no-op. If any surface later, a resolution note preserves the close. Risk weight moved to the `active`→`open` row below. |
| **177 `active`→`open` migration: behavioral read sites break if not co-updated** | **High** | P1 includes ~10 `core/` read sites that branch on `status === "active" \|\| "reported"` (gate-logic, derive-status, query-drift, recurrence-tracker, loop-introspect, inbound-state, file-readers). Enum + data + read-site rewrites land as one phase. See Schema migration bullet. |
| **177-entry migration commit conflicts with single-writer/worktree authority rule** | **High** | Code/enum/tool rework in a feature worktree; the 177-entry `active→open` flip runs on main via `meta_state_batch` as a separate migration commit. Worktree's hook-forced registry refresh is `git restore`d. See Migration commit strategy bullet. |
| `LOOP_SESSION_MODE=live` is a declaration, not identity proof — an autonomous session could falsely declare `live` | Low (template) | Same gentleman's-agreement as today's `OPERATOR_MODE=1`; the tools record authorship (`promoted_by`/`superseded_by`/`dispatched_by`) so false declarations are auditable after the fact. Real signed identity is a future substrate rotation, not this redesign. |
| `resolve` stays open to agents (no mode gate) — an agent could close a finding wrongly | Low | Validity is checked by the evidence consult-gate (`rule-no-orphaned-evidence` blocks resolve on drift) + the change-log requirement (Rec 12 trigger), not by authority — escape-hatch #6 (challenge the record, not the recorder). This is the same exposure as today (resolve is already ungated); the redesign doesn't widen it. |
| Dropping `ack` loses the "human confirmed this is real" quality signal at scale | Low | Derivable: "an operator exit was taken on this finding" implies confirmation. If a non-derivable signal is later needed, add it as metadata then — YAGNI now. |
| Rec 12 trigger rule over-files (re-creating stale-ref recursion) or under-files (losing audit trail) | Medium | Trigger is scoped to *bound artifacts + rules/policies*, explicitly excludes in-session scratch / plan drafts / not-yet-shipped reversible edits. **Enforcement is deferred to the prerequisite report** (`from-concept-debate-to-prerequisite-260706-1359-loop-skill-layer-injection-two-axis-report.md`) — this plan ships only the L1 trigger statement. Detection-surface gap (write-gate doesn't cover `tools/**`/`core/**`/`docs/**`) and the skill-vs-consult-gate decision both land there. Transient under-filing risk accepted until enforcement ships. |
| Cap-test threshold (12) calibrated to `status:"stale"`; derived-view population differs, possibly by an order of magnitude | Medium | Re-baseline threshold from the derived view *before* dropping `stale` (P2 exit criterion). Compute the derived count on the live registry first; set threshold = current + headroom. |
| Plan scope is large (3 surgeries + Rec 12 concept + Q11) | Medium | Phase it: (1) status-enum + data migration + **read-site rewrites**, (2) stale-as-derived-view + re-verify/sweep rework + **cap re-baseline**, (3) authority dissolution (no grants), (4) **Rec 12 L1 trigger statement + symmetry only** (enforcement deferred to the prerequisite plan). P1 is independently shippable only as a unit (enum + data + read sites together). P4 is now concept-only — the heavy mechanism moved to the prerequisite, which de-risks this plan's scope. |

## Success metrics / validation

- **Lifecycle:** finding status enum = {`open`, `resolved`, `superseded`} (+ `archived` outside); no `reported`/`active`/`stale`/`auto-resolved` in any of the 4 schema-declaration sites; all ~10 behavioral read sites in `core/` accept `open` (no remaining `status === "active" || "reported"` branch); `meta_state_list({status:"stale"})` returns nothing (stale is a view, not a status) but the derived stale view returns the same findings the old `stale` set did.
- **Migration:** 177 `active`→`open` + 12 `stale`→`open` committed on main as a separate migration commit (not from a feature worktree); worktree's hook-forced registry refresh `git restore`d; registry entry count preserved (177+12 flips, no adds/losses). `auto-resolved` migration is a 0-entry no-op.
- **Sweep no-write:** with the sweep-summary test's `mkdtempSync` isolation removed, `meta-state.jsonl` entry count + `updated_at` are unchanged by that test across a `pnpm test` run (P0 B1 path (a) gone by construction). **Note:** the full-suite "entry count unchanged" property is NOT achievable by this redesign alone — INC-4 (`fix-loop-design-refs.test.js`) still mutates the registry and keeps its isolation; the metric is scoped to the sweep path, not the whole suite.
- **Authority:** gated tools (`promote_rule`/`supersede`/`sweep`/`dispatch-commit`) refuse in `autonomous` mode and run in `live` mode; open tools (`resolve`/`re_verify`/`archive`/`report`/`log_change`/`patch`/`propose_design`) run in both modes; `OPERATOR_MODE` env var absent from all 4 gate sites + all 11 test files (replaced by `LOOP_SESSION_MODE`); no grant-checking code path exists; no duplicate operator-authored ledger event (tools' existing `*_by` fields remain the authorship record).
- **Rec 12/Q11 (this plan's scope):** trigger rule stated in `loop-engine.md` `record` role; symmetry statement present (no operator exemption; `meta_state_log_change` is trigger-gated, not authority-gated). **Enforcement (consult-gate/skill + detection mechanism) is NOT in this plan's success criteria** — it lands in the prerequisite report (`from-concept-debate-to-prerequisite-260706-1359-loop-skill-layer-injection-two-axis-report.md`).
- **Cap test:** passes at the post-migration threshold recomputed from the derived view (P2 exit criterion: derived count computed on live registry *before* dropping `stale`; threshold = current + headroom).
- **Rec 10 surfacing:** session-start output unchanged in content (same top-5 + orphans), sourced from the derived view.

## Next steps + dependencies

- **Hand to `/ck:plan --tdd`** (recommended): this redesign refactors existing behavior (finding transitions, sweep, re-verify, cap test, OPERATOR_MODE gating) with strong existing test coverage to preserve; tests-first per phase locks current behavior before changes.
- **Phasing (suggested):** P1 status-enum + data migration + **behavioral read-site rewrites** → P2 stale-derived-view + re-verify/sweep rework (cap-test re-baseline is a P2 exit criterion) → P3 authority dissolution (session-mode only, **no grants**) → P4 **L1 trigger statement + symmetry only** (Rec 12 concept rule in `loop-engine.md` `record` role; enforcement deferred to the prerequisite report). Each phase has a clean test boundary.
- **No cross-plan blockers.** Plan-260704-0301 (dispatch) is shipped and compatible (explicit resolve, no ack, `delegated_to` recorded). The `stale-ref` collapse is precedent for the `stale`-as-derived-view move.
- **Coordination with the docs-rewrite plan `260706-1340`.** P4 ships the Rec 12 trigger statement in `loop-engine.md` `record` role; `260706-1340` phase 1 adds a one-line "instruction injection" note to `loop-engine.md` escape-hatch #1, and phases 2–3 reframe `philosophy.md`/`AGENTS.md` to the injection × consumption two-axis model. The two `loop-engine.md` edits target different sections (record role vs escape-hatch #1) — no conflict — but ship them in one docs pass to avoid two touches to the L1 invariant doc.
- **Out of scope:** Q1 (promotion query shape), Q2 (provenance field scope), Q3 (gate-decision recurrence overlap with Q2), Q4 (legacy rename target name) — all still open in the source report, untouched by this session.

## Unresolved questions (carried forward)

1. **`auto-resolved`→`resolved` vs `superseded` — now a 0-entry question.** Registry has 0 `auto-resolved` entries, so this is moot unless one surfaces during migration. Default if any appears: `resolved` with a migration note (closed, not consolidated). Down-weighted from prior Medium risk.
2. **Derived-stale view surface:** new MCP tool, or an output mode of `meta_state_query_drift` + age filter? The latter is cheaper (no new tool surface) and matches the `stale-ref` resolution (output mode of `meta_state_relationships`). Confirm in plan P2.
3. **`LOOP_SESSION_MODE` default:** default to `autonomous` (fail-closed: class-approval refused unless live declared) or `live` (fail-open)? Fail-closed protects escape-hatch #5; fail-open reduces friction. Recommend `autonomous` default — class-approval is the dangerous direction, so the default should refuse it until `live` is declared. Test suite (11 files) must set `live` where it exercises gated tools.
4. **When does the `delegated_to` seed become a real grant system?** The dispatch flow already records `delegated_to` in `runtime-state.jsonl`; this design deliberately does not build grant-checking. The pre-condition for building it is "agents need scoped close authority" = the destination (verification autonomy), not today. Decide in a future plan when that pre-condition is met — the data model already points at it (escape-hatch #10/#11). Not a blocker for this redesign.
5. **Consult-gate detection mechanism for Rec 12 — moved to the prerequisite report.** The skill-vs-consult-gate decision and the detection-surface gap (write-gate doesn't cover `tools/**`/`core/**`/`docs/**`) are **out of scope for this plan** — they land in `plans/reports/from-concept-debate-to-prerequisite-260706-1359-loop-skill-layer-injection-two-axis-report.md`, which frames the skill layer via the injection × consumption two-axis model (state-1 → state-2 → state-3) before the Rec 12 enforcement surface ships. This plan ships only the L1 trigger statement + symmetry. See that report's UQ1 (skill vs consult-gate as first instantiation, with the two-axis reframing) and UQ5 (SessionEnd hook scope).
6. **Where does the 177-entry `active→open` migration commit?** (Feasibility — needs an explicit answer in the plan.) Recommended: on main, via `meta_state_batch`, as a separate migration commit; code/enum/tool rework lands in a feature worktree. Confirm the plan models this split and does not commit the migrated registry from a worktree.
7. **Cap-test derived-count baseline.** How many of the 177 `active` findings are >7d old OR hash-drifted today? Determines whether the new threshold is ~12 or ~100. Compute on the live registry *before* P2; set threshold = current + headroom. P2 exit criterion.