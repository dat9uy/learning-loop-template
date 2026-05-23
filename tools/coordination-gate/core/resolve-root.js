import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

/**
 * Resolve project root. Override via GATE_ROOT env var for testing.
 * Validates that resolved path does not escape the project directory.
 * Skips validation only when GATE_ROOT env var is set (test override).
 */
export function resolveRoot(override) {
  const root = override || process.env.GATE_ROOT || DEFAULT_ROOT;
  const resolved = resolve(root);
  const defaultResolved = resolve(DEFAULT_ROOT);
  // Skip validation only when GATE_ROOT env var is set (test override)
  if (!process.env.GATE_ROOT) {
    const isInside = resolved === defaultResolved || resolved.startsWith(defaultResolved + sep);
    if (!isInside) {
      throw new Error(`Invalid root: ${root} resolves outside project`);
    }
  }
  return resolved;
}
