import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, resolve, dirname } from "node:path";

const CORE_DIR = join(import.meta.dirname, "..", "..", "core");

function walkJsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip __tests__ subdirs inside core (if any) and lib internals
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      results.push(...walkJsFiles(full));
    } else {
      const ext = extname(entry.name);
      if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
        results.push(full);
      }
    }
  }
  return results;
}

test("core/ has zero @mastra/* imports", () => {
  // The FCIS invariant: functional core has zero framework imports.
  // Matches both ESM `from '@mastra/...'` and CJS `require('@mastra/...')`
  // and dynamic `import('@mastra/...')`.
  const importRe =
    /(?:from\s+['"]@mastra|require\s*\(\s*['"]@mastra|import\s*\(\s*['"]@mastra)/;

  let files;
  try {
    files = walkJsFiles(CORE_DIR);
  } catch (err) {
    if (err.code === "ENOENT") {
      // core/ dir doesn't exist yet (pre-rename) — passes vacuously
      assert.ok(true, "core/ dir does not exist yet; FCIS test passes vacuously");
      return;
    }
    throw err;
  }

  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (importRe.test(lines[i])) {
        violations.push({
          file: relative(CORE_DIR, file),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }

  assert.strictEqual(
    violations.length,
    0,
    `FCIS violation: ${violations.length} @mastra/* import(s) found in core/\n` +
      violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`).join("\n")
  );
});

test("core/ may import from itself (no broken sibling imports)", () => {
  // Verify that every import in core/ that points to another core/ file
  // resolves to an existing file.
  let files;
  try {
    files = walkJsFiles(CORE_DIR);
  } catch (err) {
    if (err.code === "ENOENT") {
      assert.ok(true, "core/ dir does not exist yet; sibling test passes vacuously");
      return;
    }
    throw err;
  }

  // Match actual import/require statements, not string literals.
  // Requires 'import' or 'require' keyword before the path.
  const importRe =
    /(?:^|[{;,])\s*(?:import\s+.*?from|import)\s+['"](\.[^'"]+)['"]|(?:^|[{;,])\s*require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const broken = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      if (line.trimStart().startsWith("//")) continue;
      let match;
      importRe.lastIndex = 0;
      while ((match = importRe.exec(line)) !== null) {
        const importPath = match[1] || match[2];
        if (!importPath) continue;
        // Only check relative imports that stay within core/
        if (!importPath.startsWith(".")) continue;

        const resolved = resolve(dirname(file), importPath);
        // Add .js extension if not present
        const candidates = [resolved];
        if (!extname(resolved)) {
          candidates.push(resolved + ".js", resolved + ".cjs", resolved + ".mjs");
        }

        const exists = candidates.some((c) => existsSync(c));
        if (!exists) {
          broken.push({
            file: relative(CORE_DIR, file),
            line: i + 1,
            import: importPath,
          });
        }
      }
    }
  }

  assert.strictEqual(
    broken.length,
    0,
    `Broken sibling imports in core/:\n` +
      broken.map((b) => `  ${b.file}:${b.line} imports ${b.import}`).join("\n")
  );
});
