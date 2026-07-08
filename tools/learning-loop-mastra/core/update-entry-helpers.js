/**
 * Shared helper for tools that call `updateEntry` and need a uniform
 * "version_mismatch / unexpected / ok" outcome. The success log shape and
 * the success-side result construction differ per tool (re-verify stamps
 * `last_verified_at`, supersede stamps `superseded_at`/`consolidated_into`),
 * but the failure handling is identical: `version_mismatch` returns a tagged
 * outcome carrying the current registry version (so the caller can include it
 * in the tool's wire result), and any other non-`true` return is a bug.
 *
 * Phase 4: extracted from the inline duplication in
 * `meta-state-re-verify-tool.js` and `meta-state-supersede-tool.js` (15-line
 * dup `c6f32007` flagged by fallow).
 *
 * @param {string} root — project root containing meta-state.jsonl
 * @param {string} id — entry id
 * @param {object} patch — patch object passed verbatim to updateEntry
 * @param {string} toolName — used in the unexpected-throw error message
 * @returns {Promise<{ok: true} | {ok: false, reason: "version_mismatch", current_version: number}>}
 */
export async function applyUpdateAndCheck(root, id, patch, toolName) {
  const { updateEntry, readRegistry } = await import("./meta-state.js");
  const updateResult = await updateEntry(root, id, patch);
  if (updateResult === "version_mismatch") {
    const fresh = readRegistry(root).find((e) => e.id === id);
    return { ok: false, reason: "version_mismatch", current_version: fresh?.version ?? 0 };
  }
  if (updateResult !== true) {
    throw new Error(
      `${toolName}: unexpected updateEntry result for ${id}: ${JSON.stringify(updateResult)}`
    );
  }
  return { ok: true };
}
