---
phase: 1
title: "Design rule shape"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Design rule shape

## Overview

Freeze the exact rule id, fields, and 3-item checklist content before promoting. This is a no-code phase — produces a frozen JSON body (in `plan.md` Appendix A) that Phase 2 submits verbatim to `meta_state_promote_rule`.

## Requirements

- Functional: rule id matches `/^rule-[a-z0-9-]+$/` per `core/meta-state.js:166`. Pattern field is JSON-encoded for `consult-checklist` per existing precedents. Origin points to the most representative of the 3 source findings (broadest category: `tool-integration-incomplete`).
- Non-functional: the 3 checklist items must be (a) actionable in one sentence each, (b) traceable to one of the 3 source findings, (c) independent enough to be checked separately.
- **Per R-CRIT-3:** the `description` field in Appendix A is NOT installed by `meta_state_promote_rule` — the tool hard-codes `description: \`Gate-enforced rule: ${rule_id}. Pattern type=${pattern_type}; pattern=${pattern}.\`` at line 169 of `meta-state-promote-rule-tool.js`. Appendix A documents this caveat. Phase 1 freezes the **pattern body**, not the description text.

## Architecture

No code changes. Output is a frozen JSON body published in `plan.md` Appendix A (already written).

## Related Code Files

- Modify: `plan.md` (Appendix A — already contains the frozen rule body)
- No code edits.

## Implementation Steps

1. **Verify the proposed rule id `rule-tool-integration-same-commit-dep` matches `/^rule-[a-z0-9-]+$/`.** Test with: `echo "rule-tool-integration-same-commit-dep" | grep -E '^rule-[a-z0-9-]+$'`. Should print the id.
2. **Verify each of the 3 checklist items maps 1:1 to a source finding:**
   - item 1 (`same-commit-dependency`) → finding 1 (`meta-260628T1328Z-commit-6f9402e-...`)
   - item 2 (`baseline-flag-format`) → finding 2 (`meta-260628T1328Z-fallow-dead-code-save-regression-...`)
   - item 3 (`baseline-storage`) → finding 3 (`meta-260628T1329Z-when-fallow-runs-...`)
3. **Verify the JSON pattern body is valid JSON.** Run: `node -e 'JSON.parse(process.argv[1])' "$(cat <<'EOF'
   {"version":1,"items":[...]}
   EOF
   )"`. Should exit 0.
4. **Sanity-check the description length (informational only).** The custom description in Appendix A is NOT installed; the tool overrides it. But for documentation purposes, verify the custom text is reasonable (~280 chars, satisfies Zod `min(20)` if it WERE installed).
5. **Freeze.** Phase 1 closes with no further edits to Appendix A; Phase 2 reads it verbatim.

## Success Criteria

- [ ] Rule id matches `/^rule-[a-z0-9-]+$/`
- [ ] 3 checklist items map 1:1 to the 3 source findings
- [ ] JSON pattern body parses cleanly via `node -e 'JSON.parse(...)'`
- [ ] Appendix A documents the R-CRIT-3 caveat about the tool-overridden description
- [ ] `plan.md` Appendix A is the single source of truth for the rule body

## Risk Assessment

- **R1 — JSON body has a syntax error.** Mitigation: dry-run `node -e 'JSON.parse(...)'` before freezing; if it fails, fix and re-freeze.
- **R2 — Operator expects the custom description to land in the registry.** Mitigation: Appendix A explicitly documents the tool override at `meta-state-promote-rule-tool.js:169`. The actual registry entry's `description` will be the auto-generated form. Phase 3's `core/README.md` section captures the full checklist content in human-readable form, so the registry's truncated description is not the only documentation surface.