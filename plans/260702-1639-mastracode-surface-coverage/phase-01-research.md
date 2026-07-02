---
phase: 1
title: "Scope & Prerequisites"
status: pending
effort: P2
dependencies: []
---

# Phase 1: Scope & Prerequisites

## Overview

Confirm the 5-file scope against the live repo, then close the prerequisite gap
the doc under-emphasized: `.mastracode/coordination/hooks/` does not exist.
Extending `SHIM_DIRS` to 3 entries (Phase 2) requires that dir to exist with 4
byte-identical mirrored shims, or `shims-in-sync` flags the real repo. Do that
here so Phase 2 is a clean source-only migration.

## Requirements

- Functional: every site that hard-codes the 2-surface list is enumerated and
  confirmed against the actual source (no stale line numbers). `.mastracode
  /coordination/hooks/` exists and its 4 shims are SHA256-equal to the `.factory`
  copies.
- Non-functional: no behavior change for `.claude` or `.factory` surfaces. No
  new abstraction — reuse the existing mirror-by-hand convention.

## Architecture

The shim `.cjs` files are `require()` adapters that load the universal hook from
`tools/learning-loop-mastra/hooks/legacy/`. They are byte-identical across
surfaces by design (enforced by the `shims-in-sync` checklist item's SHA256
check). Adding the mastra-code surface is a file copy, not a code change.

## Related Code Files

- Create: `.mastracode/coordination/hooks/bash-coordination-gate.cjs`
- Create: `.mastracode/coordination/hooks/inbound-state-gate.cjs`
- Create: `.mastracode/coordination/hooks/recurrence-check-on-start.cjs`
- Create: `.mastracode/coordination/hooks/write-coordination-gate.cjs`
- Read (source of truth to copy): `.factory/coordination/hooks/*.cjs`
- Read (enumeration check): the 5 files listed in `plan.md`

## Implementation Steps

1. Re-grep the live repo for the hard-coded 2-surface list in source (exclude
   tests, exclude `surfaces.js`, exclude comments-only) and confirm the 5 files
   in `plan.md` are the complete set:
   ```bash
   grep -rn '\.claude.*\.factory\|for (const dir of \[' \
     tools/learning-loop-mastra/{core,hooks,tools} \
     | grep -v __tests__ | grep -v surfaces.js
   ```
   If anything outside the 5 appears, stop and update `plan.md` before
   proceeding.
2. Read each of the 4 `.factory/coordination/hooks/*.cjs` shims. Confirm they are
   identical to their `.claude` counterparts (`sha256sum` both dirs).
3. Create `.mastracode/coordination/hooks/` and copy the 4 shims verbatim from
   `.factory/coordination/hooks/`. Do not edit content — byte-identical is the
   contract.
4. Verify: `sha256sum .claude/coordination/hooks/*.cjs .factory/coordination/hooks/*.cjs .mastracode/coordination/hooks/*.cjs` — the 3 copies of each hook must share one hash.
5. Confirm `.mastracode/coordination/` (not just `hooks/`) is the preflight-marker
   target the Phase 2 tool fix will write to; it already exists, so no mkdir
   needed beyond step 3.

## Success Criteria

- [ ] Grep confirms exactly the 5 source files (plus cosmetic comments) hard-code
  the 2-surface list; no surprises.
- [ ] `.mastracode/coordination/hooks/` exists with 4 shims, each SHA256-equal to
  its `.claude` and `.factory` copies.
- [ ] No source behavior change in this phase (files created only).

## Risk Assessment

- **Stale line numbers in the doc:** the Out-of-Scope list was written at commit
  `c58a8c8`; lines may have shifted. Mitigation: step 1 re-greps live source and
  treats the doc as a hint, not truth. The journal's lesson — "claims need
  per-site verification, not aggregate confidence" — applies here too.
- **Shim drift:** if `.claude` and `.factory` shims have silently diverged,
  copying from `.factory` would create a 3-way mismatch. Mitigation: step 2
  sha256-checks before copying; if they differ, stop and surface it (do NOT pick
  one silently — that's a separate bug).
- **Coupling hidden in tests:** `runtime-agnostic.test.js:11-12,120` hard-codes
  `SHIM_CLAUDE`/`SHIM_FACTORY` and compares only those two. Extending `SHIM_DIRS`
  here does not break that test (it doesn't read `SHIM_DIRS`), but the test
  itself under-covers — that is Phase 3's fix, not this phase's concern.