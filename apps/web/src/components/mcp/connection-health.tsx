"use client";

import { useSyncExternalStore } from "react";

/**
 * A connection's status, kept live.
 *
 * The server renders a health check taken at request time, which is correct for
 * about a second and then quietly ages. A grant revoked at Google, or a refresh
 * token that expired overnight, leaves the page reading "working" until someone
 * thinks to reload — which is exactly when a status light is worth nothing.
 *
 * So the badge re-checks. The store below is module scope rather than per
 * component: every card on the page shares one interval and one request, so
 * adding a fourth account does not mean a fourth round trip to Google every
 * thirty seconds. Polling stops while the tab is hidden and resumes on focus.
 */

export interface Health {
  name: string;
  healthy: boolean;
  error: string | null;
}

const POLL_MS = 30_000;
const TICK_MS = 1_000;

interface Snapshot {
  accounts: Health[] | null;
  checkedAt: number | null;
  /** True once a poll has failed and none has ever succeeded. */
  unreachable: boolean;
  /** Advances every second purely so "12s ago" counts up on its own. */
  tick: number;
}

let snapshot: Snapshot = { accounts: null, checkedAt: null, unreachable: false, tick: 0 };
const listeners = new Set<() => void>();
let timers: ReturnType<typeof setInterval>[] = [];

/** Server render has no live answer yet, so components fall back to props. */
const SERVER_SNAPSHOT: Snapshot = {
  accounts: null,
  checkedAt: null,
  unreachable: false,
  tick: 0,
};

function publish(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

/**
 * @param force run even if the tab is hidden.
 *
 * Skipping while hidden is right for the repeating check and wrong for the
 * first one. A tab can be restored, opened in the background, or simply not
 * focused at the moment it mounts, and refusing to fetch then leaves the badge
 * reading "checking…" with no request ever in flight.
 */
async function poll(force = false) {
  if (!force && typeof document !== "undefined" && document.hidden) return;
  try {
    const res = await fetch("/api/mcp/health", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { checkedAt: string; accounts: Health[] };
    publish({ accounts: data.accounts, checkedAt: Date.parse(data.checkedAt), unreachable: false });
  } catch {
    // A failed poll is not a failed connection. Keep the last good answer
    // rather than flashing every account to broken because the wifi blipped.
    // Only say so when there has never been one, so the badge cannot sit on
    // "checking…" forever while every request quietly fails.
    publish({ unreachable: snapshot.checkedAt === null });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void poll(true);
    timers = [
      setInterval(poll, POLL_MS),
      setInterval(() => publish({ tick: snapshot.tick + 1 }), TICK_MS),
    ];
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      for (const timer of timers) clearInterval(timer);
      timers = [];
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

const onVisible = () => {
  if (!document.hidden) void poll();
};

const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

function ago(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

export function ConnectionHealth({
  name,
  initial,
}: {
  name: string;
  initial: { healthy: boolean; error: string | null };
}) {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const found = live.accounts?.find((a) => a.name === name);
  const healthy = found?.healthy ?? initial.healthy;
  const error = found?.error ?? initial.error;

  // The label re-reads Date.now() on every render, and the store's one-second
  // tick is what causes that render. Before the first poll lands there is no
  // timestamp to count from, so it says so instead of guessing.
  const checked = live.checkedAt ? ago(live.checkedAt, Date.now()) : null;

  return (
    <div className="text-right">
      <p className="flex items-center justify-end gap-2 font-mono text-xs">
        {/*
         * `status-mark` rather than a `bg-*` utility on purpose: the paper
         * treatment strips background-color from anything matching `bg-accent`
         * and friends, because on a sheet a filled panel is not a thing. This
         * mark is ink, so it takes its fill from currentColor instead and the
         * strip rule never matches it.
         */}
        <span
          aria-hidden
          className={`status-mark ${
            healthy ? "text-accent animate-pulse motion-reduce:animate-none" : "text-destructive"
          }`}
        />
        <span className={healthy ? "text-accent" : "text-destructive"}>
          {healthy ? "connected" : "needs reconnect"}
        </span>
      </p>
      <p className="mt-1 font-mono text-[0.6875rem] text-muted-foreground">
        {checked ? `checked ${checked}` : live.unreachable ? "re-check failed" : "checking…"}
      </p>
    </div>
  );
}

/**
 * The reason a connection is unhealthy, in the body of the card.
 *
 * Split from the badge because it is prose and the badge is a right-aligned
 * column two words wide. Reads the same shared store, so it stays in step with
 * the badge without a second request.
 */
export function ConnectionError({
  name,
  initial,
}: {
  name: string;
  initial: { healthy: boolean; error: string | null };
}) {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const found = live.accounts?.find((a) => a.name === name);
  const healthy = found?.healthy ?? initial.healthy;
  const error = found?.error ?? initial.error;

  if (healthy || !error) return null;
  return <p className="mt-4 text-xs text-destructive">{error}</p>;
}
