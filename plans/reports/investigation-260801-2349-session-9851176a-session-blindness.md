# Session Autopsy II — 9851176a: session-blindness (own session not treated as evidence)

> **STATUS: SUPERSEDED / OUTDATED (2026-08-02).**
> The **problem diagnosis** (§The episode, §Root cause, §Why priority should be higher) is retained as correct.
> The **proposals P1–P4 are outdated** — they re-build machinery the loop already ships (`core/recurrence-tracker.js` already does push capture + aggregation + auto-file into the registry; `hooks/universal/recurrence-check-on-start.cjs` already fires it at SessionStart) and reach for new substrate (a recurrence log, a derivation field, a commit summary printer) instead of the loop's existing primitives (the `recurring-false-positive` finding + `reopens`/cascade-resolve lifecycle). The only real gap is a broken window semantic (10-min double-duty as burst definition + scan range) that makes the wired trigger dead for human-paced cadence.
> **See instead:** `investigation-260802-0052-recurrence-trigger-design.md` — refuted proposals, loop-native fix (window → session grouping + reopen linkage), trigger-mechanism decision (keep SessionStart, silent-write channel; reject push-inline / SessionEnd / commit-msg), and the token/context category-error resolution.

**Source:** same transcript as the friction autopsy (`9851176a-0eec-4c8b-ab34-3db6c1c17177.jsonl`).
**Companion:** `investigation-260801-2340-session-9851176a-loop-tooling-friction.md` (tooling friction; this report is about *awareness*, not tooling).

## The episode

1. **Early verdict (transcript lines 105, 37):** the agent compared Finding A (`regex-over-match`, echo-prose false positive) with Finding B (`meta-260615T1920Z`, `stripNodeEvalBody` accepted false-negative, acked, v20) and concluded: *"related by architecture, not by fix — don't bundle."* B stays open as an acked, contract-locked trade-off. The verdict was well-grounded in code, tests, and registry — **given the evidence the agent bothered to consider.**
2. **Self-validation (353–359):** after the fix, the agent re-verified B (3 grep steps pass), stamped `last_verified_at`, and wrote: *"B remains open (it's an acked accepted-limitation, not resolvable by this fix — correct)."* Decision validated by the agent's own reasoning, case closed.
3. **The bug caught at commit (461–462):** only when composing the commit did the agent realize the commit message itself contained banned prose and would trip the gate — it switched to `git commit -F`. This was the **third live occurrence** in the session of the exact false-positive family being fixed (after the gate escalating its own diagnostic commands twice — noted in passing at line 431: *"I hit this live"* — and the escalation of its `meta_state_resolve` at 294).
4. **The near-miss (454–461):** the secrets-scan grep over the staged diff surfaced the full text of finding `meta-260704T0959Z` ("orchestrator read the full 326-line source of a tool") — **a finding the session itself had just re-enacted** by reading 45 lines of `bin/loop.mjs` (line 332). The agent looked directly at it, classified the matches as "all false positives" for the *secrets* question, and moved on. The evidence literally passed in front of it and was not recognized as evidence.

## Root cause: three stacked gaps

**Gap 1 — the recurrence catch-net is pull-based, and agents don't pull.**
Finding B's design explicitly delegates its accepted-bypass risk to a catch-net: `gate_check_recurrence` auto-files a finding via `meta_state_report` if a pattern recurs N≥3 in M≤10min (`gate-logic.js:257`). But `gate_check_recurrence` only does anything **when the agent calls it**. This session hit gate escalations at least three times and never called it once. The catch-net for an acknowledged-risk design silently does not exist in practice — which retroactively undermines the "B can stay open, the net catches recurrence" reasoning. The agent validated its B decision against a safety mechanism whose activation depended on the agent itself, in a session where the agent demonstrably didn't activate it.

**Gap 2 — escalations don't feed back into findings.**
The universal bash-gate hook sees every escalation (rule_id, command, session). Nothing records them. A finding's severity/priority is frozen at report time; `meta_state_derive_status` derives *staleness* but not *recurrence pressure*. So "this bug bit three times in one session today" — the strongest possible priority signal — never reaches the registry. The user's framing is exact: the runtime is not aware that **its own session is evidence**.

**Gap 3 — no steering for self-as-evidence.**
Every hint teaches agents to cite code and past sessions. None says: *friction you hit mid-task is data*. The `meta_state_report` schema even has a `session_id` field — the design anticipates session-sourced evidence — but nothing prompts an agent to file its own pain. Workaround culture takes over: route around the obstacle, finish the task, forget the obstacle.

## Why priority should be higher

B's "accepted limitation" status rests on two assumptions this session falsified in-vivo: (a) the recurrence net catches real recurrence (it didn't fire — pull-based), and (b) the false-positive family is bounded to known shapes (the session produced a new one: loop-tool JSON argv). Neither falsification reached the registry. A recurrence-aware loop would have re-derived B's status with fresh evidence instead of letting a self-validated "correct" verdict stand.

## Proposals (ordered by leverage)

### P1 — push-based recurrence capture (closes Gap 1, the real hole)
The universal bash-gate hook already intercepts every command. On `escalate`/`block`, append `{ts, session_id, rule_id, matched_fragment_hash}` to a recurrence log (or reuse the gate-decision-log surface). Then `gate_check_recurrence` becomes a *read* of real data instead of a ritual the agent must remember, and the auto-file path (`meta_state_report` on threshold) can fire from the hook or a sweep without agent initiative. Finding B's design comment already specifies the semantics (N≥3 / M≤10min) — this is moving the trigger from agent memory to the interception point that already exists.

### P2 — recurrence-derived priority in `meta_state_derive_status` / sweep
Add a recurrence signal to derivation: findings with ≥K fresh in-vivo recurrences derive as `recurring` (or bump severity warning→escalate) regardless of acked/accepted status. "Accepted limitation" should be a *revisable* state, and the revising evidence is exactly what P1 captures. This is what makes "own session as evidence" raise priority automatically instead of depending on operator retrospectives like this one.

### P3 — commit-time evidence surface (catches what P1/P2 miss, at the human checkpoint)
The recently wired commit-msg hook (or pre-commit) already runs at the moment the agent finally caught the bug. Have it print a session summary: *"this session triggered rule X (3×); related open findings: B, meta-260704T0959Z"* before the commit lands. The 454–461 near-miss shows how close the session came to connecting the dots at commit time; a nudge there converts hindsight into evidence.

### P4 — steering hint (cheap, ships independently)
Add to warm hints: *"Gate friction in your own session is evidence. If a gate blocks/escalates your own command — especially a loop-tool call — report it via `meta_state_report` with `session_id` before working around it, and run `gate_check_recurrence` on the matching rule."* Also extend the resolve/re-verify workflow: validating "leave finding X open" requires checking recurrence evidence for X, not just re-running its verification steps.

## What this session proves (meta-level)

The loop's premise is that agent sessions generate self-improvement evidence. This session generated *ideal* evidence — live reproductions, a new false-positive shape, a re-enacted known anti-pattern — and captured **none** of it through loop channels. Every capture happened later, by a human asking for an autopsy. Until capture is push-based at the interception points, the self-learning loop learns only when the operator manually feeds it.

## Unresolved questions

- Does the bash-gate hook currently have a write path it can reuse for P1 (gate-decision-log.js suggests partial infrastructure), or does escalation logging need a new store?
- Should recurrence pressure change *derived* status only (P2-lite), or auto-reopen acked findings past a threshold (stronger, needs operator-intent decision)?
- B itself: with the new in-vivo evidence, should `meta-260615T1920Z` be re-derived / re-scoped now, or wait until P1 lands and produces real counts?
