---
phase: 3
title: "zod-pin"
status: pending
priority: P1
effort: "5min"
dependencies: ["phase-02-fix-meta-state-relationships"]
---

# Phase 3: zod-pin (CR-1)

## Overview

Fix CR-1 from `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` § GAP-1: the `zod` dependency in `package.json:28` is pinned as `^4.4.3` (caret), not `4.4.3` exact. The PR body for PR #3 claimed "zod v4 is pinned to 4.4.3 exact (no caret)" — the claim contradicts the code. The parity gate (`z.toJSONSchema({ target: "draft-7", io: "input" })`) is version-sensitive; a minor zod bump could break the gate silently. 1-character fix.

## Context Links

- `package.json:28` — the bug site; `"zod": "^4.4.3"` should be `"zod": "4.4.3"`
- `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` § GAP-1 (R-12 + R-16 NOT resolved)
- `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` — uses `z.toJSONSchema({ target: "draft-7", io: "input" })`; version-sensitive
- `tools/learning-loop-mastra/package.json` — does NOT exist; the root `package.json` is the only manifest (verified via `find`)

## Requirements

- **Functional:** `package.json` `zod` field is `4.4.3` exact (no caret, no tilde, no range). The lockfile (`pnpm-lock.yaml`) resolves to `zod@4.4.3`. `pnpm install` does not silently bump the version.
- **Non-functional:** the change is wire-format compatible; no test changes; no schema changes; the parity gate's behavior is preserved.

## Architecture

The fix is a 1-character change to `package.json`:

```diff
   "dependencies": {
     "@mastra/core": "1.42.0",
     "@mastra/mcp": "1.10.0",
     "@modelcontextprotocol/sdk": "1.29.0",
     "ajv": "^8.20.0",
     "ajv-formats": "^3.0.1",
     "yaml": "^2.8.4",
-    "zod": "^4.4.3"
+    "zod": "4.4.3"
   },
```

**Why exact pin (not caret or tilde)?** The parity gate uses `z.toJSONSchema()`, which is a public API but version-sensitive. A minor version bump (e.g., 4.5.0) could change the output (add `description` per field, change `additionalProperties` handling, change `format` handling). Exact pin forces a re-verify on every bump.

**Why not all dependencies exact-pinned?** YAGNI. The other dependencies (`@mastra/core`, `@mastra/mcp`, `@modelcontextprotocol/sdk`, `ajv`, `ajv-formats`, `yaml`) don't have version-sensitive gate behavior. Caret is fine for them. Only `zod` needs the exact pin because of the parity gate.

**Why not use a separate `package.json` for the mastra package?** The mastra package (`tools/learning-loop-mastra/`) is a sub-folder; it shares the root `package.json` (verified: `tools/learning-loop-mastra/package.json` does not exist). The root pin is the only pin.

## Related Code Files

- Modify: `package.json:28` (remove caret)
- Add: `tools/learning-loop-mcp/__tests__/package-json-zod-pin.test.js` (new; 1 RED assertion)
- No other code changes. No mastra-side changes. No lockfile changes (the resolved version is already 4.4.3).

## Implementation Steps

1. **RED test:** in the new test file, write a 1-assertion test that reads `package.json`, parses the `dependencies.zod` field, and asserts it is exactly `"4.4.3"` (no prefix). Run the test: should FAIL (current value is `"^4.4.3"`).
2. **GREEN fix:** remove the caret. Re-run the test: should PASS.
3. **Lockfile check:** run `pnpm install` to confirm the lockfile resolves to `zod@4.4.3` (no diff expected since the resolved version is already 4.4.3).
4. **Regression check:** run `pnpm test` to confirm 0 regressions (the parity gate should pass identically; the change is in the pin, not the resolved version).
5. **Commit:** `fix(deps): pin zod to 4.4.3 exact (parity gate version-sensitive)` (1 commit).

## Success Criteria

- [ ] RED test fails on master (current value is `^4.4.3`)
- [ ] GREEN test passes after the fix
- [ ] `pnpm test` shows all 9 test namespaces pass (durable 9-namespace anchor) + 0 regressions
- [ ] `package.json` `zod` field is `"4.4.3"` exact (no caret, no tilde, no range)
- [ ] `pnpm-lock.yaml` resolves to `zod@4.4.3` (no diff)
- [ ] PR body claim ("zod v4 is pinned to 4.4.3 exact") is now true (no more code-vs-doc drift)

## Risk Assessment

- **`pnpm install` fails if 4.4.3 is no longer in the registry.** Very low: zod 4.4.3 was published 2026-05-12; pnpm cache should have it. Mitigation: run `pnpm install` after the change; if the lockfile fails to resolve, the registry is the issue (not the pin).
- **Caret is the pnpm default; other contributors may revert the change.** Low: the new test file locks the pin in CI; any future PR that adds a caret will fail the test. The test is the regression envelope.
- **Future zod bumps are blocked by the test.** Intentional: the test is the gate. A future bump requires a PR that updates the test (acknowledging the re-verify).

## Security Considerations

- No security impact. The fix is in the dependency pin, not in any code path.
