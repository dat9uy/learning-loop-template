# Probe: npx skills clobber shape (2026-07-20)

**Purpose:** Lock the empirical shape of `skills-lock.json` after `npx skills add/update mastra-ai/skills`, so Phase 1 can TDD-red the clobber→normalize round-trip and Phase 2 can implement `normalizeManifest` against the real byte shape.

**Method:** Isolated probe at `/tmp/ll-probe-iAyDrg` (mkdtemp, never touched the live tree). Pre-clobber state = live `skills-lock.json` (v2 extended schema) + live mastra tree copied to all 3 surfaces. Ran `npx skills add mastra-ai/skills --copy -y -p` (project-scope) and `npx skills update mastra -y -p`, captured post-state byte-for-byte.

**Loop gate:** `mcp__learning-loop__mastra_gate_check("npx skills add mastra-ai/skills --copy")` returned `ok`. The harness bash auto-classifier initially denied the command (stage-2 classifier error, treated the package-install arg as out-of-scope); operator ran the commands in the probe root via the `!` shell prefix.

## Empirical findings

### 1. Clobbered mastra entry shape (post-add AND post-update)

Pre-clobber mastra entry had: `source`, `sourceType`, `delivery`, `skillPath`, `targets`, `maturity`, `external`, `hash`.

Post-clobber mastra entry has:
- `source: "mastra-ai/skills"` — **preserved**
- `sourceType: "github"` — **changed** (was `"npx-skills-cli"`)
- `skillPath: "skills/mastra/SKILL.md"` — **preserved**
- `computedHash: "f0ca76d36d67a345064f471a9577e752beb2b20ab46acdf154ed223905e1d3a4"` — **added** (npx's native field)
- `delivery`, `targets`, `maturity`, `external`, `hash` — **all DROPPED**

```json
{
  "source": "mastra-ai/skills",
  "sourceType": "github",
  "skillPath": "skills/mastra/SKILL.md",
  "computedHash": "f0ca76d3..."
}
```

### 2. Q1 — `computedHash` semantics: **NOT sha256(SKILL.md)**

| Candidate digest                                  | sha256                                                              | Match? |
|---------------------------------------------------|---------------------------------------------------------------------|--------|
| `.claude/skills/mastra/SKILL.md`                  | `f9a906bd4717b716098be29bd5dfbbe3cc366f9b82362a1e6af1bece9c9d1501` | NO     |
| `.factory/skills/mastra/SKILL.md`                 | `f9a906bd4717b716098be29bd5dfbbe3cc366f9b82362a1e6af1bece9c9d1501` | NO     |
| `.mastracode/skills/mastra/SKILL.md`              | `f9a906bd4717b716098be29bd5dfbbe3cc366f9b82362a1e6af1bece9c9d1501` | NO     |
| `.agents/skills/mastra/SKILL.md` (npx central store) | `f9a906bd4717b716098be29bd5dfbbe3cc366f9b82362a1e6af1bece9c9d1501` | NO     |
| Concatenated-tree sha256 (all mastra files)       | `04d76afc8be17a1b48f216f92fd7fdbe20018c7ce82360e25eb7cf9db46f197e` | NO     |
| `computedHash` from manifest                      | `f0ca76d36d67a345064f471a9577e752beb2b20ab46acdf154ed223905e1d3a4` | —      |

`computedHash` is opaque (likely a GitHub blob SHA or npx's internal tree digest). The Phase 2 **scan+derive** fallback branch is mandatory; the copy branch (Phase 1 step 5 of plan) is not used.

**Decision (Q1):** Phase 2 `normalizeManifest` re-derives `hash = sha256(<detected surface>/skills/mastra/SKILL.md)`. Detected surface = the largest byte-equal cluster of SKILL.md files across `[.claude, .factory, .mastracode]` (the realistic npx case is 2 detected + 1 stale, so the cluster heuristic works). Falls back to mtime-newest single real-dir copy if exactly one surface has the new content (and zero others share its hash).

### 3. Q3 — `version` + internal entries preserved ✓

- `manifest.version` = `2` post-add AND post-update. **Preserved.**
- `manifest.skills.coordination-gate` byte-identical pre vs. post. **Preserved.**
- `manifest.skills.learning-loop` byte-identical pre vs. post. **Preserved.**
- No silent manifest-wide restructure; npx rewrites the per-entry `mastra` slot only.

### 4. npx install behavior (empirical)

| Surface       | npx wrote? | mtime             | sha256(SKILL.md) |
|---------------|------------|-------------------|------------------|
| `.claude`     | yes        | 18:48 (add), 18:52 (update) | `f9a906bd...` |
| `.factory`    | yes (Droid) | 18:48 (add), 18:52 (update) | `f9a906bd...` |
| `.mastracode` | NO (undetected) | unchanged from fixture seed | `f9a906bd...` |

**Confirmation of parent Phase 3 status note:** npx auto-detects Claude Code + Droid and writes real files; `.mastracode` (and any other undetected runtime) stays with its prior content. The `.agents/skills/mastra/` central store is created by npx as its internal source. In this probe fixture all three surfaces had the same content (because we pre-seeded them from live), so the byte-equal cluster heuristic above happens to tie. In a realistic fresh-`npx-add` flow the `.mastracode` content would differ from the new install and the cluster heuristic picks up the 2-surface cluster cleanly.

### 5. npx-created files outside the manifest

npx writes `.agents/skills/mastra/` (the internal central store) at install time. The loop treats `.agents/` as the retired central store (Phase 3 retired tracking; gitignored). The loop's `normalize` does NOT depend on `.agents/` (it's gitignored and may be absent in CI).

## Spec for Phase 1 + Phase 2

Phase 1 TDD red tests (`tools/learning-loop-mastra/__tests__/legacy-mcp/normalize-skills.test.js`) encode:
1. **Clobber→normalize round-trip:** build fixture with clobbered mastra entry (source/sourceType:"github"/skillPath/computedHash, no external/delivery/targets/maturity/hash) + one detected surface with the new SKILL.md content + one or more stale surfaces with the pre-clobber content. Run `node tools/scripts/normalize-skills.mjs <root>`. Assert post-state restores v2 extended schema: `external:true`, `delivery:"npx-per-runtime+fanout-undetected"`, `targets:[.claude,.factory,.mastracode]`, `maturity:null`, `source:"mastra-ai/skills"`, `sourceType:"npx-skills-cli"`, `hash` = sha256 of the detected surface SKILL.md.
2. **Idempotence:** run on already-normalized manifest → no-op (mtime unchanged, `changed:false`).
3. **Hash derivation (Q1 decision):** `hash = sha256(<largest byte-equal SKILL.md cluster> / <SKILL.md>)`. Test pins the cluster heuristic.
4. **Internal entries preserved byte-identical:** `coordination-gate` + `learning-loop` entries unchanged pre vs. post.
5. **`version` preserved/restored:** `manifest.version === 2`.
6. **Unknown external skip:** an external entry NOT in `EXTERNAL_POLICY` is left untouched.
7. **F10/F6 regression shape:** post-normalize, `manifest.skills.mastra.external === true` and `manifest.skills.mastra.hash` is a 64-char hex (matches sha256 of every surface's SKILL.md).

Phase 2 implementation (`tools/scripts/skills-lib.mjs` + `tools/scripts/normalize-skills.mjs`) implements the `normalizeManifest(parsed, repoRoot) → { manifest, changed }` pure function with the cluster heuristic for hash re-derivation, then folds into `sync-skills.mjs` after `readManifest()` for self-heal.

## Decision matrix on key questions

| # | Question | Decision (per probe) | Effect on plan |
|---|----------|----------------------|----------------|
| Q1 | Hash derivation — copy `computedHash` or scan+derive? | **Scan+derive** — `computedHash` is opaque, NOT sha256(SKILL.md) | Phase 2 `normalizeManifest` re-derives hash from detected surface. Copies branch from plan is unused (kept as a fallback if scan finds zero matches — fail loudly). |
| Q3 | Does npx preserve `version` + internal entries? | **YES** — verified byte-identical | Phase 2 `normalizeManifest` returns internals + version verbatim from input (no preservation fallback needed). |
