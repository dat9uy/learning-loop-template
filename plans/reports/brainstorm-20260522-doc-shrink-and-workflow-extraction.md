# Brainstorm: Doc Shrink + Workflow Extraction Post-MCP

## Problem Statement

The learning-loop repo now has 13 MCP workflow tools and 12 enforcement tools (25 total). These tools encode procedural knowledge that previously lived in docs. The same knowledge now exists in 4+ formats:

1. JSON schemas (`schemas/*.schema.json`)
2. MCP tool implementations (`tools/constraint-gate/tools/*`)
3. Skill reference docs (`.claude/skills/learning-loop/references/*`)
4. Project docs (`docs/*.md`)

Per `docs/trajectory.md`: "docs are not operational dependencies. Anything an agent must read from docs/ to execute correctly is a gap." The operator guide was already shrunk to 102 lines in plan 260521-2244. Two docs remain bloated with reference tables that duplicate machine-readable sources.

## Requirements

1. Remove doc content that duplicates schemas, tools, or workflows
2. Add missing auto-trigger workflows to `workflows.json`
3. Audit skill reference files for overlap with MCP workflow tools
4. Preserve irreducible judgment (philosophy, trajectory, charter)

## Scouted State

| Artifact | Lines | Role |
|---|---|---|
| `docs/operator-guide.md` | 103 | Already lean. Procedural knowledge moved to workflow tools. |
| `docs/artifact-reference.md` | 425 | Schema field tables (lines 139-315), cross-record ref map (318-336), validation architecture (348-397). Duplicates JSON schemas + validate_records tool. |
| `docs/record-system-architecture.md` | 147 | Entity roles table, verification axes table. Duplicates workflow_intake_orient output. |
| `docs/philosophy.md` | 144 | Judgment content. Must stay per trajectory.md. |
| `docs/charter.md` | 54 | Present-tense description. Must stay. |
| `docs/trajectory.md` | 67 | Aspirational. Must stay. |
| `workflows.json` | 12 | One workflow: evidence-changed. |
| Skill references (8 files) | ~900 total | Prompt blueprints, orchestration patterns, rules. Skill-internal, correctly outside docs/. |
| MCP workflow tools (13) | ~2000 loc | Classify, intake orient/plan, prepare runtime, generate prompt, product build, convert evidence, verify evidence, intentional skip, external decision, self-improvement, report phase, runtime probe. |

## Evaluated Approaches

### Option A: Aggressive Delete — docs become stubs only

Delete all tables and reference content. Docs become 5-line stubs pointing to schemas and tools.

- Pros: Maximum cascade. Docs can never drift from source.
- Cons: Humans reading docs offline lose all context. New operators cannot understand the system without running tools.
- Verdict: Rejected. Docs are the escape hatch, not the enemy. Stubs are too aggressive.

### Option B: Surgical Shrink — keep concepts, remove reference tables

Keep conceptual explanation (what dimensions mean, why separation matters). Remove field-level tables and validation-layer descriptions that duplicate schemas and tools.

- Pros: Docs remain human-readable. No drift risk on tables. Matches trajectory.md gradient.
- Cons: Moderate effort. Need to verify no external references break.
- Verdict: **Selected.**

### Option C: Generate docs from schemas — auto-sync

Write a script that generates doc tables from JSON schemas at build time.

- Pros: Never drift. Single source of truth.
- Cons: Over-engineered. Adds build step. Schema files are already human-readable YAML/JSON. YAGNI.
- Verdict: Rejected.

## Skill Reference Audit Findings

| Skill Reference File | Overlap With MCP Tool | Verdict |
|---|---|---|
| `references/prompt-blueprints.md` | `workflow_generate_prompt` | **PARTIAL**. Tool reads blueprints and extracts skeletons. The reference file contains the raw template text; the tool automates extraction. Keep both — reference is source, tool is automation. |
| `references/prompt-blueprints-state-gated.md` | `workflow_prepare_runtime_request` | **HIGH**. Tool generates structured approval request text. Reference has the raw templates. The tool is the automation layer; reference is the source text. Keep both but cross-reference. |
| `references/prompt-blueprints-product-build.md` | `workflow_product_build` | **HIGH**. Tool decomposes requests into assertions/risks/experiments/decisions. Reference has pre/post build prompts. Keep both — tool does decomposition, reference has prompt text. |
| `references/orchestration-patterns.md` | `workflow_intake_plan`, `workflow_report_phase_status` | **MEDIUM**. Reference has full-lifecycle orchestration prompts. Tools handle orient/plan/phase reporting. Reference is the human-readable spec; tools are automation. Keep both. |
| `references/learning-loop-rules.md` | `workflow_classify_prompt`, `workflow_intake_orient` | **PARTIAL**. Rules are constraints for prompt generation. Tools enforce mechanically. Keep both. |
| `references/resource-budget-rules.md` | `check_gate`, `workflow_prepare_runtime_request` | **PARTIAL**. Rules define constraints; tools enforce them. Keep both. |
| `references/meta-evidence-self-improvement.md` | `workflow_self_improvement` | **HIGH**. Tool turns proposals into experiment candidates. Reference has the full governance rules. Keep both — tool is the mechanized form. |
| `references/context-retrieval-patterns.md` | `workflow_intake_orient`, `list_runtime_probes`, `search_index_entries` | **MEDIUM**. Reference has 7-step lookup chain. Tools provide the mechanical queries. Keep both. |

**Audit conclusion:** Skill references are the *source text* that MCP tools automate. They should NOT be deleted. The correct relationship is: reference files = human-readable spec; MCP tools = machine-driven automation of the same spec. Cross-references should be added so users know the tool implements the reference.

## Recommended Solution

### 1. Rename + Shrink `artifact-reference.md`

- Rename to `docs/artifact-concepts.md`
- Remove: schema field tables (lines 139-315), cross-record ref map (318-336), validation architecture (348-397)
- Replace with: single paragraph pointing to `schemas/*.schema.json` and `validate_records` MCP tool
- Keep: dimension overview, forbidden shortcuts, runtime output policy, capability glossary
- Target: ~120 lines (from 425)

### 2. Shrink `record-system-architecture.md`

- Remove: entity roles table, verification axes table
- Replace with: single sentence pointing to `workflow_intake_orient` MCP tool
- Keep: core hierarchy diagram, machine-extracted index section, state-machine concept, product generation loop
- Target: ~60 lines (from 147)

### 3. Add Workflows to `workflows.json`

| Workflow | Trigger | Commands |
|---|---|---|
| `observation-changed` | `records/observations/**` | `validate-records` |
| `capability-changed` | `records/capabilities/**` | `validate-records`, `generate_capability_records --dry_run` |
| `index-changed` | `records/index/**` | `validate-records` |

Rationale: `observation-changed` is highest value — gate decisions depend on observation state. `capability-changed` catches drift between hand-edited records and generated capability records. `index-changed` is defensive (index entries are machine-extracted, but manual edits happen).

### 4. Update Skill References with Cross-References

Add a one-line cross-reference at the top of each skill reference file:

> "MCP tool: `workflow_X` implements this reference mechanically."

This makes the relationship explicit: reference = spec, tool = automation.

## Risks

| Risk | Mitigation |
|---|---|
| External links to doc sections break | No known external links. Internal plan references use file paths, not section anchors. |
| New operators lose context | Concepts preserved; only reference tables removed. Operator guide still exists. |
| Workflow triggers fire too often | `validate-records` is fast (~2s). No performance concern. |
| Skill reference cross-references rot | Cross-reference is tool name, not line number. Stable. |

## Success Criteria

- `docs/artifact-reference.md` renamed to `docs/artifact-concepts.md`, < 150 lines
- `docs/record-system-architecture.md` < 80 lines
- `workflows.json` has 4 workflows (was 1)
- All 8 skill references have MCP tool cross-reference
- `pnpm check` passes after all changes
- No broken internal references in docs

## Next Steps

1. Implement doc shrinks (tasks 2 + 3)
2. Add workflows (task 4)
3. Add cross-references to skill references (task 5)
4. Run `pnpm check` to validate
5. Update any internal doc references
