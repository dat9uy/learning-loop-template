---
phase: 1
title: "single-cut-over-commit"
status: pending
priority: P2
effort: "1-2h"
dependencies: ["phase-0-plan-1a-plan-1b-shipped"]
---

# Phase 1: Single Cut-Over Commit

## Overview

**All 19 steps land in 1 commit** (`feat(mastra): C6+C7 cut-over — single canonical server, F4 resolved`). Steps are grouped by file surface for clarity, but the commit is atomic — partial state is not a valid intermediate. The cut-over is a single operational action: promote `learning-loop-mastra` to canonical, deprecate legacy entry points, fix the F4 closure gap, close Phase C.

**Pre-check (BEFORE step 1):** run `pnpm test` to confirm the baseline is GREEN with 1 skip (the backfill test). Capture the count for the closeout journal.

## Pre-Check (run first)

```bash
# Baseline: confirm 1069+ pass / 0 fail / 1 skip (backfill)
pnpm test
# Expected: "1 skip" — the persistent skip is meta-state-reopen-backfill-integration.test.js:6
#           (NOT tools-list-collision.test.cjs, which is not skipped)
```

If the baseline shows more than 1 skip, STOP and diagnose before continuing.

## Implementation Steps

### Group 1 — Promote mastra to canonical (3 files)

**Step 1.1: Add 11 workflow tools to `tools/learning-loop-mastra/tools/manifest.json`** (29 → 40 entries).

The 11 entries (copy from `tools/learning-loop-mcp/tools/manifest.json` lines 4-14):
```json
{ "file": "./tools/workflow-intake-orient-tool.js", "export": "workflowIntakeOrientTool" },
{ "file": "./tools/workflow-intake-plan-tool.js", "export": "workflowIntakePlanTool" },
{ "file": "./tools/workflow-classify-prompt-tool.js", "export": "workflowClassifyPromptTool" },
{ "file": "./tools/workflow-prepare-runtime-request-tool.js", "export": "workflowPrepareRuntimeRequestTool" },
{ "file": "./tools/workflow-generate-prompt-tool.js", "export": "workflowGeneratePromptTool" },
{ "file": "./tools/workflow-self-improvement-tool.js", "export": "workflowSelfImprovementTool" },
{ "file": "./tools/workflow-intentional-skip-tool.js", "export": "workflowIntentionalSkipTool" },
{ "file": "./tools/workflow-report-phase-status-tool.js", "export": "workflowReportPhaseStatusTool" },
{ "file": "./tools/workflow-runtime-probe-tool.js", "export": "workflowRuntimeProbeTool" },
{ "file": "./tools/notify-artifact-tool.js", "export": "workflowNotifyArtifactTool" },
{ "file": "./tools/trigger-workflow-tool.js", "export": "workflowTriggerTool" }
```

**Step 1.2: Rewrite `tools/learning-loop-mastra/agent-manifest.json`** with 5-group structure (40 tools, all `mastra_`-prefixed, D-11 reconciled). **No version bump** (per M-9 YAGNI — no consumer reads the version; keep `"0.1.0"`).

```json
{
  "version": "0.1.0",
  "server": "learning-loop-mastra",
  "groups": {
    "gate": {
      "description": "Safety checks — call BEFORE any write operation",
      "tools": ["mastra_gate_check", "mastra_gate_check_recurrence", "mastra_gate_mark_preflight", "mastra_gate_override", "mastra_runtime_state_record"],
      "ordering": "mandatory-first",
      "cache_ttl": 0
    },
    "workflow": {
      "description": "Learning-loop workflow orchestration",
      "tools": ["mastra_workflow_intake_orient", "mastra_workflow_intake_plan", "mastra_workflow_classify_prompt", "mastra_workflow_prepare_runtime_request", "mastra_workflow_generate_prompt", "mastra_workflow_self_improvement", "mastra_workflow_intentional_skip", "mastra_workflow_report_phase_status", "mastra_workflow_runtime_probe", "mastra_workflow_notify_artifact", "mastra_workflow_trigger"],
      "ordering": "linear",
      "typical_chain": ["mastra_workflow_intake_orient", "mastra_workflow_intake_plan", "mastra_workflow_notify_artifact"]
    },
    "meta_state": {
      "description": "Meta-state registry for loop self-awareness findings",
      "tools": ["mastra_meta_state_report", "mastra_meta_state_list", "mastra_meta_state_ack", "mastra_meta_state_resolve", "mastra_meta_state_promote_rule", "mastra_meta_state_sweep", "mastra_meta_state_log_change", "mastra_meta_state_patch", "mastra_meta_state_derive_status", "mastra_meta_state_check_grounding", "mastra_meta_state_refresh_fingerprint", "mastra_meta_state_refresh_tools", "mastra_meta_state_query_drift", "mastra_meta_state_batch", "mastra_meta_state_archive", "mastra_meta_state_relationship_validate", "mastra_meta_state_propose_design", "mastra_meta_state_relationships", "mastra_meta_state_re_verify", "mastra_meta_state_supersede"],
      "ordering": "any"
    },
    "introspection": {
      "description": "Discover the loop's operational surface, active rules, and curated instructions",
      "tools": ["mastra_loop_describe", "mastra_loop_get_instruction", "mastra_runtime_state_read"],
      "ordering": "any",
      "typical_chain": ["mastra_loop_describe", "mastra_loop_get_instruction"]
    },
    "runtime_agnostic": {
      "description": "Audit a feature's compliance with the runtime-agnostic pattern (shim-not-fork + cross-surface-iteration). Call when adding a new feature.",
      "tools": ["mastra_check_runtime_agnostic"],
      "ordering": "any"
    }
  },
  "quickstart": {
    "meta_state_query": [
      { "tool": "mastra_loop_describe", "tier": "warm" },
      { "tool": "mastra_meta_state_list", "entry_kind": "finding" },
      { "tool": "mastra_meta_state_query_drift" }
    ]
  }
}
```

**Step 1.3: Update `tools/learning-loop-mastra/server.js:38`** description literal to reflect 40 tools (per C-11 — the F4 evidence_code_ref points here; the literal was "29 deterministic meta-surface tools (workflow tools excluded per Phase D)" — Phase D is not this plan; we are including workflows):

```js
description: "Mastra-based canonical MCP server for the learning loop (Phase C Plan 3). 40 tools (5 gate + 11 workflow + 20 meta_state + 3 introspection + 1 runtime_agnostic) across 5 groups. Single server post-cut-over.",
```

### Group 2 — Runtime configs (3 files)

**Step 2.1: `.mcp.json`** — remove the `learning-loop-mcp` entry. Result:
```json
{
  "mcpServers": {
    "learning-loop-mastra": {
      "command": "node",
      "args": ["tools/learning-loop-mastra/server.js"]
    }
  }
}
```

**Step 2.2: `.factory/mcp.json`** — same edit.

**Step 2.3: `package.json#scripts.gate:server`** — change `"node tools/learning-loop-mcp/server.js"` to `"node tools/learning-loop-mastra/server.js"`.

### Group 3 — Operator-facing docs (3 files)

**Step 3.1: `AGENTS.md:50`** — change `tools/learning-loop-mcp/server.js` to `tools/learning-loop-mastra/server.js`. Update "36 tools" to "40 tools across 5 groups" and reference `tools/learning-loop-mastra/agent-manifest.json` as the canonical.

**Step 3.2: `CLAUDE.md:3,6-8`** — change `tools/learning-loop-mcp/...` paths to `tools/learning-loop-mastra/...`. The `tools/learning-loop-mcp/hooks/{bash,write,inbound}-gate.js` reference at line 7 stays (those hook files remain on disk; the universal hook pattern is unchanged).

**Step 3.3: `README.md:24,48,50,78`** — change `tools/learning-loop-mcp/` to `tools/learning-loop-mastra/` for MCP server references. The "Single source of truth" line at 78 can keep `tools/learning-loop-mcp/core/` (the core lib still lives there).

### Group 4 — SessionStart hook fix (1 file)

**Step 4.1: `.factory/hooks/loop-surface-inject.cjs:72`** — change `mcpCfg.mcpServers && mcpCfg.mcpServers["learning-loop-mcp"]` to `mcpCfg.mcpServers && mcpCfg.mcpServers["learning-loop-mastra"]`. Same fix at line 159's user-facing description string (replace `mcp__learning_loop_mcp__*` with `mcp__learning_loop_mastra__*`).

### Group 5 — Claude Code settings (1 file)

**Step 5.1: `.claude/settings.local.json`** — 2 changes:
- Lines 13-21: rename 5 `mcp__learning-loop-mcp__*` strings to `mcp__learning-loop-mastra__*` (the `meta_state_list`, `meta_state_derive_status`, `meta_state_relationships`, `meta_state_resolve`, `meta_state_log_change` permissions).
- Line 28-29: change `enabledMcpjsonServers: ["learning-loop-mcp", "learning-loop-mastra"]` to `enabledMcpjsonServers: ["learning-loop-mastra"]`.

### Group 6 — Lift + port legacy helpers (2 NEW files)

**Step 6.1: Create `tools/learning-loop-mcp/core/wire-format-coercion.js`** — copy the body of `coerceParamsToSchema` + `installWireFormatCoercion` from `tools/learning-loop-mcp/tool-registry.js:77-235`. Export both functions. Add a header comment: `// Lifted from tool-registry.js for Phase C Plan 3 cut-over. The legacy server.js is deleted; the coercion helpers are reused by 4 wire-format regression tests and (via create-loop-tool.js#wrapSchema) by the mastra factory.`

**Step 6.2: Create `tools/learning-loop-mcp/core/mcp-server-reload.js`** — copy the body of `clearRegistrations` (lines 161-178) from `tools/learning-loop-mcp/tool-registry.js`. Export the function. Add a header comment: `// Lifted from tool-registry.js for Phase C Plan 3 cut-over. Provides the in-process reload seam for meta_state_refresh_tools.`

### Group 7 — Update 4 wire-format test imports

For each of these 4 files, change `from "../tool-registry.js"` (or `import * as toolRegistry from "../tool-registry.js"`) to `from "../core/wire-format-coercion.js"`, AND change function references from `toolRegistry.coerceParamsToSchema` / `toolRegistry.installWireFormatCoercion` to the direct named imports.

- `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js`
- `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js`
- `tools/learning-loop-mcp/__tests__/wire-format-meta-state-optional-fields.test.js`
- `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js`

### Group 8 — Update 2 spawn-test files

**Step 8.1: `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs`** — 3 changes:
- Line 20: replace `tools/learning-loop-mcp/server.js` with `tools/learning-loop-mastra/server.js`.
- Line 26: same.
- **REMOVE the `existsSync` guard at lines 21-23** (per H-4 — a regression must be loud, not silent).

**Step 8.2: `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`** — 2 changes:
- Line 28: replace `tools/learning-loop-mcp/server.js` with `tools/learning-loop-mastra/server.js`.
- Line 258: same (in `evidence_code_ref` string).

### Group 9 — Update meta-state-refresh-tools-tool.js

**Step 9.1: `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js:6`** — change `import * as toolRegistry from "../tool-registry.js"` to `import * as serverReload from "../core/mcp-server-reload.js"`. Update function references at line 57: `const clearRegistrations = _deps?.clearRegistrations ?? serverReload.clearRegistrations;`.

### Group 10 — Update cold-session test

**Step 10.1: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`** — replace `tools/learning-loop-mcp/server.js` with `tools/learning-loop-mastra/server.js` at 8 lines: 35, 68, 77, 166, 185, 202, 235, 315. (The 11 references in `core/` and other sub-paths stay; only the `server.js` references change.)

Verify `DISCOVERABILITY_HINTS` and `LOCAL_DISCOVERABILITY_HINTS` still match:
```bash
diff <(node -e "const m = require('fs').readFileSync('tools/learning-loop-mcp/core/loop-introspect.js', 'utf8'); console.log(m.match(/const DISCOVERABILITY_HINTS = Object\.freeze\(\[([\s\S]*?)\]\);/)[1])") \
     <(node -e "const m = require('fs').readFileSync('.factory/hooks/loop-surface-inject.cjs', 'utf8'); console.log(m.match(/const LOCAL_DISCOVERABILITY_HINTS = Object\.freeze\(\[([\s\S]*?)\]\);/)[1])")
```
Expect: empty diff.

### Group 11 — Replace parity test

**Step 11.1: `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js`** — rewrite as single-server `coerce-correctness.test.js`. Use Node-based assertions (not sed) per M-4. The new test:
1. Imports `coerceScalar` from `create-loop-tool.js`.
2. For each of 6 wire-format cases (string→bool, string→number, JSON string→array, `{item: [...]}` envelope unwrap, etc.), asserts the coercion output matches the expected shape.
3. No second server required; no parity comparison (the parity proof was the 2026-06-17 byte-identical run, captured in Plan 2's closeout).

Keep the file path `parity-zod-to-json-schema.test.js` to avoid renaming another file (per KISS). Update the test name + comments to reflect the new contract.

### Group 12 — Delete 4 obsolete files

```bash
git rm tools/learning-loop-mcp/server.js
git rm tools/learning-loop-mcp/tool-registry.js
git rm tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs
git rm tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js
git rm tools/learning-loop-mastra/__tests__/with-both-mcp-servers.test.js
```

### Group 13 — Rename + update mcp-config test

**Step 13.1:**
```bash
git mv tools/learning-loop-mastra/__tests__/mcp-config-peer.test.js tools/learning-loop-mastra/__tests__/mcp-config.test.js
```

**Step 13.2:** Update the test body:
- Change `Object.keys(config.mcpServers).length === 2` to `=== 1`.
- Add explicit check: `assert(!("learning-loop-mcp" in config.mcpServers), "learning-loop-mcp should not be in .mcp.json post-cut-over");`
- Add explicit check: `assert("learning-loop-mastra" in config.mcpServers, "learning-loop-mastra must be the only server");`

### Group 14 — Run pnpm test

```bash
pnpm test
```

**Expected output:** 1069+ pass / 0 fail / 1 skip (the backfill-mechanism-check at `meta-state-reopen-backfill-integration.test.js:6`).

If any test fails: STOP. The acceptance gate is "0 failures." Diagnose and fix before continuing.

### Group 15 — Resolve F4 (OPERATOR_MODE=1)

**Step 15.1:** Set `OPERATOR_MODE=1` in the shell.

**Step 15.2:** Call:
```
meta_state_resolve({
  id: "meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ",
  resolution: "Closed by Phase C Plan 3 cut-over (plans/260617-1950-phase-c-plan-3-cut-over). Peer removed; the mastra server is now the single canonical MCP server. Hook layer unchanged — the 4 PreToolUse hooks (bash/write/inbound-state/recurrence) are session-level, not server-targeted. The SessionStart hook at .factory/hooks/loop-surface-inject.cjs:72 is updated to key on learning-loop-mastra (not learning-loop-mcp); see Plan §Decision Delta. code_fingerprint anchored at tools/learning-loop-mastra/server.js:13 (the PREFIX line).",
  resolved_by: "operator"
})
```

**Step 15.3:** Verify:
```
meta_state_list({id: "meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ"})
```
Expect: `status: resolved`, `resolved_at: <now>`, `resolved_by: "operator"`, `resolution: <text>`.

**Step 15.4:** Populate fingerprint:
```
meta_state_check_grounding({id: "meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ"})
```
Expect: `status: grounded`, `code_fingerprint: sha256:<hash>`. (Reverted from M-10 reject — the fingerprint is useful for documentation even if M-10's reasoning was correct; it's a single cheap call. Actually: defer to M-10 and skip this step. Resolved findings don't drift; the fingerprint adds noise. The resolve itself is sufficient.)

**REVISED Step 15.4:** Skip the `check_grounding` call (per M-10). The `meta_state_resolve` is sufficient to close F4.

### Group 16 — Edit master tracker

**Step 16.1:** Find the C6 + C7 lines:
```bash
grep -n "^- \[ \] \*\*C6\|^- \[ \] \*\*C7" plans/reports/productization-260612-1530-master-tracker.md
```

**Step 16.2:** Edit the tracker:
- C6 + C7 checkboxes: `[ ]` → `[x]`.
- Under each, add a body line: `**Closed 2026-06-17** via \`plans/260617-1950-phase-c-plan-3-cut-over/\`.`
- Update header "Last updated" line at the top: `Last updated: 2026-06-17 (Plan 3 closeout: C6+C7 cut-over via plans/260617-1950-phase-c-plan-3-cut-over/; F4 resolved; 1 meta_state_log_change filed; 11 red-team criticals applied)`

### Group 17 — File tracker change-log (OPERATOR_MODE=1)

**Step 17.1:** With `OPERATOR_MODE=1` still set:
```
meta_state_log_change({
  change_dimension: "semantic",
  change_target: "plans/reports/productization-260612-1530-master-tracker.md#Phase C",
  change_diff: {
    added: ["Plan 3 closeout body text for C6+C7"],
    removed: [],
    changed: ["C6/C7 checkbox from [ ] to [x]"]
  },
  reason: "Plan 3 (C6+C7 cut-over) shipped 2026-06-17 via plans/260617-1950-phase-c-plan-3-cut-over. Single mastra server is canonical; legacy mcp/server.js + mcp/tool-registry.js deleted; F4 finding resolved; 40 mastra_-prefixed tools across 5 groups (gate=5, workflow=11, meta_state=20, introspection=3, runtime_agnostic=1); 11 red-team criticals applied (SessionStart hook key, settings.local.json, 4 docs, 4 wire-format test imports, 2 spawn-test files, package.json#gate:server, F4 fingerprint line 13, parity test replacement, meta_state_refresh_tools port).",
  evidence_code_ref: "tools/learning-loop-mastra/server.js"
})
```

### Group 18 — Closeout journal + changelog

**Step 18.1:** Create `docs/journals/2026-06-17-phase-c-plan-3-cut-over-closeout.md` with sections:
- What Shipped (groups 1-13 summarized; 19 steps; 1 commit; 1-2h effort).
- Test Results (`pnpm test` output; 1069+ pass / 0 fail / 1 skip — the backfill).
- Findings Resolved (F4 only; status: resolved; resolution note in full).
- Change-Log Filed (1 entry from Step 17.1).
- Files Changed (bulleted list of all modified/created/deleted files — mirror the git diff).
- Master Tracker State (C6 + C7 → [x]; Phase C fully closed).
- Unresolved Questions (none expected).

**Step 18.2:** Update `docs/project-changelog.md` with a Plan 3 entry. Mirror the journal's "What Shipped" section; use the existing changelog format.

### Group 19 — Commit + push + open PR

**Step 19.1:** `git add -A` + verify the staged set with `git status`.

**Step 19.2:** Commit:
```bash
git commit -m "feat(mastra): C6+C7 cut-over — single canonical server, F4 resolved

Promote learning-loop-mastra to canonical MCP server (40 tools across 5
groups). Delete legacy learning-loop-mcp/server.js + tool-registry.js.
Update SessionStart hook, settings.local.json, 4 docs, 4 wire-format test
imports, 2 spawn-test files, package.json#gate:server, and
meta-state-refresh-tools-tool.js to keep the runtime consistent.

F4 finding (meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ)
resolved via cut-over (peer removed; single canonical server).

Red-team review applied: 11 critical + 9 high findings addressed in
plans/260617-1950-phase-c-plan-3-cut-over/reports/from-code-reviewer-to-planner-phase-c-plan-3-red-team-39-finding-summary-report.md.

Phase C of the productization master tracker is now fully closed.
"
```

**Step 19.3:** Push: `git push origin 260617-1950-phase-c-plan-3-cut-over`.

**Step 19.4:** Open PR: `gh pr create --title "feat(mastra): C6+C7 cut-over" --body-file <(cat <<'EOF'
[PR body from closeout journal; includes F4 security note per D-13]
EOF
)`

## Success Criteria

- [ ] All 19 step groups complete.
- [ ] `pnpm test` reports 1069+ pass / 0 fail / 1 skip.
- [ ] F4 finding is `status: resolved` with `code_fingerprint: sha256:<hash>` (from `meta_state_check_grounding` if Step 15.4 is included; otherwise no fingerprint).
- [ ] Master tracker C6 + C7 are `[x]`.
- [ ] 1 `meta_state_log_change` filed for the tracker flip.
- [ ] Closeout journal + project changelog updated.
- [ ] 1 commit on the branch; PR opened.
- [ ] All 10 test namespaces pass (1 skip accepted).

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Step 1.1 (manifest expansion) breaks the mastra server's stdio boot | Low | The factory's `createLoopTool` wraps any tool shape; the `PREFIX` logic at line 13 auto-prefixes. Verified by the 29-tool baseline. |
| Step 2.x (config edit) breaks Claude Code or Droid CLI runtime | Low | Both runtimes read `.mcp.json` on session start; restart picks up the new config. |
| Step 4.1 (SessionStart hook) misses a path | Low | Only 1 file changes; manual review of `loop-surface-inject.cjs:72` and `:159` suffices. |
| Step 6.x (helper lift) misses a function | Low | 2 functions total; copy from `tool-registry.js:77-235` (coercion) and `:161-178` (clearRegistrations). |
| Step 7 (test imports) breaks at import time | Medium | If the import is wrong, the test fails at `require()` time. Mitigation: dry-run `node --test` on the 4 files before committing. |
| Step 8.1 (existsSync guard removal) breaks CI on a missing file | Low | The mastra server MUST exist post-cut-over. If it doesn't, the test should fail loudly. |
| Step 11 (parity test rewrite) drops critical coverage | Medium | The new test covers 6 coerce cases; the 4 wire-format tests cover the same logic. The regression net is the union. |
| Step 12 (delete 4 files) leaves dangling imports | Low | Pre-check `grep -r "tools-list-collision\|with-both-mcp-servers" tools/` returns no other importers. |
| Step 14 (pnpm test) reveals a regression | Medium | STOP. Diagnose. The acceptance gate is "0 failures." |
| Step 15 (F4 resolve) blocked by consult-gate | Low | F4 is `active` (ack-ed 2026-06-16); no TTL pressure; resolve is operator-mediated. |
| Step 16 (master tracker) line number drift | Low | Step 16.1 uses `grep -n` to find the actual lines; no hardcoded line numbers. |
| Step 19.2 (commit) blocked by pre-commit hook | Low | The pre-commit hook runs `pnpm test`. If Step 14 fails, the commit fails. Diagnostic = the test failure. |

## Security Considerations

- **F4 closure:** structural (peer removed). The cut-over eliminates the second-server surface; write-side `mastra_*` tools are now the only path. The resolve note explains the structural fix.
- **`settings.local.json` permissions:** the 5 `mcp__learning-loop-mcp__*` permissions reference a server that no longer exists. Renaming to `mastra_` is a security hygiene fix (no permissions on dead servers).
- **`loop-surface-inject.cjs:72` hook key:** the hook is the SessionStart discoverability path. Fixing the key is required for cold-session Droid users to see hints.
- **Helper lifts (Step 6):** `coerceParamsToSchema` + `installWireFormatCoercion` are unchanged; they're moved to a new file. No semantic change.
- **`clearRegistrations` port (Step 6.2):** the in-process reload seam is preserved. Operators retain hot-reload for dev workflow.

## Next Steps

**Plan 3 is closed.** Phase C of the productization master tracker is fully closed. The next unblocked work is Phase D (workflow + agent + storage migration; Mastra `createWorkflow` + 3-4 agents + LibSQL storage), but Phase D is a separate track and not part of this plan.

## References

- `plans/260617-1950-phase-c-plan-3-cut-over/plan.md` (parent plan)
- `plans/reports/researcher-260617-1954-GH-1607-F4-hook-reimplementation-path-a-report.md` (F4 analysis)
- `plans/reports/researcher-260617-1945-phase-c-plan-3-cut-over-mechanics-report.md` (Path b mechanics)
- `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` (D-8 to D-13 + F4 origin)
- `plans/260617-1950-phase-c-plan-3-cut-over/reports/from-code-reviewer-to-planner-phase-c-plan-3-red-team-39-finding-summary-report.md` (red-team)
- `plans/reports/productization-260612-1530-master-tracker.md#Phase C` (canonical state)
- All step-specific file:line references in the parent plan
