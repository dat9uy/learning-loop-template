/**
 * Process-boot identity pin (R2 / Plan 5-Lite Phase 1).
 *
 * Replaces LIM-3's crypto role with a synchronous, closure-scoped, frozen
 * runtime id read once from `process.env.LOOP_SURFACE` at the first executable
 * statement of `mastra/server.js`. The pin is immutable for the process
 * lifetime: NO setter is exported, and the frozen pin state rejects property
 * mutation in strict mode.
 *
 * Why a separate module (deviation from the phase file): `mastra/server.js`
 * ends with `await server.startStdio()`. Importing server.js in a test hangs
 * on stdio. Existing tests (e.g. `server-runid.test.js`) read server.js as
 * source text or spawn it via `connectMcpServer` — they never `import` it.
 * Keeping the pin in `core/identity-pin.js` makes it unit-testable in
 * isolation without booting the MCP server.
 *
 * Allowed surfaces are sourced from `core/surfaces.js#SURFACES` (the single
 * source of truth for supported runtimes). `SURFACE_TO_RUNTIME` maps each
 * surface to its runtime id; adding a new runtime only requires extending
 * `SURFACES` and adding a mapping here.
 *
 * Exports:
 *   - pinRuntimeIdAtBoot(): idempotent; reads LOOP_SURFACE once, validates,
 *     resolves the runtime via SURFACE_TO_RUNTIME, freezes the pin state.
 *     Throws canonical errors from `mastra/identity-errors.json` on failure.
 *   - getPinnedRuntimeId(): returns the frozen `runtime`; throws if the pin
 *     was never initialized.
 *   - __getPinStateForTests(): test-only; returns the frozen pin state object
 *     so tests can assert `Object.isFrozen` and strict-mode assignment throws.
 *   - __resetForTests(): test-only; clears the pin so each test can re-pin
 *     with a fresh surface. NOT a setter — it does not set the runtime value.
 *
 * No runtime-id setter is exported anywhere. The pin is immutable for
 * process lifetime.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SURFACES } from "./surfaces.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ERRORS = JSON.parse(
  readFileSync(join(__dirname, "..", "mastra", "identity-errors.json"), "utf8"),
);

const SURFACE_TO_RUNTIME = {
  ".claude": "claude-code",
  ".factory": "droid",
  ".mastracode": "mastra-code",
};

let pinState = null;

/**
 * Pin the runtime identity from `process.env.LOOP_SURFACE`. Idempotent: a
 * second call is a no-op (the pin never changes once set, even if the env var
 * is mutated afterwards — this is the R2 closure-immutability defense).
 *
 * MUST be called as the FIRST executable statement in `mastra/server.js`,
 * before any `await` or `import` resolution that could fire `beforeExit`
 * hooks (NF4). Synchronous.
 *
 * @throws {Error} MISSING_LOOP_SURFACE if env is unset.
 * @throws {Error} INVALID_LOOP_SURFACE if env value is not an allowed surface.
 * @throws {Error} MISSING_RUNTIME_MAPPING if the surface has no runtime map.
 */
export function pinRuntimeIdAtBoot() {
  if (pinState) return;
  const surface = process.env.LOOP_SURFACE;
  if (!surface) {
    throw new Error(ERRORS.MISSING_LOOP_SURFACE);
  }
  if (!SURFACES.includes(surface)) {
    throw new Error(
      ERRORS.INVALID_LOOP_SURFACE
        .replace("{value}", surface)
        .replace("{allowed}", SURFACES.join(", ")),
    );
  }
  const runtime = SURFACE_TO_RUNTIME[surface];
  if (!runtime) {
    throw new Error(ERRORS.MISSING_RUNTIME_MAPPING.replace("{surface}", surface));
  }
  pinState = Object.freeze({ runtime });
}

/**
 * Return the pinned runtime id. Throws if `pinRuntimeIdAtBoot` was never
 * called (the pin is set once at server boot; a missing pin is a fatal
 * mis-configuration, not a recoverable state).
 *
 * @returns {string} the frozen runtime id ("claude-code" | "droid" | "mastra-code")
 */
export function getPinnedRuntimeId() {
  if (!pinState) {
    throw new Error(ERRORS.PIN_NOT_INITIALIZED);
  }
  return pinState.runtime;
}

/**
 * Test-only: return the frozen pin state object so tests can assert
 * `Object.isFrozen` and that strict-mode property mutation throws.
 * NOT for production use.
 *
 * @returns {Readonly<{runtime: string}>|null}
 */
export function __getPinStateForTests() {
  return pinState;
}

/**
 * Test-only: clear the pin so each test can re-pin with a fresh surface.
 * This is NOT a setter — it does not set the runtime value, only resets the
 * module's internal state so the next `pinRuntimeIdAtBoot()` re-reads the env.
 * NOT for production use.
 */
export function __resetForTests() {
  pinState = null;
}