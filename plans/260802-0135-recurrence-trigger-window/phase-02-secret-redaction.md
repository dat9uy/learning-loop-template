---
phase: 2
title: "Secret redaction (GO blocker)"
status: pending
priority: P1
effort: "1-2h"
dependencies: [1]
---

# Phase 2: Secret redaction (GO blocker)

## Overview

Prevent secret-shaped command fragments from reaching the **committed**
`meta-state.jsonl` via the auto-filed recurrence finding. The current `checkAndEmit`
embeds raw `sample_commands` in the `description` **and** embeds the raw normalized
prefix in `recurrence_key` — both land in the tracked registry. Hash the prefix in
`recurrence_key` and drop raw prefixes from the `description`. Raw commands remain only
in the gitignored `.gate-decision.log`.

This is the report's CAUTION→GO blocker (rec 2). It must ship before any recurrence
finding is auto-filed into the committed registry.

## Requirements

- Functional:
  - `recurrence_key` is `rule_id::sha256(normalized_prefix)[:12]` — non-reversible.
  - The finding `description` contains **no** raw command prefix (no `sample_commands`).
  - Dedup still works: the same prefix produces the same hash → same `recurrence_key`.
  - Different prefixes produce different hashes → distinct findings.
- Non-functional:
  - Provably leak-free: no heuristic that can false-negative on a secret shape.
  - The gitignored `.gate-decision.log` retains raw commands for operator forensics.
  - No breaking change to existing dedup: there are **zero** existing
    `recurring-false-positive` subtype findings (the auto-trigger has never fired) →
    no compat break.
  - **In-call dedup (red-team C1):** per-session grouping (P1) can return multiple
    groups sharing one `recurrence_key` (same prefix, different sessions). `checkAndEmit`
    must dedup `fresh` groups by `recurrence_key` so it writes **one finding per key**
    per call, not one per session (which would pollute the registry with duplicate
    dedup keys).

## Architecture

A pure helper `prefixHash(normalizedPrefix)` produces a stable 12-char sha256 prefix.
`checkAndEmit` uses it for `recurrence_key`; the `description` references the hash, not
the raw command. The grouping key (P1) still uses the raw `normalized_prefix` internally
(for counting) — only the *emitted* finding fields are hashed.

```
recurrence-tracker.js#checkAndEmit
  recurrence_key = `${group.rule_id}::${prefixHash(group.command_prefix_normalized)}`
  description = `Pattern recurred ${count} times across session(s): `
              + `${rule_id} (prefix-hash ${hash}). First: ${first_ts}. Last: ${last_ts}.`
              # NO sample_commands, NO raw prefix
  writeEntry(root, finding)
```

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/recurrence-tracker.js`
  - Add `prefixHash(prefix)` (sha256, 12-char). Keep `normalizePrefix` as-is (still used for grouping).
  - `checkAndEmit`: build `recurrence_key` from `prefixHash`; rewrite `description` to omit `sample_commands` and raw prefix.
  - `checkAndEmit` (C1): dedup `fresh` groups by `recurrence_key` in-call — maintain a `seenKeys` set seeded from `existingKeys`, and skip a group whose key is already seen, so only one finding is written per key even when multiple sessions crossed threshold for the same prefix.
  - `findRecurrentGroups` may stop returning `sample_commands` (no longer consumed) — drop it to avoid carrying raw commands through the group object.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js`
  - Update the `checkAndEmit: emits finding` assertion: `recurrence_key` is now `rule::<hash>`, not `rule::node -e x`.
  - Add the secret-leak test (see steps).

## Implementation Steps (TDD — tests first)

1. **Test first.** In `gate-recurrence.test.js`:
   - Add: "checkAndEmit: secret-shaped prefix produces no raw secret in the finding" — write 3 entries with prefix `curl https://api.example?token=eyJhb_SECRETVALUE`, run `checkAndEmit`, read the emitted `meta-state.jsonl` line, and assert it does **not** contain `SECRETVALUE` nor `eyJ` nor `token=`; assert `recurrence_key` is `rule-no-new-artifact-types::<12-hex>`.
   - Add (C1): "checkAndEmit: two sessions same prefix → one finding" — write 3 entries with `session_id: A` and 3 with `session_id: B` for the same prefix, run `checkAndEmit`, assert `findings_emitted === 1` (not 2) and the single finding's `recurrence_key` is unique.
   - Add: "prefixHash is stable + distinct" — same prefix → same hash; different prefix → different hash.
   - Update the existing emit test: `recurrence_key` matches `^rule-no-new-artifact-types::[a-f0-9]{12}$`; `description` does not contain the raw prefix `node -e x`.
2. **Run tests — expect failure** (current code emits raw prefix + samples).
3. **Implement `prefixHash`** in `recurrence-tracker.js` (sha256, slice 12).
4. **Rewrite `checkAndEmit`**: `recurrence_key` from `prefixHash`; `description` without raw prefix/samples; drop `sample_commands` from the group object.
5. **Run tests — expect green.** Grep the test's emitted `meta-state.jsonl` for the secret literal to confirm absence.

## Success Criteria

- [ ] A secret-shaped prefix yields a finding whose `recurrence_key` and `description`
      contain no raw secret fragment (grep-verified).
- [ ] `recurrence_key` matches `^<rule_id>::[a-f0-9]{12}$`.
- [ ] Same prefix → same `recurrence_key` (dedup intact); different prefix → different.
- [ ] `description` min-length (20 chars) still satisfies the schema validator.

## Risk Assessment

- **Risk:** Hashing loses prefix readability in the committed finding — an operator
  triaging the finding sees a hash, not the offending command.
  **Mitigation:** the gitignored `.gate-decision.log` retains raw commands; the
  `description` names the `rule_id` and points to the log. This is the trade-off
  documented in plan.md §D2 / Open Question 4. If validation chooses heuristic
  redaction instead, swap `prefixHash` for a `redactSecrets(prefix)` helper here.
- **Risk:** Changing `recurrence_key` format could break dedup against existing
  auto-filed findings.
  **Mitigation:** there are none (the single existing finding has `recurrence_key:
  null`, confirmed via `grep`). Free format change.
- **Risk:** `description` dropping to <20 chars fails the schema `min(20)`.
  **Mitigation:** the rewritten description includes rule_id, count, timestamps, and
  the hash — well over 20 chars; the test asserts the schema-validates via `writeEntry`.