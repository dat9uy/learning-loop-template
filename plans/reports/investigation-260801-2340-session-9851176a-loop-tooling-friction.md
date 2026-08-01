# Session Autopsy — 9851176a: loop-tooling friction

**Source:** `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/9851176a-0eec-4c8b-ab34-3db6c1c17177.jsonl` (484 lines)
**Task in session:** fix finding `meta-260801T1549Z` (bash-gate false positive), resolve it in the loop.
**Verdict:** the code fix itself was clean and fast. ~50 transcript lines (≈ lines 283–414) were spent *wrestling the loop's own tooling* — exactly the anti-pattern already recorded in finding `meta-260704T0959Z` ("orchestrator read the full 326-line source of a tool").

## Episode 1 — CLI schema: gate-safe arg passing required reading `loop.mjs` source (lines 296–347)

1. Agent's `meta_state_resolve` call was **escalated by the bash gate itself**: the resolution prose contained literal banned tokens (`pnpm test | grep`) inside the JSON argv, and no strip function blanks arbitrary command arguments (296).
2. To avoid re-tripping the gate, agent wrote the args to a file, then needed to know whether `loop.mjs` accepts file/stdin args. It ran usage (323), grepped the source (327), and **read 45 lines of `bin/loop.mjs`** (332) to learn: args come strictly from `process.argv[3]`.
3. Workaround: build args into a shell var from the file. First attempt failed (`invalid JSON`, env-assignment ordering, 343), retry succeeded (346).

**Friction:** 8 tool calls + 1 source read to discover "no stdin/@file support" and hand-roll an env-var injection.

### Proposal 1a — add `--args-file <path>` (or `@file`) to `loop.mjs`
One line of docs would then replace the whole episode: *"if your tool args contain gate-banned prose, write args to a file and run `loop.mjs <tool> --args-file <path>`."* This is real behavior, not a workaround: argv-borne JSON will always be gate-visible; a file path is not.

### Proposal 1b — publish the escape hatch in the session-start surface
The warm hint / CLAUDE.md quick-reference already lists arg sketches. Add one line: "Gate-blocked args? `loop.mjs <tool> --args-file tmp.json`". Agent should never need `grep loop.mjs` to learn the transport contract.

## Episode 2 — fingerprint-drift rejection gave no recovery hint (lines 347–361)

Resolve was rejected: `{"resolved":false,"reason":"resolution_evidence_required","rule_id":"rule-no-orphaned-evidence","orphans":[...]}` (347). The payload names the orphan and its expected/actual hash, but **not what to do about it**. The agent had to infer the causal chain on its own:

> edit gate-logic.js → fingerprint drift → refresh file index (`meta_state_refresh_file_index`, 350) → re-verify the orphaned finding (`meta_state_re_verify`, 354) → retry resolve (360).

It inferred correctly — but only because this agent already knew hint #4/#9 lore (`derive-refresh`, `file-edit-drift`). A cold agent would have read `core/gate-logic.js` guard code to figure it out.

### Proposal 2 — machine-readable `recovery` field in structured rejections
Every exit-1 rejection that has a known remediation should carry it:

```json
{
  "resolved": false,
  "reason": "resolution_evidence_required",
  "orphans": [{"id": "...", "evidence_code_ref": "tools/.../gate-logic.js"}],
  "recovery": [
    {"tool": "meta_state_refresh_file_index", "args": {"path": "tools/.../gate-logic.js"}, "why": "cited fingerprint drifted"},
    {"tool": "meta_state_re_verify", "args": {"id": "..."}, "why": "re-ground orphan before resolving"}
  ]
}
```

The gate already computes everything needed (rule_id, orphan id, code ref path). Emitting the remedy is cheap and keeps the *why* in the error, not in tribal hints. Applies equally to the `stale-read` class below.

## Episode 3 — version/projection confusion drove raw-registry grepping (lines 365–414, ~20 tool calls)

The worst episode. After resolving A, the agent tried to verify the cascade-resolved sibling and hit a maze:

1. `meta_state_list {id, compact:false}` → **0 entries** (377) while `{include_all_versions:true}` → 1 entry "v0 open" (369). Agent hypothesized archiving; actually the default projection **excludes resolved rows differently than expected** and the compact projection silently strips fields, yielding screens full of `undefined` (366, 374, 397).
2. `meta_state_list {id}` on A returned "v0 open" **after** the resolve had already appended v1-resolved (401 vs 405) — a stale projection-cache read. Agent concluded (correctly) the cache hadn't caught up, but only after grepping `meta-state.jsonl` raw (381, 388, 404, 409) — direct file reads the loop's own hint #9 (`canonical-tool`) says to avoid.
3. Only from raw lines could it reconstruct: sibling has two lifecycle cycles, and A's resolve **had already cascade-resolved the sibling at the same timestamp** (414). The answer was in the system; the tools didn't surface it.

**Friction:** ~20 calls, 4 raw greps of `meta-state.jsonl`, and a near-miss where the agent almost issued a redundant manual resolve of an already-resolved record.

### Proposal 3a — make `meta_state_list` projection freshness explicit
If the read path can serve a pre-append projection, add `"projection_as_of": "<ts|sha>"` to output, or invalidate on append. An agent told "v0 open" 30s after writing v1 will (correctly per its evidence) attempt a workaround — the tool created the workaround pressure it later warns against.

### Proposal 3b — `compact` must never silently strip requested fields
`compact:false` returning `{}`/undefined fields for an id-filtered query is a bug-class behavior. For `{id:[...]}` queries, default to full fields; or emit a `"fields_omitted": [...]` notice. Screens of `undefined` are what pushed the agent to bypass the tool and grep the file.

### Proposal 3c — surface cascade effects in the resolve response
`meta_state_resolve` returned `{"resolved":true,...}` but not `"cascade_resolved":["meta-260716T2220Z-..."]`. One extra field would have ended Episode 3 at line 361.

### Proposal 3d — steering hint (cheap, do regardless)
Add to warm hints / CLAUDE.md: *"`meta_state_list` default = live latest-version projection. `include_all_versions` is audit-only — never use history as a workaround for a fresh write. If a just-written record reads stale, re-query once; do not grep meta-state.jsonl."* (Extends existing hints `session-id-query`, `status-lifecycle`, `canonical-tool`.)

## Bonus — the gate escalated a loop-tool call (296)

`node loop.mjs meta_state_resolve '{...pnpm test | grep...}'` matched `rule-no-raw-stdout-vitest`. The gate can't know JSON argv is prose, not a pipeline. This is a *known* out-of-scope false-positive family (agent noted it). Worth a finding: either teach the gate that `loop.mjs` argv is data (extend the data-command strip list to include the loop CLI), or make `--args-file` (1a) the documented path so the family stops mattering.

## Priority

| # | Change | Effort | Friction removed |
|---|--------|--------|------------------|
| 3a | projection freshness marker/invalidation | small | kills stale-read workarounds (the worst episode) |
| 2  | `recovery` field in rejections | small–med | removes need to read gate source / know hint lore |
| 1a | `--args-file` in loop.mjs | small | removes source-read + env-var hack |
| 3c | `cascade_resolved` in resolve response | trivial | ends cascade-guessing |
| 3b | compact field-omission notice | small | ends undefined-field confusion |
| 1b/3d | steering-hint lines | trivial | helps cold agents before any code ships |

Target invariant restated: **an agent should be able to complete the full finding lifecycle (fix → refresh → re-verify → resolve → confirm cascade) using only tool output and session-start hints — zero reads of `bin/loop.mjs`, `core/gate-logic.js`, or `meta-state.jsonl`.**

## Unresolved questions

- Is the stale `meta_state_list` read at line 401 a reproducible cache bug (cold-tier SHA check missing the append) or expected eventual consistency? Needs a repro test before choosing 3a's fix shape.
- Should the bash gate treat `loop.mjs` argv as data (new strip entry) or is `--args-file` the intended answer? Product-intent call.
