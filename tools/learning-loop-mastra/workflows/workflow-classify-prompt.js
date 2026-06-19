import { z } from "zod";

const CATEGORIES = [
  "evidence",
  "assertion",
  "verification",
  "product",
  "observation",
  "skip",
  "external_decision",
  "self_improvement",
];

const KEYWORDS = {
  evidence: ["evidence", "verified", "proof", "finding", "confirmed", "found", "demonstrates"],
  assertion: ["assert", "claim", "should", "must", "guarantee", "assure"],
  verification: ["verify", "test", "run", "execute", "runtime", "sandbox", "pytest", "check"],
  product: ["product", "feature", "endpoint", "api", "ui", "frontend", "backend"],
  observation: ["observation", "noticed", "saw", "record that", "blocks", "allows"],
  skip: ["skip", "ignore", "defer", "not needed", "bypass"],
  external_decision: ["user decided", "customer wants", "stakeholder", "business decision", "approved", "decided", "decision"],
  self_improvement: ["improve", "optimize", "better", "refactor", "enhance", "learn", "heuristic"],
};

const TOOL_MAP = {
  evidence: ["validate_records"],
  assertion: ["validate_records", "update_claim"],
  verification: ["list_probes", "trigger_workflow"],
  product: [],
  observation: ["record_observation", "update_observation"],
  skip: [],
  external_decision: ["update_observation"],
  self_improvement: ["validate_records"],
};

export const workflowClassifyPromptTool = {
  name: "workflow_classify_prompt",
  description:
    "Classifies a user prompt into one of 8 categories using keyword heuristics. " +
    "Use BEFORE routing to specialized tools to determine intent. " +
    "Returns category name, confidence score, and suggested tool names. " +
    "Failure mode: empty prompt returns error.",
  schema: {
    prompt: z.string().describe("The user prompt text to classify"),
  },
  handler: async (args) => {
    const prompt = (args.prompt || "").trim().toLowerCase();
    if (!prompt) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: true, message: "prompt is empty" }) }],
        isError: true,
      };
    }

    const scores = {};
    for (const cat of CATEGORIES) {
      const hits = KEYWORDS[cat].filter((k) => prompt.includes(k)).length;
      scores[cat] = Math.min(1.0, hits * 0.5);
    }

    const best = Object.entries(scores).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return CATEGORIES.indexOf(a[0]) - CATEGORIES.indexOf(b[0]);
    })[0];
    const category = best[1] > 0 ? best[0] : "skip";
    const confidence = Math.round(best[1] * 100) / 100;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          category,
          confidence: confidence || 0.1,
          suggested_tools: TOOL_MAP[category] || [],
        }),
      }],
    };
  },
};
