"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Day, Exercise } from "./program";
import {
  type Week,
  SCHEDULE,
  workoutId,
  formatShortDate,
  formatLongDate,
  formatWeekLabel,
  formatMonth,
  formatYear,
  todayIso,
  parseIso,
  addDays,
  startOfWeek,
  startOfMonth,
  startOfYear,
  buildScheduleMap,
} from "./week-schedule";
import { Header } from "./theme";
import { authedFetch } from "./auth";

const EDGE_FN = "/api/workout-sync";
const SUMMARY_FN = "/api/workout-summary";
const ON_DATE_FN = "/api/workouts-on-date";
const TARGET_KEY = "wl_weekly_target";
const LAST_STATE_KEY = "wl_last_state";
const DEFAULT_TARGET = 4;

type ImportedMeta = {
  imported: true;
  type: string;
  title?: string;
  count?: number;
  calories?: number;
  time?: string | null;
  moving_time?: string | null;
  elapsed_time?: string | null;
  distance?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  aerobic_te?: number | null;
  avg_speed?: string | null;
  max_speed?: string | null;
  avg_stride?: number | null;
  ascent?: number | null;
  descent?: number | null;
  min_elev?: number | null;
  max_elev?: number | null;
  steps?: number | null;
  min_temp?: number | null;
  max_temp?: number | null;
};

type ImportedRow = { id: string; meta: ImportedMeta };

// Extras get the same shape as program exercises but live only on the
// session blob (not the static PROGRAM template).
type ExerciseLike = Exercise;

type SetRow = { weight: string | number; reps: string | number; done: boolean };
type WorkoutData = Record<string, SetRow[]>;

type WorkoutSummary = {
  id: string;
  date: string;
  dayId: string;
  volume: number;
  setsDone: number;
  setsTotal: number;
};

type View = "day" | "week" | "month" | "year";

const C = {
  bg: "var(--bg)",
  bg2: "var(--bg-2)",
  border: "var(--border)",
  borderSoft: "var(--border-soft)",
  accent: "var(--accent)",
  accentDim: "var(--accent-dim)",
  text: "var(--text)",
  muted: "var(--muted)",
  mutedLight: "var(--muted-light)",
  doneBg: "var(--done-bg)",
  doneBorder: "var(--done-border)",
};

const DOWN = "#ef4444";

function initDataForDay(day: Day): WorkoutData {
  return Object.fromEntries(
    day.exercises.map((ex) => [
      ex.id,
      Array.from({ length: ex.sets }, () => ({
        weight: ex.targetWeight ?? "",
        reps: ex.targetReps ?? "",
        done: false,
      })),
    ])
  );
}

function mergeWithStored(day: Day, stored: WorkoutData): WorkoutData {
  const fresh = initDataForDay(day);
  Object.keys(stored).forEach((exId) => {
    if (Array.isArray(stored[exId])) fresh[exId] = stored[exId];
  });
  return fresh;
}

function summarize(data: WorkoutData | null): { doneSets: number; volume: number } {
  if (!data) return { doneSets: 0, volume: 0 };
  let done = 0;
  let volume = 0;
  Object.values(data).forEach((sets) => {
    if (!Array.isArray(sets)) return;
    sets.forEach((s) => {
      if (!s?.done) return;
      done += 1;
      const w = typeof s.weight === "number" ? s.weight : parseFloat(String(s.weight || 0));
      const r = typeof s.reps === "number" ? s.reps : parseFloat(String(s.reps || 0));
      if (!Number.isNaN(w) && !Number.isNaN(r)) volume += w * r;
    });
  });
  return { doneSets: done, volume };
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

function getWeeklyTarget(): number {
  if (typeof window === "undefined") return DEFAULT_TARGET;
  const raw = window.localStorage.getItem(TARGET_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TARGET;
}

export default function WorkoutLoggerClient({
  program,
  schedule,
}: {
  program: Day[];
  schedule: Week[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dateParam = searchParams.get("date");
  const viewParam = searchParams.get("view");

  const today = useMemo(() => todayIso(), []);
  const date = dateParam ?? today;
  const view: View =
    viewParam === "week" || viewParam === "month" || viewParam === "year" || viewParam === "day"
      ? viewParam
      : "day";

  const navigate = useCallback(
    (next: { view: View; date: string }) => {
      const params = new URLSearchParams();
      params.set("view", next.view);
      params.set("date", next.date);
      router.push(`/?${params.toString()}`);
    },
    [router],
  );

  // Persist current view+date so refresh / re-open restores it.
  // The URL is the source of truth; localStorage is the fallback when
  // the app opens at bare "/" (e.g. iOS homescreen icon).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LAST_STATE_KEY, JSON.stringify({ view, date }));
    } catch {}
  }, [view, date]);

  // On mount, if URL is bare, restore last view+date from localStorage
  // so refresh / homescreen-icon reopen lands on what the user was
  // looking at. The URL is the source of truth; localStorage is the
  // fallback when no params are present.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (dateParam || viewParam) return;
    try {
      const raw = window.localStorage.getItem(LAST_STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { view?: unknown; date?: unknown };
      const v = parsed?.view;
      const d = parsed?.date;
      if (typeof v !== "string" || typeof d !== "string") return;
      if (v !== "day" && v !== "week" && v !== "month" && v !== "year") return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const params = new URLSearchParams();
      params.set("view", v);
      params.set("date", d);
      router.replace(`/?${params.toString()}`);
    } catch {}
  }, []);

  // Granularity swap keeps the anchor date the same; the view interprets it.
  const setView = (v: View) => navigate({ view: v, date });
  const setDate = (d: string) => navigate({ view, date: d });
  const goToToday = () => navigate({ view, date: today });

  // Per-date day-type overrides. Lets the user say "today is actually
  // a Lower 2, not the scheduled Upper 1" without editing the SCHEDULE
  // source. Stored at workouts.id = "overrides" as { date: dayId }.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`${EDGE_FN}?id=overrides`);
        const body = await res.json();
        if (cancelled) return;
        if (body && typeof body === "object" && !body.error) {
          setOverrides(body as Record<string, string>);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDayType = useCallback(
    async (forDate: string, dayId: string) => {
      const next = { ...overrides, [forDate]: dayId };
      setOverrides(next);
      try {
        await authedFetch(`${EDGE_FN}?id=overrides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
      } catch {}
    },
    [overrides],
  );

  // Day view bubbles its name/progress up here so TopNav can fold them
  // into the date picker as a sub-line when the big header scrolls past.
  const [navSummary, setNavSummary] = useState<{
    show: boolean;
    name: string;
    pct: number;
    doneSets: number;
    totalSets: number;
  } | null>(null);
  useEffect(() => {
    if (view !== "day") setNavSummary(null);
  }, [view]);

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        color: C.text,
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        paddingBottom: 32,
      }}
    >
      <Header />
      <TopNav
        view={view}
        date={date}
        today={today}
        onSetView={setView}
        onSetDate={setDate}
        onToday={goToToday}
        summary={view === "day" ? navSummary : null}
      />

      {view === "day" && (
        <DayView
          program={program}
          schedule={schedule}
          date={date}
          overrides={overrides}
          onSetDayType={setDayType}
          onPickDate={setDate}
          onSummaryChange={setNavSummary}
        />
      )}
      {view === "week" && (
        <WeekView
          program={program}
          schedule={schedule}
          weekStart={startOfWeek(date)}
          onPickDay={(d) => navigate({ view: "day", date: d })}
        />
      )}
      {view === "month" && (
        <MonthView
          schedule={schedule}
          anchorDate={date}
          today={today}
          onPickDay={(d) => navigate({ view: "day", date: d })}
        />
      )}
      {view === "year" && (
        <YearView
          schedule={schedule}
          anchorDate={date}
          today={today}
          onPickDay={(d) => navigate({ view: "day", date: d })}
        />
      )}
    </div>
  );
}

/* ============================================================ */
/* Top nav: segmented control + arrow row                       */
/* ============================================================ */

function TopNav({
  view,
  date,
  today,
  onSetView,
  onSetDate,
  onToday,
  summary,
}: {
  view: View;
  date: string;
  today: string;
  onSetView: (v: View) => void;
  onSetDate: (d: string) => void;
  onToday: () => void;
  summary: {
    show: boolean;
    name: string;
    pct: number;
    doneSets: number;
    totalSets: number;
  } | null;
}) {
  const prev = () => onSetDate(stepDate(date, view, -1));
  const next = () => onSetDate(stepDate(date, view, +1));

  const label =
    view === "day" ? formatLongDate(date)
      : view === "week" ? formatWeekLabel(startOfWeek(date))
      : view === "month" ? formatMonth(date)
      : formatYear(date);

  const isOnToday = isCurrentPeriod(date, view, today);

  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown as any);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown as any);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div
      style={{
        position: "sticky",
        top: 56, // below the app Header
        zIndex: 30,
        background: C.bg,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr 44px",
          alignItems: "center",
          padding: "8px 8px 10px",
          gap: 4,
        }}
      >
        <ArrowBtn dir="left" onClick={prev} aria-label="Previous" />
        <div ref={wrapRef} style={{ position: "relative", justifySelf: "stretch" }}>
          <button
            onClick={() => setMenuOpen((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              color: C.text,
              cursor: "pointer",
              padding: "8px 4px",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 0.2,
              lineHeight: 1.1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 0,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {label}
              <span
                aria-hidden
                style={{
                  fontSize: 10,
                  color: C.muted,
                  transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.15s ease",
                  lineHeight: 1,
                }}
              >
                ▾
              </span>
            </span>
            <span
              aria-hidden={!(summary && summary.show)}
              style={{
                display: "block",
                overflow: "hidden",
                maxHeight: summary && summary.show ? 22 : 0,
                opacity: summary && summary.show ? 1 : 0,
                transform: summary && summary.show ? "translateY(0)" : "translateY(-4px)",
                transition: "max-height 0.22s ease, opacity 0.22s ease, transform 0.22s ease",
                marginTop: summary && summary.show ? 3 : 0,
                fontSize: 10,
                fontFamily: "monospace",
                letterSpacing: 1.5,
                color: C.muted,
                fontWeight: 700,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
              }}
            >
              {summary && (
                <>
                  <span style={{ color: C.text }}>{summary.name.toUpperCase()}</span>
                  {summary.totalSets > 0 && (
                    <>
                      <span style={{ margin: "0 6px", color: C.border }}>·</span>
                      <span style={{ color: summary.pct === 100 ? C.accent : C.text }}>{summary.pct}%</span>
                      <span style={{ margin: "0 6px", color: C.border }}>·</span>
                      <span>{summary.doneSets}/{summary.totalSets}</span>
                    </>
                  )}
                </>
              )}
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: "50%",
                transform: "translateX(-50%)",
                minWidth: 200,
                background: C.bg2,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: 4,
                boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
                zIndex: 50,
              }}
            >
              {(["day", "week", "month", "year"] as View[]).map((v) => {
                const active = view === v;
                return (
                  <button
                    key={v}
                    role="menuitem"
                    onClick={() => {
                      onSetView(v);
                      setMenuOpen(false);
                    }}
                    style={menuItemStyle(active)}
                  >
                    <span>{v[0].toUpperCase() + v.slice(1)}</span>
                    {active && <span style={{ color: C.accent }}>✓</span>}
                  </button>
                );
              })}
              <div style={{ height: 1, background: C.border, margin: "4px 6px" }} />
              <button
                role="menuitem"
                onClick={() => {
                  onToday();
                  setMenuOpen(false);
                }}
                disabled={isOnToday}
                style={menuItemStyle(false, isOnToday)}
              >
                <span>Jump to today</span>
                {isOnToday && <span style={{ color: C.muted, fontSize: 9, fontFamily: "monospace", letterSpacing: 1 }}>HERE</span>}
              </button>
            </div>
          )}
        </div>
        <ArrowBtn dir="right" onClick={next} aria-label="Next" />
      </div>
    </div>
  );
}

function menuItemStyle(active: boolean, disabled: boolean = false): React.CSSProperties {
  return {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 12px",
    background: active ? C.doneBg : "transparent",
    border: "none",
    borderRadius: 7,
    color: disabled ? C.muted : C.text,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.3,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1,
    textAlign: "left",
  };
}

function ArrowBtn({ dir, onClick, ...rest }: { dir: "left" | "right"; onClick: () => void } & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        background: "transparent",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        color: C.text,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        fontWeight: 800,
        padding: 0,
      }}
      {...rest}
    >
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}

function stepDate(date: string, view: View, delta: -1 | 1): string {
  if (view === "day") return addDays(date, delta);
  if (view === "week") return addDays(startOfWeek(date), delta * 7);
  if (view === "month") {
    const d = parseIso(date);
    d.setUTCMonth(d.getUTCMonth() + delta);
    return d.toISOString().slice(0, 10);
  }
  const d = parseIso(date);
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return d.toISOString().slice(0, 10);
}

function isCurrentPeriod(date: string, view: View, today: string): boolean {
  if (view === "day") return date === today;
  if (view === "week") return startOfWeek(date) === startOfWeek(today);
  if (view === "month") return date.slice(0, 7) === today.slice(0, 7);
  return date.slice(0, 4) === today.slice(0, 4);
}

/* ============================================================ */
/* Health badge                                                 */
/* ============================================================ */

function HealthBadge({
  volume,
  prevVolume,
  sessions,
  sessionTarget,
}: {
  volume: number;
  prevVolume: number | null;
  sessions: number;
  sessionTarget?: number | null;
}) {
  const delta = prevVolume != null && prevVolume > 0 ? (volume - prevVolume) / prevVolume : null;
  const trendColor = delta == null ? C.muted : delta > 0.005 ? C.accent : delta < -0.005 ? DOWN : C.muted;
  const arrow = delta == null ? "·" : delta > 0.005 ? "▴" : delta < -0.005 ? "▾" : "→";
  const pct =
    delta == null ? "—"
      : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}%`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 14px",
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        fontFamily: "monospace",
        fontSize: 11,
        letterSpacing: 1.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: trendColor, fontSize: 14, fontWeight: 800 }}>{arrow}</span>
        <span style={{ color: trendColor, fontWeight: 800 }}>{pct} VOL</span>
      </div>
      <div style={{ width: 1, height: 14, background: C.border }} />
      <div style={{ color: C.text }}>
        <span style={{ fontWeight: 800 }}>{sessions}</span>
        {sessionTarget != null && (
          <span style={{ color: C.muted }}>/{sessionTarget}</span>
        )}
        <span style={{ color: C.muted, marginLeft: 4 }}>SESSIONS</span>
      </div>
      <div style={{ marginLeft: "auto", color: C.muted }}>{formatVolume(volume)}</div>
    </div>
  );
}

/* ============================================================ */
/* Day view                                                     */
/* ============================================================ */

function DayView({
  program,
  schedule,
  date,
  overrides,
  onSetDayType,
  onPickDate,
  onSummaryChange,
}: {
  program: Day[];
  schedule: Week[];
  date: string;
  overrides: Record<string, string>;
  onSetDayType: (date: string, dayId: string) => void;
  onPickDate: (date: string) => void;
  onSummaryChange: (
    s: {
      show: boolean;
      name: string;
      pct: number;
      doneSets: number;
      totalSets: number;
    } | null,
  ) => void;
}) {
  const scheduleMap = useMemo(() => buildScheduleMap(schedule), [schedule]);
  // Override wins over the scheduled default. "custom" is the sentinel
  // for "I want freestyle here" — picks up the freestyle fallback below.
  const overrideDayId = overrides[date];
  const effectiveDayId = overrideDayId ?? scheduleMap[date];
  const scheduledDay =
    effectiveDayId && effectiveDayId !== "custom"
      ? program.find((p) => p.id === effectiveDayId) ?? null
      : null;
  // Freestyle fallback so non-scheduled days still have an editable
  // workout shell (extras + picker + persist all work).
  const day: Day = scheduledDay ?? {
    id: "custom",
    name: "Activity",
    subtitle: "FREESTYLE",
    weekLabel: "",
    exercises: [],
  };
  const isCustom = !scheduledDay;
  const id = workoutId(date, day.id);

  const [data, setData] = useState<WorkoutData>(() => (scheduledDay ? initDataForDay(scheduledDay) : {}));
  const [extras, setExtras] = useState<Record<string, ExerciseLike>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [imported, setImported] = useState<ImportedRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const debounceRef = useRef<any>(null);

  // Pull any imported (Garmin) activity rows for this date.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`${ON_DATE_FN}?date=${date}`);
        const body = await res.json();
        if (cancelled) return;
        const rows: { id: string; data: any }[] = body?.workouts ?? [];
        const imp = rows
          .filter((r) => r?.data?._meta?.imported === true)
          .map((r) => ({ id: r.id, meta: r.data._meta as ImportedMeta }));
        setImported(imp);
      } catch {
        if (!cancelled) setImported([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    setActiveId(null);
    setData(scheduledDay ? initDataForDay(scheduledDay) : {});
    setExtras({});
    setSkipped([]);
    setPickerOpen(false);
    setSaveStatus("loading");
    setErrorMsg("");
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`${EDGE_FN}?id=${id}`);
        const saved = await res.json();
        if (cancelled) return;
        if (saved && typeof saved === "object" && !saved.error) {
          // Split off non-set "control" fields before merging into data.
          const { _extras, _skipped, _meta, ...sets } = saved as any;
          setData(scheduledDay ? mergeWithStored(scheduledDay, sets) : (sets as WorkoutData));
          if (_extras && typeof _extras === "object") setExtras(_extras);
          if (Array.isArray(_skipped)) setSkipped(_skipped.filter((s: any) => typeof s === "string"));
        }
        setSaveStatus("idle");
      } catch (e: any) {
        if (!cancelled) {
          setErrorMsg(e.message);
          setSaveStatus("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduledDay, id]);

  const persist = (
    nextData: WorkoutData,
    nextExtras?: Record<string, ExerciseLike>,
    nextSkipped?: string[],
  ) => {
    const extrasToWrite = nextExtras ?? extras;
    const skippedToWrite = nextSkipped ?? skipped;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");
    debounceRef.current = setTimeout(async () => {
      try {
        const body: Record<string, any> = { ...nextData };
        if (Object.keys(extrasToWrite).length > 0) body._extras = extrasToWrite;
        if (skippedToWrite.length > 0) body._skipped = skippedToWrite;
        const res = await authedFetch(`${EDGE_FN}?id=${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await res.json();
        if (!result.ok) throw new Error(result.error || "Save failed");
        setSaveStatus("saved");
        setErrorMsg("");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (e: any) {
        setSaveStatus("error");
        setErrorMsg(e.message);
      }
    }, 800);
  };

  const update = (exId: string, si: number, field: keyof SetRow, val: any) => {
    const next = {
      ...data,
      [exId]: data[exId].map((s, i) => (i === si ? { ...s, [field]: val } : s)),
    };
    setData(next);
    persist(next);
  };

  const toggleDone = (exId: string, si: number) => {
    update(exId, si, "done", !data[exId][si].done);
  };

  // Flip the sign on the current value in a single tap. Lets the kid
  // (well, me) use the numeric keypad to enter the absolute value and
  // tap ± to make it negative — band-assisted pull-ups, deficit DLs,
  // etc. Treats "" / "0" as no-op, otherwise toggles between "-N" and
  // "N" with no precision loss.
  const toggleSign = (exId: string, si: number, field: "weight" | "reps") => {
    const cur = String(data[exId]?.[si]?.[field] ?? "");
    if (cur === "" || cur === "0") return;
    const next = cur.startsWith("-") ? cur.slice(1) : `-${cur}`;
    update(exId, si, field, next);
  };

  const addSet = (exId: string) => {
    const template = day.exercises.find((e) => e.id === exId) ?? extras[exId];
    const existing = data[exId] ?? [];
    const last = existing[existing.length - 1];
    const newSet: SetRow = {
      weight: last?.weight ?? template?.targetWeight ?? "",
      reps: last?.reps ?? template?.targetReps ?? "",
      done: false,
    };
    const next = { ...data, [exId]: [...existing, newSet] };
    setData(next);
    persist(next);
  };

  // Removes a set row entirely. Reached via iOS-style swipe-left → tap
  // Delete on any row (planned or bonus). Removing a planned set just
  // means it disappears from this session — re-add via "Add another set".
  const removeSet = (exId: string, si: number) => {
    const arr = data[exId];
    if (!arr) return;
    const next = { ...data, [exId]: arr.filter((_, i) => i !== si) };
    setData(next);
    persist(next);
  };

  // All program exercises across all days, deduped by id. The picker
  // lets you graft any of them onto today's workout (extras get saved
  // alongside the set data, so the day card and heatmap both see them).
  const allExerciseCandidates = useMemo<Exercise[]>(() => {
    const seen = new Set<string>();
    const list: Exercise[] = [];
    for (const d of program) {
      for (const ex of d.exercises) {
        if (seen.has(ex.id)) continue;
        seen.add(ex.id);
        list.push(ex);
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [program]);

  // Synthesized imports → mapped exercise IDs already shown above the
  // editable list; treat those as "in today" so the picker shows them
  // as ADDED instead of letting the user double-add the same activity.
  const synthExIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of imported) {
      const exId = GARMIN_TO_EXID[row.meta.type];
      if (exId) ids.add(exId);
    }
    return ids;
  }, [imported]);

  const inToday = useCallback(
    (exId: string): boolean => {
      if (skipped.includes(exId)) return false;
      if (day.exercises.some((e) => e.id === exId)) return true;
      if (extras[exId]) return true;
      if (synthExIds.has(exId)) return true;
      return false;
    },
    [day, extras, skipped, synthExIds],
  );

  // Add an exercise to today. If it was a previously-skipped template
  // exercise, just un-skip it. Otherwise add it as an extra with default
  // sets seeded from its template.
  const addExercise = (ex: Exercise) => {
    if (inToday(ex.id)) return;
    const isTemplate = !!day?.exercises.some((e) => e.id === ex.id);
    if (isTemplate && skipped.includes(ex.id)) {
      const nextSkipped = skipped.filter((s) => s !== ex.id);
      setSkipped(nextSkipped);
      setActiveId(ex.id);
      setPickerOpen(false);
      persist(data, extras, nextSkipped);
      return;
    }
    const startingSets: SetRow[] = Array.from({ length: ex.sets }, () => ({
      weight: ex.targetWeight ?? "",
      reps: ex.targetReps ?? "",
      done: false,
    }));
    const nextExtras = { ...extras, [ex.id]: ex };
    const nextData = { ...data, [ex.id]: startingSets };
    setExtras(nextExtras);
    setData(nextData);
    setActiveId(ex.id);
    setPickerOpen(false);
    persist(nextData, nextExtras);
  };

  // Unified delete: works for template AND extra exercises.
  // Templates get marked skipped so the picker can re-add them; extras
  // are dropped entirely.
  const removeFromToday = (exId: string) => {
    const isExtra = !!extras[exId];
    if (isExtra) {
      const { [exId]: _e, ...remainingExtras } = extras;
      const { [exId]: _d, ...remainingData } = data;
      setExtras(remainingExtras);
      setData(remainingData);
      persist(remainingData, remainingExtras);
      return;
    }
    // Template exercise: mark skipped and drop its set data.
    const nextSkipped = skipped.includes(exId) ? skipped : [...skipped, exId];
    const { [exId]: _d, ...remainingData } = data;
    setSkipped(nextSkipped);
    setData(remainingData);
    persist(remainingData, extras, nextSkipped);
  };

  // (Removed page-level swipe-to-change-day. It conflicted with iOS
  // pull-to-refresh: the small horizontal component of a pull gesture
  // sometimes crossed the 60px threshold, the date shifted ±1, then the
  // browser refreshed — so refresh looked like it "rolled back" to
  // yesterday. Use the TopNav arrows or the dropdown for day navigation.)

  // Sticky day-header summary: when the user scrolls past the big day
  // title + percent block, we report dayHeaderOut up so TopNav can fold
  // a compact "Lower Day 1 · 29% · 6/21" sub-line under its date picker.
  const dayHeaderRef = useRef<HTMLDivElement>(null);
  const [dayHeaderOut, setDayHeaderOut] = useState(false);
  useEffect(() => {
    const el = dayHeaderRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setDayHeaderOut(!entry.isIntersecting),
      // App header (56) + TopNav (~58) = ~114px of sticky chrome above.
      { rootMargin: "-114px 0px 0px 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const synth = buildSynthFromImports(program, imported);
  const renderedTemplates = day.exercises.filter((e) => !skipped.includes(e.id));
  const renderedExtras = Object.values(extras);
  const renderedCount = renderedTemplates.length + renderedExtras.length;
  const totalPlannedSets = renderedTemplates.reduce((a, ex) => a + ex.sets, 0) +
    renderedExtras.reduce((a, ex) => a + ex.sets, 0);
  const actualSets = Object.values(data).flat();
  const doneSets = actualSets.filter((s) => s.done).length;
  const pct = totalPlannedSets > 0 ? Math.round((doneSets / totalPlannedSets) * 100) : 0;
  const summaryName = isCustom ? "Activity" : day.name;
  useEffect(() => {
    onSummaryChange({
      show: dayHeaderOut,
      name: summaryName,
      pct,
      doneSets,
      totalSets: totalPlannedSets,
    });
  }, [onSummaryChange, dayHeaderOut, summaryName, pct, doneSets, totalPlannedSets]);
  useEffect(() => () => onSummaryChange(null), [onSummaryChange]);

  return (
    <div>
      <div ref={dayHeaderRef} style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <DayTypePicker
              program={program}
              currentDayId={isCustom ? "custom" : day.id}
              label={isCustom ? "Activity" : day.name}
              onPick={(id) => onSetDayType(date, id)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: C.mutedLight, letterSpacing: 1 }}>
                {isCustom ? formatShortDate(date).toUpperCase() : day.subtitle}
              </div>
              {saveStatus !== "idle" && (
                <div
                  style={{
                    fontSize: 8,
                    letterSpacing: 2,
                    fontFamily: "monospace",
                    padding: "2px 6px",
                    borderRadius: 3,
                    color: saveStatus === "error" ? DOWN : C.accent,
                    border: `1px solid ${saveStatus === "error" ? "rgba(239,68,68,0.35)" : C.doneBorder}`,
                    background: saveStatus === "error" ? "rgba(239,68,68,0.12)" : C.doneBg,
                  }}
                >
                  {saveStatus === "loading" ? "LOADING..." : saveStatus === "saving" ? "SAVING..." : saveStatus === "saved" ? "SAVED ✓" : "ERROR"}
                </div>
              )}
            </div>
          </div>
          {totalPlannedSets > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: pct === 100 ? C.accent : C.text, fontFamily: "monospace", lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2, marginTop: 2 }}>{doneSets}/{totalPlannedSets} SETS</div>
            </div>
          )}
        </div>
        {totalPlannedSets > 0 && (
          <div style={{ height: 3, background: C.border, borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: C.accent, borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        )}
      </div>

      {/* Imported activities mapped to program exercises — read-only above the editable list. */}
      {synth.exercises.length > 0 && (
        <SynthDayView date={date} exercises={synth.exercises} data={synth.data} />
      )}

      {errorMsg && (
        <div style={{ padding: "8px 16px", background: "rgba(239,68,68,0.10)", borderBottom: "1px solid rgba(239,68,68,0.35)", fontSize: 11, color: DOWN, fontFamily: "monospace", wordBreak: "break-all" }}>
          {errorMsg}
        </div>
      )}

      <div>
        {[...day.exercises.filter((e) => !skipped.includes(e.id)), ...Object.values(extras)].map((ex) => {
          const isExtra = !day.exercises.some((e) => e.id === ex.id);
          const sets = data[ex.id] ?? [];
          const isOpen = activeId === ex.id;
          const exDoneCount = sets.filter((s) => s.done).length;
          const exAllDone = exDoneCount >= ex.sets && exDoneCount > 0;
          const hasBonusSets = sets.length > ex.sets;

          return (
            <SwipeableSetRow key={ex.id} marginBottom={0} onDelete={() => removeFromToday(ex.id)}>
            <div style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
              <button
                onClick={() => setActiveId((p) => (p === ex.id ? null : ex.id))}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "16px 16px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textAlign: "left",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: exAllDone ? C.accent : C.text }}>
                      {ex.name}
                    </div>
                    {isExtra && (
                      <span style={{ fontSize: 8, fontFamily: "monospace", letterSpacing: 2, color: C.accent, border: `1px solid ${C.doneBorder}`, background: C.doneBg, padding: "1px 5px", borderRadius: 3 }}>
                        EXTRA
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 3, letterSpacing: 1 }}>
                    {ex.targetWeight ? `${ex.targetWeight}LB × ` : ""}{ex.targetReps} {ex.targetWeight === null ? "MIN" : "REPS"} · {ex.sets} SETS
                    {ex.note ? ` · ${ex.note}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 12, flexShrink: 0 }}>
                  {exDoneCount > 0 && (
                    <div
                      style={{
                        fontSize: 10,
                        color: exAllDone ? C.accent : C.mutedLight,
                        fontFamily: "monospace",
                        letterSpacing: 1,
                        background: exAllDone ? C.doneBg : "#111",
                        border: `1px solid ${exAllDone ? C.doneBorder : C.border}`,
                        padding: "3px 7px",
                        borderRadius: 4,
                      }}
                    >
                      {exDoneCount}/{sets.length}{hasBonusSets ? "+" : ""}
                    </div>
                  )}
                  <div
                    style={{
                      color: isOpen ? C.accent : C.muted,
                      fontSize: 14,
                      fontWeight: 700,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                      lineHeight: 1,
                    }}
                  >
                    ▾
                  </div>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "0 16px 16px" }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.mutedLight,
                      lineHeight: 1.6,
                      padding: "10px 12px",
                      background: C.bg2,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      marginBottom: 14,
                    }}
                  >
                    {ex.description}
                  </div>

                  {(() => {
                    const isCardio = ex.targetWeight === null;
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr 50px", gap: 6, marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: C.muted, letterSpacing: 2, textAlign: "center" }}>#</div>
                        <div style={{ fontSize: 8, color: C.muted, letterSpacing: 2, textAlign: "center" }}>WEIGHT</div>
                        <div style={{ fontSize: 8, color: C.muted, letterSpacing: 2, textAlign: "center" }}>{isCardio ? "TIME" : "REPS"}</div>
                        <div />
                      </div>
                    );
                  })()}

                  {sets.map((s, si) => {
                    const isBonus = si >= ex.sets;
                    return (
                      <SwipeableSetRow key={si} onDelete={() => removeSet(ex.id, si)}>
                        <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr 50px", gap: 6, padding: "0", alignItems: "center", background: C.bg }}>
                          <div style={{ fontSize: 11, color: s.done ? C.accent : isBonus ? C.accentDim : C.mutedLight, fontFamily: "monospace", textAlign: "center", fontWeight: 700 }}>
                            {isBonus ? "+" : ""}{si + 1}
                          </div>
                          <div style={{ display: "flex", alignItems: "stretch" }}>
                            <button
                              type="button"
                              onClick={() => toggleSign(ex.id, si, "weight")}
                              aria-label={String(s.weight).startsWith("-") ? "Make positive" : "Make negative"}
                              style={signPrependStyle(String(s.weight).startsWith("-"), s.done)}
                            >
                              {String(s.weight).startsWith("-") ? "−" : "+"}
                            </button>
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              value={s.weight}
                              onChange={(e) => update(ex.id, si, "weight", sanitizeSignedDecimal(e.target.value))}
                              placeholder="lb"
                              style={{ ...inputStyle(s.done), borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 }}
                            />
                          </div>
                          <div style={{ display: "flex", alignItems: "stretch" }}>
                            <button
                              type="button"
                              onClick={() => toggleSign(ex.id, si, "reps")}
                              aria-label={String(s.reps).startsWith("-") ? "Make positive" : "Make negative"}
                              style={signPrependStyle(String(s.reps).startsWith("-"), s.done)}
                            >
                              {String(s.reps).startsWith("-") ? "−" : "+"}
                            </button>
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              value={s.reps}
                              onChange={(e) => update(ex.id, si, "reps", sanitizeSignedDecimal(e.target.value))}
                              placeholder={ex.targetWeight === null ? "min" : "reps"}
                              style={{ ...inputStyle(s.done), borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 }}
                            />
                          </div>
                          <button
                            onClick={() => toggleDone(ex.id, si)}
                            style={{
                              width: 50,
                              height: 50,
                              borderRadius: 10,
                              border: `1.5px solid ${s.done ? C.accent : C.border}`,
                              background: s.done ? C.accent : "transparent",
                              color: s.done ? "#000" : C.muted,
                              fontSize: s.done ? 18 : 20,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 900,
                              transition: "all 0.15s ease",
                              flexShrink: 0,
                            }}
                          >
                            {s.done ? "✓" : "·"}
                          </button>
                        </div>
                      </SwipeableSetRow>
                    );
                  })}

                  <button
                    onClick={() => addSet(ex.id)}
                    style={{
                      width: "100%",
                      marginTop: 8,
                      padding: "10px 12px",
                      background: "transparent",
                      border: `1px dashed ${C.mutedLight}`,
                      borderRadius: 10,
                      color: C.mutedLight,
                      fontSize: 11,
                      fontFamily: "monospace",
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    + Add another set
                  </button>
                  <div style={{ marginTop: 6, fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1, textAlign: "center" }}>
                    Swipe a set left to delete · swipe the whole exercise to remove it from today
                  </div>

                </div>
              )}
            </div>
            </SwipeableSetRow>
          );
        })}
      </div>

      {renderedCount === 0 && synth.exercises.length === 0 && (
        <EmptyDayState date={date} isCustom={isCustom} />
      )}

      {/* Add-exercise picker — bottom of the day for thumb reach. */}
      <ExercisePicker
        open={pickerOpen}
        onToggle={() => setPickerOpen((p) => !p)}
        candidates={allExerciseCandidates}
        isInToday={inToday}
        onPick={addExercise}
      />
    </div>
  );
}

function EmptyDayState({ date, isCustom }: { date: string; isCustom: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "48px 24px 32px",
        color: C.muted,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          border: `1px solid ${C.border}`,
          background: C.bg2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.mutedLight,
        }}
      >
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: C.text,
        }}
      >
        {isCustom ? "No activity logged" : "Nothing scheduled left"}
      </div>
      <div
        style={{
          fontSize: 11,
          color: C.mutedLight,
          letterSpacing: 0.5,
          textAlign: "center",
          maxWidth: 240,
          lineHeight: 1.45,
        }}
      >
        Tap below to add a movement, lift, or activity for {formatShortDate(date)}.
      </div>
    </div>
  );
}

/* ============================================================ */
/* Synthetic day from Garmin imports                            */
/* ============================================================ */
/*
 * Imported Garmin activities are mapped onto whichever program-defined
 * exercise type matches semantically (running → easy_run, walking →
 * cardio_warmup, etc.). On dates where the user wasn't running a
 * scheduled program day, this is how the imports surface: as a
 * read-only workout built from the program's own exercise vocabulary.
 * No Garmin chrome, no parallel "imports" UI.
 */

const GARMIN_TO_EXID: Record<string, string> = {
  "Treadmill Running": "act_run",
  Running: "act_run",
  Walking: "act_walk",
  Cardio: "act_cardio",
  Hiking: "act_hike",
  "Strength Training": "act_strength",
  Pilates: "act_pilates",
};

function timeToMinutes(t?: string | null): number {
  if (!t) return 0;
  const parts = t.split(":").map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
  return 0;
}

function findExerciseInProgram(program: Day[], exId: string): Exercise | null {
  for (const d of program) {
    for (const ex of d.exercises) {
      if (ex.id === exId) return ex;
    }
  }
  return null;
}

function buildSynthFromImports(
  program: Day[],
  imported: ImportedRow[],
): { exercises: Exercise[]; data: WorkoutData } {
  const exMap = new Map<string, Exercise>();
  const data: WorkoutData = {};
  for (const row of imported) {
    const exId = GARMIN_TO_EXID[row.meta.type];
    if (!exId || exMap.has(exId)) continue;
    const template = findExerciseInProgram(program, exId);
    if (!template) continue;
    exMap.set(exId, template);
    const minutes = timeToMinutes(row.meta.moving_time || row.meta.time);
    const distance = row.meta.distance != null && row.meta.distance > 0 ? row.meta.distance : "";
    data[exId] = [
      {
        weight: distance,
        reps: minutes || "",
        done: true,
      },
    ];
  }
  return { exercises: Array.from(exMap.values()), data };
}

function SynthDayView({
  date,
  exercises,
  data,
}: {
  date: string;
  exercises: Exercise[];
  data: WorkoutData;
}) {
  const totalSets = exercises.length;
  const doneSets = Object.values(data).flat().filter((s) => s.done).length;

  return (
    <div>
      <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, textTransform: "uppercase", lineHeight: 1 }}>
              Activity
            </div>
            <div style={{ fontSize: 11, color: C.mutedLight, letterSpacing: 1, marginTop: 4 }}>
              IMPORTED · {formatShortDate(date)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: C.accent, fontFamily: "monospace", lineHeight: 1 }}>✓</div>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2, marginTop: 2 }}>
              {doneSets}/{totalSets} DONE
            </div>
          </div>
        </div>
      </div>
      {exercises.map((ex) => {
        const sets = data[ex.id] ?? [];
        return (
          <div key={ex.id} style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: C.accent }}>
                  {ex.name}
                </div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 3, letterSpacing: 1 }}>
                  {ex.note ?? ""}
                </div>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: C.text, textAlign: "right", fontWeight: 700 }}>
                {sets.map((s, i) => {
                  const w = s.weight !== "" && s.weight !== null ? `${s.weight} mi` : null;
                  const r = s.reps !== "" && s.reps !== null ? `${s.reps} min` : null;
                  return (
                    <div key={i}>{[w, r].filter(Boolean).join(" · ")}</div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================ */
/* Week view                                                    */
/* ============================================================ */

function WeekView({
  program,
  schedule,
  weekStart,
  onPickDay,
}: {
  program: Day[];
  schedule: Week[];
  weekStart: string;
  onPickDay: (date: string) => void;
}) {
  const scheduleMap = useMemo(() => buildScheduleMap(schedule), [schedule]);
  const prevWeekStart = useMemo(() => addDays(weekStart, -7), [weekStart]);

  const [thisWeekData, setThisWeekData] = useState<Record<string, WorkoutSummary>>({});
  const [prevWeekVolume, setPrevWeekVolume] = useState<number | null>(null);
  const [target, setTarget] = useState<number>(DEFAULT_TARGET);

  useEffect(() => {
    setTarget(getWeeklyTarget());
    const handler = (e: StorageEvent) => {
      if (e.key === TARGET_KEY) setTarget(getWeeklyTarget());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const weekEnd = addDays(weekStart, 6);
      const prevEnd = addDays(prevWeekStart, 6);
      try {
        const [r1, r2] = await Promise.all([
          authedFetch(`${SUMMARY_FN}?from=${weekStart}&to=${weekEnd}`).then((r) => r.json()),
          authedFetch(`${SUMMARY_FN}?from=${prevWeekStart}&to=${prevEnd}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const map: Record<string, WorkoutSummary> = {};
        (r1.workouts as WorkoutSummary[] | undefined)?.forEach((w) => {
          map[w.date] = w;
        });
        setThisWeekData(map);
        const prevVol = (r2.workouts as WorkoutSummary[] | undefined)?.reduce((a, w) => a + w.volume, 0) ?? 0;
        setPrevWeekVolume(prevVol > 0 ? prevVol : null);
      } catch {
        if (!cancelled) {
          setThisWeekData({});
          setPrevWeekVolume(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStart, prevWeekStart]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return { date, dayId: scheduleMap[date] ?? null };
    });
  }, [weekStart, scheduleMap]);

  const totalVolume = Object.values(thisWeekData).reduce((a, w) => a + w.volume, 0);
  const sessions = Object.values(thisWeekData).filter((w) => w.setsDone > 0).length;

  return (
    <div style={{ padding: "12px 12px 32px" }}>
      <HealthBadge
        volume={totalVolume}
        prevVolume={prevWeekVolume}
        sessions={sessions}
        sessionTarget={target}
      />

      <div style={{ marginTop: 12 }}>
        {days.map((d) => {
          const summary = thisWeekData[d.date];
          const template = d.dayId ? program.find((p) => p.id === d.dayId) ?? null : null;
          const isRest = !template;
          const setsDone = summary?.setsDone ?? 0;
          const setsTotal = template?.exercises.reduce((a, ex) => a + ex.sets, 0) ?? 0;
          const pct = setsTotal > 0 ? Math.round((setsDone / setsTotal) * 100) : 0;
          const volume = summary?.volume ?? 0;

          return (
            <button
              key={d.date}
              onClick={() => template && onPickDay(d.date)}
              disabled={!template}
              style={{
                display: "block",
                width: "100%",
                background: "transparent",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 8,
                textAlign: "left",
                color: C.text,
                cursor: template ? "pointer" : "default",
                opacity: isRest ? 0.45 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: C.mutedLight, fontFamily: "monospace", textTransform: "uppercase" }}>
                    {formatShortDate(d.date)}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", marginTop: 3, color: pct === 100 ? C.accent : C.text }}>
                    {template?.name ?? "Rest"}
                  </div>
                </div>
                {template && (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "monospace", color: pct === 100 ? C.accent : C.text }}>
                      {pct}%
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1, marginTop: 1 }}>
                      {volume > 0 ? `${formatVolume(volume)} VOL` : `${setsTotal} SETS`}
                    </div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ */
/* Month view — calendar grid                                   */
/* ============================================================ */

function MonthView({
  schedule,
  anchorDate,
  today,
  onPickDay,
}: {
  schedule: Week[];
  anchorDate: string;
  today: string;
  onPickDay: (date: string) => void;
}) {
  const scheduleMap = useMemo(() => buildScheduleMap(schedule), [schedule]);
  const monthStart = startOfMonth(anchorDate);
  const monthEnd = useMemo(() => {
    const d = parseIso(monthStart);
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(0); // last day of prev month after increment
    return d.toISOString().slice(0, 10);
  }, [monthStart]);

  const prevMonthStart = useMemo(() => {
    const d = parseIso(monthStart);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  }, [monthStart]);

  const [byDate, setByDate] = useState<Record<string, WorkoutSummary>>({});
  const [prevTotalVolume, setPrevTotalVolume] = useState<number | null>(null);
  // Percentile thresholds come from the whole displayed dataset.
  const [thresholds, setThresholds] = useState<{ q1: number; q2: number; q3: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prevEnd = addDays(monthStart, -1);
      try {
        const [thisMo, prev] = await Promise.all([
          authedFetch(`${SUMMARY_FN}?from=${monthStart}&to=${monthEnd}`).then((r) => r.json()),
          authedFetch(`${SUMMARY_FN}?from=${prevMonthStart}&to=${prevEnd}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const map: Record<string, WorkoutSummary> = {};
        (thisMo.workouts as WorkoutSummary[] | undefined)?.forEach((w) => {
          if (!map[w.date] || w.volume > map[w.date].volume) map[w.date] = w;
        });
        setByDate(map);
        const prevVol = (prev.workouts as WorkoutSummary[] | undefined)?.reduce((a, w) => a + w.volume, 0) ?? 0;
        setPrevTotalVolume(prevVol > 0 ? prevVol : null);
        setThresholds(computeThresholds(Object.values(map).map((w) => w.volume)));
      } catch {
        if (!cancelled) {
          setByDate({});
          setPrevTotalVolume(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthStart, monthEnd, prevMonthStart]);

  const grid = useMemo(() => buildMonthGrid(monthStart), [monthStart]);
  const totalVolume = Object.values(byDate).reduce((a, w) => a + w.volume, 0);
  const sessions = Object.values(byDate).filter((w) => w.setsDone > 0).length;

  // Count week rows in the grid so the calendar fills the viewport
  // proportionally (5 vs 6 rows depending on month layout).
  const weekRows = grid.length / 7;

  return (
    <div
      style={{
        padding: "12px 12px 24px",
        display: "flex",
        flexDirection: "column",
        // Subtract sticky chrome (app header 56 + TopNav ~58) so the
        // calendar fills the remaining viewport height.
        minHeight: "calc(100dvh - 114px)",
      }}
    >
      <HealthBadge volume={totalVolume} prevVolume={prevTotalVolume} sessions={sessions} />

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: `auto repeat(${weekRows}, 1fr)`,
          gap: 4,
          flex: 1,
          minHeight: 0,
        }}
      >
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1, padding: "4px 0" }}>
            {d}
          </div>
        ))}
        {grid.map((cell, i) => {
          if (!cell) {
            return <div key={i} />;
          }
          const summary = byDate[cell];
          const scheduled = !!scheduleMap[cell];
          const intensity = summary ? bucket(summary.volume, thresholds) : 0;
          const isToday = cell === today;
          return (
            <button
              key={i}
              onClick={() => onPickDay(cell)}
              disabled={!scheduled && !summary}
              style={{
                background: heatColor(intensity),
                border: isToday ? `2px solid ${C.text}` : `1px solid ${C.border}`,
                borderRadius: 6,
                color: intensity >= 3 ? "#000" : C.text,
                fontSize: 11,
                fontFamily: "monospace",
                cursor: scheduled || summary ? "pointer" : "default",
                padding: 0,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-start",
                position: "relative",
                opacity: !scheduled && !summary ? 0.55 : 1,
                minHeight: 0,
              }}
            >
              <span style={{ position: "absolute", top: 6, left: 7, fontSize: 11, fontWeight: 700 }}>
                {parseInt(cell.slice(-2), 10)}
              </span>
              {summary && summary.setsDone > 0 && (
                <span style={{ position: "absolute", bottom: 6, right: 7, fontSize: 9, opacity: 0.85 }}>
                  {formatVolume(summary.volume)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <HeatmapLegend />
    </div>
  );
}

function buildMonthGrid(monthStartIso: string): (string | null)[] {
  // Returns a 6×7 = 42-cell grid (rows of weeks). Sunday-start.
  const first = parseIso(monthStartIso);
  const firstDow = first.getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${monthStartIso.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ============================================================ */
/* Year view — GitHub-style 7×52 heatmap                        */
/* ============================================================ */

function YearView({
  schedule,
  anchorDate,
  today,
  onPickDay,
}: {
  schedule: Week[];
  anchorDate: string;
  today: string;
  onPickDay: (date: string) => void;
}) {
  const scheduleMap = useMemo(() => buildScheduleMap(schedule), [schedule]);
  const yearStart = startOfYear(anchorDate);
  const year = parseInt(anchorDate.slice(0, 4), 10);
  const yearEnd = `${year}-12-31`;
  const prevYearStart = `${year - 1}-01-01`;
  const prevYearEnd = `${year - 1}-12-31`;

  const [byDate, setByDate] = useState<Record<string, WorkoutSummary>>({});
  const [prevTotalVolume, setPrevTotalVolume] = useState<number | null>(null);
  const [thresholds, setThresholds] = useState<{ q1: number; q2: number; q3: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [thisYr, prevYr] = await Promise.all([
          authedFetch(`${SUMMARY_FN}?from=${yearStart}&to=${yearEnd}`).then((r) => r.json()),
          authedFetch(`${SUMMARY_FN}?from=${prevYearStart}&to=${prevYearEnd}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const map: Record<string, WorkoutSummary> = {};
        (thisYr.workouts as WorkoutSummary[] | undefined)?.forEach((w) => {
          if (!map[w.date] || w.volume > map[w.date].volume) map[w.date] = w;
        });
        setByDate(map);
        const prevVol = (prevYr.workouts as WorkoutSummary[] | undefined)?.reduce((a, w) => a + w.volume, 0) ?? 0;
        setPrevTotalVolume(prevVol > 0 ? prevVol : null);
        setThresholds(computeThresholds(Object.values(map).map((w) => w.volume)));
      } catch {
        if (!cancelled) {
          setByDate({});
          setPrevTotalVolume(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [yearStart, yearEnd, prevYearStart, prevYearEnd]);

  const grid = useMemo(() => buildYearGrid(year), [year]);
  const totalVolume = Object.values(byDate).reduce((a, w) => a + w.volume, 0);
  const sessions = Object.values(byDate).filter((w) => w.setsDone > 0).length;

  const CELL = 12;
  const GAP = 3;

  return (
    <div style={{ padding: "12px 0 32px" }}>
      <div style={{ padding: "0 12px" }}>
        <HealthBadge volume={totalVolume} prevVolume={prevTotalVolume} sessions={sessions} />
      </div>

      <div
        style={{
          marginTop: 14,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "0 12px",
        }}
      >
        <div style={{ display: "inline-block", minWidth: "100%" }}>
          {/* Month labels */}
          <div style={{ display: "flex", marginLeft: 16, marginBottom: 4, gap: GAP }}>
            {grid.monthLabels.map((m, i) => (
              <div
                key={i}
                style={{
                  width: m.cols * (CELL + GAP) - GAP,
                  fontSize: 9,
                  color: C.muted,
                  fontFamily: "monospace",
                  letterSpacing: 1,
                }}
              >
                {m.label}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: GAP }}>
            {/* Weekday labels column */}
            <div style={{ display: "flex", flexDirection: "column", gap: GAP, width: 12 }}>
              {["", "M", "", "W", "", "F", ""].map((l, i) => (
                <div
                  key={i}
                  style={{
                    height: CELL,
                    fontSize: 8,
                    color: C.muted,
                    fontFamily: "monospace",
                    lineHeight: `${CELL}px`,
                  }}
                >
                  {l}
                </div>
              ))}
            </div>

            {/* Week columns */}
            {grid.weeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                {week.map((cell, di) => {
                  if (!cell) {
                    return <div key={di} style={{ width: CELL, height: CELL }} />;
                  }
                  const summary = byDate[cell];
                  const scheduled = !!scheduleMap[cell];
                  const intensity = summary ? bucket(summary.volume, thresholds) : 0;
                  const isToday = cell === today;
                  return (
                    <button
                      key={di}
                      onClick={() => onPickDay(cell)}
                      disabled={!scheduled && !summary}
                      title={`${cell}${summary ? ` · ${formatVolume(summary.volume)} vol` : ""}`}
                      style={{
                        width: CELL,
                        height: CELL,
                        padding: 0,
                        background: heatColor(intensity),
                        border: isToday ? `1.5px solid ${C.text}` : intensity === 0 && !scheduled ? `1px solid ${C.borderSoft}` : "none",
                        borderRadius: 2,
                        cursor: scheduled || summary ? "pointer" : "default",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 12px" }}>
        <HeatmapLegend />
      </div>
    </div>
  );
}

function buildYearGrid(year: number): {
  weeks: (string | null)[][];
  monthLabels: { label: string; cols: number }[];
} {
  const first = new Date(Date.UTC(year, 0, 1));
  const last = new Date(Date.UTC(year, 11, 31));
  const startDow = first.getUTCDay(); // 0=Sun
  const totalDays = Math.floor((last.getTime() - first.getTime()) / 86400000) + 1;
  const cells: (string | null)[] = Array(startDow).fill(null);
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(Date.UTC(year, 0, 1));
    d.setUTCDate(d.getUTCDate() + i);
    cells.push(d.toISOString().slice(0, 10));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  // Chunk into weekly columns (each column has 7 entries Sun..Sat).
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  // Month labels: label appears above the first column of each month.
  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthByCol: number[] = weeks.map((col) => {
    const firstRealDate = col.find((c) => c) ?? null;
    return firstRealDate ? parseInt(firstRealDate.slice(5, 7), 10) - 1 : -1;
  });
  const monthLabels: { label: string; cols: number }[] = [];
  let curMonth = -1;
  let curCols = 0;
  for (const m of monthByCol) {
    if (m !== curMonth) {
      if (curMonth >= 0) monthLabels.push({ label: MONTHS_SHORT[curMonth], cols: curCols });
      curMonth = m;
      curCols = 1;
    } else {
      curCols += 1;
    }
  }
  if (curMonth >= 0) monthLabels.push({ label: MONTHS_SHORT[curMonth], cols: curCols });

  return { weeks, monthLabels };
}

/* ============================================================ */
/* Heatmap intensity                                            */
/* ============================================================ */

function computeThresholds(volumes: number[]): { q1: number; q2: number; q3: number } | null {
  const positive = volumes.filter((v) => v > 0).sort((a, b) => a - b);
  if (positive.length < 2) return null;
  const pick = (p: number) => positive[Math.floor((positive.length - 1) * p)];
  return { q1: pick(0.25), q2: pick(0.5), q3: pick(0.75) };
}

function bucket(volume: number, t: { q1: number; q2: number; q3: number } | null): 0 | 1 | 2 | 3 | 4 {
  if (volume <= 0) return 0;
  if (!t) return 2; // single-sample fallback
  if (volume <= t.q1) return 1;
  if (volume <= t.q2) return 2;
  if (volume <= t.q3) return 3;
  return 4;
}

function heatColor(level: 0 | 1 | 2 | 3 | 4): string {
  if (level === 0) return "var(--heat-0, var(--border-soft))";
  if (level === 1) return "var(--heat-1, color-mix(in srgb, var(--accent) 25%, var(--bg-2)))";
  if (level === 2) return "var(--heat-2, color-mix(in srgb, var(--accent) 50%, var(--bg-2)))";
  if (level === 3) return "var(--heat-3, color-mix(in srgb, var(--accent) 75%, var(--bg-2)))";
  return "var(--heat-4, var(--accent))";
}

function HeatmapLegend() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1, justifyContent: "flex-end" }}>
      <span>LESS</span>
      {[0, 1, 2, 3, 4].map((l) => (
        <div key={l} style={{ width: 10, height: 10, borderRadius: 2, background: heatColor(l as 0 | 1 | 2 | 3 | 4) }} />
      ))}
      <span>MORE</span>
    </div>
  );
}

/* ============================================================ */
/* Shared bits                                                  */
/* ============================================================ */

function sanitizeSignedDecimal(raw: string): string {
  // Allow an optional leading minus, digits, and a single decimal point.
  let s = raw.replace(/[^\d.\-]/g, "");
  // Keep at most one leading minus
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  // Keep only the first decimal point
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return (negative ? "-" : "") + s;
}

/* ============================================================ */
/* Day-type picker (header dropdown)                            */
/* ============================================================ */

// Curated set of templates that make sense as day types. Excludes the
// "activities" entry which is just the source list for the exercise
// picker, not a day type you'd want to pick.
const DAY_TYPE_IDS = ["upper1", "lower1", "upper2", "lower2", "run1", "custom"] as const;

function DayTypePicker({
  program,
  currentDayId,
  label,
  onPick,
}: {
  program: Day[];
  currentDayId: string;
  label: string;
  onPick: (dayId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown as any);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown as any);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options = DAY_TYPE_IDS.map((id) => {
    if (id === "custom") {
      return { id: "custom", name: "Freestyle", subtitle: "PICK YOUR OWN" };
    }
    const d = program.find((p) => p.id === id);
    return d ? { id: d.id, name: d.name, subtitle: d.subtitle } : null;
  }).filter(Boolean) as { id: string; name: string; subtitle: string }[];

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: C.text,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: -0.5,
          textTransform: "uppercase",
          lineHeight: 1,
          fontFamily: "inherit",
        }}
      >
        {label}
        <span
          aria-hidden
          style={{
            fontSize: 12,
            color: C.muted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            lineHeight: 1,
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            minWidth: 240,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 4,
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            zIndex: 60,
          }}
        >
          {options.map((opt) => {
            const active = opt.id === currentDayId;
            return (
              <button
                key={opt.id}
                role="menuitem"
                onClick={() => {
                  onPick(opt.id);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  background: active ? C.doneBg : "transparent",
                  border: "none",
                  borderRadius: 7,
                  color: C.text,
                  cursor: "pointer",
                  textAlign: "left",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase" }}>
                    {opt.name}
                  </div>
                  <div style={{ fontSize: 9, color: C.muted, fontFamily: "monospace", letterSpacing: 1, marginTop: 2 }}>
                    {opt.subtitle}
                  </div>
                </div>
                {active && <span style={{ color: C.accent }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* Add-exercise picker                                          */
/* ============================================================ */

function ExercisePicker({
  open,
  onToggle,
  candidates,
  isInToday,
  onPick,
}: {
  open: boolean;
  onToggle: () => void;
  candidates: Exercise[];
  isInToday: (exId: string) => boolean;
  onPick: (ex: Exercise) => void;
}) {
  return (
    <div style={{ padding: "12px 12px 0", borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "14px 12px",
          background: open ? C.bg2 : "transparent",
          border: `1px dashed ${open ? C.accent : C.mutedLight}`,
          borderRadius: 12,
          color: open ? C.accent : C.text,
          fontSize: 12,
          fontFamily: "monospace",
          letterSpacing: 2,
          textTransform: "uppercase",
          fontWeight: 800,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{open ? "×" : "+"}</span>
        {open ? "Close" : "Add exercise"}
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            background: C.bg2,
            maxHeight: "55vh",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {candidates.map((ex) => {
            const added = isInToday(ex.id);
            return (
              <button
                key={ex.id}
                onClick={() => !added && onPick(ex)}
                disabled={added}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textAlign: "left",
                  padding: "14px 14px",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  background: "transparent",
                  color: added ? C.muted : C.text,
                  cursor: added ? "default" : "pointer",
                  gap: 12,
                  opacity: added ? 0.5 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {ex.name}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", marginTop: 2, letterSpacing: 1 }}>
                    {ex.targetWeight ? `${ex.targetWeight}LB × ` : ""}{ex.targetReps} {ex.targetWeight === null ? "MIN" : "REPS"} · {ex.sets} SETS
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "monospace",
                    letterSpacing: 2,
                    color: added ? C.muted : C.accent,
                    border: `1px solid ${added ? C.border : C.doneBorder}`,
                    background: added ? "transparent" : C.doneBg,
                    padding: "4px 8px",
                    borderRadius: 4,
                    flexShrink: 0,
                  }}
                >
                  {added ? "ADDED" : "ADD"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* iOS-style swipe-to-delete row                                */
/* ============================================================ */

const DELETE_REVEAL_PX = 80;

function SwipeableSetRow({
  children,
  onDelete,
  marginBottom = 7,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  marginBottom?: number;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startOffset = useRef(0);
  const direction = useRef<"h" | "v" | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startOffset.current = offset;
    direction.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (direction.current == null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      direction.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (direction.current === "h") setDragging(true);
    }
    if (direction.current !== "h") return;
    e.stopPropagation();
    const next = Math.max(-DELETE_REVEAL_PX - 24, Math.min(0, startOffset.current + dx));
    setOffset(next);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    startX.current = null;
    startY.current = null;
    if (direction.current === "h") {
      e.stopPropagation();
      setOffset(offset < -DELETE_REVEAL_PX / 2 ? -DELETE_REVEAL_PX : 0);
    }
    direction.current = null;
    setDragging(false);
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", marginBottom }}>
      <button
        type="button"
        onClick={() => {
          onDelete();
          setOffset(0);
        }}
        aria-label="Delete"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: DELETE_REVEAL_PX,
          background: "#ef4444",
          color: "#fff",
          border: "none",
          fontFamily: "monospace",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: "uppercase",
          cursor: "pointer",
          padding: 0,
        }}
      >
        Delete
      </button>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          // Tapping anywhere while revealed closes the swipe.
          if (offset !== 0) setOffset(0);
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          background: C.bg,
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function inputStyle(done: boolean): React.CSSProperties {
  return {
    background: done ? C.doneBg : C.borderSoft,
    border: `1px solid ${done ? C.doneBorder : C.border}`,
    borderRadius: 8,
    color: done ? C.accent : C.text,
    fontSize: 17,
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    padding: "12px 6px",
    textAlign: "center",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
    WebkitAppearance: "none",
    MozAppearance: "textfield",
  };
}

/**
 * Tiny sign-toggle button prepended to the left of each numeric input
 * as an input group. Shows "+" or "−" for the current sign; tap to
 * flip. iOS Safari doesn't expose a minus key on the numeric keypad
 * so the kid types the absolute value with the numpad and toggles
 * the sign here. Styling matches the input chrome so it disappears
 * into the input group — the +/- icon is the only signal.
 */
function signPrependStyle(_isNegative: boolean, done: boolean): React.CSSProperties {
  return {
    width: 20,
    flexShrink: 0,
    border: `1px solid ${done ? C.doneBorder : C.border}`,
    // Thin right edge keeps the +/- visually separate from the input
    // body; without it the button merges into the input fill (which is
    // borderSoft) and the boundary disappears.
    borderRight: `1px solid var(--bg)`,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    background: done ? C.doneBg : C.borderSoft,
    color: done ? C.accent : C.mutedLight,
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    WebkitTapHighlightColor: "transparent",
  };
}
