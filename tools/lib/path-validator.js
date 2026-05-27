import { resolve, sep } from "node:path";

/**
 * Validate that a relative path, when resolved from a given root,
 * does not escape the root directory (path traversal guard).
 * @param {string} root — absolute base directory
 * @param {string} relative — relative path from root
 * @returns {string} resolved absolute path
 * @throws if path escapes root or is absolute
 */
export function safePath(root, relative) {
  if (!root || typeof root !== "string") {
    throw new Error("safePath: root must be a non-empty string");
  }
  if (!relative || typeof relative !== "string") {
    throw new Error("safePath: relative must be a non-empty string");
  }
  if (relative.startsWith("/") || relative.startsWith("\\")) {
    throw new Error("safePath: relative path must not be absolute");
  }
  const resolved = resolve(root, relative);
  const rootResolved = resolve(root);
  const isInside = resolved === rootResolved || resolved.startsWith(rootResolved + sep);
  if (!isInside) {
    throw new Error(`safePath: path "${relative}" escapes root directory`);
  }
  return resolved;
}
