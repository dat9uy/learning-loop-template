# 260517 — Skill Coordinator Hook Implementation

## Session Context

Implementation of a PreToolUse hook system that intercepts write-capable skill invocations and routes them through the learning-loop coordinator. This closes the gap identified in `260515-loop-harness-context-gate-discussion.md` -- agents can now be gated from invoking destructive skills without coordinator approval.

---

## What Was Built

| Component | Path | Purpose |
|---|---|---|
| Skill registry | `.claude/coordination/skill-registry.json` | 8 gated skills with profiles (vnstock, deploy, etc.) |
| Coordination config | `.claude/coordination/coordination-config.json` | 3 profiles: code-generation, plan-execution, external-system |
| PreToolUse hook | `.claude/coordination/hooks/skill-coordination-gate.cjs` | Blocks registered skills, passes unregistered, bypass mechanism |
| Hook registration | `.claude/settings.json` | Project-local hook binding |
| Coordinator skill | `.claude/skills/learning-loop/SKILL.md` | Expanded with coordination workflow |
| Coordination rules | `.claude/skills/learning-loop/references/coordination-rules.md` | Full protocol for skill gating |
| Project routing | `CLAUDE.md` | Routing rules directing gated skills to coordinator |

---

## Key Decisions

### 1. Skill as PreToolUse-interceptable tool

Verified from `hookify.md` allowed-tools list that `Skill` is a valid tool name for PreToolUse hooks. This was the foundation -- without it, the entire gating mechanism would need a different approach (e.g., PostToolUse auditing, which is too late for destructive ops).

### 2. Coordinator returns prompt instructions, not programmatic invocation

Skills cannot invoke other skills programmatically. The coordinator hook blocks the target skill and returns a message telling Claude to invoke the coordinator skill instead. The coordinator then returns prompt-level instructions for what to do. This is a deliberate constraint: it keeps the coordinator as a decision-making layer, not an execution layer.

**Trade-off:** This means the gating is advisory at the prompt level. A sufficiently determined agent (or a confused one) could still bypass. v1 accepts this -- filesystem enforcement is deferred.

### 3. Bypass file mechanism (`.bypass-next`)

When the coordinator approves a skill invocation, it writes `.bypass-next` to the coordination directory. The hook checks for this file and allows the next invocation of the registered skill, then deletes the file. This prevents infinite loops where coordinator says "invoke skill X" but the hook blocks it again.

**Risk:** Race condition if two skills are gated simultaneously. Accepted for v1 -- single-agent sessions don't have this problem.

### 4. Fail-open for missing/malformed registry

If `skill-registry.json` is missing or malformed, the hook allows all skill invocations. Rationale: git tracks the registry, so corruption is recoverable, and a broken hook that blocks everything is worse than one that blocks nothing.

### 5. Advisory write enforcement

The coordination config has write allowlists and forbidlists per profile, but enforcement is prompt-level only. The hook blocks the skill tool itself, but once the coordinator approves and the skill runs, there is no filesystem-level restriction on what the skill writes. v1 is a speed bump, not a wall.

---

## Testing

66 tests total, all passing:

| Suite | Count | Coverage |
|---|---|---|
| Config validation | 37 | Registry schema, profile schema, cross-references |
| Hook unit | 21 | Block/allow/bypass logic, edge cases |
| Integration | 8 | End-to-end hook behavior with real registry |

---

## What Went Right

- **Incremental approach:** Built registry and config first, then hook, then tests. Each piece was independently verifiable.
- **Fail-open design:** Avoided the trap of a hook that breaks all skill invocations when config is wrong.
- **Test-first on hook logic:** The bypass mechanism was tricky enough that writing tests before the final implementation caught a file-deletion race.

---

## What Could Be Better

- **No filesystem enforcement yet.** The write allowlists in coordination-config.json are advisory. A skill that writes outside its approved paths is only caught by prompt-level review. This is the biggest gap.
- **Single-agent assumption.** The bypass file mechanism assumes one coordinator at a time. Multi-agent parallel sessions would need a more robust signaling mechanism (e.g., per-invocation bypass tokens).
- **Registry maintenance burden.** Adding a new gated skill requires editing skill-registry.json, coordination-config.json, and potentially the hook. Should consider a convention-over-configuration approach where skills self-declare their gating requirements.

---

## Impact

This implementation directly addresses the failure mode documented in `260515-loop-harness-context-gate-discussion.md`: agents acting before absorbing constraints. The coordinator is now the mandatory context-absorption point for any skill that can cause destructive side effects.

The vnstock domain is the first beneficiary -- `install-vnstock.sh` invocations now route through the coordinator, which enforces reading the device slot ledger and validation protocol before allowing execution.

---

## Source

- Prior discussion: `docs/journals/260515-loop-harness-context-gate-discussion.md`
- Hook: `.claude/coordination/hooks/skill-coordination-gate.cjs`
- Registry: `.claude/coordination/skill-registry.json`
- Config: `.claude/coordination/coordination-config.json`
- Tests: `.claude/coordination/__tests__/`
- Coordinator skill: `.claude/skills/learning-loop/SKILL.md`
