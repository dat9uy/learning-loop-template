---
phase: 3
title: "Verify suite, resolve and patch meta-state findings"
status: completed
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Verify suite, resolve and patch meta-state findings

## Overview

Run the full suite + runtime-agnostic regression (gate-logic is universal-hook
core shared by all 3 runtimes), then close the meta-state loop with the
**red-team-corrected** sibling analysis: resolve `meta-260807T065133Z-6d1973a8`
ONLY if its shape has no redirect (else patch-with-evidence and leave open);
verify (not re-resolve) the already-resolved `meta-260801T1549Z`; shape-verify
`meta-260807T054940Z-92fb5b00` and `meta-202608040535131Z-a5a14e16` (distinct
recurrence keys; plausibly real pipes → leave open); drop `meta-260716T2220Z`
(resolved grep/jq, not echo prose). Do NOT archive the resolved finding.

## Requirements

- Functional: `pnpm test` exit 0; `runtime-agnostic.test.js` green; no
  regression in any gate-logic-coupled suite.
- Non-functional: meta-state mutations go through the loop CLI
  (`LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs <tool>
  '<json>'`), never direct `meta-state.jsonl` writes. Each sibling finding is
  shape-verified against the actual decision-log command_prefix BEFORE any
  resolve/patch — no assertions. Resolved findings are not re-resolved; the
  do-not-archive constraint is recorded.

## Architecture

Verification is layered: (1) the new + flipped Phase-1/2 tests, (2) the full
vitest suite via `pnpm test` (auto-seeds `file-index.jsonl`), (3) the
runtime-agnostic regression. Meta-state closure: `meta_state_list` to read each
sibling's latest version + status → `meta_state_derive_status` → branch on
status (resolved → verify consistency; open → shape-verify → resolve or
patch-with-evidence or leave-open) → `meta_state_resolve` / `meta_state_patch` /
`meta_state_refresh_file_index` as appropriate.

## Related Code Files

- Read: `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` (must stay green)
- Read: `tools/learning-loop-mastra/core/gate-logic.js` (final state)
- Read: `.claude/coordination/.gate-decision.log` lines 1186-1188 (finding event shapes; truncated — confirm no redirect visible, acknowledge residual uncertainty)
- Mutate (via loop CLI only): `meta-state.jsonl` (resolve + patch + refresh entries)

## Implementation Steps

1. Focused: `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-echo-prose-pipe-target.test.js` → GREEN. Re-run the three flipped-test files → GREEN.
2. Confirm the finding's shape: re-read `.claude/coordination/.gate-decision.log` lines 1186-1188. The `command_prefix` is truncated (~140 chars, no full `command` field stored), so a trailing `> /tmp/x` redirect CANNOT be confirmed or ruled out. Record this uncertainty explicitly in the resolve/patch payload. The "echo/printf prose class" classification (prior plan, hash-confirmed to the printf prefix) implies no executing pipe target; the only plausible redirect is to-file-for-inspection, which Option A preserves (conservative). Decision rule:
   - If the visible prefix and recurrence shape indicate NO redirect (the `|` is inside the quoted JSON, no real pipe) → `meta_state_resolve` (the false positive is fixed: `printf '%s\n' '<json | inside>'` → ok).
   - If a redirect cannot be ruled out and保守-preserve means the finding would still escalate → `meta_state_patch` with the verified shape evidence and LEAVE the finding `open` (no bypass opens either way; the residual false positive is documented, not silently buried).
3. Full suite: `pnpm test` → exit 0. If `file-index.jsonl` drift errors surface (from Phase-2 edits to `gate-logic.js`), the auto-seed step absorbs them; if a targeted run skips seed, run `node tools/learning-loop-mastra/tools/handlers/scripts/seed-file-index.mjs` once. Do NOT use `SKIP_PRESEED=1` as a blanket bypass.
4. Runtime-agnostic: confirm `runtime-agnostic.test.js` is GREEN (part of `pnpm test`, but call it out — gate-logic is shared by `.claude`/`.factory`/`.mastracode` universal hooks).
5. `meta_state_derive_status '{"id":"meta-260807T065133Z-6d1973a8"}'` — confirm the effective status reflects the now-fixed code.
6. Resolve OR patch the primary finding per step 2's decision rule:
   - Resolve payload (if no redirect): `meta_state_resolve '{"id":"meta-260807T065133Z-6d1973a8","resolution":"Resolved by stripEchoProseSafe (Option A: per-segment echo/printf prose blank only when no redirect and no single real |; ||/&&/;/&/end are non-pipes). The 3 recurrence events (printf %s\\n <json with | inside>) have no real pipe and no redirect → blanked → ok. No bypass: redirect or real | preserves prose (echo banned > f && bash f and echo banned | bash stay escalate). Full-command stripEchoProse unchanged. See plan 260807-1450.","resolved_by":"operator"}'`.
   - Patch payload (if redirect cannot be ruled out): `meta_state_patch` adding verified shape evidence + the Option A mechanism note; leave `open`.
7. `meta_state_refresh_file_index '{"path":"tools/learning-loop-mastra/core/gate-logic.js","reason":"stripEchoProseSafe added; re-ground cited path hash after Option A echo/printf prose relaxation"}'` — re-grounds every finding anchored to that path by cited PATH (not recurrence shape). This is a hash refresh, NOT a shape resolution.
8. Sibling findings — shape-verify each, branch on current status (corrected analysis):
   - `meta_state_list '{"id":["meta-260716T2220Z-the-full-command-second-pass-in-applypromotedrules-gate-logi","meta-260716T2220Z-agents-evade-...two-command-redi"]}'` — confirm the first is the resolved grep/jq finding (NOT echo prose; drop, do not touch) and note the second (redirect-split evasion, open) is a separate class out of scope.
   - `meta_state_list '{"id":["meta-260801T1549Z-bash-gate-escalated-...-v1-mat"]}'` (resolve exact id first) — it is already `resolved` via full-command `stripEchoProse`. Run `meta_state_derive_status`; verify the new per-segment behavior is CONSISTENT with that resolution (the no-pipe shape now also blanks per-segment). If the mechanism broadened, `meta_state_patch` the resolution text to note the per-segment extension; do NOT re-resolve.
   - `meta_state_list '{"id":["meta-260807T054940Z-92fb5b00","meta-202608040535131Z-a5a14e16"]}'` — shape-verify each against its decision-log `command_prefix` and recurrence_key. `92fb5b00` (recurrence_key `…424bbd5fa3489dbc`) is plausibly `pnpm test:one … 2>&1 | head` (a REAL pipe, per sibling `meta-260807T054940Z-cbab4a3d`) → Option A does NOT resolve it (real pipe → preserve → still escalate correctly). Leave `open`; `meta_state_patch` with a note "not an echo-prose shape; real pipe, correctly still escalate; untouched by plan 260807-1450". Do the same independent shape-verification for `a5a14e16` (recurrence_key `…a52c972d904c2221`).
9. Commit: conventional-commit format, no plan IDs / phase numbers / finding codes in the commit message (rule-no-plan-ids-in-stable-code-artifacts). Example subject: `feat(gate): relax per-segment echo/printf prose with no-bypass stripping`.
10. Post-commit: `meta_state_log_change '{"change_dimension":"semantic","change_target":"tools/learning-loop-mastra/core/gate-logic.js","change_diff":{"added":["stripEchoProseSafe","segmentHasRedirect","followedByRealPipe"],"removed":[],"changed":["applyPromotedRules per-segment pass wires stripEchoProseSafe"]},"reason":"Resolve meta-260807T065133Z-6d1973a8 echo/printf prose false-positive via Option A no-bypass per-segment blank; see local:meta-state:meta-260807T065133Z-6d1973a8"}'`.

## Success Criteria

- [ ] `pnpm test` exit 0; `runtime-agnostic.test.js` GREEN.
- [ ] Finding shape decision (resolve vs patch-with-evidence) made explicitly from the visible log prefix + recurrence shape; the redirect uncertainty recorded.
- [ ] `meta_state_resolve` (if no redirect) OR `meta_state_patch` (if redirect uncertain) for `meta-260807T065133Z-6d1973a8`; no silent assertion.
- [ ] `meta_state_refresh_file_index` re-grounds `gate-logic.js` (path-based hash refresh, not shape resolution).
- [ ] `meta-260716T2220Z` dropped (resolved grep/jq, not echo prose); `meta-260801T1549Z` verified-consistent (not re-resolved); `meta-260807T054940Z-92fb5b00` and `meta-202608040535131Z-a5a14e16` shape-verified and left open with notes if real-pipe.
- [ ] Do-not-archive constraint recorded for the resolved finding (archiving re-admits the recurrence_key; `resolved` is terminal).
- [ ] Commit message free of plan IDs / phase numbers / finding codes; conventional-commit format.
- [ ] `meta_state_log_change` semantic change-log entry recorded citing the finding via `local:meta-state:` ref.

## Risk Assessment

- **Premature resolve (Medium):** resolving before the full suite is green, or asserting the shape without verifying, would hide a regression or be dishonest. Mitigated by strict ordering: suite green → shape inspection → branch on redirect uncertainty → then resolve OR patch. If the suite is red, keep the finding `open` and stop.
- **Sibling over-reach (Medium):** the prior draft conflated path-fingerprint with recurrence-shape and mislabeled a resolved grep/jq finding as an echo-prose sibling. Mitigated by per-finding `meta_state_list` (latest version + status) + `derive_status` + decision-log shape inspection before any action; resolved findings are verified-consistent, not re-resolved; real-pipe findings are left open with notes.
- **Archive re-admit (Low):** archiving the resolved finding re-admits its `recurrence_key`; the 3 historical decision-log entries (append-only) would re-file at next SessionStart (`recurrence-tracker.js` dedup filters `status !== "archived"`). Mitigated by the do-not-archive note; `resolved` is the terminal state.
- **File-index drift (Low):** editing `gate-logic.js` changes its hash; findings anchored to it surface as drifted until re-grounded. Mitigated by `meta_state_refresh_file_index` after the refactor and by `pnpm test` auto-seed.