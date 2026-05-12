---
phase: 2
title: "Dependency"
status: completed
priority: P1
effort: "20m"
dependencies: [1]
---

# Phase 2: Dependency

## Overview

Add `yaml` (eemeli/yaml) as the first runtime dependency in `package.json`. Pin to a recent stable major. No adapter layer; callers will use `YAML.parse` directly via named import. Project's first non-dev `dependencies` entry.

## Requirements

- Functional: `package.json` gains a `dependencies` block with `yaml` pinned at exact minor (`^2.x.y` is fine; we want SemVer-stable on majors but free patch updates).
- Functional: `pnpm install` produces / updates `pnpm-lock.yaml` cleanly.
- Non-functional: no other deps added in the same change. ESM-only consumption (project is `"type": "module"`).

## Architecture

Direct import: `import { parse as parseYaml } from "yaml";` Callers will use `parseYaml(text)` — same call shape as the current hand-rolled export. This keeps the migration diff minimal and grep-stable.

No adapter / wrapper module. YAGNI: a thin wrapper would only serve to swap the library again later, which is not a planned event. If we ever need to, the import line is the only seam to flip.

## Related Code Files

- Modify: `package.json`
- Modify (by `pnpm install`): `pnpm-lock.yaml`

## Implementation Steps

1. Look up latest `yaml` major on npm. As of writing, 2.x is current stable. Pick the latest 2.x.
2. Edit `package.json` — add a top-level `"dependencies": { "yaml": "^2.x.y" }` block. Place above `"scripts"` per conventional layout.
3. Run `pnpm install`. Confirm `node_modules/yaml/` exists and `pnpm-lock.yaml` updated.
4. Quick sanity check via Node REPL (or one-liner): `node -e 'import("yaml").then(m => console.log(m.parse("a: 1\nb: [c, d]")))'`. Expect `{ a: 1, b: ['c', 'd'] }`.
5. **Do not migrate callers yet.** Phase 3 owns that.

## Success Criteria

- [ ] `package.json` has `dependencies.yaml` pinned to `^2.x.y`.
- [ ] `pnpm-lock.yaml` updated, no other adds (lockfile diff is small and yaml-only).
- [ ] `pnpm validate:records` still passes (hand-rolled parser still in use — this is a sanity gate, not a regression check).
- [ ] `node_modules` size growth roughly matches the 0.5 MB estimate in the decision draft (tolerable; just confirm it's not unexpectedly large).

## Risk Assessment

- **Risk**: `yaml` pulls transitive deps. **Mitigation**: `pnpm-lock.yaml` diff should show zero or near-zero transitives (the library is pure JS, no deps). If transitives appear, inspect and decide.
- **Risk**: ESM/CJS interop snag in `verify-claim.js` or others. **Low**: project is fully ESM (`"type": "module"`); `yaml` v2 ships ESM.
