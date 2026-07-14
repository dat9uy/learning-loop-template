---
phase: 3
title: "Verify Resolve"
status: completed
priority: P2
dependencies: [1, 2]
---

# Phase 3: Verify Resolve

## Overview

Run the full verification suite, resolve the finding via `meta_state_resolve`, and write the journal entry. Confirm no adhoc parse scripts were introduced.

## Requirements

- Functional: `pnpm test` green (including the new script test and the cold-session parity test); finding resolved; PR body delta enumerated per `rule-pr-body-registry-deltas`.
- Non-functional: conventional commits, no AI references, no plan IDs in commit messages or code.

## Architecture

Verification order: narrow (cold-session parity + new script test) → broad (`pnpm test`). Resolve the finding only after green. The meta-state resolution records the shipped fix as the resolution note.

## Related Code Files

- Verify: `tools/scripts/vitest-failures.sh`, `tools/scripts/__fixtures__/vitest-results-failed.json`, the script test, `loop-introspect.js`, `.factory/hooks/loop-surface-inject.cjs`
- Resolve: `meta-state.jsonl` via `meta_state_resolve` MCP tool (finding `meta-260714T1334Z-the-test-result-parsing-procedure-is-not-surfaced-to-the-age`)

## Implementation Steps

1. `pnpm test:cold-session` — confirm parity.
2. Run the new script test file — confirm exit-code/output contract.
3. `pnpm test` — full suite green.
4. `grep -rnE "python -c|node -e" tools/learning-loop-mastra tools/scripts` — confirm no new adhoc parse of `vitest-results.json` was introduced.
5. `meta_state_resolve({ id: "meta-260714T1334Z-the-test-result-parsing-procedure-is-not-surfaced-to-the-age", resolution: "<shipped fix summary: script path + row #1 rewrite + .factory mirror>" })`.
6. Prepare PR body enumerating the resolved delta per `rule-pr-body-registry-deltas`.
7. `/ck:journal` — concise technical journal entry.

## Success Criteria

- [x] `pnpm test:cold-session` green (11/11)
- [x] `pnpm test` green (1893 passed + 1 skipped, 0 failed across 212 test files)
- [x] no new `python -c`/`node -e` parse of `vitest-results.json` (the only matches are inside the Do-NOT clause itself)
- [x] finding `meta-260714T1334Z…` resolved via `meta_state_resolve`
- [x] PR body enumerates the resolved delta per `rule-pr-body-registry-deltas`
- [x] journal entry written

## Risk Assessment

- **Resolve-then-regress**: resolving before a green run would leave the finding closed while the anti-pattern persists. Mitigation: resolve only after `pnpm test` green (step 5 follows steps 1–4).
- **Re-pollution recurrence**: the chosen lever is steer-not-force; if a future session still hand-parses, that's a new finding (gate-rule escalation path noted in the brainstorm report). Not a blocker for this phase.