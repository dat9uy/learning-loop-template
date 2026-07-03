---
phase: 1
title: "Archive stale docs + light-touch keeps"
status: pending
effort: "0.5d"
priority: P2
dependencies: []
---

# Phase 1: Archive stale docs + light-touch keeps

## Overview
Move stale/superseded/substrate docs into `docs/_archive-260703/` (forensic, not deleted) and apply path-fix touch-ups to the clean docs that stay. Pure mechanical `git mv` + small edits; no new content. Sets the clean slate the later phases write into.

## Requirements
- Functional: every stale/pre-reframe doc moves to `docs/_archive-260703/`; clean keep-docs stay; the 2 structural tests (`agents-section-1-layers.test.js`, `agents-md-layer-locations.test.js`) still pass (AGENTS.md untouched this phase).
- Non-functional: no content rewrite — only moves + ≤1-line path fixes.

## Architecture
`docs/_archive-260703/` is a forensic archive (kept in git, never edited). Substrate docs archive under `_archive-260703/substrate/`. `docs/journals/` stays in place (forensic, no migration). AGENTS.md is NOT touched until Phase 5.

## Related Code Files
- Move (git mv): `docs/{charter,record-system-architecture,artifact-concepts,problem-classification,operator-guide,operator-guide-vnstock-appendix,mcp-server-restart-protocol,project-changelog,trajectory.old.260612-1300}.md`, `docs/operator-notes/`, `docs/agents/mastra-code.md` → `docs/_archive-260703/`
- Move (git mv): `docs/vendor-vnstock-installer.md` → `docs/_archive-260703/substrate/`
- Edit (1 path ref each): `docs/meta-state-lifecycle.md` (`learning-loop-mcp` → `learning-loop-mastra`), `docs/mcp-tool-schema-architecture.md` (3 path refs in the flow diagram)
- Rename (git mv): `docs/red-team-review.md` → `docs/review-discipline.md`
- Keep untouched: `docs/philosophy.md`, `docs/trajectory.md`, `docs/security/plan-5-hardening.md`, `docs/journals/`, `tools/learning-loop-mastra/docs/{placement,schemas,legacy-pins}.md`

## Implementation Steps
1. `mkdir -p docs/_archive-260703/substrate` and `git mv` the 10 stale docs + `operator-notes/` + `agents/mastra-code.md` into `docs/_archive-260703/`. AGENTS stays live until Phase 5.
2. `git mv docs/vendor-vnstock-installer.md docs/_archive-260703/substrate/`.
3. `git mv docs/red-team-review.md docs/review-discipline.md`.
4. **Grounding-preservation patch (CRITICAL — before the move breaks it):** `mcp-server-restart-protocol.md` is cited as `evidence_code_ref` by a meta-state entry tracked by `plans/260626-1535-phase-e-stale-sweep-fix`. After step 1 moves it, find the citing entry (`meta_state_list` filtered, or `grep docs/mcp-server-restart-protocol.md meta-state.jsonl`), then `meta_state_patch` its `evidence_code_ref` → `docs/_archive-260703/mcp-server-restart-protocol.md` and `meta_state_refresh_file_index` that path so grounding survives. (If `mcp-server-restart-protocol.md` is the only blocker, archive it last, after the patch.)
5. Edit `docs/meta-state-lifecycle.md`: replace the 1 `learning-loop-mcp` path ref with `learning-loop-mastra`.
6. Edit `docs/mcp-tool-schema-architecture.md`: fix the 3 `tools/learning-loop-mcp/` path refs in the flow diagram → `tools/learning-loop-mastra/`.
7. **Update `external-refs-updated.test.js` SEARCH_PATHS** (`tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js` lines ~35-38): it lists `docs/mcp-server-restart-protocol.md`, `docs/operator-notes/`, `docs/project-changelog.md` — all archived in step 1. After the move, `grep` on those paths silently returns nothing → the test passes without checking. Remove the 3 archived paths from SEARCH_PATHS and add their archived counterparts (`docs/_archive-260703/...`) so the forbidden-shell-path invariant still covers them.
8. Add a one-line `<!-- level -->` tag header to `meta-state-lifecycle.md` (L1) and `review-discipline.md` (L1); read-check `philosophy.md`/`trajectory.md` for stray stale path/word — fix only if present, else leave.

## Success Criteria
- [ ] `docs/_archive-260703/` contains the 10 stale docs + operator-notes + mastra-code + substrate/vnstock-installer.
- [ ] `docs/red-team-review.md` no longer exists; `docs/review-discipline.md` does.
- [ ] The meta-state entry citing `mcp-server-restart-protocol.md` is patched to the archived path + re-grounded (grounding check passes against the new path).
- [ ] `external-refs-updated.test.js` SEARCH_PATHS updated to cover archived counterparts; test still asserts the forbidden-shell-path invariant.
- [ ] `grep -rn "learning-loop-mcp" docs/meta-state-lifecycle.md docs/mcp-tool-schema-architecture.md` returns 0 hits.
- [ ] `pnpm test` passes (Phase 1 touches no test-pinned content; baseline preserved).

## Risk Assessment
- **Risk:** archiving a doc still referenced by a live plan/test breaks a link. **Mitigation:** references from `plans/` to archived docs are historical (forensic) and acceptable; live references are repointed in Phase 5. Verify with `grep -rn "docs/charter\|docs/operator-guide\|docs/record-system" tools/ docs/ AGENTS.md` after the move — only historical/plan refs should remain.
- **Risk:** `review-discipline.md` rename breaks refs. **Mitigation:** `grep -rn "red-team-review"` finds refs; update them (mostly historical plans).