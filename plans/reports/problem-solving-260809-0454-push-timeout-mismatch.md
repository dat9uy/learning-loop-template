# Problem-solving: push-timeout-mismatch (meta-260808T1203Z)

Finding: `meta-260808T1203Z-autonomous-ship-merge-pushes-time-out-at-the-agent-harness-d`
Severity: warning · Category: loop-anti-pattern · Subtype: push-timeout-mismatch

## Reframed root cause

Two coupled facts:
1. **Pre-push hook duration > harness timeout.** `package.json` simple-git-hooks:
   - `pre-commit`: `pnpm test:unit` (~85s, unit-only, no coverage)
   - `pre-push`: `pnpm test && pnpm fallow:gate` (~162s+; full vitest+coverage then fallow audit)
   The ship workflow (`ak-ship` Step 11) runs a bare `git push` → inherits the Bash default 120s → hook SIGTERMs at exit 143 mid-hook. Push actually succeeds on retry at ~360s.
2. **The local pre-push gate is redundant with CI.** `.github/workflows/test.yml` runs `pnpm test` (line 85) **and** the fallow audit (line 117, `--changed-since`) as a **required** status check (line 3). Merge is already gated on the identical checks.

## Technique applied: Simplification Cascade + Inversion

Invert the premise "pre-push must run the full suite locally."
Insight: *if CI already enforces the identical gate as a required merge check, the local pre-push `pnpm test && pnpm fallow:gate` is redundant for correctness.* One insight eliminates:
- (a) diff-aware vitest scoping — not needed
- (b) skip-if-already-passed stamp — not needed
- (c) the 360s timeout workaround — not needed (root cause gone, not papered over)
- the ~3min redundant serialization per push — gone

## Constraint check (things that could block the cascade)

- **fallow:gate ↔ coverage coupling:** fallow:gate reads `$PWD/coverage/coverage-final.json`, produced by `pnpm test`. So "keep fallow, drop the test" is *not* clean — it collapses to "drop both." Rules out a half-measure.
- **rule-no-verify-bypass-denied:** regex blocks `git … --no-verify` / `core.hookspath=/dev/null` **regardless of hook existence**. Removing pre-push does not weaken it; it keeps guarding pre-commit. No conflict.
- **Historical intent:** `setup-git-push.sh` notes the pre-push gate was once bypassed under a transient flake; team built no-verify-bypass + push-path setup to keep the gate *legitimate*. Removing the local gate cuts somewhat against that intent — but the bypass was incentivized by exactly this timeout friction, and CI now carries the correctness load.

## Resolution options

- **A — Structural (recommended): drop the redundant local pre-push full-suite gate.** pre-push → removed (or no-op). Rely on pre-commit (unit) + CI (full suite + fallow, required). Eliminates timeout mismatch *and* redundancy. Trade-off: human devs lose local full-suite pre-push feedback (CI still catches it); no-verify-bypass rule's focus narrows to pre-commit.
- **B — Operational (minimal): keep the gate, raise push timeout ≥240s** (Bash max 600s) in the ship/merge workflow push commands. Trade-off: fixes the *symptom* only; ~3min redundant serialization per push remains; suite growth re-breaks it.
- **C — Hybrid: drop `pnpm test`, keep a fast diff-scoped check.** Rejected — fallow needs coverage from the full run (coupling above); devolves into A or adds complexity. KISS violation.

## Recommendation

**A.** It dissolves the root cause instead of accommodating it, and aligns with KISS. The team-intent trade-off (local DX feedback) is the only material dependency on product intent — surfaced as a decision.

## Decision

User chose **A** (drop local pre-push gate).

## Implemented

- `package.json`: removed `simple-git-hooks.pre-push` (`pnpm test && pnpm fallow:gate`); kept `pre-commit` (`pnpm test:unit`) + `commit-msg`.
- Removed the installed `.git/hooks/pre-push` via `simple-git-hooks --remove=pre-push`; verified `pre-push` absent, `pre-commit` + `commit-msg` still present.
- Updated the R13 regression guard `tools/learning-loop-mastra/__tests__/r2/precommit-hook.test.js` to lock the new invariant (no pre-push hook; CI is authoritative) instead of the old exact-match `pnpm test && pnpm fallow:gate`.
- Re-grounded `package.json` fingerprint; logged change-log `meta-260809T0458Z-package-json-simple-git-hooks`; resolved finding `meta-260808T1203Z…` (status: resolved, by: operator).

## Verification (post-implementation)

- Focused test: `precommit-hook.test.js` → 7/7 passed.
- `git push` from an autonomous shell now completes < 120s (no pre-push hook) — no exit 143.
- CI `test` check still runs `pnpm test` + fallow and gates merge (unchanged).
- `rule-no-verify-bypass-denied` still blocks a `--no-verify` probe on commit (regex independent of hook existence).
- Working-tree change is uncommitted; commit/ship pending operator go-ahead.