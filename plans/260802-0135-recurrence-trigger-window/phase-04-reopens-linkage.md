---
phase: 4
title: "Reopens linkage to accepted limitations"
status: pending
priority: P2
effort: "1-2h"
dependencies: [3]
---

# Phase 4: Reopens linkage to accepted limitations

## Overview

When `checkAndEmit` files a `recurring-false-positive` for a `rule_id` that has a known
accepted-limitation finding, record the link by setting `reopens: ['<accepted-id>']`
on the new finding. This is the report's rec 5 — it **records the Channel-A link**; the
closure itself (cascade-resolve of B) is operator triage, not a hook action (see Open
Questions 2 & 3).

**Data refutation of the report's assumed mechanism:** the report assumed the recurring
finding's `rule_id` matches an accepted-limitation finding. Finding B
(`meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc`,
subtype `strip-bypass-accepted`) has `rule_id: None` — rule_id matching is impossible.
Existing `reopens` usage is manual (17 registry precedents; the filer sets `reopens`
explicitly). This phase therefore uses a **curated map** and **defers the
cascade-resolve to operator triage** (default; see Open Questions 2 & 3).

**Existence guard (red-team C2):** `writeEntry`'s schema validates only the `reopens`
id *prefix* (`meta-`/`rule-`/`loop-design-`), **not registry existence** — a typo'd map
id would write a dangling pointer. `checkAndEmit` asserts the mapped id exists in the
registry before setting `reopens` (skip + `console.error` warn if stale).

## Requirements

- Functional:
  - A fresh group whose `rule_id` is in `RULE_TO_ACCEPTED_LIMITATION` files a finding
    with `reopens: ['<accepted-limitation-id>']`.
  - An unmapped `rule_id` files a finding with no `reopens` (graceful).
  - The hook emits a `console.error` pointer recommending
    `meta_state_resolve({ id: <accepted-id>, cascade_from: [<new-id>] })` when a reopens
    link is set.
- Non-functional:
  - The cascade-resolve is **not** auto-run from the hook (default). It is an operator
    triage step matching the 17 manual precedents.
  - No core→tool-handler layering violation (no import of `tools/handlers/*` from
    `core/`).
  - The `reopens` id is validated by `writeEntry`'s schema (`entryIdRefArray`).

## Architecture

```
recurrence-tracker.js
  const RULE_TO_ACCEPTED_LIMITATION = {
    "rule-no-new-artifact-types":
      "meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc",
    // add entries as accepted limitations accrue; graceful when absent
  }
  # in checkAndEmit, per fresh group (after C1 in-call dedup):
  const acceptedId = RULE_TO_ACCEPTED_LIMITATION[group.rule_id]
  const exists = acceptedId && readRegistry(root).some(e => e.id === acceptedId)  # C2 guard
  const finding = { ..., reopens: exists ? [acceptedId] : undefined }
  await writeEntry(root, finding)
  if (acceptedId && exists) process.stderr.write(
    `recurrence: filed ${finding.id} reopening ${acceptedId}; ` +
    `run meta_state_resolve({ id: "${acceptedId}", cascade_from: ["${finding.id}"] }) to close\n`)
  if (acceptedId && !exists) process.stderr.write(
    `recurrence: stale RULE_TO_ACCEPTED_LIMITATION entry for ${group.rule_id} -> ${acceptedId} (not in registry); reopens skipped\n`)
```

The map is the honest expression of a semantic, human-curated link between a rule and
its accepted limitation (B has no `rule_id`, so no mechanical derivation exists). Use
`process.stderr.write` (not `console.error`) for the pointer so it is not truncated by
the hook's `process.exit(0)` under piped stderr (red-team H3).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/recurrence-tracker.js`
  - Add `RULE_TO_ACCEPTED_LIMITATION` map (one entry now, B's real full id).
  - In `checkAndEmit`: set `reopens` from the map **only if the target id exists in the
    registry** (C2 guard); emit the pointer via `process.stderr.write` (H3).
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js`
  - Add reopens cases (see steps).

## Implementation Steps (TDD — tests first)

1. **Test first.** In `gate-recurrence.test.js`:
   - Add: "checkAndEmit: mapped rule_id files finding with reopens" — seed 3 entries for a mapped rule AND seed B's finding record in the temp registry, run `checkAndEmit`, read the finding, assert `finding.reopens` equals `[<B-real-id>]`.
   - Add (C2): "checkAndEmit: stale map id (not in registry) skips reopens" — map the rule to a bogus-but-prefix-valid id (`meta-totallybogus-notinregistry`), do NOT seed it, run `checkAndEmit`, assert the finding has **no** `reopens` and stderr contains the stale-map warning. This proves the existence guard, which the prefix-only schema check does NOT provide.
   - Add: "checkAndEmit: unmapped rule_id files finding with no reopens" — use an unmapped rule_id, assert `finding.reopens` is absent/empty.
   - Add: "checkAndEmit: reopens id resolves to a real finding" — read the registry, assert the `reopens` id points at an `entry_kind: "finding"` record (the existence assertion the schema does not give us).
2. **Run tests — expect failure** (no `reopens` set today).
3. **Implement** the map + `reopens` assignment + the `console.error` pointer.
4. **Run tests — expect green.**

## Success Criteria

- [ ] Mapped `rule_id` + target exists → finding carries `reopens: ['<B-real-id>']`.
- [ ] Mapped `rule_id` + target NOT in registry → finding has no `reopens` + stderr warns (C2 guard).
- [ ] Unmapped `rule_id` → finding has no `reopens`.
- [ ] No import of `tools/handlers/*` from `core/` (no layering violation).
- [ ] The pointer is emitted via `process.stderr.write` (not truncated by `process.exit(0)`).

## Risk Assessment

- **Risk:** The curated map is manual maintenance — a new accepted limitation requires
  a map entry.
  **Mitigation:** one entry now; graceful no-op when unmapped (the finding still files,
  just without the link). The map is the honest expression of a link that cannot be
  derived mechanically (B has no `rule_id`). Open Question 3 offers alternatives
  (patch B with a `rule_id`; semantic match by `affected_system + subtype`).
- **Risk:** Deferring cascade-resolve means B is not auto-closed — the report's literal
  "auto-convert" outcome is not achieved by the hook alone.
  **Mitigation:** the `reopens` field records the link in the registry (machine-readable,
  surfaces in `meta_state_list`/`meta_state_relationships`); the operator/agent closes B
  during triage. Open Question 2 offers the auto-cascade alternative (requires extracting
  a core `resolveEntry` primitive or calling `applyUpdateAndCheck` directly, and accepting
  a hook auto-closing an operator-acknowledged finding).
- **Risk:** A stale map entry (B later archived/superseded) points `reopens` at a
  non-existent id → `writeEntry` schema validation rejects it.
  **Mitigation:** the schema validates `reopens` ids; a stale map surfaces as a write
  failure (visible, not silent). Keep the map tiny and review on lifecycle changes.