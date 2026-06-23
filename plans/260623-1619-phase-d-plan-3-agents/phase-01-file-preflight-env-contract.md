---
phase: 1
title: "File preflight + env contract"
status: pending
priority: P1
effort: "~30min"
dependencies: []
---

# Phase 1: File preflight + env contract

## Overview

Verify the technical preconditions for Plan 3: `@mastra/core@1.42.0` ships the official `createMockModel` helper at the expected path; `kimi-for-coding/k2p6` resolves as a valid `ModelRouterModelId`; the loop's env-var contract (no `dotenv` import in loop code, `MASTRA_AGENT_MODEL` precedence, `KIMI_API_KEY` for the Kimi router, `direnv` recommended for local dev) is documented and locked via a `meta_state_log_change`. No code changes to the mastra package — this phase is probe + log-change.

## Requirements

- **Functional:**
  - Verify `createMockModel` is importable from `@mastra/core/test-utils/llm-mock` (the path the parity harness will use).
  - Verify the Kimi router resolves `kimi-for-coding/k2p6` without a vendor import (Mastra's model router handles the package install lazily; a probe test confirms the magic string is accepted by `MastraModelConfig`).
  - Document the env-var contract in `.claude/coordination/MASTRA_AGENT_MODEL.md` (operator-facing).
  - File a `meta_state_log_change` locking the no-`dotenv` decision.
- **Non-functional:**
  - No vendor SDK install (Kimi is auto-installed by the Mastra router on first use; the plan's runtime test in Phase 5 will fail loudly if not).
  - No `dotenv` import anywhere in the loop code (verified by grep). The lock is about the **loop's runtime**, not the operator's dev environment — operators may use `direnv`, `~/.bashrc`, `~/.zshrc`, or any other method to inject env vars at the shell level before the loop reads them.
  - **Recommended operator workflow:** `direnv` with `.envrc` + `.env` (per-project auto-load, git-safe). Fallback: shell rc. The loop code does not read `.env` files directly.
  - No code changes to `tools/learning-loop-mastra/server.js`, `create-loop-workflow.js`, or `create-loop-tool.js` in this phase.

## Architecture

Phase 1 is probe + documentation. The probe is a one-shot Node script (no test file) that imports the mock helper and constructs a stub agent to confirm the import path resolves. The log-change is a single `meta_state_log_change` call against `.claude/coordination/MASTRA_AGENT_MODEL.md` (the file this phase creates).

**No factory or agent code in this phase.** Phase 2 ships `createLoopAgent`; Phase 1 only verifies the technical surface for it.

## Related Code Files

- **Create:**
  - `tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs` (one-shot probe; ~30 LOC; runs `node` once and exits)
  - `.claude/coordination/MASTRA_AGENT_MODEL.md` (operator-facing env-var reference; ~80 LOC; documents `MASTRA_AGENT_MODEL`, `KIMI_API_KEY`, lookup order, no-`dotenv` lock, `direnv` recommended setup)
  - `.envrc` (committed, no secrets; ~3 lines; contains `dotenv .env` directive for `direnv` auto-load; pairs with gitignored `.env`)
  - `.env.example` (committed template; ~5 lines; shows the expected env-var shape with placeholder values, no real keys)
- **Modify:**
  - `meta-state.jsonl` (one `meta_state_log_change` entry filed via the MCP tool)
  - `.gitignore` (add `.env` if not already present; verify `.envrc` is committed intentionally — `.envrc` contains no secrets, just the `dotenv .env` directive)
- **Delete:** none
- **Read (verification only):**
  - `node_modules/@mastra/core/dist/test-utils/llm-mock.js` (probe verifies this file exists and exports `createMockModel`)
  - `node_modules/@mastra/core/dist/llm/model/shared.types.d.ts` (probe verifies `ModelRouterModelId` accepts `kimi-for-coding/k2p6`)
  - `tools/learning-loop-mastra/package.json` (verify no `dotenv` dep; there is no `tools/learning-loop-mastra/package.json` — root `package.json` is the dep manifest)

## File Inventory (deep mode)

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs` | Create | ~30 LOC | none (one-shot, not a test) |
| `.claude/coordination/MASTRA_AGENT_MODEL.md` | Create | ~80 LOC | none (docs) |
| `.envrc` | Create | ~3 lines | none (direnv hook; not a test) |
| `.env.example` | Create | ~5 lines | none (template; not a test) |
| `meta-state.jsonl` | Modify (1 entry) | +1 line | none (registry delta) |
| `.gitignore` | Modify | +1 line (`.env`) | none (gitignore delta) |

## Implementation Steps

1. **Verify `@mastra/core@1.42.0` ships `createMockModel`.** Run `node -e "import('@mastra/core/test-utils').then(m => console.log(Object.keys(m)))"` from the project root. Expected output includes `createMockModel` and `MastraLanguageModelV2Mock`. If absent, the Phase 2 factory cannot ship — escalate to operator (this is unexpected; Plan 1 + Plan 2 verified `@mastra/core` 1.42.0 already).
2. **Verify `kimi-for-coding/k2p6` is a valid `ModelRouterModelId`.** Inspect `node_modules/@mastra/core/dist/llm/model/shared.types.d.ts` for the `MastraModelConfig` type union. Confirm `ModelRouterModelId` is a string-typed union that accepts arbitrary `provider/model` strings (it's a generic branded string, not an enum). Document the verification in the probe script's console output.
3. **Confirm no `dotenv` is used anywhere in the loop.** Run `grep -rn "dotenv\|require.*dotenv\|from .dotenv" tools/learning-loop-mcp/ tools/learning-loop-mastra/ 2>/dev/null` and verify zero matches. Document the output in the probe script.
4. **Create the probe script.** Write `tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs` (ESM, since `tools/learning-loop-mastra/` is ESM-only per the existing `create-loop-*.js` files). The script:
   - Imports `createMockModel` from `@mastra/core/test-utils/llm-mock`.
   - Constructs a stub mock with `mockText: "probe-ok"`.
   - Calls `model.doGenerate({...})` to verify the helper runs end-to-end.
   - Logs each step to stdout for the operator to inspect.
   - Exits 0 on success; non-zero on any error.
5. **Run the probe.** `node tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs`. Verify exit code 0 and the expected log output. If non-zero, the probe fails; escalate to operator.
6. **Create `.claude/coordination/MASTRA_AGENT_MODEL.md`.** Document:
   - `MASTRA_AGENT_MODEL` env var (sets all 3 agents to the same `provider/model` string).
   - `KIMI_API_KEY` env var (auto-injected by the Mastra router when an agent uses the Kimi provider; **operator must set this in their shell before invoking the loop**).
   - Per-agent `agents-manifest.json` `model` field (overrides the env var for that agent).
   - Lookup order: (1) per-agent manifest field, (2) `MASTRA_AGENT_MODEL`, (3) code default `kimi-for-coding/k2p6`.
   - **No `dotenv` import in the loop.** The loop reads `process.env.*` directly. The lock applies to the loop code only; the operator's dev environment is free to use any env-var injection method.
   - **Recommended operator workflow: `direnv` + `.envrc` + `.env`.** This is the per-project, git-safe, auto-load pattern. Setup is one-time; subsequent `cd` into the project auto-loads the env.
   - **Fallback: shell rc (`~/.bashrc` / `~/.zshrc`).** Works but not per-project scoped; recommended only if `direnv` is unavailable.
   - **Production deploy: env vars from the deployment system** (Docker, K8s, systemd, etc.). Not `.env` files.
   - Reference: `https://mastra.ai/models/providers/kimi-for-coding`.
7. **Create `.envrc` (committed, no secrets).** The file contains a single `direnv` directive that loads `.env` on `cd` into the project:
   ```bash
   # .envrc — committed; no secrets. direnv auto-loads on cd.
   dotenv .env
   ```
   Operators run `direnv allow .` once after cloning. The `.env` file (gitignored) contains the actual `KIMI_API_KEY` and any other secrets.
8. **Create `.env.example` (committed template).** The file shows the expected env-var shape with placeholder values, no real keys:
   ```bash
   # .env.example — committed template; no real secrets.
   # Copy to .env (gitignored) and fill in your actual key.
   KIMI_API_KEY=sk-your-kimi-api-key-here
   # Optional override: set all 3 agents to a different model.
   # MASTRA_AGENT_MODEL=kimi-for-coding/k2p6
   ```
9. **Update `.gitignore` to include `.env` (if not already present).** Verify `.env` is excluded; verify `.envrc` is NOT excluded (it contains no secrets). If `.gitignore` does not already exclude `.env`, add it.
10. **File the `meta_state_log_change`.** Use the MCP tool `meta_state_log_change` with:
   - `change_target`: `.claude/coordination/MASTRA_AGENT_MODEL.md`
   - `change_dimension`: `surface`
   - `change_diff.added`: `["MASTRA_AGENT_MODEL env var", "KIMI_API_KEY env var", "Per-agent model field in agents-manifest.json", "3-layer lookup order", "no-dotenv contract (loop code only)", "direnv recommended operator workflow", "fallback shell rc workflow", "production deploy via deployment system env vars"]`
   - `change_diff.removed`: `[]`
   - `change_diff.changed`: `[]`
   - `reason`: `Plan 3 ships 3 Mastra agents with model lookup via per-agent manifest → MASTRA_AGENT_MODEL → code default. The loop code does not introduce dotenv; the operator's dev environment is free to use direnv (recommended) or shell rc (fallback) to inject env vars. .envrc + .env.example committed; .env gitignored. Locks the env-var contract before Phase 2 factory ships.`
   - `evidence_code_ref`: `tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs`
   - `evidence_journal`: `docs/journals/260623-phase-d-plan-3-shipped.md` (the journal Phase 6 ships)
7. **File the `meta_state_log_change`.** Use the MCP tool `meta_state_log_change` with:
   - `change_target`: `.claude/coordination/MASTRA_AGENT_MODEL.md`
   - `change_dimension`: `surface`
   - `change_diff.added`: `["MASTRA_AGENT_MODEL env var", "KIMI_API_KEY env var", "Per-agent model field in agents-manifest.json", "3-layer lookup order", "no-dotenv contract"]`
   - `change_diff.removed`: `[]`
   - `change_diff.changed`: `[]`
   - `reason`: `Plan 3 ships 3 Mastra agents with model lookup via per-agent manifest → MASTRA_AGENT_MODEL → code default. The loop does not introduce dotenv; the operator sets env vars in the shell. Locks the env-var contract before Phase 2 factory ships.`
   - `evidence_code_ref`: `tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs`
   - `evidence_journal`: `docs/journals/260623-phase-d-plan-3-shipped.md` (the journal Phase 6 ships)

## Function/Interface Checklist (deep mode)

- [ ] `createMockModel` import path verified
- [ ] `kimi-for-coding/k2p6` accepted as `ModelRouterModelId`
- [ ] No `dotenv` in the loop code (grep verified)
- [ ] `.claude/coordination/MASTRA_AGENT_MODEL.md` created with lookup order + env-var reference + `direnv` recommended setup
- [ ] `.envrc` created (committed, no secrets; contains `dotenv .env` directive)
- [ ] `.env.example` created (committed template; placeholder values only)
- [ ] `.gitignore` excludes `.env` (if not already present)
- [ ] `meta_state_log_change` filed with `change_target: .claude/coordination/MASTRA_AGENT_MODEL.md`

## Test Scenario Matrix (deep mode)

| Scenario | Critical | High | Medium | Notes |
|---|---|---|---|---|
| Probe succeeds: `createMockModel` importable | ✓ | | | gates Phase 2 |
| Probe succeeds: `kimi-for-coding/k2p6` accepted | ✓ | | | gates Phase 3 |
| Probe succeeds: no `dotenv` in loop | | ✓ | | process contract |
| Log-change filed: `change_target` correct | ✓ | | | the only registry delta in Phase 1 |

## Dependency Map (deep mode)

- **Reads from:**
  - `@mastra/core@1.42.0` (already pinned; `dist/test-utils/llm-mock.js` is the probe target)
  - `node_modules/@mastra/core/dist/llm/model/shared.types.d.ts` (the `MastraModelConfig` union type)
  - `tools/learning-loop-mcp/`, `tools/learning-loop-mastra/` (grep target for `dotenv`)
- **Writes to:**
  - `tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs` (new file)
  - `.claude/coordination/MASTRA_AGENT_MODEL.md` (new file)
  - `meta-state.jsonl` (1 new `meta_state_log_change` entry)
- **Blocks:** Phase 2 (factory cannot ship without the `createMockModel` import verified)
- **Blocked by:** none (first phase of Plan 3)

## Success Criteria

- [ ] `node tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs` exits 0
- [ ] Probe output logs: `createMockModel` importable, `kimi-for-coding/k2p6` accepted, no `dotenv` in loop
- [ ] `.claude/coordination/MASTRA_AGENT_MODEL.md` exists with: `MASTRA_AGENT_MODEL` reference, `KIMI_API_KEY` reference, 3-layer lookup order, no-`dotenv` contract, URL citation to `https://mastra.ai/models/providers/kimi-for-coding`
- [ ] `meta_state_log_change` entry exists in `meta-state.jsonl` with `change_target: .claude/coordination/MASTRA_AGENT_MODEL.md`, `change_dimension: surface`, reason citing Plan 3's env-var contract
- [ ] `pnpm test` exits 0 (no test changes in Phase 1; baseline 1140 pass / 0 fail / 1 skipped preserved)

## Risk Assessment

- **`createMockModel` is not at the expected path.** Risk: very low (researcher A verified the export at `node_modules/@mastra/core/dist/test-utils/llm-mock.js:14776`). **Mitigation:** Phase 1 step 1 verifies via `node -e`; the import fails loudly if not present. Escalate to operator if non-zero exit.
- **Kimi router fails to resolve `kimi-for-coding/k2p6` at runtime.** Risk: low (per `https://mastra.ai/models/providers/kimi-for-coding`; the model is in the Mastra model router). **Mitigation:** Phase 5.1's empirical probe runs the agent end-to-end; a resolution failure surfaces as an `agent.generate()` error with a clear message.
- **`dotenv` is silently added by a transitive dep.** Risk: very low (the loop's existing `gate-logic.js` and `server.js` use `process.env.*` directly; no `dotenv` in `node_modules/@mastra/*`). **Mitigation:** Phase 1 step 3 grep-verifies; if a future dep adds `dotenv`, the grep in Phase 1 of any future plan catches it.
- **The probe script is not run before Phase 2.** Risk: low. **Mitigation:** Phase 2's first test (factory invariant test #1) imports `createMockModel`; if the probe wasn't run, the test fails with a clear import error. Operator can re-run the probe.
- **`KIMI_API_KEY` is not set when the parity test runs.** Risk: medium. **Mitigation:** Phase 5 uses `createMockModel` to override the model — the test never hits the real router. `KIMI_API_KEY` is only required at production runtime, not in the test harness. Document this in the env-var reference.

## Security Considerations

- **`KIMI_API_KEY` storage.** The env var is read from `process.env` at agent construction time. Plan 3 does not log the value, persist it to disk, or transmit it to any service other than the Mastra router. The operator's shell env (via `direnv` or shell rc) is the source of truth at dev time; the deployment system is the source of truth at production time.
- **No `dotenv` import in the loop.** Prevents accidental `KIMI_API_KEY` commit via a code change (the loop never reads `.env` files). The `.env` file (when used with `direnv`) is gitignored. The `.envrc` (committed) contains only the `dotenv .env` directive, no secrets. The `.env.example` (committed) contains only placeholder values, no real keys.
- **`.gitignore` discipline.** `.env` is excluded; `.envrc` and `.env.example` are committed intentionally (no secrets). Phase 4 step (or Phase 1 step 9 if not already done) verifies `.gitignore` excludes `.env`.
- **The probe script is one-shot.** It does not call any external service; the `createMockModel` helper is local. No network exposure.

## Next Steps

After Phase 1 ships, Phase 2 ships the `createLoopAgent` factory + `resolveAgentModel` helper + 4 invariant tests. The factory imports `createMockModel` (verified in Phase 1) for the parity test in Phase 5.
