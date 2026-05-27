import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheckBudget } from "#mcp/core/budget-checker.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  const systemIdx = args.indexOf("--system");
  const resourceIdx = args.indexOf("--resource");
  return {
    system: systemIdx >= 0 ? args[systemIdx + 1] : null,
    resource: resourceIdx >= 0 ? args[resourceIdx + 1] : null,
    allowActiveWindow: args.includes("--allow-active-window"),
  };
}

function main() {
  const scriptRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const args = parseArgs(process.argv);
  const result = runCheckBudget(scriptRoot, args);

  if (result.error) {
    console.error(result.error);
    process.exit(result.code);
  }

  console.log(JSON.stringify(result.output));
  process.exit(result.code);
}

const isMain = import.meta.url.startsWith("file:") && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();
