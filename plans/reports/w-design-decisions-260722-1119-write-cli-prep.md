# Write-capable CLI preparation decisions

## Self-footgun result

The current promotion path **does not reject a gate regex that matches the CLI transport itself**:

- `meta-state-promote-rule-tool.js:114-211` checks regex safety and rule validity, then persists the active rule; it has no transport-self-match guard.
- `gate-logic.js:961-1015` applies active regex rules to Bash commands and returns `decision: "escalate"` on a match.
- `evaluate-bash-gate.js:100-105` immediately returns that promoted-rule escalation.
- `cli-self-footgun-guard.test.js` promotes a regex matching `node tools/learning-loop-mastra/bin/loop.mjs`, then proves the CLI command is intercepted.

This is not reachable through the read-only CLI shipped by R because mutation tools are not exposed there. It is a boundary condition for the write-capable follow-on.

## Recommendations for W

| Question | Recommendation | Status / rationale |
|---|---|---|
| Tool-set boundary | Carry all handler-module mutation tools **after** adding a promotion-path self-match guard. If W does not add that guard, keep `meta_state_promote_rule` MCP-only. | Operator confirms at W-plan time. All other portable handlers close the split transport with little new mechanism. |
| Dispatch commit stage | Expose `prepare` through CLI; retain `commit` on MCP. | `commit` invokes GitHub through `gh`; avoid adding that subprocess/network dependency to the CLI. |
| `update_r2_allowlist` | Keep MCP-only. | It is an operator-only implementation embedded in `mastra/server.js`, not a handler module. Extract only when a concrete CLI requirement appears. |
| Write-denial exit code | Exit 1. | A denied or invalid write is a handler-layer rejection. Keep exit 2 for usage and caller-configuration errors. |
| Self-footgun | Unguarded today. Prefer rejecting a promoted gate regex that matches canonical CLI invocation shapes. | Locked by `cli-self-footgun-guard.test.js`; W must either add the guard and update the lock or exclude promotion from its CLI tool set. |
| `--schema` | Defer to W. | Pull-on-demand schema is preferable to pushing argument sketches into SessionStart context; R's read arguments do not justify the feature. |
| Dogfood runtime | Reuse `.claude`. | Extends the same evidence stream that R starts. Operator confirms when W is approved. |

## W planning gate

W remains a separate plan. Draft it only after `.claude` has accrued read-path T2 evidence from R and the operator confirms the tool boundary and dogfood choice above.
