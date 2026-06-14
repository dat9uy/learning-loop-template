---
phase: 3
title: "B6 loop-design flip"
status: pending
priority: P3
effort: "5min"
dependencies: ["phase-01-b3-b4-codegen-adoption-and-verification", "phase-02-b5-lim-2-script-caller-passthrough-fix"]
---

# Phase 3: B6 loop-design flip

## Overview

Promote the active `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` entry to `status: inactive` with `shipped_in_plan` and `shipped_at` populated. Reflects shipped state, not intended state — per the master tracker's "post-merge flip" rule. Trivial: one `meta_state_patch` call.

## Context Links

- **Target entry:** `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` (active since 2026-06-10; `proposed_design_for` and `addresses` empty)
- **Master tracker rule:** `plans/reports/productization-260612-1530-master-tracker.md` — B6 ships post-merge as a one-line flip after green CI
- **Prior resolution:** `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5` (resolved 2026-06-13 by B2; this flip completes the loop on the design)
- **Schema invariant:** `loop-design` entries use the same `metaStateEntrySchema` source of truth; the `status: inactive` enum is already valid (and the change-log entry's `shipped_in_plan` field is a recognized field on loop-designs).

## Requirements

- **Functional:** One `meta_state_patch` call flips the loop-design entry's `status: active → inactive` and populates `shipped_in_plan: 'plans/260614-1259-phase-b-codegen-adoption'` + `shipped_at: '<ISO timestamp>'`.
- **Non-functional:** No code changes. No tool surface changes. The flip is a registry mutation only; it does not affect any running tool or test.

## Architecture

**The patch call (canonical form):**

```javascript
meta_state_patch({
  id: "loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from",
  entry_kind: "loop-design",
  patch: {
    status: "inactive",
    shipped_in_plan: "plans/260614-1259-phase-b-codegen-adoption",
    shipped_at: new Date().toISOString(),
  },
  // Omit _expected_version to use auto-capture; see Step 2 for explicit-CAS retry loop.
})
```

The `_expected_version` is the CAS field. Use auto-capture (omit `_expected_version`) to avoid a list→patch race; the `meta_state_patch` handler auto-captures the current version from the pre-read. If a script or test requires explicit CAS, use a retry loop (see Step 2).

**The `proposed_design_for` + `addresses` gap (not addressed by B6):**

The loop-design entry has both fields empty (created 2026-06-10 with no forward/backward references). The design proposal (`plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md`) said:

> On operator approval: run `meta_state_propose_design` (or `meta_state_patch`) to populate the entry's `proposed_design_for` + `addresses`

This was never done. B6 does NOT backfill these fields — the entry's shipped state is the relevant fact; the design's motivation is captured in the proposal report (the `evidence_journal` on the design proposal itself). Filing a separate `loop-design` entry that DOES backfill these fields is a YAGNI cleanup; skip.

**Optional (not in B6 scope):** update the entry's `description` to reflect the shipped state. The current description is the design proposal summary, which is still accurate. Skip the description update.

## Related Code Files

- **No code files modified.** B6 is a registry mutation only.
- **Registry mutation (1 call):** `meta_state_patch` on `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from`.
- **Audit trail (1 call):** `meta_state_log_change` documenting the flip (canonical pattern after a registry mutation).

## Implementation Steps

**Step 1 — Pre-flight (~1 min)**

1. Confirm `pnpm test` is green (870 pass / 1 skip; this is the master tracker's "post-merge flip" rule).
2. Confirm the feature branch `260614-1259-phase-b-codegen-adoption` is merged to main (the flip reflects shipped state; flipping on an unmerged branch is a tracker drift).
3. Run `meta_state_list({ id: 'loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from' })` to confirm the entry exists and is `status: active`.

**Step 2 — The flip (~2 min)**

1. Use auto-capture for CAS safety: call `meta_state_patch` without `_expected_version` so the handler reads the current version at patch time. If you must use explicit CAS, retry up to 3 times on `version_mismatch`:
   ```javascript
   let attempt = 0;
   let result;
   while (attempt < 3) {
     result = await meta_state_patch({
       id: "loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from",
       entry_kind: "loop-design",
       patch: {
         status: "inactive",
         shipped_in_plan: "plans/260614-1259-phase-b-codegen-adoption",
         shipped_at: new Date().toISOString(),
       },
     });
     if (result.patched) break;
     if (result.reason !== "version_mismatch") break;
     attempt++;
   }
   ```
2. Verify the response: `{ patched: true, entry_kind: 'loop-design', version: <bumped> }`. If `patched` is `false`, stop and diagnose before proceeding to the audit trail.
3. Re-run `meta_state_list({ id: 'loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from' })` to confirm `status: 'inactive'` + `shipped_in_plan` + `shipped_at` are populated.

**Step 3 — Audit trail + master-tracker close (~2 min)**

1. Run `meta_state_log_change`:
   ```
   change_dimension: 'semantic'
   change_target: 'loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from'
   change_diff: { changed: ['status: active → inactive', 'shipped_in_plan populated', 'shipped_at populated'] }
   reason: 'Bridge 5 design shipped via plan 260614-1259-phase-b-codegen-adoption (B3+B4 codegen adoption + B5 LIM-2 fix). Phase B closed; loop-design flips to inactive to reflect shipped state.'
   ```

2. Update the master tracker:
   - Flip `B6` checkbox from `[ ]` to `[x]`.
   - Add a one-line body: `**Closed 2026-06-14** via plans/260614-1259-phase-b-codegen-adoption/. One meta_state_patch on the loop-design entry; status: active → inactive. Phase B fully closed (B1+B2 shipped 2026-06-13; B3-B6 shipped 2026-06-14).`
   - Update the "Last updated" line to 2026-06-14.
   - Commit + `meta_state_log_change` per the master tracker's canonical update protocol.

3. Update the LIM table:
   - LIM-7 row: `B3 → Open → Resolved 2026-06-14 via Phase 1 of plan 260614-1259-phase-b-codegen-adoption`.
   - LIM-2 row: `B5 → Open → Resolved 2026-06-14 via Phase 2 of plan 260614-1259-phase-b-codegen-adoption`.
   - LIM-1 row: stays `Open (parked)` — Bridge 7 dependency (this is the one LIM still in Phase B scope, parked as loop-design).

4. Final commit: `docs(reports): close Phase B (B1-B6 all shipped); flip master tracker + LIMs`.

## Success Criteria

- [ ] The loop-design entry's `status` is `inactive` (verified via `meta_state_list`).
- [ ] The loop-design entry has `shipped_in_plan: 'plans/260614-1259-phase-b-codegen-adoption'` + `shipped_at: <ISO>` populated.
- [ ] A `meta_state_log_change` audit-trail entry is filed for the flip.
- [ ] The master tracker is updated: B6 `[x]`, "Last updated" line bumped to 2026-06-14, LIM-2 + LIM-7 marked resolved.
- [ ] Phase B is fully closed in the master tracker (B1, B2, B3, B4, B5, B6 all `[x]`).
- [ ] No code or test changes; the flip is registry + tracker only.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Flip on unmerged branch (tracker drift) | low | Step 1's pre-flight confirms the feature branch is merged. If unmerged, defer the flip until after merge. |
| `_expected_version` mismatch (CAS failure) | low | Use auto-capture (omit `_expected_version`) or the explicit retry loop in Step 2. Verify `patched: true` before proceeding to the audit trail. |
| The flip is applied to the wrong entry id (typo) | low | Step 1's pre-flight list confirms the entry id before the patch. The `entry_kind: 'loop-design'` discriminator rejects mismatched kinds. |
| Audit-trail `meta_state_log_change` fails (silent gate-log) | low | This is LIM-6 territory (idempotency cache + silent gate-log failure — confirmed next-up hardening). For B6, retry once; if it still fails, log to the journal manually. |

## Next Steps

- **After B6 ships:** Phase B is fully closed. Phase C (Mastra Phase 0-1) is the next unblocked work.
- **Phase C unblock check:** the master tracker's Phase C-F `blocks` field on this plan flips from "blocked" to "unblocked" once B6 lands (per the `blocks: ['phase-c', 'phase-d', 'phase-e', 'phase-f']` frontmatter).
- **Open question for the next session:** does the operator want to start Phase C immediately, or pause for a hardening-audit session (LIM-3, 4, 5, 6, 8, 9) first? Per the 2026-06-14 scoping decision, hardening is next-up but not blocking.
