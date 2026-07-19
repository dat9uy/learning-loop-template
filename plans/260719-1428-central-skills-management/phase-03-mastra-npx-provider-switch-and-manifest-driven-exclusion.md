---
title: "Phase 3: Mastra npx provider switch and manifest-driven exclusion"
status: in-progress
---

> **Status note (2026-07-19):** Contract-side shipped (c2fa24e + review fixes): manifest-driven exclusion with F8/F9 failure modes, `skills-lock.json` gated, load-bearing parity tests. **Deferred remainder (operator Q4):** npx round-trip, `.agents` retirement, `.mastracode` gap closure, recursive fan-out — gated on ledger-event `npx-skills-mastra-roundtrip-2026-07-19` in `runtime-state.jsonl` (corrected row appended 2026-07-19T11:55Z; activates F11/F12 when a permitted sandbox appends per-runtime `metadata.hashes`).

# Phase 3: Mastra npx provider switch and manifest-driven exclusion

## Overview

Switch the external `mastra` skill from the custom `.agents/skills/mastra` + symlink mechanism to the provider's `npx skills` flow (**Branch B** — Q1 resolved: npx has no custom-target flag, so per-runtime real files via `npx skills add --copy`, not a central `.agents` install). Replace the contract's `isSymbolicLink()` external-exclusion with manifest-driven `external:true` exclusion (required: once mastra is real files, `isSymbolicLink()` no longer excludes it). Retire `.agents/skills/mastra` as the source. Close the `.mastracode` gap. **Builds on plan 260630 (Phase E Plan 4), which is SHIPPED** (verified on disk: `contract.js:8,30-42,81-82` carry the Phase-4 amendments; `checkHookDeclarativeConfig`/`checkSettingsNoBypass` at `~495-569`; the `skill_discovery_paths` fallback at `contract.js:280-288`; `.mastracode/{mcp,hooks,settings,database}.json` exist). **Verification-gated** on preflight probes (Q1b runtime detection; red-team F13: npx symlink-replacement behavior + `--copy` directory structure).

## Requirements

- Functional: mastra delivered via `npx skills add mastra-ai/skills --copy`; `.mastracode/skills/mastra` present (test-enforced); `.agents/skills/mastra` retired as source; manifest-driven exclusion in `contract.js` (with explicit failure modes, no misleading fallback); contract + parity tests updated and green.
- Non-functional: contract green ×3; `npx skills update mastra` round-trip keeps parity/contract green; no concurrent `contract.js` edit needed (260630 already landed — the two edits target separate functions: `listLoopMaintainedSkills:215-237` vs the hook check `~495-569`).

## Architecture

- **Exclusion change** (`contract.js:215-237` `listLoopMaintainedSkills`): replace `if (entry.isSymbolicLink()) continue;` (L230) with manifest-driven exclusion. **No module-level cache (red-team F7)** — `contract.js` currently has zero module-level mutable state (every check reads fresh via `readJsonSafe` at L88-96); add a cache would be gold-plating that risks test-isolation staleness across vitest cases sharing a process. Use `readJsonSafe(manifestPath)` per `listLoopMaintainedSkills` call, matching the module's existing pattern. New exclusion logic, with **explicit failure modes (red-team F8, F9)**:
  - If the manifest fails to load/parse → fail with an explicit `reason: "manifest-unreadable"` (NOT a misleading `maturity-not-declared` on mastra) — do NOT silently fall back to `isSymbolicLink()` (that would hide manifest corruption).
  - For each enumerated real-dir skill: if `manifest[entry.name]?.external === true` → skip (excluded). If the skill is NOT in the manifest at all → fail with `reason: "skill-not-in-manifest"` (defense-in-depth: a real-dir skill the manifest doesn't know about is a contract violation, not silently enumerated). This is stricter than the old symlink check and pairs with the `skills-lock.json` gate (F4) so an attacker can't plant an unlisted skill.
  - Keep `isDirectory()` + `SKILL.md`-exists checks.
- **Delivery** (Q1b-branched, **red-team F13 probes**):
  - Preflight probe 1 (runtime detection): `npx skills add mastra-ai/skills --list` (or `--help`) → which agents does npx auto-detect?
  - Preflight probe 2 (npx symlink-replacement, **F13**): probe npx's behavior against an existing symlink in a fixture dir — does it (a) atomically replace the symlink with a real file, (b) write THROUGH the symlink (→ dangling after `.agents` deletion), or (c) fail? Document the actual behavior; choose the install order accordingly.
  - Preflight probe 3 (npx `--copy` directory structure, **F13**): after `npx skills add --copy`, assert the resulting tree matches the current `.agents/skills/mastra/` shape (`SKILL.md` + `references/` + `scripts/`) — npx may flatten/rename/restructure; verify before retiring `.agents`.
  - Detected runtimes: `npx skills add mastra-ai/skills --copy -a <agent>` → real files in `<runtime>/skills/mastra/`.
  - Undetected runtimes (likely `.mastracode`, possibly `.factory`): the materializer fans out real files from a detected runtime's npx copy (e.g. `.claude/skills/mastra/`) → `.factory`/`.mastracode/skills/mastra/`. **Phase 3 extends `sync-skills.mjs` to a recursive tree-walk** (the `references/` + `scripts/` subdirs exist in mastra — verified on disk; Phase 2's single-file walk does not suffice here). Reuses `writeToAllSkills` per-file; mastra stays `external:true` so it is not loop-maintained despite real files.
  - Retire `.agents/skills/mastra`: after all 3 runtimes have real files, remove `.agents/skills/mastra/` and the `.claude`/`.factory` symlinks (replaced by real files). **Order per probe 2's result** (install real files first, then remove — but if probe 2 shows npx writes through symlinks, delete the symlinks BEFORE npx to avoid dangling links).
- **Manifest** (Phase 1 mastra entry updated): `source:"mastra-ai/skills"`, `sourceType:"npx-skills-cli"`, `delivery:"npx-per-runtime+fanout-undetected"`, `external:true`, `targets:[".claude",".factory",".mastracode"]`, `hash` of the npx copy (load-bearing — Phase 3 materializer verifies it before fan-out, per F6).

## Related Code Files

- Modify: `tools/learning-loop-mastra/interface/contract.js:215-237` (`listLoopMaintainedSkills` exclusion → manifest-driven, with `manifest-unreadable` + `skill-not-in-manifest` failure modes, no cache) + `:269-336` (`checkSkillSpec` if it relies on symlink shape)
- Modify: `tools/learning-loop-mastra/interface/__tests__/contract.test.js:962` (**red-team F2 — omitted from original plan**) — the "req 3 excludes the external mastra symlink" test builds a fixture with NO `skills-lock.json`; update it to write a manifest with `mastra.external:true` (or replace the symlink fixture with a real-dir + manifest-external fixture matching the new semantics). Add negative tests: `manifest-unreadable` → contract fails with that reason (not `maturity-not-declared`); real-dir skill NOT in manifest → `skill-not-in-manifest`.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-mirror-parity.test.js:90-128` (**red-team F10 — the original "update" was vacuous**: L108 `assert.ok(true)` passes regardless; L120 loop guard dies post-Phase-3) — replace L90-128 with a **load-bearing** assertion: read `skills-lock.json`, assert `manifest.skills.mastra.external === true`, and assert `listLoopMaintainedSkills(<surface>/skills)` does NOT include `mastra`. (Delete the dead symlink-allowance blocks rather than cosmetically renaming them.)
- Modify: `skills-lock.json` (mastra entry: `sourceType:"npx-skills-cli"`, `delivery:"npx-per-runtime+fanout-undetected"`, `external:true`, `hash` of npx copy)
- Modify: `tools/scripts/sync-skills.mjs` (recursive tree-walk for mastra `references/` + `scripts/`; fan-out to undetected runtimes from a detected copy; **hash-verify before fan-out, F6**; detected-copy treated as read-only source; missing detected copy → explicit failure)
- Modify: `tools/learning-loop-mastra/core/evaluate-write-gate.js` (**red-team F4 — `skills-lock.json` is the new trust anchor but ungated**) — add a `WRITE_GATE_RULES` entry matching `skills-lock.json` (repo root), preflight-delegating (reuse `.loop-preflight-skills` or a manifest-specific marker). Do NOT touch `BOUND_ARTIFACTS`.
- Delete: `.agents/skills/mastra/` (after retirement); `.claude/skills/mastra`, `.factory/skills/mastra` symlinks (replaced by real files)
- Create: `.mastracode/skills/mastra/` (real files; **presence test-enforced, red-team F11**)
- Create/extend: `tools/learning-loop-mastra/__tests__/legacy-mcp/sync-skills.test.js` (Phase 3 external-path tests, red-team F13: idempotence w/ subdirs, detected-copy read-only, missing-copy → fail; **mastra cross-surface byte-identity parity test, F12**; `.mastracode` presence test, F11)
- Read-only context: `contract.js:22-43` (RUNTIMES, mastra-code `skill_discovery_paths` — already shipped by 260630), `:181` (`VALID_MATURITY`), `:239-251` (`checkMirrorPresence` ≥2 surfaces), `:280-288` (the 260630 `skill_discovery_paths` fallback Phase 3 must compose with)

## Implementation Steps (TDD)

**Tests Before**
1. Pin current mastra-symlink state: capture `skills-mirror-parity.test.js:90-109` + `:111-128` (currently vacuous — L108 `assert.ok(true)`, L120 dead post-Phase-3). Run green. Also pin `contract.test.js:962` (the symlink-exclusion test).
2. Write tests for the NEW exclusion semantics (expect FAIL until refactor):
   - `listLoopMaintainedSkills` excludes `mastra` when `manifest.mastra.external === true`, **regardless of whether mastra is a symlink or a real dir** (test both shapes with fixtures that DO write a `skills-lock.json`).
   - `listLoopMaintainedSkills` still includes `learning-loop` + `coordination-gate` (manifest `external:false`/absent + real dir + `maturity`).
   - **`manifest-unreadable` (F8):** delete/corrupt `skills-lock.json` → contract fails with `reason:"manifest-unreadable"`, NOT `maturity-not-declared`.
   - **`skill-not-in-manifest` (F9):** a real-dir skill NOT in the manifest → contract fails with `reason:"skill-not-in-manifest"` (not silently enumerated).
3. Write the **load-bearing parity-test replacement (F10)**: `manifest.skills.mastra.external === true` + `listLoopMaintainedSkills` excludes mastra (load the manifest; do not rely on the dead symlink blocks).
4. Write **`.mastracode` presence test (F11)** + **mastra cross-surface byte-identity test (F12)**: `existsSync(.mastracode/skills/mastra/SKILL.md)` for all 3 surfaces; mastra's tree byte-identical across all 3 surfaces (a mastra-specific parity test, separate from `LOOP_MAINTAINED_SKILLS` — mastra is external, so it's NOT in that hardcoded list; this test closes the cross-surface drift gap since `npx update` is per-runtime and a forgotten `pnpm skills:sync` would otherwise drift silently).
5. Write Phase 3 **materializer external-path tests (F13)**: idempotence against a fixture mastra tree with `references/` + `scripts/`; detected-copy is read-only (materializer does not write back); missing detected copy → explicit failure (not silent skip).

**Preflight Probes (Q1b + F13 — runtime commands, operator-gated)**
6. Before executing npx: run `mastra_gate_check` on the npx commands; use `workflow_runtime_probe` (stack: nodejs, probe_type: install) + `workflow_prepare_runtime_request` to frame approval; get operator approval before running npx in the sandbox.
7. **Probe 1 (runtime detection):** `npx skills add mastra-ai/skills --list` (and/or `--help`) → which agents npx auto-detects.
8. **Probe 2 (npx symlink-replacement, F13):** in a fixture dir with an existing symlink, run the npx install and observe: replace / write-through / fail. Document the result; choose the retirement order (if write-through, delete symlinks BEFORE npx).
9. **Probe 3 (npx `--copy` structure, F13):** after `npx skills add --copy`, `assert.deepEqual(readdirSync(<runtime>/skills/mastra, {recursive:true}), readdirSync(".agents/skills/mastra", {recursive:true}))` — verify npx preserves `SKILL.md` + `references/` + `scripts/` before retiring `.agents`.

**Refactor**
10. **Contract change (no cache, explicit failures):** `listLoopMaintainedSkills` exclusion → `manifest[entry.name]?.external === true` to skip; manifest-unreadable → `manifest-unreadable`; unlisted real-dir skill → `skill-not-in-manifest`. Use `readJsonSafe` per call. Compose with the existing 260630 `skill_discovery_paths` fallback (L280-288): mastra added via that fallback must still be excluded by manifest `external:true` (verify the fallback doesn't bypass the manifest check).
11. **Delivery (branched on probes):**
    - Detected: `npx skills add mastra-ai/skills --copy -a <detected-agent>` for each detected runtime → real files.
    - Undetected: extend `sync-skills.mjs` to a recursive tree-walk that fans out mastra from a detected copy to undetected runtimes, gated by `manifest.mastra.delivery` containing `fanout-undetected`. **Hash-verify (F6):** compute `sha256` of the detected-copy files and assert match against `manifest.mastra.hash` (or per-file hashes) before fan-out; refuse on mismatch.
12. **Retire `.agents` (order per probe 2):** install real files first (or delete symlinks first if probe 2 shows write-through), then remove `.claude`/`.factory` mastra symlinks + delete `.agents/skills/mastra/`.
13. **Close `.mastracode` gap:** `.mastracode/skills/mastra/` present (real files, via npx if detected or fan-out if not).
14. **Manifest update:** mastra entry → `sourceType:"npx-skills-cli"`, `delivery:"npx-per-runtime+fanout-undetected"`, `external:true`, `hash` of npx copy.
15. **`skills-lock.json` gate (F4):** add the `WRITE_GATE_RULES` entry for `skills-lock.json` (preflight-delegating). The manifest is now a security-critical trust anchor (contract reads it; an attacker who writes to it can plant/unlist skills) — protect at registry-file level.
16. Run new tests — expect PASS.

**Tests After**
17. Round-trip test: `npx skills update mastra` → all 3 surfaces update; **F12 mastra cross-surface parity** + contract green. (If sandbox can't run npx update, document the manual round-trip + assert manifest `hash` refreshes — F6 makes the hash load-bearing so the test re-computes + compares.)
18. End-to-end: manifest query `grep '"maturity": "state-1"' skills-lock.json` returns the escape-hatch inventory (today: 0 internal state-1; mastra external/unclassified). Assert the query is one grep.
19. Assert no `.agents/skills/mastra`; `.claude`/`.factory`/`.mastracode` mastra are real files (not symlinks); manifest `external:true`; contract excludes mastra via manifest (not `isSymbolicLink()`).

**Regression Gate**
20. `node tools/learning-loop-mastra/interface/contract.js claude-code|droid|mastra-code` all exit 0.
21. `pnpm test:iter` green (parity updated — F10 load-bearing + F11 presence + F12 cross-surface; contract — F8/F9 failure modes; contract.test.js — F2 fixture updated; runtime-agnostic; manifest drift + hash-verification F6).
22. `npx skills update mastra` round-trip green (or documented manual equivalent).
23. **260630 composition (no merge needed):** 260630 is shipped. Confirm Phase 3's `listLoopMaintainedSkills` change composes with 260630's `skill_discovery_paths` fallback (L280-288): run `node .../contract.js mastra-code` — mastra must stay excluded (manifest `external:true`) even when the fallback adds it. (The two edits target separate functions — `listLoopMaintainedSkills:215-237` vs `checkHookDeclarativeConfig~495-569` — so no conflict resolution is needed.)

## Success Criteria

- [ ] `listLoopMaintainedSkills` excludes by manifest `external:true` (works for symlink OR real-file mastra); no module-level cache (F7).
- [ ] `manifest-unreadable` (F8) + `skill-not-in-manifest` (F9) explicit failure modes + tests.
- [ ] `contract.test.js:962` fixture updated to write a manifest (F2); negative tests for F8/F9.
- [ ] `skills-lock.json` gated (F4); contract reads it via `readJsonSafe` per call.
- [ ] `npx skills add mastra-ai/skills --copy` populates detected runtimes; npx symlink-replacement (probe 2) + `--copy` structure (probe 3) verified before `.agents` retirement.
- [ ] `sync-skills.mjs` recursive tree-walk fans out mastra to undetected runtimes; hash-verified before fan-out (F6); detected-copy read-only; missing-copy → fail.
- [ ] `.mastracode/skills/mastra` present — **presence test-enforced (F11)**; `.agents/skills/mastra` retired; `.claude`/`.factory` mastra real files.
- [ ] **Mastra cross-surface byte-identity parity test (F12)** green; `npx skills update` round-trip → 3 surfaces update.
- [ ] Parity test L90-128 replaced with load-bearing manifest-external assertion (F10); contract green ×3.
- [ ] Manifest query `maturity: state-1` = one grep (escape-hatch inventory).

## Risk Assessment

- **Q1b / F13 probe failure** — if npx detects only `.claude` (or none), `.mastracode` (and `.factory`) closes via materializer fan-out. Acceptable (mastra stays `external:true`; provenance records `npx-skills-cli` for the detected copy + `fanout-undetected` for the rest). **If npx is blocked in the *current* sandbox (validation Q4 — operator decision): do NOT defer Phase 3 and do NOT fall back to the old `.agents` symlink mechanism.** Instead, record the npx round-trip as a `ledger-event` in `runtime-state.jsonl` via the `runtime_state_record` MCP tool (the established runtime-state mechanism — `runtime-state-record-tool.js` + repo-root `runtime-state.jsonl` + `ledger-event` kind, verified in-session): whichever sandbox *can* run npx executes the add→update round-trip, writes a ledger-event (id, surfaces updated, per-runtime hashes, timestamp), and Phase 3 reads it back via `runtime_state_read` to confirm before marking the round-trip criterion met. This keeps Phase 3 shippable without re-bypassing the provider flow. The Phase 3 probes (runtime detection + symlink-replacement + `--copy` structure) MUST run before any install/retirement — the original plan under-specified npx's behavior.
- **260630 is shipped (red-team F1 corrected the original "pending" premise)** — no concurrent `contract.js` edit, no "merge both in one PR" option needed. The two edits target separate functions. The real coordination question is composition with the `skill_discovery_paths` fallback (L280-288) — verified in the Regression Gate.
- **`npx skills update` clobber** — mastra has no `maturity:`; we add none; npx update writes only its own content. Verify npx does not *require* frontmatter we lack (probe step 7).
- **Parity test `LOOP_MAINTAINED_SKILLS` hardcoded (L19)** — mastra stays OUT of this list (external). The **F12 mastra-specific cross-surface parity test** covers mastra's byte-identity separately (presence + tree-identity, not inside the `LOOP_MAINTAINED_SKILLS` loop). Do not add mastra to `LOOP_MAINTAINED_SKILLS`.
- **`.agents/` boundary semantics (Q5)** — retiring `.agents/skills/mastra` as the *source* does not remove `.agents/` as an external-boundary concept; it just no longer holds the mastra central copy. Verify no other code reads `.agents/skills/mastra` (`grep -rn ".agents/skills/mastra" --include=*.js` → expect zero; scout confirmed `skills-lock.json` is the only reference).
- **Cross-platform symlinks** — Branch B uses real files (no new symlinks); retired `.claude`/`.factory` symlinks are removed. No new cross-platform symlink risk. The F13 probe 2 documents npx's symlink-replacement behavior so the retirement order is safe.
- **Phase 3 steps are non-atomic by default (red-team F14)** — the contract change (step 10), delivery (step 11), and `.agents` retirement (step 12) are COUPLED: after step 12, mastra is a real dir; reverting ONLY step 10 (the `contract.js` change) would restore `isSymbolicLink()` exclusion, but mastra is no longer a symlink → `isSymbolicLink()` is false → mastra is enumerated → fails `maturity-not-declared` → contract breaks. **Mitigation:** land steps 10-14 as ONE atomic commit. Document the revert hazard: a partial revert must revert the entire Phase 3 commit, not individual steps. The F8/F9 explicit failure modes make a half-applied state fail loudly (`manifest-unreadable`/`skill-not-in-manifest`) rather than with a misleading `maturity-not-declared`.
- **`skills-lock.json` as trust anchor (F4)** — Phase 3 makes the contract read it; an ungated manifest allows planting/unlisting skills. The F4 gate (preflight-delegating, in `WRITE_GATE_RULES`) closes this. Pairs with F9 (`skill-not-in-manifest`) so an unlisted planted skill fails the contract even if the gate is bypassed.
