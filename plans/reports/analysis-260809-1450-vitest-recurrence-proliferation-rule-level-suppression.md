# Analysis: Vitest recurrence — L1/L2 duplication and the wrong suppression seam

**Branch:** `chore/resolve-vitest-recurrence-finding` (PR #130)  
**Date:** 2026-08-09  
**Scope:** advisory — re-checks the prior report against the L1/L2/L3 model, separates the real duplicated Vitest policy from test-fixture repetition, and replaces the proposed rule-level suppression with a cause-aligned design. No code change here.

## Verdict

The prior report correctly proves the recurrence-key behavior, but its proposed fix is at the wrong altitude. Adding `recurrence_filing` or an accepted-limitation record to the rule would suppress legitimate and potentially distinct violations under the same rule. The real defect is that the recurrence tracker interprets every repeated gate fire as a `gate-logic-bug` / `recurring-false-positive` finding, even when the rule fired correctly.

The better fix is to repair the L2 event contract: **a rule match is telemetry; a recurrence finding requires an independently identified unexpected match.** Keep the L1 invariant, make the L2 distinction explicit, and let L3 provide match provenance through the existing parser. Do not add suppression metadata to the Vitest rule.

## Layer map

The repository's canonical layer model is in `docs/loop-engine.md:7-15`:

- **L1 — concept.** Stable engine theory: a finding is a deferred decision; a rule is a promoted invariant; the loop grows the deterministic surface. L1 does not say that every repeated rule match is a finding, nor that a whole rule can be silently accepted because one command class was triaged.
- **L2 — mechanism/contract.** The runtime contract that realizes those roles: test output is consumed through a machine-readable result artifact, the gate is the deterministic boundary, and recurrence detection may turn a repeated *gap* into a finding. L2 must distinguish a legitimate rule use from an unexpected rule match.
- **L3 — implementation.** Today’s files and wiring: `meta-state.jsonl`, `applyPromotedRules`, `bash-gate.js`, `gate-decision-log.js`, `recurrence-tracker.js`, package scripts, and runtime-specific hint copies.

The missing distinction is therefore not “which extra field should this rule carry?” It is “what event is L2 promising the recurrence tracker it is receiving?”

## What is duplicated, and what is not

### D1 — The same L2 Vitest policy is represented by two L3 paths (real, but intentional roles)

The invariant is: **do not use raw Vitest stdout as the result interface; use the JSON result artifact and deterministic parser.** It appears in two operational paths:

1. **Positive path:** `package.json:21-22` (`test:iter`, `test:one`) runs Vitest while suppressing raw stdout and calls `tools/scripts/vitest-failures.sh`, which parses `.test-logs/vitest-results.json`.
2. **Negative boundary path:** `meta-state.jsonl:12` promotes `rule-no-raw-stdout-vitest`, a regex that escalates raw Vitest/test output piped to `tail`/`grep` (and test fixtures also cover `head`). `evaluateBashGate()` invokes the generic promoted-rule evaluator at `evaluate-bash-gate.js:236-240`.

This is a real duplication of one operational policy across the positive adapter and the negative gate. It is not evidence that the recurrence tracker should suppress the rule. The two paths have different responsibilities: one makes the safe action easy; the other catches bypasses. The L2 contract should be written once and both L3 paths should realize it.

The prose is also copied into multiple injection surfaces: `core/hint-registry.js:236`, `core/loop-introspect.js` process hints, and `.factory/hooks/loop-surface-inject.cjs`. Those copies are maintenance drift, but they are not the recurrence bug.

### D2 — The Vitest matcher is not duplicated in production gate code

`gate-logic.js` does not contain a second Vitest regex. `applyPromotedRules()` is a generic evaluator (`gate-logic.js:1700-1824`); the Vitest pattern is data in the rule registry. The repeated `NO_RAW_STDOUT_PATTERN` constants in `evaluate-bash-gate.test.js:292` and legacy test files are test fixtures, not a second runtime implementation.

The two passes in `applyPromotedRules()` (`gate-logic.js:1741-1799`) are also not accidental duplicate Vitest logic:

- the per-segment pass handles matches inside command segments;
- the full-command pass handles patterns spanning a real pipe that segment splitting removes.

Removing one would reopen a known matching surface.

### D3 — There is genuine production duplication in command normalization

The real shared-logic seam is the data classification used by the gate and the tracker:

- `gate-logic.js:764-779` and the promoted-rule path use the fail-closed heredoc/data blanking chain before deciding whether a command matches;
- `recurrence-tracker.js:73-180` implements `blankDataPayloadsForKey()` / `normalizePrefixForKey()` as a deliberately **coarser** tracker-only mirror.

The tracker comments explicitly say the second pass is coarser because it groups commands and has no bypass consequence. Therefore simply extracting one identical blanker would be unsafe: the gate must preserve executable bodies and the tracker may collapse data variants. The correct refactor is a shared parser/tokenizer substrate with explicit modes, not one shared regex and not rule metadata.

## Recurrence behavior verified from source

### F1 — The current key is prefix-scoped

`findRecurrentGroups()` groups by `(rule_id, normalizePrefixForKey(command_prefix), session_id)` (`recurrence-tracker.js:242-290`). `recurrenceKeyFor()` hashes the rule and normalized prefix (`:439-441`). A different command shape under the same rule can therefore produce a different key and a new finding.

### F2 — Resolution still suppresses the exact key

`resolveDedupIndex()` excludes only archived recurring findings (`recurrence-tracker.js:461-475`); `resolved` remains in `existingKeys`. The locked `writeEntryIfAbsent()` path applies the same non-archived key check (`core/meta-state.js:1465-1490`). Thus resolving PR #130 does not re-file the same key. A genuinely different normalized prefix can still be new.

### F3 — The tracker misclassifies ordinary rule use

`buildFinding()` unconditionally stamps recurrence output as:

- `category: "gate-logic-bug"`,
- `subtype: "recurring-false-positive"` (`recurrence-tracker.js:507-540`).

The decision log contains only non-`ok` events because `bash-gate.js:42-45` logs inside `emitIfBlocked()`. It does not record ground truth that a match was unexpected. Consequently the tracker cannot distinguish:

- a legitimate violation correctly escalated by `rule-no-raw-stdout-vitest`, from
- an inert heredoc/echo/data string that accidentally matched a broad rule.

The PR #130 record is the first class: its resolution records three real `npx vitest run … | <reader>` invocations, and the gate was correct. Calling that a recurring false positive is a semantic L2 failure, not evidence that the rule needs a suppression flag.

### F4 — Prefix proliferation is a symptom, not the root cause

The report's F1/F2 observation remains valid: per-prefix keys can create multiple rows. But a row is only harmful here because the tracker files ordinary legitimate rule use as a bug finding. Rule-level suppression would hide the symptom by suppressing all future prefixes, including a future genuinely different violation. It would also conflict with the existing regression contract in `gate-recurrence.test.js:1327-1348`, which requires two genuinely distinct shapes under one rule to produce two findings.

## Cause-aligned design

### L1: preserve the concept boundary

Keep the L1 concepts unchanged:

- the rule remains the deterministic boundary;
- a finding remains a deferred decision about a gap;
- a legitimate rule fire is not a gate bug merely because it recurs;
- a new false-positive class can still become a finding when the system has evidence that the match was unexpected.

No new L1 concept such as “accepted rule recurrence” is needed.

### L2: split rule-fire telemetry from recurrence findings

Define one L2 contract for the event stream:

1. **Rule fire** — deterministic telemetry that a gate rule matched. It is retained in `.gate-decision.log` and may be counted/aggregated, but it is not automatically a `gate-logic-bug` finding.
2. **Unexpected match candidate** — a gate result carrying provenance that the match came from an inert/data region or another explicitly identified false-positive class. Only this class is eligible for automatic recurrence finding.
3. **Toolchain failure** — remains its own capture path; it must not be folded into gate-rule recurrence semantics.

This is the missing contract. It solves both the mislabel and the proliferation pressure without a per-rule opt-out. If no deterministic provenance exists, the system should preserve telemetry and defer the judgment rather than manufacture a false-positive finding.

### L3: implement the contract at the parser boundary

Use a shared command-classification substrate for gate and tracker, with explicit policy modes:

- `gate` mode: fail closed; preserve executable heredoc/node/shell bodies;
- `recurrence` mode: normalize data variants for grouping, but retain a semantic class/provenance marker;
- `event` mode: serialize `match_origin` / `candidate_kind` into the decision log when the evaluator can prove it.

The matcher remains generic and the registry rule remains declarative. No `recurrence_filing` field is added to `rule-no-raw-stdout-vitest`. The recurrence tracker consumes `candidate_kind`, not merely `rule_id + prefix`.

A minimal first implementation can avoid changing the persisted finding schema: only emit automatic recurrence findings for explicit `unexpected-match` events; ordinary rule fires continue to be visible in the decision log and recurrence result counters. A later semantic-class aggregate may reduce repeated rows while still surfacing new classes, but it is not required to fix this incident.

## Alternatives rejected

### Rejected: per-rule `recurrence_filing` / `suppress-true-positive`

This adds an L3 field to compensate for an L2 event-classification error. It suppresses all prefixes under a rule, destroys visibility of new command classes, and creates a standing exception whose semantics are not part of the L1 rule lifecycle.

### Rejected: rule-level accepted-limitation finding

This moves the same suppression into another record shape. It still treats a whole rule as the bound unit even though the existing recurrence contract and tests deliberately distinguish semantic command shapes.

### Rejected: regex-only anchoring or more rule text

Anchoring the Vitest pattern can reduce some accidental matches but cannot reliably distinguish inert heredoc/echo data from executable `bash -c`, `python -c`, or process-substitution bodies. More description in the rule does not create parser evidence.

### Deferred: no code change until volume is measured

The current registry does not establish that per-prefix volume is material enough to justify a new suppression mechanism. Measuring rule-fire telemetry is reasonable. It does not change the diagnosis of PR #130: the finding's subtype is wrong for a legitimate rule fire.

## Disposition of PR #130

PR #130's resolve-not-archive behavior is correct for exact-key deduplication. Its resolution text correctly records that the three commands were legitimate rule fires. The follow-up should not be “add rule-level suppression.” It should be:

> Separate ordinary promoted-rule fires from unexpected-match recurrence candidates; centralize the L2 test-output contract and share a mode-aware command-classification substrate between the gate and recurrence tracker.

Until that follow-up exists, the honest behavior is to keep the raw decision telemetry and avoid auto-filing ordinary repeated rule use as `recurring-false-positive`.

## Acceptance tests for the follow-up

1. Real `vitest run … | tail/grep/head` commands still escalate under `rule-no-raw-stdout-vitest`.
2. The sanctioned parser workflow remains allowed and returns the JSON-derived result.
3. Repeated legitimate Vitest rule fires do not auto-file `gate-logic-bug` / `recurring-false-positive` findings.
4. An evaluator-proven inert-data match can still become an unexpected-match recurrence candidate.
5. Executable `bash -c`, `sh -c`, `python -c`, process-substitution, and real trailing-command cases remain visible to the gate.
6. Two genuinely distinct semantic command classes under one rule remain distinguishable; no rule-wide suppression is introduced.
7. Gate and tracker normalization share tokenization/classification primitives but retain explicit fail-closed versus grouping modes.
8. Runtime-specific hint copies either derive from one canonical L2 contract or are covered by a drift test.

## Unresolved questions

1. Should ordinary rule-fire telemetry be aggregated in the decision log only, or should a separate low-noise report expose counts without using finding records?
2. Can the existing parser prove `unexpected-match` provenance for every historical false-positive class, or must some cases remain operator-filed findings?
3. Which single L2 artifact should own the test-output contract so `core/hint-registry.js`, `loop-introspect.js`, and runtime adapters cannot drift?
4. What measured rule-fire volume and operator cost would justify a semantic-class aggregate rather than telemetry-only handling?
