# Concept investigation — ledger logs vs budget tracking (L1/L2)

Triggered by PR#77: the "delete runtime-state.jsonl" flaw exposed a missing
concept distinction. The operator's reframing: **pause is the correct mechanism
because it reflects "this budget-rule no longer matters (for now)" — a natural
step of external-budget management, not suppression.**

## The conflation (root cause)

`docs/loop-engine.md:40` (L1) defines `runtime-state.jsonl` as the loop's
short-term memory holding **"mutable runtime state (budgets, counters, ledger
events)"** — three things bundled as one store, no distinction named.

At L2/L3 the `kind` discriminator exists (`z.enum(["ledger-event","budget-state"])`,
`runtime-state-record-tool.js:44`) but is **hollow**:
- All 33 real rows are `kind: ledger-event`; **zero `budget-state` rows exist.**
- `evaluateBudget` reads YAML `budgetData` (constraint files), NOT runtime-state
  `budget-state` rows — so `budget-state` has no consumer.
- The vnstock budget tracking is recorded AS `ledger-event` (each experiment = a
  consumption event), not `budget-state`.
- The gate's stale scan (`readRuntimeObservations` → `findStaleObservations`)
  **ignores `kind`** — it treats every `status:"active"` row as a pending
  observation to reconcile within 30 min, regardless of kind.

`docs/architecture.md:412-438` (L3) frames pause as "stopping tracking for
non-actionable surfaces" and `prune` as "the operator is deleting noise." Both
are housekeeping framings, not concept roles. **PR#77's flaw is the direct
symptom**: with no concept that says "these rows are audit history, not budget
state," the operator reached for `prune` ("delete noise") to clear the gate —
deleting the resolved finding's delivery audit trail.

## Q1 — Do we need an L1/L2 distinction (ledger log vs budget tracking)? YES

Two concepts share one store with different semantics:
- **Budget tracking** — mutable state for an external resource (device-slot,
  API quota). Has a **tracking lifecycle**: the operator decides whether the
  budget still matters. The gate reconciles it against external state;
  staleness is meaningful.
- **Ledger log** — immutable audit of an event that happened (steering
  delivery, finding dispatch, experiment record). **No lifecycle** — it's
  history, not state. Staleness is a category error; you don't reconcile a
  delivery log against external state, and you don't delete history to clear
  a budget gate.

The `kind` enum already anticipates this split but the L1 concept surface
doesn't name it and the L3 gate doesn't enforce it. Naming it at L1 makes the
boundary queryable and prevents the PR#77 class of flaw.

## Q2 — Is runtime-state the correct place for both? Conditionally yes

It can stay one store **IF `kind` is made load-bearing**: ledger-event = audit
(out of the budget gate's scope by definition, not by a filter); budget-state =
mutable budget (in scope; pause/stop ceases tracking). Requires the vnstock
budget rows to be re-typed as `budget-state` (or a "trackable ledger" concept),
and the gate to scope its stale scan to budget-tracking rows.

Alternative: split stores (`budget-state.jsonl` mutable + `ledger.jsonl`
immutable). Cleaner boundary, bigger migration. **Recommendation: keep one
store, make `kind` load-bearing** (KISS — the enum exists, just enforce it).
Splitting is a YAGNI escalation unless ledger volume forces it.

Note on the user's "no exempting/suppressing": excluding ledger logs from the
budget gate is **concept scope**, not suppression — the budget gate's job is
budget reconciliation; ledger logs aren't budgets. The "no exemption" rule
applies to the **budget rows** (use pause, don't filter) — and pause IS the
lifecycle mechanism.

## Q3 — Promote initial/pause/stop to L1/L2 vocabulary? YES

Current lifecycle is implicit and incomplete:
- `initial` (start tracking) — implicit (first `runtime_state_record`).
- `pause`/`resume` — exists (PR #76) but framed as an L3 housekeeping toggle,
  not an L1 concept.
- `stop` (retire tracking, **keep history**) — **MISSING**. Only `prune`
  (destructive delete) exists, framed as "deleting noise."

Promotion:
- Name **budget tracking** as an L1 record-role concept with lifecycle
  `initial → active → paused → stopped`. Reframe `pause` at L1 as *"the
  operator's statement that this budget rule no longer matters (for now)"* —
  exactly the operator's framing.
- Add a **non-destructive `stop`** at L2 (retire tracking, preserve the ledger
  as history). This is what `prune` should have been. Reserve `prune`
  (delete) for genuine noise/corruption, not "I'm done tracking this budget."
  **PR#77 used `prune` where `stop` was the right concept — that is the flaw.**
- The gate's stale-warning ceases **by design** when tracking is paused/stopped:
  the gate scans tracked budgets; paused/stopped budgets aren't tracked → not
  scanned. Not suppression — concept scope.

## How the 27 rows resolve under this model
- **15 vnstock rows** (source_ref `rule-vnstock-device-slot-budget`, a legacy
  file-based rule; install work complete) → **pause vnstock** = "stop tracking
  this budget for now." Ledger preserved; gate ceases by design.
- **12 `delivery-*` + 1 `dispatch-*`** (meta-state-tools audit; the resolved
  finding `meta-260719T2120Z-…`'s verification artifact) → **ledger logs, out
  of the budget gate's scope.** They surface today via the `unmapped-active-entry`
  drift emission (`file-readers.js:71-108`), which false-positives on audit
  rows for surfaces intentionally not in `AFFECTED_SYSTEM_TO_CONSTRAINTS`. The
  fix: that drift emission should fire only for genuine budget-state rows
  missing a constraint mapping, not for `ledger-event` audit rows.
- **Re-pin rows** (vnstock/runtime-state, "Re-pinned per inbound-gate protocol")
  → ledger logs; same scope fix. The vnstock ones also clear via vnstock pause.

## Proposed phased plan
- **Phase 1 — immediate PR#77 correction (no concept change):** rebase onto
  main; keep fix #1 (pause-skip on emitter); revert the prune (restore 33
  rows); `runtime_state_pause({surface:"vnstock"})`. Ledger preserved; vnstock
  warning cleared by the tracking lifecycle, not deletion.
- **Phase 2 — L1/L2 concept naming:** `docs/loop-engine.md` names budget
  tracking vs ledger log and the initial/pause/stop lifecycle;
  `docs/meta-state-lifecycle.md` (or runtime-contract) maps the lifecycle to
  mechanisms; reframe `prune` (delete) vs `stop` (retire-keep-history).
- **Phase 3 — L3 enforcement + `stop` tool:** gate stale scan scopes to
  budget-tracking rows (kind-aware); `unmapped-active-entry` drift fires only
  for budget-state, not ledger-event audit; add non-destructive
  `runtime_state_stop` (retire tracking, keep history). Re-type vnstock budget
  rows as `budget-state` (or define "trackable ledger").

## Operator decisions (2026-07-23)

- **Scope of this PR:** **report only — no implementation.** The correction
  and the L1/L2 promotion are deferred to a follow-up plan.
- **vnstock kind:** **re-type as `budget-state`** (clean kind split).
- **Versioning — the key model refinement:** **both `ledger-event` AND
  budget-tracking must be version-numbered with a lifecycle**, mirroring
  meta-state's open→resolved flow. vnstock becomes a **single versioned
  budget-state entity** (max_by(version) lifecycle), NOT ~20 separate
  per-experiment records as today. The `version` field already exists
  (`readRuntimeStateRowsLatest` does max_by(version) per id); the change is to
  model a budget-tracking entity as one id with versioned lifecycle states,
  not many ids.
- **`pause`/`stop` are lifecycle records, not a sidecar toggle.** "just another
  record with lifecycle, no need to patch the record." This **retires the
  `.loop/runtime-tracking.json` sidecar** (and `isSurfacePaused`'s sidecar
  read) in favor of in-band, versioned tracking-state rows read via
  `max_by(version)`. Pause/stop are appended versions, not patches to existing
  rows and not a separate sidecar. This unifies the model: runtime-state IS
  versioned lifecycle records; the gate reads the latest tracking-state per
  surface to decide whether to stale-scan.
- **`stop` is terminal; only `pause` can resume.** Resume from `stop` is not
  supported — restarting tracking later happens via a **new `initial`
  runtime_state record** (fresh entity). Caveat: terminal stop assumes vnstock
  can be version-numbered as a single entity (open→resolved-style); **if the
  vnstock migration effort is too large, terminal stop is still acceptable**
  (restart via new `initial`). So terminal stop is the decision regardless;
  the versioned-entity model is the preferred path if migration is tractable.

## Revised Phase 3 (per decisions)
- Re-type vnstock as a **single versioned `budget-state` entity** (lifecycle
  via max_by(version)); migrate the ~20 per-experiment rows into that entity's
  history (or start fresh with a new `initial` if migration is too costly).
- Make **both kinds version-numbered with lifecycle** (ledger-event and
  budget-state). The gate reads latest-by-version tracking state per surface.
- Replace the `.loop/runtime-tracking.json` sidecar with **in-band
  versioned tracking-state records**: `initial` → `active` → `paused` →
  `stopped` (terminal). `runtime_state_pause`/`resume`/`stop` append
  lifecycle versions; `isSurfacePaused` becomes "read latest tracking-state
  version for the surface." No record patching; no sidecar.
- Gate stale scan scopes to **actively-tracked** budget-state entities
  (latest version is `active`; `paused`/`stopped` are out of scope by
  lifecycle, not by filter). Ledger-event audit rows are out of scope by kind.
- `unmapped-active-entry` drift emission fires only for `budget-state` rows
  missing a constraint mapping, not for `ledger-event` audit rows.

## Open implementation questions (for the follow-up plan)
1. Migration cost for collapsing ~20 vnstock rows into one versioned
   `budget-state` entity — tractable, or start fresh with a new `initial`?
2. Schema for the in-band tracking-state record (new `kind`, or a
   `budget-state` row whose `value`/`metadata` encodes the lifecycle phase?)
   — and how `runtime_state_pause`/`resume`/`stop` write it.
3. Backward-compat for the existing `.loop/runtime-tracking.json` sidecar
   (read-both during transition, or a one-time migration?).