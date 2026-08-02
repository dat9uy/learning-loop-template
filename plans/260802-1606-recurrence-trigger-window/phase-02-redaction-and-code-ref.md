# Phase 2: Finding payload hygiene (id, description) + evidence_code_ref (grounding anchor)

## Context

Three defects in what `checkAndEmit` writes, fixed together (all are "what the finding
commits to the tracked `meta-state.jsonl`"):

1. **Finding `id` leaks the raw prefix (red-team Critical).** `generateFindingId`
   embeds `slugify(prefix)` (`recurrence-tracker.js:73-77,108`; `slugify.js:5-10`) —
   lowercase, non-alphanumeric→hyphens, ≤60 chars. A base64url token survives slugify
   nearly intact. P1 already hashes `recurrence_key`; this phase removes the last raw
   fragment from the committed record.
2. **`description` embeds raw `sample_commands`** (`:117-119`) and, post-P1, a
   `durationMin` computed across the whole log history (e.g. "recurred 46 times in
   ~60000min") — nonsense that masquerades as burst intensity.
3. **Stale/wrong `evidence_code_ref` (P4-dissolution mechanic).** The finding cites
   `tools/learning-loop-mcp/core/recurrence-tracker.js` — stale repo name AND it cites
   the *detector*, not the gate rule. Since P4 dissolves into read-time discovery (PR 109
   dropped `reopens`), the recurring finding must cite the **same gate-rule file B cites**
   (`gate-logic.js`) so grounding queries surface them together. Corrected mechanic
   (red-team): file-index is grounding-only, **not** a relationship edge
   (`docs/meta-state-lifecycle.md:246`); the link is verified via
   `meta_state_check_grounding` / `meta_state_query_drift` ("which findings touch this
   file"), NOT `meta_state_relationships` (declared-edge graph only).

Report: §1 (P4 dissolves), §4 (redaction), design decisions #2 + #3.

## Requirements

- Finding `id` is derived from the hash (or rule_id + random suffix) — never
  `slugify(prefix)`. No raw command fragment appears **anywhere** in the serialized
  finding JSON.
- `description` contains no raw command fragment (drop `sample_commands`) and no
  whole-history `durationMin`. Keep: `rule_id`, count in the emitting session, number of
  distinct sessions crossing threshold, and first/last **seen** timestamps (relabeled —
  they are sighting bounds, not a burst duration).
- `evidence_code_ref` resolves, per group, to the **gate-rule code** via the promoted
  rule record's `evidence_code_ref` — NOT the hardcoded detector path.
- **Rule-record backfill (blocking prerequisite, red-team):** today 0/15 rule records
  carry `evidence_code_ref` (verified against the live registry projection) — without a
  backfill the derivation falls through to the fallback 100% of the time and is dead
  code on arrival.
- Raw commands remain only in the gitignored `.gate-decision.log` for operator forensics.
- Zero existing `recurring-false-positive` findings → format changes are free.

## Files

- **Read:** `tools/learning-loop-mastra/core/recurrence-tracker.js` (`:73-77` id gen,
  `:109-125` write), `tools/learning-loop-mastra/core/slugify.js`, `tools/learning-loop-mastra/core/meta-state.js`
  (`readRegistry` for rule lookup; `evidence_code_ref` field `:400`; rule schema `:646`),
  `tools/learning-loop-mastra/core/gate-logic.js` (`:970,1039` — decision-log `rule_id`
  == meta-state rule id for promoted rules), `tools/learning-loop-mastra/core/gate-decision-log.js`
  (entry shape).
- **Modify:** `recurrence-tracker.js` (`generateFindingId`, `description`, derive
  `evidence_code_ref` from the rule record).

## Steps

1. **Fix `generateFindingId`.** Take the hashed key (or `rule_id` + `randomBytes`
   suffix) instead of the raw prefix. Verify no other field embeds the prefix (grep the
   serialized finding in tests).
2. **Rewrite `description`.** Drop `sample_commands` and `durationMin`. Format:
   `rule_id`, `count` (emitting session), `sessions_crossing_threshold`, `first_seen`,
   `last_seen`, plus the emitting `session_id`. All non-secret.
3. **Derive `evidence_code_ref` from the rule record.** In `checkAndEmit`, for each
   fresh group, look up the rule record by `group.rule_id` via `readRegistry(root)`
   (find the `entry_kind: "rule"` entry with matching `id`; reuse the dedup-filter
   registry read — one read, fold if called twice). Set the finding's
   `evidence_code_ref` to the rule's value. Fallback: rule missing or field empty →
   `tools/learning-loop-mastra/core/gate-logic.js` (file-granularity grounding still
   works). **Never** write the stale `tools/learning-loop-mcp/core/recurrence-tracker.js`
   path again.
4. **Backfill rule records (operator step, before/with this phase; scope validated
   2026-08-02).** Via `meta_state_patch`, set `evidence_code_ref` on exactly three
   records: the two rule_ids present in the decision log (`rule-no-raw-stdout-vitest`,
   `rule-no-new-artifact-types`) and the strip-eval rule. Not all 15 — no current
   consumer for the rest. Confirm whether each value is
   bare-path or `#line`/`#function`-tagged; file-index strips `:line`
   (`meta-state.js:1133`), so file-granularity grounding with B holds either way.
<!-- Updated: Validation Session 1 - backfill scope pinned to 3 rule records -->
5. **Tests (TDD):**
   - A decision log with a secret-shaped prefix (`curl https://api?token=[redacted]`) →
     grep the **entire serialized finding JSON** (id, recurrence_key, description, all
     fields): zero hits for the raw prefix.
   - `id` contains no prefix fragment (format: `meta-<ts>Z-<hash-or-random>`).
   - `description` has no `sample_commands`, no `durationMin`; has per-session count +
     first/last seen labels.
   - `evidence_code_ref` equals a (backfilled) rule record's value; falls back to
     `gate-logic.js` when the rule lacks the field; never the `-mcp` detector path.
   - Dedup still matches on the hashed key across calls (P3 governs status conditions).

## Validation

- Recurrence + meta-state test suites green.
- Grounding check (corrected, red-team): with the strip-eval rule citing
  `gate-logic.js#stripNodeEvalBody` and B in the registry citing the same file,
  `meta_state_check_grounding` / `meta_state_query_drift` list the recurring finding and
  B as findings touching `gate-logic.js` — the P4-dissolution link, with no `reopens`
  write and no declared edge.
- Secret-leak grep on the whole finding JSON: zero hits for the raw prefix.

## Risk

- **Backfill is operator-gated.** If the backfill (step 4) is skipped, every finding
  cites the `gate-logic.js` fallback — acceptable file-grained grounding, but wrong for
  future rules gating other files. Ship checklist must include the backfill.
- **Rule lookup cost.** Reuse the dedup filter's `readRegistry` result; one read.
- **`rule_id` not a promoted rule** (built-in constraint id) → lookup misses → fallback.
  Acceptable. `rule_id: null` entries never reach `checkAndEmit` (`:47`).

## Rollback

Revert `recurrence-tracker.js`. Zero findings exist → no data migration. Hashing shipped
in P1, so no raw-prefix finding can exist to redact; nothing depends on merge ordering.
