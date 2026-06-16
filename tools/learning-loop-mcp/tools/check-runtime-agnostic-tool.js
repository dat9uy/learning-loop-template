import { z } from "zod";
import { existsSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { resolveRoot } from "#lib/resolve-root.js";
import { CHECKLIST } from "#mcp/core/runtime-agnostic-checklist.js";

/**
 * Resolve a user-supplied feature_path relative to the project root.
 * Rejects absolute paths, traversal outside the root, missing files, and directories.
 */
function resolveFeaturePath(root, featurePath) {
  if (!featurePath || typeof featurePath !== "string") {
    throw new Error("feature_path must be a non-empty string");
  }
  if (resolve(featurePath) === featurePath) {
    throw new Error(`feature_path must be relative to the project root; absolute paths are rejected: ${featurePath}`);
  }
  const resolved = resolve(root, featurePath);
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`feature_path escapes project root: ${featurePath}`);
  }
  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    throw new Error(`feature_path does not exist: ${featurePath}`);
  }
  if (stat.isDirectory()) {
    throw new Error(`feature_path is a directory (expected file): ${featurePath}`);
  }
  return relative(root, resolved);
}

const inputSchema = z.object({
  feature_path: z.string().describe("File or directory path (relative to project root) to audit"),
});

export const checkRuntimeAgnosticTool = {
  name: "check_runtime_agnostic",
  description: "Audit a file or directory against the runtime-agnostic checklist (the 6-item pattern codified in rule-runtime-agnostic-features). Use when adding a new feature to verify the shim-not-fork + cross-surface-iteration pattern. Returns structured feedback with fix_suggestion for each failure.",
  schema: { feature_path: z.string() },
  handler: async (raw) => {
    const { feature_path } = inputSchema.parse(raw);
    const root = resolveRoot();
    const relativePath = resolveFeaturePath(root, feature_path);

    const failures = [];
    let items_checked = 0;
    let items_passed = 0;

    for (const item of CHECKLIST) {
      items_checked++;
      const result = item.verify(relativePath, root);
      if (result.ok) {
        items_passed++;
      } else {
        failures.push({
          item_id: item.id,
          description: item.description,
          expected: result.expected,
          found: result.found,
          fix_suggestion: result.fix_suggestion,
        });
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          feature_path,
          items_checked,
          items_passed,
          items_failed: failures.length,
          failures,
        }, null, 2),
      }],
    };
  },
};
