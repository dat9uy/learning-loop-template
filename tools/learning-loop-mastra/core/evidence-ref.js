/**
 * Normalize documented evidence-code reference suffixes to a file path.
 * Shared by Rule compilation and the existing finding grounding paths.
 */
export function stripEvidenceAnchor(codeRef) {
  if (typeof codeRef !== "string") return codeRef;
  // Strip #anchor first so path:start-end#symbol becomes path:start-end.
  let stripped = codeRef.replace(/#[\w$.\s-]+$/, "");
  // Strip :line or :start-end (digits only, preserving Windows drive letters).
  stripped = stripped.replace(/:\d+(?:-\d+)?$/, "");
  // Strip dotted JSON key-path suffixes, not a single colon-delimited token.
  return stripped.replace(/:[\w-]+(?:\.[\w-]+)+$/, "");
}
