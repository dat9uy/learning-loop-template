---
phase: 6
title: "Regex comment-stripping preprocessor"
status: complete
priority: P2
effort: "30m"
dependencies: []
---

# Phase 6: Regex comment-stripping preprocessor

## Overview

Implements the F-2 fix from the Step 4 code review: add a `loadText`-like preprocessor to `core/runtime-agnostic-checklist.js` that strips block comments (`/* ... */`) and string literals (`"..."`, `'...'`, `` `...` ``) before regex testing. Eliminates the false-positive class flagged in the code review (e.g., `// .claude` in a comment triggers the `cross-surface-iteration` predicate). Documents the regex as "best-effort, lowest common denominator" in JSDoc — the 9 syntax bypasses (`forEach`, `map`, spread iter, `for-in`, `while`, template literals, array literals, raw templates, `path.resolve`) are not closed by this phase; they remain a documented limitation.

## Cleanup items addressed

- **4.5** (Step 4, test-quality — F-2 from code review) — `core/runtime-agnostic-checklist.js` 6-item checklist regexes have 9 syntax bypasses + false positives on comments/strings.

## Requirements

Functional:
- The preprocessor strips block comments (`/* ... */`, including multi-line) before regex testing.
- The preprocessor strips string literals (`"..."`, `'...'`, `` `...` ``) before regex testing. (Template literals without `${}` are stripped; template literals WITH `${}` are partially handled — see "known limitations" below.)
- The preprocessor does NOT change the regexes themselves.
- False positives on comments/strings are eliminated: a `.claude` reference inside a `//` or `/* */` comment no longer triggers the `cross-surface-iteration` or `parameterized-for-new-surfaces` predicates.

Non-functional:
- The preprocessor is a small helper (~15-25 LoC) added to `runtime-agnostic-checklist.js` near the existing `loadText`.
- A new JSDoc block on the CHECKLIST documents the regex as "best-effort, lowest common denominator; the audit is not exhaustive."

## Architecture

### Preprocessor design

The preprocessor is a 3-step regex transform applied to the source text before the existing regex tests:

1. **Strip block comments**: `text.replace(/\/\*[\s\S]*?\*\//g, "")` — handles multi-line `/* ... */`.
2. **Strip line comments**: `text.replace(/\/\/.*$/gm, "")` — handles `// ...` to end-of-line.
3. **Strip string literals**: `text.replace(/(['"`])((?:\\\1|(?!\1).)*?)\1/g, "")` — handles `"..."`, `'...'`, `` `...` ``.

The 3 transforms are applied in order. The result is a "regex-safe" text that contains only code (no comments, no string contents). The existing regex tests then run on this sanitized text.

**Known limitations (documented in JSDoc)**:
- Template literals with `${...}` expressions: the regex strips the entire literal including the expression. The expression's content is lost. For the existing CHECKLIST, the expressions are unlikely to contain `.claude` or `.factory` paths, so the false-negative rate is low. Documented as a known limitation.
- The 9 syntax bypasses (`forEach`, `map`, `for-in`, `while`, template literals in cross-surface calls, etc.) are NOT closed by this phase. The preprocessor is a false-positive eliminator, not a bypass closer. The CHECKLIST JSDoc explicitly says "the audit is best-effort; the rule's `enforcement` is the agent, not the regex."

### Preprocessor implementation

```js
/**
 * Strip block comments, line comments, and string literals from a source
 * text. Returns a "regex-safe" text where the existing CHECKLIST regexes
 * will not false-positive on comments or string contents.
 *
 * KNOWN LIMITATIONS:
 * - Template literals with ${} expressions have the entire literal stripped
 *   (including the expression). The expression's content is lost. Acceptable
 *   for the current CHECKLIST: expressions rarely contain surface paths.
 * - The 9 syntax bypasses flagged in code-review F-2 (forEach, map, for-in,
 *   while, template literals in cross-surface calls, array literals,
 *   raw templates, path.resolve, etc.) are NOT closed by this preprocessor.
 *   The preprocessor eliminates false positives, not bypasses. The audit
 *   remains best-effort; the rule's `enforcement: "agent"` (the agent
 *   itself) is the canonical check.
 */
function stripCommentsAndStrings(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")    // block comments /* ... */
    .replace(/\/\/.*$/gm, "")             // line comments // ...
    .replace(/(['"`])((?:\\\1|(?!\1).)*?)\1/g, ""); // "..." | '...' | `...`
}
```

### Integration into CHECKLIST

Replace the existing `loadText(root, file)` call in the two regex-based CHECKLIST items (`cross-surface-iteration` and `parameterized-for-new-surfaces`):

```js
// Before (line 218):
const src = loadText(root, file);
if (!/\.(claude|factory)|coordination|SURFACES/.test(src)) continue;
const handRolledLoop = /for\s*\(\s*const\s+\w+\s+of\s+SURFACES\s*\)/.test(src);
const hardCodedPath = /join\s*\(\s*root\s*,\s*"\.(claude|factory)"/.test(src);

// After:
const src = stripCommentsAndStrings(loadText(root, file));
if (!/\.(claude|factory)|coordination|SURFACES/.test(src)) continue;
// ... regex tests unchanged
```

The preprocessor is only used by the 2 regex-based CHECKLIST items. The existence-based items (`core-in-universal-location`, `shims-in-sync`, `manifest-registered`) are unaffected.

### JSDoc on the CHECKLIST

Update the existing file-level JSDoc on the `CHECKLIST` export (lines 81-85):

```js
/**
 * Runtime-agnostic checklist — shared between the regression test and the
 * check_runtime_agnostic MCP tool. Each item has an id, human description,
 * and a verify(featurePath, root) function returning { ok, expected?, found?, fix_suggestion? }.
 *
 * REGEX-BASED ITEMS are best-effort, lowest-common-denominator. They match
 * the most common patterns the codebase uses, but DO NOT catch all syntax
 * forms. The 9 known bypass forms (forEach, map, for-in, while, template
 * literals, array literals, raw templates, path.resolve, spread iter) are
 * documented in the code review (F-2) and intentionally not closed by the
 * regex. The audit's job is to catch regressions, not to be a perfect lint.
 *
 * False-positive elimination: the regex-based items run against a
 * comment-and-string-stripped version of the source text (see
 * `stripCommentsAndStrings`). A `.claude` reference inside a `//` or
 * `/* *\/` comment no longer triggers the predicate.
 *
 * The canonical check is the agent itself (the rule's `enforcement: "agent"`).
 * The regex is a regression guard for the most common patterns, not a
 * complete validator.
 */
```

### New test

Add 1 new test to `__tests__/runtime-agnostic.test.js` (or a new `__tests__/runtime-agnostic-checklist.test.js`) that pins the preprocessor contract:

```js
import { stripCommentsAndStrings } from "../core/runtime-agnostic-checklist.js";

await test("stripCommentsAndStrings removes block comments, line comments, and string literals", () => {
  const input = `
    // This comment contains .claude which is a false-positive bait
    /* This block comment contains .factory which is also a false-positive bait */
    const x = ".claude";  // string literal containing .claude
    const y = '.factory'; // single-quoted string
    const z = \`\${SURFACES[0]}/foo\`;  // template literal
    const real = "real string content";
  `;
  const stripped = stripCommentsAndStrings(input);
  assert.strictEqual(stripped.includes(".claude"), false, "no .claude should remain");
  assert.strictEqual(stripped.includes(".factory"), false, "no .factory should remain");
  assert.ok(stripped.includes("const real"), "non-surface code should remain");
});
```

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:81-85` (CHECKLIST JSDoc)
- Modify: `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:12-19, 218, 242` (add `stripCommentsAndStrings` helper; use in 2 CHECKLIST items)
- Modify: `tools/learning-loop-mcp/__tests__/runtime-agnostic.test.js` (add 1 new test for `stripCommentsAndStrings`)

## Implementation Steps

1. **Read** `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js` lines 12-19, 81-85, 213-262 to confirm the current `loadText` and regex test sites.
2. **Add** the `stripCommentsAndStrings` helper function after the existing `loadText` (around line 19).
3. **Update** the CHECKLIST file-level JSDoc (lines 81-85) with the "best-effort, lowest common denominator" framing and the preprocessor explanation.
4. **Update** the 2 regex-based CHECKLIST items (`cross-surface-iteration` at line 218 and `parameterized-for-new-surfaces` at line 242) to use `stripCommentsAndStrings(loadText(root, file))` instead of bare `loadText(root, file)`.
5. **Add** 1 new test in `__tests__/runtime-agnostic.test.js` for the preprocessor contract.
6. **Verify** by `pnpm test` — expect 987/988 (1 skipped) + 1 new test = 988/989.

## Success Criteria

- [ ] `core/runtime-agnostic-checklist.js` has a `stripCommentsAndStrings` helper with JSDoc explaining the known limitations.
- [ ] The CHECKLIST file-level JSDoc (lines 81-85) documents the regex as "best-effort, lowest common denominator" with explicit reference to F-2.
- [ ] The 2 regex-based CHECKLIST items (`cross-surface-iteration`, `parameterized-for-new-surfaces`) use `stripCommentsAndStrings(loadText(...))`.
- [ ] A new test in `__tests__/runtime-agnostic.test.js` pins the preprocessor contract.
- [ ] `pnpm test` shows 988/989 (1 skipped) — 1 new test.
- [ ] A false-positive manual check: create a `.js` file with `// .claude/foo` and run `check_runtime_agnostic` on it. The `parameterized-for-new-surfaces` predicate should NOT flag the file.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The preprocessor over-strips (e.g., strips a `//` inside a string literal) | The 3 transforms are applied in order. The string-strip step removes `"..."`/`'...'`/`\`...\`` first, then the line-comment strip sees the line without the string. The block-comment strip is first so multi-line comments don't interfere. Order matters; documented in the helper. |
| The preprocessor is slow (3 regex passes per file) | The CHECKLIST runs on `walkFiles(root, featurePath)` which is bounded by the feature path. Typical feature: ≤50 files. 3 regex passes × ≤50 files = ~150 regex ops. Sub-millisecond. |
| The preprocessor closes the false-positive class but does NOT close the 9 syntax bypasses (F-2 explicitly says the regex is best-effort) | Documented in the JSDoc. The preprocessor is a false-positive eliminator, not a bypass closer. The 9 syntax bypasses are an accepted limitation; closing them would require a full AST-based check (out of scope for this phase). |
| The new test is too tight (asserts no `.claude` remains, but a string literal like `".cursor"` doesn't contain `.claude` and should remain) | The test asserts that `.claude` and `.factory` (the actual patterns the regex looks for) are stripped. Other surface names (`.cursor`) are not stripped — they're not part of the regex vocabulary. The test is correct. |
| The preprocessor's string-literal regex is greedy and eats the rest of the line/file | The regex uses `((?:\\\1|(?!\1).)*?)` (non-greedy with escape handling), bounded by the same quote character. It does NOT cross newlines unless the literal is a template literal with `${}`. Documented limitation. |
| The check_runtime_agnostic tool's user-visible `fix_suggestion` text becomes more important now that the audit is "best-effort" | The existing `fix_suggestion` already says "Replace hand-rolled for-of-SURFACES loops and hard-coded join paths with imports from core/surfaces.js." No change needed. |
