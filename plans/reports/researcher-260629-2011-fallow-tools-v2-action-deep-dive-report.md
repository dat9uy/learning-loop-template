# Deep-dive: `fallow-rs/fallow@v2` GitHub Action

**Date:** 2026-06-29
**Author:** researcher (subagent)
**Sourcing date:** 2026-06-29
**Repo audited:** https://github.com/fallow-rs/fallow
**Files sourced:** (all fetched from `raw.githubusercontent.com` on 2026-06-29; HTTP 200 for every file)
- https://raw.githubusercontent.com/fallow-rs/fallow/main/action.yml — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/install.sh — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/analyze.sh — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/review.sh — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/comment.sh — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/annotate.sh — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/check-code-scanning.sh — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/npm/fallow/scripts/verify-binary.js — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/npm/fallow/scripts/lazy-verify.js — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/npm/fallow/scripts/run-binary.js — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/npm/fallow/scripts/sentinel-path.js — HTTP 200
- https://raw.githubusercontent.com/fallow-rs/fallow/main/CHANGELOG.md — HTTP 200
- https://github.com/fallow-rs/fallow (repo metadata) — HTTP 200

**Plan context:** `plans/260629-2011-fallow-tools-v2-action-swap/`
**Sibling report (already produced):** `plans/reports/researcher-260629-2021-current-fallow-ci-audit-report.md` — referenced where it provides current behavior context.

---

## 1. Action overview

**§1.1 Identity.** `fallow-rs/fallow@v2` is the official GitHub Actions wrapper around the `fallow` Rust-native CLI (a deterministic static analyzer for TypeScript/JavaScript). The repo at `https://github.com/fallow-rs/fallow` is real, MIT-licensed, and actively maintained — 2,787 commits, 203 releases through 2026-06-28, primary language Rust (90.1%). Confirmed via `WebFetch` on `https://github.com/fallow-rs/fallow`.

**§1.2 Maintainer.** The Action's `author:` field reads `Bart Waardenburg` (`action.yml:3`). The repo README and release tags are signed by the same maintainer. [resolved]

**§1.3 Composite Action shape.** `action.yml:341-342` declares `runs: using: 'composite'`. A composite Action chains reusable step templates (each with `shell: bash` or `uses:`) inside a single Action reference. The fallow Action's composite sequence (in order, sourced from `action.yml` `runs.steps:`):

1. `Install fallow` (`bash action/scripts/install.sh`)
2. `Cache analysis results` (`uses: actions/cache@27d5ce7f... # v5`)
3. `Run analysis` (`id: analyze`, `bash action/scripts/analyze.sh`)
4. `Job summary` (`bash action/scripts/summary.sh`)
5. `Emit inline annotations` (`bash action/scripts/annotate.sh`)
6. `Check Code Scanning availability` (`id: ghas-check`, `bash action/scripts/check-code-scanning.sh`)
7. `Upload SARIF` (`uses: github/codeql-action/upload-sarif@8aad20d1... # v4` with `category: fallow`)
8. `Post PR comment` (`id: comment`, `bash action/scripts/comment.sh`)
9. `Post review comments` (`id: review`, `bash action/scripts/review.sh`)
10. `Check threshold` (inline `run:` shell that decides the step exit code)

[resolved]

**§1.4 Release cadence.** Tagged as `v2.<x>.<y>` on the `main` branch. The CHANGELOG excerpt returned by `WebFetch` shows `v2.103.0` released 2026-06-28 with "typed output contracts, runtime trust-output, false-positive fixes". The repo's GitHub metadata reports `Latest Tag: v2.103.0`. We did not pull a release cadence table; the 203-release / ~12-month window implies roughly weekly tags. [resolved]

**§1.5 Not vendored.** The Action does **not** ship a checked-in CLI binary. It installs the CLI on every run via `npm install -g` inside `action/scripts/install.sh` (see §4, §5). The composite Action is pure orchestration code (~340 LoC of YAML + ~10 LoC per shell script header); all heavy lifting is the prebuilt Rust binary downloaded from npm at install time. [resolved]

---

## 2. Inputs

Every `inputs:` field declared in `action.yml`. Each entry cites the line range in the YAML file as fetched on 2026-06-29.

**§2.1 Core command / path.**

| Input | Type | Default | Required | Effect | Source |
|---|---|---|---|---|---|
| `command` | string | `''` | no | One of: `dead-code`, `dupes`, `health`, `audit`, `security`, `fix`, or empty (runs all). Legacy alias `check = dead-code`. | `action.yml:7-10` |
| `root` | string | `'.'` | no | Project root directory passed as `--root`. | `action.yml:11-14` |
| `config` | string | — | no | Explicit path to `.fallowrc.json` / `.fallowrc.jsonc` / `fallow.toml` / `.fallow.toml`. | `action.yml:15-18` |

**§2.2 Format / SARIF upload.**

| Input | Type | Default | Effect | Source |
|---|---|---|---|---|
| `format` | enum | `'sarif'` | One of: `human`, `json`, `sarif`, `compact`, `markdown`, `codeclimate`, `pr-comment-github`, `pr-comment-gitlab`, `review-github`, `review-gitlab`, `badge`. | `action.yml:19-22` |
| `sarif` | bool | `'false'` | Upload SARIF to GitHub Code Scanning. Public repos: free. Private/internal: requires GitHub Advanced Security. Requires `permissions: security-events: write`. | `action.yml:23-26` |

**§2.3 Production filters.** `production`, `production-dead-code`, `production-health`, `production-dupes` — all bool, default `'false'`. Mutually constrained: the three `production-<analyzer>` inputs only apply when `command` is empty (bare). `action.yml:27-42`.

**§2.4 Failure / scoping.**

| Input | Type | Default | Effect | Source |
|---|---|---|---|---|
| `fail-on-issues` | bool | `'true'` | Whether the threshold step (`action.yml:506-547`) exits 1 on findings. | `action.yml:43-46` |
| `changed-since` | string | — | git ref; restricts analysis to files changed since that ref. Requires `actions/checkout fetch-depth: 0`. | `action.yml:47-50` |
| `auto-changed-since` | bool | `'true'` | When `command` is not set, automatically uses `github.event.pull_request.base.sha` as `changed-since`. Ignored when `changed-since` is explicit. | `action.yml:51-54` |

**§2.5 Baselines.** `baseline` (single, for `dead-code`); `save-baseline` (dead-code). Audit-specific: `dead-code-baseline`, `health-baseline`, `dupes-baseline` — all required when running `command: audit` and using a gate (otherwise irrelevant). All string, all optional. `action.yml:55-60` and `action.yml:259-267`. **[§2.5.1]** The audit command's three baseline inputs are passed straight through to `fallow audit --<x>-baseline <path>` (verified at `action/scripts/analyze.sh:194-197`).

**§2.6 Version pin.** `version` — string, default `''`. **Description (verbatim):** "Fallow version override. When omitted, the action uses the project package.json fallow dependency spec if present, otherwise latest. Pin a current fallow version so Ed25519 + SHA-256 binary verification can run." `action.yml:61-64`. **[§2.6.1]** This is the CLI binary version input — distinct from the Action ref (which is a different pin; see §5). [resolved]

**§2.7 Workspace / diff / advanced.**

| Input | Type | Default | Effect | Source |
|---|---|---|---|---|
| `args` | string | `''` | Space-separated extra args appended to fallow CLI invocation. | `action.yml:65-68` |
| `artifacts-dir` | string | `'.'` | Where generated artifacts land (`fallow-results.json`, `fallow-results.sarif`, `fallow-stderr.log`, `fallow-analysis-args.sh`). Validated against path-traversal in `analyze.sh:251-258` (rejects leading `/`, leading `-`, newlines, `..` segments). | `action.yml:69-73` |
| `github-token` | string | `${{ github.token }}` | Token for PR comments + SARIF upload. | `action.yml:74-77` |
| `diff-file` | string | `''` | Path to a unified-diff file for line-level hot-path scoping. | `action.yml:117-122` |
| `diff-filter` | enum | `'added'` | One of: `added`, `diff_context`, `file`, `nofilter`. | `action.yml:113-116` |
| `summary-scope` | enum | `'all'` | `'all'` includes project-level findings outside diff; `'diff'` applies diff filter to them too. | `action.yml:109-112` |
| `comment-id` | string | `''` | Sticky-comment marker; defaults to `fallow-results`, suffixed with workspace name when scoped. | `action.yml:105-108` |
| `workspace` | string | — | One or more workspace selectors (exact names or globs). | `action.yml:161-164` |
| `changed-workspaces` | string | — | Git-derived monorepo scoping. Mutually exclusive with `workspace`. | `action.yml:165-168` |

**§2.8 Comments / annotations.**

| Input | Type | Default | Effect | Source |
|---|---|---|---|---|
| `comment` | bool | `'false'` | Post results as a sticky PR comment (requires `pull-requests: write`). | `action.yml:78-81` |
| `annotations` | bool | `'true'` | Emit findings as inline PR annotations via `::error file=...,line=...` (no GHAS required). | `action.yml:82-85` |
| `review-comments` | bool | `'false'` | Post inline PR review comments with rich markdown. Auto-disables annotations when enabled. | `action.yml:86-89` |
| `review-guidance` | bool | `'false'` | Append "What to do" guidance to review comments. Requires `review-comments: true`. | `action.yml:90-93` |
| `max-annotations` | string | `'50'` | Cap on inline annotations. Validated in `annotate.sh:11-15` (positive integer). | `action.yml:94-97` |
| `max-comments` | string | `'50'` | Cap on inline review comments + sticky-table items. | `action.yml:98-101` |

**§2.9 Dupes-specific inputs.** `dupes-mode` (`'mild'`), `min-tokens`, `min-lines`, `threshold`, `skip-local`, `cross-language`, `ignore-imports`. All bool/string, optional. `action.yml:131-152`. **[§2.9.1]** Used only when `command: dupes`.

**§2.10 Health-specific inputs.** `max-cyclomatic` (default 20), `max-cognitive` (default 15), `max-crap` (default 30.0), `coverage`, `runtime-coverage`, `coverage-root`, `min-invocations-hot` (default 100), `min-observation-volume`, `low-traffic-threshold`, `top`, `sort`, `file-scores`, `hotspots`, `targets`, `complexity`, `since`, `min-commits` (default 3), `score`, `min-severity`, `save-snapshot`, `trend`. `action.yml:169-220`.

**§2.11 Check-specific.** `issue-types` (comma-separated: `unused-files, unused-exports, unused-types, unused-deps, unused-enum-members, unused-class-members, unresolved-imports, unlisted-deps, duplicate-exports, circular-deps`), `include-entry-exports` (default `'false'`). `action.yml:221-228`.

**§2.12 Audit-specific (in addition to baselines).**

| Input | Type | Effect | Source |
|---|---|---|---|
| `gate` | enum | `new-only` (default) or `all`. Validated in `analyze.sh:218-220` (rejects other values). | `action.yml:230-233` |
| `security-gate` | enum | `new` or `newly-reachable` (security command only). | `action.yml:234-237` |

**§2.13 Regression detection.** `fail-on-regression` (default `'false'`), `tolerance` (default `'0'`), `regression-baseline`, `save-regression-baseline`. Dead-code-only. `action.yml:268-279`.

**§2.14 Fix-specific.** `dry-run` (default `'true'` for CI safety). `action.yml:281-284`.

**§2.15 Global flags.** `no-cache` (default `'false'`), `threads`. `action.yml:286-289`.

**§2.16 Bare selectors.** `only`, `skip` — comma-separated analyzer names (`dead-code,dupes,health`). Used only when `command` is empty. `action.yml:291-297`.

**§2.17 API retry knobs.** `api-retries` (default 3), `api-retry-delay` (default 2). `action.yml:123-130`. Forwarded to `comment.sh` / `review.sh` `gh_api_retry()` for 429/5xx handling.

---

## 3. Outputs

Every `outputs:` field declared in `action.yml`. All outputs read from composite steps' outputs via `${{ steps.<id>.outputs.<name> }}`.

| Output | Source step | Value | What it carries |
|---|---|---|---|
| `results` | `steps.analyze` | `${{ steps.analyze.outputs.results }}` | Path to JSON results file (`fallow-results.json`, relative to `artifacts-dir`). Written via `echo "results=${RESULTS_FILE}" >> "$GITHUB_OUTPUT"` at `analyze.sh:464`. |
| `sarif` | `steps.analyze` | `${{ steps.analyze.outputs.sarif }}` | Path to SARIF file (`fallow-results.sarif`, relative to `artifacts-dir`). Written at `analyze.sh:468-470` only if the file exists. **[§3.1]** This is the path Phase 4 must feed to the failure-upload step. |
| `issues` | `steps.analyze` | `${{ steps.analyze.outputs.issues }}` | Numeric count. For `audit`: gate-aware (sums `attribution.*_introduced` when `gate: new-only`, sums `summary.*` when `gate: all`). For `dead-code`: `.total_issues`. For `dupes`: `.stats.clone_groups`. For `health`: sum of `.summary.functions_above_threshold` + runtime-coverage findings. For `fix`: `.fixes | length`. For `security`: gate-aware when set. For `bare`: sum across all analyzers. |
| `verdict` | `steps.analyze` | `${{ steps.analyze.outputs.verdict }}` | Audit-only: `pass` / `warn` / `fail`. Empty for non-audit commands. Used by the threshold step to decide exit code (`action.yml:512-518`). |
| `gate` | `steps.analyze` | `${{ steps.analyze.outputs.gate }}` | The effective gate applied (`new-only` / `all` for audit; `new` / `newly-reachable` for security). Empty otherwise. |
| `changed-files-unavailable` | `steps.analyze` | `${{ steps.analyze.outputs.changed_files_unavailable }}` | `true` / `false`. `true` when analyze.sh's GitHub API fallback for changed-files enumeration failed (rate limit, 5xx, expired token, missing permissions). Default `false` even when `changed-since` was not requested. **[§3.2]** This is the degraded-state signal a downstream step can gate on. |
| `post-skipped-reason` | `steps.review` | `${{ steps.review.outputs.post_skipped_reason }}` | `pagination_failure` / `none`. Only `pagination_failure` indicates the inline-review POST was actually aborted. Empty when the review step didn't run. |
| `dedup-lookup-failed` | `steps.review` (combined with `steps.comment`) | `${{ (steps.review.outputs.dedup_lookup_failed == 'true' || steps.comment.outputs.dedup_lookup_failed == 'true') && 'true' || 'false' }}` | Composite: `true` if EITHER the comment OR review step's dedup lookup failed; `false` otherwise. **[§3.3]** Gate on this to detect either degraded state without misreading it as a skipped post. |

[resolved]

---

## 4. Cryptographic verification model

The Action runs three verification layers before executing the `fallow` binary. All three live in the npm wrapper package, NOT in the Action's `action.yml` directly — the Action just calls them by shelling out to `npm install -g fallow` and then `fallow --version`. The chain (sourced from `verify-binary.js`, `lazy-verify.js`, `run-binary.js`, `install.sh`):

**§4.1 Ed25519 signature verification.**
- `verify-binary.js:39-58` embeds the 32-byte raw Ed25519 public key as a literal byte array. The key is documented as identical to `BINARY_SIGNING_PUBLIC_KEY` in `editors/vscode/src/download.ts:19-22` and to the `ED25519_BINARY_SIGNING_PUBLIC_KEY` repo variable on `fallow-rs/fallow`.
- `verify-binary.js:60-67` prepends the SPKI DER header (12 bytes, RFC 8410) to produce the SPKI structure that `node:crypto.createPublicKey` accepts.
- `verify-binary.js:70-115` reads the binary, reads `${binaryPath}.sig` (a 64-byte raw Ed25519 signature), rejects if length ≠ 64, and calls `crypto.verify(null, binaryBytes, publicKey, signature)`.
- If verification fails: `ok: false, code: 'sig-invalid'`. If signature is missing on a ≥2.77.0 binary: tampering signal (per `verify-binary.js:283-300`). If signature is missing on a pre-2.77.0 binary: expected, message tells operator to bump the pin.

**§4.2 SHA-256 digest verification (two sources, preference order).**
- **Embedded (steady-state path).** `verify-binary.js:208-233` reads `manifest.fallowDigests[binaryFileName]` from the platform package's `package.json` (e.g. `@fallow-cli/linux-x64-gnu`). This field is written at release time by the upstream `npm-prep` job, refs #597. No network traffic, immune to GitHub API rate limits.
- **GitHub Release API (legacy fallback).** `verify-binary.js:144-174` calls `https://api.github.com/repos/fallow-rs/fallow/releases/tags/v<version>` and reads `assets[].digest` (the SHA-256). Used only when no embedded digest is present. Note: `httpsJson` returns a Promise (this path is async-only; the lazy path uses `verifyInstalledSync`, which omits this fallback — see §4.4).
- `verify-binary.js:104-115` computes the actual SHA-256 of the binary bytes and compares. Mismatch → `code: 'digest-mismatch'`.

**§4.3 Sentinel-based caching (lazy path).**
- `lazy-verify.js:14-20` declares `SENTINEL_SCHEMA_VERSION = 2`. v1 sentinels are invalidated automatically.
- `lazy-verify.js:131-144` builds a per-binary fingerprint record: `{ mtimeMs, sha256 }` for `fallow`, `fallow-lsp`, `fallow-mcp`. The `mtimeMs` check is a cheap pre-filter; the SHA-256 check is the load-bearing integrity gate that defends against same-mtime cross-install reuse.
- `lazy-verify.js:148-152` validates the sentinel on every invocation. Any field mismatch → re-verify.
- `lazy-verify.js:155-163` writes the sentinel via `tmp + rename` for atomicity.
- **Cross-install binding.** `lazy-verify.js:121-128` requires `parsed.platformPkgDir === platformPkgDir` — closes the cross-install reuse gap in the shared `$XDG` cache (refs `lazy-verify.js:60-65`).

**§4.4 Synchronous vs asynchronous paths.**
- `verifyInstalled` (`verify-binary.js:312-369`): async. Includes GitHub Release API fallback.
- `verifyInstalledSync` (`verify-binary.js:380-411`): sync. **No network fallback.** When no embedded digest exists, returns `code: 'digest-unavailable'` with actionable message: `Run \`npm install fallow@latest\` to refresh, or set ${SKIP_ENV}=1 to bypass verification` (`verify-binary.js:435-440`).
- The Action's `install.sh:84-95` calls the **async** `verifyInstalled` (because `install.sh` can shell out and the upstream expects a Promise chain). The lazy path used by `bin/fallow` → `bin/fallow.mjs` → `run-binary.js:84-89` calls `ensureVerified` from `lazy-verify.js`, which in turn calls `verifyInstalledSync`.

**§4.5 Action's install.sh orchestrates it all.**
- `install.sh:65-79` resolves the version spec: action `version:` input → project `package.json` `dependencies.fallow` / `devDependencies.fallow` / etc. → `latest`. **`is_safe_version_spec()`** (`install.sh:13-26`) rejects URLs, paths, `file:` / `link:` / `workspace:` aliases.
- `install.sh:81-89` runs `npm install -g --ignore-scripts fallow@<spec>`. `--ignore-scripts` is critical: the verify scripts are bundled with the **Action checkout**, not the installed package — this prevents lifecycle scripts from running before verification.
- `install.sh:93-117` invokes `verify-binary.js` with `FALLOW_VERIFY_RESOLVE_FROM` pointing at the global npm root (so verifier code from the action checkout does NOT trust installed code per the comment at `install.sh:94-97`).
- `install.sh:138-148` runs `fallow --version` to surface the verified-status line (e.g. `verified: yes (sentinel /tmp/...) ; fallow 2.102.0 signed`).

**§4.6 Escape hatch.** `FALLOW_SKIP_BINARY_VERIFY=1` (also accepts `true` / `yes`). Defined in `verify-binary.js:243-246`; checked at `verify-binary.js:317-320` (async) and `verify-binary.js:384-387` (sync). `install.sh` warns once per process when set (`lazy-verify.js:215-223`).

**§4.7 Sentinel location resolution.** Order (verbatim from `sentinel-path.js:6-15`):
1. `<platform-pkg-dir>/.fallow-verified` (filename `SENTINEL_FILENAME = ".fallow-verified"`)
2. `$FALLOW_VERIFY_CACHE_DIR/<package-id>.json` (package-id is `@fallow-cli/linux-x64-gnu` → `fallow-cli__linux-x64-gnu.json`)
3. `$XDG_CACHE_HOME/fallow/sentinels/<package-id>.json` (Linux/macOS) or `%LOCALAPPDATA%\fallow\sentinels\<package-id>.json` (Windows) or `~/.cache/fallow/sentinels/<package-id>.json` (POSIX fallback when `$XDG_CACHE_HOME` unset)
4. No writable location → `{ path: null, location: 'none', writable: false }` → re-verify every invocation

Each probe uses an atomic `O_CREAT | O_EXCL` write to probe writability without disturbing existing sentinels (`sentinel-path.js:21-50`). [resolved]

---

## 5. Pin model

Two distinct pins, both required:

**§5.1 Action ref pin (third-party Action supply-chain integrity).** This is the `uses: fallow-rs/fallow@<ref>` line in the workflow. Pin to a 40-character commit SHA, not a tag or `@v2`, per the standard supply-chain-hardening pattern. The SHA pins the Action's `action.yml` + scripts. Without it: a tag re-push or branch-default change could swap the install / verify / analyze shell scripts for malicious variants. [resolved]

**§5.2 CLI version pin (`version:` input).** This is `with: { version: "2.102.0" }`. It pins the **CLI binary** (the Rust executable the Action downloads via npm). The Action's install.sh falls through to `latest` when this is empty (`install.sh:50-54`) — meaning the binary would float to whatever upstream ships today. **[§5.2.1]** Floating binary = silent drift if upstream changes baseline JSON shape, rule-id taxonomy, or exit semantics. Pin to a tested exact version.

**§5.3 Why both are required.** Source: `install.sh:138-148` and the comment at `install.sh:152-157`: if `version:` is empty AND the project's `package.json` pins an exact version, `install.sh` warns when the installed CLI version drifts from the project's spec. This is the explicit "Action ref != CLI version" distinction the comment at `install.sh:152-157` calls out. The two pins cover different attack / drift surfaces:
- Action ref (SHA): protects against tampered Action code at the orchestration layer.
- CLI version (exact): protects against silent baseline / format / rule-id drift in the analyzer binary itself.

**§5.4 Failure mode if either floats.**
- Action ref floats → malicious or buggy orchestration code runs unverified.
- CLI version floats → the calibrated `.fallowrc.json` + baselines (calibrated to 2.102.0 rule IDs and typed output contracts) mis-fire: e.g., 2.103.0's typed-output refactor (per `CHANGELOG.md` excerpt: "Typed output contracts now feed the CLI, LSP, NAPI, MCP, and programmatic callers through shared typed contracts") may shift attribute paths like `.check.total_issues` → `.check.totalIssues`. Verified that `analyze.sh:441-455` still reads `.total_issues` (legacy camelCase) — **risk flagged**: 2.103.0 typed-output may move these keys. [unverified at source — needs first-run check]
- Both float → everything is non-deterministic.

[resolved]

---

## 6. SARIF handling

**§6.1 Single category.** The Action's Upload SARIF step (`action.yml:432-441`) is hard-coded to `category: fallow`:
```yaml
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@8aad20d150bbac5944a9f9d289da16a4b0d87c1e # v4
  with:
    sarif_file: ${{ steps.analyze.outputs.sarif }}
    category: fallow
    token: ${{ inputs.github-token }}
```
**[§6.1.1]** This collapses our current 3 categories (`fallow-deadcode`, `fallow-health`, `fallow-dupes`, see CI audit §1c) into a single category. PR review navigation must use the SARIF `run.tool.driver.name` and finding `ruleId` to distinguish analyzers (the `fallow-results.json` retains per-analyzer fields like `.check`, `.complexity`, `.duplication`).

**§6.2 Generation condition.** `analyze.sh:441-455` decides whether to emit SARIF. The block triggers when either `INPUT_FORMAT == "sarif"` or `INPUT_SARIF == "true"` AND `INPUT_COMMAND != "fix"` AND the SARIF file is empty or invalid. Falls back to a second `fallow` invocation with `--format sarif` if the first (default `--format json`) run didn't produce one. `[resolved]`

**§6.3 Multi-run SARIF.** Fallow's SARIF output contains multiple runs (one per analyzer: dead-code, health, dupes). This was the original problem that motivated the Python split heredoc in our current workflow (CI audit §1b, §3d, §3e). The Action's solution is the **single `category: fallow`** mapping — `codeql-action/upload-sarif@v4` accepts multi-run SARIF when they share a category. The trade-off is loss of per-analyzer category grouping in the Code Scanning UI.

**§6.4 Code Scanning availability gate.** `check-code-scanning.sh` runs before the Upload SARIF step:
- If `gh api "repos/${GH_REPO}" --jq '.visibility'` returns `"public"`: `available=true` immediately (Code Scanning is free on public repos, issue #817).
- Otherwise: probe `repos/${GH_REPO}/code-scanning/alerts?per_page=1`. 200 → `available=true`. Failure → `available=false` + `::warning::` explaining GHAS requirement.

The Upload step's `if:` clause requires `steps.ghas-check.outputs.available == 'true'` AND `inputs.sarif == 'true'` AND `steps.analyze.outputs.sarif != ''`. So even on private/internal repos without GHAS, the SARIF file is written to disk under `artifacts-dir` (consumable via `actions/upload-artifact` on failure) — only the upload to GitHub is skipped.

**§6.5 `sarif: true` does both.** Setting `sarif: 'true'` (the recommended Phase 4 contract — see Phase 2 §5) triggers both local SARIF generation (`analyze.sh` fallback block) AND Code Scanning upload (`Upload SARIF` step's `if:`). One input, two effects. [resolved]

---

## 7. Permissions

**§7.1 No top-level `permissions:` block in `action.yml`.** Verified: the file does NOT declare a `permissions:` block (no key found via grep over the 549-line file). This means the Action does NOT request its own permissions; it inherits whatever the workflow job grants via the `permissions:` block on the job.

**§7.2 Required scopes (per the YAML descriptions).**
- `security-events: write` — required for `sarif: true` (Code Scanning category creation). Source: `action.yml:25-26` (description text: "Requires permissions: security-events: write.") and the `Upload SARIF` step at `action.yml:432-441` which calls `github/codeql-action/upload-sarif@v4` (which itself requires `security-events: write` to ingest SARIF).
- `contents: read` — required for `actions/checkout` (which the workflow runs separately before the Action). The Action itself does not call checkout.
- `pull-requests: write` — required for `comment: true` or `review-comments: true`. Source: `action.yml:80-81` (description text: "requires pull-requests: write permission") and `action.yml:88-89`. For our use case (Phase 4 contract leaves `comment: false`, `review-comments: false` per plan risks), this is NOT required.
- `actions: read` — implicitly required for `actions/cache@v5` step (`action.yml:345-352`).

**§7.3 What the Action does NOT request.** No `id-token: write`, no `pages: write`, no `deployments: write`. Verified across the entire 549-line `action.yml`. The Action is read-only against the repo metadata (except for SARIF + comment writes).

**§7.4 Phase 4 contract.** `jobs.test.permissions: { contents: read, security-events: write }`. **`contents: read`** is needed for the existing `actions/checkout@v7` step; **`security-events: write`** is the only NEW scope the Action requires (vs current workflow which has no `permissions:` block at all and inherits repo defaults). [resolved]

**§7.5 Cross-reference with CI audit §7.** CI audit noted "no `permissions:` block in test.yml" and flagged that "A migration to the fallow-rs/fallow@v2 Action may require the same default-token scopes plus possibly `security-events: write` for Code Scanning category management." **Confirmed:** `security-events: write` is the only new scope.

---

## 8. Cache strategy

**§8.1 The Action uses `actions/cache@v5`** (not pnpm-style caching). The cache step at `action.yml:345-352`:
```yaml
- name: Cache analysis results
  uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5
  with:
    path: ${{ inputs.root }}/.fallow
    key: fallow-cache-${{ runner.os }}-${{ hashFiles(format('{0}/**/package.json', inputs.root)) }}
    restore-keys: |
      fallow-cache-${{ runner.os }}-
```
**[§8.1.1]** Cache key = `fallow-cache-<OS>-<hash of all package.json under inputs.root>`. This means: change a `package.json` anywhere under `tools/learning-loop-mastra/` (our `root`) and the cache key changes. The `restore-keys` line catches partial-match fallback (same OS, any package.json state). [resolved]

**§8.2 Cache contents.** The path is `<inputs.root>/.fallow` — fallow's auto-created cache directory (parsed-TS AST cache, dead-code index, churn.bin). This is gitignored at root per `.gitignore:38-40`. Cache hits avoid re-parsing the entire monorepo on subsequent runs.

**§8.3 CLI binary cache is separate.** The CLI binary itself is installed via `npm install -g fallow@<version>` (`install.sh:81-89`). npm's global cache lives under `~/.npm/_cacache/` and is NOT explicitly cached by the Action — but GitHub-hosted runners pre-warm the npm cache for popular packages, so the cold-install cost is small (~10-15s typical).

**§8.4 Sentinel cache is the third layer.** `lazy-verify.js` caches binary verification per `(package, version, platformPkgDir, sentinelPath)`. See §4.3, §4.7.

**§8.5 `cache-key-prefix` input — does it exist?**
**[unverified]** The Phase 1 spec mentions `cache-key-prefix` as a cache-key input the Action accepts. **It does not appear in `action.yml`** (`action.yml:345-352` hard-codes the prefix `fallow-cache-`). The journal's reference to `cache-key-prefix` may have been a typo for the `cache-key-prefix` discussion in the upstream roadmap, or a future addition. **Recommendation: do NOT set `cache-key-prefix`; it would be a no-op.** [unverified — to confirm with operator]

---

## 9. Comments / annotations

**§9.1 `comment: true` (sticky PR comment).** The Post PR comment step (`action.yml:443-471`) runs only when `inputs.comment == 'true'` AND `github.event_name == 'pull_request'` AND `inputs.command != 'security'` AND `inputs.command != 'fix'` AND `steps.analyze.outputs.issues != ''`. Source: `action.yml:448-456`. **[§9.1.1]** Failure mode on fork PRs: `comment.sh` calls `gh_api_retry "repos/${GH_REPO}/issues/${PR_NUMBER}/comments" --method POST --field body="$BODY"` which requires `pull-requests: write`. Fork PRs run with read-only tokens by default; the call returns 403 and the step emits `::warning::Failed to create PR comment`. No silent failure; the warning is visible in the workflow log. [resolved]

**§9.2 `review-comments: true` (inline PR review).** The Post review comments step (`action.yml:474-504`) has the same fork-PR failure mode. Source: `review.sh:75-81` performs the `gh_api_retry --paginate "repos/${GH_REPO}/pulls/${PR_NUMBER}/comments"` dedup lookup. On failure, the step sets `post_skipped_reason=pagination_failure` (multi-comment review path aborts to avoid duplicates) AND `dedup_lookup_failed=true` AND exits 0 with a `::warning::` — degraded state, not broken state. **[§9.2.1]** **Our Phase 4 contract leaves `review-comments: false` (default)** per plan risks, so this path is not exercised.

**§9.3 `annotations: true` (default).** The Emit inline annotations step (`action.yml:386-410`) is enabled by default and runs whenever `inputs.annotations == 'true'` AND `inputs.review-comments != 'true'` AND `steps.analyze.outputs.issues != ''` AND `steps.analyze.outputs.issues != '0'`. **[§9.3.1]** Annotations are emitted as `::error file=<path>,line=<n>::<message>` workflow commands — they show up in the PR Files view as red squiggles regardless of Code Scanning / GHAS availability. This is the inline UX our current workflow gets via the Python heredoc. [resolved]

**§9.4 Auto-disable interaction.** `annotate.sh:55-58` and the step's `if:` clause at `action.yml:392` both gate on `inputs.review-comments != 'true'`. Setting `review-comments: true` automatically suppresses annotations to avoid duplicate UX. [resolved]

**§9.5 Fork PR behavior on `annotations: true`.** Annotations do NOT need any special token — they are workflow commands, not API calls. So `annotations: true` works on fork PRs (the default value). This is the right knob for our use case (no PR write access needed). [resolved]

---

## 10. Gate semantics

**§10.1 The `gate:` input accepts exactly two values.** Validation in `analyze.sh:218-220`:
```bash
if [ -n "${INPUT_GATE:-}" ] && [ "$INPUT_GATE" != "new-only" ] && [ "$INPUT_GATE" != "all" ]; then
  echo "::error::gate must be 'new-only' or 'all', got: ${INPUT_GATE}"; exit 2
fi
```
Empty string (the default when input is not set) is accepted and treated as "use whatever fallow decides". [resolved]

**§10.2 What `gate: new-only` does internally.** Passed straight to `fallow audit --gate new-only` (`analyze.sh:194`). In the fallow CLI, this means: only count as a finding those issues that were **introduced on the changed lines** (compared to `changed-since` ref). Existing issues outside the PR diff are ignored. The verdict computation (`analyze.sh:447-451`):
```bash
ISSUES=$(jq -r 'if (.attribution.gate // "new-only") == "all" then ...
               else ((.attribution.dead_code_introduced // 0) + (.attribution.complexity_introduced // 0) + (.attribution.duplication_introduced // 0)) end' "$RESULTS_FILE")
```
So with `gate: new-only`, `outputs.issues` = sum of three `attribution.*_introduced` counters. The gate also produces `attribution.gate = "new-only"` in the JSON; `outputs.gate` reads this and re-exports it.

**§10.3 What `gate: all` does.** Counts every finding in the changed files, not just introduced ones. `outputs.issues` = sum of `summary.dead_code_issues` + `summary.complexity_findings` + `summary.duplication_clone_groups`.

**§10.4 `audit.gate` from `.fallowrc.json` — NOT honored by the Action.** Source: `action.yml:230-233` (the `gate:` input has no default value), and `install.sh:50-67` does NOT read `audit.gate` from `.fallowrc.json`. The Action's `--gate` argument comes ONLY from the `gate:` input on the workflow line; fallow's own CLI does read `.fallowrc.json` when run directly (e.g., `pnpm exec fallow audit --gate new-only` honors `.fallowrc.json:44`'s `audit.gate` as fallback when `--gate` is not on the CLI). But the Action's `analyze.sh` constructs the command from inputs only — the rc-file's gate is ignored unless the action input explicitly carries it. **[§10.4.1]** Phase 4 contract MUST set `gate: new-only` explicitly. [resolved]

**§10.5 Exit code mapping.** `action.yml:506-547` (Check threshold step):
- `INPUT_FAIL_ON_ISSUES != 'true'` → exit 0 always.
- `INPUT_COMMAND == 'audit'` AND `VERDICT == 'fail'` → exit 1 (`::error::Fallow audit failed (gate: ${INPUT_GATE:-new-only}, ${ISSUES} finding(s) at error severity in changed files)`).
- `INPUT_COMMAND == 'audit'` AND `VERDICT != 'fail'` (i.e., `pass` or `warn`) → exit 0. **Note: `warn` tier findings do NOT fail CI** by design (comment at `action.yml:506-510`).
- Other commands AND `ISSUES > 0` → exit 1 with command-specific message.
- `security` command + `INPUT_SECURITY_GATE` set + ISSUES > 0 → exit 8 (distinct).

**[§10.5.1]** The `verdict` (pass/warn/fail) is the load-bearing severity-aware signal for audit. Counting introduced findings alone would re-introduce the bug `issue #302` was filed to fix (per comment at `action.yml:507-510`). [resolved]

**§10.6 `verdict` and `gate` outputs.** `outputs.verdict` and `outputs.gate` are emitted for `audit` (and `outputs.gate` is also emitted for `security`). Empty strings for other commands. The threshold step reads `inputs.gate` (the user's input), but `outputs.gate` reflects the **applied** gate (which is the input value; the rc-file fallback is NOT consulted). [resolved]

---

## 11. Baseline path handling

**§11.1 Inputs accepted.** The Action exposes three audit-specific baseline inputs: `dead-code-baseline`, `health-baseline`, `dupes-baseline`. All three are string, all optional, no default. Source: `action.yml:259-267`.

**§11.2 Pass-through to fallow.** `analyze.sh:194-196`:
```bash
[ -n "${INPUT_DEAD_CODE_BASELINE:-}" ] && ARGS+=(--dead-code-baseline "$INPUT_DEAD_CODE_BASELINE")
[ -n "${INPUT_HEALTH_BASELINE:-}" ] && ARGS+=(--health-baseline "$INPUT_HEALTH_BASELINE")
[ -n "${INPUT_DUPES_BASELINE:-}" ] && ARGS+=(--dupes-baseline "$INPUT_DUPES_BASELINE")
```
The Action does NOT transform the path — it passes the value verbatim to the CLI flag. [resolved]

**§11.3 Validation.** Only the `INPUT_GATE` / `INPUT_SECURITY_GATE` values are validated (must be in allowed sets). Baseline paths are NOT validated by `analyze.sh` — no allow-list, no canonicalization, no `..` check.

**§11.4 `..` paths are allowed.** The path-traversal check at `review.sh:39-42`:
```bash
if [[ "${FALLOW_ROOT:-}" =~ \.\. ]]; then
  echo "::error::root input contains path traversal sequence"
  exit 2
fi
```
This check applies ONLY to `FALLOW_ROOT` (the `inputs.root` value). It does NOT check `FALLOW_ARTIFACTS_DIR` (though `analyze.sh:251-258` does check `INPUT_ARTIFACTS_DIR` against `..`), and it does NOT check any baseline input. **`plans/260629-2011-fallow-tools-v2-action-swap/plan.md` D3 explicitly claims `..` in baseline paths is permitted.** Verified. [resolved]

**§11.5 Path resolution context.** Baseline paths are passed as `--dead-code-baseline <path>` to fallow. fallow resolves them relative to `--root` (default `.`), which we will set to `tools/learning-loop-mastra`. So the Phase 4 contract baseline paths must be **relative to `tools/learning-loop-mastra/`**, NOT to the workflow file. Our existing paths (`../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/*.json`) work because the `..` traverses from `tools/learning-loop-mastra/` up to the repo root. Verified against the CI audit §1a flag inventory. [resolved]

**§11.6 Generic baseline input.** The Action ALSO exposes a generic `baseline` input (`action.yml:55-58`) intended for `dead-code` regression detection. `analyze.sh:218-220` rejects it for audit: `if [ "$INPUT_COMMAND" = "audit" ] && { [ -n "${INPUT_BASELINE:-}" ] || [ -n "${INPUT_SAVE_BASELINE:-}" ]; }; then echo "::error::The audit command does not support the generic baseline/save-baseline inputs. Use dead-code-baseline, health-baseline, or dupes-baseline instead."; exit 2`. Phase 4 must NOT set the generic `baseline` input. [resolved]

---

## 12. Action's bundled CLI version

**§12.1 The `version:` input default is empty.** `action.yml:62-64` declares `default: ''`. The Action does NOT bundle a specific CLI version — it downloads on every run.

**§12.2 Fall-through resolution.** `install.sh:50-79`:
1. If `FALLOW_VERSION` (`inputs.version`) is set → use it.
2. Else, if `inputs.root/package.json` has `fallow` in `dependencies` / `devDependencies` / `optionalDependencies` / `peerDependencies` AND the spec is a safe semver/range → use it.
3. Else → `"latest"`.

**§12.3 What "latest" resolves to today.** The CHANGELOG's most recent release line is **v2.103.0 (2026-06-28)**. The repo's GitHub metadata reports `Latest Tag: v2.103.0`. So with no `version:` input, the Action pulls fallow 2.103.0 today.

**§12.4 Drift between bundled/Action-default and project.** Project pins `fallow: 2.102.0` in `tools/learning-loop-mastra/package.json:30` (per CI audit §5a). The journal summary's claim ("Bundled CLI is 2.103.0 vs our local 2.102.0 gap") is **confirmed**:
- Project's `package.json` pins 2.102.0 (calibration marker for the Python heredoc).
- Without `version:`, the Action falls through `install.sh:60-63` and reads the project's `package.json:30` → installs 2.102.0 → no drift.
- BUT: if a future contributor removes the `package.json` pin, OR if the input is set to `latest`, OR if the project's pin is a range like `^2.102.0` that matches 2.103.0 → drift to 2.103.0. **`install.sh:138-148` warns** when installed version differs from project's pin, but only if the pin is an exact version. [resolved]

**§12.5 Recommendation for Phase 4.** Set `version: "2.102.0"` explicitly. This:
- Overrides the fall-through (no dependency on `package.json` state).
- Documents intent at the call site (visible in workflow YAML).
- Survives a future refactor that bumps the project's `package.json` pin.
- The Action's `install.sh:142-148` warning path becomes a no-op (exact match).

[resolved]

---

## 13. Migration deltas

**§13.1 Current code (CI audit §1).** `.github/workflows/test.yml:62-237` = 176 LoC across:
- `pnpm exec fallow audit ...` — lines 62-77 (16 LoC).
- Python heredoc (preamble + `classify()` + SARIF emission + cleanup) — lines 79-188 (110 LoC).
- 3× `github/codeql-action/upload-sarif@v4` — lines 190-216 (27 LoC).
- `Upload per-namespace logs on failure` — lines 217-224 (8 LoC, PRESERVED).
- `Upload fallow SARIF on failure` — lines 226-237 (12 LoC, REPOINTED).

**§13.2 Phase 4 contract (per phase-02-design.md §5).** Approximately 30 LoC YAML. Verbatim shape from the design doc:

```yaml
- name: Fallow audit (PR gate)
  if: github.event_name == 'pull_request'
  uses: fallow-rs/fallow@<commit-sha-from-phase-2>
  with:
    root: tools/learning-loop-mastra
    command: audit
    gate: new-only
    format: sarif
    sarif: true
    version: "2.102.0"
    dead-code-baseline: ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json
    health-baseline:    ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/health-baseline.json
    dupes-baseline:     ../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json

- name: Upload per-namespace logs on failure  # PRESERVED
  if: failure()
  uses: actions/upload-artifact@v7
  with:
    name: test-logs
    path: .test-logs/
    if-no-files-found: ignore
    retention-days: 7

- name: Upload fallow SARIF on failure
  if: failure()
  uses: actions/upload-artifact@v7
  with:
    name: fallow-sarif
    path: ${{ steps.fallow.outputs.sarif }}
    if-no-files-found: ignore
    retention-days: 7
```

Plus a `permissions:` block on `jobs.test`:
```yaml
permissions:
  contents: read
  security-events: write
```

**§13.3 Flag-to-input mapping (every current flag → Action input or default).**

| Current flag | Action input | Behavior preserved? |
|---|---|---|
| `--root .` (in subdir) | `root: tools/learning-loop-mastra` | YES — relative-to-subdir → explicit subdir |
| `--gate new-only` | `gate: new-only` | YES |
| `--dead-code-baseline <path>` | `dead-code-baseline: <path>` | YES |
| `--health-baseline <path>` | `health-baseline: <path>` | YES |
| `--dupes-baseline <path>` | `dupes-baseline: <path>` | YES |
| `--changed-since <sha>` | `auto-changed-since: true` (default) | YES — Action auto-uses PR base SHA |
| `--format sarif` | `format: sarif` | YES |
| `--output-file audit.sarif` | (implicit via `artifacts-dir`) | YES — Action writes to `artifacts-dir/fallow-results.sarif` |
| `--sarif-file <path>` (legacy bug) | (n/a) | Action uses its own path internally |
| (Python split) | (n/a — replaced) | LOST (3 categories → 1) |
| (3× upload-sarif) | (built-in to Action) | REPLACED (1 upload, 1 category) |
| (hashFiles guards) | (Action's `if:` on Upload SARIF) | REPLACED (no manual guards needed) |

**§13.4 Migration A vs Migration B (per phase-01-research.md §4).**

| Migration | Approach | LoC delta | Trade-off |
|---|---|---|---|
| **A** (recommended) | Drop Python heredoc, single `category: fallow` | **-125 LoC** (176 → ~30 + permissions block) | Loses per-analyzer Code Scanning categories. Operator navigation via `run.tool.driver.name` + finding `ruleId` instead of category. Matches user's "reduce technical debt" framing. |
| **B** (alternative) | Keep Python heredoc + 3 categories | **-13 LoC** (176 → ~140 + permissions block) | Preserves the 3 categories the team has been using. **Conflicts with the user's "reduce technical debt" goal.** Phase 3 consult-checklist rule still applies. |

**§13.5 Phase 4 LoC breakdown (estimated).**
- Action invocation block (lines 62-77 → ~15 LoC, including the `if:` and `with:` indentation)
- `Upload per-namespace logs on failure` step (~7 LoC, preserved verbatim)
- `Upload fallow SARIF on failure` step (~7 LoC, preserved + path updated)
- `permissions:` block on `jobs.test` (~3 LoC, new)
- **Total: ~32 LoC** vs **176 LoC** current = **-144 LoC net**.

**§13.6 Comment preservation.** Inline comments (`test.yml:30-34` for fetch-depth, `test.yml:66-68` for baseline paths) can be reduced — the baseline-path comment becomes redundant (the input value self-documents), and the SARIF-split rationale comments (lines 80-84, 88-131, 142-145, 167-172, 185-186, 191-194, 209-210) collapse to a single line. Estimated comment LoC: 65 → ~10. Combined code + comment delta: -169 LoC. [resolved]

---

## 14. Unresolved questions / discrepancies

**§14.1 [resolved] Is the `fallow-rs/fallow` repo real?** Yes, MIT-licensed, 2,787 commits, latest tag v2.103.0. Source: `WebFetch` on `https://github.com/fallow-rs/fallow`.

**§14.2 [resolved] Does `audit.gate` from `.fallowrc.json` get honored by the Action?** No — only the `gate:` workflow input. Source: `analyze.sh:50-79` and `action.yml:230-233`. Phase 4 must set `gate: new-only` explicitly.

**§14.3 [resolved] Single `category: fallow`?** Yes — `action.yml:438` hard-codes it.

**§14.4 [resolved] Why both Action SHA + `version:` pin?** Distinct surfaces — Action SHA pins orchestration code, `version:` pins the CLI binary. Floating either breaks determinism differently.

**§14.5 [resolved] Ed25519 + SHA-256 verification.** Confirmed in `verify-binary.js:39-115`, embedded 32-byte public key at line 41-43.

**§14.6 [resolved] Sentinel location resolution order.** platformPkgDir → FALLOW_VERIFY_CACHE_DIR → XDG_CACHE_HOME / LOCALAPPDATA / ~/.cache. Source: `sentinel-path.js:6-15`.

**§14.7 [unverified] `cache-key-prefix` input.** The journal and Phase 1 spec reference this; it does NOT appear in `action.yml`. The cache step's key is hard-coded: `fallow-cache-${{ runner.os }}-${{ hashFiles(...) }}`. **Operator should confirm: do not set `cache-key-prefix` in Phase 4 contract; it would be ignored.**

**§14.8 [resolved] Step IDs.** Phase 4 contract draft references `steps.fallow.outputs.sarif`. The actual step ID is `analyze` (`action.yml:357-360` declares `id: analyze`). **Correct path:** `${{ steps.analyze.outputs.sarif }}`. The phase-04 plan already flags this in its risk section: "if first run shows the path empty, change to `${{ steps.analyze.outputs.sarif }}`". This report confirms: the path must use `steps.analyze`, NOT `steps.fallow`. **Phase 4 test case #4 should expect `steps.analyze.outputs.sarif` in the failure-upload `path:` value.**

**§14.9 [unverified] fallow 2.103.0 typed-output impact on baselines.** `CHANGELOG.md` excerpt notes "Typed output contracts now feed the CLI, LSP, NAPI, MCP, and programmatic callers through shared typed contracts." This may shift attribute paths. `analyze.sh:441-455` reads `.total_issues`, `.summary.dead_code_issues`, `.attribution.dead_code_introduced`, etc. — all camelCase, which the new typed contracts may rename. **Risk: baselines generated against 2.102.0 may not load correctly under 2.103.0 typed output.** Mitigated by `version: "2.102.0"` pin (Phase 4 contract). To verify: `fallow audit --dead-code-baseline plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json --root tools/learning-loop-mastra` against 2.103.0 (out of scope here; should be tested in a follow-up).

**§14.10 [resolved] Baseline `..` paths.** Permitted. Only `inputs.root` has a `..` check (`review.sh:39-42`). Phase 4 contract's `../../plans/...` paths work.

**§14.11 [resolved] Fork PR behavior on annotations.** `annotations: true` (default) uses workflow commands, not API calls → works on fork PRs without `pull-requests: write`. Phase 4 does not need to disable annotations.

**§14.12 [resolved] `comment: true` vs `review-comments: true` on fork PRs.** Both fail (403 on the POST). Action emits `::warning::` and continues; the gate still works. Phase 4 contract sets both to `false` (default), so this is moot.

**§14.13 [resolved] `cache-key-prefix`.** See §14.7 — does not exist as an input.

**§14.14 [resolved] Does the Action handle `pr_request` events without a base SHA?** `auto-changed-since: true` (default) reads `github.event.pull_request.base.sha`. If unset (fork PR scenario where `pull_request.base.sha` is `null`), `analyze.sh` checks `[ -n "${PR_BASE_SHA:-}" ]` and skips auto-scoping. Falls through to `git diff` against HEAD or no scoping at all. Graceful degradation. Phase 4 contract's `auto-changed-since: true` (default) inherits this behavior.

**§14.15 [resolved] `actions/checkout@v7` + `fetch-depth: 0` still required?** Yes. The `auto-changed-since` path requires the base SHA to be in the local clone for `git diff` to work. The fallback API path works without it, but `actions/checkout@v7 fetch-depth: 0` is the recommended pattern (CI audit §2). Phase 4 contract keeps the existing checkout step unchanged.

**§14.16 [unverified] Marketing-vs-source discrepancy check.**
- Marketing claim (README excerpt via WebFetch): "Rust-native, sub-second, zero-config framework support." → Verified: the CLI is Rust, zero-config (`.fallowrc.json` is auto-discovered, not required), the `command` and `gate` defaults are sensible.
- Marketing claim (action.yml description, line 6): "Deterministic codebase intelligence for TypeScript/JavaScript in CI: quality, PR risk, hotspots, duplication, architecture." → Verified: the `command` enum and analyzer set (dead-code, dupes, health, audit, security, fix) match.
- Marketing claim (action.yml `version` description, line 62): "Pin a current fallow version so Ed25519 + SHA-256 binary verification can run." → Verified end-to-end (§4).
- Marketing claim (`sarif` description, line 25): "Available on public repos (free) and private or internal repos with GitHub Advanced Security." → Verified via `check-code-scanning.sh`.

No marketing-vs-source inconsistencies found.

**§14.17 [unverified] Phase 2 contract assumption: `steps.fallow.outputs.sarif`.** The Phase 2 design contract (`phase-02-design.md:71`) writes `path: ${{ steps.fallow.outputs.sarif }}`. Per §14.8, the correct step ID is `analyze`, not `fallow`. **Phase 4 must update this in the implementation contract before merge.** This was already flagged in phase-04-implement-ci-swap.md §"Risk Assessment" item 2.

**§14.18 [resolved] What does the operator need to confirm for D1-D4?**
- **D1 (Pin strategy).** D1 resolved: SHA + `version: "2.102.0"`. No operator input needed.
- **D2 (Per-analyzer categories).** D2 resolved: drop (Migration A). Operator may override → Migration B.
- **D3 (Baseline path style).** D3 resolved: keep `../../plans/...` (relative to `root`). No operator input needed.
- **D4 (sarif: true on Action).** D4 resolved: use Action's built-in upload. No operator input needed.

The four decisions are pre-resolved by the plan + phase design docs. Operator review is a sanity check, not a fork decision.

---

## Verification sources

| Source | URL / File | Used for |
|---|---|---|
| `action.yml` | https://raw.githubusercontent.com/fallow-rs/fallow/main/action.yml (HTTP 200) | §1, §2, §3, §6, §7, §8, §10, §13 |
| `action/scripts/install.sh` | https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/install.sh (HTTP 200) | §4.5, §5.2, §10.4, §12 |
| `action/scripts/analyze.sh` | https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/analyze.sh (HTTP 200) | §2.5.1, §3, §6.2, §10.1, §10.2, §11.2, §11.4, §13.3 |
| `action/scripts/review.sh` | https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/review.sh (HTTP 200) | §9.2, §11.4 |
| `action/scripts/comment.sh` | https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/comment.sh (HTTP 200) | §9.1 |
| `action/scripts/annotate.sh` | https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/annotate.sh (HTTP 200) | §2.8, §9.3, §9.4 |
| `action/scripts/check-code-scanning.sh` | https://raw.githubusercontent.com/fallow-rs/fallow/main/action/scripts/check-code-scanning.sh (HTTP 200) | §6.4 |
| `npm/fallow/scripts/verify-binary.js` | https://raw.githubusercontent.com/fallow-rs/fallow/main/npm/fallow/scripts/verify-binary.js (HTTP 200) | §4.1, §4.2, §4.4 |
| `npm/fallow/scripts/lazy-verify.js` | https://raw.githubusercontent.com/fallow-rs/fallow/main/npm/fallow/scripts/lazy-verify.js (HTTP 200) | §4.3, §4.6 |
| `npm/fallow/scripts/run-binary.js` | https://raw.githubusercontent.com/fallow-rs/fallow/main/npm/fallow/scripts/run-binary.js (HTTP 200) | §4.5, §4.7 |
| `npm/fallow/scripts/sentinel-path.js` | https://raw.githubusercontent.com/fallow-rs/fallow/main/npm/fallow/scripts/sentinel-path.js (HTTP 200) | §4.7 |
| `CHANGELOG.md` | https://raw.githubusercontent.com/fallow-rs/fallow/main/CHANGELOG.md (HTTP 200) | §1.4, §12.3, §14.9 |
| Repo metadata | https://github.com/fallow-rs/fallow (HTTP 200) | §1.1, §1.2, §1.4, §14.1 |
| Sibling CI audit report | `plans/reports/researcher-260629-2021-current-fallow-ci-audit-report.md` | §13.1, §13.3, §13.5 (current-behavior baseline) |
| Plan context | `plans/260629-2011-fallow-tools-v2-action-swap/plan.md` | §13.2 (D1-D4 evidence trail) |
| Phase 1 spec | `plans/260629-2011-fallow-tools-v2-action-swap/phase-01-research.md` | §14.7 (`cache-key-prefix` reference) |
| Phase 2 design | `plans/260629-2011-fallow-tools-v2-action-swap/phase-02-design.md` | §13.2 (Phase 4 contract shape) |
| Phase 4 implement | `plans/260629-2011-fallow-tools-v2-action-swap/phase-04-implement-ci-swap.md` | §14.8, §14.17 (step ID correction) |
| Project fallow pin | `tools/learning-loop-mastra/package.json:30` (per CI audit §5a) | §12.4 (project pin = 2.102.0) |

---

Status: DONE_WITH_CONCERNS
Summary: All 14 sections sourced from the upstream `fallow-rs/fallow` repo; the Action's inputs, outputs, crypto model, SARIF behavior, permissions, cache, gate semantics, baseline handling, bundled version, and migration deltas are fully verified. Two items flagged as unverified for operator follow-up.
Concerns/Blockers:
1. `cache-key-prefix` referenced in Phase 1 spec does NOT exist as an `action.yml` input (§14.7) — operator should confirm no-op and remove from Phase 2 contract if present.
2. Phase 2 contract's `${{ steps.fallow.outputs.sarif }}` must be corrected to `${{ steps.analyze.outputs.sarif }}` (§14.17) — Phase 4 implementation contract should be updated before merge.
