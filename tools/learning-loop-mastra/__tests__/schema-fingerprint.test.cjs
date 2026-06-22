// schema-fingerprint.test.cjs
//
// Detects schema drift when @mastra/libsql is bumped. Captures table list +
// per-table column counts as an inline snapshot. A future bump that changes
// the schema fails the test, forcing a deliberate operator review.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createClient } = require("@libsql/client");
const { resolve } = require("node:path");

// Snapshot captured against @mastra/libsql@1.13.0 on 2026-06-22.
// Update via meta_state_log_change on schema bump.
const SNAPSHOT = [
  { name: "mastra_agent_versions", columns: 26 },
  { name: "mastra_agents", columns: 9 },
  { name: "mastra_ai_spans", columns: 42 },
  { name: "mastra_background_tasks", columns: 19 },
  { name: "mastra_channel_config", columns: 3 },
  { name: "mastra_channel_installations", columns: 10 },
  { name: "mastra_dataset_items", columns: 13 },
  { name: "mastra_dataset_versions", columns: 4 },
  { name: "mastra_datasets", columns: 14 },
  { name: "mastra_experiment_results", columns: 15 },
  { name: "mastra_experiments", columns: 18 },
  { name: "mastra_favorites", columns: 4 },
  { name: "mastra_harness_sessions", columns: 21 },
  { name: "mastra_mcp_client_versions", columns: 9 },
  { name: "mastra_mcp_clients", columns: 7 },
  { name: "mastra_mcp_server_versions", columns: 17 },
  { name: "mastra_mcp_servers", columns: 7 },
  { name: "mastra_messages", columns: 7 },
  { name: "mastra_notifications", columns: 31 },
  { name: "mastra_observational_memory", columns: 34 },
  { name: "mastra_prompt_block_versions", columns: 11 },
  { name: "mastra_prompt_blocks", columns: 7 },
  { name: "mastra_resources", columns: 5 },
  { name: "mastra_schedule_triggers", columns: 10 },
  { name: "mastra_schedules", columns: 13 },
  { name: "mastra_scorer_definition_versions", columns: 14 },
  { name: "mastra_scorer_definitions", columns: 7 },
  { name: "mastra_scorers", columns: 30 },
  { name: "mastra_skill_blobs", columns: 5 },
  { name: "mastra_skill_versions", columns: 18 },
  { name: "mastra_skills", columns: 8 },
  { name: "mastra_thread_state", columns: 5 },
  { name: "mastra_threads", columns: 6 },
  { name: "mastra_tool_provider_connections", columns: 8 },
  { name: "mastra_workflow_snapshot", columns: 6 },
  { name: "mastra_workspace_versions", columns: 16 },
  { name: "mastra_workspaces", columns: 7 },
  { name: "parity_records", columns: 4 },
];

test("LibSQL schema fingerprint matches snapshot", { timeout: 10000 }, async () => {
  const dbPath = resolve(__dirname, "..", "data", "mastra-memory.db");
  const db = createClient({ url: `file:${dbPath}` });

  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const names = tables.rows.map((r) => r.name);

  for (const expected of SNAPSHOT) {
    assert.ok(names.includes(expected.name), `missing table: ${expected.name}`);
    const cols = await db.execute(`PRAGMA table_info(${expected.name})`);
    assert.strictEqual(cols.rows.length, expected.columns, `column count mismatch for ${expected.name}`);
  }

  await db.close();
});
