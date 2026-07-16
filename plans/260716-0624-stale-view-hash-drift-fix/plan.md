---
title: "Stale-view hash-drift fix — make hasDrifted match SP2 semantics"
date: 2026-07-16
status: not-started
mode: deep
trigger: "meta-260716T0603Z-hasdrifted-in-core-stale-view-js-is-path-keyed-only-it-retur (open, loop-anti-pattern, schema-ceremony); PR #62 cold-tier regression 0c8f670 scoped cap to age-only as a workaround"
blockedBy: []
blocks: []
---

# Plan — stale-view hash-drift fix

**Status:** not started
**Mode:** deep + TDD
**Trigger:** `meta-260716T0603Z-…` (`core/stale-view.js:55` returns true on path-presence alone, contradicting SP2's hash comparison). The commit history shows the workaround path: `0c8f670 fix(test): scope cold-tier derived-stale cap to age-only` is the visible scar — a test that should be exercising the drift branch was scoped out because the drift branch was untrustworthy.

## Goal

Make `hasDrifted` (and therefore `isStaleView` / `derivedStaleSet`) **actually mean "the cited file has changed since the finding was last grounded"** — the same comparison SP2's `checkGrounding` already does at `core/check-grounding.js:206`. After the fix, every grounded open finding is **not** stale by drift; only files that have actually changed since their last `meta_state_refresh_file_index` (or since `seed-file-index.mjs` ran) flip the drift signal. This restores the contract `isOpen && (age || hash-drift)`, makes `meta_state_re_verify` able to clear the drift signal on a passing run, and removes the structural-cap inflation that forced `0c8f670`'s age-only scoping.

## Root cause (verified)

`hasDrifted(entry, fileIndex)` at `core/stale-view.js:55` returns `true` whenever `fileIndex.has(canonicalIndexKey(ref))` — i.e., path presence in the index. But `seed-file-index.mjs` re-hashes every distinct `mechanism_check:true` path to its **current bytes** before each test/pre-commit/CI run. So "path present in index" actually means "grounded path exists" — the opposite of drift.

`checkGrounding` at `core/check-grounding.js:201-208` already does the right thing:

```js
const rawIndex = idx && idx.has(canonical) ? idx.get(canonical) : null;
const indexBaseline = typeof rawIndex === "string" && TERMINAL_HASH_REGEX.test(rawIndex) ? rawIndex : null;
const storedFingerprint = indexBaseline
  ?? (typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
      ? entry.code_fingerprint : null);
const hashMatch = codeRefHash !== null && storedFingerprint !== null
  ? codeRefHash === storedFingerprint
  : null;
```

SP2 computes `codeRefHash` (current bytes) and compares to `storedFingerprint` (index baseline, fallback per-record). The same predicate for drift = `codeRefHash !== storedFingerprint`. `hasDrifted` must do the same, with the caller injecting `codeHashes` (current bytes) to preserve purity.

## Fix design

Purity constraint: `isStaleView` is pure today (no filesystem reads). Keep it pure by accepting a caller-injected `codeHashes: Map<canonicalKey, currentHash>`. The helper that builds the map is impure (one `readFileSync` per unique path) but it lives next to the existing `computeFileHash` in `core/check-grounding.js` and is invoked once per call site. This mirrors SP2's existing `codeContext.codeHashes` shape (the function already receives `fileIndex` the same way).

### New contract

<!-- RT: M2 — computeCurrentHashes routes through resolveSafePath, not isAbsolute+join -->
<!-- RT: M5 — hasDrifted uses TERMINAL_HASH_REGEX chain, matching SP2 -->
<!-- RT: M20 — computeCurrentHashes returns { ok, skipped } for caller-side logging -->

```js
// core/stale-view.js
export function isStaleView(entry, opts = {}) {
  // opts: { now?, fileIndex?, codeHashes? }
  // - fileIndex: Map<canonicalKey, baselineHash> from readFileIndex(root)
  // - codeHashes: Map<canonicalKey, currentHash> from computeCurrentHashes(entries, root).ok
  // Backward compat: when codeHashes missing OR empty, drift branch returns false
  // (same as today's behavior for callers that don't pass fileIndex).
}

function hasDrifted(entry, fileIndex, codeHashes) {
  const ref = entry.evidence_code_ref;
  if (typeof ref !== "string") return false;
  if (!fileIndex && !codeHashes) return false;
  const canonical = canonicalIndexKey(ref);
  const currentHash = codeHashes instanceof Map && codeHashes.has(canonical) ? codeHashes.get(canonical) : null;
  // RT: M5 — replicate SP2's regex-validated fallback chain (check-grounding.js:201-205)
  const rawIndex = fileIndex instanceof Map && fileIndex.has(canonical) ? fileIndex.get(canonical) : null;
  const indexBaseline = typeof rawIndex === "string" && TERMINAL_HASH_REGEX.test(rawIndex) ? rawIndex : null;
  const storedHash = indexBaseline
    ?? (typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
        ? entry.code_fingerprint : null);
  if (currentHash === null || storedHash === null) return false;
  return currentHash !== storedHash;
}

// RT: M2 + M20 — helper routes through resolveSafePath; returns { ok, skipped } so
// callers log skipped paths from their own runtime context (no gate-log coupling
// in core).
export function computeCurrentHashes(entries, root) {
  const ok = new Map();
  const skipped = [];
  if (!Array.isArray(entries)) return { ok, skipped };
  const seen = new Set();
  for (const e of entries) {
    const ref = e?.evidence_code_ref;
    if (typeof ref !== "string") continue;
    const canonical = canonicalIndexKey(ref);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    try {
      const absPath = resolveSafePath(root, canonical);  // RT: M2 — containment enforcement
      ok.set(canonical, computeFileHash(absPath));
    } catch (err) {
      const reason = err instanceof PathContainmentError
        ? `containment_violation:${err.reason}`
        : err?.code === "ENOENT"
          ? "missing"
          : `fs_error:${err.code ?? "unknown"}`;
      skipped.push({ canonical, reason });
      // No entry → no drift signal. Predicate treats missing currentHash as no-drift.
    }
  }
  return { ok, skipped };
}
```

### Why per-record `code_fingerprint` as fallback

The existing SP2 fallback chain (`indexBaseline ?? entry.code_fingerprint`) is intentional: `meta_state_refresh_file_index` updates the index, but legacy entries (and entries written before the sidecar existed) carry the per-record field as the original grounding hash. Removing the fallback would regress pre-sidecar drift detection. Keep the chain identical to SP2.

### Why no `codeHashes` → no drift signal

Backwards compat with callers that don't currently pass the map (e.g. `derive-status.js:141`, `core/entry/finding.js:46`, `meta-state-relationship-validate-tool.js:15` before this fix). The fix updates the consumers that *want* a drift signal to build the map; the consumers that don't need it get age-only behavior — which is what they wanted anyway.

## Phases

| # | Phase | Mutates? | Depends on |
|---|---|---|---|
| 1 | [Hash-aware `hasDrifted` + helper](phase-01-hash-aware-hasdrifted.md) — TDD: write failing tests in `stale-view.test.js` for hash-aware semantics; fix `core/stale-view.js` (TERMINAL_HASH_REGEX chain + resolveSafePath routing + `{ ok, skipped }` return); export `computeCurrentHashes`; extend `core/derive-status.js` codeContext to inject `fileIndex` + `codeHashes` (Validation Q4) | yes (3 core files + 3 test files) | — |
| 2 | [Wire consumers + update consumer tests](phase-02-consumer-wiring.md) — 4 consumers (`meta-state-sweep-tool`, `meta-state-relationship-validate-tool`, `meta-state-relationships-tool`, `loop-introspect.js#buildStaleDispatchHints`) build `codeHashes`; add integration test for EACCES / traversal / missing paths | yes (4 source files + 4 test files) | 1 |
| 3 | [Cold-tier cap + opt-in re_verify index refresh](phase-03-cold-tier-cap-and-reverify-clear.md) — restructure Phase 7 cap into age-stale + drift-stale assertions; add `refresh: true` opt-in to `meta_state_re_verify`; CAS-order the index upsert; gate-log on every refresh attempt | yes (test + tool + new test file) | 1, 2 |
| 4 | [Docs + change-log + meta-state closeout](phase-04-docs-and-closeout.md) — update `docs/meta-state-lifecycle.md` (stale-view section), 6-section PR body per `meta-state-pr-body-advisory.yml:71-78`, parity grep across `.factory/` LOCAL copies, auto-generated change-log entry, `meta_state_check_grounding` pre-check, `meta_state_resolve` the `meta-260716T0603Z` finding | yes (docs + registry) | 1, 2, 3 |

## Acceptance criteria

1. `core/stale-view.js#hasDrifted` uses the same hash comparison as SP2 (`codeRefHash !== storedFingerprint` with the index-then-per-record fallback chain AND `TERMINAL_HASH_REGEX` validation on both sides). Purity preserved via caller-injected `codeHashes`. (RT: M5)
2. `computeCurrentHashes(entries, root)` is exported from `core/stale-view.js`; returns `{ ok: Map<canonicalKey, currentHash>, skipped: Array<{canonical, reason}> }`. Routes through `resolveSafePath` to reject traversal/symlink/hardlink. Reused by all 4 consumers that want a drift signal. (RT: M2, M7, M20)
3. `stale-view.test.js` covers: hash-mismatch → drift; hash-match → no drift; missing baseline → no signal; missing `codeHashes` → no drift (backward compat); missing `evidence_code_ref` → no drift; malformed per-record `code_fingerprint` → no signal (regex defense); malformed index entry → fall through to per-record; `computeCurrentHashes` dedup + skip-missing + reject-traversal.
4. All 4 consumers (`meta-state-sweep-tool.js`, `meta-state-relationship-validate-tool.js`, `meta-state-relationships-tool.js`, `core/loop-introspect.js#buildStaleDispatchHints`) pass `{ fileIndex, codeHashes }` to `isStaleView`/`derivedStaleSet`. Each logs non-`"missing"` skipped paths from `computeCurrentHashes(...).skipped`. Existing tests unchanged unless they exercise the drift branch. (RT: M7)
5. `cold-tier-regression.test.js` Phase 7 is restructured into TWO assertions: (a) age-stale cap ≤ precompute + 2 (existing forcing function preserved); (b) drift-stale count = 0 in CI (tight; any drift > 0 fails loudly). Both use real `{ fileIndex, codeHashes }`. Documented that `pnpm test:iter` is INCOMPATIBLE with this test (it skips the seed step). (RT: M4, M13)
6. `meta_state_re_verify` schema adds `refresh: z.boolean().optional().default(false)`. When called with `refresh: true` AND verification passes AND CAS update succeeds, the tool calls `upsertFileIndexEntry(root, canonical, currentHash)`. Gate-log entries written on every refresh attempt (success/skip). Default behavior (no `refresh`) is unchanged. (RT: M1, M3, M14)
7. `docs/meta-state-lifecycle.md` documents the hash-aware stale-view contract, the `computeCurrentHashes` `{ ok, skipped }` return shape, and the opt-in `meta_state_re_verify` clear behavior.
8. PR body uses six `## X entries` sections per `meta-state-pr-body-advisory.yml:71-78` regex (swept/resolved/new/promoted/superseded/archived). (RT: M12)
9. One `meta_state_log_change` change-log entry captures this work with `change_dimension: semantic`, `change_target: core/stale-view.js`. Id is auto-generated (NOT hand-crafted). (RT: M19)
10. `meta-260716T0603Z-…` is `meta_state_resolve`d only after a pre-resolve `meta_state_check_grounding({id})` returns `status: "grounded"`. (RT: F1)

## Constraints / risks

- **No new `isStaleView` semantics for callers that don't inject `codeHashes`** — they continue to get age-only behavior. The fix is additive; consumers must opt in.
- **Purity boundary:** `isStaleView` stays pure. `computeCurrentHashes` is the impure helper (reads fs); it lives in the same module as the other helpers for cohesion but is invoked by tool handlers, not by the predicate. Returns `{ ok, skipped }` rather than logging — callers gate-log `skipped` from their own runtime context. (RT: M20)
- **`derive-status.js:141` `isStaleView(entry)` call without opts:** supersedeed by Validation Q4. Post-Phase-1, `codeContext` accepts `fileIndex` + `codeHashes`; `meta_state_derive_status` tool builds both. Drift-aware recommendations now flow through SP1 without requiring a separate `meta_state_check_grounding` call.
- **`meta_state_re_verify` refresh is opt-in AND best-effort:** requires `refresh: true`; runs only after `applyUpdateAndCheck` succeeds; skips silently on missing/EACCES with gate-log breadcrumb. (RT: M1, M3, M14)
- **The cold-tier cap precompute shifts:** post-fix, only findings whose files have actually drifted (or aged >7d) count. Run `meta_state_sweep` after Phase 1 lands to get the real number, then update the cap precompute in Phase 3. Drift cap = 0 in CI (post-seed normalization); any drift > 0 is a path-presence-style regression. (RT: M4)
- **`pnpm test:iter` incompatibility:** the script at `package.json:18` does NOT prepend the seed step. The cold-tier drift-exercising test must run under `pnpm test`. Documented in Phase 03 § Step 3.2 + Phase 03 § Risk Assessment. (RT: M13)
- **TOCTOU between sweep and re_verify:** sweep loads `fileIndex` (cached at `core/meta-state.js:751-754`); re_verify upserts invalidate cache; sweep then reads fresh bytes → drift fires on freshly re-verified entries. Documented in Phase 03 § Risk Assessment; full enqueue-based mitigation deferred to a follow-up plan. (RT: M6)
- **Backwards compat for `meta-state-relationship-validate-tool` and `meta-state-relationships-tool`:** their current `isStaleView(target)` calls have no opts → age-only. Phase 2 upgrades both to inject `{ fileIndex, codeHashes }`. Existing tests with `writeFixture` (no `evidence_code_ref`) are unaffected by drift branch; only NEW fixtures with refs exercise drift. (RT: M10)
- **`loop-introspect.js#buildRegistrySummary` already takes `fileIndex`** but only uses it for the `drift` snapshot (top-5 mc:true findings), not for stale-view. No change needed there.
- **`core/entry/finding.js#createFinding` factory's `isStaleView` wrapper** has no opts (intentional — the factory is pure data construction). Stays age-only. Callers wanting drift must call `isStaleView(parsed, { fileIndex, codeHashes })` directly.

## Out of scope

- `meta_state_sweep` apply-mode removal is already done (plan 260707-0812 Phase 3). Not re-litigated.
- `code_fingerprint` per-record field removal is vestigial per `core/check-grounding.js:42` and `core/meta-state.js:282` — out of scope for this fix.
- `loop-describe-tool.js` cold-tier payload currently does not emit a `stale_view` list directly (it goes through `meta-state-sweep-tool.js`). If a future enhancement adds stale-view inline to the cold tier, it must use the same `computeCurrentHashes` helper.

## Consult-gates (check before any resolve)

- **`rule-no-orphaned-evidence`** — `applies_to_resolution: "*"`, agent-enforced. The fix preserves the index baseline; resolves are not blocked.
- **`rule-pr-body-registry-deltas`** — `scope_predicate: project_has_learning_loop_mcp`. The PR body must enumerate: (a) swept entries by id+reason (none — no sweep writes), (b) resolved by id+resolution note (`meta-260716T0603Z-…` — "hash-aware stale-view fix shipped, see plan 260716-0624"), (c) new by id+initial status (none), (d) promoted (none), (e) superseded/archived (none). Plus the change-log entry from Phase 4.

## Verification protocol

```bash
# Phase 1
pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/stale-view.test.js
# expected: 14 passed (8 existing updated + 6 new)

# Phase 2
pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep.test.js \
                       tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep-stale-transition.test.js \
                       tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationship-validate-tool.test.js \
                       tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationships-dangling-refs.test.js \
                       tools/learning-loop-mastra/__tests__/legacy-mcp/build-stale-dispatch-hints.test.js
# expected: all passed

# Phase 3
pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
# expected: 1 passed, drift branch active, cap reflects new precompute

# Phase 4
pnpm test
# expected: all passed

# Manual sanity
pnpm meta_state_sweep   # via MCP if exposed; otherwise inspect /tmp/sweep.json
# expected: stale_view_count drops to actual-drifted-only (likely ~0 post-fix,
#          because the seed step re-hashes to current bytes → no drift signal)
```

## Related changes

- **Finding:** `meta-260716T0603Z-hasdrifted-in-core-stale-view-js-is-path-keyed-only-it-retur` (this plan closes it)
- **Workaround scar:** `0c8f670 fix(test): scope cold-tier derived-stale cap to age-only` (this plan removes the age-only scoping)
- **Debug report:** `plans/reports/debug-260716-0548-GH-260715-pr-62-derived-stale-cap-regression-report.md` (the prior investigation; this plan is the structural fix it called for)
- **Prior design:** `plans/260707-0812-lifecycle-status-stale-mechanism/plan.md` (the migration that introduced `isStaleView`; the path-presence predicate was the prototype's shortcut — this plan replaces it with the SP2 pattern)
- **Related finding (separate, not closed by this plan):** `meta-260714T1248Z-the-rule-entry-pattern-field-is-validated-as-z-string-with-n` — same schema-ceremony class, different predicate. Reference for pattern alignment only.

## Unresolved questions

1. Should `computeCurrentHashes` deduplicate across multiple entries sharing a canonical key, or hash each entry independently? **Decision in Phase 1:** dedupe by canonical key (one `readFileSync` per path). This matches `seed-file-index.mjs` which already dedupes.
2. Should `meta_state_re_verify` skip the index refresh if `META_STATE_VERIFY_EXEC` is not set, or attempt it always? **Decision in Phase 3:** supersedeed by RT: M3 — index refresh is now opt-in via `refresh: true` arg (default off), independent of the `META_STATE_VERIFY_EXEC` env-var gate. The env-var still gates whether the verification step sequence runs at all.
3. After the fix, `cold-tier-regression.test.js` cap precompute may drop to ~0 (no actual drift post-seed). Is the cap still meaningful? **Decision in Phase 3:** supersedeed by RT: M4 — cap restructured into TWO assertions: (a) age-stale cap (existing forcing function preserved), (b) tight drift-stale cap (= 0 in CI; any drift > 0 fails loudly as path-presence-style regression).

## Red Team Review

### Session — 2026-07-16
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 3 Critical, 6 High, 6 Medium

**Reviewers:** Security Adversary (a49d23baad68be0e3), Failure Mode Analyst (a4e0fb60d03e4f9aa), Assumption Destroyer (a56709d8420d51eef). Review reports at `plans/260716-0624-stale-view-hash-drift-fix/reports/from-code-reviewer-to-planner-red-team-{lens}-plan-review-report.md`.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | M2 — `computeCurrentHashes` + re_verify refresh bypass `resolveSafePath` (`core/path-containment.js:83`); `evidence_code_ref` schema at `core/meta-state.js:285` accepts any string → crafted ref reads `/etc/passwd` outside root | Critical | Accept | Phase 01, Phase 03 |
| 2 | M3 — `meta_state_re_verify` becomes drift-clearing backdoor; every passing run upserts baseline, bypassing `rule-no-orphaned-evidence` consult-gate on subsequent `meta_state_resolve` | Critical | Accept | Phase 03 |
| 3 | M4 — Cold-tier cap collapses to 0+2=2 because `seed-file-index.mjs:43-66` normalizes hashes to current bytes; deletes forcing function for the regression class this plan fixes | Critical | Accept | Phase 03 |
| 4 | M1 — `upsertFileIndexEntry` placed BEFORE `applyUpdateAndCheck` (`meta-state-re-verify-tool.js:65`); on CAS conflict, index mutates but `last_verified_at` doesn't stamp → orphan baseline | High | Accept | Phase 03 |
| 5 | M5 — `hasDrifted` doesn't validate against `TERMINAL_HASH_REGEX` (`core/check-grounding.js:66,202-205`); regresses SP2's H-2 defense against malformed per-record fingerprints | High | Accept | Phase 01 |
| 6 | M6 — TOCTOU race: sweep loads `fileIndex` (cached), re_verify upserts, sweep then computes `codeHashes` from disk → drift fires on freshly re-verified entries (`core/meta-state.js:751-754` cache, `meta-state.js:822-825` invalidation) | High | Accept | Phase 03 |
| 7 | M7 — Plan claims `build-stale-dispatch-hints.test.js` updates but Phase 02 modify list omits `loop-introspect.js#buildStaleDispatchHints:224` which calls `isStaleView(e)` without opts — phantom claim, internal inconsistency | High | Accept | Phase 02 |
| 8 | M12 — PR body uses single `## Registry deltas` table but `meta-state-pr-body-advisory.yml:71-78` regex expects six `## X entries` sections → 6 CI warnings per PR | High | Accept | Phase 04 |
| 9 | M13 — `pnpm test:iter` (`package.json:18`) does NOT prepend seed step → `computeCurrentHashes` reads fresh bytes vs stale baseline → cap blows on dirty worktree | High | Accept | Phase 03 |
| 10 | M8 — No test file exists for `meta-state-re-verify-tool.js`; Phase 03 ships `index_refreshed` field + best-effort skip with zero coverage | Medium | Accept | Phase 03 |
| 11 | M10 — Plan claims relationship-validate tests assert broad staleness to be narrowed; actually fixtures at `meta-state-relationship-validate-tool.test.js:13-35` have NO `evidence_code_ref` → age-only, not drift-affected | Medium | Accept | Phase 02 |
| 12 | M14 — re_verify success path writes to `file-index.jsonl` but doesn't log to `gate-log.jsonl` (unlike `meta_state_refresh_file_index`) → operators can't answer "who cleared drift on entry X?" | Medium | Accept | Phase 03 |
| 13 | M20 — `computeCurrentHashes` bare `catch {}` swallows FileNotFoundError, EACCES, EMFILE, EISDIR identically; no observability for permission errors | Medium | Accept | Phase 01 (return `{ok, skipped}` for caller-side logging) |
| 14 | M22 — Phase 02 Step 2.4 "5 test files need expectation updates" is fabricated risk — verified only `buildStaleDispatchHints` test changes | Medium | Accept | Phase 02 |
| 15 | M23 — Plan shows `computeDanglingRefs(refs, entries, signals)` signature but doesn't update caller `resolveDanglingRefs` (`meta-state-relationships-tool.js:206-210`) — new signature unreachable | Medium | Accept | Phase 02 |

### Folded into accepted findings (not in final table)
- Assumption F1 (`meta_state_query_drift` return shape) — wording fix in Phase 04 (use `check_grounding`)
- Assumption F4 (test count "14 passed") — wording fix in Phase 01
- Assumption F9 (upsert returns false on validation) — folded into M1+M14
- Assumption F11 (cross-reference unverifiable) — removed from plan
- Assumption F12 (purity boundary) — addressed by exporting helper
- Failure F7 (vitest worker cache) — duplicates M6
- Failure F8 (`.factory/hooks/` LOCAL copies) — addressed by M17
- Failure F9 (no rollback path) — addressed by M18
- Failure F10 (hand-crafted change-log id) — addressed by M19
- Failure F12 (codeHashes over terminal findings) — minor perf; deferred
- Security F8 (sweep perf) — documented in Phase 02 risk assessment
- Security F10 (derive-status drift-blindness) — explicit gap documented in plan § Constraints/risks

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-hash-aware-hasdrifted.md`, `phase-02-consumer-wiring.md`, `phase-03-cold-tier-cap-and-reverify-clear.md`, `phase-04-docs-and-closeout.md`
- Decision deltas checked: 15
- Reconciled stale references: 4
  - "path-presence" / "path-keyed-only" terminology: replaced with "hash-comparison" throughout
  - `isAbsolute(canonical) ? canonical : join(root, canonical)` (bypasses resolveSafePath): replaced with `resolveSafePath(root, canonical)` in Phase 01 + Phase 03
  - bare `catch { /* missing → no signal */ }` (silent error swallow): replaced with structured `skipped.push({ canonical, reason })` for caller logging
  - single `## Registry deltas` PR body section: replaced with six `## X entries` sections per CI advisory regex
- Phase 03 cap restructuring: the original Phase 7 cap (single age-only assertion at `<=16`) is superseded by the dual-assertion (age + drift) structure. Pre-fix test fixture at lines 99-106 needs full rewrite per Phase 03 Step 3.2 diff.
- Phase 02 consumer list expanded from 3 to 4 (`loop-introspect.js#buildStaleDispatchHints` added — RT: M7)
- Phase 02 test-update list reduced from 5 to 1 (`build-stale-dispatch-hints.test.js`) plus 3 NEW tests added — RT: M22
- Phase 03 introduces `refresh: true` schema arg (new), so the `meta-state-re-verify-tool.test.js` test file is added as a deliverable (RT: M8)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-07-16
**Trigger:** Post-red-team validation (`/ck:plan validate`). Red-team review surfaced material design changes (resolveSafePath routing, opt-in re_verify, dual cap, parity grep); user-selected validation to confirm operator-facing decisions before cook.
**Questions asked:** 4
**Mode:** prompt (3-8 questions)
**Tier:** Standard (4 phases) — Fact Checker + Contract Verifier already exercised by red-team reviewers (file:line citations on all 15 findings). No `[UNVERIFIED]` tags remain.

#### Questions & Answers

1. **[Tradeoffs]** `meta_state_re_verify` index-refresh default behavior?
   - Options: A) Opt-in: refresh:true default false (Recommended) | B) Always-on with explicit opt-out | C) Skip entirely — use meta_state_refresh_file_index instead
   - **Answer:** A) Opt-in: refresh:true default false (Recommended)
   - **Rationale:** Preserves existing behavior; consult-gate (`rule-no-orphaned-evidence`) cannot be silently bypassed. Operators wanting to clear drift use the explicit `refresh: true` arg or the audited `meta_state_refresh_file_index` path. Aligns with the finding's "make re_verify actually clear the drift signal" intent without introducing a new silent write side-effect. NO PLAN CHANGE.

2. **[Risks]** Cold-tier Phase 7 drift cap strictness?
   - Options: A) Strict: drift count must equal 0 (Recommended) | B) Slack: drift count <= 1 | C) Slack: drift count <= N (compute N from real sweep)
   - **Answer:** A) Strict: drift count must equal 0 (Recommended)
   - **Rationale:** Post-seed normalizes the index baseline to current bytes; any drift > 0 in CI indicates the predicate has regressed (e.g., back to path-presence). Strict cap catches regression loudly. Risk: test noise may push count above 0; mitigation is to fix the noise (e.g., exclude intentional drift fixtures via vitest skip). NO PLAN CHANGE.

3. **[Scope]** Scope of `.factory/hooks/` LOCAL-copy parity updates?
   - Options: A) In-PR: parity grep + update in same PR (Recommended) | B) Defer to follow-up plan | C) Document-only (no code change)
   - **Answer:** A) In-PR: parity grep + update in same PR (Recommended)
   - **Rationale:** Keeps docs consistent with shipped behavior; modest scope expansion (~3 LOCAL files likely affected: `.factory/hooks/loop-surface-inject.cjs`, possibly others). Reduces future drift between canonical and LOCAL copies. NO PLAN CHANGE (already specified in Phase 04).

4. **[Architecture]** Extend `derive_status` codeContext to inject `codeHashes`?
   - Options: A) Defer — document gap, no change (Recommended) | B) Extend in Phase 1 — update derive-status.js codeContext | C) Block on meta_state_derive_status redesign
   - **Answer:** B) Extend in Phase 1 — update derive-status.js codeContext
   - **Rationale:** Closes Sec F10 gap (Security finding flagged `derive_status` as permanently drift-blind). Adds ~30 lines to Phase 1: extend `codeContext` to accept `fileIndex` + `codeHashes`; thread through `isStaleView` at `derive-status.js:141`; update `meta-state-derive-status-tool.js` to build both maps. Drift-aware recommendations now flow through SP1 without requiring a separate `meta_state_check_grounding` call. **PLAN CHANGE: Phase 1 expanded.** Updated files: `core/derive-status.js`, `tools/handlers/meta-state-derive-status-tool.js`, `__tests__/legacy-mcp/derive-status.test.js`, `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js`.

#### Confirmed Decisions
- re_verify refresh is opt-in (default off) — preserves consult-gate integrity.
- Drift cap is strict (= 0) — maximizes regression sensitivity.
- LOCAL-copy parity is in-PR — keeps docs in sync at ship time.
- derive_status is extended in Phase 1 — closes Security F10 gap.

#### Action Items
- [x] Phase 1: add Step 1.4 for derive_status extension (codeContext, tool, tests). — DONE
- [x] Phase 1 Related Code Files: add 4 modify lines (derive-status.js + tool + 2 test files). — DONE
- [x] Phase 1 Success Criteria: replace "No consumer outside stale-view.js" with "Only derive-status.js + meta-state-derive-status-tool.js modified". — DONE
- [x] Phase 1 Risk Assessment: add derive_status regression risk + mitigation. — DONE
- [x] plan.md Constraints/risks: supersede "derive-status.js:141" gap note with Validation Q4 expansion note. — DONE
- [x] plan.md Phases table: update Phase 1 row to reflect 3 core files + 3 test files mutated. — DONE

#### Impact on Phases
- Phase 1: scope expanded (3 new modify lines + 1 new implementation step + 1 new risk + 1 success criterion updated). All other phases unchanged.
- Phase 2: NO CHANGE (already covers the 4 MCP-tool consumers via the helper).
- Phase 3: NO CHANGE.
- Phase 4: NO CHANGE.

### Whole-Plan Consistency Sweep (Post-Validation)
- Files reread: `plan.md`, `phase-01-hash-aware-hasdrifted.md`, `phase-02-consumer-wiring.md`, `phase-03-cold-tier-cap-and-reverify-clear.md`, `phase-04-docs-and-closeout.md`
- Decision deltas checked: 1 (Validation Q4 — derive_status extension)
- Reconciled stale references: 1
  - `plan.md` Constraints/risks: previous "derive-status.js:141 is intentionally age-only" note is now outdated; replaced with "supersedeed by Validation Q4. Post-Phase-1, codeContext accepts fileIndex + codeHashes; meta_state_derive_status tool builds both."
- Phase 1 row in phases table updated to reflect the expanded mutation set.
- Phase 1 Related Code Files: 4 new modify lines added.
- Phase 1 Implementation Steps: Step 1.4 added (derive_status extension).
- Phase 1 Success Criteria: 1 new criterion for derive_status coverage; 1 criterion updated (was "No consumer outside stale-view.js").
- Phase 1 Risk Assessment: 1 new risk (derive_status regression) + mitigation.
- Unresolved contradictions: 0

**Status:** Plan is **validated and ready for implementation**. Zero unresolved contradictions after the consistency sweep. All 15 red-team findings accepted and applied; 1 validation change (Q4) applied.
