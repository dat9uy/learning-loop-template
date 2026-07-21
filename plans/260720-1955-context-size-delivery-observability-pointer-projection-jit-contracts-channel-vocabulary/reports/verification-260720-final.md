# Final verification — context size + delivery observability

**Plan:** `plans/260720-1955-context-size-delivery-observability-pointer-projection-jit-contracts-channel-vocabulary/`
**Measured:** 2026-07-21 (Asia/Bangkok)
**Branch:** `plan-260721-sessionstart-steering-injection-is-push-dependent-and-silent`
**Commands:** `node tools/scripts/measure-context-surfaces.mjs`, `node tools/scripts/delivery-classify.mjs --limit=10`, `pnpm test:iter`, `check_runtime_agnostic` MCP tool, `runtime_state_read` MCP tool.

## Hard budgets

| Metric | Budget | Measured | Baseline (Phase 1) | Result |
|---|---|---:|---:|---|
| `tools/list` manifest-tool portion | ≤ 40,000 B | **39,905 B** | ~67,255 B (pre-Phase-2) | ✅ PASS |
| `tools/list` total serialized | ≤ 45,000 B (deferred — V1 split) | 49,009 B | 79,588 B | ⏭ follow-on phase (non-manifest ~9.1 kB: workflows + `update_r2_allowlist` + 3 `ask_*` agents) |
| SessionStart combined stdout (both `.claude` hooks) | ≤ 6,000 chars | **5,120 chars** | 13,088 chars | ✅ PASS |
| Sidecar shape + `*_source` flags vs baseline | diff empty | shape `12c5955…41382`; all `*_source=core` | identical | ✅ PASS |
| `runtime-state-metadata-validation.test.js` with classifier rows | green | green (6/6) | n/a | ✅ PASS |
| `pnpm test:iter` | 0 failures | **2336/2336 green, exit 0** | — | ✅ PASS |
| `check_runtime_agnostic` (touched surfaces) | clean | inbound-gate 6/6, loop-introspect 6/6, field-glossary 6/6 | — | ✅ PASS (see note on session-start `.cjs`) |

### Wire budget detail (manifest-tool portion, 39,905 B across 32 manifest tools)

Largest manifest tools after Phase 2 JIT slimming:

| Tool | Bytes |
|---|---:|
| `mastra_meta_state_log_change` | 4,304 |
| `mastra_meta_state_batch` | 2,654 |
| `mastra_meta_state_list` | 2,388 |
| `mastra_meta_state_patch` | 2,110 |
| `mastra_meta_state_promote_rule` | 2,038 |
| `mastra_meta_state_report` | 1,869 |

Pre-Phase-2 the patch tool alone was 19,817 B (branch-union schemas on-wire); post-JIT it is 2,110 B (free-form `z.record` + parity `minProperties:1`; branch schemas ride `invalid_field`/`empty_patch` payloads). The total tools/list dropped 79,588 B → 49,009 B.

### Hook budget detail

| Hook | Chars | UTF-8 bytes |
|---|---:|---:|
| `session-start-inject-discoverability.cjs` | 2,669 | 2,703 |
| `session-start-inject-process-hints.cjs` | 2,451 | 2,473 |
| **Combined** | **5,120** | **5,176** |

Pre-Phase-3 combined was 13,088 chars; Phase 3 pointer projection (`slug — suggestion`) cut it to 5,120. Factory hook (`factory-session-start`) still emits full text — **pointer projection deferred (D3.1, separate cross-surface alignment plan)**.

## Delivery classifier (Phase 4)

`node tools/scripts/delivery-classify.mjs --limit=10`:

- Floors recomputed at run time (single spawn, before any append): `manifestBytes=49009`, `manifestFloorTokens=12253`, `hintFloorTokens=1225`. No hardcoded byte constants.
- First run: scanned 10, classified 10, appended 10, failed 0.
- Immediate re-run: scanned 10, classified 10, **skipped 9, appended 1** — the 1 re-append is the live session's own transcript (its `transcript_content_hash` changed between runs), exercising the V5 content-hash re-classify path. 0 duplicates for unchanged transcripts.
- Rows: `delivery-<sessionId>-<runTs>` ledger-events in repo-root `runtime-state.jsonl`; `affected_system=meta-state-tools`, `source_ref=local:meta-state:meta-260719T2120Z-…`, `value=1` (full) for the measured sessions; every row `fingerprint_valid=true`.
- Readable via the loop-queryable path: `runtime_state_read({affected_system:"meta-state-tools", kind:"ledger-event"})` → 12 rows (1 dispatch + 11 delivery). No file scraping.
- Delivered-token metric = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (H7 fix — `input_tokens` alone excludes cache reads and would falsely flag cached sessions `lean`).

Invariants verified: atomic `runtime-state.classify.lock` + `truncateTrailingPartialLine` (C2); `runtimeStateRecordTool` per-field `safeParse` + `^[a-z0-9-]+$` id sanitization (H2); floors computed up-front before any append (H4); content-hash re-classify (H3/V5).

## `syn`-profile forensics (honesty flag)

**Outcome: documented-degradation.** The `syn` (lean) profile transcript directory is not present in this checkout (`~/.claude/projects/` has only the `-home-datguy-codingProjects-learning-loop-template` slug; no `-syn-*` dir). No `syn` delivery row is invented. The classifier's `unknown` class is the honest record for an inconclusive forensic; no corrective loop is run (per debug-report rec 4). Recorded in `docs/architecture.md` § Channels → state axes as the `syn`-profile honesty flag.

## `check_runtime_agnostic` note (session-start `.cjs`)

`session-start-inject-discoverability.cjs` fails 3 stricter static-check items (protocol-adapter I/O, cross-surface-iteration via `surfaces.js`, SURFACES source-of-truth). **Pre-existing, not a Phase 3 regression:** the pre-Phase-2 version (parent commit `1c6a614^`) already used direct `require("node:fs"/"node:path")` + direct core requires with no `protocol-adapter`/`surfaces.js` imports; Phase 3's only change to this hook was an additive builder swap (`buildDiscoverabilityHints` → `buildDiscoverabilityPointers`). The `runtime-agnostic.test.js` regression test is green (part of the 2336/2336 suite). Candidate for a separate `.cjs` → universal-helper migration; out of scope for this plan.

## Test suite

`pnpm test:iter` → **2336 tests / 468 suites passed, exit 0.**

Pre-existing Phase-2 casualties discovered and fixed during this verification (the Phase 1–4 handoff ran per-file `test:one`, not the full `--bail=1` suite, so these were masked):

1. `cross-surface.test.js` — inbound-gate once-per-session pointer; each call now isolated in its own temp `GATE_ROOT` so both Claude + Droid emit the pointer (parity preserved). Test-side only.
2. `meta-state-patch-entry-kind-invariant.test.js` — Phase 2 JIT relocated the rejection from a Zod `.strict()` throw to a handler `immutable_field` return; test updated to the new contract (registry-state invariant unchanged).
3. `cold-tier-regression.test.js` — Phase 2's committed edits left 18 source-file fingerprints un-re-grounded; re-grounded each via `meta_state_refresh_file_index` (mechanisms verified intact before refresh).
4. `placement-manifest.test.js` — `core/field-glossary.js` (new in Phase 2) was missing from `core/placement.yaml`; added with role `primitive`.
5. `meta-state-schema.test.js` — Phase 2 narrowed `meta_state_report` input to the `REPORT_FIELDS` subset; test updated from exact-equality to subset assertion.
6. `delivery-classify.test.js` — wrong script relative path (`scripts/…` → `tools/scripts/…`) + missing `--projects-dir`/`GATE_ROOT` isolation; fixed.

## Loop bookkeeping (ship gate)

- **Finding resolved:** `meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent` → resolved. Remediation realized: steering delivered as a pull pointer (not a silent push), delivery attested by classifier ledger rows, pull payloads (sidecar, `loop_describe`, `loop_get_instruction`) intact.
- **Change-log logged:** JIT branch-contract relocation — branch-union schemas moved from always-on-wire to at-invocation `invalid_field`/`empty_patch` payloads + shared field glossary; `change_target` the patch + batch tool handlers; `applies_to.tools` `[meta_state_patch, meta_state_batch, loop_describe]`. Per-tool invocation contracts preserved at the boundary (constraint finding `meta-260704T0959Z`).
- **Constraint-finding relationship note:** recorded on `meta-260704T0959Z` — invocation contracts preserved; the relocation is delivery-independent (contract *location* moved, contract *content* unchanged).

## Success criteria checklist

- [x] Live `tools/list` manifest-tool portion ≤ 40,000 B (39,905 B). Total ≤45 kB deferred (V1 split).
- [x] Combined SessionStart hook stdout ≤ 6,000 chars (5,120); sidecar payload + `*_source` flags unchanged.
- [x] `delivery-<sessionId>` rows present, idempotent (content-hash re-classify V5), `verifyRow`-clean, metadata-validation green.
- [x] Inbound gate emits pointer once per session (first prompt, suppress-token-gated V2); warn payload only on trigger; shim parity green.
- [x] `syn`-profile pointer visibility: documented-degradation recorded (transcript absent; no invented row).
- [x] `pnpm test:iter` green (2336/2336) incl. new tests.
- [x] `check_runtime_agnostic` clean for touched universal surfaces (inbound-gate, loop-introspect, field-glossary); session-start `.cjs` pre-existing static-check gap documented.
- [x] Ship-time loop bookkeeping: finding resolved, change-log logged, constraint-finding relationship note recorded.

## Residual / follow-on

1. **Total ≤45 kB** (non-manifest ~9.1 kB: 8 workflows + `update_r2_allowlist` + 3 `ask_*` agents) — separate workflow/agent-slimming phase (V1).
2. **Factory-hook pointer projection** (D3.1) — separate cross-surface alignment plan owns the `.factory` flip + `factory-hook-single-source.test.cjs` rewrite.
3. **`session-start-inject-*.cjs` runtime-agnostic static-check gap** — pre-existing; candidate for a `.cjs` → universal-helper migration.
4. **Stale `meta_state_ack` line** in `tool-selection-guide.md` — dropped from this plan (V6); standalone one-line docs commit.
5. **`syn`-profile live forensics** — run the classifier on the first unproxied `syn` session when that transcript is available (carried from brainstorm; no plan work).