# Drift-Driven Registry Closeout — Final Report

**Plan:** `plans/260710-0104-drift-driven-registry-closeout/`
**Branch:** `plan/drift-driven-registry-closeout`
**Date:** 2026-07-10
**Status:** complete (all 4 phases shipped)

## Summary

Resolved **3** findings whose shipped mechanism genuinely fixed them; kept **7** open with recorded reasons; reported **1** new derivation-flaw finding that explains why `derive_status` misled the operator on 4 of the 7 holds. Net open count: 24 → 22 (delta = -2, matches expected `-3 resolved + 1 new`).

## Counts

| metric | value |
|---|---|
| baseline open count | 24 |
| resolved this closeout | 3 |
| new findings reported | 1 |
| keep-open (description patched) | 7 |
| after-state open count | 22 |
| expected delta | -2 (verified: 24 - 3 + 1 = 22) ✓ |
| expected stale-view delta | -3 (matches: 3 resolved leave `isOpen`) ✓ |

## Resolved (3) — confirmed shipped via code/journal reads

| id | mechanism | evidence |
|---|---|---|
| `meta-260613T0138Z-vnstock-device-slot-ledger-converted` | `scripts/convert-ledger-to-sidecar.mjs` shipped + executed | 21 ledger events in `runtime-state.jsonl`; script idempotent |
| `meta-260618T0558Z-post-migration-sp2-grounding-marker-…` | Zod-native migration (plan 260618-0029) + SP2 grounding re-established (plan 260702-1933) | `file-index.jsonl` has 36 paths including `tools/learning-loop-mastra/mastra/create-loop-tool.js` |
| `meta-260609T1206Z-handoff-md-the-…stale-code-sect` | Stale-code section archived | `docs/_archive-260703/mcp-server-restart-protocol.md`; no active `docs/handoff.md` carries the section |

## Kept open (7) — each with class + reason

| class | id | reason |
|---|---|---|
| LIVE (red-team) | `meta-260619T2237Z-…silently-overwrites-…` | handler `:14-25` no `id` in destructure; `:28` `generateId(slugify(description))` ignores caller id. Live demonstration: derivation-flaw finding filed with caller id `meta-260710T0138Z-…` was auto-slugified to `meta-260710T0141Z-…` |
| symptom + upstream | `meta-260623T0223Z-…task-update` | `manifest.json` is symptom-shaped; journal `260622-phase-d-plan-1b-shipped.md` confirms Path B; wrapper irrecoverable without upstream Claude Code `TaskUpdate` returning `{changed:bool}` |
| derivation-fooled + debate | `meta-260704T1213Z-…transport-not-l1` | `.mcp.json` fooled `mechanism-shipped`; no `docs/transport-layer.md`, no `scripts/cli-adapter*`, no `tools/learning-loop-mastra/cli/` |
| derivation-fooled + debate | `meta-260709T1017Z-…append-only-eof-merge-conflict` | `.gitignore` fooled `mechanism-shipped`; no `.gitattributes`, no `merge=union` |
| LIVE (escalate) | `meta-260619T2233Z-…log-change-…logged-true-an` | `meta-state-log-change-tool.js:87` ignores `writeEntry` return; `:97-104` unconditional `{logged:true}`; `:105` idempotency cache caches success; `:57-65` returns cached response. Derivation false-negative (`:line-range` suffix on `evidence_code_ref`); bug observably live |
| LIVE (escalate) | `meta-260626T1419Z-…supersede-silent-persistence-fail-var` | `applyUpdateAndCheck` (`core/update-entry-helpers.js:20-33`, PR #38) checks `updateResult` only — does NOT re-read registry to confirm post-write visibility. `meta-state-supersede-tool.js:54-58` returns `{superseded:true}` on `updateOutcome.ok`. No `evidence_test`; root cause uninvestigated |
| LIVE (escalate, reason corrected) | `meta-260614T1236Z-…unarchive-…` | grep `unarchive` in `tools/learning-loop-mastra/` = 0; no first-class `meta_state_unarchive` tool. **Correction:** `IMMUTABLE_PATCH_FIELDS` does NOT include `archived_*`/`status` (verified `meta-state.js:284-294`); finding's "IMMUTABLE blocks" premise is stale; the gap is the missing sanctioned tool. `evidence_test` path `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` is a dead reference |

## New finding reported (1)

| id | category | severity | one-liner |
|---|---|---|---|
| `meta-260710T0141Z-meta-state-derive-status-s-mechanism-shipped-derivation-is` | loop-anti-pattern / derivation-flaw | warning | `derive_status` `mechanism-shipped` gates on file-existence only (no content/semantic check) — false-positives on symptom files (`.mcp.json`/`.gitignore`/`manifest.json`); `:line-range` suffix on `evidence_code_ref` false-negatives to `code-missing`. Add content-match or `test_passed` signal to `computeKind` |

**Accurate framing (not "all 10 / 7/10 false-positive"):** only 7/10 derive `resolved-by-mechanism`; the 3 escalates derive correctly non-resolved. The flaw is the file-existence gate, not the count.

## Closeout change-log

`meta_state_log_change` filed:
- id: `meta-260710T0152Z-meta-state-jsonl`
- `change_diff`: `{added:[1], removed:[3], changed:[7]}` — schema-valid keys retained (NOT stripped)
- `reason`: full delta + roadmap statement
- persisted cleanly (verified via re-query)

## PR registry-deltas table (for `rule-pr-body-registry-deltas`)

```markdown
## Registry Deltas

| operation | count | ids |
|---|---|---|
| **Swept** | 0 | (none) |
| **Resolved** | 3 | meta-260613T0138Z-vnstock-device-slot-ledger-converted, meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop, meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect |
| **New findings** | 1 | meta-260710T0141Z-meta-state-derive-status-s-mechanism-shipped-derivation-is |
| **Promoted** | 0 | (none) |
| **Superseded** | 0 | (none) |
| **Archived** | 0 | (none) |
| **Patched (description-only)** | 7 | meta-260619T2237Z-the-meta-state-report-mcp-tool-silently-overwrites-an-operat, meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update, meta-260704T1213Z-close-flow-finding-triage-operational-layer-has-a-structural, meta-260709T1017Z-parallel-prs-that-each-commit-append-only-meta-state-jsonl-c, meta-260619T2233Z-the-meta-state-log-change-mcp-tool-can-return-logged-true-an, meta-260626T1419Z-meta-state-supersede-silent-persistence-fail-var, meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi |
| **Change-logs filed** | 1 | meta-260710T0152Z-meta-state-jsonl (closeout) |

**Open count:** 24 → 22 (delta = -2; expected `-3 + 1`)

**Open-delta math:** `-(resolved) + new_findings = -3 + 1 = -2` ✓
**Stale-view delta:** `-(resolved) = -3` ✓ (resolved findings leave `isOpen`)
```

## Roadmap statement (the key deliverable)

> **Transport-L1 (`meta-260704T1213Z-…transport-not-l1`) is STILL OPEN.** It is a live architectural debate, not a resolved bug. The close-flow/finding-triage symptom traces to a missing L1 transport seam: core meta-state operations (report/log_change/resolve/refresh_file_index/dispatch/supersede) are implemented as MCP tools (L3) with no Core-function (L1) interface behind a transport adapter. `derive_status` reported `resolved-by-mechanism` because `evidence_code_ref` (`.mcp.json`) exists — but `.mcp.json` is the *symptom* (the wrong-root mechanism), not a fix. No CLI adapter (mirroring `gate-self-verify.mjs`), no `docs/transport-layer.md`, no Core refactor shipped. Resolution is a **separate plan** (promote transport to L1 + ship a CLI adapter); this closeout keeps it open and records the derivation mislead.
>
> The EOF-merge-conflict (`meta-260709T1017Z-…append-only-eof-merge-conflict`) is likewise **STILL OPEN** — `.gitignore` existence fooled the same derivation; mitigations are the M2 single-writer-gate debate (`meta-260708T0355Z-m2-single-writer-gate`), none shipped.
>
> **Five findings remain open as LIVE bugs**, each warranting its own fix plan (not scope-crept into this closeout): `meta-260619T2233Z` log_change silent-persistence-fail; `meta-260626T1419Z` supersede silent-persistence-fail; `meta-260614T1236Z` unarchive-path-missing; `meta-260619T2237Z` report-overwrite id-ignored (found by red-team); `meta-260623T0223Z` taskUpdate-noop (symptom-evidence + likely upstream, pending journal). The unarchive finding's "IMMUTABLE blocks archived_*" premise is itself stale (the set does not include archived_*/status); its real gap is the missing first-class unarchive tool.

## Risk surface — what we did NOT do

- No code changes (pure registry hygiene via MCP tools).
- No `last_verified_at` stamps on live findings (we confirmed a *failing*/live state, not a pass).
- No status flips on KEEP-OPEN findings.
- No rule overrides to force-close anything.
- No fake re-grounding.
- No consultation of `rule-cold-session-test-must-pass-before-resolution` (it targets a different finding, not in this closeout).

## Acceptance criteria — verification

| # | criterion | status |
|---|---|---|
| 1 | Every finding classified RESOLVE/KEEP-OPEN with code-evidence reason | ✓ Phase 1 table |
| 2 | No finding resolved blindly; 7 keep-open recorded | ✓ Phase 1 + 3 |
| 3 | Group-R resolves only after Phase 1 evidence confirmation | ✓ 3 of 5 candidates confirmed (vnstock/SP2/handoff-md); 2 demoted to KEEP-OPEN (report-overwrite=LIVE; taskUpdate-noop=symptom) |
| 4 | Derivation-flaw reported with accurate description (file-existence gate; symptom false-positive; line-suffix false-negative; NO "all 10" overclaim) | ✓ new finding `meta-260710T0141Z-…` |
| 5 | Closeout `meta_state_log_change` with schema-valid `change_diff` | ✓ `meta-260710T0152Z-meta-state-jsonl` (verified re-query) |
| 6 | Open-count delta = -(resolved) + new_findings; pre-stated expected values | ✓ 24 → 22 = -3 + 1 = -2; matches `expected_open_delta = -(N) + new_n` |
| 7 | PR body includes `rule-pr-body-registry-deltas` table | ✓ table produced above |

## Silent-persistence-fail checks

| operation | call | re-query | verdict |
|---|---|---|---|
| Resolve vnstock | `resolved: true` | `status: resolved, version: 14` | persisted ✓ |
| Resolve SP2 | `resolved: true` | `status: resolved, version: 23` | persisted ✓ |
| Resolve handoff-md | `resolved: true` | `status: resolved, version: 19` | persisted ✓ |
| Batch 6 description patches | `applied: 6` | transport-L1 verified (description appended, status preserved) | persisted ✓ |
| Report derivation-flaw | `reported: true` | entry exists with `status: open` | persisted ✓ |
| Closeout change-log | `logged: true, cache_hit: false` | entry exists with `status: active`, `change_diff` retained | persisted ✓ |

**No silent-persistence-fail fires this closeout.** The 3 resolves and the change-log all confirm on re-query. The `meta_state_resolve` / `meta_state_log_change` LIVE bugs (`meta-260619T2233Z` / `meta-260626T1419Z`) are kept open as a separate concern.

## Phase reports

- Phase 1: `plans/reports/260710-0136-drift-driven-registry-closeout-phase-01-report.md`
- Phase 2/3/4: this report (consolidated closeout)

## Branch state

- Working tree: clean registry mutations only
- Uncommitted: meta-state.jsonl (3 status flips + 7 description appends + 1 new finding + 1 change-log)
- No source code changes
- PR not opened (this is the registry-hygiene payload; the PR body is ready in this report's PR registry-deltas section)
