---
phase: 2
title: "Mutable-source dangling-ref triage and cleanup"
status: pending
priority: P1
dependencies: [1]
---

# Phase 2: Mutable-source dangling-ref triage and cleanup

## Overview

With Phase 1's refined validator, run it on the live union to get the residual **blocking** set (measured **~27** in Phase 1 step 6: 16 active loop-design `addresses` + 1 active `proposed_design_for` + 9 active rule `origin` + 1 open finding `reopens`; 18 inactive loop-design `addresses` already auto-exempt as `historical`). Triage each: patch the dangling ref via `meta_state_patch` in any session (patch is NOT live-gated), or justify and exempt by policy. Goal: `validate-registry-refs.js` exits 0 on the real union.

## Why this exists

Phase 1 exempts immutable + terminal sources, but active mutable sources with `missing` targets remain real corruption (typo, truncated id, or a finding hard-deleted without a tombstone). These CAN be fixed — loop-designs, rules, and findings are mutable. This phase cleans them so the BLOCK flip (Phase 3) is viable.

## Requirements

- Functional: every residual `blocking` ref is resolved — dangling id removed/fixed from the source's ref field, OR the source moved to a terminal status so the ref becomes `historical` by policy, OR a typo id corrected.
- Non-functional: **never mutate a change-log** (immutable). Never remove a whole ref array — remove only the dangling id, preserving the other valid refs. Each batch records provenance via a `meta_state_log_change` INCREMENTALLY (not once at the end).
- Invariant: the cleanup must not introduce NEW dangling refs (e.g., removing an `addresses` id must not orphan a `consolidated_into` on the other side).

## Architecture

**`meta_state_patch` contract reality (red-team F1/F3).** `meta_state_patch` REPLACES fields (no remove-element op). To remove one id from an array, the operator must: (1) read the current array via `meta_state_list`/`meta_state_relationships`; (2) construct the filtered array; (3) **verify the filtered length is exactly `original.length - 1`** before sending (guards against accidentally dropping a valid id); (4) `meta_state_patch({entry_kind, id, patch: {<field>: filteredArray}})`; (5) post-patch re-query `meta_state_relationships` to confirm surviving refs still resolve. For the scalar `rule.origin`: patch to `""` (empty string), NOT `null` — `origin` is `z.string()` non-nullable (`meta-state.js:410`), `null` is rejected by zod, but `outboundRefsOf` for rule emits no ref when `origin` is falsy (`validate-registry-refs.js:81`), so `""` achieves the de-reference. (Do NOT set `origin: undefined`/omit — that's a no-op.)

**Live-gate reality (red-team F11).** Only `meta_state_ship_loop_design`, `meta_state_supersede`, `meta_state_promote_rule`, and `meta_state_dispatch_finding` require `LOOP_SESSION_MODE=live`. `meta_state_patch` and `meta_state_log_change` are NOT live-gated — they work in any session. So the bulk of Phase 2 (patching + provenance logging) does NOT need live mode. Only shipping a loop-design (if that's the chosen disposition for an entry) needs live mode.

**Triage loop:**

1. Run `node tools/learning-loop-mastra/scripts/validate-registry-refs.js` → capture the `blocking` list (Phase 1 step 6 output, ~27).
2. Group by source entry. For each blocking ref, decide per the triage table:

| Situation | Action |
|---|---|
| Active loop-design, `addresses`/`proposed_design_for` target retired, design shipped | `meta_state_ship_loop_design` (→ inactive; live-gated) so the source becomes terminal → `historical`. OR `meta_state_patch` the array to remove the dangling id (read→filter→verify len→patch→re-query). Prefer ship if fully shipped; prefer patch-remove to keep an in-progress design visible. |
| Active loop-design still in progress | `meta_state_patch` remove the dangling id (read→filter→verify len `orig-1`→patch→re-query). Re-file the addressed concern if still relevant. |
| Active rule, `origin` finding gone | `meta_state_patch({entry_kind:"rule", id, patch:{origin:""}})` — empty string, NOT null. |
| Open finding, `reopens` target gone | `meta_state_patch({entry_kind:"finding", id, patch:{reopens: filteredArray}})` (read→filter→verify len→patch→re-query). |
| Target id is a typo/truncation (e.g. `meta-260712T0053Z`) | Correct the id to the real target if identifiable; else remove the ref and note in the change-log. |

3. **Incremental provenance (red-team F4).** After each logical batch (not once at the end), write a `meta_state_log_change` (semantic, `change_target`: the affected source ids, reason ≥20 chars) recording what was removed/corrected and why. Append dispositions to the triage report as they're decided, not at the end.
4. Re-run the validator after each batch; confirm the blocking count only decreases.
5. When `blocking.length === 0`, final validator run → exit 0.

**Bury-by-supersede audit (red-team F7b).** The triage report MUST list every ref reclassified blocking→historical via terminal-source status (e.g., a finding moved to `superseded`, a loop-design shipped to `inactive`) with an explicit per-ref justification, so "bury by supersede" is auditable rather than silent.

**Recovery procedure (red-team F4).** If the session dies mid-triage: re-run the validator, diff the current `blocking` list against the last-committed triage-report disposition list, and resume from the first un-dispositioned ref. The incremental change-log entries + incremental triage report are the recovery state — never rely on a single end-of-phase write.

## Related Code Files

- Modify (registry data, via MCP — NOT direct file writes): `meta-state.jsonl` entries (loop-designs, rules, findings with dangling `addresses`/`proposed_design_for`/`origin`/`reopens`).
- Reference (read-only): `tools/learning-loop-mastra/scripts/validate-registry-refs.js` (the gate).
- Create: a triage report under `plans/260715-1608-.../reports/` listing each blocking ref + disposition (patched / shipped / corrected / exempted), appended incrementally.

## Implementation Steps

1. Run the validator; capture the residual `blocking` list (Phase 1 step 6 output, ~27).
2. Handle the truncated/short target ids first (highest signal of real typo) — correct or remove.
3. For each remaining blocking ref, classify per the triage table; record the disposition in the triage report (incrementally).
4. Apply the chosen `meta_state_patch` / `meta_state_ship_loop_design` per entry, using the read→filter→verify-len→patch→re-query procedure for arrays and `origin:""` for rule origin.
5. After each batch: write a `meta_state_log_change` provenance entry; re-run the validator.
6. When `blocking.length === 0`: final `node tools/learning-loop-mastra/scripts/validate-registry-refs.js` → exit 0; `pnpm test` green.
7. Verify the bury-by-supersede audit section of the triage report is complete (every terminal-source reclassification justified).

## Success Criteria

- [ ] `node tools/learning-loop-mastra/scripts/validate-registry-refs.js` exits 0 on the live union.
- [ ] Every former blocking ref has a recorded disposition in the triage report (patched / shipped / corrected / exempted); every terminal-source reclassification has an explicit justification (bury-audit).
- [ ] No change-log was mutated. **Immutability verification (red-team F9):** the first N lines of `change-log.jsonl` (N = pre-Phase-2 line count) are byte-identical pre- and post-Phase-2; `git diff change-log.jsonl` shows ONLY `+` lines (the incremental `meta_state_log_change` appends), zero `-` lines. (Not a whole-file SHA check — that's a tautology since appends change the SHA.)
- [ ] Provenance `meta_state_log_change` entries written incrementally per batch (not once at the end); triage report appended incrementally.
- [ ] Array patches verified `filtered.length == original.length - 1` before send; post-patch `meta_state_relationships` confirms surviving refs resolve; no NEW dangling refs introduced.
- [ ] Rule `origin` cleanup used `""` (not `null`).
- [ ] `pnpm test` green.

## Risk Assessment

- **Provenance loss** — removing an `addresses` id loses a link. Mitigation: incremental `meta_state_log_change` per batch preserves it in prose; remove only the dangling id (verified length); never remove a whole array.
- **Mid-triage session death** (red-team F4) — mitigated by incremental provenance + incremental triage report + the documented recovery procedure (diff against last-committed report, resume).
- **Silent valid-ref loss** (red-team F3) — `meta_state_patch` replaces whole arrays; a mis-filter drops a valid ref the validator won't catch (it flags missing targets, not removed-but-valid refs). Mitigation: the `len == orig-1` pre-send check + post-patch `meta_state_relationships` re-query.
- **Over-cleaning vs ship** — patched a ref when shipping the design was correct (or vice versa). Mitigation: the triage table forces an explicit per-ref decision recorded in the report.
- **Live-gate confusion** (red-team F11) — only `meta_state_ship_loop_design` (et al.) need live mode; `meta_state_patch`/`meta_state_log_change` do not. If a chosen disposition is `ship_loop_design` and the session isn't live, hand off just that entry.