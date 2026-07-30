/**
 * Thin re-export of `parseConsolidates` from `relationship-graph.js`.
 *
 * Plan 260730-0240 (red-team R10): the body is folded into
 * `core/entry/relationship-graph.js` (the canonical single source of truth).
 * This file is kept as a thin re-export for rollback safety — reverting an
 * earlier factory-migration commit would otherwise break imports. A hard
 * delete of this file would create a rollback hole; defer the actual
 * deletion to a separate stable PR.
 *
 * Original parser semantics (preserved): canonical form is
 * `z.array(z.string())`; the legacy CSV-string form is tolerated for
 * in-flight processes that read pre-migration data.
 */

export { parseConsolidates } from "./relationship-graph.js";