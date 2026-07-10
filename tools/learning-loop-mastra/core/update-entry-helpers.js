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
 * Plan 260711-0030 Phase 3: success-path returns `{ok: true, entry}` after
 * re-reading the registry. The re-read asserts the entry is visible (otherwise
 * the persistence path silently dropped the write — T4/T5 silent-persistence-fail
 * class). Backward-compatible: existing callers that destructure `{ok}` still
 * work; new callers can use `entry` to observe the actual persisted shape.
 *
 * @param {string} root — project root containing meta-state.jsonl
 * @param {string} id — entry id
 * @param {object} patch — patch object passed verbatim to updateEntry
 * @param {string} toolName — used in the unexpected-throw error message
 * @returns {Promise<{ok: true, entry} | {ok: false, reason: "version_mismatch", current_version: number}>}
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
  // Post-write visibility re-read (Plan 260711-0030 Phase 3). If the entry
  // isn't visible, the persistence path silently dropped the write — return
  // a structured failure the caller can map to a wire result.
  const fresh = readRegistry(root).find((e) => e.id === id);
  if (!fresh) {
    return { ok: false, reason: "write_not_visible", id };
  }
  return { ok: true, entry: fresh };
}

/**
 * Thrown when a tool writes an entry (via writeEntry, not updateEntry) and the
 * subsequent re-read fails to find it. Plan 260711-0030 Phase 3 — closes the
 * silent-persistence-fail class for tools that use writeEntry (e.g. log_change).
 */
export class WriteNotVisibleError extends Error {
  constructor(toolName, id) {
    super(`${toolName}: write succeeded but entry ${id} not visible in registry`);
    this.code = "WRITE_NOT_VISIBLE";
    this.toolName = toolName;
    this.id = id;
  }
}

/**
 * Re-read the registry and assert the entry is visible. Returns the entry
 * on success, throws WriteNotVisibleError on failure.
 *
 * Plan 260711-0030 Phase 3: closes T4 (log_change silent-persistence-fail).
 */
export async function assertWriteVisible(root, id, toolName) {
  const { readRegistry } = await import("./meta-state.js");
  const fresh = readRegistry(root).find((e) => e.id === id);
  if (!fresh) {
    throw new WriteNotVisibleError(toolName, id);
  }
  return fresh;
}