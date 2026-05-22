---
phase: 2
title: "Surface Inference & Product Code Gating"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Surface Inference & Product Code Gating

## Overview

Add surface inference to the write gate. When new files are written under `product/**`, the gate infers the surface from the path, checks whether decision records exist for that surface, and enforces accordingly. Start in **warn** mode; graduate to **escalate** after validation. This phase also hardens the path convention support for the pending surface-restructure plan.

## Requirements

- **Functional**: Path-to-surface mapping for `product/**`, `records/*/evidence/**`, `docs/journals/**`. Gate checks `records/<surface>/decisions/` (or flat fallback) for active decision records. Warn mode emits JSON warning; escalate mode blocks.
- **Non-functional**: Mapping must be maintainable. Hardcode initially; config-driven after 3+ builds validate correctness.

## Architecture

```
Surface Inference Map (hardcoded v1)
  product/api/*        → surface: "product"
  product/web/*        → surface: "product"
  product/*/           → surface: derived from first segment after product/
  records/vnstock/*    → surface: "vnstock"
  records/meta/*       → surface: "meta"
  records/<surface>/*  → surface: <surface> (surface-first convention)
  docs/journals/*      → surface: null (suggest auto-draft, never block)

Decision Record Check
  Input: surface string
  Try: records/<surface>/decisions/*.yaml
  Fallback: records/decisions/*<surface>*.yaml
  Returns: { hasDecision: boolean, count: number }
```

## Related Code Files

- **Modify**: `.claude/coordination/hooks/write-coordination-gate.cjs` — add product/** and journal branches
- **Modify**: `.claude/coordination/hooks/lib/gate-utils.cjs` — add `inferSurface()`, `hasDecisionRecords()` exports
- **Create**: `.claude/coordination/hooks/surface-inference.test.js` — TDD test suite
- **Create**: `.claude/coordination/hooks/lib/surface-map.json` — initial hardcoded mapping (optional; can be inline)

## Implementation Steps

1. **Write tests first** (`surface-inference.test.js`):
   - Test: `product/api/src/main.py` → surface "product", decision exists → allowed
   - Test: `product/web/src/routes.ts` → surface "product", no decision → warn
   - Test: `product/api/...` + escalate mode + no decision → blocked
   - Test: `records/vnstock/evidence/runtime.md` → surface "vnstock", decision exists → allowed
   - Test: `docs/journals/session-2026-05-22.md` → no check, allowed
   - Test: unknown path `product/unknown/stack.py` → surface "unknown", no decision records found → warn
   - Test: surface-first path `records/product/decisions/*.yaml` found → allowed
   - Test: flat fallback `records/decisions/*product*.yaml` found → allowed
   - Test: multi-segment product path `product/api/capabilities/vnstock-data/capability.py` → surface "product"

2. **Add surface inference to `gate-utils.cjs`**:
   - `inferSurface(filePath: string): string | null`
     - `product/<segment>/**` → return `<segment>` as surface (or "product" for api/web)
     - `records/<segment>/**` → return `<segment>` as surface
     - `docs/journals/**` → return null (no enforcement)
     - Other paths → return null
   - `hasDecisionRecords(surface: string | null, recordsDir: string): boolean`
     - If surface is null → return true (no check needed)
     - Try `records/<surface>/decisions/*.yaml`
     - Fallback `records/decisions/*<surface>*.yaml`
     - Return true if any YAML files exist

3. **Modify `write-coordination-gate.cjs`**:
   - After the plan content scanning block (from phase 1), add:
   - If `globMatch('product/**', relPath)`:
     - `inferSurface(relPath)` → surface
     - `hasDecisionRecords(surface)`
     - If no decision and mode === 'warn' → allow, emit warning JSON with surface name
     - If no decision and mode === 'escalate' → block, list missing surface
   - If `globMatch('docs/journals/**', relPath)`:
     - Allow unconditionally
     - Emit suggestion JSON: "Consider drafting records/<surface>/experiments/ YAML from this journal"
     - (Suggestion only — never block journal writes)

4. **Add `GATE_RESPONSE_MODE` wiring**:
   - Read env var at top of main()
   - Validate: only 'warn' or 'escalate' accepted; invalid → default 'warn'
   - Pass mode through to all staged response calls

5. **Run tests**: `node surface-inference.test.js`

## Success Criteria

- [ ] All 9 test cases pass
- [ ] `product/api/*` correctly infers surface and checks decisions
- [ ] `product/web/*` correctly infers surface and checks decisions
- [ ] Unknown `product/*` segments still infer surface and check
- [ ] `records/<surface>/*` paths infer surface from first segment
- [ ] `docs/journals/**` allowed unconditionally with suggestion emission
- [ ] Surface-first paths checked first, flat fallback second
- [ ] Warn mode allows writes with JSON warning
- [ ] Escalate mode blocks writes with reason

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Surface inference is wrong for new path patterns | Hardcode known patterns; unknown → warn mode (never block without validation) |
| Surface-restructure plan changes records layout | Dual path support (surface-first + flat); phase 6 validates after restructure |
| Decision record file existence ≠ valid decision | Phase 1 of any build already validates records; existence check is sufficient for gate |
| Journal suggestion spam | Emit once per session; suppress duplicate suggestions for same journal |
