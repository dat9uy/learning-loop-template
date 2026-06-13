/**
 * Generate evidence suggestions from a parsed vendor document.
 * Rule-based heuristic engine — no LLM integration.
 */

const KNOWN_CAPABILITIES = [
  "vnstock-data",
  "fastapi",
  "tanstack",
  "product",
  "meta",
  "loop",
];

const CAPABILITY_ALIASES = {
  "vnstock": "vnstock-data",
  "vnstock-data": "vnstock-data",
  "fastapi": "fastapi",
  "tanstack": "tanstack",
  "product": "product",
  "meta": "meta",
  "loop": "loop",
};

const DIMENSION_KEYWORDS = {
  install: ["install", "setup", "dependency", "requirements", "pip install", "npm install", "package"],
  runtime: ["api", "method", "runtime", "function", "call", "return", "async", "endpoint", "response"],
  static: ["config", "schema", "structure", "format", "type", "field", "property", "interface"],
  product: ["product", "feature", "ui", "ux", "workflow", "user"],
};

function detectCapability(title, sections) {
  const allText = [
    title,
    ...sections.map((s) => s.heading),
  ].join(" ").toLowerCase();

  // Check aliases first (e.g., "vnstock" → "vnstock-data")
  for (const [alias, canonical] of Object.entries(CAPABILITY_ALIASES)) {
    if (allText.includes(alias.toLowerCase())) return canonical;
  }

  // Fallback: check if any heading contains a known capability
  for (const section of sections) {
    const headingLower = section.heading.toLowerCase();
    for (const cap of KNOWN_CAPABILITIES) {
      if (headingLower.includes(cap.toLowerCase())) return cap;
    }
  }

  return "meta"; // default fallback
}

function detectDimension(sections) {
  const allText = sections.map((s) => `${s.heading} ${s.lines.join(" ")}`).join(" ").toLowerCase();

  const scores = {};
  for (const [dim, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
    scores[dim] = keywords.reduce((sum, kw) => sum + (allText.includes(kw) ? 1 : 0), 0);
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : "static";
}

function computeConfidence(section) {
  let score = 0.5;
  if (section.hasTable) score += 0.1;
  if (section.hasCode) score += 0.1;

  // Explicit API shape (code block with method signatures)
  const text = section.lines.join("\n").toLowerCase();
  if (/\b(def |function |class |method|api|endpoint)\b/.test(text)) score += 0.15;
  if (/\b(returns?|return type|output|dataframe|json)\b/.test(text)) score += 0.1;

  return Math.min(0.95, score);
}

function generateTopicTag(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
}

export function generateSuggestions(parsedDoc, { capabilityFilter = null, existingIndex = [] } = {}) {
  const detectedCapability = capabilityFilter || detectCapability(parsedDoc.title, parsedDoc.sections);
  const detectedDimension = detectDimension(parsedDoc.sections);

  const crossReferences = [];
  const suggestedFindings = [];
  const notes = [];

  for (const section of parsedDoc.sections) {
    if (section.level === 1) continue; // Skip title
    if (section.heading.toLowerCase().includes("setup")) continue;
    if (section.heading.toLowerCase().includes("overview")) continue;
    if (section.heading.toLowerCase().includes("introduction")) continue;

    const topicTag = generateTopicTag(section.heading);
    const confidence = computeConfidence(section);

    // Build a descriptive assertion from the section content
    const firstNonEmptyLine = section.lines.find((l) => l.trim() && !l.trim().startsWith("|"));
    let assertion = firstNonEmptyLine
      ? firstNonEmptyLine.trim().replace(/^[-*]\s*/, "")
      : `${section.heading} is documented in the vendor guide.`;

    // Truncate long assertions
    if (assertion.length > 200) {
      assertion = assertion.substring(0, 197) + "...";
    }

    if (confidence >= 0.5) {
      suggestedFindings.push({
        topic_tag: topicTag,
        assertion,
        confidence,
        section_heading: section.heading,
        has_table: section.hasTable,
        has_code: section.hasCode,
      });
    }

    // Check for existing index matches
    for (const existing of existingIndex) {
      const existingCap = existing.capability || "";
      const existingDim = existing.dimension || "";
      const existingTag = existing.topic_tag || "";
      if (existingCap === detectedCapability && existingDim === detectedDimension && existingTag === topicTag) {
        crossReferences.push({
          type: "possibly-superseded",
          existing_id: existing.id,
          topic_tag: topicTag,
          note: `Existing assertion ${existing.id} covers the same topic`,
        });
      }
    }
  }

  const suggestedFrontmatter = {
    capability: detectedCapability,
    dimension: detectedDimension,
    scope: "sandbox",
    validation_status: "pending",
  };

  if (suggestedFindings.length === 0) {
    notes.push("No high-confidence findings found. Consider adding more descriptive sections.");
  }

  return {
    suggested_frontmatter: suggestedFrontmatter,
    suggested_findings: suggestedFindings,
    cross_references: crossReferences,
    notes,
  };
}
