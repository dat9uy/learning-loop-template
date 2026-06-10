---
phase: 3
title: "Discoverability + test verification"
status: pending
priority: P2
effort: "0.75h"
dependencies: ["phase-01-phase-1-cache-on-refresh-fingerprint", "phase-02-phase-2-auto-default-warning-on-report"]
---

# Phase 3: Discoverability + test verification

## Overview

Add a discoverability hint teaching the auto-default to both the canonical `DISCOVERABILITY_HINTS` array in `core/loop-introspect.js` and the local `LOCAL_DISCOVERABILITY_HINTS` array in `.factory/hooks/loop-surface-inject.cjs`. Run the full test suite (`pnpm test`), the cold-session discoverability test (`pnpm test:cold-session`), and the pre-commit hooks (`validate-records`, `extract-index`) to verify no regressions.

## Requirements

- **Functional**: one new hint inserted at the 2nd position in both `DISCOVERABILITY_HINTS` arrays, teaching agents about the auto-default + warning behavior. Both arrays stay in lockstep (canonical + local hook copy).
- **Non-functional**: hint text is < 300 chars (per codebase style). No other changes to the hint arrays. The hint teaches the new contract without bloating the at-startup context.

## Architecture

The two hint arrays are parallel surfaces. The canonical array in `core/loop-introspect.js` is rendered via the `loop_describe({ tier: "warm" })` MCP call. The local array in `loop-surface-inject.cjs` is operator-curated and rendered at SessionStart time (the comment at `loop-surface-inject.cjs:11-13` says the server's `discoverability_hints` field is not trusted at render time, so the local copy is authoritative for the hook). The two must stay aligned.

Hint text (inserted at position 2 in both arrays, after the `evidence_code_ref` hint and before the `source_refs` hint):
> "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff."

## Related Code Files

- **Modify**: `tools/learning-loop-mcp/core/loop-introspect.js` — `DISCOVERABILITY_HINTS` array: insert 1 new hint at position 2 (~1 line)
- **Modify**: `.factory/hooks/loop-surface-inject.cjs` — `LOCAL_DISCOVERABILITY_HINTS` array: insert the same hint at position 2 (~1 line)
- **Run**: `pnpm test`, `pnpm test:cold-session`, pre-commit hooks (`validate-records`, `extract-index`)

## Implementation Steps

### Step 3.1 — Update the canonical `DISCOVERABILITY_HINTS` array (green)

In `tools/learning-loop-mcp/core/loop-introspect.js`, the `DISCOVERABILITY_HINTS` array is at lines 79-87. Insert the new hint at position 2 (after the existing `evidence_code_ref` hint at line 79, before the `source_refs` hint at line 80):

```js
const DISCOVERABILITY_HINTS = Object.freeze([
  "To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it.",
  "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff.",
  "For `source_refs`, prefer `local:meta-state:<id>` (cite a finding). Markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged.",
  ...
]);
```

The hint text is 244 chars (under the 300-char limit). The `Object.freeze()` is preserved; mutating the array would have failed silently before but the new array is a fresh literal.

### Step 3.2 — Update the local `LOCAL_DISCOVERABILITY_HINTS` array (green)

**Pre-existing drift caveat**: `LOCAL_DISCOVERABILITY_HINTS` has 5 entries (lines 14-18), while the canonical `DISCOVERABILITY_HINTS` has 9 entries. The local array is missing the A4 (tool selection) and A5 (4-layer role split) hints. This is a pre-existing drift; Phase 3 will NOT fix it (out of scope for this plan). Phase 3 will add 1 hint to each, making the local 6 and the canonical 10. The drift is documented as a known issue.

In `.factory/hooks/loop-surface-inject.cjs`, the `LOCAL_DISCOVERABILITY_HINTS` array is at lines 14-18. Insert the same hint at position 2 (matching the canonical array, but note that the local array's "position 2" is between the same two hints by coincidence, not by invariant):

```js
const LOCAL_DISCOVERABILITY_HINTS = Object.freeze([
  "To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it.",
  "When you pass `evidence_code_ref` to `meta_state_report`, `mechanism_check` is auto-defaulted to `true` (so the loop will hash and re-check the code). Pass `mechanism_check: false` explicitly to opt out — the response will include a `warnings` array explaining the tradeoff.",
  "For `source_refs`, prefer `local:meta-state:<id>` (cite a finding). Markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged.",
  ...
]);
```

The two arrays now have identical first-3 entries. Operators reviewing the local hook see the same hint.

### Step 3.3 — Run the full test suite (verification)

Run `pnpm test` from the project root. Expected output:
- All pre-existing tests pass.
- 10 new tests pass (4 in Phase 1: T1-T4; 6 in Phase 2: T5-T10).
- Total: same baseline + 10 tests = green.

If any test fails, investigate. The most likely cause is a test that asserts on a specific response shape and the new `cache_hit: false` / `warnings` fields are unexpected. The test author should update the assertion to allow the new fields (or check for specific values).

### Step 3.4 — Update hint-count assertions and run the cold-session discoverability test (verification)

**Concrete assertion updates (5 sites across 2 files)**:
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:426` — change `assert.strictEqual(warm.discoverability_hints.length, 9)` to `length === 10`.
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:445-446` — change `hints.length === 9` to `hints.length === 10`.
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js:11` — change `assert.strictEqual(parsed.discoverability_hints.length, 9)` to `length === 10`.
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js:64` — change `assert.strictEqual(parsed.discoverability_hints.length, 9)` to `length === 10`.
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js:69` — change `assert.strictEqual(hints.length, 9)` to `hints.length, 10`.

Run `pnpm test:cold-session` from the project root. The cold-session test reads `meta-state.jsonl` and verifies that the canonical prompts (AGENTS.md, CLAUDE.md, the discoverability hints) are in sync. The new hint should not trigger a regression.

The total byte length assertion (`< 5000`) is not at risk with a 244-char addition (current total is ~2KB; new total is ~2.2KB).

### Step 3.5 — Run pre-commit hooks (verification)

Run the pre-commit hooks manually:
- `validate-records` (validates all YAML records against schemas; should pass — no records created in this plan).
- `extract-index` (rebuilds the index from evidence/capability files; should pass — no index changes).

If `validate-records` flags a schema description change as a drift, that's expected and the change is intentional (the description text is the source of truth for the field's semantics). Acknowledge the change in the commit message.

### Step 3.6 — Optional: add a code comment in `.factory/hooks/loop-surface-inject.cjs` (green)

If cheap (single line), add a comment above each of the 2 direct-`writeEntry` calls (lines 148, 228) noting that they bypass the tool handler and the auto-default does not apply:
```js
// NOTE: direct writeEntry bypasses the meta_state_report tool handler; the
// mechanism_check auto-default does not apply here.
```

This is a documentation-only change. The risk is zero; the benefit is that future readers understand the asymmetry between tool-handler findings and hook findings.

If the comment is awkward to insert cleanly (e.g., the call is a single expression in a function), skip this step. The plan's success criteria do not require it; it's a "nice to have."

## Success Criteria

- [ ] `DISCOVERABILITY_HINTS` array has 10 entries (was 9); new entry at position 2.
- [ ] `LOCAL_DISCOVERABILITY_HINTS` array has 10 entries (was 9); new entry at position 2 matches the canonical.
- [ ] `pnpm test` passes with no regressions.
- [ ] `pnpm test:cold-session` passes (with a 1-line update to the hint-count assertion if needed).
- [ ] Pre-commit hooks (`validate-records`, `extract-index`) pass.
- [ ] (Optional) Code comment added in `.factory/hooks/loop-surface-inject.cjs` documenting the auto-default bypass.

## Risk Assessment

- **Cold-session test fails on hint count** — the test asserts on the number of hints. Adding one hint requires updating the count. **Mitigation**: update the assertion in the same commit (matches the precedent from `260610-1535-meta-state-reopen-path` Phase 4).
- **Hint drift between canonical and local arrays** — the two arrays must stay in lockstep. **Mitigation**: both are updated in the same commit; the cold-session test enforces their equivalence.
- **Pre-commit hook flags schema description change as drift** — the description is a `.describe()` text edit, not a schema change. **Mitigation**: the change is intentional; acknowledge it in the commit message. If the hook treats it as a drift, run the hook with the appropriate override or update the validator's allowlist.
- **Hint text too long for SessionStart context** — the new hint is 244 chars. With the existing 9 hints (each ~100-200 chars), the total hint text is ~2KB. The SessionStart hook injects this into context, so a 244-char addition is ~12% more context. **Mitigation**: the context budget is not tight; 12% growth is acceptable. If a future operator wants to trim, the hint can be shortened.
