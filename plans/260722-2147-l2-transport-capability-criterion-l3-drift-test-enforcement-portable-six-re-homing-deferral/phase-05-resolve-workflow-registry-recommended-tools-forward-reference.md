---
phase: 5
title: "Resolve WORKFLOW_REGISTRY recommended_tools forward-reference"
status: pending
priority: P3
effort: "2h"
dependencies: [1]
---

# Phase 5: Resolve WORKFLOW_REGISTRY recommended_tools forward-reference

## Overview

Resolve audit unresolved-question U-Q3: `core/workflow-registry.js` `WORKFLOW_REGISTRY.*.recommended_tools` references `index_extract`, `index_validate`, `capability_generate` — tools **not in `tools/manifest.json`**. `notify_artifact` / `trigger` return these names to callers today. **Red-team established the likely answer (AD-F2 + Sec-F7):** `capability_generate` + `index_extract` were **deleted** in plan `260612-1700-meta-surface-re-debate` (line 31: "13 product-surface MCP tools deleted") — they are dead refs, with stale leftovers in `skills/coordination-gate/SKILL.md` + `tools/handlers/references/tool-selection-guide.md`. `index_validate` was NOT in the deleted list — confirm per-tool. Decide evidence-first (dead vs pending), then act. Independent of Phases 2–4.

## Requirements

- Functional: classify each of the 3 names with a "deleted in a later plan" branch (red-team AD-F2 — the original classifier missed this and would have misclassified deleted tools as a pending subsystem). For dead refs: empty `recommended_tools` to `[]` (**forbid field removal** — red-team FMA-F6: `trigger-workflow-tool.js:33` calls `def.recommended_tools.join(", ")` → `undefined.join` throws `TypeError`); add `def.recommended_tools ?? []` guard in `trigger` + `notify` handlers; update `core/workflow-registry.test.js` to expect `[]`; clean the stale skill-doc references OR file a finding for them. For any genuinely pending name: file a finding + forward-looking comment.
- Non-functional: `notify_artifact`/`trigger` return well-formed `{ matched, recommendations }` (empty allowed); `pnpm test` green; change-log the `core/**` edit (bound artifact).

## Architecture

`WORKFLOW_REGISTRY` (`core/workflow-registry.js:3`) is a static 3-entry table mapping change-path triggers to `recommended_tools`. The recommended names are returned by `evaluateTriggers` → `notify_artifact` / `trigger` handlers. If those names map to no real tool, callers get recommendations they cannot act on (a quiet defect). Classification branches (red-team AD-F2 correction — the original had no "deleted" branch):

- **Deleted in a later plan → dead refs (default for `index_extract` + `capability_generate`).** Evidence: `plans/260612-1700-meta-surface-re-debate/plan.md:31`. Action: empty `recommended_tools` to `[]` (NOT remove the field); add `def.recommended_tools ?? []` guard in both handlers; update `core/workflow-registry.test.js` assertions (`:9-10`, `:22-23`, `:29`, `:70`) to expect `[]`; clean stale refs in `skills/coordination-gate/SKILL.md` + `tool-selection-guide.md` (or file a finding); change-log.
- **Pending subsystem → keep + file a finding** (only if a plan/doc describes the tool as a *future* capability, not a deleted one). Add a `// forward-looking: pending <subsystem>` comment; change-log.

## Related Code Files

- Create: 1–2 findings (record writes): the stale-skill-doc-reference finding (Q3) + any pending-subsystem finding (only if step 2 finds a genuinely future tool).
- Modify: `tools/learning-loop-mastra/core/workflow-registry.js`; `tools/learning-loop-mastra/core/workflow-registry.test.js` (red-team Sec-F6/FMA-F5 — was missing); `tools/learning-loop-mastra/tools/handlers/notify-artifact-tool.js` + `trigger-workflow-tool.js` (add `?? []` guard).
- Delete: none (empty-to-`[]`, do not remove fields). **Skill docs NOT modified** (Q3 — deferred to a separate skills-hygiene pass via a finding).
- Read (evidence): `tools/learning-loop-mastra/core/workflow-registry.js`, `tools/learning-loop-mastra/core/workflow-registry.test.js`, `tools/learning-loop-mastra/tools/manifest.json`, `tools/learning-loop-mastra/tools/handlers/trigger-workflow-tool.js:33-37`, `plans/260612-1700-meta-surface-re-debate/plan.md:31`, `skills/coordination-gate/SKILL.md`, `tools/handlers/references/tool-selection-guide.md`.

## Implementation Steps

1. Grep **broadly** (red-team Sec-F7 — Phase 1 step 7's original `tools/handlers`-only scope misses the skill docs): `index_extract`, `index_validate`, `capability_generate` across `tools/`, `core/`, `plans/`, `docs/`, `skills/`, `tools/handlers/references/`, `__tests__/`. Use the Phase 1 scout result as the start.
2. Classify per-name with the deleted-in-later-plan branch:
   - `index_extract` + `capability_generate`: deleted in `plans/260612-1700-meta-surface-re-debate/plan.md:31` → **dead refs** (default).
   - `index_validate`: NOT in the deleted list — confirm whether any handler/plan/doc references it as live. If no live handler → dead ref; if a plan/doc describes it as future → pending.
   - If any name has a live handler under a different name → mapping fix (not deletion).
3. Dead-ref path: empty the 3 `recommended_tools` arrays to `[]` (**do not remove the fields** — FMA-F6 TypeError). Add `def.recommended_tools ?? []` guard in `trigger-workflow-tool.js:33-37` + `notify-artifact-tool.js`. Update `core/workflow-registry.test.js`: relax `:70` (`length > 0` → `>= 0`); update `:9-10`, `:22-23`, `:29` to expect `[]` (or delete the 3 match-tests since the tools no longer exist). Add a code comment that recommendations are vacant pending a real index/capability subsystem. Change-log the `core/**` edit.
4. **Stale skill-doc references (validation Q3 = file a finding, leave them):** `skills/coordination-gate/SKILL.md:25-26,46,51-53` + `tools/handlers/references/tool-selection-guide.md:103` still reference the deleted tools. **File a finding** (via `meta_state_report`, runtime pin `.claude`, `category: mcp-tool-missing`, `severity: warning`, `subtype: stale-skill-doc-reference-to-deleted-tools`, `affected_system: workflow-registry`, `evidence_code_ref: skills/coordination-gate/SKILL.md`) naming the stale refs so a dedicated skills-hygiene pass owns them. **Do NOT edit the skill docs in this plan** — they are bound artifacts with their own write-gate; cleaning them is out of scope.
5. Pending-subsystem path (only if step 2 finds a name is genuinely future): file a finding via `meta_state_report` (runtime pin `.claude`, schema-valid: `category: mcp-tool-missing`, `severity: warning`, `subtype: pending-index-capability-subsystem`); add a `// forward-looking` comment; change-log.
6. Run `pnpm test` (workflow-registry + notify-artifact + trigger suites); green.
7. Confirm `notify_artifact` / `trigger` return well-formed `{ matched, recommendations }` (empty allowed); grep callers of `evaluateTriggers` / the two handlers — none require non-empty recommendations.

## Success Criteria

- [ ] Evidence grep recorded (broad scope: `tools/`+`core/`+`plans/`+`docs/`+`skills/`+`references/`); each of the 3 names classified dead vs pending with a one-line justification (deleted-in-260612-1700 for the 2 confirmed).
- [ ] Dead-ref path: `recommended_tools` emptied to `[]` (fields NOT removed); `?? []` guard added in both handlers; `core/workflow-registry.test.js` updated to expect `[]`; **stale skill-doc refs filed as a finding (NOT edited — Q3)**; change-log logged; tests green. OR pending path: finding filed + forward-looking comment + change-log.
- [ ] `notify_artifact` / `trigger` return well-formed `{ matched, recommendations }` (empty allowed); no caller requires non-empty.
- [ ] U-Q3 marked resolved (in this plan's final summary / journal).

## Risk Assessment

- **Field removal TypeError (red-team FMA-F6 — now mitigated).** Removing the `recommended_tools` fields would crash `trigger-workflow-tool.js:33` (`undefined.join`). Mitigation: mandate empty-to-`[]`; add `?? []` guard.
- **Misclassifying deleted tools as pending (red-team AD-F2 — now mitigated).** The original classifier would have seen old plan references and taken the pending path, leaving the dead refs. Mitigation: the "deleted in a later plan" branch + broad grep including `plans/` deletion records; default dead for the 2 confirmed-deleted names.
- **`workflow-registry.test.js` breakage (red-team Sec-F6/FMA-F5 — now in scope).** Emptying `recommended_tools` breaks `:70` (`> 0`) + `:9-10`/`:22-23`/`:29` (specific names). Mitigation: step 3 updates those assertions to expect `[]`.
- **Caller expects non-empty recommendations.** Mitigation: step 7 greps callers; none are known to require non-empty (they render recommendations as suggestions). Low risk.