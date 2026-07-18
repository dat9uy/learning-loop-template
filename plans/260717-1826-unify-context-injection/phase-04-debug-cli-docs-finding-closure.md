---
phase: 4
title: "Debug CLI + architecture docs + finding closure"
status: completed
priority: P2
effort: "0.5d"
dependencies: [2, 3]
---

# Phase 4: Debug CLI + architecture docs + finding closure

## Overview

Make the unified pipeline inspectable without starting a session (debug CLI), document the surface division of labor (finding item d), and close the triggering finding with the required loop artifacts (change-log + resolution). Ends with an optional dogfood rule codifying "new injection surfaces go through the renderer."

## Requirements

- Functional:
  - `tools/scripts/hint-render.mjs` (kebab-case, ESM, matches `tools/scripts/` convention): `node tools/scripts/hint-render.mjs --channel <claude-session-start|factory-session-start|mcp-warm|sidecar> [--partition N] [--provenance]`. Prints the byte-exact render the runtime would inject, plus per-hint provenance (`slug`, `kind`, `source: core | rule:<id>`) when `--provenance` is set. Exit 0; unknown channel → exit 2 with the channel list. No MCP spawn, no registry writes — read-only.
  - `docs/architecture.md`: new section **"Context-Injection Division of Labor"** documenting the four surfaces and their roles (operator-confirmed location):
    - **push (SessionStart hooks)** — fixed cold-start context: the static hint sets, budget-partitioned, rendered by `core/hint-renderer.js`. Bounded and cache-stable.
    - **pull-warm (`loop_describe`)** — current dynamic state: rules/findings/loop-designs/registry summary. Its hint block is the same render as push (convenience, not authority); the value-add of a warm call mid-session is the dynamic fields.
    - **pull-single (`loop_get_instruction`)** — re-fetch one hint by slug that scrolled out of context.
    - **static (AGENTS.md / CLAUDE.md / learning-loop skill)** — steering layer + prompt-author docs; never a hint-content source.
    - **.mastracode** — pull-only by decision (Validation 1, 2026-07-17); no SessionStart hint injection. Documented so future operators don't read the absence as a bug.
    - Plus the state-2 rationale (deterministic injection, agentic consumption — `docs/philosophy.md` § escape-hatch trajectory) and the trust boundary (hooks read core directly; no server-rendered strings cross a trust boundary).
  - Closure artifacts:
    - `meta_state_log_change` with `change_target: 'tools/learning-loop-mastra/core/hint-registry.js'` (and the renderer) covering the mechanism change.
    - `meta_state_resolve({ id: "meta-260715T2300Z-runtime-context-injection-is-fragmented-across-overlapping-s", resolution: "<summary pointing at the change-log id + this plan>" })`.
  - Optional (operator decision at ship time): promote a dogfood rule `rule-context-injection-via-renderer` (agent-checklist, with `hint_text`) — "new context-injection surfaces must render through core/hint-renderer.js; no hand-assembled hint text in hooks." Exercises the Phase-3 promotion path end-to-end on the mechanism that built it.
- Non-functional:
  - CLI runs in <1s (no spawn, no network).
  - Docs stay within `docs.maxLoc: 800` budget for `architecture.md` — check current length before adding; keep the new section tight (~40 lines).

## Related Code Files

- Create: `tools/scripts/hint-render.mjs`
- Modify: `docs/architecture.md` (new section)
- Modify: `meta-state.jsonl` (change-log entry + finding resolution via MCP tools)
- Create: `tools/learning-loop-mastra/__tests__/hint-render-cli.test.cjs`

## Implementation Steps (TDD)

1. **Test first** (`hint-render-cli.test.cjs`): spawn the CLI per channel, assert exit 0 and output deep-equals the renderer's in-process output for that channel; `--provenance` lists every hint's slug+source; unknown channel exits 2. Red.
2. Implement `hint-render.mjs` (thin wrapper over `core/hint-renderer.js`).
3. Read `docs/architecture.md` (existing doc — read before editing per doc rules), add the division-of-labor section in the appropriate place (near the gate-system / hook sections); verify line budget and cross-links (`docs/philosophy.md`, `AGENTS.md`).
4. Log the change-log entry; resolve the finding; run `meta_state_derive_status` first to confirm the finding's claims are now false (LOCAL mirror gone, H6 gone, division documented).
5. Present the optional dogfood rule to the operator; promote only on approval (LOOP_SESSION_MODE=live).
6. `pnpm test:one tools/learning-loop-mastra/__tests__/hint-render-cli.test.cjs` → green; `pnpm test:iter` → green.
7. PR body enumerates all registry deltas across Phases 3-4 per `rule-pr-body-registry-deltas` (patched rules, change-log, resolved finding, optional promoted rule).

## Success Criteria

- [ ] `node tools/scripts/hint-render.mjs --channel claude-session-start --provenance` prints both partitions with per-hint source tags in <1s
- [ ] `docs/architecture.md` section exists and matches the implemented behavior (verified by re-reading after edit)
- [ ] `meta-260715T2300Z` status = resolved with resolution note citing the change-log id
- [ ] `pnpm test:iter` green

## Risk Assessment

- **Risk:** docs/code drift — the architecture section describes behavior that later changes. **Mitigation:** section cites the renderer path and points at `hint-render.mjs` as the inspection tool, not at prose copies of hint content (no new duplication).
- **Risk:** resolving the finding before all four phases merge. **Mitigation:** step 4 runs only after Phases 1-3 are merged; `meta_state_derive_status` + a grep for the deleted artifacts are the objective preconditions.
- **Risk:** the dogfood rule fires as a nag without teeth. **Mitigation:** it's agent-checklist (advisory by design) and carries `hint_text` from birth — the exact contract Phase 3 built; if it proves noisy it can be refined like any rule.
