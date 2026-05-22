import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workflowClassifyPromptTool } from "./workflow-classify-prompt-tool.js";
import { workflowIntakeOrientTool } from "./workflow-intake-orient-tool.js";
import { workflowIntakePlanTool } from "./workflow-intake-plan-tool.js";
import { workflowPrepareRuntimeRequestTool } from "./workflow-prepare-runtime-request-tool.js";
import { workflowConvertEvidenceTool } from "./workflow-convert-evidence-tool.js";
import { workflowGeneratePromptTool } from "./workflow-generate-prompt-tool.js";
import { workflowIntentionalSkipTool } from "./workflow-intentional-skip-tool.js";
import { workflowVerifyEvidenceTool } from "./workflow-verify-evidence-tool.js";
import { workflowExternalDecisionTool } from "./workflow-external-decision-tool.js";
import { workflowSelfImprovementTool } from "./workflow-self-improvement-tool.js";
import { workflowReportPhaseStatusTool } from "./workflow-report-phase-status-tool.js";
import { workflowProductBuildTool } from "./workflow-product-build-tool.js";
import { workflowRuntimeProbeTool } from "./workflow-runtime-probe-tool.js";
import { validateRecordsTool } from "./validate-records-tool.js";
import { extractIndexTool } from "./extract-index-tool.js";
import { generateCapabilitiesTool } from "./generate-capabilities-tool.js";

const ROOT = "/home/datguy/codingProjects/learning-loop-template";

describe("agent lifecycle integration", () => {
  it("completes 10-step workflow without opening operator guide", async () => {
    // Step 1: classify prompt
    const classifyResult = await workflowClassifyPromptTool.handler({
      prompt: "I want to verify vnstock install and build a product capability",
    });
    const classifyParsed = JSON.parse(classifyResult.content[0].text);
    assert.equal(classifyParsed.category, "product");
    assert.ok(classifyParsed.confidence >= 0.1);
    assert.ok(Array.isArray(classifyParsed.suggested_tools));

    // Step 2: intake orient
    const orientResult = await workflowIntakeOrientTool.handler({ category: "product" });
    const orientParsed = JSON.parse(orientResult.content[0].text);
    assert.ok(Array.isArray(orientParsed.index_entries));
    assert.ok(orientParsed.index_entries.length > 0);
    assert.ok(Array.isArray(orientParsed.meta_triggers));
    assert.ok(Array.isArray(orientParsed.observations));
    assert.ok(Array.isArray(orientParsed.capability_files));
    assert.ok(Array.isArray(orientParsed.missing_decisions));

    // Step 3: intake plan
    const planResult = await workflowIntakePlanTool.handler({ orient_result: orientParsed });
    const planParsed = JSON.parse(planResult.content[0].text);
    assert.equal(planParsed.status, "ready");
    assert.ok(Array.isArray(planParsed.steps));
    assert.ok(planParsed.steps.length > 0);

    // Step 4: prepare runtime request
    const runtimeResult = await workflowPrepareRuntimeRequestTool.handler({
      dimension: "install",
      scope: "sandbox",
      output_level: "pass/fail",
      command_class: "test",
      temp_root_class: "disposable",
      evidence_missing: false,
      why_local_insufficient: "Need to verify actual package installation in isolated environment",
    });
    const runtimeParsed = JSON.parse(runtimeResult.content[0].text);
    assert.ok(typeof runtimeParsed.approval_request === "string");
    assert.ok(runtimeParsed.approval_request.length > 0);
    assert.ok(Array.isArray(runtimeParsed.pre_conditions));
    assert.ok(runtimeParsed.pre_conditions.length > 0);

    // Step 5: convert evidence with real evidence file
    const evidencePath = "records/meta/evidence/capability-generation-extension.md";
    const convertResult = await workflowConvertEvidenceTool.handler({
      evidence_path: evidencePath,
      mode: "dry_run",
    });
    const convertParsed = JSON.parse(convertResult.content[0].text);
    assert.equal(convertParsed.status, "preview");
    assert.ok(typeof convertParsed.experiment_yaml === "string");
    assert.ok(convertParsed.experiment_yaml.length > 0);
    assert.ok(Array.isArray(convertParsed.source_refs_linked));
    assert.ok(convertParsed.source_refs_linked.some((r) => r.includes(evidencePath)));

    // Step 6: report phase status mid-process -> lifecycle_complete false
    const midStatusResult = await workflowReportPhaseStatusTool.handler({
      process_steps_total: 10,
      process_steps_complete: 5,
      experiment_result: "inconclusive",
    });
    const midStatusParsed = JSON.parse(midStatusResult.content[0].text);
    assert.equal(midStatusParsed.lifecycle_complete, false);
    assert.ok(midStatusParsed.status.includes("Process: 5/10"));

    // Step 7: validate_records -> valid: true
    const validateResult = await validateRecordsTool.handler({ allow_disallowed_fixtures: true });
    const validateParsed = JSON.parse(validateResult.content[0].text);
    assert.equal(validateParsed.valid, true);
    assert.ok(validateParsed.record_count > 0);
    assert.equal(validateParsed.errors.length, 0);

    // Step 8: extract_index_entries -> entries generated
    const extractResult = await extractIndexTool.handler({ dry_run: true });
    const extractParsed = JSON.parse(extractResult.content[0].text);
    assert.ok(typeof extractParsed.stats === "object");

    // Step 9: generate_capability_records -> capability records
    const genResult = await generateCapabilitiesTool.handler({ dry_run: true });
    const genParsed = JSON.parse(genResult.content[0].text);
    assert.ok(typeof genParsed.drift === "boolean");
    assert.ok(Array.isArray(genParsed.diffs));

    // Step 10: final report phase status with complete steps -> lifecycle_complete true
    const finalStatusResult = await workflowReportPhaseStatusTool.handler({
      process_steps_total: 10,
      process_steps_complete: 10,
      experiment_result: "success",
    });
    const finalStatusParsed = JSON.parse(finalStatusResult.content[0].text);
    assert.equal(finalStatusParsed.lifecycle_complete, true);
    assert.ok(finalStatusParsed.status.includes("Process: 10/10"));
    assert.ok(finalStatusParsed.status.includes("Experiment: success"));

    // Additional assertion: operator guide < 120 lines
    const guideText = await readFile(resolve(ROOT, "docs/operator-guide.md"), "utf-8");
    const lineCount = guideText.split("\n").length;
    assert.ok(lineCount < 120, `operator guide has ${lineCount} lines, expected < 120`);

    // Additional assertion: 25 tools registered in manifest
    const manifestText = await readFile(resolve(ROOT, "tools/constraint-gate/tools/manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.length, 32, `expected 32 tools in manifest, found ${manifest.length}`);
  });

  it("exercises additional workflow tools in isolation", async () => {
    // workflow_generate_prompt
    const promptResult = await workflowGeneratePromptTool.handler({
      blueprint: "product-build",
      skeleton: "pre-build",
      context: { goal: "test product build", work_context: ROOT },
    });
    const promptParsed = JSON.parse(promptResult.content[0].text);
    assert.ok(typeof promptParsed.prompt === "string");
    assert.ok(promptParsed.prompt.length > 0);
    assert.ok(Array.isArray(promptParsed.suggested_tools));

    // workflow_intentional_skip
    const skipResult = await workflowIntentionalSkipTool.handler({
      assertion_id: "test-assertion-01",
      skip_reason: "docs-only change, no runtime impact",
      scope: "docs",
    });
    const skipParsed = JSON.parse(skipResult.content[0].text);
    assert.equal(skipParsed.status, "narrowed");
    assert.ok(Array.isArray(skipParsed.records_required));

    // workflow_verify_evidence
    const verifyResult = await workflowVerifyEvidenceTool.handler({
      evidence_path: "records/meta/evidence/evidence-findings-convention.md",
      verification_depth: "shallow",
    });
    const verifyParsed = JSON.parse(verifyResult.content[0].text);
    assert.ok(Array.isArray(verifyParsed.assertion_matrix));
    assert.ok(typeof verifyParsed.counts === "object");

    // workflow_external_decision
    const decisionResult = await workflowExternalDecisionTool.handler({
      source: "operator",
      authority_scope: "frontend",
      confirmed_scope: "frontend",
      remaining_blocks: [],
    });
    const decisionParsed = JSON.parse(decisionResult.content[0].text);
    assert.equal(decisionParsed.acceptance, "full");
    assert.ok(Array.isArray(decisionParsed.records_required));

    // workflow_self_improvement
    const improveResult = await workflowSelfImprovementTool.handler({
      improvement_type: "heuristic-tune",
      description: "Tune classification thresholds",
      proposed_changes: ["adjust keyword weights"],
    });
    const improveParsed = JSON.parse(improveResult.content[0].text);
    assert.equal(improveParsed.experiment_candidate, "heuristic-tune-experiment");
    assert.equal(improveParsed.decision_required, true);

    // workflow_product_build
    const buildResult = await workflowProductBuildTool.handler({
      request_description: "Add REST API for user profiles",
      scope: "api",
      known_constraints: ["OAuth 2.0 required"],
    });
    const buildParsed = JSON.parse(buildResult.content[0].text);
    assert.ok(Array.isArray(buildParsed.assertions));
    assert.ok(buildParsed.assertions.length > 0);
    assert.ok(Array.isArray(buildParsed.risks));

    // workflow_runtime_probe
    const probeResult = await workflowRuntimeProbeTool.handler({
      stack: "nodejs",
      probe_type: "test",
      temp_dir: "/tmp/probe",
    });
    const probeParsed = JSON.parse(probeResult.content[0].text);
    assert.ok(typeof probeParsed.probe_plan === "string");
    assert.ok(Array.isArray(probeParsed.per_stack_commands));
    assert.ok(probeParsed.per_stack_commands.length > 0);
  });
});
