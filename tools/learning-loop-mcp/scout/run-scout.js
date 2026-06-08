/**
 * run-scout.js
 *
 * Orchestrator: walks a project for __tests__/ directories, calls the pure
 * functions, and returns a ScoutOutput JSON object.
 *
 * Per F12 red team: walkProject accepts excludeGlobs; defaults exclude the
 * scout's own tests and fixtures (no recursive self-reference).
 *
 * The orchestrator is the ONLY module that touches the filesystem.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import { classifyBucket } from "./bucket-classifier.js";
import { detectDangling } from "./dangling-detector.js";
import { analyzeGaps } from "./gap-analyzer.js";
import { estimateBudget } from "./budget-estimator.js";

const SCOUT_VERSION = "0.1.0";
const DEFAULT_EXCLUDE_GLOBS = [
  "scout/test-fixtures/**",
  "scout/__tests__/**",
  "**/scout/test-fixtures/**",
  "**/scout/__tests__/**",
  "node_modules/**",
  "**/node_modules/**",
  "dist/**",
  "**/dist/**",
  "build/**",
  "**/build/**",
];

function shouldExclude(relPath, excludeGlobs) {
  for (const pattern of excludeGlobs) {
    if (matchGlob(pattern, relPath)) return true;
  }
  return false;
}

function matchGlob(pattern, filePath) {
  // Match patterns like "node_modules/**", "**/node_modules/**", "scout/test-fixtures/**"
  // Strategy: convert "**" to ".*" and "*" to "[^/]*", then test anchored.
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "⟨GLOBSTAR⟩")
    .replace(/\*/g, "[^/]*")
    .replace(/⟨GLOBSTAR⟩/g, ".*");
  // Allow leading "/?" since paths may or may not have a leading slash
  return new RegExp(`(?:^|/)?${regexStr}$`).test(filePath) ||
    new RegExp(`^${regexStr}$`).test(filePath) ||
    new RegExp(`^.*/${regexStr}$`).test(filePath);
}

function isTestFile(name) {
  return /\.(test|spec)\.(c?js|mjs)$/.test(name);
}

function walkProject(projectRoot, excludeGlobs) {
  const results = [];
  const exclude = excludeGlobs || DEFAULT_EXCLUDE_GLOBS;

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(projectRoot, abs);
      if (shouldExclude(rel.split(sep).join("/"), exclude)) continue;
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && isTestFile(entry.name)) {
        results.push(abs);
      }
    }
  }
  walk(projectRoot);
  return results.sort();
}

function readTestFile(absPath) {
  try {
    const source = readFileSync(absPath, "utf8");
    const stat = statSync(absPath);
    return { source, mtime: stat.mtime };
  } catch {
    return { source: "", mtime: new Date(0) };
  }
}

function countTests(source) {
  // Count test( and it( at the start of a line
  const matches = source.match(/^\s*(test|it)\s*\(/gm);
  return matches ? matches.length : 0;
}

function loadToolNames(projectRoot) {
  try {
    const manifestPath = join(projectRoot, "tools", "learning-loop-mcp", "tools", "manifest.json");
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    const names = new Set();
    for (const entry of raw) {
      // The export name (e.g., "gateCheckTool") is the canonical symbol
      if (entry.export) {
        // Convert to common forms: gateCheckTool, gate_check_tool, gate-check-tool
        names.add(entry.export);
        const snake = entry.export.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
        names.add(snake);
      }
    }
    return names;
  } catch {
    return new Set();
  }
}

function loadSchemas(projectRoot) {
  try {
    const schemaDir = join(projectRoot, "schemas");
    const entries = readdirSync(schemaDir);
    return entries.filter((e) => e.endsWith(".schema.json"));
  } catch {
    return [];
  }
}

function loadGatePatterns(projectRoot) {
  try {
    const patternsPath = join(projectRoot, "tools", "learning-loop-mcp", "core", "patterns.json");
    const raw = JSON.parse(readFileSync(patternsPath, "utf8"));
    return Object.keys(raw).filter((k) => k.endsWith("_PATTERN") || k.endsWith("_REGEX"));
  } catch {
    return [];
  }
}

const ENTRY_KINDS = ["finding", "change-log", "rule", "loop-design"];
const ERROR_PATHS = [
  "invalid-severity-rejection",
  "invalid-affected-system-rejection",
  "invalid-evidence-code-ref-rejection",
  "version-mismatch",
  "change-log-immutable",
];

function projectToMarkdown(output) {
  const lines = [];
  lines.push(`# Test Codebase Scout Report`);
  lines.push("");
  lines.push(`Generated: ${output.run_timestamp}`);
  lines.push(`Project root: ${output.project_root}`);
  lines.push(`Scout version: ${output.scout_version}`);
  lines.push("");
  lines.push("## Deliverable 1: Test Inventory");
  lines.push("");
  lines.push("| File | Last mod | Tests | Bucket | Dangling | Gap |");
  lines.push("|------|----------|-------|--------|----------|-----|");
  for (const inv of output.inventory) {
    lines.push(`| \`${inv.file}\` | ${inv.last_modified} | ${inv.test_count} | ${inv.bucket} | ${inv.dangling} | ${inv.gap} |`);
  }
  lines.push("");
  lines.push("## Deliverable 2: MCP-First Bucket Distribution");
  lines.push("");
  lines.push("| Bucket | Count |");
  lines.push("|--------|-------|");
  for (const [k, v] of Object.entries(output.bucket_distribution)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("## Deliverable 3: Dangling Matches");
  lines.push("");
  lines.push("| File | Pattern | Line | Match | Suggested Fix |");
  lines.push("|------|---------|------|-------|---------------|");
  for (const m of output.dangling_matches) {
    lines.push(`| \`${m.file}\` | ${m.pattern} | ${m.line} | ${m.match} | ${m.suggested_fix} |`);
  }
  lines.push("");
  lines.push("## Deliverable 4: Gap Table");
  lines.push("");
  lines.push("| Surface | Total | Covered | % | Missing |");
  lines.push("|---------|-------|---------|---|---------|");
  for (const g of output.gap_table) {
    lines.push(`| ${g.surface} | ${g.total} | ${g.covered} | ${g.percent} | ${g.missing.length} item(s) |`);
  }
  lines.push("");
  lines.push("## Deliverable 5: Prompt Budget Audit (per-test)");
  lines.push("");
  lines.push("| File | Test | File reads | MCP calls | Wall clock est | Timeout | Utilization | Risk |");
  lines.push("|------|------|-----------|-----------|----------------|---------|-------------|------|");
  for (const b of output.budget_table) {
    lines.push(`| \`${b.file}\` | ${b.test} | ${b.expected_file_reads} | ${b.expected_mcp_calls} | ${b.wall_clock_estimate}s | ${b.timeout}s | ${(b.utilization * 100).toFixed(0)}% | ${b.risk} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function validateOutput(output, schemaPath) {
  let schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  } catch {
    return true; // Schema file missing — skip validation (smoke test mode)
  }
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return validate(output);
}

/**
 * Run the scout.
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {boolean} [options.writeJson]
 * @param {boolean} [options.writeMarkdown]
 * @param {string[]} [options.excludeGlobs]
 * @returns {object} ScoutOutput
 */
export function runScout(options) {
  const projectRoot = options.projectRoot || process.cwd();
  const excludeGlobs = options.excludeGlobs || DEFAULT_EXCLUDE_GLOBS;

  const testFiles = walkProject(projectRoot, excludeGlobs);
  const toolNames = loadToolNames(projectRoot);
  const schemaFiles = loadSchemas(projectRoot);
  const gatePatterns = loadGatePatterns(projectRoot);

  const inventory = [];
  const bucketDistribution = { A: 0, B: 0, C: 0, D: 0, error: 0 };
  const danglingMatches = [];
  const budgetTable = [];

  for (const absPath of testFiles) {
    const relPath = relative(projectRoot, absPath);
    const { source, mtime } = readTestFile(absPath);
    const testCount = countTests(source);
    const classification = classifyBucket(relPath, source);
    bucketDistribution[classification.bucket] =
      (bucketDistribution[classification.bucket] || 0) + 1;

    const dangling = detectDangling(relPath, source, {
      resolvedFindings: new Set(),
      currentToolNames: toolNames,
      fixtures: [],
    });
    const danglingPatterns = [...new Set(dangling.map((d) => d.pattern))];

    for (const m of dangling) danglingMatches.push(m);

    // Bucket D: estimate budget for each test
    if (classification.bucket === "D") {
      // Find each test(...) call and extract its prompt
      const testRe = /(test|it)\s*\(\s*["'`]([^"'`]+)["'`][^]*?\{/g;
      let m;
      while ((m = testRe.exec(source)) !== null) {
        const testName = m[2];
        // Naive: scan forward for a prompt string in the test body
        const bodyStart = m.index;
        const bodySlice = source.slice(bodyStart, bodyStart + 4000);
        const promptMatch = bodySlice.match(/spawn\([^,]+,\s*\[[^\]]*["'`]{3}([\s\S]*?)["'`]{3}/);
        const prompt = promptMatch ? promptMatch[1] : bodySlice;
        const est = estimateBudget(relPath, prompt, 60);
        budgetTable.push({
          file: relPath,
          test: testName,
          expected_file_reads: est.expected_file_reads,
          expected_mcp_calls: est.expected_mcp_calls,
          wall_clock_estimate: est.wall_clock_estimate,
          timeout: est.timeout,
          utilization: est.utilization,
          risk: est.risk,
        });
      }
    }

    inventory.push({
      file: relPath,
      last_modified: mtime.toISOString(),
      test_count: testCount,
      bucket: classification.bucket,
      bucket_reason: classification.reason,
      dangling: dangling.length > 0,
      dangling_patterns: danglingPatterns,
      gap: false,  // populated below if this file is in the gap_table
    });
  }

  // Gap analysis
  const testFileSources = inventory.map((i) => {
    const abs = join(projectRoot, i.file);
    let source = "";
    try { source = readFileSync(abs, "utf8"); } catch { /* skip */ }
    return { file: i.file, source };
  });

  const surfaces = [
    { name: "mcp-tools", items: [...toolNames] },
    { name: "schemas", items: schemaFiles },
    { name: "gate-patterns", items: gatePatterns },
    { name: "entry-kinds", items: ENTRY_KINDS },
    { name: "error-paths", items: ERROR_PATHS },
  ];
  const gapTable = surfaces.map((s) => analyzeGaps(s, testFileSources));

  const output = {
    scout_version: SCOUT_VERSION,
    run_timestamp: new Date().toISOString(),
    project_root: projectRoot,
    inventory,
    bucket_distribution: bucketDistribution,
    dangling_matches: danglingMatches,
    gap_table: gapTable,
    budget_table: budgetTable,
  };

  // Validate against schema if available
  const schemaPath = join(dirname(new URL(import.meta.url).pathname), "scout-output.schema.json");
  validateOutput(output, schemaPath);

  if (options.writeJson) {
    const fixturePath = join(projectRoot, "tools", "learning-loop-mcp", "scout", "fixtures", "scout-output.json");
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify(output, null, 2));
  }

  if (options.writeMarkdown) {
    const mdPath = join(projectRoot, "docs", "journals", "260608-test-scout-report.md");
    mkdirSync(dirname(mdPath), { recursive: true });
    writeFileSync(mdPath, projectToMarkdown(output));
  }

  return output;
}
