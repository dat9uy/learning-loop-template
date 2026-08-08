# 2026-08-08 — hint injection-policy + on-demand reclassification + gate-verb-allowance key

## What happened

Started as `/ak:plan --tdd meta-260808T1614Z-loop-get-instruction-gate-verb-allowance-returns-unknown-hin` — a single missing `loop_get_instruction` key. The problem-solving reframe (`/ak:problem-solving`) expanded it: the hint payload is ~14kb **triplicated** (warm `loop_describe` + `session-context.json` re-injected every turn + AGENTS.md/CLAUDE.md), and 12 of 16 discoverability + 2 process hints are reference material force-injected at startup. The user chose the full cascade: an injection-policy `tier` field (`startup` | `on-demand`) + reclassify + the new key + dedup, in one TDD plan.

## Key decisions

- **Mechanism:** a `tier` field on `HINT_REGISTRY`, filtered at warm-injection sites only. "Index always, full text on-demand" — warm emits `hint_index` (all slugs + suggestions) so on-demand hints stay discoverable; `loop_get_instruction` returns full text of any hint.
- **Keep 4 startup:** `loop-get-instruction` (on-ramp/index), `canonical-tool` (prevent first-action `node -e`/file-IO), `surface-split` (the do-not-duplicate rule), `phase-a-reframe` (4-kind model). `internalization-rule` stays on-demand per the keep-4 decision — its discoverability rides on `hint_index` + the `loop-get-instruction` pointer (accepted tradeoff).
- **Dedup:** per the scouting audit (`plans/reports/dedup-audit-260808-2011-hints-vs-agents-claude.md`), each hint's canonical home is named; CLAUDE.md gate-verb paragraph → pointer (minimal CLAUDE.md; block message is the common-case entry point; proactive pre-block recording takes a `loop_get_instruction` call — accepted tradeoff).

## Red-team (the headline)

3 reviewers (Security / Failure-Mode / Assumption-Destroyer, Standard tier) found **17 findings (2 Critical, 9 High, 6 Medium), all accepted**. The two Criticals were both scope omissions that would have silently broken hint injection across a whole runtime/tier:

1. **`.factory/hooks/loop-surface-inject.cjs` is a forked SessionStart hook** (`.factory/hooks.json:8`), NOT a universal hook — the plan's "no per-runtime fork" claim was false. `.factory` would have silently lost 12 hints with no `hint_index`.
2. **`loop-describe-tool.js` `buildHintBlocks` is shared by warm AND cold tiers** — filtering at the builder would have shrunk the cold tier ("full history") 16→4.

Other Highs: a renderer filter-vs-provenance contradiction (renderer is inspection tooling → stays unfiltered), a dropped security constraint (the promoted-rule denylist — added to the hint spec), a `listHints` default footgun that would break numeric indices (pinned: default = no-filter), and 4 missed/crashing test assertions. The 2 tradeoff findings respected explicit user decisions (keep-4, minimal CLAUDE.md) and were documented, not silently applied.

## Dogfooding

Recording the `gate-verb:node` allowance mid-research took exactly the 2 calls the self-remediating block message (PR #121) emits — the A+C+D work is confirmed in the field.

## Outcome

Plan `260808-2018-hint-injection-policy-on-demand-reclassification-gate-verb-allowance-key` — 4 TDD phases, red-teamed, whole-plan consistency sweep clean (0 unresolved contradictions). Resolves finding `meta-260808T1614Z` + collapses the hint triplication tax. Ready for `/ak:plan validate` or `/ak:cook`.