---
phase: 5
title: "phase-05-verification"
status: pending
priority: P2
dependencies: ["phase-04-phase-04-ci-guard"]
effort: "0.25 day"
---

# Phase 5: Verification

## Overview
Final integrity check: full test suite green, fallow reports zero findings in `core/`, every row in `tasks.md` is resolved, and the admission rule is documented in `core/README.md` so future contributors understand the constraint.

## Requirements
- **Functional:** `fallow dead-code --unused-files` reports 0 findings in `core/`; `fallow dead-code --unused-exports` reports 0 findings on remaining exports; full test suite passes; `tasks.md` has no ☐ rows remaining.
- **Non-functional:** `core/README.md` carries the admission rule section with a pointer to `.fallowrc.json`; journal entry written; cross-plan consistency sweep passes.

## Architecture

No code changes in this phase. Verification only:

```
┌──────────────────────────────────────────────┐
│ Verification gate (all must pass)            │
│                                              │
│  □ pnpm test (delta matches Phase 3 expectations)
│  □ fallow dead-code --unused-files  → 0      │
│  □ fallow dead-code --unused-exports → 0     │
│  □ tasks.md: every row ☑ or archived        │
│  □ core/README.md has admission rule         │
│  □ cross-plan consistency sweep              │
└──────────────────────────────────────────────┘
```

## Related Code Files
- Modify: `tools/learning-loop-mastra/core/README.md` (add "Admission rule" section)
- Modify: `plans/260627-2042-phase-e-dead-code-sweep/tasks.md` (final row status update)
- Modify: `plans/reports/journal.md` or equivalent (journal entry per `/ck:journal` workflow)
- Possibly create: `tools/learning-loop-mastra/__tests__/_archive/` (only if Step 0 archives any rows)

## Implementation Steps

### Step 0 — Decide deletion policy for ⚠ disputed rows

If any tasks.md row is ⚠ disputed after Phase 3 (specifically rows 5 or 6 — `surfaces.js` or `read-registry-cache.js`), the operator decides per-row:

- **Delete** if no production import chain can be demonstrated via grep. Add a 5th deletion row to `tasks.md`; treat as confirmed dead. (Validation session 1, 2026-06-27: "delete if no prod import chain".)
- **Keep** if a transitive import chain is demonstrated (e.g., `core/surfaces.js` → `core/meta-state.js` → production tool). Mark ☑ verified-LIVE with the chain documented in tasks.md notes.

**No archive path.** The `_archive/` convention is reserved for cases where the file is intentionally kept for reference but not actively used; for these rows, the question is binary (live or dead), not gradient.

If neither dispute is unresolved, skip this step.

### Step 1 — Run the full test suite
```bash
cd tools/learning-loop-mastra
pnpm test
```

All tests must pass. Compare against the captured-before counts in `tasks.md` (recorded in Phase 0). Expected delta:

- `__tests__/legacy-mcp/list-probes.test.js`: −3 tests (per the static audit, 3 `it()` blocks)
- `core/lib/source-ref-validator.test.js`: −24 tests (per the static audit; sibling test pattern is discovered by the namespaced runner per Phase 0)

Total expected delta: **−27 tests** (verified in Phase 0). Post-deletion core/ production file count: **31** (33 baseline − 2 deletions). If the actual delta doesn't match, update `tasks.md` notes with the corrected number and verify Phase 5 reasoning holds.

### Step 2 — Run final fallow scan
```bash
cd tools/learning-loop-mastra

fallow dead-code \
  --root . \
  --unused-files \
  --format compact \
  -o ../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/final-unused-files.txt \
  --quiet

fallow dead-code \
  --root . \
  --unused-exports \
  --format compact \
  -o ../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/final-unused-exports.txt \
  --quiet

fallow dead-code \
  --root . \
  --unused-deps \
  --format compact \
  -o ../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/final-unused-deps.txt \
  --quiet
```

Expected: `core/` appears in 0 findings. Other directories (`tools/legacy/`, `hooks/`, `mastra/`) may show unused exports only if those exports are imported by tests or by other tools not yet wired into the analysis.

### Step 3 — Verify `tasks.md` is fully resolved

Read `tasks.md`. Every row must be one of:
- ☑ deleted (rows 1-4)
- ☑ verified-LIVE (rows 5-6)
- ☑ documented (row 7 — manifest comment)

If any row is ☐ or ⚠ without resolution, STOP and address before closing the plan.

### Step 4 — Add the admission rule to `core/README.md`

Locate `core/README.md` (it exists per the parent phase-e plan §4.1). Add a new section:

```markdown
## Admission rule

A module belongs in `core/` only if a non-test, non-fixture import site uses it.

Rationale: `core/` accumulated helper modules during earlier CLI migrations
(e.g., `core/list-probes.js` from the CLI-shim era) whose only consumer was
`__tests__/legacy-mcp/`. The placement manifest (Mechanism A from the phase-E
implicit-topology refactor) prevents *new* accumulation; the fallow CI guard
prevents re-accumulation. Together they enforce this rule.

Enforcement:
- `.fallowrc.json` lists `mastra/server.js` and the `tools/legacy/**/*.js`
  wrappers as entry points. `__tests__/legacy-mcp/**` is excluded.
- `fallow audit --gate new-only` runs on every PR; introduced dead code
  fails the gate.
- `fallow dead-code --save-regression-baseline` is regenerated on `main`
  after every cleanup PR; the regression baseline is the numerical floor.

When adding new code to `core/`:
1. Update `core/placement.yaml` with the new file's path + role + summary.
2. Ensure the file is imported by a production site (a tool in
   `tools/legacy/`, a hook in `hooks/legacy/`, or another core facade).
3. Run `fallow dead-code --unused-files --unused-exports` locally; expect
   0 findings for the new file.
```

### Step 5 — Cross-plan consistency sweep

Re-read `plan.md` and every `phase-*.md`. Search for:
- Stale references to `list-probes` or `source-ref-validator`
- Inconsistent file counts (post-deletion: 27 production files in `core/` minus 2 = 25; verify against `core/placement.yaml`)
- The "1189+" baseline placeholder (replace with the actual baseline count)

If contradictions remain, fix them in-place and note in `tasks.md`.

### Step 6 — Journal entry

Per `/ck:journal` workflow, write a concise technical journal entry:

```markdown
## 2026-06-27 — Phase E Dead-Code Sweep

**What shipped:** 4 file deletions (2 source + 2 test), `.fallowrc.json`
config, fallow audit wired into CI, regression baseline committed.

**Why it matters:** `core/` no longer carries legacy migration residue.
Mechanism A (placement manifest) prevents new accumulation; the CI guard
prevents re-accumulation. The admission rule is now machine-enforced, not
operator-history-only.

**Lessons:**
- The manifest path "bug" (manifest.json referencing `tools/X-tool.js`
  vs. files living in `tools/legacy/`) was a loader convention at
  `mastra/server.js:26-27`, not a bug. A 1-line comment fixes the confusion.
- Fallow's `dynamicallyLoaded` config is the right tool for JSON-manifest-
  driven dynamic imports; `entry` is for static imports.
- `fallow audit --gate new-only` is better than `fallow dead-code --ci`
  for PR guards: severity-aware + introduced-vs-inherited attribution.

**Followups:**
- (informational) Future cleanup rounds can tighten `--tolerance` from
  the current `0` if the count ever drifts up.
```

## Success Criteria
- [ ] `pnpm test` passes (full suite, all green)
- [ ] `fallow dead-code --unused-files` reports 0 findings in `core/`
- [ ] `fallow dead-code --unused-exports` reports 0 findings in `core/` exports
- [ ] `tasks.md` has 0 ☐ rows remaining
- [ ] `core/README.md` has the "Admission rule" section
- [ ] Cross-plan consistency sweep reports 0 contradictions
- [ ] Journal entry written
- [ ] All 4 final fallow reports committed to `reports/fallow/final-*.txt`

## Risk Assessment
- **R1 — `pnpm test` count differs from the baseline placeholder.** Mitigation: this is a count, not a failure; just update the placeholder in this phase-e plan and the parent plan if it referenced the dead number.
- **R2 — A fallow finding reappears that wasn't in the static audit.** Mitigation: this would mean fallow found new dead code (e.g., from a transitive import we missed). Add a row to `tasks.md`; do not close the phase until resolved.
- **R3 — Cross-plan consistency sweep finds stale references.** Mitigation: in-place edits per step 5; note in `tasks.md`.