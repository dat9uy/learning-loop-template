---
phase: 1
title: "MechanismA-DocAndManifest"
status: pending
priority: P2
dependencies: []
effort: "0.25d"
---

# Phase 1: Mechanism A — Placement Decision Tree Doc + Manifest YAML

## Overview

Encodes the operator's history-only knowledge of "where does my new code go?" into two machine-consultable artifacts: `docs/placement.md` (the 5-question decision tree) and `core/placement.yaml` (a manifest enumerating every existing core file with its `layer` + `role`). After this phase ships, the implicit topology the operator has been carrying in their head is on disk, readable by both humans and tests.

This is Phase 1 of two. It does not move files. It does not modify behavior. It only documents and enumerates.

## Requirements

- **Functional:** `docs/placement.md` answers the question "where does my new code go?" with a 5-question decision tree. Mirrors `docs/schemas.md` style (≤80 lines, doc-linkable from `core/README.md`).
- **Functional:** `core/placement.yaml` enumerates every `.js`/`.cjs`/`.mjs` file under `core/` (excluding `__tests__/`, `lib/` internals, `node_modules/`) with `path`, `role`, `summary`.
- **Non-functional:** the closed role taxonomy (7 roles: `primitive`, `evaluator`, `facade`, `verification`, `validator`, `cache`, `helper`) is documented in `placement.md`. New roles require an ADR.
- **Non-functional:** YAML parses cleanly under the project's existing `yaml` import (`import yaml from "yaml"`); no new dependency.

## Architecture

**`docs/placement.md`** — the decision tree. The body is the 5-question flowchart from §3.1 of the brainstorm. The taxonomy table (§3.2) appears below the tree. Each role links back to the manifest section that names files using it. The doc ends with "How to add a new file" (the answer is: write the file, add a manifest entry, run the test from Phase 2 — if the test fails, the manifest update was missed).

**`core/placement.yaml`** — the manifest. One YAML document, single key `files:` with a list of entries:

```yaml
files:
  - path: gate-logic.js
    role: primitive
    summary: Pure gate decision library — globMatch, splitSegments, applyPromotedRules.
  - path: meta-state.js
    role: facade
    summary: Registry CRUD + Zod schemas for the 4-kind meta-state union.
  - path: evaluate-write-gate.js
    role: evaluator
    summary: Write-gate evaluator (Option 2). Imports gate-logic primitives only.
  # ... one row per file in core/ ...
```

The closed taxonomy constrains `role`. Adding a role is an ADR, not a manifest edit. This keeps the taxonomy small enough that "what does `helper` mean?" can be answered by reading 8 lines of doc.

**Why YAML and not JSON:** operator-confirmed in brainstorm §7. Matches `validator-coverage.yaml` and `field-drift-exceptions.yaml` precedent. YAML comments (`#`) document inline rationale without bloating the structured payload.

**Why the closed taxonomy matters:** without it, every new file invites a new ad-hoc role label and the manifest degrades to a name-only listing. Closed-taxonomy + ADR-for-new-roles is the discipline that keeps the manifest load-bearing.

## Related Code Files

- Create: `tools/learning-loop-mastra/docs/placement.md` (the decision tree + taxonomy)
- Create: `tools/learning-loop-mastra/core/placement.yaml` (the manifest, one row per file)

No other files are modified in this phase.

## Implementation Steps

1. **Audit `core/` to enumerate every file needing a manifest row.**
   - Run: `find tools/learning-loop-mastra/core -type f \( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \) -not -path "*/__tests__/*" -not -path "*/lib/*" -not -name "*.test.js" | sort`
   - Expected: **27 production files** (NOT 28 as the brainstorm estimated). The 4 `*.test.js` files colocated in `core/` are excluded — they don't fit the 7-role taxonomy.
   - For each file, read enough to assign a role and write a one-line summary.
   - The role assignment follows the §3.2 table. When uncertain, the assignment MUST be discussed in the PR description — do not invent a new role.

2. **Write `docs/placement.md`** (≤80 lines).
   - **Header:** `# Placement — Where Does My New Code Go?`
   - **§1 The 5-question decision tree** — verbatim copy of the §3.1 flowchart from the brainstorm. Each numbered question is a header; each answer bullet lists the destination directory + the existing file pattern (e.g., `core/{evaluate,check,derive}-*.js`).
   - **§2 Role taxonomy (closed)** — table from §3.2 of the brainstorm (Role / I/O / Imports / Examples). 7 rows. Add a note: "Adding a role requires an ADR (see §4)."
   - **§3 How to add a new core file** — the 4-step ritual: (a) drop the file, (b) write a one-line summary, (c) add a manifest row, (d) run `node --test __tests__/phase-e-foundation/placement-manifest.test.js`.
   - **§4 Adding a new role** — "Roles are closed. New roles require an ADR in `docs/decisions/` or similar. Don't silently add a role to the manifest."
   - **§5 References** — links to `core/README.md`, `docs/schemas.md`, `AGENTS.md` §1.

3. **Write `core/placement.yaml`** with one row per file from step 1.
   - Header comment block: file purpose, test reference, "new files MUST be added here; tests fail until they are."
   - **Path validation (security):** every `path` MUST match `^[\w./-]+\.m?js$`, MUST NOT contain `..`, MUST NOT start with `/` or `~`. The Phase 2 test enforces this; rows that fail will block the manifest from loading. Use relative paths from `core/` (e.g., `gate-logic.js`, not `./gate-logic.js` and not `tools/learning-loop-mastra/core/gate-logic.js`).
   - Order: alphabetically by `path` for diff stability. Group by role with a `# === <role> ===` separator comment for readability.
   - Each row: `path`, `role` (one of 7), `summary` (≤80 chars).
   - Verify YAML parses by importing it in a one-off `node -e` script using `yaml.parse(readFileSync(...))`. Confirm `manifest.files.length === 27`.

4. **Cross-link from `core/README.md`.**
   - In §"How to add a new core file" (step 3 of the existing doc), replace the inline 3-step ritual with: "See `docs/placement.md` §3 for the full process and §2 for the role taxonomy."
   - One-line addition, no other changes.

5. **Run a quick sanity check.**
   - YAML parses (node one-liner).
   - Every `path` in the manifest is a file that exists on disk.
   - No `@mastra/*` imports were accidentally added (existing FCIS test still green).

6. **Commit.**
   - One commit: `docs(phase-e): add placement decision tree + core/placement.yaml manifest (Mechanism A)`
   - Body: `Encodes the implicit topology into machine-consultable artifacts. Test extension (Phase 2) will lock the invariant. No code changes; no behavior change. All baseline tests still pass.`

## Success Criteria

- [ ] `tools/learning-loop-mastra/docs/placement.md` exists, ≤80 lines, contains the 5-question decision tree + closed role taxonomy
- [ ] `tools/learning-loop-mastra/core/placement.yaml` exists, parses as valid YAML, contains exactly **27 rows**
- [ ] Every production file under `core/` (excluding `__tests__/`, `lib/`, `node_modules/`, and `*.test.js` at any depth) appears as a row in the manifest
- [ ] Every manifest `path` matches `^[\w./-]+\.m?js$` (rejects `..`, absolute paths, glob patterns)
- [ ] Every manifest `path` resolves to an existing file within `core/`
- [ ] Every `role` value is one of the 7 closed taxonomy values
- [ ] `core/README.md` cross-links to `docs/placement.md`
- [ ] Existing FCIS test (`fcis-invariant.test.js`) still green
- [ ] Existing schema-doc test (`schema-doc-exists.test.js`) still green
- [ ] All existing tests still pass (baseline measured at Phase-0)

## Risk Assessment

- **R1 (manifest row count wrong):** a file is missed or duplicated. Mitigation: Phase 2's manifest test catches it. Phase 1 manually verifies by `ls -1 core/*.js | wc -l` and comparing to `yq '.files | length' core/placement.yaml`.
- **R2 (role assignment ambiguous):** some files straddle roles (e.g., `loop-introspect.js` is a facade but uses caching; `loop-introspect-cache.js` is the cache role). Mitigation: pick the *primary* role; mention the secondary role in the summary if non-obvious.
- **R3 (closed taxonomy feels arbitrary in 6 months):** a new file doesn't fit any of the 7 roles. Mitigation: the §4 ADR requirement. Don't relax the taxonomy by default.
- **R4 (placement.md duplicates core/README.md):** keep `placement.md` focused on the decision tree and taxonomy; keep `core/README.md` focused on the FCIS invariant. Cross-link, don't duplicate.