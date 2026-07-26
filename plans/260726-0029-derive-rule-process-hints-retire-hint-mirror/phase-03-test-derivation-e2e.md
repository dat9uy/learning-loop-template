---
phase: 3
title: "Test-count derivation + E2E repro + finding resolution"
status: completed
priority: P1
effort: "3h"
dependencies: [2]
completed: 2026-07-26
---

# Phase 3: Test-count derivation + E2E repro + finding resolution

## Overview

Close Gap B: replace every pure-numeric count literal in the 3 test files
with values derived from the registry/view, keep the legitimate drift-signal
assertions hardcoded, then reproduce the original finding scenario
(promote a new agent-checklist rule) with a pollution-safe sequence,
re-ground, and resolve the finding.

## Requirements

- Functional: no derivable count literal remains; promoting a rule requires
  zero test-file edits except the intentional slug-list append.
- Non-functional: slug lists, merged-order, and partition-budget assertions
  stay hardcoded (they catch real drift); E2E leaves no live residue.

## Architecture

Derived replacements (import `HINT_REGISTRY` / `buildProcessView` in tests):

| File | Literal | Replacement |
|---|---|---|
| `__tests__/hint-registry.test.cjs` | `disc.length === 16` | `HINT_REGISTRY.filter(kind==='discoverability').length` |
| same | `proc.length === 11` | `buildProcessView({rulesById}).length` (fixture map) |
| same | `standalone.length === 2` | `view.filter(derived_from_rule == null).length` |
| same | `listHints() === 27` | `HINT_REGISTRY.length` |
| `__tests__/hint-renderer.test.cjs` | total hints 26/27, degraded-skip warnings 8 | derived from view + fixture rules |
| `__tests__/rule-derived-process-hints.test.cjs` | sidecar `process_hints` length, mcp-warm array length, provenance rows, "8 rule-derived rows at positions 2-10" | derived counts; positions assertion becomes order-key assertion |

Careful with the degraded-skip warnings count: it counts rules present in
the fixture map but lacking `hint_text` — keep the fixture explicit and
derive the expected count from the fixture, never by running the renderer
(do not derive expectations from the system under test).

**E2E sequencing (pollution-safe):** the smoke rule is live only between
steps c and e; the full suite never runs against polluted live state.
Which test files read live `meta-state.jsonl` vs fixture maps must be
established in step a (grep for `loadPromotedRules` / no-arg
`buildProcessHints()` calls in `__tests__/`) so the smoke rule's blast
radius is known up front.

**Re-grounding before resolution:** Phase 2 rewrites
`tools/learning-loop-mastra/core/hint-registry.js` — the finding's own
`evidence_code_ref` — so the file-index fingerprint goes stale and
`last_verified_at` is patch-immutable (core/meta-state.js:648). The resolve
tool gates on active determinism-checklist rules
(meta-state-resolve-tool.js:82-114), so refresh BEFORE resolving.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/hint-registry.test.cjs`
- Modify: `tools/learning-loop-mastra/__tests__/hint-renderer.test.cjs`
- Modify: `tools/learning-loop-mastra/__tests__/rule-derived-process-hints.test.cjs`
- Modify: `docs/architecture.md` or `docs/loop-engine.md` only if they
  describe the mirror/coverage invariant (grep for "hint-registry" /
  "HINT_REGISTRY" in docs/ first)

## Implementation Steps (TDD)

1. Grep the 3 test files for numeric literals tied to counts
   (`toBe(26)`, `length, 11`, `=== 8`, etc.); tabulate each as
   derive-vs-keep per the finding's rule (pure derivations → derive;
   slug lists/order/budgets → keep).
2. Convert derivable literals one file at a time, keeping the suite green
   after each file.
3. E2E repro of the finding scenario (pollution-safe sequence):
   a. Establish which test files read live `meta-state.jsonl` (grep); run
      the FULL suite → baseline green (pre-promotion).
   b. Report a loop-anti-pattern finding (or reuse a fixture id).
   c. `loop.mjs meta_state_promote_rule '{"id":..., "rule_id":"rule-e2e-hint-derivation-smoke", "enforcement":"agent", "pattern_type":"agent-checklist", "pattern":"<json blob>", "hint_text":"<≥20 chars>", "hint_suggestion":"<20-200 chars, single line>", "preview":true}'` then live (LOOP_SESSION_MODE=live).
   d. While the rule is live, run ONLY the render-path verification:
      `node tools/scripts/hint-render.mjs` (assert the new hint appears in
      sidecar/mcp-warm output) + the inverted coverage test. Do NOT run
      the full suite in this window.
   e. Cleanup with a trap/finally (archive the smoke rule) so failure in d
      cannot skip it; archived rules don't render (`loadPromotedRules`
      filters `status === "active"`, gate-logic.js:766).
   f. Run the full `pnpm test` again → green with the single slug-list
      append hand-edit (the legitimate drift signal from the validation
      session). The suite runs against the same live registry as baseline
      (smoke rule archived), which is what makes the "no other edits"
      claim honest.
4. Docs: update the smallest owning surface if it describes the old mirror
   invariant (grep first; likely docs/architecture.md § context-injection).
5. Re-ground, then resolve:
   a. `loop.mjs meta_state_refresh_file_index '{"path":"tools/learning-loop-mastra/core/hint-registry.js"}'`
      (re-grounds the rewritten evidence file's fingerprint; the finding's
      `evidence_code_ref` path is unchanged — buildProcessView lives in the
      same file — so no re-point needed).
   b. `loop.mjs meta_state_touch '{"id":"meta-260722T0001Z-promoting-an-agent-checklist-rule-is-a-manual-4-location-cas"}'`
      if checkGrounding still reports drift (operator attestation path).
   c. `loop.mjs meta_state_derive_status` → then `meta_state_resolve` with
      `resolution` citing buildProcessView (core/hint-registry.js),
      the deleted mirror, and the inverted coverage test.

## Success Criteria

- [ ] `grep -nE "toBe\((26|27|11|10|8|16|2)\)|length,? (26|27|11|10|8)"` over
      the 3 test files returns only keep-listed (slug/order/budget) lines.
- [ ] E2E: full-suite baseline green → smoke rule promoted via one CLI call
      (with `hint_suggestion`) → render-path shows the hint → rule archived
      via trap → full suite green again, single slug-list append hand-edit.
- [ ] Live-registry-reading vs fixture-based test files enumerated in the
      session report.
- [ ] Smoke rule archived; registry state matches baseline plus documented
      history entries.
- [ ] Finding meta-260722T0001Z resolved, fingerprint re-grounded, with
      resolution citing the new code path.

## Risk Assessment

- Fixture-coupled counts: deriving from fixtures keeps tests honest only if
  fixtures stay explicit — never compute expected values by running the
  renderer.
- Smoke-rule residue: trap/finally guarantees archival even on verification
  failure; a leaked active smoke rule would change SessionStart output for
  all future sessions (double-check with `meta_state_list` after step e).
- Resolve rejection: if `meta_state_resolve` returns
  `resolution_evidence_required`, the re-grounding steps (5a/5b) were
  skipped or incomplete — rerun them; do not weaken the determinism-checklist
  rule.
