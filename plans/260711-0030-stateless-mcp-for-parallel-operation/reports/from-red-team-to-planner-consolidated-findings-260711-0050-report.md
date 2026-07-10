# Red-Team Review — Consolidated Findings

**Plan under review:** `plans/260711-0030-stateless-mcp-for-parallel-operation/`
**Mode:** 4-lens review (6+ phases → full panel)
**Reviewers:** Security Adversary · Failure Mode Analyst · Assumption Destroyer · Scope & Complexity Critic
**Method:** Adversarial parallel review (4 subagents, `code-reviewer` persona). Each finding carries `file:line` evidence or is auto-rejected per the evidence filter.

**Raw finding counts:** 42 findings across 4 reviewers → 25 unique after dedup → 15 surfaced below (capped per workflow).

---

## Findings (15, sorted by severity)

### Critical (3)

#### 1. Phase 7 references dissolved `OPERATOR_MODE=1` gate — closeout will silently fail
- **Lens:** Security Adversary F6 + Failure Mode Analyst F1
- **Location:** Phase 7 §"Risk Assessment" line 226 + Task 7.1 + Task 7.2
- **Flaw:** Plan says `meta_state_supersede` requires `OPERATOR_MODE=1`. The actual gate is `LOOP_SESSION_MODE === "live"` (strict). `OPERATOR_MODE` was dissolved in plan 260708-0833.
- **Failure scenario:** Operator runs Phase 7 in default (autonomous) mode. `meta_state_supersede` returns `{superseded: false, reason: "live_session_required"}`. T4 + T5 stay open. Plan reports "success" because change-log A is filed, but the closeout claim silently fails.
- **Evidence:** `tools/lib/session-mode.js:16-18` (current gate); `meta-state-supersede-tool.js:19-22` (handler check); `meta-state.jsonl:220` change-log (dissolution event).
- **Disposition:** **ACCEPT** — must fix before Phase 7 runs.

#### 2. Phase 5 modifies wrong file — writer is in `inbound-gate.js`, not `inbound-state.js`
- **Lens:** Security Adversary F8 + Failure Mode Analyst F2
- **Location:** Phase 5 §"Related Code Files" + §"Architecture" (lines 73, 90)
- **Flaw:** Plan says modify `core/inbound-state.js` `readLastOperatorMessage` + `writeLastOperatorMessage`. `inbound-state.js` exports ONLY `readLastOperatorMessage`. The actual writer is `hooks/universal/inbound-gate.js:60` `writeToAllSurfaces(root, ".last-operator-message", ...)`.
- **Failure scenario:** Implementer scopes the reader to `.last-operator-message-<sessionId>` but the inbound gate continues writing `.last-operator-message` (unscoped). Reads always return null. Inbound gate silently stops surfacing state-change context. Multi-Session Isolation gap is NOT closed.
- **Evidence:** `tools/learning-loop-mastra/core/inbound-state.js:41-60` (only `readLastOperatorMessage`); `hooks/universal/inbound-gate.js:60` (`writeToAllSurfaces`).
- **Disposition:** **ACCEPT** — must fix Phase 5 target file list.

#### 3. Registry poisoning by untrusted agent — Phase 2 drops the only intra-process rate-limit
- **Lens:** Security Adversary F1
- **Location:** Phase 2 + Phase 3 + plan §"Architecture"
- **Flaw:** Phase 2 removes `_idempotencyCache` (only intra-process rate-limit) without introducing any auth, rate-limit, or audit gate. MCP server (`server.js:44-60`) binds no caller identity.
- **Failure scenario:** Sub-agent floods `meta_state_log_change` at unbounded rate → registry disk-exhaustion, change-log pollution, cold-tier becomes unusable.
- **Evidence:** `meta-state-log-change-tool.js:10` (cache deleted); `mastra/server.js:44-60` (no caller check); `manifest.json` registers every tool without identity.
- **Disposition:** **ACCEPT** — add explicit trust-boundary documentation; recommend unix-socket or bearer-token gating at transport layer.

---

### High (8)

#### 4. Symlink attack on `.claude/coordination/.registry.lock` widens file-overwrite surface
- **Lens:** Security Adversary F2
- **Location:** Phase 1, lock path `<root>/.claude/coordination/.registry.lock`
- **Flaw:** `.claude/coordination/` is multi-writer (per `surfaces.js:16`). `realpath: false` does NOT block symlink attacks. Attacker pre-creates `.registry.lock` as a symlink to `meta-state.jsonl`; `fs.openSync(O_EXCL)` follows the symlink.
- **Failure scenario:** `renameSync(tmpPath, path)` in `meta-state.js:523` (inside the locked critical section) overwrites the symlink target. If `tmpPath` is also symlinked to `.git/HEAD`, attacker achieves arbitrary file overwrite within project root.
- **Evidence:** `meta-state.js:520-523`; `surfaces.js:88-90` `writeToAllSurfaces` multi-writer.
- **Disposition:** **ACCEPT** — move lock to `<root>/.meta-state.lock` (single-writer root) OR use `O_NOFOLLOW`.

#### 5. TOCTOU between `resolveRoot()` and `writeEntry` — `root` is caller-controlled
- **Lens:** Security Adversary F3
- **Location:** Phase 1 + every handler; `tools/lib/resolve-root.js:12-24`
- **Flaw:** Lock is keyed on `root` (caller-controlled via `GATE_ROOT` env). Attacker sets `GATE_ROOT=/tmp/victim-dir` and writes attacker-controlled JSONL with no idempotency cache.
- **Evidence:** `resolve-root.js:13-22` (validation bypass); `read-registry-cache.js:5` (cache keyed on root).
- **Disposition:** **ACCEPT** — restrict `GATE_ROOT` to a canonical test directory OR validate `root` is inside `DEFAULT_ROOT` even when env var is set.

#### 6. `git rev-parse` PATH-hijackable in Phase 5
- **Lens:** Security Adversary F4
- **Location:** Phase 5 `worktree-session-id.js:38-48`
- **Flaw:** `execFileSync("git", [...])` uses PATH lookup. Attacker poisons PATH or writes `.git/config` with `core.hooksPath`. Session-ID hash becomes sha256 of attacker-controlled toplevel.
- **Disposition:** **ACCEPT** — use absolute git binary path (`/usr/bin/git`) OR derive session ID from filesystem signature (no subprocess).

#### 7. `.loop-version` lazy-create race + supply-chain poisoning
- **Lens:** Security Adversary F5
- **Location:** Phase 4 `worktree-version.js:33-66`
- **Flaw:** Phase 1 lock covers registry only, not `.loop-version`. Two concurrent first-write processes race. Worse: supply-chain postinstall writes `.loop-version` with attacker-controlled `schema_branches` → DoS on audit trail OR extension bypass.
- **Disposition:** **ACCEPT** — move lazy-create inside `withRegistryLock`; Zod-validate `.loop-version` content on read.

#### 8. Phase 6 is a no-op — sidecar cache already validates by sha256
- **Lens:** Scope F1 + Assumption F1 + Failure F6 (3-reviewer consensus)
- **Location:** Phase 6 (entire phase)
- **Flaw:** Plan claims to add sha256 freshness check. `tools/learning-loop-mastra/core/loop-introspect-cache.js:31-45` `readColdTierCache` ALREADY computes `registrySha256(root)` and returns `{hit: false, reason: "sha_mismatch"}`. Plan names non-existent functions (`readLoopIntrospectCache`, `writeLoopIntrospectCache`, `computeRegistrySha256`); actual exports are `readColdTierCache` / `writeColdTierCache` and private `registrySha256`.
- **Disposition:** **ACCEPT** — DELETE Phase 6 entirely. Real cross-process correctness already covered by Phase 1's lock + LRU cache's mtime+size check.

#### 9. `.registry.lock` not in `.gitignore` — first write creates committed untracked file
- **Lens:** Failure Mode F4
- **Location:** Phase 1 "Related Code Files" (missing)
- **Flaw:** Plan adds `.gitignore` entry only for `.loop-version` (Phase 4). `.registry.lock` appears in `git status` after first write; risk of accidental commit breaks H7 protection.
- **Disposition:** **ACCEPT** — add `.claude/coordination/.registry.lock` (and parallel factory/mastracode patterns) to `.gitignore` in Phase 1.

#### 10. Lock directory not pre-created — `proper-lockfile` throws ENOENT on first call
- **Lens:** Failure Mode F5
- **Location:** Phase 1 `withRegistryLock` + RED test
- **Flaw:** `proper-lockfile` requires parent dir to exist. Fresh project with no `.claude/coordination/` yet → `writeEntry` → `withRegistryLock` → ENOENT → first write fails. Phase 1 makes cold start WORSE.
- **Disposition:** **ACCEPT** — add `mkdirSync(dirname(lockPath), { recursive: true })` in `withRegistryLock`.

#### 11. Phase 5 ignores multi-surface iteration — one session ID maps to 3 surfaces
- **Lens:** Failure Mode F3
- **Location:** Phase 5 Architecture
- **Flaw:** `writeToAllSurfaces` iterates `.claude`, `.factory`, `.mastracode`. Plan scopes one session ID per worktree but doesn't specify per-surface scoping. Either isolation is incomplete (cross-surface visibility) or 2/3 of writes are silently lost (reader checks 1, writer hits 3).
- **Disposition:** **ACCEPT** — per-surface scoped ID (session ID includes surface name).

#### 12. Phase 1 `stale: 5000` steals lock from slow legitimate writers
- **Lens:** Failure Mode F7
- **Location:** Phase 1 `withRegistryLock` config
- **Flaw:** `metaStateBatch` accepts up to 500 ops (`meta-state.js:669`). On slow disk, lock-hold exceeds 5s. Concurrent process sees >5s-old lock, steals it, races on same file. B's entry silently lost; A's batch view is stale.
- **Disposition:** **ACCEPT** — reduce `BATCH_SIZE_LIMIT` to 100 OR raise `stale` to 30s with `realpath: true`.

#### 13. Phase 3 RED test uses ESM namespace mutation pattern that won't work
- **Lens:** Failure Mode F12
- **Location:** Phase 3 Step 3.1 RED test
- **Flaw:** `(await import(...)).writeEntry = mock` — ES module exports are read-only live bindings; mutation throws TypeError. Test cannot produce RED baseline; TDD flow broken.
- **Disposition:** **ACCEPT** — restructure test: delete registry file between `writeEntry` and `assertWriteVisible`, or use `getRegistryPath` mock, or refactor handler to accept `writeEntry` parameter.

#### 14. RED test may pass without lock on fast filesystems (RED → GREEN unobservable)
- **Lens:** Failure Mode F8
- **Location:** Phase 1 Step 1.1 RED test
- **Flaw:** 2 children × 5 writes = 10 writes in ~10ms on fast SSD. Race window sub-millisecond; test may pass even WITHOUT a lock. Developer assumes GREEN works; H7 race untested.
- **Disposition:** **ACCEPT** — insert `setTimeout(50)` in critical section OR increase writes to 50/child to widen race window.

#### 15. Phase 2 leaves sibling `cache_hit` anti-pattern in `meta-state-refresh-file-index-tool.js`
- **Lens:** Failure Mode F9
- **Location:** Phase 2 scope
- **Flaw:** Phase 2 removes cache only from `meta-state-log-change-tool.js`. Same anti-pattern (60s TTL + `cache_hit: true/false`) exists in `meta-state-refresh-file-index-tool.js:39,99,119`. T4/T5 silent-failure class is half-closed.
- **Disposition:** **ACCEPT** — extend Phase 2 scope OR file follow-up plan.

---

## Rejected findings (not surfaced; lower priority or already-addressed)

| Reviewer | Finding | Why rejected |
|---|---|---|
| Scope F2 | Phase 5 `cachedSessionId` violates stateless invariant | Module-level cache is per-request, not correctness-critical; within scope |
| Scope F3 | Phase 3 `WriteNotVisibleError` duplicates `{ok, reason}` | Typed error class is good DX; not pure duplication |
| Scope F4 | Phase 4 over-specifies with `loop:`/`node:` fields | Metadata is informative for ops; minimal cost |
| Scope F5 | Phase 2+3 are one logical change | TDD structure benefits from separation; not blocking |
| Scope F6 | Phase 7's 3 change-logs gold-plate | Audit trail completeness has standalone value |
| Scope F7 | Phase 1 proper-lockfile for 17 lines | Cross-platform lock abstraction worth the dep |
| Failure F13 | Inner enqueue + outer lock double-serialization | Acceptable latency cost; documented trade-off |
| Failure F14 | Phase 5 30s cache reuse | Polish item, not blocker |
| Assumption F6 | Lock timeout vs contention | Lower priority than lock-file attacks |
| Assumption F7 | Bridge 5 reference conflates scope | Already-shipped status is documented; minor framing |
| Assumption F8 | Phase 4 references non-existent package.json | Caught in Phase 5 review; addressed by implementation |

---

## Severity breakdown

| Severity | Count | % |
|---|---|---|
| Critical | 3 | 20% |
| High | 8 | 53% |
| Medium | 4 | 27% |
| Total surfaced | 15 | 100% |

---

## Required actions before cook

1. **All 3 Critical findings** must be fixed before implementation begins.
2. **All 8 High findings** must be addressed in the same PR as the affected phase.
3. **Phase 6 must be DELETED entirely** (3-reviewer consensus: no-op).
4. **Phase 5 file-target list** must include `hooks/universal/inbound-gate.js:44-64`.
5. **Phase 7 risk assessment** must reference `LOOP_SESSION_MODE=live`, not `OPERATOR_MODE=1`.

---

## Files referenced (absolute paths)

- `plans/260711-0030-stateless-mcp-for-parallel-operation/plan.md`
- `plans/260711-0030-stateless-mcp-for-parallel-operation/phase-01…phase-07`
- `tools/lib/session-mode.js:16-18`
- `tools/learning-loop-mastra/tools/handlers/meta-state-supersede-tool.js:19-22`
- `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:10,39,62,110`
- `tools/learning-loop-mastra/tools/handlers/meta-state-refresh-file-index-tool.js:39,99,119`
- `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js:161`
- `tools/learning-loop-mastra/core/meta-state.js:259-264,372-385,535-551,560-621,669,682-768`
- `tools/learning-loop-mastra/core/loop-introspect-cache.js:20-25,31-45,50-61`
- `tools/learning-loop-mastra/core/inbound-state.js:5,41-60`
- `tools/learning-loop-mastra/hooks/universal/inbound-gate.js:44-64`
- `tools/learning-loop-mastra/core/update-entry-helpers.js:20-33`
- `tools/learning-loop-mastra/core/read-registry-cache.js:5,21-38`
- `tools/learning-loop-mastra/core/surfaces.js:16,88-90`
- `tools/lib/resolve-root.js:12-24`
- `tools/scripts/enable-operator-mode.sh:5`
- `package.json:16-24,33-40`
- `.gitignore:18-26`
- `meta-state.jsonl:220`