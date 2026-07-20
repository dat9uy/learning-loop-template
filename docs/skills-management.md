# Skills management

This doc is the canonical user-facing reference for managing skills under the loop. It covers the two editing paths (canonical authoring + provider install) and the post-edit recovery flow. For the loop's invariant on the canonical-vs-mirror parity contract, see `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-mirror-parity.test.js`.

## Skill kinds

The loop recognizes three skill kinds via `skills-lock.json`:

| Kind | Authoritative source | Examples |
|------|---------------------|----------|
| Loop-maintained (internal) | `tools/learning-loop-mastra/skills/<name>/SKILL.md` (canonical) | `learning-loop`, `coordination-gate` |
| External | Provider install + manifest trust anchor | `mastra` (npx) |
| Unknown | Manifest entry, no canonical source, no policy replacement | (left untouched by normalize) |

## Editing paths

### A. Edit a loop-maintained skill

```
1. gate_mark_preflight(surface: "skills")
2. Edit tools/learning-loop-mastra/skills/<name>/SKILL.md (canonical)
3. pnpm skills:sync                 # fans out to .claude/.factory/.mastracode
4. meta_state_log_change(...)       # record the change in the meta-state registry
```

The preflight marker unlocks writes to canonical-source paths for 30 minutes (gate rule from `core/evaluate-write-gate.js`). `pnpm skills:sync` is the fan-out materializer — it copies byte-identically to all 3 surfaces via `writeToAllSkills`. Idempotent (re-run = no diff when mirrors already match canonical).

### B. Add or update an external skill (`npx skills`)

```
1. npx skills add mastra-ai/skills --copy     # or: npx skills update mastra
2. pnpm skills:sync                           # auto-normalizes + fans out
```

`npx skills` is the provider CLI; it owns `skills-lock.json` and rewrites the `mastra` entry to its native schema on every `add`/`update`. Without the next step, the loop's manifest-driven exclusion (`external:true`) and the F6 hash trust anchor (`manifest.skills.mastra.hash === sha256(SKILL.md)`) are dropped — contract `listLoopMaintainedSkills` would re-enumerate `mastra` and F10/F6 fail.

`pnpm skills:sync` auto-heals this by running `normalizeManifest` in-process before fan-out: the `external:true` / `delivery` / `targets` / `maturity` / `sourceType` / `source` fields are restored from the policy table at `tools/scripts/skills-lib.mjs#EXTERNAL_POLICY`, and the `hash` is re-derived from the most-recently-written `<surface>/skills/mastra/SKILL.md` (the surface `npx` just wrote to). Then fan-out closes any drift on `.factory` + `.mastracode` like in path A.

## Standalone restore

If you want to restore the manifest without re-running fan-out — for example to recover from a hand-edit that bypassed the gate, or to roll back a partial `npx` failure — run:

```
pnpm skills:normalize
```

This is the same `normalizeManifest` that `pnpm skills:sync` runs internally, exposed as a standalone CLI. Idempotent (re-run on an already-normalized manifest = no-op, no mtime bump).

## What NOT to do

- **Do NOT hand-edit `skills-lock.json`.** The write-gate blocks ad-hoc edits to the lockfile; `pnpm skills:normalize` is the sanctioned restore. The gate's purpose is to prevent ad-hoc clobbering; normalize IS the sanctioned anti-clobber.
- **Do NOT run `npx skills add/update mastra-ai/skills` without immediately following it with `pnpm skills:sync`.** Between those two commands, the manifest is in the clobbered state and F10/F6 + the contract fail.
- **Do NOT delete `<surface>/skills/<name>/SKILL.md` on a single surface.** `pnpm skills:sync` self-heals deleted mirrors (F13), but a missing detected surface after `npx` is a different failure mode — call `pnpm skills:sync` and check the output for `no-detected-copy` before re-running `npx`.

## Failure-mode quick reference

| Symptom | Cause | Recovery |
|---------|-------|----------|
| `listLoopMaintainedSkills` enumerates `mastra` (contract fails with `maturity-not-declared`) | `npx skills` clobbered the manifest; `external:true` is gone | `pnpm skills:sync` (auto-normalizes) |
| F10 / F6 parity fails | `manifest.skills.mastra.hash` no longer matches installed SKILL.md, or `external:true` is gone | `pnpm skills:sync` |
| F11 / F12 cross-surface byte-identity fails | A runtime surface has stale mastra content from before fan-out | `pnpm skills:sync` |
| `[sync-skills] FAIL mastra: no-detected-copy` | `<runtime>/skills/mastra/SKILL.md` was deleted or never installed | Re-run `npx skills add mastra-ai/skills --copy` for the detected runtime, then `pnpm skills:sync` |
| `[normalize-skills] FATAL: normalize mastra: no real-dir SKILL.md found` | All 3 surfaces' mastra trees were deleted; normalize can't derive a hash | Same as above |

For the empirical npx clobber shape that motivated this design (the Phase 1 probe), see `plans/reports/probe-260720-npx-skills-clobber-shape.md`. For the meta-state finding this doc resolves, see the entry at `id: meta-260720T1451Z-npx-skills-cli-clobbers-skills-lock-json-on-every-npx-skills`.
