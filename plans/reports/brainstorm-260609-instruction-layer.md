---
title: Brainstorm — Adopt loop-design-instruction-layer (drive to inactive)
date: 2026-06-09
status: approved
skill: ck:brainstorm
sub_skills: [ck:context-engineering, ck:predict]
target_finding: meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si
target_design: loop-design-instruction-layer
ttl_pressure: 2026-06-10T14:02:41.798Z
---

# Brainstorm — Adopt `loop-design-instruction-layer` (drive to inactive)

## Problem statement

The next-up finding `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-status-active-si` (status `reported`, expires 2026-06-10T14:02:41.798Z) targets the active loop-design `loop-design-instruction-layer` (v1, active since 2026-06-06, addresses 0 findings, proposed_design_for 0).

The design's open question: *should we add a `loop_get_instruction` MCP tool, extend `loop_describe`, or embed the rules in AGENTS.md?*

Per operator direction: "do as much as possible to keep this inactive ... mark as 'done' because if we don't make sure the agent could figure the tool out, other design would be built on the shaky foundation."

## Framing — adopted verdict

The agent's instruction surface splits cleanly into 4 layers, each with a distinct role:

| Surface | Role | Loaded by | Cost |
|---|---|---|---|
| **AGENTS.md** | **Priority-1 prompt** — the steering layer: shape of the loop, the 5 active rules, the philosophy, the canonical paths. NOT a fallback. | Claude/Droid runtime as system context, every session | High ambient cost; high trust |
| **Tool manifest (52 tools)** | **Deterministic tool-selection surface** — what/when/inputs/returns per tool. Agent reads this when deciding which tool to call. | Agent runtime with the MCP server connection | Zero marginal; built-in |
| **`loop_describe` warm tier `discoverability_hints`** | **At-start-up injection** — meta-state-aware surface: current rules, hot findings, the Internalization Rule, the meta-vs-product split. | `.factory/hooks/loop-surface-inject.cjs` at SessionStart | ~5KB; cold-session tested |
| **`learning-loop` skill + `references/learning-loop-rules.md`** | **Prompt-author docs** — human agent authors write prompts against this; agents consume indirectly via the skill activation. | `Skill` tool activation | Variable; not always loaded |

### Why AGENTS.md is "priority-1 prompt," not "fallback"

Operator surfaced an important distinction during discovery: "if something is the context priority, we should be clear on what the prompt is for." AGENTS.md is the first thing the agent reads, and its job is to **steer** — set the shape, name the rules, point to the canonical paths. Calling it a "fallback" implies "what to do when nothing else works," which understates its role. Calling it the priority-1 prompt makes its purpose explicit: it sets the agent's orientation before tool selection begins.

### Why a new `loop_get_instruction` MCP tool is YAGNI

The 5-persona predict analysis (Architect, Security, Performance, UX/Agent-DX, Devil's Advocate) on the original 3-option question surfaced a STOP trigger:

> **Devil's Advocate**: "Agent must remember to use a tool that teaches it which tools to use" is a circular dependency. The tool that teaches tool selection is itself a tool the agent has to know about. This is the bootstrap problem all over again.

A new tool is also a YAGNI trap because:
- **Tool manifest already answers "what tool exists"** — agent reads it from MCP connection metadata
- **Tool descriptions already answer "what/inputs/returns"** — the gap is "when to use vs alternatives" (4-question framework audit, Track B)
- **`loop_describe` warm tier already answers "what's true right now"** — meta-state-aware hints (Track A)

The on-demand gap is real but tiny; the right answer is to **make the tool manifest and warm tier good enough that no on-demand lookup is needed**, not to add a 53rd tool.

## Context-engineering analysis

Per `ck:context-engineering` (high-signal tokens, just-in-time, agentic tool selection):

- **AGENTS.md cost is high and ambient** — loaded every session regardless of need. Solution: keep it short and pointer-shaped; let the deterministic surfaces carry the bulk.
- **Tool manifest is the highest-signal surface for tool selection** — agent runtime already exposes it, agent already scans it when picking a tool. Solution: audit the descriptions against the 4-question framework (what/when/inputs/returns); the "when" question is the most under-served today.
- **Warm tier `discoverability_hints` is the cheapest extension point** — already in the warm tier, already cold-session tested, the 5 active rules and the meta-vs-product split are already there. Solution: add 2 new hints (A4 + A5 below) and the on-demand gap closes.

The `loop_describe` warm tier `discoverability_hints` is the at-start-up surface (shipped in `meta-260606T1433Z-discoverability-meta-evidence-migration`); the on-demand lookup is a separate concern (this design's original question). The verdict inverts the original framing: **the on-demand lookup should not exist as a tool; the existing surfaces should be good enough that no on-demand lookup is needed.**

## Predict (5-persona) verdict

| Topic | Architect | Security | Performance | UX (Agent DX) | Devil's Advocate | Resolution |
|-------|-----------|----------|-------------|---------------|-----------------|------------|
| AGENTS.md canonical | Doc coupling to schema drift | Doc edits lack gate/audit; rules ship untracked | Loaded every session, no compression | Agents skip doc to look at tool list | Why a doc at all? tools/mcp is the source | **Reject** — doc-as-source is the deprecated escape hatch per the Internalization Rule |
| Extend `loop_describe` warm tier | Already runs at SessionStart; no new tool | Same as today; warm tier is a hint, not a rule | Cost: <1KB warm, <100ms | Hints surface at the right moment (startup); expandable | Why a separate tool if `loop_describe` already does this? | **Lean toward this** — minimal new surface; warm tier is the proven slot |
| New `loop_get_instruction` tool | 52 → 53 tools, new schema, new test surface | New attack surface: prompt injection via returned instructions | Lazy (only when called) but agent must know to call it | Anti-pattern: agent has to know to ask for help | **STOP trigger**: circular dependency | **CAUTION** — on-demand gap is real but the surface should be discoverable, not a tool the agent has to know about |
| Auto-derive AGENTS.md from active rules | Single source of truth = active rules in meta-state | Same as extend loop_describe; rules ship via canonical path | Doc generated on demand; ~5KB | Doc still ambient, but accurate | Why a doc at all? agents don't read it for tool selection | **YAGNI** — solves a different problem (human readers) |

**Verdict: CAUTION → adopt the predict verdict.** The original 3-option question is misframed. The new framing: tool manifest + warm tier are canonical, AGENTS.md is priority-1 prompt, no new tool. Track A + Track B ship the design.

## Recommended solution — two-track audit

### Track A — `loop_describe` warm tier `discoverability_hints` audit

**Current state**: 4–5 hints shipped in `tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints` (per change-log `meta-260606T1433Z-discoverability-meta-evidence-migration`).

**Audit scope (priority order)**:
- (A1) Verify the 5 active rules are surfaced (not just 2) — currently 2
- (A2) Verify the `meta-vs-product` surface split hint is present — yes (shipped)
- (A3) Verify the Internalization Rule hint is present — yes (shipped)
- (A4) Add a new hint: **"When picking a tool, prefer the canonical MCP tool over `node -e` escape hatches; the 4-question framework for tool selection is what/when/inputs/returns"** — missing
- (A5) Add a new hint: **"AGENTS.md is the priority-1 prompt; tool manifest is the deterministic tool-selection surface; warm tier hints are at-start-up injection"** — missing, closes the framing ambiguity
- (A6) TDD: extend `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` to assert A4 + A5 are present + warm tier size budget is not exceeded

**Effort**: 1 file change, 4-6 new tests.

### Track B — Tool description audit (4-question framework)

**Current state**: 52 tools in `tools/learning-loop-mcp/agent-manifest.json`. Most descriptions are 1-2 sentences and answer what/inputs/returns but rarely "when vs alternatives."

**Audit scope (prioritized)**:
- (B1) Pick the top 10 most-called tools (gate-log audit, or by description length / inputSchema complexity) and write a 1-2 sentence "When to use" line for each
- (B2) Create `tools/learning-loop-mcp/references/tool-selection-guide.md` mapping agent intent ("I want to log a system change" → `meta_state_log_change`; "I want to check if a finding is still true" → `meta_state_derive_status`; "I want to record a finding" → `meta_state_report`; etc.)
- (B3) Update `loop_describe` warm tier hint A4 to reference the new guide
- (B4) TDD: add `tools/learning-loop-mcp/__tests__/tool-description-audit.test.cjs` asserting every tool description answers the "When" question (regex check for "Use when" / "vs" / "instead of")

**Effort**: 1 new file + 10 tool-description edits + 1 new test file. Most descriptions stay the same; only the ambiguous ones get rewritten.

## Adoption plan (MCP-only, mirroring `260609-adopt-cross-reference-fields`)

1. **Design entry mutation** (via `meta_state_patch`, CAS via `_expected_version`):
   - `status: active → inactive`
   - `shipped_in_plan: "plans/260609-adopt-instruction-layer/"`
   - `shipped_at: <ISO>`
   - `proposed_design_for` backfilled with the 2-3 change-logs the design motivated (e.g., the 2 audit ship change-logs + the `discoverability_hints` ship change-log as the upstream motivation)
   - `version: 2` (baseline 1 + 1 patch)

2. **Next-up finding close** (canonical path):
   - `meta_state_ack` (promote reported → active; required before resolve)
   - `meta_state_check_grounding` (verify the next-up's `evidence_code_ref` still resolves)
   - `meta_state_refresh_fingerprint` (if drifted)
   - `meta_state_resolve` (consults `rule-no-orphaned-evidence`; sets `resolved_by: "plan:260609-adopt-instruction-layer"`)

3. **Ship change-log** (via `meta_state_log_change`):
   - `change_target: "meta-state.jsonl#loop-design-instruction-layer"`
   - `consolidates: "meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-..."`
   - `change_diff.added`: list the 2 audit ship surfaces + the new tool-selection-guide

4. **Closeout journal**: `docs/journals/260609-adopt-instruction-layer-closeout.md`

5. **No `node -e` escape hatch** — the `meta-260606T2102Z-agent-used-direct-file-i-o-...` finding stays clean.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| 24h TTL elapses before completion | High | All work in one session, <2h total budget |
| Warm tier size budget exceeded by new hints | Medium | (A6) test locks the budget; new hints are <300 bytes each |
| Tool description edits introduce new ambiguity | Medium | (B4) test catches regressions via 4-question assertion |
| `rule-no-orphaned-evidence` consult-gate blocks resolve | Low | Run `meta_state_check_grounding` first; refresh fingerprint if drifted |
| Audit work surfaces a new gap the design didn't anticipate | Low | File a follow-up finding + new loop-design; do not let the original stay open |
| Operator pushback on AGENTS.md framing change | Low | Framing is operator-proposed; "priority-1 prompt" matches the operator's own words |

## Success criteria

- [ ] `meta_state_list({ entry_kind: "loop-design", id: "loop-design-instruction-layer" })` returns `status: "inactive"`, `proposed_design_for: [2-3 ship change-log ids]`, `shipped_in_plan: "plans/260609-adopt-instruction-layer/"`
- [ ] Next-up finding `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` has `status: "resolved"`, `resolved_by: "plan:260609-adopt-instruction-layer"`
- [ ] Ship change-log filed with `consolidates` field set
- [ ] Track A: hints A4 + A5 shipped in `discoverability_hints`; 4-6 new tests in `cold-session-discoverability.test.cjs`; warm tier size budget test passes
- [ ] Track B: `tools/learning-loop-mcp/references/tool-selection-guide.md` created with intent → tool mapping; top-10 tool descriptions audited for the "When" question; 1 new test file asserts the 4-question framework
- [ ] `pnpm check` passes (target: 898 + ~10 new = ~908 tests)
- [ ] Zero direct file I/O to `meta-state.jsonl`
- [ ] Journal `docs/journals/260609-adopt-instruction-layer-closeout.md` written
- [ ] `loop_describe({ tier: "warm" })` cold-session test still passes (the `rule-cold-session-test-must-pass-before-resolution` consult-gate is satisfied)

## Out of scope (YAGNI)

- New `loop_get_instruction` MCP tool
- Auto-deriving AGENTS.md from structured source
- Per-tool deep-dive beyond the top 10 most-called
- Closing the sibling `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` design (still parked per `trajectory.md` pre-conditions)
- Any change to the 4-kind union or the cross-reference-fields design (already shipped)
- Reframing AGENTS.md sections to match the new "priority-1 prompt" framing (operator may choose to do this in a follow-up)

## Next steps

1. Approve the plan mode (default `/ck:plan` recommended; TDD only if operator wants TDD-locked for the warm-tier changes)
2. Run the plan via `/ck:cook` to ship the two tracks + meta-state mutations
3. Journal the closeout
4. The 2 active loop-designs in `meta_state_list` are now `loop-design-meta-state-registry-sqlite-migration-trajectory-parked` (parked) + nothing else; the `instruction-layer` and `cross-reference-fields` designs are both `inactive`

## Open forward decisions (from `docs/trajectory.md`)

These are intentionally not touched by this design:

- **Tiered meta-state migration (Model C)** — separate; parked design already captures
- **Composite loss function for self-referential learning** — separate; surfaces through `meta_state_query_drift`
- **Operator-capture guard** — separate; schema decision is open

The instruction-layer design's closure does not affect any of these.
