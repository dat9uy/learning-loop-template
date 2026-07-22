---
title: "Runtime-state versioned dedup + per-surface tracking toggle"
description: "Resolve meta-260722T0006Z — runtime-state.jsonl has two coupled maintenance gaps: (GAP 1) no versioned dedup, so re-recording the same row id appends stale duplicates that reads return up to 20 copies of; (GAP 2) no per-surface tracking toggle, so vendored surfaces (vnstock) pollute the loop's ledger with non-actionable rows. TDD-structured; the two gaps ship as separate commits in one plan."
status: pending
priority: P1
effort: "1.5-2d"
tags: [runtime-state, dedup, versioning, tracking-toggle, mcp-tool, tdd, meta-state]
created: 2026-07-22
blockedBy: []
---

# Runtime-state versioned dedup + per-surface tracking toggle

## Overview

`runtime-state.jsonl` is the mutable sidecar for runtime state (ledger events + budget
states). Finding `meta-260722T0006Z-runtime-state-jsonl-has-two-coupled-maintenance-gaps-that-le`
(`loop-anti-pattern`, subtype `runtime-state-stale-accumulation-and-surface-pollution`,
`affected_system:runtime-state`, evidence `tools/learning-loop-mastra/core/runtime-state.js`)
diagnoses two coupled gaps that let stale/non-actionable rows accumulate and pollute the
loop's own ledger view. The inbound gate reported 15 stale `vnstock` runtime-state
observations alongside 12 `meta-state-tools` ones — vnstock is a vendored example surface in
this template, not a system the operator is running, yet its ledger-events persist and crowd
out the loop's own records.

- **GAP 1 — no versioned dedup (unlike meta-state).** `meta-state.jsonl` is versioned-append:
  each id can have multiple version lines and reads collapse by `max_by(version)`
  (`meta_state_list`'s projection). `runtime-state.jsonl` has NO version field. The row
  schema is `{affected_system, kind, id, source_ref, value, delta, timestamp, metadata,
  fingerprint}` where `fingerprint` is a SHA-256 row-INTEGRITY hash, NOT an idempotency key.
  `appendLedgerEvent` (`core/runtime-state.js`) ALWAYS appends; `readRuntimeStateRows`
  returns every row; `runtime_state_read` filters then `.slice(0, limit=20)` with no
  per-id max-by-version projection. Re-recording the same ledger-event `id` creates
  duplicate rows, and reads return up to 20 stale copies of the same logical event.
- **GAP 2 — no way to stop/pause runtime tracking for a surface.** Both writers
  (`runtime_state_record`, preflight-gated; `meta_state_dispatch_finding`, live-gated)
  append unconditionally. There is no per-surface tracking toggle, allowlist, or pause
  mechanism, so vendored `vnstock` noise mixes with the loop's own `meta-state-tools` /
  `runtime-state` ledger-events that actually drive the self-learning loop.

The two gaps compound — GAP 2 keeps vnstock rows flowing in, GAP 1 keeps every stale version
of them. This plan fixes both with TDD-structured, independent commits.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Re-recording a runtime-state row `id` supersedes instead of duplicating; `runtime_state_read` returns the current state per id, not N stale copies (mirrors meta-state `max_by(version)`) | P1 |
| 2 | Operator can pause/resume per-surface runtime-state tracking; paused surfaces' rows are not appended by either writer | P1 |
| 2a | `runtime_state_pause`/`resume` are CLI-portable (in `CLI_WRITE_TOOLS`), reachable via `bin/loop.mjs` — this runtime is CLI-routed | P1 |
| 3 | Both fixes are runtime-agnostic (shim-not-fork + cross-surface), audited via `check_runtime_agnostic` before ship | P1 |
| 4 | Finding `meta-260722T0006Z` resolved with change-log citations; docs + schemas updated | P2 |

## Design Decisions

**GAP 1 — version field + max_by(version) per `id` (the finding's primary fix direction).**
- Add a `version` integer to runtime-state rows. `appendLedgerEvent` computes
  `version = maxVersionForId(existingRows, id) + 1` (first record → 0, mirroring meta-state's
  version-0 origin). Cost: O(n) scan of the sidecar per append — acceptable at operator scale
  (registry reports ~27 findings; the sidecar is operator-scale, not high-throughput). An
  in-memory max-version cache is YAGNI for now.
- Dedup key is `id` alone (the row's "Stable row id"), mirroring meta-state's per-id
  `max_by(version)`. The finding's alternative (`id + source_ref`) is rejected as more complex
  with no benefit — `id` is already the stable logical-event key and `source_ref` is the
  governing meta-state ref, not part of the event identity.
- Add `readRuntimeStateRowsLatest(root)` → collapse to `max_by(version)` per `id` (ties
  broken by newest `timestamp`, then file order). `readRuntimeStateRows` stays RAW
  (unchanged) — it preserves history and is used by the inbound gate (`core/inbound-state.js`)
  whose "latest per affected_system by timestamp" logic already picks the newest row, so raw
  duplicates do not break it. `runtime_state_read` switches to `readRuntimeStateRowsLatest`;
  `total` reflects the DEDUPED count so callers can detect that reads no longer truncate.
- v2 fingerprint formula is UNCHANGED. `version` is a dedup bookkeeping field, not a
  user-meaningful integrity field, so it is NOT hashed. Re-records already differ by
  `timestamp`, so fingerprints already differ. No fingerprint migration.
- No row migration: existing rows have no `version` and default to 0 at read time. A new
  re-record of an existing unversioned `id` gets `version = 1` and wins the collapse.

**GAP 2 — `runtime_state_pause` / `runtime_state_resume` as CLI-portable legacy-manifest tools.**
- New operator-controlled sidecar `.loop/runtime-tracking.json` (`{schema:
  "runtime-tracking/v1", version: 1, paused_surfaces: []}`). Managed by two **legacy-manifest
  handler tools** (NOT `mastra/server.js`-native), so the CLI (`bin/loop.mjs`, which dispatches
  via `tools/manifest.json`) reaches them. This is required: this runtime is CLI-routed and MCP
  write tools are not registered, so CLI portability is the only way the operator can actually
  use the toggle here. Added to `CLI_WRITE_TOOLS` in `core/cli-tools.js`; the drift test
  `__tests__/cli-write-tool-set-drift.test.js` then passes without an `MCP_RESIDUE` entry.
  The operator-preflight marker guard (`.loop/.runtime-tracking-preflight`) lives in the handler
  (consistent with `runtime_state_record`'s `hasPreflightMarker`), enforced identically in both
  transports ("same code path as the MCP server"). Atomic temp+rename write + in-process cache
  invalidate mirror `update_r2_allowlist` (server.js:88-119) / `core/r2/allowlist-cache.js`.
  `pause({surface})` adds to `paused_surfaces`; `resume({surface})` removes. This matches the
  loop's principle (AGENTS.md: authoritative mutations go through MCP tools) and the
  `update_r2_allowlist` / `.loop/r2-allowlist.json` precedent — but, unlike the low-frequency
  `update_r2_allowlist` infra edit (which stays MCP-only in `MCP_RESIDUE`), pause/resume are
  routine record-surface mutations and belong on the CLI surface. The config-denylist
  alternative (finding option a) is rejected: a raw config file is a gated write and lacks the
  operator-preflight audit the tool provides.
- A shared helper `core/runtime-tracking.js` exposes `loadPausedSurfaces(root)` /
  `isSurfacePaused(root, surface)` / `setPausedSurfaces(root, arr)` with an in-process cache
  (mirror `core/r2/allowlist-cache.js`). Both writers consult `isSurfacePaused` BEFORE
  appending: `runtime_state_record` returns `{ok:false, paused:true, affected_system}` (no
  row written); `meta_state_dispatch_finding` returns a `paused` reason (no ledger row, no
  finding patch). The dispatch writer's hardcoded `affected_system: "meta-state-tools"` is
  the loop's own surface — pausing it is the operator's explicit choice and is documented as
  stopping dispatch ledger events.
- Scope boundary: GAP 2 is the writer-side toggle (the finding's fix direction). The inbound
  gate's stale-observation scan for EXISTING vnstock rows is a documented residual — pausing
  stops new rows; existing rows age out only via GAP 1 same-id collapse (distinct-id rows
  persist). A one-time prune / inbound-gate skip for paused surfaces is out of scope (YAGNI;
  tracked as future work below).

**Cross-plan coordination.** `plans/260719-2201-runtime-state-record-integrity/` (completed,
commit `4074432`) fixed fingerprint A + read-path B + metadata D; its explicitly out-of-scope
"Bug C — same-id correction rows don't supersede" is exactly this finding's GAP 1, now
resurfaced and scoped generally. `plans/260720-1112-runtime-state-read-path-consolidation-schemas-write-gate-repair/`
(pending) consolidates `inbound-state.js` + `file-readers.js` onto the shared
`readRuntimeStateRows` and repairs the schemas write gate. It is ORTHOGONAL to this plan:
it edits `core/inbound-state.js` + `core/file-readers.js` + `core/bound-artifacts.js`; this
plan edits `core/runtime-state.js` + the two writer tools + adds legacy-manifest pause/resume
handlers + `tools/manifest.json` + `core/cli-tools.js`. No shared file edits, so no
`blockedBy`/`blocks` dependency. `readRuntimeStateRows` stays raw here, which preserves
260720-1112's assumption that the shared reader is raw.

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [GAP 1 — Versioned dedup for runtime-state rows](./phase-01-start.md) | Pending | `core/runtime-state.js`, `tools/handlers/runtime-state-read-tool.js`, new test |
| 2 | [GAP 2 — Per-surface tracking toggle (pause/resume)](./phase-02-gap-2-per-surface-tracking-toggle-pauseresume.md) | Pending | new `core/runtime-tracking.js`, new `tools/handlers/runtime-state-pause-tool.js` + `runtime-state-resume-tool.js`, `tools/manifest.json`, `core/cli-tools.js`, `tools/handlers/runtime-state-record-tool.js`, `tools/handlers/meta-state-dispatch-finding-tool.js`, new tests |
| 3 | [Resolve findings + change-log + docs](./phase-03-resolve-findings-change-log-docs.md) | Pending | meta-state MCP tools, `schemas/runtime-state.schema.json`, `docs/`, `tools/handlers/references/tool-selection-guide.md` |

Phases 1 and 2 are independent (distinct code + test surfaces) and ship as separate commits.
Phase 3 lands last and depends on both.

## Success Criteria

- [ ] Re-recording a runtime-state row `id` N times produces N rows in the sidecar (history
      preserved) but `runtime_state_read` returns exactly 1 row (the latest, `max_by(version)`)
      for that id, with `total` reflecting the deduped count.
- [ ] `readRuntimeStateRows` still returns every raw row (inbound gate + history unchanged).
- [ ] `runtime_state_pause({surface:"vnstock"})` creates `.loop/runtime-tracking.json` with
      `paused_surfaces:["vnstock"]`; a subsequent `runtime_state_record` for `vnstock` returns
      `{ok:false, paused:true}` and writes NO row; `resume` restores writes.
- [ ] Both `runtime_state_pause` and `runtime_state_resume` are reachable via the CLI
      (`node bin/loop.mjs <tool> '<json>'`) AND MCP, sharing one handler + preflight guard;
      listed in `CLI_WRITE_TOOLS`; `__tests__/cli-write-tool-set-drift.test.js` stays green.
- [ ] `meta_state_dispatch_finding` respects the paused flag for `meta-state-tools`.
- [ ] Pause/resume without the operator preflight marker returns `preflight_required`.
- [ ] `check_runtime_agnostic` passes for the new tools + helper (runtime-agnostic).
- [ ] `pnpm test` green; `pnpm fallow:gate` triaged (baseline-inherited lines ignored).
- [ ] `meta-260722T0006Z` resolved with change-log citations; schemas + docs updated.

## Risk Assessment

- **Load-bearing read semantics change (GAP 1).** `runtime_state_read` now dedups. Any
  consumer relying on receiving N stale copies breaks. Mitigation: grep for
  `runtime_state_read` / `readRuntimeStateRows` consumers; only the MCP read surface changes.
  The inbound gate uses `readRuntimeStateRows` (raw, unchanged). TDD test pins the contract.
- **Version scan cost (GAP 1).** O(n) per append. Acceptable at operator scale; documented.
  Cache is YAGNI until the sidecar is large.
- **Pausing `meta-state-tools` halts dispatch ledger events (GAP 2).** Operator's explicit
  choice; documented in tool description + tool-selection-guide. Not a default.
- **Direct runtime writes to `.loop/runtime-tracking.json`.** Must be blocked like
  `r2-allowlist.json` so runtimes cannot bypass the pause. Mitigation: verify how
  `.loop/r2-allowlist.json` is protected (`core/r2/ownership.js` + `core/bound-artifacts.js`)
  and mirror it for `runtime-tracking.json`.

## Out of Scope / Future Work

- Pruning EXISTING stale vnstock rows from `runtime-state.jsonl` (one-time operator prune
  tool) — not required by the finding's fix direction; tracked as future work.
- Inbound-gate skip of paused surfaces in the stale-observation scan — would touch
  `core/inbound-state.js` and conflict with pending plan 260720-1112; deferred.
- In-memory max-version cache for `appendLedgerEvent` — YAGNI until sidecar is large.