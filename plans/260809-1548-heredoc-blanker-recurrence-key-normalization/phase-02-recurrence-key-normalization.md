---
phase: 2
title: "Recurrence-key normalization"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Recurrence-key normalization

## Overview

Normalize the recurrence-tracker grouping key through a **coarser-than-the-gate** blanker so all payload variants of one root-cause class under one rule hash to a single `recurrence_key` — one finding per class, not one per command shape. The red team proved the original design (re-blank what the gate already blanks) guarded nothing: it must be coarser, blanking heredoc bodies **quoted AND unquoted** and `node -e` bodies **escaped-quote-tolerant**, because the key is a grouping artifact with no bypass consequence.

## Requirements

- Functional:
  - A new `normalizePrefixForKey(prefix)` (tracker-only, NOT the shared `normalizePrefix`) blanks, before quote-strip / whitespace-collapse / 50-char truncation: (a) ALL heredoc bodies regardless of delimiter quoting (quoted `<<'EOF'` AND unquoted `<<EOF` — the residual class Phase 1 deliberately leaves visible); (b) `node -e`/`--input-type=module` bodies opening-quote-to-end (escaped-quote-tolerant — the documented `stripNodeEvalBody` limitation); (c) the redirect target and delimiter word for blankable-verb heredocs, so `cat > /tmp/VARYING <<'EOF'` shapes collapse.
  - **Over-collapse guard (red-team Finding 3):** the key is salted with a residue of post-heredoc real command text, so data-only body variants collapse but a distinct trailing real command (`; vitest run | tail` after the heredoc) does NOT collapse into the false-positive class. Concretely: include a short hash of the tokens that follow the heredoc terminator (or the post-`<<` span when truncated) in the key input.
  - `normalizePrefix` (the shared function) is UNCHANGED — it stays the capture-time redactor used by `toolchain-failure-capture.js:114` and the debug emitters (`:107,:123`). The coarser blanking lives only in `normalizePrefixForKey`, applied at scan time (`recurrence-tracker.js:105,205`). This isolates the behavioral change to key derivation and leaves capture redaction / secret hygiene untouched (red-team Finding 4 / AD3 redaction concern).
  - Grouping, thresholds, cross-session slow-burn, and `buildFinding` semantics otherwise unchanged.
- Non-functional: memoize `normalizePrefixForKey(entry.command_prefix)` per entry across both passes (red-team Finding 15 — it is currently invoked twice per entry with no memoization). State the new per-entry cost budget in the phase.

## Architecture

The decision log stores an 80-char flattened `command_prefix` (`gate-decision-log.js:7–13,36`); the tracker hashes the normalized prefix (`recurrence-tracker.js:19–46`). Two log paths differ (red-team Findings 4 + AD3):
- **Gate-escalation log** (`bash-gate.js` → `appendDecisionLog` → `oneLinePrefix`): preserves quotes (`oneLinePrefix` only flattens newlines + truncates) → `<<'EOF'` stays quoted → `normalizePrefixForKey` blanks it. Collapse works.
- **Toolchain-failure log** (`toolchain-failure-capture.js:114` → `normalizePrefix` at capture): quotes pre-stripped → `<<EOF` unquoted → the gate's `stripHeredocBodies` would refuse, BUT `normalizePrefixForKey` blanks unquoted heredocs too, so toolchain-failure entries DO collapse under the coarser key. (Using the separate `normalizePrefixForKey` at scan time means the capture redaction is unchanged.)

```js
// tracker-only, coarser than the gate blanker
function blankDataPayloadsForKey(prefix) {
  // (a) all heredoc bodies, quoted AND unquoted; (b) node -e bodies to end;
  // (c) redirect target + delimiter word for blankable-verb heredocs.
  // Returns a string for hashing ONLY — never reaches the gate.
}
function normalizePrefixForKey(command) {
  const blanked = blankDataPayloadsForKey(command);
  return normalizePrefix(blanked); // reuse the existing truncate/quotes/whitespace pipeline
}
```

**Truncation-tolerance (red-team Findings 11 + AD7):** when the 80-char window cuts a `node -e "…"` body before its closing quote, or cuts a `<<` operator / delimiter word (`<<'E`), `blankDataPayloadsForKey` blanks opening-quote-to-end / partial-operator-to-end (the unterminated rule). Add a test with a >80-char body and a >80-char `cd /long/path … cat <<'E` prefix.

**Test re-baseline (red-team Finding 10):** the following `gate-recurrence.test.js` sites hardcode legacy normalized forms and WILL break; enumerate them with expected new forms so the edits are reviewable, not improvised:
- `:64,81-82,92-94,98` — `node -e "…"` prefixes; under `normalizePrefixForKey` the body blanks to `node -e` (was `node -e echo foo` at `:98`). Re-baseline `command_prefix_normalized` expectations.
- `:276-299` — `node -e "x"` → expected hash over `"node -e x"`; re-baseline to the blanked form.
- `:325-333,362,387,412,437` — dedup-suppression tests construct existing findings keyed by the OLD hash; under new keys suppression fails and `findings_emitted` flips 0→1. Re-baseline the `existingHash` inputs to the new key derivation.
- `:908,1160` — `normalizePrefix`-derived expectations; verify against `normalizePrefixForKey`.

**First post-ship re-file burst (red-team Finding 14):** key derivation changes globally, so every open/accepted/resolved `recurring-false-positive` whose class is still recurring re-files under the new key on the first post-ship SessionStart — contradicting prior resolution promises (e.g. `meta-state.jsonl` "will NOT re-file at next SessionStart"). Mitigation: add a dedup fallback — suppress when a non-archived finding exists for the same `rule_id` whose description's normalized prefix matches the new `normalizePrefixForKey` output (description-keyed fallback, not just `recurrence_key`-equality). Quantify the expected re-file count by scanning the registry for `subtype: recurring-false-positive` before ship, and pre-draft the dispositions.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/recurrence-tracker.js` (`normalizePrefixForKey` + `blankDataPayloadsForKey` helper; rewire `:105,205` to use it with memoization; dedup fallback in `resolveDedupIndex`/`collapseFreshByKey`; JSDoc on the key-change consequence + re-file burst mitigation)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` (re-baseline the enumerated sites + new cases below)
- **Consumers accounted for (contract-verifier):** `normalizePrefix` (unchanged) is also called by `toolchain-failure-capture.js:45,107,114,123` (capture redaction — UNCHANGED, intentionally not given the coarser blanking) and `gate-recurrence.test.js:12,908,1160` (test harness — re-baselined).

## Implementation Steps

1. Add failing tests to `gate-recurrence.test.js`:
   - N≥3 same-session entries, same rule, `cat <<'EOF'` with **different bodies** → exactly one finding.
   - `cat <<EOF` (unquoted) with different bodies → one finding (the coarser key blanks unquoted too).
   - `node -e "…A…"` vs `node -e "…B…"` variants under one rule → one finding.
   - `node -e "…>80-char body…"` (closing quote truncated) → one finding across variants.
   - `cat > /tmp/VARYING <<'EOF'` bursts (varying redirect path + delimiter name) → one finding (mirrors the live logged shapes).
   - **Over-collapse guard:** `cat <<'EOF' … EOF; vitest run | tail` (distinct trailing real command) → does NOT collapse into the bare `cat <<'EOF'` false-positive class → two findings.
   - Two genuinely different command shapes (`cat <<'EOF'…` vs `pnpm test … | tail`) under one rule → two findings.
   - Re-baselined legacy sites (`:98,297,332,362,387,412,437`) pass with new expected forms.
   - Dedup-fallback: an existing resolved finding for the same `rule_id` + matching description-prefix suppresses a new-key re-file.
2. Implement `blankDataPayloadsForKey` + `normalizePrefixForKey` + memoization + dedup fallback.
3. Run `gate-recurrence.test.js` and the full legacy-mcp suite.

## Success Criteria

- [ ] Multi-body heredoc burst (quoted AND unquoted) → one `recurring-false-positive` finding
- [ ] `node -e` payload variants (incl. >80-char truncated) → one finding
- [ ] Varying redirect-path/delimiter-name bursts → one finding
- [ ] Over-collapse guard: a distinct trailing real command does NOT collapse into the false-positive class
- [ ] Distinct real shapes → distinct findings
- [ ] Enumerated legacy test sites re-baselined and passing (each edit justified in a test comment)
- [ ] Dedup fallback suppresses the first-post-ship re-file burst for classes with an existing same-rule finding
- [ ] `normalizePrefix` (capture redaction) unchanged — `toolchain-failure-capture.js` behavior verified

## Risk Assessment

- **Over-collapse: normalization blanks text that distinguished two real classes.** Mitigation: the over-collapse guard salts the key with post-terminator real-command residue; the "distinct trailing real command → two findings" test locks it. Signal: that test fails. Response: widen the residue hash (more post-terminator tokens).
- **Legacy-key orphan re-files** — mitigated by the dedup fallback; if it still proves noisy, the disposition path (resolve with link) absorbs the residual duplicates. Quantified before ship.
- **Re-baseline drift** — the enumerated site list is the contract; if grep finds more hardcoded-key sites than enumerated, add them before declaring the suite green.