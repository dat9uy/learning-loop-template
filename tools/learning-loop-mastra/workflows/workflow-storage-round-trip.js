import { createLoopWorkflow } from "../create-loop-workflow.js";
import { getParityDb, getParityDDL } from "../storage.js";
import { z } from "zod";

async function writeRecord({ id, kind, payload }) {
  const db = getParityDb();
  await db.execute(getParityDDL());
  const createdAt = new Date().toISOString();
  await db.execute({
    sql: "INSERT OR REPLACE INTO parity_records (id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
    args: [id, kind, JSON.stringify(payload), createdAt],
  });
  return { id, written: true, createdAt };
}

export const workflowStorageRoundTrip = createLoopWorkflow({
  id: "workflow_storage_round_trip",
  description: "Writes a parity record to the Mastra storage substrate (via direct libsql client) and returns the assigned id. Used by storage-parity.test.cjs.",
  inputSchema: {
    id: z.string().describe("Unique record id (TEXT PRIMARY KEY)"),
    kind: z.string().describe("Free-form tag, e.g. 'test-fixture'"),
    payload: z.unknown().describe("JSON-serializable value to persist"),
  },
  steps: [{
    id: "write-record",
    inputSchema: {
      id: z.string(),
      kind: z.string(),
      payload: z.unknown(),
    },
    outputSchema: {
      id: z.string(),
      written: z.boolean(),
      createdAt: z.string(),
    },
    handler: writeRecord,
  }],
});
