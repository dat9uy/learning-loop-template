---
title: "Bash Gate: Debate-Friendly + String-Literal Fix (Two Plans from One Report)"
description: "Closes finding meta-260614T2141Z-two-related-gaps-in-the-bash-gate-... by turning the gate from a black box into a meta-surface participant (Plan 1: stderr visibility + local override MCP tool + recurrence tracker that auto-files findings), and shipping a narrow first-pass fix for the node -e nested string literal false positive (Plan 2: conservative strip, defer the rest to the loop's self-model). The user-stated reframe: visibility is primary, override is in-session, recurrence drives learning, do not try to perfectly classify every false positive up front."
date: "2026-06-15T13:00:00Z"
tags: [meta, gate, bash-gate, visibility, override, recurrence, learning-loop, false-positive, stripMessageFlags, meta-state, runtime-state, mcp-tool]
status: draft
session: 260615-bash-gate-debate-friendly
supersedes: null
superseded_by: null
related:
  - meta-state.jsonl entry meta-260614T2141Z-two-related-gaps-in-the-bash-gate-tools-learning-loop-mcp-ho (the finding this report addresses)
  - meta-state.jsonl entry meta-260606T0028Z-g8-subcommand-class-false-positive-supersede (prior G8 fix; same family of gate-bug class)
  - meta-state.jsonl entry meta-260606T0225Z-g8-subcommand-class-false-positive-fixed (refined regex; same family)
  - meta-state.jsonl entry meta-260605T2010Z (the splitSegments quote-aware fix this design extends)
  - tools/learning-loop-mcp/hooks/bash-gate.js (target: stderr visibility, decision log)
  - tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules (target: skip-on-override integration, stripNodeEvalBody)
  - tools/learning-loop-mcp/core/gate-logic.js#stripMessageFlags (target: sibling stripNodeEvalBody function)
  - tools/learning-loop-mcp/core/patterns.json#message_flags (no change; new flag set is code-side, not patterns-side)
  - tools/learning-loop-mcp/hooks/lib/protocol-adapter.js#formatOutput (target: keep stdout for ok, route block/escalate to stderr)
  - tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js (target: add 4 regression tests for node -e)
  - tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js (target: G8-style regression tests for override + recurrence)
  - AGENTS.md §1 (meta-surface is the only bound surface; both plans live here)
  - AGENTS.md §6 (Internalization Rule; both plans cite code, not markdown)
  - docs/philosophy.md (no change; the design honors the existing framework)
related_findings:
  - meta-260614T2141Z-two-related-gaps-in-the-bash-gate-tools-learning-loop-mcp-ho (gate-logic-bug, reported, expiring 2026-06-15)
---

# Bash Gate: Debate-Friendly + String-Literal Fix

## TL;DR

Finding `meta-260614T2141Z-...` documents two related gaps in `tools/learning-loop-mcp/hooks/bash-gate.js` + `core/gate-logic.js#applyPromotedRules`. The user's reframe changes what "fix" means:

- **Visibility is primary.** The agent must see the gate's decision JSON, not just "Error: Tool execution blocked by hook".
- **Override is in-session.** A meta-surface tool + a TTL'd marker lets the operator/agent bypass a known false-positive without rewriting the rule.
- **Recurrence drives learning.** When the same false-positive pattern recurs N≥3 times in M≤10min, the loop auto-files a `meta_state_report` finding. The loop designs the proper fix; the gate doesn't try to perfectly classify every case up front.
- **Don't try to solve immediately.** Ship a narrow first pass for the `node -e` nested string literal case; defer `python -c`, `bash -c`, `ruby -e`, `perl -e` to the loop's self-model.

This breaks into two plans:

- **Plan 1 — Gate debate infrastructure** (the larger, foundational change): stderr visibility + `.gate-override` marker + new `gate_override` MCP tool + decision log + new `gate_check_recurrence` MCP tool that auto-files findings.
- **Plan 2 — Conservative string-literal fix** (narrow, ships fast): new `stripNodeEvalBody(segment)` that blanks out the body of `node -e`/`node --eval`/`node -p`/`node --print` wrappers. 4 regression tests. Document the bypass risk (`node -e "import vnstock_data"`) in the change-log so Plan 1's recurrence tracker can catch it.

## Problem Statement

### The finding (verbatim summary)

> Two related gaps in the bash gate (`tools/learning-loop-mcp/hooks/bash-gate.js` + `core/gate-logic.js#applyPromotedRules`):
>
> 1. **False positive on content inside `node -e "..."` string literals.** Empirical probes 2026-06-14 confirmed: `node -e "console.log('do not create a new schema')"` and `node -e "console.log('propose a new artifact')"` both escalate with `rule-no-new-artifact-types`, even though the trigger phrase is inside a JavaScript string literal. The quote-aware `splitSegments` (P2 from `meta-260605T2010Z-...`) + `stripMessageFlags` were designed to keep quoted message bodies whole so the regex sees only the command verb. They work for known message flags (`-m`, `--message`) but NOT for `node -e` (or `python -c`, `ruby -e`, `perl -e`, `bash -c`, etc.). The regex still matches the literal text inside the quoted body.
>
> 2. **Opaque error to the agent.** When the bash gate blocks a tool call, the agent receives the generic "Error: Tool execution blocked by hook" message from the Claude Code / Droid CLI runtime. The gate's actual JSON decision (`decision`, `reason`, `rule_id`, `matched_pattern`) goes to stdout and is captured by the tool runtime, not surfaced back to the agent. Combined with gap #1, this means an agent invoking a benign script can be silently blocked with no actionable feedback, and the only way to diagnose is to manually reproduce via `spawnSync`.
>
> Reproduction: 11 probes via `/tmp/probe-bash-gate-2.mjs` 2026-06-14 — P1, P2, P3, P4, P5, P6, P7, P8, P9, P11, P12, P13, P14, P15, P16, P20 all return exit 0; P10, P17, P18, P19 correctly escalate/block. The asymmetry: the gate correctly handles the simple cases, but the `node -e` body and any content with trigger phrases inside a quoted string literal gets over-blocked.
>
> Fixes to consider (separate plans):
> - Extend `stripMessageFlags` to recognize `node -e`, `node --eval`, `python -c`, `python3 -c`, `ruby -e`, `perl -e`, `bash -c`, `sh -c` as message-flag-like. Pass the post-strip body to `applyPromotedRules` instead of the full command.
> - Surface the gate's decision JSON back to the agent in a structured form (e.g., add it to the error message, or write it to a tmp file the agent can read).

### The user's reframe (operator-stated, 2026-06-15)

> I think the visibility of the error is more important. The another scenario is: If the gate is blocking wrong action, how the operator could override locally in that session. If the tension happens multiple times, file a finding in meta-state to adjust the gate. We don't expect to solve it right away, but have to solve it in the learning-loop-friendly way. Now the gate is not (just error without return anything to debate/adjust)

This reframe is the load-bearing constraint. It is not "fix the regex" — it is "make the gate debatable, and let the loop finish the job". The two plans are the shape of that reframe.

### Scoping decisions (from the discovery round)

| Question | Decision | Why |
|---|---|---|
| Output artifact | One brainstorm report → 2 plans | User explicit |
| Fix aggressiveness for `node -e` | Document + accept bypass risk | User explicit; Plan 1's recurrence tracker catches it |
| Error feedback surface | stderr (universal) | Both Claude Code and Droid CLI surface stderr to the model on exit-2 |
| Cross-surface | Universal (both Claude + Droid) | `protocol-adapter.js` is already the universal layer; no surface-specific code |

## Evaluated Approaches

### Plan 1 candidates

#### Position 1A: stderr visibility only (rejected)

Just change `console.log` to `process.stderr.write` in `bash-gate.js` for the block/escalate branch. Ship that as the fix.

**Pros:** Smallest possible change. No new architecture. Solves the immediate "agent can't see why" problem.

**Cons:** Doesn't close the learning loop. The agent sees the JSON but has no way to act on it (no override). The operator still has to edit the rule to bypass a known false positive. The user's reframe says visibility is primary BUT override + recurrence are also required. This position leaves them out.

#### Position 1B: stderr + env-var override (rejected as primary)

stderr visibility + `LL_GATE_OVERRIDE` env var (comma-separated rule_ids) to skip rules in the current session.

**Pros:** No new MCP tool. Simple. The env var is the override.

**Cons:** **Bypasses the meta-surface.** An env var is not auditable, not discoverable via `meta_state_list`, not logged in `runtime-state.jsonl`. The override should itself be a meta-surface action — same audit + validation as `record_observation` or `meta_state_report`. Env var is acceptable as a *fallback* for the rare case where the agent can't call an MCP tool, but the primary path must be a tool. This is the same lesson as the G8 fix (regex bypassed the meta-surface) and the direct-I/O escape-hatch (finding `meta-260606T2102Z-...`).

#### Position 1C: stderr + override MCP tool + recurrence tracker (selected)

stderr visibility + `.gate-override` marker + new `gate_override` MCP tool + decision log + new `gate_check_recurrence` MCP tool.

**Pros:** Every surface is meta-surface-native. Override is auditable (runtime-state.jsonl). Recurrence auto-files findings, closing the learning loop. The recurrence tracker is itself a meta-surface tool — agent or operator can call it explicitly, or the SessionStart hook can call it.

**Cons:** Bigger change. Three new pieces (override tool, recurrence tool, decision log) + stderr change. The decision log adds a small disk write per gate call. Worth the cost given the operator's reframe.

#### Position 1D: universal override surface (over-engineered, rejected)

Override every gate decision, with full audit log + cross-surface UI, plus a daemon that watches the log and auto-files.

**Pros:** Most ambitious. Most aligned with "learning-loop friendly".

**Cons:** Daemon is out-of-scope (no new processes). UI is out-of-scope. The MCP-tool + SessionStart-hook + decision-log approach gets 90% of the value at 20% of the surface. Same lesson as "Approach A → SQLite" in `AGENTS.md` §10: don't jump to the heaviest solution.

### Plan 2 candidates

#### Position 2A: strip all `*-c`/`*-e` wrapper bodies (rejected)

Extend `stripMessageFlags` to recognize every inline-script wrapper (`node -e`, `python -c`, `bash -c`, `ruby -e`, `perl -e`, `sh -c`) and strip the body before regex matching.

**Pros:** One fix handles all wrappers. Symmetric with the existing message-flag pattern.

**Cons:** **Regresses the existing `bash -c "docker run ubuntu"` test** (`__tests__/gate-logic-quoted-strings.test.js:38-50`). And the `python -c "import docker"` test (line 52-58). And the `bash -c "npm install"` test (line 60-66). These are the correct behaviors — the body IS a real command. Stripping them creates a bypass for `bash -c "docker run"`, which is exactly the false positive in the other direction. The user explicitly said "we don't expect to solve it right away" — the symmetric strip is the wrong move.

#### Position 2B: strip `node -e` body only (selected for the conservative first pass)

Ship a narrow fix that only handles `node -e` / `node --eval` / `node -p` / `node --print`. Defer the rest to Plan 1's recurrence tracker.

**Pros:** Catches the specific case in the finding. Does not regress any existing test. The bypass risk (`node -e "import vnstock_data"` no longer matches `side-effect-import`) is **documented in the change-log** and **caught by Plan 1's recurrence tracker** when it recurs.

**Cons:** The bypass risk is real. `node -e` is occasionally used to wrap real vendor commands. We accept this because (a) the pattern is rare in real agent flows (agents use `node` scripts in files, not `node -e`), (b) the bypass is observable in `runtime-state.jsonl` via the decision log, (c) Plan 1's recurrence tracker will surface the pattern if it recurs. The cost of perfect detection > the cost of letting the loop observe.

#### Position 2C: nested-string-literal-only strip (rejected)

Strip only when the body contains a *nested* string literal (a `'` or `"` inside the outer `"..."`). Don't strip if the body is the actual code.

**Pros:** More precise. `node -e "console.log('foo')"` (nested) is stripped; `node -e "import vnstock_data"` (top-level) is preserved.

**Cons:** Requires a second pass of quote-aware parsing on top of the existing `splitSegments`. Doubles the quote-state machinery. The body of `node -e "create_a_new_schema()"` is real code (a function call that touches the trigger phrase as an identifier) — would still match, but is that the right answer? The function is being CALLED, not PROPOSED. The semantic question ("is this a real trigger or data?") doesn't have a clean regex answer. Position 2B is simpler and ships faster; the loop's recurrence tracker fills the precision gap over time.

#### Position 2D: do nothing, let Plan 1 do all the work (rejected)

Ship only Plan 1. Plan 2 becomes a future plan triggered by the recurrence tracker.

**Pros:** Smallest change to the gate logic. The loop's self-model is the only thing that changes.

**Cons:** The user explicitly said "2 plan for each gap". Plan 2 must exist as a discrete plan, even if it's narrow. And shipping a small, named fix for the most common case is good citizenship — it shows the loop can act on its own observations, not just observe.

## Final Recommended Solution

### Plan 1 — Bash Gate Debate Infrastructure

**Goal:** turn the gate from a black box into a meta-surface participant.

#### Component 1.1: stderr visibility (the smallest piece, ships first in Phase 0)

In `tools/learning-loop-mcp/hooks/bash-gate.js`, change the `console.log(formatOutput(...))` call sites for the block/escalate branch to `process.stderr.write(formatOutput(decision) + "\n")`. Keep the `decision: "ok"` branch on stdout (the hook system still needs to parse it).

Three sites in `bash-gate.js`:
- Line ~79: `console.log(formatOutput(promotedCheck))` for the `applyPromotedRules` escalate branch.
- Line ~99: `console.log(formatOutput(decision))` for the combined block/escalate path.

**Universal compatibility:** Claude Code and Droid CLI both surface stderr to the model on exit-2. The `protocol-adapter.js` layer is universal; no surface-specific code.

**Tests:** `__tests__/gate-stderr-visibility.test.js` — capture stderr via `process.stderr.write` mock or by spawning the hook, verify the JSON decision structure.

#### Component 1.2: `.gate-override` marker + `gate_override` MCP tool

**Marker:** `.factory/coordination/.gate-override` (and `.claude/coordination/.gate-override` for cross-surface). Content:
```json
{
  "rule_ids": ["rule-no-new-artifact-types"],
  "ttl_seconds": 3600,
  "operator_note": "False positive on `node -e` body — see meta-260614T2141Z",
  "created_at": "2026-06-15T13:00:00Z"
}
```

The TTL is checked at marker-read time. Expired markers are ignored (the file can stay on disk; the next read returns "no override").

**Reader:** in `core/gate-logic.js#applyPromotedRules`, before the rule loop, read the marker. If active, build a `Set<string>` of rule_ids to skip. The skip is logged to the decision log (Component 1.4) with a `skipped: true` field for the affected rules.

**New MCP tool `gate_override`:** `tools/learning-loop-mcp/tools/gate-override-tool.js`. Inputs: `{ rule_id: string, ttl_seconds: number, operator_note: string }`. Effects:
1. Validate inputs (rule_id must exist in `loadPromotedRules(root)`, ttl_seconds > 0, operator_note non-empty).
2. Read+merge existing marker (or create new).
3. Write marker to both `.factory/coordination/` and `.claude/coordination/`.
4. Log a `runtime_state_record` entry via the `runtime_state_record` MCP tool (or, if the gate is the actor, the marker write itself is auditable).

**Why a tool and not env var:** the override is a meta-surface action. It deserves the same audit + validation as `record_observation`, `meta_state_report`, etc. The marker is the side-effect; the tool is the canonical path.

**Tests:** `__tests__/gate-override.test.js`:
- Override skips the rule (returns `decision: "ok"` for an otherwise-matching command).
- Marker TTL expiry: write a marker with `ttl_seconds: -1`, verify it's ignored.
- Override audit: the runtime-state.jsonl has the entry.
- Multi-rule: list multiple rule_ids, all are skipped.
- Unknown rule_id: tool returns error (not silently ignored).

#### Component 1.3: decision log

**Location:** `.factory/coordination/.gate-decision.log` (and `.claude/coordination/.gate-decision.log` for cross-surface). Format: append-only newline-delimited JSON, one entry per gate call.

**Schema:**
```json
{
  "ts": "2026-06-15T13:00:00.000Z",
  "command_prefix": "node -e \"console.log('foo')\"",  // first 80 chars
  "rule_id": "rule-no-new-artifact-types" | null,
  "decision": "ok" | "block" | "escalate",
  "reason": "...",
  "matched_pattern": "..." | null,
  "skipped_via_override": false
}
```

**Writer:** in `bash-gate.js`, after the decision is made (in main), append one line. Use a write-temp-then-rename pattern for atomicity. Fail-open: if the write fails, the gate still works (it just doesn't get the log). Log the failure to stderr (which the agent will see if the gate blocked).

**Why a separate file, not in `runtime-state.jsonl`:** `runtime-state.jsonl` is operator-writable + agent-readable; the gate's per-call decision log is high-frequency (every command). Mixing them would bloat the operator surface. Keep them separate; the recurrence tracker reads the gate log and emits findings via `meta_state_report` (the operator-writable surface).

**Tests:** `__tests__/gate-decision-log.test.js`:
- Each gate call produces exactly one log line.
- Schema fields present.
- Concurrent writes (parallel gate calls) don't corrupt the file (write-temp-then-rename per call).
- Decision log is rotated/compacted (TBD; could be 1MB / 1000 lines, with a `.gate-decision.log.N` rotation).

#### Component 1.4: recurrence tracker + `gate_check_recurrence` MCP tool

**Reader:** `core/recurrence-tracker.js` (new file). Reads the last M minutes of `.gate-decision.log` (or both surfaces). Groups by `rule_id + command_prefix_normalized`. `command_prefix_normalized` is the first 50 chars with quotes removed and all whitespace collapsed — so `node -e "console.log('foo')"` and `node -e "console.log('bar')"` group together.

**Threshold:** N≥3 occurrences in M≤10min for the same `rule_id + command_prefix_normalized`. These defaults are constants in `core/recurrence-tracker.js`; can be tuned.

**Auto-file:** if a group exceeds the threshold and no matching `meta_state_report` finding exists with the same `command_prefix_normalized` (deduped by `evidence_code_ref` pointing at the recurrence-tracker code), emit a new finding:
```json
{
  "id": "meta-<auto-generated>",
  "entry_kind": "finding",
  "category": "gate-logic-bug",
  "severity": "warning",
  "affected_system": "gate-logic",
  "subtype": "recurring-false-positive",
  "description": "Pattern recurred N times in M minutes: <rule_id> + <command_prefix_normalized>. First seen: <first_ts>. Last seen: <last_ts>. Sample commands: [...]",
  "evidence_code_ref": "tools/learning-loop-mcp/core/recurrence-tracker.js",
  "mechanism_check": true,
  "status": "reported",
  "expires_at": "<now + 24h>"
}
```

**Tool:** `tools/learning-loop-mcp/tools/gate-check-recurrence-tool.js`. Single tool call, no inputs (reads from default paths), returns `{ checked_groups: N, findings_emitted: M, threshold: { N, M } }`. The agent can call this explicitly; the SessionStart hook can call it as part of the discoverability surface.

**Why a tool, not embedded in the bash gate:** the gate shouldn't call `meta_state_report` directly. That's a layering violation (same as direct file I/O on `meta-state.jsonl` — see finding `meta-260606T2102Z-...`). The tool is the canonical path; the agent/operator calls it.

**Tests:** `__tests__/gate-recurrence.test.js`:
- N=3, M=10min threshold: emit finding.
- N=2: do not emit.
- Dedup: if a finding with the same `command_prefix_normalized` already exists, do not emit a duplicate.
- Cross-surface: reads both `.factory/` and `.claude/` decision logs.

#### Plan 1 acceptance criteria

- An agent receiving a gate block sees the decision JSON on stderr.
- An operator can call `gate_override({ rule_id: "rule-foo", ttl_seconds: 3600 })` and the gate skips `rule-foo` for 1 hour.
- Every override application is in `runtime-state.jsonl`.
- Every gate decision is in `.gate-decision.log`.
- After 3 occurrences of the same false-positive pattern in 10 minutes, a `meta_state_report` finding is auto-filed.
- 840+ tests pass; 0 regressions; new tests for all 4 components.

### Plan 2 — Conservative `node -e` Strip

**Goal:** ship a narrow first-pass fix for the most common case in the finding. Defer the rest to Plan 1's recurrence tracker.

#### Component 2.1: `stripNodeEvalBody(segment)`

**Location:** new function in `core/gate-logic.js`, sibling to `stripMessageFlags`. Called by `applyPromotedRules` and `matchConstraintPattern` after `stripMessageFlags`.

**Behavior:**
- Detect token sequence: `(node|nodejs) (-e|--eval|-p|--print) ("..."|'...')`.
- Replace the quoted body with an empty placeholder (`""` or `''`).
- Leave the wrapper+flag visible (so `node -e ""` remains; it just has an empty body).
- Return the modified segment string.

**Edge cases:**
- Multiple `-e` flags in one command: strip each in order.
- Quoted flag value spanning multiple tokens: use the existing quote-aware logic (already in `splitSegments`).
- `node` without `-e` (e.g., `node script.js`): do not touch.

**Why only `node`, not `python -c` / `bash -c` / `ruby -e` / `perl -e`:** the existing tests assert `bash -c "docker run ubuntu"` MUST match "docker" (line 38-50), `python -c "import docker"` MUST match "docker" (line 52-58), `bash -c "npm install"` MUST match "package-manager" (line 60-66). These are the correct behaviors. Stripping those wrappers would regress them. The user's reframe says "we don't expect to solve it right away" — defer those to the loop's self-model.

**Bypass risk:** `node -e "import vnstock_data"` would no longer match `side-effect-import` after the strip (because the import is inside the body that gets blanked). This is documented in the change-log and in a new finding. Plan 1's recurrence tracker will surface this if it recurs.

#### Component 2.2: regression tests

4 new tests in `__tests__/gate-logic-quoted-strings.test.js`:

```js
// Strip the body — false positives become ok
await test("matchConstraintPattern: node -e with nested string literal containing trigger → null", () => {
  const result = matchConstraintPattern(`node -e "console.log('do not create a new schema')"`);
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: node -e with nested string literal containing propose → null", () => {
  const result = matchConstraintPattern(`node -e "console.log('propose a new artifact')"`);
  assert.strictEqual(result, null);
});

// Do NOT touch python -c / bash -c (regression guard for the wrapper-commands case)
await test("matchConstraintPattern: python -c with import docker → docker (unchanged)", () => {
  const result = matchConstraintPattern(`python -c "import docker"`);
  assert.strictEqual(result, "docker");
});

await test("matchConstraintPattern: bash -c with docker run → docker (unchanged)", () => {
  const result = matchConstraintPattern(`bash -c "docker run ubuntu"`);
  assert.strictEqual(result, "docker");
});
```

Plus a guard test in `__tests__/gate-promoted-rules.test.js` (G8-style) that locks in the `stripNodeEvalBody` post-condition: a `node -e` command whose body contains a trigger phrase does NOT escalate.

#### Plan 2 acceptance criteria

- 4 new tests pass; all 38 existing `gate-logic-quoted-strings.test.js` tests still pass.
- 840+ tests pass; 0 regressions.
- The new finding `meta-...-node-e-bypass-risk-...` is filed documenting the `node -e "import vnstock_data"` regression.
- The change-log entry for Plan 2 explicitly references Plan 1's recurrence tracker as the catch-net for the bypass risk.

## Implementation Considerations and Risks

### Plan 1 risks

| Risk | Mitigation |
|---|---|
| Stderr noise on every gate call (even ok) | Only write stderr for block/escalate; stdout for ok (current behavior). |
| `.gate-decision.log` grows unbounded | Add rotation: keep last 1000 lines / 1MB, move to `.gate-decision.log.1` on overflow. Rotation happens on read, not write, to avoid mid-write races. |
| `gate_override` could be abused (operator overrides a real rule) | Marker is TTL'd (default 1h, max 24h). Override is logged to `runtime-state.jsonl`. Override requires `operator_note` (non-empty) so the audit trail is explainable. |
| Recurrence tracker false positives (3 unrelated commands happen to share a prefix) | `command_prefix_normalized` is conservative (50 chars, quotes removed, whitespace collapsed). Threshold defaults to 3 in 10min — tunable. Dedup by `command_prefix_normalized` against existing findings. |
| Cross-surface inconsistency (`.factory/` vs `.claude/`) | Decision log is written to both. Override marker is written to both. `gate_check_recurrence` reads from both, dedups. |
| Plan 1 is big (4 components, new tool, new file) | Phased ship: Phase 0 = stderr visibility (the smallest piece, ships first). Phase 1 = override marker + tool. Phase 2 = decision log. Phase 3 = recurrence tracker. Each phase is independently testable. |

### Plan 2 risks

| Risk | Mitigation |
|---|---|
| Bypass: `node -e "import vnstock_data"` no longer matches `side-effect-import` | Documented in change-log + new finding. Plan 1's recurrence tracker catches it if it recurs. The `node -e` pattern is rare in real agent flows (agents use `node script.js`, not `node -e`). |
| `stripNodeEvalBody` interferes with the existing `splitSegments` quote-aware logic | Tested in isolation; doesn't touch the segment splitter, only post-stripMessageFlags. |
| Inconsistent treatment of `node -e` vs `python -c` | Asymmetric by design (user-stated). The 4 regression tests make the asymmetry explicit. |
| Plan 2 is "too narrow" — should handle `python -c` too | User-stated: "we don't expect to solve it right away". The recurrence tracker is the catch-net. |

### Cross-plan risks

- Plan 2 ships first; Plan 1 ships second. If Plan 1's recurrence tracker doesn't catch the `node -e` bypass in time, the bypass persists. Mitigation: Plan 2's change-log + new finding make the bypass risk visible; the operator sees it in `meta_state_list` and can manually promote a rule or fix the regex.
- Both plans add to the meta-surface. Plan 1 adds 2 new MCP tools; Plan 2 adds 1 new function. Total: 3 new entries in the `agent-manifest.json` + `manifest.json`. Worth it for the debate-friendly surface.

## Success Metrics and Validation Criteria

### Plan 1 success metrics

- **Operator visibility**: 100% of gate blocks surface the decision JSON to the agent via stderr (verify with a test that captures stderr and asserts JSON presence).
- **Override adoption**: when an agent encounters a known false-positive and calls `gate_override`, the override is in `runtime-state.jsonl` and the gate skips the rule (verify with end-to-end test).
- **Recurrence catch rate**: in a 1-week test window, any false-positive pattern that recurs ≥3 times in 10min auto-files a finding (verify with a fixture-based test that simulates 3 decisions in 10min and asserts the finding is emitted).
- **No security regression**: the existing gate tests (`gate-promoted-rules.test.js`, `gate-logic-quoted-strings.test.js`, `gate-scope-predicate.test.js`, `gate-resolution-evidence.test.js`) all pass unchanged.

### Plan 2 success metrics

- **4 new regression tests pass**.
- **All existing 38 `gate-logic-quoted-strings.test.js` tests pass unchanged** — proves no regression in `bash -c` / `python -c` wrapper handling.
- **The new finding for the bypass risk is filed** — proves the loop's self-model captures the trade-off.
- **840+ tests pass; 0 regressions** — proves the change is contained.

## Next Steps and Dependencies

### Order of operations

1. **This report** (now): design locked in.
2. **Plan 1** (the foundation): ships the 4 components in phases. Should ship BEFORE Plan 2 to catch the bypass risk automatically, but the order is not strict (both plans are independent; the question is which is more useful to ship first).
3. **Plan 2** (the narrow first pass): ships the `stripNodeEvalBody` function + 4 tests + change-log + new finding. The bypass risk is documented and observable.

### Recommended sequencing

Ship **Plan 1 Phase 0 (stderr visibility) + Plan 2** in the same release. Reasons:
- Both address the "agent can't see why" problem from the finding.
- Plan 1 Phase 0 is the smallest possible piece of Plan 1; it can ship as a 1-day fix.
- Plan 2 is independent and ships in parallel.
- Plan 1 Phases 1-3 (override, log, recurrence) ship in a follow-up release.

### Dependencies

- **Plan 1 Phase 0** depends on: nothing (smallest possible change).
- **Plan 1 Phase 1** depends on: `runtime_state_record` MCP tool (already exists), `readRuntimeObservations` (already exists).
- **Plan 1 Phase 2** depends on: nothing (write-temp-then-rename is a stdlib pattern).
- **Plan 1 Phase 3** depends on: Plan 1 Phase 2 (decision log must exist for the tracker to read).
- **Plan 2** depends on: nothing (the `stripNodeEvalBody` function is self-contained).

### What does NOT change

- `core/patterns.json#message_flags` — no new flag added (the `node -e` strip is code-side, not pattern-side).
- The G8 regex (the `rule-no-new-artifact-types` pattern) — no change. The false positive is fixed by stripping the body, not by refining the regex.
- The side-effect-import pattern — no change. The `node -e "import vnstock_data"` regression is documented + observable; the regex is still correct for the top-level case.
- The 4 promoted rules in `meta-state.jsonl` — no change.
- The bash gate entry point (`bash-gate.js`'s `main()` flow) — only the `console.log` site changes; the decision logic is unchanged.

### What the operator should expect to see after both plans ship

- An agent that hits a gate block now sees a JSON decision on stderr, not a generic error.
- The operator can call `gate_override` from the agent's session to bypass a known false-positive for 1 hour, with audit trail in `runtime-state.jsonl`.
- Every gate decision is logged; recurring false-positive patterns auto-file findings; the loop's self-model grows.
- `node -e "console.log('create a new schema')"` no longer matches `rule-no-new-artifact-types`. The bypass risk (`node -e "import vnstock_data"`) is documented in meta-state and caught by the recurrence tracker if it recurs.

### What stays human forever (per AGENTS.md §10)

The override marker is operator-controlled. The recurrence tracker emits findings, not fixes. The `stripNodeEvalBody` heuristic is human-authored. The agent/operator remains the authority on what the gate is allowed to enforce. Both plans respect this boundary: the loop can observe, the loop can suggest, the human decides.

---

**Status:** draft. Ready for `/ck:plan` (Plan 1) and `/ck:plan` (Plan 2) when the operator calls them. Per operator decision 2026-06-15, no plan is launched automatically from this report.
