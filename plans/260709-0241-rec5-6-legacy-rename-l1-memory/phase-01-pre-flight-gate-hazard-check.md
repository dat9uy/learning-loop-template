---
phase: 1
title: "Pre-flight & gate-hazard check"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Pre-flight & gate-hazard check

## Overview

No code change. Confirm the rename is safe to execute and **re-verify the pre-cook
consumer enumeration** (baked in during validation, 2026-07-09) for drift. Red-team proved a
hand-curated inventory was ~50% incomplete; the validation re-scout then found **126 live
consumer files / 324 path refs** — baked into `reports/{consumer-file-list.txt,
consumer-enumeration-full-grep.txt,pre-cook-consumer-enumeration-126-files-report.md}`. Phase 1
re-runs the grep and diffs against the baked-in list; only drift (a new file added since) needs
adding. Phase 1 also investigates the fallow baseline regen mechanism + gate-checks the
atomic Phase-3 command.

## Requirements

- Functional: a grep-generated, line-cited consumer inventory is the authoritative input to Phases 2–3.
- Non-functional: the fail-closed bootstrapping hazard is confirmed; the atomic command is gate-checked.

## Architecture

The coordination gates resolve the universal hook path at runtime via `execFileSync` and exit non-zero on a missing path (`.claude/coordination/hooks/bash-coordination-gate.cjs:13-24`). **There are 4 fail-closed wrapper files per runtime, not 2** — `bash-coordination-gate.cjs`, `write-coordination-gate.cjs`, `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs` — ×3 runtimes = **12 wrappers** (red-team corrected the plan's earlier "9"). Non-zero exit = Claude Code blocks the tool call. Phase 3 mitigates with an atomic move+rewrite of all 12.

## Related Code Files

- Read-only: the 12 coordination wrappers, `tools/learning-loop-mastra/hooks/legacy/bash-gate.js` (blocked-pattern list, to predict whether the atomic command is allowed), `core/runtime-agnostic-checklist.js`.

## Implementation Steps

1. **Confirm no in-progress plan edits the target files.** Re-verify git: the lifecycle arc (`260707-0812`, `260708-0833`, `260708-1135`, `260708-1216`) + Rec 4 (`260708-2258`) are merged (PRs #38–42). Confirm `260628-1337-fallow-tool-integration-rule-encoding` is shipped or only references the `__tests__/legacy-mcp/` dir name (which stays).

2. **Re-verify the pre-cook consumer enumeration for drift.** The enumeration is already
   baked in (validation 2026-07-09, 126 live files / 324 refs): `reports/consumer-file-list.txt`
   + `reports/consumer-enumeration-full-grep.txt` + `reports/pre-cook-consumer-enumeration-126-files-report.md`.
   Re-run the same grep and diff against `consumer-file-list.txt`:
   ```bash
   git grep -l -E "tools/legacy|hooks/legacy|scout/legacy|legacy-handler-adapter" \
     | grep -v "^plans/" | grep -v "docs/journals/" | grep -v "docs/_archive-260703/" \
     | grep -v "gate-log.jsonl" | grep -v "meta-state.jsonl" \
     | grep -v "plans/260709-0241-rec5-6-legacy-rename" \
     | sort > /tmp/rec56-now.txt
   diff /tmp/rec56-now.txt reports/consumer-file-list.txt
   ```
   Expected: empty diff. If a new consumer appeared since the enumeration (a file added to the
   repo), add it to the Phase-2 set. The enumeration is the authoritative Phase-2 input; this
   step just confirms nothing drifted. **Do not edit `plans/`, `docs/journals/`,
   `docs/_archive-260703/`, `gate-log.jsonl`, `meta-state.jsonl`** — immutable history.

   Magnitude note: ~80 of the 126 are `__tests__/legacy-mcp/*.test.js` (dynamic imports +
   `evidence_code_ref` strings + fixtures). This is why Phase 2 uses a repo-wide scripted sed,
   not per-file Edits. The 12 coordination wrappers + `.claude/settings.json` +
   `.mastracode/hooks.json` are deferred to Phase 3; `baselines/fallow/*.json` +
   `file-index.jsonl` to Phase 4.

3. **Lock target names** (UQ4 = Option A): `tools/handlers/`, `hooks/universal/`, `scout/pipeline/`, `mastra/handler-adapter.js`. Symbol `adaptLegacyHandler` **kept** (red-team verified this is the correct YAGNI call — it names the MCP wire envelope, not the dir).

4. **Gate-check the atomic Phase-3 command.** Run `mcp__learning-loop__mastra_gate_check` on the Phase-3 command shape (`git mv <4> && sed -i <all 12 wrapper line-13 strings> + direct-wire config strings`). If `block`, escalate then (operator decision on the specific rule) — do **not** pre-build a `gate_override`/TTL/symlink framework (red-team Finding 7: gold-plating; the atomic move with the corrected sed already gives a zero deadlock window). If `ok`, proceed.

5. **Investigate the fallow baseline regeneration mechanism** (validation Q1). `package.json` has only `fallow:gate` (an audit), no regenerator. Run `pnpm exec fallow --help` and check for a `baseline`/`update`/`snapshot` subcommand against the pinned `fallow` version. Record the exact command (if found) for Phase 4. If none exists, Phase 4 will precise-hand-edit `baselines/fallow/{dupes,health}-baseline.json` and the Rec 12 change-log will note that no regenerator exists. Either way, decide now so Phase 4 isn't blocked.
6. **Snapshot the pre-rename test baseline** including the **per-namespace test count** (so Phase 6 can detect the `mcp-tools` vacuous-green regression): record each namespace's `tests N` from `tools/scripts/run-pnpm-test-namespaced.mjs`.

## Success Criteria

- [ ] Git confirms PRs #38–42 merged; no in-progress plan edits target files.
- [ ] Phase-2 input = the grep output from step 2; the checklist above is fully surfaced by it.
- [ ] Target names locked (Option A); `adaptLegacyHandler` symbol kept.
- [ ] `gate_check` on the Phase-3 command returns `ok` or a single operator escalation is recorded (no pre-built override framework).
- [ ] Pre-rename per-namespace test counts recorded (esp. `mcp-tools` non-zero).

## Risk Assessment

- **Risk:** the bash-gate self-protects and blocks the atomic move. **Mitigation:** step 4 gates it; escalate at that point if needed. Recovery from a partial failure is **out-of-process** (a raw terminal/editor not run through the hook shims) — red-team Finding 5 proved the in-session reverse-`git mv` is itself blocked by the broken bash-gate. Document the exact reverse commands; do not rely on in-session tooling to recover.
- **Risk:** a consumer the grep still misses (e.g. a runtime-constructed path). **Mitigation:** Phase 6's widened grep + per-namespace count assertion catches residual misses; Phase 4 fixes fallout.