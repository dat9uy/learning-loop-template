# Debug Report: ak:cook Context Consumption Attribution

**Date:** 2026-07-19 15:24 | **Session examined:** `7b63f076-b35d-4d53-9d1d-2732d78bbe39` (`/ak:cook --auto plans/260719-1428-central-skills-management/plan.md`) | **Status:** Root cause confirmed

## Executive Summary

The 60k context bump after running `/ak:cook` is **not caused by ak:cook**. The skill's direct injection is **~3.2k tokens (5%)**. ~57k was already present as the post-`/clear` baseline: any first prompt — even empty — reproduces ~60k. The dominant consumer is the learning loop's **own MCP tool surface (20.6k, 34%)**, followed by base system prompt, skill/agent listings, global rules, and the loop's SessionStart hint injections.

Implication for the internalization question: internalizing ak:cook is a **context-neutral to context-negative** move (its 3.2k on-demand cost would become always-on loop surface). The documented philosophy.md migration order (plan → journal → cook) remains sound; context savings should be pursued in the loop's own surfaces instead.

## Root Cause: Measured Attribution of the ~60k First-Turn Context

| # | Surface | Bytes | ~Tokens | Share | Source |
|---|---------|-------|---------|-------|--------|
| 1 | MCP learning-loop tool defs (44 tools) | 82,516 | ~20.6k | 34% | measured via live `tools/list` |
| 2 | Base system prompt + builtin tools | ~40,000 | ~10k | 16% | estimate (not in transcript) |
| 3 | `skill_listing` attachment (~130 skills) | 32,431 | ~8.1k | 13% | transcript line 13 |
| 4 | claudeMd (7 global rule files 21.4KB + project CLAUDE.md 2.2KB) | 23,600 | ~5.9k | 10% | measured on disk |
| 5 | SessionStart hooks (session state + 10 process hints + 16 discoverability hints) | ~25,000 rendered | ~6k | 10% | transcript lines 4-8 |
| 6 | `agent_listing_delta` (~27 agents) | 22,425 | ~5.6k | 9% | transcript line 12 |
| 7 | **ak:cook (command 679B + SKILL.md 12,285B)** | **12,964** | **~3.2k** | **5%** | transcript lines 10-11 |
| 8 | UserPromptSubmit hook | 7,054 | ~1.8k | 3% | transcript line 16 |
| | **Total** | | **~61k** | | matches observed 60k |

Token math: ~4 chars/byte. Baseline without ak:cook ≈ 57k — the bump appears with **any** first prompt after `/clear`. Verified against a second session (`0dc4d44a`, post-`/clear`): same hooks re-fire, same listings inject.

## Supporting Findings

1. **ak:cook's `references/*.md` (24.7KB) were never loaded** in 7b63f076 (0 reads). SKILL.md is the skill's entire direct footprint.
2. **Zero subagent spawns** (`Agent`/`Task` tool calls) despite SKILL.md's "CRITICAL ENFORCEMENT: steps 4,5,6 MUST use Task tool… If workflow ends with 0 Task tool calls, it is INCOMPLETE". The mandated `code-reviewer`/`tester`/`docs-manager` delegation never happened. The 3.2k of instructions was paid for and its key enforcement sections ignored — direct evidence for philosophy.md's claim that state-1 agentic injection is unreliable for *enforcement*.
3. **Real session growth was task content, not skill overhead**: plan.md + 3 phase files = 123,837B (~31k tokens) across 4 Reads; total transcript 1.69MB by end. Subagent isolation (mandated but unused) would have kept much of this out of main context.
4. **The loop already owns the largest surface**: MCP schemas 20.6k + SessionStart hints ~6k ≈ 27k of the 60k (44%). The single biggest item is `mastra_meta_state_patch` at 20,789B (~5.2k tokens) — one tool, 25% of the MCP wire.

## Top MCP tools by wire size (measured)

| Bytes | Tool |
|-------|------|
| 20,789 | `meta_state_patch` (4-branch union schema inlined) |
| 7,603 | `meta_state_report` |
| 5,196 | `meta_state_log_change` |
| 3,574 | `meta_state_list` |
| 3,057 | `meta_state_batch` |
| 2,441 | `meta_state_promote_rule` |

Top 10 of 44 tools ≈ 50KB of the 82.5KB total.

## Analysis vs. philosophy.md

- Pillar 4 documents the migration path **ck:plan → ck:journal → ck:cook** — cook explicitly last ("full execution mechanics… non-trivial", state-3 terminus). Flipping to cook-first contradicts the documented smallest-first, lowest-risk-first sequence.
- The "skills are escape hatches" argument for internalization is about **injection timing/reliability**, not context size. On context, the trade is backwards: cook's 3.2k is paid *only when cooking*; loop-owned equivalents (rules, hints, gates) are paid *every session*.
- Finding 2 above is the coherent argument for cook internalization: its HARD-GATEs and subagent mandates are enforcement-shaped, and prose failed to enforce them. That justifies wiring cook's *gates* as consult-gates (state-2/3) — an enforcement project, not a context project.

## Related Registry State: `meta-260704T0959Z-orchestrator-session-read-the-full-326-line-source-of-tools`

Open finding (`loop-anti-pattern`/`agent-tool-overread`, no refs): orchestrator read the full 326-line source of `meta-state-dispatch-finding-tool.js` before invoking it (~3.5K tokens, zero signal) — the schema description already carried the full contract. Relationship to this report:

1. **Same meta-pattern, different locus.** Finding = per-call behavioral waste (agent over-reads source); this report = per-session structural waste (oversized always-on surfaces). Distinct problems; neither subsumes the other.
2. **Constraint on rec 1.** The finding's rule 1 ("the MCP schema description IS the canonical contract") requires descriptions to stay invocation-complete. Slimming must remove only cross-tool duplicated discoverability prose, never per-tool contract content (stages, gating, field semantics, idempotency) — else agents revert to source reads, recreating the flagged anti-pattern. Synergy: `meta_state_patch`'s 20.8KB schema is too large to function as a skim-able contract; de-inlining serves both this report and the finding.
3. **ak:cook link.** The finding blames cook's `HARD-GATE-SCOUT-FIRST` for over-application (scout reflex fired at the tool being invoked); this report found cook's mandates under-applied (0 subagents). Prose gates fail in both directions — compliance and scope — reinforcing "gates-not-prose" for any cook internalization.

Status: finding is open and unpromoted; its 4 suggested rules are dormant prose. Promotion to an `agent-checklist` rule is a separate optional action, out of scope here.

## Recommendations (ranked by context saved per effort)

1. **Slim MCP tool schemas (target: 20.6k → ~10k).** (a) `meta_state_patch`: replace the inlined 4-branch union with a shared-core schema + per-kind lookup (schema details are already in `core/meta-state.js`; the tool could accept a `kind`-discriminated flat shape or serve per-kind schemas on demand). (b) Trim only cross-tool duplicated discoverability prose (boilerplate that already lives in hints / `tool-selection-guide.md`); **keep every per-tool invocation contract intact** (stages, gating, field semantics, idempotency) — the contract-completeness constraint from `meta-260704T0959Z` above. Zero behavior change; saves every session.
2. **Compress SessionStart hints (~6k → ~1.5k).** 26 hints, each a long paragraph; the full set already lives in `.claude/session-context.json` and `loop_get_instruction({key})` exists for on-demand recall. Emit one-line pointers (id + 5-word gloss + "full: loop_get_instruction"). This is the loop applying its own state-2 pattern to itself.
3. **Defer cook internalization; keep plan → journal order.** If/when cook is internalized, scope it as *gates-not-prose*: consult-gate for plan-exists-before-code, workflow tool for subagent dispatch. Expect context-neutral outcome; justify on enforcement grounds.
4. **Not loop-owned, noted for completeness:** `skill_listing` (8.1k, ~130 verbose descriptions) and `agent_listing_delta` (5.6k) are platform/ak-family surfaces; ak:* description slimming would pay per-session but is upstream of this repo.

## Verification Method

- Transcript forensics: per-line byte sizes of `7b63f076…jsonl` (first 19 lines = pre-first-response injection, 108,927B user-side), tool-call extraction via jq, grep for reference loads (0) and subagent spawns (0).
- MCP wire measurement: live `tools/list` against `tools/learning-loop-mastra/mastra/server.js` (`LOOP_SURFACE=.claude`), 44 tools / 82,516B.
- Baseline cross-check: `0dc4d44a…jsonl` post-`/clear` shows identical hook + hint injection with no skill invoked.
- claudeMd: `wc -c` on `~/.claude/rules/*.md` + project `CLAUDE.md` = 23.6KB.

## Unresolved Questions

1. Base system prompt + builtin tool definitions (~10k) are not recorded in transcripts; the 10k figure is an estimate. Exact size needs an API-side token count (e.g. `count_tokens` on a captured request) — not measurable from repo artifacts.
2. Whether `agent_listing_delta`/`skill_listing` re-inject on *every* first turn after `/clear` vs. only on listing changes — both examined sessions show them, but a third data point (prompt after clear with no skill) would confirm.
3. `meta_state_patch` schema slimming (rec. 1a) changes the MCP wire contract — needs a loop-design entry and drift check against `meta-state-patch-tool.js` consumers before implementation.
