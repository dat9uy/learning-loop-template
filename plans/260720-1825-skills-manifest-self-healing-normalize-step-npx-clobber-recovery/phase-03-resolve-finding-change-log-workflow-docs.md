---
phase: 3
title: "Resolve finding + change-log + workflow docs"
status: pending
priority: P2
effort: "1-2h"
dependencies: [2]
---

# Phase 3: Resolve finding + change-log + workflow docs

## Overview

Close the loop on the meta-state finding, record the new `skills:normalize` capability as a durable change-log, and document the post-`npx` recovery workflow so operators stop hand-restoring the manifest. No code in this phase.

## Requirements

- Functional: the meta-state finding `meta-260720T1451Z-npx-skills-cli-clobbers-skills-lock-json-on-every-npx-skills` is resolved with a resolution note pointing at `tools/scripts/normalize-skills.mjs` + the passing test suite.
- Functional: a meta-state change-log entry records the new `skills:normalize` capability and the `sync` self-heal integration (change_target = the script path(s); evidence_code_ref = `tools/scripts/normalize-skills.mjs` and the `sync-skills.mjs` normalize call site).
- Functional: user-facing docs updated with the post-`npx skills add/update` workflow: run `pnpm skills:sync` (auto-normalizes the manifest, then fans out) — no hand-edit of `skills-lock.json`. Document `pnpm skills:normalize` as the standalone heal (when you want to fix the manifest without fanning out).
- Non-functional: do NOT edit the parent plan's Phase 3 status note (Q4 — `plans/260720-1404-…` is a pending plan-edit to that same file; the change-log is the durable record here).

## Architecture

- **Meta-state lifecycle:**
  1. `meta_state_resolve({id:"meta-260720T1451Z-npx-skills-cli-clobbers-skills-lock-json-on-every-npx-skills", resolution:"<note>", resolved_by:"operator"})` — resolution note cites `tools/scripts/normalize-skills.mjs` + `normalize-skills.test.js` (green) + the `sync-skills.mjs` self-heal call site, and states the post-npx workflow is now `pnpm skills:sync`.
  2. `meta_state_log_change({change_dimension:"surface", change_target:"tools/scripts/normalize-skills.mjs", change_diff:{added:["tools/scripts/skills-lib.mjs","tools/scripts/normalize-skills.mjs","pnpm skills:normalize"],changed:["tools/scripts/sync-skills.mjs (normalizeManifest integration + DRY refactor)"]}, reason:"Self-healing normalize step restores the extended external entry in skills-lock.json after npx skills clobbers it; folded into pnpm skills:sync so the post-npx workflow auto-heals. Resolves meta-260720T1451Z.", evidence_code_ref:"tools/scripts/normalize-skills.mjs"})`.
- **Docs (read-before-write per documentation-management.md):** identify the skills workflow doc — candidates: `tools/learning-loop-mastra/interface/README.md`, `tools/learning-loop-mastra/skills/README.md` (if present), or the root `CLAUDE.md` skills quick-reference. Read the existing doc, then add a concise "Post-`npx skills` recovery" subsection: after `npx skills add mastra-ai/skills` / `npx skills update mastra`, run `pnpm skills:sync` (normalizes `skills-lock.json` then fans out to all 3 surfaces); `pnpm skills:normalize` is the standalone manifest-only heal. Do NOT hand-edit `skills-lock.json` — the write-gate blocks ad-hoc edits and normalize is the sanctioned restore.

## Related Code Files

- Modify (docs): the skills workflow doc identified in Architecture (read-first; add the recovery subsection only if user-facing workflow changed — it did)
- Read-only context: `skills-lock.json` (the file the workflow concerns), `tools/scripts/sync-skills.mjs` (the self-heal entry point), `plans/260719-1428-central-skills-management/phase-03-…md` (the historical status note documenting the manual workaround this plan supersedes — read for accurate wording, do NOT edit per Q4)

## Implementation Steps

1. Read the candidate skills workflow docs; pick the one that owns the "how to manage skills" narrative (likely `tools/learning-loop-mastra/interface/README.md` or a skills README). If no single owner, add the subsection to `CLAUDE.md`'s skills quick-reference (it already lists `pnpm skills:sync`).
2. Write the "Post-`npx skills` recovery" subsection: `pnpm skills:sync` after every `npx skills add/update mastra-ai/skills` (auto-normalizes + fans out); `pnpm skills:normalize` standalone; do not hand-edit `skills-lock.json`.
3. `meta_state_resolve` the finding with the resolution note described above.
4. `meta_state_log_change` the new capability (the change-log is the durable record — supersedes the need to edit the parent plan's status note, per Q4).
5. Verify the change-log landed: `meta_state_list({id:"<new-change-log-id>"})` — confirm it exists (no in-process cache masks persistence).
6. (Optional, only if operator wants) re-derive the finding's evidence fingerprint now that `contract.js:230` is unchanged but the surrounding workflow is healed: `meta_state_refresh_file_index({path:"tools/learning-loop-mastra/interface/contract.js", reason:"normalize step ships; contract.js unchanged but workflow healed"})` — only if drift is flagged. Default: skip (contract.js is unchanged, so no drift is expected).

## Success Criteria

- [ ] Finding `meta-260720T1451Z-…` is `resolved` (verified via `meta_state_list`).
- [ ] A change-log entry records the `skills:normalize` capability + sync self-heal, with `evidence_code_ref` pointing at the script.
- [ ] The post-`npx` recovery workflow is documented in the appropriate user-facing doc; no hand-edit guidance remains.
- [ ] Parent plan's Phase 3 status note was NOT edited (Q4 honored).
- [ ] PR body (when shipped) enumerates the meta-state deltas per `rule-pr-body-registry-deltas`: the resolved finding by id + resolution note, and the new change-log by id + initial status.

## Risk Assessment

- **Doc owner ambiguity** → subsection added to the wrong place. Mitigation: read candidates first; pick the one already documenting `pnpm skills:sync`; if none, `CLAUDE.md` quick-reference is the fallback (it already mentions `pnpm skills:sync`).
- **Premature resolve.** Resolving the finding before Phase 2 tests are green would lose the audit trail. Mitigation: this phase runs only after Phase 2 success criteria are met (dependency [2]).
- **Editing the parent status note by accident.** Mitigation: Q4 is explicit; the change-log is the record; the parent note is read-only context here.