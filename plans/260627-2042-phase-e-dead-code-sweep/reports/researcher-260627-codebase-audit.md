# Core/ Codebase Audit — Dead-Code Triage

**Audit date:** 2026-06-27
**Branch:** `260627-1304-phase-e-mechanism-a-b-plan`
**Scope:** every `.js` file under `tools/learning-loop-mastra/core/`

## 1. Headline findings

- **`listProbes` (core/list-probes.js) is confirmed dead in production.** Zero non-test import sites. Only consumer is `__tests__/legacy-mcp/list-probes.test.js` (3 calls, all in test cases).
- **The manifest path "bug" is not a bug.** `tools/manifest.json` paths like `tools/gate-tool.js` are resolved by the loader at `mastra/server.js:26-27` via `` `../tools/legacy/${file.replace('tools/', '')}` ``. No symlinks; no missing files.
- **Two TEST-ONLY deletion candidates:** `core/list-probes.js` and `core/lib/source-ref-validator.js`.
- **No ORPHAN files** in core/. Every file is either LIVE (production consumer) or TEST-ONLY.
- **No DOC-ONLY files** — every placement-manifest row maps to a real consumer (live or test).
- **Fallow is an external CLI tool.** `.fallow/` directories contain binary caches (`cache.bin`, `churn.bin`); there is no in-repo `.fallowrc.json` or `fallow.config.js`.

## 2. Manifest path "bug" — resolution

`mastra/server.js:26-27`:
```js
for (const { file, export: exportName } of MANIFEST) {
  const mod = await import(`../tools/legacy/${file.replace('tools/', '')}`);
```

The `tools/` prefix is stripped and `legacy/` prepended, so `tools/gate-tool.js` resolves to `tools/legacy/gate-tool.js`. Verified: no symlinks at `tools/*.js`, no shim. The legacy-mcp test suite asserts this behavior. **Not a bug** — undocumented convention.

**Action:** add a one-line comment to `tools/manifest.json` explaining the rewrite convention. Prevents future confusion.

## 3. `listProbes` consumer trace

| Site | File:line | Kind |
|---|---|---|
| Export | `core/list-probes.js:10` | Definition |
| Test import | `__tests__/legacy-mcp/list-probes.test.js:6` | Test only |
| Test calls | `__tests__/legacy-mcp/list-probes.test.js:14,27,39` | Test only |

**Zero production imports.** The placement manifest at `core/placement.yaml:96-98` is the only doc reference. Function scans `product/<stack>/capabilities/*.py` — no `product/` directory exists in this template.

## 4. Classification table

Path = relative to `tools/learning-loop-mastra/`. **TEST-ONLY rows are at the bottom for triage.**

### LIVE (production consumer present)

| File path | Production consumers (excerpt) | Class |
|---|---|---|
| `core/check-grounding.js` | `tools/legacy/meta-state-check-grounding-tool.js:5`, `meta-state-refresh-fingerprint-tool.js:3` | LIVE |
| `core/consistency-check.js` | `tools/legacy/meta-state-consistency-check-tool.js:12` | LIVE |
| `core/derive-status.js` | `tools/legacy/meta-state-derive-status-tool.js:6` | LIVE |
| `core/envelope-stripper.js` | `mastra/create-loop-workflow.js:5`, `mastra/workflows/{workflow-intake-plan,workflow-self-improvement}.js:3`, plus 9 tools under `tools/legacy/` | LIVE |
| `core/file-readers.js` | `hooks/legacy/{bash-gate,inbound-gate}.js`, `tools/legacy/gate-tool.js` | LIVE |
| `core/gate-decision-log.js` | `hooks/legacy/bash-gate.js:29` | LIVE |
| `core/gate-logic.js` | 8+ consumers in `hooks/legacy/` + `tools/legacy/` + `tools/legacy/scripts/` | LIVE |
| `core/gate-override.js` | `tools/legacy/gate-override-tool.js:2` | LIVE |
| `core/inbound-state.js` | `hooks/legacy/bash-gate.js:28`, `tools/legacy/{gate-tool,notify-artifact-tool}.js` | LIVE |
| `core/loop-introspect.js` | `tools/legacy/{loop-describe-tool,loop-get-instruction-tool,meta-state-list-tool,meta-state-relationships-tool,meta-state-sweep-tool}.js` | LIVE |
| `core/loop-introspect-cache.js` | `tools/legacy/loop-describe-tool.js:5` | LIVE |
| `core/meta-state.js` | 17+ legacy tools + 2 `tools/legacy/scripts/*.mjs` (largest core file) | LIVE |
| `core/query-drift.js` | `tools/legacy/meta-state-query-drift-tool.js:5` | LIVE |
| `core/read-registry-cache.js` | transitive via `readRegistry()` in `core/meta-state.js` | LIVE (transitive) |
| `core/recurrence-tracker.js` | `hooks/legacy/recurrence-check-on-start.js:10`, `tools/legacy/gate-check-recurrence-tool.js:2` | LIVE |
| `core/runtime-agnostic-checklist.js` | `tools/legacy/check-runtime-agnostic-tool.js:5` | LIVE |
| `core/slugify.js` | `tools/legacy/{meta-state-log-change-tool,meta-state-propose-design-tool,meta-state-report-tool}.js` | LIVE |
| `core/strict-boolean-guard.js` | `mastra/create-loop-workflow.js` + 6 tools under `tools/legacy/` | LIVE |
| `core/surfaces.js` | transitive via `core/meta-state.js` (verify before deletion) | LIVE (transitive — needs verification) |
| `core/verification-runner.js` | `tools/legacy/meta-state-check-grounding-tool.js:7`, `meta-state-re-verify-tool.js:6` | LIVE |
| `core/workflow-registry.js` | `tools/legacy/{trigger-workflow-tool,notify-artifact-tool}.js` | LIVE |
| `core/entry/index.js` | `tools/legacy/meta-state-relationships-tool.js:3` | LIVE |
| `core/entry/finding.js` | transitive via `core/entry/index.js` (factory dispatcher) | LIVE (transitive) |
| `core/entry/rule.js` | transitive via `core/entry/index.js` | LIVE (transitive) |
| `core/entry/change-log.js` | transitive via `core/entry/index.js` | LIVE (transitive) |
| `core/entry/loop-design.js` | transitive via `core/entry/index.js` | LIVE (transitive) |
| `core/entry/deep-freeze.js` | transitive via 5 siblings in `core/entry/` | LIVE (transitive) |

### TEST-ONLY (deletion candidates)

| File path | Test consumers | Doc refs | Class |
|---|---|---|---|
| `core/list-probes.js` | `__tests__/legacy-mcp/list-probes.test.js` | `placement.yaml:96-98` only | **TEST-ONLY** |
| `core/lib/source-ref-validator.js` | `core/lib/source-ref-validator.test.js` (24 tests); referenced as string by 2 legacy-mcp tests | (none — not in placement.yaml, not in docs/placement.md) | **TEST-ONLY** |

### DOC-ONLY / ORPHAN

**None.** Every file is LIVE or TEST-ONLY.

## 5. TEST-ONLY file deletion triage

### High-confidence: `core/list-probes.js`
- 0 production consumers (verified via `rg "from ['\"].*core/list-probes\.js['\"]"`).
- 1 test file (`__tests__/legacy-mcp/list-probes.test.js`) that exercises the function directly with synthetic `product/<stack>/capabilities/` dirs.
- No `product/` directory exists in this template repo.
- placement.yaml row (lines 96-98) must be removed alongside the file.
- Delete: `core/list-probes.js` + `__tests__/legacy-mcp/list-probes.test.js` + placement.yaml rows 96-98.

### High-confidence: `core/lib/source-ref-validator.js`
- 0 production consumers (verified via grep).
- Has its own test file `core/lib/source-ref-validator.test.js` (24 tests).
- File is **not in `core/placement.yaml`** and **not in `docs/placement.md`** — was added before the placement manifest existed and never retro-fitted.
- Comment at line 3: "Reuses existing validation functions from `../record-validation-rules.js`" — suggests extraction from record-validation-rules but no caller updated.
- Delete: `core/lib/source-ref-validator.js` + `core/lib/source-ref-validator.test.js`.

## 6. Surprises / non-classified findings

1. **`.fallow/` directories** at `.fallow/` and `tools/learning-loop-mastra/.fallow/` contain only binary caches (`cache.bin`, `churn.bin`). **These are state caches for the external `fallow` CLI**, not config. No `.fallowrc.json`, `fallow.config.js`, or `.fallowrc` exists anywhere (verified via `find -maxdepth 6`). Fallow is invoked per `plans/260613-1530-stale-fixture-and-dead-code-resolution/phase-04-fallow-health-triage.md`.

2. **Scout fixture references core/ modules only as string metadata**, not as code consumers. `scout/legacy/fixtures/scout-output.json` contains ~80 entries with `bucket_reason: "imports bypass function from core/meta-state.js at line N"` — these reference the OLD `tools/learning-loop-mcp/` paths (note `-mcp` not `-mastra`). The fixture pre-dates the mastra shell restructure; it's the input to `scout-run-scout` tests. Stale but functional test fixture.

3. **`core/__tests__/` directory placement is irregular.** Three test files live at `core/__tests__/{consistency-check,meta-state-g8-supersede,meta-state-superseded}.test.js` while every other test file is co-located as `*.test.js` next to the source. Inconsistent with the colocated-test pattern but not within audit scope.

4. **Manifest path convention is undocumented at the manifest itself.** `tools/manifest.json` has no comment explaining the `tools/` → `legacy/` rewrite. Adding a one-line comment would prevent future confusion.

5. **`tools/legacy/scripts/` exists.** Two scripts (`backfill-mechanism-check.mjs`, `fix-loop-design-refs.mjs`) import core/ — they appear to be one-shot migration scripts with corresponding legacy-mcp tests but are not invoked at server startup.

## 7. Limitations

- Did not trace every indirect consumer transitively (e.g., `core/surfaces.js` callers were not exhaustively grepped — flagged for verification).
- Did not run `npm test` or any test suite — static-source audit only.
- Did not verify whether `core/entry/*.js` schemas are called outside `core/entry/index.js` (factory dispatcher is the only public consumer; classified LIVE on that basis).

## 8. Recommended next steps

1. **Delete `core/list-probes.js`** + `__tests__/legacy-mcp/list-probes.test.js` + placement.yaml rows 96-98. Safe.
2. **Delete `core/lib/source-ref-validator.js`** + `core/lib/source-ref-validator.test.js`. Safe.
3. **Add a comment to `tools/manifest.json`** explaining the `tools/` → `legacy/` rewrite convention.
4. **Verify `core/surfaces.js`** — if its `SURFACES` constant is only consumed by tests, reclassify TEST-ONLY.
5. **Verify `core/read-registry-cache.js`** — confirm transitive use from `readRegistry()` is real.
6. **Leave the 4 entry/ factory files** alone despite transitive-only use — they are the canonical graph API per Mechanism B plan; deletion would regress.
7. **Leave `core/entry/deep-freeze.js`** alone — 5 transitive consumers; canonical soft-inversion helper.

## 9. Triage table for the task tracker

The following rows become the initial `tasks.md` triage table for Phase 03:

| # | File | Class | Action | Doc updates needed |
|---|---|---|---|---|
| 1 | `core/list-probes.js` | TEST-ONLY | Delete | placement.yaml:96-98; docs/placement.md "helper" row |
| 2 | `__tests__/legacy-mcp/list-probes.test.js` | TEST-ONLY | Delete | none |
| 3 | `core/lib/source-ref-validator.js` | TEST-ONLY | Delete | none (not in manifest) |
| 4 | `core/lib/source-ref-validator.test.js` | TEST-ONLY | Delete | none |
| 5 | `tools/manifest.json` | LIVE | Add comment | Add 1-line comment about `tools/` → `legacy/` rewrite |
| 6 | `core/surfaces.js` | LIVE (verify) | Verify transitive use | none if verified |
| 7 | `core/read-registry-cache.js` | LIVE (verify) | Verify transitive use | none if verified |