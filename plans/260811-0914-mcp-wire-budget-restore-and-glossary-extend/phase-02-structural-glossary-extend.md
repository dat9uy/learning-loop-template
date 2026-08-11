---
phase: 2
title: "Structural glossary-extend"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Structural glossary-extend

## Overview

Shrink the manifest wire structurally by extending the `See field_glossary.<field>` ref
pattern from the 3 handlers that already use it to other handlers whose **entry-field**
descriptions semantically duplicate a glossary entry. The per-handler local helper
`describeChangeField` is extracted to a shared module (DRY), and an explicit allowlist gates
which handler+field pairs convert — preventing the name-collision trap the red-team found.

**Red-team critical fix:** the coverage rule is **semantics-based, not name-based.** A
field converts only when its description prose actually duplicates the glossary entry's
`meaning` (entry-field semantics). Filter/query/op-input parameters that merely **share a
name** with a glossary key (e.g. `meta_state_list`'s `id`/`status`/`affected_system`/
`session_id`/`entry_kind` filter params) are **excluded** — their prose carries
tool-specific filter behavior the glossary entry does not capture.

**Scope (validation):** only the existing 19 `FIELD_GLOSSARY` entries; no new entries, so
`loop_describe` cold-tier output is unchanged. **Realistic shrink ~1-2 KB** across all 44
handlers (red-team: top 3 targets are ~3% convertible), not the report's ~5 KB optimistic
floor. Phase 2 gates on its **audited** convertible set, not on the "below 55,000" bar
Phase 1 already meets.

## Requirements

- Functional: a shared helper replaces inlined **entry-field** description prose with
  glossary refs for the allowlisted, semantically-aligned handler+field pairs.
- Functional: filter/query/op-input fields that share a glossary name but not semantics are
  **not** converted (allowlist enforces; `meta_state_list` filter fields excluded).
- Functional: an audit step measures the real convertible set across all 44 handlers and
  sets the minimum-shrink gate from it.
- Non-functional: no `inputSchema` shape change; no new `FIELD_GLOSSARY` entries.
- Non-functional: measured wire drops by ≥ the audited convertible bytes (the gate).

## Architecture

The existing pattern (`meta-state-log-change-tool.js:32`):
```js
const describeChangeField = (field, schema) => schema.describe(`See field_glossary.${field}`);
```
`.describe()` is immutable on the installed zod (3.25.76 + 4.4.3 verified by red-team) —
calling it on a node from a shared schema's `.shape.<field>` returns a new node and does
not leak the description back onto the shared shape. This generalizes safely from 1 to 44
handlers.

**Extraction:** move `describeChangeField` to `core/schema-glossary.js` as
`describeField(field, schema)`. The 3 existing handlers drop their local copy and import it.

**Coverage rule (semantics-based, allowlist-gated):** for each handler field, convert to a
ref iff ALL hold:
1. the field name is a key of `FIELD_GLOSSARY`, AND
2. the field's description prose duplicates the glossary entry's `meaning` (entry-field
   semantics — the field IS that glossary field on an entry), AND
3. the field is NOT a filter/query/op-input parameter (heuristic: the description starts
   with "Filter by…" / "Entry id to update…" / operation-input phrasing, or the field is a
   read-tool query param).

The allowlist is the explicit set of (handler, field) pairs satisfying all three. It is
produced by the audit step and encoded in the ref-coverage test.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/schema-glossary.js` — `describeField(field, schema)`.
- Modify: the 3 existing ref-user handlers — drop local `describeChangeField`, import shared.
- Modify: allowlisted handlers — convert their allowlisted entry-field descs to refs.
- Modify: `tools/learning-loop-mastra/__tests__/field-glossary.test.js` — cover the helper
  + ref-coverage **for the allowlist only**.
- Read-only verify: `__tests__/mcp-wire-budget.test.js`, `cli-context-savings.test.js`,
  `cli-context-savings-script.test.js`, `__tests__/integration/wire-format-array-guard.test.js`,
  storage-parity tests.
- **Not modified:** `core/field-glossary.js` (no new entries).

## Implementation Steps (TDD)

1. **Audit the convertible set.** Across all 44 manifest handlers, enumerate every inlined
   schema description whose field name is a glossary key AND whose prose duplicates the
   entry's `meaning` (entry-field semantics). Exclude filter/query/op-input fields. Record:
   (a) the allowlist of (handler, field) pairs, (b) the total convertible bytes. This is
   the minimum-shrink gate. The red-team's top-3 audit (~100 B convertible) suggests the
   full-44 total is ~1-2 KB; the audit confirms the real number.
2. **Red — write the allowlisted ref-coverage test.** Add to `field-glossary.test.js`: for
   each (handler, field) pair in the allowlist, assert the schema description contains
   `field_glossary.<field>`. Assert `meta_state_list`'s `id`/`status`/`affected_system`/
   `session_id`/`entry_kind` fields are **not** refs (they keep filter prose). Assert
   `describeField` produces the ref + preserves the node type. Fails today for not-yet-
   converted allowlisted pairs.
3. **Extract the shared helper.** Create `core/schema-glossary.js`; migrate the 3 existing
   handlers; delete local copies. Run the suite — green (pure refactor, no wire change).
4. **Convert the allowlisted pairs** in descending convertible-bytes order, a few handlers
   per batch. After each batch: re-measure the wire, run the full suite + wire-format /
   parity tests. Confirm filter fields are untouched.
5. **Green — gate check.** Confirm the wire dropped by ≥ the audited convertible bytes (step
   1). Record the final wire for Phase 3. Run the full loop suite + `cli-context-savings` +
   `cli-context-savings-script` (re-snapshot if the wire change crossed a snapshotted
   surface). Confirm no shape change and cold-tier glossary unchanged (19 entries).

## Success Criteria

- [ ] Audit produced the allowlist + audited convertible bytes (step 1).
- [ ] Shared `describeField` helper exists; 3 prior local copies gone (DRY).
- [ ] `field-glossary.test.js` covers the helper + ref-coverage **for the allowlist only**;
      asserts `meta_state_list` filter fields are NOT refs.
- [ ] Measured wire dropped by ≥ the audited convertible bytes (the gate).
- [ ] No `inputSchema` shape changed; no `FIELD_GLOSSARY` entry added; cold-tier glossary
      unchanged — wire-format, storage-parity, `cli-context-savings` tests green.
- [ ] Final wire recorded for Phase 3.

## Risk Assessment

- **CRITICAL (red-team): name-collision → filter-semantics corruption.** Mitigation: the
  semantics-based rule + allowlist (step 1) + the explicit "meta_state_list filter fields
  are not refs" assertion (step 2). Signal it broke: a filter field's description becomes a
  ref. Pre-decided response: revert that pair; it is not semantically aligned.
- **Smaller-than-optimistic shrink.** The audit (step 1) sets the gate from the real
  convertible set. If the audited total is < ~500 B, Phase 2's value is mostly the
  shared-helper pattern, not shrink — surface that to the user before mass-conversion
  rather than churning 44 handlers for a token gain.
- **44-handler surface area.** Mitigation: extract helper first (pure refactor), convert in
  descending convertible-bytes order, full suite per batch. Wire-format + storage-parity
  tests catch accidental shape change.
- **`cli-context-savings-script` snapshot.** Re-snapshot with per-tool byte-delta review if
  the wire change crosses a snapshotted surface; never weaken the test.