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

1. **Byte-accuracy assertion** (differentiates from `cli-write-tool-set-drift.test.js`, which only enforces bucket membership): for every `CLI_TOOLS` member, the per-tool bytes counted by Phase 1 must equal `byteLength(JSON.stringify(wireDef))` where `wireDef = {name, description, inputSchema: z.toJSONSchema(legacy.schema, {target:"draft-7", io:"input"})}` — catches a handler whose schema changed silently (e.g. a new required field) without a corresponding drift test failure. The bucket membership invariant (every tool in `CLI_TOOLS` or `MCP_RESIDUE`) is already owned by `cli-write-tool-set-drift.test.js:119-154`; do not duplicate it.
2. **Floor assertion**: real-manifest `savings_pct >= 50` — catches banner re-bloat or mass tool reclassification shrinking the win. Failure message directs: shrink the banner (see the banner budget test) or reclassify with a documented reason in the drift test.
3. **Banner budget chain** (committed approach — shared constant): both `cli-sessionstart-banner.test.js` and `__tests__/cli-context-savings.test.js` import `BANNER_BYTES_BUDGET` from a new `tools/learning-loop-mastra/__tests__/banner-budget.js` helper. The banner test no longer owns the literal; the helper does. Single source, single update site, no hedge.

Real-manifest computation in tests = the same path as the script (JSONC parse of `tools/manifest.json`, `createRequire` for the hook banner). No MCP server, no ledger.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/banner-budget.js` (shared `BANNER_BYTES_BUDGET = 4096`)
- Modify: `tools/learning-loop-mastra/__tests__/cli-sessionstart-banner.test.js` (replace inline `4096` literal at line 93 with the import)
- Modify: `tools/learning-loop-mastra/__tests__/cli-context-savings.test.js` (add guard describe-block + import `BANNER_BYTES_BUDGET`)
- Read-only refs: `__tests__/cli-write-tool-set-drift.test.js:119-154` (bucket-membership invariant — not duplicated here), `bin/loop.mjs`

## Implementation Steps (TDD)

1. RED: add the byte-accuracy and floor guard tests; verify the byte-accuracy assertion fails when a known CLI tool's handler returns a stale `legacy.schema` (manual one-time check via a fixture override, not a mutation framework — repo has no automated mutation tool per `package.json:30-48`; the bucket-membership invariant is already enforced by `cli-write-tool-set-drift.test.js` so a one-time fixture check is sufficient).
2. GREEN: they pass against the real manifest/banner.
3. Verify the recorded ledger row from Phase 2 exists (`runtime_state_read`). **Explicit abort condition**: if `runtime_state_read` returns 0 `ctx-savings-*` rows, do NOT call `meta_state_resolve`. Re-run Phase 2's record step (after addressing preflight / status / path), then re-enter Phase 3. Resolve will hit `resolution_evidence_required` (`meta-state-resolve-tool.js:91-93`) without a row.
4. Resolve the finding — but FIRST verify no per-finding gate rule blocks it:
   a. Grep `meta-state.jsonl` for active rules with `applies_to_resolution` matching the finding id (`meta-260722T1546Z-*`). The finding has `mechanism_check: false` so `rule-no-orphaned-evidence` does not block, but enumerate per-finding rules to confirm (`gate-logic.js:906-914` Branch 2).
   b. If clear, call `bin/loop.mjs meta_state_resolve` with `resolution` citing the new module path, script path, guard test path, and the recorded row id. `source_refs` per internalization rule (`local:meta-state:` chain — the resolution text names evidence code paths for `evidence_code_ref` grounding where applicable).
5. Log the change: `meta_state_log_change` for the new measurement capability (cite the module + script paths).
6. Full `pnpm test` green.

## Success Criteria

- [ ] Guard tests pass; byte-accuracy fixture check proved the assertion can fail
- [ ] `BANNER_BYTES_BUDGET` is the single source of truth (no inline `4096` in either test file)
- [ ] Finding `meta-260722T1546Z` status=resolved with evidence citation
- [ ] `pnpm test` green end-to-end

## Risk Assessment

- Floor too tight/loose → 50% is half the observed win; deliberate tripwire. If the tool set legitimately grows (more CLI tools → MORE dropped bytes → savings improves), floor moves the safe direction. Banner growth is bounded by `BANNER_BYTES_BUDGET`.
- Resolving prematurely → explicit abort condition in step 3 prevents the case where `runtime_state_read` returns 0 rows and resolve hits `resolution_evidence_required` with no recovery path.
- Gate-rule enumeration in step 4a is per-finding (`gate-logic.js:906-914` Branch 2 matches on subtype + session_id); a future rule added to this finding's id would silently block resolution — the grep step is the audit trail.