import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function parseArgs() {
  const args = process.argv.slice(2);
  const systemIdx = args.indexOf("--system");
  const resourceIdx = args.indexOf("--resource");
  return {
    system: systemIdx >= 0 ? args[systemIdx + 1] : null,
    resource: resourceIdx >= 0 ? args[resourceIdx + 1] : null,
    allowActiveWindow: args.includes("--allow-active-window"),
  };
}

function findBudgetFiles() {
  const observationsDir = join(root, "records", "observations");
  return readdirSync(observationsDir)
    .filter((name) => name.endsWith("-resource-budget.yaml"))
    .map((name) => join(observationsDir, name));
}

function loadSchema() {
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

function main() {
  const { system, resource, allowActiveWindow } = parseArgs();

  if (!system || !resource) {
    console.error("Usage: node check-budget.js --system <system> --resource <resource>");
    process.exit(2);
  }

  const schema = loadSchema();
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const files = findBudgetFiles();
  if (files.length === 0) {
    console.error("No budget files found in records/observations/");
    process.exit(2);
  }

  for (const file of files) {
    let budget;
    try {
      budget = parseYaml(readFileSync(file, "utf8"));
    } catch (err) {
      console.error(`Failed to parse ${file}: ${err.message}`);
      process.exit(2);
    }

    const valid = validate(budget);
    if (!valid) {
      console.error(`Schema validation failed for ${file}:`);
      console.error(JSON.stringify(validate.errors, null, 2));
      process.exit(2);
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

      console.log(JSON.stringify(output));

      if (budget.current >= budget.budget) {
        process.exit(1);
      }
      if (budget.validation_window?.active && !allowActiveWindow) {
        process.exit(1);
      }
      process.exit(0);
    }
  }

  console.error(`No budget found for system=${system} resource=${resource}`);
  process.exit(2);
}

main();
