"use client";

import { useEffect, useState } from "react";
import type { Day, Exercise } from "@/app/program";
import type { Week } from "@/app/week-schedule";
import { workoutId } from "@/app/week-schedule";

/**
 * Embed-only week view. Design system ported from app/globals.css +
 * theme.tsx: --bg / --bg-2 / --border / --text / --muted / --accent
 * variables driven by [data-theme] and [data-accent] on <html>.
 *
 * No auth, no writes. Read-only summary of the current (or nearest)
 * scheduled week. Pulse-check + quote are ephemeral client-side.
 */

type Props = {
  program: Day[];
  week: Week | null;
  todayIso: string;
  loggedIds: Set<string>;
};

const QUOTES: { t: string; c: string }[] = [
  { t: "Strong people are harder to kill than weak people, and more useful in general.", c: "Mark Rippetoe" },
  { t: "You have power over your mind, not outside events. Realize this, and you will find strength.", c: "Marcus Aurelius" },
  { t: "It never gets easier, you just get better.", c: "Anonymous" },
  { t: "Discipline equals freedom.", c: "Jocko Willink" },
  { t: "Everybody wants to be a bodybuilder, but nobody wants to lift no heavy-ass weights.", c: "Ronnie Coleman" },
  { t: "Suffer the pain of discipline or suffer the pain of regret.", c: "Jim Rohn" },
  { t: "The successful warrior is the average man, with laser-like focus.", c: "Bruce Lee" },
];

const PULSE_ACK: Record<number, string> = {
  1: "Wrecked. Warm up, then decide. Skip if the bar feels wrong.",
  2: "Meh. Trim volume. 3 working sets. Honest weights.",
  3: "Steady. Hit your targets. Don't chase PRs.",
  4: "Good. Push the top set if it feels crisp.",
  5: "Locked. Go for the PR. Log exact reps.",
};

export default function EmbedWeekClient({ program, week, todayIso, loggedIds }: Props) {
  const [pulse, setPulse] = useState<number | null>(null);
  const [quote, setQuote] = useState<{ t: string; c: string }>(QUOTES[0]);

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  const dayById = new Map(program.map((d) => [d.id, d]));
  const daysCount = week?.days.length ?? 0;
  const doneCount = week?.days.filter((d) => loggedIds.has(workoutId(d.date, d.dayId))).length ?? 0;
  const pct = daysCount === 0 ? 0 : Math.round((doneCount / daysCount) * 100);

  return (
    <div className="wrap">
      <header className="app">
        <div className="menu-btn" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </div>
        <div className="brand">Workout</div>
        <div className="avatar" aria-label="Embedded view">
          AD
        </div>
      </header>

      <section className="week-head">
        <div>
          <div className="eyebrow">{week ? weekLabelSubtitle(week) : "No week scheduled"}</div>
          <h1 className="title">{week ? weekTitle(week.startDate) : "Nothing yet"}</h1>
        </div>
        <div className="count">
          <span>{doneCount}</span>
          <span className="of">/{daysCount}</span>
          <span className="lbl">Logged</span>
        </div>
      </section>

      <div className="progress" aria-hidden>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      {week && (
        <section aria-label="Days this week">
          {week.days.map((wd) => {
            const day = dayById.get(wd.dayId);
            if (!day) return null;
            const id = workoutId(wd.date, wd.dayId);
            const state = statusFor(wd.date, todayIso, loggedIds.has(id));
            return <DayCard key={id} day={day} dateIso={wd.date} state={state} />;
          })}
        </section>
      )}

      <section className="pulse" aria-label="Pulse check">
        <div className="lbl">Pulse Check</div>
        <div className="pulse-row" role="radiogroup" aria-label="Pulse level">
          {[
            { v: 1, g: "◔", n: "Wrecked" },
            { v: 2, g: "◑", n: "Meh" },
            { v: 3, g: "●", n: "Steady" },
            { v: 4, g: "◕", n: "Good" },
            { v: 5, g: "○", n: "Locked" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              className={"pulse-btn" + (pulse === o.v ? " selected" : "")}
              onClick={() => setPulse(o.v)}
              aria-checked={pulse === o.v}
              role="radio"
            >
              <span className="glyph" aria-hidden>{o.g}</span>
              {o.n}
            </button>
          ))}
        </div>
        <p className="pulse-ack" aria-live="polite">
          {pulse ? PULSE_ACK[pulse] : " "}
        </p>
      </section>

      <aside className="quote">
        <p>&ldquo;{quote.t}&rdquo;</p>
        <cite>{quote.c}</cite>
      </aside>

      <style jsx>{`
        .wrap {
          padding: 0 12px 48px;
          max-width: 460px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          font-size: 14px;
          line-height: 1.4;
        }
        .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }

        header.app {
          display: grid;
          grid-template-columns: 44px 1fr 44px;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
          position: sticky;
          top: 0;
          z-index: 40;
          margin: 0 -12px 20px;
        }
        header.app .brand {
          justify-self: center;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--text);
        }
        header.app .menu-btn {
          width: 36px; height: 36px;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          display: flex; align-items: center; justify-content: center;
          opacity: 0.6;
        }
        header.app .avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: var(--accent);
          color: #000;
          display: flex; align-items: center; justify-content: center;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 1px;
          justify-self: end;
        }

        .week-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 4px 0 18px;
        }
        .eyebrow {
          font-size: 9px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          letter-spacing: 2px;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .title {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text);
          margin: 0;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
        }
        .count {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 22px;
          font-weight: 900;
          color: var(--text);
          white-space: nowrap;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .count .of { color: var(--muted); font-size: 12px; margin-left: 2px; }
        .count .lbl {
          display: block;
          font-size: 9px;
          letter-spacing: 2px;
          color: var(--muted);
          text-transform: uppercase;
          margin-top: 2px;
        }

        .progress {
          height: 3px;
          background: var(--border);
          border-radius: 2px;
          margin-bottom: 22px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 2px;
          transition: width 0.4s ease;
        }

        .pulse {
          margin-top: 24px;
          padding: 16px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .pulse .lbl {
          font-size: 9px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          letter-spacing: 2px;
          color: var(--muted);
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .pulse-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
        }
        .pulse-btn {
          background: transparent;
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 8px 4px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.14s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          line-height: 1;
        }
        .pulse-btn .glyph {
          font-size: 16px;
          font-weight: 400;
          letter-spacing: 0;
          color: var(--muted-light);
          line-height: 1;
        }
        .pulse-btn:hover { border-color: var(--muted-light); }
        .pulse-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .pulse-btn.selected {
          background: var(--accent);
          border-color: var(--accent);
          color: #000;
        }
        .pulse-btn.selected .glyph { color: #000; }
        .pulse-ack {
          margin-top: 12px;
          font-size: 12px;
          color: var(--muted-light);
          min-height: 16px;
          text-align: center;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          letter-spacing: 0.4px;
        }

        .quote {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
          text-align: center;
        }
        .quote p {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 12px;
          line-height: 1.55;
          color: var(--text);
          margin: 0 auto 10px;
          max-width: 42ch;
          letter-spacing: 0.3px;
        }
        .quote cite {
          font-style: normal;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 9px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 900;
        }

        @media (prefers-reduced-motion: reduce) {
          .pulse-btn, .progress-fill { transition: none !important; }
        }
      `}</style>
    </div>
  );
}

function DayCard({ day, dateIso, state }: { day: Day; dateIso: string; state: DayState }) {
  const label = shortDate(dateIso) + (state === "today" ? " · Today" : "");
  return (
    <>
      <article className={"day " + state}>
        <div className="day-head">
          <div>
            <div className="date">{label}</div>
            <div className="template">{day.name} · {day.subtitle}</div>
          </div>
          <span className={"status " + state}>{statusLabel(state)}</span>
        </div>
        <ul className="ex-list">
          {day.exercises.filter((e) => e.id !== "cardio_warmup" && e.id !== "core").map((ex) => (
            <li key={ex.id} className="ex">
              <span className="name">{ex.name}</span>
              <span className="target">{targetLabel(ex)}</span>
            </li>
          ))}
        </ul>
      </article>
      <style jsx>{`
        .day {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 8px;
        }
        .day.done {
          background: var(--done-bg);
          border-color: var(--done-border);
        }
        .day.today {
          border-color: var(--accent);
        }
        .day.missed { opacity: 0.55; }
        .day-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .day-head .date {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--text);
        }
        .day-head .template {
          color: var(--muted-light);
          font-size: 11px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .status {
          display: inline-flex;
          align-items: center;
          padding: 3px 7px;
          border-radius: 3px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 2px;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .status.done { color: var(--accent); background: var(--done-bg); border: 1px solid var(--done-border); }
        .status.today { color: #000; background: var(--accent); border: 1px solid var(--accent); }
        .status.upcoming { color: var(--muted); background: transparent; border: 1px solid var(--border); }
        .status.missed { color: var(--muted); background: transparent; border: 1px dashed var(--border); }
        .ex-list { list-style: none; padding: 0; margin: 0; }
        .ex {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          padding: 5px 0;
          border-top: 1px solid var(--border-soft);
          font-size: 13px;
        }
        .ex:first-child { border-top: none; padding-top: 2px; }
        .ex .name { color: var(--text); }
        .ex .target {
          color: var(--muted-light);
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 11.5px;
          letter-spacing: 0.4px;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </>
  );
}

type DayState = "done" | "today" | "upcoming" | "missed";

function statusFor(dateIso: string, todayIso: string, done: boolean): DayState {
  if (done) return "done";
  if (dateIso === todayIso) return "today";
  if (dateIso < todayIso) return "missed";
  return "upcoming";
}

function statusLabel(s: DayState): string {
  return { done: "Done", today: "Today", upcoming: "Upcoming", missed: "Missed" }[s];
}

function targetLabel(ex: Exercise): string {
  const setsReps = `${ex.sets} × ${ex.targetReps}`;
  if (ex.targetWeight == null) return setsReps;
  if (ex.targetWeight === 0) return setsReps;
  return `${setsReps} @ ${ex.targetWeight}`;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function weekTitle(startIso: string): string {
  const d = new Date(`${startIso}T12:00:00Z`);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Week of ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function weekLabelSubtitle(week: Week): string {
  return `${week.label} · Program week ${week.programWeek}`;
}
