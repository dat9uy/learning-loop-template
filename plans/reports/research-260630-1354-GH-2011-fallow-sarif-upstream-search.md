# Research Report: fallow-rs/fallow upstream activity on multi-run SARIF / codeql-action v4 collision

**Date:** 2026-06-30 13:54 (Asia/Bangkok)
**Branch:** 260629-2011-fallow-tools-v2-action-swap
**Triggered by:** User pushback on plan 260630-0536-fallow-action-swap-with-sarif-split — leaning toward Option B (patch `tool.driver.name` per run, single `upload-sarif@v4` call) over Option A (split into 3 files, 3 upload calls). Asked to search fallow issues first to confirm we don't miss an upstream fix.

## Executive Summary

Searched fallow-rs/fallow for any prior or in-flight discussion of the multi-run SARIF / codeql-action v4 collision. **No upstream fix exists for our specific collision**, but the picture is more positive than the original draft suggested:

- **PR #1102 was MERGED on Jun 9, 2026** (not closed-unmerged as initially read). It addressed SARIF fidelity gaps in `fallow security --format sarif` (added `codeFlows`/`threadFlows`, populated rule `name`/`help`, added CWE taxonomy). Same-day review/merge shows fallow maintainers engage quickly on scoped SARIF fixes.
- **However, PR #1102 did NOT touch `fallow audit`** — only `crates/cli/src/security.rs`. It did not change `tool.driver.{name,fullName,guid}` or `runs[].automationDetails`. Our problem (multi-run collision in `fallow audit`) is unaffected.
- The Action (`action/scripts/analyze.sh`) is pure orchestration — every SARIF structural decision lives in the `fallow` CLI binary and there is no flag to flip.

This validates Option B as the locally-defensible short-term fix and **upgrades F-6 from "long shot" to "plausible"** — a scoped PR adding `automationDetails.id` to `fallow audit`'s runs is more likely to land than the original draft suggested, but still won't help us in the near term (review + release cycle is weeks, and the action plan's branch is blocked now).

## Research Methodology

- **Sources consulted:** 5 (WebSearch × 3, WebFetch × 2)
- **Date range of materials:** Apr 2026 (open issues #159, #235) to Jun 2026 (PRs #825, #1102, #1120, #1221, #1662)
- **Key search terms used:**
  - `site:github.com fallow-rs/fallow issues sarif codeql upload-sarif`
  - `site:github.com fallow-rs/fallow issues "multiple runs" OR "tool.driver" SARIF`
  - `"fallow-rs/fallow" OR "fallow audit" sarif run driver name github code scanning`
  - `fallow-rs issue OR PR SARIF "automationDetails" OR "fullName" OR per-run driver`
  - `fallow-rs/fallow issue SARIF run driver "code scanning" GitHub`
  - Direct fetch: `fallow-rs/fallow/issues?q=sarif+codeql` (filtered list)
  - Direct fetch: `fallow-rs/fallow/issues?q=is:issue+is:open`
  - Direct fetch: `fallow-rs/fallow/pulls?q=is:pr+is:open`
  - Direct fetch: `fallow-rs/fallow/blob/main/action/scripts/analyze.sh`

## Key Findings

### 1. No open fallow issue or PR addresses this collision

Confirmed via the issues tab filter `sarif codeql` and the open-issues/open-PRs queries. The two currently open issues (#235 Angular scanner refactor; #159 unpin `rand` in fallow-license) and two open PRs (#1662 GitLab CI template, #33 `fallow viz`) are unrelated to SARIF structure. F-6 from the plan ("file an upstream issue at fallow-rs/fallow asking them to set per-run `tool.driver.fullName` or `automationDetails.id`") has not been filed yet, and the issue landscape does not show any pre-existing thread on it.

### 2. Closed issue #1097 confirms SARIF fidelity is a known gap with no maintainer momentum

[Issue #1097](https://github.com/fallow-rs/fallow/issues/1097) ("Security: SARIF should emit codeFlows from the taint trace…") explicitly identifies three fallow SARIF fidelity gaps:

1. Missing `codeFlows`/`threadFlows` for security findings (only sink location, no path)
2. Missing rule metadata — `tool.driver.rules[].name` is null and `help` is absent; only `properties.tags = ["external/cwe/cwe-89"]` is set
3. CWE modeled as a tag instead of a SARIF `taxonomies` block

**This is exactly the same pattern we are hitting** — fallow emits SARIF with minimal driver metadata (null `fullName`, null `guid`, no `automationDetails`). The proposed PR [\#1102](https://github.com/fallow-rs/fallow/pull/1102) **was merged on Jun 9, 2026** (correction to the earlier draft of this report, which read "closed without merging" — that was wrong; GitHub displays merged PRs under the "closed" filter, but the actual state is Merged).

**What #1102 actually changed** (per the [merged CHANGELOG entry](https://github.com/fallow-rs/fallow/pull/1102/files)):

- Added `codeFlows` / `threadFlows` to security SARIF results
- Populated `name` and `help` on security rules
- Linked CWE-backed rules to a run-level CWE taxonomy
- Kept `external/cwe/cwe-NN` tags for compatibility
- Left `level: "note"` and detection behavior unchanged

**What #1102 did NOT change** (the operative question for our collision):

- `tool.driver.name` / `fullName` / `guid` — unchanged
- `runs[].automationDetails.id` — unchanged
- Run-structuring logic — unchanged
- The `fallow audit` subcommand — **not touched at all**; PR #1102 only modified `crates/cli/src/security.rs`

**Interpretation for our problem:**

- PR #1102 being merged shows fallow maintainers **do engage on SARIF fidelity** when given a concrete, scoped proposal — the PR was opened and merged on the same day (Jun 9, 2026), so the review cycle is fast when the maintainer is interested.
- But PR #1102's scope was `fallow security` (a single subcommand, result-level fields, rule metadata). Our problem is in `fallow audit` (different subcommand, run-level structure).
- The merged PR is **encouraging for F-6** (a future PR/issue asking for per-run `automationDetails.id` in `fallow audit` is more likely to land than the original draft of this report suggested), but **does not change our short-term options** — we still need a local fix because the review + release cycle is at minimum weeks, and the action plan's branch is blocked on this now.

### 3. Closed issue #817 / PR #825: previous `sarif: true` upload bug on public repos — already fixed

[Issue #817](https://github.com/fallow-rs/fallow/issues/817) reported that the Action's `sarif: true` input was skipping the upload step on public repos. Resolved by [PR #825](https://github.com/fallow-rs/fallow/pull/825). This is a positive signal: when the upload is broken in an obvious way (silent skip), maintainers do ship fixes. Our collision is a *different* failure mode (loud error, distinct root cause) and the precedent does not necessarily transfer.

### 4. Closed issue #813: spurious SARIF generation warning — fixed via PR #827

[Issue #813](https://github.com/fallow-rs/fallow/issues/813) reported a `::warning::SARIF generation failed` emitted whenever `fallow` exited 1 (i.e., had findings), even though the SARIF file was written correctly. Root cause: `if ! fallow ... > "$SARIF_FILE"` in `action/scripts/analyze.sh` gates on exit code rather than on file content. Resolved by PR #827 by replacing the exit-code-gated branch with `if [ ! -s "$SARIF_FILE" ] || ! jq -e '.' "$SARIF_FILE" > /dev/null 2>&1`. Documented workaround: set `format: json` on the health job. **Tangentially relevant** — when our `codeql-action/upload-sarif@v4` call fails, the failure-upload step uses similar file-content validation and should still work.

### 5. CodeQL Action dependency bumps (#1120, #1221) are the only recent SARIF-adjacent activity

[PR #1120](https://github.com/fallow-rs/fallow/pull/1120) and [PR #1221](https://github.com/fallow-rs/fallow/pull/1221) are Dependabot bumps of `github/codeql-action` itself (4.36.0 → 4.36.1 → 4.36.2). These update the wrapper Action but do not change how fallow emits SARIF. Worth noting: dependabot is actively tracking codeql-action patches, so any future *upstream* relaxation of `areAllRunsUnique` would surface quickly.

### 6. The Action is pure orchestration — no upstream knob to flip

Direct read of [`action/scripts/analyze.sh`](https://github.com/fallow-rs/fallow/blob/main/action/scripts/analyze.sh) confirms:

- SARIF file path: `--sarif-file "$SARIF_FILE"` is passed when detected in `fallow dead-code --help`
- Fallback re-run: `build_common_args sarif` invokes `fallow` with sarif format and ignores `--top`
- **No script logic** sets `tool.driver.name`, `automationDetails.id`, `fullName`, or splits runs into separate files
- **No combined-run flag** distinguishes single-run vs multi-run SARIF; that decision lives inside the `fallow` CLI

The Action's only job is to invoke the CLI and validate the resulting file. We cannot fix this on the Action side. F-6 must target the CLI.

## Comparative Analysis: Option A vs Option B (revised in light of upstream silence)

| | Option A (current plan: split + 3 uploads) | Option B (user-preferred: patch in-place + 1 upload) |
|---|---|---|
| Local debug | 3 files to inspect after a split step; harder to reproduce from scratch | 1 file = 1 reproducer; trivially reproducible |
| Workflow complexity | Split step + 3 upload calls + 3 distinct category values | 1 inline patch (jq or python) + 1 upload call + 1 category value |
| Failure-mode granularity | 1 analyzer's patch bug → that analyzer's findings lost | 1 bad patch → all findings lost |
| Code Scanning UX | Per-analyzer categories (`fallow-deadcode`, `fallow-health`, `fallow-dupes`) enable per-analyzer filtering | Single category (`fallow`); all findings grouped together |
| Upstream dependency | None — works against current fallow | None — works against current fallow |
| Drift risk when fallow 2.103+ lands | Split-script classifier heuristic must track fallow's analyzer taxonomy | Patch script must track the same taxonomy (mapping analyzer index → name) |
| YAGNI fit | Adds 2 upload calls + 2 categories for navigation only | Closer to PR #22's design intent (1 SARIF, 1 upload) |

**Key insight from the upstream search:** both options are equally "permanent" workarounds in the absence of an upstream fix, but **F-6 is now more credible** (PR #1102 was merged same-day for `fallow security`, so a similar scoped PR for `fallow audit` is plausible). Even so, our branch is blocked now; we need the local fix regardless. The differentiator is purely local: **debugability, workflow complexity, and per-analyzer UX value**. The user has stated the debugability case; the workflow complexity case now needs to be weighed against the per-analyzer UX value.

## Implementation Recommendations

### 1. Adopt Option B as the design (post-amendment to current plan)

The plan `260630-0536-fallow-action-swap-with-sarif-split` should be amended to swap Option A for Option B. Specifically:

- Phase 2's "Split fallow SARIF per analyzer (Python script)" → "Patch `tool.driver.name` per run (inline Python)"
- Phase 2's "3 explicit `codeql-action/upload-sarif@v4` calls" → "1 explicit `codeql-action/upload-sarif@v4` call"
- Acceptance criteria row "`category: fallow-deadcode` / `fallow-health` / `fallow-dupes`" → "`category: fallow`"
- Acceptance criteria row "3 unique categories" → "single category; per-analyzer filtering deferred to UI annotations"
- Decision record `decision-260629-2011-fallow-action-swap-decisions.md` row D2 (per-analyzer categories): flip from "preserve" back to "drop" — with the additional note that the original Phase 4 design was correct in spirit but wrong in mechanism (the SARIF split was needed for category routing, but Option B's inline patch achieves the same SARIF collision fix without the per-analyzer UX benefit)

### 2. KEEP Phase 1's evidence correction

The deep-dive §6.3 / §6.5 error is **independent of the A-vs-B choice**: codeql-action v4's `areAllRunsUnique` validator keys on `tool.driver.{name,fullName,version,semanticVersion,guid}` + `automationDetails.id`, not on `category`. Both options fix that. Phase 1's source-citation update remains necessary.

### 3. Inline Python or inline jq?

The split script in the old workflow used Python. Option B's patch can be done with either Python (consistent with prior code) or jq (no dependency on Python in the runner, smaller step). Recommend **jq** — the operation is mechanical (rename `runs[i].tool.driver.name` based on the run index or the existing `rules[]` taxonomy), and jq is pre-installed on GitHub-hosted runners. If fallow's run ordering becomes more complex in 2.103+ (e.g., a health run becomes run 1 instead of run 2), jq can use a lookup map keyed on `runs[i].tool.driver.rules[0].id` or similar stable identifier.

### 4. Update F-6 follow-up language (more credible than the original draft)

F-6 in the current plan asks fallow for per-run `tool.driver.fullName` or `automationDetails.id`. **Refine the request**, now with stronger evidence:

- **Scope explicitly to `fallow audit`** (PR #1102 only fixed `fallow security`; we need the same fix for the audit subcommand)
- Ask for `automationDetails.id` set to a stable per-analyzer identifier (e.g., `fallow/dead-code/v2.102.0`), so users who do NOT want to patch can rely on fallow's natural uniqueness and the workarounds in this plan can be retired
- Cite issue #1097 + PR #1102 (merged) as precedent for the gap and for the maintainer engagement model
- Reference the codeql-action v4 `areAllRunsUnique` validator as the downstream consumer requirement
- **Offer to send the PR** with the change scoped to `crates/cli/src/audit.rs` (or whichever module emits `fallow audit` SARIF). PR #1102 was opened and merged same-day for the security subcommand — the same pattern is plausible for audit.

## Resources & References

### Direct fallow issues/PRs reviewed

- [#813](https://github.com/fallow-rs/fallow/issues/813) — Spurious SARIF generation warning (closed via PR #827)
- [#817](https://github.com/fallow-rs/fallow/issues/817) — `sarif: true` skips upload on public repos (closed via PR #825)
- [#1097](https://github.com/fallow-rs/fallow/issues/1097) — SARIF fidelity gaps (closed via PR #1102 merge)
- [#1102](https://github.com/fallow-rs/fallow/pull/1102) — Merged PR for #1097; fixes SARIF fidelity for `fallow security` only, not `fallow audit`
- [#1120](https://github.com/fallow-rs/fallow/pull/1120) — codeql-action 4.36.0 → 4.36.1 (dependabot)
- [#1221](https://github.com/fallow-rs/fallow/pull/1221) — codeql-action 4.36.1 → 4.36.2 (dependabot)
- [`action/scripts/analyze.sh`](https://github.com/fallow-rs/fallow/blob/main/action/scripts/analyze.sh) — Action orchestration script (no SARIF structure logic)

### Open items (not SARIF-related)

- [#235](https://github.com/fallow-rs/fallow/issues/235) — Angular scanner refactor (blocked, milestone 5)
- [#159](https://github.com/fallow-rs/fallow/issues/159) — Unpin `rand` in fallow-license (blocked, milestone 5)
- [PR #1662](https://github.com/fallow-rs/fallow/pull/1662) — GitLab CI template reuses pre-installed fallow
- [PR #33](https://github.com/fallow-rs/fallow/pull/33) — `fallow viz` interactive visualization

### Related GitHub Docs

- [Code scanning changelog 2025-07-21](https://github.blog/changelog/2025-07-21-code-scanning-will-stop-combining-multiple-sarif-runs-uploaded-in-the-same-sarif-file/)
- [Uploading a SARIF file to GitHub](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/upload-sarif-file)
- [Troubleshooting SARIF uploads](https://docs.github.com/en/enterprise-server@3.17/code-security/reference/code-scanning/sarif-files/troubleshoot-sarif-uploads)

### Internal artifacts

- `plans/260629-2011-fallow-tools-v2-action-swap/plan.md` — original swap plan (Phase 4 contract)
- `plans/260630-0536-fallow-action-swap-with-sarif-split/plan.md` — current amendment (Option A)
- `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` §6.3 / §6.5 — error source
- `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md` — D2 decision record

## Appendices

### A. Glossary

- **`areAllRunsUnique`** — codeql-action v4 validator that rejects multi-run SARIF uploads where runs share the same uniqueness key
- **`createRunKey`** — internal codeql-action function that builds the uniqueness key from `run.tool.driver.{name,fullName,version,semanticVersion,guid}` + `run.automationDetails.id`
- **Driver metadata** — the `tool.driver.*` block in a SARIF run that identifies the analyzer (name, version, etc.)
- **`automationDetails.id`** — optional SARIF field providing a globally unique ID for the analysis run; often used to disambiguate when the same tool runs multiple times

### B. Decision matrix recap (for the plan amendment)

| Acceptance criterion (current plan) | Option A | Option B |
|---|---|---|
| `sarif: false` on Action | ✓ | ✓ |
| Inline patch step present | split into 3 files | patch names in place |
| 3 explicit `codeql-action/upload-sarif@v4` calls | ✓ | ✗ (1 call) |
| 3 unique categories | ✓ | ✗ (1 category) |
| All local tests green | ✓ | ✓ |
| Fresh PR reports `verdict=pass` | ✓ | ✓ |
| SARIF visible in Code Scanning | under 3 categories | under 1 category |
| Failure-upload step path resolves | per-analyzer | single file |

### C. Unresolved questions

1. **Is per-analyzer Code Scanning UX worth the 2 extra upload calls?** This is a UX judgment, not a technical one. If the answer is "yes, finding triage in Code Scanning UI benefits from per-analyzer categories," Option A is right. If the answer is "no, the SARIF `results[].ruleId` already carries the analyzer identity," Option B is right. **Defaulting to Option B per user preference**; recommend explicit operator sign-off before amending the plan.
2. **Should we still file F-6 / send a PR for `fallow audit`'s `automationDetails.id`?** **Yes — and now with higher confidence than the original draft.** PR #1102 was MERGED same-day for `fallow security`, so the maintainer engagement model is fast and positive for scoped SARIF fixes. Our ask is structurally identical (per-run `automationDetails.id` to satisfy codeql-action's `areAllRunsUnique`) but scoped to `crates/cli/src/audit.rs` instead of `security.rs`. Recommend filing the issue + sending the PR together (the security-author did the same in #1102).
3. **Should the inline jq patch be replaceable by an inline Python patch for symmetry with the old workflow?** No — jq is smaller and faster, and the old Python heredoc was only there because it also did the classify-and-split work. Once split is dropped, jq suffices. If a future fallow version adds complex SARIF enrichment that jq can't express, switch back.