---
phase: 2
title: "Write-path exit codes + structured stderr + write parity"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Write-path exit codes + structured stderr + write parity

## Overview

Lock the write-path error contract (exit 1 + structured JSON on stderr for rejections;
exit 2 stays for usage/caller-config) and prove CLI writes are byte-structural parity
with the direct handler call and the MCP server. Tests first per `--tdd`.

## Requirements

- Functional:
  - A write denied by R2 / record-writer validation / a handler-layer rejection returns
    **exit 1** with a structured `{error, code, reason}` JSON object on **stderr** (not a
    stack trace) carrying a **stable `code`** the agent can branch on. The agent can parse
    it, fix args, and retry.
  - A handler/transport **bug** (TypeError, ReferenceError, plain Error with no stable code)
    returns **exit 1** with `{error: "InternalError", reason, internal: true}` — distinct
    shape so the agent does NOT loop retrying by fixing args.
  - Usage and caller-configuration errors (missing/invalid `LOOP_SURFACE`, bad JSON,
    `ZodError`, identity-pin preconditions) stay **exit 2** with the existing
    `loop.mjs: <message>` stderr line.
  - `meta_state_report` / `meta_state_resolve` / `meta_state_batch` /
    `meta_state_patch` / `meta_state_log_change` run via `bin/loop.mjs` against a seeded
    tmpdir produce the same persisted registry state as the direct handler call and the
    MCP server (write-parity).
- Non-functional:
  - No new error class for rejections — reuse the handler's existing thrown errors; the
    CLI's top-level catch distinguishes `UsageError`/identity-pin (exit 2) from everything
    else (exit 1) and serializes the latter as JSON.
  - Parity comparison is structural, stripping the same non-deterministic fields as
    `cli-read-parity.test.js` (timestamps, fingerprints, timing) and normalizing
    `evidence_code_ref` root prefixes.

## Architecture

- `bin/loop.mjs` top-level catch: today it writes `err.stack || err.message` to stderr on
  exit 1. For write-path rejection, serialize a structured object — **but split the non-usage
  branch into two shapes** so the agent's recovery policy can tell a real rejection from a
  transport/handler bug:
  - **Recognized rejection** — the error carries a stable `code`/`name` from the record-writer
    or R2 denial (e.g. `version_mismatch`, `path_containment_violation`, `r2_denied`,
    `cross_runtime_write_denied`, `ledger_append_failed`). → exit 1 +
    `{error: <name>, code: <code>, reason: <message>}`. Agent policy: parse, fix args,
    retry.
  - **Unrecognized error** — `TypeError`, `ReferenceError`, plain `Error` with no stable
    code (a programmer/transport bug). → exit 1 + `{error: "InternalError", reason:
    <message>, internal: true}`. Agent policy: do NOT retry by fixing args — file a bug.
  - `UsageError` + `isIdentityPinError` stay on the existing exit-2 human-readable path.
  Do not introduce a new class hierarchy (KISS); classify by the error's existing
  `name`/`code` against a known-rejection allowlist in the catch (or a small
  `isRejectionError(err)` predicate). The record-writer/R2 denial errors already carry
  stable codes — enumerate them from `core/record-writer.js` + `core/r2/` when implementing.
- Write-parity test (`cli-write-parity.test.js`): mirrors `cli-read-parity.test.js` — for
  each write tool, run direct-handler vs CLI (`spawnSync`) vs MCP against **independent**
  seeded tmpdirs, then compare the persisted files the tool touches. **Comparator scope** —
  grep each write handler for `appendGateLog` / `appendLedgerEvent` / `writeEntry` /
  `updateEntry` and include every file it touches: `meta-state.jsonl`, `change-log.jsonl`,
  `runtime-state.jsonl` (dispatch commit, `runtime_state_record`), and `gate-log.jsonl`
  (promote, dispatch, resolve, log_change all append). Document any file excluded and why.
  Independent roots because `appendGateLog` and fingerprint auto-record leak across a shared
  root (same reason as reads).
- **Write-specific strip/normalize set** (differs from reads): strip `created_at`,
  `updated_at`, `promoted_at`, `dispatched_at`, `timestamp`, `fingerprint`,
  `fingerprint_was_recorded`, and all `*_at` fields; normalize root prefixes in
  `evidence_code_ref`. `version` is an auto-incrementing per-id counter — it is
  deterministic **only** because both tmpdirs seed identical existing rows for the id; confirm
  parity holds given identical seeds, else strip `version` and compare per-entry semantically
  (not byte-wise). `_expected_version` is a write-arg, not a persisted field — it must not
  appear in the comparator.

## Related Code Files

- Modify: `tools/learning-loop-mastra/bin/loop.mjs` (structured stderr on exit 1)
- Create: `tools/learning-loop-mastra/__tests__/cli-write-parity.test.js`
- Create: `tools/learning-loop-mastra/__tests__/cli-write-exit-codes.test.js`
- Read (pattern source): `tools/learning-loop-mastra/__tests__/cli-read-parity.test.js`,
  `tools/learning-loop-mastra/__tests__/with-mcp-server.js`

## Implementation Steps (TDD)

1. **Test — exit-code contract.** Create `cli-write-exit-codes.test.js`:
   - `meta_state_report` with a valid args JSON → exit 0, result JSON on stdout.
   - `meta_state_report` with bad JSON → exit 2, human-readable stderr (existing).
   - `meta_state_report` with an arg that fails handler validation (e.g. invalid
     `affected_system` enum) → exit 1, **parsed JSON** on stderr with `error` + `code`/`reason`
     (recognized rejection).
   - A handler crash simulated by a throw with no stable code → exit 1, `{error:
     "InternalError", internal: true}` (not retriable by arg-fixing).
   - Missing `LOOP_SURFACE` → exit 2 (existing identity-pin path).
   Run → red (today exit 1 emits a stack trace, not JSON; and the two non-usage shapes are
   not distinguished).
2. **Implement structured stderr + classification.** In `bin/loop.mjs` catch, branch: if
   `UsageError`/`isIdentityPinError` → exit 2 human line (unchanged); else classify by the
   error's `name`/`code` against the known-rejection set (enumerate from `record-writer.js`
   + `core/r2/`) → recognized-rejection JSON or `InternalError` JSON, exit 1. Run exit-code
   test → green.
3. **Test — write parity scaffolding.** Create `cli-write-parity.test.js` with the
   independent-tmpdir seeding helper adapted from the read-parity test and the write-specific
   strip/normalize set. Start with one tool (`meta_state_report`): direct vs CLI vs MCP,
   compare every persisted file it touches (`meta-state.jsonl`, `change-log.jsonl`,
   `gate-log.jsonl`). Run → red (parity not yet verified for writes).
4. **Add the remaining write tools** to the parity matrix: `meta_state_resolve`,
   `meta_state_patch`, `meta_state_log_change`, `meta_state_batch` (small op array),
   `meta_state_supersede`, `meta_state_archive`, `meta_state_dispatch_finding` (prepare +
   commit), `runtime_state_record`. For each, include `runtime-state.jsonl` where relevant.
   Run → green. If a drift appears, it is a real transport bug — fix the handler path, do
   not weaken the test.
5. **Cross-check exit 1 on a real denial.** Construct a case that triggers a record-writer
   / R2 denial via CLI (e.g. cross-runtime write denied, CAS `version_mismatch`) and assert
   exit 1 + recognized-rejection JSON with the stable `code`. Lock it in the exit-code test.

## Success Criteria

- [ ] `cli-write-exit-codes.test.js` passes: exit 0 success / exit 2 usage+caller-config /
      exit 1 recognized-rejection (with stable `code`) / exit 1 `InternalError` (`internal: true`).
- [ ] `cli-write-parity.test.js` passes for the write tools: CLI persisted state is
      byte-structural parity with direct handler and MCP.
- [ ] A real write denial surfaces as exit 1 + parseable JSON, not a stack trace.
- [ ] `pnpm test` green; no regression to read-parity or read exit-code tests.

## Risk Assessment

- **Rejection vs bug conflation (H1)** — wrapping any non-usage error as one shape would
  make the agent retry programmer bugs by fixing args. Mitigation: two shapes keyed on a
  stable `code` allowlist; `internal: true` means "file a bug, do not retry by arg-fixing."
  Document the agent recovery policy in the `--schema`/hint surface (Phase 3).
- **Parity false-negative from seeding (H2)** — write tools append gate-log rows and
  runtime-state ledger events that leak across shared roots; `version`/`*_at`/`fingerprint`
  are non-deterministic across run order. Mitigation: independent tmpdirs per side; the
  write-specific strip/normalize set; include `gate-log.jsonl` + `runtime-state.jsonl` in
  the comparator. If `version` cannot be stabilized, switch that tool's comparison to
  per-entry semantic (not byte) and document why.
- **Stable-code allowlist drift** — a new rejection reason added to the record-writer
  without updating the catch's allowlist would be misclassified as `InternalError`.
  Mitigation: derive the allowlist from the record-writer/R2 module's exported error codes
  where possible, or add a test that greps for thrown `code` values and asserts each is in
  the allowlist.