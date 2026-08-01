---
phase: 2
title: "Sweep plan-ID lineage to invariant descriptions"
status: complete
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Sweep plan-ID lineage to invariant descriptions

## Overview
Hand-edit each of the 69 seeded instances to describe the invariant/role directly, removing plan-ID/phase-number lineage. Comment-only in spirit, but includes 8 YAML `summary:` data fields and 4 string literals. Not a mechanical find-replace — each rewrite requires reading the surrounding code to name the actual invariant. The Phase 1 test guards: no NEW match can land, and each rewrite removes a match so the allowlist is pruned as it goes.

## Requirements
- Functional: zero plan-ID/phase-number matches remain in the scan surface at phase end.
- Non-functional: no behavior change except the 3 documented string-literal text edits; `pnpm test` stays green after every batch; commits stay focused (comment/field-only).

## Architecture
Work in small batches by file (each file = one commit) so reversions are cheap and review is easy. After each file:
1. Run the Phase 1 test → the file's matches leave `currentMatches`; allowlist entries become stale (warned, non-failing).
2. Prune the stale entries from `stable-artifacts-no-plan-ids.allowlist.json`.
3. Commit file + allowlist prune together.

Rewrite guidance by type:
- **Comments:** replace "Phase N of plans/XXXX" with the invariant it pins. Examples (from the finding):
  - `// Phase 3 of plans/260707-0114-loop-skill-layer-prerequisite/plan.md.` → `// Bound-artifact registry: the trust root for which generated files the gate may touch.`
  - `// removed by migration in plan 260607-dual-field-schema-unification` → `// Legacy dual-field shape is no longer produced; the single canonical field is ...`
- **`placement.yaml` summaries:** describe the module's role; drop the trailing "Phase N of plans/..." clause. Keep the technical substance.
- **String literals (3 — contract-affecting, see Risk):** keep the mechanism label, drop the parenthetical plan id. e.g. `"Rec 10 dispatch protocol (plan 260704-0301...):\n"` → `"Rec 10 dispatch protocol:\n"`.

## Related Code Files
- Modify (comments, core/mastra): `core/{cli-self-match,surfaces,evaluate-write-gate,check-grounding,bound-artifacts,gate-logic,loop-introspect,workflow-registry,hint-registry,cli-context-savings,file-readers,runtime-state,schema-normalize,hint-renderer,path-containment,meta-state}.js`, `core/entry/relationship-graph.js`, `core/cli-stderr.js`, `mastra/create-loop-tool.js`.
- Modify (comments, handlers/scripts/hooks): `tools/handlers/{loop-describe,meta-state-promote-rule,meta-state-batch,meta-state-relationships,meta-state-dispatch-finding,trigger-workflow}-tool.js`, `tools/handlers/scripts/strip-code-fingerprint-field.mjs`, `scripts/validate-registry-refs.js`, `hooks/universal/session-start-inject-discoverability.cjs`.
- Modify (YAML data): `core/placement.yaml` (8 `summary:` fields).
- Modify (string literals, contract-affecting): `core/loop-introspect.js:237` & `:428`, `core/meta-state.js:2067`, `tools/handlers/trigger-workflow-tool.js:35`.
- Modify: `tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.allowlist.json` (prune per file).

## Implementation Steps (test-guarded)
1. **Order by risk:** string literals (4) first (contract-affecting → review early), then `placement.yaml` (8), then the ~57 comments grouped by file (core/mastra, then handlers/scripts/hooks).
2. **Per file:** read surrounding code; rewrite each matched line to the invariant; run `pnpm test` for the stable-artifacts test; prune the file's entries from the allowlist; commit (file + allowlist).
3. **Do not touch excluded matches:** the 5 test-file matches (`evaluate-write-gate.test.js:49/265`, `workflow-registry.test.js:5`, `__tests__/meta-state-g8-supersede.test.js:43`, `__tests__/meta-state-superseded.test.js:82`) and `core/README.md:75` are out of the scan glob; leave them (fixtures/docs).
4. **Do not introduce finding/loop-design codes** as substitutes (e.g. don't rewrite `// Phase 3 of plans/X` into `// see finding meta-...` — that just trades one violation for another outside this plan's scope). Describe the behavior.
5. **After the last file:** run the full `pnpm test`; the stable-artifacts test should show zero current matches and a fully-stale allowlist (every entry warned).

## Success Criteria
- [ ] Zero plan-ID/phase-number matches in the scan surface (`grep -rnE "plans?/[0-9]{6}-|Phase [0-9]+ of (plan|plans)|plan [0-9]{6}-[0-9]{4}" tools/learning-loop-mastra/` excluding `__tests__`/`.test.js`/`.md`/`.json` returns nothing).
- [ ] Allowlist sidecar is empty.
- [ ] `pnpm test` green; the 4 string-literal edits are the only behavior-visible change.
- [ ] Each commit is comment/field-only (no logic change) except the 4 string-literal commits, which are called out in commit messages.

## Risk Assessment
- **4 string-literal edits change emitted/displayed text (contract-affecting, validate-confirmed to sweep):**
  - `core/meta-state.js:2067` — the `reason` string on batch-emitted change-logs. New change-log entries get the new text; existing entries keep old text. Low blast radius (internal reason field, not a parsed contract). Call it out in the commit and in a change-log entry (`meta_state_log_change`, `change_target: core/meta-state.js`).
  - `core/loop-introspect.js:237` & `:428` — labels in `loop_describe` output. Removes a parenthetical plan id from a human-readable label. No parser depends on the parenthetical.
  - `tools/handlers/trigger-workflow-tool.js:35` — the `reasoning` template string returned when workflow recommendations are vacated. Remove the "per plans/260722-2147 phase 5" clause; keep "...recommendations vacated; see meta-state registry". Returned to the caller (agent-facing text), not a parsed contract.
- **Mechanical find-replace risk:** rewriting "Phase N of plans/X" without reading the code can produce a wrong invariant name. Mitigation: per-file hand-edit, not a sed sweep; the finding explicitly forbids mechanical replacement.
- **Allowlist drift during the sweep:** if a rewrite accidentally introduces a NEW plan id (e.g. references a different plan), the test fails immediately — that is the gate working. Fix and continue.