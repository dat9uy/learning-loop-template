---
phase: 3
title: "phase-03-contract-amendments"
status: pending
effort: ""
---

# Phase 3: Contract Amendments + AGENTS.md Cleanup

## Overview

Codify Mastra Code's declarative hook model into the runtime-interface contract so future runtime authors can adopt either the shim-file pattern (Claude Code, Droid) OR the declarative JSON pattern (Mastra Code). **Red-team fix F3:** avoid contract polymorphism on existing Reqs #1 + #5 — instead, add new additive Req #6 (`hook-declarative-config`) that runtimes with declarative hooks ALSO must satisfy. Cleaner, no "OR" ambiguity.

Also:
- Fixes the current `RUNTIMES["mastra-code"]` path bug (`.mastracode/config.json` → `.mastracode/mcp.json`).
- Adds `shellPassthrough: false` rejection (red-team Security F6).
- Adds negative tests for validator failsafe-default bugs (red-team Security F4).
- Co-commits Phase 2 config + Phase 3 contract in same PR (red-team Failure H1).

## Requirements

- **Functional:** `interface/contract.js mastra-code` returns `{ok: true, missing: [], notes: []}` after Phase 2 config files exist + Phase 3 amendments ship
- **Non-functional:** NO regression in `claude-code` or `droid` validation; both must still pass
- **Testability:** TDD — add regression tests for the new code paths BEFORE implementation; existing 310-LoC test file covers current paths

## Architecture

**Current contract (5 reqs):**

| Req | Current | Mastra Code need |
|-----|---------|------------------|
| #1 `hook-shim-set` | 4 shim files in `<surface>/coordination/hooks/` | Declarative `<surface>/hooks.json` (4 entries) |
| #2 `mcp-client-config` | MCP config with `learning-loop` entry | Same shape, different file path |
| #3 `skill-spec` | `<surface>/skills/learning-loop/SKILL.md` | Reuse `.claude/skills/learning-loop/SKILL.md` (auto-discovered) |
| #4 `identity-marker` | `RUNTIME_ID` env var (advisory) | Accept `MASTRA_RESOURCE_ID` OR `HarnessConfig.resourceId` OR `.mastracode/database.json` `resourceId` |
| #5 `settings-integration` | All 4 shim basenames in settings `hooks` arrays | All 4 universal-hook commands in `.mastracode/hooks.json` |

**Amendment strategy (red-team F3: additive, not polymorphic):** add NEW Req #6 (`hook-declarative-config`) for runtimes with declarative hook configs (Mastra Code + future). Req #1 stays monomorphic (shim files only). Req #5 gets a clarifying note pointing to Req #6 for declarative runtimes. Req #4 stays monomorphic on `RUNTIME_ID` but the validator ALSO accepts `MASTRA_RESOURCE_ID` as additive alternative (documented as spoofable until LIM-3 ships). Req #2 path correction (`.mastracode/config.json` → `.mastracode/mcp.json`). NEW Req #7 (`settings-no-bypass`) rejects `shellPassthrough: true`.

## Related Code Files

- Modify: `tools/learning-loop-mastra/interface/CONTRACT.md` (Req #1, #4, #5 wording)
- Modify: `tools/learning-loop-mastra/interface/contract.js` (`RUNTIMES["mastra-code"]` paths + 3 new check logic branches)
- Modify: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` (rewrite the "Worked example: Mastra Code" section)
- Modify: `tools/learning-loop-mastra/interface/__tests__/contract.test.js` (add 12 regression tests for Mastra Code: 8 positive + 4 negative for red-team failsafe defaults)
- Modify: `AGENTS.md` §11 (R2 ownership language; replace stale `.mastracode/coordination/hooks/` reference)

## Implementation Steps

1. **TDD first.** Add 12 regression tests to `interface/__tests__/contract.test.js` (8 positive + 4 negative for red-team failsafe defaults):

   **Positive (8):**
   - `mastracode-hooks-json-present-and-valid` (Req #6 declarative config)
   - `mastracode-mcp-config-points-at-server-js` (Req #2 corrected path)
   - `mastracode-skill-spec-reuses-claude-skills-discovery` (Req #3 — note in test that this passes WITHOUT a `.mastracode/skills/learning-loop/SKILL.md` because discovery covers it)
   - `mastracode-identity-marker-accepts-mastra-resource-id` (Req #4 alternative)
   - `mastracode-settings-integration-references-universal-hook-commands` (Req #5 alternative)
   - `mastracode-hook-declarative-config-valid` (Req #6 happy path)
   - `regression-claude-code-still-passes` (no break)
   - `regression-droid-still-passes` (no break)

   **Negative (4 — red-team Security F4 failsafe defaults):**
   - `mastracode-rejects-malformed-hooks-json` — invalid JSON in `.mastracode/hooks.json` → validator fails (not silently passes)
   - `mastracode-rejects-empty-event-entries` — `.mastracode/hooks.json` missing one of 4 required event types → validator fails
   - `mastracode-rejects-shellPassthrough-true` (Req #7) — `.mastracode/settings.json` with `shellPassthrough: true` → validator fails
   - `mastracode-rejects-missing-command-paths` — `.mastracode/hooks.json` with command paths that don't exist → validator fails (not silently passes)

2. **Run tests** to confirm 12 new tests FAIL (current contract doesn't support Mastra Code + has failsafe-default bugs). This is the red bar before implementation.

3. **Amend `interface/CONTRACT.md`** with additive (NOT polymorphic) changes (red-team fix F3):
   - Req #2: clarify that Mastra Code's path is `.mastracode/mcp.json` (not `.mastracode/config.json`)
   - Req #4: accept `MASTRA_RESOURCE_ID` env var AS ADDITIVE alternative to `RUNTIME_ID` (both checked; first match wins). Document that `MASTRA_RESOURCE_ID` is spoofable until LIM-3 caller-identity ships in Plan 5.
   - Req #5: ADD note: "For runtimes with declarative hook configs (e.g., Mastra Code), this requirement applies to the declarative config's `command` field, not to shim files. See Req #6."
   - **NEW Req #6 (`hook-declarative-config`):** For runtimes using declarative hook configs (Mastra Code, future), the runtime MUST provide `<surface>/hooks.json` (or equivalent) containing `PreToolUse` (bash-gate command), `PreToolUse` (write-gate command with `matcher.tool_name` for built-in write/edit tool), `UserPromptSubmit` (inbound-gate command), and `SessionStart` (recurrence-check command) entries. Each `command` MUST point at a universal hook script in `tools/learning-loop-mastra/hooks/legacy/`.
   - **NEW Req #7 (`settings-no-bypass`):** The runtime's settings file (e.g., `.mastracode/settings.json`) MUST NOT enable `shellPassthrough: true` (a documented bypass for our gates). Contract validator MUST reject this configuration.

4. **Update `interface/contract.js`:**
   - Fix `RUNTIMES["mastra-code"].mcp_config` from `.mastracode/config.json` → `.mastracode/mcp.json`
   - Fix `RUNTIMES["mastra-code"].settings` from `config.json` → `.mastracode/hooks.json` (for Req #6 declarative path check)
   - Add new check `checkHookDeclarativeConfig` (Req #6): if `.mastracode/hooks.json` exists, assert it parses + has 4 required event entries with `command` paths pointing at universal hooks
   - Modify `checkIdentityMarker` to accept `process.env.MASTRA_RESOURCE_ID` OR `process.env.RUNTIME_ID` matching the runtime id (additive, not replacement)
   - Modify `checkSettingsIntegration` to handle declarative config: parse `.mastracode/hooks.json` and assert all 4 universal-hook commands present
   - Add new check `checkSettingsNoBypass` (Req #7): reject `.mastracode/settings.json` with `shellPassthrough: true`
   - `checkSkillSpec` for Mastra Code: discover `.claude/skills/learning-loop/SKILL.md` OR `.mastracode/skills/learning-loop/SKILL.md` (Mastra Code's discovery path includes `.claude/skills/` per mastracode-prep §3)
   - Co-commit Phase 2 config + Phase 3 contract amendments in same PR (red-team Failure H1)

5. **Run tests.** All 12 new tests (8 positive + 4 negative) pass; 0 existing tests break.

6. **Update `interface/RUNTIME_ONBOARDING.md` "Worked example: Mastra Code" section.** Replace the 7-step section with the corrected config-driven version. Add a note: "Mastra Code's integration is MCP-only in Plan 4. Programmatic integration (`createMastraCode({ tools })`) is a separate, follow-up plan."

7. **Update `AGENTS.md` §11 R2 ownership language.** Replace stale `.mastracode/coordination/hooks/` reference with `.mastracode/hooks.json` (declarative) for Mastra Code + `.claude/coordination/hooks/` + `.factory/coordination/hooks/` for Claude Code / Droid. (Note: this was already touched in Plan 3; verify the language is now correct.)

## Success Criteria

- [ ] All 12 new contract tests pass (8 positive + 4 negative)
- [ ] All existing contract tests still pass (no regression)
- [ ] `node interface/contract.js claude-code` → `{ok: true, missing: [], notes: [...]}`
- [ ] `node interface/contract.js droid` → `{ok: true, missing: [], notes: [...]}`
- [ ] `node interface/contract.js mastra-code` → `{ok: true, missing: [], notes: []}` (after Phase 2 config files exist)
- [ ] AGENTS.md §11 no longer mentions `.mastracode/coordination/hooks/` (replaced with `.mastracode/hooks.json`)
- [ ] RUNTIME_ONBOARDING.md Mastra Code section rewritten with declarative config steps
- [ ] 1 atomic commit for all contract amendments + test additions

## Risk Assessment

- **R4 (regression in existing runtimes):** HIGH. Mitigation: TDD-first (write tests, confirm they fail, then implement); run full test suite after amendment.
- **Contract wording ambiguity:** if Req #6 (`hook-declarative-config`) is too vague, future runtime authors may adopt inconsistent declarative patterns. Mitigation: explicit per-event-type clause listing the 4 required hook events + which universal hook command each must invoke (PreToolUse × 2 + UserPromptSubmit + SessionStart).
- **AGENTS.md §11 cleanup could be missed:** doc edits are easy to skip. Mitigation: include in same atomic commit as contract amendments; reviewer checks for the §11 diff.

## Cross-references

- **Research:** mastracode-prep §3-6 (hooks + skills + identity + settings)
- **Harness research:** harness-class §5 (`resourceId`), §7 (MCP tool namespacing)
- **Current contract:** `tools/learning-loop-mastra/interface/CONTRACT.md` + `contract.js`
- **R2 ownership:** `AGENTS.md` §11 (R2 ownership, process norm; gate in Plan 5)