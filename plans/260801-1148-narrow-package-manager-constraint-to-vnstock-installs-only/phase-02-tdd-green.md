---
phase: 2
title: "TDD green — narrow the package-manager regex"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: TDD green — narrow the package-manager regex

## Overview

Change the single `package-manager` regex in `core/patterns.json` to require the `vnstock` token in the command. Run the Phase 1 test suite → green. This is the only production-code change in the plan.

## Requirements

- Functional: `package-manager` matches only install commands containing the `vnstock` token (prefix match, so `vnstock_data` is covered).
- Non-functional: no changes to `CONSTRAINT_PATTERNS` keys, the `AFFECTED_SYSTEM_TO_CONSTRAINTS` mapping, or any other constraint pattern. Minimal diff.

## Architecture

`CONSTRAINT_PATTERNS` (`core/gate-logic.js:30`) is built from `patterns.json` and compiled once. `matchConstraintPattern` tests each compiled regex against the (stripped) command segment. Appending `.*\bvnstock` to the existing pattern keeps the verb anchor (`pip|npm|yarn|pnpm|uv` + `install|add|sync|bootstrap|setup`) and adds the vnstock-token requirement after the verb — the realistic shape of every vnstock install (`vnstock` appears as the package argument after the verb).

`\bvnstock` (no trailing boundary) matches `vnstock`, `vnstock_data`, and any `vnstock`-prefixed package, while the leading `\b` prevents matching `notvnstock` (no word boundary before `vnstock` inside a longer word).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/patterns.json` (the `package-manager` line only).

## Implementation Steps

1. In `core/patterns.json`, replace:
   ```json
   "package-manager": "\\b(pip|npm|yarn|pnpm|uv)\\s+(install|add|sync|bootstrap|setup)\\b"
   ```
   with:
   ```json
   "package-manager": "\\b(pip|npm|yarn|pnpm|uv)\\s+(install|add|sync|bootstrap|setup)\\b.*\\bvnstock"
   ```
2. Update the JSDoc/comment at `core/gate-logic.js:~254` (the `stripNodeEvalBody` bypass note) only if its wording claims `npm install` (generic) matches `package-manager` — reword to use `pip install vnstock` as the example so the comment stays accurate. No logic change.
3. Run the four gate test files from Phase 1 → expect all green.
4. Run the full gate test surface: `pnpm test` filtered to `gate` (or the repo's narrow test discipline) to catch downstream consumers (`evaluate-bash-gate`, `inbound-state`, `recurrence-tracker`, `loop-introspect`).

## Success Criteria

- [ ] Phase 1 test suite is fully green after the regex change.
- [ ] Broader gate test surface passes (no downstream consumer assumed the broad pattern).
- [ ] `patterns.json` diff is exactly the `package-manager` line; `vendor-api` and `side-effect-import` lines unchanged.
- [ ] `AFFECTED_SYSTEM_TO_CONSTRAINTS` (`file-readers.js`) unchanged — the mapping still reads `vnstock → ["vendor-api","package-manager"]`, now coherent because `package-manager` only fires for vnstock installs.

## Risk Assessment

**Regex edge cases.** (a) `vnstock` appearing before the verb (e.g. `vnstock pip install`) would not match. Not a realistic install form; accepted. (b) `.` in `.*` does not cross newlines; `matchConstraintPattern` operates per-segment (split on `;&|`), so no newlines within a segment in practice. (c) A vnstock install hidden inside a `node -e` body remains an accepted bypass (unchanged by this plan; documented in `meta-260615T1920Z-…`). No new bypass introduced.