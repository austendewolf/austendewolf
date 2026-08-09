import { NextResponse, type NextRequest } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { workouts } from "@awd/db";
import { authorizeMcp } from "@/lib/mcp-auth";
import { getDb } from "@/lib/db";
import { workoutId, parseWorkoutId } from "@/app/week-schedule";
import { loadProgram, loadSchedule } from "@/lib/program";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP server over HTTP. Single-shot JSON-RPC; no session/SSE.
 *
 * Spec: https://modelcontextprotocol.io/specification/server
 */

const SERVER_INFO = { name: "workout-logger", version: "0.2.0" };
const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "list_program",
    description:
      "Returns the workout day templates (id, name, subtitle, target exercises with sets × reps × weight). These are the building blocks the weekly schedule pulls from.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_weeks",
    description:
      "Returns the scheduled weeks: each week's start date, label, program week number, and the dates + day templates that fill the week.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_workout",
    description:
      "Returns the logged workout for a specific date + day template. The id is `<date>-<dayId>` (e.g., 2026-06-04-upper2). Returns target alongside actual so you can compare in one call.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Workout id, format `YYYY-MM-DD-<dayId>`. Use list_weeks to discover valid ids.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_week_summary",
    description:
      "Returns every workout for a scheduled week, including target, actual logged data, completion, and volume. Use this for week-over-week comparisons or to see how the week went.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Monday of the week, YYYY-MM-DD. Use list_weeks to discover valid start dates.",
        },
      },
      required: ["start_date"],
      additionalProperties: false,
    },
  },
  {
    name: "get_all_workouts",
    description:
      "Returns every saved workout row across all weeks, ordered most-recent first. Useful for full history or finding orphan/legacy rows.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "render_week",
    description:
      "Renders the current (or nearest) scheduled week as an inline interactive HTML view. Returns an embedUrl the caller (or client) can iframe. Use this when the user wants to SEE their week, not read JSON.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

// Public base URL for the deployed app. RAILWAY_PUBLIC_DOMAIN is
// injected by Railway; fall back to the custom domain in prod, and to
// localhost for local dev.
function publicBaseUrl(): string {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  if (process.env.NODE_ENV === "production") return "https://workout.austendewolf.com";
  return "http://localhost:3000";
}

function jsonRpcResult(id: number | string | null, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function jsonRpcError(id: number | string | null, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status: 200 },
  );
}

type SetRow = { weight: string | number; reps: string | number; done: boolean };
type WorkoutData = Record<string, SetRow[]>;

function summarize(data: WorkoutData | null) {
  if (!data) return { doneSets: 0, totalSetsLogged: 0, volume: 0 };
  let done = 0, totalLogged = 0, volume = 0;
  Object.values(data).forEach((sets) => {
    if (!Array.isArray(sets)) return;
    totalLogged += sets.length;
    sets.forEach((s) => {
      if (!s?.done) return;
      done += 1;
      const w = typeof s.weight === "number" ? s.weight : parseFloat(String(s.weight || 0));
      const r = typeof s.reps === "number" ? s.reps : parseFloat(String(s.reps || 0));
      if (!Number.isNaN(w) && !Number.isNaN(r)) volume += w * r;
    });
  });
  return { doneSets: done, totalSetsLogged: totalLogged, volume };
}

async function handleToolCall(name: string, args: any) {
  if (name === "list_program") {
    const program = await loadProgram();
    return { content: [{ type: "text", text: JSON.stringify({ days: program }, null, 2) }] };
  }

  if (name === "list_weeks") {
    const schedule = await loadSchedule();
    return { content: [{ type: "text", text: JSON.stringify({ weeks: schedule }, null, 2) }] };
  }

  if (name === "get_workout") {
    const id = typeof args?.id === "string" ? args.id : "";
    if (!id) throw new Error("id required");
    const parsed = parseWorkoutId(id);
    // Aliased to updated_at, not updatedAt: these rows are serialised straight
    // into the tool's JSON, so the column names are a wire format.
    const rows = await getDb()
      .select({ data: workouts.data, updated_at: workouts.updatedAt })
      .from(workouts)
      .where(eq(workouts.id, id))
      .limit(1);
    const program = await loadProgram();
    const template = parsed ? program.find((d) => d.id === parsed.dayId) : null;
    const payload = {
      id,
      date: parsed?.date ?? null,
      day_id: parsed?.dayId ?? null,
      day_name: template?.name ?? null,
      target: template?.exercises ?? [],
      actual: rows.length > 0 ? rows[0].data : {},
      summary: summarize(rows.length > 0 ? (rows[0].data as WorkoutData) : null),
      updated_at: rows.length > 0 ? rows[0].updated_at : null,
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }

  if (name === "get_week_summary") {
    const startDate = typeof args?.start_date === "string" ? args.start_date : "";
    if (!startDate) throw new Error("start_date required");
    const schedule = await loadSchedule();
    const week = schedule.find((w) => w.startDate === startDate);
    if (!week) throw new Error(`No scheduled week starting ${startDate}`);
    const program = await loadProgram();
    const ids = week.days.map((d) => workoutId(d.date, d.dayId));
    const rows = await getDb()
      .select({ id: workouts.id, data: workouts.data, updated_at: workouts.updatedAt })
      .from(workouts)
      .where(inArray(workouts.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const days = week.days.map((d) => {
      const id = workoutId(d.date, d.dayId);
      const row = byId.get(id);
      const template = program.find((p) => p.id === d.dayId);
      const actual = (row?.data ?? null) as WorkoutData | null;
      return {
        id,
        date: d.date,
        day_id: d.dayId,
        day_name: template?.name ?? d.dayId,
        subtitle: template?.subtitle ?? "",
        target: template?.exercises ?? [],
        actual: actual ?? {},
        summary: summarize(actual),
        updated_at: row?.updated_at ?? null,
      };
    });
    const weekSummary = days.reduce(
      (acc, d) => ({
        doneSets: acc.doneSets + d.summary.doneSets,
        totalLogged: acc.totalLogged + d.summary.totalSetsLogged,
        volume: acc.volume + d.summary.volume,
      }),
      { doneSets: 0, totalLogged: 0, volume: 0 },
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              week: { startDate: week.startDate, label: week.label, programWeek: week.programWeek },
              days,
              totals: weekSummary,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "get_all_workouts") {
    const rows = await getDb()
      .select({ id: workouts.id, data: workouts.data, updated_at: workouts.updatedAt })
      .from(workouts)
      .orderBy(desc(workouts.updatedAt));
    return { content: [{ type: "text", text: JSON.stringify({ workouts: rows }, null, 2) }] };
  }

  if (name === "render_week") {
    const url = `${publicBaseUrl()}/embed/week`;
    // MCP UI Resources: return an embedded HTML resource that clients
    // (e.g. Claude mobile/desktop) render inline in the chat. The iframe
    // points at the app's /embed/week route, which handles auth + data
    // + theme itself. CSP frame-ancestors on that route allows claude.ai.
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent;height:100%}iframe{width:100%;height:100vh;border:0;display:block}</style></head><body><iframe src="${url}" title="Week of workouts" loading="eager"></iframe></body></html>`;
    return {
      content: [
        {
          type: "resource",
          resource: {
            uri: `ui://workout-logger/week/${Date.now()}`,
            mimeType: "text/html",
            text: html,
          },
        },
        {
          type: "text",
          text: JSON.stringify({ embedUrl: url, note: "Iframe the embedUrl to render inline." }),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function POST(req: NextRequest) {
  // Checked before the body is read, so an unauthenticated caller never gets
  // as far as making this process parse input it supplied.
  if (!(await authorizeMcp(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }
  if (Array.isArray(body)) return jsonRpcError(null, -32600, "Batch not supported");

  const { jsonrpc, method, params, id } = body ?? {};
  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return jsonRpcError(id ?? null, -32600, "Invalid request");
  }

  try {
    if (method === "initialize") {
      return jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      });
    }
    if (method === "notifications/initialized") return new NextResponse(null, { status: 202 });
    if (method === "tools/list") return jsonRpcResult(id, { tools: TOOLS });
    if (method === "tools/call") {
      const result = await handleToolCall(params?.name, params?.arguments);
      return jsonRpcResult(id, result);
    }
    if (method === "ping") return jsonRpcResult(id, {});
    return jsonRpcError(id ?? null, -32601, `Method not found: ${method}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "internal_error";
    return jsonRpcError(id ?? null, -32603, msg);
  }
}

/**
 * Discovery, behind the same gate as everything else.
 *
 * The tool names alone describe what this server holds and how to ask for it,
 * so there is no version of this worth serving to an anonymous caller.
 */
export async function GET(req: NextRequest) {
  if (!(await authorizeMcp(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    server: SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    tools: TOOLS.map((t) => t.name),
  });
}
