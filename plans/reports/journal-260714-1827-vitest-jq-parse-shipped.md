# 2026-07-14 — Vitest jq Parse Procedure (Script + PROCESS_HINTS row #1 + Parity Mirror)

**What shipped:**

- `tools/scripts/vitest-failures.sh` — pure `bash + jq` parser over `.test-logs/vitest-results.json`. Contract: exit 0 + `all green: N tests / M suites passed` summary; exit 1 + per-failure `fullName` + truncated `failureMessages` (~500 chars + `…`); exit 2 + stderr guidance for missing or invalid JSON. Path overridable via `$1`. Read-only — no gate preflight.
- `tools/scripts/__fixtures__/vitest-results-failed.json` — minimal failed fixture (1 failed assertion, 1 passed, mirror of vitest JSON shape) for the script regression tests.
- `tools/scripts/__tests__/vitest-failures.test.js` — 7 hermetic tests (green via synthesized fixture; failed via fixed fixture; missing path; invalid JSON; long-message truncation 500+`…`; fixture-shape sanity). No dependency on the live results file — avoids the chicken-and-egg cycle of "script returns exit 1 because suite has failures."
- PROCESS_HINTS row #1 in `tools/learning-loop-mastra/core/loop-introspect.js` rewritten (was the stale namespaced-runner reference): surfaces fast-feedback run flags (`pnpm exec vitest run --bail=1` / `vitest run <path>` / `pnpm exec vitest --changed`) + parse-once via `bash tools/scripts/vitest-failures.sh` + jq one-liner fallback + explicit Do-NOT hand-parse clause (no raw stdout grep, no re-read of passing tests, no `python -c`/`node -e` JSON parse) + retained same-file-read Rule 2.
- `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS row #1 mirrored byte-for-byte. Verified with `diff` (empty). Cold-session parity test (`cold-session-discoverability.test.cjs`) green: 11/11.
- `loop-describe-warm-tier.test.js` substring assertions updated to lock the new contract — replaces `silent-command` (Rule 1, references deleted `.test-logs/<ns>.log` writer) with `vitest-failures.sh` + `Do NOT` substring checks.
- File-index re-grounded for `tools/learning-loop-mastra/core/loop-introspect.js` via `meta_state_refresh_file_index` (2 findings re-grounded: the legitimate row #1 SHA change re-anchored `meta-260623T1126Z-meta-state-relationships-graph-is-unidirectional-on-reopens` whose `evidence_code_ref: loop-introspect.js:285` was drift-fingerprinted).

**Why it matters:** the agent runtime previously re-polluted its context by grepping raw vitest stdout and hand-writing `python -c`/`node -e` to parse `.test-logs/vitest-results.json` — re-introducing the resolved anti-pattern `meta-260712T0730Z-test-runner-pollutes-agent-context`. With the script + the rewritten PROCESS_HINTS row + the parser referenced in the cold-start injection, the canonical parse path is a single `bash` command. The fast-feedback run flags (`--bail`, file-scoped, `--changed`) land in the same row — same UX gap addressed by `meta-260714T1704Z-…` (meta-state refresh N+ round-trips).

**Files modified:**

- `tools/scripts/vitest-failures.sh` (new, +x).
- `tools/scripts/__fixtures__/vitest-results-failed.json` (new).
- `tools/scripts/__tests__/vitest-failures.test.js` (new).
- `tools/learning-loop-mastra/core/loop-introspect.js`: PROCESS_HINTS row #1 rewritten (others unchanged).
- `.factory/hooks/loop-surface-inject.cjs`: LOCAL_PROCESS_HINTS row #1 mirrored byte-for-byte.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-warm-tier.test.js`: substring assertions updated.
- `meta-state.jsonl`: 1 finding `meta-260714T1334Z-…` resolved via `meta_state_resolve`.

**Test delta:** +7 hermetic tests in `tools/scripts/__tests__/vitest-failures.test.js`. Full suite final pass: 1893 passed + 1 skipped, 0 failed (212 test files). Cold-session parity: 11/11.

**Resolution:**

- `meta-260714T1334Z-the-test-result-parsing-procedure-is-not-surfaced-to-the-age` resolved with notes referencing the script path, the PROCESS_HINTS row #1 rewrite, the .factory mirror, and the warm-tier test update.

**Procedural notes:**

- The non-greedy regex `[\s\S]*?` in `parseFrozenStringArray` of the cold-session parity test stops at the FIRST `])` in the source — including inside the matched array's strings, not just the closing of `Object.freeze([...])`. First version of row #1 contained `assertionResults[]). Run` which produced `[])` and broke extraction at the wrong byte offset (239 chars instead of ~5300). Replaced `[]).` with `[]; status field is passed/failed.` to break the `])` literal sequence. Lock-in: future rewrites of PROCESS_HINTS rows must not contain the substring `])`.
- File-edit drift catch: `meta-260623T1126Z-…` was anchored at `loop-introspect.js:285`; legitimate row #1 changes shifted the file's SHA-256, surfacing the cold-tier regression test failure. Re-grounded via `meta_state_refresh_file_index` with an audit-trail reason citing this plan.
