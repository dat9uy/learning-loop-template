---
phase: 5
title: "VerifyAndChangeLog"
status: pending
priority: P2
dependencies: [4]
---

# Phase 5: VerifyAndChangeLog

## Overview

Final verification: `pnpm test` GREEN across all 13 namespaces; `meta_state_batch` repoint of the 9 meta-state entries; `meta_state_re_verify` for the 1 stale entry (`meta-260618T0558Z`); cold-cache delete; `meta_state_log_change` filed; journal entry written. After this phase, the plan ships.

## Requirements

- Functional: all tests pass; meta-state registry repointed + stale entry re-verified; cold-cache regenerated; change-log + journal filed
- Non-functional: `meta_state_batch` is 1 atomic call (not 9 sequential patches); `meta_state_re_verify` runs only AFTER the repoint (the new fingerprint is captured against the moved file)
- TDD gate: Phase 1's `meta-state-fingerprints-repointed.test.js` flips GREEN; cold-tier regression test passes; full `pnpm test` GREEN

## Architecture

The verification phase follows Plan 1's Phase 6 precedent (`plans/260624-2335-phase-e-foundation/phase-06-fingerprintrepointandverify.md`):

1. **Delete cold cache** — `records/meta/.cache/loop-describe-cold.json` (per Plan 1 Phase 2 Step 7). The cache has 29 stale path matches.
2. **`meta_state_batch`** — 1 atomic call to repoint all 9 entries. The op shape per Plan 1's red-team correction: flat fields at op's top level, NOT wrapped in `{patch: {...}}`.
3. **`meta_state_re_verify`** for entry #9 (stale) — transition stale→active.
4. **`meta_state_log_change`** — 1 entry with `change_target: plans/260626-0302-phase-e-shell-restructure/plan.md`.
5. **Cold-tier regression test** — verifies all mechanism_check=true findings grounded.
6. **`pnpm test`** — full suite GREEN.
7. **Journal entry** — `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md`.

## Related Code Files

- Delete: `records/meta/.cache/loop-describe-cold.json` (will regenerate on next cold-tier read)
- Update: `meta-state.jsonl` (via `meta_state_batch` MCP tool, not direct edit)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (no edit needed; this test runs as part of `pnpm test`)
- Create: `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md`
- Update: `plans/reports/productization-260612-1530-master-tracker.md` (Phase E Plan 6 row marked shipped)

## Implementation Steps

### Step 1: Capture the pre-move fingerprint manifest (for rollback safety)

Mirror Plan 1's `fingerprint-repoint-manifest.json` pattern. Save the current fingerprints of the 9 entries + their pre-move paths:

```bash
cd /home/datguy/codingProjects/learning-loop-template

mkdir -p plans/260626-0302-phase-e-shell-restructure/reports

# Save the meta-state line numbers of the 9 entries
grep -nE '"id":"(meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation|meta-260616T2123Z-plans-reports-productization-260612-1530-master-tracker-md-p|meta-260617T0113Z-tools-learning-loop-mastra-schemas-js|meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js|meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop|meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js|meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md|meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md|meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md)"' \
  meta-state.jsonl > plans/260626-0302-phase-e-shell-restructure/reports/pre-repoint-meta-state-lines.txt

wc -l plans/260626-0302-phase-e-shell-restructure/reports/pre-repoint-meta-state-lines.txt
# Expected: 9 lines
```

### Step 2: Delete the cold cache

```bash
ls -la records/meta/.cache/loop-describe-cold.json
# If exists:
rm records/meta/.cache/loop-describe-cold.json
ls records/meta/.cache/loop-describe-cold.json 2>&1
# Expected: No such file or directory
```

### Step 3: Pre-flight mark (per CLAUDE.md + AGENTS.md rules)

```bash
# Use the MCP tool to mark preflight complete for the 'product' surface
# (Note: this is only required if writing to product/** paths; Plan 6 doesn't, so optional)
# mcp__learning-loop__mastra_gate_mark_preflight --surface "product" 2>&1 | head -5
```

For Plan 6, no preflight is needed because:
- Plan 6 does NOT modify `product/**` (the product surface is `apps/web`, `product/api`, `product/web` — out of scope)
- Plan 6 only modifies `tools/learning-loop-mastra/**`, `tools/scripts/`, `.mcp.json`, `.factory/`, `.claude/`, root-level docs

### Step 4: Run `meta_state_batch` to repoint the 9 entries

The MCP `meta_state_batch` tool accepts an array of operations. Per Plan 1's red-team correction, op shape is flat fields at op's top level, NOT wrapped in `{patch: {...}}`.

```bash
# Use the MCP tool to run the batch op
# Operations: 9 update ops (one per entry)
```

**Operation shape (per Plan 1's Phase 6 + red-team correction):**

For each of the 9 entries, define an op:

```javascript
// Example for entry #1: meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation
{
  op: "update",
  id: "meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation",
  evidence_code_ref: "tools/learning-loop-mastra/mastra/server.js",
  change_target: "tools/learning-loop-mastra/mastra/server.js#process-env-isolation",
  applies_to: {
    schemas: ["tools/learning-loop-mastra/mastra/server.js"]
  }
}
```

For entry #5 (`meta-260617T0113Z-tools-learning-loop-mastra-schemas-js`):

```javascript
{
  op: "update",
  id: "meta-260617T0113Z-tools-learning-loop-mastra-schemas-js",
  change_target: "tools/learning-loop-mastra/mastra/schemas.js"
}
```

For entry #6 (`meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js`):

**CRITICAL (red-team F5):** The current `applies_to.schemas` array has 3 entries:
- `tools/learning-loop-mcp/core/envelope-stripper.js` (NOT moved; stays valid)
- `tools/learning-loop-mcp/core/strict-boolean-guard.js` (NOT moved; stays valid)
- `tools/learning-loop-mastra/schema-parity.js` (MOVED to `mastra/schema-parity.js`)

The `meta_state_batch` op shape overwrites `applies_to.schemas` entirely (does NOT merge). To preserve the 2 valid `learning-loop-mcp/` schema refs, the op must include all 3 entries in the array:

```javascript
{
  op: "update",
  id: "meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js",
  evidence_code_ref: "tools/learning-loop-mastra/mastra/create-loop-tool.js",
  change_target: "tools/learning-loop-mastra/mastra/create-loop-tool.js",
  applies_to: {
    schemas: [
      "tools/learning-loop-mcp/core/envelope-stripper.js",
      "tools/learning-loop-mcp/core/strict-boolean-guard.js",
      "tools/learning-loop-mastra/mastra/schema-parity.js"
    ]
  }
}
```

For entry #9 (`meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop`, stale):

```javascript
{
  op: "update",
  id: "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop",
  evidence_code_ref: "tools/learning-loop-mastra/mastra/create-loop-tool.js"
}
```

For entry #10 (`meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js`):

```javascript
{
  op: "update",
  id: "meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js",
  change_target: "tools/learning-loop-mastra/mastra/schema-parity.js"
}
```

For entry #11 (`meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md`):

```javascript
{
  op: "update",
  id: "meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md",
  evidence_code_ref: "tools/learning-loop-mastra/mastra/create-loop-workflow.js:104"
}
```

For entry #12 (`meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md`):

```javascript
{
  op: "update",
  id: "meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md",
  evidence_code_ref: "tools/learning-loop-mastra/mastra/create-loop-workflow.js:1"
}
```

For entry #13 (`meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md`):

```javascript
{
  op: "update",
  id: "meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md",
  evidence_code_ref: "tools/learning-loop-mastra/mastra/server.js"
}
```

**Invoke via MCP tool:**

```javascript
mcp__learning-loop__mastra_meta_state_batch({
  operations: [
    { op: "update", id: "...", ... },
    ...
  ]
})
```

**Expected response:** `{ applied: 9, failed: 0, ... }` per Plan 1 Phase 6 pattern.

### Step 5: `meta_state_re_verify` for entry #9 (stale → active)

Entry #9 (`meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop`) is `status=stale + mechanism_check=true`. After repoint, it needs explicit re-verify to transition stale → active.

```bash
mcp__learning-loop__mastra_meta_state_re_verify({
  id: "meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop"
})
```

**Expected response:** `{ id: "...", status: "active", last_verified_at: "<ISO>" }` per Plan 1 Phase 6 + scope report R5.

### Step 6: Run `meta_state_check_grounding` on all 9 entries

```bash
for id in \
  meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation \
  meta-260616T2123Z-plans-reports-productization-260612-1530-master-tracker-md-p \
  meta-260617T0113Z-tools-learning-loop-mastra-schemas-js \
  meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js \
  meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop \
  meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js \
  meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md \
  meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md \
  meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md
do
  echo "=== $id ==="
  mcp__learning-loop__mastra_meta_state_check_grounding --id "$id" 2>&1 | head -20
done
```

**Expected:** all 9 return `status: grounded, hash match`. If any returns `status: drifted`, STOP — the repoint missed a field. Investigate before Phase 5 completion.

### Step 7: Run the cold-tier regression test

```bash
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
```

**Expected:** all mechanism_check=true findings grounded (the cold-tier rebuild reads from the registry and verifies each entry's `evidence_code_ref` points at an existing file with a matching fingerprint).

### Step 8: Run Phase 1's `meta-state-fingerprints-repointed.test.js` (expect GREEN)

```bash
node --test tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/meta-state-fingerprints-repointed.test.js
```

**Expected:** all assertions pass (the registry now references `mastra/` paths).

### Step 9: Run full `pnpm test` (expect full GREEN)

```bash
pnpm test 2>&1 | tee plans/260626-0302-phase-e-shell-restructure/reports/pnpm-test-final.log | tail -50
```

**Expected:** all 13 namespaces GREEN; pre-commit hook would pass.

### Step 10: File `meta_state_log_change`

```bash
mcp__learning-loop__mastra_meta_state_log_change({
  change_dimension: "surface",
  change_target: "plans/260626-0302-phase-e-shell-restructure/plan.md",
  change_diff: {
    added: [
      "tools/learning-loop-mastra/mastra/ (Layer 2: Mastra shell; promoted from top-level to dedicated subdirectory)",
      "AGENTS.md §1.1 path-invariant sentence locking shell-path convention",
      "5 regression guards in tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/",
      "1 new test GLOB: phase-e-shell-restructure in tools/scripts/run-pnpm-test-namespaced.mjs"
    ],
    removed: [
      "tools/learning-loop-mastra/{server.js, create-loop-{tool,workflow,agent}.js, legacy-handler-adapter.js, schema-parity.js, schemas.js} at top level",
      "tools/learning-loop-mastra/workflows/ at top level",
      "tools/learning-loop-mastra/agents/ at top level",
      "AGENTS.md §1.1 'top level' framing for shell layer"
    ],
    changed: [
      "Layer 2 (Mastra shell) is now physically first-class (was conceptually first-class only via Plan 1)",
      "interface/contract.js:94 endsWith literal: tools/learning-loop-mastra/server.js → tools/learning-loop-mastra/mastra/server.js",
      "9 meta-state entries repointed (evidence_code_ref + change_target + applies_to.schemas fields)"
    ]
  },
  reason: "Phase E Plan 6 ships: move Mastra shell files from tools/learning-loop-mastra/ top-level into tools/learning-loop-mastra/mastra/ subdirectory. Makes Layer 2 (Mastra shell) physically first-class, matching the conceptual layering codified in AGENTS.md §1.1 by Plan 1. Unblocks Plan 4 (Mastra Code validation) by stabilizing the contract args path before Plan 4 exercises it.",
  applies_to: {
    surfaces: ["meta"],
    rules: [],
    statuses: [],
    schemas: [
      "tools/learning-loop-mastra/mastra/server.js",
      "tools/learning-loop-mastra/mastra/create-loop-tool.js",
      "tools/learning-loop-mastra/mastra/create-loop-workflow.js",
      "tools/learning-loop-mastra/mastra/create-loop-agent.js",
      "tools/learning-loop-mastra/mastra/legacy-handler-adapter.js",
      "tools/learning-loop-mastra/mastra/schema-parity.js",
      "tools/learning-loop-mastra/mastra/schemas.js"
    ]
  },
  evidence_code_ref: "tools/learning-loop-mastra/mastra/server.js",
  evidence_journal: "docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md"
})
```

**Expected response:** `{ id: "meta-260626T<time>-phase-e-plan-6-shell-restructure-...", cache_hit: false }` per Plan 1 / Plan 2 convention.

### Step 11: Write the journal entry

```bash
cat > docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md << 'EOF'
# Phase E Plan 6 (Mastra shell restructure) — shipped

**Date:** 2026-06-26
**Plan:** `plans/260626-0302-phase-e-shell-restructure/plan.md`
**Branch:** `phase-e/plan-6-shell-restructure` → `main`
**PR:** TBD (operator-filled at merge time)
**Effort:** ~1 day (within scope report's 1–1.5d estimate)
**Risk:** Medium (mechanical move + ~31 external refs + 9 meta-state repoints)

## What shipped

- **9 shell file-groups moved** from `tools/learning-loop-mastra/` top-level into `tools/learning-loop-mastra/mastra/`:
  - `server.js`, `create-loop-{tool,workflow,agent}.js`, `legacy-handler-adapter.js`, `schema-parity.js`, `schemas.js`
  - `workflows/` (10 files + `workflows-manifest.json`)
  - `agents/` (5 files + `instructions/` + `agents-manifest.json`)
- **~31 external references updated** across runtime configs (.mcp.json, .factory/mcp.json, package.json), interface contract (5 files), tests (11 files), runtime hooks + MASTRA_AGENT_MODEL.md (4 files), skill MDs (2 files), operator docs (3 files), tech docs (2 files: `docs/mcp-tool-schema-architecture.md` + `docs/project-changelog.md`).
- **AGENTS.md §1.1** updated: shell layer now says "Lives at `tools/learning-loop-mastra/mastra/`" (was "top level"). Added path-invariant sentence locking the convention.
- **Interface contract** updated: `contract.js:94` endsWith literal now matches `tools/learning-loop-mastra/mastra/server.js`.
- **9 meta-state entries repointed** to mastra/ paths via `meta_state_batch` (1 atomic call). 1 stale entry (`meta-260618T0558Z`) re-verified via `meta_state_re_verify` to transition stale→active.
- **Cold-cache deleted** (`records/meta/.cache/loop-describe-cold.json`); next cold-tier read regenerates with new paths.
- **5 regression guards** added: `__tests__/phase-e-shell-restructure/*.test.js` (locks no-top-level-shell-files, shell-files-in-mastra-dir, external-refs-updated, agents-md-layer-locations, meta-state-fingerprints-repointed).
- **1 new test GLOB** added to `tools/scripts/run-pnpm-test-namespaced.mjs`: `phase-e-shell-restructure` (now 13 namespaces total).

## Verification at merge

- All 13 test namespaces GREEN.
- `node interface/contract.js {claude-code,droid,mastra-code}` smoke tests pass with expected exit codes (0, 0, 1).
- `meta_state_check_grounding` on all 9 repointed entries returns `status: grounded, hash match`.
- Cold-tier regression test (`cold-tier-regression.test.cjs`) passes — all mechanism_check=true findings grounded.
- `meta_state_log_change` filed (per Step 10).

## Scope report diagram correction

The scope report's "after Phase E" tree diagram (`plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` lines 354–362) shows `mastra/tools/legacy/` as a subdirectory of `mastra/`. **This is incorrect**: `tools/legacy/` is Layer 1 substrate for legacy tools (not shell code) and stays at top-level of `tools/learning-loop-mastra/`. Plan 6 does NOT move `tools/legacy/`. The diagram should be read as "Mastra shell (top-level) + tools/legacy (Layer 1 substrate, sibling to mastra/)".

## What this plan did NOT ship (deferred)

- Mastra Code validation (Plan 4) — depends on this plan's stable contract path.
- Housekeeping (Plan 3) — E.2/E.3/E.4 doc/process changes; parallel to Plan 6.
- Hardening (Plan 5) — LIM-3 + R2 write-gate + LIM-4; parallel to Phase E.

## Unresolved questions

None at ship time.
EOF
```

### Step 12: Update the master tracker

Edit `plans/reports/productization-260612-1530-master-tracker.md` § Phase E row for Plan 6:

```markdown
| 6 | phase-e-shell-restructure | DONE 2026-06-26 | [x] (moved to `mastra/`) |
```

(The exact row format depends on the tracker's current schema; read the row first, then update.)

### Step 13: Run final `pnpm test` (post-change-log)

```bash
pnpm test 2>&1 | tail -5
# Expected: all 13 namespaces GREEN
```

## Success Criteria

- [ ] Pre-repoint fingerprint manifest saved to `reports/pre-repoint-meta-state-lines.txt`
- [ ] Cold-cache deleted (`records/meta/.cache/loop-describe-cold.json`)
- [ ] `meta_state_batch` repoint of 9 entries succeeds
- [ ] `meta_state_re_verify` for entry #9 succeeds (stale → active)
- [ ] `meta_state_check_grounding` on all 9 entries returns `status: grounded`
- [ ] Cold-tier regression test passes
- [ ] Phase 1's `meta-state-fingerprints-repointed.test.js` GREEN
- [ ] Full `pnpm test` GREEN across all 13 namespaces
- [ ] `meta_state_log_change` filed
- [ ] Journal entry written to `docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md`
- [ ] Master tracker updated

## Risk Assessment

- **R-Phase5-A:** `meta_state_batch` op shape mismatch (the red-team finding from Plan 1 caught this). Mitigation: ops use flat fields at op's top level (per Plan 1 Phase 6 + red-team correction).
- **R-Phase5-B:** `meta_state_re_verify` requires `META_STATE_VERIFY_EXEC=1` env var (per Plan 1 pattern). Mitigation: check `process.env.META_STATE_VERIFY_EXEC`; if not set, follow Plan 1's pattern of operator-mode pre-flight.
- **R-Phase5-C:** Cold-tier regression test fails because a repointed entry's new fingerprint doesn't match (e.g., the move changed a file's content slightly). Mitigation: STOP and investigate; the move should NOT change file content (only paths).
- **R-Phase5-D:** `meta_state_log_change` is blocked by operator-role gate. Mitigation: per Plan 2's red-team finding A8, the tool is invocable via the `self-improvement-agent.js` pattern; operator-grade is not required for ship-time `log_change`.
- **R-Phase5-E:** Master tracker row update conflicts with concurrent edits (Plan 3 / Plan 4 parallel work). Mitigation: Plan 6 ships first; Plan 3 / Plan 4 update later.

---

## Phase Checklist (for `ck plan check 5`)

```bash
# Phase 5 done when:
ls records/meta/.cache/loop-describe-cold.json 2>&1  # No such file or directory
pnpm test 2>&1 | tee reports/pnpm-test-final.log | tail -10  # all 13 namespaces GREEN
ls docs/journals/260626-phase-e-plan-6-shell-restructure-shipped.md
ls plans/260626-0302-phase-e-shell-restructure/reports/pre-repoint-meta-state-lines.txt

cd /home/datguy/codingProjects/learning-loop-template/plans/260626-0302-phase-e-shell-restructure && ck plan check 5
```