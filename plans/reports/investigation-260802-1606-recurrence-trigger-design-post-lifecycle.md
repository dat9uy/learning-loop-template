# Recurrence trigger design — post-lifecycle update (supersedes 0052)

**Supersedes:** `investigation-260802-0052-recurrence-trigger-design.md` (problem diagnosis + §3 window fix + §4 token-category-error retained; §2.2 reopen linkage, §5 rec 5, §6 mechanism verdict **outdated by PR 109**).
**Trigger for this update:** PR 109 (`58d8fd5`, *meta-state lifecycle migration — citation substrate, accepted status, supersede collapse*) shipped the lifecycle model the cancelled plan was waiting on. The owner's directive: write this report, then revive the cancelled plan from `plans/260802-0135-recurrence-trigger-window/`.
**Scope unchanged:** Channel A (discrete gate-escalation recurrence → registry) only. Channel B (in-context recognition) stays on steering + retrospective.
**Method:** the stuck was "the `reopens` linkage is the only way to relate new in-vivo evidence to an accepted-limitation finding" — a forced-premise stuck. PR 109 applied the **Inversion** (resolved/accepted is terminal; new evidence appends; relationships are *emergent* at read time, not declared at write time) and a **Simplification Cascade** (`consolidated_into`/`origin`/`supersedes`/`reopens` → one untyped `citation` kind + an `accepted` status). This report applies both to the recurrence trigger: P4 inverts and collapses; one correct `evidence_code_ref` value deletes four mechanisms.

## 0. Verified post-PR-109 code state (scouted this session, not assumed)

The phase-1 PM report (`pm-260802-0500`) listed Phases 2–6 as pending, but PR 109's merge after it shipped the rest. Confirmed against source:

| Claim | Verification |
|---|---|
| `accepted` finding status shipped | `core/constants.js:60` `TERMINAL_STATUSES = Set(["resolved","superseded","accepted","archived"])`; `core/meta-state.js:402` enum `["open","resolved","accepted","archived"]`; `acceptEntry` at `meta-state.js:1613+`; `meta_state_accept` handler exists |
| `reopens`/`cascade_from` **writers dropped** | `core/field-glossary.js:76`: *"The `reopens` writer was dropped — `meta_state_report` no longer accepts the arg; existing on-disk values are inert-historical and queryable, but no new edges can be initiated."* No writer in `core/` (only read-side: `loop-introspect.js` `reopens_inverse`, tests, glossary) |
| Citation substrate shipped | `core/__tests__/citation-substrate.test.js`; `tools/handlers/scripts/migrate-origin-supersedes-to-citations.mjs`; migration plan `phase-02-citation-substrate.md` |
| `recurrence-tracker.js` **unmodified** — none of the cancelled plan landed | `findRecurrentGroups` still `since: now-10min` (`:40-42`); group key still `rule_id::normalized_prefix`, no `session_id` (`:48`); `existing` filter still `isOpen(e)` only (`:87-93`); `recurrence_key` still raw prefix (`:116`); `description` still embeds `sample_commands` (`:117-119`); finding `status:"open"` (`:122`) |
| B not yet migrated | `meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc`: `status: open`, `accepted_at: None`, `version: 21`, `recurrence_key: None`, `reopens: None`. Operator migration script not yet run. |
| Zero `recurring-false-positive` findings in registry | `meta_state_list` confirms count 0 — trigger has still never fired (window bug holds) |

So: **the lifecycle substrate PR 109 promised is in place; the recurrence trigger is still entirely un-fixed.** P1–P3+P5 revive; P4 dissolves. Two latent bugs surfaced by re-grounding (below) fold into the revive.

## 1. P4 dissolves — `reopens` linkage → file-index co-citation (Inversion + Cascade)

The 0052 report's §2.2 ("set `reopens: ['<B-id>']` + cascade-resolve; converts B stays-open-self-validated → B reopened by in-vivo evidence") and §6 ("`reopens` is the correct primitive") are **refuted by PR 109**. `reopens` writers are gone; resolved/accepted is terminal. The lifecycle-modeling investigation (`investigation-260802-0152` §2.4) already decided this: *"file the recurring finding with `evidence_code_ref` to the gate code; file-index connects it to B and co-citing records for free — no `reopens`, no `informs`/`evidence-for` edge, no cascade."* This report confirms it is now shippable and sharpens one load-bearing detail the investigation left loose.

**The detail that makes "free" actually work — `evidence_code_ref` must cite the gate-rule code, not the detector.** File-index co-citation relates two findings only if they cite the **same code path**. B cites `tools/learning-loop-mastra/core/gate-logic.js#stripNodeEvalBody` (verified). The tracker currently writes `evidence_code_ref: "tools/learning-loop-mcp/core/recurrence-tracker.js"` (`recurrence-tracker.js:120`) — two defects:
1. **Stale path** — `-mcp` (the pre-migration repo name); actual is `-mastra`. A pre-existing latent bug.
2. **Wrong referent** — the *detector* (`recurrence-tracker.js`), not the *gate rule* (`gate-logic.js#stripNodeEvalBody`). Co-citation against the detector connects the recurring finding to nothing useful; against the gate-rule code it connects to B and every other finding about that rule.

**Cascade payoff:** setting `evidence_code_ref` to the gate-rule code (matching B) deletes the cancelled plan's entire P4 apparatus — the curated `RULE_TO_ACCEPTED_LIMITATION` map, the `reopens` field write, the cascade-resolve step, the core→handler layering question, and the existence-guard (red-team C2). One field value replaces four mechanisms. The link is *discovered* at read time via `meta_state_relationships` / file-index neighborhood, not *declared* at write time. No new tool, no new schema field, no new edge kind.

**Open mechanic — deriving the gate-rule code path from `rule_id` — RESOLVED by scouting.** The decision-log entry (`gate-decision-log.js:33-42`) carries `rule_id` + `matched_pattern` but **no code path**. Three options were considered: (a) a curated `RULE_ID_TO_CODE_REF` map; (b) a `code_ref` field on the decision-log entry; (c) read the code ref off the promoted `rule` record. **Scouting settled (c):** the decision-log `rule_id` for promoted rules *is* the meta-state rule id (`gate-logic.js:970,1039`); rule records carry `evidence_code_ref` (`meta-state.js:646`); `findRecurrentGroups` already skips `rule_id: null` entries (`recurrence-tracker.js:47`). So for every group that can ever fire, the rule id resolves to a rule record whose `evidence_code_ref` is the gate-rule code — **no curated map, no decision-log field change**. File-index co-citation keys on file path (`meta-state.js:1133`, `:line` stripped), so a recurring finding citing the rule's `evidence_code_ref` co-cites B at `gate-logic.js` file granularity when both touch that file. (A gate *constraint* — `rule_id: null` in the log, e.g. the `docker` constraint — never reaches `checkAndEmit` at all, so no derivation needed for it.) This is the *only* new surface P4-dissolution costs, and it is a single registry lookup (reusing the `readRegistry` the dedup filter already does), not infrastructure.

## 2. P3 simplifies — suppression filter collapses to permanent-for-non-archived (no grace window)

The 0052 report's §7 verdict (grace window predicates on meta-state's `resolved_at`, not runtime-state) is **superseded — the grace window is dropped entirely.** A 5-persona `ak:predict` debate (260802-1606, verdict CAUTION) resolved the resolved-finding re-filing policy: **`open`, `accepted`, and `resolved` all suppress re-filing permanently; only `archived` re-admits** (a deleted finding can re-detect). No time-based grace window, no `resolved_at` ts-comparison.

**Why no grace window (the premise challenge that broke it):** the decision-log is append-only and never trimmed/rotated (verified: 18,688 lines in one surface, growing unbounded). A stateless full-log scan re-finds the *original* burst every session. A time-based grace window (the 0052 §5 rec 3 "N=14 days") can't distinguish "same stale entries being re-scanned" (noise) from "new entries after a fix that didn't hold" (real regression) — it re-files from stale entries after N days (noise) and suppresses genuine recurrences within N days. Wrong axis on both sides.

**Why not `resolved_at`-relative re-filing (Option A) either:** A (suppress entries `ts <= resolved_at`; re-file on a post-`resolved_at` burst) was the proposed replacement. The debate's load-bearing finding (Devil's Advocate): **`resolved_at` is a *social* event ("operator marked resolved"), not a *technical* cutover ("rule patch deployed").** Resolve and patch are separate operations in this loop; an operator can resolve *before* the patch lands, so entries with `ts > resolved_at` but pre-patch are the OLD burst's tail — yet A files them as a "regression." A conflates "finding closed" with "rule fixed" — a real false-positive class. So A trades B's false-negative (missed same-prefix regression) for A's false-positive (phantom regression on resolve-before-patch); **neither dominates, and A is not strictly safer.**

**Why permanent-for-resolved is acceptable (the blind spot, recorded deliberately):** B does create a blind spot — a genuine same-prefix regression after resolve will NOT auto-file in the registry. The debate accepted this because: (1) the **live gate banner** fires every command regardless of registry state (first-order signal, unaffected by A/B); (2) same-prefix regression after a *correct* rule refinement is near-impossible (the refined regex no longer matches the prefix); (3) the trigger has never fired, so the recall chain (file → resolve → incomplete fix → re-burst) is entirely hypothetical. Security/UX's concern (permanent silent suppression is a silent failure mode; B "inverts the trust contract" for the did-my-fix-hold case) is real and is converted from a hidden defect into a **documented, revisitable trade-off** rather than built-around prematurely.

The filter simplifies from:
```js
// recurrence-tracker.js:87-93 (current)
e.subtype === "recurring-false-positive" && isOpen(e) && e.recurrence_key
```
to:
```js
e.subtype === "recurring-false-positive"
  && e.recurrence_key
  && e.status !== "archived"      // open + accepted + resolved all suppress permanently; archived re-admits
```
`accepted` and `resolved` are terminal so `isOpen` excludes them — the `!== "archived"` check re-admits all three live/closed states to the suppress set. Note finding B (`subtype: strip-bypass-accepted`) is **not** in this filter — B is a different subtype; the recurring finding and B relate by co-citation (§1), not by `recurrence_key` dedup. The `accepted`/`resolved` suppression here is for `recurring-false-positive` findings the operator accepts/resolves.

**Revisit trigger (explicit, not hidden):** add a post-resolve re-file path *if* a documented incident occurs where an operator resolved a recurring-fp, the rule was not actually fixed, the same prefix re-burst ≥3× in a session, and the live banner proved insufficient. Until then: YAGNI.

## 3. Unchanged core (re-verified against source)

- **§3 window fix (0052) — stands, still unimplemented.** `findRecurrentGroups` (`recurrence-tracker.js:37-42`) still filters `readDecisionLog({ since: now-10min })`; the 10-min window still does double duty as burst-definition + scan-range; human-paced cadence still yields zero groups. Fix unchanged: add `session_id` to `appendDecisionLog` (`gate-decision-log.js:33-42`, no `session_id` today), group by `(rule_id, normalized_prefix, session_id)`, threshold N≥3 per session, drop the `since` filter. `recurrence_key` stays `rule_id::…` (cross-session dedup); `session_id` is grouping-only. Cancelled plan design decision #1 (`session_id` from Claude Code PreToolUse payload, `getSessionId(root)` fallback) stands.
- **§4 token/category-error (0052) — stands, re-verified.** `recurrence-check-on-start.js:24-25` does `console.error` + `process.exit(0)`; emits no `hookSpecificOutput.additionalContext`. Silent-write channel, 0 agent tokens. Relevance filtering stays at the pull layer. Do not promote to `additionalContext`.
- **§1/§3 rejected alternatives — stand.** No push-inline `checkAndEmit` (synchronous I/O in the gate critical path); no SessionEnd (not a wired event); no commit-msg (redundant + misses commit-less sessions).

## 4. P2 redaction — stands, with the stale-path fix folded in

The 0052 scouting resolution (GO blocker: `meta-state.jsonl` is tracked; raw `sample_commands` ≤50 chars can leak secrets like `curl …?token=eyJ…`) **stands**. The cancelled plan's decision (hash the prefix in `recurrence_key` = `rule_id::sha256(prefix)[:12]`, drop raw `sample_commands` from `description`; provably non-reversible; free format change since zero existing findings) **stands**. The §1 `evidence_code_ref` stale-`-mcp`-path fix rides in the same phase — both are "what the finding writes," touched once.

## 5. B itself — migrate to `accepted` (operator step, parallel, non-blocking)

B is still `open` (`version: 21`). PR 109 shipped `tools/handlers/scripts/migrate-accepted-limitations.mjs` (dry-run default; scans `subtype` ending `-accepted`) precisely for B and its 5 kin. Running it flips B `open`→`accepted`, fixing the status-lie (B stops counting as an open problem; stops appearing in the stale-view as aged). This is the lifecycle migration's final operator step — **independent of the recurrence trigger** but complementary: once B is `accepted` and the trigger ships with the §1 `evidence_code_ref` fix, a recurring finding citing `gate-logic.js#stripNodeEvalBody` co-cites B, surfacing "this accepted limitation is actively recurring in vivo" as read-time neighborhood, without re-opening or closing B. Re-deriving B's scope still waits for structured counts (0052 lean, unchanged).

## 6. Updated recommendation (ordered, supersedes 0052 §5)

1. **Fix the window → session grouping (P1).** Add `session_id` to `appendDecisionLog` (`gate-decision-log.js`); group `findRecurrentGroups` by `(rule_id, normalized_prefix, session_id)`, N≥3 per session, drop the 10-min `since` filter. In-call dedup of `fresh` groups by `recurrence_key` (one finding per key per call).
2. **Redact + fix the evidence path (P2).** Hash the prefix in `recurrence_key`; drop raw `sample_commands` from `description`. **Fix `evidence_code_ref`** from the stale `tools/learning-loop-mcp/core/recurrence-tracker.js` to the **gate-rule code** by reading the promoted `rule` record's `evidence_code_ref` (§1, scouting-resolved) — this is the P4-dissolution mechanic and the stale-path fix in one edit.
3. **Collapse suppression to permanent-for-non-archived (P3).** Widen the `existing` filter (`recurrence-tracker.js:87-93`) per §2: `open` + `accepted` + `resolved` all suppress permanently; only `archived` re-admits. No grace window, no `resolved_at` comparison.
4. **P4 — dissolved.** No `reopens`, no `RULE_TO_ACCEPTED_LIMITATION` map, no cascade-resolve, no existence-guard, no `informs`/`evidence-for` edge. The link is emergent file-index co-citation, enabled by rec 2's `evidence_code_ref`. Zero code beyond recs 1–3.
5. **Keep it stateless (P5).** Full-log scan each SessionStart + dedup. No watermark unless profiling demands it. Regression must cover `accepted` suppression (new) + `resolved`-grace + session grouping + redaction.
6. **Do NOT** add commit-msg / push-inline / SessionEnd; do **NOT** promote to `additionalContext`; do **NOT** re-introduce `reopens` or any new declared edge for the B-linkage. (PR 109 closed that door deliberately; re-opening it re-creates the mutation smell.)
7. **B migration (parallel, operator).** Run `migrate-accepted-limitations.mjs --dry-run` then `--apply` to flip B + kin to `accepted`. Non-blocking for the trigger; do alongside.

## Unresolved questions

**Resolved this session (260802-1606):**
- **Redaction strength → hash** (operator decision). `recurrence_key = rule_id::sha256(prefix)[:12]`; drop raw `sample_commands` from `description`. Provably leak-free; free format change (zero existing findings).
- **Suppression policy → permanent-for-non-archived** (5-persona `ak:predict`, verdict CAUTION). `open`/`accepted`/`resolved` all suppress permanently; `archived` re-admits. No grace window, no `resolved_at` comparison. Blind spot (same-prefix regression after resolve won't auto-file) accepted deliberately — mitigated by the live gate banner + rarity; revisit trigger recorded in §2.
- **Open-finding suppression → permanent until resolved** (operator decision). Re-filing duplicates the stale-view pull (`meta_state_query_drift`); YAGNI.
- **B-migration timing → now, before trigger ship** (operator decision). Run `migrate-accepted-limitations.mjs --dry-run` then `--apply` to flip B + kin `open`→`accepted`. Independent of the trigger; completes the lifecycle migration's final operator step.
- **`rule_id` → gate-code-path derivation → read the promoted `rule` record's `evidence_code_ref`** (scouting-resolved). Decision-log `rule_id` for promoted rules *is* the meta-state rule id (`gate-logic.js:970,1039`); rule records carry `evidence_code_ref` (`meta-state.js:646`); `findRecurrentGroups` already skips `rule_id: null` entries (`recurrence-tracker.js:47`). So for every group that can ever fire, the rule id resolves to a rule record whose `evidence_code_ref` is the gate-rule code — no curated map, no decision-log field change. File-index co-citation keys on file path (`meta-state.js:1133`, stripped of `:line`), so a recurring finding citing the rule's `evidence_code_ref` co-cites B at file granularity when both touch `gate-logic.js`. (Caveat: a gate *constraint* — `rule_id: null` in the log, e.g. the `docker` constraint — never reaches `checkAndEmit` at all, so no derivation needed for it.)

**Still open (defer to plan execution):**
- **`evidence_code_ref` specificity for co-citation.** The rule record's `evidence_code_ref` may be a bare file path (no `#function` anchor) or a `#line`-tagged path; file-index strips `:line` (`meta-state.js:1133`), so file-granularity co-citation holds either way. Whether to cite the rule record's exact value verbatim or normalize to `gate-logic.js` (matching B's `gate-logic.js#stripNodeEvalBody` at file level) is a P2 scouting detail, not a design fork.

**Dissolved (no longer open):** reopens cascade (auto-run vs defer), reopens mapping mechanism, reopens existence-guard — all gone with PR 109. Grace-window policy (forever vs N-days) — dissolved by the permanent-for-non-archived decision.

## Scouting resolutions (260802-1606)

- **PR 109 shipped Phases 1–5, not just Phase 1** — the phase-1 PM report (`pm-260802-0500`) is stale; `accepted` + citation substrate + reopens-writer-drop all confirmed in source.
- **`recurrence-tracker.js` untouched** — all five cancelled-plan phases still pending; nothing to reconcile.
- **B = `meta-260615T1920Z-…`**, `open`, cites `gate-logic.js#stripNodeEvalBody` — the co-citation anchor for §1.
- **`evidence_code_ref` stale-`-mcp`-path + detector-referent** — pre-existing latent bug, load-bearing for P4-dissolution; folded into P2.
- **`appendDecisionLog` carries no `session_id` and no code path** — P1 adds `session_id`; the code path comes from the promoted rule record's `evidence_code_ref` (option c), not the log entry and not a curated map.
