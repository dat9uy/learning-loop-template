---
title: "vnstock-data capability runtime execution"
description: "Set up shared environment, install vnstock_data, execute capability scripts, and update learning-loop records."
status: pending
priority: P2
branch: "main"
tags: [vnstock, capabilities, runtime]
blockedBy: []
blocks: []
created: "2026-05-09T17:54:58.757Z"
createdBy: "ck:plan"
source: skill
---

# vnstock-data capability runtime execution

## Overview

Execute the approved capability runtime experiment for vnstock_data. Set up a persistent shared Python environment in `product/`, install the vendor library, run the capability scripts against live endpoints, capture output, and update the learning-loop ledger.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Environment Setup](./phase-01-environment-setup.md) | Pending |
| 2 | [Library Installation](./phase-02-library-installation.md) | Pending |
| 3 | [Capability Execution](./phase-03-capability-execution.md) | Pending |
| 4 | [Record Update](./phase-04-record-update.md) | Pending |

## Dependencies

- Claim `claim-vnstock-install-sandbox` approved for install/runtime sandbox scope.
- Experiment `experiment-vnstock-capabilities-20260509T174957Z` approved.
- Capability scripts staged in `product/capabilities/vnstock-data/`.

## Key Constraints

- **Device limit**: 1 Linux install per account. If this machine is not the registered device, installation will fail.
- **Credential requirement**: vnstock_data installer requires API key via environment variable.
- **Output policy**: `runtime-captured` — allowed to capture metadata, schema-shape, redacted labels, row counts, sample snippets. Blocked: raw data, credentials, full values.
