---
phase: 1
title: "stripHeredocBodies blanker"
status: complete
priority: P1
effort: "7h"
dependencies: []
completed: 2026-08-09
---

# Phase 1: stripHeredocBodies blanker

## Overview

Add a `stripHeredocBodies(command)` pure string pre-pass to the blanker family in `gate-logic.js`, blanking the body of **quoted-delimiter** heredocs attached to **inert verbs**, and wire it into every command-match path — including the gate-verb layer, which the red team proved splits on `|`/`&&`/`;` inside heredoc bodies. Ships behind an env kill-switch with fail-closed error handling.

## Requirements

- Functional:
  - Blank the body (between operator line and terminator line) of `<<'EOF'` / `<<"EOF"` / `<<-'EOF'` heredocs when the receiving segment's verb is in the **wiring-specific** blankable set (below); replace body content but preserve line structure (newlines retained) and keep operator + terminator lines intact.
  - Leave **unquoted** `<<EOF` bodies fully visible: POSIX expands `$(...)` / backticks / `$var` in unquoted bodies, so the body can execute — visible = no bypass, possible residual false-fire (accepted, documented; collapsed tracker-side by Phase 2's coarser key, NOT by this blanker).
  - Leave heredocs to **executor verbs** fully visible regardless of delimiter quoting: `bash`, `sh`, `zsh`, `dash`, `python`, `python3`, `ruby`, `perl`, `awk`, `sed`, `ssh` heredoc bodies run as programs — the heredoc analogue of the locked `stripNodeEvalBody` asymmetry.
  - **Herestring exclusion:** `<<<` is a distinct op (`shell-parse.js:55-56,290,300`); the `<<-?` scan MUST require the char after `<<-?` to not be `<`, so `node <<< 'code'` (which feeds code to stdin and executes) is never misparsed as a quoted heredoc and blanked.
  - **Opaque-span recognition:** once a heredoc operator+delimiter is recognized, scan for the terminator line-based; on terminator found, resume scanning AFTER it with quote state reset to NORMAL (the shell does not quote-parse heredoc bodies — a body `don't` must not open a quote region that hides a later `<<`).
  - Node-family verbs (`node`, `nodejs`, incl. `--input-type=module` stdin-script forms) with quoted delimiter → blanked in `applyPromotedRules` only (mirrors the existing `stripNodeEvalBody` accepted-bypass scope), documented as the accepted-bypass sibling (JS source is data to the shell gate; `child_process` bypass is the same accepted class, same recurrence catch-net).
- Non-functional: pure function, O(n) single scan; no changes to `walkQuoteState` / `splitSegments` semantics (pre-pass architecture). Fail-closed: any throw returns the original command unchanged with a stderr diagnostic. Kill-switch: `GATE_HEREDOC_BLANKER=0` short-circuits the pre-pass at every call site.

## Architecture

**Split allowlist per wiring site (red-team Finding 5):** the blanker's safety rests on never blanking an executing body, but the two wiring sites have different bypass contracts.
- `applyPromotedRules` (promoted regex rules — the `rule-no-raw-stdout-vitest` class): blankable = `DATA_COMMANDS` (`grep egrep fgrep rg jq`) ∪ `{cat, tee}` ∪ node-family (`NODE_VERB_RE`). Node-family is an accepted bypass here, mirroring `stripNodeEvalBody` at `gate-logic.js:575` — JS source is data to the shell gate.
- `matchConstraintPattern` (first-class boundaries: docker/sudo/package-manager/vendor-api): blankable = `DATA_COMMANDS` ∪ `{cat, tee}` **only** — node-family EXCLUDED, because `node <<'EOJS'` reads stdin and executes it; blanking it here would hide `node <<'EOJS' … require('child_process').execSync('sudo docker run …')` from the docker/sudo constraints. `bash <<'EOF' … docker run` stays visible (executor verb).
- `matchGateVerb` / `classifyPolicyTokens` (gate-verb layer): blankable = `DATA_COMMANDS` ∪ `{cat, tee}` ∪ node-family, applied as a pre-pass BEFORE `classifyPolicyTokens`, so a heredoc body line containing `| bash` no longer fractures into a gate-verb block. (Red-team Finding 7: the previous "no observed false-fires" deferral was false — `classifyPolicyTokens` splits inside heredoc bodies, and gate-verb decisions carry `rule_id: null` so the recurrence tracker never sees them, blinding the catch-net.)

Allowlist-not-denylist remains the load-bearing safety decision: an unrecognized verb defaults to *visible* (safe direction — false-fire, never bypass).

**Recognition algorithm (quote-aware scan over the raw command):**
1. Scan for `<<-?` outside quotes, with the char after `<<-?` NOT `<` (herestring exclusion). Reuse the quote-state discipline of `walkQuoteState` for the pre-heredoc region only.
2. Parse the delimiter word after optional whitespace. Per POSIX, quoting **any part** of the delimiter word suppresses expansion (`'EOF'`, `"EOF"`, `\EOF`) → body is data-eligible. Unquoted → stop, leave visible.
3. Resolve the receiving verb: tokens of the segment prefix before `<<`, via `resolveVerbIndex` (shell-parse.js) — skip env-assignments and command prefixes, basename-normalize. Verb not in the wiring-specific allowlist → leave visible.
4. Find the terminator: a line whose content (leading tabs allowed iff `<<-`) is exactly the delimiter. Unterminated + quoted delimiter → blank to end of string. **Opaque span:** from operator line through terminator, do not run quote-state tracking on body chars; resume after terminator with quote state = NORMAL.
5. Replace body lines' content with empty (keep `\n` count, keep terminator line).

**Wiring (pre-pass on the raw command, all three sites):**
- `applyPromotedRules` (`gate-logic.js:1497–1604`): apply at the top (covers both the per-segment pass `:1547` and the `fullStripped` chain `:1582`). Null-guard: skip when `command` is null (`evaluate-write-gate.js:418` calls with `command=null`; the regex branch already null-guards at `:1531`, but the pre-pass call must too).
- `matchConstraintPattern` (`gate-logic.js:570–582`): apply at the head.
- `matchGateVerb` (`gate-logic.js:614`): apply before `classifyPolicyTokens(command)`.
- **Preview divergence (contract-verifier note):** `meta-state-promote-rule-tool.js:178` rule-preview tests samples with raw `new RegExp(pattern).test(cmd)`, bypassing the blanker chain — post-Phase-1 the preview will disagree with the gate on heredoc shapes. Document this as a known preview/gate divergence (pre-existing pattern); do NOT silently route the blanker into the preview without operator sign-off.

**Fail-closed + kill-switch (red-team Findings 8, 9):**
- Every call site wraps the blanker in `try { stripped = stripHeredocBodies(cmd) } catch { stripped = cmd; console.error("stripHeredocBodies: failed, treating as un-blanked") }` — fail-visible, treats as un-blanked (matches the allowlist's "unknown ⇒ visible" safety direction). Add a matrix row asserting blanker-throw ⇒ gate still evaluates on the original command.
- `GATE_HEREDOC_BLANKER=0` short-circuits the pre-pass (returns the command unchanged) at every call site — the recovery lever if a blanker bug ships, since hooks run from the working tree on all three runtimes simultaneously.
- **Telemetry gap (red-team Finding 9, accepted+documented):** `bash-gate.js:43` skips `appendDecisionLog` when `decision === "ok"`, so an over-blank (dangerous direction) produces no log entry and the recurrence catch-net goes blind to it. The kill-switch + fail-closed + allowlist + executor-verb/prefixed-executor test rows reduce over-blank risk to near-zero; the kill-switch is the documented recovery lever. Do NOT change `ok`-skips-logging semantics (that would flood the decision log) without a separate operator decision.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (new `stripHeredocBodies` + `BLANKABLE_HEREDOC_VERBS_PROMOTED` / `BLANKABLE_HEREDOC_VERBS_CONSTRAINT` / `BLANKABLE_HEREDOC_VERBS_GATEVERB`; wiring at `matchConstraintPattern`, `applyPromotedRules`, `matchGateVerb`; fail-closed wrappers + kill-switch; JSDoc)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-quoted-strings.test.js` (assert no regression — existing rows unchanged)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-heredoc.test.js` (matrix below + the report's 8-shape fixture)

## Implementation Steps

1. Write the failing test file first: matrix below + the report's 8-shape fixture.
2. Implement `stripHeredocBodies(command, allowlist)` + the three allowlist sets in `gate-logic.js` near the other strip functions (`:446–463` area).
3. Wire into `matchConstraintPattern`, `applyPromotedRules` (with null-guard), and `matchGateVerb`, each with fail-closed try/catch + `GATE_HEREDOC_BLANKER` kill-switch.
4. Run new tests; run the full gate-logic-related suite (`gate-logic-quoted-strings`, `gate-logic-inert-sink`, `gate-logic-cli-argv-payload`, `gate-recurrence`, `gate-logic-data-command-quotes`, `bash-gate-runtime-state-record`, `gate-promoted-rules`).
5. Re-run the report's 8-shape matrix against `evaluateBashGate` and record the result table.

## Test matrix (all in the new test file)

| # | Shape | Expected |
|---|-------|----------|
| 1 | `vitest run foo 2>&1 \| tail -10` | escalate (real) |
| 2 | `pnpm test 2>&1 \| grep FAIL` | escalate (real) |
| 3 | `cat <<'EOF' … pnpm test foo \| tail … EOF` | ok (was false-fire) |
| 4 | `node --input-type=module <<'EOJS' … EOJS` | ok (promoted-rule pass; accepted-bypass doc) |
| 5 | `cat <<EOF … pnpm test \| tail … EOF` (unquoted) | escalate (visible residual — NOT blanked) |
| 6 | `cat <<'EOF' … $(vitest run \| tail) … EOF` | ok (quoted delimiter suppresses expansion) |
| 7 | `bash <<'EOF' … vitest run … \| tail … EOF` | escalate (executed-body asymmetry) |
| 8 | `sh <<'EOF' …` / `python3 <<'EOF' …` | escalate (asymmetry) |
| 9 | `<<-'EOF'` with tab-indented body + terminator | ok |
| 10 | heredoc body containing `;` / `&` / `\|` mid-line | no segment fracture, per verb allowlist |
| 11 | `cat <<'EOF' > f.txt … EOF` (redirect after operator) | ok |
| 12 | unterminated `cat <<'EOF' …` | ok (blank to end, quoted delimiter) |
| 13 | `cat <<'EOF' … docker run … EOF` via `matchConstraintPattern` | null (cat inert) |
| 14 | `bash <<'EOF' … docker run … EOF` via `matchConstraintPattern` | `docker` match (executor visible) |
| 15 | `node <<'EOJS' … require('child_process').execSync('sudo docker run') … EOJS` via `matchConstraintPattern` | `sudo`+`docker` match (node EXCLUDED from constraint allowlist) |
| 16 | `node <<'EOJS' … pnpm test \| tail … EOJS` via `applyPromotedRules` | ok (node in promoted allowlist; accepted bypass) |
| 17 | `node <<< 'require("child_process").execSync("pip install x")'` | escalate / `package-manager` match (herestring NOT blanked) |
| 18 | `cat <<< 'x'; bash -c '…'` (herestring then a real command) | second command stays visible |
| 19 | `cat <<'EOF' … \| bash … EOF` via `matchGateVerb` | no gate-verb block on body `bash` |
| 20 | `sudo bash <<'EOF' … vitest run \| tail … EOF` | escalate (prefixed executor — asymmetry under command prefix) |
| 21 | `nice python3 <<'EOF' …` | escalate (prefixed executor) |
| 22 | two heredocs: `cat <<'A' …A\nbash <<'B' …vitest run \| tail…\nB` | `bash` body visible (per-heredoc verb attribution) |
| 23 | heredoc body with unbalanced quote: `bash <<'EOF'\necho "don't"\nEOF\ncat <<'EOF'\npnpm test x \| tail\nEOF` | second heredoc still recognized (opaque-span quote reset) |
| 24 | blanker-throw (inject a throw) ⇒ gate evaluates on original command | escalate/ok per original; stderr diagnostic emitted |
| 25 | `GATE_HEREDOC_BLANKER=0` ⇒ pre-pass short-circuits | shape 3 re-false-fires (kill-switch verified) |
| 26 | `<<` inside a quoted string (`echo "a <<'EOF'"`) | not treated as operator |

## Success Criteria

- [x] All 26 matrix rows pass (33 tests in `gate-logic-heredoc.test.js`)
- [x] Report's 8-shape fixture: 2 real violations escalate; shapes 3–4 heredoc false-fires become `ok`; shape 5 (unquoted) escalates as a visible residual
- [x] `gate-logic-quoted-strings.test.js`, `gate-logic-inert-sink.test.js`, `gate-logic-cli-argv-payload.test.js`, `gate-recurrence.test.js` pass (Phase 2 re-baselines the recurrence tests)
- [x] JSDoc on `stripHeredocBodies` states: per-wiring-site allowlists + their bypass contracts, herestring exclusion, opaque-span quote reset, unquoted-visibility rationale, executor-verb asymmetry, node accepted-bypass sibling note, kill-switch + fail-closed

## Execution Log (2026-08-09)

### Reviewer-caught herestring bypass (fixed)
Code review found a CRITICAL bug: the herestring exclusion emitted only ONE `<` of the `<<<` operator, leaving the remaining `<<` to be re-parsed as a heredoc on the next iteration. When a NEWLINE followed the herestring body, a real command on the next line (e.g. `docker run`) was blanked to end and hidden from the constraint layer. Fixed by emitting the ENTIRE `<<<` operator and advancing past it (`gate-logic.js` `stripHeredocBodies` + `recurrence-tracker.js` `blankDataPayloadsForKey`). Added regression rows 18b–18d (herestring + newline + docker/sudo) and a tracker-side test.

## Risk Assessment

- **Tokenizer bug blanks an executed body → silent bypass** (the dangerous direction). Mitigation: per-wiring-site allowlists (node excluded from constraints; executor verbs excluded everywhere), herestring exclusion, opaque-span recognition, executor-verb rows 7–8/14/15/20–22, fail-closed + kill-switch. Signal it broke: any of rows 5/7–8/14–15/17/20–22 flipping to ok in CI. Response: flip `GATE_HEREDOC_BLANKER=0`, revert wiring, keep the function behind tests until fixed.
- **Over-blank erases telemetry** (`bash-gate.js:43` skips logging on `ok`) — accepted+documented; kill-switch is the recovery lever. Signal: missing escalations noticed days later. Response: kill-switch + revert.
- **`walkQuoteState` regression surface** — avoided by design: pre-pass architecture, opaque-span quote reset means the walker is never fed heredoc body chars. Signal: existing quoted-strings/inert-sink tests fail. Response: fix the pre-pass, not the walker.
- **Preview/gate divergence** (`meta-state-promote-rule-tool.js:178`) — documented as known; do not route the blanker into the preview without operator sign-off.