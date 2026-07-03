---
phase: 3
title: "Interface reframe (L2 runtime-contract)"
status: pending
effort: "1d"
priority: P1
dependencies: [1]
---

# Phase 3: Interface reframe (L2 runtime-contract)

## Overview
Reframe the runtime interface from a mechanism-only MCP-wrapper contract to a transport-agnostic concept contract. Write `docs/runtime-contract.md` (L2) stating 4 runtime capabilities; demote `interface/contract.js` to "MCP-transport conformance validator (1 of N)"; restructure `interface/CONTRACT.md` so concept capabilities sit above the MCP conformance checklist. Logic unchanged — this is a framing + small-const edit.

## Requirements
- Functional: `docs/runtime-contract.md` states 4 transport-agnostic capabilities + many-to-many transport mapping + names the 3 previously-conflated "interface" things as distinct concerns. `interface/contract.js` header reframed + `transport: "mcp"` slot added to `RUNTIMES` (logic unchanged). `interface/CONTRACT.md` restructured (concept on top, MCP conformance demoted). `interface/RUNTIME_ONBOARDING.md` absorbs `docs/agents/mastra-code.md` (archived in Phase 1) + reframes as MCP-transport onboarding.
- Non-functional: `contract.js` validation logic byte-identical (only header comment + a `transport` field per RUNTIMES entry added). All 3 runtimes still pass the validator.

## Architecture
The 4 transport-agnostic runtime capabilities (the concept contract):
1. **Capability surface** — exposes the loop's deterministic-steps + agentic-steps to its agent.
2. **Gate enforcement** — routes lifecycle events (pre-tool, pre-write, pre-prompt, session-start) into the loop's gate evaluation.
3. **Record routing** — the runtime never writes `records/**`, `meta-state.jsonl`, `runtime-state.jsonl` directly; writes go through the loop.
4. **Identity + discoverability** — the runtime identifies its surface at boot and surfaces loop-discoverability to its operator/agent.

Transport mapping (many-to-many, named abstractly at L2): MCP+hooks transport · library-import transport · shell-hook-only transport. MCP is one transport, not the contract. Runtime IDs (claude-code / droid / mastra-code) are L3 mechanism detail — name transports abstractly in `runtime-contract.md`; defer the runtime IDs to `architecture.md` (L3).

The 3 things previously conflated as "the interface," now named as distinct concerns:
- runtime participation contract = `docs/runtime-contract.md` (L2)
- storage fan-out = `core/surfaces.js` SURFACES (L3)
- feature-code runtime-agnosticism = `core/runtime-agnostic-checklist.js` CHECKLIST (L3)

## Related Code Files
- Create: `docs/runtime-contract.md`
- Edit: `tools/learning-loop-mastra/interface/contract.js` (header comment + `RUNTIMES` entries add `transport: "mcp"`; validation logic untouched)
- Edit: `tools/learning-loop-mastra/interface/CONTRACT.md` (restructure: concept capabilities top, MCP conformance demoted)
- Edit: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` (absorb archived `docs/agents/mastra-code.md`; reframe as MCP-transport onboarding)
- Edit: `tools/learning-loop-mastra/interface/README.md` (framing line → point to `docs/runtime-contract.md` for the concept; this file = MCP-transport conformance + onboarding)
- Read-only reference: `tools/learning-loop-mastra/core/surfaces.js`, `core/runtime-agnostic-checklist.js` (to name them correctly in runtime-contract.md)

## Implementation Steps
1. Write `docs/runtime-contract.md` (L2 tag): 4 capabilities + transport mapping (transports named abstractly — no runtime IDs in the concept section) + the 3-distinct-concerns naming. A short "current transports" subsection may say "the MCP+hooks transport is wired for three runtimes today; see `docs/architecture.md` for their identities + wiring." Runtime IDs live in L3, not L2.
2. Restructure `interface/CONTRACT.md`: move the 4 concept capabilities to the top (mirror runtime-contract.md), then "MCP-transport conformance" = the 10 mechanism checks, demoted to "the MCP transport's conformance checklist."
3. Edit `interface/contract.js`: update the file header comment to "MCP-transport conformance validator (1 of N transports)"; add `transport: "mcp"` to each `RUNTIMES` entry. **Do not touch the validation logic.**
4. Edit `interface/RUNTIME_ONBOARDING.md`: fold in the worked example from the archived `docs/agents/mastra-code.md`; reframe intro as "MCP-transport onboarding (one of N transports)." **Note:** this file cites `AGENTS.md §1.1` and `AGENTS.md §2` (lines ~108-109). Phase 5 strips AGENTS §2 (hook matrix). Repoint the §2 citation to `docs/architecture.md`'s gate-flow section now, and track it in Phase 5's repoint list (the citation is valid when Phase 3 edits it but goes stale when Phase 5 lands).
5. Edit `interface/README.md`: framing line → "the runtime participation contract lives at `docs/runtime-contract.md`; this directory is the MCP-transport conformance validator + onboarding."

## Success Criteria
- [ ] `docs/runtime-contract.md` exists (L2 tag), states 4 capabilities + transport mapping + names the 3 distinct concerns.
- [ ] `interface/contract.js` validation logic unchanged — `node tools/learning-loop-mastra/interface/contract.js claude-code` (and `factory`, `mastra-code`) passes for all 3 runtimes.
- [ ] `interface/contract.js` `RUNTIMES` entries each have `transport: "mcp"`.
- [ ] `interface/CONTRACT.md` leads with the 4 concept capabilities; the 10 mechanism checks are under a "MCP-transport conformance" subsection.
- [ ] `pnpm test` passes (the contract test asserts the 10 checks still run; the `transport` field is additive).

## Risk Assessment
- **Risk:** editing `contract.js` breaks the validator. **Mitigation:** only header comment + additive `transport` field; no logic change. The contract test (`interface/__tests__/contract.test.js`) is the gate; if it fails, revert the const edit.
- **Risk:** `runtime-contract.md` drifts into MCP specifics. **Mitigation:** concept section is transport-agnostic; only the "current transports" subsection names MCP runtimes. Keep L2 ≤ L2 (references L1 `loop-engine.md` for the engine; does not descend into L3 mechanism detail).