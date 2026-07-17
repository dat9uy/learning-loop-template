---
phase: 5
title: "Record finding, regression, ship prep"
status: todo
priority: P2
effort: "2h"
dependencies: [2, 3, 4]
---

# Phase 5: Record finding, regression, ship prep

## Overview

Record the **schema-shape root cause** as a meta-state finding (the prior `meta-260717T1026Z` captured
only the silent-success *symptom* and is already `superseded`), run full regression, and prep the
PR-body registry deltas. No new code beyond the finding record.

## Requirements

- Functional: a new meta-state finding documents the root cause (union-of-partials → `{}` safe
  emission; runtime rejection does not steer; parity seam + minProperties + localized errors are the
  fix) and `reopens` the prior finding. Full patch + parity suite green. PR body enumerates the
  registry delta.
- Non-functional: follow the loop's own citation rules (`local:meta-state:<id>`, `evidence_code_ref`
  at the parity seam). Run `meta_state_relationship_validate` before reporting (lint rule).

## Architecture

The finding is the loop's self-model capturing what the prior finding missed: the *cause* layer
(schema shape), not the *symptom* layer (silent success). It `reopens` the superseded prior finding so
the lineage is explicit. Record only after the code fix lands so the finding can cite the landed
evidence.

## Related Code Files

- Mutate (via MCP, not file I/O): `meta-state.jsonl` — new finding via `meta_state_report`.
- Read: `tools/learning-loop-mastra/mastra/create-loop-tool.js` (cite as `evidence_code_ref` — the
  parity seam is the root-cause location and the fix's injection point).
- Run: `pnpm test:one …mcp-tools-list-parity.test.js`, `pnpm test:one …meta-state-patch-tool.test.js`,
  `pnpm test:iter`.

## Implementation Steps

1. **Record finding** — `meta_state_report`:
   - `category: "loop-anti-pattern"` (subtype `schema-induced-emission`), `severity: "warning"`,
     `affected_system: "meta-state-tools"`.
   - `description`: the root cause (verified table: `{}` satisfies all 4 union branches; `.refine`
     dropped by `toJSONSchema`; runtime rejection did not steer the model — 5× `patch:{}` in
     `e10944c4` post-fix), the fix (parity-seam `minProperties:1` steering + per-branch localized
     errors + content-aware hint), the sibling fix (`meta_state_batch` update op no-content
     rejection + localized inline-field errors — runtime floor, no contract change), and the open
     harness-behavior hypothesis.
   - `evidence_code_ref: "tools/learning-loop-mastra/mastra/create-loop-tool.js"` (the parity seam).
   - `reopens: ["meta-260717T1026Z-meta-state-patch-returns-patched-true-version-n-on-an-empty"]`.
   - **First** run `meta_state_relationship_validate({ description, entry_id? })` to lint orphan refs.
2. **Regression** — `pnpm test:one …/mcp-tools-list-parity.test.js`; `pnpm test:one
   …/legacy-mcp/meta-state-patch-tool.test.js`; then `pnpm test:iter` for the suite. If a
   `file-index.jsonl` drift error surfaces from edits during the loop, run
   `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` once (loop hint #9)
   before re-running.
3. **PR-body registry deltas** (rule-pr-body-registry-deltas): enumerate the new finding by id +
   initial status (`open`). If the new finding formally supersedes the old one (via `meta_state_supersede`
   in a follow-up), list it under *superseded* by id + target — otherwise leave the prior finding as-is
   (it is already `superseded` by a change-log). No sweep/resolved/promoted entries in this PR. The
   `meta_state_batch` no-content fix is shipped in this same PR (Phases 3-4) — note it in the PR body;
   if a separate finding for batch's silent no-content update is warranted, record it here too.
4. **Docs** — check whether the model-visible schema change needs a discoverability note. Likely **no**
   doc change (the `tools/list` shape is runtime-observed, not hand-documented) — keep YAGNI. Only add a
   one-line note to `tools/handlers/references/tool-selection-guide.md` or a loop hint if an existing
   doc explicitly describes the patch shape.

## Success Criteria

- [ ] New finding recorded with `reopens` the prior finding; `meta_state_relationship_validate` passed.
- [ ] `pnpm test:iter` green; no file-index drift.
- [ ] PR body lists the new-finding registry delta (id + initial status `open`).
- [ ] No unnecessary doc churn (YAGNI).

## Risk Assessment

**Risk:** recording the finding before the code lands cites un-landed evidence. **Mitigation:** record
after Phases 2-4 merge; cite `create-loop-tool.js` (the seam) as `evidence_code_ref`, which is stable
regardless of merge order.
**Risk:** `reopens` on an already-`superseded` finding violates a lifecycle rule. **Mitigation:** the
`reopens` field is designed exactly for re-surfacing a stale/superseded finding whose cause was never
addressed; run the relationship lint first and follow its guidance.
