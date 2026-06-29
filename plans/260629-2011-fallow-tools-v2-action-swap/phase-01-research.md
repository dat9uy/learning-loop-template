---
phase: 1
title: "Research"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Research

## Overview
Consolidate the two researcher reports into a single decision-ready brief and surface the 4 unresolved operator decisions from the fallow-tools Action deep-dive.

## Requirements

- **Functional:**
  - Read both researcher reports end-to-end
  - Cross-reference every flag/input/output between the two
  - Produce a decision record with operator-confirmable choices
- **Non-functional:**
  - All findings cite source (file:line or URL:line)
  - All migration cost claims traceable to a LoC count

## Related Code Files

- Create: `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md`
- Read: `plans/reports/researcher-260629-2021-current-fallow-ci-audit-report.md`
- Read: `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md`

## Implementation Steps

1. **Read researcher #1 (CI audit)** — 411 lines, 14 deliverables. Confirm:
   - 8 flags on `fallow audit` are accounted for (`--root`, `--gate`, `--changed-since`, `--format sarif`, `--output-file`, 3× `--*-baseline`)
   - Python heredoc `classify()` taxonomy (lines 146-156) and the SARIF run→category mapping
   - 3 SARIF upload steps with `hashFiles()` guards
   - Failure preservation step (lines 226-237)
   - 5 unresolved questions from §14 of the audit report

2. **Read researcher #2 (Action deep-dive)** — 14 deliverables sourced from `fallow-rs/fallow` repo at `https://github.com/fallow-rs/fallow/blob/main/{action.yml,action/scripts/install.sh,action/scripts/analyze.sh,action/scripts/review.sh,action/scripts/comment.sh,action/scripts/annotate.sh,action/scripts/check-code-scanning.sh,npm/fallow/scripts/verify-binary.js,npm/fallow/scripts/lazy-verify.js,npm/fallow/scripts/run-binary.js}`. Confirm:
   - Bundled CLI is 2.103.0 (release notes 2026-06-28) vs our local 2.102.0
   - `audit.gate` from `.fallowrc.json` is NOT honored unless explicitly set on Action input
   - Single `category: fallow` for SARIF (vs our current 3 categories)
   - `version:` input pins CLI; pinning to commit SHA pins Action code
   - Ed25519 + SHA-256 cryptographic verification of binary
   - Sentinel location resolution order: platformPkgDir → FALLOW_VERIFY_CACHE_DIR → $XDG_CACHE_HOME/%LOCALAPPDATA%

3. **Cross-reference matrix** — produce a table mapping each current behavior to its Action equivalent:
   | Current (hand-rolled) | Action equivalent | Behavioral diff |
   |---|---|---|
   | `pnpm exec fallow audit --gate new-only` | `command: audit` + `gate: new-only` | Same (explicit gate overrides .fallowrc.json) |
   | `--changed-since "${{ github.event.pull_request.base.sha }}"` | `auto-changed-since: true` (default) | Same |
   | `--format sarif --output-file audit.sarif` | `format: sarif` + `sarif: true` | Action uploads automatically |
   | `--{dead-code,health,dupes}-baseline <path>` | `dead-code-baseline`, `health-baseline`, `dupes-baseline` inputs | Same paths preserved |
   | Python heredoc `classify()` + 3 split SARIF writes | Action handles SARIF generation | Loses per-analyzer categories; gains SARIF upload |
   | 3× `github/codeql-action/upload-sarif@v4` | Action's built-in `codeql-action/upload-sarif@v4` (single) | Loses per-analyzer `category:` |
   | `actions/upload-artifact@v7` for SARIF on failure | Reuse `${{ steps.fallow.outputs.sarif }}` in the same step | Preserved |

4. **Migration cost summary** — confirm:
   - **Migration A** (drop Python, single category): -125 LoC net delta
   - **Migration B** (keep Python, preserve categories): -13 LoC net delta
   - **Recommended**: Migration A (per the user's "reduce technical debt" framing in the predict session; the Python heredoc IS the technical debt)

5. **Surface operator decisions** — record the 4 unresolved questions from deep-dive §14 in the decision record:
   - D1: Pin strategy (commit-SHA + version: "2.102.0")
   - D2: Per-analyzer Code Scanning categories (drop per Migration A)
   - D3: Baseline path style (keep at `plans/.../reports/fallow/*.json` with `..` traversal)
   - D4: `sarif: true` on Action vs explicit upload step (use Action's built-in)

## Success Criteria

- [ ] Both researcher reports read in full (no truncation)
- [ ] Cross-reference matrix recorded in decision record
- [ ] 4 operator decisions listed with recommended defaults
- [ ] Decision record file exists at `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md`

## Risk Assessment

- **Risk:** Researcher reports contain marketing-vs-source discrepancies (researcher #2 flagged 4 in §14). **Mitigation:** Use researcher's source citations; verify each claim against `action.yml` before Phase 4 implementation.
- **Risk:** Cross-reference matrix may have gaps if researchers skipped a flag. **Mitigation:** Diff each `--*` flag from CI audit against each `INPUT_*` env var from analyze.sh to ensure 100% coverage.

## TDD Note

This phase is research-only (no code). The "test" is the decision record itself — it must contain a complete cross-reference matrix that future implementers can use to derive the Phase 4 YAML mechanically.