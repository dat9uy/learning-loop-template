---
phase: 3
title: "Comment and handler hygiene"
status: pending
priority: P3
effort: "10m"
dependencies: []
---

# Phase 3: Comment and handler hygiene

## Overview

Three small cosmetic edits: remove a stale fallow-ignore comment from `core/inbound-state.js` (1.1), add an explicit no-op comment to the stdin read in `hooks/recurrence-check-on-start.js` (2.4), and tidy the `gate-check-recurrence-tool.js` handler to omit the `undefined` keys (2.5). No behavior change for 1.1 and 2.4; 2.5 changes the call shape only.

## Cleanup items addressed

- **1.1** (Step 1, cosmetic) — Stale `// fallow-ignore-next-line complexity` comment on `readLastOperatorMessage` (the function shrank 35 → 14 lines after the refactor; verify fallow still trips the rule, remove if no longer needed).
- **2.4** (Step 2, cosmetic) — `recurrence-check-on-start.js` reads stdin but discards it without a comment.
- **2.5** (Step 2, cosmetic) — `gate-check-recurrence-tool.js` passes explicit `undefined` for `threshold`/`windowMs` when options are omitted.

## Requirements

Functional: none (cosmetic only).
Non-functional: minimal diff; preserve code style.

## Architecture

### 3.1 — `core/inbound-state.js` (item 1.1)

**Verification step before removal**: the `// fallow-ignore-next-line complexity` comment suppresses a fallow complexity check on the next line. After the Step 1 refactor, `readLastOperatorMessage` is 14 lines (was 35). Verify fallow would still trip:

```bash
# Count non-blank, non-comment lines in readLastOperatorMessage (current)
awk '/^export function readLastOperatorMessage/,/^}$/' tools/learning-loop-mcp/core/inbound-state.js \
  | grep -vE '^\s*//|^\s*\*|^\s*$' \
  | wc -l
# Expected: ~14
```

If `fallow` (the project's complexity linter) is configured to trip at >20 lines for a function, the comment is stale. If it's <20, the comment never trips anyway and can be removed for clarity. **Default action: remove the comment** (the function is well under any reasonable complexity threshold; the comment is dead text).

**Also check `checkObservationStaleness`** (line 72) which has the same `// fallow-ignore-next-line complexity` comment. Same analysis: 60 lines, but most are early-returns + the same `getSidecar()` pattern. Apply the same `fallow` check.

**Edit**: remove both `// fallow-ignore-next-line complexity` comments. If fallow actually trips on either function, the failure is caught by CI.

### 3.2 — `hooks/recurrence-check-on-start.js` (item 2.4)

**Current code** (line 15):
```js
// SessionStart payloads are surface metadata; we do not need them.
readFileSync(0, "utf8");
```

The comment exists but is buried under the function-level comment. The CLEANUP is to make the no-op explicit at the `readFileSync` call site:

```js
// SessionStart payloads are surface metadata; we do not need them.
// Consume stdin to keep the hook protocol clean (otherwise the next stdin
// reader inherits the payload). Intentionally ignored.
readFileSync(0, "utf8");
```

### 3.3 — `tools/gate-check-recurrence-tool.js` (item 2.5)

**Current code** (lines 12-18):
```js
handler: async ({ threshold, window_minutes }) => {
  const root = resolveRoot();
  const result = checkAndEmit(root, {
    threshold,                            // <-- passes undefined if omitted
    windowMs: window_minutes ? window_minutes * 60 * 1000 : undefined,  // <-- passes undefined
  });
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
},
```

The `checkAndEmit` function uses `options.threshold ?? RECURRENCE_THRESHOLD_N` and `options.windowMs ?? RECURRENCE_WINDOW_MS`, so passing `undefined` is functionally identical to omitting the key. The CLEANUP is to build the options object conditionally:

```js
handler: async ({ threshold, window_minutes }) => {
  const root = resolveRoot();
  const options = {};
  if (threshold != null) options.threshold = threshold;
  if (window_minutes != null) options.windowMs = window_minutes * 60 * 1000;
  const result = checkAndEmit(root, options);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
},
```

This is functionally equivalent (`undefined` and missing key both fall through `??` to the default) but more explicit about what the tool actually sends.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/inbound-state.js:41, 72` (item 1.1; 2 fallow-ignore comments)
- Modify: `tools/learning-loop-mcp/hooks/recurrence-check-on-start.js:13-15` (item 2.4)
- Modify: `tools/learning-loop-mcp/tools/gate-check-recurrence-tool.js:12-19` (item 2.5)

## Implementation Steps

1. **Item 1.1** — Read `core/inbound-state.js` lines 40-75 to confirm both `fallow-ignore` comments. Run the line-count verification for both `readLastOperatorMessage` and `checkObservationStaleness`. Remove both `// fallow-ignore-next-line complexity` comments.
2. **Item 2.4** — Edit `recurrence-check-on-start.js` to add the explicit "Intentionally ignored" comment at the `readFileSync(0, "utf8")` call site.
3. **Item 2.5** — Edit `gate-check-recurrence-tool.js` to build the options object conditionally.
4. **Verify** by `pnpm test` — expect 986/987 (1 skipped) for 1.1 + 2.4; 986/987 (1 skipped) for 2.5 (the existing `gate-check-recurrence-tool.test.js` covers the handler with both omitted and explicit values).

## Success Criteria

- [ ] `core/inbound-state.js` has no `// fallow-ignore-next-line complexity` comments.
- [ ] `recurrence-check-on-start.js` has an explicit "Intentionally ignored" comment at the `readFileSync(0, "utf8")` call site.
- [ ] `gate-check-recurrence-tool.js` handler builds the options object conditionally; no explicit `undefined` keys.
- [ ] `pnpm test` shows 986/987 (1 skipped) — same as before this phase.
- [ ] Each edit is < 10 lines (small, surgical changes).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Removing the `fallow-ignore` comment causes CI to fail on complexity | If fallow trips, the function is genuinely over-complex — that's a real finding, not a cleanup issue. Either re-add the comment with a note explaining the complexity (and add a follow-up plan) or refactor. Verify with `pnpm test` + a complexity check (`fallow` runs in CI per `package.json`). |
| Item 2.5's "build conditionally" is more code than the original | The diff is +3 lines; the readability win (no `undefined` keys; explicit per-option logic) is worth it. |
| Item 2.4's expanded comment is wordy | The comment is read once by a future maintainer who is wondering "why are we reading stdin and discarding it?" The verbosity prevents that confusion. |
