---
phase: 4
title: "Operator Docs + Regression"
status: complete
priority: P1
effort: "45m"
dependencies: [3]
---

# Phase 4: Operator Docs + Regression

## Overview

Drop pack-related lines from the four operator-facing docs and the two skill-facing docs under `.claude/skills/learning-loop/`, run the full regression pass, code-review, and land the second commit. After this phase the working tree carries zero pack-as-active-concept surface; only the still-at-draft deferral YAML, the new retirement decision + evidence, and historical journals + historical deferral evidence MD retain the word (intentionally preserved as audit trail).

## Requirements

- Functional: `pnpm check` exit 0 with all remaining records validated. The reduced negative-fixture suite (24 cases instead of ~30) trips on every remaining case.
- Non-functional: Doc edits are surgical — drop the pack lines, leave neighboring prose intact. No new latent-marker lines (the retirement decision explicitly removes them).

## Architecture

### Operator-facing doc edits (4 files)

- `README.md` line 14: drop the `| `knowledge-packs/` | latent (not used in current product line; draft placeholder retained) |` row from the Lanes table. Verify the table renders without the row.

- `docs/charter.md` line 34: drop the paragraph/bullet `- `knowledge-packs/`: latent. Pack publication is not part of the current product line; existing draft manifests stay as placeholders until a future decision reactivates the pack lane.` Confirm no neighboring paragraph references the dropped bullet.

- `docs/operator-guide.md`:
  - Line 11: drop the trailing clause `The `knowledge-packs/` lane is latent in the current product line; existing draft manifests stay as placeholders.` Leave the leading sentence about `records/` and `docs/` intact.
  - Line 204: drop the trailing clause `The `knowledge-packs/` root remains in the validator's per-record-type allowlist tables for backward compatibility but is not used by the current product line.` Leave the preceding sentence about the validator's `product/*/capabilities/...` allowlist intact.

- `docs/red-team-review.md` line 24: drop the trailing clause `and pack publication failures` from `Negative fixtures validate unsafe references and pack publication failures.` so it reads `Negative fixtures validate unsafe references.` Verify the surrounding red-team review bullets read coherently.

### Skill-facing doc edits (2 files)

Quiet the project-local learning-loop skill so future Claude sessions don't reach for pack-as-active-concept guidance post-retirement. Edits are surgical; preserve every neighboring rule.

- `.claude/skills/learning-loop/SKILL.md`:
  - Line 3 (frontmatter `description`): drop `packs,` from the comma list. Current: `Use when asking how to prompt agents for evidence, records, experiments, runtime proofs, packs, or meta self-improvement.` New: `Use when asking how to prompt agents for evidence, records, experiments, runtime proofs, or meta self-improvement.`
  - Line 19 (When-to-Use bullet): drop `/ pack` from the slash list. Current: `- "Draft a handoff prompt for evidence / claims / experiment / pack work."` New: `- "Draft a handoff prompt for evidence / claims / experiment work."`
  - Line 32 (Workflow classify bullet): drop the entire `   - knowledge-pack curation` bullet so the classify list flows from `experiment planning or proof run` directly to `runtime/install proof`.

- `.claude/skills/learning-loop/references/learning-loop-rules.md`:
  - Line 12 (Source Docs to Read): drop the entire bullet `- `docs/knowledge-pack-contract.md` — pack curation contract.` The target file was already deleted in the May-10 quieting pass; this stale reference would otherwise outlive its source.
  - Line 27 (Repo Lanes): drop the entire bullet `- `knowledge-packs/`: curated consumer-facing packs.`
  - Line 41 (Separation Rules): drop the entire bullet `- pack approval vs product approval`.
  - Line 57 (Evidence and Citation Rules): rewrite `- Active records and packs cite local evidence or records, not old repo paths.` to `- Active records cite local evidence or records, not old repo paths.`
  - Line 61: drop the entire bullet `- Use `pack:<id>` for packs.`
  - Line 62: drop the entire bullet `- Knowledge packs cite `record_ref`, not raw evidence paths.`
  - Line 63: drop the entire bullet `- Reviewed/approved packs may be consumed by experiments; unreviewed packs cannot.`
  - Line 91 (Validation lead-in): rewrite `Default validation after records/packs/evidence changes:` to `Default validation after records and evidence changes:`

After both files: grep `pack` inside `.claude/skills/learning-loop/`; expect zero matches.

Additional active skill surfaces found during review and retired in the same bundle:
- `.claude/skills/learning-loop/evals/evals.json`: remove the pack-curation eval case.
- `.claude/skills/learning-loop/references/prompt-blueprints.md`: remove pack prompts and pack-specific fields.
- `.claude/skills/learning-loop/references/prompt-blueprints-product-build.md`: rewrite product-build pre-read from records and knowledge packs to records and evidence.
- `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`: remove pack storage/example wording.

Verify after every edit that no doc paragraph leaves a dangling `and`, comma-followed-by-period, or other grammatical artifact.

### Regression pass

After all Phase 2 + 3 + 4 edits land:

1. `pnpm check` — confirm exit 0; capture the `Validated N records.` line; confirm N is unchanged from the post-Phase-1 baseline (no records added or removed by the retirement).
2. Run `pnpm validate:records` standalone to confirm parity.
3. Inspect the negative-fixture suite count: should be ~24 (previous count minus 11 deleted minus the 2 cases dropped from `runNegativeFixtures` plus or minus any other coverage drift). Confirm every remaining case still produces its expected error substring.
4. Confirm `grep -rn "pack" tools/ schemas/ records/ fixtures/ docs/ README.md .claude/skills/learning-loop/`:
   - Inside `tools/`, `schemas/`, `fixtures/`, and `.claude/skills/learning-loop/`: zero hits.
   - Inside `records/`: only the new retirement decision, the new retirement evidence MD, the still-at-draft deferral decision (`decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml`), and the historical deferral evidence MD (`records/evidence/loop/knowledge-pack-lane-deferral.md`) retain matches. No other paths.
   - Inside `docs/` historical journals (`docs/journals/`): retained intentionally; do not edit.

### Code review

- Run code-reviewer agent against the diff (excluding the Phase 1 ledger-only commit which is unchanged).
- Surface any concerns flagged by the reviewer; address correctness/scope issues before commit.
- Status DONE expected.

### Commit 2

Single commit message: `refactor(validator): retire knowledge-pack lane per decision-{YYMMDDTmmZ}` (substitute the actual decision filename minute from Phase 1).

Body:
```
Drops the knowledge-pack concept in full.

- Delete tools/validate-records/pack-source-validation.js (85 LoC).
- Delete tools/validate-records/publication-gate-validation.js (139 LoC).
- Delete tools/generate-docs/pack-summary.js (17 LoC).
- Drop validator imports, allowlist tokens, validateExperimentPacks, packStatuses plumbing.
- Drop the renderCapabilities renderer and the pack-rendering segments from generated-doc-content.js.
- Drop the pack: alternative from source_refs URI pattern in all 5 schemas.
- Drop knowledge_pack_ids from experiment schema (required + properties) and from 14 experiment records.
- Delete knowledge-packs/ directory.
- Delete 11 pack-related negative fixtures.
- Drop pack mentions from README, charter, operator-guide, red-team-review.
- Drop pack-as-active-concept guidance from .claude/skills/learning-loop/ (SKILL.md + references/learning-loop-rules.md).

Refs: decision-{YYMMDDTmmZ}-knowledge-pack-retirement (supersedes decision-20260510T174640Z-knowledge-pack-lane-deferral; deferral kept at status: draft because the supersedes link is the disposition signal).

Absorbs Phase B Cascades 6 + 7 from plans/reports/problem-solving-260512-1714-validate-records-simplification.md by deletion.
```

Substitute `{YYMMDDTmmZ}` with the timestamp captured in Phase 1.

Stage every Phase 2 + Phase 3 + Phase 4 change; do not include any Phase 1 path (already committed).

### Journal entry

Run `/ck:journal` after commit 2. Capture: retirement framing, the audit (zero in-flight pack refs), the absorbed cascade, the two-commit shape, the supersedes link, the doc-surface deltas.

## Related Code Files

- Modify: `README.md`, `docs/charter.md`, `docs/operator-guide.md`, `docs/red-team-review.md`.
- Modify: `.claude/skills/learning-loop/SKILL.md`, `.claude/skills/learning-loop/references/learning-loop-rules.md`.

## Implementation Steps

1. Read the four operator-facing doc files (`README.md`, `docs/charter.md`, `docs/operator-guide.md`, `docs/red-team-review.md`) and the two skill-facing doc files (`.claude/skills/learning-loop/SKILL.md`, `.claude/skills/learning-loop/references/learning-loop-rules.md`) to confirm current line numbers (codebase may have minor drift since plan authoring).
2. Edit each per the spec above; verify each edit with `git diff` before moving to the next.
3. Run `pnpm check`. If it fails, identify the cause and re-plan from the failing phase. Do not stage until green.
4. Run `pnpm validate:records` standalone for parity confirmation.
5. Run the grep audit (`grep -rn "pack" tools/ schemas/ records/ fixtures/ docs/operator-guide.md docs/charter.md docs/red-team-review.md README.md .claude/skills/learning-loop/`); confirm only the intended retained surfaces (new retirement decision + evidence, deferral decision still at draft, historical journals + historical deferral evidence MD) match.
6. Run code-reviewer agent on the staged diff.
7. Address any concerns surfaced; re-run `pnpm check` after any change.
8. Commit the entire Phase 2 + 3 + 4 bundle with the message above.
9. Run `/ck:journal` to capture the retirement.
10. Mark the plan complete via `ck plan check 1`, `ck plan check 2`, `ck plan check 3`, `ck plan check 4` (or one command per phase as they land).

## Todo List

- [x] Edit `README.md` (drop knowledge-packs row).
- [x] Edit `docs/charter.md` (drop pack-latent bullet).
- [x] Edit `docs/operator-guide.md` line 11 (drop pack-lane clause).
- [x] Edit `docs/operator-guide.md` line 204 (drop pack-allowlist clause).
- [x] Edit `docs/red-team-review.md` line 24 (drop pack-publication clause).
- [x] Edit `.claude/skills/learning-loop/SKILL.md` (frontmatter description, When-to-Use bullet, classify list).
- [x] Edit `.claude/skills/learning-loop/references/learning-loop-rules.md` (Source Docs bullet, Repo Lanes bullet, Separation Rules bullet, Evidence-and-Citation rewrites + 3 drops, Validation lead-in).
- [x] Edit additional active skill surfaces found by grep (`evals.json`, `prompt-blueprints.md`, `prompt-blueprints-product-build.md`, `meta-evidence-self-improvement.md`).
- [x] `pnpm check` exit 0.
- [x] `pnpm validate:records` exit 0.
- [x] Audit grep across `tools/ schemas/ records/ fixtures/ docs/ README.md .claude/skills/learning-loop/` — only intended surfaces retain `pack`.
- [x] `grep -rn "pack" .claude/skills/learning-loop/` returns no active pack concept matches.
- [x] Code-reviewer DONE_WITH_CONCERNS; addressed retirement-specific negative fixture gap; preserved historical record prose.
- [x] Commit 2 staged + landed with `refactor(validator): retire knowledge-pack lane per decision-{YYMMDDTmmZ}` (substitute the Phase-1 timestamp).
- [x] `/ck:journal` entry written.
- [x] Plan phases marked checked.

## Success Criteria

- [ ] All four operator-facing doc files render coherent prose after edits (no dangling `and`, stray commas, broken table rows).
- [ ] Both skill-facing doc files render coherent prose; SKILL.md frontmatter still parses; classify/evidence/citation lists are continuous (no orphan bullet markers).
- [ ] `pnpm check` exit 0; `Validated N records.` count matches the Phase 1 baseline.
- [ ] `pnpm validate:records` exit 0.
- [ ] Negative-fixture suite passes; case count reduced by 11 (deleted fixtures) minus the 2 cases removed from `runNegativeFixtures` (so net case-row reduction = 2; deleted-fixture-tree reduction = 11; both numbers verifiable in code review).
- [ ] `grep -rn "pack" tools/ schemas/ records/ fixtures/ .claude/skills/learning-loop/` returns no hits inside `tools/`, `schemas/`, `fixtures/`, or `.claude/skills/learning-loop/`; inside `records/`, hits only on the new retirement decision, the new retirement evidence MD, the still-at-draft deferral decision YAML, and the historical lane-deferral evidence MD.
- [ ] `grep -rn "knowledge-packs\|knowledge_pack" docs/` returns hits only in `docs/journals/` (historical); the four edited docs no longer match.
- [ ] `git diff records/decisions/decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml` returns empty across the whole commit (the deferral YAML is never touched in Phase 1 or Phase 4).
- [ ] Code-reviewer status DONE; no blocking concerns.
- [ ] Commit 2 message references the retirement decision filename minute from Phase 1.
- [ ] Journal entry exists under `docs/journals/` capturing this session.

## Risk Assessment

- **Risk:** Doc edits leave dangling syntax (e.g. trailing `and`, comma-followed-by-period).
  - **Mitigation:** Read each surrounding sentence after edit; if prose reads incomplete, rephrase to land on a clean sentence boundary. Acceptable to lightly reword the retained portion if needed.

- **Risk:** Code-reviewer surfaces a concern about a missed pack reference (e.g. a comment, a JSDoc, an inline test file).
  - **Mitigation:** Address before commit. If the concern is observational only, note for follow-up; if correctness, fix in-phase.

- **Risk:** The reduced negative-fixture suite accidentally loses coverage of a genuine validator path that the deleted pack fixtures shared with another concern.
  - **Mitigation:** Inspect the deleted fixtures before deletion (Phase 3) to identify any cross-concern usage. Expected: all 11 deleted fixtures are pack-only; no cross-coverage detected during plan authoring.

- **Risk:** The journal entry omits the supersedes-link framing and a future audit can't reconstruct the retirement chain.
  - **Mitigation:** Journal entry explicitly cites `decision-{YYMMDDTmmZ}-knowledge-pack-retirement` (substituting the Phase-1 minute) and its supersedes target `decision-20260510T174640Z-knowledge-pack-lane-deferral`. The supersedes graph in the ledger remains authoritative; the journal is supplementary narrative.

- **Risk:** An external CI consumer (e.g. a downstream fork) checks out commit 1 alone, expecting the pack code to be retired, but finds the lane still intact.
  - **Mitigation:** Commit 1 is intentionally ledger-only and leaves all pack code/schema/fixtures/docs intact; `pnpm check` is green at HEAD and validates the new approved retirement decision alongside the still-at-draft deferral. The supersedes link in the retirement decision signals intent; the deletion lands in commit 2. Mid-commit checkout is a fork-of-fork concern outside this plan's scope; the two-commit shape is documented in the retirement decision's tradeoffs and in plan.md's Risk Assessment.

- **Risk:** Skill-doc edits leave the frontmatter description string malformed (e.g. trailing comma or doubled comma after dropping `packs,`) and the SKILL loader fails to parse it.
  - **Mitigation:** The drop is `packs, ` (token plus comma plus space) so the surrounding `, or meta self-improvement` clause stays grammatical. Verify the parsed frontmatter by running any `grep -E "^description:" .claude/skills/learning-loop/SKILL.md` after the edit; expect one match with a comma-clean description string.

- **Risk:** Dropping the `docs/knowledge-pack-contract.md` line from learning-loop-rules.md's Source Docs section reveals that the file was already deleted, breaking the unstated invariant that every listed file exists.
  - **Mitigation:** This drop *repairs* the invariant — the source doc was already deleted in the May-10 quieting; the bullet has been a stale pointer since then. Removing it makes the Source Docs list correct rather than aspirational.
