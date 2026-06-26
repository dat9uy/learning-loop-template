---
phase: 3
title: "Audit-log gap investigation"
status: pending
priority: P2
dependencies: [1]
---

# Phase 3: Audit-log gap investigation

## Overview

The debug report (Q4) identified that between commit `d84aad7` (07:41:41 UTC, 2 stale / 154 active) and commit `bccbebd` (07:42:49 UTC, 12 stale / 144 active), 10 entries flipped active → stale. The gate-log (`gate-log.jsonl`) between those timestamps shows only `meta_state_relationships` and `meta_state_sweep` with `applied=0` — no MCP write operation. The file must have been modified by a mechanism outside the MCP gateway.

This phase identifies the mechanism (read-only investigation; no fix in this plan). The fix itself is deferred to a separate plan because it may require core code changes.

## Requirements

- Functional:
  - Identify the mechanism that wrote `meta-state.jsonl` between 07:41:41 and 07:42:49 UTC
  - Determine whether the mechanism is intentional (e.g., a documented admin script) or a gap (e.g., direct `Write` tool call)
  - Document the finding in a debug report
- Non-functional:
  - Investigation is read-only — no writes to `meta-state.jsonl`, no changes to MCP tools, no test modifications
  - Findings are evidence-based (file timestamps, log entries, reflog), not speculative
  - Recommendation filed as a meta-state finding for follow-up

## Architecture

The investigation cross-references three audit sources:

1. **`.claude/coordination/gate-log.jsonl`** — every MCP tool invocation is logged with timestamp + payload. This is the authoritative record of MCP-mediated writes.
2. **`.claude/coordination/.gate-decision.log`** — every gate decision (block/warn/ok) for commands. Useful for detecting direct shell operations.
3. **Git reflog + per-commit blob diffs** — captures the on-disk state at each commit, allowing reconstruction of what was on disk at any timestamp.

The gap between gate-log and on-disk state implies one of:
- **Hypothesis A:** Direct `Write`/`Edit` tool call against `meta-state.jsonl` (Claude Code's standard tooling, not gated by MCP)
- **Hypothesis B:** A script invoked via Bash that modified the file (would be in `.gate-decision.log` if gated)
- **Hypothesis C:** A file watcher / hook that auto-runs (no evidence of such a hook in this codebase, but possible)
- **Hypothesis D:** A different MCP tool that writes to `meta-state.jsonl` but doesn't log to `gate-log.jsonl` (audit-log gap in the tool itself)

## Related Code Files

- Read (no modification):
  - `.claude/coordination/gate-log.jsonl`
  - `.claude/coordination/.gate-decision.log`
  - `.claude/coordination/.last-operator-message`
  - Git reflog via `git reflog --date=iso`
  - Per-commit blob diffs via `git show <sha>:meta-state.jsonl | grep ... | jq ...`
- Create: `plans/reports/debugger-260626-1535-phase-e-plan-7-fix-audit-gap-report.md` (the investigation report)
- Create (separately): 1 meta-state finding for the gap (via `meta_state_report`)

No production code modifications. No meta-state.jsonl writes (read-only investigation).

## Implementation Steps

### Step 1: Reproduce the timeline precisely

```bash
# For each commit, extract meta-260606T1830Z entry (the canonical entry used for analysis)
for sha in 4203553 d84aad7 bccbebd 1186c33; do
  echo "=== $sha ==="
  git show $sha:meta-state.jsonl | grep "meta-260606T1830Z" | jq '{status, version, last_verified_at, expires_at}'
done

# Extract reflog timestamps
git reflog --date=iso | grep -E "4203553|d84aad7|bccbebd|1186c33"
```

**Expected output:** A timeline mapping commit timestamps → entry state. Establishes the precise window where the unlogged write occurred (07:41:41 UTC → 07:42:49 UTC).

### Step 2: Search the audit logs for any write operation in the window

```bash
# All MCP tool calls between 07:41:00 and 07:43:00 UTC
grep -E "2026-06-26T07:4[1-3]" .claude/coordination/gate-log.jsonl

# All gate decisions between the same window
grep -E "2026-06-26T07:4[1-3]" .claude/coordination/.gate-decision.log

# All bash commands between the same window
grep -E "2026-06-26T07:4[1-3]" .claude/coordination/gate-log.jsonl | grep '"tool":"bash"'
# (gate-log.jsonl doesn't log Bash calls — they're in gate-decision.log only if gated)
```

**Expected output:** Confirms no MCP write operation in the window. If `gate-decision.log` shows a Bash call, identify it.

### Step 3: Investigate direct Write tool usage

Check the `.claude/coordination/.last-operator-message` and any tool-call log:

```bash
cat .claude/coordination/.last-operator-message
# Look for evidence of Write tool calls against meta-state.jsonl in any session log
find .claude -name "*.jsonl" -newer /tmp/meta-state-diff.txt 2>/dev/null
```

If Claude Code's session logs are available (typically `.claude/projects/{hash}/{session}.jsonl`), inspect them for `Write` tool calls targeting `meta-state.jsonl`.

### Step 4: Check for hooks or scripts that auto-write meta-state.jsonl

```bash
# Search all hooks and scripts for write patterns against meta-state.jsonl
grep -rn "meta-state.jsonl" tools/ .claude/ 2>/dev/null | grep -v "__tests__\|\.md\|node_modules" | head -20
grep -rn "writeFileSync.*meta-state\|appendFileSync.*meta-state" tools/ 2>/dev/null | head -10
```

**Expected output:** Confirms no auto-writer. If found, identify it as the gap mechanism.

### Step 5: Synthesize the finding

Based on Steps 1-4, determine the most likely mechanism (Hypothesis A/B/C/D above). Document:

- **Mechanism:** [direct Write tool | bash script | hook | unlogged MCP tool]
- **Evidence:** [specific log entries, file timestamps, reflog]
- **Likelihood:** [high/medium/low] based on evidence strength
- **Recommendation:** [what to do about it]

### Step 6: File the finding + write the report

```bash
# File the gap as a meta-state finding (operator can promote to rule if it's a real gap)
mcp__learning-loop__mastra_meta_state_report \
  --id "meta-260626T1535Z-meta-state-jsonl-write-path-not-fully-audited" \
  --category "loop-anti-pattern" \
  --subtype "escape-hatch-abuse" \
  --severity "warning" \
  --affected_system "meta-state-tools" \
  --description "..."
```

**Required description content:** The investigation summary, mechanism hypothesis, evidence pointer (specific timestamps from gate-log + reflog), and the recommendation (e.g., "add gate-decision.log entry for direct file writes against meta-state.jsonl" or "audit all MCP tools for log completeness").

Then write the report:

```bash
# Write the report (path is fixed by project naming convention)
Write plans/reports/debugger-260626-1535-phase-e-plan-7-fix-audit-gap-report.md
```

## Success Criteria

- [ ] Step 1 timeline reproduced (4 commits, entry states mapped)
- [ ] Step 2 gate-log + gate-decision.log searched for the window; no MCP write found
- [ ] Step 3 session logs searched for `Write` tool calls (if available)
- [ ] Step 4 hooks + scripts searched for auto-writers (none found expected)
- [ ] Step 5 mechanism identified with evidence
- [ ] Step 6 meta-state finding filed with category + description
- [ ] Step 6 report written with the full investigation summary

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| R1 (mechanism is genuinely unidentifiable) | Document the unknowns explicitly; recommend deeper audit in follow-up plan |
| R2 (Claude Code session logs not available locally) | Note this in the report; recommend that future sessions enable such logging |
| R3 (the finding's `evidence_code_ref` points to the wrong file) | Use `tools/learning-loop-mastra/core/meta-state.js#updateEntry` or `tools/learning-loop-mastra/core/meta-state.js#metaStateBatch` as the grounding ref |
| R4 (fix deferred to follow-up plan leaves gap open) | This is acceptable — the plan explicitly scopes the fix out. Document the open gap prominently. |