/**
 * validateR2AllowlistShape — pure schema validator for the R2 per-runtime
 * write allowlist (`.loop/r2-allowlist.json`, the `r2-allowlist/v1` shape).
 *
 * Throws `r2_allowlist_invalid` on any shape violation; returns nothing on
 * success. Called by the operator-only `update_r2_allowlist` tool BEFORE the
 * atomic temp+rename write, so a malformed allowlist never reaches disk.
 *
 * Extracted from `mastra/server.js` (where it lived as a local function) into
 * its own module so it can be unit-tested in isolation: `server.js` runs a
 * top-level `await server.startStdio()` side effect that makes a direct import
 * untestable. The function is pure (no I/O, no module state), so the move is
 * behavior-preserving.
 */

export function validateR2AllowlistShape(parsed) {
  if (!parsed || typeof parsed !== "object") throw new Error("r2_allowlist_invalid: root must be an object");
  if (parsed.schema !== "r2-allowlist/v1") throw new Error('r2_allowlist_invalid: schema must be "r2-allowlist/v1"');
  if (typeof parsed.version !== "number") throw new Error("r2_allowlist_invalid: version must be a number");
  for (const runtime of ["claude-code", "droid", "mastra-code"]) {
    const entry = parsed[runtime];
    if (!entry || typeof entry !== "object") throw new Error(`r2_allowlist_invalid: missing runtime "${runtime}"`);
    if (!Array.isArray(entry.own)) throw new Error(`r2_allowlist_invalid: ${runtime}.own must be an array`);
    if (!Array.isArray(entry.deny)) throw new Error(`r2_allowlist_invalid: ${runtime}.deny must be an array`);
  }
  if (!Array.isArray(parsed.universal)) throw new Error("r2_allowlist_invalid: universal must be an array");
}