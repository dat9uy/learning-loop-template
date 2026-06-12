# Archived Product-Surface Records

## Why

These records were archived during Phase A of the meta-surface re-debate (plan 260612-1700-meta-surface-re-debate).
The product surface is unbound and being re-debated from the meta-surface.

## What

- **Source**: records/<vendor>/{decisions,experiments,risks,claims,evidence,index,capabilities,observations}/
- **Destination**: records/_unbound/<schema>/<vendor>/
- **Count**: 92 files archived

## Gate Behavior

records/_unbound/** falls through to decision: 'ok' in the write gate.
It is NOT blocked by records/observations/** or WRITE_PATH_PATTERNS.

## How to Re-debate

1. Move files back to records/<vendor>/<schema>/
2. Reinstate the corresponding schema in schemas/
3. Update manifests to re-register tools
