---
phase: 1
title: "Implement"
status: pending
effort: "medium"
---

# Phase 1: Implement

<!-- Updated: Validation Session 1 - helper location corrected core/ -> tools/lib/ via #lib/; import path confirmed; reason rename + strict "live" confirmed -->

## Overview

Replace the 3 inline `OPERATOR_MODE` authority gates with a single `LOOP_SESSION_MODE=live|autonomous` session declaration (default `autonomous`, fail-closed). Extract one shared `isLiveSession()` helper in `core/` (DRY — the 3 sites repeat the identical env check). Update 8 test files + 6 comment/description/prompt strings.

## Requirements

- Functional: `promote_rule`, `supersede`, `dispatch_finding({stage:'commit'})` refuse (return `live_session_required`) when `LOOP_SESSION_MODE` is `autonomous` or unset; succeed when `live`.
- Non-functional: no grant machinery; no new ledger event; `*_by` / `*_at` fields unchanged. Open tools (`resolve` / `re_verify` / `archive` / `report` / `log_change` / `propose_design` / `patch`) get NO new gate — run in both modes.

## Architecture

Session declaration, not per-invocation role. The MCP server reads `process.env.LOOP_SESSION_MODE` at tool-handler entry. `autonomous` (default) = fail-closed for the 3 class-approval tools. One shared helper replaces 3 duplicated inline checks.

```
tools/lib/session-mode.js  (NEW — ~8 lines)
  export function isLiveSession() {
    return process.env.LOOP_SESSION_MODE === "live";
  }
  // autonomous / unset / anything else -> false (fail-closed)
```

Imported as `#lib/session-mode.js` — root `package.json` `imports` maps `"#lib/*": "./tools/lib/*"`. Colocates with `gate-logging.js` + `resolve-root.js`, the two small shared helpers all 3 gate-site files already import via `#lib/`.

The 3 gate sites import `isLiveSession` and invert: `if (!isLiveSession()) return {reason:"live_session_required", ...}`.

## Related Code Files

- Create: `tools/lib/session-mode.js` (imported as `#lib/session-mode.js`)
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-promote-rule-tool.js` (drop `checkOperatorRole` helper lines 17-21; import `isLiveSession` from `#lib/session-mode.js`; line 55 → `if (!preview && !isLiveSession())`)
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-supersede-tool.js` (line 18 check + line 9 description string; reason `operator_role_required` → `live_session_required`)
- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-dispatch-finding-tool.js` (line 169 check + lines 21,293 description/doc strings; reason → `live_session_required`)
- Modify: `tools/learning-loop-mastra/tools/legacy/runtime-state-record-tool.js:9` (comment: `OPERATOR_MODE` → `LOOP_SESSION_MODE=live`)
- Modify: `tools/learning-loop-mastra/core/runtime-state.js:13` (comment)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js:258` (Rec 10 prompt string)
- Modify (8 test files): `meta-state-promote-rule-rule-entry.test.js`, `integration-promoted-rule.test.js`, `meta-state-dispatch-finding-tool.test.js`, `meta-state-dispatch-ttl-and-close-flow.test.js`, `meta-state-stale-flag.test.js` (covers supersede), `meta-state-sweep.test.js` (verify the 1 ref is incidental — likely a comment; if it sets the env to exercise a gate, migrate it), `gate-scope-predicate.test.js`, `build-stale-dispatch-hints.test.js` (2 refs — introspect-output string assertions; update strings only)
- Delete: none

## Implementation Steps

1. Create `tools/lib/session-mode.js` with `isLiveSession()` (returns `process.env.LOOP_SESSION_MODE === "live"`).
2. `meta-state-promote-rule-tool.js`: remove local `checkOperatorRole` (lines 17-21 + the "lightweight gate until auth infrastructure" comment above it), import `isLiveSession` from `#lib/session-mode.js`, line 55 → `if (!preview && !isLiveSession())`. Update tool description: "Requires operator role" → "Requires LOOP_SESSION_MODE=live".
3. `meta-state-supersede-tool.js`: line 18 → `if (!isLiveSession())` with `reason: "live_session_required"`. Line 9 description: "Gated on OPERATOR_MODE=1" → "Gated on LOOP_SESSION_MODE=live".
4. `meta-state-dispatch-finding-tool.js`: line 169 → `if (!isLiveSession())` with `reason: "live_session_required"`. Lines 21, 293: "OPERATOR_MODE-gated" → "LOOP_SESSION_MODE=live-gated".
5. Update the 3 comment/prompt strings: `runtime-state-record-tool.js:9`, `core/runtime-state.js:13`, `core/loop-introspect.js:258` ("commit is OPERATOR_MODE-gated" → "commit is LOOP_SESSION_MODE=live-gated").
6. Migrate the 8 test files: replace `process.env.OPERATOR_MODE = "1"` / `"true"` (and any `delete process.env.OPERATOR_MODE` teardown) with `process.env.LOOP_SESSION_MODE = "live"` / `delete process.env.LOOP_SESSION_MODE`. For tests asserting refusal, set `autonomous` (or unset) and assert `reason: "live_session_required"`. Update any assertion strings that mention `OPERATOR_MODE` / `operator_role_required`.
7. Import-path note (verified): `#lib/session-mode.js` resolves to `tools/lib/session-mode.js` per root `package.json` `imports` (`"#lib/*": "./tools/lib/*"`). All 3 gate-site files already import `gate-logging` + `resolve-root` via `#lib/`, so the new import is consistent — no new import style introduced.

## Success Criteria

- [ ] `tools/lib/session-mode.js` exists and exports `isLiveSession` (importable as `#lib/session-mode.js`).
- [ ] No `checkOperatorRole` function remains; no inline `process.env.OPERATOR_MODE` check in the 3 gate sites.
- [ ] `promote_rule` / `supersede` / `dispatch_finding commit` refuse with `live_session_required` when `LOOP_SESSION_MODE != live`; succeed when `= live`.
- [ ] Open tools have no `isLiveSession` gate added.
- [ ] 8 test files migrated; refusal assertions updated to `live_session_required`.
- [ ] `grep -rn "OPERATOR_MODE" tools/learning-loop-mastra --include=*.js --include=*.cjs --include=*.mjs | grep -v __tests__` → empty in non-test, non-journal surface (journal docs under `docs/journals/` are historical and untouched).

## Risk Assessment

- **Fail-closed default must hold.** If `isLiveSession` accidentally returns true on unset/`autonomous`, class-approval tools run unguarded. Mitigation: helper is a strict `=== "live"` equality; anything else is false. Add a unit test for the unset + `autonomous` + `live` + garbage-value cases in phase 2.
- **Test env leakage.** Tests that set `LOOP_SESSION_MODE=live` and don't tear down can mask refusal in other tests. Mitigation: every migrated test deletes/restores the env var in teardown (mirror the existing `OPERATOR_MODE` teardown pattern).
- **Reason-string rename breaks log/grep consumers.** `operator_role_required` → `live_session_required` changes a value that may appear in gate-log or test assertions. Mitigation: phase 2 grep for `operator_role_required` across tests + `.claude/coordination/gate-log.jsonl` references; update all in-test assertions; gate-log is append-only historical (old entries keep old value — acceptable).
- **Shared helper import path.** `#lib/session-mode.js` must resolve — root `package.json` `imports` maps `"#lib/*": "./tools/lib/*"` (verified). The 3 gate-site files already import `gate-logging` + `resolve-root` via `#lib/`, so the alias is exercised in CI today; a typo in the new import path is the only residual risk. Mitigation: phase 2 runs `pnpm test` (covers `#lib/` resolution); a wrong path fails the suite immediately.
- **`meta-state-sweep.test.js` 1 ref may be incidental.** If it's a comment mentioning `OPERATOR_MODE` (not an env set), only the string needs updating — no behavior change. Verify in cook; do not add a gate to sweep.