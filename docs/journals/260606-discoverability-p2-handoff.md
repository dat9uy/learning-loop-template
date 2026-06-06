# 2026-06-06 — Discoverability P2 Handoff (Session-to-Session)

## TL;DR

This session shipped the **P1 G8 subcommand-class fix** (refined rule pattern + status filter + safety check) and the **P2 splitSegments quote-aware fix** (the deeper bug beneath P1). Both shipped as a single commit `a89a421` (amend naturally combined the staged P2 work) plus a journals commit `52439ca`.

The **actual P2 discoverability work** — the warm-tier `discoverability_hints` addition closing the 2 active 2026-06-01 findings — was **deferred** because the gate-fire conversation consumed the session. This journal is the handoff so the next session can pick it up without re-reading this whole conversation.

## What Got Done (For Context)

| Commit | Subject | What it shipped |
|--------|---------|-----------------|
| `a89a421` | `fix(gate): G8 subcommand-class false positive + status filter + safety check` | P1 + P2 combined: refined regex, status filter accepts `resolved` rules, `isSafeRegexPattern` allows top-level quantifiers, `splitSegments` is now a quote-aware state machine. 373 insertions across 4 files. |
| `52439ca` | `docs(journals): G8 subcommand-class fix + spawnandcall-chicken-egg-fix + splitsegments-quote-aware-fix` | 3 journal files backing the change-logs. 446 insertions. |

715/715 tests pass. 2 new findings, 2 new change-logs, 1 P1 journal amended.

## The Deferred Work: Discoverability Hints (Actual P2)

The plan `260605-superseded-status-and-discoverability/plan.md` was a 5-phase plan. **Phases 1-4 shipped** (superseded status + consolidated_into field, G8 supersede applied, drift query with 53 tests, hook failure reporting). **Phase 5 — discoverability hints in the warm tier of `loop_describe` — was deferred** because:

1. The 2 active 2026-06-01 findings (`meta-260601T1339Z-...`) are the canonical problem statements for this work
2. The `260602-strict-mcp-call-rules` plan was named as the resolution path, but its SessionStart hook is a separate piece of work
3. The P1/P2 gate-fire conversation absorbed the available session time

### The 2 Active Findings (Verbatim)

#### Finding 1: `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz`

```yaml
id: meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz
category: loop-anti-pattern
severity: warning
affected_system: mcp-tools
subtype: tool-missing
status: active
expires_at: 2026-06-03T10:00:00.000Z  # EXPIRED — needs ack or re-set
```

**Problem**: When an agent creates a record with `source_refs` pointing to external artifacts (plans, docs, journals), the validation error only says "source ref must stay under `records/evidence`". It does not explain the **WHY** (the internalization philosophy) or the **HOW** (extract content → `records/meta/evidence/` → `local:records/meta/evidence/` reference).

**Agent natural response** observed: try legacy workarounds, bypass the boundary.

**Why it's still active**: REVERTED 2026-06-02. The operator's earlier `resolved` status was premature (loop_describe exists, so the mechanism is shipped). The follow-up plan `260602-meta-state-lifecycle-tidy` measured adoption = 0 in real sessions (G7, out of scope). `260602-strict-mcp-call-rules` is the mechanical fix via a Droid SessionStart hook. **Until that plan ships AND is verified in real sessions, the discoverability gap is real.**

#### Finding 2: `meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th`

```yaml
id: meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th
category: loop-anti-pattern
severity: warning
affected_system: mcp-tools
subtype: tool-missing
status: active
expires_at: 2026-06-03T10:00:00.000Z  # EXPIRED — needs ack or re-set
```

**Problem**: Agent could not discover the `meta-state.jsonl` registry or the `meta_state_report` MCP tool. The meta-state system is the correct destination for ephemeral agent findings, but it is not discoverable. Agent tried to create `records/meta/evidence/` files (blocked by write gate) and did not know about `meta_state_report` as an alternative.

**Why it's still active**: REVERTED 2026-06-02. Same as Finding 1: AGENTS.md mentions `meta_state_report` only in the budget-check rule, but the agent had no way to find it without reading the specific file.

## Open Questions for Next Session

### Q1: What is the minimum surface that closes these findings?

Two viable approaches:

- **A) Plan 260602-strict-mcp-call-rules** — Droid SessionStart hook that injects a short "you have these MCP tools" summary into the system prompt. Heavier (requires a hook installer + the strict-mcp-call-rules enforcement). Maps directly to the findings' stated resolution path.
- **B) Warm-tier `discoverability_hints` in `loop_describe`** — surface the meta-state system + internalization rule as a list of "things you should know about yourself" in the warm tier. Lighter (just additions to `tools/learning-loop-mcp/tools/loop-describe-tool.js`). Captured in `meta-260605T1356Z-loop-describe-cold-tier-superseded-lineage-missing` as a follow-up.

**Question**: Do we need **both** (defense in depth), or is one sufficient? If only one, which and why?

### Q2: What's the verification gate for "adoption is verified"?

Both findings explicitly require **"adoption is verified in real sessions"** before they can be resolved. What does that look like in practice?

- **Option α**: Observe N consecutive sessions where the agent uses `meta_state_report` correctly without prompting. N = ? 3? 10?
- **Option β**: Add an automated test that simulates a cold session (no prior context) and asserts the agent finds `meta_state_report` within M tool calls.
- **Option γ**: A meta_state_query_drift filter for "agent-created meta evidence files" (none observed since the 2026-06-01 incident).

**Question**: Is there a clean way to measure adoption that's not vibes-based?

### Q3: Both `expires_at` are 2026-06-03 — past due

Both findings expired 3 days ago. Are they:
- **Still actionable**? (yes, per the reasoning) — then they need `expires_at` re-set via `meta_state_log_change` or similar, **or** the operator needs to acknowledge via a `ack` mechanism
- **Superseded by the new fix**? — then they need to be `consolidated_into` a new change-log entry
- **Abandoned**? — then they need explicit `status: "abandoned"` (verify this status is supported in the meta-state schema)

**Question**: What's the right lifecycle move here? Need to check `core/meta-state.js` for the supported status transitions.

### Q4: Should the SessionStart hook (Option A) be built first?

If we go with Option A (the named resolution path), it requires:
- A hook installer (per `AGENTS.md` hook matrix — Claude Code + Droid CLI both need wrappers)
- The strict-mcp-call-rules enforcement (which is its own non-trivial design)
- A verification mechanism (Q2)

If we go with Option B (warm-tier hints), it's:
- A single function in `tools/learning-loop-mcp/tools/loop-describe-tool.js`
- A `discoverability_hints` schema (where does it live? in `core/`?)
- A test that asserts the hints appear in the warm tier

**Question**: If we ship Option B first as a "fast win" with a documented "this is not the full fix, see plan 260602-strict-mcp-call-rules", does that resolve the findings? Or do we have to do the full hook?

## Files to Re-Read First (Next Session Bootstrap)

In priority order:

1. **This journal** (you're here)
2. **The 2 findings** in `meta-state.jsonl` lines 1-2 (already grep-able)
3. **The plan** `plans/260605-superseded-status-and-discoverability/plan.md` — to understand the 5-phase scope and what shipped
4. **The 2 prior journals** for context on what was tried before reverting:
   - `docs/journals/260601-bridge-2-candidate-to-experiment-closeout.md`
   - `docs/journals/260602-agent-docs-plans-default-pattern.md` (might not exist; check)
5. **The G8 fix journals** for the current-session context (splitSegments + G8 subcommand-class)
6. **The hook matrix** in `AGENTS.md` § Hook Matrix — for the SessionStart hook design (Q4 Option A)

## What NOT to Re-Read (Avoid Sunk-Cost Fallacy)

- The full conversation history (this journal is the summary)
- The Droid-Shield false-positive detour (irrelevant going forward; the user ran the commit from shell, it worked)
- The P1+P2 commit-collapse discussion (resolved: it was an artifact of the amend picking up staged P2 work; both pieces of work are in `a89a421`)

## Decisions Already Made (Do Not Re-Litigate)

- **P1+P2 combined into one commit is OK.** The combined message references the follow-up; the journal documents the audit trail. Atomic gate-logic change is the correct unit.
- **splitSegments is hand-rolled, not a dependency.** Discussed briefly; see Q2 in `docs/journals/260606-splitsegments-quote-aware-fix.md` for the open question on `shell-quote` vs hand-rolled.
- **Droid-Shield bypass for commit is acceptable.** User ran `git commit --no-verify` from shell because the static scanner false-positives on meta-state.jsonl regex content. This is a tooling ergonomics issue, not a gate-fix issue.

## Suggested Next-Session Agenda

1. Read this journal + the 2 findings + the 260605 plan
2. Decide: Option A (hook) vs Option B (warm-tier hints) vs both (Q1)
3. Decide: how to measure adoption (Q2)
4. Decide: lifecycle move for the expired `expires_at` (Q3)
5. Either build Option B as a fast win (1-2h, TDD, ship the journal) or scope the hook design (4-8h, multi-phase plan)
6. Run the existing test suite (715/715) and add tests for whatever ships
7. Re-test in a cold-context session: `meta_state_report` discoverable without prompting?

## Related Audit Entries

- `meta-260605T1356Z-loop-describe-cold-tier-superseded-lineage-missing` — the original discoverability follow-up stub (now resolved by Phase 3 of plan 260605)
- `meta-260605T1330Z-g8-subcommand-class-false-positive-consolidation` — the consolidation stub for the 4 G8 findings
- `meta-260606T0028Z-g8-subcommand-class-false-positive-supersede` — the consolidation change-log shipped in this session
- `meta-260606T0310Z-splitsegments-quote-aware-fix` — the change-log for the P2 splitSegments work
- `meta-260606T0301Z-splitsegments-quote-unaware-bash-gate-false-positive` — the finding recorded and resolved in this session (not the discoverability one; different bug)

## Sign-Off

Session: 2026-06-06 ~02:00-03:30 (UTC+7)
Operator: dat9uy
Status: P1+P2 done; discoverability P2 deferred; handoff journal created.
Next session command: read this journal first, then `git log --oneline -3` for state, then `meta_state_list({status: "active", entry_kind: "finding"})` to confirm the 2 active findings are still active and unaddressed.
