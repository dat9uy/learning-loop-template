---
phase: 3
title: "Meta-state closure"
status: pending
priority: P1
effort: "30m"
dependencies: [2]
---

# Phase 3: Meta-state closure

## Overview

Close finding `meta-260725T2311Z-process-gap-editing-a-canonical-internal-skill-tools-learnin`:
patch its scope to include `maturity`, record the trust-anchor change-log
entry, then resolve citing it. Order matters — patch before resolve so the
resolution cites a finding whose description matches what was fixed.

## Requirements

- Functional: finding description covers hash **and** maturity; change-log
  entry recorded; finding resolved with `source_refs` citing the change-log id
- Non-functional: all writes via the loop CLI (`LOOP_SURFACE` set); per
  internalization rule, prefer `local:meta-state:<id>` refs and set
  `evidence_code_ref` where applicable

## Related Code Files

- None (meta-state records only, via CLI writes)

## Implementation Steps

1. `meta_state_patch` the finding — extend the description: the verbatim
   branch leaves both `hash` **and** `maturity` stale on canonical edit
   (same root cause, same fix).
2. `meta_state_log_change`:
   - `change_dimension`: `process`
   - `change_target`: `skills-lock.json internal entry maintenance`
   - `change_diff`: `normalizeManifest re-derives internal hash + maturity
     from canonicalSource (was: byte-copied verbatim, leaving stale on
     canonical edit)`
   - `reason`: closes the finding; aligns internal path with external
     self-heal; `pnpm skills:sync` now fully maintains the manifest for the
     documented authoring path.
3. `meta_state_derive_status` on the finding (pre-resolution check per
   derive-refresh instruction).
4. `meta_state_resolve` the finding with `source_refs` citing the change-log
   id (`local:meta-state:<id>`) and `evidence_code_ref` pointing at
   `tools/scripts/skills-lib.mjs`.

## Success Criteria

- [ ] Finding description includes maturity (verify via `meta_state_list({id})`)
- [ ] Change-log entry exists and is cited in the resolution `source_refs`
- [ ] Finding status resolved; grounding check passes

## Risk Assessment

Low — record-layer only. Risk: resolving while live repo state drifts
(mid-implementation canonical edit) would fail grounding; mitigated by running
after Phase 2 verification, with `pnpm skills:sync` a confirmed no-op.
