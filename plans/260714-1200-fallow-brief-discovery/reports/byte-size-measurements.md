# Byte-size measurements — `pnpm fallow:brief` vs `pnpm fallow:gate`

**Measured:** 2026-07-14 (Phase 1 step 7); Scenario C re-measured 2026-08-01
**Tool:** `fallow 3.3.0` for Scenarios A/B; `fallow 3.10.0` for Scenario C
**Root:** `tools/learning-loop-mastra`
**Method:** stdout/stderr stream separation. Fallow writes human-readable output to **stderr** and machine formats (JSON, compact) to **stdout**.

## Measurements

All sizes are `wc -c` byte counts on the corresponding stream.

### Scenario A — current tree (`--gate new-only --changed-since origin/main`)

Matches the `fallow:gate` package.json script. Findings on this branch: **0** (clean tree vs `779305b..HEAD`).

| Stream | Bytes | Notes |
|--------|-------|-------|
| Human stderr (`fallow:gate`) | 1353 | Includes baseline-comparison warnings (~600 B), audit-scope note, `✓ No issues` line |
| JSON stdout (`--format json`) | 4863 | Empty findings array + audit metadata; verbose envelope |
| Compact stdout (`--brief --format compact`) | 58 | Single line: `■ Metrics: dead code 0 · complexity 0 · duplication 0` |

### Scenario B — full audit (no gate filter, no `--changed-since`)

Same scope (7 changed files are still the only ones vs origin/main), but baseline-comparison noise differs slightly.

| Stream | Bytes |
|--------|-------|
| Human stderr | 1384 |
| JSON stdout | 4945 |
| Compact stdout | 58 |

### Scenario C — synthesized ≥5-finding scenario (measured 2026-08-01, fallow 3.10.0)

The original task-1 byte claims (947 / 9963 / 642 B; "93 % reduction") were measured on a
synthesized-failure scenario that did not reproduce on fallow 3.3.0. It was reproduced on
2026-08-01 with fallow **3.10.0** (both pnpm-installed and mise-installed binaries) by adding
a temporary fixture `tmp-byte-measure-fixture.js` (6 deliberately high-complexity near-identical
functions) under `tools/learning-loop-mastra`, then removing it after measurement.

Fixture produced **13 findings** vs `origin/main`: 6 `high-complexity` (severity=critical,
cyclomatic=14, crap=210 each), 6 `code-duplication` (1 clone group, 6 instances), 1 `unused-file`.

| Stream | `fallow:gate` (human) | `--format json` | `fallow:brief` (compact) |
|--------|----------------------|-----------------|--------------------------|
| stdout | 1861 B (decorated panel: unused-code section, clone group, metrics line) | 18278 B (findings + audit metadata) | 1568 B (14 lines: one per finding + vital-signs) |
| stderr | 3100 B (baseline warnings, section progress summaries) | 1347 B | 2114 B (baseline warnings + review-brief drill-down) |
| **total** | **4961 B** | **19625 B** | **3682 B** |

Notes:

- On the machine-actionable stdout channel, compact is **1568 B vs 18278 B JSON (~91% reduction)**
  and is one line per finding — close to the original qualitative claim, now with live evidence.
- Gate human output splits across both streams on 3.10.0 (panel on stdout, progress on stderr);
  the 3.3.0-era "human goes entirely to stderr" observation no longer holds exactly.
- The baseline-mismatch warnings (~600 B) still appear on stderr in every mode, invariant to
  finding count.
- Exit codes: `fallow:gate` exits **1** with findings (gate trips), `fallow:brief` exits **0**
  (report-only) — brief is the drill-down companion, not a gate replacement.

## Observations

1. **Compact is consistent on clean trees.** 58 B regardless of gate filter — one metrics line.
2. **JSON envelope dominates on clean trees.** ~4.8 KB regardless of findings (the audit metadata is fixed-cost).
3. **Human stderr has ~600 B of baseline-comparison noise** that is invariant to finding count — agent parsing pays this even on a clean tree.
4. **The H6 ordering gate** (PROCESS_HINTS row text must include the literal `rule-fallow-brief-on-gate-failure` token) does not depend on these byte sizes; the measurement is purely for the rationale claim that compact is machine-actionable when findings exist.

## Action

Phase 4 `resolution` text now references this report instead of quoting byte counts.
The PROCESS_HINTS row text in `plan.md` Appendix B is qualitative ("much smaller",
"~50 B on a clean tree", "one line per finding") — no fabricated numbers.
