# Fix report — code-review findings for plans/260717-1826-unify-context-injection

**Status:** DONE • **Mode:** autonomous (operator-approved recommended order) • **Branch:** 260717-1826-unify-context-injection
**Input:** `plans/260717-1826-unify-context-injection/reports/code-review-260717-2016.md` (2 Critical, 8 Important, 7 Minor)

## Root causes fixed (all verified by pre-fix red / post-fix green)

| # | Root cause | Fix | Regression guard |
|---|---|---|---|
| C1 | TDD-cycle tests wrote hint-downgrade findings to the live registry; committed in e04c737 (4 junk lines, 2 duplicate ids) | Physical sweep of the 4 lines (backup at /tmp/meta-state-pre-c1-sweep.jsonl); git is the audit | MCP read confirms 0 entries; 132 lines parse |
| C2 | `resolveHint` indexed the shrinkable `buildProcessHints()` array with fixed registry-position maps → post-skip lookups returned the next entry's hint with this entry's suggestion | De-positionalized: resolution anchored to the fixed registry order via `findHintBySlug`/`listHints`; text via new shared `resolveHintText` (hint-registry.js); hint+suggestion from the SAME entry; skipped rule → explicit "unavailable" error; rules loaded once via `loadPromotedRules(resolveRoot())` (GATE_ROOT-testable, never cwd) | 4 new tests in loop-get-instruction.test.js (skip-fixture via temp GATE_ROOT): no-shift slug, no-shift numeric, unavailable error, tail key |
| I4 | `buildProcessHints()` loaded rules from `process.cwd()`; factory hook + loop_describe had correct roots in scope but called bare | Both call sites pass `rulesById` from already-loaded rules (factory: projectRoot-loaded; describe ×2: promotedRules) | New subprocess test: hook spawned with cwd=tempdir (no registry) still injects all 8 rule-derived markers — proven red pre-fix via stash |
| I3 | Dead `DISCOVERABILITY_HINTS`/`PROCESS_HINTS` consts (~9KB mirror) retained under false "test oracle" comments; byte-identity test was circular (two projections of the same live source) | Consts deleted; test re-scoped to renderer≡builder consistency with same rulesById; comments corrected | grep: zero `PROCESS_HINTS = Object.freeze` outside hint-registry.js (phase-02 criterion now met) |
| I5 | hint_text-required gate ran before the preview branch → `preview:true` on agent-checklist without hint_text rejected (documented preview contract broken) | Gate now `!preview &&`-guarded (parallel to session-mode gate) | 2 new tests: preview reaches preview branch; activation still rejected |
| I6 | `greedyPartition` forced oversized single hint through over budget, silently; docstring claimed all partitions fit | Oversized hint → own partition + warning (`hint "slug" exceeds charBudget`); docstrings corrected; `hint_text` has no max, so path is reachable | New oversize test (budget 200): warning fires, no content lost |
| I7 | CLI `--partition abc`/missing → `partitions[NaN]` TypeError, exit 1 (contract: exit 2); CLI mocked rulesById (`[mocked hint_text…]`) making "byte-exact" false for 8/10 process hints | Integer validation → exit 2; CLI loads real rules via `loadPromotedRules(process.cwd())`; main() async | New CLI tests: abc/1.5/flag-swallow/missing → exit 2; real hint_text rendered, no mock strings |
| I8 | Phantom renderer tests (unused loop var; "all hints" asserted without rulesById — 8/26 absent); CLI test header claimed nonexistent byte-equality assertions | Tests use `realRulesById()` from live registry; per-entry marker assertions over ALL 26; degraded mode (skip+warn) asserted explicitly; header corrected | 12 renderer + 13 CLI tests green; renderedMarker computes expectations independently |
| M4/M2 | Skip warning misattributed scope-filtered rules; unknown-channel return lacked `warnings` key | Warning text: "not in supplied rulesById (missing, inactive, or scope-filtered)"; unknown channel returns `warnings: ["unknown channel: …"]` | Covered by degraded-mode test |
| I1/M1 | docs/architecture.md claimed push surfaces "rendered by core/hint-renderer.js" (false — renderer consumed only by CLI/tests); stale comments in 4 files | Operator decision (2026-07-17): renderer = inspection tooling, builders = injection path. Docs section rewritten to that reality; headers in hint-renderer.js / hint-registry.js / loop-introspect.js / factory hook aligned | check_runtime_agnostic: 6/6 pass |

Reviewer-pass minors also fixed: mcp-warm docstring (claimed loop_describe consumes the channel — false), stale `DISCOVERABILITY_HINTS` comment in loop-describe-tool.js, self-contradictory row-range comment in hint-registry.js, divergent-cwd test now covers all 8 rule-derived markers.

Accepted (documented, no action): `.claude` universal hooks keep the cwd-fallback `buildProcessHints()` — Claude Code guarantees cwd=project root; fallback documented in the builder JSDoc. `hint_text` zod `.min(20)` duplicate of handler check left as-is (schema-level shape guard).

## Fingerprint re-grounding (drift accepted for edited, cited files)

4 paths refreshed via `meta_state_refresh_file_index` with per-path reasons (gate-log audit): loop-introspect.js (3 findings), loop-describe-tool.js (1), .factory/hooks/loop-surface-inject.cjs (1), meta-state-promote-rule-tool.js (1).

## Verification

- `pnpm test:iter`: **2229 tests / 449 suites green** (was 2218/448 pre-review; +11 net new regression tests, +1 suite).
- Independent code-reviewer subagent on the fix diff: **DONE_WITH_CONCERNS, 0 Critical / 0 Important** (5 minors — 4 fixed, 1 accepted/documented). Numeric contract verified empirically 0–25, 26→unknown; C1 sweep verified line-exact; no scope creep (16 files + report).
- Pre-fix red proofs: C2 unavailable-path test, I4 divergent-cwd subprocess test (via stash), I5 preview-rejection trace, I7 exit-1 trace.

## PR-body registry deltas (rule-pr-body-registry-deltas — apply when opening the PR)

```
(a) sweep entries by id+reason:
    - meta-260717T1915Z-hint-downgrade (×2 lines): test pollution (session_ids test-summary-001, test-session-abc) — removed by physical sweep
    - meta-260717T1917Z-hint-downgrade (×2 lines): test pollution (session_ids test-summary-tier-x, test-summary-001) — removed by physical sweep

(b) resolved entries by id+resolution note:
    - meta-260715T2300Z-runtime-context-injection-is-fragmented-across-overlapping-s:
      "Resolved by plans/260717-1826-unify-context-injection (Phase 1-4). Reference change-log: meta-260717T2006Z."

(c) new entries by id+initial status:
    - meta-260717T2006Z-tools-learning-loop-mastra-core-hint-registry-js (change-log, status=active, change_dimension=surface)

(d) promoted rules by finding_id+rule_id:
    (none)

(e) superseded/archived entries by id+target:
    (none)

Patched rule entries (Phase-3 hint_text backfill, verified byte-identical to pre-Phase-3 PROCESS_HINTS rows):
    rule-pr-body-registry-deltas, rule-runtime-agnostic-features, rule-tool-integration-same-commit-dep,
    rule-fallow-brief-on-gate-failure, rule-short-slug-for-risk-records,
    rule-import-chain-analysis-after-tool-deletion, rule-assertinvariant-at-boundary,
    rule-required-status-checks-verify-combined-status
```

## Unresolved questions

1. Phase-3 backfill's MCP `meta_state_patch` "Invalid input" was never root-caused (journal guessed session-mode gate; the same error appears in-test as a negative-path fixture — more likely a stale long-running MCP server schema pre-restart). Benign; data verified correct.
2. `scope_predicate` filtering also governs injection (a root without `.mcp.json` drops 3 scoped rules → 3 hints vanish). Intended? Currently undocumented; warning text now names scope-filtering as a possible cause.
