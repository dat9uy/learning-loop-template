# Scout: Phase E Plan 3 (Housekeeping) — File inventory + edge case verification

**Date:** 2026-06-26 06:10
**Type:** scout (verification only — no plan authoring)
**For:** Plan 3 (`plans/260626-0607-phase-e-housekeeping/`)
**Source scope report:** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 6

## Task

Verify exact current state of files Plan 3 will touch + flag edge cases that may have been missed in the scope report.

## Findings

### E.4 (schema-descriptions.yaml)

- **Path:** `tools/learning-loop-mastra/core/schema-descriptions.yaml` (64 LoC)
- **Live importers in mastra tree:** **ZERO.** The only references to "schema-descriptions" / "schema-description-loader" are:
  - The file's own header comment (lines 8, 10) claiming it lives at `tools/learning-loop-mcp/core/schema-descriptions.yaml` and is read by `schema-description-loader.js` — **STALE** (both are stale; `tools/learning-loop-mcp/` was removed in plan 260613)
  - Historical references in `docs/journals/260604-phase-1-refactor-tool-files.md` and `plans/260603-field-coverage/plan.md` (frozen plan-time docs, not live consumers)
- **Loader `schema-description-loader.js`:** **Removed** in plan 260613 per `meta-state.jsonl` change-log at line 102
- **`tools/learning-loop-mcp/` directory:** Does **NOT** exist on disk (entire mcp tree was removed in plan 260613)
- **Test consumers:** None. `grep -rn "schema-descriptions" tools/learning-loop-mastra/__tests__/` returns 0 matches.
- **Recommended action:** **DELETE.** File is orphaned dead code with a stale header comment falsely claiming a sibling location. Deletion is safe; rewrite would mean authoring a 64-line YAML with no consumer.

### E.3 (legacy-pins.md + parity-pin label)

- **`docs/legacy-pins.md` does not exist** (expected — E.3 creates it; `tools/learning-loop-mastra/docs/` currently contains only `schemas.md`)
- **Existing "parity" mentions in `mastra/`:**
  - `mastra/workflows/workflow-storage-read.js:9,27` — `parity_records` SQL table (functional reference, NOT a pin annotation)
  - `mastra/workflows/workflow-storage-round-trip.js:10,18` — same storage table
  - `mastra/agents/build-meta-state-tools.js:5` — "parity-shim applied" (functional shim description)
  - `mastra/agents/load-agents-manifest.js:7,18` — references to `agent-parity.test.cjs` fixture path
- **Parity-test files in `mastra/workflows/` + `mastra/agents/`:** 0 test files co-located (parity test files live elsewhere: `storage-parity.test.cjs`, `agent-parity.test.cjs`, `mcp-tools-list-parity.test.js`, `schema-deletion-coverage.test.js`)
- **Important finding:** `workflow-intentional-skip.js` (named by scope report) has **no parity semantics**. The actual parity-pin surfaces are: `schema-parity.js`, `create-loop-{tool,workflow,agent}.js`, `build-meta-state-tools.js`. The scope report's wording "parity-test pin (not legacy)" implies a pin for a file that parity tests depend on — verify semantics during validation.

### E.2 (AGENTS.md §11)

- **Existing §11:** Lines 355–362, content: `## 11. What changed in this rewrite (2026-06-12)` (5-bullet change-log: Dropped / Reorganized / Added / Net effect)
- **Existing §11 line range:** 355 (header) through 362 (final bullet)
- **Other sections:** §1–§10 exist (10 total); §11 is the last section
- **No existing "Runtime interface ownership" section.** E.2 will insert a NEW §11 (Runtime interface ownership) and renumber the existing §11 → §12.
- **Numbering recommendation:** §11 = Runtime interface ownership, §12 = rewrite log (architectural contract comes before historical log).

### E.3 (workflow-intentional-skip.js label)

- **`export const workflowIntentionalSkip`** at line 47
- **Insertion point above export:** line 46 (currently blank)
- **Edge case:** workflow-intentional-skip.js has no parity semantics — pin label may be misleading. Either (a) skip this file from E.3's pin pass, or (b) use "parity-test pin" wording (pinned because parity tests depend on location) rather than parity-semantic pin.

### I-1 (core/README.md)

- **Line 26 current:** `- \`tools/learning-loop-mastra/create-loop-*.js\` (shell factories)`
- **Line 27 current:** `- Anything under \`tools/learning-loop-mastra/{workflows,agents,tools}/\``
- **Line 46 current:** `- **Mastra shell** (\`tools/learning-loop-mastra/\` top level) — the imperative shell`
- **All three reference pre-move paths.** After Plan 6 shell restructure the actual paths are `tools/learning-loop-mastra/mastra/{workflows,agents}/` and `create-loop-{tool,workflow,agent}.js` live under `tools/learning-loop-mastra/mastra/`.
- **Line 47 also affected:** `- **Runtime interface** (\`tools/learning-loop-mastra/interface/\`) — the contract (ships in Plan 2)` — the `interface/` path is correct post-Plan-2 so it does NOT need updating; only lines 26, 27, 46 do.

### I-1 (regression guard)

- **`FORBIDDEN_PATH_PATTERNS`:** 7 literal regex patterns (dots escaped with `\\.`), no globs:
  - `tools/learning-loop-mastra/server\\.js`
  - `tools/learning-loop-mastra/create-loop-tool\\.js`
  - `tools/learning-loop-mastra/create-loop-workflow\\.js`
  - `tools/learning-loop-mastra/create-loop-agent\\.js`
  - `tools/learning-loop-mastra/legacy-handler-adapter\\.js`
  - `tools/learning-loop-mastra/schema-parity\\.js`
  - `tools/learning-loop-mastra/schemas\\.js`
- **Missing glob coverage:** No pattern matches `create-loop-*.js` (glob-style reference). Plan 3 should add `tools/learning-loop-mastra/create-loop-.*\\.js` to catch glob references.
- **`SEARCH_PATHS` missing `core/`:** YES — `tools/learning-loop-mastra/core/` is NOT in the list. If E.4 deletes `core/schema-descriptions.yaml`, no regression test will detect external refs to it (in docs or other core files). Plan 3 should extend `SEARCH_PATHS` to include `tools/learning-loop-mastra/core/`.

### I-2 (META_STATE_VERIFY_EXEC env var)

- **Referenced at:**
  - `tools/learning-loop-mastra/tools/legacy/meta-state-re-verify-tool.js:14` (in tool description)
  - `tools/learning-loop-mastra/tools/legacy/meta-state-re-verify-tool.js:21` (gating check: `if (process.env.META_STATE_VERIFY_EXEC !== "1" && process.env.META_STATE_VERIFY_EXEC !== "true")`)
  - `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-stale-flag.test.js:24,35,133,181` (test setup/teardown)
- **Set in any settings file:** NO — `.claude/settings.json`, `.claude/settings.local.json`, `.factory/settings.json` do not contain `META_STATE_VERIFY_EXEC`. The env var is only set programmatically inside tests and is gated to default-off.
- **Implication for I-2:** The verification-runner (`tools/learning-loop-mastra/core/verification-runner.js`) gates the re-verify tool's side effects on the env var. I-2's verification approach must set `META_STATE_VERIFY_EXEC=1` BEFORE invoking `meta_state_re_verify`.

## Edge cases / risks surfaced

1. **E.4 has zero live importers but the header comment is misleading.** `schema-descriptions.yaml` claims it lives at `tools/learning-loop-mcp/core/schema-descriptions.yaml` and references `schema-description-loader.js`. Both are stale (mcp tree removed in plan 260613). **Direct delete is cleanest.** Historical journals correctly document this as a sidecar for the now-deleted mcp tree.

2. **E.3 parity-pin labels: not all "parity" mentions are parity pins.** `workflow-storage-read.js` / `workflow-storage-round-trip.js` reference a SQL TABLE named `parity_records` (storage substrate), not a parity-pin label. Pin labels belong on files where parity is the BEHAVIORAL contract: `schema-parity.js`, `create-loop-{tool,workflow,agent}.js`, `build-meta-state-tools.js`. **`workflow-intentional-skip.js` has no parity contract** — pin-or-not is a plan judgment call.

3. **E.2 numbering choice: §11 = runtime interface ownership vs §12.** Plan must decide whether to insert the new section before or after the existing §11 rewrite-log. **Recommend §11 = Runtime interface ownership, §12 = rewrite log** (architectural contract before historical log; matches §1-§10 convention).

4. **I-1 SEARCH_PATHS gap: `core/` is not scanned.** If E.4 deletes `schema-descriptions.yaml`, no regression test will detect external refs to it. Worth extending `SEARCH_PATHS` to include `tools/learning-loop-mastra/core/`. Same gap exists for any `core/` deletion in future plans.

5. **FORBIDDEN_PATH_PATTERNS does not include all pre-move paths.** Missing from the list: `tools/learning-loop-mastra/agents-manifest.json` (was top-level pre-Plan-6; now in `mastra/`), `tools/learning-loop-mastra/storage.js`, `tools/learning-loop-mastra/hooks/` (if such a dir existed pre-move). The test guards against the 7 listed patterns but is not exhaustive. For E.4 (schema-descriptions.yaml in `core/`), the FORBIDDEN_PATH_PATTERNS list does not even reference that path, so deletion is not gated by this test.

6. **`core/README.md` line 47 also has a stale sentence structure** (the `interface/` reference itself is correct post-Plan-2, but the surrounding prose is awkward). Verify before editing — may not need a change.

7. **Verification confirms `tools/learning-loop-mcp/` is fully gone.** This means E.4 cannot "verify against the original mcp-side copy" — the duplicate-at-mcp hypothesis is null. The file is a unique, orphaned artifact.

## Recommended scope refinements

| # | Refinement | Rationale |
|---|------------|-----------|
| R1 | E.4 = DELETE (not rewrite) | Zero live importers; cleanest fix |
| R2 | E.3 parity-pin label on `workflow-intentional-skip.js` uses "parity-test pin" wording | File has no parity semantics; pin = "parity tests depend on this file's location" |
| R3 | E.3 `legacy-pins.md` ALSO lists the 4 actual parity-semantic files (`schema-parity.js`, `create-loop-{tool,workflow,agent}.js`, `build-meta-state-tools.js`) | Documents the broader convention; legacy-pins.md is the canonical registry |
| R4 | E.2 new §11 BEFORE existing §11 (renumber existing to §12) | Architectural contract before historical log |
| R5 | I-1 extend FORBIDDEN_PATH_PATTERNS with `create-loop-.*\\.js` + `schema-descriptions\\.yaml` | Closes glob-style + future re-creation gaps |
| R6 | I-1 extend SEARCH_PATHS with `tools/learning-loop-mastra/core/` | Closes the regression guard gap that missed `core/README.md` lines 26/27/46 |
| R7 | I-2 explicitly set `META_STATE_VERIFY_EXEC=1` before invoking `meta_state_re_verify` | Env var is fail-closed; default OFF |

## Status

Status: DONE_WITH_CONCERNS
Summary: All 7 verification items checked. E.4 (`schema-descriptions.yaml`) has zero live importers and can be deleted; E.3 parity-pin pass should use "parity-test pin" wording for `workflow-intentional-skip.js` and also document the 4 actual parity-semantic files in `legacy-pins.md`; AGENTS.md §11 contains the rewrite log and must be renumbered when adding "Runtime interface ownership"; FORBIDDEN_PATH_PATTERNS uses literal regex with no globs and SEARCH_PATHS excludes `core/`.
Concerns: (1) `workflow-intentional-skip.js` pin assumption in scope report is incorrect — file has no parity semantics; (2) SEARCH_PATHS gap means core/ deletions are unguarded; (3) `core/README.md` line 47 may also need editing; (4) AGENTS.md §11 numbering decision (new §11 vs new §12) is left to the planner.

## Cross-references

- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 6 (lines 152, 696–715)
- Plan: `plans/260626-0607-phase-e-housekeeping/plan.md` (incorporates R1–R7 as design decisions D1–D9)
- Plan 6 (DONE): `plans/260626-0302-phase-e-shell-restructure/plan.md` (source of I-1 + I-2 code-review follow-ups)
- Plan 6 code review: `plans/260626-0302-phase-e-shell-restructure/reports/code-reviewer-260626-0534-GH-6-phase-e-plan-6-shell-restructure-report.md` (lines 64–94)
- Plan 1 (DONE): `plans/260624-2335-phase-e-foundation/plan.md` (3-layer architecture; FCIS invariant)