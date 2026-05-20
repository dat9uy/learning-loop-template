---
phase: 3
title: "Operator-Guide Domain Split"
status: completed
priority: P2
effort: "45m"
dependencies: [1]
---

# Phase 3: Operator-Guide Domain Split

## Overview

Extract all vnstock-specific examples, commands, and domain assumptions from `docs/operator-guide.md` into a dedicated appendix. Keep the operator-guide as a generic, domain-agnostic record-system manual.

## Requirements

- Functional:
  - Generic operator-guide covers: record naming, state query protocol, evidence model, approval flow, write domain rules, agent intake flow, runtime artifact standard
  - Vnstock appendix covers: bootstrap command, API key handling, device slot specifics, resource budget example, runtime probe stack table with vnstock paths
- Non-functional:
  - All existing section anchors stable
  - Generic guide must include a template for adding a new live gate

## Architecture

Docs refactor. No code or record changes.

## Related Code Files

- Modify: `docs/operator-guide.md`
- Create: `docs/operator-guide-vnstock-appendix.md`
- Read for context: `docs/operator-guide.md` (full file)
- Read for context: `docs/philosophy.md`

## Implementation Steps

1. Read `docs/operator-guide.md` in full.
2. Identify sections to move to appendix:
   - API Stack Bootstrap (`pnpm bootstrap:api` and vnstock installer)
   - Runtime probe stack table with `product/api/` paths
   - Vnstock-specific resource budget example
   - Vnstock-specific gate pattern (`VNSTOCK_REFERENCE_LIVE_GATE`)
3. Create `docs/operator-guide-vnstock-appendix.md` with moved content.
4. Replace moved sections in operator-guide with:
   - Generic "Adding a New Live Gate" template (environment variable pattern, HTTPException 403 response, approval flow)
   - Generic runtime probe stack table using placeholder paths
   - Reference link to appendix for vnstock example
5. Ensure all internal cross-references still resolve.

## Success Criteria

- [ ] `docs/operator-guide.md` contains no vnstock-specific commands or paths
- [ ] `docs/operator-guide-vnstock-appendix.md` created with all extracted content
- [ ] Generic "Adding a New Live Gate" template added to operator-guide
- [ ] All section links stable (no broken references)

## Risk Assessment

- **Cross-reference drift**: Other docs or plans may cite specific operator-guide line numbers or sections. Verify no hard-coded references break.
- **In-flight plan confusion**: Plans created while the old operator-guide was active may reference vnstock-specific sections. This is acceptable — they were authored under the old guide.
