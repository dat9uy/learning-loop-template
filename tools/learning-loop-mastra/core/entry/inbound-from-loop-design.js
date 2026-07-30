/**
 * Thin re-export of `inboundFromLoopDesign` from `relationship-graph.js`.
 *
 * Plan 260730-0240 (red-team R10): the body is folded into
 * `core/entry/relationship-graph.js` (the canonical single source of truth).
 * This file is kept as a thin re-export for rollback safety — reverting an
 * earlier factory-migration commit would otherwise break imports. A hard
 * delete of this file would create a rollback hole; defer the actual
 * deletion to a separate stable PR.
 *
 * Original semantics (preserved): returns the loop-design refs (`addresses`,
 * `proposed_design_for`) that point at the parsed entry. The dispatcher's
 * outer loop flattens via spread.
 */

export { inboundFromLoopDesign } from "./relationship-graph.js";