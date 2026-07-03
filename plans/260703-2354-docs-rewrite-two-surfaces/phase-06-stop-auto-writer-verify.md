---
phase: 6
title: "Stop auto-writer + verify"
status: pending
effort: "0.5d"
priority: P2
dependencies: [5]
---

# Phase 6: Stop auto-writer + verify

## Overview
Stop the `registry-summary.md` auto-writer (the `loop_describe` summary tier + `meta_state_list` cover the same surface), drop the last `registry-summary.md`, and run the full verification suite: all 10 test namespaces, the 2 structural tests, the interface validator across 3 runtimes, and the abstraction-level discipline greps.

## Requirements
- Functional: `meta_state_sweep` no longer writes `docs/registry-summary.md`; the sweep test updated; `docs/registry-summary.md` archived. Full verification passes.
- Non-functional: no behavior change to sweep semantics — only the file-write removed.

## Architecture
`tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js` (~line 47) writes `docs/registry-summary.md`. Remove that write. The sweep's other outputs (dry-run proposals, gate-log) are unaffected. Archive the last generated `docs/registry-summary.md` to `_archive-260703/`.

## Related Code Files
- Edit: `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js` (remove the `docs/registry-summary.md` write)
- Edit: the sweep test that asserts the file-write (find via `grep -rn "registry-summary" tools/learning-loop-mastra/__tests__/` — update or remove the assertion)
- Move: `docs/registry-summary.md` → `docs/_archive-260703/`

## Implementation Steps
1. `grep -rn "registry-summary\|registry_summary" tools/learning-loop-mastra/` to find the writer + the test dependency.
2. Remove the `docs/registry-summary.md` write from `meta-state-sweep-tool.js`.
3. **Update the sweep test (`meta-state-sweep-summary.test.js`) carefully — it has 3 tests:** Test 1 + Test 3 reference `registry-summary.md` (the file) and must be updated/dropped. **Test 2 uses `registry_summary` (underscore) and asserts the `loop_describe` warm-tier field — it must NOT be touched** (it stays green independently; the warm-tier `registry_summary` is built by `loop-introspect.js`, unaffected by removing the file write).
4. `git mv docs/registry-summary.md docs/_archive-260703/` (if it exists).
5. Run `pnpm test` (all 10 namespaces).
6. Run `node tools/learning-loop-mastra/interface/contract.js claude-code` + `factory` + `mastra-code` — all pass.
7. Abstraction greps:
   - `grep -rn "learning-loop-mcp" docs/ AGENTS.md README.md CLAUDE.md` → 0 hits in new docs (archive may retain).
   - `grep -niE "mastra|createTool|tools/" docs/loop-engine.md` → 0 hits (L1 clean).
   - `grep -rn "AGENTS.md §2\|§5\|§9\|§12\|line 215\|Inbound State Gate" tools/ README.md CLAUDE.md interface/` → 0 hits.
8. Confirm each new doc has its `<!-- level | surface -->` tag.
9. Set active-plan marker + update the master tracker (`meta_state_log_change` with the doc-rewrite change-log).

## Success Criteria
- [ ] `meta_state_sweep` dry-run no longer writes `docs/registry-summary.md` (assert in test).
- [ ] `pnpm test` — all 10 namespaces pass; 2 structural tests green; sweep test green.
- [ ] `node interface/contract.js {claude-code,factory,mastra-code}` passes all 3.
- [ ] Abstraction greps all return 0 hits in new docs.
- [ ] Every new/rewritten doc has its level tag.
- [ ] `meta_state_log_change` filed: `change_target: 'docs/'` + `change_target: 'AGENTS.md'` + `change_target: 'tools/learning-loop-mastra/interface/'`, summarizing the two-surface rewrite + interface reframe.

## Risk Assessment
- **Risk:** removing the registry-summary writer breaks a consumer. **Mitigation:** `grep` confirms the only consumers are the sweep test + the (now-archived) doc; `loop_describe({tier:"summary"})` + `meta_state_list` are the live equivalents. If a plan/journal cites `docs/registry-summary.md`, those are historical.
- **Risk:** a test pins an archived doc path. **Mitigation:** `grep -rn "docs/charter\|docs/operator-guide\|docs/record-system\|docs/red-team-review" tools/learning-loop-mastra/__tests__/` after Phases 1+5; update any live test assertion.