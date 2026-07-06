---
phase: 4
title: "skills mirror mechanism"
status: pending
effort: "medium"
priority: P2
dependencies: [3]
---

# Phase 4: Skills mirror mechanism — generalize surface helpers + complete `.mastracode/skills/`

## Overview

Generalize `core/surfaces.js` to fan out to `<surface>/skills/` (not just `coordination/`), materialize the absent `.mastracode/skills/` mirror for `learning-loop` + `coordination-gate` (with `maturity:` frontmatter already present on both, so the mastra-code contract goes green this phase rather than waiting for phase 6), and create the byte-identical mirror parity test (the backstop — the existing skill-md test does NOT compare mirrors, verified). No gating in this phase; phase 5 adds the gate.

## Requirements

- Functional: `core/surfaces.js` provides a section-parameterized fan-out via a back-compat-wrapper shape (see Architecture); `<surface>/skills/` is a first-class surface path. `.mastracode/skills/learning-loop/SKILL.md` + `.mastracode/skills/coordination-gate/SKILL.md` exist, byte-identical to their `.claude` + `.factory` mirrors, WITH `maturity:` frontmatter present (folded in here, not deferred to phase 6 — collapses the contract-red window). The fan-out helper returns per-surface results (not void). A parity test asserts byte-identical skills across all 3 runtimes. `.mastracode/skills/` is git-tracked (`git add`).
- Non-functional: existing `coordination/` callers unchanged (back-compat wrappers preserve signatures); FCIS preserved; `runtime-agnostic.test.js` green (SURFACES iteration stays in surfaces.js).

## Architecture

`core/surfaces.js` today: `SURFACES = [".claude", ".factory", ".mastracode"]`; `getAllCoordinationPaths`, `writeToAllSurfaces` (atomic write-temp + rename, best-effort per surface, returns void, swallows per-surface errors), `readFromAllSurfaces`, `appendToAllSurfaces`, `readJsonlFromAllSurfaces`, `readModifyWriteOnAllSurfaces` — all coordination-only.

**Design decision (picked in the plan, not deferred — red-team finding):** back-compat-wrapper shape. Add a section-aware core helper + thin wrappers, preserving every existing signature:
- `getAllSurfacePaths(section, subpath)` = `SURFACES.map(s => \`${s}/${section}/${subpath}\`)`. `getAllCoordinationPaths(subpath)` becomes a thin wrapper: `getAllSurfacePaths("coordination", subpath)` (back-compat export kept).
- `writeToAllSurfacesSection(root, section, subpath, content)` — the shared loop, atomic write-temp + rename per surface, **returns a per-surface result array** `[{ surface, action: "wrote" | "failed", error? }]` (red-team finding: void + swallowed errors hide partial mirror failure). `writeToAllSurfaces(root, subpath, content)` becomes a wrapper passing `section="coordination"` (back-compat). `writeToAllSkills(root, subpath, content)` wrapper passes `section="skills"` and returns the per-surface results.
- Read/append/RMW helpers: leave coordination-only UNLESS the parity test or phase 6 needs a skills read (the parity test reads via `readFileSync` directly, so no skills-read helper is needed — YAGNI). Do not generalize companions speculatively.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/surfaces.js` (add `getAllSurfacePaths` + `writeToAllSurfacesSection` + `writeToAllSkills`; preserve existing exports/signatures).
- Create (one-shot mirror, with `maturity:`): `.mastracode/skills/learning-loop/SKILL.md` (add `maturity: state-2` frontmatter — the phase-6 maturity backfill for `learning-loop` is folded into this materialization) + `.mastracode/skills/coordination-gate/SKILL.md` (with `maturity: state-2`). Byte-identical content across all 3 mirrors (so `.claude`/`.factory` `learning-loop` SKILL.md must also get `maturity: state-2` here — add it to all 3 mirrors in this phase, not phase 6).
- Test: `tools/learning-loop-mastra/__tests__/legacy-mcp/surfaces.test.js` (new section cases + per-surface-result assertions); new `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-mirror-parity.test.js`.
- Exclude from mirror/parity: `.claude/skills/mastra` + `.factory/skills/mastra` symlinks (external, no `maturity:`, not loop-maintained).

## Implementation Steps

1. **Tests-first:**
   - `surfaces.test.js`: `writeToAllSkills(root, "x/SKILL.md", content)` writes `${surface}/skills/x/SKILL.md` for all 3 surfaces AND returns a 3-element result array with `action: "wrote"` (or `failed` on a simulated failure). Existing `coordination/` tests stay green (back-compat wrappers).
   - `skills-mirror-parity.test.js` (red): for each loop-maintained skill (`learning-loop`, `coordination-gate`), assert `<surface>/skills/<name>/SKILL.md` exists in all 3 surfaces AND is byte-identical (`readFileSync` + buffer equality). Assert the `mastra` symlink is excluded.
2. Read `core/surfaces.js` fully + `legacy-mcp/surfaces.test.js` + confirm `runtime-agnostic.test.js:80` constraint (no hand-rolled SURFACES iteration in core/ outside surfaces.js).
3. Add the back-compat-wrapper helpers to `surfaces.js` (per Architecture): `getAllSurfacePaths`, `writeToAllSurfacesSection` (returns per-surface results), `writeToAllSkills`; rewrite `getAllCoordinationPaths` + `writeToAllSurfaces` as thin wrappers. Existing call sites (`inbound-gate.js`, `gate-decision-log.js`, `r2/denial-log.js`, `inbound-state.js`, `gate-override.js`) pass `coordination` implicitly via the wrappers — no caller changes.
4. Materialize `.mastracode/skills/` with `maturity:` + the `loop-engine.md` cross-ref folded in:
   - Add `maturity: state-2` frontmatter + a one-line cross-reference (in the existing `## Runtime contract` section) to the forthcoming `docs/loop-engine.md` "Authoring loop-maintained skills" subsection (phase 6 lands that subsection; the cross-ref can land first and point at the section name) to `.claude/skills/learning-loop/SKILL.md` + `.factory/skills/learning-loop/SKILL.md` + the new `.mastracode/skills/learning-loop/SKILL.md` (all 3 byte-identical). Copy the full skill tree (SKILL.md + any `references/`).
   - Same for `coordination-gate/` (`.claude` + `.factory` already backfilled in phase 2; create `.mastracode/skills/coordination-gate/SKILL.md` byte-identical with `maturity: state-2`). `coordination-gate` needs no cross-ref (it is not the authoring skill).
   - Confirm byte-identity: `cmp .claude/skills/learning-loop/SKILL.md .mastracode/skills/learning-loop/SKILL.md` (clean) for both skills.
   - `git add .mastracode/skills/` (red-team finding: phase-6 rollback assumes git-tracking; the freshly-created tree must be tracked).
   - (Validation decision 2026-07-07: phase 4 folds the maturity frontmatter AND the cross-ref into materialization, so phase 6 does NOT edit the SKILL.md — phase 6 only edits `docs/loop-engine.md` + records the change-log. The gated-path proof is phase 5's tests, not a phase-6 SKILL.md edit.)
5. Run `pnpm test` on `legacy-mcp/surfaces.test.js` + the new parity test + `runtime-agnostic.test.js`. Run `node contract.js mastra-code` — now exits 0 (mirror present + `maturity:` present on both skills, folded in here; tool-ref check scoped to `learning-loop` which still references the tools).
6. Update `RUNTIME_ONBOARDING.md` if the mirror requirement needs a step.

## Success Criteria

- [ ] `core/surfaces.js` has `getAllSurfacePaths` + `writeToAllSurfacesSection` (returns per-surface results) + `writeToAllSkills`; `getAllCoordinationPaths` + `writeToAllSurfaces` preserved as back-compat wrappers; no caller changes.
- [ ] `.mastracode/skills/learning-loop/SKILL.md` + `.mastracode/skills/coordination-gate/SKILL.md` exist, byte-identical to `.claude` + `.factory` mirrors, WITH `maturity: state-2` frontmatter + the `loop-engine.md` cross-ref on `learning-loop` (`cmp` clean; folded in here, not phase 6).
- [ ] `.mastracode/skills/` is `git add`-ed (git-tracked).
- [ ] `skills-mirror-parity.test.js` asserts byte-identical across all 3 runtimes for `learning-loop` + `coordination-gate`; excludes the `mastra` symlink.
- [ ] `writeToAllSkills` returns a per-surface result array (test asserts `action` per surface).
- [ ] Existing `surfaces.test.js` + `runtime-agnostic.test.js` green; FCIS preserved.
- [ ] `node contract.js mastra-code` exits 0 (no longer advisory — mirror + maturity both present this phase).

## Risk Assessment

Medium. Generalizing `surfaces.js` touches a core helper every surface-user imports; a signature break cascades. Mitigations: (a) back-compat wrappers (existing signatures preserved, no caller changes — design picked in-plan per red-team); (b) tests-first pins new + existing behavior; (c) per-surface results expose partial-failure (red-team); (d) `maturity:` folded into materialization collapses the contract-red window (red-team). Rollback: `git checkout core/surfaces.js surfaces.test.js` + the `.claude`/`.factory` `learning-loop` SKILL.md frontmatter; `rm -rf .mastracode/skills/`.