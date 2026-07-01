# Plan 5 Reframe — Threat-Model Review → Option A (drop LIM-3; keep R2 + LIM-4)

**Date:** 2026-07-01
**Author:** Ask session (post `/ck:predict` + `/ask` consultation)
**Status:** Decision recorded; new plan opened at `plans/260701-2250-plan-5-lite-r2-lim4/`
**Relates to:**
- Original plan: `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/`
- Original followup: `plans/reports/plan-5-followup-260701-mastra-code-bootstrap-phase-a-vs-b-report.md`
- Master tracker: `plans/reports/productization-260612-1530-master-tracker.md`
- Closed PR: #27 (`hardening/plan-5-r2-lim3-lim4`)

## Context

Plan 5 (PR #27) shipped three security items bundled into one PR:

- LIM-3 Ed25519 caller identity (Phase 1)
- R2 write-gate per-runtime allowlist (Phase 2)
- LIM-4 realpath containment (Phase 3)

After PR #27 was opened, the followup report (`plan-5-followup-260701-mastra-code-bootstrap-phase-a-vs-b-report.md`) identified an implementation drift in LIM-3: the **mint side** of the Ed25519 lifecycle was placed OUTSIDE the MCP (in hooks, `.cjs` shims, `LOOP_*` env vars), while the **verify side** was placed INSIDE the MCP. This is the architecturally wrong boundary (mint and verify must share one trust domain), and the followup correctly noted Phase B of its analysis as the only honest fix.

That followup's user pushback ("if you implement A, why not do the universal bootstrap MCP then?") prompted a deeper review of whether the verify side itself is justified. This report records the result.

## Decision

**Option A: Drop LIM-3 entirely. Ship only R2 + LIM-4 as Plan 5-Lite.**

- R2 (per-runtime write allowlist) and LIM-4 (realpath containment) keep their place. Both have a concrete threat model.
- LIM-3 (Ed25519 caller identity) is dropped. The threat it defends against does not survive a careful read of the local-stdio-MCP attack surface.
- The R2 gate's `runtime_id` source is **process-boot pinning** from `LOOP_SURFACE` (set by the harness `.cjs` shim, frozen for process lifetime) — this replaces the role LIM-3 was filling in `createLoopTool`, without the crypto.

## Threat model (the disambiguation that was missing)

The three Plan-5 items defend against three distinct, orthogonal threats. Conflating them is what made LIM-3 look necessary.

| Plan-5 item | Threat | Concrete attack |
|---|---|---|
| **LIM-3 (Ed25519)** | Caller-process identity spoofing | A tool call (or out-of-band MCP invocation) lies about which runtime it is via env vars |
| **R2 (allowlist)** | Cross-runtime surface write | Runtime A's process writes to Runtime B's surface dir (e.g., Claude writes `.factory/hooks/foo.cjs` — a runtime-supply-chain attack) |
| **LIM-4 (realpath)** | Path-traversal escape | A user-supplied path like `../../../etc/passwd` joins unsafely and escapes project root |

These threats are **orthogonal** — none is a subset of another.

### Why LIM-3's threat model is weak in the local-stdio-MCP case

To exploit the gap LIM-3 closes, an attacker needs ALL of:

1. **Code execution on the developer's machine** (the harness itself runs as the user).
2. **MCP tool-call access** (only the harness process can talk to MCP in stdio mode).
3. **No filesystem access to `~/.{surface}/runtime-private-key.bin`** for the runtime they want to impersonate.
4. **Ability to forge an Ed25519 signature** without that private key.

In local-stdio-MCP, conditions 1 and 2 collapse: the harness IS the attacker's code path. The harness can also read any file the user can read — including other runtimes' private keys (mode 0600 is owned by the same user, so any user-mode process can read). So condition 3 also drops. R2 closes the actual ownership gap (cross-runtime surface write) with a static allowlist, no crypto.

**The one attack LIM-3 catches that R2 misses** is env-var spoofing of `runtime_id` within a single process (e.g., a buggy tool inner-spawns a child MCP and lies about its identity). For local stdio MCP this is theoretical; for a **future where MCP becomes network-accessible** (e.g., shared MCP server across sessions), this is a real defense. That future is the moment to add LIM-3.

## What changes vs the original Plan 5

| Item | Original Plan 5 | Plan 5-Lite (this reframe) |
|---|---|---|
| **Phase 1 (LIM-3)** | Ed25519 signed capability tokens, mint in hooks, verify in MCP, exemption list for mint tool, 2.5d | **Dropped** — replaced by `LOOP_SURFACE` env pinning at process boot |
| **Phase 2 (R2)** | Per-runtime write allowlist, 1.5d | **Unchanged** — keys on pinned `runtime_id` instead of verified token |
| **Phase 3 (LIM-4)** | realpath containment, 1d | **Unchanged** |
| **Phase 4 (cross-cutting)** | Contracts + docs + sweep, 0.5d | **Trimmed** — only R2 + LIM-4 docs; LIM-3 docs removed |
| **Total effort** | 5.5d | **~3d** |
| **Files in this PR's diff** | 14 files, ~700 LoC | **~9 files, ~470 LoC** (the LIM-3 modules are not introduced) |
| **Mastra Code caveat** | First-call silent denial (token mints with wrong runtime_id) | **Resolved** — no token to mint; `LOOP_SURFACE=.mastracode` set by shim at process boot |

### Identity-pinning mechanism (replaces LIM-3's role in `createLoopTool`)

The MCP server reads `process.env.LOOP_SURFACE` **exactly once** at process boot, validates it against the `SURFACES` registry (`core/surfaces.js:16` — extended to `[".claude", ".factory", ".mastracode"]`), and stores the resolved `runtime_id` in a process-scoped closure variable. `createLoopTool`'s execute body reads this pinned value via a `getPinnedRuntimeId()` getter — never re-reads the env, never accepts a caller-supplied value.

The `LOOP_SURFACE` env var is set by the harness `.cjs` shim at process spawn:
- Claude Code → `.claude/coordination/hooks/recurrence-check-on-start.cjs` (already sets `LOOP_SURFACE=.claude` in PR #27's session-start hook)
- Droid CLI → `.factory/coordination/hooks/recurrence-check-on-start.cjs` (already sets `LOOP_SURFACE=.factory`)
- Mastra Code → new `.mastracode/coordination/hooks/session-start-shim.cjs` (sets `LOOP_SURFACE=.mastracode`; re-pointed from `.mastracode/hooks.json:SessionStart`)

The Mastra Code shim is the only NEW piece of env-injection infrastructure. It's strictly smaller than the LIM-3 token-mint shim (no keypair, no signing, no token file) — just one `process.env.LOOP_SURFACE = '.mastracode'` line in a 5-line wrapper.

## What gets dropped (specific files from PR #27 that this plan removes)

From PR #27's 8 commits, the following files are **not carried forward** to Plan 5-Lite:

- `tools/learning-loop-mastra/core/identity/identity-crypto.js` — Ed25519 sign/verify/keygen
- `tools/learning-loop-mastra/core/identity/runtime-key-store.js` — 0600 perms + path resolution
- `tools/learning-loop-mastra/core/identity/token-mint-cli.js` — harness-side mint+sign+write
- `tools/learning-loop-mastra/core/identity/public-key-from-seed.js` — pubkey extraction helper
- `tools/learning-loop-mastra/core/identity/verify-runtime-token.js` — server-side verify (replaced by `getPinnedRuntimeId()`)
- `tools/learning-loop-mastra/__tests__/identity/` — all LIM-3 test files
- `tools/learning-loop-mastra/__tests__/phase-5-hardening/gitignore-runtime-keys.test.cjs` — the lock-step test for `runtime-private-key.bin` (no key in Plan 5-Lite)
- `.gitignore` entries for `**/runtime-private-key.bin` and `**/runtime-id-token.json` (no files to exclude)
- The env-var injection in `.claude/coordination/hooks/recurrence-check-on-start.cjs` and `.factory/coordination/hooks/recurrence-check-on-start.cjs` (these set `LOOP_RUNTIME_ID` and `LOOP_KEY_PATH` for token-mint; not needed for `LOOP_SURFACE` pinning — only `LOOP_SURFACE` survives)
- The `token-mint-cli.js` invocation in `tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js` (no token to mint)
- The 3 docs commits in PR #27's branch (`docs(plan-5): contract tightening + journal + security note + sweep` and the followup `docs(plan-5): followup report on Mastra Code bootstrap Phase A vs B`) — replaced by this reframe report + the new plan.md

What **carries forward** unchanged:

- R2 work: `tools/learning-loop-mastra/core/r2/ownership.js`, `core/r2/path-field-detector.js`, the `create-loop-tool.js` wrapper modification, and `__tests__/r2/ownership.test.js`
- LIM-4 work: `tools/learning-loop-mastra/core/path-containment.js`, `__tests__/path-containment.test.js`, the audit-site migrations in refresh-fingerprint / check-grounding / derive-status / gate-logic / test-runner tools
- Surface registry extension to `[".claude", ".factory", ".mastracode"]` in `core/surfaces.js`
- Contract extensions: Req #9 (`.mastracode/` config presence) and Req #10 (`.mastracode/hooks.json` references a shim that sets `LOOP_SURFACE`)
- Fixture updates: `legacy-mcp/surfaces.test.js`, `legacy-mcp/runtime-agnostic.test.js`, `interface/contract-js-exports-validate.test.js`, `interface/runtimes-pass-contract.test.js`

## Re-derived commit plan (3 commits)

1. `feat(r2): per-runtime write allowlist gate for MCP tools` — wraps `createLoopTool` with R2 gate; keys on `getPinnedRuntimeId()` (new helper). Allowlist file `.loop/r2-allowlist.json` + ownership check + path-field-detector.
2. `fix(path): LIM-4 realpath containment for user-supplied write paths` — `core/path-containment.js` + 6 audit-site migrations + regression tests.
3. `chore(surfaces): add .mastracode to SURFACES registry + contract Req #9 + Req #10` — contract + fixture + shim wiring for Mastra Code.
4. `docs(plan-5-lite): reframe report + new plan.md + tracker update` — this report + the new plan.md + the master tracker update.

(4 commits, not 3 — splitting docs from surfaces-extension keeps the `feat/fix/chore` invariants clean.)

## Open questions (to be answered during Plan 5-Lite execution; not blocking)

1. **`LOOP_SURFACE` env propagation in Mastra Code.** The followup report's R3 (Mastra Code hook stdin JSON shape) is INFERRED. The shim-wrapper approach (Mastra Code calls a tiny `.cjs` that sets `LOOP_SURFACE` and re-execs) dodges this — the shim is the contract surface, not `.mastracode/hooks.json`'s stdin shape. If even the shim invocation fails on Mastra Code, the contract validator will catch it (Req #10).

2. **Should `getPinnedRuntimeId()` throw or return null when un-pinned?** Recommend throw (process-boot failure; fail-fast). Decision in Phase 1.

3. **Does R2 need the per-call surface check, or only at write time?** Recommend only at write time (path-bearing args). Reads are not gated. Decision in Phase 1.

4. **Operator override semantics.** Document the audit-log-only override path in the operator runbook; no `RUNTIME_OVERRIDE` env var in v1. Same pattern as existing `gate-override.js`. Decision in Phase 1.

## Verification status

- 159 tests passed in the original PR #27 (Plan 5 + fixtures). Plan 5-Lite is expected to land at ~145 tests (drop ~14 LIM-3 identity tests, keep the rest).
- The original PR #27 used `--no-verify` to bypass the pre-commit hook (the followup report named this as an open issue). Plan 5-Lite should not need `--no-verify` — the LIM-3-related fixture changes that triggered the pre-commit warning are not present.
- The Mastra Code caveat (mints wrong-runtime_id token → first call denied) does not apply to Plan 5-Lite. No token, no first-call denial.

## Unresolved for next session

1. **Red-team review of the new shape.** The original PR #27 had 22 red-team findings; Plan 5-Lite drops the LIM-3-specific findings (1, 2, 4, 6, 7, 8, 9, 10, 11, 16, 17, 19) but keeps the R2 + LIM-4 findings (5, 12, 13, 14, 15, 18, 20, 21, 22). Re-running the red-team on the new shape is recommended before cook.
2. **The remaining LIM-3 (master-tracker row).** The tracker's "LIM-3" item refers to a DIFFERENT issue (`meta_state_resolve` / `meta_state_log_change` lack caller-identity check; `resolved_by: "operator"` is caller-supplied). That is a smaller-scope problem and is **not** addressed by Plan 5-Lite. Leave it as a separate hardening track.
3. **Future activation criteria for LIM-3 (the dropped item).** If/when MCP becomes network-accessible (multi-session, multi-tenant), Ed25519 caller identity is the right defense. Document the trigger condition in the operator runbook so future sessions know when to revisit.

## Notes for next session

- The threat-model review is recorded in this report. Future discussions of "should we add LIM-3?" can re-open this report rather than re-litigating the threat model.
- The followup report's Phase B (mint inside MCP) is no longer applicable — the mint primitive is removed entirely. If a future plan re-introduces LIM-3, Phase B's `loop_runtime_mint_token` tool + `exemptTools: Set<string>` exemption is the only architecturally honest implementation.
- The master tracker has been updated to reflect: "Plan 5-Lite (R2 + LIM-4 only; LIM-3 dropped per Option A threat-model review)." This keeps the canonical record aligned with the live state.

## File state at session end

**Closed:**
- PR #27 (`hardening/plan-5-r2-lim3-lim4`) — closed with comment linking to this report
- Branch `hardening/plan-5-r2-lim3-lim4` (local + remote) — deleted

**Created (this session, on `main`):**
- `plans/260701-2250-plan-5-lite-r2-lim4/plan.md` (the new plan)
- `plans/reports/from-ask-to-planner-reframe-260701-2250-GH-5-plan-5-lite-r2-lim4-report.md` (this report)
- Update to `plans/reports/productization-260612-1530-master-tracker.md` (Plan 5 row → Plan 5-Lite; Recommended next move updated; LIM-3 dropped from "Next-up / Hardening")

**Pending:**
- New branch `hardening/plan-5-lite-r2-lim4` (created in this session; commits to be made)
- Red-team review of the new shape
- Cook session to implement the 3 phases
