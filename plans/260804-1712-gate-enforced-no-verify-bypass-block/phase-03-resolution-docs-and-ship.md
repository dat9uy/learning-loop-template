---
phase: 3
title: "Resolution, Docs, and Ship"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Resolution, Docs, and Ship

## Overview

Close the loop: resolve both findings with source_refs, run the runtime-agnostic audit, update the docs surface that owns gate behavior, and ship via conventional PR flow.

## Requirements

- Functional: `meta-260804T1600Z` (escalate) and `meta-260803T1836Z` resolved with resolutions citing `rule-no-verify-bypass-denied`, `rule-flake-claim-verification`, and change-log `meta-260804T1703Z-gate-logic-no-verify-hookspath-bypass-enforcement` as `local:meta-state:<id>` source_refs.
- Functional: `docs/architecture.md` gate-system section names the bypass-denial behavior (user-visible gate behavior changed).
- Non-functional: `check_runtime_agnostic` audit run and clean (expected: no hook/core code touched, so N/A-clean); full suite green.

## Architecture

Per the internalization rule: call `meta_state_derive_status` before resolving; resolutions use `local:meta-state:<id>` refs and set `evidence_code_ref` to the test file (`tools/learning-loop-mastra/__tests__/legacy-mcp/bash-gate-no-verify.test.js`) so grounding is re-checkable. Docs update is minimal — one owning surface, linked to the registry rather than duplicating rule detail.

## Related Code Files

- Modify: `meta-state.jsonl` (via `loop.mjs meta_state_resolve` only)
- Modify: `docs/architecture.md` (gate system section — confirm exact subsection at implementation)
- Reference: `AGENTS.md` §2 (citation flow), session hint `derive-refresh`

## Implementation Steps

1. Work on a feature branch (e.g. `feat/gate-no-verify-bypass-block`) — created at Phase 1 start; this phase ends in PR.
2. `loop.mjs meta_state_derive_status` on both finding ids; confirm open.
3. Resolve `meta-260804T1600Z-an-agent-runtime-committed-the-cross-session-slow-burn-recur`: resolution describes the shipped gate + checklist rules; source_refs = both rule ids + change-log id; `evidence_code_ref` = new test file.
4. Resolve `meta-260803T1836Z-the-pre-push-gate-can-be-silently-bypassed-when-an-autonomou`: resolution notes the proposed bypass-detection rule shipped as `rule-no-verify-bypass-denied` (its predicted vector recurred and is now denied); same source_refs.
5. Update `docs/architecture.md` gate section: bash-gate denies hook-bypass forms (`--no-verify`, `core.hooksPath`) via promoted rule; override via `gate_override`; cite the rule id, not plan ids.
6. Run `check_runtime_agnostic` against the changed surface (expect clean — registry-data-only).
7. `pnpm test:unit` full green; `git status` clean of stray artifacts (file-index regen is gitignored).
8. **File the promotion-locking defect:** `loop.mjs meta_state_report` the non-transactional 3-write / unlocked citation append in `meta-state-promote-rule-tool.js:369-411` (pre-existing core defect found in review; `registry-append-atomic.js:48-50` requires `withRegistryLock`) as a `gate-logic-bug` so it enters the loop pipeline — do NOT fix it in this plan.
9. Commit, push, PR. **Ship-commit format (self-deny guard):** the new gate rule is ACTIVE; use `git commit -m` flags only (never `-F`/heredoc — those bodies are not stripped) and do NOT put the literal tokens `--no-verify` or `core.hooksPath=` in the commit message; describe the invariant ("deny hook-bypass commit flags") instead. The commit-msg hook's plan-ID check now points at `gate_override` — but a gate_override here should never be needed if the message is clean. Push via deterministic HTTPS flow, open PR; confirm required checks green (`gh pr view <n> --json mergeStateStatus` → CLEAN).

## Todo

- [x] Both findings resolved with correct citations
- [x] docs/architecture.md updated
- [x] check_runtime_agnostic clean
- [x] Suite green, PR open with green checks

## Success Criteria

- [x] Registry shows both findings resolved, resolutions cite shipped rules + change-log
- [x] Docs describe the new gate behavior without plan-ID references
- [x] PR merged-ready with mergeStateStatus CLEAN

## Risk Assessment

- Resolving `meta-260803T1836Z` prematurely if scope is judged wider (it also mentions incentive removal) → resolution text scopes explicitly: the bypass is now *denied and observable*; residual flake-pressure incentive is tracked by the Phase 2 steering rule. If reviewer disagrees, keep it open with a note instead.
- Docs drift: keep to one subsection; link to registry ids as the authority.
