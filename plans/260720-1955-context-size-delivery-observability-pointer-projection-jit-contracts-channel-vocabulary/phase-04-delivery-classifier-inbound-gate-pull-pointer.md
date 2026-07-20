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

The observability half. (A) New offline script `tools/scripts/delivery-classify.mjs` reads session transcripts, classifies first-call steering delivery as `full`/`lean`/`unknown` against run-time-recomputed surface floors, and appends idempotent `delivery-<sessionId>` ledger-event rows to the repo-root `runtime-state.jsonl` via core `appendLedgerEvent` — the loop *knows* delivery through its own queryable substrate (pull, not push). (B) The inbound gate is restructured to always emit one steering pull-pointer line (~15–20 tokens) so a minimal pull path is advertised on every prompt, lean profile or not.

## Context Links

- Research (file:line inventory + transcript JSONL facts): `plans/reports/research-260720-1921-runtime-state-inbound-gate-surface.md`
- Brainstorm §4.3 (classifier), §4.4 (D1 always-emit), Fork C (profile-env tagging rejected)
- bc39002 same-id corruption lesson: dispatch tool fail-closed pattern at `meta-state-dispatch-finding-tool.js:45-50,113-138,203`

## Key Insights (from research)

- `runtime-state.jsonl` lives at **repo root** (core/runtime-state.js:47,115) — not `.loop/`.
- `appendLedgerEvent(root, row)` is gating-free by design (runtime-state.js:9-14) and enforces NO schema/id-uniqueness — the script must self-validate and scan-then-skip (bc39002: corrupt same-id rows had to be operator-struck by hand).
- **Landmine:** `runtime-state-metadata-validation.test.js` scans the REAL repo `runtime-state.jsonl` — classifier rows must be schema-clean (flat scalars only, `id` `^[a-z0-9-]+$`, `source_ref` `^local:meta-state:.+$`, `fingerprint` v2) or the suite goes red.
- Script precedent: `seed-file-index.mjs` (core imports, `--root=` CLI, env escape hatch, verify-after-write). Import alias `#mastra/*` → `tools/learning-loop-mastra/*` (root package.json imports map).
- Transcript facts: first `assistant` event with `message.usage` in file order = first API call; dedupe by `message.id` (chunked repeats share ids); pre-first-response lines = recorded injections (byte-sum); sessions with no usage fields → `unknown`.
- Inbound gate: thin adapter (98 lines); emits stdout JSON only on warn; silent otherwise. Restructure `main()` L89-95 to always emit; single `console.log(formatSoftWarning(output))`; always `exit(0)`. Shims byte-identical ×3 — **no shim edits** (behavior lands in the one universal file).
- Shim test `.claude/coordination/__tests__/inbound-state-gate.test.cjs` asserts silence on non-trigger paths — must be updated to expect the pointer line everywhere.

## Requirements

- Functional (classifier):
  - Input: `--root=` (default `resolveRoot()`), `--projects-dir=` (default `~/.claude/projects/<cwd-slug>/`), `--limit=N`; env escape hatch `DELIVERY_CLASSIFY_SKIP=1` (seed-file-index posture).
  - Per transcript: session id from top-level `sessionId`; first `assistant` event carrying `message.usage` (dedupe `message.id`, first-seen wins) → `first_call_input_tokens`; recorded bytes = byte-sum of lines before it; `model` from the event.
  - Floors recomputed at run time: MCP defs via live `tools/list` (spawn pattern from parity test, `LOOP_SURFACE=.claude`); hint payload floor from the pointer-projection builders' rendered size (Phase 3) — floors must never be hardcoded copies of stale constants.
  - Class rule: `unknown` if no usage in the whole file; `full` if `first_call_input_tokens ≥ 0.8 × floor_tokens`; else `lean` (`floor_tokens ≈ floors_bytes / 4`). Threshold constant documented in the script header; tunable.
  - Row: `{ affected_system: "meta-state-tools", kind: "ledger-event", id: "delivery-<sessionId>", source_ref: "local:meta-state:meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent", value: 1|0|null, delta: null, timestamp: <run time>, status: "active", metadata: { first_call_input_tokens, recorded_attachment_bytes, model, classified_at } }` — flat scalars only.
  - Idempotency: `readRuntimeStateRows(root)` → existing `delivery-<sessionId>` + `kind==="ledger-event"` → `verifyRow(existing)` → skip (fail-closed on fingerprint mismatch: report, do not append).
  - Verify-after-write: re-read, print counts (scanned/classified/skipped/appended), exit 1 on incompleteness.
- Functional (inbound gate):
  - New `buildSteeringPointer()` in `core/evaluate-inbound-gate.js` (co-located with the gate's other message-building; pure, testable). Text: `Loop steering (pull): loop_describe({tier:'warm'}) | hints: .claude/session-context.json | one: loop_get_instruction({key})`.
  - Restructure `hooks/universal/inbound-gate.js` main(): output = pointer line always; on warn, keep side effects (suppress token L90, operator-message marker L91) and append `"\n\n" + context_message`; one stdout write; exit 0.
- Non-functional: classifier never feeds the session it classifies (post-hoc only); no new MCP tools; no changes to `runtime_state_record` preflight gating; hook stays surface-agnostic (runtime-agnostic.test.js L253-262 assertions stay green).

## Architecture

```
transcripts (~/.claude/projects/<slug>/*.jsonl)
   │  first assistant+usage event (dedupe message.id)
   ▼
classify vs run-time floors (live tools/list + pointer builders)
   │  full=1 / lean=0 / unknown=null
   ▼
appendLedgerEvent → runtime-state.jsonl (scan-then-skip by id, verifyRow fail-closed)
   │
   ▼  read side: existing runtime_state_read (no new tooling)

every UserPromptSubmit → inbound-gate → stdout additionalContext:
   pointer line [+ "\n\n" + warn context when triggered]
```

## Related Code Files

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/scripts/delivery-classify.mjs` | Create (~150 lines, seed-file-index structure) | new | new test file |
| `tools/learning-loop-mastra/__tests__/delivery-classify.test.js` | Create: fixture transcripts (full/lean/unknown/no-usage/chunked message.id/malformed lines); idempotent re-run (0 new rows); verifyRow skip; schema-clean rows | new | — |
| `tools/learning-loop-mastra/core/evaluate-inbound-gate.js` | Modify: add `buildSteeringPointer()` | +~10 lines | new builder tests |
| `tools/learning-loop-mastra/hooks/universal/inbound-gate.js` | Modify: restructure L89-95 always-emit | ~10 lines | shim test update |
| `tools/learning-loop-mastra/core/evaluate-inbound-gate.test.js` | Modify: pointer builder unit tests | — | — |
| `.claude/coordination/__tests__/inbound-state-gate.test.cjs` | Modify: non-trigger paths expect pointer line; warn paths expect pointer + context | — | — |

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
| non-trigger prompt emits pointer line only | critical | A3 |
| triggered prompt emits pointer + warn context; side effects preserved | critical | A3 |
| shims byte-identical (no edits) | high | runtime-agnostic shims-in-sync |

## Success Criteria

- [ ] `delivery-<sessionId>` rows for all recent sessions; re-run adds 0; all rows `verifyRow`-clean and metadata-validation-green
- [ ] Rows readable via `runtime_state_read` (loop-queryable, no file scraping)
- [ ] Inbound gate emits pointer on every prompt; warn payload only on trigger; all gate tests green
- [ ] Floors recomputed at run time (no hardcoded byte constants for surfaces)

## Risk Assessment

- **Provider `usage` absence** → `unknown` class is expected and honest; sessions without usage also lack compliance metrics, nothing to disambiguate (brainstorm risk 4).
- **Floor staleness** → run-time recompute from live `tools/list` + current builders; script fails loudly if the server can't spawn (no silent fallback to constants).
- **Same-id corruption repeat (bc39002)** → scan-then-skip + verifyRow fail-closed is the sanctioned pattern; A1 pins it.
- **Always-emit noise on every prompt** → bounded at ~15–20 tokens; uniform emission chosen over stateful logic (KISS; no staleness to get wrong).
- **Project-level UPS unverified on `syn`** → honesty flag carried to Phase 6 forensics; fallback = documented degradation, no corrective loop.
