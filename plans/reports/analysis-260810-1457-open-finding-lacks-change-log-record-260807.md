# Analysis: Why `meta-260807T1704Z-adopt-shell-quote-...` was filed as a finding, and why it drifts cold-session

**Date:** 2026-08-10 · **Investigator:** Claude (session 14:56 UTC)
**Scope:** `/ak-debug` investigation of the open finding
`meta-260807T1704Z-adopt-shell-quote-1-10-0-as-parse-only-dep-behind-bash-gate`

---

## Executive summary

The finding is a **mis-filed ledger event**. Its description literally labels it a
"Ledger event for the dep adoption" — a *statement of fact about a completed
change*, not an open problem requiring investigation. It was written via the
finding channel (`entry_kind: "finding"`, `category: "budget-check"`) inside the
very commit (`9d420981`, PR #119) that adopted the dependency. The correct
vehicle for a completed-system-change fact is a **change-log entry**
(`entry_kind: "change-log"` via `meta_state_log_change`), which is
drift-invisible. Filing it as an **open finding** puts it in every derived drift
surface; because it was committed with a **stub evidence ref**
(`gate-logic.js:1`) and **no positive test-pass signal**, it derives
`active-uncertain` and triggers `investigate` drift — and that drift is what a
cold session (fresh checkout / fresh `GATE_ROOT` index) observes.

---

## The two questions, answered

### Q1. Why write a finding just to state a fact?

Three forces combined:

1. **The record IS a budget-check record.** The bash-gate discipline
   (CLAUDE.md § Budget / side-effect commands) says: before a side-effect
   command — and a **dependency adoption** qualifies — record budget/ledger rows
   via `runtime_state_record` and record reasoning via
   `meta_state_report(category: "budget-check")`. `meta_state_report` **only**
   writes `entry_kind: "finding"` (`meta-state-report-tool.js:112` —
   `entry_kind: "finding"`, hard-coded). There is **no branch** in that tool for
   `change-log`. So the operator who wanted an audit trail of the dep adoption
   had exactly one sanctioned write path, and it produces a finding.

2. **`meta_state_log_change` was the right tool, and wasn't used.** The
   report tool's own description points at it: *"Use meta_state_log_change for
   system changes and meta_state_resolve for closure."* A dependency adoption
   is a `change_dimension: "mechanical"` change-log event. The finding was
   committed into PR #119's `meta-state.jsonl` diff as a finding, alongside the
   *real* open findings of that PR (the quote-concatenation and data-command
   blanking bugs). It was authored in the same gesture that shipped the change,
   so it reads as a "remember we did this" note — but the tooling it flowed
   through (`meta_state_report`, category `budget-check`) only knows how to make
   findings.

3. **The description self-identifies the mistake.** The text says "Ledger event
   for the dep adoption". That is the operator's own label for what the record
   really is. A change-log entry carries `change_diff` and is appended to the
   immutable `change-log.jsonl` stream — the intended ledger for system changes.
   A finding is for "operator review" of a suspected problem.

**Net:** this is a **schema-vs-intent mismatch**, not malice. The budget-check
category coerces an audit-trail write into the finding shape, and the operator
either didn't reach for `meta_state_log_change` or reached for the only
budget-check-adjacent tool available.

### Q2. Why does this finding cause cold-session drift?

Because it is an **open finding with mechanism_check:true and a stub/non-verifying evidence ref**, and every derived drift surface picks exactly that class up:

- **`deriveStatus` (SP1)** — `meta-state-report-tool` auto-defaults
  `mechanism_check` to `true` when `evidence_code_ref` is present
  (`meta-state-report-tool.js:85-90`). `evidence_code_ref` is
  `gate-logic.js:1` — the file exists (so not `code-missing`), but there is no
  `evidence_test` and no positive `test_passed` signal. That yields
  `kind: "code-only"` → `derived_status: "active-uncertain"` →
  recommendation `investigate` (`derive-status.js` `computeKind` /
  `computeDerivedStatus`). **`active-uncertain` is drift by definition**
  (`query-drift.js` case 5 → `computeIsDrift` returns true).

- **`meta_state_query_drift` (SP3)** — confirmed live: the finding is in the
  drift stream, `derived_status: active-uncertain`, `recommendation: investigate`
  (verified by direct CLI call, 1 of 168 events).

- **`loop_describe` cold tier** — the finding is in `all_findings` with
  `status: open`, `mechanism_check: true` (verified via CLI). It is also in the
  **warm-tier `registry_summary.drift`** (`computeDriftEntries`): that bucket is
  exactly `entry_kind==="finding" && mechanism_check===true && status!=="resolved"`,
  newest-first, capped at 5 — this finding is the **newest** open finding, so it
  occupies a guaranteed top-5 slot.

- **Cold-session freshness** — the file-index baseline
  (`file-index.jsonl`, a gitignored regen artifact) is rebuilt by the seed step
  (`seed-file-index.mjs`) at the start of `pnpm test` / `pnpm test:cold-session`.
  The `:1` line anchor does not make the hash drift *today* (`check_grounding`
  returns `hash_match: true`, `grounded`). The drift is **not a hash-mismatch**
  drift — it is a **derivation** drift: `open` + `code-only` + no positive
  test-pass ⇒ `active-uncertain` ⇒ `investigate`. The `last_verified_at` is
  absent, so as the record ages past the 7-day staleness window it will also
  become age-stale in the derived stale view (`isStaleView`).

**Why "cold" specifically:** a cold session is one that has no warm cache
(`loop_describe` `cache_hit`, warm-tier index). It reads the registry from
scratch and surfaces `active_findings` / `all_findings` / `registry_summary.drift`
directly. The finding is one of only **15 open findings** and the **newest**
mechanism-checked one, so it is impossible for a cold session's drift
enumerations to miss it. A warm session that already holds a cached
`registry_summary` sees the same thing once the cache reflects the current
registry; the difference is that the cold tier must re-derive it.

---

## The mechanism diagram

```
PR #119 (9d420981) adopts shell-quote ^1.10.0
   └─ operator wants audit trail of the dep adoption
        └─ uses meta_state_report(category: "budget-check")   ← only finding-shape writer
             ├─ entry_kind: "finding"  (hard-coded, meta-state-report-tool.js:112)
             ├─ status: "open"         (hard-coded)
             ├─ mechanism_check: true  (auto-default from evidence_code_ref)
             └─ evidence_code_ref: "tools/learning-loop-mastra/core/gate-logic.js:1"   ← stub
                  ↓
   deriveStatus (SP1): code-ref exists, no test-pass ⇒ kind "code-only"
                  ↓
   derived_status: "active-uncertain"     ⇒  query-drift case 5 = DRIFT (investigate)
                  ↓
   surfaces in: meta_state_query_drift · registry_summary.drift (top-5, newest)
              · cold-tier all_findings (1 of 15 open) · age-stale after 7d
```

---

## Evidence

| Check | Result | Source |
|---|---|---|
| Record kind / fields | `entry_kind: finding`, `category: budget-check`, `status: open`, `mechanism_check: true`, `evidence_code_ref: gate-logic.js:1`, `version: 0`, no `evidence_test`, no `last_verified_at` | `meta_state_list` + `meta-state.jsonl:333` |
| Description self-label | "Ledger event for the dep adoption; pin >=1.10.0; forbid quote() import" | `meta-state.jsonl:333` |
| Committed in dep-adoption PR | Added `+` in `9d420981` diff to `meta-state.jsonl` | `git show 9d420981` |
| Dep is actually adopted | `shell-quote: ^1.10.0` in `package.json:44`, installed `1.10.0`, 13 guard tests pass | `package.json`, node_modules, `shell-quote-guard.test.js` |
| `meta_state_report` only writes findings | `entry_kind: "finding"` hard-coded; no change-log branch | `meta-state-report-tool.js:112` |
| Report tool points at change-log for system changes | description: "Use meta_state_log_change for system changes" | `meta-state-report-tool.js:33` |
| `meta_state_log_change` writes `entry_kind: "change-log"` | `change_dimension` / `change_diff` shape, immutable stream | `meta-state-log-change-tool.js:79` |
| SP1 derivation of this entry | `kind: code-only`, `derived_status: active-uncertain`, recommendation `investigate` | `meta_state_derive_status` CLI (live) |
| SP3 drift includes it | `drift_count: 168`, this entry `active-uncertain | investigate` | `meta_state_query_drift` CLI (live) |
| Cold-tier view includes it | `status: open`, `mechanism_check: true`, `last_verified_at: null` | `loop_describe({tier:"cold"})` CLI (live) |
| Warm-tier drift summary includes it | 1 of 5 in `registry_summary.drift` (newest open mc finding) | `loop_describe({tier:"warm"})` CLI (live) |
| Grounding (hash) is NOT the drift cause | `hash_match: true`, `grounded`, `drift_kind: null` | `meta_state_check_grounding` CLI (live) |
| `test:cold-session` currently green | seed + cold-session-discoverability 6/6 pass; cold-tier-regression 1/1 pass | vitest runs (this session) |

---

## Why it does NOT fail a specific test today (and why it will)

I ran every "cold session" candidate against the live registry:

- `pnpm test:cold-session` (seed + `cold-session-discoverability.test.cjs`) → **passes** (6/6). It never asserts drift counts; it checks manifest/tool registration and hint shape.
- `cold-tier-regression.test.js` → **passes** (1/1). It asserts **caps** on derived-stale (≤19 age-stale, 0 drift-stale), not zero open findings. This finding is currently under the age window and hash-grounded, so it doesn't trip either cap.
- `meta-state-query-drift-tool.test.js` / `meta-state-consistency-check-tool.test.js` → all use **temp dirs** (`mkdtempSync`), never the live registry.

So today nothing turns red. The drift is **latent and structural**: the finding is
permanently in every derived drift enumeration (`query_drift` 168 events,
`registry_summary.drift` top-5, `cold` all_findings open-set), and it will become
**age-stale** once `created_at` (2026-08-07) crosses the 7-day window
(≈ 2026-08-14) with no `last_verified_at` — at which point it counts against
`derivedStaleSet` (Phase 7a cap, currently 19 with 2 headroom). A cold session
that asserts a tight drift budget, or that consumes `registry_summary.drift`
after the age window, will see it.

---

## Recommended remediation

The finding is a **completed fact**, not a problem to investigate. The drift-safe
resolution is to close it as the change-log it always was:

1. **Record the change-log** (the fact the finding was trying to state):
   `meta_state_log_change` with `change_dimension: "mechanical"`,
   `change_target: "deps/shell-quote"` (or similar), `change_diff: {added:
   ["shell-quote@^1.10.0 (parse-only)"]}`, `reason` citing CVE-2026-9277
   mitigation, and `evidence_code_ref` pointing at the guard test
   (`tools/learning-loop-mastra/__tests__/unit/shell-quote-guard.test.js`) so
   it grounds properly.
2. **Resolve the finding** via `meta_state_resolve` with a citation to the
   change-log (the `meta_state_supersede` path emits the citation row) — it is
   no longer an open item needing operator review.
3. **Optionally tighten the tooling** so a `category: "budget-check"` record
   cannot silently land as an open finding for a *fact*: either surface a
   change-log write path from the budget-check flow, or document that
   budget-check findings about completed adoptions must be immediately resolved
   with a change-log citation.

The guard tests, the version pin, and the import forbiddance are all already in
place and green — this is purely a **registry hygiene** issue.

---

## Follow-up: attempted remediation and revert (2026-08-10, same session)

An `/ak-fix` remediation was attempted and then **reverted by git** at the
operator's direction. Recorded here so the drift surfaces are not re-churned.

### What was tried

1. `meta_state_log_change` → appended
   `meta-260810T1515Z-deps-shell-quote-parse-only-dep-behind-bash-gate`
   (change_dimension: mechanical, evidence_code_ref → the guard test).
2. `meta_state_supersede` → closed
   `meta-260807T1704Z-...` (status resolved, version 1) with citation
   `citation-msndi6ej-iq96oi` linking finding → change-log.

### Why it was reverted

The side-effect sweep (ak-fix Step 5) caught a flaw in the original diagnosis:

- **Change-logs are NOT drift-invisible.** Test T-26 in
  `query-drift.test.js` locks the contract: a change-log with
  `evidence_code_ref` and no positive `test_passed` derives
  `active-uncertain` → `investigate` drift, *deliberately* ("post-migration:
  change-log is no longer special-cased"). So the new change-log became a
  drift event itself, keeping `drift_count` at 168 (−1 finding, +1 change-log).
- **Change-logs are immutable.** `meta_state_patch` returns
  `change_log_immutable` for any change-log patch. The "drop the evidence ref"
  option is not executable in place.
- **`meta_state_supersede` only closes findings** (`not_a_finding` for
  change-log targets), so change-log→change-log supersession via that tool is
  also unavailable.

The operator chose to **revert both writes** (`git restore change-log.jsonl
citations.jsonl meta-state.jsonl`) rather than leave a second change-log or
accept the drift trade. The finding is restored to `status: open`, version 0.

### Verified post-revert state

- `meta_state_query_drift`: drift_count **168**, finding present
  (`active-uncertain | investigate`) — matches the pre-fix baseline.
- `loop_describe({tier:"cold"})`: finding in `active_findings` (open) — matches
  baseline.
- `git status`: only the untracked analysis report remains; registry files clean.
- `cold-session-discoverability.test.cjs` (6/6) and
  `cold-tier-regression.test.js` (1/1) pass.

### Takeaway for a future attempt

The finding's drift is **structural and intended** under the current contract:
`open` + `mechanism_check: true` + a code-only evidence ref (no positive
test-pass) ⇒ `active-uncertain` ⇒ `investigate`. Making it drift-invisible
without losing the ledger fact requires either (a) a *no-signals* change-log
(no evidence ref) that supersedes the finding — but `meta_state_supersede`
cannot target it, so the finding would need a different close path, or (b) a
contract change to exempt `budget-check` findings from drift — which the
T-26/query-drift tests currently forbid. Neither was attempted.

---

## Unresolved questions

- Whether the operator intends `budget-check` findings to remain open as a
  standing audit ledger (in which case the drift signals are a feature to be
  tolerated/capped, not closed). The AGENTS.md budget-check citation flow exists
  precisely to record side-effect reasoning; it may be that "ledger event" is an
  accepted use and the fix is only to make such records drift-invisible, not to
  resolve them.
- Whether the intended home is `runtime_state_record` (the ledger-row mechanism)
  rather than a meta-state finding at all. If so, the finding could be archived
  and the fact re-recorded as a ledger row instead.
- Whether a contract change to exempt completed-fact `budget-check` findings
  from the `active-uncertain` drift (or to route them to a no-signals shape) is
  worth a dedicated plan — the query-drift T-26 contract would need to move
  first.
