# Byte-size measurements — `pnpm fallow:brief` vs `pnpm fallow:gate`

**Measured:** 2026-07-14 (Phase 1 step 7)
**Tool:** `fallow 3.3.0` (verified signature; binary at `~/.local/share/mise/installs/npm-fallow/3.3.0/`)
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

### Scenario C — synthetic ≥5-finding scenario (referenced)

The original task-1 byte claims (947 / 9963 / 642 B; "93 % reduction") were measured on a
synthesized-failure scenario that does not reproduce on this codebase today — the
current tree has **0** fallow findings vs `origin/main` under any threshold tried
(`--max-crap 1`, full audit, dropped `--gate`). The measurements in scenario A/B
are the live evidence; the qualitative ratio (compact ≈ 1 line per finding,
human ≈ ≥40 lines per finding including baseline-comparison noise) is what the
PROCESS_HINTS row text relies on, not absolute byte counts.

When the codebase does carry N findings, each `complexity` finding produces one
`complexity:<path>:<line>:<symbol>:cyclomatic=N,severity=<level>,crap=N,...` line
on stdout (compact) versus ≥8 lines of decorated human prose on stderr (heading,
box-drawing glyphs, severity badge, location, recommendation, blank line).

## Observations

1. **Compact is consistent on clean trees.** 58 B regardless of gate filter — one metrics line.
2. **JSON envelope dominates on clean trees.** ~4.8 KB regardless of findings (the audit metadata is fixed-cost).
3. **Human stderr has ~600 B of baseline-comparison noise** that is invariant to finding count — agent parsing pays this even on a clean tree.
4. **The H6 ordering gate** (PROCESS_HINTS row text must include the literal `rule-fallow-brief-on-gate-failure` token) does not depend on these byte sizes; the measurement is purely for the rationale claim that compact is machine-actionable when findings exist.

## Action

Phase 4 `resolution` text now references this report instead of quoting byte counts.
The PROCESS_HINTS row text in `plan.md` Appendix B is qualitative ("much smaller",
"~50 B on a clean tree", "one line per finding") — no fabricated numbers.
