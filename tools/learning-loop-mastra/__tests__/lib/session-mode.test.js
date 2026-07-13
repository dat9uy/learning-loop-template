/**
 * Unit test for `isLiveSession()` — the once-per-session declaration
 * LOOP_SESSION_MODE=live|autonomous (plan 260708-0833-lifecycle-authority-
 * dissolution-session-mode). Default mode is autonomous (fail-closed);
 * only the exact literal "live" returns true. Anything else — unset,
 * empty, case-variant, "1", "true", "yes", "autonomous", garbage —
 * returns false so the 3 class-approval tools (promote_rule, supersede,
 * dispatch_finding commit) refuse with `live_session_required`.
 *
 * No grant machinery: the tools' existing *_by / *_at fields remain the
 * authorship record.
 */

import { describe, test } from "vitest";
import assert from "node:assert";
import { isLiveSession } from "../../../lib/session-mode.js";

describe("isLiveSession boundary contract", () => {
  const original = process.env.LOOP_SESSION_MODE;

  function withValue(value, fn) {
    if (value === undefined) delete process.env.LOOP_SESSION_MODE;
    else process.env.LOOP_SESSION_MODE = value;
    try {
      return fn();
    } finally {
      if (original === undefined) delete process.env.LOOP_SESSION_MODE;
      else process.env.LOOP_SESSION_MODE = original;
    }
  }

  test("returns false when LOOP_SESSION_MODE is unset (fail-closed default)", () => {
    withValue(undefined, () => {
      assert.strictEqual(isLiveSession(), false);
    });
  });

  test("returns false when LOOP_SESSION_MODE is 'autonomous' (explicit fail-closed)", () => {
    withValue("autonomous", () => {
      assert.strictEqual(isLiveSession(), false);
    });
  });

  test("returns true ONLY when LOOP_SESSION_MODE is the exact string 'live'", () => {
    withValue("live", () => {
      assert.strictEqual(isLiveSession(), true);
    });
  });

  test("returns false for empty string", () => {
    withValue("", () => {
      assert.strictEqual(isLiveSession(), false);
    });
  });

  test("returns false for case-variants of 'live' (strict equality, no normalization)", () => {
    for (const variant of ["Live", "LIVE", "liVe", "live "]) {
      withValue(variant, () => {
        assert.strictEqual(
          isLiveSession(),
          false,
          `expected '${variant}' to be fail-closed`,
        );
      });
    }
  });

  test("returns false for legacy OPERATOR_MODE truthy values (clean break, no back-compat)", () => {
    for (const legacy of ["1", "true", "yes", "on"]) {
      withValue(legacy, () => {
        assert.strictEqual(
          isLiveSession(),
          false,
          `expected legacy OPERATOR_MODE shape '${legacy}' to be fail-closed`,
        );
      });
    }
  });

  test("returns false for garbage / typed values (NaN coerced to 'NaN')", () => {
    for (const garbage of ["auto", "production", "NaN", "null"]) {
      withValue(garbage, () => {
        assert.strictEqual(
          isLiveSession(),
          false,
          `expected garbage '${garbage}' to be fail-closed`,
        );
      });
    }
  });

  test("restores the original LOOP_SESSION_MODE value after teardown", () => {
    withValue("live", () => {
      assert.strictEqual(isLiveSession(), true);
    });
    assert.strictEqual(
      process.env.LOOP_SESSION_MODE,
      original,
      "teardown must restore the env var (or leave it unset)",
    );
  });
});
