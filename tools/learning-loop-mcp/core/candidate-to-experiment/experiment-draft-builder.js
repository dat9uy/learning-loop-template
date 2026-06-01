/**
 * Experiment draft builder — builds an experiment draft from a candidate assertion.
 * Reads the candidate from disk, selects the template by dimension, and returns the full draft.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { resolveRoot } from "#lib/resolve-root.js";
import { applyTemplate } from "./template-registry.js";

/**
 * Read a candidate assertion file from the index.
 * @param {string} root — project root
 * @param {string} surface — surface (e.g., vnstock, meta, product)
 * @param {string} assertionId — the candidate assertion ID
 * @returns {object|null} — parsed candidate YAML or null
 */
export function readCandidate(root, surface, assertionId) {
  const candidatePath = resolve(root, "records", surface, "index", `${assertionId}.yaml`);
  try {
    const content = readFileSync(candidatePath, "utf8");
    return parseYaml(content);
  } catch {
    return null;
  }
}

/**
 * Build an experiment draft from a candidate assertion.
 * @param {string} root — project root
 * @param {string} surface — surface
 * @param {string} assertionId — candidate assertion ID
 * @param {object} overrides — optional template overrides (goal, hypothesis, method, success_metrics)
 * @returns {object} — { draft, template_used, overrides_applied, candidate } or error object
 */
export function buildExperimentDraft({ root, surface, assertionId, overrides = {} }) {
  const candidate = readCandidate(root, surface, assertionId);
  if (!candidate) {
    return {
      error: true,
      message: `Candidate assertion not found: ${assertionId} in surface ${surface}`,
    };
  }

  // Validate status is candidate
  if (candidate.status !== "candidate") {
    return {
      error: true,
      message: `Assertion ${assertionId} is not a candidate (status: ${candidate.status}). Only candidate assertions can be mapped to experiments.`,
    };
  }

  const templateResult = applyTemplate(candidate);
  if (!templateResult) {
    return {
      error: true,
      message: `No template available for dimension: ${candidate.dimension}`,
    };
  }

  // Apply overrides
  const draft = {
    ...templateResult,
    ...overrides,
    source_refs: [`record:${assertionId}`],
    assertion_refs: [`record:${assertionId}`],
    verification: {
      claim_refs: [],
      proves: [
        {
          dimension: candidate.dimension,
          scope: candidate.scope || "sandbox",
          output_level: templateResult.output_level || "metadata-only",
        },
      ],
      requires_human_approval: true,
      approval_status: "not-required",
    },
  };

  return {
    draft,
    template_used: candidate.dimension,
    overrides_applied: Object.keys(overrides).length > 0,
    candidate,
  };
}
