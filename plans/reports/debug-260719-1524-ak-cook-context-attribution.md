# Debug Report: ak:cook Context Consumption Attribution

**Date:** 2026-07-19 15:24 | **Session examined:** `7b63f076-b35d-4d53-9d1d-2732d78bbe39` (`/ak:cook --auto plans/260719-1428-central-skills-management/plan.md`) | **Status:** Root cause confirmed

**Addendum 2026-07-19 20:45:** second data point — session `b96b96c3-0808-4a40-8a2b-466b84a50975` (`/ak:problem-solving`), observed at ~20k fresh context. Analysis below (§ Addendum). Original attribution **holds, scoped**: the "hog" surfaces are a property of the full-surface request path, not of the session — both examined sessions ran on third-party models via proxy, and the request-construction difference between providers (MiniMax-M3 67.9k first call vs GLM-5.2 9.3k) dwarfs every surface in the table.

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

## Addendum: Session 2 — `b96b96c3` (ak:problem-solving), the ~20k data point

Event: this session invoked `/ak:problem-solving` and was observed at ~20k fresh context. Transcript forensics + per-call `usage` fields explain the gap.

### Measured (API usage fields, not byte estimates)

| | 7b63f076 (ak:cook) | b96b96c3 (ak:problem-solving) |
|---|---|---|
| Model | `MiniMax-M3` (via proxy) | `hf:zai-org/GLM-5.2` (via CCS proxy) |
| First-call input tokens | **67,890** (cache_read 128) | **9,322** (cache_read 0) |
| Peak input tokens | ~105,670 | 26,038 (12-call progression 9.3k→26k) |
| Prompt caching | active (cache_read to 94,080) | **none** — cache_read=0 AND cache_creation=0 all session; every token fresh every call |
| Skill direct injection | 12,964B (~3.2k) | 5,713B (~1.4k; SKILL.md text 4,234B) |
| Recorded injections (transcript) | 108,927B | ~101,260B (SessionStart hooks 33,703B + skill_listing 32,417B + agent_listing 22,397B + UserPromptSubmit 7,030B + command 5,713B) |
| Injection → wire ratio | ~1:1 (full surface delivered) | **~1:0.37** — 101KB recorded (~25k tokens) cannot fit a 9,322-token first request |
| MCP server | connected, used | connected, used (`meta_state_list` succeeded) |
| Work done | plan execution | 7 Bash / 11 Read / 1 Write → `plans/reports/problem-solving-260719-2029-runtime-state-records-sandbox-handoff.md` |

### What's different between the sessions

Not the skill (3.2k vs 1.4k — both trivial), not caching (GLM had zero cache; everything counted was fresh). **The provider/proxy request construction.** The GLM/CCS path drops most harness-recorded attachments from the wire: SessionStart hook outputs and skill/agent listings were recorded in the transcript but cannot have been delivered (they alone exceed the 9.3k total). The model did see the UserPromptSubmit hook (its thinking quotes the report-naming line from it) and a working tool set — so the path sends a compact system prompt + the prompt-local hook + a functional-but-bounded tool surface (the full 20.6k MCP defs are excluded by arithmetic; whether a subset, a compressed form, or provider-uncounted tool defs is undetermined from the transcript). Behavioral corroboration: the GLM session never referenced SessionStart hints (0 mentions in thinking; no `loop_describe` call) — consistent with those attachments never reaching it.

### Does the original analysis still hold?

**Yes, with an explicit scope qualifier.**

1. **Full-surface path — unchanged, now measured.** The attribution table (MCP 20.6k + hints ~6k ≈ 44% of ~60k) was byte-forensics; 7b63f076's usage fields give the real first-call total: **67,890 input tokens**, consistent with the component sum. On this path "MCP + hints is the hog" stands.
2. **Strengthened core claim.** The GLM session is existence proof that the 60k surfaces are separable from the session itself: same task class, same skill mechanism, same recorded injections — delivered at 9.3k fresh with MCP functional. The bump was never caused by ak:cook (or any skill); it is a property of the delivery policy.
3. **New confound, flagged.** Both examined sessions ran on third-party models via proxy. The "60k baseline" is the *full-surface proxy config's* behavior, not a universal constant. Any native-Claude baseline still needs its own measurement (unresolved Q2 below).
4. **Recommendation recalibration.** Recs 1–2 (slim MCP schemas, compress SessionStart hints) pay only on the full-surface path — on the lean path those surfaces are already absent. The functional risk inverts: hint-dependent behaviors (e.g. "call `loop_describe` at session start", process-hint discipline) **silently do not fire** on the lean path. Enforcement that matters must not live in SessionStart injection — which is already the loop's gates-not-prose position; this is measured evidence for it.

## Addendum 2: Delivery reliability — profile-dependent injection (separate from the context problem)

Operator question: a *model config* causing harness instructions not to inject is weird and makes the flow unreliable. Mechanism now config-identified.

### Mechanism

CCS profiles differ in request construction (`~/.ccs/*.settings.json`):

| Profile | Env | Effect |
|---|---|---|
| `syn` (GLM-5.2, `api.synthetic.new/anthropic`) | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `CLAUDE_CODE_ATTRIBUTION_HEADER=0` | lean-request mode — recorded surfaces stripped from wire |
| `mm` (MiniMax-M3) | neither set | full-surface delivery (67,890 first-call) |

Lean delivery is **config-chosen, silent at runtime, transcript-blind** — not random provider behavior. Exact strip point (harness flag vs. proxy transform) remains unverified without a wire capture.

### The reliability chain: injection ≠ delivery ≠ compliance

- **Delivery gap** — b96b96c3: ~101KB recorded (~25k tokens) → 9,322-token first request.
- **Compliance gap** — 7b63f076: full injection → cook's HARD-GATEs ignored, 0 subagents.
- Any reliability design that only asks "did we inject" is unsound at both ends.

### What survives vs. what degrades

**Survives (delivery-independent):** hooks *execute* harness-side on the lean profile (SessionStart ran, wrote `session-context.json`) — only the hook's *prompt channel* is cut. Gates need no prompt channel (bash gate blocks regardless of model). MCP tool contracts re-deliver at invocation time. Observed graceful degradation: the GLM session used `meta_state_list` correctly, followed report naming, shipped its report.

**Degrades (push-dependent):** state-1 steering — discovery rituals (`loop_describe` at start), process-hint discipline, canonical-tool preferences. Silent, zero error signal. Risks ranked: (a) citizenship drift across profiles; (b) measurement corruption — "model ignored hint" vs. "hint never sent" indistinguishable from behavior, so cross-profile compliance metrics are unsound without delivery tagging; (c) profile switches are user-initiated and invisible to the loop.

**Doctrine fit:** this is the loop's own `rule-runtime-agnostic-features` arriving at a new surface — a provider profile *is* a runtime surface with different injection fidelity (shim-not-fork; don't assume surface semantics carry). Plus end-to-end principle: correctness-critical state at endpoints (registry, gates); steering should be pull, not broadcast-and-pray.

### Recommendations (delivery reliability, ranked)

1. **Attest, don't assume** — one wire capture at the proxy boundary per profile → per-profile delivery manifest. One-time cost; converts unknowns into a table.
2. **Pointer-not-payload steering** — UserPromptSubmit hook provably survives the lean path (GLM model quoted it). Carry a one-line pointer (`loop_describe` warm / `.claude/session-context.json`) there; keep payloads pull-based. Same change as context rec #2 — two justifications, one fix.
3. **Tag sessions by delivery path** — SessionStart hook records active profile (reads `CCS_DROID_PROVIDER` / `ANTHROPIC_BASE_URL`). Fixes measurement corruption (2b) for future forensics.
4. **No closed-loop correction yet** — no observed damage; revisit only if a session verifiably breaks from missing steering.

Recorded as meta-state finding: `meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent` (open, warning, `loop-anti-pattern`/`push-dependent-steering`, evidence `session-start-inject-discoverability.cjs:207`). The registry entry is the source of truth; this section is the narrative companion.

## Recommendations (ranked by context saved per effort)

1. **Slim MCP tool schemas (target: 20.6k → ~10k).** (a) `meta_state_patch`: replace the inlined 4-branch union with a shared-core schema + per-kind lookup (schema details are already in `core/meta-state.js`; the tool could accept a `kind`-discriminated flat shape or serve per-kind schemas on demand). (b) Trim only cross-tool duplicated discoverability prose (boilerplate that already lives in hints / `tool-selection-guide.md`); **keep every per-tool invocation contract intact** (stages, gating, field semantics, idempotency) — the contract-completeness constraint from `meta-260704T0959Z` above. Zero behavior change; saves every session.
2. **Compress SessionStart hints (~6k → ~1.5k).** 26 hints, each a long paragraph; the full set already lives in `.claude/session-context.json` and `loop_get_instruction({key})` exists for on-demand recall. Emit one-line pointers (id + 5-word gloss + "full: loop_get_instruction"). This is the loop applying its own state-2 pattern to itself.
3. **Defer cook internalization; keep plan → journal order.** If/when cook is internalized, scope it as *gates-not-prose*: consult-gate for plan-exists-before-code, workflow tool for subagent dispatch. Expect context-neutral outcome; justify on enforcement grounds.
4. **Not loop-owned, noted for completeness:** `skill_listing` (8.1k, ~130 verbose descriptions) and `agent_listing_delta` (5.6k) are platform/ak-family surfaces; ak:* description slimming would pay per-session but is upstream of this repo.

## Verification Method

- Transcript forensics: per-line byte sizes of `7b63f076…jsonl` (first 19 lines = pre-first-response injection, 108,927B user-side), tool-call extraction via jq, grep for reference loads (0) and subagent spawns (0).
- MCP wire measurement: live `tools/list` against `tools/learning-loop-mastra/mastra/server.js` (`LOOP_SURFACE=.claude`), 44 tools / 82,516B.
- Baseline cross-check: `0dc4d44a…jsonl` post-`/clear` shows identical hook + hint injection with no skill invoked (transcript-only; that session recorded no `usage` fields).
- claudeMd: `wc -c` on `~/.claude/rules/*.md` + project `CLAUDE.md` = 23.6KB.
- Addendum: `b96b96c3…jsonl` — per-call `message.usage` extraction via jq (model, input/cache tokens), attachment inventory + parent/timestamp ordering, thinking-block grep for hint references (0), tool-call census (7 Bash / 11 Read / 1 Write / 1 MCP).

## Unresolved Questions

1. ~~Base system prompt + builtin tool definitions (~10k) estimate~~ — **partially resolved by addendum**: 7b63f076's first-call total is measured at 67,890 input tokens via usage fields, bounding system+tools to ~7k over the component sum. Per-component split of system vs. builtin tools still not directly measurable from repo artifacts.
2. Both proxy configs recorded listings/hooks in the transcript, but GLM-5.2 proves **transcript presence ≠ wire delivery**. What each provider path actually sends (attachment filter? MCP tool subset or compressed defs? claudeMd inclusion?) needs a request capture at the proxy boundary — not measurable from transcripts.
3. No native-Claude (unproxied) baseline exists yet: both measured sessions ran on third-party models. Whether the full-surface shape (67.9k first call) reproduces on native Claude with the same harness config is unverified.
4. `meta_state_patch` schema slimming (rec. 1a) changes the MCP wire contract — needs a loop-design entry and drift check against `meta-state-patch-tool.js` consumers before implementation.
