# Recovery: amend PR #22 with SARIF `automationDetails.id` patch

Closes/Supercedes #22. The first CI run on PR #22 (run 28395140914) failed with:

> The CodeQL Action does not support uploading multiple SARIF runs with the same category.

## Root cause (now corrected)

`codeql-action/upload-sarif@v4`'s `areAllRunsUnique` validator builds its `createRunKey` from `run.tool.driver.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails.id` — `category` is **not** a key field. Fallow's `build_audit_sarif` in `crates/api/src/audit_output.rs` emits 2–3 runs that collide on those 6 fields: the dead-code and health runs lack `automationDetails.id` (only `build_audit_duplication_sarif_run` sets it, on the dupes run).

Verified at source:
- `github/codeql-action/src/sarif/index.ts:102-109` — `createRunKey` definition
- `github/codeql-action/src/sarif/index.ts:118-135` — `areAllRunsUnique` consumes the key
- `fallow-rs/fallow/crates/api/src/audit_output.rs::build_audit_sarif` — verbatim passthrough of runs without `automationDetails.id`

## Fix (this PR)

| Step | Change |
|------|--------|
| `.github/workflows/test.yml` | `sarif: true` → `sarif: false` (Action's built-in upload disabled) |
| `.github/workflows/test.yml` | `id: analyze` added so `steps.analyze.outputs.sarif` resolves |
| `.github/workflows/test.yml` | Inline jq patch step rewrites `runs[i].automationDetails.id` on runs where it's null (classifier based on `rules[0].id` prefix: unused/private → dead-code, high/low/long/duplicated → health, else → dupes fallback) |
| `.github/workflows/test.yml` | 1 explicit `codeql-action/upload-sarif@v4` call (SHA-pinned to `411bbbe57033eedfc1a82d68c01345aa96c737d7`), `category: fallow`, `sarif_file: fallow-results-patched.sarif` |
| `.github/workflows/test.yml` | Failure-upload step path updated to `fallow-results-patched.sarif` |

## Tests

- Updated `T7` (exactly 1 `codeql-action/upload-sarif` call, SHA-pinned) + `T8` (failure-upload path = patched SARIF)
- Added `T10` (`sarif: false`), `T11` (jq patch step), `T12` (reads from `analyze.outputs.sarif`), `T13` (explicit upload w/ `category: fallow`), `T14` (no per-analyzer categories), `T15` (`id: analyze`)
- New behavioral test `tools/learning-loop-mastra/__tests__/legacy-mcp/sarif-patch.test.js` extracts the jq filter from the workflow YAML at test time and runs it against the fixture (`tools/learning-loop-mastra/reports/fallow/audit.sarif`) plus 3 idempotency edge cases (empty rules, pre-set `automationDetails`, empty-object `{}`)

**Local test suite:** 1393/1393 green (+13 vs PR #22 baseline of 1380).

## Documents updated

- `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` §6.3 / §6.5 replaced with corrected evidence
- `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` D2 annotated (no flip — D2 was already in target state)
- Meta-state entry `meta-260630T1238Z-...` patched via `meta_state_patch` with `evidence_code_ref = crates/api/src/audit_output.rs:build_audit_sarif` and `evidence_journal = plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md`

## Acceptance criteria

- [x] Inline jq patch step present, idempotent, classifier covers all rule ID prefixes
- [x] 1 explicit `codeql-action/upload-sarif@v4` call with `category: fallow`, SHA-pinned
- [x] Failure-upload path repointed to patched SARIF
- [x] All 14 workflow-shape tests green (9 + 5 new + 2 updated)
- [x] 7 behavioral tests green (jq smoke test + 3 idempotency cases + 3 fixture cases)
- [x] Fallow 2.103.0 still emits null `automationDetails.id` — F-6 not landed (patch still needed)
- [ ] CI test workflow reports success on this PR
- [ ] Code Scanning shows `category: fallow` (single category, not split)

## References

- Recovery plan: `plans/260630-0536-fallow-action-swap-with-sarif-split/`
- Source-level SARIF audit: `plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md`
- Upstream search (F-6 deferral record): `plans/reports/research-260630-1354-GH-2011-fallow-sarif-upstream-search.md`
- Original deep-dive (now corrected in §6.3 / §6.5): `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md`

## Follow-ups (deferred)

- **F-6:** File upstream issue + PR at `github.com/fallow-rs/fallow` asking for `automationDetails.id` on the dead-code and health SARIF builders (per operator instruction, **NOT filed in this plan**). When F-6 ships, the inline jq patch step can be removed entirely.
- **F-7:** Per-analyzer Code Scanning categories (revisit after F-6 lands).