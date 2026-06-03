import { Suspense } from "react";
import WorkoutLoggerClient from "./workout-logger-client";
import { AuthGate, AuthProvider } from "./auth";
import { loadProgram, loadSchedule } from "@/lib/program";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Read program + schedule from the catalog/overlay tables instead of the
  // static PROGRAM/SCHEDULE constants. Single-tenant for now (the loaders
  // default to the bootstrap user); when we wire SSR Supabase auth, switch
  // to passing the signed-in user's id.
  const [program, schedule] = await Promise.all([loadProgram(), loadSchedule()]);

  return (
    <AuthProvider>
      <AuthGate>
        <Suspense fallback={<div style={{ color: "#f0f0f0", padding: 20 }}>Loading…</div>}>
          <WorkoutLoggerClient program={program} schedule={schedule} />
        </Suspense>
      </AuthGate>
    </AuthProvider>
  );
}
