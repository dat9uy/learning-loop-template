---
capability: meta
dimension: static
scope: meta-tooling
validation_status: draft
---

# Secret Injection Class

## Findings

- [secret-injection-class] Proposed class label `api-key-via-shell-env-var` for runtime/install experiments requiring API keys.
- [api-key-env-var] Operator injects secret through shell before agent process starts; agent verifies presence with non-echoing check only.
- [agent-restriction] Agent must never read, print, log, or retain secret value.
- [substrate-model] Secret stays in disposable execution substrate; repo stores only durable metadata evidence.
- [trigger-threshold] Revisit after N=2 secret-bearing experiments; do not canonize full taxonomy from single case.

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
