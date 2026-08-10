/**
 * Tier detector — shared by vitest.config.mjs and the tier guards.
 *
 * Classifies a test file's strongest runtime/process boundary by inspecting
 * EXECUTABLE/IMPORTED process or transport usage, never raw marker strings.
 * The plan (phase-02) mandates call-site detection because the legacy
 * gate-logic tests contain inert `execSync(...)` / `spawn(...)` strings as
 * test DATA (fed to the gate), and session-start-inject-degraded-sources
 * mentions `spawn` only in a comment — raw grep would misclassify both.
 *
 * Detector rules (in priority order):
 *  1. MCP transport / server bootstrap markers (any position): these identify
 *     real MCP client/server usage even when imported indirectly.
 *       - `StdioClientTransport`, `@modelcontextprotocol/sdk/client`,
 *         `connectMcpServer`, `withMcpServer`
 *  2. Real subprocess call-sites whose first arg is `process.execPath` or a
 *     bare identifier (variable carrying the script path). Detected on the
 *     comment-stripped source with string contents masked so inert data like
 *     `'child_process').execSync('...')` in a template literal cannot match.
 *  3. Real binary-name subprocess call-sites (`spawnSync("node", ...)`,
 *     `execFileSync("bash", ...)`, ...). The call must be a real statement:
 *     preceded by `const x =`, `return`, `await`, or a line boundary.
 *     Quoted non-binary first args (e.g. `execSync('pip install')` fed to the
 *     gate) never match.
 *
 * Returns "e2e" | "integration" | "unit" — never undefined.
 */
export const TRANSPORT_MARKERS = [
  "StdioClientTransport",
  "connectMcpServer",
  "withMcpServer",
  "@modelcontextprotocol/sdk/client",
];

const TRANSPORT_RE = /StdioClientTransport|connectMcpServer|withMcpServer|@modelcontextprotocol\/sdk\/client/;
const SUBPROCESS_FNS = ["spawnSync", "execFileSync", "execSync", "spawn"];
const SUBPROCESS_RE = /\b(spawnSync|execFileSync|execSync|spawn)\s*\(\s*([^,\s)]+)/g;
const BINARY_ARGS = ["node", "bash", "git", "jq", "find", "python3", "python", "sh", "zsh", "fallow"];
const BINARY_RE = new RegExp(`^["'](${BINARY_ARGS.join("|")})["']$`);

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Mask string literal contents (keeps quotes) so variable/execPath detection ignores inert data. */
function maskStrings(src) {
  // Process line-by-line so a string regex cannot cross a newline and swallow
  // the whole file (a backslash-free `[^"\\]*` includes \n).
  return src
    .split("\n")
    .map((line) =>
      line
        .replace(/"(\\[\s\S]|[^"\\])*"/g, '""')
        .replace(/'(\\[\s\S]|[^'\\])*'/g, "''")
        .replace(/`(\\[\s\S]|[^`\\])*`/g, "``"),
    )
    .join("\n");
}

/** Detect subprocess calls with execPath/variable first args (string-masked). */
function hasExecOrVarCall(src) {
  const masked = maskStrings(stripComments(src));
  SUBPROCESS_RE.lastIndex = 0;
  let m;
  while ((m = SUBPROCESS_RE.exec(masked))) {
    const arg = m[2].trim();
    if (arg === "process.execPath") return true;
    if (/^[A-Za-z_$][\w$]*$/.test(arg)) return true; // bare identifier → variable carrying the path
  }
  return false;
}

/** Detect real binary-name subprocess call-sites (comment-stripped, strings intact). */
function hasBinaryCall(src) {
  const noComments = stripComments(src);
  const re = /(?:^|\n)\s*(?:const\s+\w+\s*=\s*|return\s+|await\s+|[,;{]\s*)?(spawnSync|execFileSync|execSync|spawn)\s*\(\s*(["'](node|bash|git|jq|find|python3?|sh|zsh|fallow)["'])/gm;
  let m;
  while ((m = re.exec(noComments))) {
    // Confirm the call expression is not inside a string: walk back to ensure
    // the token is a real identifier call, not string data. The preceding
    // boundary group already excludes most inert data; additionally reject if
    // the function token is immediately preceded by a quote.
    const before = noComments.slice(Math.max(0, m.index - 8), m.index);
    if (/["'`]$/.test(before)) continue;
    return true;
  }
  return false;
}

/**
 * Classify a single test file's source.
 * @returns {"e2e" | "integration" | "unit"}
 */
export function classifySource(src) {
  if (TRANSPORT_RE.test(src)) return "e2e";
  if (hasExecOrVarCall(src)) return "e2e";
  if (hasBinaryCall(src)) return "e2e";
  return "unit"; // integration/unit distinction is ownership-based, resolved by the completeness guard
}

/** Parse the E2E_FILES literal out of vitest.config.mjs. */
export function parseConfiguredE2E(configSource) {
  const match = configSource.match(/const E2E_FILES = \[([\s\S]*?)\];/);
  if (!match) throw new Error(`E2E_FILES constant not found in vitest.config.mjs`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"') && line.endsWith('",'))
    .map((line) => line.slice(1, -2));
}
