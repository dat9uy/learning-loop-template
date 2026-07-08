# Plan split tracker: lifecycle redesign + Rec 12 closed loop

**Date:** 2026-07-07
**Source:** `/problem-solving` session continuing `plans/260707-0114-loop-skill-layer-prerequisite/` (completed) against `plans/reports/brainstorm-260706-0958-record-lifecycle-authority-redesign-report.md`.
**Decision:** ship the **lifecycle plan first**, then the Rec 12-closed-loop plan — per the stated dependency chain (`0958 (a) → Rec 12 (b)+(c) → SessionEnd hook`), the Q11/P3 coupling, the `core/loop-introspect.js` + `session-start-inject-discoverability.cjs` file overlap, and integrity-before-capability.
**Unit of work:** `1 PR = 1 ck:plan + 1 ck:cook` session. Each plan below is its own plan dir + its own cook session + its own PR.
**Split chosen:** **4 plans** (merge P1+P2 → one lifecycle-mechanism plan; merge (b)+(c) → one Rec 12-closed-loop plan). Avoids the cross-plan cap-baseline helper contract and the (b)/(c) surface split.

---

## Tracker

Update each row's status + dates as sessions progress. Status legend: `TODO` → `PLAN_CUT` → `COOKING` → `REVIEW` → `SHIPPED`.

### Plan 1 — lifecycle status + stale mechanism (P1+P2 merged)

- **Slug:** `…-lifecycle-status-stale-mechanism`
- **Plan dir:** `plans/260707-0812-lifecycle-status-stale-mechanism/` _(cut 2026-07-07)_
- **Branch / PR:** `lifecycle-status-stale-mechanism` (off main @ 1202514) / TBD
- **Status:** `PLAN_CUT` (red-teamed + corrected; validation pending)
- **Dates:** cut 2026-07-07 / cook-start __ / shipped __
- **Depends on:** — (entry point)
- **Red-team:** `plans/reports/from-red-team-260707-0829-lifecycle-status-stale-mechanism-plan-review-report.md` — 3 Critical / 5 High / 3 Medium / 4 Low; all 11 accepted findings applied. **Key correction (C1):** migration is **22 finding flips** (10 active + 12 stale, scoped by `entry_kind:"finding"`), NOT 190 — the 0958 report's "177/178 active findings" was registry-wide, not findings-only (153 change-logs + 9 rules + 6 loop-designs have their own enums and stay).
- **Scope:**
  - Enum → `open` / `resolved` / `superseded` (+ `archived` outside enum). Drop `reported` / `active` / `stale` / `auto-resolved` as statuses. Update 4 schema-declaration sites: `core/meta-state.js`, `docs/schemas.md`, `schemas/meta-state.schema.json`, `tools/learning-loop-mastra/docs/schemas.md`.
  - ~10 behavioral read-site rewrites in `core/` to accept `open`: `gate-logic.js:272,658,725`, `derive-status.js:120`, `query-drift.js:79`, `recurrence-tracker.js:92`, `loop-introspect.js:225`, `inbound-state.js:86`, `file-readers.js:46`.
  - 177 `active→open` + 12 `stale→open` migration via `meta_state_batch` **on main** (separate migration commit, NOT from a feature worktree; worktree's hook-forced registry refresh is `git restore`d). `auto-resolved` → 0-entry no-op.
  - Deprecate `meta_state_ack` (no tool, no `acked_at` field).
  - `stale` = derived evidence-freshness view over `open` (age > 7d OR hash drift), as output mode of `meta_state_query_drift` + age filter (no new MCP tool — UQ2).
  - Rework `meta_state_re_verify` (no status transition; patch `last_verified_at` after grounding pass).
  - Rework `meta_state_sweep` (no status writes → reporting view or deprecate).
  - Cap-test re-baseline: compute derived count over current `active` set **before** dropping `stale`; set threshold = derived count + headroom (`cold-tier-regression.test.js:72-77`). All inside one cook session (no cross-plan contract).
  - Rec 10 surfacing: query derived stale view in `core/loop-introspect.js` (`buildStaleDispatchHints`) + `session-start-inject-discoverability.cjs`.
- **Exit criteria:** enum collapsed at all 4 sites; no `status === "active" || "reported"` branch remains in `core/`; `meta_state_list({status:"stale"})` returns nothing; derived stale view returns the same findings the old `stale` set did; cap test green at new threshold; migration committed on main, registry count preserved (177+12 flips); `meta-state-sweep-summary.test.js` isolation removable once sweep confirmed write-free (`fix-loop-design-refs.test.js` INC-4 isolation stays permanently).

### Plan 2 — lifecycle authority dissolution (P3)

- **Slug:** `…-lifecycle-authority-dissolution-session-mode`
- **Plan dir:** `plans/260708-0833-lifecycle-authority-dissolution-session-mode/` _(cut 2026-07-08, post-PR-#38)_
- **Branch / PR:** `lifecycle-authority-dissolution-session-mode` (off main @ `46a8884`) / TBD
- **Status:** `PLAN_CUT` (scope verified against `main` @ `46a8884`; validation pending)
- **Dates:** cut 2026-07-08 / cook-start __ / shipped __
- **Depends on:** Plan 1 (uses the new `open` status model; Plan 1 shipped via PR #38 squash `46a8884`)
- **Scope:** (corrected post-PR-#38 — see Deviation below)
  - Replace `OPERATOR_MODE` env var with `LOOP_SESSION_MODE=live|autonomous` (session declaration, set once).
  - **3 gate sites** (not 4) → `LOOP_SESSION_MODE=live` checks: `meta-state-promote-rule-tool.js:17,20,55` (checkOperatorRole helper + call), `meta-state-supersede-tool.js:18`, `meta-state-dispatch-finding-tool.js:169` (commit stage). `meta-state-sweep-tool.js` lost its gate in Plan 1 (now read-only, "No operator gate") — NOT touched.
  - Extract one shared `isLiveSession()` helper in `core/session-mode.js` (DRY — 3 sites repeat the identical env check).
  - Reason string `operator_role_required` → `live_session_required`.
  - **8 test files** (not 11) migrated: `meta-state-promote-rule-rule-entry`, `integration-promoted-rule`, `meta-state-dispatch-finding-tool`, `meta-state-dispatch-ttl-and-close-flow`, `meta-state-stale-flag` (covers supersede), `meta-state-sweep` (1 ref — verify incidental), `gate-scope-predicate`, `build-stale-dispatch-hints` (2 refs — string assertions).
  - Update comment/description/prompt strings (6 sites): `meta-state-supersede-tool.js:9`, `meta-state-dispatch-finding-tool.js:21,293`, `runtime-state-record-tool.js:9`, `core/runtime-state.js:13`, `core/loop-introspect.js:258` (was 247).
  - Default = `autonomous` (fail-closed — class-approval refused until `live` declared; UQ3 recommendation).
  - Open (no mode gate): `resolve` / `re_verify` / `archive` / `report` / `log_change` / `propose_design` / `patch`.
  - No grant machinery; no new operator-authored ledger event (tools' existing `*_by` / `*_at` fields remain the authorship record).
- **Exit criteria:** `OPERATOR_MODE` absent from all 3 gate sites + all 8 test files; gated tools refuse in `autonomous`, run in `live`; open tools run in both; `isLiveSession` in exactly 4 non-test locations (def + 3 gates); no grant-checking code path exists; no duplicate ledger event.
- **Deviation from original tracker scope:** Plan 1 (PR #38) removed the `meta-state-sweep-tool.js` OPERATOR_MODE gate and trimmed 3 stale-flag test files, so this plan is 3 gate sites / 8 test files, not 4 / 11. Original tracker scope preserved in git history; this row reflects the verified live surface.
- **Note:** no file overlap with Plan 1's shipped changes; `meta-state-sweep-stale-transition.test.js` no longer shared (sweep reworked) → still serial after Plan 1 by dependency, not by file overlap.

### Plan 3 — Rec 12 L1 trigger statement + symmetry (P4, docs-only)

- **Slug:** `…-rec12-l1-trigger-statement-and-symmetry`
- **Plan dir:** `plans/<timestamp>-rec12-l1-trigger-statement-and-symmetry/` _(to cut)_
- **Branch / PR:** TBD
- **Status:** `TODO`
- **Dates:** cut __ / cook-start __ / shipped __
- **Depends on:** Plan 2 (Q11 symmetry comments on the authority result — `log_change` is trigger-gated, not authority-gated)
- **Scope:**
  - `docs/loop-engine.md` `record` role: change-log trigger statement — *an action becomes a change-log when it changes a bound artifact (concept- or implementation-surface doc, runtime contract, registry schema, tool manifest, tracker lifecycle, or `tools/**`/`core/**` source) or a rule/policy; not for in-session scratch, plan drafts, or reversible edits inside a not-yet-shipped plan.*
  - Symmetry statement (Q11): no operator exemption (escape-hatch #13); operator and agent edits recorded symmetrically; authority governs *which actions may run*, the trigger governs *which are recorded* — orthogonal.
  - `meta_state_log_change` records the `loop-engine.md` edit.
- **Exit criteria:** trigger rule present in `loop-engine.md` `record` role; symmetry statement present; `meta_state_log_change` entry recorded. Enforcement (consult-gate/skill + detection) is **NOT** in this plan — lands in Plan 4.
- **Note:** this is component **(a)** of the broadened Rec 12; un-blocks Plan 4.

### Plan 4 — Rec 12 closed loop (b)+(c) merged

- **Slug:** `…-rec12-closed-loop`
- **Plan dir:** `plans/<timestamp>-rec12-closed-loop/` _(to cut)_
- **Branch / PR:** TBD
- **Status:** `TODO`
- **Dates:** cut __ / cook-start __ / shipped __
- **Depends on:** Plan 3 (needs (a) trigger definition to know what a change-log *should* be)
- **Scope:**
  - **(b) Change-log gap detection:** join of bound-artifact paths touched (git / `file-index.jsonl`) ∖ `meta_state_log_change` entries in the same session → gap finding. This is `loop-engine.md` open Q1's "missing half." Bound-artifact set sourced from `core/bound-artifacts.js` (shipped by the skill-layer prerequisite `260707-0114`) + `tools/**`/`core/**`/`docs/**` (Rec 12's detection surface, beyond the prerequisite's `<surface>/skills/**` gate).
  - **(c) Session-start gap injection:** surface the gap finding at session start via `core/loop-introspect.js` + `session-start-inject-discoverability.cjs` (parallels the existing stale-queue session-start surfacing, now settled by Plan 1's Rec 10 change).
  - Un-blocks the deferred SessionEnd/pre-commit hook (skill-layer prerequisite UQ5) — the hook is the *promotion* of the recurring gap finding once (b)+(c) show a drift rate above threshold.
- **Exit criteria:** gap-detection query produces correct gap set against a known bound-edit/log-change fixture; session-start output surfaces the gap; the SessionEnd hook un-block condition is documented (not necessarily shipped here).

---

## Dependency chain

```
Plan 1 (enum + stale mechanism) → Plan 2 (authority) → Plan 3 ((a) trigger + symmetry, docs) → Plan 4 ((b)+(c) closed loop)
```

## Session update protocol

Each cook session:
1. Updates its row's `Status` + `Dates` (cut / cook-start / shipped).
2. Fills `Branch / PR` once cut.
3. On ship, marks `Status: SHIPPED` and notes the next plan's un-block.
4. Records any deviation from the scope here (don't silently diverge).

## Source lineage

- Design input: `plans/reports/brainstorm-260706-0958-record-lifecycle-authority-redesign-report.md` (the 3 surgeries + Rec 12 + Q11).
- Prerequisite (done): `plans/260707-0114-loop-skill-layer-prerequisite/` (shipped the skill-layer mechanism Plan 4's detection sits on; deferred the SessionEnd hook with named un-block = this Plan 4).
- Prerequisite report: `plans/reports/from-concept-debate-to-prerequisite-260706-1359-loop-skill-layer-injection-two-axis-report.md`.
- L1 framing (done): `plans/260706-1340-philosophy-agents-two-axis-injection-reframe/`.

## Unresolved questions (carried from 0958, to resolve at plan-cut time)

1. **`auto-resolved`→`resolved` vs `superseded`** — 0-entry today; default `resolved` with a migration note if any surfaces during Plan 1.
2. **Derived-stale view surface** — pre-decided: output mode of `meta_state_query_drift` + age filter (no new tool). Confirm in Plan 1.
3. **`LOOP_SESSION_MODE` default** — pre-decided: `autonomous` (fail-closed). Confirm in Plan 2.
4. **When does `delegated_to` become a real grant system?** — out of scope; the data model already points at it (destination = verification autonomy, not today).
5. **Plan 1 migration commit location** — pre-decided: on main via `meta_state_batch`, separate migration commit, NOT from a feature worktree. Confirm Plan 1 models this split.
6. **Cap-test derived-count baseline** — compute over current `active` set inside Plan 1 before dropping `stale`; threshold = derived count + headroom. Plan 1 exit criterion.