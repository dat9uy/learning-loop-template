# Agent Anti-Confusion Checklist

Use this checklist before asking the user a question or making an assumption about system state.

## 1. Memory Prohibition

- [ ] I have NOT relied on injected CLAUDE.md memory or session context as a source of truth.
- [ ] I have re-read `meta-state.jsonl` (via `loop_describe` or `meta_state_list`) and `runtime-state.jsonl` to verify any recalled fact.
- [ ] If memory contradicts records, I trust the records.
- [ ] If records are silent, I treat the memory as unverified.

## 2. Observation State Check

- [ ] Before asking about external system state (device slots, budgets, registration status, rate limits, operational constraints), I checked `runtime-state.jsonl`.
- [ ] I read relevant observation records before formulating my question.
- [ ] I noted the `last_verified` timestamp and treated stale observations as unverified.

## 3. Decision Record Coverage

- [ ] All architectural decisions in my plan are encoded as `records/<surface>/decisions/` artifacts.
- [ ] Each decision has `decision_effect` with `allowed_actions`, `blocked_actions`, and `required_gates`.
- [ ] I have NOT proceeded to implementation without decision coverage.

## 4. Evidence Authority

- [ ] I have NOT authored evidence files under `records/evidence/` without operator confirmation.
- [ ] I have NOT updated `validation_status` to `passed` without operator confirmation.
- [ ] Any evidence findings I drafted are presented to the operator for approval before writing.

## 5. Domain Neutrality

- [ ] My prompts and docs use generic examples, not domain-specific ones.
- [ ] Domain-specific content lives in `records/evidence/<domain>/` or appendices, not core docs.

## 6. Validation Gate

- [ ] I ran `pnpm validate:records` after any record change.
- [ ] I ran `pnpm check` before declaring a phase complete.
- [ ] I stopped immediately if validation failed.

## Reference

- `docs/operator-guide.md` — full procedural guide
- `references/learning-loop-rules.md` — core philosophy and constraints
- `references/meta-evidence-self-improvement.md` — gap classification and self-improvement rules
- `record:decision-meta-20260517T1200Z-observation-state-check-rule` — observation-state-check decision
- `record:decision-meta-260524T1326Z-yes-all-new-meta-evidence-must-classify-itself-by-sample-count-requirement` — N=1/N>=2 classification decision
