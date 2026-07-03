# Brainstorm: Stale-Findings Triage + GitHub-Issue Dispatch (Dispatch-Handle Model)

**Date:** 2026-07-04
**Extends:** `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md` — Addendum (stale-findings growth + triage workflow) and Addendum 2 (change-log trigger ambiguity).
**Status:** Design agreed; ready for `/ck:plan`.

---

## Problem statement

Stale findings accumulate faster than one operator session can triage and fix — 28 stale today (16 `stale-ref` recursion + 12 real underlying: 7 loop-anti-pattern, 3 mcp-tool-missing, 1 schema-drift, 1 budget-check). The cap test (`cold-tier-regression.test.js:76-77`) counts only `stale + (mechanism_check === true || null)` = **11 today**, threshold relaxed 3→25 — so the gate is **passing at 11/25**, NOT breached (the original threshold of 3 is what 11 breaches; 25 is headroom). The fixable subset needs to become **parallelizable work units** that (a) survive beyond the 7-day staleness window, (b) are visible outside a loop-aware session, and (c) can be picked up by multiple agents in isolated worktrees without conflicting — where the **parallelism unit is the code fix, not the registry write** (registry is single-writer; see "Parallelism model + merge reconciliation" below).

Two halves of one move:
1. **Clean the queue** — collapse the `stale-ref` recursion (16 of 28 stale are self-referential) so the triage queue is real underlying issues, not drift-about-drift.
2. **Parallelize the clean remainder** — dispatch fixable findings to GitHub Issues as coordination handles, so operator + agents can fix in parallel.

**Concept restatement (L1, load-bearing):** *a finding is a deferred decision, not a thing to be removed.* Every finding has explicit exits; no mechanism silently closes one. This anchors the design and motivates the deferred lifecycle surgeries (drop `auto-resolved`, drop `ack`/`active`, re-architect `OPERATOR_MODE`) — see "Deferred."

## Requirements (concrete)

- **R1 (Rec 8 collapse):** `stale-ref` is no longer a recorded finding kind. It becomes a derived view (query output of `meta_state_relationships` / `meta_state_query_drift`). The 16 existing `stale-ref` entries migrate out of the registry with audit lineage. Cap test re-tightens to the real underlying-issue count.
- **R2 (dispatch tool):** an MCP tool creates a GitHub issue from a finding. Issue body cites `local:meta-state:<id>`. The finding gets a back-pointer (`ledger_ref` → a `runtime-state.jsonl` ledger event holding `{issue_number, issue_url, repo, dispatched_by, dispatched_at, finding_id}`). One-way derivation: finding → issue → resolve-on-close. Never issue → finding for state.
  > **Revised 2026-07-04 — see Addendum 3:** the MCP tool does **not** call GitHub; the agent (runtime) runs `gh` CLI. The dispatch tool is a `prepare`/`commit` protocol, not a single spawning tool.
- **R3 (authority):** operator dispatches; agent proposes candidates (session-start stale surfacing surfaces "this looks like a minor bug, dispatch?"). Matches the promotion boundary (escape-hatch #5/#6).
- **R4 (close):** manual `meta_state_resolve` with PR/issue URL in the resolution note + a `meta_state_log_change` change-log (landing a fix for a dispatched finding is a change-log trigger — it changed a bound artifact, **including implementation-surface source code in `tools/**` / `core/**`**, not only docs/contracts). Operator/agent symmetric on the change-log (no operator exemption; escape-hatch #13). The scoped trigger explicitly includes source fixes so it doesn't conflict with the deferred general rule (Rec 12) when that lands.
- **R5 (concept):** L1 doc (`docs/loop-engine.md`) states "findings = deferred decisions" with the explicit-exits set.

## Scope boundary

**In:** Rec 8 collapse + dispatch feature (export + link-back) + L1 concept statement + the *scoped* change-log trigger rule (dispatch-close case only) + **Rec 10 (session-start stale surfacing)** as a Phase 3 build item. Rec 10 is the delivery mechanism for R3's agent-proposes half — deferring it leaves a committed requirement with no mechanism, recreating the half-in ambiguity this plan closes. It depends on Phase 1's derived view (surfaces the clean queue, not the stale-ref recursion), extends an existing SessionStart hook (`hooks/legacy/recurrence-check-on-start.js` + `session-start-inject-discoverability.cjs`), and is read-only at the surface — no `meta-state.jsonl` write, no conflict with the single-writer registry model.
**Out (deferred to a dedicated lifecycle-redesign plan):** drop `auto-resolved`, drop `ack`/`active` (collapse to one `open` state), re-architect `OPERATOR_MODE` → delegated scoped authority, the *general* change-log trigger rule (addendum 2 Rec 12).
**Out (separate plans entirely):** promotion query (Q1–Q3), legacy rename (Q4), L1 bridge correction (Q5 — already DONE).

## Evaluated approaches

| Approach | What it is | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A — Mirror/sync** | Every finding → issue; status syncs both ways | Full external visibility | Two sources of truth → drift; re-creates the stale-ref recursion the addendum's Technique 1 warns against | Rejected |
| **B — Dispatch handle** | Issue created only for operator-triaged fixable findings; finding keeps `ledger_ref` back-pointer; one-way | Registry stays single bound record; reuses `ledger_ref` + `runtime-state.jsonl`; no drift; fits existing citation pattern | Operator must triage before dispatch (not automatic) | **Chosen** |
| **C — Read-only publish** | Publish stale queue to GitHub for visibility only | Lightest; no write-back | Doesn't enable parallel agent fixes — fails half the request | Rejected for v1 (could be a future mode) |

## Final design (B)

### Concept surface (L1)

Add to `docs/loop-engine.md` under the finding role:

> A finding is a **deferred decision**, not a thing to be removed. Every finding has explicit exits — **promote** (recurs → rule), **resolve** (fixed / no longer relevant), **re-verify** (resume the deferral), **supersede** (consolidated into a change-log, lineage preserved), **dispatch** (route to parallel-fix work via an external coordination substrate). No mechanism silently closes a finding; the close is always an explicit human/agent exit with a recorded reason.

`dispatch` is a **non-terminal routing action**, not a 4th terminal status. The finding stays in its current state while work happens; it resolves when the fix ships. `supersede` is a terminal exit (used by the Phase 1 stale-ref migration).

### Implementation surface (L2/L3)

**Phase 1 — Rec 8 collapse (clean the queue):**
- **Stop the producer, not just the sink.** `meta-state-sweep-tool.js` (the apply loop, ~L96) is the **single** stale-ref emission path — `metaStateReportTool.handler({category: "stale-ref", mechanism_check: false, reopens: [t.id]})`. `checkStaleness` only transitions entries to stale; no core helper emits stale-ref. The emission **intentionally sets `mechanism_check: false`** so follow-ups don't count in the cap (code comment). Removing the category from the enum without changing this emission makes sweep's write fail schema validation at runtime. Modify sweep to stop creating stale-ref follow-ups; the derived view (next bullet) replaces its output. Add a regression test that sweep no longer emits stale-ref.
- **Remove `stale-ref` from both enum sites** in `core/meta-state.js`: the exported `META_STATE_FINDING_CATEGORIES` at `:62` (consumed by `core/loop-introspect.js`) AND the inline `category: z.enum([...])` at `:76`. Removing only one creates introspection drift.
- Extend `meta_state_relationships` (or `meta_state_query_drift`) to surface "findings whose `ref_by`/`reopens` target is stale, missing, **or superseded**" as a query output — the derived view. The "superseded" arm is required so migrating the 16 to `superseded` doesn't re-trigger the view via inbound refs (the recursion returning in a new shape). No new MCP tool (Q7).
- **Migrate the 16 via `meta_state_batch`** (atomic, up to 500 ops): one `meta_state_log_change` ("stale-ref category migrated to derived view; recursion collapsed", `consolidates: "id1,...,id16"`) + 16 `supersede` ops pointing each finding's `consolidated_into` at that change-log id. Q8 — `superseded` preserves lineage so the recursion doesn't quietly recur.
- Re-tighten the cap test (`__tests__/legacy-mcp/cold-tier-regression.test.js:66-78`): the migration drops the cap-test count by **1** (11→10), not 16 — verified against the registry: 15 of the 16 stale-refs are `mechanism_check: false` (sweep follow-ups, intentionally excluded from the cap per the `meta-state-sweep-tool.js` comment: *"uses mechanism_check=false so that ... it does not contribute to the stale-mc threshold"*); only 1 stale-ref is `mc=true` (operator-filed with `evidence_code_ref`). Re-tighten target = **~10** (the real underlying `mc=true|null` count: 7 anti-pattern + 3 mcp-tool-missing + 0 of the schema-drift/budget-check depending on their mc). The original threshold of 3 stays breached (10 > 3) until those 10 real issues are resolved — re-tightening to 3 is a follow-up, not this plan. The migration's value is **hygiene + recursion collapse + concept cleanliness**, not "unblock a breached gate" (the gate is passing at 11/25).
- Scout tests for `stale-ref` *existence* pins (vs orphan-lint surfacing): `meta-state-sweep-stale-transition.test.js:168` asserts a sweep-produced stale-ref follow-up — that test changes with the producer fix above; `meta-state-integration.test.js:88`, `meta-state-session-id-roundtrip.test.js:160`, `fixtures/meta-state-fixtures.js:22` use stale-ref as input/filter and need updating (Q6).

**Phase 2 — dispatch tool:**
> **Revised 2026-07-04 — see Addendum 3:** the tool does **not** spawn `gh`. It is a `prepare`/`commit` protocol — `prepare` returns the issue body (read-only), the **agent** runs `gh issue create` as a Bash command (bash-gated, passes), then `commit` writes the ledger event + patches `ledger_ref`. No `LOOP_DISPATCH_REPO` env var; the coord repo is chosen procedurally at dispatch time. Idempotency is a ledger scan (handles orphan-retry + concurrent race), not a `ledger_ref`-only check.
- New MCP tool `meta_state_dispatch_finding` (params: `id`, optional `labels`, `assignee`, `body_extra`, `repo`).
- **Idempotency:** refuse re-dispatch if the finding's `ledger_ref` is already set — return the existing issue coords from the linked ledger event. Prevents two worktree agents creating duplicate issues for the same finding. First-write-wins is reinforced by the CAS on `meta_state_patch`.
- Flow: read finding → (idempotency check) → build issue body (id, category, severity, affected_system, evidence_code_ref, description, `local:meta-state:<id>` citation) → `gh issue create --json --repo <coord-repo>` (gated by `gate_check`; operator-gated; preflighted) → parse issue number/URL → write `runtime_state_record` (kind `ledger-event`, affected_system `meta-state-tools`, **id `dispatch-<finding_id>`** for a stable join) holding `{issue_number, issue_url, repo, dispatched_by, dispatched_at, finding_id, delegated_to}` → patch finding with `ledger_ref` → the ledger event id. No new finding-schema field (DRY: `ledger_ref` + ledger event hold the issue coords).
- **Target repo:** `gh issue create` defaults to the current repo (the public template) — which would defeat the disclosure mitigation. The tool passes `--repo` from the `repo` param or `LOOP_DISPATCH_REPO` env var; v1 default is a **private coordination repo**. Phase 2 scout: confirm `gh issue create` is bash-gate-allowed (or add an allowlist rule) before building, and confirm `gh` is authenticated in fresh agent worktrees (affects the "agents fix in parallel" claim).
- **Failure path:** if `meta_state_patch` fails after the ledger event is written, the ledger event is orphaned (issue exists, no back-pointer). Order: create issue → write ledger → patch finding. On patch failure, log the orphan for a cleanup query rather than leaving it silent.
- Operator-gated today; `delegated_to` recorded in the ledger event so the future delegated-authority model can read it (designed-for, not blocked).
- No `evidence_code_ref` redaction. `evidence_code_ref` is a repo-relative path (`core/meta-state.js:86`, and the canonical-key comment at `:406` confirms registry values are relative), so it is exactly as public as the repo tree it lives in — redacting it in an issue body protects zero information in either visibility state. The genuine disclosure payload is the **finding description + category + severity** (a defect/vulnerability-shaped statement); if dispatch-to-public is a concern, the gate belongs on *where the issue lands* (private coordination repo via `--repo`) or *what the description says* (operator edits to a non-exploitable summary), not on the path string. v1 default: dispatch to a private coordination repo, sidestepping the disclosure question entirely.

**Phase 3 — close flow + agent-proposes surfacing:**
- Manual close: land fix → **`meta_state_refresh_file_index({path: <evidence_code_ref>})`** (the fix changed the watched file; without a fingerprint refresh, `rule-no-orphaned-evidence` blocks `meta_state_resolve` on hash mismatch) → `meta_state_log_change` (change-log; the fix changed a bound artifact) → `meta_state_resolve` with resolution note = "fixed in PR #X (change-log \<id\>)" → optionally close the GitHub issue. Operator/agent symmetric (Q11 scoped).
- **Sweep interaction:** `meta_state_sweep` auto-resolves `mechanism_check:true` entries whose watched file was modified after creation — a dispatched finding whose fix edits `evidence_code_ref` would be auto-resolved **mid-fix**. Sweep must skip entries with `ledger_ref` set (dispatched findings opt out of file-modification auto-resolve; the explicit close flow above owns them).
- Agent half (Rec 10 — in scope): extend the SessionStart hook (`hooks/legacy/recurrence-check-on-start.js` / `session-start-inject-discoverability.cjs`) to surface dispatch candidates — "this stale finding looks like a minor bug, dispatch?" **Spec:** top-N cap + ranking (severity, age, fixability); filter excludes `stale-ref` (via the Phase 1 derived view), already-dispatched (`ledger_ref` set), and terminal; prompt states "agent proposes; operator dispatches" so the authority boundary is visible in the surface. **Authority (resolves Q9):** surfacing is **ungated** (read-only — any agent/session can see the stale queue); dispatch is **tool-gated** (operator, per Phase 2). A non-operator agent can surface + propose but cannot dispatch — the tool is the authority gate, not the surfacing. No `meta-state.jsonl` write at the surface, so no conflict with the single-writer registry model.
- TTL-while-dispatched: let the finding age to `stale` if work is slow; `meta_state_re_verify` recovers it. No new pause mechanism in v1 (compatible with dropping `ack`/`active` later).

**Phase 4 — docs:**
- L1 concept statement above.
- `docs/meta-state-lifecycle.md`: drop `stale-ref` from the recorded category list; note it as a derived view.
- `docs/loop-engine.md`: add `dispatch` to the explicit-exits set; note it is a routing action, not a terminal status.

### Parallelism model + merge reconciliation (load-bearing for the "parallel worktrees" goal)

The proposal's motivation (c) — "picked up by multiple agents in isolated worktrees without conflicting" — is sound **only if the parallelism unit is the code fix, not the registry write.** Grounded in the write model:

- `meta-state.jsonl` and `file-index.jsonl` are **full-rewrite snapshot files** (`core/meta-state.js:607/635/652/757`, `:509-513`), serialized within one process by the per-root `enqueue` queue (`:345-348`). There is **no cross-worktree coordination** — each worktree runs its own MCP server against its own file copy. CAS `_expected_version` does **not** cross worktree boundaries.
- `runtime-state.jsonl` is the one **append-only** file (union-merges cleanly, disjoint ids via `dispatch-<finding_id>`).
- Two state kinds merge differently: **authority state** (findings/change-logs/ledger) merges by entry id *iff no two worktrees edit the same entry*; **derived state** (`file-index.jsonl` fingerprints, grounding hashes) **does not merge** — after merge the only correct fingerprint is the one computed from the merged tree. A worktree's fingerprint row is invalid post-merge if another worktree touched the same file.

**Git-hook constraint (scouted):** `package.json:41` sets `simple-git-hooks` `pre-commit: "pnpm test && pnpm fallow:gate"`. The test suite includes the grounding + cap invariants that read `meta-state.jsonl` + `file-index.jsonl`. So a feature worktree that edits code **must** refresh `file-index.jsonl` (and possibly patch `meta-state.jsonl` if drift findings appear) before `pnpm test` passes — the hook forces those writes at commit time. This means a "code-only" worktree still writes the index/registry at commit. Implications:

- The worktree's hook-forced index refresh is a **local-validation artifact**, not mergeable state. It is valid only for that worktree's tree.
- Worktree-originated `meta-state.jsonl` writes at commit (drift findings, fingerprint patches) are authority-state writes that can conflict if two worktrees drift the same file. They must be **reconciled in the main worktree post-merge**, not trusted as-is.

**Rules:**

1. **Worktrees edit code; the registry is single-writer.** Feature worktrees touch `tools/**` / `core/**` / `product/**` source only. The hook-forced index/registry refresh in the worktree is local-validation-only.
2. **Registry authority writes (`dispatch`, `resolve`, `meta_state_log_change`) happen in the main worktree**, single-writer, against the merged tree. No parallel `meta-state.jsonl` authority writes.
3. **`file-index.jsonl` is rebuilt post-merge, never merged.** After fix PRs merge, run `seed-file-index.mjs` (or `meta_state_refresh_file_index` per touched path) to recompute fingerprints from the merged tree. Treat the index as a cache invalidated by merge.
4. **Phase 1 migration stays single-worktree serial.** The `consolidates` field is a cross-entry dependency (one change-log references all 16 ids). Run the `meta_state_batch` migration in the main worktree before dispatch begins — never parallelize it.
5. **Disjoint finding ownership is the real cross-worktree guard**, not CAS. No two worktrees own the same finding's lifecycle. The dispatch tool's idempotency + `ledger_ref` enforce first-write-wins; assignment enforces disjointness.

**Post-merge reconciliation step (mandatory):** as fix PRs merge into the main worktree → (a) `seed-file-index.mjs` / per-path `meta_state_refresh_file_index` to re-derive the index from the merged tree; (b) re-run grounding (`meta_state_check_grounding` / `meta_state_derive_status`) and address any drift findings the merges introduced; (c) `meta_state_log_change` + `meta_state_resolve` per finding. This is where the "correct state" is determined: authority state = the union of disjoint per-finding decisions (single-writer, no conflicts); derived state = re-derived from the merged tree (never merged).

**Reported→stale TTL (live in v1, needs test cases):** the `ack`/`active`/`auto-resolved` surgeries are deferred to the lifecycle-redesign plan, so the reported→stale TTL (`core/meta-state.js:57` `STALENESS_WINDOW_MS`, 7d; reported 24h TTL) is **live during this plan**. The dispatch flow must not break it. Required test cases:
- A dispatched finding in `reported` status → TTL fires → transitions to `stale` → the `ledger_ref` back-pointer and the `runtime-state.jsonl` ledger event **survive the transition** (not cleared by sweep/TTL).
- A dispatched finding that ages to `stale` during fix work → `meta_state_re_verify` recovers it → `ledger_ref` persists across stale→active.
- `meta_state_sweep({apply:true})` does **not** auto-resolve a dispatched finding mid-TTL (the `ledger_ref`-skip from Phase 3's sweep-interaction bullet holds through the TTL transition).
- A dispatched finding's `ledger_ref` is not duplicated or orphaned by a sweep that runs between dispatch and resolve.

## Deferred to the lifecycle-redesign plan (designed-for, not blocked)

- **Drop `auto-resolved`:** detection (cold-session test passes) becomes a re-verify / propose-resolve trigger; the close is always explicit. Dispatch already uses explicit `resolve` — compatible.
- **Drop `ack` / `active`:** collapse to one `open` state; deprecate `meta_state_ack`; rework TTL. Dispatch needs no `ack` — compatible.
- **Re-architect `OPERATOR_MODE` → delegated scoped authority:** per-dispatch grant (ledger event's `delegated_to` + `scope` + `rights`) replaces the global on/off mode. Dispatch records `delegated_to` now so the future model can read it.
- **General change-log trigger rule** (addendum 2 Rec 12 / Q11 general): this plan ships only the dispatch-close case.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Sweep emits stale-ref at `meta-state-sweep-tool.js:96`; removing the enum breaks sweep at runtime (schema validation failure)** | **Critical** | Modify sweep to stop emitting stale-ref follow-ups; the derived view replaces its output. Add a regression test. Largest missing Phase 1 step. |
| `stale-ref` enum lives at two sites (`core/meta-state.js:62` exported const + `:76` z.enum); proposal originally cited only one | High | Remove from both; grep `core/loop-introspect.js` for exported-const consumers. |
| `gh issue create` defaults to the public template repo, defeating the disclosure mitigation | High | Dispatch tool passes `--repo <coord-repo>` (param or `LOOP_DISPATCH_REPO` env); v1 default private. |
| **Parallel registry writes across worktrees → snapshot-rewrite merge conflicts + undebuggable "correct state"** (`meta-state.jsonl` + `file-index.jsonl` are full-rewrite snapshots; no cross-worktree lock) | High | Registry is single-writer: worktrees edit code only; `dispatch`/`resolve`/`log_change` happen in the main worktree post-merge. Disjoint finding ownership is the guard, not CAS (CAS doesn't cross worktrees). |
| **Hook-forced index/registry refresh in feature worktrees** (`pre-commit: pnpm test && pnpm fallow:gate`, `package.json:41` — tests require `file-index`/`meta-state` consistent with the worktree tree) | High | The worktree's hook-forced refresh is **local-validation-only**, not mergeable state. Mandatory post-merge re-derive (`seed-file-index.mjs` / per-path refresh) + grounding reconciliation in the main worktree. Worktree-originated drift findings are reconciled, not trusted. |
| **`file-index.jsonl` is derived state — fingerprints invalid post-merge** if another worktree touched the same file | High | Rebuild the index from the merged tree post-merge; never merge fingerprint rows. The index is a cache invalidated by merge. |
| Close flow blocks on hash mismatch (`rule-no-orphaned-evidence`) without fingerprint refresh | High | Add `meta_state_refresh_file_index` before `meta_state_resolve` in Phase 3. |
| **Reported→stale TTL is live in v1** (deferred surgeries don't ship this plan) — dispatch/TTL interaction untested | Medium | Add the four TTL test cases in the parallelism-model section: `ledger_ref` survives reported→stale; `re_verify` carries it stale→active; sweep doesn't auto-resolve mid-TTL; sweep between dispatch and resolve doesn't orphan/duplicate `ledger_ref`. |
| Sweep auto-resolves dispatched finding mid-fix (file-modification auto-resolve) | Medium | Sweep skips entries with `ledger_ref` set; the explicit close flow owns dispatched findings. |
| Duplicate dispatch (no idempotency) — two agents create duplicate issues | Medium | Refuse re-dispatch if `ledger_ref` already set; return existing issue coords. |
| Bash gate may not allow `gh issue create` | Medium | Phase 2 scout: confirm gate allowlist or add a rule before building. |
| Derived view re-triggers via superseded targets after migration | Medium | Predicate includes "stale, missing, or superseded." |
| `gh issue create` is side-effecting/external | Medium | Route through bash gate + operator preflight; `gh` already authenticated. Don't log the token. |
| Two sources of truth drift | Medium | One-way derivation only: finding → issue → resolve. Never issue → finding for state. Issue is a work ticket, not a record. |
| Orphan ledger event on patch failure | Medium | Order: issue → ledger → patch. On patch failure, log the orphan for a cleanup query. |
| Public repo leaks a defect/vulnerability signal via the **finding description + severity + category** (not the path) | Medium | `evidence_code_ref` is repo-relative and already as public as the tree — no path redaction. v1 dispatches to a **private coordination repo**, so the description never lands in a public issue. If dispatch-to-public is ever enabled, the operator edits the description to a non-exploitable summary before create (content gate, not a path-redaction step). |
| `ledger_ref` join stability | Low | Ledger-event id `dispatch-<finding_id>` (deterministic); one finding → one dispatch → one event. |
| Cap test re-tighten fails if post-collapse count still > target | Low | **Verified:** cap-test count today is 11 (not 28 — addendum conflated total-stale with cap-count); migration drops it by 1 (11→10) since 15/16 stale-refs are `mc=false` by design. Re-tighten target ~10; the original threshold of 3 stays breached until the 10 real underlying issues resolve (follow-up, not this plan). |
| `stale-ref` removal breaks a pinning test | Low | Phase 1 scout: `meta-state-sweep-stale-transition.test.js:168` pins a sweep-produced stale-ref (changes with the producer fix); `meta-state-integration.test.js:88`, `meta-state-session-id-roundtrip.test.js:160`, `fixtures/meta-state-fixtures.js:22` use stale-ref as input/filter. |
| L1 "explicit exits" set omits `supersede` (used in Phase 1) | Low | Add `supersede` to the L1 statement (done in the concept surface above). |
| Scoped change-log trigger may conflict with deferred Rec 12 | Low | R4 clarifies "bound artifact" includes `tools/**` / `core/**` source; align before the general rule is written. |

## Success metrics / validation

- **Rec 8:** `stale-ref` absent from **both** enum sites (`:62` and `:76`); sweep no longer emits stale-ref follow-ups (regression test); `meta_state_list({status:"stale"})` count drops by 16 (total stale 28→12); **cap-test count drops by 1** (11→10, since 15/16 stale-refs are `mc=false` by design — only the 1 `mc=true` operator-filed stale-ref counted); the derived view surfaces the same information (including the "superseded target" arm); cap test passes at the re-tightened threshold (~10).
- **Dispatch:** a finding can be dispatched; `gh issue view <n> --json` confirms the issue exists in the **coord repo** (`--repo`) and its body contains `local:meta-state:<id>`; the finding's `ledger_ref` resolves to a ledger event with id `dispatch-<finding_id>` holding the issue coords; **re-dispatching the same finding is refused** and returns the existing issue coords.
- **Close:** a dispatched finding can be `resolve`d with a PR/issue ref + a change-log after a `meta_state_refresh_file_index` step; the change-log and the resolution note cross-reference; sweep does not auto-resolve a dispatched finding mid-fix.
- **Parallelism / merge reconciliation:** after two feature-worktree fix PRs merge, `seed-file-index.mjs` (or per-path refresh) produces a `file-index.jsonl` whose fingerprints match the **merged tree** (not either worktree's pre-merge rows); grounding reconciliation in the main worktree resolves any merge-introduced drift; no `meta-state.jsonl` authority write originated in a feature worktree (worktrees edited code only).
- **TTL interaction (v1 live):** the four test cases in the parallelism-model section pass — `ledger_ref` + ledger event survive reported→stale; `re_verify` carries `ledger_ref` stale→active; sweep skips dispatched findings through the TTL transition; sweep between dispatch and resolve neither orphans nor duplicates `ledger_ref`.
- **Concept:** `docs/loop-engine.md` carries the "deferred decision" statement and the explicit-exits set including `dispatch` and `supersede`.
- **Rec 10 (agent-proposes):** at SessionStart, the surface emits a bounded top-N of stale dispatch candidates (no `stale-ref`, no `ledger_ref`-set, no terminal) with an "agent proposes; operator dispatches" prompt; a non-operator agent that proposes dispatch cannot dispatch (tool-gated).

## Next steps + dependencies

1. `/ck:plan` (default mode) on this report — phases 1–4 above, plus the parallelism-model + merge-reconciliation rules and the TTL test cases.
2. Phase 1 (Rec 8) is a prerequisite for phase 2 (dispatch launches on a clean queue). Phase 1's first step is the sweep producer fix — without it, the enum removal breaks sweep at runtime. The Phase 1 migration batch runs single-worktree serial in the main worktree.
3. The parallelism model (worktrees edit code; registry single-writer; post-merge re-derive + reconcile) is part of this plan, not deferred — it is what makes the "parallel worktrees" goal safe.
4. Lifecycle-redesign plan (separate, later): the three deferred mechanism surgeries + the general change-log trigger rule. The reported→stale TTL stays live until then; the TTL test cases above guard the dispatch flow in the meantime.
5. Promotion-query / legacy-rename plans (separate, out of scope here).

## Unresolved questions

(None remaining — all three verification questions answered by scout this round; see "Resolved this round" below.)

**Resolved this round (scout 2026-07-04):**
- **Q1 (stale-ref mc breakdown):** 1 of 16 is `mc=true` (operator-filed with `evidence_code_ref`); 15 are `mc=false` (sweep follow-ups, intentionally excluded from the cap per the sweep-tool comment). Cap-test count today is **11**, not 28. Migration drops the cap-test count by **1** (11→10), not 16. Gate is passing at 11/25.
- **Q2 (other sweep stale-ref emission paths):** one path only — `meta-state-sweep-tool.js` apply-loop `metaStateReportTool.handler({category:"stale-ref", mechanism_check:false})`. `checkStaleness` only transitions; no core helper emits stale-ref.
- **Q3 (worktree `gh` auth):** `gh` authenticated as `dat9uy` (`repo`+`workflow` scopes); config at `~/.config/gh/` is user-level, shared across same-machine worktrees. Same-machine worktrees have `gh` auth; remote/container agents without `$HOME`'s gh config would not. "Agents fix in parallel" holds for same-machine worktrees.
- **Rec 10 scope:** IN — Phase 3 build item depending on Phase 1's derived view (see scope boundary + Phase 3 agent-half spec).
- **Q9 (agent surfacing authority):** surfacing is ungated (read-only); dispatch is tool-gated (operator). The tool is the authority gate, not the surface.
4. **Rec 10 scope decision** — pull session-start stale surfacing into this plan, or defer it? (Currently half-in; flagged in Phase 3 and the scope boundary.)

---

## Addendum 3: two-surfaces dispatch correction (2026-07-04)

**Trigger (operator, 2026-07-04, during `/ck:plan`):** the R2 / Phase 2 design as written above has the **MCP tool spawning `gh`** — i.e., the deterministic core performing an external side effect. This violates the two-surfaces split (`docs/loop-engine.md`): the deterministic core does no external side effects; the agentic runtime (the agent) does. Corrected here so the design-of-record matches the shipped plan.

**Correction:** the dispatch tool does **not** call GitHub. It is a `prepare`/`commit` protocol coordinating with the agent:

1. **Agent calls `meta_state_dispatch_finding({id, stage:"prepare"})`.** The tool validates the finding, scans `runtime-state.jsonl` for an existing `dispatch-<id>` row (idempotency), and if none, builds the issue title + body (with the `local:meta-state:<id>` citation). Read-only, ungated. Returns `{finding_id, issue_title, issue_body, coord_repo_hint}`.
2. **Agent runs `gh issue create --json number,url --repo <coord-repo> --title … --body …`** as a Bash command. The bash gate (`hooks/legacy/bash-gate.js:27`) intercepts the agent's Bash tool; `gh` is not in `core/patterns.json` constraints → `ok` (passes). The agent checks `gh`'s exit code + stdout before proceeding (agent-side failure handling — the tool does not spawn `gh`, so there is no tool-level `gh` error path).
3. **Agent calls `meta_state_dispatch_finding({id, stage:"commit", issue_number, issue_url, repo})`.** The tool re-checks idempotency (ledger scan), writes the `dispatch-<id>` ledger event (via a shared `appendLedgerEvent` helper extracted from `runtime-state-record-tool.js:59-76`), and patches the finding's `ledger_ref` (CAS via `updateEntry`). Operator-gated.

**What this changes vs. the body above:**
- **R2 / Phase 2 flow:** "`gh issue create --json --repo` (gated by `gate_check`)" → the tool does not call `gh`; the agent does, as a Bash command (bash-gated, passes). No `gate_check` invocation by the tool.
- **Idempotency (Phase 2):** the body's "`ledger_ref` is already set" check is insufficient — it misses the orphan path (ledger written, `ledger_ref` patch failed) and the concurrent race (two agents, neither has `ledger_ref` yet). The correction scans `runtime-state.jsonl` for a `dispatch-<id>` row in **both** modes; this handles orphan-retry (prepare returns existing coords; agent does not re-run `gh`) and concurrent race (commit refuses duplicate coords). `runtime-state.jsonl` is append-only with no uniqueness check, so the ledger scan is the dedupe, not the `dispatch-<id>` id.
- **Target repo (Phase 2):** "`--repo` from the `repo` param or `LOOP_DISPATCH_REPO` env var; v1 default private" → no `LOOP_DISPATCH_REPO` env var. The coord repo is chosen procedurally at dispatch time (the operator names it; the agent proposes, the operator dispatches). The disclosure mitigation is procedural (private coord repo + operator-edited description), not tool-level.
- **Failure path (Phase 2):** "log the orphan for a cleanup query" → the orphan self-heals (the next prepare/commit finds the `dispatch-<id>` row and patches `ledger_ref` on retry); no separate cleanup query.
- **`verification-runner.js`:** irrelevant — the tool does not use it (the agent runs `gh` directly via Bash). The body's "Phase 2 scout: confirm `gh issue create` is bash-gate-allowed" still holds, now for the agent's Bash call.

**What stays valid:** R1, R3–R5, the Phase 2 scout items (`gh` bash-gate, `gh` worktree auth at `~/.config/gh/` — both confirmed), the "side-effecting/external" risk row (now applies to the agent's `gh` call), the parallelism model, the TTL test cases, Phase 1, Phase 3, Phase 4. The shared `appendLedgerEvent` helper extraction and the top-5/fixability Rec 10 spec are plan-level details (in `plans/260704-0301-stale-findings-dispatch-handle/phase-02-…` and `phase-03-…`), not brainstorm-level.

**Implementation:** `plans/260704-0301-stale-findings-dispatch-handle/phase-02-dispatch-tool-meta-state-dispatch-finding.md` carries the corrected design.