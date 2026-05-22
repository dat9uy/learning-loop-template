---
phase: 2
title: "Pre-Check Script and Docs"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Pre-Check Script and Docs

## Overview

Create `tools/check-loop-ready.js` so agents can verify loop readiness before invoking implementation skills. Update `CLAUDE.md` to document both use-case workflows.

## Requirements

- **Functional:**
  - Script accepts a surface name as argument
  - Checks `records/<surface>/decisions/*.yaml` exists (surface-first)
  - Falls back to `records/decisions/*<surface>*.yaml` (flat)
  - Optionally checks `records/<surface>/experiments/` for prior attempts
  - Exits 0 if ready, exits 1 with helpful message if not
- **Non-functional:**
  - Script runs in < 100ms
  - No external dependencies beyond node built-ins

## Related Code Files

- **Create:** `tools/check-loop-ready.js`
- **Modify:** `/home/datguy/codingProjects/learning-loop-template/CLAUDE.md`

## Implementation Steps

1. **Create `tools/check-loop-ready.js`**
   - Parse CLI argument for surface name
   - Find project root (walk up until `records/` found)
   - Check `records/<surface>/decisions/` for `.yaml`/`.yml` files
   - Fallback: check `records/decisions/` for `*<surface>*.yaml`
   - If missing, print: `Surface "<surface>" not loop-ready. Missing: records/<surface>/decisions/*.yaml`
   - Optionally list files in `records/<surface>/experiments/` as hints
   - Exit 0 if ready, 1 if not

2. **Add pnpm script (optional)**
   - In `package.json`, add: `"check:loop-ready": "node tools/check-loop-ready.js"`

3. **Update `CLAUDE.md`**
   - Add section: `## Implementation Workflows`
   - Document Use Case A (direct cook):
     ```
     1. Run: node tools/check-loop-ready.js <surface>
     2. If ready: /ck:cook evidence.md
     3. If not: create decision records first
     ```
   - Document Use Case B (plan then cook):
     ```
     1. /ck:plan (produces plan.md with Phase 0)
     2. Gate validates at plan-write time
     3. /ck:cook plan.md
     ```
   - Add explicit rule: "Never ignore gate block decisions. If blocked, create missing artifacts and retry."

## Success Criteria

- [x] `node tools/check-loop-ready.js product` exits 0 when `records/product/decisions/` has YAML files
- [x] Same command exits 1 with helpful message when decisions missing
- [x] `CLAUDE.md` contains both use-case workflows
- [x] Script has no external dependencies
