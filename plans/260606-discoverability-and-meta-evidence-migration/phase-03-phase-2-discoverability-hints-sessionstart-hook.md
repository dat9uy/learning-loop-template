---
phase: 3
title: "Phase 2 discoverability_hints + SessionStart hook"
status: pending
priority: P2
effort: "3h"
dependencies: [2]
---

# Phase 3: Phase 2 discoverability_hints + SessionStart hook

## Overview

Build the `discoverability_hints` field on `loop_describe` warm tier + print the hints in the SessionStart hook. TDD: 5 new tests lock the contract (3 unit tests for the builder + hint structure; 2 unit tests for the hook's formatBlock output). This is the discoverability surface that closes the root cause of the 2 active 2026-06-01 findings.

## Requirements
- **Functional:**
  - `loop_describe({ tier: "warm" })` returns a `discoverability_hints` field containing exactly 5 strings in the documented order: citation, source-ref, grounding, no-code, status-lifecycle.
  - The citation hint mentions `meta_state_report` AND `evidence_code_ref` (substring check).
  - The source-ref hint mentions `local:meta-state:<id>` (substring check).
  - The grounding hint mentions `meta_state_derive_status` AND `meta_state_refresh_fingerprint` (substring check).
  - The no-code hint mentions `meta_state_log_change` AND `change_target` (substring check).
  - The status-lifecycle hint mentions all 5 statuses: `reported`, `active`, `resolved`, `expired`, `superseded` (substring check).
  - `formatBlock({ ...summary, discoverability_hints })` (the SessionStart hook's formatter) includes a new section between the existing counts and the existing tool-name hint that prints each hint string on its own line.
  - When `LL_LOOP_INJECT_TIER=summary`, the hook does NOT print the hints (gates context bloat; preserves the existing summary-only behavior).
  - `loop_describe({ tier: "summary" })` does NOT include `discoverability_hints` (kept terse per the existing summary contract).
  - `loop_describe({ tier: "cold" })` MAY include `discoverability_hints` (no harm; agents querying cold tier get the full picture).
- **Non-functional:**
  - The existing tests in `__tests__/loop-describe.test.js` and `__tests__/loop-describe-cold-tier-superseded.test.js` still pass (regression boundary).
  - The hook's failure-path (MCP probe fails) is unchanged: the `reportMcpConnectionFailure` function still logs the `meta_state_report` finding and prints the banner.
  - **The hook renders `discoverability_hints` from a LOCAL hardcoded copy of the 5 strings, NOT from the MCP server's response.** This is a security boundary — the server's response is treated as advisory; the hook always uses the operator-curated local copy. (See Implementation Step 5.5 — added in Red Team Review.)
  - **When `LL_LOOP_INJECT_TIER=summary` is set, the hook logs a `meta_state_report` finding with `subtype: "hint-downgrade"` and `session_id`, then downgrades the tier.** The default is `warm`; the downgrade is auditable.
  - The 3 doc amendments are non-blocking for code; they can land in any order within this phase.

## Architecture
- **Hint builder:** new function `buildDiscoverabilityHints()` in `core/loop-introspect.js`. Returns a frozen array of 5 strings. Pure function — no I/O, no side effects. The strings are hardcoded (these are operator-curated, not data-driven). Pattern reference: the existing `listAllMetaCategories()` function (a pure function returning a hardcoded enum).
- **Warm tier addition:** `loop-describe-tool.js` adds `result.discoverability_hints = introspect.buildDiscoverabilityHints()` inside the `tier === "warm"` branch. Cold tier and summary tier are unchanged (the builder is a no-op for summary; for cold, we add the same field for consistency, but it's optional).
- **Hook upgrade (security-hardened):** `.factory/hooks/loop-surface-inject.cjs` changes the `tier: "summary"` literal to a `tier` variable resolved from `env.LL_LOOP_INJECT_TIER` (default `"warm"`, fallback `"summary"`). The existing `formatBlock` function is extended to accept an optional `discoverability_hints` array. **CRITICAL: the hook renders the hints from a LOCAL hardcoded copy of the 5 strings — NOT from `summary.discoverability_hints` returned by the server.** This is a security boundary (per Red Team Review Finding 4: prompt-injection via the server response). The server's `discoverability_hints` field is ignored at render time; the hook always uses its own local copy.
- **Audit trail for hook downgrade:** when `LL_LOOP_INJECT_TIER=summary` is set, the hook calls `reportMcpConnectionFailure`-style helper (or a new `reportHintDowngrade` helper) that logs a `meta_state_report` finding with `subtype: "hint-downgrade"` and `session_id`, then proceeds with the summary tier. The finding is the audit trail; the downgrade is not silent. (Per Red Team Review Finding 6.)
- **Doc amendments:** 3 files, ~10-30 lines each, prose only. No testable contracts; the unit tests cover the code contracts and the docs are downstream.

## Related Code Files
- Modify: `tools/learning-loop-mcp/core/loop-introspect.js` (add `buildDiscoverabilityHints()` function)
- Modify: `tools/learning-loop-mcp/tools/loop-describe-tool.js` (add hints to warm tier; cold tier optional)
- Modify: `.factory/hooks/loop-surface-inject.cjs` (tier variable + formatBlock extension + env gate)
- Create: `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` (3 new unit tests)
- Create: `.factory/hooks/__tests__/loop-surface-inject-format-block.test.cjs` (2 new unit tests for the new formatBlock shape)
- Modify: `AGENTS.md` (add "Internalization Rule" section between Budget-Check Rule and Side-Effect Import Rule)
- Modify: `docs/observation-vs-meta-state.md` (add "Internalization via Code-Pointed Findings" section after the Three Layers table)
- Modify: `docs/philosophy.md` (amend pillar 3 with a new sentence about code-pointed findings)

## Implementation Steps (TDD: red → green → refactor)

1. **Red: write 3 failing tests in `__tests__/loop-describe-warm-tier.test.js`**:
   - Test 1: call `loop_describe({ tier: "warm" })` against a fixture project (use the real `process.cwd()` since the tool resolves root via `resolveRoot()`); assert the result has `discoverability_hints` as an array of length 5.
   - Test 2: assert each hint string contains the documented substrings (citation → `meta_state_report` + `evidence_code_ref`; source-ref → `local:meta-state:<id>`; grounding → `meta_state_derive_status` + `meta_state_refresh_fingerprint`; no-code → `meta_state_log_change` + `change_target`; status-lifecycle → all 5 statuses).
   - Test 3: call `loop_describe({ tier: "summary" })`; assert `result.discoverability_hints` is `undefined`.
   - Run: `cd tools/learning-loop-mcp && node --test __tests__/loop-describe-warm-tier.test.js` — expect 3 failures.
2. **Green: implement `buildDiscoverabilityHints()` in `core/loop-introspect.js`**:
   - Return `Object.freeze([<5 strings>])` in the documented order.
   - String content (locked in this plan, copy verbatim from brainstorm):
     - Citation: *"To cite a thing, point at the code: `meta_state_report({ evidence_code_ref: 'path/to/file.js:line' })`. The loop will hash and re-check it."*
     - Source-ref: *"For `source_refs`, prefer `local:meta-state:<id>` (cite a finding). Markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged."*
     - Grounding: *"Run `meta_state_derive_status({ id })` to re-check if a finding is still true. Run `meta_state_refresh_fingerprint({ id })` to re-hash the code after a refactor."*
     - No-code: *"For designs without code, cite the change-log that records the design (`meta_state_log_change` with `change_target: '<plan-path>'`)."*
     - Status-lifecycle: *"Findings have 5 statuses: `reported` (24h TTL), `active` (operator-acked), `resolved` (closed), `expired` (TTL elapsed), `superseded` (consolidated into a change-log)."*
   - Wire it into `loop-describe-tool.js` warm tier + cold tier (summary tier stays terse).
3. **Refactor: extract the hint array to a constant** at the top of `core/loop-introspect.js` so future maintenance is one edit, not 5. No behavior change.
4. **Red: write 2 failing tests in `__tests__/loop-surface-inject-format-block.test.cjs`**:
   - Test 1: import `formatBlock` from `.factory/hooks/loop-surface-inject.cjs`; call with a summary object that includes `discoverability_hints: [<5 strings>]`; assert the output includes each hint string on its own line AND includes the existing counts block.
   - Test 2: call `formatBlock` with `discoverability_hints: undefined`; assert the output matches the legacy shape (no hints section). This is the backward-compat test for the `LL_LOOP_INJECT_TIER=summary` path.
   - Run: `cd .factory/hooks && node --test __tests__/loop-surface-inject-format-block.test.cjs` — expect 2 failures.
5. **Green: extend `formatBlock` in `loop-surface-inject.cjs`**:
   - Accept `summary.discoverability_hints` as an optional array (kept for API compatibility, but see Step 5.5 below — it is NOT used at render time).
   - Wire `LL_LOOP_INJECT_TIER` env var: `const tier = (env.LL_LOOP_INJECT_TIER === "summary") ? "summary" : "warm"`. Pass `tier` to `spawnAndCall`'s `tools/call` params.
   - **If `LL_LOOP_INJECT_TIER === "summary"`, call `reportHintDowngrade({ sessionId, reason: "env_LL_LOOP_INJECT_TIER=summary" })` BEFORE rendering.** The helper logs a `meta_state_report` finding with `subtype: "hint-downgrade"` and `session_id` (per Red Team Review Finding 6).
5.5. **Green: replace the `discoverability_hints` render source with a LOCAL hardcoded copy** (Red Team Review Finding 4 — prompt-injection via server response). The hook defines a module-level constant `LOCAL_DISCOVERABILITY_HINTS = Object.freeze([<5 strings verbatim from the plan's locked text>])`. The `formatBlock` function prints `LOCAL_DISCOVERABILITY_HINTS` (NOT `summary.discoverability_hints`). The server's `discoverability_hints` field is ignored entirely at render time. Add a comment block at the top of the constants: *"SECURITY: hints are operator-curated and rendered from a local hardcoded copy. The server's `discoverability_hints` field is not trusted at render time. To update the hints, edit this file and commit."*
6. **Doc amendments** (no test coverage; can land in any order):
   - `AGENTS.md`: insert new "Internalization Rule" section between Budget-Check Rule and Side-Effect Import Rule. Use the locked text from the brainstorm's section 6.
   - `docs/observation-vs-meta-state.md`: insert new "Internalization via Code-Pointed Findings" section after the Three Layers table. Reference the new AGENTS.md section.
   - `docs/philosophy.md`: amend pillar 3 with: *"Internalize by pointing at the code, not by quoting the markdown. A code-pointed finding with `mechanism_check: true` is durable; a markdown citation is the escape hatch."*
7. **Run the full test suite** to confirm no regression: `cd tools/learning-loop-mcp && node --test lib/ __tests__/ 2>&1 | tail -n 5` AND `cd .factory/hooks && node --test __tests__/ 2>&1 | tail -n 5` — expect all green.

## Success Criteria

- [ ] 3 new tests in `__tests__/loop-describe-warm-tier.test.js` pass
- [ ] 3 new tests in `__tests__/loop-surface-inject-format-block.test.cjs` pass (2 from the original plan + 1 new for the security boundary: formatBlock ignores `summary.discoverability_hints` and renders from `LOCAL_DISCOVERABILITY_HINTS` instead)
- [ ] 1 new test asserting that `formatBlock` with `LL_LOOP_INJECT_TIER=summary` logs a `hint-downgrade` finding
- [ ] All existing tests still pass (regression boundary)
- [ ] `AGENTS.md` has the new "Internalization Rule" section + `LL_LOOP_INJECT_TIER` env var documentation
- [ ] `docs/observation-vs-meta-state.md` has the new "Internalization via Code-Pointed Findings" section
- [ ] `docs/philosophy.md` pillar 3 has the new sentence
- [ ] SessionStart hook output (manual smoke test: `echo '{"hook_event_name":"SessionStart","source":"startup"}' | node .factory/hooks/loop-surface-inject.cjs`) shows the new hints section from `LOCAL_DISCOVERABILITY_HINTS`, NOT from the server's response

## Risk Assessment

- **Risk 1:** Warm tier is 10-25KB; adding hints (~2KB) is well within budget. Mitigation: the hints are constant strings, no I/O, no recursion.
- **Risk 2:** The hook's `formatBlock` is currently a synchronous function; making it conditional on `discoverability_hints` could break the `LL_LOOP_INJECT_TIER=summary` escape hatch. Mitigation: test 2 explicitly asserts backward-compat for the `undefined` case. If that test fails, the cook phase knows the escape hatch is broken.
- **Risk 3:** The `LL_LOOP_INJECT_TIER` env var may be misspelled or set in a non-obvious way by operators. Mitigation: default to `"warm"` (the new behavior); `"summary"` is the explicit override. Document the env var in the new AGENTS.md "Internalization Rule" section as a footnote. The `hint-downgrade` finding provides an audit trail.
- **Risk 4:** Doc amendments are prose; they may be reverted by future cleanup scripts. Mitigation: anchor them with a `<!-- INTERNALIZATION-RULE-START/END -->` HTML comment pair so a future grep can verify they still exist. (Pattern reference: the `AGENTS.md` Block Protocol section's numbered anchors.)
- **Risk 5:** The `cold` tier also gains `discoverability_hints` per Implementation Step 2. This is a small surface addition that existing cold-tier consumers may not expect. Mitigation: cold tier is explicitly the "full history" tier per the loop_describe tool description; adding a constant string array is semantically harmless. Document in the new test that cold tier includes the hints.
- **Risk 6 (NEW — Red Team Review Finding 4):** Server-supplied `discoverability_hints` could be a prompt-injection vector. Mitigation: per Step 5.5, the hook renders from `LOCAL_DISCOVERABILITY_HINTS` (hardcoded operator copy) and IGNORES the server's `discoverability_hints` field. The new test 3 explicitly asserts this isolation.

## TDD Tests Added (this phase)

| Test File | Test | Asserts |
|-----------|------|---------|
| `__tests__/loop-describe-warm-tier.test.js` (new) | warm tier has `discoverability_hints: string[5]` | array length 5, all hints strings |
| `__tests__/loop-describe-warm-tier.test.js` (new) | each hint contains the documented substrings | 5 substring assertions |
| `__tests__/loop-describe-warm-tier.test.js` (new) | summary tier has no `discoverability_hints` | `result.discoverability_hints === undefined` |
| `__tests__/loop-surface-inject-format-block.test.cjs` (new) | formatBlock prints hints section when LOCAL_DISCOVERABILITY_HINTS is set | 5 hint lines in output |
| `__tests__/loop-surface-inject-format-block.test.cjs` (new) | formatBlock legacy shape when hints absent | no hints section in output |
| `__tests__/loop-surface-inject-format-block.test.cjs` (new) | formatBlock IGNORES server-supplied `summary.discoverability_hints` and renders LOCAL_DISCOVERABILITY_HINTS instead | security boundary assertion (Red Team Review Finding 4) |
| `__tests__/loop-surface-inject-hint-downgrade.test.cjs` (new) | formatBlock with `LL_LOOP_INJECT_TIER=summary` logs a hint-downgrade finding | finding is logged before the summary block is rendered (Red Team Review Finding 6) |

**Total: 7 new tests.**
