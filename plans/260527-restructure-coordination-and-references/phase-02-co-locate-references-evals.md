---
phase: 2
title: "Co-locate References+Evals"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Co-locate References+Evals

## Overview

Move `.claude/skills/learning-loop/references/` and `evals/` into `tools/learning-loop-mcp/references/` and `tools/learning-loop-mcp/evals/`. Both Claude and Droid skills will point to the new shared source, fixing the `.factory` skill's broken relative references.

## Requirements
- Functional: All 10 reference markdown files and `evals.json` move to new location.
- Functional: Both `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md` update their `## References` section to point to new paths.
- Non-functional: No duplication — files live in one place only.

## Architecture

```
BEFORE                              AFTER
.claude/skills/learning-loop/      .claude/skills/learning-loop/
├── SKILL.md                        ├── SKILL.md   ← references updated
├── references/                     └── (no references/)
│   ├── learning-loop-rules.md
│   ├── prompt-blueprints.md
│   ├── prompt-blueprints-state-gated.md
│   ├── prompt-blueprints-product-build.md
│   ├── orchestration-patterns.md
│   ├── context-retrieval-patterns.md
│   ├── resource-budget-rules.md
│   ├── meta-evidence-self-improvement.md
│   ├── agent-anti-confusion-checklist.md
│   └── plan-phase-0-template.md
└── evals/
    └── evals.json

                                    tools/learning-loop-mcp/
                                    ├── ...
                                    ├── references/          ← NEW
                                    │   ├── learning-loop-rules.md
                                    │   ├── prompt-blueprints.md
                                    │   ├── prompt-blueprints-state-gated.md
                                    │   ├── prompt-blueprints-product-build.md
                                    │   ├── orchestration-patterns.md
                                    │   ├── context-retrieval-patterns.md
                                    │   ├── resource-budget-rules.md
                                    │   ├── meta-evidence-self-improvement.md
                                    │   ├── agent-anti-confusion-checklist.md
                                    │   └── plan-phase-0-template.md
                                    └── evals/             ← NEW
                                        └── evals.json
```

## Related Code Files
- Create: `tools/learning-loop-mcp/references/` (git mv from `.claude/skills/learning-loop/references/`)
- Create: `tools/learning-loop-mcp/evals/` (git mv from `.claude/skills/learning-loop/evals/`)
- Modify: `.claude/skills/learning-loop/SKILL.md` — update `## References` section
- Modify: `.factory/skills/learning-loop/SKILL.md` — update `## References` section
- Modify: `tools/learning-loop-mcp/tools/workflow-generate-prompt-tool.js` — update `BLUEPRINTS` map paths (was `.claude/skills/learning-loop/references/`)
- Delete: `.claude/skills/learning-loop/references/` (moved)
- Delete: `.claude/skills/learning-loop/evals/` (moved)

## Implementation Steps

1. **Git-move references**
   - `git mv .claude/skills/learning-loop/references tools/learning-loop-mcp/references`
   - `git mv .claude/skills/learning-loop/evals tools/learning-loop-mcp/evals`

2. **Update `.claude/skills/learning-loop/SKILL.md`**
   - Replace the `## References` section:
   ```markdown
   ## References

   - `tools/learning-loop-mcp/references/learning-loop-rules.md` — condensed repo rules.
   - `tools/learning-loop-mcp/references/resource-budget-rules.md` — hard constraints for external systems with irreversible state.
   - `tools/learning-loop-mcp/references/prompt-blueprints.md` — reusable prompt skeletons.
   - `tools/learning-loop-mcp/references/prompt-blueprints-state-gated.md` — state-gated prompt templates for budget-constrained tasks.
   - `tools/learning-loop-mcp/references/prompt-blueprints-product-build.md` — product-build prompt skeletons.
   - `tools/learning-loop-mcp/references/meta-evidence-self-improvement.md` — self-improvement and meta evidence rules.
   - `tools/learning-loop-mcp/references/orchestration-patterns.md` — full-lifecycle experiment orchestration, claim update, and promotion rules.
   - `tools/learning-loop-mcp/evals/evals.json` — skill eval cases.
   ```

3. **Update `.factory/skills/learning-loop/SKILL.md`**
   - Replace its `## References` section with the exact same content as `.claude/skills/learning-loop/SKILL.md`.
   - Note: `.factory` skill currently has the same references listed at `references/...` (relative to its own tree, which doesn't exist). After this change, both skills use absolute repo-root-relative paths.

4. **Update `tools/learning-loop-mcp/tools/workflow-generate-prompt-tool.js`**
   - Change `BLUEPRINTS` map values from `.claude/skills/learning-loop/references/*.md` to `tools/learning-loop-mcp/references/*.md`:
     - `evidence: "tools/learning-loop-mcp/references/prompt-blueprints.md"`
     - `"state-gated": "tools/learning-loop-mcp/references/prompt-blueprints-state-gated.md"`
     - `"product-build": "tools/learning-loop-mcp/references/prompt-blueprints-product-build.md"`
     - `experiment: "tools/learning-loop-mcp/references/prompt-blueprints.md"`
     - `"runtime-validation": "tools/learning-loop-mcp/references/prompt-blueprints.md"`

## Success Criteria
- [x] `ls tools/learning-loop-mcp/references/` shows 10 markdown files
- [x] `ls tools/learning-loop-mcp/evals/` shows `evals.json`
- [x] `.claude/skills/learning-loop/SKILL.md` references `tools/learning-loop-mcp/references/`
- [x] `.factory/skills/learning-loop/SKILL.md` references `tools/learning-loop-mcp/references/`
- [x] `rg "references/learning-loop" .claude/skills/learning-loop/SKILL.md` returns zero (old relative path gone)
- [x] `rg "references/learning-loop" .factory/skills/learning-loop/SKILL.md` returns zero (old relative path gone)

## Risk Assessment
- **Risk:** Any MCP workflow tool that reads reference files by hardcoded path. Scout for `readFileSync` calls that reference `.claude/skills/learning-loop/references/`. Update those paths.
- **Mitigation:** `rg "\.claude/skills/learning-loop/references" tools/` to find any hardcoded readers.
