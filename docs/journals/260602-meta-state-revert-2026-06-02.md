# Meta-State Revert: Two Premature Resolutions

**Date:** 2026-06-02
**Trigger:** Operator review of `meta-state.jsonl` flagged that two entries marked `status: "resolved"` were resolved on 2026-06-02T00:29Z without any actual behavior change. The agent (or operator) treated "the mechanism exists" as equivalent to "the mechanism is being used."

## Reverted Entries

| ID | Original Resolution (claims) | Honest State |
|---|---|---|
| `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz` | "loop_describe now surfaces the meta-state registry and meta_state_report tool. Agents can discover these at session start." | `loop_describe` exists; AGENTS.md recommends calling it. **Adoption = 0 in real sessions** (G7 in `260602-meta-state-lifecycle-tidy`). |
| `meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th` | "Discoverability fixed via `loop_describe({tier: 'warm'})` which lists `meta_state_report` and other registry tools." | Same root cause: tool exists, no adoption. |

## Why Revert

The original resolution text is **technically true** (the mechanism exists) but **practically unverified**. The follow-up plan `260602-meta-state-lifecycle-tidy` (now `done`) measured:

> "G7: `loop_describe` adoption = 0 outside tests" — `plans/reports/brainstorm-260602-meta-state-lifecycle-tidy.md`

This means: in real sessions, agents still don't call `loop_describe`. The discoverability gap is real. The plan that mechanically closes the gap is `260602-strict-mcp-call-rules` (Phase 2 — Droid `SessionStart` hook auto-injects the loop surface). Until that plan ships and adoption is verified in real sessions, the entries should be `active`, not `resolved`.

This is the same category error the brainstorm report called out:
> "The fix is not stronger docs. The plan already shipped those and measured zero adoption. The fix is to **shift from soft 'recommended' to hard 'enforced'** for the behaviors that are mechanically checkable."

## Changes Applied

For each of the two entries:

- `status`: `"resolved"` → `"active"`
- `resolved_at`: ISO timestamp → `null`
- `resolved_by`: `"operator"` → `null`
- `resolution`: descriptive string → `null`
- `version`: `2` → `3` (reflects the revert: 1=initial, 2=premature operator resolution, 3=reverted to active)
- `expires_at`: 2026-06-02T06:39Z (already expired) → 2026-06-03T10:00Z (fresh 24h TTL)
- `description`: appended a `REVERTED 2026-06-02: ...` clause explaining the revert and pointing to the fix plan

## How to Re-Resolve

Once the `260602-strict-mcp-call-rules` plan's Phase 2 ships and adoption is verified in real sessions, re-resolve these entries. The right resolution text should be:

> "G7 closed mechanically: Droid `SessionStart` hook (`plans/260602-strict-mcp-call-rules/phase-02-session-start-hook.md`) auto-injects `loop_describe({tier:'summary'})` on session start. Adoption verified in N real sessions over N days."

The key change: include the **verification evidence** (number of sessions, time window), not just the existence of the mechanism.

## Validation

- `pnpm validate:records` passes (183 records; warnings are pre-existing deprecated-timestamp records, unrelated to the meta-state entries)
- Both entries are now visible to `meta_state_list` and `loop_describe({tier:"warm"}).active_findings`
- The `260602-strict-mcp-call-rules` plan's cook can now see these as live gaps that the plan addresses (the cross-references in the plan are accurate)

## Lesson for the Loop

The category error "mechanism exists = mechanism is used" is now formally documented in two places:
1. The reverted entries' descriptions (warnings to future agents)
2. The `260602-strict-mcp-call-rules` brainstorm report's "What 'Resolved' Should Have Meant" section

A future meta-state hygiene check (out of scope for this session) could add a `meta_state_sweep` rule that flags operator-resolved entries where `resolution` text contains the substring "now surfaces" / "now lists" / "is available" (passive claims without verification evidence) for re-review.

## Related Artifacts

- `meta-state.jsonl` — the two reverted entries (lines 5, 6)
- `plans/260602-meta-state-lifecycle-tidy/plan.md` — the follow-up plan that measured G7 = 0
- `plans/260602-strict-mcp-call-rules/plan.md` — the fix plan (Phase 2 = SessionStart hook)
- `plans/reports/brainstorm-260602-strict-mcp-call-rules.md` — design rationale ("What 'Resolved' Should Have Meant" section)
