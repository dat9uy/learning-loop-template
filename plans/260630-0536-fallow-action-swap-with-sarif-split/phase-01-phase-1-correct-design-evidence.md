---
phase: 1
title: "Phase 1: Correct design evidence"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Correct design evidence

## Overview
Update the deep-dive report's wrong §6.3 / §6.5 claims about codeql-action multi-run SARIF handling and the decision record's D2 (per-analyzer categories). This phase is **read + docs only** — no code changes, no test changes. It establishes the corrected evidence base before Phase 2 starts touching the workflow.

## Requirements

### Functional
- Deep-dive `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` §6.3 and §6.5 must be replaced with the corrected evidence:
  - `areAllRunsUnique` validator in `github/codeql-action/src/sarif/index.ts` builds its key from `run.tool?.driver?.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails?.id`. `category` is NOT in the key.
  - Live SARIF diff from `tools/learning-loop-mastra/reports/fallow/audit.sarif` showing 3 runs with identical `tool.driver.{name,version}` and `automationDetails` populated only on the dupes run.
  - Source-level evidence linking `build_audit_sarif` in `crates/api/src/audit_output.rs` to the partial-fix pattern (dupes run has `automationDetails.id`; dead-code and health runs do not).
- Decision record `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` D2 **annotated** to confirm it remains correct (was already "Drop (Migration A)" before this plan; the PR #22 failure was an orthogonal bug, not a category-routing issue). Annotation note added to the D2 section explaining:
  - The original Phase 4 design (Migration B, 1 SARIF + 1 upload) was correct in spirit.
  - Migration A (3 SARIF + 3 uploads) was proposed based on incorrect evidence.
  - Option B (inline jq patch + 1 upload) preserves the original Phase 4 design intent while fixing the actual codeql-action v4 validation failure.
- Meta-state entry `meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo` updated with the corrected source citations (link to the source-audit report and the deep-dive diff).

### Non-functional
- All edits preserve the original report's voice and section numbering — only §6.3 / §6.5 are touched.
- Cross-references between the deep-dive, the decision record, and the source-audit report must form a closed loop (each cites the other).
- No fabricated evidence: every corrected claim must be backed by either (a) a verified citation (file:line in codeql-action or fallow source) or (b) the live SARIF diff from the locally-pinned `tools/learning-loop-mastra/reports/fallow/audit.sarif`.

## Architecture

Pure documentation update. No architecture diagrams needed. The deliverable is a 3-way linked evidence chain:

```
plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md
  (the source-level audit; cites codeql-action and fallow files by path + line)

plans/reports/research-260630-1354-GH-2011-fallow-sarif-upstream-search.md
  (the upstream issue search; cites PR #1102 as precedent; F-6 deferred)

plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md
  §6.3 / §6.5 (the WRONG claims — gets corrected)
        ↓ cites
plans/reports/research-260630-1425-...md § Layer 1 / Layer 2

plans/reports/decision-260629-2011-fallow-action-swap-decisions.md
  D2 (per-analyzer categories — gets flipped back to "drop")
        ↓ cites
plans/reports/research-260630-1425-...md § Layer 2 / Layer 3
```

## Related Code Files
- **Modify**: `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` — replace §6.3 / §6.5 text with corrected evidence
- **Modify**: `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` — **annotate** D2's existing "Drop (Migration A)" status with a note explaining why the PR #22 failure was orthogonal to the category decision (do not flip D2; it was already in the target state)
- **Modify**: `meta-state.jsonl` (at the repo root) — patch entry `meta-260630T1238Z-...` with `evidence_code_ref` pointing to `crates/api/src/audit_output.rs` (via `meta_state_patch` MCP tool with mechanism_check=true). **Path note:** the registry lives at `./meta-state.jsonl` (the file at the repo root), not under `tools/learning-loop-mcp/.claude/coordination/`. The MCP tool writes to the right file automatically; the path is documented here for grep-ability.
- **No create / no delete**

## Implementation Steps

### TDD structure for documentation phases
Documentation phases still benefit from "test first": define the corrected text as a checklist of assertions BEFORE writing the prose. If you can't express the claim as an assertion, the prose isn't concrete enough.

#### Step 1.1 — Write the assertion checklist for §6.3 / §6.5 replacement (test-first)
**Before writing any prose**, write the following assertions in a scratch doc. Each will become a paragraph in the corrected section.

```markdown
## §6.3 corrected — codeql-action multi-run SARIF validation
- [ ] A1: codeql-action v4's `areAllRunsUnique` validator REJECTS multi-run SARIF
      where runs collide on `createRunKey`.
- [ ] A2: `createRunKey` is built from `run.tool.driver.{name,fullName,version,semanticVersion,guid}`
      PLUS `run.automationDetails.id`. `category` is NOT a key field.
- [ ] A3: Citation: `github/codeql-action/src/sarif/index.ts` line numbers for
      `createRunKey` and `areAllRunsUnique`.
- [ ] A4: The GitHub 2025-07-21 changelog is the **tightening** that made
      `areAllRunsUnique` strict; before that, multi-run collisions were silently
      collapsed.
- [ ] A5: The error message "The CodeQL Action does not support uploading multiple
      SARIF runs with the same category" mentions category but the validator
      itself does NOT use category — the error wording is misleading.

## §6.5 corrected — fallow's SARIF structure for `fallow audit`
- [ ] B1: `fallow audit` emits a multi-run SARIF file with 2-3 runs depending
      on findings (dead-code always; dupes only if non-empty clone_groups;
      health only if findings cross threshold).
- [ ] B2: All runs share `tool.driver.name = "fallow"` and `tool.driver.version`
      from `env!("CARGO_PKG_VERSION")`. None set `fullName`, `guid`,
      `semanticVersion`, or `automationDetails` (except the dupes run).
- [ ] B3: The dupes run is synthesized locally in
      `crates/api/src/audit_output.rs::build_audit_duplication_sarif_run` with
      `automationDetails.id = "fallow/audit/dupes"`. Dead-code and health runs
      are spread verbatim from upstream builders that don't set `automationDetails`.
- [ ] B4: Live SARIF diff: `tools/learning-loop-mastra/reports/fallow/audit.sarif`
      shows runs[0] (dead-code, automationDetails=null), runs[1] (dupes,
      automationDetails.id="fallow/audit/dupes"), runs[2] (health,
      automationDetails=null). Runs 0 and 2 collide on createRunKey.
- [ ] B5: 2-run case (no dupes findings) shows runs[0] and runs[1] both with
      automationDetails=null — same collision.
```

If any assertion is hard to back with a citation, drop it from the prose.

#### Step 1.2 — Replace §6.3 with corrected text (prose after assertions exist)
For each assertion in A1–A5, write 1–3 sentences that:
1. States the corrected claim.
2. Cites the source (file:line OR local SARIF path).
3. Notes the conflict with the original §6.3 wording.

Replace the entire §6.3 subsection in place. **Do not** leave the old text and append a "correction" footnote — the corrected prose replaces the wrong claim.

#### Step 1.3 — Replace §6.5 with corrected text (same structure as 1.2)
For each assertion in B1–B5, write 1–3 sentences. Cite fallow source files by `crates/api/src/audit_output.rs::build_audit_sarif` and `build_audit_duplication_sarif_run`.

#### Step 1.4 — Document the existing D2 state (no flip needed)
The decision record D2 already says **"Drop (Migration A)"** at line 17, and the D2 section at line 62 documents the rationale. The broken PR #22 was Migration A; the multi-run SARIF rejection is an **orthogonal** bug to the category choice.

**Do not flip D2.** Instead, append a one-line annotation to the D2 section in `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` documenting that:
- D2 (per-analyzer categories dropped) remains correct.
- The PR #22 failure was caused by `areAllRunsUnique` rejecting runs that share `tool.driver.{name,version}` and lack `automationDetails.id` — a separate issue from the category choice.
- The recovery path (Option B: inline jq patch + 1 upload) preserves D2.

Example annotation text:
```markdown
> **2026-06-30 annotation:** D2 remains correct. The PR #22 failure was caused by
> codeql-action v4's `areAllRunsUnique` validator rejecting runs with identical
> `tool.driver` metadata (the dupes run was uniquely identified, but dead-code and
> health runs collided). This is orthogonal to the per-analyzer categories decision.
> The recovery in `plans/260630-0536-...` patches `automationDetails.id` per run
> while keeping the single `category: fallow` (D2 stands).
```

#### Step 1.5 — Update meta-state entry via MCP tool
Use `mcp__learning-loop__mastra_meta_state_patch` to update entry `meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo`:
```js
{
  id: "meta-260630T1238Z-the-fallow-rs-fallow-v2-action-s-internal-codeql-action-uplo",
  entry_kind: "finding",
  patch: {
    description: "<updated description with corrected source citations>",
    evidence_code_ref: "crates/api/src/audit_output.rs:build_audit_sarif",
    evidence_journal: "plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md"
  }
}
```

Set `mechanism_check: true` so SP2 fingerprints the fallow source file (though we don't have it locally — fingerprint will be null until first check, which is acceptable for a remote citation).

#### Step 1.6 — Cross-reference loop verification
After all four edits, verify the citation chain:
- Deep-dive §6.3 → cites source-audit § Layer 1 + codeql-action path
- Deep-dive §6.5 → cites source-audit § Layer 2 + fallow paths
- Decision record D2 → cites source-audit § Comparative Analysis
- Meta-state entry → cites source-audit
- Source-audit → cites each of the above

Use `grep -l "research-260630-1425" plans/reports/*.md` to confirm all four files reference the source audit.

## Success Criteria

- [ ] `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` §6.3 and §6.5 are replaced (not annotated) with prose that satisfies assertions A1–A5 and B1–B5 respectively
- [ ] All 10 assertions (A1–A5, B1–B5) are backed by a citation in the prose
- [ ] `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` D2 status flipped to "drop" with a reversal paragraph citing the original Phase 4 design and the source-audit
- [ ] Meta-state entry `meta-260630T1238Z-...` updated via `meta_state_patch` with `evidence_code_ref` and `evidence_journal` pointing at the source-audit
- [ ] Cross-reference loop verified: `grep -l "research-260630-1425" plans/reports/*.md` returns at least 3 files (deep-dive, decision record, source-audit itself)
- [ ] No other sections of the deep-dive report are touched (§6.1, §6.2, §6.4, §6.6, §7, etc. unchanged)
- [ ] `git diff plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` shows changes only in §6.3 / §6.5

## Risk Assessment

- **Risk:** Over-correcting — accidentally rewriting §6.1 / §6.2 / §6.4 / §6.6 which are still valid. **Mitigation:** explicit `git diff` check; the assertion checklist only targets §6.3 / §6.5.
- **Risk:** Citation drift — referencing codeql-action or fallow files at wrong line numbers. **Mitigation:** each citation verified by re-reading the cited file (the source-audit report already pinned the line numbers; reuse those).
- **Risk:** Meta-state patch failing on immutable fields. **Mitigation:** `meta_state_patch` denies identity fields (id, created_at, version, code_fingerprint) but allows description, evidence_code_ref, evidence_journal. If the patch errors, fall back to `meta_state_report` with a new entry id and link the old one via `reopens`.
- **Risk:** Decision record edit conflicting with prior plan's ship journal. **Mitigation:** the decision record is a separate file from the journal; edit the decision record only.