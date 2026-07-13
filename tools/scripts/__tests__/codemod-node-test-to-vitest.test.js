// Unit tests for tools/scripts/codemod-node-test-to-vitest.mjs.
//
// Locks the three transforms (import swap, hook call-site fix, t.skip fix)
// and their idempotency. Re-run after any codemod edit.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { transform } from "../codemod-node-test-to-vitest.mjs";

describe("codemod-node-test-to-vitest: import swap", () => {
  test("ESM: import { test } from 'node:test' → 'vitest'", () => {
    const src = `import { test } from "node:test";\ntest("foo", () => {});\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, `import { test } from "vitest";\ntest("foo", () => {});\n`);
    assert.strictEqual(changes.imports, 1);
  });

  test("CJS: const { test } = require('node:test') is REMOVED (vitest cannot be require()d; globals:true covers describe/it/test)", () => {
    const src = `const { test, describe } = require("node:test");\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, "");
    assert.strictEqual(changes.imports, 1);
  });

  test("CJS cleanup: const { test } = require('vitest') is REMOVED (legacy of an earlier codemod pass)", () => {
    const src = `const { test, describe } = require("vitest");\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, "");
    assert.strictEqual(changes.imports, 1);
  });

  test("node:assert imports are untouched", () => {
    const src = `import assert from "node:assert";\nimport { strict as assert2 } from "node:assert/strict";\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, src);
    assert.strictEqual(changes.imports, 0);
  });

  test("single-quoted node:test is also swapped", () => {
    const src = `import { test } from 'node:test';\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, `import { test } from 'vitest';\n`);
    assert.strictEqual(changes.imports, 1);
  });
});

describe("codemod-node-test-to-vitest: vitest 4 hook rename", () => {
  test("import { before } from 'vitest' → beforeAll", () => {
    const src = `import { describe, test, before } from "vitest";\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, `import { describe, test, beforeAll } from "vitest";\n`);
    assert.ok(changes.hooks >= 1);
  });

  test("import { after } from 'vitest' → afterAll", () => {
    const src = `import { describe, after } from "vitest";\n`;
    const { out } = transform(src);
    assert.strictEqual(out, `import { describe, afterAll } from "vitest";\n`);
  });

  test("standalone before(...) call → beforeAll(...)", () => {
    const src = `before(async () => { await x(); });\n`;
    const { out } = transform(src);
    assert.strictEqual(out, `beforeAll(async () => { await x(); });\n`);
  });

  test("standalone after(...) call → afterAll(...)", () => {
    const src = `after(() => cleanup());\n`;
    const { out } = transform(src);
    assert.strictEqual(out, `afterAll(() => cleanup());\n`);
  });

  test("method call something.before(...) is NOT rewritten", () => {
    const src = `obj.before(() => x());\nthis.before(fn);\n`;
    const { out } = transform(src);
    assert.strictEqual(out, src);
  });

  test("prose 'before'/'after' in comments/strings is NOT rewritten", () => {
    const src = `// call before this runs\nconst msg = "before the test";\n`;
    const { out } = transform(src);
    assert.strictEqual(out, src);
  });

  test("call-shape 'before('/'after(' inside a full-line comment is NOT rewritten", () => {
    const src = `// run before(foo) to seed\n// then after(bar) to tear down\nbeforeAll(() => x());\n`;
    const { out } = transform(src);
    assert.strictEqual(out, src);
  });
});

describe("codemod-node-test-to-vitest: hook call-site fix (red-team C2)", () => {
  test("beforeAll(fn, { timeout: 15000 }) → beforeAll(fn, 15000)", () => {
    const src = `beforeAll(async () => { await setup(); }, { timeout: 15000 });\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, `beforeAll(async () => { await setup(); }, 15000);\n`);
    assert.ok(changes.hooks >= 1);
  });

  test("afterAll, beforeEach, afterEach are also rewritten", () => {
    const src = [
      `afterAll(fn, { timeout: 5000 });`,
      `beforeEach(fn, { timeout: 10000 });`,
      `afterEach(fn, { timeout: 20000 });`,
    ].join("\n");
    const { out, changes } = transform(src);
    assert.strictEqual(out, [
      `afterAll(fn, 5000);`,
      `beforeEach(fn, 10000);`,
      `afterEach(fn, 20000);`,
    ].join("\n"));
    assert.ok(changes.hooks >= 3);
  });

  test("whitespace around timeout colon is flexible", () => {
    const src = `beforeAll(fn, { timeout   :   30000 });\n`;
    const { out } = transform(src);
    assert.strictEqual(out, `beforeAll(fn, 30000);\n`);
  });

  test("test() 3-arg form (timeout BEFORE fn) is NOT matched", () => {
    const src = `test("name", { timeout: 15000 }, async () => {});\n`;
    const { out } = transform(src);
    assert.strictEqual(out, src);
  });

  test("non-trailing `{ timeout: ... }` (no closing `);`) is NOT matched", () => {
    const src = `const opts = { timeout: 15000 }; beforeAll(fn);\n`;
    const { out } = transform(src);
    assert.strictEqual(out, src);
  });
});

describe("codemod-node-test-to-vitest: t.skip fix (red-team M1)", () => {
  test("t.skip(REASON) → t.skip(true, REASON)", () => {
    const src = `t.skip("cross-restart persistence requires file-backed storage");\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(
      out,
      `t.skip(true, "cross-restart persistence requires file-backed storage");\n`,
    );
    assert.strictEqual(changes.skips, 1);
  });

  test("single-quoted and backtick-quoted reasons work", () => {
    const a = transform(`t.skip('reason-a');\n`);
    const b = transform("t.skip(`reason-b`);\n");
    assert.strictEqual(a.out, `t.skip(true, 'reason-a');\n`);
    assert.strictEqual(b.out, "t.skip(true, `reason-b`);\n");
    assert.strictEqual(a.changes.skips, 1);
    assert.strictEqual(b.changes.skips, 1);
  });

  test("already-correct t.skip(true, REASON) is not double-rewritten", () => {
    const src = `t.skip(true, "already-correct");\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, src);
    assert.strictEqual(changes.skips, 0);
  });
});

describe("codemod-node-test-to-vitest: idempotency", () => {
  test("re-running on already-vitest output produces no diff", () => {
    const before = [
      `import { test } from "vitest";`,
      `beforeAll(async () => {}, 15000);`,
      `t.skip(true, "reason");`,
      `import assert from "node:assert";`,
    ].join("\n");
    const { out, changes } = transform(before);
    assert.strictEqual(out, before);
    assert.strictEqual(changes.imports + changes.hooks + changes.skips, 0);
  });

  test("non-node-test file passes through unchanged", () => {
    const src = `import { foo } from "./helpers.js";\nconst x = 42;\n`;
    const { out, changes } = transform(src);
    assert.strictEqual(out, src);
    assert.strictEqual(changes.imports + changes.hooks + changes.skips, 0);
  });
});