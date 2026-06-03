import { Suspense } from "react";
import WorkoutLoggerClient from "./workout-logger-client";
import { PROGRAM } from "./program";
import { SCHEDULE } from "./week-schedule";
import { AuthGate, AuthProvider } from "./auth";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AuthProvider>
      <AuthGate>
        <Suspense fallback={<div style={{ color: "#f0f0f0", padding: 20 }}>Loading…</div>}>
          <WorkoutLoggerClient program={PROGRAM} schedule={SCHEDULE} />
        </Suspense>
      </AuthGate>
    </AuthProvider>
  );
}
