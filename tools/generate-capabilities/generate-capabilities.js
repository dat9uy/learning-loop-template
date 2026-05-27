import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { adapterRegistry } from "./adapters/registry.js";
import { normalizeEntries } from "./normalizer.js";

const DEFAULT_STACKS = [
  { name: "api", surfaces: ["HTTP/REST"] },
  { name: "web", surfaces: ["TanStack Start route"] },
];

/**
 * Generate capability records from surface adapters.
 * @param {object} opts
 * @param {string} opts.root — repo root
 * @param {string} opts.outDir — output directory (default: records/capabilities)
 * @param {object} [opts.registry] — adapter registry (default: adapterRegistry)
 * @param {Array<{name: string, surfaces: string[]}>} [opts.stacks] — stacks to process
 * @param {boolean} [opts.dryRun] — compare without writing
 * @param {string} [opts.schemaVersion] — schema version to emit
 * @returns {{ drift: boolean, diffs: Array<{file: string, expected: object, actual: object}> }}
 */
function deriveSurfaceFromCapabilityId(id) {
  const m = id.match(/^capability-([a-z0-9]+)-/);
  return m ? m[1] : null;
}

function getCapabilityDir(root, outDir, record) {
  if (outDir) return outDir;
  const surface = deriveSurfaceFromCapabilityId(record.id);
  return join(root, "records", surface || "capabilities", "capabilities");
}

export async function generateCapabilities(opts) {
  const root = opts.root;
  const outDir = opts.outDir || null;
  const registry = opts.registry || adapterRegistry;
  const stacks = opts.stacks || DEFAULT_STACKS;
  const dryRun = opts.dryRun || false;
  const schemaVersion = opts.schemaVersion || "2.0";

  const generatedRecords = [];

  for (const stack of stacks) {
    for (const surface of stack.surfaces) {
      const loader = registry[surface];
      if (!loader) {
        throw new Error(`No adapter registered for surface: ${surface}`);
      }
      const mod = await loader();
      const result = await mod.extract(root);
      const records = normalizeEntries(stack.name, surface, result.entries, schemaVersion);
      generatedRecords.push(...records);
    }
  }

  if (dryRun) {
    const diffs = [];
    for (const record of generatedRecords) {
      const dir = getCapabilityDir(root, outDir, record);
      const filePath = join(dir, `${record.id}.yaml`);
      let actual = null;
      try {
        actual = YAML.parse(readFileSync(filePath, "utf8"));
      } catch {
        diffs.push({ file: record.id, expected: record, actual: null });
        continue;
      }
      // Compare relevant fields only (ignore metadata that may differ)
      if (
        actual.type !== record.type ||
        actual.stack !== record.stack ||
        actual.surface !== record.surface ||
        !mapsEqual(actual.maps, record.maps)
      ) {
        diffs.push({ file: record.id, expected: record, actual });
      }
    }
    // Check for extra files
    const expectedIds = new Set(generatedRecords.map((r) => r.id));
    const seenDirs = new Set();
    for (const record of generatedRecords) {
      seenDirs.add(getCapabilityDir(root, outDir, record));
    }
    for (const dir of seenDirs) {
      let files;
      try {
        files = readdirSync(dir).filter((n) => n.endsWith(".yaml"));
      } catch {
        continue;
      }
      for (const fileName of files) {
        const id = fileName.replace(/\.yaml$/, "");
        if (!expectedIds.has(id)) {
          diffs.push({ file: id, expected: null, actual: YAML.parse(readFileSync(join(dir, fileName), "utf8")) });
        }
      }
    }
    return { drift: diffs.length > 0, diffs };
  }

  for (const record of generatedRecords) {
    const dir = getCapabilityDir(root, outDir, record);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${record.id}.yaml`);
    const yaml = YAML.stringify(record, { sortMapEntries: true });
    writeFileSync(filePath, yaml, "utf8");
  }

  return { drift: false, diffs: [] };
}

function mapsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].source !== b[i].source) return false;
  }
  return true;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const root = process.cwd();
  const result = await generateCapabilities({ root, dryRun });

  if (dryRun) {
    if (result.drift) {
      for (const diff of result.diffs) {
        console.error(`DRIFT: ${diff.file}`);
      }
      process.exit(1);
    }
    console.log("OK — no drift detected");
    process.exit(0);
  }

  for (const record of result.records || []) {
    console.log(`Generated ${record.id}.yaml`);
  }
}

const isMain = import.meta.url.startsWith("file:") && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();
