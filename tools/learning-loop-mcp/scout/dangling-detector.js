/**
 * dangling-detector.js
 *
 * Pure function: run 5 dangling pattern checks on a test file's source code.
 *
 *   D1. Schema-drift               - asserts on removed evidence.code_ref
 *   D2. Resolved-finding dependency - gates on a known-resolved finding id
 *   D3. Removed-tool reference     - imports a tool not in currentToolNames
 *   D4. Stale fixture              - fixture mtime > 30 days, no test refs
 *   D5. Stale TOLERANCES           - hardcoded TOLERANCES without
 *                                    explanatory comment containing
 *                                    {intentional, expected, computed, derived}
 *
 * Per F7 red team: vague "tolerance" comment does NOT suppress D5.
 * Per F9 red team: requires_runtime_check: true is set for D4 (caller decides
 * whether to run the test to confirm staleness).
 *
 * PURE: no I/O. Caller passes fixtures array.
 */

const D1_REGEX = /\.evidence(\.code_ref|\[\s*["']code_ref["']\s*\])/;
const D2_RESOLVED_FINDING_REGEX = /(meta-\d{6}T\d{4}Z-[a-zA-Z0-9-]+)/g;
const D3_IMPORT_REGEX = /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/g;
const D5_TOLERANCES_REGEX = /const\s+TOLERANCES\s*=\s*\[[^\]]+\]/;
const D5_SUPPRESS_KEYWORDS = /\b(intentional|expected|computed|derived)\b/i;
const STALE_FIXTURE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function lineNumberOf(sourceCode, regexMatchIndex) {
  return sourceCode.slice(0, regexMatchIndex).split("\n").length;
}

/**
 * D1 detector: schema-drift on evidence.code_ref
 */
function detectD1(sourceCode) {
  const matches = [];
  let m;
  const re = new RegExp(D1_REGEX, "g");
  while ((m = re.exec(sourceCode)) !== null) {
    matches.push({
      file: "",  // filled by caller
      pattern: "D1",
      line: lineNumberOf(sourceCode, m.index),
      match: m[0],
      suggested_fix:
        "migrate to top-level evidence_code_ref (per meta-260607T0008Z)",
    });
  }
  return matches;
}

/**
 * D2 detector: gates on resolved finding status.
 * Heuristic: any meta-state id referenced near a `status` assertion.
 * If that id is in the resolvedFindings set, flag it.
 */
function detectD2(sourceCode, resolvedFindings) {
  const matches = [];
  if (!resolvedFindings || resolvedFindings.size === 0) return matches;
  // Look for `status` and a finding id in the same test or nearby
  const idRe = /(meta-\d{6}T\d{4}Z-[a-zA-Z0-9-]+)/g;
  let m;
  while ((m = idRe.exec(sourceCode)) !== null) {
    const id = m[1];
    if (!resolvedFindings.has(id)) continue;
    // Check if there's a status-related assertion within 400 chars (broader window)
    const windowStart = Math.max(0, m.index - 400);
    const windowEnd = Math.min(sourceCode.length, m.index + 400);
    const window = sourceCode.slice(windowStart, windowEnd);
    // Match a variety of status assertion styles:
    //   - finding.status === "active" / === 'active'
    //   - assert.equal(finding.status, "active")
    //   - status: "active" (object literal)
    //   - .status === 'active' / 'active' === status
    if (/status/.test(window) && /active/.test(window)) {
      matches.push({
        file: "",
        pattern: "D2",
        line: lineNumberOf(sourceCode, m.index),
        match: id,
        suggested_fix: `gates on resolved finding ${id}; remove the dependency or reset the finding`,
      });
    }
  }
  return matches;
}

/**
 * Normalize a symbol name: returns a Set of common forms (camelCase, snake_case, kebab-case).
 */
function normalizeSymbolForms(sym) {
  const forms = new Set([sym]);
  // camelCase to snake_case
  const snake = sym.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
  forms.add(snake);
  // snake_case to camelCase
  const camel = sym.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  forms.add(camel);
  // snake_case to kebab-case
  forms.add(snake.replace(/_/g, "-"));
  return forms;
}

/**
 * Check if a symbol matches any name in the tool set (across all forms).
 */
function symbolMatchesToolSet(sym, currentToolNames) {
  for (const form of normalizeSymbolForms(sym)) {
    if (currentToolNames.has(form)) return true;
  }
  return false;
}

/**
 * D3 detector: imports a tool not in currentToolNames.
 * For each import, check the imported symbol against the set.
 * Flags both absolute and relative imports; relative imports only count if
 * the import path looks like a tool module (ends in -tool.js).
 * Skips Node.js builtin imports (node:*, fs, path, etc.).
 */
function detectD3(sourceCode, currentToolNames) {
  const matches = [];
  if (!currentToolNames) return matches;
  const re = new RegExp(D3_IMPORT_REGEX.source, "g");
  let m;
  while ((m = re.exec(sourceCode)) !== null) {
    const namedImports = m[1];
    const defaultImport = m[2];
    const importPath = m[3];
    const isRelative = importPath.startsWith(".") || importPath.startsWith("/");
    const isNodeBuiltin = importPath.startsWith("node:") || ["fs", "path", "os", "crypto", "util", "stream", "events", "child_process", "url", "http", "https", "net", "readline", "assert", "test", "node:test", "node:assert"].includes(importPath);
    // Tool path: ends in -tool.js OR contains "-tool-" OR is in a /tools/ dir
    const looksLikeToolPath = /-tool(\.js)?$/.test(importPath) || /-tool-/.test(importPath) || /\/tools\//.test(importPath);

    const checkAndAdd = (sym) => {
      if (!sym) return;
      if (symbolMatchesToolSet(sym, currentToolNames)) return;
      // Skip Node.js builtins entirely
      if (isNodeBuiltin) return;
      // Only flag imports that look like they are importing a tool module.
      // Relative imports are already scoped to tool-like paths; non-relative
      // imports (packages, #mcp/core/, #lib/) must also look like a tool path.
      if (!looksLikeToolPath) return;
      matches.push({
        file: "",
        pattern: "D3",
        line: lineNumberOf(sourceCode, m.index),
        match: `${sym} from "${importPath}"`,
        suggested_fix: "remove import or restore the removed tool",
      });
    };

    if (namedImports) {
      const symbols = namedImports.split(",").map((s) => s.trim());
      for (const sym of symbols) checkAndAdd(sym);
    } else if (defaultImport) {
      checkAndAdd(defaultImport);
    }
  }
  return matches;
}

/**
 * D4 detector: stale fixture (mtime > 30 days, no test references).
 * Caller passes the fixtures array; this function checks each.
 */
function detectD4(fixtures) {
  const matches = [];
  if (!fixtures) return matches;
  const now = Date.now();
  for (const fix of fixtures) {
    if (!fix.path || !fix.lastModified) continue;
    const ageMs = now - new Date(fix.lastModified).getTime();
    const ageDays = ageMs / MS_PER_DAY;
    if (ageDays < STALE_FIXTURE_DAYS) continue;
    if (fix.referencedBy && fix.referencedBy.length > 0) continue;
    matches.push({
      file: "",
      pattern: "D4",
      line: 1,  // fixture-level, not source-line
      match: fix.path,
      suggested_fix: `fixture ${fix.path} is ${Math.round(ageDays)} days old with 0 test references; consider regenerating or archiving`,
      requires_runtime_check: true,
    });
  }
  return matches;
}

/**
 * D5 detector: hardcoded TOLERANCES array with no explanatory comment.
 * Per F7: comment must contain one of {intentional, expected, computed, derived}
 * to suppress the flag. Vague "tolerance" comments do NOT suppress.
 */
function detectD5(sourceCode) {
  const matches = [];
  const re = new RegExp(D5_TOLERANCES_REGEX.source, "g");
  let m;
  while ((m = re.exec(sourceCode)) !== null) {
    const lineNum = lineNumberOf(sourceCode, m.index);
    // Look at the same line for a trailing comment
    const lines = sourceCode.split("\n");
    const sameLine = lines[lineNum - 1] || "";
    const trailingComment = sameLine.split("//").slice(1).join("//");
    // Also check the next line for a leading comment
    const nextLine = lines[lineNum] || "";
    const nextLineComment = nextLine.trim().startsWith("//")
      ? nextLine.split("//").slice(1).join("//")
      : "";
    const allComment = `${trailingComment} ${nextLineComment}`;
    if (D5_SUPPRESS_KEYWORDS.test(allComment)) continue;
    matches.push({
      file: "",
      pattern: "D5",
      line: lineNum,
      match: m[0],
      suggested_fix:
        "add a comment with 'expected'/'intentional'/'computed'/'derived' to explain the value",
    });
  }
  return matches;
}

/**
 * Main detector. Returns DanglingMatch[].
 *
 * @param {string} testFilePath - path of the test file
 * @param {string} sourceCode - source code of the test file
 * @param {object} context - { resolvedFindings, currentToolNames, fixtures }
 * @returns {Array<{file, pattern, line, match, suggested_fix, requires_runtime_check?}>}
 */
export function detectDangling(testFilePath, sourceCode, context) {
  const ctx = context || {};
  const resolved = ctx.resolvedFindings || new Set();
  const tools = ctx.currentToolNames || new Set();
  const fixtures = ctx.fixtures || [];

  const matches = [
    ...detectD1(sourceCode),
    ...detectD2(sourceCode, resolved),
    ...detectD3(sourceCode, tools),
    ...detectD4(fixtures),
    ...detectD5(sourceCode),
  ];

  for (const m of matches) m.file = testFilePath;
  matches.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
  return matches;
}
