import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveRoot } from "#lib/resolve-root.js";
import { parseDoc } from "#mcp/core/vendor-doc-assist/doc-parser.js";
import { generateSuggestions } from "#mcp/core/vendor-doc-assist/suggestion-engine.js";
import { queryExistingIndex } from "#mcp/core/vendor-doc-assist/index-querier.js";

export const workflowVendorDocAssistTool = {
  name: "workflow_vendor_doc_assist",
  description:
    "Reads a vendor markdown document and suggests evidence frontmatter + ## Findings bullets. " +
    "The tool does NOT write to records/ — suggestions are transient, human writes the final evidence file. " +
    "Returns suggested_frontmatter, suggested_findings, cross_references, and notes. " +
    "Use WHEN vendor docs need to be converted to structured evidence following the ## Findings convention.",
  schema: {
    surface: z.string().describe("Surface where the vendor doc lives (e.g., vnstock, fastapi, product, meta)"),
    vendor_doc_path: z.string().describe("Repo-relative path to the vendor markdown document"),
    capability: z.string().optional().describe("Optional capability filter to narrow suggestions"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const filePath = resolve(root, args.vendor_doc_path);

    let text;
    try {
      text = await readFile(filePath, "utf-8");
    } catch {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            message: "Vendor doc file not found or unreadable",
            path: args.vendor_doc_path,
          }),
        }],
        isError: true,
      };
    }

    const parsedDoc = parseDoc(text);
    const existingIndex = queryExistingIndex(root, args.capability || null, null);
    const suggestions = generateSuggestions(parsedDoc, {
      capabilityFilter: args.capability || null,
      existingIndex,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          title: parsedDoc.title,
          section_count: parsedDoc.sections.length,
          suggested_frontmatter: suggestions.suggested_frontmatter,
          suggested_findings: suggestions.suggested_findings,
          cross_references: suggestions.cross_references,
          notes: suggestions.notes,
        }),
      }],
    };
  },
};
