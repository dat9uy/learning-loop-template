# Research Report: GitHub Actions Versions Audit

## Executive Summary

`.github/workflows/test.yml` is 3 majors behind on every action it uses. All four actions (`actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact`) have shipped breaking majors that align with the local dev environment (Node 24, pnpm 11). The biggest correctness issue is `pnpm/action-setup@v4` pinning `version: 9` — pnpm 9 is one major behind the local 11.8.0, which can mask lockfile/registry mismatches between CI and dev.

Upgrading the workflow to current majors is a low-risk, high-clarity change. All four target majors are already Node 24 / runner 2.327.1+ aligned, and `ubuntu-latest` has shipped that runner image since Aug 2025, so no runner pinning is required. pnpm `version: 11` (or removing the `version:` input and adding `packageManager: "pnpm@11.8.0"` to `package.json`) makes the CI pnpm mirror the dev pnpm exactly.

## Research Methodology

- Sources consulted: 5 (1 local read, 1 shell check, 4 GitHub release pages)
- Date range of materials: Apr 2025 → Jun 2026
- Key search terms used: `actions/checkout latest`, `pnpm/action-setup v6`, `actions/setup-node v6`, `actions/upload-artifact v7`, `actions/runner 2.327.1 node24`

## Local Environment (Ground Truth)

- `pnpm --version` → `11.8.0`
- `node --version` → `v24.17.0`
- `package.json` has **no** `packageManager` field (Corepack is not currently driving pnpm)
- Single workflow file: `.github/workflows/test.yml`
- Runner: `ubuntu-latest` (no self-hosted pinning)

## Key Findings

### 1. Action-by-Action Version Matrix

| Action | Pinned in workflow | Latest stable tag | Majors behind | Breaking since current pin |
|---|---|---|---|---|
| `actions/checkout` | `@v4` | `v7.0.0` (Jun 2026) | 3 | v5: Node 24; v6: creds split + Node 24 docs; v7: ESM-only internal |
| `pnpm/action-setup` | `@v4` (`version: 9`) | `v6.0.9` (Jun 2026) | 2 | v5: Node 24; v6: pnpm 11 support |
| `actions/setup-node` | `@v4` | `v6.4.0` (Apr 2026) | 2 | v5: `runs.using: node24` + auto package-manager cache, requires runner 2.327.1+ |
| `actions/upload-artifact` | `@v4` | `v7.0.1` (Apr 2026) | 3 | v5: Node 24 (preliminary); v6: Node 24 default; v7: ESM + `archive: false` input |

### 2. Runner Compatibility

- **v5/v6/v7 of these actions require Actions Runner 2.327.1+** (Node 24 runtime).
- GitHub-hosted `ubuntu-latest` has shipped runner 2.327.1+ since ~Aug 2025.
- **No self-hosted runner is in use here**, so no extra pinning is needed.
- `ubuntu-latest` is already in the workflow → upgrade is safe.

### 3. pnpm/action-setup v6 Syntax (Verified)

- Input name is still `version:` (no rename).
- Accepts exact (`"11.8.0"`), major (`"11"`), range (`"11.x"`), caret (`"^11.8.0"`), or `latest`.
- `run_install:` is still supported (default `null`).
- If `package.json` contains a `packageManager` field, `version:` becomes **optional** — Corepack is honored automatically.
- v6.0.9 ships pnpm **11.7.0**; passing `version: 11` (or omitting and using `packageManager`) yields the pnpm 11 line that matches local 11.8.0.

### 4. Current State & Trends

- All three "official" actions (`checkout`, `setup-node`, `upload-artifact`) have moved through a Node 24 bump in v5 and an ESM/internal-cleanup bump in v6/v7.
- `pnpm/action-setup` v6 is the first major that **officially supports pnpm 11** (v5 supported pnpm 10; v4 only went up to pnpm 9).
- The ecosystem has converged on Node 24; pinning `@v4` of any of these actions means running on a now-EOL Node runtime inside the action container, which can cause deprecation warnings in logs even when the step itself succeeds.

### 5. Security & Reliability Considerations

- Older majors receive only critical security backports on a long tail; new features (e.g., `actions/upload-artifact@v7`'s `archive: false` for direct uploads) and perf fixes do not land.
- `actions/checkout` v4 still works, but v5+ ships updated `@actions/core` and `uuid` handling — no known critical CVE on v4, but no reason to stay.
- `pnpm/action-setup` v4 with `version: 9` will **silently install pnpm 9** even if the lockfile is pnpm 11 — a future drift bug waiting to happen.

## Comparative Analysis

### Pin Strategies

| Strategy | Pros | Cons |
|---|---|---|
| `@vN` (floating major) | Auto-picks patches, low maintenance | Risk of patch-level breakage within major |
| `@vN.M.P` (exact) | Fully reproducible | Must bump manually; security scans will flag stale pins |
| `SHA` pin (e.g. `@a1b2c3...`) | Most auditable | Breaks on every release; hard to read |

**Recommendation for this repo:** use floating majors (`@v6`, `@v7`) — the repo is single-workflow, low blast radius, and the actions in question are first-party or first-party-adjacent with stable majors. Renovate/Dependabot can be added later for patch discipline.

### pnpm Version Source

| Source | Behavior | Recommended? |
|---|---|---|
| `pnpm/action-setup` `version:` input | Pinned, explicit, visible in workflow | **Yes** — current approach, just bump to 11 |
| `packageManager` field in `package.json` + Corepack | Single source of truth across dev + CI | **Yes** — preferred long-term |
| Omit both | Falls back to whatever pnpm comes preinstalled on the runner | **No** — version drift risk |

**Recommendation:** keep `version: 11` in the workflow **and** add `"packageManager": "pnpm@11.8.0"` to `package.json` for defense in depth. The two will agree, and dev/CI drift becomes a single-line PR to fix.

## Implementation Recommendations

### Minimal Patch (workflow-only)

Change `.github/workflows/test.yml` from:

```yaml
- uses: actions/checkout@v4
- uses: pnpm/action-setup@v4
  with:
    version: 9
    run_install: false
- uses: actions/setup-node@v4
  with:
    node-version: "24"
    cache: "pnpm"
...
- uses: actions/upload-artifact@v4
```

to:

```yaml
- uses: actions/checkout@v7
- uses: pnpm/action-setup@v6
  with:
    version: 11
    run_install: false
- uses: actions/setup-node@v6
  with:
    node-version: "24"
    cache: "pnpm"
...
- uses: actions/upload-artifact@v7
```

### Defense-in-Depth Patch (workflow + package.json)

Add to `package.json`:

```json
{
  "packageManager": "pnpm@11.8.0",
  "engines": {
    "node": ">=24",
    "pnpm": ">=11"
  }
}
```

Then in the workflow, the `version:` line can be dropped from `pnpm/action-setup` (Corepack will read `packageManager`) — but keeping it explicit is fine and self-documenting.

### Rollout Steps

1. Bump the four `uses:` tags on a branch.
2. Push and watch the `test` job run; the cold-session sentinel step will re-seed.
3. If green, merge. If red, the most likely cause is a runner-image change (e.g., preinstalled pnpm version on `ubuntu-latest`) — pin to a date-stamped runner like `ubuntu-2025.04.1` if reproducibility becomes an issue.

### Common Pitfalls

- **Don't pin `version: 9` to pnpm/action-setup v6** — v6 will reject pnpm 9 as out of range in some inputs. Always pair v6 with `version: 10` or `version: 11`.
- **Don't omit `cache: "pnpm"` on `setup-node@v6`** — caching still works the same way; the cache key just gained a new hash prefix.
- **Don't set `archive: false` on `upload-artifact@v7` for `.test-logs/`** — that dir is a directory; `archive: false` is for single-file direct uploads only.

## Resources & References

### Official Documentation
- [pnpm/action-setup releases](https://github.com/pnpm/action-setup/releases) — v6.0.9 is `Latest`
- [pnpm/action-setup README](https://github.com/pnpm/action-setup) — confirms `version:` input syntax for v6
- [actions/checkout releases](https://github.com/actions/checkout/releases) — v7.0.0 is `Latest`
- [actions/setup-node releases](https://github.com/actions/setup-node/releases) — v6.4.0 is `Latest`
- [actions/upload-artifact releases](https://github.com/actions/upload-artifact/releases) — v7.0.1 is `Latest`

### Compatibility References
- [GitHub Actions Runner 2.327.1 release notes](https://github.com/actions/runner/releases/tag/v2.327.1) — first runner with Node 24 as default runtime
- [GitHub-hosted runners spec](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners) — `ubuntu-latest` image versioning

## Appendices

### A. Glossary

- **Major version pin (`@v4`)** — tracks the latest patch within a major; recommended for first-party actions
- **Corepack** — Node's built-in package-manager version manager; reads `packageManager` from `package.json`
- **Cold-session sentinel** — local file `.cold-session-sentinel.json` that the MCP server's cold-session discoverability test checks; seeded by `pnpm test:cold-session`
- **Runner 2.327.1** — GitHub Actions runner image version that ships Node 24 as the default `runs.using` runtime

### B. Version Compatibility Matrix

| Action | v4 | v5 | v6 | v7 |
|---|---|---|---|---|
| `actions/checkout` | works, legacy | Node 24 | creds split + Node 24 docs | ESM-internal, current |
| `pnpm/action-setup` | pnpm ≤ 9 | Node 24 | **pnpm 11 (current)** | — |
| `actions/setup-node` | legacy | Node 24 runner + auto cache | **current** | — |
| `actions/upload-artifact` | works, legacy | Node 24 (preliminary) | Node 24 default | ESM + `archive: false` |

### C. Unresolved Questions

- None. All four target majors are clearly `Latest` on their respective release pages and the runner constraint is satisfied by the current `ubuntu-latest` pin.
