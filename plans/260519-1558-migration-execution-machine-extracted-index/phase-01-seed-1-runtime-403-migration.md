---
phase: 1
title: "Seed 1 Runtime 403 Migration"
status: complete
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Seed 1 Runtime 403 Migration

## Overview

Migrate `claim-vnstock-runtime-403-root-cause` into atomic extracted assertions in `records/index/`. This is the primary prototype seed — it stress-tests N counting and the supersession flow because the claim bundles assertions from two time-points (2026-05-11 original, 2026-05-18 supersession) across two dimensions (install, runtime).

## Requirements

- Functional: Five atomic assertions extracted from two evidence files and one new evidence file.
- Non-functional: Supersession flow must produce correct `status: superseded` on the old assertion and `status: active` on the new. No edits to the frozen claim file.

## Architecture

The claim bundles five assertions. After atomic extraction they become:

| # | Assertion | Dimension | Source Evidence |
|---|-----------|-----------|-----------------|
| A | Wrapper `VNSTOCK_CONFIG_PATH` points at `.vnstock` root. | install | `wrapper-config-path-fix-20260511.md` (new file) |
| B | vnstock_data VCI headers require Device-Id injection. | runtime | `runtime-403-fix-20260511.md` |
| C | vnstock_data 3.1.8 no longer requires Device-Id injection. | runtime | `capability-revalidation-20260518.md` |
| D | `HOME` must point at `product/api` for `api_key.json` resolution. | runtime | `capability-revalidation-20260518.md` |
| E | vendor_compat is archived; not needed for >= 3.1.8. | install | `capability-revalidation-20260518.md` ⚠ |

⚠ Assertion E is install-dimension semantically but the source evidence file (`capability-revalidation-20260518.md`) is runtime-dimension. Per the one-file-one-dimension rule, this bullet must be written into a separate install-dimension companion file or the extraction tool will error-and-refuse.

## Related Code Files

- Create: `records/evidence/vnstock-data/wrapper-config-path-fix-20260511.md`
- Create: `records/evidence/vnstock-data/install-vendor-compat-archived-20260518.md` (companion for assertion E)
- Modify: `records/evidence/vnstock-data/runtime-403-fix-20260511.md` — add `## Findings`
- Modify: `records/evidence/vnstock-data/capability-revalidation-20260518.md` — backfill frontmatter + add `## Findings`
- Read for context: `records/claims/claim-vnstock-runtime-403-root-cause.yaml`
- Read for context: `plans/reports/brainstorm-20260518-machine-extracted-index.md` Worked Example section

## Implementation Steps

1. **Add `## Findings` to `runtime-403-fix-20260511.md`.**
   Append at end of file:
   ```markdown
   ## Findings

   - [device-id-injection-required] vnstock_data VCI request headers must include a `Device-Id` header and matching `device_id` cookie for the listing and quote surfaces to authenticate.
     - Context: Observed against vnstock_data 3.0.x in product/api sandbox venv on 2026-05-11.
     - Caveat: Patch lives in `product/api/src/vendor_compat/`; not upstreamed.
   ```

2. **Create `wrapper-config-path-fix-20260511.md` (install dimension).**
   Frontmatter:
   ```yaml
   ---
   record_type: evidence
   capability: vnstock-data
   dimension: install
   scope: sandbox
   validation_status: passed
   claim_support: supports
   created: "2026-05-11T14:35:00+07:00"
   ---
   ```
   Content:
   ```markdown
   # Wrapper Config Path Fix — vnstock-data — 20260511

   ## Findings

   - [wrapper-config-path-root] The install-vnstock.sh wrapper must set `VNSTOCK_CONFIG_PATH` to the `.vnstock` root, not one segment deeper, for the installer and runtime to agree on where `user.json`, `api_key.json`, and `device.id` live.
     - Context: Applies to the wrapper at `product/api/scripts/install-vnstock.sh` running against vnstock_data 3.0.x and 3.1.x.
   ```

3. **Backfill frontmatter on `capability-revalidation-20260518.md`.**
   Insert at top of file:
   ```yaml
   ---
   record_type: evidence
   capability: vnstock-data
   dimension: runtime
   scope: sandbox
   validation_status: passed
   claim_support: supports
   created: "2026-05-18T00:30:00+07:00"
   ---
   ```

4. **Add `## Findings` to `capability-revalidation-20260518.md`.**
   Append at end of file:
   ```markdown
   ## Findings

   - [device-id-injection-not-required] vnstock_data 3.1.8 no longer requires Device-Id injection for VCI auth; `api_key.json` is sufficient.
     - Context: Verified across 6 surfaces (Reference.listings, Reference.company, Market.ohlcv, Fundamental.income_statement, Insights.ranking, Macro.gdp) in sandbox on 2026-05-18.
     - Caveat: TCBS provider not tested; behavior may differ.
   - [home-env-for-api-key] vnstock_data 3.1.8 resolves `api_key.json` via `Path.home() / ".vnstock" / "api_key.json"`, so `os.environ["HOME"]` must point at `product/api` before importing vnstock_data.
     - Context: Capability scripts in product/api now set HOME explicitly before import.
     - Caveat: If HOME is left at the shell user's home, vnstock_data raises "Không tìm thấy thông tin người dùng hợp lệ" (vendor-side, looks like an auth failure but is actually a missing-config failure).
   ```

5. **Create companion install file for assertion E.**
   Create `records/evidence/vnstock-data/install-vendor-compat-archived-20260518.md`:
   ```yaml
   ---
   record_type: evidence
   capability: vnstock-data
   dimension: install
   scope: sandbox
   validation_status: passed
   claim_support: supports
   created: "2026-05-18T00:30:00+07:00"
   ---
   ```
   ```markdown
   # Vendor Compat Archived — vnstock-data — 20260518

   ## Findings

   - [vendor-compat-archived] The `product/api/src/vendor_compat/` module is no longer required for vnstock_data >= 3.1.8 and is archived.
     - Context: Direct import of vnstock_data without vendor_compat patching now succeeds.
   ```

6. **Run extraction tool.**
   ```bash
   pnpm extract:index
   ```
   Tool should produce 5 index entries. Expect hard-stop on supersession detection for assertion B vs C — confirm when prompted.

## Success Criteria

- [ ] `runtime-403-fix-20260511.md` has `## Findings` with `[device-id-injection-required]` bullet.
- [ ] `wrapper-config-path-fix-20260511.md` created with correct frontmatter and `## Findings`.
- [ ] `capability-revalidation-20260518.md` has backfilled frontmatter and `## Findings` with 2 bullets.
- [ ] `install-vendor-compat-archived-20260518.md` created with correct frontmatter and `## Findings`.
- [ ] `pnpm extract:index` produces 5 index entries in `records/index/`.
- [ ] Supersession pair correct: `device-id-injection-required` → `status: superseded`, `device-id-injection-not-required` → `status: active`.
- [ ] `pnpm check` passes (all index entries validate against schema).

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Evidence frontmatter backfill introduces wrong values | Cross-check against sibling evidence files and claim verification block |
| Cross-dimension assertion E triggers extraction error | Pre-emptively split into companion install file before running tool |
| Experiment refs in index entries are empty | Acceptable for prototype seed; experiment_refs are optional for state queries |

## Next Steps

After this phase completes and `pnpm check` passes, proceed to Phase 2 (Seed 2 migration).