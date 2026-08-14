import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { PARTICIPANT_SURFACES, SURFACES } from "./surfaces.js";

const UNIVERSAL_DIRS = [
  "tools/learning-loop-mastra/core",
  "tools/learning-loop-mastra/hooks/universal",
  "tools/learning-loop-mastra/tools/handlers",
];

// Shim parity scans only the retained project-local mirror consumers. Codex is
// a participant, but its native Initial Delivery adapter has no shim mirror.
const SHIM_DIRS = SURFACES.map((surface) => `${surface}/coordination/hooks`);

// Surface-name regex fragments are derived from Runtime Topology. Surface
// names start with ".", a regex metachar, so the alternation matches the
// leading dot literally via `\.(...)`.
const SURFACE_NAMES = [...new Set(PARTICIPANT_SURFACES)].map((s) => s.slice(1));
const SURFACE_ALT = SURFACE_NAMES.join("|");
const HAND_CODED_SURFACE_PATH = new RegExp(`join\\s*\\(\\s*root\\s*,\\s*"\\.(${SURFACE_ALT})"`);
const TOUCHES_SURFACES = new RegExp(`\\.(${SURFACE_ALT})|coordination`);
const TOUCHES_SURFACES_OR_KEYWORDS = new RegExp(`\\.(${SURFACE_ALT})|coordination|SURFACES`);

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
 *   remains best-effort; the rule's `internalization_level: "I2"` (the agent
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
  return relPath.replace(/\\/g, "/").endsWith("tools/learning-loop-mastra/core/surfaces.js");
}

function isHookFile(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return normalized.includes("/hooks/") && !normalized.includes("/hooks/lib/");
}

function isToolFile(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return normalized.startsWith("tools/learning-loop-mastra/tools/handlers/") && normalized.endsWith("-tool.js");
}

/**
 * Read a tool's canonical name from its handler module source: the `name`
 * field of the top-level `export const <Name>Tool = { ... }` object. The
 * filename stem is NOT authoritative (e.g. gate-tool.js exports gate_check,
 * notify-artifact-tool.js exports workflow_notify_artifact), and a naive
 * first-`name:` grep can hit schema-field names above the export, so the
 * match is anchored on the export declaration. Returns null when no export
 * object with a name field is found.
 */
function readToolNameFromSource(src) {
  const match = /export\s+const\s+\w+\s*=\s*\{[\s\S]*?\bname:\s*"([^"]+)"/.exec(src);
  return match ? match[1] : null;
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
 * Shim filename → universal hook key map. The shim filename convention
 * (e.g. `bash-coordination-gate.cjs`) is fixed by the shim writer; the
 * universal hook key (e.g. `bash-gate`) is the basename without extension
 * of the file in tools/learning-loop-mastra/hooks/universal/. Both names
 * are stable in the repo. Keep this mapping authoritative — if a shim is
 * renamed, the corresponding universal hook entry in hooks-lock.json must
 * follow.
 */
const SHIM_NAME_TO_HOOK_KEY = Object.freeze({
  "bash-coordination-gate.cjs": "bash-gate",
  "write-coordination-gate.cjs": "write-gate",
  "inbound-state-gate.cjs": "inbound-gate",
  "recurrence-check-on-start.cjs": "recurrence-check-on-start",
  "toolchain-failure-capture.cjs": "toolchain-failure-capture",
});

/**
 * Load hooks-lock.json from the repo root if present. Returns null when
 * the manifest is missing/unreadable/malformed — the shims-in-sync
 * no-manifest fallback is "assert across ALL SHIM_DIRS" (legacy
 * behavior), so missing manifests never fail the check.
 */
function loadHooksManifest(root) {
  const path = join(root, "hooks-lock.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.hooks !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Return the surface names that the manifest declares as `kind:"shim"` for
 * the given hook key. Returns null if no manifest, or empty Set if the
 * manifest exists but the hook is unknown / declares no shim surfaces.
 */
function shimSurfacesForHook(manifest, hookKey) {
  if (!manifest) return null;
  const entry = manifest?.hooks?.[hookKey];
  if (!entry || !entry.wiring) return new Set();
  const out = new Set();
  for (const [surface, wiring] of Object.entries(entry.wiring)) {
    if (wiring && wiring.kind === "shim") out.add(surface);
  }
  return out;
}

/**
 * Build the set of shim filenames the manifest declares any surface to
 * wire as kind:"shim" for. The shim name is derived from each shim
 * wiring's `ref` basename (the manifest is authoritative), so a newly
 * added shim-wired hook requires no map update to be enumerated.
 * Returns null when no manifest (so the caller can skip this union —
 * there is nothing manifest-declared to enumerate). Used to union
 * manifest-declared shim names into the parity iteration, so a
 * deleted/missing shim is checked instead of silently passing.
 */
function manifestDeclaredShimNames(manifest) {
  if (!manifest || !manifest.hooks) return null;
  const out = new Set();
  for (const entry of Object.values(manifest.hooks)) {
    if (!entry || !entry.wiring) continue;
    for (const wiring of Object.values(entry.wiring)) {
      if (wiring && wiring.kind === "shim" && typeof wiring.ref === "string") {
        out.add(wiring.ref.split("/").pop());
      }
    }
  }
  return out;
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
 * The canonical check is the agent itself (the rule's `internalization_level: "I2"`).
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
    description: "Every runtime surface wired as kind:\"shim\" in hooks-lock.json carries that hook's .cjs shim byte-identical across those surfaces; kind:\"direct\"/\"adapter\"/\"none\" surfaces are filtered out of the parity set.",
    // fallow-ignore-next-line complexity -- shim-parity verify closure (scan surfaces → resolve parity set → compare bytes); parity-set resolution branches are distinct fallback cases
    verify(featurePath, root) {
      // Enumerate the actual .cjs shims in each surface's hooks dir. Shim
      // filenames use a separate convention from the universal hook files
      // (e.g. bash-gate.js -> bash-coordination-gate.cjs), so they cannot be
      // derived from universal hook names — read the real directory contents.
      //
      // When hooks-lock.json is present, the parity set per shim is
      // restricted to the surfaces the manifest declares as `kind:"shim"`
      // for that shim's hook key. Missing manifest falls back to legacy
      // parity across ALL SHIM_DIRS (existing fixture semantics).
      // Unknown shim filename (not in SHIM_NAME_TO_HOOK_KEY) falls back to
      // legacy parity across all containing surfaces — keeps developer
      // experiments from being flagged when the manifest isn't updated.
      const perSurface = buildShimMaps(root);
      const manifest = loadHooksManifest(root);

      // Step 1: enumerate shim names.
      //   - All observed .cjs filenames in any SHIM_DIRS (existing scan).
      //   - PLUS every shim name the manifest declares kind:"shim" for, even
      //     if missing on every surface — an observed-only iteration would
      //     miss declared-but-missing shims and pass on an empty fixture
      //     root (false green).
      const allNames = new Set();
      for (const s of perSurface) for (const n of s.names) allNames.add(n);
      const declared = manifestDeclaredShimNames(manifest);
      if (declared) for (const n of declared) allNames.add(n);

      const issues = [];
      for (const name of allNames) {
        const hookKey = SHIM_NAME_TO_HOOK_KEY[name];
        const declaredShimSurfaces = hookKey ? shimSurfacesForHook(manifest, hookKey) : null;
        // Parity set:
        //   - Manifest present + known shim name → manifest's kind:"shim"
        //     surfaces for that hook (the surfaces that MUST carry the shim,
        //     byte-identical). If declared set is empty, no surface is
        //     expected to carry this shim — it is dead code, skip entirely.
        //   - No manifest OR unknown shim name → ALL SHIM_DIRS (legacy).
        const useLegacyAll = declaredShimSurfaces == null;
        const declaredEmpty = declaredShimSurfaces && declaredShimSurfaces.size === 0;
        let paritySurfaceDir;
        if (useLegacyAll) {
          paritySurfaceDir = perSurface;
        } else if (declaredEmpty) {
          // Manifest says no surface wires this hook as kind:"shim" — the
          // shim is dead code. Skip; do NOT silently fallback to all surfaces
          // (that would flag a deleted dead-code shim as a byte-drift failure).
          continue;
        } else {
          paritySurfaceDir = perSurface.filter((s) => declaredShimSurfaces.has(s.dir.split("/")[0]));
        }

        if (paritySurfaceDir.length === 0) {
          // Defensive: manifest declared kind:"shim" surfaces that aren't in
          // SHIM_DIRS (e.g. an unknown runtime surface). Should never happen
          // with SURFACES-derived SHIM_DIRS but skip to avoid phantom issues.
          continue;
        }

        const present = paritySurfaceDir.filter((s) => s.byName.has(name));
        if (present.length < paritySurfaceDir.length) {
          for (const s of paritySurfaceDir) {
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
          `same set of .cjs shims, byte-identical, across kind:"shim" surfaces per hooks-lock.json`,
          "Mirror each .cjs shim byte-identical into every runtime's coordination/hooks/ directory the manifest declares as kind:\"shim\" for that hook.",
        );
      }
      return pass();
    },
  },
  {
    id: "protocol-adapter-i-o",
    description: "Hook I/O is normalized through hooks/lib/protocol-adapter.js (use `parseInput` / `formatOutput` / `normalizeToolName`).",
    // fallow-ignore-next-line complexity -- protocol-adapter verify closure (collect hook files → scan I/O usage → fail/pass); linear scan with guard branches
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
          "Route hook stdin/stdout through hooks/lib/protocol-adapter.js so retained hook runtimes speak the same protocol.",
        );
      }
      return pass();
    },
  },
  {
    id: "manifest-registered",
    description: "New MCP tools are listed in tools/learning-loop-mastra/agent-manifest.json (add to a group; `runtime_agnostic`, `gate`, `workflow`, `meta_state`, or `introspection`).",
    // fallow-ignore-next-line complexity -- manifest-registered verify closure (collect tool files → load manifest → reconcile); linear scan with guard branches
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
        const name = readToolNameFromSource(loadText(root, file));
        if (!name) {
          missing.push(`${file} (no exported name field)`);
          continue;
        }
        // Manifest entries carry the mastra_ MCP prefix; a few legacy entries
        // are unprefixed, so accept either form.
        if (!registered.has(`mastra_${name}`) && !registered.has(name)) missing.push(name);
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
        if (!TOUCHES_SURFACES_OR_KEYWORDS.test(src)) continue;
        const handRolledLoop = /for\s*\(\s*const\s+\w+\s+of\s*SURFACES\s*\)/.test(src);
        const hardCodedPath = HAND_CODED_SURFACE_PATH.test(src);
        if (handRolledLoop || hardCodedPath) offenders.push(file);
      }
      if (offenders.length) {
        return fail(
          offenders.join(", "),
          "cross-surface iteration via surfaces.js helpers (writeToAllSurfaces, readFromAllSurfaces, appendToAllSurfaces, readJsonlFromAllSurfaces, readModifyWriteOnAllSurfaces)",
          "Replace hand-rolled for-of-SURFACES loops and hard-coded runtime paths with imports from core/surfaces.js.",
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
        const touchesSurfaces = TOUCHES_SURFACES.test(src);
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
          "Import the cross-surface helpers from core/surfaces.js and use SURFACES as the source of truth instead of hard-coding runtime surfaces.",
        );
      }
      return pass();
    },
  },
];
