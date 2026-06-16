# Phase C Plan 2 — Parity Gate (C4) Closeout

**Date**: 2026-06-17 00:00
**Severity**: Medium
**Component**: learning-loop-mastra parity harness
**Status**: Resolved

## What Happened

- Built a byte-identical parity harness between `learning-loop-mcp` and `learning-loop-mastra` servers.
- Shipped 36 schema + 4 read-only content parity tests, 5 mastra E2E cold-session tests, and 3 dual-server collision tests.
- Final `pnpm test`: 1059 tests / 1058 pass / 0 fail / 1 pre-existing skip. C4 master tracker flipped to [x].

## The Brutal Truth

The gate was almost derailed by a single tool: `gate_check`. It was in the original read-only content parity set until code review caught that it writes a ledger event to `runtime-state.jsonl`. We had to yank it, shrinking the content parity set from 5 to 4 tools. The frustrating part is that the "read-only" assumption was never explicitly documented in the tool contract — we had to discover it by tracing the implementation. The real kick in the teeth is that this is the kind of side-effect that would have silently corrupted the runtime state if we had run it in the parity loop against both servers simultaneously.

## Technical Details

- `gate_check` excluded from content parity because it records `{"type":"gate-check",...}` into `runtime-state.jsonl` during every call. Not read-only.
- Final read-only content parity set: `meta_state_list`, `loop_describe`, `runtime_state_read`, `check_runtime_agnostic`.
- 25/29 tools remain schema-only parity; write-side tools excluded to avoid registry mutation races.
- Zod v4 pinned to exact `4.4.3` — gate is version-specific.
- F4 gate-bypass gap (D-10) deferred to Plan 3; finding is `ack`-ed but remains active.

## What We Tried

- Initially included `gate_check` in the 5-tool read-only parity set. Code review flagged the write side-effect. Removed it and re-ran the full suite.
- Attempted to add `check_runtime_agnostic` as a replacement — it is genuinely read-only and passed parity immediately.

## Root Cause Analysis

The root cause was an implicit assumption: "tools that sound like checks are read-only." `gate_check` is named like a pure assertion but has a persistent side-effect. We should have audited every tool for writes before building the parity set, not assumed from the name.

## Lessons Learned

1. **Never assume read-only from naming.** Audit the implementation for any file/registry/network mutation before including a tool in a parity harness.
2. **Pin exact dependency versions for parity gates.** A caret on zod would invalidate the gate silently on the next install.
3. **Document side-effects in tool contracts.** If `gate_check` had a `writes: ["runtime-state.jsonl"]` annotation, this would have been a 30-second fix instead of a review-round-trip.

## Next Steps

- Plan 3 (C6+C7 cut-over) is unblocked. Owner: lead. Timeline: next sprint.
- F4 gate-bypass gap (D-10) must be resolved before any production cut-over. Owner: lead.
- M-C4 / D-11: reconcile 4 missing tools in `agent-manifest.json`. Belongs to Plan 3 (C6+C7 operational flip). Owner: lead.

**Status:** DONE
