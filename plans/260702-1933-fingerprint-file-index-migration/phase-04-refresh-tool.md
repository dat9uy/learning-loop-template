---
phase: 4
title: "Refresh Tool"
status: pending
priority: P1
dependencies: [3]
---

# Phase 4: Refresh Tool

## Overview

Add the path-keyed `meta_state_refresh_file_index({ path })` tool: one call upserts the cited path's current hash into the sidecar, re-grounding **all** findings anchored to that path. This is the O(1)-per-file-change operator surface. **Remove** the existing `meta_state_refresh_fingerprint` (validation Q3) and retarget all its references to `refresh_file_index` — it is NOT kept as a back-compat alias.

<!-- Updated: Validation Session 1 - Q3: remove meta_state_refresh_fingerprint (not keep-as-alias); F10: optional reason confirmed; F13: re-key idempotency -->

## Requirements

- Functional: `meta_state_refresh_file_index({ path, reason? })` -> canonicalizes via `canonicalIndexKey` (stripped relative), resolves via `resolveSafePath`, hashes via `computeFileHashCached`, calls `upsertFileIndexEntry(root, evidenceCodeRef, hash)`. Returns `{ path, code_fingerprint, refreshed_at, status: "refreshed", findings_regrounded: K, reason? }` where K = count of `mechanism_check:true` findings whose `evidence_code_ref` canonicalizes to that key.
- Functional: **`meta_state_refresh_fingerprint` is REMOVED** (validation Q3). The `refresh_file_index` tool is the sole refresh surface. All references retargeted (see Architecture).
- Non-functional: single writer, per-root queue. Idempotency cache (carried over to the new tool, 60s pattern) **re-keyed** on the current index hash (red-team F13) so a real file change is a cache miss.
- **Red-team F7 — manifest `pathFields`:** the new manifest entry MUST declare `"pathFields": []` (writes to the fixed `file-index.jsonl`, not a caller-supplied path). `validateToolManifest` throws at boot if any entry lacks `pathFields`.
- **Red-team F10 — blast radius + audit identity (optional reason confirmed):** one call accepts drift for ALL K anchored findings. The gate log entry MUST include caller identity (`session_id`/agent). **Optional `reason` arg** (validation Q3/F10) recorded in the gate log when provided — not mandatory. Document the amplified blast radius in the tool description.

## Architecture

- New tool `meta-state-refresh-file-index-tool.js` mirroring the old `meta-state-refresh-fingerprint-tool.js` structure (resolveRoot -> readRegistry for K count -> `upsertFileIndexEntry` -> gate log WITH caller identity + optional `reason`). Registered in the manifest WITH `pathFields: []`.
- **Remove** `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js` + its manifest entry (`manifest.json:46`). Retarget all references (Contract Verifier enumeration):
  - `mastra/agents/build-meta-state-tools.js:12,73` — comment + tool-list entry `mastra_meta_state_refresh_fingerprint` → `mastra_meta_state_refresh_file_index`.
  - `mastra/agents/instructions/self-improvement-agent.js:4,12,18` — 3 refs (bound-surface, pre-resolve instruction, tool-surface list) → `refresh_file_index`.
  - `core/loop-introspect.js:99` — discoverability hint → `refresh_file_index`.
  - `tools/legacy/meta-state-report-tool.js:44` — description string → `refresh_file_index`.
  - `tools/scripts/refresh-fingerprints-pre-closeout.mjs:6,48` — repoint to call `refresh_file_index` per cited path (or retire if the Phase 5 seed script supersedes it).
  - `__tests__/agent-direct-parity.test.js:89`, `__tests__/legacy-mcp/path-containment-audit-sites.test.js:12,64,93,327`, `__tests__/legacy-mcp/meta-state-refresh-fingerprint-tool.test.js` — remove the removed-tool test file; retarget parity + path-containment tests to the new tool.
  - `AGENTS.md:92,170,246,271` — 4 doc refs → `refresh_file_index`.
  - **Historical `meta-state.jsonl` change-logs/loop-designs + `AGENTS.old.*` are immutable audit history — NOT edited.** The Phase 5 closeout `meta_state_log_change` records the removal.
- Manifest entry (F7): `{ "file": "tools/legacy/meta-state-refresh-file-index-tool.js", "export": "metaStateRefreshFileIndexTool", "pathFields": [] }` — verify the exact `file`/`export` key names against existing entries before editing (`manifest.json` uses `file`/`export`/`pathFields`, NOT `name`).

## Related Code Files

- Create: `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-file-index-tool.js`.
- Delete: `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js` + `__tests__/legacy-mcp/meta-state-refresh-fingerprint-tool.test.js`.
- Modify: `tools/learning-loop-mastra/tools/manifest.json` (remove old entry; add new WITH `pathFields: []`; F7).
- Modify: `tools/learning-loop-mastra/mastra/agents/build-meta-state-tools.js`, `.../instructions/self-improvement-agent.js`, `core/loop-introspect.js`, `tools/legacy/meta-state-report-tool.js`, `tools/scripts/refresh-fingerprints-pre-closeout.mjs` (retarget refs; Q3).
- Modify: `__tests__/agent-direct-parity.test.js`, `__tests__/legacy-mcp/path-containment-audit-sites.test.js` (retarget to new tool).
- Modify: `AGENTS.md` (4 refs; Q3).
- Reference: `tools/learning-loop-mastra/core/meta-state.js#upsertFileIndexEntry` + `#canonicalIndexKey` (Phase 1); `core/path-field-detector.js:93-97` (F7).

## Implementation Steps

1. **TDD — write tool tests first:** `__tests__/legacy-mcp/meta-state-refresh-file-index-tool.test.js` — refresh a path -> `readFileIndex` shows the hash at the canonical key; K count matches anchored findings; missing path -> `code_missing` error; idempotency within 60s (re-keyed F13 — refresh, mutate file, refresh -> cache miss); **gate log includes caller identity (F10)**; **optional `reason` recorded when provided (F10)**.
2. Implement `meta-state-refresh-file-index-tool.js` (F10 audit fields + optional `reason` + F13 idempotency).
3. Retarget the 9 code refs + 4 AGENTS.md refs to `refresh_file_index` (Q3).
4. Delete `meta-state-refresh-fingerprint-tool.js` + its test file; remove the manifest entry; add the new manifest entry WITH `pathFields: []` (F7).
5. Retarget the parity + path-containment tests to the new tool.
6. Run the grounding + cold-tier + refresh tool + parity suites; **boot the MCP server to confirm `validateToolManifest` passes (F7)** and `loop_describe` shows the new (not old) tool.

## Success Criteria (TDD)

- [ ] New `meta-state-refresh-file-index-tool.test.js` passes: upsert at canonical key, K-count, missing-path error, idempotency (F13 re-keyed), **gate-log caller identity (F10)**, **optional `reason` recorded (F10)**.
- [ ] `meta_state_refresh_fingerprint` **removed** (tool file + manifest entry + test file deleted); `grep -rn meta_state_refresh_fingerprint` in non-historical code/docs returns 0 (Q3).
- [ ] All 9 code refs + 4 AGENTS.md refs retargeted to `refresh_file_index`; `self-improvement-agent` + `loop-introspect` + `build-meta-state-tools` updated.
- [ ] `cold-tier-regression.test.js` passes (with index loaded, per Phase 3).
- [ ] Manifest lists the new tool WITH `pathFields: []`; **MCP server boots without `path_fields_undefined_for_tool` (F7)**; `loop_describe` shows the new tool only.
- [ ] Tool description documents the amplified blast radius (one call accepts drift for all K anchored findings).

## Risk Assessment

- **Risk (validation Q3):** a caller/agent still references the removed tool → runtime error. **Mitigation:** the Contract Verifier enumeration (9 code + 4 doc refs) is complete; grep-verify 0 remaining non-historical references before closeout. Historical `meta-state.jsonl` refs are immutable and point at the old name — acceptable (audit history).
- **Risk (red-team F7):** missing `pathFields` -> MCP server crash at boot. **Mitigation:** add `"pathFields": []`; boot-test the server.
- **Risk (red-team F13):** static idempotency cache key -> stale cached results. **Mitigation:** re-key on the current index hash; test the invalidate-on-change path.
- **Risk (red-team F10):** one refresh masks drift for K findings with no attributable trail. **Mitigation:** caller identity in the gate log + optional `reason` + documented blast radius.
- **Risk:** K-count drift if `evidence_code_ref` suffixes vary for the same file. **Mitigation:** K is informational; correctness rests on the canonical key (Phase 1). Test covers `:line` vs `#anchor`.
- **Rollback:** restore `meta-state-refresh-fingerprint-tool.js` + its manifest/test entries; revert the retargets. Index sidecar can stay (Phase 3 fallback). Note: if Phase 6 has already stripped per-record values, rollback of the *tool* still works, but per-record baselines are gone (see plan.md Validation Log consequences).
