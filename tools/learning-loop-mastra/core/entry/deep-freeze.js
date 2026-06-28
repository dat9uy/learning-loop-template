/**
 * Deep-freeze: Object.freeze is shallow; nested objects in Zod-parsed data
 * (e.g., data.verification, data.change_diff) remain mutable.
 * Recursively freeze to enforce the "frozen factory outputs" contract.
 */
export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((v) => deepFreeze(v, seen));
  return Object.freeze(value);
}
