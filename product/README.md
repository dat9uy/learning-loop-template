# Product Workspace

`product/` is a workspace marker. Runtime-specific stack directories live below it, for example `product/api/` for Python and `product/web/` for TypeScript.

Each stack owns its manifest, persistent environment, local vendor metadata, and capability scripts under `product/<stack>/capabilities/<scope>/`. See `docs/operator-guide.md` → "Stacks and Capability Locations" and "Capability Runtime Experiment" for the full protocol.

Application code appears only after an approved build experiment chooses a product surface, stack, and validation path.
