# Journal: Decrease Outside Instruction

Date: 2026-05-21
Scope: Operator guide shrink + docs/loop boundary clarity

## What Happened

Brainstorm session to reduce `docs/operator-guide.md` (~600 lines) from passive procedural instruction into active learning-loop artifacts + MCP workflow tools.

## Key Decisions

1. **Architecture**: Hybrid single MCP server. `gate_*` namespace for enforcement/management, `workflow_*` namespace for process orchestration. DIY registry pattern, no FastMCP.
2. **Target**: Operator guide shrinks from ~600 lines to ~120 lines (philosophy + irreducible judgment only).
3. **Tool count**: 7 new gate tools + 8 new workflow tools.
4. **Docs framing**: `docs/` is the escape hatch. If an agent must open a doc to know what to do, that's a loop gap.

## Outputs Created

- `plans/reports/brainstorm-260521-decrease-outside-instruction.md` — full brainstorm report with tool specs, artifact mapping, implementation considerations

## Docs Updated

- `docs/philosophy.md` — added "Docs Are the Escape Hatch" section; updated "What the Loop Is Not" to flag checklist-in-docs as gap
- `docs/trajectory.md` — framed four bridges as reducing doc dependency; added "Philosophy stays in docs" to "What Stays Human Forever"

## Critical Prereq Identified

Write gate allowlist must add `records/index/**` and `records/capabilities/**` (currently blocked by catch-all `**`).

## Unresolved for Next Session

1. `workflow_generate_prompt`: full text or template with placeholders?
2. Workflow chaining: automatic or explicit agent calls?
3. Guide shrink: incremental per phase or one batch after all tools land?

## Next Steps

`/ck:plan` to phase implementation: registry scaffold → gate tools P1-P2 → workflow tools P1 → remaining tools → guide shrink → integration test.
