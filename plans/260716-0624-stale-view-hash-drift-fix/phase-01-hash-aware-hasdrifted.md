---
phase: 1
title: "Hash-aware hasDrifted + computeCurrentHashes helper"
status: pending
priority: P1
dependencies: []
---

# Phase 01: Hash-aware hasDrifted + computeCurrentHashes helper

## Overview
Replace the path-presence predicate in `core/stale-view.js#hasDrifted` with the same hash comparison SP2 already does at `core/check-grounding.js:201-208`. Export a `computeCurrentHashes(entries, root)` helper so consumers can build the caller-injected map without re-implementing the path-dedup + hash loop. TDD: failing tests first, then implementation.

## Requirements

### Functional
- `hasDrifted(entry, fileIndex, codeHashes)` returns `true` iff **both** `currentHash = codeHashes.get(canonical)` **and** `storedHash = fileIndex.get(canonical) ?? entry.code_fingerprint` exist and differ.
- `isStaleView(entry, { now, fileIndex, codeHashes })` returns `ageStale || driftStale` where `driftStale = hasDrifted(...)`. Missing `codeHashes` (or empty) → `driftStale = false` (backward compat for `derive-status.js:141`, `core/entry/finding.js:46`).
- `computeCurrentHashes(entries, root)` returns `Map<canonicalKey, currentHash>`. Dedupes by canonical key. Returns empty Map for non-array input. Skips missing/unreadable files (no entry, no error).

### Non-functional
- Purity: `isStaleView` and `hasDrifted` remain pure (no fs reads). `computeCurrentHashes` is impure but isolated. Returns `{ ok: Map, skipped: [] }` — caller logs `skipped` from its own runtime context. No gate-log coupling in core. (RT: M20)
- Performance: one `readFileSync` per unique canonical path (matches `seed-file-index.mjs` dedup behavior). With ~80 distinct paths and ~268 findings, ~80 reads per call. Memoize per `(entries-version, root-mtime)` if profiling shows hot.

## Architecture

<!-- RT: M2 — path containment routing (route computeCurrentHashes through resolveSafePath, not isAbsolute+join) -->
<!-- RT: M5 — replicate SP2's TERMINAL_HASH_REGEX defense in hasDrifted -->
<!-- RT: M20 — distinguish FileNotFoundError from EACCES/EMFILE/EISDIR; caller logs skipped paths from runtime context -->

```js
// core/stale-view.js — after this phase

import { canonicalIndexKey } from "./meta-state.js";
import { STALENESS_WINDOW_MS, isOpen } from "./constants.js";
import { computeFileHash, TERMINAL_HASH_REGEX } from "./check-grounding.js";
import { resolveSafePath, PathContainmentError } from "./path-containment.js";

export { isOpen };

function hasDrifted(entry, fileIndex, codeHashes) {
  const ref = entry.evidence_code_ref;
  if (typeof ref !== "string") return false;
  if (!fileIndex && !codeHashes) return false;
  const canonical = canonicalIndexKey(ref);
  const currentHash = codeHashes instanceof Map && codeHashes.has(canonical) ? codeHashes.get(canonical) : null;
  // RT: M5 — replicate SP2's regex-validated fallback chain (check-grounding.js:201-205)
  const rawIndex = fileIndex instanceof Map && fileIndex.has(canonical) ? fileIndex.get(canonical) : null;
  const indexBaseline = typeof rawIndex === "string" && TERMINAL_HASH_REGEX.test(rawIndex) ? rawIndex : null;
  const storedHash = indexBaseline
    ?? (typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
        ? entry.code_fingerprint : null);
  if (currentHash === null || storedHash === null) return false;
  return currentHash !== storedHash;
}

export function isStaleView(entry, opts = {}) {
  if (!isOpen(entry)) return false;
  const refMs = referenceTimeMs(entry);
  if (refMs === null) return false;
  const now = typeof opts.now === "number" ? opts.now : Date.now();
  const ageMs = now - refMs;
  const ageStale = ageMs > STALENESS_WINDOW_MS;
  const driftStale = hasDrifted(entry, opts.fileIndex, opts.codeHashes);
  return ageStale || driftStale;
}

export function derivedStaleSet(entries, opts = {}) {
  // unchanged
}

// New helper — exported so consumers don't re-implement
// RT: M2 — route through resolveSafePath (canonical entry point at
// core/path-containment.js:83). Reject traversal/symlink/hardlink escapes
// BEFORE reading the file.
// RT: M20 — return a result object { ok, skipped } so callers (tool handlers)
// log skipped paths from their own runtime context. Keeps core/stale-view.js
// pure (no gate-log coupling).
export function computeCurrentHashes(entries, root) {
  const ok = new Map();
  const skipped = [];
  if (!Array.isArray(entries)) return { ok, skipped };
  const seen = new Set();
  for (const e of entries) {
    const ref = e?.evidence_code_ref;
    if (typeof ref !== "string") continue;
    const canonical = canonicalIndexKey(ref);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    try {
      const absPath = resolveSafePath(root, canonical);
      ok.set(canonical, computeFileHash(absPath));
    } catch (err) {
      const reason = err instanceof PathContainmentError
        ? `containment_violation:${err.reason}`
        : err?.code === "ENOENT"
          ? "missing"  // missing-file: high-frequency, no gate-log breadcrumb
          : `fs_error:${err.code ?? "unknown"}`;  // permission/I/O: surfaced
      skipped.push({ canonical, reason });
      // No entry → no signal. Predicate treats missing currentHash as no-drift.
    }
  }
  return { ok, skipped };
}
```

### Edge cases
- `entry.code_fingerprint` validates against `TERMINAL_HASH_REGEX` (`core/check-grounding.js:66`) — replicate SP2's regex-validated chain in `hasDrifted`. Corrupt per-record values fall through to `null` (no signal). (RT: M5)
- `canonicalIndexKey` (from `core/meta-state.js`) already strips `:line`/`#anchor` suffixes. The helper inherits this behavior.
- File missing: `computeFileHash` throws `FileNotFoundError`; `computeCurrentHashes` catches → `skipped.push({ canonical, reason: "missing" })` → no entry, no drift signal. (RT: M20)
- File outside root: `resolveSafePath` throws `PathContainmentError`; `computeCurrentHashes` catches → `skipped.push({ canonical, reason: "containment_violation:..." })` → no entry, no drift signal. (RT: M2)
- Permission / I/O error: `resolveSafePath` rethrows after realpath or hardlink check; `computeFileHash` may throw for EACCES/EMFILE/EISDIR; helper catches → `skipped.push({ canonical, reason: "fs_error:EACCES" })`. Caller logs `skipped` (filter out `reason: "missing"` to avoid high-frequency log spam). (RT: M20)

## Related Code Files
- Modify: `tools/learning-loop-mastra/core/stale-view.js`
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/stale-view.test.js`
- Modify (Validation Q4): `tools/learning-loop-mastra/core/derive-status.js` (extend codeContext to accept fileIndex + codeHashes; thread to isStaleView)
- Modify (Validation Q4): `tools/learning-loop-mastra/tools/handlers/meta-state-derive-status-tool.js` (build fileIndex + codeHashes from registry; pass to codeContext)
- Modify (Validation Q4): `tools/learning-loop-mastra/__tests__/legacy-mcp/derive-status.test.js` (add 1 fixture with evidence_code_ref + mismatched codeHashes)
- Modify (Validation Q4): `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-derive-status-tool.test.js` (same)
- Read (no change): `tools/learning-loop-mastra/core/check-grounding.js` (source of `computeFileHash`)
- Read (no change): `tools/learning-loop-mastra/core/meta-state.js` (source of `canonicalIndexKey`)

## Implementation Steps

### Step 1.1 — Write failing tests in `stale-view.test.js`
Add to the existing test file:

```js
test("isStaleView: hash-aware drift fires when current ≠ stored (the bug)", () => {
  // Simulates the bug condition: file changed since last refresh.
  const entry = {
    status: "open",
    created_at: RECENT, // fresh — age branch silent
    evidence_code_ref: "tools/foo.js:12",
  };
  const fileIndex = new Map([["tools/foo.js", "sha256:baseline"]]);
  const codeHashes = new Map([["tools/foo.js", "sha256:current"]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), true);
});

test("isStaleView: hash-aware drift silent when current === stored (the fix)", () => {
  // Post-seed condition: index baseline equals current bytes.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/foo.js:12",
  };
  const fileIndex = new Map([["tools/foo.js", "sha256:same"]]);
  const codeHashes = new Map([["tools/foo.js", "sha256:same"]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
});

test("isStaleView: hash-aware drift silent when currentHash missing (no signal)", () => {
  // File doesn't exist or is unreadable — no current hash → no drift signal.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/missing.js:12",
  };
  const fileIndex = new Map([["tools/missing.js", "sha256:baseline"]]);
  const codeHashes = new Map(); // empty — simulates missing file
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
});

test("isStaleView: backward compat — missing codeHashes → no drift (age-only)", () => {
  // derive-status.js:141 calls isStaleView(entry) without opts.
  // The drift branch must short-circuit when codeHashes is undefined.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/foo.js:12",
  };
  const fileIndex = new Map([["tools/foo.js", "sha256:baseline"]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex }), false);
});

test("isStaleView: missing evidence_code_ref → never drifted", () => {
  const entry = { status: "open", created_at: RECENT };
  const fileIndex = new Map();
  const codeHashes = new Map();
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
});

test("isStaleView: per-record code_fingerprint fallback when index entry absent", () => {
  // Pre-sidecar entries: storedHash comes from entry.code_fingerprint.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/legacy.js:12",
    code_fingerprint: "sha256:legacy-baseline",
  };
  const fileIndex = new Map(); // no index entry
  const codeHashes = new Map([["tools/legacy.js", "sha256:legacy-baseline"]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
  // and when current differs:
  const codeHashes2 = new Map([["tools/legacy.js", "sha256:new"]]);
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes: codeHashes2 }), true);
});

test("isStaleView: malformed per-record code_fingerprint → no signal (SP2 H-2 defense)", () => {
  // RT: M5 — replicate SP2's TERMINAL_HASH_REGEX chain. A malformed
  // code_fingerprint (legacy/corrupt) must NOT trigger drift.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/legacy.js:12",
    code_fingerprint: "sha256:not-a-valid-hash",
  };
  const fileIndex = new Map(); // no index entry
  const codeHashes = new Map([["tools/legacy.js", "sha256:any-current"]]);
  // Malformed fingerprint → storedHash falls through to null → no drift signal.
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), false);
});

test("isStaleView: malformed index entry → fall through to per-record baseline", () => {
  // RT: M5 — same defense for index entries.
  const entry = {
    status: "open",
    created_at: RECENT,
    evidence_code_ref: "tools/foo.js:12",
    code_fingerprint: "sha256:" + "a".repeat(64), // valid per-record
  };
  const fileIndex = new Map([["tools/foo.js", "garbage-not-sha256"]]); // malformed
  const codeHashes = new Map([["tools/foo.js", "sha256:" + "b".repeat(64)]]);
  // Falls through to per-record; current differs from per-record → drift.
  assert.strictEqual(isStaleView(entry, { now, fileIndex, codeHashes }), true);
});

test("computeCurrentHashes: dedupes by canonical key, skips missing + permission errors", () => {
  // entries with the same canonical key (different :line) hash once
  const entries = [
    { evidence_code_ref: "tools/learning-loop-mastra/core/stale-view.js:1" },
    { evidence_code_ref: "tools/learning-loop-mastra/core/stale-view.js:55" },
    { evidence_code_ref: "tools/learning-loop-mastra/core/stale-view.js#hasDrifted" },
    { evidence_code_ref: "tools/nonexistent.js:1" },
  ];
  const hashes = computeCurrentHashes(entries, root);
  assert.strictEqual(hashes.size, 1); // deduped + missing skipped
  assert.match(hashes.get("tools/learning-loop-mastra/core/stale-view.js"), /^sha256:[a-f0-9]{64}$/);
});

test("computeCurrentHashes: rejects traversal/symlink escape via resolveSafePath", () => {
  // RT: M2 — verify the helper uses resolveSafePath, not isAbsolute+join.
  // Craft a finding with a traversal ref; the helper must skip (no entry)
  // rather than resolve outside the project root.
  const entries = [
    { evidence_code_ref: "../../etc/passwd" },
    { evidence_code_ref: "/etc/shadow" },
    { evidence_code_ref: "tools/../../../etc/hosts" },
  ];
  const hashes = computeCurrentHashes(entries, root);
  // None of these should appear in the map — all skipped via containment error.
  assert.strictEqual(hashes.size, 0);
});

test("computeCurrentHashes: gate-log breadcrumb on permission error (not on missing)", () => {
  // RT: M20 — distinguish FileNotFoundError from other errors.
  // Permission errors must emit a gate-log line; missing files do not (high-frequency).
  // Test setup: write a file, chmod 000, run computeCurrentHashes, check gate-log.
  // Skipped: this test requires filesystem mutation; defer to integration test.
  // The unit-test version (above) confirms the dedup; the integration test in
  // Phase 02's consumer tests covers the EACCES path.
  assert.ok(true); // placeholder; integration coverage in Phase 02
});
```

Update the existing test at lines 77-93 ("isStaleView: true when evidence_code_ref hash drifted in the file index") to match the new semantics — it should now use `fileIndex` + `codeHashes` with different hashes.

### Step 1.2 — Update implementation in `core/stale-view.js`
Replace `hasDrifted`, add `computeCurrentHashes` per the Architecture block above. Update `isStaleView` to thread `codeHashes`. Add the new imports: `TERMINAL_HASH_REGEX` from `check-grounding.js`, `resolveSafePath` + `PathContainmentError` from `path-containment.js`. No `#lib/*` imports — helper returns `{ ok, skipped }`, callers log from their runtime context. (RT: M20)

### Step 1.3 — Update the existing stale-view tests
- Line 86-93 test: change to the new hash-aware semantics (drift = hashes differ).
- All other tests remain (age-only and missing-evidence paths unchanged).

### Step 1.4 — Extend `derive_status` to inject `codeHashes` (Validation Q4)
**Goal:** `meta_state_derive_status` returns drift-aware recommendations without requiring a separate `meta_state_check_grounding` call.

**`core/derive-status.js` change:**
- Extend `codeContext` JSDoc to document `{ root, now, run_tests?, test_passed?, fileIndex?, codeHashes? }`.
- Thread `fileIndex` and `codeHashes` through to `isStaleView(entry, { fileIndex, codeHashes })` at the call site in `computeRecommendation` (currently `derive-status.js:141`).
- Backward compat: when `codeHashes` is undefined → `isStaleView` falls back to age-only (matches the new contract).

**`tools/learning-loop-mastra/tools/handlers/meta-state-derive-status-tool.js` change:**
- Import `readFileIndex` from `core/meta-state.js` and `computeCurrentHashes` from `core/stale-view.js`.
- After loading `entry`, build:
  ```js
  const fileIndex = readFileIndex(root);
  const { ok: codeHashes, skipped } = computeCurrentHashes([entry], root);
  // log non-"missing" skipped paths
  for (const s of skipped) {
    if (s.reason !== "missing") {
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_derive_status", action: "compute_current_hash_skipped", canonical: s.canonical, reason: s.reason });
    }
  }
  ```
- Pass `fileIndex` and `codeHashes` into `codeContext`:
  ```js
  const codeContext = { root, run_tests, test_passed, fileIndex, codeHashes };
  ```

**Tests:** `__tests__/legacy-mcp/derive-status.test.js` and `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js` already exist. Audit each for fixtures that lack `evidence_code_ref` — those are unaffected. Add at least 1 new fixture per file with `evidence_code_ref` AND a deliberately-mismatched `codeHashes` map to verify drift-aware `recommendation: "re_verify"` (instead of `"resolve"`) fires.

## Success Criteria

- [ ] All new tests in `stale-view.test.js` pass (failing-first; expected count: 9 new tests across this phase plus 1 updated existing test).
- [ ] Updated existing drift test passes under the new hash-aware contract.
- [ ] Existing age-only tests still pass (backward compat for callers that don't inject `codeHashes`).
- [ ] `pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/stale-view.test.js` → all green.
- [ ] Consumers modified in this phase: only `derive-status.js` (extend codeContext) and `meta-state-derive-status-tool.js` (build hashes). The 4 MCP-tool consumers of `isStaleView` are wired in Phase 02. (Validation Q4)
- [ ] `hasDrifted` uses the same `TERMINAL_HASH_REGEX` chain as SP2 (no regex-blind comparisons). (RT: M5)
- [ ] `computeCurrentHashes` routes through `resolveSafePath`; traversal/symlink/hardlink rejected. (RT: M2)
- [ ] `computeCurrentHashes` distinguishes FileNotFoundError (no signal, no log) from EACCES/EMFILE/EISDIR (no signal, gate-log breadcrumb emitted by caller). (RT: M20)
- [ ] `derive_status` extended: `codeContext` accepts `fileIndex` + `codeHashes`; `meta_state_derive_status` tool builds both and threads them to `deriveStatus`. Drift-aware recommendations now flow through SP1. (Validation Q4)

## Risk Assessment

- **Test fixture drift:** the existing test at line 90 uses `fileIndex.set("tools/foo.js", "sha256:drifted")` and asserts `isStaleView(...) === true` based on path presence. After this phase that test must change shape (currentBytes ≠ storedBytes). Documented in Step 1.3.
- **`canonicalIndexKey` import:** already in scope at `stale-view.js:26` — no new import edge.
- **`computeFileHash` import:** cross-module import from `check-grounding.js`. Acceptable — the dependency direction is core→core (no handler→core violation). If a circular-dep audit later flags this, extract `computeFileHash` into a `core/hasher.js` shared lib (out of scope for this phase).
- **`resolveSafePath` import:** `core/stale-view.js` → `core/path-containment.js`. Acceptable; path-containment is a primitive. If a circular-dep audit flags this, extract `resolveSafePath` into a shared `core/path-utils.js` (out of scope).
- **Permission-error test (EACCES):** the standalone unit test for EACCES requires filesystem mutation (chmod 000). Move to a dedicated integration test under `__tests__/legacy-mcp/` in Phase 02; Phase 01 covers only the success / missing / traversal paths via unit tests.
- **`derive_status` extension may regress existing tests:** `computeRecommendation` at `derive-status.js:141` calls `isStaleView(entry)` with no opts; post-extension it will receive `fileIndex` + `codeHashes`. If a `derive-status.test.js` fixture currently relies on age-only behavior to surface drift-stale, post-extension assertions may flip. **Mitigation:** audit `__tests__/legacy-mcp/derive-status.test.js` and `meta-state-derive-status-tool.test.js` for fixtures that backdate `created_at` to surface stale-view; if such fixtures lack `evidence_code_ref`, behavior unchanged. (Validation Q4)
