import { accessToken } from "./accounts";

/**
 * Gmail, Calendar, and Drive, called in process.
 *
 * Every tool takes an `account`, so one endpoint speaks for personal and work
 * at once. Write tools are gated by MCP_ALLOW_WRITES so the deployment can be
 * made read-only without removing capability from the code.
 */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR = "https://www.googleapis.com/calendar/v3";
const DRIVE = "https://www.googleapis.com/drive/v3";

const WRITES_ALLOWED = (process.env.MCP_ALLOW_WRITES ?? "1") !== "0";

/** Escape a caller-supplied value going into a URL path. */
const seg = (value: string) => encodeURIComponent(String(value));

type Params = Record<string, string | number | boolean | string[] | undefined>;

async function api<T>(
  account: string,
  method: string,
  url: string,
  options: { params?: Params; body?: unknown; raw?: boolean } = {},
): Promise<T> {
  const token = await accessToken(account);
  let target = url;
  if (options.params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => search.append(key, v));
      else search.append(key, String(value));
    }
    const query = search.toString();
    if (query) target += (target.includes("?") ? "&" : "?") + query;
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(target, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Google API error ${res.status}: ${(await res.text()).slice(0, 600)}`);
  const text = await res.text();
  if (options.raw) return text as T;
  return (text ? JSON.parse(text) : {}) as T;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: { headers?: Array<{ name: string; value: string }> } & GmailPart;
}

function pickHeaders(msg: GmailMessage, wanted: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) {
    if (wanted.includes(h.name)) out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

/** Walk MIME parts for the first text/plain body, falling back to HTML. */
function bodyText(payload: GmailPart | undefined, limit = 5000): string {
  if (!payload) return "";
  const queue: GmailPart[] = [payload];
  let html: string | null = null;
  while (queue.length) {
    const part = queue.shift()!;
    const data = part.body?.data;
    if (data && part.mimeType === "text/plain") {
      return Buffer.from(data, "base64url").toString("utf8").slice(0, limit);
    }
    if (data && part.mimeType === "text/html" && html === null) {
      html = Buffer.from(data, "base64url").toString("utf8");
    }
    queue.push(...(part.parts ?? []));
  }
  return (html ?? "").slice(0, limit);
}

function requireWrites(tool: string): void {
  if (!WRITES_ALLOWED) {
    throw new Error(`'${tool}' writes, and this server is running read-only.`);
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

const account = { type: "string", description: "Which connected Google account to act as" };

export const TOOLS: ToolDefinition[] = [
  {
    name: "gmail_search",
    description:
      "Search Gmail with standard query syntax (from:, is:unread, newer_than:7d). Returns metadata and snippets.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        query: { type: "string", description: "Gmail search query" },
        max_results: { type: "integer", default: 10, maximum: 25 },
      },
      required: ["account", "query"],
    },
    run: async (a) => {
      const acct = String(a.account);
      const max = Math.min(Number(a.max_results ?? 10), 25);
      const listing = await api<{ resultSizeEstimate?: number; messages?: Array<{ id: string }> }>(
        acct,
        "GET",
        `${GMAIL}/messages`,
        { params: { q: String(a.query), maxResults: max } },
      );
      const messages = await Promise.all(
        (listing.messages ?? []).map(async (stub) => {
          const m = await api<GmailMessage>(acct, "GET", `${GMAIL}/messages/${seg(stub.id)}`, {
            params: { format: "metadata", metadataHeaders: ["From", "Subject", "Date"] },
          });
          return {
            id: m.id,
            threadId: m.threadId,
            labelIds: m.labelIds ?? [],
            snippet: m.snippet ?? "",
            ...pickHeaders(m, ["From", "Subject", "Date"]),
          };
        }),
      );
      return { resultSizeEstimate: listing.resultSizeEstimate, messages };
    },
  },
  {
    name: "gmail_get_thread",
    description: "Fetch a Gmail thread with decoded plain-text bodies.",
    inputSchema: {
      type: "object",
      properties: { account, thread_id: { type: "string" } },
      required: ["account", "thread_id"],
    },
    run: async (a) => {
      const acct = String(a.account);
      const thread = await api<{ id: string; messages?: GmailMessage[] }>(
        acct,
        "GET",
        `${GMAIL}/threads/${seg(String(a.thread_id))}`,
        { params: { format: "full" } },
      );
      return {
        id: thread.id,
        messages: (thread.messages ?? []).map((m) => ({
          id: m.id,
          labelIds: m.labelIds ?? [],
          ...pickHeaders(m, ["From", "To", "Subject", "Date"]),
          body: bodyText(m.payload),
        })),
      };
    },
  },
  {
    name: "gmail_list_labels",
    description: "List Gmail labels with their ids.",
    inputSchema: { type: "object", properties: { account }, required: ["account"] },
    run: async (a) => {
      const data = await api<{ labels?: unknown[] }>(String(a.account), "GET", `${GMAIL}/labels`);
      return { labels: data.labels ?? [] };
    },
  },
  {
    name: "gmail_modify",
    description:
      "Add or remove labels on Gmail threads. Remove UNREAD to mark read, remove INBOX to archive.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        thread_ids: { type: "array", items: { type: "string" } },
        add_label_ids: { type: "array", items: { type: "string" } },
        remove_label_ids: { type: "array", items: { type: "string" } },
      },
      required: ["account", "thread_ids"],
    },
    run: async (a) => {
      requireWrites("gmail_modify");
      const acct = String(a.account);
      const ids = (a.thread_ids as string[]) ?? [];
      for (const id of ids) {
        await api(acct, "POST", `${GMAIL}/threads/${seg(id)}/modify`, {
          body: {
            addLabelIds: (a.add_label_ids as string[]) ?? [],
            removeLabelIds: (a.remove_label_ids as string[]) ?? [],
          },
        });
      }
      return { modified: ids };
    },
  },
  {
    name: "calendar_list_events",
    description: "List calendar events between two RFC3339 timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        time_min: { type: "string", description: "RFC3339, e.g. 2026-08-04T00:00:00-07:00" },
        time_max: { type: "string" },
        calendar_id: { type: "string", default: "primary" },
        query: { type: "string" },
        max_results: { type: "integer", default: 25 },
      },
      required: ["account", "time_min", "time_max"],
    },
    run: async (a) => {
      const data = await api<{ items?: Array<Record<string, unknown>> }>(
        String(a.account),
        "GET",
        `${CALENDAR}/calendars/${seg(String(a.calendar_id ?? "primary"))}/events`,
        {
          params: {
            timeMin: String(a.time_min),
            timeMax: String(a.time_max),
            q: a.query === undefined ? undefined : String(a.query),
            singleEvents: true,
            orderBy: "startTime",
            maxResults: Math.min(Number(a.max_results ?? 25), 250),
          },
        },
      );
      return {
        events: (data.items ?? []).map((ev) => ({
          id: ev.id,
          summary: ev.summary,
          start: ev.start,
          end: ev.end,
          location: ev.location,
          status: ev.status,
          attendees: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
          hangoutLink: ev.hangoutLink,
        })),
      };
    },
  },
  {
    name: "drive_search",
    description: "Search Drive with Drive query syntax, e.g. name contains 'roadmap'.",
    inputSchema: {
      type: "object",
      properties: { account, query: { type: "string" }, max_results: { type: "integer", default: 10 } },
      required: ["account", "query"],
    },
    run: async (a) => {
      const data = await api<{ files?: unknown[] }>(String(a.account), "GET", `${DRIVE}/files`, {
        params: {
          q: String(a.query),
          pageSize: Math.min(Number(a.max_results ?? 10), 50),
          fields: "files(id,name,mimeType,modifiedTime,owners(emailAddress),webViewLink)",
        },
      });
      return { files: data.files ?? [] };
    },
  },
  {
    name: "drive_read_file",
    description: "Read a Drive file as text. Docs and Sheets are exported as text or CSV.",
    inputSchema: {
      type: "object",
      properties: { account, file_id: { type: "string" }, limit: { type: "integer", default: 20000 } },
      required: ["account", "file_id"],
    },
    run: async (a) => {
      const acct = String(a.account);
      const id = seg(String(a.file_id));
      const meta = await api<{ name?: string; mimeType?: string; size?: string }>(
        acct,
        "GET",
        `${DRIVE}/files/${id}`,
        { params: { fields: "id,name,mimeType,size" } },
      );
      const mime = meta.mimeType ?? "";
      let content: string;
      if (mime.startsWith("application/vnd.google-apps")) {
        content = await api<string>(acct, "GET", `${DRIVE}/files/${id}/export`, {
          params: { mimeType: mime.endsWith("spreadsheet") ? "text/csv" : "text/plain" },
          raw: true,
        });
      } else {
        if (Number(meta.size ?? 0) > 5_000_000) {
          throw new Error(`file is too large to read inline: ${meta.size} bytes`);
        }
        content = await api<string>(acct, "GET", `${DRIVE}/files/${id}`, {
          params: { alt: "media" },
          raw: true,
        });
      }
      return {
        name: meta.name,
        mimeType: mime,
        content: content.slice(0, Math.min(Number(a.limit ?? 20_000), 100_000)),
      };
    },
  },
];
