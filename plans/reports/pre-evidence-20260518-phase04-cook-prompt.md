# Pre-Evidence: Phase-04 Cook Prompt Predictions

**Date:** 2026-05-18
**Purpose:** Document what we believe will work and why BEFORE execution. If the fresh-agent run fails, this is the baseline for gap analysis — not the agent's memory or prior context.

---

## Prompt Under Test

The `/ck:cook` prompt for Phase-04 re-validation (see session transcript for full text).

## What We Predict Will Work (and Why)

### Step 0: Prerequisite verification
**Prediction:** `pnpm check:budget` will exit 0 after operator updates YAML.
**Confidence:** 95%
**Reasoning:** The tool reads `observation-vnstock-resource-budget.yaml`, computes `budget - current`. If operator sets `current: 0`, remaining = 1, exit 0.
**Risk:** Operator misconfigures YAML (wrong field, typo, stale timestamp). Low risk — fields are simple.

### Step 1: Observation file update
**Prediction:** Agent can write to `observation-sandbox-cleanup-sudo-requirement.yaml`.
**Confidence:** 90%
**Reasoning:** The write-coordination-gate checks file patterns against a forbidlist, not observation files. This file is in `records/observations/` which is not gated.
**Risk:** The write hook might have changed since last check. Medium-low risk.

### Step 2: `pnpm bootstrap:api`
**Prediction:** Will succeed — `uv sync` + `install-vnstock.sh` + vendor installer download + device registration.
**Confidence:** 75%
**Reasoning:**
- `.vnstock` removed by operator → stale guard (line 183-184) won't fire
- Budget passes → gate allows `pnpm bootstrap:api` (matches `package-manager`, not `side-effect-import`)
- `uv sync` installs Python deps from pyproject.toml
- `install-vnstock.sh` downloads `.run` installer from vnstocks.com, registers device, installs vnstock_data

**Risks (ordered by likelihood):**
1. **VNSTOCK_API_KEY not set** — installer requires it (line ~50 of script). If env var missing, installer fails. We haven't verified it's in the environment.
2. **Network/vendor API failure** — installer downloads from vnstocks.com. Transient failure possible.
3. **`.venv` permission issue** — `.venv` was root-owned from Docker. Operator ran `sudo rm -rf .vnstock` but may not have fixed `.venv` ownership. `uv sync` could fail with Permission denied.
4. **Device registration fails** — vendor might reject the fingerprint or have rate limits.

### Step 3: `find_spec` check
**Prediction:** Will show `vnstock_data` installed in site-packages.
**Confidence:** 85% (depends on Step 2 succeeding)
**Reasoning:** `find_spec` doesn't import — no side effects. If `uv sync` + installer succeeded, the package will be in `.venv/lib/python*/site-packages/`.
**Risk:** Only fails if Step 2 fails.

### Step 4: Capability scripts
**Prediction:** At least 3/5 will pass. Unknown: whether all 5 pass.
**Confidence:** 60%
**Reasoning:** These scripts hit the vendor API (vnstocks.com). They worked in the previous validation (`experiment-vnstock-capabilities-20260509T174957Z`, result: supports). But:
- New device ID might have different permissions
- Vendor API might have changed since May 9
- Auth cache was cleared — scripts might need fresh auth

**Risks:**
1. **Vendor API returns 403/401** — new device not yet authorized
2. **API endpoint changed** — scripts hardcode URLs
3. **Rate limiting** — 5 rapid API calls might trigger throttling
4. **Empty DataFrame** — API returns data but format changed

### Step 5-6: Evidence + plan update
**Prediction:** Straightforward file writes.
**Confidence:** 95%
**Risk:** Directory `records/evidence/vnstock-data/` might not exist. Minor — agent can create it.

### Step 7-8: Report + validation
**Prediction:** `pnpm check` and gate tests pass.
**Confidence:** 90%
**Reasoning:** We just ran all 109 tests. Unless the agent's changes break something, tests should pass.
**Risk:** Agent might modify a file that breaks the gate. Low risk — prompt is specific about what to edit.

---

## Assumptions We're Making (Not Verified)

| # | Assumption | Verified? | Risk if Wrong |
|---|-----------|-----------|---------------|
| 1 | Operator ran `sudo rm -rf product/api/.vnstock` | No — agent can't verify sudo ops | Stale guard fires, Step 2 fails |
| 2 | Operator updated budget YAML to `current: 0` | No — fresh agent checks in Step 0 | Budget check fails, agent stops |
| 3 | `VNSTOCK_API_KEY` is set in the environment | No — not checked | Installer fails at auth step |
| 4 | `.venv` is writable after Docker cleanup | No — only checked it exists | `uv sync` fails with Permission denied |
| 5 | Vendor API endpoints haven't changed since May 9 | No — scripts last ran May 9 | Capability scripts fail |
| 6 | Device fingerprint is still valid after clear | No — vendor behavior unpredictable | Registration might fail or create duplicate |
| 7 | `install-vnstock.sh` --force not needed | No — assumed .vnstock removal is sufficient | Script might have other .vnstock checks |

---

## Bias Vectors (What Fresh Agent Won't Know)

The fresh agent lacks all context from this session. It will:

1. **Not know about the 3-constraint deadlock** that blocked Phase-04 originally. It just follows the prompt.
2. **Not know about gate-v2 fixes.** If the gate behaves unexpectedly, the agent won't have the mental model to diagnose.
3. **Not know about `observation-vnstock-import-reactivates-cleared-device`.** If `import vnstock_data` somehow runs (inside a script), the agent won't know to check for device reactivation.
4. **Not know the `.venv` was root-owned.** If permission errors occur, the agent might try workarounds instead of recognizing the Docker HOME leak pattern.
5. **Not know the vendor's soft-delete behavior.** If the device shows 2 registrations after bootstrap, the agent won't know this is expected (old device reactivated).

**Mitigation:** The prompt includes explicit STOP conditions and forbidden actions. If the agent hits a wall, it should report rather than workaround.

---

## Failure Reflection Template

If the run fails, use this to analyze gaps:

```
## Failure Analysis

**Step that failed:** [step number]
**Error:** [what happened]
**Pre-evidence prediction:** [what we predicted]
**Pre-evidence confidence:** [percentage]
**Gap:** [what we missed in our reasoning]
**Root cause:** [why the prediction was wrong]
**Fix:** [what to change in the prompt/infrastructure]
```

---

## Unresolved Questions

1. Is `VNSTOCK_API_KEY` in the environment? (Assumption #3)
2. Is `.venv` writable or does it need `sudo chown`? (Assumption #4)
3. Will the vendor API accept a new device registration from the same fingerprint? (Assumption #6)
