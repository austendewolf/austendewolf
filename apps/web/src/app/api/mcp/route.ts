import { timingSafeEqual } from "node:crypto";

import { listAccounts } from "@/lib/mcp/accounts";
import { ADMIN_TOOLS } from "@/lib/mcp/admin";
import { TOOLS } from "@/lib/mcp/google";
import { resolveUpstream, upstreamTools } from "@/lib/mcp/registry";
import { GATEWAY_HEADER } from "@/lib/mcp/upstream";

// Google APIs plus the tools that manage this server's own connections.
const ALL_TOOLS = [...TOOLS, ...ADMIN_TOOLS];

// Route handlers are uncached by default in this version, and only GET can opt
// in, so POST needs no cache configuration. `runtime` is still a valid segment
// config and node is required for the crypto import.
export const runtime = "nodejs";

/**
 * The MCP endpoint.
 *
 * A remote MCP server with auth in front of it: JSON-RPC over POST, guarded by
 * a bearer token. Tokens are configured as MCP_TOKENS, a comma-separated list
 * so one can be rotated in before the old one is retired.
 */

const PROTOCOL = "2025-06-18";
const MAX_BODY = 1_048_576;

function tokens(): string[] {
  return (process.env.MCP_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Constant-time compare that tolerates a length mismatch. */
function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const presented = header.slice(7);
  return tokens().some((t) => secretEquals(presented, t));
}

const toolResult = (payload: unknown, isError = false) => ({
  content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 1) }],
  isError,
});

async function dispatch(
  method: string,
  params: Record<string, unknown>,
  /** False when the caller is itself a gateway, to stop a cycle expanding. */
  includeUpstreams: boolean,
): Promise<unknown | null> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: (params.protocolVersion as string) ?? PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "austen-private-google-workspace", version: "1.0.0" },
      };
    case "ping":
      return {};
    case "tools/list": {
      // Remote tools are fetched alongside the local ones. An upstream that is
      // down contributes an empty list rather than failing the request.
      const [accounts, remote] = await Promise.all([
        listAccounts().then((list) => list.map((a) => a.name)),
        includeUpstreams ? upstreamTools().catch(() => []) : [],
      ]);
      return {
        tools: [
          ...ALL_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            // Advertise the accounts that actually exist, so a caller does not
            // have to guess the handle.
            inputSchema: withAccountEnum(t.inputSchema, accounts),
          })),
          ...remote,
        ],
      };
    }
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments as Record<string, unknown>) ?? {};

      const tool = ALL_TOOLS.find((t) => t.name === name);
      if (tool) {
        try {
          return toolResult(await tool.run(args));
        } catch (err) {
          return toolResult(err instanceof Error ? err.message : String(err), true);
        }
      }

      // A dot means the tool lives on a fronted server.
      try {
        const routed = await resolveUpstream(name);
        if (!routed) return toolResult(`unknown tool: ${name}`, true);
        // Upstreams already answer in MCP tool-result shape; pass it straight
        // through rather than re-wrapping a result that is already correct.
        return await routed.upstream.call(routed.tool, args);
      } catch (err) {
        return toolResult(err instanceof Error ? err.message : String(err), true);
      }
    }
    default:
      return null;
  }
}

function withAccountEnum(schema: Record<string, unknown>, accounts: string[]) {
  if (!accounts.length) return schema;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties?.account) return schema;
  return {
    ...schema,
    properties: { ...properties, account: { ...properties.account, enum: accounts } },
  };
}

export async function POST(request: Request) {
  if (!tokens().length) {
    return Response.json({ error: "server is not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return Response.json({ error: "request body too large" }, { status: 413 });
  }

  let message: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    message = JSON.parse(raw);
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      { status: 400 },
    );
  }
  if (typeof message !== "object" || message === null) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } },
      { status: 400 },
    );
  }

  const result = await dispatch(
    message.method ?? "",
    message.params ?? {},
    !request.headers.get(GATEWAY_HEADER),
  );

  // A notification carries no id and expects no body.
  if (message.id === undefined) return new Response(null, { status: 202 });

  if (result === null) {
    return Response.json({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: `method not found: ${message.method}` },
    });
  }
  return Response.json({ jsonrpc: "2.0", id: message.id, result });
}

export async function GET() {
  return Response.json({ error: "POST JSON-RPC messages to this endpoint" }, { status: 405 });
}
