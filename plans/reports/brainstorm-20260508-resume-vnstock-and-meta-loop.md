# Brainstorm: Resume vnstock Install Experiment + Close Meta-Loop Gaps

- date: 2026-05-08
- source: `/problem-solving` analysis of `plans/260508-1545-vnstock-install-knowledge-encoding/` failed run
- input: three unresolved questions opened during problem-solving session
- status: debate draft, awaiting user direction

## Problem Statement

Failed plan blocked correctly. No secrets leaked into agent context. Four meta-evidence files captured loop gaps. Two next-step problems remain:

1. Resume the install experiment with API key injection that never reaches the agent's context.
2. Convert deferred meta-evidence into actual loop improvement.

Five sub-questions surfaced (Q4 added during debate after user flagged the missing "disproved" state for evidence; Q5 added after user asked how deferred N≥2 gaps get recalled when their trigger event arrives). User accepted the Q4 hole ("trust the doc rule"). This report debates each, recommends a position, lists the cascade across them, and surfaces new unknowns.

---

## Q1: Is a runner under `tools/` allowed pre-meta-decision?

### Approaches

**A. Build runner ad-hoc in `tools/`, capture as evidence, promote later via meta-decision.**
- Pros: pragmatic, unblocks rerun immediately, gives a concrete artifact for future meta-experiment to reference.
- Cons: introduces a pre-canonical repo artifact. Risk of canonization-by-accident if file persists. Future operators may treat it as approved tooling without reading its evidence backing.

**B. Open meta-claim → meta-experiment → meta-decision FIRST, then build.**
- Pros: pure loop discipline. No ad-hoc artifacts.
- Cons: blocks technical work on procedural work. Meta-experiment is hard to construct (what would "verify" the runner?). Runs on N=1 reasoning that itself is unformalized (see Q3).

**C. Treat the secret-injection mechanism as part of executable substrate, not a repo artifact.**
- Operator's shell does the env-var injection. No file in `tools/`. Existing Runtime Artifact Standard already covers this: substrate is disposable, evidence is durable.
- Pros: zero new repo artifacts. Zero new policy. Aligns with current rules. Adds one new metadata field (`secret_injection_class`), not a new tool.
- Cons: every operator must remember the shell discipline. No reusable tool exists for the next run.

### Recommendation: C

KISS / YAGNI applied. Existing rules already permit substrate-side mechanisms. Option A would over-engineer for one experiment. Option B blocks technical progress on procedural ceremony. Option C uses what we already have.

Tradeoff accepted: operator carries the shell discipline. Acceptable for a sandbox install gate.

---

## Q2: Where does the secret durably live?

### Approaches

**A. Plain env var, set by operator via `read -s` before agent invocation.**
- Pros: zero setup. Available on every shell. `read -s` keeps secret out of shell history.
- Cons: env var lives in the operator's process tree until shell exits. Other processes in same shell can read it.

**B. GPG-encrypted file under operator HOME, decrypted at run.**
- Pros: durable, encrypted at rest. No re-typing across sessions.
- Cons: requires gpg-agent setup. One extra command per session. Adds tooling assumption.

**C. OS keychain (libsecret / Keychain.app / Credential Manager).**
- Pros: strongest at-rest protection when supported. Auditable via OS.
- Cons: platform-specific. Not all operators have one configured. Keychain access patterns vary.

**D. Plaintext dotfile (matches the original disproven `~/.vnstock/user.json` assumption).**
- Pros: zero ceremony.
- Cons: plaintext on disk. Already disproven as the installer mechanism. Weakest option. Reject.

### Recommendation: A

For one sandbox install gate, A is sufficient. `read -s VNSTOCK_API_KEY; export VNSTOCK_API_KEY` keeps the value out of shell history and out of the agent context. Document B as an upgrade path if reruns become routine. Reject D explicitly.

Brutal-honesty note: choosing B or C now would be premature optimization for a single experiment. If a second install-class experiment emerges (e.g. another vendor, different SDK), revisit.

---

## Q3: Should the N=1 vs N≥2 split itself be a meta-claim?

Context: during problem-solving, I proposed splitting the four captured meta-gaps into "closeable on N=1 (principle)" vs "needs N≥2 (schema/template)". This split is itself a process heuristic, not yet canonical.

### Approaches

**A. Yes — write split as meta-claim now; meta-experiment verifies by applying split to existing four meta-evidence files; meta-decision adopts.**
- Pros: most rigorous. Forces clarity on what "verified" means for a process heuristic.
- Cons: meta-experiment construction is hard. How do you "verify" a classification rule? Requires defining ground truth that does not exist.

**B. No — apply split informally as operator judgment; canonize only after a second loop iteration tests it.**
- Pros: fast.
- Cons: when a second case appears, no recorded reasoning to ground the split. Canonization slips back to ad-hoc.

**C. Capture as meta-evidence (principle + candidate split + deferral note); defer claim/experiment/decision until at least one of the four meta-gaps is closed using the split.**
- Pros: matches existing capture-and-defer pattern (process-side artifact ambiguity is already an evidence-only deferred file). Lightweight. Records reasoning now without changing canonical rules.
- Cons: another deferred file. Risk of meta-evidence pile-up.

### Recommendation: C

Same shape as Q1 recommendation: capture, don't canonize. Add `records/evidence/meta/n-equals-one-gap-class.md` describing the split and listing which of the four existing meta-evidence files would be closeable at N=1 vs which must wait.

Brutal-honesty note: option A is over-engineering a heuristic into a contract. Heuristics that work get adopted; heuristics that fail die. Both happen faster without canonization overhead.

---

## Q4: How is evidence truth-status communicated to scanning agents/humans?

Surfaced during debate. Concrete example: `records/evidence/vnstock-data/installer-prior-notes.md` claimed installer reads API key from `~/.vnstock/user.json`. The 2026-05-08 experiment empirically disproved this (installer reads `VNSTOCK_API_KEY` env var). The file remains on disk with no signal. A future cleared-context agent that scans `records/evidence/` directly may read it and re-adopt the disproven claim.

Constraint from user: truth-status should be claim-scoped, must NOT pollute evidence frontmatter.

### Approaches

**A. Status field in evidence frontmatter.**
Rejected by user.

**B. Markdown body section in evidence file (e.g. `## Status: disproved-by-experiment-X`).**
- Pros: file-local, readable standalone.
- Cons: muddles loop philosophy (evidence is source, not proof). Adding status to evidence promotes it from source toward proof.

**C. Claim-side status block listing each cited evidence with current truth-state.**
- Pros: matches user's claim-scoped intuition. Single source per claim. Computable.
- Cons: claim files grow. Drift risk without validation.

**D. Per-file `## Supersedes` link in the disproving evidence (new evidence cites the old).**
- Pros: minimal. Captures the disproof relationship at the moment of disproof. Reader of new evidence learns the old is dead.
- Cons: one-directional. Reader who hits old evidence first sees no signal.

**E. Operator guide rule: evidence is referenced, not browsed. Always start with claims.**
- Pros: structural prevention. Zero file edits. Aligns with existing "evidence is source, not proof" anti-confusion rule.
- Cons: depends on agent/human compliance with intake flow. Direct browsers of `records/evidence/` still vulnerable.

**F. Computed view via validation tool (`pnpm validate:records` extends to emit truth-state report).**
- Pros: status is a derived view, not a stored field. Aligns with "validate, don't store".
- Cons: implementation cost. One more script. Premature.

### Recommendation: E + D now, defer C and F

- **E (now, N=1 principle)**: patch `docs/operator-guide.md` Agent Intake Flow step 2. Replace "Locate relevant evidence, records, decisions, experiments, and pack files" with explicit ordering: "Locate relevant claims, experiments, and decisions first. Evidence files are referenced via `record_ref`, never browsed standalone." The vnstock case alone shows the failure mode; principle is closeable at N=1.
- **D (now, per-file)**: the new experiment evidence file (resumed run) includes a `## Supersedes` section listing `local:records/evidence/vnstock-data/installer-prior-notes.md` with a one-line disproof reason. The old file is NOT edited. Supersession lives at the disprover, not the disproved. This becomes a documented pattern for any future disproof event.
- **C and F (deferred, N≥2)**: capture as `records/evidence/meta/evidence-truth-status-mechanism.md`. C is the elegant long-term mechanism (claim-side status block); F is the validation upgrade. Both deferred because they are schema/template choices, not principles, and one case does not justify either shape.

Brutal-honesty note: B is the tempting middle path but it crosses the source/proof line. E is structural and free. D is one markdown section, already idiomatic.

---

## Q5: How are deferred meta-evidence gaps recalled when their trigger event occurs?

Surfaced during debate after user asked: "if we follow the full cascade, how do we know that other gaps N>1 could be remembered when we need it?"

Concrete failure mode: `runtime-run-schema-deferral.md` says "Update this file when additional runtime experiments run." If the next install/runtime experiment happens 6 months later under a different operator/agent with no memory of the file, the N≥2 trigger fires silently. The cascade defers gaps but offers no recall mechanism — so deferred gaps may stay deferred forever.

### Approaches

**R1. Counter inside deferred file, manually updated by next experiment.**
- Cons: fails the moment any experiment skips the update step. Manual counter discipline is the same compliance problem the loop tries to avoid.

**R2. Operator-guide rule: pre-experiment scan of `records/evidence/meta/`.**
- Pros: doc-rule pattern already used in Q4 E. Single source of truth for the rule.
- Cons: compliance-dependent. Same trade-off the user already accepted for Q4.

**R3. Validation tool emits pending triggers (`pnpm validate:records` lists deferred items + current counts).**
- Pros: cannot be missed; surfaces at every validation run.
- Cons: implementation cost; output noise; premature.

**R4. Explicit `## Trigger` markdown section per deferred meta-evidence file.**
- Pros: file-local. Greppable (`grep -l '## Trigger' records/evidence/meta/`). Zero new infrastructure.
- Cons: still requires operator to grep. Trigger phrasing may not match perfectly.

**R5. Plan-template extension: every new plan lists relevant deferred meta-evidence in Context Links.**
- Pros: integrates with existing brainstorm/plan workflow. Planner agent does the scan once per plan.
- Cons: depends on planner agent compliance with template. Premature without proven template need.

**R6. Separate `_pending.md` index in `records/evidence/meta/`.**
- Pros: one file to read.
- Cons: drift risk; same as M3 from Q4 hole debate, which user already declined.

### Recommendation: R4 + R2 now, defer R3 and R5, reject R1 and R6

- **R4 (now, per-file)**: each deferred meta-evidence file gains a `## Trigger` markdown section. Format: one-line trigger event class + threshold count + what to do when triggered. Example for `runtime-run-schema-deferral.md`: "Trigger: next runtime experiment of any class. Threshold: 3 cases total. Action: revisit envelope-field stability, draft schema candidate."
- **R2 (now, doc rule)**: extend the same operator-guide patch from Q4 E. New step in Agent Intake Flow: "Before opening a new experiment plan, `grep -l '## Trigger' records/evidence/meta/` and read each matched file. If the new experiment matches a listed trigger, increment its case count and follow its 'Action' line."
- **R3 (deferred)**: validation tool extension is premature. R4 + R2 work without code.
- **R5 (deferred)**: plan-template integration is structural-good but no template exists yet.
- **R1 + R6 rejected**: counter-only and index-only patterns fail in ways the loop already rejected elsewhere.

Brutal-honesty note: R4 + R2 still depend on operator/agent compliance, same as Q4. User already accepted this compliance trade-off. Triggers may use phrasing that does not match perfectly across experiments — that is acceptable; the trigger is a hint, not a contract. If a future experiment notices a deferred file the planner missed, that becomes evidence the trigger phrasing needs refinement (not a loop failure).

Q5 cascades cleanly into the existing Q4 E patch: the operator-guide edit grows by one paragraph instead of needing a separate change.

---

## Cascade Across Q1–Q5

Recommended answers converge on the same shape: **capture as evidence, defer canonization, structurally prevent the failure modes that need preventing now, run the next experiment using existing rules**. The vnstock rerun then becomes:

### Phase 1 — Make this report a referenceable example for future meta-process work

Per user direction: lock the meta-process improvements into discoverable locations BEFORE any other phase, so future cleared-context agents can find them.

1.1. Update `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`:
   - Add new section **"Gap Classification by Sample Count"** documenting the N=1 (principle) vs N≥2 (schema/template) heuristic from Q3.
   - Add new section **"Worked Example"** pointing to `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md` as a canonical example of the meta-process improvement debate (Q1–Q5 captured + cascade synthesis).
   - Add note in **"Self-Improvement Decision Rules"** referencing the new sections.

1.2. Update `docs/operator-guide.md` "Self-Improvement Flow" subsection:
   - Add line: "For an example of meta-process improvement debate captured as a brainstorm report with multi-question cascade and deferred-meta-evidence pattern, see `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`."

### Phase 2 — Procedural setup (meta-evidence + operator-guide rules)

2.1. Add `records/evidence/meta/secret-injection-class.md` (Q1+Q2: new metadata class). Includes `## Trigger` section per Q5 R4.
2.2. Add `records/evidence/meta/n-equals-one-gap-class.md` (Q3: routing heuristic). Includes `## Trigger`. Cross-link to the skill section added in 1.1.
2.3. Add `records/evidence/meta/evidence-truth-status-mechanism.md` (Q4: candidate mechanisms C and F captured as deferred). Includes `## Trigger`.
2.4. Retrofit `## Trigger` sections into the four existing meta-evidence files (`process-side-artifact-ambiguity.md`, `capability-schema-gap.md`, `install-experiment-template-gap.md`, `runtime-run-schema-deferral.md`).
2.5. Patch `docs/operator-guide.md` Agent Intake Flow step 2:
   - Q4 E rule: "Locate relevant claims, experiments, and decisions first. Evidence files are referenced via `record_ref`, never browsed standalone."
   - Q5 R2 rule: "Before opening a new experiment plan, scan `records/evidence/meta/` for `## Trigger` sections matching the new experiment's class. Read matched files; apply guidance."

### Phase 3 — Experiment rerun

3.1. Update install experiment phase to:
   - Replace flag-driven contract with env-var-driven contract per the disproven-flag finding.
   - Add explicit operator step: `read -s VNSTOCK_API_KEY; export VNSTOCK_API_KEY` BEFORE agent invocation.
   - Add envelope field: `secret_injection_class: api-key-via-shell-env-var`.
   - Add `## Supersedes` section in the new evidence file pointing to `installer-prior-notes.md` with one-line reason (Q4 D action).
3.2. Resume the experiment with corrected procedure under the same approval gate (sandbox / install-import).

### Phase 4 — Pack verification

4.1. If install verifies, run claim verification update for the `install` dimension.
4.2. Build/promote `vnstock-data` pack from draft to verified.
4.3. Run `pnpm check` and `pnpm validate:records`.

One sequenced move closes all five top-level questions and locks the meta-process pattern into the skill + docs as a referenceable template. Phase 1 is required to be done first per user direction; Phase 2 retrofit work is structural and risk-free; Phases 3–4 carry the runtime risk and gate on human approval.

---

## Implementation Considerations (for plan stage, not now)

- Phase 1 canonical edits (skill + docs reference) carry no execution risk and lock the meta-process pattern as discoverable. Two files touched: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` and `docs/operator-guide.md` Self-Improvement Flow subsection.
- Operator must pre-set `VNSTOCK_API_KEY` via `read -s` BEFORE invoking the agent. Agent prompt must NOT contain literal value or the export command.
- Agent never reads `~/.vnstock/user.json`. The disproven assumption is closed.
- Evidence envelope adds one field: `secret_injection_class`. Existing `blocked_outputs` unchanged (`credentials`, `config-contents` still forbidden).
- New evidence file adds `## Supersedes` markdown section pointing to `installer-prior-notes.md` (Q4 D action). The old file is NOT edited.
- Operator-guide patch in Phase 2 (Q4 E + Q5 R2 rules) is one paragraph at Agent Intake Flow step 2. Phase 1 also edits the operator guide but in a different subsection (Self-Improvement Flow) — no conflict.
- New meta-evidence files all carry `## Trigger` sections (Q5 R4). The retrofit of the same section into the four existing meta-evidence files is the only edit to those files.
- Human approval request must explicitly state the secret is operator-injected, not agent-handled.
- Auditability: end-of-run check that the agent transcript contains zero literal `VNSTOCK_API_KEY` value. (Open question on who runs the audit — see Unresolved.)

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Operator types literal key in prompt by accident | medium | `read -s` discipline; explicit gate language; transcript audit |
| `n-equals-one` heuristic canonized prematurely | low | Q3 recommendation C explicitly defers |
| Rerun fails for a different reason | medium | New failure becomes third evidence file; plan re-blocks legitimately |
| Capture-and-defer pile-up across many runs | low | Q5 R4 `## Trigger` sections + Q5 R2 pre-experiment grep rule make pile-up self-clearing as triggers fire |
| Operator guide edit (Q4 E + Q5 R2) interpreted too strictly, blocks evidence-first review use cases | low | Doc rule says "always start with claims" + "scan deferred meta", not "evidence is forbidden" — evidence still readable, just not the entry point |
| Old `installer-prior-notes.md` still misleads despite supersession | medium | Q4 E doc rule structurally prevents evidence-first scanning; D supersession adds a per-file backstop |
| Trigger phrasing drifts across files (Q5) | low | Free-text accepted now; tighten to enum if drift observed at N≥3 trigger files |

## Success Criteria

- `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` updated with "Gap Classification by Sample Count" and "Worked Example" sections (Phase 1).
- `docs/operator-guide.md` Self-Improvement Flow subsection points to this brainstorm report (Phase 1).
- `pnpm check` passes after edits.
- Install dimension verified for `vnstock-data` claim under sandbox scope.
- `experiment-install-<new-run-id>.md` evidence exists with `secret_injection_class` field AND `## Supersedes` section.
- Three new meta-evidence files exist with `## Trigger` sections: `secret-injection-class.md`, `n-equals-one-gap-class.md`, `evidence-truth-status-mechanism.md`.
- Four existing meta-evidence files retrofitted with `## Trigger` sections.
- `docs/operator-guide.md` Agent Intake Flow step 2 patched with claims-first ordering AND deferred-meta-scan rule.
- Agent transcript review confirms zero literal API key value.

## Next Steps

User chose continuation-plan shape. Phase 1 (skill + docs reference work) must complete before any other phase. Sequence:
1. Invoke `/ck:plan` with this brainstorm context to scaffold `plans/<new-timestamp>-vnstock-install-resume/`.
2. Plan phase 1: skill + docs reference (lock meta-process pattern as discoverable example).
3. Plan phase 2: meta-evidence files + operator-guide rule patches (procedural setup).
4. Plan phase 3: rerun install experiment with corrected procedure.
5. Plan phase 4: pack verification.
6. New plan links back to `plans/260508-1545-vnstock-install-knowledge-encoding/` as predecessor; failed plan stays archived as-is.

## Unresolved Questions

- If a second install case shows a different secret pattern (e.g. OAuth, signed JWT exchange), does `secret_injection_class` generalize as a label, or do we need a richer taxonomy of secret-injection mechanisms?
- Should agent transcript review be part of evidence-gate verification? If yes, who reviews and how is "reviewed" recorded — a new envelope field, a separate evidence file, or operator attestation?
- Is there a third class of meta-gap beyond N=1 and N≥2 — gaps that need *stakeholder input* rather than sample count? Capability schema may belong here regardless of N.
- Q4 specifically: how does the operator-guide-patched intake flow handle prose evidence files (like the original `installer-prior-notes.md`) that pre-date any claim? Are they retrofit-cited via a new claim, archived under a different convention, or left orphaned with the new doc rule covering them by exclusion?
- Does the new continuation plan get its own pack-publication gate, or does it inherit the `vnstock-data` pack draft from the failed plan?
- Q5 specifically: what is the canonical "trigger event class" vocabulary? Free-text per-file, or a small enumerated list (e.g. `next-install-experiment`, `next-runtime-experiment`, `nth-pack-creation`)? Free-text is simpler now; enum prevents drift later.
