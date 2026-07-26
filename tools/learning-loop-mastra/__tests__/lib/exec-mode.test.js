/**
 * Unit test for `isExecSession()` — the exec-mode declaration
 * META_STATE_VERIFY_EXEC=1|true. Default is disabled (fail-closed); only
 * the literals "1" and "true" return true. Sibling to session-mode:
 * session-mode authorizes operator-tier mutations, exec-mode authorizes
 * running registry-stored commands (meta_state_re_verify is the sole
 * consumer).
 */

import { describe, test } from "vitest";
import assert from "node:assert";
import { isExecSession } from "../../../lib/exec-mode.js";

describe("isExecSession boundary contract", () => {
  const original = process.env.META_STATE_VERIFY_EXEC;

  function withValue(value, fn) {
    if (value === undefined) delete process.env.META_STATE_VERIFY_EXEC;
    else process.env.META_STATE_VERIFY_EXEC = value;
    try {
      return fn();
    } finally {
      if (original === undefined) delete process.env.META_STATE_VERIFY_EXEC;
      else process.env.META_STATE_VERIFY_EXEC = original;
    }
  }

  test("returns false when META_STATE_VERIFY_EXEC is unset (fail-closed default)", () => {
    withValue(undefined, () => {
      assert.strictEqual(isExecSession(), false);
    });
  });

  test("returns true for '1' and 'true' (the two accepted literals)", () => {
    for (const accepted of ["1", "true"]) {
      withValue(accepted, () => {
        assert.strictEqual(
          isExecSession(),
          true,
          `expected '${accepted}' to enable exec`,
        );
      });
    }
  });

  test("returns false for empty string and other truthy-looking values", () => {
    for (const rejected of ["", "0", "yes", "on", "TRUE", "True", " 1"]) {
      withValue(rejected, () => {
        assert.strictEqual(
          isExecSession(),
          false,
          `expected '${rejected}' to be fail-closed`,
        );
      });
    }
  });

  test("restores the original META_STATE_VERIFY_EXEC value after teardown", () => {
    withValue("1", () => {
      assert.strictEqual(isExecSession(), true);
    });
    assert.strictEqual(
      process.env.META_STATE_VERIFY_EXEC,
      original,
      "teardown must restore the env var (or leave it unset)",
    );
  });
});
