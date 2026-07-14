# Phase 1 — Design freeze

**Date:** 2026-07-14
**Phase:** 1 of `plans/260714-1200-fallow-brief-discovery/`
**Status:** Frozen — implementation may proceed in Phase 2.

## 1. `LOOP_SESSION_MODE` verification

```
$ echo "LOOP_SESSION_MODE=${LOOP_SESSION_MODE}"
LOOP_SESSION_MODE=live
```

Both `meta_state_promote_rule` (Phase 2) and `meta_state_supersede` (Phase 4) are
live-gated per `tools/learning-loop-mastra/mastra/tools/meta-state-promote-rule-tool.js:57-67`
and `meta-state-supersede-tool.js:19-21`. Verified live before any design work.

## 2. Rule shape (frozen)

```yaml
rule_id: rule-fallow-brief-on-gate-failure
enforcement: agent
pattern_type: consult-checklist
pattern: |
  {
    "version": 1,
    "items": [
      {
        "id": "fallow-gate-failure-routes-to-brief",
        "description": "When `pnpm fallow:gate` (or any local `fallow audit --gate new-only` invocation) exits non-zero, run `pnpm fallow:brief` next to get a compact CSV stream (one finding per line with severity/crap/path:line fields) instead of re-parsing the human-readable prose. The brief stream is much smaller than the gate's decorated human report and is machine-actionable when at least one finding exists. On a clean tree the brief is ~50 B with no action needed. Measured byte sizes recorded in plans/260714-1200-fallow-brief-discovery/reports/byte-size-measurements.md (Phase 1 step 7)."
      }
    ]
  }
```

No `applies_to` field — `gate-logic.js:750-755, 757` short-circuits consult-checklist
rules with `enforcement !== 'gate'`; the `surfaces` field would be decorative.

## 3. PROCESS_HINTS row text (frozen)

```text
Fallow gate triage. When `pnpm fallow:gate` (or any local `fallow audit --gate new-only`) exits non-zero from pre-commit, do NOT re-parse the human-readable prose. Run `pnpm fallow:brief` next: it emits a compact-CSV stream (one finding per line: `high-complexity:<path>:<line>:<symbol>:cyclomatic=N,severity=<level>,crap=N,...`). The brief stream is much smaller than the gate's decorated human report and is machine-actionable when at least one finding exists — grep for `severity=` (filter by the finding's actual severity per its meta-state entry, which may be `warning` not `high`); ignore baseline-inherited lines. On a clean tree the brief is ~50 B with no action needed. See `rule-fallow-brief-on-gate-failure` in `meta-state.jsonl` for the full contract.
```

Verifies the literal `rule-fallow-brief-on-gate-failure` substring is present —
required for the H6 ordering gate at `loop-describe-tool.js:94-106` to silently
acknowledge the rule.

## 4. Relationship query — originating finding

```
meta_state_relationships({
  id: 'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json',
  direction: 'both'
})
```

Result:

```json
{
  "id": "meta-260712T0730Z-fallow-mcp-runtime-needs-format-json",
  "entry_kind": "finding",
  "outbound": null,
  "inbound": null,
  "dangling_refs": null
}
```

**Decision:** No inbound or outbound refs. Safe to use `status: superseded` with
`consolidated_into` pointing at the new change-log. Phase 4 stays as written.

## 5. Rule-id uniqueness check

```
meta_state_list({ entry_kind: 'rule', id: 'rule-fallow-brief-on-gate-failure' })
```

Result: `{ entries: [], count: 0 }` — no conflict. The rule id is free to use.

## 6. Byte-size measurements

See [`byte-size-measurements.md`](./byte-size-measurements.md). Summary:

| Scenario | Human stderr | JSON stdout | Compact stdout |
|----------|--------------|-------------|----------------|
| Gate (`--gate new-only`, current tree) | 1353 B | 4863 B | 58 B |
| Full audit (no gate) | 1384 B | 4945 B | 58 B |

Current tree has 0 findings vs `origin/main`. The qualitative ratio (one compact
line per finding vs ≥8 human lines) is what the rationale relies on; absolute
byte counts are not.

## 7. File-line verification (anchor locations)

- `tools/learning-loop-mastra/core/loop-introspect.js` lines **122-127** — `PROCESS_HINTS = Object.freeze([...])` with 4 rows; insertion point between line 126 (closing `"` of row #4) and line 127 (`]);`).
- `.factory/hooks/loop-surface-inject.cjs` lines **35-40** — `LOCAL_PROCESS_HINTS = Object.freeze([...])` mirroring 4 rows; insertion point between line 39 (closing `"` of row #4) and line 40 (`]);`).
- `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` lines **359-379** — strictEqual parity assertion shape confirmed.

## 8. Decision

All Phase 1 success criteria met. Phase 2 may proceed.
