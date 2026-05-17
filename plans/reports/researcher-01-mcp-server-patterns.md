# Research: MCP Server Implementation Patterns

**Date:** 2026-05-17
**Purpose:** Constraint gate MCP server implementation guide
**Sources:** npm registry, MCP TypeScript SDK repo, official MCP docs, Claude Code docs

---

## 1. SDK Selection: `@modelcontextprotocol/sdk` v1.x

**Current production version:** 1.29.0 (npm)
**Package:** `@modelcontextprotocol/sdk` (NOT `@modelcontextprotocol/server` which is v2 pre-alpha)

```bash
npm install @modelcontextprotocol/sdk zod
```

Zod is a required peer dependency. The SDK supports Zod v3.25+ (imports from `zod/v4` internally, backward-compatible).

**v2 warning:** The `main` branch of the GitHub repo is v2 (pre-alpha, estimated stable Q1 2026). It renames the package to `@modelcontextprotocol/server` and changes import paths. Use v1.x for production.

---

## 2. Server Setup with stdio Transport (v1.x)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "constraint-gate",
  version: "1.0.0",
});

// Register tools here...

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

**Key import paths (v1.x):**
- `@modelcontextprotocol/sdk/server/mcp.js` — McpServer class
- `@modelcontextprotocol/sdk/server/stdio.js` — StdioServerTransport

These are subpath exports, NOT the main entry point.

---

## 3. Tool Registration Patterns

### Basic tool with Zod schema

```typescript
server.registerTool(
  "tool_name",
  {
    description: "What this tool does",
    inputSchema: {
      field: z.string().describe("Field description"),
      optional: z.number().optional(),
    },
  },
  async ({ field, optional }) => ({
    content: [{ type: "text", text: `Result: ${field}` }],
  })
);
```

**Critical:** `inputSchema` takes a flat object of Zod validators, NOT a `z.object()`. The SDK wraps it internally.

### With output schema (structured results)

```typescript
server.registerTool(
  "check_gate",
  {
    description: "Check if an action is allowed by the constraint gate",
    inputSchema: {
      action: z.string().describe("Action being attempted"),
      target: z.string().describe("Target resource path or identifier"),
      context: z.string().optional().describe("Additional context"),
    },
    outputSchema: {
      decision: z.enum(["ok", "blocked", "escalate"]),
      reason: z.string().optional(),
      observation_required: z.boolean().optional(),
      chain: z.array(z.string()).optional(),
    },
  },
  async ({ action, target, context }) => {
    const result = await checkGateLogic(action, target, context);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }
);
```

When `outputSchema` is defined, include both `content` (for LLM consumption) and `structuredContent` (for programmatic use).

**TypeScript note:** Use `type` aliases, not `interface`, for `structuredContent` types (interfaces lack implicit index signatures).

### Error handling

```typescript
// Option 1: Return isError for tool-level errors (visible to LLM)
return {
  content: [{ type: "text", text: "Gate check failed: file not found" }],
  isError: true,
};

// Option 2: Let exceptions propagate (SDK converts to isError automatically)
throw new Error("Unexpected state");
```

When `isError: true`, output schema validation is skipped. Use this for expected failures the LLM should reason about.

---

## 4. Constraint Gate Tool Designs

### `check_gate` tool

```typescript
server.registerTool(
  "check_gate",
  {
    description:
      "Check if an action is allowed by the constraint gate. " +
      "Returns: ok (proceed), blocked (record observation first), " +
      "escalate (budget exhausted, ask user).",
    inputSchema: {
      action: z.string().describe("Action type: docker, sudo, vendor-api, etc."),
      target: z.string().describe("Target resource: path, command, or identifier"),
      context: z.string().optional().describe("Why this action is needed"),
    },
  },
  async ({ action, target, context }) => {
    try {
      const gateState = await readGateState();
      const observations = await readObservations();

      // Gate logic: constrained? observed? budget ok?
      const constraint = findConstraint(gateState, action, target);
      if (!constraint) {
        return okResult();
      }

      const observation = findObservation(observations, constraint.id);
      if (!observation) {
        return blockedResult(constraint.reason, true);
      }

      if (isBudgetExhausted(gateState, constraint.budgetId)) {
        return escalateResult(constraint.reason, getDependencyChain(gateState, constraint.id));
      }

      return okResult();
    } catch (err) {
      return {
        content: [{ type: "text", text: `Gate check error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

function okResult() {
  return {
    content: [{ type: "text", text: JSON.stringify({ decision: "ok" }) }],
    structuredContent: { decision: "ok" as const },
  };
}

function blockedResult(reason: string, observation_required: boolean) {
  return {
    content: [{ type: "text", text: JSON.stringify({ decision: "blocked", reason, observation_required }) }],
    structuredContent: { decision: "blocked" as const, reason, observation_required },
  };
}

function escalateResult(reason: string, chain: string[]) {
  return {
    content: [{ type: "text", text: JSON.stringify({ decision: "escalate", reason, chain }) }],
    structuredContent: { decision: "escalate" as const, reason, chain },
  };
}
```

### `record_observation` tool

```typescript
server.registerTool(
  "record_observation",
  {
    description: "Record an observation about a discovered constraint.",
    inputSchema: {
      type: z.enum(["constraint", "budget", "dependency"]).describe("Observation type"),
      constraint: z.string().describe("What the constraint is"),
      source: z.string().describe("Where the constraint was discovered (file, command, etc.)"),
      details: z.string().describe("Detailed description of the constraint and its impact"),
    },
  },
  async ({ type, constraint, source, details }) => {
    try {
      const id = generateObservationId();
      const observation = {
        id,
        type,
        constraint,
        source,
        details,
        timestamp: new Date().toISOString(),
        status: "active",
      };

      await writeObservation(observation);
      await appendGateLog({ event: "observation_recorded", id, type, constraint });

      return {
        content: [{ type: "text", text: JSON.stringify({ recorded: true, id }) }],
        structuredContent: { recorded: true, id },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to record observation: ${err.message}` }],
        isError: true,
      };
    }
  }
);
```

---

## 5. stdio Transport Specifics

### Communication model
- Server reads JSON-RPC messages from `process.stdin`
- Server writes JSON-RPC responses to `process.stdout`
- **NEVER use `console.log()`** — it writes to stdout and corrupts the protocol
- Use `console.error()` for logging (writes to stderr, safe)

### Statelessness
- The MCP server is stateless between calls
- Read state files on each `check_gate` call (no in-memory caching between calls)
- State persists in `.claude/coordination/gate-state.json` and `observations/`
- This survives agent restarts — no session management needed

### Concurrency
- stdio transport processes one message at a time (sequential)
- No concurrent call handling needed for v1
- Each tool call is atomic: read state → evaluate → return result

### Server lifecycle
```typescript
// For stdio servers, server.close() is sufficient
// In-flight handlers are NOT automatically drained
process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
```

---

## 6. Claude Code Integration

### Registration via `.mcp.json` (project-scoped, shared)

```json
{
  "mcpServers": {
    "constraint-gate": {
      "command": "node",
      "args": ["tools/constraint-gate/server.js"],
      "env": {}
    }
  }
}
```

### Registration via CLI

```bash
# Local scope (default, only you, current project)
claude mcp add --transport stdio constraint-gate -- node tools/constraint-gate/server.js

# Project scope (shared via .mcp.json)
claude mcp add --transport stdio --scope project constraint-gate -- node tools/constraint-gate/server.js

# User scope (all projects)
claude mcp add --transport stdio --scope user constraint-gate -- node tools/constraint-gate/server.js
```

### Environment variable

Claude Code sets `CLAUDE_PROJECT_DIR` in the spawned server's environment. Use it for project-relative paths:
```typescript
const projectDir = process.env.CLAUDE_PROJECT_DIR;
```

### How tools appear to the agent
- Tools appear as MCP tool calls in the agent's tool list
- Tool names are prefixed with the server name: `mcp__constraint-gate__check_gate`
- The agent sees tool descriptions and input schemas directly
- Tool output (content array) is returned to the agent as the tool result

### Scoping

| Scope | Stored in | Shared with team |
|-------|-----------|------------------|
| local | `~/.claude.json` | No |
| project | `.mcp.json` in project root | Yes |
| user | `~/.claude.json` | No |

---

## 7. Testing MCP Servers

### Unit testing tool handlers

Extract handler logic into pure functions, test them directly:

```typescript
// gate-logic.ts — pure functions, no MCP dependency
export function evaluateGate(
  action: string,
  target: string,
  constraints: Constraint[],
  observations: Observation[],
  budgets: BudgetState
): GateResult {
  const constraint = constraints.find(c => matchesAction(c, action, target));
  if (!constraint) return { decision: "ok" };

  const obs = observations.find(o => o.constraintId === constraint.id);
  if (!obs) return { decision: "blocked", reason: constraint.reason, observation_required: true };

  if (budgets.exhausted.has(constraint.budgetId)) {
    return { decision: "escalate", reason: constraint.reason, chain: getChain(constraint, budgets) };
  }

  return { decision: "ok" };
}

// gate-logic.test.ts
import { evaluateGate } from "./gate-logic";

test("returns ok for unconstrained action", () => {
  const result = evaluateGate("read", "/tmp/file", [], [], { exhausted: new Set() });
  expect(result).toEqual({ decision: "ok" });
});

test("returns blocked when observation missing", () => {
  const constraints = [{ id: "c1", action: "docker", target: "*", reason: "stale mount risk", budgetId: "b1" }];
  const result = evaluateGate("docker", "run ubuntu", constraints, [], { exhausted: new Set() });
  expect(result).toEqual({ decision: "blocked", reason: "stale mount risk", observation_required: true });
});
```

### Integration testing the MCP server

Use the SDK's Client class to connect to the server via stdio:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("check_gate returns ok for non-constrained action", async () => {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["tools/constraint-gate/server.js"],
  });

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "check_gate",
    arguments: { action: "read", target: "/tmp/file" },
  });

  expect(result.content[0].text).toContain('"ok"');

  await client.close();
});
```

### Mocking patterns

For unit tests, mock the file system layer (readGateState, readObservations, writeObservation). The gate logic itself is pure and needs no mocks.

```typescript
// Mock the state reader
vi.mock("./state-reader.js", () => ({
  readGateState: vi.fn().mockResolvedValue({ constraints: [], exhausted: new Set() }),
  readObservations: vi.fn().mockResolvedValue([]),
  writeObservation: vi.fn().mockResolvedValue(undefined),
}));
```

---

## 8. Project Structure

```
tools/constraint-gate/
├── server.ts              # MCP server entry point (registers tools, connects transport)
├── gate-logic.ts          # Pure gate evaluation functions (testable)
├── state-reader.ts        # File I/O for gate-state.json and observations/
├── gate-log.ts            # Append-only JSONL audit log
├── types.ts               # TypeScript types for GateResult, Observation, etc.
├── package.json
├── tsconfig.json
└── __tests__/
    ├── gate-logic.test.ts
    └── server.integration.test.ts
```

---

## 9. Trade-off Matrix

| Approach | Enforcement | Complexity | Testability | Context Cost |
|----------|-------------|------------|-------------|--------------|
| Expanded hook only | Weak (brittle pattern matching) | Medium | Hard | 0 |
| Sidecar agent | Strong (async) | High | Hard | 0 |
| **MCP server** | **Strong (synchronous)** | **Low** | **Easy** | **~40 tokens** |
| Filesystem guards | Partial (repo only) | Low | Easy | 0 |

MCP server wins: synchronous enforcement, clean testability, minimal context overhead.

---

## 10. Adoption Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| SDK v2 breaking changes | Low | Pin to v1.29.x, migrate when v2 stable |
| stdio transport latency | Low | ~50ms per call, acceptable for gate checks |
| Agent bypasses gate | Medium | Hook forces the call — agent can't run gated bash without gate approval |
| Gate too restrictive | Low | "ok" is the default for non-constrained actions |

---

## Unresolved Questions

1. **v1 vs v2 import paths:** The official quickstart uses `zod@3` but the SDK README says Zod v4 is supported. Need to verify which Zod version works with v1.29.0 `inputSchema` format (flat object vs `z.object()`).
2. **Hook integration:** How exactly does the hook call the MCP server? The hook is a Node.js script — does it spawn the MCP server as a child process, or does it communicate via a different mechanism? Need to research hook-to-MCP-server communication pattern.
3. **Gate state file locking:** If the hook and the agent both call `check_gate` concurrently (unlikely with stdio sequential processing), is file locking needed for `gate-state.json`?
