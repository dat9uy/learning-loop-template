---
phase: 2
title: "patch-f4-evidence-ref"
status: pending
priority: P3
effort: "5 min"
dependencies: []
---

# Phase 2: Patch F4 `evidence_code_ref` Line Drift

## Context

Plan 3 Step 15 + red-team finding C-7 required F4's `evidence_code_ref` to anchor at `tools/learning-loop-mastra/server.js:13` (the `PREFIX = "mastra_"` line). Actual value in `meta-state.jsonl:162` is `tools/learning-loop-mastra/server.js:38` (the description literal). Spec drift.

The finding is `status: resolved`; the patch is cosmetic but documentation accuracy matters for future drift detection.

## Acceptance

- `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` has `evidence_code_ref: tools/learning-loop-mastra/server.js:13`.
- `code_fingerprint` refreshed against line 13 (or left as-is if M-10 still applies — resolved findings don't drift).

## Implementation Steps

### Step 2.1 — Patch F4

```
meta_state_patch({
  id: "meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ",
  entry_kind: "finding",
  patch: {
    evidence_code_ref: "tools/learning-loop-mastra/server.js:13"
  }
})
```

### Step 2.2 — Refresh fingerprint (optional)

```
meta_state_refresh_fingerprint({
  id: "meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ"
})
```

If the patch handler rejects `evidence_code_ref` as immutable (per identity-field deny-list), skip this step and document the limitation in the closeout journal. The Plan 3 acceptance gate already verified F4 is resolved; the line-anchor patch is hygiene.

### Step 2.3 — Cascade-resolve the follow-up finding

```
meta_state_resolve({
  id: "meta-260617T2356Z-f4-meta-260616t2123z-the-learning-loop-mastra-peer-mcp-serve",
  resolution: "Patched F4 evidence_code_ref to tools/learning-loop-mastra/server.js:13 per Plan 3 Step 15 + C-7 spec.",
  resolved_by: "operator"
})
```

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `meta_state_patch` deny-lists `evidence_code_ref` on resolved finding | Low | Document in closeout journal; underlying anchor is still semantically correct |
| Fingerprint mismatch on refresh | Low | The finding is resolved; drift detection is moot |
