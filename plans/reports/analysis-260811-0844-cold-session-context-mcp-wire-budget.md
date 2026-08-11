# Analysis — cold-session context & the MCP wire budget (state-3 refactor seams)

**Finding:** `meta-260811T0805Z-manifest-context-budget-raised-a-second-consecutive-time-mcp`
**Date:** 2026-08-11
**System:** meta-state-tools
**Category:** budget-check | **Severity:** warning
**Evidence:** `tools/learning-loop-mastra/__tests__/mcp-wire-budget.test.js`
**Status:** open (this report is the optimization study the finding mandates; the finding
itself stays open until the ceiling is restored or re-anchored)

## Executive summary

The finding records that the MCP manifest context budget was raised a second consecutive
time (55,000 → 55,750 bytes) to absorb `meta_state_list` tool-doc growth. The mandate is
to optimize the tool wire below 55,000 and restore the tighter ceiling.

**The central reframe: the 55 KB wire is a test-only number. The model never sees it in
production.** Every production runtime sets `LOOP_RECORDS_VIA_CLI=1`, which makes
`mastra/server.js` skip all 42 CLI tools at registration time (server.js:71). The MCP
`listTools` response the model actually receives is **8 tools / 4,563 bytes** — 1/12th of
the 55 KB. The 55 KB is what the *budget test* measures, and it measures it by deliberately
booting the server *without* the flag (`with-mcp-server.js` does not set it). So the 55 KB
is a **boundary guard against a forgotten flag**, not a production context cost.

This splits the finding's mandate into two questions with different stakes:

- **What the budget test guards (55 KB):** trim it back below 55,000 to stop the
  repeated-bump cycle. This is *insurance against a misconfiguration* (dev/test without the
  flag, a future runtime that forgets it, an `LOOP_RECORDS_VIA_CLI=0` rollback). It buys
  zero production context back.
- **What the model actually sees in production (~46 KB injected):** steering context
  (26 KB), SessionStart hints (11.8 KB), the transport banner (3.9 KB), and the 4.5 KB
  MCP residue. None of these is what the budget test measures. The on-demand `loop_describe`
  cold tier (540 KB full) is the largest pull, already tiered.

The recoverable 55 KB lives in **schema-embedded description prose (11,208 of 35,565 schema
bytes) and duplicated enum annotations, not in tool descriptions.** Only **247 bytes** are
needed to restore 55,000; a structural state-3 refactor compresses far more and removes the
manual drift-test surface that caused the repeated bumps.

**Q1 resolved (restore vs re-anchor): not a live either/or.** Re-anchoring to a tighter
ceiling requires Option B to have shrunk the wire and the result *measured* — it is not
actionable today, only estimable. So: **do A now** (247-byte trim restores 55,000 with
certainty; satisfies the finding's literal mandate, low-risk, non-blocking) and **defer the
re-anchor to post-B**, set against B's *measured* wire + headroom, not today's estimate. B's
optimistic floor — 159 inlined schema descriptions (10,299 bytes) → glossary refs at ~32
bytes each — shrinks the wire to **~50,110 bytes**, so a post-B ceiling near ~51–52 KB is
*likely* sustainable. The realistic shrink is smaller (not every inlined desc maps 1:1 to a
glossary ref; conversion ratio < 1), so the exact ceiling waits on B's measurement, not this
estimate. A is a stopgap that closes the finding now; B is the durable fix that makes the
re-anchor settable.

(MCP wire + residue figures re-measured live on 2026-08-11. The injected-surface figures
— steering, hints, banner — are from the original pass and not re-measured this session.)

## What the model actually sees in production (this runtime)

| Item | Bytes | Injection |
|---|---|---|
| Steering context (CLAUDE.md 3.6K + AGENTS.md 22.5K) | 26,167 | deterministic (system prompt) |
| SessionStart hints (discoverability + process) | ~11,800 | deterministic, 2 hooks (10K harness cap) |
| MCP residue wire (8 tools) | 4,563 | deterministic (MCP server) |
| SessionStart transport banner + write-tool sketches | ~3,912 | deterministic (hook) |
| `loop_describe` warm tier (default recommendation) | ~19,170 | pull, per-call |
| `loop_describe` cold tier (on-demand, NOT injected) | 540,389 full / 298,523 summary | pull, per-call |

The two biggest **injected** items are the steering context (26 KB) and the SessionStart
hints (11.8 KB). The biggest **on-demand** item is `loop_describe` cold tier (540 KB full),
dominated by 151 finding `description` fields — already tiered; `summary` mode cuts it to
55%. The MCP residue (4,563 bytes) is a minor injected item, not the dominant lever.

## The 55 KB: what the budget test measures and why it's still worth bounding

The budget test measures the **default-env MCP surface** (44 tools, 55,247 bytes). It does
this by booting the server *without* `LOOP_RECORDS_VIA_CLI` — `with-mcp-server.js` spreads
`process.env` and sets `LOOP_SURFACE`/`GATE_ROOT`/`MASTRA_STORAGE_DRIVER` but not the
records-via-CLI flag. With the flag unset, all 44 manifest tools register; with it set,
server.js:71 `continue`s past every `CLI_TOOLS` member and only the residue registers:

| Surface | Tools | Bytes | When loaded |
|---|---|---|---|
| Budget test (no flag) | 44 | 55,247 | test only |
| Production (`LOOP_RECORDS_VIA_CLI=1`) | 8 | 4,563 | every real runtime |

All three production runtimes set the flag (`.mcp.json`, `.mastracode/mcp.json`,
`.factory/.mcp.json`). The 8-tool residue is `workflow_generate_prompt`,
`check_runtime_agnostic`, `update_r2_allowlist`, the 3 `ask_*` agents, and 2 storage
round-trip tools. The 42 CLI tools ride `loop.mjs`.

So the 55 KB guards three **misconfiguration** cases — a dev/test run without the flag, a
future runtime that forgets it, an `LOOP_RECORDS_VIA_CLI=0` rollback — and that is why it
is still worth bounding: it is regression protection against the flag being dropped, not a
production context win. Optimizing it satisfies the finding's literal mandate and stops the
bump cycle; it does not buy production context back. That distinction is the spine of the
options below.

## Where the recoverable 55 KB lives (wire breakdown)

| Surface | Bytes |
|---|---|
| 44-tool MCP manifest wire (budget test measures this) | **55,247** |
| — tool `description` prose | 16,495 |
| — schema bytes | 35,565 |
| — schema-embedded `description` bytes | 11,208 |
| — "See field_glossary." reference bytes | 909 |
| Current ceiling (55,750) headroom | 503 |
| **To restore 55,000: need to trim** | **247** |

Both budget tests pass today (`mcp-wire-budget` and `cli-context-savings` → exit 0).
This is preventive, not failing.

## State-3 seam analysis ("refactor some to state-3")

State-3 = deterministically injected **and** deterministically consumed/compressed by code,
vs state-2 = injected + agenticly consumed. Three real seams:

### Seam 1 — field-glossary references (already state-3, partially applied)

`core/field-glossary.js` holds 19 shared field definitions; the cold tier delivers them;
schemas that opt in emit `"See field_glossary.<field>"` instead of inlined prose.
`meta_state_log_change` (4,152 schema bytes, the #1 wire contributor) already does this —
its 913 schema-desc bytes include 319 bytes of glossary refs.

**Extending the pattern is the biggest single structural win** because it kills the
redundancy that drives growth: the same field described three times (tool desc, schema
desc, glossary entry). The 11,208 schema-embedded description bytes are the largest
recoverable block (~20% of the wire, ~31% of schema bytes, is description prose).

Current coverage: 3 handlers use it (`meta_state_log_change`, `meta_state_report`,
`meta_state_propose_design`). 909 of 11,208 schema-desc bytes are already refs — meaning
**~10,299 bytes of schema description prose are still inlined** and are the extension target.

Measured inventory for the B estimate: **159 inlined descriptions** (avg 65 bytes) vs **28
existing refs** (avg 32 bytes). Optimistic conversion (1 inlined → 1 ref) shrinks the
description block by ~5,137 bytes → wire ~50,110. Realistic shrink is less (multi-field
prose and entries with no glossary mapping convert at ratio < 1), so ~50,110 is the floor,
not the expected value. The top inlined-prose tools: `meta_state_list` (12 descs / 1,441B),
`meta_state_batch` (12 / 998B), `meta_state_promote_rule` (14 / 954B), `gate_mark_preflight`
(1 / 626B), `meta_state_log_change` (13 / 594B inlined + 10 refs already).

### Seam 2 — the CLI sketch table (the closest model-visible state-3 candidate)

The SessionStart transport banner embeds a hand-maintained table of 30 write-tool arg
sketches (2,601 bytes of the 3,912-byte banner). Each `loop.mjs <tool> '{...}'` sketch
inlines enum values that already live in the zod schema. A drift test
(`cli-write-hint-sketch-drift.test.cjs`) manually keeps the table in sync.

The `category`/`severity` annotations already derive enums from `core/constants.js`
(inline, at module load). **Generalizing that to all sketch enums** turns the hand-maintained
table into deterministic output — the same simplification cascade: "all enum annotations
are the same thing underneath: the schema enum."

### Seam 3 — `loop_describe` cold-tier compression (biggest on-demand item)

540 KB full / 298 KB summary, dominated by 151 finding `description` fields. The
compression lever already exists (`description_mode: "summary"`, 200-char previews).
The state-3 move is making **deterministic consumption start with summary** and pull
full text per-id only when needed — the model never auto-loads 540 KB.

## Problem-solving lens

**Inversion** ("optimize the wire" → "why does the model see the wire at all?"): the
55 KB wire exists only for non-CLI-opted runtimes. The production cold-session cost is
the injected steering + hints, and the on-demand cold tier. Optimizing the MCP wire is
correct (the finding demands it) but is insurance on a boundary guard, not the dominant
lever.

**Simplification cascade** ("all field descriptions are the same thing underneath —
glossary entries"; "all sketch enums are the same thing underneath — the schema enum"):
one abstraction eliminates per-tool redundancy across 44 handlers and deletes the manual
drift-test surface. This is the cascade the repeated budget bumps signal: "just need to
trim one more description" repeats because the redundancy is structural, not accidental.

## Options

The options split into two tiers by what they actually buy. Tier 1 (production context)
attacks what the model sees; tier 2 (test guard) attacks what the budget test measures.

### Tier 1 — production-context levers (what the model actually sees)

| Option | Scope | Effect | Risk |
|---|---|---|---|
| **P1. Steering trim** | Cut/relocate steering prose in CLAUDE.md (3.6K) + AGENTS.md (22.5K) | Shrinks the largest *injected* item (26 KB) — real production context back | Medium; steering is load-bearing, contract-adjacent |
| **P2. Hints trim** | Compress the 2 SessionStart hint hooks (~11.8 KB) | Shrinks the 2nd-largest injected item | Medium; touches discoverability surface |
| **P3. Cold-tier summary-first** | Flip `loop_describe` default to `description_mode:"summary"` (or make summary the recommended SessionStart call) | Caps the largest *on-demand* pull at 298 KB instead of 540 KB | Low–Medium; behavioral or non-breaking variant (see Q3) |

Tier 1 is where production context is actually recovered. It is **not** what the finding
mandates, and is out of scope for this study except to name it — the finding is about the
55 KB test guard.

### Tier 2 — the 55 KB test guard (what the finding mandates)

| Option | Scope | Effect | Risk |
|---|---|---|---|
| **A. Quick trim (restore 55,000)** | Trim ~247 bytes of prose from top descriptions (`meta_state_patch` 996B, `gate_mark_preflight` 941B, `meta_state_refresh_file_index` 829B, `meta_state_list` desc) | Restores the tighter ceiling, satisfies the finding's literal mandate. **Insurance against a forgotten flag — zero production context back.** | Low; 20-30 min |
| **B. Glossary-extend (structural)** | Extend the `See field_glossary.` ref pattern to the remaining ~10,299 bytes of inlined schema-desc prose (159 descs) | Shrinks the test guard structurally (optimistic floor ~50,110 bytes; realistic higher); keeps tool descs + glossary in one place; stops the bump cycle; **unlocks the post-B re-anchor** | Medium; touches every handler schema + `field-glossary.test.js` |
| **C. Derive sketch enums from schema** | Replace hand-written sketch enum annotations with schema-derived generation | Removes the manual drift-test surface on the session banner (a Tier-1 surface, not the wire) | Medium; touches the sketch table + `cli-write-hint-sketch-drift.test.cjs` |
| **D. Full state-3** | B + C, plus cold-tier summary-first (P3) | Largest, durable compression across both tiers | High; multi-file, contract-adjacent |

Recommended sequence: **A** now (unblocks the finding immediately, low risk, honest about
being insurance) → **B** as a plan-gated follow-up (the structural fix that makes the bump
cycle stop) → **re-anchor decided post-B** against B's measured wire (Q1, resolved as
deferred, not pre-B) → **C** as a separate plan. Tier 1 (P1/P2/P3) is named for awareness;
it is a separate decision from the finding.

## Open questions

1. **Scope boundary:** A alone satisfies the finding. Is B/C authorized now, or deferred
   to a dedicated plan (it touches every handler schema + 2 drift-test-guarded surfaces)?
2. **Cold-tier default:** should `loop_describe` default `description_mode` flip to
   `"summary"` (behavioral change) or stay `"full"` with summary as the recommended
   SessionStart call (non-breaking)?
3. **Tier 1 authorization:** are P1/P2 (steering + hints trim) in scope for this work, or
   explicitly deferred? They are the real production-context levers but are not what the
   finding asks for.

(Originally Q1 — restore 55,000 vs re-anchor — is resolved in the executive summary: do A
now, defer re-anchor to post-B against the measured wire.)

## Status

Status: DONE — analysis complete; no code changed. The *study* is done; the finding's
*mandate* (restore the ceiling) is not — it stays open until A lands (restore 55,000) or B
lands (shrink + post-B re-anchor).
Summary: Reframed the 55 KB as a test-only boundary guard (production loads 8 tools /
4,563 bytes via `LOOP_RECORDS_VIA_CLI=1`; the test measures 44 tools / 55,247 bytes without
the flag). Split options into Tier 1 (production-context levers: steering 26 KB, hints
11.8 KB, cold-tier summary-first) and Tier 2 (the 55 KB test guard: A quick-trim 247B,
B glossary-extend, C sketch-derive). Resolved Q1: do A now, defer re-anchor to post-B
against the measured wire (B optimistic floor ~50,110 bytes from 159 inlined descs /
10,299 bytes → ~32-byte refs). Identified 3 state-3 seams. Recommended A → B → post-B
re-anchor → C.
Concerns: none blocking; B touches the widest surface and should be plan-gated; the
~50,110 post-B figure is an optimistic floor (conversion ratio < 1 in practice), so the
re-anchor ceiling must be set against B's measured result, not this estimate.