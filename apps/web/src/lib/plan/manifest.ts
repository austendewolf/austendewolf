import { listContent } from "@/lib/content";
import { resume } from "@/lib/resume";

/**
 * The site plan, assembled from what the site already knows.
 *
 * Nothing here is authored twice, and nothing here is invented. Employment
 * comes from the resume, everything else from the content that already exists,
 * so the drawing cannot drift from the pages it indexes.
 *
 * The word "entity" is doing real work: one company is one node however many
 * titles it held, and one project is one node whether its dates come from its
 * own frontmatter, from the resume's founded list, or from both. Reading two
 * sources without reconciling them is what put Flatly and Retold on the sheet
 * twice.
 *
 * Position is derived, not stored. `x` is the date; the lane is solved by the
 * layout, so nothing needs hand-placing.
 */

/**
 * One kind of thing.
 *
 * A job and a launch are the same object here: a node, with a box, a label and
 * a leader down to the datum. The only difference is that some of them also
 * occupy a stretch of time, and that stretch is drawn on the datum itself
 * rather than as a second species of shape floating in the drawing.
 *
 * Modelling duration as a different creature is what produced bars that had to
 * be sliced apart wherever a leader crossed them. Nothing crosses anything now,
 * because extents live below the line and leaders stop at it.
 */
export interface PlanNode {
  id: string;
  kind: "role" | "project" | "post";
  label: string;
  detail?: string;
  dates: string;
  note?: string;
  href?: string;

  /*
   * Every node occupies a range. A thing that happened on one day is a range
   * of zero length rather than a different shape, which is what lets one rule
   * decide lanes for all of them: nodes whose ranges overlap cannot share a
   * lane. Optional `from`/`to` would have meant two cases at every call site
   * and a quiet third case where only one was set.
   */
  from: number;
  to: number;
  /** Midpoint of the range, and where this node's leader meets the datum. */
  anchor: number;
  /** No end date yet, so the extent is drawn open. */
  ongoing: boolean;
}


export interface Plan {
  nodes: PlanNode[];
  /** Inclusive decimal-year bounds of the datum. */
  from: number;
  to: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jul 2023" | "2014" | "Present" → a decimal year. */
function parsePoint(text: string, now: number): number | null {
  const value = text.trim();
  if (/^present$/i.test(value)) return now;

  const monthYear = value.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (monthYear) {
    const month = MONTHS.indexOf(monthYear[1]);
    if (month >= 0) return Number(monthYear[2]) + month / 12;
  }

  const year = value.match(/^(\d{4})$/);
  return year ? Number(year[1]) : null;
}

/**
 * "Jan 2020 – Feb 2023" → both ends.
 *
 * Split on a dash with space either side. The resume uses an en dash and some
 * entries contain hyphens inside their words, so a bare `-` would cut in the
 * wrong place.
 */
function parseSpan(dates: string, now: number) {
  const [rawStart, rawEnd] = dates.split(/\s+[–—-]\s+/);
  if (!rawStart || !rawEnd) return null;

  const start = parsePoint(rawStart, now);
  const end = parsePoint(rawEnd, now);
  if (start === null || end === null) return null;

  return { start, end, ongoing: /^present$/i.test(rawEnd.trim()) };
}

/** ISO date from frontmatter → a decimal year. */
function parseISO(date: string): number | null {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Number(match[1]) + (Number(match[2]) - 1) / 12 + Number(match[3]) / 365;
}

/**
 * Greedy interval packing: first lane whose last bar has already ended.
 *
 * Vertical position carries no meaning here, so the only job is to stop bars
 * overlapping. Sorting by start makes the result deterministic, which matters
 * because this runs at build time and the drawing should not reshuffle between
 * deploys.
 */
function packSpans<T extends { start: number; end: number }>(items: T[]) {
  const laneEnds: number[] = [];

  return [...items]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      return { ...item, lane };
    });
}

/**
 * The same packing for moments, but the collision is the label's box rather
 * than the event, since a moment has no width of its own.
 */
function packMoments<T extends { at: number }>(items: T[], widthInYears: number) {
  const laneEnds: number[] = [];

  return [...items]
    .sort((a, b) => a.at - b.at)
    .map((item) => {
      const left = item.at - widthInYears / 2;
      const right = item.at + widthInYears / 2;

      let lane = laneEnds.findIndex((end) => end <= left);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(right);
      } else {
        laneEnds[lane] = right;
      }
      return { ...item, lane };
    });
}

/** Merged spans no longer have a written date range, so one is derived. */
function formatYears(start: number, end: number, ongoing: boolean): string {
  const year = (v: number) => Math.floor(v);
  return `${year(start)} – ${ongoing ? "Present" : year(end)}`;
}

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * @param labelWidthInYears how much datum a moment's label covers, which the
 *   renderer knows and this does not. Passed in so packing matches the drawing.
 */
export async function buildPlan(labelWidthInYears = 1.9): Promise<Plan> {
  const now = new Date().getFullYear() + new Date().getMonth() / 12;

  /**
   * One bar per company, not per title.
   *
   * Two roles at the same employer are one continuous stretch of time on a
   * drawing; splitting them produced adjacent bars that had to be packed into
   * separate lanes to keep their labels apart, so the same company appeared
   * twice, stacked, as though they were unrelated. Promotions are detail that
   * belongs inside the bar, not a reason to draw a second one.
   */
  const byCompany = new Map<string, { titles: string[]; start: number; end: number; ongoing: boolean; location: string }>();

  for (const role of resume.experience) {
    const span = parseSpan(role.dates, now);
    if (!span) continue;

    const existing = byCompany.get(role.company);
    if (existing) {
      existing.start = Math.min(existing.start, span.start);
      existing.end = Math.max(existing.end, span.end);
      existing.ongoing = existing.ongoing || span.ongoing;
      existing.titles.push(role.title);
    } else {
      byCompany.set(role.company, {
        titles: [role.title],
        location: role.location,
        ...span,
      });
    }
  }

  /** A node that occupies time is anchored at the middle of what it occupies. */
  const midpoint = (from: number, to: number) => (from + to) / 2;

  const roles: PlanNode[] = [...byCompany].map(([company, held]) => ({
    id: `role-${slug(company)}`,
    kind: "role",
    label: company,
    // resume order is newest first, so the first title is the one held last.
    detail: held.titles[0],
    dates: formatYears(held.start, held.end, held.ongoing),
    note:
      held.titles.length > 1
        ? `${held.titles.length} roles · ${[...held.titles].reverse().join(" → ")}`
        : held.location,
    anchor: midpoint(held.start, held.end),
    from: held.start,
    to: held.end,
    ongoing: held.ongoing,
  }));

  const [projects, posts] = await Promise.all([
    listContent("projects"),
    listContent("posts"),
  ]);

  const moments: PlanNode[] = [
    ...projects.flatMap((item) => {
      const at = item.frontmatter.date ? parseISO(item.frontmatter.date) : null;
      if (at === null) return [];
      return [{
        id: `project-${item.slug}`,
        kind: "project" as const,
        label: item.frontmatter.title,
        detail: item.frontmatter.tags?.join(" · "),
        // A publish date is a range of zero length.
        from: at,
        to: at,
        anchor: at,
        ongoing: false,
        href: item.frontmatter.link ?? `/projects/${item.slug}`,
        dates: item.frontmatter.date!.slice(0, 10),
        note: item.frontmatter.description,
      }];
    }),
    ...posts.flatMap((item) => {
      const at = item.frontmatter.date ? parseISO(item.frontmatter.date) : null;
      if (at === null) return [];
      return [{
        id: `post-${item.slug}`,
        kind: "post" as const,
        label: item.frontmatter.title,
        detail: item.frontmatter.tags?.join(" · "),
        from: at,
        to: at,
        anchor: at,
        ongoing: false,
        href: `/blog/${item.slug}`,
        dates: item.frontmatter.date!.slice(0, 10),
        note: item.frontmatter.description,
      }];
    }),
  ];

  /*
   * A founded company and its project page are the same thing.
   *
   * The resume lists Flatly and Retold under `founded`, and both also have a
   * project in `content/projects`. Reading the two sources independently put
   * each of them on the drawing twice — once as itself and once as a separate
   * object I had invented to hold the date range. There is no such object.
   * There is a project, and some projects ran for a while.
   *
   * So the founding dates are merged onto the project they belong to, and only
   * a founded entry with no page of its own becomes a node in its own right.
   */
  for (const venture of resume.founded) {
    const span = parseSpan(venture.dates, now);
    if (!span) continue;

    const existing = moments.find((m) => m.id === `project-${slug(venture.name)}`);
    if (existing) {
      existing.from = span.start;
      existing.to = span.end;
      existing.ongoing = span.ongoing;
      // Duration outranks a single publish date for placing it on the datum.
      existing.anchor = midpoint(span.start, span.end);
      existing.dates = venture.dates;
      existing.note = venture.description;
    } else {
      moments.push({
        id: `project-${slug(venture.name)}`,
        kind: "project",
        label: venture.name,
        dates: venture.dates,
        note: venture.description,
        anchor: midpoint(span.start, span.end),
        from: span.start,
        to: span.end,
        ongoing: span.ongoing,
      });
    }
  }

  const nodes = [...roles, ...moments].sort((a, b) => a.anchor - b.anchor);

  // Whole years either side, so ticks land on round numbers rather than
  // wherever the earliest job happened to start.
  const points = nodes.flatMap((n) => [n.from ?? n.anchor, n.to ?? n.anchor]);

  return {
    nodes,
    from: Math.floor(Math.min(...points)),
    to: Math.ceil(Math.max(...points)),
  };
}
