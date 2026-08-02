# Recurrence trigger design — supersedes session-blindness proposals

**Supersedes:** `investigation-260801-2349-session-9851176a-session-blindness.md` (problem diagnosis retained; P1–P4 proposals outdated).
**Scope:** the trigger mechanism for push-captured gate-escalation recurrence → meta-state registry. Channel A (discrete gate escalations) only. Channel B (in-context recognition, the 454–461 near-miss) is out of scope for the trigger and stays on steering + human retrospective.

## 1. The prior report's problem is right; its solutions are not loop-native

Two stacked issues with P1–P4.

### Layer 1 — factual: the proposals re-build machinery that already exists
- **Push capture at the interception point already runs.** `bash-gate.js` calls `appendDecisionLog` on every escalation → `.gate-decision.log` (cross-surface, agent-independent).
- **Aggregation + auto-file into the registry already implemented.** `core/recurrence-tracker.js`: `findRecurrentGroups` groups by `rule_id + normalized_prefix`, counts within N≥3 / M≤10min; `checkAndEmit` files a `recurring-false-positive` finding via `writeEntry`.
- **The batched trigger already exists and is wired.** `hooks/universal/recurrence-check-on-start.cjs` calls `checkAndEmit` at every SessionStart.
- The report's P1 ("append to a recurrence log… gate_check_recurrence becomes a read of real data… auto-file can fire without agent initiative") describes the end-state already in place. Its own unresolved question — "does the hook have a write path it can reuse?" — answers yes, fully. The report didn't open `recurrence-tracker.js`.

### Layer 2 — architectural: the proposals reach for new substrate instead of existing primitives
The loop has one evidence unit (the meta-state record) and one lifecycle primitive for "new evidence revises an old finding" (`reopens` + cascade-resolve). P1–P3 ignore both:
- **P2** ("recurrence-pressure signal in `meta_state_derive_status`; make accepted-limitation revisable") reinvents `reopens` + cascade-resolve, which already does exactly that natively.
- **P3** (commit-time summary printer) is a display layer; the registry *is* the summary, queryable via `meta_state_list({session_id})`.
- **P4** (steering hint) is the one genuinely native proposal — retained.

Meta-irony: the report is itself an instance of the disease it diagnoses — it generated ideal evidence and captured the most loop-native fact (`recurrence-tracker.js` exists) through no loop channel, then proposed re-building it.

## 2. The loop-native fix (small)

1. **Trigger wiring** — the already-built pipeline fires without agent initiative. Only the *window semantics* are broken (see §3); the trigger moment (SessionStart) is correct.
2. **Reopen linkage** — when `checkAndEmit` files a `recurring-false-positive` for a `rule_id` with an acked/accepted open finding (e.g. B / `meta-260615T1920Z`), set `reopens: ['<B-id>']` + cascade-resolve. Converts "B stays open, self-validated" into "B reopened by in-vivo evidence" via the existing primitive. No new derivation field.
3. **Minor field** — add `session_id` to decision-log entries (enables session grouping + `meta_state_list({session_id})` linkage).

## 3. Trigger mechanism: keep SessionStart, fix the window

Rejected alternatives:
- **Push-inline (per-escalation `checkAndEmit`)** — synchronous disk+registry I/O in the gate critical path, paid on every blocked command forever; buys nothing (decision log already push-complete; filing mid-session doesn't change agent behavior — it already knows it was blocked). Out.
- **SessionEnd** — not a wired harness event here. Runtime uses SessionStart / UserPromptSubmit / PreToolUse only. Code comments mark SessionEnd as *deferred*, not implemented. Factual blocker, out.
- **commit-msg** — reliable (wired via `simple-git-hooks`) but redundant once SessionStart works; misses commit-less sessions. YAGNI.

Selected: **SessionStart, with the window bug fixed.**

The bug: `findRecurrentGroups` filters `readDecisionLog({ since: now - 10min })`. At next-session start, a burst from the prior session is >10min old → zero groups → nothing filed. The 10-min window does **double duty** as both *burst definition* (what counts as recurrence) and *scan range* (what to look back at). That only works if the trigger fires within 10min of the burst — false for human-paced cadence.

Fix: **replace the time axis with the session axis.** Add `session_id` to decision-log entries; group `findRecurrentGroups` by `(rule_id, normalized_prefix, session_id)` with threshold N≥3 *per session*; drop the 10-min `since` filter. The session is the natural recurrence unit (the disease is intra-session recurrence), it's loop-native, and it removes the double-duty by eliminating the time axis.

## 4. The token/context concern is a category error

Objection: "firing at SessionStart injects unrelated context — wasted tokens when the agent's task is unrelated."

False for the recurrence channel. `recurrence-check-on-start.cjs` does `writeEntry` + `console.error` + `process.exit(0)` — it emits **no `hookSpecificOutput.additionalContext`**, the only SessionStart channel that injects into agent context.

| Channel | Mechanism | Agent-token cost | When agent sees it |
|---|---|---|---|
| Context injection | `hookSpecificOutput.additionalContext` | real, every session | immediately, unconditional |
| Silent registry write | `writeEntry` + `console.error` | **zero** | only on *pull* |

The recurrence trigger is in the silent-write channel. Cost at SessionStart: disk I/O in the hook process + one stderr line; **0 agent tokens**. Relevance filtering already lives at the pull layer, not the trigger layer:
- explicit pull: agent `meta_state_list` / `loop_describe` (task-driven);
- conditional pull: the inbound-state-gate at `UserPromptSubmit`, *triggered* (per `CLAUDE.md`), not unconditional.

So: **capture everything cheaply at the interception point; pay context tokens only when relevance is established at pull.** That's the loop's existing evidence architecture; the recurrence trigger already fits it. The fix should keep the trigger in the silent-write channel and never promote it to `additionalContext`.

The objection *does* legitimately apply to the two `additionalContext` SessionStart hooks (`session-start-inject-discoverability.cjs`, `session-start-inject-process-hints.cjs`) — those cost tokens every session and are a separate, pre-existing design question, not part of this trigger decision.

## 5. Recommendation (ordered)

1. **Fix the window → session grouping.** Add `session_id` to `appendDecisionLog` (in `bash-gate.js` / `gate-decision-log.js`); group `findRecurrentGroups` by `(rule_id, normalized_prefix, session_id)`, threshold N≥3 per session, drop the 10-min `since` filter. Minimal change to make the already-wired SessionStart trigger fire for human-paced cadence.
2. **Verify secret exposure before shipping (CAUTION→GO blocker).** Filed finding `description` embeds `sample_commands` (raw command prefixes ≤50 chars) → lands in `meta-state.jsonl`. If the registry is committable, redact secret-shaped fragments in `recurrence-tracker` before writing, OR confirm `.gate-decision.log` + `meta-state.jsonl` are gitignored.
3. **Extend dedup to resolved findings via a `resolved_at` grace predicate** so a resolved recurrence doesn't re-file from stale log entries every SessionStart. The watermark already lives in meta-state (the resolved finding's `resolved_at` + `recurrence_key`); widen `checkAndEmit`'s `existing` filter (`recurrence-tracker.js:87–97`) from `isOpen(e)` to `isOpen(e) || (e.status === "resolved" && withinGrace(e.resolved_at))` with a single tunable constant. Do **not** reuse runtime-state for this — see §7 (wrong layer, wrong enum, duplicates owned state, worsens secret exposure).
4. **Keep it stateless.** Scan the whole log each SessionStart, rely on dedup. Add a watermark only if profiling shows scan latency hurting session start. Respects the loop's stateless-hook norm (`.claude/session-context.json`).
5. **Wire the reopens linkage** (§2.2) — Channel A closure via existing primitive.
6. **Do NOT** add commit-msg, push-inline, or SessionEnd. Do **NOT** promote the trigger to `additionalContext`. Drop P3's commit-time summary printer.

## 6. Schema/mechanism question — does the schema support the trigger, or is latest-version enough?

Scouted `core/meta-state.js` (finding schema `:344`, version model `:887–917`), `core/recurrence-tracker.js`, and the registry. **The schema already fully supports the trigger — no new fields needed.** The finding schema carries every primitive:

- `recurrence_key` (`:358`) — dedup key; recurrence-tracker already sets it.
- `session_id` (`:373`) — described as "session idempotency key for hook-emitted findings"; the §3 window fix rides this as-is.
- `reopens` (`:395`, `entryIdRefArray`) — the B-revival linkage from §2.2.
- `version` (`:446`, default 0) + `status` enum — the versioned-append lifecycle.

The version model is *versioned-append, last-wins-by-max-version per id*. "Latest version of each finding" is that projection. So "mechanism vs. latest-version" is **not** a schema question — it's a **semantics question about evidence identity**, and it splits two ways:

**1. Recurring finding among its own bursts → latest-version is enough; no new mechanism.**
`checkAndEmit` already dedups by `recurrence_key` against open findings (`recurrence-tracker.js:87–97`); max_by(version) surfaces the latest state. The only change is the §3 window fix (add `session_id`, group per-session) — a field that already exists. No schema work, no new mechanism.

**2. Recurring evidence → accepted limitation B → `reopens` + cascade-resolve required; latest-version is *wrong*.**
The recurring finding and B are distinct evidence units. B (`meta-260615T1920Z`, subtype `strip-bypass-accepted`) = "the stripNodeEvalBody pattern is an accepted trade-off." A recurring finding = "the gate escalates the same prefix 3+× per session in vivo." Version-bumping B would conflate the two — losing the recurrence's counts/timestamps/samples inside B's versions and violating the one-evidence-unit-per-record model. `reopens` is the *existing* primitive for "new evidence re-surfaces an old finding's conclusion" (17× in the registry, e.g. `meta-260716T2220Z-…` reopens `meta-260715T1328Z-…`). Flow: new recurring finding carries `reopens: ['meta-260615T1920Z-…']`, then `meta_state_resolve({ id: 'meta-260615T1920Z-…', cascade_from: ['<new-id>'] })` cascade-resolves B. §2.2 is correct as written.

**Bottom line:** latest-version-per-id handles the recurring finding's own lifecycle for free; `reopens` + cascade-resolve (existing primitive, zero schema change) is required to convert "B stays open, self-validated" → "B reopened by in-vivo evidence."

## Unresolved questions

- **Secret-exposure verification** (rec 2): is `.gate-decision.log` gitignored? Is `meta-state.jsonl`? If the registry is committable, redaction is mandatory before shipping — needs a read of `.gitignore` and the committed-records policy.
- **Dedup grace window**: should re-filing be suppressed for a resolved finding with the same `recurrence_key` indefinitely, or only within N days? Operator-intent decision (suppress-forever risks hiding a genuinely recurring-again pattern; suppress-too-brief risks noise). **Substrate resolved (§7):** predicate on meta-state `resolved_at`, not runtime-state. The remaining open part is the *policy* (forever vs N-days) — a constant, not infrastructure.
- **`session_id` source at the hook**: does the bash-gate hook payload carry a session id it can inject into `appendDecisionLog`, or does it need a per-session marker file? Needs a read of the hook input schema.
- **B itself**: with the window fixed and real in-vivo counts landing, should `meta-260615T1920Z` be re-derived / re-scoped now, or wait until the trigger produces structured counts? Lean: wait — let the registry carry the evidence, then re-derive from data, not from this retrospective.
- **Adjacent (out of scope here)**: do the two `additionalContext` SessionStart hooks earn their every-session context cost, or should they become pull-based too? Real token question, separate decision.

## Scouting resolutions (260802-0102)

- **Secret exposure — RESOLVED, GO blocker confirmed.** `.gate-decision.log` is gitignored (`.gitignore:4` `*.log`). **`meta-state.jsonl` at repo root IS tracked** — `git ls-files` returns it and commit `c7adb55` touched it. The recurrence-tracker embeds raw `sample_commands` (≤50-char command prefixes) into the finding `description` (`recurrence-tracker.js:117–119`), landing in the committed registry. A prefix like `curl https://api?token=eyJ…` or `AWS_SECRET=… git …` leaks within 50 chars. **Redaction is mandatory before shipping** (redact secret-shaped fragments in `recurrence-tracker`, or drop raw prefixes from the description and keep only `rule_id` + `recurrence_key`). Note: `records/meta/` is gitignored, but that is the *product-surface* runtime state (voided 2026-06-12); the loop's *self-model* `meta-state.jsonl` at root is the committed durable record by design.
- **`session_id` source at the hook — PARTIALLY RESOLVED.** The schema accepts `session_id` and SessionStart carries `Session` metadata, but the bash-gate PreToolUse payload specifically — whether it carries a session id injectable into `appendDecisionLog` — was not confirmed. One true scout gap remains: read the hook input schema in `hooks/universal/bash-gate.js` / `gate-decision-log.js`.
- **B itself — lean wait, confirmed.** B has 6 versions, `reopens: null`, status `open`. Nothing has reopened it. Let the trigger produce structured counts, then re-derive from data.
- **Schema/mechanism — RESOLVED (§6).** No schema change needed; `reopens` + cascade-resolve is the correct primitive, not version-bumping.
- **Still open:** dedup grace window (operator-intent); bash-gate hook `session_id` availability (one code read).

## 7. Predict verdict (260802-0116) — reuse runtime-state for the grace window? STOP (redirect)

**Question:** for the dedup grace window, why not reuse runtime-state instead of an operator-tuned constant?

**Verdict: STOP (redirect).** runtime-state is the wrong substrate; the grace window belongs as a predicate on meta-state's existing `resolved_at`.

Grounding: `runtime-state.jsonl` is the live *runtime-surface* sidecar — two kinds, `ledger-event` (immutable audit) and `budget-state` (lifecycle `initial→active→paused→stopped`), `affected_system` enum = `{vnstock, fastapi, tanstack, product, api, web, meta-state-tools, runtime-state}` (`core/runtime-state.js:220`) — **`gate-logic` is not in it**. `meta-state.jsonl` is the *self-model*; the recurring finding already lives there with `recurrence_key`, `status`, `resolved_at`. Both files are tracked/committed (`git ls-files` returns both).

**Agreements (all 5 personas):**
- The watermark already exists in meta-state (resolved finding's `resolved_at` + `recurrence_key`); `checkAndEmit` already reads the registry — it just filters `isOpen` only. A second substrate is not needed to *store* it.
- runtime-state's enum has no `gate-logic`; recurrence is a gate-logic phenomenon. Forcing it in overloads a runtime surface or requires enum creep — wrong layer either way (the enum doc at `runtime-state.js:214` explicitly warns against conflating the two enums).
- runtime-state does not fix the GO blocker: it is *also* committed, and a watermark encoding `recurrence_key` (command prefix) there adds a second committed secret surface — strictly worse for exposure.
- The grace window is an operator-intent *policy* (forever vs N-days), not *state*. Storing N in runtime-state rows vs a constant changes where the number lives, not what it is.

**Redirect:** widen `checkAndEmit`'s `existing` filter (`recurrence-tracker.js:87–97`) from `isOpen(e)` to `isOpen(e) || (e.status === "resolved" && withinGrace(e.resolved_at))` with one tunable constant. Zero new substrate, zero new files, zero new kinds; preserves the stateless-hook norm (rec 4). The only genuinely open part is the *policy* (forever vs N-days) — a constant, not infrastructure; pick a default N and revisit from data once the trigger ships. Redact command-prefix fragments at `recurrence-tracker` before *any* write to either file — orthogonal to this choice, do not defer it.