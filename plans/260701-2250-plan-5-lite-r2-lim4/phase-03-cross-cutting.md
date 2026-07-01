---
phase: 3
title: "Cross-Cutting (contracts, docs, shim wiring, audit-log hardening)"
status: pending
priority: P1
dependencies: [phase-01-r2-write-gate, phase-02-lim-4-path-containment]
plan: "260701-2250-plan-5-lite-r2-lim4"
addresses:
  - red-team R6 (HIGH: audit-log JSONL injection)
  - red-team R11 (MEDIUM: error message canonicalization)
  - red-team R13 (MEDIUM: pre-commit hook bypass)
  - red-team R17 (LOW: override audit gap — extends R6)
  - scout finding: LOOP_SURFACE env has zero active injectors
  - scout finding: loop-surface-inject.cjs dead code (LL_DISABLE_LOOP_SURFACE_INJECTION)
  - stub C1-C6: contracts + docs + sweep
---

# Phase 3: Cross-Cutting (contracts, docs, shim wiring, audit-log hardening)

## Overview

Wire the three runtime identity shims (Claude / Droid / Mastra Code) so `LOOP_SURFACE` is actually injected at process boot. Extend the contract validator to require `.mastracode/` config presence and shim wiring. Harden the audit-log against JSONL injection (R6). Add the operator runbook for diagnosing `cross_runtime_write_denied`. Update tests + docs.

This phase corrects **three factual errors** from the original plan stub surfaced by the scout:
1. The stub claims `LOOP_SURFACE` is "set by harness `.cjs` shim" — verified by scout: both `recurrence-check-on-start.cjs` files are empty wrappers. The shims MUST be wired in this phase.
2. The stub says "all 41 tools + 10 workflows flow through `createLoopTool`" — verified by scout: workflows go through `convertWorkflowsToTools` which uses raw `createTool`. Phase 1 R4 swaps the wrap; this phase updates the docs to reflect the corrected scope.
3. The stub's Open Question #3 says "LIM-4 protects `evidence_test` paths but `verification-runner.js` is still attackable via `--` arg smuggling" — Phase 2 expands the audit to include `verification-runner.js:34` (`step.cwd`), closing the cwd-escape vector. The `--` arg smuggling is documented as D2 (deferred).

## Requirements

### Functional

#### Contracts (C1, C2)

- **C1.** Extend `tools/learning-loop-mastra/interface/contract.js` to recognize `.mastracode` as a third surface (currently hard-codes 2 — verified by scout: `RUNTIMES` table at line 19-39 already has `mastra-code`). Add:
  - **Req #9 (`.mastracode-config-presence`)**: for `mastra-code` runtime, assert `.mastracode/` directory exists with `mcp.json`, `hooks.json`, `settings.json`, `database.json`. For other runtimes: `applicable: false`.
  - **Req #10 (`mastracode-session-start-pins-loop-surface`)**: for `mastra-code` runtime, read `.mastracode/hooks.json`'s `SessionStart` block and assert the referenced command's file (a `.cjs` shim) contains the literal `process.env.LOOP_SURFACE = '.mastracode'`. For other runtimes: `applicable: false`.
  - **Req #11 (`tools-manifest-has-path-fields`)**: every entry in `tools/manifest.json` MUST have `pathFields: string[]` (may be empty `[]`). Boot-time invariant; enforced by `mastra/server.js#validateToolManifest` (Phase 1 R3); surfaced here as a contract requirement.
- **C2.** Update `tools/learning-loop-mastra/__tests__/contract.test.js` (or `interface/__tests__/contract.test.js` per scout — verify path) for Req #9 + #10 + #11. Each new requirement gets 1-3 `test()` blocks (one per applicable runtime) and an `applicable: false` assertion for the others.

#### SURFACES registry (C3)

- **C3.** Update tests that hard-code `[".claude", ".factory"]` arrays to import `SURFACES` from `core/surfaces.js`:
  - `__tests__/legacy-mcp/surfaces.test.js` (7+ assertions at lines 28, 41-44, 49-52, 102-107, 116, 131-132, 139-143, 158-167)
  - `__tests__/legacy-mcp/runtime-agnostic.test.js:49`
  - `__tests__/legacy-mcp/gate-override.test.js:43, 66`
  - `__tests__/legacy-mcp/gate-decision-log.test.js:36`
  - `__tests__/legacy-mcp/check-runtime-agnostic-tool.test.js:43`
- **C3a.** Extend `SURFACES = [".claude", ".factory", ".mastracode"]` in `core/surfaces.js:16`.

#### Docs (C4)

- **C4.** Create `docs/security/plan-5-hardening.md` (the file does NOT exist per scout; verified). Sections:
  - **Overview:** path containment → R2 ownership → tool execute (the gating chain)
  - **Identity pinning:** `pinRuntimeIdAtBoot()` at server.js top; `getPinnedRuntimeId()` per call; canonical error messages
  - **Identity shim wiring:** how the three harness shims inject `LOOP_SURFACE` at process boot (link to the new shim files)
  - **R2 allowlist schema v1:** with worked example + per-surface table
  - **Audit log entry shape** on denial (R6 hardened): `{ error, runtime, tool, path, hint, denied_at, normalized_path }` with JSON-escape invariant
  - **Operator runbook:** how to diagnose `cross_runtime_write_denied`, how to file an override, how to use `update_r2_allowlist`
  - **Out-of-scope (residual threats):**
    - Read-then-write composition via tool stdout
    - Subprocess-spawn re-pin detection (deferred to a future plan)
    - Workflow + agent tool coverage (closed by Phase 1 R4; documented for traceability)
    - Tool stdout credential-leak guard (deferred)
    - Windows UNC / device paths (deferred)
    - Tool-stdout leak (deferred)
    - Identity-spoofing via `meta_state_resolve({resolved_by: 'operator'})` (the OTHER LIM-3 master-tracker row; deferred)
  - **Troubleshooting:** how to verify the shim is wired (`node -e "console.log(process.env.LOOP_SURFACE)"` from harness session-start hook context)
  - **Cross-platform notes:** confirm `realpath` handles null-byte (Node throws), case-insensitivity (realpath resolves); Windows UNC deferred

#### Audit-log hardening (R6, C5)

- **C5.** `tools/learning-loop-mastra/core/gate-decision-log.js#appendGateLog` MUST:
  - `JSON.stringify` each entry (already done per existing pattern)
  - **R6.1**: assert the serialized line contains no raw `\n` or `\r`. Add: `if (serialized.includes("\n") || serialized.includes("\r")) throw new Error("gate_log entry contains unescaped newline")`.
  - **R6.2**: resolve the `path` field via `realpathSync` before logging (defensive: malicious path becomes benign or throws).
  - **R6.3**: deny writes to `runtime-state.jsonl` and `**/.gate-override` via R2's `BOOTSTRAP_DENY_PATTERNS` (Phase 1 F8). When R2 denies, emit a separate `gate_log` row with reason `audit_log_protected`.
  - **C5a**: write the audit-log entry BEFORE the file rename (Phase 1 F9 ordering). If the rename fails, the log still records the intent.
- **C5b.** Update `__tests__/gate-decision-log.test.js` (and/or `gate-override.test.js`) with R6 cases.

#### Operator override UX (C6)

- **C6.** Operator runbook entry in `docs/security/plan-5-hardening.md#override`:
  - How to call `update_r2_allowlist` MCP tool (requires `gate_mark_preflight({surface: "operator"})`)
  - Audit-log-only override path (no env var; matches reframe Open Q #2 decision)
  - Example: adding a temporary `universal` pattern for an emergency fix

#### Shim wiring (NEW — corrects scout finding)

- **S1.** Modify `.claude/coordination/hooks/recurrence-check-on-start.cjs` (currently empty wrapper per scout): prepend `process.env.LOOP_SURFACE = '.claude';` before the existing `execFileSync`. Add a comment explaining the why.
- **S2.** Modify `.factory/coordination/hooks/recurrence-check-on-start.cjs` (currently empty wrapper per scout): prepend `process.env.LOOP_SURFACE = '.factory';` before the existing `execFileSync`.
- **S3.** Create `.mastracode/coordination/hooks/session-start-shim.cjs` (new file). Content:
  ```js
  #!/usr/bin/env node
  // Mastra Code SessionStart shim — sets LOOP_SURFACE before MCP server starts.
  // Re-pointed from .mastracode/hooks.json:SessionStart (Phase 3 S4).
  process.env.LOOP_SURFACE = '.mastracode';
  require('child_process').execFileSync(
    process.execPath,
    [require('path').join(__dirname, '..', '..', 'tools', 'learning-loop-mastra', 'mastra', 'server.js')],
    { stdio: 'inherit' }
  );
  ```
- **S4.** Modify `.mastracode/hooks.json` `SessionStart` block to invoke the shim (instead of any prior hook command).
- **S5.** **Wire through `loop-surface-inject.cjs`** (operator decision: option (a) per Open Question #5 — RECOMMENDED). Make `.factory/hooks/loop-surface-inject.cjs` the canonical Claude + Droid surface injector. The `LL_DISABLE_LOOP_SURFACE_INJECTION` escape hatch is preserved as a documented operator kill-switch.
  - **Files affected:**
    - Modify `.factory/hooks/loop-surface-inject.cjs` (existing scaffold) to inject `LOOP_SURFACE` based on which runtime's session-start hook invoked it. Detect via `process.env.LOOP_INVOKED_BY` (set by the shim wrappers) or by argument parsing.
    - Modify `.claude/coordination/hooks/recurrence-check-on-start.cjs`: replace its body with a thin wrapper that calls `.factory/hooks/loop-surface-inject.cjs` with `LOOP_INVOKED_BY=.claude`.
    - Modify `.factory/coordination/hooks/recurrence-check-on-start.cjs`: same, with `LOOP_INVOKED_BY=.factory`.
    - Update `.factory/hooks/loop-surface-inject.cjs` to read `LOOP_INVOKED_BY` and set `LOOP_SURFACE` accordingly, then exec the rest of the original session-start flow.
  - **Escape hatch semantics:** if `LL_DISABLE_LOOP_SURFACE_INJECTION=1` is set, `loop-surface-inject.cjs` skips the `LOOP_SURFACE` assignment. The MCP server will then fail to start with `MISSING_LOOP_SURFACE` (the canonical error from Phase 1 F10). Operator can use this to debug harness issues.
  - **Mastra Code** uses the new `.mastracode/coordination/hooks/session-start-shim.cjs` (S3) which sets `LOOP_SURFACE=.mastracode` directly (Mastra Code has no equivalent of `loop-surface-inject.cjs`).

### Non-functional

- **NF1.** Pre-commit hook (`simple-git-hooks.pre-commit` → `pnpm test && pnpm fallow:gate`) MUST include `.loop/r2-allowlist.json` in its audit list (R13). Verify by running `pnpm precommit` after Phase 1 lands and confirming the hook fires.
- **NF2.** All contract requirements emit `applicable: false` for non-applicable runtimes; no false failures across runtimes.
- **NF3.** `docs/security/plan-5-hardening.md` is the single source of truth for the gating chain. Other docs (e.g., `AGENTS.md` §11) reference it.

## Architecture

### Shim wiring (corrected — scout finding)

The original plan assumed `LOOP_SURFACE` is already injected. Verified by scout: it is NOT. All three shims must be wired in this phase:

```
Session start
  ↓
Claude Code triggers .claude/coordination/hooks/recurrence-check-on-start.cjs
  → process.env.LOOP_SURFACE = '.claude'   ← NEW (S1)
  → existing execFileSync continues

Droid CLI triggers .factory/coordination/hooks/recurrence-check-on-start.cjs
  → process.env.LOOP_SURFACE = '.factory'  ← NEW (S2)
  → existing execFileSync continues

Mastra Code triggers .mastracode/hooks.json:SessionStart
  → invokes .mastracode/coordination/hooks/session-start-shim.cjs (NEW, S3)
  → process.env.LOOP_SURFACE = '.mastracode'
  → execFileSync starts MCP server
```

After S1-S4, `pinRuntimeIdAtBoot()` (Phase 1) reads the env var successfully for all 3 runtimes. Contract Req #10 (C1) enforces this for future regressions.

### Audit-log flow (R6 hardened)

```
Tool write denied by R2
  ↓
checkR2Ownership returns { allowed: false, reason }
  ↓
appendGateLog({ error, runtime, tool, path, hint, denied_at, normalized_path })
  → path = realpathSync(path)  // defensive resolve
  → JSON.stringify(...)
  → assert no \n or \r in serialized line
  → appendFileSync(gateLogPath, serialized + '\n')
  ↓
Throw cross_runtime_write_denied
```

### Files to create

- `docs/security/plan-5-hardening.md` (C4 — does not exist)
- `.mastracode/coordination/hooks/session-start-shim.cjs` (S3)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/audit-log-hardening.test.js` (R6 + C5b)

### Files to modify

- `tools/learning-loop-mastra/interface/contract.js`
  - Append `.mastracode-config-presence`, `mastracode-session-start-pins-loop-surface`, `tools-manifest-has-path-fields` to `REQUIREMENT_IDS`
  - Add check functions + push into `checks[]`
- `tools/learning-loop-mastra/__tests__/contract.test.js`
  - Add tests for Req #9 + #10 + #11
- `tools/learning-loop-mastra/__tests__/legacy-mcp/surfaces.test.js` (C3)
  - Update 7+ assertions to use `SURFACES` import (or accept the extended list)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` (C3)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-override.test.js` (C3)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-decision-log.test.js` (C3 + C5b)
- `tools/learning-loop-mastra/core/gate-decision-log.js` (C5, R6)
  - Add newline assertion + realpath pre-resolve
- `tools/learning-loop-mastra/core/surfaces.js:16` (C3a)
  - Extend `SURFACES`
- `.claude/coordination/hooks/recurrence-check-on-start.cjs` (S1, option (a))
  - Replace body with thin wrapper that calls `.factory/hooks/loop-surface-inject.cjs` with `LOOP_INVOKED_BY=.claude`
- `.factory/coordination/hooks/recurrence-check-on-start.cjs` (S2, option (a))
  - Same as S1, with `LOOP_INVOKED_BY=.factory`
- `.factory/hooks/loop-surface-inject.cjs` (S5, option (a))
  - **MODIFY (canonical Claude + Droid surface injector)**: read `LOOP_INVOKED_BY`, set `LOOP_SURFACE` accordingly, then exec the rest of the session-start flow. Preserve `LL_DISABLE_LOOP_SURFACE_INJECTION` escape hatch semantics.
- `.mastracode/hooks.json` (S4)
  - Re-point `SessionStart` at the shim
- `AGENTS.md` §11 "Runtime Interface Ownership (R2)" (C4 reference)
  - Update to point to `docs/security/plan-5-hardening.md`

## Implementation Steps (TDD-first: Red → Green → Refactor → Lock)

### Step 1: RED — Contract extensions (C1, C2)

1. Write `interface/__tests__/contract.test.js` (or `tools/learning-loop-mastra/__tests__/contract.test.js` per scout) cases:
   - `req_9_mastracode_config_presence_passes_for_mastra_code`: stub `.mastracode/` with `mcp.json`, `hooks.json`, `settings.json`, `database.json` → `result.path_map['.mastracode-config-presence'].ok === true`
   - `req_9_not_applicable_for_claude_code`: claude-code runtime → `applicable: false`
   - `req_10_session_start_pins_loop_surface`: stub `.mastracode/hooks.json` referencing the shim that contains `process.env.LOOP_SURFACE = '.mastracode'` → passes
   - `req_10_fails_when_shim_missing_pin`: shim doesn't contain the literal → fails with descriptive error
   - `req_11_tools_manifest_has_path_fields`: stub manifest with `pathFields: []` on every entry → passes
   - `req_11_fails_when_pathfields_missing`: stub manifest without `pathFields` → fails
2. Run tests → fail.

### Step 2: GREEN — Extend contract validator

1. Modify `interface/contract.js`:
   - Add 3 new requirement ids to `REQUIREMENT_IDS`.
   - Add `checkMastracodeConfigPresence`, `checkMastracodeSessionStartPinsLoopSurface`, `checkToolsManifestHasPathFields` functions.
   - Push into `checks[]`.
2. Run tests → pass.

### Step 3: RED — SURFACES registry extension (C3, C3a)

1. Update `core/surfaces.js:16` to extend `SURFACES`.
2. Update `__tests__/legacy-mcp/surfaces.test.js` and the 3 other test files per C3.
3. Run tests → pass (tests now accept the extended list).

### Step 4: RED — Audit-log hardening (R6, C5)

1. Write `__tests__/legacy-mcp/audit-log-hardening.test.js` cases:
   - `newline_in_path_rejected`: `appendGateLog({ path: 'foo\n{"forged":"override"}' })` → throws `gate_log entry contains unescaped newline`
   - `carriage_return_in_path_rejected`: similar
   - `serialized_entry_no_newline`: happy path → serialized line contains no `\n` or `\r` (assert)
   - `path_resolved_before_logging`: `appendGateLog({ path: 'foo/../etc/passwd' })` → logged entry has `normalized_path = '/etc/passwd'` (realpath-resolved)
   - `runtime_state_jsonl_denied_by_r2`: any runtime → write to `runtime-state.jsonl` → R2 throws with `audit_log_protected`
   - `gate_override_denied_by_r2`: any runtime → write to `.claude/.gate-override` → R2 throws
2. Run tests → fail.

### Step 5: GREEN — Harden `gate-decision-log.js`

1. Modify `core/gate-decision-log.js#appendGateLog`:
   - Add `JSON.stringify` (already exists; verify)
   - Add newline assertion
   - Pre-resolve `path` via `realpathSync`
2. Extend `BOOTSTRAP_DENY_PATTERNS` in `core/r2/ownership.js` (already-defined in Phase 1 F8) to include `**/runtime-state.jsonl` and `**/.gate-override`. Update Phase 1 F8 list to add these entries.
3. Run tests → pass.

### Step 6: RED — Shim wiring (S1-S4)

1. Write `__tests__/legacy-mcp/loopsurface-injection.test.cjs` cases (CommonJS — matches shim style):
   - `claude_shim_sets_loop_surface`: source the `.cjs` file via `child_process.execFileSync` with no env → assert `process.env.LOOP_SURFACE === '.claude'` in the child
   - `factory_shim_sets_loop_surface`: similar
   - `mastracode_shim_sets_loop_surface`: similar (new shim)
   - `disable_escape_hatch`: with `LL_DISABLE_LOOP_SURFACE_INJECTION=1`, shim does NOT set the env (if S5(a) chosen)
2. Run tests → fail (shims are empty wrappers per scout).

### Step 7: GREEN — Wire the shims (option (a) per OQ #5)

1. **S5 (canonical injector):** modify `.factory/hooks/loop-surface-inject.cjs`:
   - Add logic to read `process.env.LOOP_INVOKED_BY` (`.claude` / `.factory`)
   - If unset: throw `LOOP_INVOKED_BY must be set to .claude or .factory`
   - If `LL_DISABLE_LOOP_SURFACE_INJECTION=1`: log warning and skip the assignment
   - Set `process.env.LOOP_SURFACE = LOOP_INVOKED_BY`-mapped value (`.claude` → `.claude`, `.factory` → `.factory`)
   - Continue with the original `execFileSync` for the rest of the session-start flow
2. **S1:** modify `.claude/coordination/hooks/recurrence-check-on-start.cjs`:
   - Replace body with: `process.env.LOOP_INVOKED_BY = '.claude'; require('.factory/hooks/loop-surface-inject.cjs');`
   - Or use `child_process.execFileSync` if direct require causes issues
3. **S2:** modify `.factory/coordination/hooks/recurrence-check-on-start.cjs`:
   - Same as S1, with `LOOP_INVOKED_BY=.factory`
4. **S3:** create `.mastracode/coordination/hooks/session-start-shim.cjs` (sets `LOOP_SURFACE=.mastracode` directly; no need for `LOOP_INVOKED_BY` indirection).
5. **S4:** modify `.mastracode/hooks.json` `SessionStart` to invoke the shim.
6. Run tests → pass.

### Step 8: REFACTOR + DOCS (C4)

1. Create `docs/security/plan-5-hardening.md` with all sections per C4.
2. Update `AGENTS.md` §11 to reference the new doc.
3. Update `plans/reports/productization-260612-1530-master-tracker.md` Plan 5 row → Plan 5-Lite (already done per reframe report §"File state").
4. Run `pnpm test` to confirm no regressions.

### Step 9: LOCK — Pre-commit hook verification (NF1)

1. Verify `.loop/r2-allowlist.json` is in `.fallow/` scope.
2. Run `pnpm precommit` locally; assert it fires on the new file.
3. Add `__tests__/r2/precommit-hook.test.js` regression (Phase 1 step 10) — this step verifies it still works after Phase 3 docs + config changes.

## Success Criteria

- [ ] Red-team R6, R11, R13, R17 findings have passing tests
- [ ] Scout factually-incorrect claims corrected: shims are wired (S1-S4), workflows covered (Phase 1 R4), verification-runner migrated (Phase 2 5c)
- [ ] Contract validator covers Req #9, #10, #11
- [ ] All SURFACES hard-coded test arrays updated to import the registry (C3)
- [ ] `docs/security/plan-5-hardening.md` exists with all sections
- [ ] All 3 runtime shims wired and tested
- [ ] `pnpm test` passes (~170 tests; +10 from Phase 3 new files)
- [ ] `pnpm precommit` fires on `.loop/r2-allowlist.json`

## Tests / Validation

- **Unit:** `__tests__/contract.test.js` (extended), `__tests__/legacy-mcp/audit-log-hardening.test.js`, `__tests__/legacy-mcp/loopsurface-injection.test.cjs`, `__tests__/legacy-mcp/surfaces.test.js` (extended), `__tests__/legacy-mcp/runtime-agnostic.test.js` (extended), `__tests__/legacy-mcp/gate-override.test.js` (extended), `__tests__/legacy-mcp/gate-decision-log.test.js` (extended)
- **Integration:** full `pnpm test`; manual `pnpm precommit`
- **Manual probe:** start a Claude session, run `node -e "console.log(process.env.LOOP_SURFACE)"` from a Bash tool inside the session → should print `.claude`

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Shim wiring breaks an existing harness flow | Medium | High | Run full pnpm test + manual session-start probe after S1-S4. Each shim is a 1-line prepend; minimal surface. |
| `LL_DISABLE_LOOP_SURFACE_INJECTION` semantics change breaks operator workflow | Low | Medium | Decision recorded (option (a)): escape hatch preserved. Document new behavior in `docs/security/plan-5-hardening.md` §"Identity shim wiring". |
| Audit-log hardening rejects legitimate log entries with special chars | Low | Medium | realpath pre-resolve normalizes most paths; only `:` and `\n` are rejected. Verify with regression tests on existing log entries. |
| Contract Req #11 (`tools-manifest-has-path-fields`) breaks existing tools that lack `pathFields` | High | Medium | Phase 1 step 4 sets `pathFields: []` on every tool; Phase 3 Req #11 validates. If a tool is added later without `pathFields`, the contract fails loudly. |
| Pre-commit hook doesn't fire on `.loop/` (R13) | Medium | High | Verify with `pnpm precommit` after Phase 1 lands. If `.fallow/` scope doesn't include `.loop/`, add `.loop/r2-allowlist.json` to the scope. |

## Rollback

If Phase 3 fails validation post-merge:
1. Revert commit `chore(surfaces): add .mastracode to SURFACES registry + contract Req #9 + #10`
2. Revert commit `docs(plan-5-lite): reframe report + new plan.md + tracker update`
3. Contract validator falls back to 7 requirements (no regression)
4. Shim mods (S1-S2) reverted → MCP server fails closed on missing `LOOP_SURFACE` (graceful denial)
5. Open follow-up plan; do not ship hotfix without validation

## Cross-references

- Phase 1 (R2): `phase-01-r2-write-gate.md` (F8 `BOOTSTRAP_DENY_PATTERNS`, F9 `update_r2_allowlist`)
- Phase 2 (LIM-4): `phase-02-lim-4-path-containment.md` (audit-site migrations referenced in `docs/security/plan-5-hardening.md`)
- Scout report (factual corrections): see plan.md References section
- Red-team review: `plans/reports/general-purpose-260701-2312-GH-5-plan-5-lite-r2-lim4-red-team-plan-review-report.md` (Findings R6, R11, R13, R17)
- Threat-model reframe: `plans/reports/from-ask-to-planner-reframe-260701-2250-GH-5-plan-5-lite-r2-lim4-report.md` (LIM-3 dropped rationale)
- Master tracker: `plans/reports/productization-260612-1530-master-tracker.md` (Plan 5-Lite row)