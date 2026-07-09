---
phase: 1
title: "Verify & classify all 10 findings"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Verify & classify all 10 findings

## Overview
Read-only analysis gate. For each of the 10 open findings, run `meta_state_derive_status`, read the cited `evidence_code_ref` / `evidence_journal` / code, and produce the authoritative RESOLVE vs KEEP-OPEN table with a per-finding evidence reason. No registry mutation. **Classification here binds the rest of the plan.**

## Requirements
- Functional: a 10-row table {id, derived_status, manual_evidence_verdict, action: RESOLVE|KEEP-OPEN, reason}.
- Non-functional: every RESOLVE is backed by a code/journal read that confirms the shipped mechanism addresses *this* finding's stated concern — never `derive_status` alone.
- The 5 research-classified KEEP-OPEN (transport-L1, EOF-conflict, log_change, supersede, unarchive) are re-confirmed against the current code, not assumed from the planning-time read.

## Architecture
```
for each of 10 full-ids:
  meta_state_derive_status({id})            → derived_status, signals.code_ref_exists
  read evidence_code_ref file               → does it hold a shipped fix or a symptom?
  if evidence_journal cited → read journal  → what shipped, when, which PR?
  classify: RESOLVE (mechanism genuinely ships) | KEEP-OPEN (symptom/LIVE/debate)
```
Output is the classify table; Phase 2 consumes the RESOLVE rows, Phase 3 the KEEP-OPEN rows.

## Related Code Files
- Read-only: the 10 `evidence_code_ref` paths (see inventory). Phase 1 modifies nothing.
- Read-only: journals — `docs/journals/260622-phase-d-plan-1b-shipped.md`, `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`, `plans/reports/close-flow-issue-34-post-merge.md`.

## Registry inventory (findings → evidence_code_ref → what to confirm)

| full id | evidence_code_ref | confirm before classifying |
|---|---|---|
| …-vnstock-device-slot-ledger-converted | `scripts/convert-ledger-to-sidecar.mjs` | script exists + converts the vnstock device-slot ledger to the runtime-state sidecar (the finding's concern) |
| …-post-migration-sp2-grounding-marker-… | `tools/learning-loop-mastra/mastra/create-loop-tool.js` | zod-native migration (plan 260618-0029) completed + SP2 grounding re-established via file-index.jsonl (plan 260702-1933) |
| …-report-mcp-tool-silently-overwrites-… | `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js` | **KEEP-OPEN (LIVE)** — verified planning-time: `:14-25` destructures with no `id`; `:28` `generateId(slugify(description))` ignores caller id. Finding's "honor or reject" demand unmet. (Derives `active-no-signal` via the `:102-113`-style line-suffix false-negative, but the bug is observably live in the handler.) |
| …-plan-1b-phase-2-…task-update (escalate) | `tools/learning-loop-mastra/tools/manifest.json` ⚠ | **KEEP-OPEN (pending journal)** — manifest.json is symptom-shaped (like .mcp.json/.gitignore) and semantically unrelated to the noop-undetection concern, which is likely upstream of this repo. Read journal `docs/journals/260622-phase-d-plan-1b-shipped.md`; default keep-open on symptom-shaped evidence. |
| …-handoff-md-…stale-code-sect | `docs/_archive-260703/mcp-server-restart-protocol.md` | active handoff-md no longer carries the stale-code section; archiving = the cleanup |
| …-close-flow-…transport-not-l1 ⚠ | `.mcp.json` | **KEEP-OPEN**: `.mcp.json` is the symptom, not a fix. Confirm no L1 transport seam / CLI adapter / transport-layer doc shipped (grep `docs/transport-layer.md`, CLI adapter mirroring gate-self-verify.mjs, Core-function refactor of report/resolve/etc.) |
| …-parallel-prs-…append-only-eof-merge-conflict ⚠ | `.gitignore` | **KEEP-OPEN**: `.gitignore` existence ≠ a merge mitigation. Confirm no `.gitattributes merge=union` for meta-state.jsonl, no post-merge-logging process change shipped (relates `meta-260708T0355Z-m2-single-writer-gate`) |
| …-log-change…silent-persistence-fail (escalate) | `meta-state-log-change-tool.js:102-113` | **KEEP-OPEN (LIVE)**: re-confirm L87 ignores writeEntry return + L97-104 unconditional `{logged:true}` + idempotency cache (L57-65,105); confirm no `evidence_test` |
| …-supersede-silent-persistence-fail-var (escalate) | `meta-state-supersede-tool.js:52-73` | **KEEP-OPEN (LIVE)**: re-confirm `applyUpdateAndCheck` (update-entry-helpers.js:20-33) checks return value, NOT a post-write visibility re-read; no `evidence_test` |
| …-no-mcp-path-exists-to-unarchive… (escalate) | `meta-state-patch-tool.js` | **KEEP-OPEN (LIVE)**: re-confirm `grep unarchive tools/learning-loop-mastra/` = 0; no first-class `meta_state_unarchive` tool / no audit-safe recovery path. NOTE: `IMMUTABLE_PATCH_FIELDS` (`meta-state.js:284-294`) does NOT include `archived_*`/`status`, so the finding's "IMMUTABLE blocks archived_*" premise is stale — the gap is the missing sanctioned tool, not a patch block. |

## Verification matrix (test scenario per finding)

| finding | pass-condition for RESOLVE | fail → action |
|---|---|---|
| vnstock ledger | script present + converts ledger | fail → KEEP-OPEN (no mechanism) |
| SP2 marker | migration done + grounding re-established | fail → KEEP-OPEN |
| report-overwrites | (n/a — pre-classified KEEP-OPEN LIVE) | KEEP-OPEN; record `:14-28` ignores caller id |
| taskUpdate-noop | (n/a — pre-classified KEEP-OPEN pending journal) | KEEP-OPEN; symptom-shaped evidence + likely upstream |
| handoff-md | active doc lacks the section | fail → KEEP-OPEN |
| transport-L1 | (n/a — pre-classified KEEP-OPEN) | KEEP-OPEN; record `.mcp.json` fooled derivation |
| EOF-conflict | (n/a — pre-classified KEEP-OPEN) | KEEP-OPEN; record `.gitignore` fooled derivation |
| log_change | (n/a — pre-classified KEEP-OPEN LIVE) | KEEP-OPEN; record LIVE code evidence |
| supersede | (n/a — pre-classified KEEP-OPEN LIVE) | KEEP-OPEN; record #38 guard insufficient |
| unarchive | (n/a — pre-classified KEEP-OPEN LIVE) | KEEP-OPEN; record no first-class tool (not an IMMUTABLE block) |

## derive_status actual results (planning-time, for Phase 1 to re-confirm)
- **resolved-by-mechanism (7/10):** vnstock, SP2, report-overwrite, taskUpdate-noop, handoff-md, transport-L1, EOF-conflict — all `code_ref_exists:true`. Of these, transport-L1 + EOF-conflict are false-positives (symptom files); report-overwrite + taskUpdate-noop also derive resolved-by-mechanism but are LIVE/symptom (do NOT resolve); vnstock/SP2/handoff-md are the genuine resolve candidates.
- **active-uncertain (1/10):** unarchive — `code-only`, `test_file_exists:false` (dead `tools/learning-loop-mcp/__tests/` path); recommendation `no_action`.
- **active-no-signal (2/10):** log_change, supersede — `code-missing` (`code_ref_exists:false`); the `:line-range` suffix on `evidence_code_ref` breaks the existence check. recommendation `investigate`.

## MCP-tool / interface checklist
- [ ] `meta_state_derive_status({id})` × 10 (read-only; no ground-budget cost).
- [ ] `Read` each `evidence_code_ref`; `Read` the 3 journals for the verify-needed rows.
- [ ] `Grep`/`Glob` to confirm absence claims (no `docs/transport-layer.md`, no `meta_state_unarchive`, no `.gitattributes` union entry).
- [ ] **No** `meta_state_resolve` / `meta_state_patch` / `meta_state_report` in this phase.

## Dependency map
- Depends on: nothing.
- Blocks: Phase 2 (needs the RESOLVE rows), Phase 3 (needs the KEEP-OPEN rows).
- External: none. No cross-plan blocking (260704-0301 done; 260708-0833 session-mode rename doesn't touch these findings; 260709-1032/1237 already shipped their work).

## Implementation Steps
1. For each of the 10 full-ids, `meta_state_derive_status({id})` and capture `derived_status` + `signals.code_ref_exists` + `recommendation`.
2. `Read` the `evidence_code_ref` for each finding; for the taskUpdate-noop row also `Read` the journal `docs/journals/260622-phase-d-plan-1b-shipped.md`. (report-overwrite, log_change, supersede, unarchive were already read during planning/red-team — re-confirm they haven't drifted.)
3. Re-confirm the **7 pre-classified KEEP-OPEN** against current code (transport-L1, EOF-conflict, log_change, supersede, unarchive, report-overwrite, taskUpdate-noop); files may have changed since planning-time.
4. Build the 10-row classify table. Any row where manual evidence contradicts the research classification → update the table and flag in the phase report. Expected RESOLVE candidates: vnstock, SP2, handoff-md (3); expected KEEP-OPEN: 7.
5. Write the table to the phase report (`plans/reports/`) so Phase 2/3 consume a stable artifact, not memory.

## Success Criteria
- [ ] 10-row classify table produced with per-finding evidence reason.
- [ ] Zero resolves justified by `derive_status` alone.
- [ ] The 7 KEEP-OPEN re-confirmed against current code (not assumed).
- [ ] Phase report written; Phase 2 RESOLVE list (≤3) and Phase 3 KEEP-OPEN list (≥7) frozen.

## Risk Assessment
- **Misclassification (HIGH)** — the cost of a wrong resolve is a silenced live bug (report-overwrite almost shipped as a false resolve). Mitigation: manual evidence read for every RESOLVE; the 7 KEEP-OPEN are the high-value, high-confidence holds; bias toward KEEP-OPEN on any doubt.
- **Code drift between plan and execute** — a LIVE bug may have been fixed post-#47. Mitigation: re-Read current code in step 3, don't trust the planning-time snapshot.
- **`manifest.json` false-positive** — taskUpdate-noop's evidence is symptom-shaped; if the journal shows only a manifest entry, that's a KEEP-OPEN, not a resolve.
