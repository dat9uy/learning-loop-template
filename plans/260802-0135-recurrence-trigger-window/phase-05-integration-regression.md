---
phase: 5
title: "Stateless scan + integration regression"
status: pending
priority: P2
effort: "1-2h"
dependencies: [4]
---

# Phase 5: Stateless scan + integration regression

## Overview

Cross-phase integration regression and guardrails. Prove the full SessionStart flow
behaves end-to-end across multiple sessions and surfaces, that no secret leaks, that the
trigger stays stateless and in the silent-write channel, and that the runtime-agnostic
audit still passes. Then run the broadened suite + lint + fallow gate.

## Requirements

- Functional:
  - A multi-session, multi-surface decision log produces the correct set of findings
    (per-session grouping, cross-session dedup, grace suppression, reopens link).
  - A secret-bearing command produces no raw secret in the committed registry.
  - The SessionStart hook emits no `hookSpecificOutput.additionalContext`.
- Non-functional:
  - Stateless: no watermark file written; the hook scans + dedups only.
  - No new tracked files; no `additionalContext` promotion (report rec 6).
  - `pnpm test`, lint, and `check_runtime_agnostic` pass.

## Architecture

One integration test drives the real `recurrence-check-on-start.js` hook via
`spawnSync` against a temp `GATE_ROOT` with a hand-built multi-surface decision log,
then asserts the resulting `meta-state.jsonl`. This reuses the existing
`decisionLogPath(surface)` / `writeEntries` harness in `gate-recurrence.test.js`.

```
temp root
  .claude/coordination/.gate-decision.log   # session A: 3× prefix P (secret-bearing)
  .factory/coordination/.gate-decision.log  # session B: 3× prefix P (same prefix)
  → spawnSync(recurrence-check-on-start.js, { env: { GATE_ROOT: root } })
  → read meta-state.jsonl
  → assert: 1 finding (cross-session dedup), no raw secret, reopens set,
            no additionalContext on stdout (hook writes stderr only)
```

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js`
  - Add the integration test (see steps).
- Read-only verify: `tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js`
  (confirm it still does `writeEntry` + `console.error` + `process.exit(0)`, no
  `additionalContext`).

## Implementation Steps (TDD — tests first)

1. **Test first.** Add an integration test:
   - Build a two-surface decision log: session A has 3 entries of a secret-bearing
     prefix (`curl 'https://api?token=eyJSECRET'`); session B has 3 entries of the same
     prefix (different `session_id`).
   - Seed a resolved finding for the same `recurrence_key` with `resolved_at` 1 day ago
     (within grace) → assert it suppresses (or, to exercise re-file, use 20 days ago).
   - Seed finding B's record in the temp registry so the reopens existence guard (C2)
     passes for the mapped `rule_id`.
   - `spawnSync` the real SessionStart hook with `GATE_ROOT` = temp root and `GATE_RECURSION_DRY_RUN=0`.
   - Assert: `meta-state.jsonl` contains **exactly one** finding for the prefix (C1
     in-call dedup across the two sessions, not two); **grep the file for `SECRET` /
     `eyJ` / `token=` and assert zero matches**; assert the finding has `reopens` pointing
     at B's real id; assert the hook's **stdout** contains no `additionalContext` (only
     a stderr `recurrence-check:` line + the reopens pointer via `process.stderr.write`).
2. **Run — expect green** (P1–P4 already implemented the behavior; this test pins it).
   If red, fix the underlying phase, not the test.
3. **Stateless guard:** assert no watermark/marker file is created by the hook beyond
   the existing `.gate-decision.log` appends and the `meta-state.jsonl` write.
4. **Broaden:** run the recurrence suite, the meta-state suite, then `pnpm test`.
5. **Lint + fallow:** run `pnpm lint` and `pnpm fallow:gate` (use `pnpm fallow:brief`
   on non-zero; grep `severity=` for actionable findings; ignore baseline-inherited
   lines). Fix any dead-code finding from the removed `RECURRENCE_WINDOW_MS`.
6. **Runtime-agnostic audit:** run `check_runtime_agnostic` against the changed
   `core/recurrence-tracker.js` and `core/surfaces.js` (shim-not-fork + cross-surface-
   iteration; the `getSessionId` import, `appendToAllSurfaces` log writes, and the
   `session_id`-extended cross-surface dedup key (M2) are surface-scoped — verify no
   regression).

## Success Criteria

- [ ] Integration test green: correct findings across 2 sessions/surfaces.
- [ ] Grep of emitted `meta-state.jsonl` for the secret literal → zero matches.
- [ ] Hook stdout has no `additionalContext`; only a stderr `recurrence-check:` line.
- [ ] No watermark file written (stateless).
- [ ] `pnpm test`, `pnpm lint`, `pnpm fallow:gate`, and `check_runtime_agnostic` pass.

## Risk Assessment

- **Risk:** The integration test spawns the real hook, which reads `.git/HEAD` via
  `getSessionId` only on the fallback path; with a payload `session_id` in the log
  entries (seeded directly), the fallback is not exercised here.
  **Mitigation:** the fallback is unit-covered in P1 (Droid/no-payload case). The
  integration test seeds `session_id` directly to assert grouping, not fallback.
- **Risk:** Removing `RECURRENCE_WINDOW_MS` may trip a fallow dead-code or unused-export
  finding if a caller still references it.
  **Mitigation:** step 5 runs the fallow gate; fix the caller or the export guard
  (`fallow-ignore-next-line unused-export` if retained for a reason) before shipping.
- **Risk:** Docs may describe the old 10-min window.
  **Mitigation:** check `docs/architecture.md` (§ Inbound State Gate) and
  `docs/loop-engine.md` for recurrence-window language; update only if the trigger
  behavior is documented there (per documentation-management.md — user-visible behavior
  is the silent registry write, so a docs change is likely not required; verify, do not
  churn).