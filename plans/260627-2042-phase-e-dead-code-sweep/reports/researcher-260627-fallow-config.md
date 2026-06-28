# Fallow Dead-Code Configuration for Learning Loop

**Plan:** `plans/260627-2042-phase-e-dead-code-sweep/`
**Working dir:** `tools/learning-loop-mastra/`
**Tool verified locally:** `fallow 2.102.0` (`fallow --version`)
**Branch:** `260627-1304-phase-e-mechanism-a-b-plan`
**Repo type:** Node ESM (`"type": "module"`), root `package.json` with subpath imports `#mastra/*` and `#lib/*`; mastra package has no own `package.json`. Not an npm-workspaces / pnpm-workspaces monorepo, so fallow's workspace auto-detection will not fire unless `workspaces.patterns` is set.

All claims about fallow behavior are cited. Items I could not confirm against the docs or a local run are marked `[UNVERIFIED]`.

---

## 1. `.fallowrc.json` shape for this codebase

### 1.1 What fallow reads from your tree by default

- Auto-detects `package.json` `main`, `module`, `types`, `source`, `browser`, `bin`, and `exports` fields as entry points. (https://docs.fallow.tools/configuration/overview.md)
- Auto-detects `package.json` `scripts` and credits referenced files. (https://docs.fallow.tools/explanations/dead-code.md)
- `fallow init` produces a minimal `{ "$schema": "...", "rules": {} }` and auto-detects framework / monorepo / TS setups. (https://docs.fallow.tools/cli/init.md)
- Config file search order: `.fallowrc.json`, `.fallowrc.jsonc`, `fallow.toml`, `.fallow.toml` — first-match-wins walking up to the workspace root. (https://docs.fallow.tools/configuration/overview.md)

### 1.2 Project-specific facts that drive the config

- Root `package.json` declares subpath imports `#mastra/*` -> `./tools/learning-loop-mastra/*` and `#lib/*` -> `./tools/lib/*`. `tools/learning-loop-mastra/mastra/server.js` is the runtime entry (run via `gate:server`). Fallow's default resolution will not credit subpath-import targets unless they appear under a normal `import "..."` graph, so the entry list must explicitly include `server.js`.
- The tool registry is a **JSON manifest** (`tools/manifest.json`, 31 entries) consumed by `server.js` lines 26-40 via dynamic `await import(\`../tools/legacy/${file.replace('tools/', '')}\`)`. Fallow's static analysis **cannot statically follow a `import(template-literal-with-runtime-value)`** call.
  - Docs: "Computed keys, conditionals, factory functions, and dynamic `require()` don't [work]. Add undetected entry points via `entry` config." (https://docs.fallow.tools/analysis/limitations.md)
  - **Mitigation**: list `tools/legacy/<each-file>.js` as entries via `dynamicallyLoaded` (semantically correct) or `entry`.
- `__tests__/legacy-mcp/` and `__tests__/fixtures/` exist; per spec, exclude `__tests__/legacy-mcp/` but not the broader `__tests__/` (which contains active parity tests). Use `ignorePatterns` (exclude files entirely) vs `ignoreExports` (suppress specific findings). (https://docs.fallow.tools/configuration/overview.md)
- `scout/legacy/` is mentioned by spec; from `ls tools/` it lives inside `tools/learning-loop-mcp/`. Confirmed.
- `plans/` is doc-only and should be excluded.
- Tests live under `tools/learning-loop-mastra/__tests__/` (`*.test.cjs`, `*.test.js`) and `tools/learning-loop-mastra/core/__tests__/` (`*.test.js`). Production mode auto-excludes `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `*.stories.*`. (https://docs.fallow.tools/analysis/production-mode.md)

### 1.3 Recommended `.fallowrc.json` (place at `tools/learning-loop-mastra/.fallowrc.json`)

The file should sit at the **mastara subdir root**, not the repo root, so fallow's `--root` resolves there.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",

  // --- Entry points -------------------------------------------------------
  "entry": [
    "mastra/server.js",
    "mastra/create-loop-tool.js",
    "mastra/create-loop-workflow.js",
    "mastra/create-loop-agent.js",
    "mastra/legacy-handler-adapter.js",
    "mastra/agents/load-agents-manifest.js",
    "mastra/schemas.js",
    "mastra/schema-parity.js",
    "storage.js",
    "scripts/**"
  ],

  // --- Files loaded dynamically that fallow cannot statically resolve ----
  // Each row of tools/manifest.json resolves to a legacy/* file at runtime
  // via template-literal import. Start with a glob for the baseline sweep,
  // then harden to one row per manifest entry for CI.
  "dynamicallyLoaded": [
    "tools/legacy/**/*.js"
  ],

  // --- Files excluded entirely --------------------------------------------
  "ignorePatterns": [
    "__tests__/legacy-mcp/**",
    "__tests__/fixtures/**",
    "tools/legacy/evals/**",
    "tools/legacy/references/**",
    "tools/legacy/fixtures/**",
    "scout/legacy/**",
    "plans/**",
    "docs/**",
    "**/*.test.js", "**/*.test.cjs", "**/*.spec.js", "**/*.spec.cjs"
  ],

  // --- Rule severities (defaults from `fallow config-schema`) -------------
  "rules": {
    "unused-files": "error",
    "unused-exports": "warn",
    "unused-deps": "error",
    "unused-dev-deps": "warn",
    "circular-deps": "error",
    "boundary-violation": "off",
    "unresolved-imports": "error",
    "duplicate-exports": "error",
    "stale-suppressions": "warn"
  },

  // --- Audit gate (used by `fallow audit`, see §4) ------------------------
  "audit": {
    "gate": "new-only"
  },

  // --- Regression baseline defaults (used by §5) ---------------------------
  "regression": {
    "path": ".fallow/regression-baseline.json"
  },

  "cache": {
    "enabled": true
  }
}
```

### 1.4 Why `dynamicallyLoaded` (and not just `entry`) for the manifest

`dynamicallyLoaded` is documented under top-level schema keys (`fallow config-schema` lists `"dynamicallyLoaded": { "type": "array", "items": { "type": "string" } }`). The conceptual description: "Files loaded at runtime treated as entry points" (https://docs.fallow.tools/configuration/overview.md) — exactly the case for `tools/manifest.json` driving `import("...")` in `server.js`. Docs explicitly call out the limitation: dynamic `require()` / computed-key imports cannot be followed and must be listed. (https://docs.fallow.tools/analysis/limitations.md)

**Alternative**: `entry` is documented as doing the same job ("Additional entry point glob patterns"). Either works; `dynamicallyLoaded` is more semantically honest about *why* the file is there.

### 1.5 Why `--root tools/learning-loop-mastra/`

Per `fallow --help`: "`-r, --root <ROOT>` Project root directory". The mastra package is the analysis target; running fallow with `--root tools/learning-loop-mastra/` keeps node_modules resolution local and avoids accidentally analyzing `product/` or `tools/scripts/`.

---

## 2. Tool-registry entry-point configuration

### 2.1 The pattern in this repo

`tools/manifest.json` (31 entries) is consumed by a single dynamic `import()` loop in `server.js` lines 26-40. The loop uses template-literal `import(\`../tools/legacy/${file.replace('tools/', '')}\`)` where `file` comes from the JSON. Static analysis cannot resolve this at all.

### 2.2 Two viable configurations, ranked

| Option | Setup cost | Robustness | When to prefer |
|---|---|---|---|
| **A. Explicit `dynamicallyLoaded` list** | Medium — one row per manifest entry; need to keep in sync | High — every legacy wrapper is credited by name | Manifest entries are stable and curated; you want each visibly "marked used" |
| **B. `dynamicallyLoaded` with a glob** (recommended for first sweep) | Low — `"tools/legacy/*.js"` | Medium — credits all wrappers including newly-added ones | Manifest may grow; you want fallow to follow it automatically |

**Recommendation: Option B** for the first scan (lowest friction), then Option A in CI to make every wrapper an explicit allowlist.

### 2.3 Keeping the config in sync with the manifest

Add a comment near `dynamicallyLoaded`: "Mirror `tools/manifest.json` rows here. CI will fail if a row is added without updating this list." Enforced by `unused-files: error`.

---

## 3. How `--output-file <PATH>` works

### 3.1 From the docs

> **`-o, --output-file <PATH>`** — Write the report to a file instead of stdout, for any `--format` (no ANSI codes). Useful on large projects where the terminal scrollback truncates the top. Progress and a `Report written to <path>` confirmation stay on stderr (suppressed by `--quiet`). Valid with `dead-code`, `dupes`, `health`, `security`, and bare invocation; composes with `--sarif-file`. (https://docs.fallow.tools/cli/global-flags.md)

Verified locally in `fallow dead-code --help` and `fallow audit --help`: both show `-o, --output-file <PATH>`.

### 3.2 Mechanics

- Writes the rendered report to `<PATH>` (any `--format` supported).
- No ANSI escape codes in the file — clean for downstream parsing.
- Progress bars and the confirmation line stay on stderr (suppressed by `--quiet`).
- Composes with `--sarif-file` (markdown for humans + SARIF for GitHub in one run).
- The confirmation line on stderr is the only signal of success; in CI logs grep for `Report written to` if `--quiet` is on.

### 3.3 Capturing large outputs without context bloat

**Pattern 1: file + summary on stdout** (best for local triage)

```bash
fallow dead-code \
  --root tools/learning-loop-mastra \
  --format json \
  -o reports/fallow/dead-code.json \
  --summary
```

**Pattern 2: SARIF + markdown twin outputs**

```bash
fallow dead-code \
  --root tools/learning-loop-mastra \
  --format markdown \
  -o reports/fallow/dead-code.md \
  --sarif-file reports/fallow/dead-code.sarif \
  --quiet
```

**Pattern 3: pipe via redirect** (works but loses stderr separation)

```bash
fallow dead-code --format json --quiet > reports/fallow/dead-code.json 2> reports/fallow/dead-code.err
```

Prefer `-o` over `>` because `-o` does not write ANSI codes and keeps progress on stderr.

### 3.4 Important caveat: `--output-file` + `--ci`

`--ci` is documented as "equivalent to `--format sarif --fail-on-issues --quiet`" (https://docs.fallow.tools/cli/dead-code.md). When you set `--ci`, `--format sarif` is forced — passing `-o` writes the SARIF to the file, which is fine; exit code gates CI.

---

## 4. `--ci` vs `--audit` for a PR diff check

### 4.1 What `--ci` is

A flag, not a subcommand. Sets `--format sarif --fail-on-issues --quiet`. (https://docs.fallow.tools/cli/dead-code.md) Available on `dead-code`, `audit`, `dupes`, `health`, and bare invocation. Verified locally in `fallow dead-code --help`.

### 4.2 What `fallow audit` is (the subcommand)

- Combines dead-code + complexity + duplication scoped to changed files.
- Returns a verdict: `pass` / `warn` / `fail`.
- Honors rule severity — `warn`-tier finding is informational, not blocking.
- Distinguishes introduced vs inherited findings (default gate: `new-only`).
- Auto-detects base ref from PR (uses `origin/HEAD`, `origin/main`, `origin/master`); pin via `FALLOW_AUDIT_BASE`.
- Rejects global `--baseline` / `--save-baseline` with exit 2 — uses per-analysis `--dead-code-baseline`, `--health-baseline`, `--dupes-baseline`.
- Has `--brief` / `--walkthrough-guide` modes that always exit 0 for agent consumption.
- (https://docs.fallow.tools/cli/audit.md, verified locally)

### 4.3 Decision table

| Concern | `fallow dead-code --ci` | `fallow audit --ci` |
|---|---|---|
| Scope | Dead-code only | Dead-code + complexity + dupes |
| Severity awareness | None — any finding blocks | Honors `error`/`warn`/`off` rules |
| Verdict semantics | Binary (exit 1/0) | `pass`/`warn`/`fail` |
| Inherited findings | All reported; all gate | Reported as inherited; only new gate (default `new-only`) |
| Regression baseline | `--regression-baseline` / `--save-regression-baseline` directly | Per-analysis baselines only |
| SARIF output | Yes via `--ci` | Yes via `--format sarif` / `--sarif-file` |
| Use case | Tight inner loop; any finding blocks | Realistic PR gate; warn-tier is advisory |
| Agent-friendly | Less so | `--brief` / `--walkthrough-guide` always exit 0 |

### 4.4 Recommendation: use `fallow audit` (the subcommand) for the PR guard

With `--gate new-only` (the default), `--brief` for agent mode:

```bash
# Default mode — gates the merge
fallow audit \
  --root tools/learning-loop-mastra \
  --format pr-comment-github \
  --gate new-only \
  --dead-code-baseline "$ROOT/.fallow/dead-code-baseline.json" \
  --health-baseline "$ROOT/.fallow/health-baseline.json" \
  --dupes-baseline "$ROOT/.fallow/dupes-baseline.json" \
  --changed-since origin/main \
  -o "$OUT/audit-pr.md"

# Agent/review mode — always exits 0, surfaces decisions
fallow audit \
  --root tools/learning-loop-mastra \
  --brief \
  --format json \
  -o reports/fallow/audit-brief.json \
  --quiet
```

**Why `audit` over `dead-code --ci`**: (1) you want complexity and duplication findings too; (2) you want `warn`-tier findings reported but not blocking; (3) you want introduced-vs-inherited attribution; (4) `audit` scales better as the canonical PR-degradation gate.

**When `dead-code --ci` is better**: in lint-staged pre-commit hooks. Per docs: "Useful for lint-staged pre-commit hooks" for `--file`. (https://docs.fallow.tools/cli/dead-code.md)

---

## 5. `--regression-baseline` + `--save-regression-baseline` workflow

### 5.1 What they do

From `fallow dead-code --help` (verified locally) and https://docs.fallow.tools/cli/dead-code.md:

| Flag | Behavior |
|---|---|
| `--save-regression-baseline <PATH>` | Save current issue **counts** (not fingerprints). Default `.fallow/regression-baseline.json`. |
| `--regression-baseline <PATH>` | Path to an existing regression baseline. |
| `--fail-on-regression` | Exit 1 if current count > baseline + tolerance. |
| `--tolerance <N>` | Allowed increase: `"2%"` (percentage) or `"5"` (absolute). Default `"0"`. |

Output JSON includes a `regression` object:

```json
{
  "regression": {
    "status": "pass",
    "baseline_total": 42,
    "current_total": 45,
    "delta": 3,
    "tolerance": 2.0,
    "tolerance_kind": "percentage",
    "exceeded": false
  }
}
```

### 5.2 Regression baseline vs unused-exports baseline (two distinct features)

- `--save-baseline <PATH>` / `--baseline <PATH>` save **fingerprints** (file + export + type). Used for incremental adoption: "fail only on issues not in the baseline". Baselines survive refactors as long as export names stay stable. (https://docs.fallow.tools/explanations/dead-code.md)
- `--save-regression-baseline` / `--regression-baseline` save **counts**. Used for tracking cleanup progress: "did this PR add or remove dead code relative to last measurement?"

### 5.3 Workflow for tracking cleanup over time

```bash
# Step 1 — Establish baseline once on main:
fallow dead-code \
  --root tools/learning-loop-mastra \
  --format json \
  -o reports/fallow/dead-code.json \
  --save-regression-baseline .fallow/regression-baseline.json \
  --quiet

# Commit .fallow/regression-baseline.json (unlike .fallow/cache/, the
# baseline must be in git so CI can read it).

# Step 2 — On every PR, gate on the regression:
fallow dead-code \
  --root tools/learning-loop-mastra \
  --format sarif \
  --sarif-file reports/fallow/dead-code.sarif \
  --regression-baseline .fallow/regression-baseline.json \
  --fail-on-regression \
  --tolerance 0 \
  --quiet

# Step 3 — Regenerate baseline on main after merge:
fallow dead-code \
  --root tools/learning-loop-mastra \
  --save-regression-baseline .fallow/regression-baseline.json \
  --quiet

# Step 4 — Early rollout with cushion:
fallow dead-code \
  --root tools/learning-loop-mastra \
  --format sarif \
  --sarif-file reports/fallow/dead-code.sarif \
  --regression-baseline .fallow/regression-baseline.json \
  --fail-on-regression \
  --tolerance 2% \
  --quiet
```

### 5.4 Baseline lifecycle rules

- **Tolerance `0` is the goal**: a PR removing two unused exports while adding one has delta -1 — passes with `--tolerance 0`. Use tolerance only as ramp-up cushion, then tighten.
- **Regenerate on main only**: PRs can drift counts up locally (WIP), but only the post-merge main baseline is the source of truth.
- **Counts vs fingerprints**: regression baselines are aggregate; pair with `--baseline <fingerprints>` when you need line-level diffs.
- **Cross-analysis**: `fallow audit` **rejects** the global `--regression-baseline` flag. (https://docs.fallow.tools/cli/audit.md) For regression tracking on the audit pipeline, use per-analysis fingerprint baselines.

---

## 6. Gotchas

### 6.1 Manifest-driven dynamic import is invisible to static analysis

Fallow is a syntactic analyzer — it cannot follow `import(\`../tools/legacy/${file}\`)`. Every legacy tool wrapper would be reported as unused unless listed in `entry` or `dynamicallyLoaded`. (https://docs.fallow.tools/analysis/limitations.md)

**Mitigation**: §1.4. Keep `dynamicallyLoaded` in sync with `tools/manifest.json`; add a CI check that fails if a manifest row has no corresponding `dynamicallyLoaded` entry.

### 6.2 Subpath imports (`#mastra/*`) may not be resolved

Root `package.json` declares:

```json
"imports": {
  "#mastra/*": "./tools/learning-loop-mastra/*",
  "#lib/*": "./tools/lib/*"
}
```

Fallow's `exports`-field and tsconfig path-alias support is documented (https://docs.fallow.tools/configuration/workspaces.md) but the `imports` field (Node subpath imports) is not explicitly mentioned. **Mitigation**: run `fallow list` and `fallow inspect core/list-probes.js` after writing the config; if subpath imports show up as `unresolved-imports`, add `"resolve": { "alias": { "#mastra": "tools/learning-loop-mastra" } }` or list the file under `entry`.

### 6.3 ESM vs CJS resolution

The repo is pure ESM (`"type": "module"`). Empirically, fallow supports `.js`, `.cjs`, `.mjs`, `.ts`, `.tsx`, `.jsx`. Mixed ESM/CJS works as long as extensions are correct.

**Mitigation**: confirm with `fallow list --root tools/learning-loop-mastra`; if anything in `__tests__/` (`.cjs`) is misparsed, use `ignorePatterns` rather than fighting with config.

### 6.4 Test files and fixtures

Production mode (https://docs.fallow.tools/analysis/production-mode.md) auto-excludes `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `*.stories.*`. It does **not** exclude `__tests__/fixtures/` automatically. Per spec, exclude `__tests__/legacy-mcp/` and `__tests__/fixtures/` explicitly.

**Mitigation**: keep `production: false` (or omit it) and use `ignorePatterns` to exclude only the legacy harness and fixtures. That way, parity tests in `__tests__/agent-parity.test.cjs` etc. are still credited as reachable from `server.js`.

### 6.5 Monorepo detection — package is a subdir, not an npm workspace

Root `package.json` does **not** declare `workspaces`; no `pnpm-workspace.yaml`. Fallow's monorepo auto-detection will **not** fire.

**Mitigation**: always pass `--root tools/learning-loop-mastra` explicitly.

### 6.6 `core/list-probes.js` exports look unused to fallow

`list-probes.js` (verified read) exports `listProbes`. From the codebase it is consumed only by `__tests__/legacy-mcp/list-probes.test.js`. Once `dynamicallyLoaded` is set, fallow should still flag `listProbes` as an unused EXPORT (because the export is imported only by tests, and tests are excluded). This is exactly the smoking-gun pattern we want fallow to surface.

**Mitigation**: this is the discovery mechanism, not a bug — the export should be flagged so Phase 3 can delete it.

### 6.7 Ignore patterns vs ignore exports

`ignorePatterns` excludes a file from analysis entirely. `ignoreExports` suppresses unused-export findings for specific files (but the file is still analyzed for other issues). `ignoreDependencies` skips a package. (https://docs.fallow.tools/configuration/overview.md)

**Mitigation**: default to `ignorePatterns` only for files you want to disappear from every analysis (fixtures, snapshots, plans). Use `ignoreExports` when you want fallow to keep analyzing the file (for cycles, complexity) but not flag its exports.

### 6.8 `overrides.rules.re-export-cycle` is a no-op

> `overrides.rules` is a no-op because the rule spans multiple files. (https://docs.fallow.tools/explanations/dead-code.md)

**Mitigation**: don't bother setting per-folder severity for `re-export-cycle`. Set it globally in `rules.re-export-cycle`.

### 6.9 Type-only cycles vs re-export cycles

> Type-only cycles (`import type`) are filtered from `circular-dependency` but NOT from `re-export-cycle`. (https://docs.fallow.tools/explanations/dead-code.md)

**Mitigation**: if you hit re-export cycle warnings from `import type` lines, look for actual value-level `export ... from` chains first.

### 6.10 `unused-exports` and the tool registry

If you list every legacy wrapper in `dynamicallyLoaded` AND in `entry`, fallow credits both the file and all of its named exports. But it does **not** recursively credit re-exports from those files. If a tool file re-exports from `lib/`, you need to also list `lib/` entries. The 31-row manifest imports from `lib/` via subpath imports — see §6.2.

### 6.11 `--ci` overrides individual flags but not config

> Individual flags override [--ci's implied settings]. (https://docs.fallow.tools/cli/dead-code.md)

**Mitigation**: if you want `--ci` semantics but a custom output file, just pass `-o` alongside `--ci`. If you want `--ci` but a different format, you must pass `--format` explicitly and lose the SARIF default.

### 6.12 Audit needs a base ref

> Audit needs a base ref. The action and GitLab CI template auto-detect the PR/MR base. On non-PR pipelines (release branches, scheduled jobs), set `changed-since` (`FALLOW_CHANGED_SINCE`) explicitly; the runners hard-error rather than silently analyzing nothing. (https://docs.fallow.tools/integrations/ci.md)

**Mitigation**: in scheduled nightly sweeps, always pass `--changed-since origin/main`.

### 6.13 Baseline files should be checked in

Unlike `.fallow/cache/` (gitignored by `fallow init`), `.fallow/regression-baseline.json` and `.fallow/dead-code-baseline.json` need to be in git so CI can read them. `fallow init` adds `.fallow/` to `.gitignore` — create a subfolder `.fallow/baselines/` and add an explicit `!.fallow/baselines/` exception, or commit the baseline files at the project root.

### 6.14 `audit` baseline file format mismatch

The global `--baseline` / `--save-baseline` flags are rejected with exit code 2 on `fallow audit` because the three sub-analyses use different baseline formats. Verified locally in `fallow audit --help`: "The global --baseline / --save-baseline flags are rejected on audit."

**Mitigation**: when wiring `audit`, always use `--dead-code-baseline`, `--health-baseline`, `--dupes-baseline`.

### 6.15 LSP byte-column squiggles for non-ASCII

> Multi-byte characters (emoji, CJK) cause squiggle misalignment. Cosmetic only; line numbers and paths remain correct. (https://docs.fallow.tools/analysis/limitations.md)

**Mitigation**: don't trust column numbers in `compact` format when lines have CJK or emoji. Line numbers are reliable.

---

## 7. Concrete command sequence: baseline → triage → CI guard

### Phase A — Baseline (one-time, on main)

```bash
ROOT=tools/learning-loop-mastra
OUT=plans/260627-2042-phase-e-dead-code-sweep/reports/fallow

mkdir -p "$OUT"

# A1. Fingerprint baseline (line-level "fail only on new issues")
fallow dead-code \
  --root "$ROOT" \
  --format json \
  -o "$OUT/dead-code-baseline.json" \
  --save-baseline "$ROOT/.fallow/dead-code-fingerprint-baseline.json" \
  --quiet

# A2. Regression-count baseline (trend tracking)
fallow dead-code \
  --root "$ROOT" \
  --save-regression-baseline "$ROOT/.fallow/regression-baseline.json" \
  --quiet

# A3. Companion baselines for audit
fallow health \
  --root "$ROOT" \
  --save-baseline "$ROOT/.fallow/health-baseline.json" \
  --quiet

fallow dupes \
  --root "$ROOT" \
  --save-baseline "$ROOT/.fallow/dupes-baseline.json" \
  --quiet
```

Commit `tools/learning-loop-mastra/.fallow/{dead-code-fingerprint-baseline,health-baseline,dupes-baseline,regression-baseline}.json` to git.

### Phase B — Triage (interactive, against the baseline)

```bash
ROOT=tools/learning-loop-mastra
OUT=plans/260627-2042-phase-e-dead-code-sweep/reports/fallow

# B1. Compact delta from fingerprint baseline
fallow dead-code \
  --root "$ROOT" \
  --format compact \
  --baseline "$ROOT/.fallow/dead-code-fingerprint-baseline.json" \
  -o "$OUT/dead-code-delta.txt" \
  --quiet

# B2. Markdown report for human review
fallow dead-code \
  --root "$ROOT" \
  --format markdown \
  -o "$OUT/dead-code.md" \
  --quiet

# B3. SARIF for upload
fallow dead-code \
  --root "$ROOT" \
  --format sarif \
  --sarif-file "$OUT/dead-code.sarif" \
  --quiet
```

After fixes are merged, regenerate the regression baseline on main (re-run A2).

### Phase C — PR guard (every PR)

```bash
ROOT=tools/learning-loop-mastra
OUT=plans/260627-2042-phase-e-dead-code-sweep/reports/fallow

# C1. Primary PR gate — severity-aware, distinguishes introduced vs inherited
fallow audit \
  --root "$ROOT" \
  --format pr-comment-github \
  --gate new-only \
  --dead-code-baseline "$ROOT/.fallow/dead-code-baseline.json" \
  --health-baseline "$ROOT/.fallow/health-baseline.json" \
  --dupes-baseline "$ROOT/.fallow/dupes-baseline.json" \
  --changed-since origin/main \
  -o "$OUT/audit-pr.md"

# C2. SARIF twin for code-scanning upload
fallow audit \
  --root "$ROOT" \
  --format sarif \
  --sarif-file "$OUT/audit.sarif" \
  --gate new-only \
  --changed-since origin/main \
  --quiet
```

`audit` exit code gates the merge. SARIF uploads via `github/codeql-action/upload-sarif`.

---

## 8. Unresolved questions

- **Subpath-import resolution (`#mastra/*`)**: docs cover `exports` field and tsconfig `paths`, but not Node's `imports` field. Local verification needed.
- **`dynamicallyLoaded` glob semantics**: schema accepts strings; docs do not explicitly confirm globs. Local `fallow list` test would confirm.
- **`core/list-probes.js` consumers**: I read the file but did not grep all consumers in this session. The hook in `tools/learning-loop-mcp/hooks/inbound-state.js` is the documented one; confirm with `grep -r listProbes tools/`.
- **Whether `dev:api` / `smoke:vci` scripts trip fallow's unused-dependency rule** for `uv`/`pytest` packages — they aren't in `package.json` dependencies, so invisible to the JS analyzer.
- **`audit --regression-baseline` flag**: explicitly rejected (exit 2). To do regression tracking on the audit pipeline, you must use `--dead-code-baseline` etc. with the matching format (fingerprints, not counts). Whether the count-regression gap in `audit` is by design or simply missing is unverified.

---

## 9. Summary

For this codebase, place `.fallowrc.json` at `tools/learning-loop-mastra/.fallowrc.json`, run fallow with `--root tools/learning-loop-mastra`, list `mastra/server.js` plus every legacy wrapper in `dynamicallyLoaded` (start with `"tools/legacy/**/*.js"` glob, harden to one row per manifest entry in CI), exclude `__tests__/legacy-mcp/`, `__tests__/fixtures/`, `plans/`, and `docs/` via `ignorePatterns`. Use `fallow audit --gate new-only` as the PR guard and `fallow dead-code --save-regression-baseline` for trend tracking; regenerate the count baseline on `main` after each cleanup merge. Always pass `-o <path>` for baseline outputs to avoid context bloat. The biggest gotchas are the manifest-driven dynamic import (mitigated by `dynamicallyLoaded`) and Node subpath imports `#mastra/*` (verify locally with `fallow list`).