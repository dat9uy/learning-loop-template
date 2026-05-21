# Problem Classification

Quick reference for choosing the right `records/` artifact when something goes wrong.

## Decision Matrix

| Symptom | Artifact | Result | Why |
|---------|----------|--------|-----|
| Concrete failure during walkthrough / test / build | **Experiment** | `rejects` | Records what was attempted, what broke, and which index-entry dimension (or frozen-legacy claim dimension) is blocked. |
| Systemic concern — could break, hard to maintain, security worry | **Risk** | `active` (status) | Tracks conditional caution with severity, likelihood, and mitigation plan. |
| Unclear whether it's a bug or expected behavior; needs more data | **Experiment** | `inconclusive` | Records the attempt and what blocked a clear verdict. Prevents premature classification. |

## Detailed Criteria

### Experiment with `result: rejects`

Use when:
- A reproducible step in the product walkthrough fails (HTTP error, crash, wrong data, broken navigation).
- An index-entry dimension (or frozen-legacy claim dimension) that was previously `active` (or `verified`) now fails on re-check.
- Build or test fails with a clear error.

Required fields:
- `method`: exact steps to reproduce
- `observations`: route / status_code / component / what failed
- `result: rejects`
- `verification.proves`: name the dimension and scope that was blocked

Example from this repo:
- `experiment-operator-product-shape-walkthrough-260511T1900Z` (result: `supports`) — baseline walkthrough.
- A hypothetical re-run after a dependency upgrade that breaks import would be `result: rejects` with `verification.proves` pointing at the `install` dimension.

### Risk

Use when:
- No concrete failure yet, but a pattern or dependency creates exposure.
- Architecture decision has a known downside that may materialize later.
- External vendor behavior is inferred, not confirmed.

Required fields:
- `risk_statement`: one-line conditional caution
- `category`: security, operational, dependency, design
- `severity`: low / medium / high / critical
- `likelihood`: low / medium / high
- `mitigation`: blocked_actions and required_gates

Example from this repo:
- `risk-vnstock-external-installer` — external Makeself installer download is a security exposure even though install currently works.

### Experiment with `result: inconclusive`

Use when:
- Failure is intermittent or environment-dependent.
- Not enough information to decide if it's a product bug, infrastructure issue, or expected behavior.
- Reproduction steps are incomplete.

Required fields:
- `method`: what was tried
- `observations`: what happened (including environment state)
- `result: inconclusive`
- `notes`: what data is missing and what would resolve the ambiguity

## Anti-Patterns

| Wrong | Right | Reason |
|-------|-------|--------|
| File a Risk for a reproducible 403 during walkthrough | File an Experiment with `result: rejects` | Risks are for future exposure, not present failures. |
| File an Experiment with `result: supports` when the walkthrough was skipped | File an Experiment with `result: inconclusive` | `supports` requires evidence; absence of evidence is not support. |
| Put the fix in the Experiment record | Put the fix in product code; use Experiment to record verification | Experiments are ledger entries, not implementation plans. |
| Create a new index entry for every bug | Use Experiment `rejects` against existing index entry | Index entries are assertions to verify; bugs are evidence about existing assertions. |

## Workflow

1. Reproduce the problem.
2. Match symptom to table above.
3. Create evidence under `records/evidence/<scope>/` if needed.
4. Author the record, cite evidence and affected index-entry or claim refs.
5. Run `pnpm validate:records` before finishing.

## See Also

- `docs/record-system-architecture.md` — entity roles, record hierarchy, state machine
- `docs/operator-guide.md` — evidence model and approval flow
- `docs/artifact-concepts.md` — dimension semantics
