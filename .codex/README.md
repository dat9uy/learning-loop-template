# Codex runtime adapter

Codex owns this surface. `hooks/session-start-i2-delivery.cjs` translates its
native synchronous `SessionStart` command input into the Core I2 Rule Delivery
result and emits Codex's native `hookSpecificOutput.additionalContext` envelope.

The adapter is fail-open: malformed event input, inactive wiring, or a degraded
delivery is visible in startup context and logged through the shared Rule Delivery
logger. It emits every Core delivery partition without declaring a local native
context cap, so the adapter itself cannot truncate the compiled projection.
Claude Code and Hermes runtime surfaces are intentionally not configured here.
