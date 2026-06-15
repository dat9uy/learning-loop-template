---
phase: 4
title: "Code hygiene"
status: pending
priority: P3
effort: "20m"
dependencies: []
---

<!-- Updated: Validation Session 1 — F-5 expanded from 3 console.error sites to 4 sites (line 208 added) -->

# Phase 4: Code hygiene

## Overview

Two small code-hygiene fixes: replace `Math.random()` with `crypto.randomBytes` in `recurrence-tracker.js#generateFindingId` (2.3) and strip the path from `err.message` in the **4 `console.error` calls** in `core/surfaces.js` (F-5). No new tests required; existing 986/987 test suite is the regression guard.

## Cleanup items addressed

- **2.3** (Step 2, hygiene) — `recurrence-tracker.js#generateFindingId` uses a 6-character `Math.random()` suffix; collision probability is low but non-zero.
- **F-5** (Step 4 code review, hygiene) — `err.message` from `appendFileSync` / `writeFileSync` / `unlinkSync` can leak the full attempted path on ENOENT.

## Requirements

Functional: 
- 2.3: finding IDs remain unique; collision probability becomes effectively 0.
- F-5: `console.error` output no longer includes the full filesystem path on failure.

Non-functional: minimal diff; preserve PII-safe logging (Red Team #14 fix from Step 4 — surface + basename only).

## Architecture

### 4.1 — `recurrence-tracker.js#generateFindingId` (item 2.3)

**Current code** (lines 70-74):
```js
function generateFindingId(prefix) {
  const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 15);
  const suffix = `${slugify(prefix)}-${Math.random().toString(36).slice(2, 8)}`;
  return `meta-${ts}Z-${suffix}`;
}
```

The 6-character `Math.random()` suffix has ~36^6 ≈ 2.2 billion combinations; the prefix adds a slug of the command. Collision probability is low in practice (~1 in 2B per process per millisecond), but `crypto.randomBytes` is the standard fix and removes the question entirely.

**Edit**:
```js
import { randomBytes } from "node:crypto";

function generateFindingId(prefix) {
  const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 15);
  const suffix = `${slugify(prefix)}-${randomBytes(4).toString("hex")}`;
  return `meta-${ts}Z-${suffix}`;
}
```

`randomBytes(4).toString("hex")` gives 8 hex chars (collision probability ~1 in 2^32 per process per ms) and uses the OS CSPRNG (`/dev/urandom` on Linux, `BCryptGenRandom` on Windows). Same character count, same suffix shape, no behavior change for existing tests.

The 1-line `import { randomBytes } from "node:crypto";` is added to the existing import block (line 1-5):
```js
import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";  // NEW
import { join } from "node:path";
```

### 4.2 — `core/surfaces.js` `err.message` path strip (F-5)

**Current code** (4 sites — lines 91, 193, 208, 222; **all 4** use `${err.message}` and may leak the full attempted path on ENOENT):

```js
// Line 91 (appendToAllSurfaces):
console.error(`surfaces.appendToAllSurfaces: append to ${surface}/${basename(path)} failed: ${err.message}`);

// Line 193 (readModifyWriteOnAllSurfaces modifier):
console.error(`surfaces.readModifyWriteOnAllSurfaces: modifier for ${surface}/${basename(path)} threw: ${err.message}`);

// Line 208 (readModifyWriteOnAllSurfaces unlink in removeOnNull):
console.error(`surfaces.readModifyWriteOnAllSurfaces: unlink ${surface}/${basename(path)} failed: ${err.message}`);

// Line 222 (readModifyWriteOnAllSurfaces write):
console.error(`surfaces.readModifyWriteOnAllSurfaces: write ${surface}/${basename(path)} failed: ${err.message}`);
```

`err.message` on ENOENT from `appendFileSync` / `unlinkSync` may include the full path attempted (e.g., `ENOENT: no such file or directory, open '/home/user/.claude/coordination/.gate-decision.log'`). The `basename(path)` already strips the user-derived subpath, but `err.message` itself may still contain a system-derived path. **Per Validation Session 1**: all 4 sites need the strip, not 3.

**Fix options (per the code review):**
- (a) Strip the path from `err.message` via regex (e.g., remove any single-quoted absolute path before logging).
- (b) Log only `err.code` (e.g., `ENOENT`) — loses detail.
- (c) Strip only the surface + `coordination/` prefix from `err.message` (the helper is the only place that constructs that path).

**Recommended: (c)** — narrow, surgical, preserves the diagnostic info beyond the path. Implementation: extract a helper that strips a known path prefix from a string:

```js
/**
 * Strip the (surface + coordination + subpath) prefix from err.message so
 * the log line never echoes the absolute path attempted. Path-free for PII
 * + log-volume safety. Falls back to the original message if no match.
 */
function sanitizeErrorMessage(err, path) {
  const msg = err?.message ?? String(err);
  // err.message often contains the absolute path in single quotes on ENOENT/EACCES.
  // Strip the path if it appears in the message; otherwise return as-is.
  const idx = msg.indexOf(path);
  if (idx >= 0) {
    return msg.slice(0, idx) + "<path>" + msg.slice(idx + path.length);
  }
  return msg;
}
```

Then in the 4 `console.error` calls, replace `${err.message}` with `${sanitizeErrorMessage(err, path)}`.

**Alternative simpler approach (if `sanitizeErrorMessage` is overkill)**: just log `err.code` (e.g., `ENOENT`) for the 4 sites. Loses detail but is path-free. The code review explicitly suggests this as an option. **Decision: implement the helper** — it preserves diagnostic info while removing the path. ~5-10 LoC, matches the project's "minimum viable, max-clarity" style.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/recurrence-tracker.js:1, 70-74` (item 2.3 — 2 edits: 1 import, 1 function)
- Modify: `tools/learning-loop-mcp/core/surfaces.js:1, 90-94, 192-196, 207-210, 221-225` (F-5 — 1 import if `sanitizeErrorMessage` is inline, 1 helper, **4 console.error call sites** — line 208 added per Validation Session 1)

## Implementation Steps

1. **Item 2.3** — Read `core/recurrence-tracker.js` lines 1-5 and 70-74. Add the `import { randomBytes } from "node:crypto";` to the import block. Replace `Math.random().toString(36).slice(2, 8)` with `randomBytes(4).toString("hex")` in `generateFindingId`.
2. **F-5** — Read `core/surfaces.js` lines 90-94, 192-196, 207-210, 221-225. Add the `sanitizeErrorMessage` helper at the bottom of the file (or inline at the call sites). Update the **4 `console.error` calls** to use `sanitizeErrorMessage(err, path)` instead of `err.message`.
3. **Verify** by `pnpm test` — expect 986/987 (1 skipped) for both 2.3 and F-5.
4. **Manual check** (F-5): trigger a failure path and confirm the log line no longer contains the absolute path. Either:
   - Add a temporary `chmod 000` test (Unix-only) that exercises the `err.message` path and asserts the log output, OR
   - Document the manual test in the plan ("to verify, run `chmod 000 .claude/coordination && <trigger>` and check stderr").

## Success Criteria

- [ ] `core/recurrence-tracker.js` imports `randomBytes` from `node:crypto`; `generateFindingId` uses `randomBytes(4).toString("hex")` instead of `Math.random()`.
- [ ] `core/surfaces.js` has a `sanitizeErrorMessage` helper (or equivalent inline logic); the **4 `console.error` calls** (lines 91, 193, 208, 222) no longer log the full `err.message` containing a path.
- [ ] `pnpm test` shows 986/987 (1 skipped) — same as before this phase.
- [ ] Existing test `gate-decision-log.test.js` and `surfaces-rmw.test.js` still cover the happy path; the failure-path branch is exercised by the existing `console.error` log lines (no new test required, but documented as a manual verification step).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `randomBytes(4).toString("hex")` produces 8 hex chars; `Math.random().toString(36).slice(2, 8)` produces 6 alphanumeric chars. If any test asserts on the suffix length, it breaks | Verify with `grep -nE "slice\(2, 8\)\|random\(\)" __tests__/` — expect 0 hits. The ID format `meta-YYYYMMDDTHHmmZ-<slug>-<8chars>` is not asserted in any test. |
| `sanitizeErrorMessage` accidentally strips legitimate error context (e.g., a path that happens to be a substring of `err.message`) | The helper uses `msg.indexOf(path)` which only matches the exact full path. False positives are limited to: error message contains a different file path that happens to start with the same `coordination` prefix. Low probability; documented in the helper JSDoc. |
| `sanitizeErrorMessage` lives in `surfaces.js` but is called from 3 sites in the same file — extract or inline? | Keep it as a file-local helper at the bottom of `surfaces.js`. Not exported. ~10 LoC, matches the file's style. |
| Item 2.3's `randomBytes` is slower than `Math.random()` (~µs vs ns) | `generateFindingId` is called only on recurrence emission (rare event, N≥3 in M≤10min). The ~1µs cost is negligible. Documented in the helper. |
| F-5's `sanitizeErrorMessage` doesn't strip the path in all OS error messages | Document the known limitation: on Linux, `ENOENT: no such file or directory, open '/path/...'` contains the path. On macOS/Windows, the format varies. The helper is best-effort; if it doesn't strip, the log line falls back to the original message (no worse than before). |
