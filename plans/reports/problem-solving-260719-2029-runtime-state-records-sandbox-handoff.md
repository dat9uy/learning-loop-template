# Problem-Solving Report — Runtime-State Records & Sandbox Hand-Off

**Plan:** `plans/260719-1428-central-skills-management/` (Phase 3 in progress)
**Date:** 2026-07-19
**Techniques:** Inversion Exercise (flip "the plan reads runtime-state back") + Simplification Cascade (F6 hash test already covers the npx-blocked case) + Meta-Pattern (fingerprint = row-integrity hash, so it must hash the row)
**Scope:** diagnosis only — no code changed.

## TL;DR

Your instinct is right: the runtime-state record path has real bugs (A, B, D — one already filed) **and** the sandbox-validation design is underdesigned to the point of being unwired (C). C is the Phase-3 blocker. The clean unblock already exists in the plan (F6 hash test, step 17) — the Q4 `ledger-event` hand-off is an over-design that introduced C. Fixing A/B/C/D is small, mostly independent, and closes 1 open finding + the unchecked plan action item.

---

## The bugs

### A — Fingerprint scope is too narrow (both `ledger-event` AND `budget-state`)

**Evidence:** `tools/learning-loop-mastra/core/runtime-state.js:59` (shared) and the duplicated `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js:10` (copy):

```js
const data = `${row.id}|${row.source_ref}|${row.value}|${row.delta}|${row.timestamp}`;
```

The hash **omits `affected_system`, `kind`, and `metadata`** — i.e. everything that distinguishes one row from another when the five hashed fields coincide. The read tool's own comment (`runtime-state-read-tool.js:24-26`) calls it a *"SHA-256 row-integrity hash… so callers can verify row integrity by default."* A row-integrity hash that excludes the payload (`metadata`), the kind, and the system cannot verify integrity.

**Already colliding in production `runtime-state.jsonl`:**
- `sha256:93725b69…` → **two distinct rows**: `product-idempotency-check` and `direct-pip-bypass-test` (same `id`+`timestamp`, different `metadata.action` / `metadata.experiment`).
- `sha256:79249677…` → `full-install-with-cleared-slot` and `forced-re-register-via-rename`.
- The re-pin rows share `id vnstock-device-slot-2026-05-08T10:17:23Z` across `affected_system:runtime-state` vs `affected_system:vnstock` — collide if timestamps match.

**Secondary:** nothing **verifies** the fingerprint on read — `runtime_state_read` returns it, no consumer re-computes + compares. So it is write-only decoration with a broken formula. (The repo's only fingerprint *test*, `__tests__/schema-fingerprint.test.cjs`, is the LibSQL storage schema — unrelated.)

**Resolution (implementing A):** widen the hash to cover the full row (`affected_system|kind|id|source_ref|value|delta|timestamp|metadata`); add a read-side verify helper (`verifyRow(row) → bool`) used by `runtime_state_read` compact path + the dispatch idempotency scan; add a regression test asserting two rows differing only in `metadata` produce distinct fingerprints (the exact collision above as the fixture).

---

### B — Read path divergence + dead code (incomplete DRY extraction)

**Evidence:** plan 260704-0301 extracted `readRuntimeStateRows` + `appendLedgerEvent` to `core/runtime-state.js` (L27-38, L73-81) to kill duplication. The **read tool was never migrated.** `runtime-state-read-tool.js` keeps:

- Its own `readSidecar` (L14-22): raw `JSON.parse(line)` → **throws** on one malformed line.
- The shared `readRuntimeStateRows` (L27-38): `try { JSON.parse } catch { null }` then `.filter(Boolean)` → **tolerates** malformed lines.

So MCP `runtime_state_read` **crashes** where every internal consumer (record tool, dispatch tool, SessionStart hook) survives. The read-tool test (`runtime-state-read-tool.test.js`) never feeds a malformed line → divergence untested.

Plus dead code in the read tool: `computeFingerprint` (L9-12, never called) and an unused `appendFileSync` import (L2).

**Resolution (implementing B):** delete the read tool's `readSidecar` + `computeFingerprint` + the unused import; import `readRuntimeStateRows` from `core/runtime-state.js`; add a malformed-line test (one bad row must not crash `runtime_state_read`; it is skipped, `total` reflects only valid rows).

---

### C — Same-id "correction" rows don't supersede + the sandbox hand-off is unwired

**Evidence (schema):** `schemas/runtime-state.schema.json:15-18` — `id` is `^a-z0-9-]+$` only, **no uniqueness**, no supersession field.

**Evidence (the "correction"):** commit 215cc0c appended a second row with **the same `id`** `npx-skills-mastra-roundtrip-2026-07-19` (timestamps 08:13:00 then 11:55:30), relying on `metadata.supersedes_fingerprint`. But every id-keyed reader returns the **first** match:

```js
// meta-state-dispatch-finding-tool.js:45-50
return rows.find((r) => r && r.id === target && r.kind === "ledger-event") || null;
```

→ returns the 08:13:00 row (the one with the corrupted `pending_execution` 7-deep nested array + stray closing-tag artifact), **not** the 11:55:30 "correction." The commit message's "superseding the transit-corrupted row" does not actually happen at any read site.

**Evidence (hand-off unwired):** the Q4 decision (`plan.md:143-159`) + phase-03 Risk Assessment (`L103`) say *"whichever sandbox can run npx executes the round-trip, writes a ledger-event, and Phase 3 reads it back to confirm."* Three failures:

1. **No sandbox is constructed or selected.** The only "sandbox" tooling is `workflow_runtime_probe` (returns a `probe_plan` + `per_stack_commands` — planning text) and `workflow_prepare_runtime_request` (approval-request text). Neither builds, detects, or routes to a runtime with `npx skills`. The current env (WSL2 + learning-loop bash gate) is exactly where `npx skills add` is blocked as a vendor/side-effect command. "Whichever sandbox can run npx" is hand-waved.
2. **The report-back loop is unwired.** The npx row carries `value:null`/`delta:null` + a `next_step` string. **No test** reads that row and asserts `metadata.hashes.{claude,factory,mastracode}` present + matching. F11/F12 are documented as "activate on that row" but no test code gates on a runtime-state row.
3. **The hand-off token is broken** (per the `find` evidence above) — appending the result as a same-id row can't supersede the placeholder.

**Inversion of the plan's premise dissolves this:** *a plan is static markdown — it cannot "read" runtime-state and "mark a criterion met."* Only an agent or a test does. "Phase 3 reads it back to confirm" is a category error. And `runtime-state.jsonl` is, by its own schema description, a **mutable** sidecar — coupling plan-completion to a file the inbound gate re-pins and that corrections append to (breaking `find`) is the wrong substrate.

**Simplification cascade:** if the criterion is met by a **test**, the npx ledger-event hand-off, the same-id correction mechanism, the sandbox selector, and the report-back loop are all unneeded. Phase 3 **already has** the gate — step 17 (`phase-03…md:78`): *"If sandbox can't run npx update, document the manual round-trip + assert manifest `hash` refreshes — F6 makes the hash load-bearing so the test re-computes + compares."* F6 + step 17 deterministically cover the npx-unavailable case with **no sandbox**.

**Resolution (implementing C):** drop the Q4 `ledger-event` hand-off from phase-03 (Risk Assessment L103 + plan.md Action Item L156); make the **F6 hash test** the sole npx-round-trip gate — real `npx` when available, hash-recompute-and-compare when not; strike/replace the corrupt same-id row (or, if kept for audit, stop using same-id appends as corrections — append a new distinct id with `metadata.supersedes: <prior-id>` and fix id-keyed `find` sites to resolve supersession, though that is larger scope than needed here).

---

### D — `metadata` schema validator (already an open finding)

**Finding:** `meta-260719T1858Z-runtime-state-record-s-metadata-param-z-record-z-unknown-acc` (open, `record-repair-gap`, `affected_system:runtime-state`).

**Evidence:** `runtime-state-record-tool.js:36` — `metadata: z.record(z.unknown()).optional()`. Accepts arbitrarily nested values; array-typed values corrupted in transit on the npx round-trip row (`pending_execution` → 7-deep nested arrays + stray `</item>` artifact), and **the row's fingerprint was computed over the corrupt payload** (this is Bug A's collision surface — the fingerprint omits `metadata`, so the corrupt and corrected rows *should* differ but the bug masks it; widening the fingerprint per A makes the corruption visible at hash time).

**Note:** the record tool validates **only Zod**, never the JSON Schema (`schemas/runtime-state.schema.json`); `metadata` in the schema is `{ "type": "object" }` with no `additionalProperties`/nesting constraints. So no validator rejects the nested-array artifact.

**Resolution (implementing D):** validate/sanitize nested arrays at the handler (reject, or flatten with a warning) **or** document a strings-only `metadata` contract on the tool description. Pairs with A — once the fingerprint covers `metadata`, a corrupt row gets a fingerprint distinct from its corrected sibling, making `supersedes_fingerprint` meaningful instead of decorative.

---

## Findings resolved / opened by implementing A+B+C+D

| Bug | meta-state action | Resolves | Evidence |
|-----|-------------------|----------|----------|
| A | **open** new finding `schema-drift`, `affected_system:runtime-state` | (new) fingerprint is not a row-integrity hash; collides in prod | `core/runtime-state.js:59`, `runtime-state-read-tool.js:10`, `runtime-state.jsonl` (collisions above) |
| B | **open** new finding `schema-drift`, `affected_system:runtime-state` | (new) read path diverges (throws vs tolerates) + dead code | `runtime-state-read-tool.js:9-22`, `core/runtime-state.js:27-38` |
| C | **open** new finding `loop-anti-pattern` (`subtype: escape-hatch-abuse` — same-id append-correction masquerades as supersession) | unchecked plan action item `plan.md:156`; unblocks Phase 3 | `runtime-state.schema.json:15-18`, `meta-state-dispatch-finding-tool.js:45-50`, `phase-03…md:103`, `plan.md:143-159` |
| D | **resolve** existing `meta-260719T1858Z…` | the open record-repair-gap finding | `runtime-state-record-tool.js:36` |

**Cascade:** A + D interact (wider fingerprint makes corruption hash-visible → `supersedes_fingerprint` becomes real). B is independent. C dissolves once the Q4 hand-off is dropped. C also retires the corrupt same-id row, which is the concrete instance D was filed against.

**Other things that fall out of fixing C (not bugs, just dead weight removed):**
- `workflow_runtime_probe` + `workflow_prepare_runtime_request` no longer need to be dragged into Phase 3 — they were only cited for the unwired hand-off framing.
- The `.mastracode` gap closure (F11) + mastra cross-surface parity (F12) become plain file-presence + byte-identity tests with no runtime-state dependency — simpler, deterministic, CI-runnable.

---

## Recommended fix plan (sketch — not started)

1. **A:** widen fingerprint to full row in `core/runtime-state.js`; deduplicate the copy in the read tool (folded into B); add `verifyRow` + read-side usage; regression test for the prod collision.
2. **B:** migrate `runtime_state_read` to `readRuntimeStateRows`; delete dead `computeFingerprint` + unused import; malformed-line test.
3. **D:** constrain `metadata` at the handler (reject non-string/array-bounded, or flatten + warn) **and** tighten `schemas/runtime-state.schema.json` (`additionalProperties` discipline + no unbounded nested arrays) — pick one path per D's finding. Then **resolve** `meta-260719T1858Z…`.
4. **C:** edit `phase-03…md` Risk Assessment + `plan.md` Action Item → gate on F6 hash test, drop the ledger-event hand-off; replace/strike the corrupt same-id row; make F11/F12 plain tests (no runtime-state gate). Then **open** the C finding and mark the plan action item done.

A, B, D are independent and cheap. C is the Phase-3 unblock and the only one that edits the plan.

---

## Unresolved questions

1. Record A/B/C/D as meta-state findings (with `evidence_code_ref` so the loop re-grounds them) before fixing — or fix first, then record the change-log? (Recommend: record A/B/C now; D already exists — resolve it as part of the fix.)
2. For C's same-id correction: minimal fix = **replace** the corrupt row in `runtime-state.jsonl` (one-line edit, no schema change), vs. proper fix = add a `superseded_by`/`supersedes` field to the schema + teach id-keyed `find` sites to resolve supersession. Minimal is enough if we drop the hand-off (no more same-id appends); proper only if correction-by-append stays. Which scope?
3. For D: reject nested arrays at the handler, or document a strings-only `metadata` contract? (Reject is safer; strings-only is less churn but narrows the channel. The finding leaves both open.)

---

## Update — 2026-07-20: A+B+D planned; B-widening sequenced after

A plan now exists for A+B+D: `plans/260719-2201-runtime-state-record-integrity/` (`--deep --tdd`; red-team passed; validation locked 4 decisions). C remains a separate plan-edit to `plans/260719-1428-central-skills-management/` Phase 3 and is out of scope there too.

**Locked decisions (validation):** (1) hash migration = **rewrite `runtime-state.jsonl`** to v2 fingerprints (one-time idempotent script; `verifyRow` v2-only, no version field; `supersedes_fingerprint` accepted as a stale v1 ref — no JS reader); (2) corrupt dispatch row = **fail-closed** (`corrupt_dispatch_row` refusal + gate-log); (3) B scope in 260719-2201 = **read tool only** (clean sequencing — A's `verifyRow` wiring lands on the cleaned read tool); **B-widening decided as a follow-up AFTER 260719-2201 completes** (see below); (4) D validation = **Zod `.refine` rejecting nested arrays + doc-only schema**.

**B-widening — sequenced after the A+B+D plan (operator decision: widen B, just not inside 260719-2201):** the scout found B's read tool is NOT the only own-parse copy of the `runtime-state.jsonl` read path. Two more copies remain and **will be consolidated into `readRuntimeStateRows` in a follow-up plan after 260719-2201 ships**, not inside the A+B+D fix (kept separate because `inbound-state.js` swap changes inbound-gate behavior and `file-readers.js` is a rows→observations projection — both need explicit behavior-change tests that belong in their own plan):

1. `tools/learning-loop-mastra/core/inbound-state.js:18-30` — its own `readSidecar` wraps the whole read in one try/catch and **fail-opens to `[]`** on a single malformed line → silent total valid-row loss. Swapping to the shared `readRuntimeStateRows` (skip-malformed, return valid rows) is a behavior change to the inbound gate and needs explicit tests.
2. `tools/learning-loop-mastra/core/file-readers.js:41-122` — `readRuntimeObservations` reads `runtime-state.jsonl` with its own per-line `JSON.parse` (try/catch continue — functionally equivalent to the shared helper) then **projects rows into observation objects**. A moderate refactor (parse swap + keep the projection).

These are tracked in the meta-state finding `meta-260719T2201Z-three-own-parse-copies-of-the-runtime-state-jsonl-read-path` (open, `mechanism_check` on, `evidence_code_ref: tools/learning-loop-mastra/core/inbound-state.js:18`) so the follow-up B-widening plan (after 260719-2201) consolidates them into `readRuntimeStateRows` with the required behavior-change tests. A third, historical copy of the v1 fingerprint formula at `scripts/convert-ledger-to-sidecar.mjs:24` is left as-is (idempotent, untested, historical) with a one-line legacy comment.
