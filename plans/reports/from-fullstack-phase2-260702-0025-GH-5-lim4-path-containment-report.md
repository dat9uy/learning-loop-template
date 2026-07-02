# Phase 2 (LIM-4 Path Containment) — Implementation Report

**Phase:** 2 — LIM-4 Path Containment (realpath + hardlink rejection)
**Plan:** 260701-2250-plan-5-lite-r2-lim4
**Status:** DONE_WITH_CONCERNS
**Date:** 2026-07-02

## What landed

- New module `tools/learning-loop-mastra/core/path-containment.js` exporting
  `resolveSafePath`, `PathContainmentError`, `isHardlinked`, `clearRealpathCache`.
  Realpath + startsWith containment, hardlink (nlink>1) rejection, defensive
  `:` reject (NF4), null-byte reject, module-scoped `realpathCache` per NF2.
- All 7 audit sites migrated from `path.join(root, userPath)` /
  `isAbsolute(x) ? x : join(root, x)` to `resolveSafePath(root, ...)`:
  1. `meta-state-refresh-fingerprint-tool.js:116`
  2. `check-grounding.js:142`
  3. `derive-status.js:88` (checkExists)
  4. `gate-logic.js:672` (checkResolutionEvidence)
  5a. `meta-state-check-grounding-tool.js:17` (runTest)
  5b. `meta-state-derive-status-tool.js:17` (runTest)
  6. `verification-runner.js:34` (step.cwd)
- Grep guard test confirms none of the 7 banned user-path patterns remain.
- `core/placement.yaml` updated to register `path-containment.js` (required
  by the placement-manifest structural invariant test; the file header states
  new core files MUST be added or tests fail).

## Test counts

- `path-containment.test.js`: 20/20 pass (unit suite — all F3/F4/F5 cases +
  directory-skip locks + PathContainmentError shape).
- `path-containment-audit-sites.test.js`: 11/11 pass (one rejection test per
  audit site + missing-file preservation + legit smoke + grep guard).
- Total new tests: 31, all pass.
- `pnpm test` overall: 4 failing tests remain (2 pre-existing-class tests
  now failing from intended behavior change + 0 from placement manifest
  after the yaml update). See Concerns.

## Concerns / behavior-change fallout

### C1 — `:` reject (NF4) breaks legitimate `:symbol` evidence_code_ref (HIGH)

The cold-tier-regression test (`__tests__/legacy-mcp/cold-tier-regression.test.js`)
fails because a real finding in the registry uses
`evidence_code_ref: "crates/api/src/audit_output.rs:build_audit_sarif"`.
`stripEvidenceAnchor` does NOT strip `:build_audit_sarif` (the key-path regex
requires at least one dot segment; `build_audit_sarif` has no dots). The NF4
defensive `:` reject then throws `traversal_detected`.

Per instructions, the `:` reject was NOT weakened. This is a genuine conflict
between NF4 and existing legitimate `:symbol` ref format. Resolution options
for maintainers:
1. Narrow the `:` reject to fire only when `..` is present in the post-strip
   path (still catches R15's `tools/foo.js:../../etc/passwd`).
2. Extend `stripEvidenceAnchor` to also strip `:bareword` symbol suffixes.
3. Update the finding's `evidence_code_ref` to use `#build_audit_sarif`.

Survey: only 1 finding in the registry hits this (the other 126 `:`-bearing
refs use `:line`/`:start-end`/`:key.path` which stripEvidenceAnchor strips).

### C2 — check-grounding T-23 tested the OLD escape behavior (MEDIUM, expected)

`__tests__/legacy-mcp/check-grounding.test.js` T-23 ("handles path traversal
(../, defensively)") explicitly asserts that `../sibling/external.js` does NOT
throw. This is exactly the vulnerability LIM-4 fixes. The test now fails with
`PathContainmentError: outside_root` — the intended new behavior. The test
file is outside Phase 2 ownership; it should be updated to expect the throw.

### C3 — `isHardlinked` directory-skip deviation (LOW, documented)

The phase file snippet returns `stats.nlink > 1` unconditionally. This rejects
all directories (directories have nlink >= 2 by default for `.`/`..`). The
R5 threat only applies to files (hardlinks to directories are disallowed on
Linux/macOS). `isHardlinked` now returns false for directories; this is
required for `step.cwd` (always a directory) and `resolveSafePath(root, '.')`
to work. Tests lock this behavior. Documented as a justified deviation.

### C4 — ENOENT preservation in checkExists / runTest / checkResolutionEvidence (LOW, documented)

The phase file's `resolveSafePath` maps ALL ENOENT to `outside_root`. But
sites 2, 3, 4, 5a, 5b have legitimate "missing file inside root" cases that
must NOT throw (they drive `code-missing` derivation kind, `code_ref_missing`
orphan, and null test-skip respectively). These sites catch
`PathContainmentError{reason:"outside_root", resolvedPath:null}` and preserve
the old behavior (false / null / code_ref_missing). Actual escapes
(`resolvedPath` set), hardlinks, and realpath failures still propagate. This
preserves all existing regression tests (T-8 in check-grounding, the
code_ref_missing gate-resolution test, etc.).

## Files created
- `tools/learning-loop-mastra/core/path-containment.js`
- `tools/learning-loop-mastra/__tests__/path-containment.test.js`
- `tools/learning-loop-mastra/__tests__/legacy-mcp/path-containment-audit-sites.test.js`

## Files modified (the 7 audit sites + placement.yaml)
- `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js`
- `tools/learning-loop-mastra/core/check-grounding.js`
- `tools/learning-loop-mastra/core/derive-status.js`
- `tools/learning-loop-mastra/core/gate-logic.js`
- `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js`
- `tools/learning-loop-mastra/tools/legacy/meta-state-derive-status-tool.js`
- `tools/learning-loop-mastra/core/verification-runner.js`
- `tools/learning-loop-mastra/core/placement.yaml` (companion to new core file)

## Unresolved questions
- C1: should maintainers narrow the `:` reject (option 1), extend
  stripEvidenceAnchor (option 2), or update the one finding's ref (option 3)?
  This blocks `pnpm test` green until resolved.
- C2: who owns updating check-grounding.test.js T-23 to expect the throw?
  Likely Phase 3 cross-cutting or a follow-up.