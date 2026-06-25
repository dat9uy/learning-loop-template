import { createLoopWorkflow } from "../create-loop-workflow.js";
import { getParityDb, getParityDDL } from "../../storage.js";
import { z } from "zod";

async function readRecord({ id }) {
  const db = getParityDb();
  await db.execute(getParityDDL());
  const result = await db.execute({
    sql: "SELECT kind, payload, created_at FROM parity_records WHERE id = ?",
    args: [id],
  });
  if (result.rows.length === 0) return { found: false, payload: null };
  const row = result.rows[0];
  return {
    found: true,
    payload: {
      id,
      kind: row.kind,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
    },
  };
}

export const workflowStorageRead = createLoopWorkflow({
  id: "workflow_storage_read",
  description: "Reads a parity record from the Mastra storage substrate (via direct libsql client) by id. Used by storage-parity.test.cjs.",
  inputSchema: {
    id: z.string().describe("Unique record id (TEXT PRIMARY KEY)"),
  },
  steps: [{
    id: "read-record",
    inputSchema: {
      id: z.string(),
    },
    outputSchema: {
      found: z.boolean(),
      payload: z.unknown().nullable(),
    },
    handler: readRecord,
  }],
});
