# Mastra Agent Model Configuration

Plan 3 ships 3 Mastra agents (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`) with per-agent model configuration. This document is the operator-facing reference for the env-var contract.

## Environment Variables

### `KIMI_API_KEY` (required at runtime)

API key for the Kimi router. The Mastra model router auto-injects this when an agent uses the `kimi-for-coding` provider.

**Operator must set this in their shell before invoking the loop.** The loop reads `process.env.KIMI_API_KEY` directly — no `dotenv` import.

### `MASTRA_AGENT_MODEL` (optional override)

Overrides the model for all 3 agents. Format: `provider/model` (e.g., `kimi-for-coding/k2p6`).

The per-agent `model` field in `agents-manifest.json` overrides this env var; this env var overrides the code default. See "3-Layer Lookup Order" below.

## 3-Layer Lookup Order

For each agent, the model is resolved in this order:

1. **Per-agent `agents-manifest.json` `model` field** — highest priority; overrides everything below.
2. **`MASTRA_AGENT_MODEL` env var** — global override for all agents.
3. **Code default** — `kimi-for-coding/k2p6` (hardcoded in `createLoopAgent` factory).

## No `dotenv` Import

The loop code does **not** import `dotenv` or any `.env` auto-loader. It reads `process.env.*` directly. This is a deliberate contract:

- Prevents accidental `KIMI_API_KEY` commit via a code change.
- Keeps the loop decoupled from the operator's dev env choice.
- The `.env` file (when used with `direnv`) is gitignored.

## Recommended Operator Workflow: `direnv`

Per-project, git-safe, auto-load:

```bash
# One-time setup
brew install direnv        # macOS
sudo apt install direnv    # Linux
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc  # or bash equivalent

# Per-project setup (after cloning)
cp .env.example .env       # fill in real key
direnv allow .
```

The `.envrc` (committed, no secrets) auto-loads `.env` on `cd`. The `.env` (gitignored) contains the actual `KIMI_API_KEY`.

## Fallback: Shell RC

If `direnv` is unavailable, set env vars in `~/.bashrc` or `~/.zshrc`:

```bash
export KIMI_API_KEY=sk-your-kimi-api-key-here
```

This works but is not per-project scoped.

## Production Deployment

In production, env vars come from the deployment system (Docker, K8s, systemd, etc.), not `.env` files. The loop code is unchanged across dev / CI / production.

## References

- Kimi provider docs: https://mastra.ai/models/providers/kimi-for-coding
- Phase 1 probe script: `tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs`
- Agents manifest: `tools/learning-loop-mastra/mastra/agents-manifest.json` (Phase 3)
