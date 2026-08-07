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
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const DOCS = "https://docs.googleapis.com/v1/documents";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const SLIDES = "https://slides.googleapis.com/v1/presentations";

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

/**
 * Create a Drive file and its content in one request.
 *
 * Drive wants multipart/related for this, which `api` cannot express because it
 * JSON-encodes every body, so the envelope is built by hand here.
 */
async function createWithContent<T>(
  account: string,
  metadata: Record<string, unknown>,
  contentType: string,
  content: string,
): Promise<T> {
  const token = await accessToken(account);
  const boundary = `gws${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n` +
    `--${boundary}--`;
  const res = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&supportsAllDrives=true` +
      `&fields=id,name,mimeType,webViewLink`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!res.ok) {
    throw new Error(`Google API error ${res.status}: ${(await res.text()).slice(0, 600)}`);
  }
  return (await res.json()) as T;
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

/**
 * Docs addressing.
 *
 * The Docs API positions everything by integer index, but a caller only knows
 * the text it is looking at. Every edit tool here therefore anchors on an exact
 * string and resolves the index itself. Callers never do index arithmetic, and
 * an anchor that no longer matches fails loudly instead of writing to the wrong
 * place.
 */

interface DocTextRun {
  startIndex?: number;
  endIndex?: number;
  textRun?: { content?: string };
}
interface DocElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: { elements?: DocTextRun[] };
  table?: { tableRows?: Array<{ tableCells?: Array<{ content?: DocElement[] }> }> };
}

/** Flatten a document to plain text plus a per-character index map. */
function flattenDoc(content: DocElement[]): { text: string; indices: number[] } {
  let text = "";
  const indices: number[] = [];
  const walk = (elements: DocElement[]) => {
    for (const el of elements) {
      for (const run of el.paragraph?.elements ?? []) {
        const chunk = run.textRun?.content;
        if (!chunk || run.startIndex === undefined) continue;
        for (let i = 0; i < chunk.length; i++) {
          text += chunk[i];
          indices.push(run.startIndex + i);
        }
      }
      for (const row of el.table?.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) walk(cell.content ?? []);
      }
    }
  };
  walk(content);
  return { text, indices };
}

/** Resolve an anchor string to a document index range. Throws if ambiguous. */
async function locate(
  acct: string,
  documentId: string,
  anchor: string,
  occurrence: number,
): Promise<{ start: number; end: number; total: number }> {
  const doc = await api<{ body?: { content?: DocElement[] } }>(
    acct,
    "GET",
    `${DOCS}/${seg(documentId)}`,
  );
  const { text, indices } = flattenDoc(doc.body?.content ?? []);
  const hits: number[] = [];
  for (let at = text.indexOf(anchor); at !== -1; at = text.indexOf(anchor, at + 1)) hits.push(at);
  if (!hits.length) throw new Error(`anchor text not found in document: ${JSON.stringify(anchor)}`);
  if (occurrence < 1 || occurrence > hits.length) {
    throw new Error(`occurrence ${occurrence} out of range: ${hits.length} match(es) found`);
  }
  const at = hits[occurrence - 1];
  return {
    start: indices[at],
    end: indices[at + anchor.length - 1] + 1,
    total: hits.length,
  };
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
  {
    name: "drive_create_doc",
    description:
      "Create a Google Doc from Markdown and return its id and link. Google converts headings, lists, " +
      "tables, bold, and links. Author with this, then amend with docs_replace_text and docs_insert_text " +
      "rather than recreating the file, so the link and any comments survive.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        title: { type: "string", description: "Document title, also the Drive file name" },
        markdown: { type: "string", description: "Document body as Markdown" },
        folder_id: { type: "string", description: "Drive folder id; omit for My Drive" },
      },
      required: ["account", "title", "markdown"],
    },
    run: async (a) => {
      requireWrites("drive_create_doc");
      const metadata: Record<string, unknown> = {
        name: String(a.title),
        mimeType: "application/vnd.google-apps.document",
      };
      if (a.folder_id) metadata.parents = [String(a.folder_id)];
      return await createWithContent(
        String(a.account),
        metadata,
        "text/markdown",
        String(a.markdown),
      );
    },
  },
  {
    name: "drive_share_file",
    description:
      "Grant one person access to a Drive file. Sends no email unless notify is set.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        file_id: { type: "string" },
        email: { type: "string", description: "Who to grant access to" },
        role: { type: "string", enum: ["reader", "commenter", "writer"], default: "commenter" },
        notify: { type: "boolean", default: false },
      },
      required: ["account", "file_id", "email"],
    },
    run: async (a) => {
      requireWrites("drive_share_file");
      return await api(
        String(a.account),
        "POST",
        `${DRIVE}/files/${seg(String(a.file_id))}/permissions`,
        {
          params: {
            sendNotificationEmail: Boolean(a.notify ?? false),
            supportsAllDrives: true,
            fields: "id,type,role,emailAddress",
          },
          body: { type: "user", role: String(a.role ?? "commenter"), emailAddress: String(a.email) },
        },
      );
    },
  },
  {
    name: "docs_replace_text",
    description:
      "Replace one exact run of text in a Google Doc. Anchors on the text itself, so no index math. " +
      "Fails rather than guessing if the anchor is missing; use `occurrence` when it appears more than once. " +
      "Set dry_run to see what would change first.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        document_id: { type: "string" },
        find: { type: "string", description: "Exact text to replace, whitespace included" },
        replace: { type: "string" },
        occurrence: { type: "integer", default: 1, description: "1-based, when `find` repeats" },
        dry_run: { type: "boolean", default: false },
      },
      required: ["account", "document_id", "find", "replace"],
    },
    run: async (a) => {
      requireWrites("docs_replace_text");
      const acct = String(a.account);
      const id = String(a.document_id);
      const find = String(a.find);
      const at = await locate(acct, id, find, Number(a.occurrence ?? 1));
      if (a.dry_run) {
        return { would_replace: find, with: String(a.replace), range: at, applied: false };
      }
      await api(acct, "POST", `${DOCS}/${seg(id)}:batchUpdate`, {
        body: {
          requests: [
            { deleteContentRange: { range: { startIndex: at.start, endIndex: at.end } } },
            { insertText: { location: { index: at.start }, text: String(a.replace) } },
          ],
        },
      });
      return { replaced: find, with: String(a.replace), range: at, applied: true };
    },
  },
  {
    name: "docs_insert_text",
    description:
      "Insert text into a Google Doc immediately before or after an exact anchor string. " +
      "Use for adding a note next to a specific passage without rewriting it.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        document_id: { type: "string" },
        anchor: { type: "string", description: "Exact existing text to position against" },
        text: { type: "string", description: "Text to insert" },
        position: { type: "string", enum: ["before", "after"], default: "after" },
        occurrence: { type: "integer", default: 1 },
      },
      required: ["account", "document_id", "anchor", "text"],
    },
    run: async (a) => {
      requireWrites("docs_insert_text");
      const acct = String(a.account);
      const id = String(a.document_id);
      const at = await locate(acct, id, String(a.anchor), Number(a.occurrence ?? 1));
      const index = String(a.position ?? "after") === "before" ? at.start : at.end;
      await api(acct, "POST", `${DOCS}/${seg(id)}:batchUpdate`, {
        body: { requests: [{ insertText: { location: { index }, text: String(a.text) } }] },
      });
      return { inserted_at: index, position: a.position ?? "after", anchor: a.anchor };
    },
  },
  {
    name: "sheets_read_range",
    description:
      "Read a range of a Google Sheet in A1 notation, e.g. 'Sheet1!A1:F20'. Omit the range to read the first sheet.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        spreadsheet_id: { type: "string" },
        range: { type: "string", default: "A1:Z100" },
      },
      required: ["account", "spreadsheet_id"],
    },
    run: async (a) => {
      const data = await api<{ range?: string; values?: unknown[][] }>(
        String(a.account),
        "GET",
        `${SHEETS}/${seg(String(a.spreadsheet_id))}/values/${seg(String(a.range ?? "A1:Z100"))}`,
      );
      return { range: data.range, values: data.values ?? [] };
    },
  },
  {
    name: "sheets_update_range",
    description:
      "Write values into a Google Sheet range in A1 notation. `values` is an array of rows. " +
      "Values are entered as if typed, so formulas and dates parse. Read the range first to confirm the target.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        spreadsheet_id: { type: "string" },
        range: { type: "string", description: "A1 notation, e.g. 'Sheet1!D4:D6'" },
        values: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "Rows of cell values",
        },
        raw: { type: "boolean", default: false, description: "Store literally, skipping parsing" },
      },
      required: ["account", "spreadsheet_id", "range", "values"],
    },
    run: async (a) => {
      requireWrites("sheets_update_range");
      const data = await api<{ updatedRange?: string; updatedCells?: number }>(
        String(a.account),
        "PUT",
        `${SHEETS}/${seg(String(a.spreadsheet_id))}/values/${seg(String(a.range))}`,
        {
          params: { valueInputOption: a.raw ? "RAW" : "USER_ENTERED" },
          body: { values: a.values },
        },
      );
      return { updatedRange: data.updatedRange, updatedCells: data.updatedCells };
    },
  },
  {
    name: "sheets_find_replace",
    description:
      "Find and replace text across a Google Sheet. Scoped to one sheet by sheet_id, or all sheets by default.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        spreadsheet_id: { type: "string" },
        find: { type: "string" },
        replace: { type: "string" },
        sheet_id: { type: "integer", description: "Numeric sheet id; omit to search every sheet" },
        match_case: { type: "boolean", default: true },
      },
      required: ["account", "spreadsheet_id", "find", "replace"],
    },
    run: async (a) => {
      requireWrites("sheets_find_replace");
      const scope =
        a.sheet_id === undefined ? { allSheets: true } : { sheetId: Number(a.sheet_id) };
      const data = await api<{ replies?: Array<{ findReplace?: Record<string, unknown> }> }>(
        String(a.account),
        "POST",
        `${SHEETS}/${seg(String(a.spreadsheet_id))}:batchUpdate`,
        {
          body: {
            requests: [
              {
                findReplace: {
                  find: String(a.find),
                  replacement: String(a.replace),
                  matchCase: a.match_case ?? true,
                  ...scope,
                },
              },
            ],
          },
        },
      );
      return data.replies?.[0]?.findReplace ?? {};
    },
  },
  {
    name: "slides_read",
    description:
      "Read a Google Slides deck as text, slide by slide. Returns each slide's objectId alongside its " +
      "text, so an edit can be scoped to one slide.",
    inputSchema: {
      type: "object",
      properties: { account, presentation_id: { type: "string" } },
      required: ["account", "presentation_id"],
    },
    run: async (a) => {
      interface TextEl { textRun?: { content?: string } }
      interface PageEl {
        objectId?: string;
        shape?: { text?: { textElements?: TextEl[] } };
        table?: { tableRows?: Array<{ tableCells?: Array<{ text?: { textElements?: TextEl[] } }> }> };
      }
      const deck = await api<{
        title?: string;
        slides?: Array<{ objectId?: string; pageElements?: PageEl[] }>;
      }>(String(a.account), "GET", `${SLIDES}/${seg(String(a.presentation_id))}`);

      const runs = (els: TextEl[] | undefined) =>
        (els ?? []).map((e) => e.textRun?.content ?? "").join("");

      return {
        title: deck.title,
        slides: (deck.slides ?? []).map((slide, i) => {
          const parts: string[] = [];
          for (const el of slide.pageElements ?? []) {
            const shapeText = runs(el.shape?.text?.textElements).trim();
            if (shapeText) parts.push(shapeText);
            for (const row of el.table?.tableRows ?? []) {
              for (const cell of row.tableCells ?? []) {
                const cellText = runs(cell.text?.textElements).trim();
                if (cellText) parts.push(cellText);
              }
            }
          }
          return { number: i + 1, objectId: slide.objectId, text: parts.join("\n") };
        }),
      };
    },
  },
  {
    name: "slides_replace_text",
    description:
      "Replace text in a Google Slides deck. Scope to specific slides with slide_ids (from slides_read) " +
      "to target one passage; omit it to replace across the whole deck.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        presentation_id: { type: "string" },
        find: { type: "string" },
        replace: { type: "string" },
        slide_ids: {
          type: "array",
          items: { type: "string" },
          description: "Slide objectIds to limit the replacement to",
        },
        match_case: { type: "boolean", default: true },
      },
      required: ["account", "presentation_id", "find", "replace"],
    },
    run: async (a) => {
      requireWrites("slides_replace_text");
      const ids = (a.slide_ids as string[] | undefined) ?? [];
      const data = await api<{ replies?: Array<{ replaceAllText?: { occurrencesChanged?: number } }> }>(
        String(a.account),
        "POST",
        `${SLIDES}/${seg(String(a.presentation_id))}:batchUpdate`,
        {
          body: {
            requests: [
              {
                replaceAllText: {
                  containsText: { text: String(a.find), matchCase: a.match_case ?? true },
                  replaceText: String(a.replace),
                  ...(ids.length ? { pageObjectIds: ids } : {}),
                },
              },
            ],
          },
        },
      );
      const changed = data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
      if (changed === 0) throw new Error(`no occurrences of ${JSON.stringify(String(a.find))} found`);
      return { occurrencesChanged: changed, scopedTo: ids.length ? ids : "all slides" };
    },
  },
  {
    name: "drive_list_comments",
    description: "List comments on a Drive file, including replies and resolution state.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        file_id: { type: "string" },
        include_resolved: { type: "boolean", default: false },
      },
      required: ["account", "file_id"],
    },
    run: async (a) => {
      const data = await api<{ comments?: Array<Record<string, unknown>> }>(
        String(a.account),
        "GET",
        `${DRIVE}/files/${seg(String(a.file_id))}/comments`,
        {
          params: {
            fields:
              "comments(id,author(displayName),content,quotedFileContent,resolved,createdTime,replies(id,author(displayName),content,createdTime))",
            pageSize: 100,
          },
        },
      );
      const all = data.comments ?? [];
      return { comments: a.include_resolved ? all : all.filter((c) => !c.resolved) };
    },
  },
  {
    name: "drive_add_comment",
    description:
      "Add a comment to a Doc or Sheet. Pass quote_text to attach it to a specific passage, " +
      "which Drive shows as the quoted context on the comment.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        file_id: { type: "string" },
        content: { type: "string", description: "Comment body" },
        quote_text: { type: "string", description: "Existing text the comment refers to" },
      },
      required: ["account", "file_id", "content"],
    },
    run: async (a) => {
      requireWrites("drive_add_comment");
      const body: Record<string, unknown> = { content: String(a.content) };
      if (a.quote_text !== undefined) {
        body.quotedFileContent = { mimeType: "text/plain", value: String(a.quote_text) };
      }
      const data = await api<Record<string, unknown>>(
        String(a.account),
        "POST",
        `${DRIVE}/files/${seg(String(a.file_id))}/comments`,
        { params: { fields: "id,content,quotedFileContent,createdTime" }, body },
      );
      return data;
    },
  },
  {
    name: "drive_reply_comment",
    description: "Reply to an existing comment, optionally resolving it.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        file_id: { type: "string" },
        comment_id: { type: "string" },
        content: { type: "string" },
        resolve: { type: "boolean", default: false },
      },
      required: ["account", "file_id", "comment_id", "content"],
    },
    run: async (a) => {
      requireWrites("drive_reply_comment");
      const body: Record<string, unknown> = { content: String(a.content) };
      if (a.resolve) body.action = "resolve";
      const data = await api<Record<string, unknown>>(
        String(a.account),
        "POST",
        `${DRIVE}/files/${seg(String(a.file_id))}/comments/${seg(String(a.comment_id))}/replies`,
        { params: { fields: "id,content,action,createdTime" }, body },
      );
      return data;
    },
  },
];
