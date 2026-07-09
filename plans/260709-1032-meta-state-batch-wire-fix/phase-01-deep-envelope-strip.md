# Phase 01 — deep envelope strip + schema preprocess

## Context

- Finding: `meta-260709T1017Z-…-meta-state-batch-…`
- `core/envelope-stripper.js` — `isEnvelope(v)` + `stripEnvelope(v)` (one-level `{item:X}` unwrap).
- `tools/handlers/meta-state-batch-tool.js:12,35` — `entry` uses `stripEnvelope`; `operations` has no preprocess.
- `core/meta-state.js:674` `metaStateBatch` — `metaStateEntrySchema.safeParse(op.entry)` at ~line 707 throws `validation_failed`.

## Files to modify

1. `tools/learning-loop-mastra/core/envelope-stripper.js` — add `deepStripEnvelope` (recursive).
2. `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js` — preprocess `operations` with `deepStripEnvelope`; remove now-redundant per-field `stripEnvelope` on `entry` (DRY).
3. `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js` — add coercion tests.

## Implementation steps

1. **`envelope-stripper.js`**: add
   ```js
   // Recursively strip {item: X} envelopes anywhere in the tree.
   // Used for top-level array fields (e.g. meta_state_batch `operations`)
   // and nested arrays (change_diff.added) that the MCP wire layer coerces.
   // Fail-closed: only exact single-key `item` envelopes unwrap; everything else passes through.
   export const deepStripEnvelope = (v) => {
     if (Array.isArray(v)) return v.map(deepStripEnvelope);
     if (v && typeof v === "object" && !Array.isArray(v)) {
       const stripped = isEnvelope(v) ? v.item : v;
       const target = stripped && typeof stripped === "object" ? stripped : v;
       if (!target || typeof target !== "object" || Array.isArray(target)) return stripped;
       const out = {};
       for (const [k, val] of Object.entries(target)) out[k] = deepStripEnvelope(val);
       return out;
     }
     return v;
   };
   ```
   - After unwrapping an envelope, recurse into the inner value so `{item: {item: X}}` and `{item: {a: {item: [...]}}}` both fully flatten.
   - Undefined-safe (returns undefined for undefined).

2. **`meta-state-batch-tool.js`**:
   - import `deepStripEnvelope` alongside `stripEnvelope` (drop `stripEnvelope` import after step 3).
   - `operations: z.preprocess(deepStripEnvelope, z.array(opSchema).min(1).max(BATCH_SIZE_LIMIT))`.
   - Remove `z.preprocess(stripEnvelope, …)` from the write-op `entry` (the deep strip on `operations` already unwraps `entry` and its nested arrays). Keep `entry` as `z.record(z.string(), z.unknown())`.

3. **Tests** (`meta-state-batch-tool.test.js`):
   - Top-level coercion: call handler with `operations: {item: [writeOp]}` → expect `applied: 1`, entry written.
   - Nested coercion: write a change-log entry whose `change_diff.added` is `{item: ["a"]}` and `removed` is `{item: ["b"]}` → expect `applied: 1`, entry validates and persists with `added: ["a"]`.
   - Parity: same entry body accepted by `meta_state_log_change` (control) and by `meta_state_batch` write op.
   - Fail-closed: a write op with a non-envelope nested object (e.g. `change_diff: {added: ["a"], removed: []}`) still applies unchanged (no spurious unwrap).
   - Existing tests unchanged and passing.

## Tests / validation

- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js`
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/` (broader batch + envelope regressions).
- If an envelope-stripper unit test file exists, run it; else consider adding `deepStripEnvelope` cases there.
- Manual repro from the finding: `meta_state_batch` with `operations:[{op:"write", entry:{…change_log…}}]` succeeds where it previously returned `validation_failed`.

## Rec 12 change-log (in-PR)

- `meta_state_log_change` entry: `change_dimension: semantic`, `change_target: tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js`, `change_diff.changed: ["operations schema preprocess", "entry stripEnvelope removed (subsumed by deepStripEnvelope)"]`, plus `added: ["core/envelope-stripper.js#deepStripEnvelope"]`. Reason cites the finding id and the merge-resolution blocker.

## Post-merge (separate close-out commit, per practice)

- Resolve finding `meta-260709T1017Z-…-meta-state-batch-…` via `meta_state_resolve` with resolution referencing the PR.
- Note: the parallel-PR EOF finding (`meta-260709T1017Z-…-parallel-prs`) is **deferred into the M2 single-writer-gate debate** per operator decision — not touched here.

## Risks / rollback

- Single-`item`-key entry body would be unwrapped — same pre-existing risk as `stripEnvelope` on `entry`; not observed in practice. See plan.md.
- Rollback: revert preprocess + helper + test additions. No registry/data impact.