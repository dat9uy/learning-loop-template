---
phase: 3
title: "Extend consult-checklist rule with 4th item for third-party Action pinning"
status: pending
priority: P2
dependencies: [phase-02-design]
---

# Phase 3: Extend consult-checklist rule with 4th item for third-party Action pinning

## Overview
Add a 4th item to `rule-tool-integration-same-commit-dep` covering third-party GitHub Action swaps: pin to commit SHA, not tag; rely on the Action's cryptographic verification. Tests-first: extend the regression test before mutating the rule pattern. Mirrors the encoding pattern used in plan 260628-1337-fallow-tool-integration-rule-encoding.

## Requirements

- **Functional:**
  - Add 4th consult-checklist item to `rule-tool-integration-same-commit-dep` describing the SHA-pin + crypto-verify requirement
  - Add a matching `PROCESS_HINTS` row in `tools/learning-loop-mastra/core/loop-introspect.js`
  - Mirror to `.factory/hooks/loop-surface-inject.cjs` (cold-session parity)
  - Add a "Tool integration checklist" section to `tools/learning-loop-mastra/core/README.md`
- **Non-functional:**
  - Tests-first per `--tdd` flag; regression test green BEFORE mutation
  - All 1369 existing tests pass

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (PROCESS_HINTS row)
- Modify: `tools/learning-loop-mastra/core/README.md` (new section)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` (regression tests)
- Modify: `.factory/hooks/loop-surface-inject.cjs` (mirror)
- Modify: `meta-state.jsonl` (rule pattern via `meta_state_promote_rule` or `meta_state_patch`)
- No new files (YAGNI)

## Implementation Steps

### TDD: Write failing tests first

1. **Read existing regression test** at `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` — verify it loads the rule's pattern via `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})` and asserts the 3 items exist.

2. **Add 2 new test cases** (extend the existing test file; do NOT create a new one):
   ```js
   test("rule has 4th item covering 3rd-party Action SHA pin", async () => {
     const rule = await getRule("rule-tool-integration-same-commit-dep");
     const items = JSON.parse(rule.pattern).items;
     const fourth = items.find((i) => i.id === "third-party-action-sha-pin");
     assert.ok(fourth, "4th item must be present");
     assert.match(fourth.description, /commit SHA/);
     assert.match(fourth.description, /cryptograph|verif|signed/);
   });

   test("PROCESS_HINTS in loop-introspect.js mentions 3rd-party Action SHA pin", () => {
     const hints = readProcessHints();
     assert.ok(
       hints.some((h) => /fallow-rs\/fallow@<commit-sha>/.test(h) || /third-party Action.*SHA/i.test(h)),
       "PROCESS_HINTS row must reference SHA pinning"
     );
   });
   ```

3. **Run tests** — confirm both new cases FAIL (red phase). The 4th item does not exist yet.

### Mutate the rule

4. **Update the rule's pattern** in `meta-state.jsonl` via `meta_state_patch`:
   ```bash
   # Get the rule's current version for CAS
   meta_state_list({ id: "rule-tool-integration-same-commit-dep", entry_kinds: ["rule"] })
   # Patch with the new 4th item
   meta_state_patch({
     id: "rule-tool-integration-same-commit-dep",
     entry_kind: "rule",
     patch: {
       description: "Gate-enforced rule: rule-tool-integration-same-commit-dep. ...[existing description]...",
       pattern: '{"version":1,"items":[<3 existing items>,' +
                '{"id":"third-party-action-sha-pin","description":"When swapping a hand-rolled `pnpm exec <tool>` or `npx <tool>` for a third-party GitHub Action (`uses: <vendor>/<tool>@<ref>`), pin to commit SHA, not tag (`uses: <vendor>/<tool>@<sha>`). Verify the Action provides cryptographic signature verification (e.g., fallow-rs/fallow v2 uses Ed25519 + SHA-256 + sentinel) and assert `verified: yes (<sentinel-path>)` in the CI logs. Tag-based pins drift silently when the upstream re-tags; SHA pins survive tag deletion."}]}'
     }
   })
   ```
   Source for the 4th-item wording: researcher #2 §4 (cryptographic verification model) + §1 (pin strategy).

5. **Re-run tests** — confirm both new cases PASS (green phase).

### Mirror to adjacent surfaces

6. **Add PROCESS_HINTS row** in `tools/learning-loop-mastra/core/loop-introspect.js` between line 119 and the closing `]);` at line 120:
   ```js
   {
     id: "third-party-action-sha-pin",
     description: "When swapping a hand-rolled `pnpm exec <tool>` for a third-party GitHub Action (e.g., fallow-rs/fallow@v2), pin to commit SHA, not tag. Verify the Action provides cryptographic signature verification (Ed25519 + SHA-256 + sentinel) and assert `verified: yes (<sentinel-path>)` in CI logs. See rule-tool-integration-same-commit-dep item 4."
   }
   ```

7. **Mirror to `.factory/hooks/loop-surface-inject.cjs`** — append the same PROCESS_HINTS row to `LOCAL_PROCESS_HINTS` (cold-session parity, mirrors existing rows).

8. **Add "Tool integration checklist" section** to `tools/learning-loop-mastra/core/README.md` after the existing "Admission rule" section (around line 64), enumerating all 4 rule items by id. Existing 3-item precedent already exists from `260628-1337-fallow-tool-integration-rule-encoding`; this adds the 4th.

9. **Document change** — write a change-log entry via `meta_state_log_change` capturing:
   - `change_dimension: semantic`
   - `change_target: rule-tool-integration-same-commit-dep`
   - `change_diff: { added: ["items[3].id = third-party-action-sha-pin"] }`
   - `reason: "Action swap pattern (fallow-rs/fallow@v2) requires SHA pinning + cryptographic verification; encoded as 4th rule item to prevent regression in future tool integration plans"`
   - `applies_to.rules: ["rule-tool-integration-same-commit-dep"]`

## Success Criteria

- [ ] Both new test cases PASS
- [ ] All 3 existing test cases PASS (no regression)
- [ ] `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})` returns the rule with the 4th item present in the parsed `pattern` JSON
- [ ] `loop_describe({tier: "warm"})` does not warn about rule discovery
- [ ] `.factory/hooks/loop-surface-inject.cjs` `LOCAL_PROCESS_HINTS` contains a matching row
- [ ] `tools/learning-loop-mastra/core/README.md` has the "Tool integration checklist" section with all 4 items
- [ ] Change-log entry recorded

## Risk Assessment

- **Risk:** `meta_state_patch` deny-list blocks the `pattern` field (deny-listed as identity/audit-trail). **Mitigation:** `pattern` is the rule's defining field, NOT audit-trail; verify by reading `core/meta-state.js` IMMUTABLE_PATCH_FIELDS; if blocked, fall back to `meta_state_promote_rule` with `supersedes` pointing at the current rule.
- **Risk:** Tests rely on `getRule()` helper that may not exist in test scope. **Mitigation:** read the existing test file first; if helper absent, write minimal inline loading from meta-state.jsonl directly.
- **Risk:** Pattern JSON serialization differs between source and parsed form (whitespace, key order). **Mitigation:** tests parse both sides and compare semantically (parsed.items.length === 4), not textually.

## TDD Note

The `--tdd` flag is enforced in this phase: red tests (step 3) → mutation (step 4-5) → green tests (step 5 verified). Do NOT mutate the rule before the red tests fail — that would invert the gate.