---
phase: 3
title: "Rewire git hooks: fast pre-commit, full pre-push"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Rewire git hooks: fast pre-commit, full pre-push

## Overview

Move the full `pnpm test && pnpm fallow:gate` gate from `pre-commit` to `pre-push`, and point `pre-commit` at the fast unit project. `simple-git-hooks` v2.13.1 supports `pre-push` (confirmed in its source hook list). CI (`test.yml`) already runs the full gate on PRs and `push: main`, so the local pre-push is a backstop; `--no-verify` on push is still caught by CI on the PR.

## Requirements

- Functional: `pre-commit` runs `pnpm test:unit` (the Phase 2 unit project, coverage-off) — seconds.
- Functional: `pre-push` runs `pnpm test && pnpm fallow:gate` — the full gate, once per push.
- Functional: `commit-msg` stable-artifacts hook is unchanged.
- Functional: the old full-suite `pre-commit` hook file is replaced, not duplicated, after re-install.
- Non-functional: CI is untouched (git hooks don't run in CI; `test.yml` invokes `pnpm test` + fallow explicitly).

## Architecture

`simple-git-hooks` reads the `simple-git-hooks` block in `package.json` and writes a `#!/bin/sh` wrapper into `.git/hooks/<name>` for each key on `pnpm prepare` (or `npx simple-git-hooks`). Non-zero exit aborts the git action. Git feeds ref info on `pre-push` stdin; the wrapper ignores it (`pnpm test` doesn't read stdin).

Config delta:
```json
"simple-git-hooks": {
  "pre-commit": "pnpm test:unit",
  "pre-push": "pnpm test && pnpm fallow:gate",
  "commit-msg": "node tools/learning-loop-mastra/hooks/commit-msg-stable-artifacts.js $1"
}
```

`fallow:gate` uses `--changed-since origin/main` — valid on pre-push (HEAD is ahead of origin/main). The chain `pnpm test && pnpm fallow:gate` preserves order (coverage emitted by `pnpm test` → consumed by fallow).

Stale-hook cleanup: `simple-git-hooks` has a `preserveUnused` option (default removes unused). After editing the block and running `pnpm prepare`, verify `.git/hooks/pre-commit` content changed to the unit command and no orphan full-suite hook lingers. If it lingers, `npx simple-git-hooks --uninstall` then re-run, or `rm .git/hooks/pre-commit` before re-install.

## Related Code Files

- Modify: `package.json` — the `simple-git-hooks` block (pre-commit → `pnpm test:unit`; add `pre-push`).
- Read: `package.json` — `prepare` script (`simple-git-hooks`) confirms the install trigger.
- Read: `.github/workflows/test.yml` — confirm CI runs the full gate independently (no gap).
- Create: none
- Delete: none (the old `.git/hooks/pre-commit` is replaced in-place by re-install)

## Implementation Steps

1. Edit `package.json`: set `pre-commit` to `pnpm test:unit`; add `pre-push: "pnpm test && pnpm fallow:gate"`; leave `commit-msg` as-is.
2. Run `pnpm prepare` (or `npx simple-git-hooks`) to write the new `.git/hooks/pre-push` and update `.git/hooks/pre-commit`.
3. Verify `.git/hooks/pre-commit` now runs `pnpm test:unit` (not the old full command) and `.git/hooks/pre-push` exists with the full gate. Clean up any orphan if `preserveUnused` left one.
4. End-to-end: make a trivial change, `git commit` — confirm the unit gate fires and completes in seconds.
5. End-to-end: `git push` to a throwaway branch — confirm the full `pnpm test && pnpm fallow:gate` fires and a failure aborts the push (test with a deliberate temporary failure, then revert).
6. Confirm `git push --no-verify` skips the local pre-push (documented behavior; CI backstops on PR/main).
7. Document the new gate layout in `CLAUDE.md` / `AGENTS.md` quick-reference (pre-commit = unit, pre-push = full, CI = authoritative) so contributors know.

## Success Criteria

- [ ] `git commit` fires `pnpm test:unit` and completes in seconds (Phase 4 quantifies).
- [ ] `git push` fires `pnpm test && pnpm fallow:gate`; a mid-gate failure aborts the push.
- [ ] `.git/hooks/pre-commit` no longer contains the old full-suite command.
- [ ] `commit-msg` hook unchanged.
- [ ] CI `test.yml` is not modified and still runs the full gate on PRs / `push: main`.
- [ ] Contributor doc (CLAUDE.md / AGENTS.md) updated with the gate layout.

## Risk Assessment

- **Risk:** pre-push runs on every push, so PR-iteration workflows (push after every commit / force-push amend) pay the full ~2.5min per push — lateral move, not a win, for that workflow. **Mitigation:** the hybrid keeps a fast pre-commit so per-commit feedback is preserved; pre-push cost is bounded and CI-backed. If push frequency is high, consider step-7 doc guidance ("stack commits, push once") or drop `fallow:gate` from pre-push (rely on CI's fallow) to cut push time.
- **Risk:** `--no-verify` bypasses pre-push; a feature-branch push with no PR has no backstop. **Mitigation:** same as today (pre-existing); CI catches on PR open. Document, don't solve.
- **Risk:** `fallow:gate` in pre-push is redundant with CI's fallow step and doubles the local push cost. **Mitigation:** keep for now (defense-in-depth); if pre-push is too slow, drop fallow from pre-push and rely on CI's fallow (CI is the authority). Revisit after Phase 4 timings.
- **Risk:** stale `.git/hooks/pre-commit` lingers with the old full command → pre-commit still slow. **Mitigation:** step 3 verifies the file content; uninstall-first fallback documented.
- **Risk:** a contributor doesn't run `pnpm install`/`prepare` after pulling → no pre-push hook locally. **Mitigation:** `prepare` runs on `pnpm install`; the `prepare` script is already wired. CI is the authority regardless.