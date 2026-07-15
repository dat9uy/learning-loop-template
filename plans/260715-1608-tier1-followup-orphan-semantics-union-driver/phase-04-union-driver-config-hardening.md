---
phase: 4
title: "Union-driver-config hardening"
status: pending
priority: P2
dependencies: []
---

# Phase 4: Union-driver-config hardening

## Overview

Make the Tier-1 `merge=union` payoff real on fresh clones (not just documented) by shipping `tools/scripts/setup-git-merge-drivers.sh` — a one-time, idempotent per-clone `git config merge.union.driver "git merge-file --union %A %O %B"` script — plus a shell test that asserts the corrected driver unions both appends (and that the wrong `%O %A %B` order does NOT). Record the canonical-wrong-arg-order defect as a meta-state finding so it is not lost. Independent of Phases 1-3.

## Why this exists

The Tier-1 Phase 4 dry-run (session 260715-1517) proved `merge=union` works ONLY with `git merge-file --union %A %O %B` (result lands in `%A`; both appends kept, 0 dup ids). The widely-cited `git merge-file --union %O %A %B` is **wrong** — it writes the result to `%O` and git reads the unchanged `%A` (ours), silently dropping the other side (the data-loss the attribute exists to prevent). The repo had no `merge.union.driver` config anywhere, so `.gitattributes`' `merge=union` was a silent no-op on every clone. The fix was documented this session in `.gitattributes` (comment) + `AGENTS.md` §8, but `git config` is per-clone and not committable. A setup script + test makes the payoff reproducible on fresh clones instead of relying on operators reading the doc.

## Requirements

- Functional: `setup-git-merge-drivers.sh` sets `merge.union.driver` to the corrected command in the current clone, idempotently (no error if already set correctly; warns + exits non-zero if set to the WRONG order so the operator notices).
- Non-functional: read-only to the registry; touches only the clone's `.git/config`. No network, no dependencies beyond `git`. Mirrors the `tools/scripts/registry-table.sh` + `vitest-failures.sh` bash idiom (header comment, `set -euo pipefail`, clear exit codes).
- Test: a shell test (`.test.js` under `tools/scripts/__tests__/`, mirroring `registry-table.test.js`) asserts the corrected driver produces a union (both lines, 0 dup ids, no conflict) and the wrong order keeps only one side (regression guard). Runs in an isolated temp git repo; never touches the real working tree.

## Architecture

**Setup script** `tools/scripts/setup-git-merge-drivers.sh`:
- `set -euo pipefail`.
- Detect current `merge.union.driver` via `git config --get merge.union.driver` (exit 0 if unset → empty).
- Canonical correct value: `git merge-file --union %A %O %B`.
- If unset → set it; print "configured merge.union.driver (correct order)".
- If set to the correct value → no-op; print "already configured correctly".
- If set to a DIFFERENT value (e.g. the wrong `%O %A %B`) → print a warning identifying the wrong order + the data-loss risk, and exit 1 (do NOT silently overwrite an explicit operator setting; let them decide). Add `--force` to overwrite.
- Idempotent: re-running with the correct value is a no-op.

**Test** `tools/scripts/__tests__/setup-git-merge-drivers.test.js` (vitest, `.test.js` so the include glob picks it up — per Tier-1 Phase 1 Red Team F14):
- Spins an isolated temp git repo (`mktemp -d`, `git init`, `git config user.*`).
- Calls the script; asserts `git config --get merge.union.driver` equals the corrected command.
- Calls the script again; asserts no-op (idempotent).
- Sets the WRONG driver manually; calls the script WITHOUT `--force`; asserts exit 1 + warning; calls with `--force`; asserts overwritten to correct.
- **Union merge test**: with the corrected driver configured, create two branches from a shared base each appending a different change-log line at the same EOF position of `change-log.jsonl` (with `.gitattributes` marking it `merge=union`); merge non-ff; assert **(a) both lines present in the merge output, no conflict** (driver correctness), **(b) the two fixture lines have distinct ids by construction** (assert at fixture-generation, NOT at merge time). Do NOT assert "0 duplicate ids" as a driver property — `git merge-file --union` concatenates both sides without deduping; id-uniqueness is a fixture property, not a driver guarantee (red-team F12). Then reset and reconfigure with the WRONG `%O %A %B` order; assert the merge keeps only one side (regression). Mirrors the session 260715-1517 dry-run exactly.

**CI runner coverage (red-team F13 — middle-ground, not a full CI guard).** CI runners are ephemeral and never run the per-clone setup script, so `merge.union.driver` is absent on every CI run and `.gitattributes`'s `merge=union` is a no-op on CI. Add a `git config merge.union.driver "git merge-file --union %A %O %B"` step to `.github/workflows/meta-state-refs-check.yml` (before any step that could merge) so the runner clone carries the corrected driver. This is a single config line, not a guard workflow. **Residual limitation (document):** this protects merges performed within `meta-state-refs-check.yml`'s runner; a separate GitHub merge-queue workflow (if introduced later) would need the same config step. The full CI-guard workflow was explicitly declined as out-of-scope; this middle-ground closes the ephemeral-runner gap for the existing workflow.

**Meta-state finding** (live session): `meta_state_report` with `category: "loop-anti-pattern"` (or `gate-logic-bug`), `affected_system: "meta"` (or `"meta-state-tools"`), `evidence_code_ref: ".gitattributes"` (or `AGENTS.md`), describing the canonical-wrong-arg-order defect + the corrected order + the setup-script remediation. This preserves the discovery in the loop's self-model.

## Related Code Files

- Create: `tools/scripts/setup-git-merge-drivers.sh` (executable; mirrors `registry-table.sh` header/idiom).
- Create: `tools/scripts/__tests__/setup-git-merge-drivers.test.js` (mirrors `registry-table.test.js`).
- Reference: `tools/scripts/registry-table.sh` + `tools/scripts/__tests__/registry-table.test.js` (idiom to mirror).
- Modify (docs, optional): `AGENTS.md` §8 — add a one-line pointer to the setup script ("run `tools/scripts/setup-git-merge-drivers.sh` once per clone").
- Modify (CI, red-team F13 middle-ground): `.github/workflows/meta-state-refs-check.yml` — add a `git config merge.union.driver "git merge-file --union %A %O %B"` step before any merge step, so the ephemeral runner clone carries the corrected driver.
- Modify (registry, via MCP): new meta-state finding via `meta_state_report`.

## Implementation Steps (TDD — tests first)

1. **Read** `tools/scripts/registry-table.sh` + `tools/scripts/__tests__/registry-table.test.js` to mirror the contract shape (header, `set -euo pipefail`, exit codes, vitest include glob).
2. **Write the test first** (RED): the idempotency + wrong-order-warning + union-merge assertions described in Architecture. The test will fail because the script does not exist yet.
3. **Implement** `setup-git-merge-drivers.sh` per Architecture.
4. **Run** the test → GREEN. Run `pnpm test` → no regression.
5. **Run the script locally** on this clone: `bash tools/scripts/setup-git-merge-drivers.sh`; confirm `git config --get merge.union.driver` is now `git merge-file --union %A %O %B`. (This also fixes the current clone so the Tier-1 payoff is active here.)
6. **Record the meta-state finding** in a live session: `meta_state_report({ category: "loop-anti-pattern", severity: "warning", affected_system: "meta", evidence_code_ref: ".gitattributes", description: "The canonical git union merge driver `git merge-file --union %O %A %B` is wrong — git merge-file writes its result to the first arg, so the result lands in %O and git reads the unchanged %A (ours), silently dropping the other side (the data-loss merge=union exists to prevent). Correct order: `git merge-file --union %A %O %B`. Remediation: tools/scripts/setup-git-merge-drivers.sh sets the corrected driver per-clone; documented in .gitattributes + AGENTS.md §8. Discovered by Tier-1 Phase 4 merge=union dry-run (session 260715-1517)." })`.
7. **Update AGENTS.md §8** with the one-line setup-script pointer.
8. `pnpm test` green; manual: `git config --get merge.union.driver` correct on this clone.

## Success Criteria

- [ ] `tools/scripts/setup-git-merge-drivers.sh` exists, executable, idempotent, warns + exit 1 on wrong-order existing config (no silent overwrite), `--force` overwrites.
- [ ] `tools/scripts/__tests__/setup-git-merge-drivers.test.js` passes: idempotency, wrong-order warning, corrected-driver union merge (both lines present, no conflict; fixture ids distinct by construction), wrong-order regression (keeps only one side). Does NOT assert "0 dup ids" as a driver property (red-team F12).
- [ ] `git config --get merge.union.driver` on this clone == `git merge-file --union %A %O %B` after running the script.
- [ ] `meta-state-refs-check.yml` has a `git config merge.union.driver` step (red-team F13 middle-ground); residual limitation (merge-queue workflows) documented.
- [ ] Meta-state finding recorded (id captured); `evidence_code_ref` = `.gitattributes` or `AGENTS.md`; `mechanism_check` defaulted true.
- [ ] AGENTS.md §8 updated with the setup-script pointer.
- [ ] `pnpm test` green.

## Risk Assessment

- **Test environment sensitivity** — the union-merge test needs `git merge-file` available + a temp repo with the driver configured. Mitigation: the test sets up its own isolated temp repo + driver (mirrors the session 260715-1517 dry-run, which is proven to work); never touches the real working tree or `.git/config` of the project.
- **Overwriting an operator's explicit driver** — the script must NOT silently overwrite a manually-set driver. Mitigation: wrong-order detection → warn + exit 1; `--force` required to overwrite. Tests cover this.
- **`merge.union.driver` is per-clone** — the script cannot make the payoff committable. Mitigation: AGENTS.md §8 + the script + the `.gitattributes` comment together make the one-time setup discoverable; a CI guard was explicitly declined (per plan Out of Scope).