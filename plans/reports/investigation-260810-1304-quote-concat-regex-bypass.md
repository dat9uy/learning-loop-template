# Quote-Concatenation Regex Bypass — Investigation Report

## Executive Summary
- **Issue:** Promoted-rule + first-class-constraint regex layers match raw shell text, so adjacent-quote concatenation (`s''udo`, `do''cker`, `vitest r''un`) hides banned tokens from the gate while the shell still executes them.
- **Impact:** **Wider than the finding documents.** Not just promoted rules — the first-class safety constraints (`docker`, `sudo`, `package-manager`, `vendor-api`) and the path-write integrity gates (`records/**`, `meta-state.jsonl`, runtime-state, decision-log) are all bypassed. `s''udo rm -rf /` returns `decision=ok` from `evaluateBashGate`.
- **Root cause:** Regex matching happens on the raw command string; POSIX adjacent-quote concatenation is a shell-level join the regex never sees. The verb layer (`classifyPolicyTokens`) is a real parser and is NOT vulnerable.
- **Status:** **FIXED on HEAD.** All three documented shapes reproduce; severity escalated to `escalate`. `normalizeQuoteConcatenation` shipped in `blanking.js`, wired into all three raw-text regex surfaces.
- **Fix:** Quote-normalization pass `normalizeQuoteConcatenation` folds adjacent-quote splits (drop empty quoted regions, join adjacent quoted runs) before regex matching. Wired into `matchConstraintPattern`, `applyPromotedRules` (per-segment + full-command), and `evaluateBashGate` path-write checks. Printf/variable dataflow (shapes 2/3) remains a documented bounded limitation.

## Timeline
```
13:04 - /ak-debug invoked with finding meta-260807T1538Z-...
13:06 - Loaded systematic-debugging framework; fetched finding (v0, v1)
13:07 - Read gate-logic.js, blanking.js, evaluate-bash-gate.js; identified 3 matching surfaces
13:08 - Reproduced all 3 documented shapes on HEAD (adjacent-quote, printf split, var composition)
13:09 - Verified shell actually executes adjacent-quote concatenation (ec''ho, ec"h"o both ran)
13:10 - Tested first-class constraints: quote-concat defeats docker/sudo/package-manager/vendor-api
13:11 - Tested full evaluateBashGate: s''udo rm -rf / → decision=ok
13:12 - Tested path-write gates: rec''ords/foo.md, me''ta-state.jsonl → decision=ok
13:13 - Tested verb layer: ba''sh, no''de, pyth''on3 → ALL still caught (immune)
13:20 - Implemented normalizeQuoteConcatenation in blanking.js
13:25 - Wired into matchConstraintPattern, applyPromotedRules, evaluateBashGate
13:28 - Added 32 regression tests (gate-logic-quote-concat.test.js)
13:30 - All locked suites pass (143); core suite passes (851 incl. new)
13:34 - Found+fixed placement-manifest role-layering violation (import via gate-logic facade)
13:35 - cold-tier drift was stale file-index baseline; seeded; passes
13:37 - Escalated finding severity to 'escalate'; updated description with fix shipped
```

## Technical Analysis

### Findings

1. **All three documented shapes confirmed** on HEAD against `rule-no-raw-stdout-vitest`, `rule-no-verify-bypass-denied`, `rule-no-new-artifact-types`:
   - Adjacent-quote: `vitest r''un | tail` → ok (baseline `vitest run | tail` → escalate)
   - printf split: `printf '%s' 'vitest' '%s' 'run' | tail` → ok
   - Cross-segment var: `printf -v x '%s' 'vitest'; printf '%s' "${x} run" | tail` → ok

2. **[Severity escalation] First-class constraints also bypassed** — the finding documents only promoted rules:
   - `s''udo rm -rf /` → **ok** (baseline `sudo rm -rf /` → block)
   - `do''cker run evil` → **ok** (baseline → block)
   - `pip install vn''stock` → **ok**
   - `cu''rl https://api.x.com` → **ok**

3. **[Severity escalation] Path-write integrity gates also bypassed:**
   - `echo x > rec''ords/foo.md` → **ok** (baseline → block)
   - `echo x > me''ta-state.jsonl` → **ok** (baseline → block)

4. **Verb layer is immune** — `classifyPolicyTokens` tokenizes `ba''sh`, `no''de -e`, `pyth''on3` correctly as their executor verbs; all still gate-block. The bypass is specific to the two **raw-text regex** surfaces.

5. **Recurrence catch-net does not apply** — the recurrence tracker only fires when a pattern MATCHES; these commands return `ok`, so they never recur.

6. **Shell semantics verified** — `ec''ho` and `ec"h"o` both execute as `echo`; `e''cho "$(ec''ho nested)"` runs the inner substitution. Real execution bypass, not just a regex gap.

### Evidence

Reproduction: `/tmp/loop-repro/repro.mjs`, `repro-constraints.mjs`, `repro-verb-layer.mjs`, `repro-full-gate.mjs`.

Decisive result:
```
B1  sudo rm -rf /          -> decision=block  (baseline)
S1  s''udo rm -rf /        -> decision=ok     (BYPASS)
B4  vitest run | tail      -> decision=escalate
S4  vitest r''un | tail    -> decision=ok     (BYPASS)
B5  echo x > records/foo.md -> decision=block
S5  echo x > rec''ords/foo.md -> decision=ok  (BYPASS)
B3  bash -c 'x'            -> decision=block (verb layer)
S3  b''ash -c 'x'          -> decision=block (verb layer IMMUNE)
```

### Root Cause

The gate has three detection surfaces:
- **matchConstraintPattern** (first-class constraints, `pattern-config.js`) — regex over raw text
- **applyPromotedRules** (promoted rules, `gate-logic.js`) — regex over raw/blanked text
- **matchGateVerb** (verb layer, `shell-parse.js`) — real tokenizer/parser

The regex surfaces match against the raw command string. POSIX adjacent-quote concatenation means `s''udo` is lexically two tokens `s` + `''` + `udo` but ONE shell word `sudo`. A `\bsudo\b` regex never sees the joined form. The parser layer correctly folds quotes during tokenization, which is why the verb layer is immune.

## Recommendations

### Immediate (P0) — DONE
- [x] Escalate finding `meta-260807T1538Z-...` from `warning` to `escalate` (severity understated — defeats first-class safety constraints + path-write gates, not just promoted rules).

### Short-term (P1) — DONE
- [x] Implement `normalizeQuoteConcatenation` in `blanking.js`: folds empty adjacent quotes, joins adjacent quoted/unquoted runs (quote-aware), preserves command-substitution regions and heredoc delimiters.
- [x] Wire into all three raw-text regex surfaces: `matchConstraintPattern`, `applyPromotedRules` (per-segment + full-command passes). `matchGateVerb` left untouched (already immune via tokenizer).
- [x] Wire into `evaluateBashGate` path-write checks (records/**, meta-state.jsonl, runtime-state, decision-log).
- [x] Add 32 regression tests (`gate-logic-quote-concat.test.js`): 3 documented shapes + first-class constraints + path-write gates + no-false-positive guards.

### Long-term (P2) — OPEN
- [ ] Document the bounded limitation explicitly: printf -v / cross-segment variable dataflow is not reconstructible by a regex gate (shapes 2/3 confirmed still ok post-fix). The existing recurrence + operator vigilance are the residual catch-net.

## Verification Evidence
- All 4 locked gate-logic suites pass (143 tests).
- Full core suite passes (851 tests, 50 files, incl. 32 new).
- `check_runtime_agnostic` on `blanking.js`: 6/6 passed.
- Placement-manifest role-layering: evaluator→facade import (not helper) after fix.
- Repro: `/tmp/loop-repro/repro.mjs`, `repro-constraints.mjs`, `repro-verb-layer.mjs`, `repro-full-gate.mjs`.

## Unresolved Questions
- ANSI-C / locale quoting (`$'wid'getctl`, `$"wid"getctl`) is covered by the same normalizer (drops the `$` + folds). No additional work needed.
- printf -v / cross-segment variable dataflow (shapes 2/3) remains a documented bounded limitation — a regex gate cannot reconstruct shell dataflow. Residual mitigation: recurrence tracker + operator vigilance.
