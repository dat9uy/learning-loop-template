---
phase: 4
title: "Resolve 3 findings + write change-log"
status: pending
priority: P2
dependencies: [3]
---

# Phase 4: Resolve 3 findings + write change-log

## Overview

Transition each of the 3 source findings from `status: active` to `status: resolved` via `meta_state_resolve`, with finding-specific `resolution` notes pointing at the new rule id. Then write a single change-log entry mirroring `meta-260623T1450Z-...` (meta-state.jsonl:168).

**Critical design decisions (corrected per R-HIGH-2, R-HIGH-3, R-HIGH-4, R-HIGH-6):**
- Use `status: resolved` + `resolution` text (NOT `status: superseded` + `consolidated_into: rule-...`). `consolidated_into` targets change-log entries per `core/meta-state.js:75-76` (schema-enforced on the finding side).
- Do NOT use `consolidates` field on the change-log entry — no precedent exists in the registry (line 168 doesn't use it). Capture the 3 finding links via the resolution text on each finding instead.
- Refresh `code_fingerprint` on finding 1 BEFORE resolving — finding 1 has `mechanism_check: true` but no fingerprint; `checkResolutionEvidence` would block (R-HIGH-3).
- Retry strategy for `meta_state_log_change` 60s idempotency cache: vary `reason` string on retry (R-HIGH-4).

## Requirements

- Functional: 3 finding entries transition to `resolved` with `resolved_by: operator`, `resolved_at: <iso>`, `resolution: "Encoded as rule-tool-integration-same-commit-dep (consult-checklist, item N). <finding-specific note>."`. One change-log entry written with `applies_to.rules: ["rule-tool-integration-same-commit-dep"]` (NO `consolidates` field).
- Non-functional: each finding's `resolution` text mentions the specific preventive rule (not just "see rule-X") so a future reader understands why this finding closed.

## Architecture

```
meta-state.jsonl (line 203, finding 1)
  meta-260628T1328Z-commit-6f9402e-...
    PRE: status: active, mechanism_check: true, no code_fingerprint
    STEP 1: meta_state_refresh_fingerprint (R-HIGH-3) — populates code_fingerprint
    status: active → resolved
    resolved_by: operator
    resolved_at: 2026-06-28T...
    resolution: "Encoded as rule-tool-integration-same-commit-dep (consult-checklist, item 1: same-commit dependency). 9ed520d added `fallow` to devDependencies; CI's `pnpm install --frozen-lockfile` now resolves the binary. Future workflow edits that add `pnpm exec <tool>` / `npx <tool>` / `npm run <script>` are caught by the rule."

meta-state.jsonl (line 204, finding 2)
  meta-260628T1328Z-fallow-dead-code-save-regression-...
    status: active → resolved
    resolution: "Encoded as rule-tool-integration-same-commit-dep (consult-checklist, item 2: baseline flag format). 9ed520d regenerated dead-code-baseline.json with `fallow dead-code --save-baseline` (audit format). Future baseline generators must use `--save-baseline`, never `--save-regression-baseline`."

meta-state.jsonl (line 205, finding 3)
  meta-260628T1329Z-when-fallow-runs-...
    status: active → resolved
    resolution: "Encoded as rule-tool-integration-same-commit-dep (consult-checklist, item 3: baseline storage). 9ed520d relocated baselines to plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/. Future baseline writes must verify `git ls-files` returns expected files, prefer plan-dir storage, or add `!.fallow/baselines/` to root .gitignore."

meta-state.jsonl (line 207, new)
  meta-260628T1337Z-promoted-rule-tool-integration-same-co
    entry_kind: change-log
    change_dimension: semantic
    change_target: meta-state.jsonl#rule-tool-integration-same-commit-dep
    applies_to.rules: ["rule-tool-integration-same-commit-dep"]
    (NO consolidates — no registry precedent)
    evidence_code_ref: tools/learning-loop-mastra/core/loop-introspect.js#PROCESS_HINTS
    evidence_journal: plans/260628-1337-fallow-tool-integration-rule-encoding/reports/journal-260628-fallow-tool-integration-rule.md

meta-state.jsonl (line 208, new — Phase 4 step 9)
  loop-design-encode-n-anti-pattern-findings-as-consult-checklist-rule
    entry_kind: loop-design
    title: "Encode N anti-pattern findings as a single consult-checklist rule when they share a domain"
    status: active
    proposed_design_for: ["rule-tool-integration-same-commit-dep"]
    addresses: [<3-finding-ids>]
    description: <meta-pattern description from Phase 4 step 9>
    affected_system: meta
    severity_hint: low
```

## Related Code Files

- Modify: `meta-state.jsonl` (3 finding entries + 1 new change-log entry + 1 new loop-design entry) — via MCP tools ONLY (`meta_state_refresh_fingerprint`, `meta_state_resolve`, `meta_state_log_change`, `meta_state_propose_design`); the write gate blocks direct writes

## Implementation Steps

1. **Verify pre-conditions:**
   - `meta_state_list({entry_kind: "finding", id: [<3-ids>]})` returns 3 entries with `status: active`
   - `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})` returns 1 entry with `status: active` (from Phase 2)
   - `loop_describe({tier: warm})` returns `warnings: []` (Phase 2 step 7 smoke test)
2. **(NEW per R-HIGH-3) Call `meta_state_refresh_fingerprint` for finding 1** (`meta-260628T1328Z-commit-6f9402e-...`). The finding has `mechanism_check: true` but lacks `code_fingerprint` (verified at meta-state.jsonl:203). Without a fresh fingerprint, `checkResolutionEvidence` will block resolution. The tool reads the file at `evidence_code_ref` (`package.json:32-34`) and computes SHA-256. Findings 2 and 3 already have fingerprints (lines 204, 205), so refresh only finding 1.
3. **Call `meta_state_resolve` for finding 1** (`meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but`):
   - `resolution`: `"Encoded as rule-tool-integration-same-commit-dep (consult-checklist, item 1: same-commit dependency). 9ed520d added fallow to devDependencies; CI's pnpm install --frozen-lockfile now resolves the binary. Future workflow edits adding pnpm exec / npx / npm run invocations are caught by the rule."`
   - `resolved_by`: `operator`
4. **Call `meta_state_resolve` for finding 2** (`meta-260628T1328Z-fallow-dead-code-save-regression-baseline-and-fallow-dead-c`):
   - `resolution`: `"Encoded as rule-tool-integration-same-commit-dep (consult-checklist, item 2: baseline flag format). 9ed520d regenerated dead-code-baseline.json with fallow dead-code --save-baseline (audit format: array of path:export strings). Future baseline generators must use --save-baseline, never --save-regression-baseline."`
   - `resolved_by`: `operator`
5. **Call `meta_state_resolve` for finding 3** (`meta-260628T1329Z-when-fallow-runs-in-a-project-root-it-auto-creates-a-root-fa`):
   - `resolution`: `"Encoded as rule-tool-integration-same-commit-dep (consult-checklist, item 3: baseline storage). 9ed520d relocated baselines to plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/. Future baseline writes must verify git ls-files returns expected files, prefer plan-dir storage, or add !.fallow/baselines/ to root .gitignore."`
   - `resolved_by`: `operator`
6. **Verify all 3 are resolved:** `meta_state_list({entry_kind: "finding", id: [<3-ids>]})` → 3 entries each with `status: resolved`, `resolved_by: "operator"`, non-null `resolved_at`.
7. **(R-HIGH-4 fix) Call `meta_state_log_change`** to write the change-log entry:
   - `change_dimension`: `semantic`
   - `change_target`: `meta-state.jsonl#rule-tool-integration-same-commit-dep`
   - `change_diff`: `{added: ["rule-tool-integration-same-commit-dep (consult-checklist, 3 items)"], removed: [], changed: ["meta-260628T1328Z-commit-6f9402e-...: status active → resolved (finding 1)", "meta-260628T1328Z-fallow-dead-code-save-regression-...: status active → resolved (finding 2)", "meta-260628T1329Z-when-fallow-runs-...: status active → resolved (finding 3)", "source finding meta-260628T1328Z-commit-6f9402e-...: version bumped via meta_state_promote_rule side-effect (Phase 2)"]}`
   - `reason`: `"Encoded 3 fallow tool-integration anti-pattern findings as a single consult-checklist rule. PROCESS_HINTS row added at core/loop-introspect.js (between line 119 and 120); hook mirror updated at .factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS; core/README.md 'Tool integration checklist' section added at line 65. All 3 findings transitioned active → resolved."` (≥20 chars: yes, ~280 chars)
   - `applies_to`: `{rules: ["rule-tool-integration-same-commit-dep"], tools: ["meta_state_resolve", "meta_state_promote_rule"], statuses: ["resolved"]}`
   - **NO `consolidates` field** (R-HIGH-6 — no registry precedent; finding links captured in each finding's `resolution` text)
   - `evidence_code_ref`: `tools/learning-loop-mastra/core/loop-introspect.js#PROCESS_HINTS`
   - `evidence_journal`: `plans/260628-1337-fallow-tool-integration-rule-encoding/reports/journal-260628-fallow-tool-integration-rule.md` (Phase 5 writes this)
   - **Retry strategy (R-HIGH-4):** if the tool returns `{logged: true, cache_hit: true}` but no entry exists on re-query, vary the `reason` string by appending ` (retry <iso>)` and retry once. Do NOT silently accept the cached no-op result.
8. **Verify the change-log entry was appended:**
   `meta_state_list({entry_kind: "change-log", id: "meta-260628T1337Z-promoted-rule-tool-integration-same-co", compact: true})` → 1 entry with `applies_to.rules: ["rule-tool-integration-same-commit-dep"]` and NO `consolidates` field.
9. **(NEW per Validation Q3) File loop-design entry** capturing the meta-pattern "encode N anti-pattern findings as a single consult-checklist rule when they share a domain" via `meta_state_propose_design`:
   - `title`: `"Encode N anti-pattern findings as a single consult-checklist rule when they share a domain"`
   - `description`: `"When N active findings share a domain (e.g., 3 fallow tool-integration issues), encode them as a single consult-checklist rule rather than N separate regex/glob rules. The rule body JSON-encodes N checklist items; PROCESS_HINTS row references the rule id as a literal substring; hook mirror is updated byte-for-byte. The N findings transition to status=resolved with finding-specific resolution text pointing at the rule id (NOT consolidated_into: rule-...). Ship via plan that calls meta_state_promote_rule + meta_state_patch (for affected_system) + meta_state_resolve (N times) + meta_state_log_change (1 change-log with applies_to.rules). The change-log uses applies_to.rules only (no consolidates field — no registry precedent)."`
   - `proposed_design_for`: `["rule-tool-integration-same-commit-dep"]`
   - `addresses`: `["meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but", "meta-260628T1328Z-fallow-dead-code-save-regression-baseline-and-fallow-dead-c", "meta-260628T1329Z-when-fallow-runs-in-a-project-root-it-auto-creates-a-root-fa"]`
   - `affected_system`: `meta`
   - `severity_hint`: `low` (meta-pattern; not a blocker for future plans)
   - `loop_design_id`: `loop-design-encode-n-anti-pattern-findings-as-consult-checklist-rule`
10. **Mark Phase 4 complete** via `ck plan check`.

## Success Criteria

- [ ] All 3 finding entries have `status: resolved`, `resolved_by: operator`, `resolved_at: <iso>` (non-null), finding-specific `resolution` text
- [ ] Finding 1 has `code_fingerprint` populated (via `meta_state_refresh_fingerprint` before resolution)
- [ ] Change-log entry written with `applies_to.rules: ["rule-tool-integration-same-commit-dep"]` and NO `consolidates` field
- [ ] Loop-design entry filed with id `loop-design-encode-n-anti-pattern-findings-as-consult-checklist-rule`
- [ ] Phase 4 marked complete via `ck plan check`

## Risk Assessment

- **R1 — `meta_state_resolve` consult-gate blocks resolution.** Mitigation: step 2 calls `meta_state_refresh_fingerprint` first to populate finding 1's fingerprint. Findings 2 and 3 already have fingerprints (lines 204, 205). The `rule-no-orphaned-evidence` consult gate is satisfied.
- **R2 — `meta_state_log_change` 60s cache silently no-ops on retry.** Mitigation: step 7 retry strategy varies `reason` on retry; verify via `meta_state_list` immediately after each attempt.
- **R3 — Direct write to `meta-state.jsonl` blocked by write gate.** Mitigation: ALWAYS use MCP tools (`meta_state_refresh_fingerprint`, `meta_state_resolve`, `meta_state_log_change`, `meta_state_propose_design`); never `Edit` or `Write` to `meta-state.jsonl`.
- **R4 — Resolution field length.** Each resolution text is ~280-340 chars; well within Zod `min(20)` constraint.
- **R5 — Loop-design entry collides with existing id.** Mitigation: the explicit `loop_design_id: "loop-design-encode-n-anti-pattern-findings-as-consult-checklist-rule"` is unique (verified against existing entries at meta-state.jsonl:166).