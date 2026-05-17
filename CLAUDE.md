# CLAUDE.md — Learning Loop Template

## Skill Coordination

This repo uses a coordination system for external skills. When you invoke a write-capable
skill (e.g., /ck:backend-development, /ck:cook, /ck:deploy) and it gets blocked by the
coordination hook:

1. **Do NOT retry the blocked skill directly.**
2. **Invoke /ck:learning-loop** with:
   - `target=<blocked-skill-name>` (e.g., target=backend-development)
   - Your original intent (what you wanted the skill to do)
3. Learning-loop will check state, build constraints, and return instructions.
4. Follow the returned instructions to invoke the target skill.

Skills NOT in the coordination registry (test, scout, research, code-review, etc.)
bypass coordination and can be invoked directly.

The coordination config lives at `.claude/coordination/`:
- `skill-registry.json` — which skills are gated
- `coordination-config.json` — profiles with write allowlists
