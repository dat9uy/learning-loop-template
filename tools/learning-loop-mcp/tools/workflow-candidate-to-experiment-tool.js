import { z } from "zod";
import { buildExperimentDraft } from "#mcp/core/candidate-to-experiment/experiment-draft-builder.js";
import { createExperiment } from "#mcp/core/experiment-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { validateSourceRefs } from "#mcp/lib/source-ref-validator.js";

export const workflowCandidateToExperimentTool = {
  name: "workflow_candidate_to_experiment",
  description:
    "Maps a candidate assertion to an experiment draft. " +
    "Reads the candidate assertion by ID, selects a dimension-specific template, " +
    "and generates a ready-to-review experiment record. " +
    "With auto_create=false (default), returns a draft for human review. " +
    "With auto_create=true, creates the experiment record via record_create_experiment. " +
    "The experiment always starts with status: draft and requires_human_approval: true.",
  schema: {
    assertion_id: z.string().describe("The candidate assertion ID to map (e.g., assertion-vnstock-data-install-...). Must have status: candidate."),
    surface: z.string().describe("Surface where the experiment will be created (e.g., 'vnstock', 'product', 'meta')"),
    template_override: z.object({
      goal: z.string().optional(),
      hypothesis: z.string().optional(),
      method: z.array(z.string()).optional(),
      success_metrics: z.array(z.string()).optional(),
    }).optional().describe("Optional override fields for the template. Only provided fields are overridden."),
    auto_create: z.boolean().optional().default(false).describe("If true, creates the experiment record. If false, returns a draft for human review."),
  },
  handler: async ({ assertion_id, surface, template_override, auto_create }) => {
    const root = resolveRoot();

    const result = buildExperimentDraft({
      root,
      surface,
      assertionId: assertion_id,
      overrides: template_override || {},
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: true,
      };
    }

    const { draft, template_used, overrides_applied, candidate } = result;

    // If not auto_create, return draft for review
    if (!auto_create) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            experiment_draft: draft,
            template_used,
            overrides_applied,
            candidate: {
              id: candidate.id,
              status: candidate.status,
              dimension: candidate.dimension,
              assertion: candidate.assertion,
            },
            created: false,
            review_message: "Experiment draft ready for human review. Call with auto_create=true to create the record.",
          }, null, 2),
        }],
      };
    }

    // Auto-create: validate and create the experiment
    const sourceRefs = draft.source_refs || [`record:${assertion_id}`];
    const validation = validateSourceRefs(sourceRefs, "experiment", root);
    if (!validation.valid) {
      return {
        content: [{ type: "text", text: JSON.stringify({ created: false, reason: "invalid_source_refs", errors: validation.errors }) }],
        isError: true,
      };
    }

    const createResult = createExperiment({
      root,
      surface,
      goal: draft.goal,
      hypothesis: draft.hypothesis,
      method: draft.method,
      success_metrics: draft.success_metrics,
      source_refs: sourceRefs,
      scope: draft.scope,
      output_level: draft.output_level,
      assertion_refs: draft.assertion_refs,
    });

    console.error(`gate: workflow_candidate_to_experiment ${surface} ${assertion_id} → ${createResult.created ? "created" : createResult.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "workflow_candidate_to_experiment",
      surface,
      assertion_id,
      ...createResult,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ...createResult,
          template_used,
          overrides_applied,
          candidate: {
            id: candidate.id,
            status: candidate.status,
            dimension: candidate.dimension,
            assertion: candidate.assertion,
          },
          draft_preview: {
            goal: draft.goal,
            hypothesis: draft.hypothesis,
            method: draft.method.slice(0, 2),
            success_metrics: draft.success_metrics.slice(0, 3),
          },
        }, null, 2),
      }],
    };
  },
};
