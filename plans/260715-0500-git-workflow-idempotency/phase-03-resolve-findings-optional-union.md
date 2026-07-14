---
phase: 3
title: "Resolve Findings + Optional Union"
status: pending
priority: P3
effort: "low"
dependencies: [1, 2]
---

# Phase 3: Resolve Findings + Optional Union

## Overview

Close the loop: resolve `meta-260715T0349Z` (fixed via Phases 1–2), record a change-log for the `meta-260709T1017Z` reframe (the finding's description was already patched to v2 on 2026-07-15 to surface the two-target mismatch and is kept OPEN — verify it landed, do NOT resolve it), add a PROCESS_HINTS row so the pretest-seed + commit/regen split convention is discoverable by future sessions, and ship two small optional refinements surfaced by Phases 1–2 (`meta_state_refresh_file_index` no-op return; local `test:cold-session` seed prefix). The optional `runtime-state.jsonl merge=union` is offered as a YAGNI-flagged add-on — defer unless a real parallel-append conflict is observed.

## Requirements

- **Functional:** `meta-260715T0349Z` resolved (fixed via Phases 1–2); `meta-260709T1017Z` reframed (description patched to v2 on 2026-07-15 to name the two-target mismatch) and **kept OPEN** — a change-log records the architectural-tension decision; the finding is NOT resolved. A PROCESS_HINTS row (mirrored to the 4-file parity set per plan `260714-2012` Phase 3) teaches the seed convention + the `SKIP_PRESEED` escape + the untracked-`file-index.jsonl` regen model.
- **Non-functional:** registry writes go through MCP tools (`meta_state_resolve`, `meta_state_log_change`); no direct file writes. The PROCESS_HINTS mirror must update all parity sites (see Risk 2).

## Architecture

Three groups of work, each independently committable:

**A. Resolve + reframe findings (required).**
- `meta_state_resolve({ id: "meta-260715T0349Z-...", resolution: "Fixed: true no-op in upsertFileIndexEntry (Phase 1) + gitignore file-index.jsonl + CI seed-before-cold-session (Phase 2). Re-seed is git-idempotent; cold-tier cache stays warm.", resolved_by: "operator" })`.
- `meta-260709T1017Z` is **already reframed** (description patched to v2 on 2026-07-15 to surface the two-target mismatch; kept OPEN). Do NOT resolve it. Verify the reframe landed (`meta_state_list({id})` shows version 2 + the `[reframe 2026-07-15] TWO-TARGET MISMATCH` block + status `open`), then record the architectural-tension decision as a change-log via `meta_state_log_change` (semantic, target `meta-state.jsonl`, reason ≥20 chars) so the "keep in-PR commits + manual `git merge-file --union`" compromise is auditable. The real fix (split the change-log stream into a separate true-append-only file) is deferred.
- If `meta_state_resolve` errors on already-terminal, check status first (Red-team #13 from `260714-2012`).

**B. PROCESS_HINTS row + parity mirror (required).**
- Append one row to `core/loop-introspect.js` `PROCESS_HINTS` describing: the pretest seed runs via `pnpm test`; `file-index.jsonl` is an untracked regen artifact; `SKIP_PRESEED=1` is an operator-local escape (never CI); per-path refresh uses `meta_state_refresh_file_index`.
- Update the 4-file parity mirror per `260714-2012` Phase 3: `core/loop-introspect.js` (`HINT_KEY_MAP_PROCESS` + `HINT_SUGGESTIONS_PROCESS`), `.factory/hooks/loop-surface-inject.cjs LOCAL_PROCESS_HINTS`, `loop-get-instruction-tool.js`. **Bump the length-assertion sibling test** (`gate-logic-consult-checklist-fallow-brief.test.js:74`) in the same commit (Red-team #1 lesson from `260714-2012`).
- Audit distinction (Red-team #11 lesson): seed-file-index.mjs writes no gate-log; `meta_state_refresh_file_index` is audited — state this in the row text.

**C. Optional refinements (decide per-item).**
- **C1 — `meta_state_refresh_file_index` no-op return.** After Phase 1, the tool returns `status: "refreshed"` / `cache_hit: false` even on an unchanged path (misleading but not incorrect). Refine: detect the no-op (compare stored hash to computed hash before upsert) and return `status: "no-op"` / `cache_hit: true`. Small, improves signal. Check for any consumer asserting `status === "refreshed"` first.
- **C2 — local `test:cold-session` seed prefix.** Phase 2 Risk 2: `test:cold-session` has no seed prefix. Either (a) prepend `seed-file-index.mjs &&` to `test:cold-session` in `package.json` (mirrors `test`), or (b) leave as-is and document. Recommend (a) for symmetry — but verify the cold-session discoverability probe doesn't rely on an *empty* index as a test fixture first (it might assert gap-close behavior against absence).
- **C3 (YAGNI — defer) — `runtime-state.jsonl merge=union`.** True append-only → safe. Low value (runtime-state is session/TTL state, rarely committed in parallel PRs). Add a `.gitattributes` entry only if a real parallel-append conflict on `runtime-state.jsonl` is observed. Otherwise skip.

## Related Code Files

- **Modify (B):** `tools/learning-loop-mastra/core/loop-introspect.js`, `.factory/hooks/loop-surface-inject.cjs`, `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js`, `tools/learning-loop-mastra/__tests__/.../gate-logic-consult-checklist-fallow-brief.test.js` (length assertion)
- **Modify (C1):** `tools/learning-loop-mastra/tools/handlers/meta-state-refresh-file-index-tool.js` (optional)
- **Modify (C2):** `package.json` `test:cold-session` script (optional)
- **Create (C3, optional):** `.gitattributes` (`runtime-state.jsonl merge=union`)
- **MCP:** `meta_state_resolve` (×2), `meta_state_log_change` (record the commit/regen split as a change-log)

## Implementation Steps

1. Run the full suite green: `pnpm test` (confirms Phase 1 + Phase 2 landed cleanly).
2. **(B)** Read `core/loop-introspect.js` `PROCESS_HINTS` current length; draft the new row text (≤ the established row length); append it; update `HINT_KEY_MAP_PROCESS` + `HINT_SUGGESTIONS_PROCESS` so the new key is reachable via `loop_get_instruction({key})` (Red-team #3 lesson). Mirror to the other 3 parity sites. Bump the length assertion in the sibling test. Run `pnpm check:freshness` / cold-session to confirm the hint surfaces.
3. **(A)** Resolve `meta-260715T0349Z` via `meta_state_resolve` (fixed). Verify `meta-260709T1017Z` is version 2 + OPEN + carries the `[reframe 2026-07-15] TWO-TARGET MISMATCH` block (already patched this session) — do NOT resolve it. Record two change-logs via `meta_state_log_change`: (i) the file-index commit/regen split + no-op (target `file-index.jsonl` + `core/meta-state.js#upsertFileIndexEntry`); (ii) the `meta-260709T1017Z` reframe / two-target-mismatch architectural-tension decision (target `meta-state.jsonl`). reason ≥20 chars each.
4. **(C1, optional)** Only if pursued: grep for `status === "refreshed"` / `"refreshed"` consumers; if none depend on the always-“refreshed” wording, add the no-op branch to the tool. Add/adjust a test.
5. **(C2, optional)** Read `cold-session-discoverability.test.cjs` to check it doesn't assert against an empty index; if safe, prepend the seed to `test:cold-session`. If it does assert against absence, leave `test:cold-session` as-is and document the local-run prerequisite in the hint row instead.
6. **(C3, optional, default SKIP)** Only if a real `runtime-state.jsonl` parallel-append conflict is observed: create `.gitattributes` with `runtime-state.jsonl merge=union` and a comment linking finding `meta-260709T1017Z`. Default: skip (YAGNI).
7. Commit per conventional format (no AI refs). Refresh the file-index if any code edit in this phase changed a cited path (now a no-op-friendly operation).

## Success Criteria

- [ ] `meta-260715T0349Z` resolved (fixed) in the registry; `meta-260709T1017Z` verified version 2 + OPEN + reframed (NOT resolved).
- [ ] Two change-log entries: (i) commit/regen split + no-op; (ii) `meta-260709T1017Z` two-target-mismatch reframe / architectural-tension decision.
- [ ] PROCESS_HINTS row appended; all 4 parity sites updated; sibling length-assertion test bumped; `loop_get_instruction({key})` reaches the new row.
- [ ] `pnpm test` green end-to-end.
- [ ] (If C1) `meta_state_refresh_file_index` returns `no-op` on an unchanged path; consumers checked.
- [ ] (If C2) local `pnpm test:cold-session` passes against a seeded index.
- [ ] (If C3) `.gitattributes` present only if justified by an observed conflict.

## Risk Assessment

- **RISK 1 — PROCESS_HINTS parity drift.** Plan `260714-2012` shipped a 4-file mirror with a length-assertion sibling test that hard-fails on count mismatch. Any new row must update **all** parity sites + the assertion in one commit, or `pnpm test` breaks. Re-verify the current mirror site count before editing (it may have changed since `260714-2012`).
- **RISK 2 — `meta_state_resolve` already-terminal.** `meta_state_resolve` errors on already-terminal entries (Red-team #13, `260714-2012`). Check status first; handle gracefully.
- **RISK 3 — C2 fixture conflict.** The cold-session discoverability probe may assert gap-close behavior *against an empty/missing index*. Prepending the seed could mask that fixture and change the test's meaning. Read the test before changing `test:cold-session`.
- **RISK 4 — scope creep via C3.** `runtime-state.jsonl merge=union` is safe but solves a problem that may not exist. Default to skipping; only ship if a real conflict is observed, to honor YAGNI.