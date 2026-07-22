---
phase: 4
title: "Contract activation + dogfood + T2 write-path evidence"
status: pending
priority: P2
effort: "0.5d"
dependencies: [1, 2, 3]
---

# Phase 4: Contract activation + dogfood + T2 write-path evidence

## Overview

Activate the contract (`docs/runtime-contract.md` L25 — write-capable CLI is a wired
transport, not a future option), dogfood the write channel on `.claude`, accrue write-path
T2 evidence, and close finding `meta-260721T0809Z`. This is the evidence gate that
generalizes W beyond one runtime.

**Sequencing is load-bearing (red-team C1).** Do NOT flip to `LOOP_RECORDS_VIA_CLI=1`
before T2 write-path evidence accrues. Dogfood CLI writes **while MCP writes remain
available as a fallback** — `.claude` keeps R's `LOOP_READS_VIA_CLI=1` (reads via CLI, MCP
writes still wired) and the agent chooses CLI writes by choice. Only after multiple clean
CLI-write sessions, migrate `.mcp.json` to the combined `LOOP_RECORDS_VIA_CLI=1` flag,
which drops MCP writes on top of the already CLI-routed reads. Flipping first creates a
chicken-and-egg: if the CLI write path has an undiagnosed bug, the agent cannot record the
positive change-log, cannot file the fallback `loop-anti-pattern` finding, and cannot
resolve `meta-260721T0809Z` — all of which require a write.

## Requirements

- Functional:
  - `docs/runtime-contract.md` L25/L26 names the write-capable CLI as a wired transport
    ("is", not "would be"), **framed as an example realization** so the L5 transport-agnostic
    framing ("names no specific transport") stays intact; the opt-out bullet gains a
    sentence: a runtime may route the record surface (reads + writes) via `bin/loop.mjs`
    (`LOOP_RECORDS_VIA_CLI=1`).
  - `.claude` dogfoods real CLI writes across sessions **before** the combined flag is flipped.
  - After T2 write-path evidence accrues, `.mcp.json` (repo root) migrates from
    `LOOP_READS_VIA_CLI=1` to `LOOP_RECORDS_VIA_CLI=1`.
  - A positive change-log entry is recorded after multiple clean CLI-write sessions (no
    arg-shape failures, no stderr-recovery loops, no exit-1-vs-2 confusion, no
    `InternalError` hits).
  - Finding `meta-260721T0809Z` is resolved (with `cascade_from` if it reopens a stale
    parent); its `evidence_code_ref` points at the activated contract line / `bin/loop.mjs`.
- Non-functional:
  - No code changes in this phase beyond the `.mcp.json` flag migration — mechanism landed
    in 1-3.
  - Dogfood is real use, not a synthetic one-shot.
  - W ships for `.claude` only; `.factory`/`.mastracode` generalization is a separate
    evidence gate, not claimed by this finding's closure.

## Architecture

- Contract edit is prose-only in `docs/runtime-contract.md`:
  - L26 "Shell-hook-only transport" bullet currently says a write-capable CLI *would be* the
    smallest Capability-3 transport "named here as a future option, not wired today." Flip
    to "is", reference `bin/loop.mjs` + `LOOP_RECORDS_VIA_CLI`, and frame it as **an example
    realization of Capability 3 on a non-MCP transport** (so L5's "names no specific
    transport" and L9's "no correctness-critical state" claims remain true — the CLI is
    stateless over the same L1 core).
  - The read-only-CLI bullet (L24) opt-out sentence gains: "A runtime may also set
    `LOOP_RECORDS_VIA_CLI=1` to route the full record surface (reads + portable mutation
    tools) through `bin/loop.mjs` and drop them from its MCP surface."
  - Update "Current transports" (L42) to note `.claude` dogfoods the write channel.
- `.claude` config: the file is **`.mcp.json` at the repo root** (NOT `.claude/.mcp.json`,
  which does not exist — red-team C1). It currently carries `LOOP_READS_VIA_CLI: "1"`.
  Migrate to `LOOP_RECORDS_VIA_CLI: "1"` **only after** step 3 evidence (remove the
  reads-only flag, add the combined flag). `.factory` / `.mastracode` untouched (full MCP
  surface) — they graduate later, each via its own evidence.
- Evidence + closure: record the positive change-log and resolve `meta-260721T0809Z` via
  whichever write channel is active at closure time. Before the flag migration, MCP writes
  are still available, so closure records can go via MCP (parity tests already proved
  equivalence). After the migration, closure records go via CLI — the dogfood itself proves
  this works. Run `meta_state_derive_status({ id: "meta-260721T0809Z" })` first to confirm
  the finding is still open and grounded.

## Related Code Files

- Modify: `docs/runtime-contract.md` (L24, L26, L42)
- Modify: `.mcp.json` (repo root — migrate `LOOP_READS_VIA_CLI` to `LOOP_RECORDS_VIA_CLI`
  **after** dogfood evidence)
- No source code changes.

## Implementation Steps

1. **Contract edit.** Update `docs/runtime-contract.md` L24, L26, L42 per Architecture.
   Re-read the file first; verify the L5 "names no specific transport" framing and L9 "no
   correctness-critical state" claim stay consistent with the activated bullet (frame the
   CLI as an example realization, stateless over L1).
2. **Dogfood with MCP fallback (no flag migration yet).** Over the next `.claude` sessions,
   perform real meta-state writes via `bin/loop.mjs` (`meta_state_report`,
   `meta_state_resolve`, `meta_state_log_change`, `meta_state_batch`,
   `meta_state_dispatch_finding` prepare) **by choice**, while MCP writes remain wired as a
   fallback (`.claude` still has `LOOP_READS_VIA_CLI=1`; reads via CLI, writes via MCP
   available). Note per the T2 write-path protocol:
   - arg-composition friction (could the JSON string be built cleanly?);
   - stderr-recovery: did any rejected write produce parseable JSON with a stable `code`?
     did any `InternalError` fire (a real bug, not an arg fix)?
   - exit-code confusion: exit 1 vs 2 misread?
   - missing hint/`--schema` need.
3. **Record evidence.** After multiple clean sessions, record a positive
   `meta_state_log_change` change-log entry citing `bin/loop.mjs` + the contract line as
   `evidence_code_ref`. If a failure recurs, file a `loop-anti-pattern` finding instead and
   do NOT proceed to step 4.
4. **Migrate the opt-out flag (now safe).** In `.mcp.json` (repo root), replace
   `LOOP_READS_VIA_CLI: "1"` with `LOOP_RECORDS_VIA_CLI: "1"`. The MCP record surface
   (reads + writes) drops for `.claude`; subsequent record operations go via CLI. Confirm
   against the `cli-mcp-subset-registration.test.js` shape (MCP list excludes every
   `CLI_TOOLS` member, keeps `update_r2_allowlist` + workflow tools).
5. **Close the finding.** `meta_state_derive_status({ id: "meta-260721T0809Z" })` to confirm
   open, then `meta_state_resolve({ id: "meta-260721T0809Z", resolution: "Write-capable CLI
   shipped + dogfooded on .claude; record surface on CLI transport for .claude, MCP kept
   for workflow/storage/allowlist. .factory/.mastracode generalize via their own evidence.",
   cascade_from: [...] })`. If the finding reopens a stale parent, include it in
   `cascade_from`.
6. **Generalize (forward, not in this plan).** Note in the change-log that `.factory` /
   `.mastracode` graduate by setting the same flag after their own dogfood — out of scope
   here; the finding closure claims `.claude` only.

## Success Criteria

- [ ] `docs/runtime-contract.md` names the write-capable CLI as a wired transport (example
      realization framing); opt-out bullet covers the combined records flag; "Current
      transports" updated; L5/L9 consistent.
- [ ] Multiple clean `.claude` CLI-write sessions **with MCP fallback still wired**; no
      recurring ergonomics failure (or a `loop-anti-pattern` finding filed and step 4 held).
- [ ] Positive change-log entry recorded with `evidence_code_ref`.
- [ ] `.mcp.json` carries `LOOP_RECORDS_VIA_CLI=1` (and no longer `LOOP_READS_VIA_CLI=1`)
      **after** the evidence; MCP record surface dropped for `.claude` (verified against the
      registration test shape).
- [ ] `meta-260721T0809Z` resolved (closure claims `.claude` only); `meta_state_derive_status`
      confirms closed.

## Risk Assessment

- **Chicken-and-egg (C1) — mitigated by ordering.** Dogfood precedes the flag migration;
  MCP writes remain a fallback until T2 passes. If the CLI write path has a bug, the agent
  can still record the fallback finding / change-log via MCP. Do not migrate-then-dogfood.
- **Dogfood surfaces a real ergonomics failure** — that is the point of T2. File the
  `loop-anti-pattern` finding and do **not** resolve `meta-260721T0809Z` or migrate the flag
  until it is addressed. W stays "shipped but not yet generalized" — honest state.
- **Closure premature** — resolving `meta-260721T0809Z` before write-path T2 accrues would
  repeat R's "completion ≠ evidence" trap. Gate the resolution + flag migration on the
  dogfood evidence, not on Phase 1-3 landing.
- **Closure over-claim** — the finding must not claim all runtimes migrated; `.claude` only.
  State the `.factory`/`.mastracode` generalization as a separate evidence gate.