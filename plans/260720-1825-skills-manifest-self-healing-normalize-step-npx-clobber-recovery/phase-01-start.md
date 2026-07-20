---
phase: 1
title: "Probe clobber shape + write failing normalize tests"
status: completed
priority: P1
effort: "3-4h"
dependencies: []
---

# Phase 1: Probe clobber shape + write failing normalize tests

## Overview

Resolve the unknowns (Q1/Q3) by probing what `npx skills` actually writes to `skills-lock.json` in an isolated fixture, then lock that shape into TDD **red** tests for `pnpm skills:normalize`. The probe report is the spec; the failing tests encode it. No implementation yet — tests fail because `normalize-skills.mjs` does not exist.

## Requirements

- Functional: a probe report at `plans/reports/probe-260720-npx-skills-clobber-shape.md` documenting the exact clobbered `skills-lock.json` shape — field names npx writes (`source`, `sourceType`, `computedHash`, …), the fields it drops (`external`, `delivery`, `targets`, `maturity`, `hash`), whether `version` and internal entries (`learning-loop`, `coordination-gate`) survive, and the semantics of `computedHash` (sha256 of `SKILL.md`? tree hash? which algorithm?).
- Functional: a new test file `tools/learning-loop-mastra/__tests__/legacy-mcp/normalize-skills.test.js` with failing tests (red) covering clobber→normalize round-trip, idempotence, hash derivation, internal-entry preservation, unknown-external skip, and the F10/F6 regression shape.
- Non-functional: probe runs ONLY in a tmp fixture (never clobbers the live `skills-lock.json`); tests use the existing `mkdtempSync` + positional-root-arg fixture discipline (matching `sync-skills.test.js`).

## Architecture

- **Probe (operator-gated runtime step):**
  1. `mastra_gate_check("npx skills add mastra-ai/skills --copy")` + `workflow_runtime_probe({stack:"nodejs", probe_type:"runtime"})` — confirm the npx run is permitted and plan the isolated probe.
  2. Copy the live `skills-lock.json` into a tmp root (`mkdtempSync`); seed the tmp root with the canonical mastra tree (`tools/learning-loop-mastra/skills` is NOT the mastra source — mastra is external; copy from a detected surface like `.claude/skills/mastra/` so npx has something to update) OR run `npx skills add mastra-ai/skills --copy` fresh in the tmp root.
  3. Run `npx skills add mastra-ai/skills --copy` and `npx skills update mastra` in the tmp root; capture the resulting `skills-lock.json` byte-for-byte.
  4. Diff clobbered vs. pre-clobber manifest; record: which fields npx added, which it dropped, whether `version`/internal entries survived, and `computedHash` value vs. `sha256(<detected>/skills/mastra/SKILL.md)`.
  5. Write the report. Decide Q1 (copy `computedHash` vs. scan+derive) and confirm Q3 (internal/version survival).
- **Tests (TDD red):** fixture builder `buildClobberedFixture(root, {clobberedMastra, internal})` writes a `skills-lock.json` matching the probed clobbered shape + an installed `mastra/SKILL.md` on one surface (the detected copy) + stale copies on the others, mirroring `sync-skills.test.js`'s `buildFixture`. Tests call `execFileSync("node", [NORMALIZE_SCRIPT, root])` and assert the post-state.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/normalize-skills.test.js` (failing TDD red tests)
- Create: `plans/reports/probe-260720-npx-skills-clobber-shape.md` (probe report — the spec for Phase 2 fixtures)
- Read-only context: `tools/scripts/sync-skills.mjs` (fixture/`execFileSync` pattern, `findDetectedSurface`, `sha256`), `tools/learning-loop-mastra/__tests__/legacy-mcp/sync-skills.test.js` (`buildFixture`, `runSyncSkills`), `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-mirror-parity.test.js` (F10/F6 shapes), `skills-lock.json` (current v2 shape — the restore target)

## Implementation Steps (TDD — Tests Before)

1. Run the gate check + runtime-probe plan for the `npx` command; get operator approval for the isolated probe.
2. Execute the isolated probe (tmp root only); capture the clobbered manifest + `computedHash` vs. `sha256(SKILL.md)`.
3. Write `plans/reports/probe-260720-npx-skills-clobber-shape.md` with: the clobbered entry shape (field-by-field), dropped fields, `version`/internal survival, `computedHash` semantics, and the Q1 decision (copy vs. derive).
4. Create `normalize-skills.test.js` with a `buildClobberedFixture` helper modeled on `sync-skills.test.js`'s `buildFixture` (tmp root, clobbered `skills-lock.json`, detected + stale `mastra` copies on surfaces).
5. Write failing tests:
   - **Clobber→normalize round-trip:** clobbered manifest → `pnpm skills:normalize` (via `execFileSync`) → `skills-lock.json` restored to v2 extended schema for `mastra` (`external:true`, `delivery:"npx-per-runtime+fanout-undetected"`, `targets:[".claude",".factory",".mastracode"]`, `maturity:null`, `source:"mastra-ai/skills"`, `sourceType:"npx-skills-cli"`, `hash` = 64-char sha256).
   - **Idempotence:** normalize on an already-normalized manifest writes nothing (mtime unchanged / `changed:false`).
   - **Hash derivation (Q1-branched per probe):** `manifest.skills.mastra.hash === sha256(<detected surface>/skills/mastra/SKILL.md)` — either copied from `computedHash` (if probe confirms equality) or derived by matching `computedHash` to a surface's `SKILL.md` sha256. Test the decided path.
   - **Internal entries preserved:** `learning-loop` + `coordination-gate` entries byte-identical before/after normalize (assert deep-equal on those entries).
   - **`version` preserved/restored:** `manifest.version === 2` after normalize (restored if npx dropped it).
   - **Unknown external skip:** an external entry NOT in the policy table (e.g. `"other-external":{sourceType:"github",computedHash:"…"}`) is left untouched (fail-safe; not fanned out, not dropped).
   - **F10/F6 regression shape:** after normalize, `manifest.skills.mastra.external === true` and `manifest.skills.mastra.hash` is a 64-char hex (the assertions F10/F6 will run against once `pnpm skills:sync` fans out).
6. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/normalize-skills.test.js` → confirm RED (script missing / import fails). This is the expected TDD red state.

## Success Criteria

- [x] Probe report exists with the clobbered shape, dropped fields, `computedHash` semantics, and the Q1 decision.
- [x] `normalize-skills.test.js` exists with all failing tests above.
- [x] `pnpm test:one normalize-skills.test.js` is RED for the right reason (no `normalize-skills.mjs` yet), not a syntax/fixture error.
- [x] No writes to the live `skills-lock.json` (probe was tmp-root only — verify `git status` clean for `skills-lock.json`).

## Risk Assessment

- **Probe clobbers live manifest** if not isolated. Mitigation: tmp-root-only probe; `git status` check at phase end.
- **`npx` unavailable in the sandbox.** The parent plan's Phase 3 found `npx` IS available in WSL2. If the probe cannot run here, fall back to constructing the clobbered fixture from the documented shape (Phase 3 status note lists the fields) and mark `computedHash` semantics as "assumed sha256(SKILL.md), verify on next real npx run" — Phase 2's hash-derivation test then covers the copy path with a fixture, and the scan+derive path is specified but not the primary. Record the assumption in the probe report.
- **Tests RED for the wrong reason** (fixture bug, not missing script). Mitigation: keep `buildClobberedFixture` a close copy of `sync-skills.test.js`'s `buildFixture`; sanity-check the fixture by temporarily inverting one assertion.