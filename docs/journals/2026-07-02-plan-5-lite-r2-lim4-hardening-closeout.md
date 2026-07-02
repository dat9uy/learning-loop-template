# Plan 5-Lite Closeout — R2 per-runtime write allowlist + LIM-4 realpath path containment

**Date**: 2026-07-02 14:37
**Severity**: High
**Component**: MCP tool write-authorization gate, evidence-path resolution, audit-log integrity, runtime identity pinning
**Status**: Resolved

## What Happened

Shipped the hardening slice on branch `hardening/plan-5-lite-r2-lim4` as commit `c58a8c8` (68 files, +4242/-154). 1501 tests pass, 0 fail, 1 intentional pre-existing skip. Pre-commit ran `pnpm test && pnpm fallow:gate` cleanly with no `--no-verify`. Not pushed yet.

Three things landed together:
- **R2 — per-runtime write allowlist.** MCP tools now go through `withR2Gate` (via `createLoopTool`) which checks `.loop/r2-allowlist.json` per runtime. `validateToolManifest` at boot enforces default-deny on any tool missing `pathFields`, so a misconfigured manifest fails loud at startup instead of silently widening later.
- **LIM-4 — realpath path containment.** `resolveSafePath` rejects traversal, symlink, and hardlink escape. It was migrated into the 7 evidence-resolution audit sites, and audit-log JSONL writes now realpath pre-resolve plus assert no newlines (kills JSONL-injection at the source).
- **Identity pinning (replaces dropped LIM-3).** Runtime identity is pinned from `LOOP_SURFACE` at server boot and frozen for the process lifetime (no setter). LIM-3's Ed25519 caller identity was dropped after a threat-model review — it collapses in local-stdio-MCP where there's one trusted caller; identity pinning gives the same boundary without crypto theater.

The surfaces registry was extended to `.mastracode`, the interface contract grew 3 new requirements, and `docs/security/plan-5-hardening.md` now carries the gating chain, allowlist schema, and an operator runbook, plus a system-architecture subsection.

## The Brutal Truth

This is the kind of hardening work that's easy to half-do: 6 of 7 audit sites correct, 1 silently wrong. The mandatory code-review subagent caught exactly that — and the one wrong site (`meta-state-refresh-fingerprint-tool.js`) would have thrown `PathContainmentError` out of the handler on a missing evidence file *inside* root, returning a stack trace instead of the documented `code_missing` JSON. That's a real production posture regression hiding behind a "we migrated all 7 sites" claim. Without the focused site-by-site review, the green test suite would have shipped it. The test suite was green because no test exercised the missing-file-inside-root path for that one tool.

## Technical Details

- `withR2Gate` / `createLoopTool`: per-tool write-authorization gate reading `.loop/r2-allowlist.json`.
- `validateToolManifest`: boot-time default-deny on missing `pathFields`.
- `resolveSafePath`: realpath-based containment; rejects traversal/symlink/hardlink escape.
- Audit-log hardening: realpath pre-resolve + newline assert before JSONL append.
- Identity: `LOOP_SURFACE` read once at boot, frozen (no setter) for process lifetime.
- Surfaces registry extended to `.mastracode`; 3 new interface-contract requirements added.
- Review-found regression: `meta-state-refresh-fingerprint-tool.js` was the lone audit site missing the ENOENT-preservation `try/catch`. Fix used `pathResolve` (not the raw pattern the banned-pattern grep guard watches for) to mirror the other 6 sites. Regression test added: `refresh_fingerprint_missing_file_inside_root_returns_code_missing`.

## What We Tried

- Migrated `resolveSafePath` into all 7 evidence-resolution audit sites. 6 used the same ENOENT-preservation pattern; 1 did not. Tests passed anyway because the missing-file-inside-root branch for that tool was unexercised.
- Mandatory code-review subagent ran the site-by-site audit and flagged the gap as HIGH severity. Fixed and added a regression test pinning the documented `code_missing` behavior.

## Root Cause Analysis

The 6-of-7 gap is the load-bearing lesson. "We applied the same change to N call sites" is a claim that needs per-site verification, not an aggregate confidence. The migration pattern had a silent exception at one site, the test suite didn't cover that site's missing-file-inside-root branch, and the only thing that caught it was a reviewer reading the diff site-by-site. The green suite was false comfort.

## Lessons Learned

- **N-of-N migrations need per-site review, not aggregate claims.** "All 7 sites migrated" is a lie if 1 is subtly wrong. Review each site against the pattern, not just the count.
- **Green tests prove coverage, not correctness.** The missing-file-inside-root branch for `meta-state-refresh-fingerprint-tool.js` was untested, so the regression compiled and passed. Add the regression test that would have caught it, not just the fix.
- **Drop crypto that doesn't fit the threat model.** LIM-3 Ed25519 caller identity was attractive on paper and useless under local-stdio-MCP. Identity pinning gives the same boundary without the ceremony. Threat-model review before implementation, not after.
- **Inject config through the simplest path that exists.** Wiring `LOOP_SURFACE` via the `mcp.json` `env` field (3 runtimes) dropped a planned `.cjs` shim and an escape hatch with it. The simpler wiring was already there; the original plan over-engineered it.

## Next Steps

- **Push the branch and open the PR.** Commit `c58a8c8` is local-only.
- **Follow-up plan for the 5 deferred source files** that still hard-code the 2-surface list and don't cover `.mastracode`: `hooks/legacy/inbound-gate.js:36`, `tools/legacy/mark-preflight-complete-tool.js`, `core/evaluate-bash-gate.js` (`PATH_WRITE_PATTERNS`), `core/runtime-agnostic-checklist.js` (`SHIM_DIRS`), `core/gate-override.js` (comment only). These are NOT regressions — Phase 3 C3 scope enumerated only test files — but they are now the obvious next slice. Documented in `docs/security/plan-5-hardening.md` § Out-of-Scope.
- **Keep the audit-site-by-site review pattern** for any future N-site migration. It's the only thing that caught the one that mattered.