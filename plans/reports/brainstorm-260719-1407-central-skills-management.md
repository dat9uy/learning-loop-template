# Brainstorm: Central Skills Management (external + internal, across runtimes)

**Date:** 2026-07-19 **Status:** consensus (Approach 1) **Scope:** skills only (hooks/coordination + ck:* migration deferred)
**Source request:** "manage external + internal skills in one central place; quantify escape-hatch (State-1) usage; central folder + symlinks to per-runtime folders."
**Decisions locked (operator, 2026-07-19):** Approach 1 · internal = fan-out+materializer (Decision 3 preserved) · mastra = switch to `npx skills`, verify custom-target first · canonical source = neutral `tools/` dir.

---

## Problem statement

Three runtimes (`.claude`, `.factory`, `.mastracode`) each carry a `skills/` surface. Two skill classes coexist:

- **External / provider-managed** — `mastra` (sourced from `mastra-ai/skills`). Currently a custom mechanism: `skills-lock.json` (`sourceType: "github"`) + `.agents/skills/mastra` central copy + symlinks into `.claude` & `.factory`. **`.mastracode` is missing.** Provenance bypasses the provider's intended `npx skills add/update` flow.
- **Internal / loop-maintained** — `learning-loop`, `coordination-gate` (both `maturity: state-2`). Currently **byte-identical real files duplicated ×3 surfaces**, kept in sync by hand; parity test (`skills-mirror-parity.test.js`) is the drift backstop.

Goal: manage both classes from **one central place** with a **unified manifest** that tracks State-1/State-2, provenance, and per-runtime targeting — step-by-step, ck:* deferred, respecting the mastra provider flow, without reversing prior locked decisions.

## Existing machinery (constraints, from scout)

- **State classification already exists** as `maturity: state-1|2|3` SKILL.md frontmatter (injection-determinism-by-maturity). `contract.js::checkSkillSpec` enumerates only `maturity:`-declaring skills as loop-maintained; mastra (no `maturity:`) is excluded. `philosophy.md` defines the 2-axis/3-state trajectory; State is injection×consumption wiring, NOT file location.
- **Decision 3 (plan 260707-0114, operator 2026-07-07, completed):** internal-skill mirror = **write-fanout of byte-identical real files**, parity test as backstop. Symlinks were considered and rejected for loop-maintained skills (red-team #3, symlink-target bypass, accepted boundary: symlinks = external).
- **`listLoopMaintainedSkills` excludes symlinks** (`if (entry.isSymbolicLink()) continue;`). Parity test L111-128 asserts only `mastra` (+ historical `loop-prompt-authoring`) may be a symlink. → Symlinking internal skills breaks contract + 2 tests + reopens red-team #3.
- **Decision 4:** `skill_manage` MCP tool DROPPED. Skill edits are change-logs in `meta-state.jsonl`; no third substrate. Any new manifest/materializer = static file + script, NOT an MCP tool.
- **Write-gate:** blocks `<surface>/skills/**` (needs `.loop-preflight-skills` via `gate_mark_preflight(surface:"skills")`); `.agents/skills/**` ungated (external); `tools/**` ungated today (**Decision 5** deferred `tools/**` gating to Rec 12).
- **Existing fan-out primitive:** `core/surfaces.js` exposes `writeToAllSkills` (from plan 260707-0114 phase 4). Materializer reuses it.
- **Provider flow (verified via mastra.ai/docs/getting-started/build-with-ai):** `npx skills add mastra-ai/skills` / `npx skills update mastra` (agentskills.io CLI; installs into the runtime's configured skill dir → per-runtime real files). **Open: custom-target dir support unverified.**

## Evaluated approaches

| # | Approach | Pros | Cons |
|---|---|---|---|
| 1 | **Manifest-index + origin-keyed delivery** (chosen) | Satisfies all 4 answers; no Decision-3 reversal; aligns with L3-interface centralization trajectory; provider flow respected | Mastra step may need contract change (contingent on npx custom-target) |
| 2 | Minimal: close `.mastracode` gap + sync helper, keep both mechanisms | Smallest; no contract changes | Fails unified-manifest + provider-flow goals |
| 3 | Reverse Decision 3: symlink all skills from central `.agents/skills/` | Max single-source DRY | Reverses locked decision; reopens red-team #3; reworks contract + 2 tests + write-gate; cross-platform symlink risk; marginal gain over #1 |

## Recommended solution (Approach 1)

### A. Unified manifest (extend `skills-lock.json`)
One index over all skills. Frontmatter stays the in-file State source-of-truth (contract validates it); the manifest **mirrors** `maturity` + adds provenance/targeting/delivery. Schema per skill:

```jsonc
{
  "name": "learning-loop",
  "maturity": "state-2",          // mirrors SKILL.md frontmatter (drift-checked by test)
  "source": "local",              // local | github | npx-skills-cli
  "sourceType": "local",
  "delivery": "fanout",            // fanout | symlink | npx-per-runtime
  "canonicalSource": "tools/learning-loop-mastra/skills/learning-loop/SKILL.md", // internal only
  "targets": [".claude", ".factory", ".mastracode"],
  "hash": "<sha256>",             // of canonical source (internal) or upstream (external)
  "external": false               // true ⇒ excluded from loop-maintained enumeration
}
```
A test asserts `manifest.maturity === frontmatter.maturity` to prevent two-source drift. No new MCP tool (Decision 4 honored).

### B. Internal skills — canonical source + fan-out materializer (Decision 3 preserved)
- **Canonical authoring source:** `tools/learning-loop-mastra/skills/<name>/SKILL.md` (new; runtime-agnostic, mirrors the `hooks/universal/` precedent — operator-chosen over `.claude`).
- **Materializer:** `tools/scripts/sync-skills.{mjs,sh}` reads canonical source → reuses `core/surfaces.js#writeToAllSkills` to fan out byte-identical real files to `.{claude,factory,mastracode}/skills/<name>/`. Idempotent (re-run = no diff). Parity test stays the backstop. Contract stays green (real dirs, `maturity:` present). **No symlink, no contract change.**
- **Gating the canonical source (open decision — see Unresolved Q2):** `tools/**` is ungated today. Recommend a **narrow** write-gate extension to cover `tools/learning-loop-mastra/skills/**` only (one glob in `core/bound-artifacts.js`), NOT all of `tools/**` (stays Rec 12 scope). Alternative: leave ungated, enforce materializer-as-only-write-path + a round-trip parity test.

### C. External mastra — switch to provider `npx skills`, verify custom-target first
Verification gate (Unresolved Q1) branches the implementation:

- **Branch A — `npx skills add` supports a custom target dir:** install/update to `.agents/skills/mastra` (central) + symlink all 3 runtimes → `.agents/skills/mastra`. Provider flow respected, central, **no contract change** (mastra stays symlink-excluded). Closes `.mastracode` gap automatically.
- **Branch B — per-runtime only:** `npx skills add mastra-ai/skills` per runtime → real files in each `skills/mastra/`. Requires **contract external-exclusion → manifest-driven**: `listLoopMaintainedSkills` consults manifest `external:true` (not `isSymbolicLink()`). Update parity tests L90-109 + L111-128 ("mastra is symlink" → "mastra is manifest-external"). Retire `.agents/skills/mastra` symlinks. Manifest records `sourceType:"npx-skills-cli"` + per-runtime hash.

Either branch: manifest provenance records the npx source + hash; `npx skills update mastra` becomes the update command; `.mastracode` gap closed.

### D. State axis
`maturity:` frontmatter = in-file source-of-truth (contract-enforced). Manifest = central index mirroring State + provenance/targeting/delivery. "How much escape hatch" = query the manifest: `maturity: state-1` count. Today: 0 loop-maintained state-1 (both internal are state-2); mastra is external (unclassified). The manifest makes this query one grep.

## Migration order (smallest-first; each step independently shippable; ck:* deferred)

| Step | What | Risk | Tests to keep green |
|---|---|---|---|
| 1 | Manifest schema: extend `skills-lock.json` to unified shape; backfill entries for `learning-loop`, `coordination-gate`, `mastra` (indexing only, no behavior change) | Low | new schema test; existing skills-lock consumers |
| 2 | Internal canonical source: create `tools/learning-loop-mastra/skills/<name>/SKILL.md`; write `sync-skills` materializer (reuse `writeToAllSkills`); first materialization makes `.{claude,factory,mastracode}` copies derive from canonical; narrow gate extension for the canonical dir | Medium | `skills-mirror-parity.test.js`; `contract.js` all 3 runtimes; manifest↔frontmatter drift test |
| 3 | Mastra npx switch (verification-gated): resolve Q1 → Branch A (symlink, no contract change) or Branch B (per-runtime + manifest-driven exclusion + contract/test updates); close `.mastracode` gap; record provenance | Medium-High | `contract.js` mastra-code; parity tests; npx round-trip (add→update→parity) |
| 4 | *(Out of scope, future sessions)* ck:* migration; hooks/coordination-shim centralization; L3-interface + runtime-impl centralization | — | — |

## Implementation considerations & risks

- **Q1 unknown (npx custom-target)** — the single biggest design fork. Resolve BEFORE step 3; it decides contract-change-or-not. Mitigation: Branch A/B both specified; step 3 contingent.
- **Decision 5 boundary** — gating `tools/learning-loop-mastra/skills/**` is a narrow extension of the skills gate, not a `tools/**`-wide gate (stays Rec 12 scope). Confirm in plan (Q2).
- **`npx skills update` clobber** — mastra has no `maturity:`; we add none; npx update won't clobber loop-maintained fields. Verify npx doesn't *require* frontmatter we lack.
- **Manifest/frontmatter drift** — two State sources. Mitigation: drift test (manifest `maturity` ≡ frontmatter `maturity:`).
- **Cross-platform symlinks (Branch A)** — already accepted in-repo (`.claude/skills/mastra` tracked).
- **Materializer authority** — must be the only write path to `<surface>/skills/<name>/` for internal skills, or the gate (`.loop-preflight-skills`) + parity test catch hand-edits. Document the authoring path: edit canonical → run `sync-skills` → `meta_state_log_change`.
- **Reuse, don't reinvent** — `writeToAllSkills` (core/surfaces.js) + `bound-artifacts.js` + existing parity/contract tests are the load-bearing invariants; build on them.

## Success metrics & validation

- `node tools/learning-loop-mastra/interface/contract.js claude-code|droid|mastra-code` all exit 0 (every step).
- `skills-mirror-parity.test.js` green (byte-identity preserved).
- Materializer idempotent: re-run → no diff in any of the 3 surfaces.
- One edit in `tools/learning-loop-mastra/skills/learning-loop/SKILL.md` → after `sync-skills`, all 3 mirrors byte-identical.
- `npx skills update mastra` round-trip updates all 3 surfaces (Branch A: via central; Branch B: per-runtime) and parity/contract stay green.
- `.mastracode/skills/mastra` present (gap closed).
- Manifest query `maturity: state-1` returns the escape-hatch inventory in one grep.
- No new MCP tool; no Decision-3 reversal; `tools/**`-wide gating NOT introduced.

## Next steps & dependencies

- **Depends on:** npx custom-target verification (Q1) before step 3.
- **Blocks (future):** L3-interface + runtime-implementation centralization (the trajectory the operator named) — this design is its foundation (manifest = L3 interface; materialized copies = runtime-specific implementations).
- **Handoff:** `/ak:plan` (recommended `--tdd`: solution refactors contract + write-gate scope and must preserve the strong existing contract/parity test invariants).

## Unresolved questions

1. **Does `npx skills add` support a custom install target dir?** Decides Branch A (symlink, no contract change) vs Branch B (per-runtime + contract/test updates) for mastra. Resolve first in plan.
2. **Gate the canonical source now or defer?** Extend write-gate to `tools/learning-loop-mastra/skills/**` narrowly (recommended) or leave ungated until Rec 12 with materializer-as-only-path + round-trip test?
3. **Materializer trigger:** pnpm script (`pnpm skills:sync`), git pre-commit hook, or manual operator step? (Affects drift-detection latency.)
4. **Manifest filename:** keep `skills-lock.json` (extended) or rename to `skills-manifest.json` to reflect internal-skill coverage? (Renaming touches consumers.)
5. **Branch A `.agents` retirement:** if Branch A keeps `.agents/skills/mastra` as the npx install target, does `.agents/` remain "external boundary" in the contract, or does it become a hybrid canonical store?
