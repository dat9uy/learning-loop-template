---
phase: 3
title: "Regression Guard + Finding Resolution"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: Regression Guard + Finding Resolution

## Overview

Lock the savings win with a vitest regression guard derived from the live
`CLI_TOOLS` set (not a magic number), then resolve the finding with recorded
evidence — closing the dogfood loop: measured-and-recorded, not asserted-once.

## Requirements

- Functional: a test that fails when (a) any `CLI_TOOLS` member stops being counted in dropped def bytes, or (b) savings fall below a conservative floor.
- Non-functional: floor is derived (`savings_pct >= 50`, half the observed ~94% win), documented as tripwire not precision metric.

## Architecture

Extend `__tests__/cli-context-savings.test.js` (same file as Phase 1 — one
owner for the invariant) with a guard describe-block:

1. **Coverage assertion**: every `CLI_TOOLS` member appears in `per_tool` of the real-manifest computation — catches a tool renamed in the manifest but not in `cli-tools.js` (silent savings erosion).
2. **Floor assertion**: real-manifest `savings_pct >= 50` — catches banner re-bloat or mass tool reclassification shrinking the win. Failure message directs: shrink the banner (see the banner budget test) or reclassify with a documented reason in the drift test.
3. **Banner budget chain**: assert real `banner_bytes` (records-via-cli variant) < 4096, matching the existing budget in `cli-sessionstart-banner.test.js` — single commandeered invariant, do not duplicate the value; import the computation, keep the budget literal in one place (the banner test owns it; this test references the same bound only if trivially shareable, otherwise comments point at the owner).

Real-manifest computation in tests = the same path as the script (JSONC parse of `tools/manifest.json`, `createRequire` for the hook banner). No MCP server, no ledger.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/cli-context-savings.test.js`
- Read-only refs: `__tests__/cli-sessionstart-banner.test.js:85-96`, `__tests__/cli-write-tool-set-drift.test.js`

## Implementation Steps (TDD)

1. RED: add the guard tests; verify the coverage assertion fails when a known CLI tool name is temporarily excluded (mutation check), then revert.
2. GREEN: they pass against the real manifest/banner.
3. Verify the recorded ledger row from Phase 2 exists (`runtime_state_read`); capture as resolution evidence.
4. Resolve the finding: `bin/loop.mjs meta_state_resolve` with resolution citing the new module, script, guard test, and the recorded row id; `source_refs` per internalization rule (`local:meta-state:` chain — the resolution text names evidence code paths for `evidence_code_ref` grounding where applicable).
5. Log the change: `meta_state_log_change` for the new measurement capability (designs-no-code hint N/A — code exists, cite it).
6. Full `pnpm test` green.

## Success Criteria

- [ ] Guard tests pass; mutation check proved they can fail
- [ ] Finding `meta-260722T1546Z` status=resolved with evidence citation
- [ ] `pnpm test` green end-to-end
- [ ] No duplicated byte-budget literal between the two test files

## Risk Assessment

- Floor too tight/loose → 50% is half the observed win; deliberate tripwire. If the tool set legitimately grows (more CLI tools → MORE dropped bytes → savings improves), floor moves the safe direction. Banner growth is bounded by the existing 4 KiB budget.
- Resolving prematurely → resolution is the last step, gated on the recorded-row verification.
