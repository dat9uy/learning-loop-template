# Red-team review: Plan 260707-0812 (lifecycle status + stale mechanism)

**Date:** 2026-07-07
**Plan:** `plans/260707-0812-lifecycle-status-stale-mechanism/`
**Reviewer:** adversarial code-reviewer (single focused pass; 3 risk dimensions)
**Verdict:** DONE_WITH_CONCERNS — 3 Critical, 5 High, 3 Medium, 4 Low. Dimension 3 (scope boundary with Plan 2) clean. Dimensions 1 (read-site completeness) + 2 (migration safety) FAIL. All findings applied to the plan.

## Findings + dispositions

### Critical

| # | Finding | Disposition | Applied to |
|---|---|---|---|
| C1 | Migration count catastrophically miscounted: "178 active" is registry-wide, not findings-only. Findings-only: 10 active + 12 stale = **22 flips**, not 190. Flipping 168 change-logs/rules/loop-designs to `open` would silently corrupt them (`metaStateBatch` does `Object.assign` with no post-patch validation; change-log `status` is `z.literal("active")` immutable audit log). The 0958 report's "177 active findings" was a registry-wide count misattributed to findings. **Verified independently:** findings-only counts = active 10 / archived 20 / resolved 8 / stale 12 / superseded 1 (51 findings); 153 change-log active + 9 rule active + 6 loop-design active stay. | Accept | plan.md (decisions, acceptance, risks); phase 4 (migration = 22 finding flips scoped by `entry_kind:"finding"`; acceptance `meta_state_list({entry_kind:"finding", status:"active\|stale"})` returns nothing; non-finding actives stay) |
| C2 | `meta_state_report` (the primary finding-creation tool) writes `status:"reported"` (`meta-state-report-tool.js:75,97`); `core/recurrence-tracker.js:119` writes `status:"reported"` via raw `appendFileSync` (bypasses `writeEntry` validation → silently appends invalid entries). Enum collapse breaks ALL new finding creation (`writeEntry` `safeParse` throws on `"reported"`). | Accept | phase 2 (rewrite both to `status:"open"`; route recurrence through `writeEntry`; add finding-creation tests); also remove `expires_at`/`acked_at` writes (see M1) |
| C3 | `meta_state_resolve` cascade child guard `meta-state-resolve-tool.js:212` `child.status !== "active" && !== "resolved"` rejects post-migration `"open"` children → cascade-close breaks. `:136` `status === "reported"` block deadlocks legacy parents after `ack` is dropped. | Accept | phase 2 (`:212` → isOpen-based + resolved; `:136` → drop the "reported" branch; update `:24` schema description) |

### High

| # | Finding | Disposition | Applied to |
|---|---|---|---|
| H1 | `meta_state_query_drift` input schema `z.enum(["active","reported"])` (`meta-state-query-drift-tool.js:22`) breaks post-collapse (callers can't filter by `open`; `"active"`/`"reported"` return empty after migration). | Accept | phase 2 (input enum → `["open"]` + accept legacy mapped via isOpen during transition) |
| H2 | `meta_state_archive` decision rule branches on `status === "reported"` + reads `acked_at` (`meta-state-archive-tool.js:37,39`). After `acked_at` removal, `!entry.acked_at` is always true → mass-archive of legacy reported entries >30d. | Accept | phase 2/4 (rewrite decision rule to isOpen + age; drop `acked_at` condition) |
| H3 | `meta_state_relationship_validate` `ORPHAN_STATUSES = Set(["stale"])` (`:9,47`) + `meta_state_relationships` stale/`auto-resolved` branches (`relationships-tool.js:98,102`) — orphan-stale validation silently no-ops post-collapse. | Accept | phase 2 (ORPHAN_STATUSES → derived from isStaleView or empty; relationships-tool stale branch → isStaleView or delete; drop dead `auto-resolved` branch) |
| H4 | 4 missed terminal/excludable Sets: `loop-introspect.js:316` CLOSED_STATUSES; `sweep-tool.js:12` TERMINAL_STATUSES (**includes `"stale"`** — would make the derived-stale report skip stale-view entries); `resolve-tool.js:14` TERMINAL_STATUSES; `list-tool.js:14` EXCLUDABLE_STATUSES. Plus the 3 the plan listed. = **7 Sets total.** | Accept | phase 2 (enumerate + update all 7 to `{resolved, superseded}` + archived runtime); phase 3 (remove `"stale"` from `sweep-tool.js:12`) |
| H5 | `cold-tier-regression.test.js:226` asserts `af.status === "reported" || "active"` — breaks post-migration (active_findings are `open`). Plan only addressed L72-77. | Accept | phase 2/4 (`:226` → `isOpen(af)`) |

### Medium

| # | Finding | Disposition | Applied to |
|---|---|---|---|
| M1 | `checkExpiry`/`expires_at`/TTL semantics incoherent. `expires_at` (24h TTL, set by report-tool, cleared by ack-tool) is a DIFFERENT clock from `last_verified_at`/`created_at` + 7d `STALENESS_WINDOW_MS`. The derived view uses age + drift, NOT `expires_at`. TTL doesn't "become" the derived predicate — it ceases to exist. | Accept | phase 2 (remove `expires_at`/`acked_at` writes from report-tool + recurrence-tracker); phase 4 (delete `checkExpiry`; declare `expires_at` vestigial — kept for legacy entries, not written). Drop the "TTL becomes derived predicate" claim. |
| M2 | `git restore` manual step has no automated guard (verified: zero grep hits in hooks/). If forgotten, the worktree commit carries hook-mutated registry rows → conflicts with the migration commit, violates single-writer, can corrupt lineage. | Accept | plan.md + phase 4 (add a verifiable gate: `git rm --cached meta-state.jsonl file-index.jsonl runtime-state.jsonl` on the worktree branch so they can't be committed, OR a pre-commit/fallow check that diffs registry files against main and fails on mutations) |
| M3 | The "missed read site degrades gracefully (treats legacy as open)" risk claim is FALSE for literal-equality sites post-migration. Grace holds only for legacy entries pre-migration; a post-migration `"open"` entry breaks any missed `=== "active"`/`"reported"` site (e.g. C3's resolve cascade). | Accept | plan.md risks (drop the graceful-degrade claim; state site enumeration must be complete; the cost of a missed literal-equality site is a broken production path post-migration, not graceful degradation) |

### Low (verified clean — no change)

| # | Finding |
|---|---|
| L1 | `auto-resolved` 0-entry claim verified (0 in registry). No-op stands. |
| L2 | `status` NOT in `IMMUTABLE_PATCH_FIELDS` (`meta-state.js:277-288`). Batch `op:"update"` can flip status. Atomicity + rollback (`:744-756`) sound — assuming the op list is correct (C1 fix). |
| L3 | OPERATOR_MODE scope boundary CLEAN. `sweep-tool:41` (removed); `supersede:17`/`dispatch:169`/`promote:20` (kept for Plan 2). Test OPERATOR_MODE lines for supersede/dispatch/promote correctly preserved. |
| L4 | `archived` runtime-applied (not in finding enum; 20 findings carry it via `archiveEntry`/batch `archive` op). Claim correct. |

## Dimension verdicts

- **D1 read-site completeness: FAIL** — 7+ missed sites (C2/C3/H1/H2/H3/H5 + 4 terminal Sets H4). The observation/rule/loop-design status branches (`gate-logic.js:272,577,745,747`, `entry/rule.js:12`, `evaluate-inbound-gate.js:71`, `loop-introspect.js:368`) are correctly out of scope (separate enums).
- **D2 migration safety: FAIL on C1** (count); otherwise partially sound (L2 atomicity; M2 git-restore guard; M1 TTL; M3 grace claim).
- **D3 scope boundary with Plan 2: CLEAN.**

## Net effect on the plan

- Migration: **22 finding flips** (not 190), scoped by `entry_kind:"finding"`.
- Phase 2 gains: 2 write sites (report, recurrence), 2 resolve-tool read sites, query-drift input enum, archive decision rule, 2 relationship-tool sites, all 7 terminal Sets, `cold-tier:226`, `expires_at`/`acked_at` write removal.
- Phase 3 gains: remove `"stale"` from `sweep-tool.js:12`.
- Phase 4 gains: 22-flip migration scoped by entry_kind; entry_kind-scoped acceptance; delete `checkExpiry`; `expires_at` vestigial; verifiable `git restore` gate.
- plan.md: corrected migration math + acceptance; dropped the graceful-degrade risk claim; added the git-restore gate.

Status: DONE — all 11 accepted findings applied to plan.md + phases 2/3/4.