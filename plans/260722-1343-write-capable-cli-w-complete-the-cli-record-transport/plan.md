---
title: "Write-capable CLI (W) — complete the CLI record transport"
description: "Extend bin/loop.mjs from read-only to read+write so a runtime can drop the MCP record surface entirely (reads+writes via CLI), closing the split-transport left by R (260722-1103). Adds the promotion-path self-footgun guard, write-path exit-code/stderr contract, --schema pull flag, write-hint renderer, and contract L25 activation. Closes finding meta-260721T0809Z."
status: completed
priority: P1
effort: "3-4d"
tags: [cli-transport, meta-state, runtime-agnostic, transport-diversification]
created: 2026-07-22
blockedBy: []
---

# Write-capable CLI (W) — complete the CLI record transport

## Overview

R (plan `260722-1103`, shipped at commit `9544084`) made `.claude` read the 7 loop
read-tools via `bin/loop.mjs` and keep MCP for writes. That is a **split transport**:
the MCP server descriptor + write-tool schemas stay in model context because writes
still need MCP, so the context-size win is only half-realized and the agent reasons in
two command shapes against one registry.

W makes the CLI a **complete** transport for the record surface: the same `bin/loop.mjs`
does reads **and** writes. A runtime that sets the write opt-out drops the MCP record
tools from its surface entirely, keeping MCP only for the irreducible residue
(workflow registry, storage, `update_r2_allowlist`). The split-brain closes.

This is the follow-on documented in
`plans/reports/ak-problem-solving-260722-1040-write-capable-cli-w-approach.md` and the
decided defaults in `plans/reports/w-design-decisions-260722-1119-write-cli-prep.md`.
It closes the open finding `meta-260721T0809Z` (transport diversification to a CLI).

**Not a greenlight from R's completion.** W unblocks on R's *evidence* (read-path T2),
then adds its own evidence requirement (write-path T2). See Preconditions.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `bin/loop.mjs` carries every CLI-portable mutation tool (read + write), reusing the same handler/R2-gate/lock code path as MCP | P1 |
| 2 | A runtime can drop the MCP record surface (reads+writes via CLI) via a per-runtime env var, keeping MCP for workflow/storage/allowlist only | P1 |
| 3 | The promotion-path self-footgun is guarded: a gate regex matching canonical CLI invocation shapes cannot be promoted | P1 |
| 4 | Write rejections surface as exit 1 + structured JSON on stderr with an actionable recovery path (`--schema`) | P1 |
| 5 | Contract `docs/runtime-contract.md` L25 flips from "would be" to "is" and the opt-out bullet covers writes | P2 |
| 6 | `.claude` dogfoods the write channel; write-path T2 evidence accrues; finding `meta-260721T0809Z` closes | P2 |

## Preconditions (evidence gate, not code)

W is **evidence-blocked, not code-blocked**. Phase 1 may start coding only after:

1. **Read-path T2 evidence accrued** on `.claude` (R's dogfood): multiple clean CLI-read
   sessions with no chronic absent-tool calls, no JSON-arg/stdout-parse friction, no
   exit-1-vs-2 confusion. Bar defined in
   `plans/reports/implementation-260722-1119-mcp-read-optout.md` § "T2 read-path evidence
   protocol". If a read-path ergonomics failure recurs, file the `loop-anti-pattern`
   finding per that protocol **before** drafting W's code phases.
2. **Operator confirmation** of the W tool-set boundary and dogfood choice (defaults
   below; confirmed at W-plan time):
   - Tool set: **all CLI-portable handler-module mutation tools** (not the onramp's 6).
   - `meta_state_promote_rule`: included **only because** Phase 1 adds the self-footgun
     guard. If the guard is dropped, `meta_state_promote_rule` stays MCP-only.
   - `meta_state_dispatch_finding`: **both** `prepare` and `commit` via CLI (the handler
     does not call `gh`; the agent runs `gh issue create` between stages).
   - `update_r2_allowlist`: stays MCP-only (operator-only, not a handler module).
   - Write-denial exit code: **exit 1** (handler-layer rejection); exit 2 stays for
     usage/caller-config.
   - `--schema`: pull-on-demand (`loop.mjs <tool> --schema`).
   - Dogfood runtime: **reuse `.claude`** (extends R's evidence stream).

If the operator has not yet confirmed these, treat Preconditions as the gate and do not
start Phase 1. This plan records the recommended defaults so the operator can confirm by
approving the plan.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Self-footgun guard + CLI write tool-set + MCP write opt-out](./phase-01-start.md) | Pending | Preconditions |
| 2 | [Write-path exit codes + structured stderr + write parity](./phase-02-write-path-exit-codes-structured-stderr-write-parity.md) | Pending | 1 |
| 3 | [Write-hint renderer + schema pull flag](./phase-03-write-hint-renderer-schema-pull-flag.md) | Pending | 1 |
| 4 | [Contract activation + dogfood + T2 write-path evidence](./phase-04-contract-activation-dogfood-t2-write-path-evidence.md) | Pending | 1, 2, 3 |

Phase 3 is independent of Phase 2 and may run in parallel with it; both depend on Phase 1.
Phase 4 (dogfood) depends on the mechanism landing in 1–3.

## Architecture (delta over shipped read-only CLI)

The shipped CLI (`bin/loop.mjs`, `core/cli-tools.js`) already reuses
`pinRuntimeIdAtBoot` + `normalizeInputSchema` + `adaptLegacyHandler` + `withR2Gate({pathFields:[]})`
— the **same code path as MCP**. Every manifest entry has `pathFields: []` (fixed
internal write paths resolved from the runtime pin + root, not user path args), so the
R2 gate short-circuits to allow for writes too. W's mechanical delta is small:

- `core/cli-tools.js`: `CLI_READ_TOOLS` → `CLI_TOOLS` = `CLI_READ_TOOLS ∪ CLI_WRITE_TOOLS`.
  One source of truth for the CLI allowlist and the MCP exclusion set.
- `bin/loop.mjs`: accept any tool in `CLI_TOOLS`; keep exit 0/1/2 contract; add `--schema`.
- `mastra/server.js`: add a **single combined flag** `LOOP_RECORDS_VIA_CLI`; when set,
  exclude every `CLI_TOOLS` member (reads + writes) from the MCP surface. R's existing
  `LOOP_READS_VIA_CLI` / `CLI_READ_TOOLS` block stays for reads-only backward compat; W's
  mechanism is the combined flag, and `.claude` migrates from `LOOP_READS_VIA_CLI=1` to
  `LOOP_RECORDS_VIA_CLI=1` at the Phase 4 flag-flip (drops MCP writes on top of the already
  CLI-routed reads).
- `tools/handlers/meta-state-promote-rule-tool.js`: add a transport-self-match guard in the
  **activation branch** — after the `rule_id_already_active` check (~line 190) and before
  `writeEntry(root, ruleEntry)` (~line 212). Reject a `regex` rule whose pattern matches
  CLI invocation shapes. NOTE: `isSafeRegexPattern` lives ONLY in the preview branch
  (line 119); the activation branch has no regex safety check today, so the guard is net-new
  there (and a pre-existing ReDoS gap worth noting). Locked as *unguarded* today by
  `__tests__/cli-self-footgun-guard.test.js`; Phase 1 flips that test to assert rejection.
- `docs/runtime-contract.md` L25/L26 + opt-out bullet: activate the write-capable CLI as
  a real transport ("is", not "would be"), framed as an example realization so the L5
  transport-agnostic framing stays intact.

**`CLI_WRITE_TOOLS` (enumerated — the record-surface mutation handlers):**
`meta_state_report`, `meta_state_resolve`, `meta_state_promote_rule` (post-guard),
`meta_state_log_change`, `meta_state_patch`, `meta_state_batch`, `meta_state_archive`,
`meta_state_supersede`, `meta_state_propose_design`, `meta_state_ship_loop_design`,
`meta_state_dispatch_finding` (**both** `prepare` and `commit` — see below),
`meta_state_re_verify`, `meta_state_refresh_file_index`, `runtime_state_record`,
`gate_mark_preflight`, `gate_override`. All are handler modules with `pathFields: []`.

**`dispatch_finding` `commit` is CLI-portable.** The handler does NOT call `gh` —
`handleCommitStage` only does `appendLedgerEvent` + `updateEntry`; the *agent* runs
`gh issue create` between `prepare` and `commit` (handler comment line 14). So both stages
ride the CLI; the `gh`/network step stays the agent's, outside the tool call.

**Auxiliary read-ish tools stay MCP for W (out of scope):** `gate_check`,
`gate_check_recurrence`, `meta_state_sweep`, `meta_state_query_drift`,
`meta_state_relationship_validate`. These are not in the 7 reads and not mutation
handlers; they are neither side of the split-brain, so leaving them on MCP does not
re-open it. A follow-up may add them to `CLI_READ_TOOLS` if a runtime wants the full
surface; not required to close the split.

**Excluded from CLI (stay MCP):** `run_workflow_*` (Mastra registry), `workflow_storage_*`
(`initStorage`, server-bound), `update_r2_allowlist` (inline in `server.js`), and
`check_runtime_agnostic` (audit tool). These plus the auxiliary read-ish tools
(`gate_check`, `gate_check_recurrence`, `meta_state_sweep`, `meta_state_query_drift`,
`meta_state_relationship_validate`) are the MCP residue after both opt-out flags are set —
the non-record workflow/storage/allowlist surface is irreducible; the auxiliary tools stay
MCP until a follow-up adds them to `CLI_READ_TOOLS`.

## Success Criteria

- [ ] `bin/loop.mjs` executes every `CLI_WRITE_TOOLS` entry against a seeded tmpdir with
  byte-structural parity to the direct handler call and the MCP server (write-parity test
  mirrors `__tests__/cli-read-parity.test.js`).
- [ ] `cli-self-footgun-guard.test.js` asserts a self-matching gate regex is **rejected**
  by the promotion path (flipped from today's "accepted + intercepts" lock).
- [ ] `cli-bash-gate-guard.test.js` extended: `node bin/loop.mjs meta_state_report '{…}'`
  passes as `ok`; write-redirect variant still `block`.
- [ ] Write denials (R2 denial / record-writer validation) return exit 1 + structured
  `{error, …}` JSON on stderr; usage/caller-config errors stay exit 2.
- [ ] `loop.mjs <tool> --schema` prints the zod input schema on demand (pull, not push).
- [ ] `LOOP_RECORDS_VIA_CLI=1` drops every `CLI_TOOLS` member (reads + writes) from the MCP
  surface; the MCP record surface is gone (parity with `cli-mcp-subset-registration.test.js`).
- [ ] `check_runtime_agnostic` passes on `bin/loop.mjs`, `core/cli-tools.js`, and the
  `server.js` opt-out block (runtime-agnostic, shim-not-fork).
- [ ] `docs/runtime-contract.md` L25 names the write-capable CLI as a wired transport;
  opt-out bullet covers writes.
- [ ] `.claude` accrues write-path T2 evidence (clean CLI-write sessions); positive
  change-log recorded; finding `meta-260721T0809Z` resolved (cascade-close per its
  reopens chain if applicable).

## Risk Assessment

- **Blast radius — shared registry mutation.** A CLI-write bug (wrong runtime pin,
  mis-serialized batch) corrupts meta-state the whole loop reads. Mitigation: mutations
  are already bound by `assertinvariant` wrappers + record-writer validation
  transport-agnostically; write-parity tests against MCP responses must pass before
  dogfood. No new mutation path is created — W reuses the existing handler path.
- **Self-footgun.** A CLI runtime promoting a gate regex that matches `node …/bin/loop.mjs`
  bricks its own transport. Phase 1 adds the guard; the existing lock test flips to prove
  it. If the guard proves too narrow/broad, fall back to excluding
  `meta_state_promote_rule` from `CLI_WRITE_TOOLS` (documented escape hatch).
- **Ergonomics — write arg richness.** `meta_state_report` / `meta_state_batch` schemas
  are richer than read args; a Bash one-shot must compose them as a JSON string and parse
  a stderr rejection. Mitigation: `--schema` pull flag + per-tool one-line arg sketch in
  hints; T2 write-path evidence is the real gate (Phase 4).
- **Opt-out flag shape (decided).** One combined flag `LOOP_RECORDS_VIA_CLI` drops the
  full `CLI_TOOLS` set; `LOOP_READS_VIA_CLI` stays for R's reads-only runtimes (contract
  preserved). `.claude` migrates to the combined flag at Phase 4.

## Open Questions

1. **Opt-out flag shape — RESOLVED (operator):** one combined flag `LOOP_RECORDS_VIA_CLI`
   drops the full `CLI_TOOLS` set; `LOOP_READS_VIA_CLI` stays for R's reads-only runtimes.
   `.claude` migrates to the combined flag at Phase 4.
2. **Self-footgun guard scope (operator confirm):** reject only canonical
   `node …/bin/loop.mjs` shapes, or any regex that matches the CLI bin path broadly?
   Plan defaults to **canonical shapes** (the forms `cli-self-footgun-guard.test.js`
   already enumerates). Confirm; the escape hatch is excluding `meta_state_promote_rule`.
3. **`meta_state_dispatch_finding` both stages via CLI** — verified: `commit` does not
   call `gh` (the agent does, between stages). Default: include both. Confirm.

## References

- Approach: `plans/reports/ak-problem-solving-260722-1040-write-capable-cli-w-approach.md`
- Decided defaults: `plans/reports/w-design-decisions-260722-1119-write-cli-prep.md`
- T2 evidence protocol: `plans/reports/implementation-260722-1119-mcp-read-optout.md` § T2
- Predecessor (R): `plans/260722-1103-mcp-read-opt-out-to-cli-r-write-capable-cli-w-prep/`
- Predecessor (read-only slice): `plans/260721-1933-cli-transport-phase1-read-only-slice/`
- Open finding: `meta-260721T0809Z` (transport diversification to a CLI)