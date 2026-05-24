import { z } from "zod";
import { findRecordById, resolveRecordDir } from "../../core/record-writer.js";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { renameSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DELETABLE_STATUSES = ["draft", "rejected"];

function getRecordDir(root, recordType, surface) {
  return resolveRecordDir(root, { type: recordType, surface });
}

function getDeletedDir(root, recordType, surface) {
  const baseDir = resolveRecordDir(root, { type: recordType, surface });
  return join(baseDir, ".deleted");
}

export const deleteRecordTool = {
  name: "delete_record",
  description: "Soft-delete a record by moving it to a .deleted/ audit subdirectory. Only draft or rejected records can be deleted. Requires operator_confirmation=true and a reason of at least 20 characters. The record content is preserved in the audit directory for compliance.",
  schema: {
    surface: z.string().describe("Surface the record belongs to"),
    record_id: z.string().describe("ID of the record to delete"),
    record_type: z.enum(["decision", "experiment", "risk"]).describe("Type of record"),
    reason: z.string().min(20).describe("Reason for deletion (minimum 20 characters, for audit log)"),
    operator_confirmation: z.literal(true).describe("Must be true to confirm deletion"),
  },
  handler: async ({ surface, record_id, record_type, reason, operator_confirmation }) => {
    const root = resolveRoot();

    if (!operator_confirmation) {
      return {
        content: [{ type: "text", text: JSON.stringify({ deleted: false, reason: "operator_confirmation_required" }) }],
        isError: true,
      };
    }

    if (!reason || reason.length < 20) {
      return {
        content: [{ type: "text", text: JSON.stringify({ deleted: false, reason: "reason_too_short", min_length: 20 }) }],
        isError: true,
      };
    }

    const dirPath = getRecordDir(root, record_type, surface);
    const found = findRecordById(dirPath, record_id);

    if (!found) {
      return {
        content: [{ type: "text", text: JSON.stringify({ deleted: false, reason: "not_found" }) }],
        isError: true,
      };
    }

    const record = found.data;

    if (!DELETABLE_STATUSES.includes(record.status)) {
      return {
        content: [{ type: "text", text: JSON.stringify({ deleted: false, reason: "status_not_deletable", status: record.status, allowed_statuses: DELETABLE_STATUSES }) }],
        isError: true,
      };
    }

    // Soft delete: move to .deleted/ audit dir
    const deletedDir = getDeletedDir(root, record_type, surface);
    mkdirSync(deletedDir, { recursive: true });

    const filename = found.path.split("/").pop();
    const deletedPath = join(deletedDir, filename);

    // If already deleted, append timestamp
    let finalPath = deletedPath;
    if (existsSync(deletedPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      finalPath = `${deletedPath}.${ts}`;
    }

    renameSync(found.path, finalPath);

    const result = {
      deleted: true,
      id: record_id,
      type: record_type,
      surface,
      original_path: found.path,
      audit_path: finalPath,
      reason,
      deleted_at: new Date().toISOString(),
    };

    console.error(`gate: delete_record ${record_id} → soft-deleted to ${finalPath}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "delete_record",
      surface,
      record_id,
      record_type,
      reason,
      audit_path: finalPath,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
