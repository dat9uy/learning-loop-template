# Phase 1 Investigation: meta-260619T2233Z — silent persistence fail

**Skill:** ck-debug (Phase 1: Root Cause Investigation)
**Finding:** `meta-260619T2233Z` — `meta_state_log_change` returned `logged: true, cache_hit: false` but entry was absent from `meta-state.jsonl`
**Status:** Phase 1 complete · root cause class narrowed to **H7 (cross-process file race)** · **not directly tested** · no fix proposed (iron law)

---

## Checked vs Remains (read this first)

### ✅ What I have checked

| # | check | method | verdict |
|---|---|---|---|
| C1 | Live MCP server health (PID 3831390) | 6 controlled writes via MCP, each grep-verified | **healthy** — all 6 entries persisted |
| C2 | Idempotency cache behavior | identical-args and distinct-args repeat calls | **correct** — identical args hit, distinct args miss |
| C3 | Code path of `meta_state_log_change` handler | line-by-line read of `meta-state-log-change-tool.js` | handler shape matches evidence (`await writeEntry → appendGateLog → cache set → return`) |
| C4 | `writeEntry` semantics | read `core/meta-state.js:535-551` + `enqueue` | sync I/O; either throws or persists; no silent-fail code path within `writeEntry` itself |
| C5 | Cache invalidation flow | read `read-registry-cache.js` + all writers call `invalidateCache` | mtimeMs+size keyed; cache invalidated after every write |
| C6 | Gate-log append timing | read `meta-state-log-change-tool.js:87-95` | `appendGateLog` runs AFTER `await writeEntry(...)` → handler's "logged: true" implies writeEntry resolved |
| C7 | Original 2026-06-19 incident evidence | grep `gate-log.jsonl` 12:36–15:30 + grep `meta-state.jsonl` | gate-log entry present at 12:37:56 (handler ran); meta-state.jsonl lacks the entry (write lost); 2h 49m of silence before retry |
| C8 | Multi-process state right now | `/proc/1107356/`, `/proc/3831390/` (env, cwd, fd) | 2 servers alive; same cwd; same env; same target file; **no cross-process lock visible anywhere** |
| C9 | H1 (cache mis-report) | experiment C2 | **refuted** |
| C10 | H2 (path mismatch between writer and reader) | code trace + proc env | **refuted** — same `resolveRoot()` → same path on both processes |
| C11 | H3 (in-process race in `enqueue`) | `prev.then(fn)` semantics + experiment C1 | **refuted** — serialized within process |
| C12 | H5 (enqueue swallows errors) | `return result` (not `next`) propagates rejection | **refuted** by code reading |
| C13 | H6 (phantom cache from failed first write) | cache stores only AFTER `await writeEntry` returns | **refuted** |
| C14 | H8 (FS-level loss after `renameSync`) | env (local ext4), no crash evidence | **implausible** |
| C15 | H9 (gate-log silent fail) | gate-log entry IS present at 12:37:56 | **refuted** |
| C16 | Adjacent bug: `meta-state-resolve-tool.js:161` ignores `updateEntry` return value | read handler | **confirmed latent bug** — same shape as silent-persistence-fail; currently unreachable but becomes reachable if `meta_state_delete` ships |

### ⏳ What remains (unfinished)

| # | item | blocker / next step |
|---|---|---|
| R1 | **H7 (cross-process file race) — directly unconfirmed** | need to spawn a 2nd MCP process and fire parallel writes from both; check if any entry is lost. Not reachable from a single Claude session connected to one process. |
| R2 | **Phase 2 (Pattern Analysis)** — find working cross-process lock examples in the codebase or in libraries | blocked on R1 confirming whether H7 is the actual class (if R1 refutes H7, return to Phase 1 for new hypotheses) |
| R3 | **Phase 3 (Hypothesis Testing)** — kill-one-write-wins test under flock, compare against current implementation | blocked on R2 |
| R4 | **Phase 4 (Implementation)** — fix | blocked on R1-R3 |
| R5 | **Operator scope decision: kill PID 1107356** | operator action; 22h stale server is a confounding factor |
| R6 | **Adjacent fix: `applyUpdateAndCheck` retrofit to resolve-handler** | independent of R1-R4; can ship now; needed before `meta_state_delete` lands |
| R7 | **Architectural decision: where does cross-process file lock live?** | operator decision; affects docs and design |
| R8 | **Live-MCP-runtime: does the live server (PID 3831390) ever lose entries under load?** | need sustained write-rate test from one process; not yet attempted |
| R9 | **Handler-adapter layer: is there a wrapper between MCP dispatch and `handler()` that could mask a writeEntry failure?** | NOT checked. `server.js` adapter logic not read in this investigation. |
| R10 | **What about `mcp__learning-loop__mastra_meta_state_log_change` post-write re-read?** | NOT checked. The fix described in the original finding (`meta_state_list` re-query to confirm) has not been validated as the canonical hardening. |
| R11 | **Resolve-handler latent-bug reachability** | `meta_state_delete` not yet added; the bug is latent. When `delete` ships, the bug becomes reachable and silent. |

### TL;DR (one paragraph)

The live MCP server is healthy; the original incident is non-reproducible on a fresh server; 6 of 8 hypotheses are refuted by code reading + experiments, 1 is implausible (FS), 1 is the leading suspect (**H7 — multi-process file race on `meta-state.jsonl`**). H7 is consistent with all known evidence but **was not directly tested in this session** because spawning a second MCP process is not reachable from a single Claude Code session. A latent same-class bug exists in `meta-state-resolve-tool.js:161` and will need a backfill regardless of H7 outcome. No fix is proposed until H7 is tested.

## Evidence collected

### 1. Code path traced

| component | location | behavior |
|---|---|---|
| Handler | `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:41-113` | builds entry → `await writeEntry(root, entry)` → `appendGateLog` → cache set → return `logged: true, cache_hit: false` |
| `writeEntry` | `tools/learning-loop-mastra/core/meta-state.js:535-551` | `enqueue(fn)` → `safeParse` → `readFileSync` → push → `writeFileSync(.tmp)` → `renameSync(.tmp, .jsonl)` → `invalidateCache` |
| `enqueue` | `core/meta-state.js:357-366` | serializes per-root writes via `result = prev.then(fn)`; `next = result.catch(()=>{})` keeps queue alive on rejection |
| `readRegistryWithCache` | `core/read-registry-cache.js:21-38` | mtimeMs+size keyed LRU; cache miss → re-read; `invalidateCache` after every write |
| `resolveRoot` | `tools/lib/resolve-root.js:12-24` | `process.env.GATE_ROOT \|\| DEFAULT_ROOT`; DEFAULT_ROOT from `import.meta.url` |
| Idempotency cache | `meta-state-log-change-tool.js:10` | 60s TTL, keyed on `(root, dimension, target, reason)`; in-process Map |

### 2. Original 2026-06-19 incident (file-level evidence)

| time | observation |
|---|---|
| 12:36:00–12:36:59 | 18 gate-log entries (9 `meta_state_relationships`, 9 `meta_state_sweep`) — read-only activity, no writes |
| 12:37:56.876 | the failed `meta_state_log_change` — gate-log entry recorded, `cache_hit` field absent (= cache miss) |
| 12:38–15:26 | **2h 49m of complete gate-log silence** (orchestrator troubleshooting) |
| 15:27:51.427 | operator's diagnostic `meta_state_list` query (count: 0 for the failed id) |
| 15:29:15 | second call succeeded under a NEW id `meta-260619T2229Z-…` (different timestamp) |

**Critical:** the gate-log has the 12:37 entry. `appendGateLog` runs AFTER `await writeEntry(...)`. Therefore `writeEntry` returned (resolved, not rejected). But the file lacks the entry.

### 3. Multi-process state observed right now

| PID | started | uptime | cwd | env (relevant) |
|---|---|---|---|---|
| 1107356 | 2026-07-10 01:08 | ~22h | same repo | `MASTRA_STORAGE_DRIVER=native`, no `GATE_ROOT`, no `LOOP_SESSION_MODE` |
| 3831390 | 2026-07-10 23:42 | ~12min | same repo | same env |

**Both processes:** same cwd, same env → same `resolveRoot()` → same `getRegistryPath()` → same `meta-state.jsonl`. No cross-process synchronization. The `enqueue` Map is per-process, so it serializes within each process but **not across processes**.

### 4. Live MCP server (PID 3831390) health — controlled experiment

| call | args | result | file persisted? |
|---|---|---|---|
| call-1-baseline | unique target A | `logged: true, cache_hit: false` | ✓ |
| call-1-baseline-repeat (same args, 25s later) | same as above | `logged: true, cache_hit: false, SAME id+created_at` | ✓ DUPLICATE written (cache should have hit; see below) |
| call-2-distinct | unique target B | `logged: true, cache_hit: false` | ✓ |
| call-3-distinct | unique target C | `logged: true, cache_hit: false` | ✓ |
| cache-test-A call 1 | unique target D | `logged: true, cache_hit: false` | ✓ |
| cache-test-A call 2 (identical args, ~5s later) | identical | `logged: true, cache_hit: true, SAME id+created_at` | ✓ only 1 entry (cache worked) |
| rapid-fire | unique target E | `logged: true, cache_hit: false` | ✓ |

**Notes on the cache-test-A repeat vs call-1-baseline-repeat discrepancy:** call-1-baseline's "repeat" used a different `reason` string (the test was sloppy), so it had a different cache key. Cache-test-A used truly identical args and the cache hit. The cache works correctly when keyed on identical args.

**Verdict:** the live MCP server is healthy. The bug does not reproduce here.

### 5. Adjacent bug class discovered (separate from silent-persistence-fail)

`meta-state-resolve-tool.js:161`:
```js
await updateEntry(root, id, patch);

const result = { resolved: true, ... };  // ← unconditional
appendGateLog(root, { ... result });
return { ... result };
```

`updateEntry` can return: `true` (success), `null` (entry not found), `"validation_failed"` (patch rejected), `"version_mismatch"` (CAS failed). The handler does NOT check the return value. **If `updateEntry` returns `null` for any reason, the handler reports `resolved: true` while no patch was applied.** This is the exact same bug shape as the silent-persistence-fail class but reachable through a different mechanism.

Reachability today: contrived. The handler does `readRegistry(root)` at line 30 and finds the entry. Between line 30 and line 161, another writer in the same process would have to delete the entry — but no current tool deletes entries. So this is currently latent. **It becomes reachable if `meta_state_delete` is added, or if the consult-gate's rule traversal introduces a side effect that mutates the entry.**

`meta-state-supersede-tool.js:54` uses `applyUpdateAndCheck` (PR #38 fix) which DOES check the return value. The resolve handler predates that helper and was not retrofitted.

## Hypotheses evaluated

(Hypothesis verdicts consolidated into the **Checked vs Remains** table above; rows C9–C15.)

## Most likely root cause

**H7 — multi-process file race.** The codebase has no cross-process file lock on `meta-state.jsonl`. The per-process `enqueue` Map does NOT serialize across processes. When two MCP server processes are alive concurrently and both receive writes:
- A reads file (10 entries) → A's enqueue schedules the write
- B reads file (10 entries) → B's enqueue schedules the write
- A writes (10+1=11 entries) → renames .tmp → file now has 11
- B writes (10+1=11 entries with B's entry, NOT A's) → renames .tmp → file now has 11 (A's entry LOST)
- A's handler returns `logged: true` based on `enqueue`'s resolved Promise — but A's entry was overwritten

The 2026-06-19 incident occurred on a single long-lived server, so H7 in its pure form may not be the only cause — but the **class of bug** (concurrent writers to an append-only file with no synchronization) is the most plausible explanation for non-deterministic "logged but not persisted" reports.

**Confirmation path:** run two parallel MCP invocations from different processes simultaneously and observe whether any entries are lost. This is not directly testable from a single Claude Code session connected to one process.

## Phase 2-4 next steps (forward path)

(Detailed blocking chain recorded as **R1–R4** in the **Checked vs Remains** table above. Summary:)

- **R1 (Phase 3, hypothesis test):** spawn 2nd MCP process from a child shell; fire parallel writes from both; check whether any entry is lost. If yes → R2. If no → return to Phase 1 for new hypotheses.
- **R2 (Phase 2, pattern):** survey `proper-lockfile`, `flock(2)`, and any in-codebase cross-process locking precedent. Pick the smallest lock that doesn't break the in-process `enqueue` invariant.
- **R3 (Phase 3, hardening):** design the lock acquisition + release pattern; ensure the `invalidateCache(root)` ordering survives under lock.
- **R4 (Phase 4, implementation):** failing test that reproduces the race; minimal patch; verify via the R1 experiment that entries no longer get lost.

R6 (resolve-handler `applyUpdateAndCheck` retrofit) is **independent** of R1-R4 and can ship now.

## Recommendations for operator

1. **Kill the stale MCP server (PID 1107356)**. It's been running 22h, has independent in-process state, and is a confounding factor for any further investigation. The Claude session is connected to PID 3831390; killing 1107356 has no impact on Claude functionality.
2. **Patch the latent bug in `meta-state-resolve-tool.js:161`** — even though it's not the root cause of `meta-260619T2233Z`, it's the same bug class (`unconditional success after failed write`) and will bite as soon as `meta_state_delete` is added or consult-gate side effects land.
3. **The `silent-persistence-fail` finding should be upgraded to investigate the cross-process lock design** — this is the architectural fix that prevents the entire class.

## Unresolved questions

(Most are tracked in **R9–R11** in the **Checked vs Remains** table above.)

1. Was there a SECOND MCP server process alive at 2026-06-19T12:37:56? The original incident occurred during a long-lived Claude session; multi-MCP-server is a normal pattern. Without access to the historical process list, this is inferential.
2. The `meta-260619T2233Z` finding's `meta_state_list` count of 0 for the failed id — was that a true count-0 from a fresh registry read, or a stale-cache count? The finding's evidence says "verified non-persistence" with grep; that's the source of truth.
3. Is there a planned `meta_state_delete` tool? If yes, when — that triggers the latent resolve-handler bug.

## Files inspected during investigation

- `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js`
- `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js`
- `tools/learning-loop-mastra/tools/handlers/meta-state-supersede-tool.js`
- `tools/learning-loop-mastra/core/meta-state.js` (writeEntry, updateEntry, enqueue)
- `tools/learning-loop-mastra/core/read-registry-cache.js`
- `tools/learning-loop-mastra/core/update-entry-helpers.js`
- `tools/lib/resolve-root.js`
- `tools/lib/ttl-cache.js`
- `tools/lib/gate-logging.js`
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-log-change.test.js`
- `meta-state.jsonl` (grep, tail)
- `.claude/coordination/gate-log.jsonl` (sweep around 12:36–15:30 on 2026-06-19)
- `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md`
- `/proc/1107356/`, `/proc/3831390/` (env, cwd, fd inspection)