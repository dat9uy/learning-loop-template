# Sweep Plan-ID Lineage from Stable Code Artifacts

**Date**: 2026-08-01 16:00
**Plan**: `plans/260801-1553-stable-artifacts-no-plan-ids-test-and-sweep/`
**Finding resolved**: `meta-260721T2300Z-agent-runtime-embeds-plan-ids-phase-numbers-and-finding-code`
**Status**: DONE — allowlist `[]`; 0 matches in scan surface; finding resolved

## Outcome

3 phases, 9 commits, test-first ordering held. Phase 1 added the state-3 gate (regression test + 73-entry seeded allowlist) before any sweep work. Phase 2 rewrote every match to invariant/role descriptions. Phase 3 emptied the allowlist (total ban), updated the rule's `hint_text`, logged a change-log entry, and resolved the source finding with full provenance.

## Key Decisions

- **Test-first, not sweep-first.** A sweepless commit landing a plan-ID comment would have been caught immediately by the new test; the bleed stopped at commit 1. The pre-commit hook already runs `pnpm test`, so no new hook machinery was needed — the prevention is the existing pipeline plus one new file.
- **Allowlist anchored by line content, not line number.** Phase 2 edits shift surrounding lines; line-number anchoring would have invalidated the sidecar after every commit. Content anchoring is robust through the sweep and survives the rewrite churn.
- **Set-diff semantics, not array equality.** `currentMatches - allowlist` is the assertion. When the allowlist is empty (Phase 3), the semantics naturally become a total ban — no code change to the test, KISS. Added `expect(allowlist).toEqual([])` to make the empty state intentional, not accidental.
- **Plan-ID/phase-number patterns only, not finding/loop-design codes.** Code legitimately references durable registry pointers (findings, rules, loop-designs). The "ephemeral lineage" harm is plan IDs and phase numbers — they age out of relevance but get cited forever. Distinction is testable, documented in the rule's `legit-test-fixtures-excluded` item, and the scan surface respects it.
- **Sidecar `[]` over inline array.** Clean to prune per-file during the sweep; the operator-visible state is "what's still allowed" rather than "what's already swept." Trivially diffable in PR review.

## Trade-offs

- **73 matches, not 69.** The plan's scope estimate was 69 (plan-level); execution landed 73 (the broader scan surface caught 4 extra comment instances missed in the finding's `core/+mastra/+bin` scope). The broader scope was the right call — 21 instances in `tools/handlers/`, `scripts/`, and `hooks/universal/` would otherwise have escaped prevention and re-asserted the same drift in a future finding.
- **Hand-edit per file, not sed.** A mechanical find-replace would have produced wrong invariant names (e.g. "Phase 3 of plans/X" → "Legacy phase-3 ref" without reading what the code actually does). Each rewrite needed the surrounding code in view. 9 commits, ~7 min/rewrite, cheap to review.
- **4 string-literal edits as contract-affecting.** `core/loop-introspect.js:237` and `:428` (Rec 10/Rec 12 dispatch labels), `core/meta-state.js:2067` (batch envelope `reason`), and `tools/handlers/trigger-workflow-tool.js:35` (vacated-recommendations `reasoning` template). All swept per the plan's validate-confirmed contract scope. Behavior change is limited to the visible parenthetical text; no parser depends on the dropped plan ids. Each commit flagged the contract change in its message.
- **Stale-entry warning is non-failing by design.** During Phase 2 the operator wants visibility into the sweep progress (each rewrite leaves an allowlist entry stale until pruned) but should not be blocked by it. `console.warn` is the right signal level — a test failure mid-sweep would force a "prune before next commit" ritual that the test's purpose (block new matches) doesn't actually require.

## Brutal Truth

The 4 string-literal edits are the riskiest part of the sweep, and they were the part the plan's author had to talk themselves into. The mechanism labels ("Rec 10 dispatch protocol", "Auto-emitted by meta_state_batch", "vacated") are durable; the parenthetical plan ids are not. But a dropped parenthetical is still a dropped user-visible token, and any future grep for the old text goes dark. Call it out in the change-log so the convention change is loop-citable.

The pre-existing 2 test failures in `pnpm test:iter` (bash-coordination perf threshold; cold-tier-regression drift-stale on unrelated findings) are not this plan's debt to pay — they were already there and are out of scope. Surfacing them in the journal so they don't get re-triaged as "broken by the sweep."

The "rule `rule-no-plan-ids-in-stable-code-artifacts` already exists, why a test?" question is the real one. The answer is state-2 vs state-3: the rule is agentic consumption (state-2, "match surrounding code" propagates the pattern because 69 examples surround new writes); the test is enforcement (state-3, the commit is blocked). State-2 is necessary, state-3 is sufficient. The rule keeps its hint_text updated to point at the shipped test; the rule did not become redundant.

## Key Findings

- `core/bound-artifacts.js:5` was the finding's `evidence_code_ref`. Phase 2 rewrote it, so the file fingerprint drifted — expected signal that the cited code no longer matches the original claim. Did NOT run `meta_state_refresh_file_index` to mask the drift; resolving is the correct terminal step, not re-grounding. Documented in Phase 3 to prevent the reflex.
- The 5 test-file matches (fixtures) and 1 README match are excluded by glob — legit test data and docs, not stable code artifacts. Recorded in the test header's `legit-test-fixtures-excluded` justification.
- `core/placement.yaml` had 8 `summary:` fields with trailing "Phase N of plans/..." clauses; sweeping these is data, not comment, but the test's pattern catches them because the patterns are line-content-anchored. Good.
- The Phase 1 seed used a one-line node seeder at seed time. No `--update-allowlist` mode was built — YAGNI. The sweep prune pattern is "delete the matching key from the sidecar," which is trivial to do by hand for each file.

## Follow-up Items

- **Glob maintenance caveat**: documented in the test header. If a new source file type (`.ts`, `.cjs` variants) is introduced, extend `EXTENSIONS`. Not a near-term concern (repo is `.js`/`.yaml`); flag for the next file-type addition.
- **Pre-existing 2 test:iter failures**: bash-coordination perf threshold and cold-tier-regression drift-stale. Not blocked by this plan; not the journal's scope. Re-triage as a separate finding if they cross a release-blocker threshold.
- **Commit-message plan-IDs**: out of scope (no `commit-msg` hook wired). If commit-message lineage becomes a finding, separate plan; the prevention pattern is the same (scan + allowlist + set-diff assertion).
- **Layer 3 (`evidence_commit` historical pinning)**: deferred from the brainstorm's Layer 1 to a separate session. Resolves the "we lost the plan-id citation when the comment was swept" concern at the meta-state level rather than the code level.

## Provenance (resolution string)

`Fixed: prevention test (stable-artifacts-no-plan-ids.test.js) enforces a total ban; 69 plan-ID/phase-number instances swept to invariant descriptions; rule hint_text updated.`

Empirical: 9 commits, scan surface grep returns nothing, `pnpm test` green on the new test, allowlist sidecar is `[]` (one-line file containing `[]`).
