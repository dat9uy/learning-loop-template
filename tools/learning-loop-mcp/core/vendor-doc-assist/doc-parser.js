/**
 * Parse vendor markdown documents into structured sections.
 * Simple line-based parser — lenient with non-standard markdown.
 */

export function parseDoc(text) {
  const lines = text.split("\n");
  const sections = [];
  let currentSection = null;
  let inCodeBlock = false;
  let hasTable = false;
  let hasCode = false;
  let title = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (/^```\s*/.test(line)) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) hasCode = true;
      if (currentSection) currentSection.lines.push(line);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch && !inCodeBlock) {
      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();

      if (level === 1) {
        // Title is the first H1, not a section
        if (!title) title = heading;
        if (currentSection) {
          currentSection.hasTable = hasTable;
          currentSection.hasCode = hasCode;
          sections.push(currentSection);
        }
        currentSection = null;
        hasTable = false;
        hasCode = false;
        continue;
      }

      if (currentSection) {
        currentSection.hasTable = hasTable;
        currentSection.hasCode = hasCode;
        sections.push(currentSection);
      }
      currentSection = { heading, level, lines: [], hasTable: false, hasCode: false };
      hasTable = false;
      hasCode = false;
      continue;
    }

    // Tables — at least two | characters in a row
    if (!inCodeBlock && /^\|.*\|.*\|/.test(line)) {
      hasTable = true;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  if (currentSection) {
    currentSection.hasTable = hasTable;
    currentSection.hasCode = hasCode;
    sections.push(currentSection);
  }

  return { title: title || "Untitled", sections };
}
