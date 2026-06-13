import { parse as parseYaml } from "yaml";

// fallow-ignore-next-line complexity
export function splitFrontmatter(text) {
  const lines = text.split("\n");

  if (lines.length === 0 || lines[0].trim() !== "---") {
    return { meta: null, body: text };
  }

  let inCodeBlock = false;
  let closeIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock && trimmed === "---") {
      closeIndex = i;
      break;
    }
  }

  if (closeIndex === -1) {
    throw new Error("Unclosed frontmatter delimiter '---'");
  }

  const frontmatterLines = lines.slice(1, closeIndex);
  const bodyLines = lines.slice(closeIndex + 1);

  const meta = parseYaml(frontmatterLines.join("\n"));
  const body = bodyLines.join("\n");

  return { meta, body };
}
