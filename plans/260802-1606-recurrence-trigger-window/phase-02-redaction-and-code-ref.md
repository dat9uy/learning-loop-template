# Phase 2: Hash redaction + fix evidence_code_ref (co-citation anchor)

## Context

Two defects in what `checkAndEmit` writes, fixed together (both are "what the finding
writes"):

1. **Secret exposure (GO blocker).** `recurrence_key` (`recurrence-tracker.js:116`) and
   `description` (`:117-119`) embed the raw normalized prefix (≤50 chars). A prefix like
   `curl https://api?token=eyJ…` or `AWS_SECRET=… git …` leaks into the **committed**
   `meta-state.jsonl` (`.gate-decision.log` is gitignored; `meta-state.jsonl` is tracked).
2. **Stale/wrong `evidence_code_ref` (P4-dissolution mechanic).** The finding cites
   `tools/learning-loop-mcp/core/recurrence-tracker.js` — stale repo name (`-mcp` →
   `-mastra`) AND it cites the *detector*, not the gate rule. Since P4 dissolves into
   file-index co-citation (PR 109 dropped `reopens`; relationships are emergent at read
   time), the recurring finding must cite the **same gate-rule code B cites**
   (`gate-logic.js#stripNodeEvalBody`) for the link to B to emerge. File-index keys on
   file path (`meta-state.js:1133`, `:line` stripped) → file-granularity co-citation.

Report: §1 (P4 dissolves), §4 (redaction), design decisions #2 + #3.

## Requirements

- `recurrence_key = rule_id::sha256(normalized_prefix)[:12]` — provably non-reversible;
  no secret shape can reach the committed file regardless of form.
- `description` contains **no** raw command fragment (drop `sample_commands`; keep
  `rule_id`, count, duration, first/last ts — all non-secret).
- `evidence_code_ref` resolves, per group, to the **gate-rule code** via the promoted
  rule record's `evidence_code_ref` — NOT the hardcoded detector path.
- Raw commands remain only in the gitignored `.gate-decision.log` for operator forensics.
- Zero existing `recurring-false-positive` findings → the `recurrence_key` format change
  is free (no dedup-compat break).

## Files

- **Read:** `tools/learning-loop-mastra/core/recurrence-tracker.js` (`:109-125` write),
  `tools/learning-loop-mastra/core/meta-state.js` (`readRegistry` for rule lookup;
  `evidence_code_ref` field `:400`; file-index key `:1133`; rule schema `evidence_code_ref`
  `:646`), `tools/learning-loop-mastra/core/gate-logic.js` (`:970,1039` — decision-log
  `rule_id` == meta-state rule id for promoted rules), `tools/learning-loop-mastra/core/gate-decision-log.js`
  (entry shape).
- **Modify:** `recurrence-tracker.js` (hash the prefix in `recurrence_key`; rewrite
  `description`; derive `evidence_code_ref` from the rule record).

## Steps

1. **Hash the prefix.** Add a `hashPrefix(prefix)` helper (`node:crypto`
   `createHash("sha256").update(prefix).digest("hex").slice(0, 12)`). `recurrence_key`
   becomes `${group.rule_id}::${hashPrefix(group.command_prefix_normalized)}`. Update the
   `existingKeys` lookup in `checkAndEmit` to use the same hash (so dedup still matches
   against existing findings' hashed keys).
2. **Drop raw fragments from `description`.** Rewrite to exclude `sample_commands`.
   Keep: `rule_id`, `count`, `durationMin`, `first_ts`, `last_ts`, and the `session_id`
   of the emitting session. These are non-secret. (The hashed prefix is in
   `recurrence_key`; the description need not repeat it.)
3. **Derive `evidence_code_ref` from the rule record.** In `checkAndEmit`, for each fresh
   group, look up the rule record by `group.rule_id` via `readRegistry(root)` (find the
   `entry_kind: "rule"` entry with matching `id`). Set the finding's `evidence_code_ref`
   to that rule's `evidence_code_ref`. Fallback: if the rule record has no
   `evidence_code_ref` (or `rule_id` doesn't resolve to a rule), fall back to the
   gate-logic file path (`tools/learning-loop-mastra/core/gate-logic.js`) — file-granularity
   co-citation still works. **Never** write the stale `tools/learning-loop-mcp/core/recurrence-tracker.js`
   path again.
4. **Scout confirmation (P2 detail, not a fork).** Confirm whether the strip-eval rule's
   `evidence_code_ref` is bare-path or `#line`/`#function`-tagged. File-index strips
   `:line` (`meta-state.js:1133`), so file-granularity co-citation with B
   (`gate-logic.js#stripNodeEvalBody`) holds either way. If the rule record's value is
   already `gate-logic.js#…`, use it verbatim.
5. **Tests (TDD):**
   - A decision log with a secret-shaped prefix (`curl https://api?token=eyJ…`) → the
     emitted finding's `recurrence_key` and `description` contain **no** raw secret
     fragment (grep the written `meta-state.jsonl` fixture). `recurrence_key` matches
     `rule_id::sha256(prefix)[:12]`.
   - The finding's `evidence_code_ref` equals the promoted rule record's
     `evidence_code_ref` (mock a rule record with `id == group.rule_id`), NOT the
     detector path.
   - A group whose `rule_id` resolves to a rule with no `evidence_code_ref` → finding
     falls back to `gate-logic.js` (not the stale `-mcp` detector path).
   - Dedup still works: a second call with the same (hashed) `recurrence_key` and an
     existing finding suppresses re-filing (P3 governs the *status* conditions; here just
     confirm the key-match path is hash-consistent).

## Validation

- Recurrence + meta-state test suites green.
- Co-citation check: with a fixture rule record citing `gate-logic.js#stripNodeEvalBody`
  and B in the registry citing the same, `meta_state_relationships` (or the file-index
  neighborhood read) surfaces the recurring finding and B as co-citing — confirming the
  P4-dissolution link emerges from P2's `evidence_code_ref` fix with no `reopens` write.
- Secret-leak grep on the emitted finding JSON: zero hits for the raw prefix.

## Risk

- **Rule lookup cost.** `readRegistry` is already called for the dedup filter; reusing
  that result for the rule lookup adds no I/O. If `readRegistry` is called twice, fold
  them — one read.
- **`rule_id` not a promoted rule.** A `rule_id` in the log that isn't a meta-state rule
  record id (e.g. a built-in constraint id) → the lookup misses → fallback to
  `gate-logic.js`. Acceptable; co-citation still file-grained. Note: `rule_id: null`
  entries never reach `checkAndEmit` (`:47`), so the no-`rule_id` case is already handled
  upstream.

## Rollback

Revert `recurrence-tracker.js`. Since zero findings exist, no data migration. If P1
already shipped and filed findings with raw prefixes (it shouldn't — P1 keeps raw prefix
temporarily), those would need redaction; **ship P2 before any real burst can fire** to
guarantee no raw-prefix finding is ever committed. (In practice the trigger fires at
SessionStart; ensure P2 lands in the same commit/PR as P1, or P1's raw-prefix window is
empty because no qualifying burst exists yet.)
