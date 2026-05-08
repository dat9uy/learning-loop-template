# Journal: vnstock Install Blocked Experiment

**Date:** 2026-05-08
**Related plan:** `plans/260508-1545-vnstock-install-knowledge-encoding/plan.md`

## Summary

Executed the vnstock install knowledge-encoding plan in auto mode. The initial setup records were created successfully, but the sandbox install experiment did not verify the planned install method.

## Outcome

The downloaded artifact is a Makeself archive and passed archive integrity checks. The planned archive-wrapper flags were not exposed, and passing them to the wrapper failed. Extracting the archive showed a Python installer entrypoint that uses environment variables such as `VNSTOCK_API_KEY` and `VNSTOCK_VENV_PATH`, not the prior `~/.vnstock/user.json` assumption.

Because the experiment did not support the install claim, the claim remains unverified and the `vnstock-data` knowledge pack remains draft with empty facts and capabilities.

## Validation

`pnpm check` passes and validates 5 records. This confirms repository schema/reference validity, not publication readiness for the draft pack.

## Follow-Up

Prove a corrected install path in a new approved sandbox experiment before promoting the claim or publishing an install capability.
