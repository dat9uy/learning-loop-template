# Gate Hardening to Always-Block Mode — Removing the Warn-Escape Hatch

**Date**: 2026-05-22
**Severity**: High
**Component**: write-coordination-gate, loop pre-check tooling, agent protocols
**Status**: Resolved

## What Happened

Executed plan `plans/260522-0930-gate-hardening-block-mode` to eliminate the `warn` escape hatch from artifact-aware gate checks. Previously, `GATE_RESPONSE_MODE=warn` allowed agents to silently continue past missing decision records for product-build plans and `product/**` code writes. The gate emitted a JSON warning and exited 0, meaning the tool call proceeded unchecked. We hardened it so artifact-aware violations now always exit 2 (block), regardless of `GATE_RESPONSE_MODE`. We also shipped a standalone pre-check script (`tools/check-loop-ready.js`) so agents and operators can verify loop readiness before attempting gated writes, and updated `CLAUDE.md` and system docs to codify the new behavior.

## The Brutal Truth

The warn mode was a foot-gun masquerading as a safety feature. We shipped artifact-aware gate enforcement yesterday with a configurable severity knob that, in its default state, did absolutely nothing to stop an agent from writing product code without decision records. The gate would cheerfully log a JSON blob and return 0, and the Edit/Write would go through. That is not enforcement — it is theater. The frustrating part is that we spent an entire session building three layers of defense, then left the front door unlocked because "escalate mode might be too noisy during initial adoption." We chose user convenience over correctness, and the only reason it did not blow up is that no agent tried to write product code without records in the meantime. That is luck, not design.

## Technical Details

- `write-coordination-gate.cjs` lines 91–98 and 110–117: artifact-aware blocks now unconditionally `process.exit(2)`. The removed `getResponseMode()` function and `responseMode` variable were dead code after the change.
- Pre-check script: `tools/check-loop-ready.js` — ESM, zero dependencies, checks `records/<surface>/decisions/*.yaml` (surface-first) and `records/decisions/*<surface>*.yaml` (flat fallback). Usage: `node tools/check-loop-ready.js <surface>`.
- `package.json` added `"check:loop-ready": "node tools/check-loop-ready.js"`.
- `CLAUDE.md` updated with always-block rules, Implementation Workflows (Use Case A/B), and an explicit agent rule: never ignore a gate block.
- `docs/system-architecture.md`: write gate flow description updated to reflect unconditional exit 2 for artifact-aware and schema/observation paths.
- Test delta: 4 artifact-aware gate tests, 1 minimal gate test, 1 integration test.
- Final validation: 374 tests pass, `pnpm check` passes. End-to-end simulation confirmed block/allow behavior for both `plans/**/plan.md` (product-build) and `product/**` paths.

## What We Tried

- **Phase 1 — Test-first red/green**: Added tests asserting `exitCode === 2` for artifact-aware plan and product violations before touching gate logic. Tests failed red as expected. Then hardened gate to always exit 2.
- **Phase 2 — Pre-check script + docs**: Built `check-loop-ready.js`, wired it into `package.json`, and updated agent-facing documentation.
- **Phase 3 — Integration validation**: Ran full test suite + `pnpm check` + manual end-to-end simulation of Edit calls hitting the gate. All green.

## Root Cause Analysis

The original artifact-aware implementation defaulted to warn mode because we conflated "adoption friction" with "safety policy." We treated `GATE_RESPONSE_MODE` as a dial for operator preference, when artifact-aware violations are binary: either the decision records exist and the write proceeds, or they do not and it must stop. There is no partial enforcement. The warn mode existed solely to avoid forcing the operator to approve blocked writes during early builds, but that is what observation-backed paths (`records/evidence/**`) and explicit `AskUserQuestion` approvals are for. We added a bypass where none was needed.

## Lessons Learned

1. **Never ship a gate with a silent bypass mode.** If the default behavior lets the tool call proceed, the gate is not a gate. Either block or do not build it yet.
2. **Pre-check scripts are cheaper than post-hoc hardening.** A standalone readiness checker (`check-loop-ready.js`) gives operators and agents a way to validate before the gate fires, reducing the friction that originally justified warn mode.
3. **Agent-facing docs must explicitly forbid circumvention.** Adding the rule "never ignore a gate block" to `CLAUDE.md` closes the social engineering angle where an agent might rationalize proceeding past a blocked tool call.
4. **TDD caught the dead variable.** The code reviewer flagged a dead `responseMode` variable that our tests did not explicitly assert on. Tests passed because the variable was unused, but static cleanup matters for long-term maintenance.

## Next Steps

- **No immediate action required.** Gate is hardened, docs are updated, tests pass.
- **Future enhancement**: Consider adding `check:loop-ready` as a pre-commit hook or CI gate for product-build PRs so the operator does not need to remember to run it manually.
- **Monitor agent behavior**: If agents start hitting the block frequently because they skip the pre-check, add an MCP `check_loop_ready` tool to surface readiness inside the agent loop before the write attempt.
