---
phase: 1
title: "accepted status + terminal-set harmonization"
status: completed
priority: P1
effort: ""
dependencies: []
---

# Phase 1: `accepted` status + terminal-set harmonization

## Overview

Add `accepted` to the finding status enum and make it terminal for `isOpen`/
`isStaleView`/`deriveStatus` so accepted-limitations stop lying as `open`. Add a
thin `meta_state_accept` tool (append-only `open`→`accepted`) and migrate the
existing open accepted-limitation finding(s) to `accepted`. This phase is
independent of the citation substrate (Phase 2) — it touches only status enums,
predicates, and one new tool.

## Requirements

- Functional: `accepted` is a valid finding status; `isOpen(accepted)` is false;
  `isStaleView`/`deriveStatus` treat `accepted` as terminal (no stale pressure,
  `no_action` recommendation); `meta_state_accept` flips `open`→`accepted` via a
  true-append version line; `accepted` is filterable as a distinct status
  (`meta_state_list({status:"accepted"})`); `accepted`→`archived` is allowed,
  `accepted`→`resolved` is rejected as `already_terminal`.
- Non-functional: all six terminal-set copies stay consistent; write-time RI and
  warn-only semantics unchanged; no new scan surfaces.

## Architecture

`accepted` is a state-3 artifact: `isOpen` (`constants.js:70`) branches on it via
`TERMINAL_STATUSES`, so it earns a strict enum value, not prose. The lifecycle is
`open → accepted` (standing trade-off) and `any → archived`; `accepted` is
terminal for `isOpen` and for `meta_state_resolve` (already_terminal), but
archiveable. The migration of existing findings is a one-time true-append
(reuses the `trueAppendAtomicRaw` path `archiveEntry` uses) because `status` is
on `IMMUTABLE_PATCH_FIELDS` and `meta_state_batch op:write` rejects caller-supplied
status — a patch cannot flip it.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (finding status enum L356; local `TERMINAL_STATUSES` L248; `matchesStatusFilter` L2164-2173; `tryClaimSessionId` L2193-2203 — do NOT add `accepted` here; `by_status` zod record enums L457,462)
- Modify: `tools/learning-loop-mastra/core/constants.js` (`TERMINAL_STATUSES` L60 — add `accepted`)
- Modify: `tools/learning-loop-mastra/core/derive-status.js` (`TERMINAL_RAW_STATUSES` L28 — add `accepted`)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (`TERMINAL_STATUSES_FOR_DISPATCH` L242 — add `accepted`)
- Modify: `tools/learning-loop-mastra/core/operation-envelope.js` (`CANONICAL_STATUS_KEYS` L68 — add `accepted`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js` (`TERMINAL_STATUSES` L14 — add `accepted`, keep `archived` out)
- Create: `tools/learning-loop-mastra/tools/handlers/meta-state-accept-tool.js` (`meta_state_accept` handler)
- Create: `tools/learning-loop-mastra/core/__tests__/meta-state-accepted-status.test.js` (TDD driver)
- Create: a one-time migration script under `tools/learning-loop-mastra/tools/handlers/scripts/` (e.g. `migrate-accepted-limitations.mjs`)
- Modify: `tools/learning-loop-mastra/core/cli-tools.js` (add `meta_state_accept` to `CLI_WRITE_TOOLS`)

## Implementation Steps (TDD — tests first)

1. **Write the failing test** `core/__tests__/meta-state-accepted-status.test.js`:
   - `status:"accepted"` parses on the finding schema; `isOpen` returns false for
     an `accepted` entry and true for `open`.
   - `isStaleView(accepted)` returns false (terminal guard); `deriveStatus`
     returns `no_action` for an `accepted` finding.
   - A characterization assertion that all six terminal-set copies include
     `accepted` (constants.js, meta-state.js:248, resolve-tool.js:14,
     loop-introspect.js:242, derive-status.js:28, operation-envelope.js
     `CANONICAL_STATUS_KEYS`).
   - `meta_state_accept` flips an `open` finding to `accepted` (true-append v+1,
     stamps `accepted_at`/`accepted_by`/`accepted_reason`); rejects
     already-`accepted` (`already_accepted`), non-findings (`not_a_finding`),
     and terminal findings (`already_terminal`).
   - `meta_state_resolve` on an `accepted` finding returns `already_terminal`.
   - `meta_state_archive` on an `accepted` finding succeeds (`accepted`→`archived`).
   - `meta_state_list({status:"accepted"})` returns the accepted set; `accepted`
     is NOT session-claimable (`tryClaimSessionId` does not match it).
2. Run the test — confirm it fails for the right reasons (enum rejects
   `accepted`; no `meta_state_accept` tool).
3. Add `accepted` to the finding status enum (`meta-state.js:356`) and to all six
   terminal-set copies (constants.js:60 with `archived`; meta-state.js:248,
   resolve-tool.js:14, derive-status.js:28 without `archived`;
   loop-introspect.js:242 with `archived`; operation-envelope.js:68 array).
4. Add `accepted_at`/`accepted_by`/`accepted_reason` to the finding schema
   (optional fields, mirroring `resolved_*`).
5. Implement `meta_state_accept`: a core op `acceptEntry(root, id, reason,
   acceptedBy)` that true-appends a v+1 line with `status:"accepted"` + the
   stamps, wrapped in `assertinvariant` (pre-state: `isOpen(existing)` — must be
   open). The handler validates `id` is a finding and not already terminal.
   Reuses `enqueue` + `withRegistryLock` like `archiveEntry`.
6. Add `"acceptEntry"` to `MUTATION_OPS` in
   `core/operation-invariant-coverage.test.js` (the static assertinvariant-coverage
   check lists `writeEntry`/`updateEntry`/`archiveEntry`/`deleteEntry`/`metaStateBatch`;
   `acceptEntry` must join it or a future lost-wrapper regression goes uncaught).
7. Register `meta_state_accept` in `CLI_WRITE_TOOLS` and the handler dispatch.
8. Re-run the test — confirm green.
9. **Migration:** write `migrate-accepted-limitations.mjs` that scans
   `meta-state.jsonl` (max-by-version) for findings with `subtype` ending in
   `-accepted` (and/or an operator-attested id list) whose status is `open`, and
   true-appends a v+1 `accepted` line for each. **Scan-based, not hardcoded** —
   the scout found ~1 open candidate (`meta-260615T1920Z-…`,
   `strip-bypass-accepted`); the `design-tradeoff` id is already `resolved` at
   v1 and is skipped. Dry-run mode prints the candidate set; apply mode writes.
10. Run the migration in dry-run, review the candidate set, then apply.
11. Run the focused test + `pnpm test` for the status surface; broaden to the
    derive-status / stale-view / loop-introspect suites.

## Success Criteria

- [x] `accepted` parses on the finding schema and is terminal in all six
      terminal-set copies (characterization test green).
- [x] `isOpen`/`isStaleView`/`deriveStatus` treat `accepted` as terminal.
- [x] `meta_state_accept` flips `open`→`accepted` (true-append); rejects
      non-findings, already-accepted, and terminal findings.
- [x] `meta_state_resolve` rejects `accepted` (`already_terminal`);
      `meta_state_archive` accepts `accepted`→`archived`.
- [x] `accepted` is distinct/filterable and not session-claimable.
- [ ] The open accepted-limitation finding(s) are migrated to `accepted`.
      *(migration script authored; dry-run + apply are operator-gated)*
- [x] Focused + broadened test suites green.

## Risk Assessment

- **Six-copy drift** is the core risk; the characterization test in step 1 locks
  the agreement and is the regression guard for the other phases.
- **`tryClaimSessionId` (meta-state.js:2200)** uses literal status checks, not
  `isOpen`. Do NOT add `accepted` there — accepted findings should not be
  claimable as open duplicates. The test asserts this.
- **`matchesStatusFilter`** must NOT map `accepted`→`open`; keep it distinct so
  `meta_state_list({status:"accepted"})` works.
- **Migration must be append-only.** Do not use `meta_state_patch` (status is
  immutable-patch-denied); use `trueAppendAtomicRaw` like `archiveEntry`.
- **`accepted`→`resolved` rejection** depends on `accepted` being in
  resolve-tool.js:14's terminal set. If a future trade-off is actually fixed, the
  operator archives the accepted finding and files a new resolved one (append-only
  terminality holds).