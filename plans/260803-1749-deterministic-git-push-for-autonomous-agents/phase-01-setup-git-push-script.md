---
phase: 1
title: "setup-git-push.sh script"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: setup-git-push.sh script

## Overview

Create `tools/scripts/setup-git-push.sh` — a one-time per-clone setup script that classifies the clone's git-push path and, when it is broken or read-only, deterministically converts a GitHub remote to HTTPS with an absolute-path `gh` credential helper, verifying **write** capability before declaring success. Mirrors the `setup-git-merge-drivers.sh` contract: idempotent, fail-closed, `--force` for explicit overwrite, no silent mutation, no mutation at all on failure paths.

**Accepted outcome (operator-visible):** running this script against this repo's clone converts `origin` from `git@github.com:...` to `https://github.com/...`. That conversion IS the fix — it is stated explicitly, not a side effect of a smoke check.

## Requirements

- Functional:
  - Classify by remote URL scheme first (`git@github.com:` SSH vs `https://github.com/` vs other), then by health.
  - Read probe: `git ls-remote origin HEAD`, hard-capped at ≤3s (BatchMode SSH + `timeout`). Probe-ok proves READ access only — never treat it as proof of push capability.
  - SSH remote + probe-ok → no-op exit 0 (working SSH is never rewritten).
  - SSH remote + probe-fails + `gh auth status -h github.com` exits 0 → conversion path (below).
  - HTTPS remote + helper configured + `gh auth status` ok → no-op exit 0.
  - HTTPS remote + no helper (public repo probes OK anonymously — read-only trap) + gh session → configure helper only (inert fix-up), exit 0.
  - Any broken state + no gh session → exit 1 with one-line remediation hint (`gh auth login`), NO mutation.
  - Non-GitHub remote → fail closed exit 1, even with `--force`. Unexpected-but-working states require `--force` to touch.
  - Conversion path (mutation order matters — helper FIRST because it is inert under SSH):
    1. `flock` an exclusive lock (`.git/setup-git-push.lock`) around the whole mutation region; second concurrent run waits or exits 0 if state is already correct.
    2. Resolve gh binary: `GH_BIN=$(command -v gh)`; if empty, extract the absolute path from the global `credential.https://github.com.helper` value and verify it is executable; else exit 1 no-mutation.
    3. Record prior values of remote URL and local helper config.
    4. `git config --replace-all credential.https://github.com.helper "!$GH_BIN auth git-credential"` (absolute path — bare `gh` is not on PATH in autonomous shells; `--replace-all` because the global config already carries multi-valued helper entries).
    5. `git remote set-url origin https://github.com/<owner>/<repo>.git`.
    6. Verify WRITE capability: `gh api repos/{owner}/{repo} --jq .permissions.push` must be `true` (read probes cannot prove push; this repo is public, so `ls-remote` succeeds anonymously).
    7. On ANY failure inside the region (`trap ... ERR`), restore BOTH the prior remote URL and prior helper value, then exit 1. A failed run leaves zero config drift.
  - Test hook: rewritten HTTPS base URL injectable via env var (e.g. `SETUP_GIT_PUSH_HTTPS_BASE=file:///path/to/bare`) so the post-swap re-probe resolves locally — tests never touch the network.
  - `--help` / unknown-arg handling and exit codes (0/1/2) identical in shape to setup-git-merge-drivers.sh.
  - `set -euo pipefail` + `trap` rollback; all mutations inside the locked, trapped region only.
- Non-functional:
  - Never prints or persists credential material; the helper is invoked by git at push time.
  - No plan IDs or finding codes in comments — explain invariants directly (SSH agent socket not inheritable by autonomous shells; read probes prove read, not push).

## Architecture

```
classify scheme:
  ssh:    probe ok            -> no-op exit 0
          probe fail + gh ok  -> CONVERT
          probe fail + no gh  -> exit 1 + hint (no mutation)
  https:  helper + gh ok      -> no-op exit 0
          no helper + gh ok   -> configure helper only, exit 0
          broken + no gh      -> exit 1 + hint (no mutation)
  other:  exit 1 (--force still refuses non-GitHub)

CONVERT (flock + ERR trap, rollback restores prior URL + helper):
  helper(abs gh) -> set-url https -> gh api permissions.push == true
```

## Related Code Files

- Create: `tools/scripts/setup-git-push.sh`
- Create: `tools/scripts/__tests__/setup-git-push.test.js`
- Reference (do not modify): `tools/scripts/setup-git-merge-drivers.sh`, `tools/scripts/__tests__/setup-git-merge-drivers.test.js`

## Implementation Steps (TDD)

1. Write failing tests first in `tools/scripts/__tests__/setup-git-push.test.js`, reusing the temp-repo idiom from `setup-git-merge-drivers.test.js` with ONE modification: `cleanGitEnv` must allowlist `GIT_SSH_COMMAND` (or set `ssh.command` via `git config` in the test repo, which survives env scrubbing) — scrubbing every `GIT_*` var would strip the very mechanism that forces offline SSH failure.
   - Local bare repo as `origin` (no network); per-test `bin/` shim dir with fake `gh`; `SETUP_GIT_PUSH_HTTPS_BASE` pointing at a second local bare repo so the post-swap probe is local.
   - (a) probe-ok SSH path → exit 0, remote unchanged.
   - (b) broken SSH + fake gh session (auth status 0, `gh api` emits `{"permissions":{"push":true}}`) → remote is rewritten URL, helper is absolute path, exit 0.
   - (c) broken + no gh session → exit 1, hint on stderr, URL AND helper config unchanged.
   - (d) non-GitHub remote broken → exit 1, unchanged, even with `--force`.
   - (e) idempotency: run twice after (b) → second run no-op exit 0.
   - (f) `--force` on already-working HTTPS config → exit 0, still working.
   - (g) unknown arg → exit 2.
   - (h) rollback: fake gh whose `api` emits `push:false` → exit 1, original remote URL restored AND prior helper value restored (no config drift).
   - (i) HTTPS + no helper + gh session → helper configured, URL untouched, exit 0 (read-only-trap fix-up).
   - (j) helper write failure mid-region (pre-create `.git/config.lock`) → rollback leaves URL+helper at prior values (partial-mutation regression guard).
2. Implement `tools/scripts/setup-git-push.sh` until tests pass.
3. Run focused tests: `pnpm vitest run tools/scripts/__tests__/setup-git-push.test.js`.
4. Real-clone run (explicit, operator-visible): run the script against this repo's clone. Expected: converts `origin` to HTTPS + helper, verifies `permissions.push`. Echo the resulting remote URL. Do NOT push in this phase.

## Success Criteria

- [ ] All test cases (a)–(j) green
- [ ] No mutation on no-gh-session, non-GitHub, and rollback paths (assert URL + helper both unchanged)
- [ ] Write verification via `gh api ... .permissions.push` gates the success exit — not `ls-remote`
- [ ] Helper value is an absolute gh binary path
- [ ] Tests never touch the project's real `.git/config` or the network (local bare-repo origins + `SETUP_GIT_PUSH_HTTPS_BASE` only)

## Risk Assessment

- Risk: fake `gh` PATH shim leaking into other tests → scope env per `spawnSync` call (existing idiom).
- Risk: probe hanging offline → ≤3s `timeout` + BatchMode; timeout classifies as read-probe-fail, and the gh-api write check fails fast offline, so conversion refuses instead of churning.
- Risk: rewriting the operator's working SSH remote → probe-ok SSH is always a no-op; conversion only fires when SSH is broken in the current shell.
- Risk: concurrent runs interleaving config writes → `flock` around the mutation region.
- Risk: absolute gh path pinned under a mise version dir breaking on `mise upgrade gh` → note in script comment; re-running the script refreshes the path (idempotent).
