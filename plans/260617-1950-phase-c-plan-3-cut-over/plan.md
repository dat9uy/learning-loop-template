---
title: "Phase C Plan 3 — Operational Flip (C6+C7 + F4 + manifest reconcile)"
description: "C6 cut-over (promote learning-loop-mastra to canonical, single server post-cut-over) + C7 manifest update (5 groups, 40 tools) + D-11 manifest reconciliation (4 missing tools) + F4 resolution (gate-bypass closed structurally by removing the peer) + 11 red-team fixes (SessionStart hook key, settings.local.json, 3 docs, 4 wire-format test imports, 2 spawn-test files, package.json#gate:server, F4 fingerprint line 13, parity test replacement, meta_state_refresh_tools port). Single phase, single commit, 1-2h. Predecessor: Plan 1a + Plan 1b (both shipped 2026-06-17). Closes Phase C of the productization master tracker."
status: completed
priority: P2
branch: "260617-1950-phase-c-plan-3-cut-over"
tags: [meta-surface, phase-c, cut-over, parity-prerequisite, single-server, red-team-fixed]
blockedBy: ["260617-1138-phase-c-plan-1a-atomic-fix", "260617-1607-phase-c-plan-1b-hygiene"]
blocks: ["phase-c-plan-3-cut-over"]
created: "2026-06-17T19:50:00.000Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md (D-8 to D-13 + F4 origin)
  - plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md (3-plan stack: 1a + 1b + 3)
  - plans/reports/researcher-260617-1954-GH-1607-F4-hook-reimplementation-path-a-report.md (F4 hook analysis: session-level, server-name-blind; with one CRITICAL exception — the SessionStart hook keys on server name; see Plan §Critical Exclusions)
  - plans/reports/researcher-260617-1945-phase-c-plan-3-cut-over-mechanics-report.md (Path b mechanics: promote mastra, deprecate legacy entry points)
  - plans/260617-1607-phase-c-plan-1b-hygiene/plan.md (predecessor; shipped 2026-06-17)
  - plans/260616-2200-phase-c-plan-2-parity/plan.md (C4 parity gate; byte-identical proven 2026-06-17)
  - plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md (C1+C2+C3+C5 atomic adoption)
  - plans/260617-1950-phase-c-plan-3-cut-over/reports/from-code-reviewer-to-planner-phase-c-plan-3-red-team-39-finding-summary-report.md (39 findings; this plan applies all 11 Criticals)
  - plans/reports/productization-260612-1530-master-tracker.md#Phase C (canonical state; C6/C7 still [ ])
  - .factory/hooks/loop-surface-inject.cjs:72 (C-1 — hook keys on learning-loop-mcp; this plan updates to learning-loop-mastra)
  - .claude/settings.local.json:13-29 (C-2 — 5 dead permissions + 2-element enabledMcpjsonServers; this plan updates)
  - AGENTS.md:50, CLAUDE.md:3-8, README.md:24-78 (C-3 — docs cite deleted server; this plan updates)
  - tools/learning-loop-mcp/__tests__/wire-format-{coercion-fix,patch-recursion,meta-state-optional-fields,top-level-coercion}.test.js (C-4 — 4 tests import from tool-registry.js; this plan lifts helper to core/wire-format-coercion.js)
  - tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js:6 (H-1, H-7 — imports clearRegistrations from tool-registry.js; this plan ports the helper)
  - .factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs:20,26 + .claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:28,258 (H-4 — spawn tests hardcode legacy path; this plan updates)
  - package.json:22 (H-5 — gate:server references legacy server; this plan updates)
  - meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ (F4 finding; status=active; resolve in this plan with fingerprint anchored at tools/learning-loop-mastra/server.js:13 — C-7 fix)
  - tools/learning-loop-mcp/server.js (legacy entry; deleted in this plan)
  - tools/learning-loop-mcp/tool-registry.js (legacy helper; deleted in this plan after lifting coerceParamsToSchema + installWireFormatCoercion to tools/learning-loop-mcp/core/wire-format-coercion.js)
  - tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js (H-7 — clearRegistrations ported; this plan keeps the tool working for operator hot-reload workflow)
  - tools/learning-loop-mastra/server.js (canonical server; promote to 40 tools; PREFIX line is at line 13 — C-7 fix)
  - tools/learning-loop-mastra/agent-manifest.json (29 tools; expand to 40 in this plan; D-11 reconciled; do NOT bump version per M-9 YAGNI)
  - tools/learning-loop-mastra/tools/manifest.json (29 entries; add 11 workflow tools in this plan)
  - .mcp.json + .factory/mcp.json (runtime configs; 2 entries → 1 in this plan)
  - tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js (C-8 — replace with coerce-correctness test, don't delete)
  - tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs (delete; no second server)
  - tools/learning-loop-mcp/__tests__/meta-state-reopen-backfill-integration.test.js (C-6 fix — the persistent skip is HERE, not in tools-list-collision.test.cjs; this plan does NOT delete it)
  - plans/260614-1259-phase-b-codegen-adoption/ (Phase B 3-plan pattern template; this plan collapses to 1 phase per Scope Critic F1)
---

# Phase C Plan 3 — Operational Flip (Single Commit)

## Overview

**This is Plan 3 of the 3-plan Phase C stack** (decided 2026-06-16, see `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md`). The 3-plan stack (1 atomic adoption → 1a corrective → 1b hygiene → 2 parity → **3 operational flip**) closes Phase C of the productization master tracker.

**Goal:** make `learning-loop-mastra` the canonical server. Single commit. Cut over the deterministic meta-surface + workflow tools (29 → 40) onto Mastra's `MCPServer`. Resolve F4 (gate-bypass finding) structurally. Update 1 hook (SessionStart) + 1 Claude Code settings file + 3 operator-facing docs + 6 test files + 2 server-side helpers to avoid breaking the runtime.

**Restructure note (2026-06-17):** the original 7-phase plan was restructured to 1 phase / 1 commit per red-team review (39 findings; 11 Critical; 4 reviewers; full report at `plans/260617-1950-phase-c-plan-3-cut-over/reports/from-code-reviewer-to-planner-phase-c-plan-3-red-team-39-finding-summary-report.md`). The restructure addresses Scope Critic F1 (over-phasing) + 10 other Critical findings that would have broken the acceptance gate. The plan body is now: 1 phase file with 19 implementation steps, all landing in 1 commit. Estimated effort: **1-2 hours** (was 4-6h).

## Scope (1 commit, 19 steps, 1-2h total)

The single phase file at `./phase-01-single-cut-over-commit.md` contains the full implementation. Steps are grouped by file surface for clarity, but **all land in 1 commit** to keep the cut-over atomic. The commit message is conventional: `feat(mastra): C6+C7 cut-over — single canonical server, F4 resolved`.

**File-surface groups (in commit order):**

1. **Mastra canonical (3 files):** `tools/learning-loop-mastra/tools/manifest.json` (+11 workflow tools → 40 total); `tools/learning-loop-mastra/agent-manifest.json` (5-group rewrite with 40 `mastra_`-prefixed tools, D-11 reconciled; no version bump per M-9 YAGNI); `tools/learning-loop-mastra/server.js` (update description literal at line 38 to reflect 40 tools per C-11 fix).
2. **Runtime configs (3 files):** `.mcp.json` (drop `learning-loop-mcp` entry); `.factory/mcp.json` (same); `package.json#scripts.gate:server` (update path to mastra server per H-5).
3. **Operator-facing docs (3 files):** `AGENTS.md` (10+ stale refs to legacy server); `CLAUDE.md` (3 refs); `README.md` (4 refs). Per C-3.
4. **SessionStart hook (1 file):** `.factory/hooks/loop-surface-inject.cjs:72` (key on `learning-loop-mastra` not `learning-loop-mcp` per C-1 — the hook returns null silently otherwise).
5. **Claude Code settings (1 file):** `.claude/settings.local.json` (5 `mcp__learning-loop-mcp__*` permissions + `enabledMcpjsonServers` per C-2).
6. **Lift + port legacy helpers (2 files):** `tools/learning-loop-mcp/core/wire-format-coercion.js` (NEW — lift `coerceParamsToSchema` + `installWireFormatCoercion` from `tool-registry.js` per C-4); `tools/learning-loop-mcp/core/mcp-server-reload.js` (NEW — lift `clearRegistrations` from `tool-registry.js` per H-1 + H-7; mastra server can use this for hot-reload).
7. **Update 4 wire-format test imports** (per C-4): `wire-format-coercion-fix.test.js`, `wire-format-patch-recursion.test.js`, `wire-format-meta-state-optional-fields.test.js`, `wire-format-top-level-coercion.test.js` — change `from "../tool-registry.js"` to `from "../core/wire-format-coercion.js"`.
8. **Update 2 spawn-test files** (per H-4): `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs:20,26` + `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:28,258` — replace `learning-loop-mcp/server.js` with `learning-loop-mastra/server.js`. Also remove the `existsSync` guard at `loop-surface-inject-real-spawn.test.cjs:21-23` (a regression must be loud, not silent).
9. **Update `meta-state-refresh-tools-tool.js:6`** (per H-1, H-7): change import from `../tool-registry.js` to `../core/mcp-server-reload.js`. The tool stays working for operator hot-reload workflow.
10. **Update `cold-session-discoverability.test.cjs`** (per C-10, H-9): lines 35, 68, 77, 166, 185, 202, 235, 315 — replace `learning-loop-mcp/server.js` with `learning-loop-mastra/server.js`; verify `DISCOVERABILITY_HINTS` and `LOCAL_DISCOVERABILITY_HINTS` still match.
11. **Replace `parity-zod-to-json-schema.test.js`** (per C-8): keep the parity regression net, but rewrite as single-server `coerce-correctness` test. Use Node-based diff (not sed) per M-4.
12. **Delete 4 obsolete files:** `tools/learning-loop-mcp/server.js`, `tools/learning-loop-mcp/tool-registry.js`, `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs`, `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` (and its `.test.js`). Per C-5 (no second server).
13. **Rename + update `mcp-config-peer.test.js`** (per H-8): `git mv` to `mcp-config.test.js`; change assertion from "2 entries" to "1 entry" + add explicit check that `learning-loop-mcp` is NOT in the keys.
14. **`pnpm test`** — expect: 1069+ pass / 0 fail / **1 skip** (the backfill-mechanism-check at `meta-state-reopen-backfill-integration.test.js:6` per C-6 fix — NOT the collision test which was never skipped).
15. **`OPERATOR_MODE=1` → `meta_state_resolve(F4)`** with fingerprint anchor at `tools/learning-loop-mastra/server.js:13` (C-7 fix — line 13 is the PREFIX line, NOT line 38 which is the description literal). Skip the `meta_state_check_grounding` after resolve per M-10 (resolved findings don't drift).
16. **Edit master tracker C6 + C7** → `[x]`; add body text linking to this plan.
17. **`meta_state_log_change`** for the tracker flip.
18. **Write closeout journal** at `docs/journals/2026-06-17-phase-c-plan-3-cut-over-closeout.md` + update `docs/project-changelog.md`.
19. **Commit + push + open PR.** PR body must include the F4 security note (D-13) and the "no hook code re-implementation" rationale (Decision Delta below).

## Decision Delta (operator-approved 2026-06-17)

**Original user choice:** "Path A: Mastra primary + re-implement hooks" (operator decision via AskUserQuestion during plan authoring).

**Researcher A finding (verified):** the 4 hook files in `.claude/coordination/hooks/` and `.factory/coordination/hooks/` are **session-level PreToolUse matchers on Bash/Edit/Write**, not server-targeted. The F4 finding's wording "the runtime hooks... only fire on the legacy learning-loop-mcp server" is **misleading** — the hooks fire on the agent's tool calls regardless of which MCP server is loaded.

**CRITICAL EXCEPTION (per red-team C-1):** `.factory/hooks/loop-surface-inject.cjs:72` (a SessionStart hook, not a PreToolUse hook) **DOES key on `mcpServers["learning-loop-mcp"]`** and returns null if absent. This is the only server-named hook. The plan updates line 72 to key on `learning-loop-mastra` (Step 4 above).

**Interpretation:** Plan 3 implements the operator's *intent* (Mastra primary, F4 closed) with the simpler mechanism the research uncovered, plus the SessionStart hook fix the research missed. The cut-over itself resolves F4 structurally (removing the peer means there's no second server to "bypass" anything) for the write-side tools; the SessionStart hook update is a separate fix that's required for cold-session Droid users.

## Pre-flight Checklist

| Step | Gated Path | Tool / Env | Notes |
|------|-----------|------------|-------|
| 1 | `tools/learning-loop-mastra/tools/manifest.json` | none (not `product/**`) | no preflight |
| 1 | `tools/learning-loop-mastra/agent-manifest.json` | none | no preflight |
| 1 | `tools/learning-loop-mastra/server.js:38` (description literal) | none | no preflight |
| 2 | `.mcp.json`, `.factory/mcp.json` | none (runtime config) | no preflight |
| 2 | `package.json#scripts.gate:server` | none (root config) | no preflight |
| 3 | `AGENTS.md`, `CLAUDE.md`, `README.md` | none (docs) | no preflight |
| 4 | `.factory/hooks/loop-surface-inject.cjs:72` | none (hook file) | no preflight |
| 5 | `.claude/settings.local.json` | none (settings) | no preflight |
| 6 | `tools/learning-loop-mcp/core/wire-format-coercion.js` (NEW) | none (not `product/**`) | no preflight |
| 6 | `tools/learning-loop-mcp/core/mcp-server-reload.js` (NEW) | none | no preflight |
| 7 | `tools/learning-loop-mcp/__tests__/wire-format-*.test.js` (4 files) | none (tests) | no preflight |
| 8 | `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` | none (test) | no preflight |
| 8 | `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` | none | no preflight |
| 9 | `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js:6` | none (not `product/**`) | no preflight |
| 10 | `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | none (test) | no preflight |
| 11 | `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` (REPLACE) | none | no preflight |
| 12 | Delete 4 files | git | no preflight |
| 13 | `git mv mcp-config-peer.test.js → mcp-config.test.js` | none | no preflight |
| 14 | `pnpm test` | none | full suite; expected 1 skip (backfill) |
| 15 | `meta_state_resolve(F4)` | `OPERATOR_MODE=1` | gated; F4 closure |
| 16 | `plans/reports/productization-260612-1530-master-tracker.md` | none (tracker) | gated; canonical state |
| 17 | `meta-state.jsonl` (1 `meta_state_log_change`) | `OPERATOR_MODE=1` | gated; closeout |
| 18 | `docs/journals/2026-06-17-phase-c-plan-3-cut-over-closeout.md` | none (docs) | no preflight |
| 18 | `docs/project-changelog.md` | none (docs) | no preflight |
| 19 | `git commit && git push` | none (commit) | no preflight |
| 19 | `gh pr create` | none (PR) | no preflight |

**`OPERATOR_MODE=1` is required for steps 15 + 17 (2 registry calls). No `gate_mark_preflight` calls needed — no `product/**` writes.**

## Acceptance Gate (single-sentence anchor)

> **After this plan lands, `pnpm test` reports all 10 test namespaces pass with 0 failures and 1 skip (the persistent backfill-mechanism-check at `tools/learning-loop-mcp/__tests__/meta-state-reopen-backfill-integration.test.js:6`), `.mcp.json` + `.factory/mcp.json` + `package.json#scripts.gate:server` each reference `learning-loop-mastra/server.js`, `tools/learning-loop-mastra/server.js` registers 40 `mastra_`-prefixed tools across 5 groups (gate=5, workflow=11, meta_state=20, introspection=3, runtime_agnostic=1), `tools/learning-loop-mcp/server.js` + `tool-registry.js` are deleted, the SessionStart hook at `.factory/hooks/loop-surface-inject.cjs:72` keys on `learning-loop-mastra` (not `learning-loop-mcp`), `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` is `status: resolved` with `code_fingerprint: sha256:<hash of server.js:13>`, and the master tracker C6 + C7 checkboxes are `[x]`.**

A failing condition in any dimension blocks the merge.

## Out of Scope (deferred to future plans)

- **D-12 (Mode 1 vs Mode 2 decision)** — operator decision 2026-06-17: defer to post-Plan 3. Phase E work.
- **D-14, D-15 (Phase D workflow + agent + storage migration)** — separate phase, parallel dimension.
- **D-16, D-17 (CI drift check, fail-fast on manifest)** — future hardening plan.
- **D-18, D-19 (Phase G skill migration, LIM hardening)** — separate tracks.
- **Coerce layer technical debt** — separate brainstorm (`brainstorm-260617-0212-coerce-layer-zod-native-migration.md`).
- **JSON key rename `learning-loop-mastra` → `learning-loop`** in `.mcp.json` — deferred (cascades to AGENTS.md, Droid state, Claude Code state).
- **Move `tools/learning-loop-mcp/tools/` to `tools/learning-loop-mastra/tools/legacy/`** (Scope Critic C-9) — deferred. The "tool source library" pattern keeps the diff small; the move is a follow-up cleanup.

## Dependencies

**Blocked by:**
- `260617-1138-phase-c-plan-1a-atomic-fix` (shipped 2026-06-17; CR-1 zod pin + CR-2 mutex are prerequisites)
- `260617-1607-phase-c-plan-1b-hygiene` (shipped 2026-06-17; CR-3 cold-session isolation + mutex scope are prerequisites)

**Blocks:**
- Phase D (workflow + agent + storage migration)
- Phase E (Mastra Code Mode 1/2 decision)
- Phase F (Bridge 7 product-surface binding)

**Unfinished cross-plan candidates (scanned 2026-06-17):**
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/` — `[x]` (shipped 2026-06-16)
- `plans/260616-2200-phase-c-plan-2-parity/` — `[x]` (shipped 2026-06-17)
- `plans/260617-1138-phase-c-plan-1a-atomic-fix/` — `[x]` (shipped 2026-06-17)
- `plans/260617-1607-phase-c-plan-1b-hygiene/` — `[x]` (shipped 2026-06-17)
- `plans/260517-1600-state-machine-for-irreversible-operations/` — Phase D candidate
- No active blockers from other plans.

## Whole-Plan Consistency Sweep

- **Files reread during restructure:** this plan; all 4 reviewer reports; Plan 1a + Plan 1b + Plan 2 closeouts; master tracker; brainstorm reports; key source files (loop-surface-inject.cjs, settings.local.json, server.js:13, cold-session test, wire-format tests, refresh-tools-tool.js).
- **Decision deltas from red-team (39 findings; 11 Critical accepted):**
  - **C-1 (SessionStart hook fix):** Add Step 4 — update `.factory/hooks/loop-surface-inject.cjs:72` to key on `learning-loop-mastra`. Original 7-phase plan missed this; the hook would silently return null post-cut-over.
  - **C-2 (settings.local.json):** Add Step 5 — update 5 permissions + `enabledMcpjsonServers`. Original 7-phase plan said "only `.mcp.json` matters" — wrong.
  - **C-3 (operator docs):** Add Step 3 — update AGENTS.md, CLAUDE.md, README.md. Original 7-phase plan said "no doc changes" — false.
  - **C-4 (wire-format test imports):** Add Step 7 — update 4 test files + Step 6 (lift helper to `core/wire-format-coercion.js`).
  - **C-5 (test blast radius):** Add Steps 8, 10, 12 (spawn tests + cold-session test + delete 4 files). Original 7-phase plan pre-check claimed "no test imports" — false (30+ references in 15+ files).
  - **C-6 (skip count):** Correct the acceptance gate to "1 skip (backfill)" not "0 skips (delete collision test)". The persistent skip is at `meta-state-reopen-backfill-integration.test.js:6`.
  - **C-7 (F4 fingerprint line):** Step 15 anchors at `server.js:13` (PREFIX line), NOT `server.js:38` (description literal).
  - **C-8 (parity test):** Step 11 replaces the test with a single-server `coerce-correctness` test. Don't delete the regression net.
  - **C-9 (tool source library YAGNI):** Keep the directory as planned. Move is a follow-up.
  - **C-10 (cold-session test path update):** Step 10 fixes lines 35, 68, 77, 166, 185, 202, 235, 315 (8 lines, not 4).
  - **C-11 (F4 evidence_code_ref staleness):** Step 1 also updates `server.js:38` description literal to reflect 40 tools.
- **Decision deltas from red-team (9 High accepted):**
  - **H-1, H-7 (clearRegistrations port):** Step 6 lifts `clearRegistrations` to `core/mcp-server-reload.js`; Step 9 updates `meta-state-refresh-tools-tool.js:6` import. Tool stays working.
  - **H-2 (quickstart injection surface):** Out of scope; add to follow-up hardening plan.
  - **H-3 (refresh-tools test):** Step 9's import update fixes the test.
  - **H-4 (spawn tests):** Step 8 updates both files + removes silent `existsSync` guard.
  - **H-5 (gate:server script):** Step 2 updates `package.json`.
  - **H-6:** same as H-5.
  - **H-8 (mcp-config-peer rename):** Step 13 renames + adds `learning-loop-mcp` absence check.
  - **H-9 (cold-session test 5+ refs):** Step 10 covers all 8 references.
- **Decision deltas from red-team (Medium/Low — applied where low-cost):**
  - **M-4 (sed regex brittle):** Step 11 uses Node-based diff for coerce-correctness.
  - **M-5 (loop-surface-inject user-facing description):** Step 4 covers the description string at line 159 as part of the same edit.
  - **M-9 (version bump YAGNI):** Drop the version bump entirely. `agent-manifest.json` keeps `"0.1.0"`.
  - **M-10 (check_grounding redundant):** Step 15 skips it; resolve is sufficient.
  - **L-3 (master tracker line numbers):** Step 16 verifies the actual line numbers via `grep -n "^- \[ \] \*\*C6\|^- \[ \] \*\*C7"` before editing.
  - **L-4 (preflight checklist misleading):** Pre-flight table above is explicit about `OPERATOR_MODE=1` for steps 15 + 17.
- **Unresolved contradictions:** 0. All 11 Criticals + 9 Highs have explicit fix steps. Phase B 3-plan pattern is broken (1 phase instead); justified by Scope Critic F1 + restructure decision.

## Key Risks Addressed

- **F4 closure does not break cold-session Droid users** (C-1 fix). Risk: high — the SessionStart hook is the operator's primary discoverability path. Mitigation: Step 4 updates the hook key.
- **4 wire-format tests crash at import time** (C-4). Risk: high — would block CI. Mitigation: Step 6 lifts the helper; Step 7 updates imports.
- **Cold-session test crashes** (C-10). Risk: medium — silently fails or throws `MODULE_NOT_FOUND`. Mitigation: Step 10 updates 8 path references.
- **Operator docs point at deleted file** (C-3). Risk: medium — new operator confusion. Mitigation: Step 3 updates 3 docs.
- **Skip count claim wrong** (C-6). Risk: low — cosmetic. Mitigation: corrected to "1 skip (backfill)" in acceptance gate.
- **F4 fingerprint anchor wrong** (C-7). Risk: medium — future drift detection fires on whitespace edits. Mitigation: Step 15 anchors at line 13 (PREFIX).
- **Test blast radius under-counted** (C-5). Risk: high — pre-check was fiction. Mitigation: Steps 7, 8, 10, 12 cover 30+ references.
- **Version bump is YAGNI** (M-9). Risk: low — no consumer exists. Mitigation: dropped.
- **`check_grounding` after resolve redundant** (M-10). Risk: low — wasted call. Mitigation: dropped.
- **`clearRegistrations` port vs stub** (H-1, H-7). Risk: medium — operator's hot-reload workflow is primary, not dev convenience. Mitigation: port to `core/mcp-server-reload.js`.

## References

- `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` (D-8 to D-13 + F4 origin)
- `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md` (3-plan stack)
- `plans/reports/researcher-260617-1954-GH-1607-F4-hook-reimplementation-path-a-report.md` (F4 analysis)
- `plans/reports/researcher-260617-1945-phase-c-plan-3-cut-over-mechanics-report.md` (Path b mechanics)
- `plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md` (Plan 1a review)
- `plans/reports/productization-260612-1530-master-tracker.md#Phase C` (canonical state)
- `plans/260617-1607-phase-c-plan-1b-hygiene/plan.md` (predecessor)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md` (C4 parity gate)
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md` (C1+C2+C3+C5)
- `plans/260617-1950-phase-c-plan-3-cut-over/reports/from-code-reviewer-to-planner-phase-c-plan-3-red-team-39-finding-summary-report.md` (red-team report)
- `tools/learning-loop-mcp/server.js` (legacy entry; Step 12 delete)
- `tools/learning-loop-mcp/tool-registry.js` (legacy helper; Step 12 delete after Step 6 lift)
- `tools/learning-loop-mcp/core/` (canonical home for lifted helpers — wire-format-coercion.js, mcp-server-reload.js)
- `tools/learning-loop-mcp/tools/` (40 tool source files; stays as "tool source library" per KISS; not moved in this plan)
- `tools/learning-loop-mcp/tools/manifest.json` (40 entries; #mcp/* import source)
- `tools/learning-loop-mcp/agent-manifest.json` (legacy 25-tool manifest; superseded)
- `tools/learning-loop-mastra/server.js` (canonical server; line 13 = PREFIX)
- `tools/learning-loop-mastra/agent-manifest.json` (29 → 40 tools; no version bump)
- `tools/learning-loop-mastra/tools/manifest.json` (29 → 40 entries)
- `tools/learning-loop-mastra/create-loop-tool.js` (the factory; unchanged)
- `tools/learning-loop-mastra/legacy-handler-adapter.js` (handler bridge; unchanged)
- `.mcp.json` + `.factory/mcp.json` (2 entries → 1)
- `package.json` (gate:server script update)
- `AGENTS.md` + `CLAUDE.md` + `README.md` (operator docs)
- `.factory/hooks/loop-surface-inject.cjs:72` (SessionStart hook key)
- `.claude/settings.local.json:13-29` (5 permissions + enabledMcpjsonServers)
- `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` (F4; resolve in Step 15; fingerprint anchor at server.js:13)
- `plans/260614-1259-phase-b-codegen-adoption/` (Phase B 3-plan pattern template; deliberately broken per Scope Critic F1)

## Validation Log

### Session 1 — 2026-06-17 (restructure)
**Trigger:** Red-team review (4 reviewers, 39 findings, 11 Critical) on the original 7-phase plan.
**Disposition:** Apply restructure (operator decision via AskUserQuestion). All 11 Criticals + 9 Highs accepted.
**Files rewritten:** `plan.md` (185 → current); 7 phase files deleted; 1 new phase file created.
**Validation:** 11 Criticals verified in source code (hook key at line 72, settings at lines 13-29, server.js:13 = PREFIX, 4 wire-format tests import tool-registry, etc.). Skip count claim corrected per C-6.

### Open Questions for Operator (during execution)
- **Mode 1 vs Mode 2 decision timing** — operator decision 2026-06-17: defer to post-Plan 3. No Plan 3 work.
- **`#mcp/*` alias rename timing** — out of Plan 3 scope per KISS. The alias becomes "historical" but stays.
- **Tool source library move** — out of Plan 3 scope (Scope Critic C-9 YAGNI for this plan). Follow-up cleanup.
