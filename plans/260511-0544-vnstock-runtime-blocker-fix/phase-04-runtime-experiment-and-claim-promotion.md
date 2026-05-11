---
phase: 4
title: "Runtime experiment and claim promotion"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: Runtime experiment and claim promotion

## Overview

Run the end-to-end experiment, capture evidence, flip `claim-vnstock-runtime-403-root-cause.yaml` verification dimensions from `claimed` to `verified`, promote `approval.status` draft → reviewed. Unblock the FastAPI Reference Build plan's blocked phases. Remove `/tmp/vnstock-source-inspect/` staging.

## Requirements

- Functional: create an **experiment record** that satisfies `claim-verification-rules.js` so `verification.install` + `verification.runtime` can both flip to `verified`. Evidence sanitized before commit.
- Non-functional: `pnpm validate:records` passes incrementally after each file creation; evidence MD follows records-ledger conventions; FastAPI Reference Build plan updated only after end-to-end FastAPI call succeeds.

## Architecture

The records system requires a matching **experiment record** (type === "experiment", status in {"reviewed","approved"}) with `verification.claim_refs` + `verification.proves` before any claim dimension can be `verified` (`claim-verification-rules.js:140-147`). Additionally, `validateHumanApproval` requires `requires_human_approval: true` + `approval_status: approved` on the experiment (`claim-verification-rules.js:71-78`).

Claim dimensions:
- `static` — already `verified` (source-read in prior session)
- `install` — flips to `verified` after Phase 1 clean install passes
- `runtime` — flips to `verified` after Phase 3 smoke test passes; **must also update `runtime.output` from `metadata-only` → `runtime-captured`**
- `product` — remains `claimed` until FastAPI Reference Build runtime close-out succeeds (downstream plan)

Proof artifacts:
- **Primary**: raw `cli_installer.log` excerpt (sanitized) and raw pytest stdout (timestamped, stored in evidence dir but NOT the narrative MD).
- **Narrative**: `records/evidence/*.md` summarizes the experiment; does NOT cite itself as proof.
- **Audit trail**: before deleting `/tmp/vnstock-source-inspect/`, archive the grep manifest of all VCI `get_headers` import sites into `docs/vendor-vnstock-installer.md`.

## Related Code Files

- Modify: `records/claims/claim-vnstock-runtime-403-root-cause.yaml`
- Create: `records/evidence/260511-vnstock-runtime-403-fix.md` (or current-date evidence file matching repo conventions)
- Modify: `plans/260511-0030-fastapi-reference-build/plan.md` — phase 3 and 5 status from `Blocked` to `Pending` (or per ck plan CLI: `ck plan uncheck`)
- Cleanup: `/tmp/vnstock-source-inspect/`, `/tmp/vnstock-source-copy.py`

## Implementation Steps

1. Confirm Phases 1+2+3 all green.
2. **Archive audit trail before staging cleanup**:
   - Run `grep -rn "from vnstock_data.core.utils.user_agent import get_headers" /tmp/vnstock-source-inspect/vnstock_data/explorer/vci/` and append the output to `docs/vendor-vnstock-installer.md` under a new "VCI get_headers import sites" section.
3. Capture proofs (sanitize before writing):
   - Tail `cli_installer.log` for the latest install: timestamp, slot count, exit status. **Strip any `api_key` value or bearer token** before saving.
   - Run `cd product/api && VNSTOCK_SMOKE_TEST_ALLOW_LIVE=1 uv run pytest -m network tests/test_vci_smoke.py -v --tb=short 2>&1 | tee /tmp/smoke-<TS>.log` — keep the raw log as primary proof.
   - Write a tiny header-dump check and capture stdout (strip raw Device-Id value from output; only assert presence/non-empty).
4. Create **experiment record** at `records/experiments/experiment-vnstock-runtime-403-fix-<TS>.yaml`:
   - `type: experiment`, `status: approved`
   - `verification.claim_refs: [record:claim-vnstock-runtime-403-root-cause]`
   - `verification.proves`:
     - `install` (scope: sandbox)
     - `runtime` (scope: sandbox, output_level: runtime-captured)
   - `verification.requires_human_approval: true`
   - `verification.approval_status: approved` (operator sign-off after reviewing evidence)
   - `source_refs` pointing to evidence MD + raw pytest output
5. Create evidence file at `records/evidence/<TODAY>-vnstock-runtime-403-fix.md` (check existing evidence files for naming convention; mirror schema/frontmatter).
   - **Narrative summary only** — describe what was done and the outcome. Do NOT cite the evidence MD itself as a proof ref in the claim.
6. Update `records/claims/claim-vnstock-runtime-403-root-cause.yaml`:
   ```yaml
   updated_at: "<TODAY>"
   verification:
     install:
       status: verified
       output: metadata-only  # install dimension stays metadata-only (no runtime output)
       proof_refs:
         - local:product/api/.vnstock/cli_installer.log
         - local:records/experiments/experiment-vnstock-runtime-403-fix-<TS>.yaml
     runtime:
       status: verified
       output: runtime-captured  # MUST flip from metadata-only
       proof_refs:
         - local:records/experiments/experiment-vnstock-runtime-403-fix-<TS>.yaml
         - cmd:cd product/api && VNSTOCK_SMOKE_TEST_ALLOW_LIVE=1 uv run pytest -m network tests/test_vci_smoke.py
   approval:
     status: reviewed
     reviewed_at: "<TODAY>"
   ```
7. Run `pnpm validate:records` after EACH file creation (experiment, evidence, claim) to catch cross-reference failures incrementally. Then run `pnpm check`.
8. **End-to-end unblock gate**: Before flipping downstream plan phases, verify the FastAPI endpoint itself works:
   - `cd product/api && uv run python -c "from src.main import app; from fastapi.testclient import TestClient; c = TestClient(app); r = c.get('/reference/equity'); print(r.status_code, r.headers.get('content-type'))"` → expect `200 application/json`.
   - Only if this passes, update `plans/260511-0030-fastapi-reference-build/plan.md`:
     - Phase 3 status: `Blocked` → `Pending`
     - Phase 5 status: `Blocked` → `Pending`
     - Update `## Current Status` section.
9. Cleanup (after audit trail archived):
   - `rm -rf /tmp/vnstock-source-inspect/`
   - `rm /tmp/vnstock-source-copy.py`
   - `rm /tmp/smoke-*.log` (after evidence captured)
10. Commit chain (separate commits, each scope):
    - `fix(api): point VNSTOCK_CONFIG_PATH at .vnstock root` (Phase 1)
    - `feat(api): add vendor_compat for vnstock_data Device-Id patch` (Phase 2)
    - `test(api): VCI runtime smoke test with live gate` (Phase 3)
    - `docs(records): promote vnstock 403 claim to reviewed` (Phase 4)

## Todo List

- [x] Capture install log proof
- [x] Capture smoke test proof
- [x] Capture header-dump proof
- [x] Write evidence MD
- [x] Update claim YAML verification dimensions
- [x] Run `pnpm validate:records` + `pnpm check`
- [x] Unblock FastAPI Reference Build phases 3/5
- [x] Remove /tmp staging
- [ ] Commit per-phase as described

## Success Criteria

- [ ] Experiment record created, `status: approved`, with `requires_human_approval: true` and `approval_status: approved`
- [ ] Claim YAML `verification.install.status = verified` with proof_refs pointing to experiment + sanitized install log
- [ ] Claim YAML `verification.runtime.status = verified` **and** `runtime.output = runtime-captured` with proof_refs pointing to experiment + pytest command
- [ ] Claim YAML `approval.status = reviewed`
- [ ] Evidence MD is narrative-only; raw pytest output stored separately as primary proof
- [ ] `pnpm validate:records` passes after EACH incremental file creation, then `pnpm check` passes
- [ ] FastAPI endpoint `/reference/equity` returns 200 JSON in end-to-end gate before unblocking downstream plan
- [ ] FastAPI Reference Build plan phase 3/5 marked Pending only after end-to-end gate passes
- [ ] VCI grep manifest archived to `docs/vendor-vnstock-installer.md` before /tmp staging removed
- [ ] Four commits landed on `main` with conventional commit format

## Risk Assessment

- **Smoke test fails**: patch order wrong or vendor changed something else. Mitigation: inspect header dump first — if Device-Id missing post-patch, our patch isn't reaching the consumer. Fall back: rebind directly on `vnstock_data.explorer.vci.listing.get_headers` and `Reference()`-touched modules.
- **Claim schema rejection**: missing required fields or wrong shape. Mitigation: diff against an existing `verified` claim before submission.
- **`pnpm validate:records` references frozen records**: shouldn't reject a draft → reviewed promotion. Mitigation: read `tools/validate-records/` source if it errors unexpectedly.

## Security Considerations

- No new credentials introduced. `api_key.json` remains 0o600. Smoke test does not echo `api_key.json` content.

## Next Steps

- `/ck:cook` of `plans/260511-0030-fastapi-reference-build/plan.md` to resume FastAPI Reference Build close-out.
- Optional: file `vnstock_data.get_headers` Device-Id-missing bug upstream with the vendor.
