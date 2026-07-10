# Predict Report: Stateless MCP as Correct Path Forward (with Parallel-Operation Constraint)

**Mode:** `/ck:predict` — 5-persona debate
**Source question:** Continue the discussion in `plans/reports/from-root-cause-to-transport-decision-260711-0011-mcp-stateless-adapter-vs-cli-report.md`. Two operator-flagged gaps the report didn't address:
1. **Parallel operation is required, not optional.** Multiple PRs → multiple versions of L2 → these must not conflict. Stateless is not just for lifecycle; it's a precondition for safe parallel L2 deployment.
2. **Audit the pre-existing transport problem findings** in `meta-state.jsonl` against the current model.

**Method:** 5 personas (Architect, Security, Performance, UX, Devil's Advocate) read the prior report + Phase 1 root-cause report + `meta-state.jsonl` transport findings + `docs/architecture.md` Known Issues (F1–F13) + `docs/runtime-contract.md` § Transport mapping. Debated conflicts; produced verdict.

**Verdict:** **CAUTION** — direction is correct (stateless adapter over file-based L1, not a CLI swap), but the operator's Point 1 surfaces a gap the prior report does not address: stateless alone is **necessary but not sufficient** for parallel operation. The plan must also cover (a) cross-process cache invalidation, (b) schema-version-skew detection across L2 versions, (c) per-worktree session identity (closes the open `Multi-Session Isolation` gap from `docs/architecture.md` §378–383).

---

## Agreements (all 5 personas align)

| # | Point | Rationale |
|---|---|---|
| A1 | **L2 is the correct abstraction level.** | `docs/runtime-contract.md` (L2) names 4 transport-agnostic capabilities; 3 transports; MCP+hooks is the wired one. The bug is not the abstraction but its **violation** — L2 grew in-process state that contradicts L1's file-based consistency model. |
| A2 | **CLI swap is wrong today.** | 3 runtimes are wired on MCP+hooks (Claude Code, Droid CLI, Mastra Code); library-import is forward-looking but Claude Code cannot embed Node; shell-hook-only is "minimal participation path," read-mostly. Re-hosting R2 + workflow registry for a CLI is a high-cost re-wire. |
| A3 | **H7 (cross-process file race) is the canonical symptom class.** | 2 live MCP servers (PID 1107356 + 3831390) → same `meta-state.jsonl` → no cross-process lock → per-process `enqueue` Map serializes within process but not across. Phase 1 §C8. |
| A4 | **Cross-process file lock on `writeEntry` is the load-bearing fix.** | Lives in `core/` (L1) so it's correct under any transport. Small, surgical, kills H7 directly. |
| A5 | **In-process state has become a correctness surface.** | F1–F13 known-issues list (`docs/architecture.md` §315–376) is dominated by marker/gate staleness bugs. Phase 1 §C16 latent bug in `meta-state-resolve-tool.js:161` is the same shape as silent-persistence-fail — handler trusts `await updateEntry` and returns `{resolved: true}` unconditionally. |
| A6 | **5 confirmed transport findings in `meta-state.jsonl` all share one root cause.** | Listed in §3 below. All reduce to "in-process state as correctness surface." |
| A7 | **Lifecycle pain is real but manageable under stateless.** | Stale 22h server (Phase 1 C8) → harmless when server is stateless (no authoritative state to lose). `process-env-isolation` change-log (`meta-260609T2116Z`) is the same class — dissolves when server has no long-lived state. |
| A8 | **Sidecar cache + LRU + batch is the right trajectory.** | `docs/trajectory.md` §6.1–6.2 names these as the on-disk primitives. `meta_state_batch` shipped (`meta-260609T0927Z`). Sidecar cache `records/meta/.cache/loop-describe-cold.json` is correct across processes by construction. |

---

## Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|---|---|---|---|---|---|---|
| **Operator P1: parallel operation** | **Critical gap in report.** Stateless alone ≠ safe parallel. Multi-PR → multi-worktree → multi-L2-version → schema-version-skew + cross-worktree cache invalidation. | Multi-Session Isolation gap (`docs/architecture.md` §378–383) is a security boundary violation, not just a UX bug. Session A's marker leaks to Session B. | Multiple processes don't share cache → all caches cold → slow. Stateless doesn't fix; just makes it consistent. | Developer running 3 PRs in parallel wants 3 MCP servers that don't fight. Today MOSTLY works; class of bugs is the F1–F13 family. | Simplest fix: per-worktree `meta-state.jsonl` (separate registries merged on PR landing). Avoids the whole class. | **Stateless + per-worktree identity + cross-worktree cache invalidation. Per-worktree registries is overkill — file lock + worktree-aware session ID solves the same problem without fork.** |
| **Sidecar cache correctness** | Cache is correct across processes *by construction* only if every writer invalidates. The plan must define invalidation protocol. | Stale sidecar is a data-leak surface (one worktree's filter results seen by another). | Sidecar cache is a perf optimization; can be regenerated on miss. Worst case: 1 slow call per process start. | Transparent to agent. | The sidecar cache is the *next* correctness surface once the in-process cache is removed. Don't trade one bug for another. | **Define cache-invalidation protocol as part of the stateless plan. Each `writeEntry` invalidates both the LRU cache AND the sidecar cache, gated by file lock.** |
| **Schema-version-skew** | Worktree A writes v2.1 schema; Worktree B (v2.0) reads via stale LRU; `coerceParamsToSchema` silently drops new fields. Hidden bug. | Silent downgrade attack surface — Worktree B can't see Worktree A's newer fields. | Misses in new fields cost a re-read + retry. Small. | Today: agent writes entry; entry exists but with fewer fields than expected. Confusing. | The schema-as-source-of-truth (Bridge 5) design (`loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from`) was proposed to fix this. Ship it as part of the stateless plan. | **Adopt the schema-version-skew detection: `meta_state_log_change` rejects writes if the schema branch is unknown. Bridge 5 ships in the same plan.** |
| **F4 Data Leak Risk** (marker stores 200 chars plaintext) | Not a stateless-adapter concern; orthogonal. | Direct evidence the in-process state model leaks operator prompts to disk. | N/A. | Operator may not know their prompt is being persisted. | Don't conflate F4 with the transport decision. F4 has its own mitigation (hash, not plaintext). | **F4 ships independently. The stateless plan should not block on F4.** |
| **CLI vs MCP ergonomics** | CLI requires bash-gate allowlist rewrite; ~3 runtimes already wired on MCP. | MCP has typed schemas; CLI has stdout parsing — type confusion surface. | MCP zod coercion is faster than JSON parse + manual validation. | Bash-gate friction is real but small. | Agent tolerates `Bash`-as-tool-channel today (the report itself notes this). | **Keep MCP. Stateless adapter preserves MCP ergonomics (native tool calls, zod coercion) while removing in-process state. Synthesis, not compromise.** |

---

## Pre-existing transport findings (operator Point 2)

5 confirmed transport/MCP findings in `meta-state.jsonl` share the root cause the prior report names. Listed in audit order:

| # | Finding ID | Severity | Subtype | Description | Same root cause? |
|---|---|---|---|---|---|
| T1 | `meta-260606T2106Z` | escalate | loop-anti-pattern | Agent called `meta_state_log_change` 5+ times in succession (predecessor of T4) | ✅ in-process idempotency cache returned success on retry |
| T2 | `meta-260606T0155Z` | warning | mcp-connection | `loop-surface-inject.cjs` `spawnAndCall` chicken-egg deadlock (sends `initialize` inside `stdout.on('data')` handler — first data IS the response, deadlock) | ✅ fixed in `meta-260606T0200Z-loop-surface-inject-spawnandcall-chicken-egg-fix` (real-spawn test). Different sub-class: connection lifecycle. |
| T3 | `meta-260609T2116Z` | change-log | process-env-isolation | Background MCP server held `OPERATOR_MODE=1` across `pnpm test` boundaries | ✅ lifecycle / process-env state. Dissolves under stateless. |
| T4 | `meta-260619T2233Z` | escalate (OPEN) | mcp-tool-silent-persistence-fail | `meta_state_log_change` returns `logged: true, cache_hit: false` without persisting. Verified 2026-06-19 + re-verified 2026-07-10. | ✅ handler trusts `writeEntry` return; idempotency cache masks the failure on retry (60s TTL) |
| T5 | `meta-260626T1419Z` | escalate (OPEN) | mcp-tool-silent-persistence-fail | `meta_state_supersede` returns `superseded: true` without persisting. Same shape as T4. | ✅ `applyUpdateAndCheck` doesn't re-read registry to confirm post-write visibility. Same handler-trusts-write pattern. |
| T6 | `meta-260610T1859Z` | escalate | retry-loop | Agent stuck in `meta_state_refresh_fingerprint` loop for 53 minutes (153 identical calls collapsed to 1 by circuit-breaker). | ✅ Pre-existing in-process idempotency cache absent → unbounded retry. Partially fixed by `meta-260610T1604Z-meta-state-refresh-fingerprint-loop-circuit-breaker`. |
| T7 | `meta-260610T0115Z` | warning | wire-format-bug | `meta_state_patch` wraps top-level array values as `{item: [...]}`; `coerceParamsToSchema` doesn't recurse into passthrough ZodObjects | ✅ MCP shell layer's invariant-preservation is fragile. Symptom-level fixed in `meta-260610T1025Z-tools-learning-loop-mcp-tool-registry-js-coerceparamstoschem`; structural fix is Bridge 5 (schema as source of truth). |

Plus 12+ `mcp-client-loading-missing` findings (L2 probe failures for Droid CLI runtime — Droid's agent runtime does not surface `mcp__learning_loop_mcp__*` tools to the AI's callable list, even when the MCP server is reachable). All archived under `meta-260611T2140Z-tools-learning-loop-mcp-tests-cold-session-discoverability-t` consolidation. Different sub-class (runtime layer, not transport) — not the report's concern.

**All 5 root-cause findings (T1, T3, T4, T5, T6, T7) reduce to: in-process state (idempotency cache, env, retry state, wire-format coercion) as correctness surface.** The prior report's diagnosis is confirmed empirically by the registry. **The report's claim "F1–F13 known-issues list is mostly cache-staleness bugs" is correct in spirit** — 6 of 8 are RESOLVED marker/gate staleness bugs (F1, F2, F3, F8, F12, F13); 2 of 8 are unresolved (F4 Data Leak — orthogonal; F11 False Positive — pattern breadth — orthogonal). The Multi-Session Isolation gap (line 378–383, **unresolved**) is the operator's Point 1 surface.

---

## Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| **Schema-version-skew across worktrees** | High | Per-process schema-version declaration in registry; `meta_state_log_change` rejects unknown schema branches. Ships with the stateless plan. |
| **Cross-worktree cache invalidation** | High | Every `writeEntry` under file lock invalidates both LRU cache AND sidecar cache. Document the invalidation protocol in `docs/architecture.md`. |
| **Multi-Session Isolation gap** | Medium | Already documented (`docs/architecture.md` §378–383) as "Add session ID to marker filename." The stateless plan is the right plan to close it (per-worktree session ID is required for parallel operation anyway). |
| **Migration: 3 wired runtimes** | Medium | Stateless adapter preserves the MCP transport. No runtime re-wiring needed. |
| **In-process idempotency cache removal may regress repeat-call performance** | Low | Today the cache is per-process and creates cross-process inconsistency. Removal makes the system slower (~5–50ms per call) but consistent. Sidecar cache (file-based) absorbs cold-tier reads. |
| **Bridge 5 (schema as source of truth) deferred** | Medium | `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` is parked. The wire-format bug (T7) returns if Bridge 5 doesn't ship. **Recommendation: ship Bridge 5 in the same plan as the stateless adapter.** |
| **T4 + T5 silent-persistence-fail remain OPEN after plan ships** | Critical | Both findings are escalated severity. The stateless adapter fixes the root cause (in-process idempotency cache masks write failures), but the handler `await writeEntry` trust pattern persists. Add a `writeEntry` return-value assertion + post-write visibility re-read in the same plan. |
| **Operator judgment call on lifecycle pain frequency** | Low | One-off 22h stale server → Option B (stateless MCP) clearly wins. Weekly stale-PID kills → Option C (CLI) strengthens. Per Phase 1 §8: today is a one-off. Revisit after the plan ships. |

---

## Recommendations

1. **Ship the stateless adapter with file lock on `writeEntry`** (Phase 1 R1–R4; the prior report §5 step 1). Lock lives in `core/` (L1), not the shell, so correct under any transport. Kill H7 by construction.

2. **Address operator's Point 1 explicitly: extend the plan to cover parallel operation.**
   - **Cross-process cache invalidation**: every `writeEntry` under lock invalidates LRU cache AND sidecar cache. Document protocol in `docs/architecture.md`.
   - **Schema-version-skew detection**: per-process schema-version declaration; `meta_state_log_change` rejects unknown branches with a structured error.
   - **Per-worktree session ID**: closes the open `Multi-Session Isolation` gap (`docs/architecture.md` §378–383). Marker filename includes worktree/session ID.

3. **Drop or file-back the in-process idempotency cache** (`meta-state-log-change-tool.js:10`; Phase 1 §4). Idempotency belongs to the durable registry (`id` + `created_at`), not the per-process Map. **This is the fix for T1 + the partial cause of T4.**

4. **Add post-write visibility re-read in handlers.** `applyUpdateAndCheck` (PR #38) checks the return value but doesn't re-read the registry. The fix for T5: `await updateEntry(...)` → `readRegistry(root).find(e => e.id === id)` → if absent, return `{superseded: false, error: 'write-not-visible'}`. Same pattern for `meta_state_log_change` and `meta_state_resolve`. **This is the fix for T4 + T5 + the latent C16 bug.**

5. **Adopt Bridge 5 (schema as source of truth)** in the same plan. The parked design (`loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from`) closes the wire-format bug (T7) structurally and makes the stateless adapter safer (no `passthrough()` ZodObject → no `coerceParamsToSchema` recursion bug). Already designed; not invented work.

6. **Convert T4 + T5 to change-log entries** when the plan ships. Both findings are escalated severity and still OPEN (verified 2026-07-10 in plan 260710-0104-drift-driven-registry-closeout). Each fix (steps 3 + 4) collapses a recurring bug class. Filing as change-log with `consolidates` field preserves the lineage from the original incidents.

7. **Document F4 Data Leak Risk** as **out of scope** for this plan. F4 is orthogonal (marker content, not transport); has its own mitigation (hash, not plaintext). Don't conflate.

8. **Do not swap to CLI today.** The CLI path (Option C) requires re-wiring 3 runtimes + re-hosting R2 + re-hosting workflow registry. Cost > benefit. Keep CLI as the "minimal participation escape valve" for future runtimes that cannot host an MCP client (per `docs/runtime-contract.md` §22).

---

## What this report adds to the prior report

| Prior report | This report |
|---|---|
| "Stateless adapter fixes lifecycle + H7." | Confirmed via audit of 7 transport findings (T1–T7). All reduce to "in-process state as correctness surface." |
| "Don't swap to CLI." | Confirmed. |
| "Steps 1–2 (file lock + drop idempotency cache) are load-bearing." | Steps 1–2 still load-bearing; **steps 3–5 (post-write visibility re-read, Bridge 5, cache invalidation protocol) added as required.** |
| "Operator's Point 1 (parallel operation) not addressed." | **Now addressed:** cross-process cache invalidation + schema-version-skew detection + per-worktree session ID. |
| "Multi-Session Isolation gap surfaced" (line 380). | **Now explicit:** the per-worktree session ID closes this gap as part of the parallel-operation requirements. |
| F1–F13 mostly RESOLVED. | Confirmed: 6/8 RESOLVED, 2/8 unresolved (F4 Data Leak, F11 False Positive) — both orthogonal. Multi-Session Isolation is unresolved and adjacent; closed by this plan. |

---

## Unresolved questions

1. **Schema-version-skew: per-process declaration or per-worktree registries?** The prior report recommends cross-process file lock + stateless adapter; this report adds schema-version detection. **Open**: should schema-version declaration be in `process.env.LOOP_SCHEMA_VERSION` (per-process) or in a `.loop-version` file (per-worktree, versioned with the codebase)? Per-worktree file is more honest but adds a 5th file. Recommend: per-worktree file, since it tracks with `git checkout`.

2. **Bridge 5 scope.** The parked design (`loop-design-schema-as-source-of-truth-bridge-5`) is structurally correct but is a separate ship-able unit. **Recommendation**: ship in the same plan (the stateless plan). **Open**: should Bridge 5 be its own plan or co-shipped? Co-shipping is faster but more risk. Splitting is safer but slower.

3. **T4 + T5 fix completeness.** The post-write visibility re-read (step 4) is the structural fix, but the deeper question is: should `writeEntry` itself return a richer status object (e.g., `{ok: true, sha256: '...', mtime: ...}`) so handlers can verify without an extra read? **Open**: trade-off vs complexity. Recommend: structural fix first (post-write re-read in handlers); richer `writeEntry` signature as a follow-up only if the structural fix proves insufficient.

4. **Should this be a plan now?** The prior report §8.4 asked whether the operator wants a `plans/` directory or direct implementation. With this report adding 3 new requirements (cross-process cache invalidation, schema-version-skew detection, per-worktree session ID), the surgical-fix-now path is no longer surgical. **Recommendation: a `plans/260711-stateless-mcp-adapter/` plan with 3 phases**: (1) file lock + idempotency cache drop + post-write visibility re-read (kills T1, T3, T4, T5, T6); (2) Bridge 5 schema as source of truth (kills T7 structurally); (3) parallel-operation requirements (cross-process cache invalidation + schema-version-skew detection + per-worktree session ID).

---

## File references

- Prior report: `plans/reports/from-root-cause-to-transport-decision-260711-0011-mcp-stateless-adapter-vs-cli-report.md`
- Phase 1 root cause: `plans/reports/from-debugger-to-operator-260710-2350-meta-260619T2233Z-phase1-root-cause-investigation-report.md`
- Transport findings (audit): `meta-260606T2106Z`, `meta-260606T0155Z`, `meta-260609T2116Z`, `meta-260619T2233Z`, `meta-260626T1419Z`, `meta-260610T1859Z`, `meta-260610T0115Z`
- Architecture known issues: `docs/architecture.md` §315–376 (F1–F13) + §378–383 (Multi-Session Isolation)
- Transport contract: `docs/runtime-contract.md` § Transport mapping (4 capabilities × 3 transports)
- Parked designs: `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` (escape-hatch #11), `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (Bridge 5)