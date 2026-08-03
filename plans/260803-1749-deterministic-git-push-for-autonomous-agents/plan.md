---
title: "Deterministic git push for autonomous agents"
description: "Fix finding meta-260803T1720Z-agent-runtime-git-push-is-fragile-an-autonomous-shell-cannot: make git push deterministic for autonomous shells by adding an idempotent per-clone setup script (tools/scripts/setup-git-push.sh) that converts a broken/read-only GitHub remote to HTTPS + absolute-path gh credential helper with WRITE-capability verification, plus a fail-open SessionStart preflight hook reporting push mode. Scope: auth fragility only — the pre-push flake incentive is residual and addressed via a proposed bypass-detection gate rule, not fixed here."
status: pending
priority: P1
effort: "1d"
branch: "main"
tags: [git, push, ssh, gh-credential-helper, session-start-hook, setup-script, agent-runtime]
blockedBy: []
blocks: []
created: 2026-08-03
createdBy: "ak:plan"
source: skill
related:
  - meta-state: meta-260803T1720Z-agent-runtime-git-push-is-fragile-an-autonomous-shell-cannot  # the finding this plan resolves
  - tools/scripts/setup-git-merge-drivers.sh     # contract template: idempotent, fail-closed, --force
  - tools/scripts/__tests__/setup-git-merge-drivers.test.js  # test harness idiom (temp repos, GIT_* env scrub)
  - hooks-lock.json                              # add new SessionStart hook entry
  - AGENTS.md                                    # per-clone setup block (~line 138) documents the new script
  - plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/plan.md  # completed; pre-push gate context, no file overlap
---

# Deterministic git push for autonomous agents

## Overview

Autonomous shells cannot inherit `SSH_AUTH_SOCK` from the operator's interactive shell, so this clone's passphrase-protected SSH key blocks every push with `Permission denied (publickey)`. In the session that pushed 06c29801 (#113), the agent fell back to `core.hooksPath=/dev/null`, bypassing the pre-push gate and destroying the audit trail on a transient vitest flake. This plan fixes the **auth fragility**: a per-clone setup script that classifies the push path and, when broken or read-only, converts a GitHub remote to HTTPS with an absolute-path `gh auth git-credential` helper, verifying write capability (`gh api repos/... .permissions.push`) before declaring success. A SessionStart preflight hook reports the push mode upfront with honest verification labels.

**Scope honesty (post-red-team):** the finding's claim that the gate blocked every legitimate workaround is not backed by any rule in `core/patterns.json` or promoted rules — the auth swap was always available. The plan therefore does not claim to "remove the incentive" for the hooksPath bypass; the flake trigger is residual. Phase 3 proposes a bypass-detection gate rule (`core.hooksPath` / `--no-verify`) so the audit-trail-destructive behavior becomes observable.

**Read vs push asymmetry (post-red-team):** `git ls-remote` proves READ access only — on this public repo it succeeds anonymously. Nowhere in this plan does a read probe count as proof of push capability.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `tools/scripts/setup-git-push.sh` — idempotent, fail-closed, locked mutation region with full rollback, write-verified conversion | P1 |
| 2 | SessionStart preflight hook — scheme-first classification, fail-open, honest verification labels, `.claude` direct + `.factory` adapter | P1 |
| 3 | Verify, audit runtime-agnostic checklist, document, resolve the finding with scoped claims | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: setup-git-push.sh script](./phase-01-setup-git-push-script.md) | Pending |
| 2 | [Phase 2: SessionStart push-preflight hook](./phase-02-session-start-push-preflight.md) | Pending |
| 3 | [Phase 3: Verification, audit, and finding resolution](./phase-03-verify-and-resolve.md) | Pending |

## Success Criteria

- [ ] Broken-SSH state + gh session: script converts remote to `https://github.com/<owner>/<repo>.git`, sets `credential.https://github.com.helper` to an ABSOLUTE gh path, verifies `gh api repos/{owner}/{repo} --jq .permissions.push` == true, exit 0
- [ ] Working SSH (probe-ok) or verified HTTPS+helper state: no-op exit 0
- [ ] Broken state + no gh session: exit 1 with remediation hint, zero config drift (URL and helper both unchanged)
- [ ] Failed conversion: rollback restores BOTH prior remote URL and prior helper value; a `.git/config.lock` failure mid-region cannot leave a half-configured clone
- [ ] Non-GitHub remote: fail closed, even with `--force`
- [ ] HTTPS-without-helper (anonymous read-only trap on this public repo): helper fix-up applied, never reported as push-ready
- [ ] SessionStart hook emits one honest mode line (`https-gh` | `https-unverified` | `https-anon` | `ssh-ok` | `broken` | `unknown/offline`); offline is never mislabeled `broken`; never mutates; fail-open
- [ ] All focused suites green incl. `legacy-mcp/hooks-wiring-parity.test.js`; `check_runtime_agnostic` clean
- [ ] Post-merge: autonomous-shell push succeeds with no bypass flags
- [ ] Finding resolved with auth-scoped claims; bypass-detection gate rule proposed for operator decision

## Red Team Review

### Session — 2026-08-03
**Findings:** 22 raw, 13 after dedup (13 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 7 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `ls-remote` proves read, not push (public repo: anonymous probe-ok) | Critical | Accept | Phase 1 (write check via `gh api permissions.push`), Phase 2 (labels), plan.md Overview + criteria |
| 2 | Helper `!gh` PATH-relative vs absolute mise path in global config | High | Accept | Phase 1 (absolute `$GH_BIN` resolution) |
| 3 | "Gate blocks workarounds" premise unverified; hooksPath bypass undetected; flake trigger residual | High | Accept (modified) | plan.md Overview (scope honesty), Phase 3 (promote_rule proposal, scoped resolution) |
| 4 | `set -e` partial-mutation window between URL swap and helper config | High | Accept | Phase 1 (helper-first order, ERR trap, full rollback) |
| 5 | Tests' `cleanGitEnv` scrubs the `GIT_SSH_COMMAND` they depend on | High | Accept | Phase 1 step 1 (allowlist), Phase 2 step 1 |
| 6 | Wrong test path (`legacy-mcp/`) + missing `hooks-wiring-parity.test.js` | High | Accept | Phase 2 step 4, Phase 3 Requirements |
| 7 | Smoke check silently converts operator's SSH remote | High | Accept | Phase 1 (accepted-outcome statement, explicit run step) |
| 8 | Rollout targeted least-affected runtime; inject-* claim false | High | Accept (modified) | Phase 2 (`.factory` adapter wiring, `.mastracode` follow-up) |
| 9 | Config-only `https-gh` label; probe-ok HTTPS mislabeled `ssh-ok` | Medium | Accept | Phase 2 (scheme-first, `https-unverified`/`https-anon` modes) |
| 10 | SessionStart probe latency + offline misclassified as broken | Medium | Accept | Phase 2 (≤3s cap, reachability check, `unknown/offline`) |
| 11 | Rollback left helper behind; rollback path untested | Medium | Accept | Phase 1 (full rollback, test h) |
| 12 | Test (b) post-swap re-probe hits network or needs git stub | Medium | Accept | Phase 1 (`SETUP_GIT_PUSH_HTTPS_BASE` injectable target) |
| 13 | Docs surface already known (AGENTS.md:138) | Medium | Accept | Phase 3 (named surface) |

### Whole-Plan Consistency Sweep

Applied edits re-read across `plan.md` + all three phase files. Reconciled: probe semantics ("auth works" → read-only everywhere), mutation ordering (helper-first) consistent between Phase 1 Architecture and Requirements, test suite paths identical in Phase 2 step 4 and Phase 3 Requirements, mode labels (`https-gh`/`https-unverified`/`https-anon`/`ssh-ok`/`broken`/`unknown/offline`) consistent between Phase 2 and plan.md criteria, rollback scope (URL + helper) consistent between Phase 1 and plan.md criteria, wiring targets (`.claude` direct + `.factory` adapter) consistent between Phase 2 and plan.md Goal 2. Zero unresolved contradictions.

<!-- slug: deterministic-git-push-for-autonomous-agents -->
