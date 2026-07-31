---
phase: 4
title: "Write-Time Structural Referential-Integrity Validation"
status: completed
priority: P1
effort: "2.5h"
dependencies: [2, 3]
---

# Phase 4: Write-Time Structural Referential-Integrity Validation

## Overview

Land the write-time check that makes a never-existent-target structural cross-ref a write-rejected error instead of a permanent audit line — the payoff of append-first for the case the pre-merge CI gate does NOT cover (cross-PR orphans + immediate agent feedback). Reject structural cross-ref fields whose target id is **never-existent** (absent from the projected registry) **before append**, wrapped in `assertinvariant` at the mutation boundary. **Scope is id-existence only** (red-team R3/R8): kind-match and liveness are out of scope — a ref to a deleted/archived tombstone (id still in the projection) or a wrong-kind target passes; the derived `dangling_refs` view flags those post-hoc. `applies_to_resolution` is RI-exempt (red-team R4 — it's `z.string()`, not an entry-id ref; a determinism-checklist pattern like `test-session-123` is valid, not dangling). The check applies only to **new appends**: `writeEntry` validates all cross-ref fields (brand-new entry); `updateEntry` validates only cross-refs the patch **changes or introduces** (inherited unchanged refs are NOT re-validated) and returns the string code `"dangling_structural_ref"` (red-team R7 — matching `updateEntry`'s string-code return contract, NOT the `assertinvariant` object, so `applyUpdateAndCheck`/handlers recognize it); `metaStateBatch` write/update ops validate per-op against the in-memory `entries[]` so intra-batch write-then-reference passes. Exempt (no new cross-refs): `archiveEntry`, `deleteEntry`, `shipLoopDesign`. `tryClaimSessionId` gets a defensive comment, NOT RI (red-team R9 — test-only, bypasses `writeEntry` via `appendRegistryEntryAtomic`, no cross-process lock). Historical entries with legacy dangling refs still **read** fine — the entire read/projection path runs no RI. `cascade_from` is not covered (not persisted); `reopens` IS covered. The `reopens`/`cascade_from` contract is preserved unchanged.

## Requirements

- Functional: `writeEntry` (`core/meta-state.js:1115`) — **after** `metaStateEntrySchema.safeParse` succeeds (`:1151-1154`) and before the append dispatch (`:1160`), wrap a structural RI check in `assertinvariant`: `resolveStructuralRI(newEntry, readRegistrySet)` must return `{ok:true}`. **Id-existence only** (red-team R3/R8): the existence set is `new Set(readRegistry(root).map(e=>e.id))` — a bare `Set<string>`; tombstones count as present; kind-match is NOT checked. `applies_to_resolution` EXEMPT (red-team R4). `consolidated_into` (immutable patch deny-list, `:648`) is only ever set here → always validated.
- Functional: `updateEntry` (`:1189`) — inside the `if (!entriesEqual(patched, existingEntry))` block (`:1277-1285`), on `newEntry` (`:1283`) before append (`:1284`), validate ONLY cross-ref fields the patch **changes or introduces**: diff `forwardRefs(newEntry)` against `forwardRefs(existingEntry)`, run `resolveStructuralRI` on the changed set only. An unchanged historical `reopens` is NOT re-validated (the load-bearing design decision — else a description edit on a finding with a stale `reopens` is blocked). **On RI failure, return the string code `"dangling_structural_ref"`** (red-team R7) — NOT the `assertinvariant` `{ok:false,...}` object — so `applyUpdateAndCheck` (`meta-state-resolve-tool.js:163`) + handlers surface an actionable rejection; update `applyUpdateAndCheck` + handler callers to recognize the new code.
- Functional: `metaStateBatch` (`:1507`) — per-op: case `"write"` (brand-new → validate all, `:1589-1592`), case `"update"` (changed-only, `:1647-1656`). Use the in-memory `entries[]` (mutated in-batch at `:1591/1655/1684/1705`) as the existence set so a write-then-reference within one batch passes. ⚠️ Note (red-team R8): a `delete` op keeps the id in `entries[]` as a tombstone (`:1672-1684`), so a later write referencing the deleted id PASSES RI — this is the liveness gap; accepted (id-existence scope). Per-op gives `failed_at: i` attribution.
- Functional: the RI check is wrapped in `assertinvariant(operation, {accept:{context,check}, returnOnFail, root})` per `core/operation-invariant.js:90`. The caller already holds `withRegistryLock` (the wrapper does NOT lock — `operation-invariant.js:10-14`). `accept.context()` snapshots the new entry + existence set; `accept.check(pre)` runs `resolveStructuralRI`. `returnOnFail` carries `{reason_code:"dangling_structural_ref", dangling:[...]}` so the rejection names the field + missing id. (`writeEntry` throws on `!invariantResult.ok` per the existing `:1140-1141` pattern; `updateEntry` returns the string code instead — see above.)
- Functional: `archiveEntry` (`:1307`), `deleteEntry` (`:1357`), `shipLoopDesign` (`:1423`) are EXEMPT — tombstones spread the existing entry + add only status/timestamps → no new cross-refs → RI no-op. `tryClaimSessionId` (`:1889`): add a defensive comment at `:1910` noting it bypasses `writeEntry` (direct `appendRegistryEntryAtomic`) and thus write-time RI, and must not be wired to a production handler without routing through `writeEntry` — NO RI added (red-team R9: test-only path, `enqueue` not `withRegistryLock`, zero production callers).
- Non-functional: historical entries read fine — `readRegistry`, `loop-introspect`, `meta_state_relationships`, `meta_state_list`, `meta_state_relationship_validate` run no RI (new-appends-only boundary). The 4 existing live `reopens` edges are never re-appended → RI never sees them → they still read.

## Architecture

```
core/meta-state.js   ← MODIFY (write-time RI at the boundary)
  import { resolveStructuralRI } from "./entry/relationship-graph.js"

  writeEntry (entry)   // :1115
    ... existing identity assertinvariant (L1126-1142)
    ... metaStateEntrySchema.safeParse (L1151-1154) → validation.data
  + const existenceSet = new Set(readRegistry(root).map(e => e.id))   // inside withRegistryLock (already held)
  + assertinvariant(                                                  // caller holds the lock; wrapper does not
      async () => { ...existing append dispatch L1160... },
      { accept: { context: () => ({ entry: validation.data, existenceSet }),
                  check: (pre) => resolveStructuralRI(pre.entry, pre.existenceSet).ok },
        returnOnFail: { reason_code: "dangling_structural_ref", /* dangling: [...] surfaced */ },
        root })
    // assertinvariant runs check BEFORE operation(); on ok → append proceeds; on fail → returns {ok:false,...}, no append

  updateEntry (id, patch, ...)   // :1189
    ... existing patch + assertNotArchived, entriesEqual guard (L1277)
    + const newEntry = ... (L1283)
    + const changedRefs = diffChangedRefs(forwardRefs(newEntry), forwardRefs(existingEntry))  // graph forwardRefs; applies_to_resolution EXEMPT (red-team R4)
    + if (changedRefs.length) {
        const existenceSet = new Set(readRegistry(root).map(e => e.id))   // inside withRegistryLock; Set<string> — ID-EXISTENCE only (red-team R3)
        const ri = assertinvariant(/* append */, { accept:{ context: () => ({ changedRefs, existenceSet }),
            check: (pre) => changedRefs.every(r => pre.existenceSet.has(r.id)) },   // "*" already filtered by forwardRefs; tombstones count as present (red-team R8)
          returnOnFail: { reason_code: "dangling_structural_ref", /* dangling: [...] */ }, root })
        if (!ri.ok) return "dangling_structural_ref"   // STRING CODE — red-team R7 (NOT the assertinvariant object)
      }
    // only CHANGED/INTRODUCED refs validated; inherited unchanged refs (e.g. a stale reopens) are NOT re-checked
    // ⚠️ update applyUpdateAndCheck (meta-state-resolve-tool.js:163) + handler callers to recognize "dangling_structural_ref"

  metaStateBatch (ops)   // :1507
    ... per-op build pendingMetaStateAppends
    + case "write": existenceSet = new Set(entries.map(e=>e.id)); if (!resolveStructuralRI(opEntry, existenceSet).ok) → reject op with failed_at:i
    + case "update": changedRefs = diffChangedRefs(forwardRefs(opEntry), forwardRefs(existingEntry));
        if (changedRefs.length && !changedRefs.every(r=>existenceSet.has(r.id))) → reject op with failed_at:i   // applies_to_resolution filtered; "*" filtered
    // use the IN-MEMORY entries[] (mutated in-batch) so intra-batch write→reference resolves
    // ⚠️ a delete op keeps the id as a tombstone in entries[] (L1672-1684) → a later write referencing it PASSES (liveness gap, accepted — red-team R8)

  // EXEMPT (no new cross-refs): archiveEntry (:1307), deleteEntry (:1357), shipLoopDesign (:1423) — no RI call
  // tryClaimSessionId (:1889-1910): add a DEFENSIVE COMMENT at :1910 — bypasses writeEntry (direct appendRegistryEntryAtomic),
  //   no withRegistryLock (enqueue only), zero production callers (test-only); must NOT be wired to a prod handler without
  //   routing through writeEntry. NO RI added (red-team R9 — over-investing in a test-only path).
```

`diffChangedRefs(newRefs, oldRefs)` is a small helper in `relationship-graph.js` (pure, testable): returns refs in `newRefs` whose `(field,id)` pair is not in `oldRefs` — refs the patch introduces or repoints. It excludes inherited unchanged refs (the load-bearing "don't block on historical dangling refs" property) and excludes `applies_to_resolution` (RI-exempt). `resolveStructuralRI` is **id-existence only** (`!existenceSet.has(r.id)`); it does NOT kind-match (the `Set<string>` carries no kind — red-team R3) and does NOT exclude tombstones (a deleted id remains in the projection — red-team R8).

### Why id-existence only (red-team R3/R4/R8)

The honest, implementable scope with a `Set<string>` existence set is **id-existence**: a ref to a *never-existent* id is rejected; a ref to a *deleted* (tombstoned) or *wrong-kind* target passes. Kind-match would need `Map<id, entry_kind>` + a comparison; liveness would need a tombstone filter (`status !== "archived" && tombstone_kind === undefined`). Both are larger scope, deferred — the derived `dangling_refs` view still flags deleted/wrong-kind refs post-hoc, and the pre-merge CI gate catches within-PR cases. `applies_to_resolution` is RI-exempt (red-team R4): it's `z.string().optional()` (not `entryIdRefArray`); the promote-rule test (`meta-state-promote-rule-rule-entry.test.js:126,130,136`) uses `pattern: "test-session-123"` (a determinism-checklist session id, not a registry entry), so RI on it would break legitimate promotion. `forwardRefs` still emits `applies_to_resolution` for the relationships tool; `resolveStructuralRI` + `diffChangedRefs` skip it.

### Why new-appends-only + update-changed-only (the boundary)

Append-first makes a never-existent-target ref permanent audit (the case the pre-merge CI gate does NOT cover: cross-PR orphans + branch-local writes), so RI rejects at append time (new value). But historical entries written before RI exists may carry legacy dangling refs (e.g. a `reopens` whose parent was later deleted). Re-validating those on read would break the read path; re-validating them on an unrelated update would make the entry un-editable (a description edit blocked by a stale `reopens` it didn't touch). The boundary: **RI runs only on cross-refs a new append introduces or an update changes** — inherited refs are grandfathered. `consolidated_into` is on the immutable patch deny-list → only ever set at `writeEntry` → always validated there, never re-validated. This keeps historical data readable and edits non-blocking while preventing NEW never-existent-target refs. The 4 existing live `reopens` edges are never re-appended → never seen by RI.

### Why `assertinvariant` (not a plain throw) + the return-contract split (red-team R7)

The repo's rule hint 8 (`assertinvariant-at-boundary`) requires mutation ops in `core/` that own agent-relevant invariants to be wrapped with `assertinvariant(operation, {...})`. The primitive (`operation-invariant.js:90`) runs `accept.check(pre)` and returns a structured `{ok:false, reason_code, ...}` on failure — it does NOT throw, and the wrapper does NOT acquire the lock (the caller holds `withRegistryLock`; nested locking would deadlock). This matches the existing identity-precondition `assertinvariant` in `writeEntry` (`:1126-1142`) and the forge-envelope guard in `metaStateBatch` (`:1556-1575`) — the RI check is the same shape, a new `returnOnFail` code. **Return-contract split (red-team R7):** `writeEntry` already throws on `!invariantResult.ok` (`:1140-1141`) — keep that. But `updateEntry` uses a string-code return contract (`true`/`null`/`"version_mismatch"`/`"validation_failed"`/`"immutable_field"`, `:1182-1188`); returning the `assertinvariant` object would fall through `applyUpdateAndCheck`'s checks (`:163`) to an opaque "unexpected return" throw. So `updateEntry` catches `!ri.ok` and returns the new string code `"dangling_structural_ref"`, and `applyUpdateAndCheck` + the patch/resolve/archive handlers are updated to surface it as an actionable rejection.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (`writeEntry:1115`, `updateEntry:1189`, `metaStateBatch:1507`; verify `tryClaimSessionId:1889` cross-ref output)
- Create: `tools/learning-loop-mastra/__tests__/core/write-time-structural-ri.test.js` (write/update/batch RI: dangling rejected, valid accepted, inherited-unchanged not re-validated, `"*"` exempt, historical-reads-fine, intra-batch write→reference)
- Read: `core/operation-invariant.js` (`assertinvariant:90` + `.test.js:45-68` usage), `core/registry-append-atomic.js`, `core/read-registry-cache.js`, `core/registry-lock.js`
- Read (verify exemption): `tools/handlers/meta-state-archive-tool.js`, `meta-state-resolve-tool.js` (`validateCascadeChildren:205-251` — the existing reopens-only check, not replaced)

## Implementation Steps (TDD — tests first)

### Tests Before

1. Create `__tests__/core/write-time-structural-ri.test.js` with an in-memory registry harness (seed `meta-state.jsonl` + `change-log.jsonl` fixtures; use the existing test tmp-dir pattern). Assert:
   - `writeEntry` with `reopens:["<existing-id>"]` → accepted; `reopens:["<missing-id>"]` → rejected with `reason_code:"dangling_structural_ref"`, no append (registry line count unchanged). Same for `consolidated_into`, `consolidates`, `origin`, `addresses`, `proposed_design_for`.
   - **`applies_to_resolution` RI-EXEMPT (red-team R4):** `writeEntry` with `applies_to_resolution:"test-session-123"` (a determinism-checklist pattern, NOT a registry id) → **accepted** (exempt — the field is `z.string()`, not an entry-id ref; would break legitimate promotion). `applies_to_resolution:"*"` → accepted.
   - **Liveness gap pinned (red-team R8):** `writeEntry` with `reopens:["<deleted-id>"]` where the target is a TOMBSTONE (archived/deleted, id still in projection) → **accepted** (id-existence only; tombstones count as present). The derived `dangling_refs` view flags it post-hoc. State this is the accepted scope, not a bug.
   - **`updateEntry` string code (red-team R7):** changing `description` on a finding with a HISTORICAL `reopens:["<missing-id>"]` → **accepted** (inherited ref not re-validated — the load-bearing case). `updateEntry` that INTRODUCES `consolidated_into:["<missing-id>"]` → returns `"dangling_structural_ref"` (the STRING CODE, not the assertinvariant object). `updateEntry` repointing `reopens` from a missing to an existing id → accepted (`true`). `applyUpdateAndCheck` surfaces `"dangling_structural_ref"` as an actionable rejection, not an opaque throw.
   - `metaStateBatch` `[write finding A, write finding B with reopens:[A]]` → accepted (intra-batch write→reference; B sees A in the in-memory `entries[]`). `[write finding B with reopens:[A]]` where A is NOT in the batch and not in the registry → rejected with `failed_at:0`. **`[write A, delete A, write B with reopens:[A]]`** → B **accepted** (A's tombstone keeps the id — the liveness gap, red-team R8; pin it as accepted).
   - `archiveEntry`/`deleteEntry` on an entry with a dangling ref → **accepted** (exempt; no new cross-ref). `tryClaimSessionId` append with a `reopens` → **accepted, no RI** (red-team R9 — defensive comment only; the direct-append path bypasses RI; pin this is a known limitation, not enforced).
   - Historical read: an entry written with a dangling `reopens` (seeded directly in the fixture, pre-RI) → `readRegistry` + `meta_state_relationships` still return it with `outbound.reopens` populated + the ref tagged `dangling`/`missing` (read path runs no RI; the derived `dangling_refs` view still surfaces it).
2. Run → expect failure (RI not wired).

### Implementation

3. Add `diffChangedRefs(newRefs, oldRefs)` (graph or local; prefer the graph — pure, testable).
4. Wire `writeEntry` RI: snapshot `existenceSet = new Set(readRegistry(root).map(e=>e.id))` inside the lock, wrap the append in `assertinvariant` with `resolveStructuralRI(entry, existenceSet)`. Surface `dangling` in `returnOnFail`.
5. Wire `updateEntry` changed-only RI: compute `changedRefs`, gate the append on them only.
6. Wire `metaStateBatch` per-op RI against the in-memory `entries[]`.
7. Verify `tryClaimSessionId` `entryBuilder()` output: if no cross-refs → leave a comment "no-op: entryBuilder produces no structural cross-refs"; if it does → best-effort RI against `readRegistry`, document the `enqueue`-only (no cross-process lock) limitation in a comment + the phase summary.
8. Re-run Phase 4 tests → green.

### Verification

9. Run the full meta-state test suite — the historical-read-fine + no-public-contract-regression assertions hold; no existing write test breaks (valid fixtures have existing targets; if one has a historical dangling ref intentionally, that test is a *read* path and unaffected).
10. Run `check_runtime_agnostic` on `meta-state.js` → passes (the change is core logic, not surface wiring).
11. Confirm the 4 live `reopens` edges still read fine via `node bin/loop.mjs meta_state_relationships '{...}'` (none re-appended; RI not retroactive).

## Success Criteria

- [x] `writeEntry` emits a **warn-only** structural-RI advisory (gate-log, naming the dangling `{field, id}`) for cross-refs whose target id is never-existent, then appends anyway; **not** assertinvariant-wrapped (the warn uses `appendGateLog` directly); **id-existence only** (tombstones count as present — red-team R8; kind-match NOT checked — red-team R3). CI `meta-state-refs-check.yml` is the hard enforcer (red-team R2)
- [x] `updateEntry` validates only CHANGED/INTRODUCED cross-refs and **accepts** the patch (returns `true`, not a string code) while emitting a warn-only advisory for any changed ref to a never-existent id; an inherited historical dangling `reopens` does NOT block an unrelated edit (load-bearing case pinned). The `"dangling_structural_ref"` string code was **removed** — red-team R7's string-code return is obsolete under warn-only; `updateEntry` keeps its `true`/`null`/`"version_mismatch"` contract
- [x] `metaStateBatch` validates per-op against an in-batch existence accumulator (`inBatchIds`: seeded from the registry + grown by every write-op incl. change-logs, so intra-batch write→reference passes — fixes the intra-batch false-reject); warn-only (no `failed_at:i` rejection — the advisory is logged, the op applies); the `[write A, delete A, write B reopens:[A]]` liveness gap is accepted (tombstone keeps id — red-team R8)
- [x] `archiveEntry`/`deleteEntry`/`shipLoopDesign` exempt (no new cross-refs); `tryClaimSessionId` gets a defensive comment (NO RI — red-team R9; test-only, bypasses writeEntry)
- [x] `applies_to_resolution` RI-EXEMPT (red-team R4 — `z.string()`, not an entry-id ref; `test-session-123` accepted → no advisory); `consolidated_into` advisories at write (immutable, only set there) — warn-only, so the cold-tier `orphans` feature can still create a dangling `consolidated_into` to surface
- [x] Historical entries with legacy dangling refs still read fine; the derived `dangling_refs` view still surfaces deleted/wrong-kind refs post-hoc; the 4 live `reopens` edges read fine
- [x] No `reopens`/`cascade_from` public-contract change; `check_runtime_agnostic` passes; full meta-state suite green

## Risk Assessment

**Moderate.** The check is at the write boundary, so a too-aggressive scope blocks legitimate writes; a too-narrow scope misses the append-first payoff. Mitigations:
- **The update-changed-only boundary is the load-bearing design decision** (scout-3 concern #1): validating inherited unchanged refs would make a historical dangling `reopens` un-editable. Pinned by the "update description on a finding with historical dangling reopens → accepted" test. `diffChangedRefs` is the precise mechanism; get it wrong (e.g. validate all refs) and historical edits block — the test fails loud.
- **Intra-batch reference resolution** (scout-3): using `readRegistry` (pre-append cache) instead of the in-memory `entries[]` for batch would reject `write A; write B reopens:[A]`. Pinned by the intra-batch test. The in-memory `entries[]` is mutated in-batch at the documented lines.
- **Historical-read-fine** (scout-3 concern #2): the read/projection path must run NO RI; a regression that re-validates on read would break existing fixtures. Pinned by the historical-read test. The boundary is RI-at-append-only by construction (the check is in `writeEntry`/`updateEntry`/batch, never in `readRegistry`/`loop-introspect`).
- **`assertinvariant` lock semantics** (scout-3): the wrapper does NOT lock; `writeEntry`/`updateEntry` already hold `withRegistryLock` (nested locking would deadlock). Verify the `assertinvariant` call is inside the existing `withRegistryLock`/`enqueue` scope, not re-locking. `tryClaimSessionId`'s weaker `enqueue`-only lock is documented, not silently inherited as if it were cross-process-safe.
- **Existing write fixtures with dangling refs:** if any existing test seeds a finding with a `reopens`/`consolidated_into` to a non-existent id via `writeEntry` and expects success, it will now fail — that's the intended new enforcement. Audit existing write fixtures in Phase 4 step 9; if a fixture intentionally models a dangling ref as *accepted*, it must be updated to model it as *rejected* (the test was asserting a bug the RI now fixes), or the fixture's target id must be seeded. Record each change.
