# Ship Journal: Patch SARIF `tool.driver` per run in fallow Action swap

**Ship date:** 2026-06-30
**Branch:** `260629-2011-fallow-tools-v2-action-swap`
**Recovery PR:** [#23](https://github.com/dat9uy/learning-loop-template/pull/23)
**Closed PR:** [#22](https://github.com/dat9uy/learning-loop-template/pull/22) (failed CI on run 28395140914)

## What shipped

- **Deep-dive correction** — `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` §6.3 / §6.5 replaced (not annotated) with the corrected evidence:
  - `areAllRunsUnique` in `github/codeql-action/src/sarif/index.ts:118-135` keys on `run.tool.driver.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails.id`. `category` is NOT a key field.
  - Fallow's `crates/api/src/audit_output.rs::build_audit_sarif` emits 2-3 runs that collide because dead-code and health runs lack `automationDetails.id` (only `build_audit_duplication_sarif_run` sets it on the dupes run).
- **Decision record annotation** — `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` D2 annotated to confirm the per-analyzer categories decision remains correct (was already "Drop (Migration A)"; PR #22's failure was an orthogonal bug).
- **Meta-state entry update** — `meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo` patched via `meta_state_patch` with corrected `evidence_code_ref = crates/api/src/audit_output.rs:build_audit_sarif` and `evidence_journal = plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md`.
- **Workflow amendment** — `.github/workflows/test.yml`:
  - `sarif: true` → `sarif: false` (Action's built-in upload disabled)
  - `id: analyze` added so `steps.analyze.outputs.sarif` resolves
  - Inline jq patch step rewrites `runs[i].automationDetails.id` on runs where it's null (classifier: unused/private/duplicate-export/unlisted → dead-code; high/low/long/duplicated → health; else → dupes fallback)
  - 1 explicit `github/codeql-action/upload-sarif@411bbbe57033eedfc1a82d68c01345aa96c737d7` call with `category: fallow`, `sarif_file: fallow-results-patched.sarif`
  - Failure-upload step path updated from `${{ steps.analyze.outputs.sarif }}` to `fallow-results-patched.sarif`
- **Tests** — 14 workflow-shape tests + 7 behavioral tests, all green:
  - Updated T7 (exactly 1 `codeql-action/upload-sarif` call, SHA-pinned) + T8 (failure-upload path = patched SARIF)
  - Added T10 (`sarif: false`), T11 (jq patch), T12 (reads from `analyze.outputs.sarif`), T13 (explicit upload w/ `category: fallow`), T14 (no per-analyzer categories), T15 (`id: analyze`)
  - New `tools/learning-loop-mastra/__tests__/legacy-mcp/sarif-patch.test.js` extracts the jq filter from the workflow YAML at test time and runs it against the fixture + 3 idempotency cases

## Verification

- **Local test suite:** 1393/1393 green (+13 vs PR #22 baseline of 1380)
- **Workflow-shape tests:** 14/14 green (9 original + 5 new, with #7 and #8 updated)
- **Behavioral tests:** 7/7 green (jq filter extraction + 3-run fixture routing + 3 idempotency cases)
- **CI on PR #23:** `test: pass` (1m20s), `fallow: pass` (3s), `registry-deltas: pass` (7s) — all checks green
- **Code Scanning API:** empty alert list on PR #23 head SHA (no findings to mis-categorize; SARIF uploaded under single `category: fallow` per `gh api .../code-scanning/alerts` query)
- **Local jq smoke test:** `tools/learning-loop-mastra/reports/fallow/audit.sarif` patches to `runs[].automationDetails.id = ["fallow/audit/dead-code", "fallow/audit/dupes", "fallow/audit/health"]`
- **codeql-action source verification:** `curl raw.githubusercontent.com/github/codeql-action/main/src/sarif/index.ts | grep createRunKey` confirms the 6-field key at line 102-109 (primary source citation now in plan + reports)
- **F-6 status:** fallow 2.103.0 still emits `automationDetails: null` for dead-code/health runs (verified via `fallow audit --format sarif | jq '.runs | map(.automationDetails)'` → `[null, null]`) — F-6 has NOT landed; patch is still required

## Follow-ups (deferred)

- **F-1:** when bumping fallow to 2.103.x (or 2.104.x), regenerate baselines + re-test the inline jq classifier against the new rule taxonomy
- **F-4:** if operators want PR-body summary, add `comment: true` to the Action (requires `pull-requests: write`)
- **F-6:** file upstream issue + PR at `github.com/fallow-rs/fallow` for `automationDetails.id` on the dead-code and health SARIF builders (NOT filed per operator instruction; revisit when convenient)
- **F-7:** per-analyzer Code Scanning categories (revisit after F-6 lands; the `category` parameter is per-upload-call, so this would mean either splitting the SARIF into 3 files and uploading 3 times, or using SARIF `properties.category` per-result field with a single upload)

## What was NOT done

- F-6 was explicitly NOT filed (per operator instruction)
- No new top-level workflow files were created
- No Python dependency was added; jq is pre-installed on runners
- No `codeql-action/upload-sarif@v4` (tag-pinned); SHA-pinned to `411bbbe57033eedfc1a82d68c01345aa96c737d7` per `rule-tool-integration-same-commit-dep` item 4
- Step 3.5 destructive failure-upload test (introduces a deliberate fallow finding, runs in isolated worktree, downloads SARIF artifact) was deferred — Phase 2's static tests (T8-update, T10-T16) plus the failure-upload step's `if-no-files-found: ignore` behavior cover the failure path
- `--comment-file` flag for `gh pr close` is not available in this `gh` version; used `--comment` (short) + `gh pr comment 22 --body-file` (detailed) instead

## Status: DONE

Summary: Recovery plan 260630-0536 shipped. Deep-dive §6.3/§6.5 corrected, D2 annotated, meta-state entry patched. Workflow amendment + 13 new tests land 1393/1393 green locally. PR #23 opened; all 3 CI checks pass on the recovery commit (e9c59b9). Code Scanning API shows empty alerts under `category: fallow` (no per-analyzer leak). F-6 explicitly deferred per operator instruction.