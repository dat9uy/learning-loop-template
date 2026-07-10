import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const DEFAULT_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * Resolve project root. Override via GATE_ROOT env var for testing.
 *
 * Plan 260711-0030 Phase 1 (Red-team Finding 5 — TOCTOU on resolveRoot):
 * when GATE_ROOT is set, restrict accepted paths to two canonical shapes:
 *   1. The project root itself (DEFAULT_ROOT).
 *   2. Any path under the OS tmpdir — the existing test infrastructure uses
 *      `mkdtempSync` everywhere (registry-lock-test-, meta-state-*, mcp-server-*,
 *      gate-integration-test-, dbg-*, …), and tmpdir is always user-owned, so
 *      allowing any path under tmpdir is safe and avoids the maintenance burden
 *      of enumerating test prefixes.
 *
 * The previous unrestricted override let an attacker set GATE_ROOT=/tmp/victim
 * to flood meta-state.jsonl writes into an arbitrary directory, bypassing the
 * containment check. The containment check below closes that gap.
 */
// fallow-ignore-next-line complexity
export function resolveRoot(override) {
  const root = override || process.env.GATE_ROOT || DEFAULT_ROOT;
  const resolved = resolve(root);
  const defaultResolved = resolve(DEFAULT_ROOT);
  const tmpResolved = resolve(tmpdir());

  if (!process.env.GATE_ROOT) {
    // No env override — must stay inside the project root.
    const isInside = resolved === defaultResolved || resolved.startsWith(defaultResolved + sep);
    if (!isInside) {
      throw new Error(`Invalid root: ${root} resolves outside project`);
    }
    return resolved;
  }

  // GATE_ROOT is set — must be the project root or a path under tmpdir.
  if (resolved === defaultResolved || resolved.startsWith(defaultResolved + sep)) {
    return resolved;
  }
  if (resolved === tmpResolved || resolved.startsWith(tmpResolved + sep)) {
    return resolved;
  }
  throw new Error(
    `Invalid GATE_ROOT: ${root} must be under project root or under the OS tmpdir`
  );
}