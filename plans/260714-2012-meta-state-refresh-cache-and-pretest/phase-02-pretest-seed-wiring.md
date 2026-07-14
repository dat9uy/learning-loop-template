---
phase: 2
title: "Pretest Seed Wiring"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Pretest Seed Wiring

## Overview

The committed `tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` (78 LOC) already does what `meta_state_refresh_file_index` does in N round-trips: re-hash every `mechanism_check:true` cited path and `upsertFileIndexEntry` each. Today it is wired into the manual `pnpm gate:self-verify` wrapper only. Wire it into `pnpm test` so the simple-git-hooks `pre-commit` inherits via the existing `pnpm test && pnpm fallow:gate` chain. Edits become drift-free at commit time without operator action.

## Requirements

- **Functional:** `pnpm test` runs `seed-file-index.mjs` before `vitest run`. The seed step is idempotent, exits 0 on completeness, exits 1 if any cited path failed to seed (existing behavior). `pnpm test` propagates the exit code.
- **Non-functional:** the targeted scripts (`pnpm test:cold-session`, `pnpm test:debug`, `pnpm check:freshness`) are NOT touched — they don't depend on `file-index.jsonl` freshness, and adding seed to them would mask real regressions in those views.
- **No new files.** Reuse the existing script by relative path.

## Architecture

```
pnpm test
  → node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs
  → vitest run
  → node tools/scripts/sanitize-coverage.mjs
```

The seed step sits before `vitest run` so cold-tier-regression test (which reads `file-index.jsonl` via `check-grounding.js`) sees fresh fingerprints. It sits before `sanitize-coverage.mjs` (which only acts on `coverage-final.json`) so coverage sanitization is unaffected.

## Related Code Files

- Modify: `package.json` (one-line change in `"test"` script: prepend the seed invocation)

## Implementation Steps

1. **Re-read `package.json` lines 17–22** to confirm the exact current `test` script string before editing.
2. **Add `SKIP_PRESEED` escape hatch to `seed-file-index.mjs`** (Red Team F5 + F12). At the top of the script body, after argument parsing, add:
   ```js
   if (process.env.SKIP_PRESEED === "1") {
     console.log("[seed-file-index] SKIP_PRESEED=1 — skipping pretest seed.");
     process.exit(0);
   }
   ```
   This preserves the default behavior (seed runs) and gives an operator a 1-char escape hatch for the pre-commit drift signal they may want back.
3. **Edit `package.json#L17`:** change `"test": "vitest run && node tools/scripts/sanitize-coverage.mjs"` to:
   ```
   "test": "node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs && vitest run && node tools/scripts/sanitize-coverage.mjs"
   ```
4. **Re-read the edited `package.json`** to verify the new test script line is correctly composed (no double-ampersand, correct relative path).
5. **Run the seed script standalone to measure wall-clock cost** (Red Team F15 — the original "tens of milliseconds" estimate is unsubstantiated). Use `time node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` and record the real time. Replace the "negligible" claim in the Risk Assessment with the measured number. (Expected magnitude: 500-1500ms for ~19 distinct paths with sequential `upsertFileIndexEntry` enqueue — Red Team F15 estimates. If actual is much lower, the optimization was already in place; if higher, document it.)
6. **Run `SKIP_PRESEED=1 node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs`** and confirm it exits 0 with the `[seed-file-index] SKIP_PRESEED=1` log. Verify the script does NOT modify `file-index.jsonl`.
7. **Run the full `pnpm test` once.** Expect: seed prints idempotent `Done.` (or completes silently on a fully-fresh tree) → vitest passes with no drift failures → coverage sanitizer passes.
8. **Sanity check: pre-commit hook still works.** `simple-git-hooks.pre-commit` is `pnpm test && pnpm fallow:gate` — no change needed. To verify locally without committing: `pnpm test && pnpm fallow:gate --brief` should be a no-op or report a clean tree.
9. **Negative test:** simulate stale `file-index.jsonl` by running `seed-file-index.mjs` against a synthetic drifted finding (write a fake `meta-state.jsonl` line with a new `evidence_code_ref` to a real file, run seed, verify the file appears in `file-index.jsonl`). Then revert. Alternative: trust that the existing seed script's idempotency guarantees + the cold-tier-regression test covering this path is sufficient.

## Success Criteria

- [ ] `package.json test` script begins with the seed invocation and is a single logical line.
- [ ] `seed-file-index.mjs` honors `SKIP_PRESEED=1` (logs the skip message, exits 0, does not modify `file-index.jsonl`).
- [ ] `pnpm test` exits 0 with idempotent seed log on a clean tree.
- [ ] Pretest seed wall-clock measured and recorded (replaces unsubstantiated estimate).
- [ ] `pnpm test:cold-session`, `pnpm test:debug`, `pnpm check:freshness` script lines are unchanged.
- [ ] Pre-commit hook chain remains `pnpm test && pnpm fallow:gate`; pre-existing `simple-git-hooks.pre-commit` config is intact.
- [ ] No new CLI script, no new imports, no manifest change.

## Risk Assessment

- **Cost per `pnpm test`:** seed re-hashes all `mechanism_check:true` cited paths. Live: 19 distinct cited paths (`wc -l file-index.jsonl` = 47 entries, 19 `mechanism_check:true` cited paths after dedup). Wall-clock cost: TBD — measured in step 5. Sequential `await upsertFileIndexEntry` loop (`seed-file-index.mjs:48-58`) with per-root enqueue serialization (`meta-state.js:694`). Initial estimate from Red Team: 500-1500ms. Replace with measured value post-step-5.
- **Incomplete seed = `pnpm test` fails.** `seed-file-index.mjs:74` exits 1 if any cited path exists but is missing from the index. This is desired: a new finding whose file is deleted-but-not-cleaned-up must surface, not silently pass. **Operator recovery (Red Team F5):** if pre-commit fails on missing-file seed, the operator can (a) `SKIP_PRESEED=1 pnpm test` for a single bypass, (b) `git commit --no-verify` for a single commit, or (c) update the finding's `evidence_code_ref` via `meta_state_patch` (operator-gated) to match the renamed/moved file. The PROCESS_HINTS row (Phase 3) documents the same recovery.
- **Drift signal at commit absorbed.** Pre-existing (legitimate) drift that the brainstorm §"Trade-off accepted" called out: a commit is a deliberate checkpoint, fingerprints SHOULD match committed source. This is the intended absorption, not a regression. The `SKIP_PRESEED=1` escape (Red Team F12) lets operators retrieve the drift signal when they want it.
- **Targeted script blast radius.** Phase 2's edit is surgical to one line plus a 3-line escape-hatch addition to `seed-file-index.mjs`. The simple-git-hooks config (`pre-commit`) is not touched; it reads `pnpm test` from `package.json` and inherits.
- **Cross-platform support (Red Team F14):** the `&&` chain works in both POSIX `sh` and Windows `cmd`, but the unverified claim that "pnpm normalizes" was removed. Windows CI verification is deferred as follow-up work; the script is currently exercised only in POSIX environments per existing CI.
- **MCP server contention (Red Team F15):** if a developer session has the MCP server running while `pnpm test` invokes the seed, both writers serialize through the per-root `enqueue` queue (`meta-state.js:583-584`). The seed script is well-behaved under contention (each `upsertFileIndexEntry` is atomic via tmp+rename), but total wall-clock includes queue-wait time. Documented in the measured-cost step 5.
- **Path-containment (Red Team F9, rejected from this plan):** `seed-file-index.mjs` reads any relative path that exists, including `tools/learning-loop-mastra/data/` (libsql storage) and `.git/`. Adding a containment check is a follow-up; out of scope for this plan per red-team adjudication (the seed script already runs in `pnpm gate:self-verify` without containment; pretest wiring does not change the threat surface qualitatively).
