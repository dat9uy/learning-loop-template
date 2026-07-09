# Phase 1 Report — Drift-Driven Registry Closeout

**Plan:** `plans/260710-0104-drift-driven-registry-closeout/`
**Phase:** 1 (Verify & classify all 10 findings)
**Status:** complete
**Date:** 2026-07-10

## Baseline (before-state)

`meta_state_list({status: "open", compact: true})` returned **24 open entries**. The 10 plan findings are confirmed in that set. This is the `before` for Phase 4's delta.

## 10-row classify table

| # | full id | derived_status | manual_evidence_verdict | action | reason |
|---|---|---|---|---|---|
| 1 | `meta-260613T0138Z-vnstock-device-slot-ledger-converted` | resolved-by-mechanism | script exists at `scripts/convert-ledger-to-sidecar.mjs`; `runtime-state.jsonl` has 21 ledger events (grep `vnstock-device-slot`); script is idempotent | **RESOLVE** | conversion script shipped AND was executed (21 events in sidecar) |
| 2 | `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` | resolved-by-mechanism | `plans/260618-0029-coerce-layer-zod-native-migration/plan.md` ships (zod-native for 22 inputSchemas); `file-index.jsonl` has 36 paths including `tools/learning-loop-mastra/mastra/create-loop-tool.js`; `plans/260702-1933-fingerprint-file-index-migration/` establishes the path-keyed fingerprint index | **RESOLVE** | migration completed + SP2 grounding re-established via path-keyed fingerprint index |
| 3 | `meta-260619T2237Z-the-meta-state-report-mcp-tool-silently-overwrites-an-operat` | resolved-by-mechanism (false-positive) | `meta-state-report-tool.js:14-25` handler destructure has NO `id` parameter; `:28` does `const id = generateId(slugify(description))` — auto-generates + ignores caller-supplied id | **KEEP-OPEN (LIVE)** | bug observably live; finding's "honor the operator-supplied id or reject" demand unmet |
| 4 | `meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update` | resolved-by-mechanism (false-positive) | `manifest.json` is symptom-shaped; journal `docs/journals/260622-phase-d-plan-1b-shipped.md` confirms Path B (delete wrapper + new finding for upstream gap); wrapper irrecoverable without upstream Claude Code TaskUpdate change returning `{changed:bool}` | **KEEP-OPEN (symptom + upstream)** | wrapper deleted, upstream TaskUpdate structural gap; pending Claude Code CLI fix |
| 5 | `meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect` | resolved-by-mechanism | `docs/handoff.md` does NOT exist; `docs/_archive-260703/mcp-server-restart-protocol.md` contains the stale-code section (archived); `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` notes prior `last_verified_at=2026-06-26T07:35:50Z` | **RESOLVE** | stale-code section archived on 2026-07-03; no active handoff.md carries it |
| 6 | `meta-260704T1213Z-close-flow-finding-triage-operational-layer-has-a-structural` | resolved-by-mechanism (false-positive) | no `docs/transport-layer.md`; no `scripts/cli-adapter*`; no `tools/learning-loop-mastra/cli/`; `.mcp.json` exists but is the SYMPTOM (MCP is L3, no L1 seam) | **KEEP-OPEN (derivation-fooled + debate)** | `.mcp.json` fooled the file-existence gate; no L1 transport seam / CLI adapter / transport doc shipped |
| 7 | `meta-260709T1017Z-parallel-prs-that-each-commit-append-only-meta-state-jsonl-c` | resolved-by-mechanism (false-positive) | no `.gitattributes` file; no `merge=union` config anywhere; `.gitignore` is the SYMPTOM, not a fix | **KEEP-OPEN (derivation-fooled + debate)** | `.gitignore` fooled the file-existence gate; no `.gitattributes merge=union`, no post-merge-logging process, no PR-sequencing shipped |
| 8 | `meta-260619T2233Z-the-meta-state-log-change-mcp-tool-can-return-logged-true-an` | active-no-signal (false-negative) | `meta-state-log-change-tool.js:87` `await writeEntry(root, entry);` — return ignored; `:97-104` constructs `{logged:true,...}` unconditionally; `:105` `_idempotencyCache.set(cacheKey, result)` caches success; `:57-65` returns cached response on identical key within 60s | **KEEP-OPEN (LIVE)** | writeEntry return ignored; success response cached; no `evidence_test` cited |
| 9 | `meta-260626T1419Z-meta-state-supersede-silent-persistence-fail-var` | active-no-signal (false-negative) | `update-entry-helpers.js:20-33` `applyUpdateAndCheck` checks `updateResult === "version_mismatch"` or `updateResult !== true` (throw) — does NOT re-read registry to confirm post-write visibility; `meta-state-supersede-tool.js:54-58` returns `{superseded:true}` on `updateOutcome.ok` | **KEEP-OPEN (LIVE)** | return-value check only; finding's required post-write visibility re-read unmet; no `evidence_test` cited; root cause uninvestigated |
| 10 | `meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi` | active-uncertain | grep `unarchive` in `tools/learning-loop-mastra/` returned 0; no first-class `meta_state_unarchive` tool; **correction**: `IMMUTABLE_PATCH_FIELDS` does NOT include `archived_*` / `status` — the finding's "IMMUTABLE blocks archived_*" premise is stale; the real gap is the missing sanctioned tool | **KEEP-OPEN (LIVE, reason corrected)** | no first-class unarchive tool / no audit-safe recovery path; finding's premise is stale but the gap is real |

## Tally

- **RESOLVE candidates:** 3 (vnstock, SP2, handoff-md)
- **KEEP-OPEN:** 7 (report-overwrite, taskUpdate-noop, transport-L1, EOF-conflict, log_change, supersede, unarchive)

This matches the plan's expected outcome.

## Derive_status actual results

- **resolved-by-mechanism (7/10):** vnstock, SP2, report-overwrite, taskUpdate-noop, handoff-md, transport-L1, EOF-conflict — all `code_ref_exists: true`. Of these, **3 are genuine RESOLVE** (vnstock, SP2, handoff-md) and **4 are false-positives** (report-overwrite=handler-bug-LIVE, taskUpdate-noop=symptom+upstream, transport-L1=derivation-fooled, EOF-conflict=derivation-fooled).
- **active-uncertain (1/10):** unarchive — `code-only`, `test_file_exists: false` (dead `tools/learning-loop-mcp/__tests/` path); recommendation `no_action`.
- **active-no-signal (2/10):** log_change, supersede — `code-missing` (`code_ref_exists: false`); the `:line-range` suffix on `evidence_code_ref` breaks the existence check. recommendation `investigate`.

## Derive/drift implementation (for Phase 3's evidence_code_ref)

`tools/learning-loop-mastra/core/derive-status.js:107-112`:

```js
function computeKind(codeRefExists, testFileExists, codeRef, testPath) {
  if (codeRef === null && testPath === null) return "no-signals";
  if (codeRefExists === false) return "code-missing";
  if (testPath !== null && testFileExists === false) return "code-only";
  return "mechanism-shipped";
}
```

Pure file-existence gate. No content/semantic check. `code_ref_exists` uses `existsSync(fullPath)` after path-containment resolution (`:90-104`).

## Phase 2/3 input

- **Phase 2 RESOLVE list (3):** vnstock, SP2, handoff-md
- **Phase 3 KEEP-OPEN list (7):** report-overwrite, taskUpdate-noop, transport-L1, EOF-conflict, log_change, supersede, unarchive
- **Phase 3 evidence_code_ref target:** `tools/learning-loop-mastra/core/derive-status.js`