---
phase: 2
title: "L2 contract: generalize Req #3 + maturity"
status: pending
effort: "medium"
priority: P2
dependencies: [1]
---

# Phase 2: L2 contract — generalize Req #3 + hard-require `maturity:`

## Overview

Generalize `CONTRACT.md` Req #3 (`skill-spec`) from the single `learning-loop` SKILL.md to a host-any-loop-maintained-skill contract: mirrored across all participating runtimes at `<surface>/skills/<name>/SKILL.md`, each declaring `maturity:` frontmatter, and stated as gated artifacts. Update `contract.js::checkSkillSpec` to enumerate loop-maintained skills (those declaring `maturity:` frontmatter — this excludes the external `mastra` symlink), hard-fail on missing `maturity:`, and scope the `loop_describe`+`meta_state_list` tool-reference check to `learning-loop` only (other skills need not reference those tools). Backfill `maturity:` on `coordination-gate`. No `docs/runtime-contract.md` change (decision 10).

## Requirements

- Functional: Req #3 reads as a multi-skill, mirror + maturity + gated-artifact requirement. The validator enumerates `<surface>/skills/*/SKILL.md` **that declare `maturity:` frontmatter** (loop-maintained skills — excludes the `mastra` symlink), verifies mirror presence across participating runtimes, hard-requires `maturity:` (valid enum), and applies the `loop_describe`+`meta_state_list` reference check to `learning-loop` ONLY.
- Non-functional: behavior-preserving for `learning-loop` (it already references both tools); `coordination-gate` passes after the `maturity:` backfill (it is NOT checked for tool refs); per-skill frontmatter parse is error-isolated (one malformed skill yields a per-skill fail, does not abort the validator); frontmatter parse is size-capped + `schema:'core'` (YAML billion-laughs guard).

## Architecture

`CONTRACT.md` is the MCP-transport conformance checklist; `contract.js` is its read-only validator. Today `checkSkillSpec` (lines 168–192) resolves a single `learning-loop/SKILL.md` and checks `loop_describe` + `meta_state_list` substrings. Generalizing: enumerate every `<surface>/skills/*/SKILL.md`, treat the presence of `maturity:` frontmatter as the "loop-maintained" declaration (a skill the loop mirrors), parse frontmatter (reuse the `yaml` package + the existing `parseYaml`/`extractFrontmatter` helper in `core/gate-logic.js` — not a new core module, not a new dependency), hard-require `maturity:`, check mirror presence, and apply the tool-ref check to `learning-loop` only. The `mastra` symlink (`<surface>/skills/mastra -> ../../.agents/skills/mastra`) is excluded because it does not declare `maturity:` (it is an external, non-loop-maintained skill).

## Related Code Files

- Modify: `tools/learning-loop-mastra/interface/CONTRACT.md` (Req #3 `skill-spec`, lines 36–43).
- Modify: `tools/learning-loop-mastra/interface/contract.js` (`checkSkillSpec` 168–192; `skill_discovery_paths` in `RUNTIMES` 30–41; the `skill-spec-no-tools-block` note 595–596).
- Modify: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` (multi-skill + maturity requirement).
- Modify (backfill): `.claude/skills/coordination-gate/SKILL.md` + `.factory/skills/coordination-gate/SKILL.md` (add `maturity:` frontmatter). `.mastracode/skills/coordination-gate/SKILL.md` created by phase 4 with the frontmatter present.
- Reuse: `core/gate-logic.js` `parseYaml` / `extractFrontmatter` (the existing `yaml`-package wrapper).
- Test: `tools/learning-loop-mastra/interface/__tests__/contract.test.js` + `tools/learning-loop-mastra/__tests__/interface/skill-md-references-tools.test.js`.

## Implementation Steps

1. **Tests-first (red):** add contract.test.js cases:
   - `skill-spec` enumerates `<surface>/skills/*/SKILL.md` declaring `maturity:` (more than just `learning-loop`); the `mastra` symlink (no `maturity:`) is NOT enumerated.
   - A skill with `maturity:` missing/invalid → `skill-spec` `ok: false`, reason `maturity-not-declared` for that skill.
   - `learning-loop` is checked for `loop_describe` + `meta_state_list` references; `coordination-gate` is NOT checked for those references (scoped).
   - `coordination-gate` (after backfill) passes `skill-spec` (maturity present, mirror present, no tool-ref requirement).
   - A skill with malformed YAML frontmatter → per-skill `ok: false`, reason `frontmatter-unparseable`; the OTHER skills still get evaluated (error isolation — the loop does not abort).
   - A skill with a > N KB frontmatter block → per-skill `ok: false`, reason `frontmatter-too-large` (size cap; billion-laughs guard).
2. Read `CONTRACT.md` Req #3 (36–43), `contract.js` `checkSkillSpec` (168–192) + `RUNTIMES` (30–41) + `core/gate-logic.js` `parseYaml`/`extractFrontmatter`.
3. Rewrite Req #3 in `CONTRACT.md`:
   - "The runtime MUST host loop-maintained skills at `<surface>/skills/<name>/SKILL.md`, mirrored across all participating runtimes."
   - "A skill is loop-maintained iff its SKILL.md declares `maturity:` frontmatter (one of `state-1`, `state-2`, `state-3`) — the injection-determinism-by-maturity convention. The validator enumerates only skills declaring `maturity:`."
   - "`learning-loop` MUST reference `loop_describe` AND `meta_state_list` (it documents the tool surface). Other loop-maintained skills are not required to reference those tools."
   - "Skill files are gated artifacts: direct writes to `<surface>/skills/**` are blocked by the write-gate; edits go through the gated authoring path (`gate_mark_preflight` → write → `meta_state_log_change`)."
   - Keep the `tools:` block note ("a structured `tools:` block is an upgrade target; prose references pass today").
4. Backfill `maturity: state-2` frontmatter on `coordination-gate` SKILL.md (`.claude` + `.factory` mirrors). (`learning-loop` `maturity:` is added in phase 4's materialization, not here — phase 4 folds it in to collapse the contract-red window.)
5. Generalize `checkSkillSpec` in `contract.js`:
   - `readdir` on `<root>/<surface>/skills/`; for each entry with a `SKILL.md`, read frontmatter via the existing `extractFrontmatter` (gate-logic.js). **Skip entries whose SKILL.md has no frontmatter or no `maturity:` field** (this excludes the `mastra` symlink — it has no `maturity:`).
   - **Error isolation:** wrap each skill's frontmatter parse in try/catch; a parse failure or oversized block (> size cap, e.g. 64 KB) yields a per-skill `ok: false` (`frontmatter-unparseable` / `frontmatter-too-large`) and the loop continues. Pass `schema: 'core'` to `parseYaml` (alias-expansion guard).
   - Per loop-maintained skill: validate `maturity:` is one of `state-1`/`state-2`/`state-3`; check mirror presence in the other runtimes' `<surface>/skills/<name>/SKILL.md`.
   - Apply the `loop_describe`+`meta_state_list` reference check to `learning-loop` ONLY (other skills skip it).
   - Return a per-skill result array on the `skill-spec` check; `ok` is the aggregate. Reason codes: `maturity-not-declared`, `frontmatter-unparseable`, `frontmatter-too-large`, `skill-mirror-gap`.
   - For mastra-code: tolerate the missing `.mastracode/skills/` mirror as advisory `skill-mirror-gap` UNTIL phase 4 materializes it; after phase 4 (which also folds `learning-loop` `maturity:` in), hard-fail. Since phase 4 materializes with `maturity:` present, mastra-code goes green after phase 4.
6. Update `RUNTIME_ONBOARDING.md` with the multi-skill + maturity requirement.
7. Run `pnpm test` on `interface/__tests__/contract.test.js` + `interface/skill-md-references-tools.test.js`; confirm green. Run `node contract.js claude-code` + `droid`; exit 0 (mastra-code advisory-pending phase 4).

## Success Criteria

- [ ] `CONTRACT.md` Req #3 reads as multi-skill + mirror + `maturity:` + gated-artifact; tool-ref check scoped to `learning-loop`.
- [ ] `checkSkillSpec` enumerates only `<surface>/skills/*/SKILL.md` declaring `maturity:` (test asserts `mastra` symlink excluded).
- [ ] Missing/invalid `maturity:` → per-skill `ok: false`, `maturity-not-declared` (test).
- [ ] Malformed/oversized frontmatter → per-skill fail, loop continues (error-isolation test); `schema:'core'` + size cap applied.
- [ ] `coordination-gate` passes `skill-spec` after backfill (maturity present; NOT checked for `loop_describe`/`meta_state_list`).
- [ ] `node contract.js claude-code` + `droid` exit 0; `node contract.js mastra-code` advisory pending phase 4.
- [ ] `docs/runtime-contract.md` untouched (decision 10); no new YAML dependency (reuse `yaml` + `core/gate-logic.js` helpers).

## Risk Assessment

Medium. The validator is a contract gate; a regression fails every runtime. Mitigations: (a) tests-first pins behavior; (b) tool-ref check scoped to `learning-loop` (avoids the `coordination-gate` false-fail red-team found); (c) enumeration restricted to `maturity:`-declaring skills (excludes the external `mastra` symlink, bounds the parse surface); (d) error isolation + size cap prevent one bad skill from aborting the validator. Rollback: `git checkout` CONTRACT.md, contract.js, RUNTIME_ONBOARDING.md, the two `coordination-gate` SKILL.md files.