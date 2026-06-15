---
phase: 2
title: "green-impl-and-ship — implement stripNodeEvalBody, wire into gate-logic, file finding, ship change-log"
status: pending
priority: P2
effort: "1h"
dependencies: ["phase-01-red-tests"]
---

# Phase 2: green-impl-and-ship

## Overview

Implement `stripNodeEvalBody(segment)` as a sibling to `stripMessageFlags` in `core/gate-logic.js`, wire it into the two call sites (`matchConstraintPattern` and `applyPromotedRules` regex branch), confirm all 6 tests turn GREEN and 0 regressions, then ship the meta-surface artifacts (new finding for the bypass risk + change-log for the implementation).
<!-- Updated: Validation Session 1 — 6 tests (was 5). -->

This is the TDD-GREEN + ship half of Step 3. The plan is intentionally narrow: 1 function + 2 insertion sites + 1 new finding + 1 change-log. No new MCP tools, no new files outside the test files, no cross-surface changes (the strip is pure logic).

## Requirements

Functional:
- New function `stripNodeEvalBody(segment)` in `tools/learning-loop-mcp/core/gate-logic.js`, exported, sibling to `stripMessageFlags`.
- Insert call into `matchConstraintPattern` after `stripMessageFlags`.
- Insert call into `applyPromotedRules` regex branch after `stripMessageFlags`.
- New finding `meta-260615T<HHMM>Z-node-e-strip-bypass-risk-...` filed via `meta_state_report` MCP tool. Documents the `node -e "require('child_process').exec('npm install')"` regression and points at Step 2's `gate_check_recurrence` MCP tool as the catch-net.
<!-- Updated: Validation Session 1 — realistic Node.js bypass example. -->
- New change-log `meta-260615T<HHMM>Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody-...` filed via `meta_state_log_change` MCP tool. Records the implementation + the 6 new tests + the bypass risk pointer.
<!-- Updated: Validation Session 1 — 6 tests (was 5). -->

Non-functional:
- The function is a pure string transform (no I/O, no globals, no side effects).
- The function uses regex `/\b(node|nodejs)\s+(-e|--eval|-p|--print)\s+(["'])(?:(?!\3).)*\3/g` for matching and a replacer function for substitution. The `g` flag handles multiple `-e` flags in one command.
- The function does NOT touch `python -c`, `bash -c`, `ruby -e`, `perl -e`, `sh -c` (asymmetric by user-stated design).
- The function does NOT touch `node script.js` (no `-e` flag) — leaves the command as-is.
- The implementation file diff is contained to `core/gate-logic.js` — no other production code touched.

## Architecture

### The function

```js
// tools/learning-loop-mcp/core/gate-logic.js (NEW function, sibling to stripMessageFlags)

/**
 * Strip the body of a `node -e|--eval|-p|--print` wrapper.
 *
 * The body of a `node -e "..."` command is a JavaScript string literal in
 * shell. The regex matching constraint patterns (e.g., the G8 promoted rule
 * `rule-no-new-artifact-types`) should not see trigger phrases inside that
 * body, just like `stripMessageFlags` keeps `git commit -m "..."` message
 * bodies out of the regex's view.
 *
 * Asymmetric by user-stated design: this strips only `node` wrappers.
 * `python -c`, `bash -c`, `ruby -e`, `perl -e`, `sh -c` are NOT stripped
 * because their bodies are real commands (the existing 3 tests at
 * `__tests__/gate-logic-quoted-strings.test.js:38-66` lock this asymmetry).
 *
 * Bypass risk: `node -e "require('child_process').exec('npm install')"` no longer matches
 * `package-manager` after the strip. This is documented in finding
 * `meta-260615T<HHMM>Z-node-e-strip-bypass-risk-...` and caught by
 * `gate_check_recurrence` (shipped in plan 260615-1530-bash-gate-debate-stderr-override-recurrence)
 * if the pattern recurs N>=3 in M<=10min.
 *
 * @param {string} segment - A single command segment (output of `splitSegments`).
 * @returns {string} The segment with the body of any `node -e|--eval|-p|--print` wrapper blanked.
 */
export function stripNodeEvalBody(segment) {
  if (typeof segment !== "string" || !segment) return segment;
  // Match: (node|nodejs) ( -e | --eval | -p | --print ) "..." or '...'
  // Replace the quoted body with an empty placeholder. E.g.:
  //   node -e "foo bar"   ->   node -e ""
  //   node --eval 'baz'   ->   node --eval ''
  //   node -e "a" -e "b"  ->   node -e "" -e ""  (g flag handles multiple)
  return segment.replace(
    /\b(node|nodejs)\s+(-e|--eval|-p|--print)\s+(["'])(?:(?!\3).)*\3/g,
    (match, _node, _flag, quote) => match.replace(/(["'])(?:(?!\1).)*\1/, `${quote}${quote}`)
  );
}
```

**Regex breakdown**:
- `\b(node|nodejs)` — word boundary + node or nodejs binary name
- `\s+` — at least one whitespace
- `(-e|--eval|-p|--print)` — one of the documented eval/print flags
- `\s+` — at least one whitespace
- `(["'])` — capture the opening quote
- `(?:(?!\3).)*` — any character that is NOT the captured opening quote (negative lookahead — handles `'foo "bar" baz'` correctly)
- `\3` — backreference to the captured opening quote
- `g` — global flag, handles multiple `-e` flags in one segment

**Replacer**: the second `replace` uses a non-capturing group `(["'])` to re-capture the quote, then a negative lookahead, then a backreference — same pattern as the outer one. The replacement is `${quote}${quote}` (two of the same quote character, no body).

**Edge cases handled**:
- Empty body: `node -e ""` → `node -e ""` (no change; nothing to strip).
- Single-quote body: `node -e 'foo'` → `node -e ''`.
- Double-quote body with nested single quotes: `node -e "foo 'bar' baz"` → `node -e ""` (the negative lookahead correctly handles the inner single quotes).
- Multiple flags: `node -e "a" -e "b"` → `node -e "" -e ""` (the `g` flag).
- No flag: `node script.js` → unchanged.
- `nodejs` binary (Linux convention): `nodejs -e "foo"` → `nodejs -e ""`.

**Edge cases NOT handled (and intentionally so)**:
- `node -e foo bar` (unquoted, multi-token body) — the existing `splitSegments` would split on whitespace, so the body is already broken up. The strip is no-op for unquoted bodies.
- `NODE=foo node -e "bar"` (env var prefix) — the strip is no-op (the body is intact). The regex `\b` would match `node` after the `=`, so it would still strip correctly. Verified by the test plan.

### Insertion sites

```js
// tools/learning-loop-mcp/core/gate-logic.js#matchConstraintPattern
// EXISTING (lines 209-217):
export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;

  for (const segment of splitSegments(command)) {
    const stripped = stripMessageFlags(segment);
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(stripped)) return type;       // CHANGED
    }
  }
  return null;
}

// CHANGED TO:
export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;

  for (const segment of splitSegments(command)) {
    const stripped = stripMessageFlags(segment);
    const nodeStripped = stripNodeEvalBody(stripped);   // NEW
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(nodeStripped)) return type;       // CHANGED (was `stripped`)
    }
  }
  return null;
}
```

```js
// tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules (regex branch, ~line 687)
// EXISTING:
} else if (pattern_type === "regex" && command) {
  if (!isSafeRegexPattern(pattern)) {
    console.warn(`Rule ${rule_id}: regex pattern rejected by safety check`);
    continue;
  }
  for (const segment of splitSegments(command)) {
    const stripped = stripMessageFlags(segment);
    if (new RegExp(pattern).test(stripped)) {          // CHANGED
      matched = true;
      break;
    }
  }
}

// CHANGED TO:
} else if (pattern_type === "regex" && command) {
  if (!isSafeRegexPattern(pattern)) {
    console.warn(`Rule ${rule_id}: regex pattern rejected by safety check`);
    continue;
  }
  for (const segment of splitSegments(command)) {
    const stripped = stripMessageFlags(segment);
    const nodeStripped = stripNodeEvalBody(stripped);   // NEW
    if (new RegExp(pattern).test(nodeStripped)) {       // CHANGED (was `stripped`)
      matched = true;
      break;
    }
  }
}
```

### The bypass-risk finding

Filed via `meta_state_report` MCP tool:

```json
{
  "id": "meta-260615T<HHMM>Z-node-e-strip-bypass-risk",
  "entry_kind": "finding",
  "category": "loop-anti-pattern",
  "severity": "warning",
  "affected_system": "gate-logic",
  "subtype": "strip-bypass-accepted",
  "description": "The new `stripNodeEvalBody` function in tools/learning-loop-mcp/core/gate-logic.js blanks the body of `node -e|--eval|-p|--print` wrappers before constraint-pattern regex matching. Trade-off: `node -e \"require('child_process').exec('npm install')\"` no longer matches the `package-manager` constraint (the command is inside the blanked body). This is an accepted bypass, not a fix; the user-stated design from plans/reports/brainstorm-260615-1300-...#plan-2 chose asymmetry (only node, not python-c/bash-c) for two reasons: (1) `python -c \"import docker\"` IS a real command and the body must remain visible (existing tests at __tests__/gate-logic-quoted-strings.test.js:38-66 lock this in), (2) the `node -e` pattern is rare in real agent flows (agents use `node script.js`, not `node -e`). Catch-net: the `gate_check_recurrence` MCP tool shipped in plan 260615-1530-bash-gate-debate-stderr-override-recurrence auto-files a finding via `meta_state_report` if `node -e \"...\"` matches a constraint N>=3 times in M<=10min. The recurrence tracker reads `.gate-decision.log` (cross-surface) and groups by `rule_id + command_prefix_normalized`. The operator/agent can also resolve this finding manually by refining the strip (e.g., re-add the body for `package-manager` only) or by promoting a new gate rule that catches `node -e` wrappers specifically.",
  "evidence_code_ref": "tools/learning-loop-mcp/core/gate-logic.js#stripNodeEvalBody",
  "evidence_test": "tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js",
  "mechanism_check": true,
  "expires_at": null,
  "status": "reported"
}
```

### The change-log

Filed via `meta_state_log_change` MCP tool:

```json
{
  "id": "meta-260615T<HHMM>Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody",
  "entry_kind": "change-log",
  "change_dimension": "mechanical",
  "change_target": "tools/learning-loop-mcp/core/gate-logic.js#stripNodeEvalBody",
  "change_diff": {
    "added": [
      "stripNodeEvalBody(segment) function in core/gate-logic.js — blanks the body of `node -e|--eval|-p|--print` wrappers",
      "Insertion in matchConstraintPattern (after stripMessageFlags, before regex test)",
      "Insertion in applyPromotedRules regex branch (after stripMessageFlags, before regex test)",
      "3 new tests in __tests__/gate-logic-quoted-strings.test.js (node -e body cases — RED-then-GREEN)",
      "1 new test in __tests__/gate-promoted-rules.test.js (G8-style integration test for applyPromotedRules + node -e body)",
      "2 new regression-guard tests in __tests__/gate-logic-quoted-strings.test.js (python -c, bash -c — pre-existing assertion style, locked in before the implementation)",
      "1 bypass-guard test in __tests__/gate-logic-quoted-strings.test.js for the package-manager bypass (documentation-by-test)"
    ],
    "removed": [],
    "changed": [
      "matchConstraintPattern: stripped -> nodeStripped (post-stripNodeEvalBody)",
      "applyPromotedRules regex branch: stripped -> nodeStripped (post-stripNodeEvalBody)"
    ]
  },
  "reason": "Ships Step 3 of the cross-report planning order — Report 1 Plan 2 from the bash-gate-debate brainstorm. Closes gap #1 of finding meta-260614T2141Z-... (the node -e body false positive documented in plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md#plan-2). Asymmetric by user-stated design: only node wrappers are stripped; python -c / bash -c / ruby -e / perl -e / sh -c bodies remain visible (their bodies are real commands). Bypass risk: node -e \"require('child_process').exec('npm install')\" no longer matches package-manager — documented in finding meta-260615T<HHMM>Z-node-e-strip-bypass-risk and caught by gate_check_recurrence (shipped in plan 260615-1530-...) if it recurs.",
  "applies_to": {
    "files": [
      "tools/learning-loop-mcp/core/gate-logic.js#stripNodeEvalBody",
      "tools/learning-loop-mcp/core/gate-logic.js#matchConstraintPattern",
      "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
      "tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js",
      "tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js"
    ],
    "rules": ["rule-no-new-artifact-types"],
    "schemas": ["core/patterns.json#package-manager"]
  },
  "evidence_code_ref": "tools/learning-loop-mcp/core/gate-logic.js#stripNodeEvalBody",
  "evidence_journal": "docs/journals/260615-step3-node-e-strip.md",
  "affected_system": "gate-logic"
<!-- Updated: Validation Session 1 — affected_system changed from meta to gate-logic. -->
}
```

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/gate-logic.js` — 1 new function (~15 lines incl. JSDoc), 2 insertion sites (2 lines each), 1 file-level comment (1 line).
- Modify: `meta-state.jsonl` — 1 new finding + 1 new change-log (via MCP tools; no direct file writes).
- Create: `docs/journals/260615-step3-node-e-strip.md` — cook-handoff journal entry (1-2 paragraphs, captures the design decision + the bypass risk + the cross-plan relationship to Step 2 and Step 4).
- No other files touched.

## Implementation Steps (TDD)

1. **Read `core/gate-logic.js` lines 195-220 (matchConstraintPattern) and lines 670-700 (applyPromotedRules regex branch).** Confirm the current state matches the snippets in this phase's Architecture section. (The files were read during planning; quick re-read only to confirm the diff is clean.)
2. **Add `stripNodeEvalBody` after `stripMessageFlags` in `core/gate-logic.js`.** Place it directly below `stripMessageFlags` (sibling position). Add the JSDoc above the function. Add a file-level comment (above the imports) noting the strip + the bypass risk + the catch-net:
   ```js
   // tools/learning-loop-mcp/core/gate-logic.js (file-level comment, above line 1)
   /**
    * Pure gate decision logic — no I/O, fully testable.
    * Single source of truth for constraint patterns and gate decisions.
    *
    * Strip functions (splitSegments, stripMessageFlags, stripNodeEvalBody) form
    * a layered pipeline: a command is split into segments, then each segment
    * is stripped of message-flag bodies and (for `node -e` wrappers) the eval
    * body. The regex matching constraint patterns sees only the command verb.
    * The `node -e` strip is asymmetric by user-stated design (see
    * stripNodeEvalBody JSDoc and finding meta-260615T<HHMM>Z-node-e-strip-bypass-risk-...).
    */
   ```
3. **Insert the call into `matchConstraintPattern`.** Add `const nodeStripped = stripNodeEvalBody(stripped);` after the `stripped` line. Change the regex test from `pattern.test(stripped)` to `pattern.test(nodeStripped)`.
4. **Insert the call into `applyPromotedRules` regex branch.** Same pattern.
5. **Run `pnpm test -- gate-logic-quoted-strings`.** Expect: 3 RED tests now GREEN, 2 regression-guard tests stay GREEN, 17 existing tests still GREEN. Total: 22 passing.
<!-- Updated: Validation Session 1 — 3 node-e tests (was 2). -->
6. **Run `pnpm test -- gate-promoted-rules`.** Expect: 1 RED test now GREEN, 23+ existing tests still GREEN. Total: 24+ passing.
7. **Run full `pnpm test`.** Expect: 0 new failures; 870+ tests pass (the 6 new tests + 0 regressions).
8. **Refactor.** Confirm the diff in `core/gate-logic.js` is:
   - 1 new function (`stripNodeEvalBody`) with JSDoc (~15 lines).
   - 1 new line in `matchConstraintPattern` (`const nodeStripped = ...`).
   - 1 changed line in `matchConstraintPattern` (`stripped` → `nodeStripped` in `pattern.test(...)`).
   - 1 new line in `applyPromotedRules` regex branch.
   - 1 changed line in `applyPromotedRules` regex branch.
   - 1 file-level comment update (the multi-line header).
9. **Whole-plan consistency check.** `grep -n "stripNodeEvalBody\|stripMessageFlags" tools/learning-loop-mcp/core/gate-logic.js` — expect 4-5 hits (1 function definition + 2 call sites + 1 file-level comment + 1 sibling reference in JSDoc). `grep -n "stripNodeEvalBody" tools/learning-loop-mcp/__tests__/` — expect 0 hits (the function is not directly imported by the tests; they go through `matchConstraintPattern` and `applyPromotedRules`).
10. **File the bypass-risk finding.** Call `meta_state_report` MCP tool with the JSON from § "The bypass-risk finding" above (substitute the actual HHMM timestamp from `date -u +%H%M`). The tool appends to `meta-state.jsonl` with a computed fingerprint. The `code_fingerprint` field is set to the SHA-256 of the new function's source (auto-computed).
11. **File the change-log.** Call `meta_state_log_change` MCP tool with the JSON from § "The change-log" above (same HHMM substitution).
12. **(Operator decision — not automated)** Optionally resolve the parent finding `meta-260614T2141Z-...`. Because it is now `stale` (TTL expired at 2026-06-15T14:41:31Z), it must be acked first (`meta_state_ack`) before `meta_state_resolve` will accept a resolution. After ack, call `meta_state_refresh_fingerprint` with `evidence_code_ref = tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules` and then `meta_state_resolve` with `resolution = "Gap #1 closed by Step 3; gap #2 closed by Step 2 (meta-260615T1459Z-...)"`. The operator's call; this plan does not require it.
<!-- Updated: Validation Session 1 — added ack-before-resolve note because parent finding is stale. -->
13. **Write the journal entry.** `docs/journals/260615-step3-node-e-strip.md` — 1-2 paragraphs covering: the design (asymmetric strip), the bypass risk (documented + observable via Step 2's infrastructure), the cross-plan relationship (Step 3 of 4, all 4 steps are now in flight or shipped).
14. **Commit + ship.** Single commit on branch `260614-1259-phase-b-codegen-adoption` (the current branch per `git status`). The commit message references the planning-order report + this plan's path + the change-log id.

## Success Criteria

- [ ] `stripNodeEvalBody(segment)` is exported from `core/gate-logic.js`.
- [ ] `matchConstraintPattern` calls `stripNodeEvalBody` after `stripMessageFlags`.
- [ ] `applyPromotedRules` regex branch calls `stripNodeEvalBody` after `stripMessageFlags`.
- [ ] `pnpm test -- gate-logic-quoted-strings` shows 22 passing tests (17 existing + 3 new node -e + 2 regression guards).
- [ ] `pnpm test -- gate-promoted-rules` shows 24+ passing tests (23+ existing + 1 new G8-style).
- [ ] `pnpm test` shows 0 new failures; 870+ tests pass.
<!-- Updated: Validation Session 1 — 6 new tests total (was 5). -->
- [ ] `meta_state_report` finding `meta-260615T<HHMM>Z-node-e-strip-bypass-risk-...` is filed.
- [ ] `meta_state_log_change` change-log `meta-260615T<HHMM>Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody-...` is filed.
- [ ] `docs/journals/260615-step3-node-e-strip.md` is written.
- [ ] Commit lands on branch `260614-1259-phase-b-codegen-adoption`.
- [ ] Whole-plan consistency check: `stripNodeEvalBody` is referenced in `core/gate-logic.js` only (no unintended touch points); `meta-state.jsonl` has 2 new entries (finding + change-log); tests do not import `stripNodeEvalBody` directly (they go through the public surface).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The strip is too aggressive (strips real commands) | The asymmetry is locked in by the 2 regression-guard tests (`python -c`, `bash -c`). The `node -e` pattern is the only one stripped; the regex requires the literal `-e|--eval|-p|--print` flag. `node script.js` is untouched. |
| The strip is too narrow (misses `node --inspect-brk=0.0.0.0:9229 -e "..."`) | The regex matches `\b(node|nodejs)\s+(-e|--eval|-p|--print)\s+` — order matters. `--inspect-brk` BEFORE `-e` is not matched (the regex requires the flag to be the first token after the binary). `--inspect-brk=... -e "..."` is matched (the flag is the next token after the binary if `--inspect-brk` is between the binary and `-e`). This is a minor gap; if it recurs, extend the regex to accept flags in any order. The recurrence tracker catches it. |
| The strip regresses an existing test (the new tests pass but an old test breaks) | The full `pnpm test` run in step 7 catches this. If a regression is detected, the function is too aggressive and needs to be retuned. The 2 regression guards (python-c, bash-c) are the most likely failure points. |
| The bypass risk recurs in production (an agent runs `node -e "require('child_process').exec('npm install')"` and the gate misses it) | The `gate_check_recurrence` MCP tool (Step 2) auto-files a finding after N>=3 occurrences in M<=10min. The operator/agent can resolve the finding by refining the strip or promoting a new rule. The `.gate-decision.log` is the audit trail. |
| The new finding `meta-260615T<HHMM>Z-node-e-strip-bypass-risk-...` is auto-resolved by the meta-state sweep | The sweep auto-resolves findings whose `evidence_code_ref` file is modified after creation. The strip's `evidence_code_ref` is the file the strip lives in — modifying it (e.g., extending the regex) would auto-resolve the finding. This is the intended behavior: if the operator refines the strip, the bypass-risk finding is closed. If the operator wants the finding to persist, set `expires_at` to `null`. Default to `null` for this finding. |
| The change-log id collision (a previous step landed at the same HHMM) | Step 2's change-log id is `meta-260615T1459Z-...`. This plan's HHMM is whatever the operator picks; the slug `tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody` is unique. If a collision occurs (same slug), append a numeric suffix. |
| Operator decision on resolving `meta-260614T2141Z-...` is wrong (resolve too early, find a regression later) | The plan lists the resolve as "operator decision — not automated". The operator can re-open the finding via `meta_state_re_verify` if a regression is detected later. The plan does not force the resolution. |
| The function name `stripNodeEvalBody` is too long; rename to `stripNodeEval` for symmetry with `stripMessageFlags` | The name is descriptive and matches the function's scope (whole body, not just the eval). `stripMessageFlags` strips the flag and its value; `stripNodeEvalBody` strips only the body of a `node -e` wrapper (the flag stays). Keep the descriptive name. |

## Security Considerations

- The strip is a pure string transform. No new attack surface.
- The bypass is documented (the new finding makes it visible to the operator).
- The strip is asymmetric (only `node` wrappers; the `python -c` / `bash -c` bodies remain visible to the regex — this is correct because those bodies are real commands).
- The strip is reversible (one-line revert in `core/gate-logic.js` if a future plan needs to undo it).
- The strip does not change the `package-manager` pattern itself; the bypass is a side-effect of the strip's design choice, not a bug in the pattern.

## Unresolved questions

- **Should the `node -e` strip also handle `--require` / `-r` flags?** Per the report, no — `--require` is a less common pattern; if it recurs, the recurrence tracker catches it. Defer to a future plan if a finding is filed.
- **Should the strip be exposed as a public MCP tool (e.g., `strip_node_eval_body`)?** Per the report, no — the function is internal to the gate. The agent does not need to call it; the gate calls it. The tests verify the behavior; the function is a private utility.
- **Should the bypass-risk finding be promoted to a rule?** No — a rule would be enforced, but the bypass is informational (a trade-off, not a violation). The finding is the right shape. If the operator wants to enforce the bypass, they can promote a new rule that catches `node -e` wrappers specifically.

## Next Steps

After Phase 2 ships:
- The plan is complete. The cross-plan matrix (per `brainstorm-260615-1430-planning-order-...`) updates: Step 3 status = `shipped`.
- The operator can optionally refresh + resolve `meta-260614T2141Z-...` (the finding that gap #1 came from).
- Step 4 (`260615-runtime-agnostic-rule-phases-2-5`) becomes the next plan.
- The cleanup backlog (per `brainstorm-260615-1430-planning-order-...` § Cleanup backlog) accumulates minor findings from each shipped step; processed in one session after all 4 steps ship.
</content>
</invoke>
