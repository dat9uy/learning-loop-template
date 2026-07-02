import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

const UNIVERSAL_DIRS = [
  "tools/learning-loop-mastra/core",
  "tools/learning-loop-mastra/hooks/legacy",
  "tools/learning-loop-mastra/tools/legacy",
];

const SHIM_DIRS = [
  ".claude/coordination/hooks",
  ".factory/coordination/hooks",
  ".mastracode/coordination/hooks",
];

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
// fallow-ignore-next-line unused-export
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
  return relPath.replace(/\\/g, "/").endsWith("tools/learning-loop-mastra/core/surfaces.js");
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
 * Walk the feature path and yield { file, src } for each code file that is not
 * surfaces.js itself, with `src` comment/template-stripped. Shared prologue for
 * the surface-audit checklist items (cross-surface-iteration,
 * parameterized-for-new-surfaces) so they do not duplicate the walk+filter+load.
 */
function* iterAuditCodeFiles(root, featurePath) {
  for (const file of walkFiles(root, featurePath)) {
    if (!isCodeFile(file)) continue;
    if (isSurfacesJs(file)) continue;
    const src = stripCommentsAndStrings(loadText(root, file));
    yield { file, src };
  }
}

/**
 * Build the per-surface shim map for every SHIM_DIRS entry: the sorted .cjs
 * filenames present in that surface's coordination/hooks dir (empty if the dir
 * is absent), plus a name->path lookup. Used by the shims-in-sync verify.
 */
function buildShimMaps(root) {
  return SHIM_DIRS.map((d) => {
    const dir = join(root, d);
    const names = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".cjs")).sort()
      : [];
    return { dir: d, names: new Set(names), byName: new Map(names.map((n) => [n, join(dir, n)])) };
  });
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
    description: "Every runtime surface's coordination/hooks/ directory contains the same set of .cjs shims, byte-identical across all surfaces (.claude, .factory, .mastracode; mirror by hand, no helper; see SHIM_DIRS).",
    // fallow-ignore-next-line complexity
    verify(featurePath, root) {
      // Enumerate the actual .cjs shims in each surface's hooks dir. Shim
      // filenames use a separate convention from the universal hook files
      // (e.g. bash-gate.js -> bash-coordination-gate.cjs), so they cannot be
      // derived from universal hook names — read the real directory contents.
      const perSurface = buildShimMaps(root);

      const allNames = new Set();
      for (const s of perSurface) for (const n of s.names) allNames.add(n);

      const issues = [];
      for (const name of allNames) {
        const present = perSurface.filter((s) => s.byName.has(name));
        if (present.length < perSurface.length) {
          for (const s of perSurface) {
            if (!s.byName.has(name)) issues.push(`${s.dir}/${name}`);
          }
          continue; // missing shim reported; skip content check for this name
        }
        const hashes = present.map((s) =>
          createHash("sha256").update(readFileSync(s.byName.get(name), "utf8")).digest("hex"));
        if (!hashes.every((h) => h === hashes[0])) {
          issues.push(`${name} (hashes differ across surfaces)`);
        }
      }
      if (issues.length) {
        return fail(
          issues.join(", "),
          `same set of .cjs shims, byte-identical, across all surfaces: ${SHIM_DIRS.join(", ")}`,
          "Mirror each .cjs shim byte-identical into every runtime's coordination/hooks/ directory so all surfaces stay in sync.",
        );
      }
      return pass();
    },
  },
  {
    id: "protocol-adapter-i-o",
    description: "Hook I/O is normalized through hooks/lib/protocol-adapter.js (use `parseInput` / `formatOutput` / `normalizeToolName`).",
    // fallow-ignore-next-line complexity
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
      for (const { file, src } of iterAuditCodeFiles(root, featurePath)) {
        if (!/\.(claude|factory)|coordination|SURFACES/.test(src)) continue;
        const handRolledLoop = /for\s*\(\s*const\s+\w+\s+of\s*SURFACES\s*\)/.test(src);
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
      for (const { file, src } of iterAuditCodeFiles(root, featurePath)) {
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
