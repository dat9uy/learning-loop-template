---
phase: 2
title: "SkillMdUpdates"
status: pending
priority: P2
dependencies: [1]
effort: "30min"
---

# Phase 2: SKILL.md updates (E.0 — doc-drift closeout)

## Overview

Update both `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md` to (a) reference the current 44-tool manifest + 6 groups + the new 3-layer architecture + the interface contract, and (b) reference the required tool names (`loop_describe`, `meta_state_list`) so the validator's Requirement #3 passes for both runtimes. Both files are byte-identical today (verified); they receive the same edit. Test #4 (`skill-md-references-tools.test.js`) from Phase 1 turns green after this phase.

**Source:** `plans/reports/plan-2-research-test-skill-onboarding-260625-1618-report.md` §B (SKILL.md update design) + scope report line 118 (E.0 description).

## Requirements

- **Functional:** both SKILL.md files reference `loop_describe` AND `meta_state_list` (validator Requirement #3); both reference `tools/learning-loop-mastra/interface/CONTRACT.md` + the validator invocation; both reference `agent-manifest.json` (the 44-tool manifest); both reference `AGENTS.md` §1.1 (the 3-layer architecture); both reference `tools/learning-loop-mastra/docs/schemas.md` (the schema doc from Plan 1).
- **Non-functional:** total file size remains under 200 LoC after the update; the file remains loadable as a Claude Code / Droid CLI skill (YAML frontmatter intact, section structure preserved).

## Architecture

The SKILL.md is loaded by AI agents (not humans) when the skill is invoked. The update strategy is **reference, don't restate**: the file points to the canonical docs (agent-manifest.json, AGENTS.md §1.1, schemas.md, interface/CONTRACT.md) rather than duplicating their content. This keeps the file small (~111 LoC after, up from 98 LoC) and ensures the canonical docs remain the source of truth.

**Two changes per file:**
1. **New "Runtime contract" section** (~8 LoC) inserted between `## Workflow` and `## Prompt Requirements`. Signals to the AI agent that this skill is Requirement #3 of the runtime interface contract.
2. **Rewritten `## References` section** (~14 LoC, replacing the broken 9-line legacy references). Groups references into 3 buckets: Tool manifest, 3-layer architecture, Runtime interface contract.

**Both files get identical edits.** The current state is byte-identical (verified); the future state is also byte-identical. The scope report recommends "Update both SKILL.md files to reference the current 44-tool manifest + 6 groups + the new 3-layer architecture + the interface contract" — keeping them identical is the simplest implementation.

## Related Code Files

- Modify: `.claude/skills/learning-loop/SKILL.md` (98 LoC → ~111 LoC; +13 LoC net)
- Modify: `.factory/skills/learning-loop/SKILL.md` (98 LoC → ~111 LoC; +13 LoC net)

## Implementation Steps

### Step 1: Add the "Runtime contract" section.

Insert between `## Workflow` (ends at line 62 in current file) and `## Prompt Requirements` (starts at line 65):

```markdown
## Runtime contract

This skill is Requirement #3 (skill spec) of the runtime interface contract. The runtime that loads it must also satisfy Requirements #1 (hook shims), #2 (MCP client config), #4 (identity marker), and #5 (settings integration). To audit: run `node tools/learning-loop-mastra/interface/contract.js <runtime-id>`. See `tools/learning-loop-mastra/interface/CONTRACT.md`.
```

### Step 2: Replace the broken `## References` section.

Current (lines 89-97) points to 7 broken legacy paths (`tools/learning-loop-mastra/tools/legacy/references/*`). These paths do not exist (verified: `ls tools/learning-loop-mastra/tools/legacy/references/` returns ENOENT). Replace with:

```markdown
## References

### Tool manifest
- `tools/learning-loop-mastra/agent-manifest.json` — current 44-tool manifest, 6 groups (gate, workflow, meta_state, introspection, runtime_agnostic, agent). Call `mastra_loop_describe({tier: "warm"})` to discover the surface at session start.

### 3-layer architecture
- `AGENTS.md` §1.1 — Core / Mastra shell / Runtime interface (the contract you satisfy by being loaded as this skill).
- `tools/learning-loop-mastra/core/README.md` — FCIS invariant: zero `@mastra/*` imports in core.
- `tools/learning-loop-mastra/docs/schemas.md` — meta-state 4-kind schema, wire envelope, parity contract.

### Runtime interface contract (Phase E.1b)
- `tools/learning-loop-mastra/interface/CONTRACT.md` — the 5 requirements a runtime MUST satisfy (hook shims, MCP config, this skill, identity marker, settings).
- `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` — how to onboard a new runtime (worked example: Mastra Code).
- `node tools/learning-loop-mastra/interface/contract.js <runtime-id>` — validate a runtime against the contract. Returns `{ok, missing[], notes[], path_map}`.
```

### Step 3: Verify the tool-references test turns green.

```bash
node --test tools/learning-loop-mastra/__tests__/interface/skill-md-references-tools.test.js
```

Expected: 4 subtests pass (both files × 2 assertions: contains `loop_describe`; contains `meta_state_list`).

If the test still fails: confirm both files contain the tool names (the references section mentions `mastra_loop_describe` but the test checks for the shorter `loop_describe` substring; the substring is present in `mastra_loop_describe`, so the assertion passes).

### Step 4: Verify the contract-reference test passes.

The same test also asserts both files contain `interface/CONTRACT.md`. This is satisfied by the new "Runtime contract" section (which references `tools/learning-loop-mastra/interface/CONTRACT.md`). The substring `interface/CONTRACT.md` is present.

### Step 5: Verify the byte-equality invariant.

```bash
diff .claude/skills/learning-loop/SKILL.md .factory/skills/learning-loop/SKILL.md
```

Expected: no output (the two files are identical). If they diverge, the update was applied to only one file — re-apply.

### Step 6: Verify the file size.

```bash
wc -l .claude/skills/learning-loop/SKILL.md .factory/skills/learning-loop/SKILL.md
```

Expected: ~111 LoC per file (98 + 13 net). If the file exceeds 200 LoC, the references section was duplicated or over-extended.

## Success Criteria

- [ ] Both SKILL.md files contain `loop_describe` and `meta_state_list`
- [ ] Both SKILL.md files reference `tools/learning-loop-mastra/interface/CONTRACT.md`
- [ ] Both SKILL.md files are byte-identical (`diff` returns no output)
- [ ] Both SKILL.md files are ≤ 200 LoC after the update
- [ ] Test #4 (`skill-md-references-tools.test.js`) passes
- [ ] The broken `tools/learning-loop-mastra/tools/legacy/references/*` paths are removed
- [ ] The "Runtime contract" section is present in both files

## Risk Assessment

- **R1 (Tool-name substring collision):** the references section mentions `mastra_loop_describe` (the MCP tool name with the `mastra_` prefix). The test checks for the substring `loop_describe`, which is present in `mastra_loop_describe`. Mitigation: the test uses substring matching; the assertion passes as long as the tool name appears anywhere in the file.
- **R1a (Red-team Finding A4 — substring match is accidental):** the canonical tool name in `agent-manifest.json` is `mastra_loop_describe` (with `mastra_` prefix). The substring `loop_describe` happens to match. If a future hardening plan tightens the test to a word-boundary regex (`/\bloop_describe\b/`), the SKILL.md update would break because the canonical name is `mastra_loop_describe`. Mitigation: Phase 4's `contract.test.js` is the canonical gate — tighten it in a follow-up. For Plan 2, the substring match is acceptable.
- **R2 (Byte-equality drift):** if only one file is updated, `diff` will show differences. Mitigation: Step 5 verifies byte equality; if they diverge, re-apply the edit to the missing file.
- **R3 (File size creep):** if the references section includes too much detail, the file may exceed 200 LoC. Mitigation: the references section references docs by path; it does not restate content. Step 6 verifies size.
- **R4 (YAML frontmatter damage):** editing the file may corrupt the frontmatter (`---\nname: learning-loop\n...`). Mitigation: use Edit (replace specific sections), not Write (full rewrite); verify frontmatter after the edit with `head -5 .claude/skills/learning-loop/SKILL.md`.

## Test Output Reference (expected green state, post-Phase 2)

```text
$ node --test tools/learning-loop-mastra/__tests__/interface/skill-md-references-tools.test.js
# Subtest: .claude/skills/learning-loop/SKILL.md references loop_describe
ok 1 - .claude/skills/learning-loop/SKILL.md references loop_describe
# Subtest: .claude/skills/learning-loop/SKILL.md references meta_state_list
ok 2 - .claude/skills/learning-loop/SKILL.md references meta_state_list
# Subtest: .factory/skills/learning-loop/SKILL.md references loop_describe
ok 3 - .factory/skills/learning-loop/SKILL.md references loop_describe
# Subtest: .factory/skills/learning-loop/SKILL.md references meta_state_list
ok 4 - .factory/skills/learning-loop/SKILL.md references meta_state_list
# Subtest: both SKILL.md files reference the interface contract
ok 5 - both SKILL.md files reference the interface contract
1..5
# pass 5/5
```