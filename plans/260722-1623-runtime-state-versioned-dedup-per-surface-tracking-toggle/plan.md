---
title: "Runtime-state versioned dedup + per-surface tracking toggle"
description: "Resolve meta-260722T0006Z — runtime-state.jsonl has two coupled maintenance gaps: (GAP 1) no versioned dedup, so re-recording the same row id appends stale duplicates that reads return up to 20 copies of; (GAP 2) no per-surface tracking toggle, so vendored surfaces (vnstock) pollute the loop's ledger with non-actionable rows. TDD-structured; the two gaps ship as separate commits in one plan."
status: completed
priority: P1
effort: "1.5-2d"
tags: [runtime-state, dedup, versioning, tracking-toggle, mcp-tool, tdd, meta-state]
created: 2026-07-22
completed: 2026-07-22
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
| 2a | `runtime_state_pause`/`resume` are in `CLI_WRITE_TOOLS` + `tools/manifest.json`; reachable via `bin/loop.mjs` (CLI-only where `LOOP_RECORDS_VIA_CLI=1`, dual-transport otherwise) | P1 |
| 3 | Both fixes are runtime-agnostic (shim-not-fork + cross-surface), audited via `check_runtime_agnostic` before ship | P1 |
| 4 | Finding `meta-260722T0006Z` superseded into a residual finding that is itself resolved (this plan does the residual in Phase 4); change-log citations; docs + schemas updated | P2 |
| 5 | Existing distinct-id vnstock rows pruned + inbound gate skips paused surfaces, so the finding's primary symptom is fully cleared | P2 |

## Design Decisions

**GAP 1 — version field + max_by(version) per `id` (the finding's primary fix direction).**
- Add a `version` integer to runtime-state rows. `appendLedgerEvent` wraps the scan-then-append
  in `withRegistryLock` (the cross-process file lock `core/meta-state.js:1042-1043` uses via
  `core/registry-lock.js`), then computes `version = maxVersionForId(existingRows, id) + 1`
  (first record → 0, mirroring meta-state's version-0 origin). The lock is required: without it,
  concurrent writers (record + dispatch, or two sessions sharing `GATE_ROOT`) both read max=N
  and both append version=N+1, colliding versions and silently losing a write — defeating the
  dedup. Cost: O(n) scan of the sidecar per append — acceptable at operator scale (registry
  reports ~27 findings; the sidecar is operator-scale, not high-throughput). An in-memory
  max-version cache is YAGNI for now (and dead code on the CLI one-shot path).
- Dedup key is `id` alone (the row's "Stable row id"), mirroring meta-state's per-id
  `max_by(version)`. The finding's alternative (`id + source_ref`) is rejected as more complex
  with no benefit — `id` is already the stable logical-event key and `source_ref` is the
  governing meta-state ref, not part of the event identity.
- Add `readRuntimeStateRowsLatest(root)` → collapse to `max_by(version)` per `id` (ties
  broken by newest `timestamp` with a `timestamp ?? ""` fallback mirroring meta-state's
  `created_at ?? ""` at `core/meta-state.js:768-769`, then last in file order). Missing/
  unparseable timestamps sort as `""` (oldest), so a re-record with a real timestamp wins over
  a legacy unversioned row lacking one. `readRuntimeStateRows` stays RAW (unchanged) — it
  preserves history and is used by the inbound gate (`core/inbound-state.js`) whose "latest per
  affected_system by timestamp" logic already picks the newest row, so raw duplicates do not
  break it. `runtime_state_read` switches to `readRuntimeStateRowsLatest`; `total` reflects
  the DEDUPED count so callers can detect that reads no longer truncate.
- v2 fingerprint formula is UNCHANGED. `version` is a dedup bookkeeping field, not a
  user-meaningful integrity field, so it is NOT hashed. Re-records already differ by
  `timestamp`, so fingerprints already differ. No fingerprint migration.
- No row migration: existing rows have no `version` and default to 0 at read time. A new
  re-record of an existing unversioned `id` gets `version = 1` and wins the collapse.

**GAP 2 — `runtime_state_pause` / `runtime_state_resume` as legacy-manifest tools (CLI + MCP).**
- New operator-controlled sidecar `.loop/runtime-tracking.json` (`{schema:
  "runtime-tracking/v1", version: 1, paused_surfaces: []}`). Managed by two **legacy-manifest
  handler tools** registered in `tools/manifest.json` AND added to `CLI_WRITE_TOOLS`
  (`core/cli-tools.js`). Transport is per-runtime: where `LOOP_RECORDS_VIA_CLI=1` (this `.claude`
  runtime, per `.mcp.json:8`), `CLI_TOOLS` membership drops them from the MCP surface (CLI-only);
  `.factory`/`.mastracode` (only `LOOP_SURFACE` set) expose them on MCP — same handler, both
  transports. (The earlier "MCP write tools are not registered" framing was true only for the
  `.claude` runtime and mis-stated as universal.) The drift test
  `__tests__/cli-write-tool-set-drift.test.js` passes without an `MCP_RESIDUE` entry.
  The operator-preflight marker lives at `SURFACES/coordination/.loop-preflight-runtime-tracking`
  — the per-surface convention `runtime_state_record` uses (`runtime-state-record-tool.js:12-15`),
  NOT a root-level `.loop/.runtime-tracking-preflight` (which no gate protects: it is outside
  `PREFLIGHT_MARKER_PATHS` at `evaluate-write-gate.js:66` and the bash preflight regexes at
  `evaluate-bash-gate.js:34-35`). Created via `gate_mark_preflight({surface:"runtime-tracking"})`
  (extend that tool's `surface` enum) so it inherits write-gate + bash protection, per-surface
  isolation, and the 30-min TTL + audit log. Atomic temp+rename write mirrors
  `update_r2_allowlist` (`server.js:88-119`); the sidecar is read from disk per call (NO
  in-process cache — the `.claude` CLI one-shot path never hits a warm one, and the
  `allowlist-cache.js` cache exists for a long-running MCP server's high-frequency R2 gate, not
  this low-frequency read). `pause({surface})` adds to `paused_surfaces`; `resume({surface})`
  removes; `surface` is validated against the runtime-state `affected_system` enum EXPORTED from
  `core/runtime-state.js` (not `core/meta-state.js`'s `AFFECTED_SYSTEM_ENUM` — a different
  superset that includes `vnstock_vendor`). This matches the loop's principle (AGENTS.md:
  authoritative mutations go through MCP/CLI tools) and the `update_r2_allowlist` /
  `.loop/r2-allowlist.json` precedent — but, unlike the low-frequency `update_r2_allowlist` infra
  edit (which stays MCP-only in `MCP_RESIDUE`), pause/resume are routine record-surface mutations
  and belong on the CLI surface. The config-denylist alternative (finding option a) is rejected:
  a raw config file is a gated write and lacks the operator-preflight audit the tool provides.
- A shared helper `core/runtime-tracking.js` exposes `loadPausedSurfaces(root)` /
  `isSurfacePaused(root, surface)` / `setPausedSurfaces(root, arr)` (read-from-disk per call, NO
  cache; fail-closed on a malformed sidecar mirroring `allowlist-cache.js:39-48` — NOT the
  fail-open "tolerant → []" originally proposed, which would silently unpause on corruption).
  Both writers consult `isSurfacePaused`: `runtime_state_record` returns
  `{ok:false, paused:true, affected_system}` (no row written); `meta_state_dispatch_finding`
  checks at the TOP of the handler so BOTH `prepare` and `commit` return a `paused` reason (no
  issue drafted, no ledger row, no finding patch) — checking only `commit` would let an agent
  `gh issue create` from `prepare` then orphan the issue at `commit`. The dispatch writer's
  hardcoded `affected_system: "meta-state-tools"` is the loop's own surface — pausing it is the
  operator's explicit choice and is documented as stopping dispatch ledger events.
- Write protection: `.loop/runtime-tracking.json` is operator-controlled, so direct runtime
  writes must be blocked. The `.loop/r2-allowlist.json` precedent is itself ONLY
  `BOOTSTRAP_DENY_PATTERNS` in `core/r2/ownership.js:36-45` (NOT `core/bound-artifacts.js`, which
  lists no `.loop/` files), and that layer only blocks R2-ownership `own`-glob claims via
  `withR2Gate` — which short-circuits to passthrough on `pathFields:[]` (`mastra/with-r2-gate.js:42-45`)
  and so does NOT stop a direct Write/bash write. To actually meet "runtimes cannot bypass pause,"
  the sidecar is added to THREE layers: `BOOTSTRAP_DENY_PATTERNS` (`core/r2/ownership.js`,
  the real precedent), bash-gate `PATH_WRITE_PATTERNS` (`core/evaluate-bash-gate.js`, echo/tee —
  the layer the original draft omitted entirely), and `BOUND_ARTIFACTS` (`core/bound-artifacts.js`,
  Write-tool defense-in-depth), with a regression test that a direct Write AND `echo > …` are
  both blocked.
- Scope boundary: GAP 2 is the writer-side toggle (the finding's fix direction). The inbound
  gate's stale-observation scan for EXISTING vnstock rows is a documented residual — pausing
  stops new rows; the 20 existing vnstock rows have DISTINCT ids (GAP 1 same-id collapse does
  NOT touch them), and `core/inbound-state.js:116-132` keeps surfacing them. So the finding's
  PRIMARY symptom is NOT cleared by GAP 1+2 alone — Phase 4 clears it: a one-time, preflight +
  `confirm`-gated `runtime_state_prune_surface` tool (under `withRegistryLock`, atomic rewrite)
  removes the existing paused-surface rows, and a one-line `isSurfacePaused` short-circuit at
  `inbound-state.js:116` skips paused surfaces in the stale scan. (Validation decision: this
  residual is in-scope for THIS plan now, not a separate follow-up — the inbound-gate skip is
  UNBLOCKED since plan 260720-1112 merged, so the earlier "would conflict with pending plan"
  reason is moot.) Phase 3 then supersedes `meta-260722T0006Z` into a residual finding that is
  itself resolved (this plan does the residual), so the closure is grounded on the fully-cleared
  symptom.

**Cross-plan coordination.** `plans/260719-2201-runtime-state-record-integrity/` (completed,
commit `4074432`) fixed fingerprint A + read-path B + metadata D; its explicitly out-of-scope
"Bug C — same-id correction rows don't supersede" is exactly this finding's GAP 1, now
resurfaced and scoped generally. `plans/260720-1112-runtime-state-read-path-consolidation-schemas-write-gate-repair/`
is MERGED (commit `9b3e8a3` — `core/bound-artifacts.js:93` references its Phase 2); it
consolidated `inbound-state.js` + `file-readers.js` onto the shared `readRuntimeStateRows` and
repaired the schemas write gate. Because it is terminal, there is no live file-edit conflict
(this plan also touches `core/bound-artifacts.js` + `core/evaluate-bash-gate.js` + `core/r2/ownership.js`
for the new sidecar's write protection, but those edits are additive and against the merged
state). No `blockedBy`/`blocks` dependency. `readRuntimeStateRows` stays raw here, preserving
260720-1112's assumption that the shared reader is raw. The merged 260720-1112 also UNBLOCKS
the inbound-gate skip for paused surfaces (no longer a conflict), now tracked as the Phase 3
follow-up finding.

## Phases

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | [GAP 1 — Versioned dedup for runtime-state rows](./phase-01-start.md) | Pending | `core/runtime-state.js`, `tools/handlers/runtime-state-read-tool.js`, new test (incl. concurrent-append race test) |
| 2 | [GAP 2 — Per-surface tracking toggle (pause/resume)](./phase-02-gap-2-per-surface-tracking-toggle-pauseresume.md) | Pending | new `core/runtime-tracking.js`, new pause/resume handlers, `core/runtime-state.js` (enum export), `tools/manifest.json`, `core/cli-tools.js`, both writer tools, `core/r2/ownership.js` + `core/evaluate-bash-gate.js` + `core/bound-artifacts.js` (3-layer write protection), `gate_mark_preflight` (surface enum), new tests |
| 4 | [Clear existing residual — prune + inbound-gate skip](./phase-04-clear-existing-residual-prune-inbound-gate-skip.md) | Pending | `core/runtime-state.js` (`pruneSurfaceRows`), new `runtime-state-prune-surface-tool.js`, `core/inbound-state.js` (gate skip), `tools/manifest.json`, `core/cli-tools.js`, new tests |
| 3 | [Resolve findings + change-log + docs](./phase-03-resolve-findings-change-log-docs.md) | Pending | meta-state MCP tools, `schemas/runtime-state.schema.json`, `docs/`, `tools/handlers/references/tool-selection-guide.md` |

Phases 1 and 2 are independent (distinct code + test surfaces) and ship as separate commits.
Phase 4 depends on Phase 2 (reuses `isSurfacePaused` + the preflight marker); it clears the
existing-row residual so the finding's primary symptom is grounded at resolve time. Phase 3
lands last and depends on Phases 1, 2, AND 4 — it supersedes `meta-260722T0006Z` into a residual
finding that is itself resolved (since this plan does the residual).

## Success Criteria

- [ ] Re-recording a runtime-state row `id` N times produces N rows in the sidecar (history
      preserved) but `runtime_state_read` returns exactly 1 row (the latest, `max_by(version)`)
      for that id, with `total` reflecting the deduped count.
- [ ] `readRuntimeStateRows` still returns every raw row (inbound gate + history unchanged).
- [ ] `runtime_state_pause({surface:"vnstock"})` (after `gate_mark_preflight({surface:"runtime-tracking"})`)
      creates `.loop/runtime-tracking.json` with `paused_surfaces:["vnstock"]`; a subsequent
      `runtime_state_record` for `vnstock` returns `{ok:false, paused:true}` and writes NO row;
      `resume` restores writes.
- [ ] `runtime_state_pause`/`resume` are in `CLI_WRITE_TOOLS` + `tools/manifest.json`; reachable
      via `bin/loop.mjs` (CLI-only where `LOOP_RECORDS_VIA_CLI=1`, dual-transport otherwise),
      sharing one handler + the per-surface preflight guard; drift test stays green.
- [ ] `meta_state_dispatch_finding` respects the paused flag for `meta-state-tools` at BOTH
      `prepare` and `commit` (no issue drafted, no ledger row).
- [ ] Pause/resume without the per-surface operator preflight marker returns `preflight_required`.
- [ ] `surface` is validated against the runtime-state enum exported from `core/runtime-state.js`
      (not meta-state's superset).
- [ ] Direct runtime write to `.loop/runtime-tracking.json` is blocked at all three layers
      (`BOOTSTRAP_DENY_PATTERNS`, bash `PATH_WRITE_PATTERNS`, `BOUND_ARTIFACTS`); regression test green.
- [ ] A malformed `.loop/runtime-tracking.json` is fail-closed (writers refuse); absent → nothing paused.
- [ ] **Concurrent-append race test** (Phase 1) passes: two writers for the same `id` produce
      rows with distinct `version`s, no collision — actually exercises the `withRegistryLock`.
- [ ] `runtime_state_prune_surface({surface,confirm:true})` (preflight-gated, Phase 4) atomically
      removes a paused surface's existing rows; `pruned`/`remaining` correct; `confirm` + preflight
      required; idempotent on no match; reachable via `bin/loop.mjs`; drift test green.
- [ ] Inbound gate skips stale observations for paused surfaces (`isSurfacePaused` at
      `inbound-state.js:116`); unpaused surfaces unchanged.
- [ ] `check_runtime_agnostic` passes for the new tools + helper + prune tool (runtime-agnostic).
- [ ] `pnpm test` green; `pnpm fallow:gate` triaged (baseline-inherited lines ignored).
- [ ] `meta-260722T0006Z` is superseded into a residual finding that is itself resolved (this plan
      does the residual in Phase 4); all three change-log ids + the residual finding id cited;
      schemas + docs updated.

## Risk Assessment

- **Load-bearing read semantics change (GAP 1).** `runtime_state_read` now dedups. Any
  consumer relying on receiving N stale copies breaks. Mitigation: grep for
  `runtime_state_read` / `readRuntimeStateRows` consumers; the `runtime_state_read` TOOL surface
  changes on BOTH transports (it is in `CLI_READ_TOOLS` at `core/cli-tools.js:32`, not just MCP),
  while `readRuntimeStateRows` raw consumers (inbound gate `core/inbound-state.js:89`,
  file-readers, dispatch idempotency scan) are unchanged. TDD test pins the contract.
- **TOCTOU on versioned append (GAP 1, mitigated).** The scan-then-append is wrapped in
  `withRegistryLock` (cross-process file lock, mirroring `core/meta-state.js:1042-1043`) so
  concurrent writers cannot both read max=N and append version=N+1. The TDD test is sequential,
  so the race is not exercised by green tests — add a concurrent-append test if the sidecar ever
  goes multi-writer hot.
- **Version scan cost (GAP 1).** O(n) per append. Acceptable at operator scale; documented.
  Cache is YAGNI (and dead code on the CLI one-shot path).
- **Pausing `meta-state-tools` halts dispatch ledger events (GAP 2).** Operator's explicit
  choice; documented in tool description + tool-selection-guide. Not a default. The top-of-handler
  pause check means `prepare` also refuses (no orphaned GitHub issue).
- **Direct runtime writes to `.loop/runtime-tracking.json` (GAP 2, mitigated).** The
  `r2-allowlist.json` precedent is itself only `BOOTSTRAP_DENY_PATTERNS` (`core/r2/ownership.js:36-45`,
  NOT `core/bound-artifacts.js`) and that layer only blocks R2-ownership claims via `withR2Gate`,
  which short-circuits on `pathFields:[]` — so it alone does NOT stop a direct Write/bash write.
  Mitigation: add the sidecar to all three layers (BOOTSTRAP_DENY_PATTERNS + bash
  PATH_WRITE_PATTERNS + BOUND_ARTIFACTS) with a regression test; place the preflight marker under
  `SURFACES/coordination/.loop-preflight-runtime-tracking` so it inherits `PREFLIGHT_MARKER_PATHS`
  + bash preflight protection (a root-level marker would be writable by any runtime).

## Out of Scope / Future Work

- In-memory max-version cache for `appendLedgerEvent` — YAGNI until sidecar is large.
- **Re-pollination guard.** `runtime_state_prune_surface` (Phase 4) clears existing rows, but
  nothing prevents a paused-but-then-resumed surface from re-accumulating distinct-id rows over
  time — the prune is one-time, not a recurring sweep. A scheduled/automated prune is future
  work (the operator can re-run the one-time prune manually).
- **Per-surface prune audit log.** The prune is destructive + `confirm`-gated; a dedicated
  audit-log entry (beyond the change-log citation in Phase 3) is future work if the loop later
  needs per-destructive-op provenance.

> Note: the existing-row prune + inbound-gate skip were originally deferred here as a follow-up.
> Validation moved them INTO this plan as Phase 4 (unblocked since 260720-1112 merged) so the
> finding's primary symptom is fully cleared before `meta-260722T0006Z` is closed.

## Red Team Review

### Session — 2026-07-22
**Findings:** 13 (13 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 4 High, 6 Medium, 1 Low
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (Standard tier:
Fact Checker + Contract Verifier). All 13 findings independently re-verified against source by
the controller (two reviewers ran without the safety classifier); every finding carries file:line
evidence. None rejected on evidence or merit grounds.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | Write-protection scheme mis-cited + incomplete; sidecar AND preflight marker bypassable by a direct runtime Write/bash | Critical | Accept | Phase 2 (Overview, Requirements, Architecture, Files, Steps 8, Success, Risk) + plan.md (GAP 2, Phases table, Success, Risk) |
| C2 | `appendLedgerEvent` scan-then-append is an unlocked TOCTOU; versioned dedup races silently | Critical | Accept | Phase 1 (Architecture, Files, Step 3, Risk) + plan.md (GAP 1, Risk) |
| H1 | Phase 3 schema path wrong (`tools/learning-loop-mastra/schemas/` does not exist; actual is project root) | High | Accept | Phase 3 (Related Code Files) |
| H2 | `affected_system` enum not shared; meta-state's `AFFECTED_SYSTEM_ENUM` is a different superset | High | Accept | Phase 2 (Requirements, Architecture, Files, Steps 5/6, Success) + plan.md (GAP 2, Success) |
| H3 | Resolving `meta-260722T0006Z` is premature — 20 existing vnstock rows have DISTINCT ids; inbound gate still surfaces them | High | Accept | Phase 3 (Architecture, Step 4, Success, Risk) + plan.md (Success, Out of Scope, Cross-plan) |
| H4 | Malformed `runtime-tracking.json` → `[]` is fail-open; contradicts fail-closed `allowlist-cache.js` | High | Accept | Phase 2 (Requirements, Architecture, Steps 1/2/5, Success) + plan.md (GAP 2, Success) |
| M1 | Dispatch `prepare` stage not paused (only `commit`); orphans a GitHub issue with no ledger row | Medium | Accept | Phase 2 (Requirements, Architecture, Steps 3/7, Success, Risk) + plan.md (GAP 2, Success) |
| M2 | Cross-plan section stale: 260720-1112 is merged (`9b3e8a3`), not "pending"; inbound-gate skip now unblocked | Medium | Accept | plan.md (Cross-plan, Out of Scope) + Phase 3 (Architecture, Risk) |
| M3 | Tie-break underspecified for missing/non-monotonic timestamps on legacy rows | Medium | Accept | Phase 1 (Architecture, Steps 1/3) + plan.md (GAP 1) |
| M4 | Rollback hole: a versioned row (v≥1) shadows a post-rollback versionless re-record (v=0) | Medium | Accept | Phase 1 (Risk Assessment) |
| M5 | In-process cache is dead code for the CLI one-shot path; drop it | Medium | Accept | Phase 2 (Overview, Requirements, Architecture, Step 5, Success, Risk) + plan.md (GAP 2, Risk) |
| M6 | "MCP write tools are not registered" is true only for `.claude`, mis-cited, false for `.factory`/`.mastracode` | Medium | Accept | Phase 2 (Overview, Requirements, Files) + plan.md (GAP 2, Goals 2a, Phases table) |
| L1 | "only the MCP read surface changes" understates blast radius; CLI read surface also changes | Low | Accept | Phase 1 (Risk) + plan.md (Risk) |

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-start.md, phase-02-…, phase-03-…
- **Decision deltas checked:** 13 (marker path; 3-layer write protection + new `evaluate-bash-gate.js` edit; cache dropped; malformed fail-closed; enum exported from `core/runtime-state.js`; dispatch pause → top-of-handler; `appendLedgerEvent` → `withRegistryLock`; tie-break `timestamp ?? ""`; resolve → supersede/partial + follow-up; 260720-1112 → merged; MCP routing → per-runtime `LOOP_RECORDS_VIA_CLI`; schema path → project root; read blast-radius → both transports).
- **Reconciled stale references:** 2 — (1) Phase 3 change-log `change_diff` now names the `withRegistryLock` guard (was omitted); (2) Goals table Goal 4 changed from "resolved" to "superseded (or kept open with a partial-resolution note)" to match Phase 3 + Success Criteria. All other grep hits for "old" terms are the new text explicitly contrasting the rejected approach (e.g. "NOT a root-level `.loop/.runtime-tracking-preflight`", "NO in-process cache", "earlier 'MCP write tools are not registered' framing … mis-stated") — intentional, not stale.
- **Unresolved contradictions:** 0. *(Sweep ran before the validation session added Phase 4; re-run in the Validation Log below.)*

The plan was consistent across the then-four files; the validation session re-ran the sweep over all five files (see `## Validation Log`).

## Validation Log

### Session 1 — 2026-07-22
**Trigger:** `/ak:plan validate` after red-team (13 findings applied). Verification pass skipped
per the Step 2.5 guard — `## Red Team Review` already carries file:line evidence and no
`[UNVERIFIED]` tags remain. This session resolved four genuine judgment calls the evidence could
not settle.
**Questions asked:** 4

#### Questions & Answers

1. **[Scope/Assumptions]** GAP 1+2 are fixed, but the 20 existing distinct-id vnstock rows still
   trigger the inbound gate, so the finding's primary symptom isn't fully cleared. How should
   Phase 3 close finding `meta-260722T0006Z`?
   - Options: Supersede to follow-up | Keep open, partial note | Resolve as "both gaps fixed"
   - **Answer:** Supersede to follow-up (Recommended)
   - **Rationale:** canonical loop pattern; closes the original cleanly while the residual lives
     under its own id; avoids an ungrounded "both gaps fixed" resolve.

2. **[Scope]** The existing-row prune + inbound-gate skip (now unblocked since 260720-1112 merged)
   are filed as a follow-up. Should clearing that residual be part of THIS plan or a separate one?
   - Options: Separate follow-up plan (Recommended) | Add to this plan
   - **Answer:** Add to this plan
   - **Rationale:** the residual clearing is small and unblocked; doing it here means the finding's
     primary symptom is fully cleared before closure, so the supersede (Q1) is grounded. Added
     as Phase 4.
   - **Note:** this overrides the "(Recommended)" option — the user chose to absorb the residual
     into this plan rather than ship it separately.

3. **[Risks]** The Phase 1 TOCTOU fix (`withRegistryLock` around scan-then-append) is Critical, but
   the TDD test is sequential — the lock is never actually exercised. Add a concurrent-append
   test now or defer?
   - Options: Add race test now (Recommended) | Defer until multi-writer
   - **Answer:** Add race test now (Recommended)
   - **Rationale:** the only real coverage for a Critical defect; the sequential tests stay green
     whether or not the lock works, so without this test the lock is untested.

4. **[Architecture]** The pause preflight marker is per-surface but the pause EFFECT is loop-wide
   (shared `.loop/runtime-tracking.json`). Which authorization model?
   - Options: Per-surface marker (Recommended) | Single loop-wide marker
   - **Answer:** Per-surface marker (Recommended)
   - **Rationale:** matches the `runtime_state_record` precedent, inherits
     `PREFLIGHT_MARKER_PATHS`/bash protection + per-runtime audit; the loop-wide-effect trade-off
     is documented.

#### Confirmed Decisions
- Resolve path: supersede original into a residual finding, then resolve the residual (this plan
  does it) — not "both gaps fixed", not "keep open with a note".
- Scope: the existing-row prune + inbound-gate skip are IN this plan as Phase 4 (was deferred).
- Phase 1 gains a concurrent-append race test that exercises the `withRegistryLock`.
- Marker authorization stays per-surface (no change).

#### Action Items
- [x] Add Phase 4 (`runtime_state_prune_surface` + inbound-gate skip) — scaffolded via
      `ak plan add-phase`, content written.
- [x] Phase 3 `dependencies` → `[1, 2, 4]`; resolve section + steps + success + risk updated to
      supersede-and-resolve-the-residual (not "residual lives elsewhere").
- [x] Phase 1 test step gains the concurrent-append race test.
- [x] `plan.md`: Phases table (+Phase 4), Goals (+Goal 5, Goal 4 reworded), Success Criteria
      (+prune/gate-skip/race-test, resolve line reworded), GAP 2 scope-boundary bullet, Out of
      Scope (residual moved IN; new future-work = re-pollination guard + per-prune audit log).

#### Impact on Phases
- Phase 1: +1 test (concurrent-append race) in the TDD step + Related Files/Risk already cover the lock.
- Phase 2: no change (marker model confirmed per-surface; Phase 4 reuses its `isSurfacePaused` + marker).
- Phase 4 (NEW): prune tool + inbound-gate skip; depends on Phase 2.
- Phase 3: `dependencies` → `[1,2,4]`; logs a 3rd change-log (Phase 4), resolves the residual
  finding, then supersedes the original into it.

### Verification Results (re-run for validation)
- Claims checked: all 13 red-team findings + the 4 validation decisions' codebase anchors
  (prune runs under the same `withRegistryLock` as Phase 1; `inbound-state.js:116` is the real
  filter line; `runtime-state.jsonl` already in `BOOTSTRAP_DENY_PATTERNS` so no new gate entry
  for the prune; `meta_state_archive` `confirm` pattern exists for the prune's `confirm` arg).
- Verified: all | Failed: 0 | Unverified: 0
- Tier: Standard (3→ now 4 phases, but verification was inherited from red-team + targeted
  re-checks, not a fresh full pass — the Step 2.5 guard applied).

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-start.md, phase-02-…, phase-03-…, phase-04-…
- **Decision deltas checked:** 4 (supersede+resolve-residual; residual→in-scope Phase 4;
  +concurrent race test; per-surface marker confirmed).
- **Reconciled stale references:** 3 — (1) Red Team Review closing line "four files" → noted it
  pre-dates Phase 4 + points to this Validation Log; (2) Phase 3 resolve block + steps + success +
  risk rewritten from "residual lives elsewhere / kept open with note" to "supersede + resolve
  the residual (this plan does it)"; (3) Out-of-Scope residual bullets moved into Phase 4, replaced
  with genuinely-out-of-scope items (re-pollination guard, per-prune audit log). Also: Goals 4/5
  and the Phases table + ordering note updated.
- **Unresolved contradictions:** 0.

The plan is consistent across all five files; no stale rejected-assumption text survives as a
positive claim. Cleared for implementation.