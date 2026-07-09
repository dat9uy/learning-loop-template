---
phase: 4
title: "Recompute, closeout change-log, roadmap + PR registry-deltas"
status: pending
priority: P2
dependencies: [2, 3]
---

# Phase 4: Recompute, closeout change-log, roadmap + PR registry-deltas

## Overview
Three outputs. (a) Recompute the open-count delta via `meta_state_sweep` (read-only stale-view) + `meta_state_list({status:"open", compact:true})`. (b) One closeout `meta_state_log_change` citing this plan, the resolved/keep-open counts, the new derivation-flaw finding id, and the **transport-L1 roadmap statement** (the key question: still open). (c) The closeout PR body carries the `rule-pr-body-registry-deltas` table.

## Requirements
- Functional: open-count before/after reported (delta = `-(resolved) + new_findings`); stale-view delta reported (`-(resolved)`); one closeout change-log filed with **schema-valid `change_diff`**; PR registry-deltas table produced.
- Non-functional: the change-log `reason` (≥20 chars) carries the full delta (ids + classes) + derivation-flaw id + roadmap. The roadmap statement is honest: transport-L1 + EOF-conflict are **still open** (live architectural debate, not resolved this closeout); 5 LIVE bugs flagged for separate plans.
- `change_diff` is a **strict** `{added,removed,changed}` shape (`meta-state.js:149-153`); unknown keys (`resolved`/`kept_open`/`new_findings`) are **silently stripped**. Map deltas to the schema-valid keys AND duplicate the full delta in `reason` so lineage survives.
- `meta_state_sweep` is read-only (post 260707-0812 it no longer mutates); it reports the derived stale-view. Do not rely on it to close anything.

## Architecture
```
# (a) recompute  — capture before ONCE at Phase-1 start
before       = <open count captured at Phase-1 start>
after_sweep  = meta_state_sweep()                   # read-only stale-view
after_open   = meta_state_list({status:"open", compact:true}).count
resolved_n   = <count from Phase 2>
new_n        = 1                                    # the derivation-flaw finding (Phase 3)
expected_stale_delta = -(resolved_n)               # resolved leave isOpen; new finding is age-0 (not stale)
expected_open_delta  = -(resolved_n) + new_n       # the +1 is the new finding

# (b) closeout change-log — change_diff is STRICT {added,removed,changed}; unknown keys are STRIPPED.
#     Map deltas to schema-valid keys (semantically stretched) AND put the full delta in `reason`.
meta_state_log_change({
  change_dimension: "surface", change_target: "meta-state.jsonl",
  change_diff: {
    removed: [<resolved ids>],                       # resolved = removed from the open set
    added:   [<derivation_flaw_id>],                 # new finding added
    changed: [<kept_open ids>],                      # kept-open: description patched (status unchanged)
  },
  reason: "Drift-driven registry closeout (plan 260710-0104). Resolved <N>: <ids>. Kept-open <M>: <ids> (2 derivation-fooled: transport-L1/EOF; 3 LIVE escalates: log_change/supersede/unarchive; 2 red-team-found: report-overwrite(LIVE)/taskUpdate-noop(symptom+upstream)). New finding <id>: derive_status mechanism-shipped gates on file-existence only — false-positives on symptom files (.mcp.json/.gitignore) + line-suffix false-negatives; NOT 'all 10'. Roadmap: transport-L1 (meta-260704T1213Z) + EOF-conflict STILL OPEN; 3 LIVE escalates + report-overwrite each warrant a separate fix plan.",
})

# (c) PR registry-deltas table (rule-pr-body-registry-deltas)
```

## Related Code Files
- None modified. The change-log targets `meta-state.jsonl` (the audit-trail surface), not source.

## Roadmap statement (the key deliverable)

> **Transport-L1 (`meta-260704T1213Z-close-flow-…transport-not-l1`) is STILL OPEN.** It is a live architectural debate, not a resolved bug. The close-flow/finding-triage symptom traces to a missing L1 transport seam: core meta-state operations (report/log_change/resolve/refresh_file_index/dispatch/supersede) are implemented as MCP tools (L3) with no Core-function (L1) interface behind a transport adapter. `derive_status` reported `resolved-by-mechanism` because `evidence_code_ref` (`.mcp.json`) exists — but `.mcp.json` is the *symptom* (the wrong-root mechanism), not a fix. No CLI adapter (mirroring `gate-self-verify.mjs`), no `docs/transport-layer.md`, no Core refactor shipped. Resolution is a **separate plan** (promote transport to L1 + ship a CLI adapter); this closeout keeps it open and records the derivation mislead.
>
> The EOF-merge-conflict (`meta-260709T1017Z-parallel-prs-…append-only-eof-merge-conflict`) is likewise **STILL OPEN** — `.gitignore` existence fooled the same derivation; mitigations are the M2 single-writer-gate debate (`meta-260708T0355Z-m2-single-writer-gate`), none shipped.
>
> **Five findings remain open as LIVE bugs**, each warranting its own fix plan (not scope-crept into this closeout): log_change silent-persistence-fail (`meta-260619T2233Z`), supersede silent-persistence-fail (`meta-260626T1419Z`), unarchive-path-missing (`meta-260614T1236Z-no-mcp-path-exists-to-unarchive…`), report-overwrite id-ignored (`meta-260619T2237Z` — found by red-team), and taskUpdate-noop (`meta-260623T0223Z` — symptom-evidence + likely upstream, pending journal). The unarchive finding's "IMMUTABLE blocks archived_*" premise is itself stale (the set does not include archived_*/status); its real gap is the missing first-class unarchive tool.

## Verification matrix

| output | confirm | on failure |
|---|---|---|
| open-count delta | `after_open - before` = `-(resolved_n) + new_n` (i.e. `-(N)+1`); stale-view delta = `-(resolved_n)` | if open-delta ≠ `-(N)+1` → investigate (a resolve didn't stick, or an unexpected new/missing finding); record honestly |
| closeout change-log | `meta_state_list({id, entry_kind:"change-log"})` returns the entry, `status:"active"`, and `change_diff` retained the `removed`/`added`/`changed` keys (NOT stripped to empty) | if `change_diff` is empty → the schema stripped it; re-file relying on `reason` (the strict shape only accepts added/removed/changed) |
| PR registry-deltas | the table appears in the PR body and matches the logged deltas | complete the table before opening the PR |

## MCP-tool / interface checklist
- [ ] Capture the **before** open-count at Phase-1 start (do it now if not done): `meta_state_list({status:"open", compact:true}).count`.
- [ ] `meta_state_sweep()` — read-only; report stale-view shrink (expected `-(resolved_n)`).
- [ ] `meta_state_list({status:"open", compact:true})` — the after open-count (expected `before - resolved_n + 1`).
- [ ] `meta_state_log_change({change_dimension:"surface", change_target:"meta-state.jsonl", change_diff:{removed,added,changed}, reason})` — one closeout entry; **schema-valid `change_diff` keys only** (unknown keys stripped) + full delta in `reason`.
- [ ] **No** `meta_state_resolve` of `change-log` entries (tool rejects; immutable).
- [ ] PR body: `rule-pr-body-registry-deltas` table — swept/resolved/new/promoted/superseded/archived (this closeout: resolved=<Phase-2 ids>, new=[derivation-flaw id], patched=[7 keep-open ids], the rest empty).

## Dependency map
- Depends on: Phase 2 (resolved count + ids), Phase 3 (derivation-flaw finding id + keep-open ids).
- Blocks: nothing (terminal phase of the closeout).
- External: the closeout PR (manual/`git-manager`) — the registry-deltas table is its required body section.

## Implementation Steps
1. Capture before open-count (if not already): `meta_state_list({status:"open", compact:true}).count`.
2. `meta_state_sweep()` → read the stale-view; `meta_state_list({status:"open", compact:true})` → after open-count.
3. Compute deltas against **pre-stated expected values**: `expected_open_delta = -(resolved_n) + new_n`; `expected_stale_delta = -(resolved_n)`. If open-delta ≠ `-(N)+1`, investigate (don't force a match).
4. `meta_state_log_change` the closeout entry with schema-valid `change_diff` (`removed`=resolved, `added`=new finding, `changed`=kept-open) + the roadmap statement in `reason`.
5. Produce the `rule-pr-body-registry-deltas` table for the closeout PR.
6. Final report: before/after counts, the 7 keep-open findings (which were derivation-fooled vs LIVE vs symptom), the roadmap (transport-L1 + EOF still open; 5 LIVE bugs flagged for separate plans), the new derivation-flaw finding id.

## Success Criteria
- [ ] Open-count before/after reported; **open-delta = `-(resolved) + new_findings`** (i.e. `-(N)+1`); stale-view delta = `-(resolved)`. Mismatch investigated honestly, not forced.
- [ ] One closeout change-log filed with **schema-valid `change_diff`** (removed/added/changed retained, not stripped) + full delta + roadmap in `reason`.
- [ ] Roadmap statement produced: transport-L1 + EOF-conflict confirmed STILL OPEN; the 5 LIVE/symptom findings (log_change, supersede, unarchive, report-overwrite, taskUpdate-noop) flagged for separate plans.
- [ ] PR registry-deltas table produced (resolved/new/patched/promoted/etc.).

## Risk Assessment
- **Count false-alarm (LOW)** — the open-delta is `-(N)+1`, not `-N`; checking against `-N` would always fire the "investigate" branch. Mitigation: pre-state `expected_open_delta = -(resolved_n) + new_n` and compare against that.
- **change_diff stripped (MEDIUM)** — passing `{resolved,kept_open,new_findings}` to the strict `{added,removed,changed}` schema silently yields empty arrays; the structured lineage is lost. Mitigation: map to `removed`/`added`/`changed` (schema-valid) AND duplicate the full delta in `reason`; verify `change_diff` retained the keys via re-query.
- **Change-log silent-persist (MEDIUM)** — `meta_state_log_change` itself is the subject of an open LIVE finding (`meta-260619T2233Z`): it can return `logged:true` without persisting. Mitigation: after the call, `meta_state_list({id})` to confirm the entry exists; if missing, re-file (the finding's own workaround). This is both the closeout's final step and a live demonstration of the bug it keeps open.
- **Roadmap understatement (LOW)** — must not imply transport-L1/EOF is resolved. Mitigation: the statement explicitly says STILL OPEN + why derivation was fooled; full slugs used (not the ambiguous bare `meta-260709T1017Z`).
- **PR-deltas omission (LOW)** — forgetting the table blocks `rule-pr-body-registry-deltas`. Mitigation: checklist item; build the table in step 5.
