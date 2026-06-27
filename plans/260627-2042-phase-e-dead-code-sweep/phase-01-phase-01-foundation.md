---
phase: 1
title: "phase-01-foundation"
status: pending
priority: P2
dependencies: ["phase-00-phase-00-runner-discovery"]
effort: "0.5 day"
---

# Phase 1: Foundation

## Overview
Install dependencies, write `.fallowrc.json` with the right entry points + ignore patterns, document the manifest path-rewrite convention in `tools/manifest.json`, and verify fallow runs without warnings before any scan output is trusted.

## Requirements
- **Functional:** fallow can resolve every legacy tool wrapper + mastra runtime as a reachable entry point. `tools/manifest.json` carries a comment explaining the `tools/` → `legacy/` loader convention.
- **Non-functional:** no warnings from `fallow list` about unresolved imports, missing entry points, or config schema errors. `.fallowrc.json` validates against `fallow config-schema`.

## Architecture

The config layout:

```
tools/learning-loop-mastra/
├── .fallowrc.json                              ← NEW (this phase)
│   ├── entry: [mastra/server.js + factories]
│   ├── dynamicallyLoaded: ["tools/legacy/**/*.js"]
│   ├── ignorePatterns: [legacy-mcp/, fixtures/, plans/, docs/, *.test.*]
│   ├── rules: {unused-files: error, unused-exports: warn, unused-deps: error, …}
│   └── audit: {gate: "new-only"}
├── .fallow/
│   └── baselines/                              ← gitignored except for tracked baselines
└── tools/
    └── manifest.json                           ← MODIFIED: 1-line convention comment
```

`--root tools/learning-loop-mastra` is passed to every fallow invocation. The config file lives at the package root so resolution is local.

## Related Code Files
- Create: `tools/learning-loop-mastra/.fallowrc.json`
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (add 1-line comment)
- Modify: `.gitignore` at repo root (add `.fallow/cache/` if not present; do NOT add `.fallow/baselines/`)

## Implementation Steps

### Step 1 — Document the manifest path convention
Add a comment to `tools/manifest.json` resolving brainstorm open question #6. The comment must explain WHY the rewrite exists (not just THAT it does), so future readers understand the constraint instead of treating it as a bug.

The loader convention at `mastra/server.js:26-27`:
```js
const mod = await import(`../tools/legacy/${file.replace('tools/', '')}`);
```

WHY: the loader resolves tool entries at server startup. The canonical name lives in `manifest.json` (a stable, hand-curated registry); the actual file lives in `legacy/` because that subdir holds the "old-style MCP wrapper" implementation pattern that the new `mastra/` factories are gradually replacing. The rewrite keeps the manifest stable while allowing file moves.

Edit `tools/manifest.json` to add a top-of-file comment:
```jsonc
// tools/manifest.json — MCP tool registry.
//
// WHY THE PATH REWRITE: entries use the CANONICAL name "tools/X-tool.js"
// (stable, hand-curated). At server startup, mastra/server.js:26-27 rewrites
// each path to "../tools/legacy/X-tool.js" (the "legacy MCP wrapper"
// implementation). This keeps the registry stable while allowing file moves
// between tools/, tools/legacy/, and future mastra/tools/.
//
// Keep entries in sync with dynamicallyLoaded in .fallowrc.json (which
// fallow needs to credit dynamic imports).
[
  { "file": "tools/gate-tool.js", "export": "gateCheckTool" },
  …
]
```

### Step 2 — Install dependencies
```bash
cd tools/learning-loop-mastra
pnpm install
```

This populates `node_modules/` so fallow can distinguish internal vs external imports. Without it, every file looks orphan (the warning surfaced during initial scout).

### Step 3 — Write `.fallowrc.json`

Place at `tools/learning-loop-mastra/.fallowrc.json`:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",

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

  "dynamicallyLoaded": [
    "tools/legacy/**/*.js"
  ],

  "ignorePatterns": [
    "__tests__/legacy-mcp/**",
    "__tests__/fixtures/**",
    "tools/legacy/evals/**",
    "tools/legacy/references/**",
    "tools/legacy/fixtures/**",
    "scout/legacy/**",
    "plans/**",
    "docs/**",
    "**/*.test.js",
    "**/*.test.cjs",
    "**/*.spec.js",
    "**/*.spec.cjs"
  ],

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

  "audit": {
    "gate": "new-only"
  },

  "regression": {
    "path": ".fallow/baselines/regression-baseline.json"
  },

  "cache": {
    "enabled": true
  }
}
```

Source: `reports/researcher-260627-fallow-config.md` §1.3. The schema is documented at `fallow config-schema`; fallow reads `.fallowrc.json` first then walks up.

### Step 2.5 — Add fallow to devDependencies

Validation session 1 (2026-06-27) decided the fallow version pin lives in `package.json#devDependencies` (root-level), not in the CI step's `npx -y`. This gives local reproducibility via `pnpm install`.

Add to the **root** `package.json#devDependencies`:

```json
{
  "devDependencies": {
    "fallow": "2.102.0",
    "simple-git-hooks": "^2.13.1"
  }
}
```

Then run `pnpm install` to populate the binary. Verify with `pnpm exec fallow --version` (should print `2.102.0`).

### Step 4 — Verify fallow resolves entries
```bash
cd tools/learning-loop-mastra
fallow list --root .
```

Expected: every file in `tools/legacy/` is reachable, `mastra/server.js` is reachable, `core/meta-state.js` is reachable via the wrapper graph, no `unresolved-imports` warnings. If globs in `dynamicallyLoaded` fail (R1), replace the glob with an explicit per-file list generated from `jq -r '.[] | "tools/legacy/" + (.file | sub("^tools/"; ""))' tools/manifest.json`.

### Step 5 — Verify no `#mastra/*` warnings
```bash
fallow inspect core/list-probes.js --root .
fallow inspect core/meta-state.js --root .
```

If `#mastra/core/list-probes.js` shows as unresolved (R2), add to `.fallowrc.json`:
```jsonc
"resolve": {
  "alias": {
    "#mastra": "tools/learning-loop-mastra"
  }
}
```
…and re-run.

## Success Criteria
- [ ] `pnpm install` completes without errors at the mastra package root
- [ ] `.fallowrc.json` exists at `tools/learning-loop-mastra/.fallowrc.json` and validates
- [ ] `fallow list --root .` reports every legacy tool wrapper + mastra runtime as an entry point
- [ ] `tools/manifest.json` carries the convention comment (open question #6 resolved)
- [ ] No `unresolved-imports` warnings on `#mastra/*` paths (or alias added if needed)
- [ ] `.fallow/cache/` is gitignored; `.fallow/baselines/` is NOT gitignored

## Risk Assessment
- **R1 — `dynamicallyLoaded` glob semantics unverified.** Mitigation: `fallow list` test in Step 4; fall back to explicit list if globs fail.
- **R2 — `#mastra/*` subpath resolution unverified.** Mitigation: `fallow inspect` test in Step 5; add alias if needed.
- **R3 — `.fallowrc.json` schema drift.** Mitigation: `$schema` field pins the schema URL; `fallow config-schema` is the local source of truth if fallow version drifts.