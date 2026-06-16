---
phase: 2
title: "core/gate-logic.js GLOB_SCOPE_WHITELIST refactor — use SURFACES, fix .claude/ asymmetry"
status: pending
priority: P1
effort: "1h"
dependencies: ["phase-01-surfaces-helper"]
---

# Phase 2: GLOB_SCOPE_WHITELIST refactor

## Overview

Refactor `GLOB_SCOPE_WHITELIST` in `core/gate-logic.js` (line 407) to source its surface prefixes from the new `core/surfaces.js#SURFACES` constant instead of hard-coding `.factory/`. Fixes the known asymmetry: the whitelist currently allows `.factory/`-prefixed glob patterns but silently drops `.claude/`-prefixed patterns, even though both are legitimate surface prefixes for coordination hooks.

This is a **behaviour-changing refactor**: a glob pattern starting with `.claude/` was previously rejected, now passes.

## Requirements

Functional:
- `GLOB_SCOPE_WHITELIST` is constructed as `[..., ...SURFACES.map((s) => \`${s}/\`)]`.
- `isGlobScopeWhitelisted(".claude/skills/**")` returns `true` (was `false` before the refactor).
- `isGlobScopeWhitelisted(".factory/skills/**")` continues to return `true` (no regression).
- `isGlobScopeWhitelisted("records/...")`, `isGlobScopeWhitelisted("product/...")`, `isGlobScopeWhitelisted("meta-state.jsonl")` continue to return `true` (no regression on non-surface prefixes).

Non-functional:
- The `import { SURFACES } from "./surfaces.js"` is the only new import in `core/gate-logic.js`.
- The whitelist order in the source matches the prior order (non-surface prefixes first, surface prefixes last) for diff clarity.
- No other behaviour change in `core/gate-logic.js`. The whitelist is still consumed only by `isGlobScopeWhitelisted` (line 509-512).

## Architecture

```js
// tools/learning-loop-mcp/core/gate-logic.js (around line 407)
import { SURFACES } from "./surfaces.js";   // NEW

/** Whitelist for glob patterns to prevent path traversal. */
const GLOB_SCOPE_WHITELIST = [
  "product/",
  "docs/",
  "plans/",
  "tools/",
  "meta-state.jsonl",
  ...SURFACES.map((s) => `${s}/`),         // CHANGED: replaced hard-coded ".factory/"
];
```

The function `isGlobScopeWhitelisted` is unchanged; it still calls `GLOB_SCOPE_WHITELIST.some((prefix) => pattern.startsWith(prefix))`.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/gate-logic.js` — add 1 import, change 1 constant (~5 lines).
- Create: `tools/learning-loop-mcp/__tests__/gate-logic-glob-whitelist.test.js` — 6-8 tests pinning the new contract.
- No changes to `core/surfaces.js` (Phase 1 ships it; this phase consumes it).

## Implementation Steps (TDD)

1. **Red — write the test file first.** Create `tools/learning-loop-mcp/__tests__/gate-logic-glob-whitelist.test.js` with:
   - `test("whitelists .claude/ prefix (was rejected before refactor)")` — `isGlobScopeWhitelisted(".claude/skills/foo/**")` returns `true`. This is the load-bearing fix.
   - `test("whitelists .factory/ prefix (no regression)")` — `isGlobScopeWhitelisted(".factory/skills/foo/**")` returns `true`.
   - `test("whitelists non-surface prefixes (no regression)")` — assert `product/`, `docs/`, `plans/`, `tools/`, `meta-state.jsonl` all return `true`.
   - `test("rejects records/ and other non-whitelisted paths")` — `records/...`, `secrets/...`, `~/.ssh/...` all return `false`.
   - `test("rejects empty string and non-string input")` — matches the existing defensive guards in the function.
   - `test("GLOB_SCOPE_WHITELIST includes both surfaces when SURFACES is multi-element")` — mutation test: temporarily `push(".cursor")` to a copy of `SURFACES` (via dynamic import), assert `.cursor/` becomes whitelisted. (Locks the parameterized property.)
2. **Run tests; confirm RED.** `pnpm test -- gate-logic-glob-whitelist` — the `.claude/` and the mutation test fail; the others may already pass (since the prior hard-coded list included `.factory/`). Both the asymmetry-fix and the parameterization test are the new contract.
3. **Green — apply the refactor.** Edit `core/gate-logic.js` per the architecture above. Re-run tests; all 6 pass.
4. **Refactor — final pass.** Confirm the change diff is exactly 2 lines (1 import + the spread). Confirm `grep "GLOB_SCOPE_WHITELIST" tools/learning-loop-mcp/core/gate-logic.js` shows the new shape; no other lines changed. Confirm `pnpm test` shows 0 new failures.
5. **Whole-plan consistency check.** Confirm `core/gate-logic.js` has no other hard-coded surface paths (`grep "join(root, \\\"\\.claude\\\"" core/gate-logic.js` → 0 hits in production code; the one hit at line 516 is for `.mcp.json`, not a surface prefix).

## Success Criteria

- [ ] `core/gate-logic.js` imports `SURFACES` from `./surfaces.js`.
- [ ] `GLOB_SCOPE_WHITELIST` uses `...SURFACES.map((s) => \`${s}/\`)`; no hard-coded `.factory/`.
- [ ] `isGlobScopeWhitelisted(".claude/skills/**")` returns `true`.
- [ ] `isGlobScopeWhitelisted(".factory/skills/**")` returns `true` (no regression).
- [ ] `tools/learning-loop-mcp/__tests__/gate-logic-glob-whitelist.test.js` exists with 6+ passing tests.
- [ ] `pnpm test` shows 0 new failures; all 840+ existing tests still pass.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `rule-project-skill-boundary` rule (existing meta-state rule) might depend on the prior whitelist shape | Verify: `grep "rule-project-skill-boundary" tools/learning-loop-mcp/core/gate-logic.js` → the rule's pattern is `.factory/skills/{use-mcp,find-skills}/**`. The new whitelist still includes `.factory/` (and now `.claude/`). The rule still matches. No regression. |
| The `GLOB_SCOPE_WHITELIST` order matters for some downstream test that asserts on order | The whitelist is consumed via `.some((prefix) => pattern.startsWith(prefix))` — order doesn't affect outcome. No test asserts on the array's order. |
| Behaviour change (`.claude/` patterns now whitelisted) might silently enable a rule that was previously rejected | Documented in the plan + the change-log. The behaviour change is the point of this phase. If a future rule with a `.claude/` pattern is too permissive, the operator can tighten the rule, not the whitelist. |
| Mutation test (push `.cursor` to a copy) is fragile if `SURFACES` is `Object.freeze`-d | The mutation test creates a fresh array, not a mutation of the imported constant. Document this in the test comment. |

## Security Considerations

- Widening the whitelist is a behaviour change. Documented in the plan + a future change-log entry.
- A glob pattern like `.claude/../../secrets` is still subject to glob expansion semantics — `startsWith(".claude/")` matches it, but the pattern's actual matches depend on the glob consumer. The whitelist is a coarse first-pass; the glob consumer is the authoritative check. No new attack surface beyond what was intended.
- The `.claude/skills/` subtree is already a legitimate coordination location (the project has `.claude/skills/`). The refactor aligns the whitelist with the project's actual layout.

## Next Steps

Phase 3: refactor `readLastOperatorMessage` to use `readFromAllSurfaces` (DRYs the inline cross-surface iteration).
