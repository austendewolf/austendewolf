import type { McpUpstream } from "@awd/db";

/**
 * One MCP server this one fronts.
 *
 * Hand-rolled rather than built on the MCP SDK, for the same reason the
 * endpoint in `api/mcp/route.ts` is: this speaks JSON-RPC over HTTP and nothing
 * more, and a client library would be the only dependency in the tree pulled in
 * for a protocol we already implement on the other side.
 *
 * Two things about Streamable HTTP are easy to get wrong and are handled here:
 *
 *  - A response may come back as `application/json` *or* as `text/event-stream`
 *    carrying the same JSON-RPC message in a `data:` frame. Servers choose, and
 *    the choice varies per call, so both are read.
 *  - A server may issue an `Mcp-Session-Id` on initialize and reject every later
 *    request that omits it.
 *
 * Connection state is cached in module scope by the registry, so a warm
 * instance handshakes once and reuses the tool list.
 */

const PROTOCOL = "2025-06-18";
const TIMEOUT_MS = 60_000;

/**
 * Marks a request as coming from a gateway rather than an end client.
 *
 * A gateway that fronts itself, directly or through a ring of two, would expand
 * its own tool list forever. The endpoint refuses to enumerate upstreams when it
 * sees this, which breaks any cycle at the first hop instead of relying on a
 * timeout to end it.
 */
export const GATEWAY_HEADER = "x-mcp-gateway";

export interface RemoteTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface RpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class Upstream {
  readonly name: string;
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly allow: string[] | null;
  private readonly deny: string[] | null;

  private sessionId: string | null = null;
  private ready = false;
  private connecting: Promise<void> | null = null;
  private cached: RemoteTool[] = [];

  lastError: string | null = null;

  constructor(row: McpUpstream) {
    this.name = row.name;
    this.url = row.url;
    this.headers = row.headers ?? {};
    this.allow = row.allow?.length ? row.allow : null;
    this.deny = row.deny?.length ? row.deny : null;
  }

  get connected(): boolean {
    return this.ready;
  }

  get toolCount(): number {
    return this.cached.length;
  }

  private async rpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          // Both, because the server picks which one it answers with.
          accept: "application/json, text/event-stream",
          [GATEWAY_HEADER]: "austendewolf",
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
          ...this.headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      });

      const session = response.headers.get("mcp-session-id");
      if (session) this.sessionId = session;

      if (!response.ok) {
        throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
      }

      const body = await response.text();
      const message = parseRpc(body, response.headers.get("content-type") ?? "");
      if (message?.error) {
        throw new Error(message.error.message ?? `rpc error ${message.error.code}`);
      }
      return message?.result;
    } finally {
      clearTimeout(timer);
    }
  }

  private async handshake(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "austendewolf-gateway", version: "1.0.0" },
    });
    const listed = (await this.rpc("tools/list")) as { tools?: RemoteTool[] } | undefined;
    this.cached = listed?.tools ?? [];
    this.ready = true;
    this.lastError = null;
  }

  /**
   * Connect if needed. Never throws.
   *
   * A gateway inherits the reliability of everything it fronts, so an upstream
   * that will not answer is dropped from the tool list rather than failing the
   * whole request.
   */
  async ensure(): Promise<boolean> {
    if (this.ready) return true;
    if (!this.connecting) {
      this.connecting = this.handshake()
        .catch((err: unknown) => {
          this.lastError = err instanceof Error ? err.message : String(err);
          this.ready = false;
          this.cached = [];
          this.sessionId = null;
        })
        .finally(() => {
          this.connecting = null;
        });
    }
    await this.connecting;
    return this.ready;
  }

  private visible(name: string): boolean {
    if (this.allow) return this.allow.includes(name);
    if (this.deny) return !this.deny.includes(name);
    return true;
  }

  /** This upstream's tools, already namespaced. */
  async tools(): Promise<RemoteTool[]> {
    if (!(await this.ensure())) return [];
    return this.cached
      .filter((tool) => this.visible(tool.name))
      .map((tool) => ({
        ...tool,
        name: `${this.name}.${tool.name}`,
        description: tool.description
          ? `[${this.name}] ${tool.description}`
          : `[${this.name}]`,
      }));
  }

  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    if (!(await this.ensure())) {
      throw new Error(`upstream '${this.name}' is unavailable: ${this.lastError ?? "unknown"}`);
    }
    if (!this.visible(tool)) {
      throw new Error(`tool '${tool}' is not exposed by this gateway`);
    }
    try {
      return await this.rpc("tools/call", { name: tool, arguments: args });
    } catch (err) {
      // A session can expire under us. Drop it and try once from scratch.
      this.ready = false;
      this.sessionId = null;
      if (!(await this.ensure())) {
        throw new Error(
          `upstream '${this.name}' is unavailable: ${this.lastError ?? (err as Error).message}`,
        );
      }
      return this.rpc("tools/call", { name: tool, arguments: args });
    }
  }
}

/**
 * Read one JSON-RPC message out of either response shape.
 *
 * An SSE body carries the message in a `data:` frame; there may be several
 * frames, and the last one is the response to what we asked.
 */
function parseRpc(body: string, contentType: string): RpcResponse | null {
  if (!contentType.includes("text/event-stream")) {
    return body ? (JSON.parse(body) as RpcResponse) : null;
  }
  let last: RpcResponse | null = null;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      last = JSON.parse(payload) as RpcResponse;
    } catch {
      // Keep-alive or a partial frame; the next one carries the message.
    }
  }
  return last;
}
