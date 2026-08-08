---
title: runtime-state-durability-split
date: 2026-08-08
summary: Split runtime-state substrate by durability; ephemeral gate-verb allowances move to a gitignored local file
---

# runtime-state-durability-split

## What happened
- Filed finding `meta-260809T0119Z-...` (schema-drift, escalate) for the L1/L2/L3 durability drift: the wiring committed ephemeral TTL'd `gate-verb:*` allowance rows to `runtime-state.jsonl` as if durable.
- Added a `durability` axis (`durable`|`ephemeral`, default durable) to `runtime_state_record`; `appendLedgerEvent` routes ephemeral → gitignored `.loop/runtime-state-local.jsonl`, durable → committed `runtime-state.jsonl`. Version scan is destination-scoped (per-substrate versioning real).
- Symmetric namespace guard at the record-tool boundary: `gate-verb:*` ⟺ `ephemeral` (a durable gate-verb row or ephemeral non-gate-verb row is rejected `durability_namespace_mismatch`).
- Read path merges both substrates; per-substrate malformed handling (a malformed local line does not block durable writes).
- 3-layer write protection (bash gate + write-gate preflight delegation + R2 deny) + gitignore for the local substrate; change-log binding (red-team #12).
- Migration script `scripts/migrate-runtime-state-ephemeral-rows.mjs`: lock-protected, atomic `.tmp`+`renameSync`, kind-gated, idempotent, backup written. Moved the 2 committed gate-verb rows to local + closed them (stop-tool namespace derivation routes `gate-verb:*` closures to local).
- Gate-verb block-message incantation + hint-registry emit `durability:"ephemeral"`.
- Docs reconciled (`docs/architecture.md` "Durability split" replaces the drift note; `docs/runtime-contract.md` names the guard); `runtime_state_read` documents the merged view.
- Resolved the drift finding with evidence.

## Decision
- Keep `durability` OUT of the fingerprint formula (like `version`) — a fixed field subset — so stored rows with durability still verify (verified 7/7 local + committed rows).
- Code-reviewer H2 fixed: pause/resume tools now derive durability from the `gate-verb:*` namespace like the stop tool (a latent misrouting surface).
- Code-reviewer H1 (fingerprint break) refuted by direct check; H3 (schema optionality) is a docs nit, guard fails closed.

## Next steps
- Commit the working tree (the user will decide).
- Backup `runtime-state.jsonl.bak-2026-08-08T18-52-03-788Z` can be removed once the migration is confirmed; it is gitignored.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
