# Brainstorm Report: Dimension-Based Claim Verification

## Problem Statement

The current learning-loop claim lifecycle uses a linear state machine:

```
imported-prior → evidence-reviewed → static-verified → install-verified → runtime-verified → product-approved
```

This model has three structural failures:

1. **runtime-verified is overloaded** — it conflates "ran in sandbox" with "ran in production-like environment." The user needs sandbox experiments to count as meaningful verification without making the label meaningless.

2. **Linear progression fights partial verification** — the transition table forces artificial ordering. Skips exist (`evidence-reviewed` → `runtime-verified`) but are inconsistently applied. The real constraint is proof quality, not state history.

3. **evidence-reviewed and imported-prior are fake states** — they represent "has evidence" and "encoded evidence into YAML," neither of which is verification. They clutter the lifecycle without advancing the claim.

## Requirements

- Distinguish sandbox verification from production verification
- Keep the system tight — no unbounded state growth
- Eliminate fake progress states
- Preserve human approval for install/runtime
- Preserve cleanup fail-closed
- Make the loop self-improving (skill refreshes via its own meta-evidence flow)

## Evaluated Approaches

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **A. Expand runtime definition** | Let `runtime-verified` mean "ran anywhere bounded" | Zero schema change | Loses precision; stretches further with each new case |
| **B. Add sandbox-runtime-verified state** | New state between install and runtime | Preserves strictness | State explosion; `sandbox-install-verified` next? |
| **C. Decompose into dimensions** | Replace single state with per-dimension verification flags | Precise, extensible, no transition table | Schema migration; skill refresh; fixture rewrite |
| **D. Hybrid: keep states, add scope** | Add `scope: sandbox \| production` to existing states | Minimal change | `product-approved` doesn't fit; still has fake states |

## Final Recommended Solution: Option C — Dimension-Based Verification

### Core Design

A claim asserts one or more dimensions. Each dimension moves independently from `claimed` → `verified` or `rejected`.

```yaml
claim:
  verification:
    static:
      status: claimed | verified | rejected
      proof_refs: []
    install:
      status: claimed | verified | rejected
      scope: sandbox | production
      proof_refs: []
    runtime:
      status: claimed | verified | rejected
      scope: sandbox | production
      output: metadata-only | sample-output | runtime-captured
      proof_refs: []
    product:
      status: claimed | approved | rejected
      decision_refs: []
  blocked_actions: []
```

### Experiment Side

```yaml
experiment:
  verification:
    claim_refs: []
    proves:
      - dimension: runtime
        scope: sandbox
        output_level: metadata-only
    requires_human_approval: true
    approval_status: approved
```

No `from_state`, no `to_state`, no `assurance_level`. The experiment proves a dimension config.

### What Disappears

| Old | New |
|-----|-----|
| `imported-prior` | Not a claim. Raw evidence stays in `records/evidence/`. |
| `evidence-reviewed` | Not a claim. Editorial `status: reviewed` covers curation. |
| `lifecycle.state` | Replaced by `verification.*.status` per dimension. |
| `lifecycle.state_reason` | Moved to claim `notes` or dimension-level `reason`. |
| `assurance_level` | Replaced by `verification.proves[].dimension`. |
| `verification.from_state` | Gone. No transitions. |
| `verification.to_state` | Gone. |
| `allowedTransitions` map | Gone. |
| Transition validation | Replaced by "does proof match claimed dimension?" |

### What Stays

- `claim.status` (editorial: draft / reviewed / approved / rejected)
- `claim.approval` (editorial reviewer gate)
- Human approval for install/runtime experiments
- Metadata-only default for runtime proofs
- Cleanup fail-closed
- `blocked_actions`
- Decision-based product approval

### Self-Improving Architecture Focus

The learning-loop skill must be the **first artifact refreshed** because it is the interface agents use to interact with the loop. A skill that encodes the old linear model will generate incorrect prompts until updated.

**Skill files to refresh (priority order):**

1. `references/learning-loop-rules.md` — remove lifecycle state list, add dimension rules
2. `references/prompt-blueprints.md` — update prompts to reference dimensions, not states
3. `SKILL.md` — update workflow description and prompt requirements
4. `references/meta-evidence-self-improvement.md` — add dimension-model gap detection

**Self-improvement mechanism:**

When an agent using the skill generates a prompt that:
- References old lifecycle states
- Omits required dimension scope/output
- Conflates sandbox and production verification

The agent should create meta-evidence under `records/evidence/meta/` documenting the gap. Meta-decisions then approve skill updates. This closes the loop: the system validates its own interface.

### Validation Rules (New)

1. Claim must assert at least one dimension.
2. `claimed` → `proof_refs` must be empty.
3. `verified` / `rejected` → `proof_refs` must point to matching experiments.
4. Experiment `proves` must match claim dimension config (dimension + scope + output).
5. Install/runtime experiments require human approval.
6. Product dimension uses `decision_refs`, not experiment proofs.
7. Cleanup failure invalidates proof.

## Implementation Considerations

### Scope

This is a breaking schema change with no backward compatibility needed (no production records exist). However, ~15 negative test fixtures and the full validation toolchain must be rewritten.

### Files to Change

| File | Change |
|------|--------|
| `schemas/claim.schema.json` | Replace `lifecycle` with `verification` |
| `schemas/experiment.schema.json` | Remove `assurance_level`, reshape `verification` |
| `docs/claim-proof-lifecycle.md` | Full rewrite |
| `docs/lab-model.md` | Update "Lifecycle Axes" section |
| `docs/operator-guide.md` | Remove state transition references |
| `tools/validate-records/claim-proof-lifecycle-rules.js` | Full rewrite (~200 lines) |
| `tools/claim-lifecycle/lifecycle-claim.js` | Rename to `verify-claim.js`, rewrite CLI |
| `package.json` | Update script names |
| `.claude/skills/learning-loop/references/learning-loop-rules.md` | Update lifecycle rules |
| `.claude/skills/learning-loop/references/prompt-blueprints.md` | Update prompt templates |
| `.claude/skills/learning-loop/SKILL.md` | Update workflow description |
| `fixtures/negative/*` | Rewrite all lifecycle test fixtures (~15 files) |

### Risks

| Risk | Mitigation |
|------|------------|
| Skill refresh generates invalid prompts during transition | Update skill before any agent uses dimension model |
| Fixture rewrite misses validation edge cases | Write fixtures first, then validator, then test |
| Dimension config mismatch (claim vs experiment) | Strict validation: exact match on dimension + scope + output |
| Over-engineering dimension model | Start with 4 dimensions only; defer new ones to meta-evidence |

## Success Metrics

- All existing `pnpm check` tests pass with new fixtures
- New validator catches: missing dimensions, mismatched proof configs, missing human approval
- Skill prompts no longer reference old lifecycle states
- Meta-evidence can document skill gaps and drive updates

## Action Items (Prioritized)

1. **Refresh learning-loop skill** — update rules, blueprints, SKILL.md to dimension model
2. **Rewrite schemas** — claim + experiment schemas
3. **Rewrite docs** — lifecycle, lab-model, operator-guide
4. **Rewrite validator** — claim-proof-lifecycle-rules.js
5. **Rewrite CLI tool** — rename lifecycle-claim.js to verify-claim.js
6. **Rewrite fixtures** — all negative test cases
7. **Run validation** — `pnpm check` passes
8. **Meta-evidence** — document the architecture change as a loop self-improvement case

## Next Step

Create detailed implementation plan via `/ck:plan` if approved.
