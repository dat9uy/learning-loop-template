/**
 * bucket-classifier.js
 *
 * Pure function: classify a test file into one of A/B/C/D buckets per the
 * brainstorm C1 criteria glossary.
 *
 *   A. MCP-only            - no file I/O in test logic; MCP calls only
 *   B. MCP + setup/teardown - I/O in beforeEach/afterEach only
 *   C. Bypass-MCP          - direct writeEntry/readRegistry/etc. import OR
 *                             fs.writeFileSync in test logic
 *   D. Droid exec          - spawn/exec with "droid" as the first arg
 *
 * Edge cases handled per F3 and F8 red team findings:
 *   - Empty source returns { bucket: "error", reason: "empty source" }
 *   - Nested describe blocks: regex is 1-level deep, counts outermost test
 *   - Source with both C and D triggers: returns D (D is the most real-runtime)
 *
 * The function is PURE: no Date.now(), no I/O, no random.
 */

const BYPASS_IMPORTS = /\b(writeEntry|readRegistry|appendGateLog|updateEntry|deleteEntry)\b/;
const IO_FUNCTION_NAMES = [
  "readFileSync", "readFile", "readdirSync", "createReadStream",
  "mkdtempSync", "statSync", "existsSync", "writeFileSync",
  "appendFileSync", "createWriteStream", "rmSync", "mkdirSync",
  "renameSync", "utimesSync", "copyFileSync", "moveSync",
];
// Match `fs.<name>` (namespaced) OR bare `<name>` when imported
const IO_FUNCTION_REGEX = new RegExp(
  `\\b(?:fs\\.(?:${IO_FUNCTION_NAMES.join("|")})|(?:${IO_FUNCTION_NAMES.join("|")})\\s*\\()`
);
// For C detection: only namespace-prefixed writes count as logic writes
const FS_WRITE_IN_LOGIC = new RegExp(
  `\\bfs\\.(?:${IO_FUNCTION_NAMES.filter((n) => n.includes("write") || n.includes("Sync") || n.includes("rename") || n.includes("mkdir") || n.includes("append")).join("|")})\\b`
);
const DROID_SPAWN = /\b(spawn|exec|execFile|execSync|spawnSync)\s*\(\s*["']droid["']/;
const SPAWN_CALL = /\b(spawn|exec|execFile|execSync|spawnSync)\s*\(/;

// Block boundary detection (1-level deep, per F3)
const BLOCK_START = /^\s*(test|it|beforeEach|afterEach|before|after|describe)\s*\(/;

/**
 * Parse block boundaries from source lines.
 * Returns an array of { kind: "test" | "setup" | "describe", start, end, name }
 * Range is 1-indexed inclusive.
 *
 * Algorithm: line-by-line brace-counting. Nested describes are treated as
 * their outermost test (regex is 1-level deep per F3).
 */
function parseBlockRanges(lines) {
  const ranges = [];
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(BLOCK_START);
    if (m) {
      const kind = m[1];
      stack.push({ kind, start: i + 1, braceDepth: 0 });
    }
    // Track brace depth
    for (const ch of line) {
      if (ch === "{") {
        for (const frame of stack) frame.braceDepth++;
      } else if (ch === "}") {
        for (const frame of stack) frame.braceDepth = Math.max(0, frame.braceDepth - 1);
      }
    }
    // Pop completed frames
    while (stack.length > 0 && stack[stack.length - 1].braceDepth === 0 && /\}/.test(line)) {
      const frame = stack.pop();
      frame.end = i + 1;
      ranges.push(frame);
    }
  }
  return ranges;
}

/**
 * Classify a line number as "test logic" (inside test/it) or "setup" (inside
 * beforeEach/afterEach/before/after).
 */
function classifyLine(lineNum, ranges) {
  for (const r of ranges) {
    if (lineNum >= r.start && lineNum <= (r.end || lineNum)) {
      if (r.kind === "test" || r.kind === "it") return "test";
      if (r.kind === "beforeEach" || r.kind === "afterEach" || r.kind === "before" || r.kind === "after") return "setup";
    }
  }
  return "test"; // top-level code defaults to test logic
}

/**
 * Main classifier.
 * @param {string} testFilePath - path of the test file (for messages)
 * @param {string} sourceCode - source code of the test file
 * @returns {{ bucket: "A" | "B" | "C" | "D" | "error", reason: string }}
 */
export function classifyBucket(testFilePath, sourceCode) {
  if (!sourceCode || sourceCode.trim() === "") {
    return { bucket: "error", reason: "empty source" };
  }

  const lines = sourceCode.split("\n");
  const ranges = parseBlockRanges(lines);

  // D1: any spawn/exec with "droid" as the first arg (priority over C)
  for (let i = 0; i < lines.length; i++) {
    if (DROID_SPAWN.test(lines[i])) {
      return {
        bucket: "D",
        reason: `spawns child_process with droid binary at line ${i + 1}`,
      };
    }
  }

  // C: bypass-MCP (direct imports OR writeFileSync in test logic)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (BYPASS_IMPORTS.test(line)) {
      // Check the import line itself OR a line inside a test block
      return {
        bucket: "C",
        reason: `imports bypass function from core/meta-state.js at line ${i + 1}`,
      };
    }
    const ctx = classifyLine(i + 1, ranges);
    if (ctx === "test" && FS_WRITE_IN_LOGIC.test(line)) {
      return {
        bucket: "C",
        reason: `writes via fs.writeFileSync in test logic at line ${i + 1}`,
      };
    }
  }

  // B: I/O in setup/teardown blocks (and no C triggers)
  for (let i = 0; i < lines.length; i++) {
    const ctx = classifyLine(i + 1, ranges);
    if (ctx === "setup" && IO_FUNCTION_REGEX.test(lines[i])) {
      return {
        bucket: "B",
        reason: "I/O in setup/teardown blocks only (beforeEach/afterEach)",
      };
    }
  }

  // A: MCP-only default
  // If there are no test ranges at all (only describes or top-level code), still A
  return {
    bucket: "A",
    reason: "no file I/O; MCP-only logic",
  };
}
