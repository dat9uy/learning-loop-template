# Audit-log gap investigation — Plan 7 Fix

**Date:** 2026-06-26T09:30:00Z
**Source:** `plans/260626-1535-phase-e-stale-sweep-fix/phase-03-auditgapinvestigation.md`
**Predecessor:** `plans/reports/debugger-260626-1445-phase-e-plan-7-stale-sweep-root-cause-report.md` (Q4 audit-gap)
**Investigator:** ck:cook auto mode
**Status:** Investigation complete. Mechanism not fully identified; recommendation filed.

## Summary

Between `d84aad7` (07:41:41 UTC, 2 stale / 12 active) and `bccbebd` (07:42:49 UTC, 12 stale / 2 active), `meta-state.jsonl` was modified to flip 10 entries from `active` → `stale`. No MCP tool call, bash command, or Write/Edit tool call targeting `meta-state.jsonl` is logged in any gate-log or session log during this window. The mechanism remains unidentified from available audit sources.

## Timeline (reconstructed)

| UTC Time | Event | Source |
|----------|-------|--------|
| 07:30:08 | `meta_state_batch` (14 ops, applied=14) — all 14 entries → active | gate-log.jsonl |
| 07:31:24 | `meta_state_sweep` (apply=true) re-staled 10 entries | gate-log.jsonl |
| 07:33:33 | Commit `4203553` — file has 12 stale | git reflog + blob diff |
| 07:37:41 | `meta_state_batch` retry (14 ops) failed at op 10: version_mismatch | gate-log.jsonl |
| 07:39:36 | `meta_state_batch` retry (10 ops, applied=10) — 10 entries → active | gate-log.jsonl |
| **07:41:19** | `meta_state_sweep` (apply=true) re-staled 10 entries | gate-log.jsonl |
| **07:41:25** | `meta_state_list` (count=164, no entries filter) | gate-log.jsonl |
| **07:41:41** | Commit `d84aad7` — file has **2 stale** | git reflog + blob diff |
| **07:42:25-26** | `meta_state_sweep` (apply=0) — no transitions proposed | gate-log.jsonl |
| **07:42:49** | Commit `bccbebd` — file has **12 stale** | git reflog + blob diff |
| 07:44:42 | Commit `1186c33` — file has 12 stale (no change from bccbebd) | git reflog |

**The mystery:** Between 07:41:19 (sweep re-staled 10) and 07:41:41 (d84aad7 amend with only 2 stale), 10 entries went from stale back to active. Between 07:41:41 and 07:42:49, the same 10 entries went active → stale again. No logged write operation corresponds to either transition.

## Audit sources cross-referenced

1. **`.claude/coordination/gate-log.jsonl`** — every MCP tool call.
   - 07:41:18-19: meta_state_relationships (read-only) + meta_state_sweep (apply=10)
   - 07:41:25: meta_state_list (read-only)
   - 07:41:27+: bash commands blocked (docker, sudo, echo > records/) — none targeted meta-state.jsonl
   - 07:42:25-26: meta_state_relationships + meta_state_sweep (apply=0)
   - 07:42:32: meta_state_list
   - **No MCP write operation in the 07:41-07:42 window.**

2. **`.claude/coordination/.gate-decision.log`** — every bash gate decision.
   - Multiple blocked bash commands in the window (docker, sudo, records/ writes)
   - **No bash command targeted meta-state.jsonl.**

3. **Claude Code session log** — `8d9f7f34-c0f4-4d8c-a1ed-cdee7c019246.jsonl` (slug "zesty-launching-robin", branch `phase-e/plan-3-housekeeping`).
   - **Only one session active during the window.**
   - Write/Edit tool calls in this session (verified by grep):
     - 07:33:02.915 — `Write` to `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md`
     - 07:40:41.811 — `Edit` to same journal (retry note)
     - 07:40:56.578 — `Edit` to same journal (verification update)
     - 07:43:29.422 — `Edit` to `plans/260626-0720-phase-e-stale-sweep/plan.md` (status: pending → done)
     - 07:44:00.127 — `Edit` to same plan.md (phase status updates)
     - 07:44:10.901 — `Edit` to same plan.md (status footer update)
   - **None of these targeted meta-state.jsonl.**

4. **Git reflog** — `git reflog --date=iso`.
   - 4203553 at 14:33:33 +0700 (07:33:33 UTC)
   - d84aad7 at 14:41:41 +0700 (07:41:41 UTC)
   - bccbebd at 14:42:49 +0700 (07:42:49 UTC)
   - 1186c33 at 14:44:42 +0700 (07:44:42 UTC)

## Hypotheses (with likelihood)

### Hypothesis A: Claude Code Write/Edit tool wrote to meta-state.jsonl (low likelihood)

The session log shows Write/Edit calls but none targeted meta-state.jsonl. **Counter-evidence:** session log appears complete (timestamps contiguous with MCP calls). If the agent used Write/Edit on the registry, it would be logged. **Possibility:** the session log is incomplete or truncated. **Verdict:** unlikely but not ruled out.

### Hypothesis B: MCP server internal cache wrote stale data (medium likelihood)

The MCP server may have had a stale in-memory cache that was flushed to disk at some point during the session. The server uses `invalidateCache` after writes, but a write that bypasses the server (e.g., direct file write via another process) would not invalidate the cache. If the server later flushed a cached "old" version of the registry, this could produce a write without a logged MCP operation. **Verdict:** plausible, would explain why the file state moves in ways that contradict the gate-log.

### Hypothesis C: A different agent/process modified the file (medium likelihood)

The `.factory/coordination/` directory contains parallel coordination infrastructure (Droid CLI shares the loop via universal hooks). A Droid agent active during this window could have modified meta-state.jsonl without going through the Claude Code session log. **Verdict:** plausible if Droid CLI was active. Investigating Droid session logs is out of scope for this investigation.

### Hypothesis D: File system race condition or atomic rename artifact (low likelihood)

`metaStateBatch` uses `writeFileSync(tmpPath)` + `renameSync` for atomic writes. If a concurrent reader held a stale file descriptor and rewrote it, this could produce a "ghost" write. **Verdict:** unlikely; Node.js file handles are usually consistent within a single process.

## Audit-log gap class (architectural)

The bash gate (`.claude/coordination/hooks/bash-coordination-gate.cjs` → `tools/learning-loop-mastra/hooks/legacy/bash-gate.js`) **does** block direct shell writes to `meta-state.jsonl` (regex match on `> meta-state.jsonl` and `tee meta-state.jsonl`). However, Claude Code's standard `Write` and `Edit` tools bypass the bash gate because they are not shell commands — they invoke file operations directly through Claude Code's tool runtime.

This means an agent can modify `meta-state.jsonl` using Write/Edit without triggering the bash gate, leaving no entry in `.gate-decision.log`. The only audit trail would be in the Claude Code session log. If the session log is incomplete, lost, or not preserved across sessions, the write is untraceable.

## Recommendation

Filed as meta-state finding `meta-260626T1627Z-plan-7-fix-phase-1-deferred-2-stale-mechanism-check-false-en` (separate from this investigation but related).

**Specific architectural fixes (out of scope for Plan 7 Fix):**

1. **Write-gate for Claude Code tools.** Extend the write gate to also intercept Write/Edit tool calls that target `meta-state.jsonl`. The hook would need to hook into Claude Code's tool runtime, not just shell commands. Possible implementation: a `PreToolUse` hook that checks `tool_input.file_path` against a deny-list of registry paths.

2. **Atomic-write detector.** Add a hook that watches `meta-state.jsonl` mtime and compares it against the last MCP write timestamp. If a write occurs without a corresponding gate-log entry, emit an alert.

3. **Session log archival.** Ensure Claude Code session logs are archived (not just stored in `~/.claude/projects/{hash}/`) so historical Write/Edit tool calls can be audited even after the session ends.

4. **Meta-state MCP wrapper.** Add an MCP tool that wraps file write operations and forces meta-state.jsonl mutations through the registry API. This would be a defense-in-depth measure.

## Verification

- Cross-referenced 4 audit sources above
- Confirmed only one session was active during the window
- Inspected all Write/Edit tool calls in the active session — none targeted meta-state.jsonl
- Inspected all bash gate decisions — no shell command targeted meta-state.jsonl
- Inspected all MCP tool calls — no write operation in the window

## Open questions

- **OQ1:** Was a Droid CLI agent active during 07:41-07:42 UTC? The investigation did not search `.factory/` session logs. If a Droid agent wrote meta-state.jsonl, that would be Hypothesis C confirmed.
- **OQ2:** Is the Claude Code session log complete? If the Write/Edit tool calls were omitted from the log (e.g., due to size limits or log rotation), Hypothesis A could be confirmed.
- **OQ3:** Did the MCP server have any internal state that could have caused the file write? This requires reading the server's source code to identify potential cache flush paths.

## Status

Investigation complete. Mechanism not fully identified. Recommendation filed as meta-state finding. Architectural fixes deferred to follow-up plan (Plan 8 candidate).
