#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

function globSync(pattern, { cwd, absolute }) {
  const parts = pattern.split("/");
  const results = [];
  function walk(dir, depth) {
    if (depth >= parts.length) return;
    const segment = parts[depth];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const rel = path.relative(cwd, entryPath);
      if (segment === "**") {
        if (entry.isDirectory()) {
          walk(entryPath, depth);
        }
        if (depth === parts.length - 1 || (depth < parts.length - 1 && entry.isDirectory())) {
          walk(entryPath, depth + 1);
        }
      } else if (segment === "*" || segment === entry.name) {
        if (entry.isDirectory() && depth < parts.length - 1) {
          walk(entryPath, depth + 1);
        } else if (!entry.isDirectory() && depth === parts.length - 1) {
          results.push(absolute ? entryPath : rel);
        }
      }
    }
  }
  walk(cwd, 0);
  return results;
}

function findProjectRoot() {
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, "records"))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

function extractFrontmatter(content) {
  if (!content || typeof content !== "string") return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return null;
  const end = trimmed.indexOf("---", 3);
  if (end === -1) return null;
  const yamlBlock = trimmed.slice(3, end).trim();
  if (!yamlBlock) return null;
  try {
    const parsed = yaml.parse(yamlBlock, { uniqueKeys: false });
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

function hasProductBuildTag(frontmatter) {
  if (!frontmatter || !frontmatter.tags) return false;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
  return tags.includes("product-build");
}

function extractSurfaces(frontmatter) {
  if (!frontmatter || !frontmatter.surfaces) return [];
  return Array.isArray(frontmatter.surfaces) ? frontmatter.surfaces : [frontmatter.surfaces];
}

function checkDecisionRecords(surfaces, recordsDir) {
  const missing = [];
  const found = [];
  for (const surface of surfaces) {
    if (!surface || typeof surface !== "string") continue;
    const surfaceFirstDir = path.join(recordsDir, surface, "decisions");
    const flatDir = path.join(recordsDir, "decisions");
    let hasDecision = false;
    try {
      if (fs.existsSync(surfaceFirstDir)) {
        const files = fs.readdirSync(surfaceFirstDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
        if (files.length > 0) hasDecision = true;
      }
    } catch { /* ignore */ }
    if (!hasDecision) {
      try {
        if (fs.existsSync(flatDir)) {
          const pattern = new RegExp(`\\b${surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          const files = fs.readdirSync(flatDir).filter(
            (f) => (f.endsWith(".yaml") || f.endsWith(".yml")) && pattern.test(f)
          );
          if (files.length > 0) hasDecision = true;
        }
      } catch { /* ignore */ }
    }
    if (hasDecision) found.push(surface);
    else missing.push(surface);
  }
  return { missing, found };
}

function hasPhase0(content) {
  if (!content) return false;
  return /^#{1,2}\s+Phase\s*0\b/mi.test(content);
}

function scanPlans(projectRoot) {
  const violations = [];
  const planFiles = globSync("plans/**/plan.md", { cwd: projectRoot, absolute: true });

  for (const planPath of planFiles) {
    let content;
    try {
      content = fs.readFileSync(planPath, "utf8");
    } catch {
      continue;
    }

    const frontmatter = extractFrontmatter(content);
    if (!frontmatter) continue;
    if (!hasProductBuildTag(frontmatter)) continue;

    // Grandfather completed or cancelled plans
    const status = frontmatter.status;
    if (status === "completed" || status === "cancelled") continue;

    const relPath = path.relative(projectRoot, planPath);

    // Check Phase 0
    if (!hasPhase0(content)) {
      violations.push({ file: relPath, error: "Missing Phase 0" });
    }

    // Check decision records
    const surfaces = extractSurfaces(frontmatter);
    if (surfaces.length > 0) {
      const recordsDir = path.join(projectRoot, "records");
      const { missing } = checkDecisionRecords(surfaces, recordsDir);
      for (const surface of missing) {
        violations.push({ file: relPath, error: `Missing decision records for surface: ${surface}` });
      }
    }
  }

  return { violations, checked: planFiles.length };
}

function report(violations, checked) {
  if (violations.length === 0) {
    console.log(`✓ ${checked} plans checked, 0 violations found`);
    return;
  }

  console.log(`${violations.length} violation(s) found across ${checked} plan(s):\n`);
  for (const v of violations) {
    console.log(`  ${v.file}: ${v.error}`);
  }
}

function main() {
  const projectRoot = findProjectRoot();
  const { violations, checked } = scanPlans(projectRoot);
  report(violations, checked);
  process.exit(violations.length > 0 ? 1 : 0);
}

main();
