# SP2 Design Verification Report

> **Verdict:** The locked design is implementation-ready. Two **CRITICAL** findings (C-1, C-2) and eight lower-severity findings must be addressed in the plan. The locked enums, output shape, and tool surface do not collide with the codebase. The 36-test delta and 548 target are realistic.
>
> Verified: 2026-06-03 against the actual codebase. Baseline confirmed via `pnpm test` (512 tests passing).

---

## 1. Schema integration check

### No collisions

The two new fields do **not** collide with any existing field in `metaStateFindingEntrySchema` (`tools/learning-loop-mcp/core/meta-state.js:23-43`).

**Current fields (in declaration order):**

1. `entry_kind` (literal `"finding"`)
2. `category` (enum)
3. `severity` (enum)
4. `affected_system` (enum)
5. `description` (string)
6. `subtype` (optional string)
7. `evidence_journal` (optional string)
8. `evidence_code_ref` (optional string)
9. `evidence_test` (optional string)
10. `status` (optional enum)

**New fields:** `mechanism_check`, `code_fingerprint`. Neither name exists. **OK.**

### Recommended field order

Append at the end, after `status`, for stable JSON serialization. The 18 existing entries in `meta-state.jsonl` have no `mechanism_check` or `code_fingerprint` keys, so the schema migration is purely additive (Zod `z.optional()` strips them on missing). Recommended final field order:

```js
export const metaStateFindingEntrySchema = z.object({
  entry_kind: z.literal("finding").default("finding"),
  category: z.enum([...]).describe("Category of the finding"),
  severity: z.enum([...]).describe("Severity level"),
  affected_system: z.enum([...]).describe("Which system is affected by this finding"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  subtype: z.string().optional().describe("..."),
  evidence_journal: z.string().optional().describe("Path to related journal file"),
  evidence_code_ref: z.string().optional().describe("Code reference, e.g. path/to/file.js:line"),
  evidence_test: z.string().optional().describe("Test file reference"),
  status: z.enum(["reported"]).optional().describe("Status — ..."),
  // NEW (SP2):
  mechanism_check: z.boolean().optional().describe("Opt-in flag: include this finding in grounding checks. Default false. When true, checkGrounding computes and stores a SHA-256 fingerprint of evidence_code_ref."),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional().describe("SHA-256 of the file at evidence_code_ref at the time of last successful check. Set by SP2 on first check; updated by meta_state_refresh_fingerprint on explicit refresh."),
});
```

### CRITICAL — `metaStateReportTool` silently drops the new fields

`tools/learning-loop-mcp/tools/meta-state-report-tool.js:14-22` does this:

```js
schema: metaStateFindingEntrySchema.shape,
handler: async ({
  category, subtype, severity, affected_system, description,
  evidence_journal, evidence_code_ref, evidence_test,
}) => { ... }
```

The schema is exposed in full, but the handler explicitly destructures only the existing 8 fields. **`mechanism_check` and `code_fingerprint` would be silently dropped.** A new entry reported via `metaStateReportTool` cannot opt into grounding.

**Resolution required in the plan** (see C-3 in §6): either (a) extend the handler to accept and store `mechanism_check` in the entry, or (b) add a separate `meta_state_arm_grounding` tool, or (c) require the agent to call `meta_state_resolve`-style update path to set the field.

### Backward compat is OK

The 18 existing `meta-state.jsonl` entries do not have `mechanism_check` or `code_fingerprint`. The Zod schema parses them with `undefined` for both new fields. All 512 existing tests pass after the schema change (predicted; verifiable by `pnpm test` after the schema edit).

### `metaStateReportTool` writes nested `evidence.code_ref`, not top-level

`tools/learning-loop-mcp/tools/meta-state-report-tool.js:34-42` constructs the entry as:

```js
evidence: {
  ...(evidence_journal && { journal: evidence_journal }),
  ...(evidence_code_ref && { code_ref: evidence_code_ref }),
  ...(evidence_test && { test: evidence_test }),
},
```

Note: the top-level `evidence_code_ref` field is **not** set on newly reported entries. The SP1 derive function already handles this via the `entry.evidence_code_ref ?? entry.evidence?.code_ref` fallback (`tools/learning-loop-mcp/core/derive-status.js:66`). **SP2 must use the same fallback** (see C-1 in §6).

---

## 2. Pattern alignment — SP1 tool vs SP2 tool

### Aligned (mirror SP1)

| Aspect | SP1 (`meta_state_derive_status`) | SP2 (`meta_state_check_grounding`) | Match? |
|---|---|---|---|
| `codeContext` source | `resolveRoot()` + `process.env` | `resolveRoot()` + `process.env` | ✅ |
| Test-runner subprocess | `spawnSync("pnpm", ["test", "--", fullPath], { cwd: root, timeout: 30_000 })` | Same | ✅ |
| Test-runner cache | `Map` keyed by `${fullPath}:${mtimeMs}` | Same pattern recommended | ✅ |
| Gate log call | `appendGateLog(root, { timestamp, tool, id, ... })` | Same | ✅ |
| `entry_not_found` error | `{ error: "entry_not_found", id }` | Same | ✅ |
| `context_load_failed` error | `{ error: "context_load_failed", reason: err.message }` | Same | ✅ |
| Agent-callable (no `OPERATOR_MODE` check) | Yes | Should be same | ⚠️ (plan must confirm) |
| Pure function in `core/`, tool in `tools/` | Yes | Yes | ✅ |
| Test files in `__tests__/` | `__tests__/derive-status.test.js`, `__tests__/meta-state-derive-status-tool.test.js` | `__tests__/check-grounding.test.js`, `__tests__/meta-state-check-grounding-tool.test.js`, `__tests__/meta-state-refresh-fingerprint-tool.test.js` | ✅ |

### Divergences the plan must reconcile

**D-1: Auto-record (tool-layer mutation) breaks SP1's "verifier never mutates" promise.**

SP1's `meta_state_derive_status` is strictly read-only. SP2's `meta_state_check_grounding` mutates the entry on first call (auto-records `code_fingerprint`). The plan should document this as an explicit deviation: SP2's check tool is a **verifier + first-time recorder**. The design's Approach A rationale ("check is a verifier (read + idempotent first-time record)") already covers this; the plan's Phase 2 (tool spec) must echo it.

**D-2: `codeContext` shape mismatch with SP1.**

SP1's `codeContext` is `{ root, run_tests?, test_runner?, test_passed?, now?: () => number }` (`plans/260602-sp1-derive-status/plan.md` line 35). SP2's `codeContext` is `{ root, run_tests?, test_passed? }` per the locked design. The plan's Phase 1 must add `now?: () => number` to the SP2 `codeContext` shape because the unit test list explicitly requires:
- Test T-23: "uses injected now() for deterministic checked_at"
- Test T-24: "computes duration_ms via injected now()"

Without `now` in the `codeContext` shape, these two tests cannot pass. **Resolution: extend the SP2 `codeContext` to `{ root, run_tests?, test_passed?, now?: () => number }` (mirroring SP1).**

**D-3: Output shape uses a nested `grounding` object (SP1 uses `derivation`).**

SP1: `{ id, raw_status, derived_status, derivation: { kind, signals, ... }, drift, recommendation }`
SP2: `{ id, raw_status, grounding: { evidence_code_ref, code_ref_exists, code_ref_hash, code_fingerprint, hash_match, tests_referenced, tests_run, test_passed, checked_at, duration_ms }, status, drift_kind, fingerprint_was_recorded }`

The shapes are semantically equivalent (verifier output) but field names diverge. **No collision** (different field names: `derivation` vs `grounding`, `derived_status` vs `status`, `drift` vs `drift_kind`, `recommendation` vs `fingerprint_was_recorded`). The plan should call this out as a deliberate divergence — the agent will see two different shapes depending on which tool it calls. If desired, the plan could renumber the output to match SP1's pattern more closely, but the locked design is internally consistent.

**D-4: `runTest` (test-runner integration) is a private function in SP1's tool file.**

SP1's `runTest` is defined inside `tools/meta-state-derive-status-tool.js:17-32` and not exported. SP2's plan should follow the same pattern — keep `computeFileHash` and any test-runner wrapper inside the tool file (or in `core/check-grounding.js` if the test runner is needed by the pure function). The locked design says the pure function does NOT call subprocesses (H-3 mirror) — only the tool does. **Plan should place `runTest` in the tool file, not the core file.**

**D-5: SP2's `meta_state_refresh_fingerprint` is a new pattern (no SP1 analog).**

The refresh tool mutates the entry via `updateEntry(root, id, { code_fingerprint: "sha256:<new>" })`. The plan should mirror the SP0 `metaStateLogChangeTool` pattern for mutation tools: error shape on failure, gate log on success, no `OPERATOR_MODE` gate.

**D-6: SP2's pure function returns nested `grounding` object — but the "grounding" name overlaps with the SP1 `derivation.signals` (no, it doesn't, but the plan should re-check the loop-introspect layer for any consumer that keys on `derivation`.)**

Searched: no consumer of `derivation` exists in `tools/learning-loop-mcp/core/loop-introspect.js` or elsewhere. The `grounding` namespace is free.

---

## 3. Status/drift enum compatibility

### Enums side by side

**SP1 (locked):**

- `META_STATE_DERIVATION_KINDS` (4): `mechanism-shipped`, `code-only`, `code-missing`, `no-signals`
- `META_STATE_DERIVED_STATUSES` (3): `resolved-by-mechanism`, `active-no-signal`, `active-uncertain`
- `META_STATE_RECOMMENDATIONS` (4): `no_action`, `resolve`, `investigate`, `log_drift`

**SP2 (locked):**

- `META_STATE_GROUNDING_STATUSES` (4): `grounded`, `drifted`, `unknown`, `skipped`
- `META_STATE_GROUNDING_DRIFT_KINDS` (3): `hash_mismatch`, `code_missing`, `test_failed`

### Name-collision check

| SP2 value | SP1 equivalent | Collision? |
|---|---|---|
| `grounded` (status) | none | ✅ |
| `drifted` (status) | none (SP1 has boolean `drift`, not status) | ✅ |
| `unknown` (status) | none | ✅ |
| `skipped` (status) | none | ✅ |
| `hash_mismatch` (drift_kind) | none | ✅ |
| `code_missing` (drift_kind) | SP1 has `code-missing` (with dash) | ⚠️ Different name; underscore vs dash. See "Casing divergence" below. |
| `test_failed` (drift_kind) | none | ✅ |

### Casing divergence — `code_missing` (SP2) vs `code-missing` (SP1)

**Important:** SP1's `derivation.kind` uses `"code-missing"` (dash); SP2's `drift_kind` uses `"code_missing"` (underscore). These are **distinct string values** in the JSONL. The plan should reconcile:

- Option A: **Unify to `"code-missing"`** (dash) for both SP1 and SP2. The plan would need to either rename SP1's enum value (lock change) or document the divergence.
- Option B: **Accept divergence** — different namespace, different shape, the strings won't be confused. The plan documents it as a deliberate stylistic choice.

**Recommendation:** Option B (accept) is lower-risk. The values are in different JSON paths (`derivation.kind` vs `drift_kind`). The plan should add a comment in `core/check-grounding.js` cross-referencing SP1's `code-missing` for clarity. The locked design already chose underscore; do not change it now.

### Agent-confusion risk

The two tools return similar-but-different shapes. The agent calling `meta_state_derive_status` and then `meta_state_check_grounding` on the same entry will see:

- SP1: `derived_status: "active-uncertain"`, `derivation.kind: "code-only"`, `drift: false`, `recommendation: "no_action"`
- SP2: `status: "skipped"` (because `mechanism_check !== true`), `drift_kind: null`

This is correct — SP2's `skipped` covers the "no opt-in" case, while SP1's `code-only` would only fire if the agent had opted in. **Plan should add a test that exercises both tools on the same entry with `mechanism_check: false` to lock in the divergent behavior** (L-1 mitigation: explicit test prevents future refactors from confusing the two outputs).

---

## 4. Test budget reality check

### Actual baseline: **512 tests** (confirmed by `pnpm test` output)

```
ℹ tests 512
ℹ suites 83
ℹ pass 512
ℹ fail 0
```

**SP1 plan claimed 475 baseline; actual was 512 at the time of the SP1 plan.** The 36-test delta from SP1 (24 unit + 10 tool + 2 acceptance) is correct. The arithmetic in the SP2 design (548 total) is correct.

### New total after SP2: **548 tests** (512 + 36)

| File | New tests |
|---|---|
| `__tests__/check-grounding.test.js` | 24 |
| `__tests__/meta-state-check-grounding-tool.test.js` | 8 |
| `__tests__/meta-state-refresh-fingerprint-tool.test.js` | 2 |
| `__tests__/sp2-check-grounding-acceptance.test.js` | 2 |
| **Total** | **36** |
| **Project total** | **548** |

### Test count by directory (current state)

- `tools/**/*.test.js`: **51** files
- `.claude/coordination/__tests__/*.test.cjs`: **7** files
- `.factory/hooks/__tests__/*.test.cjs`: **1** file
- **Total:** **59** test files; **512** individual tests

The `pnpm test` script (`package.json:23`) is `node --test 'tools/**/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs'`. The 4 new SP2 test files match the first glob and will be picked up automatically. **No test runner changes needed.**

---

## 5. Manifest pattern

### Current state

**`tools/learning-loop-mcp/tools/manifest.json`** has 49 entries (the flat array `server.js` reads). The 10 meta-state-* tools are:

```
1. ./tools/meta-state-report-tool.js          (line 41)
2. ./tools/meta-state-list-tool.js            (line 42)
3. ./tools/meta-state-ack-tool.js             (line 43)
4. ./tools/meta-state-resolve-tool.js         (line 44)
5. ./tools/meta-state-promote-rule-tool.js    (line 45)
6. ./tools/loop-describe-tool.js              (line 46)
7. ./tools/meta-state-sweep-tool.js           (line 47)
8. ./tools/meta-state-log-change-tool.js      (line 48)
9. ./tools/meta-state-derive-status-tool.js   (line 49)  <-- SP1's add (last)
```

The last line (line 49) is:
```json
{ "file": "./tools/meta-state-derive-status-tool.js", "export": "metaStateDeriveStatusTool" }
```

### Manifest order is insertion order, not alphabetical

The existing manifest is in **insertion order** (alphabetical-ish but with new tools appended at the end). SP1 added `meta-state-derive-status-tool.js` at the very end.

### Recommended position for the 2 new lines

**Append at the end** (after line 49), per SP1's pattern. Final lines:

```json
{ "file": "./tools/meta-state-derive-status-tool.js", "export": "metaStateDeriveStatusTool" },
{ "file": "./tools/meta-state-check-grounding-tool.js", "export": "metaStateCheckGroundingTool" },
{ "file": "./tools/meta-state-refresh-fingerprint-tool.js", "export": "metaStateRefreshFingerprintTool" }
```

### `agent-manifest.json` is out of sync (NOT in scope, but worth noting)

`tools/learning-loop-mcp/agent-manifest.json:48-52` has a `meta_state` group listing only 5 tools:
```json
"meta_state": {
  "description": "...",
  "tools": ["meta_state_report", "meta_state_list", "meta_state_ack", "meta_state_resolve", "meta_state_promote_rule"]
}
```

This is **already out of sync** with `manifest.json` — missing `meta_state_sweep`, `meta_state_log_change`, `meta_state_derive_status` (SP0, SP1). The plan should either:

- **Option A:** Update `agent-manifest.json` to add the 2 new tools (and optionally backfill the SP0/SP1 ones). Trivial fix, no harm.
- **Option B:** Leave `agent-manifest.json` out of scope (the loop-describe tool reads from `manifest.json`, not `agent-manifest.json`, for tool listings — see `loop-describe-tool.js`).

**Recommendation:** Option A. Including the 2 new tools keeps `agent-manifest.json` consistent with the visible MCP tool list. The plan's Phase 3 (manifest registration) should add **2 lines to `tools/manifest.json` + 2 entries to `agent-manifest.json` meta_state group**.

### Manifest entry-point verification

`tools/learning-loop-mcp/server.js:18-24` reads `manifest.json` and calls `safeImport(mod.file, root)` for each entry. `safeImport` (`tools/learning-loop-mcp/tool-registry.js:5-15`) catches import errors. The plan's Phase 3 should verify the new tools load successfully — either by booting the MCP server (`pnpm gate:server` and reading the startup log) or by unit-testing the import path. The current `loop-describe.test.js` validates the manifest is valid JSON; the plan can extend that test (or add a new one) to assert the 2 new files resolve and export the expected names.

---

## 6. Risk table for the SP2 plan

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| **C-1** | CRITICAL | Legacy `evidence.code_ref` fallback: 8 of 18 existing findings store the code_ref nested, not at top-level. The SP1 function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref`. SP2 must do the same. | Pure function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref` (mirror SP1 C-1). Unit test T-21 covers the legacy case. |
| **C-2** | CRITICAL | The plan must specify how `mechanism_check: true` gets set on an entry. The `metaStateReportTool` handler (`tools/learning-loop-mcp/tools/meta-state-report-tool.js:14-22`) destructures only 8 fields; `mechanism_check` would be silently dropped. | Plan must either (a) extend the report tool's handler to accept and store `mechanism_check`, OR (b) add a new `meta_state_arm_grounding({ id, on: true })` tool that calls `updateEntry(root, id, { mechanism_check: true })`. **Recommendation: Option (a)** — fewer surface area; mirrors how `subtype` is passed through. Add unit test for the report tool's new behavior. |
| **C-3** | HIGH | `codeContext` shape mismatch: locked design says `{ root, run_tests?, test_passed? }`, but the test list requires `now?: () => number` (T-23, T-24). | Extend `codeContext` to `{ root, run_tests?, test_passed?, now?: () => number }`. Mirrors SP1. Plan should add this to the Phase 1 spec. |
| **H-1** | HIGH | `updateEntry` returns `null` when entry id is not found, `"version_mismatch"` on CAS failure. The auto-record and refresh tool paths both call `updateEntry`. The plan must handle these returns gracefully. | Tool layer: if `updateEntry` returns `null`, log a warning and continue (return the computed `status: "grounded"` without `fingerprint_was_recorded: true`). If `"version_mismatch"`, log a warning. Unit test the null branch. |
| **H-2** | HIGH | `code_fingerprint` regex format drift: `^sha256:[a-f0-9]{64}$`. If the auto-record computes a hash and the schema rejects it on write, the entry is partially mutated. | The `computeFileHash` function returns the exact format. The schema enforces it on read. Unit test T-25: `computeFileHash` returns a string matching the regex. Acceptance: a recorded fingerprint round-trips through `readRegistry` without modification. |
| **H-3** | HIGH | `meta_state_refresh_fingerprint` called on a non-grounded entry (`mechanism_check !== true` or missing). | Locked design already specifies: return `{ error: "not_grounded", id, mechanism_check, reason }`. Add unit test T-26. |
| **H-4** | HIGH | `meta_state_refresh_fingerprint` called when `evidence_code_ref` is missing or file doesn't exist. | Locked design specifies: return `{ error: "code_missing", id, evidence_code_ref }` for missing file. Add unit test T-27 for the no-evidence_code_ref case. |
| **M-1** | MEDIUM | Path semantics: absolute paths treated as absolute, relative paths joined with `codeContext.root`, non-string `evidence_code_ref` handled defensively. | Mirror SP1 path tests (T-17, T-18, T-19 in SP1's list). Add to SP2's test list. |
| **M-2** | MEDIUM | Auto-record idempotency: the second call to `check_grounding` must not re-write `code_fingerprint` if it's already set. | `fingerprint_was_recorded: true` only on the first call. Unit test T-28: second call returns `fingerprint_was_recorded: false`. |
| **M-3** | MEDIUM | `mechanism_check: false` and missing `evidence_code_ref` both yield `status: "skipped"`. The plan should distinguish them in the output. | `grounding.evidence_code_ref` is `null` for both. The `grounding.code_ref_exists` is `null` for both. `status: "skipped"` is the same. Plan documents: skipped is the catch-all for "no opt-in or no signal"; `unknown` is the opt-in but no-evidence case. |
| **M-4** | MEDIUM | Test-runner flakiness (same as SP1): `pnpm test` against a real test file in CI may fail intermittently. | Default `run_tests: false`. The 30s timeout applies. The mtime-keyed cache prevents repeated runs. Acceptance test for `run_tests: true` uses a deterministic test file (mirror SP1 acceptance test setup). |
| **M-5** | MEDIUM | SHA-256 determinism: `crypto.createHash("sha256")` is deterministic. But: file modification time, BOM markers, line endings (CRLF vs LF), and trailing newlines affect the hash. The design correctly hashes the raw file bytes — this is intended. | Unit test T-29: `computeFileHash` is deterministic for the same bytes; changing 1 byte changes the hash. |
| **M-6** | MEDIUM | `meta-state.jsonl` race condition: two concurrent `check_grounding` calls on the same id both try to auto-record. | The existing `enqueue` per-root write queue in `updateEntry` (`tools/learning-loop-mcp/core/meta-state.js:73-79`) serializes writes. The second call's `updateEntry` may see a different `version` (CAS would fail); tool layer handles by re-reading and recomputing. Document in Phase 2. |
| **L-1** | LOW | Output shape divergence from SP1 may confuse agents. | Add a code comment in `core/check-grounding.js` cross-referencing SP1's `derivation` shape. |
| **L-2** | LOW | `safeImport` failure on a new tool file: if the file is syntactically broken, the server logs the error and continues. The plan should not depend on `safeImport` swallowing errors silently. | Unit test the file loads (`import("../tools/meta-state-check-grounding-tool.js")` resolves). |
| **L-3** | LOW | `meta_state_list` tool's `entry_kind` filter doesn't surface `mechanism_check` — the agent querying for "findings with grounding" must filter client-side. | Out of scope for SP2. The agent uses `meta_state_check_grounding` per-id, not a bulk query. SP3 (drift aggregation) is the right place for bulk grounding queries. |

---

## 7. Anything else — inconsistencies and missing details

### I-1: `now` missing from locked `codeContext` shape (already in C-3)

The locked design's `codeContext` is `{ root, run_tests?, test_passed? }` (line 138 of the brainstorm), but test T-23 and T-24 require `now?: () => number`. The plan must reconcile by adding `now` to the shape (or rewriting the tests to use a module-level `Date.now` injection). **Recommendation: add `now`.**

### I-2: `mechanism_check: z.boolean().optional()` has a default that conflicts with the opt-in semantic

`z.boolean().optional()` means the field is `boolean | undefined`. The brainstorm's "Default false" comment in the description is **documentation-only** — Zod's `.optional()` does not default to `false`. The pure function must check `entry.mechanism_check === true` (strict equality), not truthiness. The plan should:

- Lock in `mechanism_check === true` as the check condition (not `mechanism_check`).
- Add unit test T-30: `mechanism_check: false` → `status: "skipped"`; `mechanism_check: "true"` (string) → `status: "skipped"`; `mechanism_check: 1` → `status: "skipped"`.

### I-3: `code_fingerprint` regex requires the prefix

`^sha256:[a-f0-9]{64}$` is canonical. The pure function reads `entry.code_fingerprint` and compares hashes. If the stored fingerprint doesn't match the regex (corruption, manual edit), the function should defensively return `hash_match: null` (not throw). **Plan should add unit test T-31: `code_fingerprint: "garbage"` → `hash_match: null`.**

### I-4: `meta_state_refresh_fingerprint` returns `refreshed_at` but the design doesn't specify a precise shape

The locked design says "Returns `{ id, code_fingerprint, refreshed_at, status: "refreshed" }`". The plan should specify `refreshed_at: new Date().toISOString()` (ISO 8601 string, matching SP1's `checked_at`). The gate log line should also include `refreshed_at`.

### I-5: Auto-record writes increment the entry's `version` field

`tools/learning-loop-mcp/core/meta-state.js:138` does `entry.version = (entry.version ?? 0) + 1` on every `updateEntry` call. The auto-record path mutates the entry, so the version increments. The plan should document: **the first `check_grounding` call increments version by 1 (auto-record); the second call does not (idempotent).** No CAS check is performed (the design is optimistic; the user can re-run if a concurrent write occurs).

### I-6: Gate log line on the auto-record path is missing from the locked design

The locked design says the check tool "appends gate log on every call" but doesn't specify whether the auto-record path produces an additional gate log line. The plan should specify: **the check tool emits exactly one gate log line per call, regardless of auto-record**. The refresh tool emits its own gate log line. The `updateEntry` does NOT emit a gate log line on its own (no internal logging in `core/meta-state.js`).

### I-7: `META_STATE_GROUNDING_STATUSES` and `META_STATE_GROUNDING_DRIFT_KINDS` export names

The locked design names these constants. The plan should confirm the export names (match the SP0/SP1 pattern: `META_STATE_*` prefix). Unit test the constants are exported and contain the expected values (mirror SP1's test 24).

### I-8: `entry_kind: "change-log"` fast path in `checkGrounding`

The locked design says "Change-log entries: skipped (return `status: "skipped"`, `grounding: { checked_at, duration_ms }` only). Same pattern as SP1's `no-signals` fast path." But `mechanism_check` is undefined on change-log entries (the field is on the finding schema only). The pure function should still apply the change-log fast path before the `mechanism_check` check. **Plan should add unit test T-32: `entry.entry_kind: "change-log"` → `status: "skipped"`, `grounding: { checked_at, duration_ms }` (no `evidence_code_ref` lookup).**

### I-9: `meta_state_resolve` integration is out of scope (locked) but worth a comment

The locked design says "SP2 only reports grounding status. The agent (or `meta_state_resolve`) decides." The plan should add a comment in `core/check-grounding.js` noting that a future plan may add a warn-when-derivation-disagrees feature to `meta_state_resolve` (per the SP1 plan's "What This Plan Does NOT Do" section).

### I-10: Plan must lock in the function name `checkGrounding`

The locked design uses `checkGrounding`. The plan should confirm this name and the file name `core/check-grounding.js`. The unit test file is `__tests__/check-grounding.test.js` (per the test list). Mirrors SP1's `deriveStatus` / `derive-status.js` / `__tests__/derive-status.test.js` pattern.

### I-11: `META_STATE_GROUNDING_STATUSES` and `META_STATE_GROUNDING_DRIFT_KINDS` placement

The locked design says "export source-of-truth arrays" (mirroring SP0/SP1). The plan should place the exports in `core/check-grounding.js` (not in the tool file). This matches the SP1 pattern (`META_STATE_DERIVATION_KINDS` etc. exported from `core/derive-status.js`).

### I-12: Success metric "loop_describe shows both new tools"

The success metric list says "loop_describe({tier: "warm"}) shows both new tools." This is the **only** consumer of the manifest. The plan should add a unit test in `__tests__/loop-describe.test.js` (or a new `__tests__/sp2-tools-discoverable.test.js`) that asserts the 2 new tool names appear in the `loop_describe` warm response.

### I-13: Plan must address the `agent-manifest.json` drift (see §5)

Either update `agent-manifest.json` (Option A) or explicitly document it as out of scope (Option B). The plan should choose one.

---

## Pre-plan verification summary

| Section | Status |
|---|---|
| 1. Schema integration | **2 CRITICAL findings** (C-1 legacy fallback, C-2 mechanism_check write path) |
| 2. Pattern alignment | 5 divergences identified; all reconcilable |
| 3. Enum compatibility | 1 casing divergence (`code_missing` vs `code-missing`); recommend accept |
| 4. Test budget | **OK** — 512 baseline confirmed, 548 target is realistic |
| 5. Manifest pattern | **OK** with 1 note (`agent-manifest.json` drift) |
| 6. Risk table | 16 risks (3 CRITICAL, 4 HIGH, 5 MEDIUM, 4 LOW) |
| 7. Other | 13 inconsistencies / missing details |

**Verdict:** The locked design is implementation-ready. The 2 CRITICAL findings and 4 HIGH findings must be addressed in the plan's Phase 0 (decisions) or Phase 1 (pure function spec). The remaining 11 findings are stylistic or already-mitigated by the locked design's text.
