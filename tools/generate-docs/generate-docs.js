import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function runGenerateDocs() {
  return { error: "docs generation disabled until metadata structure is finalized" };
}

function main() {
  const result = runGenerateDocs();
  console.error(result.error);
  process.exit(1);
}

const isMain = import.meta.url.startsWith("file:") && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();
