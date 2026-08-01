---
title: "Stable artifacts no plan IDs test and sweep"
description: "Layer 1 of brainstorm-260801-1544: add the plan-ID regression test first (allowlist seeded at current matches), then sweep all plan-ID/phase-number lineage out of stable code artifacts into invariant descriptions, shrinking the allowlist to a total ban. Implements the accepted loop-design with test-first ordering."
status: complete
priority: P2
effort: "1-2d"
tags: [meta, gate-logic, stable-artifacts, test-first]
created: 2026-08-01
---

# Stable artifacts no plan IDs test and sweep

## Overview

Resolve finding `meta-260721T2300Z-agent-runtime-embeds-plan-ids-phase-numbers-and-finding-code` (open, warning) by implementing its accepted loop-design `loop-design-plan-id-free-stable-code-artifacts-removal-sweep-alternative` with a **test-first ordering**: add the prevention regression test before the sweep so the bleed stops immediately, then hand-edit each plan-ID lineage comment/field to describe the invariant directly, shrinking the allowlist to zero (total ban).

The rule `rule-no-plan-ids-in-stable-code-artifacts` (hint #11, active) is already injected at session start, but it is state-2 (agentic consumption) and cannot override the 69 surrounding examples ("match surrounding code" propagates the pattern). The regression test is the missing state-3 gate; it runs in `pnpm test` → `simple-git-hooks` pre-commit (`package.json:50-51`) → blocks any commit that re-introduces a plan-ID comment. No new hook machinery needed.

Brainstorm report: `plans/reports/brainstorm-260801-1544-decouple-loop-artifacts-from-plans-git-hash.md` (Layer 3 — `evidence_commit` historical pinning — is deferred to a separate session; this plan is Layer 1 only).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Add `stable-artifacts-no-plan-ids.test.js` + allowlist seeded at the current 69 source matches; test passes today, fails on any NEW match | P1 |
| 2 | Sweep all 69 plan-ID/phase-number instances across `tools/learning-loop-mastra/**` source to invariant descriptions; allowlist pruned to empty | P1 |
| 3 | Update rule hint_text (drop "once added" hedge) and resolve the finding | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Add regression test + allowlist](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Sweep plan-ID lineage to invariant descriptions](./phase-02-sweep-plan-id-comments-to-invariant-descriptions.md) | Pending |
| 3 | [Phase 3: Finalize allowlist + resolve finding](./phase-03-finalize-allowlist-and-resolve-finding.md) | Pending |

## Scope (evidence-grounded, validate-confirmed)

Patterns to detect (widened during review-fix — see Scope expansion below): `/\bplans?\/\d{6}-/i`, `/Phase \d+ of (plan|plans)\b/i`, `/[Pp]lan[- ]\d{6}-\d{4}/`, `/\b[Pp]lans? \d+\b/`, `/\b[Pp]hase[- ]\d+\b/`, `/\b[Pp]hase [A-E]\b/`. Plan-ID/phase-number only — see Non-goals for why finding/loop-design/rule ids are intentionally excluded (the test masks durable id tokens before matching, so a date-stamp inside a `meta-...` slug is exempt).

Scan surface: `tools/learning-loop-mastra/**` **excluding** `__tests__/**`, `*.test.js`, `*.md`, `*.json`. Include `*.js`, `*.cjs`, `*.mjs`, `*.yaml`. (Validate broadened this from the finding's `core/+mastra/+bin` — 21 instances live in `tools/handlers/`+`scripts/`+`hooks/universal/` and would otherwise escape prevention.)

Current matches (2026-08-01): **76 sweep targets** = 57 comments + 14 `placement.yaml` `summary:` fields + 5 contract-affecting string literals. (Plus 5 test fixtures + 1 README excluded by glob.)

The 5 contract-affecting string literals:
- `core/loop-introspect.js:237` — `Rec 10 dispatch protocol (plan ...)` display label
- `core/loop-introspect.js:428` — `Rec 12 closed-loop backfill (plan ...)` display label
- `core/meta-state.js:2067` — emitted `reason: "Auto-emitted by meta_state_batch ... (plan ...; loop-design-...)"` (validate: sweep; the loop-design id is KEPT, only the plan ID removed)
- `tools/handlers/trigger-workflow-tool.js:35` — emitted `reasoning` template `... vacated per plans/260722-2147 phase 5 ...`
- `tools/handlers/meta-state-sweep-tool.js:10` — MCP tool `description` field (found during review; same contract class — text served to agents)

## Scope expansion (review-fix, 2026-08-01)

Code review of the sweep branch found the original 3 patterns structurally blind to forms that survived the sweep: hyphenated `plan-260722-2147` (a live ID in `notify-artifact-tool.js:19`), bare ordinals (`Plan 4`, `Plan 5-Lite`), and phase lineage without a date-stamped ID (`Phase A`/`Tier 2 Phase B`, `Phase 1..5`, `pre-Phase-2`, `read-only-after-Phase-3`) — including one emitted string (`backfill-versions.mjs:134` `reason: "Phase A backfill: ..."` → `"Version backfill: ..."`). The patterns were widened to the 6 above, adding ~165 sweep targets across the same scan surface. Same rule, full coverage of its forms. Also repaired in the same pass: ~20 comment blocks mangled by the first sweep's partial-line replacements (`//` lines inside `/** */` JSDoc blocks, orphaned `M7)`/`M20)` fragments, stripped indentation).

## Non-goals

- **Finding/loop-design/rule code references in code** (e.g. `check-grounding.js:152` cites `meta-260607T1517Z-...`). The rule text forbids "finding codes" too, but the prevention test is plan-ID/phase-number-only by design: **it is normal and intended for code to reference loop artifacts** (findings, rules, loop-design ids are durable registry pointers, not ephemeral lineage). Only plan IDs and phase numbers are the "ephemeral lineage in stable code" harm this plan removes. (Validate-confirmed.)
- **Commit-message plan-IDs.** The pre-commit hook runs `pnpm test`, which does not inspect commit-message text. A `commit-msg` hook is not wired; separate scope.
- **Layer 3** (`evidence_commit` historical pinning) — separate session.
- **Change-log `change_target: plans/...`** citations — pillar-4 design, untouched (user-confirmed).
- **Durable registry KEYS that embed phase lineage** (e.g. hint-registry slug `phase-a-reframe`, decision-log rule_id `phase-a-backfill-versions`, finding-id slugs). These are live identifier values; renaming breaks ledger continuity and consumer lookups. The sweep covers lineage REFERENCES in comments/strings, not identifier vocabulary. (Adjudicated during review-fix; the test's durable-id masking encodes this for `meta-`/`rule-`/`loop-design-` tokens.)
- **`plans/reports/...` pointers in code comments** — removed during review-fix (report paths are plan lineage too; comments now cite the concept or the durable registry id instead).
- **Test-file body/header comments** — the enforcement surface excludes `__tests__/**` and `*.test.js` by design (fixture data lives there; validate-confirmed). Test NAMES (`describe`/`test`/`it` labels) were nevertheless swept during review-fix (~70 labels) because the operator's global rule explicitly names "test names" — labels are stable artifacts, not fixture data. Test-body inline comments remain out of the enforcement surface.

## Success Criteria

- [ ] `stable-artifacts-no-plan-ids.test.js` exists, passes on current code, and fails when a plan-ID comment is added outside the allowlist.
- [ ] All 69 source instances rewritten to invariant/role descriptions; zero plan-ID/phase-number matches remain in scan surface.
- [ ] Allowlist pruned to empty; test is a total ban (any match fails).
- [ ] `pnpm test` green; pre-commit hook would block re-introduction.
- [ ] Rule `rule-no-plan-ids-in-stable-code-artifacts` hint_text updated (no "once added" hedge).
- [ ] Finding `meta-260721T2300Z-...` resolved (resolution records: test in place + sweep complete).
- [ ] No behavior change beyond the 4 documented string-literal text edits.

## Decisions (from /ak:plan validate)

1. **Scope:** broaden the prevention test + sweep to all of `tools/learning-loop-mastra/**` (excl `__tests__`/`*.test.js`/`*.md`/`*.json`). Allowlist seeds at 69. The finding's `core/+mastra/+bin` scope would have left 21 instances in handlers/hooks/scripts un-prevented.
2. **Finding-code refs:** keep the test plan-ID/phase-number-only. It is normal for code to reference loop artifacts (findings/rules/loop-design ids are durable registry pointers); only plan IDs/phase numbers are ephemeral lineage. Finding-code refs in code are acceptable.
3. **`meta-state.js:2067`** emitted reason: sweep it (contract edit accepted).
4. **Rule lifecycle:** keep the agent-checklist rule hint #11 (state-2 "why") alongside the test (state-3 enforcement); Phase 3 updates its hint_text only.

## Open Questions

1. **Allowlist storage:** sidecar `stable-artifacts-no-plan-ids.allowlist.json` (cleaner to prune per-file during the sweep) vs inline array in the test. Lean: sidecar — confirm at Phase 1.

## Cross-plan dependencies

None. Only one other unfinished plan exists (`260731-1325-meta-state-archive-lifecycle...`, pending) — it touches archive/restore tooling, no file overlap with this code-comment sweep.