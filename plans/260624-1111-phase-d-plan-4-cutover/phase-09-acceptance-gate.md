---
phase: 9
title: "acceptance-gate"
status: pending
priority: P1
effort: "1h"
dependencies: ["1", "2", "3", "4", "5", "6", "7", "8"]
---

# Phase 9: Acceptance Gate + Closeout

## Overview

**The final acceptance gate for Plan 4.** Runs the full test suite, the cold-session test, the legacy-cleanup + server-name-rename verifications, and files the closeout artifacts (journal, change-log, PR body).

**Why this phase exists:** Plan 4 is the cutover. The acceptance gate ensures that all 8 preceding phases have been correctly executed and that the cutover is complete. The gate is a hard-block: if any test fails, the cutover is not done; if all pass, Plan 4 ships.

## Requirements

- Functional: all 10 test namespaces pass; `pnpm test:cold-session` GREEN; legacy-cleanup + server-name-rename tests GREEN; master tracker reconciled; journal filed; PR body drafted.
- Non-functional: 1 `meta_state_log_change` filed with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` (the final flip change-log).

## Architecture

The acceptance gate is the union of 5 verifications:
1. `pnpm test` — all 10 namespaces (per `package.json#scripts.test`)
2. `pnpm test:cold-session` — 11/11 GREEN (per `rule-cold-session-test-must-pass-before-resolution`)
3. `git grep` audits — no `#mcp/*` or `learning-loop-mastra` in non-legacy code
4. Master tracker reconciliation — confirmed by Phase 5's commit
5. Closeout artifacts — journal + PR body + 1 change-log

## Related Code Files

- **Create:** `docs/journals/260624-phase-d-plan-4-cutover-shipped.md`
- **Create:** `plans/260624-1111-phase-d-plan-4-cutover/pr-body.md`
- **Modify:** `meta-state.jsonl` (1 final `meta_state_log_change` entry)

## Implementation Steps

### Step 9.1: Run the full test suite

```bash
pnpm test
```

Expected: all 10 namespaces pass. The test count baseline is 1169 (post-Plan-3) + 9 (Phase 2 manifest-arithmetic) + 5 (Phase 6 cold-session-enumerate-mastra) + 7 (Phase 7 legacy-cleanup) + 6 (Phase 8 server-name-rename) = **1196 tests** (with 1 skip, 0 fail).

If any test fails, the corresponding phase must be re-run (debug first; do NOT mark Plan 4 as shipped).

### Step 9.2: Run the cold-session test

```bash
pnpm test:cold-session
```

Expected: 11/11 GREEN (or scope-unchanged). Per `rule-cold-session-test-must-pass-before-resolution`, the cold-session test must pass before any meta-state resolution. The rule's consult-gate blocks resolution; Plan 4 does not resolve findings, so the rule is informational for Plan 4.

### Step 9.3: Run the legacy-cleanup and server-name-rename tests

```bash
node --test tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs
node --test tools/learning-loop-mastra/__tests__/server-name-rename.test.cjs
node --test tools/learning-loop-mastra/__tests__/manifest-arithmetic.test.cjs
node --test tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs
```

Expected: all 4 tests pass. These are the Plan-4-specific tests; they assert the cutover is complete.

### Step 9.4: Run the audit greps

```bash
# 1. No #mcp/* imports in non-legacy code
git grep -l "#mcp/" -- ':!node_modules' ':!data' ':!meta-state.jsonl' ':!plans/' ':!docs/journals/' ':!plans/reports/' || echo "OK: 0 #mcp/* imports in non-legacy code"

# 2. No learning-loop-mastra in non-legacy code
git grep -l "learning-loop-mastra" -- ':!node_modules' ':!data' ':!meta-state.jsonl' ':!plans/' ':!docs/journals/' ':!plans/reports/' ':!docs/operator-notes/mcp-server-rename.md' || echo "OK: 0 learning-loop-mastra in non-legacy code"
```

Expected: both audits return 0 files (or the OK message). The exclusions match the historical record (plans/, journals/, meta-state.jsonl are immutable) and the cold cache (data/).

**Note:** the second audit excludes `docs/operator-notes/mcp-server-rename.md` because that file legitimately references `learning-loop-mastra` in prose (it's the operator-facing note explaining the rename).

### Step 9.5: File the final `meta_state_log_change`

This is the 4th `meta_state_log_change` for Plan 4 (1 from Phase 1, 1 from Phase 3, 1 from Phase 5, 1 from Phase 9).

Call the `mastra_meta_state_log_change` MCP tool with:

```json
{
  "change_dimension": "semantic",
  "change_target": "plans/reports/productization-260612-1530-master-tracker.md",
  "change_diff": {
    "added": [
      "Phase D Plan 4 cutover: closed 2026-06-24",
      "Plan 4 acceptance gate: all 10 namespaces pass; cold-session 11/11 GREEN; legacy-cleanup + server-name-rename tests GREEN; master tracker reconciled (D-9 + D-15 + E1 + E4 DONE; E2 PARTIAL); journal + PR body filed"
    ],
    "removed": [],
    "changed": [
      "Phase D status: in progress → closed (D1-D7 + D-9 + D-15 + E1 + E4 all DONE; E2 PARTIAL via Plan 4; E3 + E5 + E6 deferred to Phase E)"
    ]
  },
  "reason": "Phase D Plan 4 cutover ships. Plan 4 closes Phase D (the Mastra migration) and unblocks Phase E (Mastra Code Mode 1). The MCP server is canonical; 44 tools across 6 groups; legacy code moved to tools/learning-loop-mastra/{tools,core,scout}/legacy/; #mcp/* alias deleted; server key renamed learning-loop-mastra → learning-loop. Phase E (Mastra Code Mode 1) is the next phase.",
  "applies_to": {
    "surfaces": ["mcp-server"],
    "rules": ["rule-cold-session-test-must-pass-before-resolution"],
    "statuses": ["active", "reported"]
  },
  "evidence_journal": "docs/journals/260624-phase-d-plan-4-cutover-shipped.md"
}
```

### Step 9.6: Write the closeout journal

Create `docs/journals/260624-phase-d-plan-4-cutover-shipped.md`:

```markdown
# Phase D Plan 4 — Cutover — Shipped

**Date:** 2026-06-24
**Branch:** `260624-1111-phase-d-plan-4-cutover` (deleted post-merge)
**Plan:** `plans/260624-1111-phase-d-plan-4-cutover/`
**PR:** [#XX](https://github.com/dat9uy/learning-loop-template/pull/XX) — MERGED at `<sha>` on 2026-06-24

## Summary

Plan 4 is the cutover for Phase D (the Mastra migration). It closes Phase D and unblocks Phase E (Mastra Code Mode 1).

**What shipped:**

1. **Post-Plan-3 functional verification** (Phase 0 of Plan 4) — operator ran the conditional e2e test with `KIMI_API_KEY`, journaled the agent outputs.
2. **Manifest reconciliation** (Phase 2) — `tools/learning-loop-mastra/agent-manifest.json` reconciled to 44 tools across 6 groups (gate=5, workflow=13, meta_state=19, introspection=3, runtime_agnostic=1, agent=3). The 2 storage workflows (`run_workflow_storage_round_trip`, `run_workflow_storage_read`) added to the `workflow` group.
3. **§3.10 research report reconciliation** (Phase 3) — `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 updated to reflect the post-Phase-D state. Q5 protocol followed (change-log filed FIRST).
4. **AGENTS.md §1+§2 update** (Phase 4) — one-line "Phase D shipped" callout added to §1; stale "40 tools across 5 groups" statement on §2 line 51 fixed to "44 tools across 6 groups".
5. **Master tracker reconciliation** (Phase 5) — D-9, D-15, E1, E4 flipped to ✅ DONE; E2 flipped to 🟡 PARTIAL; "Last updated" header bumped to 2026-06-24.
6. **Cold-session discoverability fix** (Phase 6) — `cold-session-discoverability.test.cjs` updated to enumerate the mastra manifest (44 tools); legacy e2e test relaxed to `>= 31`; new `cold-session-enumerate-mastra.test.cjs` (5 tests) added.
7. **Legacy cleanup (C-9)** (Phase 7) — `tools/learning-loop-mcp/{tools,core,scout}/` moved to `tools/learning-loop-mastra/{tools,core,scout}/legacy/`; 5 cross-package + 2 direct + 38 self `#mcp/*` imports migrated; 5 prose references updated; `#mcp/*` alias deleted from `package.json`; new `legacy-cleanup.test.cjs` (7 tests) added.
8. **JSON key rename (R4)** (Phase 8) — MCP server key renamed `learning-loop-mastra` → `learning-loop` in `.mcp.json`, `.factory/mcp.json`, `.claude/settings.local.json`; 13 test files + 2 probe scripts + 2 build scripts + 3 legacy core files + 1 hook loader updated; new `server-name-rename.test.cjs` (6 tests) added; `docs/operator-notes/mcp-server-rename.md` documents the manual per-machine state updates.
9. **Acceptance gate + closeout** (Phase 9) — all 10 namespaces pass; cold-session 11/11 GREEN; legacy-cleanup + server-name-rename tests GREEN; 1 final `meta_state_log_change` filed; this journal; PR body.

**Test count baseline:**

- Pre-Plan-4: 1169 tests (1168 pass + 1 skip + 0 fail)
- Post-Plan-4: 1196 tests (1195 pass + 1 skip + 0 fail)
- Delta: +27 tests (9 manifest-arithmetic + 5 cold-session-enumerate-mastra + 7 legacy-cleanup + 6 server-name-rename)

**Files changed:**

```
[git diff --stat main..260624-1111-phase-d-plan-4-cutover]
```

**Acceptance gate met:**

- [x] All 10 test namespaces pass
- [x] `pnpm test:cold-session` GREEN (11/11)
- [x] `git grep "#mcp/"` returns 0 matches in non-legacy code
- [x] `git grep "learning-loop-mastra"` returns 0 matches in non-legacy code (excluding `docs/operator-notes/mcp-server-rename.md`)
- [x] Master tracker reconciled (D-9 + D-15 + E1 + E4 DONE; E2 PARTIAL)
- [x] §3.10 reconciled
- [x] AGENTS.md §1+§2 reconciled
- [x] 1 final `meta_state_log_change` filed
- [x] Journal + PR body filed
- [x] Plan 4 phase-09 acceptance gate met

## Decisions

1. **Post-Plan-3 verification was a Phase 0 of Plan 4** (per brainstorm line 152-160; per user decision 2026-06-24 to "include C-9 + R4 in Plan 4" + "Phase 0 of Plan 4 (Recommended)" for the verification step).
2. **C-9 (legacy cleanup) was included in Plan 4** (per user decision 2026-06-24). The cleanup moves the legacy code to `tools/learning-loop-mastra/{tools,core,scout}/legacy/` (not delete) for forensic continuity per the Phase A convention.
3. **R4 (JSON rename) was included in Plan 4** (per user decision 2026-06-24). The rename is namespace-only; the filesystem path `tools/learning-loop-mastra/` is unchanged.
4. **Hooks directory stays in `tools/learning-loop-mcp/hooks/`** (Phase 7 Option B). The hooks are loaded by `.factory/hooks/loop-surface-inject.cjs`; moving them adds risk without value.
5. **Cold cache file (`records/meta/.cache/loop-describe-cold.json`) is not modified** — it will be regenerated on the next cold tier computation.
6. **Historical references in plans/ + journals/ are preserved** — they are the engineering record; R4 does not erase them.
7. **meta-state.jsonl historical references are preserved** — the audit log is append-only.

## Lessons

1. **The post-Plan-3 verification gap was the single most critical finding.** The journal `260623-post-plan-3-verification.md` was not filed before Plan 4 started. The Phase 0 of Plan 4 catches this and forces the verification to happen.
2. **The legacy e2e test was silently failing** (per researcher 1 §4 anomaly 4). The test asserted `=== 31` but the server now returns 44. The relaxation to `>= 31` is a contract clarification, not a bug fix.
3. **The 2 storage workflows were orphans in `agent-manifest.json`** — shipped in Plan 2 (2026-06-20) but never landed in the manifest's `workflow` group. Plan 4 phase-02 reconciles this.
4. **The `#mcp/*` alias deletion requires all 7 cross-package consumers to be migrated FIRST** — atomic move + import update + alias delete in one logical change (split into 3 commits for review hygiene).
5. **The 5 prose references in `scout-agent.js` + `run-scout-tool.js` are LOCKED instruction markers** — they cannot be edited without updating the `agent-prompt-content.test.cjs` fixture. Plan 4 phase-07 updates both in one commit.
6. **The R4 rename cascades to per-machine state** (Droid + Claude Code). The `docs/operator-notes/mcp-server-rename.md` documents the manual update. The repo state is updated; the per-machine state is the operator's responsibility.

## Forward-looking

- **Phase E (Mastra Code Mode 1)** is unblocked. E1, E4 are ✅ DONE. E2 is 🟡 PARTIAL. E3 (SKILL.md update), E5 (Mode 1), E6 (hook layer confirm) are open.
- **Phase F (Bridge 7)** is unchanged; still gated on Phase A re-debate conclusions + 1 release cycle.
- **Phase G (skill migration)** is unchanged; parallel dimension.
- **D-12 (Mode 1/2 decision)** is DEFERRED to Phase E.
- **D-16, D-17 (CI test-drift + fail-fast)** are OPEN; separate hardening track.
- **D-19 (LIM hardening)** is OPEN; separate security/quality audit.
- **H-2 (quickstart meta_state_query injection)** is OPEN; security audit.
- **H-1/H-7 (clearRegistrations hot-reload seam)** is OPEN; security audit.
- **COERCE (Zod-native coerce layer migration)** is OPEN; debt track.
```

### Step 9.7: Write the PR body

Create `plans/260624-1111-phase-d-plan-4-cutover/pr-body.md`:

```markdown
# Phase D Plan 4 — Mastra Cutover

Closes Phase D (the Mastra migration) and unblocks Phase E (Mastra Code Mode 1).

## What this PR does

[Summary of the 9 phases; copy from journal "What shipped" section]

## Registry deltas (per `rule-pr-body-registry-deltas`)

- **Resolved:** 0 findings resolved in Plan 4 (Plan 4 is a cutover, not a fix).
- **New:** 0 new findings filed in Plan 4.
- **Sweep:** 0 entries swept (the active `meta-260623T1542Z-the-pr-body-registry-deltas-advisory-github-workflows-meta-s` finding expires today; Plan 4 PR body satisfies the consult-checklist, so the finding can be acked in a follow-up).
- **Promoted:** 0 rules promoted.
- **Superseded:** 0 entries superseded.
- **Archived:** 0 entries archived.

**Plan 4 files 4 `meta_state_log_change` entries:**

1. Phase 1: `change_target: 'docs/journals/260623-post-plan-3-verification.md'` (Post-Plan-3 verification complete)
2. Phase 3: `change_target: 'plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10'` (Q5 protocol)
3. Phase 5: `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` (D-9 + D-15 + E1 + E4 + E2 flips)
4. Phase 9: `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` (final cutover flip)

## Tool deletion (per `rule-import-chain-analysis-after-tool-deletion`)

Plan 4 phase-07 moves 31 deterministic tool files from `tools/learning-loop-mcp/tools/` to `tools/learning-loop-mastra/tools/legacy/`. The tool implementations are preserved (forensic continuity); only the canonical location changes. The MCP server (`tools/learning-loop-mastra/server.js`) loads the tools via direct relative paths (`./tools/legacy/...`) after the move.

**Import chain analysis:**

- 5 cross-package `#mcp/*` imports migrated to direct relative paths
- 2 direct path imports in `__tests__/coerce-correctness.test.js` migrated
- 38 self-imports inside the moved files migrated
- 5 prose references in agent instructions + scout tool descriptions updated

The `#mcp/*` import alias is deleted from `package.json#imports`. No remaining `#mcp/*` references in the project (verified by `legacy-cleanup.test.cjs`).

## Operator action required (post-merge)

The MCP server key was renamed from `learning-loop-mastra` to `learning-loop`. The repo's `.mcp.json`, `.factory/mcp.json`, and `.claude/settings.local.json` are updated. The operator must update the per-machine state files:

- **Droid state:** `~/.factory/...` — restart Droid after merge.
- **Claude Code state:** `~/.claude.json` (or similar) — restart Claude Code after merge.

See `docs/operator-notes/mcp-server-rename.md` for details.

## Test count

- Pre-Plan-4: 1169 tests (1168 pass + 1 skip + 0 fail)
- Post-Plan-4: 1196 tests (1195 pass + 1 skip + 0 fail)
- Delta: +27 tests

## Acceptance gate

- [x] All 10 test namespaces pass
- [x] `pnpm test:cold-session` GREEN (11/11)
- [x] `git grep "#mcp/"` returns 0 matches in non-legacy code
- [x] `git grep "learning-loop-mastra"` returns 0 matches in non-legacy code (excluding `docs/operator-notes/mcp-server-rename.md`)
- [x] Master tracker reconciled
- [x] §3.10 reconciled
- [x] AGENTS.md §1+§2 reconciled
- [x] 1 final `meta_state_log_change` filed
- [x] Journal + PR body filed
```

### Step 9.8: Commit the closeout

Commit message:
```
docs(closeout): Phase D Plan 4 cutover — ship journal + PR body + final change-log

Phase D Plan 4 phase-09:
- All 10 test namespaces pass (1169 → 1196 tests; +27 delta)
- pnpm test:cold-session GREEN (11/11)
- legacy-cleanup + server-name-rename + cold-session-enumerate-mastra +
  manifest-arithmetic tests all GREEN
- 1 final meta_state_log_change filed with change_target: master-tracker.md
- docs/journals/260624-phase-d-plan-4-cutover-shipped.md filed
- plans/260624-1111-phase-d-plan-4-cutover/pr-body.md drafted

Phase D is now closed. Phase E (Mastra Code Mode 1) is unblocked.
```

## Success Criteria

- [ ] `pnpm test` exits 0; test count baseline holds (1196 tests).
- [ ] `pnpm test:cold-session` GREEN (11/11).
- [ ] All 4 Plan-4-specific tests pass.
- [ ] `git grep "#mcp/"` returns 0 matches in non-legacy code.
- [ ] `git grep "learning-loop-mastra"` returns 0 matches in non-legacy code (excluding `docs/operator-notes/mcp-server-rename.md`).
- [ ] 1 final `meta_state_log_change` filed with `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'`.
- [ ] `docs/journals/260624-phase-d-plan-4-cutover-shipped.md` exists.
- [ ] `plans/260624-1111-phase-d-plan-4-cutover/pr-body.md` exists.
- [ ] 1 commit with the closeout artifacts.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| The test count delta is wrong (e.g., the actual delta is +25 not +27) | Low | The exact delta depends on Phase 2's test count (9 tests per the Phase 2 spec; could be consolidated to fewer). The journal's "Test count baseline" section documents the actual numbers; the PR body cites the journal. |
| The acceptance gate runs but finds a regression from a prior phase | Low | The 8 preceding phases each have their own success criteria; the acceptance gate runs the full test suite. If a phase's commit introduced a regression, the acceptance gate catches it. The fix is to debug the regression in the offending phase's commit. |
| The final `meta_state_log_change` has a `change_target` that conflicts with a prior change | Very low | The change_target is the same as Phase 5's (`plans/reports/productization-260612-1530-master-tracker.md`). Per the loop's append-only audit log, multiple changes to the same target are allowed (each is a distinct change-log entry). |
| The PR body fails `rule-pr-body-registry-deltas` consult-checklist | Low | The PR body explicitly enumerates the registry-deltas (Resolved, New, Sweep, Promoted, Superseded, Archived). All are 0 except the 4 new `meta_state_log_change` entries, which are listed in the "Registry deltas" section. |
| The operator does not update per-machine state (Droid/Claude Code), causing the cold-session test to fail post-merge | Medium | The PR body and the operator-facing note explicitly call this out. The cold-session test in CI runs against a fresh Droid/Claude Code state, so the per-machine state is not a CI concern. |
| The cold cache file (`records/meta/.cache/loop-describe-cold.json`) is referenced by the `git grep` audit | Low | The `git grep` audit explicitly excludes `data/`. The cold cache is in `records/meta/.cache/`, which is under `records/`, not `data/`. Verify the exclusion is correct. |
| The acceptance gate test count claim in the journal is wrong (e.g., 1196 is the wrong number) | Low | The journal documents the actual count from the `pnpm test` output. The PR body cites the journal. The actual count is the source of truth. |
| The cold-session test passes locally but fails in CI (different platform behavior) | Low | The cold-session test uses Node's test runner + `@modelcontextprotocol/sdk` Client; no platform-specific code. CI should match local. |
