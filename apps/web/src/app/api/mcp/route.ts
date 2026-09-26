import { listAccounts } from "@/lib/mcp/accounts";
import { APP_MIME, APPS_EXTENSION, listViews, readView } from "@/lib/mcp/apps";
import { authConfigured, challenge, resolveCaller, type Caller } from "@/lib/mcp/connector";
import { resolveUpstream, upstreamTools } from "@/lib/mcp/registry";
import { toolsFor } from "@/lib/mcp/tools";
import { GATEWAY_HEADER } from "@/lib/mcp/upstream";

// Route handlers are uncached by default in this version, and only GET can opt
// in, so POST needs no cache configuration. `runtime` is still a valid segment
// config and node is required for the crypto the token compare uses.
export const runtime = "nodejs";

/**
 * The MCP endpoint.
 *
 * A remote MCP server with auth in front of it: JSON-RPC over POST, guarded by
 * either the static bearer a machine holds or an access token this site's
 * Supabase project issued to a connector. `connector.ts` decides which, and the
 * caller it returns also decides which tools are visible.
 *
 * An unauthenticated request is refused with a 401 carrying a
 * `WWW-Authenticate` header rather than a tool error in a 200, because that
 * header is what turns a refusal into an offer to sign in.
 */

const PROTOCOL = "2025-06-18";
const MAX_BODY = 1_048_576;

const unauthorized = (error?: "invalid_token") =>
  Response.json(
    { error: error ?? "unauthorized", error_description: "This endpoint requires authorization." },
    { status: 401, headers: { "WWW-Authenticate": challenge(error) } },
  );

const toolResult = (payload: unknown, isError = false, structured = false) => ({
  content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 1) }],
  // A view reads `structuredContent` rather than parsing the text, so a tool
  // that feeds one sends both.
  ...(structured && payload && typeof payload === "object" ? { structuredContent: payload } : {}),
  isError,
});

/** A JSON-RPC error with its own code, for a method that exists but was asked for something that does not. */
class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

async function dispatch(
  method: string,
  params: Record<string, unknown>,
  /** False when the caller is itself a gateway, to stop a cycle expanding. */
  includeUpstreams: boolean,
  caller: Caller,
): Promise<unknown | null> {
  const visible = toolsFor(caller);

  switch (method) {
    case "initialize":
      return {
        protocolVersion: (params.protocolVersion as string) ?? PROTOCOL,
        // `resources` and the apps extension are what make Claude fetch a
        // tool's view and draw it, rather than showing only the text.
        capabilities: {
          tools: {},
          resources: {},
          extensions: { [APPS_EXTENSION]: { mimeTypes: [APP_MIME] } },
        },
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
          ...visible.map((t) => ({
            name: t.name,
            description: t.description,
            // Advertise the accounts that actually exist, so a caller does not
            // have to guess the handle.
            inputSchema: withAccountEnum(t.inputSchema, accounts),
            // Hosts that predate the nested form read the flat `ui/resourceUri`
            // key, so a tool with a view sends both.
            ...(t.ui
              ? { _meta: { ui: t.ui, ...(t.ui.resourceUri ? { "ui/resourceUri": t.ui.resourceUri } : {}) } }
              : {}),
          })),
          ...remote,
        ],
      };
    }
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments as Record<string, unknown>) ?? {};

      const tool = visible.find((t) => t.name === name);
      if (tool) {
        try {
          return toolResult(await tool.run(args), false, Boolean(tool.ui));
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
    case "resources/list":
      return { resources: listViews() };
    case "resources/read": {
      const read = readView(String(params.uri ?? ""));
      if (!read) throw new RpcError(-32002, `resource not found: ${String(params.uri ?? "")}`);
      return read;
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
  if (!authConfigured()) {
    return Response.json({ error: "server is not configured" }, { status: 503 });
  }

  const caller = await resolveCaller(request);
  if (!caller) {
    // A presented-but-rejected credential is `invalid_token`, which is what makes
    // a client refresh and retry rather than give up.
    return unauthorized(request.headers.get("authorization") ? "invalid_token" : undefined);
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

  let result: unknown | null;
  try {
    result = await dispatch(message.method ?? "", message.params ?? {}, !request.headers.get(GATEWAY_HEADER), caller);
  } catch (err) {
    if (!(err instanceof RpcError)) throw err;
    if (message.id === undefined) return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: "2.0", id: message.id, error: { code: err.code, message: err.message } });
  }

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
