---
title: gate-verb allowance self-remediation + CLI JSON hint + sentinel source_ref
date: 2026-08-08
summary: "Plan 260808-1222 phases 1-3 via TDD: gate-verb blocks now emit the 2-call incantation; bare-key JSON gets a quoted-keys hint; sentinel source_ref documented and pinned. Commit e7659f8a."
---

# gate-verb allowance self-remediation + CLI JSON hint + sentinel source_ref

## What happened

Executed plan `260808-1222-gate-verb-allowance-self-remediating-block-json-guardrail-sentinel-source-ref` (A+C+D; B deferred). Root cause from session 126e391e: recording one `gate-verb:bash` observation cost 15 bash calls because the block reason named the disease, not the cure.

- **Phase 1 (A):** `buildGateVerbRemediation` helper in `core/evaluate-bash-gate.js`. The `observation_required` gate-verb path (never-recorded + age-expired) now emits the exact 2-call incantation: a `gate_mark_preflight` call for surface `runtime-state` followed by a `runtime_state_record` call with substituted verb, fresh ISO timestamp, sentinel source_ref, and the `id MUST equal affected_system` rule. Docker and package-manager reasons unchanged; `makeGateDecision` stays pure.
- **Phase 2 (C):** `looksLikeBareKeyJson` in `bin/loop.mjs parseJsonArg` — on SyntaxError matching the unquoted-key shape, the exit-2 message appends a hint naming quoted keys as the fix, showing the corrected form. Covers inline + `--args-file`. Valid JSON never reaches the detector.
- **Phase 3 (D):** sentinel `local:meta-state:gate-verb-allowance` named in field-glossary, hint-registry (`source-refs` suggestion), CLAUDE.md; acceptance test pins it in `runtime-tracking.test.js`. Intentionally non-resolving; no schema change.

## Friction / notes

- Irony: the gate blocked my own `node -e` mid-session with the OLD non-remediating message — live demonstration of the finding.
- Full suite first failed on a coverage `.tmp` ENOENT — concurrent vitest (reviewer running tests simultaneously), not a code failure; rerun alone: only failure was `test-tier-e2e-membership` (new CLI-subprocess test file missing from `E2E_FILES` in vitest.config.mjs). Fixed; tier guard + new file green.
- `pnpm test:one` takes explicit file paths; vitest stdout piping is gate-escalated — log-file + `vitest-failures.sh` path works.
- Journal heredoc prose trips gate patterns twice over: a literal s-u-d-o word hits the constraint gate, and writing a `runtime_state_record` call with parens hits the side-effect-import hard block — write tool names without call syntax in heredocs.
- Code review: APPROVE; two informational lows (misleading fixed-form when the bare-key regex matches inside a string value of garbage JSON; stale-timestamp copy risk, documented).

## Verification

- evaluate-bash-gate 46 ✓; gate-verb related suites 12 ✓; CLI suites 36 ✓; runtime-tracking + glossary 23 ✓; hint/metadata 27 ✓; full suite 3117 ✓ (1 skip) after tier fix; `check_runtime_agnostic` 6/6 on both changed core files.

## Next steps

- Ship branch → PR → merge to main.
- **Phase 4 (post-merge):** `meta_state_resolve` the discovery-tax finding `meta-260808T1217Z-...`; `meta_state_report` a new finding for B (missing `loop_get_instruction` key `gate-verb-allowance`, evidence_code_ref `core/hint-registry.js`).
- Registry notes an open finding on pre-push hook duration vs 120s agent timeout — use ≥360s timeout for ship pushes.

AgentWiki publish skipped.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
