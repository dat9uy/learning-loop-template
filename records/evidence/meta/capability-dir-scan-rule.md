# Capability Directory Scan Rule

## Observation

Claim-first orientation does not surface evidence files that exist in `records/evidence/<capability>/` but are not yet referenced by the active claim verification block. Static snapshots, migration guides, schema dumps, and prior notes can sit unread by planners following only the current `record_ref` chain.

## Motivating Case

While drafting `plans/260508-2030-vnstock-install-resume/`, the planner initially missed `records/evidence/vnstock-data/unified-ui-snapshot/`, which documents the canonical `vnstock_data` package surface. Without that directory scan, the plan could have used the wrong package and import shape.

## Proposed Rule

After claim-first orientation, list `records/evidence/<capability>/` end-to-end for any files or directories not referenced by the active claim verification block. Read relevant text evidence files. Skip raw, binary, generated, private, or out-of-scope artifacts unless explicitly approved. List relevant files in the plan's "Read for context" section.

## Distinction From Q4 E

Q4 E governs truth-status discovery: orient through claims, not standalone evidence browsing. This rule governs planning-context discovery: scan the capability evidence directory to find context that claims do not yet cite. Truth status of discovered evidence is still determined by claims-first scanning.

## Trigger

- Event class: next-experiment-plan-creation
- Threshold: N=1
- Action when triggered: perform the capability-directory scan; cite this rule in the plan; update operator guidance if the scan surfaces a gap not already described by meta-evidence.

## Deferral

Adopt informally now. Promote to a meta-claim if a second capability experiment confirms the rule's value.
