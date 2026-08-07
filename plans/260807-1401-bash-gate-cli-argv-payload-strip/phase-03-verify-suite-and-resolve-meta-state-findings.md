---
phase: 3
title: "Verify suite, resolve finding, patch recurrence"
status: pending
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: Verify suite, resolve finding, patch recurrence

## Overview

Broaden verification to the full suite and the runtime-agnostic regression test,
then close out the two meta-state findings per the red-team-corrected scope:
**resolve** `meta-260807T1347Z` (the CLI argv finding, fixed by Phase 2) and
**patch** `meta-260807T065133Z-6d1973a8` with the verified shape evidence (it
stays `open` — it is the echo/printf prose class, a different locked limitation).

## Requirements

- Functional: `pnpm test` exit 0 across the whole repo; the runtime-agnostic
  regression test is green (gate-logic is universal-hook core shared by all
  three runtimes).
- Functional: `meta-260807T1347Z` reaches `resolved` via `meta_state_resolve`
  issued through `loop.mjs`, with a payload that **contains the trigger phrase**
  so the inline-JSON path exercises the exact ban that was failing (red-team
  Finding 6).
- Functional: `meta-260807T065133Z-6d1973a8` is **patched** (not resolved) via
  `meta_state_patch` to record the verified shape evidence: its 3 recurrence
  events are `printf '%s\n' '<json tool_input>'` (echo/printf prose class,
  recurrence_key hash-confirmed), distinct from the loop.mjs CLI argv finding;
  it stays `open` pending a follow-up plan on the echo/printf limitation.
- Non-functional: acknowledge the `meta_state_refresh_file_index` blast radius
  (red-team Finding 10) — it re-grounds open sibling findings citing
  `gate-logic.js`; their status is unaffected and their evidence lines are
  re-checked. No docs churn unless the strip chain is explicitly enumerated.

## Architecture

Verification order: full suite → runtime-agnostic regression test → file-index
refresh → resolve the CLI finding → patch the recurrence finding → re-query
both. Meta-state writes go through the loop CLI (`LOOP_SURFACE=.claude node
tools/learning-loop-mastra/bin/loop.mjs ...`); use `--args-file` for large
payloads. `check_runtime_agnostic` is MCP-only (not CLI-portable), so the
test-file regression is the primary verifier (red-team Finding 9).

## Related Code Files

- Verify (read-only): `tools/learning-loop-mastra/core/gate-logic.js` + full test tree.
- Runtime-agnostic regression: `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` (primary); `check_runtime_agnostic` MCP tool optional.
- Meta-state writes (via loop CLI only — direct file writes to `meta-state.jsonl` are blocked):
  - Resolve: `meta-260807T1347Z-rule-no-raw-stdout-vitest-escalates-on-cli-invocations-whose`
  - Patch: `meta-260807T065133Z-6d1973a8`
- Optional docs check: `docs/architecture.md`, `docs/loop-engine.md`.

## Implementation Steps

1. Run `pnpm test` (full suite). Expect exit 0. Fix any regression rather than
   weakening tests.
2. Run the runtime-agnostic regression (primary, CLI-portable):
   `pnpm test tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`.
   Expect green. (`check_runtime_agnostic` is MCP-only and cannot be invoked via
   `loop.mjs`; an optional live MCP audit is a bonus, not the gate.)
3. Re-ground the cited evidence path:
   `loop.mjs meta_state_refresh_file_index '{path:"tools/learning-loop-mastra/core/gate-logic.js",reason:"stripCliArgvPayload added"}'`.
   **Acknowledge the blast radius:** this re-grounds every `mechanism_check:true`
   finding citing `gate-logic.js`, including the two open sibling findings
   (`meta-260716T2220Z-...`, `meta-260801T1549Z-...`). Their `open` status is
   unaffected. Manually re-check their `evidence_code_ref` line numbers (824,
   991) against the post-fix file and note any shift in the patch text below.
4. Resolve the CLI argv finding — the payload MUST contain the trigger phrase so
   the inline-JSON path is exercised (red-team Finding 6):
   `loop.mjs meta_state_resolve '{id:"meta-260807T1347Z-rule-no-raw-stdout-vitest-escalates-on-cli-invocations-whose",resolution:"Fixed by stripCliArgvPayload: canonical loop.mjs <tool> <quoted> inline JSON argv is blanked in both applyPromotedRules passes (quote-kind-aware: single-quoted always, double-quoted only without $(/backtick). Resolves the pnpm test 2>&1 | tail false-positive on node loop.mjs meta_state_resolve <json>. Case 7 ($(...) execution), case 4d (sibling real pipe), case 5 (locked echo limitation) preserved.",resolved_by:"operator"}'`
   Use `--args-file` if the inline JSON is large. **Verify it does not
   self-escalate** — if Phase 2 is incomplete, this call escalates and Phase 3
   fails (the desired signal).
5. Patch (NOT resolve) the recurrence finding with the verified shape evidence:
   `loop.mjs meta_state_patch '{id:"meta-260807T065133Z-6d1973a8",entry_kind:"finding",patch:{description:"Recurrence shape verified 2026-08-07: the 3 events (gate-decision.log lines 1186-1188, ts 06:41:39-06:41:41) are `printf %s\\n <json tool_input>` commands — the agent writing a JSON repro script — NOT the node loop.mjs CLI argv shape. recurrence_key 386a95d8135a1e79 hash-confirmed to the printf normalized prefix. This is the echo/printf prose false-positive class (the locked echo limitation, gate-logic-data-command-quotes.test.js:88), distinct from meta-260807T1347Z (loop.mjs CLI inline JSON argv) which is resolved by stripCliArgvPayload in plan 260807-1401-bash-gate-cli-argv-payload-strip. Stays open: resolving requires relaxing the echo/printf prose limitation with pipe-target-aware threat modeling (the echo X | bash bypass), deferred to a follow-up plan."}}'`
   Do NOT set status to resolved. The patch corrects the registry's record of
   what 6d1973a8 actually represents (red-team Finding 14).
6. Re-query both ids via `meta_state_list({id:[...],include_all_versions:true})`:
   confirm `meta-260807T1347Z` is `status:"resolved"` at the new version, and
   `meta-260807T065133Z-6d1973a8` is still `status:"open"` with the patched
   description at the new version.
7. Check `docs/architecture.md` and `docs/loop-engine.md` for any explicit
   enumeration of the gate strip chain; update only if the strips are listed
   there and the new helper would leave the doc stale. Otherwise no doc churn.

## Success Criteria

- [ ] `pnpm test` exit 0, full suite green
- [ ] `runtime-agnostic.test.js` green
- [ ] `meta_state_refresh_file_index` run on `gate-logic.js`; sibling findings' evidence lines re-checked and noted
- [ ] `meta_state_resolve` succeeds (no self-escalation) for `meta-260807T1347Z` with a trigger-phrase payload; read back as `status:"resolved"`
- [ ] `meta_state_patch` adds the verified shape evidence to `meta-260807T065133Z-6d1973a8`; read back as still `status:"open"` with the corrected description
- [ ] Docs updated only if the strip chain was explicitly enumerated

## Risk Assessment

- **Self-escalation on the resolve call:** the Phase 2 fix removes this; the
  trigger-phrase payload makes the check non-vacuous (red-team Finding 6). If it
  escalates, Phase 2 is incomplete — fix, do not weaken. Fallback: `--args-file`
  (path-only, no inline JSON).
- **Patching vs resolving 6d1973a8:** the patch must NOT flip status to
  resolved. `meta_state_patch` with a `description` patch updates the record
  without resolving; verify the read-back status is still `open`.
- **Refresh blast radius:** the two open sibling findings are re-grounded; their
  open status is correct and unaffected. If a sibling's evidence line shifted,
  note it in the patch text so the registry stays honest.