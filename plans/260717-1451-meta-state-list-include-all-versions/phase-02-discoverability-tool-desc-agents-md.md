---
phase: 2
title: "Discoverability — tool description + AGENTS.md audit recipe"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
shipped_at: "2026-07-17"
shipped_by: "ak:cook --auto"
---

# Phase 2: Discoverability — tool description + AGENTS.md audit recipe

## Overview

Ship the operator-facing discoverability layer for the new `include_all_versions` flag: the tool description must call out the affordance, and AGENTS.md §6 must document the audit-trail recipe so a future agent doesn't fall back to `grep meta-state.jsonl | jq`.

## Requirements

- **Functional:** the `meta_state_list` tool description (the `description:` field in `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js`) explicitly mentions `include_all_versions` as the way to inspect the versioned-append history per id. AGENTS.md §6 (Internalization Rule) gains a sibling or appended subsection that documents the recipe `meta_state_list({ id, include_all_versions: true })`. The wording distinguishes it from the status-filter affordance (`include_archived: true`).
- **Non-functional:** discoverability layer does not introduce new public contracts — only refines existing prose. Schema is unchanged from Phase 1.

## Architecture

The two surfaces that operators consult when looking up "how do I inspect the resolved version of an entry":

- **MCP tool description** (read by the model at session start + on demand): the prose under the `description:` key of `meta-state-list-tool.js`. This is the high-value surface because it's where model-side reasoning happens.
- **AGENTS.md / CLAUDE.md** (read by the operator when designing a plan): the human-side recipe book. AGENTS.md §6 (Internalization Rule) is the natural home for an audit-trail recipe because it's the sibling of the citation rule. Adding a §6.x subsection keeps the section structure flat.

**Wording constraint:** never describe `include_all_versions` as a way to inspect "terminal entries" — that's `include_archived`'s job. Describe it as the way to inspect the **versioned-append history** per id (i.e., the full sequence of v0, v1, v2, … lines that share an id).

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` — extend the `description:` prose (Phase 1 added the schema field; Phase 2 adds the discoverable description).
- Modify: `AGENTS.md` — append §6.1 (or numbered sibling) with the audit-trail recipe.
- Modify: `CLAUDE.md` — append the recipe to the quick-reference list (parallel to the existing MCP server / hooks / preflight lines).

## Implementation Steps

1. **Extend tool description.** Replace the current `description:` field in `meta-state-list-tool.js` (line 58) with a version that:
   - Preserves the existing tight summary of the public contract.
   - Adds one sentence: `Pass include_all_versions: true to inspect the versioned-append history per id (the v0 open + v1 resolved + … sequence on disk); without it, the projection collapses to one entry per id (max_by(version)).`
   - Adds a second clarifying sentence: `include_all_versions is orthogonal to include_archived (status filter) and compact (projection shape); the three compose.`
   - Keep total length under ~1.2KB (current is ~1KB; don't bloat model-side context).
2. **Append AGENTS.md §6.x audit recipe.** Find §6 (Internalization Rule); add a new subsection titled "Audit-trail recipe (versioned-append history)" with:
   - The exact call: `meta_state_list({ id: "<id>", include_all_versions: true })`.
   - When to use: after `meta_state_resolve` if you need the full v1 entry (the v_max), or when debugging a merge conflict / forensic question about what an entry looked like at version N.
   - When NOT to use: for "show me all resolved findings" — that's `meta_state_list({ status: "resolved" })` or `meta_state_list({ include_archived: true })`.
   - One-link citation to the source finding `meta-260717T0943Z-...` so future maintainers find this plan.
3. **Update CLAUDE.md quick reference.** Append a line under the existing quick-reference section parallel to "Records: all `records/**` writes go through MCP tools..." — the new line: `Audit trail (versioned-append history per id): meta_state_list({ id, include_all_versions: true }) — bypasses the max_by(version) projection. See AGENTS.md §6.1.`
4. **Grep for stale language.** Search `AGENTS.md`, `CLAUDE.md`, `tools/learning-loop-mastra/README.md`, and `docs/` for any prose that says "to inspect resolved entries use `meta_state_list({include_archived: true})`" and ADDITIONALLY mention `include_all_versions` as the versioned-append alternative. If found, update with the parallel citation.
5. **Verify the `meta_state_list` MCP manifest entry still matches.** Run `tools/scripts/manifest-arithmetic.check.mjs` (or equivalent) to confirm the updated tool description doesn't break the manifest count.

## Success Criteria

- [x] Tool description mentions `include_all_versions` with the "versioned-append history" framing.
- [x] AGENTS.md §6.x subsection exists with the recipe + when-to-use / when-NOT-to-use guidance.
- [x] CLAUDE.md quick-reference line for the new affordance.
- [x] No new public contracts (schema unchanged).
- [x] No stale prose suggesting "use `grep meta-state.jsonl`" without the MCP alternative.

## Risk Assessment

- **P2 — Tool description bloat.** Adding 2 sentences brings the description from ~1KB to ~1.2KB; model-side context cost is minor but not zero. Mitigation: trim adjectives; keep to one sentence per affordance.
- **P2 — AGENTS.md §6 becomes long.** Internalization Rule is currently ~10 lines; adding 8 lines of audit recipe brings the section to ~20 lines. Acceptable. If it grows further, consider §6.1 as a separate subfile.
- **P3 — Search & replace loop misses a doc file.** Mitigation: implement step 4 with a definitive grep that searches for the literal phrase "include_archived" inside markdown files (the prose, not test fixtures).
- **P3 — Future agents skip AGENTS.md and grep the registry directly.** This is a stochastic-failure mode the docs can't fully prevent, but the discoverable description reduces probability by surfacing the affordance at session start.