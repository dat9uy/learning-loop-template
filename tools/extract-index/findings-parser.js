const TOP_LEVEL_RE = /^\s*-\s+\[([a-z0-9-]+)\]\s+(.*)$/;
const NESTED_CONTEXT_RE = /^\s+Context:\s*(.*)$/;
const NESTED_CAVEAT_RE = /^\s+Caveat:\s*(.*)$/;
const HEADING_RE = /^##\s+/;
const MAX_ASSERTION_LEN = 8192;
const MAX_CONTINUATION_LINES = 50;

export function parseFindings(text) {
  const lines = text.split("\n");
  let startIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Findings\s*$/.test(lines[i])) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return [];
  }

  const findings = [];
  let current = null;
  let currentField = null;
  let continuationCount = 0;
  let bulletIndex = 0;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (HEADING_RE.test(line)) {
      break;
    }

    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }

    const topMatch = line.match(TOP_LEVEL_RE);
    if (topMatch) {
      if (current) {
        findings.push(current);
      }
      bulletIndex += 1;
      current = {
        topicTag: topMatch[1],
        assertion: topMatch[2],
        context: null,
        caveats: [],
        lineAnchor: `L${i + 1}`,
        bulletIndex,
      };
      currentField = "assertion";
      continuationCount = 0;
      continue;
    }

    const ctxMatch = line.match(NESTED_CONTEXT_RE);
    if (ctxMatch) {
      if (!current) {
        throw new Error(`Line ${i + 1}: nested "Context:" without top-level bullet`);
      }
      current.context = ctxMatch[1];
      currentField = "context";
      continuationCount = 0;
      continue;
    }

    const cavMatch = line.match(NESTED_CAVEAT_RE);
    if (cavMatch) {
      if (!current) {
        throw new Error(`Line ${i + 1}: nested "Caveat:" without top-level bullet`);
      }
      current.caveats.push(cavMatch[1]);
      currentField = "caveat";
      continuationCount = 0;
      continue;
    }

    if (/^-\s+/.test(line)) {
      throw new Error(`Line ${i + 1}: bullet missing [topic-tag] or invalid tag (must match [a-z0-9-]+)`);
    }

    if (/^\s+-\s+/.test(line)) {
      if (!current) {
        throw new Error(`Line ${i + 1}: unknown nested bullet without top-level bullet`);
      }
      console.warn(`Warning: line ${i + 1}: unknown nested bullet, ignoring`);
      currentField = null;
      continuationCount = 0;
      continue;
    }

    if (current && currentField) {
      continuationCount += 1;
      if (continuationCount > MAX_CONTINUATION_LINES) {
        throw new Error(
          `Line ${i + 1}: exceeds max ${MAX_CONTINUATION_LINES} continuation lines for bullet`
        );
      }

      if (currentField === "assertion") {
        current.assertion += " " + trimmed;
        if (current.assertion.length > MAX_ASSERTION_LEN) {
          throw new Error(
            `Line ${i + 1}: assertion exceeds max ${MAX_ASSERTION_LEN} characters`
          );
        }
      } else if (currentField === "context") {
        current.context += " " + trimmed;
      } else if (currentField === "caveat") {
        current.caveats[current.caveats.length - 1] += " " + trimmed;
      }
    }
  }

  if (current) {
    findings.push(current);
  }

  return findings;
}
