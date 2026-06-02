---
date: "2026-06-02T07:50:00Z"
status: proposed
tags: [brainstorm, meta, gate, mcp, enforcement, anti-pattern, hook, session-start]
related:
  - meta-260601T1353Z-use-mcp-skill-scripts-under-factory-skills-use-mcp-scripts-r
  - meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz
  - meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-th
  - plans/260602-self-enforcing-loop/plan.md
  - plans/260602-meta-state-lifecycle-tidy/plan.md
  - tools/learning-loop-mcp/core/gate-logic.js
  - tools/learning-loop-mcp/tools/loop-describe-tool.js
  - docs/philosophy.md
  - plans/reports/research-260602-droid-session-start-support.md
---

# Strict MCP-Call Rules: Hook + Gate Against Misrouting

> **Status: Proposed.** Operator-reviewed design only. No plan created yet. Companion to `260602-self-enforcing-loop` (architecture) and `260602-meta-state-lifecycle-tidy` (lifecycle fixes). Addresses the prompt/behavior gap those plans left open.

## Problem

The self-enforcing loop architecture shipped `loop_describe` (a discovery tool) and `meta_state_promote_rule` (a rule-promotion tool). The follow-up `260602-meta-state-lifecycle-tidy` plan fixed the registry mechanics (G9 status filter, sweep tool) and acknowledged but deferred a known gap:

> **G7:** `loop_describe` adoption = 0 outside tests.

In parallel, `meta-260601T1353Z-...` records a different failure: an agent inside a project that has its own `.mcp.json` (with `learning-loop-mcp` registered) called `ck:use-mcp` — a cross-project tool-discovery skill. The skill's scripts were not installed; the install was blocked by the bash gate. The agent was solving a problem that didn't exist (the project already has the tools in-process via Droid's in-process MCP loader).

The entry was resolved as `subtype: tool-missing` with the resolution: *"use-mcp skill documentation updated; skill can be re-installed on demand. No persistent rule needed."* This is a docs fix, not a rule. **Nothing prevents the same misrouting from recurring.**

Both gaps share a root cause: **the agent's behavior is shaped by docs and tool descriptions, but the docs are insufficient when the agent is solving a problem in real time and the docs are not at the top of the context window.** The plan's own follow-up called this out: *"`loop_describe` adoption = 0 outside tests."*

## What "Resolved" Should Have Meant

The two `meta-260601T1339Z-...` entries were resolved as if "the mechanism exists" were equivalent to "the mechanism is being used." That category error is the same shape as the misrouting failure:

| Layer | Mechanism shipped | Mechanism used |
|---|---|---|
| `loop_describe` discovery | Tool exists; AGENTS.md/CLAUDE.md recommend calling it | Adoption = 0 in real sessions (G7) |
| `meta_state_report` registry | Tool exists; AGENTS.md references it | Agents in real sessions tried to write `records/meta/evidence/**` instead (meta-260601T1339Z) |
| `ck:use-mcp` not for in-project use | Skill SKILL.md updated | Same miscall pattern can recur |

The fix is not stronger docs. The plan already shipped those and measured zero adoption. The fix is to **shift from soft "recommended" to hard "enforced"** for the behaviors that are mechanically checkable.

## Evaluated Approaches

### A. Reclassify the resolutions (honest bookkeeping only)

Edit `meta-state.jsonl` to revert the two `meta-260601T1339Z-...` entries to `active` and add a new entry: "agents must not invoke `ck:use-mcp` from a project context that has its own `.mcp.json`." Document the heuristic in AGENTS.md.

| Pros | Cons |
|---|---|
| Zero new code. Respects "no new artifact types" / "rules are state, not content." | Does not address G7 adoption or misrouting — same failure mode. The original "resolved" was also honest; honesty without enforcement is what got us here. |

**Verdict:** Necessary but not sufficient.

### B. Gate-enforced rule: `rule-project-skill-boundary` (name resolved in Open Q3)

Add a new `meta-state.jsonl` entry with `enforcement: "gate"`, `pattern_type: "glob"`, `pattern: "**/.factory/skills/{use-mcp,find-skills}/**"`, scoped to fire only when the project has its own `.mcp.json`. The bash gate already extends `PATH_WRITE_PATTERNS` for meta-state protection; the same pattern extends to skill-invocation patterns.

| Pros | Cons |
|---|---|
| Symmetric with `rule-no-new-artifact-types`. Reuses existing `loadPromotedRules` + `applyPromotedRules` plumbing. No new schemas/tools/dirs. | The bash gate currently has no project-context awareness for rule application. A small `loadPromotedRules` extension is needed (filter: only fire `gate`-enforced rules when project-local config signals apply). |

**Verdict:** Closes the misrouting gap mechanically. ~20 lines: 1 new meta-state entry + 1 test + AGENTS.md note. Within "minimal new infra" budget.

### C. Session-start hook auto-injects `loop_describe` summary (uses canonical Droid `SessionStart` event)

New `.factory/hooks.json` (project-level) + new `.factory/hooks/loop-surface-inject.cjs` script that calls `loop_describe({tier:"summary"})` once per Droid `SessionStart` (matcher `startup`) and prints a 1-2KB "loop surface" block to stdout. Droid adds stdout to context — no marker file, no `UserPromptSubmit` fallback. Reuses the existing tool — no new MCP tool. The hook fires only when both conditions hold:

1. A `.mcp.json` exists at the project root.
2. That `.mcp.json` registers a `learning-loop-mcp` server entry.

| Pros | Cons |
|---|---|
| Closes G7 mechanically. The agent has the surface in context from turn 0 — no need to remember. Memory-free, reliable. Makes misrouting less likely (agent sees "36 tools available directly" → less tempted to seek external discovery). | Adds 1 new file in `.factory/hooks/`. Existing hooks (privacy-block, simplify-gate, etc.) all have specific triggers; this would be the first session-start hook. ~30-50 lines + 1 test. |

**Verdict:** Closes the adoption gap mechanically. Within "minimal new infra" budget (1 new hook file, no new tools/schemas/dirs).

## Recommended Approach: B + C combined

Both fit the "1 new hook + 1 new rule, no new schemas/dirs/tools" budget. They close two distinct gaps with two distinct mechanisms:

1. **Rule (B) — Misrouting prevention.** `meta_state_promote_rule` creates a new entry with `enforcement: "gate"`, `pattern: "ck:use-mcp"`, scope: only fire when project has `.mcp.json` AND registers a learning-loop MCP server. The gate blocks with rule-id reason. Operator override path: `meta_state_promote_rule({preview: true})` (already shipped in `260602-self-enforcing-loop`, RT Finding 15).

2. **Hook (C) — Adoption guarantee.** `.factory/hooks/loop-surface-inject.cjs` (registered in new project-level `.factory/hooks.json`) runs once per Droid `SessionStart` event, calls `loop_describe({tier:"summary"})` via the in-process MCP client, prints the result to stdout. Droid adds stdout to context. The hook guards both conditions (project has `.mcp.json` + has a `learning-loop-mcp` entry) so plain projects get no noise.

### Why both

B alone: closes misrouting but not adoption. A future agent in a clean session still has to remember to call `loop_describe`. The plan's own measurement showed agents don't.

C alone: closes adoption but not misrouting. A future agent with the surface in context could still call `ck:use-mcp` out of habit or confusion.

Both together: agent has the surface *and* cannot accidentally route around it.

### Why not just stronger docs

The plan already did that:
- `loop_describe` description: "Recommended: call at session start..."
- AGENTS.md line 25: "Call `loop_describe({tier: "warm"})` at session start..."
- CLAUDE.md line 9: "**Discovery:** call `loop_describe({tier: "warm"})` at session start..."

The follow-up plan measured adoption = 0. Docs are necessary but not sufficient. The category error is treating "mechanism exists" as "mechanism is being used."

## Design Details

### Component 1: Gate-enforced rule

**Entry shape** (append to `meta-state.jsonl`):

```json
{
  "id": "meta-260602T0750Z-do-not-invoke-cross-project-skill-from-learning-loop-project",
  "category": "loop-anti-pattern",
  "subtype": "tool-misrouting",
  "severity": "warning",
  "affected_system": "agent-prompt",
  "description": "Agents in a project with its own .mcp.json registering a learning-loop-mcp server must not invoke ck:use-mcp, ck:find-skills, or other cross-project tool-discovery skills. The project's MCP server already exposes the tool surface via Droid's in-process loader. Cross-project skill invocations require $HOME/.claude/.mcp.json (cross-project), npm install (for script paths), and bypass the project's gate enforcement. They are the wrong tool for the job.",
  "evidence": {
    "journal": "docs/journals/260601-bridge-2-candidate-to-experiment-closeout.md",
    "code_ref": ".factory/skills/use-mcp/scripts/package.json"
  },
  "promoted_to_rule": {
    "rule_id": "rule-project-skill-boundary",
    "pattern_type": "glob",
    "pattern": "**/.factory/skills/{use-mcp,find-skills}/**",
    "enforcement": "gate",
    "scope_predicate": "project_has_learning_loop_mcp"
  },
  "auto_resolve": null,
  "status": "active",
  "created_at": "2026-06-02T07:50:00.000Z",
  "version": 1
}
```

**Code changes** (~20 lines total):

1. `tools/learning-loop-mcp/core/gate-logic.js` — extend `loadPromotedRules` filter to evaluate `scope_predicate` against project context (`{cwd}/.mcp.json` exists AND has `learning-loop-mcp` key). If predicate is absent, the rule fires globally (current behavior). If present, only when predicate is true.
2. `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` — add `scope_predicate` field to zod schema (enum: `none` | `project_has_learning_loop_mcp`).
3. `tools/learning-loop-mcp/__tests__/gate-scope-predicate.test.js` — 3 tests: rule with no predicate fires globally; rule with `project_has_learning_loop_mcp` predicate fires only in matching project; rule with predicate does not fire in plain project.

**Operator UX:** same as existing `meta_state_promote_rule` tool. `preview: true` shows what would be blocked without activating.

### Component 2: Session-start hook (canonical Droid `SessionStart` event)

**Files (new):**
- `.factory/hooks.json` (project-level config — new convention per Factory docs)
- `.factory/hooks/loop-surface-inject.cjs` (the hook script)

**Behavior:**
- On Droid `SessionStart` (matcher `startup`; optionally also `resume`/`clear`/`compact` for resilience), Droid invokes the script.
- Script reads `./.mcp.json` at the project root.
- If absent, or no `learning-loop-mcp` key, exit 0 silently.
- Otherwise, spawn a one-shot MCP call to `learning-loop-mcp` server with `loop_describe({tier:"summary"})` (via stdio, reusing the existing server invocation pattern in `.mcp.json`).
- Parse the response. Print a 1-2KB block to stdout (Droid adds stdout to context):

  ```
  === loop surface (auto-injected at session start) ===
  tools: 36
  record types: 8
  active rules: 1
  active findings: 12
  gate patterns: 5
  Use mcp__learning_loop_mcp__* tools directly. Do not invoke ck:use-mcp from
  a project that has its own .mcp.json — that skill is for cross-project discovery.
  ========================================================
  ```

- The block is tagged `<loop-surface-injection>` so it can be filtered out of journal/log captures.

**Why summary tier:** ~1KB fits in any context window. The agent can call `warm` if it needs descriptions and the rule list.

**Hook wiring** (per Factory docs, project-level):

`.factory/hooks.json` (new file at project root, committed):
```json
{
  "SessionStart": [
    {
      "matcher": "startup",
      "hooks": [
        {
          "type": "command",
          "command": "\"$FACTORY_PROJECT_DIR\"/.factory/hooks/loop-surface-inject.cjs",
          "timeout": 10
        }
      ]
    }
  ]
}
```

**Code shape** (~30-50 lines + 1 test):

```js
// .factory/hooks/loop-surface-inject.cjs (sketch)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Read Droid's hook input from stdin (JSON with hook_event_name, source, cwd)
const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
if (input.hook_event_name !== 'SessionStart' || input.source !== 'startup') {
  process.exit(0);
}

const cwd = input.cwd || process.cwd();
const GUARD = process.env.LL_DISABLE_LOOP_SURFACE_INJECTION === '1';
if (GUARD) process.exit(0);

const mcpJsonPath = path.join(cwd, '.mcp.json');
if (!fs.existsSync(mcpJsonPath)) process.exit(0);
const cfg = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
if (!cfg.mcpServers || !cfg.mcpServers['learning-loop-mcp']) process.exit(0);

// Spawn MCP server, send JSON-RPC initialize + tools/call(loop_describe), parse response.
// Print formatted block to stdout. Droid adds stdout to context.
// ...
```

**Test:** `.factory/hooks/__tests__/loop-surface-inject.test.js` — 3 cases: no `.mcp.json` (no injection), `.mcp.json` without `learning-loop-mcp` (no injection), `.mcp.json` with `learning-loop-mcp` (injection contains `loop_describe` summary).

**Why `SessionStart` and not a `UserPromptSubmit` fallback:** Per Factory docs (`reference/hooks-reference.md`), `SessionStart` is a first-class hook event with matchers `startup`/`resume`/`clear`/`compact`, and its stdout is added to context (same as `UserPromptSubmit`). It fires exactly once per session (or on resume/clear/compact) — no marker file needed. See `plans/reports/research-260602-droid-session-start-support.md` for the full evidence chain. The `UserPromptSubmit` fallback is kept only as defense-in-depth in the Risks section.

## Implementation Considerations and Risks

### Risk: false-positive gate block

A future scripted/CI use case might genuinely need `ck:use-mcp` from inside a project (e.g., a one-off exploration). Mitigation: `meta_state_promote_rule({preview: true})` shows the pattern without activating. Operator can disable the rule via `status: "disabled"` mechanism (already shipped in `260602-self-enforcing-loop`, RT Finding 7). Same UX as `rule-no-new-artifact-types`.

### Risk: hook latency on session start

Spawning the MCP server + calling `loop_describe` once adds ~200-500ms to session start. Acceptable for a Droid session (which already loads multiple subsystems). **No cache — live read on every session start (YAGNI; per Open Question 2 decision).** If it becomes a bottleneck, the Factory session-automation cookbook's "Troubleshooting" section recommends backgrounding: spawn the MCP server async, return a static block immediately. Defer until measured.

### Risk: G7 only fully closes when the agent reads the injected block

If the agent's context window is already saturated before the first user message, the injection may be pushed out. Mitigation: the summary tier is <1KB. The block is prepended, not appended — it lands at the top of the context.

### Risk: scope_predicate evaluation in gate is new code path

The current `loadPromotedRules` does not have project-context awareness. Adding it requires care to avoid breaking existing rules. Mitigation: predicate is opt-in (existing rules have no `scope_predicate` field → global fire, current behavior). Test coverage: existing rules with no predicate must fire in plain projects (no regression).

### Risk: hook discoverability — RESOLVED

`SessionStart` is documented as a first-class Droid hook event in the official Factory Hooks Reference. The existing user-level `~/.factory/settings.json` only registers `UserPromptSubmit`, `PreToolUse`, `TaskCompleted` — no `SessionStart` is in use yet, but the lifecycle event is supported. The new project-level `.factory/hooks.json` introduces the first `SessionStart` consumer in this environment. No Droid-side change required. **The `UserPromptSubmit` + marker-file fallback previously listed here is retained only as defense-in-depth for hypothetical older Droid versions that lack `SessionStart` support.** See `plans/reports/research-260602-droid-session-start-support.md` for evidence.

## Success Metrics and Validation Criteria

| Metric | Target | How to measure |
|---|---|---|
| Misrouting prevention | `ck:use-mcp` invocation in a project with `.mcp.json` + `learning-loop-mcp` → gate blocks | Unit test in `gate-scope-predicate.test.js` |
| Adoption guarantee | `loop_describe` summary appears in agent's first message context | Manual review of session start transcript |
| Existing rules unaffected | `rule-no-new-artifact-types` still fires in plain projects | Regression test in `loadPromotedRules` |
| Hook overhead | Session start latency < 500ms p95 | Benchmark in CI |
| Operator UX | `meta_state_promote_rule({preview: true})` shows the new rule's matches without activating | Tool test |

## Open Questions — ALL RESOLVED

1. **Droid lifecycle support — RESOLVED.** `SessionStart` is a fully supported first-class Droid hook event with matchers `startup`/`resume`/`clear`/`compact`. Its stdout is added to the context (same as `UserPromptSubmit`); multiple hooks' `additionalContext` are concatenated. No marker file needed; no `UserPromptSubmit` fallback required. Evidence: `plans/reports/research-260602-droid-session-start-support.md` (cites Factory's official `reference/hooks-reference.md` and `guides/hooks/session-automation.md`).
2. **Cache invalidation — RESOLVED.** Live read on every session start. No cache. YAGNI. If latency becomes a measured bottleneck, defer to a follow-up (use the Factory cookbook's "backgrounding" pattern from `guides/hooks/session-automation.md#troubleshooting`).
3. **Naming — RESOLVED.** Adopted: `rule-project-skill-boundary`. The rule entry's `rule_id` field uses this name. The pattern stays `**/.factory/skills/{use-mcp,find-skills}/**`; the `scope_predicate` `project_has_learning_loop_mcp` ensures the rule only fires in projects that have their own MCP server.

## Next Steps

This report is operator-review only. No plan created. Pending:

- [x] Operator review of design (this report)
- [x] Confirmation of Droid session-start hook lifecycle support — RESOLVED via `plans/reports/research-260602-droid-session-start-support.md`
- [x] Decision on rule name — RESOLVED: `rule-project-skill-boundary`
- [ ] If approved: `/ck:plan --tdd` for `plans/2606XX-strict-mcp-call-rules/` with 2 phases:
  - Phase 1: gate-scope-predicate (rule + `loadPromotedRules` extension + tests)
  - Phase 2: `SessionStart` hook (`.factory/hooks.json` project-level + `.factory/hooks/loop-surface-inject.cjs` + tests)

## Related Reports

- `plans/reports/brainstorm-260602-self-enforcing-loop-architecture.md` — the architecture this report extends
- `plans/reports/brainstorm-260602-meta-state-lifecycle-tidy.md` — the follow-up that fixed registry mechanics and acknowledged G7
- `plans/reports/brainstorm-260602-agent-docs-plans-default-pattern.md` — anti-pattern analysis this report builds on
- `plans/260602-self-enforcing-loop/plan.md` — RT findings 7, 14, 15 directly inform this design
