---
phase: 4
title: "strengthen-mutex-test-assertion"
status: pending
priority: P3
effort: "15 min"
dependencies: []
---

# Phase 4: Strengthen Mutex Test Timestamp Assertion

## Context

`tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js:77-81` asserts:
```js
const timestamps = results.map((r) => new Date(r.created_at).getTime());
assert.ok(
  timestamps.every((t, i) => i === 0 || t >= timestamps[i - 1]),
  "Parallel cross-server writes must be serialized into monotonic created_at order"
);
```

`created_at` has millisecond resolution. Two serialized writes within the same ms tick produce `t == prev`, which passes via `>=`. The assertion is weaker than the comment claims: it proves non-regression of timestamps, not ordering.

Real ordering safety comes from the line-count + unique-id checks at lines 84-97 (which catch lost updates — the actual mutex risk). The timestamp assertion is belt-and-suspenders.

## Acceptance

Either:
- (A) The assertion uses a higher-resolution monotonic ordering proof (mutex queue position, sequence number, or `performance.now()` per call), OR
- (B) The comment matches the assertion strength: "monotonic created_at — non-regression check; ordering proof is via line-count + unique-id assertions below".

Operator preference: (B) — weakening the claim is KISS; introducing a queue-position counter is YAGNI for a passing test.

## Implementation Steps

### Step 4.1 — Patch the comment (Option B, recommended)

Replace lines 74-81 with:
```js
// created_at must be non-decreasing in call order. With ms resolution two
// serialized writes can tie (t == prev), so this is a non-regression check,
// not a strict ordering proof. The line-count + unique-id assertions below
// are the actual mutex-correctness gate (no lost updates under concurrent
// writes).
const timestamps = results.map((r) => new Date(r.created_at).getTime());
assert.ok(
  timestamps.every((t, i) => i === 0 || t >= timestamps[i - 1]),
  "created_at should not regress across serialized writes"
);
```

### Step 4.2 — Run the test

```bash
node --test tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js
```

Expected: pass.

### Step 4.3 — Cascade-resolve the follow-up finding

```
meta_state_resolve({
  id: "meta-260617T2357Z-tools-learning-loop-mastra-tests-connect-mcp-server-mutex-te",
  resolution: "Comment patched to reflect actual assertion strength. Ordering proof remains via line-count + unique-id checks at lines 84-97. Higher-resolution counter deferred (YAGNI; passing test).",
  resolved_by: "operator"
})
```

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Test still passes when mutex is broken | Low | Line-count + unique-id checks at lines 84-97 catch lost updates; those are the real mutex-correctness gate |
| Operator prefers Option A | Low | Switch to a `performance.now()` per call or a counter; ~5 extra min |
