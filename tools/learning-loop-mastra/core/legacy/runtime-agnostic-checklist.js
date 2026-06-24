import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

const UNIVERSAL_DIRS = [
  "tools/learning-loop-mastra/core/legacy",
  "tools/learning-loop-mastra/hooks/legacy",
  "tools/learning-loop-mastra/tools/legacy",
];

const SHIM_DIRS = [".claude/coordination/hooks", ".factory/coordination/hooks"];

function loadText(root, relPath) {
  const path = join(root, relPath);
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * Strip block comments, line comments, and template literals from a source
 * text. Returns a "regex-safe" text where the existing CHECKLIST regexes
 * will not false-positive on comments or template-literal contents.
 *
 * Quoted string literals (`"..."`, `'...'`) are intentionally preserved
 * because the hard-coded-surface-path regex matches their contents.
 *
 * KNOWN LIMITATIONS:
 * - Template literals with ${} expressions have the entire literal stripped
 *   (including the expression). The expression's content is lost. Acceptable
 *   for the current CHECKLIST: expressions rarely contain surface paths.
 * - The 9 syntax bypasses flagged in code-review F-2 (forEach, map, for-in,
 *   while, template literals in cross-surface calls, array literals,
 *   raw templates, path.resolve, etc.) are NOT closed by this preprocessor.
 *   The preprocessor eliminates false positives, not bypasses. The audit
 *   remains best-effort; the rule's `enforcement: "agent"` (the agent
 *   itself) is the canonical check.
 */
export function stripCommentsAndStrings(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments /* ... */
    .replace(/\/\/.*$/gm, "") // line comments // ...
    .replace(/`(?:[^`\\]|\\.)*`/g, ""); // template literals `...`
}

function* walkFiles(root, relPath) {
  const full = join(root, relPath);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return;
  }
  if (stat.isFile()) {
    yield relPath;
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const child = join(relPath, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(root, child);
    } else if (entry.isFile()) {
      yield child;
    }
  }
}

function isUnderUniversalDir(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return UNIVERSAL_DIRS.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function isCodeFile(relPath) {
  const ext = extname(relPath);
  return ext === ".js" || ext === ".cjs";
}

function isSurfacesJs(relPath) {
  return relPath.replace(/\\/g, "/").endsWith("tools/learning-loop-mastra/core/legacy/surfaces.js");
}

function isHookFile(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return normalized.includes("/hooks/") && !normalized.includes("/hooks/lib/");
}

function isToolFile(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return normalized.startsWith("tools/learning-loop-mastra/tools/legacy/") && normalized.endsWith("-tool.js");
}

function deriveToolName(relPath) {
  const name = basename(relPath, "-tool.js");
  return name.replace(/-/g, "_");
}

function fail(found, expected, fix_suggestion) {
  return { ok: false, expected, found, fix_suggestion };
}

function pass() {
  return { ok: true };
}

/**
 * Runtime-agnostic checklist — shared between the regression test and the
 * check_runtime_agnostic MCP tool. Each item has an id, human description,
 * and a verify(featurePath, root) function returning { ok, expected?, found?, fix_suggestion? }.
 *
 * REGEX-BASED ITEMS are best-effort, lowest-common-denominator. They match
 * the most common patterns the codebase uses, but DO NOT catch all syntax
 * forms. The 9 known bypass forms (forEach, map, for-in, while, template
 * literals, array literals, raw templates, path.resolve, spread iter) are
 * documented in the code review (F-2) and intentionally not closed by the
 * regex. The audit's job is to catch regressions, not to be a perfect lint.
 *
 * False-positive elimination: the regex-based items run against a
 * comment-and-template-stripped version of the source text (see
 * `stripCommentsAndStrings`). A `.claude` reference inside a `//` or
 * `/* *\/` comment no longer triggers the predicate.
 *
 * The canonical check is the agent itself (the rule's `enforcement: "agent"`).
 * The regex is a regression guard for the most common patterns, not a
 * complete validator.
 */
export const CHECKLIST = [
  {
    id: "core-in-universal-location",
    description: "Primary implementation lives in tools/learning-loop-mastra/{core,hooks,tools}/ (use the universal-dir convention, not a per-surface fork).",
    verify(featurePath, root) {
      const offenders = [];
      for (const file of walkFiles(root, featurePath)) {
        if (!isCodeFile(file)) continue;
        if (!isUnderUniversalDir(file)) offenders.push(file);
      }
      if (offenders.length) {
        return fail(
          offenders.join(", "),
          "feature files under tools/learning-loop-mastra/{core,hooks,tools}/",
          "Move implementation files into tools/learning-loop-mastra/core/, hooks/, or tools/.",
        );
      }
      return pass();
    },
  },
  {
    id: "shims-in-sync",
    description: "If hooks are added, both .claude and .factory shim directories contain the shim (mirror by hand, no helper; see SHIM_DIRS).",
    verify(featurePath, root) {
      const hookFiles = [];
      for (const file of walkFiles(root, featurePath)) {
        if (!isCodeFile(file)) continue;
        if (isHookFile(file)) hookFiles.push(file);
      }
      if (hookFiles.length === 0) return pass();

      const issues = [];
      for (const file of hookFiles) {
        const shimName = basename(file, extname(file)) + ".cjs";
        const [claudeShim, factoryShim] = SHIM_DIRS.map((d) => join(root, d, shimName));
        const claudeExists = existsSync(claudeShim);
        const factoryExists = existsSync(factoryShim);
        if (!claudeExists) issues.push(`${SHIM_DIRS[0]}/${shimName}`);
        if (!factoryExists) issues.push(`${SHIM_DIRS[1]}/${shimName}`);
        if (claudeExists && factoryExists) {
          const claudeHash = createHash("sha256").update(readFileSync(claudeShim, "utf8")).digest("hex");
          const factoryHash = createHash("sha256").update(readFileSync(factoryShim, "utf8")).digest("hex");
          if (claudeHash !== factoryHash) {
            issues.push(`${shimName} (claude=${claudeHash.slice(0, 8)} factory=${factoryHash.slice(0, 8)})`);
          }
        }
      }
      if (issues.length) {
        return fail(
          issues.join(", "),
          "matching shim content in both .claude/coordination/hooks and .factory/coordination/hooks",
          "Add the missing .cjs shim to both runtime coordination directories (or copy the shim so the contents match) so Claude Code and Droid CLI stay in sync.",
        );
      }
      return pass();
    },
  },
  {
    id: "protocol-adapter-i-o",
    description: "Hook I/O is normalized through hooks/lib/protocol-adapter.js (use `parseInput` / `formatOutput` / `normalizeToolName`).",
    verify(featurePath, root) {
      const hookFiles = [];
      for (const file of walkFiles(root, featurePath)) {
        if (!isCodeFile(file)) continue;
        if (isHookFile(file) || SHIM_DIRS.some((d) => file.replace(/\\/g, "/").startsWith(d))) {
          hookFiles.push(file);
        }
      }
      if (hookFiles.length === 0) return pass();

      const offenders = [];
      for (const file of hookFiles) {
        const src = stripCommentsAndStrings(loadText(root, file));
        const usesAdapter =
          src.includes("protocol-adapter") ||
          src.includes("parseInput") ||
          src.includes("formatOutput") ||
          src.includes("normalizeToolName");
        if (!usesAdapter) offenders.push(file);
      }
      if (offenders.length) {
        return fail(
          offenders.join(", "),
          "hook files import from hooks/lib/protocol-adapter.js",
          "Route hook stdin/stdout through hooks/lib/protocol-adapter.js so both Claude Code and Droid CLI speak the same protocol.",
        );
      }
      return pass();
    },
  },
  {
    id: "manifest-registered",
    description: "New MCP tools are listed in tools/learning-loop-mastra/agent-manifest.json (add to a group; `runtime_agnostic`, `gate`, `workflow`, `meta_state`, or `introspection`).",
    verify(featurePath, root) {
      const tools = [];
      for (const file of walkFiles(root, featurePath)) {
        if (isToolFile(file)) tools.push(file);
      }
      if (tools.length === 0) return pass();

      const manifestPath = join(root, "tools/learning-loop-mastra/agent-manifest.json");
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        return fail(
          "missing or unreadable agent-manifest.json",
          "agent-manifest.json to exist and list the tool",
          "Create tools/learning-loop-mastra/agent-manifest.json or add the tool to an existing group.",
        );
      }

      const registered = new Set();
      for (const group of Object.values(manifest.groups || {})) {
        for (const name of group.tools || []) registered.add(name);
      }

      const missing = [];
      for (const file of tools) {
        const name = deriveToolName(file);
        if (!registered.has(name)) missing.push(name);
      }
      if (missing.length) {
        return fail(
          missing.join(", "),
          "tool name in agent-manifest.json groups.*.tools",
          `Register ${missing.join(", ")} in tools/learning-loop-mastra/agent-manifest.json under an appropriate group (gate, workflow, meta_state, introspection, or runtime_agnostic).`,
        );
      }
      return pass();
    },
  },
  {
    id: "cross-surface-iteration",
    description: "Cross-surface iteration uses surfaces.js helpers, not hard-coded surface paths (use `writeToAllSurfaces`, `readFromAllSurfaces`, `appendToAllSurfaces`, `readJsonlFromAllSurfaces`, or `readModifyWriteOnAllSurfaces`).",
    verify(featurePath, root) {
      const offenders = [];
      for (const file of walkFiles(root, featurePath)) {
        if (!isCodeFile(file)) continue;
        if (isSurfacesJs(file)) continue;
        const src = stripCommentsAndStrings(loadText(root, file));
        if (!/\.(claude|factory)|coordination|SURFACES/.test(src)) continue;
        const handRolledLoop = /for\s*\(\s*const\s+\w+\s+of\s+SURFACES\s*\)/.test(src);
        const hardCodedPath = /join\s*\(\s*root\s*,\s*"\.(claude|factory)"/.test(src);
        if (handRolledLoop || hardCodedPath) offenders.push(file);
      }
      if (offenders.length) {
        return fail(
          offenders.join(", "),
          "cross-surface iteration via surfaces.js helpers (writeToAllSurfaces, readFromAllSurfaces, appendToAllSurfaces, readJsonlFromAllSurfaces, readModifyWriteOnAllSurfaces)",
          "Replace hand-rolled for-of-SURFACES loops and hard-coded join(root, '.claude'|'.factory') paths with imports from core/surfaces.js.",
        );
      }
      return pass();
    },
  },
  {
    id: "parameterized-for-new-surfaces",
    description: "SURFACES is the single source of truth for supported runtimes (import `SURFACES` from `core/surfaces.js`; do not hard-code surface names).",
    verify(featurePath, root) {
      const offenders = [];
      for (const file of walkFiles(root, featurePath)) {
        if (!isCodeFile(file)) continue;
        if (isSurfacesJs(file)) continue;
        const src = stripCommentsAndStrings(loadText(root, file));
        const touchesSurfaces = /\.(claude|factory)|coordination/.test(src);
        if (!touchesSurfaces) continue;
        const importsHelpers =
          src.includes('from "./surfaces.js"') ||
          src.includes("from './surfaces.js'") ||
          src.includes('from "../surfaces.js"') ||
          src.includes("from '../surfaces.js'") ||
          src.includes("SURFACES");
        if (!importsHelpers) offenders.push(file);
      }
      if (offenders.length) {
        return fail(
          offenders.join(", "),
          "files that touch runtimes to import from core/surfaces.js or reference SURFACES",
          "Import the cross-surface helpers from core/surfaces.js and use SURFACES as the source of truth instead of hard-coding '.claude' or '.factory'.",
        );
      }
      return pass();
    },
  },
];
