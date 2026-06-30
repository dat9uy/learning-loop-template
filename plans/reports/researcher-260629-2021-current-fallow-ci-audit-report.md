# Audit: hand-rolled fallow CI gate in `.github/workflows/test.yml` lines 62-237

**Date:** 2026-06-29
**Auditor:** researcher
**File audited:** `/home/datguy/codingProjects/learning-loop-template/.github/workflows/test.yml` (239 lines total)
**Repo:** learning-loop-template, branch `main`
**Target replacement:** `fallow-rs/fallow@v2` GitHub Action

---

## 1. Exact line ranges per step

### 1a. `pnpm exec fallow audit` invocation — lines 62-77 (16 lines)

Verbatim, from `test.yml:62-77`:

```yaml
- name: Fallow audit (PR gate)
  if: github.event_name == 'pull_request'
  run: |
    cd tools/learning-loop-mastra
    # Baselines live in the plan dir (committed to git); the local
    # .fallow/baselines/ cache is gitignored. CI reads from the plan
    # so the gate works on a fresh checkout.
    pnpm exec fallow audit \
      --root . \
      --gate new-only \
      --dead-code-baseline ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json \
      --health-baseline    ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/health-baseline.json \
      --dupes-baseline     ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json \
      --changed-since "${{ github.event.pull_request.base.sha || 'origin/main' }}" \
      --format sarif \
      --output-file reports/fallow/audit.sarif
```

Flag inventory (8 flags):

| Flag | Value |
|------|-------|
| `--root` | `.` (after `cd tools/learning-loop-mastra`, so effectively `tools/learning-loop-mastra/`) |
| `--gate` | `new-only` |
| `--dead-code-baseline` | `../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json` |
| `--health-baseline` | `../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/health-baseline.json` |
| `--dupes-baseline` | `../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json` |
| `--changed-since` | `${{ github.event.pull_request.base.sha || 'origin/main' }}` |
| `--format` | `sarif` |
| `--output-file` | `reports/fallow/audit.sarif` |

Note: there is **no `--config`** flag passed — fallow auto-discovers `tools/learning-loop-mastra/.fallowrc.json` from `--root`.

### 1b. SARIF post-processing (Python heredoc) — lines 79-188 (110 lines)

Inline `python3` heredoc step. See section 3 below for full decode.

The step declares:

```yaml
- name: Split SARIF into per-analyzer files
  if: success() && github.event_name == 'pull_request'
```

Runs between the gate and the 3 upload steps. Writes per-analyzer files to `tools/learning-loop-mastra/reports/fallow/audit-{category}.sarif` and `unlink()`s the original.

### 1c. Three SARIF upload steps — lines 190-216 (27 lines)

Per-analyzer `github/codeql-action/upload-sarif@v4` invocations:

- `test.yml:190-199` → `fallow-deadcode`
- `test.yml:201-206` → `fallow-health`
- `test.yml:208-215` → `fallow-dupes`

Each `if:` clause chains three guards: `success()`, the PR event filter, AND `hashFiles(<sarif_path>) != ''`.

### 1d. Failure SARIF preservation — lines 226-237 (12 lines)

```yaml
- name: Upload fallow SARIF on failure
  if: failure()
  uses: actions/upload-artifact@v7
  with:
    name: fallow-sarif
    path: tools/learning-loop-mastra/reports/fallow/audit.sarif
    if-no-files-found: ignore
    retention-days: 7
```

`audit.sarif` is the original (un-split) file emitted by fallow; the Split step is `success()`-gated so its `unlink()` is skipped when the gate fails — the failure-preservation upload finds the original file intact.

---

## 2. Flag-by-flag intent

Cited from `git log -p --follow .github/workflows/test.yml` (commit `49ab1fc` introduced the gate; `f524cb4` and `84348cd` diagnosed/repaired drift; `a2bbd83` last edited).

| Flag | Intent | Source |
|------|--------|--------|
| `--root .` | Scope fallow to the mastra subdir; the `cd` puts it inside the subdir so `.` resolves to `tools/learning-loop-mastra/`. | `49ab1fc` (Phase E fallow integration) |
| `--gate new-only` | Only fail on findings introduced by this PR (compare against baseline). Fallow reads `audit.gate` from `.fallowrc.json:44` (`"gate": "new-only"`) but the CLI flag wins — explicit flag is safer than relying on config discovery. | `49ab1fc`; baseline idea codified in consult-checklist test (`tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` "baseline-storage" rule). |
| `--dead-code-baseline`, `--health-baseline`, `--dupes-baseline` | Point fallow at **plan-dir** baselines (committed) rather than the local `.fallow/baselines/` cache (gitignored). The plan dir lives in git and works on fresh checkouts. Identical paths for all three. | `49ab1fc` chose plan-dir storage per the consult-checklist "baseline-storage" rule recorded in `meta-260628T1328Z` — fallow auto-creates `<root>/.fallow/.gitignore: *` so local baselines are silently untracked; storing in `plans/.../reports/` inherits the plan's existing gitignore. |
| `--changed-since "${{ github.event.pull_request.base.sha \|\| 'origin/main' }}"` | Restrict "new" classification to lines added in the PR. Requires `actions/checkout` `fetch-depth: 0` (line 36 — comment cites the same pattern as `meta-state-pr-body-advisory.yml:24`). Fallback to `origin/main` for `pull_request` events where `base.sha` may be unset (e.g. fork PRs). | `49ab1fc` |
| `--format sarif` | Emit SARIF instead of stdout text. SARIF is required for the downstream `codeql-action/upload-sarif` to ingest findings. | `49ab1fc` |
| `--output-file reports/fallow/audit.sarif` | Stable path the Split step reads. Note: fallow has a broken `--sarif-file` flag in 2.102.0 (per commit `a2bbd83` log — `--output-file` is what works). | `49ab1fc` initially used `--sarif-file`, later fixed in `49ab1fc` sub-commits to `--output-file`. The commit message in `a2bbd83` explicitly states: "`--sarif-file` is in fallow's --help text but does not actually write to ..." |

**Implicit (unflagged) config:**
`.fallowrc.json` is auto-loaded from `--root .`. It defines `entry`, `dynamicallyLoaded`, `ignorePatterns`, `rules`, and `audit.gate`. No `--config` flag is passed because fallow's default-discovery finds it.

---

## 3. Python heredoc decode — `test.yml:79-188`

The heredoc is split into three layers: preamble comment, classifier function, file emission logic.

### 3a. Preamble (`test.yml:88-131`)

Documents the design constraints and calibration:

- Calibrated to **fallow 2.102.0** rule-id taxonomy.
- Inline-by-design justification (single consumer, glue-code convention, no mock-friendly fixture).
- "When to promote to a file" criteria (2nd tool emitting multi-run SARIF, classifier exceeds ~5 categories, test coverage need).
- Drift signal: editing the heredoc without a fallow/CodeQL version bump indicates taxonomy drift.

### 3b. `classify(run)` — `test.yml:146-156`

Maps a SARIF `run` object to one of three category names. Decision tree:

```python
def classify(run):
    result_ids = {r.get("ruleId", "").lower() for r in run.get("results", [])}
    rule_ids = {r.get("id", "").lower() for r in run.get("tool", {}).get("driver", {}).get("rules", [])}
    for ids in (result_ids, rule_ids):
        if any("code-duplication" in i for i in ids):
            return "fallow-dupes"
        if any(i for i in ids if "complex" in i or "crap" in i or "refactor" in i):
            return "fallow-health"
        if any(i for i in ids if "unused" in i or "unreachable" in i or "private-type" in i or "circular" in i or "duplicate-export" in i):
            return "fallow-deadcode"
    return None
```

**Rule-id mapping table (verbatim from comment + classify):**

| Substring match | Category | Rationale |
|-----------------|----------|-----------|
| `code-duplication` | `fallow-dupes` | Unique marker (substring match — only `code-duplication` contains the substring; explicit guard: don't use generic `"duplicate"` because `duplicate-export` is a dead-code rule). |
| `complex` \| `crap` \| `refactor` | `fallow-health` | health analyzer findings (CRAP score, cyclomatic, refactor-candidate). |
| `unused` \| `unreachable` \| `private-type` \| `circular` \| `duplicate-export` | `fallow-deadcode` | dead-code analyzer (full substring match — `duplicate-export` is anchored). |
| Unknown | `f"fallow-{i}"` (fallback) | Numeric suffix per run index when classifier returns None. |

**Why two passes (results, then rules):** Some fallow runs may emit findings (results) but no driver rules; some may define rules but emit zero results. Prefer results (most reliable signal — actual findings fallow emitted), fall back to declared rule-IDs.

**`f"fallow-{i}"` fallback intent:** Categories collide with numeric suffix when classifier returns `None`. Distinct from `cat not in seen` de-collision path on `test.yml:164` which uses `f"{cat}-{i}"`.

### 3c. hashFiles() guard on the upload steps

`hashFiles('audit-fallow-<cat>.sarif') != ''` returns `''` when the file does not exist. This:
- Skips the upload when `len(runs) <= 1` (Split step exits early — original file remains).
- Skips the upload when a run has zero **locatable** results (CodeQL rejects results without `locations`; the Split step strips them and silently skips file emission).

### 3d. Why a separate file-per-rule-id upload is needed

Code Scanning / `github/codeql-action/upload-sarif@v4` enforces **one SARIF run per category per upload** (`test.yml:81-83` cites CodeQL Action v4 changelog 2025-07-21). `fallow audit` emits one SARIF file containing 3 runs sharing the same category; v4 rejects multi-run uploads under one category. Splitting into per-run files → per-uploads → each upload has a single run under its unique category (`fallow-deadcode` / `-health` / `-dupes`).

### 3e. Why `codeql-action/upload-sarif@v4` is called 3 times, not once

Each call accepts a single `sarif_file` input (SARIF 2.1.0 with one run, one category) — they cannot be merged. Three separate uploads are required to land three distinct Code Scanning categories.

---

## 4. Tests

### 4a. CI workflow tests

**None.** No test file references the workflow YAML, the Python heredoc, or the `classify()` function. Search across `tools/learning-loop-mastra/__tests__/**/*.test.js` and `.cjs`:

- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` references `fallow` only as **consult-checklist rule content** (an operational rule, not a test of the gate).
- No `classify()` test, no split-SARIF fixture test, no integration test that asserts `--gate new-only` exits 0 on clean code / exits 1 on a fresh finding.

**Gap to flag.** The heredoc encodes fallow's rule-id taxonomy. A fallow minor release that renames `code-duplication` or adds a `code-dep` alias would silently mis-classify every run. There is no fixture, no snapshot, and no CI assertion. The only safety net is the inline comment "Drift signal: if you edit the heredoc without an adjacent fallow or CodeQL version bump, the heuristic has drifted from its calibration."

### 4b. Consult checklist integration test (already present)

`gate-logic-consult-checklist-tool-integration.test.js` records three rules tying the gate to its baselines ("baseline-flag-format", "baseline-storage", an inline `pnpm exec fallow audit --gate new-only` citation under rule id `fallow-audit-pr-gate`). These rules prevent future contributors from re-introducing errors in flag format and baseline storage — they do not test the YAML.

---

## 5. Dependencies

### 5a. `fallow`

- **Version:** `2.102.0` (pinned in `package.json:30` → `"fallow": "2.102.0"` under `devDependencies`).
- **Calibration marker:** heredoc explicitly cites `Calibrated to: fallow 2.102.0` (`test.yml:99`).

### 5b. GitHub Actions

| Action | Version | Where |
|--------|---------|-------|
| `actions/checkout` | `v7` | `test.yml:29` |
| `pnpm/action-setup` | `v6` (`version: 11`) | `test.yml:38-41` |
| `actions/setup-node` | `v6` (`node-version: "24"`, `cache: "pnpm"`) | `test.yml:43-46` |
| `github/codeql-action/upload-sarif` | `v4` | `test.yml:196`, `203`, `212` |
| `actions/upload-artifact` | `v7` | `test.yml:219`, `234` |

All current majors per `plans/reports/research-260623-1142-github-actions-versions-audit-report.md` (cited in workflow preamble `test.yml:11`).

### 5c. Tools / runtime

- Node 24 (matches local `.nvmrc`).
- pnpm 11 (`pnpm/action-setup` `version: 11` mirrors local pnpm 11.8.0).
- `actions/setup-node` provides `cache: "pnpm"` (built-in pnpm store cache keyed on lockfile).

---

## 6. Baselines

Three baselines live at `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/`. The local cache `<root>/.fallow/baselines/` is **gitignored** (root `.gitignore:38-40` ignores `.fallow/cache/` and `.fallow/churn.bin`; the inner `.fallow/.gitignore` reads `*`, but fallow documents this auto-creation in the consult checklist "baseline-storage" rule).

| File | Bytes | Lines | jq type | jq length | Last regenerated | Tracked? |
|------|------:|------:|---------|----------:|------------------|----------|
| `dead-code-baseline.json` | 3336 | 88 | object | 41 | 2026-06-28 20:02:40 (`49ab1fc`) | YES — committed in `49ab1fc` |
| `health-baseline.json` | 8830 | 426 | object | 3 | 2026-06-28 20:02:40 (`49ab1fc`) | YES — committed in `49ab1fc` |
| `dupes-baseline.json` | 1977 | 22 | object | 1 | 2026-06-29 20:07:40 (`a2bbd83`) | YES — first committed `49ab1fc` (18 entries, 0 matched current paths), **refreshed in `84348cd`** to 1 current clone-group entry |

Local cache (gitignored):
```
.gitignore:38  # Fallow dead-code analysis cache (local binary state; baselines are tracked)
.gitignore:39  .fallow/cache/
.gitignore:40  .fallow/churn.bin
```
Gitignored at both `tools/learning-loop-mastra/.fallow/.gitignore: *` and root level. `git check-ignore` confirms all three local baselines are not tracked.

---

## 7. Permissions block

**There is no `permissions:` block in `test.yml`.** Verified by `grep -n "permissions:"` → no matches. The job runs with the repo's default GITHUB_TOKEN scope for `test.yml`. Note: `codeql-action/upload-sarif` and `actions/upload-artifact` both need `contents: write` for SARIF upload and artifact upload respectively; in repo defaults this is granted, but a hardened fork would need to explicitly add `permissions: { contents: read }` plus per-step permissions.

**Risk to flag:** A migration to the `fallow-rs/fallow@v2` Action may require the same default-token scopes plus possibly `security-events: write` for Code Scanning category management — worth checking against the Action's `action.yml`.

---

## 8. Cache strategy

- **pnpm store:** `actions/setup-node@v6` with `cache: "pnpm"` (`test.yml:46`) — built-in store cache keyed on lockfile hash.
- **Node modules:** Not separately cached; pnpm cache covers the same content.
- **`.fallow/baselines/`:** **NOT cached** via `actions/cache`. Baselines are committed to git in `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/`, so the `actions/checkout` step materializes them on every run. Local `<root>/.fallow/baselines/` (writeable mirror fallow updates) is gitignored and regenerated by fallow.
- **No `actions/cache` step** in the file (verified via `grep -n "actions/cache"` → no matches).

---

## 9. Failure modes observed

From `git log --all --format='%h %ai %s' -- .github/workflows/` and the diagnostic report `plans/reports/diagnostic-260629-pr-21-fallow-audit-gate-root-cause.md`:

| Commit / PR | Date | Symptom | Resolution | Status |
|-------------|------|---------|------------|--------|
| `97c2b5b` (in `a2bbd83` PR #21) | 2026-06-29 | 4 `fallow/high-crap-score` findings (CRAP 272/42/90/72 in `evaluate-write-gate.js`, `evaluatePreflight`, `evaluateInboundGate`, `hooks/legacy/bash-gate.js`). Source: PR #21's evaluator extraction in `09415f4`. | Refactored evaluator cascades; CC dropped below threshold. | Fixed in `a2bbd83` |
| `84348cd` | 2026-06-29 16:54 | Stale dupes baseline (18 entries, 0 matched current clone groups). | Regenerated `dupes-baseline.json` to 1 entry. | Fixed in `84348cd` |
| `f524cb4` + diagnostic | 2026-06-29 15:27 | "WARN node_modules directory not found" + env-drift hypothesis (`node_modules` symlink missing in CI). | Added `pnpm --dir tools/learning-loop-mastra install --frozen-lockfile` step (L51-58). **Hypothesis refuted:** pnpm hoisting already covered the subdir; the warning is benign and persists. | Step removed in `84348cd` (380ms savings) |
| `a2bbd83` (sub-commit) | 2026-06-29 | `--sarif-file` flag in fallow 2.102.0 does not write — SARIF went to stdout, upload step failed "Path does not exist". | Replaced with `--output-file`. | Fixed in `a2bbd83` |
| Code Scanning v4 changelog 2025-07-21 | upstream | `codeql-action/upload-sarif@v4` rejects multi-run SARIF per upload — fallow's 3-run SARIF was rejected. | Added Python Split step + 3 per-category uploads. | Fixed in `49ab1fc` / refined in subsequent `49ab1fc` sub-commits |
| `meta-260628T1328Z` consult-checklist rule "baseline-storage" | 2026-06-28 | fallow's auto-created `<root>/.fallow/.gitignore` silently gitignored local baselines (would have made them invisible to CI if relying on the cache path). | Stored baselines under `plans/.../reports/fallow/` which inherits an explicit gitignore. | Fixed at design time |
| `meta-260628T1328Z` "baseline-flag-format" | 2026-06-28 | `--save-regression-baseline` vs `--save-baseline` produce INCOMPATIBLE JSON shapes (regression = nested objects, audit = array of `path:export` strings). | Use `--save-baseline` for audit baselines (which the three files at plan-dir are). | Documented at design time |
| Fallow missing from devDependencies | 2026-06-28 | meta-state `meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but` flagged gate would break if `fallow` not pinned. | `fallow: 2.102.0` added to `package.json:30`. | Fixed |

---

## 10. Comment annotations

The workflow YAML carries extensive inline comments. Verbatim list (`test.yml` line ranges):

| Lines | Topic | Currency |
|-------|-------|----------|
| 1-11 | Workflow header: explains per-namespace runner, Node/pnpm pinning, version-audit citation. | Current (refers to the versions actually in use: Node 24, pnpm 11). |
| 30-34 | Why `fetch-depth: 0` (fallow `--changed-since` base SHA). | Current. Cites `meta-state-pr-body-advisory.yml:24` pattern. |
| 51-56 | Cold-session sentinel seed. | Current. |
| 66-68 | Inline: "Baselines live in the plan dir (committed to git)". | Current — references the actual baseline paths. |
| 80-84 | Inline: explains why per-analyzer upload is needed (CodeQL v4 multi-run rejection). | Current. |
| 88-131 | Preamble of the heredoc — calibration, drift signal, promotion criteria. | Current — references `fallow 2.102.0` and CodeQL changelog date. |
| 142-145 | Inline: classifier rationale + the `duplicate-export` gotcha. | Current. |
| 167-172 | Inline: CodeQL requires `locations` on every result; clone-group findings have none. | Current. |
| 185-186 | Inline: why unlink the original (prevent legacy upload from finding it). | Current. |
| 191-194 | Inline: hashFiles() guards the upload step. | Current. |
| 209-210 | Inline: dupes skipped when clone-group findings lack per-file locations. | Current. |
| 227-230 | Inline: failure-path artifact — read the actual CI SARIF instead of truncated log; relies on Split being `success()`-gated so unlink doesn't fire. | Current. |

**No stale comments found.** All comments reference specific tools/versions (fallow 2.102.0, CodeQL v4 changelog 2025-07-21) and the in-tree baseline paths.

---

## 11. Net LoC + LoC-by-purpose breakdown

Total workflow file: **239 lines.**

Fallow-related slice: **lines 62-237 = 176 lines.**

| Purpose | Lines | Range |
|---------|------:|-------|
| Gate command (`pnpm exec fallow audit`) | 16 | 62-77 |
| Python heredoc (preamble comment + Python code) | 110 | 79-188 |
| 3 SARIF upload steps | 27 | 190-216 |
| Failure SARIF preservation | 12 | 226-237 |
| **Subtotal (fallow slice)** | **165** | — |
| Inline comments inside above sections | ≈86 | distributed across 80-84, 88-131, 142-145, 167-172, 185-186, 191-194, 209-210, 227-230 |
| (Comments overlap with their parent section) | (already counted) | — |

Comment-only blocks (no logic): lines 80-84 (5), 88-131 (44), 191-194 (4), 209-210 (2), 227-230 (4), 66-68 (3), 30-34 (5) = ~65 comment-only lines. The rest are code lines + brief inline comments.

**Comment / doc LoC is substantial (~65 lines of 176 = ~37%)** — most of the migration work is verifying and porting rationale, not code.

---

## 12. Replacement candidates (fallow-rs/fallow@v2 Action)

The hypothetical `fallow-rs/fallow@v2` Action would replace:

| Current slice | Lines | Replaced by Action? | Notes |
|---------------|------:|---------------------|-------|
| Gate command (`fallow audit` invocation + flags) | 62-77 | **Yes** | Action inputs: `root`, `gate`, `baseline-*`, `changed-since`. Maps 1:1 with current flags. |
| Python heredoc split + classify + SARIF emission | 79-188 | **Possibly** | If Action emits per-category SARIF directly or accepts `--output-pattern`, the heredoc collapses. **Risk:** the Action may still emit one multi-run SARIF and rely on consumer-side splitting. |
| 3 upload steps | 190-216 | **Likely yes** | If Action uploads to Code Scanning internally. **Risk:** category names may differ (Action may use `fallow/<rule>` instead of `fallow-deadcode`/`-health`/`-dupes`). |
| `hashFiles()` guards | inside upload `if:` clauses | **No** | Replaced naturally if Action skips empty uploads internally. |
| Failure SARIF preservation | 226-237 | **No** (preserve) | Artifact upload for diagnosis is independent of the gate tool. Required for any future CI-vs-local drift triage. |
| Concurrency block, actions/checkout fetch-depth: 0, pnpm/action-setup, actions/setup-node | 20-22, 29, 38-46 | **Mixed** | If Action manages its own checkout, `actions/checkout` with `fetch-depth: 0` is still required for `--changed-since`. pnpm install + Node setup are independent. |

**Must preserve regardless of Action migration:**
- The fetch-depth justification comment + the `actions/checkout` `fetch-depth: 0` setting.
- The plan-dir baseline storage pattern (consult-checklist `baseline-storage` rule).
- The `--output-file` (not `--sarif-file`) flag in the audit command (fallow 2.102.0 bug, may persist in 3.x).
- The failure-path artifact upload.
- `.fallowrc.json` (auto-loaded regardless of CLI vs Action).

---

## 13. Risks of migration

### 13a. SARIF upload category change
The Action may use different Code Scanning category names (e.g. `fallow/dead-code`, `fallow/health`, `fallow/dupes` or a single `fallow` category with rule IDs as sub-categories). Re-mapping categories on existing PR review history breaks Code Scanning alert grouping. **Mitigation:** check `action.yml` inputs and align with existing branches' SARIF categories before any migration.

### 13b. Baseline path relocation
The Action may accept only its own baseline format or its own path conventions. The current paths (`plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/*-baseline.json`) were chosen specifically because fallow auto-creates a git-ignoring `.gitignore` in `<root>/.fallow/` (consult-checklist `baseline-storage` rule). If the Action ships its own baseline loader that respects local `.fallow/baselines/`, baselines may need to move (and the plan-dir pattern retired).

### 13c. Gate failure classification
The Action's exit semantics may not map 1:1 to `--gate new-only` (which compares findings against baseline and exits 1 if new findings exist). If the Action emits `verdict: pass|warn|fail` text on stdout but exits 0, the PR-required-check may need to be re-anchored to a different step (e.g. `fallow/audit/result`). Verify before disabling the inline invocation.

### 13d. SARIF format / split
The Action may adopt SARIF 2.1.x or drop multi-run output entirely. The entire 110-line Python heredoc may collapse to ~5 lines (or vanish), but **the drift-detection rationale (fallow rule-id taxonomy) still matters** for any future hand-rolled shim. Keep the rationale in a docs file.

### 13e. Concurrency group
`concurrency: ${{ github.workflow }}-${{ github.ref }}` cancels in-progress runs. The Action's own internal concurrency may differ — verify the cancellation semantics don't race against mid-upload writes.

### 13f. Lost artifacts on Action swap
The `actions/upload-artifact@v7` step that preserves `fallow-sarif` on failure runs against `tools/learning-loop-mastra/reports/fallow/audit.sarif` (the **original, un-split** file). If the Action's output path differs, the failure-preservation step's path input must be updated in lockstep.

### 13g. Permissions
Action may require `security-events: write` (for category creation) — current workflow has no explicit `permissions:` block and inherits repo default. Migrating without setting explicit permissions may prompt unexplained `403` in fork PRs.

---

## 14. Verification sources

| Source | Commit / Path | Used for |
|--------|---------------|----------|
| Workflow content (verbatim) | `git log -p --follow .github/workflows/test.yml` working tree HEAD | Flag inventory, line ranges, all 12 deliverables |
| Gate-introducing commit | `49ab1fc` "Phase E — Mechanism A (placement) + B (entry factories) + fallow rule + dead-code sweep (#20)" | Flag rationale |
| Drift diagnostic | `f524cb4` "ci(fallow): diagnose CI-vs-local fallow audit gate divergence" + `plans/reports/diagnostic-260629-pr-21-fallow-audit-gate-root-cause.md` | Failure modes (env-drift hypothesis refuted, real cause = high-crap-score + stale dupes baseline) |
| Baseline refresh | `84348cd` "ci(fallow): drop dead-weight subdir install + refresh dupes baseline" | Stale dupes baseline failure mode |
| PR-21 real fix + refactor | `a2bbd83` "fix(gate): review followups for phase E evaluator refactor (#21)" | `--sarif-file` → `--output-file` fix; 4 high-CRAP findings resolved via refactor |
| Fallow tool integration consult-checklist rule encoding | journal-260628-fallow-tool-integration-rule, gate-logic-consult-checklist-tool-integration.test.js | Baseline flag format / storage rules |
| Action versions audit | `plans/reports/research-260623-1142-github-actions-versions-audit-report.md` (cited in workflow preamble `test.yml:11`) | Action version pinning |
| Fallow source-of-truth for calibration | `package.json:30` (`"fallow": "2.102.0"`) | Calibration marker (heredoc `Calibrated to: fallow 2.102.0`) |
| Baseline gitignore rationale | `.gitignore:38-44`; `tools/learning-loop-mastra/.fallow/.gitignore: *` (auto-created by fallow); consult-checklist rule "baseline-storage" | Why baselines live in `plans/.../reports/fallow/` |
| CodeQL v4 SARIF constraint | CodeQL Action v4 changelog entry 2025-07-21 (cited inline at `test.yml:91`) | Why 3 separate upload steps |

---

## Net migration cost (summary)

**Current hand-rolled footprint:** 165 lines of YAML logic + ~65 lines of inline comments/rationale.

**A clean `fallow-rs/fallow@v2` swap would reduce that to an estimated 10-30 lines** (Action `uses:` invocation, baseline input paths, a single per-failure upload-artifact step), depending on how much Action-internal complexity replaces our Split step. The bulk of the saved code is the Python heredoc (110 lines) and the 3 upload steps (27 lines).

**What does NOT shrink:**

- `actions/checkout` `fetch-depth: 0` + its 5-line justification comment.
- Concurrency block (2 lines).
- pnpm/action-setup + actions/setup-node (independent of fallow).
- Failure-path `actions/upload-artifact` step (12 lines; preserved across migration).
- The 5-line "fetch-depth required" comment + the 44-line heredoc preamble capturing drift-signal rationale — these survive as docs even if the code is gone.

**Lines saved (rough):** ~125-145 LoC out of 165 (mostly the heredoc + per-analyzer uploads).
**Lines preserved (rough):** ~40 lines of cross-cutting glue, plus the rationale moves from inline-comment to docs.

**Validation work before migration:**

1. Confirm `fallow-rs/fallow@v2` accepts `--dead-code-baseline`, `--health-baseline`, `--dupes-baseline` paths (or map them to Action inputs).
2. Confirm exit semantics map to `--gate new-only` (exit 1 iff new findings exist).
3. Confirm SARIF category names match `fallow-deadcode` / `-health` / `-dupes` (or update Code Scanning queries in fork).
4. Confirm `.fallow/baselines/` outside plan dir is acceptable, OR keep plan-dir paths and pass them as Action inputs.
5. Regenerate all three baselines against the post-refactor code (current baselines predate `a2bbd83` refactor; CRAP scores may have shifted).
6. Add a test for `classify()` if the heredoc is replaced — fixture freeze of a representative SARIF run (only if the replacement still has classification logic).

---

## Unresolved questions

1. **What does `fallow-rs/fallow@v2` actually accept as inputs / emit as outputs?** The migration plan needs the Action's `action.yml` before any verdict on LoC savings can be definitive.
2. **Do `codeql-action/upload-sarif` categories need to match our exact strings (`fallow-deadcode`, etc.) for existing Code Scanning alerts to remain stable?** No public documentation consulted for this — only the inline comment citing the changelog.
3. **What gate verdicts does GitHub required-check status map to?** If the Action's exit semantics differ, the branch-protection rule for `test` may need reconfiguration.
4. **Has the `a2bbd83` refactor's CRAP-score change moved any of the 3 currently-classified-as-`-health` functions back above the threshold?** Re-running fallow locally on the current tree would confirm — out of scope here.
5. **Why does fallow's code-duplication analyzer emit clone-group findings without per-file `locations`?** This is the root cause for the dupes-upload hashFiles() skip when results are present. Likely a fallow 2.102.0 bug or feature gap; worth filing upstream before migration.

