import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";

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

function findBudgetFiles(root) {
  const observationsDir = join(root, "records", "observations");
  return readdirSync(observationsDir)
    .filter((name) => name.endsWith("-resource-budget.yaml"))
    .map((name) => join(observationsDir, name));
}

function loadSchema(root) {
  const schemaPath = join(root, "schemas", "resource-budget.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  delete schema.$schema;
  return schema;
}

function isStale(lastVerified) {
  const verified = new Date(lastVerified);
  const now = new Date();
  const diffMs = now - verified;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 7;
}

export function runCheckBudget(root, opts = {}) {
  const { system, resource, allowActiveWindow } = opts;

  if (!system || !resource) {
    return { error: "Missing required arguments: system and resource", code: 2 };
  }

  let schema, validate;
  try {
    schema = loadSchema(root);
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    validate = ajv.compile(schema);
  } catch (err) {
    return { error: `Failed to load schema: ${err.message}`, code: 2 };
  }

  let files;
  try {
    files = findBudgetFiles(root);
  } catch (err) {
    return { error: `No budget files found: ${err.message}`, code: 2 };
  }

  if (files.length === 0) {
    return { error: "No budget files found in records/observations/", code: 2 };
  }

  for (const file of files) {
    let budget;
    try {
      budget = parseYaml(readFileSync(file, "utf8"));
    } catch (err) {
      return { error: `Failed to parse ${file}: ${err.message}`, code: 2 };
    }

    const valid = validate(budget);
    if (!valid) {
      return { error: `Schema validation failed for ${file}: ${JSON.stringify(validate.errors, null, 2)}`, code: 2 };
    }

    if (budget.external_system === system && budget.resource === resource) {
      const remaining = budget.budget - budget.current;
      const stale = isStale(budget.last_verified);
      const output = {
        system: budget.external_system,
        resource: budget.resource,
        budget: budget.budget,
        current: budget.current,
        remaining,
        stale,
        validation_window_active: budget.validation_window?.active ?? false,
        last_verified: budget.last_verified,
      };

      let code = 0;
      if (budget.current >= budget.budget) {
        code = 1;
      } else if (budget.validation_window?.active && !allowActiveWindow) {
        code = 1;
      }

      return { output, code };
    }
  }

  return { error: `No budget found for system=${system} resource=${resource}`, code: 2 };
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
