---
phase: 3
title: "Close Flow + Rec 10 Session-Start Surfacing"
status: pending
priority: P2
dependencies: [1, 2]
---

# Phase 3: Close Flow + Rec 10 Session-Start Surfacing

## Overview
Define the explicit close flow for a dispatched finding (refresh file index → change-log → resolve, with PR/issue ref in the resolution note), add the four TTL test cases that guard the dispatch/TTL interaction in v1, and build the Rec 10 session-start surfacing: a read-only "top-5 stale dispatch candidates" block in the SessionStart hook, with an "agent proposes; operator dispatches" protocol prompt that instructs the agent to run `gh issue create` (the core tool does not access GitHub — see Phase 2).

## Requirements
- Functional: a dispatched finding can be closed via `meta_state_refresh_file_index` → `meta_state_log_change` → `meta_state_resolve` (resolution note = "fixed in PR #X (change-log \<id\>)"). The `ledger_ref` back-pointer and the ledger event survive reported→stale and stale→active transitions. Rec 10 surfaces a bounded **top-5** of stale dispatch candidates at SessionStart (no `stale-ref`-category, no `ledger_ref`-set, no terminal) with the dispatch protocol prompt.
- Non-functional: Rec 10 surfacing is **read-only** (no `meta-state.jsonl` write — uses the `session-start-inject-discoverability.cjs` hook, NOT the writing `recurrence-check-on-start.js`); commit-dispatch is **operator-gated** (Phase 2); surfacing is **ungated** (any session can see the stale queue). Ranking uses a defined "fixability" predicate.

## Architecture
**Close flow.** `meta_state_resolve` (`tools/legacy/meta-state-resolve-tool.js:84-118`) runs the `rule-no-orphaned-evidence` consult-gate: `core/gate-logic.js#checkResolutionEvidence` `:651-716` filters active/reported `mechanism_check:true` findings, hashes the live file at `evidence_code_ref` (anchor stripped), and compares against the `file-index.jsonl` baseline (authoritative) falling back to per-record `code_fingerprint`. On mismatch it returns `fingerprint_mismatch` and blocks resolve. So a fix that edits `evidence_code_ref` MUST `meta_state_refresh_file_index({path})` first (`tools/legacy/meta-state-refresh-file-index-tool.js:108-115` upserts the live hash) — then `meta_state_log_change` (the fix changed a bound artifact, including `tools/**`/`core/**` source — scoped dispatch-close case; the general Rec 12 rule is deferred) — then `meta_state_resolve`.

**Sweep interaction (scout correction).** `meta_state_sweep`'s handler (`meta-state-sweep-tool.js:44-61`) only runs `checkExpiry` (reported→stale) + `checkStaleness` (active→stale). There is **no file-modification→`auto-resolved` branch** (the L24-25 comment + L40 description reference it, but no production write path sets `auto-resolved` — grep confirmed). So the brainstorm's "sweep skips `ledger_ref`-set entries" guard is **moot in v1** — dropped. The TTL survival tests replace it. (L13 `TERMINAL_STATUSES` includes `"stale"`, so sweep skips already-stale entries — a dispatched `stale` finding is not re-processed.)

**Rec 10 surfacing.** `session-start-inject-discoverability.cjs` is the read-only hook (writes only `.claude/session-context.json`; imports `core/loop-introspect.js` `buildDiscoverabilityHints`/`buildProcessHints` at L17, calls them at L26-27, writes at L34-37). Add a new `buildStaleDispatchHints(root)` builder in `core/loop-introspect.js` (which already reads the registry via `readRegistry` at L188+), call it from the hook alongside the existing builders, and include its output in `session-context.json`. Do NOT fold this into `recurrence-check-on-start.js` (it writes findings via `recurrence-tracker` — not read-only).

**INC-10 — Orphan surfacing:** the `buildStaleDispatchHints` builder outputs two lists:
- `fixable_candidates` — findings matching the ranking predicate below (non-empty `evidence_code_ref`, `severity !== "escalate"`, no `ledger_ref`, non-terminal; top-5).
- `orphan_findings` — findings with `status: "reported" | "active"` AND a `dispatch-<id>` ledger row exists in `runtime-state.jsonl` BUT the finding's `ledger_ref` is NOT set (or doesn't match the row's id). These are orphans from a failed `updateEntry` retry — surface them with a clear "re-invoke `meta_state_dispatch_finding` to heal" prompt. Top-N = 5.

Both lists are surfaced in the same `session-context.json` block; the dispatch protocol prompt explains both flows.

**Ranking predicate (validation P3-W4).** "Fixability" is defined concretely: a stale finding is **fixable** iff it has a non-empty `evidence_code_ref` (localized to an editable file under the repo root) AND `severity !== "escalate"` AND no `ledger_ref` set (not already dispatched). Rank fixable candidates by `severity` (warning before escalate — but escalate is filtered out, so this is a tiebreaker), then `age` (older first), then `category` (a stable tiebreaker). **Top-N = 5** (validation P3-W3).

**Dispatch protocol prompt.** The Rec 10 hint includes the protocol the agent follows (Phase 2): "agent calls `meta_state_dispatch_finding({id, stage:"prepare"})` → runs `gh issue create --repo <private-coordination-repo>` [check exit code] → calls `meta_state_dispatch_finding({id, stage:"commit", issue_number, issue_url, repo})`. Agent proposes; **operator dispatches** (commit is operator-gated). Dispatch to a **private coordination repo** — do not default to the public template repo."

## Related Code Files
- Create: `tools/learning-loop-mastra/core/loop-introspect.js` — new `buildStaleDispatchHints(root)` builder (top-5 + ranking by severity/age/category; filter excludes `stale-ref`-category [post-Phase 1 impossible but kept for safety], `ledger_ref`-set, terminal, `severity:"escalate"`; "fixability" = non-empty `evidence_code_ref`).
- Modify: `tools/learning-loop-mastra/hooks/legacy/session-start-inject-discoverability.cjs` — call `buildStaleDispatchHints` at L26-27; include in the L36 `session-context.json` write.
- Read-only (close flow): `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-file-index-tool.js`, `meta-state-log-change-tool.js`, `meta-state-resolve-tool.js`; `core/gate-logic.js#checkResolutionEvidence` `:651-716`.
- Read-only (sweep): `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js:44-61` (no auto-resolve branch — confirmed).
- Create: tests — four TTL cases + close-flow test + Rec 10 surfacing test + fixability predicate test.

## Implementation Steps (TDD — tests first)
1. **Test first (red):** close-flow test — a dispatched finding whose `evidence_code_ref` was edited is `resolve`d after `refresh_file_index` + `log_change`; without `refresh_file_index`, `resolve` is blocked by `fingerprint_mismatch`. Run; fails (no test).
2. **Verify the close flow** (no code change needed — the toolchain already exists): confirm `refresh_file_index({path})` → `log_change({change_dimension, change_target, change_diff, reason ≥20 chars})` → `resolve({id, resolution:"fixed in PR #X (change-log <id>)"})`. The test from step 1 is the gate.
3. **Test first (red):** four TTL cases —
   (a) dispatched `reported` finding → TTL fires → `stale` → `ledger_ref` + ledger event survive (not cleared by `checkExpiry`).
   (b) dispatched finding ages to `stale` → `re_verify` recovers → `ledger_ref` persists stale→active.
   (c) **regression-pin (renamed from "forward-looking contract", P3 F12):** a finding with `ledger_ref` set AND a modified `evidence_code_ref` file is NOT transitioned to `auto-resolved` by `meta_state_sweep({apply:true})`. Today this is vacuously true (no auto-resolve branch in `meta-state-sweep-tool.js:73-76`'s `if (!isStaleTransition)` block is dead code), but the test sets up the modified-file condition so a future re-addition of the path WITHOUT the `ledger_ref`-skip would fail. **Renamed** "regression-pin" to match its actual scope: pins future behavior; does NOT verify current behavior (which is vacuously true). Optional hardening (F12 mitigation B): stub the sweep tool with a synthetic `auto-resolved` write during the test to assert the gate catches it; skipped in v1 because the dead-code path makes a stub-by-mock-test the more invasive change.
   (d) `ledger_ref` not duplicated/orphaned by a sweep between dispatch and resolve (trivially true in v1 — sweep skips `stale` entries — but pins the invariant).
   Run; fails.
4. **Make TTL tests green** by ensuring `checkExpiry`/`checkStaleness` and `re_verify` carry `ledger_ref` through transitions (it is a patchable field preserved by `updateEntry`; verify no transition strips it). Test (c) carries a comment: this is a forward-looking contract; if the file-modification auto-resolve path is re-added in the lifecycle-redesign plan, it MUST skip `ledger_ref`-set entries or this test fails.
5. **Test first (red):** Rec 10 fixability predicate test — `buildStaleDispatchHints` returns only stale findings with a non-empty `evidence_code_ref`, `severity !== "escalate"`, no `ledger_ref`, non-terminal; capped at 5; ranked by age (older first). Run; fails.
6. **Implement `buildStaleDispatchHints`** in `core/loop-introspect.js`: read the registry, filter `status:"stale"` AND non-empty `evidence_code_ref` AND `severity !== "escalate"` AND no `ledger_ref` AND non-terminal AND non-`stale-ref`-category (safety filter), sort by age descending, cap at 5. Return a read-only hint structure including the dispatch protocol prompt.
7. **Wire the hook:** in `session-start-inject-discoverability.cjs`, call `buildStaleDispatchHints(root)` alongside the existing builders and include its output in `session-context.json`. Verify the hook writes ONLY `.claude/session-context.json` (no `meta-state.jsonl` write). Add a comment in `buildStaleDispatchHints`: "read-only — do not call `buildColdTierCache`/`writeColdTierCache` (those write)" (red-team concern #8 caveat).
8. **Verify:** `pnpm test` green; manual SessionStart check shows the top-5 stale dispatch candidates with the dispatch protocol prompt.

## Success Criteria
- [ ] Close-flow test green: `refresh_file_index` → `log_change` → `resolve` closes a dispatched finding; without `refresh_file_index`, `resolve` is blocked by `fingerprint_mismatch`.
- [ ] Four TTL tests green: `ledger_ref` + ledger event survive reported→stale; `re_verify` carries `ledger_ref` stale→active; **a `ledger_ref`-set finding with a modified `evidence_code_ref` is NOT auto-resolved** (regression-pin, P3 F12); sweep between dispatch and resolve neither orphans nor duplicates `ledger_ref`.
- [ ] Rec 10: `buildStaleDispatchHints` returns the top-5 fixable stale findings (non-empty `evidence_code_ref`, `severity !== "escalate"`, no `ledger_ref`, non-terminal, non-`stale-ref`-category), ranked by age.
- [ ] Rec 10 hook writes only `.claude/session-context.json` (read-only — no `meta-state.jsonl` write).
- [ ] Rec 10 prompt includes the dispatch protocol (prepare → `gh issue create --repo <private-coord-repo>` [check exit code] → commit) and the authority boundary ("agent proposes; operator dispatches; private coordination repo").
- [ ] A non-operator agent can surface + propose but cannot commit-dispatch (tool-gated, Phase 2).
- [ ] `pnpm test` green; `pre-commit` hook passes.

## Risk Assessment
- **Medium — reported→stale TTL is live in v1** (deferred surgeries don't ship this plan); dispatch/TTL interaction untested. Mitigation: the four TTL tests pin the behavior; `ledger_ref` is a patchable field preserved by `updateEntry` (verified).
- **Medium — Rec 10 surface vs dispatch authority.** Mitigation: surfacing is ungated (read-only); commit-dispatch is tool-gated (operator, Phase 2). The prompt states the boundary explicitly.
- **Low — sweep auto-resolve path absent in v1** (scout correction). TTL test (c) is a **regression-pin** (renamed from "forward-looking contract", P3 F12): sets up the modified-file condition so a future re-addition without the `ledger_ref`-skip fails. Today it is vacuously true (no auto-resolve branch); in v1 it pins future behavior, does not verify current behavior.
- **Low — close flow blocks on `fingerprint_mismatch` without refresh.** Mitigation: the close flow orders `refresh_file_index` before `resolve` (test gates this).
- **Low — fixability undefined.** Mitigation: defined concretely (non-empty `evidence_code_ref` + `severity !== "escalate"` + no `ledger_ref`); top-N = 5 (validation P3-W3/W4).
