/**
 * Shared field-glossary description helper for tool schemas.
 *
 * Tool schemas keep their invocation-critical shape and constraints while
 * repeated entry-field prose lives in the field glossary. Pointing a schema
 * node at the glossary with `describeField` keeps descriptions to a compact
 * ref instead of duplicating the meaning inline.
 *
 * NOTE: this is only safe for entry fields whose prose duplicates the
 * glossary entry's `meaning` (entry-field semantics). Filter/query/op-input
 * parameters that merely share a name with a glossary key carry tool-specific
 * behavior the glossary does not capture — never use this helper for those.
 */
export function describeField(field, schema) {
  return schema.describe(`See field_glossary.${field}`);
}
