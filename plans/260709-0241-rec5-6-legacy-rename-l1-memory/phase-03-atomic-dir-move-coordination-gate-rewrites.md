---
phase: 3
title: "Atomic dir move + coordination-gate rewrites"
status: pending
priority: P1
dependencies: [2]
---

# Phase 3: Atomic dir move + coordination-gate rewrites

## Overview

The bootstrapping-critical step. Move the 3 dirs + adapter with `git mv` (history
preserved) and rewrite **all 12 fail-closed coordination wrappers + the direct-wire
runtime configs** in one atomic bash command, so no gate ever observes a missing
universal hook. After this command the tree is consistent again. This is the only phase
where ordering is safety-critical.

**Red-team correction (2026-07-09):** the earlier `*-coordination-gate.cjs` glob matched
only 2 of the 4 wrapper filenames per runtime. The 4 are `bash-coordination-gate.cjs`,
`write-coordination-gate.cjs`, `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs`
(×3 runtimes = **12**). The inbound wrapper fires on `UserPromptSubmit` (before any bash
tool call can be requested) and recurrence on `SessionStart` — leaving either stale
deadlocks the session irrecoverably in-session.

## Requirements

- Functional: 4 `git mv`s land; all 12 wrapper line-13 strings + the direct-wire configs
  (`.claude/settings.json:12`, `.mastracode/hooks.json`) point at `hooks/universal/`; the
  3 runtime mirrors of each wrapper stay byte-identical.
- Non-functional: zero window in which any runtime resolves a missing universal hook.

## Architecture

Why atomic: each coordination wrapper `execFileSync`'s its universal hook and
`process.exit(err.status ?? 1)` on a missing path → Claude Code blocks the next call. The
`git mv` and the wrapper `sed` must run in a single command, evaluated by the *current*
(pre-move) gate (which still finds `hooks/legacy/bash-gate.js`), so when the command
returns every gate already points at the new (now-existing) path.

The direct-wire configs (`.mastracode/hooks.json`, `.claude/settings.json:12`) are
repointed **in this same command** (after the `git mv`s) — not in Phase 2 — so a concurrent
`.mastracode`/fresh-`.claude` session never sees a repointed direct-wire without the dir
present (red-team Finding: cross-runtime concurrent-session hazard).

`git mv` preserves rename history in `git log --follow`. Use it, not copy+delete.

## Related Code Files

Move (git mv):
- `tools/learning-loop-mastra/tools/legacy/` → `tools/handlers/`
- `tools/learning-loop-mastra/hooks/legacy/` → `hooks/universal/`
- `tools/learning-loop-mastra/scout/legacy/` → `scout/pipeline/`
- `tools/learning-loop-mastra/mastra/legacy-handler-adapter.js` → `mastra/handler-adapter.js`

Modify (in the same atomic command, via sed of the `hooks/legacy/` segment only):
- `.claude/coordination/hooks/{bash-coordination-gate,write-coordination-gate,inbound-state-gate,recurrence-check-on-start}.cjs`
- `.factory/coordination/hooks/{bash-coordination-gate,write-coordination-gate,inbound-state-gate,recurrence-check-on-start}.cjs`
- `.mastracode/coordination/hooks/{bash-coordination-gate,write-coordination-gate,inbound-state-gate,recurrence-check-on-start}.cjs`
- `.claude/settings.json:12` (direct SessionStart wire), `.mastracode/hooks.json` (6 direct wires)

## Implementation Steps

1. **Confirm Phase 2 complete** and no test run since. Confirm Phase-1 `gate_check` holds.
2. **Issue the atomic command** (single bash invocation; evaluated by the current gate,
   which still resolves `hooks/legacy/`):

   ```bash
   cd tools/learning-loop-mastra && \
   git mv tools/legacy tools/handlers && \
   git mv hooks/legacy hooks/universal && \
   git mv scout/legacy scout/pipeline && \
   git mv mastra/legacy-handler-adapter.js mastra/handler-adapter.js && \
   sed -i 's#hooks/legacy/#hooks/universal/#g' \
     ../../.claude/coordination/hooks/*.cjs \
     ../../.factory/coordination/hooks/*.cjs \
     ../../.mastracode/coordination/hooks/*.cjs \
     ../../.claude/settings.json \
     ../../.mastracode/hooks.json
   ```

   The `*.cjs` glob in each `coordination/hooks/` dir covers all 4 wrapper filenames
   (the only other entry is `README.md`, excluded by the `.cjs` filter). The `sed`
   pattern is anchored on `hooks/legacy/` so it touches only the universal-hook path
   string, never conceptual "legacy" mentions.
3. **Verify all 12 wrappers repointed + byte-identity.** Grep each runtime's 4 wrappers
   for `hooks/legacy/` → expect zero hits. `diff` the 3 runtime mirrors of each of the 4
   wrappers → expect clean (they stay byte-identical). Confirm
   `.claude/settings.json:12` + `.mastracode/hooks.json` point at `hooks/universal/`.
4. **Immediate 4-gate smoke (post-command).** Do not rely on bash+write alone (red-team
   Finding: inbound fires on `UserPromptSubmit` *before* a bash call can be requested):
   - Directly invoke each wrapper with sample stdin and assert exit 0:
     `echo '{}' | node .claude/coordination/hooks/bash-coordination-gate.cjs` (and
     `write-coordination-gate.cjs`, `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs`).
     Each must resolve `hooks/universal/<gate>.js` and exit 0 (no ENOENT).
   - Then one benign gated bash command (`git status --short`) confirms the live bash-gate
     resolves through the new path.
   If any wrapper exits non-zero, the rename is inconsistent — do NOT proceed; recover
   out-of-process (see Risk Assessment).
5. **Do NOT commit here.** The repo's `pre-commit` hook runs `pnpm test && pnpm fallow:gate`
   (red-team Finding), which fails on stale `baselines/fallow/*.json` + `file-index.jsonl`
   at this point. Leave the atomic move uncommitted (working-tree-durable) and commit in
   Phase 4 after baselines + file-index are regenerated and fallout is fixed, so the
   pre-commit hook passes green. (Alternative if a durable checkpoint is needed mid-flow:
   `SKIP_SIMPLE_GIT_HOOKS=1 git commit` for a structural checkpoint only — but prefer the
   single Phase-4 commit.)

## Success Criteria

- [ ] 4 `git mv`s landed; `git log --follow` shows rename history for a sample file.
- [ ] All 12 wrapper line-13 strings point at `hooks/universal/`; zero `hooks/legacy/` hits in any wrapper; the 3 runtime mirrors of each of the 4 wrappers are byte-identical.
- [ ] `.claude/settings.json:12` + `.mastracode/hooks.json` point at `hooks/universal/`.
- [ ] All 4 wrappers exit 0 on a direct sample-stdin invocation (no ENOENT).
- [ ] No commit in this phase (deferred to Phase 4) — OR a `SKIP_SIMPLE_GIT_HOOKS=1` structural checkpoint if explicitly chosen.

## Risk Assessment

- **Risk (primary): partial failure leaves gates pointing at the moved-away `hooks/legacy/`.** A failed step in the `&&`-chain aborts later steps; the worst case is "dirs moved, wrappers/configs not yet repointed" = deadlock. **Recovery is OUT-OF-PROCESS** (red-team Finding: the in-session reverse-`git mv` and Edit are themselves gated by the broken bash/write gates — unreachable). Pre-write the exact recovery commands and run them from a raw terminal / editor not run through the hook shims:
  - Reverse: `cd tools/learning-loop-mastra && git mv hooks/universal hooks/legacy && git mv tools/handlers tools/legacy && git mv scout/pipeline scout/legacy && git mv mastra/handler-adapter.js mastra/legacy-handler-adapter.js` (restores pre-state), then re-issue the corrected atomic command.
  - Or forward-fix: edit the 12 wrapper line-13 strings + the direct-wire configs to `hooks/universal/` from the raw terminal.
  Do NOT rely on in-session tooling to recover. (The speculative `gate_override`/TTL/`hooks/universal`-symlink apparatus from the earlier draft is dropped — red-team Finding 7: gold-plating; the atomic move with the corrected sed already gives a zero deadlock window when it succeeds. The out-of-process recovery covers the failure case.)
- **Risk:** the bash-gate blocks the atomic command (self-protection). **Mitigation:** Phase 1 step 4 `gate_check`; escalate at that point if needed.