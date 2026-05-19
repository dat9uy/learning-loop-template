const STATUS_MAP = {
  passed: "active",
  pending: "pending_approval",
  failed: "failed",
};

export function buildIndexEntry({
  finding,
  meta,
  evidencePath,
  hash,
  sourceRefs,
  nCount,
  experimentMap,
  agentRun,
  firstExtractedAt,
  lastUpdatedAt,
}) {
  const status = STATUS_MAP[meta.validation_status];
  if (!status) {
    throw new Error(
      `Unknown validation_status "${meta.validation_status}", expected passed/pending/failed`
    );
  }
  if (status === "failed") {
    return null;
  }

  const localRef = `local:${evidencePath}`;
  const experimentIds = experimentMap.get(localRef) || [];

  return {
    id: `assertion-${meta.capability}-${meta.dimension}-${finding.topicTag}`,
    schema_version: "1.0",
    type: "extracted-assertion",
    status,
    assertion: finding.assertion,
    ...(finding.context !== null && { context: finding.context }),
    caveats: finding.caveats.length ? finding.caveats : undefined,
    capability: meta.capability,
    dimension: meta.dimension,
    scope: meta.scope,
    topic_tag: finding.topicTag,
    n_count: nCount,
    superseded_by: null,
    supersedes: [],
    source_refs: sourceRefs,
    experiment_refs: experimentIds.map((id) => `record:${id}`),
    extraction: {
      agent_run: agentRun,
      first_extracted_at: firstExtractedAt,
      last_updated_at: lastUpdatedAt,
      evidence_immutable_hash: hash,
    },
  };
}
