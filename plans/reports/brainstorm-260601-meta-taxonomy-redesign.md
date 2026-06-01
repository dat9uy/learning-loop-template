---
date: "2026-06-01T13:53:00Z"
status: rejected
superseded_by: brainstorm-260602-self-enforcing-loop-architecture.md
rejected_at: "2026-06-02T00:00:00Z"
rejection_reason: |
  Proposed a new `convention` artifact type with `schemas/convention.schema.json`,
  96 YAML files, and `conventions/` directory. Violates the "no new artifact types"
  philosophy. Both the proposed solution AND the content-heavy prevention measures
  in `brainstorm-260602-agent-docs-plans-default-pattern.md` are superseded by the
  architecture-level fix in `brainstorm-260602-self-enforcing-loop-architecture.md`,
  which makes the loop's own state (meta-state.jsonl) the rule registry.
tags: [brainstorm, meta, taxonomy, convention, evidence, assertion, self-learning, rejected, anti-pattern-exhibit]
---

# [REJECTED] Meta-Level Taxonomy Redesign: Conventions vs. Vendor Capabilities

> ## STATUS: REJECTED (2026-06-02)
>
> This report is **retained as a rejected anti-pattern exhibit**. It correctly identified that 96 meta assertions lost their provenance after the 1:1 cleanup, but the proposed solution — a new `convention` artifact type with `schemas/convention.schema.json`, 96 YAML files, and a `conventions/` directory — is **rejected** for the following reasons:
>
> 1. **Violates "no new artifact types" philosophy** in `docs/philosophy.md`
> 2. **Treats `docs/` and `plans/` as architecture** rather than escape hatch
> 3. **Proposes a new schema** instead of encoding knowledge in existing surfaces
> 4. **Bureaucracy, not mechanism** — 96 YAML files is permanent loop inflation
>
> **Problem analysis:** Valid. The 96 assertions needed a home, and the existing surfaces didn't fit. This was the correct diagnosis.
>
> **Solution:** Rejected. The correct fix is not to create a new artifact type. It is to make the loop's own state — `meta-state.jsonl` — the rule registry. See `brainstorm-260602-self-enforcing-loop-architecture.md` for the superseding design.
>
> The original "Critical Update" and all REJECTED inline markers below are preserved for historical context.

---

# Meta-Level Taxonomy Redesign: Conventions vs. Vendor Capabilities

> **Critical Update (2026-06-02):** This report is retained as an exhibit of a recurring anti-pattern. The proposed solution — a new `convention` artifact type with 96 YAML files and a three-tier taxonomy — violates the core philosophy in `docs/philosophy.md`. Specifically, it treats `docs/` and `plans/` as architecture rather than escape hatch, and it proposes a new schema instead of encoding knowledge in existing surfaces. The correct approach is documented in `plans/reports/brainstorm-260602-agent-docs-plans-default-pattern.md`: **curate, encode, or delete** — never create a new artifact type. The sections below that propose the `convention` artifact, `schemas/convention.schema.json`, and `docs/conventions/` or `tools/learning-loop-mcp/conventions/` are **rejected**. The problem analysis remains valid; the solution does not.

## Problem Statement

The `260601-meta-1to1-artifact-cleanup` plan deleted 28 meta evidence files and 2 stale risk versions under the 1:1 artifact philosophy. The 96 meta index entries were converted to `self:` source refs. This surfaced a fundamental design question:

**Should the meta-level use the same artifact taxonomy as product-level?**

- Product-level: evidence → extracted assertion → experiment → decision → product code
- Meta-level: evidence → extracted assertion (`records/meta/index/*.yaml`)

The 1:1 cleanup applied the product philosophy to the meta surface: evidence is temporary scaffolding, the index entry is canonical. But the scout of deleted evidence reveals this is a **category error**.

### What the Deleted Evidence Actually Contained

The 28 meta evidence files were not simple facts. They were operational narratives with provenance:

- `observation-record-discovery-gap.md` — full story about why agents weren't checking observations, root cause analysis, proposed rule, trigger, and deferral rationale
- `resource-budget-procedural-rules.md` — eight rules plus observation, trigger, and deferral rationale
- `evidence-truth-status-mechanism.md` — discussion of rejected mechanisms, trigger for reopening debate, superseded-by pattern
- `capability-allowlist-deferred-axes.md` — three deferred axes with full rationale for each deferral and explicit revisit triggers

The `[topic-tag]` bullets were extracted as the 96 meta assertions. The evidence contains the **operational knowledge** — the why, the trigger, the deferral rationale, the rejected alternatives. The assertion is the rule. The evidence is the **provenance**.

### Why the 1:1 Philosophy Fails at Meta-Level

| Product | Meta |
|---|---|
| Evidence: vendor docs, experiments, logs | Evidence: convention provenance, rationale, triggers |
| Assertion: "vnstock installer writes config to X" | Assertion: "agents must scan observations before asking user" |
| Provenance: vendor docs, experiment results | Provenance: operational friction, debate, deferral rationale |
| Extraction: from vendor docs or experiments | Extraction: from internal debates and decisions |
| Durable artifact: assertion (index entry) | Durable artifact: evidence (the provenance IS the knowledge) |

At product-level, the evidence is temporary because the vendor docs change, experiments are rerun, and the assertion is the distilled truth. At meta-level, the evidence is **the only durable artifact** because the provenance, trigger, and rationale are the knowledge. The assertion is a secondary extraction — a rule without its context.

## The Three Meta-Level Artifacts

> **REJECTED:** The following sections propose a new artifact type (`convention.schema.json`, `conventions/` directory, 96 YAML files). This violates the "No New Artifact Types" rule: agents may not propose new schemas, record types, or directories. The correct approach is to encode the critical rules in MCP tool descriptions, gate logic, or agent prompts; to delete the dead assertions; and to report the remainder as meta-state gaps. See the **Corrected Response** section at the end of this report.

### Artifact 1: Meta-State Registry (`meta-state.jsonl`)

**Purpose:** Ephemeral agent findings about the loop itself — bugs, gaps, missing tools, gate logic issues.

**Characteristics:**
- 24h TTL, auto-resolve on file change
- Written by agents via `meta_state_report` MCP tool
- Machine-queryable (`meta_state_list`, `meta_state_ack`, `meta_state_resolve`)
- Not gate-enforced
- Entry format: `id`, `category`, `severity`, `affected_system`, `description`, `evidence`, `auto_resolve`, `status`, `created_at`, `expires_at`

**Relationship to other artifacts:**
- Meta-state entries are **findings** about the loop
- They may reference conventions ("The convention at X is unclear")
- They may reference decisions ("Decision Y was not followed")
- They do NOT replace conventions or decisions

### Artifact 2: Meta Decisions (`records/meta/decisions/`)

**Purpose:** Durable governance decisions about the loop architecture — parser swap, preflight gate adoption, observation-state-check rule.

**Characteristics:**
- Editorial lifecycle: `draft` → `reviewed` → `approved`
- Written by operator or human-in-the-loop
- Schema: `decision.schema.json`
- Record convention: `decision-meta-{timestamp}-{slug}.yaml`
- Example: `decision-meta-260522T2030Z-adopt-preflight-gate-as-mandatory-for-all-product-writes`

**Relationship to other artifacts:**
- Decisions **canonize** conventions into mandatory rules
- A decision may reference a convention ("Adopt the convention documented in...")
- A decision may reference a meta-state finding ("Address the gap reported in meta-state entry...")
- Decisions are the **end of the chain** for normative changes

### Artifact 3: Meta Conventions (new — not yet created)

**Purpose:** Durable loop rules with provenance — the operational knowledge that agents need to follow. The provenance, trigger, and rationale are included.

**Characteristics:**
- No editorial lifecycle (not a decision, not a finding)
- Written by operator or human-in-the-loop
- Flat structure: one file per convention
- Schema: lightweight (no `dimension`, `experiment_refs`, `extraction` block)
- Record convention: `convention-meta-{topic-tag}.yaml` or `convention-{topic-tag}.yaml`

**Proposed schema:**
```yaml
id: convention-meta-observation-state-check
schema_version: "1.0"
type: convention
status: active
convention: Before asking user about external system state, scan records/observations/ for relevant observation records.
scope: meta-tooling
topic_tag: observation-state-check
source_refs:
  - file: local:docs/journals/260601-bridge-2-candidate-to-experiment-closeout.md
    section: "Part 4"
    reason: "Motivating case"
  - file: local:plans/reports/brainstorm-260601-meta-taxonomy-redesign.md
    section: "## The Three Meta-Level Artifacts"
    reason: "Design rationale"
provenance:
  trigger: "agent asked user about device slots instead of reading budget observation"
  discovered_at: "2026-05-29T00:00:00Z"
  rationale: "Observations are operator-managed and more reliable than agent memory or user recall"
  deferred_axes:
    - axis: "convention-vs-decision"
      trigger: "N=1 closeable; decision may follow if operator approves"
      status: "adopted-as-convention"
  superseded_by: null
  supersedes: []
```

**Relationship to other artifacts:**
- Conventions are the **source material** for decisions
- A convention may be promoted to a decision (operator: "This rule is now mandatory")
- A convention may be referenced by meta-state entries ("The convention at X is unclear")
- Conventions are **read-only** for agents (they follow them, they don't modify them)

## The Redesigned Taxonomy

```
Meta-State (ephemeral) → Convention (durable, provenance) → Decision (durable, mandatory)
    ↑                                          ↑
  agent reports gap                    operator canonizes
  agent checks for known issues          operator references
```

### Why Not Use the Existing Taxonomy?

| Existing Artifact | Why It Doesn't Fit | Replacement |
|---|---|---|
| `extracted-assertion` (`records/meta/index/*.yaml`) | Claims to be extracted from evidence, but evidence is now deleted. The `extraction` block references deleted files. The `self:` prefix is a hack. | `convention` (new artifact) |
| `evidence` (`records/meta/evidence/*.md`) | Used the same schema as product evidence (frontmatter, `## Findings`, extraction). But meta evidence is provenance, not vendor docs. | `convention` (reclassified) |
| `experiment` (`records/meta/experiments/*.yaml`) | Only 2 experiments, both about install-template candidates. No runtime experiments exist at meta-level. | Retire (use meta-state for experiment-worthy findings) |
| `risk` (`records/meta/risks/*.yaml`) | 3 risks, one about capability allowlist overreach. Risks are valid but should reference conventions, not be standalone. | Keep as risk records, but reference conventions |

### Why Not Use Meta-State for Conventions?

Meta-state entries are ephemeral (24h TTL). Conventions are durable. The agent needs to know the rule "check observations before asking user" in every session, not just for 24h. Meta-state is for **discovering** gaps. Conventions are for **remembering** rules.

## The Three Meta-Level Surfaces

### Surface 1: Meta-State (`meta-state.jsonl`)

- **Purpose:** Runtime findings about the loop
- **Written by:** Agent
- **Read by:** Agent (self-learning)
- **Lifecycle:** Ephemeral, auto-resolve
- **Example:** "Agent could not discover the meta-state.jsonl registry" (meta-state entry, auto-resolves when documentation is fixed)

### Surface 2: Meta Conventions (`tools/learning-loop-mcp/conventions/` or `docs/conventions/`)

- **Purpose:** Durable loop rules with provenance
- **Written by:** Operator
- **Read by:** Agent (behavioral rules)
- **Lifecycle:** Permanent, versioned
- **Example:** "Before asking user about external system state, scan records/observations/"

### Surface 3: Meta Decisions (`records/meta/decisions/`)

- **Purpose:** Mandatory governance changes
- **Written by:** Operator
- **Read by:** Agent (must follow)
- **Lifecycle:** Editorial (draft → reviewed → approved)
- **Example:** "Adopt preflight gate as mandatory for all product writes"

## The Agent's Self-Learning Flow

```
1. Agent starts session
2. meta_state_list → sees active findings (bugs, gaps, unclear conventions)
3. Reads conventions → knows behavioral rules
4. Reads decisions → knows mandatory governance
5. During work, discovers gap → meta_state_report
6. Next session, sees the finding → knows to avoid the pattern
7. Code is fixed → entry auto-resolves
8. Operator wants to make a rule permanent → writes convention
9. Operator wants to mandate a rule → writes decision
```

## Migration Steps

### Step 1: Restore Meta Evidence (Temporary)

The 28 deleted evidence files contain the provenance for the 96 conventions. They must be restored for the migration to extract provenance.

```bash
# Restore from git
git show 026d37c^:records/meta/evidence/ > records/meta/evidence/  # all 28 files
```

**Why temporary:** The evidence files use the wrong schema (`## Findings`, `validation_status`, `capability`, `dimension`). Once provenance is extracted, they are deleted again.

### Step 2: Create Convention Schema

```yaml
# schemas/convention.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^convention-(meta-)?[a-z0-9-]+$" },
    "schema_version": { "type": "string" },
    "type": { "const": "convention" },
    "status": { "enum": ["active", "deprecated", "draft"] },
    "convention": { "type": "string" },
    "scope": { "type": "string" },
    "topic_tag": { "type": "string" },
    "source_refs": {
      "type": "array",
      "items": { "$ref": "#/$defs/source_ref" }
    },
    "provenance": {
      "type": "object",
      "properties": {
        "trigger": { "type": "string" },
        "discovered_at": { "type": "string", "format": "date-time" },
        "rationale": { "type": "string" },
        "deferred_axes": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "axis": { "type": "string" },
              "trigger": { "type": "string" },
              "status": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

### Step 3: Migrate 96 Meta Assertions to Conventions

For each meta assertion:
1. Read the original evidence file (restored in Step 1)
2. Extract the `provenance` block (trigger, rationale, deferred axes)
3. Create a `convention` file with the provenance included
4. Delete the original evidence file
5. Delete the `extracted-assertion` index entry

**Why 96 conventions?** The assertions are rules. The provenance makes them meaningful. The 1:1 philosophy at product-level means one assertion per evidence file. At meta-level, the provenance is part of the convention. So 96 conventions = 96 provenance files.

### Step 4: Remove `self:` Prefix

The `self:` prefix was created for meta-level assertions to claim they stand alone. With conventions, the provenance is explicit. The `self:` prefix is no longer needed.

- Update `source-ref-validator.js` to remove `self:` support
- Update `index-entry.schema.json` to remove `self:` from regex
- Update `record-validation-rules.js` to remove `self:` branch
- The 96 meta assertions are deleted, so no `self:` refs remain

### Step 5: Update Agent Prompts

- Replace `records/meta/index/` references with `conventions/`
- Replace `records/meta/evidence/` references with `conventions/`
- Update the Agent Intake Flow to scan conventions before evidence

### Step 6: Verify

- `pnpm validate:records` passes (no meta index entries, no meta evidence)
- `pnpm test` passes (no `self:` prefix tests)
- `meta_state_list` shows active entries
- `conventions/` contains 96 files with provenance

## Risks

> **REJECTED:** The following sections (Risks, Success Criteria, Open Questions, Next Steps) are part of the rejected proposal. The risks are real; the mitigations are wrong. The correct mitigation is not to create the conventions at all.

| Risk | Severity | Mitigation |
|---|---|---|
| 96 conventions are still a lot of files | Medium | Conventions can be grouped by scope (e.g., `conventions/gate-rules/`, `conventions/agent-rules/`) |
| Provenance extraction is manual | Medium | Write a script to extract provenance from evidence files automatically |
| Agent confusion during migration | High | Temporary period where both `records/meta/index/` and `conventions/` exist; agent reads both |
| Convention schema is too rigid | Low | Start with minimal schema, add fields as needed |
| Meta decisions reference deleted assertions | Medium | Update all meta decisions to reference conventions instead |

## Success Criteria

- `records/meta/index/` is empty
- `records/meta/evidence/` is empty
- `conventions/` contains 96 files with provenance
- `meta_state_list` returns active entries
- `pnpm validate:records` passes
- `pnpm test` passes
- Agent knows to read conventions for behavioral rules
- Agent knows to report gaps via meta_state_report

## Open Questions

1. **Should conventions live in `tools/learning-loop-mcp/conventions/` or `docs/conventions/`?**
   - `tools/learning-loop-mcp/conventions/` is closer to the MCP server
   - `docs/conventions/` is closer to human-readable docs
   - Recommendation: `tools/learning-loop-mcp/conventions/` because they are machine-readable artifacts

2. **Should conventions be grouped by scope?**
   - `conventions/gate-rules/` (preflight, budget, observation-state-check)
   - `conventions/agent-rules/` (memory, evidence browsing, decision-first)
   - `conventions/extraction-rules/` (findings syntax, topic-tag format, frontmatter)
   - Recommendation: Yes, grouped by scope to reduce file count

3. **Should conventions reference meta decisions?**
   - A convention may be promoted to a decision
   - A convention should reference the decision that promoted it
   - Recommendation: Yes, `provenance.promoted_by` field

4. **Should meta-state entries reference conventions?**
   - A meta-state entry about a gap may reference the convention that is unclear
   - A meta-state entry about a bug may reference the convention that is violated
   - Recommendation: Yes, `affected_convention` field

## Next Steps

1. **Approve this design** — confirm the three-tier taxonomy
2. **Create plan** — `/ck:plan` for the migration
3. **Restore evidence** — temporary restore for provenance extraction
4. **Create convention schema** — `schemas/convention.schema.json`
5. **Migrate assertions** — script to extract provenance and create conventions
6. **Clean up** — delete meta index, delete meta evidence, remove `self:` prefix
7. **Update prompts** — agent reads conventions, not meta index

## Appendix: The 28 Deleted Evidence Files

The following evidence files were deleted in commit `026d37c`. They contain the provenance for the 96 conventions:

- `records/meta/evidence/ajv-dryrun-results-260512.md`
- `records/meta/evidence/capabilities-stack-migration.md`
- `records/meta/evidence/capability-allowlist-deferred-axes.md`
- `records/meta/evidence/capability-dir-scan-rule.md`
- `records/meta/evidence/capability-generation-extension.md`
- `records/meta/evidence/capability-schema-gap.md`
- `records/meta/evidence/dimension-based-lifecycle-rationale.md`
- `records/meta/evidence/evidence-findings-convention.md`
- `records/meta/evidence/evidence-truth-status-mechanism.md`
- `records/meta/evidence/install-experiment-template-candidate.md`
- `records/meta/evidence/install-experiment-template-gap.md`
- `records/meta/evidence/knowledge-pack-lane-deferral.md`
- `records/meta/evidence/knowledge-pack-retirement.md`
- `records/meta/evidence/live-gate-template.md`
- `records/meta/evidence/mcp-crud-gap-macro-implementation-260522.md`
- `records/meta/evidence/n-equals-one-gap-class.md`
- `records/meta/evidence/observation-record-discovery-gap.md`
- `records/meta/evidence/preflight-gate-effectiveness.md`
- `records/meta/evidence/process-side-artifact-ambiguity.md`
- `records/meta/evidence/product-shape-verification-class.md`
- `records/meta/evidence/resource-budget-procedural-rules.md`
- `records/meta/evidence/runtime-run-schema-deferral.md`
- `records/meta/evidence/secret-injection-class.md`
- `records/meta/evidence/skill-template-gap-260520T2133Z.md`
- `records/meta/evidence/vnstock-installer-bootstrap.md`
- `records/meta/evidence/vnstock-installer-bootstrap-runtime.md`
- `records/meta/evidence/yaml-parser-friction-and-schema-inventory-260512.md`

## Appendix: The 2 Deleted Risk Files

- `records/meta/risks/.deleted/risk-meta-260601T1328Z-bridge-components-tested-in-isolation-without-end-to-end-exercise.yaml`
- `records/meta/risks/.deleted/risk-meta-260601T1340Z-bridge-components-tested-in-isolation-without-end-to-end-exercise.yaml`

## Appendix: The 96 Meta Index Entries

All 96 entries in `records/meta/index/*.yaml` are `extracted-assertion` type with `self:` source refs. They should be retired and migrated to conventions. The full list is available via `ls records/meta/index/*.yaml`.

## Corrected Response (What Should Have Happened)

This section replaces the rejected **Migration Steps** and **Next Steps** above.

### Corrected Step 1: Audit the 96 Assertions

For each of the 96 meta assertions, ask:
- Is it still true?
- Is it already encoded in the MCP server, gate logic, or agent prompts?
- Is it actually needed by the next agent?
- Is it noise (historical provenance, not a live rule)?

### Corrected Step 2: Delete the Dead Ones

If an assertion is outdated, superseded, or no longer relevant, delete it. The git history preserves the provenance. Do not restore the 28 deleted evidence files. They were deleted for a reason.

### Corrected Step 3: Encode the Live Ones

If an assertion is still true and important, encode it where it is actually needed:
- **MCP tool descriptions** — if the rule affects how a tool is used (e.g., "Before asking user about external system state, scan `meta_state_list` first")
- **Gate logic** — if the rule is a constraint (e.g., "check observations before asking user" becomes a gate check)
- **Agent prompt injection** — if the rule is a behavioral guideline (e.g., "scan observations before asking user" becomes a preflight checklist item)

### Corrected Step 4: Report the Uncertain Ones

If an assertion cannot be encoded in existing surfaces, report it as a meta-state gap with category `taxonomy-proposal` and let the operator decide. The operator — not the agent — decides whether a new artifact type is warranted.

### Corrected Step 5: Remove `self:` Prefix

The `self:` prefix was a temporary hack. Remove it from the remaining index entries. Update `source-ref-validator.js` to remove `self:` support. This is independent of the convention proposal and should still happen.

### Corrected Success Criteria

- `records/meta/index/` contains only assertions that are still true and referenced
- `records/meta/evidence/` remains empty (no restoration)
- No new `conventions/` directory exists
- No `schemas/convention.schema.json` exists
- The MCP server and agent prompts encode the critical behavioral rules
- `meta_state_list` shows active entries for any gaps that could not be encoded
- `pnpm validate:records` passes
- `pnpm test` passes

### Corrected Next Steps

1. **Record a meta-state entry** — `meta-state-260602T0000Z-escape-hatch-abuse-meta-taxonomy` with category `escape-hatch-abuse` referencing this report as the exhibit
2. **Delete the `self:` prefix** — from the remaining meta index entries
3. **Audit the 96 assertions** — operator review, not agent design
4. **Encode the critical ones** — in MCP server, gate logic, or agent prompts
5. **Report any remaining gaps** — as meta-state entries with category `taxonomy-proposal`
6. **Do not create a new artifact type** — the operator decides taxonomy changes

## Cross-References

- `docs/philosophy.md` — the document that this report violates
- `plans/reports/brainstorm-260602-agent-docs-plans-default-pattern.md` — analysis of why this report is wrong
- `docs/observation-vs-meta-state.md` — separation between observations and meta-state
- `docs/trajectory.md` — four bridges, gradient from docs to loop mechanics
- `plans/reports/brainstorm-260527-meta-state-registry.md` — meta-state registry design
- `plans/260601-meta-1to1-artifact-cleanup/` — the plan that triggered this redesign
- `records/meta/index/` — the 96 assertions to be audited
- `records/meta/decisions/` — the 16 decisions that reference conventions
