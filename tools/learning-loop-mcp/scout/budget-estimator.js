/**
 * budget-estimator.js
 *
 * Pure function: estimate timeout utilization for a bucket-D test prompt.
 *
 * Formula (per brainstorm C5):
 *   wall_clock_estimate = file_reads * 12 + mcp_calls * 8 +
 *                          reasoning_blocks * 6 + toolsearch_overhead * 5 +
 *                          other_io * 3
 *
 * Per F4 red team: comments are stripped before counting (counting
 * strings in comments inflates the estimate).
 *
 * Latencies are configurable via process.env.SCOUT_BUDGET_LATENCIES (JSON).
 * Defaults from brainstorm C5.
 */

const DEFAULT_LATENCIES = {
  fileRead: 12,
  mcpCall: 8,
  reasoningBlock: 6,
  toolsearchOverhead: 5,
  otherIo: 3,
};

// fallow-ignore-next-line complexity
function loadLatencies() {
  if (typeof process !== "undefined" && process.env && process.env.SCOUT_BUDGET_LATENCIES) {
    try {
      return { ...DEFAULT_LATENCIES, ...JSON.parse(process.env.SCOUT_BUDGET_LATENCIES) };
    } catch {
      return DEFAULT_LATENCIES;
    }
  }
  return DEFAULT_LATENCIES;
}

/**
 * Strip comments from source text.
 * Per F4: // and /* ... *\/ (outside strings and regex literals).
 *
 * Simple state machine tracking 'string', "string", `template`, /regex/ states.
 */
// fallow-ignore-next-line complexity
export function stripComments(sourceText) {
  if (!sourceText) return "";
  let result = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inRegex = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < sourceText.length) {
    const ch = sourceText[i];
    const next = sourceText[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        result += ch;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      if (ch === "\n") result += ch;
      i++;
      continue;
    }
    if (inSingle) {
      result += ch;
      if (ch === "'" && sourceText[i - 1] !== "\\") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      result += ch;
      if (ch === '"' && sourceText[i - 1] !== "\\") inDouble = false;
      i++;
      continue;
    }
    if (inTemplate) {
      result += ch;
      if (ch === "`" && sourceText[i - 1] !== "\\") inTemplate = false;
      i++;
      continue;
    }
    if (inRegex) {
      result += ch;
      if (ch === "/" && sourceText[i - 1] !== "\\") inRegex = false;
      i++;
      continue;
    }

    // Detect new states
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      result += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      result += ch;
      i++;
      continue;
    }
    if (ch === "`") {
      inTemplate = true;
      result += ch;
      i++;
      continue;
    }

    result += ch;
    i++;
  }
  return result;
}

/**
 * Estimate timeout utilization.
 *
 * @param {string} filePath - path of the test file (for messages)
 * @param {string} promptText - the prompt given to the bucket-D test
 * @param {number} timeoutSeconds - test timeout in seconds
 * @returns {{
 *   file, expected_file_reads, expected_mcp_calls, expected_reasoning_blocks,
 *   wall_clock_estimate, timeout, utilization, risk
 * }}
 */
// fallow-ignore-next-line complexity
export function estimateBudget(filePath, promptText, timeoutSeconds) {
  const lat = loadLatencies();
  const cleaned = stripComments(promptText || "");

  // expected_file_reads: count of "Read file X" / "Read X" lines, plus "cat" invocations
  // (one regex to count each; do not double-count "Read file X" as both forms)
  const readFileLines = (cleaned.match(/^\s*Read\s+(?:file\s+)?[^\s]+/gm) || []).length;
  const catInvocations = (cleaned.match(/\bcat\s+[^\s]+/g) || []).length;
  const readLines = readFileLines + catInvocations;

  // expected_mcp_calls: count of mcp__learning_loop_mcp__ strings
  const mcpCalls = (cleaned.match(/mcp__learning_loop_mcp__/g) || []).length;

  // expected_reasoning_blocks: count of "##" markdown headings or paragraph breaks (double newlines)
  const headings = (cleaned.match(/^##/gm) || []).length;
  const paragraphs = (cleaned.match(/\n\s*\n/g) || []).length;
  const reasoning = Math.max(1, headings + Math.floor(paragraphs / 3));

  // toolsearch overhead is always 1
  const toolsearch = 1;

  // other_io: heuristic based on prompt length
  let otherIo = 0;
  if (cleaned.length > 2000) otherIo = 2;
  else if (cleaned.length > 500) otherIo = 1;

  const wallClock =
    readLines * lat.fileRead +
    mcpCalls * lat.mcpCall +
    reasoning * lat.reasoningBlock +
    toolsearch * lat.toolsearchOverhead +
    otherIo * lat.otherIo;

  const utilization = timeoutSeconds > 0 ? wallClock / timeoutSeconds : 0;

  let risk;
  if (utilization >= 1.0) risk = "critical";
  else if (utilization >= 0.7) risk = "high";
  else if (utilization >= 0.5) risk = "medium";
  else risk = "low";

  return {
    file: filePath,
    expected_file_reads: readLines,
    expected_mcp_calls: mcpCalls,
    expected_reasoning_blocks: reasoning,
    wall_clock_estimate: wallClock,
    timeout: timeoutSeconds,
    utilization: Math.round(utilization * 100) / 100,
    risk,
  };
}
