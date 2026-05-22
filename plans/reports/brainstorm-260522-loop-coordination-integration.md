# Brainstorm Report: Learning-Loop / Coordination Integration

**Date**: 2026-05-22
**Topic**: How to bridge 17 gaps between ClaudeKit global skills and the local learning-loop record system without modifying global skill files
**Constraint**: No changes to `~/.claude/skills/*`

---

## Problem Statement

The coordination model collapse (Plan 260520-0157) successfully replaced the broken profile-based gating system with an observation-based model (bash gate, write gate, inbound gate, MCP server). However, this collapse only fixed the **gate layer**. It did not fix the **skill layer**.

When `/ck:cook` implemented the macro layer, it produced product code (21 endpoints, 23 tests, models, router) without any pre-existing learning-loop records. No claims, risks, or decisions existed in `records/product/` before implementation. The journal was reactive (`product/api/docs/journals/`) rather than proactive (`records/product/experiments/`).

A full scout identified **17 missing bridges** between global skills and the learning-loop system. This report evaluates local-scope options to close those gaps without touching global skills.

---

## Research Findings (Harness Capabilities)

### What the Harness Supports
- `PreToolUse` hooks for `Edit|Write` and `Bash` (confirmed in `settings.json`)
- `UserPromptSubmit` hooks for inbound state (confirmed)
- `PostToolUse` hooks exist in the harness (confirmed by tests and `context-engineering` skill docs)
- `Stop`, `SubagentStop`, `Notification` hook events (confirmed in `hooks/docs/README.md`)
- `SessionStart`/`SessionEnd` hooks (deprecated due to race conditions)

### What the Harness Does NOT Support
- `Skill` tool matching in `PreToolUse` (only `Edit|Write` and `Bash` registered)
- No `PostToolUse` registration examples in `settings.json`
- No skill composition, piping, or aliases
- Hooks are standalone CJS scripts — cannot call MCP tools, cannot invoke skills

### Critical Insight
Skills are **not CLI commands**. A skill is a markdown instruction file that the **agent interprets**. There is no `exec()`, `spawn()`, or piping primitive. The pipe `/loop-build /ck:plan --tdd ...` is impossible mechanically — it relies entirely on agent interpretation of sequential instructions.

---

## Evaluated Approaches

### Option A: Local Skill Shadows
Create `.claude/skills/cook/SKILL.md`, `.claude/skills/ck-plan/SKILL.md`, etc. that shadow global skills. Local skills are searched first.

**How it works**: Local `cook` adds pre/post loop steps, then delegates to actual cook workflow via agent instructions.

**Pros**:
- User keeps same skill names (`/ck:cook`)
- Transparent to operator
- Full control over skill interface

**Cons**:
- Must maintain copies of skill interfaces
- Drift risk when global skills update
- Effectively rewrites skills locally

**Verdict**: Works but violates the "no rewriting skills" spirit. Rejected as primary.

---

### Option B: Single Orchestrator Skill
Create ONE new skill: `.claude/skills/loop-build/SKILL.md`.

**How it works**: `/ck:loop-build "implement macro layer"` internally chains `/learning-loop` → `/ck:plan` → `/ck:cook` → `/ck:test` → `/learning-loop`.

**Pros**:
- One file to maintain
- No global changes
- Explicit loop integration

**Cons**:
- User must learn new skill name
- Agent might skip steps in the chain
- Violates natural operator-mediated artifact flow (`brainstorm` → `plan` → `/clear` → `cook`)

**Verdict**: Works but forces rigid skill chaining that contradicts the existing workflow design. Rejected.

---

### Option C: Plan Template Hard-Gates
Embed loop checks into `plans/` templates.

**How it works**: Plan phases include "Phase 0 — Loop Pre-Flight" with checkboxes for decision records, claims, risks. `/ck:cook` reads the plan and follows phases.

**Pros**:
- No new skills
- No code changes
- Uses existing workflow
- Natural to operator

**Cons**:
- Advisory only — agent can skip phases
- `--fast` mode bypasses planning
- Requires changing how plans are generated (touches `/ck:plan` skill or relies on agent discipline)

**Verdict**: Good soft enforcement. Accepted as secondary measure.

---

### Option D: MCP Server Extension
Extend `tools/constraint-gate/server.js` with learning-loop workflow tools (`workflow_product_build`, `workflow_intake_plan`, etc.).

**How it works**: Build MCP tools that encapsulate loop logic. A thin wrapper skill calls them.

**Pros**:
- Clean architecture
- Reusable, testable
- Mechanical enforcement if skills call tools

**Cons**:
- Requires building 5-8 new MCP tools
- Skills don't currently call MCP tools (except local ones)
- High build effort (~2 days)
- Overkill for immediate gap

**Verdict**: Best long-term architecture. Deferred until N≥3 distinct use cases prove need.

---

### Option E: PostToolUse Hooks
Register a `PostToolUse` hook that fires after `Skill` tool calls.

**How it works**: Hook receives skill result on stdin. Checks if skill was `cook`/`plan`/`test`. Reads written files. Creates marker for experiment record.

**Pros**:
- Mechanical — fires automatically
- No skill changes
- Works with all skills uniformly

**Cons**:
- Hook is CJS, cannot call MCP tools
- Hook cannot write to `records/` (write gate blocks)
- Hook can only write markers to `/tmp/` — fragile
- No `Skill` matcher confirmed in `settings.json`
- PostToolUse registration not documented in config

**Verdict**: Architecturally possible but practically crippled. Rejected as primary.

---

### Option F: Artifact-Aware Write Gate (RECOMMENDED PRIMARY)
Augment `write-coordination-gate.cjs` to recognize artifact types and enforce loop compliance.

**How it works**:
- When writing `plans/**/plan.md` with `tags: [product-build]` → escalate if no `records/<surface>/decisions/` exist
- When writing `product/**` (new code) → check `records/<surface>/decisions/` for matching surface
- When writing `docs/journals/**` → suggest or auto-draft `records/<surface>/experiments/` YAML

**Pros**:
- Mechanical enforcement at the exact moment of risk
- Uses existing gate infrastructure
- No skill changes
- No operator discipline needed
- Works for ALL skills uniformly (they all write files)

**Cons**:
- Gate is path-based, not content-aware. Needs file content scanning for plan frontmatter.
- Escalation interrupts operator workflow.
- Must maintain mapping: `product/api/*` → surface `product`, `records/vnstock/*` → surface `vnstock`

**Verdict**: Best no-skill-change option. Accepted as primary.

---

### Option G: PostToolUse Artifact Scanner
Register `PostToolUse` hook for `Write`/`Edit` that scans written files.

**How it works**: After every file write, hook reads content. If plan with product scope → emit warning. If product code → check records. If journal → draft experiment YAML.

**Pros**:
- Fires automatically after every write
- Content-aware (can read file contents)

**Cons**:
- Hook is CJS, cannot write to `records/` (write gate blocks)
- Can only emit stdout warnings or write `/tmp/` markers
- Requires secondary process to consume markers
- Fragile and complex

**Verdict**: Too fragile. Rejected.

---

### Option H: CLAUDE.md + Post-Plan Validator
Add project-level rules to `CLAUDE.md` and a validation script.

**How it works**:
- `CLAUDE.md` says: "All product-build plans require loop pre-flight. All product code requires decision records."
- Script `tools/validate-plan-loop.js` scans `plans/` for product-build plans missing loop phases.
- Script runs as part of `pnpm validate:records` or `pnpm check`.

**Pros**:
- No skill changes
- No gate changes
- Validatable in CI

**Cons**:
- Advisory only — agent may ignore `CLAUDE.md` rules
- Post-facto — catches problems after plan is created
- Requires operator to run validator

**Verdict**: Good CI-level safety net. Accepted as tertiary measure.

---

## Comparative Summary

| Approach | Mechanical? | Changes Skills? | Changes Gates? | Friction | Best For |
|---|---|---|---|---|---|
| A. Local shadows | Partial | Yes (local) | No | Low | Long-term skill control |
| B. Orchestrator | No | One new | No | Medium | Rigid workflows |
| C. Plan templates | No | No | No | Low | Soft enforcement |
| D. MCP extension | Yes | No | Yes (MCP) | High | Long-term architecture |
| E. PostToolUse | Yes | No | No | Very high | Auto-capture (fragile) |
| **F. Artifact-aware gate** | **Yes** | **No** | **Yes (write gate)** | **Medium** | **Primary enforcement** |
| G. PostToolUse scanner | Yes | No | No | High | Content-aware warnings |
| H. CLAUDE.md + validator | No | No | No | Low | CI safety net |

---

## Final Recommendation

**Three-layer defense, zero skill changes:**

### Layer 1: Gate Enforcement (Primary) — Option F
Augment `write-coordination-gate.cjs` to be artifact-aware:
- `plans/**/plan.md` with product scope → escalate if no decision records
- `product/**` new files → escalate if no decision records for inferred surface
- `docs/journals/**` → suggest drafting `records/<surface>/experiments/` YAML

### Layer 2: Plan Templates (Secondary) — Option C
Embed loop pre-flight as Phase 0 in all product-build plans. Advisory, natural, fits existing flow.

### Layer 3: CI Validator (Tertiary) — Option H
`tools/validate-plan-loop.js` scans `plans/` for missing loop phases. Runs in `pnpm check`.

---

## Implementation Considerations

### Gate Content Scanning
The write gate currently matches paths only. To check plan frontmatter (`tags: [product-build]`), it must read file contents. This adds latency to every write. Mitigation: only scan on first write of a new plan file, not on every edit.

### Surface Inference
Mapping file paths to learning-loop surfaces:
- `product/api/*` → `product`
- `product/web/*` → `product`
- `records/vnstock/*` → `vnstock`
- `records/meta/*` → `meta`
This mapping must be maintained. Could be hardcoded in gate or read from a config file.

### Staged Gate Response
Instead of outright blocking product-code writes without decision records, the gate could:
1. **Warn**: Allow write but emit strong warning
2. **Escalate**: Block write and require operator approval
3. **Auto-draft**: Allow write but auto-create a draft experiment record

Recommendation: Start with **warn** mode. Graduate to **escalate** after operator validates the mapping.

### Open Questions
1. Should the gate read file content (slower) or maintain a `.claude/loop-state.json` marker (faster but stale)?
2. Should `plans/**` be unconditionally allowed (current behavior) or scoped-checked?
3. Should journal auto-drafting create the file directly, or emit the YAML content for operator approval?
4. What happens when a plan has multiple surfaces (e.g., product + vnstock)?

---

## Decision Update (Post-Predict Analysis)

A `/ck:predict` multi-persona analysis was run on the core question: implement custom skills vs. make the system compatible with external skills. Verdict: **STOP on custom skill set; GO on gate-based enforcement with deferred agentize.**

### Predict Findings

- **Custom skill shadows (Option A) and orchestrator skill (Option B) remain rejected.** Both were evaluated and rejected in this report for drift risk, rigid chaining, and workflow contradiction. The predict analysis confirmed no new evidence justifies reversing these decisions.
- **Agentize (making the loop an external MCP/CLI/skill) is deferred until N>=3.** The loop's schemas, record types, and gate rules are still stabilizing. Publishing now would lock unstable internals and create backward-compatibility obligations prematurely.
- **Gate-based enforcement (Option F + C + H) is affirmed as the correct path.** The three-layer defense (artifact-aware gate, plan templates, CI validator) proceeds unchanged.

### Unresolved Questions — Resolutions

| # | Question | Resolution | Rationale |
|---|----------|------------|-----------|
| 1 | File content scan vs. `.claude/loop-state.json` marker? | **Read file content.** The "first write only" mitigation makes this acceptable. A marker file introduces a second source of truth that can drift from reality. If latency becomes measurable (>50ms), optimize by caching frontmatter in memory during the gate process lifetime. |
| 2 | `plans/**` unconditionally allowed or scoped-checked? | **Scoped-checked for product-build plans only.** Use the `tags: [product-build]` frontmatter as the discriminator. Plans without this tag remain unconditionally allowed. Preserves existing behavior for non-product plans while enforcing the loop for product builds. |
| 3 | Journal auto-drafting: create file directly or emit YAML for operator approval? | **Emit YAML content for operator approval.** Direct file creation bypasses operator judgment. The journal is the agent's observation; the experiment record is the operator's formalization. Emission keeps the operator in the loop and avoids write-gate complications. |
| 4 | Multi-surface plan handling? | **Phase 0 lists all surfaces; gate checks each independently.** All surfaces must have decision records. If any lacks records, gate escalates with a list of missing surfaces. Surface inference mapping is applied per-file, not per-plan. |

---

## Next Steps

1. **Prototype gate rule**: Add content-scanning to `write-coordination-gate.cjs` for `plans/**` with `tags: [product-build]` only. Test on existing plans. Start in **warn** mode.
2. **Hardcode surface mapping**: Initial mapping in gate logic. Graduate to config file after operator validates correctness across 3+ product builds.
3. **Write plan template**: Add Phase 0 loop pre-flight to plan generation docs. Include surface declaration checklist.
4. **Build validator script**: `tools/validate-plan-loop.js` for CI-level checking.
5. **Document in CLAUDE.md**: Add artifact-level loop rules to project instructions.
6. **Execute the 260511 product build plan**: Use phase-gated orchestration (Approach 1) to validate gate enforcement in practice. Collect friction data to inform N>=2 reconsideration.

---

**Unresolved questions (post-decision):**
- None. All open questions from the original brainstorm have been resolved above.
