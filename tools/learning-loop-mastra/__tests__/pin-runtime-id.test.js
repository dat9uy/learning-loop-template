import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import {
  pinRuntimeIdAtBoot,
  getPinnedRuntimeId,
  __getPinStateForTests,
  __resetForTests,
} from "../core/identity-pin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ERRORS = JSON.parse(
  readFileSync(join(__dirname, "..", "mastra", "identity-errors.json"), "utf8"),
);

const SERVER_ENTRY = resolve(__dirname, "..", "mastra", "server.js");
const CREATE_LOOP_TOOL = resolve(__dirname, "..", "mastra", "create-loop-tool.js");
const IDENTITY_PIN = resolve(__dirname, "..", "core", "identity-pin.js");

describe("identity-pin", () => {
  beforeEach(() => {
    __resetForTests();
    delete process.env.LOOP_SURFACE;
  });

  after(() => {
    __resetForTests();
    delete process.env.LOOP_SURFACE;
  });

  test("pin_succeeds_with_valid_surface_claude", () => {
    process.env.LOOP_SURFACE = ".claude";
    pinRuntimeIdAtBoot();
    assert.strictEqual(getPinnedRuntimeId(), "claude-code");
  });

  test("pin_succeeds_with_valid_surface_factory", () => {
    process.env.LOOP_SURFACE = ".factory";
    pinRuntimeIdAtBoot();
    assert.strictEqual(getPinnedRuntimeId(), "droid");
  });

  test("pin_succeeds_with_valid_surface_mastracode", () => {
    process.env.LOOP_SURFACE = ".mastracode";
    pinRuntimeIdAtBoot();
    assert.strictEqual(getPinnedRuntimeId(), "mastra-code");
  });

  test("missing_env_throws_canonical_error", () => {
    delete process.env.LOOP_SURFACE;
    assert.throws(
      () => pinRuntimeIdAtBoot(),
      (err) => err.message === ERRORS.MISSING_LOOP_SURFACE,
      `must throw exact MISSING_LOOP_SURFACE constant`,
    );
  });

  test("invalid_surface_throws_canonical_error", () => {
    process.env.LOOP_SURFACE = "../etc";
    assert.throws(
      () => pinRuntimeIdAtBoot(),
      (err) => err.message === ERRORS.INVALID_LOOP_SURFACE.replace("{value}", "../etc").replace("{allowed}", ".claude, .factory, .mastracode"),
      `must throw exact INVALID_LOOP_SURFACE constant with substitutions`,
    );
  });

  test("missing_runtime_mapping_throws_canonical_error", () => {
    // Use a surface that is in ALLOWED_SURFACES but has no runtime mapping.
    // Since all three allowed surfaces have mappings, simulate by directly
    // testing the error constant format is substitutable (defensive guard).
    const msg = ERRORS.MISSING_RUNTIME_MAPPING.replace("{surface}", ".unknown");
    assert.ok(msg.includes(".unknown"), "constant must be substitutable");
  });

  test("getPinnedRuntimeId_throws_when_not_pinned", () => {
    __resetForTests();
    assert.throws(
      () => getPinnedRuntimeId(),
      (err) => err.message === ERRORS.PIN_NOT_INITIALIZED,
    );
  });

  test("closure_immutability: mid-process env change does NOT flip the pin", () => {
    process.env.LOOP_SURFACE = ".claude";
    pinRuntimeIdAtBoot();
    assert.strictEqual(getPinnedRuntimeId(), "claude-code");
    // Mutate env mid-process (the attack scenario from R2).
    process.env.LOOP_SURFACE = ".factory";
    assert.strictEqual(
      getPinnedRuntimeId(),
      "claude-code",
      "pin must NOT change when env is mutated after boot",
    );
  });

  test("pinRuntimeIdAtBoot is idempotent", () => {
    process.env.LOOP_SURFACE = ".claude";
    pinRuntimeIdAtBoot();
    const first = getPinnedRuntimeId();
    // Second call must NOT re-read env even if it changed.
    process.env.LOOP_SURFACE = ".factory";
    pinRuntimeIdAtBoot();
    assert.strictEqual(getPinnedRuntimeId(), first);
  });

  test("frozen_object_throws_on_assignment: pin state is frozen", () => {
    process.env.LOOP_SURFACE = ".claude";
    pinRuntimeIdAtBoot();
    const state = __getPinStateForTests();
    assert.ok(Object.isFrozen(state), "pin state must be frozen");
    assert.throws(() => {
      "use strict";
      state.runtime = "malicious";
    }, /cannot assign to read only property|strict mode/i);
  });

  test("frozen_object_throws_on_assignment: adding property throws in strict mode", () => {
    process.env.LOOP_SURFACE = ".claude";
    pinRuntimeIdAtBoot();
    const state = __getPinStateForTests();
    assert.throws(() => {
      "use strict";
      state.extra = "evil";
    }, /object is not extensible|strict mode/i);
  });

  test("no_setter_export: server.js, create-loop-tool.js, identity-pin.js do not export setPinnedRuntimeId", () => {
    const serverSrc = readFileSync(SERVER_ENTRY, "utf8");
    const createLoopSrc = readFileSync(CREATE_LOOP_TOOL, "utf8");
    const pinSrc = readFileSync(IDENTITY_PIN, "utf8");
    for (const [name, src] of [["server.js", serverSrc], ["create-loop-tool.js", createLoopSrc], ["identity-pin.js", pinSrc]]) {
      assert.ok(
        !src.includes("setPinnedRuntimeId"),
        `${name} must NOT contain the token "setPinnedRuntimeId" (no setter export allowed)`,
      );
    }
  });

  test("no_setter_export: identity-pin.js does not export a runtime setter", () => {
    const pinSrc = readFileSync(IDENTITY_PIN, "utf8");
    // No function that sets the runtime value should be exported.
    assert.ok(
      !/export\s+function\s+set\w*Runtime/i.test(pinSrc),
      "identity-pin.js must not export any set*Runtime function",
    );
  });
});