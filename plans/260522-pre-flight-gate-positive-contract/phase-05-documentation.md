---
phase: 4
title: "Documentation"
status: completed
effort: "1h"
dependencies: [2]
---

# Phase 4: Documentation

## Overview

Update all documentation to reflect the preflight gate: CLAUDE.md, hooks README, and new product-build plan template.

## Related Code Files

- Modify: `CLAUDE.md`
- Modify: `.claude/coordination/hooks/README.md`
- Create: `.claude/skills/learning-loop/references/product-build-plan-template.md`

## Implementation Steps

### Step 1: Update CLAUDE.md

**MCP CRUD Tools table** — add row:
```
| `mark_preflight_complete` | Create preflight marker to unlock product/** writes (30min TTL) |
```

**Product Code Writes section** — replace entire section:
```markdown
### Product Code Writes
- Writing to `product/**` requires a valid preflight marker for the inferred surface.
- Surface inference: ALL `product/**` paths → surface `product` (no exception for unknown subpaths).
- **Without marker:** gate blocks with a 6-step preflight checklist in the block JSON.
- **To unlock:** complete the checklist steps, then call `mark_preflight_complete` MCP tool.
- **TTL:** marker expires after 30 minutes. Re-run `mark_preflight_complete` to refresh.
- Missing preflight marker **always blocks** (exit 2) regardless of `GATE_RESPONSE_MODE`.
```

**Agent Rule section** — update:
```markdown
**Never ignore gate block decisions.** If blocked, follow the preflight checklist in the block JSON. Use `mark_preflight_complete` MCP tool after completing the steps. Do not use Bash to circumvent a gate block.
```

**Gate Relationship section** — add new section clarifying the two gate types:
```markdown
### Gate Types for Product-Build Workflows
- **product/** paths: preflight marker gate (block until `mark_preflight_complete` creates marker) — ALL product/** paths infer surface 'product'
- **plans/**/plan.md paths: decision records gate (block until decision records exist)
- Both gates require decision records as an artifact, but they check differently:
  - product/** checks marker existence/TTL
  - plans/**/plan.md checks decision record YAML existence
```

### Step 2: Update hooks README.md

Update product/** row in the rules table to mention preflight marker instead of decision records. Note that `GATE_ROOT` controls marker file location (same as other gate operations) — no new env var needed.

### Step 3: Update createDecisionRecord tool description

**Red team finding:** `create_decision_record` tool description at `tools/constraint-gate/tools/create-decision-record-tool.js:8` currently claims it "unlocks product/**" writes. After preflight gate, decision records alone no longer unlock product/**. Update description to: "Create a decision record for a surface. Required as part of the preflight checklist before product/** writes."

### Step 4: Create product-build-plan-template.md

New reference file at `.claude/skills/learning-loop/references/product-build-plan-template.md`:

Mandatory "Artifact & Gate Considerations" section:
- Surface declaration
- Required decision records (with names)
- Required risk records (with names)
- Evidence plan (which evidence files to produce)
- Preflight step as Phase 0 of implementation

## Success Criteria

- [x] CLAUDE.md updated with `mark_preflight_complete` in MCP table
- [x] Product Code Writes section documents preflight gate, not decision-records check
- [x] Hooks README documents `GATE_ROOT` for marker file location
- [x] No stale references to "decision records gate" for product/** paths
- [x] `create_decision_record` tool description updated (no longer claims it unlocks product/**)
- [x] Gate Types section clarifies product/** vs plans/** gate behavior

## Risk Assessment

Low — documentation only, no code changes.
