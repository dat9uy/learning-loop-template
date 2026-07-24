---
title: "meta_state_touch: grounding-guarded re-grounding for aged findings"
description: "Add a lightweight operator write tool that re-grounds age-stale findings lacking verification.steps, guarded by checkGrounding; close the unguarded meta_state_patch backdoor on last_verified_at."
status: completed
priority: P1
effort: "1d"
tags: [meta-state, tooling, staleness]
created: 2026-07-24
---

# meta_state_touch: grounding-guarded re-grounding for aged findings

## Overview

Finding `meta-260724T1913Z-aged-findings-no-verification-steps-cannot-be-re-grounded-by` (open, warning):
22 open findings are age-stale (`isStaleView`: `now - (last_verified_at || created_at) > 7d`) but carry
no `verification.steps`, so `meta_state_re_verify` rejects them with `no_verification_steps`
(`tools/learning-loop-mastra/tools/handlers/meta-state-re-verify-tool.js:44-46`). Their evidence is still
grounded (sampled: `hash_match:true, status:"grounded"`). The only other writer of `last_verified_at` is
`meta_state_patch`, where the field is **not** in `IMMUTABLE_PATCH_FIELDS` (`core/meta-state.js:331`) —
an unguarded forge-freshness backdoor. The cold-tier age-stale cap (11→19, now 22 actual) is saturated.

Root cause (verified in debug session): not a code bug — a missing canonical re-grounding path for
findings whose verification model is "operator attestation + evidence hash still matches" rather than
"executable verification steps".

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | New write tool `meta_state_touch`: stamps `last_verified_at` on an open finding when `checkGrounding` gives no negative signal; rejects on proven drift/missing evidence | P1 |
| 2 | Single handler exposed on both surfaces (MCP manifest + CLI_WRITE_TOOLS) — shim-not-fork | P1 |
| 3 | Move `last_verified_at` into `IMMUTABLE_PATCH_FIELDS` once the guarded path exists | P2 |
| 4 | Bulk re-ground the 22 aged findings; resolve the parent finding | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Design decisions + failing test scaffold](./phase-01-start.md) | Completed |
| 2 | [Phase 2: TDD: meta_state_touch handler + registration](./phase-02-tdd-meta-state-touch-handler-registration.md) | Completed |
| 3 | [Phase 3: Close patch backdoor: immutabilize last_verified_at](./phase-03-close-patch-backdoor-immutabilize-last-verified-at.md) | Completed |
| 4 | [Phase 4: Bulk re-ground 22 aged findings + resolve finding](./phase-04-bulk-re-ground-22-aged-findings-resolve-finding.md) | Completed |

## Success Criteria

- [x] `meta_state_touch({id})` stamps `last_verified_at` on a grounded open finding (no status transition); rejects `drifted`/`missing`/`not_found`/`wrong_status` with structured reasons
- [x] Tool visible on MCP surface and CLI (`bin/loop.mjs meta_state_touch`), all drift/parity tests green
- [x] `meta_state_patch` rejects `last_verified_at` with `immutable_field`
- [x] Age-stale count returns below the cold-tier cap without bumping it; parent finding resolved via cascade with `source_refs` citing the change-log entry

<!-- slug: meta-state-touch-grounding-guarded-re-grounding-for-aged-findings -->
