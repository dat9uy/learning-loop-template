# Disposition Report: retract the `gate-logic-bug` label on the rule-no-raw-stdout-vitest false-fire finding

- **Report type:** disposition / correction of the open finding's characterization
- **Date:** 2026-08-09
- **Target finding:** `meta-260809T1433Z-promoted-rule-rule-no-raw-stdout-vitest-v2-pattern-vitest-ru` (open, `gate-logic-bug`, `warning`, v0)
- **Supersedes (direction only):** the "recommended direction: regex anchoring" recorded in `acc0278d` and in the finding's `description`. The diagnosis that the rule fires on text stands; the **fix direction is retracted as unsound**.
- **Outcome:** resolve (not archive) with corrected characterization. No code change.

## The real risk is the open mislabeled finding, not the noise

The finding is categorized `gate-logic-bug`, but the gate logic is **correct by design**. The false-fire is an accepted **blanker-substrate limitation**, not a gate-logic bug. The hazard of leaving it open under that label: a future debug pass (agent or human) pulls the open `gate-logic-bug` finding, reads the recorded "regex anchoring" direction, and applies it — which **regresses the documented `bash -c`/`sh -c`/`python -c` executed-body asymmetry**. The open mislabeled finding routes the next session toward an unsound fix. Neutralizing that label is the point of this disposition; the `warn`-mode noise is a symptom, not the risk.

## Corrected diagnosis

Reproduced against the live registry (`evaluateBashGate`, repo root). The rule `(vitest run|pnpm test\b).*\| *(tail|head|grep)\b` compiles with no flags (`new RegExp(pattern)`: `.` does not cross newlines, `^` is string-start only) and runs in two passes (per-segment, then a lossless full-command rejoined pass; `gate-logic.js:1536–1586`).

| Command shape | Verdict | Mechanism |
|---|---|---|
| `vitest run foo 2>&1 \| tail -10` | escalate ✓ | real violation |
| `pnpm test 2>&1 \| grep FAIL` | escalate ✓ | real violation |
| `cat <<'EOF' … pnpm test foo \| tail … EOF` | escalate ❌ | heredoc body **not blanked** |
| `node -e "console.log(\"pnpm test a \| tail\")"` | escalate ❌ | `stripNodeEvalBody` stops at escaped `\"` (**documented** limit, `gate-logic.js:303–306`) |
| `node --input-type=module <<'EOJS' …` | escalate ❌ | heredoc + node, not blanked |
| `echo "…pnpm test… \| grep…"` `\| reader` | ok ✓ | `stripEchoProse` works |
| `grep -E "pnpm test\|grep" x.md \| tail` | ok ✓ | `stripDataCommandQuotes` works |

So the false-fire lives in the **data-blanking gaps** (`heredoc` bodies unhandled; `node -e` escaped-quote already a documented-and-accepted limitation with its `gate_check_recurrence` catch-net). The blanker substrate is exactly the layer that distinguishes data from execute: `stripNodeEvalBody` is **asymmetric by design** (`gate-logic.js:285–291`) — it blanks `node -e`/`--input-type=module` bodies (data) but deliberately **not** `bash -c`/`sh -c`/`python -c`/`awk`/`sed` bodies (they execute, so a banned token in `bash -c "vitest run … | tail"` is a real violation).

## Why the recorded "regex anchoring" direction is unsound

A delimiter anchor `(^|[;&|]\s*)` would block the heredoc false-fire (there the test token is preceded by `\n`/`"`, not by `; & |` or string-start) but it **cannot** distinguish a quote-preceded test token in a *data* heredoc from one in an *executing* `bash -c "vitest run … | tail"` body — both are quote-preceded. The only component that knows data-vs-execute is the blanker, not the regex. Anchoring therefore regresses the executed-body asymmetry: `bash -c 'vitest run foo | tail'` (a real violation caught today) would be let through. **Do not apply.**

Narrowing on `2>&1` is also unsound: real violations without `2>&1` would slip through (the `2>&1` in the existing tests is not a contract).

## Disposition

**Resolve, `resolved_by: operator`.** Resolution text records:

1. **Retract the `gate-logic-bug` characterization.** The gate evaluates correctly by design. This is an accepted blanker-substrate limitation — heredoc bodies are not blanked; sibling to the documented `node -e` escaped-quote gap (`gate-logic.js:303–306`) which is already accepted with its `gate_check_recurrence` catch-net.
2. **Rule out the recorded "regex anchoring" direction as unsound.** Reason above (regresses the `bash -c`/`sh -c`/`python -c` executed-body asymmetry that `stripNodeEvalBody` establishes by design).
3. **Durable-fix direction (deferred):** a `stripHeredocBodies` blanker in the existing `stripDataCommandQuotes`/`stripEchoProse`/`stripNodeEvalBody`/`stripCliArgvPayload` family. Revisit only if false-fire frequency rises or an agent is actually misled. Deliberately not rushed — heredoc tokenization in the quote-aware `walkQuoteState` walker touches the gate engine and carries a non-trivial regression surface (quoted `<<'EOF'` vs unquoted `<<EOF` that shell-expands `$(…)`, a real bypass boundary).
4. **Status `resolved`, not `archived`.** Keeps the finding visible (registry `readRegistry` returns max-by-version with no status filter) as the root-cause anchor for future false-fire recurrences. The finding has no `recurrence_key` (slug id), so archive-vs-resolve only affects backlog hygiene, not re-filing — resolve is the precedent (`cbab4a3d`, `038e9eea`).

`category` stays `gate-logic-bug` in the stored record — the category enum (`gate-logic-bug|record-repair-gap|schema-drift|mcp-tool-missing|budget-check|loop-anti-pattern`) has no "accepted-limitation / non-bug" value, and `meta_state_resolve` cannot re-categorize. The resolution text + `resolved` status is the durable correction; the open-bug backlog risk is neutralized by `resolved` (the finding no longer surfaces as an open bug to chase).

## Evidence

- Repro: `evaluateBashGate({command, root})` over the 8-shape matrix above (run 2026-08-09, repo HEAD). 2 real violations escalate; 4 false-fires escalate; 2 blanker-covered shapes ok.
- Code refs: `gate-logic.js:285–311` (`stripNodeEvalBody` + asymmetry doc), `:303–306` (escaped-quote limitation), `:446–463` (`stripDataCommandQuotes`/`stripEchoProse`), `:1536–1586` (two-pass rule application, no-flag `new RegExp(pattern)`).
- Rule record: `rule-no-raw-stdout-vitest` v2 active, pattern `(vitest run|pnpm test\b).*\| *(tail|head|grep)\b`.
- Sibling finding: `meta-260807T065133Z-6d1973a8` (printf-feed harness), same root cause, resolved in `acc0278d` referencing this finding.
- Precedent (resolve-as-accepted): `meta-260807T054940Z-cbab4a3d`, `meta-260808T200708Z-038e9eea`.
- Prior reports: `debug-260809-1420-…-recurrence-shape.md` (diagnosis stands), `debug-260809-1423-…-recurrence-disposition.md` (filed this finding; left open).

## Patch applied

`meta_state_patch` on the finding sets `evidence_journal` → this report path (v0→v1), so the retracted direction and the accepted-limitation classification travel with the record. Status remains `open` — the resolve itself is a separate step the operator drives from this report.

## Unresolved questions

- Whether/when to implement `stripHeredocBodies` (the deferred durable fix). Not blocking; deferred to the operator. The `node -e` escaped-quote case is already accepted with its catch-net; heredoc is the only un-handled class.