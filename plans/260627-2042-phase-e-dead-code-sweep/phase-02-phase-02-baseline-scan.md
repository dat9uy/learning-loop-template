---
phase: 2
title: "phase-02-baseline-scan"
status: pending
priority: P2
dependencies: ["phase-01-phase-01-foundation"]
effort: "0.5 day"
---

# Phase 2: Baseline Scan

## Overview
Run four fallow analyses (unused-files, unused-exports, unused-deps, regression-baseline) with all output routed to files in `reports/fallow/`. Cross-reference fallow findings against the static-source audit from `researcher-260627-codebase-audit`. Seed `tasks.md` with the reconciled triage table — one row per finding, one row per disputed entry, one row for the manifest-convention comment.

## Requirements
- **Functional:** four fallow report files exist under `reports/fallow/`; `tasks.md` has a row for every fallow finding (with classification, action, doc-updates-needed columns); disputed findings are explicitly tagged.
- **Non-functional:** no fallow output reaches the parent agent's context directly — only `tasks.md` is read. SARIF twins are produced for CI consumers.

## Architecture

Output discipline:

```
reports/fallow/
├── unused-files.txt            (Phase 2.A1, --format compact)
├── unused-exports.txt          (Phase 2.A2, --format compact)
├── unused-deps.txt             (Phase 2.A3, --format compact)
├── dead-code-baseline.json     (Phase 2.A4, --format json, --save-baseline .fallow/baselines/dead-code-baseline.json)
├── dead-code-baseline.md       (Phase 2.A4, --format markdown twin)
├── dead-code-baseline.sarif    (Phase 2.A4, --format sarif twin)
└── regression-baseline.json    (Phase 2.A5, --save-regression-baseline .fallow/baselines/regression-baseline.json)
```

`tasks.md` is the human-readable triage ledger. Updated by the agent based on the report files; never re-read from a fallow output directly.

## Related Code Files
- Create: `plans/260627-2042-phase-e-dead-code-sweep/tasks.md`
- Create: `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/unused-files.txt`
- Create: `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/unused-exports.txt`
- Create: `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/unused-deps.txt`
- Create: `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.json`
- Create: `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.md`
- Create: `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dead-code-baseline.sarif`
- Create: `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/regression-baseline.json`
- Create: `tools/learning-loop-mastra/.fallow/baselines/regression-baseline.json` (mirror; will be committed in Phase 4)

## Implementation Steps

### Step 1 — Create the output directories
```bash
cd tools/learning-loop-mastra
mkdir -p ../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow
mkdir -p .fallow/baselines
```

### Step 2 — Run the four analyses with `-o`

All commands run from `tools/learning-loop-mastra/`:

```bash
ROOT=.
OUT=../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow

# A1. Unused files
fallow dead-code \
  --root "$ROOT" \
  --unused-files \
  --format compact \
  -o "$OUT/unused-files.txt" \
  --quiet

# A2. Unused exports
fallow dead-code \
  --root "$ROOT" \
  --unused-exports \
  --format compact \
  -o "$OUT/unused-exports.txt" \
  --quiet

# A3. Unused deps
fallow dead-code \
  --root "$ROOT" \
  --unused-deps \
  --format compact \
  -o "$OUT/unused-deps.txt" \
  --quiet

# A4. Full dead-code baseline (json + md + sarif twins)
fallow dead-code \
  --root "$ROOT" \
  --format json \
  -o "$OUT/dead-code-baseline.json" \
  --save-baseline .fallow/baselines/dead-code-baseline.json \
  --quiet

fallow dead-code \
  --root "$ROOT" \
  --format markdown \
  -o "$OUT/dead-code-baseline.md" \
  --quiet

fallow dead-code \
  --root "$ROOT" \
  --format sarif \
  --sarif-file "$OUT/dead-code-baseline.sarif" \
  --quiet

# A5. Regression-count baseline (committed in Phase 4)
fallow dead-code \
  --root "$ROOT" \
  --save-regression-baseline "$OUT/regression-baseline.json" \
  --quiet
```

Progress stays on stderr; primary output goes to files. Inspect the confirmation lines on stderr (`Report written to …`) — these are the only success signals when `--quiet` is on.

### Step 3 — Read reports via file tools, not context

For each output file, read with the Read tool and triage findings one file at a time. **Do not** `cat` them inline.

```bash
# Recommended inspection pattern:
wc -l ../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/*.txt
```

This gives line counts without dumping content. Read each file individually only when extracting specific findings into `tasks.md`.

### Step 4 — Seed `tasks.md` with the reconciled triage table

Compare every fallow finding against `reports/researcher-260627-codebase-audit.md` §4 (the static classification). Three categories:

1. **Agreed** — fallow and the static auditor both say the file is dead. Action: delete (or archive if operator decides).
2. **Fallow-only** — fallow flags but the static auditor shows a live consumer (likely a subpath-import or dynamic-import fallow missed). Action: `[DISPUTED]` tag; do NOT delete until resolved.
3. **Static-only** — static auditor shows dead but fallow didn't flag (likely a re-export through `index.js`). Action: add to `tasks.md` with a note.

Initial `tasks.md` rows (from the static audit; final list reconciles after fallow output):

```markdown
# Dead-Code Triage Tasks

**Status legend:** ☐ pending · ☑ resolved · ⚠ disputed · ❌ archived

| # | File / Export | Class | Fallow agrees? | Action | Doc updates | Status |
|---|---|---|---|---|---|---|
| 1 | `core/list-probes.js` | TEST-ONLY | (pending A2) | Delete | placement.yaml:96-98; docs/placement.md "helper" row | ☐ |
| 2 | `__tests__/legacy-mcp/list-probes.test.js` | TEST-ONLY | (auto, test) | Delete with #1 | none | ☐ |
| 3 | `core/lib/source-ref-validator.js` | TEST-ONLY | (pending A1) | Delete | none (not in manifest) | ☐ |
| 4 | `core/lib/source-ref-validator.test.js` | TEST-ONLY | (auto, test) | Delete with #3 | none | ☐ |
| 5 | `core/surfaces.js` SURFACES export | LIVE (verify) | (pending A2) | Verify transitive use via `readRegistry()` in `core/meta-state.js` | none if verified | ☐ |
| 6 | `core/read-registry-cache.js` exports | LIVE (verify) | (pending A2) | Verify transitive use via `readRegistry()` in `core/meta-state.js` | none if verified | ☐ |
| 7 | `tools/manifest.json` | LIVE | (n/a) | Add 1-line convention comment | n/a | ☐ (Phase 1) |

**Notes:**
- Row 5 and 6 are LIVE-with-verification because the static auditor flagged them as transitive-only; fallow's `unused-exports` may or may not catch them. Resolution: grep `core/meta-state.js` for `readRegistry` calls and confirm the transitive chain.
- Rows 1-4 deletion count: 2 source files + 2 test files = 4 file deletions.
- `__tests__/legacy-mcp/` is excluded from fallow's analysis (`ignorePatterns`), so fallow won't flag test files. Static audit catches them.
```

### Step 5 — Save the regression-baseline mirror

```bash
cp ../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/regression-baseline.json \
   .fallow/baselines/regression-baseline.json
```

This file is committed in Phase 4. It gives CI a numerical floor: `--tolerance 0` means "any new dead code is a regression."

## Success Criteria
- [ ] 4 fallow reports exist under `reports/fallow/` (unused-files, unused-exports, unused-deps, full dead-code baseline)
- [ ] SARIF + markdown + JSON twins of the dead-code baseline exist
- [ ] `regression-baseline.json` exists at both `reports/fallow/` (ephemeral) and `tools/learning-loop-mastra/.fallow/baselines/` (to be committed in Phase 4)
- [ ] `tasks.md` exists with a triage row for every fallow finding AND every static-audit finding (the union)
- [ ] Disputed rows (`[DISPUTED]` tag) are listed; the count is ≤ 2 (only #mastra subpath resolution candidates)
- [ ] No fallow report content was piped into the parent agent's context — only file paths + line counts

## Risk Assessment
- **R1 — Fallow output is enormous on first run.** Mitigation: line-count sanity check before opening any file; Read tool only when extracting specific findings.
- **R2 — `fallow list` shows legitimate code as dead due to subpath-import miss.** Mitigation: Phase 1 R2 mitigation (alias added if needed) should eliminate this; if not, the `[DISPUTED]` mechanism in `tasks.md` catches it.
- **R3 — Fallow and static auditor disagree on classification.** Mitigation: static auditor's reasoning is documented per-row in `reports/researcher-260627-codebase-audit.md`; fallow findings are reconciled by grep on import sites. Disputed rows are NOT deleted.