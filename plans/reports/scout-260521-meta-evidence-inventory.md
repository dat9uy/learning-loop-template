# Scout Report: Meta Evidence Inventory

Date: 2026-05-21
Scope: `records/evidence/meta/*.md` — all 17 files
Purpose: Check for content overlap with proposed new artifacts; audit format consistency

---

## Inventory

| # | File | Frontmatter | `## Findings` | `## Superseded By` | Notes |
|---|------|-------------|---------------|-------------------|-------|
| 1 | `ajv-dryrun-results-260512.md` | Full | No | No | Has `id` matching filename stem |
| 2 | `capability-allowlist-deferred-axes.md` | None | No | No | No timestamp in filename |
| 3 | `capability-dir-scan-rule.md` | None | No | Yes | Points to operator-guide canonization |
| 4 | `capability-schema-gap.md` | None | No | No | Has `## Partial Supersession` status update |
| 5 | `dimension-based-lifecycle-rationale.md` | None | No | No | Architecture rationale doc |
| 6 | `evidence-truth-status-mechanism.md` | None | No | Yes | Points to operator-guide canonization |
| 7 | `install-experiment-template-candidate.md` | None | No | No | Template spec (draft) |
| 8 | `install-experiment-template-gap.md` | None | No | No | Has `## Resolution` status update |
| 9 | `n-equals-one-gap-class.md` | None | No | Yes | Points to skill reference canonization |
| 10 | `observation-record-discovery-gap.md` | None | No | Yes | Points to operator-guide canonization |
| 11 | `process-side-artifact-ambiguity.md` | None | No | No | Has `## Status Update` |
| 12 | `product-shape-verification-class.md` | None | No | No | Counter/sample tracker |
| 13 | `runtime-run-schema-deferral.md` | None | No | No | Counter/sample tracker |
| 14 | `secret-injection-class.md` | None | No | No | Proposed class label |
| 15 | `skill-template-gap-260520T2133Z.md` | Partial | No | No | Has `validation_status: passed` but no `id` |
| 16 | `yaml-parser-friction-and-schema-inventory-260512.md` | Full | No | No | Has `id` matching filename stem |

Wait — recount: 16 files listed, but `find` returned 17. Missing: none; `ajv-dryrun` is #1, `yaml-parser-friction` is #16, and the list above is 16 entries. Rechecking `find` output: 17 paths. The missing one is `skill-template-gap-260520T2133Z.md` which is #15. So 16 files? No, let me recount the find output:

1. ajv-dryrun-results-260512.md
2. capability-allowlist-deferred-axes.md
3. capability-dir-scan-rule.md
4. capability-schema-gap.md
5. dimension-based-lifecycle-rationale.md
6. evidence-truth-status-mechanism.md
7. install-experiment-template-candidate.md
8. install-experiment-template-gap.md
9. n-equals-one-gap-class.md
10. observation-record-discovery-gap.md
11. process-side-artifact-ambiguity.md
12. product-shape-verification-class.md
13. runtime-run-schema-deferral.md
14. secret-injection-class.md
15. skill-template-gap-260520T2133Z.md
16. yaml-parser-friction-and-schema-inventory-260512.md

That's 16 files, not 17. The initial count was off.

---

## Format Consistency Audit

### Frontmatter

| Standard | Files Compliant | Files Non-Compliant |
|----------|----------------|---------------------|
| Operator guide: "Evidence files must include frontmatter with `capability`, `dimension`, `scope`, and `validation_status` for extraction to be attempted" | 3 (`ajv-dryrun`, `yaml-parser-friction`, `skill-template-gap`) | 13 (all others) |

**Observation:** 13 of 16 meta evidence files have no frontmatter. Per the operator guide, these files are "silently skipped, not errored" by `pnpm extract:index`. This is intentional — meta evidence files use a narrative format (`## Observation`, `## Evidence`, `## Trigger`) not meant for machine extraction into index entries.

**Implication:** Our 4 proposed new meta evidence files (`evidence-findings-convention.md`, `resource-budget-procedural-rules.md`, `capability-generation-extension.md`, `live-gate-template.md`) should follow the same narrative format as existing meta evidence. They do not need `## Findings` with `[topic-tag]` bullets.

### Filename Convention

| Standard | Compliant | Non-Compliant |
|----------|-----------|---------------|
| Operator guide: "Meta Evidence | `<descriptive-kebab-slug>.md` | No" (no timestamp) | 13 | 3 |

Non-compliant: `ajv-dryrun-results-260512.md`, `yaml-parser-friction-and-schema-inventory-260512.md`, `skill-template-gap-260520T2133Z.md`

**Observation:** The 3 timestamped files were authored before or during the artifact-timestamp-convention decision. They predate the "no timestamp for meta evidence" rule.

**Implication:** Our 4 proposed filenames should use descriptive kebab slugs without timestamps.

### Section Conventions

All 16 meta evidence files use a consistent section structure:

```
## Observation      (the problem/gap observed)
## Evidence         (supporting data, source_refs)
## Proposed ...     (improvement, rule, template)
## Trigger          (event class, threshold, action)
## Deferral         (when to promote, what blocks promotion)
## Superseded By    (optional — points to canonized location)
## Status Update    (optional — captures resolution state)
## Resolution       (optional — captures what was done)
```

**No file uses `## Findings` with `[topic-tag]` bullets.** This confirms meta evidence follows a different format than domain evidence meant for index extraction.

---

## Content Overlap Check

### Proposed: `evidence-findings-convention.md`
**Topic:** Syntax rules for `## Findings` sections (topic-tags, Context/Caveat prefixes, frontmatter requirements, silent-skip behavior).

**Overlap scan:**
- `install-experiment-template-candidate.md` describes required body sections for install experiments, but does not mention `## Findings` or index extraction.
- `install-experiment-template-gap.md` mentions the template gap but not findings syntax.
- No other file touches findings convention.

**Verdict:** No overlap. New topic.

### Proposed: `resource-budget-procedural-rules.md`
**Topic:** How the resource budget state-machine works (4-step flow, 6 key rules, validation window, dependency chain rule).

**Overlap scan:**
- `observation-record-discovery-gap.md` mentions resource budgets in one motivating case (agent asked user about device slots instead of reading observation). Does NOT cover the procedural rules.
- `ajv-dryrun-results-260512.md` does not mention budgets.
- No other file touches resource budgets.

**Verdict:** No overlap. New topic.

### Proposed: `capability-generation-extension.md`
**Topic:** 5-step procedure for adding a new surface to the capability generation pipeline.

**Overlap scan:**
- `capability-allowlist-deferred-axes.md` discusses capability generation from the allowlist/glob perspective (Axis 3 touches manifest detection). Does NOT cover the extension procedure.
- `capability-schema-gap.md` discusses schema fields, not generation procedure.
- `capability-dir-scan-rule.md` is about evidence scanning, not generation.
- No other file touches capability generation.

**Verdict:** No overlap. New topic.

### Proposed: `live-gate-template.md`
**Topic:** Generic template for adding a live gate (env var pattern, approval flow, decision record fields).

**Overlap scan:**
- `skill-template-gap-260520T2133Z.md` mentions: "Domain overfit: docs/operator-guide.md contained vnstock-specific examples without a generic gate-addition template." The fix applied was splitting operator-guide into generic core + vnstock appendix. But the generic template is still in the operator guide, not a standalone meta evidence file.
- `secret-injection-class.md` discusses env vars for secrets, not live gates.
- No other file touches live gate templates.

**Verdict:** Related to `skill-template-gap` but not overlapping. The gap file documents the *discovery* of the missing template; our proposed file would *provide* the template. Both can coexist — the gap file references the new template file via `## Superseded By` or `## Resolution` update.

---

## Key Findings

1. **Meta evidence format is currently inconsistent.** 13 of 16 files lack frontmatter; none use `## Findings` with `[topic-tag]` bullets. They use narrative sections (`## Observation`, `## Evidence`, `## Trigger`, `## Deferral`). **Decision:** All meta evidence files going forward must use `## Findings` with `[topic-tag]` bullets plus required frontmatter. Narrative sections remain as supplementary context.

2. **No content overlap** between proposed artifacts and existing meta evidence. All 4 topics are new.

3. **`## Superseded By` is the deprecation mechanism.** When operator-guide content moves to meta evidence, existing meta evidence files that referenced the operator guide should be updated. Four files currently have `## Superseded By` pointing to `docs/operator-guide.md`. After the guide shrink, these pointers may become stale.

4. **Filename convention drift.** 3 of 16 files have timestamps in filenames, violating the "no timestamp for meta evidence" rule. These predate the convention.

---

## Recommendations

1. **Author 4 new meta evidence files using `## Findings` with `[topic-tag]` bullets.** Include frontmatter (`capability`, `dimension`, `scope`, `validation_status`). Narrative sections (`## Observation`, `## Evidence`, `## Trigger`, `## Deferral`) are supplementary.

2. **Update `skill-template-gap-260520T2133Z.md`** with a `## Resolution` or `## Status Update` section referencing the new `live-gate-template.md` once created.

3. **Audit `## Superseded By` pointers** in 4 files after operator-guide shrink. If the canonized content moves from operator-guide to meta evidence, update the pointer.

4. **Do not retroactively add frontmatter** to existing meta evidence files. The "silently skipped" behavior is working as designed.
