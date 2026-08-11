# MCP wire budget restore + glossary-extend — shipped

## Outcome

Resolves `meta-260811T0805Z-...` (manifest context budget raised a second
consecutive time). The MCP manifest wire budget is restored from the 55,750
stopgap to **55,000**, measured wire is **54,883 bytes** (117 B headroom). The
repeated-bump cycle is stopped by a structural fix: a shared
`describeField` helper points entry-field schema descriptions at the field
glossary instead of duplicating meaning inline.

## What shipped

### Phase 1 — ceiling restored
- **`mcp-wire-budget.test.js`**: ceiling 55_750 → **55_000**; STOPGAP comment
  replaced with restored-ceiling + structural-anchor rationale.
- **`mark-preflight-complete-tool.js`** + **`meta-state-refresh-file-index-tool.js`**:
  trimmed tool-description prose (−364 B total). Constraints preserved — the
  `schemas` surface mention required by `schemas-write-gate.test.js` is kept,
  and the per-surface unlock detail survives in the `surface` field's schema
  description (schema is the authority).
- **`cli-context-savings-script.test.js.snap`**: re-snapshotted. Per-tool deltas
  reviewed: `gate_mark_preflight` 1891→1565 (−326), `meta_state_refresh_file_index`
  1309→1271 (−38). `dropped_def_bytes` 52150→51786; `savings_pct` stable 92.5.

### Phase 2 — shared glossary helper (DRY)
- **New `core/schema-glossary.js`**: `describeField(field, schema)` =
  `schema.describe(\`See field_glossary.${field}\`)`. Pure primitive (no imports);
  added to `core/placement.yaml`.
- Migrated 3 handlers off their local/inline ref construction:
  `meta-state-log-change-tool.js` (was `describeChangeField`),
  `meta-state-report-tool.js` + `meta-state-propose-design-tool.js` (were inline
  `.map()` loops). **Byte-identical** — wire unchanged.
- **Audit** (`plans/reports/audit-260811-0928-glossary-extend-allowlist.md`):
  zero additional semantically-convertible fields beyond the already-ref'd set.
  All other glossary-keyed fields are filter/op-input params (excluded) or a
  different enum (runtime_state_record `affected_system`). Matches the red-team's
  honest "~0-3% convertible" finding.
- **`field-glossary.test.js`**: covers `describeField` (node-type preservation),
  the allowlisted ref set (report/log_change/propose-design), and the negative —
  `meta_state_list` filter fields are NOT refs.

### Phase 3 — finding resolution + new finding
- Ceiling stays **55,000** (user decision — Phase 2 shrink was ~0 B, so a
  `measured + ~1 KB` ceiling would sit above 55,000 and restart the bump cycle).
- Original finding `meta-260811T0805Z-...` **resolved** (after
  `meta_state_refresh_file_index` re-grounded the drifted evidence hash).
- New finding `meta-260811T1106Z-mcp-and-cli-surfaces-run-duplicated-tool-registrations-every`
  filed: **decouple the CLI from MCP completely** — the MCP/CLI dual registration
  is the technical debt behind the two consecutive budget bumps.

## Side effects handled
- My description trims drifted a resolved finding citing `meta-state-log-change-tool.js`
  → re-grounded via `meta_state_refresh_file_index`.
- New `core/schema-glossary.js` tripped `placement-manifest.test.js` (every core
  file must be in `core/placement.yaml`) → added the primitive row.

## Verification
- Full suite: **3,425 passed, 4 skipped, 0 failed** (exit 0).
- Code review: **APPROVE** — byte-identical migration, no public-contract changes.
  3 informational findings (117 B headroom fragility is user-decided; pre-existing
  dangling glossary refs; doc attribution).
- Runtime-agnostic audit on the new module: 6/6 passed.

## Notes for the next session
- The 55,000 ceiling has only **117 B headroom** — a single tool-doc edit ≥ ~118 B
  re-trips it. The intended response is to extend the glossary pattern or pay down
  the MCP/CLI dual-registration debt (the new finding), NOT to raise the ceiling.
