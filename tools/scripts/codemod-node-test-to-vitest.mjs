#!/usr/bin/env node
/**
 * Codemod: node:test → vitest.
 *
 * Per-file, in-place transform. Used by the vitest migration plan
 * (plans/260713-1625-vitest-migration-replace-node-test-c8/) to mechanically
 * rewrite the 222-file tools/ test tree before the atomic cutover.
 *
 * Transforms applied (in order):
 *
 *   1. `from "node:test"` import → `from "vitest"` (ESM)
 *      `const { ... } = require("node:test");` → REMOVE the entire line (CJS)
 *      Vitest cannot be `require()`d from CJS — throws at module load. With
 *      `globals: true` in vitest.config, `describe`/`it`/`test`/etc. are
 *      injected as globals, so the require is unnecessary.
 *      `before`/`after` named imports from vitest → `beforeAll`/`afterAll`
 *      (vitest 4.x renamed the suite-level hooks; the 6 call sites in this
 *      repo all use `before`/`after`, not `beforeAll`/`afterAll`).
 *   2. `before(fn, { timeout: N })` / `after(fn, { timeout: N })` →
 *      `beforeAll(fn, N)` / `afterAll(fn, N)`
 *      (red-team C2 + vitest 4 rename: vitest's beforeAll family takes a
 *      number, not an options object — the object form yields NaN timeout →
 *      default 10s → flake. Also renames the hook to match the import.)
 *   3. `t.skip(REASON)` → `t.skip(true, REASON)`
 *      (red-team M1: vitest's t.skip requires (condition, reason); the
 *      node:test 1-arg REASON form silently drops the reason string)
 *
 * What is NOT touched:
 *   - `from "node:assert"` and `from "node:assert/strict"` — vitest doesn't
 *     break node:assert; the 200 importers stay.
 *   - `process.exit(...)` calls in .claude/coordination/ + .factory/hooks/
 *     gate-test scripts — handled separately by wrap-gate-tests.mjs.
 *   - All other imports (`node:fs`, `node:path`, etc.).
 *   - The English word "before"/"after" in comments and strings — only the
 *     named-import slot and the call expression `before(...)`/`after(...)`
 *     are rewritten, never the prose.
 *
 * Idempotency: a re-run on already-vitest files produces no diff
 * (the import-swap is no-op when source != "node:test"; the CJS removal
 * is no-op once require is gone; the named-import rename is no-op once
 * the names are already `beforeAll`/`afterAll`; the hook + skip regexes
 * don't match vitest's emitted shape because they specifically match
 * `(fn, { timeout: N })` and `t.skip(<string>)` respectively).
 *
 * Usage:
 *   node tools/scripts/codemod-node-test-to-vitest.mjs <path> [<path>...]
 *   node tools/scripts/codemod-node-test-to-vitest.mjs tools/learning-loop-mastra
 *     → recursively transforms every *.test.{js,cjs,mjs} under that root.
 *
 * Exit code: 0 on success, 1 on bad path / read failure.
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const TEST_RE = /\.test\.(?:js|cjs|mjs)$/;

/**
 * Recursively collect test files under `root` (single file or directory).
 * @param {string} p
 * @returns {string[]}
 */
function collectTestFiles(p) {
  let st;
  try {
    st = statSync(p);
  } catch (err) {
    console.error(`codemod: cannot stat ${p}: ${err.message}`);
    process.exit(1);
  }
  if (st.isFile()) {
    return TEST_RE.test(p) ? [p] : [];
  }
  if (!st.isDirectory()) return [];

  const out = [];
  for (const name of readdirSync(p)) {
    const child = join(p, name);
    const cs = statSync(child);
    if (cs.isDirectory()) {
      // Skip node_modules and coverage scratch dirs
      if (name === "node_modules" || name === "coverage" || name === ".test-logs") continue;
      out.push(...collectTestFiles(child));
    } else if (TEST_RE.test(child)) {
      out.push(child);
    }
  }
  return out;
}

/**
 * Apply the three transforms to a file's source text.
 * @param {string} src
 * @returns {{ out: string, changes: { imports: number, hooks: number, skips: number } }}
 */
export function transform(src) {
  const changes = { imports: 0, hooks: 0, skips: 0 };

  // 1. Import swap. Two shapes: ESM `import { ... } from "node:test";`
  //    and CJS `const { ... } = require("node:test");`. The ESM shape is
  //    swapped to `from "vitest"`. The CJS shape is REMOVED entirely
  //    because vitest cannot be require()d (and `globals: true` makes the
  //    import unnecessary for `describe`/`it`/`test`/etc.).
  let out = src.replace(
    /(from\s+["'])node:test(["'])/g,
    (_m, pre, post) => {
      changes.imports += 1;
      return `${pre}vitest${post}`;
    },
  );
  // CJS: remove the entire `const { ... } = require("node:test");` line.
  // Anchored: must be a single complete statement ending in `;` followed by
  // a newline, so we don't accidentally swallow multi-line statements.
  out = out.replace(
    /^const\s+\{[^}]*\}\s*=\s*require\(\s*["']node:test["']\s*\)\s*;\s*\n/gm,
    (_m) => {
      changes.imports += 1;
      return "";
    },
  );
  // Cleanup pass: drop `const { ... } = require("vitest");` lines that an
  // earlier codemod run produced (and that we left behind when re-running
  // on already-migrated CJS files). With `globals: true` the import is dead.
  // Idempotent: only matches lines that exist; no-op on freshly-removed ones.
  out = out.replace(
    /^const\s+\{[^}]*\}\s*=\s*require\(\s*["']vitest["']\s*\)\s*;\s*\n/gm,
    (_m) => {
      changes.imports += 1;
      return "";
    },
  );

  // 1b. Vitest 4.x hook rename. `before`/`after` were renamed to
  //    `beforeAll`/`afterAll`. Both the named-import slot AND the call
  //    expression need to change; otherwise `beforeAll` is imported but
  //    never called, or `before` is called but undefined.
  //
  //    Named-import rewrite: target the destructuring shape
  //    `import { ..., before|after, ... } from "vitest"`. Use a word-
  //    boundary regex so `beforeEach`/`afterEach`/`beforeAll`/`afterAll`
  //    are not affected.
  out = out.replace(
    /import\s*\{([^}]*)\}\s*from\s*["']vitest["']/g,
    (m, names) => {
      let touched = false;
      const rewritten = names.replace(
        /\bbefore\b/g,
        () => {
          touched = true;
          changes.hooks += 1;
          return "beforeAll";
        },
      ).replace(
        /\bafter\b/g,
        () => {
          touched = true;
          changes.hooks += 1;
          return "afterAll";
        },
      );
      return touched ? `import {${rewritten}} from "vitest"` : m;
    },
  );
  // Call-expression rewrite: `before(...)` and `after(...)` as standalone
  // calls (not method calls like `obj.before()`). Negative lookbehind on
  // `[\w$.]` rejects `something.before(...)`.
  out = out.replace(/(?<![\w$.])before\s*\(/g, () => {
    changes.hooks += 1;
    return "beforeAll(";
  });
  out = out.replace(/(?<![\w$.])after\s*\(/g, () => {
    changes.hooks += 1;
    return "afterAll(";
  });

  // 2. Hook call-site fix (red-team C2):
  //    before|beforeEach|afterEach ( fn , { timeout : N } )
  //                     ────                 ─────────────
  //    vitest takes (fn, N). The object form becomes NaN → 10s default → flake.
  //
  //    The hook sites are the 2-arg form where `{ timeout: N }` is the TRAILING
  //    arg (immediately followed by `);`). The test() form `test("name",
  //    { timeout: N }, fn)` has timeout as the 2nd arg with a comma after it,
  //    so the trailing `,` (not `;`) is the discriminator.
  //
  //    Anchor: `, { timeout: N });` — uniquely the hook call pattern.
  out = out.replace(
    /,\s*\{\s*timeout\s*:\s*(\d+)\s*\}\s*\)\s*;/g,
    (_m, n) => {
      changes.hooks += 1;
      return `, ${n});`;
    },
  );

  // 3. t.skip(REASON) → t.skip(true, REASON) (red-team M1):
  //    node:test accepts t.skip(<string reason>) which vitest silently drops.
  //    The vitest shape is t.skip(true, <reason>).
  //    Match a single non-empty string argument. Multiline-safe via [\s\S].
  out = out.replace(
    /\bt\.skip\(\s*(["'`])([^"'`]+)\1\s*\)/g,
    (_m, q, reason) => {
      changes.skips += 1;
      return `t.skip(true, ${q}${reason}${q})`;
    },
  );

  return { out, changes };
}

/**
 * Transform one file in place. Returns the change counts (for unit tests + CLI summary).
 * @param {string} file
 * @returns {{ imports: number, hooks: number, skips: number }}
 */
export function transformFile(file) {
  const src = readFileSync(file, "utf8");
  const { out, changes } = transform(src);
  if (out !== src) {
    writeFileSync(file, out, "utf8");
  }
  return changes;
}

// CLI entry: collect files, transform each, print a summary.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("usage: codemod-node-test-to-vitest.mjs <path> [<path>...]");
    process.exit(1);
  }
  const files = args.flatMap(collectTestFiles);
  if (files.length === 0) {
    console.error("codemod: no test files matched the given paths");
    process.exit(1);
  }

  let totalImports = 0;
  let totalHooks = 0;
  let totalSkips = 0;
  const touchedFiles = [];
  for (const f of files) {
    const c = transformFile(f);
    totalImports += c.imports;
    totalHooks += c.hooks;
    totalSkips += c.skips;
    if (c.imports || c.hooks || c.skips) touchedFiles.push({ file: f, ...c });
  }

  const cwd = process.cwd();
  for (const t of touchedFiles) {
    console.log(
      `  ${relative(cwd, t.file)}  imports=${t.imports} hooks=${t.hooks} skips=${t.skips}`,
    );
  }
  console.log(
    `codemod: ${touchedFiles.length}/${files.length} files touched; imports=${totalImports} hooks=${totalHooks} skips=${totalSkips}`,
  );
}