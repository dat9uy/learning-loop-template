---
title: "Refs-check workflow: add pull_request trigger"
description: "Branch protection on main requires the `meta-state refs check` context for PR merges (strict:true), but `.github/workflows/meta-state-refs-check.yml` only triggers on `push: [main]` + `workflow_dispatch` — so the required check never runs on PRs. Recent PRs (57-61) merged via admin bypass (`enforce_admins:false`). Fix: add `pull_request` to the workflow's `on:` block so the check runs on PRs and the branch-protection requirement is satisfied. Validator already exits 0 on the live union (measured 2026-07-15: 0 blocking orphans across 316 entries), so the PR-HEAD run will be green."
status: completed
priority: P2
branch: "main"
tags: [meta-surface, registry, ci, refs-check, branch-protection]
blockedBy: []
blocks: []
created: "2026-07-15T13:41:55.134Z"
createdBy: "ck:plan"
source: skill
---

# Refs-check workflow: add pull_request trigger

## Overview

Follow-up to plan `260715-1608-tier1-followup-orphan-semantics-union-driver` Phase 3 (validation Q4) which flipped `meta-state-refs-check.yml` from WARN-mode to BLOCK-mode and made it a **required branch-protection check** on `main`. That phase shipped the BLOCK but the workflow still only triggers on `push: [main]` + `workflow_dispatch` — so the required check never runs on PRs. Recent PRs (#57-#61) merged with `enforce_admins: false` admin bypass; any non-admin contributor would hit the BLOCK.

**Scope:** Single YAML edit (4-line `on:` block change) + branch-protection verification + a test PR to confirm the check fires.

**Out of scope:**
- Changing `strict: true` / `enforce_admins` settings — those are repo-policy choices, not the bug
- Tightening the validator's classification policy — already shipped (Phase 1 of 260715-1608)
- Adding a `pull_request.paths` filter — chosen NO filter so the check appears on every PR (matches `test.yml` and the branch-protection intent)
- Switching the branch-protection from `contexts` (legacy) to `checks` (with `app_id`) — that's an API-shape change separate from this bug

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Edit workflow YAML](./phase-01-implement.md) | Completed |
| 2 | [Verify on test PR](./phase-02-verify.md) | Completed |

## Dependencies

- **blockedBy:** none. Plan `260715-1608-tier1-followup-orphan-semantics-union-driver` is completed; validator exits 0 on the live union as of 2026-07-15.
- **blocks:** none. No downstream plan depends on this.

## Acceptance Criteria

- [x] `.github/workflows/meta-state-refs-check.yml` `on:` block has both `push: branches: [main]` AND `pull_request:` (bare, no path filter).
- [x] Workflow header comment updated to document the dual-trigger behavior and the branch-protection consistency rationale.
- [x] A test PR (or re-pushed branch) shows `meta-state refs check` as a green check in the Checks tab.
- [x] Branch-protection `required_status_checks.contexts: ["meta-state refs check"]` is satisfied on the test PR — i.e., the merge button is enabled (or the check appears as `SUCCESS`, not as `MISSING`).
- [x] `node tools/learning-loop-mastra/scripts/validate-registry-refs.js` continues to exit 0 on the live union (regression gate — pre- and post-change identical).
- [x] No new files in `tools/`; no behavior change to `validate-registry-refs.js`.

## Risks

- **PR HEAD validator fails on a pre-existing orphan not covered by `historical`/`informational` exemption.** The validator currently classifies 72 refs as `historical` (immutable + terminal-source) and 33 as `informational` (terminal/stale), with 0 blocking. Mitigation: pre-check locally before merging the YAML change; the PR HEAD validator reads the same union so the result will match.
- **Path filter decision (NO filter chosen) means the validator runs on every PR.** Cost is ~5s × N PRs; trivial. The alternative (path filter on `meta-state.jsonl`/`change-log.jsonl`) would mirror `meta-state-pr-body-advisory.yml` BUT would re-introduce the bug for PRs that don't touch registry files — exactly the scenario where the check is most useful (catches refs from new finding/rule/loop-design entries).
- **Branch-protection requirement still missing on PRs if GitHub doesn't match the workflow `name:` to the `contexts` entry.** Mitigation: the test PR will confirm; if it doesn't match, fall back to using the job name (`refs-check`) in the branch-protection `contexts` (or move to the `checks` array with `app_id`). Recorded as a downstream task if encountered.

## Out of Scope

- Renaming the workflow or job to align with branch-protection context expectations.
- Changing `strict: true` semantics or `enforce_admins` (operator decision, not the bug).
- Adding a `concurrency:` block to cancel superseded PR runs (YAGNI — validator is fast and deterministic).
- Switching branch protection from `contexts` (legacy) to `checks` (app_id-based).
- Adding a `pull_request.paths` filter.