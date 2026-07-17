// Re-export shim for the canonical patch-hints helper at `#lib/patch-hints.js`
// (which lives at `tools/lib/patch-hints.js`, OUTSIDE fallow's analysis root
// of `tools/learning-loop-mastra/`).
//
// Why this shim lives inside `tools/learning-loop-mastra/tools/lib/`:
// fallow's dead-code and unresolved-import detectors scope analysis to its
// `root:` and do not follow `#lib/*` npm-import aliases that resolve outside
// that root. Without a same-named file inside fallow's root, the
// `#lib/patch-hints.js` imports in meta-state-patch-tool.js and
// meta-state-batch-tool.js would be flagged as unresolved, AND the helper
// file itself would be flagged as a dead leaf (no entry point can reach it).
// Re-exporting from a file INSIDE fallow's root lets fallow see the helper
// as reachable through the handlers that import it.
//
// Pattern mirrors tools/learning-loop-mastra/tools/lib/gate-logging.js,
// which has the same shape for the same reason.

import { listMutableFieldsCsv } from "#lib/patch-hints.js";
export { listMutableFieldsCsv };