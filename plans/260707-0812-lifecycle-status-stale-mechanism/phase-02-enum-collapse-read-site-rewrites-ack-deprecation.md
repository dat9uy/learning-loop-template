---
phase: 2
title: "Enum collapse + read-site rewrites + ack deprecation"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Enum collapse + read-site rewrites + ack deprecation

## Overview

Collapse the finding status enum to `{open, resolved, superseded}` (+ `archived` runtime-applied) at the 3 schema sites; rewrite every status-branching read site in `core/` + the tool files to use `isOpen`/`isStaleView` (tolerating legacy entries); deprecate `meta_state_ack`. This is the atomic unit — enum + read/write sites + ack land together. `isOpen` tolerates the 10 finding `active` + 12 finding `stale` legacy entries as open (the 168 non-finding `active` entries have separate enums and are untouched), so the registry need not migrate in lockstep (migration is phase 4).

## Requirements

- Functional: 3 schema sites declare `{open, resolved, superseded}` for findings; `archived` runtime-applied (not in enum); `reported`/`active`/`stale`/`auto-resolved` removed. Every status-branching read site uses `isOpen`/`isStaleView`. `meta_state_ack` tool + `acked_at` field gone. `meta_state_list({status:"open"})` returns legacy `active`/`reported`/`stale` entries too (via `isOpen` in the filter) so consumers see a consistent open set pre-migration.
- Non-functional: no `status === "active" || "reported"` branch remains in `core/`. Terminal sets consistent (`TERMINAL_STATUSES` = `{resolved, superseded, archived}`; `auto-resolved` dropped).

## Architecture

The enum is declared in 3 places (research corrected the 0958 report's 4-site claim — project-root `docs/schemas.md` does not exist): `core/meta-state.js:91` (the finding status enum) + `:27` (`TERMINAL_STATUSES` Set); `schemas/meta-state.schema.json` (finding.status block); `tools/learning-loop-mastra/docs/schemas.md:39` (prose). Read sites fall into 3 groups: (a) 8 active|reported branches → `isOpen`; (b) `file-readers.js:46` active-only → `isOpen`; (c) stale-specific branches → `isStaleView`; plus terminal-set definitions + the `entry/finding.js` helpers. `meta_state_ack` removal: delete `tools/legacy/meta-state-ack-tool.js`, remove its manifest entry, remove `acked_at` from the schema + any read of it.

## Related Code Files

- Modify (schema sites): `tools/learning-loop-mastra/core/meta-state.js` (:27 `TERMINAL_STATUSES`, :91 finding enum, :773-774 `checkExpiry` stale/reported branches, :824 `existingActiveOrReported`); `schemas/meta-state.schema.json`; `tools/learning-loop-mastra/docs/schemas.md` (:39)
- Modify (read sites — active|reported → `isOpen`): `core/gate-logic.js:658,725`; `core/derive-status.js:120`; `core/query-drift.js:79`; `core/recurrence-tracker.js:92`; `core/loop-introspect.js:225,301`; `core/file-readers.js:46`
- Modify (stale-specific → `isStaleView`): `core/loop-introspect.js:199`; `core/derive-status.js:123`; `core/meta-state.js:773-774` (`checkExpiry` — stop writing stale; **TTL does NOT "become" the derived predicate — `expires_at` (24h) and `STALENESS_WINDOW_MS` (7d) are different clocks (red-team M1); `expires_at` becomes vestigial, removed in phase 4**)
- Modify (ALL 7 terminal/excludable Sets → `{resolved, superseded}` + archived runtime — red-team H4): `core/loop-introspect.js:165` (`TERMINAL_STATUSES_FOR_DISPATCH`) + `:316` (`CLOSED_STATUSES`); `core/derive-status.js:25` (`TERMINAL_RAW_STATUSES`); `core/meta-state.js:27` (`TERMINAL_STATUSES`); `tools/legacy/meta-state-sweep-tool.js:12` (`TERMINAL_STATUSES` — remove `"stale"` member, done in phase 3 when sweep reworks); `tools/legacy/meta-state-resolve-tool.js:14` (`TERMINAL_STATUSES`); `tools/legacy/meta-state-list-tool.js:14` (`EXCLUDABLE_STATUSES`)
- Modify (entry helpers): `core/entry/finding.js:11-12` (`isActive`→`isOpen`, `isStale`→`isStaleView`)
- Modify (WRITE sites — red-team C2): `tools/legacy/meta-state-report-tool.js:75,97` (write `status:"open"`, not `"reported"`; remove `expires_at` + `acked_at:null` writes); `core/recurrence-tracker.js:119` (write `status:"open"`; remove `expires_at` write; **route through `writeEntry`, not raw `appendFileSync` at :121** — raw append bypasses `safeParse` validation)
- Modify (tool-internal READ sites — red-team C3/H1/H2/H3): `tools/legacy/meta-state-resolve-tool.js:136` (drop the `status === "reported"` cascade block — ack is gone, legacy reported parents are `isOpen` and cascade-closeable) + `:212` (`child.status !== "active" && !== "resolved"` → `!isOpen(child) && child.status !== "resolved"`) + `:24` (schema description); `tools/legacy/meta-state-query-drift-tool.js:22` (input enum `z.enum(["active","reported"])` → accept `open` + legacy mapped via `isOpen`); `tools/legacy/meta-state-archive-tool.js:37,39` (decision rule → `isOpen` + age; drop `!entry.acked_at` condition — undefined→true would mass-archive legacy entries); `tools/legacy/meta-state-relationship-validate-tool.js:9,47` (`ORPHAN_STATUSES = Set(["stale"])` → derive from `isStaleView` or empty); `tools/legacy/meta-state-relationships-tool.js:98,102` (stale branch → `isStaleView` or delete; drop dead `auto-resolved` branch)
- Modify (test — red-team H5): `__tests__/legacy-mcp/cold-tier-regression.test.js:226` (`af.status === "reported" || "active"` → `isOpen(af)`)
- Delete: `tools/learning-loop-mastra/tools/legacy/meta-state-ack-tool.js`
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (remove `meta_state_ack`); `schemas/meta-state.schema.json` (remove `acked_at`); grep + remove any `acked_at` read (the archive-tool:39 one is above)
- Modify: `core/meta-state.js` `meta_state_list` status filter — `status:"open"` returns entries where `isOpen(e)` (includes legacy `active`/`reported`/`stale` until migrated); `status:"stale"`/`"active"`/`"reported"` still return legacy entries pre-migration (backward compat until phase 4)

## Implementation Steps (TDD — tests first)

1. **Write/extend read-site + write-site tests first.** For each of the 8 active|reported sites, add a test asserting it treats a legacy `active` AND a new `open` finding identically. For stale-specific sites, assert `isStaleView` drives the branch. **Add finding-creation tests (red-team C2):** `meta_state_report` + `recurrence-tracker` produce `status:"open"` entries that pass `writeEntry` `safeParse`. **Add cascade tests (C3):** `meta_state_resolve({id: parent, cascade_from: [child]})` succeeds for an `open` child. **Add a `cold-tier:226` test (H5):** `active_findings` entries satisfy `isOpen`.
2. **Collapse the enum** at the 3 schema sites: finding status = `["open","resolved","superseded"]`; `TERMINAL_STATUSES` = `Set(["resolved","superseded"])` (archived handled by `archiveEntry`); update `tools/learning-loop-mastra/docs/schemas.md:39` prose. Keep `archived` accepted by `archiveEntry` + the cold-tier terminalStatuses set (runtime-applied).
3. **Rewrite the 8 active|reported sites** to `isOpen(e)` (import from `core/stale-view.js`). Rewrite `file-readers.js:46` to `isOpen`. Rewrite the 3 stale-specific sites to `isStaleView`. Update **all 7 terminal/excludable Sets** to `{resolved, superseded}` (+archived runtime). Rework `entry/finding.js` helpers.
4. **Rewrite the WRITE sites (C2):** `meta-state-report-tool.js:75,97` → `status:"open"` (drop `expires_at` + `acked_at:null` writes); `recurrence-tracker.js:119` → `status:"open"` (drop `expires_at`) AND route through `writeEntry` (replace the raw `appendFileSync` at :121). Add a test that a recurrence-created finding validates.
5. **Rewrite the tool-internal READ sites (C3/H1/H2/H3):** resolve-tool `:136` (drop reported cascade block) + `:212` (`!isOpen(child) && !== "resolved"`); query-drift input enum accepts `open`; archive-tool `:37,39` decision rule (isOpen + age, drop `acked_at`); relationship-validate `ORPHAN_STATUSES` (isStaleView-derived or empty); relationships-tool `:98,102` (isStaleView / drop dead `auto-resolved`).
6. **Rework `meta_state_list`'s status filter** so `status:"open"` returns `isOpen(e)` entries (includes legacy `active`/`reported`/`stale` until migrated); `status:"stale"`/`"active"`/`"reported"` still return legacy entries pre-migration (backward compat until phase 4).
7. **Deprecate `meta_state_ack`:** delete `meta-state-ack-tool.js`, remove manifest entry, remove `acked_at` from schema, grep + remove any `acked_at` read. **`checkExpiry` (`core/meta-state.js:773-774`):** stop the `reported→stale` write; **`expires_at` becomes vestigial** (no longer written by report/recurrence after step 4; `checkExpiry` deleted in phase 4). Do NOT claim TTL "becomes" the derived predicate — they are unrelated clocks (M1).
8. Run `pnpm test`; fix the touched suites. The legacy finding entries (10 active, 12 stale) are tolerated by `isOpen`; the 168 non-finding `active` entries are untouched (separate enums).

## Success Criteria

- [ ] 3 schema sites declare finding status `{open, resolved, superseded}`; no `reported`/`active`/`stale`/`auto-resolved`.
- [ ] No `status === "active" || "reported"` branch in `core/` OR the tool files (grep clean); all 8 sites + `file-readers.js:46` use `isOpen`; 3 stale sites use `isStaleView`.
- [ ] **All 7 terminal/excludable Sets** = `{resolved, superseded}` (+archived runtime); `entry/finding.js` helpers reworked.
- [ ] **Write sites (C2):** `meta_state_report` + `recurrence-tracker` write `status:"open"`; recurrence routes through `writeEntry`; finding-creation tests green.
- [ ] **Tool-internal reads (C3/H1/H2/H3):** resolve cascade accepts `open` children + drops reported block; query-drift input enum accepts `open`; archive decision rule isOpen+age (no `acked_at`); relationship-validate ORPHAN_STATUSES + relationships-tool stale/auto-resolved branches handled.
- [ ] `cold-tier-regression.test.js:226` asserts `isOpen(af)` (H5).
- [ ] `meta_state_ack` absent from manifest + tool file deleted; `acked_at` absent from schema + code; `expires_at` no longer written by report/recurrence (vestigial).
- [ ] `meta_state_list({status:"open"})` returns legacy `active`/`reported`/`stale` finding entries (isOpen filter); the 168 non-finding `active` entries are untouched.
- [ ] All touched `pnpm test` suites green; legacy finding entries tolerated; non-finding entries untouched.

## Risk Assessment

High touch surface. **No graceful degradation (red-team M3):** `isOpen` tolerates legacy entries PRE-migration, but a post-migration `"open"` entry breaks any missed literal-`=== "active"`/`"reported"` site (e.g. the resolve cascade guard C3) — the cost of a missed site is a broken production path, not graceful filtering. Mitigation: the Related Code Files list is exhaustive (research + red-team: 8 active|reported + file-readers:46 + 3 stale + 7 terminal Sets + entry helpers + 2 write sites + resolve/query-drift/archive/relationship tool sites + cold-tier:226); tests-first per site. The atomic-unit risk is the ack removal (`checkExpiry` + TTL references) — mitigated by step 7's explicit `checkExpiry` rework + `expires_at`-becomes-vestigial decision (M1). Migration not yet run (phase 4); `isOpen` makes the code/migration order non-breaking.