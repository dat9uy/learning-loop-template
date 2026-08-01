# Brainstorm — Decouple loop artifacts from plans/; git-hash for historical code pinning

- **Source finding:** `meta-260721T2300Z-agent-runtime-embeds-plan-ids-phase-numbers-and-finding-code` (open, warning, `evidence_code_ref: core/bound-artifacts.js:5`)
- **Existing design:** loop-design `loop-design-plan-id-free-stable-code-artifacts-removal-sweep-alternative`; rule `rule-no-plan-ids-in-stable-code-artifacts` (active, hint #11)
- **Date:** 2026-08-01 15:44 ICT
- **Status:** exploration → routing decision taken. Layer 1 and Layer 3 to be planned in **separate sessions**.

## Outcome

Deep-dive the plan-ID-in-code finding, framed broadly: how to decouple code + loop artifacts (findings, rules) from external artifacts (plans/), and whether git hash can replace direct plan references while preserving historical state.

## Constraints

- Reuse the self-contained file-index (latest-version) for current drift detection; do not break `checkGrounding`'s documented pure-function property (`check-grounding.js` header: "Pure … No subprocess execution") — SP3 drift aggregation depends on it.
- Preserve public contracts: source_ref canonical form `local:meta-state:<id>`; `local:plans/...` escape hatch; change-log `change_target: plans/.../plan.md` loop-citability (philosophy.md pillar 4).
- Findings mutate via tools only; grounding via `evidence_code_ref` + `mechanism_check: true` + file-index baseline.

## Non-goals

- Removing plan citations from **change-logs** (operator pillar-4 decision — **kept**, user confirmed).
- A content-inspecting write-gate for plan-ID comments (the finding chose a regression test; a gate is disproportionate + friction).
- Commit-message plan-ID enforcement (needs a `commit-msg` hook; not wired; lower-harm; separate scope).

## Evidence gathered

- `local:plans/` source_refs in `meta-state.jsonl`: **0**. Findings already cite via `local:meta-state:<id>`.
- Change-logs citing `plans/...` in `change_target`: **47/274** — by design (pillar 4).
- No `commit`/`git_sha`/blob field in either registry file's schema. Registry pins a **path**, not a code state.
- `check-grounding.js:199–208`: baseline = file-index hash (latest) **fallback** per-record `code_fingerprint`; index overrides the per-record field. File-index is latest-only; after `refresh_file_index` the old baseline is gone.
- Prevention test `stable-artifacts-no-plan-ids.test.js`: **absent**. Residual plan-ID comment instances in `core/mastra/bin`: **49**.
- `package.json:17` `pnpm test` = seed + `vitest run`; `package.json:50–51` `simple-git-hooks` pre-commit = `pnpm test && pnpm fallow:gate`. So a test in `__tests__/` blocks re-introduction at commit time with **no new machinery**.

## Three separable layers (the core reframing)

Conflating these made the git-hash idea feel both right and off.

1. **Code comments embed plan IDs** (literal finding). Stable code ← transient lineage. Fix = describe invariants directly. A git hash here is *worse* (more opaque).
2. **Findings cite plans** (the "decouple" concern). **Already decoupled in practice** — 0 plan source_refs; `local:meta-state:<id>` canonical. Plans live in change-log `change_target` by pillar-4 design.
3. **Historical code pinning** (git-hash's real target). Registry records no commit SHA; file-index is latest-only. Gap: "which code state was this finding verified against?" is recoverable only via `git log` + `created_at` correlation.

Git hash does **not** replace plan refs in findings (already gone). It pins findings to code history — orthogonal to Layers 1–2.

## Approaches (Layer 3)

| | Approach | Gives | Cost |
|---|---|---|---|
| A | Do nothing on L3; execute L1 sweep only. | Closes literal finding. History via git-log+timestamp. | None new. L3 gap open. |
| **B** | Optional `evidence_commit` field (HEAD SHA at write/re-verify). Grounding stays pure; pin is metadata for `git show <sha>:<path>`. | Historical pin; reuse file-index for current drift unchanged. | Small, additive; git-diff.js already shells to git (infra exists). |
| C | Git blob SHA as grounding baseline; resolve via `git cat-file` in `checkGrounding`. | Grounding resolves frozen blobs. | **Breaks pure-function invariant**; git dep on hot path; 2nd hash system. Marginal vs B. |

**Recommendation:** B if Layer 3 is worth solving; C not recommended. Defer B until a concrete "can't reconstruct original code state" need hits — drift lifecycle + git log covers most cases.

## Prevention analysis (is the rule hint enough?)

**No — and the finding itself says so.** The hint is state-2 (deterministic injection, agentic consumption). The finding's root cause: "self-reinforcing … 'match surrounding code' causes every new feature to propagate it." 49 live instances actively *teach* the bad pattern; a hint cannot reliably override 49 surrounding examples.

| Piece | State | Status | Role |
|---|---|---|---|
| Hint (rule #11) | state-2 | live | remind; not a gate |
| Regression test `stable-artifacts-no-plan-ids.test.js` (allowlist-bounded, fails on new) | state-3 | **not built** | actual enforcement |
| Sweep (49 comments → invariant descriptions) | — | not done | removes the "match surrounding code" teacher |

The test is the missing deterministic gate. It runs in `pnpm test` → pre-commit hook → **blocks the commit** on re-introduction. No new hook needed.

**Ordering within Layer 1 (inversion):** add the test **first** (allowlist seeded at 49 → stops the bleed immediately, even before any rewrite), then sweep (shrinks allowlist to zero → total ban). Test-first makes prevention real *now*; without it the sweep window relies on the hint alone — exactly the gap the finding describes.

## Decisions taken

- **Layer 1** → plan in a separate session: (1) add `stable-artifacts-no-plan-ids.test.js` seeded with current 49-line allowlist; (2) sweep 49 comments to invariant-descriptions, shrinking allowlist; (3) hint + pillar-4 change-log citation untouched.
- **Layer 3** → plan in a separate session, after Layer 1. Lean Approach B (`evidence_commit` pointer, pure-function preserved). Defer unless concrete need.
- **Layer 2** → no action. Pillar 4 stands (user-confirmed).

## Unresolved questions

1. **Layer 3 trigger:** defer B until a concrete "can't reconstruct original code state" case, or add `evidence_commit` proactively now? Lean: defer.
2. **Commit-message plan-IDs:** rule text forbids them but no `commit-msg` hook enforces. Wire one, or accept lower-harm gap? Separate scope decision.
3. **Test coverage boundary:** the designed test greps `core/+mastra/+bin/` source. Confirm it also covers test *names* and migration *names* the rule names, or narrow the rule text to match enforceable scope.