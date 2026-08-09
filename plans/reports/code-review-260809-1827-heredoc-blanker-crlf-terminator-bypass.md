# Code Review — Heredoc blanker + recurrence-key normalization

**Target:** last 2 commits on `chore/loop-debug-toolchain-failure`
- `81d46371` `fix(gate): blank quoted-delimiter heredoc bodies + normalize recurrence keys` (implementation)
- `b61cbd6c` `chore(loop): complete heredoc-blanker plan + journal` (plan/journal chore — no code)

**Plan (spec):** `plans/260809-1548-heredoc-blanker-recurrence-key-normalization/plan.md`
**Reviewer effort:** high (ultrathink)
**Verdict:** ⚠️ **1 High finding (CRLF terminator bypass) blocks merge; spec compliance otherwise PASS.**

## Verification evidence (fresh, this session)

| Suite | Result |
|---|---|
| `gate-logic-heredoc.test.js` | 36/36 pass |
| `gate-recurrence.test.js` | 63/63 pass |
| `gate-logic-quoted-strings.test.js` (locked, "pass unchanged") | 32/32 pass |
| gate-logic regression family (verb-layer, echo-prose-pipe-target, data-command-quotes, cli-argv-payload, promoted-rules, inert-sink, quoted-strings, prefixed-echo, glob-whitelist) | 244/244 pass |
| full `legacy-mcp` dir | 3081 pass / 0 fail / 4 skipped |

The `allowlist.has is not a function` stderr line in the run is the intentional fail-closed test (row 24), not a defect.

> Note: the commit message claims "1929 legacy-mcp tests pass"; the actual green count is **3081**. Conservative under-count, not a fabrication — the suite is green. Not a finding.

## Stage 1 — Spec compliance: PASS

The implementation matches the accepted brainstorm contract and all 11 success criteria:

- `stripHeredocBodies` blanks quoted-delimiter (`<<'EOF'`/`<<"EOF"`/`<<-'EOF'`/`<<\EOF`) heredoc bodies for inert verbs; unquoted `<<EOF` and executor-verb (`bash`/`sh`/`python3`) heredocs stay visible (locked by rows 5, 7, 8, unit tests). ✓
- Per-wiring-site allowlists are split exactly as red-team Finding 5 prescribed: PROMOTED + GATEVERB include node-family (accepted bypass, mirrors `stripNodeEvalBody`); CONSTRAINT excludes node-family (`node <<'EOJS' … execSync('sudo docker run')` stays visible — locked by row 15). ✓
- Herestring `<<<` excluded; the over-blank fix consumes the entire `<<<` operator (rows 17–18d lock the regression the commit message describes). ✓
- Gate-verb layer wired (`matchGateVerb` pre-pass, row 19). ✓
- Fail-closed `safeStripHeredocBodies` + `GATE_HEREDOC_BLANKER=0` kill-switch (rows 24–25). ✓
- Coarser tracker key `normalizePrefixForKey`/`blankDataPayloadsForKey` blanks heredoc bodies (quoted AND unquoted), `node -e` bodies (escaped-quote-tolerant, >80-char-tolerant), redirect target + delimiter; over-collapse guard salts post-terminator residue (7 key tests + 5 `findRecurrentGroups`/`checkAndEmit` tests). ✓
- Finding `meta-260809T1433Z-…` resolved (`resolved_by: operator`, resolution cites this plan) — version 2 appended in `meta-state.jsonl`; semantic change recorded in `change-log.jsonl`; `docs/architecture.md` recurring-FP section updated. ✓
- `normalizePrefix` (capture-time redactor in `toolchain-failure-capture.js`) deliberately unchanged — coarser blanking lives only at scan time, matching Finding 4's disposition. ✓

No unjustified extras; no scope drift. The non-goals (rule-pattern changes, finding re-categorization) are respected.

## Stage 2 — Code quality findings

### [HIGH] CRLF line endings defeat heredoc terminator matching → blank-to-end hides a trailing real command from the constraint gate

**Files:** `tools/learning-loop-mastra/core/gate-logic.js` (`stripHeredocBodies`, terminator scan ~L587–601), wired into `matchConstraintPattern` / `matchGateVerb` / `applyPromotedRules`.

**Root cause:** The terminator scan computes each candidate line as `content = command.slice(scan, lineEndIdx)` where `lineEndIdx = indexOf("\n")`. With CRLF (`\r\n`) line endings, the line content includes the trailing `\r`, so `content === termDelim` (`"EOF"` vs `"EOF\r"`) is **never** true. `termStart` stays `-1` → `spanEnd = command.length` → the blanker blanks **to end of command**, swallowing the terminator line AND any real command that follows the heredoc.

**Reproducer (verified this session):**
```
in :  "cat <<'EOF'\r\ndocker run inside body\r\nEOF\r\ndocker run after terminator"
out:  "cat <<'EOF'\r\n\n\n"          ← terminator EOF\r NOT matched; blanked to end
constraint: null                      ← "docker run after terminator" HIDDEN
```
The LF-only form of the same command correctly returns `constraint: "docker"` (post-terminator command survives). So the blanker is correct for `\n` and a bypass for `\r\n`.

**Failure scenario:** An agent submits a command with CRLF line endings (pasted from a Windows-line-ending doc, a tool-input JSON carrying `\r`, or a deliberately crafted payload) of the form `cat <<'EOF'\r\n…\r\nEOF\r\nsudo docker run -it ubuntu`. Because `cat` is blankable and the delimiter is quoted, `stripHeredocBodies` blanks from the body to end-of-command (terminator never matched), erasing the trailing `sudo docker run`. `matchConstraintPattern` returns `null` — the sudo/docker constraint, the gate-verb layer, and `applyPromotedRules` all miss it. The command reaches execution with the constraint gate silently defeated.

**Reachability:** The bash gate reads its command from stdin (`readFileSync(0, "utf8")` → `parseInput` → `extractCommand`) and does **no `\r` normalization** anywhere upstream of the blanker (verified: no `\r` handling in `bash-gate.js` or `gate-logic.js`). The gate is a documented trust boundary (enforces hook-bypass denial, docker/sudo constraints per `docs/architecture.md`), so defeating the constraint gate for post-heredoc commands is a real bypass, not a cosmetic miss.

**Threat model:** Likelihood is low (CRLF in a bash command is uncommon) but the gate is a security boundary and the failure mode is "hide a trailing sudo/docker command" — the same class of bug the herestring over-blank fix (rows 18b–18d) was written to close, just for a different operator. "Uncommon but bypasses a trust boundary" warrants a fix, not a defer.

**Suggested fix (cause-aligned):** Strip a single trailing `\r` from each candidate terminator line before the equality check — `content = content.replace(/\r$/, "")` after the `stripTabs` step (~L596). This restores exact-line matching under CRLF without changing the LF path. Mirror the same `\r` stripping in `blankDataPayloadsForKey`'s one-line-flattened path if CRLF can reach the tracker (the tracker input is the one-line-flattened prefix, so its terminator is the next `;`, not a newline — CRLF likely does not affect it, but worth a one-line check). Add a regression test: CRLF quoted heredoc + trailing real command → post-terminator command stays visible (`matchConstraintPattern` returns the constraint).

**Severity rationale:** High, not Critical — the bypass requires CRLF in the command string (low frequency) and only hides commands *after* a quoted-delimiter heredoc (narrow shape). But it does defeat a security boundary with no error signal, and the fix is one line + one test.

---

### [LOW] `normalizePrefixForKeyCache` is an unbounded module-global Map

**File:** `tools/learning-loop-mastra/core/recurrence-tracker.js:167`

The cache grows for the process lifetime with no eviction. In practice the tracker only runs in short-lived processes (the `gate_check_recurrence` CLI call and the `recurrence-check-on-start` SessionStart hook — both per-scan, not long-lived), so the cache is bounded by decision-log size per scan and the process exits after. **Not a real leak in current wiring.** Flagging only so a future move of the tracker into a long-lived server process (e.g. the MCP server) would need an LRU/eviction cap. No action required now; a one-line comment noting the process-boundary assumption would make the non-leak invariant explicit. Memoization itself is correct — `findRecurrentGroups` + `groupCrossSessionEntries` both call `normalizePrefixForKey` per entry, so the cache halves the blanking cost.

### [INFO] Comment references `resolveVerbIndex`; code calls `segmentVerb`

**File:** `tools/learning-loop-mastra/core/gate-logic.js` — the `stripHeredocBodies` doc block says the verb "is resolved … via `resolveVerbIndex`", but the actual call (L580) is `segmentVerb(command.slice(segmentStart, i))`. There is no `resolveVerbIndex` in the file (only `segmentVerb`). Stale name in a comment — no behavior impact, but it misdirects a future reader grepping for the function. Per the repo's "no stale artifacts in stable code" rule, the comment should name `segmentVerb`.

## Summary

The blanker design is sound and the spec is met with strong test coverage (36 new heredoc cases + 12 recurrence-key cases, all green; 9 locked regression suites unbroken). The one merge-blocker is the CRLF terminator-match bypass — a one-line fix (`content.replace(/\r$/, "")` in the terminator scan) plus a regression test. The cache and comment findings are non-blocking.

**Unresolved questions:**
1. Is CRLF in the command string a shape the gate wants to defend against, or should it be normalized to `\n` once at the input boundary (`bash-gate.js` parseInput) instead of handled in the blanker? Normalizing at input is broader (also fixes any future line-aware scan) but changes the command as the gate sees it; fixing in the blanker is surgical. Operator's call.
