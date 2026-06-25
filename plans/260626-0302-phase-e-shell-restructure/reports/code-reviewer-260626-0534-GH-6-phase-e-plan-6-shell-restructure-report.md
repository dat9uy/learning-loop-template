# Code Review — Phase E Plan 6 (Mastra shell restructure)

**Date:** 2026-06-26
**Reviewer:** ck-code-review (Stage 1 + Stage 2)
**Target:** Commit `28e3618` on `phase-e/plan-6-shell-restructure`
**Plan:** `plans/260626-0302-phase-e-shell-restructure/plan.md`
**Scope:** 93 files changed, 810 insertions, 152 deletions

## Verdict

**APPROVE WITH FOLLOW-UPS**

The restructure is mechanically correct, scope-clean, and all 13 test namespaces pass (phase-e-shell-restructure 11/11 GREEN). Two follow-ups to track — one docs drift that the regression guard missed, one deferred acceptance criterion.

## Stage 1: Spec Compliance — PASS

All 17 plan acceptance criteria verified:

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | 11 file-groups moved to `mastra/` subdir | PASS | `ls tools/learning-loop-mastra/mastra/` shows all 7 shell files + 2 subdirs + 2 manifests |
| 2 | Top-level has no shell `*.js`/`*.cjs`/`*.mjs` (allowlist: `storage.js`, `agent-manifest.json`) | PASS | `find -maxdepth 1` returns only `storage.js` |
| 3 | 4 test files updated for `../mastra/workflows/` and `../mastra/agents/` relative imports | PASS | `test-relative-imports.test.js` GREEN |
| 4 | `.mcp.json`, `.factory/mcp.json`, `package.json:gate:server` point to `mastra/server.js` | PASS | grep shows new path in all 3 configs |
| 5 | `interface/contract.js:94` endsWith updated | PASS | line 94: `a.endsWith("tools/learning-loop-mastra/mastra/server.js")` |
| 6 | `interface/CONTRACT.md`, `README.md`, `RUNTIME_ONBOARDING.md`, `mcp-tool-schema-architecture.md`, `project-changelog.md` reference new path | PASS | grep confirms new paths |
| 7 | `AGENTS.md §1.1` says "Lives at `tools/learning-loop-mastra/mastra/`" | PASS | lines 20-22 |
| 8 | `AGENTS.md §1.1` has path-invariant sentence | PASS | lines 27-29 |
| 9 | `node interface/contract.js claude-code` returns `{ok: true}` | PASS | exit 0, `missing: []` |
| 10 | `node interface/contract.js droid` returns `{ok: true}` | PASS | exit 0, `missing: []` |
| 11 | `node interface/contract.js mastra-code` returns `{ok: false, missing: [4 items]}` | PASS | exit 1, `missing: [hook-shim-set, mcp-client-config, skill-spec, settings-integration]` |
| 12 | All existing tests pass (no regression) | PASS | 13 namespaces GREEN, suite `==> pass (13 globs, 26.22s)` |
| 13 | `pnpm test` GREEN across all 13 namespaces | PASS | confirmed via `node tools/scripts/run-pnpm-test-namespaced.mjs` |
| 14 | `meta_state_batch` repoint 9 entries; entry #6 preserves 3-schema array | PASS | `meta-state-fingerprints-repointed.test.js` GREEN; entry #6 verified contains all 3 schema refs |
| 15 | Entry #9 (`meta-260618T0558Z-post-migration-sp2-grounding-marker`) `meta_state_re_verify` → `active` | **DEFERRED** | Journal documents deferral; fingerprint remains grounded (verified by sha256sum match) |
| 16 | Cold-cache deleted, regenerated with new paths | PASS | `loop-describe-cold.json` exists (regenerated post-delete) with 25 post-move path strings, 0 stale |
| 17 | `meta_state_log_change` filed | PASS | entry id `meta-260626T0523Z-plans-260626-0302-phase-e-shell-restructure-plan-md` |
| 18 | Journal entry exists | PASS | `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md` (4202 bytes) |

## Stage 2: Code Quality — APPROVE

Verified clean by code-reviewer subagent:

1. **Move integrity**: `git log --follow` shows clean rename history. All 11 file-groups are renames (R records), not adds/drops.
2. **Internal cross-layer imports** (all 8 correct relative paths):
   - `mastra/server.js:12` → `../storage.js` ✓
   - `mastra/server.js:27` → `../tools/legacy/${...}` ✓
   - `mastra/create-loop-workflow.js:5` → `../core/envelope-stripper.js` ✓
   - `mastra/schemas.js:9-11` → `../tools/legacy/...` ✓
   - `mastra/agents/run-scout-tool.js:9` → `../../scout/legacy/run-scout.js` ✓
   - `mastra/agents/build-meta-state-tools.js:33` → `../../tools/manifest.json` ✓
   - `mastra/agents/build-meta-state-tools.js:38` → `../../tools/legacy/${...}` ✓
   - `mastra/workflows/workflow-{intake-plan,self-improvement}.js` → `../../core/envelope-stripper.js` ✓
   - `mastra/workflows/workflow-{storage-read,storage-round-trip}.js` → `../../storage.js` ✓
3. **Manifest contract**: `load-agents-manifest.js` correctly computes `MASTRA_ROOT` and `PACKAGE_ROOT` from new location. Both containment checks resolve to existing fixtures.
4. **Meta-state repoint**: All 9 entries' `evidence_code_ref` files exist. Entry #6's `applies_to.schemas` preserves all 3 schema refs (1 `mastra/` + 2 `learning-loop-mcp/`).
5. **AGENTS.md path-invariant**: Lines 27-29 correctly worded and reference the enforcing test.
6. **Interface contract**: `contract.js:94` endsWith updated; CONTRACT.md matches.
7. **Test runner**: 13th GLOB at line 43; header comment updated to "(12). Plan 6 adds phase-e-shell-restructure (total 13)."
8. **No hidden scope drift**: All diffs in moved files are pure path-swap; no logic edits, no new features, no dep updates.

## Findings

### Important (follow-up before next plan)

**I-1. Documentation drift in `core/README.md` (lines 26, 27, 46)**

Three lines in `tools/learning-loop-mastra/core/README.md` still reference pre-move paths/prose, contradicting AGENTS.md §1.1 path-invariant:

- Line 26: `- \`tools/learning-loop-mastra/create-loop-*.js\` (shell factories)` → should be `mastra/create-loop-*.js`
- Line 27: `- Anything under \`tools/learning-loop-mastra/{workflows,agents,tools}/\`` → should be `mastra/{workflows,agents}/` plus separate note for `tools/legacy/`
- Line 46: `- **Mastra shell** (\`tools/learning-loop-mastra/\` top level) — the imperative shell` → should reference `tools/learning-loop-mastra/mastra/`

Root cause: `external-refs-updated.test.js` SEARCH_PATHS list (lines 21-36) does not include `tools/learning-loop-mastra/core/`. Also, FORBIDDEN_PATH_PATTERNS use literal regex so the `create-loop-*.js` glob reference doesn't match.

Suggested fix:
1. Update `core/README.md` lines 26, 27, 46
2. Add `tools/learning-loop-mastra/core/` to regression guard's SEARCH_PATHS
3. Add `tools/learning-loop-mastra/create-loop-\*\\.js` glob pattern to FORBIDDEN_PATH_PATTERNS

Scope: only `core/README.md` is affected (other in-package READMEs `workflows/`, `agents/`, `tools/legacy/` don't exist). `interface/README.md` was correctly updated.

**I-2 (corrected). Entry #9 status transition deferred**

- **Fingerprint is grounded** (verified by sha256sum match against `tools/learning-loop-mastra/mastra/create-loop-tool.js`). The reviewer's initial concern about fingerprint drift was a false positive — `git mv` preserves file content, so the pre-move hash equals the post-move hash.
- **Status remains `stale`**: entry `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` was repointed (evidence_code_ref updated) but not transitioned to `active` via `meta_state_re_verify`.

Plan acceptance criterion #15 explicitly required this transition. Journal `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md` documents it as deferred ("What this plan did NOT ship (deferred)" section): "meta_state_re_verify for entry #9 — requires `META_STATE_VERIFY_EXEC=1` env var on MCP server."

Suggested action: operator either runs `meta_state_re_verify` with `META_STATE_VERIFY_EXEC=1` on the MCP server, OR amends acceptance criterion #15 to acknowledge the deferral in the plan. The fingerprint itself is fine.

### Minor (note only)

- **M-1**: `load-agents-manifest.js:18-22` comment "PACKAGE_ROOT" is ambiguous — resolves to `tools/learning-loop-mastra/` not `tools/`. Suggested rename to `TOOL_PACKAGE_ROOT`.
- **M-2**: `external-refs-updated.test.js` glob pattern limitation — covered by I-1.
- **M-3**: `shell-files-in-mastra-dir.test.js` checks manifest existence but not JSON shape. Low risk — content drift would be caught by other guards.

## Test Verification

```
[phase-e-shell-restructure] ==> pass
[interface-contract-tests] ==> pass
[suite] ==> pass (13 globs, 26.22s)
```

- 11/11 phase-e-shell-restructure guards GREEN
- 25/25 interface contract tests GREEN
- 0 failures across all 13 namespaces

## Recommendation

**APPROVE FOR MERGE** with two follow-up tasks:

1. **Fix I-1**: update `core/README.md` + extend regression guard (5-min patch)
2. **Decide I-2**: operator either unblocks entry #9's `meta_state_re_verify` or formally amends the plan's acceptance criterion #15

Both follow-ups are low-risk and can be tracked in a follow-up plan or in the next Phase E plan (e.g., Plan 3 housekeeping or Plan 5 hardening).