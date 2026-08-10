// fcis-invariant.test.js — whole-core Functional Core / Imperative Shell guard.
//
// The functional core has three invariants the shell does not share:
//   1. zero `@mastra/*` imports anywhere in core (framework purity);
//   2. every relative import from a core file resolves within core/ (no
//      `../mastra/`, `../tools/` escapes — core may NOT reach into the shell);
//   3. zero bare-specifier imports outside `node:` / the pure-npm allowlist
//      (no `#lib/*`, no `#mastra/*` package-alias edges).
//
// These are the mechanical version of the documented one-way dependency:
// the shell may import core, core may not import the shell.

import { test } from "vitest";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname, resolve, dirname, sep } from "node:path";

const CORE_DIR = join(import.meta.dirname, "..", "..", "core");

// Pure-npm packages the core may import (stdlib is `node:`-prefixed).
const ALLOWED_BARE = new Set(["zod", "yaml", "shell-quote", "proper-lockfile"]);

function walkJsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      results.push(...walkJsFiles(full));
    } else {
      const ext = extname(entry.name);
      if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
        if (entry.name.endsWith(".test.js")) continue;
        results.push(full);
      }
    }
  }
  return results;
}

// A comment line — `//`, `/*`, or a JSDoc `*` continuation. Import-like prose
// inside comments (e.g. a bypass-risk note quoting `require('child_process')`)
// must not count as a real edge.
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
}

test("core/ has zero @mastra/* imports", () => {
  const importRe =
    /(?:from\s+['"]@mastra|require\s*\(\s*['"]@mastra|import\s*\(\s*['"]@mastra)/;

  const files = walkJsFiles(CORE_DIR);
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      if (importRe.test(lines[i])) {
        violations.push({ file: relative(CORE_DIR, file), line: i + 1, text: lines[i].trim() });
      }
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    `FCIS violation: ${violations.length} @mastra/* import(s) found in core/\n` +
      violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`).join("\n"),
  );
});

test("core/ may import only within core/ (no shell escapes)", () => {
  const files = walkJsFiles(CORE_DIR);
  const broken = [];

  const importRe =
    /(?:^|[{;,])\s*(?:import\s+.*?from|import)\s+['"](\.[^'"]+)['"]|(?:^|[{;,])\s*require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;

      let match;
      importRe.lastIndex = 0;
      while ((match = importRe.exec(line)) !== null) {
        const importPath = match[1] || match[2];
        if (!importPath || !importPath.startsWith(".")) continue;

        // A relative import from a core file must resolve to a path that
        // stays inside core/ — any `..` that walks above core/ is an escape
        // into the shell (mastra/, tools/, lib/) and violates the one-way rule.
        const resolved = resolve(dirname(file), importPath);
        if (!resolved.startsWith(CORE_DIR + sep)) {
          broken.push({ file: relative(CORE_DIR, file), line: i + 1, import: importPath });
          continue;
        }

        const candidates = [resolved];
        if (!extname(resolved)) {
          candidates.push(resolved + ".js", resolved + ".cjs", resolved + ".mjs");
        }
        const exists = candidates.some((c) => {
          try {
            return statSync(c).isFile();
          } catch {
            return false;
          }
        });
        if (!exists) {
          broken.push({ file: relative(CORE_DIR, file), line: i + 1, import: importPath });
        }
      }
    }
  }

  assert.strictEqual(
    broken.length,
    0,
    `Core-escape or broken sibling imports in core/:\n` +
      broken.map((b) => `  ${b.file}:${b.line} imports ${b.import}`).join("\n"),
  );
});

test("core/ has no bare-specifier imports outside node:/pure-npm allowlist", () => {
  const files = walkJsFiles(CORE_DIR);
  const violations = [];

  const importRe =
    /(?:from\s+['"]([^'"]+)['"])|(?:require\s*\(\s*['"]([^'"]+)['"]\s*\))|(?:import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;

      let match;
      importRe.lastIndex = 0;
      while ((match = importRe.exec(line)) !== null) {
        const spec = match[1] || match[2] || match[3];
        if (!spec) continue;
        if (spec.startsWith(".")) continue; // relative — covered by the sibling test
        if (spec.startsWith("node:")) continue; // stdlib
        if (ALLOWED_BARE.has(spec)) continue;
        violations.push({ file: relative(CORE_DIR, file), line: i + 1, spec });
      }
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    `Bare-specifier imports outside the allowlist in core/ (no #lib/, #mastra/ edges):\n` +
      violations.map((v) => `  ${v.file}:${v.line}: ${v.spec}`).join("\n"),
  );
});
