---
title: "Phase 2: Internal canonical source and fan-out materializer"
status: completed
---

# Phase 2: Internal canonical source and fan-out materializer

## Overview

Create a single canonical authoring source for internal skills at `tools/learning-loop-mastra/skills/<name>/SKILL.md` and a fan-out materializer (`tools/scripts/sync-skills.mjs` + `pnpm skills:sync`) that reuses `core/surfaces.js#writeToAllSkills` to write byte-identical real files to `.{claude,factory,mastracode}/skills/<name>/`. Idempotent (re-run = no diff). Decision 3 preserved — real files, no symlinks. Add a narrow write-gate rule so the canonical dir is only written via the preflight-unlocked materializer path. This phase makes `writeToAllSkills` its first consumer (remove its `fallow-ignore-next-line unused-export`).

**Red-team scope note (AD#6):** internal skills (`learning-loop`, `coordination-gate`) contain **only `SKILL.md`** (no `references/` or `scripts/` — verified on disk). Phase 2 implements **single-file fan-out** only. The recursive tree-walk (for `references/` + `scripts/`) is deferred to Phase 3 where it is actually needed (mastra has subdirs). This keeps Phase 2 minimal (YAGNI) and avoids shipping an untested recursive walker.

## Requirements

- Functional: canonical source for `learning-loop` + `coordination-gate`; idempotent single-file materializer; one edit → all 3 mirrors byte-identical; narrow gate on the canonical dir.
- Non-functional: parity test green; contract green all 3 runtimes; materializer is the only write path to internal skill mirrors; `BOUND_ARTIFACTS` unchanged; canonical-vs-mirror drift is detectable by a test (not just mirror-vs-mirror).

## Architecture

- **Canonical source** `tools/learning-loop-mastra/skills/<name>/SKILL.md` — runtime-agnostic (mirrors the `hooks/universal/` precedent; operator-chosen neutral `tools/` location over `.claude`). NOT a runtime surface → NOT added to `SURFACES` (scout: `SURFACES` is the fan-out axis; the canonical dir is a single authoring dir).
- **Materializer** `tools/scripts/sync-skills.mjs` (ESM, matches `surfaces.js` ESM + `tools/scripts` `.mjs` convention): reads each internal entry from `skills-lock.json`, calls `writeToAllSkills(root, "<name>/SKILL.md", content)` (single-file in Phase 2) → atomic per-surface write-temp+rename. Idempotent because content-equal writes produce no diff. **Post-fan-out runtime parity check (red-team F5):** after fan-out, re-read all 3 mirrors + the canonical, and fail loudly (`exit 1` with the divergent surface named) if they are not byte-identical. This closes the partial-fan-out gap (`surfaces.js:11-14` disclaims cross-surface transactions; `checkMirrorPresence` `count >= 2` masks single-surface divergence at the contract layer — the materializer, not the contract, must enforce 3-way byte-identity at runtime). No `.sh` companion for v1 (YAGNI).
- **Narrow gate** — add a rule to `WRITE_GATE_RULES` in `evaluate-write-gate.js` matching `tools/learning-loop-mastra/skills/**`, delegating to the existing `evaluateSkillsPreflight` (reuses `.loop-preflight-skills` marker). Do NOT touch `BOUND_ARTIFACTS` (`bound-artifacts.test.js:48-56` pins order/contents).

## Related Code Files

- Create: `tools/learning-loop-mastra/skills/learning-loop/SKILL.md`, `tools/learning-loop-mastra/skills/coordination-gate/SKILL.md` (copy current `.claude/skills/<name>/SKILL.md` byte-for-byte, including `maturity: state-2` frontmatter)
- Create: `tools/scripts/sync-skills.mjs`
- Modify: `tools/learning-loop-mastra/core/evaluate-write-gate.js` (add canonical-dir rule to `WRITE_GATE_RULES`, delegate to `evaluateSkillsPreflight`)
- Modify: `tools/learning-loop-mastra/core/surfaces.js` (red-team F15: race-safe unique tmpPath + `finally` cleanup; remove `fallow-ignore-next-line unused-export` on `writeToAllSkills`) — **shared core (shipped by plan 260707-0114); narrow fix only**
- Modify: `package.json` (add `"skills:sync": "node tools/scripts/sync-skills.mjs"`)
- Modify: `skills-lock.json` (Phase 1 internal entries' `canonicalSource` now resolves to a real path; refresh `hash` from canonical)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/sync-skills.test.js` (idempotence + gate + canonical-vs-mirror parity + partial-failure tests)
- Read-only context: `core/surfaces.js:16` (`SURFACES`), `:11-14` (no cross-surface transaction disclaimer), `:61-77` (`writeToAllSurfacesSection`), `:106-108` (`writeToAllSkills`); `evaluate-write-gate.js:74,102-108,149-169`; `contract.js:239-251` (`checkMirrorPresence` `count >= 2`)

## Implementation Steps (TDD)

**Tests Before**
1. Pin current state: `skills-mirror-parity.test.js` green (byte-identity across 3 surfaces) — the regression backstop. Run it.
2. Write `sync-skills.test.js`:
   - **Idempotence:** run `sync-skills` twice → second run writes 0 bytes (no diff) in all 3 surfaces.
   - **Fan-out correctness:** mutate canonical `learning-loop/SKILL.md` (append a sentinel comment), run `sync-skills` → all 3 mirrors gain the sentinel byte-identically; revert canonical, re-run → mirrors revert. (Restore canonical to avoid committing the sentinel.)
   - **`writeToAllSkills` is the engine:** assert the materializer imports + calls it (not a reimplementation).
   - **Canonical-vs-mirror parity (red-team F3 — detection):** after `sync-skills`, assert `canonical === .claude/skills/<name>/SKILL.md` for each internal skill (and each mirror). This is the backstop that makes the "materializer is the only write path" claim enforceable: a direct tamper of the canonical (during the 30-min preflight window) is detected by this invariant, not just mirror-vs-mirror drift. Without it the escalation (tamper canonical → fan out → mirror-vs-mirror parity passes) is invisible.
   - **Partial-failure detection (red-team F5):** simulate one surface write failing (e.g. chmod the target dir read-only for `.mastracode`), run `sync-skills` → it must exit non-zero AND name the divergent surface (post-fan-out runtime parity check fires). Assert the 2 successful surfaces are NOT silently left diverged from canonical without an error.
3. Write gate test: direct write to `tools/learning-loop-mastra/skills/learning-loop/SKILL.md` → blocked without `.loop-preflight-skills`; allowed with marker. Also assert the rule does NOT match `tools/learning-loop-mastra/core/**` or `hooks/**` (proves narrow, not `tools/**`-wide).
4. Run new tests — expect FAIL (canonical dir + materializer + gate rule don't exist yet).

**Refactor**
5. Create canonical `tools/learning-loop-mastra/skills/{learning-loop,coordination-gate}/SKILL.md` by copying current `.claude/skills/<name>/SKILL.md` byte-for-byte.
6. **Fix `surfaces.js` (red-team F15, narrow):** in `writeToAllSurfacesSection` (L61-77), make the temp path race-safe — `const tmpPath = \`${realPath}.${process.pid}.tmp\`;` (distinguishes concurrent `sync-skills` CLI runs; the per-surface loop is sequential within a process so no intra-process collision) — and add `finally { try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {} }` so a failed `renameSync` or interruption does not leak the `.tmp` file. Do NOT add `proper-lockfile` (YAGNI; the pid-suffixed tmp + the materializer being a manual operator step is sufficient for v1). Keep the existing per-surface `try/catch` result shape.
7. Write `tools/scripts/sync-skills.mjs`:
   - `import { writeToAllSkills } from "../learning-loop-mastra/core/surfaces.js"` (resolve relative to repo root).
   - Read `skills-lock.json`; for each entry with `external:false` (internal): read the canonical `SKILL.md`, call `writeToAllSkills(root, "<name>/SKILL.md", content)`.
   - **Post-fan-out runtime parity check (F5):** re-read all 3 mirrors + canonical; if any pair differs, print the divergent surface(s) + exit 1.
   - Print per-surface result summary; exit non-zero on any `action:"failed"` OR parity mismatch.
8. Add `"skills:sync": "node tools/scripts/sync-skills.mjs"` to `package.json` scripts.
9. Add the narrow gate rule in `evaluate-write-gate.js` `WRITE_GATE_RULES`: match `tools/learning-loop-mastra/skills/**`, delegate to `evaluateSkillsPreflight` (reuse `.loop-preflight-skills`). Place alongside the existing `skills` rule (NOT in `BOUND_ARTIFACTS`).
10. Remove the `fallow-ignore-next-line unused-export` on `writeToAllSkills` (`surfaces.js:60`) — it now has a consumer.
11. Run `pnpm skills:sync` once to materialize from canonical (no-op if content already equal).
12. Run new tests — expect PASS.

**Tests After**
13. Self-heal test: delete `.factory/skills/learning-loop/SKILL.md`, run `sync-skills` → restored byte-identically; canonical-vs-mirror parity check passes.
14. Update `skills-lock.json` internal entries' `canonicalSource` + `hash` to the real canonical paths; re-run Phase 1 drift + hash-verification tests → green.

**Regression Gate**
15. `pnpm test:iter` green (parity, contract ×3, bound-artifacts, runtime-agnostic, new sync/gate/parity tests).
16. `node tools/learning-loop-mastra/interface/contract.js claude-code|droid|mastra-code` all exit 0.
17. `pnpm skills:sync` twice → second run no diff. One canonical edit → 3 mirrors byte-identical + canonical-vs-mirror parity green.
18. `pnpm fallow:brief` clean (no stale-ignore flag on `writeToAllSkills`).

## Success Criteria

- [ ] Canonical `tools/learning-loop-mastra/skills/{learning-loop,coordination-gate}/SKILL.md` exist.
- [ ] `pnpm skills:sync` idempotent; one canonical edit → 3 byte-identical mirrors; post-fan-out runtime parity check green.
- [ ] `skills-mirror-parity.test.js` green (byte-identity preserved); contract green ×3.
- [ ] **Canonical-vs-mirror parity invariant test** (F3) green — direct canonical tamper is detected.
- [ ] **Partial-fan-out failure** (F5) → `sync-skills` exits non-zero + names the divergent surface (no silent 2-of-3 success).
- [ ] Narrow gate rule blocks `tools/learning-loop-mastra/skills/**` without `.loop-preflight-skills`; `BOUND_ARTIFACTS` unchanged; rule does NOT match `tools/**` broadly.
- [ ] `surfaces.js` tmp path is pid-suffixed + `finally`-cleaned (F15); no `.tmp` leak on simulated `renameSync` failure.
- [ ] `writeToAllSkills` `fallow-ignore` removed (real consumer); `pnpm fallow:brief` clean.
- [ ] Authoring path documented: edit canonical → `pnpm skills:sync` → `meta_state_log_change`.

## Risk Assessment

- **"Materializer must be the only write path — enforced by the gate" (original claim) was FALSE (red-team F3):** the gate only proves preflight was done, not that the write went through the materializer, and the parity test only compared mirrors. **Now enforceable** via the canonical-vs-mirror parity invariant (detection) + the gate (preflight). Optional hardening (not required for v1): a distinct `.loop-preflight-skills-canonical` marker + `surface` enum constraint so canonical writes require a separate unlock from mirror writes, shrinking the 30-min combined-unlock window. Defer unless the canonical-vs-mirror invariant proves insufficient.
- **Partial-fan-out divergence** (F5) — `surfaces.js:11-14` disclaims cross-surface transactions; `checkMirrorPresence` `count >= 2` masks a single failed surface at the contract layer. Mitigated by the post-fan-out runtime parity check in `sync-skills.mjs` (fails loudly, names the divergent surface). Document: the contract is NOT the divergence backstop for internal skills; `sync-skills`'s parity check + the parity test are.
- **`surfaces.js` is shared core** (shipped by 260707-0114) — the F15 fix (pid-suffixed tmp + `finally` cleanup) is narrow and backward-compatible (same return shape). It benefits all `writeToAllSurfacesSection` callers, not just `writeToAllSkills`. Verify the existing `writeToAllSurfaces`/coordination callers still pass (they're in the regression gate).
- **Canonical dir not a `contract.js` discovery path** (scout: only `mastra-code` has `skill_discovery_paths`, listing `.mastracode` + `.claude`). The canonical source is an *authoring* dir; the contract validates materialized mirrors, not the canonical. `checkMirrorPresence` (contract.js:239-251) hardcodes `[".claude",".factory",".mastracode"]` — the canonical is NOT counted. Verify contract stays green in the Regression Gate; no change expected.
- **`fallow` stale-ignore** — removing the `fallow-ignore-next-line` on `writeToAllSkills` is required once it has a consumer, else `pnpm fallow:gate` flags a stale ignore. Verify `pnpm fallow:brief` clean post-phase.
- **.gitattributes / merge drivers** — the canonical dir is a fresh path; check `.gitattributes` for merge-driver patterns that should apply. Confirm no special wiring is expected for canonical SKILL.md (likely default text driver).
