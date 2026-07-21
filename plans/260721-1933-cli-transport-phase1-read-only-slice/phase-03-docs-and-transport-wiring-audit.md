---
phase: 3
title: "Docs and transport-wiring audit"
status: complete
priority: P2
effort: "2h"
dependencies: [2]
---

# Phase 3: Docs and transport-wiring audit

## Overview

Wire the second named transport in the docs (the CLI read-only slice shipped in Phase 2) and lock the transport-wiring assumptions with a guard test + a runtime-agnostic audit. The report's flagged "Real cost #1: Bash-gate allowlisting" dissolved on inspection — the bash gate is default-allow and a read-only `node bin/loop.mjs ...` invocation writes no protected path and matches no blocking regex — so this phase promotes **no gate rule**; instead it adds a guard test that locks that assumption against a future regression.

## Requirements

- Functional: `docs/runtime-contract.md` Transport mapping gains a NEW bullet for a "Read-only CLI transport" (has a tool surface, no write path, satisfies Capabilities 1+4 only — distinct from shell-hook-only and from the future write-capable CLI), marked wired for the 7-tool slice; L27 is pluralized to "a read-only transport (shell-hook-only OR read-only CLI)"; "Current transports" (L39-41) notes the read-only CLI slice. The L25 write-capable-CLI clause ("future option, not wired today") is LEFT UNCHANGED — it is about Capability 3, which the read-only slice does not exercise. The library-import transport remains a forward option.
- Functional: `CLAUDE.md` quick reference names the CLI (`bin/loop.mjs`) alongside the MCP server bullet.
- Functional: `docs/architecture.md` Constraint Gate section (L196-202) cross-references the read-only CLI as the second transport (one line; the canonical home is `runtime-contract.md`).
- Non-functional: a guard test asserts `node .../bin/loop.mjs meta_state_list '{}'` evaluates to `decision: "ok"` through `core/evaluate-bash-gate.js`, so a future blocking regex rule cannot silently break the CLI transport.
- Non-functional: `check_runtime_agnostic` audit passes for the CLI feature — the CLI is a shim over `core/` + handler modules, not a fork.

## Architecture

**Bash gate is default-allow (scout finding).** `core/gate-logic.js:1008-1016` shows promoted rules return `{decision: "escalate"}` on match — they are *blockers*, not allowlisters. The bash gate blocks on: (i) constraint-pattern match without observation, (ii) a write to `records/**`, `meta-state.jsonl`, `runtime-state.jsonl`, or a `.loop-preflight-*` marker (`PATH_WRITE_PATTERNS`, `evaluate-bash-gate.js:43-52`), (iii) a promoted blocking-regex match. A read-only `node tools/learning-loop-mastra/bin/loop.mjs meta_state_list '{}'` command string has no redirect and no protected-path literal, and matches no existing blocking regex (`docker`, `sudo`, package-manager install, vendor-api curl, `vitest run | tail/grep/head`, design-slop phrases). It passes as `decision: "ok"`. No rule promotion is required or wanted — promoting an "allow" rule would be a no-op against a default-allow gate and would misrepresent the gate model in the registry.

The guard test calls the pure core function (`evaluateBashGate` / `applyPromotedRules` in `core/evaluate-bash-gate.js` / `core/gate-logic.js`, avoiding the hook I/O layer) with the CLI command string and asserts the decision. This makes the dissolved-cost finding executable and protects the CLI transport from a future blocking rule that matches `node ... loop.mjs`.

**Docs are the wiring of record — but the read-only CLI is a NEW transport category, not a subset of the write-capable CLI.** Red-team M1: the contract's Transport mapping (`runtime-contract.md` L23-25) names three categories — MCP+hooks (wired), library-import (forward), shell-hook-only (forward, read-only) — plus a forward "write-capable CLI" clause at L25 that is specifically about exercising Capability 3. The read-only CLI slice wires NONE of these: it has a tool surface (unlike shell-hook-only), no write path (unlike the future write-capable CLI), and satisfies Capabilities 1+4 only. So:
- **Do NOT edit L25's "named here as a future option, not wired today"** — that clause is about the write-capable CLI (Capability 3), which IS still future. Piggybacking the read-only slice onto it mis-claims Capability 3.
- **Add a new bullet in Transport mapping** for a "Read-only CLI transport": a CLI exposing the loop's read tools as commands, no write path, satisfies Capabilities 1+4 only, distinct from shell-hook-only (has a tool surface) and from the write-capable CLI (no write path). Mark it wired (Phase 1 slice, 7 tools, additive to MCP).
- **Update L27** ("a read-only transport (shell-hook-only) carries no write path") to pluralize: "a read-only transport (shell-hook-only OR read-only CLI)".

This gives the contract an explicit slot for the thing being wired, rather than mis-classifying it under an existing forward option.

## Related Code Files

- Modify: `docs/runtime-contract.md` (L25, L39-41)
- Modify: `CLAUDE.md` (quick reference, after the MCP server bullet ~L6)
- Modify: `docs/architecture.md` (Constraint Gate section ~L196-202, one cross-reference line)
- Create: `tools/learning-loop-mastra/__tests__/cli-bash-gate-guard.test.js`
- Run: runtime-agnostic audit against `bin/loop.mjs` (see Success Criteria)
- Delete: none

## Implementation Steps (TDD)

1. **Test first — guard.** Write `__tests__/cli-bash-gate-guard.test.js`:
   - Read `core/evaluate-bash-gate.js` to find the pure entry point that takes a command string (+ resolved root) and returns `{ decision }` (the hook `hooks/universal/bash-gate.js` is a thin I/O adapter; call the core function directly to keep the test deterministic and filesystem-light).
   - Assert `evaluateBashGate({ command: "node tools/learning-loop-mastra/bin/loop.mjs meta_state_list '{}'", root: <tmpdir> })` returns the default-allow decision (pin the real sentinel value — likely `ok`).
   - Add a second assertion: the same command with a shell redirect that writes a protected path (`node bin/loop.mjs ... > meta-state.jsonl`) IS blocked — proving the gate still guards writes, so the read-only pass is not a gate bypass.
   Run → green immediately (the gate already behaves this way); the test locks the assumption.
2. Run the runtime-agnostic audit against the CLI feature path (`bin/loop.mjs` + the Phase-1 seam):
   - Invoke the `check_runtime_agnostic` handler (`tools/handlers/check-runtime-agnostic-tool.js`) directly, or the MCP tool, against `bin/loop.mjs`.
   - If the audit surfaces a fork (e.g. the CLI re-implements manifest loading instead of using `resolveToolImportUrl`), fix it in Phase 2's file before closing this phase. Record the audit result in the phase report.
3. **Edit `docs/runtime-contract.md`:**
   - **Leave L25 unchanged** — the "write-capable CLI … future option, not wired today" clause is about Capability 3, which the read-only slice does not exercise.
   - **Transport mapping (L23-25 area): add a new bullet** for "Read-only CLI transport" — a CLI exposing the loop's read tools as commands; has a tool surface (unlike shell-hook-only), no write path (unlike the future write-capable CLI), satisfies Capabilities 1+4 only; wired for the 7-tool slice over `bin/loop.mjs`, additive to MCP.
   - **L27:** pluralize "a read-only transport (shell-hook-only)" → "a read-only transport (shell-hook-only OR read-only CLI)".
   - **L39-41 "Current transports":** add that the read-only CLI slice is wired (7 tools, additive to MCP); a runtime opts in when its trigger fires.
4. **Edit `CLAUDE.md` quick reference:** add a `bin/loop.mjs` bullet after the MCP server bullet, naming the 7 read-only tools and the `LOOP_SURFACE`/`GATE_ROOT` contract.
5. **Edit `docs/architecture.md`** Constraint Gate section: one line cross-referencing the read-only CLI as the second transport, pointing to `docs/runtime-contract.md` for the contract.
6. Run `pnpm test` (full suite, including the new guard test) → green.

## Success Criteria

- [x] `__tests__/cli-bash-gate-guard.test.js` green: read-only CLI command → default-allow; write-redirect variant → blocked.
- [x] `check_runtime_agnostic` audit passes for `bin/loop.mjs` (shim-not-fork); result recorded.
- [x] `docs/runtime-contract.md` has a new "Read-only CLI transport" bullet in Transport mapping, L27 pluralized, "Current transports" updated; L25's write-capable-CLI clause UNCHANGED. `CLAUDE.md` quick reference names the CLI; `docs/architecture.md` has the cross-reference line.
- [x] No promoted gate rule was created for the CLI (verify `meta-state.jsonl` has no new `rule-` entry introduced by this plan). The guard test is the protection, not a registry rule.
- [x] `pnpm test` full suite green.

## Risk Assessment

- **Future blocking rule breaks the CLI.** If a later plan promotes a regex rule that matches `node ... loop.mjs`, the CLI transport silently breaks at the gate. Mitigation: the guard test fails loudly in that case, forcing the rule author to narrow the regex or account for the CLI. This is the entire reason the guard test exists.
- **Docs over-claim Capability 3.** The CLI read-only slice does NOT exercise record routing (Capability 3) — it is read-only participation. Risk: editing L25 (the write-capable-CLI clause) to say the read-only slice is "wired" would mis-claim Capability 3. Mitigation: L25 is LEFT UNCHANGED; a NEW "Read-only CLI transport" bullet (Capabilities 1+4 only) is added to Transport mapping; L27 pluralizes the read-only transports. The architecture cross-reference is one line, not a rewrite.
- **Audit surfaces a fork.** If `check_runtime_agnostic` flags the CLI for re-implementing a core concern, the fix belongs in Phase 2's file (rerun the audit). Low likelihood — Phase 2 reuses `resolveToolImportUrl`, `normalizeInputSchema`, `adaptLegacyHandler`, `withR2Gate`, `pinRuntimeIdAtBoot` by design — but the audit is the backstop.
- **Rollback:** revert the three doc files + delete the guard test. The guard test is additive; the doc edits are reversible.