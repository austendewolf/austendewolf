import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness check used by Railway's healthcheck. Intentionally unauthenticated.
export async function GET() {
  return NextResponse.json({ ok: true });
}
