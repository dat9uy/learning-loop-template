---
phase: 2
title: "Promote rule + add PROCESS_HINTS"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Promote rule + add PROCESS_HINTS

## Overview

Promote the frozen rule via `meta_state_promote_rule`, patch the new rule with `affected_system: "gate-logic"` (per Validation Q2), append a 4th `PROCESS_HINTS` row in `core/loop-introspect.js`, mirror the row to `.factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS`, then smoke-test via `loop_describe({tier: warm})` to confirm zero warnings BEFORE Phase 4 begins.

## Requirements

- Functional: `meta_state_promote_rule({id: <source-finding-id>, rule_id: "rule-tool-integration-same-commit-dep", enforcement: "agent", pattern_type: "consult-checklist", pattern: <JSON body>})` returns `{promoted: true}`. `meta_state_patch` adds `affected_system: "gate-logic"`. `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})` returns 1 entry with `status: active` AND `affected_system: "gate-logic"`. `loop_describe({tier: warm})` returns `warnings: []`.
- Non-functional: PROCESS_HINTS row text references the rule id as a literal substring (matches `rule-runtime-agnostic-features` precedent at `core/loop-introspect.js:119`). The hook mirror row is byte-for-byte identical to the canonical row (parity test enforces this at `cold-session-discoverability.test.cjs:366-386`).

## Architecture

```
core/loop-introspect.js
  PROCESS_HINTS (lines 116-120, 3 rows)
    ↓ insert 4th row between line 119 and line 120 (before `]);`)
  PROCESS_HINTS (lines 116-121, 4 rows)
    row 4: "Tool integration checklist. ..."

.factory/hooks/loop-surface-inject.cjs
  LOCAL_PROCESS_HINTS (3 rows currently)
    ↓ mirror 4th row byte-for-byte
  LOCAL_PROCESS_HINTS (4 rows)

meta-state.jsonl
  append 1 entry: rule-tool-integration-same-commit-dep (consult-checklist)
  patch 1 entry: rule-tool-integration-same-commit-dep (add affected_system)
  side-effect: source finding meta-260628T1328Z-commit-6f9402e-...
    gets version bumped (updateEntry at meta-state-promote-rule-tool.js:178-179)
```

## Related Code Files

- Create: `tools/scripts/enable-operator-mode.sh` (NEW per Validation Q1 — bootstrap script that exports `OPERATOR_MODE=1`)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (insert 1 PROCESS_HINTS row between line 119 and `]);` line 120)
- Modify: `.factory/hooks/loop-surface-inject.cjs` (mirror 4th PROCESS_HINTS row to LOCAL_PROCESS_HINTS)
- Modify: `meta-state.jsonl` (1 new rule entry via `meta_state_promote_rule`; 1 patch via `meta_state_patch` for `affected_system`; 1 source finding gets version bump as tool side-effect — NOT direct write)

## Implementation Steps

1. **(NEW per Validation Q1) Invoke bootstrap script** to set `OPERATOR_MODE=1`: `source tools/scripts/enable-operator-mode.sh`. The script (5 lines, frozen shape):
   ```bash
   #!/usr/bin/env bash
   # Enable operator-mode for MCP tool calls that require elevated privileges
   # (meta_state_promote_rule, meta_state_log_change with supersedes, etc.).
   # Idempotent: safe to source multiple times.
   export OPERATOR_MODE=1
   echo "OPERATOR_MODE=$OPERATOR_MODE"
   ```
   If `tools/scripts/enable-operator-mode.sh` does not exist yet, create it first with this content + `chmod +x`.
2. **Call `meta_state_promote_rule`** with the frozen body from `plan.md` Appendix A. Use the MCP tool, not a direct file write. The write gate blocks direct registry writes.
   - `id`: `meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but` (the broadest-category source finding; becomes `origin` in the new rule entry)
   - `rule_id`: `rule-tool-integration-same-commit-dep`
   - `enforcement`: `agent`
   - `pattern_type`: `consult-checklist`
   - `pattern`: the JSON body from Appendix A
   - `scope_predicate`: omit (always on — the same-commit dependency check applies to any CI tool integration)
   - **No `preview: true`** — for `consult-checklist` pattern_type, preview returns empty `sample_matches` (`meta-state-promote-rule-tool.js:82-108` only previews `regex`/`glob`); it's a no-op. Skip directly to activation.
3. **(NEW per Validation Q2) Patch the new rule with `affected_system`** via `meta_state_patch`:
   - `id`: `rule-tool-integration-same-commit-dep`
   - `entry_kind`: `rule`
   - `patch`: `{affected_system: "gate-logic"}`
   - Rationale: `meta_state_promote_rule` doesn't set this field (verified at `meta-state-promote-rule-tool.js:160-173`). Mirrors the source findings' `affected_system: "gate-logic"`. Makes the new rule discoverable via `meta_state_list({affected_system: "gate-logic", entry_kind: "rule"})`.
4. **Verify the entry was appended** via `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep", compact: true})`. Expected: 1 entry with `status: active` AND `affected_system: "gate-logic"`. The `description` field will be the tool-generated form (R-CRIT-3), NOT the custom ~280-char description from Appendix A — this is expected.
5. **Read `tools/learning-loop-mastra/core/loop-introspect.js`** lines 116-120 to confirm the current PROCESS_HINTS row count and ordering.
6. **Edit `core/loop-introspect.js`**: insert a 4th row between line 119 (the existing 3rd PROCESS_HINTS row) and line 120 (the closing `]);`). Recommended text (mirrors the existing 3 rows' shape, references rule id as a literal substring):
   ```js
   "Tool integration checklist. Before wiring a new tool into CI or repo automation, consult the 3-item checklist in `rule-tool-integration-same-commit-dep`: (1) same-commit dependency — if the workflow adds `pnpm exec <tool>` / `npx <tool>` / `npm run <script>`, the tool MUST be in `devDependencies` in the SAME commit; (2) baseline flag format — `fallow <sub> --save-baseline` (audit) and `--save-regression-baseline` (regression) produce INCOMPATIBLE JSON; (3) baseline storage — `fallow` auto-creates `.fallow/.gitignore: *`; verify `git ls-files` returns expected files OR move to `plans/<slug>/reports/fallow/`. See `tools/learning-loop-mastra/core/README.md` §Tool integration checklist.",
   ```
7. **Edit `.factory/hooks/loop-surface-inject.cjs`**: mirror the 4th PROCESS_HINTS row to `LOCAL_PROCESS_HINTS` byte-for-byte. The cold-session parity test at `__tests__/legacy-mcp/cold-session-discoverability.test.cjs:366-386` strictEqual-enforces item-by-item equality. ANY drift between the two arrays fails the test.
8. **Verify the edits** by reading lines 116-122 of `core/loop-introspect.js` and the matching LOCAL_PROCESS_HINTS range in `.factory/hooks/loop-surface-inject.cjs`. Both must contain 4 rows with the same 4th row text.
9. **(NEW per R-HIGH-5) Smoke test: run `loop_describe({tier: warm})`** via MCP tool. Expected: `warnings: []` (the H6 ordering gate at `loop-describe-tool.js:90-102` checks `processHints.some((h) => h.includes(rule.id))` and must find our rule id). If warnings present, fix the PROCESS_HINTS row BEFORE proceeding to Phase 4 — there is no `meta_state_unresolve` tool, so post-resolution rollback is impossible.
10. **Mark Phase 2 complete** via `ck plan check 260628-1337-fallow-tool-integration-rule-encoding/phase-02-promote-rule-add-process-hints.md`.

## Success Criteria

- [ ] `tools/scripts/enable-operator-mode.sh` exists and exports `OPERATOR_MODE=1`
- [ ] `meta_state_promote_rule` returns `{promoted: true}`
- [ ] `meta_state_patch` adds `affected_system: "gate-logic"` to the new rule
- [ ] `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})` returns 1 entry with `status: active` AND `affected_system: "gate-logic"`
- [ ] `core/loop-introspect.js` has 4 PROCESS_HINTS rows; the 4th (between line 119 and `]);`) references `rule-tool-integration-same-commit-dep` as a literal substring
- [ ] `.factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS` mirrors the 4th row byte-for-byte
- [ ] `loop_describe({tier: warm})` returns `warnings: []`
- [ ] Source finding `meta-260628T1328Z-commit-6f9402e-...` `version` field incremented (verified via `meta_state_list({entry_kind: "finding", id: ...})`)
- [ ] Phase 2 marked complete via `ck plan check`

## Risk Assessment

- **R1 — `meta_state_promote_rule` rejects the pattern body.** Mitigation: if Zod schema fails, the error message identifies the exact field; the pattern body mirrors `rule-runtime-agnostic-features` (line 127) and `rule-pr-body-registry-deltas` (line 167) which both parse cleanly. Fix and retry.
- **R2 — PROCESS_HINTS array break (missing comma, unclosed bracket).** Mitigation: read the file after edit; the array literal is small enough to verify by eye.
- **R3 — `meta-state.jsonl` direct write blocked by write gate.** Mitigation: ALWAYS use `meta_state_promote_rule` and `meta_state_patch` MCP tools, never `Write` to `meta-state.jsonl`. The write gate's enforced path is the only correct path.
- **R4 — Hook mirror drift breaks cold-session parity test.** Mitigation: step 8 verifies both arrays item-by-item. ANY drift fails the test loudly; cannot be silently skipped.
- **R5 — Operator mode not set, promotion returns `operator_role_required`.** Mitigation: step 1 invokes `tools/scripts/enable-operator-mode.sh` to set `OPERATOR_MODE=1` before any tool call. The script is idempotent and reusable for future operator-only operations.
- **R6 — H6 ordering gate warns because PROCESS_HINTS row paraphrases rule id.** Mitigation: step 9 smoke-test catches this BEFORE Phase 4 begins.