# Phase 2: philosophy.md — skill authority + escape-hatch reframe

## Context
- Source report: `plans/reports/from-problem-solving-260706-1340-injection-consumption-two-axis-l1-reframe-report.md`
- Operator decisions: state-2 = permanent home for judgment-bound content (decision 1); escape-hatch kept as state-1 name, decoupled from file format (decision 2); "internalize as MCP tool" is solution-centric (operator point 1).
- Two sections rewrite **together** (same doc, same concept, cross-referencing — splitting creates an inconsistent intermediate state).

## Files to modify
- `docs/philosophy.md`:
  - "Skills Are the Same Kind of Escape Hatch" section (lines ~29-35).
  - Pillar 4 "Skill Authority vs Loop Authority" (lines ~72-84).
- **Do NOT touch:** Pillar 1 (verification), Pillar 2 (decisions), Pillar 3 (evidence), "State Machine and Observations", or anything outside the two named sections.

## Change 1: "Skills Are the Same Kind of Escape Hatch" (lines 29-35)

### Current text (to replace)
The section currently: docs/ is not the only escape hatch; the `ck:*` skill family is the same shape, in a different filename; skill markdown is human-readable, session-loaded, not recorded, consumed by the agent; the escape-hatch rule is "anything an agent must open to know what to do next is a gap"; *"The trajectory is to internalize the skill into the loop as an MCP tool. The skill markdown becomes the readable spec; the MCP tool becomes the authoritative executor."*

### Replacement (must contain)
1. **Keep** the observation: a skill markdown and a doc are the same shape — both are **agentic-injection artifacts** when unwired (the model opens them ad hoc).
2. **Drop** *"internalize the skill into the loop as an MCP tool"* (L3 mechanism named as L1 terminus — operator point 1).
3. **Introduce the injection × consumption two-axis model + three states:**
   - **Escape-hatch (state-1):** agentic injection + agentic consumption. An unwired instruction the model opens ad hoc. **NOT a file format** — a `.md` is state-1 only while it is reached agenticly. (operator point 2 + decision 2)
   - **Wired (state-2):** deterministic injection + agentic consumption. A hook/gate surfaces the instruction at the right moment; the model still reads + decides. **The loop's permanent home for content that genuinely needs judgment** (decision 1). Example: meta-state finding descriptions — the SessionStart hook surfaces them (deterministic injection); the model interprets them (agentic consumption).
   - **Encoded (state-3, terminus):** deterministic injection + deterministic consumption. A rule/gate fires without model judgment. A promoted rule; a consult-gate that blocks an action.
4. **Name the loop's reason to exist:** a deterministic program can do states 2-3 but cannot *consume* prose (state-1's job); a pure-agentic system does state-1 but cannot reliably *inject* (timing is the model's whim); **the loop couples deterministic injection to agentic consumption — it occupies state-2, which neither extreme can do alone.**
5. **Keep** the "anything an agent must open to know what to do next is a gap" rule, reframed as the state-1 definition (agentic injection, no deterministic wiring).

### Exact wording
Draft during implementation; preserve the two kept observations (same-shape; "anything an agent must open ... is a gap"), introduce the two-axis model + three states, drop the MCP-tool sentence. Keep the section concise — do not let the two-axis model balloon the file.

## Change 2: Pillar 4 "Skill Authority vs Loop Authority" (lines 72-84)

### Current text (to revise)
The pillar currently: skills execute; the loop records; the meta-surface survives. The dependency-balance table (plan-file authoring = loop; code execution = skill; contract = loop). *"Long-term direction: the loop will own the `ck:plan`, `ck:cook`, and `ck:journal` skills as MCP tools."* Migration sequence (citation-only → citation-only-artifact → full-execution) with three invariants.

### Revision (must contain)
1. **Keep** the authority split (skill executes = agentic; loop records = deterministic) — it is correct.
2. **Reframe "skill"** as the **agentic-injection mechanism** (markdown the runtime loads for the model to read), **not a concept role**. The concept role is `agentic-step` (per `loop-engine.md`); the skill is its L3 realization.
3. **Drop "MCP tool" as the named terminus** (operator point 1). Name the terminus as **"deterministic step"** (rule-enforced, registry-driven, no model judgment — `loop-engine.md` invariant), of which an MCP tool / consult-gate / hook are L3 realizations.
4. **Relabel the migration sequence as the state-1 → state-2 → state-3 path:**
   - citation-only = state-1 (agentic injection; the skill markdown is read ad hoc)
   - citation-only-artifact = state-2 (deterministic injection via the registry citation; agentic consumption)
   - full-execution = state-3 (deterministic consumption; a tool/gate executes without the model)
5. **Map the three migration invariants** to the two-axis model:
   - "preserve the markdown as the readable spec" → keep the agentic content (consumption stays agentic until state-3)
   - "make the artifact loop-citable at creation" → add deterministic injection (citability)
   - "enforce the consult-gates the markdown was skipping" → add deterministic guardrails (consult-gates = deterministic consumption of the guardrail)

### Preserve (do not change)
- The dependency-balance table (plan-file authoring / code execution / contract) — unchanged.
- *"The single most important sentence: skills execute; the loop records; the meta-surface is the only thing that survives."* — keep; reframe "skill" as the agentic-injection mechanism in the surrounding prose, not the sentence itself.
- The migration sequence order and its non-triviality — keep, relabeled.

## Implementation steps
1. `Read` `docs/philosophy.md` lines 29-35 + 72-84 to confirm exact current wording.
2. `Edit` the "Skills Are the Same Kind of Escape Hatch" section per Change 1.
3. `Edit` Pillar 4 per Change 2.
4. Verify Pillars 1-3 + "State Machine and Observations" untouched (diff scope check).

## Validation
- `grep -n "MCP tool" docs/philosophy.md` → absent from the two rewritten sections (check any remaining occurrences are unrelated / decide whether to rephrase them).
- `grep -n "internalize the skill into the loop" docs/philosophy.md` → no occurrences.
- `grep -n "state-2\|injection\|consumption" docs/philosophy.md` → present in the rewritten sections.
- Escape-hatch defined as state-1, explicitly decoupled from file format.
- State-2 framed as the permanent home for judgment-bound content (decision 1).
- Pillars 1-3 + "State Machine and Observations" byte-identical to pre-phase (diff check).
- File under 800 lines (currently ~196; this is a section rewrite, not growth — keep it tight).

## Risk + rollback
- **Risk:** `philosophy.md` is L1 deep-treatment; rewriting two sections shifts the framing every future session inherits. **Mitigation:** the 1340 report is the agreed reference; the two-axis model is verified against the reductio (meta-state descriptions = state-2 by design); operator signed off on state-2-permanent + escape-hatch-kept. The two sections are one phase so no inconsistent intermediate state ships.
- **Risk:** introducing "state-1/2/3" conflicts with `loop-engine.md`. **Mitigation:** phase 1 names "instruction injection" only, not state-N; the state-N vocabulary is philosophy.md's expansion, consistent with `loop-engine.md`'s deterministic-step / agentic-step.
- **Rollback:** `git revert` the `philosophy.md` commit; the two sections are self-contained.