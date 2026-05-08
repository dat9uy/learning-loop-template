# Secret Injection Class

## Observation

The vnstock install rerun needs an API key without exposing the value to agent context. The prior install experiment disproved the flag-driven contract and found that the installer reads `VNSTOCK_API_KEY` from the process environment.

## Evidence

- `local:records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`
- `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`

## Proposed Class Label

`api-key-via-shell-env-var`

Use this as the `secret_injection_class` value on runtime or install experiment evidence when the operator injects an API key through their shell before the agent process starts.

## Rationale

The operator performs the secret-handling step. The agent can verify presence with a non-echoing check but must never read, print, log, or retain the value. This keeps the secret in disposable execution substrate while the repo stores only durable metadata evidence.

## Trigger

- Event class: next-install-experiment or next-runtime-experiment requiring secrets
- Threshold: N=2
- Action when triggered: reuse `api-key-via-shell-env-var` if the same mechanism applies. If a different mechanism is required, capture a new meta-evidence file before running the proof.

## Deferral

Do not canonize a full secret-injection taxonomy or schema field from this single case. Revisit after at least two secret-bearing runtime or install experiments.
