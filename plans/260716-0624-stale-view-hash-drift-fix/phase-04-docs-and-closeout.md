---
phase: 4
title: "Docs + change-log + meta-state closeout"
status: pending
priority: P3
dependencies: [1, 2, 3]
---

# Phase 04: Docs + change-log + meta-state closeout

<!-- RT: M12 — PR body MUST use six `## X entries` sections (swept/resolved/new/promoted/superseded/archived) per meta-state-pr-body-advisory.yml:71-78 -->
<!-- RT: M17 — parity grep across LOCAL copies (e.g., .factory/hooks/loop-surface-inject.cjs) for canonical doc updates -->
<!-- RT: M19 — do NOT hand-craft change-log id; meta_state_log_change auto-generates the canonical id -->
<!-- RT: F1 (Assumption folded) — corrected return-shape wording in success criteria: meta_state_check_grounding (not query_drift) returns per-entry `status: "grounded"` -->

## Overview
Document the corrected stale-view contract in `docs/meta-state-lifecycle.md`, file a `meta_state_log_change` entry capturing the design shift (auto-generated id), and resolve the `meta-260716T0603Z-…` finding via `meta_state_resolve`. PR body must use the 6-section format mandated by the CI advisory. No code changes; pure registry hygiene + doc edit.

## Requirements

### Functional — docs
- `docs/meta-state-lifecycle.md` § Stale-view (derived evidence-freshness view) updates:
  - Replace the path-presence description with the hash-comparison contract.
  - Document the `computeCurrentHashes` helper return shape (`{ ok, skipped }`).
  - Document `meta_state_re_verify` opt-in clear behavior (`refresh: true`).
  - Cross-check `.factory/hooks/loop-surface-inject.cjs` and any other LOCAL copies for stale descriptions. (RT: M17)
- `core/stale-view.js` docstring updates:
  - `hasDrifted` docstring reflects hash comparison + caller-injected `codeHashes` + regex-validated fallback chain.
  - `isStaleView` docstring notes the new `opts.codeHashes` argument.
  - `computeCurrentHashes` JSDoc covers `{ ok, skipped }` return shape; documents resolveSafePath routing.

### Functional — change-log (RT: M19)
- One `meta_state_log_change` call (do NOT pass an `id` — id is auto-generated):
  - `change_dimension: semantic`
  - `change_target: core/stale-view.js`
  - `change_diff.added: ["computeCurrentHashes helper", "meta_state_re_verify refresh:true opt-in", "Phase 7 drift-stale cap"]`
  - `change_diff.changed: ["hasDrifted from path-presence to hash-comparison with SP2 regex defense"]`
  - `change_diff.removed: ["hasDrifted path-presence-only predicate"]`
  - `reason`: ≥20 chars explaining the SP2-consistency fix and the regression-cap removal
  - `applies_to.tools`: ["meta_state_sweep", "meta_state_relationship_validate", "meta_state_relationships", "meta_state_re_verify"]
  - `evidence_code_ref`: `tools/learning-loop-mastra/core/stale-view.js:55`

### Functional — meta-state resolve (RT: F1)
- `meta_state_resolve({ id: "meta-260716T0603Z-hasdrifted-in-core-stale-view-js-is-path-keyed-only-it-retur", resolution: "Hash-aware hasDrifted shipped (plan 260716-0624). SP2-consistent predicate. Phase 7 drift-stale cap added as separate forcing function. meta_state_re_verify refresh is now opt-in via refresh:true." })`
- **Pre-resolve consult-gate check:** call `meta_state_check_grounding({id})` first and confirm `status: "grounded"`. (RT: F1 — corrected return shape: it's `check_grounding` that returns per-entry `status`, not `query_drift`.)

### Functional — PR body (RT: M12)
- The PR body MUST include six `## X entries` sections (the regex at `meta-state-pr-body-advisory.yml:71-78` matches these):
  ```
  ## Swept entries
  ## Resolved entries
  ## New entries
  ## Promoted entries
  ## Superseded entries
  ## Archived entries
  ```
- Empty sections are valid (the CI advisory emits warnings, not errors). The plan only modifies the registry via `log_change` and `resolve`, so most sections are empty; that is fine.
- Each non-empty section lists `| id | reason |` rows. For this plan:
  - `Resolved entries`: 1 row (the meta finding, see below).
  - All other sections: empty.

## Architecture

### PR body template (RT: M12)

```markdown
## Stale-view hash-drift fix (plan 260716-0624)

[PR summary]

## Swept entries
(empty — meta_state_sweep is read-only post-260707-0812 Phase 3)

## Resolved entries
| id | reason |
|---|---|
| meta-260716T0603Z-hasdrifted-in-core-stale-view-js-is-path-keyed-only-it-retur | Hash-aware hasDrifted shipped (plan 260716-0624). SP2-consistent predicate with TERMINAL_HASH_REGEX defense. Phase 7 drift-stale cap added as separate forcing function. meta_state_re_verify refresh is opt-in via refresh:true; CAS-ordering preserves consistency. Path-containment routing via resolveSafePath. |

## New entries
(empty — no new findings filed in this PR)

## Promoted entries
(empty — no new rules)

## Superseded entries
(empty)

## Archived entries
(empty)

## Rollback plan (RT: M18)
[See Phase 03 § Rollback Path — Steps A and B are independent, Phase 1+2 stays in place.]

## Tests
- `pnpm test` green
- `pnpm test:iter` is INCOMPATIBLE with the cold-tier drift-cap (skips seed step)

## Consult-gate evidence
Pre-resolve `meta_state_check_grounding({id})` reports `status: "grounded"`; rule-no-orphaned-evidence is satisfied.
```

## Related Code Files
- Modify: `docs/meta-state-lifecycle.md` (stale-view section)
- Modify: `tools/learning-loop-mastra/core/stale-view.js` (JSDoc update — already touched in Phase 01; refine wording)
- Grep + update LOCAL copies of stale-view predicate descriptions: (RT: M17)
  - `.factory/hooks/loop-surface-inject.cjs`
  - `.claude/skills/**/SKILL.md` (any that re-document the predicate)
  - `docs/` related docs (already covered by `docs/meta-state-lifecycle.md` above)
- Mutate registry: `meta-state.jsonl` via `meta_state_log_change` + `meta_state_resolve` MCP tools

## Implementation Steps

### Step 4.1 — Update stale-view docstring
Re-edit `tools/learning-loop-mastra/core/stale-view.js` JSDoc for `hasDrifted`, `isStaleView`, and `computeCurrentHashes` to reflect the new contract. JSDoc should explicitly note:
- `hasDrifted` — hash-comparison with `TERMINAL_HASH_REGEX` chain (cites `check-grounding.js:201-208`)
- `isStaleView` — `opts = { now?, fileIndex?, codeHashes? }`; missing `codeHashes` → age-only
- `computeCurrentHashes` — returns `{ ok: Map<canonicalKey, currentHash>, skipped: Array<{canonical, reason}> }`; routes through `resolveSafePath`; rejects traversal/symlink/hardlink

### Step 4.2 — Update docs/meta-state-lifecycle.md
Find the "Stale-view (derived evidence-freshness view)" section. Replace the path-presence description with:
- `isStaleView = isOpen && (ageStale || hashDrifted)`
- `hashDrifted = currentHash !== storedHash` where `currentHash = codeHashes.get(canonical)` and `storedHash = indexBaseline ?? entry.code_fingerprint` (both regex-validated via `TERMINAL_HASH_REGEX`)
- Caller injects `codeHashes` via `computeCurrentHashes(entries, root)` which returns `{ ok, skipped }`. The `skipped` array captures traversal violations and permission errors; callers gate-log non-`"missing"` entries.
- `meta_state_re_verify` clears the drift signal ONLY when called with `refresh: true` AND verification passes AND CAS update succeeds. Operators who want explicit operator-mediated refresh should use `meta_state_refresh_file_index` instead.

### Step 4.3 — Parity grep across LOCAL copies (RT: M17)
Run before declaring Phase 4 done:
```bash
grep -rln "hasDrifted\|isStaleView\|fileIndex.has.*canonicalIndexKey" --include="*.cjs" --include="*.js" --include="*.md" .claude/ .factory/ docs/ tools/ 2>/dev/null | xargs -I{} echo {}
```
For each file found, verify the description is consistent with the new contract. Update if stale.

### Step 4.4 — File the change-log entry (RT: M19)
Invoke `meta_state_log_change` per the Architecture block. Do NOT pass `id` — let the tool auto-generate from `change_target`. Capture the returned entry id for the PR body.

### Step 4.5 — Run consult-gate check (RT: F1)
Call `meta_state_check_grounding({id: "meta-260716T0603Z-…", run_tests: false})` and verify `status: "grounded"`. If `drifted`, stop and investigate — the resolve will be blocked by `rule-no-orphaned-evidence`.

### Step 4.6 — Resolve the meta-state finding (RT: F1)
Invoke `meta_state_resolve` with the long resolution note. Capture `resolved_at` / `version` for the PR body.

### Step 4.7 — Run whole-plan consistency sweep
Re-read `plan.md` and all 4 phase files. Verify:
- No stale terms ("path-presence", "path-keyed-only") remain in current-state descriptions.
- All file paths match the codebase.
- All API signatures match Phase 01/02/03 implementation.
- No duplicate contracts.
- Six PR body sections are present and one row resolves the meta finding.

### Step 4.8 — Journal (separate file)
Run the `ck:journal` skill (or write a manual entry under `plans/260716-0624-stale-view-hash-drift-fix/reports/journal.md`) summarizing:
- What shipped (4 phases, ~10 files modified)
- What was found vs expected (the 0c8f670 workaround removed; cap restructured into age+drift; re_verify opt-in)
- Red-team findings count and disposition (15 accepted, 0 rejected)
- Open follow-ups (sweep/re_verify TOCTOU mitigation deferred; derive-status drift-blindness explicit)

## Success Criteria

- [ ] `docs/meta-state-lifecycle.md` describes the hash-aware contract.
- [ ] `core/stale-view.js` JSDoc reflects new contract for `hasDrifted`, `isStaleView`, `computeCurrentHashes`.
- [ ] Parity grep across `.factory/` and `.claude/` shows consistent descriptions. (RT: M17)
- [ ] One `meta_state_log_change` entry exists in the registry with auto-generated id (NOT hand-crafted). (RT: M19)
- [ ] `meta-260716T0603Z-…` is `resolved` with verified `meta_state_check_grounding` returning `grounded` pre-resolve. (RT: F1)
- [ ] PR body includes six `## X entries` sections per `meta-state-pr-body-advisory.yml:71-78`. (RT: M12)
- [ ] `meta_state_sweep` post-fix returns `stale_view_count` matching the cap precompute + 2 (no overshoot in CI).
- [ ] Journal entry written to `plans/260716-0624-stale-view-hash-drift-fix/reports/journal.md`.

## Risk Assessment

- **Doc rot:** if the docs are not updated, future readers will misunderstand the predicate. **Mitigation:** Phase 4 is gated on Phases 1-3 being green; the docs describe the shipped behavior.
- **Change-log entry schema validation:** `change_diff` is strict `{added, removed, changed}` (per plan 260710-0104 closeout lesson). Use the exact shape; do not add unknown keys.
- **`meta_state_resolve` consult-gate (RT: F1):** `rule-no-orphaned-evidence` checks that the resolving entry's cited file is grounded. After Phase 3's re_verify refresh (or explicit `meta_state_refresh_file_index`), the file's hash matches the index baseline → consult-gate passes. **Verify before resolving** by calling `meta_state_check_grounding({id})` and confirming `status: "grounded"`.
- **PR body advisory (RT: M12):** the CI advisory `meta-state-pr-body-advisory.yml:71-78` parses for `## X entries` headings (case-sensitive). Empty sections are valid; the advisory emits warnings, not errors. Format mismatches are surfaced in the Checks tab as informational.
- **Idempotent resolve:** `meta_state_resolve` is idempotent on re-call (returns `already_terminal` if previously resolved). Safe to retry.
