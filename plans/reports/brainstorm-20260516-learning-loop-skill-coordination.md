# Brainstorm: Learning-Loop as Universal Skill Coordinator

**Date:** 2026-05-16 (continued from Part 1)
**Status:** Design proposal — awaiting approval
**Trigger:** Generalize learning-loop coordination beyond ck:plan/ck:cook to ALL external skills

---

## Problem (Reframed)

The previous session explored coordination between learning-loop and ck:plan/ck:cook. User's reframing:

> "I want ALL external skill triggers to go through learning-loop. Not just plan and cook. How do we create a rigid process for all (future) external skills?"

**Why now:** The record system is mature (claims, experiments, evidence, decisions, risks, capabilities, observations). 88+ external skills exist. Almost every action in this repo creates/modifies artifacts. The cost of bypassing coordination is no longer theoretical.

**Core question:** How does learning-loop become the mandatory gateway for any external skill interaction with this repo?

---

## Mechanism Evaluation

### What skill-creator and agentize would say

**skill-creator perspective:**
- Learning-loop needs a stronger "When to Use" trigger that fires for ANY external skill interaction, not just irreversible ops
- The skill needs to be restructured as a coordinator: input = target skill + intent, output = constraint-wrapped invocation
- Progressive disclosure: metadata → SKILL.md → coordination rules → per-skill adapters

**agentize perspective:**
- If learning-loop is the coordinator, it needs a well-defined API surface
- Coordination config should be declarative (JSON/YAML), not hardcoded in SKILL.md
- The coordinator should be invocable both by Claude (following rules) and by hooks (enforcement layer)

### Mechanism comparison

| Mechanism | Enforcement | Context injection | Complexity | Can route skills |
|-----------|-------------|-------------------|------------|-----------------|
| PreToolUse hook on Skill tool | HARD (Claude can't bypass) | No (block/allow only) | Low | No (blocks, doesn't route) |
| CLAUDE.md rules + trigger | Soft (Claude may skip) | Yes (full context) | Low | Yes |
| Coordinator skill | Soft (Claude must choose) | Yes (full context) | Medium | Yes |
| **Hybrid: hook + rules + coordinator** | **Hard** | **Yes** | **Medium** | **Yes** |

**Verdict: Hybrid.** The hook provides the hard gate. CLAUDE.md rules tell Claude what to do when blocked. The coordinator skill provides the actual coordination logic.

---

## Design: Three-Layer Coordination

```
Layer 1: HOOK (hard gate)
  PreToolUse hook on "Skill" tool
  Reads .claude/coordination/skill-registry.json
  If skill is registered → BLOCK with routing message
  If skill is NOT registered → ALLOW (no coordination needed)

Layer 2: CLAUDE.md RULES (routing)
  Project CLAUDE.md says:
  "When a skill call is blocked by the coordination hook,
   invoke /ck:learning-loop with the original intent.
   Do NOT retry the blocked skill directly."

Layer 3: COORDINATOR SKILL (logic)
  /ck:learning-loop receives: target skill + original args + intent
  Checks: budget, validation windows, state gates
  Reads: coordination config for target skill
  Constructs: constraint prompt with allowlists/forbidlists
  Invokes: target skill with constraints
  Captures: output → routes to appropriate records
```

### Flow diagram

```
User: "/ck:backend-development Build FastAPI endpoints for vnstock"
  │
  ▼
PreToolUse hook (Skill tool)
  │ reads skill-registry.json
  │ "backend-development" is registered → BLOCK
  │ output: "BLOCKED: Route through learning-loop coordinator.
  │          Invoke /ck:learning-loop with target=backend-development"
  │
  ▼
Claude reads hook message
  │ invokes /ck:learning-loop
  │ args: "Coordinate backend-development: Build FastAPI endpoints for vnstock"
  │
  ▼
Learning-loop coordinator
  │ 1. Read coordination-config.json → backend-development rules
  │ 2. Check budget (pnpm check:budget)
  │ 3. Check validation windows
  │ 4. Read target skill's coordination profile
  │ 5. Build constraint prompt:
  │    - write_allowlist: [product/api/src/, product/api/tests/]
  │    - write_forbidlist: [records/, evidence/, docs/, plans/]
  │    - read_requirelist: [records/claims/*, records/capabilities/*]
  │    - gate_signals: [budget_check, validation_window]
  │    - post_execution: [capture_evidence, update_experiment]
  │ 6. Invoke backend-development with constraint prompt
  │ 7. Capture output → route to records
  │
  ▼
backend-development executes under constraints
  │ writes to product/api/src/ only
  │ cannot touch records/, evidence/, docs/
  │
  ▼
Learning-loop post-execution
  │ captures evidence
  │ updates experiment record
  │ returns result to user
```

---

## Configuration Design

### 1. Skill Registry (`.claude/coordination/skill-registry.json`)

Lists which skills require coordination. Skills NOT in this registry can be invoked directly.

```json
{
  "$schema": "./skill-registry.schema.json",
  "version": "1.0",
  "coordinator": "learning-loop",
  "registered_skills": {
    "backend-development": { "profile": "code-generation" },
    "frontend-development": { "profile": "code-generation" },
    "tanstack": { "profile": "code-generation" },
    "cook": { "profile": "plan-execution" },
    "deploy": { "profile": "external-system", "budget_system": "deployment" },
    "fix": { "profile": "code-generation" },
    "mcp-builder": { "profile": "code-generation" },
    "web-frameworks": { "profile": "code-generation" },
    "mobile-development": { "profile": "code-generation" }
  },
  "unregistered_skills_bypass": true
}
```

Note: `test`, `code-review`, `scout`, `research`, `docs-seeker` are NOT registered — they are read-only and bypass the hook entirely.

### 2. Coordination Config (`.claude/coordination/coordination-config.json`)

Defines coordination rules per profile and per skill.

```json
{
  "version": "1.0",
  "profiles": {
    "code-generation": {
      "description": "Skills that write code files",
      "write_allowlist": ["product/**", "tools/**"],
      "write_forbidlist": ["records/**", "evidence/**", "docs/**", "plans/**", "schemas/**"],
      "read_requirelist": ["docs/operator-guide.md", "docs/artifact-reference.md"],
      "post_execution": ["capture_observations"],
      "gate_signals": ["validation_window"]
    },
    "plan-execution": {
      "description": "Skills that execute plans",
      "write_allowlist": ["product/**", "tools/**", "records/**", "evidence/**"],
      "write_forbidlist": ["schemas/**"],
      "read_requirelist": ["docs/operator-guide.md", "docs/artifact-reference.md"],
      "post_execution": ["validate_records", "capture_evidence"],
      "gate_signals": ["budget_check", "validation_window"]
    },
    "external-system": {
      "description": "Skills that interact with external systems",
      "write_allowlist": ["product/**", "records/**", "evidence/**"],
      "write_forbidlist": ["schemas/**"],
      "read_requirelist": ["docs/operator-guide.md"],
      "post_execution": ["validate_records", "capture_evidence", "update_budget"],
      "gate_signals": ["budget_check", "validation_window", "staleness_check"]
    },
    "validation": {
      "description": "Skills that validate or review",
      "write_allowlist": ["plans/reports/**"],
      "write_forbidlist": ["records/**", "evidence/**", "product/**", "schemas/**"],
      "read_requirelist": [],
      "post_execution": [],
      "gate_signals": []
    }
  },
  "skill_overrides": {
    "cook": {
      "write_allowlist": ["product/**", "tools/**", "records/**", "evidence/**"],
      "notes": "Cook needs record write access for plan-execution phases"
    },
    "deploy": {
      "budget_system": "deployment",
      "budget_resource": "deploy_slots",
      "notes": "Deployment consumes external infrastructure resources"
    }
  }
}
```

### 3. Hook Script (`.claude/coordination/hooks/skill-coordination-gate.cjs`)

```javascript
// PreToolUse hook for Skill tool
// Reads skill-registry.json, blocks registered skills

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(
  process.env.CWD || process.cwd(),
  '.claude/coordination/skill-registry.json'
);

function main() {
  // Read tool input from stdin (Claude Code hook protocol)
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));

  // Only gate Skill tool calls
  if (input.tool !== 'Skill') {
    process.exit(0); // allow
  }

  const skillName = input.input?.skill;
  if (!skillName) {
    process.exit(0); // allow — no skill name to check
  }

  // Check if registry exists
  if (!fs.existsSync(REGISTRY_PATH)) {
    process.exit(0); // allow — no registry means no coordination
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const registered = registry.registered_skills?.[skillName];

  if (!registered) {
    process.exit(0); // allow — skill not registered
  }

  // Block — skill must go through coordinator
  const coordinator = registry.coordinator || 'learning-loop';
  console.log(JSON.stringify({
    decision: 'block',
    reason: `Skill "${skillName}" requires coordination. Invoke /ck:${coordinator} with target=${skillName} and your original intent. The coordinator will check state and invoke the skill with proper constraints.`,
    coordinator: coordinator,
    target_skill: skillName,
    profile: registered.profile
  }));

  process.exit(2); // block
}

main();
```

---

## Learning-Loop SKILL.md Changes

The skill needs to be restructured as a coordinator, not just a prompt author.

### New "When to Use" triggers

```markdown
## When to Use

Use when the user asks:
- [existing triggers unchanged]

Also use when:
- A skill call was blocked by the coordination hook (you are now the coordinator)
- Any external skill needs to interact with this repo's records, evidence, or state
- Coordinating multiple skills that need to share context (e.g., backend + frontend)
- Any task that involves creating or modifying artifacts in records/, evidence/, or docs/
```

### New workflow: Coordination Mode

```markdown
## Coordination Workflow

When invoked as a coordinator (target skill specified):

1. **Read coordination config**:
   - `.claude/coordination/skill-registry.json` → target skill profile
   - `.claude/coordination/coordination-config.json` → profile rules

2. **Pre-execution gates**:
   - If profile requires budget check → call `pnpm check:budget`
   - If validation window active → return DEFERRED signal
   - If budget exhausted → return BLOCKED signal

3. **Build constraint prompt**:
   - Compose from profile: write_allowlist, write_forbidlist, read_requirelist
   - Apply skill_overrides if they exist
   - Embed gate signals and post-execution requirements

4. **Invoke target skill**:
   - Pass constraint prompt as context to the target skill
   - Target skill executes under constraints

5. **Post-execution**:
   - Run post_execution steps (validate_records, capture_evidence, etc.)
   - Return result to user
```

---

## Generic Pattern (Reusable Across Repos)

The design is repo-agnostic at the infrastructure level:

| Component | Location | Repo-specific? |
|-----------|----------|----------------|
| Hook script | `.claude/coordination/hooks/` | No — same script, reads local config |
| Skill registry | `.claude/coordination/skill-registry.json` | Yes — lists this repo's registered skills |
| Coordination config | `.claude/coordination/coordination-config.json` | Yes — profiles + rules for this repo |
| Coordinator skill | `.claude/skills/learning-loop/` | Yes — but the coordination workflow is reusable |
| CLAUDE.md rules | Project CLAUDE.md | Yes — routing instructions |

**Another repo could adopt this by:**
1. Creating `.claude/coordination/` with registry + config
2. Adding the hook to project settings
3. Creating their own coordinator skill (or using learning-loop if they have a record system)
4. Adding routing rules to their CLAUDE.md

---

## Coordination Profiles

Rather than configuring every skill individually, we use profiles:

| Profile | Skills | Write access | Needs budget? | Post-execution |
|---------|--------|-------------|---------------|----------------|
| code-generation | backend-dev, frontend-dev, tanstack, fix, mcp-builder | product/** only | No | capture_observations |
| plan-execution | cook | product/** + records/** | Conditional | validate_records, capture_evidence |
| external-system | deploy | product/** + records/** | Yes | validate_records, capture_evidence, update_budget |
| validation | test, code-review | plans/reports/** only | No | None |
| research | research, docs-seeker, scout | None (read-only) | No | None |

New skills get assigned a profile in the registry. No per-skill configuration needed unless they need overrides.

---

## Decisions Locked This Session

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Skill-to-skill invocation | Yes, skills can invoke other skills | Coordinator can programmatically invoke target skills. Full automation. |
| Coordination scope | Only write-capable profiles | Read-only profiles (research, validation) skip coordination. No safety benefit from gating them. |
| Hook location | Project-local (.claude/settings.json) | Only active in this repo. Other repos unaffected. Requires per-repo setup. |
| Mechanism | Hybrid: hook + rules + coordinator skill | Hook provides hard gate, CLAUDE.md provides routing, learning-loop provides coordination logic. |
| Config format | JSON | Machine-writable by hooks and scripts. YAML for human docs only. |
| Coordinator | learning-loop skill (expanded) | Already has budget checks, gate signals, prompt blueprints. Natural home. |
| Coordination profiles | code-generation, plan-execution, external-system | Three write-capable profiles. validation and research are read-only, skip coordination. |
| Non-skill user gap | Accepted — no file-level enforcement | Non-skill users (no ck:* installed) follow CLAUDE.md rules as soft guidance. Hook only gates Skill tool calls. File-level write hooks deferred. |
| Multi-skill coordination | Sequential via plan phases | Coordinator invokes skills sequentially. Shared context via plan files (existing pattern from brainstorm-260511-0030). |

---

## Open Questions (Reduced)

1. **Multi-skill coordination:** When backend-development and frontend-development need shared context (e.g., API contract), does the coordinator run them sequentially with shared context, or does it need a higher-level orchestration? The existing phase-gated pattern (from brainstorm-260511-0030) handles this via plan phases — the coordinator could follow the same pattern.

2. **Registry maintenance:** Who adds skills to the registry? Start with manual. Auto-detection from SKILL.md metadata is a future enhancement.

3. **Coordination for non-artifact tasks:** `/ck:backend-development Build a quick prototype` — does this need coordination if no artifact tracking is desired? The profile system allows it (code-generation profile has no post-execution steps), but the hook still blocks. Should there be an escape hatch?

---

## Key Artifacts Referenced

| Artifact | Path | Relevance |
|----------|------|-----------|
| Learning-loop skill | `.claude/skills/learning-loop/SKILL.md` | Becomes the coordinator |
| Resource budget rules | `.claude/skills/learning-loop/references/resource-budget-rules.md` | Budget gating for external systems |
| Orchestration patterns | `.claude/skills/learning-loop/references/orchestration-patterns.md` | Existing multi-phase coordination |
| Global hooks config | `~/.claude/settings.json` | Where PreToolUse hooks are registered |
| State-machine plan | `plans/260516-1200-state-machine-for-irreversible-operations/plan.md` | Budget enforcement (completed) |
| Previous brainstorm | `plans/reports/brainstorm-260511-0030-external-skills-integration.md` | Phase-gated orchestration for product builds |
| skill-creator skill | `~/.claude/skills/skill-creator/SKILL.md` | Patterns for skill structure |
| agentize skill | `~/.claude/skills/agentize/SKILL.md` | Patterns for API surface design |
