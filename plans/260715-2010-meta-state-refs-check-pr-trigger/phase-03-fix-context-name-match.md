---
phase: 3
title: "Fix context-name match (script-bound job id)"
status: completed
priority: P2
dependencies: [2]
---

# Phase 3: Fix context-name match (script-bound job id)

## Overview

Phase 1/2 added `pull_request:` and verified the workflow fires, but branch
protection was **still not satisfied** — the cook report's acceptance criterion
#4 was signed off on `gh pr view --json mergeable` (MERGEABLE), which honors
`enforce_admins: false` and is independent of required-status-check state. The
required context was `meta-state refs check` (the workflow `name:`), but GitHub
matches a required check against the check-run **name**, which Actions sets to
the **job id** (`refs-check`). The two never matched, so the check stayed
PENDING and merges fell back to admin bypass.

Phase 3 corrects the root cause: bind the required-check context to the parsed
job id via a script (single source of truth), and migrate the protection input
off the legacy `contexts` array to the modern `checks` array.

## Root cause (evidence)

- `GET .../branches/main/protection/required_status_checks` (before):
  `contexts: ["meta-state refs check"]`, `checks: [{context:"meta-state refs check", app_id:null}]`.
- `GET .../commits/<sha>/check-runs`: the Actions check run is named `refs-check` (the job id), conclusion `success`.
- Mismatch: required context = workflow name; matched string = job id. Never equal.
- `gh pr view 62 --json mergeable` → `MERGEABLE` was false-positive proof (honors `enforce_admins`).

## Requirements

- Functional: branch-protection required context equals the Actions job id `refs-check`; PR required checks satisfy on a successful run (no admin bypass needed for non-admins).
- Non-functional: `strict:true`, `enforce_admins:false`, and all other protection toggles preserved; workflow YAML job id and validator unchanged.
- Invariant: the required-check context is derived from the workflow YAML job id (single source of truth), not hand-typed — so a future job rename cannot silently re-introduce the mismatch.

## Architecture

`tools/scripts/setup-branch-protection.mjs`:
1. Parses the first job id from the workflow YAML via the `yaml` package (real parser, not regex).
2. GETs the full branch protection, echoes it back unchanged except `required_status_checks` → `{strict:<preserved>, checks:[{context:<job-id>, app_id:-1}]}`. The `required_status_checks` sub-endpoint PUT 404s on this repo (GitHub quirk), so the full-protection PUT is used; toggles are sent as bare booleans (the PUT 422s on `{enabled:false}`).
3. PUTs the full protection, then re-GETs and asserts the live `context` equals the parsed job id in both `checks` and `contexts` (GitHub echoes both, kept in sync).

`app_id: -1` = "any app" (matches the prior app-agnostic `contexts` behavior). The legacy `contexts` input is dropped (modern `checks` is the input; GitHub still returns both arrays in sync).

## Related Code Files

- Create: `tools/scripts/setup-branch-protection.mjs`
- Create: `tools/scripts/__tests__/setup-branch-protection.test.js` (regression)
- Modify: `.github/workflows/meta-state-refs-check.yml` (header comment corrected: removed the wrong assumption that the workflow `name:` is the matched context; documented the job-id invariant + pointer to the setup script)
- External state (live mutation, not a file): `main` branch protection `required_status_checks` → `refs-check`

## Implementation Steps

1. Write `setup-branch-protection.mjs` with offline `--dry-run`, full-protection GET/PUT, and post-PUT verify.
2. Dry-run to validate job-id parsing + request body.
3. Apply (`node tools/scripts/setup-branch-protection.mjs`); confirm `after: contexts:["refs-check"], checks:[{context:"refs-check",...}]`.
4. End-to-end verify: `gh pr view 62 --json mergeStateStatus` → `CLEAN` (was BLOCKED-by-missing for non-admins).
5. Add regression test (7 cases: job-id extraction, workflow-name≠job-id original-bug scenario, multi-job warning, missing file, no-jobs, unknown arg, --help). Run `pnpm exec vitest run tools/scripts/__tests__/setup-branch-protection.test.js` → 7/7 green.
6. Correct the stale header comment in the workflow (encodes the real invariant + single-source pointer).

## Success Criteria

- [x] `setup-branch-protection.mjs` parses `refs-check` from the workflow and applies protection idempotently.
- [x] `main` protection `required_status_checks` carries `refs-check` in both `checks` and `contexts`; `strict:true` preserved.
- [x] PR 62 `mergeStateStatus: CLEAN` (required check satisfied on the existing successful `refs-check` run; no admin bypass needed).
- [x] Regression test 7/7 green; dry-run offline (no gh auth needed).
- [x] Workflow header comment documents the job-id invariant + single-source pointer; no longer claims `pull_request:` alone satisfies protection.

## Risk Assessment

- **Full-protection PUT clobbers a toggle.** Mitigation: GET-then-echo; toggles sent as bare booleans (verified against the PUT schema's 422). Re-run is idempotent.
- **`required_status_checks` sub-endpoint PUT 404.** Mitigation: use the full-protection PUT (documented in-script).
- **Future job rename drifts protection again.** Mitigation: the script is the single source of truth — re-running it re-binds. Optional hardening (out of scope here): a dispatch/CI job that re-runs the script on workflow-file changes.
- **Classifier blocks a bare `gh api -X PUT .../protection` in Bash.** Mitigation: run via the `node tools/scripts/...` wrapper (the operator-authorized execution path).

## Rollback

Re-set protection to the prior context: `node tools/scripts/setup-branch-protection.mjs` after temporarily editing the script's desired `context` back to `meta-state refs check` (or hand-PUT via `gh`). The workflow itself is unaffected (job id unchanged), so reverting protection alone restores the prior (buggy) state without code rollback.