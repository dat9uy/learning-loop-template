# Research Report: Pre-Commit Hook Solution for Learning Loop Template

**Date:** 2026-05-27
**Sources consulted:** 4 (Andy Madge blog, simple-git-hooks GitHub, npm compare, web search)

---

## Executive Summary

The project needs a pre-commit hook to run `pnpm validate:records` and `pnpm extract:index` before every commit, as a safety net when the agent forgets to call `workflow_notify_artifact`. The constraint is minimal dependencies, since the project is heavily plain-JS and values lightweight tooling.

**Recommendation:** `simple-git-hooks` — zero dependencies, 10.9KB unpacked, config lives in `package.json`, and hooks are set up with a single `npx simple-git-hooks` command. It is the sweet spot between the zero-config-but-heavy Python `pre-commit` tool and the manual `core.hooksPath` hand-written approach.

---

## Evaluated Options

| Solution | Dependencies | Size | Auto-install | Config Location | Best For |
|----------|-------------|------|--------------|-----------------|----------|
| **simple-git-hooks** | Zero | 10.9KB | No (manual `npx simple-git-hooks`) | `package.json` or `.simple-git-hooks.json` | Small JS projects, minimalism |
| **Husky v8** | Zero | 6.44KB | Yes (via `prepare` script) | `.husky/` dir | Teams wanting auto-setup |
| **Hand-written `core.hooksPath`** | Zero | 0KB | No (manual `git config`) | `.githooks/` dir | Zero-abstraction purists |
| **Lefthook** | Go binary | ~15MB | No | `lefthook.yml` | Monorepos, parallel hooks |
| **pre-commit (Python)** | Python + per-hook envs | ~850KB | No | `.pre-commit-config.yaml` | Polyglot repos, rich ecosystem |

---

## Key Findings

### 1. simple-git-hooks

- Zero dependencies, 10.9KB unpacked, used by PostCSS, Nano ID, Vercel/pkg.
- Config is one object in `package.json` (or a separate `.simple-git-hooks.json`).
- One command per hook only — no parallel execution.
- Requires manual `npx simple-git-hooks` after every config change.
- Hooks are written as shell commands, so `pnpm validate:records` works directly.

```json
{
  "simple-git-hooks": {
    "pre-commit": "pnpm validate:records && pnpm extract:index"
  }
}
```

### 2. Husky v8

- Also zero dependencies, slightly smaller (6.44KB).
- Auto-installs via npm `prepare` script — no manual step for new clones.
- Hooks live in `.husky/` directory as plain shell scripts.
- Requires adding `"prepare": "husky"` to `package.json` scripts.
- If the project ever removes `package.json`, Husky becomes dead weight.

### 3. Hand-written core.hooksPath

- No tooling at all. Commit `.githooks/pre-commit` as a shell script.
- Developers run `git config core.hooksPath .githooks` once after clone.
- Most transparent, but requires documenting the setup step and ensuring executable bit.
- The coordination system already has many moving parts — adding one more manual setup step increases friction.

### 4. Lefthook / pre-commit

- Overkill. Lefthook is a Go binary (~15MB) with parallel execution and YAML config — features not needed for two sequential commands.
- `pre-commit` (Python) pulls hook environments from external repos and builds isolated envs — heavy for a plain-JS project.

---

## Comparative Analysis

| Criterion | simple-git-hooks | Husky v8 | Hand-written |
|-----------|-----------------|----------|--------------|
| **Dependency weight** | Zero | Zero | Zero |
| **Repo footprint** | +10.9KB devDep | +6.44KB devDep | 0KB (script in repo) |
| **Setup friction** | One `npx` command | Automatic on `pnpm install` | One `git config` command |
| **Config discoverability** | In `package.json` | In `.husky/` dir | In `.githooks/` dir |
| **Hook flexibility** | One command per hook | Full shell scripts | Full shell scripts |
| **pnpm-native** | Yes | Yes | Yes |
| **Remove-ability** | `npm uninstall` | `npm uninstall` + delete `.husky/` | Delete `.githooks/` + `git config --unset` |

---

## Recommendation: simple-git-hooks

**Rationale:**

1. The project already has `package.json` and `pnpm`. Adding a tiny dev dependency fits naturally.
2. Config in `package.json` keeps the hook definition discoverable — no hidden `.husky/` or `.githooks/` directory to remember.
3. The one-time `npx simple-git-hooks` setup is acceptable for a project whose primary users are AI agents and technical operators.
4. Zero dependency means no supply-chain risk beyond the package itself (which has no sub-dependencies).
5. The project's validation scripts (`validate:records`, `extract:index`) are already `pnpm` scripts — `simple-git-hooks` calls them directly without indirection.

**Trade-off accepted:** Manual re-run after config changes. Since the pre-commit command is unlikely to change often, this is negligible.

---

## Implementation Sketch

```json
// package.json additions
{
  "devDependencies": {
    "simple-git-hooks": "^2.13.1"
  },
  "simple-git-hooks": {
    "pre-commit": "pnpm validate:records && pnpm extract:index"
  }
}
```

```bash
# One-time setup (documented in README)
pnpm install
npx simple-git-hooks
```

---

## Security Considerations

- All pre-commit hooks are bypassable with `git commit --no-verify`. This is acceptable — the hook is a *convenience safety net*, not an enforcement boundary. CI should still run validation.
- `simple-git-hooks` has zero dependencies, minimizing supply-chain surface area.
- The hook script is committed to the repo and reviewed like any other code change.

---

## Unresolved Questions

1. Should the pre-commit hook also run `pnpm test`? (Currently `pnpm check` does capabilities + records + plan-loop + test — pre-commit may be too slow with full test suite.)
2. Should we add a `pre-push` hook for `pnpm check` to catch issues before remote push?
3. How do we handle the case where `simple-git-hooks` is not installed (e.g., a contributor skipped `npx simple-git-hooks`)? Document prominently in README.
