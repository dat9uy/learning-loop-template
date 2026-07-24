---
phase: 3
title: "Close patch backdoor: immutabilize last_verified_at"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Close patch backdoor: immutabilize last_verified_at

## Overview

Once `meta_state_touch` is the guarded write path for `last_verified_at`, remove the unguarded one: add the field to `IMMUTABLE_PATCH_FIELDS` so `meta_state_patch` (and the batch path) reject it.

## Requirements

- Functional: `meta_state_patch` / `meta_state_batch` reject `last_verified_at` with `immutable_field`
- Non-functional: no legitimate caller breaks (verified: only re-verify — and now touch — write the field)

## Architecture

`core/meta-state.js` `IMMUTABLE_PATCH_FIELDS` (line ~572) gains `"last_verified_at"` with a comment stating the invariant directly: freshness stamps are produced only by verification (re-verify) or grounding-guarded attestation (touch); patching would forge freshness without evidence. The finding-branch patch schema (`meta-state.js:331`) drops the field so the branch schema and deny-list agree, and `listMutableFieldsCsv` output stays accurate.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (deny-list + finding patch schema)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-immutable-fields.test.js` (expect the field rejected)

## Implementation Steps

1. TDD: extend the immutable-fields test — patch with `last_verified_at` → `immutable_field`, batch path too. Red first.
2. Add field to `IMMUTABLE_PATCH_FIELDS`; remove from finding branch patch schema (L331).
3. Grep for existing writers to confirm none break: `grep -rn "last_verified_at" tools/learning-loop-mastra --include="*.js" | grep -v test` — expect only re-verify, touch, sweep (read), derive-status (read).
4. Update the field glossary entry for `last_verified_at` if it names patch as a writer (`field-glossary.test.js` will catch drift).
5. Run patch + batch + glossary tests → green; then full `pnpm test`.

## Success Criteria

- [ ] Patch and batch reject the field; touch and re-verify still stamp it
- [ ] Full test suite green

## Risk Assessment

- Risk: an operator workflow somewhere patches the field as the undocumented escape hatch — accepted; that is exactly the backdoor being closed, and touch replaces it with a guarded path.
