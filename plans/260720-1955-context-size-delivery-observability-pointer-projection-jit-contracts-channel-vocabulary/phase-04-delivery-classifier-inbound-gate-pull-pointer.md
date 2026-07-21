---
phase: 4
title: "Delivery classifier + inbound-gate pull pointer"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 4: Delivery classifier + inbound-gate pull pointer

## Overview

The observability half. (A) New offline script `tools/scripts/delivery-classify.mjs` reads session transcripts, classifies first-call steering delivery as `full`/`lean`/`unknown` against run-time-recomputed surface floors, and appends `delivery-<sessionId>-<runTs>` ledger-event rows to the repo-root `runtime-state.jsonl` via core `appendLedgerEvent` (content-hash re-classify — Validation V5) — the loop *knows* delivery through its own queryable substrate (pull, not push). (B) The inbound gate is restructured to emit one steering pull-pointer line **once per session** (first `UserPromptSubmit`, via the existing suppress-token store — Validation V2) so a minimal pull path is advertised without a per-prompt tax.

## Context Links

- Research (file:line inventory + transcript JSONL facts): `plans/reports/research-260720-1921-runtime-state-inbound-gate-surface.md`
- Brainstorm §4.3 (classifier), §4.4 (D1 always-emit), Fork C (profile-env tagging rejected)
- bc39002 same-id corruption lesson: dispatch tool fail-closed pattern at `meta-state-dispatch-finding-tool.js:45-50,113-138,203`

## Key Insights (from research)

- `runtime-state.jsonl` lives at **repo root** (core/runtime-state.js:47,115) — not `.loop/`.
- `appendLedgerEvent(root, row)` is gating-free by design (runtime-state.js:9-14) and enforces NO schema/id-uniqueness — the script must self-validate and scan-then-skip (bc39002: corrupt same-id rows had to be operator-struck by hand).
  - > **🔴 Red Team (H2 — trust boundary + invented id regex):** `appendLedgerEvent` trusts its caller (docstring at runtime-state.js:100-104: "the caller has already done so via the tool's Zod input schema"). Every prior caller validated via a Zod tool schema; the classifier is the FIRST caller building rows from untrusted transcript input. The plan's claimed `id` `^[a-z0-9-]+$` invariant is **plan-invented** — `runtime-state-record-tool.js:25` is `id: z.string()` with NO regex, and `runtime-state-metadata-validation.test.js:99-110` validates only `row.metadata`, never `id`/`source_ref`/`fingerprint`. The test suite does NOT catch a malformed id. The script MUST add an explicit production-code `runtimeStateRecordTool.schema.safeParse(row)` step before append, and sanitize/validate `sessionId` (length cap + `^[a-z0-9-]+$` allowlist; skip+report on mismatch). Do not rely on the test suite to catch malformed rows.
- **Landmine:** `runtime-state-metadata-validation.test.js` scans the REAL repo `runtime-state.jsonl` — classifier rows must be schema-clean (flat scalars only, `id` `^[a-z0-9-]+$`, `source_ref` `^local:meta-state:.+$`, `fingerprint` v2) or the suite goes red.
- Script precedent: `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (🔴 Red Team A1/D5: the plan previously cited the bare filename as if it lived under `tools/scripts/`; it does NOT — cite the full path). Structure: core imports, `--root=` CLI, env escape hatch, verify-after-write. Verify the root `package.json` imports map covers `tools/scripts/*.mjs` for `#mastra/*`/`#lib/*` aliases before relying on them; otherwise use relative imports.
- Transcript facts: first `assistant` event with `message.usage` in file order = first API call; dedupe by `message.id` (chunked repeats share ids); pre-first-response lines = recorded injections (byte-sum); sessions with no usage fields → `unknown`.
  - > **🔴 Red Team (H7 — cache-token misclassification):** `usage.input_tokens` EXCLUDES `cache_read_input_tokens`. A cached second prompt (real transcript: `input_tokens:1854`, `cache_read_input_tokens:68096`) reports a tiny fresh-input number → classified `lean` for a session that actually received the full steering. This is the exact false-undercount the plan exists to fix. Use `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` as the delivered-token metric. Pin with a cached-second-prompt fixture.
- Inbound gate: thin adapter (98 lines); emits stdout JSON only on warn; silent otherwise. Restructure `main()` L89-95 to emit the pointer **once per session** (first `UserPromptSubmit`, gated by the suppress-token store — Validation V2); single `console.log(formatSoftWarning(output))`; always `exit(0)`. Shims byte-identical ×3 — **no shim edits** (behavior lands in the one universal file).
- Shim test `.claude/coordination/__tests__/inbound-state-gate.test.cjs` asserts silence on non-trigger paths — must be updated to expect the pointer line on the FIRST prompt of a session only (not every prompt). 🔴 Red Team (H8): the load-bearing change is the `contextWasInjected` helper (test:135-141, `additionalContext != null`) — once-per-session still makes it true on the first prompt, so the 4 `!contextWasInjected` assertions (250, 303-311) and warn-content checks (484-486) still need the helper rewritten to a warn-specific sentinel (e.g. `additionalContext.includes("INBOUND STATE GATE")` from `formatSoftWarning`) and all ~16 call sites re-audited. This is ~20-30 LOC, not "+~10 lines".

## Requirements

- Functional (classifier):
  - Input: `--root=` (default `resolveRoot()`), `--projects-dir=` (default `~/.claude/projects/<cwd-slug>/`), `--limit=N`; env escape hatch `DELIVERY_CLASSIFY_SKIP=1` (seed-file-index posture).
  - Per transcript: session id from top-level `sessionId`; first `assistant` event carrying `message.usage` (dedupe `message.id`, first-seen wins) → `first_call_input_tokens`; recorded bytes = byte-sum of lines before it; `model` from the event.
  - Floors recomputed at run time: MCP defs via live `tools/list` (spawn pattern from parity test, `LOOP_SURFACE=.claude`); hint payload floor from the pointer-projection builders' rendered size (Phase 3) — floors must never be hardcoded copies of stale constants.
    - > **🔴 Red Team (H4 — partial-write + over-engineering):** compute ALL floors UP FRONT in a single server spawn BEFORE any row is appended (single failure point). If the spawn fails, exit 1 before touching `runtime-state.jsonl` — never append rows then fail mid-batch (partial-write with no rollback). Per-session classification failure after floors are computed is non-fatal: skip that session, log, continue (the sidecar never holds a partial-batch state).
    - > **🔴 Red Team (F10 — soft-dependency resolution):** the soft dependency on Phase 3 builders must use explicit feature detection: `const ptrs = await import("../core/loop-introspect.js"); const buildD = ptrs.buildDiscoverabilityPointers ?? ptrs.buildDiscoverabilityHints; const buildP = ptrs.buildProcessPointers ?? ptrs.buildProcessHints;` — fall back to the full-text builders if the pointer builders don't exist (partial Phase 3 landing). A bare destructure that yields `undefined` → `TypeError` mid-classification after partial writes. Pin with a test against a mock loop-introspect lacking the pointer builders.
  - Class rule: `unknown` if no usage in the whole file; `full` if `first_call_input_tokens ≥ 0.8 × floor_tokens`; else `lean` (`floor_tokens ≈ floors_bytes / 4`). Threshold constant documented in the script header; tunable. 🔴 Red Team (H7): use `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` as the delivered-token count, NOT `input_tokens` alone (which excludes cache reads → cached sessions falsely `lean`).
  - Row: `{ affected_system: "meta-state-tools", kind: "ledger-event", id: "delivery-<sessionId>-<runTs>"` (versioned — Validation V5; latest-by-timestamp on read)`, source_ref: "local:meta-state:meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent", value: 1|0|null, delta: null, timestamp: <run time>, status: "active", metadata: { first_call_input_tokens, recorded_attachment_bytes, model, classified_at, transcript_content_hash } }` — flat scalars only. `transcript_content_hash` = SHA-256 of the transcript file bytes (or union of `message.id`s); drives re-classification on change.
  - Idempotency: `readRuntimeStateRows(root)` → existing `delivery-<sessionId>` + `kind==="ledger-event"` → `verifyRow(existing)` → skip **only if `transcript_content_hash` matches** (re-classify on change — Validation V5).
    - > **🔴 Red Team (C2 — no lock / no atomicity):** `appendLedgerEvent` uses `appendFileSync` (runtime-state.js:113-117) with NO lock. Two concurrent runs (two terminals, operator + CI) both read "no existing row", both append → DUPLICATE `delivery-<id>` rows (TOCTOU). AND a crash mid-append leaves a truncated JSON line → `runtime-state-metadata-validation.test.js:103` throws on `readRuntimeStateRows` and goes red repo-wide (bc39002 recovery posture). **Fix:** wrap the scan-then-append critical section in an atomic lock (lockfile / `O_EXCL`), build+`safeParse` the row JSON BEFORE touching the file (validate-then-append), and on the next run truncate any partial trailing line. Do NOT rely on verify-after-write to catch a half-write — it can't.
    - ✅ **VALIDATION V5 RESOLVED (H3) — content-hash re-classify.** Store a `transcript_content_hash` (SHA-256 of the transcript file bytes, or of the union of `message.id`s) in row metadata. On re-run: if an existing `delivery-<sessionId>` row's hash matches the current transcript → skip; if it differs (transcript grew / partial → complete) → re-classify and APPEND a new versioned row `delivery-<sessionId>-<runTs>`, with the read path taking latest-by-timestamp. This unfreezes partial transcripts (`unknown` → `full` once the session completes) and survives `verifyRow` fingerprint mismatches (a new row is appended, not blocked). `verifyRow` fail-closed on the *existing* row stays (report, don't mutate) but no longer blocks re-classification. Dropped: mtime-gate (misses recently-touched finished sessions). `<!-- Updated: Validation Session 1 - H3 content-hash re-classify -->`
  - Verify-after-write: re-read, print counts (scanned/classified/skipped/appended), exit 1 on incompleteness. 🔴 Red Team (H2): the FIRST production-code validation step is `runtimeStateRecordTool.schema.safeParse(row)` BEFORE `appendLedgerEvent`; verify-after-write is a backstop, not the primary gate.
- Functional (inbound gate):
  - New `buildSteeringPointer()` in `core/evaluate-inbound-gate.js` (co-located with the gate's other message-building; pure, testable). Text: `Loop steering (pull): loop_describe({tier:'warm'}) | hints: .claude/session-context.json | one: loop_get_instruction({key})`.
  - Restructure `hooks/universal/inbound-gate.js` main(): output = pointer line **once per session** (first `UserPromptSubmit` only, gated by the existing suppress-token store — see H13 resolution); on warn, keep side effects (suppress token L90, operator-message marker L91) and append `"\n\n" + context_message`; one stdout write; exit 0.
    - > **🔴 Red Team (H5 — throw → non-zero exit):** `main()` (L74-96) has NO try/catch. `buildSteeringPointer()` / `evaluateInboundGate()` call `findProjectRoot()` + fs reads that can throw (ENOENT on a worktree-cleanup race). A throw propagates → exit 1, no stdout, AND warn side-effects may have already run (marker written, no context shown). "always exit 0" requires a guard: wrap the whole main body in try/catch; in the catch emit a minimal degraded pointer-only line and STILL exit 0. Pin with a test that forces `buildSteeringPointer` to throw and asserts exit 0 + pointer-only output.
    - ✅ **VALIDATION V2 RESOLVED (H13) — emit once per session (option a).** The gate is ALREADY stateful (`SUPPRESS_WINDOW_MS = 30*60*1000` at evaluate-inbound-gate.js:21; suppress-token store at inbound-gate.js:80-88). Emit the pointer on the FIRST `UserPromptSubmit` of a session only, using that store (a `pointer_emitted` marker, same 30-min window semantics); subsequent prompts emit nothing. This removes the per-prompt tax AND the classifier self-inflation (the pointer no longer lands in every prompt's `additionalContext`). Dropped options: (b) always-emit + exclude-from-metric, (c) drop entirely. `<!-- Updated: Validation Session 1 - H13 once-per-session -->`
- Non-functional: classifier never feeds the session it classifies (post-hoc only); no new MCP tools; no changes to `runtime_state_record` preflight gating; hook stays surface-agnostic (runtime-agnostic.test.js L253-262 assertions stay green).

## Architecture

```
transcripts (~/.claude/projects/<slug>/*.jsonl)
   │  first assistant+usage event (dedupe message.id)
   ▼
classify vs run-time floors (live tools/list + pointer builders)
   │  full=1 / lean=0 / unknown=null
   ▼
appendLedgerEvent → runtime-state.jsonl (atomic lock + validate-then-append [C2];
   re-classify on transcript_content_hash change [V5]; verifyRow fail-closed)
   │
   ▼  read side: existing runtime_state_read (no new tooling)

FIRST UserPromptSubmit of a session → inbound-gate → stdout additionalContext:
   pointer line (once per session, suppress-token-gated [V2]) [+ "\n\n" + warn context when triggered]
```

## Related Code Files

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/scripts/delivery-classify.mjs` | Create (~150 lines, seed-file-index structure) | new | new test file |
| `tools/learning-loop-mastra/__tests__/delivery-classify.test.js` | Create: fixture transcripts (full/lean/unknown/no-usage/chunked message.id/malformed lines); idempotent re-run (0 new rows); verifyRow skip; schema-clean rows | new | — |
| `tools/learning-loop-mastra/core/evaluate-inbound-gate.js` | Modify: add `buildSteeringPointer()` | +~10 lines | new builder tests |
| `tools/learning-loop-mastra/hooks/universal/inbound-gate.js` | Modify: restructure L89-95 once-per-session emit (first prompt, suppress-token-gated — V2) + try/catch guard (H5) | ~15 lines | shim test update + contextWasInjected rewrite (H8) |
| `tools/learning-loop-mastra/core/evaluate-inbound-gate.test.js` | Modify: pointer builder unit tests | — | — |
| `.claude/coordination/__tests__/inbound-state-gate.test.cjs` | Modify: non-trigger paths expect pointer line; warn paths expect pointer + context; 🔴 H8: rewrite `contextWasInjected` helper (135-141) to warn-sentinel + audit ~16 call sites (250, 303-311, 484-486) | — | — |

**Function/interface checklist:** `appendLedgerEvent`/`readRuntimeStateRows`/`verifyRow` (reuse, unchanged); `resolveRoot` (`#lib/resolve-root.js`); `parseInput`/`extractPrompt`/`formatSoftWarning` (protocol-adapter, unchanged); `evaluateInboundGate` (decision contract unchanged); `buildSteeringPointer` (new); `writeSuppressToken`/`writeOperatorMessageMarker` (unchanged call sites).

## Dependency Map

- Independent of Phases 2/3 code (disjoint files); **soft dependency on Phase 3** for the hint-payload floor source (pointer builders). If Phase 3 hasn't landed, floor computation must tolerate the full-text builders — script takes whichever builder set exists (resolve at run time, not import-time constant).
- Feeds Phase 6 (classifier rows + syn-profile forensics).

## Implementation Steps (TDD)

### Step A — Tests Before
1. `delivery-classify.test.js` (RED): fixture-driven classification cases above; idempotency (second run appends 0); existing-row `verifyRow` guard; rows validate against the runtime-state row contract (same refinements as `runtime-state-record-tool.js` L47-71).
2. `evaluate-inbound-gate.test.js` additions (RED): `buildSteeringPointer()` returns the exact pointer line; decision contract unchanged.
3. Shim test updates (RED): non-trigger invocation emits pointer-only additionalContext; triggered emits pointer + warn context; exit 0 always.

### Step B — Refactor / Create
4. Write `tools/scripts/delivery-classify.mjs` per architecture (self-validating rows; scan-then-skip; verify-after-write).
5. Add `buildSteeringPointer()` to `core/evaluate-inbound-gate.js`; restructure `hooks/universal/inbound-gate.js` main().

### Step C — Tests After
6. A-tests GREEN; run adjacent: `runtime-state-fingerprint.test.js`, `runtime-state-metadata-validation.test.js`, `runtime-state-read-tool.test.js`, `inbound-state-runtime-state.test.js`, `runtime-agnostic.test.js`, `.claude/coordination/__tests__/inbound-state-gate.test.cjs`, `evaluate-inbound-gate.test.js`.
7. Live run: `node tools/scripts/delivery-classify.mjs --limit=5` against recent sessions → rows appear; re-run → 0 appended. Read back via `runtime_state_read` MCP tool (the loop-queryable path, not file grep).

### Step D — Regression gate
- `pnpm test:iter` green; real-repo metadata-validation test green with classifier rows present; `check_runtime_agnostic` clean.

## Test Scenario Matrix

| Scenario | Criticality | Covered by |
|---|---|---|
| full classification (input_tokens ≥ floor) | critical | A1 fixture |
| lean classification (9,322-token style) | critical | A1 fixture |
| unknown (no usage fields anywhere) | critical | A1 fixture |
| chunked events share message.id → first-seen wins | high | A1 fixture |
| re-run appends 0 duplicates | critical | A1 |
| existing-row fingerprint mismatch → skip + report, no append | critical | A1 (bc39002 regression) |
| malformed transcript line tolerated | high | A1 fixture |
| classifier rows pass real-repo metadata-validation test | critical | C6 |
| first prompt (non-triggered) emits pointer line only — once per session (V2) | critical | A3 |
| first prompt (triggered) emits pointer + warn context; side effects preserved (V2) | critical | A3 |
| shims byte-identical (no edits) | high | runtime-agnostic shims-in-sync |
| concurrent runs do not produce duplicate `delivery-<id>` rows (C2 lock) | critical | A1 (new) |
| half-write crash leaves no truncated line in `runtime-state.jsonl` (C2) | critical | A1 (new) |
| cached-second-prompt session classified `full`, not `lean` (H7) | critical | A1 (new) |
| partial transcript re-classified when it grows (H3 content-hash) | high | A1 (new) |
| malformed `sessionId` → skip+report, no row appended (H2) | high | A1 (new) |
| `buildSteeringPointer` throws → exit 0 + degraded pointer (H5) | high | A3 (new) |
| missing pointer builders → falls back to full-text builders (F10) | high | A1 (new) |

## Success Criteria

- [ ] `delivery-<sessionId>` rows for all recent sessions; re-run adds 0; all rows `verifyRow`-clean and metadata-validation-green
- [ ] Rows readable via `runtime_state_read` (loop-queryable, no file scraping)
- [ ] Inbound gate emits pointer line **once per session** (first prompt, suppress-token-gated — V2); warn payload only on trigger; all gate tests green (incl. contextWasInjected rewrite — H8)
- [ ] Floors recomputed at run time (no hardcoded byte constants for surfaces)

## Risk Assessment

- **Provider `usage` absence** → `unknown` class is expected and honest; sessions without usage also lack compliance metrics, nothing to disambiguate (brainstorm risk 4).
- **Floor staleness** → run-time recompute from live `tools/list` + current builders; 🔴 Red Team (H4): compute all floors UP FRONT in a single spawn before any append; on spawn failure exit 1 BEFORE touching the sidecar (no partial-write-with-no-rollback); per-session classify failure is non-fatal (skip+log+continue).
- **Same-id corruption repeat (bc39002)** → scan-then-skip + verifyRow fail-closed is the sanctioned pattern; A1 pins it. 🔴 Red Team (C2): add atomic lock + validate-then-append (TOCTOU + half-write). ✅ **VALIDATION V5 (H3):** content-hash re-classify + versioned `delivery-<sessionId>-<runTs>` rows (latest-wins on read) — partial transcripts no longer freeze at `unknown`; `verifyRow` mismatch no longer blocks re-classification.
- **Always-emit noise on every prompt** → ✅ **VALIDATION V2 (H13): emit once per session** via the existing suppress-token store — no per-prompt tax, no classifier self-inflation. (Phase 3 SessionStart pointer also advertises the pull path.)
- **Project-level UPS unverified on `syn`** → honesty flag carried to Phase 6 forensics; fallback = documented degradation, no corrective loop.
