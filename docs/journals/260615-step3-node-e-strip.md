# Step 3: bash-gate node -e body strip

Shipped `stripNodeEvalBody` in `tools/learning-loop-mcp/core/gate-logic.js` as Step 3 of the cross-report planning order.

Design: asymmetric strip. Only `node -e|--eval|-p|--print` bodies are blanked before constraint-pattern regex matching. `python -c`, `bash -c`, `ruby -e`, `perl -e`, `sh -c` are left untouched because their bodies are real commands — the existing wrapper-command tests and two new regression guards lock this in.

TDD: 6 new tests land RED first.
- `gate-logic-quoted-strings.test.js`: 3 node-e body cases (docker, sudo, package-manager bypass) + 2 regression guards for python-c/bash-c.
- `gate-promoted-rules.test.js`: 1 G8-style integration test pinning `applyPromotedRules` with `rule-no-new-artifact-types`.

Bypass risk accepted: `node -e "require('child_process').exec('npm install')"` no longer matches the `package-manager` constraint because the body is blanked. This is documented in finding `meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc` and caught by Step 2's `gate_check_recurrence` MCP tool if the pattern recurs N>=3 times in M<=10min.

Cross-plan status: Step 1 and Step 2 shipped 2026-06-15. Step 3 ships now. Step 4 (runtime-agnostic rule Phases 2-5) is the remaining work.

Change-log: `meta-260615T1921Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody`.
