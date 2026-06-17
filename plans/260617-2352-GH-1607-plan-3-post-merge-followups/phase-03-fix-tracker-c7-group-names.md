---
phase: 3
title: "fix-tracker-c7-group-names"
status: pending
priority: P3
effort: "5 min"
dependencies: []
---

# Phase 3: Fix Master Tracker C7 Group Names

## Context

`plans/reports/productization-260612-1530-master-tracker.md:193` claims C7 shipped with `5 groups (coordination, meta_state, runtime_state, gate, introspection)`. Actual groups in `tools/learning-loop-mastra/agent-manifest.json` are: `(gate, workflow, meta_state, introspection, runtime_agnostic)`.

Three names diverge:
- `coordination` — never created
- `runtime_state` — never created
- `workflow` — exists in manifest, missing from tracker
- `runtime_agnostic` — exists in manifest, missing from tracker
- `gate`, `meta_state`, `introspection` — match

## Acceptance

- Tracker line 193 lists `(gate, workflow, meta_state, introspection, runtime_agnostic)` matching the manifest.
- Tool-count breakdown matches: `gate=5, workflow=11, meta_state=20, introspection=3, runtime_agnostic=1 = 40`.

## Implementation Steps

### Step 3.1 — Edit tracker line 193

Find the line:
```bash
grep -n "5 groups" plans/reports/productization-260612-1530-master-tracker.md
```

Replace the group enumeration with the canonical 5: `gate`, `workflow`, `meta_state`, `introspection`, `runtime_agnostic`. Mirror the breakdown from `tools/learning-loop-mastra/server.js:38` description literal:
> 5 groups (`gate`, `workflow`, `meta_state`, `introspection`, `runtime_agnostic`) with 40 `mastra_`-prefixed deterministic tools (gate=5, workflow=11, meta_state=20, introspection=3, runtime_agnostic=1).

If Phase 1 of this plan deletes `meta_state_refresh_tools`, also update the count: `meta_state=19` and `total=39`.

### Step 3.2 — File change-log

```
meta_state_log_change({
  change_dimension: "surface",
  change_target: "plans/reports/productization-260612-1530-master-tracker.md#Phase C — C7 group names",
  change_diff: {
    added: ["workflow", "runtime_agnostic"],
    removed: ["coordination", "runtime_state"],
    changed: ["C7 body group enumeration"]
  },
  reason: "Plan 3 cut-over closeout left tracker C7 line 193 listing 3 incorrect group names (coordination/runtime_state never existed; workflow/runtime_agnostic were missing). Patched to match tools/learning-loop-mastra/agent-manifest.json canonical groups.",
  evidence_code_ref: "plans/reports/productization-260612-1530-master-tracker.md"
})
```

### Step 3.3 — Cascade-resolve the follow-up finding

```
meta_state_resolve({
  id: "meta-260617T2357Z-master-tracker-c7-line-193-lists-groups-as-coordination-meta",
  resolution: "Tracker C7 line 193 patched to match canonical agent-manifest.json groups (gate, workflow, meta_state, introspection, runtime_agnostic).",
  resolved_by: "operator"
})
```

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Other tracker sections reference the wrong group names | Low | Grep the whole tracker for `coordination`/`runtime_state` before committing |
| Phase 1 interaction (manifest count shift 40→39) | Low | Run Phase 1 before Phase 3 to get the final count right |
