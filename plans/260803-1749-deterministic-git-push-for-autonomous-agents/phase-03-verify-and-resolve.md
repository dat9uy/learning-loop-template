---
phase: 3
title: "Verification, audit, and finding resolution"
status: completed
priority: P2
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Verification, audit, and finding resolution

## Overview

Broaden verification to every shared surface touched by Phases 1–2, run the runtime-agnostic audit, document the script in its owning docs surface, prove the end-to-end push, and resolve the source meta-state finding with honestly-scoped claims (auth fixed; pre-push flake incentive explicitly out of scope).

## Requirements

- Functional:
  - Focused suite pass:
    - `pnpm vitest run tools/scripts/__tests__/setup-git-push.test.js`
    - `pnpm vitest run tools/learning-loop-mastra/__tests__/session-start-git-push-preflight.test.js`
    - `pnpm vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`
    - `pnpm vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/hooks-wiring-parity.test.js`
  - `check_runtime_agnostic` via CLI against the new/changed files; fix or explicitly justify failures.
  - Pre-push gate green (`pnpm test && pnpm fallow:gate`) before pushing — the legitimate path this plan restores.
  - Docs: add a sibling paragraph for `setup-git-push.sh` in the per-clone setup block at `AGENTS.md:138` (the owning surface where `setup-git-merge-drivers.sh` is documented; there is no `tools/scripts/README.md`).
  - End-to-end proof AFTER merge: a normal push from an autonomous shell succeeds WITHOUT `--no-verify` and without `core.hooksPath` overrides.
  - Resolve finding `meta-260803T1720Z-agent-runtime-git-push-is-fragile-an-autonomous-shell-cannot` via `meta_state_resolve` (CLI), AFTER `meta_state_derive_status`, with resolution text scoped to the auth fix and citing `tools/scripts/setup-git-push.sh` + the preflight hook.
  - Recommend (operator decision) a promoted gate rule detecting the audit-trail bypass itself — `core.hooksPath=/dev/null`, `--no-verify` — via `meta_state_promote_rule`, so the bypass becomes observable even when incentivized (the pre-push flake trigger is NOT fixed by this plan).
- Non-functional:
  - Conventional commits; no plan IDs/finding codes in commit messages or code comments.
  - Resolution text must not claim the bypass incentive is eliminated — only the auth fragility is.

## Related Code Files

- Modify: `AGENTS.md` (per-clone setup block, ~line 138)
- Verify: `tools/scripts/setup-git-push.sh`, `tools/learning-loop-mastra/hooks/universal/session-start-git-push-preflight.cjs`, `.claude/settings.json`, `.factory/hooks/loop-surface-inject.cjs`, `hooks-lock.json`

## Implementation Steps

1. Run the focused suites above; fix regressions, never weaken tests.
2. Run `check_runtime_agnostic`; address findings.
3. Add the `setup-git-push.sh` paragraph to the AGENTS.md setup block.
4. Push via the restored legitimate path (pre-push gate runs; no bypass flags).
5. Post-merge: verify an autonomous-shell push succeeds with no overrides.
6. `meta_state_derive_status`, then `meta_state_resolve` with scoped resolution + code evidence refs.
7. Propose the bypass-detection gate rule via `meta_state_promote_rule` for operator decision.
8. If `.factory` adapter wiring or `.mastracode` coverage was deferred in Phase 2, open a follow-up finding via `meta_state_report`.

## Success Criteria

- [ ] All four focused suites + pre-push gate green
- [ ] `check_runtime_agnostic` clean (or documented justification)
- [ ] AGENTS.md setup block documents the new script
- [ ] Autonomous-shell push succeeds without bypass flags (post-merge proof)
- [ ] Finding resolved with honestly-scoped claims + code refs; bypass-detection rule proposed

## Risk Assessment

- Risk: transient vitest flake in pre-push resurfaces → rerun per pnpm-test-discipline; do NOT reintroduce the hooksPath bypass under flake pressure. This flake incentive is a known residual — the promoted detection rule (step 7) is the mitigation, not a fix. Escalate to the operator if the gate is genuinely red.
- Risk: resolving the finding before the push proof → step order enforces resolution after proof.
- Risk: resolution text overclaiming → success criteria constrain the wording.
