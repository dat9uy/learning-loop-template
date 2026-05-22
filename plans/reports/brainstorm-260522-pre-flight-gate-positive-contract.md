# Brainstorm: Pre-Flight Gate — Positive Contract for Product-Build

**Date:** 2026-05-22
**Scope:** Product-build workflow (not meta/tooling)
**Breaking changes:** Allowed

## Problem

3 sessions, 3 plans, 3 journals — same failure: agent builds product code without producing loop artifacts (decisions, risks, evidence). Gates are negative contracts ("you can't write here") but no positive contract exists ("you MUST do these steps, in this order, before proceeding"). The gap is procedural, not mechanical — MCP CRUD tools work, but nothing tells the agent WHEN to use them.

### Evidence

- `experiment-product-macro-cook-no-loop-20260522T055121Z.yaml`: /ck:cook produced 21 endpoints with zero loop artifacts
- Journal `260522-macro-artifact-omission-debug-report.md`: RC1 = verified decisions treated as context not blockers; RC2 = planning skipped
- Journal `260522-cook-loop-compliance-gap-reflection.md`: "gate should trigger when you write the plan, not when you write product code"

### Root Cause

Gates fire AFTER the agent commits to an action. They are tripwires, not guides. The block message says "no" but not "here's what to do instead." Agent reasoning (CLAUDE.md prose) has failed 3 times — the positive contract must be as mechanical as the negative contract.

## Approach Evaluated

| Approach | Description | Verdict |
|----------|-------------|---------|
| A: Pre-Flight Gate | Block message embeds step-by-step checklist; marker file unlocks writes | **Selected** — covers all 4 entry points, mechanical enforcement |
| B: Skill Wrapper | Wrap /ck:cook and /ck:plan to inject artifact steps | Rejected — only covers skill-invoked entry points (2 of 4) |
| C: Plan Template Only | Auto-inject artifact requirements into product-build plans | Adopted as Layer 2 — complements A but insufficient alone |

## Design

### 1. Pre-Flight Gate (Primary Enforcement)

Modify `write-coordination-gate.cjs` product/** block:

- **No marker** → block with JSON containing `preflight_checklist` (6 steps)
- **Valid marker** (< 30min) → allow write (exit 0)
- **Expired marker** → block again with checklist

Block message IS the procedure:

```json
{
  "decision": "block",
  "reason": "No preflight for surface 'product'. Complete preflight checklist first.",
  "preflight_checklist": [
    "1. Call workflow_product_build to decompose the request into assertions/risks",
    "2. Create decision records via create_decision_record MCP tool for surface",
    "3. Create risk records via create_risk_record MCP tool for identified risks",
    "4. Call validate_records to verify all YAML is correct",
    "5. Call mark_preflight_complete with surface name",
    "6. Retry your write — gate will pass if marker is valid"
  ],
  "surface": "product",
  "marker_path": ".claude/coordination/.loop-preflight-product"
}
```

### 2. New MCP Tool: `mark_preflight_complete`

- Input: `{ surface: string }`
- Writes `.claude/coordination/.loop-preflight-<surface>`
- Content: `{ "surface": "product", "completed_at": "2026-05-22T15:30:00Z" }`
- 30-minute TTL enforced by gate on read
- Only this tool can create the marker — no Bash circumvention

### 3. Preflight Marker

- Path: `.claude/coordination/.loop-preflight-<surface>`
- TTL: 30 minutes from `completed_at`
- Gate reads `completed_at`, compares to `Date.now()`, rejects if expired
- Surface-scoped: each surface needs its own marker

### 4. Plan Template (Layer 2)

New: `.claude/skills/learning-loop/references/product-build-plan-template.md`

Mandatory section "Artifact & Gate Considerations":
- Surface declaration
- Required decision records (with names)
- Required risk records (with names)
- Evidence plan (which evidence files to produce)
- Preflight step as Phase 0 of implementation

Auto-injected by `/ck:plan` when plan touches `product/**`.

### 5. Artifact Requirements by Workflow Type

| Workflow | Decisions | Risks | Evidence | Experiments |
|----------|-----------|-------|----------|-------------|
| Product-build | **Required** | **Required** | **Required** | Optional (sandbox/probe only) |
| Meta/tooling | Optional | Optional | Optional | N/A |
| Docs-only | Skip | Skip | Skip | N/A |

**Experiments** are NOT required for product-build. They are for sandbox testing and runtime probes (vnstock install, library smoke tests). Product-build artifacts = decisions + risks + evidence.

### 6. Gate Interaction Matrix

| Trigger | Check | Behavior |
|---------|-------|----------|
| Plan write (`plans/**/plan.md`) | product-build tag + decision records | Existing: block if missing |
| Product code write (`product/**`) | Preflight marker | **New**: block with checklist if missing |
| Both must pass | Sequential | Plan gate catches at plan time, preflight at implementation time |

### 7. Entry Point Coverage

| Entry Point | Covered By |
|-------------|------------|
| /ck:cook direct | Pre-flight gate (block message IS procedure) |
| /ck:plan → /ck:cook | Plan template + Pre-flight gate |
| Agent-driven implementation | Pre-flight gate |
| Manual operator request | Pre-flight gate (or operator ignores block) |

### 8. Implementation Components

1. **`write-coordination-gate.cjs`** — modify product/** block to check preflight marker, emit checklist in block JSON
2. **`mark_preflight_complete` MCP tool** — new tool in constraint-gate server
3. **`product-build-plan-template.md`** — new reference file for plan injection
4. **`gate-utils.cjs`** — add `readPreflightMarker()` and `isPreflightValid()` helpers
5. **Tests** — update `write-coordination-gate-minimal.test.cjs` + add preflight-specific tests
6. **CLAUDE.md** — update to document preflight workflow

### Deferred

- Feature-level vs surface-level gate: surface-level sufficient for v1
- `--fast` flag: no abbreviated preflight — `--fast` skips review, not mechanical blocks
- Marker cleanup: stale markers cleaned up opportunistically on next preflight

## Risks

| Risk | Mitigation |
|------|------------|
| Agent ignores checklist in block message | Checklist is JSON — agent reads structured output; if ignored, gate blocks again |
| 30min TTL too short for large features | Re-run `mark_preflight_complete` to refresh; or operator can set longer TTL |
| Marker bypass via direct file write | Write gate blocks writes to `.claude/coordination/` too; marker only created by MCP tool |
| Checklist too rigid for simple changes | Surface-level, not feature-level — simple changes still need 1 decision + 1 risk minimum |

## Unresolved Questions

None — all critical design decisions resolved.
