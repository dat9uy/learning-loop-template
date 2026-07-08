# Prompt Blueprints — State Gated

Use these templates when a learning-loop task involves external systems with irreversible state and budget gating applies.

MCP tool: `workflow_prepare_runtime_request` generates structured approval requests from these templates mechanically.

Replace bracketed text. Remove sections that do not apply.

## BLOCKED Signal

Return this instead of a prompt when `pnpm check:budget` returns exit code 1 (budget exhausted).

```text
BLOCKED: Budget exhausted for {external_system}/{resource}.

Current state: {current}/{budget} consumed.
Last verified: {last_verified}.

Operator action required:
- Clear or reset the external resource.
- Update runtime-state.jsonl budget-state entry:
  - Set `value` to reflect actual consumption.
  - Update `timestamp` with the current timestamp.
- Re-run the request after the budget entry is updated.

Do not proceed with any state-changing actions for this system/resource.
```

## DEFERRED Signal

Return this instead of a prompt when `validation_window.active` is true.

```text
DEFERRED: Validation window is active for {external_system}/{resource}.

Window opened: {opened_at}.
Reason: {reason}.

Operator action required:
- Complete the validation or confirmation process.
- Close the validation window in runtime-state.jsonl budget-state entry:
  - Set `validation_window.active` to false.
  - Set `validation_window.closed_at` to the current timestamp.
- Re-run the request after the window is closed.

No state-changing actions are permitted while the validation window is open.
```

## WARNING Signal

Return this before a prompt when `stale` is true (budget data older than 7 days).

```text
WARNING: Budget data for {external_system}/{resource} is stale ({days} days old).

Last verified: {last_verified}.
Current state: {current}/{budget}.

Operator confirmation required before proceeding:
- Confirm the external system state matches the budget entry.
- Update `timestamp` in runtime-state.jsonl budget-state entry if confirmed.
- If the state has changed, update `value` before proceeding.

If the operator confirms, the constrained prompt below applies.
```

## Constrained Prompt Template

Use this as the base prompt when budget is available. Embed the budget section after the standard prompt header.

```text
Task: [specific learning-loop task].

Work context: [absolute path to this repo]
Reports: [absolute path to this repo]/plans/reports/
Plans: [absolute path to this repo]/plans/

Read first:
- README.md
- docs/operator-guide.md
- docs/artifact-concepts.md
- [task-specific docs/records]

---
BUDGET CONTEXT (hard constraints)
---
External system: {system}
Resource: {resource}
Budget: {current}/{budget} consumed, {remaining} remaining.
Last verified: {last_verified}.

Hard-stop rules:
- ANY check failure on a budget-consuming action = STOP (not fix-and-retry).
- After this action, report result and wait for operator confirmation.
- Operator must update runtime-state.jsonl budget-state entry after this action.
- Do not proceed to the next budget-consuming action until the budget entry is updated.

---
GOAL
---
[desired outcome]

Allowed sources:
- [local docs, records, evidence]

Forbidden sources/actions:
- Do not copy implementation from historical repos.
- Do not read secrets or private config unless separately approved.
- Do not capture raw external data, private artifacts, caches, logs, or temp files.
- Do not create product code or product approval changes unless explicitly approved.
- Do not proceed if budget is exhausted or validation window is active.

Evidence policy:
- Capture only [metadata/classes].
- Cite durable local evidence with `local:records/evidence/...`.
- Cite records with `record:<id>`.
- Keep meta evidence under `records/evidence/meta/` if this task improves the loop itself.

Expected artifact changes:
- [files to update or create]

Validation:
- Run `pnpm validate:records`.
- Run `pnpm check`.
- Run `pnpm check:budget -- --system {system} --resource {resource}` before any state-changing action.
- For runtime request preparation, use `workflow_prepare_runtime_request`.
- For gate checks, use `gate_check`.

Report:
- What changed.
- What evidence supports it.
- What remains blocked.
- Budget consumption result (if applicable).
- Any unresolved questions.

Stop and ask before proceeding if the task requires authority beyond this prompt, secret/config access, raw data capture, temp artifact retention, product approval without a decision, or budget has been exhausted.
```
