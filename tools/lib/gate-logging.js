// `#lib/gate-logging.js` resolves here. The canonical implementation lives in
// `core/gate-logging.js`; this re-export keeps the ~25 shell-side `#lib/`-aliased
// importers working after the helpers moved into core (core no longer imports
// `tools/lib` — the core one-way dependency is restored).
export { appendGateLog, logToolCall } from "../learning-loop-mastra/core/gate-logging.js";