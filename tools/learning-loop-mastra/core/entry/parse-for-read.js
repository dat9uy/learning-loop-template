/**
 * Read-tolerant schema parse for entry factories.
 *
 * `status: "archived"` is a runtime tombstone applied by `archiveEntry`
 * directly (see core/meta-state.js: "archived lives outside the enum because
 * it is applied by archiveEntry"). The per-kind write schemas deliberately
 * exclude "archived" from their status enum, so re-parsing an archived row
 * through `schema.parse` throws — which crashes every read path that builds
 * a factory from a projected (max-version) entry: `meta_state_relationships`,
 * `validateCrossRefs`, `outboundRefsAll`.
 *
 * This helper tolerates the runtime "archived" overlay on read: strip it
 * before parse (the schema applies its default/optional status), then restore
 * the on-disk value so the factory's read view is honest. Any other status
 * value still flows through the schema's enum validation unchanged, so the
 * enum's corruption check is preserved for non-archived rows.
 *
 * @param {import("zod").ZodType} schema — per-kind write schema
 * @param {object} data — raw on-disk entry
 * @returns {object} parsed entry (with status restored when it was "archived")
 */
export function parseForRead(schema, data) {
  if (data?.status !== "archived") return schema.parse(data);
  const { status, ...rest } = data;
  const parsed = schema.parse(rest);
  return { ...parsed, status };
}
