# Phase 1 HARD GATE — residual blocking list

**Captured:** 2026-07-15
**Validator:** `node tools/learning-loop-mastra/scripts/validate-registry-refs.js --root=.`
**Plan estimate:** ~27
**Measured blocking:** **26** (1 below the plan estimate; the 18 inactive
loop-design `addresses` were auto-exempted as `historical` by Phase 1's
`isTerminalSource` predicate for inactive rules + loop-designs.)

## Bucket counts (3-bucket classification)

| Bucket | Count | Source kinds |
|--------|-------|--------------|
| blocking | 26 | 9 active rule `origin`; 16 active loop-design `addresses`; 1 active loop-design `proposed_design_for`; 1 active finding `reopens` |
| historical | 72 | immutable change-log `consolidates` + terminal-source `missing` (superseded findings, inactive rules, inactive loop-designs) |
| informational | 33 | `stale` (open + >7d, freshness signal) + `superseded`/`resolved` targets |

## Blocking refs (Phase 2 input — incremental triage target)

| # | source_kind | source_id.field | target_id | reason |
|---|-------------|-----------------|-----------|--------|
| 1 | rule | rule-short-slug-for-risk-records.origin | meta-260601T1353Z-sanitizeslug-in-record-writer-js-generates-a-kebab-case-slug | missing |
| 2 | rule | rule-no-new-artifact-types.origin | meta-260602T0000Z-escape-hatch-abuse-meta-taxonomy-proposal | missing |
| 3 | rule | rule-project-skill-boundary.origin | meta-260602T1116Z-agent-inside-a-project-that-has-its-own-mcp-json-called-ck-u | missing |
| 4 | rule | rule-cold-session-test-must-pass-before-resolution.origin | meta-260606T1656Z-cold-session-test-must-pass-before-resolution | missing |
| 5 | rule | rule-no-orphaned-evidence.origin | meta-260607T0008Z-dual-field-schema-risk-evidence-code-ref-top-level-vs-eviden | missing |
| 6 | rule | rule-import-chain-analysis-after-tool-deletion.origin | meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m | missing |
| 7 | rule | rule-pr-body-registry-deltas.origin | meta-260622T1708Z-every-pr-that-modifies-meta-state-jsonl-registry-sweeps-stat | missing |
| 8 | rule | rule-tool-integration-same-commit-dep.origin | meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but | missing |
| 9 | rule | rule-assertinvariant-at-boundary.origin | meta-260629T2300Z-files-like-meta-state-jsonl-that-participate-in-pre-commit-h | missing |
| 10 | loop-design | loop-design-meta-state-registry-sqlite-migration-trajectory-parked.addresses[0] | meta-260608T1826Z-phase-6-summary-mode-size-assertion-fails-because-the-cold-t | missing |
| 11 | loop-design | loop-design-meta-state-registry-sqlite-migration-trajectory-parked.addresses[1] | meta-260608T1826Z-compact-mode-size-budget-30kb-is-exceeded-because-the-full-r | missing |
| 12 | loop-design | loop-design-meta-state-registry-sqlite-migration-trajectory-parked.addresses[2] | meta-260608T1826Z-test-buildinverseindexes-on-real-registry-fails-line-37-the | missing |
| 13 | loop-design | loop-design-session-closeout-audit-agent-replaces-ck-journal.addresses[0] | meta-260613T1149Z-pre-existing-test-failure-backfill-mechanism-check-test-js-8 | missing |
| 14 | loop-design | loop-design-session-closeout-audit-agent-replaces-ck-journal.addresses[1] | meta-260613T1149Z-pre-existing-test-failure-g8-subcommand-class-entry-test-js | missing |
| 15 | loop-design | loop-design-session-closeout-audit-agent-replaces-ck-journal.addresses[2] | meta-260613T1149Z-pre-existing-test-failure-migrate-rule-entry-kind-test-js-91 | missing |
| 16 | loop-design | loop-design-session-closeout-audit-agent-replaces-ck-journal.addresses[3] | meta-260613T1149Z-pre-existing-test-failure-migrate-rule-entry-kind-test-js-13 | missing |
| 17 | loop-design | loop-design-session-closeout-audit-agent-replaces-ck-journal.addresses[4] | meta-260613T1115Z-cold-session-l2-probe-test-is-flaky-due-to-fixed-60s-timeout | missing |
| 18 | loop-design | loop-design-session-closeout-audit-agent-replaces-ck-journal.addresses[5] | meta-260610T2301Z-cold-session-test-1-l2-probe-flakiness-confirmed-during-meta | missing |
| 19 | loop-design | loop-design-session-closeout-audit-agent-replaces-ck-journal.addresses[6] | meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois | missing |
| 20 | finding | meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update.reopens | meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n | missing |
| 21 | loop-design | loop-design-pr-quality-rules-and-hints-split.addresses[0] | meta-260622T1708Z-every-pr-that-modifies-meta-state-jsonl-registry-sweeps-stat | missing |
| 22 | loop-design | loop-design-pr-quality-rules-and-hints-split.addresses[1] | meta-260622T1713Z-process-specific-rules-test-runner-stop-conditions-ci-rules | missing |
| 23 | loop-design | loop-design-encode-n-anti-pattern-findings-as-consult-checklist-rule.addresses[0] | meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but | missing |
| 24 | loop-design | loop-design-encode-n-anti-pattern-findings-as-consult-checklist-rule.addresses[1] | meta-260628T1328Z-fallow-dead-code-save-regression-baseline-and-fallow-dead-c | missing |
| 25 | loop-design | loop-design-encode-n-anti-pattern-findings-as-consult-checklist-rule.addresses[2] | meta-260628T1329Z-when-fallow-runs-in-a-project-root-it-auto-creates-a-root-fa | missing |
| 26 | loop-design | loop-design-vitest-migration-replace-node-test-and-c8.proposed_design_for | rule-vitest-coverage-output-shape-matches-fallow | missing |

## Phase 2 disposition plan (high-level)

- 9 rule `origin` → `meta_state_patch({entry_kind:"rule", id, patch:{origin:""}})` (empty string, NOT null)
- 16 loop-design `addresses` → `meta_state_patch` (read→filter→verify len orig-1→patch→re-query); preserve valid refs
- 1 loop-design `proposed_design_for` → `meta_state_patch` (remove dangling id; preserve valid refs)
- 1 finding `reopens` → `meta_state_patch` (remove dangling id; preserve valid refs)
