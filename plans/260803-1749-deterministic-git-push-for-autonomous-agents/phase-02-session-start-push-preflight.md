---
phase: 2
title: "SessionStart push-preflight hook"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: SessionStart push-preflight hook

## Overview

Add a SessionStart hook that reports git-push mode before friction surfaces mid-workflow. Read-only (never mutates), fail-open, fast (sub-second common case, ≤3s worst case). Classification is scheme-first and honest about verification level — a config-only result is never labeled "deterministic". Wired `.claude: direct` and `.factory: adapter` (the inject-* hooks already use `.factory: adapter` via `loop-surface-inject.cjs`; the autonomous runtimes are the ones this finding affects most); `.mastracode: none` with a follow-up note.

## Requirements

- Functional:
  - New universal hook `tools/learning-loop-mastra/hooks/universal/session-start-git-push-preflight.cjs`.
  - Read-only classification, scheme first, then health:
    - `https-gh` — HTTPS remote + helper configured + `gh auth status -h github.com` exits 0 (local check, no network). This is the only fully-assured mode.
    - `https-unverified` — HTTPS + helper configured but `gh auth status` fails or gh missing → emit remediation pointer to `setup-git-push.sh`.
    - `https-anon` — HTTPS without helper (public repo reads OK anonymously; push will 403) → remediation pointer.
    - `ssh-ok` — SSH remote + probe succeeds.
    - `broken` — SSH remote + probe fails AND the machine is reachable (see below) → remediation pointer.
    - `unknown/offline` — probe times out or errors in a way indistinguishable from offline → NO remediation pointer (never prescribe a mutating script on an ambiguous signal).
  - Reachability disambiguation: a fast (≤2s) `gh api` / DNS check distinguishes "offline" from "auth broken"; only a definitive auth failure emits the `setup-git-push.sh` pointer.
  - Probe hard-capped at ≤3s (BatchMode + `timeout`); config fast path (HTTPS+helper) skips the network probe entirely.
  - Fail-open: any internal error → single warning line, exit 0. Never blocks session start.
  - Output: exactly one concise line; never contains `token`/`password` material.
  - `.claude/settings.json`: add SessionStart entry (direct path, same shape as `session-start-inject-process-hints.cjs`).
  - `.factory`: wire via the existing adapter `.factory/hooks/loop-surface-inject.cjs` (`startup` matcher) IF that adapter dispatches per-hook; if it is hardcoded to the inject-* hooks, extend it minimally. Inspect before assuming.
  - `hooks-lock.json`: add `session-start-git-push-preflight` entry recording the actual wiring per surface.
- Non-functional:
  - Common case (HTTPS+helper or warm SSH) < 1s; worst case ≤ ~5s (probe 3s + reachability 2s), only on SSH-remotes.

## Architecture

```
read remote.origin.url + credential helper config
scheme=https:
  helper + `gh auth status` ok -> "push: https-gh"
  helper + auth fails          -> "push: https-unverified — run setup-git-push.sh"
  no helper                    -> "push: https-anon — run setup-git-push.sh"
scheme=ssh:
  probe(≤3s) ok                -> "push: ssh-ok"
  probe fail + reachable       -> "push: broken — run setup-git-push.sh"
  probe fail + unreachable     -> "push: unknown/offline"
any error                      -> warning line, exit 0
```

## Related Code Files

- Create: `tools/learning-loop-mastra/hooks/universal/session-start-git-push-preflight.cjs`
- Create: `tools/learning-loop-mastra/__tests__/session-start-git-push-preflight.test.js`
- Modify: `.claude/settings.json`
- Modify: `.factory/hooks/loop-surface-inject.cjs` (only if the adapter needs a dispatch entry — inspect first)
- Modify: `hooks-lock.json`
- Reference: `tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs`

## Implementation Steps (TDD)

1. Write failing tests first in `tools/learning-loop-mastra/__tests__/session-start-git-push-preflight.test.js` (temp repos + fake `gh` PATH shim; same `GIT_SSH_COMMAND` allowlist caveat as Phase 1):
   - (a) HTTPS + helper + auth ok → `https-gh`, no `ls-remote` spawned.
   - (b) HTTPS + helper + auth fails → `https-unverified` + pointer.
   - (c) HTTPS, no helper → `https-anon` + pointer.
   - (d) SSH + reachable origin → `ssh-ok`.
   - (e) SSH + probe fails + fake `gh api` reachable → `broken` + pointer.
   - (f) SSH + probe fails + fake `gh api` unreachable → `unknown/offline`, NO pointer.
   - (g) no origin remote → warning line, exit 0 (fail-open).
   - (h) output is one line, no `token`/`password` substrings.
2. Implement the hook until tests pass.
3. Wire `.claude/settings.json`; inspect `.factory/hooks/loop-surface-inject.cjs` and wire the adapter; register actual wiring in `hooks-lock.json`.
4. Run the verification set:
   - `pnpm vitest run tools/learning-loop-mastra/__tests__/session-start-git-push-preflight.test.js`
   - `pnpm vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` (note: the suite lives under `legacy-mcp/`, not `__tests__/`)
   - `pnpm vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/hooks-wiring-parity.test.js` (the parity test that actually parses `.claude/settings.json` against hooks-lock manifest entries)
   - `check_runtime_agnostic` via CLI.

## Success Criteria

- [ ] Test cases (a)–(h) green
- [ ] Session start emits the push-mode line (verify by invoking the hook manually with a SessionStart payload)
- [ ] Fail-open verified (case g); offline never emits the remediation pointer (case f)
- [ ] `hooks-wiring-parity` and `runtime-agnostic` suites green; `check_runtime_agnostic` clean
- [ ] `hooks-lock.json` reflects the real per-surface wiring

## Risk Assessment

- Risk: SessionStart latency → network probe only on SSH scheme, ≤3s cap, plus ≤2s reachability check; HTTPS fast path is config+local-only.
- Risk: false "broken" prescriptions causing mutation churn → `unknown/offline` mode never points at the script.
- Risk: `.factory` adapter shape unknown → inspect `loop-surface-inject.cjs` before wiring; if extension is non-trivial, wire `.claude` only, record `.factory: none` in hooks-lock, and open a follow-up finding rather than silently dropping the surface.
- Risk: `.mastracode` unaddressed → declared `none` explicitly; note as follow-up in Phase 3 resolution text.
