import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const WORKFLOW_LOG = ".claude/coordination/workflow-log.jsonl";
const WORKFLOWS_JSON = ".claude/coordination/workflows.json";

function globMatch(pattern, filePath) {
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "⟨GLOBSTAR⟩")
    .replace(/\*/g, "[^/]*")
    .replace(/⟨GLOBSTAR⟩/g, ".*");
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

export function loadRegistry(root) {
  try {
    const path = join(root, WORKFLOWS_JSON);
    if (!existsSync(path)) return { workflows: {} };
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    try {
      const logPath = join(root, WORKFLOW_LOG);
      mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
      appendFileSync(logPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: `Failed to parse workflows.json: ${err.message}`
      }) + "\n");
    } catch { /* log failure never blocks */ }
    return { registry_error: err.message, workflows: {} };
  }
}

export function evaluateWorkflows(path, changeType, root) {
  const registry = loadRegistry(root);
  if (registry.registry_error) return [{ name: "__registry_error", error: registry.registry_error }];
  const matches = [];
  for (const [name, def] of Object.entries(registry.workflows || {})) {
    if (!def.triggers || !def.change_types) continue;
    const triggerMatch = def.triggers.some((t) => globMatch(t, path));
    const typeMatch = def.change_types.includes(changeType);
    if (triggerMatch && typeMatch) matches.push({ name, commands: def.commands });
  }
  return matches;
}

export function validateCommand(cmdArray, root) {
  if (!Array.isArray(cmdArray) || cmdArray.length < 2) return false;
  if (cmdArray[0] !== "node") return false;
  const scriptPath = cmdArray[1];
  if (typeof scriptPath !== "string") return false;
  const resolved = resolve(root || ".", scriptPath);
  const toolsRoot = resolve(root || ".", "tools");
  return resolved === toolsRoot || resolved.startsWith(toolsRoot + sep);
}

export async function triggerWorkflow(name, context, root) {
  const registry = loadRegistry(root);
  if (registry.registry_error) {
    return { triggered: false, registry_error: registry.registry_error };
  }
  const def = (registry.workflows || {})[name];
  if (!def) return { triggered: false, reason: "not_found" };
  if (!def.commands) return { triggered: false, reason: "no_commands" };

  const results = [];
  for (const cmd of def.commands) {
    if (!validateCommand(cmd, root)) {
      results.push({ triggered: false, reason: "not_allowed", cmd });
      continue;
    }
    const child = spawn(
      cmd[0],
      cmd.slice(1).map((a) => {
        if (context?.path && a === "{path}") return context.path;
        if (context?.path && a.includes("{path}")) return a.replaceAll("{path}", context.path);
        return a;
      }),
      {
        cwd: root,
        stdio: "pipe",
        detached: true,
      }
    );

    const logDir = join(root, ".claude", "coordination");
    mkdirSync(logDir, { recursive: true });
    const logPath = join(root, WORKFLOW_LOG);
    const logEntry = {
      timestamp: new Date().toISOString(),
      workflow: name,
      pid: child.pid,
      cmd,
    };
    appendFileSync(logPath, JSON.stringify(logEntry) + "\n");

    child.stdout.on("data", (data) => {
      try {
        appendFileSync(
          logPath,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            workflow: name,
            pid: child.pid,
            stdout: data.toString().trim(),
          }) + "\n"
        );
      } catch {
        // log failure never blocks workflow
      }
    });
    child.stderr.on("data", (data) => {
      try {
        appendFileSync(
          logPath,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            workflow: name,
            pid: child.pid,
            stderr: data.toString().trim(),
          }) + "\n"
        );
      } catch {
        // log failure never blocks workflow
      }
    });
    child.on("exit", (code) => {
      try {
        appendFileSync(
          logPath,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            workflow: name,
            pid: child.pid,
            exit_code: code,
          }) + "\n"
        );
      } catch {
        // log failure never blocks workflow
      }
      if (code !== 0) {
        try {
          appendFileSync(
            join(root, ".claude", "coordination", ".workflow-failures"),
            JSON.stringify({
              timestamp: new Date().toISOString(),
              workflow: name,
              exit_code: code,
            }) + "\n"
          );
        } catch {
          // failure marker write never blocks workflow
        }
      }
    });

    results.push({ triggered: true, pid: child.pid });
  }
  return { triggered: true, results };
}
