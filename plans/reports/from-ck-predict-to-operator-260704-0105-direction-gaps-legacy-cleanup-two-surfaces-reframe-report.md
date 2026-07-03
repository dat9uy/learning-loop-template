# Predict Report: Direction Gaps + Legacy Cleanup — reframe in the two-surfaces / engine vocabulary

**Verdict: CAUTION** — but the caution has *moved*. The original 260703-2255 report was CAUTION because it bundled two risk profiles and left the workflow→registry write boundary open. In the two-surfaces framing those open questions dissolve or derive; the caution now lives in two narrower places: (a) the `legacy/` rename trap is still live and unstarted, and (b) the change-log half of the recurrence→promotion bridge is undesigned, while the L1 doc mis-labels the whole bridge as "unwired." The reframe itself is GO — it changes the next action (stop treating Phase G as a keystone; start designing the promotion query).

**Date:** 2026-07-04
**Proposal:** Rewrite the 260703-2255 direction-gaps + legacy-cleanup predict report in the framing established by `from-problem-solving-to-operator-260703-2323-loop-engine-deterministic-agentic-report.md` and shipped by `plans/260703-2354-docs-rewrite-two-surfaces/` — one engine (deterministic↔agentic), two surfaces (concept / implementation), abstraction levels L0–L4.
**Evidence base:** original report (`from-ck-predict-to-operator-260703-2255-...`), the problem-solving reframe, the docs-rewrite plan + its 6 phase files, the shipped `docs/loop-engine.md` (L1) + `docs/runtime-contract.md` (L2), and a state-verification scout (stale refs, `workflow-intake-orient.js`, `core/recurrence-tracker.js`, `core/evaluate-write-gate.js`, `core/derive-status.js`, Plan 5-Lite plan status).

---

## Verdict: CAUTION

---

## What the reframe changes (vs. the 260703-2255 report)

The original report sat in old vocabulary ("systematize memory + runtime-agnostic workflows," "Phase G keystone," "should workflows write to the registry?"). The two-surfaces reframe re-categorizes every one of its rows:

| 260703-2255 said | Reframe (two-surfaces / engine) | Net effect |
|---|---|---|
| Direction = "systematize memory + runtime-agnostic workflows" | Direction = **the agentic→record→promote→deterministic engine** on a runtime-agnostic substrate. Memory systematization + agentic workflows are *consequences* of the engine, not the definition. | Direction is now a concept-surface (L1) statement, not an implementation goal. |
| "Phase G is the keystone; sequence it after hardening" | Phase G is **one candidate mechanism** for internalizing agentic self-development (an L3 choice). The keystone is the **recurrence→promotion bridge**, not any mechanism. | Phase G demoted; the bridge is the real next move. |
| "Should workflows write to the registry?" (open Q1) | **Dissolves**: deterministic-steps write records directly; agentic-steps record outcomes via promotion. Boundary = concept *role*, not mechanism *class*. (`loop-engine.md` "Concept vocabulary" §) | No longer an open question; it is a contract note. |
| "Optimize the changelog" (standalone task) | **Derived**: specify the promotion query first ("find recurring agentic-deferral patterns ready to promote"); the change-log schema serves it. | Re-ordered: query before schema. |
| Cleanup = riskiest part, rename-first | Cleanup is **implementation-surface (L3) hygiene**, independent of the concept surface. Rename-first still stands, now categorized as substrate hygiene. | Unchanged in action; clearer in *why*. |
| Plan 5-Lite must ship before memory-on workflows | Plan 5-Lite **shipped** (`status: completed`, `.loop/r2-allowlist.json` present, LIM-4 containment in `core/derive-status.js:89` + `core/verification-runner.js:34`). | Security gate cleared; bridge wiring is unblocked. |
| Stale docs are fix-on-sight (Rec 2) | **Shipped** by docs-rewrite Phase 1: `learning-loop-mcp` refs gone from active `CLAUDE.md`/`README.md`/`AGENTS.md`/`docs/`; only in `docs/_archive-260703/` + `docs/journals/` (acceptable). | Rec 2 closed. |
| Name the memory substrate (Rec 7) | **Partly addressed**: `runtime-contract.md` (L2) splits runtime-participation-contract / storage-fan-out / feature-agnosticism; `architecture.md` (L3) names the stores. | One paragraph in L1 still missing — see Recommendations. |

---

## Agreements (all personas align)

- **The two-surface split cleanly separates the original report's bundled concerns.** "Direction gaps" are concept-surface (L1); "legacy cleanup" is implementation-surface (L3). The original CAUTION was partly an artifact of evaluating both in the same vocabulary. Re-categorizing them is not relabeling — it changes which one gates the other.
- **Phase G is correctly demoted; the recurrence→promotion bridge is the actual keystone.** The engine invariant (`loop-engine.md`) makes the bridge the load-bearing piece: without recurrence detection, promotion stays operator-triggered and the deterministic surface cannot grow without a human on every promotion. Phase G (`ck:cook` → `loop_cook`) is one way to realize an agentic-step; it is mechanism, not keystone.
- **The `legacy/` rename trap is still live and unstarted.** `tools/learning-loop-mastra/tools/legacy/` still houses the 44 MCP tool implementations; `mastra/legacy-handler-adapter.js` is still imported by `server.js`; `hooks/legacy/`, `scout/legacy/` still carry the name. The docs-rewrite did not touch implementation-surface paths. Rename-first is still the highest-value lowest-risk move.
- **`workflow_intake_orient` is still a concept/implementation mismatch.** It reads `records/{meta,vnstock,fastapi,tanstack,product}/{index,capabilities,decisions,evidence}` (`workflow-intake-orient.js:8,36-66`) — i.e. orients from the **unbound product surface** plus four other surfaces, when the engine's engine/instance inversion (`loop-engine.md` escape-hatch #7) says only the **meta-surface is the bound instance**. In the new framing this is not just a stale-read bug; it is a violation of the bound-surface invariant.
- **Plan 5-Lite shipped, so the security gate that blocked memory-on workflows is cleared.** The original "ship before" ordering is satisfied; the bridge can be wired without widening blast radius, *provided* the write authority stays role-bound (deterministic writes; agentic records via promotion).
- **Change-logs are still immortal** (`core/meta-state.js:581` "change-log entries are never compacted"). The promotion query will run over a monotonically growing set. This is now a first-class design constraint on the query, not a separate hygiene task.

---

## Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX (operator) | Devil's Advocate | Resolution |
|-------|-----------|----------|-------------|----------------|------------------|------------|
| Is the report rewrite value or ceremony? | Value — it changes the next action (Phase G → bridge). | Neutral. | Neutral. | Value — the operator now reads direction in concept terms, not Mastra terms. | **Challenge:** the original recommendations (rename, harden, sequence) are unchanged in *action*; the reframe could be pure relabeling. | **Value, but only because it changes priority.** The rewrite is justified iff it changes what gets built next — and it does: Phase G drops off the critical path, the change-log recurrence query joins it. State the priority change explicitly in the report; otherwise it is ceremony. |
| Bridge wiring: gate-decision side vs change-log side | The bridge is **two halves**: recurrence over gate-decisions (wired — `recurrence-tracker.js` + `gate-check-recurrence-tool` + `recurrence-check-on-start` hook) and recurrence over agentic-deferral change-logs (unwired). The L1 doc says "unwired" without splitting them. | Gate-decision recurrence already auto-emits findings; auto-promoting from change-logs would widen the deterministic-enforcement surface without an operator ack. Keep change-log→promotion operator-gated. | Gate-decision recurrence scans a 10-min window (`recurrence-tracker.js` threshold N=3, window 10min) — bounded. Change-log recurrence scans an unbounded immortal set — needs an index or a window. | Operator needs to see *which* half is wired to know what to build. | The L1 imprecision ("the bridge is unwired") is itself a drift bug — a concept-surface doc mis-describes the implementation surface. Fix the doc or fix the code; don't leave both. | **Split the bridge in the L1 doc.** State: gate-decision recurrence is wired; change-log→promotion recurrence is the unwired half. The promotion query (Q2) targets the unwired half. This is the single most important correction the rewrite surfaces. |
| Should change-log recurrence auto-promote? | Telos says grow the deterministic surface — auto-promote on recurrence. | **No** — auto-promotion makes the registry a self-enforcing loop without operator judgment on class-approval (escape-hatch #5: what stays human forever includes class-approval definitions). | N/A. | Auto-promote would surprise the operator — "a rule appeared without my ack." | The engine's adversarial mindset (#6) says records are challenged by newer records; auto-promotion skips the challenge. | **Recurrence auto-flags; promotion stays operator-triggered.** The bridge's job is to *surface* "this recurred, ready to promote," not to promote. This matches `meta_state_promote_rule` being operator-gated today. |
| `intake_orient`: fix as bug or as contract violation? | Contract violation — it reads the unbound surface; the fix is to point it at the bound meta-surface (`meta_state_list` / `loop_describe`), not merely at a different records dir. | N/A. | Reading 5 surfaces' dirs is more I/O than reading the registry; fixing it shrinks the read. | Operator orientation should come from the bound surface — that is where the loop's self-model lives. | It is both; the contract framing is the durable fix, the bug framing is the immediate one. | **Fix as contract conformance**: re-point `workflow_intake_orient` to the bound meta-surface. Categorize it under L2 (runtime-contract) conformance, not L3 hygiene. |
| Legacy rename: still rename-first? | Yes — `legacy-pins.md` is a band-aid; the name is the smell. | N/A. | N/A. | A future cleanup agent WILL mis-delete on the `legacy/` name. | The rename is now *implementation-surface hygiene* (L3); it does not depend on the concept surface. Independent and parallelizable. | **Yes, rename-first, unchanged.** Now categorized as L3 hygiene independent of L1 direction. Highest-value lowest-risk first move. |

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| L1 doc says "bridge unwired" but gate-decision half is wired → concept-surface mis-describes implementation-surface | **High** | Split the bridge in `loop-engine.md` Open Question 1: gate-decision recurrence (wired) vs change-log→promotion recurrence (unwired). A concept doc that drifts from code is the exact bloat the reframe was meant to remove. |
| `legacy/` rename trap still live; 44 tool implementations deletable by name | **High** | Rename `tools/legacy/` → canonical; drop `legacy` from live code paths; reserve `legacy/` for dead code. Then dead-code removal is trivial. Unstarted — schedule it. |
| Change-log recurrence query runs over an immortal, unbounded set | Medium | Specify the promotion query with a window + index before wiring. Do not auto-promote; recurrence flags, operator promotes. |
| `workflow_intake_orient` orients from the unbound product surface (bound-surface invariant violation) | Medium | Re-point to `meta_state_list` / `loop_describe`. L2 contract-conformance fix. |
| Auto-promotion from change-logs would self-enforce without operator judgment on class-approval | Medium | Keep promotion operator-triggered (`meta_state_promote_rule`); the bridge surfaces candidates, does not promote. |
| Direction ambition outpaces substrate maturity | Low | Hardening shipped; substrate is stable enough for the bridge. The remaining caution is design (the query), not maturity. |

---

## Recommendations

1. **[DONE 2026-07-04]** **Correct the L1 doc's bridge description.** `docs/loop-engine.md` Open Question 1 said "the recurrence→promotion bridge is unwired." Split done: gate-decision recurrence is wired (`core/recurrence-tracker.js` → `gate-check-recurrence-tool` + `recurrence-check-on-start`); change-log→promotion recurrence is the unwired half. Both the inline "Status of the cycle" (L20) and Open Question 1 (L79) now name the two halves. L1 stays implementation-agnostic.

2. **[DONE 2026-07-04]** **Demote Phase G explicitly in the tracker — and close the tracker's lifecycle.** Per operator decision 2026-07-04, the master tracker (`productization-260612-1530-master-tracker.md`) has completed its lifecycle: Phases A–E shipped, Plan 5-Lite shipped, docs-rewrite shipped. Header `Status` flipped to "closed — lifecycle complete"; `Open` row frozen at closure with Phase G demoted from keystone to one candidate mechanism; `Recommended next move` struck and pointed at this report; Phase G section demotion banner added. Next steps (the bridge, stale-findings workflow, `legacy/` rename, `intake_orient` re-point) are **not bounded by this tracker** — tracked in their own plans. Body preserved as historical record.

3. **Specify the promotion query before any schema work (Q2, derived).** Write the query first: "find agentic-deferral change-logs whose pattern recurs within a window and is not yet a rule." The change-log schema (including the open provenance field from `loop-engine.md` Open Question 2) then serves the query. Do not optimize the changelog without this query — that was the original report's solution-first mistake.

4. **Re-point `workflow_intake_orient` to the bound meta-surface.** Treat it as L2 runtime-contract conformance, not L3 hygiene. It reads `records/{meta,vnstock,fastapi,tanstack,product}/...`; the engine's bound instance is the meta-surface only. Point it at `meta_state_list` / `loop_describe`. Small, self-contained, independent of the bridge. This is the original Rec 4, now with durable rationale.

5. **Run the legacy rename as a standalone L3 hygiene pass.** Unchanged from original Rec 1, now categorized: rename `tools/legacy/` → canonical (`tools/implementations/` or `tools/handlers/`), drop `legacy` from live code paths (`mastra/legacy-handler-adapter.js`, `hooks/legacy/`, `scout/legacy/`), reserve `legacy/` for dead code. Then dead-code removal (`AGENTS.old`, `trajectory.old`, archived docs, stranded fixtures, one-shot migration scripts) is trivial and safe. Highest-value lowest-risk first move; independent of the concept surface.

6. **Add the one-paragraph "Memory substrate" note to L1.** `runtime-contract.md` (L2) splits the three concerns and `architecture.md` (L3) names the three stores (`meta-state.jsonl`, `runtime-state.jsonl`, `file-index.jsonl`), but the concept surface (L1) does not name the substrate as a concept. One paragraph in `loop-engine.md` stating "the record is the memory; three stores realize it" closes the seam the original Rec 7 flagged.

7. **Keep promotion operator-triggered; encode it as a contract note.** The bridge surfaces recurrence candidates; the operator promotes via `meta_state_promote_rule`. This respects escape-hatch #5 (class-approval stays human) and #6 (adversarial mindset — records are challenged, not auto-promoted). Add one line to `loop-engine.md` "Concept vocabulary" § promotion: "promotion is operator-triggered by design; recurrence detection surfaces candidates, it does not promote."

---

## Unresolved questions

1. **Promotion query shape.** What counts as a "recurring agentic-deferral pattern" in the change-log — same `change_target`? same `change_dimension` × target prefix? Same as the gate-decision tracker's rule_id × command-prefix, or a new grouping? Needs a design pass before the schema.
2. **Provenance field scope.** `loop-engine.md` Open Question 2 proposes an agentic/deterministic provenance field on records. Does the promotion query *require* it (filter to agentic-deferral change-logs only), or can it infer provenance from `change_dimension`/kind today? If required, provenance is a prerequisite for the bridge, not a parallel schema change.
3. **Does the gate-decision recurrence bridge already cover some of Q2?** `recurrence-tracker.js` emits a finding when a *gate rule* recurs on a command prefix within 10 min. That is recurrence→finding, not recurrence→promotion. Confirm whether the operator wants the change-log bridge to reuse `findRecurrentGroups`'s window/threshold shape, or define its own.
4. **Legacy rename target name.** `tools/implementations/` vs `tools/handlers/` vs `tools/mcp/` — the original report left this open; the reframe does not resolve it. Pick one in the rename plan.
5. **Should the L1 bridge correction ship as a docs patch now, or roll into the next docs pass?** It is a factual drift (code wired, doc says unwired); per the adversarial mindset, drift between concept and implementation surface should be fixed on sight.

---

## Addendum: stale-findings growth + triage workflow (problem-solving)

**Trigger (operator, 2026-07-04):** stale findings are growing; a test caps the count and is currently over; we want a workflow for tackling stale/reported findings for both operator and agents.

**Status (updated 2026-07-04):** brainstormed and design agreed → see `plans/reports/brainstorm-260704-stale-findings-github-dispatch-report.md`. Locked decisions:
- **Dispatch model = B (dispatch handle).** Registry stays the single bound record; GitHub Issues is a one-way coordination substrate (`finding → issue → resolve-on-close`); back-pointer via `ledger_ref` → `runtime-state.jsonl`. No two-way sync (rejects Approach A's drift recursion).
- **Scope this round:** Rec 8 collapse (stale-ref → derived view, migrate 16, re-tighten cap) + dispatch feature (export + link-back only) + L1 concept statement *"findings are deferred decisions, not things to be removed."*
- **Authority:** operator dispatches; agent proposes candidates (maps to Q9).
- **Close:** manual `meta_state_resolve` + change-log required; operator/agent symmetric.
- **Lifecycle surgeries deferred** to a dedicated lifecycle-redesign plan: drop `auto-resolved`, drop `ack`/`active`, re-architect `OPERATOR_MODE` → delegated scoped authority. Dispatch is built compatible (explicit resolve, no ack needed, `delegated_to` recorded in ledger).
- **Resolved Q6–Q8, Q10** (see brainstorm report): Q6 stale-ref is a contract (enum) → remove + update tests; Q7 derived view as output mode of existing tools (no new tool); Q8 migrate 16 as `superseded` into one change-log (preserves lineage, supersedes the `auto-resolved` suggestion in Rec 8); Q10 re-tighten cap to non-terminal non-stale-ref count (~12).
- **Q11 half-solved** (scoped to the dispatch-close case only; general change-log trigger rule still deferred — see Addendum 2).
- **Next:** `/ck:plan --tdd` (recommended) or `/ck:plan` with the brainstorm report as context. Phase 1 (Rec 8) is prerequisite for phase 2 (dispatch launches on a clean queue).

### Verified state

- **28 stale** findings; **14 reported** (24h TTL); staleness window 7d (`core/meta-state.js:57` `STALENESS_WINDOW_MS`).
- The cap test (`__tests__/legacy-mcp/cold-tier-regression.test.js:76-78`) limits stale `mechanism_check` findings to **25**, temporarily relaxed from **3** (TODO at L66: "re-tighten … when the dedicated plan ships"). **Correction (verified 2026-07-04 against `meta-state.jsonl`):** the cap-test count is `stale + (mechanism_check === true || null)` = **11 today**, NOT 28 — the earlier "28 > 25 → gate breached" conflated *total stale* (28) with the *cap-test count* (11). The gate is **passing at 11/25**; the original threshold of 3 is what 11 breaches. Of the 16 `stale-ref`, 15 are `mechanism_check: false` (sweep follow-ups, intentionally excluded from the cap per `meta-state-sweep-tool.js`'s comment) and only 1 is `mc=true`. So the Rec 8 migration drops the cap-test count by **1** (11→10), not 16 — see the brainstorm report for the corrected re-tighten target (~10). The migration's value is hygiene + recursion collapse, not unblocking a breached gate.
- Stale by category: **`stale-ref`: 16**, `loop-anti-pattern`: 7, `mcp-tool-missing`: 3, `schema-drift`: 1, `budget-check`: 1. By system: `meta-state-tools`: 17, `mcp-tools`: 5, `gate-logic`: 3, `meta`: 2, `vnstock`: 1.
- Existing lifecycle machinery (do not reinvent): `meta_state_sweep` (expiry + auto-resolve, dry-run default), `meta_state_re_verify` (stale→active on pass), `meta_state_ack`/`resolve`/`supersede`, `reopens` + `cascade_from` (1-step cascade-close of a stale parent), `meta_state_relationships` (1-hop traversal), `meta_state_query_drift`, `meta_state_relationship_validate` (orphan-id lint).

### Technique 1 — Meta-Pattern Recognition

The same pattern recurs in 3+ forms: **the registry records findings about its own hygiene, and those findings age into stale.**

| Form | What gets recorded | Goes stale how |
|---|---|---|
| `stale-ref` finding | "entry X is an orphan / points at a stale entry" | the stale entry it cited stays stale → the stale-ref finding itself drifts past 7d |
| orphan-ref finding | "this id references a missing entry" | the missing entry is never fixed → orphan-ref ages out |
| drift-about-drift | a finding re-flagging a `query_drift` result | the underlying drift persists → the re-flag goes stale |

**Universal principle:** *the registry should not record what it can derive.* A stale-ref is a **query result over the relationship graph** ("findings whose `ref_by`/`reopens` target is stale or missing"), not a record. Recording it as a finding creates a second-class record that inherits the first-class record's staleness — a recursion. 16 of 28 stale entries are this recursion.

### Technique 2 — Simplification Cascade

If `stale-ref` becomes a **derived view**, not a recorded finding:

- 16 stale entries vanish (they are not findings; they are a query output).
- The `stale-ref` category is eliminated as a recorded kind.
- The recursion breaks: there are no stale-ref findings to go stale.
- The cap-test count drops from **11 → ~10** (not 28 → 12 — see the correction at line 113: 15 of 16 `stale-ref` are `mc=false` and already excluded from the cap; only 1 `mc=true` stale-ref counts). The *total* stale count drops 28 → 12; the cap-test count (which counts only `mc=true|null`) drops 11 → 10. The threshold can re-tighten from 25 toward ~10 per the test's own TODO (re-tightening to the original 3 requires resolving the ~10 real underlying issues first).
- `meta_state_relationship_validate` (already lints orphan ids) + `meta_state_relationships` (already does 1-hop traversal) become the *surfaces* for the view — no new primitive, just "do not persist what these already compute."

One insight eliminates a category, 16 noise records, and a recursion. (The gate was already passing at 11/25 — see the correction at line 113; the recursion is hygiene debt, not a breached gate.)

### Technique 3 — Scale Game

At 1000×: if every stale entry can spawn a stale-ref finding, and stale-refs themselves go stale and spawn stale-refs, the registry grows **quadratically** with the stale count — unbounded. Under the destination sentence (self-referential loop with verification autonomy), this is a leak the loop cannot self-correct, because the correction (record a stale-ref finding) *is* the leak. The recursion is the cause; the cap test (which counts only `mc=true|null`, and which sweep's `mc=false` follow-ups already opt out of) is not the symptom of a breach today — it is passing at 11/25 — but it would eventually surface the recursion if `mc=true` stale-refs accumulated. Removing the recursion is the fix; capping the count alone would mask it.

### The workflow, in two-surface terms

**Concept surface (L1):** a stale finding is an **agentic deferral whose decision was not taken within the staleness window** — not a failure, a *deferred decision*. The engine's telos (grow the deterministic surface) says every stale finding has exactly three deterministic exits: **promote** (recurs → rule), **resolve** (closed — fixed or no longer relevant), or **re-verify** (re-activate, the deferral resumes). Triage = pick one exit per stale entry. The workflow is the promotion query applied to the stale queue.

**Implementation surface (L2/L3) — operator workflow:**
1. `meta_state_sweep({apply:true})` — flush reported→stale transitions and auto-resolve watched-file-modified entries.
2. `meta_state_list({status:"stale"})` — the stale queue.
3. For the non-`stale-ref` majority: triage each to promote (`meta_state_promote_rule`) | resolve (`meta_state_resolve`) | re-verify (`meta_state_re_verify`) | supersede (`meta_state_supersede`).
4. For the `stale-ref` 16: do **not** triage individually — migrate them to the derived view (next section) and let the recursion collapse.
5. Re-tighten the cap-test threshold to the post-triage real count (per the test's own TODO L66-72).

**Implementation surface — agent workflow (deterministic-step, loop-encoded):**
1. Session-start: surface the stale queue (a `loop_describe` warm-tier hint or a `query_drift`-style view) — top-N stale findings the agent can address this session.
2. Agent re-verifies stale findings whose `evidence_code_ref` it can re-check this session: `meta_state_re_verify` → active on pass, fail on drift.
3. Agent does **not** auto-resolve or auto-promote — those are operator-judgment boundaries (escape-hatch #5: class-approval stays human; #6: adversarial mindset — records are challenged, not auto-closed). Agent *proposes* resolution/promotion; operator disposes.
4. Agent records its triage actions as **change-logs** (what it did), never as `stale-ref` findings (what it noticed). Observations are queries; actions are records.

**Reported findings (14, 24h TTL):** the same workflow's step 1 handles them — `sweep` flushes them to stale when the TTL fires, then they enter the stale queue. No separate reported-triage path; the TTL is the timer, sweep is the transition, the stale queue is the triage inbox. If reported findings pile up (many open >24h), that is a signal the operator is not acking fast enough — a *discovered-vs-acked* annotation (escape-hatch #13, operator-capture guard) would surface it, but is out of scope here.

### Recommendations (addendum)

8. **Stop recording `stale-ref` as a finding kind; make it a derived view.** Extend `meta_state_relationship_validate` / `meta_state_relationships` to surface "findings whose ref target is stale or missing" as a query output. Migrate the 16 existing `stale-ref` findings out of the registry as `superseded` (consolidated into one change-log noting the migration) — `superseded` preserves the lineage that the recursion existed so it doesn't quietly recur, and matches the "deferred decision, not removed" framing (status block above supersedes the earlier `auto-resolved` suggestion). This collapses the recursion (16 noise records). **Highest-value hygiene move — one insight, 16 records, one recursion.** (Note: the gate was passing at 11/25, not breached — see the correction at line 113; the value is hygiene + concept cleanliness, not unblocking a breach.)

9. **Encode the triage workflow as a consult-gate or skill, not a doc.** Per the docs-rewrite philosophy ("md is debt owned by the loop; procedural knowledge is loop-encoded, not doc'd"), the operator + agent triage steps above are procedure → they belong in a loop-encoded consult-gate or a skill, not in `docs/`. The L1 doc states the *concept* (three deterministic exits); the *procedure* is loop-encoded.

10. **Wire the stale queue into session-start discoverability.** Today `recurrence-check-on-start` runs at SessionStart; add a stale-queue surfacing so the agent sees the top-N addressable stale findings at boot. This is the agent half of the workflow and the natural consumer of the derived `stale-ref` view.

11. **Re-tighten the cap-test threshold after the `stale-ref` migration.** The test's own TODO (L66-72) asks for this; the migration makes it possible — the real underlying-issue `mc=true|null` count (~10 today: 7 anti-pattern + 3 mcp-tool-missing, trending down with triage) becomes the ceiling, not 11 (the current cap-count, which already excludes the 15 `mc=false` stale-refs). Re-tightening to the original threshold of 3 requires resolving those ~10 real issues first — a follow-up, not this move.

### Unresolved questions (addendum)

6. **Is `stale-ref` recorded anywhere as a *contract* (test, schema enum, tool behavior) that must change, or is it purely convention?** `core/meta-state.js:63` lists `stale-ref` in the category enum. Migrating it to a derived view means removing it from the recorded-category set — confirm no test pins a `stale-ref` finding *existing* (vs. the orphan-lint surfacing one).
7. **Should the derived `stale-ref` view be a new MCP tool, or an output mode of `meta_state_relationships` / `meta_state_query_drift`?** The latter is cheaper (no new tool surface); confirm the warm-tier `loop_describe` can carry the count without a new tool.
8. **Auto-resolve vs migrate for the 16 existing `stale-ref` entries.** `auto-resolved` (closed by mechanism) vs `superseded` (consolidated into a change-log) carry different lineage semantics. Which preserves the audit trail that the recursion existed, so it doesn't quietly recur?
9. **Should the agent workflow's session-start stale surfacing be gated by `OPERATOR_MODE`?** Surfacing stale findings to a non-operator agent could prompt it to act on findings outside its authority. Confirm the boundary: agent re-verifies (mechanical), operator promotes/resolves (judgment).
10. **Does the cap test measure the right thing?** It counts stale `mechanism_check:true|null` findings. After the `stale-ref` migration, should it also exclude `auto-resolved` and count only `active|stale` non-terminal entries, to prevent future bypass-by-status?

---

## Addendum 2: change-log trigger ambiguity (added 2026-07-04, emerged executing Rec 1/2)

**Status (updated 2026-07-04):** Q11 is **half-solved** by the brainstorm (`plans/reports/brainstorm-260704-stale-findings-github-dispatch-report.md`). The scoped rule shipped there: *landing a fix for a dispatched finding is a change-log trigger (it changed a bound artifact), operator/agent symmetric.* The **general** trigger rule (Rec 12 — which actions across doc/contract/schema/lifecycle edits become change-logs) remains unresolved and is the prerequisite this addendum identified. It is deferred to a dedicated lifecycle-redesign plan alongside the auto-resolved / ack-active / OPERATOR_MODE surgeries.

**Finding:** while executing Rec 1/2, the operator + agent hit an unscripted gap — *is a `change-log` entry required for these edits?* The `record` concept role (`loop-engine.md`) and the `change-log` 4-kind define *what* a change-log is (an immutable record that a system change happened) but not *when* an action triggers one. The boundary between "this happened → change-log," "this is a gap → finding," and "this needs no record" is unwritten. **Both operator and agents are unsure**, which means change-logs are under-filed (changes happen unrecorded, the audit trail loses entries) or over-filed (noise that ages into the stale-ref recursion). This is a concept-surface (L1) gap in the `record` role, and it feeds the stale-findings problem directly: a change-log with no crisp trigger is either missing or noise.

**In two-surface terms:** the *trigger* of a change-log is a concept-layer question (which actions are records), not a mechanism-layer one (which tool writes it). `meta_state_log_change` is the mechanism; the open question is when the operator/agent must invoke it. Today the internalization rule (AGENTS.md §6) cites vendor-api / budget actions specifically; it does not state the general trigger for doc / contract / tracker / lifecycle / schema edits — exactly the class Rec 1/2 belong to, which is why the ambiguity surfaced now.

### Recommendation (addendum 2)

12. **State the change-log trigger as a concept-surface rule.** In `loop-engine.md` (L1) under the `record` role, or as a short consult-gate: *an action becomes a change-log when it changes a bound artifact (concept- or implementation-surface doc, the runtime contract, registry schema, tool manifest, tracker lifecycle) or a rule/policy. It does not become a change-log for in-session scratch, plan drafts, or reversible edits inside a not-yet-shipped plan.* This makes the `record` role's trigger queryable and ends the operator/agent ambiguity. Pairs with Rec 9 (procedure → loop-encoded, not doc'd): the trigger rule is the kind of procedure that belongs in a consult-gate, not prose. Resolving this is a prerequisite for the agent triage workflow (Rec 9–11) — an agent that records its triage actions as change-logs needs to know the trigger, or it will either over-file (re-creating the stale-ref recursion) or under-file (losing the audit trail).

### Unresolved question (addendum 2)

11. **Operator/agent symmetry.** Does the change-log trigger rule cover operator edits and agent edits symmetrically, or does the operator get an exemption (the operator's own changes are witnessed in-session, not recorded)? If asymmetric, the rule must state the split explicitly — otherwise the ambiguity survives. Connected to escape-hatch #13 (operator-capture guard): if operator changes are not recorded, the meta-surface becomes a record of operator preferences, not system truths. Resolving this question is the prerequisite to Rec 12 — the trigger rule cannot be written without it.