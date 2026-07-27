# Predict Report: Systemize Context-Cost Analysis (meta-260722T1546Z)

**Date:** 2026-07-26
**Finding:** `meta-260722T1546Z-the-write-capable-cli-transport-s-context-savings-dogfood-ch` (open, warning, loop-anti-pattern)
**Verdict:** CAUTION — direction right, half-built; measurement-unit fork unresolved.

## 1. Finding recap

The write-capable CLI transport's context savings were measured once by hand (29.9 KB / 94% saved per session start) with a deleted throwaway script. Three gaps: (1) no reproducible committed check; (2) no `runtime_state_record` ledger rows tracking savings across sessions; (3) no regression guard tied to the banner budget lock and CLI_TOOLS drift guard.

## 2. Current-state evidence (scouted 2026-07-26)

- `tools/scripts/measure-context-surfaces.mjs` (commit `1c6a614`) already exists: measures MCP tools-list bytes, SessionStart hook bytes, sidecar shape; isolated temp gate root; 3× retry (flakiness evidence).
- **Not wired**: no package.json script, no CI, no test invokes it.
- **Measures absolutes, not the delta**: the finding's headline number (dropped MCP def bytes for CLI_TOOLS set vs banner bytes) is computed nowhere.
- `tools/learning-loop-mastra/__tests__/cli-sessionstart-banner.test.js` holds the hard banner byte budget.
- Gap (1) partially closed since the finding was written; gaps (2) and (3) fully open.

## 3. Persona consensus

**All agree:**
- The ledger is the differentiator, not the script. Persistence between context clears is the actual goal.
- Extend `measure-context-surfaces.mjs`; don't fork a new harness.
- The CLI savings delta is the missing number.
- Assert + record in one place, chained to the existing banner budget test.

**Conflicts resolved:**
| Topic | Resolution |
|---|---|
| Absolutes vs delta | Measure absolutes, derive delta; record raw components |
| Record per run vs per change | Per run is fine — runtime-state rows are a ledger, not a push surface |
| Hard assert vs drift detection | Two-tier: hard banner budget (exists) + derived savings floor; drift stays in ledger, not CI |
| Where the check lives | Static delta check in vitest (no MCP server); live measurement stays manual/CI script |

## 4. Recommendations

1. Extend measurement to compute the CLI delta statically: `CLI_TOOLS` set × manifest def bytes vs `buildTransportBanner` bytes → `{dropped_def_bytes, banner_bytes, savings_bytes, savings_pct}`. No MCP server needed.
2. Emit a `runtime_state_record` row per run (`kind: context-savings-measurement`, `source_ref: local:meta-state:<finding-id>`) — this is the core unmet gap.
3. Add vitest guard next to `cli-sessionstart-banner.test.js`: banner budget (exists) + savings floor derived from current CLI_TOOLS set — fails if a read tool re-enters the MCP surface without banner sync.
4. Wire one narrow entry point (`pnpm measure:context`), manual-first; escalate to CI only after ledger evidence shows cadence is useful.
5. Resolve the finding only after a recorded run is verified via `runtime_state_read`, citing `local:meta-state:<id>`.

## 5. Full-surface measurement (runtime defaults incl. system prompt)

Feasible but bounded by **observability**, not effort.

| Class | Examples | Measurable? |
|---|---|---|
| Loop-owned | MCP defs, banners/hooks, sidecar, CLAUDE.md | ✅ Exact bytes, offline, reproducible |
| Runtime-owned | System prompt, built-in tool defs, env block, skill/agent catalog, memory injection | ⚠️ Not directly observable — never written to any file; only inferable |

**Difficulties:**
1. **System prompt is a black box** — no hook/env/API exposes it. Only ground truth: session transcript JSONL `usage` token counts, which exclude the system prompt text. Size only inferable as `turn-1 input_tokens − known surfaces` (tokenizer noise).
2. **Bytes ≠ tokens** — token-true counts exist only retrospectively in transcripts. Two pipelines required, never one.
3. **Confounded drift** — runtime surfaces change silently on Claude Code upgrades / skill installs. Ledger rows need a `claude_code_version` dimension or regression detection cries wolf.

**Design:**
- Two-tier measurement, don't unify: deterministic byte-pipeline for loop-owned (where your regressions live); separate transcript-telemetry step for token totals.
- Runtime baseline as residual, not target: `turn-1 input − known loop surfaces`, recorded with version + skill/agent count dimensions.
- Rejected: API proxying (KISS violation, breaks auth); tokenizer dep (wrong tokenizer, ±5% estimate suffices).

**Phasing:**
- Phase 1 (closes finding): CLI delta + ledger record + vitest guard — all loop-owned, all exact.
- Phase 2 (optional): transcript parser (tolerant, skip-don't-fail on schema change) emitting residual-baseline rows; validate stability across 3–5 sessions before any drift detection.

## 6. Unresolved questions

- Should the measurement row record all surfaces or CLI-delta-only? (Leaning CLI-delta-only per scope.)
- Cadence trigger: manual-only, pre-push, or scheduled CI? (Recommend manual-first — user call.)
- Subagent transcript roll-up into parent session record — defer to Phase 2 data.
