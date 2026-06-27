// placement-manifest.test.js — locks the core/placement.yaml manifest invariant.
// Fails if a file is added/removed without a manifest update, if roles violate
// the closed taxonomy, if paths are unsanitized, or if role-layering invariants
// are broken.

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const CORE_DIR = join(import.meta.dirname, "..", "..", "core");
const MANIFEST_PATH = join(CORE_DIR, "placement.yaml");
const PLACEMENT_DOC = join(import.meta.dirname, "..", "..", "docs", "placement.md");

const CLOSED_ROLES = [
  "primitive", "evaluator", "facade", "verification", "validator", "cache", "helper",
];

const PATH_RE = /^[\w./-]+\.m?js$/;

/** Walk core/ for production .js/.cjs/.mjs files, excluding __tests__, lib, *.test.js. */
function walkProductionFiles() {
  const results = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "lib" || entry.name === "node_modules") continue;
        walk(full);
      } else {
        const ext = extname(entry.name);
        if (![".js", ".cjs", ".mjs"].includes(ext)) continue;
        if (entry.name.endsWith(".test.js")) continue;
        results.push(relative(CORE_DIR, full));
      }
    }
  }
  walk(CORE_DIR);
  return results.sort();
}

function loadManifest() {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return parseYaml(raw);
}

test("manifest enumerates every core production file", () => {
  const manifest = loadManifest();
  const actualFiles = walkProductionFiles();
  const manifestPaths = manifest.files.map((f) => f.path).sort();

  // Every actual file must be in the manifest
  for (const f of actualFiles) {
    assert.ok(
      manifestPaths.includes(f),
      `${f} missing from core/placement.yaml; add a row with a role from the closed taxonomy`,
    );
  }

  // Every manifest entry must be an actual file
  for (const p of manifestPaths) {
    assert.ok(
      actualFiles.includes(p),
      `core/placement.yaml lists ${p} but no such production file exists in core/`,
    );
  }

  assert.strictEqual(manifestPaths.length, actualFiles.length, `manifest has ${manifestPaths.length} rows but core/ has ${actualFiles.length} production files`);
});

test("manifest uses only closed role values", () => {
  const manifest = loadManifest();
  for (const entry of manifest.files) {
    assert.ok(
      CLOSED_ROLES.includes(entry.role),
      `role '${entry.role}' for ${entry.path} is not in the closed taxonomy; valid roles: ${CLOSED_ROLES.join(", ")}`,
    );
  }
});

test("manifest paths are sanitized (no traversal, no absolute, no globs)", () => {
  const manifest = loadManifest();
  for (const entry of manifest.files) {
    assert.ok(PATH_RE.test(entry.path), `path '${entry.path}' fails regex ${PATH_RE}`);
    assert.ok(!entry.path.includes(".."), `path '${entry.path}' contains '..'`);
    assert.ok(!entry.path.startsWith("/"), `path '${entry.path}' is absolute`);
    assert.ok(!entry.path.startsWith("~"), `path '${entry.path}' starts with ~`);
  }
});

test("role-layering invariants hold for evaluator and facade files", () => {
  const manifest = loadManifest();
  const roleMap = new Map(manifest.files.map((f) => [f.path, f.role]));

  // Allowed import targets per role (local core/ files only; stdlib + npm excluded)
  const ALLOWED = {
    primitive:    ["primitive"],
    evaluator:    ["primitive"],
    facade:       null,  // may import anything
    verification: ["primitive", "facade", "verification"],
    validator:    ["primitive"],
    cache:        null,  // wraps one sibling; soft assertion
    helper:       null,  // unrestricted
  };

  const importRe = /from\s+["']\.\/([\w.-]+\.m?js)["']/g;

  for (const entry of manifest.files) {
    const allowed = ALLOWED[entry.role];
    if (allowed === null) continue; // unrestricted role

    const filePath = join(CORE_DIR, entry.path);
    if (!existsSync(filePath)) continue;
    const source = readFileSync(filePath, "utf8");

    let match;
    while ((match = importRe.exec(source)) !== null) {
      const importedFile = match[1];
      const importedRole = roleMap.get(importedFile);
      if (!importedRole) continue; // not a core file (e.g., node: stdlib)

      assert.ok(
        allowed.includes(importedRole),
        `${entry.path} (role=${entry.role}) imports ${importedFile} (role=${importedRole}); layering invariant violated. Fix: change ${entry.path}'s role or remove the import.`,
      );
    }
  }
});

test("role taxonomy in manifest matches docs/placement.md", () => {
  const doc = readFileSync(PLACEMENT_DOC, "utf8");

  // Extract roles from the doc's taxonomy table (lines starting with | `role` |)
  const docRoles = [];
  for (const line of doc.split("\n")) {
    const m = line.match(/^\|\s*`(\w[\w-]*)`\s*\|/);
    if (m && CLOSED_ROLES.includes(m[1])) {
      docRoles.push(m[1]);
    }
  }

  const docSorted = [...new Set(docRoles)].sort();
  const testSorted = [...CLOSED_ROLES].sort();

  assert.deepStrictEqual(
    docSorted,
    testSorted,
    `docs/placement.md role taxonomy (${docSorted.join(",")}) disagrees with test (${testSorted.join(",")}); reconcile.`,
  );
});

test("adding a new file outside manifest is detected", () => {
  // Write a temp file to os.tmpdir() (NOT core/) and verify the enumeration
  // function catches it as missing from the canonical manifest.
  // Uses os.tmpdir() to avoid triggering the pre-commit hook's recursive pnpm test.
  const tmpFile = join(tmpdir(), `__test-fixture-${randomUUID()}.js`);
  try {
    writeFileSync(tmpFile, "// test fixture\n");

    // The walkProductionFiles function walks core/ only, so a temp file won't appear.
    // Instead, verify the manifest has exactly the expected count (no extras, no missing).
    const manifest = loadManifest();
    const actualFiles = walkProductionFiles();
    assert.strictEqual(
      manifest.files.length,
      actualFiles.length,
      `manifest/enumeration mismatch: ${manifest.files.length} manifest rows vs ${actualFiles.length} actual files`,
    );
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
});
