---
phase: 2
title: "Implement normalize + self-healing sync integration"
status: completed
priority: P1
effort: "4-6h"
dependencies: [1]
---

# Phase 2: Implement normalize + self-healing sync integration

## Overview

Make Phase 1's red tests green. Add a shared `skills-lib.mjs` (policy table + pure `normalizeManifest` + the helpers both scripts share), a `normalize-skills.mjs` CLI wrapper, and fold `normalizeManifest` into `sync-skills.mjs` so the existing `pnpm skills:sync` auto-heals the manifest before fan-out. DRY refactor: `sync-skills.mjs`'s inline `sha256`/`SURFACES`/`findDetectedSurface` move to `skills-lib.mjs` and are imported back.

## Requirements

- Functional: `tools/scripts/skills-lib.mjs` exports `SURFACES`, `sha256`, `findDetectedSurface` (moved from sync), `EXTERNAL_POLICY` (the loop-policy table for external skills' extended fields), and `normalizeManifest(parsed, repoRoot) → { manifest, changed }` (pure: takes a parsed manifest + root for hash derivation, returns the normalized manifest + a `changed` boolean; no file I/O for the manifest itself — the caller writes).
- Functional: `tools/scripts/normalize-skills.mjs` is a CLI wrapper: read `skills-lock.json` → `normalizeManifest` → write back only if `changed` (idempotent, atomic temp+rename matching `writeToAllSkills` discipline) → exit 0 (normalized/no-op) or 2 (malformed manifest, same fail-closed posture as `sync-skills.mjs:60-72`). Positional `argv[2]` root arg (for fixtures), defaulting to repo root — same pattern as `sync-skills.mjs:38-40`.
- Functional: `sync-skills.mjs` calls `normalizeManifest(parsed, repoRoot)` right after `readManifest()`; if `changed`, writes the normalized manifest back before processing, then proceeds to fan-out. The operator's existing `pnpm skills:sync` now heals the manifest in the same step (self-healing — no new manual step post-npx).
- Functional: `package.json` gains `"skills:normalize": "node tools/scripts/normalize-skills.mjs"`.
- Non-functional: `normalizeManifest` is surgical — it re-extends ONLY external entries that match `EXTERNAL_POLICY` (by name); internal entries and `version` are preserved verbatim; unknown externals are left as-is. It never drops fields npx wrote that the loop doesn't own (it only adds/restores loop-owned fields + `hash`).

## Architecture

- **`EXTERNAL_POLICY` table (in `skills-lib.mjs`):**
  ```js
  const EXTERNAL_POLICY = {
    mastra: {
      source: "mastra-ai/skills",
      sourceType: "npx-skills-cli",
      delivery: "npx-per-runtime+fanout-undetected",
      skillPath: "skills/mastra/SKILL.md",
      targets: [".claude", ".factory", ".mastracode"],
      maturity: null,
      external: true,
      // hash: derived in normalizeManifest (not policy)
    },
  };
  ```
  Adding a 2nd external skill = one entry. Policy is the source of truth for loop-owned extended fields; npx's contribution is the installed files (read to derive `hash`).
- **`normalizeManifest` hash derivation (Q1-branched per Phase 1 probe):**
  - **If probe confirmed `computedHash === sha256(SKILL.md)`:** `hash = entry.computedHash` (copy). No surface scan.
  - **Else (fallback):** scan surfaces for a real-dir `skills/<name>/SKILL.md` whose sha256 matches `entry.computedHash`; set `hash` to that sha256. If no surface matches `computedHash`, fail loudly (malformed — the detected copy and the lockfile disagree). If `computedHash` is absent entirely, derive `hash = sha256(<detected surface>/skills/mastra/SKILL.md)` via `findDetectedSurface`-by-shape (real dir, not symlink) — but see Q2: shape-only detection is ambiguous when multiple surfaces have real copies, so this last branch requires exactly one real-dir copy (fresh `npx add`) or fails loudly for the multi-real-copy case (operator runs `pnpm skills:sync` which fans out first, then re-normalize).
  - Encode the decided branch in `normalizeManifest`; document the others as guarded fallbacks.
- **External entry replacement:** for each name in `EXTERNAL_POLICY` present in `manifest.skills`, replace the entry with `{ ...EXTERNAL_POLICY[name], hash: derivedHash }`. Full replacement from policy for external entries (loop owns the shape); npx's non-loop fields (`computedHash` etc.) are not preserved on the external entry — the loop's v2 schema is canonical for externals. (Rationale: npx's fields exist to serve npx; the loop's trust anchor is the v2 shape. If a future need to keep npx fields arises, add a passthrough list then — YAGNI now.)
- **Internal entry + `version` preservation:** `normalizeManifest` returns a new manifest object where `version` is forced to `2` (restore if dropped) and every non-policy entry is shallow-copied verbatim. No mutation of the input.
- **sync-skills integration:** after `readManifest()`, call `normalizeManifest(parsed, repoRoot)`; if `changed`, write the normalized manifest back (atomic write) before the per-skill loop. Log `[sync-skills] normalized skills-lock.json (restored N external entr(y|ies))`. Then proceed as today.
- **DRY refactor of sync-skills:** move `sha256`, `SURFACES` import (already imported from `core/surfaces.js` — verify `SURFACES` source; sync imports `SURFACES` from `../learning-loop-mastra/core/surfaces.js` at line 28; `skills-lib.mjs` should re-export from the same source, NOT redefine), and `findDetectedSurface` into `skills-lib.mjs`; `sync-skills.mjs` imports them back. `writeToAllSkills` stays imported from `core/surfaces.js` in both. The existing `sync-skills.test.js` suite is the refactor guard.

## Related Code Files

- Create: `tools/scripts/skills-lib.mjs` (shared helpers + `EXTERNAL_POLICY` + `normalizeManifest`)
- Create: `tools/scripts/normalize-skills.mjs` (CLI wrapper)
- Modify: `tools/scripts/sync-skills.mjs` (import `normalizeManifest` + helpers from `skills-lib.mjs`; call normalize after `readManifest`; DRY refactor of `sha256`/`findDetectedSurface`)
- Modify: `package.json` (add `"skills:normalize"` script alongside `"skills:sync"`)
- Read-only context: `tools/learning-loop-mastra/core/surfaces.js` (`SURFACES`, `writeToAllSkills` — the canonical source for these), `tools/learning-loop-mastra/__tests__/legacy-mcp/sync-skills.test.js` (refactor guard), `skills-lock.json` (v2 target shape)

## Implementation Steps (TDD — Implementation)

1. Create `tools/scripts/skills-lib.mjs` with `SURFACES` (re-exported from `core/surfaces.js`), `sha256`, `findDetectedSurface` (moved verbatim from `sync-skills.mjs:93-112`), `EXTERNAL_POLICY`, and `normalizeManifest(parsed, repoRoot)` implementing the Q1-decided hash-derivation branch + the surgical replace/preserve rules.
2. Refactor `tools/scripts/sync-skills.mjs`: remove the inline `sha256` + `findDetectedSurface`; import them from `skills-lib.mjs`; add the `normalizeManifest` call after `readManifest()` with the write-back-on-`changed` step. Keep `writeToAllSkills` import as-is.
3. Create `tools/scripts/normalize-skills.mjs` CLI: positional `argv[2]` root (default repo root via `__dirname` like sync), read manifest (reuse the same fail-closed shape guards as `sync-skills.mjs:44-73`), call `normalizeManifest`, atomic write-back if `changed`, exit codes 0/2.
4. Add `"skills:normalize": "node tools/scripts/normalize-skills.mjs"` to `package.json` next to `"skills:sync"`.
5. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/normalize-skills.test.js` → GREEN (Phase 1 red tests now pass).
6. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/sync-skills.test.js` → GREEN (refactor guard; no behavior change in fan-out).
7. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/skills-mirror-parity.test.js` → GREEN (F10/F6 unaffected on the committed, already-normalized manifest).
8. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/skills-manifest.test.js` → GREEN (v2 shape intact).
9. **Self-heal verification (fixture):** build a clobbered fixture, run `node tools/scripts/sync-skills.mjs <fixture-root>`, assert (a) the fixture's `skills-lock.json` is now the restored v2 shape AND (b) `mastra` was fanned out to all 3 surfaces (the existing fan-out path, now preceded by normalize). Add this as a test in `normalize-skills.test.js` or `sync-skills.test.js` (a "sync auto-normalizes" test).
10. **Gate check (Risk: write-gate interaction):** run `mastra_gate_check("pnpm skills:normalize")` and `mastra_gate_check("pnpm skills:sync")`. If either is blocked, add a preflight-delegating exception mirroring the `skills-lock.json` write-gate rule's delegation pattern, OR document that the operator invokes these outside the gate. Record the decision in the phase report.
11. **Runtime-agnostic audit:** run `check_runtime_agnostic({feature_path:"tools/scripts/skills-lib.mjs"})`. `tools/scripts/` is repo-root build tooling (not `tools/learning-loop-mastra/{tools,hooks,schemas}`), so it likely falls outside the 6-item rule's scope — record the tool's verdict (pass / out-of-scope) in the phase report. If out-of-scope, note why (script is not a runtime-surface feature).
12. Run `pnpm test:iter` → GREEN (full suite, no regressions).

## Success Criteria

- [x] `skills-lib.mjs` exports `normalizeManifest` (pure, no manifest file I/O) + the shared helpers; `EXTERNAL_POLICY` covers `mastra`.
- [x] `normalize-skills.mjs` CLI is idempotent (no-op on already-normalized) and fail-closed on malformed manifests (exit 2).
- [x] `sync-skills.mjs` calls `normalizeManifest` after `readManifest()`, writes back on `changed`, then fans out (self-heal).
- [x] `package.json` has `skills:normalize`.
- [x] Phase 1's `normalize-skills.test.js` is GREEN; `sync-skills.test.js` is GREEN after the DRY refactor.
- [x] Fixture-level self-heal test passes (clobbered manifest → `sync-skills` → restored manifest + 3-surface fan-out).
- [x] `pnpm test:iter` GREEN.
- [x] Gate-check decision recorded (normalize/sync not blocked, or preflight delegation added).
- [x] `check_runtime_agnostic` verdict recorded.

## Risk Assessment

- **DRY refactor breaks sync.** Mitigation: `sync-skills.test.js` (existing fixture suite) is the guard; run it immediately after the extract (step 6) before touching anything else.
- **Hash-derivation fallback ambiguity (Q2).** The shape-only fallback (when `computedHash` is absent) is ambiguous for multi-real-copy states. Mitigation: the fallback requires exactly one real-dir copy or fails loudly; the operator's actual flow (`npx add` then `sync`) keeps `computedHash` present, so the copy branch is the primary path and the fallback is a rare-edge fail-loud.
- **Write-gate blocks the healing scripts.** Mitigation: step 10 gate-check + preflight delegation if needed; normalize is safe-by-construction (idempotent, restores loop-owned fields only).
- **External entry full-replacement drops a field the operator wanted npx to keep.** Mitigation: YAGNI — no such field is known; add a passthrough allowlist only if a real need appears. Documented in phase report.