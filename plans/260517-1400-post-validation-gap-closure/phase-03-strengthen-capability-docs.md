---
phase: 3
title: "Strengthen Capability Docs"
status: completed
priority: P2
effort: "10m"
dependencies: []
---

# Phase 3: Strengthen Capability Docs

## Overview

Add a single disambiguating sentence to the Capability Term Glossary in `docs/artifact-reference.md` to prevent agent confusion between capability scripts (library-level probes) and product integration (FastAPI routes). The existing glossary defines terms but doesn't explicitly state that capability scripts are NOT integration tests.

## Context

During brainstorming, the agent confused capability scripts with FastAPI endpoints. The existing glossary at `docs/artifact-reference.md:325-335` defines three capability terms, and `docs/operator-guide.md:273-279` already states "Capability scripts are distinct from product code (they do not implement product features)" and "they are feasibility probes, not product implementations." The `product/api/capabilities/vnstock-data/README.md` also says "Standalone feasibility scripts." Rather than duplicating the principle in 3 locations, add one sentence to the glossary where agents look first.

## Related Code Files

- Modify: `docs/artifact-reference.md` (add one sentence to Capability Term Glossary)

## Implementation Steps

1. In `docs/artifact-reference.md`, find the "Capability script" row in the Capability Term Glossary table (the row containing "Standalone Python feasibility probe"). Add to that row's Role cell: "Not an integration test for product endpoints."
2. Run `pnpm check` to verify no validation regressions

## Success Criteria

- [ ] `docs/artifact-reference.md` glossary row for "Capability script" includes "Not an integration test for product endpoints."
- [ ] `pnpm check` passes
