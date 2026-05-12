---
phase: 2
title: "Doc Updates"
status: pending
priority: P2
effort: "15m"
dependencies: ["1"]
---

# Phase 2: Doc Updates

## Context Links

- Brainstorm: `plans/reports/brainstorm-260512-1310-artifact-timestamp-unification.md`
- Meta-decision from Phase 1
- Meta-evidence self-improvement doc: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`
- Operator guide: `docs/operator-guide.md`

## Overview

Update two documents to codify the new convention.

## Requirements

### Meta-evidence self-improvement doc

Update the filename examples:
- `records/risks/risk-<date>-loop-<slug>.yaml` → `records/risks/risk-YYMMDDTmmZ-<slug>.yaml`
- `records/decisions/decision-<date>-loop-<slug>.yaml` → `records/decisions/decision-YYMMDDTmmZ-<slug>.yaml`

### Operator guide

Add a "Record Naming Conventions" section with:
- Timestamp format spec: `YYMMDDTmmZ`
- Table mapping artifact type → filename pattern → timestamped?
- Note about prospective application
- Note about `id` matching filename stem

## Related Code Files

- Modify: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`
- Modify: `docs/operator-guide.md`

## Implementation Steps

1. Read current meta-evidence-self-improvement.md and operator-guide.md.
2. Update filename examples in meta-evidence doc.
3. Insert "Record Naming Conventions" section in operator-guide (find an appropriate location, likely near the top after repo lanes or near the validation section).
4. Keep edits minimal — no rewriting of unrelated sections.

## Success Criteria

- [ ] Meta-evidence doc filename examples use `YYMMDDTmmZ`
- [ ] Operator-guide has a "Record Naming Conventions" section with the convention table
- [ ] No unrelated sections modified

## Risk Assessment

- **Risk:** Operator-guide is a large file; insertion point may affect readability.
  **Mitigation:** Place the new section after "Repo Lanes" where directory structure is already discussed.
