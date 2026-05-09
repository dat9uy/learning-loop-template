# Product

This directory contains the product workspace and capability runtime experiments.

## Structure

```
product/
├── pyproject.toml              # Python project manifest (shared environment)
├── .venv/                      # Shared persistent environment (gitignored)
├── src/                        # Future product code (created when build is approved)
└── capabilities/
    └── <scope>/                # Standalone feasibility scripts for runtime experiments
```

## Capabilities

Capability scripts under `product/capabilities/<scope>/` are standalone feasibility probes that test whether a library's API returns usable data. They:

- Live in `product/` before product approval because they share the future product's environment
- Are runtime experiment substrate, not product implementations
- May be segmented (cell markers, regions, blocks) for interactive or whole-script execution
- Verify the `runtime` dimension of a claim via an approved experiment record

See `docs/operator-guide.md` → "Capability Runtime Experiment" for the full protocol.

## Shared Environment

The persistent dependency environment at `product/` is shared between capability scripts and future product code. This is intentional: it respects external constraints such as vendor device limits, license activations, or authenticated registries by keeping all execution on the registered device.

## Product Code

Application code (`src/`, routes, APIs, UI components) appears only after an approved build experiment chooses a product surface, stack, and validation path. Capabilities do not replace product approval; they inform it.
