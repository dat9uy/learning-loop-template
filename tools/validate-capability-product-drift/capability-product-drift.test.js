import { describe, it } from "node:test";
import assert from "node:assert";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseOpenApiPaths } from "./parsers/openapi-path-parser.js";
import { parseTanStackRoutes } from "./parsers/tanstack-route-parser.js";
import { validateCapabilityProductDrift } from "./capability-product-drift.js";
import { surfaceRegistry } from "./surface-registry.js";
import { loadRecords } from "../validate-records/record-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

describe("parseOpenApiPaths", () => {
  it("extracts GET /reference/equity from sample OpenAPI JSON", () => {
    const openapi = {
      paths: {
        "/reference/equity": { get: { summary: "List Equity" } },
        "/reference/company/{symbol}": { get: { summary: "Company Info" } },
      },
    };
    const routes = parseOpenApiPaths(openapi);
    assert.strictEqual(routes.has("GET /reference/equity"), true);
    assert.strictEqual(routes.has("GET /reference/company/{symbol}"), true);
    assert.strictEqual(routes.size, 2);
  });

  it("ignores non-HTTP methods like trace", () => {
    const openapi = {
      paths: {
        "/reference/equity": {
          get: {},
          trace: {},
          parameters: {},
        },
      },
    };
    const routes = parseOpenApiPaths(openapi);
    assert.strictEqual(routes.has("GET /reference/equity"), true);
    assert.strictEqual(routes.has("TRACE /reference/equity"), false);
    assert.strictEqual(routes.has("PARAMETERS /reference/equity"), false);
    assert.strictEqual(routes.size, 1);
  });
});

describe("parseTanStackRoutes", () => {
  it("extracts /reference/equity and /reference/company/$symbol from sample router + route files", () => {
    const routes = parseTanStackRoutes(root);
    assert.strictEqual(routes.has("/reference/equity"), true);
    assert.strictEqual(routes.has("/reference/company/$symbol"), true);
  });
});

describe("validateCapabilityProductDrift", () => {
  it("returns zero errors for current records and product code", () => {
    const records = loadRecords(root);
    const result = validateCapabilityProductDrift(records, root);
    assert.deepStrictEqual(
      result.errors,
      [],
      `expected zero drift, got: ${result.errors.join(", ")}`
    );
  });

  it("reports drift for a synthetic missing HTTP/REST route", () => {
    const records = [
      {
        __file: "records/capabilities/fake.yaml",
        type: "capability",
        surface: "HTTP/REST",
        maps: [{ route_class: "GET /nonexistent/route" }],
      },
    ];
    const result = validateCapabilityProductDrift(records, root);
    assert.strictEqual(result.errors.length, 1);
    assert.match(result.errors[0], /capability drift:/);
    assert.match(result.errors[0], /GET \/nonexistent\/route/);
    assert.match(result.errors[0], /HTTP\/REST/);
  });

  it("reports drift for a synthetic missing TanStack route", () => {
    const records = [
      {
        __file: "records/capabilities/fake.yaml",
        type: "capability",
        surface: "TanStack Start route",
        maps: [{ route_class: "/nonexistent/route" }],
      },
    ];
    const result = validateCapabilityProductDrift(records, root);
    assert.strictEqual(result.errors.length, 1);
    assert.match(result.errors[0], /capability drift:/);
    assert.match(result.errors[0], /\/nonexistent\/route/);
    assert.match(result.errors[0], /TanStack Start route/);
  });

  it("warns for unsupported surface without crashing", () => {
    const records = [
      {
        __file: "records/capabilities/fake.yaml",
        type: "capability",
        surface: "gRPC",
        maps: [{ route_class: "SomeService/SomeMethod" }],
      },
    ];
    const result = validateCapabilityProductDrift(records, root);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.warnings.length, 1);
    assert.match(result.warnings[0], /unsupported surface/);
    assert.match(result.warnings[0], /gRPC/);
  });
});

describe("surfaceRegistry", () => {
  it("contains HTTP/REST and TanStack Start route entries", () => {
    assert.strictEqual(typeof surfaceRegistry["HTTP/REST"], "function");
    assert.strictEqual(
      typeof surfaceRegistry["TanStack Start route"],
      "function"
    );
  });
});
