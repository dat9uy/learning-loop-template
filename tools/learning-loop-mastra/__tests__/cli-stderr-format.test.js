// cli-stderr-format.test.js — Phase 2 of plans/260722-1343-write-capable-cli-w.
//
// Unit test for the structured stderr classifier. The CLI binary's catch
// path is hard to exercise end-to-end without spawning the binary, so
// `classifyCliError(err)` is a pure function: given an error, return
// `{json, exitCode}` (or `null` for usage errors → caller takes the
// exit-2 human-readable path).
//
// Two distinct shapes for exit-1 are locked here so the agent's recovery
// policy can branch deterministically:
//
//   1. Recognized rejection — error carries a stable code/name.
//      → exit 1 + `{error: <name>, code: <code>, reason: <message>}`.
//
//   2. InternalError — TypeError, ReferenceError, plain Error with no
//      stable code, non-Error throws.
//      → exit 1 + `{error: "InternalError", reason, internal: true}`.
//      Agent recovery: do NOT retry by arg-fixing; file a bug.
//
//   3. UsageError / identity-pin → `null` (caller emits exit-2 human line).

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  classifyCliError,
  UsageError,
} from "../core/cli-stderr.js";

describe("classifyCliError", () => {
  test("UsageError → null (caller handles exit 2)", () => {
    const result = classifyCliError(new UsageError("bad arg"));
    assert.strictEqual(result, null, "UsageError must return null so caller takes exit-2 path");
  });

  test("identity-pin error → null (caller handles exit 2)", async () => {
    const { pinRuntimeIdAtBoot } = await import("../core/identity-pin.js");
    const originalSurface = process.env.LOOP_SURFACE;
    delete process.env.LOOP_SURFACE;
    let pinErr;
    try {
      pinRuntimeIdAtBoot();
    } catch (e) {
      pinErr = e;
    } finally {
      if (originalSurface !== undefined) process.env.LOOP_SURFACE = originalSurface;
      // Reset pin state for next test
      const { __resetForTests } = await import("../core/identity-pin.js");
      __resetForTests();
      if (originalSurface !== undefined) pinRuntimeIdAtBoot();
    }
    assert.ok(pinErr, "expected pinRuntimeIdAtBoot to throw without LOOP_SURFACE");
    const result = classifyCliError(pinErr);
    assert.strictEqual(result, null, "identity-pin error must return null for exit-2 path");
  });

  test("PathContainmentError → recognized rejection with stable code", async () => {
    const { PathContainmentError } = await import("../core/path-containment.js");
    const err = new PathContainmentError("outside_root", { root: "/x", userPath: "/y", resolvedPath: null });
    const result = classifyCliError(err);
    assert.ok(result, "PathContainmentError must classify as exit 1");
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.error, "PathContainmentError");
    assert.strictEqual(parsed.code, "outside_root");
    assert.ok(typeof parsed.reason === "string" && parsed.reason.length > 0);
  });

  test("error message with leading rejection code → recognized rejection", () => {
    const err = new Error("version_mismatch: current_version=5 expected=3");
    const result = classifyCliError(err);
    assert.ok(result);
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.code, "version_mismatch");
    assert.strictEqual(parsed.error, "Error");
    assert.ok(!("internal" in parsed), "recognized rejection must NOT carry internal: true");
  });

  test("error message with r2_denied prefix → recognized rejection", () => {
    const err = new Error("r2_denied: write to /path/forbidden under .factory surface");
    const result = classifyCliError(err);
    assert.ok(result);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.code, "r2_denied");
  });

  test("error message with cross_runtime_write_denied prefix → recognized rejection", () => {
    const err = new Error("cross_runtime_write_denied: loop-surfaces.json forbids .claude from .factory paths");
    const result = classifyCliError(err);
    assert.ok(result);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.code, "cross_runtime_write_denied");
  });

  test("TypeError → InternalError (not retriable by arg-fixing)", () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'id')");
    const result = classifyCliError(err);
    assert.ok(result);
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.error, "InternalError");
    assert.strictEqual(parsed.internal, true);
    assert.ok(typeof parsed.reason === "string");
  });

  test("ReferenceError → InternalError", () => {
    const err = new ReferenceError("foo is not defined");
    const result = classifyCliError(err);
    assert.ok(result);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.error, "InternalError");
    assert.strictEqual(parsed.internal, true);
  });

  test("plain Error with no stable code → InternalError", () => {
    const err = new Error("Unexpected token in JSON at position 5");
    const result = classifyCliError(err);
    assert.ok(result);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.error, "InternalError");
    assert.strictEqual(parsed.internal, true);
  });

  test("non-Error throw (string) → InternalError", () => {
    const result = classifyCliError("something broke");
    assert.ok(result);
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.error, "InternalError");
    assert.strictEqual(parsed.internal, true);
    assert.strictEqual(parsed.reason, "something broke");
  });

  test("InvalidEntryError → recognized rejection (error name from allowlist)", async () => {
    const { InvalidEntryError } = await import("../core/meta-state.js");
    const fakeValidation = {
      message: "missing field 'description'",
      format: () => "missing field 'description'",
    };
    const err = new InvalidEntryError(fakeValidation);
    const result = classifyCliError(err);
    assert.ok(result);
    assert.strictEqual(result.exitCode, 1);
    const parsed = JSON.parse(result.json);
    assert.strictEqual(parsed.error, "InvalidEntryError");
  });

  test("recognized rejection reason does not include the duplicated code prefix", () => {
    const err = new Error("version_mismatch: expected=3, current=5");
    const result = classifyCliError(err);
    assert.ok(result);
    const parsed = JSON.parse(result.json);
    assert.ok(!parsed.reason.startsWith("version_mismatch"), `reason must not duplicate the code; got: ${parsed.reason}`);
    assert.ok(parsed.reason.includes("3"), `reason must carry the human detail; got: ${parsed.reason}`);
  });
});
