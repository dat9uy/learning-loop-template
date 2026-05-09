# Journal: vnstock Device-Limit Record Layer

**Date:** 2026-05-09
**Related plan:** `plans/260509-1353-vnstock-device-limit-investigation/plan.md`

## Summary

Executed the record-layer parts of the vnstock device-limit investigation plan.

## Outcome

The original single install experiment YAML was renamed to the run-1 timestamped record. A separate run-2 experiment record now captures the env-var installer path blocked by the vendor device-limit gate.

The install claim now cites run-2 evidence. A device-limit mechanism claim and an operator-owned clearance decision were added. The operator later confirmed external device clearance in-band. Phase 3 remains blocked because `VNSTOCK_API_KEY` is not present in the inherited agent environment; the agent must not log into the vendor account, perform clearance, capture credentials, or capture the account device list.

## Validation

`pnpm check` passes and validates 8 records.

## Follow-Up

Relaunch or invoke the agent from the same shell that exports `VNSTOCK_API_KEY`, without printing or pasting the key, before Phase 3 can run the 2-sandbox falsification experiment.

Unresolved questions:

- Can the next agent process inherit `VNSTOCK_API_KEY` from the operator shell?
