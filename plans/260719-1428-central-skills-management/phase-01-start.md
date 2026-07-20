---
title: "Phase 1: Unified manifest schema"
status: completed
---

# Phase 1: Unified manifest schema

## Overview

Extend `skills-lock.json` from a single-skill external pin into a unified manifest indexing all skills (internal + external) with State, provenance, targeting, and delivery. **Indexing only — no behavior change.** The manifest *mirrors* `maturity` from SKILL.md frontmatter (frontmatter stays the in-file State source-of-truth); a drift test prevents two-source drift. `skills-lock.json` has zero code consumers today (scout-verified), so extending it breaks nothing; the materializer (Phase 2) and the contract's external-exclusion (Phase 3) become its first readers.

## Requirements

- Functional: unified manifest schema with per-skill `name`, `maturity` (mirror), `source`, `sourceType`, `delivery`, `canonicalSource` (internal), `targets`, `hash`, `external`. Backfill entries for `learning-loop`, `coordination-gate`, `mastra`.
- Non-functional: no behavior change; existing contract/parity tests stay green; manifest↔frontmatter drift test added.

## Architecture

`skills-lock.json` (repo root) is a static data file, no MCP tool (Decision 4). Schema is additive (new optional fields) so any future reader degrades gracefully. `maturity` is a *mirror* — frontmatter is authoritative; the drift test asserts `manifest[name].maturity === frontmatter.maturity` for internal entries only (external skills have no `maturity` to mirror). Standardize the hash field name: rename the existing `computedHash` → `hash` (zero code consumers → safe). **The `hash` field is load-bearing** (red-team F6): the drift test verifies `manifest[name].hash === sha256(canonicalSource)` for internal entries, and Phase 3's materializer verifies an external skill's hash against the manifest before fan-out (refuse on mismatch). This forces the operator to consciously refresh the manifest hash when content changes, rather than recording a hash nobody checks. (Residual supply-chain risk: a hash recorded *from* a compromised upstream still matches — true supply-chain integrity needs out-of-band verification + upstream commit pinning, noted as a stretch in Phase 3, out of scope for v1.)

## Related Code Files

- Modify: `skills-lock.json` (extend schema + backfill 3 entries; rename `computedHash` → `hash`)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-manifest.test.js` (schema + drift tests)
- Read-only context: `tools/learning-loop-mastra/__tests__/legacy-mcp/skills-mirror-parity.test.js:19,70-79` (frontmatter-maturity regex pattern to reuse in the drift test)

## Implementation Steps (TDD)

**Tests Before**
1. Write `skills-manifest.test.js`:
   - Assert `skills-lock.json` parses and matches the unified schema (required fields per entry; `maturity ∈ {state-1,state-2,state-3}` for internal; absent/`null` allowed for external).
   - Assert manifest contains `learning-loop`, `coordination-gate`, `mastra`.
   - **Drift test (maturity):** for each internal entry, `manifest[name].maturity === frontmatter.maturity` read from `.claude/skills/<name>/SKILL.md` (reuse the `/^maturity:\s*(state-1|state-2|state-3)\s*$/m` regex from `skills-mirror-parity.test.js:70-79`).
   - **Hash-verification test (red-team F6 — makes `hash` load-bearing, not cosmetic):** for each internal entry, `manifest[name].hash === sha256(readFileSync(manifest[name].canonicalSource))`. This is the backstop that catches a coordinated mirror edit (operator `sed -i`s all 3 mirrors identically → parity passes, but the manifest hash is now stale). Without it the `hash` field is decorative (verified: `grep -rn "skills-lock\|computedHash" --include=*.js` → 0 consumers). Phase 2 wires `canonicalSource` to the real canonical path; until then the test reads `.claude/skills/<name>/SKILL.md` and the Phase 1 backfill hash must match it.
   - Assert `external: true` for `mastra`; `external: false` (or absent) for internal.
2. Run test — expect FAIL (schema not extended yet).

**Refactor**
3. Extend `skills-lock.json` to the unified shape. Backfill:
   - `learning-loop`: `{ source:"local", sourceType:"local", delivery:"fanout", canonicalSource:"tools/learning-loop-mastra/skills/learning-loop/SKILL.md", targets:[".claude",".factory",".mastracode"], maturity:"state-2", external:false, hash:<sha256 of .claude mirror SKILL.md> }`
   - `coordination-gate`: same shape, `maturity:"state-2"`.
   - `mastra`: `{ source:"mastra-ai/skills", sourceType:"github", delivery:"symlink", skillPath:"skills/mastra/SKILL.md", targets:[".claude",".factory",".mastracode"], maturity:null, external:true, hash:<existing computedHash> }` (`delivery:"symlink"` is the current state; Phase 3 flips it to `"npx-per-runtime+fanout-undetected"`).
4. Run test — expect PASS.

**Tests After**
5. Negative test: tamper an internal entry's `maturity` (e.g. set `learning-loop.maturity:"state-1"` while frontmatter says `state-2`) → drift test FAILS (proves the backstop).
6. Test: `external:true` skills are excluded from the internal-maturity invariant (external skills need no `maturity`).

**Regression Gate**
7. `pnpm test:iter` green (contract, parity, bound-artifacts, runtime-agnostic unchanged — data-only phase). `node tools/learning-loop-mastra/interface/contract.js claude-code|droid|mastra-code` all exit 0.
8. `grep -rn "skills-lock" --include=*.js` (exclude node_modules/plans) — confirm still zero code consumers (data-only phase; readers land in Phases 2-3).

## Success Criteria

- [ ] `skills-lock.json` parses against the unified schema with 3 backfilled entries.
- [ ] Manifest↔frontmatter drift test green; negative test fails on tampered maturity.
- [ ] No behavior change: contract/parity/bound-artifacts/runtime-agnostic tests green.
- [ ] Zero code consumers of `skills-lock.json` (data-only phase).

## Risk Assessment

- **Drift between manifest and frontmatter** (two State sources) — mitigated by the drift test; frontmatter stays authoritative.
- **Schema over-design** — keep fields minimal + additive; `delivery` is an open enum (`fanout|symlink|npx-per-runtime+fanout-undetected`); do not encode every future variant now (YAGNI).
- **Rename temptation (Q4)** — keep `skills-lock.json`; renaming is cosmetic churn with zero code consumers. Documented as a future option.
