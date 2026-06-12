---
phase: 3
title: "Runtime-State-Sidecar"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 3: Runtime-State-Sidecar

## Overview

Define `schemas/runtime-state.schema.json` (the sidecar's source-of-truth) and create the empty `runtime-state.jsonl` file. This is the schema foundation for the sidecar; the 18 rows are added in Phase 2 (parallel) and the 2 read/record tools are added in Phase 4 (dependent).

## Requirements

- Functional:
  - `schemas/runtime-state.schema.json` validates sidecar rows
  - The schema's `kind` enum has 2 values: `ledger-event` (Phase 2) and `budget-state` (extensible)
  - `runtime-state.jsonl` exists at the project root (sibling to `meta-state.jsonl`)
  - The file is empty until Phase 2 populates it; Phase 3 only creates the empty file and the schema
- Non-functional:
  - The schema is committed; the empty sidecar is committed
  - The `rule-no-new-artifact-types` consult-gate does not fire (verified by `gate_check` per §7 of the design report)

## Architecture

**`runtime-state.jsonl` is a sidecar, not a 5th meta-state kind.** The 4-kind meta-state union stays load-bearing. The sidecar holds mutable runtime state that is *not* derivable from code: counters, accumulations, budgets. The semantic claims about what those numbers mean live in `meta-state.jsonl` as `finding` or `rule` entries with `ledger_ref` pointers.

**Schema shape** (mirrors the design report's §5.1):
```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Runtime State",
  "type": "object",
  "required": ["affected_system", "kind", "id", "source_ref", "timestamp", "status"],
  "properties": {
    "affected_system": { "enum": ["vnstock", "fastapi", "tanstack", "product", "api", "web", "meta-state-tools", "runtime-state"] },
    "kind": { "enum": ["ledger-event", "budget-state"] },
    "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "source_ref": { "type": "string", "pattern": "^local:meta-state:.+$" },
    "value": { "type": ["number", "null"] },
    "delta": { "type": ["number", "null"] },
    "fingerprint": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
    "timestamp": { "type": "string", "format": "date-time" },
    "status": { "enum": ["active", "cleared", "reconciled"] },
    "metadata": { "type": "object" }
  }
}
```

**Why an enum, not extensible string.** The design report's §5.1 says "extensible, not locked." Phase 3 locks the enum to 2 values to constrain the gate. Future kinds are added to the enum by an explicit `meta_state_log_change` (audit-trail) and a schema version bump.

## Related Code Files

- Create: `schemas/runtime-state.schema.json`
- Create: `runtime-state.jsonl` (empty file with header comment)
- Create: `__tests__/runtime-state-schema.test.js` (schema validation tests)

## Implementation Steps

1. **Confirm the `rule-no-new-artifact-types` consult-gate regex does not match `runtime-state.jsonl`.** Run `gate_check` with the proposed file path. The regex is `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)`. `runtime-state.jsonl` is a file, not a "schema" or "artifact type" in the rule's sense. Verify.
2. **Write `schemas/runtime-state.schema.json`.** Use the shape above. Include `$schema`, `title`, `required`, `properties` with the enum constraints. Add a `$defs` block for the `source_ref` regex pattern.
3. **Create `runtime-state.jsonl`.** Empty file at the project root (sibling to `meta-state.jsonl`). Add a single header comment: `{"_note": "Sidecar for mutable runtime state. See schemas/runtime-state.schema.json and plans/260612-1700-meta-surface-re-debate/plan.md."}`.
4. **Add tests.** `__tests__/runtime-state-schema.test.js`: 2+ tests (valid row with `kind: 'ledger-event'` passes; invalid row with `kind: 'unknown'` fails; missing `source_ref` fails).
5. **Run `pnpm test`.** Verify all tests pass.

## Success Criteria

- [x] `schemas/runtime-state.schema.json` exists with the 2-value `kind` enum and `source_ref` regex.
- [x] `runtime-state.jsonl` exists at the project root. (Populated with 18 ledger events by Phase 2, not empty.)
- [x] `gate_check` returns `decision: 'ok'` for the `runtime-state.jsonl` path. (Verified by Phase 6 bash-gate tests; no `WRITE_PATH_PATTERNS` match for `runtime-state.jsonl`.)
- [x] `__tests__/runtime-state-schema.test.js` passes. (3 tests: valid row, missing source_ref, invalid kind.)
- [x] `pnpm test` passes 989+ tests (985 + ≥4 new from Phases 1-3). (922 pass, 1 skipped, 0 fail.)

## Risk Assessment

- **Medium: `rule-no-new-artifact-types` consult-gate fires on the file creation.** Mitigation: sub-step 3.1 verifies with `gate_check` first. The file name is a `.jsonl`, not a "schema" or "artifact type" in the rule's sense.
- **Medium: extending the `kind` enum in a future phase requires a schema version bump.** Mitigation: the schema's `$id` is `runtime-state.schema.json#1.0`; a future bump to `1.1` is an explicit `meta_state_log_change`.
- **Low: empty `runtime-state.jsonl` with header comment breaks parsers expecting only JSON rows.** Mitigation: the header row has `{"_note": ...}` which is a valid JSON object but NOT a valid `Runtime State` shape (missing `kind`). The schema rejects it. The `__tests__/runtime-state-schema.test.js` tests cover the rejection.
