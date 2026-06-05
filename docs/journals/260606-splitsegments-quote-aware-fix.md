---
title: "splitSegments quote-aware fix (deeper bug beneath the P1 G8 fix)"
date: "2026-06-06"
session: ck:fix
status: completed
mode: autonomous
finding: "meta-260606T0301Z-splitsegments-quote-unaware-bash-gate-false-positive (resolved by this fix)"
change_log: "meta-260606T0310Z-splitsegments-quote-aware-fix"
related:
  - "meta-260606T0225Z-g8-subcommand-class-false-positive-fixed (P1 fix; was incomplete without this)"
  - "docs/journals/260606-g8-subcommand-class-fix.md (P1 journal; now amended to acknowledge this deeper bug)"
tests: "8 new (quote-aware splitSegments + applyPromotedRules end-to-end); 715 total, 0 failing"
---

# splitSegments quote-aware fix

## Summary

Rewrote `splitSegments` in `tools/learning-loop-mcp/core/gate-logic.js` as a quote-aware state machine. The prior implementation did a naive `command.split(/[;&|]+/)` that fragmented quoted message bodies (e.g., `git commit -m "a;b" -m "c|d"`) on the `;` and `|` inside the quoted strings. This is the deeper bug beneath the P1 G8 subcommand-class fix — the P1 fix refined the rule pattern but the underlying tokenizer was still splitting message bodies, so the refined pattern still fired on legitimate descriptions of the fix itself.

The new state machine tracks single-quote, double-quote, and backslash-escape states (POSIX shell semantics). Separators are only split on when NOT inside a quote and NOT escaped. The function signature, return shape, and downstream behavior (callers receive an array of trimmed, non-empty segments) are unchanged.

## Symptom

The P1 G8 fix (commit hash pending at the time of this writing) refined the rule pattern from `propose|design|create|new\s+(...)` to `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)`. The intent: legitimate triggers like "propose a new schema" still escalate; CLI subcommand names like `ck plan create` no longer false-positive.

When trying to commit the P1 fix, the commit message body contained phrases describing the fix itself — including "(propose/design/create a new schema, new schema, create schema) still escalate" and "false positives; CLI subcommand ...". The bash gate escalated the commit. Investigation showed `splitSegments` was producing 16 segments (one per `;` in the message body) and the refined regex was matching the trigger phrases in fragments 14 and 15 of the body. The P1 fix was correct for subcommand-name class but had not addressed the message-body-fragmentation class.

Per the operator's instruction ("No, let's add the bug to the meta-state, fix it then update. Don't over-confidence. That's how the bug on the hook exists"), the bug was recorded as a meta-state finding **before** the fix was applied.

## Root cause

`splitSegments` in `tools/learning-loop-mcp/core/gate-logic.js:60-63` (pre-fix):

```js
const SEGMENT_SEPARATORS = /[;&|]+/;

export function splitSegments(command) {
  if (!command || typeof command !== "string") return [];
  return command.split(SEGMENT_SEPARATORS).map((s) => s.trim()).filter(Boolean);
}
```

`String.split(/[;&|]+/)` is purely regex-based and has no concept of shell quote state. A `;` inside a quoted string is treated identically to a `;` outside one. Downstream, `stripMessageFlags` correctly handles quoted `-m "..."` values per-segment, but by then the body is already fragmented.

The fundamental layering bug: `splitSegments` is the upstream function; `stripMessageFlags` is downstream. The fix has to be at the upstream layer (quote-aware splitting) rather than the downstream layer (better post-split stripping).

## Fix

`splitSegments` rewritten as a single-pass state machine (no `String.split`, no regex):

```js
export function splitSegments(command) {
  if (!command || typeof command !== "string") return [];
  const segments = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      buf += ch;
      escaped = false;
      continue;
    }

    if (inSingle) {
      buf += ch;
      if (ch === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      buf += ch;
      if (ch === "\\") {
        escaped = true;  // POSIX: \ inside "..." escapes the next char
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }

    // Not in any quote.
    if (ch === "\\") {
      buf += ch;
      escaped = true;
      continue;
    }
    if (ch === "'") { buf += ch; inSingle = true; continue; }
    if (ch === '"') { buf += ch; inDouble = true; continue; }
    if (ch === ";" || ch === "&" || ch === "|") {
      const trimmed = buf.trim();
      if (trimmed) segments.push(trimmed);
      buf = "";
      continue;
    }
    buf += ch;
  }

  const trimmed = buf.trim();
  if (trimmed) segments.push(trimmed);
  return segments;
}
```

**POSIX shell semantics preserved:**
- Inside `'...'` (single quotes): no escapes possible. Everything is literal until the closing `'`.
- Inside `"..."` (double quotes): backslash escapes some chars (we treat it as "consume the next char literally"). `$`, `` ` ``, `"`, `\`, newline are the special cases per POSIX — we don't need to model the difference for our use case (we're not interpreting variables or command substitution; we just need to keep the body intact for the regex check).
- Outside any quote: backslash escapes the next char.

The function signature and return shape are unchanged: `string -> string[]` of trimmed, non-empty segments.

## Tests (8 new, 715 total)

In `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js`:

1. `splitSegments does NOT split on ';' inside single quotes` — `git commit -m 'a;b;c'` → 1 segment
2. `splitSegments does NOT split on ';' inside double quotes` — `git commit -m "a;b;c"` → 1 segment
3. `splitSegments handles nested quote contexts correctly` — `echo "it's fine; really"` → 1 segment (inner `'` does not close the outer `"`)
4. `splitSegments handles backslash escapes outside quotes` — `echo a\;b` → 1 segment
5. `splitSegments handles backslash escapes inside double quotes` — `echo "a\"b;c"` → 1 segment (escaped `"` is literal, `;` is inside the still-open quote)
6. `splitSegments still splits on unquoted separators` — `cmd1; cmd2 "x;y"; cmd3` → `["cmd1", 'cmd2 "x;y"', "cmd3"]` (mix of quoted and unquoted)
7. `splitSegments (regression: splitSegments-quote-unaware bug) — quoted message body with ';' and trigger words stays one segment` — the exact scenario from the P1 commit attempt, asserting 1 segment
8. `applyPromotedRules returns ok for git commit with trigger words in quoted -m body (the P1 latent bug)` — end-to-end test using the canonical P1 active rule; proves the gate no longer escalates the multi-paragraph commit describing the G8 fix

Plus the existing `splitSegments exports correct segments` test still passes (`a; b & c | d` → `["a", "b", "c", "d"]`), confirming backward compatibility for the unquoted case.

## Empirical verification

The actual multi-paragraph commit command (the one that was blocked before the fix):

```
git commit -m "fix(gate): G8 subcommand-class false positive + status filter + safety check" \
  -m "Three coordinated fixes to close the 7 documented G8 recurrences ..." \
  -m "1. loadPromotedRules + applyPromotedRules filters now accept status='resolved' entries ..." \
  -m "2. rule-no-new-artifact-types pattern refined: bare 'create' ... still escalate; CLI subcommand ..."
```

**Before fix:** `splitSegments` produced 16 segments; `applyPromotedRules` returned `decision: "escalate", rule_id: "rule-no-new-artifact-types"`. The commit was blocked.

**After fix:** `splitSegments` produces 1 segment (the entire command); `applyPromotedRules` returns `decision: "ok"`. The commit proceeds.

## Blast radius

`splitSegments` is called from:
- `core/gate-logic.js:110` — `matchConstraintPattern` (the built-in constraint pattern matcher)
- `core/gate-logic.js:518` — `applyPromotedRules` (the promoted-rule matcher)

Both callers iterate the result and call `stripMessageFlags` per segment. The downstream contract (array of trimmed, non-empty segments) is preserved. The 26 existing tests in `gate-promoted-rules.test.js` and the 5 integration tests in `integration-promoted-rule.test.js` all pass with the new implementation.

The pre-fix `splitSegments` was also called (transitively) from `matchConstraintPattern`, which checks against the 5 built-in patterns: `package-manager`, `sudo`, `docker`, `vendor-api`, `side-effect-import`. None of these patterns would have been affected by the bug (they match simple commands without quoted separators), but the fix is defensive: every `;&|` in any context is now correctly tokenized.

## Meta-state changes

This fix:
- **Resolved** the finding `meta-260606T0301Z-splitsegments-quote-unaware-bash-gate-false-positive` (added in this session, resolved by this change)
- **Added** the change-log `meta-260606T0310Z-splitsegments-quote-aware-fix`

The P1 G8 fix change-log (`meta-260606T0225Z-...`) is **not** amended — it correctly describes the regex refinement, status filter, and safety check that shipped. The deeper `splitSegments` bug is a separate, orthogonal finding. Future meta-state introspection (via `loop_describe` cold tier + `superseded_lineage`) will surface the full lineage: the P1 fix was a partial fix; the splitSegments fix completed the picture.

## Lessons (for the future)

- **Test the real command path, not the synthetic test path.** The P1 fix added 16 new tests but every test used a hand-crafted command string without `;` in quoted bodies. The real commit command (with `;` in the body) was not tested. The hook at `c374d99` had a similar blind spot — tests covered the mock-spawn path, not the real-spawn path.
- **Don't claim completion of a "P1" fix without empirically exercising the fix in the same context that triggered the original bug.** A commit attempt with the trigger words in the body would have surfaced the splitSegments bug immediately. The fix should have been verified by attempting a commit before claiming the test suite was sufficient.
- **Record the bug before fixing it.** Per the operator's instruction, the finding was added to meta-state.jsonl **before** the fix was applied. This is a discipline that prevents the "fix completed" confidence from outrunning the actual gap. The same discipline that surfaced the c374d99 chicken-and-egg deadlock (a finding recorded before the fix) was applied here.

## References

- Commit (P1, regex refinement + status filter + safety check): pending at the time of this journal's authoring; see `docs/journals/260606-g8-subcommand-class-fix.md` for the P1 journal.
- Finding: `meta-260606T0301Z-splitsegments-quote-unaware-bash-gate-false-positive`
- Change-log: `meta-260606T0310Z-splitsegments-quote-aware-fix`
- Code: `tools/learning-loop-mcp/core/gate-logic.js#splitSegments` (the fix)
- Tests: `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js` (8 new tests in the "gate promoted rules G8 stripMessageFlags" describe block)
- Related bug: commit `c374d99` (the spawnAndCall chicken-and-egg fix) — same operator discipline (record-then-fix), same lesson (real-spawn test wasn't covered by mock-spawn tests)
