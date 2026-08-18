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

/**
 * Shared-drive support for the Drive v3 API.
 *
 * A file that lives in a Shared Drive is invisible to a request that does not
 * opt in: `files.get` returns 404 (not 403) and `files.list` silently omits it,
 * which reads exactly like a permission problem even though the browser opens
 * the file fine. Every file-scoped call carries {@link ALL_DRIVES}; `files.list`
 * additionally needs the item flag and a corpus that spans both drives.
 */
const ALL_DRIVES = { supportsAllDrives: true } as const;
const LIST_ALL_DRIVES = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  corpora: "allDrives",
} as const;

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

/**
 * Upload raw bytes to Drive, optionally converting them to a native Google type.
 *
 * The binary sibling of {@link createWithContent}. That helper concatenates the
 * multipart envelope as a string, which silently corrupts anything that is not
 * valid UTF-8 — a `.pptx` is a zip, so it has to be carried as bytes. The body
 * is therefore assembled as a Buffer: text envelope, raw media, text closer.
 *
 * Conversion is Drive's own: the media part keeps the *source* content type
 * while `metadata.mimeType` names the *destination*. Set the destination to a
 * `application/vnd.google-apps.*` type and Drive imports rather than stores —
 * which is exactly how a `.pptx` becomes an editable Slides deck, a `.docx` a
 * Doc, a `.xlsx` a Sheet.
 */
async function uploadBytes<T>(
  account: string,
  metadata: Record<string, unknown>,
  sourceMime: string,
  bytes: Buffer,
): Promise<T> {
  const token = await accessToken(account);
  const boundary = `gws${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${sourceMime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, bytes, tail]);
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

/**
 * GET binary bytes from a Google endpoint. `api` decodes as text, which mangles
 * anything that is not UTF-8 — an exported .pptx or .png is bytes, so it needs
 * its own path that reads the arrayBuffer intact.
 */
async function fetchBytes(account: string, url: string): Promise<Buffer> {
  const token = await accessToken(account);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`Google API error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  return Buffer.from(await res.arrayBuffer());
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
  paragraph?: {
    elements?: DocTextRun[];
    /* Restructuring needs to see shape, not just text: which paragraphs are
       headings, which are already list items, how big a table is. */
    paragraphStyle?: { namedStyleType?: string };
    bullet?: { listId?: string; nestingLevel?: number };
  };
  table?: {
    rows?: number;
    columns?: number;
    tableRows?: Array<{ tableCells?: Array<{ content?: DocElement[] }> }>;
  };
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

/**
 * Resolve an anchor string to the table cell that contains it.
 *
 * Row operations need the table's own start index, which `locate` cannot give
 * because it only knows character offsets into the flattened text. This walks
 * tables in document order and reports the cell the anchor sits in, so callers
 * still address structure by the text they can see. Throws if the anchor is not
 * inside a table.
 */
async function locateTable(
  acct: string,
  documentId: string,
  anchor: string,
  occurrence: number,
): Promise<{
  tableStartIndex: number;
  tableEndIndex: number;
  rowIndex: number;
  columnIndex: number;
  rows: number;
  columns: number;
  total: number;
}> {
  const doc = await api<{ body?: { content?: DocElement[] } }>(
    acct,
    "GET",
    `${DOCS}/${seg(documentId)}`,
  );
  const hits: Array<{
    tableStartIndex: number;
    tableEndIndex: number;
    rowIndex: number;
    columnIndex: number;
    rows: number;
    columns: number;
  }> = [];
  const walk = (elements: DocElement[]) => {
    for (const el of elements) {
      const table = el.table;
      if (!table || el.startIndex === undefined || el.endIndex === undefined) continue;
      const tableRows = table.tableRows ?? [];
      for (let r = 0; r < tableRows.length; r++) {
        const cells = tableRows[r].tableCells ?? [];
        for (let c = 0; c < cells.length; c++) {
          const content = cells[c].content ?? [];
          const { text } = flattenDoc(content);
          for (let at = text.indexOf(anchor); at !== -1; at = text.indexOf(anchor, at + 1)) {
            hits.push({
              tableStartIndex: el.startIndex,
              tableEndIndex: el.endIndex,
              rowIndex: r,
              columnIndex: c,
              rows: table.rows ?? tableRows.length,
              columns: table.columns ?? cells.length,
            });
          }
          walk(content);
        }
      }
    }
  };
  walk(doc.body?.content ?? []);
  if (!hits.length) {
    throw new Error(`anchor text not found inside any table: ${JSON.stringify(anchor)}`);
  }
  if (occurrence < 1 || occurrence > hits.length) {
    throw new Error(
      `occurrence ${occurrence} out of range: ${hits.length} match(es) found in tables`,
    );
  }
  return { ...hits[occurrence - 1], total: hits.length };
}

/** Summarise a document's structure: headings, tables, and bulleted runs. */
function outlineDoc(content: DocElement[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (elements: DocElement[], depth: number) => {
    for (const el of elements) {
      if (el.paragraph) {
        const text = (el.paragraph.elements ?? [])
          .map((run) => run.textRun?.content ?? "")
          .join("")
          .replace(/\n+$/, "");
        const style = el.paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT";
        const bullet = el.paragraph.bullet;
        if (!text.trim() && !bullet) continue;
        if (style.startsWith("HEADING") || style === "TITLE" || style === "SUBTITLE") {
          out.push({ kind: "heading", style, text, start: el.startIndex, end: el.endIndex, depth });
        } else if (bullet) {
          out.push({
            kind: "list_item",
            text,
            list_id: bullet.listId,
            nesting_level: bullet.nestingLevel ?? 0,
            start: el.startIndex,
            end: el.endIndex,
            depth,
          });
        }
      }
      if (el.table) {
        const tableRows = el.table.tableRows ?? [];
        const preview = (tableRows[0]?.tableCells ?? []).map((cell) =>
          flattenDoc(cell.content ?? []).text.replace(/\n+/g, " ").trim().slice(0, 40),
        );
        out.push({
          kind: "table",
          rows: el.table.rows ?? tableRows.length,
          columns: el.table.columns ?? (tableRows[0]?.tableCells ?? []).length,
          first_row: preview,
          start: el.startIndex,
          end: el.endIndex,
          depth,
        });
        for (const row of tableRows) {
          for (const cell of row.tableCells ?? []) walk(cell.content ?? [], depth + 1);
        }
      }
    }
  };
  walk(content, 0);
  return out;
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
          ...LIST_ALL_DRIVES,
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
        { params: { fields: "id,name,mimeType,size", ...ALL_DRIVES } },
      );
      const mime = meta.mimeType ?? "";
      let content: string;
      if (mime.startsWith("application/vnd.google-apps")) {
        content = await api<string>(acct, "GET", `${DRIVE}/files/${id}/export`, {
          params: { mimeType: mime.endsWith("spreadsheet") ? "text/csv" : "text/plain", ...ALL_DRIVES },
          raw: true,
        });
      } else {
        if (Number(meta.size ?? 0) > 5_000_000) {
          throw new Error(`file is too large to read inline: ${meta.size} bytes`);
        }
        content = await api<string>(acct, "GET", `${DRIVE}/files/${id}`, {
          params: { alt: "media", ...ALL_DRIVES },
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
    name: "drive_export",
    description:
      "Export a native Google file (Doc, Sheet, Slides) to a downloadable format and return the bytes " +
      "as base64. The binary sibling of drive_read_file (which only gives text): use this to get an " +
      "editable file out of Google — e.g. a Slides deck as .pptx to reuse as a template, or a Doc as " +
      "PDF. Common target mime types: presentationml.presentation (.pptx), " +
      "wordprocessingml.document (.docx), spreadsheetml.sheet (.xlsx), application/pdf, image/png.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        file_id: { type: "string" },
        mime_type: { type: "string", description: "Target export format, e.g. application/vnd.openxmlformats-officedocument.presentationml.presentation" },
      },
      required: ["account", "file_id", "mime_type"],
    },
    run: async (a) => {
      const id = seg(String(a.file_id));
      const meta = await api<{ name?: string }>(String(a.account), "GET", `${DRIVE}/files/${id}`, {
        params: { fields: "name", ...ALL_DRIVES },
      });
      const url =
        `${DRIVE}/files/${id}/export?mimeType=${encodeURIComponent(String(a.mime_type))}` +
        `&supportsAllDrives=true`;
      const bytes = await fetchBytes(String(a.account), url);
      if (bytes.length > 30_000_000) {
        throw new Error(`export is too large to return inline: ${bytes.length} bytes`);
      }
      return {
        name: meta.name,
        mimeType: String(a.mime_type),
        bytes: bytes.length,
        content_base64: bytes.toString("base64"),
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
    name: "drive_upload",
    description:
      "Upload a file to Drive from base64 bytes, optionally importing it as a native Google type. " +
      "This is how a deck is created: build a .pptx and upload it with convert_to set to the Slides " +
      "type, and Google imports it as an editable presentation — there is no Slides equivalent of " +
      "drive_create_doc's Markdown path, so you author the file and let Drive convert. The same route " +
      "turns a .docx into a Doc and a .xlsx into a Sheet. Omit convert_to to store the file unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        name: { type: "string", description: "File name in Drive" },
        content_base64: { type: "string", description: "The file's bytes, base64-encoded" },
        mime_type: {
          type: "string",
          description:
            "Source content type of the uploaded bytes, e.g. " +
            "application/vnd.openxmlformats-officedocument.presentationml.presentation for a .pptx",
        },
        convert_to: {
          type: "string",
          description:
            "Google type to import as, e.g. application/vnd.google-apps.presentation for Slides, " +
            "…document for Docs, …spreadsheet for Sheets. Omit to keep the file as-is.",
        },
        folder_id: { type: "string", description: "Drive folder id; omit for My Drive" },
      },
      required: ["account", "name", "content_base64", "mime_type"],
    },
    run: async (a) => {
      requireWrites("drive_upload");
      const bytes = Buffer.from(String(a.content_base64), "base64");
      if (bytes.length === 0) throw new Error("content_base64 decoded to zero bytes");
      if (bytes.length > 40_000_000) {
        throw new Error(`file too large to upload inline: ${bytes.length} bytes`);
      }
      const metadata: Record<string, unknown> = {
        name: String(a.name),
        // Destination type: the Google type when converting, else the source
        // type so the file stores unchanged.
        mimeType: a.convert_to ? String(a.convert_to) : String(a.mime_type),
      };
      if (a.folder_id) metadata.parents = [String(a.folder_id)];
      return await uploadBytes(String(a.account), metadata, String(a.mime_type), bytes);
    },
  },
  {
    name: "drive_copy",
    description:
      "Duplicate a Drive file, keeping everything about it. This is how a deck is cloned with its design " +
      "intact: the copy is the same file — theme, master, layouts, fonts, colours, images, diagrams, " +
      "speaker notes — so nothing has to be rebuilt. Edit the copy afterward with slides_replace_text or " +
      "slides_batch_update. Works across shared drives.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        file_id: { type: "string", description: "The file to duplicate" },
        name: { type: "string", description: "Name for the copy; defaults to 'Copy of <original>'" },
        folder_id: { type: "string", description: "Drive folder for the copy; omit for My Drive" },
      },
      required: ["account", "file_id"],
    },
    run: async (a) => {
      requireWrites("drive_copy");
      const body: Record<string, unknown> = {};
      if (a.name !== undefined) body.name = String(a.name);
      if (a.folder_id) body.parents = [String(a.folder_id)];
      return await api<Record<string, unknown>>(
        String(a.account),
        "POST",
        `${DRIVE}/files/${seg(String(a.file_id))}/copy`,
        { params: { fields: "id,name,mimeType,webViewLink", ...ALL_DRIVES }, body },
      );
    },
  },
  {
    name: "drive_trash",
    description:
      "Move a Drive file to the trash, or restore it. Reversible: trashed files sit in the trash until " +
      "it is emptied, which this tool does not do. Use it to clean up files this connector created.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        file_id: { type: "string" },
        restore: { type: "boolean", default: false, description: "Set true to pull the file back out of the trash" },
      },
      required: ["account", "file_id"],
    },
    run: async (a) => {
      requireWrites("drive_trash");
      return await api<Record<string, unknown>>(
        String(a.account),
        "PATCH",
        `${DRIVE}/files/${seg(String(a.file_id))}`,
        { params: { fields: "id,name,trashed", ...ALL_DRIVES }, body: { trashed: !a.restore } },
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
    name: "docs_get_structure",
    description:
      "Outline a Google Doc's structure: headings, tables with their dimensions and first-row preview, " +
      "and existing bulleted list items. Read this before restructuring so anchors are chosen against " +
      "what is actually there.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        document_id: { type: "string" },
      },
      required: ["account", "document_id"],
    },
    run: async (a) => {
      const acct = String(a.account);
      const id = String(a.document_id);
      const doc = await api<{ title?: string; body?: { content?: DocElement[] } }>(
        acct,
        "GET",
        `${DOCS}/${seg(id)}`,
      );
      const outline = outlineDoc(doc.body?.content ?? []);
      return {
        title: doc.title,
        document_id: id,
        counts: {
          headings: outline.filter((e) => e.kind === "heading").length,
          tables: outline.filter((e) => e.kind === "table").length,
          list_items: outline.filter((e) => e.kind === "list_item").length,
        },
        outline,
      };
    },
  },
  {
    name: "docs_format_bullets",
    description:
      "Turn the paragraphs between two exact anchor strings into a bulleted or numbered list, or strip " +
      "bullet formatting off them. Anchors on the text itself, so no index math. Use this to convert a " +
      "run of plain paragraphs into real list items without rewriting the document.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        document_id: { type: "string" },
        start_anchor: { type: "string", description: "Exact text in the first paragraph of the range" },
        end_anchor: {
          type: "string",
          description:
            "Exact text in the last paragraph of the range. Omit to affect only the start paragraph.",
        },
        preset: {
          type: "string",
          enum: [
            "BULLET_DISC_CIRCLE_SQUARE",
            "BULLET_ARROW_DIAMOND_DISC",
            "BULLET_STAR_CIRCLE_SQUARE",
            "BULLET_CHECKBOX",
            "NUMBERED_DECIMAL_ALPHA_ROMAN",
            "NUMBERED_DECIMAL_NESTED",
          ],
          default: "BULLET_DISC_CIRCLE_SQUARE",
        },
        remove: { type: "boolean", default: false, description: "Strip bullets instead of applying them" },
        start_occurrence: { type: "integer", default: 1 },
        end_occurrence: { type: "integer", default: 1 },
        dry_run: { type: "boolean", default: false },
      },
      required: ["account", "document_id", "start_anchor"],
    },
    run: async (a) => {
      requireWrites("docs_format_bullets");
      const acct = String(a.account);
      const id = String(a.document_id);
      const from = await locate(acct, id, String(a.start_anchor), Number(a.start_occurrence ?? 1));
      const to =
        a.end_anchor === undefined
          ? from
          : await locate(acct, id, String(a.end_anchor), Number(a.end_occurrence ?? 1));
      if (to.end < from.start) {
        throw new Error("end_anchor resolves before start_anchor; check the order of the anchors");
      }
      const range = { startIndex: from.start, endIndex: to.end };
      const remove = Boolean(a.remove);
      const preset = String(a.preset ?? "BULLET_DISC_CIRCLE_SQUARE");
      if (a.dry_run) {
        return {
          would: remove ? "remove_bullets" : "apply_bullets",
          preset: remove ? null : preset,
          range,
          applied: false,
        };
      }
      await api(acct, "POST", `${DOCS}/${seg(id)}:batchUpdate`, {
        body: {
          requests: [
            remove
              ? { deleteParagraphBullets: { range } }
              : { createParagraphBullets: { range, bulletPreset: preset } },
          ],
        },
      });
      return {
        action: remove ? "removed_bullets" : "applied_bullets",
        preset: remove ? null : preset,
        range,
        applied: true,
      };
    },
  },
  {
    name: "docs_insert_table_row",
    description:
      "Insert a row into a Google Doc table, above or below the row containing an exact anchor string. " +
      "The anchor must be text inside the table.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        document_id: { type: "string" },
        anchor: { type: "string", description: "Exact text inside the reference row" },
        position: { type: "string", enum: ["above", "below"], default: "below" },
        occurrence: { type: "integer", default: 1, description: "1-based, counting matches inside tables" },
      },
      required: ["account", "document_id", "anchor"],
    },
    run: async (a) => {
      requireWrites("docs_insert_table_row");
      const acct = String(a.account);
      const id = String(a.document_id);
      const cell = await locateTable(acct, id, String(a.anchor), Number(a.occurrence ?? 1));
      const below = String(a.position ?? "below") !== "above";
      await api(acct, "POST", `${DOCS}/${seg(id)}:batchUpdate`, {
        body: {
          requests: [
            {
              insertTableRow: {
                tableCellLocation: {
                  tableStartLocation: { index: cell.tableStartIndex },
                  rowIndex: cell.rowIndex,
                  columnIndex: cell.columnIndex,
                },
                insertBelow: below,
              },
            },
          ],
        },
      });
      return {
        inserted: below ? "below" : "above",
        reference_row: cell.rowIndex,
        table_start: cell.tableStartIndex,
        rows_before: cell.rows,
        applied: true,
      };
    },
  },
  {
    name: "docs_delete_table_row",
    description:
      "Delete the table row containing an exact anchor string. Destructive, so set dry_run first to " +
      "confirm which row resolves.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        document_id: { type: "string" },
        anchor: { type: "string", description: "Exact text inside the row to delete" },
        occurrence: { type: "integer", default: 1, description: "1-based, counting matches inside tables" },
        dry_run: { type: "boolean", default: false },
      },
      required: ["account", "document_id", "anchor"],
    },
    run: async (a) => {
      requireWrites("docs_delete_table_row");
      const acct = String(a.account);
      const id = String(a.document_id);
      const cell = await locateTable(acct, id, String(a.anchor), Number(a.occurrence ?? 1));
      if (a.dry_run) {
        return {
          would_delete_row: cell.rowIndex,
          table_start: cell.tableStartIndex,
          rows: cell.rows,
          applied: false,
        };
      }
      await api(acct, "POST", `${DOCS}/${seg(id)}:batchUpdate`, {
        body: {
          requests: [
            {
              deleteTableRow: {
                tableCellLocation: {
                  tableStartLocation: { index: cell.tableStartIndex },
                  rowIndex: cell.rowIndex,
                  columnIndex: cell.columnIndex,
                },
              },
            },
          ],
        },
      });
      return {
        deleted_row: cell.rowIndex,
        table_start: cell.tableStartIndex,
        rows_before: cell.rows,
        applied: true,
      };
    },
  },
  {
    name: "docs_insert_table",
    description:
      "Insert a table into a Google Doc immediately before or after an exact anchor string, optionally " +
      "filling its cells. Give `cells` as an array of rows; `rows` and `columns` are inferred from it if " +
      "omitted. An empty table cannot be filled afterwards, because every other tool addresses text by " +
      "anchor and empty cells contain none.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        document_id: { type: "string" },
        anchor: { type: "string", description: "Exact existing text to position the table against" },
        cells: {
          type: "array",
          description: "Row-major contents, e.g. [[\"Name\",\"Owner\"],[\"Estimates\",\"Austen\"]]",
          items: { type: "array", items: { type: "string" } },
        },
        rows: { type: "integer", description: "Rows, at least 1. Inferred from `cells` when given." },
        columns: { type: "integer", description: "Columns, at least 1. Inferred from `cells` when given." },
        position: { type: "string", enum: ["before", "after"], default: "after" },
        occurrence: { type: "integer", default: 1 },
      },
      required: ["account", "document_id", "anchor"],
    },
    run: async (a) => {
      requireWrites("docs_insert_table");
      const acct = String(a.account);
      const id = String(a.document_id);

      const cells = Array.isArray(a.cells)
        ? (a.cells as unknown[]).map((row) =>
            Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")],
          )
        : null;
      const rows = Number(a.rows ?? cells?.length ?? 0);
      const columns = Number(
        a.columns ?? (cells ? Math.max(...cells.map((r) => r.length)) : 0),
      );
      if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
        throw new Error("give `cells`, or rows and columns as integers of at least 1");
      }

      const at = await locate(acct, id, String(a.anchor), Number(a.occurrence ?? 1));
      const index = String(a.position ?? "after") === "before" ? at.start : at.end;
      await api(acct, "POST", `${DOCS}/${seg(id)}:batchUpdate`, {
        body: { requests: [{ insertTable: { location: { index }, rows, columns } }] },
      });
      if (!cells) {
        return { inserted_at: index, rows, columns, position: a.position ?? "after", filled: false };
      }

      /*
       * Cell indices are only knowable after the table exists, so the fill is a
       * second pass. The writes go in descending index order: the API applies
       * requests sequentially, and inserting text shifts everything after it,
       * so working backwards keeps every index we computed still valid.
       */
      const doc = await api<{ body?: { content?: DocElement[] } }>(
        acct,
        "GET",
        `${DOCS}/${seg(id)}`,
      );
      const table = (doc.body?.content ?? []).find(
        (el) => el.table && el.startIndex !== undefined && el.startIndex >= index,
      );
      if (!table?.table) throw new Error("table was inserted but could not be found to fill");

      const writes: Array<{ index: number; text: string }> = [];
      const tableRows = table.table.tableRows ?? [];
      for (let r = 0; r < tableRows.length && r < cells.length; r++) {
        const rowCells = tableRows[r].tableCells ?? [];
        for (let c = 0; c < rowCells.length && c < cells[r].length; c++) {
          const text = cells[r][c];
          const start = rowCells[c].content?.[0]?.startIndex;
          if (text && start !== undefined) writes.push({ index: start, text });
        }
      }
      writes.sort((x, y) => y.index - x.index);

      if (writes.length) {
        await api(acct, "POST", `${DOCS}/${seg(id)}:batchUpdate`, {
          body: {
            requests: writes.map((w) => ({
              insertText: { location: { index: w.index }, text: w.text },
            })),
          },
        });
      }
      return {
        inserted_at: index,
        rows,
        columns,
        position: a.position ?? "after",
        filled: writes.length,
      };
    },
  },
  {
    name: "docs_delete_table",
    description:
      "Delete the entire table containing an exact anchor string. Destructive and removes every cell, so " +
      "set dry_run first to confirm the table that resolves.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        document_id: { type: "string" },
        anchor: { type: "string", description: "Exact text inside the table to delete" },
        occurrence: { type: "integer", default: 1, description: "1-based, counting matches inside tables" },
        dry_run: { type: "boolean", default: false },
      },
      required: ["account", "document_id", "anchor"],
    },
    run: async (a) => {
      requireWrites("docs_delete_table");
      const acct = String(a.account);
      const id = String(a.document_id);
      const cell = await locateTable(acct, id, String(a.anchor), Number(a.occurrence ?? 1));
      if (a.dry_run) {
        return {
          would_delete_table_at: cell.tableStartIndex,
          rows: cell.rows,
          columns: cell.columns,
          applied: false,
        };
      }
      // There is no `deleteTable` request in the Docs v1 API. Removing the
      // table's whole content range is the documented way to drop one.
      await api(acct, "POST", `${DOCS}/${seg(id)}:batchUpdate`, {
        body: {
          requests: [
            {
              deleteContentRange: {
                range: { startIndex: cell.tableStartIndex, endIndex: cell.tableEndIndex },
              },
            },
          ],
        },
      });
      return {
        deleted_table_at: cell.tableStartIndex,
        rows: cell.rows,
        columns: cell.columns,
        applied: true,
      };
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
    name: "slides_create",
    description:
      "Create a new, empty Google Slides deck natively and return its id and link. Build it up with " +
      "slides_batch_update. To instead create a deck from a file you have already authored, use " +
      "drive_upload with convert_to set to the Slides type.",
    inputSchema: {
      type: "object",
      properties: { account, title: { type: "string" } },
      required: ["account", "title"],
    },
    run: async (a) => {
      requireWrites("slides_create");
      const deck = await api<{ presentationId?: string; title?: string }>(
        String(a.account),
        "POST",
        SLIDES,
        { body: { title: String(a.title) } },
      );
      return {
        presentationId: deck.presentationId,
        title: deck.title,
        webViewLink: deck.presentationId
          ? `https://docs.google.com/presentation/d/${deck.presentationId}/edit`
          : undefined,
      };
    },
  },
  {
    name: "slides_batch_update",
    description:
      "Apply raw Google Slides API requests to a deck — the general editor behind everything structural " +
      "or visual that slides_replace_text cannot do. Pass an array of request objects exactly as the " +
      "Slides API defines them: insertText, deleteText, deleteObject, createSlide, duplicateObject, " +
      "createShape, createTable, insertTableRows, createImage, replaceImage, updateTextStyle, " +
      "updateParagraphStyle, updateShapeProperties, updatePageElementTransform, updateSlidesPosition, " +
      "replaceAllShapesWithImage, and so on. Read the deck first (slides_read) to get objectIds to target. " +
      "Returns the API replies, which carry ids for anything newly created.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        presentation_id: { type: "string" },
        requests: {
          type: "array",
          description:
            "Slides API request objects, e.g. " +
            '[{"insertText":{"objectId":"g123","text":"Hello","insertionIndex":0}}]',
          items: { type: "object", additionalProperties: true },
        },
      },
      required: ["account", "presentation_id", "requests"],
    },
    run: async (a) => {
      requireWrites("slides_batch_update");
      const requests = a.requests as unknown[];
      if (!Array.isArray(requests) || requests.length === 0) {
        throw new Error("requests must be a non-empty array of Slides API request objects");
      }
      const data = await api<{ replies?: unknown[] }>(
        String(a.account),
        "POST",
        `${SLIDES}/${seg(String(a.presentation_id))}:batchUpdate`,
        { body: { requests } },
      );
      return { applied: requests.length, replies: data.replies ?? [] };
    },
  },
  {
    name: "slides_get_thumbnail",
    description:
      "Render one slide to a PNG and return a temporary image URL, so a change can be checked by looking " +
      "at it rather than trusting the text. Pass a slide objectId from slides_read.",
    inputSchema: {
      type: "object",
      properties: {
        account,
        presentation_id: { type: "string" },
        slide_id: { type: "string", description: "Slide objectId from slides_read" },
        size: {
          type: "string",
          enum: ["SMALL", "MEDIUM", "LARGE"],
          default: "MEDIUM",
          description: "Thumbnail size",
        },
      },
      required: ["account", "presentation_id", "slide_id"],
    },
    run: async (a) => {
      const data = await api<{ contentUrl?: string; width?: number; height?: number }>(
        String(a.account),
        "GET",
        `${SLIDES}/${seg(String(a.presentation_id))}/pages/${seg(String(a.slide_id))}/thumbnail`,
        { params: { "thumbnailProperties.thumbnailSize": String(a.size ?? "MEDIUM") } },
      );
      return { contentUrl: data.contentUrl, width: data.width, height: data.height };
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
