/**
 * Protocol-neutral Runtime Topology.
 *
 * The catalog is the Core association between a participating runtime and the
 * project surface it owns. Runtime mechanisms (hooks, configuration formats,
 * lifecycle events, delivery envelopes, and storage fan-out) do not belong in
 * this module.
 *
 * Each entry deliberately has exactly three facts:
 *   - id — stable runtime identity
 *   - surface — the runtime-owned project surface
 *   - ownershipRoot — the root used by ownership checks for that surface
 *
 * Consumers should use listRuntimes(), getRuntime(), and
 * runtimeIdForSurface(). createRuntimeTopology() is the construction seam; it
 * validates the catalog once and freezes both the collection and its entries.
 */

const TOPOLOGY_FIELDS = Object.freeze(["id", "surface", "ownershipRoot"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, field, index) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`runtime topology entry ${index} requires a non-empty ${field}`);
  }
}

function validateEntry(entry, index, ids, surfaces) {
  if (!isRecord(entry)) {
    throw new TypeError(`runtime topology entry ${index} must be an object`);
  }

  const keys = Object.keys(entry).sort();
  const expectedKeys = [...TOPOLOGY_FIELDS].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, i) => key !== expectedKeys[i])) {
    throw new TypeError("runtime topology entries may contain only id, surface, and ownershipRoot");
  }

  assertString(entry.id, "id", index);
  assertString(entry.surface, "surface", index);
  assertString(entry.ownershipRoot, "ownershipRoot", index);

  if (ids.has(entry.id)) {
    throw new Error(`duplicate runtime id in topology: ${entry.id}`);
  }
  if (surfaces.has(entry.surface)) {
    throw new Error(`duplicate owned surface in topology: ${entry.surface}`);
  }
  ids.add(entry.id);
  surfaces.add(entry.surface);
}

/**
 * Validate and freeze a Runtime Topology catalog.
 *
 * @param {Array<{id: string, surface: string, ownershipRoot: string}>} entries
 * @returns {ReadonlyArray<Readonly<{id: string, surface: string, ownershipRoot: string}>>}
 */
export function createRuntimeTopology(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError("runtime topology must contain at least one entry");
  }

  const ids = new Set();
  const surfaces = new Set();
  const topology = entries.map((entry, index) => {
    validateEntry(entry, index, ids, surfaces);
    return Object.freeze({
      id: entry.id,
      surface: entry.surface,
      ownershipRoot: entry.ownershipRoot,
    });
  });
  return Object.freeze(topology);
}

export const RUNTIME_TOPOLOGY = createRuntimeTopology([
  { id: "codex", surface: ".codex", ownershipRoot: ".codex" },
  { id: "claude-code", surface: ".claude", ownershipRoot: ".claude" },
  { id: "hermes", surface: ".hermes", ownershipRoot: ".hermes" },
]);

/** @returns {ReadonlyArray<Readonly<{id: string, surface: string, ownershipRoot: string}>>} */
export function listRuntimes() {
  return RUNTIME_TOPOLOGY;
}

/** @param {string} id @returns {Readonly<{id: string, surface: string, ownershipRoot: string}>|undefined} */
export function getRuntime(id) {
  return RUNTIME_TOPOLOGY.find((runtime) => runtime.id === id);
}

/** @param {string} surface @returns {string|undefined} */
export function runtimeIdForSurface(surface) {
  return RUNTIME_TOPOLOGY.find((runtime) => runtime.surface === surface)?.id;
}
