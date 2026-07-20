# Phase 0: Loop Pre-Flight (product-build plans)

Use this template for all plans tagged `product-build`. Phase 0 is advisory — the gate enforces mechanically, but the template guides the operator.

## Phase 0: Loop Pre-Flight

### Surface Declaration
This plan touches the following surfaces:
- [ ] `product` (backend + frontend)
- [ ] `vnstock` (data layer)
- [ ] `meta` (loop infrastructure)
*(Check all that apply)*

### Decision Record Checklist
For each declared surface, confirm decision records exist:
- [ ] `records/<surface>/decisions/` contains at least one active decision
- [ ] All Key Decisions from this plan have corresponding decision records
- [ ] Decision records cite source evidence and required gates

### Pre-Flight Validation
```bash
pnpm test
```

### Gate Mode
Current gate response mode: `warn` (allow with warning) / `escalate` (block without approval)

---

## Phase 1+: Regular Plan Phases

Continue with standard phase structure after Phase 0 is complete.
