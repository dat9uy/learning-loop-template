---
phase: 3
title: "Document checklist in core/README.md"
status: pending
priority: P2
dependencies: [2]
---

# Phase 3: Document checklist in core/README.md

## Overview

Add the human-readable "Tool integration checklist" section to `core/README.md`, immediately after the existing "Admission rule" section (line 64) and before "Soft inversion (Mechanism B)". This is the discoverability surface for humans searching the repo for fallow/CI integration rules without going through `meta_state_list`.

## Requirements

- Functional: a new section titled "## Tool integration checklist" exists at `core/README.md` after line 64. The section contains the 3 numbered items from the rule body in human-readable form. A reference back to the rule id (`rule-tool-integration-same-commit-dep`) and to the `PROCESS_HINTS` row is present.
- Non-functional: matches the style of the surrounding "Admission rule" section (numbered list, prose intro, cross-reference footer).

## Architecture

```
core/README.md
  line 41-64: ## Admission rule (existing)
  line 65+:   ## Tool integration checklist (NEW)
  ...
  ## Soft inversion (Mechanism B) (existing)
```

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/README.md` (insert new section after line 64)

## Implementation Steps

1. **Read `tools/learning-loop-mastra/core/README.md`** lines 41-80 to confirm the current structure (Admission rule ends at line 64, Soft inversion starts at line 66 per earlier read).
2. **Edit `core/README.md`** to insert the new section between lines 64 and 66. Frozen text:
   ```markdown
   ## Tool integration checklist

   Consult this checklist when wiring a new tool into CI, package scripts, or repo automation. Encoded as the `rule-tool-integration-same-commit-dep` consult-checklist rule (see `meta-state.jsonl`) with a corresponding `PROCESS_HINTS` row in `core/loop-introspect.js`.

   1. **Same-commit dependency.** If a workflow adds `pnpm exec <tool>` / `npx <tool>` / `npm run <script>`, the tool MUST be in `devDependencies` (or `dependencies`) in the SAME commit. Verify with `grep '<tool>' package.json` after any `.github/workflows/*.yml` edit. Symptom of skip: CI's `pnpm install --frozen-lockfile` fails with `command not found` on the first PR.
   2. **Baseline flag format.** When wiring `fallow audit`, generate baselines with `fallow <sub> --save-baseline <path>` (audit format: array of `path:export` strings). NEVER `--save-regression-baseline` (regression format: nested objects). The two flags produce INCOMPATIBLE JSON; `fallow audit --*-baseline` fails to parse the regression format.
   3. **Baseline storage.** `fallow` auto-creates `<root>/.fallow/.gitignore: *` that silently gitignores `.fallow/baselines/`. Verify `git ls-files <root>/.fallow/baselines/` returns expected files BEFORE committing. Prefer `plans/<plan-slug>/reports/fallow/` (which inherits the plan's gitignore); if you must keep at `<root>/.fallow/baselines/`, add `!.fallow/baselines/` exception to root `.gitignore`.

   Origin findings: `meta-260628T1328Z-commit-6f9402e-...` (item 1), `meta-260628T1328Z-fallow-dead-code-save-regression-baseline-...` (item 2), `meta-260628T1329Z-when-fallow-runs-...` (item 3). All three are already FIXED in commit `9ed520d`; this section exists to prevent recurrence.
   ```
3. **Verify the edit** by reading lines 60-95 of `core/README.md` and confirming the new section is present, the 3 items are numbered, and the rule id + PROCESS_HINTS reference appear.
4. **Mark Phase 3 complete** via `ck plan check`.

## Success Criteria

- [ ] `core/README.md` line 65+ contains `## Tool integration checklist`
- [ ] 3 numbered items present
- [ ] Reference to `rule-tool-integration-same-commit-dep` present
- [ ] Reference to `PROCESS_HINTS` row present
- [ ] Origin findings cited (1 short id per item)
- [ ] Phase 3 marked complete via `ck plan check`

## Risk Assessment

- **R1 — Insert breaks surrounding section boundaries.** Mitigation: read before+after edit; verify "Soft inversion (Mechanism B)" still starts at the same heading.
- **R2 — Markdown lint failure.** Mitigation: keep the new section under the 800-line limit per project conventions; numbered list + fenced code blocks are the existing house style.