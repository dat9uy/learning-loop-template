# PM Report — gate-logic shell-quote verb-layer (Full path)

Date: 2026-08-07
Plan: `260807-1633-gate-logic-shell-quote-verb-layer`
Branch: `260807-1349-meta-state-resolve-and-cli-argv-scope-drift-finding`
Status: **completed** (with 3 open items filed as findings)

## Plan Completion

| Phase | Status | Tests | Notes |
|-------|--------|-------|-------|
| 1. Spike & shell-quote dep | Completed | 13/13 | shell-quote@^1.10.0 direct dep; CVE-2026-9277 mitigations enforced |
| 2. Parse-to-policy-token shim | Completed | 54/54 | classifyPolicyTokens returns structured policy view |
| 3. Gate-verb layer | Completed | 36/36 | matchGateVerb + observation-gated constraint |
| 4. Inert-sink allowlist | Completed | 12/12 (verified by probe) | applyInertSinkBlanking with 3 withholds |
| 5. Strip-helper migration | **Partial** | n/a | Substrate migration done; legacy helpers retained (deferred) |
| 6. Residual + records | Completed | n/a | Residual captured in phase report; records queued |

## Findings Filed (3 open items)

| ID | Title | Severity |
|----|-------|----------|
| `meta-260807T1753Z-phase-5-strip-helper-deletion-deferred-the-new-parse-substra` | Phase 5 strip-helper deletion deferred (5 test files import legacy helpers) | warning |
| `meta-260807T1754Z-gate-verb-observation-friction-for-the-test-runner-the-new-v` | Gate-verb observation friction (pnpm test:one invokes bash internally) | warning |
| `meta-260807T1755Z-two-pre-existing-flakes-in-the-gate-logic-test-suites-reprod` | 2 pre-existing flakes (reproducible on HEAD; not caused by this plan) | warning |

## Plan Status Sync

- `plan.md` YAML frontmatter: `status: completed`
- Phase table: Phases 1-4 + 6 marked Completed; Phase 5 marked Partial
- Success criteria: 8/10 marked `[x]`; 2 marked `[ ]` with notes pointing to the deferred items
- Open items: original 2 marked resolved; 3 new open items added as Outstanding Open Items

## Business Value

- **Finding 3 closed.** Assembled-token execution shapes (printf -v, eval, node -e, bash <<<, echo adjacent-quote concat | bash) now escalate via the verb layer — observation-gated, same shape as docker/sudo.
- **Findings 1 & 2 closed.** Find 1 (printf JSON payload | node bash-gate.js) and Find 2 (pnpm test:one | tail) now return ok via the inert-sink allowlist.
- **Indirection-to-executor verbs gated.** env / xargs / find -exec / exec / . / source / PATH-qualified — covered by the verb layer with basename normalization.
- **CVE-2026-9277 mitigated.** shell-quote 1.10.0 pinned; `quote` import unimportable across core/ + hooks/ (grep + test guard); parse-only flow.
- **Policy moved to config.** gate-verbs, inert-sinks, data-verbs, echo-prose-verbs, command-prefixes live in patterns.json — no hardcoded verb lists in gate-logic.js.

## Critical Issues

- **Phase 5 strip-helper deletion deferred (Finding 1753).** 5 test files import the legacy helpers directly. New substrate is the security boundary; legacy helpers are dead code, not security-critical. Follow-up: update imports + delete helpers.
- **Gate-verb observation friction (Finding 1754).** `pnpm test:one` invokes bash internally, which the new verb layer correctly flags. Per the plan's design notes, record observations for the test runner's bash invocations under a dedicated id.
- **Pre-existing flakes (Finding 1755).** 2 unrelated test failures reproducible on HEAD. Not regressions; triage separately.

## Documentation

- `plans/reports/phase-01-260807-1709-shell-quote-spike.md` — spike output + CVE mitigations
- `plans/reports/phase-03-260807-1720-gate-verb-layer.md` — gate-verb layer acceptance
- `plans/reports/phase-06-260807-1858-residual-loop-design-and-records.md` — residual design + change-log diff + findings re-verification

## Unresolved Questions

1. Should `phase-5-strip-helper-deletion-deferred` trigger a follow-up plan now, or wait for the operator to scope it?
2. The gate-verb observation friction blocks `pnpm test:one` — does the operator want the observation recorded now under direct authority, or wait for a recorded-observation pattern to be codified?
3. The 2 pre-existing flakes reach past the substrate swap. Should they be triaged as part of the follow-up plan, or filed for separate triage?