export const banner = "<!-- GENERATED FILE: run `pnpm generate:docs`; do not edit directly. -->";

export function list(items) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

export function section(title, body) {
  return [`## ${title}`, "", body, ""].join("\n");
}

export function writeDoc(title, sections) {
  return [banner, "", `# ${title}`, "", ...sections].join("\n").trimEnd() + "\n";
}
