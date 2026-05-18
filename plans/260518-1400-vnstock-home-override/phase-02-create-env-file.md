---
phase: 2
title: "Create .env file"
status: pending
priority: P3
effort: "5m"
dependencies: []
---

# Phase 2: Create .env file

## Overview

Create `product/api/.env` with `HOME` set to the absolute path of `product/api`. This is a convenience layer for `uv run --env-file .env` usage.

## Related Code Files

- Create: `product/api/.env`

## Implementation Steps

1. Create `product/api/.env` with:
   ```
   HOME=/home/datguy/codingProjects/learning-loop-template/product/api
   ```
2. Add `.env` to `.gitignore` if not already present (contains absolute paths, machine-specific).

## Success Criteria

- [ ] `product/api/.env` exists with correct absolute path
- [ ] `.env` is gitignored or documented as machine-specific
