# Phase 1: inbound-gate emission collapse implementation

## Context

- Plan: `plans/260709-0450-inbound-gate-emission-collapse/plan.md`
- Finding: `meta-260708T2338Z`
- Core: `tools/learning-loop-mastra/core/evaluate-inbound-gate.js` (82 lines)
- Hook: `tools/learning-loop-mastra/hooks/universal/inbound-gate.js` (60 lines; `writeOperatorMessageMarker` uses `writeToAllSurfaces(root, ".last-operator-message", …)`)
- Tests: `.claude/coordination/__tests__/inbound-state-gate.test.cjs` (L104 `contextWasInjected` checks `additionalContext != null`; L251 checks `.includes('INBOUND STATE GATE')`)

## Requirements

1. Dedup stale ids.
2. Group by `affected_system`; first emission = surface list + count + pointer (not raw ids).
3. Suppression = signature-keyed 30-min window: repeat same-signature within window → one-line "already surfaced" pointer.
4. Changed signature (stale set changed) → re-emit full pointer.
5. Preserve `INBOUND STATE GATE` header + non-null `additionalContext`.
6. Marker behavior unchanged.

## Steps

1. `evaluate-inbound-gate.js`:
   - Add `groupStaleBySurface(stale)` → `string` like `"vnstock (3), fastapi (1)"`, grouped by `o.affected_system || "other"`, sorted by surface name.
   - Add `staleSignature(stale)` → sorted unique ids joined by `","` (stable key).
   - Rewrite `buildContextMessage(stale, { alreadySurfaced })`:
     - Header line `INBOUND STATE GATE: …` preserved (test L251).
     - Keep the "→ READ `meta-state.jsonl` FIRST (last 20 lines)…" guidance line.
     - If `alreadySurfaced`: "N stale active observations already surfaced this session (surfaces: …); review via `meta_state_list` / `runtime_state_read`. Inline list suppressed (already surfaced this session)."
     - Else: "N stale active observations detected (surfaces: …); review via `meta_state_list` / `runtime_state_read`."
     - No raw id list in either branch.
     - Keep the "Before proceeding, update affected observations via record_observation MCP tool." + "Do NOT assume external state matches observation records — verify first." tail.
   - `evaluateInboundGate({ prompt, root, priorSignature, now })` — add `priorSignature` (from token) + `now` (injectable for tests; default `Date.now()`).
   - `evaluateStateChangeWarning(prompt, root, priorSignature, now)`:
     - stale = loadStaleActiveObservations; currentSignature = staleSignature(stale).
     - alreadySurfaced = priorSignature != null && priorSignature === currentSignature (window check lives in the hook, which has the token ts; OR put the window here if `now` + token ts passed). **Decision:** pass the token's `ts` too and do the window check in core (policy in core): `alreadySurfaced = priorSignature === currentSignature && (now - priorTs) < SUPPRESS_WINDOW_MS`.
     - Return `warnDecision(stale, alreadySurfaced, currentSignature)`.
   - `warnDecision(stale, alreadySurfaced, signature)` → `{ decision:"warn", context_message, observations_stale: uniqueIds, stale_signature: signature }`.
   - Export `SUPPRESS_WINDOW_MS` (default 30 * 60 * 1000) so tests can pin/override.
2. `hooks/universal/inbound-gate.js`:
   - Import `readFromAllSurfaces`, `writeToAllSurfaces` from `../../core/surfaces.js`.
   - Before `evaluateInboundGate`: read token `.inbound-stale-surfaced` via `readFromAllSurfaces(root, ".inbound-stale-surfaced", {first:true})` → `parsed` `{signature, ts}`. priorSignature = parsed?.signature; priorTs = parsed?.ts.
   - `decision = evaluateInboundGate({ prompt, root, priorSignature, priorTs })`.
   - On warn: write token `{ signature: decision.stale_signature, ts: Date.now().toISOString() }` via `writeToAllSurfaces(root, ".inbound-stale-surfaced", JSON.stringify(...))`; then `writeOperatorMessageMarker`; then `formatSoftWarning(decision.context_message)`.
3. Tests `.claude/coordination/__tests__/inbound-state-gate.test.cjs`:
   - Keep L251 header assertion; keep `contextWasInjected` semantics.
   - Add: two stale obs with the same id → output id appears once / not repeated (dedup).
   - Add: repeat call with token present + same signature + within window → output `includes('already surfaced')`.
   - Add: surface-list pointer → output `includes('surfaces:')` + a count.
   - Add: changed signature (new stale id) → re-emits full pointer (not "already surfaced").

## Tests / validation

- `node .claude/coordination/__tests__/inbound-state-gate.test.cjs` (or the repo's test runner).
- Manual: simulate two state-change prompts with a stale runtime-state.jsonl; confirm second emission is the one-line pointer.

## Rec 12 change-logs (in-PR)

- `core/evaluate-inbound-gate.js`: `change_dimension: "semantic"`, target = the file, `change_diff: { changed: ["buildContextMessage", "warnDecision", "evaluateStateChangeWarning"] }`, reason: "Collapse inbound-gate inline stale dump to a deduped, surface-scoped, rate-limited pointer (meta-260708T2338Z)."
- `hooks/universal/inbound-gate.js`: same dimension, target = the hook, `change_diff: { changed: ["session-token read/write", "alreadySurfaced threading"] }`, reason matching.
- SessionStart hook: target = the hook, `change_diff: { added: [".inbound-stale-surfaced clear"] }`, reason matching.

## Risks / rollback

- Token-keyed-by-signature prevents suppressing a changed set. Rollback = `git revert` (change-logs in-PR).