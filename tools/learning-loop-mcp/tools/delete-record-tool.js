import { z } from "zod";
import { findRecordById, resolveRecordDir } from "#mcp/core/record-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { renameSync, mkdirSync, existsSync, readdirSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DELETABLE_STATUSES = ["draft", "rejected"];

function getRecordDir(root, recordType, surface) {
  return resolveRecordDir(root, { type: recordType, surface });
}

function getDeletedDir(root, recordType, surface) {
  const baseDir = resolveRecordDir(root, { type: recordType, surface });
  return join(baseDir, ".deleted");
}

function findEvidenceById(root, surface, id) {
  const dir = join(root, "records", surface, "evidence");
  if (!existsSync(dir)) return null;
  const filename = `${id}.md`;
  const path = join(dir, filename);
  if (!existsSync(path)) return null;
  return { path, filename };
}

function findClaimById(root, surface, id) {
  const dir = join(root, "records", surface, "claims");
  if (!existsSync(dir)) return null;
  const filename = `${id}.yaml`;
  const path = join(dir, filename);
  if (!existsSync(path)) return null;
  return { path, filename };
}

function softDeleteRecord(root, record_type, surface, record_id, found, reason) {
  const record = found.data;

  if (!DELETABLE_STATUSES.includes(record.status)) {
    return {
      result: {
        deleted: false,
        reason: "status_not_deletable",
        status: record.status,
        allowed_statuses: DELETABLE_STATUSES,
      },
      isError: true,
      log: null,
    };
  }

  const deletedDir = getDeletedDir(root, record_type, surface);
  mkdirSync(deletedDir, { recursive: true });

  const filename = found.path.split("/").pop();
  const deletedPath = join(deletedDir, filename);

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

  const log = {
    timestamp: new Date().toISOString(),
    tool: "record_delete",
    surface,
    record_id,
    record_type,
    reason,
    audit_path: finalPath,
  };

  return { result, isError: false, log };
}

function hardDeleteFile(root, record_type, surface, record_id, fileInfo, reason) {
  unlinkSync(fileInfo.path);

  const result = {
    deleted: true,
    id: record_id,
    type: record_type,
    surface,
    original_path: fileInfo.path,
    reason,
    deleted_at: new Date().toISOString(),
  };

  const log = {
    timestamp: new Date().toISOString(),
    tool: "record_delete",
    surface,
    record_id,
    record_type,
    reason,
    hard_delete: true,
  };

  return { result, isError: false, log };
}

export const recordDeleteTool = {
  name: "record_delete",
  description: "Soft-delete a record by moving it to a .deleted/ audit subdirectory (for decision, experiment, risk). Hard-delete evidence and claim files (no audit move, no status check). Requires operator_confirmation=true and a reason of at least 20 characters.",
  schema: {
    surface: z.string().describe("Surface the record belongs to"),
    record_id: z.string().describe("ID of the record to delete"),
    record_type: z.enum(["decision", "experiment", "risk", "evidence", "claim"]).describe("Type of record"),
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

    // Hard-delete paths for evidence and claim
    if (record_type === "evidence") {
      const fileInfo = findEvidenceById(root, surface, record_id);
      if (!fileInfo) {
        return {
          content: [{ type: "text", text: JSON.stringify({ deleted: false, reason: "not_found" }) }],
          isError: true,
        };
      }
      const { result, log } = hardDeleteFile(root, record_type, surface, record_id, fileInfo, reason);
      console.error(`gate: delete_record ${record_id} → hard-deleted ${fileInfo.path}`);
      appendGateLog(root, log);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (record_type === "claim") {
      const fileInfo = findClaimById(root, surface, record_id);
      if (!fileInfo) {
        return {
          content: [{ type: "text", text: JSON.stringify({ deleted: false, reason: "not_found" }) }],
          isError: true,
        };
      }
      const { result, log } = hardDeleteFile(root, record_type, surface, record_id, fileInfo, reason);
      console.error(`gate: delete_record ${record_id} → hard-deleted ${fileInfo.path}`);
      appendGateLog(root, log);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // Soft-delete path for decision, experiment, risk
    const dirPath = getRecordDir(root, record_type, surface);
    const found = findRecordById(dirPath, record_id);

    if (!found) {
      return {
        content: [{ type: "text", text: JSON.stringify({ deleted: false, reason: "not_found" }) }],
        isError: true,
      };
    }

    const { result, isError, log } = softDeleteRecord(root, record_type, surface, record_id, found, reason);

    if (isError) {
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: true,
      };
    }

    console.error(`gate: delete_record ${record_id} → soft-deleted to ${result.audit_path}`);

    appendGateLog(root, log);

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
