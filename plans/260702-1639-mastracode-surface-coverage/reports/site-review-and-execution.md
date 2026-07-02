# Site-by-Site Review & Execution Report

Plan: `260702-1639-mastracode-surface-coverage` — cover `.mastracode` surface in legacy gates + shim check.
Branch: `hardening/mastracode-surface-coverage`. Verdict: all 5 files migrated; tests + gate green; committed pending operator approval.

## Headline finding (deviation from plan)

The plan's Phase 1 prerequisite assumed `.claude` and `.factory` shims were byte-identical. They were **not** — all 4 differed (header comment + path-resolution style; functionally equivalent — both resolve the same universal hook). Phase 1's own Risk Assessment said "if they differ, stop and surface it." Execution stopped; operator chose **Option A: reconcile all 3 surfaces to byte-identity**. One canonical shim was written to `.mastracode/coordination/hooks/` (4 new) and copied over `.claude`/`.factory` (overwriting the drifted copies). Behavior-preserving: `path.resolve(__dirname,'../../..')` → project root from all 3 surface dirs identically; delegation targets unchanged.

A second, unanticipated defect surfaced: **`shims-in-sync` was broken against the real repo.** It derived shim filenames from universal-hook names (`bash-gate.js` → `bash-gate.cjs`), but the actual shims are `bash-coordination-gate.cjs` — so it never found them and only compared 2 surfaces. No test ran it against the real repo (the only test used a temp root with matched names) — exactly the "green proves coverage, not correctness" trap. Rewritten to enumerate real `.cjs` files per surface and verify byte-identity across all surfaces.

## Site-by-site review (Phase 3 step 8)

| File | SURFACES import | test-override hook | no 2-elem/literal | .claude/.factory unchanged |
|------|-----------------|--------------------|-------------------|-----------------------------|
| `inbound-gate.js` | `writeToAllSurfaces` from `../../core/surfaces.js`; `join` import removed (unused) | `GATE_MARKER_PATH` single-path branch intact | hand-rolled `for…of [".claude",".factory"]` → `writeToAllSurfaces` | `writeToAllSurfaces` = write-tmp+rename per surface, swallows errors — matches old `catch{}`+atomic write |
| `mark-preflight-complete-tool.js` | `SURFACES`+`join` | `GATE_COORD_DIR` single-dir branch intact | `coordDirs`=`SURFACES.map` | loop + `writePreflightMarker`/`readPreflightMarker` unchanged; `marker`=last surface (pre-existing semantic, plan §2.2 accepted) |
| `evaluate-bash-gate.js` | SURFACES import kept (test invariant) | n/a | `.mastracode` `>`+`tee` literals added (11→13) | .claude/.factory literals untouched |
| `runtime-agnostic-checklist.js` | local `buildShimMaps`/`iterAuditCodeFiles` | n/a | `SHIM_DIRS`=3; verify iterates all (no 2-elem destructure) | other items' logic identical (prologue deduped only) |
| `gate-override.js` | already iterates SURFACES | n/a | comment-only | logic untouched |

## Verification

- `pnpm test`: **1585 tests, 0 fail, exit 0**.
- `pnpm fallow:gate`: **deterministically green** — 3 consecutive runs exit 0 ("No issues in 20 changed files"). First run was green-by-luck (inherited/new classification of the rewritten `shims-in-sync` verify flipped run-to-run); fixed deterministically with `// fallow-ignore-next-line complexity` on that verify, matching the suppression already on every sibling auditor verify in the file.
- Narrow: `runtime-agnostic.test.js` + `evaluate-bash-gate.test.js` → 35/35.
- Shim SHA256 parity: 4 distinct hashes, each shared across all 3 surfaces.
- Independent `code-reviewer` subagent: verdict 7/10, single critical (the flaky gate, now fixed), 1 benign warning (mark-preflight timestamp now from `.mastracode` — pre-existing last-surface-wins semantic, no consumer depends on it), 1 out-of-scope suggestion (auditor regexes match only `.claude`/`.factory` — pre-existing, `parameterized-for-new-surfaces` catches indirectly; noted as follow-up).

## Gate-greening detail (fallow)

Suppressions added (all matching established repo convention from commit `15d8177`):
- `// fallow-ignore-next-line unused-export` on `stripCommentsAndStrings` (fallow-blind to test consumers — test dir in `ignorePatterns`; same situation as `PATH_WRITE_PATTERNS`).
- `// fallow-ignore-next-line complexity` on `readGateOverride` + `writeGateOverride` arrow (pre-existing complexity, re-surfaced by touching the file).
- `// fallow-ignore-next-line complexity` on `protocol-adapter-i-o` verify + `shims-in-sync` verify (auditor verifies; inherent branching).
Real-cause fixes (not suppressions): extracted `iterAuditCodeFiles` (deduped the cross-surface + parameterized auditors' shared walk+filter+load prologue — removed the clone group) and `buildShimMaps` (lowered the rewritten `shims-in-sync` verify's complexity). No `--no-verify` used.

## Follow-up noted (out of scope)

- `cross-surface-iteration` `hardCodedPath` regex and `parameterized-for-new-surfaces` `touchesSurfaces` regex match only `.claude`/`.factory`, not `.mastracode`. Pre-existing; `parameterized-for-new-surfaces` catches a `.mastracode`-hard-coding file indirectly via the `coordination` literal. Deriving these from `SURFACES` would close the loop — optional follow-up, not a blocker.
- The line-99 `runtime-agnostic.test.js` invariant blind spot (plan Out-of-Scope) — unchanged.