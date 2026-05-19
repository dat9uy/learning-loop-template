---
phase: 2
title: "Operator-Guide Index-First Rewrite"
status: completed
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Operator-Guide Index-First Rewrite

## Overview

Rewrite `docs/operator-guide.md` — the heaviest doc in this plan. It has 36 claim references, a dedicated “Claim Verification” section, `pnpm verify:claim` documentation, and an agent-intake flow built around claims-first scanning. Each reference is evaluated: rewrite to index-first, note as frozen-legacy historical reference, or remove if obsolete. Add the `## Findings` convention and `pnpm extract:index` to the standard workflow.

## Context Links

- Brainstorm Plan 4: `plans/reports/brainstorm-20260518-machine-extracted-index.md` § Plan 4
- Current doc: `docs/operator-guide.md`
- Extracted index directory: `records/index/`
- Extraction tool: `tools/extract-index/extract-index.js`
- Index entry schema: `schemas/index-entry.schema.json`
- Frozen-legacy claims: `records/claims/`

## Key Insights

1. **The “Claim Verification” section (lines 51–61) is entirely frozen-legacy.** The `pnpm verify:claim` tool still works on historical claims but must not be presented as the current workflow. Replace with a “State Query Protocol” section that documents `pnpm extract:index` and index-first scanning.
2. **Agent intake flow step 2 (lines 241)** is the most load-bearing change. It currently says “Locate relevant claims, experiments, and decisions first” and “After claim-first orientation...”. This must become “Locate relevant index entries, experiments, and decisions first” and “After index-first orientation...”.
3. **Experiment schema still requires `claim_refs`.** This is a structural constraint: `schemas/experiment.schema.json` requires `verification.claim_refs`, and `claim-verification-rules.js` enforces that every experiment names at least one claim. New experiments for index-first work must cite frozen-legacy claims in `claim_refs` for validation purposes; the actual assertion lives in the index. Do not instruct operators to use a non-existent `evidence_refs` field — experiments use `source_refs` (common field) to point to local evidence files.
4. **`## Findings` convention is net-new.** It must be documented under “Evidence Model” or a new subsection.
5. **Capability records still reference claims** because capability records map verified library surfaces. For frozen-legacy claims this is unchanged; for new work, capability records should reference index entries via `maps[].source` (free string, convention-only until a future schema migration adds structured refs).
6. **Product Build Request and Capability Runtime Experiment** sections reference claims heavily. Update to index-first while preserving the structural workflow.
7. **Rule Origins sections (Q4 E, Q6) are historical archaeology.** They must keep original “claim-first” terminology with an optional `(historical)` annotation. Do not rewrite them.

## Requirements

- Functional: All primary workflow instructions rewritten to index-first; frozen-legacy tools noted as historical.
- Non-functional: Doc remains usable as a step-by-step operator reference; no section removed without replacement.

## Related Code Files

- Modify: `docs/operator-guide.md`
- Read for context: `docs/record-system-architecture.md`, `schemas/index-entry.schema.json`
- Read for context: `tools/extract-index/extract-index.js` (interface reference)

## Implementation Steps

1. **Section “Claim Verification” (lines 51–61) → “State Query Protocol”:**
   - Rename heading to `## State Query Protocol`.
   - Replace `pnpm verify:claim` description with `pnpm extract:index` description.
   - New text: `Run \`pnpm extract:index\` to regenerate machine-extracted assertions from evidence ## Findings. The tool reads all \`records/evidence/**/*.md\` files, extracts top-level bullets under \`## Findings\`, and writes \`records/index/assertion-<capability>-<dimension>-<topic-tag>.yaml\` entries.`
   - Add note: `The legacy \`pnpm verify:claim\` tool remains functional for frozen-legacy claims in \`records/claims/\`; do not use it for new work.`
   - Also update the intro sentence at line 52: `Before adding, verifying, rejecting, or product-approving claims, classify the claim with docs/artifact-reference.md.` → `Before verifying assertions, read docs/record-system-architecture.md for the index data model and docs/artifact-reference.md for schema details (note: artifact-reference.md is in transition; the index-entry schema lives in schemas/index-entry.schema.json).`

2. **Artifact patterns table (line 43):**
   - Add row: `| Index entry | records/index/ | assertion-<capability>-<dimension>-<topic-tag>.yaml | No |`
   - Update Claim row note: `No — frozen-legacy, read-only. No new entries.`

3. **Section “Adding Or Updating Records” (lines 73–83):**
   - Step 1: Keep as-is (add evidence).
   - Step 2: `Update claim, experiment, or decision records` → `Update experiment or decision records. For frozen-legacy claims, update only if correcting a cross-reference; for new work, author evidence with ## Findings and run pnpm extract:index.`
   - Add new step between 1 and 2: `Write or update evidence markdown with a ## Findings section containing atomic assertions tagged with [topic-tag].`
   - Add new step after step 2: `Run pnpm extract:index to regenerate records/index/ from evidence.`

4. **Section “Agent Intake Flow” (lines 230–258):**
   - Step 2 rewrite:
     - Old: `Locate relevant claims, experiments, and decisions first.`
     - New: `Locate relevant index entries, experiments, and decisions first.`
     - Old: `After claim-first orientation but before drafting experiment steps, list records/evidence/<capability>/ end-to-end... truth-status of any discovered file is still determined per the claims-first rule above (Q6 rule).`
     - New: `After index-first orientation but before drafting experiment steps, list records/evidence/<capability>/ end-to-end... truth-status of any discovered file is still determined per the index-first rule above (Q6 rule).`
   - Step 3: `Extract candidate claims and risks` → `Extract candidate index entries (or frozen-legacy claims) and risks.`
   - Step 8: `Plan experiments with explicit claim_refs` → `Plan experiments with explicit claim_refs (still required by experiment schema for validation; cite frozen-legacy claims for new work), source_refs (point to local evidence files), risk_refs, verification.proves...`
   - Step 10: `Link experiment results back to claims/risks.` → `Link experiment results back to evidence (which feeds the index) and risks.`
   - Step 11: `Derive claim assurance from verification dimensions.` → `Derive assertion assurance from verification dimensions.`
   - Step 12: `Publish capability records only after their record_ref claims are verified` → `Publish capability records only after their maps[].source references (index entries or frozen-legacy claims) are verified.`

5. **Section “Product Build Request” (lines 262–273):**
   - `Expand request into claims, risks, experiments, and decisions.` → `Expand request into assertions (index entries), risks, experiments, and decisions.`
   - `Required claims usually include...` → `Required assertions usually include...`
   - `Capability records must state the verified library surfaces (via record_ref to surface claims)` → `Capability records must state the verified library surfaces (via maps[].source to reference index entries or frozen-legacy claims)`

6. **Section “Capability Runtime Experiment” (lines 276–285):**
   - `Capability scripts verify the runtime dimension of a claim.` → `Capability scripts verify the runtime dimension of an assertion (index entry or frozen-legacy claim).`
   - `update claim runtime dimension to verified` → `update the corresponding index entry's source evidence validation_status to passed, then run pnpm extract:index`

7. **Section “Intentional Skip Pattern” (lines 308–316):**
   - `Convert skipped required knowledge into: records-side status/claim;` → `Convert skipped required knowledge into: records-side status/index-entry or frozen-legacy claim;`

8. **Section “Evidence Doc Execution Verification” (lines 319–327):**
   - `Build a claim extraction matrix` → `Build an assertion extraction matrix`

9. **Section “External/User-Provided Decision Input” (lines 330–337):**
   - `Recommend: evidence note, scoped claims, active risks...` → `Recommend: evidence note, scoped assertions (index entries), active risks...`

10. **Section “Self-Improvement Flow” (lines 341–350):**
    - `The agent can create claims/risks/experiments about workflow gaps.` → `The agent can create index-entry candidates/risks/experiments about workflow gaps.`

11. **Add new section “Evidence Findings Convention” after “Evidence Model” (around line 65):**
    ```markdown
    ## Evidence Findings Convention

    Evidence markdown files may include a `## Findings` section for machine extraction into `records/index/`.

    - Each top-level bullet starts with `[topic-tag]` followed by an atomic assertion.
    - Nested bullets prefixed `Context:` populate the index entry `context` field.
    - Nested bullets prefixed `Caveat:` populate the index entry `caveats` array.
    - The extraction tool (`pnpm extract:index`) reads this section and produces `records/index/assertion-<capability>-<dimension>-<topic-tag>.yaml`.
    - Evidence files must include frontmatter with `capability`, `dimension`, `scope`, and `validation_status` for extraction to be attempted.
    - Files without a `## Findings` section (or with no `[topic-tag]` bullets) are silently skipped, not errored.
    ```

12. **Rule Origins sections (lines 435–453) — historical context preservation:**
    - `### Q4 E - Claims-first scanning for evidence truth-status` → keep original heading, optionally add `(historical)` annotation.
    - The narrative body explaining the Q4 E decision history must keep original “claim-first” and “claims-first” terminology — it is documentary archaeology, not workflow instruction.
    - `### Q6 - Capability-directory scan after claims-first orientation` → keep original heading, optionally add `(historical)`.
    - Do not rewrite these sections to index-first language.

13. **Update “Experiment Result Convention” and surrounding sections if they reference claims.**

14. **Run `pnpm check` after save. Note:** `pnpm check` does not include `pnpm extract:index`; run that separately after evidence edits.

## Success Criteria

- [ ] `docs/operator-guide.md` contains zero instances of “claim-first”, “claims first”, or unqualified “read claims first”.
- [ ] The “Claim Verification” section is replaced with “State Query Protocol” documenting `pnpm extract:index`.
- [ ] Agent intake flow step 2 uses index-first language.
- [ ] The `## Findings` convention is documented in a dedicated subsection.
- [ ] Frozen-legacy references to `pnpm verify:claim` and `records/claims/` are clearly marked as historical.
- [ ] `pnpm check` passes.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Over-rewriting breaks capability-record or experiment conventions that still reference claims legitimately | Only rewrite workflow instructions, not schema field names; schema fields remain unchanged |
| Agent intake flow becomes confusing with dual new/frozen-legacy paths | Keep language simple: “for new work, use X; frozen-legacy claims remain in records/claims/” |
| Adding the Findings convention section bloats the doc | Keep it under 15 lines; link to record-system-architecture.md for full schema details |
| Capability records lack structured index-entry reference (`maps[].source` is free text) | Acknowledge as convention-only gap in docs; future schema migration may add `index_entry_refs` or structured `maps[].source` validation |

## Next Steps

- Phase 3 (Artifact-Reference update) depends on Phase 2 for terminology alignment.
