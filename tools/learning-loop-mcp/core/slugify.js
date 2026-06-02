/**
 * Slugify a string for use in entry IDs.
 * Lowercase, replace non-alphanumeric with hyphens, truncate to 60 chars, trim hyphens.
 */
export function slugify(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}
