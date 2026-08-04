---
phase: 3
title: "Auto-capture repeated toolchain-command failures"
status: completed
priority: P2
effort: "1d"
dependencies: ["1"]
---

# Phase 3: Auto-capture repeated toolchain-command failures

## Overview

A mechanical capture channel for toolchain failures that does NOT rely on agent compliance
(Channel B's weakness). A new `PostToolUseFailure` hook appends a redacted entry to the
existing `.gate-decision.log` whenever a Bash toolchain command exits non-zero; the
SessionStart recurrence check (already wired) groups by `(rule_id="toolchain-failure",
normalized_prefix, session_id)` and files a finding when N≥3 failures of the same command
hit in one session.

**Honest limitation (confirmed by hook-contract scout):** `PostToolUseFailure` fires on
non-zero exit but its payload carries only `tool_input.command` + a generic `error`
(`"Command exited with non-zero status code N"`) — **it does NOT carry the command's stderr**.
So this channel records command-level recurrence, not the stderr signature. It catches
"fallow:gate failed 3× this session" but NOT a single novel failure like the `-50` (which
was one episode). The single-novel-failure class remains Channel B's job (Phase 1 rule).
Phase 3 and Channel B are complementary: Phase 3 catches repeated mechanical failures
without agent cooperation; Channel B catches the agent-observed single episode.

## Requirements

- Functional: a `PostToolUseFailure` hook captures Bash toolchain-command failures
  (`pnpm fallow:gate`, `pnpm test*`, `pnpm run build*`, `pnpm exec vitest*`) and appends a
  redacted entry to `.gate-decision.log` with `rule_id: "toolchain-failure"`, the command
  prefix (normalized + redacted), `session_id` + tier, `decision: "toolchain-failure"`.
- Functional: the existing `recurrence-check-on-start` SessionStart check groups these
  entries by `(rule_id="toolchain-failure", normalized_prefix, session_id)` and files a
  finding when N≥3 per session — reusing the Channel A session-axis grouping (no new
  grouping code; the `rule_id` field separates the class).
- Functional: the finding is filed with `subtype: "recurring-false-positive"` (reused) and
  `rule_id: "toolchain-failure"` distinguishes the class. Redaction via the existing hashed
  id (no raw command in the slug).
- Non-functional: runtime-agnostic — the hook ships in `tools/learning-loop-mastra/hooks/universal/`
  with mirrored shims in `.claude`, `.factory`, `.mastracode` (the `shims-in-sync` checklist
  item). Settings wiring in all three surfaces. Passes `check_runtime_agnostic`.
- Non-functional: no stderr is captured or written (it is not available in the payload) —
  so no secret-leak surface from stderr. Command-prefix redaction reuses `normalizePrefix`.

## Architecture

```
Bash toolchain cmd exits non-zero
  → harness fires PostToolUseFailure
  → tools/.../hooks/universal/toolchain-failure-capture.js
      (shim: .claude/coordination/hooks/toolchain-failure-capture.cjs + mirrors)
      filters: tool_name === "bash" && command matches toolchain pattern
      resolves session_id (reuses worktree-session-id.js resolveSessionId pattern)
      appendDecisionLog(root, { rule_id: "toolchain-failure",
                                 command_prefix: normalizePrefix(command),
                                 decision: "toolchain-failure",
                                 session_id, session_id_tier })
  → next SessionStart: recurrence-check-on-start.cjs → checkAndEmit
  → findRecurrentGroups groups by (rule_id, normalized_prefix, session_id)
      N≥3 per session for "toolchain-failure" entries → files a finding
```

The recurrence-tracker already groups by `(rule_id, normalized_prefix, session_id)` and
thresholds N≥3 per session. Toolchain-failure entries reuse this path verbatim — the
`rule_id: "toolchain-failure"` value partitions them from gate-logic-bug escalations. No
new grouping code; only the capture hook + settings wiring are new.

## Related Code Files

- Create: `tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js` (universal hook)
- Create: `.claude/coordination/hooks/toolchain-failure-capture.cjs` (shim, mirrors `.factory`/`.mastracode`)
- Modify: `.claude/settings.json` — add `PostToolUseFailure` hook entry; mirror in `.factory`/`.mastracode` settings
- Read-only reuse: `core/gate-decision-log.js` (`appendDecisionLog`, `readDecisionLog`),
  `core/recurrence-tracker.js` (`findRecurrentGroups`, `checkAndEmit` — unchanged),
  `hooks/universal/lib/protocol-adapter.js` (`parseInput`, `normalizeToolName`, `extractCommand`),
  `core/worktree-session-id.js` (`getSessionId`)
- Create tests: `__tests__/toolchain-failure-capture.test.cjs` (hook: stdin→log, Bash filter, redaction, toolchain pattern match), extend an existing recurrence-tracker test for the `toolchain-failure` rule_id grouping path.

## Implementation Steps (TDD)

### Step 1 — Scout the PostToolUseFailure payload (DONE in planning)

Confirmed via the hook-contract reference: `PostToolUseFailure` fires on non-zero Bash exit;
payload has `tool_input.command` + top-level `error` (`/non-zero status code/`); **no stderr**.
The capture records command + exit-fact, not stderr. This step is recorded for provenance; no
code action.

### Step 2 — Red: hook test

Create `__tests__/toolchain-failure-capture.test.cjs`. Test cases (hermetic, via a temp
`GATE_ROOT`):
- Given a PostToolUseFailure stdin for a `bash` tool with command `pnpm fallow:gate`, the hook
  appends one `.gate-decision.log` entry with `rule_id: "toolchain-failure"`,
  `decision: "toolchain-failure"`, a normalized `command_prefix`, `session_id` + tier.
- A non-Bash tool event → no append (filter).
- A Bash command NOT matching the toolchain pattern (`ls -la`) → no append (the hook only
  captures toolchain commands, not every failure — avoids noise).
- Redaction: a command containing a secret-shaped fragment (`curl https://x?token=eyJ…`)
  is NOT in the toolchain pattern set → no append (the toolchain-pattern filter is the first
  redaction layer; combined with `normalizePrefix` + hashed id, no secret reaches the registry).

Run: `pnpm exec vitest run tools/learning-loop-mastra/__tests__/toolchain-failure-capture.test.cjs`
→ **RED** (hook does not exist).

### Step 3 — Green: the universal hook

Create `tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js`. Pattern on
`bash-gate.js`:
- `parseInput(stdin)`; if `normalizeToolName(tool_name) !== "bash"` exit 0.
- `command = extractCommand(tool_input)`; if no command exit 0.
- Toolchain pattern match (a maintained list: `pnpm fallow:gate`, `pnpm test`, `pnpm test:*`,
  `pnpm run build`, `pnpm run build:*`, `pnpm exec vitest`, `pnpm exec vitest:*`,
  `pnpm fallow:*`). Non-matching → exit 0 (no noise).
- `resolveSessionId` (reuse the UUID-or-fallback pattern from bash-gate).
- `appendDecisionLog(root, { rule_id: "toolchain-failure", command_prefix: command,
  decision: "toolchain-failure", session_id, session_id_tier })`.
- Exit 0 (PostToolUseFailure hooks must not block; capture is silent).

Run the test → **GREEN**.

### Step 4 — Red: grouping test

Extend `__tests__/rule-derived-process-hints.test.cjs` OR a recurrence-tracker test: given a
`.gate-decision.log` with 3 `toolchain-failure` entries for the same `command_prefix` + same
`session_id`, `findRecurrentGroups` returns one group with `rule_id: "toolchain-failure"`,
count 3; and `checkAndEmit` files a `recurring-false-positive` finding with that rule_id. Also
assert gate-logic-bug and toolchain-failure groups do NOT collapse into each other (different
`rule_id`).

Run → **RED** if the existing tracker needs a tweak to file non-gate-logic rule_ids; otherwise
**GREEN** (the tracker is rule_id-agnostic). If green already, this test is the regression
guard for the partition.

### Step 5 — Green: wire recurrence filing (if needed)

If Step 4 was red, the minimal change is in `checkAndEmit` (`core/recurrence-tracker.js`):
ensure the filing path does not hard-code a gate-logic `rule_id` assumption. The existing
`buildFinding` derives `evidence_code_ref` from the rule record via `ruleById` — for
`toolchain-failure` there is no rule record, so fall back to a generic evidence_code_ref
(`tools/learning-loop-mastra/core/recurrence-tracker.js` itself) and a `subtype`. Keep the
change minimal: only widen the `evidence_code_ref` fallback, do not add new schema fields.

### Step 6 — Runtime-agnostic shims + settings

- Create `.claude/coordination/hooks/toolchain-failure-capture.cjs` (mirror the
  `bash-coordination-gate.cjs` shim: read stdin, exec the universal hook, pass through exit).
- Mirror to `.factory/coordination/hooks/` and `.mastracode/coordination/hooks/` (or the
  surface-specific path per `surfaces.js`).
- Wire `PostToolUseFailure` in `.claude/settings.json`:
  ```json
  "PostToolUseFailure": [{ "hooks": [{ "type": "command",
    "command": "node .claude/coordination/hooks/toolchain-failure-capture.cjs" }] }]
  ```
  Mirror in `.factory`/`.mastracode` settings.

### Step 7 — Runtime-agnostic audit

```bash
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs check_runtime_agnostic \
  --args-file <(echo '{"feature_path":"tools/learning-loop-mastra/hooks/universal/toolchain-failure-capture.js"}')
```
Resolve every failure (shim-not-fork, shims-in-sync across surfaces, protocol-adapter I/O,
manifest registration if a new tool is exposed — this hook exposes no MCP tool, so manifest
is unaffected). Re-run until clean.

### Step 8 — Full suite

```bash
pnpm test
```
Green, including the locked 12-slug set (Phase 1), the new capture tests, and the
runtime-agnostic regression test at `__tests__/runtime-agnostic.test.js` (add the new hook
to its coverage set if the audit requires).

## Success Criteria

- [ ] A non-zero Bash toolchain-command failure appends a redacted `toolchain-failure` entry to `.gate-decision.log` (Bash filter + toolchain-pattern filter verified).
- [ ] 3 same-command failures in one session → SessionStart files a `recurring-false-positive` finding with `rule_id: "toolchain-failure"`; gate-logic-bug and toolchain-failure groups never collapse.
- [ ] No stderr is captured (payload does not provide it); no secret reaches the registry (toolchain-pattern filter + `normalizePrefix` + hashed id).
- [ ] Hook + shim mirrored across `.claude`, `.factory`, `.mastracode`; `PostToolUseFailure` wired in all three settings; `check_runtime_agnostic` clean.
- [ ] `pnpm test` green.

## Risk Assessment

- **Does not catch the -50.** The -50 was a single novel `fallow:gate` failure; this channel
  files only at N≥3 per session. The single-novel-failure class remains Channel B's job
  (Phase 1). Phase 3 catches *repeated* toolchain failures mechanically. If the operator
  wants single-failure capture, lower the threshold to N≥1 — but that files on every
  transient/flaky failure (noise). The plan keeps N≥3 (Channel A parity) and documents N≥1 as
  a tunable alternative.
- **No stderr signature.** `PostToolUseFailure` does not expose stderr, so the filed finding
  carries the command + count, not the error text. The agent's Channel B filing (Phase 1)
  remains the path that carries the diagnostic detail. Mitigation: the finding's
  `sample_commands` + count is enough to flag recurrence; the agent re-runs the command for
  detail when it pulls the finding.
- **Toolchain-pattern maintenance.** The hook matches a maintained command list; a new
  toolchain command (e.g. `pnpm eslint`) is not captured until added. Mitigation: keep the
  list in one constant at the top of the hook; document that adding a toolchain command
  means extending the list.
- **PostToolUseFailure availability.** If a runtime surface does not fire
  PostToolUseFailure, that surface gets no toolchain capture. Mitigation: the
  runtime-agnostic audit + the `shims-in-sync` item surface this; the hook is a no-op
  (silent exit 0) where the event does not fire, so it never breaks a session.
- **Scope.** This phase is the bulk of the delivery (new hook + 3-surface shims + settings +
  tracker widening + tests + audit). It is genuinely a feature; if the operator prefers to
  ship Phases 1–2 first and split Phase 3 into its own plan, that is a valid call — Phase 3's
  value is independent of Channel B's and compounds it.